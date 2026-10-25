#!/usr/bin/env python3
"""Two-book opt-in public-domain source pilot for *content retrieval*, not LLM weights.

Exact Project Gutenberg URLs, only two GETs, no OPAC crawling or redistributed
book corpus. Retain original Gutenberg notices and require operator --execute.
US public-domain metadata plus historical original/translator dates are documented;
other jurisdictions/editions still require separate rights checks.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from licensed_content import build, evidence

SOURCES=(
    {"id":"smith_wealth_nations_1776","ebook":3300,
     "title":"An Inquiry into the Nature and Causes of the Wealth of Nations",
     "author":"Adam Smith",
     "url":"https://www.gutenberg.org/cache/epub/3300/pg3300.txt",
     "license_note":"PG original English 1776, author died 1790; US public-domain classification"},
    {"id":"machiavelli_prince_marriott_1908","ebook":1232,
     "title":"The Prince (W. K. Marriott English translation)",
     "author":"Niccolò Machiavelli / W. K. Marriott",
     "url":"https://www.gutenberg.org/cache/epub/1232/pg1232.txt",
     "license_note":"PG original 16th c; Marriott English translator died 1927; US public-domain classification"},
)
LIMIT=5_000_000


class OnlyOfficialRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        url=urllib.parse.urlsplit(newurl)
        if url.scheme!="https" or url.hostname not in {"www.gutenberg.org","gutenberg.org"}:
            raise ValueError("UNAPPROVED_CONTENT_REDIRECT")
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def download_once(url:str)->bytes:
    opener=urllib.request.build_opener(OnlyOfficialRedirects())
    request=urllib.request.Request(url,headers={
        "User-Agent":"Atuber-Small-Public-Domain-Research-Pilot/1.0",
        "Accept":"text/plain"})
    try:
        with opener.open(request,timeout=90) as response:
            raw=response.read(LIMIT+1)
    except urllib.error.HTTPError as exc:
        raise RuntimeError("BOOK_SOURCE_HTTP_"+str(exc.code)) from None
    except urllib.error.URLError:
        raise RuntimeError("BOOK_SOURCE_UNREACHABLE") from None
    if not 20_000<=len(raw)<=LIMIT:
        raise ValueError("BOOK_FULL_TEXT_SIZE_INVALID")
    decoded=raw.decode("utf-8-sig")
    if "PROJECT GUTENBERG" not in decoded.upper() or "*** START" not in decoded.upper():
        raise ValueError("NOT_VERIFIED_GUTENBERG_TEXT")
    return raw


def run(target:Path)->dict:
    if target.exists():
        raise ValueError("REFUSE_OVERWRITE_PILOT_DIRECTORY")
    target.mkdir(parents=True)
    try:
        text_root=target/"books"
        text_root.mkdir()
        manifest=[]
        for row in SOURCES:
            body=download_once(row["url"])
            name=row["id"]+".txt"
            (text_root/name).write_bytes(body)
            manifest.append({
                "id":row["id"],"title":row["title"],"author":row["author"],
                "source_url":row["url"],"content_file":name,
                "content_sha256":hashlib.sha256(body).hexdigest(),
                "rights_basis":"compatible-license",
                "rights_reference":row["license_note"]+"; "+
                        "https://www.gutenberg.org/policy/license; no redistribution in CI",
                "reviewer":"Atuber documented source audit",
                "rights_reviewed":True,"training_permission":True,
            })
        source_manifest=target/"approved_pilot_manifest.json"
        source_manifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        result=build(text_root,source_manifest,target/"approved_content.sqlite3")
        economics=evidence(target/"approved_content.sqlite3","division of labour",5)
        philosophy=evidence(target/"approved_content.sqlite3","virtue",5)
        summary={"state":"two-public-domain-book-content-indexed-not-llm-trained",
                 "books_indexed":result["book_count"],
                 "chunks_indexed":result["content_chunks"],
                 "econ_search_has_evidence":bool(economics["evidence"]),
                 "philosophy_search_has_evidence":bool(philosophy["evidence"]),
                 "source_ids":[x["id"] for x in manifest],
                 "book_text_copyright_scope":"USA public-domain per PG; Taiwan rights require edition review",
                 "model_gradient_updates":0,"llm_weight_updates":0,
                 "corpus_persisted_on_website":False,
                 "source_sha256":{x["id"]:x["content_sha256"] for x in manifest}}
        (target/"pilot_report.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        if not summary["econ_search_has_evidence"] or not summary["philosophy_search_has_evidence"]:
            raise ValueError("PILOT_CONTENT_RETRIEVAL_VALIDATION_FAILED")
        return summary
    except BaseException:
        shutil.rmtree(target)
        raise


def main(argv=None)->int:
    p=argparse.ArgumentParser(description="Opt-in two public-domain book retrieval pilot, not neural training")
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"state":"dry-run","sources":[x["url"] for x in SOURCES],
                          "network_requests":0,"books_read":0,"llm_weights_updated":False}))
        return 0
    print(json.dumps(run(a.output),ensure_ascii=False,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
