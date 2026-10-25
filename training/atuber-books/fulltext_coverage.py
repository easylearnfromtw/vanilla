#!/usr/bin/env python3
"""Exact-edition catalog/fulltext coverage: never infer rights from title match.

Produces a metadata-only JSONL queue for missing actual authorized ebook files.
Conservatively recognizes ISBN matches only; title similarities are NOT evidence
that an edition (or its translation) is identical, nor training permission.
"""
from __future__ import annotations
import argparse
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

def isbn_digits(x):
    v=re.sub(r"[^0-9X]","",str(x or "").upper())
    return v if len(v) in (10,13) else ""

def coverage(catalog:Path,content:Path|None,output:Path)->dict:
    if output.exists():
        raise ValueError("REFUSE_OVERWRITE_COVERAGE_QUEUE")
    if not catalog.is_file():
        raise ValueError("CATALOGUE_INDEX_REQUIRED")
    verified=set()
    approved=0
    if content is not None:
        if not content.is_file():raise ValueError("PRIVATE_FULLTEXT_INDEX_REQUIRED")
        with sqlite3.connect(content.resolve().as_uri()+"?mode=ro",uri=True) as db:
            approved=db.execute("SELECT COUNT(*) FROM books").fetchone()[0]
            try:
                checked=db.execute("SELECT isbn FROM ingest_files WHERE isbn<>''").fetchall()
                verified={isbn_digits(isbn) for (isbn,) in checked if isbn_digits(isbn)}
            except sqlite3.OperationalError:
                # Legacy private content indexes contain no ISBN; they cannot
                # verify a specific NBINet catalogue edition by title alone.
                pass
    output.parent.mkdir(parents=True,exist_ok=True)
    counts=Counter()
    with sqlite3.connect(catalog.resolve().as_uri()+"?mode=ro",uri=True) as db, output.open("x",encoding="utf-8") as dest:
        for ident,title,author,isbn,source in db.execute(
            """SELECT id,title,author,isbn,source_url FROM books
            WHERE source_scope='catalogue-dataset' ORDER BY id"""):
            counts["catalogue_items"]+=1
            verified_isbn=isbn_digits(isbn)
            has_matching_isbn=bool(verified_isbn and verified_isbn in verified)
            if has_matching_isbn:
                counts["matching_isbn_candidate"]+=1
            else:
                counts["fulltext_not_verified"]+=1
            dest.write(json.dumps({
                "catalogue_book_id":ident,"title":title,"author":author,"isbn":isbn or "",
                "catalogue_source":source,
                "fulltext_file_provided":False if not has_matching_isbn else None,
                "source_edition_check":"ISBN-candidate-review-required" if has_matching_isbn
                     else "unmatched-no-fulltext-evidence",
                "rights_reviewed":False,
                "training_permission":False,
                "request":"supply real owner-authorized fulltext and edition rights evidence"
                    if not has_matching_isbn else "verify physical/electronic edition and actual text"
            },ensure_ascii=False)+"\n")
    result={
        "state":"book-edition-rights-coverage-not-training",
        "catalogue_records":counts["catalogue_items"],
        "private_rights_approved_fulltext_books":approved,
        "catalogue_isbn_match_candidates":counts["matching_isbn_candidate"],
        "catalogue_records_without_verified_matching_isbn":counts["fulltext_not_verified"],
        "metadata_queue":str(output),
        "llm_weight_updates":0,
        "warning":"ISBN match alone is not proof of rights or exact textual equivalence."
    }
    output.with_suffix(".report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return result

def main(argv=None):
    p=argparse.ArgumentParser(description="Truthful coverage of actual rights-approved ebook editions")
    p.add_argument("--catalogue",type=Path,required=True)
    p.add_argument("--content-index",type=Path)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"status":"dry-run","training_complete":False},ensure_ascii=False))
        return 0
    print(json.dumps(coverage(a.catalogue,a.content_index,a.output),ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
