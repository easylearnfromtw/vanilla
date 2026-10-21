"""Gecko Fleet: explicitly authorized, code-free bulk server enrollment.

The Owner issues a time-limited deployment credential from Ceres. An operator
installs this credential only on machines under their control (for example,
through an approved image, MDM, Ansible or Kubernetes Secret). Each agent
receives an independent Slime bearer, stored hashed on the server. No LAN
scanning, self-propagation or silent installation occurs.

SQLite is an initial single-controller store, not a multi-writer fleet DB.
Migrate enrollment/heartbeat to PostgreSQL before large (>~1k) production use.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from slime import _db, _enabled, _bearer, _digest, _node

router=APIRouter(prefix="/v1/gecko",tags=["gecko-fleet"])
TOKEN_PATTERN=re.compile(r"^gck_[A-Za-z0-9_-]{40,120}$")
ID_PATTERN=re.compile(r"^[a-f0-9]{24}$")
NAME_PATTERN=re.compile(r"^[\w .-]{1,50}$",re.UNICODE)
VERSION_PATTERN=re.compile(r"^slime-v[A-Za-z0-9._-]{1,65}$")
MAX_FLEET_ENROLLMENT=2000
MAX_FLEET_PER_OWNER=10000

def _ready():
    _enabled()
    if os.getenv("GECKO_FLEET_ENABLED","false").lower()!="true":
        raise HTTPException(503,"Gecko Fleet 尚未在後端啟用")

def _tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS gecko_fleet_pools(
      id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, name TEXT NOT NULL,
      token_digest TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, capacity INTEGER NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 0, revoked_at INTEGER,
      desired_version TEXT NOT NULL DEFAULT '', canary_percent INTEGER NOT NULL DEFAULT 0)""")
    db.execute("""CREATE TABLE IF NOT EXISTS gecko_fleet_members(
      node_id TEXT PRIMARY KEY, pool_id TEXT NOT NULL,
      owner_sub TEXT NOT NULL, created_at INTEGER NOT NULL,
      fingerprint_digest TEXT NOT NULL DEFAULT '')""")
    db.execute("CREATE INDEX IF NOT EXISTS gecko_fleet_pool_member_idx ON gecko_fleet_members(pool_id)")
    db.execute("CREATE INDEX IF NOT EXISTS gecko_fleet_pools_owner_idx ON gecko_fleet_pools(owner_sub)")

def create_pool(owner: str,name: str, capacity: int=20, lifetime_seconds:int=3600) -> dict:
    _ready()
    if (not isinstance(name,str) or not NAME_PATTERN.fullmatch(name.strip())
        or type(capacity) is not int or not 1<=capacity<=MAX_FLEET_ENROLLMENT
        or type(lifetime_seconds) is not int or not 60<=lifetime_seconds<=86400):
        raise HTTPException(422,"Gecko 叢集名稱、台數或有效期限不合法")
    now=int(time.time())
    pool_id=secrets.token_hex(12)
    secret="gck_"+secrets.token_urlsafe(36)
    with _db() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        count=db.execute("SELECT COUNT(*) FROM gecko_fleet_pools WHERE owner_sub=? AND revoked_at IS NULL AND expires_at>?",
                         (owner,now)).fetchone()[0]
        if count>=30:
            raise HTTPException(429,"同時有效的 Gecko 註冊批次已達上限")
        db.execute("""INSERT INTO gecko_fleet_pools(id,owner_sub,name,token_digest,
             created_at,expires_at,capacity) VALUES(?,?,?,?,?,?,?)""",
             (pool_id,owner,name.strip(),_digest(secret),now,now+lifetime_seconds,capacity))
        db.commit()
    # Raw enrollment secret is shown ONCE, only inside signed Telegram Mini App.
    return {"poolId":pool_id,"enrollmentToken":secret,"expiresAt":now+lifetime_seconds,
            "capacity":capacity,"name":name.strip(),"joinRole":"friend",
            "inferenceEnabled":False}

def revoke_pool(owner:str,pool_id:str)->dict:
    _ready()
    if not ID_PATTERN.fullmatch(pool_id):raise HTTPException(422,"Gecko 批次 ID 格式錯誤")
    now=int(time.time())
    with _db() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        changed=db.execute("""UPDATE gecko_fleet_pools
          SET revoked_at=COALESCE(revoked_at,?) WHERE owner_sub=? AND id=?""",
          (now,owner,pool_id))
        if changed.rowcount!=1:raise HTTPException(404,"找不到 Gecko 批次")
        db.commit()
    return {"revoked":True,"notice":"已停止核發新的節點憑證，既有節點不會被擅自刪除"}

def set_rollout(owner:str,pool_id:str,version:str,canary_percent:int)->dict:
    _ready()
    if not ID_PATTERN.fullmatch(pool_id) or (version and not VERSION_PATTERN.fullmatch(version)):
        raise HTTPException(422,"版本或 Gecko 批次 ID 格式錯誤")
    if type(canary_percent) is not int or not 0<=canary_percent<=100:
        raise HTTPException(422,"灰度比例必須介於 0–100%")
    with _db() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        n=db.execute("""UPDATE gecko_fleet_pools SET desired_version=?,canary_percent=?
          WHERE owner_sub=? AND id=? AND revoked_at IS NULL""",
          (version,canary_percent,owner,pool_id)).rowcount
        if not n:raise HTTPException(404,"找不到有效 Gecko 批次")
        db.commit()
    return {"desiredVersion":version,"canaryPercent":canary_percent,
            "autoInstall":False,"note":"僅發布期望版本；Agent 必須驗證官方 SHA256，且不執行遠端程式碼"}

def snapshot(owner:str,page:int=0)->dict:
    _ready()
    if type(page) is not int or not 0<=page<=100000:
        raise HTTPException(422,"頁碼不合法")
    with _db() as db:
        _tables(db)
        rows=db.execute("""SELECT id,name,capacity,accepted,expires_at,revoked_at,
             desired_version,canary_percent FROM gecko_fleet_pools
             WHERE owner_sub=? ORDER BY created_at DESC LIMIT 30""",(owner,)).fetchall()
        members=db.execute("""SELECT m.node_id,m.pool_id,n.label,n.os,n.cpu,n.ram_gb,
             n.gpu,n.last_seen,n.owner_enabled,n.inference_enabled
             FROM gecko_fleet_members m JOIN nodes n ON n.id=m.node_id
             WHERE m.owner_sub=? ORDER BY m.created_at DESC LIMIT 100 OFFSET ?""",
             (owner,page*100)).fetchall()
        total=db.execute("SELECT COUNT(*) FROM gecko_fleet_members WHERE owner_sub=?",(owner,)).fetchone()[0]
    now=time.time()
    return {"pools":[{"id":r["id"],"name":r["name"],"capacity":r["capacity"],
            "accepted":r["accepted"],"expiresAt":r["expires_at"],
            "revoked":r["revoked_at"] is not None,"desiredVersion":r["desired_version"],
            "canaryPercent":r["canary_percent"]} for r in rows],
            "members":[{"nodeId":r["node_id"],"poolId":r["pool_id"],
                "label":r["label"],"os":r["os"],"cpu":r["cpu"],"ramGB":r["ram_gb"],
                "gpu":r["gpu"],"online":now-r["last_seen"]<=150,
                "ownerEnabled":bool(r["owner_enabled"]),
                "inferenceEnabled":bool(r["inference_enabled"])} for r in members],
            "totalNodes":total,"page":page,"pageSize":100,
            "deployMode":"managed-agent","relayEnabled":False}

class Enrollment(BaseModel):
    token: str=Field(min_length=44,max_length=128)
    label: str=Field(min_length=1,max_length=64)
    device_consent: bool=False

@router.post("/agent/enroll")
def enroll(body:Enrollment):
    _ready()
    if (not body.device_consent or not TOKEN_PATTERN.fullmatch(body.token)
        or not isinstance(body.label,str) or not body.label.strip()):
        raise HTTPException(403,"Gecko 必須取得主機管理者的有效部署授權")
    now=int(time.time())
    bearer=secrets.token_urlsafe(32)
    node_id=secrets.token_hex(12)
    with _db() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        # An index-backed digest lookup avoids password-search timing leaks.
        pool=db.execute("""SELECT * FROM gecko_fleet_pools
            WHERE token_digest=? AND expires_at>? AND revoked_at IS NULL""",
            (_digest(body.token),now)).fetchone()
        if not pool or pool["accepted"]>=pool["capacity"]:
            raise HTTPException(403,"Gecko 註冊授權已過期、撤銷或達到容量")
        count=db.execute("""SELECT COUNT(*) FROM gecko_fleet_members
          WHERE owner_sub=?""",(pool["owner_sub"],)).fetchone()[0]
        if count>=MAX_FLEET_PER_OWNER:
            raise HTTPException(429,"此管理者的 Gecko 節點總量已達上限")
        # Nodes always begin as Friend, inference OFF, power OFF, geo OFF.
        db.execute("""INSERT INTO nodes(id,owner,token_digest,label,role,last_seen,
           paired_at,geo_opt_in,shutdown_opt_in,share_enabled,owner_enabled,inference_enabled)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
           (node_id,pool["owner_sub"],_digest(bearer),body.label.strip(),
            "friend",now,now,0,0,1,1,0))
        db.execute("""INSERT INTO gecko_fleet_members(node_id,pool_id,owner_sub,created_at)
            VALUES(?,?,?,?)""",(node_id,pool["id"],pool["owner_sub"],now))
        db.execute("UPDATE gecko_fleet_pools SET accepted=accepted+1 WHERE id=?",(pool["id"],))
        db.commit()
    return {"node_id":node_id,"token":bearer,"role":"friend",
            "inference_enabled":False,"poolId":pool["id"],
            "heartbeat_interval_seconds":60}

@router.get("/agent/desired")
def desired(authorization:str|None=Header(default=None)):
    _ready()
    with _db() as db:
        _tables(db)
        node=_node(db,authorization)
        record=db.execute("""SELECT p.id,p.desired_version,p.canary_percent,p.revoked_at
          FROM gecko_fleet_members m JOIN gecko_fleet_pools p ON p.id=m.pool_id
          WHERE m.node_id=? AND m.owner_sub=?""",
          (node["id"],node["owner"])).fetchone()
        if not record:raise HTTPException(404,"此節點不是 Gecko 受管主機")
        # Stable allocation across restarts, not arbitrary random selections.
        bucket=int(hashlib.sha256(node["id"].encode()).hexdigest()[:8],16)%100
        selected=(record["revoked_at"] is None and bucket<record["canary_percent"])
    return {"poolId":record["id"],"desiredVersion":record["desired_version"] if selected else "",
            "inCanary":selected,"downloadOnly":True,"autoInstall":False,
            "commandExecution":False}
