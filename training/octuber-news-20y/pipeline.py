#!/usr/bin/env python3
"""OCTUBER 20-year, five-market news corpus gate. Stdlib; no implicit network/GPU.

Indexes verifiable news metadata, but exports training text ONLY after per-record
rights and human-review checks. Records/events indexed != full articles trained.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

START = date(2006, 10, 25)
END = date(2026, 10, 25)
MARKETS = ("TW", "CN", "JP", "KR", "US")
TARGET = 20_000_000
MIN_PER_MARKET = 1_000_000
TRAINABLE_LICENSES = {"CC-BY-2.5", "CC-BY-4.0", "CC-BY-SA-4.0", "CC0", "PUBLIC-DOMAIN"}
RIGHTS_BASES = {"owned", "permission", "compatible-license"}
TRACKERS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref_src"}
HEX = re.compile(r"^[a-f0-9]{64}$")


def clean_url(raw: object) -> str:
    if not isinstance(raw, str):
        raise ValueError("invalid_url")
    p = urlsplit(raw.strip())
    if p.scheme not in {"http", "https"} or not p.hostname or p.username or p.password:
        raise ValueError("invalid_url")
    hostname = p.hostname.lower().rstrip(".")
    if (hostname == "localhost" or hostname.endswith(".localhost")
            or hostname.endswith(".local") or ":" in hostname):
        raise ValueError("unsafe_url")
    try:
        port = p.port
    except ValueError as e:
        raise ValueError("invalid_port") from e
    netloc = hostname + (f":{port}" if port and port not in (80, 443) else "")
    args = sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                  if not k.lower().startswith("utm_") and k.lower() not in TRACKERS)
    return urlunsplit(("https", netloc, p.path or "/", urlencode(args), ""))


def normalized_text(raw: object) -> str:
    if not isinstance(raw, str):
        return ""
    return re.sub(r"\s+", " ", raw).strip()


def parse_date(raw: object) -> date:
    if not isinstance(raw, str):
        raise ValueError("missing_date")
    try:
        value = date.fromisoformat(raw[:10])
    except ValueError as e:
        raise ValueError("invalid_date") from e
    if not START <= value <= END:
        raise ValueError("out_of_window")
    return value


def examine(row: object) -> dict:
    if not isinstance(row, dict):
        raise ValueError("not_object")
    url = clean_url(row.get("url"))
    published = parse_date(row.get("published_at"))
    market = row.get("market")
    if market not in MARKETS:
        raise ValueError("invalid_market")
    title = normalized_text(row.get("title"))
    source = normalized_text(row.get("source"))
    if len(title) < 4 or not source:
        raise ValueError("missing_title_or_source")
    text = normalized_text(row.get("text"))
    basis = row.get("rights_basis")
    license_id = row.get("license")
    reference = normalized_text(row.get("rights_reference"))
    reviewed = row.get("reviewed") is True
    approved = row.get("training_approved") is True
    # Licensing claims are attestations, not independent legal verification.
    rights_ok = (basis in RIGHTS_BASES and len(reference) >= 12
                 and (basis != "compatible-license" or license_id in TRAINABLE_LICENSES))
    text_ok = len(text) >= 200 and len(text) <= 500_000
    accepted = bool(rights_ok and text_ok and reviewed and approved)
    reason = ("eligible" if accepted else
              "unreviewed" if not reviewed or not approved else
              "rights_unverified" if not rights_ok else "no_usable_full_text")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest() if accepted else None
    article_id = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return dict(article_id=article_id, url=url, published_at=published.isoformat(),
                year=published.year, market=market, title=title, source=source,
                status="eligible" if accepted else "metadata_only", reason=reason,
                content_sha256=digest, text=text if accepted else "",
                rights_basis=basis, rights_reference=reference, license=license_id)


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(db_path))
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS articles (
        article_id TEXT PRIMARY KEY, url TEXT NOT NULL, published_at TEXT NOT NULL,
        year INTEGER NOT NULL, market TEXT NOT NULL, title TEXT NOT NULL,
        source TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
        content_sha256 TEXT, rights_basis TEXT, license TEXT, rights_reference TEXT
    )""")
    db.execute("""CREATE UNIQUE INDEX IF NOT EXISTS unique_training_text
                 ON articles(content_sha256) WHERE content_sha256 IS NOT NULL""")
    db.execute("CREATE INDEX IF NOT EXISTS article_region_date ON articles(market,year)")
    return db


def summary(db: sqlite3.Connection, target: int = TARGET) -> dict:
    indexed = db.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    eligible = db.execute("SELECT COUNT(*) FROM articles WHERE status='eligible'").fetchone()[0]
    counts = {m: 0 for m in MARKETS}
    years = set()
    for market, year, number in db.execute(
        "SELECT market,year,COUNT(*) FROM articles WHERE status='eligible' GROUP BY market,year"
    ):
        counts[market] += number
        years.add(year)
    return {
        "window_start": START.isoformat(), "window_end": END.isoformat(),
        "target_eligible_full_articles": target, "metadata_indexed": indexed,
        "rights_reviewed_unique_full_articles": eligible,
        "eligible_by_market": counts, "years_without_eligible_articles":
            [y for y in range(START.year, END.year + 1) if y not in years],
        "article_target_met": eligible >= target,
        "five_market_minimum_met": all(v >= MIN_PER_MARKET for v in counts.values()),
        "full_twenty_year_coverage": len(years) == END.year - START.year + 1,
        "real_model_weights_trained": False,
        "training_status": "corpus_preparation_only",
        "note": "Requires independently verified rights and a real GPU training receipt."
    }


def ingest(args: argparse.Namespace) -> dict:
    src, db_path, out_path = map(Path, (args.input, args.db, args.output))
    if not src.is_file():
        raise ValueError("input_file_missing")
    if out_path == src or out_path == db_path or db_path == src:
        raise ValueError("paths_must_be_distinct")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    db = connect(db_path)
    batch = Counter()
    try:
        # Export is append-only for subsequent resumes, with DB uniqueness guarding repeats.
        with src.open("r", encoding="utf-8-sig") as stream, out_path.open("a", encoding="utf-8") as out:
            for line in stream:
                if not line.strip():
                    continue
                batch["read"] += 1
                try:
                    row = examine(json.loads(line))
                except (ValueError, TypeError, json.JSONDecodeError) as exc:
                    batch["rejected_invalid"] += 1
                    continue
                params = tuple(row.get(k) for k in (
                    "article_id", "url", "published_at", "year", "market", "title",
                    "source", "status", "reason", "content_sha256", "rights_basis",
                    "license", "rights_reference"
                ))
                try:
                    with db:
                        cursor = db.execute(
                            "INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", params
                        )
                        if cursor.rowcount and row["status"] == "eligible":
                            # Same transaction writes DB row; recover partial output
                            # with reconcile/export if disk write fails.
                            output = {
                                "id": row["article_id"],
                                "text": row["text"], "market": row["market"],
                                "published_at": row["published_at"], "source": row["source"],
                                "url": row["url"], "title": row["title"],
                                "content_sha256": row["content_sha256"],
                                "license": row["license"], "rights_basis": row["rights_basis"],
                                "rights_reference": row["rights_reference"]
                            }
                            out.write(json.dumps(output, ensure_ascii=False) + "\n")
                    batch[row["status"]] += 1
                except sqlite3.IntegrityError:
                    batch["duplicate_url_or_content"] += 1
                if args.limit and batch["read"] >= args.limit:
                    break
    finally:
        report = summary(db, args.target)
        db.close()
    report["current_batch"] = dict(batch)
    if args.report:
        rp = Path(args.report)
        rp.parent.mkdir(parents=True, exist_ok=True)
        rp.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", default="private/octuber-news/articles.sqlite")
    p.add_argument("--input", help="Rights-reviewed article records, JSONL; never scrape implicitly")
    p.add_argument("--output", default="private/octuber-news/pretrain-approved.jsonl")
    p.add_argument("--report", default="private/octuber-news/report.json")
    p.add_argument("--target", type=int, default=TARGET)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--status", action="store_true", help="Read counters without ingesting")
    a = p.parse_args()
    if a.target <= 0 or a.limit < 0:
        p.error("target must be positive, limit nonnegative")
    if not a.status and not a.input:
        p.error("--input required unless --status")
    if a.status:
        dbfile = Path(a.db)
        if not dbfile.is_file():
            p.error("No corpus database; nothing indexed")
        db = connect(dbfile)
        result = summary(db, a.target)
        db.close()
    else:
        result = ingest(a)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
