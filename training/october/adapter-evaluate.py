#!/usr/bin/env python3
"""October Qwen3 base-vs-PEFT adapter evaluation. NEVER trains or deploys.

By default this is an offline, dependency-light validation pass. Real evaluation
requires explicit --run-inference, CUDA, a local adapter and matching base model.
No private text, environment values or generated responses appear in reports.
"""
from __future__ import annotations

import argparse
from contextlib import nullcontext
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import time

HERE = Path(__file__).resolve().parent
GEN = HERE / "generated"
MAX_CASES = 50


def load_cases(path: Path) -> list[dict]:
    if not path.is_file() or path.stat().st_size > 150000:
        raise ValueError("Missing or oversized October evaluation file")
    data = []
    seen = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        if not isinstance(item, dict) or set(item) != {"prompt", "completion"}:
            raise ValueError("Invalid October evaluation schema")
        for key, role in [("prompt", "user"), ("completion", "assistant")]:
            messages = item[key]
            if not isinstance(messages, list) or len(messages) != 1:
                raise ValueError("Invalid evaluation messages")
            if set(messages[0]) != {"role", "content"} or messages[0]["role"] != role:
                raise ValueError("Invalid evaluation message roles")
            if not isinstance(messages[0]["content"], str) or len(messages[0]["content"]) > 3000:
                raise ValueError("Invalid evaluation message text")
        question = item["prompt"][0]["content"]
        if question in seen:
            raise ValueError("Duplicate evaluation prompt")
        seen.add(question)
        expected = json.loads(item["completion"][0]["content"])
        if set(expected) != {"value", "unit"} or not isinstance(expected["unit"], str) or (
            type(expected["value"]) not in (float, int)
        ) or not math.isfinite(expected["value"]):
            raise ValueError("Invalid numeric gold answer")
        data.append({"question": question, "value": expected["value"], "unit": expected["unit"]})
    if not 1 <= len(data) <= MAX_CASES:
        raise ValueError("Expected 1..50 held-out numeric cases")
    return data


def verify_isolation(cases: list[dict], paths: list[Path]) -> None:
    holdout = {x["question"] for x in cases}
    for path in paths:
        if not path.is_file() or path.stat().st_size > 2_000_000:
            raise ValueError("Missing or oversized training/validation corpus")
        prompts = set()
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            prompts.add(item["prompt"][0]["content"])
        if holdout & prompts:
            raise ValueError("Benchmark question is present in training/validation corpus")


def grade(text: str, expected: dict) -> str:
    if not text or len(text) > 2000:
        return "EMPTY_OR_OVERSIZED"
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        return "NOT_JSON"
    if not isinstance(parsed, dict) or set(parsed) != {"value", "unit"}:
        return "SCHEMA"
    if type(parsed["value"]) not in (int, float) or not math.isfinite(parsed["value"]):
        return "NUMERIC_TYPE"
    if parsed["unit"] != expected["unit"]:
        return "UNIT"
    if abs(parsed["value"] - expected["value"]) > 0.011:
        return "VALUE"
    return "PASS"


def validate_adapter(adapter_dir: Path, model_name: str, train: Path | None = None, eval_set: Path | None = None) -> dict:
    config_path = adapter_dir / "adapter_config.json"
    manifest_path = adapter_dir / "noodles-training-manifest.json"
    if not config_path.is_file() or not manifest_path.is_file():
        raise ValueError("Adapter configuration and training manifest are both required")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if config.get("base_model_name_or_path") != model_name or manifest.get("base_model") != model_name:
        raise ValueError("Adapter base checkpoint does not match specified Qwen3 model")
    if manifest.get("mode") != "sft" or manifest.get("deployment_status") != "not_deployed":
        raise ValueError("Adapter has no safe, local-only SFT provenance")
    if not (adapter_dir / "adapter_model.safetensors").is_file():
        raise ValueError("Local adapter safetensors are missing")
    if not isinstance(manifest.get("sha256_train"), str) or len(manifest["sha256_train"]) != 64:
        raise ValueError("Adapter training manifest lacks provenance checksum")
    if train is not None and sha256(train.read_bytes()).hexdigest() != manifest["sha256_train"]:
        raise ValueError("Training data checksum differs from adapter provenance")
    if eval_set is not None and sha256(eval_set.read_bytes()).hexdigest() != manifest.get("sha256_eval"):
        raise ValueError("Validation data checksum differs from adapter provenance")
    return {"model": model_name, "sha256_train": manifest["sha256_train"],
            "sha256_eval": manifest.get("sha256_eval")}


def run_inference(args, cases: list[dict], adapter: Path) -> dict:
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import PeftModel
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("No CUDA GPU: cannot run real adapter inference")
    name = args.model
    opts = {"trust_remote_code": False, "local_files_only": not args.allow_model_download,
            "device_map": "auto"}
    if args.load_4bit:
        opts["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True)
    else:
        opts["torch_dtype"] = torch.float16
    tokenizer = AutoTokenizer.from_pretrained(
        name, trust_remote_code=False, local_files_only=not args.allow_model_download)
    base = AutoModelForCausalLM.from_pretrained(name, **opts)
    model = PeftModel.from_pretrained(base, str(adapter), is_trainable=False)
    model.eval()
    outputs = []
    for case_id, item in enumerate(cases, 1):
        ids = tokenizer.apply_chat_template(
            [{"role": "user", "content": item["question"]}],
            tokenize=True, add_generation_prompt=True, enable_thinking=False, return_tensors="pt"
        ).to(model.device)
        # Evaluate using ONE loaded model. disable_adapter() yields the exact
        # underlying base without separately allocating another full model.
        # Alternate evaluation order by case to reduce thermal/cache bias.
        for mode in (("base", "adapter") if case_id % 2 else ("adapter", "base")):
            ctx = model.disable_adapter() if mode == "base" else nullcontext()
            started = time.monotonic()
            with ctx:
                with torch.inference_mode():
                    answer = model.generate(
                        input_ids=ids, do_sample=False, max_new_tokens=128,
                        pad_token_id=tokenizer.eos_token_id,
                        eos_token_id=tokenizer.eos_token_id)
            ids_out = answer[0, ids.shape[-1]:]
            duration = round((time.monotonic()-started)*1000)
            if ids_out.numel() >= 128 and ids_out[-1].item() != tokenizer.eos_token_id:
                verdict = "TRUNCATED"
            else:
                decoded = tokenizer.decode(ids_out, skip_special_tokens=True).strip()
                verdict = grade(decoded, item)
            outputs.append({"case": case_id, "kind": mode, "verdict": verdict,
                            "latencyMs": duration, "outputTokens": int(ids_out.numel())})
    summary = []
    for mode in ("base", "adapter"):
        records = [r for r in outputs if r["kind"] == mode]
        summary.append({"model": name, "variant": mode, "cases": len(records),
                        "numericAccuracy": sum(r["verdict"] == "PASS" for r in records)/len(records),
                        "avgLatencyMs": round(sum(r["latencyMs"] for r in records)/len(records), 2),
                        "avgOutputTokens": round(sum(r["outputTokens"] for r in records)/len(records), 2)})
    return {"scope": "same-template seed holdout, not domain-wide truth",
            "gpu": torch.cuda.get_device_name(0), "baseModel": name,
            "adapterVerified": True, "summary": summary, "trials": outputs}


def main() -> int:
    parser = argparse.ArgumentParser(description="October local Qwen3 base-vs-LoRA test")
    parser.add_argument("--cases", type=Path, default=GEN/"october-numeric-benchmark.jsonl")
    parser.add_argument("--train", type=Path, default=GEN/"october-numeric-sft-train.jsonl")
    parser.add_argument("--validation", type=Path, default=GEN/"october-numeric-sft-eval.jsonl")
    parser.add_argument("--model", default="Qwen/Qwen3-0.6B")
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--allow-model-download", action="store_true")
    parser.add_argument("--load-4bit", action="store_true")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--run-inference", action="store_true")
    args = parser.parse_args()
    if args.model != "Qwen/Qwen3-0.6B":
        parser.error("This reviewed pilot only supports Qwen/Qwen3-0.6B")
    cases = load_cases(args.cases)
    verify_isolation(cases, [args.train, args.validation])
    if args.adapter:
        validate_adapter(args.adapter, args.model, args.train, args.validation)
    if args.check_only:
        print(json.dumps({"datasetValidated": True, "cases": len(cases),
                          "trainHeldOut": True, "modelInvoked": False,
                          "adapterChecked": bool(args.adapter)}))
        return 0
    if args.adapter is None:
        parser.error("--adapter is required for real inference")
    if not args.allow_model_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    result = run_inference(args, cases, args.adapter)
    result["holdout_sha256"] = sha256(args.cases.read_bytes()).hexdigest()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False))
    print("No weights were trained or deployed by this command.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError) as err:
        print("October evaluation failed: "+str(err), file=__import__("sys").stderr)
        raise SystemExit(2)
