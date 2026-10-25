#!/usr/bin/env python3
"""World Bank annual economic-statistics intake (OFFLINE), unreviewed only.

Reads a user-provided official World Bank API JSON response for ONE named
indicator. It does NOT fetch remotely, pull indices, claim daily market prices,
review any rights, or create training-ready examples. Exact series licenses
and third-party ownership must still be checked before downstream ML use.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from datetime import date
from pathlib import Path

CANDIDATES = {
    "CM.MKT.LCAP.CD": "上市本國公司市值（美元）",
    "CM.MKT.LCAP.GD.ZS": "上市本國公司市值占GDP百分比",
    "CM.MKT.TRAD.GD.ZS": "股票成交總額占GDP百分比",
    "FP.CPI.TOTL.ZG": "消費者物價年增率",
    "NY.GDP.MKTP.CD": "GDP（美元）",
}
START, END = 1996, 2025

def convert(src, dest, indicator, rights):
    if indicator not in CANDIDATES:
        raise ValueError("UNKNOWN_WORLD_BANK_INDICATOR")
    manifest = json.loads(Path(rights).read_text(encoding="utf-8"))
    if (manifest.get("indicator") != indicator
        or manifest.get("provider") != "World Bank Data Catalog"
        or not isinstance(manifest.get("verified_dataset_license_url"), str)
        or not manifest["verified_dataset_license_url"].startswith("https://")
        or manifest.get("license_verified_by_owner") is not True):
        raise ValueError("INDIVIDUAL_DATASET_LICENSE_REVIEW_REQUIRED")
    path = Path(src)
    if not path.is_file() or path.stat().st_size > 10_000_000:
        raise ValueError("MISSING_OR_OVERSIZED_WORLD_BANK_EXPORT")
    blob = path.read_bytes()
    payload = json.loads(blob.decode("utf-8-sig"))
    if not isinstance(payload, list) or len(payload) != 2 or not isinstance(payload[1], list):
        raise ValueError("EXPECTED_OFFICIAL_WORLD_BANK_API_JSON")
    cards = []
    seen = set()
    for record in payload[1]:
        if not isinstance(record, dict):
            raise ValueError("INVALID_OBSERVATION")
        series = record.get("indicator")
        if not isinstance(series, dict) or series.get("id") != indicator:
            raise ValueError("MIXED_OR_WRONG_INDICATOR")
        year = str(record.get("date", ""))
        iso3 = str(record.get("countryiso3code", "")).strip().upper()
        if not year.isdigit() or len(year) != 4 or not iso3.isalpha() or len(iso3) != 3:
            raise ValueError("INVALID_YEAR_OR_COUNTRY")
        year_int = int(year)
        if year_int < START or year_int > END:
            continue
        num = record.get("value")
        if num is None:
            continue
        if isinstance(num, bool) or not isinstance(num, (int, float)) or not math.isfinite(num):
            raise ValueError("INVALID_VALUE")
        key = (iso3, year)
        if key in seen:
            raise ValueError("DUPLICATE_COUNTRY_YEAR")
        seen.add(key)
        cards.append({
            "id": f"wdi_{indicator.replace('.', '_')}_{iso3}_{year}",
            "country_iso3": iso3, "year": year_int,
            "indicator": indicator, "indicator_zh": CANDIDATES[indicator],
            "value": num, "unit": "World Bank indicator-specific unit",
            "source": "World Bank Data Catalog",
            "dataset_license_url": manifest["verified_dataset_license_url"],
            "upstream_export_sha256": hashlib.sha256(blob).hexdigest(),
            "reviewed": False, "training_approved": False,
            "publication_time_verified": False,
            "warning": "Annual country-level data, NOT a stock exchange close, historical news publication, or proof of market causality. Verify third-party provenance and available-at timestamps.",
        })
    if not cards:
        raise ValueError("NO_OBSERVATIONS_IN_1996_2025")
    target = Path(dest)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x", encoding="utf-8") as f:
        for c in sorted(cards, key=lambda x: (x["year"], x["country_iso3"])):
            f.write(json.dumps(c, ensure_ascii=False, sort_keys=True) + "\n")
    return {"unreviewed_evidence": len(cards), "countries": len({c["country_iso3"] for c in cards}),
            "indicator": indicator, "year_range": [START, END],
            "training_approved": False, "raw_market_price_rows": 0,
            "output": str(target)}

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--indicator", required=True, choices=sorted(CANDIDATES))
    p.add_argument("--license-review", required=True, type=Path)
    args = p.parse_args(argv)
    print(json.dumps(convert(args.input, args.output, args.indicator, args.license_review),
                     indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
