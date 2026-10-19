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

# CREAM native report: opt-in GridCraft XLSX with a real chart and preview formulas.
# This is not a replacement for CREAM's deterministic, local-only statistics.
from math import isfinite
from typing import Literal


class CreamReportMetric(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    n: int = Field(ge=1, le=3000)
    missing: int = Field(ge=0, le=3000)
    sum: float
    mean: float
    median: float
    min: float
    max: float
    sampleStdDev: float | None = None


class CreamReportPoint(BaseModel):
    row: int = Field(ge=2, le=3001)
    label: str = Field(max_length=120)
    value: float
    x: float | None = None


class CreamReportRequest(BaseModel):
    source: str = Field(min_length=1, max_length=120)
    rowCount: int = Field(ge=1, le=3000)
    metrics: list[CreamReportMetric] = Field(min_length=1, max_length=12)
    focusKey: str = Field(min_length=1, max_length=120)
    points: list[CreamReportPoint] = Field(min_length=1, max_length=48)
    chartKind: Literal["bar", "line", "scatter", "pie", "numberline"]


def _safe_spreadsheet_label(text: str) -> str:
    """Prevent arbitrary source labels being interpreted as GridCraft formulas."""
    normalized = "".join(char if ord(char) >= 32 else " " for char in text).strip()
    return ("'" + normalized) if normalized.startswith(("=", "+", "-", "@")) else normalized


def _column_letter(number: int) -> str:
    return chr(65 + number)


def build_cream_report(request: CreamReportRequest) -> tuple[list[dict], str | None]:
    """Build a fixed, reviewable command manifest; caller never controls commands."""
    for metric in request.metrics:
        numbers = (metric.sum, metric.mean, metric.median, metric.min, metric.max)
        if (metric.n + metric.missing != request.rowCount
            or any(not isfinite(v) for v in numbers)
            or (metric.sampleStdDev is not None and
                (not isfinite(metric.sampleStdDev) or metric.sampleStdDev < 0))):
            raise HTTPException(422, "CREAM 描述統計含無效數值或不一致的樣本數")
    if request.focusKey not in {m.key for m in request.metrics}:
        raise HTTPException(422, "圖表欄位不屬於這份 CREAM 分析")
    if len(request.points) > next(m.n for m in request.metrics if m.key == request.focusKey):
        raise HTTPException(422, "圖表點數不得超過有效樣本數")
    if len({p.row for p in request.points}) != len(request.points):
        raise HTTPException(422, "圖表來源列號不可重複")
    if any(not isfinite(p.value) or (p.x is not None and not isfinite(p.x)) for p in request.points):
        raise HTTPException(422, "圖表包含無效數值")
    # Source row numbers may exceed rowCount+1 when blank original CSV
    # rows were skipped. Preserve CREAM's actual source row trace.
    chart_kind = {
        "bar": "column", "line": "line", "scatter": "scatter", "pie": "pie",
    }.get(request.chartKind)
    if chart_kind == "pie" and (any(p.value < 0 for p in request.points)
                                  or sum(p.value for p in request.points) <= 0):
        chart_kind = None
    if chart_kind == "scatter" and any(p.x is None for p in request.points):
        chart_kind = None
    # Assemble the summary from already-calculated CREAM results; never suggest
    # that the backend independently audited the full original input.
    values: list[list] = [
        ["CREAM ANALYTICS | GRIDCRAFT"],
        ["資料來源", _safe_spreadsheet_label(request.source)],
        ["原始資料筆數", request.rowCount],
        ["統計範圍", "完整 CREAM 資料；圖表僅用最多 48 個可追溯資料點"],
        [],
        ["數值欄位", "有效 n", "缺失", "總和", "平均", "中位數", "最小", "最大", "樣本標準差"],
    ]
    for metric in request.metrics:
        values.append([
            _safe_spreadsheet_label(metric.key), metric.n, metric.missing, metric.sum,
            metric.mean, metric.median, metric.min, metric.max,
            metric.sampleStdDev if metric.sampleStdDev is not None else None,
        ])
    values.append([])
    values.append(["以下為圖表資料預覽，非完整資料集"])
    plot_header = len(values) + 1
    scatter = chart_kind == "scatter"
    values.append([
        "X 值" if scatter else "分類 / 標籤",
        _safe_spreadsheet_label(request.focusKey),
        "來源列號",
    ])
    plot_points = request.points
    if chart_kind == "pie":
        # CREAM pie combines repeated labels; preserve that exact convention.
        grouped: dict[str, tuple[float, list[str]]] = {}
        for p in plot_points:
            key = p.label or f"第 {p.row} 列"
            total, refs = grouped.get(key, (0.0, []))
            grouped[key] = (total + p.value, refs + [str(p.row)])
        for label, (amount, refs) in grouped.items():
            values.append([_safe_spreadsheet_label(label), amount, ", ".join(refs)])
    else:
        for p in plot_points:
            values.append([
                p.x if scatter else _safe_spreadsheet_label(p.label or f"第 {p.row} 列"),
                p.value, p.row,
            ])
    data_first = plot_header + 1
    data_last = len(values)
    values += [
        [],
        ["圖表預覽合計（GridCraft 公式）", f"=SUM(B{data_first}:B{data_last})"],
        ["圖表預覽平均（GridCraft 公式）", f"=AVERAGE(B{data_first}:B{data_last})"],
    ]
    commands = [
        {"command": "range.setValues", "params": {"range": "A1", "values": values}},
        {"command": "home.bold", "params": {"range": "A1:I1", "on": True}},
        {"command": "home.bold", "params": {"range": "A6:I6", "on": True}},
        {"command": "home.bold", "params": {"range": f"A{plot_header}:C{plot_header}", "on": True}},
    ]
    if chart_kind is not None:
        commands.append({
            "command": "insert.chart",
            "params": {
                "range": f"A{plot_header}:B{data_last}",
                "type": chart_kind,
                "title": _safe_spreadsheet_label(request.focusKey)[:60],
                "at": f"E{plot_header}",
            },
        })
    return commands, chart_kind


@router.post("/v1/family/gridcraft/cream-report")
async def export_cream_report(request: CreamReportRequest, _user: FamilyIdentity = Depends(family_reader)):
    if os.environ.get("WEIGUO_GRIDCRAFT_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "後端 GridCraft 尚未啟用；CREAM 本機圖表仍可正常使用")
    commands, chart_kind = build_cream_report(request)
    async with _LOCK:
        workbook = await asyncio.to_thread(_render, commands)
    return {
        "filename": "CREAM_GridCraft.xlsx",
        "xlsxBase64": base64.b64encode(workbook).decode("ascii"),
        "pointsExported": len(request.points),
        "chartType": chart_kind,
        "statisticsSource": "cream-local",
        "scope": "summary-and-chart-preview",
    }
