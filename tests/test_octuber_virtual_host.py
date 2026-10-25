"""Hermetic, stdlib-only tests of virtual-GPU orchestration and honesty."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SANDBOX_DIR = ROOT / "training" / "octuber-gpu-sandbox"
sys.path.insert(0, str(SANDBOX_DIR))
spec = importlib.util.spec_from_file_location("octuber_virtual_host", SANDBOX_DIR / "virtual_host.py")
virtual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(virtual)


class VirtualHostTests(unittest.TestCase):
    def test_24_gib_fails_both_resource_screens(self):
        result = virtual.simulate(model_names=["30b", "60b"], host_name="desktop-24", steps=20)
        self.assertEqual(result["jobs"]["30b"]["state"], "blocked-resource-screen")
        self.assertEqual(result["jobs"]["60b"]["state"], "blocked-resource-screen")
        self.assertEqual(result["virtual_ticks"], 0)
        self.assertFalse(result["gpu_hardware_accessed"])

    def test_48_gib_schedules_30b_but_not_60b(self):
        result = virtual.simulate(model_names=["30b", "60b"], host_name="workstation-48", steps=20)
        self.assertEqual(result["jobs"]["30b"]["simulated_steps_completed"], 20)
        self.assertEqual(result["jobs"]["60b"]["state"], "blocked-resource-screen")
        self.assertFalse(result["jobs"]["30b"]["simulated_weights_created"])
        self.assertFalse(result["large_model_training_completed"])

    def test_96_gib_sequential_jobs_with_missing_60b_driver(self):
        result = virtual.simulate(model_names=["30b", "60b"], host_name="virtual-96", steps=12)
        for key in ("30b", "60b"):
            self.assertEqual(result["jobs"][key]["simulated_steps_completed"], 12)
            self.assertEqual(result["jobs"][key]["state"], "simulated-schedule-completed")
            self.assertEqual(result["jobs"][key]["virtual_gpu_slot"], 0)
        self.assertFalse(result["jobs"]["60b"]["real_training_driver_available_in_repo"])
        self.assertEqual(result["virtual_ticks"], 24)
        self.assertFalse(result["real_model_forward_or_backward_performed"])
        self.assertFalse(result["real_large_model_checkpoint_created"])

    def test_dual_80_gib_does_not_become_160_gib_single_gpu(self):
        result = virtual.simulate(model_names=["30b", "60b"],
                                  host_name="virtual-dual-80", steps=10)
        self.assertEqual(result["host_specification"]["gpu_count"], 2)
        self.assertEqual(result["jobs"]["60b"]["state"], "blocked-resource-screen")
        self.assertIn("SINGLE_GPU_VRAM_BELOW_HEURISTIC_SCREEN",
                      result["jobs"]["60b"]["block_reasons"])

    def test_failure_recovers_from_last_metadata_checkpoint_only(self):
        r = virtual.simulate(model_names=["30b"], host_name="virtual-96",
                             steps=12, fault_step=8)
        job = r["jobs"]["30b"]
        self.assertEqual(job["simulated_steps_completed"], 12)
        self.assertEqual(job["simulated_recovery_count"], 1)
        self.assertIn(5, job["virtual_metadata_checkpoints"])
        self.assertGreater(job["simulated_step_attempts"], 12)
        self.assertTrue(any(e["event"] == "virtual_metadata_resume" and
                            e["resume_step"] == 5 for e in r["events"]))
        self.assertTrue(all(not e.get("contains_neural_weights", False)
                            for e in r["events"]))
        self.assertFalse(r["cuda_used"])

    def test_unapproved_dataset_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            raw = Path(d) / "unapproved.jsonl"
            raw.write_text('{"id":"abc","reviewed":false}\n', encoding="utf-8")
            with self.assertRaises(ValueError):
                virtual.simulate(model_names=["30b"], host_name="virtual-96",
                                 steps=5, dataset=raw)

    def test_cli_json_no_overwrite_and_no_secret_gpus(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "virtual-30b-60b.json"
            command = [sys.executable, str(SANDBOX_DIR / "virtual_host.py"),
                       "--models", "all", "--host", "virtual-96",
                       "--steps", "10", "--fault-step", "6",
                       "--output", str(out)]
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertFalse(data["gpu_hardware_accessed"])
            self.assertFalse(data["large_model_training_completed"])
            self.assertFalse(data["reviewed_dataset"]["validated"])
            original = out.read_bytes()
            again = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(again.returncode, 0)
            self.assertEqual(out.read_bytes(), original)

    def test_fault_argument_and_duplicate_models_rejected(self):
        with self.assertRaises(ValueError):
            virtual.simulate(model_names=["30b"], host_name="virtual-96", steps=4, fault_step=5)
        with self.assertRaises(ValueError):
            virtual.simulate(model_names=["30b", "30b"], host_name="virtual-96", steps=10)


if __name__ == "__main__":
    unittest.main()
