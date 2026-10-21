"""Slime opt-in distributed node registry for Vanilla / WeiGuo.

This service deliberately DOES NOT run remote code, send prompts, control power,
or claim to serve a sharded LLM. Only attested-ish heartbeats (self-reported)
and owner-controlled dispatch eligibility. Tokens are hashed at rest.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import string
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from auth import FamilyIdentity, family_user

router = APIRouter()
node_router = APIRouter()  # public API only for consented device tokens
ONLINE_SECONDS = 150
MAX_PER_OWNER = 50
MAX_ACTIVE_INVITES = 10
INVITE_SECONDS = 600
PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # remove ambiguous I,L,O,0,1
PAIR_RE = re.compile(r"^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$")
PAIR_MAX_FAILED_PER_IP = 12
PAIR_MAX_FAILED_GLOBAL = 1000

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
        # Existing registries are migrated safely; every node starts with inference OFF.
        cols={row["name"] for row in c.execute("PRAGMA table_info(nodes)").fetchall()}
        if "inference_enabled" not in cols:
            c.execute("ALTER TABLE nodes ADD COLUMN inference_enabled INTEGER NOT NULL DEFAULT 0")
        c.execute("""CREATE TABLE IF NOT EXISTS slime_reward_revocation(
          node_id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, revoked_at INTEGER NOT NULL)""")
        extras={
            "paired_at":"REAL NOT NULL DEFAULT 0","pair_number":"INTEGER NOT NULL DEFAULT 0",
            "notified_at":"REAL NOT NULL DEFAULT 0","geo_opt_in":"INTEGER NOT NULL DEFAULT 0",
            "public_ip":"TEXT NOT NULL DEFAULT ''","geo_area":"TEXT NOT NULL DEFAULT ''",
            "cpu_pct":"REAL","gpu_temp_c":"REAL","gpu_util_pct":"REAL",
            "max_load_pct":"INTEGER NOT NULL DEFAULT 100",
            "thermal_limit_c":"INTEGER NOT NULL DEFAULT 82",
            "shutdown_opt_in":"INTEGER NOT NULL DEFAULT 0",
            "pending_power_off":"REAL NOT NULL DEFAULT 0"
        }
        for key,definition in extras.items():
            if key not in cols:
                c.execute("ALTER TABLE nodes ADD COLUMN "+key+" "+definition)
        c.execute("""CREATE TABLE IF NOT EXISTS slime_owner_sequence(
          owner TEXT PRIMARY KEY,last_number INTEGER NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS slime_short_pair(
          digest TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS slime_pair_failures(
          actor TEXT NOT NULL, happened_at REAL NOT NULL)""")
        c.execute("CREATE INDEX IF NOT EXISTS slime_pair_failures_actor "
                  "ON slime_pair_failures(actor,happened_at)")
        c.execute("""CREATE TABLE IF NOT EXISTS slime_pair_security(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1), salt TEXT NOT NULL)""")
        c.execute("INSERT OR IGNORE INTO slime_pair_security VALUES(1,?)",
                  (secrets.token_hex(24),))
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

def normalize_short_code(text: str) -> str | None:
    """Human-entered code: accept spaces/hyphens/lowercase, never normalize confusables."""
    if not isinstance(text,str) or len(text)>48:
        return None
    raw=re.sub(r"[-\s]","",text).upper()
    return raw if PAIR_RE.fullmatch(raw) else None


def issue_short_pair(owner: str) -> dict:
    """Authenticated caller only. Plain code exists ONLY in the creation response."""
    _enabled()
    origin=_safe_origin()
    now=time.time()
    with _db() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("DELETE FROM invites WHERE expires<?",(now,))
        c.execute("DELETE FROM slime_short_pair WHERE expires<?",(now,))
        active_long=c.execute("SELECT COUNT(*) FROM invites WHERE owner=?",(owner,)).fetchone()[0]
        active_short=c.execute("SELECT COUNT(*) FROM slime_short_pair WHERE owner=?",(owner,)).fetchone()[0]
        if active_long+active_short>=MAX_ACTIVE_INVITES:
            raise HTTPException(429,"待使用的 Slime 邀請數量已達上限")
        raw="".join(secrets.choice(PAIR_ALPHABET) for _ in range(12))
        c.execute("INSERT INTO slime_short_pair(digest,owner,expires) VALUES(?,?,?)",
                  (_digest("short:"+raw),owner,now+INVITE_SECONDS))
        c.commit()
    formatted="-".join((raw[:4],raw[4:8],raw[8:]))
    return {"code":formatted,"link":_pairing_page_url()+"#slime="+formatted,
            "expires_seconds":INVITE_SECONDS,"single_use":True,
            "notice":"只能配對一次，不是裝置的永久密碼"}


def _redeem_short_pair(*, code:str, label:str, role:str, client_address:str, geo_opt_in:bool=False, shutdown_opt_in:bool=False, public_ip:str="") -> dict:
    """Atomically consume code and create a device, with persistent brute-force limits."""
    _enabled()
    now=time.time()
    if role not in ("owner","friend"):
        raise HTTPException(400,"不支援的節點角色")
    normalized=normalize_short_code(code)
    if len(label.strip())<1:
        raise HTTPException(422,"請填寫裝置名稱")
    with _db() as c:
        c.execute("BEGIN IMMEDIATE")
        salt=c.execute("SELECT salt FROM slime_pair_security WHERE singleton=1").fetchone()[0]
        address=client_address if client_address and len(client_address)<100 else "unknown"
        actor=_digest(salt+":"+address)
        c.execute("DELETE FROM slime_pair_failures WHERE happened_at<?",(now-600,))
        failed=c.execute("SELECT COUNT(*) FROM slime_pair_failures WHERE actor=?",(actor,)).fetchone()[0]
        total=c.execute("SELECT COUNT(*) FROM slime_pair_failures").fetchone()[0]
        if failed>=PAIR_MAX_FAILED_PER_IP or total>=PAIR_MAX_FAILED_GLOBAL:
            raise HTTPException(429,"配對嘗試過於頻繁，請稍後再試")
        found=(c.execute("SELECT owner FROM slime_short_pair WHERE digest=? AND expires>?",
                        (_digest("short:"+normalized),now)).fetchone()
               if normalized else None)
        if not found:
            c.execute("INSERT INTO slime_pair_failures VALUES(?,?)",(actor,now))
            c.commit()
            raise HTTPException(403,"配對碼無效、已使用或已過期")
        count=c.execute("SELECT COUNT(*) FROM nodes WHERE owner=?",
                        (found["owner"],)).fetchone()[0]
        if count>=MAX_PER_OWNER:
            raise HTTPException(429,"節點已達上限")
        token=secrets.token_urlsafe(32)
        node_id=secrets.token_hex(12)
        c.execute("DELETE FROM slime_short_pair WHERE digest=?",
                  (_digest("short:"+normalized),))
        c.execute("""INSERT INTO slime_owner_sequence(owner,last_number) VALUES(?,1)
            ON CONFLICT(owner) DO UPDATE SET last_number=last_number+1""",(found["owner"],))
        pair_number=c.execute("SELECT last_number FROM slime_owner_sequence WHERE owner=?",
                              (found["owner"],)).fetchone()[0]
        from slime_ops import valid_public_ip
        ip=(valid_public_ip(public_ip) or valid_public_ip(client_address)) if geo_opt_in else ""
        c.execute("""INSERT INTO nodes(id,owner,token_digest,label,role,last_seen,
          paired_at,pair_number,geo_opt_in,public_ip,shutdown_opt_in)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
          (node_id,found["owner"],_digest(token),label.strip(),role,now,
           now,pair_number,int(geo_opt_in),ip,int(shutdown_opt_in)))
        c.commit()
    return {"node_id":node_id,"token":token,
            "heartbeat_interval_seconds":60,"inference_enabled":False}


def _safe_origin():
    raw = os.environ.get("SLIME_PUBLIC_API_ORIGIN", "").strip().rstrip("/")
    parts = urlsplit(raw)
    if (parts.scheme != "https" or not parts.hostname or parts.username or
        parts.password or parts.path or parts.query or parts.fragment):
        raise HTTPException(503, "Slime 公開 HTTPS 網域尚未設定")
    return raw

def _pairing_page_url() -> str:
    """Canonical standalone pairing portal; separate from WeiGuo API origin.

    The web page receives a one-time code in a URL *fragment* only. No
    third-party QR service or public API endpoint receives the fragment.
    """
    target=os.getenv("SLIME_PAIRING_PAGE_URL",
                     "https://easylearnfromtw.github.io/vanilla/slime/").strip()
    parts=urlsplit(target)
    if (parts.scheme!="https" or not parts.hostname or parts.username or parts.password
        or parts.query or parts.fragment or parts.port not in (None,443)
        or ".." in parts.path or "\\" in parts.path):
        raise HTTPException(503,"Slime 獨立配對網頁網址未正確設定")
    return target.rstrip("/")+"/"


class JoinRequest(BaseModel):
    invite: str = Field(min_length=24, max_length=160)
    label: str = Field(min_length=1, max_length=64)
    role: str = "friend"
    geo_opt_in: bool = False
    shutdown_opt_in: bool = False
    public_ip: str = Field(default="", max_length=48)

class Caps(BaseModel):
    cpu: int = Field(default=0, ge=0, le=512)
    ram_gb: float = Field(default=0, ge=0, le=2048)
    gpu: str = Field(default="", max_length=150)
    os: str = Field(default="", max_length=80)
    cpu_pct: float | None = Field(default=None,ge=0,le=100)
    gpu_temp_c: float | None = Field(default=None,ge=0,le=125)
    gpu_util_pct: float | None = Field(default=None,ge=0,le=100)

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
            "inference_enabled": False, "power_control_enabled": True,
            "power_on_enabled": False, "power_off_requires_device_opt_in": True,
            "heartbeat_seconds": ONLINE_SECONDS}

@router.post("/v1/family/slime/invite")
def issue_invite(user: FamilyIdentity = Depends(_owner)):
    _enabled()
    raise HTTPException(403, "請在 Ceres Telegram Owner 私聊核發 Slime 配對碼")


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
        "inference_enabled": bool(r["inference_enabled"]),
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

@router.post("/v1/family/slime/nodes/{node_id}/inference")
def inference_policy(node_id: str, body: Policy, user: FamilyIdentity = Depends(_owner)):
    """Explicit Owner approval is mandatory even for nodes claiming role=owner."""
    if not 8<=len(node_id)<=48:
        raise HTTPException(404,"找不到節點")
    with _db() as c:
        result=c.execute("UPDATE nodes SET inference_enabled=? WHERE id=? AND owner=?",
                         (int(body.enabled),node_id,user.sub))
        if not result.rowcount:
            raise HTTPException(404,"找不到節點")
    return {"ok":True,"inference_enabled":body.enabled,
            "notice":"啟用後，外部使用者的模型提示可能傳送至這個受信任的節點。"}


class RevokeProof(BaseModel):
    # Requested separately from Ceres Telegram; never generated on the public web.
    code: str = Field(min_length=8, max_length=64)


@router.post("/v1/family/slime/nodes/{node_id}/revoke")
def revoke(node_id: str, body: RevokeProof, user: FamilyIdentity = Depends(_owner)):
    """Owner remote revocation cannot bypass the bot-issued, node-bound OTP."""
    from slime_revoke_gate import consume_revoke, RevokeDenied
    try:
        consume_revoke(user.sub, node_id, body.code)
    except RevokeDenied as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return {"ok": True, "verified_by": "telegram", "node_id": node_id}

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

class PairRequest(BaseModel):
    code: str = Field(min_length=8,max_length=48)
    label: str = Field(min_length=1,max_length=64)
    role: str = "friend"
    geo_opt_in: bool = False
    shutdown_opt_in: bool = False
    public_ip: str = Field(default="", max_length=48)


@node_router.post("/v1/slime/node/pair")
def pair(body: PairRequest, request: Request):
    # Never trust caller-controlled X-Forwarded-For for rate limiting.
    address=request.client.host if request.client else "unknown"
    return _redeem_short_pair(code=body.code,label=body.label,
                              role=body.role,client_address=address,
                              geo_opt_in=body.geo_opt_in,
                              shutdown_opt_in=body.shutdown_opt_in,
                              public_ip=body.public_ip)


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
        c.execute("""INSERT INTO slime_owner_sequence(owner,last_number) VALUES(?,1)
            ON CONFLICT(owner) DO UPDATE SET last_number=last_number+1""",(invited["owner"],))
        number=c.execute("SELECT last_number FROM slime_owner_sequence WHERE owner=?",
                         (invited["owner"],)).fetchone()[0]
        from slime_ops import valid_public_ip
        public_ip=valid_public_ip(body.public_ip) if body.geo_opt_in else ""
        c.execute("""INSERT INTO nodes(id,owner,token_digest,label,role,last_seen,
          paired_at,pair_number,geo_opt_in,public_ip,shutdown_opt_in)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
          (node_id,invited["owner"],_digest(token),body.label.strip(),body.role,
           now,now,number,int(body.geo_opt_in),public_ip,int(body.shutdown_opt_in)))
        c.commit()
    return {"node_id": node_id, "token": token, "heartbeat_interval_seconds": 60,
            "inference_enabled": False}

@node_router.post("/v1/slime/node/heartbeat")
def heartbeat(body: Heartbeat, authorization: str | None = Header(default=None),
              background_tasks: BackgroundTasks = None):
    _enabled()
    now=time.time()
    now=time.time()
    with _db() as c:
        r=_node(c,authorization)
        c.execute("""UPDATE nodes SET last_seen=?,cpu=?,ram_gb=?,gpu=?,os=?,
            cpu_pct=?,gpu_temp_c=?,gpu_util_pct=?,share_enabled=? WHERE id=?""",
            (now,body.capabilities.cpu,body.capabilities.ram_gb,body.capabilities.gpu,
             body.capabilities.os,body.capabilities.cpu_pct,body.capabilities.gpu_temp_c,
             body.capabilities.gpu_util_pct,int(body.share_enabled),r["id"]))
        claimed=bool(r["paired_at"]) and c.execute("""UPDATE nodes SET notified_at=? WHERE id=? AND
                   (notified_at=0 OR (notified_at<0 AND notified_at>?))""",
                   (-now,r["id"],-(now-180))).rowcount==1
        owner_allowed=bool(r["owner_enabled"])
        temp=body.capabilities.gpu_temp_c
        overheating=temp is not None and temp>=r["thermal_limit_c"]
        c.commit()
    if claimed and background_tasks is not None:
        from slime_ops import notify_pairing
        background_tasks.add_task(notify_pairing,r["id"])
    elif claimed:
        with _db() as c:
            c.execute("UPDATE nodes SET notified_at=0 WHERE id=? AND notified_at=?",
                      (r["id"],-now))
    return {"ok":True,"owner_enabled":owner_allowed,
            "inference_enabled":bool(r["inference_enabled"]) and owner_allowed
                  and body.share_enabled and not overheating and r["max_load_pct"]>0,
            "max_load_pct":r["max_load_pct"],"thermal_limit_c":r["thermal_limit_c"],
            "thermal_paused":overheating,"commands":[]}


@node_router.post("/v1/slime/node/power/poll")
def power_poll(authorization: str | None = Header(default=None)):
    """Only this paired device may consume its short-lived opted-in power command."""
    _enabled()
    with _db() as db:
        db.execute("BEGIN IMMEDIATE")
        node=_node(db,authorization)
        if (not node["shutdown_opt_in"] or not node["pending_power_off"] or
            node["pending_power_off"]<=time.time()):
            db.commit()
            return {"command":None}
        db.execute("UPDATE nodes SET pending_power_off=0 WHERE id=?",(node["id"],))
        db.commit()
        return {"command":"shutdown","grace_seconds":60}


@node_router.post("/v1/slime/node/leave")
def leave(authorization: str | None = Header(default=None)):
    _enabled()
    with _db() as c:
        c.execute("BEGIN IMMEDIATE")
        r = _node(c, authorization)
        from slime_reward_policy import note_deleted_node
        note_deleted_node(c,r["id"],r["owner"])
        c.execute("DELETE FROM nodes WHERE id=?", (r["id"],))
        c.commit()
    # The node holder always retains the right to leave, even when the
    # reward service is disabled, offline, or cannot complete the follow-up.
    try:
        from slime_reward_policy import reconcile_node_revocations
        reconcile_node_revocations()
    except Exception:
        pass  # Durable tombstone is reconciled at next authenticated wallet/API access.
    return {"ok": True, "notice":"已退出，已發節點獎勵將被追回"}
