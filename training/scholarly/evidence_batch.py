#!/usr/bin/env python3
"""Real 100-work OpenAlex VANILLA Evidence batch, explicitly metadata-only.

The OpenAlex API is used for *real* work IDs, authors and source metadata.
100 score calculations are not language-model weight updates or 100 PDFs read.
No open access claim is made from a metadata search hit.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, sys, urllib.parse, urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

WORK_ID=re.compile(r"^https://openalex\.org/(W\d+)$")
AUTHOR_ID=re.compile(r"^https://openalex\.org/(A\d+)$")
ORCID=re.compile(r"^https://orcid\.org/\d{4}-\d{4}-\d{4}-[\dx]{4}$",re.I)
DOI=re.compile(r"^(?:https://doi.org/)?10\.\d{4,9}/\S+$",re.I)
TARGET=100

def parse_work(item: dict)->dict:
    match=WORK_ID.fullmatch(str(item.get("id") or ""))
    if not match or not str(item.get("title") or "").strip():
        raise ValueError("UNVERIFIED_OPENALEX_WORK")
    authors=[]
    for authored in item.get("authorships") or []:
        p=authored.get("author") or {}
        if not AUTHOR_ID.fullmatch(str(p.get("id") or "")):continue
        name=str(p.get("display_name") or "").strip()
        if len(name)<2:continue
        orcid=str(p.get("orcid") or "")
        authors.append({"name":name[:120],"id":p["id"],"orcid":orcid if ORCID.fullmatch(orcid) else None})
    source=((item.get("primary_location") or {}).get("source") or {})
    source_name=str(source.get("display_name") or "").strip()[:160]
    doi=str(item.get("doi") or "").strip()
    if doi.startswith("https://doi.org/"):doi=doi[16:]
    if not DOI.fullmatch(doi):doi=""
    year=item.get("publication_year")
    integrity=(10 if len(item["title"].strip())>=6 else 0)+(5 if type(year)==int and 1800<year<2200 else 0)+\
        (5 if item.get("type") else 0)+(5 if (item.get("referenced_works_count") or 0)>0 else 0)
    provenance=12+(12 if doi else 0)+(6 if source_name else 0)
    author_id=8+(5 if authors and authors[0]["orcid"] else 0) if authors else 0
    score=min(80,provenance+integrity+author_id)
    retracted=item.get("is_retracted") is True
    if retracted:score=0
    level="R" if retracted else "A" if score>=70 else "B" if score>=55 else "C" if score>=35 else "D"
    return {"id":"VE-OA-"+match[1],"openalex_id":item["id"],
            "title":str(item["title"])[:600],"doi":doi or None,"publication_year":year,
            "source_name":source_name or None,"authors":authors[:20],
            "rating":{"model":"VE-1.0","score":score,"max_score":100,"level":level,
                      "verification":"retracted" if retracted else "metadata-only",
                      "provenance":provenance,"record_integrity":integrity,
                      "author_identity":author_id,"author_footprint":0,
                      "not_a_measure_of_scientific_correctness":True},
            "citation_weight":1,"citation_weight_basis":"rankings-not-supplied",
            "article_source":item["id"],"rights_approved_fulltext":False,
            "fulltext_read":False,"llm_weight_updates":0}

def build_records(input_data:dict,expected=TARGET)->list[dict]:
    if not isinstance(input_data,dict) or not isinstance(input_data.get("results"),list):
        raise ValueError("OPENALEX_RESULTS_INVALID")
    rows=[];seen=set()
    for item in input_data["results"]:
        if not isinstance(item,dict):continue
        try:row=parse_work(item)
        except ValueError:continue
        if row["id"] in seen:continue
        rows.append(row);seen.add(row["id"])
    if len(rows)<expected:raise ValueError(f"REAL_WORK_COUNT_{len(rows)}_BELOW_{expected}")
    return rows[:expected]

def fetch_100(query:str)->dict:
    params={"search":query[:150],"per-page":"100",
            "select":"id,doi,title,publication_year,authorships,primary_location,type,referenced_works_count,is_retracted"}
    key=os.getenv("OPENALEX_API_KEY","").strip()
    if key:params["api_key"]=key
    url="https://api.openalex.org/works?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"VanillaEvidence/1.0 (owner batch)"})
    with urllib.request.urlopen(req,timeout=45) as response:
        if urllib.parse.urlsplit(response.geturl()).hostname!="api.openalex.org":
            raise ValueError("OPENALEX_REDIRECT_UNTRUSTED")
        raw=response.read(7_000_001)
    if len(raw)>7_000_000:raise ValueError("BATCH_TOO_LARGE")
    return json.loads(raw)

def run(output:Path,query:str)->dict:
    rows=build_records(fetch_100(query))
    targets=[output.with_suffix(".evidence.jsonl"),output.with_suffix(".report.json")]
    if any(x.exists() for x in targets):raise ValueError("REFUSE_OVERWRITE")
    for p in targets:p.parent.mkdir(parents=True,exist_ok=True)
    with targets[0].open("x",encoding="utf-8") as stream:
        for row in rows:stream.write(json.dumps(row,ensure_ascii=False)+"\n")
    check=hashlib.sha256(targets[0].read_bytes()).hexdigest()
    report={"state":"100-real-OpenAlex-Evidence-metadata-profiles-scored-not-trained",
            "timestamp_utc":datetime.now(timezone.utc).isoformat(),
            "real_unique_articles_scored":len(rows),
            "unique_evidence_ids":len({x["id"] for x in rows}),
            "author_profiles_indexed":sum(len(x["authors"]) for x in rows),
            "unique_authors":len({a["id"] for x in rows for a in x["authors"]}),
            "score_levels":dict(Counter(x["rating"]["level"] for x in rows)),
            "rating_method":"VE-1.0 metadata traceability and author disambiguation",
            "score_dataset_sha256":check,"licensed_fulltexts_new":0,
            "fulltexts_read":0,"gpu_optimizer_steps":0,"llm_weight_updates":0}
    targets[1].write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report

def main():
    parser=argparse.ArgumentParser(description="100 real sourced OpenAlex article Evidence cards")
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--query",default="machine learning")
    parser.add_argument("--execute",action="store_true")
    a=parser.parse_args()
    if len(a.query)<2 or len(a.query)>150:parser.error("invalid search query")
    if not a.execute:
        print(json.dumps({"status":"dry-run","real_articles_scored":0,"llm_updates":0}))
        return 0
    print(json.dumps(run(a.output,a.query),ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":sys.exit(main())
