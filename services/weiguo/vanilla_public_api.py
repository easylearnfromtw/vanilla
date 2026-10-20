"""Vanilla-owned inference gateway — independent API keys and token budgets.

ONLY proxies a separately configured, trusted, owner-operated OpenAI-compatible
inference endpoint. Slime's current device registry is NOT an inference worker.
No Gemini/OpenAI/DeepSeek provider key is ever accepted or forwarded here.
Feature disabled by default until the owner provisions a trusted runtime.
"""
from __future__ import annotations

import calendar
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict

from ceres_gateway import _session
from ceres_admin_web import _verify

router=APIRouter(tags=["vanilla-owned-api"])
admin_router=APIRouter(prefix="/v1/ceres/admin/gateway",tags=["vanilla-api-owner"])

_KEY=re.compile(r"^vnl_([a-f0-9]{20})_([A-Za-z0-9_-]{38,64})$")
_MODEL=re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$")
_HOST=re.compile(r"^[a-z0-9][a-z0-9.-]{3,252}$")
_TTL=300
_MAX_REQUEST_BYTES=65_536
_DEFAULT_ALIAS="vanilla-default"


def enabled():
    return os.getenv("VANILLA_PUBLIC_API_ENABLED","false").lower()=="true"


def _db_tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS vanilla_api_projects(
      id TEXT PRIMARY KEY, label TEXT NOT NULL, owner_chat INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS vanilla_api_keys(
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, digest TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL, models_json TEXT NOT NULL, daily_limit INTEGER NOT NULL,
      monthly_limit INTEGER NOT NULL, rpm INTEGER NOT NULL, max_output INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, revoked_at INTEGER, created_at INTEGER NOT NULL,
      last_used_at INTEGER, FOREIGN KEY(project_id) REFERENCES vanilla_api_projects(id))""")
    db.execute("""CREATE TABLE IF NOT EXISTS vanilla_api_usage(
      id TEXT PRIMARY KEY, key_id TEXT NOT NULL, created_at INTEGER NOT NULL,
      charged_tokens INTEGER NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER,
      status TEXT NOT NULL, latency_ms INTEGER, model TEXT NOT NULL,
      FOREIGN KEY(key_id) REFERENCES vanilla_api_keys(id))""")
    db.execute("""CREATE TABLE IF NOT EXISTS vanilla_api_catalog(
      marker INTEGER PRIMARY KEY CHECK(marker=1), models_json TEXT NOT NULL,
      refreshed_at INTEGER NOT NULL, primary_model TEXT NOT NULL)""")


def _origin() -> tuple[str,str]:
    """Strict deployment-only origin; never accept caller-supplied provider URLs."""
    raw=os.getenv("VANILLA_INFERENCE_BASE_URL","").strip().rstrip("/")
    allow=os.getenv("VANILLA_INFERENCE_ALLOWED_HOST","").strip().lower()
    key=os.getenv("VANILLA_INFERENCE_SERVICE_KEY","")
    try:
        u=urlsplit(raw)
        host=(u.hostname or "").lower()
        if (u.scheme!="https" or not _HOST.fullmatch(host) or "." not in host
            or host== "localhost" or host.endswith((".local",".localhost",".internal",".test"))
            or u.username or u.password or u.query or u.fragment
            or u.port not in (None,443) or u.path not in ("","/v1")
            or raw != "https://"+host+u.path
            or not allow or host!=allow):
            raise ValueError("untrusted origin")
    except ValueError:
        raise HTTPException(503,"Vanilla 自有模型執行端尚未完成安全設定") from None
    if not 24<=len(key)<=512 or any(ord(c)<33 or ord(c)>126 for c in key):
        raise HTTPException(503,"Vanilla 模型執行端驗證未設定")
    return raw+("/v1" if not u.path else ""), key


async def _fetch_catalog(force=False):
    if not enabled():
        raise HTTPException(503,"Vanilla 模型 API 尚未開放")
    now=int(time.time())
    with _session() as db:
        _db_tables(db)
        row=db.execute("SELECT * FROM vanilla_api_catalog WHERE marker=1").fetchone()
        if row and not force and now-row["refreshed_at"]<=_TTL:
            return json.loads(row["models_json"]),row["primary_model"],row["refreshed_at"]
    origin,secret=_origin()
    try:
        async with httpx.AsyncClient(timeout=8,follow_redirects=False,trust_env=False) as client:
            result=await client.get(origin+"/models",headers={"Authorization":"Bearer "+secret})
        if result.status_code!=200 or len(result.content)>300000:
            raise ValueError()
        body=result.json()
        raw=body.get("data") if isinstance(body,dict) else None
        if not isinstance(raw,list):
            raise ValueError()
        discovered=sorted({x["id"] for x in raw[:300] if isinstance(x,dict)
                           and isinstance(x.get("id"),str) and _MODEL.fullmatch(x["id"])})
        if not discovered:
            raise ValueError()
    except (httpx.HTTPError,ValueError,TypeError):
        # Never serve stale models indefinitely or claim that a stale snapshot is current.
        if row and not force and now-row["refreshed_at"]<=86400:
            return json.loads(row["models_json"]),row["primary_model"],row["refreshed_at"]
        raise HTTPException(503,"自有模型節點目前無法提供已驗證的模型清單") from None
    preferred=os.getenv("VANILLA_INFERENCE_DEFAULT_MODEL","")
    previous=row["primary_model"] if row else ""
    primary=(preferred if preferred in discovered else previous if previous in discovered else discovered[0])
    with _session() as db:
        _db_tables(db)
        db.execute("""INSERT INTO vanilla_api_catalog VALUES(1,?,?,?)
            ON CONFLICT(marker) DO UPDATE SET models_json=excluded.models_json,
            refreshed_at=excluded.refreshed_at,primary_model=excluded.primary_model""",
            (json.dumps(discovered),now,primary))
    return discovered,primary,now


def _key_from_header(authorization: str|None):
    if not enabled():
        raise HTTPException(503,"Vanilla 模型 API 尚未開放")
    supplied=authorization[7:] if isinstance(authorization,str) and authorization.startswith("Bearer ") else ""
    match=_KEY.fullmatch(supplied)
    if not match:
        raise HTTPException(401,"無效的 Vanilla API Key",headers={"WWW-Authenticate":"Bearer"})
    now=int(time.time())
    with _session() as db:
        _db_tables(db)
        row=db.execute("""SELECT k.*,p.enabled,p.owner_chat,p.label AS project_label
           FROM vanilla_api_keys k JOIN vanilla_api_projects p ON p.id=k.project_id
           WHERE k.id=?""",(match.group(1),)).fetchone()
    if (row is None or not hmac.compare_digest(row["digest"],hashlib.sha256(supplied.encode()).hexdigest())
        or row["revoked_at"] is not None or not row["enabled"] or row["expires_at"]<=now):
        raise HTTPException(401,"Vanilla API Key 已失效或無權限",headers={"WWW-Authenticate":"Bearer"})
    return dict(row)


def _allowed(key,actual_model,requested):
    allowed=json.loads(key["models_json"])
    return "*" in allowed or requested in allowed


def _reserve(key,model:str,budget:int,*,kind:str="inference"):
    """Single immediate SQLite transaction enforces RPM, daily/monthly tokens
    and max two active requests across processes, even under concurrent load."""
    now=int(time.time())
    d0=now-now%86400
    m0=calendar.timegm(time.strptime(time.strftime("%Y-%m-01",time.gmtime(now)),"%Y-%m-%d"))
    request_id=secrets.token_hex(12)
    with _session() as db:
        _db_tables(db)
        db.execute("BEGIN IMMEDIATE")
        # Revalidate revocation and expiry INSIDE the quota transaction.
        live=db.execute("""SELECT k.*,p.enabled FROM vanilla_api_keys k
             JOIN vanilla_api_projects p ON p.id=k.project_id WHERE k.id=?""",(key["id"],)).fetchone()
        if not live or not live["enabled"] or live["revoked_at"] is not None or live["expires_at"]<=now:
            raise HTTPException(401,"API Key 已停用")
        stats=db.execute("""SELECT
          COUNT(CASE WHEN created_at>=? THEN 1 END) rpm,
          SUM(CASE WHEN created_at>=? THEN charged_tokens ELSE 0 END) day_total,
          SUM(CASE WHEN created_at>=? THEN charged_tokens ELSE 0 END) month_total,
          SUM(CASE WHEN status='running' AND created_at>=? THEN 1 ELSE 0 END) active
          FROM vanilla_api_usage WHERE key_id=?""",
          (now-60,d0,int(m0),now-90,key["id"])).fetchone()
        if (stats["rpm"] or 0)>=live["rpm"] or (stats["active"] or 0)>=2:
            raise HTTPException(429,"API Key 的頻率或併發請求已達上限")
        if (stats["day_total"] or 0)+budget>live["daily_limit"] or (
            stats["month_total"] or 0)+budget>live["monthly_limit"]:
            raise HTTPException(429,"API Key Token 額度不足")
        db.execute("""INSERT INTO vanilla_api_usage(
          id,key_id,created_at,charged_tokens,status,model)
          VALUES(?,?,?,?,?,?)""",(request_id,key["id"],now,budget,"running",model))
        db.execute("UPDATE vanilla_api_keys SET last_used_at=? WHERE id=?",(now,key["id"]))
        db.execute("DELETE FROM vanilla_api_usage WHERE created_at<?",(now-95*86400,))
    return request_id


def _finish(keyid:str,job:str,reservation:int,*,usage=None,status="failed",latency=None):
    """When actual usage is missing, keep the conservative reservation.
    Do not claim unknown usage as a precisely metered provider token count."""
    a=b=None
    if isinstance(usage,dict) and type(usage.get("prompt_tokens")) is int and type(usage.get("completion_tokens")) is int:
        a,b=usage["prompt_tokens"],usage["completion_tokens"]
        if a<0 or b<0 or a+b>reservation:
            a=b=None
    charged=a+b if a is not None else reservation
    with _session() as db:
        _db_tables(db)
        db.execute("""UPDATE vanilla_api_usage
          SET charged_tokens=?,prompt_tokens=?,completion_tokens=?,status=?,latency_ms=?
          WHERE id=? AND key_id=?""",(charged,a,b,status,latency,job,keyid))


class ChatMessage(BaseModel):
    model_config=ConfigDict(extra="forbid")
    role: str=Field(pattern="^(system|user|assistant)$")
    content: str=Field(min_length=1,max_length=16000)

class Completion(BaseModel):
    model_config=ConfigDict(extra="forbid")
    model: str=Field(min_length=1,max_length=96)
    messages: list[ChatMessage]=Field(min_length=1,max_length=16)
    max_tokens: int=Field(default=256,ge=1,le=2048)
    temperature: float=Field(default=0.4,ge=0,le=2)
    stream: bool=False

@router.get("/v1/models")
async def models(authorization: str|None=Header(default=None)):
    key=_key_from_header(authorization)
    available,primary,refreshed=await _fetch_catalog()
    published=[name for name in available if _allowed(key,name,name)]
    if _DEFAULT_ALIAS in json.loads(key["models_json"]) or "*" in json.loads(key["models_json"]):
        if primary in available:
            published.insert(0,_DEFAULT_ALIAS)
    return {"object":"list","data":[{"id":x,"object":"model","owned_by":"vanilla"} for x in published],
            "vanilla_catalog_refreshed_at":refreshed}



@router.get("/v1/vanilla/usage")
async def client_usage(authorization: str|None=Header(default=None)):
    """Key-holder can inspect ONLY its own quotas, model scope and metering."""
    key=_key_from_header(authorization)
    now=int(time.time())
    day_start=now-now%86400
    month_start=calendar.timegm(time.strptime(time.strftime("%Y-%m-01",time.gmtime(now)),"%Y-%m-%d"))
    with _session() as db:
        _db_tables(db)
        stats=db.execute("""SELECT COUNT(*) calls,
           SUM(CASE WHEN created_at>=? THEN charged_tokens ELSE 0 END) today,
           SUM(CASE WHEN created_at>=? THEN charged_tokens ELSE 0 END) month_total,
           SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes,
           SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failures
           FROM vanilla_api_usage WHERE key_id=? AND created_at>=?""",
           (day_start,month_start,key["id"],month_start)).fetchone()
    return {"keyId":key["id"],"project":key["project_label"],
            "allowedModels":json.loads(key["models_json"]),
            "dailyLimit":key["daily_limit"],"monthlyLimit":key["monthly_limit"],
            "todayChargedTokens":stats["today"] or 0,
            "monthChargedTokens":stats["month_total"] or 0,
            "requestsThisMonth":stats["calls"],"successes":stats["successes"] or 0,
            "failures":stats["failures"] or 0,"rpm":key["rpm"],
            "maxOutputTokens":key["max_output"],"expiresAt":key["expires_at"],
            "note":"Token 為模型回報的實際值或保守預留量。只有本把金鑰的紀錄。"}


@router.post("/v1/chat/completions")
async def chat(body:Completion,authorization: str|None=Header(default=None)):
    key=_key_from_header(authorization)
    available,primary,_=await _fetch_catalog()
    if body.stream:
        raise HTTPException(422,"目前僅支援 stream=false；串流支援完成前不會假裝回傳 SSE")
    requested=body.model
    actual=primary if requested==_DEFAULT_ALIAS else requested
    if actual not in available or not _allowed(key,actual,requested):
        raise HTTPException(403,"此 API Key 無權使用指定模型，或模型目前不可用")
    content={"model":actual,"messages":[m.model_dump() for m in body.messages],
             "max_tokens":min(body.max_tokens,key["max_output"]),"temperature":body.temperature,"stream":False}
    # UTF-8 byte count + explicit chat framing overhead is a conservative
    # worst-case text-token allowance. Never call it exact vendor metering.
    prompt_bytes=sum(len(m.content.encode("utf-8"))+len(m.role)+256 for m in body.messages)
    if prompt_bytes>_MAX_REQUEST_BYTES:
        raise HTTPException(413,"輸入文字超過服務上限")
    reservation=prompt_bytes+content["max_tokens"]
    if reservation>key["daily_limit"] or reservation>key["monthly_limit"]:
        raise HTTPException(429,"此請求的 Token 保留額度超過金鑰上限")
    # Refuse misconfigured runtimes before debiting the consumer token budget.
    url,secret=_origin()
    job=_reserve(key,actual,reservation)
    began=time.monotonic()
    status="failed"
    usage=None
    try:
        async with httpx.AsyncClient(timeout=45,follow_redirects=False,trust_env=False) as client:
            response=await client.post(url+"/chat/completions",json=content,
                    headers={"Authorization":"Bearer "+secret})
        if response.status_code==429:
            raise HTTPException(503,"自有模型節點忙碌")
        if response.status_code!=200 or len(response.content)>450000:
            raise HTTPException(502,"自有模型節點推論失敗")
        payload=response.json()
        choices=payload.get("choices") if isinstance(payload,dict) else None
        first=choices[0] if isinstance(choices,list) and choices else None
        message=first.get("message") if isinstance(first,dict) else None
        answer=message.get("content") if isinstance(message,dict) else None
        if not isinstance(answer,str) or not answer.strip() or len(answer)>20000:
            raise HTTPException(502,"模型沒有產生有效的文字結果")
        usage=payload.get("usage") if isinstance(payload,dict) else None
        if isinstance(usage,dict):
            total=usage.get("prompt_tokens",0)+usage.get("completion_tokens",0) if (
                type(usage.get("prompt_tokens")) is int and type(usage.get("completion_tokens")) is int) else None
            if total is not None and total>reservation:
                raise HTTPException(502,"模型超出已核准的輸出 Token 預算")
        status="success"
        reply={"id":"chatcmpl-"+secrets.token_hex(12),"object":"chat.completion",
               "created":int(time.time()),"model":requested,
               "choices":[{"index":0,"message":{"role":"assistant","content":answer},
                           "finish_reason":"stop"}]}
        if isinstance(usage,dict) and all(type(usage.get(k)) is int and usage[k]>=0
                                          for k in ("prompt_tokens","completion_tokens")):
            reply["usage"]={"prompt_tokens":usage["prompt_tokens"],
                            "completion_tokens":usage["completion_tokens"],
                            "total_tokens":usage["prompt_tokens"]+usage["completion_tokens"]}
        else:
            reply["vanilla_usage_note"]="使用已保留 Token 預算計費；模型未提供精確 Token 使用量"
        return reply
    except httpx.HTTPError:
        raise HTTPException(503,"自有模型執行端目前無法連線") from None
    except (ValueError,KeyError,TypeError):
        raise HTTPException(502,"自有模型執行端回應格式不正確") from None
    finally:
        _finish(key["id"],job,reservation,usage=usage,status=status,
                latency=round((time.monotonic()-began)*1000))


class Owner(BaseModel):
    init_data: str=Field(min_length=20,max_length=8192)

class ProjectCreate(Owner):
    label: str=Field(min_length=2,max_length=60,pattern=r"^[\w\u4e00-\u9fff .-]+$")

class KeyCreate(Owner):
    project_id: str=Field(pattern=r"^[a-f0-9]{16}$")
    label: str=Field(min_length=2,max_length=48)
    models: list[str]=Field(min_length=1,max_length=30)
    daily_tokens: int=Field(ge=1000,le=2000000)
    monthly_tokens: int=Field(ge=1000,le=30000000)
    rpm: int=Field(ge=1,le=60)
    max_output_tokens: int=Field(default=512,ge=16,le=2048)
    expires_days: int=Field(default=30,ge=1,le=365)

class KeyRevoke(Owner):
    key_id: str=Field(pattern=r"^[a-f0-9]{20}$")


def _owner_projects(chat:int):
    with _session() as db:
        _db_tables(db)
        projects=db.execute("SELECT id,label,enabled,created_at FROM vanilla_api_projects "
                            "WHERE owner_chat=? ORDER BY created_at DESC",(chat,)).fetchall()
    return [dict(x) for x in projects]


@admin_router.post("/status")
async def owner_status(body:Owner):
    chat=_verify(body.init_data)
    configured=enabled()
    try:
        if configured:
            _origin()
    except HTTPException:
        configured=False
    with _session() as db:
        _db_tables(db)
        projects=db.execute("SELECT COUNT(*) FROM vanilla_api_projects WHERE owner_chat=?",(chat,)).fetchone()[0]
    return {"gatewayEnabled":enabled(),"runtimeConfigured":configured,"projects":projects,
            "runtime":"owner-hosted-only","slimeRegistryIsInference":False,
            "chatEndpoint":"/v1/chat/completions","modelsEndpoint":"/v1/models"}


@admin_router.post("/projects")
async def projects(body:Owner):
    chat=_verify(body.init_data)
    return {"projects":_owner_projects(chat)}


@admin_router.post("/projects/create")
async def new_project(body:ProjectCreate):
    chat=_verify(body.init_data)
    with _session() as db:
        _db_tables(db)
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT COUNT(*) FROM vanilla_api_projects WHERE owner_chat=?",(chat,)).fetchone()[0]>=30:
            raise HTTPException(429,"應用程式已達上限")
        uid=secrets.token_hex(8)
        db.execute("INSERT INTO vanilla_api_projects VALUES(?,?,?,?,?)",
                   (uid,body.label.strip(),chat,1,int(time.time())))
    return {"id":uid,"label":body.label.strip()}


@admin_router.post("/keys")
async def keys(body:Owner):
    chat=_verify(body.init_data)
    with _session() as db:
        _db_tables(db)
        rows=db.execute("""SELECT k.id,k.project_id,k.label,k.models_json,k.daily_limit,
          k.monthly_limit,k.rpm,k.max_output,k.expires_at,k.revoked_at,k.created_at,
          k.last_used_at FROM vanilla_api_keys k
          JOIN vanilla_api_projects p ON p.id=k.project_id WHERE p.owner_chat=?
          ORDER BY k.created_at DESC LIMIT 160""",(chat,)).fetchall()
    return {"keys":[{**dict(x),"models":json.loads(x["models_json"])} for x in rows]}


@admin_router.post("/keys/create")
async def issue_key(body:KeyCreate):
    chat=_verify(body.init_data)
    if body.monthly_tokens<body.daily_tokens or len(set(body.models))!=len(body.models):
        raise HTTPException(422,"每月額度不得小於每日額度，且模型權限不得重複")
    if any(name!="*" and name!=_DEFAULT_ALIAS and not _MODEL.fullmatch(name) for name in body.models):
        raise HTTPException(422,"模型權限格式不正確")
    # '*' is an EXPLICIT owner grant of current and future discovered models.
    with _session() as db:
        _db_tables(db)
        db.execute("BEGIN IMMEDIATE")
        project=db.execute("SELECT id FROM vanilla_api_projects WHERE id=? AND owner_chat=? AND enabled=1",
                           (body.project_id,chat)).fetchone()
        if not project:
            raise HTTPException(404,"找不到可用應用程式")
        if db.execute("SELECT COUNT(*) FROM vanilla_api_keys WHERE project_id=? AND revoked_at IS NULL",
                      (body.project_id,)).fetchone()[0]>=12:
            raise HTTPException(429,"此應用的有效金鑰已達上限")
        key_id=secrets.token_hex(10)
        token=f"vnl_{key_id}_{secrets.token_urlsafe(32)}"
        db.execute("""INSERT INTO vanilla_api_keys(
            id,project_id,digest,label,models_json,daily_limit,monthly_limit,
            rpm,max_output,expires_at,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (key_id,body.project_id,hashlib.sha256(token.encode()).hexdigest(),
             body.label.strip(),json.dumps(body.models),body.daily_tokens,
             body.monthly_tokens,body.rpm,body.max_output_tokens,
             int(time.time())+body.expires_days*86400,int(time.time())))
    return {"id":key_id,"api_key":token,"shown_once":True,
            "warning":"只在這次安全回應中顯示，請立即複製到可信任的伺服器密鑰儲存。切勿放在瀏覽器前端。"}


@admin_router.post("/keys/revoke")
async def revoke_key(body:KeyRevoke):
    chat=_verify(body.init_data)
    with _session() as db:
        _db_tables(db)
        db.execute("UPDATE vanilla_api_keys SET revoked_at=? WHERE id=? AND project_id IN "
                   "(SELECT id FROM vanilla_api_projects WHERE owner_chat=?) AND revoked_at IS NULL",
                   (int(time.time()),body.key_id,chat))
    return {"revoked":True}


@admin_router.post("/usage")
async def usage(body:Owner):
    chat=_verify(body.init_data)
    with _session() as db:
        _db_tables(db)
        rows=db.execute("""SELECT k.id,k.label,k.project_id,COUNT(u.id) requests,
             COALESCE(SUM(u.charged_tokens),0) reserved_or_charged_tokens,
             SUM(CASE WHEN u.status='success' THEN 1 ELSE 0 END) successes,
             SUM(CASE WHEN u.status='failed' THEN 1 ELSE 0 END) failures,
             CAST(AVG(u.latency_ms) AS INTEGER) average_latency_ms
             FROM vanilla_api_keys k JOIN vanilla_api_projects p ON p.id=k.project_id
             LEFT JOIN vanilla_api_usage u ON u.key_id=k.id AND u.created_at>=?
             WHERE p.owner_chat=? GROUP BY k.id ORDER BY k.created_at DESC LIMIT 160""",
             (int(time.time())-30*86400,chat)).fetchall()
    return {"windowDays":30,"items":[dict(x) for x in rows],
            "note":"Token 是模型回報的精確值，或以保守預留量計算；兩者不會混稱。"}


@admin_router.post("/models/refresh")
async def owner_refresh(body:Owner):
    _verify(body.init_data)
    models,default,at=await _fetch_catalog(force=True)
    return {"models":models,"alias":_DEFAULT_ALIAS,"defaultResolvesTo":default,
            "refreshedAt":at}
