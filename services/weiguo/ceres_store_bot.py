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


async def _send(chat_id: int, text: str, *, section: str = "store"):
    token = os.environ["CERES_STORE_BOT_TOKEN"]
    base = "https://weiguo-browser-production.up.railway.app/v1/ceres/store/app"
    if section not in ("store", "models", "plans", "keys", "usage", "account"):
        section = "store"
    markup = {"inline_keyboard": [
        [{"text": "✦ 開啟 Vanilla API Store", "web_app": {"url": base + "#" + section}}],
        [{"text": "◈ 模型", "callback_data": "store:models"},
         {"text": "▤ 方案", "callback_data": "store:plans"},
         {"text": "⚿ 金鑰", "callback_data": "store:keys"}],
        [{"text": "▥ 用量", "callback_data": "store:usage"},
         {"text": "ⓘ 使用說明", "callback_data": "store:help"}],
    ]}
    async with httpx.AsyncClient(timeout=8, trust_env=False, follow_redirects=False) as client:
        result = await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                   json={"chat_id": chat_id, "text": text, "reply_markup": markup})
        result.raise_for_status()
        if result.json().get("ok") is not True:
            raise ValueError("send failed")


STORE_MESSAGES = {
    "/start": ("✦ 歡迎來到 Vanilla AI API Store\n\n探索 AI 模型、API 金鑰與 Token 用量的統一入口。\n\n目前為公開預覽：金鑰發行與付款尚未開放，請勿匯款或分享敏感資料。\n\n選擇下方功能，或開啟商店瀏覽。", "store"),
    "/help": ("ⓘ Vanilla API Store 使用指南\n\n/start  商店首頁\n/models  模型目錄\n/plans  方案資訊\n/keys  API 金鑰\n/usage  Token 用量\n/status  服務開放狀態\n\n目前為預覽版本，所有金鑰、計費及用量資料皆需正式後端驗證。", "store"),
    "/models": ("◈ AI Models\n\n模型清單將由 Vanilla 後端同步。目前尚未提供經驗證的公開模型目錄。", "models"),
    "/plans": ("▤ Plans\n\n方案、定價及付款尚未開放。請勿透過私訊或外部連結付款。", "plans"),
    "/keys": ("⚿ API Keys\n\n金鑰建立與撤銷尚未開放，正式版本將要求安全身分驗證。", "keys"),
    "/usage": ("▥ Usage\n\nToken 用量與配額需由驗證後的後端提供，目前沒有可供顯示的用量數據。", "usage"),
    "/status": ("ⓘ 服務狀態\n\n商店導覽：已開放\n模型目錄：待同步\nAPI 金鑰：未開放\n付款功能：未開放\n用量查詢：未開放\n\n此處為功能開放狀態，不代表即時伺服器健康監測。", "store"),
}


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
    message = callback.get("message") if isinstance(callback, dict) else update.get("message")
    if not isinstance(message, dict):
        return {"ok": True}
    chat, sender = message.get("chat"), message.get("from")
    if not isinstance(chat, dict) or not isinstance(sender, dict):
        return {"ok": True}
    chat_id = chat.get("id")
    actor = callback.get("from") if isinstance(callback, dict) else sender
    if (chat.get("type") != "private" or type(chat_id) is not int
            or not isinstance(actor, dict) or actor.get("id") != chat_id or actor.get("is_bot")):
        return {"ok": True}
    if isinstance(callback, dict):
        data = callback.get("data", "")
        command = "/" + data.removeprefix("store:") if isinstance(data, str) and data.startswith("store:") else ""
    else:
        value = message.get("text")
        words = value.split(maxsplit=1) if isinstance(value, str) else []
        command = words[0].split("@")[0].lower() if words else ""
    if command not in STORE_MESSAGES:
        return {"ok": True}
    if not _claim(update["update_id"]):
        return {"ok": True}
    text, section = STORE_MESSAGES[command]
    if isinstance(callback, dict):
        callback_id = callback.get("id")
        if isinstance(callback_id, str) and callback_id:
            token = cfg[0]
            try:
                async with httpx.AsyncClient(timeout=8, trust_env=False, follow_redirects=False) as client:
                    await client.post(f"https://api.telegram.org/bot{token}/answerCallbackQuery",
                                      json={"callback_query_id": callback_id})
            except httpx.HTTPError:
                pass
    await _send(chat_id, text, section=section)
    return {"ok": True}
