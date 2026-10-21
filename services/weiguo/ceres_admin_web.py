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
:root{
  color-scheme:light dark;
  --bg:var(--tg-theme-bg-color,#10151d);
  --surface:var(--tg-theme-secondary-bg-color,#1c2531);
  --text:var(--tg-theme-text-color,#f4f7fc);
  --hint:var(--tg-theme-hint-color,#a5b0c1);
  --link:var(--tg-theme-link-color,#83b3ff);
  --accent:var(--tg-theme-button-color,#718be8);
  --accent-ink:var(--tg-theme-button-text-color,#ffffff);
  --stroke:color-mix(in srgb,var(--text) 11%,transparent);
  --stroke-strong:color-mix(in srgb,var(--text) 19%,transparent);
  --subtle:color-mix(in srgb,var(--text) 4%,transparent);
  --focus:color-mix(in srgb,var(--accent) 57%,transparent);
  --shadow:0 16px 44px rgba(0,0,0,.10);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:88px}
body{
  background:var(--bg);color:var(--text);font:15px/1.58 -apple-system,BlinkMacSystemFont,
  "SF Pro Text","Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;margin:0 auto;padding:22px max(16px,env(safe-area-inset-right))
  calc(48px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  max-width:820px;overflow-wrap:anywhere;
}
button,input,select{font:inherit}
button{font-weight:680;cursor:pointer;-webkit-tap-highlight-color:transparent}
button,input,select,a{touch-action:manipulation}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{
  outline:3px solid var(--focus);outline-offset:3px
}
a{color:inherit}
.hero{
  position:relative;overflow:hidden;padding:26px clamp(18px,5vw,30px) 28px;
  border-radius:24px;border:1px solid var(--stroke);
  background:linear-gradient(125deg,color-mix(in srgb,var(--accent) 14%,var(--surface)),
    color-mix(in srgb,var(--accent) 3%,var(--bg)) 77%);
  box-shadow:var(--shadow);
}
.hero:after{
  content:"";pointer-events:none;position:absolute;width:225px;height:225px;
  right:-100px;top:-106px;border:1px solid color-mix(in srgb,var(--accent) 29%,transparent);
  border-radius:50%;box-shadow:0 0 0 32px color-mix(in srgb,var(--accent) 5%,transparent),
    0 0 0 67px color-mix(in srgb,var(--accent) 3%,transparent)
}
.hero__top{display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;z-index:1}
.brand{display:flex;align-items:center;gap:11px;min-width:0}
.brand__mark{
  display:grid;place-items:center;flex:none;width:41px;height:41px;
  background:color-mix(in srgb,var(--accent) 21%,var(--surface));
  color:var(--text);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);
  border-radius:14px;font-size:21px;font-weight:770;letter-spacing:-.08em
}
.brand__name{font-weight:810;font-size:16px;line-height:1.15;letter-spacing:-.04em}
.brand__caption{display:block;font-size:10px;letter-spacing:.085em;color:var(--hint);margin-top:4px}
.access-pill{
  flex:none;padding:7px 10px;border-radius:100px;border:1px solid var(--stroke-strong);
  font-size:10px;font-weight:780;letter-spacing:.05em;background:var(--subtle);color:var(--hint)
}
.hero__eyebrow{position:relative;z-index:1;color:var(--link);font-size:11px;font-weight:760;letter-spacing:.14em;margin:29px 0 9px}
.hero h1{position:relative;z-index:1;font-size:clamp(27px,6vw,37px);line-height:1.18;letter-spacing:-.065em;margin:0 0 10px;font-weight:790}
.hero p{position:relative;z-index:1;max-width:480px;margin:0;color:var(--hint);font-size:13px}
nav{
  position:sticky;top:0;z-index:8;display:flex;gap:4px;margin:14px -8px 16px;
  padding:9px 8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;
  border-radius:16px;background:color-mix(in srgb,var(--bg) 93%,transparent);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)
}
nav::-webkit-scrollbar{display:none}
nav a{
  text-decoration:none;flex:0 0 auto;text-align:center;padding:9px 15px;
  font-size:12px;font-weight:720;line-height:1.35;border:1px solid transparent;
  border-radius:11px;color:var(--hint);transition:background .2s,color .2s;
}
nav a[aria-current="location"],nav a:hover{
  background:var(--surface);border-color:var(--stroke);color:var(--text)
}
.panel{
  position:relative;margin:14px 0;padding:clamp(17px,4.2vw,25px);
  border:1px solid var(--stroke);border-radius:21px;background:var(--surface);
  box-shadow:0 3px 14px rgba(0,0,0,.035);
  scroll-margin-top:84px
}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:17px}
.panel h2{font-size:18px;letter-spacing:-.045em;line-height:1.32;margin:0;font-weight:780}
.panel h3{font-size:14px;letter-spacing:-.025em;margin:21px 0 9px}
.section-note{display:block;font-size:12px;margin-top:5px;color:var(--hint);line-height:1.55}
.section-symbol{
  display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;
  background:color-mix(in srgb,var(--accent) 10%,var(--bg));
  border:1px solid var(--stroke);color:var(--link);font-size:16px;font-weight:760
}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 17px}
.metric{
  display:flex;flex-direction:column;gap:4px;min-height:130px;padding:15px;
  border-radius:16px;border:1px solid var(--stroke);background:var(--bg)
}
.metric__top{display:flex;align-items:center;gap:8px;min-height:22px}
.metric__dot{width:7px;height:7px;border-radius:50%;background:var(--hint);flex:none}
.metric__label{font-size:12px;font-weight:730;color:var(--hint)}
.metric b{display:block;font-size:clamp(15px,3.6vw,19px);letter-spacing:-.045em;font-weight:800;line-height:1.34;margin:5px 0;overflow-wrap:anywhere}
.metric__foot{margin-top:auto;font-size:11px;line-height:1.45;color:var(--hint)}
.metric[data-tone="ok"] .metric__dot{background:#37c39b;box-shadow:0 0 0 3px rgba(55,195,155,.13)}
.metric[data-tone="muted"] .metric__dot{background:#e6aa65}
.metric[data-tone="warn"] .metric__dot{background:#ee846d}
.tiny,.panel>p,.panel small{font-size:12px;color:var(--hint);line-height:1.7}
.panel>p{margin:0 0 17px}
label{display:block;font-size:12px;font-weight:730;margin:16px 0 7px;color:var(--text)}
input,select{
  width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--stroke-strong);
  border-radius:13px;background:var(--bg);color:var(--text);outline:none;
  transition:border-color .18s,box-shadow .18s;
}
select{padding-right:22px;cursor:pointer}
input::placeholder{color:var(--hint);opacity:.78}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
button{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  width:100%;min-height:47px;padding:12px 16px;margin-top:12px;
  color:var(--accent-ink);background:var(--accent);border:1px solid transparent;
  border-radius:13px;box-shadow:none;line-height:1.35;letter-spacing:.005em;
  transition:transform .15s ease,background .15s ease,opacity .15s ease;
}
button:active:not(:disabled){transform:scale(.987)}
button:disabled{cursor:default;opacity:.5}
button.secondary{
  background:var(--subtle);border-color:var(--stroke-strong);color:var(--text)
}
button.secondary:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 11%,var(--surface))}
button.billable{background:color-mix(in srgb,var(--accent) 12%,var(--bg));border-color:color-mix(in srgb,var(--accent) 32%,transparent);color:var(--text)}
.action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;gap:10px}
.action-row button{height:100%}
pre{
  max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.75
  -apple-system,BlinkMacSystemFont,"SF Pro Text","Noto Sans TC",system-ui,sans-serif;
  padding:14px 15px;background:var(--bg);border:1px solid var(--stroke);
  border-radius:14px;margin:14px 0 0;color:var(--text)
}
pre:empty{display:none}
.notice{display:flex;align-items:flex-start;gap:10px;font-size:11px;
  color:var(--hint);line-height:1.6;padding:13px 14px;margin-top:16px;
  border:1px solid var(--stroke);border-radius:13px;background:var(--subtle)
}
.notice:before{content:"i";display:grid;place-items:center;flex:none;width:18px;height:18px;border:1px solid var(--stroke-strong);
  border-radius:50%;font-size:11px;font-weight:800;font-style:normal;color:var(--link)}
.result{font-size:12px;line-height:1.65;min-height:0;margin-top:10px}
.result:empty{display:none}
.micro-divider{height:1px;background:var(--stroke);margin:20px 0 16px}
.field-hint{display:block;font-size:11px;line-height:1.55;color:var(--hint);margin-top:7px}
.inline-tag{display:inline-block;font-size:10px;font-weight:770;letter-spacing:.04em;color:var(--hint);
  padding:6px 9px;background:var(--subtle);border:1px solid var(--stroke);border-radius:8px}
#confirm-intent[hidden],#model-panel[hidden]{display:none!important}
footer{display:flex;justify-content:center;gap:10px;padding:20px 8px;color:var(--hint);font-size:11px;letter-spacing:.04em}
@media(min-width:680px){body{padding-top:36px}.hero{padding:34px}.panel{margin:18px 0}.cards{grid-template-columns:repeat(4,minmax(0,1fr))}nav{justify-content:center}}
@media(max-width:370px){.cards{gap:7px}.metric{padding:11px;min-height:138px}.action-row{grid-template-columns:1fr}.hero{padding:20px 16px}.access-pill{font-size:9px;padding:6px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important;animation:none!important}}
/* Ceres iOS monochrome design; all owner actions preserve existing signed endpoints. */
:root{--bg:#f5f5f7;--surface:#fff;--text:#101114;--hint:#77777b;
--link:#151515;--accent:#111;--accent-ink:#fff;--stroke:#e7e7eb;--stroke-strong:#d9d9de;
--subtle:#f5f5f7;--focus:#555;color-scheme:light}
html[data-theme="dark"]{--bg:#080809;--surface:#171719;--text:#fafafa;--hint:#98989f;
--link:#fff;--accent:#fff;--accent-ink:#101010;--stroke:#313135;--stroke-strong:#444448;
--subtle:#222225;--focus:#bbb;color-scheme:dark}
.hero{background:var(--surface);box-shadow:none;border-radius:20px}
.hero:after{display:none}.brand__mark,.section-symbol{background:var(--text);color:var(--surface);border-color:var(--text)}
.hero__eyebrow{color:var(--hint)}nav{position:static;background:var(--stroke);backdrop-filter:none;padding:5px;display:flex;gap:4px}
nav a{background:transparent;font-size:12px;padding:10px 12px}
nav a[aria-current="location"]{background:var(--surface);color:var(--text);box-shadow:0 1px 3px #00000015}
.panel{box-shadow:none;border-radius:19px;margin:0}.panel[hidden]{display:none!important}
.metric{min-height:124px}.metric[data-tone="ok"] .metric__dot{background:var(--text);box-shadow:none}
.metric[data-tone="warn"] .metric__dot{background:#c43a3a}
button.billable{background:var(--subtle);color:var(--text);border-color:var(--stroke-strong)}
button.secondary{background:var(--subtle)}.section-symbol{font-size:15px}
body{max-width:680px}
</style></head><body><header class="hero">
<div class="hero__top"><div class="brand"><div class="brand__mark" aria-hidden="true">C</div>
<div><div class="brand__name">CERES</div><span class="brand__caption">VANILLA / DETROIT</span></div></div>
<span class="access-pill">OWNER CONSOLE</span></div>
<div class="hero__eyebrow">PERSONAL AI INFRASTRUCTURE</div>
<h1>一切運作，盡在掌握。</h1>
<p>管理模型、觀測系統健康、查看用量與保護憑證。高風險操作仍由你確認後執行。</p></header>
<nav aria-label="管理區">
<a href="#overview" aria-current="location">總覽</a><a href="#model-panel">模型</a>
<a href="#usage-panel">用量</a><a href="#vault-panel">金鑰</a><a href="#intent-panel">設定</a>

</nav>
<section class="panel" id="overview">
<a class="backlink" href="/v1/ceres/admin/api-console">◈ 我的模型 API · 獨立服務台 →</a><div class="section-head"><div><h2>系統健康</h2><span class="section-note">區分服務配置、歷史活動與實際回覆</span></div><span class="section-symbol" aria-hidden="true">◎</span></div>
<div class="cards">
<div class="metric" id="metric-telegram" data-tone="neutral"><div class="metric__top"><span class="metric__dot" aria-hidden="true"></span><span class="metric__label">Telegram</span></div><b id="health-telegram">未檢查</b><span class="metric__foot">以已確認的回覆紀錄為準</span></div>
<div class="metric" id="metric-agent" data-tone="neutral"><div class="metric__top"><span class="metric__dot" aria-hidden="true"></span><span class="metric__label">AI Agent</span></div><b id="health-agent">未檢查</b><span class="metric__foot">確認模型及執行緒配置</span></div>
<div class="metric" id="metric-models" data-tone="neutral"><div class="metric__top"><span class="metric__dot" aria-hidden="true"></span><span class="metric__label">模型實測</span></div><b id="health-models">未檢查</b><span class="metric__foot">僅顯示實際成功測試</span></div>
<div class="metric" id="metric-failover" data-tone="neutral"><div class="metric__top"><span class="metric__dot" aria-hidden="true"></span><span class="metric__label">故障備援</span></div><b id="health-failover">未檢查</b><span class="metric__foot">預設不會自動切換</span></div></div>
<div class="action-row"><button type="button" class="secondary" id="refresh-health">更新健康狀態</button>
<button type="button" class="secondary" id="refresh-diagnostics">安全故障診斷</button></div>
<button type="button" class="secondary" id="telegram-check">發送 Telegram 回覆測試（一次）</button>
<pre id="diagnostics-result" role="status" aria-live="polite" aria-atomic="true"></pre>
<div class="notice">系統在線 ≠ Bot 已回覆；最近一次成功回覆與即時端對端測試會分開顯示。</div></section>
<section class="panel" id="usage-panel"><div class="section-head"><div><h2>用量與成本</h2><span class="section-note">30 日呼叫摘要 · 非供應商完整帳單</span></div><span class="section-symbol" aria-hidden="true">↗</span></div>
<pre id="usage-result" role="status">尚未載入</pre><button type="button" class="secondary" id="refresh-usage">重新整理</button></section>
<section class="panel" id="vault-panel"><div class="section-head"><div><h2>安全憑證庫</h2><span class="section-note">後端加密保管 · 不在對話中傳送金鑰</span></div><span class="section-symbol" aria-hidden="true">◇</span></div>
<p>金鑰只儲存在 WeiGuo 加密 Vault，不會寫入 Telegram 對話或在此頁面重新顯示。</p>
<form id="form"><label for="provider">服務供應商</label><select id="provider">
<option value="gemini">Gemini API</option><option value="canva">Canva OAuth Access Token</option>
<option value="deepseek">DeepSeek API</option><option value="openai">OpenAI API</option></select>
<label for="secret">API Key / OAuth Token</label>
<input id="secret" type="password" minlength="20" maxlength="4096" autocomplete="off" spellcheck="false" autocapitalize="off" required placeholder="只在這裡輸入金鑰">
<small>Canva 短期 Access Token 可能過期；正式使用建議完成 OAuth 授權及 Refresh Token 流程。管理員仍需擁有服務供應商的有效授權。</small>
<button id="save" type="submit">安全儲存並自動偵測</button></form><div id="result" class="result" role="status" aria-live="polite"></div></section>
<section id="model-panel" class="panel"><div class="section-head"><div><h2>模型工作室</h2><span class="section-note">發現 · 選擇 · 實測 · 比較</span></div><span class="section-symbol" aria-hidden="true">✦</span></div>
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
<p id="models-result" class="result" role="status" aria-live="polite"></p>
<small>官方清單表示 API 金鑰可見該模型，但無法保證立即可呼叫、可用額度或實際費率；自動排序是啟發式推薦，不等於確定最強或最便宜。私人模式不使用雲端模型。</small>
<label for="task-type">分析任務型態</label><select id="task-type">
<option value="general">日常（沿用模型設定）</option><option value="fast">快速回覆</option>
<option value="reasoning">深度推理</option><option value="coding">程式開發</option>
<option value="budget">成本優先（需已核對費率）</option></select>
<div class="action-row"><button type="button" id="recommend" class="secondary">智慧選模建議</button>
<button type="button" id="probe" class="billable">實際推論測試 · 可能計費</button></div>
<label for="compare-model">第二個模型（比較用）</label><select id="compare-model"></select>
<button type="button" class="billable" id="compare">比較兩個模型 · 可能計費</button>
<pre id="ops-result" role="status" aria-live="polite"></pre>
<div class="micro-divider"></div><h3>人工費率設定 <span class="inline-tag">選填</span></h3>
<p>單位為 USD／百萬 Token。未設定就只紀錄 Token，不推估價格。</p>
<div class="action-row"><div><label for="input-price">輸入 Token</label><input id="input-price" type="number" step="0.001" min="0" max="500" placeholder="USD / 1M"></div>
<div><label for="output-price">輸出 Token</label><input id="output-price" type="number" step="0.001" min="0" max="500" placeholder="USD / 1M"></div></div>
<button type="button" class="secondary" id="save-price">儲存已核對費率</button></section>
<section class="panel" id="intent-panel"><div class="section-head"><div><h2>對話式設定</h2><span class="section-note">描述需求，預覽變更後再套用</span></div><span class="section-symbol" aria-hidden="true">⌘</span></div>
<p>輸入：Gemini 速度優先、OpenAI 品質優先、DeepSeek 開啟備援。先預覽，再確認；不直接讓模型改權限。</p>
<label for="owner-intent">設定需求</label><input id="owner-intent" maxlength="140" placeholder="例如：Gemini 開啟備援">
<button type="button" id="preview-intent">預覽變更</button>
<pre id="intent-result" role="status" aria-live="polite"></pre>
<button type="button" id="confirm-intent" hidden>確認套用（Owner）</button>
<div class="notice">備援預設關閉；開啟後只在同供應商選用 24 小時內通過測試的其他模型，且最多額外重試一次，可能產生第二次費用。</div></section>
<footer>VANILLA AI <span aria-hidden="true">·</span> CERES OWNER CONSOLE</footer>
<script nonce="__NONCE__">
const tg=window.Telegram?.WebApp;
tg?.ready();tg?.expand();
document.documentElement.dataset.theme=(tg?.colorScheme==="dark"||
 (!tg?.colorScheme&&window.matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light";
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
 if(!visible){modelResult.textContent="此供應商沒有可選擇的文字模型。";return;}
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
// Presentation-only state; no settings are changed by tab navigation.
// Native iOS-style screens: one content screen at a time, not a long scroll page.
const navLinks=[...document.querySelectorAll('nav a[href^="#"]')];
const screens=["overview","model-panel","usage-panel","vault-panel","intent-panel"];
function activateNav(href){
 const id=href.slice(1);
 if(!screens.includes(id))return;
 for(const name of screens)document.getElementById(name).hidden=name!==id;
 for(const link of navLinks){
  if(link.getAttribute("href")===href)link.setAttribute("aria-current","location");
  else link.removeAttribute("aria-current");
 }
 window.scrollTo({top:0,behavior:"instant"});
}
navLinks.forEach(link=>link.addEventListener("click",e=>{
 e.preventDefault();activateNav(link.getAttribute("href"));
}));
activateNav("#overview");
function metricTone(id,tone){
 const card=document.getElementById(id);
 if(card)card.dataset.tone=tone;
}
let previewToken=null;
function fmtTime(t){return t?new Date(t*1000).toLocaleString("zh-TW"):"尚無成功紀錄";}
function safeResult(id,message){document.getElementById(id).textContent=String(message);}
async function refreshHealth(){
 try{const x=await api("ops/health",{});
  safeResult("health-telegram",x.telegram.lastVerifiedReplyAt?"有成功回覆紀錄":"尚未驗證回覆");
  safeResult("health-agent",x.agent.ready?"執行緒就緒":"未就緒");
  safeResult("health-models",x.probes.filter(p=>p.ok).length+" 次通過紀錄");
  safeResult("health-failover",Object.entries(x.failover).filter(([k,v])=>v).map(([k,v])=>k).join("、")||"未開啟");
  metricTone("metric-telegram",x.telegram.lastVerifiedReplyAt?"ok":"muted");
  metricTone("metric-agent",x.agent.ready?"ok":"warn");
  metricTone("metric-models",x.probes.some(p=>p.ok)?"ok":"muted");
  metricTone("metric-failover",Object.values(x.failover).some(Boolean)?"ok":"neutral");
  safeResult("diagnostics-result","最近接收："+fmtTime(x.telegram.lastInboundAt)+"\\n最近已發送回覆："+fmtTime(x.telegram.lastVerifiedReplyAt)+
    "\\n近 24 小時失敗任務："+(x.agent.last24hFailedJobs??"未知")+
    "\\n最近主動發送測試："+(x.telegram.lastTelegramSendCheck?
    fmtTime(x.telegram.lastTelegramSendCheck.at)+(x.telegram.lastTelegramSendCheck.apiAccepted?"（Bot API 接受）":"（失敗）"):"尚無")+
    "\\n即時端對端測試：尚未進行");
 }catch(e){
  ["metric-telegram","metric-agent","metric-models","metric-failover"].forEach(id=>metricTone(id,"warn"));
  safeResult("diagnostics-result",e.message||e);
 }
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
 try{const r=await api("ops/recommend",{provider:providerField.value,task:document.getElementById("task-type").value});
 safeResult("ops-result","目前選擇："+(r.selected||"未偵測")+"\\n任務建議："+(r.taskRecommended||"資料不足")+
 "\\n依據："+r.recommendationBasis+"\\n已測得最低延遲："+(r.observedFastest||"尚無有效樣本")+"\\n"+r.note);
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
 safeResult("ops-result",r.results.map(p=>p.model+" · "+p.code+" · "+p.latencyMs+"ms"+
 " · 算術題："+(p.objectiveMathCorrect?"正確":"未答對／不可驗證")+
 " · 測試估算："+(p.estimatedUsd==null?"費率未知":"US$"+p.estimatedUsd)).join("\\n")+"\\n"+r.note);
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


# Store operations P0: owner-only drafts and reporting, no billing or public broadcast.
class StoreDraft(BaseModel):
    init_data: str = Field(min_length=20, max_length=8192)
    kind: str = Field(pattern=r"^(offer|announcement)$")
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    reason: str = Field(default="", max_length=500)
    image_url: str = Field(default="", max_length=512)
    price_minor: int | None = Field(default=None, ge=0, le=100000000)
    discount_percent: int | None = Field(default=None, ge=0, le=100)
    starts_at: int | None = None
    ends_at: int | None = None

def _store_schema(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_store_drafts(
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL,
        kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        reason TEXT NOT NULL, image_url TEXT NOT NULL,
        price_minor INTEGER, discount_percent INTEGER,
        starts_at INTEGER, ends_at INTEGER,
        state TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL)""")

@router.post("/store/drafts")
async def create_store_draft(data: StoreDraft):
    owner = _verify(data.init_data)
    if data.starts_at is not None and data.ends_at is not None and data.ends_at <= data.starts_at:
        raise HTTPException(422, "End must follow start")
    if data.image_url:
        from urllib.parse import urlsplit
        try:
            url = urlsplit(data.image_url)
            if url.scheme != "https" or not url.hostname or url.username or url.password:
                raise ValueError()
        except ValueError:
            raise HTTPException(422, "HTTPS image URL required") from None
    with _session() as db:
        _store_schema(db)
        db.execute("BEGIN IMMEDIATE")
        cursor = db.execute("""INSERT INTO ceres_store_drafts
            (owner_id,kind,title,body,reason,image_url,price_minor,discount_percent,
             starts_at,ends_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (owner,data.kind,data.title,data.body,data.reason,data.image_url,
             data.price_minor,data.discount_percent,data.starts_at,data.ends_at,int(time.time())))
        draft_id = cursor.lastrowid
    return {"ok": True, "id": draft_id, "state": "draft", "public": False}

class StoreAuth(BaseModel):
    init_data: str = Field(min_length=20,max_length=8192)

@router.post("/store/drafts/list")
async def list_store_drafts(data: StoreAuth):
    owner = _verify(data.init_data)
    with _session() as db:
        _store_schema(db)
        rows = db.execute("""SELECT id,kind,title,body,reason,image_url,price_minor,
            discount_percent,starts_at,ends_at,state,created_at FROM ceres_store_drafts
            WHERE owner_id=? ORDER BY id DESC LIMIT 100""",(owner,)).fetchall()
    columns = ("id","kind","title","body","reason","image_url","price_minor",
               "discount_percent","starts_at","ends_at","state","created_at")
    return {"ok":True,"drafts":[dict(zip(columns,row)) for row in rows]}

@router.post("/store/analytics")
async def store_analytics(data: StoreAuth):
    owner = _verify(data.init_data)
    return {"ok":True,"owner":owner,"source":"not_connected",
            "total_tokens":None,"request_count":None,"cost_minor":None,
            "note":"API gateway metering is not yet connected; no usage values are fabricated."}
