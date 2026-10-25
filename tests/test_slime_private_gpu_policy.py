"""SLIME GPU security policy: no long-lived GPU private data in public GitHub repo."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
TEMPLATE=(ROOT/"deployment"/"slime"/"private-gpu-qlora.workflow.yml").read_text(encoding="utf8")
PUBLIC=(ROOT/".github"/"workflows"/"slime-real-gpu-qlora.yml").read_text(encoding="utf8")
BOOKS=(ROOT/".github"/"workflows"/"atuber-approved-cuda-qlora.yml").read_text(encoding="utf8")
CPU=(ROOT/".github"/"workflows"/"atuber-real-cpu-lora.yml").read_text(encoding="utf8")
DOC=(ROOT/"docs"/"SLIME_PRIVATE_GPU_REAL_TRAINING.md").read_text(encoding="utf8")

class PrivateGpuPolicyTests(unittest.TestCase):
 def test_public_repo_selfhosted_gpu_is_disabled_by_explicit_visibility_gate(self):
  self.assertIn("github.event.repository.private && github.ref == 'refs/heads/main'",PUBLIC)
  self.assertIn("github.event.repository.private && github.ref == 'refs/heads/main'",BOOKS)
  self.assertIn("workflow_dispatch:",PUBLIC)
  self.assertNotIn("  pull_request:",PUBLIC)
  self.assertNotIn("  push:",PUBLIC)
 def test_private_repo_workflow_needs_reviewed_owner_main_and_true_nvidia(self):
  self.assertIn("github.event.repository.private && github.ref == 'refs/heads/main'",TEMPLATE)
  self.assertIn("runs-on: [self-hosted, linux, x64, slime-private-gpu]",TEMPLATE)
  self.assertIn("environment: slime-gpu-training",TEMPLATE)
  self.assertIn("nvidia-smi",TEMPLATE)
  self.assertIn("torch.cuda.is_available()",TEMPLATE)
  self.assertIn("SLIME_GPU_DATASET_PATH",TEMPLATE)
  self.assertIn("VANILLA_APPROVED_SOURCE_SHA",TEMPLATE)
  self.assertIn("refs/heads/main",TEMPLATE)
  self.assertIn("40",TEMPLATE)
  self.assertIn("git -C",TEMPLATE)
  self.assertIn("https://github.com/easylearnfromtw/vanilla.git",TEMPLATE)
 def test_data_and_adapter_only_stored_under_owner_private_root(self):
  self.assertIn("/srv/slime-private/datasets/",TEMPLATE)
  self.assertIn("/srv/slime-private/outputs/",TEMPLATE)
  self.assertIn("training-provenance.json",TEMPLATE)
  self.assertIn("adapter_model.safetensors",TEMPLATE)
  self.assertIn("adapter_sha256",TEMPLATE)
  self.assertIn("actual_optimizer_steps",TEMPLATE)
  self.assertNotIn("actions/upload-artifact",TEMPLATE)
  self.assertNotIn("git push",TEMPLATE)
  self.assertNotIn("curl -X POST",TEMPLATE)
  self.assertIn("--allow-download",TEMPLATE)
  self.assertIn("default: false",TEMPLATE)
 def test_trained_model_is_not_automatically_merged_or_deployed(self):
  self.assertIn('report["merged_or_ollama_model_registered"] is False',TEMPLATE)
  self.assertNotIn("ollama create",TEMPLATE)
  self.assertNotIn("gh release",TEMPLATE)
  self.assertIn("GitHub Team",DOC)
  self.assertIn("GitHub Secure Use",DOC)
  self.assertIn("沒有",DOC)
 def test_cpu_branch_trains_four_real_qwen_lora_steps_not_a_fake_gpu(self):
  self.assertIn("--steps 4 --sequence-length 64 --train",CPU)
  self.assertIn('report["trained"] is True and report["actual_optimizer_steps"] == 4',CPU)
  self.assertIn("torch==2.6.0+cpu",CPU)
  self.assertIn("cuda_used",CPU)
  self.assertNotIn("nvidia-smi",CPU)

if __name__=="__main__":
 unittest.main()
