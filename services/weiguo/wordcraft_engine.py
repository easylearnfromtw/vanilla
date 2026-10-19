"""Opt-in, sandbox-dependent WordCraft CLI adapter for Retina.

No shell, arbitrary file path, arbitrary WordCraft command, or persistent document.
Not active unless the operator deploys a trusted binary and verifies egress isolation.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import pathlib
import re
import tempfile


class WordCraftUnavailable(RuntimeError):
    """Disabled or unconfigured external document engine."""


class WordCraftFailed(RuntimeError):
    """Conversion failed; do not expose upstream details or document content."""


MIME = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}
MAX_OUTPUT = 8 * 1024 * 1024
EXECUTION_TIMEOUT = 45.0
WORDCRAFT_LOCK = asyncio.Semaphore(1)


def available() -> bool:
    """Permit execution only for the SHA-256-pinned operator-approved binary.

    SHA matching does not replace a true OS-level sandbox or an end-to-end smoke test.
    """
    if (os.environ.get("WEIGUO_WORDCRAFT_ENABLED") != "true"
            or os.environ.get("WEIGUO_WORDCRAFT_EGRESS_ISOLATED") != "true"):
        return False
    binary = pathlib.Path(os.environ.get("WEIGUO_WORDCRAFT_CLI", "/usr/local/bin/wordcraft-cli"))
    expected = os.environ.get("WEIGUO_WORDCRAFT_SHA256", "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        return False
    try:
        if (not binary.is_absolute() or binary.is_symlink()
                or not binary.is_file() or not os.access(binary, os.X_OK)):
            return False
        if not 0 < binary.stat().st_size <= 256 * 1024 * 1024:
            return False
        with binary.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        return hmac.compare_digest(digest, expected)
    except OSError:
        return False


async def convert_markdown(title: str, body: str, fmt: str) -> bytes:
    if fmt not in MIME:
        raise ValueError("不支援此輸出格式")
    if not title.strip() or len(title) > 120 or not body.strip() or len(body) > 50000:
        raise ValueError("文件標題或內容不符合長度限制")
    if "\x00" in title or "\x00" in body:
        raise ValueError("內容包含不允許的字元")
    if not available():
        raise WordCraftUnavailable("WordCraft 尚未在受信任的後端啟用")
    cli = os.environ.get("WEIGUO_WORDCRAFT_CLI", "/usr/local/bin/wordcraft-cli")

    try:
        await asyncio.wait_for(WORDCRAFT_LOCK.acquire(), timeout=1.0)
    except asyncio.TimeoutError as exc:
        raise WordCraftUnavailable("WordCraft 工作排程繁忙") from exc
    try:
        with tempfile.TemporaryDirectory(prefix="vanilla-wordcraft-", dir="/tmp") as directory:
            source = pathlib.Path(directory) / "source.md"
            output = pathlib.Path(directory) / ("result." + fmt)
            # Treat the title as literal Markdown text rather than executable input.
            heading = title.strip().replace("\r", " ").replace("\n", " ").replace("#", r"\#")
            source.write_text("# " + heading + "\n\n" + body, encoding="utf-8")
            env = {
                "PATH": "/usr/bin:/bin",
                "HOME": directory,
                "TMPDIR": directory,
                "XDG_CACHE_HOME": directory,
                "LANG": "C.UTF-8",
            }
            try:
                process = await asyncio.create_subprocess_exec(
                    cli, "convert", str(source), str(output),
                    cwd=directory, env=env, stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                )
                try:
                    code = await asyncio.wait_for(process.wait(), timeout=EXECUTION_TIMEOUT)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
                    raise WordCraftFailed("WordCraft 轉換超時")
            except OSError as exc:
                raise WordCraftUnavailable("無法啟動 WordCraft 執行檔") from exc
            if code != 0 or not output.is_file() or output.is_symlink():
                raise WordCraftFailed("WordCraft 無法轉換指定文件")
            if output.stat().st_size <= 0 or output.stat().st_size > MAX_OUTPUT:
                raise WordCraftFailed("WordCraft 輸出超過大小限制或內容為空")
            data = output.read_bytes()
            if fmt == "pdf" and not data.startswith(b"%PDF-"):
                raise WordCraftFailed("WordCraft PDF 輸出格式不正確")
            if fmt == "docx" and not data.startswith(b"PK"):
                raise WordCraftFailed("WordCraft DOCX 輸出格式不正確")
            return data
    finally:
        WORDCRAFT_LOCK.release()
