#!/usr/bin/env python3
"""Turn the 100 verified, factual Gutenberg ID/title/author records into *metadata-only*
SGD training input. This does not read or train on disputed historical fulltext.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

EXPRESSION=re.compile(
 r"export const LIUAN_VERIFIED_HISTORICAL_BOOKS\s*=\s*(\[[\s\S]*?\])\s*as const\s*;"
)


def read_records(ts_file:Path):
    if not ts_file.is_file() or ts_file.stat().st_size>1_000_000:
        raise ValueError("HISTORICAL_100_METADATA_SOURCE_REQUIRED")
    text=ts_file.read_text(encoding="utf-8")
    m=EXPRESSION.search(text)
    if not m:raise ValueError("HISTORICAL_100_ARRAY_NOT_FOUND")
    records=json.loads(m.group(1))
    if not isinstance(records,list) or len(records)!=100:raise ValueError("EXACTLY_100_SOURCE_BOOKS_REQUIRED")
    seen=set()
    for row in records:
        if not isinstance(row,list) or len(row)!=3:raise ValueError("SOURCE_ROW_INVALID")
        ident,title,author=row
        if not isinstance(ident,str) or not re.fullmatch(r"[0-9]{1,6}",ident) or ident in seen:
            raise ValueError("GUTENBERG_ID_INVALID_OR_DUPLICATE")
        seen.add(ident)
        if not isinstance(title,str) or not 5<=len(title)<=300:
            raise ValueError("TITLE_REQUIRED")
        if not isinstance(author,str) or not 3<=len(author)<=300:
            raise ValueError("AUTHOR_REQUIRED")
    return records,hashlib.sha256(ts_file.read_bytes()).hexdigest()


def create_index(ts_source:Path,db_path:Path):
    if db_path.exists():raise ValueError("REFUSE_OVERWRITE_METADATA_INDEX")
    items,source_hash=read_records(ts_source)
    db_path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(db_path)
    try:
        db.execute("""CREATE TABLE books
            (id TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT NOT NULL,
             topic TEXT,source_scope TEXT NOT NULL)""")
        with db:
            db.executemany("INSERT INTO books VALUES(?,?,?,?,?)",[
             ("pg_"+ident,title,author,"","verified-historical-source")
             for ident,title,author in items])
        count=db.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if count!=100:raise ValueError("MISMATCHED_REAL_METADATA_ROWS")
    finally:db.close()
    return {"book_metadata_count":count,"source_sha256":source_hash,
            "real_book_fulltext_read":0,"neural_language_model_updates":0,
            "dataset_scope":"source-provenance-metadata-only"}


def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"status":"dry-run","steps":0},ensure_ascii=False));return 0
    print(json.dumps(create_index(a.source,a.index),indent=2));return 0

if __name__=="__main__":
    raise SystemExit(main())
