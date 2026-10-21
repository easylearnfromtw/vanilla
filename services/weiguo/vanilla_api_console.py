"""Telegram-only, no-store iOS-like console for Vanilla-owned inference API."""
from __future__ import annotations

import secrets

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router=APIRouter(prefix="/v1/ceres/admin",tags=["vanilla-api-console"])

PAGE=r"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Vanilla API · Ceres</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style nonce="__NONCE__">
:root{color-scheme:light dark;--bg:#f5f5f7;--panel:#fff;--text:#101114;--sub:#77777b;
--line:#e7e7eb;--button:#111;--button-text:#fff;--field:#f3f3f5;--focus:#666}
[data-theme="dark"]{--bg:#080809;--panel:#171719;--text:#fafafa;--sub:#98989f;
--line:#313135;--button:#fff;--button-text:#101010;--field:#222225;--focus:#bbb}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0 auto;padding:calc(18px + env(safe-area-inset-top)) 16px calc(36px + env(safe-area-inset-bottom));max-width:670px;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang TC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
header{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:4px 0 21px}h1{font-size:26px;line-height:1.2;letter-spacing:-.055em;margin:0;font-weight:780}h2{font-size:20px;letter-spacing:-.035em;margin:0 0 6px}p{margin:8px 0 16px}small,.sub{font-size:12px;color:var(--sub)}.eyebrow{font-size:11px;letter-spacing:.09em;font-weight:740;color:var(--sub);margin-bottom:5px}.mark{display:grid;place-items:center;background:var(--text);color:var(--panel);width:38px;height:38px;border-radius:11px;font-size:19px;font-weight:850}
nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;background:var(--line);border-radius:14px;padding:4px;margin-bottom:16px;overflow:auto}
nav button{background:transparent;color:var(--sub);border:0;font-weight:650;font-size:12px;padding:11px 4px;min-width:0;border-radius:11px}
nav button[aria-selected="true"]{color:var(--text);background:var(--panel);box-shadow:0 1px 4px #00000012}
.screen[hidden]{display:none!important}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:19px;padding:20px;margin:12px 0}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px}.row:last-child{border:0}
.cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.metric{background:var(--panel);border:1px solid var(--line);border-radius:17px;padding:16px;min-height:100px}.metric strong{font-size:23px;letter-spacing:-.045em;display:block;margin-top:7px}.label{font-size:12px;color:var(--sub)}
label{display:block;font-weight:660;font-size:13px;margin:15px 0 7px}input,select{font:inherit;width:100%;min-height:47px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);outline:none}input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
button{cursor:pointer;touch-action:manipulation;font:inherit}button.primary,button.secondary{width:100%;min-height:48px;padding:12px 14px;border-radius:13px;margin-top:14px;font-weight:710}
button.primary{background:var(--button);color:var(--button-text);border:1px solid var(--button)}
button.secondary{background:var(--panel);color:var(--text);border:1px solid var(--line)}
button.danger{color:#c43a3a}button:disabled{opacity:.45}
input[type=checkbox]{width:19px;height:19px;min-height:0;vertical-align:middle;margin-right:7px;accent-color:var(--text)}
.notice{font-size:12px;color:var(--sub);background:var(--field);border-radius:12px;padding:13px;margin-top:13px}
pre{overflow-wrap:anywhere;white-space:pre-wrap;word-break:break-word;font:12px/1.65 ui-monospace,Menlo,monospace;background:var(--field);border-radius:12px;padding:13px}
pre:empty{display:none}
.danger-text{color:#c43a3a}
.status{min-height:0;margin-top:13px;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
.status:empty{display:none}
button#copyIssued{display:none}
button#copyIssued[data-available=true]{display:block}
#issuedKey{user-select:all;-webkit-user-select:all}
.backlink{display:inline-block;text-decoration:none;color:var(--sub);font-size:12px;border:1px solid var(--line);border-radius:12px;padding:9px 11px}
footer{text-align:center;font-size:11px;color:var(--sub);margin-top:30px}
@media(max-width:355px){nav{grid-template-columns:repeat(5,minmax(66px,1fr))}.cols{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
</style></head><body>
<header><div><div class="eyebrow">CERES · VANILLA MODEL PLATFORM</div><h1>我的模型 API</h1><div class="sub">存取權限、服務狀態與 Token 配額</div></div><div class="mark" aria-hidden="true">V</div></header>
<nav role="tablist" aria-label="API 管理頁面">
<button type="button" role="tab" id="tab-overview" data-page="overview" aria-selected="true" aria-controls="overview">總覽</button>
<button type="button" role="tab" id="tab-projects" data-page="projects" aria-selected="false" aria-controls="projects">應用</button>
<button type="button" role="tab" id="tab-keys" data-page="keys" aria-selected="false" aria-controls="keys">金鑰</button>
<button type="button" role="tab" id="tab-models" data-page="models" aria-selected="false" aria-controls="models">模型</button>
<button type="button" role="tab" id="tab-usage" data-page="usage" aria-selected="false" aria-controls="usage">用量</button>
</nav>
<main>
<section class="screen" id="overview" role="tabpanel" aria-labelledby="tab-overview">
 <div class="cols"><div class="metric"><div class="label">對外 API</div><strong id="gatewayStatus">未驗證</strong></div>
 <div class="metric"><div class="label">模型執行端</div><strong id="runtimeStatus">未驗證</strong></div></div>
 <div class="panel"><h2>服務概況</h2><div class="row"><span>已建立應用</span><strong id="projectCount">—</strong></div>
 <div class="row"><span>介面協定</span><strong>OpenAI 相容</strong></div>
 <div class="row"><span>穩定模型別名</span><code>vanilla-default</code></div>
 <div class="notice">Vanilla API 只連接你自架的推論服務，不會轉交 Gemini、OpenAI 等第三方 API Key。Slime 現階段的節點心跳不等於推論服務。</div>
 <button type="button" class="secondary" id="reloadStatus">重新檢查狀態</button></div>
 <div class="status" id="overviewMessage" role="status" aria-live="polite"></div>
</section>
<section class="screen" id="projects" role="tabpanel" aria-labelledby="tab-projects" hidden>
 <div class="panel"><h2>建立應用</h2><p class="sub">每個網站、朋友或 App 都建議使用獨立應用與金鑰，以便單獨控管。</p>
 <form id="projectForm"><label for="projectName">應用名稱</label>
 <input id="projectName" maxlength="60" minlength="2" required placeholder="例如：朋友 A 的研究工具">
 <button class="primary" type="submit">建立應用</button></form>
 <div class="status" id="projectMessage" role="status" aria-live="polite"></div></div>
 <div class="panel"><h2>現有應用</h2><div id="projectList" class="sub">尚未載入</div></div>
</section>
<section class="screen" id="keys" role="tabpanel" aria-labelledby="tab-keys" hidden>
 <div class="panel"><h2>核發 API Key</h2><p class="sub">金鑰僅出現一次。每日和每月 Token 額度、RPM 與輸出上限互相獨立。</p>
 <form id="keyForm">
 <label for="keyProject">所屬應用</label><select id="keyProject" required></select>
 <label for="keyName">金鑰標籤</label><input id="keyName" required minlength="2" maxlength="48" placeholder="例如：正式環境">
 <label for="keyModels">允許模型</label>
 <select id="keyModels"><option value="vanilla-default">僅使用 vanilla-default（隨版本更新）</option>
 <option value="*">全部目前及未來模型（高權限）</option></select>
 <div class="cols">
 <div><label for="keyDaily">每日 Token 上限</label><input type="number" id="keyDaily" value="20000" min="1000" max="2000000" required></div>
 <div><label for="keyMonthly">每月 Token 上限</label><input type="number" id="keyMonthly" value="200000" min="1000" max="30000000" required></div>
 <div><label for="keyRpm">每分鐘請求（RPM）</label><input type="number" id="keyRpm" value="10" min="1" max="60" required></div>
 <div><label for="keyOutput">每次輸出 Token</label><input type="number" id="keyOutput" value="512" min="16" max="2048" required></div>
 <div><label for="keyExpires">有效天數</label><input type="number" id="keyExpires" value="30" min="1" max="365" required></div>
 </div>
 <div class="notice">Token 額度先保守預留；若你的模型回報精確 Token，才會按實測結算。此金鑰請儲存在使用者的伺服器，避免出現在公開網頁或 App 原始碼。</div>
 <button class="primary" type="submit">核發新金鑰</button></form>
 <div class="status" id="keyMessage" role="status" aria-live="polite"></div>
 <div id="issuedBox" hidden><label>本次金鑰（關閉此頁後無法再顯示）</label>
 <pre id="issuedKey"></pre><button type="button" class="secondary" id="copyIssued">複製金鑰</button>
 <button type="button" class="secondary" id="dismissIssued">已安全保存，清除顯示</button></div></div>
 <div class="panel"><h2>有效及已停用金鑰</h2><div class="sub" id="keyList">尚未載入</div></div>
</section>
<section class="screen" id="models" role="tabpanel" aria-labelledby="tab-models" hidden>
 <div class="panel"><h2>模型發佈清單</h2><p class="sub">清單取自你自架的推論服務。預設五分鐘同步，支援固定別名讓外部客戶端不用頻繁換版。</p>
 <div id="modelList" class="sub">尚未取得</div><button type="button" class="secondary" id="refreshModels">由模型節點重新同步</button>
 <div class="status" id="modelMessage" role="status" aria-live="polite"></div></div>
</section>
<section class="screen" id="usage" role="tabpanel" aria-labelledby="tab-usage" hidden>
 <div class="panel"><h2>各應用 KPI</h2><p class="sub">30 日呼叫次數、實際或預留 Token、成功率及平均延遲。</p>
 <div id="usageList" class="sub">尚無紀錄</div><button type="button" class="secondary" id="reloadUsage">重新整理</button></div>
</section>
</main>
<footer>VANILLA AI · PRIVATE OWNER CONSOLE</footer>
<script nonce="__NONCE__">
"use strict";
const tg=window.Telegram?.WebApp;
tg?.ready?.();tg?.expand?.();
const initData=tg?.initData||"";
const dark=tg?.colorScheme==="dark"||(!tg?.colorScheme&&matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.theme=dark?"dark":"light";
const $=id=>document.getElementById(id);
let issuedSecret="", projectCache=[];
function message(id,value){$(id).textContent=String(value);}
async function api(path,fields={}){
 if(!initData)throw Error("請從已驗證的 Ceres Telegram Bot 開啟此頁");
 const response=await fetch("/v1/ceres/admin/gateway/"+path,{
 method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({init_data:initData,...fields}),cache:"no-store",credentials:"same-origin"});
 let data={};try{data=await response.json();}catch{}
 if(!response.ok)throw Error(typeof data.detail==="string"?data.detail:"HTTP "+response.status);
 return data;
}
const pages=["overview","projects","keys","models","usage"];
function navigate(to){
 if(!pages.includes(to))return;
 issuedSecret="";$("issuedKey").textContent="";$("issuedBox").hidden=true;$("copyIssued").dataset.available="false";
 for(const p of pages){
  $(p).hidden=p!==to;
  $("tab-"+p).setAttribute("aria-selected",String(p===to));
  $("tab-"+p).tabIndex=p===to?0:-1;
 }
 if(to==="overview")void loadStatus();
 if(to==="projects"||to==="keys")void loadProjects().then(()=>to==="keys"&&loadKeys()).catch(e=>message(to==="keys"?"keyMessage":"projectMessage",e.message));
 if(to==="usage")void loadUsage();
 if(to==="models")void loadModels(false);
 window.scrollTo({top:0,behavior:"instant"});
}
document.querySelectorAll("nav button[data-page]").forEach(btn=>{
 btn.addEventListener("click",()=>navigate(btn.dataset.page));
 btn.addEventListener("keydown",e=>{
  if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
  e.preventDefault();const current=pages.indexOf(btn.dataset.page);
  const next=pages[(current+(e.key==="ArrowRight"?1:pages.length-1))%pages.length];
  navigate(next);$("tab-"+next).focus();
 });
});
async function loadStatus(){
 try{const x=await api("status");
  message("gatewayStatus",x.gatewayEnabled?"已啟用":"未開放");
  message("runtimeStatus",x.runtimeConfigured?"已配置":"未連線");
  message("projectCount",x.projects);
  message("overviewMessage",!x.runtimeConfigured?"需要先將你自架的 HTTPS 模型執行端連線到 WeiGuo。":"執行端已配置，建議進入模型頁檢查實際模型清單。");
 }catch(e){message("overviewMessage",e.message);}
}
async function loadProjects(){
 const x=await api("projects");projectCache=x.projects;
 const options=$("keyProject");options.replaceChildren();
 const wrap=$("projectList");wrap.replaceChildren();
 if(!x.projects.length)wrap.textContent="尚未建立任何應用。";
 for(const p of x.projects){
  const o=document.createElement("option");o.value=p.id;o.textContent=p.label;options.append(o);
  const div=document.createElement("div");div.className="row";div.textContent=p.label;
  const toggle=document.createElement("button");toggle.type="button";toggle.className="secondary";
  toggle.style.width="auto";toggle.style.marginTop="0";
  toggle.textContent=p.enabled?"停用":"啟用";
  toggle.addEventListener("click",async()=>{
   const decision=p.enabled?"停用":"啟用";
   if(!window.confirm("確定"+decision+"此應用？所有所屬金鑰會"+(p.enabled?"立即停止":"恢復")+"新請求。"))return;
   toggle.disabled=true;
   try{await api("projects/toggle",{project_id:p.id,enabled:!p.enabled});await loadProjects();}
   catch(e){message("projectMessage",e.message);toggle.disabled=false;}
  });
  const sub=document.createElement("span");sub.className="sub";sub.textContent=p.enabled?"已啟用":"已停用";
  const controls=document.createElement("div");controls.append(sub,toggle);div.append(controls);wrap.append(div);
 }
}
$("projectForm").addEventListener("submit",async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{const x=await api("projects/create",{label:$("projectName").value});
  message("projectMessage","已建立："+x.label);$("projectName").value="";await loadProjects();
 }catch(err){message("projectMessage",err.message);}finally{button.disabled=false;}
});
async function loadKeys(){
 const x=await api("keys"),root=$("keyList");root.replaceChildren();
 if(!x.keys.length){root.textContent="目前沒有金鑰。";return;}
 for(const k of x.keys){
  const row=document.createElement("div");row.className="row";
  const detail=document.createElement("div");
  const name=document.createElement("strong");name.textContent=k.label;detail.append(name);
  const status=document.createElement("div");status.className="sub";
  status.textContent=(k.revoked_at?"已撤銷":"有效")+" · 日 "+k.daily_limit+" / 月 "+k.monthly_limit+" Token";
  detail.append(status);row.append(detail);
  if(!k.revoked_at){
   const btn=document.createElement("button");btn.className="secondary danger";btn.type="button";
   btn.style.width="auto";btn.style.marginTop="0";btn.textContent="撤銷";
   btn.addEventListener("click",async()=>{
    if(!window.confirm("確定撤銷 "+k.label+"？這把金鑰會立刻失效。"))return;
    btn.disabled=true;try{await api("keys/revoke",{key_id:k.id});await loadKeys();}
    catch(e){message("keyMessage",e.message);btn.disabled=false;}
   });row.append(btn);
  }
  root.append(row);
 }
}
$("keyForm").addEventListener("submit",async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 issuedSecret="";$("issuedKey").textContent="";$("issuedBox").hidden=true;
 try{const data=await api("keys/create",{
  project_id:$("keyProject").value,label:$("keyName").value,models:[$("keyModels").value],
  daily_tokens:Number($("keyDaily").value),monthly_tokens:Number($("keyMonthly").value),
  rpm:Number($("keyRpm").value),max_output_tokens:Number($("keyOutput").value),
  expires_days:Number($("keyExpires").value)});
  issuedSecret=data.api_key;$("issuedKey").textContent=issuedSecret;
  $("issuedBox").hidden=false;$("copyIssued").dataset.available="true";
  message("keyMessage","已核發。請立即保存，離開金鑰頁即清除顯示。");await loadKeys();
 }catch(err){message("keyMessage",err.message);}finally{button.disabled=false;}
});
$("copyIssued").addEventListener("click",async()=>{
 if(!issuedSecret)return;
 try{await navigator.clipboard.writeText(issuedSecret);message("keyMessage","已複製至剪貼簿；請保存於安全環境。");}
 catch{message("keyMessage","複製失敗，請手動長按選取金鑰。");}
});
$("dismissIssued").addEventListener("click",()=>{
 issuedSecret="";$("issuedKey").textContent="";$("issuedBox").hidden=true;$("copyIssued").dataset.available="false";
 message("keyMessage","顯示已清除，金鑰不會再回傳。");
});
async function loadModels(refresh){
 try{if(!refresh){const state=await api("status");if(!state.runtimeConfigured){message("modelList","推論節點尚未配置。");return;}}
  const x=await api("models/refresh"),root=$("modelList");root.replaceChildren();
  const first=document.createElement("div");first.className="row";first.textContent="vanilla-default  →  "+x.defaultResolvesTo;root.append(first);
  for(const model of x.models){const item=document.createElement("div");item.className="row";item.textContent=model;root.append(item);}
  message("modelMessage","清單已更新。現有金鑰若允許穩定別名，即可自動使用新版預設模型。");
 }catch(e){message("modelMessage",e.message);}
}
$("refreshModels").addEventListener("click",()=>void loadModels(true));
async function loadUsage(){
 try{const x=await api("usage"),root=$("usageList");root.replaceChildren();
  if(!x.items.length)root.textContent="尚無 API 呼叫紀錄。";
  for(const k of x.items){const d=document.createElement("div");d.className="row";
   const info=document.createElement("div");
   const title=document.createElement("strong");title.textContent=k.label;
   const meta=document.createElement("div");meta.className="sub";
   meta.textContent=k.requests+" 次呼叫 · "+k.reserved_or_charged_tokens+" Token";
   info.append(title,meta);d.append(info);
   const detail=document.createElement("span");detail.className="sub";detail.textContent=
    (k.successes||0)+" 成功 / "+(k.failures||0)+" 失敗 · "+
    (k.average_latency_ms==null?"延遲未知":k.average_latency_ms+"ms");
   d.append(detail);root.append(d);}
 }catch(e){message("usageList",e.message);}
}
$("reloadUsage").addEventListener("click",()=>void loadUsage());
$("reloadStatus").addEventListener("click",()=>void loadStatus());
window.addEventListener("pagehide",()=>{issuedSecret="";$("issuedKey").textContent="";});
void loadStatus();
</script></body></html>"""


@router.get("/api-console",response_class=HTMLResponse)
async def api_console():
    nonce=secrets.token_urlsafe(18)
    response=HTMLResponse(PAGE.replace("__NONCE__",nonce))
    response.headers["Cache-Control"]="no-store, private"
    response.headers["X-Content-Type-Options"]="nosniff"
    response.headers["Referrer-Policy"]="no-referrer"
    response.headers["X-Frame-Options"]="DENY"
    response.headers["Content-Security-Policy"]=(
        "default-src 'none'; script-src 'nonce-"+nonce+"' https://telegram.org; "
        "style-src 'nonce-"+nonce+"'; connect-src 'self'; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    return response
