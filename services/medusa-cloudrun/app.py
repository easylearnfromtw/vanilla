"""Medusa Cloud Run worker: execute Python ONLY inside Google Cloud Run Sandbox.

Deploy ONLY with Cloud Run --sandbox-launcher. No local subprocess fallback.
This worker has no access to Vanilla's databases, Drive, or user sessions.
"""
from __future__ import annotations

import asyncio
import hmac
import os
import re
import selectors
import signal
import subprocess
import time
import uuid

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Medusa Cloud Run Sandbox", docs_url=None, redoc_url=None, openapi_url=None)
_SANDBOX = "/usr/local/gcp/bin/sandbox"
_PYTHON = "/usr/local/bin/python3"
_LIMIT = 4096
_TIMEOUT_SECONDS = 6
_LOCK = asyncio.Semaphore(1)
_VALID_SECRET = re.compile(r"^[A-Za-z0-9_-]{48,128}$")


class RunRequest(BaseModel):
    source_code: str = Field(min_length=1, max_length=16000)
    stdin: str = Field(default="", max_length=2048)


def configured() -> bool:
    secret = os.environ.get("MEDUSA_CLOUD_SHARED_SECRET", "")
    return bool(
        _VALID_SECRET.fullmatch(secret)
        and os.environ.get("K_SERVICE")  # Never execute in Railway or local Python.
        and os.path.isfile(_SANDBOX)   # Cloud Run --sandbox-launcher is REQUIRED.
        and os.path.isfile(_PYTHON)
    )


def require_gateway(authorization: str | None = Header(default=None)) -> None:
    expected = os.environ.get("MEDUSA_CLOUD_SHARED_SECRET", "")
    if not configured():
        raise HTTPException(503, "Cloud Run sandbox 尚未設定或未啟用")
    supplied = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(401, "未授權的 Medusa gateway")


@app.get("/v1/status")
async def status(authorization: str | None = Header(default=None)):
    require_gateway(authorization)
    return JSONResponse({"ready": True, "backend": "cloudrun-sandbox", "language": "python"},
                        headers={"Cache-Control": "no-store"})


def _kill_group(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def _execute_sandbox(source: str, stdin: str) -> dict:
    """Run a single ephemeral Sandbox. Cap wall time AND output memory use."""
    if not configured():
        raise HTTPException(503, "只能在已啟用 Sandbox Launcher 的 Cloud Run 中執行")
    sandbox_id = "medusa-" + uuid.uuid4().hex[:22]
    command = [_SANDBOX, "do", "--sandbox-name", sandbox_id, "--",
               _PYTHON, "-I", "-B", "-c", source]
    start = time.monotonic()
    timed_out = False
    too_much_output = False
    chunks: dict[str, bytearray] = {"stdout": bytearray(), "stderr": bytearray()}
    proc: subprocess.Popen | None = None
    try:
        proc = subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, start_new_session=True, close_fds=True,
        )
        assert proc.stdin and proc.stdout and proc.stderr
        # The gateway enforces <= 2048 bytes: cannot fill the host stdin pipe.
        proc.stdin.write(stdin.encode("utf-8"))
        proc.stdin.close()
        with selectors.DefaultSelector() as sel:
            for label, pipe in (("stdout", proc.stdout), ("stderr", proc.stderr)):
                os.set_blocking(pipe.fileno(), False)
                sel.register(pipe, selectors.EVENT_READ, label)
            while sel.get_map():
                remaining = _TIMEOUT_SECONDS - (time.monotonic() - start)
                if remaining <= 0:
                    timed_out = True
                    _kill_group(proc)
                    break
                for key, _ in sel.select(timeout=min(0.15, remaining)):
                    try:
                        data = os.read(key.fileobj.fileno(), 1024)
                    except BlockingIOError:
                        continue
                    if not data:
                        sel.unregister(key.fileobj)
                        continue
                    dest = chunks[key.data]
                    available = _LIMIT - len(dest)
                    dest.extend(data[:max(0, available)])
                    if len(data) > available:
                        too_much_output = True
                        _kill_group(proc)
                        break
                if too_much_output:
                    break
                if proc.poll() is not None and not sel.get_map():
                    break
        try:
            returncode = proc.wait(timeout=1)
        except subprocess.TimeoutExpired:
            _kill_group(proc)
            proc.wait(timeout=1)
            timed_out = True
        elapsed = time.monotonic() - start
        if timed_out:
            state, description = 5, "Time Limit Exceeded"
        elif too_much_output:
            state, description = 11, "Output Limit Exceeded"
        elif returncode == 0:
            state, description = 3, "Accepted"
        else:
            state, description = 11, "Runtime Error"
        return {
            "engine": "medusa", "backend": "cloudrun-sandbox", "language": "python",
            "finished": True, "accepted": state == 3,
            "status_id": state, "status": description,
            "stdout": chunks["stdout"].decode("utf-8", errors="replace"),
            "stderr": chunks["stderr"].decode("utf-8", errors="replace"),
            "compile_output": "", "exit_code": returncode if not timed_out else None,
            "time": "%.3f" % elapsed, "memory": None,
        }
    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(502, "Cloud Run Sandbox 啟動失敗") from exc
    finally:
        if proc is not None:
            _kill_group(proc)
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()
        # 'sandbox do' normally deletes itself; a killed CLI might not.
        # Never let cleanup error affect the API response.
        if timed_out or too_much_output:
            try:
                subprocess.run([_SANDBOX, "delete", sandbox_id, "--force"],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=2, check=False)
            except (OSError, subprocess.SubprocessError):
                pass


@app.post("/v1/execute")
async def execute(body: RunRequest, authorization: str | None = Header(default=None)):
    require_gateway(authorization)
    if "\x00" in body.source_code or "\x00" in body.stdin:
        raise HTTPException(400, "不可包含 NUL")
    if len(body.source_code.encode("utf-8")) > 16000 or len(body.stdin.encode("utf-8")) > 2048:
        raise HTTPException(413, "程式或標準輸入超出長度上限")
    async with _LOCK:
        result = await asyncio.to_thread(_execute_sandbox, body.source_code, body.stdin)
    return JSONResponse(result, headers={
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
    })
