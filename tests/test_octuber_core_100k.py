"""100,000-step real tiny-core CPU gradients and large-model virtual steps.

No large checkpoint downloads, no CUDA, no unapproved user data in CI.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROOT_SANDBOX = ROOT / "training" / "octuber-gpu-sandbox"
sys.path.insert(0, str(ROOT_SANDBOX))
sys.path.insert(0, str(ROOT / "training" / "atuber"))
from core_contract import LORA_RANK, LORA_ALPHA, core_policy, verify_approved_sft  # noqa: E402

spec = importlib.util.spec_from_file_location("octuber_surrogate_core_100k", ROOT_SANDBOX / "core_sandbox.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
virt_spec = importlib.util.spec_from_file_location("octuber_virtual_host_100k", ROOT_SANDBOX / "virtual_host.py")
virtual = importlib.util.module_from_spec(virt_spec)
virt_spec.loader.exec_module(virtual)


class OneHundredThousandStepCoreTests(unittest.TestCase):
    def test_real_100k_tiny_gradient_updates_on_both_targets(self):
        report = core.build_report(["30b", "60b"], 100000)
        self.assertEqual(len(report["results"]), 2)
        for row in report["results"]:
            self.assertEqual(row["steps_of_real_surrogate_gradient_updates"], 100000)
            self.assertEqual(row["surrogate_trainable_parameters"], 72)
            self.assertEqual(row["lora_rank"], LORA_RANK)
            self.assertEqual(row["lora_alpha"], LORA_ALPHA)
            self.assertLess(row["heldout_loss_final"], row["heldout_loss_initial"])
            self.assertEqual(len(row["loss_history"]), 10)
            self.assertRegex(row["surrogate_adapter_sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(row["synthetic_examples_only"])
            self.assertFalse(row["model_0_6b_weights_updated"])
            self.assertFalse(row["model_30b_weights_updated"])
            self.assertFalse(row["model_60b_weights_updated"])
        self.assertFalse(report["real_0_6b_30b_or_60b_weights_trained"])

    def test_atuber_core_matches_real_trainer_configurations(self):
        policy = core_policy()
        self.assertEqual(policy["rank"], 8)
        self.assertEqual(policy["alpha"], 16)
        self.assertTrue(policy["review_and_consent_required"])
        self.assertFalse(policy["toy_synthetic_examples_approved_for_llm_sft"])
        for path in ("training/atuber/train.py", "training/octuber-sumptuous/train.py"):
            text = (ROOT / path).read_text(encoding="utf-8")
            for token in ("LORA_RANK", "LORA_ALPHA", "LORA_DROPOUT", "core_policy"):
                self.assertIn(token, text)

    def test_no_unapproved_training_data_bypass(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "not-reviewed.jsonl"
            path.write_text('{"id":"abc","reviewed":false}\n', encoding="utf-8")
            with self.assertRaises(ValueError):
                verify_approved_sft(path)

    def test_100k_virtual_steps_each_and_fault_resume(self):
        r = virtual.simulate(model_names=["30b","60b"], host_name="virtual-96",
                             steps=100000, fault_step=55005)
        self.assertEqual(r["requested_virtual_steps_per_model"], 100000)
        self.assertEqual(r["virtual_metadata_checkpoint_interval_steps"], 1000)
        self.assertEqual(r["virtual_ticks"], 200005)
        self.assertLess(len(r["events"]), 220)
        self.assertFalse(r["cuda_used"])
        self.assertFalse(r["real_model_forward_or_backward_performed"])
        self.assertFalse(r["large_model_training_completed"])
        for item in r["jobs"].values():
            self.assertEqual(item["simulated_steps_completed"], 100000)
            self.assertEqual(item["state"], "simulated-schedule-completed")
            self.assertFalse(item["simulated_weights_created"])
        self.assertEqual(r["jobs"]["30b"]["simulated_recovery_count"], 1)
        self.assertEqual(r["jobs"]["60b"]["simulated_recovery_count"], 0)
        self.assertTrue(any(e["event"]=="virtual_metadata_resume" and
                            e["resume_step"]==55000 for e in r["events"]))

    def test_cli_will_not_overwrite_training_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)/"surrogate.json"
            output.write_text("original", encoding="utf-8")
            cmd = [sys.executable, str(ROOT_SANDBOX/"core_sandbox.py"),
                   "--model", "30b", "--steps", "10", "--output", str(output)]
            run = subprocess.run(cmd, capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(output.read_text(encoding="utf-8"), "original")


if __name__ == "__main__":
    unittest.main()
