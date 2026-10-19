"""Medusa — opt-in Judge0 execution adapter for Detroit Factory.

This adapter *submits* code to a separately deployed Judge0 sandbox.
It does not provide isolation by itself; public PWA/family sessions never have access.
"""
from __future__ import annotations

import asyncio
import os
import re
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["detroit-factory-medusa"])
_TOKEN = re.compile(r"^[a-zA-Z0-9_-]{8,128}$")
_ALLOWED_ORIGINS = {"http://judge0:2358", "http://127.0.0.1:2358"}
_LOCK = asyncio.Semaphore(1)


class MedusaRunRequest(BaseModel):
    """Explicit, bounded code input. No shell commands, files, URLs or credentials."""
    source_code: str = Field(min_length=1, max_length=16000)
    stdin: str = Field(default="", max_length=2048)


def validated_config() -> tuple[str, int]:
    if os.environ.get("MEDUSA_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Medusa 尚未由後端管理員啟用")
    # A flag is not a sandbox. Deployment must independently enforce disabled
    # container egress, no credentials/mounts, and Judge0's resource limits.
    if os.environ.get("MEDUSA_SANDBOX_EGRESS_BLOCKED", "false").lower() != "true":
        raise HTTPException(503, "Medusa 尚未完成執行環境的網路隔離驗證")
    endpoint = os.environ.get("MEDUSA_JUDGE0_URL", "").rstrip("/")
    parts = urlsplit(endpoint)
    if (endpoint not in _ALLOWED_ORIGINS or parts.username or parts.password
            or parts.path or parts.query or parts.fragment):
        raise HTTPException(503, "Judge0 只允許固定的內部服務網址")
    raw_id = os.environ.get("MEDUSA_PYTHON_LANGUAGE_ID", "")
    if not raw_id.isdecimal() or not (1 <= int(raw_id) <= 1000):
        raise HTTPException(503, "請先由管理員確認 Judge0 /languages 中的 Python 語言 ID")
    return endpoint, int(raw_id)


def limited_text(value: object) -> str:
    return value[:4096] if isinstance(value, str) else ""


def parse_result(data: object) -> dict:
    if not isinstance(data, dict):
        raise HTTPException(502, "Judge0 回傳無效資料")
    status = data.get("status")
    if not isinstance(status, dict) or not isinstance(status.get("id"), int):
        raise HTTPException(502, "Judge0 未提供有效的執行狀態")
    state = status["id"]
    if state < 3:
        raise HTTPException(504, "Judge0 執行逾時或尚未完成")
    return {
        "engine": "medusa", "backend": "judge0", "language": "python",
        "finished": True, "accepted": state == 3,
        "status_id": state, "status": limited_text(status.get("description"))[:120],
        "stdout": limited_text(data.get("stdout")),
        "stderr": limited_text(data.get("stderr")),
        "compile_output": limited_text(data.get("compile_output")),
        "exit_code": data.get("exit_code") if type(data.get("exit_code")) is int else None,
        "time": limited_text(data.get("time"))[:40],
        "memory": data.get("memory") if type(data.get("memory")) is int else None,
    }


async def execute_medusa(request: MedusaRunRequest) -> dict:
    endpoint, language_id = validated_config()
    if len(request.source_code.encode("utf-8")) > 16000 or len(request.stdin.encode("utf-8")) > 2048:
        raise HTTPException(413, "Medusa 程式或輸入資料超出大小限制")
    submission = {
        "language_id": language_id,
        "source_code": request.source_code,
        "stdin": request.stdin,
        "cpu_time_limit": 2,
        "wall_time_limit": 5,
        "memory_limit": 128000,
        "max_processes_and_or_threads": 8,
        "max_file_size": 256,
        "number_of_runs": 1,
        # Defense in depth. The Judge0 host MUST independently block egress.
        "enable_network": False,
    }
    try:
        async with _LOCK:
            async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=3.0),
                                         trust_env=False, follow_redirects=False) as client:
                response = await client.post(
                    endpoint + "/submissions",
                    params={"base64_encoded": "false", "wait": "true"},
                    json=submission,
                )
                if response.status_code != 201 and response.status_code != 200:
                    raise HTTPException(502, "Judge0 拒絕執行請求")
                if len(response.content) > 65536:
                    raise HTTPException(502, "Judge0 回傳超出大小限制")
                data = response.json()
                if isinstance(data, dict) and "status" in data:
                    return parse_result(data)
                token = data.get("token") if isinstance(data, dict) else None
                if not isinstance(token, str) or not _TOKEN.fullmatch(token):
                    raise HTTPException(502, "Judge0 未提供可查詢的執行結果")
                # Some Judge0 installations do not support wait=true.
                for _ in range(12):
                    await asyncio.sleep(0.5)
                    check = await client.get(
                        endpoint + "/submissions/" + token,
                        params={"base64_encoded": "false"},
                    )
                    if check.status_code != 200 or len(check.content) > 65536:
                        raise HTTPException(502, "Judge0 查詢執行結果失敗")
                    result = check.json()
                    if (isinstance(result, dict) and isinstance(result.get("status"), dict)
                            and result["status"].get("id") in (1, 2)):
                        continue
                    return parse_result(result)
                raise HTTPException(504, "Judge0 執行逾時")
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Medusa 無法連線至受信任的 Judge0 後端") from exc
    except ValueError as exc:
        raise HTTPException(502, "Judge0 回傳格式無法解析") from exc


@router.post("/v1/operator/medusa/run")
async def medusa_run(request: MedusaRunRequest):
    """Only mounted behind app.operator via Depends; never accessible by family API."""
    return await execute_medusa(request)
