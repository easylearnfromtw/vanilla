#!/usr/bin/env python3
"""柳岸書城 100 *real complete* historical books, not 100 fake title rows.

Bounded external source: prepackaged, independently hosted Gutenberg-derived
parquet shards on Hugging Face, never robot Project Gutenberg's main website.

Rights: deterministic *candidate* screening (original-English historical authors,
death <=1950), NOT operator legal approval, NOT training authorization. No
synthetic fulltexts. Store real chunk hashes, DOI-free original Gutenberg URLs.
Private staging index is not allowed into Qwen CUDA training before review.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit

from licensed_content import chunks

DATASET="nandhakumarms/qualc-gutenberg-en"
SHARD_COUNT=8
TARGET=100
MIN_CHARS=25000
MAX_CHARS=1_500_000
MAX_SHARD_BYTES=340_000_000
MAX_TOTAL_SOURCE_BYTES=2_800_000_000

# Conservative original-English authors, with year of death. They are not
# claims about a particular *edition*, preface, translation or illustration.
# E.g. older medical views in these texts are not modern medical evidence.
SURNAMES = """
austen:jane:1817
dickens:charles:1870
bronte:charlotte:1855
bronte:emily:1848
bronte:anne:1849
gaskell:elizabeth:1865
eliot:george:1880
trollope:anthony:1882
hardy:thomas:1928
collins:wilkie:1889
thackeray:william:1863
shelley:mary:1851
coleridge:samuel:1834
wordsworth:william:1850
shelley:percy:1822
byron:george:1824
keats:john:1821
poe:edgar:1849
hawthorne:nathaniel:1864
melville:herman:1891
whitman:walt:1892
dickinson:emily:1886
alcott:louisa:1888
twain:mark:1910
clemens:samuel:1910
james:henry:1916
crane:stephen:1900
london:jack:1916
stoker:bram:1912
wilde:oscar:1900
doyle:arthur:1930
stevenson:robert:1894
kipling:rudyard:1936
wells:h:1946
conrad:joseph:1924
lawrence:d:1930
woolf:virginia:1941
forster:e:1970
joyce:james:1941
chesterton:g:1936
baum:l:1919
carroll:lewis:1898
dodgson:charles:1898
montgomery:l:1942
burnett:frances:1924
potter:beatrix:1943
grahame:kenneth:1932
barrie:j:1937
wharton:edith:1937
shaw:george:1950
sewell:anna:1878
hovey:richard:1900
howells:william:1920
browning:robert:1889
browning:elizabeth:1861
tennyson:alfred:1892
scott:walter:1832
irving:washington:1859
cooper:james:1851
lowell:james:1891
longfellow:henry:1882
holmes:oliver:1894
emerson:ralph:1882
thoreau:henry:1862
carlyle:thomas:1881
ruskin:john:1900
smith:adam:1790
ricardo:david:1823
malthus:thomas:1834
mill:john:1873
jevons:william:1882
marshall:alfred:1924
bagehot:walter:1877
veblen:thorstein:1929
keynes:john:1946
george:henry:1897
spencer:herbert:1903
bacon:francis:1626
locke:john:1704
hobbes:thomas:1679
berkeley:george:1753
hume:david:1776
darwin:charles:1882
huxley:thomas:1895
wallace:alfred:1913
faraday:michael:1867
maxwell:james:1879
babbage:charles:1871
nightingale:florence:1910
osler:william:1919
smiles:samuel:1904
franklin:benjamin:1790
jefferson:thomas:1826
douglass:frederick:1895
washington:booker:1915
du bois:w:1963
dewey:john:1952
james:william:1910
montessori:maria:1952
keller:helen:1968
paine:thomas:1809
hamilton:alexander:1804
adams:john:1826
adams:henry:1918
burke:edmund:1797
gibbon:edward:1794
macaulay:thomas:1859
pater:walter:1894
stephen:leslie:1904
lewis:sinclair:1951
lamb:charles:1834
goldsmith:oliver:1774
swift:jonathan:1745
defoe:daniel:1731
richardson:samuel:1761
fielding:henry:1754
stern:laurence:1768
sterne:laurence:1768
addison:joseph:1719
steele:richard:1729
johnson:samuel:1784
boswell:james:1795
marryat:frederick:1848
kingsley:charles:1875
kingsley:henry:1876
reade:charles:1884
blackmore:r:1900
haggard:h:1925
orczy:baroness:1947
green:anna:1935
christie:agatha:1976
saki:h:1916
munro:hector:1916
jerome:jerome:1927
buchan:john:1940
bennett:arnold:1931
galsworthy:john:1933
gissing:george:1903
macdonald:george:1905
nesbit:e:1924
lang:andrew:1912
stevenson:robert:1894
barrie:james:1937
morris:william:1896
bellamy:edward:1898
sinclair:upton:1968
"""
# Remove any author whose latest work may carry nonhistorical rights: this is a
# candidate index, not a claim of training approval.
AUTHOR={ (surname,first):int(year) for surname,first,year in
         (line.split(":") for line in SURNAMES.splitlines() if line.strip()) }
NONFICTION=re.compile(r"\b(econom|wealth|capital|bank|money|trade|stock exchange|politic|commerce|industry|"
  r"science|electric|philosoph|psycholog|sociolog|education|democra|medical|medicine|"
  r"finance|natural history|technology|physic|biolog|evolution|health|ethic|logic|"
  r"law|journal|history|political economy|social question|progress|labor|labour)",re.I)
EXCLUDE=re.compile(r"\b(translation|translated|modernized|abridg|adapted|editor|revision|compilation)\b",re.I)


def tidy(raw):
    return re.sub(r"[^a-z0-9]+"," ",unicodedata.normalize("NFKD",str(raw)).casefold()).strip()


def author_death(raw):
    clean=str(raw).casefold()
    if "," not in clean:return None
    surname,rest=clean.split(",",1)
    name=tidy(surname)
    given=tidy(rest)
    first=given.split(" ",1)[0] if given else ""
    return AUTHOR.get((name,first))


def book_row(row):
    if not isinstance(row,dict):return None
    try:
        ident=int(row.get("id"))
    except (ValueError,TypeError):return None
    if not 1<=ident<=999999:return None
    author=str(row.get("author") or "")
    death=author_death(author)
    if death is None or death>1950:return None
    if row.get("language")!="en":return None
    title=row.get("title")
    body=row.get("text")
    if not isinstance(title,str) or not 5<=len(title)<=300 or not isinstance(body,str):
        return None
    if EXCLUDE.search(title):return None
    if re.search(r"^\s*index of\b|\bindex of the project gutenberg\b",title,re.I):return None
    if not MIN_CHARS<=len(body)<=MAX_CHARS:return None
    # Reject partial snippet, unreadable/corrupt/OCR-only text and duplicate hash.
    if body.count(" ")<2500 or "\ufffd" in body or len(tidy(body[:2000]))<300:
        return None
    sha=hashlib.sha256(body.encode("utf-8")).hexdigest()
    return {"id":"pg_"+str(ident),"gutenberg_id":ident,"title":title.strip(),
       "author":author.strip(),"author_death_year":death,
       "source_url":"https://www.gutenberg.org/ebooks/"+str(ident),
       "dataset_source":"https://huggingface.co/datasets/"+DATASET,
       "text_sha256":sha,"text_length":len(body),
       "category":"historical_topic_keyword_match" if NONFICTION.search(title) else "historical_other",
       "rights_status":"jurisdiction-and-edition-review-required",
       "training_permission":False,"body":body}


def stable_select(rows,limit=TARGET):
    by_title={}
    seen_sha=set()
    for row in rows:
        book=book_row(row)
        if book is None:continue
        title_key=tidy(book["title"])
        if title_key in by_title or book["text_sha256"] in seen_sha:continue
        by_title[title_key]=book
        seen_sha.add(book["text_sha256"])
    # Choose longform nonfiction first but ensure breadth and no author monopoly.
    ordered=sorted(by_title.values(),key=lambda b:(
      0 if b["category"]=="historical_topic_keyword_match" else 1,
      b["author"],b["gutenberg_id"]))
    picked=[]
    counts=Counter()
    for b in ordered:
        key=tidy(b["author"])
        if counts[key]>=6:continue
        counts[key]+=1
        picked.append(b)
        if len(picked)>=limit:break
    return picked


def shard_url(index):
    if not 0<=index<SHARD_COUNT:raise ValueError("SHARD_OUT_OF_BOUNDS")
    return ("https://huggingface.co/datasets/"+DATASET+"/resolve/main/data/"
            f"train-{index:05d}-of-{SHARD_COUNT:05d}.parquet")


def fetch_shard(index,folder):
    path=folder/f"train-{index:05d}.parquet"
    request=urllib.request.Request(shard_url(index),
        headers={"User-Agent":"Atuber-Liuan-PublicDomain-Candidate-Index/1.0"})
    redirect_limit=5
    class Restrict(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):
            nonlocal redirect_limit
            redirect_limit-=1
            host=urllib.parse.urlsplit(newurl).hostname or ""
            if redirect_limit<0 or not host.endswith((".huggingface.co",".hf.co",".xethub.hf.co")):
                # HF serves large parquet shards from xet CDN; no arbitrary redirect.
                raise ValueError("UNAPPROVED_DATASET_REDIRECT")
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    opener=urllib.request.build_opener(Restrict())
    size=0
    with opener.open(request,timeout=120) as resp, path.open("wb") as out:
        while True:
            chunk=resp.read(1024*1024)
            if not chunk:break
            size+=len(chunk)
            if size>MAX_SHARD_BYTES:
                raise ValueError("PARQUET_SHARD_TOO_LARGE")
            out.write(chunk)
    if size<1_000_000:raise ValueError("PARQUET_SHARD_UNEXPECTEDLY_SMALL")
    return path,size


def iter_rows(parquet_path):
    try:import pyarrow.parquet as pq
    except ImportError as exc:raise RuntimeError("PYARROW_REQUIRED_FOR_REAL_BOOK_CORPUS") from exc
    file=pq.ParquetFile(parquet_path)
    required={"id","title","author","language","text"}
    if not required.issubset(file.schema_arrow.names):
        raise ValueError("DATASET_SCHEMA_MISSING_REAL_BOOK_COLUMNS")
    for group in file.iter_batches(batch_size=48,columns=sorted(required)):
        for row in group.to_pylist():
            yield row


def index_real_books(books,index,catalog_json,report_json,shards,bytes_downloaded):
    if index.exists() or catalog_json.exists() or report_json.exists():
        raise ValueError("NO_OVERWRITE_EXISTING_100BOOK_INDEX")
    if len(books)<TARGET:
        raise ValueError("FEWER_THAN_100_VERIFIED_REAL_BOOKS")
    index.parent.mkdir(parents=True,exist_ok=True)
    conn=sqlite3.connect(index)
    try:
        conn.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE books(id TEXT PRIMARY KEY,title TEXT,author TEXT,source_url TEXT,
          content_sha256 TEXT,rights_basis TEXT,rights_reference TEXT,reviewer TEXT,
          author_death_year INTEGER,topic TEXT);
        CREATE TABLE chunks(id TEXT PRIMARY KEY,book_id TEXT NOT NULL,position INTEGER,
          body TEXT NOT NULL,body_sha256 TEXT NOT NULL,FOREIGN KEY(book_id) REFERENCES books(id));
        CREATE INDEX chunks_by_book ON chunks(book_id);
        CREATE VIRTUAL TABLE content_fts USING fts5(body,chunk_id UNINDEXED,tokenize='trigram');
        """)
        chunks_count=0
        catalogue=[]
        with conn:
            for book in books:
                id=book["id"]
                conn.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?,?)",(
                   id,book["title"],book["author"],book["source_url"],book["text_sha256"],
                   "rights-review-required",
                   "Historical public-domain author candidate (death <=1950); exact edition, additions and jurisdiction require review",
                   "automated candidate screening; NOT rights-approved",
                   book["author_death_year"],book["category"]))
                for pos,txt in chunks(book["body"],size=1350,overlap=130):
                    cid="ch_"+hashlib.sha256(f"{id}:{pos}".encode()).hexdigest()[:22]
                    digest=hashlib.sha256(txt.encode("utf-8")).hexdigest()
                    conn.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",
                                 (cid,id,pos,txt,digest))
                    conn.execute("INSERT INTO content_fts VALUES(?,?)",(txt,cid))
                    chunks_count+=1
                catalogue.append({k:v for k,v in book.items() if k!="body"})
        title_urls=len({r["source_url"] for r in catalogue})
        book_length=sum(x["text_length"] for x in catalogue)
        if title_urls!=len(books) or chunks_count<1000:
            raise ValueError("REAL_BOOK_INTEGRITY_CHECK_FAILED")
        catalog_json.write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        report={
          "status":"100-real-books-fulltext-staging-index-not-Qwen-finetuned",
          "target":TARGET,"real_books_indexed":len(books),"distinct_gutenberg_ids":title_urls,
          "actual_fulltext_chunks":chunks_count,"source_text_characters":book_length,
          "historical_topic_keyword_matches":sum(b["category"]=="historical_topic_keyword_match" for b in books),
          "historical_other_books":sum(b["category"]=="historical_other" for b in books),
          "shards_processed":shards,"bytes_downloaded":bytes_downloaded,
          "copyright_training_grant":"NOT VERIFIED - PUBLIC DOMAIN ORIGINAL AUTHOR IS NOT AN EDITION/COUNTRY/LICENSE REVIEW",
          "fully_rights_approved_for_neural_training":0,
          "qwen_optimizer_steps":0,
          "not_modern_professional_advice":True,
          "catalogue_source":"https://huggingface.co/datasets/"+DATASET,
          "generated_utc":datetime.now(timezone.utc).isoformat()
        }
        report_json.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        return report
    except BaseException:
        conn.close()
        index.unlink(missing_ok=True)
        raise
    finally:conn.close()


def perform(index,catalog_json,report_json,target=TARGET,max_shards=8):
    if target!=TARGET or not 1<=max_shards<=SHARD_COUNT:
        raise ValueError("TARGET_100_AND_BOUNDED_SHARD_COUNT_REQUIRED")
    import urllib.parse
    rows=[]
    total=0
    sha_report=[]
    with tempfile.TemporaryDirectory(prefix="liuan-historical-") as temp:
        for shard in range(max_shards):
            file,nbytes=fetch_shard(shard,Path(temp))
            total+=nbytes
            if total>MAX_TOTAL_SOURCE_BYTES:raise ValueError("EXCESSIVE_DATASET_DOWNLOAD")
            sha_report.append({"shard":shard,"sha256":hashlib.sha256(file.read_bytes()).hexdigest(),
                               "bytes":nbytes})
            for row in iter_rows(file):
                candidate=book_row(row)
                if candidate:
                    rows.append(row)
            file.unlink()
            if len(stable_select(rows))>=target:
                break
    books=stable_select(rows,limit=target)
    result=index_real_books(books,index,catalog_json,report_json,sha_report,total)
    return result


def main(argv=None):
    p=argparse.ArgumentParser(description="100 real historical fulltexts, staged with source + rights review")
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--catalog",type=Path,required=True)
    p.add_argument("--report",type=Path,required=True)
    p.add_argument("--max-shards",type=int,default=8)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"status":"dry-run","books_read":0,"network_requests":0,"trained":False}))
        return 0
    print(json.dumps(perform(a.index,a.catalog,a.report,max_shards=a.max_shards),indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
