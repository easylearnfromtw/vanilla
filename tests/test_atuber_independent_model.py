"""CPU-only Atuber model lineage tests; never download or train a model in CI."""
import ast
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAIN = ROOT / "training" / "atuber"
sys.path.insert(0, str(TRAIN))
from dataset import BASE, validate_jsonl, to_conversations  # noqa: E402
from merge import inspect_provenance  # noqa: E402
from package import package  # noqa: E402

def make_row(i):
    return {
        "id": f"curated_{i:03d}",
        "user": f"請解釋本地工具回條的限制，情境 {i}。",
        "assistant": "沒有取得真實工具執行回條之前，不會宣稱已經完成任何寫入或發送。",
        "domain": "tool-use", "source": "authored",
        "reviewed": True, "consent": True
    }

class TestAtuberIndependentModel(unittest.TestCase):
    def test_pipeline_compiles_without_ml_dependencies(self):
        for name in ("dataset.py", "train.py", "merge.py", "package.py"):
            source = (TRAIN / name).read_text(encoding="utf-8")
            ast.parse(source, filename=name)

    def test_reviewed_holdout_and_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp) / "approved.jsonl"
            data.write_text("".join(json.dumps(make_row(i), ensure_ascii=False)+"\n"
                                    for i in range(120)), encoding="utf-8")
            rows, digest = validate_jsonl(data)
            self.assertEqual(len(rows), 120)
            self.assertEqual(digest, hashlib.sha256(data.read_bytes()).hexdigest())
            training, evaluation = to_conversations(rows)
            self.assertGreater(len(training), 0)
            self.assertGreater(len(evaluation), 0)
            self.assertEqual(len(training) + len(evaluation), len(rows))
            self.assertEqual(training[0]["messages"][0]["role"], "system")
            self.assertEqual(training[0]["messages"][-1]["role"], "assistant")

    def test_unreviewed_and_sensitive_data_rejected(self):
        changes = [
            ("reviewed", False), ("consent", False),
            ("user", "我的密碼 password = verybadsecret123"),
            ("assistant", "寄到 test@example.com"),
            ("source", "scraped"), ("domain", "medical-record")
        ]
        for key, value in changes:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as temp:
                row = make_row(1)
                row[key] = value
                path = Path(temp) / "bad.jsonl"
                path.write_text(json.dumps(row, ensure_ascii=False)+"\n", encoding="utf-8")
                with self.assertRaises(ValueError):
                    validate_jsonl(path, min_rows=1)

    def test_no_duplicate_and_at_least_100_reviewed_items(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "small.jsonl"
            path.write_text("".join(json.dumps(make_row(i), ensure_ascii=False)+"\n" for i in range(99)), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "MINIMUM_100"):
                validate_jsonl(path)
            path.write_text(json.dumps(make_row(1),ensure_ascii=False)+"\n"+
                            json.dumps(make_row(1),ensure_ascii=False)+"\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "DUPLICATE"):
                validate_jsonl(path, min_rows=1)

    def test_no_forged_release_without_verified_training(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with self.assertRaisesRegex(ValueError,"PROVENANCE"):
                inspect_provenance(directory)
            (directory/"atuber-release.json").write_text('{"model_id":"atuber-0.1","release_state":"bootstrap-only"}')
            gguf=directory/"fake.gguf"
            gguf.write_bytes(b"GGUF"+bytes(4096))
            with self.assertRaisesRegex(ValueError,"TRAINING_LINEAGE"):
                package(str(directory),str(gguf),str(directory/"output"))

    def test_ui_manifest_never_claims_unproduced_weights(self):
        state=json.loads((ROOT/"models"/"atuber"/"manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(state["release_state"],"bootstrap-only")
        self.assertIsNone(state["standalone_weights"])
        self.assertIsNone(state["training_dataset_sha256"])
        code=(ROOT/"src"/"ai"/"atuber-model-status.ts").read_text(encoding="utf-8")
        self.assertIn("ATUBER_HAS_INDEPENDENT_WEIGHTS",code)
        self.assertIn("Qwen3 0.6B 基底",code)
        self.assertIn("獨立微調權重",code)

if __name__=="__main__":
    unittest.main()
