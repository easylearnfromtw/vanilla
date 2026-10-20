"""Ceres owner-only Telegram management. Telegram text is never a model/system instruction."""
from __future__ import annotations
import json
import os
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
        return
    # HTTP client errors must never leak token-containing URL into logs.
    try:
        async with httpx.AsyncClient(timeout=8,follow_redirects=False,trust_env=False) as client:
            await client.post("https://api.telegram.org/bot"+token+"/"+method,json=data)
    except httpx.HTTPError:
        return

async def say(chat: int, text: str, buttons: list[list[dict]]|None=None):
    data={"chat_id":chat,"text":text[:3500],"disable_web_page_preview":True}
    if buttons:
        data["reply_markup"]={"inline_keyboard":buttons}
    await _telegram("sendMessage",data)

def _btn(label: str, action: str):
    return {"text":label,"callback_data":"adm:"+action}

def _menu_buttons():
    return [[_btn("👥 Gmail 白名單","users"),_btn("🔌 API 服務","providers")],
            [_btn("🧠 AI 模型偵測與選擇","models")],
            [_btn("🔒 開啟白名單限制","on"),_btn("🔓 停用限制","off")],
            [_btn("🛡️ 管理狀態","status"),_btn("🔑 安全設定 API","vault")]]

def _guide():
    return ("Ceres 管理中心\n"
            "此處僅接受已綁定 Google Owner 的 Telegram 私聊。\n\n"
            "/admin users — 已授權 Gmail\n"
            "/admin allow email@gmail.com member chat,files — 授權帳號及功能\n"
            "/admin revoke email@gmail.com — 撤銷（需要按鈕確認）\n"
            "/admin providers — API 狀態\n"
            "/admin models — 已偵測模型、目前策略與所選版本\n"
            "/admin enable gemini — 啟用服務\n"
            "/admin disable canva — 停用服務\n"
            "/admin enforce on — 開啟 Gmail 白名單模式\n"
            "API Key 不可直接貼在 Telegram 聊天，請使用安全設定按鈕。")

async def _status(chat: int):
    users=accounts()
    active=sum(x["enabled"] for x in users)
    providers=provider_status()
    p="、".join(x["provider"]+(" ✓" if x["enabled"] and x["configured"] else " ·") for x in providers)
    await say(chat,f"Vanilla · 管理狀態\nGmail 白名單：{'強制' if enforce() else '尚未強制'}\n有效帳號：{active}\n服務：{p}",_menu_buttons())

async def _models(chat: int):
    rows=[]
    for provider in ("gemini","openai","deepseek"):
        item=catalog(provider)
        rows.append(provider+": "+str(len(item["models"]))+" 個可見模型"+
                    " · "+item["mode"]+" · "+(item["selected"] or "未偵測"))
    await say(chat,"AI 模型設定\n"+"\n".join(rows)+
              "\n\n版本由供應商官方清單取得；速度、均衡、品質採規則推薦，並非實際價格或效能評測。"+
              "\n透過安全表單重新偵測或手動選擇。",[
              [_btn("開啟安全模型設定","vault"),_btn("返回","menu")]])


async def _users(chat: int):
    entries=accounts()
    text="Gmail 白名單\n"+("\n".join(
        ("✓" if item["enabled"] else "×")+" "+item["email"]+" · "+item["role"]+
        " · "+",".join(item["scopes"]) for item in entries[:25]) if entries else "尚無帳號")
    await say(chat,text+"\n\n新增：/admin allow email@gmail.com member chat,files",[
        [_btn("返回管理選單","menu")]])

async def _providers(chat: int):
    entries=provider_status()
    text="外部服務狀態（不顯示金鑰）\n"+ "\n".join(
        x["provider"]+": "+("已啟用" if x["enabled"] else "關閉")+
        ("，已設定憑證" if x["configured"] else "，尚無憑證") for x in entries)
    buttons=[[_btn(("停用 " if x["enabled"] else "啟用 ")+x["provider"],
                    ("disable:" if x["enabled"] else "enable:")+x["provider"])]
             for x in entries]
    buttons.append([_btn("設定／輪替 API 金鑰","vault"),_btn("返回","menu")])
    await say(chat,text,buttons)

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
    await say(chat,"透過 Telegram 內開啟的 HTTPS 安全表單輸入 API Key。請勿把金鑰傳到聊天視窗。",[
        [{"text":"🔐 開啟安全憑證設定","web_app":{"url":url}}]])

async def command(chat: int, body: str):
    if not owner_subject(chat):
        return
    parts=body.strip().split()
    if not parts or parts[0].split("@")[0].lower() not in ("/admin","/manage"):
        return
    args=parts[1:]
    if not args or args[0] in ("menu","help"):
        await say(chat,_guide(),_menu_buttons());return
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
            await say(chat,"指令格式不正確。\n\n"+_guide(),_menu_buttons())
    except ValueError:
        await say(chat,"輸入格式不合法；請檢查 Email、角色或功能範圍。")

async def callback(chat: int, callback_id: str, data: str):
    if not owner_subject(chat):
        return
    if not data.startswith("adm:"):
        return
    await _telegram("answerCallbackQuery",{"callback_query_id":callback_id})
    action=data[4:]
    if action in ("menu","status","users","providers","models","vault"):
        if action=="menu": await say(chat,_guide(),_menu_buttons())
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
