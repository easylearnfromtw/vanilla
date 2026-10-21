"""Ceres: first-party, opt-in Telegram ingress for Detroit.

No AstrBot code, SDK, trademarks or bundled plugin source is used.
Inbound text is UNTRUSTED DATA. The only authorized effect is storing a
bounded inbox entry for explicit operator review. There is no AI dispatch,
plugin execution or outgoing message API.
"""
from __future__ import annotations

import hmac
import json
import os
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

telegram_router = APIRouter(prefix="/v1/ceres", tags=["ceres-webhook"])
operator_router = APIRouter(prefix="/v1/operator/ceres", tags=["ceres-operator"])

MAX_BODY = 16 * 1024
MAX_TEXT = 4000
_RETENTION_SECONDS = 7 * 86400
_SECRET_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,256}$")


def _enabled() -> bool:
    return os.getenv("CERES_ENABLED", "").lower() == "true"


def _allowed_chat_ids() -> set[int]:
    raw = os.getenv("CERES_TELEGRAM_CHAT_IDS", "")
    if not raw.strip():
        return set()
    values = [part.strip() for part in raw.split(",")]
    if len(values) > 30 or any(not re.fullmatch(r"[0-9]{1,20}", v) for v in values):
        raise HTTPException(503, "Ceres allowlist is misconfigured")
    listed = {int(v) for v in values if int(v) > 0}
    # Restrict the personal Telegram bot to the SINGLE verified owner.
    # Enabling Slime makes this fail-closed restriction mandatory.
    if (os.getenv("CERES_OWNER_ONLY", "").lower() != "true"
            and os.getenv("SLIME_ENABLED", "").lower() != "true"):
        return listed
    try:
        links = json.loads(os.environ.get("CERES_FAMILY_LINKS_JSON", "{}"))
        acl = json.loads(os.environ.get("WEIGUO_FAMILY_ACL_JSON", "{}"))
    except (ValueError, TypeError):
        return set()
    if not isinstance(links, dict) or not isinstance(acl, dict):
        return set()
    verified = []
    for chat, subject in links.items():
        if (isinstance(chat, str) and re.fullmatch(r"[0-9]{1,20}", chat)
                and int(chat) in listed and isinstance(subject, str)
                and isinstance(acl.get(subject), dict)
                and acl[subject].get("role") == "owner"):
            verified.append(int(chat))
    return {verified[0]} if len(verified) == 1 else set()


def _secret() -> str:
    secret = os.getenv("CERES_TELEGRAM_WEBHOOK_SECRET", "")
    if not _SECRET_PATTERN.fullmatch(secret):
        raise HTTPException(503, "Ceres webhook secret is not configured")
    return secret


@contextmanager
def _session():
    path = Path(os.getenv("CERES_DB_PATH", "/tmp/ceres-events.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=10)
    db.row_factory = sqlite3.Row
    try:
        db.execute("""CREATE TABLE IF NOT EXISTS ceres_inbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            update_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            reviewed_at INTEGER,
            UNIQUE(provider,update_id)
        )""")
        with db:
            yield db
    finally:
        db.close()


def _store(update_id: int, chat_id: int, user_id: int, text: str) -> bool:
    now = int(time.time())
    with _session() as db:
        db.execute("BEGIN IMMEDIATE")
        # Keep duplicate delivery idempotent even beyond the recent-rate window.
        if db.execute("SELECT 1 FROM ceres_inbox WHERE provider='telegram' AND update_id=?",
                      (update_id,)).fetchone():
            return False
        recent = db.execute(
            "SELECT COUNT(*) FROM ceres_inbox WHERE provider='telegram' AND user_id=? AND created_at>=?",
            (user_id, now - 60)
        ).fetchone()[0]
        if recent >= 12:
            raise HTTPException(429, "Ceres rate limit")
        db.execute(
            "INSERT INTO ceres_inbox(provider,update_id,chat_id,user_id,text,created_at) VALUES(?,?,?,?,?,?)",
            ("telegram", update_id, chat_id, user_id, text, now)
        )
        # In the opt-in Detroit bridge, enqueue the same event atomically.
        # If this transaction fails, Telegram may retry the signed update.
        if (os.getenv("CERES_LOCAL_BRIDGE_ENABLED", "").lower() == "true"
            or os.getenv("CERES_SERVER_AGENT_ENABLED", "").lower() == "true"):
            from ceres_agent_bridge import setup
            setup(db)
            item = db.execute(
                "SELECT id FROM ceres_inbox WHERE provider='telegram' AND update_id=?",
                (update_id,)
            ).fetchone()
            db.execute(
                "INSERT OR IGNORE INTO ceres_agent_jobs(event_id,chat_id,status,updated_at) "
                "VALUES(?,?,'queued',?)", (item["id"],chat_id,now))
        # Seven-day retention, including the message content.
        db.execute("DELETE FROM ceres_inbox WHERE created_at < ?", (now - _RETENTION_SECONDS,))
    return True


def _claim_admin_update(update_id: int) -> bool:
    """Dedupe privileged Telegram updates without storing their text or secrets."""
    with _session() as db:
        db.execute("CREATE TABLE IF NOT EXISTS ceres_admin_updates (update_id INTEGER PRIMARY KEY, at INTEGER NOT NULL)")
        db.execute("DELETE FROM ceres_admin_updates WHERE at<?",(int(time.time())-14*86400,))
        cur=db.execute("INSERT OR IGNORE INTO ceres_admin_updates VALUES(?,?)",
                       (update_id,int(time.time())))
        return bool(cur.rowcount)


@telegram_router.post("/telegram/webhook")
async def telegram_webhook(request: Request,
                           x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    if not _enabled():
        raise HTTPException(503, "Ceres is disabled")
    expected = _secret()
    if not x_telegram_bot_api_secret_token or not hmac.compare_digest(
        x_telegram_bot_api_secret_token, expected
    ):
        raise HTTPException(401, "Invalid webhook signature")
    allowed = _allowed_chat_ids()
    if not allowed:
        raise HTTPException(503, "Ceres chat allowlist is empty")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(415, "JSON required")
    if (request.headers.get("content-length", "").isdigit()
            and int(request.headers["content-length"]) > MAX_BODY):
        raise HTTPException(413, "Payload too large")
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(413, "Payload too large")
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid JSON") from None
    if not isinstance(payload, dict) or type(payload.get("update_id")) is not int:
        raise HTTPException(400, "Invalid update identifier")
    # Telegram button events are verified independently and never reach the AI queue.
    callback=payload.get("callback_query")
    if isinstance(callback,dict):
        sender=callback.get("from")
        sent=callback.get("message")
        chat=sent.get("chat") if isinstance(sent,dict) else None
        chat_id=chat.get("id") if isinstance(chat,dict) else None
        if (isinstance(sender,dict) and isinstance(chat,dict)
            and chat.get("type")=="private" and type(chat_id) is int
            and sender.get("id")==chat_id and chat_id in allowed
            and isinstance(callback.get("id"),str) and isinstance(callback.get("data"),str)):
            from ceres_admin_bot import callback as admin_callback, owner_subject
            if owner_subject(chat_id) and _claim_admin_update(payload["update_id"]):
                # Edit only the original bot message, never a user-supplied target.
                message_id=sent.get("message_id")
                if type(message_id) is not int or not 0<message_id<2**31:
                    message_id=None
                if callback["data"].startswith("hub:"):
                    from ceres_command_center import callback as hub_callback
                    await hub_callback(chat_id,callback["id"],callback["data"],message_id=message_id)
                else:
                    await admin_callback(chat_id,callback["id"],callback["data"],message_id=message_id)
                return {"ok":True,"accepted":True}
        return {"ok":True,"accepted":False}
    message = payload.get("message")
    if not isinstance(message, dict):
        return {"ok": True, "accepted": False}
    chat = message.get("chat")
    sender = message.get("from")
    if not isinstance(chat, dict) or not isinstance(sender, dict):
        return {"ok": True, "accepted": False}
    chat_id, user_id = chat.get("id"), sender.get("id")
    # Private chats ONLY in v1: no group member can hijack a trusted group id.
    if (chat.get("type") != "private" or type(chat_id) is not int
            or type(user_id) is not int or chat_id != user_id or chat_id not in allowed
            or sender.get("is_bot") is True):
        return {"ok": True, "accepted": False}
    body = message.get("text")
    if not isinstance(body, str) or not 1 <= len(body.strip()) <= MAX_TEXT:
        return {"ok": True, "accepted": False}
    text=body.strip()
    # Owner-only command center stays out of the AI job queue and is
    # deduplicated like /admin. Natural-language shortcuts are deterministic.
    hub_text = None
    prefix = text.split()[0].split("@")[0].lower()
    if prefix in ("/hub", "/center", "/centre"):
        hub_text = text
    elif prefix in ("/start", "/help"):
        from ceres_admin_bot import owner_subject
        from ceres_command_center import welcome
        if owner_subject(chat_id) and _claim_admin_update(payload["update_id"]):
            await welcome(chat_id)
            return {"ok":True,"accepted":True}
        return {"ok":True,"accepted":False}
    elif prefix == "/menu" or text in ("控制中心", "開啟控制中心", "打開控制中心", "開始使用"):
        hub_text = "/hub"
    elif text in ("系統狀態", "查看系統狀態", "底特律狀態"):
        hub_text = "/hub status"
    elif text in ("有哪些功能", "功能清單", "查看工具能力"):
        hub_text = "/hub tools"
    if hub_text is None:
        # Deterministic Owner-only setting intent preview. Never execute
        # model-generated instructions and never apply without confirmation.
        config_intent = re.fullmatch(
            r"(?:幫我)?(?:把|將)?\s*(?:gemini|openai|deepseek)\s*(?:模型)?\s*"
            r"(?:改成|設為|切換成)?\s*"
            r"(?:速度優先|品質優先|均衡|開啟備援|關閉備援)",
            text, re.I)
        if config_intent:
            hub_text = "/hub plan " + text
    if hub_text is None:
        # Read-only natural-language GitHub lookup, not remote installation.
        search = re.fullmatch(
            r"(?:幫我)?(?:找|搜尋|尋找)\s*github\s*(?:上的|上|的)?\s*"
            r"(?:開源|專案|項目)?\s*(.{2,80})",
            text, re.I)
        if search:
            hub_text = "/hub github " + search.group(1).strip()
    if hub_text is not None:
        from ceres_admin_bot import owner_subject
        from ceres_command_center import command as hub_command
        if owner_subject(chat_id) and _claim_admin_update(payload["update_id"]):
            await hub_command(chat_id, hub_text)
            return {"ok":True,"accepted":True}
        return {"ok":True,"accepted":False}
    if prefix in ("/admin","/manage"):
        from ceres_admin_bot import command as admin_command, owner_subject
        if owner_subject(chat_id) and _claim_admin_update(payload["update_id"]):
            await admin_command(chat_id,text)
            return {"ok":True,"accepted":True}
        return {"ok":True,"accepted":False}
    accepted = _store(payload["update_id"], chat_id, user_id, text)
    return {"ok": True, "accepted": accepted}


@operator_router.get("/status")
async def ceres_status():
    return {
        "name": "Ceres",
        "enabled": _enabled(),
        "telegramConfigured": bool(_SECRET_PATTERN.fullmatch(
            os.getenv("CERES_TELEGRAM_WEBHOOK_SECRET", ""))) and bool(_allowed_chat_ids()),
        "automaticDispatch": False,
        "automaticReplies": False,
        "watermarkRequired": False,
    }


@operator_router.get("/events")
async def ceres_events(limit: int = 20):
    if not 1 <= limit <= 50:
        raise HTTPException(422, "Invalid page size")
    with _session() as db:
        rows = db.execute(
            "SELECT id,provider,chat_id,user_id,text,created_at,reviewed_at FROM ceres_inbox "
            "ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return {"events": [dict(row) for row in rows], "untrustedContent": True}


class ReviewRequest(BaseModel):
    approved: bool = Field(default=False)


@operator_router.post("/events/{event_id}/review")
async def ceres_review(event_id: int, body: ReviewRequest):
    if event_id <= 0 or not body.approved:
        raise HTTPException(400, "Explicit operator review required")
    with _session() as db:
        cur = db.execute("UPDATE ceres_inbox SET reviewed_at=? WHERE id=? AND reviewed_at IS NULL",
                         (int(time.time()), event_id))
        if cur.rowcount == 0:
            found = db.execute("SELECT 1 FROM ceres_inbox WHERE id=?", (event_id,)).fetchone()
            if not found:
                raise HTTPException(404, "Event not found")
    return {"ok": True, "state": "reviewed", "dispatched": False}
