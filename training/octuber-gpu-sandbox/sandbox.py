#!/usr/bin/env python3
"""OCTUBER 30B / 60B GPU training sandbox — not trained large model weights.

Modes: plan (stdlib/offline), toy-cpu (real tiny torch gradients on CPU),
toy-cuda (real tiny torch gradients ONLY if CUDA physically exists).
The tiny optimization NEVER constitutes 30B or 60B pretraining/fine-tuning.
30B's separate opt-in QLoRA trainer lives under ../octuber-sumptuous/.
60B gpt-oss MXFP4 LoRA/PEFT compatibility remains to be validated on CUDA.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROFILES = {
    "30b": {
        "model_id": "octuber-sumptuous-30b-v0.1",
        "upstream": "Qwen/Qwen3-30B-A3B-Instruct-2507",
        "base_license": "Apache-2.0", "architecture": "qwen3_moe",
        "total_parameters_billions": 30.5, "active_parameters_billions": 3.3,
        "quantization_note": "NF4 hypothetical training-load plan; 30B trainer is separate.",
        "real_training_driver": "training/octuber-sumptuous/train.py",
        "training_driver_status": "implemented-but-not-tested-on-actual-30B-GPU",
        "single_gpu_qlora_screen_gib": 40,
    },
    "60b": {
        "model_id": "octuber-60b-v0.1",
        "upstream": "MultiverseComputingCAI/HyperNova-60B",
        "base_license": "Apache-2.0", "architecture": "pruned-gpt-oss-moe",
        "total_parameters_billions": 59.0, "active_parameters_billions": 4.8,
        "quantization_note": "Upstream MXFP4; ordinary bitsandbytes NF4/PEFT conversion unverified.",
        "real_training_driver": None,
        "training_driver_status": "architecture-specific-QLoRA-driver-unverified",
        "single_gpu_qlora_screen_gib": 96,
    },
}


def estimate(profile: dict, *, scenario_gib: float | None = None) -> dict:
    p = profile["total_parameters_billions"] * 1_000_000_000
    gib = 1024 ** 3
    # Weight storage lower bounds ONLY, not trainable gradient/activation/runtime
    # memory. 4-bit estimate does not describe actual MXFP4 storage overhead.
    heuristic = profile["single_gpu_qlora_screen_gib"]
    return {
        "4bit_gib": round(p / 2 / gib, 2),
        "8bit_gib": round(p / gib, 2),
        "bf16_gib": round(2 * p / gib, 2),
        "heuristic_qlora_single_gpu_vram_screen_gib": heuristic,
        "requested_scenario_vram_gib": scenario_gib,
        "scenario_meets_nonbinding_screen":
            None if scenario_gib is None else scenario_gib >= heuristic,
        "capacity_guaranteed": False,
        "warning": "Weight storage and budget screening only; NOT actual GPU allocation, successful training, or 60B MXFP4 compatibility.",
    }


def assess_dataset(path: Path | None) -> dict:
    if path is None:
        return {"validated": False,
                "reason": "No owner-reviewed and consented dataset supplied",
                "reviewed_rows": 0}
    sys.path.insert(0, str(ROOT / "training" / "atuber"))
    from dataset import validate_jsonl, to_conversations  # noqa: E402
    rows, digest = validate_jsonl(path, min_rows=100)
    train, holdout = to_conversations(rows)
    if len(holdout) < 5:
        raise ValueError("AT_LEAST_FIVE_NONOVERLAPPING_HOLDOUT_ROWS_REQUIRED")
    training_pairs = {(x["messages"][1]["content"], x["messages"][2]["content"]) for x in train}
    holdout_pairs = {(x["messages"][1]["content"], x["messages"][2]["content"]) for x in holdout}
    if training_pairs.intersection(holdout_pairs):
        raise ValueError("DUPLICATE_USER_ASSISTANT_PAIRS_CROSS_SPLIT")
    return {"validated": True, "reviewed_rows": len(rows), "train_rows": len(train),
            "holdout_rows": len(holdout), "sha256": digest,
            "notice": "Schema/consent attestations are not independent copyright or accuracy verification."}


def small_gradient_experiment(*, on_cuda: bool, steps: int) -> dict:
    """Actual tiny optimization. No downloads and no large model weights."""
    try:
        import torch
        from torch import nn
    except ImportError as exc:
        raise RuntimeError("LOCAL_TORCH_REQUIRED_FOR_TOY_GRADIENT_EXPERIMENT") from exc
    if on_cuda and not torch.cuda.is_available():
        raise RuntimeError("NO_REAL_CUDA_DEVICE_AVAILABLE_TO_PERFORM_GPU_SANDBOX")
    device = torch.device("cuda:0" if on_cuda else "cpu")
    torch.manual_seed(20261025)
    # 1,682 parameters, emphatically NOT billions.
    network = nn.Sequential(nn.Linear(32, 48), nn.Tanh(), nn.Linear(48, 2)).to(device)
    generator = torch.Generator(device="cpu").manual_seed(20261025)
    features = torch.randn(128, 32, generator=generator).to(device)
    labels = (features[:, 0] - features[:, 1] > 0).long()
    optimizer = torch.optim.AdamW(network.parameters(), lr=0.025)
    losses = []
    for _ in range(steps):
        optimizer.zero_grad(set_to_none=True)
        loss = nn.functional.cross_entropy(network(features), labels)
        loss.backward()
        optimizer.step()
        losses.append(float(loss.item()))
    if on_cuda:
        torch.cuda.synchronize()
    if not (math.isfinite(losses[-1]) and losses[-1] < losses[0]):
        raise RuntimeError("TOY_OPTIMIZATION_FAILED_TO_LOWER_LOSS")
    return {
        "device": str(device), "backend": "cuda" if on_cuda else "cpu",
        "torch_version": str(torch.__version__),
        "parameters_actually_trained": sum(x.numel() for x in network.parameters()),
        "actual_gradient_steps": steps, "initial_loss": round(losses[0], 6),
        "final_loss": round(losses[-1], 6),
        "actual_cuda_toy_training_executed": bool(on_cuda),
        "large_model_weights_modified": False, "model_weights_downloaded": False,
    }


def make_report(models: list[str], *, mode: str, steps: int,
                scenario_gib: float | None, dataset: Path | None) -> dict:
    report = {
        "schema": 1, "kind": "octuber-gpu-capacity-and-tiny-gradient-sandbox",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "mode": mode, "training_completed_for_30b_or_60b": False,
        "real_30b_or_60b_adapter_created": False,
        "actual_gpu_toy_training_executed": False,
        "training_dataset": assess_dataset(dataset),
        "models": {name: {
            **PROFILES[name],
            "memory_estimate": estimate(PROFILES[name], scenario_gib=scenario_gib),
            "real_training_state": "not-started",
        } for name in models},
        "toy_experiment": None,
    }
    if mode in ("toy-cpu", "toy-cuda"):
        result = small_gradient_experiment(on_cuda=(mode == "toy-cuda"), steps=steps)
        report["toy_experiment"] = result
        report["actual_gpu_toy_training_executed"] = result["actual_cuda_toy_training_executed"]
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Offline OCTUBER 30B/60B model-size sandbox; no weight training")
    p.add_argument("--models", choices=("30b", "60b", "all"), default="all")
    p.add_argument("--mode", choices=("plan", "toy-cpu", "toy-cuda"), default="plan")
    p.add_argument("--steps", type=int, default=20)
    p.add_argument("--scenario-vram-gib", type=float, default=None,
                   help="Hypothetical SINGLE-GPU VRAM; not detected hardware")
    p.add_argument("--dataset", type=Path, default=None,
                   help="Owner-reviewed data ONLY; never uploaded or included in report")
    p.add_argument("--output", type=Path, default=None,
                   help="Optional report JSON; cannot overwrite prior report")
    args = p.parse_args(argv)
    if not 3 <= args.steps <= 100:
        p.error("Toy training steps must be 3..100")
    if args.scenario_vram_gib is not None and (
        not math.isfinite(args.scenario_vram_gib) or not 1 <= args.scenario_vram_gib <= 2048
    ):
        p.error("Scenario memory must be a finite 1..2048 GiB number")
    models = list(PROFILES) if args.models == "all" else [args.models]
    report = make_report(models, mode=args.mode, steps=args.steps,
                         scenario_gib=args.scenario_vram_gib, dataset=args.dataset)
    payload = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        dest = args.output.resolve()
        if dest.exists():
            raise ValueError("REFUSE_OVERWRITE_GPU_SANDBOX_REPORT")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("x", encoding="utf-8") as fh:
            fh.write(payload)
        print("OCTUBER_SANDBOX_REPORT_WRITTEN", dest)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, ValueError) as error:
        print("OCTUBER_SANDBOX_ERROR:", str(error), file=sys.stderr)
        sys.exit(2)
