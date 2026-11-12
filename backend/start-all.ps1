$ErrorActionPreference = 'Stop'

$backendDir = $PSScriptRoot
$uiDir = Join-Path (Split-Path -Parent $backendDir) 'Ui-PayPal-AI-Hackathon_November-12-2026'
$uiEnvExample = Join-Path $uiDir '.env.example'
$uiEnvLocal = Join-Path $uiDir '.env.local'

if (-not (Test-Path (Join-Path $backendDir 'run.sh'))) {
    throw "Backend startup script not found in $backendDir"
}
if (-not (Test-Path (Join-Path $uiDir 'package.json'))) {
    throw "UI project not found at $uiDir"
}

if (-not (Test-Path $uiEnvLocal) -and (Test-Path $uiEnvExample)) {
    Copy-Item $uiEnvExample $uiEnvLocal
    Write-Host 'Created UI .env.local from .env.example.'
}

$wslBackendDir = (& wsl.exe -d Ubuntu --exec wslpath -a -u $backendDir).Trim()
if ($LASTEXITCODE -ne 0 -or -not $wslBackendDir) {
    throw 'Could not resolve the backend directory inside Ubuntu WSL.'
}

Write-Host 'Starting backend in Ubuntu WSL and UI in a separate console...'
Write-Host 'Backend: http://localhost:3001'
Write-Host 'UI:      http://localhost:3000'

$backendCommand = "wsl.exe -d Ubuntu --cd `"$wslBackendDir`" --exec bash ./run.sh"
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $backendCommand) -WorkingDirectory $backendDir
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', 'npm run dev') -WorkingDirectory $uiDir