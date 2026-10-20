#!/usr/bin/env python3
"""Human-scored held-out benchmark for a NOODLES LoRA student.

No model evaluates itself. Reports include only aggregate scores / dataset
hashes, never prompts, completions, or identifying case details.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

from noodles_distill import read_jsonl, preflight_outputs, write_exclusive, text_ok
from noodles_train import read_samples


def sample_id(prompt: str) -> str:
    return sha256(prompt.encode("utf-8")).hexdigest()[:20]


def template_rows(evaluation: list[dict]) -> list[dict]:
    return [{
        "case_id": sample_id(row["prompt"][0]["content"]),
        "prompt": row["prompt"][0]["content"],
        "reference": row["completion"][0]["content"],
        "baseline_answer": "", "tuned_answer": "",
        "baseline_score": None, "tuned_score": None,
        "baseline_unsupported": None, "tuned_unsupported": None,
        "reviewed": False
    } for row in evaluation]


def dataset_hash(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def make_template(args: argparse.Namespace) -> int:
    held_out = read_samples(args.eval, "sft")
    if not held_out:
        raise ValueError("Empty held-out dataset")
    preflight_outputs([args.output], [args.eval])
    rows = template_rows(held_out)
    write_exclusive(args.output, "".join(json.dumps(x, ensure_ascii=False) + "\n" for x in rows))
    print(f"Created {len(rows)} LOCAL human-scoring forms; nothing has been rated.")
    return 0


def validate_review(row: dict, expected: dict) -> None:
    if set(row) != set(expected):
        raise ValueError("Benchmark review has missing or unrecognized fields")
    if row["case_id"] != expected["case_id"] or row["prompt"] != expected["prompt"]:
        raise ValueError("Review prompt/ID does not match the held-out evaluation")
    if row["reference"] != expected["reference"]:
        raise ValueError("Review reference was modified after preparation")
    if row["reviewed"] is not True:
        raise ValueError("Benchmark requires independent human grading")
    for answer in ("baseline_answer", "tuned_answer"):
        if not text_ok(row[answer], 1, 5000):
            raise ValueError(f"Missing/unsafe {answer}")
    for score in ("baseline_score", "tuned_score"):
        if type(row[score]) is not int or not (0 <= row[score] <= 4):
            raise ValueError(f"{score} must be an integer from 0 to 4")
    for flag in ("baseline_unsupported", "tuned_unsupported"):
        if type(row[flag]) is not bool:
            raise ValueError(f"{flag} must be evaluated by a human (true/false)")


def evaluate(args: argparse.Namespace) -> int:
    held_out = read_samples(args.eval, "sft")
    reviewed = read_jsonl(args.scores, max_rows=1000)
    expected = {x["case_id"]: x for x in template_rows(held_out)}
    if len(expected) != len(held_out):
        raise ValueError("Duplicate held-out prompts")
    if len(reviewed) != len(expected):
        raise ValueError("Every held-out question must receive one independent review")
    seen = set()
    for row in reviewed:
        identifier = row.get("case_id")
        if identifier in seen or identifier not in expected:
            raise ValueError("Duplicate or unexpected case ID")
        validate_review(row, expected[identifier])
        seen.add(identifier)
    if args.train:
        trained = read_samples(args.train, "sft")
        train_questions = {item["prompt"][0]["content"].strip().lower() for item in trained}
        if any(item["prompt"][0]["content"].strip().lower() in train_questions for item in held_out):
            raise ValueError("Training set leaked into held-out benchmark")
    count = len(reviewed)
    base = sum(x["baseline_score"] for x in reviewed) / count
    tuned = sum(x["tuned_score"] for x in reviewed) / count
    unsupported_base = sum(x["baseline_unsupported"] for x in reviewed)
    unsupported_tuned = sum(x["tuned_unsupported"] for x in reviewed)
    severe = sum(x["tuned_score"] <= x["baseline_score"] - 2 for x in reviewed)
    eligible = (count >= 10 and tuned - base >= .25 and
                unsupported_tuned <= unsupported_base and severe == 0)
    report = {
        "schema_version": 1, "kind": "noodles-human-scored-heldout",
        "dataset_sha256": dataset_hash(args.eval), "reviewed_cases": count,
        "score_scale": "0..4; independent human rating, not automated factual verification",
        "baseline_average": round(base, 4), "student_average": round(tuned, 4),
        "average_improvement": round(tuned - base, 4),
        "baseline_unsupported_cases": unsupported_base,
        "student_unsupported_cases": unsupported_tuned,
        "severe_regressions": severe,
        "minimum_held_out_cases_for_gate": 10,
        "eligible_for_manual_release_review": eligible,
        "model_deployed": False, "human_final_release_approval_required": True,
        "limitations": "A/B rubrics reflect reviewer judgments; run domain benchmarks before release."
    }
    preflight_outputs([args.output], [args.eval, args.scores] + ([args.train] if args.train else []))
    write_exclusive(args.output, json.dumps(report, indent=2) + "\n")
    print(f"Human-scored baseline={base:.2f}, adapter={tuned:.2f}, N={count}; "
          f"eligible for manual review={eligible}. Never automatically deploy.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local NOODLES baseline/student benchmark")
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("template")
    p.add_argument("--eval", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    r = commands.add_parser("report")
    r.add_argument("--eval", type=Path, required=True)
    r.add_argument("--scores", type=Path, required=True)
    r.add_argument("--train", type=Path)
    r.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    return make_template(args) if args.command == "template" else evaluate(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, TypeError, KeyError, OSError) as exc:
        print(f"NOODLES BENCHMARK: {exc}", file=sys.stderr)
        sys.exit(2)
