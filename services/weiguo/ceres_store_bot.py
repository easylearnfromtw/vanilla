"""Isolated public Telegram store bot. No owner tools, payments or API keys."""
from __future__ import annotations

import hmac
import json
import os
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from ceres_academy_curriculum import LESSONS, TOPICS, CHAPTERS
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter(prefix="/v1/ceres/store", tags=["ceres-store"])
PATH = "/v1/ceres/store/telegram/webhook"
TOKEN_RE = re.compile(r"^[0-9]{5,15}:[A-Za-z0-9_-]{30,80}$")
SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{32,256}$")
EXPECTED_USERNAME = "VanillaAPIStore_bot"


def _config():
    token = os.getenv("CERES_STORE_BOT_TOKEN", "")
    secret = os.getenv("CERES_STORE_WEBHOOK_SECRET", "")
    url = os.getenv("CERES_STORE_WEBHOOK_URL", "")
    if not TOKEN_RE.fullmatch(token) or not SECRET_RE.fullmatch(secret):
        return None
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname
            or parsed.hostname not in os.getenv("CERES_STORE_ALLOWED_HOSTS", "weiguo-browser-production.up.railway.app").split(",")
            or parsed.port is not None or parsed.username or parsed.password
            or parsed.path != PATH or parsed.query or parsed.fragment):
        return None
    return token, secret, url


async def register_store_webhook() -> bool:
    if os.getenv("CERES_STORE_REGISTER_WEBHOOK", "").lower() != "true":
        return False
    cfg = _config()
    if not cfg:
        print("Ceres Store: registration skipped (configuration incomplete)", flush=True)
        return False
    token, secret, url = cfg
    api = f"https://api.telegram.org/bot{token}/"
    try:
        async with httpx.AsyncClient(timeout=8, trust_env=False, follow_redirects=False) as client:
            identity = (await client.get(api + "getMe")).json()
            if identity.get("ok") is not True or identity.get("result", {}).get("username", "").lower() != EXPECTED_USERNAME.lower():
                print("Ceres Store: bot identity mismatch", flush=True)
                return False
            info = (await client.get(api + "getWebhookInfo")).json()
            previous = info.get("result", {}).get("url", "")
            if info.get("ok") is not True or previous not in ("", url):
                print("Ceres Store: existing different webhook; refusing override", flush=True)
                return False
            response = (await client.post(api + "setWebhook", json={
                "url": url, "secret_token": secret,
                "allowed_updates": ["message", "callback_query"], "drop_pending_updates": False
            })).json()
            if response.get("ok") is not True or response.get("result") is not True:
                raise ValueError("registration failed")
            verify = (await client.get(api + "getWebhookInfo")).json()
            if verify.get("ok") is not True or verify.get("result", {}).get("url") != url:
                raise ValueError("verification failed")
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        print("Ceres Store: webhook registration failed", flush=True)
        return False
    print("Ceres Store: webhook registration verified", flush=True)
    return True


def _claim(update_id: int) -> bool:
    path = Path(os.getenv("CERES_DB_PATH", "/tmp/ceres-events.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=10) as db:
        db.execute("CREATE TABLE IF NOT EXISTS ceres_store_updates (update_id INTEGER PRIMARY KEY, at INTEGER NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ceres_store_updates WHERE at < ?", (int(time.time()) - 14 * 86400,))
        cursor = db.execute("INSERT OR IGNORE INTO ceres_store_updates VALUES (?,?)", (update_id, int(time.time())))
        db.commit()
        return cursor.rowcount == 1



def _learning_state(chat_id):
    path=Path(os.getenv("CERES_DB_PATH","/tmp/ceres-events.sqlite3"))
    path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path,timeout=10)
    db.execute("CREATE TABLE IF NOT EXISTS store_learning (chat_id INTEGER PRIMARY KEY, level TEXT NOT NULL DEFAULT '', lesson INTEGER NOT NULL DEFAULT 0, mastered TEXT NOT NULL DEFAULT '[]')")
    row=db.execute("SELECT level,lesson,mastered FROM store_learning WHERE chat_id=?",(chat_id,)).fetchone()
    if row is None:
        db.execute("INSERT INTO store_learning(chat_id) VALUES(?)",(chat_id,))
        db.commit()
        row=("",0,"[]")
    return db,row
def _buttons(rows):
    return {"inline_keyboard":[[{"text":label,"callback_data":data} for label,data in row] for row in rows]}
async def _tg(method,data):
    token=os.environ["CERES_STORE_BOT_TOKEN"]
    async with httpx.AsyncClient(timeout=8,trust_env=False,follow_redirects=False) as client:
        response=await client.post(f"https://api.telegram.org/bot{token}/{method}",json=data)
        response.raise_for_status()
        if response.json().get("ok") is not True: raise ValueError("Telegram API error")
async def _send(chat_id,text,keyboard=None):
    await _tg("sendMessage",{"chat_id":chat_id,"text":text,"reply_markup":keyboard or _buttons([[("📚 開始學習 AI","learn:start")]])})
async def _learn(chat_id,action):
    db,row=_learning_state(chat_id)
    try:
        level,step,mastered_raw=row
        mastered=set(json.loads(mastered_raw))
        if action=="start":
            await _send(chat_id,"📚 Vanilla Academy\\n先選擇你的程度，我會調整推薦順序。",_buttons([
                [("零基礎","learn:level:0"),("入門","learn:level:1")],
                [("開發者","learn:level:2"),("進階","learn:level:3")]]))
            return
        if action.startswith("level:") and action[-1:] in ("0","1","2","3"):
            level=action[-1]
            step={"0":0,"1":54,"2":108,"3":162}[level]
            mastered=set()
        elif action=="next": step=min(step+1,len(LESSONS)-1)
        elif action=="prev": step=max(step-1,0)
        elif action=="master":
            mastered.add(step)
            candidates=[i for i in range(len(LESSONS)) if i not in mastered]
            if candidates:
                offset={"0":0,"1":54,"2":108,"3":162}.get(level,0)
                preferred=list(range(offset,len(LESSONS)))+list(range(offset))
                step=next(i for i in preferred if i in candidates)
                prefix="🎉 很棒！這一課已標記為學會。\\n依照你的程度與尚未完成的篇章，我推薦：\\n\\n"
            else:
                prefix="🎉 太棒了！你已完成目前所有篇章，可以重新選程度複習。\\n\\n"
        elif action=="recommend":
            candidates=[i for i in range(len(LESSONS)) if i not in mastered and i!=step]
            offset={"0":0,"1":54,"2":108,"3":162}.get(level,0)
                preferred=list(range(offset,len(LESSONS)))+list(range(offset))
            if candidates:
                step=next(i for i in preferred if i in candidates)
                prefix="✨ 根據你的程度及已完成篇章，推薦你閱讀：\\n\\n"
            else:
                prefix="你已完成其他篇章；可以重新分級複習。\\n\\n"
        elif action.startswith("go:") and action[3:].isdigit():
            step=min(int(action[3:]),len(LESSONS)-1)
        else:
            step=max(0,min(step,len(LESSONS)-1))
        db.execute("UPDATE store_learning SET level=?,lesson=?,mastered=? WHERE chat_id=?",
                   (level,step,json.dumps(sorted(mastered)),chat_id))
        db.commit()
        title,body,topic_idx,chapter_idx,stage_idx=LESSONS[step]
        prefix=locals().get("prefix","")
        await _send(chat_id,prefix+f"📖 {TOPICS[topic_idx]}\\n第 {chapter_idx+1}/6 章 · 第 {stage_idx+1}/9 課\\n{title} · 總課次 {step+1}/{len(LESSONS)}\\n\\n{body}\\n\\n進度：{len(mastered)}/{len(LESSONS)} 已學會",
                    _buttons([[("◀ 上一課","learn:prev"),("下一課 ▶","learn:next")],
                              [("✅ 這我會了","learn:master")],
                              [("📚 推薦其他篇章","learn:recommend"),("重新分級","learn:start")]]))
    finally:
        db.close()


@router.get("/app")
async def store_app():
    return FileResponse(Path(__file__).with_name("ceres_store_app.html"), media_type="text/html", headers={"Cache-Control": "no-store"})


@router.post("/telegram/webhook")
async def store_webhook(request: Request,
                        x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    cfg = _config()
    if cfg is None:
        raise HTTPException(503, "Store bot not configured")
    if not x_telegram_bot_api_secret_token or not hmac.compare_digest(x_telegram_bot_api_secret_token, cfg[1]):
        raise HTTPException(401, "Invalid webhook signature")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(415, "JSON required")
    raw = await request.body()
    if len(raw) > 16384:
        raise HTTPException(413, "Payload too large")
    try:
        update = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid JSON") from None
    if not isinstance(update, dict) or type(update.get("update_id")) is not int:
        raise HTTPException(400, "Invalid update")
    callback=update.get("callback_query")
    if isinstance(callback,dict):
        sender=callback.get("from") or {}
        msg=callback.get("message") or {}
        chat=msg.get("chat") or {}
        chat_id=chat.get("id")
        if (chat.get("type")=="private" and type(chat_id) is int
                and sender.get("id")==chat_id and not sender.get("is_bot")
                and isinstance(callback.get("data"),str) and callback["data"].startswith("learn:")):
            if _claim(update["update_id"]):
                await _learn(chat_id,callback["data"][6:])
            if isinstance(callback.get("id"),str):
                await _tg("answerCallbackQuery",{"callback_query_id":callback["id"]})
        return {"ok":True}
    message = update.get("message")
    if not isinstance(message, dict):
        return {"ok": True}
    chat, sender = message.get("chat"), message.get("from")
    if not isinstance(chat, dict) or not isinstance(sender, dict):
        return {"ok": True}
    chat_id = chat.get("id")
    if (chat.get("type") != "private" or type(chat_id) is not int
            or sender.get("id") != chat_id or sender.get("is_bot")):
        return {"ok": True}
    user_text=message.get("text","").strip() if isinstance(message.get("text"),str) else ""
    actions={"上一課":"prev","下一課":"next","這我會了":"master","推薦":"recommend","教學":"start"}
    if user_text in actions:
        if _claim(update["update_id"]):
            await _learn(chat_id,actions[user_text])
        return {"ok":True}
    command = message.get("text", "").split(maxsplit=1)[0].split("@")[0].lower() if isinstance(message.get("text"), str) else ""
    if command not in ("/start", "/help"):
        return {"ok": True}
    if not _claim(update["update_id"]):
        return {"ok": True}
    await _send(chat_id, "歡迎使用 Vanilla AI API Store！\n\n📚 點選「開始學習 AI」，依程度學習 October、AI Coding 與 API 串聯。\n\n模型、方案、API 金鑰與使用量功能即將開放。目前尚未開放付款，請勿匯款或提供敏感資料。")
    return {"ok": True}
