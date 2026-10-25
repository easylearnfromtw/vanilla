"""SLIME Owner-only OCTUBER finance QLoRA adapter.

Only a PERSON at the local Owner desktop may approve training. Not accessible
from node heartbeat, Telegram, the public pairing page or Friend builds.
Read-only preflight executes trusted fixed repository scripts, not remote code.
No implicit downloads, no model registry mutations or deployment claims.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

TIERS = {
    "0.6b": ("Qwen/Qwen3-0.6B", 6),
    "4b": ("Qwen/Qwen3-4B", 12),
    "14b": ("Qwen/Qwen3-14B", 24),
    "30b": ("Qwen/Qwen3-30B-A3B-Instruct-2507", 48),
    "32b": ("Qwen/Qwen3-32B", 48),
}
BLOCKED_60B = "UNVERIFIED_60B_MXFP4_MOE_FINETUNE"
REVISION = re.compile(r"^[a-fA-F0-9]{40}$")
MAX_DATA_FILE = 128 * 1024 * 1024
MIN_TRAIN = 100
MIN_EVAL = 100
MAX_STEPS = 5000


def _python(python_exe=None):
    executable = python_exe or shutil.which("python3") or shutil.which("python")
    if not executable:
        raise ValueError("SLIME_LOCAL_PYTHON_REQUIRED")
    return executable


def _files(repo, data_root):
    project = Path(repo).expanduser().resolve(strict=True)
    data = Path(data_root).expanduser().resolve(strict=True)
    if not project.is_dir() or not data.is_dir():
        raise ValueError("SLIME_FINANCE_DIRECTORIES_REQUIRED")
    if project == data or data.is_relative_to(project):
        # Private market/news datasets must never sit in a public Git checkout.
        raise ValueError("SLIME_FINANCE_PRIVATE_DATA_MUST_BE_OUTSIDE_REPOSITORY")
    scripts = project / "training" / "octuber-finance"
    trainer = scripts / "train_tiers.py"
    readiness = scripts / "readiness.py"
    release = scripts / "release_gate.py"
    for target in (trainer, readiness, release):
        if target.is_symlink() or not target.is_file() or not target.resolve().is_relative_to(project):
            raise ValueError("SLIME_FINANCE_CHECKED_OUT_TRAINER_REQUIRED")
    approved = data / "approved"
    required = {
        "train": approved / "train.jsonl",
        "eval": approved / "eval.jsonl",
        "test": approved / "test.jsonl",
        "provenance": approved / "approved-provenance.json",
        "rights": data / "price-rights.json",
    }
    for key, path in required.items():
        if (path.is_symlink() or not path.is_file()
            or path.stat().st_size == 0 or path.stat().st_size > MAX_DATA_FILE):
            raise ValueError("SLIME_FINANCE_REQUIRED_FILE_MISSING_OR_UNSAFE:" + key)
    prices = data / "prices"
    if prices.is_symlink() or not prices.is_dir():
        raise ValueError("SLIME_FINANCE_LICENSED_PRICES_DIRECTORY_REQUIRED")
    return project, data, trainer, readiness, release, prices, required


def _sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _reviewed_rows(path, *, at_least):
    if path.stat().st_size > MAX_DATA_FILE:
        raise ValueError("SLIME_FINANCE_DATASET_TOO_LARGE")
    identifiers, prompts, count = set(), set(), 0
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            record = json.loads(line)
            if (not isinstance(record, dict)
                or record.get("reviewed") is not True
                or record.get("consent") is not True
                or not isinstance(record.get("source"), str) or not record["source"].strip()
                or not isinstance(record.get("id"), str) or not record["id"].strip()
                or not isinstance(record.get("user"), str) or not record["user"].strip()
                or not isinstance(record.get("assistant"), str) or not record["assistant"].strip()):
                raise ValueError("SLIME_FINANCE_UNREVIEWED_OR_INVALID_SAMPLE")
            rid = record["id"]
            prompt = hashlib.sha256(record["user"].strip().casefold().encode()).hexdigest()
            if rid in identifiers or prompt in prompts:
                raise ValueError("SLIME_FINANCE_DUPLICATE_SAMPLE")
            identifiers.add(rid)
            prompts.add(prompt)
            count += 1
    if count < at_least:
        raise ValueError("SLIME_FINANCE_INSUFFICIENT_REVIEWED_EXAMPLES")
    return count, identifiers, prompts


def _dataset_contract(paths):
    stats = {}
    for part in ("train", "eval", "test"):
        stats[part] = _reviewed_rows(paths[part], at_least=MIN_TRAIN if part == "train" else MIN_EVAL)
    for a, b in (("train", "eval"), ("train", "test"), ("eval", "test")):
        if stats[a][1] & stats[b][1] or stats[a][2] & stats[b][2]:
            raise ValueError("SLIME_FINANCE_TEMPORAL_SAMPLE_LEAKAGE")
    provenance = json.loads(paths["provenance"].read_text(encoding="utf-8"))
    if (not isinstance(provenance, dict) or provenance.get("state") != "REVIEWED_SFT_NOT_TRAINED"
        or provenance.get("date_boundaries") != ["2021-12-31", "2024-12-31"]):
        raise ValueError("SLIME_FINANCE_APPROVED_PROVENANCE_REQUIRED")
    for part in ("train", "eval", "test"):
        if provenance.get(part + "_sha256") != _sha(paths[part]):
            raise ValueError("SLIME_FINANCE_PROVENANCE_HASH_MISMATCH:" + part)
    for part in ("train", "eval"):
        if provenance.get(part) != stats[part][0]:
            raise ValueError("SLIME_FINANCE_PROVENANCE_ROW_COUNT_MISMATCH:" + part)
    if provenance.get("test") is not None and provenance["test"] != stats["test"][0]:
        raise ValueError("SLIME_FINANCE_PROVENANCE_ROW_COUNT_MISMATCH:test")
    return {part: stats[part][0] for part in ("train", "eval", "test")}


def _json_command(argv, *, cwd, python_env, timeout):
    result = subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=timeout,
                            check=False, env=python_env, stdin=subprocess.DEVNULL,
                            shell=False)
    if result.returncode:
        raise RuntimeError("SLIME_FINANCE_PREFLIGHT_FAILED:" + result.stderr[-500:])
    try:
        data = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError) as err:
        raise ValueError("SLIME_FINANCE_PREFLIGHT_INVALID_JSON") from err
    if not isinstance(data, dict):
        raise ValueError("SLIME_FINANCE_PREFLIGHT_INVALID_JSON_OBJECT")
    return data


def _environment():
    # Never send node credentials, private inference tokens or unrelated keys
    # into child training scripts.
    forbidden = ("TOKEN", "SECRET", "PASSWORD", "API_KEY", "AUTHORIZATION", "PRIVATE_KEY")
    return {k: v for k, v in os.environ.items()
            if not any(word in k.upper() for word in forbidden)
            and k.upper() not in ("SLIME_NODE_ID", "SLIME_SERVER_URL")}


def audit_finance(repo, data_root, tier, revision, *, python_exe=None):
    """Source checks and CUDA readiness. Absolutely no GPU optimizer update."""
    if tier == "60b":
        raise ValueError(BLOCKED_60B)
    if tier not in TIERS:
        raise ValueError("SLIME_FINANCE_UNKNOWN_TIER")
    if not isinstance(revision, str) or not REVISION.fullmatch(revision):
        raise ValueError("SLIME_FINANCE_IMMUTABLE_BASE_REVISION_REQUIRED")
    project, data, trainer, readiness, _, prices, paths = _files(repo, data_root)
    rows = _dataset_contract(paths)
    python = _python(python_exe)
    env = _environment()
    coverage = _json_command([python, str(readiness),
                              "--prices-dir", str(prices), "--rights", str(paths["rights"])],
                             cwd=project, python_env=env, timeout=120)
    plan = _json_command([python, str(trainer), "--tier", tier],
                         cwd=project, python_env=env, timeout=90)
    if coverage.get("expected_markets") != 20 or coverage.get("market_count") != 20:
        raise ValueError("SLIME_FINANCE_20_LICENSED_MARKETS_REQUIRED")
    if plan.get("mode") != "PLAN_ONLY" or plan.get("training_executed") is not False:
        raise ValueError("SLIME_FINANCE_TRAINER_PLAN_NOT_SAFE")
    model = plan.get("models", {}).get(tier)
    gpu = plan.get("cuda", {})
    expected_base, minimum = TIERS[tier]
    if not isinstance(model, dict) or model.get("base") != expected_base:
        raise ValueError("SLIME_FINANCE_MODEL_MANIFEST_MISMATCH")
    vram = gpu.get("vram_gib")
    fit = gpu.get("available") is True and type(vram) in (int, float) and vram >= minimum
    return {
        "status": "preflight-eligible-untrained" if fit else "blocked-untrained",
        "tier": tier, "base_model": expected_base, "base_revision": revision.lower(),
        "approved_rows": rows, "markets": coverage["market_count"],
        "strict_30y_coverage": coverage.get("complete_market_coverage") is True,
        "source_and_rights_require_independent_review": True,
        "cuda": gpu, "minimum_vram_gib": minimum,
        "optimizer_steps_completed": 0, "weights_created": False, "released": False,
        "reason": "CUDA_AND_VRAM_SCREEN_PASS" if fit else "CUDA_NOT_AVAILABLE_OR_TOO_SMALL",
    }


def launch_finance(repo, data_root, tier, revision, *, owner=False, confirmed=False,
                   gpu_approved=False, rights_approved=False, license_approved=False,
                   allow_download=False, output_root=None, steps=180, python_exe=None):
    """Start one approved local GPU process; never assert completion or deploy."""
    if not (owner and confirmed and gpu_approved and rights_approved and license_approved):
        raise PermissionError("SLIME_FINANCE_LOCAL_OWNER_FIVE_EXPLICIT_APPROVALS_REQUIRED")
    if type(steps) is not int or not 16 <= steps <= MAX_STEPS:
        raise ValueError("SLIME_FINANCE_INVALID_STEPS")
    audit = audit_finance(repo, data_root, tier, revision, python_exe=python_exe)
    if audit["status"] != "preflight-eligible-untrained":
        raise RuntimeError("SLIME_FINANCE_GPU_TRAINING_BLOCKED")
    project, _, trainer, _, _, _, paths = _files(repo, data_root)
    base = (Path(output_root).expanduser() if output_root else
            Path.home() / ".vanilla" / "slime" / "finance-training").resolve()
    if base == project or base.is_relative_to(project):
        raise ValueError("SLIME_FINANCE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY")
    if base == Path(data_root).expanduser().resolve():
        raise ValueError("SLIME_FINANCE_OUTPUT_MUST_NOT_REPLACE_SOURCE")
    target = base / tier / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
                            + "-" + uuid.uuid4().hex[:8])
    run_dir = target.parent
    run_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    target.mkdir(mode=0o700)
    # The actual trainer insists on a NONEXISTENT output path.
    model_output = target / "weights"
    cmd = [_python(python_exe), str(trainer), "--tier", tier, "--train",
           "--steps", str(steps), "--train-data", str(paths["train"]),
           "--eval-data", str(paths["eval"]),
           "--provenance", str(paths["provenance"]),
           "--output", str(model_output), "--base-revision", revision.lower(),
           "--approve-gpu-compute", "--ack-model-license", "--ack-data-rights"]
    if allow_download:
        cmd.append("--allow-model-download")
    receipt = {**audit, "status": "reserved-not-executed", "model_output": str(model_output),
               "steps_requested": steps, "downloads_allowed": bool(allow_download),
               "release_requires_independent_blind_backtest": True}
    (target / "plan.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log = target / "training.log"
    with log.open("x", encoding="utf-8") as output:
        proc = subprocess.Popen(cmd, cwd=str(project), stdin=subprocess.DEVNULL,
                                stdout=output, stderr=subprocess.STDOUT, shell=False,
                                env=_environment())
    return {
        "status": "started-unverified", "pid": proc.pid, "tier": tier,
        "log_path": str(log), "output": str(model_output), "steps_requested": steps,
        "optimizer_steps_verified": 0, "released": False,
        "no_claim_of_completed_financial_training": True,
    }
