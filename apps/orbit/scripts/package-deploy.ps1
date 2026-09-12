# Assembles a complete, upload-ready deployment artifact in ./deploy
# Usage (from repo root):
#   npm run build            # produce .next/standalone (do this first)
#   npm run db:reset         # optional: pristine demo data in prisma/dev.db
#   powershell -File scripts/package-deploy.ps1 [-Zip]
#
# Output: ./deploy  (upload its CONTENTS to your host's application root)
#         ./orbit-deploy.zip  (if -Zip)

param([switch]$Zip)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$deploy = Join-Path $root "deploy"

if (-not (Test-Path "$root\.next\standalone\server.js")) {
  Write-Error "No .next/standalone/server.js - run 'npm run build' first."
}

Write-Host "1/5  Cleaning deploy/ ..."
if (Test-Path $deploy) { Remove-Item $deploy -Recurse -Force }
New-Item -ItemType Directory -Path $deploy | Out-Null

Write-Host "2/5  Copying standalone server plus bundled Prisma engines ..."
Copy-Item "$root\.next\standalone\*" $deploy -Recurse -Force

Write-Host "3/5  Copying .next/static and public (standalone omits these) ..."
New-Item -ItemType Directory -Path "$deploy\.next\static" -Force | Out-Null
Copy-Item "$root\.next\static\*" "$deploy\.next\static" -Recurse -Force
New-Item -ItemType Directory -Path "$deploy\public" -Force | Out-Null
if (Get-ChildItem "$root\public" -Force -ErrorAction SilentlyContinue) {
  Copy-Item "$root\public\*" "$deploy\public" -Recurse -Force
}

Write-Host "4/5  Copying seeded SQLite DB plus schema ..."
New-Item -ItemType Directory -Path "$deploy\prisma" -Force | Out-Null
Copy-Item "$root\prisma\dev.db" "$deploy\prisma\dev.db" -Force
Copy-Item "$root\prisma\schema.prisma" "$deploy\prisma\schema.prisma" -Force

Write-Host "5/5  Writing env template and run note ..."
$env_lines = @(
  '# Set these in your host Node.js app "Environment variables" UI (NOT a .env file -',
  '# the standalone server reads process env at runtime; it does not load .env).',
  'NODE_ENV=production',
  'PORT=3000',
  '# SQLite: the path MUST be ABSOLUTE in the standalone build (a relative path',
  '# resolves against the bundled schema in node_modules and fails). Example:',
  '#   DATABASE_URL=file:/home/YOURUSER/orbit/prisma/dev.db',
  'DATABASE_URL=file:/ABSOLUTE/PATH/TO/prisma/dev.db',
  'AUTH_SECRET=REPLACE-WITH-A-STRONG-48+CHAR-RANDOM-STRING',
  '',
  '# --- Optional pluggable integrations (app runs fine without them) ---',
  '# LLM_BASE_URL=https://api.groq.com/openai/v1',
  '# LLM_API_KEY=gsk_your_key',
  '# LLM_MODEL=llama-3.3-70b-versatile',
  '# OCR_MODEL=meta-llama/llama-4-scout-17b-16e-instruct',
  '# CRON_SECRET=set-a-random-string',
  '# GOOGLE_CLIENT_ID=          (SSO)',
  '# GOOGLE_CLIENT_SECRET=',
  '# RAZORPAY_KEY_ID=           (payments)',
  '# RAZORPAY_KEY_SECRET=',
  '# IRP_BASE_URL=              (GST e-invoicing)'
)
Set-Content -Path "$deploy\ENV.sample.txt" -Value $env_lines -Encoding utf8

$readme_lines = @(
  'ORBIT - deploy artifact',
  'Start command:  node server.js   (with the env vars from ENV.sample.txt set)',
  'Default port:   3000 (override with PORT)',
  'Demo login:     ceo@demo.orbit / orbit123',
  'For a CLEAN (no demo data) launch: delete prisma/dev.db on the host and let the',
  'first user create their org at /signup.',
  'Full runbook: LAUNCH.md and SHARED-HOSTING-SETUP.md in the repo.'
)
Set-Content -Path "$deploy\README-DEPLOY.txt" -Value $readme_lines -Encoding utf8

$mb = [math]::Round((Get-ChildItem $deploy -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host ("Done. deploy/ = " + $mb + " MB")

if ($Zip) {
  $zip = Join-Path $root "orbit-deploy.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path "$deploy\*" -DestinationPath $zip -Force
  $zmb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
  Write-Host ("Zipped: orbit-deploy.zip = " + $zmb + " MB")
}
