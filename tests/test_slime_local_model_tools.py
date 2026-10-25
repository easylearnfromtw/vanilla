"""Slime local-only model tools: no hidden downloads, remote training or fake weights."""
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services"/"slime"))
import local_model_tools as tools


class FakeResponse:
 def __init__(self,body):self.body=body
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def read(self,_):return json.dumps(self.body).encode()


class SlimeLocalModels(unittest.TestCase):
 def test_exact_seven_sizes_and_automatic_download_never_happens(self):
  self.assertEqual([x[0] for x in tools.MODEL_SIZES],
   ["0.6b","1.7b","4b","8b","14b","30b","32b"])
  with patch.object(tools.LOCAL_HTTP,"open",return_value=FakeResponse({
      "models":[{"name":"qwen3:1.7b"},{"name":"qwen3:8b"},{"name":"untrusted/bad"}]
  })) as http:
   result=tools.local_inventory()
   self.assertTrue(result["ollama_running"])
   self.assertEqual(sum(x["installed"] for x in result["models"]),2)
   self.assertTrue(all(not x["lora_trained"] for x in result["models"]))
   self.assertTrue(all(not x["inference_verified"] for x in result["models"]))
   req=http.call_args.args[0]
   self.assertEqual(req.full_url,"http://127.0.0.1:11434/api/tags")
   self.assertEqual(req.method,"GET")
  with self.assertRaisesRegex(ValueError,"ROUTE_NOT_ALLOWED"):
   tools._ollama_api("/api/pull")
 def test_no_ollama_is_safe_no_config_or_network_calls(self):
  with patch.object(tools.LOCAL_HTTP,"open",side_effect=OSError("not running")):
   report=tools.local_inventory()
   self.assertFalse(report["ollama_running"])
   self.assertTrue(all(not x["installed"] for x in report["models"]))
 def test_inference_only_succeeds_with_actual_completed_message(self):
  responses=[
   FakeResponse({"models":[{"name":"qwen3:1.7b"}]}),
   FakeResponse({"done":True,"message":{"content":"測試完成"}})
  ]
  with patch.object(tools.LOCAL_HTTP,"open",side_effect=responses) as http:
   verified=tools.verify_local_inference("1.7b")
   self.assertTrue(verified["inference_verified"])
   req=http.call_args.args[0]
   self.assertEqual(req.full_url,"http://127.0.0.1:11434/api/chat")
   body=json.loads(req.data)
   self.assertEqual(body["model"],"qwen3:1.7b")
   self.assertIs(body["stream"],False)
   self.assertEqual(body["options"]["num_predict"],32)
  responses=[
   FakeResponse({"models":[{"name":"qwen3:1.7b"}]}),
   FakeResponse({"done":False,"message":{"content":"測試"}})
  ]
  with patch.object(tools.LOCAL_HTTP,"open",side_effect=responses):
   self.assertFalse(tools.verify_local_inference("1.7b")["inference_verified"])
  with self.assertRaisesRegex(ValueError,"UNKNOWN_MODEL"):
   tools.verify_local_inference("900b")
 def test_friend_and_unconfirmed_training_cannot_touch_local_subprocess(self):
  with patch.object(tools,"audit_training") as audit,patch.object(tools.subprocess,"Popen") as pop:
   for owner,confirmed in [(False,True),(True,False),(False,False)]:
    with self.assertRaises(PermissionError):
     tools.launch_owner_training("x","y","1.7b","a"*40,
       owner=owner,confirmed=confirmed)
   audit.assert_not_called()
   pop.assert_not_called()
 def test_invalid_revision_rejected_before_any_spawn(self):
  with tempfile.TemporaryDirectory() as tmp:
   repo=Path(tmp)/"repo";repo.mkdir()
   source=repo/"training"/"atuber";source.mkdir(parents=True)
   (source/"multisize_train.py").write_text("# test-only")
   (source/"actual_gpu_execution_gate.py").write_text("# test-only")
   data=Path(tmp)/"approved.jsonl";data.write_text("{}")
   with patch.object(tools.subprocess,"Popen") as proc:
    with self.assertRaisesRegex(ValueError,"COMMIT_REQUIRED"):
     tools.launch_owner_training(repo,data,"1.7b","latest",
       owner=True,confirmed=True)
    proc.assert_not_called()
 def test_preflight_blocks_running_when_hardware_unavailable(self):
  with tempfile.TemporaryDirectory() as tmp:
   repo=Path(tmp)/"repo";repo.mkdir()
   source=repo/"training"/"atuber";source.mkdir(parents=True)
   (source/"multisize_train.py").write_text("# test-only")
   (source/"actual_gpu_execution_gate.py").write_text("# test-only")
   data=Path(tmp)/"approved.jsonl";data.write_text("{}")
   status={"model_size":"1.7b","status":"blocked-untrained",
       "actual_qwen_optimizer_steps":0}
   proc=MagicMock(returncode=0,stdout=json.dumps(status))
   with patch.object(tools.subprocess,"run",return_value=proc),\
        patch.object(tools.subprocess,"Popen") as pop:
    with self.assertRaisesRegex(RuntimeError,"TRAINING_BLOCKED"):
     tools.launch_owner_training(repo,data,"1.7b","a"*40,
       owner=True,confirmed=True,python_exe=sys.executable)
    pop.assert_not_called()
 def test_owner_can_explicitly_spawn_only_checked_out_local_trainer_not_shell(self):
  with tempfile.TemporaryDirectory() as tmp:
   repo=Path(tmp)/"repo";repo.mkdir()
   source=repo/"training"/"atuber";source.mkdir(parents=True)
   (source/"multisize_train.py").write_text("# test-only")
   (source/"actual_gpu_execution_gate.py").write_text("# test-only")
   data=Path(tmp)/"approved.jsonl";data.write_text("{}")
   status={"model_size":"1.7b","status":"preflight-eligible-untrained",
           "actual_qwen_optimizer_steps":0}
   fake_proc=MagicMock(pid=314159)
   with patch.object(tools.subprocess,"run",return_value=MagicMock(
      returncode=0,stdout=json.dumps(status))) as audit,\
      patch.object(tools.subprocess,"Popen",return_value=fake_proc) as proc,\
      patch.dict(os.environ,{"SLIME_NODE_TOKEN":"PRIVATE_NODE_TOKEN"},clear=False):
    started=tools.launch_owner_training(repo,data,"1.7b","b"*40,
      owner=True,confirmed=True,python_exe=sys.executable,
      output_root=Path(tmp)/"output")
    self.assertEqual(started["status"],"started-unverified")
    self.assertFalse(started["actual_model_weights_verified"])
    self.assertEqual(started["pid"],314159)
    self.assertTrue(Path(started["log_path"]).is_file())
    called=proc.call_args
    args=called.args[0]
    self.assertEqual(args[0],sys.executable)
    self.assertEqual(args[1],str(source/"multisize_train.py"))
    self.assertNotIn("shell",called.kwargs)
    self.assertNotIn("--allow-download",args)
    self.assertNotIn("SLIME_NODE_TOKEN",called.kwargs["env"])
    self.assertEqual(called.kwargs["stdin"],tools.subprocess.DEVNULL)
    self.assertEqual(Path(called.kwargs["cwd"]),repo)
 def test_slime_binary_ui_contains_owner_only_entry(self):
  code=(ROOT/"services"/"slime"/"desktop.py").read_text(encoding="utf8")
  window=(ROOT/"services"/"slime"/"local_model_window.py").read_text(encoding="utf8")
  self.assertIn('if ROLE == "owner":',code)
  self.assertIn("open_local_model_window(self, owner=True)",code)
  self.assertIn('if not owner:',window)
  self.assertIn("messagebox.askyesno",window)
  self.assertIn("launch_owner_training(",window)
  self.assertIn("實際生成測試",window)


if __name__=="__main__":
 unittest.main()
