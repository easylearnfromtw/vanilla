#!/usr/bin/env python3
"""Export auditable METADATA-ONLY source catalog, never public article fulltexts."""
from __future__ import annotations
import argparse,hashlib,json,sqlite3
from pathlib import Path

def export_manifest(index:Path,output:Path,expected:int)->dict:
 if not index.is_file() or output.exists():raise ValueError("INPUT_MISSING_OR_OUTPUT_EXISTS")
 output.parent.mkdir(parents=True,exist_ok=True)
 rows=0
 seen=set()
 with sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True) as db:
  db.execute("PRAGMA query_only=ON")
  with output.open("x",encoding="utf8") as f:
   for id,title,grant,rights,source,doi,authors,sha in db.execute(
    "SELECT id,title,license,rights_reference,source_url,doi,authors_json,content_sha256 FROM books ORDER BY id"):
    if id in seen:raise ValueError("DUPLICATED_PMCID")
    seen.add(id)
    record={"evidence_id":"VE-PMC-"+id.removeprefix("pmc-"),
            "article_id":id,"title":title,"doi":doi or None,
            "source_url":source,"license":grant,"rights_reference":rights,
            "authors":json.loads(authors),"fulltext_sha256":sha,
            "rating_status":"provenance-verified-not-factual-accuracy-scored"}
    f.write(json.dumps(record,ensure_ascii=False)+"\n")
    rows+=1
 if rows!=expected:raise ValueError("REAL_FULLTEXT_MANIFEST_TARGET_NOT_MET")
 report={"manifest_records":rows,"unique_pmcids":len(seen),
         "metadata_only_no_article_fulltext":True,
         "manifest_sha256":hashlib.sha256(output.read_bytes()).hexdigest()}
 output.with_suffix(".report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 return report
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--index",required=True,type=Path)
 p.add_argument("--output",required=True,type=Path)
 p.add_argument("--expected",type=int,required=True)
 a=p.parse_args()
 print(json.dumps(export_manifest(a.index,a.output,a.expected),ensure_ascii=False))
if __name__=="__main__":main()
