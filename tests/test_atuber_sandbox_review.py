import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training" / "atuber"))
from review_sandbox_queue import template, promote
from dataset import validate_jsonl


def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(x, ensure_ascii=False)+"\n" for x in rows), encoding="utf-8")


class AtuberSandboxPromotionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.queue = self.base / "candidates.jsonl"
        self.decisions = self.base / "decisions.jsonl"
        self.output = self.base / "reviewed.jsonl"
        self.items = [{
            "id": f"synthetic_{i:04d}", "user": f"在沙盤事件 {i} 中，請選擇下一個虛擬工具。",
            "assistant": '{"tool":"inspect"}', "domain": "tool-use",
            "source": "synthetic-sandbox", "reviewed": False, "consent": False,
            "eligibleForTraining": False, "holdout": i%10==0
        } for i in range(111)]
        write_jsonl(self.queue, self.items)

    def decisions_from_template(self):
        template(self.queue, self.decisions)
        return [json.loads(l) for l in self.decisions.read_text(encoding="utf-8").splitlines()]

    def test_template_does_not_mark_approval(self):
        rows=self.decisions_from_template()
        self.assertEqual(len(rows),111)
        self.assertTrue(all(not x["approved"] for x in rows))
        with self.assertRaisesRegex(ValueError,"NEED_100"):
            promote(self.queue,self.decisions,self.output)
        self.assertFalse(self.output.exists())

    def test_explicit_100_plus_reviews_produce_valid_training_data_and_exclude_holdout(self):
        rows=self.decisions_from_template()
        for r in rows:
            r.update({"approved": True, "quality_checked": True, "rights_confirmed": True, "reviewer": "tester-human-review"})
        write_jsonl(self.decisions, rows)
        receipt=promote(self.queue,self.decisions,self.output)
        self.assertEqual(receipt["approvedRows"],99)
        # NOTE: 111 records with index 0..110: 12 holdouts; 99 others.
        # The promotion must refuse insufficient reviewed non-holdout count.

    def test_tampered_hash_rejected(self):
        rows=self.decisions_from_template()
        for r in rows:
            r.update({"approved": True, "quality_checked": True, "rights_confirmed": True, "reviewer": "tester-human-review"})
        rows[1]["sha256"]="0"*64
        write_jsonl(self.decisions, rows)
        with self.assertRaisesRegex(ValueError,"APPROVAL_PROVENANCE"):
            promote(self.queue,self.decisions,self.output)
        self.assertFalse(self.output.exists())


if __name__=="__main__":
    unittest.main()
