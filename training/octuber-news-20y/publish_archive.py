#!/usr/bin/env python3
"""Publish *metadata-only* newsroom snapshot from the local OCTUBER news SQLite DB.

Never exports article bodies, reviewer details, rights references or private files.
A snapshot is only the top N most recent records per market, NOT the entire archive.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys
from urllib.parse import urlsplit

MARKETS = ("TW", "CN", "JP", "KR", "US")


def export_snapshot(db_path: Path, output: Path, limit: int = 40) -> dict:
    if not db_path.is_file():
        raise ValueError("NEWS_DB_NOT_FOUND")
    if limit < 1 or limit > 200:
        raise ValueError("LIMIT_PER_MARKET_MUST_BE_1_TO_200")
    if db_path.resolve() == output.resolve():
        raise ValueError("OUTPUT_MUST_DIFFER_FROM_DB")
    db = sqlite3.connect(f"file:{db_path.resolve().as_posix()}?mode=ro", uri=True)
    try:
        indexed = db.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        eligible = db.execute(
            "SELECT COUNT(*) FROM articles WHERE status='eligible'"
        ).fetchone()[0]
        articles = []
        for market in MARKETS:
            rows = db.execute(
                """SELECT article_id, url, published_at, title, source
                   FROM articles WHERE market=? ORDER BY published_at DESC, article_id
                   LIMIT ?""", (market, limit)).fetchall()
            for article_id, url, published_at, title, source in rows:
                p = urlsplit(url)
                if p.scheme != "https" or not p.hostname:
                    continue
                articles.append({
                    "article_id": article_id,
                    "url": url,
                    "published_at": published_at,
                    "market": market,
                    "title": title[:300],
                    "source": source[:120]
                })
        articles.sort(key=lambda x: x["published_at"], reverse=True)
        snapshot = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "metadata_indexed": indexed,
            "rights_reviewed_unique_full_articles": eligible,
            "articles": articles
        }
    finally:
        db.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + ".tmp")
    temp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    temp.replace(output)
    return {
        "public_snapshot": str(output),
        "metadata_indexed": snapshot["metadata_indexed"],
        "rights_reviewed_unique_full_articles": snapshot["rights_reviewed_unique_full_articles"],
        "public_article_links": len(articles),
        "full_text_exported": False,
        "model_training_performed": False
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", default="private/octuber-news/articles.sqlite")
    p.add_argument("--output", default="public/bluestar/archive.json")
    p.add_argument("--max-per-market", type=int, default=40)
    a = p.parse_args()
    try:
        result = export_snapshot(Path(a.db), Path(a.output), a.max_per_market)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, sqlite3.Error) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
