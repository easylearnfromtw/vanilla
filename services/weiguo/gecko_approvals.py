"""Gecko optional Telegram approval for an explicitly requested LAN download or join.

Only an already-paired, opted-in Owner Slime node can create/poll requests;
only a signed Telegram Owner Mini App can approve/reject. No shared Telegram
pairing code, remote installer execution, or unconsented file transfer.
"""
from __future__ import annotations

import secrets
import time

from fastapi import APIRouter,Header,HTTPException
from pydantic import BaseModel,Field

from slime import _db,_enabled,_node,ONLINE_SECONDS,gecko_invite

router=APIRouter(tags=["gecko"])
REQUEST_TTL=240


def _tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS slime_gecko_requests(
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, parent_id TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('download','join')),
      device_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','consumed')),
      issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      decided_at INTEGER NOT NULL DEFAULT 0)""")
    db.execute("CREATE INDEX IF NOT EXISTS slime_gecko_requests_owner ON slime_gecko_requests(owner,status,expires_at)")


def _check_parent(db,authorization:str|None):
    parent=_node(db,authorization)
    if (parent["role"]!="owner" or not parent["gecko_enabled"] or
        not parent["owner_enabled"] or not parent["share_enabled"] or
        time.time()-parent["last_seen"]>ONLINE_SECONDS):
        raise HTTPException(403,"Gecko Owner 未授權或已離線")
    return parent


class GeckoRequest(BaseModel):
    purpose: str=Field(pattern=r"^(download|join)$")
    device_label: str=Field(min_length=1,max_length=64)


class GeckoCheck(BaseModel):
    request_id: str=Field(pattern=r"^[a-f0-9]{48}$")


@router.post("/v1/slime/node/gecko/request")
def request_owner_approval(body:GeckoRequest,authorization:str|None=Header(default=None)):
    _enabled()
    now=int(time.time())
    with _db() as db:
        db.execute("BEGIN IMMEDIATE")
        parent=_check_parent(db,authorization)
        _tables(db)
        db.execute("DELETE FROM slime_gecko_requests WHERE expires_at<?",(now-3600,))
        count=db.execute("""SELECT COUNT(*) FROM slime_gecko_requests
            WHERE parent_id=? AND issued_at>?""",(parent["id"],now-3600)).fetchone()[0]
        if count>=12:
            raise HTTPException(429,"每台 Gecko 主機每小時最多申請 12 次")
        request_id=secrets.token_hex(24)
        db.execute("""INSERT INTO slime_gecko_requests
            (id,owner,parent_id,purpose,device_label,status,issued_at,expires_at)
            VALUES(?,?,?,?,?,'pending',?,?)""",
            (request_id,parent["owner"],parent["id"],body.purpose,
             body.device_label.strip(),now,now+REQUEST_TTL))
        db.commit()
    return {"requestId":request_id,"status":"pending",
            "expiresSeconds":REQUEST_TTL,"approval":"telegram-owner-miniapp"}


@router.post("/v1/slime/node/gecko/check")
def check_owner_approval(body:GeckoCheck,authorization:str|None=Header(default=None)):
    _enabled()
    now=int(time.time())
    with _db() as db:
        db.execute("BEGIN IMMEDIATE")
        parent=_check_parent(db,authorization)
        _tables(db)
        row=db.execute("""SELECT id,purpose,status,expires_at FROM slime_gecko_requests
            WHERE id=? AND parent_id=? AND owner=?""",
            (body.request_id,parent["id"],parent["owner"])).fetchone()
        if not row or now>=row["expires_at"]:
            raise HTTPException(410,"Gecko 授權已過期")
        if row["status"]=="rejected":
            return {"status":"rejected"}
        if row["status"]=="pending":
            return {"status":"pending"}
        if row["status"]=="consumed":
            raise HTTPException(409,"Gecko 授權已使用")
        if row["purpose"]=="download":
            db.execute("UPDATE slime_gecko_requests SET status='consumed' WHERE id=?",
                       (body.request_id,))
            db.commit()
            return {"status":"approved","purpose":"download"}
        # Make approval one-use before creating an independently single-use
        # Slime friend ticket; rollback on any failure to issue.
        db.execute("UPDATE slime_gecko_requests SET status='consumed' WHERE id=?",
                   (body.request_id,))
        db.commit()
    # The node still must be eligible; gecko_invite enforces sharing policy,
    # rate limits, fresh heartbeat, and friend-only pairing.
    grant=gecko_invite(authorization=authorization)
    return {"status":"approved","purpose":"join","ticket":grant["ticket"],
            "expiresSeconds":grant["expiresSeconds"]}


def pending_requests(owner_sub:str)->list[dict]:
    now=int(time.time())
    with _db() as db:
        _tables(db)
        rows=db.execute("""SELECT id,purpose,device_label,issued_at,expires_at
            FROM slime_gecko_requests WHERE owner=? AND status='pending'
            AND expires_at>? ORDER BY issued_at DESC LIMIT 30""",
            (owner_sub,now)).fetchall()
    return [{"requestId":r["id"],"purpose":r["purpose"],
             "deviceLabel":r["device_label"],"issuedAt":r["issued_at"],
             "expiresSeconds":r["expires_at"]-now} for r in rows]


def decide_request(owner_sub:str,request_id:str,approve:bool)->dict:
    if len(request_id)!=48 or any(c not in "0123456789abcdef" for c in request_id):
        raise HTTPException(422,"無效的 Gecko 請求編號")
    now=int(time.time())
    with _db() as db:
        db.execute("BEGIN IMMEDIATE")
        _tables(db)
        row=db.execute("""SELECT r.*,n.gecko_enabled,n.owner_enabled,n.share_enabled,
                         n.last_seen,n.role FROM slime_gecko_requests r
            LEFT JOIN nodes n ON n.id=r.parent_id AND n.owner=r.owner
            WHERE r.id=? AND r.owner=?""",(request_id,owner_sub)).fetchone()
        if (not row or row["status"]!="pending" or now>=row["expires_at"] or
            row["role"]!="owner" or not row["gecko_enabled"] or
            not row["owner_enabled"] or not row["share_enabled"] or
            now-row["last_seen"]>ONLINE_SECONDS):
            raise HTTPException(409,"請求已過期、已處理或分享主機已離線")
        db.execute("""UPDATE slime_gecko_requests SET status=?,decided_at=?
            WHERE id=? AND status='pending'""",
            ("approved" if approve else "rejected",now,request_id))
        db.commit()
    return {"ok":True,"status":"approved" if approve else "rejected",
            "purpose":row["purpose"],"deviceLabel":row["device_label"]}
