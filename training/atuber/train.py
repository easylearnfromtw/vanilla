"""Train Atuber LoRA on an approved user-supplied JSONL dataset.

Usage:
  python training/atuber/train.py --dataset private/reviewed.jsonl --validate-only
  python training/atuber/train.py --dataset private/reviewed.jsonl --output artifacts/atuber-adapter-v0.1 --train

No raw conversation collection, secrets, API calls or cloud uploads.
GPU + optional ML packages are imported only for an explicit --train run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from dataset import BASE, validate_jsonl, to_conversations


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def train(dataset: str, output: str, *, max_steps: int, sequence_length: int) -> None:
    rows, data_sha = validate_jsonl(dataset)
    training, holdout = to_conversations(rows)
    # Explicit prompt/completion records avoid relying on a Qwen chat
    # template that may not expose generation-token masks for
    # assistant_only_loss. The SFT loss must apply to the answer, not
    # teach the model to imitate untrusted user instructions.
    def completion_record(row: dict) -> dict:
        messages = row["messages"]
        return {"prompt": messages[:-1], "completion": messages[-1:]}
    train_examples = [completion_record(row) for row in training]
    eval_examples = [completion_record(row) for row in holdout]
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, prepare_model_for_kbit_training
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from trl import SFTTrainer, SFTConfig
    except ImportError as exc:
        raise SystemExit("Missing GPU training dependencies; install training/atuber/requirements.txt") from exc
    if not torch.cuda.is_available():
        raise SystemExit("Atuber training requires a CUDA GPU. No CPU fallback or cloud upload.")
    if not 16 <= max_steps <= 5000 or not 128 <= sequence_length <= 2048:
        raise SystemExit("Training limits rejected")
    target = Path(output).resolve()
    if target.exists() and any(target.iterdir()):
        raise SystemExit("Target must be a new empty directory; no weight overwrites")
    target.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(BASE, trust_remote_code=False)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quant = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        BASE, quantization_config=quant, device_map="auto", trust_remote_code=False
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)
    cfg = SFTConfig(
        output_dir=str(target / "checkpoints"),
        max_length=sequence_length,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=1e-4,
        max_steps=max_steps,
        warmup_ratio=0.03,
        gradient_checkpointing=True,
        completion_only_loss=True,
        packing=False,
        report_to="none",
        save_strategy="no",
        logging_steps=10,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        seed=20261022,
    )
    peft_cfg = LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "up_proj", "down_proj", "gate_proj"],
        bias="none", task_type="CAUSAL_LM",
    )
    trainer = SFTTrainer(
        model=model, args=cfg, train_dataset=Dataset.from_list(train_examples),
        eval_dataset=Dataset.from_list(eval_examples), peft_config=peft_cfg,
        processing_class=tokenizer
    )
    outcome = trainer.train()
    metrics = trainer.evaluate()
    adapter = target / "adapter"
    adapter.mkdir(exist_ok=False)
    trainer.model.save_pretrained(str(adapter), safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    weights = adapter / "adapter_model.safetensors"
    if not weights.is_file() or weights.stat().st_size < 1000:
        raise SystemExit("Training did not create adapter weights")
    provenance = {
        "schema": 1,
        "product": "atuber",
        "training_state": "completed",
        "model_id": "atuber-0.1",
        "base_model": BASE,
        "license": "Apache-2.0",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_sha256": data_sha,
        "reviewed_rows": len(rows),
        "training_rows": len(training),
        "holdout_rows": len(holdout),
        "max_steps": max_steps,
        "sequence_length": sequence_length,
        "adapter_sha256": digest(weights),
        "train_loss": float(outcome.training_loss),
        "eval_loss": float(metrics.get("eval_loss", float("nan"))),
    }
    if not (provenance["train_loss"] < float("inf") and provenance["eval_loss"] < float("inf")):
        raise SystemExit("Non-finite train or evaluation metrics: checkpoint not releaseable")
    (target / "training-provenance.json").write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("ADAPTER_TRAINED", json.dumps({
        "adapter": str(adapter), "reviewed_rows": len(rows),
        "holdout_rows": len(holdout), "dataset_sha256": data_sha,
        "train_loss": provenance["train_loss"], "eval_loss": provenance["eval_loss"]
    }, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output", default="artifacts/atuber-adapter-v0.1")
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--validate-only", action="store_true")
    choice.add_argument("--train", action="store_true")
    parser.add_argument("--steps", type=int, default=180)
    parser.add_argument("--max-length", type=int, default=512)
    args = parser.parse_args()
    if args.validate_only:
        rows, data_sha = validate_jsonl(args.dataset)
        training, holdout = to_conversations(rows)
        print(json.dumps({
            "status": "reviewed-data-valid", "rows": len(rows),
            "train": len(training), "holdout": len(holdout),
            "sha256": data_sha, "trained": False,
        }, ensure_ascii=False))
        return 0
    train(args.dataset, args.output, max_steps=args.steps, sequence_length=args.max_length)
    return 0


if __name__ == "__main__":
    sys.exit(main())
