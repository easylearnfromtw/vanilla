"""Telegram WebApp for submitting provider credentials over HTTPS, never in chat."""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from urllib.parse import parse_qsl
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from ceres_gateway import _session
from ceres_admin_bot import owner_subject
from ceres_admin_policy import store_provider_key, provider_status

router=APIRouter(prefix="/v1/ceres/admin", tags=["ceres-admin"])
_PAGE="""<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ceres · 安全 API 設定</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style nonce="__NONCE__">
*{box-sizing:border-box}body{background:var(--tg-theme-bg-color,#12151a);color:var(--tg-theme-text-color,#f7f7f7);font:16px system-ui,sans-serif;margin:0;padding:24px;max-width:560px}
h1{font-size:1.4rem}p{line-height:1.6;opacity:.85}label{display:block;margin:20px 0 7px;font-weight:600}
input,select,button{font:inherit;width:100%;padding:13px;border-radius:10px;border:1px solid #777}
input,select{background:var(--tg-theme-secondary-bg-color,#252b35);color:inherit}
button{margin-top:25px;background:var(--tg-theme-button-color,#4089df);color:var(--tg-theme-button-text-color,#fff);border:0;font-weight:700}
small{display:block;margin-top:10px;line-height:1.5}#result{min-height:2em;margin-top:20px}
</style></head><body><h1>🔐 Ceres · 憑證保管庫</h1>
<p>僅供已綁定的擁有者。這裡送出的金鑰以 HTTPS 傳送到衞國後端並加密儲存；不會傳入 Telegram 對話。</p>
<form id="form"><label for="provider">服務供應商</label><select id="provider">
<option value="gemini">Gemini API</option><option value="canva">Canva OAuth Access Token</option>
<option value="deepseek">DeepSeek API</option><option value="openai">OpenAI API</option></select>
<label for="secret">API Key / OAuth Token</label>
<input id="secret" type="password" minlength="20" maxlength="4096" autocomplete="off" required placeholder="在此安全輸入金鑰">
<small>Canva 短期 Access Token 可能過期；正式使用建議完成 OAuth 授權及 Refresh Token 流程。管理員仍需擁有服務供應商的有效授權。</small>
<button id="save" type="submit">安全儲存並啟用</button></form><div id="result" role="status"></div>
<script nonce="__NONCE__">
const tg=window.Telegram?.WebApp;
tg?.ready();tg?.expand();
const form=document.getElementById("form"),result=document.getElementById("result");
form.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!tg?.initData){result.textContent="請由 Ceres Telegram Bot 內的安全按鈕開啟";return;}
 const button=document.getElementById("save"),field=document.getElementById("secret");
 button.disabled=true;result.textContent="正在安全儲存…";
 try{
  const response=await fetch("/v1/ceres/admin/vault",{method:"POST",
   credentials:"omit",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({init_data:tg.initData,provider:document.getElementById("provider").value,secret:field.value})});
  field.value="";
  result.textContent=response.ok?"已加密儲存。可以返回 Telegram 管理中心。":"授權失敗或儲存失敗；請重新透過 Bot 開啟設定頁。";
 }catch{field.value="";result.textContent="無法聯繫安全後端。";}
 button.disabled=false;
});
</script></body></html>"""

def _verify(init_data: str) -> int:
    if not isinstance(init_data,str) or not 20<len(init_data)<8192:
        raise HTTPException(401,"Telegram WebApp authorization required")
    pairs=parse_qsl(init_data,keep_blank_values=True,strict_parsing=True,max_num_fields=35)
    fields=dict(pairs)
    if len(fields)!=len(pairs) or "hash" not in fields:
        raise HTTPException(401,"Invalid Telegram signature")
    token=os.getenv("CERES_TELEGRAM_BOT_TOKEN","")
    if not re.fullmatch(r"[0-9]{5,15}:[A-Za-z0-9_-]{30,80}",token):
        raise HTTPException(503,"Telegram bot is not configured")
    expected=hmac.new(hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest(),
                      "\n".join(k+"="+v for k,v in sorted(fields.items()) if k!="hash").encode(),
                      hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,fields["hash"]):
        raise HTTPException(401,"Invalid Telegram signature")
    try:
        stamp=int(fields["auth_date"])
        user=json.loads(fields["user"])
        chat=int(user["id"])
    except (ValueError,TypeError,KeyError):
        raise HTTPException(401,"Invalid Telegram identity") from None
    if stamp>int(time.time())+30 or int(time.time())-stamp>300 or chat<=0:
        raise HTTPException(401,"Telegram authorization expired")
    if not owner_subject(chat):
        raise HTTPException(403,"Owner-only operation")
    return chat

@router.get("/webapp",response_class=HTMLResponse)
async def webapp():
    nonce=secrets.token_urlsafe(18)
    response=HTMLResponse(_PAGE.replace("__NONCE__",nonce))
    response.headers["Cache-Control"]="no-store, private"
    response.headers["X-Content-Type-Options"]="nosniff"
    response.headers["Referrer-Policy"]="no-referrer"
    response.headers["X-Frame-Options"]="DENY"
    response.headers["Content-Security-Policy"]=(
        "default-src 'none'; script-src 'nonce-"+nonce+"' https://telegram.org; "
        "style-src 'nonce-"+nonce+"'; connect-src 'self'; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    return response

class VaultRequest(BaseModel):
    init_data: str=Field(min_length=20,max_length=8192)
    provider: str=Field(min_length=3,max_length=30)
    secret: str=Field(min_length=20,max_length=4096)

@router.post("/vault")
async def vault(request: VaultRequest):
    chat=_verify(request.init_data)
    with _session() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_vault_rate(
          chat_id INTEGER NOT NULL, created_at INTEGER NOT NULL)""")
        db.execute("BEGIN IMMEDIATE")
        now=int(time.time())
        db.execute("DELETE FROM ceres_admin_vault_rate WHERE created_at<?",(now-3600,))
        count=db.execute("SELECT COUNT(*) FROM ceres_admin_vault_rate WHERE chat_id=? AND created_at>=?",
                         (chat,now-60)).fetchone()[0]
        if count>=4:
            raise HTTPException(429,"Too many updates")
        db.execute("INSERT INTO ceres_admin_vault_rate VALUES(?,?)",(chat,now))
    store_provider_key(request.provider,request.secret,chat)
    return {"ok":True,"provider":request.provider,"secretReturned":False}
