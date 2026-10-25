#!/usr/bin/env python3
"""Real multi-document CPU LoRA Qwen3-0.6B with entire unseen-paper holdout.

This trains only on original explicit-CC0/CC-BY PMC JATS real articles.
It writes an actual safetensors PEFT LoRA adapter and auditable loss evidence.
Not a released general-purpose research assistant; medical claims require QA.
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
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BASE="Qwen/Qwen3-0.6B"
MAX_STEPS=1250
MAX_LENGTH=128
ID=re.compile(r"^pmc-(\d+)$")
CC={"cc-by":"https://creativecommons.org/licenses/by/",
    "cc0":"https://creativecommons.org/"}
def sha(path:Path):
 h=hashlib.sha256()
 with path.open("rb") as f:
  for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
 return h.hexdigest()
def bucket(pmc_id:str)->str:
 return "holdout" if int(hashlib.sha256(pmc_id.encode()).hexdigest()[:8],16)%10==0 else "training"
def audit(path:Path,minimum=100):
 if not path.is_file() or path.stat().st_size>1_000_000_000:
  raise ValueError("LICENSED_PMC_SQLITE_REQUIRED")
 if not 20<=minimum<=1000:raise ValueError("MINIMUM_LICENSED_PAPERS_OUT_OF_BOUNDS")
 with sqlite3.connect(path.resolve().as_uri()+"?mode=ro",uri=True) as db:
  db.execute("PRAGMA query_only=ON")
  papers=db.execute("""SELECT id,rights_basis,rights_reference,reviewer,
    content_sha256,source_url,fulltext_source_url,license FROM books ORDER BY id""").fetchall()
  if len(papers)<minimum:raise ValueError(f"ONLY_{len(papers)}_LICENSED_PAPERS_REQUIRE_{minimum}")
  seen=set()
  for row in papers:
   ident,basis,grant,reviewer,content_hash,source_url,fulltext_url,lic=row
   if ident in seen:raise ValueError("DUPLICATE_PAPER")
   seen.add(ident)
   if (not ID.fullmatch(ident) or basis!="compatible-license"
       or lic not in CC or not grant.startswith(CC[lic])
       or reviewer!="PMC-OAI-PMH-JATS-explicit-license"
       or not isinstance(content_hash,str) or not re.fullmatch(r"[0-9a-f]{64}",content_hash)
       or not source_url.startswith("https://pmc.ncbi.nlm.nih.gov/articles/PMC")
       or not fulltext_url.startswith("https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/")):
    raise ValueError("PAPER_RIGHTS_OR_SOURCE_INVALID")
  grouped=defaultdict(list)
  for chunk_id,doc,body,digest in db.execute("SELECT id,book_id,body,body_sha256 FROM chunks ORDER BY id"):
   if doc not in seen or not chunk_id.startswith(doc+"-") or not isinstance(body,str) or (
    hashlib.sha256(body.encode("utf-8")).hexdigest()!=digest):
    raise ValueError("PASSAGE_SHA_OR_PROVENANCE_INVALID")
   if len(body.strip())<220:raise ValueError("PASSAGE_TOO_SHORT")
   grouped[doc].append(body)
  if set(grouped)!=seen:raise ValueError("PAPERS_WITHOUT_REAL_FULLTEXT")
  train={id:rows for id,rows in grouped.items() if bucket(id)=="training"}
  holdout={id:rows for id,rows in grouped.items() if bucket(id)=="holdout"}
  if len(train)<16 or len(holdout)<2:raise ValueError("INDEPENDENT_PAPER_HOLDOUT_MISSING")
  if sum(len(x) for x in grouped.values()) < len(grouped)*2:
   raise ValueError("INSUFFICIENT_REAL_TEXT")
  return train,holdout,{
    "audited_licensed_papers":len(papers),
    "audited_text_passages":sum(map(len,grouped.values())),
    "train_papers":len(train),"heldout_papers":len(holdout),
    "whole_paper_holdout":True,
    "input_corpus_sha256":sha(path),
    "license_policy":"per-paper explicit CC0/CC-BY in official PMC JATS",
    "citation_weight_influenced_training":False,
    "model_release_approved":False
  }
def train(path:Path,output:Path,steps:int=100,max_length:int=96,min_papers:int=100):
 if not 20<=steps<=MAX_STEPS or not 48<=max_length<=MAX_LENGTH:
  raise ValueError("CPU_TRAINING_BUDGET_REJECTED")
 if output.exists():raise ValueError("NEVER_OVERWRITE_ADAPTER")
 training,holdout,report=audit(path,min_papers)
 if steps<len(training):raise ValueError("ONE_PASSAGE_PER_TRAIN_PAPER_REQUIRES_MORE_STEPS")
 try:
  import torch
  from peft import LoraConfig,get_peft_model
  from transformers import AutoTokenizer,AutoModelForCausalLM
 except ImportError as ex:
  raise RuntimeError("INSTALL_CPU_TORCH_PEFT_TRANSFORMERS_FIRST") from ex
 if torch.cuda.is_available():raise RuntimeError("CPU_RUNNER_ONLY_FOR_THIS_PILOT")
 torch.set_num_threads(min(4,os.cpu_count() or 2))
 torch.manual_seed(20261025)
 tokenizer=AutoTokenizer.from_pretrained(BASE,trust_remote_code=False)
 if tokenizer.pad_token_id is None:tokenizer.pad_token=tokenizer.eos_token
 model=AutoModelForCausalLM.from_pretrained(
  BASE,dtype=torch.float32,attn_implementation="eager",trust_remote_code=False,
  low_cpu_mem_usage=True
 )
 model.config.use_cache=False
 model=get_peft_model(model,LoraConfig(
  r=4,lora_alpha=8,lora_dropout=0.0,bias="none",
  target_modules=["q_proj","v_proj"],task_type="CAUSAL_LM"
 ))
 to_train=[p for p in model.parameters() if p.requires_grad]
 lora_b=next((p for name,p in model.named_parameters() if "lora_B" in name and p.requires_grad),None)
 if lora_b is None:raise RuntimeError("MISSING_REAL_LORA_PARAMETERS")
 initial=lora_b.detach().clone()
 def loss_for(text,with_grad):
  batch=tokenizer(text,return_tensors="pt",truncation=True,max_length=max_length,add_special_tokens=True)
  return model(**batch,labels=batch["input_ids"]).loss
 eval_documents=sorted(holdout)
 # Non-overlapping paper IDs; one passage per heldout document, evaluated before/after.
 eval_samples=[holdout[k][0] for k in eval_documents]
 def evaluate():
  model.eval()
  with torch.no_grad():
   values=[float(loss_for(text,False).item()) for text in eval_samples]
  if not values or any(not math.isfinite(x) for x in values):raise RuntimeError("INVALID_HELDOUT_LOSS")
  return sum(values)/len(values)
 baseline=evaluate()
 optimizer=torch.optim.AdamW(to_train,lr=2e-4)
 train_ids=sorted(training)
 rng=random.Random(20261025)
 order=list(train_ids)
 rng.shuffle(order)
 touches=set()
 losses=[]
 for i in range(steps):
  paper=order[i%len(order)]
  pieces=training[paper]
  text=pieces[(i//len(order))%len(pieces)]
  model.train()
  optimizer.zero_grad(set_to_none=True)
  loss=loss_for(text,True)
  if not torch.isfinite(loss):raise RuntimeError("NONFINITE_TRAINING_LOSS")
  loss.backward()
  grad_norm=sum(float(p.grad.detach().square().sum().item())
                for p in to_train if p.grad is not None)
  if not math.isfinite(grad_norm) or grad_norm<=0:
   raise RuntimeError("ZERO_OR_INVALID_TRAINING_GRADIENT")
  optimizer.step()
  touches.add(paper)
  losses.append(float(loss.detach().item()))
  if i==0 or (i+1)%10==0 or i+1==steps:
   print("ACTUAL_QWEN_CPU_LORA_STEP",i+1,"/",steps,
         "train_loss",round(losses[-1],5),flush=True)
 if len(touches)!=len(training):raise RuntimeError("NOT_ALL_TRAINING_PAPERS_SAMPLED")
 if torch.equal(initial,lora_b.detach()):raise RuntimeError("MODEL_ADAPTER_WEIGHTS_UNCHANGED")
 after=evaluate()
 adapter=output/"adapter"
 adapter.mkdir(parents=True,exist_ok=False)
 model.save_pretrained(str(adapter),safe_serialization=True)
 tokenizer.save_pretrained(str(adapter))
 weights=adapter/"adapter_model.safetensors"
 if not weights.is_file() or weights.stat().st_size<1000 or not (adapter/"adapter_config.json").is_file():
  raise RuntimeError("NO_REAL_SAFETENSORS_ADAPTER")
 result={
  **report,"training_state":"real-multi-paper-cpu-lora-trained-not-release-ready",
  "model":BASE,"method":"float32 CPU LoRA r4 q_proj,v_proj","requested_papers":min_papers,
  "actual_optimizer_steps":steps,"sequence_length":max_length,
  "unique_training_papers_touched":len(touches),
  "independent_heldout_papers_evaluated":len(eval_documents),
  "pretraining_holdout_next_token_loss":baseline,
  "posttraining_holdout_next_token_loss":after,
  "holdout_loss_improved":after<baseline,
  "first_training_step_loss":losses[0],
  "last_training_step_loss":losses[-1],
  "adapter_sha256":sha(weights),
  "adapter_bytes":weights.stat().st_size,
  "weight_delta_verified":True,
  "actual_cuda_steps":0,
  "factual_research_qa_verified":False,
  "generated_utc":datetime.now(timezone.utc).isoformat()
 }
 output.joinpath("training-provenance.json").write_text(
  json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8"
 )
 print("ATUBER_REAL_MULTI_PAPER_LORA_FINISHED",json.dumps({
  "papers":result["audited_licensed_papers"],"train_papers":len(touches),
  "heldout_papers":len(eval_documents),"steps":steps,
  "heldout_before":baseline,"heldout_after":after,
  "weights":result["adapter_bytes"],
  "adapter_sha256":result["adapter_sha256"]
 }),flush=True)
 return result
def main():
 p=argparse.ArgumentParser(description="20 to 1000 real explicitly licensed PMC papers -> CPU LoRA weights")
 p.add_argument("--index",type=Path,required=True)
 p.add_argument("--output",type=Path)
 p.add_argument("--required-papers",type=int,default=100)
 p.add_argument("--steps",type=int,default=100)
 p.add_argument("--sequence-length",type=int,default=96)
 group=p.add_mutually_exclusive_group(required=True)
 group.add_argument("--audit-only",action="store_true")
 group.add_argument("--train",action="store_true")
 a=p.parse_args()
 if a.audit_only:
  _,_,r=audit(a.index,a.required_papers)
  print(json.dumps({"state":"audited-not-trained",**r,"optimizer_steps":0},ensure_ascii=False))
  return 0
 if not a.output:p.error("--train requires --output")
 train(a.index,a.output,a.steps,a.sequence_length,a.required_papers)
 return 0
if __name__=="__main__":raise SystemExit(main())
