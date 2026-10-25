"""Owner-only training artifact inspections: actual file integrity != simulated counts."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services"/"slime"))
from training_evidence import inspect_local_lora,inspect_sandbox_report

class TrainingEvidenceTests(unittest.TestCase):
 def create_fake_file(self,root:Path,*,gpu=False,alter=False):
  # This is a deliberately synthetic test fixture, NOT real trained Qwen.
  root.mkdir(parents=True,exist_ok=True)
  adapter=root/"adapter";adapter.mkdir()
  config={"peft_type":"LORA","task_type":"CAUSAL_LM","r":2}
  (adapter/"adapter_config.json").write_text(json.dumps(config))
  header={"base_model.model.layers.0.self_attn.q_proj.lora_A.default.weight":{
    "dtype":"F32","shape":[1,300],"data_offsets":[0,1200]}}
  raw=json.dumps(header,separators=(",",":")).encode()
  weight=struct.pack("<Q",len(raw))+raw+b"\0"*1200
  file=adapter/"adapter_model.safetensors";file.write_bytes(weight)
  receipt={
   "model":"Qwen/Qwen3-0.6B",
   "actual_optimizer_steps":4,
   "adapter_sha256":hashlib.sha256(weight).hexdigest(),
   "weight_delta_verified":True,"cpu_only":True,"cuda_used":False,
   "trained":True,"independent_document_evaluation":False,
  }
  if gpu:
   receipt={
    "base_model":"Qwen/Qwen3-1.7B","model_size":"1.7b",
    "actual_optimizer_steps":32,"adapter_sha256":hashlib.sha256(weight).hexdigest(),
    "adapter_trained":True,"weights_created":True,
    "qwen_lora_adapter_updated":True,"base_revision":"a"*40,
    "train_loss":1.25,"eval_loss":1.31,
    "merged_or_ollama_model_registered":False
   }
  (root/"training-provenance.json").write_text(json.dumps(receipt))
  return file,receipt
 def test_cpu_adapter_file_integrity_reported_without_claiming_full_training(self):
  with tempfile.TemporaryDirectory() as tmp:
   file,_=self.create_fake_file(Path(tmp)/"cpu")
   result=inspect_local_lora(file.parent.parent)
   self.assertEqual(result["reported_optimizer_steps"],4)
   self.assertEqual(result["training_report_method"],"genuine-cpu-lora-reported")
   self.assertEqual(result["tensor_descriptors"],1)
   self.assertFalse(result["cuda_used_reported"])
   self.assertFalse(result["model_registered_or_deployed"])
   self.assertFalse(result["professional_factual_accuracy_established"])
   self.assertIn("not-independent-training-attestation",result["status"])
 def test_qlora_gpu_report_checks_pinned_base_eval_and_no_automatic_registration(self):
  with tempfile.TemporaryDirectory() as tmp:
   file,report=self.create_fake_file(Path(tmp)/"gpu",gpu=True)
   result=inspect_local_lora(file.parent.parent)
   self.assertTrue(result["cuda_used_reported"])
   self.assertEqual(result["reported_optimizer_steps"],32)
   self.assertFalse(result["model_registered_or_deployed"])
   report["base_revision"]="main"
   (file.parent.parent/"training-provenance.json").write_text(json.dumps(report))
   with self.assertRaisesRegex(ValueError,"BASE_REVISION"):
    inspect_local_lora(file.parent.parent)
 def test_no_forged_sha256_provenance(self):
  with tempfile.TemporaryDirectory() as tmp:
   f,_=self.create_fake_file(Path(tmp)/"cpu")
   f.write_bytes(f.read_bytes()+b"bad")
   with self.assertRaisesRegex(ValueError,"SHA256"):
    inspect_local_lora(f.parent.parent)
 def test_corrupted_or_empty_fake_checkpoint_is_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   f,_=self.create_fake_file(Path(tmp)/"cpu")
   f.write_bytes(b"x"*1200)
   with self.assertRaisesRegex(ValueError,"INVALID_HEADER_LENGTH"):
    inspect_local_lora(f.parent.parent)
 def test_training_step_claim_must_be_supported_with_known_provenance(self):
  with tempfile.TemporaryDirectory() as tmp:
   f,report=self.create_fake_file(Path(tmp)/"cpu")
   report["actual_optimizer_steps"]=0
   (f.parent.parent/"training-provenance.json").write_text(json.dumps(report))
   with self.assertRaisesRegex(ValueError,"NO_VALID_REAL_STEP"):
    inspect_local_lora(f.parent.parent)
 def test_shopper_million_does_not_turn_into_llm_million_steps(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/"sandbox.json"
   path.write_text(json.dumps({"type":"SIMULATED_HUMAN_SHOPPING_DECISIONS_NOT_MODEL_WEIGHT_TRAINING",
       "episodes":1000000,"model_optimizer_steps":0,"qwen_model_weights_changed":False}))
   proof=inspect_sandbox_report(path)
   self.assertEqual(proof["qwen_optimizer_steps"],0)
   self.assertEqual(proof["episodes"],1000000)
   self.assertEqual(proof["status"],"sandbox-receipt-not-llm")
 def test_untrusted_sandbox_receipt_cannot_forge_qwen_steps(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/"sandbox.json"
   path.write_text(json.dumps({"status":"verified-cpu-training-only",
      "simulated_shopper_decisions":1000000,"qwen_llm_optimizer_steps":999999}))
   with self.assertRaisesRegex(ValueError,"COUNTER_CONTRADICTS"):
    inspect_sandbox_report(path)
 def test_friend_does_not_gain_checkpoint_inspection_or_launch(self):
  ui=(ROOT/"services"/"slime"/"local_model_window.py").read_text(encoding="utf-8")
  self.assertIn('if not owner:',ui)
  self.assertIn("inspect_local_lora",ui)
  self.assertIn("inspect_sandbox_report",ui)
  self.assertIn("尚未獨立證明訓練來源",ui)

if __name__=="__main__":unittest.main()
