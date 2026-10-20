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
from ceres_model_catalog import clear_catalog, discover

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
<button id="save" type="submit">安全儲存並自動偵測</button></form><div id="result" role="status"></div>
<section id="model-panel"><h2>AI 模型選擇</h2>
<p>儲存後預設自動查詢此 API 可見的模型；Canva 是設計服務，沒有 AI 模型清單。</p>
<button type="button" id="refresh">重新偵測模型</button>
<label for="mode">選擇策略</label><select id="mode">
<option value="balanced">均衡（預設）</option>
<option value="speed">速度優先</option>
<option value="quality">品質優先</option>
<option value="manual">手動指定</option>
</select>
<label for="model">模型版本（僅手動模式需要）</label>
<select id="model"></select>
<button type="button" id="apply">套用選擇</button>
<p id="models-result" role="status"></p>
<small>官方清單表示 API 金鑰可見該模型，但無法保證立即可呼叫、可用額度或實際費率；自動排序是啟發式推薦，不等於確定最強或最便宜。私人模式不使用雲端模型。</small>
</section>
<script nonce="__NONCE__">
const tg=window.Telegram?.WebApp;
tg?.ready();tg?.expand();
const providerField=document.getElementById("provider");
const form=document.getElementById("form"),result=document.getElementById("result");
const modelBox=document.getElementById("model-panel"),modeField=document.getElementById("mode");
const modelField=document.getElementById("model"),modelResult=document.getElementById("models-result");
let lastInfo=null;
async function api(path,body){
 if(!tg?.initData)throw Error("請從 Ceres Telegram 的安全按鈕開啟設定頁");
 const response=await fetch("/v1/ceres/admin/"+path,{method:"POST",
   credentials:"omit",cache:"no-store",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(Object.assign({init_data:tg.initData},body))});
 if(!response.ok)throw Error(response.status===401?"登入已過期，請重新打開安全表單":
   response.status===429?"操作過於頻繁，請稍後重試":"服務無法取得模型；請確認 API 權限及額度");
 return response.json();
}
function render(info){
 lastInfo=info;
 const visible=info?.supported===true && providerField.value!=="canva";
 modelBox.hidden=!visible;
 if(!visible)return;
 modelField.replaceChildren();
 for(const entry of info.models||[]){
  const option=document.createElement("option");
  option.value=entry.id;option.textContent=(entry.name||entry.id)+" ("+entry.id+")";
  modelField.append(option);
 }
 modeField.value=info.mode||"balanced";
 modelField.value=info.selected||"";
 modelField.disabled=modeField.value!=="manual";
 modelResult.textContent=(info.models?.length||0)+" 個可見模型；目前選擇："+(info.selected||"尚未設定")+
   (info.stale?"；清單建議重新偵測":"");
}
async function status(){
 if(providerField.value==="canva"){
  render({provider:"canva",supported:false});return;
 }
 try{render(await api("models/status",{provider:providerField.value}));}
 catch(e){modelResult.textContent=String(e.message||e);}
}
providerField.addEventListener("change",()=>{lastInfo=null;void status();});
modeField.addEventListener("change",()=>{
 modelField.disabled=modeField.value!=="manual";
 if(modeField.value!=="manual"&&lastInfo){modelResult.textContent="選擇策略已變更，請按套用。";}
});
document.getElementById("refresh").addEventListener("click",async()=>{
 modelResult.textContent="正在向供應商查詢模型清單…";
 try{render(await api("models/refresh",{provider:providerField.value}));}
 catch(e){modelResult.textContent=String(e.message||e);}
});
document.getElementById("apply").addEventListener("click",async()=>{
 try{
  render(await api("models/select",{provider:providerField.value,
    mode:modeField.value,model_id:modeField.value==="manual"?modelField.value:""}));
  modelResult.textContent="已儲存模型策略。選用模型："+(lastInfo?.selected||"尚未設定");
 }catch(e){modelResult.textContent=String(e.message||e);}
});
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const button=document.getElementById("save"),field=document.getElementById("secret");
 button.disabled=true;result.textContent="正在安全儲存與偵測…";
 try{
  const response=await api("vault",{provider:providerField.value,secret:field.value});
  field.value="";
  result.textContent=response.discoveryError?
    "金鑰已安全儲存，但模型清單未取得。可按重新偵測；不會宣稱已驗證可用。":
    "金鑰已加密儲存。"+(response.model?.selected?" 已偵測並選擇："+response.model.selected:" 此服務不需要模型版本。");
  if(response.model)render(response.model);else await status();
 }catch(err){field.value="";result.textContent=String(err.message||err);}
 button.disabled=false;
});
void status();
</script></body></html>"""

def _verify(init_data: str) -> int:
    if not isinstance(init_data,str) or not 20<len(init_data)<8192:
        raise HTTPException(401,"Telegram WebApp authorization required")
    try:
        pairs=parse_qsl(init_data,keep_blank_values=True,strict_parsing=True,max_num_fields=35)
    except (ValueError, UnicodeError):
        raise HTTPException(401,"Invalid Telegram data") from None
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
    clear_catalog(request.provider)
    info=None
    error=False
    if request.provider in ("gemini","deepseek","openai"):
        try:
            info=await discover(request.provider)
        except HTTPException:
            # The credential was saved, but discovery has NOT verified usability.
            error=True
    return {"ok":True,"provider":request.provider,"secretReturned":False,
            "model":info,"discoveryError":error}
