"""Offline, browser-based Slime onboarding success screen.

Only invoked by the desktop entry point after a valid WeiGuo pair response has
been atomically saved. The HTML contains NO bearer token, invite or credential.
It is a static snapshot; never claim a running runner or approved inference.
"""
from __future__ import annotations

import html
import os
from pathlib import Path
import re
import tempfile
import time
import webbrowser

_NODE_ID = re.compile(r"^[a-f0-9]{24}$")
_PAGE = r"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'">
<title>節點配對成功 · Slime</title>
<style>
:root{color-scheme:light;--bg:#f7f7f8;--surface:#fff;--text:#171719;--sub:#76767f;--line:#e7e7eb;--ink:#19191c;--good:#137a55;--soft:#f1f1f3;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","PingFang TC",sans-serif}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
button,a{font:inherit}a:focus-visible,button:focus-visible{outline:3px solid #888;outline-offset:3px}
.layout{max-width:750px;margin:auto;padding:clamp(22px,5vw,48px) 18px 70px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:800;letter-spacing:.07em}
.mark{display:grid;place-items:center;background:var(--ink);color:#fff;border-radius:13px;width:39px;height:39px;font-size:21px;font-weight:800}
.private{font-size:11px;color:var(--sub);border:1px solid var(--line);padding:7px 12px;border-radius:999px;background:#fff}
.main{border-radius:30px;background:var(--surface);border:1px solid var(--line);padding:clamp(24px,7vw,53px);text-align:center;margin-top:31px;box-shadow:0 22px 52px rgba(12,12,16,.035)}
.check{width:84px;height:84px;display:grid;place-items:center;margin:1px auto 25px;border-radius:50%;background:#e8f6ee;box-shadow:0 0 0 10px #f4faf6}
.check svg{width:41px;height:41px;stroke:var(--good);stroke-width:3.7;fill:none;stroke-linecap:round;stroke-linejoin:round}
@media(prefers-reduced-motion:no-preference){
.check{animation:enter .55s cubic-bezier(.2,1,.3,1) both}.check svg{stroke-dasharray:75;stroke-dashoffset:75;animation:draw .6s ease-out .25s forwards}
@keyframes enter{from{transform:scale(.62);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes draw{to{stroke-dashoffset:0}}}
.eyebrow{font-size:11px;letter-spacing:.17em;color:var(--good);font-weight:800}
h1{font-size:clamp(32px,6vw,49px);letter-spacing:-.06em;line-height:1.18;margin:13px 0 13px;font-weight:820}
.lead{color:var(--sub);max-width:465px;margin:0 auto;font-size:14px;line-height:1.9}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:29px 0 0}
.step{border-radius:13px;background:var(--soft);padding:11px 6px;font-size:11px;font-weight:750;color:#606068}
.step.done{background:#ebf6f0;color:var(--good)}
.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;text-align:left}
.tile{background:#fff;border:1px solid var(--line);border-radius:17px;padding:18px 19px;min-width:0}
.tile.wide{grid-column:1/-1}.k{display:block;font-size:11px;color:var(--sub);font-weight:650;margin-bottom:5px}
.v{display:block;font-size:14px;font-weight:750;overflow-wrap:anywhere}
.node-id{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.035em}
.id-line{display:flex;align-items:center;justify-content:space-between;gap:12px}
.copy{border:1px solid var(--line);background:var(--soft);color:var(--ink);padding:8px 12px;border-radius:10px;font-size:11px;cursor:pointer;white-space:nowrap}
.next{border-radius:24px;background:var(--surface);border:1px solid var(--line);margin-top:16px;padding:25px 27px}
.smalltag{display:block;font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--sub);margin-bottom:6px}
.next h2{font-size:19px;margin:0 0 10px;letter-spacing:-.035em}
.next p{font-size:13px;color:var(--sub);line-height:1.85;margin:0}
.next ol{padding-left:20px;font-size:13px;line-height:2;color:#45454c;margin:12px 0 0}
.note{display:flex;gap:12px;align-items:flex-start;border-radius:16px;background:var(--soft);padding:17px 20px;margin-top:15px;font-size:12px;color:#67676f}
.note strong{color:var(--ink)}.bullet{background:var(--ink);width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:7px}
.foot{color:#97979f;text-align:center;font-size:11px;margin-top:25px}
@media(max-width:530px){.details{grid-template-columns:1fr}.tile.wide{grid-column:auto}.steps{gap:5px}.step{font-size:10px;padding:9px 4px}.main{border-radius:24px}.next{padding:21px}}
</style>
</head>
<body>
<div class="layout">
<header class="top"><div class="brand"><span class="mark">S</span><span>SLIME <span style="font-weight:500;color:#94949a">/ VANILLA</span></span></div><span class="private">DEVICE ONBOARDING</span></header>
<main>
<section class="main" aria-labelledby="title">
<div class="check" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m10 25 10 9 19-21"/></svg></div>
<div class="eyebrow">SETUP COMPLETED</div>
<h1 id="title">節點配對成功！</h1>
<p class="lead">這台電腦已完成 Slime 節點註冊，專屬裝置憑證已安全保存在本機。你可以返回 Slime 程式繼續連線。</p>
<div class="steps"><div class="step done">✓ 安裝啟動</div><div class="step done">✓ 配對完成</div><div class="step">03 · 啟動服務</div></div>
</section>
<section class="details" aria-label="本次配對資料">
<div class="tile"><span class="k">節點名稱</span><strong class="v">__NODE_NAME__</strong></div>
<div class="tile"><span class="k">節點身分</span><strong class="v">__ROLE__</strong></div>
<div class="tile wide"><span class="k">節點識別碼</span><div class="id-line"><strong id="nodeid" class="v node-id">__NODE_ID__</strong><button class="copy" id="copy" type="button">複製 ID</button></div></div>
<div class="tile"><span class="k">配對狀態</span><strong class="v" style="color:var(--good)">● 已完成註冊</strong></div>
<div class="tile"><span class="k">建立時間（裝置本地）</span><strong class="v">__TIME__</strong></div>
</section>
<section class="next"><span class="smalltag">NEXT / 接下來</span><h2>你的節點已準備好開始連線</h2>
<ol>
<li>返回剛剛啟動的 Slime 程式，讓節點持續回報狀態。</li>
<li>管理員可在 Ceres Telegram 私人管理頁確認這台裝置。</li>
<li>若管理員已開啟獎勵，系統會另外開啟 Google 登入領獎頁。每個帳號與每台節點首次可領一次，預設 100,000 Token，實際額度依管理員設定。也可日後從 Slime 程式執行 <code>--reward</code> 重新取得領獎連結。</li>
<li>模型推論需要裝置持有人同意及管理員另外核准；配對成功不代表已啟用推論。</li>
</ol></section>
<div class="note"><span class="bullet"></span><span><strong>安全提醒</strong>：這是本次配對完成的離線紀錄頁面，並非即時線上狀態。可隨時停止 Slime，或在本機執行 <code>--leave</code> 自行退出；不需要管理員的 Telegram 刪除碼。</span></div>
</main>
<footer class="foot">SLIME NETWORK · VANILLA AI · 無外部追蹤與網路請求</footer>
</div>
<script>
(function(){
 "use strict";
 var button=document.getElementById("copy"),target=document.getElementById("nodeid");
 button.addEventListener("click",function(){
   var value=target.textContent||"";
   if(navigator.clipboard&&navigator.clipboard.writeText){
     navigator.clipboard.writeText(value).then(function(){button.textContent="已複製";},
       function(){button.textContent="請手動選取 ID";});
   }else{
     var range=document.createRange();range.selectNodeContents(target);
     var selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
     button.textContent="請手動複製";
   }
 });
})();
</script>
</body>
</html>"""


def render_success(profile: dict, created_at: str | None = None) -> str:
    """Render only public, validated node metadata. Never interpolate secrets."""
    node_id = profile.get("node_id")
    role = profile.get("role")
    label = profile.get("label")
    if not isinstance(node_id, str) or not _NODE_ID.fullmatch(node_id):
        raise ValueError("不正確的節點 ID，不能顯示成功畫面")
    if role not in ("friend", "owner") or not isinstance(label, str) or not 1 <= len(label) <= 64:
        raise ValueError("節點資料無效")
    values = {
        "__NODE_ID__": node_id,
        "__NODE_NAME__": html.escape(label, quote=True),
        "__ROLE__": "我的電腦" if role == "owner" else "朋友共享節點",
        "__TIME__": html.escape(created_at or time.strftime("%Y-%m-%d %H:%M")),
    }
    page = _PAGE
    for key, value in values.items():
        page = page.replace(key, value)
    return page


def open_success(profile: dict) -> bool:
    """Best-effort browser UI. Browser failure never undoes successful pairing."""
    page = render_success(profile)
    directory = Path.home() / ".vanilla" / "slime"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / ("success-" + profile["role"] + ".html")
    fd, name = tempfile.mkstemp(prefix=".slime-success-", suffix=".html", dir=directory)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(page)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    try:
        opened = webbrowser.open_new_tab(path.as_uri())
    except Exception:
        opened = False
    if not opened:
        print("已完成配對。請在瀏覽器開啟本機成功頁："+str(path))
    return bool(opened)
