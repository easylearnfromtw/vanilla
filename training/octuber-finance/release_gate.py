#!/usr/bin/env python3
"""Verify five *individual* OCTUBER financial QLoRA artifacts against reviewed data.

Offline validation only. A success means eligible for an independent held-out
financial benchmark, NEVER training independently confirmed or production-ready.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

TIERS = {
    "0.6b": "Qwen/Qwen3-0.6B",
    "4b": "Qwen/Qwen3-4B",
    "14b": "Qwen/Qwen3-14B",
    "30b-moe": "Qwen/Qwen3-30B-A3B",
    "32b": "Qwen/Qwen3-32B",
}
HEX = re.compile(r"[a-f0-9]{64}\Z")

def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def validate(approved_dir, adapters):
    root = Path(approved_dir)
    input_hashes = {}
    for key in ("train", "eval", "test"):
        f = root / (key + ".jsonl")
        if not f.is_file():
            raise ValueError("REVIEWED_DATA_MISSING:" + key)
        input_hashes[key] = sha256(f)
    provenance_file = root / "approved-provenance.json"
    if not provenance_file.is_file():
        raise ValueError("APPROVED_LINEAGE_MISSING")
    # The pipeline writes one JSON record per line.
    records = [json.loads(line) for line in provenance_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(records) != 1:
        raise ValueError("INVALID_APPROVED_PROVENANCE")
    approved = records[0]
    if approved.get("state") != "REVIEWED_SFT_NOT_TRAINED":
        raise ValueError("UNKNOWN_REVIEW_STATUS")
    for key, value in input_hashes.items():
        if approved.get(key + "_sha256") != value:
            raise ValueError("DATASET_CHANGED_AFTER_APPROVAL:" + key)
    results = {}
    for tier, path in adapters.items():
        if tier not in TIERS:
            raise ValueError("UNSUPPORTED_TIER:" + tier)
        target = Path(path)
        record_path = target / "training-provenance.json"
        weights = target / "adapter" / "adapter_model.safetensors"
        if not record_path.is_file() or not weights.is_file():
            raise ValueError("MISSING_ADAPTER_OR_RECEIPT:" + tier)
        if weights.stat().st_size < 1000:
            raise ValueError("ADAPTER_TOO_SMALL:" + tier)
        record = json.loads(record_path.read_text(encoding="utf-8"))
        if (record.get("training_state") != "completed"
            or record.get("product") != "October"
            or record.get("tier") != tier
            or record.get("base_model") != TIERS[tier]
            or not isinstance(record.get("gpu"), str) or not record["gpu"].strip()):
            raise ValueError("MISMATCHED_MODEL_RECEIPT:" + tier)
        if (record.get("data_sha256") != input_hashes["train"]
            or record.get("eval_data_sha256") != input_hashes["eval"]
            or record.get("adapter_sha256") != sha256(weights)):
            raise ValueError("CHECKPOINT_LINEAGE_MISMATCH:" + tier)
        steps = record.get("completed_optimizer_steps")
        if (type(steps) is not int or steps < 16
            or steps != record.get("requested_optimizer_steps")):
            raise ValueError("TRAINING_STEPS_NOT_COMPLETE:" + tier)
        for measure in ("train_loss", "eval_loss"):
            value = record.get(measure)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError("UNMEASURED_TRAINING_LOSS:" + tier)
        if not HEX.fullmatch(str(record.get("request_digest", ""))):
            raise ValueError("MISSING_REQUEST_FINGERPRINT:" + tier)
        results[tier] = {
            "model": TIERS[tier], "gpu_receipt_claim": record["gpu"],
            "steps": steps, "adapter_sha256": record["adapter_sha256"],
            "eval_loss": record["eval_loss"],
            "state": "CANDIDATE_FOR_INDEPENDENT_BENCHMARK_NOT_RELEASED",
        }
    return {
        "verified_artifact_tiers": sorted(results),
        "missing_tiers": sorted(set(TIERS) - set(results)),
        "sixty_b": "NOT_SUPPORTED_BY_THIS_TRAINER",
        "approved_train_sha256": input_hashes["train"],
        "approved_eval_sha256": input_hashes["eval"],
        "blind_test_sha256": input_hashes["test"],
        "all_five_artifacts_present": set(results) == set(TIERS),
        "independent_finance_benchmark_passed": False,
        "production_release_authorized": False,
        "caveat": "local hashes and metadata do not prove provenance authenticity or GPU execution independently",
        "artifacts": results
    }

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--approved-dir", required=True)
    p.add_argument("--adapter", action="append", default=[], help="tier=/path/to/training-output")
    args = p.parse_args(argv)
    adapters = {}
    for item in args.adapter:
        if "=" not in item:
            p.error("--adapter requires tier=path")
        tier, path = item.split("=", 1)
        if tier in adapters or not path:
            p.error("duplicate or empty adapter path")
        adapters[tier] = path
    report = validate(args.approved_dir, adapters)
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
