#!/usr/bin/env python3
"""Real arXiv OAI-PMH licensed batch corpus; metadata != fulltext != LLM training.

Use official ListRecords + resumptionToken (metadata reuse permitted).
Only download a PDF after an exact record's CC0/CC BY licence check.
Record rights/provenance per document in SQLite; never synthesize text.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from live_ingest import OAI, normalized_license, secure_fetch, extract_pdf, ingest_one, create_db

OAI_NS="{http://www.openarchives.org/OAI/2.0/}"
MODERN_ID=re.compile(r"^\d{4}\.\d{4,5}$")
MAX_META_BYTES=8_000_000

def extract_candidates(raw: bytes) -> tuple[list[dict],str]:
    if len(raw)>MAX_META_BYTES or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("BATCH_OAI_XML_UNSAFE_OR_TOO_LARGE")
    document=ET.fromstring(raw)
    err=document.find(OAI_NS+"error")
    if err is not None:
        raise ValueError("OAI_ERROR_"+str(err.attrib.get("code","UNKNOWN")))
    out=[]
    for rec in document.findall(".//"+OAI_NS+"record"):
        metadata=rec.find(OAI_NS+"metadata")
        if metadata is None or len(metadata)!=1:continue
        node=metadata[0]
        def field(name: str)->str:
            return next((str(x.text or "").strip() for x in node
                         if x.tag.rsplit("}",1)[-1]==name and x.text), "")
        ident=field("id")
        if not MODERN_ID.fullmatch(ident):continue
        license_info=normalized_license(field("license"))
        title=" ".join(field("title").split())[:600]
        if not license_info or len(title)<6:continue
        out.append({"arxiv_id":ident,"title":title,"license":license_info[0],
            "license_reference":license_info[1],
            "source_url":"https://arxiv.org/abs/"+ident,
            "fulltext_source_url":"https://arxiv.org/pdf/"+ident})
    token=document.find(".//"+OAI_NS+"resumptionToken")
    next_token=str(token.text or "").strip() if token is not None else ""
    if len(next_token)>5000:raise ValueError("INVALID_RESUMPTION_TOKEN")
    return out,next_token

def harvest(start_date: str,end_date: str,target:int,max_pages:int,delay:float,
            fetcher=secure_fetch)->tuple[list[dict],dict]:
    candidates=[]
    seen=set()
    token=""
    pages=0
    for page in range(max_pages):
        if page==0:
            params={"verb":"ListRecords","metadataPrefix":"arXiv",
                    "from":start_date,"until":end_date,"set":"cs"}
        else:
            if not token:break
            params={"verb":"ListRecords","resumptionToken":token}
        url=OAI+"?"+urllib.parse.urlencode(params)
        raw=fetcher(url,MAX_META_BYTES)
        found,token=extract_candidates(raw)
        pages+=1
        for row in found:
            if row["arxiv_id"] not in seen:
                candidates.append(row)
                seen.add(row["arxiv_id"])
            if len(candidates)>=target:break
        if len(candidates)>=target or not token:break
        time.sleep(delay)
    return candidates[:target],{
        "oai_pages_retrieved":pages,"distinct_rights_confirmed_metadata_candidates":len(candidates[:target]),
        "requested_rights_confirmed_metadata_target":target,
        "oai_has_next_page":bool(token),
    }

def execute(output:Path,start_date:str,end_date:str,licensed_target:int,
            pdf_cap:int,max_pages:int,delay:float,fetcher=secure_fetch)->dict:
    db_path=output.with_suffix(".sqlite3")
    report_path=output.with_suffix(".report.json")
    metadata_path=output.with_suffix(".licensed-metadata.jsonl")
    if any(p.exists() for p in (db_path,report_path,metadata_path)):
        raise ValueError("NEVER_OVERWRITE_LICENSED_RESEARCH_OUTPUT")
    if not 3.0<=delay<=30:raise ValueError("OAI_THROTTLE_MIN_THREE_SECONDS")
    if not 3<=pdf_cap<=20 or not pdf_cap<=licensed_target<=100:
        raise ValueError("BOUNDED_META_AND_PDF_TARGET_REQUIRED")
    if not 1<=max_pages<=15:raise ValueError("MAX_PAGE_LIMIT")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",start_date) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}",end_date):
        raise ValueError("OAI_DATE_FORMAT_INVALID")
    if start_date>end_date:raise ValueError("OAI_DATE_ORDER_INVALID")
    rows,harvest_info=harvest(start_date,end_date,licensed_target,max_pages,delay,fetcher)
    # Metadata candidates have verified licence indications but are not
    # considered verified *fulltext* until the PDF has been downloaded and hashed.
    output.parent.mkdir(parents=True,exist_ok=True)
    with metadata_path.open("x",encoding="utf-8") as stream:
        for row in rows:stream.write(json.dumps({**row,"fulltext_downloaded":False},
                                      ensure_ascii=False)+"\n")
    if len(rows)<3:raise RuntimeError("INSUFFICIENT_REAL_LICENSED_ARXIV_METADATA")
    db=create_db(db_path)
    details=[]
    try:
        # Cautious bounded, sequential PDF ingestion with official rate limit.
        # Continue past individual PDF failures, but fail if <3 genuine documents.
        for row in rows:
            if len([r for r in details if r["state"]=="fulltext-indexed"])>=pdf_cap:break
            time.sleep(delay)
            try:
                pdf=fetcher(row["fulltext_source_url"])
                body,pages=extract_pdf(pdf)
                count=ingest_one(db,row,body)
                details.append({
                    "arxiv_id":row["arxiv_id"],"state":"fulltext-indexed",
                    "license":row["license"],"license_reference":row["license_reference"],
                    "text_sha256":hashlib.sha256(body.encode()).hexdigest(),
                    "pages":pages,"characters":len(body),"chunks":count,
                    "source_url":row["source_url"]})
            except Exception as exc:
                # Failure never authorizes skipping the licence audit, or
                # counting the article as read/trained.
                details.append({"arxiv_id":row["arxiv_id"],"state":"failed",
                                "error_class":type(exc).__name__})
    finally:
        db.close()
    indexed=[x for x in details if x["state"]=="fulltext-indexed"]
    report={"state":"real-rights-verified-multidocument-corpus-not-model-trained",
            "generated_utc":datetime.now(timezone.utc).isoformat(),
            "date_window":[start_date,end_date],
            **harvest_info,
            "licensed_fulltexts_downloaded_and_indexed":len(indexed),
            "real_fulltext_chunks":sum(x["chunks"] for x in indexed),
            "real_fulltext_characters":sum(x["characters"] for x in indexed),
            "fulltext_download_failures":len(details)-len(indexed),
            "papers":details,"llm_optimizer_steps":0,"checkpoint_created":False,
            "rights_policy":"official arXiv OAI-PMH per-paper CC0 or CC BY only",
            "licence_priority_is_not_citation_weight":True}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("REAL_MULTIDOC_CORPUS_COUNTS",json.dumps({
        "licensed_metadata":len(rows),"verified_fulltexts":len(indexed),
        "chunks":report["real_fulltext_chunks"]},ensure_ascii=False),flush=True)
    if len(indexed)<3:
        raise RuntimeError("FEWER_THAN_THREE_REAL_LICENSED_FULLTEXT_DOCUMENTS")
    return report

def main(argv=None):
    p=argparse.ArgumentParser(description="Actual official arXiv licensed metadata + real PDF multi-corpus")
    p.add_argument("--output",required=True,type=Path)
    p.add_argument("--from-date",default="2026-10-12")
    p.add_argument("--until-date",default="2026-10-20")
    p.add_argument("--licensed-target",type=int,default=100)
    p.add_argument("--pdf-cap",type=int,default=8)
    p.add_argument("--max-pages",type=int,default=8)
    p.add_argument("--delay",type=float,default=3.1)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"status":"dry-run","license_candidates":0,"real_fulltexts":0,
                          "optimizer_steps":0}))
        return 0
    print(json.dumps(execute(a.output,a.from_date,a.until_date,a.licensed_target,
                             a.pdf_cap,a.max_pages,a.delay),ensure_ascii=False))
    return 0

if __name__=="__main__":sys.exit(main())
