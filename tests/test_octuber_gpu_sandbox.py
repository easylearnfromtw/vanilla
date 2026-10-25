"""CPU-only OCTUBER 30B+60B training sandbox regression tests."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "training/octuber-gpu-sandbox/sandbox.py"
spec = importlib.util.spec_from_file_location("octuber_gpu_sandbox", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TestOctuberGpuSandbox(unittest.TestCase):
    def test_real_upstream_checkpoints_are_distinct(self):
        self.assertEqual(set(module.PROFILES), {"30b", "60b"})
        self.assertEqual(module.PROFILES["30b"]["upstream"], "Qwen/Qwen3-30B-A3B-Instruct-2507")
        self.assertEqual(module.PROFILES["60b"]["upstream"], "MultiverseComputingCAI/HyperNova-60B")
        self.assertGreater(module.PROFILES["60b"]["total_parameters_billions"], 50)
        self.assertIsNone(module.PROFILES["60b"]["real_training_driver"])

    def test_memory_lower_bound_is_never_a_gpu_training_claim(self):
        p30 = module.estimate(module.PROFILES["30b"], scenario_gib=24)
        p60 = module.estimate(module.PROFILES["60b"], scenario_gib=96)
        self.assertLess(p30["4bit_gib"], p60["4bit_gib"])
        self.assertGreater(p60["bf16_gib"], 100)
        self.assertFalse(p30["scenario_meets_nonbinding_screen"])
        self.assertTrue(p60["scenario_meets_nonbinding_screen"])
        self.assertFalse(p30["capacity_guaranteed"])
        self.assertFalse(p60["capacity_guaranteed"])

    def test_plan_never_creates_trained_large_model_state(self):
        result = module.make_report(["30b", "60b"], mode="plan", steps=20,
                                    scenario_gib=None, dataset=None)
        self.assertFalse(result["training_completed_for_30b_or_60b"])
        self.assertFalse(result["actual_gpu_toy_training_executed"])
        self.assertFalse(result["real_30b_or_60b_adapter_created"])
        self.assertEqual(result["training_dataset"]["reviewed_rows"], 0)
        self.assertIsNone(result["toy_experiment"])

    def test_unreviewed_data_and_overwrite_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            fake = Path(folder) / "unreviewed.jsonl"
            fake.write_text(json.dumps({"id": "x", "reviewed": True}) + "\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                module.assess_dataset(fake)
            output = Path(folder) / "sandbox.json"
            output.write_text("existing result", encoding="utf-8")
            runner = subprocess.run([sys.executable, str(SCRIPT), "--mode", "plan",
                                     "--output", str(output)], capture_output=True, text=True)
            self.assertNotEqual(runner.returncode, 0)
            self.assertEqual(output.read_text(encoding="utf-8"), "existing result")

    def test_toy_training_only_trains_1682_parameters_and_no_fake_gpu(self):
        try:
            import torch
        except ImportError:
            self.skipTest("Torch optional in CI; GPU model download explicitly forbidden")
        if not torch.cuda.is_available():
            with self.assertRaisesRegex(RuntimeError, "NO_REAL_CUDA"):
                module.small_gradient_experiment(on_cuda=True, steps=8)
        run = module.small_gradient_experiment(on_cuda=False, steps=8)
        self.assertEqual(run["backend"], "cpu")
        self.assertEqual(run["parameters_actually_trained"], 1682)
        self.assertLess(run["final_loss"], run["initial_loss"])
        self.assertFalse(run["large_model_weights_modified"])
        self.assertFalse(run["actual_cuda_toy_training_executed"])

    def test_60b_manifest_untrained_no_weight_files(self):
        state = json.loads((ROOT / "models/octuber-60b/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(state["release_state"], "sandbox-planned-untrained")
        self.assertFalse(state["training_completed"])
        self.assertIsNone(state["adapter"])
        self.assertIsNone(state["merged_weights"])
        self.assertFalse(state["training_driver_validated"])


if __name__ == "__main__":
    unittest.main()
