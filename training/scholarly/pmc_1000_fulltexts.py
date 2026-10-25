#!/usr/bin/env python3
"""1000 ACTUAL PMC OA scholarly article bodies -> rights-filtered SQLite FTS/RAG.

Uses the NLM-authorized OAI-PMH ListRecords API, not scraped HTML or abstracts.
Only exact CC BY and CC0 URLs are admitted. Data remain research evidence
candidates, not peer-reviewed knowledge claims or automatic Qwen training.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

API="https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/"
TARGET=1000
MAX_PAGES=550  # 10 XML articles per request, must fail if insufficient.
MIN_BODY_CHARS=4800
MAX_ARTICLE_CHARS=600_000
MAX_RESPONSE_BYTES=35_000_000
OAI="{http://www.openarchives.org/OAI/2.0/}"
XLINK="{http://www.w3.org/1999/xlink}"
ACCEPT_LICENSES={
 "https://creativecommons.org/licenses/by/4.0/":"cc-by-4.0",
 "https://creativecommons.org/licenses/by/3.0/":"cc-by-3.0",
 "https://creativecommons.org/publicdomain/zero/1.0/":"cc0-1.0"
}

def local(tag):
 return tag.rsplit("}",1)[-1].lower()

def tagged(node,name):
 return next((x for x in node.iter() if local(x.tag)==name),None)

def children(node,name):
 return [x for x in node.iter() if local(x.tag)==name]

def text(node):
 return re.sub(r"\s+"," ","".join(node.itertext())).strip() if node is not None else ""

def license_url(article):
 permissions=next((x for x in list(article) if local(x.tag)=="front"),None)
 if permissions is None:return None
 perm=tagged(permissions,"permissions")
 if perm is None:return None
 for license_node in children(perm,"license"):
  href=(license_node.get(XLINK+"href") or license_node.get("href") or "").strip().lower()
  canonical=href.split("?",1)[0].rstrip("/")+"/"
  if canonical in ACCEPT_LICENSES:
   return {"license":ACCEPT_LICENSES[canonical],"license_url":canonical}
 return None

def paper_data(article):
 if local(article.tag)!="article":return None
 lic=license_url(article)
 if not lic:return None
 front=tagged(article,"front")
 if front is None:return None
 meta=tagged(front,"article-meta")
 if meta is None:return None
 ident=""
 doi=""
 for item in children(meta,"article-id"):
  val=text(item)
  kind=item.get("pub-id-type","").lower()
  if kind in ("pmc","pmcid") and re.fullmatch(r"(?:PMC)?[0-9]{5,12}",val):
   ident="PMC"+val.removeprefix("PMC")
  if kind=="doi" and val and len(val)<200:
   doi=val
 if not re.fullmatch(r"PMC[0-9]{5,12}",ident):return None
 title=text(tagged(meta,"article-title"))
 if not 12<=len(title)<=650:return None
 body=next((x for x in list(article) if local(x.tag)=="body"),None)
 if body is None:return None
 paras=[]
 for p in children(body,"p"):
  paragraph=text(p)
  if len(paragraph)>=38:
   paras.append(paragraph)
 if len(paras)<12:return None
 entire="\n\n".join(paras)
 if not MIN_BODY_CHARS<=len(entire)<=MAX_ARTICLE_CHARS:return None
 # Do not mix bibliography/citation list or mere abstract with body.
 authors=[]
 for contrib in children(meta,"contrib"):
  if contrib.get("contrib-type","").lower()!="author":continue
  last=text(tagged(contrib,"surname"))
  first=text(tagged(contrib,"given-names"))
  display=(first+" "+last).strip()
  if display and display not in authors:authors.append(display[:160])
  if len(authors)>=15:break
 if not authors:return None
 year=next((text(x) for x in children(meta,"year") if text(x).isdigit()),"")
 return {
  "id":ident,"title":title,"authors":authors,"year":int(year) if year else None,
  "doi":doi,"source_url":"https://pmc.ncbi.nlm.nih.gov/articles/"+ident+"/",
  "license":lic["license"],"license_url":lic["license_url"],
  "text_hash":hashlib.sha256(entire.encode("utf-8")).hexdigest(),
  "body_characters":len(entire),"body_paragraphs":len(paras),"text":entire,
  "evidence_scope":"fulltext-available-unreviewed-scientific-conclusions",
  "neural_training_permission":"candidate-CC-license-attribution-review-required"
 }

def parse_batch(raw):
 if not raw or len(raw)>MAX_RESPONSE_BYTES:raise ValueError("PMC_OAI_BATCH_SIZE_INVALID")
 if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
  raise ValueError("UNTRUSTED_XML_DTD_OR_ENTITY")
 root=ET.fromstring(raw)
 if local(root.tag)!="oai-pmh":raise ValueError("UNEXPECTED_PMC_OAI_ROOT")
 failures=[text(x) for x in children(root,"error")]
 if failures:raise ValueError("PMC_OAI_API_ERROR:"+",".join(failures)[:160])
 list_records=tagged(root,"ListRecords")
 if list_records is None:raise ValueError("PMC_OAI_NO_LIST_RECORDS")
 results=[]
 for rec in [x for x in list(list_records) if local(x.tag)=="record"]:
  metadata=next((x for x in list(rec) if local(x.tag)=="metadata"),None)
  if metadata is None:continue
  article=next((x for x in metadata.iter() if local(x.tag)=="article"),None)
  if article is None:continue
  entry=paper_data(article)
  if entry:results.append(entry)
 resume=next((x for x in list(list_records) if local(x.tag)=="resumptiontoken"),None)
 token=text(resume) if resume is not None else ""
 return results,token,len([x for x in list(list_records) if local(x.tag)=="record"])

def safe_fetch(url,retries=3):
 parsed=urllib.parse.urlsplit(url)
 if parsed.scheme!="https" or parsed.hostname!="pmc.ncbi.nlm.nih.gov" or parsed.path!="/api/oai/v1/mh/":
  raise ValueError("UNTRUSTED_PMC_SOURCE_HOST_OR_PATH")
 class LockedRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,request,fp,code,msg,headers,newurl):
   check=urllib.parse.urlsplit(newurl)
   if check.scheme!="https" or check.hostname!="pmc.ncbi.nlm.nih.gov" or check.path!="/api/oai/v1/mh/":
    raise ValueError("UNTRUSTED_PMC_REDIRECT")
   return super().redirect_request(request,fp,code,msg,headers,newurl)
 opener=urllib.request.build_opener(LockedRedirect())
 for attempt in range(retries):
  try:
   req=urllib.request.Request(url,headers={"User-Agent":"Vanilla-Xiahai-CCBY-Fulltext-Research/1.0",
     "Accept":"application/xml","Accept-Encoding":"gzip, deflate"})
   with opener.open(req,timeout=80) as res:
    payload=res.read(MAX_RESPONSE_BYTES+1)
    if len(payload)>MAX_RESPONSE_BYTES:raise ValueError("PMC_RESPONSE_OVER_LIMIT")
    if res.info().get("Content-Encoding","").lower()=="gzip":
     payload=gzip.decompress(payload)
    if len(payload)>MAX_RESPONSE_BYTES:raise ValueError("PMC_XML_DECOMPRESSED_OVER_LIMIT")
    return payload
  except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError) as exc:
   code=getattr(exc,"code",0)
   if code not in (0,429,500,502,503,504) or attempt==retries-1:raise
   time.sleep(min(3*(attempt+1),12))
 raise RuntimeError("PMC_REQUEST_FAILED")

def create_db(path):
 path.parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(path)
 db.executescript("""
 PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS papers(
  id TEXT PRIMARY KEY,title TEXT NOT NULL,authors_json TEXT NOT NULL,
  year INTEGER,doi TEXT,source_url TEXT NOT NULL,license TEXT NOT NULL,
  license_url TEXT NOT NULL,text_hash TEXT NOT NULL UNIQUE,
  body_characters INTEGER,paragraph_count INTEGER,evidence_scope TEXT NOT NULL,
  training_status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS chunks(
  id TEXT PRIMARY KEY,paper_id TEXT NOT NULL,position INTEGER,
  text TEXT NOT NULL,text_sha256 TEXT NOT NULL,
  FOREIGN KEY(paper_id) REFERENCES papers(id));
 CREATE INDEX IF NOT EXISTS chunk_paper ON chunks(paper_id);
 CREATE VIRTUAL TABLE IF NOT EXISTS paper_fts USING fts5(
  text,chunk_id UNINDEXED,tokenize='porter unicode61');
 CREATE TABLE IF NOT EXISTS checkpoint(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 """)
 return db

def segment(body,max_size=1250,overlap=100):
 pos=0
 while pos<len(body):
  end=min(len(body),pos+max_size)
  if end<len(body):
   k=body.rfind("\n",pos+max_size//2,end)
   if k>pos+max_size//2:end=k
  piece=body[pos:end].strip()
  if len(piece)>100:yield pos,piece
  if end>=len(body):break
  pos=max(pos+1,end-overlap)

def save_article(db,item):
 if db.execute("SELECT 1 FROM papers WHERE id=? OR text_hash=?",
       (item["id"],item["text_hash"])).fetchone():
  return 0
 src=item
 with db:
  db.execute("INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(
   src["id"],src["title"],json.dumps(src["authors"],ensure_ascii=False),
   src["year"],src["doi"],src["source_url"],src["license"],
   src["license_url"],src["text_hash"],src["body_characters"],
   src["body_paragraphs"],src["evidence_scope"],src["neural_training_permission"]))
  count=0
  for pos,body in segment(src["text"]):
   cid="paper_"+hashlib.sha256(f'{src["id"]}:{pos}'.encode()).hexdigest()[:26]
   dg=hashlib.sha256(body.encode("utf-8")).hexdigest()
   db.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",(cid,src["id"],pos,body,dg))
   db.execute("INSERT INTO paper_fts VALUES(?,?)",(body,cid))
   count+=1
 if count<4:raise ValueError("INSUFFICIENT_REAL_TEXT_CHUNKS")
 return count

def checkpoint(db,key,value):
 with db:db.execute("INSERT OR REPLACE INTO checkpoint VALUES(?,?)",(key,str(value)))

def run(output,target=TARGET,max_pages=MAX_PAGES,from_date="2026-01-01",delay=0.55):
 if not 1<=target<=1000 or not 1<=max_pages<=550 or not re.fullmatch(r"20[12][0-9]-[0-9]{2}-[0-9]{2}",from_date):
  raise ValueError("BOUNDED_PMC_HARVEST_REQUIRED")
 if delay<0.4:raise ValueError("PMC_RATE_LIMIT_MINIMUM_DELAY")
 if output.exists():
  # Resume only the same target/period; no silent takeover of another index.
  db=create_db(output)
  saved=dict(db.execute("SELECT key,value FROM checkpoint"))
  if saved.get("target")!=str(target) or saved.get("from_date")!=from_date:
   db.close();raise ValueError("RESUME_CORPUS_MISMATCH")
 else:
  db=create_db(output)
  checkpoint(db,"target",target);checkpoint(db,"from_date",from_date)
 seen=0
 counts=Counter()
 token=dict(db.execute("SELECT key,value FROM checkpoint")).get("token","")
 try:
  while seen<max_pages:
   total=db.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
   if total>=target:break
   params={"verb":"ListRecords"}
   if token:
    params["resumptionToken"]=token
   else:
    params.update({"metadataPrefix":"pmc","set":"pmc-open","from":from_date})
   url=API+"?"+urllib.parse.urlencode(params)
   raw=safe_fetch(url)
   papers,new_token,record_count=parse_batch(raw)
   accepted=0
   for item in papers:
    if db.execute("SELECT COUNT(*) FROM papers").fetchone()[0]>=target:break
    chunk_count=save_article(db,item)
    if chunk_count:
     accepted+=1;counts[item["license"]]+=1
   checkpoint(db,"token",new_token)
   checkpoint(db,"pages_seen",seen+1)
   seen+=1
   total=db.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
   print(json.dumps({"page":seen,"oai_records":record_count,
                     "rights_approved_body_candidates":len(papers),
                     "added":accepted,"real_fulltexts_indexed":total}),flush=True)
   if total>=target or not new_token:break
   token=new_token
   time.sleep(delay)
  books=db.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
  passages=db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
  body_chars=db.execute("SELECT SUM(body_characters) FROM papers").fetchone()[0] or 0
  source_count=db.execute("SELECT COUNT(DISTINCT source_url) FROM papers").fetchone()[0]
  if books!=target or source_count!=target or passages<target*4:
   raise RuntimeError(f"NOT_1000_REAL_LICENSED_ARTICLE_BODIES:{books}_FOUND_REQUIRED_{target}")
  report={"state":"real-cc0-ccby-pmc-fulltext-index-complete",
   "actual_paper_fulltexts":books,"distinct_pmc_sources":source_count,
   "actual_body_chunks":passages,"source_body_characters":body_chars,
   "doi_records":db.execute("SELECT COUNT(*) FROM papers WHERE doi!=''").fetchone()[0],
   "license_breakdown":dict(db.execute("SELECT license,COUNT(*) FROM papers GROUP BY license")),
   "original_source":"PMC official OAI-PMH pmc-open JATS XML",
   "sample_scope":"licensed biomedical studies, not automatically expert-verified clinical guidance",
   "fulltext_neural_qwen_steps":0,"llm_adapters_written":0,
   "rights":"CC BY or CC0 article-level permissions verified; attribution and individual edition review still required",
   "generated_utc":datetime.now(timezone.utc).isoformat()}
  report_path=output.with_suffix(".report.json")
  report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
  return report
 finally:
  db.close()

def search(db_path,query,limit=5):
 if not db_path.is_file() or not query.strip() or not 1<=limit<=20:
  raise ValueError("RESEARCH_INDEX_AND_QUERY_REQUIRED")
 phrase=" ".join(re.findall(r"[a-zA-Z]{3,}",query)[:7])
 if not phrase:return []
 conn=sqlite3.connect(db_path.resolve().as_uri()+"?mode=ro",uri=True)
 try:
  q=" OR ".join(re.findall(r"[a-zA-Z]{3,}",phrase.lower()))
  rows=conn.execute("""SELECT p.id,p.title,p.authors_json,p.doi,p.source_url,
    p.license,p.license_url,c.id,substr(c.text,1,500)
    FROM paper_fts f JOIN chunks c ON f.chunk_id=c.id
    JOIN papers p ON p.id=c.paper_id
    WHERE paper_fts MATCH ? ORDER BY bm25(paper_fts) LIMIT ?""",(q,limit)).fetchall()
  return [{"id":id,"title":title,"authors":json.loads(authors),"doi":doi,
     "source_url":source,"license":lic,"license_url":lic_url,
     "chunk_id":chunk_id,"excerpt":excerpt,"brand":"霞海書院",
     "evidence_scope":"article-body-snippet-not-medical-guideline"}
     for id,title,authors,doi,source,lic,lic_url,chunk_id,excerpt in rows]
 finally:conn.close()

def main(argv=None):
 p=argparse.ArgumentParser()
 p.add_argument("--index",type=Path,required=True)
 p.add_argument("--target",type=int,default=1000)
 p.add_argument("--max-pages",type=int,default=550)
 p.add_argument("--from-date",default="2026-01-01")
 p.add_argument("--query",default="")
 p.add_argument("--execute",action="store_true")
 a=p.parse_args(argv)
 if a.query:
  print(json.dumps(search(a.index,a.query),ensure_ascii=False,indent=2));return 0
 if not a.execute:
  print(json.dumps({"state":"dry-run","real_paper_fulltexts_downloaded":0,
   "qwen_optimizer_steps":0}));return 0
 print(json.dumps(run(a.index,target=a.target,max_pages=a.max_pages,from_date=a.from_date),
    ensure_ascii=False,indent=2));return 0
if __name__=="__main__":raise SystemExit(main())
