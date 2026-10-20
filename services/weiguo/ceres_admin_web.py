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
:root{color-scheme:dark light}body{max-width:720px;margin:auto;padding:18px 16px 48px;background:var(--tg-theme-bg-color,#101319);line-height:1.45}
.hero{padding:22px 18px;border:1px solid #657b9940;border-radius:20px;background:linear-gradient(140deg,#455f932d,#b1a2e20d);margin-bottom:14px}
.hero h1{margin:6px 0 5px;font-size:1.6rem;letter-spacing:-.04em}.eyebrow{font-size:11px;letter-spacing:.16em;font-weight:800;opacity:.65}
.hero p{font-size:13px;margin:5px 0}.panel{background:var(--tg-theme-secondary-bg-color,#1b2029);padding:18px;border-radius:18px;margin:12px 0;border:1px solid #7e94ae33}
.panel h2{margin:0 0 10px;font-size:1.1rem}.panel p{font-size:13px}.tiny{font-size:12px;opacity:.72}
nav{display:flex;gap:8px;overflow:auto;padding:0 0 8px}nav a{display:inline-block;white-space:nowrap;border:1px solid #8299b150;border-radius:25px;padding:9px 13px;font-size:13px;color:inherit;text-decoration:none}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.metric{background:var(--tg-theme-bg-color,#101319);border-radius:13px;padding:12px;font-size:12px;word-wrap:break-word}.metric b{display:block;font-size:16px;margin:4px 0}
button{cursor:pointer;transition:opacity .15s;padding:12px;margin-top:10px}button:disabled{opacity:.42;cursor:wait}
button.secondary{background:transparent;color:inherit;border:1px solid #8696ac80}.action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
label{font-size:13px;margin:12px 0 5px}input,select{border-color:#8ba0b75c}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.65 system-ui,sans-serif}
.notice{font-size:12px;border-left:3px solid #86a5da;padding:9px 12px;background:#839ad519;border-radius:5px}
#confirm-intent[hidden],#model-panel[hidden]{display:none!important}
@media(max-width:360px){.action-row,.cards{grid-template-columns:1fr}}

</style></head><body><header class="hero"><div class="eyebrow">VANILLA · DETROIT / OWNER ONLY</div><h1>Ceres Control Center</h1>
<p>模型調度、診斷、成本與權限都在同一個 Telegram 安全控制中心。</p></header>
<nav aria-label="管理區"><a href="#overview">總覽</a><a href="#model-panel">模型</a><a href="#vault-panel">金鑰</a><a href="#intent-panel">AI 設定</a></nav>
<section class="panel" id="overview"><h2>◈ 即時與歷史健康</h2>
<div class="cards"><div class="metric">Telegram <b id="health-telegram">未檢查</b><span>接收／回覆分別驗證</span></div>
<div class="metric">Agent <b id="health-agent">未檢查</b><span>配置與最近故障</span></div>
<div class="metric">模型測試 <b id="health-models">未檢查</b><span>僅算實際生成測試</span></div>
<div class="metric">備援 <b id="health-failover">預設關閉</b><span>僅經你批准後使用</span></div></div>
<div class="action-row"><button type="button" class="secondary" id="refresh-health">更新健康狀態</button>
<button type="button" class="secondary" id="refresh-diagnostics">安全故障診斷</button></div>
<button type="button" class="secondary" id="telegram-check">發送 Telegram 回覆測試（一次）</button>
<pre id="diagnostics-result" role="status" aria-live="polite"></pre>
<div class="notice">系統在線 ≠ Bot 已回覆；最近一次成功回覆與即時端對端測試會分開顯示。</div></section>
<section class="panel" id="usage-panel"><h2>◈ 用量與成本</h2><div class="tiny">近 30 天 Ceres 已記錄的呼叫；不代表供應商整體帳單。</div>
<pre id="usage-result" role="status">尚未載入</pre><button type="button" class="secondary" id="refresh-usage">重新整理</button></section>
<section class="panel" id="vault-panel"><h2>◈ API 密鑰</h2>
<p>金鑰只儲存在 WeiGuo 加密 Vault，不會寫入 Telegram 對話或在此頁面重新顯示。</p>
<form id="form"><label for="provider">服務供應商</label><select id="provider">
<option value="gemini">Gemini API</option><option value="canva">Canva OAuth Access Token</option>
<option value="deepseek">DeepSeek API</option><option value="openai">OpenAI API</option></select>
<label for="secret">API Key / OAuth Token</label>
<input id="secret" type="password" minlength="20" maxlength="4096" autocomplete="off" required placeholder="在此安全輸入金鑰">
<small>Canva 短期 Access Token 可能過期；正式使用建議完成 OAuth 授權及 Refresh Token 流程。管理員仍需擁有服務供應商的有效授權。</small>
<button id="save" type="submit">安全儲存並自動偵測</button></form><div id="result" role="status" aria-live="polite"></div></section>
<section id="model-panel" class="panel"><h2>◈ AI 模型決策</h2>
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
<div class="action-row"><button type="button" id="recommend" class="secondary">智慧選模建議</button>
<button type="button" id="probe">實際測試選定模型（可能計費）</button></div>
<label for="compare-model">第二個模型（比較用）</label><select id="compare-model"></select>
<button type="button" class="secondary" id="compare">比較兩個模型（兩次付費測試）</button>
<pre id="ops-result" role="status" aria-live="polite"></pre>
<h3>費率（選填；由 Owner 自行核對輸入）</h3>
<p>單位為 USD／百萬 Token。未設定就只紀錄 Token，不推估價格。</p>
<div class="action-row"><div><label for="input-price">輸入 Token</label><input id="input-price" type="number" step="0.001" min="0" max="500" placeholder="USD / 1M"></div>
<div><label for="output-price">輸出 Token</label><input id="output-price" type="number" step="0.001" min="0" max="500" placeholder="USD / 1M"></div></div>
<button type="button" class="secondary" id="save-price">儲存已核對費率</button></section>
<section class="panel" id="intent-panel"><h2>◈ 對話式設定</h2>
<p>輸入：Gemini 速度優先、OpenAI 品質優先、DeepSeek 開啟備援。先預覽，再確認；不直接讓模型改權限。</p>
<label for="owner-intent">設定需求</label><input id="owner-intent" maxlength="140" placeholder="例如：Gemini 開啟備援">
<button type="button" id="preview-intent">預覽變更</button>
<pre id="intent-result" role="status" aria-live="polite"></pre>
<button type="button" id="confirm-intent" hidden>確認套用（Owner）</button>
<div class="notice">備援預設關閉；開啟後只在同供應商選用 24 小時內通過測試的其他模型，且最多額外重試一次，可能產生第二次費用。</div></section>
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
 if(!response.ok){let detail="";try{const p=await response.json();detail=typeof p.detail==="string"?p.detail:"";}catch(_){}
   throw Error(detail|| (response.status===401?"登入已過期，請重新打開安全表單":
   response.status===429?"操作過於頻繁，請稍後重試":"操作失敗（HTTP "+response.status+"）"));}
 return response.json();
}
function render(info){
 lastInfo=info;
 const visible=info?.supported===true && providerField.value!=="canva";
 modelBox.hidden=!visible;
 if(!visible)return;
 modelField.replaceChildren();
 const compareField=document.getElementById("compare-model");compareField.replaceChildren();
 for(const entry of info.models||[]){
  const option=document.createElement("option");
  option.value=entry.id;option.textContent=(entry.name||entry.id)+" ("+entry.id+")";
  modelField.append(option);
  compareField.append(option.cloneNode(true));
 }
 if(info.models?.length>1)compareField.selectedIndex=1;
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
let previewToken=null;
function fmtTime(t){return t?new Date(t*1000).toLocaleString("zh-TW"):"尚無成功紀錄";}
function safeResult(id,message){document.getElementById(id).textContent=String(message);}
async function refreshHealth(){
 try{const x=await api("ops/health",{});
  safeResult("health-telegram",x.telegram.lastVerifiedReplyAt?"有成功回覆紀錄":"尚未驗證回覆");
  safeResult("health-agent",x.agent.ready?"執行緒就緒":"未就緒");
  safeResult("health-models",x.probes.filter(p=>p.ok).length+" 次通過紀錄");
  safeResult("health-failover",Object.entries(x.failover).filter(([k,v])=>v).map(([k,v])=>k).join("、")||"未開啟");
  safeResult("diagnostics-result","最近接收："+fmtTime(x.telegram.lastInboundAt)+"\\n最近已發送回覆："+fmtTime(x.telegram.lastVerifiedReplyAt)+
    "\\n近 24 小時失敗任務："+(x.agent.last24hFailedJobs??"未知")+
    "\\n最近主動發送測試："+(x.telegram.lastTelegramSendCheck?
    fmtTime(x.telegram.lastTelegramSendCheck.at)+(x.telegram.lastTelegramSendCheck.apiAccepted?"（Bot API 接受）":"（失敗）"):"尚無")+
    "\\n即時端對端測試：尚未進行");
 }catch(e){safeResult("diagnostics-result",e.message||e);}
}
async function refreshUsage(){
 try{const x=await api("ops/usage",{});
   const rows=x.providers.map(p=>p.provider+" · "+p.calls+" 次 · Token "+p.input_tokens+"/"+p.output_tokens+
      " · 已知估算 US$"+(p.estimated_usd==null?"未知":Number(p.estimated_usd).toFixed(5))+
      (p.unpriced?"（"+p.unpriced+" 次未計價）":""));
   safeResult("usage-result",(rows.join("\\n")||"尚無紀錄")+"\\n"+x.note);
 }catch(e){safeResult("usage-result",e.message||e);}
}
document.getElementById("telegram-check").addEventListener("click",async()=>{
 const button=document.getElementById("telegram-check");button.disabled=true;
 try{const result=await api("ops/telegram-check",{});
  safeResult("diagnostics-result",result.apiAccepted?
    "Telegram 已接受本次測試訊息。請查看 Bot 私聊是否收到；未驗證已讀。":
    "Telegram 未確認接收；請檢查 LUCA 伺服器日志。");
  await refreshHealth();
 }catch(e){safeResult("diagnostics-result",e.message||e);}finally{button.disabled=false;}
});
document.getElementById("refresh-health").addEventListener("click",()=>void refreshHealth());
document.getElementById("refresh-usage").addEventListener("click",()=>void refreshUsage());
document.getElementById("refresh-diagnostics").addEventListener("click",async()=>{
 try{const x=await api("ops/diagnostics",{});
  safeResult("diagnostics-result",(x.modelChecks.map(p=>p.provider+"/"+p.model+" · "+(p.ok?"OK":"失敗 "+p.code)+" · "+fmtTime(p.checkedAt)).join("\\n")||"尚無模型測試紀錄")+"\\n"+x.note);
 }catch(e){safeResult("diagnostics-result",e.message||e);}
});
document.getElementById("recommend").addEventListener("click",async()=>{
 try{const r=await api("ops/recommend",{provider:providerField.value});
 safeResult("ops-result","目前選擇："+(r.selected||"未偵測")+"\\n已測得最低延遲："+(r.observedFastest||"尚無有效樣本")+"\\n"+r.note);
 }catch(e){safeResult("ops-result",e.message||e);}
});
document.getElementById("probe").addEventListener("click",async()=>{
 const button=document.getElementById("probe");button.disabled=true;
 safeResult("ops-result","正在發起一次小型實際生成測試，可能計費…");
 try{const r=await api("ops/probe",{provider:providerField.value,model:modelField.value});
 safeResult("ops-result",r.model+" · "+(r.ok?"成功":"失敗")+" · "+r.code+" · "+r.latencyMs+"ms\\n"+r.note);
 await refreshHealth();await refreshUsage();
 }catch(e){safeResult("ops-result",e.message||e);}finally{button.disabled=false;}
});
document.getElementById("compare").addEventListener("click",async()=>{
 const button=document.getElementById("compare");button.disabled=true;
 safeResult("ops-result","將進行兩次小型 API 呼叫，可能計費…");
 try{const r=await api("ops/compare",{provider:providerField.value,model:modelField.value,
   second:document.getElementById("compare-model").value});
 safeResult("ops-result",r.results.map(p=>p.model+" · "+p.code+" · "+p.latencyMs+"ms").join("\\n")+"\\n"+r.note);
 await refreshUsage();
 }catch(e){safeResult("ops-result",e.message||e);}finally{button.disabled=false;}
});
document.getElementById("save-price").addEventListener("click",async()=>{
 const a=document.getElementById("input-price").value,b=document.getElementById("output-price").value;
 if(a===""||b===""){safeResult("ops-result","請先填入兩個經核對的費率。");return;}
 try{const r=await api("ops/price",{provider:providerField.value,model:modelField.value,
 input_per_m:Number(a),output_per_m:Number(b)});
 safeResult("ops-result","費率已保存（由 Owner 提供；非官方價格同步）："+r.model);
 await refreshUsage();
 }catch(e){safeResult("ops-result",e.message||e);}
});
document.getElementById("preview-intent").addEventListener("click",async()=>{
 previewToken=null;document.getElementById("confirm-intent").hidden=true;
 try{const r=await api("ops/plan",{text:document.getElementById("owner-intent").value});
 previewToken=r.token;safeResult("intent-result",r.provider+" · "+r.operation+" → "+r.value+"\\n"+r.warning);
 document.getElementById("confirm-intent").hidden=false;
 }catch(e){safeResult("intent-result",e.message||e);}
});
document.getElementById("confirm-intent").addEventListener("click",async()=>{
 if(!previewToken)return;
 const token=previewToken;previewToken=null;document.getElementById("confirm-intent").hidden=true;
 try{const r=await api("ops/approve",{token});
 safeResult("intent-result","已確認套用："+r.provider+" "+(r.selected||("備援："+(r.failover?"開啟":"關閉"))));
 await status();await refreshHealth();
 }catch(e){safeResult("intent-result",e.message||e);}
});
void refreshHealth();void refreshUsage();
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
