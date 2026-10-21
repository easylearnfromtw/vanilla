"""Validated, consented and reviewed Atuber SFT dataset. Python stdlib only."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

BASE = "Qwen/Qwen3-0.6B"
MIN_TRAINING_ROWS = 100
ALLOWED_DOMAINS = {"general", "code", "research", "writing", "tool-use", "abstention", "taiwan-pragmatics"}
SECRET = re.compile(
    r"(?:sk-proj-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|"
    r"AIza[A-Za-z0-9_-]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    r"(?i:password|api[_ -]?key|secret|bearer)\s*[:=]\s*[^\s]{8,})"
)
EMAIL = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

SYSTEM = (
    "你是阿土伯（Atuber），為 Vanilla 系統設計的獨立模型。"
    "使用臺灣繁體中文；先結論，再說明具體依據；不能捏造資料、來源或工具執行結果。"
    "沒有實際工具回條就不能聲稱已執行操作；越權或不確定時安全棄權。"
)


def validate_jsonl(path: str | Path, *, min_rows: int = MIN_TRAINING_ROWS) -> tuple[list[dict], str]:
    """Reject unreviewed chat dumps, duplicates, plausible secrets and schema drift."""
    src = Path(path)
    if not src.is_file() or src.stat().st_size > 16_000_000:
        raise ValueError("DATASET_UNAVAILABLE_OR_TOO_LARGE")
    raw = src.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    rows: list[dict] = []
    ids: set[str] = set()
    for index, line in enumerate(raw.decode("utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"INVALID_JSONL_LINE_{index}") from exc
        if not isinstance(data, dict) or set(data) != {
            "id", "user", "assistant", "domain", "reviewed", "source", "consent"
        }:
            raise ValueError(f"INVALID_SCHEMA_LINE_{index}")
        item_id = data["id"]
        if (not isinstance(item_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{3,80}", item_id)
                or item_id in ids):
            raise ValueError(f"DUPLICATE_OR_INVALID_ID_LINE_{index}")
        ids.add(item_id)
        if data["reviewed"] is not True or data["consent"] is not True:
            raise ValueError(f"TRAINING_APPROVAL_REQUIRED_LINE_{index}")
        if data["source"] not in {"authored", "consented"} or data["domain"] not in ALLOWED_DOMAINS:
            raise ValueError(f"INVALID_ORIGIN_OR_DOMAIN_LINE_{index}")
        for key in ("user", "assistant"):
            value = data[key]
            if (not isinstance(value, str) or not 3 <= len(value.strip()) <= 2500
                    or "\x00" in value or SECRET.search(value) or EMAIL.search(value)):
                raise ValueError(f"INVALID_OR_SENSITIVE_{key.upper()}_LINE_{index}")
        rows.append(data)
    if len(rows) < min_rows:
        raise ValueError(f"MINIMUM_{min_rows}_REVIEWED_RECORDS_REQUIRED")
    return rows, digest


def to_conversations(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Stable holdout by ID; no chat memorization / cross-split row duplication."""
    train, evaluation = [], []
    for row in rows:
        transcript = {"messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": row["user"]},
            {"role": "assistant", "content": row["assistant"]},
        ]}
        # Taiwan expression paraphrases from the same reviewed situation must never
        # leak between train and evaluation splits.
        split_id = row["id"].rsplit("_", 1)[0] if row["domain"] == "taiwan-pragmatics" else row["id"]
        bucket = int(hashlib.sha256(split_id.encode()).hexdigest()[:8], 16) % 10
        (evaluation if bucket == 0 else train).append(transcript)
    if not train or not evaluation:
        raise ValueError("HOLDOUT_SPLIT_EMPTY")
    return train, evaluation
