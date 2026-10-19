"""Run pinned Quirinus in a GitHub Actions *network-disabled* Docker container.

Actions publishes aggregate counts only. Never publish vulnerable file paths,
raw evidence, source, scanner stderr, approval tokens or the repair backlog
in a public repository's logs, job summary or artifacts.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys

from quirinus_adapter import quirinus_scan
from detroit_quirinus_dispatcher import build_review_handoff

OUTPUT = Path("/output")
ORDER = ("Critical", "High", "Medium", "Low", "Info")


def public_summary(handoff: dict) -> dict:
    """Project high-level CREAM totals only; suppress specific findings."""
    cream = handoff["cream"]
    counts = cream["severityCounts"]
    if any(type(counts.get(level)) is not int or counts[level] < 0 for level in ORDER):
        raise ValueError("Invalid counts")
    return {
        "tool": "Quirinus",
        "scanner": "VulnClaw CodeScan 0.4.1",
        "mode": "offline L1/L2",
        "result": "completed",
        "filesScanned": cream["filesScanned"],
        "totalFindings": cream["totalFindings"],
        "severityCounts": {level: counts[level] for level in ORDER},
        "highRisk": cream["highRisk"],
        "truncated": cream["truncated"],
        "rawEvidenceIncluded": False,
        "fileLocationsIncluded": False,
        "jensenBacklogPublished": False,
        "disclaimer": "靜態規則結果含誤報與漏報；不代表已確認可被利用或已通過安全認證。",
    }


def render_summary(summary: dict) -> str:
    lines = [
        "## Quirinus · Vanilla 原始碼安全檢查",
        "",
        "**執行環境：** GitHub Actions 離線容器（network none、非 root、唯讀）",
        "",
        f"- 已掃描檔案：{summary['filesScanned']}",
        f"- 規則提示總數：{summary['totalFindings']}",
    ]
    for level in ORDER:
        lines.append(f"- {level}：{summary['severityCounts'][level]}")
    lines.extend([
        "",
        "此處僅公開統計摘要；不公開原始碼、掃描證據、檔案位置或修復待辦。",
        "",
        summary["disclaimer"],
        "",
    ])
    return "\n".join(lines)


async def run() -> None:
    # The adapter itself still validates all explicit isolation attestations,
    # a fixed source root, absence of symlinks and bounded subprocess output.
    scan = await quirinus_scan()
    report = public_summary(build_review_handoff(scan))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "quirinus-summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUTPUT / "quirinus-summary.md").write_text(
        render_summary(report), encoding="utf-8"
    )
    print(f"Quirinus completed: {report['filesScanned']} files, "
          f"{report['totalFindings']} rule findings. Aggregate output only.")


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except BaseException:
        # Raw exceptions may embed source, upstream process messages, or paths.
        print("Quirinus isolated scan failed; check Docker and source limits.", file=sys.stderr)
        sys.exit(1)
