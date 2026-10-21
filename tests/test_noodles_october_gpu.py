"""No-GPU tests of October's strict numeric adapter acceptance checks."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

adapter = load_module(ROOT/"training/october/adapter-evaluate.py", "october_adapter_eval")
preflight = load_module(ROOT/"training/october/gpu-preflight.py", "october_gpu_preflight")


class OctoberAdapterAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.case = {
            "prompt": [{"role": "user", "content": "Calculate profit 100-60."}],
            "completion": [{"role": "assistant", "content": '{"value":40,"unit":"元"}'}],
        }
        self.holdout = self.base/"holdout.jsonl"
        self.train = self.base/"train.jsonl"
        self.holdout.write_text(json.dumps(self.case)+"\n", encoding="utf-8")
        modified = json.loads(json.dumps(self.case))
        modified["prompt"][0]["content"] = "Other numbers: 20 minus 11."
        self.train.write_text(json.dumps(modified)+"\n", encoding="utf-8")

    def test_correct_hard_number_and_unit_are_required(self):
        expected = {"value": 40, "unit": "元"}
        self.assertEqual(adapter.grade('{"unit":"元","value":40}', expected), "PASS")
        self.assertEqual(adapter.grade('{"unit":"元","value":41}', expected), "VALUE")
        self.assertEqual(adapter.grade('{"unit":"萬元","value":40}', expected), "UNIT")
        self.assertEqual(adapter.grade('{"unit":"元","value":"40"}', expected), "NUMERIC_TYPE")
        self.assertEqual(adapter.grade('{"unit":"元","value":40,"extra":"PASS"}', expected), "SCHEMA")
        self.assertEqual(adapter.grade('答案為 {"unit":"元","value":40}', expected), "NOT_JSON")
        self.assertEqual(adapter.grade('{"unit":"元","value":NaN}', expected), "NUMERIC_TYPE")

    def test_dataset_validated_and_leakage_refused(self):
        cases = adapter.load_cases(self.holdout)
        self.assertEqual(len(cases), 1)
        adapter.verify_isolation(cases, [self.train])
        self.train.write_text(json.dumps(self.case)+"\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "present"):
            adapter.verify_isolation(cases, [self.train])

    def test_duplicate_holdouts_refused(self):
        self.holdout.write_text((json.dumps(self.case)+"\n")*2, encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            adapter.load_cases(self.holdout)

    def test_adapter_must_bind_exact_base_and_sft_manifest(self):
        model = "Qwen/Qwen3-0.6B"
        self.assertRaisesRegex(ValueError, "required", adapter.validate_adapter, self.base, model)
        (self.base/"adapter_config.json").write_text(json.dumps({"base_model_name_or_path": model}))
        (self.base/"noodles-training-manifest.json").write_text(json.dumps({
            "base_model": model, "mode": "sft", "deployment_status": "not_deployed",
            "sha256_train": "1"*64, "sha256_eval": "2"*64,
        }))
        (self.base/"adapter_model.safetensors").write_bytes(b"synthetic-only")
        self.assertEqual(adapter.validate_adapter(self.base, model)["model"], model)
        with self.assertRaisesRegex(ValueError, "match"):
            adapter.validate_adapter(self.base, "Other/Qwen")
        data = json.loads((self.base/"noodles-training-manifest.json").read_text())
        data["deployment_status"] = "deployed"
        (self.base/"noodles-training-manifest.json").write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "provenance"):
            adapter.validate_adapter(self.base, model)

    def test_adapter_manifest_rejects_unrelated_training_datasets(self):
        model = "Qwen/Qwen3-0.6B"
        (self.base/"adapter_config.json").write_text(json.dumps({"base_model_name_or_path": model}))
        (self.base/"noodles-training-manifest.json").write_text(json.dumps({
            "base_model": model, "mode": "sft", "deployment_status": "not_deployed",
            "sha256_train": "1"*64, "sha256_eval": "2"*64,
        }))
        (self.base/"adapter_model.safetensors").write_bytes(b"synthetic-only")
        with self.assertRaisesRegex(ValueError, "checksum"):
            adapter.validate_adapter(self.base, model, self.train, self.holdout)

    def test_gpu_status_never_claims_weights_trained(self):
        status = preflight.inspect_hardware()
        self.assertEqual(status["weightsTrained"], False)
        self.assertIn("cudaAvailable", status)
        self.assertIn("readyForQwenQLoRA", status)
        self.assertIn("torch", status["pythonPackages"])
        if not status["cudaAvailable"]:
            self.assertFalse(status["readyForQwenQLoRA"])


if __name__ == "__main__":
    unittest.main()
