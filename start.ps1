$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $RootDir '.env'
$EnvExampleFile = Join-Path $RootDir '.env.example'

if (-not (Test-Path $EnvFile)) {
    Copy-Item $EnvExampleFile $EnvFile
    Write-Warning '.env not found. Created from .env.example. Please review values before production use.'
}

Set-Location $RootDir
if (Test-Path $EnvFile) {
    $llmProvider = 'ollama'
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^LLM_PROVIDER=(.*)$') {
            $llmProvider = $Matches[1].Trim().ToLowerInvariant()
        }
    }
    if ([string]::IsNullOrWhiteSpace($llmProvider)) {
        $llmProvider = 'ollama'
    }
    if ($llmProvider -eq 'ollama') {
        $env:COMPOSE_PROFILES = 'ollama'
    }
    else {
        Remove-Item Env:COMPOSE_PROFILES -ErrorAction SilentlyContinue
    }
}
docker compose up --build -d

Write-Host 'Waiting for backend health at http://localhost:8000/api/health ...'
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:8000/api/health' -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    }
    catch {
        # keep polling
    }
    Start-Sleep -Seconds 2
}

if (-not $healthy) {
    throw 'Backend did not become healthy within 30 seconds.'
}

$apiKey = ''
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^API_KEY=(.*)$') {
        $apiKey = $Matches[1]
    }
}

Write-Host 'Nexus is running at http://localhost:5173'
Write-Host "API_KEY: $apiKey"
