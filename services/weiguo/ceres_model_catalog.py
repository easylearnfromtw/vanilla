"""Server-only provider model discovery and deterministic selection.

Model listing is NOT a billable generation probe and does not guarantee
chat compatibility, pricing, or quota. Key material stays in WeiGuo only.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx
from fastapi import HTTPException

from ceres_gateway import _session
from ceres_admin_policy import provider_key

_SUPPORTED = {"gemini", "openai", "deepseek"}
_MODES = {"speed", "balanced", "quality", "manual"}
_MODEL_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,99}$")
_MAX_MODELS = 100
_TTL = 6 * 3600
_EXCLUDED = ("embed", "moderation", "audio", "tts", "speech", "image",
             "video", "realtime", "whisper", "transcri", "dall", "sora", "robotics")

def _setup(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_model_catalog (
      provider TEXT PRIMARY KEY, models_json TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'balanced', manual_model TEXT NOT NULL DEFAULT '',
      refreshed_at INTEGER NOT NULL
    )""")

def _clean_id(raw: Any, provider: str) -> str | None:
    if not isinstance(raw, str):
        return None
    value = raw.removeprefix("models/") if provider == "gemini" else raw
    if not _MODEL_ID.fullmatch(value) or any(term in value.lower() for term in _EXCLUDED):
        return None
    if provider == "gemini" and not value.startswith("gemini-"):
        return None
    if provider == "openai" and not (value.startswith("gpt-") or re.match(r"^o[1-9][0-9]?(?:-|$)",value)):
        return None
    if provider == "deepseek" and not value.startswith("deepseek-"):
        return None
    return value

def _parse(provider: str, payload: Any) -> list[dict]:
    if not isinstance(payload, dict):
        raise ValueError("invalid catalog")
    items = payload.get("models" if provider == "gemini" else "data", [])
    if not isinstance(items, list):
        raise ValueError("invalid model list")
    seen = set()
    models = []
    for item in items[:1000]:
        if not isinstance(item, dict):
            continue
        if provider == "gemini" and "generateContent" not in item.get("supportedGenerationMethods", []):
            continue
        raw = item.get("name" if provider == "gemini" else "id")
        identifier = _clean_id(raw,provider)
        if not identifier or identifier in seen:
            continue
        seen.add(identifier)
        name = item.get("displayName" if provider == "gemini" else "name", identifier)
        name = str(name)[:75] if isinstance(name, str) else identifier
        context = item.get("inputTokenLimit" if provider == "gemini" else "context_window")
        models.append({"id":identifier, "name":name,
                       "context":context if isinstance(context,int) and 0<context<10**9 else None})
    return models[:_MAX_MODELS]

def _rank(model: dict, mode: str) -> tuple:
    name = model["id"].lower()
    lite = any(w in name for w in ("lite", "nano", "mini", "flash", "instant"))
    premium = any(w in name for w in ("pro", "reason", "thinking", "max"))
    preview = any(w in name for w in ("preview", "exp", "experimental", "deprecated"))
    match = re.search(r"(?:gemini-|gpt-|deepseek-v|^o)([0-9]+)(?:\.([0-9]+))?", name)
    version = ((int(match.group(1)), int(match.group(2) or 0)) if match else (0,0))
    if mode == "speed":
        kind = 2 if any(w in name for w in ("lite", "nano", "flash")) else 1 if lite else 0
    elif mode == "quality":
        kind = 2 if premium else 0 if lite else 1
    else:
        kind = 2 if any(w in name for w in ("flash", "mini")) else 1 if lite else 0
    # A heuristic, NOT a factual provider-defined quality/price ranking.
    return (kind, not preview, version, name)

def _pick(models: list[dict], mode: str, manual: str) -> str:
    allowed = {m["id"] for m in models}
    if mode == "manual":
        return manual if manual in allowed else ""
    return max(models, key=lambda m:_rank(m,mode))["id"] if models else ""

def catalog(provider: str) -> dict:
    if provider not in _SUPPORTED:
        return {"provider":provider,"supported":False,"models":[],"mode":"auto","selected":"","updatedAt":None}
    with _session() as db:
        _setup(db)
        row = db.execute("SELECT * FROM ceres_model_catalog WHERE provider=?",(provider,)).fetchone()
    if not row:
        return {"provider":provider,"supported":True,"models":[],"mode":"balanced","selected":"",
                "updatedAt":None,"stale":True}
    try:
        models=json.loads(row["models_json"])
        if not isinstance(models,list):
            models=[]
    except ValueError:
        models=[]
    return {"provider":provider,"supported":True,"models":models,
            "mode":row["mode"],"selected":_pick(models,row["mode"],row["manual_model"]),
            "updatedAt":row["refreshed_at"],"stale":int(time.time())-row["refreshed_at"]>_TTL}

def selected_model(provider: str) -> str|None:
    result=catalog(provider)
    return result["selected"] or None

def clear_catalog(provider: str) -> None:
    if provider not in _SUPPORTED:
        return
    with _session() as db:
        _setup(db)
        db.execute("DELETE FROM ceres_model_catalog WHERE provider=?",(provider,))

def select_mode(provider: str, mode: str, model_id: str, actor: int) -> dict:
    if provider not in _SUPPORTED or mode not in _MODES:
        raise HTTPException(422,"不支援的模型供應商或選擇模式")
    info=catalog(provider)
    if not info["models"]:
        raise HTTPException(409,"請先透過 API 查詢可用模型")
    if mode == "manual" and model_id not in {m["id"] for m in info["models"]}:
        raise HTTPException(422,"選擇的模型不在此金鑰可見清單內")
    with _session() as db:
        _setup(db)
        db.execute("UPDATE ceres_model_catalog SET mode=?,manual_model=? WHERE provider=?",
                   (mode,model_id if mode=="manual" else "",provider))
        db.execute("INSERT INTO ceres_admin_audit(actor_chat,operation,subject,created_at) VALUES(?,?,?,?)",
                   (actor,"model_mode",provider+":"+mode,int(time.time())))
    return catalog(provider)

async def discover(provider: str) -> dict:
    if provider not in _SUPPORTED:
        raise HTTPException(422,"此服務沒有可查詢的 AI 模型清單")
    key=provider_key(provider)
    if not key:
        raise HTTPException(409,"請先設定並啟用此供應商 API")
    if provider=="gemini":
        endpoint="https://generativelanguage.googleapis.com/v1beta/models"
        headers={"x-goog-api-key":key}
    elif provider=="openai":
        endpoint="https://api.openai.com/v1/models"
        headers={"Authorization":"Bearer "+key}
    else:
        endpoint="https://api.deepseek.com/models"
        headers={"Authorization":"Bearer "+key}
    # No attacker-supplied URL, redirects, proxy, or arbitrary headers.
    try:
        async with httpx.AsyncClient(timeout=10,follow_redirects=False,trust_env=False) as client:
            reply=await client.get(endpoint,headers=headers)
        if reply.status_code in (401,403):
            raise HTTPException(422,"API 驗證失敗或沒有讀取模型的權限")
        if reply.status_code==429:
            raise HTTPException(429,"供應商暫時限制模型查詢，稍後重試")
        if reply.status_code!=200:
            raise HTTPException(502,"無法向供應商取得模型清單")
        if len(reply.content)>600000:
            raise HTTPException(502,"供應商模型清單過大")
        models=_parse(provider,reply.json())
    except (httpx.HTTPError,ValueError,TypeError) as exc:
        raise HTTPException(502,"模型查詢失敗，保留已儲存的憑證") from None
    if not models:
        raise HTTPException(422,"API 沒有列出可支援的文字生成模型")
    with _session() as db:
        _setup(db)
        old=db.execute("SELECT mode,manual_model FROM ceres_model_catalog WHERE provider=?",(provider,)).fetchone()
        mode=old["mode"] if old and old["mode"] in _MODES else "balanced"
        manual=old["manual_model"] if old else ""
        if mode=="manual" and manual not in {m["id"] for m in models}:
            mode,manual="balanced",""
        db.execute("""INSERT INTO ceres_model_catalog(provider,models_json,mode,manual_model,refreshed_at)
          VALUES(?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET
          models_json=excluded.models_json,mode=excluded.mode,
          manual_model=excluded.manual_model,refreshed_at=excluded.refreshed_at""",
          (provider,json.dumps(models,ensure_ascii=False),mode,manual,int(time.time())))
    return catalog(provider)
