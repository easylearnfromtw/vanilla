"""Bounded GridCraft CLI adapter for Vanilla Sheets (explicitly opt-in).

Only validated cell.set commands are generated. No user-supplied paths, shell,
arbitrary commands, existing-workbook access, remote URLs or MCP privileges.
The public PWA uses a short-lived, server-verified family session.
"""
from __future__ import annotations

import asyncio
import base64
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import FamilyIdentity, family_reader

router = APIRouter()
_LOCK = asyncio.Semaphore(1)
_ADDRESS = re.compile(r"^([A-Z])([1-9][0-9]{0,2})$")
_SAFE_FORMULA = re.compile(r"=[A-Za-z0-9_+\-*/().,:<>= $]+")
_FORMULA_WORD = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
_SAFE_FUNCTIONS = frozenset(("SUM", "AVERAGE", "COUNT", "MIN", "MAX", "ROUND", "IF", "ABS"))


class CellEntry(BaseModel):
    cell: str = Field(min_length=2, max_length=4)
    input: str = Field(max_length=5000)


class SheetExport(BaseModel):
    cells: list[CellEntry] = Field(min_length=1, max_length=500)


def validate_export(request: SheetExport) -> list[dict]:
    """Apply an Athena-style allowlist before invoking the deterministic engine."""
    seen: set[str] = set()
    commands: list[dict] = []
    size = 0
    for entry in request.cells:
        address = entry.cell.upper()
        match = _ADDRESS.fullmatch(address)
        if not match or int(match.group(2)) > 200 or address in seen:
            raise HTTPException(422, "儲存格位置不合法或重複；僅支援 A1:Z200")
        seen.add(address)
        value = entry.input
        size += len(value.encode("utf-8"))
        if size > 120_000:
            raise HTTPException(413, "單次匯出內容超出 120 KB")
        if value.startswith("="):
            # No network/file functions, strings, sheet references, external links
            # or arbitrary GridCraft commands. This is an intentionally small v1.
            if not _SAFE_FORMULA.fullmatch(value) or len(value) > 512:
                raise HTTPException(422, "公式包含第一版不支援的運算式")
            for word in _FORMULA_WORD.findall(value[1:]):
                if re.fullmatch(r"[A-Z][1-9][0-9]{0,2}", word, re.I):
                    if int(re.search(r"\d+", word).group()) > 200:
                        raise HTTPException(422, "公式參照超出 A1:Z200")
                    continue
                if word.upper() not in _SAFE_FUNCTIONS:
                    raise HTTPException(422, "公式函數不在安全允許清單")
        elif value.lstrip().startswith(("@", "+")) or (
            value.lstrip().startswith("-")
            and not re.fullmatch(r"-\d+(?:\.\d+)?", value.strip())
        ):
            raise HTTPException(422, "為避免試算表公式注入，請修改以 @、+、- 開頭的文字內容")
        commands.append({"command": "cell.set", "params": {"cell": address, "input": value}})
    return commands


def _render(commands: list[dict]) -> bytes:
    import json

    binary = shutil.which("gridcraft-cli")
    if not binary:
        raise HTTPException(503, "後端未安裝 gridcraft-cli；GridCraft 功能尚未啟用")
    with tempfile.TemporaryDirectory(prefix="vanilla-gridcraft-") as directory:
        root = Path(directory)
        script = root / "commands.jsonl"
        output = root / "export.xlsx"
        script.write_text(
            "".join(json.dumps(step, ensure_ascii=False, separators=(",", ":")) + "\n"
                    for step in commands),
            encoding="utf-8",
        )
        # Do not pass the service's OIDC, admin, Drive or model credentials
        # through to an executable maintained outside Vanilla.
        safe_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": directory,
            "TMPDIR": directory,
            "LANG": "C.UTF-8",
        }
        try:
            completed = subprocess.run(
                [binary, "run", "--script", str(script), "--out", str(output), "--quiet"],
                cwd=directory, env=safe_env, stdin=subprocess.DEVNULL,
                capture_output=True, timeout=25, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(504, "GridCraft 匯出逾時") from exc
        except OSError as exc:
            raise HTTPException(503, "GridCraft 無法啟動") from exc
        if completed.returncode != 0:
            # stderr can contain workbook contents; never expose it to clients.
            raise HTTPException(422, "GridCraft 無法處理此工作表，請檢查儲存格及公式")
        if not output.is_file() or output.stat().st_size > 3 * 1024 * 1024:
            raise HTTPException(502, "GridCraft 輸出檔案無效或超出 3 MB")
        if not zipfile.is_zipfile(output):
            raise HTTPException(502, "GridCraft 未產出有效的 XLSX 容器")
        return output.read_bytes()


@router.post("/v1/family/gridcraft/xlsx")
async def export_xlsx(request: SheetExport, _user: FamilyIdentity = Depends(family_reader)):
    if os.environ.get("WEIGUO_GRIDCRAFT_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "管理員尚未啟用 GridCraft 引擎")
    commands = validate_export(request)
    async with _LOCK:
        workbook = await asyncio.to_thread(_render, commands)
    return {
        "filename": "vanilla-sheet.xlsx",
        "xlsxBase64": base64.b64encode(workbook).decode("ascii"),
        "cellCount": len(commands),
        "scope": "active-sheet-only",
    }
