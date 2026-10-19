"""LUCA — privacy-first, opt-in Detroit observability.

Never collect prompts, model output, raw URLs, account identifiers, token values,
request/response bodies, headers, stack traces or arbitrary exception messages.
Logfire is an optional *SDK*; Logfire Cloud export is explicitly disabled.
"""
from __future__ import annotations

from collections import deque, defaultdict
from datetime import datetime, timezone, timedelta
from threading import RLock
from urllib.parse import urlsplit
import os
import sqlite3
import time
from typing import Any

_LOCK = RLock()
_EVENTS: deque[dict[str, Any]] = deque(maxlen=300)
_LOGFIRE = None
_INITIALIZED = False

# Only static route templates / fixed operation names. Never use raw request.url.
_ROUTES = {
    "/v1/family/tasks": ("scouts", "family.task.create"),
    "/v1/family/tasks/{task_id}": ("scouts", "family.task.read"),
    "/v1/tasks": ("scouts", "operator.task.create"),
    "/v1/tasks/{task_id}": ("scouts", "operator.task.read"),
    "/v1/execute": ("scouts", "browser.execute"),
    "/v1/operator/medusa/run": ("gateway", "medusa.run"),
    "/v1/plan": ("zeus", "browser.plan"),
    "/v1/family/gridcraft/xlsx": ("cream", "gridcraft.xlsx"),
    "/v1/family/wordcraft/convert": ("retina", "wordcraft.convert"),
    "/v1/family/orchestra/capabilities": ("orchestra", "capabilities"),
    "/v1/tools": ("zeus", "tools.register"),
    "/v1/auth/google": ("athena", "auth.signin"),
    "/v1/auth/me": ("athena", "auth.me"),
    "/v1/health": ("gateway", "health"),
    "/health": ("gateway", "health"),
}
_COMPONENTS = frozenset(("gateway", "scouts", "zeus", "cream", "retina",
                         "orchestra", "athena", "persistent-jobs"))
_EXTRA = {"background.browser": "persistent-jobs"}


def enabled() -> bool:
    return os.environ.get("LUCA_ENABLED", "false").lower() == "true"


def _db_path() -> str:
    # Optional backend-controlled aggregate database (not a client-supplied path).
    return os.environ.get("LUCA_DB", "").strip()


def _local_otlp_endpoint() -> str | None:
    raw = os.environ.get("LUCA_OTLP_ENDPOINT", "").strip()
    if not raw:
        return None
    u = urlsplit(raw)
    if (u.scheme != "http" or u.hostname not in ("127.0.0.1", "localhost", "otel-collector")
        or u.port != 4318 or u.path != "/v1/traces" or u.query or u.fragment
        or u.username or u.password or u.netloc != u.hostname + ":4318"):
        raise ValueError("LUCA_OTLP_ENDPOINT must be an exact local HTTP OTLP collector URL on port 4318")
    return raw


def initialize() -> None:
    """Initialize opt-in SDK and daily rollups; never make outbound calls by default."""
    global _LOGFIRE, _INITIALIZED
    if not enabled():
        return
    with _LOCK:
        if _INITIALIZED:
            return
        endpoint = _local_otlp_endpoint()  # fail closed on unsafe exporter config
        processors: list[Any] = []
        if endpoint:
            try:
                from opentelemetry.sdk.trace.export import BatchSpanProcessor
                from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            except ImportError as exc:
                raise RuntimeError("LUCA OTLP export requires the optional OpenTelemetry exporter") from exc
            processors = [BatchSpanProcessor(
                OTLPSpanExporter(endpoint=endpoint, timeout=3),
                max_queue_size=256, max_export_batch_size=64,
            )]
        try:
            import logfire
        except ImportError:
            if endpoint:
                raise RuntimeError("LUCA OTLP export requires Logfire SDK")
            # Local aggregate mode still works without optional Logfire dependency.
        else:
            # Most important invariants: never upload to Logfire Cloud, never
            # inspect function args or emit a console log containing secrets.
            _LOGFIRE = logfire.configure(
                send_to_logfire=False, service_name="vanilla-luca",
                console=False, inspect_arguments=False, metrics=False,
                additional_span_processors=processors,
            )
        _INITIALIZED = True


def _rollup(day: str, component: str, duration_ms: int, failed: bool) -> None:
    path = _db_path()
    if not path:
        return
    try:
        with sqlite3.connect(path, timeout=1) as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS luca_daily (
                day TEXT NOT NULL, component TEXT NOT NULL,
                total INTEGER NOT NULL DEFAULT 0,
                failures INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(day, component))""")
            connection.execute(
                """INSERT INTO luca_daily(day, component, total, failures, duration_ms)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(day, component) DO UPDATE SET
                  total=total+1, failures=failures+excluded.failures,
                  duration_ms=duration_ms+excluded.duration_ms""",
                (day, component, int(failed), duration_ms),
            )
            # Data minimisation: keep at most 30 UTC days of daily summaries.
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
            connection.execute("DELETE FROM luca_daily WHERE day < ?", (cutoff,))
    except (sqlite3.Error, OSError):
        # Observability must never take down the actual user operation.
        pass


def record(component: str, operation: str, status: int, duration_ms: float) -> None:
    """Record only bounded, low-cardinality, allowlisted, non-personal metadata."""
    if not enabled():
        return
    if component not in _COMPONENTS:
        return
    if operation not in {v[1] for v in _ROUTES.values()} | set(_EXTRA):
        return
    if not isinstance(status, int) or not 100 <= status <= 599:
        return
    if not isinstance(duration_ms, (int, float)) or not 0 <= duration_ms < 86_400_000:
        return
    now = datetime.now(timezone.utc)
    milliseconds = int(duration_ms)
    failed = status >= 400
    item = {"at": now.isoformat(timespec="seconds"), "component": component,
            "operation": operation, "status": status, "durationMs": milliseconds}
    try:
        with _LOCK:
            _EVENTS.append(item)
        _rollup(now.date().isoformat(), component, milliseconds, failed)
        if _LOGFIRE is not None:
            # Span is emitted *after* the action. Raw exceptions are never passed
            # to the exporter, so traceback messages / page content cannot leak.
            with _LOGFIRE.span("luca.operation", component=component,
                               operation=operation, status_code=status,
                               duration_ms=milliseconds):
                pass
    except Exception:
        pass


def record_http(route_template: str, status: int, duration_ms: float) -> None:
    if not enabled() or route_template.startswith("/v1/family/luca/"):
        return
    component, operation = _ROUTES.get(route_template, ("gateway", "other"))
    if operation == "other":
        # Unknown endpoints may contain user input; never record them.
        return
    record(component, operation, status, duration_ms)


def _daily() -> list[dict[str, Any]]:
    path = _db_path()
    if not path:
        return []
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=13)).date().isoformat()
        with sqlite3.connect(path, timeout=1) as connection:
            rows = connection.execute(
                """SELECT day, SUM(total), SUM(failures), SUM(duration_ms)
                FROM luca_daily WHERE day >= ? GROUP BY day ORDER BY day""",
                (cutoff,),
            ).fetchall()
        return [{"day": d, "count": n, "failures": f, "averageMs": round(ms/n) if n else 0}
                for d, n, f, ms in rows]
    except (sqlite3.Error, OSError):
        return []


def summary() -> dict[str, Any]:
    """CREAM-compatible aggregate snapshot; no owner, user or task identifiers."""
    if not enabled():
        return {"enabled": False, "scope": "backend-only", "count": 0, "failures": 0,
                "averageMs": 0, "p95Ms": 0, "components": [], "daily": [],
                "recommendations": [], "events": [], "persistent": False}
    with _LOCK:
        events = list(_EVENTS)
    n = len(events)
    failures = sum(item["status"] >= 400 for item in events)
    timings = sorted(item["durationMs"] for item in events)
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "failures": 0, "duration": 0})
    for item in events:
        t = totals[item["component"]]
        t["count"] += 1
        t["failures"] += int(item["status"] >= 400)
        t["duration"] += item["durationMs"]
    components = [
        {"name": name, "count": t["count"], "failures": t["failures"],
         "averageMs": round(t["duration"]/t["count"])}
        for name, t in sorted(totals.items(), key=lambda v: -v[1]["duration"])
    ]
    recommendations = []
    if n >= 5 and failures / n >= 0.10:
        recommendations.append("最近 300 筆請求中非成功回應比例偏高，請檢查授權與後端工具狀態。")
    if n >= 5 and timings[-1] >= 5000:
        recommendations.append("偵測到超過 5 秒的請求；優先檢查延遲最高的模組。")
    return {"enabled": True, "scope": "backend-only", "count": n, "failures": failures,
            "averageMs": round(sum(timings)/n) if n else 0,
            "p95Ms": timings[min(n-1, int(0.95*(n-1)))] if n else 0,
            "components": components, "daily": _daily(),
            "recommendations": recommendations, "events": events[-30:][::-1],
            "persistent": bool(_db_path())}
