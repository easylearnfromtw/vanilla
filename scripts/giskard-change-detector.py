#!/usr/bin/env python3
"""Classify a Git diff before installing or running expensive AI checks.

Only substantive AI source changes opt in automatically. PR labels can force
a run; the owner can also use workflow_dispatch to test a small patch.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

AI_DIRS = (
    "src/ai/", "src/detroit/", "src/assistant/", "src/local-ai/",
    "src/orchestra/", "src/ceres/", "src/noodles/", "src/search/",
    "src/security/", "src/memory/", "services/weiguo/",
    "services/slime/", "services/self-build-github-worker/",
    "training/",
)
CODE_SUFFIXES = (".ts", ".tsx", ".js", ".mjs", ".py")
# Thresholds are editable policy, not a claim that LOC measures risk.
MIN_NEW_MODULE_LINES = 70
MIN_SINGLE_LARGE_LINES = 180
MIN_MULTI_FILE_LINES = 110
MIN_MULTI_FILE_COUNT = 3


def is_ai_source(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return (
        path.startswith(AI_DIRS)
        and path.endswith(CODE_SUFFIXES)
        and not name.startswith(("test_", "spec_"))
        and not name.endswith((".test.ts", ".test.tsx", ".test.js", ".spec.ts"))
        and not path.startswith(("services/weiguo/test_",))
    )


def classify(changes: list[dict], *, force: bool = False) -> dict:
    related = [c for c in changes if is_ai_source(c["path"])]
    total = sum(c["added"] + c["removed"] for c in related)
    new_modules = [
        c["path"] for c in related
        if c.get("new") and c["added"] >= MIN_NEW_MODULE_LINES
    ]
    reasons: list[str] = []
    if force:
        reasons.append("owner-or-label-override")
    if new_modules:
        reasons.append("new-ai-module")
    if total >= MIN_SINGLE_LARGE_LINES:
        reasons.append("large-ai-diff")
    if len(related) >= MIN_MULTI_FILE_COUNT and total >= MIN_MULTI_FILE_LINES:
        reasons.append("multi-module-ai-refactor")
    return {
        "schemaVersion": 1,
        "classification": "major" if reasons else "minor",
        "runGiskard": bool(reasons),
        "reasons": reasons or ["below-major-ai-threshold"],
        "aiFilesChanged": len(related),
        "aiLinesChanged": total,
        "newMajorModules": new_modules,
        "changedAiPaths": sorted(c["path"] for c in related),
    }


def _git(*args: str) -> str:
    p = subprocess.run(["git", *args], check=True, capture_output=True, text=True)
    return p.stdout


def collect_changes(base: str, head: str, *, pull_request: bool) -> list[dict]:
    if not base or set(base) == {"0"}:
        raise ValueError("Missing usable base SHA (cannot silently skip the gate)")
    if pull_request:
        base = _git("merge-base", base, head).strip()
    entries = _git("diff", "--no-renames", "--numstat", base, head)
    added_paths = set(_git("diff", "--no-renames", "--name-only", "--diff-filter=A", base, head).splitlines())
    changes = []
    for line in entries.splitlines():
        pieces = line.split("\t", 2)
        if len(pieces) != 3:
            continue
        plus, minus, path = pieces
        changes.append({
            "path": path,
            "added": int(plus) if plus.isdecimal() else 0,
            "removed": int(minus) if minus.isdecimal() else 0,
            "new": path in added_paths,
        })
    return changes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--pr", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--output", default="artifacts/giskard-change-report.json")
    parser.add_argument("--github-output", default="")
    options = parser.parse_args()

    # Workflow dispatch intentionally allows a forced run without a compare ref.
    if options.force and not options.base:
        changes = []
    else:
        changes = collect_changes(options.base, options.head, pull_request=options.pr)
    report = classify(changes, force=options.force)
    output = Path(options.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Giskard gate: {report['classification']} | {report['aiFilesChanged']} AI files | {report['aiLinesChanged']} changed lines")
    if options.github_output:
        with open(options.github_output, "a", encoding="utf-8") as file:
            file.write(f"major={'true' if report['runGiskard'] else 'false'}\n")
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as file:
            file.write(f"### Giskard change classification: {report['classification']}\n")
            file.write(f"AI source files: {report['aiFilesChanged']}; changed lines: {report['aiLinesChanged']}.\n")
            file.write("Reasons: " + ", ".join(report["reasons"]) + "\n")


if __name__ == "__main__":
    main()
