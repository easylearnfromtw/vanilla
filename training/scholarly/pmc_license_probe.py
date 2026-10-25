#!/usr/bin/env python3
"""One official PMC OAI page, output ONLY structural license metadata, no text."""
import json,sys,urllib.parse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from pmc_licensed_100 import BASE,fetch_official,parse_response,nested,tag_name,plain
if __name__=="__main__":
 url=BASE+"?"+urllib.parse.urlencode({"verb":"ListRecords","metadataPrefix":"pmc",
                                      "set":"pmc-open","from":"2026-09-01"})
 records,_=parse_response(fetch_official(url))
 for index,record in enumerate(records[:3]):
  head=plain(nested(record,"header","identifier"))
  meta=nested(record,"metadata")
  article=next((x for x in meta if tag_name(x)=="article"),None)
  info=nested(article,"front","article-meta") if article is not None else None
  if info is None:print(json.dumps({"oai_id":head,"error":"no article-meta"}));continue
  aids=[{"type":x.attrib.get("pub-id-type"),"value":plain(x)[:70]}
        for x in info.iter() if tag_name(x)=="article-id"]
  licences=[]
  for x in info.iter():
   if tag_name(x)!="license":continue
   links=[{"tag":tag_name(y),"attributes":dict(y.attrib),
           "text_prefix":plain(y)[:160]}
          for y in x.iter() if tag_name(y) in ("ext-link","uri")]
   licences.append({"attributes":dict(x.attrib),"text_prefix":plain(x)[:250],
                    "links":links[:4]})
  print("PMC_LICENSE_SCHEMA",json.dumps({"oai_id":head,"ids":aids[:8],
      "licenses":licences[:4]},ensure_ascii=False))
