#!/usr/bin/env python3
"""霞海書院 / OpenAlex limited, source-grounded research metadata index.

Never treat open access as permission for LLM weight training; never store a
third-party abstract or copyrighted PDF in this metadata database. University
priority weights require a separately audited ranking snapshot.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ALLOWED_HOSTS={"api.openalex.org"}
RANGES=((100,5),(300,4),(500,3),(700,2))
DEFAULT_QUERIES=("behavioral economics consumer decisions",
                 "financial literacy decision making",
                 "shared decision making evidence")


def priority(rank=None,authority_reviewed=False):
    if authority_reviewed:return 5
    if isinstance(rank,bool) or not isinstance(rank,int) or rank<1:return 1
    return next((w for cutoff,w in RANGES if rank<=cutoff),1)


def safe_url(candidate):
    if not isinstance(candidate,str) or len(candidate)>1500:return ""
    parts=urllib.parse.urlsplit(candidate)
    return candidate if parts.scheme=="https" and parts.hostname and not parts.username and not parts.password else ""


def validate_research_record(work):
    if not isinstance(work,dict):return None
    oid=work.get("id")
    if not isinstance(oid,str) or not re.fullmatch(r"https://openalex.org/W[0-9]+",oid):return None
    title=work.get("display_name")
    if not isinstance(title,str) or not 5<=len(title)<=1000:return None
    authorships=work.get("authorships")
    authors=[]
    institutions=[]
    if isinstance(authorships,list):
        for row in authorships[:30]:
            if not isinstance(row,dict):continue
            author=row.get("author") or {}
            if isinstance(author,dict) and isinstance(author.get("display_name"),str):
                authors.append(author["display_name"][:180])
            for inst in row.get("institutions") or []:
                if isinstance(inst,dict) and isinstance(inst.get("display_name"),str):
                    institutions.append(inst["display_name"][:180])
    loc=work.get("primary_location") or {}
    if not isinstance(loc,dict):loc={}
    publisher=loc.get("source") or {}
    if not isinstance(publisher,dict):publisher={}
    doi=safe_url(work.get("doi")) or ""
    url=doi or safe_url(loc.get("landing_page_url")) or oid
    return {
        "id":oid.rsplit("/",1)[-1],"title":title,"authors":authors[:8],
        "institution_names":list(dict.fromkeys(institutions))[:15],
        "year":work.get("publication_year") if isinstance(work.get("publication_year"),int) else None,
        "doi_url":doi,"source_url":url,"original_provider":"OpenAlex",
        "publication_source":str(publisher.get("display_name") or "Unknown")[:220],
        "has_abstract_metadata":bool(work.get("abstract_inverted_index")),
        "open_access":bool((work.get("open_access") or {}).get("is_oa")),
        "evidence_scope":"bibliographic-metadata-abstract-availability-not-research-findings",
        "institution_rank":None,"citation_weight":1,"reviewed_findings":False,
        "training_approved":False,
    }


def fetch_openalex(query,per_page=10):
    if not isinstance(query,str) or not 3<=len(query)<=130 or not 1<=per_page<=25:
        raise ValueError("BOUNDED_RESEARCH_QUERY_REQUIRED")
    url="https://api.openalex.org/works?search.title_and_abstract="+urllib.parse.quote(query,safe="")+"&per_page="+str(per_page)+"&filter=type:article"
    request=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"Atuber-Xiahai-Academic-Source-Index/1.0"})
    class SameHost(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):
            loc=urllib.parse.urlsplit(newurl)
            if loc.scheme!="https" or loc.hostname not in ALLOWED_HOSTS:
                raise ValueError("UNTRUSTED_OPENALEX_REDIRECT")
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    try:
        with urllib.request.build_opener(SameHost()).open(request,timeout=35) as response:
            raw=response.read(2_000_001)
    except urllib.error.HTTPError as exc:
        raise RuntimeError("OPENALEX_HTTP_"+str(exc.code)) from None
    except urllib.error.URLError:
        raise RuntimeError("OPENALEX_UNREACHABLE") from None
    if len(raw)>2_000_000:
        raise ValueError("OPENALEX_METADATA_OVER_LIMIT")
    data=json.loads(raw)
    if not isinstance(data,dict) or not isinstance(data.get("results"),list):
        raise ValueError("OPENALEX_RESPONSE_SCHEMA_INVALID")
    return [v for row in data["results"] if (v:=validate_research_record(row))]


def build_index(records,out):
    if out.exists():raise ValueError("REFUSE_OVERWRITE_PAPER_DATABASE")
    out.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(out)
    try:
        db.executescript("""
          CREATE TABLE papers(
            id TEXT PRIMARY KEY,title TEXT NOT NULL,authors_json TEXT,year INTEGER,
            doi_url TEXT,source_url TEXT,source_name TEXT,institutions_json TEXT,
            evidence_scope TEXT,citation_weight INTEGER,training_approved INTEGER);
          CREATE VIRTUAL TABLE papers_fts USING fts5(title,paper_id UNINDEXED);
        """)
        count=0
        with db:
            for x in records:
                if not x or not safe_url(x.get("source_url")):continue
                if db.execute("SELECT 1 FROM papers WHERE id=?",(x["id"],)).fetchone():continue
                db.execute("INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?)",(
                    x["id"],x["title"],json.dumps(x["authors"],ensure_ascii=False),
                    x["year"],x["doi_url"],x["source_url"],x["publication_source"],
                    json.dumps(x["institution_names"],ensure_ascii=False),
                    x["evidence_scope"],x["citation_weight"],int(x["training_approved"])))
                db.execute("INSERT INTO papers_fts VALUES(?,?)",(x["title"],x["id"]))
                count+=1
        report={"status":"paper-metadata-indexed-not-fulltext-trained",
                "papers":count,"rights_approved_fulltext":0,"reviewed_finding_count":0,
                "language_model_updates":0,"weight_policy":"rank 1-100=5, 101-300=4, 301-500=3, 501-700=2, else 1; unverified=1",
                "source":"OpenAlex","retrieval_only":True}
        out.with_suffix(".report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        return report
    finally:db.close()


def search(index,q,limit=8):
    if not index.is_file() or not q.strip() or not 1<=limit<=15:raise ValueError("INDEX_QUERY_REQUIRED")
    db=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        pat="%"+q.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%"
        rows=db.execute("""SELECT id,title,authors_json,year,doi_url,source_url,source_name,
          institutions_json,evidence_scope,citation_weight
          FROM papers WHERE title LIKE ? ESCAPE '\\' LIMIT ?""",(pat,limit)).fetchall()
    finally:db.close()
    return [{"id":id,"title":title,"authors":json.loads(authors),"year":year,"doi":doi,
       "original_url":url,"publisher":source,"institution_names":json.loads(inst),
       "tier":tier,"priority":weight,"brand":"霞海書院","fulltext_approved":False}
       for id,title,authors,year,doi,url,source,inst,tier,weight in rows]


def markdown_cards(rows):
    items=[{"paper_id":r["id"],"title":r["title"],"authors":r["authors"],
            "year":r["year"],"doi":r["doi"],"source_url":r["original_url"],
            "publisher":r["publisher"],"evidence_scope":"metadata-only","priority":r["priority"]}
           for r in rows]
    return "~~~paperrefs\n"+json.dumps({"protocol":"xiahai-paperrefs-v1",
      "origin":"openalex-metadata-reviewed","papers":items},ensure_ascii=False)+"\n~~~"


def main(argv=None):
    p=argparse.ArgumentParser(description="Xiahai / OpenAlex limited metadata retrieval")
    p.add_argument("--query",default="");p.add_argument("--per-page",type=int,default=10)
    p.add_argument("--index",type=Path);p.add_argument("--output",type=Path)
    p.add_argument("--search-index",action="store_true")
    p.add_argument("--markdown-cards",action="store_true")
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if a.search_index:
        if not a.index:p.error("--index required")
        data=search(a.index,a.query)
        print(markdown_cards(data) if a.markdown_cards else json.dumps(data,ensure_ascii=False,indent=2))
        return 0
    if not a.execute:
        print(json.dumps({"status":"dry-run","network_calls":0,"trained":False}))
        return 0
    if not a.output:p.error("--output required")
    records=fetch_openalex(a.query or DEFAULT_QUERIES[0],a.per_page)
    print(json.dumps(build_index(records,a.output),ensure_ascii=False,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
