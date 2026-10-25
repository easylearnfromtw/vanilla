"""Shared Atuber 0.6B / OCTUBER 30B-60B training-core *policy* contract.

This module is not a model, dataset, optimizer or CUDA backend.
Architecture-specific LoRA targets MUST be resolved separately.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

LORA_RANK = 8
LORA_ALPHA = 16
LORA_DROPOUT = 0.05
MIN_REVIEWED_ROWS = 100
MIN_HOLDOUT_ROWS = 5
HUMAN_REVIEW_REQUIRED = True
SYNTHETIC_SANDBOX_IS_TRAINING_DATA = False


def core_policy() -> dict:
    return {
        "schema": 1,
        "policy_name": "atuber-style-lora-sft-core",
        "reference": "training/atuber/train.py",
        "validation_module": "training/atuber/dataset.py",
        "rank": LORA_RANK,
        "alpha": LORA_ALPHA,
        "dropout": LORA_DROPOUT,
        "min_reviewed_rows": MIN_REVIEWED_ROWS,
        "min_holdout_rows": MIN_HOLDOUT_ROWS,
        "review_and_consent_required": HUMAN_REVIEW_REQUIRED,
        "toy_synthetic_examples_approved_for_llm_sft": SYNTHETIC_SANDBOX_IS_TRAINING_DATA,
        "real_weight_training_requires_authorized_cuda_and_checkpoint_receipt": True,
    }


def verify_approved_sft(path: str | Path) -> dict:
    """Reuse exact Atuber reviewed JSONL validator, never fabricate approvals."""
    from dataset import validate_jsonl, to_conversations
    rows, data_digest = validate_jsonl(path, min_rows=MIN_REVIEWED_ROWS)
    train, eval_set = to_conversations(rows)
    if len(eval_set) < MIN_HOLDOUT_ROWS:
        raise ValueError("CORE_NEEDS_FIVE_HOLDOUT_EXAMPLES")
    train_pairs = {(s["messages"][-2]["content"], s["messages"][-1]["content"]) for s in train}
    eval_pairs = {(s["messages"][-2]["content"], s["messages"][-1]["content"]) for s in eval_set}
    if train_pairs.intersection(eval_pairs):
        raise ValueError("CORE_TRAIN_EVAL_DUPLICATE")
    return {
        "approved_schema": True, "rows": len(rows),
        "training_rows": len(train), "holdout_rows": len(eval_set),
        "dataset_sha256": data_digest,
        "note": "Automated schema/consent attestation cannot independently establish real legal rights.",
    }


def sha256_payload(value: object) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()
