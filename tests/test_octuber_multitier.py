"""CPU-only regression tests. No weights, downloads, keys, or GPU are used."""
import json,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from multitier_plan import TIERS,config,verified_manifest,verify_resume,latest_checkpoint
class MultiTier(unittest.TestCase):
 def test_tiers(self):
  self.assertEqual(set(TIERS),{"0.6b","4b","14b","30b-moe","32b"})
  self.assertEqual(TIERS["4b"].alias,"OCTUBER FLATTERING")
  self.assertEqual(TIERS["14b"].alias,"OCTUBER MODEST")
  self.assertEqual(TIERS["30b-moe"].kind,"moe")
 def test_150k_steps_do_not_claim_actual_updates(self):
  v=config(tier="32b",steps=150000)
  self.assertEqual(v["expected_training_examples_seen_approximately"],1200000)
  self.assertFalse(v["real_model_training_completed"])
  self.assertTrue(v["cuda_training_required"])
 def test_short_run_intervals(self):
  v=config(tier="4b",steps=20,checkpoint_every=500,eval_every=2000)
  self.assertEqual(v["save_steps"],20)
  self.assertEqual(v["eval_steps"],20)
 def test_invalid(self):
  for tier in ["33b","incorrect","Qwen/Qwen3-4B"]:
   with self.assertRaises(ValueError):config(tier=tier)
  for steps in [0,15,150001]:
   with self.assertRaises(ValueError):config(tier="4b",steps=steps)
 def test_resume_binds_dataset_and_parameters(self):
  with tempfile.TemporaryDirectory() as tmp:
   file=Path(tmp)/"reviewed.jsonl";file.write_text("synthetic local fixture")
   manifest=verified_manifest(config(tier="0.6b",steps=20),file,rows=120,train_rows=100,holdout_rows=20)
   verify_resume(manifest,json.loads(json.dumps(manifest)))
   self.assertEqual(len(manifest["request_digest"]),64)
   with self.assertRaisesRegex(ValueError,"RESUME_CONFIG"):verify_resume(manifest,{**manifest,"tier":"14b"})
 def test_resume_does_not_use_unverified_checkpoint(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for i in [20,50,10]:(root/f"checkpoint-{i}").mkdir()
   for i in [10,20]:(root/f"checkpoint-{i}"/"trainer_state.json").write_text("{}")
   self.assertEqual(latest_checkpoint(root).name,"checkpoint-20")
 def test_dry_run_no_output(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/"weights"
   p=subprocess.run([sys.executable,str(ROOT/"training"/"atuber"/"multitier_train.py"),
     "--tier","14b","--steps","20","--output",str(path)],text=True,capture_output=True,check=True)
   self.assertEqual(json.loads(p.stdout)["mode"],"DRY_RUN_ONLY")
   self.assertFalse(path.exists())
 def test_training_without_approval_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/"weights"
   p=subprocess.run([sys.executable,str(ROOT/"training"/"atuber"/"multitier_train.py"),
     "--tier","4b","--steps","20","--train","--output",str(path)],text=True,capture_output=True)
   self.assertNotEqual(p.returncode,0)
   self.assertIn("approve-gpu-compute",p.stderr)
   self.assertFalse(path.exists())
if __name__=="__main__":unittest.main()
