"""WeiGuo-to-dedicated-Linux PdfCraft dispatcher (opt-in, HTTPS and HMAC only).

User-supplied URLs, tool arguments and private file paths are never accepted.
An unreachable remote host never falls back to an unconfined local subprocess.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import os
from urllib.parse import urlsplit

import httpx

from pdfcraft_engine import (
    PdfCraftUnavailable, PdfCraftFailed, _decode_pdf,
    MAX_OUTPUT, combine_pdfs as local_combine,
)
from pdfcraft_wire import READY_PATH, COMBINE_PATH, WireDenied, sign_request, worker_key

TIMEOUT = httpx.Timeout(connect=4.0, read=210.0, write=30.0, pool=3.0)


def remote_requested() -> bool:
    return os.environ.get("WEIGUO_PDFCRAFT_REMOTE_ENABLED") == "true"


def remote_origin() -> str | None:
    """An operator-controlled fixed public HTTPS origin, not a per-task URL."""
    if not remote_requested():
        return None
    raw = os.environ.get("WEIGUO_PDFCRAFT_WORKER_URL", "").strip()
    try:
        parts = urlsplit(raw)
        if (parts.scheme != "https" or not parts.hostname or parts.username or parts.password
                or parts.path not in ("", "/") or parts.query or parts.fragment
                or parts.port not in (None, 443)
                or raw.rstrip("/") != "https://" + parts.hostname + (":443" if parts.port == 443 else "")):
            return None
        # Hostnames only; explicitly reject IP literals and loopback/mDNS.
        if parts.hostname in ("localhost",) or parts.hostname.endswith((".local", ".internal")):
            return None
        try:
            ipaddress.ip_address(parts.hostname)
            return None
        except ValueError:
            pass
        worker_key()
        return raw.rstrip("/")
    except (ValueError, WireDenied):
        return None


async def remote_ready() -> bool:
    origin = remote_origin()
    if not origin:
        return False
    try:
        headers = sign_request("GET", READY_PATH)
        async with httpx.AsyncClient(
            trust_env=False, follow_redirects=False,
            timeout=httpx.Timeout(3.0),
        ) as client:
            response = await client.get(origin + READY_PATH, headers=headers)
        if response.status_code != 200 or len(response.content) > 2048:
            return False
        info = response.json()
        return (isinstance(info, dict) and info.get("service") == "pdfcraft-worker"
                and info.get("schemaVersion") == 1
                and info.get("ready") is True
                and info.get("operation") == "combine-pdf")
    except (httpx.HTTPError, ValueError, WireDenied, KeyError):
        return False


async def combine_pdfs(encoded_pdfs: list[str]) -> bytes:
    if not remote_requested():
        return await local_combine(encoded_pdfs)
    origin = remote_origin()
    if not origin:
        raise PdfCraftUnavailable("獨立 PdfCraft 工作節點尚未安全配置")
    if not isinstance(encoded_pdfs, list) or not 2 <= len(encoded_pdfs) <= 3:
        raise ValueError("一次只能合併 2–3 份 PDF")
    for item in encoded_pdfs:
        _decode_pdf(item)
    body = json.dumps({"files": encoded_pdfs}, ensure_ascii=True, separators=(",", ":")).encode()
    headers = sign_request("POST", COMBINE_PATH, body)
    headers["Content-Type"] = "application/json"
    output = bytearray()
    try:
        async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=TIMEOUT) as client:
            async with client.stream("POST", origin + COMBINE_PATH, headers=headers, content=body) as response:
                if response.status_code == 503:
                    raise PdfCraftUnavailable("獨立 PdfCraft 節點尚不可用")
                if response.status_code != 200:
                    raise PdfCraftFailed("獨立 PdfCraft 節點拒絕操作")
                if response.headers.get("Content-Type", "").split(";")[0].lower() != "application/pdf":
                    raise PdfCraftFailed("PdfCraft 回傳內容類型不正確")
                if int(response.headers.get("Content-Length") or "0") > MAX_OUTPUT:
                    raise PdfCraftFailed("PdfCraft 輸出超出大小限制")
                async for piece in response.aiter_bytes():
                    output.extend(piece)
                    if len(output) > MAX_OUTPUT:
                        raise PdfCraftFailed("PdfCraft 輸出超出大小限制")
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:
        raise PdfCraftUnavailable("獨立 PdfCraft 節點連線失敗") from exc
    result = bytes(output)
    if not (32 <= len(result) <= MAX_OUTPUT and result.startswith(b"%PDF-")
            and b"%%EOF" in result[-2048:]):
        raise PdfCraftFailed("遠端 PDF 格式驗證失敗")
    return result
