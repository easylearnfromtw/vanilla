"""Quirinus — operator-only, opt-in VulnClaw static code audit adapter.

This is a tightly scoped local source scanner, NOT a penetration-testing API.
The binary runs only in a separately hardened operator deployment with a
read-only source mount, no egress, no secrets and container resource limits.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/v1/operator/quirinus", tags=["detroit-factory-quirinus"])
ROOT = Path("/scan-src")
BINARY = "/usr/local/bin/vulnclaw"
SKIP_DIRS = {".git", ".venv", "node_modules", "dist", "build", "__pycache__"}
LOCK = asyncio.Semaphore(1)
MAX_FILES = 3000
MAX_JSON_BYTES = 512 * 1024
VALID_SEVERITIES = {"Critical", "High", "Medium", "Low", "Info"}


def _configured() -> bool:
    return all(os.environ.get(key, "").lower() == "true" for key in (
        "QUIRINUS_ENABLED", "QUIRINUS_ISOLATED", "QUIRINUS_SOURCE_READONLY"
    ))


def validate_source() -> Path:
    if not _configured():
        raise HTTPException(503, "Quirinus 未啟用或尚未完成隔離與唯讀來源驗證")
    if ROOT.is_symlink() or not ROOT.is_dir():
        raise HTTPException(503, "Quirinus 缺少可信任的唯讀原始碼掛載")
    if not os.path.isfile(BINARY) or not os.access(BINARY, os.X_OK):
        raise HTTPException(503, "未安裝已審核的 VulnClaw CLI")
    count = 0
    for directory, dirs, filenames in os.walk(ROOT, followlinks=False):
        for name in dirs + filenames:
            if (Path(directory) / name).is_symlink():
                raise HTTPException(422, "原始碼含符號連結，拒絕掃描以免越界")
        dirs[:] = [name for name in dirs if name not in SKIP_DIRS and not name.startswith(".")]
        count += len(filenames)
        if count > MAX_FILES:
            raise HTTPException(413, "掃描檔案超過限制")
    return ROOT


def _clean_result(payload: object) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("findings"), list):
        raise HTTPException(502, "掃描器輸出格式不符預期")
    raw = payload["findings"]
    if len(raw) > 5000:
        raise HTTPException(502, "掃描器結果數量不合理")
    severity_counts = {s: 0 for s in ("Critical", "High", "Medium", "Low", "Info")}
    findings = []
    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(502, "掃描器回傳無效的漏洞項目")
        severity = item.get("severity")
        if severity not in VALID_SEVERITIES:
            raise HTTPException(502, "掃描器回傳未知的漏洞級別")
        severity_counts[severity] += 1
        target = item.get("target", "")
        if not isinstance(target, str):
            target = ""
        try:
            safe_path = str(Path(target).relative_to(ROOT))
        except ValueError:
            safe_path = "[redacted]"
        line = item.get("line", 0)
        findings.append({
            "severity": severity,
            "rule": str(item.get("vuln_type", ""))[:80],
            "title": str(item.get("title", ""))[:150],
            "file": safe_path[:240],
            "line": line if type(line) is int and 0 <= line <= 1000000 else 0,
            "cwe": str(item.get("cwe") or "")[:32],
            "remediation": str(item.get("remediation") or "")[:300],
            "layer": str(item.get("detection_layer", ""))[:8],
        })
        # NEVER return raw evidence/source lines, stdout or stderr. They may contain credentials.
    scanned = payload.get("files_scanned")
    return {
        "tool": "quirinus", "provider": "VulnClaw",
        "mode": "local-static-only", "layers": ["L1", "L2"],
        "completed": True,
        "filesScanned": scanned if type(scanned) is int and 0 <= scanned <= MAX_FILES else 0,
        "findingsCount": len(raw), "severityCounts": severity_counts,
        "hasHighRiskFindings": bool(severity_counts["Critical"] or severity_counts["High"]),
        "findings": findings[:80], "truncated": len(raw) > 80,
        "note": "靜態規則檢測不能證明程式碼安全；請人工覆核誤報與漏報。",
    }


@router.get("/status")
async def quirinus_status():
    return {
        "tool": "quirinus", "enabled": _configured(),
        "mode": "local-static-only", "networkScanning": False,
        "exploitation": False, "llmCodeUpload": False,
    }


@router.post("/scan")
async def quirinus_scan():
    async with LOCK:
        root = validate_source()
        try:
            process = await asyncio.create_subprocess_exec(
                BINARY, "code", "scan", str(root), "--layer", "L1,L2",
                "--format", "json", "--no-progress",
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                cwd="/",
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp",
                     "PYTHONNOUSERSITE": "1", "VULNCLAW_HOME": "/tmp/quirinus"},
            )
        except OSError as exc:
            raise HTTPException(503, "Quirinus 執行環境不可用") from exc
        try:
            out, _err = await asyncio.wait_for(process.communicate(), timeout=35)
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.wait()
            raise HTTPException(504, "Quirinus 已超過時間上限並中止") from exc
        if len(out) > MAX_JSON_BYTES or process.returncode not in (0, 1):
            raise HTTPException(502, "Quirinus 掃描失敗或回傳內容超過限制")
        try:
            parsed = json.loads(out.decode("utf-8"))
        except (UnicodeError, ValueError) as exc:
            raise HTTPException(502, "Quirinus 回傳資料無法解析") from exc
        return _clean_result(parsed)
