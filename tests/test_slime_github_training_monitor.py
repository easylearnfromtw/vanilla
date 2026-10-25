"""Read-only GitHub LoRA training monitor security and evidence semantics."""
from __future__ import annotations
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch,MagicMock

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services"/"slime"))
import github_training_status as monitor


def record(i,name,conclusion="success",status="completed"):
 return {
  "name":name,"id":i,"status":status,"conclusion":conclusion,
  "created_at":"2026-10-25T07:30:40Z","head_sha":"a"*40,
  "html_url":"https://evil.example.com/redirect/to/sensitive",
 }

class FakeHTTPResponse:
 def __init__(self,value):
  self.value=json.dumps(value).encode()
  self.status=200
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def read(self,count):
  return self.value[:count]

class SlimeGitHubMonitorTests(unittest.TestCase):
 def test_actual_qwen_cpu_runs_are_not_confused_with_gpu_or_training_attestation(self):
  rows=[
   record(12345,"Atuber Real CPU LoRA Proof"),
   record(12346,"Atuber 100 Real Licensed Fulltext Training"),
   record(12347,"Atuber 1000 Real Licensed Fulltext Training",None,"in_progress"),
   record(12348,"SLIME Actual CPU Sandbox Training"),
   record(12349,"Hank AI Quality Gate"),
  ]
  data=monitor.normalize_runs({"workflow_runs":rows})
  self.assertEqual(data["total_displayed"],4)
  self.assertTrue(all(not x["adapter_verified"] for x in data["rows"]))
  self.assertTrue(all(x["true_cuda_optimizer_steps_verified"]==0 for x in data["rows"]))
  self.assertEqual([x for x in data["rows"] if x["kind"]=="sandbox-only-no-qwen"][0]["name"],
                   "SLIME Actual CPU Sandbox Training")
  self.assertTrue(all(x["url"].startswith("https://github.com/easylearnfromtw/vanilla/actions/runs/") for x in data["rows"]))
  self.assertFalse(data["verified_gpu_training_completed"])
  self.assertFalse(data["downloaded_weights"])
  self.assertFalse(data["controlled_private_gpu_repo_access"])
 def test_public_success_is_not_a_claim_of_real_optimizer_steps(self):
  data=monitor.normalize_runs({"workflow_runs":[
   record(321,"SLIME Real GPU Qwen3 QLoRA (Owner Approval)")
  ]})
  self.assertEqual(len(data["rows"]),1)
  entry=data["rows"][0]
  self.assertEqual(entry["kind"],"gpu-not-confirmed")
  self.assertEqual(entry["actual_optimizer_steps_verified"],None)
  self.assertFalse(entry["adapter_verified"])
  self.assertEqual(entry["true_cuda_optimizer_steps_verified"],0)
 def test_dismiss_invalid_payloads_bad_sha_names_and_duplicate_ids(self):
  entries=[
   record(23,"Atuber Real CPU LoRA Proof"),
   record(23,"Atuber Real CPU LoRA Proof"),
   {**record(44,"Atuber Real CPU LoRA Proof"),"head_sha":"trick"},
   {**record(45,"Atuber Real CPU LoRA Proof"),"name":["not-a-string"]},
   {**record(46,"Atuber Real CPU LoRA Proof"),"status":["completed"]},
   {**record(47,"Atuber Real CPU LoRA Proof"),"conclusion":["success"]},
   {**record(48,"Atuber Real CPU LoRA Proof"),"id":"48"},
  ]
  report=monitor.normalize_runs({"workflow_runs":entries})
  self.assertEqual(report["total_displayed"],1)
  self.assertEqual(report["rows"][0]["id"],23)
  with self.assertRaisesRegex(ValueError,"SCHEMA"):
   monitor.normalize_runs([])
 def test_fetch_uses_static_github_api_endpoint_no_tokens_no_download_no_dispatch(self):
  record_set={"workflow_runs":[record(999,"Atuber Real CPU LoRA Proof")]}
  with patch.object(monitor.HTTP,"open",return_value=FakeHTTPResponse(record_set)) as stub:
   report=monitor.get_public_training_runs()
   self.assertEqual(report["rows"][0]["id"],999)
   req=stub.call_args.args[0]
   self.assertEqual(req.full_url,monitor.API)
   self.assertEqual(req.get_method(),"GET")
   self.assertNotIn("authorization",str(req.headers).lower())
   self.assertEqual(stub.call_args.kwargs["timeout"],12)
  script=Path(monitor.__file__).read_text(encoding="utf8")
  self.assertNotIn("/dispatches",script)
  self.assertNotIn("/api/pull",script)
  self.assertNotIn("subprocess",script)
 def test_network_error_must_not_show_cached_or_invented_success(self):
  with patch.object(monitor.HTTP,"open",side_effect=OSError("offline")):
   report=monitor.get_public_training_runs()
  self.assertEqual(report["total_displayed"],0)
  self.assertEqual(report["rows"],[])
  self.assertIn("error",report)
  self.assertFalse(report["verified_gpu_training_completed"])
 def test_owner_ui_integration_only(self):
  root=ROOT/"services"/"slime"
  menu=(root/"unified_tools_window.py").read_text(encoding="utf8")
  window=(root/"github_training_window.py").read_text(encoding="utf8")
  self.assertIn("open_github_training_window(main,owner=True)",menu)
  self.assertIn('if not owner:',window)
  self.assertIn("webbrowser.open_new_tab(item",window)
  self.assertIn("沒有可由此畫面控制的 GPU Runner",window)

if __name__=="__main__":
 unittest.main()
