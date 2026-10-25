#!/usr/bin/env python3
"""Audit actual 30y coverage before claiming a complete 20-market corpus.

Offline, stdlib only; no network, GPU, model download or training.
This is a diagnostic gate, NOT a license or data-authenticity attestation.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path

from pipeline import END, START, load_prices, read_catalog, split_for

MIN_SESSIONS_PER_FULL_YEAR = 180

def summarize_years(observations):
    counts = Counter(day.year for day, _ in observations)
    # Boundary years 1996 and 2026 do not have full calendar-year coverage
    complete = [y for y in range(1997, 2026)
                if counts[y] >= MIN_SESSIONS_PER_FULL_YEAR]
    gaps = [y for y in range(1997, 2026)
            if counts[y] < MIN_SESSIONS_PER_FULL_YEAR]
    monthly = {(d.year, d.month) for d, _ in observations}
    missing_months = [f"{y:04d}-{m:02d}" for y in range(1997, 2026)
                      for m in range(1, 13) if (y, m) not in monthly]
    labels = Counter(split_for(day) for day, _ in observations)
    first, last = observations[0][0], observations[-1][0]
    return {
        "first_observation": first.isoformat(), "last_observation": last.isoformat(),
        "daily_rows": len(observations),
        "complete_calendar_years_with_180_sessions": len(complete),
        "coverage_1997_to_2025_meets_180_session_threshold": not gaps,
        "incomplete_years": gaps,
        "missing_months_count_1997_to_2025": len(missing_months),
        "missing_months_sample": missing_months[:15],
        "chronological_rows": {key: labels[key] for key in ("train", "eval", "test")},
        "covers_1996_and_2026_boundaries": first <= date(1996, 12, 31) and last >= date(2026, 1, 1),
    }

def audit(folder, rights_path):
    catalog, markets = read_catalog()
    data, lineage = load_prices(folder, rights_path, allow_partial=True)
    entries = {}
    for market_id, readings in sorted(data.items()):
        entries[market_id] = {
            "exchange": markets[market_id]["exchange"],
            **summarize_years(readings),
            "source_sha256": lineage[market_id]["file_sha256"],
            "rights_claimed": lineage[market_id]["rights_basis"],
            "provider": lineage[market_id]["provider"],
        }
    missing = sorted(set(markets) - set(data))
    complete = len(entries) == len(markets) and all(
        item["coverage_1997_to_2025_meets_180_session_threshold"]
        and item["covers_1996_and_2026_boundaries"]
        and all(item["chronological_rows"].values())
        for item in entries.values()
    )
    return {
        "status": "COMPLETE_COVERAGE_CANDIDATE_REQUIRES_SOURCE_AND_RIGHTS_REVIEW"
                  if complete else "INCOMPLETE_30Y_MARKET_COVERAGE",
        "research_period": [str(START), str(END)],
        "market_universe": catalog["ranking_source"],
        "market_count": len(entries), "expected_markets": len(markets),
        "missing_markets": missing,
        "complete_market_coverage": complete,
        "training_approved": False,
        "gpu_training_executed": False,
        "review_required": [
            "Confirm each index inception, regional proxy, historical session calendar, vendor corrections",
            "Validate real provider license permits AI training, redistribution and model deployment",
            "Check news first-publication timestamps, sources and independent factual review",
            "Do not conflate OHLC price-index points with returns including dividends and FX",
        ],
        "markets": entries,
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prices-dir", required=True)
    parser.add_argument("--rights", required=True)
    parser.add_argument("--output", type=Path, help="optional JSON report, cannot overwrite")
    args = parser.parse_args(argv)
    output = audit(args.prices_dir, args.rights)
    serialized = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as sink:
            sink.write(serialized)
    print(serialized, end="")

if __name__ == "__main__":
    main()
