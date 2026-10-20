# October 阿土伯 — local GPU LoRA/QLoRA preparation for Qwen language weights.
# Default behavior is ONLY schema validation. GPU training must be explicitly enabled.
param(
  [switch]$RunTraining,
  [switch]$AcknowledgedModelLicense,
  [switch]$AllowModelDownload,
  [string]$Model = "Qwen/Qwen3-0.6B",
  [string]$Output = "adapters/october-qwen3-0.6b"
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Push-Location $repo
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22+ is required." }
  if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python training environment is required." }
  node training/agent_sandbox/integrated-dataset.mjs
  if ($LASTEXITCODE -ne 0) { throw "Dataset generation failed." }
  node training/agent_sandbox/to-noodles.mjs
  if ($LASTEXITCODE -ne 0) { throw "SFT export failed." }
  $train = "training/agent_sandbox/generated/integrated-noodles-sft-train.jsonl"
  $validation = "training/agent_sandbox/generated/integrated-noodles-sft-validation.jsonl"
  python training/noodles_train.py --mode sft --train $train --eval $validation --check-only
  if ($LASTEXITCODE -ne 0) { throw "SFT data validation failed." }
  if (-not $RunTraining) {
    Write-Host "Dataset validation passed. No Qwen weights have been trained."
    Write-Host "Install training/requirements-noodles.txt and training/requirements-qlora.txt in a CUDA-compatible Python environment."
    Write-Host "To train: .\\training\\october\\train-qwen-qlora.ps1 -RunTraining -AcknowledgedModelLicense -AllowModelDownload"
    exit 0
  }
  if (-not $AcknowledgedModelLicense) { throw "Training requires explicit -AcknowledgedModelLicense." }
  $params = @("training/noodles_train.py","--mode","sft","--train",$train,"--eval",$validation,
       "--model",$Model,"--output",$Output,"--qlora-4bit","--epochs","1","--max-length","512",
       "--ack-model-license","--run-training")
  if ($AllowModelDownload) { $params += "--allow-model-download" }
  python @params
  if ($LASTEXITCODE -ne 0) { throw "GPU LoRA/QLoRA run failed." }
  Write-Host "Adapter saved to $Output. Evaluate before deploying; this is not automatically installed in Ollama."
}
finally { Pop-Location }
