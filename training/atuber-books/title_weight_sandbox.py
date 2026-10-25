#!/usr/bin/env python3
"""A real, auditable 1M SGD-step TINY TITLE CLASSIFIER sandbox for Atuber.

This trains its OWN small Python classifier weights on permitted BOOK METADATA.
It does NOT train October/Qwen/4B/14B/30B weights and never learns book contents.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

LABELS = ("economics", "finance", "stocks", "psychology", "philosophy")
DIM = 4096
FEAT_LIMIT = 14
VERSION = "title-sgd-v1"
MAX_STEPS = 1_000_000


def features(title: str) -> tuple[int, ...]:
    # Unicode bigrams + trigrams: language-agnostic, deterministic and capped.
    norm = " ".join(title.casefold().strip().split())[:240]
    grams = [norm[i:i+n] for n in (2,3) for i in range(max(0,len(norm)-n+1))]
    if not grams:
        grams = [norm] if norm else ["?"]
    values = sorted({int.from_bytes(hashlib.blake2b(g.encode("utf-8"),digest_size=8,
                                         person=b"AtuberV1").digest(),"big") % DIM for g in grams})
    # Deterministic sparsity cap; does not look up test set or outcome.
    return tuple(values[:FEAT_LIMIT])


def load_examples(db: Path) -> dict[str, list[tuple[tuple[int,...],int,str,str,str,str]]]:
    if not db.is_file():
        raise ValueError("CATALOG_DATABASE_NOT_FOUND")
    conn = sqlite3.connect("file:"+db.resolve().as_uri().split("file://",1)[-1]+"?mode=ro",uri=True)
    try:
        rows = conn.execute("""SELECT title,topic,split,id,author,source_url
            FROM books WHERE topic IS NOT NULL AND title<>'' ORDER BY id""").fetchall()
    finally:
        conn.close()
    out = {"train-index":[],"validation":[],"holdout":[]}
    for title, label, split, ident, author, url in rows:
        if label not in LABELS or split not in out:
            continue
        out[split].append((features(title),LABELS.index(label),ident,title,author or "",url))
    if len(out["train-index"]) < 10 or len(out["validation"]) < 2 or len(out["holdout"]) < 2:
        raise ValueError("INSUFFICIENT_DISTINCT_BOOKS_OR_HOLDOUT")
    return out


def predict(weights: list[list[float]], feats: tuple[int,...]) -> list[float]:
    norm = 1.0 / max(1,len(feats))
    return [sum(row[f] for f in feats)*norm for row in weights]


def probabilities(logits: list[float]) -> list[float]:
    peak = max(logits)
    exps = [math.exp(min(0.0,x-peak)) for x in logits]
    denom = sum(exps)
    return [x/denom for x in exps]


def evaluate(rows,weights):
    if not rows:
        raise ValueError("NO_VALID_EVALUATION_EXAMPLES")
    accurate,loss=0,0.0
    categories=Counter()
    correct=Counter()
    for f,y,*_ in rows:
        probs=probabilities(predict(weights,f))
        guess=max(range(len(LABELS)),key=lambda i:probs[i])
        accurate += int(guess==y)
        categories[LABELS[y]]+=1
        correct[LABELS[y]]+=int(guess==y)
        loss -= math.log(max(1e-12,probs[y]))
    return {"sample_count":len(rows),"accuracy":round(accurate/len(rows),6),
            "cross_entropy":round(loss/len(rows),6),
            "per_domain":{label:{"total":categories[label],"correct":correct[label]}
                          for label in LABELS}}


def catalogue_title_drill(db:Path, output:Path, max_questions:int=200)->dict:
    """Exact, sourced answers for book-title/author quizzes; NOT memorized facts."""
    if not 1<=max_questions<=1000:
        raise ValueError("QUESTION_LIMIT_INVALID")
    if output.exists():
        raise ValueError("REFUSE_OVERWRITE_OUTPUT")
    conn = sqlite3.connect("file:"+db.resolve().as_uri().split("file://",1)[-1]+"?mode=ro",uri=True)
    try:
        rows=conn.execute("""SELECT id,title,author,publication_year,topic,language,
                                    source_url,split FROM books
             WHERE title<>'' AND author<>'' AND split='holdout'
             ORDER BY id LIMIT ?""",(max_questions,)).fetchall()
    finally:
        conn.close()
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("x",encoding="utf-8") as f:
        for ident,title,author,year,topic,lang,url,split in rows:
            # Evidence always comes from held-out catalogue metadata, never fabricated content.
            f.write(json.dumps({
                "book_id":ident,"prompt":f"《{title}》的作者是誰？請提供資料來源。",
                "expected_answer":author,"title":title,"year":year,
                "topic":topic,"language":lang,"source_url":url,
                "split":split,"evidence_type":"catalogue-metadata",
                "book_content_known":False,
            },ensure_ascii=False)+"\n")
    return {"questions":len(rows),"output":str(output),"book_contents_read":0}


def fit(db:Path,out:Path,steps:int,learning_rate:float=0.2)->dict:
    if out.exists():
        raise ValueError("REFUSE_OVERWRITE_EXISTING_OUTPUT_DIRECTORY")
    if not 1<=steps<=MAX_STEPS:
        raise ValueError("ONE_MILLION_STEP_CAP_EXCEEDED")
    if not 0<learning_rate<=1:
        raise ValueError("INVALID_LEARNING_RATE")
    data=load_examples(db)
    train=data["train-index"]
    weights=[[0.0]*DIM for _ in LABELS]
    baseline={"validation":evaluate(data["validation"],weights),
              "holdout":evaluate(data["holdout"],weights)}
    # Deterministic cyclic traversal, each iteration performs one gradient step.
    # A 'step' means one single example SGD optimizer step, NOT a unique book.
    N=len(train)
    stride=37
    while math.gcd(stride,N)!=1:
        stride+=2
    total_grad_updates=0
    for i in range(steps):
        f,y,*_=train[((i*stride)+23)%N]
        logits=predict(weights,f)
        probs=probabilities(logits)
        # Online multiclass SGD, every call calculates a gradient.
        lr=learning_rate/(1.0+i/100_000)**0.5
        scale=lr/max(1,len(f))
        for k in range(len(LABELS)):
            delta=scale*((1.0 if k==y else 0.0)-probs[k])
            row=weights[k]
            for key in f:
                row[key]+=delta
                total_grad_updates+=1
    # Never fold validation/holdout into training.
    summary={"schema":1,"state":"completed-tiny-metadata-classifier-sgd",
        "model_type":"hashed-character-n-gram-multiclass-linear-classifier",
        "labels":list(LABELS),"feature_count":DIM,"features_per_title_cap":FEAT_LIMIT,
        "steps_requested":steps,"optimizer_steps_completed":steps,
        "scalar_parameter_updates":total_grad_updates,
        "distinct_training_titles":len(train),
        "effective_exposures_per_training_title":round(steps/len(train),2),
        "validation_titles":len(data["validation"]),
        "held_out_titles":len(data["holdout"]),
        "validation_baseline":baseline["validation"],
        "holdout_baseline":baseline["holdout"],
        "validation_final":evaluate(data["validation"],weights),
        "holdout_final":evaluate(data["holdout"],weights),
        "training_label_origin":"heuristic-title-topic-matches-not-human-content-annotation",
        "source_data":"NBINet metadata, not book text",
        "neural_llm_weight_updates":0,"full_text_books_read":0,
        "qwen_0_6b_updated":False,"october_4b_14b_30b_updated":False,
        "learning_claim":"title-topic metadata patterns only; no evidence of learning book contents",
        "generated_utc":datetime.now(timezone.utc).isoformat()}
    out.mkdir(parents=True)
    (out/"weights.json").write_text(json.dumps({
        "model_type":VERSION,"feature_dim":DIM,"labels":list(LABELS),
        "weights":weights},separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
    summary["weight_file_sha256"]=hashlib.sha256((out/"weights.json").read_bytes()).hexdigest()
    (out/"training_report.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",
                                            encoding="utf-8")
    return summary


def main(argv=None):
    p=argparse.ArgumentParser(description="One-million *tiny title classifier* weight steps, not LLM training")
    p.add_argument("--database",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--steps",type=int,default=1_000_000)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"state":"dry-run","proposed_steps":a.steps,
                          "would_change_llm_weights":False,"trained":False},ensure_ascii=False))
        return 0
    report=fit(a.database,a.output,a.steps)
    report["title_drill"]=catalogue_title_drill(a.database,a.output/"title_holdout_questions.jsonl")
    (a.output/"training_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k not in ("holdout_baseline","validation_baseline")},
                     ensure_ascii=False,indent=2))
    return 0


if __name__=="__main__":
    sys.exit(main())
