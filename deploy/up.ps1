# Production deploy (PowerShell)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '==> Building & starting production stack'
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

Write-Host '==> Waiting for health...'
$port = if ($env:PUBLIC_PORT) { $env:PUBLIC_PORT } else { '8080' }
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/v1/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 3
}

if (-not $ok) { Write-Warning 'Health check not ready yet — check: docker compose -f docker-compose.prod.yml logs' }
else { Write-Host 'Healthy.' }

Write-Host "Local production URL: http://127.0.0.1:$port"
Write-Host "Public tunnel: npx --yes localtunnel --port $port"
