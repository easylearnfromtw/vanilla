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
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
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
    if token == os.getenv("CERES_TELEGRAM_BOT_TOKEN") or secret == os.getenv("CERES_TELEGRAM_WEBHOOK_SECRET"):
        print("Ceres Store: registration blocked (credentials overlap admin bot)", flush=True)
        return False
    api = f"https://api.telegram.org/bot{token}/"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20, connect=8), trust_env=False, follow_redirects=False) as client:
            identity_response = await client.get(api + "getMe")
            if identity_response.status_code != 200:
                print(f"Ceres Store: getMe HTTP {identity_response.status_code}", flush=True)
                return False
            identity = identity_response.json()
            if identity.get("ok") is not True or identity.get("result", {}).get("username", "").lower() != EXPECTED_USERNAME.lower():
                print("Ceres Store: bot identity mismatch", flush=True)
                return False
            info_response = await client.get(api + "getWebhookInfo")
            if info_response.status_code != 200:
                print(f"Ceres Store: getWebhookInfo HTTP {info_response.status_code}", flush=True)
                return False
            info = info_response.json()
            previous = info.get("result", {}).get("url", "")
            if info.get("ok") is not True or previous not in ("", url):
                print("Ceres Store: existing different webhook; refusing override", flush=True)
                return False
            set_response = await client.post(api + "setWebhook", json={
                "url": url, "secret_token": secret,
                "allowed_updates": ["message"], "drop_pending_updates": False
            })
            if set_response.status_code != 200:
                print(f"Ceres Store: setWebhook HTTP {set_response.status_code}", flush=True)
                return False
            response = set_response.json()
            if response.get("ok") is not True or response.get("result") is not True:
                raise ValueError("registration failed")
            verify_response = await client.get(api + "getWebhookInfo")
            if verify_response.status_code != 200:
                print(f"Ceres Store: verify HTTP {verify_response.status_code}", flush=True)
                return False
            verify = verify_response.json()
            if verify.get("ok") is not True or verify.get("result", {}).get("url") != url:
                raise ValueError("verification failed")
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout) as exc:
        print(f"Ceres Store: webhook registration timeout ({type(exc).__name__})", flush=True)
        return False
    except httpx.HTTPError as exc:
        print(f"Ceres Store: webhook transport error ({type(exc).__name__})", flush=True)
        return False
    except (ValueError, KeyError, TypeError) as exc:
        print(f"Ceres Store: webhook response error ({type(exc).__name__})", flush=True)
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


async def _send(chat_id: int, text: str):
    token = os.environ["CERES_STORE_BOT_TOKEN"]
    async with httpx.AsyncClient(timeout=8, trust_env=False, follow_redirects=False) as client:
        result = await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                   json={"chat_id": chat_id, "text": text, "reply_markup": {"inline_keyboard": [[{"text": "開啟 Vanilla API Store", "web_app": {"url": "https://weiguo-browser-production.up.railway.app/v1/ceres/store/app"}}]]}})
        result.raise_for_status()
        if result.json().get("ok") is not True:
            raise ValueError("send failed")


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
    command = message.get("text", "").split(maxsplit=1)[0].split("@")[0].lower() if isinstance(message.get("text"), str) else ""
    if command not in ("/start", "/help"):
        return {"ok": True}
    if not _claim(update["update_id"]):
        return {"ok": True}
    await _send(chat_id, "歡迎使用 Vanilla AI API Store！\n\n模型、方案、API 金鑰與使用量功能即將開放。目前尚未開放付款，請勿匯款或提供敏感資料。")
    return {"ok": True}
