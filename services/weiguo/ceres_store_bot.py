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
from ceres_academy_enriched import lesson_text, quiz_text
from ceres_academy_content import render_lesson
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




def _release_claim(update_id: int) -> None:
    """Allow Telegram to retry a failed delivery after dedupe insertion."""
    path = Path(os.getenv("CERES_DB_PATH", "/tmp/ceres-events.sqlite3"))
    with sqlite3.connect(path, timeout=10) as db:
        db.execute("DELETE FROM ceres_store_updates WHERE update_id=?", (update_id,))
        db.commit()


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
def _message_chunks(text: str, limit: int = 3600) -> list[str]:
    """Telegram sendMessage supports up to 4096 chars; split on real line breaks."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Empty Telegram message")
    chunks = []
    current = ""
    for line in text.splitlines(keepends=True):
        if len(line) > limit:
            if current:
                chunks.append(current.rstrip("\n"))
                current = ""
            while len(line) > limit:
                chunks.append(line[:limit])
                line = line[limit:]
        if len(current) + len(line) > limit and current:
            chunks.append(current.rstrip("\n"))
            current = ""
        current += line
    if current:
        chunks.append(current.rstrip("\n"))
    return chunks

async def _send(chat_id, text, keyboard=None):
    chunks = _message_chunks(text)
    for i, chunk in enumerate(chunks):
        data = {"chat_id": chat_id, "text": chunk}
        if i == len(chunks) - 1:
            data["reply_markup"] = keyboard if keyboard is not None else _buttons([[("📚 開始學習 AI", "learn:start")]])
        await _tg("sendMessage", data)

def _hub_keyboard():
    return _buttons([
        [("◈ Academy · 學習中心","hub:academy"),("◇ Models · 模型","hub:models")],
        [("⌘ API Store","hub:api"),("▤ Usage · 用量","hub:usage")],
        [("◉ Account · 帳戶","hub:account"),("⚙ Settings","hub:settings")]
    ])

async def _hub(chat_id,section="home"):
    pages={
        "home":("VANILLA  /  AI PLATFORM","歡迎回到 Vanilla。\n\n選擇下方功能，直接在 Telegram 探索與學習。\n目前不開放付款或 API 金鑰申請。"),
        "models":("MODELS  /  模型探索","模型清單與即時版本資訊尚未在此 Bot 開放。\n正式提供前不顯示虛構模型或價格。"),
        "api":("API STORE  /  服務中心","API 方案、金鑰申請及付款目前尚未開放。\n請勿在聊天室傳送 API Key 或其他機密。"),
        "usage":("USAGE  /  使用紀錄","用量儀表板尚未串接至公開 Bot。\n目前沒有可驗證的個人 Token 使用數據。"),
        "account":("ACCOUNT  /  個人中心","此 Bot 目前僅記錄 Academy 的學習進度。\n尚未提供正式帳號管理及權限編輯。"),
        "settings":("SETTINGS  /  偏好設定","可在 Academy 選擇學習程度。\n其他設定將在後端權限與儲存機制完成後開放。")
    }
    heading,body=pages.get(section,pages["home"])
    if section=="api":
        await _send(chat_id,"API STORE  /  邀請制測試\n━━━━━━━━━━━━\n\n目前僅接受白名單測試，模型推論尚未開放。\n請勿在聊天室傳送 API Key。",_buttons([[("✦ 測試資格說明","api:apply")],[("〈 返回主選單","hub:home")]]))
        return
    if section=="home":
        await _send(chat_id,f"{heading}\n━━━━━━━━━━━━\n\n{body}",_hub_keyboard())
    else:
        await _send(chat_id,f"{heading}\n━━━━━━━━━━━━\n\n{body}",_buttons([[("〈 返回主選單","hub:home")]]))

def _safe_mastered(raw: str) -> set[int]:
    try:
        values = json.loads(raw)
    except (ValueError, TypeError):
        return set()
    if not isinstance(values, list):
        return set()
    return {i for i in values if type(i) is int and 0 <= i < len(LESSONS)}

def _next_pending(mastered: set[int], start: int, exclude: int | None = None) -> int | None:
    for i in list(range(start, len(LESSONS))) + list(range(start)):
        if i not in mastered and i != exclude:
            return i
    return None

def _lesson_keyboard(step: int):
    return _buttons([
        [("◀ 上一課", "learn:prev"), ("下一課 ▶", "learn:next")],
        [("🧩 課後測驗", "learn:quiz"), ("✅ 這我會了", "learn:master")],
        [("✦ 推薦篇章", "learn:recommend"), ("☷ 課程目錄", "learn:catalog")],
        [("◈ 更改程度", "learn:start"), ("⌂ 主選單", "hub:home")],
    ])

async def _learn(chat_id, action):
    db, row = _learning_state(chat_id)
    try:
        level, step, mastered_raw = row
        mastered = _safe_mastered(mastered_raw)
        step = max(0, min(int(step), len(LESSONS) - 1))
        prefix = ""
        if action == "start":
            await _send(chat_id,
                "ACADEMY / 學習中心\n━━━━━━━━━━━━\n\n請選擇你的學習程度。\n"
                "相同的 324 課，不同的深度提示；切換程度不會清除學習進度。\n"
                "6 大主題 · 36 章節 · 324 課",
                _buttons([
                    [("零基礎", "learn:level:0"), ("入門", "learn:level:1")],
                    [("開發者", "learn:level:2"), ("進階", "learn:level:3")],
                    [("☷ 課程目錄", "learn:catalog"), ("⌂ 主選單", "hub:home")],
                ]))
            return
        if action == "catalog":
            rows = [
                [(TOPICS[i], f"learn:topic:{i}") for i in range(j, min(j + 2, len(TOPICS)))]
                for j in range(0, len(TOPICS), 2)
            ]
            rows.append([("◈ 返回目前課程", "learn:view")])
            await _send(chat_id, "ACADEMY / 章節目錄\n\n6 大主題 · 36 章節\n請選擇主題查看各章。", _buttons(rows))
            return
        if action.startswith("topic:") and action[6:].isdigit():
            topic = int(action[6:])
            if not 0 <= topic < len(TOPICS):
                return
            rows = [
                [(CHAPTERS[topic][j], f"learn:chapter:{topic * 6 + j}")]
                for j in range(6)
            ]
            rows.append([("〈 返回目錄", "learn:catalog")])
            await _send(chat_id, f"ACADEMY / {TOPICS[topic]}\n\n選擇要學習的章節，每章 9 課。", _buttons(rows))
            return
        if action in ("quiz", "answer"):
            await _send(chat_id, quiz_text(step, reveal=action == "answer"), _buttons([
                [("✅ 顯示解析", "learn:answer")] if action == "quiz" else [("✅ 我學會了", "learn:master")],
                [("〈 返回課程", "learn:view"), ("下一課 ▶", "learn:next")],
            ]))
            return
        if action.startswith("level:") and action[6:] in ("0", "1", "2", "3"):
            level = action[6:]
            # Level changes alter instruction depth, not topic or prior progress.
            step = _next_pending(mastered, 0)
            step = step if step is not None else 0
        elif action.startswith("chapter:") and action[8:].isdigit():
            chapter_id = int(action[8:])
            if not 0 <= chapter_id < 36:
                return
            step = chapter_id * 9
        elif action == "next":
            step = min(step + 1, len(LESSONS) - 1)
        elif action == "prev":
            step = max(step - 1, 0)
        elif action == "master":
            mastered.add(step)
            following = _next_pending(mastered, (step + 1) % len(LESSONS))
            if following is not None:
                step = following
                prefix = "✅ 本課已標記完成！\n接著學習下一個未完成單元。\n\n"
            else:
                prefix = "🎉 你已完成全部 324 課，可用目錄自由複習。\n\n"
        elif action == "recommend":
            recommended = _next_pending(mastered, (step + 1) % len(LESSONS), exclude=step)
            if recommended is not None:
                step = recommended
                prefix = "✦ 根據未完成課程推薦\n\n"
            else:
                prefix = "已沒有其他未完成課程，顯示目前課程。\n\n"
        elif action.startswith("go:") and action[3:].isdigit():
            step = min(int(action[3:]), len(LESSONS) - 1)

        body = lesson_text(step, level)
        message = prefix + body + f"\n\n━━━━━━━━━━━━\n已學會：{len(mastered)} / {len(LESSONS)}"
        # Do not advance saved progress if sending the lesson failed.
        await _send(chat_id, message, _lesson_keyboard(step))
        db.execute("UPDATE store_learning SET level=?,lesson=?,mastered=? WHERE chat_id=?",
                   (level, step, json.dumps(sorted(mastered)), chat_id))
        db.commit()
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

    callback = update.get("callback_query")
    if isinstance(callback, dict):
        sender = callback.get("from") or {}
        msg = callback.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        callback_id = callback.get("id")
        # Ack immediately: Telegram displays a loading spinner until this returns.
        if isinstance(callback_id, str):
            try:
                await _tg("answerCallbackQuery", {"callback_query_id": callback_id})
            except (httpx.HTTPError, ValueError):
                pass
        data = callback.get("data")
        if (chat.get("type") == "private" and type(chat_id) is int
                and sender.get("id") == chat_id and not sender.get("is_bot")
                and isinstance(data, str) and len(data) <= 64
                and data.startswith(("learn:", "hub:", "api:"))):
            if _claim(update["update_id"]):
                try:
                    if data == "api:apply":
                        await _send(chat_id,
                            "API ACCESS / 申請說明\n\n目前尚未啟用申請，請勿傳送金鑰。",
                            _buttons([[("〈 返回主選單", "hub:home")]]))
                    elif data.startswith("hub:"):
                        destination = data[4:]
                        if destination == "academy":
                            await _learn(chat_id, "start")
                        else:
                            await _hub(chat_id, destination)
                    else:
                        await _learn(chat_id, data[6:])
                except (httpx.HTTPError, ValueError, sqlite3.Error):
                    _release_claim(update["update_id"])
                    raise HTTPException(503, "Telegram lesson delivery failed") from None
        return {"ok": True}

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
    actions={"上一課":"prev","下一課":"next","這我會了":"master","推薦":"recommend","教學":"start","課程目錄":"catalog","測驗":"quiz"}
    if user_text in actions:
        if _claim(update["update_id"]):
            try:
                await _learn(chat_id, actions[user_text])
            except (httpx.HTTPError, ValueError, sqlite3.Error):
                _release_claim(update["update_id"])
                raise HTTPException(503, "Telegram lesson delivery failed") from None
        return {"ok":True}
    command = message.get("text", "").split(maxsplit=1)[0].split("@")[0].lower() if isinstance(message.get("text"), str) else ""
    if command not in ("/start", "/help", "/menu", "/academy"):
        return {"ok": True}
    if not _claim(update["update_id"]):
        return {"ok": True}
    try:
        if command == "/academy":
            await _learn(chat_id, "start")
        else:
            await _hub(chat_id, "home")
    except (httpx.HTTPError, ValueError, sqlite3.Error):
        _release_claim(update["update_id"])
        raise HTTPException(503, "Telegram response delivery failed") from None
    return {"ok": True}
