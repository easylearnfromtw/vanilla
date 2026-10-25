#!/usr/bin/env python3
"""Offline OCTUBER finance adapter lineage gate, NOT a deployment/benchmark.

Accepts only receipts from the immutable-base, approved-finance-SFT trainer.
All hashes/metadata are local claims; their validity still needs independent
GPU logs, supply-chain verification and out-of-time financial evaluation.
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
    "30b": "Qwen/Qwen3-30B-A3B-Instruct-2507",
    "32b": "Qwen/Qwen3-32B",
}
COMMIT = re.compile(r"[a-f0-9]{40}\Z")

def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def validate(approved_dir, adapters):
    root = Path(approved_dir)
    hashes = {}
    for name in ("train", "eval", "test"):
        path = root / (name + ".jsonl")
        if not path.is_file():
            raise ValueError("MISSING_APPROVED_DATA:" + name)
        hashes[name] = sha256(path)
    provenance = root / "approved-provenance.json"
    if not provenance.is_file():
        raise ValueError("APPROVED_LINEAGE_MISSING")
    rows = [json.loads(x) for x in provenance.read_text(encoding="utf-8").splitlines() if x.strip()]
    if len(rows) != 1 or rows[0].get("state") != "REVIEWED_SFT_NOT_TRAINED":
        raise ValueError("INVALID_APPROVAL_STATE")
    approved = rows[0]
    for name in hashes:
        if approved.get(name + "_sha256") != hashes[name]:
            raise ValueError("DATASET_CHANGED_AFTER_APPROVAL:" + name)

    report = {}
    for tier, path in adapters.items():
        if tier not in TIERS:
            raise ValueError("UNSUPPORTED_TIER:" + tier)
        target = Path(path)
        manifest_path = target / "training-provenance.json"
        weights = target / "adapter" / "adapter_model.safetensors"
        if not manifest_path.is_file() or not weights.is_file():
            raise ValueError("MISSING_FINANCIAL_CHECKPOINT:" + tier)
        if weights.stat().st_size < 1000:
            raise ValueError("INCOMPLETE_FINANCIAL_ADAPTER:" + tier)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (manifest.get("status") != "ADAPTER_TRAINED_NOT_RELEASED"
            or manifest.get("tier") != tier
            or manifest.get("base_model") != TIERS[tier]
            or not COMMIT.fullmatch(str(manifest.get("base_revision", "")).lower())
            or manifest.get("released") is not False
            or manifest.get("independent_backtest_passed") is not False):
            raise ValueError("WRONG_TRAINER_OR_UNVERIFIED_MODEL:" + tier)
        stamp = manifest.get("timestamp_utc")
        if not isinstance(stamp, str) or not stamp.endswith("+00:00"):
            raise ValueError("MISSING_TRAINING_TIMESTAMP:" + tier)
        host = manifest.get("gpu")
        if (not isinstance(host, dict) or host.get("available") is not True
            or not isinstance(host.get("device"), str) or not host["device"]):
            raise ValueError("MISSING_GPU_ATTESTATION:" + tier)
        lineage = manifest.get("data_provenance")
        if not isinstance(lineage, dict) or (
            lineage.get("train_sha256") != hashes["train"]
            or lineage.get("eval_sha256") != hashes["eval"]
            or lineage.get("provenance_sha256") != sha256(provenance)
        ):
            raise ValueError("FINANCE_DATA_LINEAGE_MISMATCH:" + tier)
        if manifest.get("adapter_sha256") != sha256(weights):
            raise ValueError("FINANCE_WEIGHTS_TAMPERED:" + tier)
        steps = manifest.get("completed_gradient_steps")
        if type(steps) is not int or not 16 <= steps <= 5000:
            raise ValueError("INVALID_FINANCE_OPTIMIZER_STEPS:" + tier)
        for k in ("train_loss", "eval_loss"):
            val = manifest.get(k)
            if not isinstance(val, (int, float)) or not math.isfinite(val) or val < 0:
                raise ValueError("UNMEASURED_FINANCE_LOSS:" + tier)
        if type(manifest.get("approved_rows")) is not int or manifest["approved_rows"] < 100:
            raise ValueError("INSUFFICIENT_APPROVED_ROWS:" + tier)
        if type(manifest.get("chronological_eval_rows")) is not int or manifest["chronological_eval_rows"] < 100:
            raise ValueError("INSUFFICIENT_HOLDOUT_ROWS:" + tier)
        report[tier] = {"base_model": TIERS[tier], "base_revision": manifest["base_revision"],
                        "steps": steps, "adapter_sha256": manifest["adapter_sha256"],
                        "eval_loss": manifest["eval_loss"], "release_state": "NEEDS_INDEPENDENT_BLIND_BENCHMARK"}

    return {
        "verified_candidate_tiers": sorted(report),
        "missing_tiers": sorted(set(TIERS) - set(report)),
        "all_five_artifacts_present": set(report) == set(TIERS),
        "sixty_b": "NO_VERIFIED_60B_TRAINER",
        "blind_test_sha256": hashes["test"],
        "independent_financial_benchmark_passed": False,
        "production_release_authorized": False,
        "proof_limit": "Local hashes and manifest can be forged. This is an integrity preflight, not independent GPU verification.",
        "artifacts": report,
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approved-dir", required=True)
    parser.add_argument("--adapter", action="append", default=[], help="e.g. 0.6b=artifacts/model06")
    args = parser.parse_args(argv)
    artifacts = {}
    for item in args.adapter:
        if "=" not in item:
            parser.error("--adapter requires tier=path")
        tier, path = item.split("=", 1)
        if not tier or not path or tier in artifacts:
            parser.error("Invalid/duplicate tier")
        artifacts[tier] = path
    print(json.dumps(validate(args.approved_dir, artifacts), ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
