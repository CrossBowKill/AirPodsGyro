<#
  Build + test-sign the AirPodsL2cap driver package (no admin needed).

    powershell -ExecutionPolicy Bypass -File driver\build.ps1

  Output: driver\out\Release\package\ (AirPodsL2cap.sys, .inf, .cat, all signed) and
          driver\out\AirPodsGyroTestSigning.cer (the certificate install.ps1 trusts).
  The WDK/SDK come from NuGet (packages.config), so no WDK installation is needed;
  Visual Studio 2022 needs the C++ workload, Spectre libs and the "Windows Driver Kit" component.
#>
param([ValidateSet('Release', 'Debug')][string]$Configuration = 'Release')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$proj = Join-Path $root 'AirPodsL2cap'
$pkgs = Join-Path $root 'packages'
$ver = '10.0.26100.6584'
$wdk = Join-Path $pkgs "Microsoft.Windows.WDK.x64.$ver\c"
$sdk = Join-Path $pkgs "Microsoft.Windows.SDK.CPP.$ver\c"
$certSubject = 'CN=AirPodsGyro Test Signing'

function Step($t) { Write-Host "== $t" -ForegroundColor Cyan }
function Run($exe, [string[]]$a) {
    & $exe @a
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed with exit code $LASTEXITCODE" }
}

Step 'restore WDK/SDK NuGet packages'
$nuget = Join-Path $root 'tools\nuget.exe'
if (-not (Test-Path $nuget)) {
    New-Item -ItemType Directory -Force (Split-Path $nuget) | Out-Null
    Invoke-WebRequest https://dist.nuget.org/win-x86-commandline/v6.14.0/nuget.exe -OutFile $nuget
}
Run $nuget @('restore', (Join-Path $proj 'packages.config'), '-PackagesDirectory', $pkgs, '-NonInteractive', '-Verbosity', 'quiet')

Step "build ($Configuration x64)"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = & $vswhere -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\amd64\MSBuild.exe' | Select-Object -First 1
Run $msbuild @((Join-Path $proj 'AirPodsL2cap.vcxproj'), "/p:Configuration=$Configuration", '/p:Platform=x64', '/nologo', '/v:minimal')

Step 'assemble package'
$out = Join-Path $root "out\$Configuration"
$pkg = Join-Path $out 'package'
if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
New-Item -ItemType Directory $pkg | Out-Null
Copy-Item (Join-Path $out 'AirPodsL2cap.sys') $pkg
Copy-Item (Join-Path $root "obj\$Configuration\AirPodsL2cap.inf") $pkg

Step 'InfVerif'
Run (Join-Path $wdk 'tools\10.0.26100.0\x64\infverif.exe') @('/v', (Join-Path $pkg 'AirPodsL2cap.inf'))

Step 'test certificate'
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $certSubject -and $_.NotAfter -gt (Get-Date).AddDays(30) } | Select-Object -First 1
if (-not $cert) {
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $certSubject -CertStoreLocation Cert:\CurrentUser\My `
        -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5)
    Write-Host "created $($cert.Thumbprint)"
}
Export-Certificate -Cert $cert -FilePath (Join-Path $root 'out\AirPodsGyroTestSigning.cer') | Out-Null

$signtool = Join-Path $sdk 'bin\10.0.26100.0\x64\signtool.exe'
Step 'sign driver'
Run $signtool @('sign', '/q', '/fd', 'sha256', '/sha1', $cert.Thumbprint, '/s', 'My', (Join-Path $pkg 'AirPodsL2cap.sys'))

Step 'catalog'
Run (Join-Path $wdk 'bin\10.0.26100.0\x86\Inf2Cat.exe') @("/driver:$pkg", '/os:10_X64,10_RS5_X64,10_VB_X64,10_CO_X64,10_NI_X64,10_GE_X64', '/uselocaltime')
Run $signtool @('sign', '/q', '/fd', 'sha256', '/sha1', $cert.Thumbprint, '/s', 'My', (Join-Path $pkg 'AirPodsL2cap.cat'))

Step 'done'
Get-ChildItem $pkg | Format-Table Name, Length -AutoSize
Write-Host "Install (admin):  powershell -ExecutionPolicy Bypass -File `"$root\install.ps1`""
