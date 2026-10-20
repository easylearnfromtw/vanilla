#!/usr/bin/env python3
"""NOODLES external GPU trainer: train *user-controlled* open-weight model LoRA.

Inputs are opt-in human-reviewed SFT/DPO JSONL exported from Vanilla.
The browser never trains model weights. No uploads, no background cloud jobs.
Usage:
  python training/noodles_train.py --mode sft --train noodles-sft-train.jsonl \
      --eval noodles-sft-eval.jsonl --check-only
  python training/noodles_train.py --mode sft --train noodles-sft-train.jsonl \
      --eval noodles-sft-eval.jsonl --model Qwen/Qwen2.5-0.5B-Instruct \
      --output ./adapters/noodles-sft --run-training
Install: pip install -r training/requirements-noodles.txt
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
import os
import re
import sys
from pathlib import Path

FORBIDDEN = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|GOCSPX-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|"
    r"gh[pousr]_[A-Za-z0-9_]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"
    r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})", re.I
)


def read_samples(path: Path, mode: str) -> list[dict]:
    if not path.is_file():
        raise ValueError(f"Missing dataset: {path}")
    if path.stat().st_size > 8_000_000:
        raise ValueError("Dataset exceeds 8 MB; curate and split before training")
    samples: list[dict] = []
    seen: set[str] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSONL line {line_no}") from exc
        required = ["prompt", "completion"] if mode == "sft" else ["prompt", "chosen", "rejected"]
        if not isinstance(row, dict) or set(row) != set(required):
            raise ValueError(f"Invalid {mode} schema on line {line_no}")
        for field in required:
            messages = row[field]
            role = "user" if field == "prompt" else "assistant"
            if (not isinstance(messages, list) or len(messages) != 1 or
                    not isinstance(messages[0], dict) or set(messages[0]) != {"role", "content"} or
                    messages[0]["role"] != role):
                raise ValueError(f"Invalid role/schema on {line_no}:{field}")
            text = messages[0]["content"]
            if not isinstance(text, str) or len(text.strip()) < 8 or len(text) > 5000:
                raise ValueError(f"Invalid content length on {line_no}:{field}")
            if FORBIDDEN.search(text):
                raise ValueError(f"Potential private content detected on {line_no}:{field}")
        prompt = row["prompt"][0]["content"].strip().lower()
        if prompt in seen:
            raise ValueError(f"Duplicate prompt in {path} on line {line_no}")
        seen.add(prompt)
        if mode == "dpo" and row["chosen"][0]["content"] == row["rejected"][0]["content"]:
            raise ValueError(f"Chosen/rejected identical on line {line_no}")
        samples.append(row)
    return samples


def main() -> int:
    parser = argparse.ArgumentParser(description="Human-approved, local-only NOODLES adapter trainer")
    parser.add_argument("--mode", choices=("sft", "dpo"), required=True)
    parser.add_argument("--train", required=True, type=Path)
    parser.add_argument("--eval", required=True, type=Path)
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--output", default="./adapters/noodles")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--max-length", type=int, choices=(256, 512, 1024), default=512,
                        help="Shorter sequences reduce GPU peak memory for 6 GB laptops")
    parser.add_argument("--qlora-4bit", action="store_true",
                        help="Explicitly request CUDA-only NF4 QLoRA; SFT only")
    parser.add_argument("--allow-model-download", action="store_true",
                        help="Allow Hugging Face model download on this GPU host; off by default")
    parser.add_argument("--ack-model-license", action="store_true",
                        help="Confirm authorization to download/use/fine-tune the base model")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true", help="Validate without GPU and without training")
    group.add_argument("--run-training", action="store_true", help="Explicitly train an adapter on GPU/MPS")
    args = parser.parse_args()
    if args.epochs < 1 or args.epochs > 3:
        parser.error("--epochs must be 1..3; incremental replay needs independent validation")
    if args.qlora_4bit and args.mode != "sft":
        raise ValueError("4-bit QLoRA currently supports SFT only; use separate validated DPO training")
    train = read_samples(args.train, args.mode)
    evaluation = read_samples(args.eval, args.mode)
    overlap = {x["prompt"][0]["content"].strip().lower() for x in train} & {
        x["prompt"][0]["content"].strip().lower() for x in evaluation}
    if overlap:
        raise ValueError("Data leakage: train and evaluation contain the same prompts")
    print(f"Validated {args.mode.upper()}: train={len(train)}, eval={len(evaluation)}; no prompt overlap.")
    if args.check_only:
        return 0
    if len(train) < 10 or len(evaluation) < 3:
        raise ValueError("Real training requires ≥10 training and ≥3 evaluation cases, not a tiny anecdotal sample")
    if not args.ack_model_license:
        raise ValueError("Explicit --ack-model-license required for actual GPU training")
    if not args.allow_model_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    if "/" in args.output and Path(args.output).resolve() == Path.cwd().resolve():
        raise ValueError("Output must not overwrite the repository directory")
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig
        from trl import DPOConfig, DPOTrainer, SFTConfig, SFTTrainer
    except ImportError as exc:
        raise RuntimeError("Install requirements-noodles.txt in a dedicated GPU environment") from exc
    if not (torch.cuda.is_available() or getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()):
        raise RuntimeError("CUDA or Apple Silicon MPS GPU not available; browser/iPhone cannot train this adapter")
    if args.qlora_4bit and not torch.cuda.is_available():
        raise RuntimeError("4-bit QLoRA requires a CUDA GPU with a compatible bitsandbytes install")
    config = dict(
        output_dir=args.output, num_train_epochs=args.epochs,
        per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=2e-4 if args.mode == "sft" else 5e-6,
        logging_steps=5, eval_strategy="epoch", save_strategy="epoch",
        save_total_limit=2, push_to_hub=False, report_to="none",
        max_grad_norm=1.0,
        gradient_checkpointing=args.qlora_4bit,
        fp16=bool(torch.cuda.is_available()),
        bf16=False
    )
    peft_config = LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05,
        bias="none", task_type="CAUSAL_LM",
        **({"target_modules": "all-linear"} if args.qlora_4bit else {})
    )
    training_dataset = Dataset.from_list(train)
    evaluation_dataset = Dataset.from_list(evaluation)
    if args.mode == "sft":
        student_model = args.model
        if args.qlora_4bit:
            try:
                from peft import prepare_model_for_kbit_training
                from transformers import AutoModelForCausalLM, BitsAndBytesConfig
                import bitsandbytes  # noqa: F401  -- explicit opt-in CUDA requirement
            except ImportError as exc:
                raise RuntimeError("Install bitsandbytes and CUDA-compatible QLoRA dependencies") from exc
            nf4 = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                    bnb_4bit_compute_dtype=torch.float16,
                                    bnb_4bit_use_double_quant=True)
            student_model = AutoModelForCausalLM.from_pretrained(
                args.model, quantization_config=nf4,
                device_map={"": torch.cuda.current_device()},
                local_files_only=not args.allow_model_download,
                trust_remote_code=False)
            student_model = prepare_model_for_kbit_training(student_model)
        trainer = SFTTrainer(model=student_model, args=SFTConfig(**config, max_length=args.max_length),
                             train_dataset=training_dataset, eval_dataset=evaluation_dataset,
                             peft_config=peft_config)
    else:
        trainer = DPOTrainer(model=args.model, args=DPOConfig(**config, max_length=args.max_length),
                             train_dataset=training_dataset, eval_dataset=evaluation_dataset,
                             peft_config=peft_config)
    result = trainer.train()
    print("Training completed. Review held-out metrics; DO NOT automatically ship weights.")
    trainer.evaluate()
    trainer.save_model(args.output)
    Path(args.output).mkdir(parents=True, exist_ok=True)
    (Path(args.output) / "noodles-training-manifest.json").write_text(
        json.dumps({"mode": args.mode, "base_model": args.model,
                    "train_examples": len(train), "eval_examples": len(evaluation),
                    "max_length": args.max_length, "qlora_4bit": args.qlora_4bit,
                    "sha256_train": sha256(args.train.read_bytes()).hexdigest(),
                    "sha256_eval": sha256(args.eval.read_bytes()).hexdigest(),
                    "training_loss": float(result.training_loss),
                    "human_approval_required": True,
                    "deployment_status": "not_deployed"}, indent=2), encoding="utf-8")
    print(f"LoRA adapter saved locally at {args.output}; explicit testing and deployment required.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError) as exc:
        print(f"NOODLES ERROR: {exc}", file=sys.stderr)
        sys.exit(2)
