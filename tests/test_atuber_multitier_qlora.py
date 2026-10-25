"""CPU-only validation of October five-tier true-weight trainer contracts."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from multitier_plan import TIERS,config,latest_checkpoint,verify_resume
from multitier_train import main,verify_no_leakage


def record(index,prefix):
 return {"id":f"{prefix}_{index:05d}",
         "user":f"專業情境 {prefix} 題目編號 {index}，請根據資料作答。",
         "assistant":"先確認數據來源與使用範圍，再輸出經驗證的保守答案。",
         "domain":"research","source":"authored","reviewed":True,"consent":True}


def write(path,records):
 path.write_text("".join(json.dumps(x,ensure_ascii=False)+"\n" for x in records),encoding="utf-8")


class OctoberTrainingContract(unittest.TestCase):
 def test_every_tier_and_150k_plan(self):
  expected={"0.6b":"Qwen/Qwen3-0.6B","4b":"Qwen/Qwen3-4B",
            "14b":"Qwen/Qwen3-14B","30b-moe":"Qwen/Qwen3-30B-A3B",
            "32b":"Qwen/Qwen3-32B"}
  self.assertEqual({k:v.base_model for k,v in TIERS.items()},expected)
  for tier in TIERS:
   p=config(tier=tier,steps=150000,accumulation=8)
   self.assertEqual(p["expected_training_examples_seen_approximately"],1200000)
   self.assertEqual(p["gradient_updates_requested"],150000)
   self.assertFalse(p["real_model_training_completed"])
   self.assertTrue(p["cuda_training_required"])
   self.assertTrue(p["no_production_deploy"])
  for steps in [-1,0,15,150001]:
   with self.assertRaises(ValueError):
    config(tier="4b",steps=steps)

 def test_plan_never_downloads_or_trains(self):
  capture=io.StringIO()
  with contextlib.redirect_stdout(capture):
   self.assertEqual(main(["--tier","30b-moe","--steps","150000"]),0)
  out=json.loads(capture.getvalue())
  self.assertEqual(out["mode"],"DRY_RUN_ONLY")
  self.assertFalse(out["training_executed"])
  self.assertEqual(out["plan"]["model"]["kind"],"moe")

 def test_data_separation_and_optimizer_approval_required(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   train=root/"train.jsonl";evaluation=root/"evaluation.jsonl"
   write(train,[record(i,"training") for i in range(120)])
   write(evaluation,[record(i,"holdout") for i in range(120)])
   capture=io.StringIO()
   with contextlib.redirect_stdout(capture):
    code=main(["--tier","0.6b","--steps","180",
               "--validate-data","--dataset",str(train),
               "--eval-dataset",str(evaluation)])
   self.assertEqual(code,0)
   receipt=json.loads(capture.getvalue())
   self.assertFalse(receipt["training_executed"])
   self.assertNotEqual(receipt["dataset_sha256"],receipt["eval_sha256"])
   # Never turn validation into expensive GPU training without explicit approval.
   with self.assertRaises(SystemExit):
    main(["--tier","0.6b","--steps","180","--train",
          "--dataset",str(train),"--eval-dataset",str(evaluation),
          "--output",str(root/"weights")])
   self.assertFalse((root/"weights").exists())
   # Safety threshold for a 150k-step run prevents small 120-row data from
   # being presented as a suitable long-run corpus.
   with self.assertRaisesRegex(ValueError,"MINIMUM_1000"):
    main(["--tier","4b","--validate-data",
          "--dataset",str(train),"--eval-dataset",str(evaluation)])

 def test_prompt_and_identifier_leakage(self):
  a=record(1,"train")
  b=record(2,"holdout")
  verify_no_leakage([a],[b])
  with self.assertRaisesRegex(ValueError,"ID_LEAKAGE"):
   verify_no_leakage([a],[{**b,"id":a["id"]}])
  with self.assertRaisesRegex(ValueError,"PROMPT_LEAKAGE"):
   verify_no_leakage([a],[{**b,"user":a["user"].upper()}])

 def test_resume_requires_same_verified_request_and_valid_checkpoint(self):
  request=config(tier="14b",steps=150000)
  verify_resume(request,dict(request))
  with self.assertRaisesRegex(ValueError,"RESUME_CONFIG"):
   verify_resume(request,{**request,"tier":"4b"})
  with tempfile.TemporaryDirectory() as tmp:
   directory=Path(tmp)
   with self.assertRaisesRegex(ValueError,"RESUME_CHECKPOINT"):
    latest_checkpoint(directory)
   ckpt=directory/"checkpoint-500"
   ckpt.mkdir()
   (ckpt/"trainer_state.json").write_text('{"global_step":500}',encoding="utf-8")
   self.assertEqual(latest_checkpoint(directory),ckpt)

 def test_unreviewed_sandbox_data_is_not_training_input(self):
  from dataset import validate_jsonl
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/"unsafe.jsonl"
   row=record(1,"synthetic")
   row.update({"reviewed":False,"consent":False,"source":"synthetic-sandbox"})
   write(path,[row])
   with self.assertRaises(ValueError):
    validate_jsonl(path,min_rows=1)


if __name__=="__main__":
 unittest.main()
