# Explicit, user-consented Slime scheduled task. No firewall changes or elevation.
param(
  [ValidateSet("Owner","Friend")][string]$Role="Owner",
  [ValidateSet("Install","Remove","Status")][string]$Action="Install"
)
$ErrorActionPreference="Stop"
$taskName="Vanilla Slime $Role"
$exeName="Slime-$Role.exe"
$installed=Join-Path (Join-Path $env:LOCALAPPDATA "Vanilla\Slime\$Role") $exeName
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($Action -eq "Status"){
  if($task){ Write-Host "Installed: $taskName / $($task.State)" } else { Write-Host "Not installed" }
  exit 0
}
if($Action -eq "Remove"){
  if($task){ Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  Write-Host "Removed startup task. Local files and device owner consent remain under user control."
  exit 0
}
if($task){
  throw "Slime startup already installed. Remove the existing task before updating."
}
$source=Join-Path $PSScriptRoot $exeName
if(!(Test-Path -LiteralPath $source)){throw "Place $exeName beside this script."}
$roleLower=$Role.ToLowerInvariant()
$config=Join-Path $env:USERPROFILE ".vanilla\slime\$roleLower.json"
if(!(Test-Path -LiteralPath $config)){
  throw "Pair your device with Telegram code first; then enable startup."
}
Write-Host "Vanilla Slime will start on THIS USER'S next Windows sign-in."
Write-Host "The task is visible in Task Scheduler, runs only in the user account, and can be removed anytime."
Write-Host "It uses outbound HTTPS 443 and local Ollama, with no firewall exception or security bypass."
$consent=Read-Host "Explicitly enable user-logon startup? Type YES"
if($consent -cne "YES"){Write-Host "Cancelled";exit 0}
$destination=Split-Path -Parent $installed
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item -LiteralPath $source -Destination $installed -ErrorAction Stop
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$act=New-ScheduledTaskAction -Execute $installed -WorkingDirectory $destination
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$settings=New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName $taskName -Action $act -Trigger $trigger -Settings $settings -Description "Vanilla Slime opt-in compute node / $Role" -Force | Out-Null
Write-Host "Startup enabled. Check the user-visible task in Windows Task Scheduler."
