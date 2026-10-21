"""October M1 candidate: authenticated, independently computed READ-ONLY CSV receipts.

Opt-in, OFF by default. Authenticated Google family sub and optional Ceres chat ACL
are verified by auth.family_reader; no browser-supplied tenant or scope is trusted.
No inference, arbitrary tool execution, billing, webhook, network, or Self-Build.
Raw input and derived numerical summaries are not stored: only hashes/metadata.
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import math
import os
import re
import statistics
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import FamilyIdentity, family_reader
from ceres_gateway import _session

router = APIRouter(prefix="/v1/family/october", tags=["october-readonly"])
_TASK_ID = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$", re.I)
_VERSION = "oc-m1-readonly-v1"
_RETENTION = 30 * 86400


class CSVRequest(BaseModel):
    model_config = {"extra": "forbid"}
    task_id: str = Field(min_length=8, max_length=80)
    kind: str = Field(default="csv-descriptive-statistics", min_length=1, max_length=40)
    csv: str = Field(min_length=5, max_length=200000)
    source: str = Field(default="October CSV", min_length=1, max_length=120)


def _guard() -> bytes:
    if os.getenv("OCTOBER_SERVER_READONLY_ENABLED", "").lower() != "true":
        raise HTTPException(503, "October backend readonly not enabled")
    key = os.getenv("OCTOBER_RECEIPT_SECRET", "")
    if (len(key) < 32 or key in (os.getenv("WEIGUO_SESSION_SECRET", ""),
                                  os.getenv("WEIGUO_ADMIN_TOKEN", ""))):
        raise HTTPException(503, "October receipt signing secret not configured")
    return key.encode("utf-8")


def _validate(body: CSVRequest) -> tuple[str, bytes]:
    if not _TASK_ID.fullmatch(body.task_id) or body.kind != "csv-descriptive-statistics":
        raise HTTPException(422, "Unsupported task contract")
    if not body.source.strip() or body.source != body.source.strip():
        raise HTTPException(422, "Invalid source label")
    data = body.csv.encode("utf-8")
    if len(data) > 200000 or "\x00" in body.csv:
        raise HTTPException(413, "CSV exceeds limit")
    return hashlib.sha256(data + b"\x00" + body.source.encode("utf-8")).hexdigest(), data


def _number(raw: str) -> float | None:
    val = raw.strip()
    if (not _NUMBER.fullmatch(val) or re.match(r"^-?0\d", val)
            and not re.match(r"^-?0\.", val)):
        return None
    try:
        number = float(val)
    except ValueError:
        return None
    if not math.isfinite(number):
        raise HTTPException(422, "Non-finite numeric input")
    return number


def _calculate(data: str, source: str) -> dict:
    try:
        records = csv.reader(io.StringIO(data, newline=""), strict=True)
        header = next(records)
        if not 2 <= len(header) <= 12:
            raise HTTPException(422, "CSV must have 2–12 columns")
        columns = [v.strip()[:400] or f"欄位 {i+1}" for i, v in enumerate(header)]
        if len(set(columns)) != len(columns):
            raise HTTPException(422, "Duplicate CSV columns")
        rows: list[list[str]] = []
        for row in records:
            if len(rows) >= 3000:
                raise HTTPException(413, "CSV row limit exceeded")
            if len(row) > len(columns):
                raise HTTPException(422, "Extra CSV cells")
            trimmed = [(v.strip()[:400]) for v in row]
            trimmed.extend([""] * (len(columns) - len(trimmed)))
            if any(trimmed):
                rows.append(trimmed)
    except (csv.Error, StopIteration) as exc:
        raise HTTPException(422, "Malformed CSV") from exc
    if not rows:
        raise HTTPException(422, "No CSV observations")
    metrics = []
    for col, name in enumerate(columns):
        raw = [row[col] for row in rows if row[col] != ""]
        if not raw:
            continue
        parsed = [_number(v) for v in raw]
        if any(v is None for v in parsed):
            continue
        nums = [float(v) for v in parsed]
        ordered = sorted(nums)
        count = len(nums)
        # Separate verification using the stdlib's independently implemented
        # compensated summation/statistics, not an untrusted browser output.
        total = math.fsum(nums)
        mean = total / count
        median = statistics.median(ordered)
        stdev = statistics.stdev(nums) if count > 1 else None
        baseline = statistics.fmean(nums)
        if (not all(math.isfinite(x) for x in
                    [total, mean, median, ordered[0], ordered[-1], baseline] +
                    ([stdev] if stdev is not None else []))
                or not math.isclose(mean, baseline, rel_tol=1e-10, abs_tol=1e-9)):
            raise HTTPException(422, "Numeric verification failed")
        metrics.append({
            "key": name, "n": count, "missing": len(rows) - count,
            "sum": total, "mean": mean, "median": median,
            "min": ordered[0], "max": ordered[-1], "sampleStdDev": stdev,
        })
    if not metrics:
        raise HTTPException(422, "No verified numeric columns")
    return {"source": source, "rowCount": len(rows), "columns": columns,
            "metrics": metrics, "verification": "independent-python-statistics",
            "modelInvoked": False}


def _setup(db) -> None:
    db.execute("""CREATE TABLE IF NOT EXISTS october_readonly_receipts(
        tenant_sub TEXT NOT NULL, task_id TEXT NOT NULL,
        input_sha256 TEXT NOT NULL, result_sha256 TEXT NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, signature TEXT NOT NULL,
        PRIMARY KEY(tenant_sub, task_id)
    )""")


def _sign(key: bytes, tenant: str, task_id: str, in_hash: str,
          out_hash: str, timestamp: int) -> str:
    message = json.dumps([_VERSION, tenant, task_id, in_hash, out_hash,
                          timestamp, "verified"], separators=(",", ":")).encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def _receipt(row) -> dict:
    return {"taskId": row["task_id"], "status": row["status"],
            "inputSha256": row["input_sha256"], "resultSha256": row["result_sha256"],
            "createdAt": row["created_at"], "signature": row["signature"],
            "scope": "readonly:csv", "runtime": _VERSION}


def _checked_row(db, tenant: str, task_id: str, key: bytes):
    row = db.execute("SELECT * FROM october_readonly_receipts "
                     "WHERE tenant_sub=? AND task_id=?", (tenant, task_id)).fetchone()
    if row and (row["status"] != "verified" or not hmac.compare_digest(
            row["signature"], _sign(key, tenant, row["task_id"], row["input_sha256"],
                                     row["result_sha256"], row["created_at"]))):
        raise HTTPException(409, "Receipt integrity check failed")
    return row


@router.post("/csv")
def run_csv(body: CSVRequest, user: FamilyIdentity = Depends(family_reader)):
    key = _guard()
    input_hash, _ = _validate(body)
    # The backend recomputes all numbers from the supplied data. Client-produced
    # claims, result hashes, owner IDs and permission flags are never accepted.
    result = _calculate(body.csv, body.source)
    raw = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                     allow_nan=False).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    now = int(time.time())
    with _session() as db:
        _setup(db)
        db.execute("BEGIN IMMEDIATE")
        row = _checked_row(db, user.sub, body.task_id, key)
        if row:
            if row["input_sha256"] != input_hash or row["result_sha256"] != digest:
                raise HTTPException(409, "Task ID already used with different content")
            return {"receipt": _receipt(row), "replayed": True, "result": result}
        n = db.execute("SELECT COUNT(*) FROM october_readonly_receipts "
                       "WHERE tenant_sub=? AND created_at>=?",
                       (user.sub, now - 60)).fetchone()[0]
        if n >= 12:
            raise HTTPException(429, "October readonly rate limit")
        db.execute("DELETE FROM october_readonly_receipts WHERE created_at<?",
                   (now - _RETENTION,))
        signature = _sign(key, user.sub, body.task_id, input_hash, digest, now)
        db.execute("INSERT INTO october_readonly_receipts "
                   "(tenant_sub, task_id, input_sha256, result_sha256, "
                   "status, created_at, signature) VALUES(?,?,?,?,?,?,?)",
                   (user.sub, body.task_id, input_hash, digest, "verified", now, signature))
        row = _checked_row(db, user.sub, body.task_id, key)
        return {"receipt": _receipt(row), "replayed": False, "result": result}


@router.get("/receipts/{task_id}")
def get_receipt(task_id: str, user: FamilyIdentity = Depends(family_reader)):
    key = _guard()
    if not _TASK_ID.fullmatch(task_id):
        raise HTTPException(404, "Receipt unavailable")
    with _session() as db:
        _setup(db)
        row = _checked_row(db, user.sub, task_id, key)
        if not row:
            raise HTTPException(404, "Receipt unavailable")
        return _receipt(row)
