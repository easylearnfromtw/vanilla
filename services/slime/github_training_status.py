"""Read-only SLIME Owner view of PUBLIC GitHub Actions training workflows.

Never claims that a successful workflow is a validated adapter checkpoint:
GitHub status != LoRA weight attestation. No auth, runner dispatch, shell,
private repo access, model downloads, artifacts or background polling.
"""
from __future__ import annotations

from datetime import datetime,timezone
import json
import re
import urllib.error
import urllib.request

REPO="easylearnfromtw/vanilla"
API=f"https://api.github.com/repos/{REPO}/actions/runs?per_page=80"
TIMEOUT_SECONDS=12
MAX_BODY_BYTES=3_000_000
MAX_ROWS=18
HTTP=urllib.request.build_opener(urllib.request.ProxyHandler({}))

# Explicit names must correspond to GitHub workflows in our public source.
TRAINING_TYPES={
 "Atuber Real CPU LoRA Proof":("CPU Qwen3 LoRA","adapter-receipt-required"),
 "Atuber 100 Real Licensed Fulltext Training":("100 篇授權來源 CPU LoRA","adapter-receipt-required"),
 "Atuber 1000 Real Licensed Fulltext Training":("1000 篇授權來源 CPU LoRA","adapter-receipt-required"),
 "SLIME Actual CPU Sandbox Training":("SLIME CPU 小型神經與五維","sandbox-only-no-qwen"),
 "Atuber Real Source Training":("書目模型 CPU 訓練","small-ranker-only"),
 "SLIME Real GPU Qwen3 QLoRA (Owner Approval)":("CUDA GPU QLoRA 私有環境必要","gpu-not-confirmed"),
 "Owner-only Qwen CUDA QLoRA Real Training":("Qwen CUDA QLoRA 私有環境必要","gpu-not-confirmed"),
}
WORKFLOW_NAMES=tuple(TRAINING_TYPES)
VALID_STATUS={"queued","in_progress","completed","waiting","requested","pending"}
VALID_CONCLUSION={"success","failure","cancelled","skipped","timed_out","neutral","action_required","stale",None}
COMMIT=re.compile(r"^[a-f0-9]{40}$")
RUN_ID=re.compile(r"^[1-9][0-9]{0,17}$")


def _response():
    req=urllib.request.Request(API,headers={
        "Accept":"application/vnd.github+json",
        "User-Agent":"Slime-Owner-Local-Training-Monitor/1.0",
        "X-GitHub-Api-Version":"2022-11-28",
    })
    with HTTP.open(req,timeout=TIMEOUT_SECONDS) as resp:
        if getattr(resp,"status",200)!=200:
            raise ValueError("SLIME_GITHUB_ACTIONS_STATUS_NOT_SUCCESS")
        body=resp.read(MAX_BODY_BYTES+1)
    if len(body)>MAX_BODY_BYTES:
        raise ValueError("SLIME_GITHUB_ACTIONS_RESPONSE_TOO_LARGE")
    parsed=json.loads(body.decode("utf-8"))
    if not isinstance(parsed,dict) or not isinstance(parsed.get("workflow_runs"),list):
        raise ValueError("SLIME_GITHUB_ACTIONS_RESPONSE_INVALID")
    return parsed


def _iso_date(value:str)->str:
    if not isinstance(value,str):
        return ""
    try:
        actual=datetime.fromisoformat(value.replace("Z","+00:00"))
        if actual.tzinfo is None:
            return ""
        return actual.astimezone(timezone.utc).isoformat(timespec="seconds")
    except ValueError:
        return ""


def normalize_runs(raw:dict)->dict:
    if not isinstance(raw,dict) or not isinstance(raw.get("workflow_runs"),list):
        raise ValueError("SLIME_TRAINING_RUN_SCHEMA_INVALID")
    items=[]
    seen=set()
    for run in raw["workflow_runs"][:100]:
        if not isinstance(run,dict):
            continue
        name=run.get("name")
        if not isinstance(name,str) or name not in TRAINING_TYPES:
            continue
        rid=run.get("id")
        if type(rid) is not int or not RUN_ID.fullmatch(str(rid)) or rid in seen:
            continue
        status=run.get("status")
        conclusion=run.get("conclusion")
        if (not isinstance(status,str) or status not in VALID_STATUS or
            conclusion is not None and (not isinstance(conclusion,str) or conclusion not in VALID_CONCLUSION)):
            continue
        if conclusion not in VALID_CONCLUSION:
            continue
        sha=run.get("head_sha")
        if not isinstance(sha,str) or not COMMIT.fullmatch(sha):
            continue
        seen.add(rid)
        friendly,kind=TRAINING_TYPES[name]
        items.append({
            "id":rid,"name":name,"label":friendly,"kind":kind,
            "status":status,"conclusion":conclusion,
            "created_utc":_iso_date(run.get("created_at")),
            "commit":sha[:12],
            "url":f"https://github.com/{REPO}/actions/runs/{rid}",
            "adapter_verified":False,
            "true_cuda_optimizer_steps_verified":0,
            "actual_optimizer_steps_verified":None,
            "evidence_message":(
              "成功僅表示 Actions job 達到成功結論；權重、訓練步數、資料權利仍須檢查工作日誌與獨立 SHA256 回條。"
              if conclusion=="success" else
              "此工作流程尚未成功完成；不得宣稱已產生有效模型權重。"
            )
        })
    items.sort(key=lambda x:(x["created_utc"],x["id"]),reverse=True)
    return {
      "source":"public-github-actions-readonly",
      "repository":REPO,
      "total_displayed":min(len(items),MAX_ROWS),
      "rows":items[:MAX_ROWS],
      "verified_gpu_training_completed":False,
      "downloaded_weights":False,
      "controlled_private_gpu_repo_access":False,
      "owner_run_requested":False,
      "limitations":"Workflow conclusion is not independent CUDA or LoRA evidence. Private GPU repo and artifacts are never accessed.",
    }


def get_public_training_runs()->dict:
    try:
        return normalize_runs(_response())
    except (urllib.error.URLError,TimeoutError,OSError,ValueError,
            TypeError,json.JSONDecodeError,UnicodeDecodeError) as err:
        return {
          "source":"public-github-actions-readonly","repository":REPO,
          "total_displayed":0,"rows":[],
          "verified_gpu_training_completed":False,
          "downloaded_weights":False,"controlled_private_gpu_repo_access":False,
          "owner_run_requested":False,
          "error":"無法核實公開 GitHub Actions 訓練紀錄："+type(err).__name__,
          "limitations":"No network data => no claim of workflow or weight success.",
        }
