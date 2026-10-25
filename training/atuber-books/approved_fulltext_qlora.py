#!/usr/bin/env python3
"""Actual CUDA QLoRA continued-pretraining path for *approved book fulltext*.

1) --audit-only: validate private rights-cleared chunks and book-level holdout.
2) --train: actual next-token LoRA training on authorized BOOK TEXT (not a
   book-title classifier or RAG). Requires approved owner CUDA GPU and enough
   disk/VRAM. Never run on CI/GitHub Pages.
3) Never report completed weights without adapter_model.safetensors and metrics.

A held-out BOOK is never included in a training batch. This measures predictive
language modeling loss, not guaranteed factual/finance QA competence.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime,timezone
from pathlib import Path

BASE_MODEL="Qwen/Qwen3-0.6B"
MAX_STEPS=5000
MAX_LENGTH=2048

def digest(path:Path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):
            h.update(block)
    return h.hexdigest()

def bucket(ident:str)->str:
    return "holdout" if int(hashlib.sha256(ident.encode()).hexdigest()[:8],16)%10==0 else "train"

def audit(index:Path,required_approved:int=20)->dict:
    if not index.is_file():
        raise ValueError("APPROVED_FULLTEXT_SQLITE_REQUIRED")
    if not 2<=required_approved<=25_000:
        raise ValueError("REQUIRED_APPROVED_BOOK_TARGET_OUT_OF_BOUNDS")
    db=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        books=db.execute("""SELECT id,title,rights_basis,rights_reference,reviewer,content_sha256
                     FROM books ORDER BY id""").fetchall()
        count=len(books)
        if count<required_approved:
            raise ValueError("NOT_ENOUGH_RIGHTS_REVIEWED_FULLTEXT_BOOKS")
        ids={b[0] for b in books}
        if len(ids)!=len(books):
            raise ValueError("FULLTEXT_BOOK_IDS_DUPLICATED")
        if any(basis not in {"owned","permission","compatible-license"}
               or reviewer.startswith("automated") for _,_,basis,_,reviewer,_ in books):
            raise ValueError("CANDIDATE_PUBLIC_DOMAIN_NOT_HUMAN_RIGHTS_REVIEWED")
        if any(not ident or not title or not basis or not reference or not reviewer
               or not isinstance(content_sha,str) or len(content_sha)!=64
               for ident,title,basis,reference,reviewer,content_sha in books):
            raise ValueError("FULLTEXT_RIGHTS_OR_SOURCE_HASH_MISSING")
        train_ids={b[0] for b in books if bucket(b[0])=="train"}
        test_ids=ids-train_ids
        if len(train_ids)<2 or len(test_ids)<1:
            raise ValueError("BOOK_LEVEL_HOLDOUT_EMPTY")
        counts={"train":0,"holdout":0}
        count_by_book={}
        # Verify every stored passage hash; do not trust an unverified database.
        for chunk_id,book_id,body,sha in db.execute("SELECT id,book_id,body,body_sha256 FROM chunks ORDER BY id"):
            if book_id not in ids or not isinstance(body,str) or hashlib.sha256(body.encode()).hexdigest()!=sha:
                raise ValueError("FULLTEXT_CHUNK_PROVENANCE_HASH_INVALID")
            counts[bucket(book_id)]+=1
            count_by_book[book_id]=count_by_book.get(book_id,0)+1
        if len(count_by_book)!=len(ids) or counts["train"]<100 or counts["holdout"]<5:
            raise ValueError("FULLTEXT_TOO_FEW_CHUNKS_FOR_TRAIN_AND_BOOK_HOLDOUT")
        return {
            "status":"fulltext-corpus-audited-only-not-trained",
            "approved_fulltext_books":count,
            "train_book_count":len(train_ids),
            "heldout_book_count":len(test_ids),
            "train_passages":counts["train"],
            "heldout_passages":counts["holdout"],
            "all_approved_books_covered_by_index":True,
            "split_policy":"stable book-id SHA256; entire books held out",
            "model":BASE_MODEL,
            "llm_optimizer_steps_completed":0,
            "model_weight_artifacts_created":False,
            "meaning":"only real rights-reviewed text, not bibliographic metadata"
        }
    finally:
        db.close()

def train(index:Path,output:Path,required:int,steps:int,max_length:int)->dict:
    if not 16<=steps<=MAX_STEPS or not 128<=max_length<=MAX_LENGTH:
        raise ValueError("CUDA_QLORA_TRAINING_LIMITS_REJECTED")
    if output.exists():raise ValueError("REFUSE_OVERWRITE_NEURAL_ADAPTER")
    report=audit(index,required)
    try:
        import torch
        from torch.utils.data import Dataset
        from transformers import (AutoTokenizer,AutoModelForCausalLM,
                                  BitsAndBytesConfig,Trainer,TrainingArguments)
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    except ImportError as exc:
        raise RuntimeError("CUDA_DEPENDENCIES_NOT_INSTALLED_USE_ATUBER_REQUIREMENTS") from exc
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA_GPU_REQUIRED_NO_FAKE_CPU_LLM_TRAINING")
    db=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        # Compact list of row IDs, not whole copyrighted book contents in RAM.
        train_rowids=[]
        eval_rowids=[]
        for rowid,book_id in db.execute("SELECT rowid,book_id FROM chunks ORDER BY rowid"):
            (eval_rowids if bucket(book_id)=="holdout" else train_rowids).append(rowid)
    finally:db.close()
    # Evaluate at most a reproducible, bounded subset of unseen-book passages.
    eval_rowids=eval_rowids[::max(1,len(eval_rowids)//2000)][:2000]
    tokenizer=AutoTokenizer.from_pretrained(BASE_MODEL,trust_remote_code=False)
    if tokenizer.pad_token is None:tokenizer.pad_token=tokenizer.eos_token
    class DbTextDataset(Dataset):
        def __init__(self,ids):
            self.ids=ids
            self.connection=None
        def __len__(self):
            return len(self.ids)
        def __getitem__(self,i):
            if self.connection is None:
                self.connection=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
            record=self.connection.execute("SELECT body FROM chunks WHERE rowid=?",(self.ids[i],)).fetchone()
            if record is None:raise ValueError("FULLTEXT_ROW_REMOVED_AFTER_AUDIT")
            tokens=tokenizer(record[0],max_length=max_length,padding="max_length",
                             truncation=True,return_attention_mask=True)
            ids=tokens["input_ids"]
            mask=tokens["attention_mask"]
            labels=[tok if m else -100 for tok,m in zip(ids,mask)]
            return {"input_ids":torch.tensor(ids,dtype=torch.long),
                    "attention_mask":torch.tensor(mask,dtype=torch.long),
                    "labels":torch.tensor(labels,dtype=torch.long)}
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type="nf4",
                             bnb_4bit_use_double_quant=True,
                             bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported()
                             else torch.float16)
    model=AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,quantization_config=quant,device_map="auto",trust_remote_code=False)
    model.config.use_cache=False
    model=prepare_model_for_kbit_training(model)
    peft_config=LoraConfig(
       r=8,lora_alpha=16,lora_dropout=0.05,task_type="CAUSAL_LM",bias="none",
       target_modules=["q_proj","k_proj","v_proj","o_proj","up_proj","down_proj","gate_proj"])
    model=get_peft_model(model,peft_config)
    output.mkdir(parents=True)
    args=TrainingArguments(
        output_dir=str(output/"checkpoints"),
        max_steps=steps,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=8e-5,
        warmup_ratio=0.03,
        weight_decay=0.01,
        logging_steps=20,
        save_strategy="no",
        eval_strategy="no",
        report_to="none",
        remove_unused_columns=False,
        dataloader_num_workers=0,
        gradient_checkpointing=True,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        seed=20261025
    )
    trainer=Trainer(model=model,args=args,train_dataset=DbTextDataset(train_rowids),
                    eval_dataset=DbTextDataset(eval_rowids))
    result=trainer.train()
    evaluation=trainer.evaluate()
    loss=float(result.training_loss)
    val_loss=float(evaluation.get("eval_loss",float("nan")))
    if not (math.isfinite(loss) and math.isfinite(val_loss)):
        raise RuntimeError("NONFINITE_LM_LOSS_NO_RELEASE")
    adapter=output/"adapter"
    trainer.model.save_pretrained(str(adapter),safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    w=adapter/"adapter_model.safetensors"
    if not w.is_file() or w.stat().st_size<1000:
        raise RuntimeError("NO_REAL_SAFETENSORS_ADAPTER_WEIGHTS")
    finished={
       **report,
       "status":"actual-rights-approved-book-fulltext-cuda-qlora-completed",
       "base_model":BASE_MODEL,
       "llm_optimizer_steps_completed":steps,
       "neural_optimizer_steps_completed":steps,
       "training_passages_indexed":len(train_rowids),
       "evaluation_passages_sampled_from_heldout_books":len(eval_rowids),
       "training_loss":loss,"heldout_book_eval_loss":val_loss,
       "adapter_sha256":digest(w),
       "input_fulltext_db_sha256":digest(index),
       "generated_utc":datetime.now(timezone.utc).isoformat(),
       "model_weight_artifacts_created":True,
       "limitations":"language-model next-token loss is not validated factual Q&A accuracy; independent human QA evaluation still required."
    }
    (output/"training-provenance.json").write_text(json.dumps(finished,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return finished

def main(argv=None):
    p=argparse.ArgumentParser(description="Real rights-reviewed fulltext CUDA QLoRA, distinct from RAG")
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--output",type=Path,default=Path("training/outputs/atuber-fulltext-qlora"))
    p.add_argument("--required-approved-books",type=int,default=20)
    p.add_argument("--steps",type=int,default=180)
    p.add_argument("--max-length",type=int,default=512)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--audit-only",action="store_true")
    mode.add_argument("--train",action="store_true")
    a=p.parse_args(argv)
    if a.audit_only:
        print(json.dumps(audit(a.index,a.required_approved_books),ensure_ascii=False,indent=2))
        return 0
    print(json.dumps(train(a.index,a.output,a.required_approved_books,a.steps,a.max_length),
                     ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
