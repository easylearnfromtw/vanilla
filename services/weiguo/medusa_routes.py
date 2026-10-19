"""Authenticated Detroit Factory / Medusa routes.

Family sessions are verified by the existing WeiGuo OIDC gateway.
Registration never grants new privileges to a manifest.
"""
from __future__ import annotations

import asyncio
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import FamilyIdentity, family_reader
from medusa_engine import execute_code, validate_submission, MedusaUnavailable, MedusaFailed


router = APIRouter()
_rate_lock = asyncio.Lock()
_recent: dict[str, list[float]] = {}


class MedusaRequest(BaseModel):
    language: Literal["python", "javascript", "cpp"]
    source_code: str = Field(min_length=1, max_length=12000)
    stdin: str = Field(default="", max_length=2000)
    approved: bool = False


async def _rate_limit(subject: str) -> None:
    async with _rate_lock:
        now = time.monotonic()
        recent = [ts for ts in _recent.get(subject, []) if now - ts < 60]
        if len(recent) >= 3:
            raise HTTPException(429, "Medusa 每分鐘最多執行 3 次")
        _recent[subject] = recent + [now]


@router.post("/v1/family/medusa/execute")
async def family_medusa_execute(request: MedusaRequest,
                                user: FamilyIdentity = Depends(family_reader)):
    if not request.approved:
        raise HTTPException(403, "必須先同意將程式碼傳送至 Medusa 執行")
    try:
        validate_submission(request.language, request.source_code, request.stdin)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await _rate_limit(user.sub)
    try:
        result = await execute_code(request.language, request.source_code, request.stdin)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MedusaUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except MedusaFailed as exc:
        raise HTTPException(502, str(exc)) from exc
    return JSONResponse(result, headers={"Cache-Control": "private, no-store",
                                        "X-Content-Type-Options": "nosniff"})
