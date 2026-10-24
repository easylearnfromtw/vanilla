"""Signed backend-to-Google-Apps-Script API Vault transport.

This module is NOT a public API-key endpoint. Google OIDC family sessions are
validated by auth.family_reader; the HMAC shared secret never leaves this server.
No user-provided URL, HTTP method, provider key or arbitrary headers are used.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from urllib.parse import urlsplit
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from auth import FamilyIdentity, family_reader


router = APIRouter(prefix="/v1/family/api-vault", tags=["vanilla-gas-vault"])


def gas_provider_enabled(provider: str) -> bool:
    """Explicit cutover switch; configuration alone never changes existing flows."""
    value = os.environ.get("VANILLA_GAS_PROXY_PROVIDERS", "")
    enabled = {p.strip().lower() for p in value.split(",") if p.strip()}
    return provider in _ALLOWED and provider in enabled


async def gas_service_call(provider: str, operation: str,
                           payload: dict[str, Any] | None = None,
                           model: str | None = None) -> dict[str, Any]:
    """Internal trusted service call. Caller must perform existing permission checks."""
    if provider not in _ALLOWED or operation not in _ALLOWED[provider]:
        raise HTTPException(400, "不支援的 GAS 供應商操作")
    if not gas_provider_enabled(provider):
        raise HTTPException(503, "該 API 尚未切換至 GAS Vault")
    data: dict[str, Any] = {"action": "relay", "provider": provider,
                            "operation": operation, "payload": payload or {},
                            "approved_cloud_send": True}
    if model is not None:
        data["model"] = model
    return await _relay(data)

_ALLOWED: dict[str, frozenset[str]] = {
    "gemini": frozenset({"chat"}),
    "openai": frozenset({"chat"}),
    "deepseek": frozenset({"chat"}),
    "anthropic": frozenset({"chat"}),
    "openrouter": frozenset({"chat"}),
    "telegram": frozenset({"send_message", "edit_message", "answer_callback"}),
    "canva": frozenset({"profile", "designs", "image_generate", "design_generate", "job_status"}),
    "notion": frozenset({"search", "query_tasks", "read_task", "create_task", "update_task"}),
    "brave": frozenset({"search"}),
    "tavily": frozenset({"search"}),
    "github": frozenset({"repo"}),
}
_OWNER_ONLY = frozenset({"telegram", "canva", "notion"})
_SCRIPT_URL = re.compile(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec\Z")
_ERRORS = {
    "QUOTA_EXCEEDED": 429, "REPLAY_CAPACITY": 429, "BUSY": 503,
    "KEY_NOT_CONFIGURED": 503, "NOT_CONFIGURED": 503, "INVALID_LIMITS": 503,
    "MODEL_NOT_ALLOWED": 400, "BAD_MODEL": 400, "BAD_MAX_TOKENS": 400,
    "BAD_MESSAGES": 400, "BAD_ROLE": 400, "INVALID_INPUT": 400,
    "INPUT_TOO_LARGE": 413, "ACTION_NOT_ALLOWED": 400,
    "CONSENT_REQUIRED": 403, "CHAT_NOT_ALLOWED": 403,
    "OUTPUT_TRUNCATED": 502, "UPSTREAM_TOO_LARGE": 502,
}
_ERROR_PATTERN = re.compile(r"UPSTREAM_[1-5][0-9][0-9]\Z")


class VaultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=3, max_length=20)
    operation: str = Field(min_length=3, max_length=40)
    model: str | None = Field(default=None, max_length=100)
    payload: dict[str, Any] = Field(default_factory=dict)
    approved_cloud_send: bool = False


def _settings() -> tuple[str, str]:
    url = os.environ.get("VANILLA_GAS_WEB_APP_URL", "").strip()
    secret = os.environ.get("VANILLA_GAS_RELAY_SECRET", "")
    if not _SCRIPT_URL.fullmatch(url) or not 32 <= len(secret) <= 256:
        raise HTTPException(503, "GAS API Vault 尚未安全設定")
    if any(ord(c) < 33 or ord(c) > 126 for c in secret):
        raise HTTPException(503, "GAS API Vault 簽章密鑰格式錯誤")
    return url, secret


def _envelope(data: dict[str, Any], secret: str, *, timestamp: int | None = None,
              nonce: str | None = None) -> dict[str, Any]:
    stamp = int(time.time()) if timestamp is None else timestamp
    replay_nonce = secrets.token_urlsafe(24) if nonce is None else nonce
    compact = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    encoded = base64.urlsafe_b64encode(compact.encode("utf-8")).decode("ascii").rstrip("=")
    if len(encoded) > 68000:
        raise HTTPException(413, "單次 GAS API 請求過大")
    signed = "\n".join(("v1", str(stamp), replay_nonce, "weiguo", encoded))
    signature = hmac.new(secret.encode("utf-8"), signed.encode("utf-8"),
                         hashlib.sha256).hexdigest()
    return {"v": 1, "ts": stamp, "nonce": replay_nonce,
            "client": "weiguo", "data": encoded, "sig": signature}


async def _relay(data: dict[str, Any]) -> dict[str, Any]:
    url, secret = _settings()
    envelope = _envelope(data, secret)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0), follow_redirects=False,
                                     trust_env=False) as client:
            response = await client.post(url, json=envelope,
                                         headers={"Content-Type": "application/json"})
            # Apps Script ContentService may redirect JSON output to a distinct
            # Google-controlled host. Never follow an arbitrary Location:
            if response.status_code in (301, 302, 303, 307, 308):
                target = response.headers.get("location", "")
                parsed = urlsplit(target)
                if parsed.scheme != "https" or parsed.hostname != "script.googleusercontent.com" or parsed.username or parsed.password:
                    raise HTTPException(502, "GAS API Vault 重新導向不可信")
                response = await client.get(target)
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise HTTPException(502, "GAS API Vault 連線失敗") from exc
    final_url = response.url
    if final_url.scheme != "https" or final_url.host not in (
            "script.google.com", "script.googleusercontent.com"):
        raise HTTPException(502, "GAS API Vault 回應目的地不可信")
    if response.status_code != 200 or len(response.content) > 65000:
        raise HTTPException(502, "GAS API Vault 無法處理此次請求")
    try:
        result = response.json()
    except ValueError as exc:
        raise HTTPException(502, "GAS API Vault 未回傳合法 JSON") from exc
    if not isinstance(result, dict) or not isinstance(result.get("ok"), bool):
        raise HTTPException(502, "GAS API Vault 回應格式錯誤")
    if result["ok"]:
        return result
    code = result.get("error", "INTERNAL")
    if not isinstance(code, str) or len(code) > 48:
        code = "INTERNAL"
    status = _ERRORS.get(code, 502)
    if _ERROR_PATTERN.fullmatch(code):
        status = 429 if code == "UPSTREAM_429" else 502
    raise HTTPException(status, "GAS API Vault：" + code)


@router.get("/status")
async def vault_status(user: FamilyIdentity = Depends(family_reader)):
    """Private authenticated metadata only; never returns credential values."""
    if user.role != "owner":
        raise HTTPException(403, "僅擁有者可以檢查 API Vault 設定")
    return await _relay({"action": "status"})


@router.post("/relay")
async def vault_relay(request: VaultRequest,
                      user: FamilyIdentity = Depends(family_reader)):
    """Relay a bounded approved operation; no arbitrary URLs or credentials."""
    if request.provider not in _ALLOWED or request.operation not in _ALLOWED[request.provider]:
        raise HTTPException(400, "不支援的供應商或操作")
    if request.provider in _OWNER_ONLY and user.role != "owner":
        raise HTTPException(403, "此服務僅限擁有者使用")
    if not request.approved_cloud_send:
        raise HTTPException(403, "需要使用者明確同意雲端傳送")
    body = {"action": "relay", "provider": request.provider,
            "operation": request.operation, "approved_cloud_send": True,
            "payload": request.payload}
    if request.model is not None:
        body["model"] = request.model
    return await _relay(body)
