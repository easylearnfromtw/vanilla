"""Opt-in always-on Ceres/Detroit Telegram conversation worker.

Telegram signed ingress and the existing private-chat allowlist remain the
only accepted input. Only the operator-owned environment selects the model.
No untrusted chat content is promoted to server tool or admin authority.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException

from auth import FamilyIdentity, family_reader
from ceres_gateway import _allowed_chat_ids, _enabled, _session
from ceres_dialogue import _authorized_chat, _bot_token, _outbox_table
from ceres_agent_bridge import MAX_AGE, setup
from ceres_agent_delivery import deliver
from ceres_server_model import ModelUnavailable, generate_reply, model_settings
from ceres_server_tools import ToolDenied, choose_tool
from slime_telegram import handle_slime

router = APIRouter(prefix="/v1/family/ceres/agent", tags=["ceres-server-agent"])
_HISTORY_AGE = 24 * 3600
_LIVE_STATES = {"queued", "server-processing", "sending"}
_SUB = re.compile(r"^[0-9]{8,40}$")


def enabled() -> bool:
    return (_enabled() and os.getenv("CERES_OUTBOUND_ENABLED", "").lower() == "true"
            and os.getenv("CERES_SERVER_AGENT_ENABLED", "").lower() == "true")


def ready() -> bool:
    return enabled() and model_settings() is not None


def ensure_history(db: sqlite3.Connection) -> None:
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_agent_history (
        event_id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL,
        request TEXT NOT NULL, reply TEXT NOT NULL,
        created_at INTEGER NOT NULL)""")


def verified_subject(chat: int) -> str | None:
    """Recheck ACL and Telegram link on EVERY execution, not just at startup."""
    if chat not in _allowed_chat_ids():
        return None
    try:
        links = json.loads(os.getenv("CERES_FAMILY_LINKS_JSON", "{}"))
        acl = json.loads(os.getenv("WEIGUO_FAMILY_ACL_JSON", "{}"))
    except (TypeError, ValueError):
        return None
    if not isinstance(links, dict) or not isinstance(acl, dict):
        return None
    if len(links) > 30 or len(acl) > 30:
        return None
    sub = links.get(str(chat))
    if not isinstance(sub, str) or not _SUB.fullmatch(sub):
        return None
    role = acl.get(sub)
    if not isinstance(role, dict) or role.get("role") not in ("owner", "member"):
        return None
    if (os.getenv("CERES_OWNER_ONLY", "").lower() == "true"
        or os.getenv("SLIME_ENABLED", "").lower() == "true") and role.get("role") != "owner":
        return None
    return sub


def set_job_state(event_id: int, state: str) -> None:
    with _session() as db:
        setup(db)
        db.execute("UPDATE ceres_agent_jobs SET status=?,lease_hash=NULL,updated_at=? "
                   "WHERE event_id=?", (state, int(time.time()), event_id))


def claim_next() -> dict | None:
    if not ready():
        return None
    now = int(time.time())
    with _session() as db:
        setup(db)
        _outbox_table(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("UPDATE ceres_agent_jobs SET status='expired',updated_at=? "
                   "WHERE status='queued' AND event_id IN "
                   "(SELECT id FROM ceres_inbox WHERE created_at<?)",
                   (now, now - MAX_AGE))
        # Limit model costs BEFORE calling the provider; do not lease a
        # message that the Telegram outbox cannot send this minute.
        row = db.execute(
            "SELECT j.event_id,j.chat_id,i.text,i.created_at FROM ceres_agent_jobs j "
            "JOIN ceres_inbox i ON i.id=j.event_id "
            "WHERE j.status='queued' AND i.provider='telegram' "
            "AND i.created_at>=? AND NOT EXISTS "
            "(SELECT 1 FROM ceres_outbox o WHERE o.event_id=j.event_id) "
            "ORDER BY j.event_id LIMIT 1", (now - MAX_AGE,)
        ).fetchone()
        if not row:
            return None
        sent_recent = db.execute(
            "SELECT COUNT(*) FROM ceres_outbox WHERE chat_id=? AND created_at>=?",
            (row["chat_id"], now - 60)
        ).fetchone()[0]
        if sent_recent >= 4:
            return None  # Keep queued while the one-minute cap is in effect.
        job = dict(row)
        db.execute("UPDATE ceres_agent_jobs SET status='server-processing',"
                   "claimed_at=?,updated_at=? WHERE event_id=? AND status='queued'",
                   (now, now, job["event_id"]))
        return job


def history_for(chat: int) -> list[tuple[str, str]]:
    with _session() as db:
        ensure_history(db)
        rows = db.execute(
            "SELECT request,reply FROM ceres_agent_history "
            "WHERE chat_id=? AND created_at>=? "
            "ORDER BY event_id DESC LIMIT 4",
            (chat, int(time.time()) - _HISTORY_AGE)
        ).fetchall()
    return [(row["request"], row["reply"]) for row in reversed(rows)]


def reserve_outbox(job: dict, subject: str) -> bool:
    event_id, chat = job["event_id"], job["chat_id"]
    now = int(time.time())
    with _session() as db:
        setup(db)
        _outbox_table(db)
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT status FROM ceres_agent_jobs WHERE event_id=? AND chat_id=?",
            (event_id, chat)
        ).fetchone()
        if (not row or row["status"] != "server-processing"
            or job["created_at"] < now - MAX_AGE
            or verified_subject(chat) != subject):
            return False
        if db.execute("SELECT 1 FROM ceres_outbox WHERE event_id=?",
                      (event_id,)).fetchone():
            return False
        sent = db.execute(
            "SELECT COUNT(*) FROM ceres_outbox WHERE chat_id=? AND created_at>=?",
            (chat, now - 60)
        ).fetchone()[0]
        if sent >= 4:
            return False
        db.execute(
            "INSERT INTO ceres_outbox(event_id,chat_id,owner_sub,status,created_at,updated_at) "
            "VALUES(?,?,?,'reserved',?,?)",
            (event_id, chat, subject, now, now)
        )
        db.execute("UPDATE ceres_agent_jobs SET status='sending',updated_at=? "
                   "WHERE event_id=?", (now, event_id))
        return True


async def process_one() -> bool:
    job = claim_next()
    if not job:
        return False
    event_id, chat = job["event_id"], job["chat_id"]
    subject = verified_subject(chat)
    if not subject:
        set_job_state(event_id, "access_revoked")
        return True
    settings = model_settings()
    if not settings:
        set_job_state(event_id, "model_not_configured")
        return True
    source = job["text"]
    try:
        # Slime actions are executed by a deterministic, ACL-checked controller.
        # No model-generated SQL or privileged tool instruction is trusted.
        slime_reply = handle_slime(chat, subject, source)
        if slime_reply is not None:
            reply, tool, page = slime_reply, "slime", ""
        else:
            try:
                reply, tool, page = await choose_tool(source)
            except ToolDenied:
                reply, tool, page = ("此操作未授權。請使用已支援的 Slime 對話設定。", "diana", "")
            if reply is None:
                reply = await generate_reply(settings, source, history_for(chat), page)
    except (ModelUnavailable, ValueError, TypeError):
        set_job_state(event_id, "model_unavailable")
        print("Ceres server agent: model response unavailable", flush=True)
        return True
    if not reply or len(reply) > 1200 or not reserve_outbox(job, subject):
        set_job_state(event_id, "rate_or_age_blocked")
        return True
    # Telegram token is never sent to the LLM. The reservation prevents any
    # second attempt even if Telegram returns an ambiguous network failure.
    try:
        ok = await deliver(chat, reply, _bot_token())
    except (HTTPException, ValueError, TypeError):
        ok = False
    with _session() as db:
        setup(db)
        _outbox_table(db)
        ensure_history(db)
        now = int(time.time())
        db.execute("UPDATE ceres_outbox SET status=?,updated_at=? WHERE event_id=?",
                   ("sent" if ok else "unknown", now, event_id))
        db.execute("UPDATE ceres_agent_jobs SET status=?,updated_at=? WHERE event_id=?",
                   ("completed" if ok else "delivery_unknown", now, event_id))
        if ok:
            db.execute(
                "INSERT OR IGNORE INTO ceres_agent_history"
                "(event_id,chat_id,request,reply,created_at) VALUES(?,?,?,?,?)",
                (event_id,chat,source[:4000],reply[:1200],now)
            )
            db.execute("DELETE FROM ceres_agent_history WHERE created_at<?",
                       (now - _HISTORY_AGE,))
    print("Ceres server agent: " + ("reply verified" if ok else "delivery unknown"),
          flush=True)
    return True


async def worker_loop() -> None:
    """Run in WeiGuo server lifespan. No new service, browser timer or cron required."""
    if not ready():
        return
    print("Ceres server agent: active", flush=True)
    while True:
        try:
            processed = await process_one()
        except asyncio.CancelledError:
            raise
        except (Exception,):
            # Never log user texts, provider URLs, model tokens or exceptions
            # because HTTP client exceptions can contain auth-sensitive paths.
            print("Ceres server agent: safe processing failure", flush=True)
            processed = False
        await asyncio.sleep(0.8 if processed else 2.5)


@router.get("/status")
async def agent_status(user: FamilyIdentity = Depends(family_reader)):
    chat = _authorized_chat(user)
    with _session() as db:
        setup(db)
        rows = db.execute(
            "SELECT status,COUNT(*) AS n FROM ceres_agent_jobs WHERE chat_id=? "
            "GROUP BY status", (chat,)
        ).fetchall()
        latest = db.execute(
            "SELECT status FROM ceres_agent_jobs WHERE chat_id=? "
            "ORDER BY event_id DESC LIMIT 1", (chat,)
        ).fetchone()
    return {
        "enabled": enabled(), "modelConfigured": model_settings() is not None,
        "serverReady": ready(), "runtime": "railway-server",
        "foregroundPhoneRequired": False,
        "states": {row["status"]: row["n"] for row in rows},
        "latestState": latest["status"] if latest else None,
        "tools": ["diana", "cream", "scouts-read-approved-hosts", "merlin", "slime-owner-controls"],
        "privilegedExecution": False,
    }
