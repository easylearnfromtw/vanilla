#!/usr/bin/env python3
"""Human-reviewed Hermes/Firecrawl evidence -> OCTUBER SFT JSONL conversion.

Never auto-generates answers or approves third-party content. Every sample is
human-authored, evidence-hash bound and explicitly rights-reviewed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "atuber"))
from dataset import validate_jsonl  # noqa: E402
from ingest import sha  # noqa: E402

RIGHTS = {"owned", "permission", "compatible-license"}
DOMAINS = {"general", "code", "research", "writing", "tool-use", "abstention", "taiwan-pragmatics"}
APPROVAL_KEYS = {"evidence_id", "content_sha256", "question", "answer",
                 "domain", "source", "rights_basis", "rights_reference",
                 "reviewer", "reviewed", "consent", "training_approved"}


def load_jsonl(path: Path, max_bytes: int = 3_000_000) -> list[dict]:
    if not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError("REVIEW_OR_EVIDENCE_FILE_MISSING_OR_TOO_BIG")
    rows = []
    for index, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict):
            raise ValueError(f"BAD_JSONL_OBJECT_{index}")
        rows.append(row)
    return rows


def review(evidence_path: Path, approvals_path: Path, output: Path) -> dict:
    if output.exists() or output.with_suffix(".provenance.json").exists():
        raise ValueError("REFUSE_OVERWRITE_REVIEWED_SFT")
    evidence = load_jsonl(evidence_path)
    approvals = load_jsonl(approvals_path)
    indexed = {}
    for item in evidence:
        ident = item.get("id")
        body = item.get("content")
        if (not isinstance(ident, str) or not ident.startswith("ev_")
            or ident in indexed or not isinstance(body, str)
            or sha(body) != item.get("content_sha256")
            or item.get("reviewed") is not False
            or item.get("training_approved") is not False):
            raise ValueError("SOURCE_EVIDENCE_HASH_OR_STATE_INVALID")
        indexed[ident] = item
    seen_ids, seen_questions, reviewed, attestations = set(), set(), [], []
    for item in approvals:
        if set(item) != APPROVAL_KEYS:
            raise ValueError("REVIEW_APPROVAL_SCHEMA_REQUIRED")
        ev_id = item["evidence_id"]
        if ev_id not in indexed or ev_id in seen_ids:
            raise ValueError("EVIDENCE_MISSING_OR_DUPLICATE_APPROVAL")
        source = indexed[ev_id]
        if source["content_sha256"] != item["content_sha256"]:
            raise ValueError("EVIDENCE_HASH_MISMATCH")
        if (item["reviewed"] is not True or item["consent"] is not True
            or item["training_approved"] is not True
            or item["rights_basis"] not in RIGHTS
            or not isinstance(item["rights_reference"], str) or len(item["rights_reference"].strip()) < 8
            or not isinstance(item["reviewer"], str) or len(item["reviewer"].strip()) < 3
            or item["domain"] not in DOMAINS
            or item["source"] not in {"authored", "consented"}):
            raise ValueError("HUMAN_REVIEW_AND_TRAINING_RIGHTS_REQUIRED")
        question = item["question"]
        answer = item["answer"]
        if not isinstance(question, str) or not isinstance(answer, str):
            raise ValueError("HUMAN_QUESTION_AND_ANSWER_REQUIRED")
        question_key = " ".join(question.lower().split())
        if question_key in seen_questions:
            raise ValueError("DUPLICATE_QUESTION_ACROSS_SOURCES")
        seen_ids.add(ev_id)
        seen_questions.add(question_key)
        training_id = "evtrain_"+hashlib.sha256(ev_id.encode()).hexdigest()[:18]
        reviewed.append({
            "id": training_id, "user": question, "assistant": answer,
            "domain": item["domain"], "source": item["source"],
            "reviewed": True, "consent": True,
        })
        attestations.append({
            "training_id": training_id, "evidence_id": ev_id, "url": source["source_url"],
            "content_sha256": source["content_sha256"], "provider": source["provider"],
            "rights_basis": item["rights_basis"],
            "rights_reference": item["rights_reference"], "reviewer": item["reviewer"],
        })
    if not reviewed:
        raise ValueError("NO_HUMAN_APPROVED_TRAINING_SAMPLES")
    # Reuse OCTUBER base validator (sensitive-data, schema, consent, uniqueness).
    import tempfile
    with tempfile.TemporaryDirectory() as folder:
        tmp = Path(folder) / "approved.jsonl"
        tmp.write_text("".join(json.dumps(row, ensure_ascii=False)+"\n" for row in reviewed), encoding="utf-8")
        validate_jsonl(tmp, min_rows=1)
        dataset_bytes = tmp.read_bytes()
    output.parent.mkdir(parents=True, exist_ok=True)
    # Audited output, not a claim that the corpus is large enough to train 30B.
    output.write_bytes(dataset_bytes)
    audit = {"schema": 1, "state": "reviewed-training-candidates-not-trained",
             "rows": len(reviewed), "dataset_sha256": hashlib.sha256(dataset_bytes).hexdigest(),
             "source_evidence_sha256": hashlib.sha256(evidence_path.read_bytes()).hexdigest(),
             "approvals_sha256": hashlib.sha256(approvals_path.read_bytes()).hexdigest(),
             "attestations": attestations}
    output.with_suffix(".provenance.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    return audit


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--evidence", type=Path, required=True)
    p.add_argument("--approvals", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    print(json.dumps(review(a.evidence, a.approvals, a.output), ensure_ascii=False, indent=2))
