"""Opt-in PdfCraft PDF merging with fixed, bounded CLI and no arbitrary commands.

NOTE: The Python worker is not an OS sandbox. Deploy only after the operator
has pinned a trusted binary and enforced network/process/file isolation.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import hmac
import os
from pathlib import Path
import re
import tempfile

MAX_FILE = 2 * 1024 * 1024
MAX_BASE64 = 2_800_000
MAX_OUTPUT = 12 * 1024 * 1024
MAX_INPUTS = 3
TIMEOUT_SECONDS = 45.0
COMBINE_LOCK = asyncio.Semaphore(1)


class PdfCraftUnavailable(RuntimeError):
    pass


class PdfCraftFailed(RuntimeError):
    pass


def available() -> bool:
    """Configured means checksum/policy gates passed, not real render verified."""
    if (os.environ.get("WEIGUO_PDFCRAFT_ENABLED") != "true"
            or os.environ.get("WEIGUO_PDFCRAFT_EGRESS_ISOLATED") != "true"):
        return False
    cli = Path(os.environ.get("WEIGUO_PDFCRAFT_CLI", "/usr/local/bin/pdfcraft-cli"))
    expected = os.environ.get("WEIGUO_PDFCRAFT_SHA256", "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        return False
    try:
        if not cli.is_absolute() or cli.is_symlink() or not cli.is_file() or not os.access(cli, os.X_OK):
            return False
        if not 0 < cli.stat().st_size <= 256 * 1024 * 1024:
            return False
        with cli.open("rb") as f:
            actual = hashlib.file_digest(f, "sha256").hexdigest()
        return hmac.compare_digest(actual, expected)
    except OSError:
        return False


def _decode_pdf(encoded: str) -> bytes:
    if not isinstance(encoded, str) or not 32 <= len(encoded) <= MAX_BASE64:
        raise ValueError("PDF 檔案大小超過限制或內容為空")
    try:
        contents = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("PDF Base64 編碼無效") from exc
    if not 32 <= len(contents) <= MAX_FILE:
        raise ValueError("PDF 檔案過大或內容為空")
    if not contents.startswith(b"%PDF-") or b"%%EOF" not in contents[-2048:]:
        raise ValueError("來源不是有效的 PDF 文件容器")
    return contents


def _check_output(path: Path) -> bytes:
    if not path.is_file() or path.is_symlink():
        raise PdfCraftFailed("PdfCraft 沒有產生輸出檔案")
    size = path.stat().st_size
    if not 32 <= size <= MAX_OUTPUT:
        raise PdfCraftFailed("PdfCraft 輸出超出限制")
    result = path.read_bytes()
    if not result.startswith(b"%PDF-") or b"%%EOF" not in result[-2048:]:
        raise PdfCraftFailed("PdfCraft 輸出格式未通過驗證")
    return result


async def combine_pdfs(encoded_pdfs: list[str]) -> bytes:
    if not isinstance(encoded_pdfs, list) or not 2 <= len(encoded_pdfs) <= MAX_INPUTS:
        raise ValueError("一次只能合併 2–3 份 PDF")
    sources = [_decode_pdf(s) for s in encoded_pdfs]
    if not available():
        raise PdfCraftUnavailable("PdfCraft 尚未在受信任後端完成配置")
    try:
        await asyncio.wait_for(COMBINE_LOCK.acquire(), timeout=1.0)
    except asyncio.TimeoutError as exc:
        raise PdfCraftUnavailable("PdfCraft 工作繁忙") from exc
    try:
        with tempfile.TemporaryDirectory(prefix="vanilla-pdfcraft-", dir="/tmp") as directory:
            root = Path(directory)
            paths = []
            for i, pdf in enumerate(sources):
                path = root / f"source-{i+1}.pdf"
                path.write_bytes(pdf)
                paths.append(str(path))
            output = root / "merged.pdf"
            cli = os.environ.get("WEIGUO_PDFCRAFT_CLI", "/usr/local/bin/pdfcraft-cli")
            # Exact documented upstream syntax. Never forward user CLI arguments.
            argv = (cli, "combine", *paths, "--out", str(output))
            environment = {
                "PATH": "/usr/bin:/bin",
                "HOME": directory,
                "TMPDIR": directory,
                "XDG_CACHE_HOME": directory,
                "LANG": "C.UTF-8",
            }
            try:
                process = await asyncio.create_subprocess_exec(
                    *argv, cwd=directory, env=environment,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                try:
                    code = await asyncio.wait_for(process.wait(), timeout=TIMEOUT_SECONDS)
                except asyncio.TimeoutError as exc:
                    process.kill()
                    await process.wait()
                    raise PdfCraftFailed("PdfCraft 處理超時") from exc
            except OSError as exc:
                raise PdfCraftUnavailable("無法執行 PdfCraft CLI") from exc
            if code != 0:
                raise PdfCraftFailed("PdfCraft 合併失敗，來源可能加密或受損")
            return _check_output(output)
    finally:
        COMBINE_LOCK.release()
