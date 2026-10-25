#!/usr/bin/env python3
"""Reproducible, explicit-source SLIME sandbox ZIP for Windows/macOS/Linux.

Source code only: never copies user datasets, secret keys, raw book/paper
fulltexts, Hugging Face checkpoints, LoRA adapter weights or local caches.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

PACKAGE="Slime-Sandbox-Toolkit"
COPY_FIXED=[
 "scripts/train-penteract-10m.mjs",
 "tests/ts-extension-loader.mjs",
 "services/slime/sandbox_center.py",
 "services/slime/sandbox_window.py",
 "services/slime/unified_tools_window.py",
 "services/slime/local_model_tools.py",
 "services/slime/local_model_window.py",
 "training/atuber/dataset.py",
 "training/atuber/core_contract.py",
 "training/atuber/multisize_registry.py",
 "training/atuber/multisize_train.py",
 "training/atuber/actual_gpu_execution_gate.py",
 "package.json",
 "docs/ATUBER_LIBRARY_SANDBOX.md",
 "docs/DETROIT_ATUBER_5D_10M_SANDBOX.md",
 "docs/OCTUBER_HUMAN_SHOPPER_SIMULATION.md",
 "docs/OCTUBER_MULTISIZE_LOCAL_MODELS.md",
 "docs/SLIME_LOCAL_AI_MODEL_TOOLS.md",
]
FOLDERS=("training","src/detroit")
SCRIPT_TYPES={".py",".mjs",".ts",".md"}
DANGEROUS=(r"(^|/)\.env",r"(^|/)(private|secrets|keys|credentials|data|artifacts|checkpoints|cache|models)/",
           r"\.(?:sqlite3?|db|safetensors|gguf|pt|pth|bin|pkl|pickle|onnx|zip|tar|gz)$")
MAX_SOURCE_FILE=5_000_000
MAX_TOTAL=35_000_000

def collect(root:Path):
    paths=set(COPY_FIXED)
    for folder in FOLDERS:
        base=root/folder
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix in SCRIPT_TYPES:
                paths.add(path.relative_to(root).as_posix())
    approved=[]
    total=0
    for name in sorted(paths):
        if any(re.search(rule,name,re.I) for rule in DANGEROUS):
            raise ValueError("BUNDLE_UNSAFE_PATH_"+name)
        source=root/name
        if not source.is_file():
            # Compatibility docs from a different branch are optional.
            if name.startswith("docs/"):
                continue
            raise ValueError("BUNDLE_REQUIRED_SOURCE_MISSING_"+name)
        if source.is_symlink() or not source.resolve().is_relative_to(root):
            raise ValueError("BUNDLE_SOURCE_SYMLINK_NOT_ALLOWED_"+name)
        size=source.stat().st_size
        if size>MAX_SOURCE_FILE:
            raise ValueError("BUNDLE_SOURCE_TOO_BIG_"+name)
        total+=size
        if total>MAX_TOTAL:
            raise ValueError("BUNDLE_TOTAL_LIMIT")
        approved.append((name,source))
    if len(approved)<38:
        raise ValueError("BUNDLE_EXPECTED_MULTI_SANDBOX_SOURCES_MISSING")
    return approved

def make(root:Path,out:Path):
    root=root.resolve(strict=True)
    sources=collect(root)
    if out.exists():
        raise ValueError("BUNDLE_DO_NOT_OVERWRITE")
    out.parent.mkdir(parents=True,exist_ok=True)
    index=[]
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
        for name,source in sources:
            payload=source.read_bytes()
            entry=PACKAGE+"/"+name
            index.append({"path":name,"size":len(payload),
                          "sha256":hashlib.sha256(payload).hexdigest()})
            info=zipfile.ZipInfo(entry,date_time=(2026,10,25,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o644<<16
            z.writestr(info,payload,compress_type=zipfile.ZIP_DEFLATED)
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location("slime_sandbox_center",str(root/"services/slime/sandbox_center.py"))
        module=module_from_spec(spec)
        spec.loader.exec_module(module)
        manifest={
          "schema":1,"name":PACKAGE,"version":"2026-10-25",
          "source_files":len(index),
          "files":index,
          "registered_sandbox_count":len(module.TASKS),
          "registered_sandbox_ids":[row["id"] for row in module.TASKS],
          "status":"source-toolkit-not-LLM-model-weights",
          "owner_local_execution_only":True,
          "model_base_weights_included":False,
          "private_datasets_included":False,
          "automatic_downloads_or_training":False,
        }
        z.writestr(PACKAGE+"/sandbox-manifest.json",
                   json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
        z.writestr(PACKAGE+"/README-FIRST.txt",
            "SLIME 統一沙盤原始碼套件。解壓至自己的電腦；先安裝 Python 3.12、"
            "Node.js 22 和任務需要的依賴。\n"
            "使用 SLIME Owner --tools → 沙盤中心，選擇此資料夾。"
            "重型任務及網路任務需各別明確同意。\n"
            "只含來源程式；沒有任何 Qwen／October／30B／60B 新權重、"
            "私人資料集、授權書全文或自動訓練。\n")
    result={
        "toolkit":str(out),"source_files":len(index),
        "registered_sandboxes":len(module.TASKS),
        "sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
        "bytes":out.stat().st_size,
        "weights_or_private_data_included":False
    }
    return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path(__file__).resolve().parents[2])
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    print(json.dumps(make(args.repo,args.output),ensure_ascii=False,indent=2))
if __name__=="__main__":
    main()
