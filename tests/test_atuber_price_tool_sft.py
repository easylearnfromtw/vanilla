"""CPU-only language SFT preflight; never assert GPU or model-training completion."""
import ast
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ATUBER=ROOT/"training"/"atuber"
sys.path.insert(0,str(ATUBER))
from price_tool_sft_candidates import generate,SCENARIOS,PREFIXES
from dataset import validate_jsonl,to_conversations

class TestAtuberPricingLanguageSft(unittest.TestCase):
 def test_draft_is_diverse_but_never_pretends_review_or_consent(self):
  rows=generate()
  self.assertEqual(len(rows),len(SCENARIOS)*len(PREFIXES))
  self.assertGreaterEqual(len(rows),150)
  self.assertEqual(len({r["id"] for r in rows}),len(rows))
  self.assertEqual(len({r["user"] for r in rows}),len(rows))
  self.assertTrue({"pricing","tool-use","abstention"}.issubset({r["domain"] for r in rows}))
  self.assertTrue(all(r["reviewed"] is False and r["consent"] is False for r in rows))
  self.assertTrue(all(r["source"]=="candidate-generated" for r in rows))
 def test_drafts_cannot_train_as_if_human_reviewed(self):
  with tempfile.TemporaryDirectory() as temp:
   source=Path(temp)/"draft.jsonl"
   source.write_text("".join(json.dumps(r,ensure_ascii=False)+"\n" for r in generate()),encoding="utf8")
   with self.assertRaisesRegex(ValueError,"TRAINING_APPROVAL_REQUIRED"):
    validate_jsonl(source)
 def test_reviewed_test_fixtures_split_by_family_never_paraphrase_leak(self):
  # Fake approved records exist exclusively in memory for policy unit tests.
  rows=[]
  for family in range(60):
   for variant in range(4):
    rows.append({"id":f"unit_only_{family:03d}__v{variant}",
      "user":f"測試專用問題 family-{family} variant-{variant} 不是真實購物者。",
      "assistant":"測試專用回覆：請確認來源及工具回條；不代表完成模型訓練。",
      "domain":"pricing","source":"authored","reviewed":True,"consent":True})
  training,heldout=to_conversations(rows)
  cases=lambda examples:{x["messages"][-2]["content"].split("family-")[1].split(" ")[0] for x in examples}
  self.assertTrue(training and heldout)
  self.assertFalse(cases(training)&cases(heldout))
  self.assertEqual(len(training)+len(heldout),240)
 def test_training_script_has_real_completion_only_loss_not_chat_echo(self):
  code=(ATUBER/"train.py").read_text(encoding="utf8")
  ast.parse(code)
  self.assertIn("completion_only_loss=True",code)
  self.assertIn('train_examples = [completion_record(row) for row in training]',code)
  self.assertIn('eval_examples = [completion_record(row) for row in holdout]',code)
  self.assertNotIn("assistant_only_loss=True",code)
  self.assertIn("torch.cuda.is_available()",code)
  self.assertIn('adapter_model.safetensors',code)
 def test_no_implicit_prod_manifest_or_user_data_mutation(self):
  manifest=json.loads((ROOT/"models"/"atuber"/"manifest.json").read_text())
  self.assertEqual(manifest["release_state"],"bootstrap-only")
  self.assertIsNone(manifest["standalone_weights"])
  self.assertIsNone(manifest["adapter"])
  generator=(ATUBER/"price_tool_sft_candidates.py").read_text()
  self.assertNotIn("torch.optim",generator)
  self.assertNotIn("transformers",generator)
  self.assertNotIn("fetch(",generator)

if __name__=="__main__":unittest.main()
