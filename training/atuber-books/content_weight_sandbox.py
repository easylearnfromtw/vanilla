#!/usr/bin/env python3
"""Real 1M-step SGD on *rights-reviewed book content*, in a TINY sandbox ranker.

Task: identify which source BOOK a passage belongs to from its actual words.
This is not generative knowledge, comprehension, QLoRA, or Qwen/October LLM
fine tuning. Use RAG for grounded book questions; report metrics honestly.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from title_weight_sandbox import DIM, MAX_STEPS, features, probabilities, predict


def split(ident:str)->str:
    v=int(hashlib.sha256(ident.encode()).hexdigest()[:8],16)%10
    return "holdout" if v==0 else "validation" if v==1 else "train"


def examples(db:Path):
    if not db.is_file():
        raise ValueError("APPROVED_BOOK_CONTENT_DATABASE_REQUIRED")
    con=sqlite3.connect(db.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        rights=con.execute("SELECT id,title,rights_basis,rights_reference,reviewer FROM books ORDER BY id").fetchall()
        if not 2<=len(rights)<=50:
            raise ValueError("CONTENT_MODEL_NEEDS_2_TO_50_APPROVED_BOOKS")
        if any(not basis or not reference or not reviewer for _,_,basis,reference,reviewer in rights):
            raise ValueError("CONTENT_SOURCE_RIGHTS_MISSING")
        label_id={row[0]:i for i,row in enumerate(rights)}
        books=[{"id":row[0],"title":row[1]} for row in rights]
        rows=con.execute("SELECT id,book_id,body FROM chunks ORDER BY id").fetchall()
    finally:
        con.close()
    grouped={"train":[],"validation":[],"holdout":[]}
    book_chunks={book["id"]:0 for book in books}
    for chunk_id,book_id,body in rows:
        if book_id not in label_id or not body:
            continue
        book_chunks[book_id]+=1
        grouped[split(chunk_id)].append((features(body),label_id[book_id]))
    if min(book_chunks.values())<10 or not all(grouped.values()):
        raise ValueError("NOT_ENOUGH_DISTINCT_APPROVED_CHUNKS")
    return books,book_chunks,grouped


def score(data,weights):
    total,correct=0,0
    loss=0.0
    for f,y in data:
        probs=probabilities(predict(weights,f))
        guess=max(range(len(probs)),key=lambda i:probs[i])
        total+=1
        correct+=int(guess==y)
        loss-=math.log(max(1e-12,probs[y]))
    return {"examples":total,"accuracy":round(correct/total,6),
            "cross_entropy":round(loss/total,6)}


def fit(db:Path,output:Path,steps:int=1_000_000)->dict:
    if output.exists():
        raise ValueError("REFUSE_OVERWRITE_APPROVED_CONTENT_WEIGHT_OUTPUT")
    if not 1<=steps<=MAX_STEPS:
        raise ValueError("CONTENT_SGD_STEPS_OUTSIDE_1M_CAP")
    books,chunk_counts,groups=examples(db)
    train,valid,test=groups["train"],groups["validation"],groups["holdout"]
    weights=[[0.0]*DIM for _ in books]
    before={"validation":score(valid,weights),"holdout":score(test,weights)}
    n=len(train)
    stride=37
    while math.gcd(stride,n)!=1:
        stride+=2
    scalars=0
    for t in range(steps):
        f,y=train[(t*stride+17)%n]
        probabilities_now=probabilities(predict(weights,f))
        lr=0.15/(1+t/100000)**0.5
        normalizer=lr/max(1,len(f))
        for k,row in enumerate(weights):
            delta=normalizer*((1.0 if k==y else 0.0)-probabilities_now[k])
            for key in f:
                row[key]+=delta
                scalars+=1
    output.mkdir(parents=True)
    checkpoint={"model_type":"tiny-licensed-book-source-classifier-v1",
                "labels":[book["id"] for book in books],
                "feature_dim":DIM,"weights":weights}
    w=output/"content_weights.json"
    w.write_text(json.dumps(checkpoint,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
    report={
        "status":"completed-tiny-content-source-classifier-sgd-not-llm",
        "optimizer_steps_completed":steps,"scalar_parameter_updates":scalars,
        "books_training_source_count":len(books),
        "approved_books":books,
        "source_chunks_per_book":chunk_counts,
        "distinct_train_chunks":len(train),
        "distinct_validation_chunks":len(valid),
        "distinct_holdout_chunks":len(test),
        "effective_exposures_per_training_chunk":round(steps/len(train),2),
        "validation_baseline":before["validation"],"validation_final":score(valid,weights),
        "holdout_baseline":before["holdout"],"holdout_final":score(test,weights),
        "label_definition":"which-book-does-this-passage-come-from",
        "scope":"lexical patterns from actual approved full-text passages",
        "limitations":"passage source recognition, not reasoning or factual Q&A correctness; chunk split within same books",
        "llm_optimizer_steps":0,"qwen_or_october_weight_updates":0,
        "weights_sha256":hashlib.sha256(w.read_bytes()).hexdigest(),
        "generated_utc":datetime.now(timezone.utc).isoformat()}
    (output/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report


def main(argv=None):
    p=argparse.ArgumentParser(description="One million tiny lexical SGD updates on approved book CONTENT")
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--steps",type=int,default=1000000)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"state":"dry-run","planned_steps":a.steps,
                          "book_text_downloads":0,"updated_qwen_llm":False}))
        return 0
    print(json.dumps(fit(a.index,a.output,a.steps),ensure_ascii=False,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
