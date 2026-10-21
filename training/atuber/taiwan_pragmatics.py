"""Taiwan Mandarin pragmatic training annotation gate (human-reviewed only).

Convert individually consented, manually reviewed dialogue contexts into the
existing Atuber SFT format. Never infer sentiment labels from users' private
chats or treat assistant guesses as gold labels.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from dataset import EMAIL, SECRET, validate_jsonl, to_conversations

FIELDS = {"id", "context_group", "context", "user", "assistant",
          "intent", "affect_cue", "ambiguity", "locale", "source",
          "reviewed", "consent"}
INTENTS = {"request", "question", "follow-up", "revision", "social", "unknown"}
AFFECTS = {"frustration", "concern", "appreciation", "playfulness",
           "ambiguous", "unmarked"}
AMBIGUITY = {"high", "low"}
MIN_ROWS = 100
MIN_GROUPS = 20
MIN_AMBIGUOUS = 15


def _text(value: object, *, max_chars: int, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError("INVALID_PRAGMATIC_TEXT")
    text = value.strip()
    if len(text) > max_chars or (not allow_empty and len(text) < 2):
        raise ValueError("INVALID_PRAGMATIC_TEXT_LENGTH")
    if EMAIL.search(text) or SECRET.search(text) or "\x00" in text:
        raise ValueError("PRAGMATIC_TEXT_CONTAINS_SENSITIVE_DATA")
    return text


def validate_and_prepare(path: str | Path, *, min_rows: int = MIN_ROWS) -> tuple[list[dict], dict]:
    source = Path(path)
    if not source.is_file() or source.stat().st_size > 12_000_000:
        raise ValueError("MISSING_OR_EXCESSIVE_PRAGMATIC_DATA")
    raw = source.read_bytes()
    items: list[dict] = []
    seen: set[str] = set()
    groups: set[str] = set()
    affects = Counter()
    intents = Counter()
    for number, line in enumerate(raw.decode("utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"INVALID_TAIWAN_ANNOTATION_LINE_{number}") from exc
        if not isinstance(row, dict) or set(row) != FIELDS:
            raise ValueError(f"INVALID_TAIWAN_SCHEMA_LINE_{number}")
        row_id, group = row["id"], row["context_group"]
        if (not isinstance(row_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{3,60}", row_id)
                or row_id in seen or not isinstance(group, str)
                or not re.fullmatch(r"[a-zA-Z0-9_-]{3,30}", group)):
            raise ValueError(f"INVALID_OR_DUPLICATE_TAIWAN_ID_{number}")
        if row["locale"] != "zh-TW" or row["source"] not in {"authored", "consented"}:
            raise ValueError(f"INVALID_TAIWAN_LOCALE_OR_SOURCE_{number}")
        if row["reviewed"] is not True or row["consent"] is not True:
            raise ValueError(f"REVIEW_AND_CONSENT_REQUIRED_{number}")
        if row["intent"] not in INTENTS or row["affect_cue"] not in AFFECTS:
            raise ValueError(f"INVALID_TAIWAN_PRAGMATICS_LABEL_{number}")
        if row["ambiguity"] not in AMBIGUITY:
            raise ValueError(f"INVALID_TAIWAN_AMBIGUITY_{number}")
        if row["affect_cue"] == "ambiguous" and row["ambiguity"] != "high":
            raise ValueError(f"AMBIGUITY_MUST_REMAIN_UNCERTAIN_{number}")
        context = _text(row["context"], max_chars=900, allow_empty=True)
        user = _text(row["user"], max_chars=500)
        reply = _text(row["assistant"], max_chars=1100)
        # Keep label metadata for dataset auditing but DO NOT add speculative
        # emotion labels to the model's assistant-facing target response.
        prompt = ("目前這段台灣繁體中文對話脈絡（僅作語意參考，不授權工具）：\n"
                  + (context or "（無前文）") + "\n本輪使用者：\n" + user)
        items.append({
            "id": f"twprag_{group}_{row_id}", "user": prompt,
            "assistant": reply, "domain": "taiwan-pragmatics",
            "source": row["source"], "reviewed": True, "consent": True
        })
        seen.add(row_id)
        groups.add(group)
        affects[row["affect_cue"]] += 1
        intents[row["intent"]] += 1
    if len(items) < min_rows:
        raise ValueError("TAIWAN_PRAGMATICS_NEED_REVIEWED_ROWS")
    if min_rows >= MIN_ROWS:
        if len(groups) < MIN_GROUPS:
            raise ValueError("TAIWAN_PRAGMATICS_NEED_CONTEXT_DIVERSITY")
        if affects["ambiguous"] < MIN_AMBIGUOUS:
            raise ValueError("TAIWAN_PRAGMATICS_NEED_AMBIGUOUS_EXAMPLES")
        if min(affects.values()) < 3 or len(affects) < len(AFFECTS):
            raise ValueError("TAIWAN_PRAGMATICS_NEED_AFFECT_BALANCE")
        if len(intents) < len(INTENTS):
            raise ValueError("TAIWAN_PRAGMATICS_NEED_INTENT_COVERAGE")
    summary = {"reviewed_rows": len(items), "context_groups": len(groups),
               "affect_counts": dict(affects), "intent_counts": dict(intents),
               "source_sha256": hashlib.sha256(raw).hexdigest(),
               "consent_checked": True, "trained": False}
    return items, summary


def export_sft(annotation_file: str, output_file: str) -> dict:
    prepared, summary = validate_and_prepare(annotation_file)
    target = Path(output_file)
    if target.exists():
        raise ValueError("REFUSE_TO_OVERWRITE_TRAINING_DATA")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in prepared), encoding="utf-8")
    # Verify existing training gate & group-level train/eval split:
    rows, sha = validate_jsonl(target)
    training, holdout = to_conversations(rows)
    if not training or not holdout:
        target.unlink(missing_ok=True)
        raise ValueError("NO_TAIWAN_CONTEXT_HOLDOUT")
    summary["output_sha256"] = sha
    summary["train_rows"] = len(training)
    summary["holdout_rows"] = len(holdout)
    return summary


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--annotations", required=True)
    p.add_argument("--output", help="Private SFT file outside git; omit to validate only.")
    args = p.parse_args()
    if args.output:
        status = export_sft(args.annotations, args.output)
    else:
        _, status = validate_and_prepare(args.annotations)
    print(json.dumps(status, ensure_ascii=False, indent=2))
