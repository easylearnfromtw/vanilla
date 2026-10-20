import json
from hashlib import sha256
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
import noodles_infer


class StudentInferenceTests(unittest.TestCase):
    def test_unreviewed_adapter_does_not_pass_provenance_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            evaluation = root / "eval.jsonl"
            evaluation.write_text('{"prompt":[{"role":"user","content":"請比較兩種產品的成本結構"}],"completion":[{"role":"assistant","content":"比較固定成本與變動成本，並分別列出差異。"}]}\n')
            adapter = root / "adapter"
            adapter.mkdir()
            (adapter / "adapter_config.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "manifest"):
                noodles_infer.verify_adapter(adapter, evaluation, "Qwen/Qwen2.5-0.5B-Instruct")
            manifest = {
                "base_model": "Qwen/Qwen2.5-0.5B-Instruct", "mode": "sft",
                "deployment_status": "not_deployed",
                "sha256_eval": sha256(evaluation.read_bytes()).hexdigest()
            }
            (adapter / "noodles-training-manifest.json").write_text(json.dumps(manifest))
            self.assertEqual(noodles_infer.verify_adapter(
                adapter, evaluation, "Qwen/Qwen2.5-0.5B-Instruct")["mode"], "sft")
            with self.assertRaisesRegex(ValueError, "base model"):
                noodles_infer.verify_adapter(adapter, evaluation, "qwen3:7b")
            with self.assertRaisesRegex(ValueError, "Held-out"):
                evaluation.write_text(evaluation.read_text() + "\n")
                noodles_infer.verify_adapter(adapter, evaluation, "Qwen/Qwen2.5-0.5B-Instruct")
            evaluation.write_text(evaluation.read_text().rstrip("\n") + "\n")
            manifest.pop("sha256_eval")
            (adapter / "noodles-training-manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "provenance"):
                noodles_infer.verify_adapter(adapter, evaluation, "Qwen/Qwen2.5-0.5B-Instruct")

    def test_inference_never_launches_without_explicit_flag(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = ["--eval", str(root / "eval.jsonl"),
                    "--adapter", str(root / "adapter"), "--model", "Qwen/Qwen2.5-0.5B-Instruct",
                    "--output", str(root / "answers.jsonl")]
            with self.assertRaisesRegex(ValueError, "explicit"):
                noodles_infer.main(args)
            self.assertFalse((root / "answers.jsonl").exists())


if __name__ == "__main__":
    unittest.main()
