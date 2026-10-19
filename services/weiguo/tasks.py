"""Single-node audit log for short, read-only WeiGuo jobs.

This is NOT a 24/7 scheduler or a multi-tenant authorization layer. Runs fail closed
when the service restarts. Persistent monitoring belongs to Persistent Jobs.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path

VALID_STATUSES = frozenset(("queued", "running", "completed", "failed"))
DEFAULT_PATH = "/tmp/weiguo-tasks.sqlite3"


def database_path() -> Path:
    return Path(os.getenv("WEIGUO_TASK_DB", DEFAULT_PATH))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=10)
    db.row_factory = sqlite3.Row
    db.execute(
        """CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            url TEXT NOT NULL,
            steps TEXT NOT NULL,
            result TEXT,
            error TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )"""
    )
    return db


def initialize() -> None:
    """Mark orphaned in-memory runs failed and expire old results."""
    with connect() as db:
        db.execute(
            "UPDATE tasks SET state='failed',error='Service restarted before completion',updated_at=? "
            "WHERE state IN ('queued','running')",
            (int(time.time()),),
        )
        db.execute("DELETE FROM tasks WHERE updated_at < ?", (int(time.time()) - 7 * 86400,))


def start(url: str, steps: list[dict]) -> dict:
    task_id = str(uuid.uuid4())
    now = int(time.time())
    with connect() as db:
        db.execute(
            "INSERT INTO tasks (id,state,url,steps,created_at,updated_at) VALUES (?,?,?,?,?,?)",
            (task_id, "queued", url, json.dumps(steps, ensure_ascii=False), now, now),
        )
    return {"id": task_id, "status": "queued"}


def update(task_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
    if status not in VALID_STATUSES:
        raise ValueError("Invalid task status")
    # Truncate stored public data and never persist raw exception tracebacks.
    payload = json.dumps(result, ensure_ascii=False)[:24000] if result is not None else None
    with connect() as db:
        db.execute(
            "UPDATE tasks SET state=?,result=?,error=?,updated_at=? WHERE id=?",
            (status, payload, error[:180] if error else None, int(time.time()), task_id),
        )


def fetch(task_id: str) -> dict | None:
    with connect() as db:
        row = db.execute(
            "SELECT id,state,result,error,created_at,updated_at FROM tasks WHERE id=?",
            (task_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"], "status": row["state"],
        "result": json.loads(row["result"]) if row["result"] else None,
        "error": row["error"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }
