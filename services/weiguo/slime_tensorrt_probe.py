"""Read-only TensorRT-LLM host preflight for consented Slime nodes.

No model download, engine installation, network request, or inference dispatch.
Compatibility is UNKNOWN unless explicitly validated with the installed engine
and chosen model; a GPU name alone is insufficient.
"""
from __future__ import annotations
import json
import shutil
import subprocess
from typing import Callable

def probe_nvidia(run: Callable = subprocess.run, which: Callable = shutil.which) -> dict:
    result = {"engine": "tensorrt_llm", "available": False,
              "gpu_vendor": None, "gpu_name": None,
              "driver_version": None, "free_vram_mib": None,
              "driver_compatible": False, "runtime_compatible": False,
              "model_compatible": False, "reason": "NVIDIA GPU not verified"}
    if not which("nvidia-smi"):
        return result
    try:
        process = run(
            ["nvidia-smi", "--query-gpu=name,driver_version,memory.free",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=4, check=True)
        first = process.stdout.splitlines()[0].split(",")
        if len(first) != 3:
            return result
        name, driver, free = (x.strip() for x in first)
        memory = int(free)
        if not name or not driver or memory < 0:
            return result
        result.update(gpu_vendor="NVIDIA", gpu_name=name[:150],
                      driver_version=driver[:50], free_vram_mib=memory,
                      reason="GPU detected; TensorRT-LLM runtime and model unverified")
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        pass
    return result

if __name__ == "__main__":
    print(json.dumps(probe_nvidia(), ensure_ascii=False))
