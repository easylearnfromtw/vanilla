"""Explicit Qwen3 family registry shared by local multi-size LoRA training.

Values identify real official releases, not downloaded or fine-tuned weights.
RAM/VRAM floors are conservative preflight guides, never guarantees.
"""
from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class LocalModelSpec:
    key: str
    base: str
    ollama: str
    parameters_b: float
    architecture: str
    min_vram_gib: int
    inference_download_gb: float
    lora_targets: tuple[str, ...]
    label: str

DENSE_TARGETS=("q_proj", "k_proj", "v_proj", "o_proj", "up_proj", "down_proj", "gate_proj")
MOE_TARGETS=("q_proj", "k_proj", "v_proj", "o_proj")
MODELS: tuple[LocalModelSpec, ...] = (
 LocalModelSpec("0.6b","Qwen/Qwen3-0.6B","qwen3:0.6b",.6,"dense",6,.523,DENSE_TARGETS,"手機／微型實驗"),
 LocalModelSpec("1.7b","Qwen/Qwen3-1.7B","qwen3:1.7b",1.7,"dense",8,1.4,DENSE_TARGETS,"輕量本地"),
 LocalModelSpec("4b","Qwen/Qwen3-4B","qwen3:4b",4,"dense",12,2.5,DENSE_TARGETS,"一般本地"),
 LocalModelSpec("8b","Qwen/Qwen3-8B","qwen3:8b",8,"dense",16,5.2,DENSE_TARGETS,"均衡本地"),
 LocalModelSpec("14b","Qwen/Qwen3-14B","qwen3:14b",14,"dense",28,9.3,MOE_TARGETS,"進階研究"),
 LocalModelSpec("30b","Qwen/Qwen3-30B-A3B","qwen3:30b",30,"moe",48,19.0,MOE_TARGETS,"MoE 大型"),
 LocalModelSpec("32b","Qwen/Qwen3-32B","qwen3:32b",32,"dense",64,20.0,MOE_TARGETS,"Dense 大型"),
)
BY_KEY={model.key:model for model in MODELS}

def get_spec(key: str)->LocalModelSpec:
    if key not in BY_KEY:
        raise ValueError("UNSUPPORTED_QWEN3_LOCAL_MODEL_SIZE")
    return BY_KEY[key]
