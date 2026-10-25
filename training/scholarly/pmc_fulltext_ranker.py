#!/usr/bin/env python3
"""Actual CPU gradient training using the real body passages from 1000 papers.

Train a passage/query relevance linear model: this updates REAL parameters,
NOT Qwen weights; generated positive/negative passage labels test lexical retrieval
and cannot establish accurate real-world scientific or consumer advice.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import random
import re
import sqlite3
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

STEPS=250_000
STOP=set("""the and for with from this that these those which where when into between
under over also about through were have has had been being their there than
was are its via an of a in on at to or as is be by not it we our can
such may using used use after before based showed results study both
however conclusion background methods research investigated assessment""".split())
TOKEN=re.compile(r"[a-zA-Z][a-zA-Z-]{2,}")
def tokens(s):
 return [t.lower().strip("-") for t in TOKEN.findall(s) if len(t)>=3]
def terms(s):
 return [t for t in tokens(s) if t not in STOP]
def vec(q,passage):
 qt=terms(q);pt=tokens(passage)
 qs=set(qt);ps=set(pt)
 intersection=qs&ps
 if not qs:return None
 ph=" ".join(qt)
 low=passage.lower()
 # All features depend on genuine published article BODY, not titles.
 return [1.,len(intersection)/len(qs),
         len(intersection)/max(1,len(qs|ps)),
         1. if ph in " ".join(pt) else 0.,
         min(1.,len(qt)/10.),
         len(intersection)/max(1,min(len(ps),20)),
         min(1.,len(pt)/250.)]
def sigma(x):
 if x>30:return 1.
 if x< -30:return 0.
 return 1/(1+math.exp(-x))
def predict(w,x):
 return sigma(sum(a*b for a,b in zip(w,x)))
def split(book_id):
 v=int(hashlib.sha256(book_id.encode()).hexdigest()[:8],16)%10
 return "test" if v==0 else "validation" if v==1 else "train"
def dataset(path):
 if not path.is_file():raise ValueError("PMC_1000_INDEX_REQUIRED")
 db=sqlite3.connect(path.resolve().as_uri()+"?mode=ro",uri=True)
 try:
  total=db.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
  if total!=1000:raise ValueError("REQUIRED_1000_REAL_ARTICLE_BODIES")
  all_chunks=db.execute("SELECT paper_id,text FROM chunks ORDER BY paper_id,position").fetchall()
  license_count=db.execute("SELECT COUNT(*) FROM papers WHERE license IN ('cc0-1.0','cc-by-4.0','cc-by-3.0')").fetchone()[0]
  if license_count!=1000:raise ValueError("UNAPPROVED_LICENSE_FOR_FULLTEXT_RANKER")
 finally:db.close()
 if len(all_chunks)<4000:raise ValueError("NOT_ENOUGH_ACTUAL_PAPER_BODY_CHUNKS")
 groups={"train":[],"validation":[],"test":[]}
 paper_sets={key:set() for key in groups}
 for paper_id,body in all_chunks:
  groups[split(paper_id)].append((paper_id,body))
  paper_sets[split(paper_id)].add(paper_id)
 if min(len(v) for v in groups.values())<40:raise ValueError("HELDOUT_PAPER_SPLIT_EMPTY")
 dataset_rows={}
 for part,documents in groups.items():
  rows=[]
  for i,(pid,body) in enumerate(documents):
   t=terms(body)
   if len(t)<17:continue
   # Find a deterministic, actual published 4-word phrase.
   pos=(i*19+3)%(len(t)-4)
   query=" ".join(t[pos:pos+4])
   other_index=(i+len(documents)//2)%len(documents)
   for bump in range(25):
    if documents[(other_index+bump)%len(documents)][0]!=pid:
     other_index=(other_index+bump)%len(documents);break
   else:continue
   positive=vec(query,body)
   negative=vec(query,documents[other_index][1])
   if positive is not None and negative is not None:
    rows.append((positive,1))
    rows.append((negative,0))
  if len(rows)<60:raise ValueError("REAL_PASSAGE_TRAINING_EXAMPLES_TOO_FEW")
  dataset_rows[part]=rows
 return dataset_rows,{k:len(v) for k,v in paper_sets.items()},len(all_chunks)
def evaluate(rows,w):
 accurate=0;cross_entropy=0
 for x,label in rows:
  p=predict(w,x)
  accurate+=int((p>=0.5)==bool(label))
  cross_entropy-=label*math.log(max(p,1e-12))+(1-label)*math.log(max(1-p,1e-12))
 return {"pairs":len(rows),"accuracy":round(accurate/len(rows),5),
         "log_loss":round(cross_entropy/len(rows),6)}
def train(index,output,steps=STEPS):
 if output.exists():raise ValueError("REFUSE_OVERWRITE_ACTUAL_WEIGHTS")
 if not 1000<=steps<=1_000_000:raise ValueError("BOUNDED_GRADIENT_STEP_COUNT_REQUIRED")
 rows,paper_counts,pages=dataset(index)
 w=[0.0]*7
 baseline=evaluate(rows["test"],w)
 train_rows=rows["train"]
 rng=random.Random(20261025)
 for step in range(steps):
  x,y=train_rows[rng.randrange(len(train_rows))]
  estimate=predict(w,x)
  learning_rate=.13/math.sqrt(1+step/100000)
  for j,val in enumerate(x):
   w[j]+=learning_rate*((y-estimate)*val-0.00004*w[j])
 after=evaluate(rows["test"],w)
 if not all(math.isfinite(v) for v in w):raise ValueError("NONFINITE_SGD_WEIGHTS")
 output.mkdir(parents=True)
 model={"model_id":"xiahai-1000-real-fulltext-passages-ranker-v1",
        "weights":w,"features":7,
        "training_task":"synthetically labeled passage-query lexical relevance",
        "origin":"1000 actual CC BY/CC0 PMC OA body texts",
        "llm":False}
 weights_path=output/"passage-ranker.json"
 weights_path.write_text(json.dumps(model,indent=2)+"\n")
 report={
  "state":"real-cpu-gradient-steps-on-1000-actual-article-bodies",
  "real_papers_read":sum(paper_counts.values()),
  "real_fulltext_passages_read":pages,
  "train_papers":paper_counts["train"],
  "validation_papers":paper_counts["validation"],
  "heldout_papers":paper_counts["test"],
  "train_pairs":len(rows["train"]),
  "heldout_pairs":len(rows["test"]),
  "actual_sgd_optimizer_steps":steps,
  "scalar_parameter_updates":steps*len(w),
  "heldout_before":baseline,"heldout_after":after,
  "evaluation_scope":"synthetic exact-phrase queries; NOT human clinical QA or scientific evidence evaluation",
  "qwen_neural_optimizer_steps":0,"qwen_adapter_created":False,
  "rights_scope":"PMC paper body CC BY/CC0; attribution and version review still apply",
  "weights_sha256":hashlib.sha256(weights_path.read_bytes()).hexdigest(),
  "generated_utc":datetime.now(timezone.utc).isoformat()
 }
 (output/"training-report.json").write_text(json.dumps(report,indent=2)+"\n")
 return report
def main(argv=None):
 p=argparse.ArgumentParser()
 p.add_argument("--index",type=Path,required=True)
 p.add_argument("--output",type=Path,required=True)
 p.add_argument("--steps",type=int,default=STEPS)
 p.add_argument("--execute",action="store_true")
 a=p.parse_args(argv)
 if not a.execute:
  print(json.dumps({"status":"dry-run","sgd_updates":0,"qwen_updates":0}));return 0
 print(json.dumps(train(a.index,a.output,a.steps),indent=2));return 0
if __name__=="__main__":raise SystemExit(main())
