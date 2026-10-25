#!/usr/bin/env python3
"""Five OCTUBER financial QLoRA tiers; 60B explicitly gated, NEVER simulated.

Default dry-run: no downloads, model updates or GPU charges. --train requires a
real CUDA host, fixed Hugging Face base revision and approved chronological SFT.
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
from dataset import validate_jsonl, SYSTEM  # noqa: E402

MODELS = {
    "0.6b": {"id": "OCTUBER PHONE", "base": "Qwen/Qwen3-0.6B", "min_vram": 6, "r": 8},
    "4b": {"id": "OCTUBER FLATTERING", "base": "Qwen/Qwen3-4B", "min_vram": 12, "r": 16},
    "14b": {"id": "OCTUBER MODEST", "base": "Qwen/Qwen3-14B", "min_vram": 24, "r": 16},
    "30b": {"id": "OCTUBER SUMPTUOUS", "base": "Qwen/Qwen3-30B-A3B-Instruct-2507", "min_vram": 48, "r": 8},
    "32b": {"id": "OCTUBER SUMPTUOUS 32B", "base": "Qwen/Qwen3-32B", "min_vram": 48, "r": 8},
    "60b": {"id": "OCTUBER 60B", "base": "MultiverseComputingCAI/HyperNova-60B",
            "min_vram": 96, "r": None, "blocked": "MXFP4/gpt-oss MoE QLoRA compatibility not established"},
}

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()

def cuda_status():
    try:
        import torch
        if not torch.cuda.is_available():
            return {"available": False, "reason": "NO_CUDA_GPU"}
        return {"available": True, "device": torch.cuda.get_device_name(0),
                "vram_gib": round(torch.cuda.get_device_properties(0).total_memory / 1024 ** 3, 2)}
    except ImportError:
        return {"available": False, "reason": "TORCH_NOT_INSTALLED"}

def validated_files(train_path, eval_path, evidence_path):
    training, train_hash = validate_jsonl(train_path, min_rows=100)
    holdout, eval_hash = validate_jsonl(eval_path, min_rows=100)
    names = {x["id"] for x in training}
    if names & {x["id"] for x in holdout}:
        raise ValueError("TRAIN_EVAL_ID_OVERLAP")
    tr_prompts = {hashlib.sha256(x["user"].strip().casefold().encode()).hexdigest() for x in training}
    ev_prompts = {hashlib.sha256(x["user"].strip().casefold().encode()).hexdigest() for x in holdout}
    if tr_prompts & ev_prompts:
        raise ValueError("TRAIN_EVAL_PROMPT_OVERLAP")
    src = Path(evidence_path)
    if not src.is_file():
        raise ValueError("APPROVED_FINANCE_PROVENANCE_REQUIRED")
    entries = [json.loads(x) for x in src.read_text(encoding="utf-8").splitlines() if x.strip()]
    if len(entries) != 1:
        raise ValueError("APPROVED_FINANCE_PROVENANCE_SCHEMA")
    p = entries[0]
    if (p.get("state") != "REVIEWED_SFT_NOT_TRAINED"
        or p.get("date_boundaries") != ["2021-12-31", "2024-12-31"]
        or p.get("train_sha256") != train_hash
        or p.get("eval_sha256") != eval_hash
        or p.get("train") != len(training) or p.get("eval") != len(holdout)):
        raise ValueError("UNAPPROVED_OR_CHANGED_FINANCE_SFT")
    return training, holdout, {"train_sha256": train_hash, "eval_sha256": eval_hash,
                               "provenance_sha256": sha(src)}

def train(args):
    model_info = MODELS[args.tier]
    if model_info.get("blocked"):
        raise ValueError("60B_TRAINING_BLOCKED_UNVERIFIED_MXFP4_MOE")
    if not (args.approve_gpu_compute and args.ack_model_license and args.ack_data_rights):
        raise ValueError("EXPLICIT_GPU_LICENSE_DATA_APPROVALS_REQUIRED")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", args.base_revision):
        raise ValueError("REQUIRE_IMMUTABLE_40_HEX_BASE_REVISION")
    if not (16 <= args.steps <= 5000) or not (128 <= args.max_length <= 2048):
        raise ValueError("UNSAFE_TRAINING_RANGE")
    if not args.train_data or not args.eval_data or not args.provenance or not args.output:
        raise ValueError("MISSING_REVIEWED_FINANCE_INPUTS")
    target = Path(args.output).resolve()
    if target.exists():
        raise ValueError("REFUSE_TO_OVERWRITE_EXISTING_OUTPUT")
    if target == Path.home().resolve() or target == Path.cwd().resolve():
        raise ValueError("UNSAFE_OUTPUT")
    training, evaluation, attest = validated_files(args.train_data, args.eval_data, args.provenance)
    host = cuda_status()
    if not host["available"]:
        raise RuntimeError("REAL_CUDA_GPU_REQUIRED_NO_WEIGHT_UPDATE")
    if host["vram_gib"] < model_info["min_vram"]:
        raise RuntimeError("BELOW_GPU_PREFLIGHT_VRAM_THIS_IS_NOT_A_FIT_GUARANTEE")
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, prepare_model_for_kbit_training
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from trl import SFTTrainer, SFTConfig
    except ImportError as error:
        raise RuntimeError("INSTALL_CUDA_TRANSFORMERS_PEFT_TRL_DEPENDENCIES") from error

    base = model_info["base"]
    revision = args.base_revision.lower()
    tokenizer = AutoTokenizer.from_pretrained(
        base, revision=revision, local_files_only=not args.allow_model_download,
        trust_remote_code=False)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    bf16 = bool(torch.cuda.is_bf16_supported())
    quant = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if bf16 else torch.float16)
    model = AutoModelForCausalLM.from_pretrained(
        base, revision=revision, quantization_config=quant,
        device_map={"": torch.cuda.current_device()}, trust_remote_code=False,
        local_files_only=not args.allow_model_download)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    def pairs(rows):
        return Dataset.from_list([{
            "prompt": [{"role": "system", "content": SYSTEM},
                       {"role": "user", "content": row["user"]}],
            "completion": [{"role": "assistant", "content": row["assistant"]}],
        } for row in rows])
    config = SFTConfig(
        output_dir=str(target / "checkpoints"), max_length=args.max_length,
        per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=8, learning_rate=5e-5,
        max_steps=args.steps, warmup_ratio=0.03,
        gradient_checkpointing=True, completion_only_loss=True, packing=False,
        save_strategy="steps", save_steps=min(200, args.steps),
        save_total_limit=2, eval_strategy="steps",
        eval_steps=min(200, args.steps), logging_steps=10,
        bf16=bf16, fp16=not bf16, report_to="none", seed=20261025)
    lora = LoraConfig(r=model_info["r"], lora_alpha=2*model_info["r"],
                      lora_dropout=0.05, target_modules=["q_proj","k_proj","v_proj","o_proj"],
                      bias="none", task_type="CAUSAL_LM")
    trainer = SFTTrainer(model=model, args=config,
                         train_dataset=pairs(training), eval_dataset=pairs(evaluation),
                         peft_config=lora, processing_class=tokenizer)
    result = trainer.train()
    final = trainer.evaluate()
    if int(trainer.state.global_step) != args.steps:
        raise RuntimeError("TRAINING_INCOMPLETE")
    train_loss = float(result.training_loss)
    eval_loss = float(final.get("eval_loss", math.nan))
    if not math.isfinite(train_loss) or not math.isfinite(eval_loss):
        raise RuntimeError("NON_FINITE_FINANCE_LOSS")
    adapter = target / "adapter"
    if adapter.exists():
        raise RuntimeError("REFUSE_ADAPTER_OVERWRITE")
    trainer.model.save_pretrained(str(adapter), safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    weights = adapter / "adapter_model.safetensors"
    if not weights.is_file() or weights.stat().st_size < 1000:
        raise RuntimeError("NO_REAL_ADAPTER_WEIGHTS")
    receipt = {
        "status": "ADAPTER_TRAINED_NOT_RELEASED", "tier": args.tier,
        "model": model_info["id"], "base_model": base, "base_revision": revision,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "approved_rows": len(training), "chronological_eval_rows": len(evaluation),
        "completed_gradient_steps": int(trainer.state.global_step),
        "method": "NF4 QLoRA attention-only SFT", "train_loss": train_loss,
        "eval_loss": eval_loss, "adapter_sha256": sha(weights),
        "data_provenance": attest, "gpu": host,
        "independent_backtest_passed": False, "released": False,
    }
    (target / "training-provenance.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tier", choices=[*MODELS, "all"], default="all")
    p.add_argument("--train-data")
    p.add_argument("--eval-data")
    p.add_argument("--provenance")
    p.add_argument("--output")
    p.add_argument("--base-revision", default="")
    p.add_argument("--steps", type=int, default=180)
    p.add_argument("--max-length", type=int, default=512)
    p.add_argument("--train", action="store_true")
    p.add_argument("--approve-gpu-compute", action="store_true")
    p.add_argument("--ack-model-license", action="store_true")
    p.add_argument("--ack-data-rights", action="store_true")
    p.add_argument("--allow-model-download", action="store_true")
    a = p.parse_args(argv)
    if not a.train:
        tiers = MODELS if a.tier == "all" else {a.tier: MODELS[a.tier]}
        print(json.dumps({"mode": "PLAN_ONLY", "models": tiers,
                          "cuda": cuda_status(), "training_executed": False,
                          "note": "Each model needs its own distinct GPU adapter and pinned revision. 60B is blocked."},
                         ensure_ascii=False, indent=2))
        return
    if a.tier == "all":
        p.error("Run and validate each model tier independently; --tier all cannot mass-charge GPU.")
    train(a)

if __name__ == "__main__":
    main()
