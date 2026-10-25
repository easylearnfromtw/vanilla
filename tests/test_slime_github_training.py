"""Audit GitHub CPU/GPU training authorization and receipts without faking CUDA."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
CPU=(ROOT/".github/workflows/slime-real-training.yml").read_text(encoding="utf8")
GPU=(ROOT/".github/workflows/slime-real-gpu-qlora.yml").read_text(encoding="utf8")

class TestSlimeTrainingOnGithub(unittest.TestCase):
 def test_cpu_updates_are_real_and_explicit_not_qwen(self):
  self.assertIn("--episodes 1000000",CPU)
  self.assertIn("--steps 1000",CPU)
  self.assertIn("--steps 20000",CPU)
  self.assertIn("policy[\"actual_optimizer_steps\"]==1000",CPU)
  self.assertIn('detroit["actualWeightUpdates"]==20000',CPU)
  self.assertIn("price_range_heldout_accuracy",CPU)
  self.assertIn("historical_government_data_not_current_quotes",CPU)
  self.assertIn("qwen_llm_optimizer_steps",CPU)
  self.assertIn("production_price_forecasting_92pct_proven",CPU)
  self.assertIn("actions/upload-artifact@v4",CPU)
  self.assertIn("runs-on: ubuntu-latest",CPU)
  self.assertNotIn("gpuCudaWeightTrainingSteps: 20000",CPU)
 def test_gpu_never_runs_on_cpu_or_pr_and_requires_real_runner(self):
  self.assertIn("workflow_dispatch:",GPU)
  self.assertNotIn("  pull_request:",GPU)
  self.assertNotIn("  push:",GPU)
  self.assertIn("runs-on: [self-hosted, linux, x64, slime-gpu]",GPU)
  self.assertIn("environment: slime-gpu-training",GPU)
  self.assertIn("nvidia-smi",GPU)
  self.assertIn("torch.cuda.is_available()",GPU)
  self.assertIn('GITHUB_REF" == "refs/heads/main"',GPU)
  self.assertIn("timeout-minutes: 90",GPU)
  self.assertIn("cancel-in-progress: false",GPU)
  self.assertIn("Only",GPU) if "Only" in GPU else self.assertIn("only",GPU)
 def test_gpu_data_approval_and_immutable_model_revision_are_mandatory(self):
  self.assertIn("SLIME_GPU_DATASET_PATH",GPU)
  self.assertIn("SLIME_APPROVED_LOCAL_DATASET",GPU)
  self.assertIn("PINNED_MODEL_SHA_REQUIRED",GPU)
  self.assertIn("--base-revision",GPU)
  self.assertIn("--validate-only",GPU)
  self.assertIn("--train",GPU)
  self.assertIn("16|32|64",GPU)
  self.assertIn("--allow-download",GPU)
  self.assertIn("DOWNLOAD_OK",GPU)
  self.assertIn("actual_optimizer_steps",GPU)
  self.assertIn("adapter_model.safetensors",GPU)
  self.assertIn("adapter_sha256",GPU)
 def test_never_publish_unreviewed_training_data_or_sensitive_adapter_artifacts(self):
  self.assertNotIn("actions/upload-artifact",GPU)
  self.assertNotIn("curl ",GPU)
  self.assertIn("No upload or production deployment",GPU)
  self.assertIn("local Owner-owned persistent folder",GPU)
  self.assertIn("ref",GPU)
 def test_github_standard_runners_are_not_misidentified_as_gpu(self):
  self.assertIn("gpu_cuda_training_steps",CPU)
  self.assertIn("qwen_llm_optimizer_steps",CPU)
  self.assertNotIn("nvidia-smi",CPU)
  self.assertIn("qwen_model_weights_changed",CPU)

if __name__=="__main__": unittest.main()
