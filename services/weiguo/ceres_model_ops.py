"""Ceres Owner Operations: observed health, metered probes, comparisons and bounded failover.

No prompts, replies, credentials or request URLs are persisted or returned.
All billable tests require an authenticated explicit POST action.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import time
from dataclasses import replace

import httpx
from fastapi import HTTPException

from ceres_gateway import _session
from ceres_admin_policy import provider_key
from ceres_model_catalog import catalog, _rank, select_mode

_PROVIDERS = ("gemini", "openai", "deepseek")
_MODES = {"speed", "balanced", "quality"}
_MAX_TEST_TOKENS = 32
_MODEL_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,99}$")
_ERROR_CODES = {400: "unsupported_request", 401: "invalid_key", 403: "access_denied",
                404: "model_unavailable", 408: "timeout", 429: "rate_limited"}


def _setup(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_probe(
      provider TEXT NOT NULL, model TEXT NOT NULL, checked_at INTEGER NOT NULL,
      ok INTEGER NOT NULL, latency_ms INTEGER, code TEXT NOT NULL,
      PRIMARY KEY(provider,model))""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_usage(
      id INTEGER PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
      kind TEXT NOT NULL, created_at INTEGER NOT NULL,
      input_tokens INTEGER, output_tokens INTEGER, estimated_usd REAL,
      state TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_prices(
      provider TEXT NOT NULL, model TEXT NOT NULL, input_per_m REAL NOT NULL,
      output_per_m REAL NOT NULL, PRIMARY KEY(provider,model))""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_limits(
      actor INTEGER NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_failover(
      provider TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_pending(
      token TEXT PRIMARY KEY, actor INTEGER NOT NULL, operation TEXT NOT NULL,
      provider TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_ops_telegram_checks(
      id INTEGER PRIMARY KEY, checked_at INTEGER NOT NULL,
      accepted INTEGER NOT NULL)""")


def _validated(provider, model):
    if provider not in _PROVIDERS or not isinstance(model, str) or not _MODEL_ID.fullmatch(model):
        raise HTTPException(422, "不支援的模型識別碼")
    if model not in {x["id"] for x in catalog(provider)["models"]}:
        raise HTTPException(409, "模型不在此供應商已偵測的清單中")
    return model


def _limit(actor: int, kind: str, count: int, seconds: int) -> None:
    now = int(time.time())
    with _session() as db:
        _setup(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ceres_ops_limits WHERE created_at<?", (now-86400,))
        n=db.execute("SELECT count(*) FROM ceres_ops_limits WHERE actor=? AND kind=? AND created_at>=?",
                     (actor,kind,now-seconds)).fetchone()[0]
        if n >= count:
            raise HTTPException(429, "操作次數已達上限，請稍後再試")
        db.execute("INSERT INTO ceres_ops_limits(actor,kind,created_at) VALUES(?,?,?)",(actor,kind,now))


def set_price(provider: str, model: str, input_per_m: float, output_per_m: float, actor: int):
    _validated(provider,model)
    for v in (input_per_m,output_per_m):
        if not isinstance(v, (int,float)) or isinstance(v,bool) or not 0<=v<=500:
            raise HTTPException(422,"價格需為有效的 USD / 百萬 Token")
    with _session() as db:
        _setup(db)
        db.execute("INSERT INTO ceres_ops_prices VALUES(?,?,?,?) "
                   "ON CONFLICT(provider,model) DO UPDATE SET input_per_m=excluded.input_per_m,"
                   "output_per_m=excluded.output_per_m",
                   (provider,model,float(input_per_m),float(output_per_m)))
        db.execute("INSERT INTO ceres_admin_audit(actor_chat,operation,subject,created_at) VALUES(?,?,?,?)",
                   (actor,"set_model_price",provider+":"+model,int(time.time())))
    return {"provider":provider,"model":model,"source":"owner_configured",
            "inputPerMillionUsd":input_per_m,"outputPerMillionUsd":output_per_m}


def record_usage(provider: str, model: str, kind: str, input_tokens=None, output_tokens=None,
                 state: str="success"):
    """Best-effort aggregate telemetry only: no prompts, model replies or tokens are saved."""
    if provider not in _PROVIDERS or not isinstance(model,str) or not _MODEL_ID.fullmatch(model):
        return
    def tokens(x):
        return x if type(x) is int and 0<=x<=10**8 else None
    a,b=tokens(input_tokens),tokens(output_tokens)
    with _session() as db:
        _setup(db)
        row=db.execute("SELECT input_per_m,output_per_m FROM ceres_ops_prices "
                       "WHERE provider=? AND model=?",(provider,model)).fetchone()
        estimate=round((a*row["input_per_m"]+b*row["output_per_m"])/1000000,8) if row and a is not None and b is not None else None
        db.execute("""INSERT INTO ceres_ops_usage
          (provider,model,kind,created_at,input_tokens,output_tokens,estimated_usd,state)
          VALUES(?,?,?,?,?,?,?,?)""",
          (provider,model,kind,int(time.time()),a,b,estimate,state))
        db.execute("DELETE FROM ceres_ops_usage WHERE created_at<?",(int(time.time())-90*86400,))


def summary():
    since=int(time.time())-30*86400
    with _session() as db:
        _setup(db)
        rows=db.execute("""SELECT provider,COUNT(*) calls,SUM(COALESCE(input_tokens,0)) input_tokens,
                SUM(COALESCE(output_tokens,0)) output_tokens,
                SUM(estimated_usd) estimated_usd,
                SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) unpriced
                FROM ceres_ops_usage WHERE created_at>=? GROUP BY provider""",(since,)).fetchall()
        prices=db.execute("SELECT provider,model,input_per_m,output_per_m FROM ceres_ops_prices").fetchall()
    return {"windowDays":30,"providers":[dict(x) for x in rows],
            "prices":[{"provider":x["provider"],"model":x["model"],
                       "inputPerMillionUsd":x["input_per_m"],"outputPerMillionUsd":x["output_per_m"],
                       "source":"owner_configured"} for x in prices],
            "note":"只包含 Ceres 已記錄的成功呼叫與測試；不是供應商正式帳單。未設定價格時費用為未知。"}


def _record_probe(provider, model, ok, ms, code):
    with _session() as db:
        _setup(db)
        db.execute("""INSERT INTO ceres_ops_probe VALUES(?,?,?,?,?,?)
          ON CONFLICT(provider,model) DO UPDATE SET checked_at=excluded.checked_at,
          ok=excluded.ok,latency_ms=excluded.latency_ms,code=excluded.code""",
          (provider,model,int(time.time()),int(ok),ms,code))


def _probe_snapshot(provider=None):
    with _session() as db:
        _setup(db)
        if provider:
            rows=db.execute("SELECT * FROM ceres_ops_probe WHERE provider=?",(provider,)).fetchall()
        else:
            rows=db.execute("SELECT * FROM ceres_ops_probe").fetchall()
    return [dict(x) for x in rows]


async def probe(provider: str, model: str, actor: int) -> dict:
    """A single bounded, billable provider-native generation probe."""
    _validated(provider,model)
    _limit(actor, "probe", 6, 600)
    key=provider_key(provider)
    if not key:
        raise HTTPException(409,"此供應商沒有啟用的加密 API 金鑰")
    if provider=="gemini":
        url="https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent"
        headers={"x-goog-api-key":key}
        body={"contents":[{"role":"user","parts":[{"text":"Reply with OK."}]}],
              "generationConfig":{"maxOutputTokens":_MAX_TEST_TOKENS}}
    else:
        url=("https://api.openai.com/v1/chat/completions" if provider=="openai"
             else "https://api.deepseek.com/chat/completions")
        headers={"Authorization":"Bearer "+key}
        # o-series models may reject temperature/max_tokens, so omit both.
        cap={"max_completion_tokens":_MAX_TEST_TOKENS} if provider=="openai" else {"max_tokens":_MAX_TEST_TOKENS}
        body={"model":model,"messages":[{"role":"user","content":"Reply with OK."}],**cap}
    start=time.monotonic()
    code="provider_error"
    ok=False
    input_tokens=output_tokens=None
    try:
        async with httpx.AsyncClient(timeout=18.0,follow_redirects=False,trust_env=False) as client:
            resp=await client.post(url,headers=headers,json=body)
        if resp.status_code!=200:
            code=_ERROR_CODES.get(resp.status_code,"provider_5xx" if resp.status_code>=500 else "provider_rejected")
        elif len(resp.content)>180000:
            code="oversized_response"
        else:
            payload=resp.json()
            if provider=="gemini":
                candidates=payload.get("candidates",[]) if isinstance(payload,dict) else []
                parts=candidates[0].get("content",{}).get("parts",[]) if candidates and isinstance(candidates[0],dict) else []
                ok=any(isinstance(p,dict) and isinstance(p.get("text"),str) and p["text"].strip() for p in parts)
                usage=payload.get("usageMetadata",{})
                input_tokens=usage.get("promptTokenCount")
                output_tokens=usage.get("candidatesTokenCount")
            else:
                choices=payload.get("choices",[]) if isinstance(payload,dict) else []
                msg=choices[0].get("message",{}) if choices and isinstance(choices[0],dict) else {}
                ok=isinstance(msg.get("content"),str) and bool(msg["content"].strip())
                usage=payload.get("usage",{})
                input_tokens=usage.get("prompt_tokens")
                output_tokens=usage.get("completion_tokens")
            code="ok" if ok else "no_text_output"
    except httpx.TimeoutException:
        code="timeout"
    except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError,AttributeError):
        code="network_or_format"
    elapsed=round((time.monotonic()-start)*1000)
    _record_probe(provider,model,ok,elapsed,code)
    record_usage(provider,model,"explicit_probe",input_tokens,output_tokens,
                 "success" if ok else "failed")
    return {"provider":provider,"model":model,"ok":ok,"latencyMs":elapsed,
            "code":code,"checkedAt":int(time.time()),"inputTokens":input_tokens,
            "outputTokens":output_tokens,"testWasBillable":True,
            "note":"驗證這次文字生成，不保證速度、配額或其他 API 路徑始終可用。"}


async def compare(provider: str, first: str, second: str, actor: int) -> dict:
    if first==second:
        raise HTTPException(422,"請選擇兩個不同模型")
    _validated(provider,first);_validated(provider,second)
    _limit(actor,"compare",2,900)
    a=await probe(provider,first,actor)
    b=await probe(provider,second,actor)
    return {"results":[a,b],"qualityAssessed":False,
            "note":"同一固定短提示的兩次單次測試；不判定回答品質，延遲並非基準測試。"}


async def telegram_check(actor: int) -> dict:
    """Explicit check: Telegram Bot API acceptance, not proof of phone delivery."""
    _limit(actor,"telegram_check",3,300)
    from ceres_admin_bot import _telegram
    ok=await _telegram("sendMessage",{"chat_id":actor,"text":
        "Ceres · 回覆測試\n這則訊息代表 Telegram Bot API 已接受本次發送。"})
    with _session() as db:
        _setup(db)
        db.execute("INSERT INTO ceres_ops_telegram_checks(checked_at,accepted) VALUES(?,?)",
                   (int(time.time()),int(ok is True)))
        db.execute("DELETE FROM ceres_ops_telegram_checks WHERE checked_at<?",
                   (int(time.time())-14*86400,))
    return {"apiAccepted":ok is True,"checkedAt":int(time.time()),
            "note":"僅證明 Telegram API 已確認發送；不能證明裝置通知或使用者已讀。"}


def dashboard():
    from ceres_server_agent import enabled,ready
    from ceres_server_model import model_settings
    from ceres_admin_policy import provider_status
    from ceres_gateway import _enabled
    now=int(time.time())
    with _session() as db:
        _setup(db)
        try:
            inbound=db.execute("SELECT MAX(created_at) FROM ceres_inbox WHERE provider='telegram'").fetchone()[0]
            delivered=db.execute("SELECT MAX(updated_at) FROM ceres_outbox WHERE status='sent'").fetchone()[0]
            lost=db.execute("SELECT count(*) FROM ceres_agent_jobs WHERE status IN "
                            "('model_unavailable','delivery_unknown','model_not_configured') AND updated_at>=?",
                            (now-86400,)).fetchone()[0]
        except Exception:
            inbound=delivered=None; lost=None
        latest=db.execute("SELECT checked_at,accepted FROM ceres_ops_telegram_checks "
                          "ORDER BY checked_at DESC LIMIT 1").fetchone()
        last_ping={"at":latest["checked_at"],"apiAccepted":bool(latest["accepted"])} if latest else None
    return {
        "telegram":{"webhookConfigured":_enabled() and bool(os.getenv("CERES_TELEGRAM_WEBHOOK_SECRET")),
                    "lastInboundAt":inbound,"lastVerifiedReplyAt":delivered,
                    "lastTelegramSendCheck":last_ping,"liveEndToEndNow":"not_tested"},
        "agent":{"enabled":enabled(),"ready":ready(),"modelConfigured":model_settings() is not None,
                 "last24hFailedJobs":lost},
        "providers":provider_status(),"probes":_probe_snapshot(),
        "failover":failover_status(),
        "note":"健康檢查是歷史事件與配置快照，不代表 Telegram 即時端對端測試成功。"
    }


def diagnostics():
    probes=_probe_snapshot()
    return {"modelChecks":[{"provider":x["provider"],"model":x["model"],"ok":bool(x["ok"]),
                            "code":x["code"],"checkedAt":x["checked_at"],
                            "latencyMs":x["latency_ms"]} for x in probes],
            "safeCodes":sorted(set(x["code"] for x in probes if not x["ok"])),
            "note":"僅保留安全錯誤代碼；API Token、提示與回答不寫入診斷。"}


def recommendations(provider: str, task: str="general"):
    if provider not in _PROVIDERS or task not in {"general","fast","coding","reasoning","budget"}:
        raise HTTPException(422,"不支援的供應商或任務類型")
    c=catalog(provider)
    checked={x["model"]:x for x in _probe_snapshot(provider)}
    options=[]
    for m in c["models"]:
        row=checked.get(m["id"])
        options.append({"id":m["id"],"latencyMs":row["latency_ms"] if row and row["ok"] else None,
                        "verified":bool(row and row["ok"] and int(time.time())-row["checked_at"]<86400)})
    verified=[x for x in options if x["verified"]]
    fast=min(verified,key=lambda x:x["latencyMs"])["id"] if verified else None
    heuristic_quality=max(c["models"],key=lambda m:_rank(m,"quality"))["id"] if c["models"] else None
    heuristic_speed=max(c["models"],key=lambda m:_rank(m,"speed"))["id"] if c["models"] else None
    with _session() as db:
        _setup(db)
        price_rows=db.execute("SELECT model,input_per_m,output_per_m FROM ceres_ops_prices WHERE provider=?",
                              (provider,)).fetchall()
    current={m["id"] for m in c["models"]}
    cheapest=min((x for x in price_rows if x["model"] in current),
                 key=lambda x:(x["input_per_m"]+x["output_per_m"],x["model"]),default=None)
    if task=="fast":
        proposal,basis=fast or heuristic_speed,("observed_single_probe" if fast else "name_heuristic")
    elif task in ("coding","reasoning"):
        proposal,basis=heuristic_quality,"name_heuristic_not_evaluated"
    elif task=="budget":
        proposal,basis=(cheapest["model"] if cheapest else None),("owner_price_only" if cheapest else "no_verified_price")
    else:
        proposal,basis=c["selected"],"configured_preference"
    return {"provider":provider,"selected":c["selected"],"task":task,
            "taskRecommended":proposal,"recommendationBasis":basis,
            "observedFastest":fast,"mode":c["mode"],"tests":options,
            "qualityMeasured":False,"pricingSource":"owner_configured_only",
            "note":"實測延遲為單次短測試；品質／程式能力未經評測，價格僅由 Owner 填寫，建議不會自動更改模型。"}


def failover_status():
    with _session() as db:
        _setup(db)
        rows=db.execute("SELECT provider,enabled FROM ceres_ops_failover").fetchall()
    enabled={x["provider"]:bool(x["enabled"]) for x in rows}
    return {p:enabled.get(p,False) for p in _PROVIDERS}


def _set_failover(provider: str, enabled: bool, actor: int):
    if provider not in _PROVIDERS:
        raise HTTPException(422,"不支援的供應商")
    with _session() as db:
        _setup(db)
        db.execute("INSERT INTO ceres_ops_failover VALUES(?,?) ON CONFLICT(provider) "
                   "DO UPDATE SET enabled=excluded.enabled",(provider,int(enabled)))
        db.execute("INSERT INTO ceres_admin_audit(actor_chat,operation,subject,created_at) VALUES(?,?,?,?)",
                   (actor,"failover_enabled" if enabled else "failover_disabled",provider,int(time.time())))


def preview(text: str, actor: int) -> dict:
    """Only a fixed, audited grammar is executable; never ask an LLM to issue commands."""
    if not isinstance(text,str) or len(text)>140:
        raise HTTPException(422,"設定內容太長")
    normalized=text.strip().lower()
    aliases={"gemini":"gemini","openai":"openai","deepseek":"deepseek"}
    matches=[p for p in aliases if p in normalized]
    if len(matches)!=1:
        raise HTTPException(422,"請指定唯一供應商：Gemini、OpenAI 或 DeepSeek")
    provider=matches[0]
    found=[(k,v) for k,v in [("speed",("速度優先","快速","speed")),
                             ("balanced",("均衡","balanced")),
                             ("quality",("品質優先","quality"))]
           if any(z in normalized for z in v)]
    if len(found)==1 and "備援" not in normalized:
        operation,value="mode",found[0][0]
        if not catalog(provider)["models"]:
            raise HTTPException(409,"需先在安全設定頁偵測模型")
    elif "備援" in normalized and any(x in normalized for x in ("開啟","啟用","enable")):
        operation,value="failover","on"
    elif "備援" in normalized and any(x in normalized for x in ("關閉","停用","disable")):
        operation,value="failover","off"
    else:
        raise HTTPException(422,"可設定：Gemini 速度優先／均衡／品質優先，或 Gemini 開啟／關閉備援")
    token=secrets.token_urlsafe(18)
    with _session() as db:
        _setup(db)
        db.execute("DELETE FROM ceres_ops_pending WHERE expires_at<?",(int(time.time()),))
        db.execute("INSERT INTO ceres_ops_pending VALUES(?,?,?,?,?,?)",
                   (token,actor,operation,provider,value,int(time.time())+120))
    return {"token":token,"provider":provider,"operation":operation,"value":value,
            "expiresInSeconds":120,"requiresConfirmation":True,
            "warning":"模型切換會影響後續聊天；開啟備援可能產生第二次 API 費用。"}


def approve(token: str, actor: int):
    if not isinstance(token,str) or not re.fullmatch(r"[A-Za-z0-9_-]{15,40}",token):
        raise HTTPException(422,"無效的操作")
    with _session() as db:
        _setup(db)
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT * FROM ceres_ops_pending WHERE token=? AND actor=? AND expires_at>?",
                       (token,actor,int(time.time()))).fetchone()
        db.execute("DELETE FROM ceres_ops_pending WHERE token=?",(token,))
        item=dict(row) if row else None
    if not item:
        raise HTTPException(409,"操作確認已失效或已使用")
    if item["operation"]=="mode":
        result=select_mode(item["provider"],item["value"],"",actor)
        return {"ok":True,"selected":result["selected"],"provider":item["provider"]}
    if item["operation"]=="failover":
        _set_failover(item["provider"],item["value"]=="on",actor)
        return {"ok":True,"provider":item["provider"],"failover":item["value"]=="on"}
    raise HTTPException(422,"不支援的操作")


async def generate_with_failover(settings, message, history, source_hint, generator=None):
    """Exactly one optional same-provider retry after a primary failure; opt-in only."""
    from ceres_server_model import generate_reply, ModelUnavailable
    run=generator or generate_reply
    try:
        return await run(settings,message,history,source_hint)
    except ModelUnavailable:
        provider=("gemini" if "generativelanguage.googleapis.com" in settings.base
                  else "deepseek" if "api.deepseek.com" in settings.base
                  else "openai" if "api.openai.com" in settings.base else None)
        if not provider or not failover_status().get(provider):
            raise
        records=[x for x in _probe_snapshot(provider)
                 if x["ok"] and x["model"]!=settings.model
                 and time.time()-x["checked_at"]<86400
                 and x["model"] in {m["id"] for m in catalog(provider)["models"]}]
        if not records:
            raise
        # Prefer last observed fast responder, with deterministic tie-breaking.
        alt=min(records,key=lambda x:(x["latency_ms"] or 999999,x["model"]))["model"]
        return await run(replace(settings,model=alt),message,history,source_hint)
