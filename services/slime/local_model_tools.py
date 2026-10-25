"""Slime Owner desktop: opt-in local Ollama model management and QLoRA execution.

No remote command dispatch. All URLs for Ollama are fixed 127.0.0.1.
No model downloads, unreviewed-data approval, or training by opening the UI.
Only the local Owner can explicitly execute an already-present trainer.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import URLError

# Match the official local registry, without importing torch / training code into Slime.
MODEL_SIZES = (
    ("0.6b", "qwen3:0.6b", 6),
    ("1.7b", "qwen3:1.7b", 8),
    ("4b", "qwen3:4b", 12),
    ("8b", "qwen3:8b", 16),
    ("14b", "qwen3:14b", 28),
    ("30b", "qwen3:30b", 48),
    ("32b", "qwen3:32b", 64),
)
MODEL_BY_SIZE = {item[0]: item for item in MODEL_SIZES}
MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
REVISION = re.compile(r"^[a-fA-F0-9]{40}$")
OLLAMA = "http://127.0.0.1:11434"
LOCAL_HTTP = build_opener(ProxyHandler({}))


def _ollama_api(route: str, body: dict | None = None) -> dict:
    if route not in ("/api/tags", "/api/chat"):
        raise ValueError("SLIME_OLLAMA_ROUTE_NOT_ALLOWED")
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    if payload is not None and len(payload) > 8192:
        raise ValueError("SLIME_OLLAMA_PAYLOAD_LIMIT")
    request = Request(
        OLLAMA + route, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST" if body is not None else "GET"
    )
    # Disable environment proxy for local model access; remote URLs are impossible.
    with LOCAL_HTTP.open(request, timeout=16) as response:
        raw = response.read(256_000)
    output = json.loads(raw.decode("utf8"))
    if not isinstance(output, dict):
        raise ValueError("SLIME_OLLAMA_RESPONSE_INVALID")
    return output


def local_inventory() -> dict:
    """Read-only: no auto-pull, no model registration, no new network exposure."""
    try:
        items = _ollama_api("/api/tags").get("models", [])
        installed = {item["name"] for item in items
                     if isinstance(item, dict)
                     and isinstance(item.get("name"), str)
                     and MODEL_ID.fullmatch(item["name"])} if isinstance(items, list) else set()
        online = True
    except (OSError, TimeoutError, URLError, ValueError, TypeError, json.JSONDecodeError):
        installed, online = set(), False
    return {
        "ollama_running": online,
        "models": [{"size": size, "ollama": model, "installed": (
            model in installed or model + ":latest" in installed),
            "inference_verified": False, "lora_trained": False,
            "qlora_vram_guide_gib": vram} for size, model, vram in MODEL_SIZES],
        "note": "已安裝 ≠ 推論成功 ≠ 已微調。必須另外測試生成與檢查權重檔。",
    }


def verify_local_inference(model_size: str) -> dict:
    if model_size not in MODEL_BY_SIZE:
        raise ValueError("SLIME_UNKNOWN_MODEL_SIZE")
    model = MODEL_BY_SIZE[model_size][1]
    existing = local_inventory()
    item = next(row for row in existing["models"] if row["size"] == model_size)
    if not item["installed"]:
        return {"model_size": model_size, "inference_verified": False,
                "reason": "MODEL_NOT_INSTALLED_DO_NOT_AUTO_DOWNLOAD"}
    try:
        result = _ollama_api("/api/chat", {
            "model": model, "stream": False,
            "messages": [{"role": "user", "content": "請回答：測試完成"}],
            "options": {"num_predict": 32, "num_ctx": 512},
            "keep_alive": "0s",
        })
        message = result.get("message")
        success = bool(result.get("done") is True
                       and isinstance(message, dict)
                       and isinstance(message.get("content"), str)
                       and message["content"].strip())
    except (OSError, TimeoutError, URLError, ValueError, TypeError, json.JSONDecodeError):
        success = False
    return {"model_size": model_size, "inference_verified": success,
            "reason": "LOCAL_CHAT_COMPLETED" if success else "LOCAL_CHAT_NOT_VERIFIED"}


def _trainer_paths(repo: str | Path, data: str | Path, size: str, revision: str):
    if size not in MODEL_BY_SIZE:
        raise ValueError("SLIME_UNKNOWN_MODEL_SIZE")
    if not REVISION.fullmatch(revision):
        raise ValueError("SLIME_OFFICIAL_BASE_COMMIT_REQUIRED")
    root = Path(repo).expanduser().resolve(strict=True)
    dataset = Path(data).expanduser().resolve(strict=True)
    trainer = root / "training" / "atuber" / "multisize_train.py"
    gate = root / "training" / "atuber" / "actual_gpu_execution_gate.py"
    if not trainer.is_file() or not gate.is_file():
        raise ValueError("SLIME_PROJECT_TRAINING_SCRIPTS_NOT_FOUND")
    if dataset.suffix.lower() != ".jsonl" or not dataset.is_file():
        raise ValueError("SLIME_HUMAN_REVIEWED_JSONL_REQUIRED")
    # The training script is the checked-out user-selected local repository,
    # never arbitrary command text supplied by another node.
    return root, dataset, trainer, gate


def _python_executable() -> str:
    # Packaged Slime.exe points to a GUI binary; launch the installed owner Python.
    executable = shutil.which("python3") or shutil.which("python")
    if not executable:
        raise RuntimeError("SLIME_LOCAL_PYTHON_3_REQUIRED")
    return executable


def audit_training(repo: str | Path, data: str | Path, size: str,
                   revision: str, *, python_exe: str | None = None,
                   allow_download: bool = False) -> dict:
    """Run existing QLoRA preflight locally. No training or downloads."""
    root, dataset, _, gate = _trainer_paths(repo, data, size, revision)
    python = python_exe or _python_executable()
    cmd = [python, str(gate), "--model-size", size,
           "--dataset", str(dataset), "--base-revision", revision]
    if allow_download:
        cmd.append("--allow-download")
    result = subprocess.run(cmd, cwd=str(root), capture_output=True,
                            text=True, encoding="utf8", errors="replace", timeout=60,
                            check=False)
    if result.returncode:
        raise RuntimeError("SLIME_TRAINING_PREFLIGHT_SCRIPT_FAILED")
    report = json.loads(result.stdout)
    if (report.get("model_size") != size
            or report.get("status") not in ("blocked-untrained", "preflight-eligible-untrained")
            or report.get("actual_qwen_optimizer_steps") != 0):
        raise ValueError("SLIME_TRAINING_PREFLIGHT_RECEIPT_INVALID")
    return report


def launch_owner_training(repo: str | Path, data: str | Path, size: str,
                          revision: str, *, owner: bool, confirmed: bool,
                          python_exe: str | None = None, allow_download: bool = False,
                          output_root: str | Path | None = None) -> dict:
    """Only after independent local owner confirmation and a verified preflight.

    No server-side control plane invokes this; no interactive confirmation bypass
    by friends, API nodes, or a downloaded instruction.
    """
    if not owner or not confirmed:
        raise PermissionError("SLIME_LOCAL_OWNER_EXPLICIT_CONFIRMATION_REQUIRED")
    root, dataset, trainer, _ = _trainer_paths(repo, data, size, revision)
    python = python_exe or _python_executable()
    check = audit_training(root, dataset, size, revision,
                           python_exe=python, allow_download=allow_download)
    if check["status"] != "preflight-eligible-untrained":
        raise RuntimeError("SLIME_TRAINING_BLOCKED_BY_GPU_DATA_OR_WEIGHT_GATE")
    base = (Path(output_root) if output_root is not None
            else Path.home() / ".vanilla" / "slime" / "local-ai-training")
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Atomic reservation prevents accidental concurrent overwrite/reuse.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = base / f"qwen3-{size}-{stamp}"
    output.mkdir(mode=0o700)
    log_path = output / "training.log"
    descriptor = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    command = [
        python, str(trainer), "--model-size", size,
        "--dataset", str(dataset), "--base-revision", revision,
        "--output", str(output / "model"),
        "--train", "--steps", "180", "--max-length", "512"
    ]
    if allow_download:
        command.append("--allow-download")
    # Never forward Slime identity tokens to a locally launched trainer.
    env = {key: value for key, value in os.environ.items()
           if key not in {"SLIME_NODE_TOKEN", "VANILLA_API_KEY",
                          "VANILLA_SERVER_URL", "GECKO_ENROLLMENT_TOKEN"}}
    try:
        with os.fdopen(descriptor, "w", encoding="utf8") as stream:
            process = subprocess.Popen(
                command, cwd=str(root), stdin=subprocess.DEVNULL,
                stdout=stream, stderr=subprocess.STDOUT, env=env
            )
    except Exception:
        log_path.unlink(missing_ok=True)
        try:
            output.rmdir()
        except OSError:
            pass
        raise
    # Spawning a process is NOT a successful optimizer update or saved adapter.
    return {"status": "started-unverified", "pid": process.pid, "model_size": size,
            "log_path": str(log_path), "output": str(output / "model"),
            "actual_model_weights_verified": False, "owner_started_locally": True}
