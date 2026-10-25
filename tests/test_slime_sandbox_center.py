"""SLIME Owner sandbox tests: fixed argv, explicit consent, no remote execution."""
import json,os,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import MagicMock,patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services"/"slime"))
import sandbox_center as s

class SlimeSandboxTests(unittest.TestCase):
 def fake(self):
  tmp=tempfile.TemporaryDirectory()
  self.addCleanup(tmp.cleanup)
  root=Path(tmp.name)/"repo"
  root.mkdir()
  for task in s.TASKS:
   f=root/task["script"]
   f.parent.mkdir(parents=True,exist_ok=True)
   f.write_text("# test only",encoding="utf8")
  loader=root/"tests"/"ts-extension-loader.mjs"
  loader.parent.mkdir(parents=True,exist_ok=True)
  loader.write_text("// fake",encoding="utf8")
  return root,Path(tmp.name)
 def test_registered_all_major_sandbox_families_and_does_not_claim_qwen_updates(self):
  root,tmp=self.fake()
  report=s.catalog(root)
  self.assertGreaterEqual(len(report["tasks"]),17)
  self.assertEqual(report["available_count"],len(s.TASKS))
  self.assertEqual({"detroit","gpu","library","scholar","shopping","language"},
                   {row["group"] for row in report["tasks"]})
  self.assertTrue(report["no_automatic_training_or_download"])
  self.assertTrue(all(not row["bundled_weight_file"] for row in report["tasks"]))
  self.assertFalse(list(tmp.rglob("*.safetensors")))
 def test_unknown_scripts_are_listed_but_not_executable(self):
  root,_=self.fake()
  unknown=root/"training"/"mystery_train.py";unknown.write_text("print('no')")
  result=s.catalog(root)
  self.assertTrue(any(x["script"]=="training/mystery_train.py" for x in
                      result["unregistered_sandbox_scripts"]))
  with self.assertRaisesRegex(ValueError,"UNREGISTERED"):
   s.compile_plan(root,"mystery_train")
 def test_plan_never_starts_subprocess_and_large_is_labeled(self):
  root,tmp=self.fake()
  with patch.object(s.subprocess,"Popen") as proc:
   p=s.compile_plan(root,"detroit-five-d-10m",output_root=tmp/"out",
                    node_exe="/fake/node")
   self.assertIn("--steps",p["argv"])
   self.assertIn("10000000",p["argv"])
   self.assertTrue(p["requires_heavy_opt_in"])
   self.assertFalse(p["actual_execution_started"])
   self.assertEqual(p["actual_qwen_llm_optimizer_steps"],0)
   proc.assert_not_called()
 def test_inputs_and_ids_rejected_before_launch(self):
  root,tmp=self.fake()
  with self.assertRaisesRegex(ValueError,"SOURCE_FILE_REQUIRED"):
   s.compile_plan(root,"octuber-shopper-1m")
  inp=tmp/"actual.csv";inp.write_text("HEADER,VALUE",encoding="utf8")
  q=s.compile_plan(root,"octuber-shopper-1m",input_path=inp)
  self.assertEqual(q["argv"][q["argv"].index("--episodes")+1],"1000000")
  with self.assertRaisesRegex(ValueError,"ARXIV_IDS_REQUIRED"):
   s.compile_plan(root,"xiahai-scholar-pilot",arxiv_ids="cat /etc/password")
  with self.assertRaisesRegex(ValueError,"QLORA_SIZE_INVALID"):
   s.compile_plan(root,"atuber-local-qlora-gate",model_size="../../a")
 def test_heavy_network_friend_permissions_fail_closed(self):
  root,tmp=self.fake()
  with patch.object(s.subprocess,"Popen") as pop:
   with self.assertRaises(PermissionError):
    s.launch(root,"octuber-core-100k",owner=False,confirmed=True)
   with self.assertRaisesRegex(PermissionError,"HEAVY"):
    s.launch(root,"octuber-core-100k",owner=True,confirmed=True)
   with self.assertRaisesRegex(PermissionError,"NETWORK"):
    s.launch(root,"liuan-gutenberg-pilot",owner=True,confirmed=True)
   pop.assert_not_called()
 def test_confirmed_small_lab_launch_is_unverified_and_privacy_preserving(self):
  root,tmp=self.fake()
  with patch.object(s.subprocess,"Popen",return_value=MagicMock(pid=4300)) as proc,\
       patch.dict(os.environ,{"SLIME_NODE_TOKEN":"SECRET","VANILLA_API_KEY":"KEY"}):
   receipt=s.launch(root,"octuber-gpu-capacity",owner=True,confirmed=True,
                    python_exe=sys.executable,output_root=tmp/"out")
   self.assertEqual(receipt["status"],"started-unverified")
   self.assertEqual(receipt["pid"],4300)
   self.assertTrue(receipt["no_claim_of_completion"])
   self.assertEqual(receipt["actual_qwen_llm_optimizer_steps"],0)
   self.assertTrue(Path(receipt["log_path"]).is_file())
   self.assertIn("task_id",json.loads((Path(receipt["report_directory"])/"plan.json").read_text()))
   self.assertNotIn("SLIME_NODE_TOKEN",proc.call_args.kwargs["env"])
   self.assertNotIn("VANILLA_API_KEY",proc.call_args.kwargs["env"])
   self.assertIs(proc.call_args.kwargs["shell"],False)
   self.assertEqual(proc.call_args.kwargs["stdin"],s.subprocess.DEVNULL)
 def test_explicit_network_approval_not_equivalent_to_source_license(self):
  root,tmp=self.fake()
  with patch.object(s.subprocess,"Popen",return_value=MagicMock(pid=431)) as proc:
   r=s.launch(root,"liuan-gutenberg-pilot",owner=True,confirmed=True,
          network_approved=True,python_exe=sys.executable,output_root=tmp/"out")
   self.assertEqual(r["status"],"started-unverified")
   self.assertIn("--execute",proc.call_args.args[0])
 def test_packaging_and_official_owner_entry_present(self):
  desktop=(ROOT/"services"/"weiguo"/"slime_desktop.py").read_text(encoding="utf8")
  owner_gui=(ROOT/"services"/"slime"/"desktop.py").read_text(encoding="utf8")
  toolbox=(ROOT/"services"/"slime"/"unified_tools_window.py").read_text(encoding="utf8")
  self.assertIn('"--tools" in flags',desktop)
  self.assertIn('_role() != "owner"',desktop)
  self.assertIn("open_sandbox_window(self, owner=True)",owner_gui)
  self.assertIn("open_local_model_window",toolbox)
  self.assertIn("open_sandbox_window",toolbox)
 def test_tool_flag_does_not_request_node_pairing_or_remote_api(self):
  sys.path.insert(0,str(ROOT/"services"/"weiguo"))
  import slime_desktop as main
  stub=types.ModuleType("unified_tools_window")
  stub.run_owner_tools=lambda:0
  with patch.object(main,"_role",return_value="owner"),\
       patch.object(main,"_load",side_effect=AssertionError("MUST_NOT_PAIR")) as pair,\
       patch.dict(sys.modules,{"unified_tools_window":stub}),\
       patch.object(sys,"argv",["Slime-Owner.exe","--tools"]):
   self.assertEqual(main.main(),0)
   pair.assert_not_called()
  with patch.object(main,"_role",return_value="friend"),\
       patch.dict(sys.modules,{"unified_tools_window":stub}),\
       patch.object(sys,"argv",["Slime-Friend.exe","--tools"]):
   self.assertEqual(main.main(),2)

if __name__=="__main__":
 unittest.main()
