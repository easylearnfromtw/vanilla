"""Medusa HTTPS adapter for Google Cloud Run Sandboxes (alternative to Judge0).

The supplied Cloud Run service MUST execute through Google's 'sandbox do'
binary. Never execute arbitrary source via subprocess, eval, or exec in WeiGuo.
"""
from __future__ import annotations

import asyncio
import os
import re
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException

_SECRET = re.compile(r"^[A-Za-z0-9_-]{48,128}$")
_HOST = re.compile(r"^medusa-cloud-[a-z0-9-]{1,55}\.a\.run\.app$")
_LOCK = asyncio.Semaphore(1)


def validated_cloud_config() -> tuple[str, str]:
    if os.environ.get("MEDUSA_ENABLED") != "true" or os.environ.get("MEDUSA_ENGINE") != "cloudrun":
        raise HTTPException(503, "Medusa Cloud Run 後端尚未啟用")
    if os.environ.get("MEDUSA_CLOUD_RUN_VERIFIED") != "true":
        raise HTTPException(503, "Cloud Run 隔離執行尚未通過實際部署驗證")
    raw = os.environ.get("MEDUSA_CLOUD_RUN_URL", "")
    parts = urlsplit(raw)
    if (parts.scheme != "https" or not parts.hostname or not _HOST.fullmatch(parts.hostname)
            or parts.username or parts.password or parts.port is not None
            or parts.path not in ("", "/") or parts.query or parts.fragment):
        raise HTTPException(503, "Medusa Cloud Run 僅允許固定的官方 HTTPS 執行節點")
    secret = os.environ.get("MEDUSA_CLOUD_SHARED_SECRET", "")
    if (not _SECRET.fullmatch(secret)
            or secret in (os.environ.get("WEIGUO_ADMIN_TOKEN"), os.environ.get("WEIGUO_SESSION_SECRET"))):
        raise HTTPException(503, "Medusa Cloud Run 私密驗證金鑰尚未安全配置")
    return raw.rstrip("/"), secret


def _headers(secret: str) -> dict[str, str]:
    return {"Authorization": "Bearer " + secret, "Cache-Control": "no-store"}


async def cloudrun_status() -> dict:
    try:
        endpoint, secret = validated_cloud_config()
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0),
                                     trust_env=False, follow_redirects=False) as client:
            response = await client.get(endpoint + "/v1/status", headers=_headers(secret))
        if response.status_code != 200 or len(response.content) > 8192:
            raise ValueError("Cloud Run service unavailable")
        data = response.json()
        if (not isinstance(data, dict) or data.get("ready") is not True
                or data.get("backend") != "cloudrun-sandbox" or data.get("language") != "python"):
            raise ValueError("Unexpected Cloud Run worker")
        return {"enabled": True, "connected": True, "language": "python",
                "backend": "cloudrun-sandbox",
                "note": "Cloud Run Sandbox API 已連線；請以實際程式執行檢驗運算端"}
    except (HTTPException, ValueError, TypeError, httpx.HTTPError):
        return {"enabled": True, "connected": False, "language": "python",
                "backend": "cloudrun-sandbox", "note": "Cloud Run Sandbox 尚未完成部署或連線驗證"}


async def execute_cloudrun(request) -> dict:
    endpoint, secret = validated_cloud_config()
    if len(request.source_code.encode("utf-8")) > 16000 or len(request.stdin.encode("utf-8")) > 2048:
        raise HTTPException(413, "Medusa 程式或輸入資料超出上限")
    try:
        async with _LOCK:
            async with httpx.AsyncClient(timeout=httpx.Timeout(18, connect=3),
                                         trust_env=False, follow_redirects=False) as client:
                response = await client.post(
                    endpoint + "/v1/execute", headers=_headers(secret),
                    json={"source_code": request.source_code, "stdin": request.stdin},
                )
        if response.status_code != 200:
            raise HTTPException(502, "Cloud Run Sandbox 拒絕或無法完成執行")
        if len(response.content) > 16384:
            raise HTTPException(502, "Cloud Run Sandbox 回傳資料超出上限")
        data = response.json()
        if (not isinstance(data, dict) or data.get("engine") != "medusa"
                or data.get("backend") != "cloudrun-sandbox"
                or data.get("language") != "python"
                or data.get("finished") is not True
                or type(data.get("accepted")) is not bool
                or type(data.get("status_id")) is not int
                or data["status_id"] not in (3, 5, 11)
                or data["accepted"] != (data["status_id"] == 3)):
            raise HTTPException(502, "Cloud Run Sandbox 回傳結果不符合合約")
        for key in ("stdout", "stderr", "compile_output", "status", "time"):
            if not isinstance(data.get(key), str):
                raise HTTPException(502, "Cloud Run Sandbox 執行輸出不合法")
        return {
            "engine": "medusa", "backend": "cloudrun-sandbox", "language": "python",
            "finished": True, "accepted": data["accepted"],
            "status_id": data["status_id"], "status": data["status"][:120],
            "stdout": data["stdout"][:4096], "stderr": data["stderr"][:4096],
            "compile_output": data["compile_output"][:4096],
            "exit_code": data.get("exit_code") if type(data.get("exit_code")) is int else None,
            "time": data["time"][:40], "memory": None,
        }
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(502, "Medusa 無法連線到 Cloud Run 執行沙盒") from exc
