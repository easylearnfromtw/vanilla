"""Whitelist-only API key registry. No model calls until a metered gateway is connected."""
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from pathlib import Path
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/ceres/api-access", tags=["ceres-api-access"])

def _db():
    path = Path(os.getenv("CERES_DB_PATH", "/tmp/ceres-events.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.execute("CREATE TABLE IF NOT EXISTS api_access (user_id INTEGER PRIMARY KEY, approved INTEGER NOT NULL DEFAULT 0)")
    db.execute("CREATE TABLE IF NOT EXISTS api_keys (key_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, digest TEXT NOT NULL UNIQUE, quota INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)")
    db.commit()
    return db

def _admin(secret):
    configured = os.getenv("CERES_API_ADMIN_SECRET", "")
    if len(configured) < 32 or not secret or not hmac.compare_digest(configured, secret):
        raise HTTPException(403, "Forbidden")

class UserRequest(BaseModel):
    user_id: int = Field(gt=0)

class KeyRequest(UserRequest):
    quota: int = Field(default=10000, ge=1, le=10000000)

class RevokeRequest(BaseModel):
    key_id: str = Field(min_length=1, max_length=64)

@router.post("/request")
def request_access(payload: UserRequest):
    # Disabled until Telegram identity verification is wired in.
    raise HTTPException(503, "Use authenticated Telegram application flow")

@router.post("/admin/approve")
def approve(payload: UserRequest, x_ceres_admin_secret: str | None = Header(default=None)):
    _admin(x_ceres_admin_secret)
    with _db() as db:
        db.execute("INSERT INTO api_access(user_id,approved) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET approved=1", (payload.user_id,))
    return {"approved": True}

@router.post("/admin/issue")
def issue(payload: KeyRequest, x_ceres_admin_secret: str | None = Header(default=None)):
    _admin(x_ceres_admin_secret)
    with _db() as db:
        row = db.execute("SELECT approved FROM api_access WHERE user_id=?", (payload.user_id,)).fetchone()
        if not row or not row[0]:
            raise HTTPException(403, "Not approved")
        raw = "vna_" + secrets.token_urlsafe(32)
        key_id = secrets.token_hex(8)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        db.execute("INSERT INTO api_keys VALUES(?,?,?,?,0,0,?)", (key_id,payload.user_id,digest,payload.quota,int(time.time())))
    return {"key_id":key_id,"api_key":raw,"quota":payload.quota,"notice":"Registry-only credential; use vnl_ gateway keys for inference"}

@router.post("/admin/revoke")
def revoke(payload: RevokeRequest, x_ceres_admin_secret: str | None = Header(default=None)):
    _admin(x_ceres_admin_secret)
    with _db() as db:
        result=db.execute("UPDATE api_keys SET revoked=1 WHERE key_id=?", (payload.key_id,))
    return {"revoked":result.rowcount==1}

@router.get("/status")
def status():
    return {"mode":"whitelist","key_registry":"implemented","inference":"disabled","metering":"not_connected","key_scheme":"vna_","gateway_key_scheme":"vnl_","gateway_admin_path":"/v1/ceres/admin/gateway"}
