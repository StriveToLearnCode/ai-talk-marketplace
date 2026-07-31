[CmdletBinding()]
param(
    [ValidateRange(1, 23)]
    [int]$IntervalHours = 6,
    [switch]$RunUpdateOnly,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "AI Talk Auto Update"
$InstallRoot = Join-Path $env:LOCALAPPDATA "AI Talk"
$InstalledScript = Join-Path $InstallRoot "update-ai-talk.ps1"
$CodexPathFile = Join-Path $InstallRoot "codex-path.txt"
$LogFile = Join-Path $InstallRoot "update.log"

function Resolve-CodexPath {
    if (Test-Path -LiteralPath $CodexPathFile) {
        $SavedPath = (Get-Content -LiteralPath $CodexPathFile -Raw).Trim()
        if ($SavedPath -and (Test-Path -LiteralPath $SavedPath)) {
            return $SavedPath
        }
    }
    $Command = Get-Command codex -ErrorAction SilentlyContinue
    if (-not $Command) {
        throw "Codex CLI is required before installing automatic updates."
    }
    return $Command.Source
}

function Invoke-CodexStep {
    param(
        [string]$CodexPath,
        [string[]]$Arguments
    )
    $Output = & $CodexPath @Arguments 2>&1
    $Output | Add-Content -LiteralPath $LogFile
    if ($LASTEXITCODE -ne 0) {
        throw "Codex command failed: $($Arguments -join ' ')"
    }
}

function Invoke-AiTalkUpdate {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    "[$(Get-Date -Format o)] Starting AI Talk update." | Add-Content -LiteralPath $LogFile
    $CodexPath = Resolve-CodexPath
    Invoke-CodexStep -CodexPath $CodexPath -Arguments @("plugin", "marketplace", "upgrade", "ai-talk-marketplace")
    Invoke-CodexStep -CodexPath $CodexPath -Arguments @("plugin", "add", "ai-talk@ai-talk-marketplace")
    "[$(Get-Date -Format o)] Update complete; the new version loads in the next Codex task." | Add-Content -LiteralPath $LogFile
}

if ($Uninstall) {
    & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
    if (Test-Path -LiteralPath $InstalledScript) {
        Remove-Item -LiteralPath $InstalledScript -Force
    }
    if (Test-Path -LiteralPath $CodexPathFile) {
        Remove-Item -LiteralPath $CodexPathFile -Force
    }
    Write-Output "Removed AI Talk automatic updates."
    exit 0
}

if ($RunUpdateOnly) {
    Invoke-AiTalkUpdate
    exit 0
}

$CodexPath = Resolve-CodexPath
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledScript -Force
Set-Content -LiteralPath $CodexPathFile -Value $CodexPath -NoNewline
$TaskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$InstalledScript`" -RunUpdateOnly"
& schtasks.exe /Create /TN $TaskName /SC HOURLY /MO $IntervalHours /TR $TaskCommand /F | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create the AI Talk scheduled task."
}
Invoke-AiTalkUpdate
Write-Output "Installed AI Talk automatic updates every $IntervalHours hours."
