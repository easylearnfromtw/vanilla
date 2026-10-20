"""Authenticated, opt-in Ceres Telegram <-> foreground Vanilla local-model bridge."""
import hashlib
import os
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import FamilyIdentity, family_reader
from ceres_gateway import _enabled, _session

router = APIRouter(prefix="/v1/family/ceres/bridge", tags=["ceres-bridge"])
MAX_AGE = 300
LEASE_SECONDS = 90

def enabled():
    return (_enabled() and os.getenv("CERES_LOCAL_BRIDGE_ENABLED", "").lower() == "true"
            and os.getenv("CERES_OUTBOUND_ENABLED", "").lower() == "true")

def setup(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_agent_jobs (
        event_id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL,
        status TEXT NOT NULL, lease_hash TEXT, claimed_at INTEGER,
        updated_at INTEGER NOT NULL)""")

def authorized(user):
    from ceres_dialogue import _authorized_chat
    if not enabled():
        raise HTTPException(503, "Ceres foreground bridge is disabled")
    return _authorized_chat(user)

def owns(db, event_id, chat_id, lease):
    row=db.execute("SELECT status,lease_hash,claimed_at FROM ceres_agent_jobs WHERE event_id=? AND chat_id=?",
                   (event_id,chat_id)).fetchone()
    return bool(row and row["status"]=="leased" and row["lease_hash"]
                and secrets.compare_digest(row["lease_hash"], hashlib.sha256(lease.encode()).hexdigest())
                and row["claimed_at"] and row["claimed_at"]+LEASE_SECONDS>int(time.time()))

class Request(BaseModel):
    lease:str=Field(min_length=32,max_length=128,pattern=r"^[A-Za-z0-9_-]+$")
class Result(Request):
    text:str=Field(min_length=1,max_length=1200)
    tool:str=Field(default="merlin",pattern=r"^(merlin|diana|cream|scouts|erya|none)$")

@router.get("/status")
async def status(user: FamilyIdentity=Depends(family_reader)):
    linked=bool(authorized(user)) if enabled() else False
    return {"enabled":enabled(),"linked":linked,"runtime":"foreground-pwa-only",
            "alwaysOn":False,"tools":["merlin","diana","cream","scouts","erya"],
            "automaticRepliesWhenConnected":linked,"privilegedExecution":False}

@router.post("/claim")
async def claim(user: FamilyIdentity=Depends(family_reader)):
    chat=authorized(user);now=int(time.time())
    with _session() as db:
        setup(db);db.execute("BEGIN IMMEDIATE")
        db.execute("UPDATE ceres_agent_jobs SET status='expired',lease_hash=NULL,updated_at=? "
                   "WHERE chat_id=? AND ((status='queued' AND updated_at<?) "
                   "OR (status='leased' AND claimed_at<?))",
                   (now,chat,now-MAX_AGE,now-LEASE_SECONDS))
        if db.execute("SELECT COUNT(*) FROM ceres_agent_jobs WHERE chat_id=? AND claimed_at>=?",
                      (chat,now-60)).fetchone()[0]>=4:
            return {"job":None,"rateLimited":True}
        row=db.execute("SELECT j.event_id,i.text,i.created_at FROM ceres_agent_jobs j "
                       "JOIN ceres_inbox i ON i.id=j.event_id "
                       "WHERE j.chat_id=? AND j.status='queued' AND i.created_at>=? "
                       "ORDER BY j.event_id LIMIT 1",(chat,now-MAX_AGE)).fetchone()
        if row is None:return {"job":None,"rateLimited":False}
        lease=secrets.token_urlsafe(32)
        db.execute("UPDATE ceres_agent_jobs SET status='leased',lease_hash=?,"
                   "claimed_at=?,updated_at=? WHERE event_id=?",
                   (hashlib.sha256(lease.encode()).hexdigest(),now,now,row["event_id"]))
        return {"job":{"eventId":row["event_id"],"text":row["text"],
                       "createdAt":row["created_at"],"lease":lease},"rateLimited":False}

@router.post("/events/{event_id}/skip")
async def skip(event_id:int,body:Request,user:FamilyIdentity=Depends(family_reader)):
    chat=authorized(user)
    with _session() as db:
        setup(db);db.execute("BEGIN IMMEDIATE")
        if not owns(db,event_id,chat,body.lease):
            raise HTTPException(409,"Bridge lease expired or unavailable")
        db.execute("UPDATE ceres_agent_jobs SET status='skipped',lease_hash=NULL,updated_at=? "
                   "WHERE event_id=?",(int(time.time()),event_id))
    return {"skipped":True,"sent":False}
