#!/usr/bin/env python3
"""One million *actual* SGD updates on source-grounded fuzzy book relevance pairs.

Learns a 6-feature linear match scorer from real catalogue title/author metadata,
synthetic typo, truncation and bilingual topic queries. Does NOT train LLM
weights, prove real-world relevance, or see hidden full books.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime,timezone
from pathlib import Path
from hybrid_library import norm, grams, variants, fuzzy_score

MAX_STEPS=1_000_000

def vec(q,title,author,topic):
    q=norm(q)
    t=norm(title)
    a=norm(author)
    p=norm(topic)
    qs=grams(q)
    ts=grams(t)
    combined=grams(t+" "+a+" "+p)
    return (
        1.0 if q and q in t else 0.0,
        len(qs&ts)/max(1,len(qs)),
        len(qs&combined)/max(1,len(qs|combined)),
        1.0 if len(q)>=3 and q in a else 0.0,
        min(1.0,fuzzy_score(q,t,a,p)/4.0),
        max((len(grams(v)&combined)/max(1,len(grams(v)))) for v in variants(q)),
    )

def sigmoid(x):
    if x<-30:return 0.0
    if x>30:return 1.0
    return 1.0/(1.0+math.exp(-x))

def score(weights,x):
    return sigmoid(sum(a*b for a,b in zip(weights,x)))

def dataset(index):
    if not index.is_file():
        raise ValueError("RELEVANCE_INDEX_REQUIRED")
    con=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        rows=con.execute("""SELECT id,title,author,topic FROM books
              WHERE source_scope='catalogue-dataset' ORDER BY id""").fetchall()
    finally:
        con.close()
    if len(rows)<80:
        raise ValueError("NEED_80_DIFFERENT_CATALOGUE_BOOKS")
    groups={"train":[],"validation":[],"holdout":[]}
    for i,(ident,title,author,topic) in enumerate(rows):
        bucket=int(hashlib.sha256(ident.encode()).hexdigest()[:8],16)%10
        split="holdout" if bucket==0 else "validation" if bucket==1 else "train"
        cleaned=norm(title)
        if len(cleaned)<3:
            continue
        # Synthetic positives from the original title, prefixes, and one typo.
        probes=[
            cleaned,
            cleaned[:max(3,min(11,len(cleaned)))],
            cleaned[:max(2,min(6,len(cleaned)))]+cleaned[max(3,min(6,len(cleaned)))+1:]
        ]
        if author and len(norm(author))>=3:
            probes.append(norm(author)[:18])
        if topic and variants(topic):
            probes.append(variants(topic)[0])
        # Pick unrelated book, but guard accidental identical/near-equivalent titles.
        j=(i+len(rows)//2)%len(rows)
        for offset in range(8):
            other=rows[(j+offset)%len(rows)]
            if other[0]!=ident and norm(other[1])!=cleaned and (not author or norm(other[2])!=norm(author)):
                break
        else:
            continue
        for query in probes:
            if len(query)<2:
                continue
            groups[split].append((vec(query,title,author or "",topic or ""),1))
            groups[split].append((vec(query,other[1],other[2] or "",other[3] or ""),0))
    if min(len(v) for v in groups.values())<30:
        raise ValueError("TRAIN_OR_HOLDOUT_EMPTY")
    return groups, len(rows)

def metrics(items,weights):
    success=0;loss=0.0;positives=0;negatives=0
    for x,y in items:
        pred=score(weights,x)
        success+=int((pred>=0.5)==bool(y))
        positives+=int(bool(y))
        negatives+=int(not y)
        loss-=y*math.log(max(1e-12,pred))+(1-y)*math.log(max(1e-12,1-pred))
    return {"examples":len(items),"accuracy":round(success/len(items),6),
            "cross_entropy":round(loss/len(items),6),
            "positive_examples":positives,"negative_examples":negatives}

def fit(index,output,steps=1_000_000):
    if output.exists():
        raise ValueError("REFUSE_OVERWRITE_RANKER_OUTPUT")
    if not 1<=steps<=MAX_STEPS:
        raise ValueError("RANKER_STEP_CAP_1M")
    groups,books=dataset(index)
    train=groups["train"]
    weights=[0.0]*6
    baselines={k:metrics(v,weights) for k,v in groups.items() if k!="train"}
    stride=37
    while math.gcd(stride,len(train))!=1:
        stride+=2
    changes=0
    for i in range(steps):
        x,y=train[(i*stride+17)%len(train)]
        p=score(weights,x)
        lr=0.1/(1+i/250_000)**0.5
        for k,val in enumerate(x):
            # True online logistic gradient update with small L2 regularization.
            delta=lr*((y-p)*val-0.00005*weights[k])
            weights[k]+=delta
            changes+=1
    final={k:metrics(v,weights) for k,v in groups.items() if k!="train"}
    output.mkdir(parents=True)
    model={"version":"atuber-fuzzy-book-ranker-v1","feature_count":6,
           "weights":weights,"intercept":0.0,
           "description":"synthetic metadata lexical relevance, not semantic book comprehension"}
    (output/"ranker.json").write_text(json.dumps(model,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    report={
        "state":"actual-1m-metadata-relevance-sgd",
        "optimizer_steps_completed":steps,"scalar_parameter_updates":changes,
        "unique_source_books":books,"train_pairs":len(train),
        "validation_pairs":len(groups["validation"]),"holdout_pairs":len(groups["holdout"]),
        "validation_before":baselines["validation"],"validation_after":final["validation"],
        "holdout_before":baselines["holdout"],"holdout_after":final["holdout"],
        "training_labels":"synthetic-match-from-catalogue-not-human-relevance-judgments",
        "evaluation_scope":"held-out book IDs, same template family",
        "unseen_real_user_queries_tested":0,
        "full_book_llm_gradient_steps":0,
        "qwen_october_llm_weight_updates":0,
        "training_data_scope":"real book titles/authors; no unlicensed text",
        "weights_sha256":hashlib.sha256((output/"ranker.json").read_bytes()).hexdigest(),
        "generated_utc":datetime.now(timezone.utc).isoformat()}
    (output/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report

def main(argv=None):
    p=argparse.ArgumentParser(description="Actual 1M SGD training on book query/title fuzzy ranker")
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--steps",type=int,default=1_000_000)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"state":"dry-run","steps_requested":a.steps,
                          "llm_weights_updated":False},ensure_ascii=False))
        return 0
    print(json.dumps(fit(a.index,a.output,a.steps),ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
