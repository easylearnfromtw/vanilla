#!/usr/bin/env python3
"""Explicit local inference for the original student and its NOODLES LoRA adapter.

Outputs side-by-side answers to a local, UNREVIEWED benchmark rubric. No
automatic grading, no publishing, and no model hub traffic unless opted in.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import sys

from noodles_benchmark import template_rows
from noodles_distill import preflight_outputs, write_exclusive, text_ok
from noodles_train import read_samples


def verify_adapter(adapter: Path, evaluation: Path, model_name: str) -> dict:
    if not adapter.is_dir() or not (adapter / "adapter_config.json").is_file():
        raise ValueError("Adapter directory must contain an existing PEFT adapter_config.json")
    record = adapter / "noodles-training-manifest.json"
    if not record.is_file():
        raise ValueError("Adapter has no local NOODLES training manifest")
    info = json.loads(record.read_text(encoding="utf-8"))
    if info.get("mode") != "sft" or info.get("base_model") != model_name:
        raise ValueError("The adapter was not trained with this SFT base model")
    if info.get("deployment_status") != "not_deployed":
        raise ValueError("Unexpected adapter deployment status; review provenance")
    expected_hash = info.get("sha256_eval")
    if expected_hash and expected_hash != sha256(evaluation.read_bytes()).hexdigest():
        raise ValueError("Held-out evaluation differs from the dataset used at training")
    if not expected_hash:
        raise ValueError("This adapter lacks evaluation provenance; retrain with the audited trainer")
    return info


def run_inference(args: argparse.Namespace) -> int:
    if not args.run_inference:
        raise ValueError("Inference requires explicit --run-inference")
    if args.allow_model_download and not args.ack_model_license:
        raise ValueError("Model downloads require --ack-model-license")
    verify_adapter(args.adapter, args.eval, args.model)
    held_out = read_samples(args.eval, "sft")
    if len(held_out) > 80:
        raise ValueError("Inference capped at 80 held-out questions per run")
    preflight_outputs([args.output], [args.eval])
    if not args.allow_model_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    try:
        import torch
        from peft import PeftModel
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
    except ImportError as exc:
        raise RuntimeError("Install training/requirements-noodles.txt in a local inference environment") from exc
    cuda = torch.cuda.is_available()
    mps = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    if args.four_bit and not cuda:
        raise ValueError("NF4 inference requires CUDA and bitsandbytes")
    device = "cuda" if cuda else "mps" if mps else "cpu"
    dtype = torch.float16 if cuda else torch.float32
    load_kwargs = {"local_files_only": not args.allow_model_download,
                   "trust_remote_code": False}
    if args.four_bit:
        load_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True)
        load_kwargs["device_map"] = {"": torch.cuda.current_device()}
    else:
        load_kwargs["torch_dtype"] = dtype
    tokenizer = AutoTokenizer.from_pretrained(args.model, **{
        "local_files_only": not args.allow_model_download, "trust_remote_code": False
    })
    model = AutoModelForCausalLM.from_pretrained(args.model, **load_kwargs)
    if not args.four_bit:
        model.to(device)
    model.eval()

    def generate(current, prompt: str) -> str:
        messages = [{"role": "user", "content": prompt}]
        if tokenizer.chat_template:
            token_ids = tokenizer.apply_chat_template(
                messages, add_generation_prompt=True, tokenize=True,
                return_tensors="pt")
        else:
            token_ids = tokenizer("User: " + prompt + "\nAssistant:",
                                  return_tensors="pt").input_ids
        if token_ids.shape[1] > args.max_input_tokens:
            # Do not report a misleading comparison based on silently truncated prompts.
            raise ValueError("Held-out prompt exceeds token budget; curate shorter cases")
        token_ids = token_ids.to("cuda" if args.four_bit else device)
        with torch.inference_mode():
            prediction = current.generate(input_ids=token_ids, do_sample=False,
                                          max_new_tokens=args.max_new_tokens,
                                          pad_token_id=tokenizer.eos_token_id)
        answer = tokenizer.decode(prediction[0, token_ids.shape[1]:],
                                  skip_special_tokens=True).strip()
        if not text_ok(answer, 1, 5000):
            raise ValueError("Empty or unsafe model output; do not use for scoring")
        return answer

    result = template_rows(held_out)
    for index, item in enumerate(result, 1):
        item["baseline_answer"] = generate(model, item["prompt"])
        print(f"Original student {index}/{len(result)} (no prompt text logged)")
    student = PeftModel.from_pretrained(
        model, str(args.adapter), is_trainable=False, local_files_only=True)
    student.eval()
    for index, item in enumerate(result, 1):
        item["tuned_answer"] = generate(student, item["prompt"])
        print(f"LoRA student {index}/{len(result)} (no prompt text logged)")
    write_exclusive(args.output, "".join(json.dumps(item, ensure_ascii=False) + "\n"
                                         for item in result))
    print("Unreviewed A/B outputs saved locally; fill human rubric and run noodles_benchmark.py report.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare original vs LoRA student locally")
    parser.add_argument("--eval", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-input-tokens", type=int, default=1024, choices=(512, 1024, 2048))
    parser.add_argument("--max-new-tokens", type=int, default=256, choices=(128, 256, 512))
    parser.add_argument("--four-bit", action="store_true")
    parser.add_argument("--allow-model-download", action="store_true")
    parser.add_argument("--ack-model-license", action="store_true")
    parser.add_argument("--run-inference", action="store_true")
    return run_inference(parser.parse_args(argv))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, KeyError, TypeError) as exc:
        print(f"NOODLES STUDENT: {exc}", file=sys.stderr)
        sys.exit(2)
