"""Slime outbound-only trusted model runner broker.

A node must be registered with Slime, opted into sharing AND explicitly enabled
by the linked Google Owner for model inference. Owner-bound jobs are claimed
atomically and are never distributed to another owner's nodes. The public API
stays feature-gated by VANILLA_PUBLIC_API_ENABLED. No incoming ports to a home
PC, shell instructions, arbitrary URLs, scripts or provider API keys.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import time

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict

import slime
from ceres_gateway import _session

router=APIRouter(tags=["slime-owner-model-runner"])
_MODEL=re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$")
_NODE_ONLINE=120
_JOB_TTL=48
_MAX_OUTPUT_CHARS=20000


def enabled():
    return os.getenv("VANILLA_SLIME_RUNNER_ENABLED","false").lower()=="true"


def _tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS slime_runner_catalog(
      node_id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, models_json TEXT NOT NULL,
      checked_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_runner_jobs(
      id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, node_id TEXT NOT NULL,
      model TEXT NOT NULL, request_json TEXT NOT NULL, result_json TEXT,
      state TEXT NOT NULL, issued_at INTEGER NOT NULL, leased_at INTEGER,
      expires_at INTEGER NOT NULL)""")
    db.execute("CREATE INDEX IF NOT EXISTS slime_runner_owner_idx "
               "ON slime_runner_jobs(owner_sub,node_id,state,issued_at)")


def _node(authorization):
    if not enabled():
        raise HTTPException(503,"Slime 推論執行端尚未啟用")
    slime._enabled()
    with slime._db() as db:
        node=slime._node(db,authorization)
        # Verify owner-set consent. Never trust the node's self-declared role.
        temp=node["gpu_temp_c"]
        stale=bool(node["gpu_temp_at"] and time.time()-node["gpu_temp_at"]>180)
        if (not node["share_enabled"] or not node["owner_enabled"]
            or not node["inference_enabled"] or node["max_load_pct"]<10
            or (temp is not None and temp>=node["thermal_limit_c"]) or stale
            or time.time()-node["last_seen"]>slime.ONLINE_SECONDS):
            raise HTTPException(403,"節點尚未獲 Owner 核准或心跳已逾時")
        return {"id":node["id"],"owner":node["owner"]}


def _live_nodes(owner: str):
    with slime._db() as db:
        return {r["id"] for r in db.execute(
            """SELECT id FROM nodes WHERE owner=? AND share_enabled=1
             AND owner_enabled=1 AND inference_enabled=1 AND max_load_pct>=10
             AND (gpu_temp_c IS NULL OR gpu_temp_c<thermal_limit_c)
             AND (gpu_temp_at=0 OR gpu_temp_at>=?)
             AND last_seen>=?""",
            (owner,time.time()-180,time.time()-slime.ONLINE_SECONDS)).fetchall()}


def catalog(owner: str):
    """Only recently heartbeating, owner-approved machines supply models."""
    if not enabled():
        raise HTTPException(503,"本地推論模式尚未啟用")
    nodes=_live_nodes(owner)
    if not nodes:
        raise HTTPException(503,"目前沒有已核准且在線的 Slime Model Runner")
    with _session() as db:
        _tables(db)
        rows=db.execute("SELECT node_id,models_json,checked_at FROM slime_runner_catalog "
                        "WHERE owner_sub=? AND checked_at>=?",
                        (owner,int(time.time())-_NODE_ONLINE)).fetchall()
    result={}
    for row in rows:
        if row["node_id"] not in nodes:continue
        for model in json.loads(row["models_json"]):
            result.setdefault(model,[]).append(row["node_id"])
    if not result:
        raise HTTPException(503,"節點尚未回報可用模型")
    return sorted(result)


def _select(owner:str,model:str):
    nodes=_live_nodes(owner)
    with _session() as db:
        _tables(db)
        records=db.execute("SELECT node_id,models_json FROM slime_runner_catalog "
                           "WHERE owner_sub=? AND checked_at>=?",
                           (owner,int(time.time())-_NODE_ONLINE)).fetchall()
        possible=[row["node_id"] for row in records
                  if row["node_id"] in nodes and model in json.loads(row["models_json"])]
        if not possible:
            raise HTTPException(503,"指定模型目前沒有在線且已核准的 Slime 執行節點")
        counts={}
        for node in possible:
            counts[node]=db.execute("""SELECT COUNT(*) FROM slime_runner_jobs
                WHERE node_id=? AND state IN ('queued','leased') AND expires_at>?""",
                (node,int(time.time()))).fetchone()[0]
        # Prefer less loaded, cooler nodes; never claim to combine GPU memory.
        with slime._db() as registry:
            state={r["id"]:r for r in registry.execute(
                "SELECT id,max_load_pct,cpu_pct,gpu_util_pct,gpu_temp_c FROM nodes WHERE owner=?",
                (owner,)).fetchall()}
        # When the owner limits a node to 25% / 50%, do not enqueue
        # another task while the reported machine is already above that mark.
        possible=[node for node in possible if node in state and (
             state[node]["max_load_pct"]==100 or
             max(state[node]["cpu_pct"] or 0,state[node]["gpu_util_pct"] or 0)
                <state[node]["max_load_pct"])]
        if not possible:
            raise HTTPException(503,"所有節點的負載已超過 Owner 設定上限")
        def cost(node):
            caps=state[node]
            load=max(caps["cpu_pct"] or 0,caps["gpu_util_pct"] or 0)
            target=caps["max_load_pct"]
            # A low owner-set limit lowers priority instead of forcing GPU wattage.
            pressure=max(0,load-target)*20
            return (counts[node]*1500+pressure+load+100-target,node)
        node=min(possible,key=cost)
        if counts[node]>=1:
            raise HTTPException(503,"本地模型節點目前忙碌")
        return node


async def dispatch(owner: str, content: dict):
    """Queue a short-lived request and await the registered PC's result.

    Jobs are only accessible to the exact authenticated Slime node token.
    """
    if not enabled():
        raise HTTPException(503,"Slime Model Runner 尚未啟用")
    model=content["model"]
    node=_select(owner,model)
    jobid=secrets.token_hex(16)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        count=db.execute("""SELECT COUNT(*) FROM slime_runner_jobs
            WHERE node_id=? AND state IN ('queued','leased') AND expires_at>?""",
            (node,now)).fetchone()[0]
        if count>=1:
            raise HTTPException(503,"本地模型節點已達併發／排隊上限")
        db.execute("INSERT INTO slime_runner_jobs VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (jobid,owner,node,model,json.dumps(content,ensure_ascii=False),
                    None,"queued",now,None,now+_JOB_TTL))
    try:
        for _ in range(_JOB_TTL*2):
            await asyncio.sleep(.5)
            with _session() as db:
                row=db.execute("SELECT state,result_json,expires_at FROM slime_runner_jobs WHERE id=?",
                               (jobid,)).fetchone()
            if row and row["state"]=="done" and row["result_json"]:
                return json.loads(row["result_json"])
            if row and row["state"]=="failed":
                raise HTTPException(502,"本地推論節點未能成功執行")
            if not row or row["expires_at"]<=time.time():
                break
        raise HTTPException(504,"本地模型執行逾時")
    finally:
        with _session() as db:
            # Consume response once and scrub both prompt and full answer from
            # the persistent broker. Only non-content job status remains.
            db.execute("UPDATE slime_runner_jobs SET result_json=NULL,request_json='{}' "
                       "WHERE id=? AND state IN ('done','failed')",(jobid,))
            db.execute("UPDATE slime_runner_jobs SET state='expired',request_json='{}' "
                       "WHERE id=? AND state IN ('queued','leased')",(jobid,))


class Registration(BaseModel):
    model_config=ConfigDict(extra="forbid")
    models: list[str]=Field(min_length=1,max_length=40)


@router.post("/v1/slime/node/runner/register")
def register(body:Registration,authorization:str|None=Header(default=None)):
    node=_node(authorization)
    if len(set(body.models))!=len(body.models) or any(not _MODEL.fullmatch(m) for m in body.models):
        raise HTTPException(422,"模型清單格式不正確")
    with _session() as db:
        _tables(db)
        db.execute("INSERT INTO slime_runner_catalog VALUES(?,?,?,?) "
                   "ON CONFLICT(node_id) DO UPDATE SET owner_sub=excluded.owner_sub,"
                   "models_json=excluded.models_json,checked_at=excluded.checked_at",
                   (node["id"],node["owner"],json.dumps(body.models),int(time.time())))
    return {"ok":True,"registered":len(body.models),"inferenceConsent":True}


@router.get("/v1/slime/node/runner/poll")
def poll(authorization:str|None=Header(default=None)):
    node=_node(authorization)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("""SELECT id,model,request_json FROM slime_runner_jobs
          WHERE node_id=? AND owner_sub=? AND state='queued' AND expires_at>?
          ORDER BY issued_at LIMIT 1""",(node["id"],node["owner"],now)).fetchone()
        if not row:
            return {"job":None}
        db.execute("UPDATE slime_runner_jobs SET state='leased',leased_at=? WHERE id=?",
                   (now,row["id"]))
    return {"job":{"id":row["id"],"model":row["model"],
                   "request":json.loads(row["request_json"]),
                   "expires_at":now+_JOB_TTL}}


class Result(BaseModel):
    model_config=ConfigDict(extra="forbid")
    job_id: str=Field(pattern=r"^[a-f0-9]{32}$")
    ok: bool
    text: str=Field(default="",max_length=_MAX_OUTPUT_CHARS)
    prompt_tokens: int|None=Field(default=None,ge=0,le=1000000)
    completion_tokens: int|None=Field(default=None,ge=0,le=1000000)


@router.post("/v1/slime/node/runner/result")
def complete(body:Result,authorization:str|None=Header(default=None)):
    node=_node(authorization)
    if body.ok and (not body.text.strip() or body.prompt_tokens is None
                    or body.completion_tokens is None):
        raise HTTPException(422,"成功的結果須提供文字與實際 Token 計數")
    now=int(time.time())
    payload={"choices":[{"message":{"role":"assistant","content":body.text}}] ,
             "usage":{"prompt_tokens":body.prompt_tokens,
                      "completion_tokens":body.completion_tokens}} if body.ok else None
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        changed=db.execute("""UPDATE slime_runner_jobs SET state=?,result_json=?,
             request_json='{}' WHERE id=? AND owner_sub=? AND node_id=?
             AND state='leased' AND expires_at>?""",
             ("done" if body.ok else "failed",json.dumps(payload) if payload else None,
              body.job_id,node["owner"],node["id"],now))
        if not changed.rowcount:
            raise HTTPException(409,"任務不存在、已過期或已由其他節點處理")
        # Delete old prompt contents and processed results after a short retention window.
        db.execute("DELETE FROM slime_runner_jobs WHERE expires_at<?",(now-120,))
    return {"ok":True,"accepted":True}
