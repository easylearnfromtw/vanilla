#!/usr/bin/env python3
"""Explicit GDELT v1 event-URL discovery; NEVER treats events as news articles.

2006-2013 historical GDELT event archives may not include source URLs.
Only event rows with genuine URL fields are exported as *candidates*, with
about-market actor codes; they have NO full text, license or training approval.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
import zipfile

ROOT = "https://data.gdeltproject.org/events/"
ACTOR_COUNTRIES = {"TWN": "TW", "CHN": "CN", "JPN": "JP",
                   "KOR": "KR", "USA": "US"}


def archive_url(period: str) -> str:
    if not re.fullmatch(r"20\d{4}(?:\d{2})?", period):
        raise ValueError("Use YYYYMM for 2006-2013/03, or YYYYMMDD after 2013/04")
    year, month = int(period[:4]), int(period[4:6])
    if year < 2006 or year > 2026 or month not in range(1, 13):
        raise ValueError("invalid_period")
    if len(period) == 6:
        if (year, month) >= (2013, 4):
            raise ValueError("daily archives required from 2013-04")
        return ROOT + period + ".zip"
    day = int(period[6:])
    from datetime import date
    date(year, month, day)
    if (year, month) < (2013, 4):
        raise ValueError("monthly archives required before 2013-04")
    return ROOT + period + ".export.CSV.zip"


def parse_event(line: str) -> dict | None:
    cols = line.rstrip("\r\n").split("\t")
    # 58th v1 field is SOURCEURL; older monthly sets may not carry it.
    if len(cols) < 58 or not cols[57].startswith(("https://", "http://")):
        return None
    countries = sorted({ACTOR_COUNTRIES[c] for c in (cols[7], cols[17])
                        if c in ACTOR_COUNTRIES})
    if not countries:
        return None
    raw_date = cols[1]
    if not re.fullmatch(r"\d{8}", raw_date):
        return None
    return {"url": cols[57], "event_date": raw_date[:4] + "-" + raw_date[4:6]
            + "-" + raw_date[6:], "about_markets": countries,
            "gdelt_event_id": cols[0], "origin": "GDELT-v1-event-candidate",
            "has_news_full_text": False, "training_approved": False}


def discover(period: str, output: Path, max_download: int, max_rows: int) -> dict:
    if output.exists():
        raise ValueError("Output already exists: refusing overwrite")
    url = archive_url(period)
    request = Request(url, headers={"User-Agent": "OCTUBER-research-corpus/0.1"})
    with urlopen(request, timeout=40) as response:
        data = response.read(max_download + 1)
    if len(data) > max_download:
        raise ValueError("archive_exceeds_explicit_download_limit")
    output.parent.mkdir(parents=True, exist_ok=True)
    events = urls = 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = [m for m in archive.infolist() if not m.is_dir()
                   and not m.filename.startswith("__MACOSX")]
        if len(members) != 1 or members[0].file_size > 600_000_000:
            raise ValueError("unexpected_zip_structure_or_uncompressed_size")
        with archive.open(members[0]) as raw, output.open("x", encoding="utf-8") as sink:
            seen: set[str] = set()
            for line in io.TextIOWrapper(raw, encoding="utf-8", errors="replace"):
                events += 1
                record = parse_event(line)
                if record and record["url"] not in seen:
                    sink.write(json.dumps(record, ensure_ascii=False) + "\n")
                    urls += 1
                    seen.add(record["url"])
                if max_rows and events >= max_rows:
                    break
    return {"archive": url, "events_read": events, "candidate_urls": urls,
            "news_articles_trained": 0, "output": str(output),
            "warning": "GDELT events are not full article texts; ownership/rights unknown."}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--period", required=True, help="e.g. 200610 or 20150401")
    p.add_argument("--output", required=True)
    p.add_argument("--max-download-mib", type=int, default=64)
    p.add_argument("--max-rows", type=int, default=200_000)
    p.add_argument("--execute", action="store_true", help="Permit one actual archive download")
    a = p.parse_args()
    url = archive_url(a.period)
    if not 1 <= a.max_download_mib <= 512 or not 1 <= a.max_rows <= 2_000_000:
        p.error("size/row budget invalid")
    if not a.execute:
        print(json.dumps({"status": "dry_run", "archive": url,
                          "no_network_used": True, "articles_trained": 0}))
        return
    print(json.dumps(discover(a.period, Path(a.output),
                              a.max_download_mib * 1024 * 1024, a.max_rows),
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
