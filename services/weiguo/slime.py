"""Slime opt-in distributed node registry for Vanilla / WeiGuo.

This service deliberately DOES NOT run remote code, send prompts, control power,
or claim to serve a sharded LLM. Only attested-ish heartbeats (self-reported)
and owner-controlled dispatch eligibility. Tokens are hashed at rest.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from auth import FamilyIdentity, family_user

router = APIRouter()
node_router = APIRouter()  # only public, token-scoped endpoints; admin is Telegram only
ONLINE_SECONDS = 150
MAX_PER_OWNER = 50
MAX_ACTIVE_INVITES = 10
INVITE_SECONDS = 600

def _enabled():
    if os.environ.get("SLIME_ENABLED", "").lower() != "true":
        raise HTTPException(503, "Slime 尚未在衞國後端啟用。")

def _owner(user: FamilyIdentity = Depends(family_user)):
    _enabled()
    if user.role != "owner":
        raise HTTPException(403, "僅家庭擁有者能管理 Slime 節點")
    return user

def _digest(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def _db_path() -> Path:
    return Path(os.environ.get("SLIME_DB_PATH", "/tmp/vanilla-slime.db"))

@contextmanager
def _db():
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(path), timeout=5, isolation_level=None)
    c.row_factory = sqlite3.Row
    try:
        c.execute("PRAGMA busy_timeout=5000")
        c.execute("""CREATE TABLE IF NOT EXISTS invites (
          digest TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, token_digest TEXT UNIQUE NOT NULL,
          label TEXT NOT NULL, role TEXT NOT NULL, last_seen REAL NOT NULL,
          cpu INTEGER NOT NULL DEFAULT 0, ram_gb REAL NOT NULL DEFAULT 0,
          gpu TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '',
          share_enabled INTEGER NOT NULL DEFAULT 1,
          owner_enabled INTEGER NOT NULL DEFAULT 1)""")
        yield c
    finally:
        c.close()

def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Slime 裝置尚未授權")
    token = authorization[7:]
    if len(token) < 32 or len(token) > 256:
        raise HTTPException(401, "Slime 裝置憑證不正確")
    return token

def _node(c, authorization):
    token = _bearer(authorization)
    record = c.execute("SELECT * FROM nodes WHERE token_digest=?", (_digest(token),)).fetchone()
    if record is None:
        raise HTTPException(401, "Slime 裝置已撤銷或憑證失效")
    return record

def _safe_origin():
    raw = os.environ.get("SLIME_PUBLIC_API_ORIGIN", "").strip().rstrip("/")
    parts = urlsplit(raw)
    if (parts.scheme != "https" or not parts.hostname or parts.username or
        parts.password or parts.path or parts.query or parts.fragment):
        raise HTTPException(503, "Slime 公開 HTTPS 網域尚未設定")
    return raw

class JoinRequest(BaseModel):
    invite: str = Field(min_length=24, max_length=160)
    label: str = Field(min_length=1, max_length=64)
    role: str = "friend"

class Caps(BaseModel):
    cpu: int = Field(default=0, ge=0, le=512)
    ram_gb: float = Field(default=0, ge=0, le=2048)
    gpu: str = Field(default="", max_length=150)
    os: str = Field(default="", max_length=80)

class Heartbeat(BaseModel):
    capabilities: Caps
    share_enabled: bool = True

class Policy(BaseModel):
    enabled: bool

class RouteRequest(BaseModel):
    workload: str = Field(pattern=r"^(model-shard|tools|independent-inference)$")
    min_ram_gb: float = Field(default=0, ge=0, le=2048)

@router.get("/v1/family/slime/status")
def slime_status(user: FamilyIdentity = Depends(_owner)):
    return {"ready": True, "service": "Slime", "runtime": "registry-only",
            "inference_enabled": False, "power_control_enabled": False,
            "heartbeat_seconds": ONLINE_SECONDS}

@router.post("/v1/family/slime/invite")
def issue_invite(user: FamilyIdentity = Depends(_owner)):
    base = _safe_origin()
    raw = secrets.token_urlsafe(32)
    now = time.time()
    with _db() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("DELETE FROM invites WHERE expires < ?", (now,))
        count = c.execute("SELECT COUNT(*) FROM invites WHERE owner=?", (user.sub,)).fetchone()[0]
        if count >= MAX_ACTIVE_INVITES:
            raise HTTPException(429, "同時待使用邀請已達上限")
        c.execute("INSERT INTO invites VALUES (?,?,?)",
                  (_digest(raw), user.sub, now + INVITE_SECONDS))
        c.commit()
    # Fragment keeps the secret out of the HTTP request path/proxy logs.
    return {"link": base + "/#slime=" + raw,
            "expires_seconds": INVITE_SECONDS, "single_use": True}

@router.get("/v1/family/slime/nodes")
def list_nodes(user: FamilyIdentity = Depends(_owner)):
    now = time.time()
    with _db() as c:
        records = c.execute("SELECT * FROM nodes WHERE owner=? ORDER BY label", (user.sub,)).fetchall()
    return {"nodes": [{
        "id": r["id"], "label": r["label"], "role": r["role"], "os": r["os"],
        "cpu": r["cpu"], "ram_gb": r["ram_gb"], "gpu": r["gpu"],
        "online": now - r["last_seen"] <= ONLINE_SECONDS,
        "last_seen": r["last_seen"], "share_enabled": bool(r["share_enabled"]),
        "owner_enabled": bool(r["owner_enabled"]),
        "schedulable": now - r["last_seen"] <= ONLINE_SECONDS and
             bool(r["share_enabled"]) and bool(r["owner_enabled"])
    } for r in records], "inference_enabled": False}

@router.post("/v1/family/slime/nodes/{node_id}/policy")
def policy(node_id: str, body: Policy, user: FamilyIdentity = Depends(_owner)):
    if not 8 <= len(node_id) <= 48:
        raise HTTPException(404, "找不到節點")
    with _db() as c:
        cursor = c.execute("UPDATE nodes SET owner_enabled=? WHERE id=? AND owner=?",
                           (int(body.enabled), node_id, user.sub))
        if not cursor.rowcount:
            raise HTTPException(404, "找不到節點")
    return {"ok": True, "owner_enabled": body.enabled}

@router.post("/v1/family/slime/nodes/{node_id}/revoke")
def revoke(node_id: str, user: FamilyIdentity = Depends(_owner)):
    with _db() as c:
        cursor = c.execute("DELETE FROM nodes WHERE id=? AND owner=?", (node_id, user.sub))
        if not cursor.rowcount:
            raise HTTPException(404, "找不到節點")
    return {"ok": True}

@router.post("/v1/family/slime/route")
def suggest_route(body: RouteRequest, user: FamilyIdentity = Depends(_owner)):
    """Diana/Zeus may inspect this plan; no dispatch or model transfer occurs."""
    now = time.time()
    with _db() as c:
        records = c.execute("""SELECT id,label,cpu,ram_gb,gpu FROM nodes
            WHERE owner=? AND share_enabled=1 AND owner_enabled=1
              AND last_seen>=? AND ram_gb>=?
            ORDER BY ram_gb DESC, cpu DESC LIMIT 10""",
            (user.sub, now - ONLINE_SECONDS, body.min_ram_gb)).fetchall()
    return {"workload": body.workload,
            "candidate_nodes": [{"id": r["id"], "label": r["label"],
                                 "ram_gb": r["ram_gb"], "gpu": r["gpu"]} for r in records],
            "executed": False, "reason": "僅提供資源調度預覽；尚未接入可信模型執行器"}

@node_router.post("/v1/slime/node/join")
def join(body: JoinRequest):
    _enabled()
    if body.role not in ("owner", "friend"):
        raise HTTPException(400, "不支援的節點角色")
    now = time.time()
    token = secrets.token_urlsafe(32)
    node_id = secrets.token_hex(12)
    with _db() as c:
        c.execute("BEGIN IMMEDIATE")
        invited = c.execute("SELECT owner FROM invites WHERE digest=? AND expires>?",
                            (_digest(body.invite), now)).fetchone()
        if invited is None:
            raise HTTPException(403, "邀請已使用或已過期")
        count = c.execute("SELECT COUNT(*) FROM nodes WHERE owner=?", (invited["owner"],)).fetchone()[0]
        if count >= MAX_PER_OWNER:
            raise HTTPException(429, "節點已達上限")
        c.execute("DELETE FROM invites WHERE digest=?", (_digest(body.invite),))
        c.execute("""INSERT INTO nodes (id,owner,token_digest,label,role,last_seen)
            VALUES (?,?,?,?,?,?)""", (node_id, invited["owner"], _digest(token),
                                       body.label.strip(), body.role, now))
        c.commit()
    return {"node_id": node_id, "token": token, "heartbeat_interval_seconds": 60,
            "inference_enabled": False}

@node_router.post("/v1/slime/node/heartbeat")
def heartbeat(body: Heartbeat, authorization: str | None = Header(default=None)):
    _enabled()
    with _db() as c:
        r = _node(c, authorization)
        c.execute("""UPDATE nodes SET last_seen=?,cpu=?,ram_gb=?,gpu=?,os=?,share_enabled=?
            WHERE id=?""", (time.time(), body.capabilities.cpu,
                            body.capabilities.ram_gb, body.capabilities.gpu, body.capabilities.os,
                            int(body.share_enabled), r["id"]))
        owner_allowed = bool(r["owner_enabled"])
    return {"ok": True, "owner_enabled": owner_allowed, "inference_enabled": False,
            "commands": []}

@node_router.post("/v1/slime/node/leave")
def leave(authorization: str | None = Header(default=None)):
    _enabled()
    with _db() as c:
        r = _node(c, authorization)
        c.execute("DELETE FROM nodes WHERE id=?", (r["id"],))
    return {"ok": True}
