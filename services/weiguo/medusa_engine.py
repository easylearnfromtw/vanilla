"""Medusa: opt-in Judge0 execution adapter for Detroit Factory.

Never run submitted code in the WeiGuo process. All code goes to a privately
network-isolated Judge0 backend. Deployment must supply actual isolation.
No user-controlled URLs, language IDs, compiler flags, or shell commands.
"""
from __future__ import annotations

import asyncio
import os
from urllib.parse import urlsplit

import httpx


class MedusaUnavailable(RuntimeError):
    """Judge0 has not been safely deployed or is temporarily unavailable."""


class MedusaFailed(RuntimeError):
    """The execution service returned an invalid response (not a code error)."""


LANGUAGE_IDS = {"python": 71, "javascript": 63, "cpp": 54}
MAX_CODE = 12000
MAX_STDIN = 2000
MAX_OUTPUT = 16000
MAX_RESPONSE_BYTES = 64000
MEDUSA_LOCK = asyncio.Semaphore(2)


def endpoint() -> str | None:
    """Only trusted Docker DNS aliases. Never accept a URL from a request."""
    if os.environ.get("WEIGUO_MEDUSA_ENABLED") != "true":
        return None
    if os.environ.get("WEIGUO_MEDUSA_ISOLATED") != "true":
        return None
    raw = os.environ.get("WEIGUO_MEDUSA_URL", "").strip()
    try:
        parts = urlsplit(raw)
        if (parts.scheme != "http" or parts.hostname not in ("medusa", "judge0")
            or parts.port != 2358 or parts.username or parts.password
            or parts.path not in ("", "/") or parts.query or parts.fragment
            or raw != f"http://{parts.hostname}:2358"):
            return None
    except ValueError:
        return None
    return raw


def validate_submission(language: str, source_code: str, stdin: str) -> None:
    if language not in LANGUAGE_IDS:
        raise ValueError("Medusa 僅允許 Python、JavaScript 與 C++")
    if (not isinstance(source_code, str) or not 1 <= len(source_code) <= MAX_CODE
        or not source_code.strip() or "\x00" in source_code):
        raise ValueError("程式內容為空、過長或包含不合法字元")
    if not isinstance(stdin, str) or len(stdin) > MAX_STDIN or "\x00" in stdin:
        raise ValueError("標準輸入過長或包含不合法字元")


def _small_text(value: object) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise MedusaFailed("Medusa 回傳的輸出格式不正確")
    return value[:MAX_OUTPUT]


async def execute_code(language: str, source_code: str, stdin: str = "") -> dict:
    validate_submission(language, source_code, stdin)
    base = endpoint()
    if base is None:
        raise MedusaUnavailable("Medusa 尚未在具備網路隔離的後端啟用")
    body = {
        "language_id": LANGUAGE_IDS[language], "source_code": source_code,
        "stdin": stdin, "cpu_time_limit": 2,
        "cpu_extra_time": 0, "wall_time_limit": 5,
        "memory_limit": 128000, "stack_limit": 64000,
        "max_processes_and_or_threads": 8,
        "max_file_size": 256, "enable_network": False,
        "number_of_runs": 1,
    }
    try:
        await asyncio.wait_for(MEDUSA_LOCK.acquire(), timeout=2)
    except asyncio.TimeoutError as exc:
        raise MedusaUnavailable("Medusa 執行佇列繁忙") from exc
    try:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=2),
                                         trust_env=False, follow_redirects=False) as client:
                response = await client.post(
                    base + "/submissions?base64_encoded=false&wait=true", json=body,
                    headers={"Accept": "application/json"})
        except httpx.HTTPError as exc:
            raise MedusaUnavailable("Medusa 執行節點無法連線") from exc
        if response.status_code not in (200, 201):
            raise MedusaFailed("Medusa 執行服務拒絕請求或未開啟同步執行")
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise MedusaFailed("Medusa 回傳資料過大")
        try:
            data = response.json()
            status = data["status"]
            status_id = status["id"]
            description = status["description"]
            if (not isinstance(status_id, int) or isinstance(status_id, bool)
                or not isinstance(description, str) or not 1 <= status_id <= 20):
                raise ValueError("status")
        except (ValueError, KeyError, TypeError) as exc:
            raise MedusaFailed("Medusa 回傳內容無法驗證") from exc
        if status_id in (1, 2):
            raise MedusaUnavailable("Medusa 尚未完成執行，請稍後重新提交")
        return {
            "engine": "medusa-judge0", "language": language, "success": status_id == 3,
            "status": {"id": status_id, "description": description[:120]},
            "stdout": _small_text(data.get("stdout")),
            "stderr": _small_text(data.get("stderr")),
            "compile_output": _small_text(data.get("compile_output")),
            "message": _small_text(data.get("message")),
            "time": str(data.get("time") or "")[:32],
            "memory": str(data.get("memory") or "")[:32],
            "network": "disabled-by-request",
        }
    finally:
        MEDUSA_LOCK.release()
