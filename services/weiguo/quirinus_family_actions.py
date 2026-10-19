"""Quirinus family broker: approved GitHub Actions dispatch, never local execution.

The already deployed GitHub Actions job performs offline code scan. Public
WeiGuo/Railway does NOT run VulnClaw or receive its raw findings. A tightly
scoped server-side GitHub token may only dispatch the fixed workflow on main.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import re
import secrets
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import FamilyIdentity, family_user

router = APIRouter(prefix="/v1/family/quirinus", tags=["detroit-quirinus-family"])
_GITHUB = "https://api.github.com"
_REPO = "easylearnfromtw/vanilla"
_WORKFLOW = "quirinus-offline-scan.yml"
_SUB = re.compile(r"^[0-9]{8,40}$")
_REQUEST_ID = re.compile(r"^[a-f0-9]{24}$")
_LOCK = asyncio.Lock()
_PENDING: dict[str, tuple[float, str]] = {}  # hash(token) -> (expiry, owner sub)
_RUNS: dict[str, tuple[float, str]] = {}  # request id -> (expiry, owner sub)
_RATE: dict[str, list[float]] = {}
_PLAN_SECONDS = 120
_MAX_PER_HOUR = 2
_MAX_PENDING = 16
_JOB_TTL = 24 * 3600


class ApprovedScan(BaseModel):
    approval_token: str = Field(min_length=32, max_length=128,
                                pattern=r"^[A-Za-z0-9_-]+$")
    approved: bool = False


def _allowed(user: FamilyIdentity) -> bool:
    if user.role != "owner":
        return False
    values = [v.strip() for v in os.environ.get("QUIRINUS_FAMILY_OWNER_SUBS", "").split(",") if v.strip()]
    return 0 < len(values) <= 30 and all(_SUB.fullmatch(s) for s in values) and user.sub in values


def _configuration_ready() -> bool:
    token = os.environ.get("QUIRINUS_GITHUB_ACTIONS_TOKEN", "")
    return (
        os.environ.get("QUIRINUS_FAMILY_DISPATCH_ENABLED", "false").lower() == "true"
        and len(token) >= 30 and "\n" not in token and "\r" not in token
        and token != os.environ.get("WEIGUO_ADMIN_TOKEN", "")
        and token != os.environ.get("WEIGUO_SESSION_SECRET", "")
    )


async def _owner(user: FamilyIdentity = Depends(family_user)) -> FamilyIdentity:
    if not _allowed(user):
        raise HTTPException(403, "Quirinus 僅允許後端白名單內的家庭管理者")
    return user


def _require_ready() -> None:
    if not _configuration_ready():
        raise HTTPException(503, "Quirinus 對話派工尚未由管理員設定 GitHub Actions 授權")


def _response(data: dict, status_code: int = 200) -> JSONResponse:
    return JSONResponse(data, status_code=status_code, headers={"Cache-Control": "no-store, private",
                                      "X-Content-Type-Options": "nosniff"})


def _headers() -> dict[str, str]:
    _require_ready()
    return {
        "Authorization": "Bearer " + os.environ["QUIRINUS_GITHUB_ACTIONS_TOKEN"],
        "Accept": "application/vnd.github+json",
        "User-Agent": "Vanilla-Quirinus-Family-Broker",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _purge(now: float) -> None:
    for k, (expiry, _) in list(_PENDING.items()):
        if expiry <= now:
            _PENDING.pop(k, None)
    for k, (expiry, _) in list(_RUNS.items()):
        if expiry <= now:
            _RUNS.pop(k, None)
    for k, stamps in list(_RATE.items()):
        kept = [t for t in stamps if now - t < 3600]
        if kept:
            _RATE[k] = kept
        else:
            _RATE.pop(k, None)


async def _dispatch_github(request_id: str) -> None:
    """Only one fixed GitHub repo/workflow/ref; no arbitrary repo/branch/inputs."""
    url = f"{_GITHUB}/repos/{_REPO}/actions/workflows/{_WORKFLOW}/dispatches"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=4),
                                     trust_env=False, follow_redirects=False) as client:
            r = await client.post(url, headers=_headers(),
                                  json={"ref": "main", "inputs": {"request_id": request_id}})
    except (httpx.RequestError, httpx.TimeoutException) as exc:
        raise HTTPException(502, "無法聯繫受信任的 GitHub Actions 服務") from exc
    if r.status_code != 204:
        # Never return GitHub's response body or raw auth errors to the client.
        raise HTTPException(502, "GitHub Actions 未接受此次 Quirinus 派工")


async def _find_run(request_id: str) -> dict | None:
    """Verify returned run metadata against a server-owned opaque request id."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=4),
                                     trust_env=False, follow_redirects=False) as client:
            r = await client.get(
                f"{_GITHUB}/repos/{_REPO}/actions/runs",
                params={"event": "workflow_dispatch", "branch": "main", "per_page": 50},
                headers=_headers(),
            )
    except (httpx.RequestError, httpx.TimeoutException) as exc:
        raise HTTPException(502, "無法查詢 GitHub Actions 執行狀態") from exc
    if r.status_code != 200 or len(r.content) > 512 * 1024:
        raise HTTPException(502, "GitHub Actions 查詢失敗")
    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(502, "GitHub Actions 狀態格式錯誤") from exc
    runs = data.get("workflow_runs") if isinstance(data, dict) else None
    if not isinstance(runs, list):
        raise HTTPException(502, "GitHub Actions 狀態格式錯誤")
    for run in runs:
        if not isinstance(run, dict) or run.get("display_title") != f"Quirinus approved {request_id}":
            continue
        if (run.get("event") != "workflow_dispatch" or
                run.get("path") != ".github/workflows/" + _WORKFLOW or
                run.get("head_branch") != "main"):
            continue
        rid = run.get("id")
        link = run.get("html_url")
        status = run.get("status")
        if (type(rid) is not int or rid <= 0 or
                link != f"https://github.com/{_REPO}/actions/runs/{rid}" or
                status not in ("queued", "requested", "waiting", "pending", "in_progress", "completed")):
            continue
        conclusion = run.get("conclusion")
        if conclusion not in (None, "success", "failure", "cancelled", "timed_out", "skipped", "neutral", "action_required"):
            continue
        return {"status": status, "conclusion": conclusion, "url": link, "runId": rid}
    return None


@router.get("/status")
async def status(user: FamilyIdentity = Depends(family_user)):
    # Non-owners receive no workflow, token or connection details.
    if not _allowed(user):
        return _response({"enabled": False, "note": "此帳號未取得 Quirinus 派工權限"})
    return _response({
        "enabled": _configuration_ready(),
        "scope": "Vanilla main: src / services / tests (read-only)",
        "runner": "GitHub Actions network-disabled Docker",
        "workflow": _WORKFLOW, "autoPatch": False,
        "note": ("可提出審核並逐次核准掃描" if _configuration_ready()
                 else "GitHub Actions 派工未啟用；已部署的手動 Actions 掃描仍可獨立運作"),
    })


@router.post("/prepare")
async def prepare(user: FamilyIdentity = Depends(_owner)):
    _require_ready()
    now = time.monotonic()
    token = secrets.token_urlsafe(32)
    async with _LOCK:
        _purge(now)
        if len(_PENDING) >= _MAX_PENDING:
            raise HTTPException(429, "Quirinus 待核准任務數量已達上限")
        if len(_RATE.get(user.sub, [])) >= _MAX_PER_HOUR:
            raise HTTPException(429, "Quirinus 每小時最多執行兩次")
        _PENDING[hashlib.sha256(token.encode()).hexdigest()] = (now + _PLAN_SECONDS, user.sub)
    return _response({
        "status": "awaiting-explicit-approval",
        "approvalToken": token, "expiresIn": _PLAN_SECONDS,
        "repo": _REPO, "ref": "main",
        "scope": "src / services / tests",
        "execution": "offline static L1/L2",
        "networkScanning": False, "exploitation": False,
        "sourceUpload": False, "autoPatch": False,
    })


@router.post("/execute", status_code=202)
async def execute(body: ApprovedScan, user: FamilyIdentity = Depends(_owner)):
    _require_ready()
    if not body.approved:
        raise HTTPException(403, "Athena：此操作需由使用者明確同意")
    key = hashlib.sha256(body.approval_token.encode()).hexdigest()
    now = time.monotonic()
    async with _LOCK:
        _purge(now)
        item = _PENDING.pop(key, None)  # Consume exactly once before any network call.
        if item is None or item[0] <= now or not hmac.compare_digest(item[1], user.sub):
            raise HTTPException(403, "核准憑證已過期、已使用或不屬於此帳號")
        if len(_RATE.get(user.sub, [])) >= _MAX_PER_HOUR:
            raise HTTPException(429, "Quirinus 每小時最多執行兩次")
        _RATE.setdefault(user.sub, []).append(now)
    request_id = secrets.token_hex(12)
    await _dispatch_github(request_id)
    async with _LOCK:
        _RUNS[request_id] = (time.monotonic() + _JOB_TTL, user.sub)
    return _response({"status": "accepted", "requestId": request_id,
                      "repo": _REPO, "ref": "main",
                      "note": "GitHub 已接受派工；請查詢實際工作流程結果，受理不代表掃描成功。"}, status_code=202)


@router.get("/runs/{request_id}")
async def run_status(request_id: str, user: FamilyIdentity = Depends(_owner)):
    _require_ready()
    if not _REQUEST_ID.fullmatch(request_id):
        raise HTTPException(404, "查無此 Quirinus 任務")
    async with _LOCK:
        _purge(time.monotonic())
        item = _RUNS.get(request_id)
    if item is None or item[1] != user.sub:
        raise HTTPException(404, "查無此 Quirinus 任務")
    info = await _find_run(request_id)
    return _response({"requestId": request_id, "status": info["status"] if info else "queued",
                      "conclusion": info["conclusion"] if info else None,
                      "url": info["url"] if info else None,
                      "runId": info["runId"] if info else None,
                      "note": "此處僅回傳執行狀態；統計摘要請至 GitHub Actions 檢視。"})
