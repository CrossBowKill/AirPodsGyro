<#
  Install or remove the test-signed AirPodsL2cap driver (run as Administrator, test-signing mode must be on).

    powershell -ExecutionPolicy Bypass -File driver\install.ps1             # install / update
    powershell -ExecutionPolicy Bypass -File driver\install.ps1 -Uninstall  # remove driver AND certificates

  What install does (red-team review 2026-11-08):
   1. copies driver\out\Release\package to an admin-only folder (%ProgramData%\AirPodsGyro\driver), so nothing
      running as your normal user can swap files while it is checked and installed
   2. checks the package: the signing certificate is the one build.ps1 pinned (signing-cert.sha1), is not a
      CA, is for code signing only, and is the signer of both AirPodsL2cap.sys and the catalog
   3. shows you the certificate thumbprint and the driver's SHA-256 and asks before going on
   4. trusts that one certificate (LocalMachine Root + TrustedPublisher); build.ps1 already deleted its
      private key, so it cannot sign anything else
   5. installs the driver on the AirPods' Apple service node BTHENUM\{74ec2172-...}; audio nodes untouched
   6. removes older AirPodsGyro driver packages and certificates; if anything fails, it undoes step 4
#>
param([switch]$Uninstall, [switch]$Yes)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$src = Join-Path $root 'out\Release\package'
$stage = Join-Path $env:ProgramData 'AirPodsGyro\driver'
$serviceGuid = '74ec2172-0bad-4d01-8f77-997b2be0722a'
$certPrefix = 'CN=AirPodsGyro Test Signing'
$stores = 'Cert:\LocalMachine\Root', 'Cert:\LocalMachine\TrustedPublisher'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an Administrator PowerShell.'
}

function Get-OurDrivers {
    # language-independent (pnputil's text output is localised)
    Get-WindowsDriver -Online -All -ErrorAction SilentlyContinue |
        Where-Object { $_.OriginalFileName -like '*\airpodsl2cap.inf' }
}
function Get-OurCerts([string]$except = '') {
    foreach ($s in $stores) {
        Get-ChildItem $s | Where-Object { $_.Subject -like "$certPrefix*" -and $_.Thumbprint -ne $except }
    }
}
function Remove-OurCerts([string]$except = '') {
    foreach ($c in Get-OurCerts $except) {
        Write-Host "  untrusting $($c.Thumbprint) from $($c.PSParentPath -replace '.*::', '')"
        Remove-Item -Path $c.PSPath
    }
}
function Get-Nodes {
    Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like "BTHENUM\{$serviceGuid}*" }
}
function Show-Nodes {
    foreach ($n in Get-Nodes) {
        $svc = (Get-PnpDeviceProperty -InstanceId $n.InstanceId -KeyName DEVPKEY_Device_Service -ErrorAction SilentlyContinue).Data
        $prob = (Get-PnpDeviceProperty -InstanceId $n.InstanceId -KeyName DEVPKEY_Device_ProblemCode -ErrorAction SilentlyContinue).Data
        '  {0,-8} driver={1,-14} problem={2}  {3}' -f $n.Status, $svc, $prob, $n.InstanceId
    }
}

# ------------------------------------------------------------------------------------------- uninstall
if ($Uninstall) {
    $failed = $false
    foreach ($d in Get-OurDrivers) {
        Write-Host "removing driver package $($d.Driver)"
        pnputil /delete-driver $d.Driver /uninstall /force | Out-Null
        if ($LASTEXITCODE -notin 0, 3010) { Write-Warning "pnputil could not remove $($d.Driver) (exit $LASTEXITCODE)"; $failed = $true }
    }
    Write-Host 'removing AirPodsGyro certificates from the machine trust stores'
    Remove-OurCerts
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    foreach ($n in Get-Nodes) { pnputil /restart-device "$($n.InstanceId)" | Out-Null }
    $left = @(Get-OurDrivers).Count + @(Get-OurCerts).Count
    if ($failed -or $left) { throw "Uninstall incomplete: $left item(s) left. Reboot and run -Uninstall again." }
    Write-Host 'Removed: driver packages and certificates.'
    return
}

# ------------------------------------------------------------------------------------------- install
# booted with test signing? (language-independent, reflects the current boot)
$opts = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control' -Name SystemStartOptions).SystemStartOptions
if ($opts -notmatch 'TESTSIGNING') {
    Write-Warning 'Windows is not running in test-signing mode: run "bcdedit /set testsigning on" and reboot, or the driver will not load.'
}
if (-not (Test-Path (Join-Path $src 'signing-cert.sha1'))) { throw "No signed package in $src - run build.ps1 first." }

Write-Host '== copying the package to an admin-only folder'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
icacls $stage /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null   # SYSTEM, Administrators
if ($LASTEXITCODE -ne 0) { throw 'could not restrict the staging folder' }
Copy-Item (Join-Path $src '*') $stage

Write-Host '== checking the package'
$pin = (Get-Content (Join-Path $stage 'signing-cert.sha1') -Raw).Trim()
$cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2 (Join-Path $stage 'signing-cert.cer')
if ($cert.Thumbprint -ne $pin) { throw 'signing-cert.cer does not match the pinned thumbprint' }
if ($cert.Subject -notlike "$certPrefix*") { throw "unexpected certificate subject: $($cert.Subject)" }
$bc = $cert.Extensions | Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509BasicConstraintsExtension] }
if ($bc -and $bc.CertificateAuthority) { throw 'the signing certificate is a CA; refusing to trust it' }
$eku = ($cert.Extensions | Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] }).EnhancedKeyUsages
if (-not $eku -or @($eku).Count -ne 1 -or $eku[0].Value -ne '1.3.6.1.5.5.7.3.3') { throw 'the certificate is not code-signing only' }
foreach ($f in 'AirPodsL2cap.sys', 'airpodsl2cap.cat') {
    $sig = Get-AuthenticodeSignature (Join-Path $stage $f)
    if (-not $sig.SignerCertificate -or $sig.SignerCertificate.Thumbprint -ne $pin) { throw "$f is not signed by the pinned certificate" }
}
$hash = (Get-FileHash (Join-Path $stage 'AirPodsL2cap.sys') -Algorithm SHA256).Hash
Write-Host "  certificate  $pin  ($($cert.Subject), created $($cert.NotBefore))"
Write-Host "  driver       AirPodsL2cap.sys  SHA-256 $hash"
if (-not $Yes) {
    $a = Read-Host 'These should match what build.ps1 printed just now. Install? [y/N]'
    if ($a -notmatch '^(y|yes|j|ja)$') { Write-Host 'Cancelled.'; Remove-Item $stage -Recurse -Force; return }
}

Write-Host '== trusting the certificate'
$added = @()
foreach ($s in $stores) {
    if (-not (Test-Path (Join-Path $s $pin))) { Import-Certificate -FilePath (Join-Path $stage 'signing-cert.cer') -CertStoreLocation $s | Out-Null; $added += (Join-Path $s $pin) }
}

Write-Host '== installing the driver'
pnputil /add-driver (Join-Path $stage 'AirPodsL2cap.inf') /install
if ($LASTEXITCODE -notin 0, 259, 3010) {
    foreach ($p in $added) { Remove-Item $p -ErrorAction SilentlyContinue }
    throw "pnputil failed ($LASTEXITCODE); the certificate was untrusted again"
}

Write-Host '== removing older AirPodsGyro driver packages and certificates'
$ours = @(Get-OurDrivers | Sort-Object { [version]$_.Version }, Date)
if ($ours.Count -gt 1) {
    foreach ($d in $ours[0..($ours.Count - 2)]) {
        pnputil /delete-driver $d.Driver | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "  removed $($d.Driver)" } else { Write-Warning "  $($d.Driver) still in use (exit $LASTEXITCODE); remove it after a reboot with -Uninstall + install" }
    }
}
Remove-OurCerts $pin

Write-Host '== device nodes'
Show-Nodes
Write-Host 'Done. Test with:  python airpodsgyro\tools\apl2_probe.py'
