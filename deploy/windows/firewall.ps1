# EITF HRMS: Windows Firewall rules for the server. Run as Administrator.
#   powershell -ExecutionPolicy Bypass -File deploy\windows\firewall.ps1          # show the plan only
#   powershell -ExecutionPolicy Bypass -File deploy\windows\firewall.ps1 -Apply   # create the rules
#   powershell -ExecutionPolicy Bypass -File deploy\windows\firewall.ps1 -Remove  # delete only these rules
#
# What it does:
#   * ALLOW inbound TCP 443 (HTTPS) and 80 (Let's Encrypt validation + redirect to HTTPS).
#   * BLOCK inbound to internal service ports (Postgres, Redis, Docker API, raw web/API ports).
#     Block rules win over allow rules in Windows Firewall, so these stay closed even if a
#     container is published by mistake.
# What it does NOT do (to avoid locking you out): it never changes RDP/SSH/WinRM rules, the
# firewall profiles or default policies. Restrict remote admin yourself (VPN only).
param([switch]$Apply, [switch]$Remove)
$ErrorActionPreference = 'Stop'
$group = 'EITF HRMS'
$allow = @(
  @{ Name = 'EITF HRMS - HTTPS 443 in'; Port = 443 },
  @{ Name = 'EITF HRMS - HTTP 80 in (redirect/ACME)'; Port = 80 }
)
$block = @(
  @{ Name = 'EITF HRMS - block PostgreSQL 5432'; Port = 5432 },
  @{ Name = 'EITF HRMS - block Redis 6379'; Port = 6379 },
  @{ Name = 'EITF HRMS - block Docker API 2375-2376'; Port = '2375-2376' },
  @{ Name = 'EITF HRMS - block raw web/API 3000-3001'; Port = '3000-3001' },
  @{ Name = 'EITF HRMS - block test ports 8080,8443,9080,18080,18443'; Port = @(8080, 8443, 9080, 18080, 18443) }
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (($Apply -or $Remove) -and -not $isAdmin) { throw 'Run this from an Administrator PowerShell.' }

if ($Remove) {
  Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host "Removed all rules in group '$group'."
  return
}

Write-Host "Plan (group '$group'):"
$allow | ForEach-Object { Write-Host ("  ALLOW in TCP {0,-22} {1}" -f $_.Port, $_.Name) }
$block | ForEach-Object { Write-Host ("  BLOCK in TCP {0,-22} {1}" -f ($_.Port -join ','), $_.Name) }
Write-Host '  (RDP / SSH / WinRM rules are left unchanged.)'
if (-not $Apply) { Write-Host "`nNothing changed. Re-run with -Apply to create these rules."; return }

Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
foreach ($r in $allow) {
  New-NetFirewallRule -DisplayName $r.Name -Group $group -Direction Inbound -Protocol TCP -LocalPort $r.Port -Action Allow -Profile Any | Out-Null
}
foreach ($r in $block) {
  New-NetFirewallRule -DisplayName $r.Name -Group $group -Direction Inbound -Protocol TCP -LocalPort $r.Port -Action Block -Profile Any | Out-Null
}
Get-NetFirewallRule -Group $group | Select-Object DisplayName, Action, Enabled | Format-Table -AutoSize
Write-Host 'Done. Undo with -Remove.'
