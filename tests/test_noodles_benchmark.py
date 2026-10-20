"""NOODLES benchmarking is scored by a human; aggregate reports contain no prompts."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
import noodles_benchmark as bench
from noodles_distill import encode_rows


def case(n: int) -> dict:
    return {
        "prompt": [{"role": "user", "content": f"請列出第 {n} 項明確輸入的重點"}],
        "completion": [{"role": "assistant",
                        "content": f"第 {n} 項應採用可信來源，避免捏造超出題目範圍的內容。"}]
    }


class BenchmarkTests(unittest.TestCase):
    def test_offline_reviewed_ab_and_no_text_in_report(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            evaluation = root / "eval.jsonl"
            evaluation.write_text(encode_rows([case(i) for i in range(12)]), encoding="utf-8")
            template = root / "template.jsonl"
            report = root / "report.json"
            self.assertEqual(bench.main(["template", "--eval", str(evaluation),
                                         "--output", str(template)]), 0)
            rows = [json.loads(x) for x in template.read_text().splitlines()]
            self.assertEqual(len(rows), 12)
            self.assertFalse(rows[0]["reviewed"])
            self.assertIsNone(rows[0]["tuned_score"])
            for item in rows:
                item["baseline_answer"] = "這是未使用 LoRA 的原模型測試回答。"
                item["tuned_answer"] = "這是 LoRA 模型經人工核對的測試回答。"
                item["baseline_score"] = 2
                item["tuned_score"] = 3
                item["baseline_unsupported"] = True
                item["tuned_unsupported"] = False
                item["reviewed"] = True
            scores = root / "scores.jsonl"
            scores.write_text(encode_rows(rows), encoding="utf-8")
            self.assertEqual(bench.main(["report", "--eval", str(evaluation),
                                         "--scores", str(scores), "--output", str(report)]), 0)
            data = json.loads(report.read_text())
            self.assertTrue(data["eligible_for_manual_release_review"])
            self.assertFalse(data["model_deployed"])
            self.assertEqual(data["reviewed_cases"], 12)
            self.assertEqual(data["average_improvement"], 1.0)
            self.assertNotIn("測試回答", report.read_text())
            self.assertNotIn("請列出", report.read_text())

    def test_rubric_cannot_self_verify_or_forge_reviewed_cases(self):
        expected = bench.template_rows([case(0)])[0]
        valid = {**expected, "baseline_answer": "基準模型的輸出文字",
                 "tuned_answer": "微調模型的輸出文字",
                 "baseline_score": 2, "tuned_score": 3,
                 "baseline_unsupported": False, "tuned_unsupported": False, "reviewed": True}
        bench.validate_review(valid, expected)
        for bad in [
            {**valid, "reviewed": False},
            {**valid, "tuned_score": True},
            {**valid, "baseline_score": 9},
            {**valid, "baseline_unsupported": None},
            {**valid, "case_id": "forged"},
            {**valid, "reference": "forged"},
            {**valid, "private": "unexpected"}
        ]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                bench.validate_review(bad, expected)

    def test_insufficient_held_out_cases_do_not_qualify(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            evaluation = root / "eval.jsonl"
            evaluation.write_text(encode_rows([case(i) for i in range(4)]), encoding="utf-8")
            rows = bench.template_rows([case(i) for i in range(4)])
            for item in rows:
                item.update({"baseline_answer": "合理但不完整的基本回答",
                             "tuned_answer": "正確且有完整說明的模型回答",
                             "baseline_score": 1, "tuned_score": 4,
                             "baseline_unsupported": True,
                             "tuned_unsupported": False, "reviewed": True})
            review = root / "reviews.jsonl"
            review.write_text(encode_rows(rows), encoding="utf-8")
            output = root / "report.json"
            bench.main(["report", "--eval", str(evaluation),
                        "--scores", str(review), "--output", str(output)])
            self.assertFalse(json.loads(output.read_text())["eligible_for_manual_release_review"])

    def test_rejects_different_case_count_and_train_leakage(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            evaluation = root / "eval.jsonl"
            evaluation.write_text(encode_rows([case(i) for i in range(4)]))
            review = root / "review.jsonl"
            review.write_text(encode_rows(bench.template_rows([case(i) for i in range(3)])))
            with self.assertRaisesRegex(ValueError, "Every held-out"):
                bench.main(["report", "--eval", str(evaluation), "--scores", str(review),
                            "--output", str(root / "report.json")])


if __name__ == "__main__":
    unittest.main()
