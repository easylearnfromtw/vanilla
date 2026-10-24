#!/usr/bin/env python3
"""Merge an actual trained OCTUBER SUMPTUOUS 30B LoRA into standalone HF weights.

This is intentionally explicit, RAM/disk heavy, and never run in GitHub Actions.
Verification is Python-stdlib only and cannot be fooled by a Modelfile alias.
"""
from __future__ import annotations
import argparse
import json
import math
import re
import sys
from pathlib import Path
from train import BASE, MODEL_ID, LICENSE, sha256


def verify_adapter(root: Path) -> dict:
    record = root / "training-provenance.json"
    if not record.is_file():
        raise ValueError("OCTUBER_30B_TRAINED_PROVENANCE_REQUIRED")
    data = json.loads(record.read_text(encoding="utf-8"))
    files = [("adapter_model.safetensors", "adapter_sha256", 100_000),
             ("adapter_config.json", "adapter_config_sha256", 20)]
    if (data.get("model_id") != MODEL_ID or data.get("base_model") != BASE
        or data.get("base_license") != LICENSE
        or data.get("training_state") != "adapter-trained-not-merged"
        or data.get("trained") is not True or data.get("release_state") != "not-released"
        or data.get("independent_inference_verified") is not False
        or not re.fullmatch(r"[a-f0-9]{40}", str(data.get("base_revision", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(data.get("dataset_sha256", "")))
        or int(data.get("reviewed_rows", 0)) < 100
        or int(data.get("holdout_rows", 0)) < 5
        or not math.isfinite(float(data.get("eval_loss", float("nan"))))):
        raise ValueError("OCTUBER_30B_INVALID_TRAINED_LINEAGE")
    for filename, key, minimum in files:
        item = root / "adapter" / filename
        if not item.is_file() or item.stat().st_size < minimum or sha256(item) != data.get(key):
            raise ValueError("OCTUBER_30B_ADAPTER_HASH_OR_SIZE_MISMATCH")
    return data


def merge(adapter_dir: Path, output: Path, *, allow_download: bool, ack: bool) -> None:
    if not ack:
        raise ValueError("EXPLICIT_MERGE_APPROVAL_REQUIRED")
    source = adapter_dir.resolve()
    data = verify_adapter(source)
    target = output.resolve()
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise ValueError("REFUSE_OVERWRITE_MERGED_WEIGHTS")
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel
    except ImportError as exc:
        raise RuntimeError("Install training dependencies on a machine with ample CPU RAM") from exc
    # 30B fp16 is ~60GB even before temporary copies, checkpoint sharding and OS.
    # CPU merge is preferable to GPU QLoRA base loading (which cannot be merged safely
    # into quantized source weights without dequantization).
    model = AutoModelForCausalLM.from_pretrained(
        BASE, revision=data["base_revision"], torch_dtype=torch.float16,
        device_map="cpu", low_cpu_mem_usage=True,
        local_files_only=not allow_download, trust_remote_code=False,
    )
    merged = PeftModel.from_pretrained(model, str(source / "adapter"), is_trainable=False).merge_and_unload()
    target.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(target), safe_serialization=True, max_shard_size="5GB")
    tok = AutoTokenizer.from_pretrained(
        BASE, revision=data["base_revision"], local_files_only=not allow_download, trust_remote_code=False
    )
    tok.save_pretrained(str(target))
    shards = sorted(target.glob("*.safetensors"))
    if not shards or sum(x.stat().st_size for x in shards) < 30_000_000_000:
        raise ValueError("NO_VALID_30B_STANDALONE_MERGED_WEIGHTS")
    artifact_hashes = {x.name: sha256(x) for x in shards}
    for name in ("config.json", "tokenizer.json", "tokenizer_config.json"):
        file = target / name
        if file.is_file():
            artifact_hashes[name] = sha256(file)
    result = {
        "schema": 1, "model_id": MODEL_ID, "base_model": BASE,
        "base_revision": data["base_revision"], "base_license": LICENSE,
        "release_state": "merged-not-evaluated", "training_provenance_sha256": sha256(source / "training-provenance.json"),
        "dataset_sha256": data["dataset_sha256"], "adapter_sha256": data["adapter_sha256"],
        "holdout_rows": data["holdout_rows"], "eval_loss": data["eval_loss"],
        "weights": artifact_hashes, "standalone_weights_bytes": sum(x.stat().st_size for x in shards),
        "independent_inference_verified": False,
    }
    (target / "octuber-merged-provenance.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("OCTUBER_30B_MERGED_NOT_EVALUATED", target)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--adapter-root", type=Path, required=True)
    p.add_argument("--output", type=Path, default=Path("artifacts/octuber-sumptuous-30b-merged"))
    p.add_argument("--verify-only", action="store_true")
    p.add_argument("--merge", action="store_true")
    p.add_argument("--ack-merge", action="store_true")
    p.add_argument("--allow-model-download", action="store_true")
    args = p.parse_args()
    if args.verify_only == args.merge:
        p.error("Choose exactly --verify-only or --merge")
    if args.verify_only:
        data = verify_adapter(args.adapter_root)
        print(json.dumps({"adapter_verified": True, "trained": True, "merged": False,
                          "base_revision": data["base_revision"]}, indent=2))
        return 0
    merge(args.adapter_root, args.output,
          allow_download=args.allow_model_download, ack=args.ack_merge)
    return 0


if __name__ == "__main__":
    sys.exit(main())
