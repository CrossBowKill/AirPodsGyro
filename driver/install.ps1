<#
  Install the test-signed AirPodsL2cap driver (run as Administrator, test-signing mode must be on).

    powershell -ExecutionPolicy Bypass -File driver\install.ps1            # install / update
    powershell -ExecutionPolicy Bypass -File driver\install.ps1 -Uninstall # remove again

  What it changes:
   * trusts driver\out\AirPodsGyroTestSigning.cer (LocalMachine: Root + TrustedPublisher)
   * adds the driver to the driver store and binds it to the AirPods' Apple service device node
     BTHENUM\{74ec2172-0bad-4d01-8f77-997b2be0722a}; audio devices are not touched
#>
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pkg = Join-Path $root 'out\Release\package'
$cer = Join-Path $root 'out\AirPodsGyroTestSigning.cer'
$serviceGuid = '74ec2172-0bad-4d01-8f77-997b2be0722a'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an Administrator PowerShell.'
}

function Get-Nodes {
    Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like "BTHENUM\{$serviceGuid}*" }
}

if ($Uninstall) {
    $infs = pnputil /enum-drivers | Select-String -Context 1, 0 'AirPodsL2cap.inf' |
        ForEach-Object { ($_.Context.PreContext[0] -split ':\s*')[1].Trim() } | Where-Object { $_ -like 'oem*.inf' }
    foreach ($i in $infs) { Write-Host "removing $i"; pnputil /delete-driver $i /uninstall /force }
    foreach ($n in Get-Nodes) { pnputil /restart-device "$($n.InstanceId)" | Out-Null }
    Write-Host 'Removed. (The test certificate stays trusted; remove "AirPodsGyro Test Signing" from certlm.msc if you want.)'
    return
}

$ts = (bcdedit /enum '{current}' | Select-String -Pattern '^testsigning\s+Yes') -ne $null
if (-not $ts) { Write-Warning 'Test-signing mode looks OFF: run "bcdedit /set testsigning on" and reboot, or the driver will not load.' }
if (-not (Test-Path (Join-Path $pkg 'AirPodsL2cap.cat'))) { throw "No driver package in $pkg - run build.ps1 first." }

Write-Host '== trusting the test certificate'
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher | Out-Null

Write-Host '== adding driver to the store and installing on matching devices'
pnputil /add-driver (Join-Path $pkg 'AirPodsL2cap.inf') /install
if ($LASTEXITCODE -notin 0, 259, 3010) { throw "pnputil failed ($LASTEXITCODE)" }

Write-Host '== device nodes'
foreach ($n in Get-Nodes) {
    $svc = (Get-PnpDeviceProperty -InstanceId $n.InstanceId -KeyName DEVPKEY_Device_Service -ErrorAction SilentlyContinue).Data
    $prob = (Get-PnpDeviceProperty -InstanceId $n.InstanceId -KeyName DEVPKEY_Device_ProblemCode -ErrorAction SilentlyContinue).Data
    '{0,-8} driver={1,-14} problem={2}  {3}' -f $n.Status, $svc, $prob, $n.InstanceId
}
Write-Host 'Done. Test with:  python airpodsgyro\tools\apl2_probe.py'
