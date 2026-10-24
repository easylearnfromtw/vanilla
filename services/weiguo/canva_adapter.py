"""Canva preview generation bridge for the single verified Vanilla owner.

No Canva credential reaches the public PWA. This *operator-provisioned token*
prototype is not an OAuth connection manager; it is disabled by default.
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import deque
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import FamilyIdentity, family_user
from ceres_admin_policy import check_identity, enforce, provider_key, provider_enabled
from gas_relay import gas_provider_enabled, gas_service_call, _relay as gas_relay

router = APIRouter(prefix="/v1/family/canva", tags=["canva"])
_API = "https://api.canva.com/rest/v1"
_rate_lock = asyncio.Lock()
_recent: deque[float] = deque()
_jobs: dict[str, tuple[str, float, str]] = {}


class GenerationRequest(BaseModel):
    kind: Literal["image", "presentation"]
    prompt: str = Field(min_length=3, max_length=5000)
    aspect_ratio: Literal["square", "landscape", "portrait"] = "square"
    approved_cloud_send: bool = False


def _owner(user: FamilyIdentity) -> None:
    if enforce():
        check_identity(user.sub,user.email,scope="canva")
    elif user.role != "owner":
        raise HTTPException(403, "Canva 雲端生成僅開放已驗證的家庭擁有者")


def _token() -> str:
    enabled=provider_enabled("canva")
    if enabled is None:
        enabled=os.environ.get("WEIGUO_CANVA_ENABLED", "").lower()=="true"
    if not enabled:
        raise HTTPException(503, "Canva 雲端適配器預設停用")
    if gas_provider_enabled("canva"):
        return "managed:gas"
    value = provider_key("canva") or os.environ.get("WEIGUO_CANVA_ACCESS_TOKEN", "").strip()
    if len(value) < 20 or "\n" in value or "\r" in value:
        raise HTTPException(503, "Canva OAuth 存取權杖尚未在後端安全配置")
    return value


def _safe_url(raw: object) -> str | None:
    if not isinstance(raw, str) or len(raw) > 2048:
        return None
    parsed = urlsplit(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    return raw


async def _canva_call(method: str, suffix: str, token: str, payload: dict | None = None) -> dict:
    # Both backends use the same fixed approved Canva paths.
    if gas_provider_enabled("canva"):
        if method == "POST" and suffix == "/image-generations":
            operation, data = "image_generate", payload or {}
        elif method == "POST" and suffix == "/generations":
            operation, data = "design_generate", payload or {}
        elif method == "GET" and suffix.startswith("/image-generations/"):
            operation, data = "job_status", {"kind": "image", "job_id": suffix.split("/")[-1]}
        elif method == "GET" and suffix.startswith("/generations/"):
            operation, data = "job_status", {"kind": "presentation", "job_id": suffix.split("/")[-1]}
        else:
            raise HTTPException(400, "不支援的 Canva GAS 操作")
        upstream = await gas_service_call("canva", operation, data)
        response_data = upstream.get("data")
        if not isinstance(response_data, dict) or not isinstance(response_data.get("job"), dict):
            raise HTTPException(502, "Canva GAS 回應未提供任務資訊")
        return response_data["job"]
    # Fixed API origin, method and path. No URL input is accepted from a model or user.
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False) as client:
            response = await client.request(
                method, _API + suffix,
                headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
                json=payload,
            )
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        raise HTTPException(502, "無法連線 Canva API；請檢查後端對外 HTTPS 連線") from exc
    if response.status_code == 401:
        raise HTTPException(503, "Canva 存取權杖已失效，請由後端管理者重新授權")
    if response.status_code == 403:
        raise HTTPException(403, "Canva 帳號缺少生成功能資格或授權範圍")
    if response.status_code == 429:
        raise HTTPException(429, "Canva API 速率限制或 AI 生成額度不足")
    if response.status_code >= 400:
        raise HTTPException(502, "Canva API 拒絕此次操作（狀態碼 %d）" % response.status_code)
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Canva API 回傳格式錯誤") from exc
    if not isinstance(data, dict) or not isinstance(data.get("job"), dict):
        raise HTTPException(502, "Canva API 未提供任務狀態")
    return data["job"]


def _job_view(kind: str, item: dict) -> dict:
    """Return only the minimum verified presentation/image details."""
    status = item.get("status")
    if status not in ("in_progress", "success", "failed"):
        raise HTTPException(502, "Canva 任務狀態無效")
    output = {"kind": kind, "id": str(item.get("id", ""))[:64], "status": status}
    if status == "success":
        result = item.get("result") if isinstance(item.get("result"), dict) else {}
        if kind == "image":
            image = result.get("image") if isinstance(result.get("image"), dict) else {}
            output["url"] = _safe_url(image.get("url"))
        else:
            design = result.get("design") if isinstance(result.get("design"), dict) else {}
            urls = design.get("urls") if isinstance(design.get("urls"), dict) else {}
            output["url"] = _safe_url(urls.get("edit_url"))
            output["title"] = str(design.get("title") or "")[:120]
            output["pages"] = design.get("page_count") if isinstance(design.get("page_count"), int) else None
        if not output.get("url"):
            raise HTTPException(502, "Canva 已完成，但沒有回傳有效的 HTTPS 作品連結")
    if status == "failed":
        error = item.get("error") if isinstance(item.get("error"), dict) else {}
        code = error.get("code")
        output["error"] = str(code)[:80] if isinstance(code, str) else "generation_failed"
    return output


@router.get("/status")
async def status(user: FamilyIdentity = Depends(family_user)):
    _owner(user)
    enabled = provider_enabled("canva")
    if enabled is None:
        enabled = os.environ.get("WEIGUO_CANVA_ENABLED", "").lower() == "true"
    if enabled and gas_provider_enabled("canva"):
        try:
            inventory=await gas_relay({"action": "status"})
            configured=bool(inventory.get("providers", {}).get("canva", {}).get("configured"))
        except HTTPException:
            configured=False
        mode="gas-vault-token"
    else:
        configured = enabled and len(provider_key("canva") or os.environ.get("WEIGUO_CANVA_ACCESS_TOKEN", "").strip()) >= 20
        mode="operator-provisioned-oauth-token"
    return {"configured": configured, "enabled": enabled, "preview": True,
            "authMode": mode,
            "availableKinds": ["image", "presentation"] if configured else []}


@router.post("/generate", status_code=202)
async def generate(request: GenerationRequest, user: FamilyIdentity = Depends(family_user)):
    _owner(user)
    if not request.approved_cloud_send:
        raise HTTPException(400, "必須明確同意將本次文字傳送給 Canva")
    if not request.prompt.strip():
        raise HTTPException(400, "請提供生成內容")
    token = _token()
    async with _rate_lock:
        now = time.monotonic()
        while _recent and now - _recent[0] > 60:
            _recent.popleft()
        if len(_recent) >= 2:
            raise HTTPException(429, "Canva 生成每分鐘最多兩次，請稍後再試")
        _recent.append(now)
    if request.kind == "image":
        path = "/image-generations"
        payload = {"prompt": request.prompt.strip(), "aspect_ratio": request.aspect_ratio,
                   "idempotency_key": str(uuid4()), "asset_upload": {"type": "none"}}
    else:
        path = "/generations"
        payload = {"brief": request.prompt.strip(),
                   "design_type": {"type": "preset", "name": "presentation"}}
    item = await _canva_call("POST", path, token, payload)
    job = _job_view(request.kind, item)
    try:
        UUID(job["id"])
    except (ValueError, TypeError) as exc:
        raise HTTPException(502, "Canva 任務編號無效") from exc
    # Bound to the Google owner, in-memory only, with a 24-hour expiry.
    _jobs[job["id"]] = (user.sub, time.monotonic() + 86400, request.kind)
    return job


@router.get("/jobs/{kind}/{job_id}")
async def get_job(kind: Literal["image", "presentation"], job_id: str,
                  user: FamilyIdentity = Depends(family_user)):
    _owner(user)
    try:
        UUID(job_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, "Canva 任務編號無效") from exc
    record = _jobs.get(job_id)
    if record is None or record[0] != user.sub or record[1] < time.monotonic() or record[2] != kind:
        raise HTTPException(404, "找不到此帳號建立的 Canva 任務；後端重啟後請至 Canva 帳號查看作品")
    item = await _canva_call("GET", ("/image-generations/" if kind == "image" else "/generations/") + job_id, _token())
    return _job_view(kind, item)
