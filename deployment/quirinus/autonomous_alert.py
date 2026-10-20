"""Validated aggregate-only public Quirinus notifications; no source/evidence."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

_ORDER = ("Critical", "High", "Medium", "Low", "Info")


def normalize(report: object) -> dict:
    if not isinstance(report, dict):
        raise ValueError("Expected Quirinus report object")
    if (report.get("tool") != "Quirinus"
            or report.get("scanner") != "VulnClaw CodeScan 0.4.1"
            or report.get("result") != "completed"
            or report.get("rawEvidenceIncluded") is not False
            or report.get("fileLocationsIncluded") is not False
            or report.get("jensenBacklogPublished") is not False):
        raise ValueError("Unsafe or incomplete scan report")
    files, total = report.get("filesScanned"), report.get("totalFindings")
    if type(files) is not int or not 0 <= files <= 100_000:
        raise ValueError("Invalid number of source files")
    if type(total) is not int or not 0 <= total <= 2_000_000:
        raise ValueError("Invalid number of findings")
    counts = report.get("severityCounts")
    if not isinstance(counts, dict) or set(counts) != set(_ORDER):
        raise ValueError("Missing or extra severity fields")
    if any(type(counts[level]) is not int or not 0 <= counts[level] <= 2_000_000
           for level in _ORDER):
        raise ValueError("Invalid severity count")
    if sum(counts[level] for level in _ORDER) != total:
        raise ValueError("Inconsistent rule counters")
    high_risk, truncated = report.get("highRisk"), report.get("truncated")
    if type(high_risk) is not bool or type(truncated) is not bool:
        raise ValueError("Invalid completeness flags")
    if high_risk != bool(counts["Critical"] or counts["High"]):
        raise ValueError("Inconsistent elevated risk")
    safe_counts = {level: counts[level] for level in _ORDER}
    # Hash only bounded, trusted integers; never a source snippet, path or token.
    signature = json.dumps([files, total, safe_counts, truncated],
                           sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(signature.encode("ascii")).hexdigest()[:24]
    return {
        "alert": high_risk or truncated,
        "fingerprint": fingerprint,
        "filesScanned": files,
        "totalFindings": total,
        "severityCounts": safe_counts,
        "truncated": truncated,
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: autonomous_alert.py REPORT.json")
    path = Path(sys.argv[1])
    if not path.is_file() or path.stat().st_size > 16 * 1024:
        raise SystemExit("Missing or oversized Quirinus summary")
    try:
        safe = normalize(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError, UnicodeError) as exc:
        raise SystemExit("Invalid aggregate; issue not created") from exc
    print(json.dumps(safe, ensure_ascii=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
