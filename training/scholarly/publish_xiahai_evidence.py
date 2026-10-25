#!/usr/bin/env python3
"""Export a rights-attributed, bounded evidence preview of EXACTLY 1000 actual
PMC paper bodies for GitHub Pages. Never republishes full article text.

This is not an LLM, a clinical review, or a substitute for reading the original.
Source: immutable verified GitHub Actions artifact 12588893981.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path
from datetime import datetime,timezone

SHARDS=10
TARGET=1000
MAX_EXCERPT=260
MAX_PIECES=3
PERMITTED={"cc-by-4.0","cc-by-3.0","cc0-1.0"}
STOP=frozenset("""the and this that with from which have were where when then than into about after before
into within without between study studies results result method methods introduction conclusion discussion
data analysis based also their there these those using used more may can will not but for was
of on in at a an be is are has had as to by we our its it they use over
under reported research article significant participants patients during all one two three
both each such similar compared however including following found showed associated
effects clinical different group groups human authors experiments performed figure table
respectively potential current previous observations provide several many most some
should could would therefore important shown examine examined present""".split())
TOK=re.compile(r"[A-Za-z][A-Za-z-]{3,}")
PMCID=re.compile(r"PMC[0-9]{5,12}")
def token_words(text):
 return [w.lower().strip("-") for w in TOK.findall(text) if w.lower() not in STOP and len(w)>3]
def sha(text):return hashlib.sha256(text.encode("utf-8")).hexdigest()

def export(index:Path,output:Path):
 if not index.is_file():raise ValueError("REAL_1000_PAPER_SOURCE_DB_REQUIRED")
 if output.exists():raise ValueError("REFUSE_OVERWRITE_EXISTING_EVIDENCE_PACK")
 db=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
 try:
  papers=db.execute("""SELECT id,title,authors_json,year,doi,source_url,license,license_url,
      text_hash,body_characters FROM papers ORDER BY id""").fetchall()
  if len(papers)!=TARGET:raise ValueError("EXACTLY_1000_FULLTEXT_PAPERS_REQUIRED")
  counts=db.execute("SELECT COUNT(*),COUNT(DISTINCT paper_id) FROM chunks").fetchone()
  if counts[0]<10_000 or counts[1]!=1000:raise ValueError("REAL_BODY_CHUNKS_MISSING")
  output.mkdir(parents=True,exist_ok=False)
  manifest=[]
  shards=[[] for _ in range(SHARDS)]
  checked=0
  clip_chars=0
  for idx,(ident,title,authors_json,year,doi,url,license,license_url,body_hash,body_chars) in enumerate(papers):
   if (not PMCID.fullmatch(ident) or license not in PERMITTED
       or not url.startswith("https://pmc.ncbi.nlm.nih.gov/articles/"+ident+"/")
       or not license_url.startswith("https://creativecommons.org/")):
    raise ValueError("BAD_PMCID_LICENSE_OR_ATTRIBUTION")
   authors=json.loads(authors_json)
   if not isinstance(authors,list) or not authors or not all(isinstance(a,str) for a in authors[:3]):
    raise ValueError("AUTHOR_ATTRIBUTION_INVALID")
   real=db.execute("SELECT id,position,text,text_sha256 FROM chunks WHERE paper_id=? ORDER BY position",(ident,)).fetchall()
   if len(real)<4:raise ValueError("NOT_AN_ACTUAL_INDEXED_PAPER_BODY")
   for chunk_id,pos,body,digest in real:
    if sha(body)!=digest:raise ValueError("BODY_CHUNK_SHA256_MISMATCH")
   checked+=len(real)
   # Whole article body can inform search terms, without publishing it.
   freq=Counter()
   for _cid,_pos,body,_digest in real:
    freq.update(token_words(body))
   frequency_top=[word for word,count in freq.most_common(32) if count>=2][:24]
   # Three physically separate passages, never an accidental article-length
   # concatenation. Show a short verbatim extract with the PMC CC attribution.
   choose=sorted({0,len(real)//2,len(real)-1})
   evidence=[]
   for position in choose:
    cid,pos,body,digest=real[position]
    clip=re.sub(r"\s+"," ",body).strip()[:MAX_EXCERPT]
    if len(clip)<60:continue
    evidence.append({"chunk_id":cid,"position":pos,"excerpt":clip,"chunk_sha256":digest})
    clip_chars+=len(clip)
   if len(evidence)<2 or len(evidence)>MAX_PIECES:raise ValueError("CITABLE_PASSAGE_SAMPLES_MISSING")
   manifest.append({"id":ident,"title":title,"authors":authors[:6],"year":year,
     "doi":doi,"source_url":url,"license":license,"license_url":license_url,
     "terms":frequency_top,"shard":idx//100})
   shards[idx//100].append({"id":ident,"evidence":evidence})
  if checked!=counts[0] or len(manifest)!=1000 or clip_chars>1000*MAX_PIECES*MAX_EXCERPT:
   raise ValueError("REAL_TEXT_COVERAGE_OR_EXCERPT_LIMIT_FAILED")
  header={"schema":"xiahai-verified-1000-evidence-v1","paper_count":1000,
    "real_fulltext_chunks_checked":checked,
    "excerpt_count":sum(len(r["evidence"]) for shard in shards for r in shard),
    "total_public_excerpt_characters":clip_chars,
    "source":"PMC official OA OAI-PMH verified GitHub run 40168229489",
    "original_run_url":"https://github.com/easylearnfromtw/vanilla/actions/runs/40168229489",
    "rights":"Original creators credited with CC BY URLs; limited extracts only; not clinical advice",
    "llm_weights_trained":False,"papers":manifest}
  (output/"manifest.json").write_text(json.dumps(header,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
  for i,group in enumerate(shards):
   if len(group)!=100:raise ValueError("NOT_100_PER_SHARD")
   (output/f"shard-{i:02}.json").write_text(json.dumps(
    {"schema":"xiahai-evidence-shard-v1","shard":i,"papers":group},
    ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
  receipt={"source_db_sha256":file_hash(index),"manifest_sha256":file_hash(output/"manifest.json"),
    "real_papers":len(manifest),"fulltext_chunks_verified":checked,"public_excerpt_characters":clip_chars,
    "shard_count":len(shards),"qwen_optimizer_steps":0,
    "created_utc":datetime.now(timezone.utc).isoformat()}
  (output/"export-report.json").write_text(json.dumps(receipt,indent=2)+"\n")
  return receipt
 finally:db.close()

def file_hash(path):
 h=hashlib.sha256()
 with path.open("rb") as stream:
  for b in iter(lambda:stream.read(2**20),b""):h.update(b)
 return h.hexdigest()

def verify(index,folder):
 manifest=json.loads((folder/"manifest.json").read_text())
 report=json.loads((folder/"export-report.json").read_text())
 if manifest["paper_count"]!=1000 or report["real_papers"]!=1000:
  raise ValueError("EXACT_NUMBER_MISSING")
 if report["source_db_sha256"]!=file_hash(index):
  raise ValueError("SOURCE_DB_MISMATCH")
 if report["manifest_sha256"]!=file_hash(folder/"manifest.json"):
  raise ValueError("MANIFEST_SHA_MISMATCH")
 allids={p["id"] for p in manifest["papers"]}
 if len(allids)!=1000:raise ValueError("DUPLICATE_PAPER_ID")
 with sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True) as db:
  for n in range(SHARDS):
   chunk=json.loads((folder/f"shard-{n:02}.json").read_text())
   if len(chunk["papers"])!=100:raise ValueError("SHARD_100_REQUIRED")
   for row in chunk["papers"]:
    if row["id"] not in allids:raise ValueError("UNSUPPORTED_CITATION")
    for passage in row["evidence"]:
     body=db.execute("SELECT text,text_sha256 FROM chunks WHERE id=? AND paper_id=?",
                   (passage["chunk_id"],row["id"])).fetchone()
     if not body or sha(body[0])!=passage["chunk_sha256"] or body[1]!=passage["chunk_sha256"]:
      raise ValueError("NOT_GROUNDED_EXCERPT_HASH")
     expected=re.sub(r"\s+"," ",body[0]).strip()[:MAX_EXCERPT]
     if passage["excerpt"]!=expected:raise ValueError("EXCERPT_NOT_EXACT_OR_TOO_LONG")
 return {"verified_real_papers":1000,"verified_quote_count":manifest["excerpt_count"],
         "all_quotes_resolve_to_real_sha256_chunks":True}

def main(argv=None):
 p=argparse.ArgumentParser()
 p.add_argument("--index",type=Path,required=True)
 p.add_argument("--output",type=Path,required=True)
 p.add_argument("--execute",action="store_true")
 a=p.parse_args(argv)
 if not a.execute:
  print(json.dumps({"status":"dry-run","actual_qa_evidence_pack_written":False}));return 0
 print(json.dumps(export(a.index,a.output),indent=2))
 print(json.dumps(verify(a.index,a.output),indent=2))
 return 0

if __name__=="__main__":raise SystemExit(main())
