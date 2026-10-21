"""Opt-in member Telegram AI pairing, separate from owner administration.

A Google-verified member starts a one-time challenge inside Vanilla, then proves
control of a Telegram private chat by sending /link <challenge> to Ceres.
No Gmail or Telegram user-supplied name establishes authority on its own.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from auth import FamilyIdentity, family_reader

router = APIRouter(prefix="/v1/family/ceres/telegram-link", tags=["ceres-member-link"])
_SUB = re.compile(r"^[0-9]{8,40}$")
_CODE = re.compile(r"^vcp_[A-Za-z0-9_-]{24}$")
_DAY = 86400


def enabled() -> bool:
    return os.getenv("CERES_MEMBER_CHAT_ENABLED", "false").lower() == "true"


def _session():
    # Late import: ceres_gateway uses the member registry for its inbound ACL.
    from ceres_gateway import _session as session
    return session()


def _setup(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_member_links(
      chat_id INTEGER PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE,
      linked_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_member_challenges(
      digest TEXT PRIMARY KEY, google_sub TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_member_challenge_issues(
      google_sub TEXT NOT NULL, created_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_member_usage(
      google_sub TEXT NOT NULL, utc_day INTEGER NOT NULL,
      reserved_tokens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(google_sub,utc_day))""")


def _allowed_member(sub: str) -> bool:
    if not enabled() or not isinstance(sub, str) or not _SUB.fullmatch(sub):
        return False
    from ceres_admin_policy import _account_for
    row = _account_for(sub=sub)
    if not row or not row["enabled"] or row["role"] != "member":
        return False
    try:
        return "chat" in json.loads(row["scopes"])
    except (TypeError, ValueError):
        return False


def linked_members() -> dict[int, str]:
    if not enabled():
        return {}
    with _session() as db:
        _setup(db)
        rows = db.execute("SELECT chat_id,google_sub FROM ceres_member_links").fetchall()
    return {int(row["chat_id"]): row["google_sub"] for row in rows
            if _allowed_member(row["google_sub"])}


def member_chat(sub: str) -> int | None:
    if not _allowed_member(sub):
        return None
    with _session() as db:
        _setup(db)
        row = db.execute("SELECT chat_id FROM ceres_member_links WHERE google_sub=?", (sub,)).fetchone()
    return int(row["chat_id"]) if row else None


def subject_for_chat(chat: int) -> str | None:
    if type(chat) is not int or chat <= 0:
        return None
    sub = linked_members().get(chat)
    if sub:
        return sub
    try:
        links = json.loads(os.getenv("CERES_FAMILY_LINKS_JSON", "{}"))
        acl = json.loads(os.getenv("WEIGUO_FAMILY_ACL_JSON", "{}"))
        sub = links.get(str(chat)) if isinstance(links, dict) else None
        record = acl.get(sub) if isinstance(acl, dict) else None
        if not isinstance(sub, str) or not _SUB.fullmatch(sub) or not isinstance(record, dict):
            return None
        if record.get("role") == "owner":
            return sub
        if record.get("role") == "member" and _allowed_member(sub):
            return sub
    except (TypeError, ValueError):
        return None
    return None


def issue_code(sub: str) -> str:
    if not _allowed_member(sub):
        raise HTTPException(403, "此 Google 帳號沒有 Ceres AI 聊天權限")
    now = int(time.time())
    code = "vcp_" + secrets.token_urlsafe(18)  # 144-bit, 24 chars.
    with _session() as db:
        _setup(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ceres_member_challenges WHERE expires_at<=?", (now,))
        db.execute("DELETE FROM ceres_member_challenge_issues WHERE created_at<?", (now-3600,))
        count = db.execute("SELECT COUNT(*) FROM ceres_member_challenge_issues "
                           "WHERE google_sub=? AND created_at>=?", (sub, now-3600)).fetchone()[0]
        if count >= 5:
            raise HTTPException(429, "本小時綁定次數已達上限")
        db.execute("DELETE FROM ceres_member_challenges WHERE google_sub=?", (sub,))
        db.execute("INSERT INTO ceres_member_challenges VALUES(?,?,?,?)",
                   (hashlib.sha256(code.encode()).hexdigest(), sub, now+300, now))
        db.execute("INSERT INTO ceres_member_challenge_issues VALUES(?,?)", (sub, now))
    return code


def redeem_code(chat: int, code: str) -> bool:
    if not enabled() or type(chat) is not int or chat <= 0 or not _CODE.fullmatch(code):
        return False
    digest = hashlib.sha256(code.encode()).hexdigest()
    now = int(time.time())
    with _session() as db:
        _setup(db)
        row = db.execute("SELECT google_sub FROM ceres_member_challenges "
                         "WHERE digest=? AND expires_at>?", (digest, now)).fetchone()
        if not row or not _allowed_member(row["google_sub"]):
            return False
        # A redeemed challenge is single-use. A fresh Google login can relink a device.
        db.execute("BEGIN IMMEDIATE")
        consumed = db.execute("DELETE FROM ceres_member_challenges "
                              "WHERE digest=? AND expires_at>?", (digest, now))
        if consumed.rowcount != 1:
            return False
        sub = row["google_sub"]
        db.execute("DELETE FROM ceres_member_links WHERE chat_id=? OR google_sub=?", (chat, sub))
        db.execute("INSERT INTO ceres_member_links VALUES(?,?,?)", (chat, sub, now))
    return True


def reserve_member_tokens(sub: str, content: str, *, output: int = 1024) -> bool:
    """Conservatively bound paid Telegram requests before external inference.

    UTF-8 bytes + fixed framing are upper-bound proxy credits, not vendor
    token metering. Failed model calls keep reservations to avoid retry abuse.
    """
    if not _allowed_member(sub):
        return False
    if not isinstance(content, str) or len(content) > 1600:
        return False
"    cost = len(content.encode("utf-8")) + 256 + output
    from ceres_admin_policy import reserve_shared_tokens
    return reserve_shared_tokens(sub, cost)


@router.post("/start")
async def start_link(user: FamilyIdentity = Depends(family_reader)):
    if not _allowed_member(user.sub):
        raise HTTPException(403, "請先由 Owner 將 Gmail 加入 Ceres chat 白名單")
    code = issue_code(user.sub)
    return {"code": code, "command": "/link " + code,
            "expiresInSeconds": 300, "telegramBot": "SignWell_bot",
            "notice": "請在 Telegram 與 @SignWell_bot 私聊傳送一次性指令；不要公開分享。"}


@router.get("/status")
async def link_status(user: FamilyIdentity = Depends(family_reader)):
    return {"memberChatEnabled": enabled(), "eligible": _allowed_member(user.sub),
            "linked": member_chat(user.sub) is not None}
