#!/usr/bin/env python3
"""Read-only October hardware readiness. Never downloads or trains weights."""
from __future__ import annotations
import argparse
import importlib.metadata
import json
import shutil

PACKAGES = ("torch", "transformers", "trl", "peft", "datasets", "accelerate", "bitsandbytes")


def inspect_hardware() -> dict:
    versions = {}
    for package in PACKAGES:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = None
    details = {"pythonPackages": versions, "ollamaInstalled": bool(shutil.which("ollama")),
               "cudaAvailable": False, "cudaDevices": [], "readyForQwenQLoRA": False,
               "weightsTrained": False}
    try:
        import torch
        details["cudaAvailable"] = bool(torch.cuda.is_available())
        if details["cudaAvailable"]:
            for index in range(torch.cuda.device_count()):
                properties = torch.cuda.get_device_properties(index)
                details["cudaDevices"].append(
                    {"name": properties.name,
                     "vramGiB": round(properties.total_memory / (1024 ** 3), 2)})
    except (ImportError, OSError, RuntimeError):
        pass
    packages_ready = all(versions[p] for p in PACKAGES)
    details["readyForQwenQLoRA"] = bool(details["cudaAvailable"] and packages_ready)
    details["warnings"] = []
    if not details["cudaAvailable"]:
        details["warnings"].append("CUDA GPU unavailable. Do NOT claim Qwen weights were trained.")
    if details["cudaAvailable"] and details["cudaDevices"] and (
            max(d["vramGiB"] for d in details["cudaDevices"]) < 6.0):
        details["warnings"].append("VRAM below 6 GiB: NF4 0.6B may still fail at training peak.")
    if not packages_ready:
        details["warnings"].append("Some isolated QLoRA Python dependencies are missing.")
    return details


def main() -> int:
    parser = argparse.ArgumentParser(description="October local GPU preflight (no downloads)")
    parser.add_argument("--require-gpu", action="store_true")
    args = parser.parse_args()
    result = inspect_hardware()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["readyForQwenQLoRA"] or not args.require_gpu else 2


if __name__ == "__main__":
    raise SystemExit(main())
