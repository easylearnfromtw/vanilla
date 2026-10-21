"""Dedicated, owner-only Slime Telegram Mini App.

The public Slime installer is a separate GitHub Pages asset and never
links to the private Ceres bot. Mini App operations require Telegram's
signed, time-bounded initData and a server-verified Owner-to-Google-sub map.
"""
from __future__ import annotations

import base64
import hashlib
import io
import os
import re
import secrets
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from ceres_admin_bot import owner_subject
from ceres_admin_web import _verify
from ceres_gateway import _session
from slime import _db, _enabled, _pairing_page_url, issue_short_pair, ONLINE_SECONDS

router=APIRouter(prefix="/v1/ceres/slime",tags=["ceres-slime-owner"])

_PAGE="""<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><meta name="referrer" content="no-referrer">
<title>Slime · Ceres 私人管理</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style nonce="__NONCE__">
:root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Noto Sans TC",system-ui,sans-serif;
--bg:var(--tg-theme-bg-color,#f6f6f7);--paper:var(--tg-theme-secondary-bg-color,#fff);
--ink:var(--tg-theme-text-color,#151519);--muted:var(--tg-theme-hint-color,#818188);
--line:color-mix(in srgb,var(--ink) 12%,transparent);--soft:color-mix(in srgb,var(--ink) 4%,transparent);
--accent:var(--tg-theme-button-color,#161619);--accentText:var(--tg-theme-button-text-color,#fff)}
*{box-sizing:border-box}html{background:var(--bg);color:var(--ink)}
body{margin:0 auto;max-width:760px;padding:18px 14px calc(38px + env(safe-area-inset-bottom));
font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3,p{margin:0}button,input{font:inherit}button{cursor:pointer;min-height:42px}
button:disabled{opacity:.48;cursor:not-allowed}
button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
a{color:inherit;text-underline-offset:3px}
small,.muted{color:var(--muted)}
.eyebrow{letter-spacing:.17em;font-size:10px;color:var(--muted);font-weight:800}
.hero{border:1px solid var(--line);padding:24px;border-radius:25px;background:var(--paper);margin-bottom:13px}
.hero h1{letter-spacing:-.055em;line-height:1.15;font-size:clamp(28px,8vw,37px);margin:10px 0}
.hero p{font-size:12px;color:var(--muted);line-height:1.8}
.tabs{position:sticky;top:0;z-index:2;display:flex;gap:6px;padding:7px;border-radius:16px;background:var(--bg);
border:1px solid var(--line);margin-bottom:13px}
.tabs button{border:0;border-radius:11px;color:var(--muted);font-size:12px;background:transparent;
flex:1;padding:10px 6px;font-weight:740}
.tabs button[aria-selected=true]{background:var(--paper);color:var(--ink);box-shadow:0 2px 8px #0000000b}
.card{border:1px solid var(--line);border-radius:21px;background:var(--paper);padding:19px;margin-bottom:12px}
.card h2{font-size:17px;letter-spacing:-.035em;margin-bottom:5px}
.card p{font-size:12px;color:var(--muted);line-height:1.75}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.metric{padding:15px;border-radius:16px;background:var(--soft);display:flex;flex-direction:column;gap:4px}
.metric strong{font-size:24px;font-variant-numeric:tabular-nums;letter-spacing:-.04em}
.metric span{font-size:10px;color:var(--muted)}
.controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}
.btn{border:1px solid var(--line);border-radius:12px;padding:11px 13px;background:var(--soft);
color:var(--ink);font-size:12px;font-weight:730;text-decoration:none;display:inline-flex;gap:7px;
align-items:center;justify-content:center}
.btn.primary{background:var(--accent);color:var(--accentText);border-color:var(--accent)}
.btn.danger{color:#cb4545;border-color:color-mix(in srgb,#cb4545 32%,transparent)}
.btn:disabled{cursor:not-allowed}
.nodes{display:grid;gap:10px;margin-top:13px}
.node{padding:15px;border-radius:15px;background:var(--soft);border:1px solid var(--line)}
.node-top{display:flex;align-items:center;justify-content:space-between;gap:9px}
.node strong{font-size:14px;overflow-wrap:anywhere}
.state{border-radius:100px;font-size:10px;padding:6px 9px;white-space:nowrap;
background:var(--paper);border:1px solid var(--line)}
.node small{display:block;font-size:11px;line-height:1.8;margin-top:8px;overflow-wrap:anywhere}
.node .controls{margin-top:10px}
.code{background:var(--soft);border:1px solid var(--line);border-radius:15px;
text-align:center;padding:20px 9px;margin:16px 0 7px}
.code strong{font:800 clamp(19px,4.5vw,29px)/1.5 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
letter-spacing:.08em;user-select:all;overflow-wrap:anywhere}
.code small{display:block;font-size:11px;margin-top:6px}
.qr{display:flex;justify-content:center;align-items:center;margin:13px 0 4px}
.qr img{width:min(100%,220px);height:auto;background:#fff;padding:10px;border-radius:15px;border:1px solid var(--line)}
.hidden{display:none!important}
.notice{padding:13px;background:var(--soft);border-radius:12px;color:var(--muted);font-size:11px;line-height:1.8}
.result{margin:12px 0 0;padding:13px;border-radius:12px;background:var(--soft);
font-size:12px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}
.confirm{border:1px solid var(--line);padding:14px;border-radius:13px;margin-top:11px}
.confirm strong{font-size:13px}
.confirm p{margin:8px 0}
[hidden]{display:none!important}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}

/* SLIME / CERES premium monochrome Hub */
:root{--accent:var(--ink);--accentText:var(--paper);--radius:23px}
body{max-width:700px;padding:14px 14px calc(90px + env(safe-area-inset-bottom));font-size:14px;line-height:1.6}
button,a{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.hero{position:relative;overflow:hidden;isolation:isolate;border-radius:26px;padding:22px 24px 18px;background:var(--paper);box-shadow:0 9px 35px #00000005}
.hero:before{content:"";position:absolute;right:-92px;top:100px;width:270px;height:270px;border:1px solid var(--line);border-radius:50%;z-index:-1}
.hero:after{content:"";position:absolute;right:-46px;top:151px;width:180px;height:180px;border:1px solid var(--line);border-radius:50%;z-index:-1}
.hub-top{display:flex;align-items:center;gap:10px;padding-bottom:19px;border-bottom:1px solid var(--line)}
.hub-mark{width:38px;height:38px;display:grid;place-items:center;background:var(--ink);color:var(--paper);border-radius:12px;font-size:19px;font-weight:850}
.hub-brand{display:flex;flex-direction:column;gap:3px}.hub-brand .eyebrow{font-size:9px}.hub-brand b{font-size:12px;letter-spacing:.05em}
.hub-private{margin-left:auto;border:1px solid var(--line);padding:7px 9px;border-radius:99px;color:var(--muted);font-size:10px;white-space:nowrap}
.hero-copy{padding:31px 2px 32px}
.hero-kicker{font-size:10px;letter-spacing:.13em;font-weight:770;color:var(--muted)}
.hero h1{font-size:clamp(37px,8vw,51px);letter-spacing:-.07em;line-height:1.12;margin:18px 0 15px;font-weight:820}
.hero h1 span{color:var(--muted)}.hero p{font-size:12px;line-height:1.85}
.hero-foot{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:13px;color:var(--muted);font-size:9px;letter-spacing:.1em;font-weight:750}
.tabs{top:8px;border-radius:16px;padding:5px;margin-bottom:20px;background:var(--soft);border:1px solid var(--line);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 4px 23px #00000009}
.tabs button{min-height:46px;border-radius:12px;font-size:12px;font-weight:750;transition:background .16s,color .16s;display:flex;align-items:center;justify-content:center;gap:7px}
.tabs button[aria-selected=true]{box-shadow:0 3px 8px #00000013}.tab-icon{font-size:15px;font-weight:850;display:inline-grid;width:20px;place-items:center}
.section-head{padding:5px 2px 18px}.section-head h2{font-size:27px;letter-spacing:-.06em;margin:5px 0 2px}.section-head p{font-size:12px;color:var(--muted)}
.card{border-radius:23px;padding:21px;border-color:var(--line);box-shadow:0 5px 24px #00000005}
.card-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}
.card-title h2{font-size:19px;margin:4px 0 0}.card-title .eyebrow{font-size:9px}
.status-pill{font-size:10px;color:var(--muted);background:var(--soft);border:1px solid var(--line);padding:8px 10px;border-radius:99px;white-space:nowrap}
.status-pill[data-state=ready]{color:var(--ink)}.status-pill[data-state=error]{color:#b64d4d}
.cards{gap:9px}.metric{min-height:133px;padding:16px;border:1px solid var(--line);border-radius:17px;position:relative;justify-content:flex-end;gap:2px}
.metric strong{font-size:clamp(34px,8vw,44px);font-weight:760;letter-spacing:-.08em;line-height:1.05;margin-bottom:5px}.metric span{color:var(--ink);font-size:11.5px;font-weight:700}
.metric .metric-top{position:absolute;top:10px;right:13px;color:var(--muted);font-size:15px}.metric small{font-size:9px;letter-spacing:.09em}
.btn{min-height:47px;border-radius:13px;font-weight:710;padding:12px 14px;touch-action:manipulation}
.btn.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.btn.soft{background:var(--soft);color:var(--ink);border:1px solid var(--line)}.btn.danger{color:#b84848;border-color:color-mix(in srgb,#b84848 32%,var(--line))}
.btn.danger.solid{color:#fff;background:#b84848;border-color:#b84848}.btn.full{width:100%}
.overview-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:16px}
.note{font-size:11px!important;color:var(--muted);line-height:1.75!important;margin-top:13px!important}
.separator{height:1px;background:var(--line);margin:16px 0}
.node{padding:16px;background:var(--soft);border:1px solid var(--line);border-radius:17px}
.node strong{font-size:14px;line-height:1.55}.node small{line-height:1.85;margin-top:10px}.node .controls{gap:8px;margin-top:13px}
.node .btn{min-width:112px;flex:1;min-height:44px;font-size:11px}
.state{font-size:10px;font-weight:750}.state[data-online=true]{color:var(--ink);background:var(--paper)}
.pair-steps{margin:18px 0;border:1px solid var(--line);border-radius:15px;padding:0 12px}
.pair-steps div{display:flex;gap:13px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line);font-size:12px;font-weight:690}
.pair-steps div:last-child{border:0}.pair-steps b{font-variant-numeric:tabular-nums;color:var(--muted);font-size:11px;letter-spacing:.08em}
.code{padding:25px 11px;background:var(--soft);border:1px solid var(--line);border-radius:18px;margin-top:18px}
.code strong{display:block;letter-spacing:.08em;margin:10px 0;font-size:clamp(21px,5vw,32px)}
.qr{background:var(--soft);padding:13px;border-radius:15px;margin:12px 0}
.qr img{border:0}.pair-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.toast{position:fixed;z-index:12;bottom:calc(17px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(540px,calc(100% - 30px));padding:14px 16px;text-align:center;border-radius:13px;box-shadow:0 12px 35px #00000022;background:var(--ink);color:var(--paper);font-size:12px;font-weight:680;white-space:normal}
.sheet-backdrop{position:fixed;z-index:20;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:12px 12px max(12px,env(safe-area-inset-bottom));background:#0008;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.sheet-body{width:min(540px,100%);background:var(--paper);border-radius:26px;padding:13px 20px 21px;box-shadow:0 30px 75px #0003}
.sheet-handle{margin:0 auto 20px;background:var(--line);width:34px;height:4px;border-radius:9px}
.sheet-body strong{font-size:22px;letter-spacing:-.05em;display:block;margin:6px 0 9px}.sheet-body p{font-size:12px;line-height:1.8;color:var(--muted)}
.sheet-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:20px}
@media(min-width:630px){.hero{padding:25px 30px}.card{padding:25px}.sheet-backdrop{align-items:center}}
@media(max-width:380px){.hero{padding:18px}.hub-private{font-size:9px;padding:6px 7px}.metric{padding:12px;min-height:115px}.metric strong{font-size:34px}.pair-actions{grid-template-columns:1fr}.node .btn{min-width:0}}
@media(prefers-reduced-motion:reduce){.tabs button{transition:none}}

/* Explicit welcome → all-white iOS workspace, independent from Telegram chat wallpaper. */
html.slime-white,html.slime-white body{
 color-scheme:light;
 --bg:#ffffff;--paper:#ffffff;--ink:#141416;--muted:#72727a;
 --line:#e8e8eb;--soft:#f7f7f8;--accent:#141416;--accentText:#ffffff;
 background:#ffffff!important;color:#141416!important;
}
html.slime-white .tabs{background:#f5f5f6}
html.slime-white .card,html.slime-white .hero{background:#ffffff}
.welcome-splash{
 position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;
 padding:max(24px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right))
 max(35px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left));
 background:#121214;color:#ffffff;overflow:auto;
}
.welcome-inner{max-width:500px;width:100%;min-height:min(610px,85vh);display:flex;flex-direction:column}
.welcome-header{display:flex;align-items:center;gap:12px}
.welcome-logo{display:grid;place-items:center;width:44px;height:44px;background:#fff;color:#111;border-radius:14px;font-size:24px;font-weight:800}
.welcome-brand{font-size:12px;letter-spacing:.15em;font-weight:750}
.welcome-edition{margin-left:auto;letter-spacing:.14em;font-size:10px;color:#b1b1ba}
.welcome-center{flex:1;display:flex;justify-content:center;flex-direction:column;padding:50px 0 40px}
.welcome-overline{font-size:11px;font-weight:760;letter-spacing:.15em;color:#b6b6bf}
.welcome-center h2{font-size:clamp(44px,11vw,70px);letter-spacing:-.08em;line-height:1.08;margin:16px 0 20px;font-weight:810;color:#ffffff}
.welcome-center h2 span{color:#a3a3ac}
.welcome-center p{line-height:1.9;font-size:13px;color:#bbbcc4}
.welcome-points{margin:26px 0 0;display:grid;gap:13px}
.welcome-points div{display:flex;align-items:center;gap:13px;font-size:12px;color:#e4e4e9}
.welcome-index{display:grid;place-items:center;width:28px;height:28px;border:1px solid #47474d;border-radius:10px;font-size:11px;color:#bfc0c9}
.welcome-start{width:100%;min-height:56px;background:#ffffff;border:1px solid #ffffff;color:#111114;
 border-radius:15px;font-weight:790;font-size:15px;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
.welcome-start:active{transform:scale(.99)}
.welcome-privacy{font-size:10px;line-height:1.7;margin-top:16px;color:#92929e;text-align:center}
@media(max-width:380px){.welcome-center h2{font-size:43px}.welcome-splash{padding-left:19px;padding-right:19px}}
@media(prefers-reduced-motion:reduce){.welcome-start:active{transform:none}}
</style></head><body>
<div id="welcome-splash" class="welcome-splash" role="region" aria-label="Ceres Slime 歡迎畫面" hidden>
<div class="welcome-inner">
<div class="welcome-header"><span class="welcome-logo" aria-hidden="true">S</span><span class="welcome-brand">CERES / SLIME</span><span class="welcome-edition">OWNER STUDIO</span></div>
<div class="welcome-center"><span class="welcome-overline">WELCOME TO YOUR OWN AI NETWORK</span>
<h2>歡迎來到<br><span>Slime。</span></h2>
<p>你的電腦，成為你的運算網路。<br>所有節點、配對和模型授權，都由你掌握。</p>
<div class="welcome-points">
<div><span class="welcome-index">01</span>即時查看你的節點狀態</div>
<div><span class="welcome-index">02</span>一鍵建立安全配對碼</div>
<div><span class="welcome-index">03</span>重要權限由你確認</div></div></div>
<button id="welcome-start" class="welcome-start" type="button">開始使用 <span aria-hidden="true">→</span></button>
<p class="welcome-privacy">按下後進入全白工作介面；不會更改 Telegram 聊天桌布或開放模型權限。</p>
</div></div>
<header class="hero">
<div class="hub-top"><div class="hub-mark" aria-hidden="true">S</div><div class="hub-brand"><span class="eyebrow">CERES / OWNER STUDIO</span><b>SLIME NETWORK</b></div><span class="hub-private">◇ 私人控制台</span></div>
<div class="hero-copy"><span class="hero-kicker">● YOUR COMPUTE FABRIC</span>
<h1>算力，<br><span>盡在掌握。</span></h1><p>管理你的本地節點、模型權限與一次性配對。<br>僅限經過身分驗證的 Owner。</p></div>
<div class="hero-foot"><span>SLIME / CONTROL STUDIO</span><span>OWNER ONLY</span></div>
</header>
<nav class="tabs" role="tablist" aria-label="Slime 管理分頁">
<button type="button" role="tab" id="tab-overview" aria-selected="true" tabindex="0" aria-controls="overview" data-tab="overview"><span class="tab-icon" aria-hidden="true">◫</span>總覽</button>
<button type="button" role="tab" id="tab-devices" aria-selected="false" tabindex="-1" aria-controls="devices" data-tab="devices"><span class="tab-icon" aria-hidden="true">▤</span>節點</button>
<button type="button" role="tab" id="tab-pairing" aria-selected="false" tabindex="-1" aria-controls="pairing" data-tab="pairing"><span class="tab-icon" aria-hidden="true">＋</span>配對</button>
</nav>
<main>
<section id="overview" role="tabpanel" aria-labelledby="tab-overview">
<div class="section-head"><span class="eyebrow">01 / OVERVIEW</span><h2>網路總覽</h2><p>當前 Slime 節點的即時摘要</p></div>
<div class="card">
<div class="card-title"><div><span class="eyebrow">NETWORK PULSE</span><h2>裝置運行</h2></div><span class="status-pill" id="sync-pill">● 同步中</span></div>
<div class="cards">
<div class="metric"><span class="metric-top" aria-hidden="true">▦</span><strong id="total">—</strong><span>已加入裝置</span><small>DEVICES</small></div>
<div class="metric"><span class="metric-top" aria-hidden="true">●</span><strong id="online">—</strong><span>目前在線</span><small>ONLINE</small></div>
<div class="metric"><span class="metric-top" aria-hidden="true">◇</span><strong id="approved">—</strong><span>推論已授權</span><small>APPROVED</small></div>
<div class="metric"><span class="metric-top" aria-hidden="true">▤</span><strong id="models">—</strong><span>可用模型</span><small>MODELS</small></div>
</div>
<div class="overview-actions"><button class="btn primary" id="refresh">↻ 重新同步</button>
<button class="btn soft" data-go="devices">查看所有節點 ↗</button></div>
<p class="note">數據來自節點心跳與模型登錄；在線不代表模型已完成推論。</p></div>
<div class="card"><div class="card-title"><div><span class="eyebrow">RUNTIME STATUS</span><h2>服務狀態</h2></div><span aria-hidden="true">◎</span></div>
<p id="service">正在確認後端服務…</p><div class="separator"></div>
<div class="notice">ⓘ 推論與公開 API 採獨立開關；新加入的電腦不會自動取得推論權限。</div></div>
</section>
<section id="devices" role="tabpanel" aria-labelledby="tab-devices" hidden>
<div class="section-head"><span class="eyebrow">02 / DEVICE CONTROL</span><h2>我的節點</h2><p>查看裝置、授權模型與管理連線</p></div>
<div class="card">
<div class="card-title"><div><span class="eyebrow">TRUSTED DEVICES</span><h2>連線裝置</h2></div><span class="status-pill" id="device-counter">— DEVICES</span></div>
<p>裝置與模型推論權限分開管理。撤銷配對後，原本的裝置憑證立即失效。</p>
<div id="node-list" class="nodes" aria-live="polite"><p>正在讀取節點…</p></div>
<div class="controls"><button class="btn soft full" data-go="pairing">＋ 新增節點</button></div></div>
</section>
<section id="pairing" role="tabpanel" aria-labelledby="tab-pairing" hidden>
<div class="section-head"><span class="eyebrow">03 / SECURE PAIRING</span><h2>配對新裝置</h2><p>一次性短碼，安全加入你的 Slime 網路</p></div>
<div class="card"><div class="card-title"><div><span class="eyebrow">ONE-TIME ACCESS</span><h2>建立配對邀請</h2></div><span aria-hidden="true">＋</span></div>
<p>取得一組 12 位短碼，讓已同意加入的電腦完成第一次連線。配對成功不會自動核准模型推論。</p>
<div class="pair-steps"><div><b>01</b><span>產生專屬配對碼</span></div><div><b>02</b><span>在電腦輸入短碼</span></div><div><b>03</b><span>回到節點頁確認</span></div></div>
<div class="controls"><button id="issue" class="btn primary full">＋ 產生一次性配對碼</button></div>
<div id="code-box" hidden><div class="code"><span class="eyebrow">YOUR PAIRING CODE</span><strong id="code">—</strong><small>10 分鐘後失效 · 一次性使用</small></div>
<div id="qr-box" class="qr" hidden><img id="qr-image" alt="Slime 配對 QR Code，包含本次一次性邀請" width="220" height="220"></div>
<div class="controls pair-actions"><button id="copy-code" class="btn primary">⧉ 複製短碼</button>
<button id="copy-link" class="btn soft">複製備用連結</button></div></div>
<p class="result" id="pair-result" role="status" aria-live="polite" hidden></p>
<div class="notice" style="margin-top:16px">⌁ 僅與取得同意的裝置持有人分享。這裡不會顯示原始的長期節點 Token。</div>
<div class="controls"><a id="installer" class="btn soft full" href="#" target="_blank" rel="noopener noreferrer">↗ Slime 公開下載頁</a></div>
</div>
</section>
<div class="card" id="auth-block" hidden><h2>需要 Telegram 身分驗證</h2>
<p>請從已授權的 Ceres Owner 私聊使用「Slime 私人管理頁」按鈕開啟。
一般瀏覽器直接開啟網址不會取得管理權限。</p></div>
<div id="confirm-box" class="sheet-backdrop" hidden><div class="sheet-body" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
<div class="sheet-handle" aria-hidden="true"></div><span class="eyebrow">SECURE ACTION / REVIEW</span>
<strong id="confirm-title">確認操作</strong><p id="confirm-description"></p>
<div class="sheet-actions"><button type="button" id="approve" class="btn danger solid">確認執行</button>
<button type="button" id="cancel" class="btn soft">取消，返回</button></div></div></div>
<div id="message" class="toast" role="status" aria-live="polite" hidden></div>
</main>
<script nonce="__NONCE__">
(function(){
 "use strict";
 const tg=window.Telegram?.WebApp;
 const auth=tg?.initData||"";
 const $=id=>document.getElementById(id);
 let nodes=[],issued=null,pending=null,busy=false,flash=null,requesting=false;
 function haptic(){try{tg?.HapticFeedback?.selectionChanged?.();}catch(e){}}
 function notice(txt){
   const box=$("message");box.hidden=false;box.textContent=String(txt);
   if(flash)clearTimeout(flash);
   flash=setTimeout(()=>{box.hidden=true;},4200);
 }
 function setTab(value){
   if(!["overview","devices","pairing"].includes(value))return;
   document.querySelectorAll("[data-tab]").forEach(btn=>{
     const active=btn.dataset.tab===value;
     btn.setAttribute("aria-selected",String(active));btn.tabIndex=active?0:-1;
   });
   ["overview","devices","pairing"].forEach(key=>$(key).hidden=key!==value);
   haptic();
 }
 async function api(route,extra){
   if(!auth)throw Error("Telegram Owner 驗證未就緒；請從 Bot 私聊重新開啟。");
   const res=await fetch("/v1/ceres/slime/"+route,{method:"POST",cache:"no-store",
    credentials:"omit",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(Object.assign({init_data:auth},extra||{}))});
   let obj={};try{obj=await res.json();}catch(e){throw Error("伺服器回傳格式不正確");}
   if(!res.ok)throw Error(typeof obj.detail==="string"?obj.detail:"操作失敗");
   return obj;
 }
 function nodeCard(n){
   const root=document.createElement("article");root.className="node";
   const head=document.createElement("div");head.className="node-top";
   const name=document.createElement("strong");name.textContent=n.label;
   const badge=document.createElement("span");badge.className="state";
   badge.dataset.online=String(Boolean(n.online));
   badge.textContent=n.online?"● 在線":"○ 離線";
   head.append(name,badge);root.append(head);
   const info=document.createElement("small");
   info.textContent=(n.role==="owner"?"我的電腦":"朋友節點")+" · "+
     (n.os||"未回報系統")+" · "+(n.gpu||"GPU 未回報")+
     " · "+(n.ram_gb||0)+"GB RAM · "+(n.share_enabled?"同意共享":"共享關閉")+
     " · "+(n.owner_enabled?"已授權節點":"已停用節點")+
     " · "+(n.inference_enabled?"推論已核准":"推論關閉");
   root.append(info);
   const ctr=document.createElement("div");ctr.className="controls";
   const actions=[
    {label:n.owner_enabled?"停用節點":"啟用節點",kind:"node",enable:!n.owner_enabled},
    {label:n.inference_enabled?"停止推論":"核准推論",kind:"inference",enable:!n.inference_enabled},
    {label:"撤銷配對",kind:"revoke",enable:false}
   ];
   actions.forEach(a=>{
    const button=document.createElement("button");button.type="button";
    button.className="btn "+(a.kind==="revoke"?"danger":"soft");button.textContent=a.label;
    button.addEventListener("click",()=>plan(n,a.kind,a.enable));ctr.append(button);
   });
   root.append(ctr);return root;
 }
 async function reload(){
  if(requesting)return;
  requesting=true;$("refresh").disabled=true;
  $("sync-pill").textContent="● 正在同步";$("sync-pill").dataset.state="loading";
  try{
   const data=await api("snapshot");
   nodes=data.nodes||[];
   $("total").textContent=String(data.counts.total);
   $("online").textContent=String(data.counts.online);
   $("approved").textContent=String(data.counts.inferenceApproved);
   $("models").textContent=String(data.counts.catalogModels);
   $("service").textContent=data.service.message;
   $("sync-pill").textContent="● 已同步";$("sync-pill").dataset.state="ready";
   $("device-counter").textContent=nodes.length+" DEVICES";
   const list=$("node-list");list.replaceChildren();
   if(!nodes.length){const p=document.createElement("p");p.textContent="尚未註冊節點。可前往「配對」新增第一台電腦。";list.append(p);}
   else nodes.forEach(n=>list.append(nodeCard(n)));
   $("installer").href=data.publicInstaller;
  }catch(e){
   $("sync-pill").textContent="● 連線失敗";$("sync-pill").dataset.state="error";
   notice(e.message);
  }finally{requesting=false;$("refresh").disabled=false;}
 }
 async function issue(){
  const button=$("issue");button.disabled=true;$("pair-result").hidden=true;
  try{
   button.textContent="正在建立安全配對碼…";
   const obj=await api("issue");
   issued={code:obj.code,link:obj.link};
   $("code").textContent=issued.code;$("code-box").hidden=false;
   $("qr-box").hidden=!obj.qr_data_uri;
   if(obj.qr_data_uri)$("qr-image").src=obj.qr_data_uri;
   $("pair-result").hidden=false;
   $("pair-result").textContent="新配對碼已建立。僅私下提供給已同意加入的電腦持有人。";
  }catch(e){$("pair-result").hidden=false;$("pair-result").textContent=e.message;}
  finally{button.disabled=false;button.textContent="＋ 產生一次性配對碼";}
 }
 async function copy(content){
  if(!content)return;
  try{
   await navigator.clipboard.writeText(content);notice("已複製，請透過私人方式交給裝置持有人。");
  }catch(e){notice("無法使用剪貼簿，請手動複製。");}
 }
 async function plan(n,kind,enable){
  if(busy)return;
  const warning=kind==="revoke"?"永久撤銷此裝置配對。原憑證將無法再使用。":
   kind==="inference"&&enable?"允許這台電腦處理其他使用者的模型提示；須先取得電腦持有人同意。":
   kind==="node"&&!enable?"停止節點承接新工作。":"此動作會修改 Slime 權限。";
  try{
   const obj=await api("plan",{node_id:n.id,operation:kind,enabled:enable});
   pending=obj.token;
   $("confirm-title").textContent=obj.title;
   $("confirm-description").textContent=warning+" 確認後才會寫入後端。";
   $("confirm-box").hidden=false;
   $("cancel").focus();
  }catch(e){notice(e.message);}
 }
 async function approve(){
  if(!pending||busy)return;
  busy=true;$("approve").disabled=true;
  const token=pending;pending=null;
  try{const obj=await api("confirm",{token});notice(obj.message);await reload();}
  catch(e){notice(e.message);}
  finally{busy=false;$("approve").disabled=false;$("confirm-box").hidden=true;}
 }
 if(!auth){
  $("welcome-splash").hidden=true;
  $("auth-block").hidden=false;
  $("service").textContent="需要 Telegram 簽署驗證";
  document.querySelectorAll("button").forEach(b=>b.disabled=true);
  $("installer").removeAttribute("href");
  return;
 }
 tg.ready();tg.expand();
 document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>setTab(btn.dataset.tab)));
 document.querySelectorAll("[data-go]").forEach(btn=>btn.addEventListener("click",()=>setTab(btn.dataset.go)));
 $("refresh").addEventListener("click",reload);
 $("issue").addEventListener("click",issue);
 $("copy-code").addEventListener("click",()=>copy(issued?.code));
 $("copy-link").addEventListener("click",()=>copy(issued?.link));
 $("approve").addEventListener("click",approve);
 function closeConfirm(){pending=null;$("confirm-box").hidden=true;}
 $("cancel").addEventListener("click",closeConfirm);
 // Opening a signed Mini App shows a welcome landing before the white workspace.
 // This is per-open visual state; no credentials or onboarding flags are stored.
 $("welcome-splash").hidden=false;
 $("welcome-start").addEventListener("click",()=>{
  $("welcome-splash").hidden=true;
  document.documentElement.classList.add("slime-white");
  document.documentElement.style.colorScheme="light";
  try{tg.setBackgroundColor?.("#ffffff");tg.setHeaderColor?.("#ffffff");tg.setBottomBarColor?.("#ffffff");}catch(e){}
  haptic();
  setTab("overview");
  void reload();
 });
 $("confirm-box").addEventListener("click",event=>{if(event.target===$("confirm-box"))closeConfirm();});
 document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!$("confirm-box").hidden){event.preventDefault();closeConfirm();}
  if(["ArrowLeft","ArrowRight"].includes(event.key)&&event.target?.matches?.('[role="tab"]')){
   const tabs=[...document.querySelectorAll("[data-tab]")],i=tabs.indexOf(event.target);
   if(i>=0){const next=tabs[(i+(event.key==="ArrowRight"?1:tabs.length-1))%tabs.length];setTab(next.dataset.tab);next.focus();}
  }
 });
})();
</script></body></html>"""


class Owner(BaseModel):
    init_data: str=Field(min_length=20,max_length=8192)


class Plan(Owner):
    node_id: str=Field(pattern=r"^[a-f0-9]{24}$")
    operation: str=Field(pattern=r"^(node|inference|revoke)$")
    enabled: bool=False


class Confirm(Owner):
    token: str=Field(pattern=r"^[a-f0-9]{48}$")


def _owner(init_data: str) -> tuple[int,str]:
    chat=_verify(init_data)
    sub=owner_subject(chat)
    if not sub:
        raise HTTPException(403,"Owner 授權未通過")
    return chat,sub


def _tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_slime_approval(
      digest TEXT PRIMARY KEY,chat_id INTEGER NOT NULL,owner_sub TEXT NOT NULL,
      node_id TEXT NOT NULL,operation TEXT NOT NULL,enabled INTEGER NOT NULL,
      expires_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_slime_invite_rate(
      chat_id INTEGER NOT NULL,issued_at INTEGER NOT NULL)""")


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
      "style-src 'nonce-"+nonce+"'; connect-src 'self'; img-src data:; frame-ancestors 'none'; "
      "base-uri 'none'; form-action 'none'")
    return response


@router.post("/snapshot")
def snapshot(body:Owner):
    chat,sub=_owner(body.init_data)
    _enabled()
    with _db() as db:
        records=db.execute("SELECT * FROM nodes WHERE owner=? ORDER BY label",(sub,)).fetchall()
    now=time.time()
    nodes=[{
      "id":r["id"],"label":r["label"],"role":r["role"],"os":r["os"],
      "gpu":r["gpu"],"ram_gb":r["ram_gb"],"cpu":r["cpu"],
      "online":now-r["last_seen"]<=ONLINE_SECONDS,
      "share_enabled":bool(r["share_enabled"]),
      "owner_enabled":bool(r["owner_enabled"]),
      "inference_enabled":bool(r["inference_enabled"])
    } for r in records]
    available=0
    if os.getenv("VANILLA_SLIME_RUNNER_ENABLED","false").lower()=="true":
        try:
            from slime_runner_bridge import catalog
            available=len(catalog(sub))
        except HTTPException:
            available=0
    return {"nodes":nodes,
        "counts":{"total":len(nodes),"online":sum(n["online"] for n in nodes),
                  "inferenceApproved":sum(n["inference_enabled"] for n in nodes),
                  "catalogModels":available},
        "publicInstaller":_pairing_page_url(),
        "service":{"configured":True,
                   "message":"Slime 節點管理已就緒 · 本地推論"+
                   ("可查詢，仍需實機驗收" if os.getenv("VANILLA_SLIME_RUNNER_ENABLED","false").lower()=="true"
                    else "目前關閉")+" · 對外 API "+
                   ("已開啟" if os.getenv("VANILLA_PUBLIC_API_ENABLED","false").lower()=="true" else "關閉")}}


@router.post("/issue")
def issue(body:Owner):
    chat,sub=_owner(body.init_data)
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        now=int(time.time())
        db.execute("DELETE FROM ceres_slime_invite_rate WHERE issued_at<?",(now-3600,))
        n=db.execute("SELECT COUNT(*) FROM ceres_slime_invite_rate WHERE chat_id=? AND issued_at>?",
                     (chat,now-3600)).fetchone()[0]
        if n>=8:
            raise HTTPException(429,"一小時最多產生 8 組配對碼")
        db.execute("INSERT INTO ceres_slime_invite_rate VALUES(?,?)",(chat,now))
    result=issue_short_pair(sub)
    # Generate the QR locally, only after signed Telegram Owner authentication.
    # Never send a one-time secret to a public QR provider.
    try:
        from qrcode import QRCode
        code=QRCode(box_size=7,border=3)
        code.add_data(result["link"])
        code.make(fit=True)
        output=io.BytesIO()
        code.make_image(fill_color="black",back_color="white").save(output,format="PNG")
        result["qr_data_uri"]="data:image/png;base64,"+base64.b64encode(output.getvalue()).decode("ascii")
    except (ImportError,ValueError,TypeError):
        result["qr_data_uri"]=None
    return result


@router.post("/plan")
def plan(body:Plan):
    chat,sub=_owner(body.init_data)
    _enabled()
    with _db() as db:
        row=db.execute("SELECT id,label FROM nodes WHERE id=? AND owner=?",
                       (body.node_id,sub)).fetchone()
    if not row:
        raise HTTPException(404,"找不到此 Owner 的節點")
    title={"node":"節點啟用／停用","inference":"模型推論授權","revoke":"永久撤銷節點"}[body.operation]
    token=secrets.token_hex(24)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ceres_slime_approval WHERE expires_at<?",(now,))
        db.execute("INSERT INTO ceres_slime_approval VALUES(?,?,?,?,?,?,?)",
                   (hashlib.sha256(token.encode()).hexdigest(),chat,sub,body.node_id,
                    body.operation,int(body.enabled),now+120))
    return {"token":token,"title":title+" · "+row["label"],"expiresSeconds":120}


@router.post("/confirm")
def confirm(body:Confirm):
    chat,sub=_owner(body.init_data)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("""SELECT * FROM ceres_slime_approval
               WHERE digest=? AND chat_id=? AND owner_sub=? AND expires_at>?""",
               (hashlib.sha256(body.token.encode()).hexdigest(),chat,sub,now)).fetchone()
        if row:
            db.execute("DELETE FROM ceres_slime_approval WHERE digest=?",(row["digest"],))
    if not row:
        raise HTTPException(409,"操作確認已過期、已使用或無權限")
    _enabled()
    with _db() as db:
        db.execute("BEGIN IMMEDIATE")
        if row["operation"]=="revoke":
            changed=db.execute("DELETE FROM nodes WHERE id=? AND owner=?",(row["node_id"],sub))
        elif row["operation"]=="node":
            changed=db.execute("UPDATE nodes SET owner_enabled=? WHERE id=? AND owner=?",
                               (row["enabled"],row["node_id"],sub))
        elif row["operation"]=="inference":
            changed=db.execute("UPDATE nodes SET inference_enabled=? WHERE id=? AND owner=?",
                               (row["enabled"],row["node_id"],sub))
        else:
            raise HTTPException(400,"不支援的操作")
        if not changed.rowcount:
            raise HTTPException(404,"節點已撤銷或不屬於此 Owner")
        # Slime uses sqlite isolation_level=None; after BEGIN IMMEDIATE an
        # explicit commit is mandatory. Otherwise closing silently rolls back.
        db.commit()
    return {"ok":True,"message":"已完成操作。重新整理節點狀態以確認結果。"}
