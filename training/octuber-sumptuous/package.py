#!/usr/bin/env python3
"""Package actual merged OCTUBER SUMPTUOUS 30B GGUF for independent local inference.

Never converts a base model URL or an Ollama alias into 'trained' model metadata.
Packaging alone does not prove quality or runtime success.
"""
from __future__ import annotations
import argparse
import json
import re
import shutil
import struct
import sys
from pathlib import Path
from train import BASE, MODEL_ID, LICENSE, sha256

MIN_MERGED_BYTES = 30_000_000_000
MIN_GGUF_BYTES = 8_000_000_000
MODEL_TAG = "octuber:sumptuous-30b-v0.1"


def verify_merged(root: Path) -> dict:
    proof = root / "octuber-merged-provenance.json"
    if not proof.is_file():
        raise ValueError("OCTUBER_30B_MERGED_PROVENANCE_REQUIRED")
    state = json.loads(proof.read_text(encoding="utf-8"))
    if (state.get("model_id") != MODEL_ID or state.get("base_model") != BASE
        or state.get("base_license") != LICENSE
        or state.get("release_state") != "merged-not-evaluated"
        or state.get("independent_inference_verified") is not False
        or not re.fullmatch(r"[a-f0-9]{40}", str(state.get("base_revision", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(state.get("adapter_sha256", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(state.get("dataset_sha256", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(state.get("training_provenance_sha256", "")))
        or int(state.get("standalone_weights_bytes", 0)) < MIN_MERGED_BYTES
        or int(state.get("holdout_rows", 0)) < 5
        or not isinstance(state.get("weights"), dict)):
        raise ValueError("UNVERIFIED_OCTUBER_30B_MERGED_LINEAGE")
    weights = state["weights"]
    sf = [name for name in weights if name.endswith(".safetensors")]
    if not sf:
        raise ValueError("NO_ACTUAL_MERGED_SAFETENSORS")
    count = 0
    for name, digest in weights.items():
        if name != Path(name).name or not re.fullmatch(r"[a-f0-9]{64}", str(digest)):
            raise ValueError("INVALID_MERGED_MODEL_FILE_MANIFEST")
        item = root / name
        if not item.is_file() or sha256(item) != digest:
            raise ValueError("OCTUBER_30B_MERGED_CHECKSUM_MISMATCH")
        if name.endswith(".safetensors"):
            count += item.stat().st_size
    if count != state["standalone_weights_bytes"]:
        raise ValueError("OCTUBER_30B_MERGED_MODEL_SIZE_MISMATCH")
    return state


def verify_gguf(path: Path) -> dict:
    if not path.is_file() or path.stat().st_size < MIN_GGUF_BYTES:
        raise ValueError("REAL_30B_QUANTIZED_GGUF_WEIGHTS_REQUIRED")
    with path.open("rb") as file:
        header = file.read(24)
    if len(header) != 24 or header[:4] != b"GGUF":
        raise ValueError("INVALID_GGUF_MAGIC")
    version = struct.unpack("<I", header[4:8])[0]
    n_tensors, n_metadata = struct.unpack("<QQ", header[8:24])
    if version not in {2, 3} or not 100 < n_tensors < 1_000_000 or n_metadata < 5:
        raise ValueError("INVALID_GGUF_HEADER")
    return {"gguf_version": version, "tensor_count": n_tensors,
            "metadata_entries": n_metadata, "bytes": path.stat().st_size,
            "sha256": sha256(path)}


def package(merged: Path, gguf: Path, output: Path) -> dict:
    proof = verify_merged(merged.resolve())
    source = gguf.resolve()
    parsed = verify_gguf(source)
    target = output.resolve()
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise ValueError("OCTUBER_30B_RELEASE_DIRECTORY_NOT_EMPTY")
    target.mkdir(parents=True, exist_ok=True)
    out = target / "octuber-sumptuous-30b-q4.gguf"
    shutil.copyfile(source, out)
    if sha256(out) != parsed["sha256"]:
        raise ValueError("COPIED_MODEL_WEIGHT_HASH_MISMATCH")
    (target / "Modelfile").write_text(
        "FROM ./octuber-sumptuous-30b-q4.gguf\n"
        "PARAMETER temperature 0.35\n"
        "PARAMETER num_ctx 8192\n"
        'SYSTEM """你是 OCTUBER SUMPTUOUS，基於 Qwen3 30B MoE 真實微調權重運行的語言模型。'
        '請使用臺灣繁體中文。沒有證據時不得虛構來源或聲稱執行工具。"""\n',
        encoding="utf-8"
    )
    release = {
        "schema": 1, "model_id": MODEL_ID, "ollama_model_name": MODEL_TAG,
        "release_state": "quantized-awaiting-inference-validation",
        "base_model": BASE, "base_revision": proof["base_revision"],
        "base_license": LICENSE, "training_dataset_sha256": proof["dataset_sha256"],
        "adapter_sha256": proof["adapter_sha256"],
        "merged_provenance_sha256": sha256(merged / "octuber-merged-provenance.json"),
        "gguf_sha256": parsed["sha256"], "gguf_bytes": parsed["bytes"],
        "gguf_tensor_count": parsed["tensor_count"],
        "inference_verified": False, "human_evaluation_approved": False,
        "note": "Model must pass Ollama inference on actual hardware and held-out evaluation before public release."
    }
    (target / "release-manifest.json").write_text(
        json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return release


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--merged", type=Path, required=True)
    p.add_argument("--gguf", type=Path, required=True)
    p.add_argument("--output", type=Path, default=Path("artifacts/octuber-sumptuous-30b-package"))
    p.add_argument("--verify-only", action="store_true")
    p.add_argument("--package", action="store_true")
    args = p.parse_args()
    if args.verify_only == args.package:
        p.error("Choose exactly --verify-only or --package")
    state = verify_merged(args.merged.resolve())
    gguf = verify_gguf(args.gguf.resolve())
    if args.verify_only:
        print(json.dumps({"merged_verified": True, "gguf_verified": True,
                          "model_id": state["model_id"], "gguf": gguf,
                          "inference_verified": False}, indent=2))
        return 0
    release = package(args.merged, args.gguf, args.output)
    print("OCTUBER_30B_PACKAGED_NOT_YET_VERIFIED",
          json.dumps(release, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
