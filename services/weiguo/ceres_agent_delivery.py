"""Authenticated Ceres bridge reply completion, backed by existing one-shot outbox."""
import time
import httpx
from fastapi import APIRouter, Depends, HTTPException
from auth import FamilyIdentity, family_reader
from ceres_gateway import _session
from ceres_agent_bridge import Result, authorized, owns, setup, MAX_AGE
from ceres_dialogue import _bot_token, _outbox_table

router=APIRouter(prefix="/v1/family/ceres/bridge", tags=["ceres-bridge-delivery"])

@router.post("/events/{event_id}/complete")
async def complete(event_id:int, body:Result, user:FamilyIdentity=Depends(family_reader)):
    chat=authorized(user)
    now=int(time.time())
    if event_id<=0 or not body.text.strip() or "\x00" in body.text:
        raise HTTPException(422,"Invalid Ceres reply")
    with _session() as db:
        setup(db)
        _outbox_table(db)
        db.execute("BEGIN IMMEDIATE")
        if not owns(db,event_id,chat,body.lease):
            raise HTTPException(409,"Bridge lease expired or unavailable")
        row=db.execute("SELECT created_at FROM ceres_inbox WHERE id=? AND chat_id=? AND provider='telegram'",
                       (event_id,chat)).fetchone()
        if not row or row["created_at"]<now-MAX_AGE:
            raise HTTPException(409,"Old message cannot be replied to automatically")
        if db.execute("SELECT 1 FROM ceres_outbox WHERE event_id=?",
                      (event_id,)).fetchone():
            raise HTTPException(409,"Reply already attempted")
        recent=db.execute("SELECT COUNT(*) FROM ceres_outbox WHERE owner_sub=? AND created_at>=?",
                          (user.sub,now-60)).fetchone()[0]
        if recent>=4:raise HTTPException(429,"Ceres reply rate limit")
        db.execute("INSERT INTO ceres_outbox(event_id,chat_id,owner_sub,status,created_at,updated_at) "
                   "VALUES(?,?,?,'reserved',?,?)",(event_id,chat,user.sub,now,now))
        db.execute("UPDATE ceres_agent_jobs SET status='sending',lease_hash=NULL,updated_at=? "
                   "WHERE event_id=?",(now,event_id))
    ok=await deliver(chat,body.text.strip(),_bot_token())
    with _session() as db:
        setup(db)
        db.execute("UPDATE ceres_outbox SET status=?,updated_at=? WHERE event_id=?",
                   ("sent" if ok else "unknown",int(time.time()),event_id))
        db.execute("UPDATE ceres_agent_jobs SET status=?,updated_at=? WHERE event_id=?",
                   ("completed" if ok else "unknown",int(time.time()),event_id))
    if not ok:raise HTTPException(502,"Delivery unverified; no retry")
    return {"sent":True,"automatic":True,"eventId":event_id,"tool":body.tool}

async def deliver(chat:int,text:str,token:str)->bool:
    try:
        async with httpx.AsyncClient(timeout=12.0,follow_redirects=False,trust_env=False) as client:
            r=await client.post("https://api.telegram.org/bot"+token+"/sendMessage",
                                json={"chat_id":chat,"text":text,"disable_web_page_preview":True})
            if r.status_code!=200:return False
            data=r.json()
            return bool(isinstance(data,dict) and data.get("ok") is True
                        and isinstance(data.get("result"),dict)
                        and isinstance(data["result"].get("chat"),dict)
                        and data["result"]["chat"].get("id")==chat)
    except (httpx.HTTPError,ValueError,TypeError):
        return False
