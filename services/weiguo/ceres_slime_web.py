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
</style></head><body>
<header class="hero">
<div class="hub-top"><div class="hub-mark" aria-hidden="true">S</div><div class="hub-brand"><span class="eyebrow">CERES / OWNER STUDIO</span><b>SLIME NETWORK</b></div><span class="hub-private">◇ 私人控制台</span></div>
<div class="hero-copy"><span class="hero-kicker">● YOUR COMPUTE FABRIC</span>
<h1>算力，<br><span>盡在掌握。</span></h1><p>管理你的本地節點、模型權限與一次性配對。<br>僅限經過身分驗證的 Owner。</p></div>
<div class="hero-foot"><span>SLIME / CONTROL STUDIO</span><span>OWNER ONLY</span></div>
</header>
<nav class="tabs" role="tablist" aria-label="Slime 管理分頁">
<button role="tab" aria-selected="true" aria-controls="overview" data-tab="overview">總覽</button>
<button role="tab" aria-selected="false" aria-controls="devices" data-tab="devices">節點</button>
<button role="tab" aria-selected="false" aria-controls="pairing" data-tab="pairing">配對</button>
</nav>
<main>
<section id="overview" role="tabpanel">
<div class="card"><h2>網路概況</h2><p>統計來自 Slime 節點心跳；在線不代表實際推論成功。</p>
<div class="cards" style="margin-top:14px">
<div class="metric"><strong id="total">—</strong><span>已註冊裝置</span></div>
<div class="metric"><strong id="online">—</strong><span>目前在線</span></div>
<div class="metric"><strong id="approved">—</strong><span>已核准推論</span></div>
<div class="metric"><strong id="models">—</strong><span>已登錄可用模型</span></div>
</div>
<div class="controls"><button class="btn primary" id="refresh">↻ 重新整理</button>
<button class="btn" data-go="devices">管理節點 →</button></div></div>
<div class="card"><h2>執行狀態</h2><p id="service">正在確認後端服務…</p>
<p style="margin-top:8px">推論與公開 API 是不同的開關；新節點預設不會被授予推論權限。</p></div>
</section>
<section id="devices" role="tabpanel" hidden>
<div class="card"><h2>我的節點</h2><p>每台節點需要經過 Owner 授權。撤銷後原裝置 Token 立即失效。</p>
<div id="node-list" class="nodes"><p>正在讀取節點…</p></div></div>
</section>
<section id="pairing" role="tabpanel" hidden>
<div class="card"><h2>新增節點</h2><p>產生一次性 12 位短配對碼，供電腦首次啟動 Slime 時輸入。</p>
<div class="notice" style="margin-top:14px">只供本人或已同意加入的朋友使用。
配對碼有效 10 分鐘、只能使用一次；此頁不會讀取既有裝置的長期 Token。</div>
<div class="controls"><button id="issue" class="btn primary">＋ 產生短配對碼</button></div>
<div id="code-box" hidden><div class="code"><strong id="code">—</strong><small>10 分鐘後失效 · 一次性使用</small></div>
<div id="qr-box" class="qr" hidden><img id="qr-image" alt="Slime 配對 QR Code，包含本次一次性邀請" width="220" height="220"></div>
<div class="controls"><button id="copy-code" class="btn primary">複製配對碼</button>
<button id="copy-link" class="btn">複製邀請連結</button></div></div>
<p class="result" id="pair-result" role="status" aria-live="polite" hidden></p>
<div class="controls"><a id="installer" class="btn" href="#" target="_blank" rel="noopener noreferrer">↗ Slime 公開下載頁</a></div>
</div>
</section>
<div class="card" id="auth-block" hidden><h2>需要 Telegram 身分驗證</h2>
<p>請從已授權的 Ceres Owner 私聊使用「Slime 私人管理頁」按鈕開啟。
一般瀏覽器直接開啟網址不會取得管理權限。</p></div>
<div class="card" id="confirm-box" hidden><div class="confirm"><strong id="confirm-title">確認操作</strong>
<p id="confirm-description"></p>
<div class="controls"><button id="approve" class="btn danger">確認執行</button>
<button id="cancel" class="btn">取消</button></div></div></div>
<div id="message" class="result" role="status" aria-live="polite" hidden></div>
</main>
<script nonce="__NONCE__">
(function(){
 "use strict";
 const tg=window.Telegram?.WebApp;
 const auth=tg?.initData||"";
 const $=id=>document.getElementById(id);
 let nodes=[],issued=null,pending=null,busy=false;
 function notice(txt){$("message").hidden=false;$("message").textContent=String(txt);}
 function setTab(value){
   document.querySelectorAll("[data-tab]").forEach(btn=>btn.setAttribute("aria-selected",String(btn.dataset.tab===value)));
   ["overview","devices","pairing"].forEach(key=>$(key).hidden=key!==value);
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
   const badge=document.createElement("span");badge.className="state";badge.textContent=n.online?"● 在線":"○ 離線";
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
    button.className="btn"+(a.kind==="revoke"?" danger":"");button.textContent=a.label;
    button.addEventListener("click",()=>plan(n,a.kind,a.enable));ctr.append(button);
   });
   root.append(ctr);return root;
 }
 async function reload(){
  try{
   const data=await api("snapshot");
   nodes=data.nodes||[];
   $("total").textContent=String(data.counts.total);
   $("online").textContent=String(data.counts.online);
   $("approved").textContent=String(data.counts.inferenceApproved);
   $("models").textContent=String(data.counts.catalogModels);
   $("service").textContent=data.service.message;
   const list=$("node-list");list.replaceChildren();
   if(!nodes.length){const p=document.createElement("p");p.textContent="尚未註冊節點。可前往「配對」新增第一台電腦。";list.append(p);}
   else nodes.forEach(n=>list.append(nodeCard(n)));
   $("installer").href=data.publicInstaller;
  }catch(e){notice(e.message);}
 }
 async function issue(){
  const button=$("issue");button.disabled=true;$("pair-result").hidden=true;
  try{
   const obj=await api("issue");
   issued={code:obj.code,link:obj.link};
   $("code").textContent=issued.code;$("code-box").hidden=false;
   $("qr-box").hidden=!obj.qr_data_uri;
   if(obj.qr_data_uri)$("qr-image").src=obj.qr_data_uri;
   $("pair-result").hidden=false;
   $("pair-result").textContent="新配對碼已建立。僅私下提供給已同意加入的電腦持有人。";
  }catch(e){$("pair-result").hidden=false;$("pair-result").textContent=e.message;}
  finally{button.disabled=false;}
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
   $("confirm-box").scrollIntoView({block:"nearest"});
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
 $("cancel").addEventListener("click",()=>{pending=null;$("confirm-box").hidden=true;});
 void reload();
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
