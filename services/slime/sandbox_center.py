"""SLIME Owner offline sandbox registry and explicit local runner.

Catalogues existing engineering simulations. A sandbox episode, SGD step, an
evaluation pass and a genuine Qwen language-weight update are different units.
Nothing runs when a model is selected or a remote node pairs. Every runnable
task has a vetted path and fixed argv: no model-written commands or shell=True.
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

TASKS = (
 # Existing main branch sandboxes
 {"id":"detroit-five-d-10m","name":"Detroit／阿土伯五維 1,000 萬次 SGD","group":"detroit","script":"scripts/train-penteract-10m.mjs","engine":"node","input":"none","mode":"synthetic-gradient","weight_scope":"five-dimensional-tiny-projector","large":True,"network":False},
 {"id":"octuber-gpu-capacity","name":"30B／60B GPU 容量規劃沙盤","group":"gpu","script":"training/octuber-gpu-sandbox/sandbox.py","engine":"python","input":"none","mode":"planning-only","weight_scope":"none","large":False,"network":False},
 {"id":"octuber-gpu-toy-cpu","name":"GPU 沙盤小型 CPU 梯度實驗","group":"gpu","script":"training/octuber-gpu-sandbox/sandbox.py","engine":"python","input":"none","mode":"tiny-synthetic-gradient","weight_scope":"tiny-toy","large":False,"network":False},
 {"id":"octuber-gpu-toy-cuda","name":"GPU 沙盤小型 CUDA 梯度實驗","group":"gpu","script":"training/octuber-gpu-sandbox/sandbox.py","engine":"python","input":"none","mode":"tiny-cuda-gradient","weight_scope":"tiny-toy","large":True,"network":False},
 {"id":"octuber-virtual-host","name":"30B／60B 虛擬主機排程沙盤","group":"gpu","script":"training/octuber-gpu-sandbox/virtual_host.py","engine":"python","input":"none","mode":"synthetic-scheduling","weight_scope":"none","large":False,"network":False},
 {"id":"octuber-core-100k","name":"30B／60B 機制 100,000 次小參數更新","group":"gpu","script":"training/octuber-gpu-sandbox/core_sandbox.py","engine":"python","input":"none","mode":"tiny-synthetic-gradient","weight_scope":"72-parameter-surrogate","large":True,"network":False},
 {"id":"liuan-catalog","name":"柳岸書城開放書目索引","group":"library","script":"training/atuber-books/catalog_sandbox.py","engine":"python","input":"csv","mode":"metadata-index-only","weight_scope":"none","large":False,"network":False},
 {"id":"liuan-title-1m","name":"柳岸書城書名分類 100 萬次","group":"library","script":"training/atuber-books/title_weight_sandbox.py","engine":"python","input":"sqlite","mode":"tiny-synthetic-gradient","weight_scope":"small-title-ranker","large":True,"network":False},
 {"id":"liuan-content-1m","name":"已授權圖書正文分類 100 萬次","group":"library","script":"training/atuber-books/content_weight_sandbox.py","engine":"python","input":"approved-sqlite","mode":"licensed-content-gradient","weight_scope":"small-lexical-ranker","large":True,"network":False},
 {"id":"liuan-fuzzy-1m","name":"柳岸書城模糊關鍵詞 100 萬次","group":"library","script":"training/atuber-books/fuzzy_relevance_train.py","engine":"python","input":"approved-sqlite","mode":"small-ranker-gradient","weight_scope":"small-fuzzy-ranker","large":True,"network":False},
 {"id":"liuan-gutenberg-pilot","name":"圖書公版授權來源試驗","group":"library","script":"training/atuber-books/public_domain_pilot.py","engine":"python","input":"none","mode":"authorized-source-pilot","weight_scope":"none","large":False,"network":True},
 {"id":"liuan-nbinet-pilot","name":"圖書開放書目下載試驗","group":"library","script":"training/atuber-books/download_public_catalogue.py","engine":"python","input":"none","mode":"authorized-source-pilot","weight_scope":"none","large":False,"network":True},
 {"id":"xiahai-scholar-pilot","name":"霞海書院開放論文許可試驗","group":"scholar","script":"training/scholarly/live_ingest.py","engine":"python","input":"arxiv-ids","mode":"licensed-fulltext-pilot","weight_scope":"none","large":False,"network":True},
 # Former feature branch modules folded into main in this staged release
 {"id":"octuber-shopper-1m","name":"October 模擬真人購物 100 萬次","group":"shopping","script":"training/atuber/human_shopper_sim.py","engine":"python","input":"ndc-csv","mode":"simulated-buyer-journeys","weight_scope":"none","large":True,"network":False},
 {"id":"octuber-shopper-policy","name":"October 歷史價位區間神經決策模型","group":"shopping","script":"training/atuber/human_shopper_policy_net.py","engine":"python","input":"ndc-csv","mode":"small-neural-gradient","weight_scope":"small-price-range-policy","large":False,"network":False},
 {"id":"atuber-language-candidates","name":"阿土伯語言微調教材草稿","group":"language","script":"training/atuber/price_tool_sft_candidates.py","engine":"python","input":"none","mode":"UNREVIEWED-candidate-generation","weight_scope":"none","large":False,"network":False},
 {"id":"atuber-local-qlora-gate","name":"七尺寸 QLoRA GPU 與資料預檢","group":"language","script":"training/atuber/actual_gpu_execution_gate.py","engine":"python","input":"none","mode":"read-only-preflight","weight_scope":"none","large":False,"network":False},
)
BY_ID={x["id"]:x for x in TASKS}
assert len(BY_ID)==len(TASKS)
SAFE_ID=re.compile(r"^[a-z][a-z0-9-]{2,70}$")
ARXIV_IDS=re.compile(r"^[0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?(?:,[0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)*$")
SCAN_ROOTS=("training","scripts")

def catalog(root: str|Path) -> dict:
    path=Path(root).expanduser().resolve(strict=True)
    known={x["script"] for x in TASKS}
    items=[{**task,"available":(path/task["script"]).is_file(),
            "bundled_weight_file":False} for task in TASKS]
    # Show additional sandbox scripts as undispatched (no unsafe auto-run).
    candidates=[]
    for folder in SCAN_ROOTS:
        base=path/folder
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if not p.is_file() or p.suffix not in (".py",".mjs"):
                continue
            rel=p.relative_to(path).as_posix()
            if (rel in known or p.name.startswith(("test_","__"))
                    or len(p.parts)>14):
                continue
            if any(word in rel.lower() for word in ("sandbox","train","simulation","pilot")):
                candidates.append({"script":rel,"state":"discovered-not-authorized-for-run",
                                   "reason":"尚未納入固定安全參數與權限檢查，僅列入盤點"})
    return {
        "type":"slime-owner-local-sandbox-index",
        "tasks":items,
        "available_count":sum(bool(x["available"]) for x in items),
        "unregistered_sandbox_scripts":sorted(candidates,key=lambda x:x["script"]),
        "no_automatic_training_or_download":True,
        "local_only":True,
    }

def compile_plan(root: str|Path, task_id:str, *, input_path:str|Path|None=None,
                 arxiv_ids:str|None=None, model_size:str="1.7b",
                 output_root:str|Path|None=None, python_exe:str|None=None,
                 node_exe:str|None=None)->dict:
    if task_id not in BY_ID:
        raise ValueError("SLIME_SANDBOX_TASK_UNREGISTERED")
    task=BY_ID[task_id]
    repo=Path(root).expanduser().resolve(strict=True)
    script=repo/task["script"]
    if not script.is_file() or not script.resolve().is_relative_to(repo):
        raise ValueError("SLIME_SANDBOX_SCRIPT_UNAVAILABLE")
    python=python_exe or shutil.which("python3") or shutil.which("python")
    node=node_exe or shutil.which("node")
    if task["engine"]=="python":
        if not python:
            raise ValueError("SLIME_LOCAL_PYTHON_MISSING")
        argv=[python,str(script)]
    else:
        if not node:
            raise ValueError("SLIME_LOCAL_NODE22_MISSING")
        loader=repo/"tests"/"ts-extension-loader.mjs"
        if not loader.is_file():
            raise ValueError("SLIME_LOCAL_TYPESCRIPT_LOADER_MISSING")
        argv=[node,"--experimental-strip-types","--experimental-loader",str(loader),str(script)]
    source=None
    input_type=task["input"]
    if input_type in ("csv","sqlite","approved-sqlite","ndc-csv"):
        if input_path is None:
            raise ValueError("SLIME_SANDBOX_SOURCE_FILE_REQUIRED")
        source=Path(input_path).expanduser().resolve(strict=True)
        if not source.is_file() or source.suffix.lower() not in ((".csv",) if "csv" in input_type else (".sqlite3",".sqlite",".db")):
            raise ValueError("SLIME_SANDBOX_INPUT_FILE_TYPE_INVALID")
    if input_type=="arxiv-ids" and (not arxiv_ids or not ARXIV_IDS.fullmatch(arxiv_ids)):
        raise ValueError("SLIME_ARXIV_IDS_REQUIRED")
    if output_root is None:
        output_base=Path.home()/".vanilla"/"slime"/"sandbox-runs"
    else:
        output_base=Path(output_root).expanduser()
    target=output_base.resolve()/task_id/(
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        +"-"+uuid.uuid4().hex[:8])
    # Limit construction to literal task-specific flags; never shell-evaluate.
    if task_id=="detroit-five-d-10m":
        argv+=["--steps","10000000","--out-dir",str(target/"output")]
    elif task_id=="octuber-gpu-capacity":
        argv+=["--models","all","--mode","plan","--output",str(target/"report.json")]
    elif task_id in ("octuber-gpu-toy-cpu","octuber-gpu-toy-cuda"):
        argv+=["--models","all","--mode",
                "toy-cuda" if task_id.endswith("-cuda") else "toy-cpu",
                "--steps","20","--output",str(target/"report.json")]
    elif task_id=="octuber-virtual-host":
        argv+=["--models","all","--steps","20","--output",str(target/"report.json")]
    elif task_id=="octuber-core-100k":
        argv+=["--model","all","--steps","100000","--output",str(target/"report.json")]
    elif task_id=="liuan-catalog":
        argv+=["--csv",str(source),"--source","nbinet",
               "--output",str(target/"output"),"--execute"]
    elif task_id in ("liuan-title-1m","liuan-content-1m","liuan-fuzzy-1m"):
        flag="--database" if task_id=="liuan-title-1m" else "--index"
        argv+=[flag,str(source),"--output",str(target/"output"),
               "--steps","1000000","--execute"]
    elif task_id=="liuan-gutenberg-pilot":
        argv+=["--output",str(target/"output"),"--execute"]
    elif task_id=="liuan-nbinet-pilot":
        argv+=["--output",str(target/"nbinet.csv"),"--execute"]
    elif task_id=="xiahai-scholar-pilot":
        for paper in arxiv_ids.split(","):
            argv+=["--arxiv-id",paper]
        argv+=["--output",str(target/"output"),"--execute"]
    elif task_id=="octuber-shopper-1m":
        argv+=["--input",str(source),"--mode","ndc-official",
               "--episodes","1000000","--output",str(target/"output")]
    elif task_id=="octuber-shopper-policy":
        argv+=["--input",str(source),"--train-cases","50000",
               "--validation-cases","12000","--steps","1000",
               "--output",str(target/"output")]
    elif task_id=="atuber-language-candidates":
        argv+=["--output",str(target/"unreviewed.jsonl")]
    elif task_id=="atuber-local-qlora-gate":
        if model_size not in ("0.6b","1.7b","4b","8b","14b","30b","32b"):
            raise ValueError("SLIME_QLORA_SIZE_INVALID")
        argv+=["--model-size",model_size,"--output",str(target/"report.json")]
    else:
        raise ValueError("SLIME_SANDBOX_TASK_NOT_IMPLEMENTED")
    return {"task":task,"argv":argv,"cwd":str(repo),"run_directory":str(target),
            "requires_heavy_opt_in":task["large"],
            "requires_network_opt_in":task["network"],
            "actual_qwen_llm_optimizer_steps":0,
            "actual_execution_started":False,"status":"preview-not-executed"}

def launch(root:str|Path, task_id:str, *, owner:bool, confirmed:bool,
           heavy_approved:bool=False,network_approved:bool=False,
           input_path:str|Path|None=None,arxiv_ids:str|None=None,
           model_size:str="1.7b",output_root:str|Path|None=None,
           python_exe:str|None=None,node_exe:str|None=None)->dict:
    if not owner or not confirmed:
        raise PermissionError("SLIME_OWNER_LOCAL_SANDBOX_CONFIRMATION_REQUIRED")
    plan=compile_plan(root,task_id,input_path=input_path,arxiv_ids=arxiv_ids,
                      model_size=model_size,output_root=output_root,
                      python_exe=python_exe,node_exe=node_exe)
    task=plan["task"]
    if task["large"] and not heavy_approved:
        raise PermissionError("SLIME_HEAVY_SANDBOX_EXPLICIT_OPT_IN_REQUIRED")
    if task["network"] and not network_approved:
        raise PermissionError("SLIME_NETWORK_SANDBOX_EXPLICIT_OPT_IN_REQUIRED")
    dest=Path(plan["run_directory"])
    dest.mkdir(parents=True,exist_ok=False,mode=0o700)
    # Create audit trail before launching; no model weights claimed by the launcher.
    receipt={k:v for k,v in plan.items() if k!="task"}
    receipt["task_id"]=task_id
    receipt["status"]="reserved-not-verified"
    receipt["task_mode"]=task["mode"]
    receipt["weight_scope"]=task["weight_scope"]
    (dest/"plan.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    env={k:v for k,v in os.environ.items()
         if k not in ("SLIME_NODE_TOKEN","VANILLA_API_KEY","VANILLA_SERVER_URL",
                      "GECKO_ENROLLMENT_TOKEN","OPENAI_API_KEY","HF_TOKEN")}
    log=dest/"output.log"
    with log.open("x",encoding="utf8") as output:
        process=subprocess.Popen(plan["argv"],cwd=plan["cwd"],
            stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,
            env=env,shell=False)
    return {"task_id":task_id,"status":"started-unverified","pid":process.pid,
            "report_directory":str(dest),"log_path":str(log),
            "no_claim_of_completion":True,
            "actual_qwen_llm_optimizer_steps":0}

def main(argv=None):
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo",type=Path,required=True)
    parser.add_argument("--list",action="store_true")
    opts=parser.parse_args(argv)
    # Public CLI only lists; training initiation is restricted to Owner UI.
    if not opts.list:
        parser.error("Use --list; execution requires explicit Owner UI confirmation")
    print(json.dumps(catalog(opts.repo),ensure_ascii=False,indent=2))
if __name__=="__main__":
    main()
