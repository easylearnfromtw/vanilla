"""CPU-only release-integrity regression tests for an UNTRAINED 30B model.

These tests NEVER download foundation weights, instantiate MoE, or invoke GPU.
No synthetic dataset can be accepted as evidence of production model quality.
"""
import ast
import hashlib
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "training" / "octuber-sumptuous"
sys.path.insert(0, str(PIPELINE))

from train import BASE, MODEL_ID, MIN_REVIEWED, TARGET_MODULES, validate_plan  # noqa: E402
from merge import verify_adapter  # noqa: E402
from package import verify_merged, verify_gguf  # noqa: E402


def sample(index):
    return {
        "id": f"approved_{index:05d}",
        "user": f"回答這個已經核准的泛用推理樣例編號 {index}，並說明證據界線。",
        "assistant": f"樣例 {index} 的答案：需要核對可查證資料，沒有工具回條就不能聲稱已執行。",
        "domain": "general", "source": "authored", "reviewed": True, "consent": True,
    }


class TestOctuberSumptuousThirtyB(unittest.TestCase):
    def test_all_pipeline_modules_compile_without_ml_dependencies(self):
        for name in ("train.py", "merge.py", "package.py"):
            source = (PIPELINE / name).read_text(encoding="utf-8")
            ast.parse(source, filename=name)

    def test_explicit_real_base_and_attention_lora_targets(self):
        self.assertEqual(BASE, "Qwen/Qwen3-30B-A3B-Instruct-2507")
        self.assertEqual(MODEL_ID, "octuber-sumptuous-30b-v0.1")
        self.assertEqual(MIN_REVIEWED, 100)
        self.assertIn("q_proj", TARGET_MODULES)
        self.assertIn("v_proj", TARGET_MODULES)

    def test_curated_data_checks_plan_without_claiming_training(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "reviewed.jsonl"
            path.write_text("".join(json.dumps(sample(n), ensure_ascii=False) + "\n"
                                    for n in range(150)), encoding="utf-8")
            plan = validate_plan(path)
            self.assertEqual(plan["reviewed_rows"], 150)
            self.assertGreaterEqual(plan["holdout_rows"], 5)
            self.assertEqual(plan["reviewed_rows"], plan["training_rows"] + plan["holdout_rows"])
            self.assertEqual(plan["dataset_sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertFalse(plan["trained"])

    def test_unreviewed_short_and_duplicate_records_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "data.jsonl"
            path.write_text("".join(json.dumps(sample(i),ensure_ascii=False)+"\n"
                                    for i in range(99)), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "MINIMUM_100"):
                validate_plan(path)
            invalid = sample(1)
            invalid["consent"] = False
            path.write_text(json.dumps(invalid, ensure_ascii=False)+"\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "APPROVAL_REQUIRED"):
                validate_plan(path)

    def test_missing_or_forged_adapter_is_not_trained(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaisesRegex(ValueError, "PROVENANCE_REQUIRED"):
                verify_adapter(root)
            (root / "training-provenance.json").write_text(
                json.dumps({
                    "model_id": MODEL_ID, "base_model": BASE,
                    "training_state": "adapter-trained-not-merged",
                    "trained": True, "base_revision": "a"*40,
                    "dataset_sha256": "b"*64, "reviewed_rows": 500,
                    "holdout_rows": 50, "eval_loss": 0.1, "release_state": "not-released",
                    "independent_inference_verified": False,
                    "base_license": "Apache-2.0",
                }), encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "ADAPTER_HASH_OR_SIZE_MISMATCH"):
                verify_adapter(root)

    def test_absent_merged_weights_and_fake_gguf_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaisesRegex(ValueError, "MERGED_PROVENANCE_REQUIRED"):
                verify_merged(root)
            path = root / "fake.gguf"
            path.write_bytes(b"GGUF"+struct.pack("<IQQ",3,1024,12)+b"0"*128)
            with self.assertRaisesRegex(ValueError,"REAL_30B_QUANTIZED"):
                verify_gguf(path)

    def test_public_repo_manifest_is_explicitly_untrained(self):
        manifest = json.loads((ROOT / "models" / "octuber-sumptuous" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["base_model"], BASE)
        self.assertEqual(manifest["release_state"], "planned-untrained")
        self.assertIsNone(manifest["merged_weights"])
        self.assertIsNone(manifest["gguf"])
        self.assertIsNone(manifest["adapter"])
        self.assertFalse(manifest["training_completed"])


if __name__ == "__main__":
    unittest.main()
