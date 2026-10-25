#!/usr/bin/env python3
"""Real GPU QLoRA LoRA weights for seven Qwen3 sizes (0.6B through 32B).

This script deliberately does NOT train as part of GitHub CI. The only mode
without CUDA is --validate-only. No customer secrets, downloads, hosted GPU
expenses or silent model deployment. Requires independently approved data.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from dataset import validate_jsonl, to_conversations  # noqa: E402
from multisize_registry import get_spec, MODELS  # noqa: E402

def file_sha(path: Path)->str:
    digest=hashlib.sha256()
    with path.open("rb") as handle:
        for part in iter(lambda:handle.read(1024*1024),b""):
            digest.update(part)
    return digest.hexdigest()

def preflight(*,model_size:str,dataset:Path,steps:int,max_length:int,
              base_revision:str|None=None)->dict:
    spec=get_spec(model_size)
    if not 16<=steps<=5000 or not 128<=max_length<=2048:
        raise ValueError("UNSUPPORTED_STEPS_OR_SEQUENCE_LENGTH")
    if base_revision is not None and not re.fullmatch(r"[0-9a-fA-F]{40}",base_revision):
        raise ValueError("PIN_BASE_REVISION_TO_40_HEX_COMMIT")
    rows,digest=validate_jsonl(dataset)
    train,holdout=to_conversations(rows)
    if len(holdout)<5:
        raise ValueError("FIVE_INDEPENDENT_HOLDOUT_RECORDS_REQUIRED")
    if len({x["id"].split("__",1)[0] for x in rows})<20:
        raise ValueError("INSUFFICIENT_DISTINCT_REVIEWED_TASK_FAMILIES")
    train_pairs={(x["messages"][-2]["content"],x["messages"][-1]["content"]) for x in train}
    holdout_pairs={(x["messages"][-2]["content"],x["messages"][-1]["content"]) for x in holdout}
    if train_pairs&holdout_pairs:
        raise ValueError("APPROVED_TRAIN_HOLDOUT_LEAKAGE")
    return {
        "model_size":spec.key,"base_model":spec.base,"ollama_base_tag":spec.ollama,
        "architecture":spec.architecture,"min_training_vram_gib_guidance":spec.min_vram_gib,
        "training_hardware_required":"owner-approved NVIDIA CUDA",
        "dataset_sha256":digest,"reviewed_rows":len(rows),
        "training_rows":len(train),"heldout_rows":len(holdout),
        "unique_reviewed_task_families":len({x["id"].split("__",1)[0] for x in rows}),
        "steps_planned":steps,"max_length":max_length,
        "lora_target_modules":list(spec.lora_targets),
        "base_revision":base_revision,"adapter_trained":False,"weights_created":False,
    }

def train_model(*,model_size:str,dataset:Path,output:Path,steps:int,max_length:int,
                base_revision:str,allow_download:bool,ack_low_vram:bool)->dict:
    receipt=preflight(model_size=model_size,dataset=dataset,steps=steps,max_length=max_length,
                      base_revision=base_revision)
    spec=get_spec(model_size)
    if not re.fullmatch(r"[a-fA-F0-9]{40}",base_revision):
        raise ValueError("IMMUTABLE_HF_BASE_COMMIT_REQUIRED")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("REFUSE_TO_OVERWRITE_TRAINED_WEIGHTS")
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, prepare_model_for_kbit_training
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from trl import SFTConfig, SFTTrainer
    except ImportError as err:
        raise RuntimeError("INSTALL_OWNER_GPU_QLORA_REQUIREMENTS_FIRST") from err
    if not torch.cuda.is_available():
        raise RuntimeError("REAL_CUDA_REQUIRED_NO_FAKE_CPU_LORA")
    vram=torch.cuda.get_device_properties(0).total_memory/(1024**3)
    if vram<spec.min_vram_gib and not ack_low_vram:
        raise RuntimeError(
            f"GPU_HAS_{vram:.1f}_GIB_MODEL_{model_size}_GUIDE_"
            f"{spec.min_vram_gib}_GIB; use explicit --ack-low-vram-risk to experiment"
        )
    torch.manual_seed(20261025)
    rows,_=validate_jsonl(dataset)
    training,holdout=to_conversations(rows)
    prompt_completion=lambda x:{
        "prompt":x["messages"][:-1],
        "completion":x["messages"][-1:],
    }
    training_set=Dataset.from_list([prompt_completion(x) for x in training])
    holdout_set=Dataset.from_list([prompt_completion(x) for x in holdout])
    precision=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type="nf4",
                             bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=precision)
    tokenizer=AutoTokenizer.from_pretrained(
        spec.base,revision=base_revision,trust_remote_code=False,
        local_files_only=not allow_download
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(
        spec.base,revision=base_revision,trust_remote_code=False,
        quantization_config=quant,device_map={"":torch.cuda.current_device()},
        local_files_only=not allow_download
    )
    model.config.use_cache=False
    model=prepare_model_for_kbit_training(model,use_gradient_checkpointing=True)
    peft=LoraConfig(r=8,lora_alpha=16,lora_dropout=.05,
                    target_modules=list(spec.lora_targets),
                    bias="none",task_type="CAUSAL_LM")
    cfg=SFTConfig(
        output_dir=str(output/"checkpoints"),
        max_length=max_length,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        max_steps=steps,learning_rate=7e-5,warmup_ratio=.03,
        gradient_checkpointing=True,
        completion_only_loss=True,packing=False,
        save_strategy="no",logging_steps=10,report_to="none",
        bf16=precision==torch.bfloat16,fp16=precision==torch.float16,
        seed=20261025,push_to_hub=False
    )
    trainer=SFTTrainer(
        model=model,args=cfg,train_dataset=training_set,eval_dataset=holdout_set,
        processing_class=tokenizer,peft_config=peft
    )
    outcome=trainer.train()
    validation=trainer.evaluate()
    train_loss=float(outcome.training_loss)
    eval_loss=float(validation.get("eval_loss",float("nan")))
    if not math.isfinite(train_loss) or not math.isfinite(eval_loss):
        raise RuntimeError("NONFINITE_TRAIN_OR_EVAL_LOSS_REJECT_WEIGHTS")
    adapter=output/"adapter"
    adapter.mkdir(parents=True,exist_ok=False)
    trainer.model.save_pretrained(str(adapter),safe_serialization=True)
    tokenizer.save_pretrained(str(adapter))
    weights=adapter/"adapter_model.safetensors"
    config=adapter/"adapter_config.json"
    if not weights.is_file() or weights.stat().st_size<=1000 or not config.is_file():
        raise RuntimeError("QLORA_ADAPTER_WEIGHTS_NOT_CREATED")
    learned={
        **receipt,"model_size":model_size,
        "adapter_trained":True,"weights_created":True,
        "training_state":"trained-adapter-not-merged-not-deployed",
        "base_revision":base_revision.lower(),
        "local_only_input":not allow_download,
        "architecture_aware_attention_only":spec.architecture=="moe",
        "gpu_name":torch.cuda.get_device_name(0),
        "available_vram_gib":round(vram,2),
        "actual_optimizer_steps":int(outcome.global_step),
        "adapter_sha256":file_sha(weights),
        "adapter_config_sha256":file_sha(config),
        "train_loss":train_loss,"eval_loss":eval_loss,
        "created_utc":datetime.now(timezone.utc).isoformat(),
        "qwen_full_base_weights_updated":False,
        "qwen_lora_adapter_updated":True,
        "merged_or_ollama_model_registered":False,
    }
    if learned["actual_optimizer_steps"]!=steps:
        raise RuntimeError("OPTIMIZER_STEP_COUNT_MISMATCH")
    (output/"training-provenance.json").write_text(
        json.dumps(learned,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return learned

def main(argv=None)->int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--model-size",required=True,choices=[x.key for x in MODELS])
    parser.add_argument("--dataset",type=Path,required=True)
    parser.add_argument("--output",type=Path)
    parser.add_argument("--steps",type=int,default=180)
    parser.add_argument("--max-length",type=int,default=512)
    parser.add_argument("--base-revision",help="immutable 40-hex Hugging Face commit")
    parser.add_argument("--allow-download",action="store_true",
                        help="explicitly permit pulling the exact official pinned base model")
    parser.add_argument("--ack-low-vram-risk",action="store_true")
    choice=parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--validate-only",action="store_true")
    choice.add_argument("--train",action="store_true")
    args=parser.parse_args(argv)
    if args.validate_only:
        print(json.dumps(preflight(model_size=args.model_size,dataset=args.dataset,
                        steps=args.steps,max_length=args.max_length,
                        base_revision=args.base_revision),ensure_ascii=False))
        return 0
    if not args.output or not args.base_revision:
        parser.error("REAL_GPU_TRAINING_REQUIRES_OUTPUT_AND_PINNED_BASE_REVISION")
    report=train_model(model_size=args.model_size,dataset=args.dataset,
        output=args.output,steps=args.steps,max_length=args.max_length,
        base_revision=args.base_revision,allow_download=args.allow_download,
        ack_low_vram=args.ack_low_vram_risk)
    print("OCTUBER_REAL_QWEN3_LORA_ADAPTER",json.dumps(report,ensure_ascii=False))
    return 0

if __name__=="__main__":
    sys.exit(main())
