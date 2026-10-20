# October 阿土伯 — Windows Ollama registration (configuration only)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw 'Ollama not found. Install Ollama first, then rerun this script.'
}
Write-Host 'Registering October (阿土伯) v0.3 ...'
ollama pull qwen3:4b
if ($LASTEXITCODE -ne 0) { throw 'Failed to pull qwen3:4b.' }
ollama create october:0.3 -f (Join-Path $root 'Modelfile')
if ($LASTEXITCODE -ne 0) { throw 'Failed to create October.' }
Write-Host 'Use: ollama run october:0.3'
Write-Host 'The separately trained policy component is only a simulated decision helper (node policy.mjs).'
Write-Host 'This step does not perform Qwen LoRA fine-tuning or enable privileged automation.'
