"""Ceres owner-only Telegram management. Telegram text is never a model/system instruction."""
from __future__ import annotations
import json
import os
from contextvars import ContextVar
from html import escape
import re
import secrets
import time
from urllib.parse import urlsplit
import httpx
from ceres_gateway import _allowed_chat_ids, _session
from ceres_admin_policy import (accounts, enforce, grant, revoke, set_enforce,
                                provider_status, toggle_provider, role_for_sub)
from ceres_model_catalog import catalog

def owner_subject(chat_id: int) -> str|None:
    """Keep owner control separate from AI, username, forwarded text and Gmail display names."""
    if chat_id not in _allowed_chat_ids():
        return None
    try:
        links=json.loads(os.getenv("CERES_FAMILY_LINKS_JSON","{}"))
        acl=json.loads(os.getenv("WEIGUO_FAMILY_ACL_JSON","{}"))
    except (ValueError,TypeError):
        return None
    if not isinstance(links,dict) or not isinstance(acl,dict):
        return None
    sub=links.get(str(chat_id))
    if not isinstance(sub,str) or not re.fullmatch(r"[0-9]{8,40}",sub):
        return None
    if isinstance(acl.get(sub),dict) and acl[sub].get("role")=="owner":
        return sub
    record=role_for_sub(sub)
    return sub if record and record[1]=="owner" else None

async def _telegram(method: str, data: dict) -> None:
    token=os.getenv("CERES_TELEGRAM_BOT_TOKEN","")
    if not re.fullmatch(r"[0-9]{5,15}:[A-Za-z0-9_-]{30,80}",token):
        print("Ceres Telegram send: unconfigured",flush=True)
        return False
    # Never log the token-bearing URL, payload, chat ID, response body or exception.
    try:
        async with httpx.AsyncClient(timeout=8,follow_redirects=False,trust_env=False) as client:
            response=await client.post("https://api.telegram.org/bot"+token+"/"+method,json=data)
        if response.status_code!=200:
            if method=="editMessageText" and response.status_code==400:
                # Idempotent refresh: Telegram may reject unchanged edits;
                # treat that as success rather than creating duplicate cards.
                try:
                    desc=response.json().get("description","")
                    if isinstance(desc,str) and "message is not modified" in desc.lower():
                        return True
                except (ValueError,TypeError,AttributeError):
                    pass
            print("Ceres Telegram send: provider_http_"+str(response.status_code),flush=True)
            return False
        try:
            accepted=response.json().get("ok") is True
        except (ValueError,AttributeError,TypeError):
            accepted=False
        if not accepted:
            print("Ceres Telegram send: provider_rejected",flush=True)
        return accepted
    except httpx.HTTPError:
        print("Ceres Telegram send: network_failure",flush=True)
        return False

_edit_target: ContextVar[int | None] = ContextVar("ceres_native_edit", default=None)

async def say(chat: int, text: str, buttons: list[list[dict]]|None=None, *, html: bool=False):
    data={"chat_id":chat,"text":text[:3500],"disable_web_page_preview":True}
    if html:
        data["parse_mode"]="HTML"
    if buttons:
        data["reply_markup"]={"inline_keyboard":buttons}
    mid=_edit_target.get()
    if type(mid) is int and mid>0:
        if await _telegram("editMessageText",{**data,"message_id":mid}):
            return True
    return bool(await _telegram("sendMessage",data))

def _title(name: str) -> str:
    return "✦ <b>C E R E S</b>\n<code>VANILLA / DETROIT</code>\n━━━━━━━━━━━━━━━━\n<b>"+escape(name)+"</b>\n\n"

def _back(action: str="menu", refresh: str | None=None):
    row=[]
    if refresh: row.append(_btn("↻ 更新",refresh))
    row.append(_btn("← 返回",action))
    return [row]

def _btn(label: str, action: str):
    return {"text":label,"callback_data":"adm:"+action}

def _menu_buttons():
    return [
        [_btn("◉ 管理狀態","status"),_btn("▣ AI 模型","models")],
        [_btn("◎ Gmail 帳號","users"),_btn("◇ API 服務","providers")],
        [_btn("🔐 安全憑證","vault")],
        [_btn("啟用白名單","on"),_btn("停用白名單","off")],
    ]

def _guide():
    return (_title("OWNER / 管理中心")
            +"所有管理都在 Telegram 私聊內進行。\n"
            +"從下方選擇功能，檢視狀態或調整設定。\n\n"
            +"<b>快速指令</b>\n"
            +"<code>/admin allow email@gmail.com member chat,files</code>\n"
            +"<code>/admin revoke email@gmail.com</code>\n\n"
            +"🔐 API 金鑰請透過加密表單輸入，勿貼在聊天訊息。\n"
            +"<i>僅供已綁定 Google Owner 使用。</i>")

async def _status(chat: int):
    users=accounts()
    active=sum(x["enabled"] for x in users)
    lines=[]
    for p in provider_status():
        state="● 已啟用" if p["enabled"] and p["configured"] else "○ 待配置"
        lines.append("  "+escape(p["provider"].title())+"  "+state)
    text=(_title("SYSTEM / 管理狀態")
          +"<b>白名單模式</b>  "+("● 強制啟用" if enforce() else "○ 未強制")+"\n"
          +"<b>授權帳號</b>  <code>"+str(active)+"</code>\n\n"
          +"<b>API 供應商</b>\n"+("\n".join(lines) if lines else "尚無設定")+"\n\n"
          +"<i>此處是配置快照，非模型端對端測試。</i>")
    await say(chat,text,_back(refresh="status"),html=True)


async def _models(chat: int):
    rows=[]
    for provider in ("gemini","openai","deepseek"):
        item=catalog(provider)
        rows.append("<b>"+escape(provider.title())+"</b> · "+str(len(item["models"]))+" 個可見版本\n"
                    +"  <code>"+escape(item["selected"] or "未偵測")+"</code>\n"
                    +"  策略："+escape(item["mode"]))
    await say(chat,_title("MODELS / AI 模型")
              +"\n\n".join(rows)
              +"\n\n<i>可見清單不等於實際推論成功；實測請透過安全設定。</i>",
              [[_btn("🔐 開啟安全模型設定","vault")],
               [_btn("↻ 更新","models"),_btn("← 返回","menu")]],html=True)


async def _users(chat: int):
    entries=accounts()
    lines=[("● " if item["enabled"] else "○ ")
           +"<code>"+escape(item["email"])+"</code>\n"
           +"  "+escape(item["role"])+" · "+escape(", ".join(item["scopes"]))
           for item in entries[:20]]
    remainder=("\n…另有 "+str(len(entries)-20)+" 位帳號未列出" if len(entries)>20 else "")
    text=(_title("ACCESS / Gmail 白名單")
          +"<b>已授權帳號</b> · "+str(len(entries))+"\n\n"
          +("\n\n".join(lines) if lines else "尚無帳號")
          +remainder+"\n\n"
          +"新增指令：\n<code>/admin allow email@gmail.com member chat,files</code>")
    await say(chat,text,_back(refresh="users"),html=True)


async def _providers(chat: int):
    entries=provider_status()
    lines=[]
    for p in entries:
        state=("● 已連接" if p["enabled"] and p["configured"]
               else ("◐ 已停用" if not p["enabled"] else "○ 尚無憑證"))
        lines.append("<b>"+escape(p["provider"].title())+"</b>  "+state)
    buttons=[[_btn(("停用 " if x["enabled"] else "啟用 ")+x["provider"],
                    ("disable:" if x["enabled"] else "enable:")+x["provider"])]
             for x in entries]
    buttons.extend([[_btn("🔐 安全設定／更新 API 金鑰","vault")],
                    [_btn("↻ 更新","providers"),_btn("← 返回","menu")]])
    await say(chat,_title("PROVIDERS / API 供應商")
              +"\n".join(lines)
              +"\n\n<i>不會顯示金鑰；狀態不代表 API 已成功推論。</i>",
              buttons,html=True)


def _pending(chat: int, op: str, target: str) -> str:
    token=secrets.token_urlsafe(12)
    with _session() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_pending
          (token TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, op TEXT NOT NULL,
           target TEXT NOT NULL, expires_at INTEGER NOT NULL)""")
        db.execute("DELETE FROM ceres_admin_pending WHERE expires_at<?",(int(time.time()),))
        db.execute("INSERT INTO ceres_admin_pending VALUES(?,?,?,?,?)",(token,chat,op,target,int(time.time())+120))
        db.commit()
    return token

def _consume_pending(chat: int, token: str):
    with _session() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_pending
          (token TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, op TEXT NOT NULL,
           target TEXT NOT NULL, expires_at INTEGER NOT NULL)""")
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT * FROM ceres_admin_pending WHERE token=? AND chat_id=? AND expires_at>?",
                       (token,chat,int(time.time()))).fetchone()
        db.execute("DELETE FROM ceres_admin_pending WHERE token=?",(token,))
        return (row["op"],row["target"]) if row else None

async def _vault(chat: int):
    url=os.getenv("CERES_ADMIN_WEBAPP_URL","").strip()
    parts=urlsplit(url)
    if (parts.scheme!="https" or not parts.hostname or parts.username or parts.password
            or parts.query or parts.fragment or parts.path!="/v1/ceres/admin/webapp"):
        await say(chat,"安全 API 設定頁尚未配置。管理員需先在 Railway 設定 CERES_ADMIN_WEBAPP_URL 與 WEIGUO_VAULT_KEY。")
        return
    await say(chat,_title("VAULT / 安全憑證")
              +"所有 API Key 只會透過 HTTPS 表單送至加密保管庫。\n"
              +"<i>請勿在 Telegram 聊天訊息中貼出金鑰。</i>",
              [[{"text":"🔐 開啟加密設定頁","web_app":{"url":url}}],
               [_btn("← 返回管理中心","menu")]],html=True)

async def command(chat: int, body: str):
    if not owner_subject(chat):
        return
    parts=body.strip().split()
    if not parts or parts[0].split("@")[0].lower() not in ("/admin","/manage"):
        return
    args=parts[1:]
    if not args or args[0] in ("menu","help"):
        await say(chat,_guide(),_menu_buttons(),html=True);return
    action=args[0].lower()
    try:
        if action=="status": await _status(chat)
        elif action=="users": await _users(chat)
        elif action=="providers": await _providers(chat)
        elif action=="models": await _models(chat)
        elif action=="vault": await _vault(chat)
        elif action=="allow" and len(args)==4:
            grant(args[1],args[2],args[3].lower().split(","),chat)
            await say(chat,"已新增／更新 Gmail 白名單。生效時仍必須通過 Google OIDC 驗證。")
        elif action=="revoke" and len(args)==2:
            target=args[1].lower()
            token=_pending(chat,"revoke",target)
            await say(chat,"確認撤銷："+target+"？現有短期登入權限將在下次 API 驗證時失效。",[
                [_btn("確認撤銷","confirm:"+token),_btn("取消","menu")]])
        elif action=="enforce" and len(args)==2 and args[1] in ("on","off"):
            if args[1]=="on" and not any(x["enabled"] and x["role"]=="owner" for x in accounts()):
                await say(chat,"先將自己的 Google 信箱加入白名單並設為 owner，再開啟強制限制。")
            else:
                token=_pending(chat,"enforce",args[1])
                await say(chat,"確定將 Gmail 白名單模式設為 "+args[1]+"？",[
                    [_btn("確認","confirm:"+token),_btn("取消","menu")]])
        elif action in ("enable","disable") and len(args)==2:
            toggle_provider(args[1].lower(),action=="enable",chat)
            await _providers(chat)
        else:
            await say(chat,"指令格式不正確。\n\n"+_guide(),_menu_buttons(),html=True)
    except ValueError:
        await say(chat,"輸入格式不合法；請檢查 Email、角色或功能範圍。")

async def callback(chat: int, callback_id: str, data: str, message_id: int | None=None):
    if not owner_subject(chat) or not data.startswith("adm:"):
        return
    await _telegram("answerCallbackQuery",{"callback_query_id":callback_id})
    token=_edit_target.set(message_id if type(message_id) is int and message_id>0 else None)
    try:
        await _handle_callback(chat,data[4:])
    finally:
        _edit_target.reset(token)


async def _handle_callback(chat: int, action: str):
    if action in ("menu","status","users","providers","models","vault"):
        if action=="menu": await say(chat,_guide(),_menu_buttons(),html=True)
        elif action=="status": await _status(chat)
        elif action=="users": await _users(chat)
        elif action=="providers": await _providers(chat)
        elif action=="models": await _models(chat)
        else: await _vault(chat)
    elif action in ("on","off"):
        await command(chat,"/admin enforce "+action)
    elif action.startswith(("enable:","disable:")):
        op,name=action.split(":",1)
        await command(chat,"/admin "+op+" "+name)
    elif action.startswith("confirm:"):
        pending=_consume_pending(chat,action[8:])
        if not pending:
            await say(chat,"確認已失效，請重新操作。");return
        op,target=pending
        if op=="revoke":
            try:
                revoke(target,chat)
                await say(chat,"帳號已撤銷："+target)
            except ValueError:
                await say(chat,"帳號格式錯誤。")
        elif op=="enforce":
            # Recheck at confirmation time to prevent accidental owner lockout.
            if target=="on" and not any(x["enabled"] and x["role"]=="owner" for x in accounts()):
                await say(chat,"拒絕啟用：沒有已授權的 owner。");return
            set_enforce(target=="on",chat)
            await _status(chat)
