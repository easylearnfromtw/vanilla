"""Opt-in, CUDA-only October/Atuber QLoRA. Plan mode never trains/downloads.
Actual optimization requires --train --approve-gpu-and-download and reviewed data.
"""
from __future__ import annotations
import argparse,hashlib,json,math,os,sys
from datetime import datetime,timezone
from pathlib import Path
from multitier_plan import TIERS,config,latest_checkpoint,fingerprint,verify_resume

def hardware():
 try:
  import torch
  if not torch.cuda.is_available():return {"cuda":False,"gpu_count":0,"status":"NO_CUDA_DEVICE"}
  return {"cuda":True,"gpu_count":torch.cuda.device_count(),"gpu_0":torch.cuda.get_device_name(0),
          "vram_gib":round(torch.cuda.get_device_properties(0).total_memory/1024**3,2)}
 except ImportError:return {"cuda":False,"gpu_count":0,"status":"TORCH_NOT_INSTALLED"}

def verify_no_leakage(train,holdout):
 train_ids={x["id"] for x in train}
 eval_ids={x["id"] for x in holdout}
 if train_ids & eval_ids:raise ValueError("TRAIN_EVAL_ID_LEAKAGE")
 def prompts(rows):
  return {hashlib.sha256(x["user"].strip().casefold().encode()).hexdigest() for x in rows}
 if prompts(train) & prompts(holdout):raise ValueError("TRAIN_EVAL_PROMPT_LEAKAGE")

def execute(args,approved,training,evaluation,request):
 try:
  import torch
  from datasets import Dataset
  from peft import LoraConfig,prepare_model_for_kbit_training
  from transformers import AutoTokenizer,AutoModelForCausalLM,BitsAndBytesConfig
  from trl import SFTConfig,SFTTrainer
 except ImportError as err:raise SystemExit("TRAINING_DEPENDENCIES_NOT_INSTALLED") from err
 if not torch.cuda.is_available():raise SystemExit("CUDA_GPU_REQUIRED_NO_TRAINING_STARTED")
 props=torch.cuda.get_device_properties(torch.cuda.current_device())
 if props.total_memory/1024**3 < TIERS[args.tier].min_vram_gib_recommendation:
  raise SystemExit("INSUFFICIENT_SINGLE_GPU_VRAM_FOR_TIER")
 if not args.allow_model_download:
  os.environ["HF_HUB_OFFLINE"]="1"
  os.environ["TRANSFORMERS_OFFLINE"]="1"
 dest=Path(args.output).resolve()
 if dest in (Path.cwd().resolve(),Path.home().resolve()):raise SystemExit("UNSAFE_OUTPUT_DIRECTORY")
 request_path=dest/"training-request.json"
 if args.resume:
  if not request_path.is_file():raise SystemExit("MISSING_RESUME_REQUEST_MANIFEST")
  verify_resume(json.loads(request_path.read_text(encoding="utf8")),request)
  checkpoint=latest_checkpoint(dest/"checkpoints")
  if not (checkpoint/"optimizer.pt").is_file() or not (checkpoint/"scheduler.pt").is_file():
   raise SystemExit("RESUME_REQUIRES_OPTIMIZER_AND_SCHEDULER_STATE")
 else:
  if dest.exists() and any(dest.iterdir()):raise SystemExit("OUTPUT_MUST_BE_NEW_OR_EMPTY")
  dest.mkdir(parents=True,exist_ok=True)
  request_path.write_text(json.dumps(request,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
  request_path.chmod(0o600)
  checkpoint=None
 desc=TIERS[args.tier]
 tokenizer=AutoTokenizer.from_pretrained(desc.base_model,trust_remote_code=False,local_files_only=not args.allow_model_download)
 if tokenizer.pad_token is None:tokenizer.pad_token=tokenizer.eos_token
 bf16=bool(torch.cuda.is_bf16_supported())
 quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type="nf4",
                         bnb_4bit_use_double_quant=True,
                         bnb_4bit_compute_dtype=torch.bfloat16 if bf16 else torch.float16)
 model=AutoModelForCausalLM.from_pretrained(desc.base_model,quantization_config=quant,
                                           device_map={"":torch.cuda.current_device()},
                                           trust_remote_code=False,local_files_only=not args.allow_model_download)
 model.config.use_cache=False
 model=prepare_model_for_kbit_training(model)
 peft=LoraConfig(r=desc.lora_rank,lora_alpha=2*desc.lora_rank,lora_dropout=0.05,
                target_modules=request["lora_target_modules"],bias="none",task_type="CAUSAL_LM")
 # Standard conversational prompt-completion: optimize assistant completion only.
 def pair(x):return {"prompt":x["messages"][:2],"completion":[x["messages"][2]]}
 train_data=Dataset.from_list([pair(x) for x in training])
 eval_data=Dataset.from_list([pair(x) for x in evaluation])
 cfg=SFTConfig(output_dir=str(dest/"checkpoints"),max_length=request["sequence_length"],
  per_device_train_batch_size=1,per_device_eval_batch_size=1,
  gradient_accumulation_steps=request["gradient_accumulation_steps"],
  learning_rate=request["learning_rate"],max_steps=request["gradient_updates_requested"],
  warmup_ratio=0.03,gradient_checkpointing=True,report_to="none",seed=20261024,
  completion_only_loss=True,assistant_only_loss=False,packing=False,
  save_strategy="steps",save_steps=request["save_steps"],save_total_limit=3,
  eval_strategy="steps",eval_steps=request["eval_steps"],logging_steps=25,
  bf16=bf16,fp16=not bf16,optim="paged_adamw_8bit")
 trainer=SFTTrainer(model=model,args=cfg,train_dataset=train_data,eval_dataset=eval_data,
                    peft_config=peft,processing_class=tokenizer)
 outcome=trainer.train(resume_from_checkpoint=str(checkpoint) if checkpoint else None)
 final_step=int(trainer.state.global_step)
 metrics=trainer.evaluate()
 if final_step!=request["gradient_updates_requested"]:
  raise SystemExit(f"PARTIAL_TRAINING_{final_step}_STEPS")
 adapter=dest/"adapter"
 if adapter.exists():raise SystemExit("REFUSE_TO_OVERWRITE_ADAPTER")
 trainer.save_model(str(adapter))
 tokenizer.save_pretrained(str(adapter))
 weights=adapter/"adapter_model.safetensors"
 if not weights.is_file() or weights.stat().st_size<1000:raise SystemExit("ADAPTER_WEIGHTS_NOT_CREATED")
 record={"schema":1,"product":"October","tier":args.tier,"base_model":desc.base_model,
 "training_state":"completed","created_at_utc":datetime.now(timezone.utc).isoformat(),
 "completed_optimizer_steps":final_step,"requested_optimizer_steps":request["gradient_updates_requested"],
 "data_sha256":request["dataset_sha256"],"eval_data_sha256":request["eval_dataset_sha256"],"reviewed_rows":len(approved),"training_rows":len(training),
 "holdout_rows":len(evaluation),"train_loss":float(outcome.training_loss),
 "eval_loss":float(metrics.get("eval_loss",float("nan"))),
 "adapter_sha256":fingerprint(weights),"gpu":torch.cuda.get_device_name(0),
 "request_digest":request["request_digest"]}
 if not (math.isfinite(record["train_loss"]) and math.isfinite(record["eval_loss"])):
  raise SystemExit("NONFINITE_LOSS_NOT_RELEASEABLE")
 (dest/"training-provenance.json").write_text(json.dumps(record,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
 print(json.dumps(record,ensure_ascii=False))

def main(argv=None):
 ap=argparse.ArgumentParser()
 ap.add_argument("--tier",required=True,choices=TIERS.keys())
 ap.add_argument("--dataset",help="Private human-reviewed and consented training JSONL")
 ap.add_argument("--eval-dataset",help="Separate human-reviewed evaluation JSONL; never optimized on")
 ap.add_argument("--output")
 ap.add_argument("--steps",type=int,default=150000)
 ap.add_argument("--max-length",type=int)
 ap.add_argument("--accumulation",type=int,default=8)
 ap.add_argument("--checkpoint-every",type=int,default=500)
 ap.add_argument("--eval-every",type=int,default=2000)
 ap.add_argument("--learning-rate",type=float,default=0.0001)
 ap.add_argument("--train",action="store_true")
 ap.add_argument("--validate-data",action="store_true")
 ap.add_argument("--resume",action="store_true")
 ap.add_argument("--approve-gpu-compute",action="store_true")
 ap.add_argument("--ack-model-license",action="store_true")
 ap.add_argument("--allow-model-download",action="store_true",
                 help="Explicit download permission; otherwise use offline cached weights")
 ap.add_argument("--approve-150k",action="store_true")
 args=ap.parse_args(argv)
 if args.resume and not args.train:ap.error("--resume requires --train")
 if args.validate_data and args.train:ap.error("--validate-data and --train are mutually exclusive")
 try:
  plan=config(tier=args.tier,steps=args.steps,sequence_length=args.max_length,
   accumulation=args.accumulation,checkpoint_every=args.checkpoint_every,
   eval_every=args.eval_every,learning_rate=args.learning_rate)
 except ValueError as err:ap.error(str(err))
 if args.validate_data:
  if not args.dataset or not args.eval_dataset:ap.error("--validate-data requires --dataset and --eval-dataset")
  from dataset import validate_jsonl
  train,digest=validate_jsonl(args.dataset,min_rows=1000 if args.steps>5000 else 100)
  holdout,edigest=validate_jsonl(args.eval_dataset,min_rows=100)
  verify_no_leakage(train,holdout)
  print(json.dumps({"mode":"DATASET_VALIDATION_ONLY","rows":len(train)+len(holdout),
    "training_rows":len(train),"holdout_rows":len(holdout),"dataset_sha256":digest,
    "eval_sha256":edigest,"training_executed":False},ensure_ascii=False))
  return 0
 available=hardware()
 if not args.train:
  print(json.dumps({"mode":"DRY_RUN_ONLY","plan":plan,"host":available,
                    "dataset_available":bool(args.dataset and Path(args.dataset).is_file()),
                    "training_executed":False},indent=2,ensure_ascii=False))
  return 0
 if not args.approve_gpu_compute:ap.error("Explicit --approve-gpu-compute required")
 if not args.ack_model_license:ap.error("Explicit --ack-model-license required")
 if args.steps>5000 and not args.approve_150k:ap.error("Long training requires --approve-150k")
 if not args.dataset or not args.eval_dataset or not args.output:
  ap.error("--train requires --dataset, --eval-dataset and --output")
 if not available["cuda"]:raise SystemExit("CUDA_GPU_REQUIRED_NO_TRAINING_STARTED")
 from dataset import validate_jsonl,SYSTEM
 rows,digest=validate_jsonl(args.dataset,min_rows=1000 if args.steps>5000 else 100)
 holdout,edigest=validate_jsonl(args.eval_dataset,min_rows=100)
 verify_no_leakage(rows,holdout)
 def conversation(row):return {"messages":[{"role":"system","content":SYSTEM},
    {"role":"user","content":row["user"]},{"role":"assistant","content":row["assistant"]}]}
 training=[conversation(x) for x in rows]
 evaluation=[conversation(x) for x in holdout]
 plan["dataset_sha256"]=digest
 plan["eval_dataset_sha256"]=edigest
 request={**plan,"approved_rows":len(rows)+len(holdout),
          "training_rows":len(rows),"holdout_rows":len(holdout)}
 request["request_digest"]=hashlib.sha256(json.dumps(request,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()
 execute(args,rows,training,evaluation,request)
 return 0
if __name__=="__main__":sys.exit(main())
