#!/usr/bin/env python3
"""Honest preflight for an *actual* Qwen3 LoRA weight-update request.

This checks whether the CURRENT host and approved data can execute the GPU
trainer; it never downloads weights, auto-labels data, installs dependencies,
rents hardware, queues tasks or creates pretend .safetensors files.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path
from multisize_registry import get_spec

def check(*,model_size:str,dataset:Path|None,base_revision:str|None,
          allow_download:bool=False)->dict:
    model=get_spec(model_size)
    checks=[]
    def record(name,passed,reason):
        checks.append({"requirement":name,"ready":bool(passed),"detail":reason})
    try:
        import torch
        cuda=bool(torch.cuda.is_available())
        vram=(torch.cuda.get_device_properties(0).total_memory/(1024**3)) if cuda else 0.0
    except ImportError:
        cuda=False
        vram=0.0
    record("owner_cuda_gpu",cuda,
           f"Detected CUDA GPU with {vram:.1f} GiB VRAM" if cuda else
           "No CUDA GPU accessible from this runtime")
    record("gpu_memory_guidance",bool(cuda and vram>=model.min_vram_gib),
           f"Detected {vram:.1f} GiB; conservative QLoRA guide {model.min_vram_gib} GiB")
    pinned=bool(base_revision and re.fullmatch(r"[0-9a-fA-F]{40}",base_revision))
    record("immutable_base_revision",pinned,
           "Pinned official Hugging Face base commit supplied" if pinned else
           "Missing valid 40-hex commit pin for actual model lineage")
    if dataset is None or not dataset.exists():
        record("approved_dataset",False,
               "No user-owned human-reviewed training JSONL is accessible")
    else:
        try:
            from multisize_train import preflight
            report=preflight(model_size=model_size,dataset=dataset,
                             steps=180,max_length=512,
                             base_revision=base_revision if pinned else None)
            record("approved_dataset",True,
                   f"{report['reviewed_rows']} approved dialogues; {report['heldout_rows']} held-out")
        except (ValueError, OSError, KeyError, json.JSONDecodeError) as err:
            record("approved_dataset",False,f"{type(err).__name__}: {err}")
    if not pinned:
        cache_ready=False
        cache_note="Cannot verify base cache without a pinned revision"
    else:
        root=Path(os.environ.get("HF_HOME",str(Path.home()/".cache"/"huggingface")))/"hub"
        snapshot=root/("models--"+model.base.replace("/","--"))/"snapshots"/base_revision
        # A config alone is not a complete base; an index or weights file is needed.
        config=(snapshot/"config.json").is_file()
        weights=(snapshot/"model.safetensors.index.json").is_file() or any(snapshot.glob("*.safetensors"))
        cache_ready=config and weights
        cache_note=f"Local pinned config={config}, local weights/index={weights} (integrity still requires model load)"
    record("base_weights_present_or_download_authorized",
           bool(pinned and (cache_ready or allow_download)),
           cache_note if cache_ready or not allow_download else
           "Explicit model download authorized; actual download and model load not executed")
    all_ready=all(x["ready"] for x in checks)
    return {
        "task":"actual_qwen3_local_qlora_fine_tuning",
        "model_size":model.key,"base_model":model.base,
        "status":"preflight-eligible-untrained" if all_ready else "blocked-untrained",
        "checks":checks,"actual_qwen_optimizer_steps":0,
        "new_lora_adapter_created":False,
        "no_training_started":True,
        "policy":"Do not label a model trained without real GPU steps and a verified adapter_model.safetensors"
    }

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--model-size",choices=["0.6b","1.7b","4b","8b","14b","30b","32b"],required=True)
    p.add_argument("--dataset",type=Path)
    p.add_argument("--base-revision")
    p.add_argument("--allow-download",action="store_true",
                   help="acknowledge base download will be permitted for a separate explicit train invocation")
    p.add_argument("--output",type=Path)
    args=p.parse_args(argv)
    status=check(model_size=args.model_size,dataset=args.dataset,
                 base_revision=args.base_revision,allow_download=args.allow_download)
    receipt=json.dumps(status,ensure_ascii=False,indent=2)+"\n"
    if args.output:
        if args.output.exists():raise SystemExit("REFUSE_TO_OVERWRITE_PREFLIGHT_RECEIPT")
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(receipt,encoding="utf8")
    print(receipt,end="")
    return 0

if __name__=="__main__":
    sys.exit(main())
