# October 阿土伯 — one-command local GPU model comparison.
# Safe default: check data and GPU status only. No model download or inference
# unless RunInference is explicitly supplied.
param(
  [switch]$RunInference,
  [switch]$Load4Bit,
  [switch]$AllowModelDownload,
  [string]$Adapter = "",
  [string]$Model = "Qwen/Qwen3-0.6B",
  [string]$Report = "artifacts/october-local-base-vs-lora.json"
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Push-Location $repo
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22+ required" }
  if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.11+ required" }
  if ($Model -ne "Qwen/Qwen3-0.6B") { throw "Only reviewed Qwen3-0.6B pilot model is permitted" }
  node training/october/quant-sft.mjs
  if ($LASTEXITCODE -ne 0) { throw "Numeric train/eval generation failed" }
  node training/october/quant-holdout-export.mjs
  if ($LASTEXITCODE -ne 0) { throw "Holdout export failed" }
  python training/october/gpu-preflight.py
  if ($LASTEXITCODE -ne 0) { throw "GPU preflight inspection error" }
  $common = @("training/october/adapter-evaluate.py",
    "--model", $Model)
  if ($Adapter -ne "") { $common += @("--adapter", $Adapter) }
  python @common --check-only
  if ($LASTEXITCODE -ne 0) { throw "Strict adapter/dataset provenance check failed" }
  if (-not $RunInference) {
    Write-Host "Offline data validation finished; no Qwen inference or training was performed."
    Write-Host "To evaluate a local adapter: -RunInference -Adapter adapters/october-qwen3-0.6b -Load4Bit"
    exit 0
  }
  if ($Adapter -eq "") { throw "RunInference requires -Adapter to an existing local PEFT directory" }
  python training/october/gpu-preflight.py --require-gpu
  if ($LASTEXITCODE -ne 0) { throw "CUDA GPU or required Python dependencies unavailable" }
  $flags = @("--run-inference", "--output", $Report)
  if ($AllowModelDownload) { $flags += "--allow-model-download" }
  if ($Load4Bit) { $flags += "--load-4bit" }
  python @common @flags
  if ($LASTEXITCODE -ne 0) { throw "Real base/adapter comparison failed; do not deploy" }
  Write-Host "Saved same-hardware comparison to $Report. No model deployment performed."
} finally {
  Pop-Location
}
