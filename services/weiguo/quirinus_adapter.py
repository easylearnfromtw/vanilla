"""Quirinus: deliberately narrow, opt-in VulnClaw CodeScan integration.

No network targets, shells, user-selected paths, L3 LLM, or interactive pentesting.
The calling WeiGuo FastAPI app attaches its existing operator auth dependency.
A backend flag is NOT a sandbox: enforce read-only mounts and egress-deny on host.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["detroit-factory-quirinus"])
_LOCK = asyncio.Semaphore(1)
# Constants are intentionally not selected by requests or the frontend.
_SOURCE_ROOT = Path("/workspace/vanilla")
_CLI_BIN = Path("/opt/quirinus/bin/vulnclaw")
_MAX_OUTPUT_BYTES = 512 * 1024
_MAX_FINDINGS = 100
_ALLOWED_SEVERITIES = frozenset({"Critical", "High", "Medium", "Low", "Info"})


def validated_config() -> tuple[Path, Path]:
    """Require a trusted operator deployment. Flags are attestations, not enforcement."""
    flags = ("QUIRINUS_ENABLED", "QUIRINUS_EGRESS_BLOCKED", "QUIRINUS_SOURCE_READONLY")
    if any(os.environ.get(key, "").lower() != "true" for key in flags):
        raise HTTPException(503, "Quirinus 尚未部署或未通過隔離及唯讀掛載驗證")
    root, cli = _SOURCE_ROOT, _CLI_BIN
    if (not root.is_absolute() or not root.is_dir() or root.is_symlink()
            or not cli.is_absolute() or not cli.is_file() or cli.is_symlink()
            or not os.access(cli, os.X_OK)):
        raise HTTPException(503, "Quirinus 專用掃描目錄或受信任執行檔未配置")
    _validate_source_tree(root)
    return root, cli


def _validate_source_tree(root: Path) -> None:
    """Reject symlink escapes and unreasonably large source trees before running a scanner."""
    excluded = {".git", "node_modules", "dist", "build", ".venv", "__pycache__"}
    files = 0
    total_bytes = 0
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            if (Path(directory) / name).is_symlink():
                raise HTTPException(422, "Quirinus 原始碼目錄包含符號連結，已拒絕掃描")
        dirs[:] = [name for name in dirs if name not in excluded and not name.startswith(".")]
        for name in names:
            file = Path(directory) / name
            if not file.is_file():
                continue
            try:
                size = file.stat().st_size
            except OSError as exc:
                raise HTTPException(422, "Quirinus 無法驗證原始碼檔案大小") from exc
            files += 1
            total_bytes += size
            if files > 3000 or total_bytes > 128 * 1024 * 1024:
                raise HTTPException(413, "Quirinus 掃描範圍超過預先設定的限制")


def _clipped(value: object, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return "".join(c for c in value if c.isprintable())[:limit]


def _relative_path(raw: object, root: Path) -> str:
    """Never echo an arbitrary host path provided by a scanner."""
    if not isinstance(raw, str) or not raw or len(raw) > 4096:
        return "[redacted]"
    try:
        location = Path(raw)
        if not location.is_absolute():
            return "[redacted]"
        parts = location.relative_to(root).parts
        if (not parts or any(p in (".", "..") for p in parts)
                or any(ord(c) < 32 for c in raw)):
            return "[redacted]"
        return _clipped("/".join(parts), 240)
    except ValueError:
        return "[redacted]"


def normalize_report(report: object, root: Path) -> dict:
    if not isinstance(report, dict) or not isinstance(report.get("findings"), list):
        raise ValueError("invalid scanner JSON")
    items = report["findings"]
    if len(items) > 10000:
        raise ValueError("too many scanner findings")
    findings = []
    counts = {severity: 0 for severity in ("Critical", "High", "Medium", "Low", "Info")}
    for item in items:
        if not isinstance(item, dict):
            continue
        severity = item.get("severity")
        if severity not in _ALLOWED_SEVERITIES:
            continue
        counts[severity] += 1
        if len(findings) == _MAX_FINDINGS:
            continue
        line = item.get("line", 0)
        line = line if type(line) is int and 1 <= line <= 10000000 else 0
        findings.append({
            "severity": severity,
            "rule": _clipped(item.get("vuln_type"), 80),
            "title": _clipped(item.get("title"), 140),
            "file": _relative_path(item.get("target"), root),
            "line": line,
            "cwe": _clipped(item.get("cwe"), 24),
            "remediation": _clipped(item.get("remediation"), 300),
        })
    scanned = report.get("files_scanned", 0)
    scanned = scanned if type(scanned) is int and 0 <= scanned <= 100000 else 0
    return {
        "engine": "quirinus", "backend": "vulnclaw", "mode": "offline-code-scan",
        "layers": ["L1", "L2"], "files_scanned": scanned,
        "total_findings": sum(counts.values()), "severity_counts": counts,
        "truncated": sum(counts.values()) > len(findings), "findings": findings,
        # Deliberately never return evidence / code snippets / upstream errors.
    }


def run_fixed_scan() -> dict:
    root, cli = validated_config()
    command = [
        str(cli), "code", "scan", str(root), "--layer", "L1,L2",
        "--format", "json", "--no-progress",
    ]
    # Do not inherit API keys, credentials, proxies, user site-packages or HOME.
    env = {
        "PATH": "/usr/bin:/bin",
        "HOME": "/tmp",
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "VULNCLAW_HOME": "/tmp/quirinus-offline",
    }
    try:
        completed = subprocess.run(
            command, shell=False, input=None, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=35, check=False,
            cwd="/tmp", env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(502, "Quirinus 未完成受控掃描") from exc
    # VulnClaw code scan returns 1 when Critical/High findings exist.
    if completed.returncode not in (0, 1):
        raise HTTPException(502, "Quirinus 掃描程序未正常完成")
    if len(completed.stdout.encode("utf-8")) > _MAX_OUTPUT_BYTES:
        raise HTTPException(502, "Quirinus 報告超過輸出上限")
    try:
        payload = json.loads(completed.stdout)
        result = normalize_report(payload, root)
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(502, "Quirinus 報告格式驗證失敗") from exc
    result["scanner_exit_code"] = completed.returncode
    return result


@router.post("/v1/operator/quirinus/scan")
async def operator_quirinus_scan() -> dict:
    """No request payload: scans only the operator-mounted, fixed source tree."""
    async with _LOCK:
        return await asyncio.to_thread(run_fixed_scan)
