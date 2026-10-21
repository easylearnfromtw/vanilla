"""Verify a real Atuber GGUF and create an Ollama package from its own weights."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
from pathlib import Path

def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for piece in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(piece)
    return h.hexdigest()

def package(merged: str, gguf: str, output: str) -> dict:
    model = Path(merged).resolve()
    provenance = model / "atuber-release.json"
    if not provenance.is_file():
        raise ValueError("MISSING_FINETUNED_ATUBER_CHECKPOINT")
    manifest = json.loads(provenance.read_text(encoding="utf-8"))
    if (manifest.get("model_id") != "atuber-0.1"
            or manifest.get("release_state") != "trained-merged-hf"
            or manifest.get("base_model") != "Qwen/Qwen3-0.6B"
            or manifest.get("independent_inference") is not True
            or not isinstance(manifest.get("weights"), dict)
            or not manifest.get("adapter_sha256") or not manifest.get("dataset_sha256")):
        raise ValueError("UNVERIFIED_ATUBER_TRAINING_LINEAGE")
    for name, checksum in manifest["weights"].items():
        file = model / name
        if not file.is_file() or sha(file) != checksum:
            raise ValueError("ATUBER_CHECKPOINT_HASH_MISMATCH")
    source = Path(gguf).resolve()
    if not source.is_file() or source.stat().st_size < 50_000_000:
        raise ValueError("GGUF_MODEL_WEIGHTS_MISSING")
    with source.open("rb") as file:
        if file.read(4) != b"GGUF":
            raise ValueError("INVALID_GGUF_MAGIC")
    target = Path(output).resolve()
    if target.exists() and any(target.iterdir()):
        raise ValueError("RELEASE_DIRECTORY_NOT_EMPTY")
    target.mkdir(parents=True, exist_ok=True)
    final = target / "atuber-0.1.gguf"
    shutil.copyfile(source, final)
    modelfile = target / "Modelfile"
    modelfile.write_text(
        "FROM ./atuber-0.1.gguf\n"
        "PARAMETER temperature 0.5\n"
        "PARAMETER num_ctx 4096\n"
        'SYSTEM """你是阿土伯（Atuber），Vanilla AI 的獨立微調語言模型。'
        '以臺灣繁體中文回答。不可假稱已執行工具；工具使用必須由宿主授權並返回真正的執行回條。"""\n',
        encoding="utf-8")
    output_manifest = {
        "schema": 1, "model_id": "atuber-0.1",
        "release_state": "standalone-packaged",
        "base_model": manifest["base_model"], "base_license": "Apache-2.0",
        "lineage": {
            "dataset_sha256": manifest["dataset_sha256"],
            "adapter_sha256": manifest["adapter_sha256"],
            "holdout_rows": manifest["holdout_rows"]
        },
        "gguf_sha256": sha(final),
        "gguf_bytes": final.stat().st_size,
        "independent_inference": True,
        "ollama_model_name": "atuber:0.1"
    }
    (target / "release-manifest.json").write_text(
        json.dumps(output_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return output_manifest

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--merged", required=True)
    p.add_argument("--gguf", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    manifest = package(args.merged, args.gguf, args.output)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    print("Now: cd", args.output, "&& ollama create atuber:0.1 -f Modelfile")
