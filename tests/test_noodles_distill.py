"""Offline-only regression suite; no network/GPU, only stdlib."""
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
import noodles_distill as distill
from noodles_train import read_samples


def row(n, **changes):
    result = {
        "question": f"請判斷測試項目第 {n} 號中的完整分析條件",
        "context": f"測試素材：第 {n} 號為人工撰寫之合成案例，沒有個人資料。",
        "task": "analysis",
        "draft_answer": "這是本機合成的教師初稿，只供人類複核。",
        "approved_answer": f"經人工確認，第 {n} 號案例需要對照已提供的原始證據。",
        "reviewed": True, "rights_confirmed": True,
        "license_note": "原創合成測試資料，作者同意本地訓練",
        "source": "human-authored", "teacher_model": "human"
    }
    result.update(changes)
    return result


class DistillationTests(unittest.TestCase):
    def test_validated_approved_cases_and_trainer_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "reviewed.jsonl"
            source.write_text(distill.encode_rows([row(i) for i in range(16)]), encoding="utf-8")
            train, evaluation, manifest = [root / filename for filename in
                                            ("train.jsonl", "eval.jsonl", "manifest.json")]
            self.assertEqual(distill.main(["prepare", "--input", str(source),
                                          "--train", str(train), "--eval", str(evaluation),
                                          "--manifest", str(manifest)]), 0)
            samples = read_samples(train, "sft")
            held_out = read_samples(evaluation, "sft")
            self.assertEqual(len(samples) + len(held_out), 16)
            self.assertGreaterEqual(len(samples), 10)
            self.assertGreaterEqual(len(held_out), 3)
            self.assertTrue(all("參考資料" in item["prompt"][0]["content"] for item in samples))
            info = json.loads(manifest.read_text())
            self.assertEqual(info["training_examples"], len(samples))
            self.assertFalse(info["deployment_authorized"])
            self.assertFalse(info["weights_trained"])
            self.assertNotIn("合成案例", manifest.read_text(), "No private training text in manifest")
            if sys.platform != "win32":
                self.assertEqual(stat.S_IMODE(train.stat().st_mode), 0o600)

    def test_train_eval_split_is_order_invariant(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for tag, entries in (("a", list(range(17))), ("b", list(reversed(range(17))))):
                src = root / (tag + "-reviewed.jsonl")
                src.write_text(distill.encode_rows([row(i) for i in entries]), encoding="utf-8")
                distill.main(["prepare", "--input", str(src),
                              "--train", str(root / (tag + "-train.jsonl")),
                              "--eval", str(root / (tag + "-eval.jsonl")),
                              "--manifest", str(root / (tag + "-manifest.json"))])
            self.assertEqual((root / "a-train.jsonl").read_bytes(),
                             (root / "b-train.jsonl").read_bytes())
            self.assertEqual((root / "a-eval.jsonl").read_bytes(),
                             (root / "b-eval.jsonl").read_bytes())

    def test_check_only_allows_small_review_batches_without_producing_files(self):
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / "small.jsonl"
            src.write_text(distill.encode_rows([row(1)]), encoding="utf-8")
            self.assertEqual(distill.main(["prepare", "--input", str(src), "--check-only"]), 0)
            self.assertEqual(list(Path(folder).glob("*.json")), [])

    def test_rejects_nonreviewed_unlicensed_and_private_examples(self):
        invalid = [
            row(1, reviewed=False),
            row(1, rights_confirmed=False),
            row(1, source="local-open-weight", teacher_model="gemini-3.8-flash"),
            row(1, approved_answer="Use sk-abcdefghijklmnopqrstuvwxyz0123456 now"),
            row(1, question="聯絡我 at owner@example.com 並確認資料"),
            row(1, license_note="no"),
            row(1, api_key="private"),
        ]
        for case in invalid:
            with self.subTest(case=case):
                with self.assertRaises((ValueError, TypeError, KeyError)):
                    distill.validate_approved(case)

    def test_identical_and_near_duplicate_prompts_fail_closed(self):
        for questions in (["請比較固定成本與變動成本的差異", "請比較固定成本與變動成本的差異"],
                          ["請比較固定成本與變動成本的差異", "請 比較固定成本與變動成本的差異"]):
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                distill.deduplicate_questions([{"question": q} for q in questions])

    def test_rejects_overwrite_including_inputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            input_path = root / "approved.jsonl"
            input_path.write_text(distill.encode_rows([row(i) for i in range(15)]))
            existing = root / "occupied.jsonl"
            existing.write_text("keep me")
            with self.assertRaisesRegex(ValueError, "already exists"):
                distill.main(["prepare", "--input", str(input_path), "--train", str(existing),
                              "--eval", str(root / "eval.jsonl"),
                              "--manifest", str(root / "manifest.json")])
            self.assertEqual(existing.read_text(), "keep me")

    def test_local_teacher_only_no_remote_redirects_or_credentials(self):
        self.assertEqual(distill.local_teacher_endpoint("http://127.0.0.1:11434"),
                         "http://127.0.0.1:11434/api/chat")
        for address in ["https://127.0.0.1:11434",
                        "http://example.com:11434",
                        "http://127.0.0.1.evil.com:11434",
                        "http://127.0.0.1:11434/redirect",
                        "http://name:pass@127.0.0.1:11434",
                        "http://127.0.0.1"]:
            with self.subTest(address=address), self.assertRaises(ValueError):
                distill.local_teacher_endpoint(address)
        handler = distill.NoRedirect()
        with self.assertRaises(ValueError):
            handler.redirect_request(None, None, 302, "Found", {}, "https://example.com")

    def test_review_draft_defaults_block_training(self):
        question = {"question": "請比較不同方式的具體主要特點",
                    "context": "僅作練習的自編參考材料", "task": "analysis"}
        self.assertTrue(distill.valid_question(question))
        draft = {**question, "draft_answer": "這是尚未驗證的候選輸出",
                 "approved_answer": "", "reviewed": False, "rights_confirmed": False,
                 "license_note": "", "source": "local-open-weight",
                 "teacher_model": "qwen2.5:7b"}
        with self.assertRaises(ValueError):
            distill.validate_approved(draft)


if __name__ == "__main__":
    unittest.main()
