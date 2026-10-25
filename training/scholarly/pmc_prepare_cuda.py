#!/usr/bin/env python3
"""Human-reviewed 1000 PMC OA article corpus -> Qwen QLoRA-compatible private SQL.

Source licenses are CC BY/CC0, but a trusted person must explicitly review
source editions/attribution and approve this precise, SHA256-pinned corpus.
No permission is inferred merely from a checked box in a web UI.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
from datetime import datetime,timezone
from pathlib import Path

PERMITTED={"cc-by-4.0","cc-by-3.0","cc0-1.0"}

def digest_file(path):
 h=hashlib.sha256()
 with path.open("rb") as f:
  for b in iter(lambda:f.read(1024*1024),b""):h.update(b)
 return h.hexdigest()

def review_manifest(path,source_sha):
 if not path.is_file() or path.stat().st_size>12000:
  raise ValueError("EXPLICIT_CORPUS_HUMAN_RIGHTS_REVIEW_JSON_REQUIRED")
 try:record=json.loads(path.read_text())
 except Exception as e:raise ValueError("REVIEW_JSON_INVALID") from e
 expected={"reviewer","reviewed_at","source_database_sha256","approved_papers",
   "rights_basis","rights_reference","edition_and_attribution_reviewed",
   "training_allowed_for_this_exact_corpus"}
 if not isinstance(record,dict) or set(record)!=expected:
  raise ValueError("RIGHTS_REVIEW_EXACT_FIELDS_REQUIRED")
 if not isinstance(record["reviewer"],str) or not 6<=len(record["reviewer"])<=140 or "auto" in record["reviewer"].lower():
  raise ValueError("HUMAN_REVIEWER_IDENTITY_REQUIRED")
 if not re.fullmatch(r"20[12]\d-\d\d-\d\d",str(record["reviewed_at"])):
  raise ValueError("REVIEW_DATE_INVALID")
 if record["source_database_sha256"]!=source_sha or record["approved_papers"]!=1000:
  raise ValueError("CORPUS_SHA256_AND_EXACT_1000_REQUIRED")
 if record["rights_basis"]!="compatible-license" or not isinstance(record["rights_reference"],str) or len(record["rights_reference"])<35:
  raise ValueError("SPECIFIC_LICENSE_JUSTIFICATION_REQUIRED")
 if record["edition_and_attribution_reviewed"] is not True or record["training_allowed_for_this_exact_corpus"] is not True:
  raise ValueError("TRAINING_NOT_APPROVED_BY_OWNER")
 return record

def build(source,manifest,out):
 if out.exists():raise ValueError("DO_NOT_OVERWRITE_RIGHTS_APPROVED_GPU_INDEX")
 if not source.is_file():raise ValueError("REAL_SOURCE_PMC_CORPUS_NOT_FOUND")
 checksum=digest_file(source)
 signed=review_manifest(manifest,checksum)
 src=sqlite3.connect(source.resolve().as_uri()+"?mode=ro",uri=True)
 out.parent.mkdir(parents=True,exist_ok=True)
 dest=sqlite3.connect(out)
 try:
  check=src.execute("SELECT COUNT(*),COUNT(DISTINCT source_url) FROM papers").fetchone()
  if check!=(1000,1000):raise ValueError("REQUIRED_EXACTLY_1000_DISTINCT_PAPERS")
  if src.execute("SELECT COUNT(*) FROM papers WHERE license NOT IN ('cc-by-4.0','cc-by-3.0','cc0-1.0')").fetchone()[0]:
   raise ValueError("UNLICENSED_PAPERS_PRESENT")
  dest.executescript("""
  CREATE TABLE books(id TEXT PRIMARY KEY,title TEXT,author TEXT,source_url TEXT,
    content_sha256 TEXT,rights_basis TEXT,rights_reference TEXT,reviewer TEXT);
  CREATE TABLE chunks(id TEXT PRIMARY KEY,book_id TEXT,position INTEGER,
    body TEXT NOT NULL,body_sha256 TEXT NOT NULL);
  CREATE INDEX approved_doc_chunk ON chunks(book_id);
  """)
  n=0
  count=0
  with dest:
   for (id,title,authors,source_url,lic,lic_url,bodysha) in src.execute(
       "SELECT id,title,authors_json,source_url,license,license_url,text_hash FROM papers ORDER BY id"):
    author=json.loads(authors)
    if not author:raise ValueError("ARTICLE_AUTHOR_MISSING")
    reviewer=signed["reviewer"]
    # Human signoff is bound to a full database hash; article license retained.
    rights="PMCID "+id+" "+lic+" "+lic_url+"; "+signed["rights_reference"]
    dest.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?)",
         (id,title,author[0],source_url,bodysha,"compatible-license",rights,reviewer))
    n+=1
   for (cid,paper_id,pos,body,sha) in src.execute("SELECT id,paper_id,position,text,text_sha256 FROM chunks ORDER BY id"):
    if hashlib.sha256(body.encode()).hexdigest()!=sha:
     raise ValueError("ARTICLE_CHUNK_HASH_TAMPERING")
    dest.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",(cid,paper_id,pos,body,sha))
    count+=1
  if n!=1000 or count<4000:raise ValueError("NOT_FULL_1000_ARTICLE_TRAINING_CORPUS")
 finally:
  src.close();dest.close()
 report={"status":"human-reviewed-licensed-paper-corpus-prepared-for-owner-gpu-not-trained",
  "articles":n,"source_body_chunks":count,"source_pmc_sha256":checksum,
  "gpu_qlora_compatible":True,"qwen_optimizer_steps_completed":0,
  "corpus_reviewer":signed["reviewer"],"attribution_reviewed":True,
  "generated_utc":datetime.now(timezone.utc).isoformat()}
 out.with_suffix(".audit.json").write_text(json.dumps(report,indent=2)+"\n")
 return report
def main(argv=None):
 p=argparse.ArgumentParser()
 p.add_argument("--source",type=Path,required=True)
 p.add_argument("--review",type=Path,required=True)
 p.add_argument("--output",type=Path,required=True)
 p.add_argument("--execute",action="store_true")
 args=p.parse_args(argv)
 if not args.execute:
  print(json.dumps({"status":"dry-run","trained":False}));return 0
 print(json.dumps(build(args.source,args.review,args.output),indent=2));return 0
if __name__=="__main__":raise SystemExit(main())
