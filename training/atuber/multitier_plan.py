"""October multi-model 150k-step QLoRA plan. No GPU or model downloads here."""
from __future__ import annotations
import hashlib,json,re
from dataclasses import dataclass,asdict
from pathlib import Path

MAX_STEPS=150000
@dataclass(frozen=True)
class Tier:
    alias:str
    base_model:str
    size_b:float
    kind:str
    lora_rank:int
    min_vram_gib_recommendation:int
    recommended_max_length:int
TIERS={
 "0.6b":Tier("OCTUBER PHONE","Qwen/Qwen3-0.6B",0.6,"dense",8,6,512),
 "4b":Tier("OCTUBER FLATTERING","Qwen/Qwen3-4B",4,"dense",16,12,512),
 "14b":Tier("OCTUBER MODEST","Qwen/Qwen3-14B",14,"dense",16,24,512),
 "30b-moe":Tier("OCTUBER SUMPTUOUS","Qwen/Qwen3-30B-A3B",30,"moe",8,48,384),
 "32b":Tier("OCTUBER SUMPTUOUS 32B","Qwen/Qwen3-32B",32,"dense",8,48,384)
}
def fingerprint(path):
 h=hashlib.sha256()
 with Path(path).open("rb") as f:
  for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
 return h.hexdigest()
def config(*,tier,steps=MAX_STEPS,sequence_length=None,accumulation=8,checkpoint_every=500,eval_every=2000,learning_rate=0.0001,dataset_sha256=None):
 d=TIERS.get(tier)
 if d is None:raise ValueError("UNKNOWN_OCTUBER_MODEL_TIER")
 length=sequence_length or d.recommended_max_length
 if type(steps) is not int or not 16<=steps<=MAX_STEPS:raise ValueError("GRADIENT_STEP_LIMIT_16_TO_150000")
 if type(length) is not int or not 128<=length<=2048:raise ValueError("SEQUENCE_LENGTH_128_TO_2048")
 if type(accumulation) is not int or not 1<=accumulation<=64:raise ValueError("ACCUMULATION_1_TO_64")
 if not 0<learning_rate<=0.001 or checkpoint_every<1 or eval_every<1:raise ValueError("INVALID_OPTIMIZER_OPTIONS")
 return {"schema":1,"model_family":"October","tier":tier,"model":asdict(d),
 "gradient_updates_requested":steps,"micro_batch_size":1,"gradient_accumulation_steps":accumulation,
 "expected_training_examples_seen_approximately":steps*accumulation,
 "sequence_length":length,"learning_rate":learning_rate,"save_steps":min(checkpoint_every,steps),
 "eval_steps":min(eval_every,steps),"lora_target_modules":["q_proj","k_proj","v_proj","o_proj"],
 "dataset_sha256":dataset_sha256,"precision":"auto bf16/fp16","quantization":"NF4 4-bit",
 "activation_checkpointing":True,"optimizer":"paged_adamw_8bit",
 "checkpoint_policy":"save_last_3_resume_explicitly","no_production_deploy":True,
 "data_consent_required":True,"cuda_training_required":True,"model_download_requires_opt_in":True,
 "real_model_training_completed":False,
 "warnings":["VRAM figures are estimates, not hardware verification",
 "150k gradient updates are not 150k distinct records; with limited data severe overfitting is likely",
 "Ollama GGUF files are not directly trainable HF model checkpoints",
 "30B MoE expert-specific LoRA requires separate hardware validation"]}
def verified_manifest(request,dataset,*,rows,train_rows,holdout_rows):
 if min(rows,train_rows,holdout_rows)<1 or train_rows+holdout_rows!=rows:raise ValueError("INVALID_TRAIN_EVAL_SPLIT")
 digest=fingerprint(dataset)
 if request.get("dataset_sha256") not in (None,digest):raise ValueError("DATASET_DIGEST_MISMATCH")
 obj={**request,"dataset_sha256":digest,"approved_rows":rows,"training_rows":train_rows,"holdout_rows":holdout_rows}
 obj["request_digest"]=hashlib.sha256(json.dumps(obj,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()
 return obj
def verify_resume(saved,requested):
 if not isinstance(saved,dict) or saved!=requested:raise ValueError("RESUME_CONFIG_OR_DATA_CHANGED")
def latest_checkpoint(directory):
 paths=[]
 for child in Path(directory).resolve().glob("checkpoint-*"):
  m=re.fullmatch(r"checkpoint-(\d+)",child.name)
  if m and child.is_dir() and (child/"trainer_state.json").is_file():paths.append((int(m.group(1)),child))
 if not paths:raise ValueError("RESUME_CHECKPOINT_NOT_FOUND")
 return max(paths)[1]
