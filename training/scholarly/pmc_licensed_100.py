#!/usr/bin/env python3
"""PMC official OAI-PMH real licensed-JATS fulltext -> audited Atuber SQLite.

Fulltext is accepted ONLY if exact JATS per-article license is CC0 / CC BY.
- Never equate 'in PMC' or 'pmc-open' with blanket model-training permission.
- Uses only PMC OAI-PMH (per official PMC bulk-retrieval policy).
- No article PDFs, figures, copyrighted-only records, or auth secrets uploaded.
- Persist raw text only in workflow's expiring private training artifact.
- Checks distinct official PMCID, text and paragraph sha256, source and grant.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

BASE="https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/"
MAX_RAW=20_000_000
MAX_UNCOMPRESSED=30_000_000
MAX_DOCUMENT_CHARS=500_000
ID=re.compile(r"^oai:pubmedcentral\.nih\.gov:(\d{3,12})$")
CC_BY={
 "creativecommons.org/licenses/by/4.0",
 "creativecommons.org/licenses/by/3.0",
 "creativecommons.org/licenses/by/2.5",
}
CC0={
 "creativecommons.org/publicdomain/zero/1.0",
 "creativecommons.org/licenses/publicdomain",
}
ALLOWED=CC_BY|CC0
XHREF="{http://www.w3.org/1999/xlink}href"
def sha(text:str)->str:return hashlib.sha256(text.encode("utf8")).hexdigest()
def normalized_license(value:str):
 try:
  url=urlsplit(str(value or "").strip())
  key=(url.hostname or "").lower()+url.path.lower().rstrip("/")
  if url.scheme not in ("https","http") or url.username or url.password:return None
  if key not in ALLOWED:return None
  return ("cc-by" if key in CC_BY else "cc0","https://"+key+"/")
 except ValueError:return None
def license_link_from_jats(node):
 """Use only explicit Creative Commons URLs inside a JATS license element.

 Some current PMC XML uses <license-p><ext-link xlink:href=...>,
 and others present the direct URL as element text. Never accept NC/ND/SA.
 """
 fragments=[]
 for elem in node.iter():
  for key in (XHREF,"href"):
   if elem.attrib.get(key):fragments.append(elem.attrib[key])
 fragments.extend(t.strip() for t in node.itertext() if t and t.strip())
 accepted=set()
 rejected=False
 for fragment in fragments:
  for found in re.finditer(r'https?://creativecommons[.]org/(?:licenses|publicdomain)/[^ \t\r\n<>"\x27]+',fragment,re.I):
   raw=found.group(0).rstrip(".,;:)]")
   grant=normalized_license(raw)
   if grant:
    accepted.add(grant)
    continue
   # XML mixed content may place an immediate capitalized sentence after
   # a canonical URL (e.g. .../4.0/This work...). Recover ONLY that form.
   for prefix in ("http://","https://"):
    for base in sorted(ALLOWED,key=len,reverse=True):
     canonical=prefix+base+"/"
     if not raw.lower().startswith(canonical):continue
     tail=raw[len(canonical):]
     if tail and re.fullmatch(r"[A-Z][A-Za-z.,-]*",tail):
      grant=normalized_license(canonical)
      if grant:
       accepted.add(grant)
       break
    if grant:break
   if not grant:rejected=True
 if rejected or len(accepted)!=1:return None
 return next(iter(accepted))
def tag_name(elem):return elem.tag.rsplit("}",1)[-1]
def children(elem,tag):return [x for x in elem if tag_name(x)==tag]
def nested(elem,*path):
 for name in path:
  vals=children(elem,name)
  if not vals:return None
  elem=vals[0]
 return elem
def plain(el):
 return " ".join("".join(el.itertext()).split()) if el is not None else ""
def chunked(body, size=1750,overlap=100):
 index=0
 while index<len(body):
  chunk=body[index:index+size].strip()
  if len(chunk)>=240:yield chunk
  index+=size-overlap
def fetch_official(url:str)->bytes:
 parsed=urlsplit(url)
 if parsed.scheme!="https" or parsed.netloc!="pmc.ncbi.nlm.nih.gov" or parsed.path!="/api/oai/v1/mh/":
  raise ValueError("PMC_OAI_ENDPOINT_REQUIRED")
 req=urllib.request.Request(url,headers={
  "Accept":"application/xml",
  "Accept-Encoding":"gzip, deflate",
  "User-Agent":"VanillaAcademicEvidence/1.0 (+https://github.com/easylearnfromtw/vanilla)"
 })
 with urllib.request.urlopen(req,timeout=65) as response:
  final=urlsplit(response.geturl())
  if final.scheme!="https" or final.netloc!="pmc.ncbi.nlm.nih.gov":
   raise ValueError("PMC_UNTRUSTED_REDIRECT")
  encoded=response.read(MAX_RAW+1)
  encoding=response.headers.get("content-encoding","").lower().strip()
 if len(encoded)>MAX_RAW:raise ValueError("PMC_RESPONSE_TOO_LARGE")
 if encoding=="gzip":
  with gzip.GzipFile(fileobj=__import__("io").BytesIO(encoded)) as f:
   data=f.read(MAX_UNCOMPRESSED+1)
 elif encoding=="deflate":
  obj=zlib.decompressobj()
  data=obj.decompress(encoded,MAX_UNCOMPRESSED+1)
 else:data=encoded
 if len(data)>MAX_UNCOMPRESSED:raise ValueError("PMC_XML_DECOMPRESSION_LIMIT")
 return data
def parse_response(raw:bytes):
 if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():raise ValueError("PMC_OAI_XML_DTD_FORBIDDEN")
 root=ET.fromstring(raw)
 errors=[plain(x) for x in root if tag_name(x)=="error"]
 if errors:raise ValueError("PMC_OAI_ERROR: "+str(errors)[:180])
 block=nested(root,"ListRecords")
 if block is None:raise ValueError("PMC_OAI_NO_LISTRECORDS")
 records=children(block,"record")
 token=next((plain(x) for x in children(block,"resumptionToken")),"")
 if token and len(token)>2000:raise ValueError("OAI_TOKEN_TOO_LONG")
 return records,token
def parse_article_record(record):
 header=nested(record,"header")
 meta=nested(record,"metadata")
 if header is None or meta is None:return None,"missing-metadata"
 if header.attrib.get("status")=="deleted":return None,"deleted"
 raw_id=plain(nested(header,"identifier"))
 match=ID.fullmatch(raw_id)
 if not match:return None,"bad-official-pmcid"
 articles=[x for x in meta if tag_name(x)=="article"]
 if len(articles)!=1:return None,"no-jats-fulltext"
 art=articles[0]
 front=nested(art,"front")
 metadata=nested(front,"article-meta") if front is not None else None
 body=nested(art,"body")
 if metadata is None or body is None:return None,"missing-real-article-body"
 # PMC's current JATS emits "pmcid" (PMC123...), and older article
 # versions may use "pmc" or "pmcaid". Match the value to the official
 # OAI-PMH header rather than relying on any one historical field name.
 id_nodes=[x for x in metadata.iter()
           if tag_name(x)=="article-id" and x.attrib.get("pub-id-type") in
           ("pmcid","pmc","pmcaid")]
 pmcids=[re.sub(r"^PMC","",plain(x),flags=re.I).strip()
         for x in id_nodes]
 if match.group(1) not in pmcids:return None,"jats-pmcid-mismatch"
 license_nodes=[x for x in metadata.iter() if tag_name(x)=="license"]
 valid=[license_link_from_jats(n) for n in license_nodes]
 valid=[x for x in valid if x]
 if not valid:return None,"not-explicit-cc0-or-cc-by"
 # Multiple conflicting machine-readable licenses are ambiguous; reject.
 if len(set(valid))>1:return None,"ambiguous-multiple-licenses"
 license_name,license_url=valid[0]
 title=plain(nested(metadata,"title-group","article-title"))[:500]
 if len(title)<8:return None,"title-missing"
 paragraphs=[]
 for el in body.iter():
  if tag_name(el)!="p":continue
  content=plain(el)
  if len(content)>=50:paragraphs.append(content)
 content="\n\n".join(paragraphs)
 if len(content)<1700:return None,"body-too-short"
 if len(content)>MAX_DOCUMENT_CHARS:content=content[:MAX_DOCUMENT_CHARS]
 doi_nodes=[x for x in metadata.iter() if tag_name(x)=="article-id" and x.attrib.get("pub-id-type")=="doi"]
 doi=plain(doi_nodes[0])[:200] if doi_nodes else ""
 # CC-BY attribution: preserve contributor names, not just a bare DOI.
 authors=[]
 for contrib in metadata.iter():
  if tag_name(contrib)!="contrib" or contrib.attrib.get("contrib-type")!="author":continue
  name=nested(contrib,"name")
  if name is not None:
   given=plain(nested(name,"given-names"))
   family=plain(nested(name,"surname"))
   display=" ".join(p for p in (given,family) if p)
  else:
   display=plain(nested(contrib,"collab"))
  if display and display not in authors:authors.append(display[:160])
 return {"id":"pmc-"+match.group(1),"pmcid":"PMC"+match.group(1),
  "title":title,"doi":doi,"authors":authors[:100],"content":content,"license":license_name,"rights_reference":license_url,
  "source_url":"https://pmc.ncbi.nlm.nih.gov/articles/PMC"+match.group(1)+"/",
  "fulltext_source_url":BASE+"?"+urllib.parse.urlencode({
   "verb":"GetRecord","metadataPrefix":"pmc","identifier":raw_id
  })},None
def create_db(path):
 if path.exists():raise ValueError("NO_OVERWRITE_EXISTING_CORPUS")
 path.parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(path)
 db.executescript("""
 PRAGMA foreign_keys=ON;
 CREATE TABLE books(
  id TEXT PRIMARY KEY,title TEXT NOT NULL,rights_basis TEXT NOT NULL,
  rights_reference TEXT NOT NULL,reviewer TEXT NOT NULL,content_sha256 TEXT NOT NULL,
  source_url TEXT NOT NULL,fulltext_source_url TEXT NOT NULL,
  license TEXT NOT NULL,doi TEXT,pmcid TEXT NOT NULL UNIQUE,authors_json TEXT NOT NULL,
  citation_weight INTEGER NOT NULL DEFAULT 1
 );
 CREATE TABLE chunks(
  id TEXT PRIMARY KEY,book_id TEXT NOT NULL REFERENCES books(id),
  body TEXT NOT NULL,body_sha256 TEXT NOT NULL
 );
 CREATE INDEX ix_chunks_book ON chunks(book_id);
 """)
 return db
def store(db,item):
 parts=list(chunked(item["content"]))
 if len(parts)<2:raise ValueError("INSUFFICIENT_AUTHORIZED_PASSAGES")
 with db:
  db.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(
   item["id"],item["title"],"compatible-license",item["rights_reference"],
   "PMC-OAI-PMH-JATS-explicit-license",sha(item["content"]),
   item["source_url"],item["fulltext_source_url"],item["license"],
   item["doi"],item["pmcid"],json.dumps(item["authors"],ensure_ascii=False),1
  ))
  db.executemany("INSERT INTO chunks VALUES(?,?,?,?)",[
   (item["id"]+"-"+str(n).zfill(5),item["id"],body,sha(body))
   for n,body in enumerate(parts)
  ])
 return len(parts)
def collect(target:int,output:Path,from_date:str,max_pages:int,delay:float,
            fetcher=fetch_official):
 if not 20<=target<=100:raise ValueError("TARGET_MUST_BE_20_TO_100")
 if not 1<=max_pages<=100 or not .5<=delay<=10:raise ValueError("PMC_RATE_OR_PAGE_BUDGET")
 if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",from_date):raise ValueError("INVALID_OAI_FROM_DATE")
 db_path=Path(str(output)+".sqlite3")
 report_path=Path(str(output)+".report.json")
 if db_path.exists() or report_path.exists():raise ValueError("NO_OVERWRITE_CORPUS")
 db=create_db(db_path)
 reasons=Counter()
 seen=set()
 token=""
 last=0
 pages=0
 accepted=0
 passages=0
 examples=[]
 stop_reason="max-pages-reached"
 try:
  for page in range(max_pages):
   params=({"verb":"ListRecords","resumptionToken":token} if token
           else {"verb":"ListRecords","metadataPrefix":"pmc","set":"pmc-open","from":from_date})
   url=BASE+"?"+urllib.parse.urlencode(params)
   if last:time.sleep(max(0,delay-(time.monotonic()-last)))
   try: raw=fetcher(url)
   finally:last=time.monotonic()
   records,token=parse_response(raw)
   pages+=1
   for record in records:
    article,reason=parse_article_record(record)
    if article is None:
     reasons[reason]+=1;continue
    if article["id"] in seen:reasons["duplicate-record"]+=1;continue
    seen.add(article["id"])
    try:count=store(db,article)
    except (ValueError,sqlite3.IntegrityError):
     reasons["article-index-failed"]+=1;continue
    accepted+=1;passages+=count
    if len(examples)<5:examples.append({
     "id":article["id"],"title":article["title"],
     "license":article["license"],"rights_reference":article["rights_reference"],
     "source_url":article["source_url"],"authors":article["authors"][:5],"passages":count
    })
    print("LICENSED_PMC_FULLTEXT_INDEXED",accepted,article["id"],count,flush=True)
    if accepted>=target:break
   if accepted>=target:
    stop_reason="target-reached";break
   if not token:
    stop_reason="provider-exhausted";break
 finally:db.close()
 report={"state":"real-pmc-licensed-fulltext-index-not-trained",
  "generated_utc":datetime.now(timezone.utc).isoformat(),
  "target_fulltexts":target,"licensed_fulltexts_indexed":accepted,
  "licensed_chunks_indexed":passages,
  "oai_pages_retrieved":pages,"excluded_reasons":dict(reasons),
  "stop_reason":stop_reason,"source":"PMC official OAI-PMH/JATS",
  "sample_sources":examples,
  "corpus_sha256":hashlib.sha256(db_path.read_bytes()).hexdigest(),
  "weights_updated":0,"trainable_fulltext_source_type":"PMC-JATS-CC0-or-CC-BY",
  "note":"PMC collection membership alone is never treated as a text training license"}
 report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 return report
def main():
 p=argparse.ArgumentParser(description="Real PMC explicit CC-BY/CC0 100 fulltext scientific paper corpus")
 p.add_argument("--output",type=Path,required=True)
 p.add_argument("--target",type=int,default=100)
 p.add_argument("--from-date",default="2026-09-01")
 p.add_argument("--max-pages",type=int,default=100)
 p.add_argument("--min-delay",type=float,default=0.75)
 p.add_argument("--execute",action="store_true")
 a=p.parse_args()
 if not a.execute:
  print(json.dumps({"state":"dry-run","papers_indexed":0,"llm_updates":0}))
  return 0
 report=collect(a.target,a.output,a.from_date,a.max_pages,a.min_delay)
 print(json.dumps(report,ensure_ascii=False,indent=2))
 # Indexing below target is a real partial result, not success.
 return 0 if report["licensed_fulltexts_indexed"]==a.target else 2
if __name__=="__main__":sys.exit(main())
