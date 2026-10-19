"""Ceres original signed relay intake. Default-off: no persistence, AI work or outbound sends."""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import re
import time
from fastapi import APIRouter, Header, HTTPException, Request

router = APIRouter(prefix="/v1/ceres", tags=["ceres"])
FIELDS = frozenset(("platform", "messageId", "tenantId", "senderId", "conversationId", "text"))
PLATFORMS = frozenset(("line", "telegram", "discord", "slack", "webhook"))
MAX_BODY = 16384

def validate_event(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict) or set(raw) != FIELDS:
        raise ValueError("Ceres 欄位不正確")
    for key, value in raw.items():
        limit = 4000 if key == "text" else 128
        if not isinstance(value, str) or not value.strip() or len(value) > limit or "\x00" in value:
            raise ValueError("Ceres 欄位無效")
        if key != "text" and any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
            raise ValueError("Ceres 識別碼含控制字元")
    if raw["platform"] not in PLATFORMS:
        raise ValueError("不支援的 Ceres 平台")
    return raw

def verify_signature(body: bytes, timestamp: str, signature: str, secret: str, now: int | None = None) -> bool:
    if len(secret) < 32 or not timestamp.isascii() or not timestamp.isdecimal() or len(timestamp) > 12:
        return False
    if not re.fullmatch(r"sha256=[0-9a-f]{64}", signature):
        return False
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > 300:
        return False
    digest = hmac.new(secret.encode(), timestamp.encode("ascii") + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, "sha256=" + digest)

@router.post("/events", status_code=202)
async def intake(request: Request,
                 x_ceres_timestamp: str | None = Header(default=None),
                 x_ceres_signature: str | None = Header(default=None)):
    if os.getenv("CERES_GATEWAY_ENABLED") != "true":
        raise HTTPException(503, "Ceres 預設停用")
    secret = os.getenv("CERES_GATEWAY_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(503, "Ceres Relay 金鑰未設定")
    length = request.headers.get("content-length", "")
    if length.isdecimal() and int(length) > MAX_BODY:
        raise HTTPException(413, "Ceres 訊息過大")
    body = await request.body()
    if len(body) > MAX_BODY:
        raise HTTPException(413, "Ceres 訊息過大")
    if not verify_signature(body, x_ceres_timestamp or "", x_ceres_signature or "", secret):
        raise HTTPException(401, "Ceres Relay 簽章錯誤或逾時")
    try:
        event = validate_event(json.loads(body))
    except (ValueError, TypeError, UnicodeError) as exc:
        raise HTTPException(400, "Ceres 訊息格式不正確") from exc
    allowed = {p.strip() for p in os.getenv("CERES_ALLOWED_PLATFORMS", "").split(",") if p.strip()}
    if event["platform"] not in allowed:
        raise HTTPException(403, "Ceres 平台尚未授權")
    # Payload sender and tenant identifiers are untrusted. No database, dispatch or reply.
    return {"status": "validated-only", "message_id": event["messageId"], "platform": event["platform"],
            "stored": False, "executed": False, "reply_sent": False}
