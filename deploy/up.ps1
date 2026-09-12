# Production deploy (PowerShell — local Docker test or VPS via SSH)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$envFile = if (Test-Path '.env.production') { '.env.production' } else { '.env.production.example' }
Write-Host "==> Building & starting production stack (env: $envFile)"

$profiles = @()
if ($env:CLOUDFLARE_TUNNEL_TOKEN) { $profiles += '--profile', 'tunnel' }
if ($env:ENABLE_SSL -eq 'true') { $profiles += '--profile', 'ssl' }

docker compose --env-file $envFile @profiles up -d --build

$port = if ($env:PUBLIC_HTTP_PORT) { $env:PUBLIC_HTTP_PORT } else { '8080' }
$base = if ($env:PUBLIC_APP_URL) { $env:PUBLIC_APP_URL.TrimEnd('/') } else { "http://127.0.0.1:$port" }

Write-Host '==> Waiting for health...'
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "$base/api/v1/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 3
}

if ($ok) { Write-Host "Healthy: $base/api/v1/health" }
else { Write-Warning 'Health check not ready — run: docker compose logs -f api nginx' }

Write-Host "Login: superadmin / Super@123"
