#!/usr/bin/env python3
"""Stream OFFLINE GDELT 1.0 event rows into UNREVIEWED source metadata cards.

GDELT SQLDATE is an event date, NOT a guaranteed news publication timestamp.
GDELT is a coded news-derived event index, NOT a proof of market causality or a
license to train on article full text. Cards cannot be fed directly to SFT.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import zipfile
from datetime import date
from pathlib import Path

START, END = "19961025", "20261025"

def process(src: Path, dst: Path, *, limit: int, first: str, last: str):
    if limit < 1 or limit > 200_000:
        raise ValueError("UNSAFE_GDELT_ROW_LIMIT")
    if not src.is_file() or src.stat().st_size > 2_500_000_000:
        raise ValueError("GDELT_ARCHIVE_MISSING_OR_TOO_LARGE")
    if dst.exists():
        raise ValueError("REFUSE_TO_OVERWRITE_GDELT_OUTPUT")
    h = hashlib.sha256()
    with src.open("rb") as f:
        for chunk in iter(lambda: f.read(1024*1024), b""):
            h.update(chunk)
    archive_sha = h.hexdigest()
    seen, accepted = set(), []
    def ingest(handle):
        for row in csv.reader(io.TextIOWrapper(handle, encoding="utf-8", errors="replace"),
                              delimiter="\t"):
            if len(row) != 58:
                continue  # schema differs: must be audited separately
            event_id, day, code, source_url = row[0], row[1], row[26], row[57]
            if (not day.isdigit() or len(day) != 8 or not first <= day <= last
                or not event_id.isdigit() or event_id in seen
                or not source_url.startswith(("https://", "http://"))):
                continue
            seen.add(event_id)
            try:
                goldstein = float(row[30])
            except ValueError:
                goldstein = None
            accepted.append({
                "evidence_id": "gdelt1_" + event_id,
                "event_date": f"{day[:4]}-{day[4:6]}-{day[6:8]}",
                "date_added_utc_unverified": row[56],
                "cameo_event_code": code, "goldstein_score": goldstein,
                "source_url": source_url, "actor1": row[6][:120],
                "actor2": row[16][:120], "source": "GDELT 1.0 Event Database",
                "archive_sha256": archive_sha, "reviewed": False,
                "training_approved": False,
                "publication_timestamp_verified": False,
                "causal_status": "unknown", "article_text_included": False,
                "warning": "GDELT event-date/DATEADDED does not certify first publication; human fact/rights/timestamp review mandatory",
            })
            if len(accepted) >= limit:
                break
    if zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            members = [m for m in z.infolist() if not m.is_dir() and not m.filename.startswith("__MACOSX")]
            if len(members) > 700:
                raise ValueError("TOO_MANY_ZIP_MEMBERS")
            for member in members:
                if len(accepted) >= limit:
                    break
                with z.open(member) as handle:
                    ingest(handle)
    else:
        with src.open("rb") as handle:
            ingest(handle)
    if not accepted:
        raise ValueError("NO_COMPATIBLE_GDELT_V1_EVENTS_FOUND")
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("x", encoding="utf-8") as handle:
        for row in accepted:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True)+"\n")
    return {"source_sha256": archive_sha, "evidence_cards": len(accepted),
            "reviewed": 0, "approved_for_training": 0, "article_bodies": 0,
            "output": str(dst)}

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path, help="local licensed GDELT 1.0 TSV or CSV.zip")
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--max-records", type=int, default=5000)
    p.add_argument("--from-day", default=START)
    p.add_argument("--to-day", default=END)
    args = p.parse_args(argv)
    if (len(args.from_day) != 8 or len(args.to_day) != 8 or
        not args.from_day.isdigit() or not args.to_day.isdigit() or
        not START <= args.from_day <= args.to_day <= END):
        p.error("Date window must be YYYYMMDD within 19961025..20261025")
    print(json.dumps(process(args.input, args.output, limit=args.max_records,
                             first=args.from_day, last=args.to_day),
                     ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
