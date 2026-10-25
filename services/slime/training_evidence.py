"""SLIME local training evidence: integrity-check actual exported LoRA adapters.

An adapter checksum can validate a specific file against a report, but cannot
independently prove every optimizer update, data rights, expert QA or release
suitability. Never treats sandbox counters as Qwen LLM training.
No network access, no GPU work, no directory-wide searching.
"""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path

MAX_REPORT_BYTES = 262_144
MAX_CONFIG_BYTES = 262_144
MAX_WEIGHTS_BYTES = 4_000_000_000
MIN_WEIGHTS_BYTES = 1_024
MAX_PREVIEW_TEXT = 260

def _json_file(path:Path,max_bytes:int)->dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size>max_bytes:
        raise ValueError("SLIME_LORA_REPORT_OR_CONFIG_UNSAFE")
    decoded=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(decoded,dict):
        raise ValueError("SLIME_LORA_JSON_OBJECT_REQUIRED")
    return decoded

def _sha256(path:Path)->str:
    d=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(4*1024*1024),b""):
            d.update(part)
    return d.hexdigest()

def _actual_safetensors_header(path:Path)->int:
    # Safetensors: 8-byte little-endian header length then JSON tensor descriptors.
    with path.open("rb") as handle:
        prefix=handle.read(8)
        if len(prefix)!=8:
            raise ValueError("SLIME_LORA_WEIGHTS_INVALID_HEADER")
        length=int.from_bytes(prefix,"little")
        if length<12 or length>MAX_CONFIG_BYTES or length>path.stat().st_size-8:
            raise ValueError("SLIME_LORA_WEIGHTS_INVALID_HEADER_LENGTH")
        header=json.loads(handle.read(length).decode("utf-8"))
        if not isinstance(header,dict):
            raise ValueError("SLIME_LORA_WEIGHTS_BAD_TENSOR_INDEX")
        tensors=[(k,v) for k,v in header.items() if k!="__metadata__"]
        if not tensors or not any("lora_" in k.lower() for k,v in tensors):
            raise ValueError("SLIME_LORA_ADAPTER_TENSOR_MISSING")
        payload_size=path.stat().st_size-8-length
        for key,value in tensors:
            if not isinstance(key,str) or not isinstance(value,dict):
                raise ValueError("SLIME_LORA_TENSOR_DESCRIPTOR_INVALID")
            boundaries=value.get("data_offsets")
            shape=value.get("shape")
            if not isinstance(boundaries,list) or len(boundaries)!=2 or not all(
                type(x) is int for x in boundaries
            ) or not 0<=boundaries[0]<=boundaries[1]<=payload_size:
                raise ValueError("SLIME_LORA_TENSOR_OFFSETS_INVALID")
            if not isinstance(shape,list) or not shape or len(shape)>6 or not all(
                type(x) is int and 0<x<1_000_000_000 for x in shape
            ):
                raise ValueError("SLIME_LORA_TENSOR_SHAPE_INVALID")
    return len(tensors)

def inspect_local_lora(checkpoint_dir:str|Path)->dict:
    """Evidence file inspection ONLY on an explicitly selected Owner folder."""
    root=Path(checkpoint_dir).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("SLIME_LORA_NOT_A_DIRECTORY")
    report_file=root/"training-provenance.json"
    adapter=root/"adapter"
    weights=adapter/"adapter_model.safetensors"
    config_path=adapter/"adapter_config.json"
    if adapter.is_symlink() or weights.is_symlink() or config_path.is_symlink():
        raise ValueError("SLIME_LORA_SYMLINK_NOT_ALLOWED")
    if not weights.is_file() or not config_path.is_file():
        raise ValueError("SLIME_LORA_ADAPTER_INCOMPLETE")
    size=weights.stat().st_size
    if not MIN_WEIGHTS_BYTES<=size<=MAX_WEIGHTS_BYTES:
        raise ValueError("SLIME_LORA_ADAPTER_FILE_SIZE_INVALID")
    report=_json_file(report_file,MAX_REPORT_BYTES)
    config=_json_file(config_path,MAX_CONFIG_BYTES)
    if str(config.get("peft_type","")).upper()!="LORA":
        raise ValueError("SLIME_LORA_PEFT_CONFIG_MISMATCH")
    if config.get("task_type") not in ("CAUSAL_LM",None):
        raise ValueError("SLIME_LORA_TASK_TYPE_INVALID")
    tensor_count=_actual_safetensors_header(weights)
    actual_hash=_sha256(weights)
    if report.get("adapter_sha256")!=actual_hash:
        raise ValueError("SLIME_LORA_ADAPTER_SHA256_DOES_NOT_MATCH_PROVENANCE")
    steps=report.get("actual_optimizer_steps")
    if type(steps) is not int or not 1<=steps<=100_000:
        raise ValueError("SLIME_LORA_NO_VALID_REAL_STEP_RECEIPT")
    is_gpu=report.get("adapter_trained") is True and report.get("weights_created") is True
    is_cpu=report.get("weight_delta_verified") is True and report.get("cpu_only") is True
    if not (is_gpu or is_cpu):
        raise ValueError("SLIME_LORA_TRAINING_PROVENANCE_NOT_SUPPORTED")
    if is_gpu:
        if report.get("qwen_lora_adapter_updated") is not True:
            raise ValueError("SLIME_LORA_GPU_PROVENANCE_INVALID")
        revision=report.get("base_revision")
        if not isinstance(revision,str) or len(revision)!=40 or not all(
            x in "0123456789abcdefABCDEF" for x in revision
        ):
            raise ValueError("SLIME_LORA_BASE_REVISION_NOT_PINNED")
        for field in ("train_loss","eval_loss"):
            value=report.get(field)
            if type(value) not in (float,int) or not math.isfinite(value):
                raise ValueError("SLIME_LORA_LOSS_INVALID")
        if report.get("merged_or_ollama_model_registered") is not False:
            raise ValueError("SLIME_LORA_RELEASE_STATUS_UNKNOWN")
        method="genuine-cuda-qlora-reported"
    else:
        if report.get("cuda_used") is not False:
            raise ValueError("SLIME_LORA_CPU_PROVENANCE_CONTRADICTION")
        method="genuine-cpu-lora-reported"
    model=report.get("base_model") or report.get("model") or ""
    if not isinstance(model,str) or not model.startswith("Qwen/Qwen3-"):
        raise ValueError("SLIME_LORA_UNKNOWN_OFFICIAL_BASE_MODEL")
    independent_holdout=bool(
        report.get("independent_document_evaluation") is True or
        report.get("whole_paper_holdout") is True or
        (type(report.get("documents_in_independent_holdout")) is int and
         report["documents_in_independent_holdout"]>=1)
    )
    return {
        "status":"local-file-integrity-verified-not-independent-training-attestation",
        "base_model":model,"training_report_method":method,
        "reported_optimizer_steps":steps,
        "tensor_descriptors":tensor_count,
        "adapter_bytes":size,
        "adapter_sha256":actual_hash,
        "independent_document_holdout_reported":independent_holdout,
        "cuda_used_reported":is_gpu,
        "checkpoint_exists":True,
        "qwen_base_weights_updated":False,
        "model_registered_or_deployed":False,
        "professional_factual_accuracy_established":False,
        "limitations":"File hashes and PEFT tensor structure match local provenance; file inspection alone cannot attest the training run, rights, human review or expertise.",
    }

def inspect_sandbox_report(report_path:str|Path)->dict:
    source=Path(report_path).expanduser().resolve(strict=True)
    report=_json_file(source,MAX_REPORT_BYTES)
    # Only allow known counter receipts to prevent a 1M sandbox from looking like 1M Qwen steps.
    if report.get("type")=="SIMULATED_HUMAN_SHOPPING_DECISIONS_NOT_MODEL_WEIGHT_TRAINING":
        return {"status":"sandbox-receipt-not-llm","kind":"simulated-human-shopper",
                "episodes":report.get("episodes",0),"qwen_optimizer_steps":0}
    if report.get("status")=="verified-cpu-training-only":
        return {"status":"sandbox-receipt-not-llm","kind":"slime-cpu-sandbox",
                "episodes":report.get("simulated_shopper_decisions",0),
                "qwen_optimizer_steps":report.get("qwen_llm_optimizer_steps",0)}
    raise ValueError("SLIME_UNKNOWN_SANDBOX_RECEIPT_TYPE")
