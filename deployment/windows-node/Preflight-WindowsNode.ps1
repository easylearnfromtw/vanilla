# Read-only hardware and inference readiness probe for a future Detroit Windows node.
# Does not install software, change power/firewall settings, expose ports or send telemetry.
[CmdletBinding()]
param([string]$OutputPath = "")
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Try-Cim([string]$ClassName) {
    try { return Get-CimInstance -ClassName $ClassName -ErrorAction Stop }
    catch { return $null }
}
function Round-GB([double]$Bytes) { return [math]::Round($Bytes / 1GB, 1) }
function Safe-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

$computer = Try-Cim 'Win32_ComputerSystem'
$os = Try-Cim 'Win32_OperatingSystem'
$cpu = @(Try-Cim 'Win32_Processor' | Where-Object { $null -ne $_ } | Select-Object -First 1)
$video = @(Try-Cim 'Win32_VideoController' | Where-Object { $null -ne $_ })
$batteries = @(Try-Cim 'Win32_Battery' | Where-Object { $null -ne $_ })
$ramGB = if ($null -ne $computer) { Round-GB ([double]$computer.TotalPhysicalMemory) } else { $null }
$freeGB = if ($null -ne $os) { Round-GB ([double]$os.FreePhysicalMemory * 1KB) } else { $null }
$gpu = @()
$gpu += @($video | ForEach-Object { [ordered]@{ name = [string]$_.Name; memoryGB = $null } })
# Win32_VideoController.AdapterRAM can overflow/truncate. Use nvidia-smi for VRAM.
$nvidia = @()
if (Safe-Command 'nvidia-smi') {
    try {
        $lines = @( & nvidia-smi --query-gpu=name,memory.total,memory.free,temperature.gpu --format=csv,noheader,nounits 2>$null )
        foreach ($line in $lines) {
            $parts = @([string]$line -split ',\s*')
            if ($parts.Count -ge 4 -and $parts[1] -match '^\d+(\.\d+)?$') {
                $nvidia += [ordered]@{
                    name = $parts[0].Trim()
                    totalVramGB = [math]::Round(([double]$parts[1] / 1024), 1)
                    freeVramGB = if ($parts[2] -match '^\d+(\.\d+)?$') { [math]::Round(([double]$parts[2] / 1024), 1) } else { $null }
                    temperatureC = if ($parts[3] -match '^\d+$') { [int]$parts[3] } else { $null }
                }
            }
        }
    } catch { }
}
$ollama = [ordered]@{ available = $false; modelNames = @(); error = "Ollama 尚未啟動或無法從本機連線" }
try {
    $tags = Invoke-RestMethod -Method Get -TimeoutSec 5 -Uri 'http://127.0.0.1:11434/api/tags'
    $names = @($tags.models | ForEach-Object { [string]$_.name } | Where-Object { $_ -ne '' })
    $ollama.available = $true
    $ollama.modelNames = $names
    $ollama.error = $null
} catch { }
$tailscale = [ordered]@{ installed = (Safe-Command 'tailscale'); connected = $false }
if ($tailscale.installed) {
    try {
        $statusText = & tailscale status --json 2>$null | Out-String
        $status = $statusText | ConvertFrom-Json
        $tailscale.connected = ($status.BackendState -eq 'Running')
    } catch { }
}
$warnings = @()
if ($null -ne $ramGB -and $ramGB -lt 32) { $warnings += '30B Q4 不建議直接在低於 32GB RAM 的電腦上當作主要模型；請先測試並預留 OS/KV cache 空間。' }
if (@($nvidia).Count -eq 0) { $warnings += '無法取得 NVIDIA GPU 的實際可用 VRAM；請確認驅動與 nvidia-smi。' }
if (@($nvidia).Count -gt 0 -and [double]$nvidia[0].totalVramGB -lt 12) { $warnings += 'GPU VRAM 不足以單獨載入一般 30B Q4；可嘗試 CPU/RAM 卸載，但速度取決於 CPU 和記憶體。' }
if (-not $ollama.available) { $warnings += '尚未偵測到本機 Ollama；不代表 Windows 已可接入 Vanilla。' }
if (-not $tailscale.connected) { $warnings += 'Tailscale 尚未連線；請勿開放 Ollama 11434 到公網。' }
if ($batteries.Count -gt 0) { $warnings += '筆電建議接上變壓器、保持散熱與醒著；不要因部署而關閉過熱保護。' }
$result = [ordered]@{
    schemaVersion = 1
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    platform = 'windows'
    osCaption = if ($null -ne $os) { [string]$os.Caption } else { 'unknown' }
    cpuName = if ($cpu.Count -gt 0) { [string]$cpu[0].Name } else { 'unknown' }
    ramTotalGB = $ramGB
    ramFreeGB = $freeGB
    displayAdapters = $gpu
    nvidiaGpus = $nvidia
    laptopBatteryDetected = ($batteries.Count -gt 0)
    ollama = $ollama
    tailscale = $tailscale
    warnings = $warnings
}
$json = $result | ConvertTo-Json -Depth 8
if ($OutputPath) {
    # Local file only; never contains account tokens or private conversation history.
    $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $json | Set-Content -LiteralPath $full -Encoding UTF8
    Write-Host "Windows 節點檢查報告已儲存：$full"
} else {
    Write-Output $json
}
