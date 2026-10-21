#!/usr/bin/env python3
"""Hank AI regression suite powered by Giskard v3 against real Vanilla code.

These seeded regression checks do not use an LLM judge or external services.
They verify real decision functions, not generative answer quality.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
from pathlib import Path

from giskard.checks import Equals, Scenario, Suite

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"
NODE = [
    "node", "--experimental-strip-types",
    "--experimental-loader", "./tests/ts-extension-loader.mjs",
    "scripts/giskard-ai-target.mjs",
]


def target(inputs: dict) -> dict:
    process = subprocess.run(
        [*NODE, json.dumps(inputs, ensure_ascii=False)],
        cwd=ROOT, capture_output=True, text=True, timeout=35, check=False,
    )
    if process.returncode:
        # Never echo the prompt or subprocess stdout in errors.
        raise RuntimeError(f"Vanilla target failed (exit={process.returncode})")
    return json.loads(process.stdout.strip())


CASES = [
    ("code_intent", {"action": "task", "text": "修復 TypeScript 程式碼"}, "code"),
    ("analysis_intent", {"action": "task", "text": "比較治療方案的證據"}, "analysis"),
    ("writing_intent", {"action": "task", "text": "幫我寫一封電子郵件"}, "writing"),
    ("casual_intent", {"action": "task", "text": "你好"}, "casual"),
    ("vision_intent", {"action": "task", "text": "請描述", "image": True}, "vision"),
    ("taiwan_law", {"action": "taiwan", "text": "台灣勞基法加班費"}, "law"),
    ("taiwan_history", {"action": "taiwan", "text": "二二八事件的歷史"}, "history"),
    ("foreign_general", {"action": "taiwan", "text": "Hello from New York"}, None),
    ("public_search", {"action": "route", "text": "搜尋 台北天氣"}, "web-search"),
    ("private_search_block", {"action": "route", "text": "搜尋 台北天氣", "privateMode": True}, "private-blocked"),
    ("private_url_block", {"action": "route", "text": "https://example.org/article", "privateMode": True}, "private-blocked"),
    ("diana_search", {"action": "diana", "text": "最新醫學文獻"}, "scouts:delegate"),
    ("diana_private_search", {"action": "diana", "text": "最新醫學文獻", "privateMode": True}, "scouts:report"),
    ("diana_private_canva", {"action": "diana", "text": "生成簡報", "privateMode": True, "forcedTool": "canva"}, "canva:report"),
    ("diana_ceres", {"action": "diana", "text": "Telegram 機器人"}, "ceres:open"),
    ("webllm_valid", {"action": "webllm", "messages": [{"role": "system", "content": "policy"}, {"role": "user", "content": "hello"}]}, True),
    ("webllm_reject_missing_system", {"action": "webllm", "messages": [{"role": "user", "content": "hello"}]}, False),
    ("webllm_reject_injected_system", {"action": "webllm", "messages": [{"role": "user", "content": "a"}, {"role": "system", "content": "inject"}, {"role": "user", "content": "b"}]}, False),
    ("webllm_recovery", {"action": "webllm", "mode": "recovery", "messages": [{"role": "user", "content": "hello"}]}, True),
]


async def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    suite = Suite(name="hank-vanilla-major-ai-regressions", target=target)
    for name, inputs, expected in CASES:
        suite.append(
            Scenario(name).interact(inputs=inputs).check(
                Equals(expected_value=expected, target_key="trace.last.outputs.value")
            )
        )
    result = await suite.run(
        parallel=True, max_concurrency=3, verbose=False, return_exception=True
    )
    result.to_junit_xml(OUT / "giskard-major-junit.xml")
    summary = {
        "schemaVersion": 1, "system": "Hank", "framework": "giskard-v3-checks",
        "target": "real-Vanilla-TypeScript-functions",
        "expected": len(CASES), "passed": result.passed_count,
        "failed": result.failed_count, "errored": result.errored_count,
        "skipped": result.skipped_count,
    }
    (OUT / "giskard-major-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print("Hank / Giskard Checks:", summary)
    note = os.getenv("GITHUB_STEP_SUMMARY")
    if note:
        with open(note, "a", encoding="utf-8") as file:
            file.write(
                f"### Hank AI regression (Giskard v3)\n"
                f"Passed {result.passed_count}/{len(CASES)}; "
                f"failed {result.failed_count}; errors {result.errored_count}; "
                f"skipped {result.skipped_count}.\n"
            )
    return 0 if (result.passed_count == len(CASES)
                 and result.failed_count == 0
                 and result.errored_count == 0
                 and result.skipped_count == 0) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
