#!/usr/bin/env python3
"""Deterministic, stdlib-only OCTUBER 30B/60B *virtual host* scheduling sandbox.

A virtual GPU is a logical allocation simulated in Python, not a rented GPU,
CUDA runtime, real VRAM, model execution, optimizer, or neural checkpoint.
Multi-GPU cards are NOT treated as aggregate model-fit memory.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

from sandbox import PROFILES, estimate, assess_dataset

HOSTS = {
    "desktop-24": {"gpu_count": 1, "per_gpu_vram_gib": 24, "ram_gib": 64, "disk_gib": 256, "cpu_cores": 16},
    "workstation-48": {"gpu_count": 1, "per_gpu_vram_gib": 48, "ram_gib": 128, "disk_gib": 512, "cpu_cores": 24},
    "virtual-96": {"gpu_count": 1, "per_gpu_vram_gib": 96, "ram_gib": 256, "disk_gib": 1024, "cpu_cores": 32},
    "virtual-dual-80": {"gpu_count": 2, "per_gpu_vram_gib": 80, "ram_gib": 256, "disk_gib": 1024, "cpu_cores": 48},
    "virtual-eight-80": {"gpu_count": 8, "per_gpu_vram_gib": 80, "ram_gib": 1024, "disk_gib": 4096, "cpu_cores": 128},
}
# Heuristics only. They are NOT measured CUDA runtime requirements.
RAM_SCREENS = {"30b": 64, "60b": 128}
DISK_SCREENS = {"30b": 180, "60b": 320}
CHECKPOINT_INTERVAL = 5
MAX_STEPS = 100000


def assess_resources(model: str, host: dict) -> dict:
    profile = PROFILES[model]
    memory = estimate(profile, scenario_gib=host["per_gpu_vram_gib"])
    reasons = []
    if host["per_gpu_vram_gib"] < profile["single_gpu_qlora_screen_gib"]:
        reasons.append("SINGLE_GPU_VRAM_BELOW_HEURISTIC_SCREEN")
    if host["ram_gib"] < RAM_SCREENS[model]:
        reasons.append("HOST_RAM_BELOW_HEURISTIC_SCREEN")
    if host["disk_gib"] < DISK_SCREENS[model]:
        reasons.append("HOST_DISK_BELOW_HEURISTIC_SCREEN")
    return {
        "model_id": profile["model_id"],
        "upstream": profile["upstream"],
        "architecture": profile["architecture"],
        "single_gpu_vram_screen_gib": profile["single_gpu_qlora_screen_gib"],
        "ram_screen_gib": RAM_SCREENS[model],
        "disk_screen_gib": DISK_SCREENS[model],
        "estimated_4bit_weight_gib": memory["4bit_gib"],
        "virtual_resource_screen_pass": not reasons,
        "block_reasons": reasons,
        "real_training_driver_available_in_repo": bool(profile["real_training_driver"]),
        "real_training_driver_status": profile["training_driver_status"],
        "virtual_scheduler_only": True,
        "hardware_feasibility_verified": False,
    }


def simulate(*, model_names: list[str], host_name: str, steps: int,
             fault_step: int | None = None, dataset: Path | None = None) -> dict:
    if host_name not in HOSTS:
        raise ValueError("UNKNOWN_VIRTUAL_HOST")
    if not model_names or len(set(model_names)) != len(model_names):
        raise ValueError("MODELS_MUST_BE_NONEMPTY_UNIQUE")
    if any(m not in PROFILES for m in model_names):
        raise ValueError("UNKNOWN_MODEL")
    if not 1 <= steps <= MAX_STEPS:
        raise ValueError("INVALID_STEP_COUNT")
    if fault_step is not None and not 1 <= fault_step <= steps:
        raise ValueError("FAULT_STEP_OUTSIDE_SIMULATION")
    checkpoint_interval = CHECKPOINT_INTERVAL if steps <= 1000 else max(1000, steps // 100)
    host = HOSTS[host_name].copy()
    dataset_check = assess_dataset(dataset)
    jobs = {}
    for name in model_names:
        screen = assess_resources(name, host)
        jobs[name] = {
            **screen,
            "state": "queued" if screen["virtual_resource_screen_pass"] else "blocked-resource-screen",
            "virtual_gpu_slot": None,
            "simulated_steps_completed": 0,
            "simulated_step_attempts": 0,
            "virtual_metadata_checkpoints": [],
            "simulated_recovery_count": 0,
            "simulated_weights_created": False,
        }

    # No topology or tensor/pipeline parallelism: a job must fit on ONE card.
    # Simulated jobs consume one virtual card, are queued FIFO, and can overlap
    # only when separate virtual card slots exist.
    available = list(range(host["gpu_count"]))
    waiting = [m for m in model_names if jobs[m]["state"] == "queued"]
    active = {}
    events = []
    tick = 0
    total_attempts = 0
    injected = False
    target_for_fault = waiting[0] if waiting else None
    max_attempts = len(waiting) * (steps + checkpoint_interval + 1)
    while waiting or active:
        for slot in sorted(available):
            if not waiting:
                break
            model = waiting.pop(0)
            active[slot] = model
            jobs[model]["state"] = "running-virtual"
            jobs[model]["virtual_gpu_slot"] = slot
            events.append({"tick": tick, "event": "virtual_job_placed",
                           "model": model, "gpu_slot": slot})
        available = [slot for slot in available if slot not in active]
        tick += 1
        for slot in sorted(list(active)):
            name = active[slot]
            job = jobs[name]
            # Deliberately inject ONE loss-of-worker event. Resume only from
            # the last *metadata* checkpoint. NO tensor weights persisted.
            next_step = job["simulated_steps_completed"] + 1
            if (fault_step is not None and not injected and name == target_for_fault
                    and next_step == fault_step):
                injected = True
                previous = job["virtual_metadata_checkpoints"]
                resume = previous[-1] if previous else 0
                job["simulated_recovery_count"] += 1
                events.append({"tick": tick, "event": "virtual_worker_failure",
                               "model": name, "attempted_step": next_step,
                               "last_virtual_checkpoint": resume})
                job["simulated_steps_completed"] = resume
                events.append({"tick": tick, "event": "virtual_metadata_resume",
                               "model": name, "resume_step": resume})
                continue
            job["simulated_step_attempts"] += 1
            total_attempts += 1
            job["simulated_steps_completed"] += 1
            if job["simulated_steps_completed"] % checkpoint_interval == 0:
                job["virtual_metadata_checkpoints"].append(job["simulated_steps_completed"])
                events.append({"tick": tick, "event": "virtual_checkpoint_metadata",
                               "model": name, "step": job["simulated_steps_completed"],
                               "contains_neural_weights": False})
            if job["simulated_steps_completed"] == steps:
                job["state"] = "simulated-schedule-completed"
                events.append({"tick": tick, "event": "virtual_job_completed",
                               "model": name, "simulated_steps": steps,
                               "actual_model_training_completed": False})
                del active[slot]
                available.append(slot)
        if total_attempts > max_attempts:
            raise RuntimeError("SIMULATION_FAILED_TO_CONVERGE")
    return {
        "schema": 1,
        "kind": "octuber-virtual-host-scheduling-sandbox",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "execution_backend": "python-stdlib-deterministic-virtual-gpu-host",
        "host_name": host_name,
        "host_specification": host,
        "requested_models": model_names,
        "requested_virtual_steps_per_model": steps,
        "virtual_metadata_checkpoint_interval_steps": checkpoint_interval,
        "injected_virtual_failure_at_step": fault_step,
        "reviewed_dataset": dataset_check,
        "jobs": jobs,
        "events": events,
        "virtual_ticks": tick,
        "virtual_simulated_step_attempts": total_attempts,
        "gpu_hardware_accessed": False,
        "cuda_used": False,
        "real_model_forward_or_backward_performed": False,
        "real_large_model_checkpoint_created": False,
        "large_model_training_completed": False,
        "virtual_cost_is_not_real_billing": True,
        "warning": "ALL virtual GPU allocations, steps, failures and checkpoints are simulated; these are NOT GPU benchmarks or new OCTUBER 30B/60B weights.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Simulate a virtual GPU host for 30B/60B scheduling; no real GPU used.")
    parser.add_argument("--models", choices=("all", "30b", "60b"), default="all")
    parser.add_argument("--host", choices=tuple(HOSTS), default="virtual-96")
    parser.add_argument("--steps", type=int, default=20)
    parser.add_argument("--fault-step", type=int, default=None)
    parser.add_argument("--dataset", type=Path, default=None,
                        help="If supplied, require the existing 100+ reviewed-record validator.")
    parser.add_argument("--output", type=Path, default=None)
    options = parser.parse_args(argv)
    report = simulate(
        model_names=list(PROFILES) if options.models == "all" else [options.models],
        host_name=options.host, steps=options.steps,
        fault_step=options.fault_step, dataset=options.dataset,
    )
    raw = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if options.output:
        output = options.output.resolve()
        if output.exists():
            raise ValueError("REFUSE_OVERWRITE_VIRTUAL_HOST_REPORT")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("x", encoding="utf-8") as fh:
            fh.write(raw)
        print("OCTUBER_VIRTUAL_HOST_SANDBOX_REPORT_WRITTEN", output)
    else:
        print(raw)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError) as exc:
        print("OCTUBER_VIRTUAL_HOST_SANDBOX_ERROR:", str(exc), file=sys.stderr)
        sys.exit(2)
