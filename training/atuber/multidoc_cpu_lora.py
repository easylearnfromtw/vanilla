#!/usr/bin/env python3
"""Actual Atuber Qwen3-0.6B CPU LoRA on multiple independently licensed PDFs.

This is NOT a full factual accuracy benchmark. Model checkpoints are only
considered real after nonzero gradients, trainable weight delta, independent
heldout-DOCUMENT loss and safetensors hashing have been verified.
"""
from __future__ import annotations
import argparse
import hashlib
import itertools
import json
import math
import os
import random
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from cpu_lora_pilot import BASE_MODEL, digest

MAX_STEPS=32
MAX_LENGTH=128
MAX_DB_BYTES=250_000_000

def audited_books(index:Path,min_books:int=3)->tuple[dict[str,list[str]],dict]:
    if not index.is_file() or index.stat().st_size>MAX_DB_BYTES:
        raise ValueError("AUTHORIZED_MULTIDOC_SQLITE_MISSING_OR_TOO_LARGE")
    if not 3<=min_books<=20:
        raise ValueError("MIN_BOOKS_TARGET_INVALID")
    with sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True) as db:
        db.execute("PRAGMA query_only=ON")
        papers=db.execute(
            "SELECT id,title,rights_basis,rights_reference,reviewer,content_sha256,"
            "source_url,fulltext_source_url,license FROM books ORDER BY id").fetchall()
        if len(papers)<min_books or len(papers)>20:raise ValueError("INSUFFICIENT_REAL_AUTHORIZED_PAPERS")
        passages=defaultdict(list)
        allowed=set()
        paper_report=[]
        for ident,title,basis,reference,reviewer,hashval,url,pdf,license_name in papers:
            if not (
                re.fullmatch(r"arxiv-\d{4}\.\d{4,5}",str(ident))
                and len(str(title))>=6
                and basis=="compatible-license"
                and license_name in ("cc0","cc-by")
                and str(reference).startswith("https://creativecommons.org/")
                and reviewer=="official-arxiv-OAI-PMH-license-record"
                and re.fullmatch(r"[a-f0-9]{64}",str(hashval))
                and url=="https://arxiv.org/abs/"+ident.removeprefix("arxiv-")
                and pdf=="https://arxiv.org/pdf/"+ident.removeprefix("arxiv-")
            ):raise ValueError("UNVERIFIED_PAPER_RIGHTS_OR_ORIGIN")
            if ident in allowed:raise ValueError("DUPLICATED_PAPER_ID")
            allowed.add(ident)
            paper_report.append({"arxiv_id":ident,"title":title,"license":license_name,
                                 "rights_reference":reference,"fulltext_sha256":hashval,
                                 "source_url":url})
        seen_chunks=set()
        for chunk_id,book_id,text,hashval in db.execute(
            "SELECT id,book_id,body,body_sha256 FROM chunks ORDER BY book_id,id"):
            if (book_id not in allowed or chunk_id in seen_chunks or not isinstance(text,str)
                or len(text.strip())<220
                or hashlib.sha256(text.encode("utf-8")).hexdigest()!=hashval):
                raise ValueError("PASSAGE_PROVENANCE_HASH_MISMATCH")
            seen_chunks.add(chunk_id)
            passages[book_id].append(text)
        if any(len(passages[x])<2 for x in allowed):
            raise ValueError("UNSUPPORTED_SHORT_PAPER_TEXT")
    return dict(passages),{
        "audited_papers":len(allowed),
        "verified_documents":paper_report,
        "audited_passages":len(seen_chunks),
        "corpus_sqlite_sha256":digest(index),
    }

def split_documents(texts:dict[str,list[str]])->tuple[dict[str,list[str]],dict[str,list[str]]]:
    ids=sorted(texts)
    if len(ids)<3:raise ValueError("THREE_DOCUMENTS_REQUIRED")
    rng=random.Random(20261025)
    rng.shuffle(ids)
    holdout_size=max(1,len(ids)//5)
    test_ids=set(ids[:holdout_size])
    train={id:texts[id] for id in ids if id not in test_ids}
    test={id:texts[id] for id in ids if id in test_ids}
    if len(train)<2 or not test or set(train)&set(test):
        raise ValueError("DOCUMENT_HOLDOUT_EMPTY_OR_OVERLAPPED")
    return train,test

def plan(index:Path,min_books:int)->dict:
    texts,info=audited_books(index,min_books)
    training,test=split_documents(texts)
    return {**info,"train_documents":len(training),"heldout_documents":len(test),
            "train_passages":sum(map(len,training.values())),
            "heldout_passages":sum(map(len,test.values())),
            "train_source_ids":sorted(training),
            "holdout_source_ids":sorted(test),
            "heldout_is_entire_unseen_document":True,
            "llm_optimizer_steps":0}

def train(index:Path,output:Path,steps:int,seq_length:int,min_books:int)->dict:
    if not 2<=steps<=MAX_STEPS or not 48<=seq_length<=MAX_LENGTH:
        raise ValueError("MULTIDOC_CPU_RESOURCE_LIMIT")
    if output.exists():raise ValueError("NEVER_OVERWRITE_REAL_TRAINING_ARTIFACTS")
    texts,info=audited_books(index,min_books)
    train_texts,heldout_texts=split_documents(texts)
    try:
        import torch
        from transformers import AutoTokenizer,AutoModelForCausalLM
        from peft import LoraConfig,get_peft_model
    except ImportError as e:raise RuntimeError("REQUIRES_TORCH_TRANSFORMERS_PEFT") from e
    if torch.cuda.is_available():raise RuntimeError("THIS_PROOF_RUNNER_IS_CPU_ONLY")
    torch.set_num_threads(min(4,os.cpu_count() or 2))
    torch.manual_seed(20261025)
    tokenizer=AutoTokenizer.from_pretrained(BASE_MODEL,trust_remote_code=False)
    if tokenizer.pad_token_id is None:tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,dtype=torch.float32,attn_implementation="eager",
        trust_remote_code=False,low_cpu_mem_usage=True)
    model.config.use_cache=False
    config=LoraConfig(r=2,lora_alpha=4,lora_dropout=0.,
                      target_modules=["q_proj","v_proj"],bias="none",task_type="CAUSAL_LM")
    model=get_peft_model(model,config)
    trainable=[p for p in model.parameters() if p.requires_grad]
    original=next((p.detach().clone() for n,p in model.named_parameters()
                   if "lora_B" in n and p.requires_grad),None)
    if original is None or not trainable:raise ValueError("LORA_PARAMETERS_MISSING")
    optimizer=torch.optim.AdamW(trainable,lr=3e-4)
    queues={k:itertools.cycle(v) for k,v in train_texts.items()}
    ids=sorted(queues)
    losses=[]
    for i in range(steps):
        model.train()
        document_id=ids[i%len(ids)]
        passage=next(queues[document_id])
        batch=tokenizer(passage,return_tensors="pt",truncation=True,max_length=seq_length)
        optimizer.zero_grad(set_to_none=True)
        loss=model(**batch,labels=batch["input_ids"].clone()).loss
        if not torch.isfinite(loss):raise RuntimeError("NONFINITE_TRAIN_LOSS")
        loss.backward()
        gradient=sum(float(p.grad.detach().float().square().sum().item())
                     for p in trainable if p.grad is not None)
        if not math.isfinite(gradient) or gradient<=0:
            raise RuntimeError("NO_NONZERO_REAL_LORA_GRADIENT")
        optimizer.step()
        losses.append(float(loss.item()))
        print("REAL_MULTIDOC_LORA_STEP",i+1,"of",steps,"source",document_id,
              "loss",round(losses[-1],5),flush=True)
    final=next((p.detach() for n,p in model.named_parameters()
                if "lora_B" in n and p.requires_grad),None)
    if final is None or torch.equal(original,final):
        raise RuntimeError("MODEL_ADAPTER_DID_NOT_UPDATE")
    model.eval()
    eval_loss=[]
    with torch.no_grad():
        for document_id,lines in sorted(heldout_texts.items()):
            for passage in lines[:2]:
                batch=tokenizer(passage,return_tensors="pt",truncation=True,
                                max_length=seq_length)
                observed=float(model(**batch,labels=batch["input_ids"].clone()).loss.item())
                if not math.isfinite(observed):raise RuntimeError("NONFINITE_HELDOUT_LOSS")
                eval_loss.append(observed)
    if not eval_loss:raise RuntimeError("INDEPENDENT_DOCUMENT_EVAL_EMPTY")
    adapter=output/"adapter"
    adapter.mkdir(parents=True,exist_ok=False)
    model.save_pretrained(str(adapter),safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    weights=adapter/"adapter_model.safetensors"
    if not weights.is_file() or weights.stat().st_size<=1000:
        raise RuntimeError("NO_REAL_TRAINED_ADAPTER_SAFETENSORS")
    report={
        **info,
        "state":"real-multidoc-cpu-lora-adapter-not-released",
        "base_model":BASE_MODEL,
        "training_method":"CPU float32 LoRA, q_proj/v_proj, no CUDA/4bit",
        "documents_in_train":len(train_texts),
        "documents_in_independent_holdout":len(heldout_texts),
        "train_document_ids":sorted(train_texts),
        "holdout_document_ids":sorted(heldout_texts),
        "training_passages":sum(map(len,train_texts.values())),
        "heldout_passages":sum(map(len,heldout_texts.values())),
        "actual_optimizer_steps":steps,
        "train_loss_by_step":losses,
        "heldout_document_loss":sum(eval_loss)/len(eval_loss),
        "heldout_passages_evaluated":len(eval_loss),
        "weight_delta_verified":True,
        "adapter_file_size":weights.stat().st_size,
        "adapter_sha256":digest(weights),
        "cpu_only":True,"cuda_used":False,
        "scientific_question_answering_accuracy_validated":False,
        "model_ready_for_public_release":False,
        "training_papers_target":100,
        "training_papers_target_reached":len(texts)>=100,
        "created_utc":datetime.now(timezone.utc).isoformat()
    }
    (output/"training-provenance.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("REAL_MULTIDOC_LORA_COMPLETED",json.dumps({
        "real_documents":len(texts),
        "train_documents":len(train_texts),"heldout_documents":len(heldout_texts),
        "optimizer_steps":steps,"adapter_bytes":report["adapter_file_size"],
        "sha256":report["adapter_sha256"],"holdout_loss":report["heldout_document_loss"]
    },ensure_ascii=False),flush=True)
    return report

def main(argv=None):
    p=argparse.ArgumentParser(description="Actual multi-article licensed CPU LoRA")
    p.add_argument("--index",required=True,type=Path)
    p.add_argument("--output",required=True,type=Path)
    p.add_argument("--min-papers",type=int,default=3)
    p.add_argument("--steps",type=int,default=8)
    p.add_argument("--sequence-length",type=int,default=64)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--audit-only",action="store_true")
    mode.add_argument("--train",action="store_true")
    a=p.parse_args(argv)
    if a.audit_only:
        print(json.dumps(plan(a.index,a.min_papers),ensure_ascii=False,indent=2));return 0
    print(json.dumps(train(a.index,a.output,a.steps,a.sequence_length,a.min_papers),
                     ensure_ascii=False,indent=2));return 0

if __name__=="__main__":sys.exit(main())
