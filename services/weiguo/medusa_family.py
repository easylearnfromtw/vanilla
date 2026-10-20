"""Owner-scoped Medusa gateway for the Detroit Factory PWA.

A signed-in family owner may *request* sandbox execution only after the
operator separately enables this route and allowlists that Google subject.
No operator token, arbitrary URL, filesystem path or shell command is exposed.
"""
from __future__ import annotations

import asyncio
import os
import re
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import FamilyIdentity, family_user
from medusa_adapter import MedusaRunRequest, execute_medusa, validated_config

router = APIRouter(tags=["detroit-factory-medusa-family"])
_SUB = re.compile(r"^[0-9]{8,40}$")
_RATE_LOCK = asyncio.Lock()
_RECENT: dict[str, list[float]] = {}
_MAX_PER_MINUTE = 3


class FamilyMedusaRunRequest(BaseModel):
    source_code: str = Field(min_length=1, max_length=16000)
    stdin: str = Field(default="", max_length=2048)
    approved: bool = False


def family_enabled(identity: FamilyIdentity) -> bool:
    if identity.role != "owner":
        return False
    if os.environ.get("MEDUSA_FAMILY_ENABLED") != "true":
        return False
    allowed = [x.strip() for x in os.environ.get("MEDUSA_FAMILY_OWNER_SUBS", "").split(",") if x.strip()]
    return bool(allowed) and len(allowed) <= 30 and all(_SUB.fullmatch(x) for x in allowed) and identity.sub in allowed


async def owner_gate(user: FamilyIdentity = Depends(family_user)) -> FamilyIdentity:
    if user.role != "owner":
        raise HTTPException(403, "Medusa 只允許經核准的家庭管理者")
    if not family_enabled(user):
        raise HTTPException(403, "此帳號尚未取得 Medusa 執行權限")
    return user


async def take_quota(subject: str) -> None:
    """Per-process defense-in-depth; use upstream rate limits for multiple replicas."""
    async with _RATE_LOCK:
        now = time.monotonic()
        recent = [ts for ts in _RECENT.get(subject, []) if now - ts < 60]
        if len(recent) >= _MAX_PER_MINUTE:
            raise HTTPException(429, "Medusa 每分鐘最多執行三次")
        _RECENT[subject] = recent + [now]


@router.get("/v1/family/medusa/status")
async def family_medusa_status(user: FamilyIdentity = Depends(family_user)):
    """Does not assert the remote executor works without a successful code run."""
    if not family_enabled(user):
        return {"enabled": False, "connected": False, "note": "Medusa 尚未由管理端開啟"}
    if os.environ.get("MEDUSA_ENGINE", "judge0") == "lite":
        from medusa_lite import lite_status
        return lite_status()
    if os.environ.get("MEDUSA_ENGINE", "judge0") == "cloudrun":
        from medusa_cloudrun_adapter import cloudrun_status
        return await cloudrun_status()
    try:
        endpoint, language_id = validated_config()
        async with httpx.AsyncClient(timeout=httpx.Timeout(4, connect=2),
                                     follow_redirects=False, trust_env=False) as client:
            response = await client.get(endpoint + "/languages")
        if response.status_code != 200 or len(response.content) > 65536:
            raise ValueError("unavailable")
        languages = response.json()
        if not isinstance(languages, list) or not any(
            isinstance(item, dict) and item.get("id") == language_id for item in languages
        ):
            raise ValueError("language not found")
        return {"enabled": True, "connected": True,
                "language": "python", "note": "Judge0 API 可連線；執行沙盒仍須由正式測試驗證"}
    except (HTTPException, httpx.HTTPError, ValueError, TypeError):
        return {"enabled": True, "connected": False,
                "language": "python", "note": "Judge0 尚無可驗證的內部連線"}


@router.post("/v1/family/medusa/run")
async def family_medusa_run(request: FamilyMedusaRunRequest,
                            user: FamilyIdentity = Depends(owner_gate)):
    if not request.approved:
        raise HTTPException(403, "本次程式執行需使用者明確核准")
    if "\x00" in request.source_code or "\x00" in request.stdin:
        raise HTTPException(400, "程式內容不可包含 NUL 字元")
    # Verify actual upstream configuration BEFORE consuming quota.
    if os.environ.get("MEDUSA_ENGINE", "judge0") == "cloudrun":
        from medusa_cloudrun_adapter import validated_cloud_config
        validated_cloud_config()
    else:
        validated_config()
    await take_quota(user.sub)
    output = await execute_medusa(MedusaRunRequest(
        source_code=request.source_code, stdin=request.stdin))
    return JSONResponse(output, headers={
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
    })
