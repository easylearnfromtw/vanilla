"""The GPU execution gate must never manufacture language model weights."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE/"training"/"atuber"))
from actual_gpu_execution_gate import check,main

class ActualGpuExecutionGateTests(unittest.TestCase):
 def test_each_size_reports_truthful_readiness_and_zero_optimizer_steps(self):
  for size in ("0.6b","1.7b","4b","8b","14b","30b","32b"):
   with self.subTest(size=size):
    report=check(model_size=size,dataset=None,base_revision=None)
    self.assertEqual(report["status"],"blocked-untrained")
    self.assertEqual(report["actual_qwen_optimizer_steps"],0)
    self.assertIs(report["new_lora_adapter_created"],False)
    self.assertIs(report["no_training_started"],True)
    self.assertFalse(next(x for x in report["checks"] if x["requirement"]=="approved_dataset")["ready"])
 def test_unreviewed_price_draft_does_not_satisfy_real_model_training(self):
  from price_tool_sft_candidates import generate
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/"draft.jsonl"
   p.write_text("".join(json.dumps(x,ensure_ascii=False)+"\n" for x in generate()),encoding="utf8")
   report=check(model_size="1.7b",dataset=p,base_revision="a"*40)
   check_data=next(x for x in report["checks"] if x["requirement"]=="approved_dataset")
   self.assertFalse(check_data["ready"])
   self.assertIn("TRAINING_APPROVAL_REQUIRED",check_data["detail"])
   self.assertEqual(report["status"],"blocked-untrained")
 def test_nonexistent_local_weights_do_not_become_base_ready(self):
  report=check(model_size="8b",dataset=None,base_revision="b"*40)
  cache=next(x for x in report["checks"]
             if x["requirement"]=="base_weights_present_or_download_authorized")
  self.assertFalse(cache["ready"])
 def test_output_receipt_refuses_overwriting(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp)/"receipt.json"
   self.assertEqual(main(["--model-size","4b","--output",str(out)]),0)
   status=json.loads(out.read_text())
   self.assertEqual(status["status"],"blocked-untrained")
   with self.assertRaisesRegex(SystemExit,"REFUSE_TO_OVERWRITE"):
    main(["--model-size","4b","--output",str(out)])

if __name__=="__main__":unittest.main()
