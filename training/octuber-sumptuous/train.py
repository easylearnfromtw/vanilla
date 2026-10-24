#!/usr/bin/env python3
"""OCTUBER SUMPTUOUS 30B: explicit, GPU-only *real weight* QLoRA SFT.

Default --validate-only uses the Python standard library; NEVER trains, downloads
models, uploads datasets or claims model readiness. --train must be deliberate.
A completed adapter is a derivative model, not a from-scratch pretrain.
Requires a real CUDA machine with sufficient VRAM and reviewed training data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "atuber"))
from dataset import validate_jsonl, to_conversations  # noqa: E402

BASE = "Qwen/Qwen3-30B-A3B-Instruct-2507"
MODEL_ID = "octuber-sumptuous-30b-v0.1"
LICENSE = "Apache-2.0"
MIN_REVIEWED = 100
# Only attention projections: MoE expert module names are version dependent.
# This is a genuine LoRA weight update without guessing a dangerous expert graph.
TARGET_MODULES = ("q_proj", "k_proj", "v_proj", "o_proj")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for buf in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(buf)
    return digest.hexdigest()


def validate_plan(dataset: str | Path) -> dict:
    rows, digest = validate_jsonl(dataset, min_rows=MIN_REVIEWED)
    train, holdout = to_conversations(rows)
    if len(holdout) < 5:
        raise ValueError("OCTUBER_30B_NEEDS_5_HOLDOUT_EXAMPLES")
    # Guard against copying reviewed answers between train/eval partitions.
    train_pairs = {(x["messages"][-2]["content"], x["messages"][-1]["content"]) for x in train}
    eval_pairs = {(x["messages"][-2]["content"], x["messages"][-1]["content"]) for x in holdout}
    if train_pairs.intersection(eval_pairs):
        raise ValueError("OCTUBER_30B_HOLDOUT_DUPLICATE_PROMPT_AND_ANSWER")
    return {
        "model_id": MODEL_ID,
        "base_model": BASE,
        "base_license": LICENSE,
        "dataset_sha256": digest,
        "reviewed_rows": len(rows),
        "training_rows": len(train),
        "holdout_rows": len(holdout),
        "data_validated": True,
        "trained": False,
    }


def _train(dataset: Path, output: Path, *, base_revision: str,
           steps: int, max_length: int, allow_download: bool, low_vram_ack: bool) -> None:
    if not re.fullmatch(r"[a-fA-F0-9]{40}", base_revision):
        raise ValueError("BASE_REVISION_MUST_BE_IMMUTABLE_40_CHAR_COMMIT")
    if not (16 <= steps <= 3000) or not (256 <= max_length <= 2048):
        raise ValueError("OUT_OF_POLICY_TRAINING_STEPS_OR_CONTEXT")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("NO_OVERWRITE_OF_MODEL_WEIGHTS")
    summary = validate_plan(dataset)
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, prepare_model_for_kbit_training
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from trl import SFTConfig, SFTTrainer
    except ImportError as err:
        raise RuntimeError("Install requirements on an approved CUDA training host") from err
    if not torch.cuda.is_available():
        raise RuntimeError("OCTUBER_30B_REQUIRES_REAL_CUDA_GPU")
    vram_gib = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    if vram_gib < 40 and not low_vram_ack:
        raise RuntimeError(
            f"Only {vram_gib:.1f} GiB VRAM detected; 30B training may OOM. "
            "Use >=40 GiB VRAM or explicitly --ack-low-vram-risk for an experimental run."
        )
    rows, _ = validate_jsonl(dataset, min_rows=MIN_REVIEWED)
    conversations, holdout = to_conversations(rows)
    # Prompt-completion format enforces *completion-only* loss, i.e. don't train
    # OCTUBER to parrot user/system instructions as outputs.
    def to_example(item: dict) -> dict:
        msgs = item["messages"]
        return {"prompt": msgs[:-1], "completion": msgs[-1:]}
    train_data = Dataset.from_list([to_example(item) for item in conversations])
    eval_data = Dataset.from_list([to_example(item) for item in holdout])
    tokenizer = AutoTokenizer.from_pretrained(
        BASE, revision=base_revision, local_files_only=not allow_download, trust_remote_code=False
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quant = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        BASE, revision=base_revision, quantization_config=quant,
        device_map={"": torch.cuda.current_device()},
        local_files_only=not allow_download, trust_remote_code=False,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    cfg = SFTConfig(
        output_dir=str(output / "checkpoints"), max_length=max_length,
        per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=16, learning_rate=5e-5,
        max_steps=steps, warmup_ratio=0.03, gradient_checkpointing=True,
        completion_only_loss=True, packing=False,
        logging_steps=10, save_strategy="no", report_to="none",
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(), seed=20261025,
        push_to_hub=False,
    )
    peft_config = LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05,
        target_modules=list(TARGET_MODULES), bias="none", task_type="CAUSAL_LM",
    )
    trainer = SFTTrainer(
        model=model, args=cfg, train_dataset=train_data, eval_dataset=eval_data,
        peft_config=peft_config, processing_class=tokenizer,
    )
    outcome = trainer.train()
    measured = trainer.evaluate()
    train_loss = float(outcome.training_loss)
    eval_loss = float(measured.get("eval_loss", float("nan")))
    if not (math.isfinite(train_loss) and math.isfinite(eval_loss)):
        raise RuntimeError("TRAINING_METRICS_NOT_FINITE")
    adapter = output / "adapter"
    adapter.mkdir(parents=True, exist_ok=False)
    trainer.model.save_pretrained(str(adapter), safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    weights = adapter / "adapter_model.safetensors"
    config = adapter / "adapter_config.json"
    if not weights.is_file() or weights.stat().st_size < 100_000 or not config.is_file():
        raise RuntimeError("TRAINING_DID_NOT_PRODUCE_REAL_LORA_WEIGHTS")
    provenance = {
        **summary,
        "training_state": "adapter-trained-not-merged",
        "trained": True,
        "base_revision": base_revision.lower(),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "architecture": "Qwen3 MoE 30B total / 3B active",
        "method": "NF4 QLoRA SFT attention-only",
        "target_modules": list(TARGET_MODULES),
        "steps": steps,
        "max_length": max_length,
        "vram_gib": round(vram_gib, 2),
        "train_loss": train_loss,
        "eval_loss": eval_loss,
        "adapter_sha256": sha256(weights),
        "adapter_config_sha256": sha256(config),
        "release_state": "not-released",
        "gguf": None,
        "independent_inference_verified": False,
    }
    (output / "training-provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("OCTUBER_30B_ADAPTER_TRAINED_NOT_RELEASED", json.dumps({
        "adapter": str(adapter), "train_loss": train_loss, "eval_loss": eval_loss,
        "reviewed_rows": summary["reviewed_rows"], "holdout_rows": summary["holdout_rows"],
    }, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="OCTUBER 30B real QLoRA training; default is validation only")
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("artifacts/octuber-sumptuous-30b-adapter"))
    parser.add_argument("--base-revision", default="", help="Immutable upstream Hugging Face 40-hex commit SHA")
    parser.add_argument("--steps", type=int, default=180)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--allow-model-download", action="store_true")
    parser.add_argument("--ack-license-and-data-rights", action="store_true")
    parser.add_argument("--ack-low-vram-risk", action="store_true")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--validate-only", action="store_true")
    mode.add_argument("--train", action="store_true")
    args = parser.parse_args()
    report = validate_plan(args.dataset)
    if args.validate_only:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    if not args.ack_license_and_data_rights:
        parser.error("Training requires --ack-license-and-data-rights")
    _train(args.dataset, args.output, base_revision=args.base_revision, steps=args.steps,
           max_length=args.max_length, allow_download=args.allow_model_download,
           low_vram_ack=args.ack_low_vram_risk)
    return 0


if __name__ == "__main__":
    sys.exit(main())
