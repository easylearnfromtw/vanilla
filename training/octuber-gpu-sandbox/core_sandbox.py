#!/usr/bin/env python3
"""100k genuine 72-parameter CPU LoRA-style SGD steps per selected model target.

NOT Atuber 0.6B or OCTUBER 30B/60B neural weight updates. This is an
Atuber-compatible rank/alpha mechanics test using 100% synthetic numerical data.
No CUDA, external data, downloaded checkpoint or commercial compute is used.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training" / "atuber"))
from core_contract import LORA_RANK, LORA_ALPHA, core_policy, sha256_payload  # noqa: E402

DIM = 8
RANK = LORA_RANK
SCALE = LORA_ALPHA / RANK
MAX_STEPS = 100000
TEACHER = (1.4, -1.2, 0.9, -0.8, 1., -0.5, 0.4, 0.7)


def sigmoid(x: float) -> float:
    if x < -35:
        return 0.0
    if x > 35:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def examples(seed: int, count: int) -> list[tuple[list[float], float]]:
    generator = random.Random(seed)
    rows = []
    for _ in range(count):
        features = [generator.uniform(-1, 1) for _ in range(DIM)]
        # Soft label from a known synthetic teacher, NEVER real language records.
        expected = sigmoid(sum(t * v for t, v in zip(TEACHER, features)))
        rows.append((features, expected))
    return rows


def heldout_loss(samples: list[tuple[list[float], float]],
                 a: list[list[float]], b: list[float]) -> float:
    measured = 0.0
    for features, target in samples:
        hidden = [sum(w * x for w, x in zip(row, features)) for row in a]
        score = SCALE * sum(weight * value for weight, value in zip(b, hidden))
        p = min(max(sigmoid(score), 1e-12), 1 - 1e-12)
        measured -= target * math.log(p) + (1 - target) * math.log(1 - p)
    return round(measured / len(samples), 8)


def train_surrogate(model: str, steps: int = MAX_STEPS) -> dict:
    if model not in ("30b", "60b"):
        raise ValueError("UNKNOWN_MODEL")
    if not 1 <= steps <= MAX_STEPS:
        raise ValueError("STEPS_OUT_OF_RANGE")
    training = examples(351, 256)
    holdout = examples(867, 128)
    rng = random.Random(20261025 if model == "30b" else 20261026)
    a = [[rng.uniform(-.02, .02) for _ in range(DIM)] for _ in range(RANK)]
    b = [0.] * RANK
    original = heldout_loss(holdout, a, b)
    history = []
    for step in range(1, steps + 1):
        x, target = training[(step - 1) % len(training)]
        hidden = [sum(w * xi for w, xi in zip(row, x)) for row in a]
        score = SCALE * sum(bj * hj for bj, hj in zip(b, hidden))
        residual = sigmoid(score) - target
        original_b = b[:]
        rate = .035 if model == "30b" else .03
        for rank in range(RANK):
            b[rank] -= rate * residual * SCALE * hidden[rank]
            factor = rate * residual * SCALE * original_b[rank]
            for i in range(DIM):
                a[rank][i] -= factor * x[i]
        if step % 10000 == 0 or step == steps:
            measured = heldout_loss(holdout, a, b)
            if not math.isfinite(measured):
                raise RuntimeError("NONFINITE_SYNTHETIC_TEST_LOSS")
            history.append({"step": step, "heldout_loss": measured})
    final = heldout_loss(holdout, a, b)
    if final >= original:
        raise RuntimeError("SURROGATE_DID_NOT_IMPROVE_HELDOUT")
    return {
        "model_target": model, "backend": "python-stdlib-real-cpu-gradient-math",
        "surrogate_trainable_parameters": RANK * DIM + RANK,
        "surrogate_mechanism": "frozen projection plus rank-eight LoRA-style adapter",
        "lora_rank": RANK, "lora_alpha": LORA_ALPHA,
        "training_examples": len(training), "heldout_examples": len(holdout),
        "synthetic_examples_only": True,
        "steps_of_real_surrogate_gradient_updates": steps,
        "heldout_loss_initial": original, "heldout_loss_final": final,
        "loss_history": history,
        "surrogate_adapter_sha256": sha256_payload({"A": a, "B": b}),
        "atuber_core_contract": core_policy(),
        "model_0_6b_weights_updated": False,
        "model_30b_weights_updated": False,
        "model_60b_weights_updated": False,
        "cuda_used": False,
        "training_rights_or_model_quality_established": False,
    }


def build_report(models: list[str], steps: int) -> dict:
    if not models or len(set(models)) != len(models):
        raise ValueError("INVALID_MODEL_SELECTION")
    return {
        "schema": 1,
        "kind": "octuber-atuber-core-100k-surrogate-gradient-smoke-test",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "real_0_6b_30b_or_60b_weights_trained": False,
        "large_model_or_base_weights_downloaded": False,
        "data_rights_reviewed": False,
        "results": [train_surrogate(m, steps) for m in models],
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Atuber-like 100000-step synthetic CPU SGD mechanics test")
    p.add_argument("--model", choices=("30b", "60b", "all"), default="all")
    p.add_argument("--steps", type=int, default=MAX_STEPS)
    p.add_argument("--output", type=Path)
    args = p.parse_args()
    models = ["30b", "60b"] if args.model == "all" else [args.model]
    report = build_report(models, args.steps)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        dest = args.output.resolve()
        if dest.exists():
            raise ValueError("REFUSE_OVERWRITE_SURROGATE_REPORT")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("x", encoding="utf-8") as stream:
            stream.write(payload)
        print("SURROGATE_CORE_REPORT_WRITTEN", dest)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError) as exc:
        print("SURROGATE_CORE_ERROR:", str(exc), file=sys.stderr)
        sys.exit(2)
