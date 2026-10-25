#!/usr/bin/env python3
"""Real Qwen3-0.6B CPU LoRA *proof of execution* on one verified CC0 paper.

This intentionally does NOT claim an independently validated research model:
one paper, 1-4 real optimizer steps, passage-level holdout only. Distinct from
4-bit CUDA QLoRA, ranking practice, or embedding/RAG index construction.

Never runs without an explicit --train, verified per-paper license and fulltext.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE_MODEL = "Qwen/Qwen3-0.6B"
MAX_STEPS = 4
MAX_SEQUENCE = 96
MIN_PASSAGES = 8

def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()

def audit_corpus(db_path: Path) -> tuple[list[str], dict]:
    if not db_path.is_file() or db_path.stat().st_size > 50_000_000:
        raise ValueError("SMALL_PRIVATE_LICENSED_SQLITE_REQUIRED")
    with sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.execute("PRAGMA query_only=ON")
        books = db.execute(
            "SELECT id,rights_basis,rights_reference,reviewer,content_sha256,"
            " source_url,fulltext_source_url,license FROM books ORDER BY id"
        ).fetchall()
        if len(books) != 1:
            raise ValueError("CPU_PILOT_MUST_HAVE_EXACTLY_ONE_LICENSED_PAPER")
        ident,basis,reference,reviewer,full_sha,source_url,pdf_url,license_name = books[0]
        # A work is not rights-cleared merely because it is available on arXiv.
        rights_ok = (
            str(ident).startswith("arxiv-")
            and basis == "compatible-license"
            and license_name in {"cc0","cc-by"}
            and str(reference).startswith("https://creativecommons.org/")
            and reviewer == "official-arxiv-OAI-PMH-license-record"
            and bool(re.fullmatch(r"[a-f0-9]{64}",str(full_sha)))
            and str(source_url).startswith("https://arxiv.org/abs/")
            and str(pdf_url).startswith("https://arxiv.org/pdf/")
        )
        if not rights_ok:
            raise ValueError("DOCUMENT_LICENSE_OR_ORIGIN_NOT_VERIFIED")
        rows = db.execute(
            "SELECT body,body_sha256 FROM chunks WHERE book_id=? ORDER BY id", (ident,)
        ).fetchall()
    texts = []
    for passage, sha in rows:
        if (not isinstance(passage,str) or len(passage.strip()) < 220
            or hashlib.sha256(passage.encode("utf-8")).hexdigest() != sha):
            raise ValueError("PAPER_PASSAGE_HASH_INVALID")
        texts.append(passage)
    if len(texts) < MIN_PASSAGES:
        raise ValueError("NOT_ENOUGH_REAL_PAPER_TEXT_PASSAGES")
    return texts, {
        "arxiv_paper_id":ident,
        "source_url":source_url,
        "license":license_name,
        "license_reference":reference,
        "fulltext_source_sha256":full_sha,
        "input_sqlite_sha256":digest(db_path),
        "verified_real_passages":len(texts),
    }

def split_passages(passages: list[str]) -> tuple[list[str],list[str]]:
    ordered = list(passages)
    random.Random(20261025).shuffle(ordered)
    test_count = max(2, len(ordered)//5)
    return ordered[test_count:], ordered[:test_count]

def train(index: Path, output: Path, steps: int, sequence_length: int) -> dict:
    if not 1 <= steps <= MAX_STEPS or not 48 <= sequence_length <= MAX_SEQUENCE:
        raise ValueError("CPU_RESOURCE_BUDGET_EXCEEDED")
    if output.exists():
        raise ValueError("NEVER_OVERWRITE_TRAINED_ADAPTER")
    passages,provenance = audit_corpus(index)
    training,heldout=split_passages(passages)
    if len(training) < 4 or len(heldout) < 2:
        raise ValueError("PAPER_PASSAGE_HOLDOUT_MISSING")
    try:
        import torch
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as e:
        raise RuntimeError("INSTALL_CPU_TORCH_TRANSFORMERS_PEFT_FIRST") from e
    if torch.cuda.is_available():
        # Deliberately CPU-only so run provenance cannot call GPU a CPU result.
        raise RuntimeError("CPU_PILOT_REQUIRES_CPU_ONLY_HOST")
    torch.set_num_threads(min(4,os.cpu_count() or 2))
    torch.manual_seed(20261025)
    tokenizer=AutoTokenizer.from_pretrained(BASE_MODEL,trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, dtype=torch.float32, attn_implementation="eager",
        trust_remote_code=False, low_cpu_mem_usage=True
    )
    model.config.use_cache=False
    peft_config=LoraConfig(
        r=2,lora_alpha=4,lora_dropout=0.0,
        target_modules=["q_proj","v_proj"],bias="none",task_type="CAUSAL_LM"
    )
    model=get_peft_model(model,peft_config)
    trainable=[p for p in model.parameters() if p.requires_grad]
    if not trainable:
        raise RuntimeError("NO_TRAINABLE_ADAPTER_PARAMETERS")
    initial_b=next((p.detach().cpu().clone() for name,p in model.named_parameters()
                    if "lora_B" in name and p.requires_grad),None)
    if initial_b is None:
        raise RuntimeError("NO_LORA_B_WEIGHTS")
    optimizer=torch.optim.AdamW(trainable,lr=5e-4)
    losses=[]
    for idx in range(steps):
        model.train()
        passage=training[idx % len(training)]
        encoded=tokenizer(passage,return_tensors="pt",truncation=True,
                          max_length=sequence_length,add_special_tokens=True)
        labels=encoded["input_ids"].clone()
        optimizer.zero_grad(set_to_none=True)
        loss=model(**encoded,labels=labels).loss
        if not torch.isfinite(loss):
            raise RuntimeError("NONFINITE_REAL_OPTIMIZER_LOSS")
        loss.backward()
        grad_sq=sum(float(p.grad.detach().float().square().sum().item())
                    for p in trainable if p.grad is not None)
        if not math.isfinite(grad_sq) or grad_sq <= 0:
            raise RuntimeError("NO_NONZERO_LORA_GRADIENTS")
        optimizer.step()
        losses.append(float(loss.detach().item()))
        print(f"ACTUAL_CPU_LORA_STEP {idx+1}/{steps} loss={losses[-1]:.6f}",flush=True)
    trained_b=next((p.detach().cpu() for name,p in model.named_parameters()
                   if "lora_B" in name and p.requires_grad),None)
    if trained_b is None or torch.equal(initial_b,trained_b):
        raise RuntimeError("ADAPTER_PARAMETERS_DID_NOT_CHANGE")
    # At least a passage from the same paper is held out. This is NOT an
    # independent-paper test and must never be presented as factual QA.
    model.eval()
    with torch.no_grad():
        sample=tokenizer(heldout[0],return_tensors="pt",truncation=True,
                         max_length=sequence_length,add_special_tokens=True)
        heldout_loss=float(model(**sample,labels=sample["input_ids"]).loss.item())
    if not math.isfinite(heldout_loss):
        raise RuntimeError("HELDOUT_PASSAGE_LOSS_NONFINITE")
    adapter=output/"adapter"
    adapter.mkdir(parents=True,exist_ok=False)
    model.save_pretrained(str(adapter),safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    safetensors=adapter/"adapter_model.safetensors"
    cfg=adapter/"adapter_config.json"
    if not safetensors.is_file() or safetensors.stat().st_size < 1000 or not cfg.is_file():
        raise RuntimeError("REAL_LORA_WEIGHTS_NOT_SAVED")
    report={
        **provenance,
        "state":"real-cpu-lora-adapter-trained-not-validated-for-release",
        "model":BASE_MODEL,
        "base_revision":str(getattr(model.base_model.model.config,"_commit_hash",None) or "not-pinned"),
        "method":"real CPU float32 LoRA q_proj + v_proj, no quantization",
        "cpu_only":True,"cuda_used":False,"trained":True,
        "actual_optimizer_steps":steps,
        "sequence_length":sequence_length,
        "train_passages":len(training),"holdout_passages_same_document":len(heldout),
        "training_loss_per_step":losses,"same_paper_holdout_loss":heldout_loss,
        "weight_delta_verified":True,
        "adapter_sha256":digest(safetensors),
        "adapter_bytes":safetensors.stat().st_size,
        "model_release_approved":False,
        "independent_document_evaluation":False,
        "scientific_correctness_tested":False,
        "generated_utc":datetime.now(timezone.utc).isoformat()
    }
    output.joinpath("training-provenance.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("REAL_ATUBER_CPU_LORA_ADAPTER_CREATED",json.dumps({
        "real_steps":steps,"adapter_bytes":report["adapter_bytes"],
        "adapter_sha256":report["adapter_sha256"],
        "same_paper_holdout_loss":heldout_loss
    }),flush=True)
    return report

def main():
    parser=argparse.ArgumentParser(description="Real bounded Atuber CPU LoRA proof")
    parser.add_argument("--index",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    parser.add_argument("--steps",type=int,default=2)
    parser.add_argument("--sequence-length",type=int,default=64)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--audit-only",action="store_true")
    mode.add_argument("--train",action="store_true")
    args=parser.parse_args()
    if args.audit_only:
        passages,info=audit_corpus(args.index)
        print(json.dumps({"status":"rights-audited-not-trained",
             **info,"steps":0,"passages":len(passages)},ensure_ascii=False))
        return 0
    train(args.index,args.output,args.steps,args.sequence_length)
    return 0

if __name__=="__main__":
    sys.exit(main())
