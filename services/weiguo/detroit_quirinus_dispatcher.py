"""Detroit -> Athena -> Quirinus -> CREAM -> JENSEN HUANG handoff.

PRIVATE OPERATOR workflow only. It does not run a second model, fetch remote
targets, auto-patch code, or expose authority to the static Vanilla PWA.
An explicit, one-use short-lived plan approval is required before every scan.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import quirinus_adapter as quirinus

router = APIRouter(prefix="/v1/operator/detroit/quirinus",
                   tags=["detroit-quirinus-workflow"])
_APPROVAL_LOCK = asyncio.Lock()
_PENDING: dict[str, tuple[float, str]] = {}
_APPROVAL_TTL = 120
_MAX_PENDING = 4
_RULE_ID = re.compile(r"^[a-zA-Z0-9_.-]{1,80}$")
_REL_PATH = re.compile(r"^[a-zA-Z0-9_./-]{1,240}$")
_CWE = re.compile(r"^CWE-[0-9]{1,6}$")
_REMEDIATIONS = {
    "dangerous_eval": "避免使用 eval；改為允許清單或安全解析器。",
    "command_injection": "移除 Shell 字串拼接，使用固定程式與經驗證的參數。",
    "sql_string_concat": "將字串拼接 SQL 改為參數化查詢。",
    "xss_inner_html": "使用安全的文字節點或經過審查的 HTML 清理機制。",
    "path_traversal": "正規化檔案路徑，並限制在核准的根目錄內。",
    "ssrf_url_fetch": "對網址與 DNS／IP 進行限制，並建立實際的網路出口防護。",
    "hardcoded_password": "移除硬編碼認證資料，使用私有祕密管理並輪替。",
    "hardcoded_openai_key": "撤銷已外洩 API 金鑰，改用後端祕密儲存。",
    "weak_crypto": "淘汰弱加密演算法，改用具認證性的現代加密。",
    "insecure_deserialization": "拒絕不可信的反序列化資料，使用安全格式。",
}
_GENERIC_FIX = "由開發者依規則識別碼檢查受影響程式碼，提出最小修補並新增回歸測試。"


class ExecuteApprovedReview(BaseModel):
    approval_token: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    approved: bool = False


def _enabled() -> None:
    if os.environ.get("DETROIT_QUIRINUS_DISPATCH_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Detroit Quirinus 調度尚未由管理員啟用")


def _fingerprint(root: Path) -> str:
    """Bind approval to the byte-for-byte approved source snapshot."""
    digest = hashlib.sha256()
    total = 0
    count = 0
    excluded = quirinus.SKIP_DIRS
    for directory, dirs, filenames in os.walk(root, followlinks=False):
        dirs[:] = sorted(name for name in dirs if name not in excluded and not name.startswith("."))
        for name in sorted(filenames):
            path = Path(directory) / name
            if path.is_symlink():
                raise HTTPException(422, "原始碼含符號連結")
            if not path.is_file():
                continue
            count += 1
            if count > quirinus.MAX_FILES:
                raise HTTPException(413, "檔案超過安全數量限制")
            digest.update(path.relative_to(root).as_posix().encode("utf-8"))
            digest.update(b"\0")
            try:
                with path.open("rb") as file:
                    while chunk := file.read(65536):
                        total += len(chunk)
                        if total > quirinus.MAX_TOTAL_SOURCE_BYTES:
                            raise HTTPException(413, "檔案總量超過限制")
                        digest.update(chunk)
            except OSError as exc:
                raise HTTPException(422, "原始碼快照無法完整讀取") from exc
            digest.update(b"\0")
    return digest.hexdigest()


def _approved_source() -> Path:
    _enabled()
    return quirinus.validate_source()  # fail closed on disabled/untrusted runner


def _fixed_fix(rule: object) -> str:
    return _REMEDIATIONS.get(rule, _GENERIC_FIX) if isinstance(rule, str) else _GENERIC_FIX


def _safe_rule(value: object) -> str:
    return value if isinstance(value, str) and _RULE_ID.fullmatch(value) else "unclassified"


def _safe_path(value: object) -> str:
    return value if isinstance(value, str) and _REL_PATH.fullmatch(value) and (
        ".." not in value.split("/") and not value.startswith("/")
    ) else "[redacted]"


def build_review_handoff(scan: dict) -> dict:
    """CREAM deterministic counters; JENSEN receives inert data, not untrusted prompts."""
    if not isinstance(scan, dict) or scan.get("tool") != "quirinus" or not scan.get("completed"):
        raise HTTPException(502, "Quirinus 掃描資料未完成驗證")
    severities = ("Critical", "High", "Medium", "Low", "Info")
    counts = scan.get("severityCounts")
    if (not isinstance(counts, dict) or
            any(type(counts.get(s)) is not int or counts[s] < 0 for s in severities)):
        raise HTTPException(502, "CREAM 嚴重度統計無法驗證")
    total = scan.get("findingsCount")
    if type(total) is not int or total < 0 or total != sum(counts[s] for s in severities):
        raise HTTPException(502, "CREAM 掃描筆數不一致")
    findings = scan.get("findings")
    if not isinstance(findings, list) or len(findings) > 80:
        raise HTTPException(502, "CREAM 掃描預覽格式錯誤")
    tasks = []
    seen = set()
    for item in findings:
        if not isinstance(item, dict):
            continue
        severity = item.get("severity")
        if severity not in severities:
            continue
        rule = _safe_rule(item.get("rule"))
        file = _safe_path(item.get("file"))
        line = item.get("line")
        line = line if type(line) is int and 1 <= line <= 1_000_000 else 0
        cwe = item.get("cwe")
        cwe = cwe if isinstance(cwe, str) and _CWE.fullmatch(cwe) else ""
        signature = (rule, file, line)
        if signature in seen:
            continue
        seen.add(signature)
        tasks.append({
            "id": hashlib.sha256(f"{rule}:{file}:{line}".encode()).hexdigest()[:16],
            "severity": severity, "rule": rule, "file": file, "line": line,
            "cwe": cwe, "recommendation": _fixed_fix(rule),
            "needsHumanReview": True, "patchAuthorized": False,
        })
    tasks.sort(key=lambda t: (severities.index(t["severity"]), t["file"], t["line"]))
    return {
        "workflow": "detroit-quirinus-approved-review",
        "stages": ["athena-approved", "quirinus-completed", "cream-validated",
                   "jensen-review-prepared"],
        "cream": {
            "engine": "CREAM", "source": "Quirinus L1/L2",
            "filesScanned": scan.get("filesScanned", 0),
            "totalFindings": total, "severityCounts": {s: counts[s] for s in severities},
            "riskScore": min(100, 10*counts["Critical"] + 5*counts["High"] +
                             2*counts["Medium"] + counts["Low"]),
            "highRisk": bool(counts["Critical"] or counts["High"]),
            "truncated": bool(scan.get("truncated")),
            "caveat": "本結果為靜態規則風險指標，非可利用性證明或完整安全認證。",
        },
        "jensenHandoff": {
            "engine": "JENSEN HUANG",
            "kind": "human-reviewed-repair-backlog",
            "taskCount": len(tasks), "tasks": tasks,
            "autoPatch": False, "autoMerge": False, "llmInvoked": False,
            "note": "修復建議由固定規則產生；不包含原始碼或模型指令。須由開發者審查後另行啟動修補。",
        },
    }


def _private_json(data: dict) -> JSONResponse:
    return JSONResponse(data, headers={
        "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
    })


@router.post("/prepare")
async def prepare_review():
    """Athena gate: generate a one-time plan for operator to approve explicitly."""
    root = _approved_source()
    digest = await asyncio.to_thread(_fingerprint, root)
    now = time.monotonic()
    token = secrets.token_urlsafe(32)
    async with _APPROVAL_LOCK:
        for key, (expiry, _) in list(_PENDING.items()):
            if expiry <= now:
                _PENDING.pop(key, None)
        if len(_PENDING) >= _MAX_PENDING:
            raise HTTPException(429, "待審核 Quirinus 任務過多")
        _PENDING[hashlib.sha256(token.encode()).hexdigest()] = (now + _APPROVAL_TTL, digest)
    return _private_json({
        "status": "awaiting-explicit-approval", "tool": "quirinus",
        "scope": "pre-mounted-source-only", "sourceSha256": digest,
        "approvalToken": token, "expiresIn": _APPROVAL_TTL,
        "policy": {"activeScanning": False, "networkTarget": False,
                   "codeMutation": False, "sourceUpload": False,
                   "requiresApproval": True},
        "stages": ["Athena", "Quirinus", "CREAM", "JENSEN HUANG"],
    })


@router.post("/execute")
async def execute_review(request: ExecuteApprovedReview):
    """Consume approval before starting the scan; replay and stale snapshots deny."""
    _enabled()
    if not request.approved:
        raise HTTPException(403, "Athena：必須由操作者明確核准本次掃描")
    key = hashlib.sha256(request.approval_token.encode()).hexdigest()
    async with _APPROVAL_LOCK:
        entry = _PENDING.pop(key, None)
    if entry is None or entry[0] <= time.monotonic():
        raise HTTPException(403, "核准憑證不存在、已過期或已使用")
    root = _approved_source()
    actual = await asyncio.to_thread(_fingerprint, root)
    if not hmac.compare_digest(actual, entry[1]):
        raise HTTPException(409, "原始碼快照已改變，請重新取得授權")
    scan = await quirinus.quirinus_scan()
    return _private_json(build_review_handoff(scan))
