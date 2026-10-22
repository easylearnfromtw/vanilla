"""Explicit local-only worker transport; never relax the remote HTTPS validator."""
from __future__ import annotations
import asyncio
import json
import os
import httpx
from pdfcraft_engine import PdfCraftUnavailable,PdfCraftFailed,_decode_pdf,MAX_OUTPUT
from pdfcraft_wire import worker_key,sign_request,WireDenied,READY_PATH,COMBINE_PATH

ORIGIN='http://pdf-broker:9090'
TIMEOUT=httpx.Timeout(connect=3,read=90,write=10,pool=3)

def local_worker_requested() -> bool:
    return os.environ.get('WEIGUO_PDFCRAFT_LOCAL_WORKER_ENABLED')=='true'

def _configured() -> bool:
    if not local_worker_requested() or os.environ.get('WEIGUO_PDFCRAFT_REMOTE_ENABLED')=='true':return False
    try:worker_key();return True
    except WireDenied:return False

async def local_worker_ready() -> bool:
    if not _configured():return False
    try:
        async with asyncio.timeout(5):
            async with httpx.AsyncClient(trust_env=False,follow_redirects=False,timeout=httpx.Timeout(3)) as client:
                response=await client.get(ORIGIN+READY_PATH,headers=sign_request('GET',READY_PATH))
        if response.status_code!=200 or len(response.content)>2048:return False
        info=response.json()
        return (isinstance(info,dict) and info.get('service')=='pdfcraft-worker' and info.get('schemaVersion')==1
            and info.get('ready') is True and info.get('operation')=='combine-pdf')
    except (httpx.HTTPError,ValueError,TimeoutError):return False

async def local_worker_combine(encoded_pdfs: list[str]) -> bytes:
    if not _configured():raise PdfCraftUnavailable('本機 PDF 工作節點未啟用、安全設定不足或與遠端設定衝突。')
    if not isinstance(encoded_pdfs,list) or len(encoded_pdfs) not in (2,3):raise ValueError('一次只接受 2–3 份 PDF。')
    for encoded in encoded_pdfs:_decode_pdf(encoded)
    body=json.dumps({'files':encoded_pdfs},ensure_ascii=True,separators=(',',':')).encode()
    headers=sign_request('POST',COMBINE_PATH,body);headers['Content-Type']='application/json'
    output=bytearray()
    try:
        async with asyncio.timeout(95):
            async with httpx.AsyncClient(trust_env=False,follow_redirects=False,timeout=TIMEOUT) as client:
                async with client.stream('POST',ORIGIN+COMBINE_PATH,headers=headers,content=body) as response:
                    if response.status_code==503:raise PdfCraftUnavailable('本機 PDF 工作節點尚未通過隔離驗證。')
                    if response.status_code!=200:raise PdfCraftFailed('本機 PDF 工作節點拒絕操作。')
                    if response.headers.get('Content-Type','').split(';')[0].lower()!='application/pdf':raise PdfCraftFailed('本機 PDF 回傳格式錯誤。')
                    length=response.headers.get('Content-Length')
                    if length is not None and (not length.isdigit() or int(length)>MAX_OUTPUT):raise PdfCraftFailed('本機 PDF 輸出大小不正確。')
                    async for piece in response.aiter_bytes():
                        output.extend(piece)
                        if len(output)>MAX_OUTPUT:raise PdfCraftFailed('本機 PDF 輸出過大。')
    except (httpx.HTTPError,TimeoutError):raise PdfCraftUnavailable('本機 PDF 連線失敗；未使用其他服務重試。') from None
    result=bytes(output)
    if not (32<=len(result)<=MAX_OUTPUT and result.startswith(b'%PDF-') and b'%%EOF' in result[-2048:]):
        raise PdfCraftFailed('本機 PDF 內容未通過驗證。')
    return result
