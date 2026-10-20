# Safe-by-default preview. Explicit -Apply required to expose localhost Ollama
# exclusively inside the authorized Tailscale tailnet (NOT the public internet).
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    $response = Invoke-RestMethod -Method Get -TimeoutSec 5 -Uri 'http://127.0.0.1:11434/api/tags'
    if ($null -eq $response.models) { throw 'Ollama /api/tags 未回傳模型清單' }
} catch {
    throw '無法連線到本機 Ollama（127.0.0.1:11434）；先在 Windows 安裝並啟動 Ollama。'
}
if (-not (Get-Command 'tailscale' -ErrorAction SilentlyContinue)) {
    throw '找不到 Tailscale。先安裝、登入並設定只有你授權裝置可連線的 tailnet ACL。'
}
try {
    $state = (& tailscale status --json | Out-String | ConvertFrom-Json).BackendState
    if ($state -ne 'Running') { throw 'Tailscale 尚未連線' }
} catch { throw 'Tailscale 尚未就緒；不會對外開放 Ollama。' }
Write-Host '預計設定：tailscale serve --bg 11434'
Write-Host '僅供同一 tailnet 且被 ACL 允許的裝置使用；請勿使用 Funnel、路由器 port forwarding 或 OLLAMA_HOST=0.0.0.0。'
Write-Host '注意：Ollama API 本身沒有依使用者驗證。請先檢查 tailnet ACL，限制只有自己的裝置能存取。'
if (-not $Apply) {
    Write-Host '預覽模式：尚未變更任何設定。審核 ACL 後，執行 .\Connect-OllamaTailnet.ps1 -Apply'
    return
}
& tailscale serve --bg 11434
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Serve 設定失敗，未確認連線就緒。' }
& tailscale serve status
if ($LASTEXITCODE -ne 0) { throw 'Serve 狀態無法確認，請手動檢查。' }
Write-Host '設定完成：將 Serve 列出的 HTTPS URL 放進 Vanilla → 系統設定 → Ollama，並執行測試連線。'
Write-Host '若要停止共享，請先檢查 tailscale serve status，再手動執行 tailscale serve off（會停止本機現有 Serve）。'
