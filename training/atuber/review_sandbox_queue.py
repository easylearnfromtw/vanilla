"""Explicit human-gated conversion of Atuber sandbox review queue to SFT JSONL.
The sandbox runner cannot and must not mark its own synthetic records approved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from dataset import validate_jsonl


def _rows(path: Path) -> list[dict]:
    if not path.is_file() or path.stat().st_size > 20_000_000:
        raise ValueError("QUEUE_MISSING_OR_TOO_LARGE")
    values = []
    for no, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except ValueError as exc:
            raise ValueError(f"INVALID_JSONL_{no}") from exc
        if not isinstance(item, dict):
            raise ValueError(f"INVALID_ITEM_{no}")
        values.append(item)
    return values


def _digest(row: dict) -> str:
    return hashlib.sha256(json.dumps(
        [row["id"], row["user"], row["assistant"]], ensure_ascii=False,
        separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def template(queue: Path, destination: Path) -> dict:
    if destination.exists():
        raise ValueError("REFUSE_OVERWRITE_DECISIONS")
    candidates = _rows(queue)
    values = []
    seen = set()
    for row in candidates:
        item_id = row.get("id")
        if not isinstance(item_id, str) or item_id in seen:
            raise ValueError("DUPLICATE_CANDIDATE_ID")
        seen.add(item_id)
        if row.get("source") != "synthetic-sandbox" or row.get("reviewed") is not False:
            raise ValueError("ONLY_UNREVIEWED_SYNTHETIC_QUEUE")
        values.append({
            "id": item_id, "sha256": _digest(row), "approved": False,
            "quality_checked": False, "rights_confirmed": False,
            "reviewer": "", "notes": "Review tool action, prompt validity, rights and leakage."
        })
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("".join(json.dumps(x, ensure_ascii=False)+"\n" for x in values), encoding="utf-8")
    return {"decisionTemplates": len(values), "approved": 0, "trained": False}


def promote(queue: Path, decisions: Path, destination: Path) -> dict:
    if destination.exists():
        raise ValueError("REFUSE_OVERWRITE_TRAINING_DATA")
    candidates = _rows(queue)
    review = _rows(decisions)
    approvals = {}
    for value in review:
        item_id = value.get("id")
        if not isinstance(item_id, str) or item_id in approvals:
            raise ValueError("DUPLICATE_REVIEW_DECISION")
        approvals[item_id] = value
    output = []
    seen_ids, seen_content = set(), set()
    for item in candidates:
        item_id = item.get("id")
        if not isinstance(item_id, str) or item_id in seen_ids:
            raise ValueError("INVALID_CANDIDATE_ID")
        seen_ids.add(item_id)
        if item.get("source") != "synthetic-sandbox" or item.get("reviewed") is not False:
            raise ValueError("NOT_UNREVIEWED_SYNTHETIC_SOURCE")
        if item.get("holdout") is True:
            # Held-out rows cannot be used for training, even if approved.
            continue
        decision = approvals.get(item_id)
        if not decision or decision.get("approved") is not True:
            continue
        if (decision.get("sha256") != _digest(item)
                or decision.get("quality_checked") is not True
                or decision.get("rights_confirmed") is not True
                or not isinstance(decision.get("reviewer"), str)
                or len(decision["reviewer"].strip()) < 3):
            raise ValueError("APPROVAL_PROVENANCE_INCOMPLETE_"+item_id)
        pair = (item.get("user"), item.get("assistant"))
        if pair in seen_content:
            continue
        seen_content.add(pair)
        output.append({
            "id": item_id, "user": item["user"], "assistant": item["assistant"],
            "domain": item["domain"], "source": "authored",
            "reviewed": True, "consent": True
        })
    if len(output) < 100:
        raise ValueError("NEED_100_APPROVED_DISTINCT_NON_HOLDOUT_ROWS")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Create private file only after validation, and refuse any overwrite.
    flags = "x"
    with destination.open(flags, encoding="utf-8") as target:
        for row in output:
            target.write(json.dumps(row, ensure_ascii=False)+"\n")
    try:
        validate_jsonl(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {"approvedRows":len(output),"trained":False,"output":str(destination)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", required=True)
    choices = parser.add_mutually_exclusive_group(required=True)
    choices.add_argument("--template-out")
    choices.add_argument("--decisions")
    parser.add_argument("--out")
    args = parser.parse_args()
    if args.template_out:
        result = template(Path(args.queue), Path(args.template_out))
    else:
        if not args.out:
            parser.error("--out is required with --decisions")
        result = promote(Path(args.queue), Path(args.decisions), Path(args.out))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
