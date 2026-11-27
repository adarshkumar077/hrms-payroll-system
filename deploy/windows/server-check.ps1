# EITF HRMS: READ-ONLY readiness check for a Windows server. Changes nothing.
# Run in PowerShell (as Administrator gives the most complete answers):
#   powershell -ExecutionPolicy Bypass -File deploy\windows\server-check.ps1
# Paste the output back for review. It contains no passwords or keys.
$ErrorActionPreference = 'SilentlyContinue'
function Section($t) { Write-Host "`n=== $t ===" }
function Flag($level, $msg) { Write-Host ("[{0}] {1}" -f $level, $msg) }

Section 'Operating system'
$os = Get-CimInstance Win32_OperatingSystem
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
Write-Host ("{0} | version {1} | build {2}.{3} | edition {4}" -f $os.Caption, $cv.DisplayVersion, $cv.CurrentBuild, $cv.UBR, $cv.EditionID)
$build = [int]$cv.CurrentBuild
if ($os.Caption -match 'Windows 10') {
  Flag 'BLOCKER' 'Windows 10 reached end of support on 14 Oct 2025 (consumer ESU ended 13 Oct 2026). No security fixes unless a paid commercial ESU licence is active. Do not expose it to the internet; upgrade to Windows 11 Pro, Windows Server 2022/2025, or Ubuntu 24.04 LTS.'
} elseif ($os.Caption -match 'Windows 11' -or $os.Caption -match 'Server 20(22|25)') {
  Flag 'OK' 'Supported Windows release (keep it updated).'
} else { Flag 'CHECK' 'Confirm this OS still receives security updates.' }
$hotfix = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1
if ($hotfix) { Write-Host ("Last update installed: {0} on {1}" -f $hotfix.HotFixID, $hotfix.InstalledOn) }

Section 'Hardware'
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
Write-Host ("{0} {1} | {2} | {3} cores / {4} threads | RAM {5:N1} GB" -f $cs.Manufacturer, $cs.Model, $cpu.Name.Trim(), $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors, ($cs.TotalPhysicalMemory / 1GB))
if ($cs.PCSystemType -eq 2) { Flag 'WARN' 'This is a laptop/mobile system: not ideal for 24/7 service.' }
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  $pct = [math]::Round(100 * $_.FreeSpace / $_.Size)
  Write-Host ("Disk {0} {1:N0} GB total, {2:N0} GB free ({3}%)" -f $_.DeviceID, ($_.Size / 1GB), ($_.FreeSpace / 1GB), $pct)
  if ($pct -lt 20) { Flag 'WARN' "Less than 20% free on $($_.DeviceID)" }
}
$bl = Get-BitLockerVolume -MountPoint $env:SystemDrive
if ($bl) { Write-Host ("BitLocker on {0}: {1}" -f $env:SystemDrive, $bl.ProtectionStatus) } else { Flag 'CHECK' 'BitLocker status unknown (run as Administrator) - disk encryption is recommended for payroll data.' }

Section 'Network'
Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object {
  $dhcp = (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4).Dhcp
  Write-Host ("{0}: {1} gateway {2} DHCP={3}" -f $_.InterfaceAlias, $_.IPv4Address.IPAddress, $_.IPv4DefaultGateway.NextHop, $dhcp)
  if ($_.InterfaceAlias -match 'Wi-?Fi|Wireless') { Flag 'WARN' 'Server is on Wi-Fi; use wired Ethernet.' }
}
try { $pub = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10); Write-Host "Public IP seen from the internet: $pub" } catch { Flag 'CHECK' 'Could not determine public IP.' }
Write-Host 'Compare it with the WAN IP on your router status page. Different = CGNAT (port forwarding will not work).'

Section 'Power / restart behaviour'
$plan = (powercfg /getactivescheme) -join ' '
Write-Host $plan
$sleep = (powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE) -match 'Current AC Power Setting Index: 0x00000000'
if ($sleep) { Flag 'OK' 'Sleep on AC power is disabled.' } else { Flag 'WARN' 'Sleep on AC power is enabled: set it to Never.' }
$wu = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
if ($wu.NoAutoRebootWithLoggedOnUsers -eq 1) { Flag 'OK' 'Automatic reboots with a signed-in user are disabled.' } else { Flag 'CHECK' 'Set Windows Update active hours / maintenance window so updates do not reboot during office hours.' }

Section 'Docker'
$dv = docker version --format '{{.Server.Version}}' 2>$null
if ($dv) { Write-Host "Docker Engine $dv"; docker info --format 'OS: {{.OperatingSystem}} | CPUs: {{.NCPU}} | Mem: {{.MemTotal}}' 2>$null } else { Flag 'INFO' 'Docker is not installed or not running.' }
$wsl = wsl --status 2>$null
if ($wsl) { Write-Host ((($wsl -join ' ') -replace "`0", '') -replace '\s+', ' ') }
$dd = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Docker Desktop'
if ($dd) { Flag 'OK' 'Docker Desktop starts at sign-in.' } else { Flag 'CHECK' 'Docker Desktop is not set to start at sign-in.' }
$tcp2375 = Get-NetTCPConnection -LocalPort 2375 -State Listen
if ($tcp2375) { Flag 'BLOCKER' 'Docker API is listening on TCP 2375 without TLS: turn "Expose daemon on tcp://localhost:2375" OFF.' }

Section 'Listening ports (anything on 0.0.0.0 / :: is reachable from the network)'
$risky = @{ 22 = 'SSH'; 3389 = 'RDP'; 5432 = 'PostgreSQL'; 6379 = 'Redis'; 2375 = 'Docker API'; 2376 = 'Docker TLS'; 3000 = 'web (should be internal)'; 3001 = 'API (should be internal)'; 5985 = 'WinRM'; 445 = 'SMB' }
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -in '0.0.0.0', '::' } | Sort-Object LocalPort -Unique | ForEach-Object {
  $name = (Get-Process -Id $_.OwningProcess).ProcessName
  $label = if ($risky.ContainsKey([int]$_.LocalPort)) { " <-- " + $risky[[int]$_.LocalPort] } else { '' }
  Write-Host ("{0,6} {1,-25}{2}" -f $_.LocalPort, $name, $label)
}

Section 'Firewall'
Get-NetFirewallProfile | ForEach-Object { Write-Host ("{0}: enabled={1} inbound default={2}" -f $_.Name, $_.Enabled, $_.DefaultInboundAction) }
Get-NetConnectionProfile | ForEach-Object { Write-Host ("Network '{0}' is {1}" -f $_.Name, $_.NetworkCategory) }
$rdp = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server').fDenyTSConnections
if ($rdp -eq 0) { Flag 'WARN' 'Remote Desktop is ON: never forward 3389 on the router; use a VPN for remote admin.' }

Section 'Defender'
$mp = Get-MpComputerStatus
if ($mp) { Write-Host ("Real-time protection: {0} | signatures {1}" -f $mp.RealTimeProtectionEnabled, $mp.AntivirusSignatureLastUpdated) }

Write-Host "`nDone. Nothing was changed."
