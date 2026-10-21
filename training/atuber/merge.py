"""Merge trained Atuber LoRA weights into a self-contained HF checkpoint.

A release needs a verifiable adapter + reviewed dataset provenance. The source
base model is downloaded during this explicit merge step, never at page load.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path

from dataset import BASE, MIN_TRAINING_ROWS

def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def inspect_provenance(root: Path) -> dict:
    manifest = root / "training-provenance.json"
    if not manifest.is_file():
        raise ValueError("ATUBER_TRAINING_PROVENANCE_REQUIRED")
    obj = json.loads(manifest.read_text(encoding="utf-8"))
    adapter = root / "adapter" / "adapter_model.safetensors"
    if (obj.get("training_state") != "completed" or obj.get("base_model") != BASE
            or obj.get("reviewed_rows", 0) < MIN_TRAINING_ROWS
            or obj.get("holdout_rows", 0) < 1 or not adapter.is_file()
            or adapter.stat().st_size < 1000
            or obj.get("adapter_sha256") != sha(adapter)
            or not math.isfinite(float(obj.get("eval_loss", float("nan"))))):
        raise ValueError("ATUBER_TRAINED_ADAPTER_VALIDATION_FAILED")
    return obj

def merge(adapter_root: str, output: str) -> None:
    source = Path(adapter_root).resolve()
    manifest = inspect_provenance(source)
    target = Path(output).resolve()
    if target.exists() and any(target.iterdir()):
        raise ValueError("ATUBER_REFUSES_OVERWRITE")
    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:
        raise SystemExit("Install training/atuber/requirements.txt first") from exc
    target.mkdir(parents=True, exist_ok=True)
    base = AutoModelForCausalLM.from_pretrained(
        BASE, torch_dtype=torch.float16, device_map="cpu", trust_remote_code=False
    )
    merged = PeftModel.from_pretrained(base, str(source / "adapter"), is_trainable=False).merge_and_unload()
    merged.save_pretrained(str(target), safe_serialization=True)
    tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=False)
    tok.save_pretrained(str(target))
    shards = sorted(target.glob("*.safetensors"))
    if not shards or sum(f.stat().st_size for f in shards) < 50_000_000:
        raise ValueError("ATUBER_STANDALONE_WEIGHTS_NOT_GENERATED")
    digest_map = {f.name: sha(f) for f in shards}
    for name in ("config.json", "tokenizer.json", "tokenizer_config.json"):
        f = target / name
        if f.is_file():
            digest_map[name] = sha(f)
    release = {
        "schema": 1, "product": "Atuber", "model_id": "atuber-0.1",
        "release_state": "trained-merged-hf",
        "base_model": BASE, "base_license": "Apache-2.0",
        "dataset_sha256": manifest["dataset_sha256"],
        "adapter_sha256": manifest["adapter_sha256"],
        "holdout_rows": manifest["holdout_rows"],
        "evaluation_loss": manifest["eval_loss"],
        "weights": digest_map,
        "independent_inference": True,
        "meaning": "Self-contained, merged fine-tuned Qwen3 0.6B derivative; not trained from scratch."
    }
    (target / "atuber-release.json").write_text(
        json.dumps(release, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("TRAINED_STANDALONE_CHECKPOINT_CREATED", target)
    print("To produce GGUF: use llama.cpp convert_hf_to_gguf.py and quantize, then package.py")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--adapter-root", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--verify-only", action="store_true")
    args = p.parse_args()
    if args.verify_only:
        print(json.dumps(inspect_provenance(Path(args.adapter_root)), ensure_ascii=False, indent=2))
    else:
        merge(args.adapter_root, args.output)
