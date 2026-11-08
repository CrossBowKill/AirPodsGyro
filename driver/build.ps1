<#
  Build + test-sign the AirPodsL2cap driver package (no admin needed).

    powershell -ExecutionPolicy Bypass -File driver\build.ps1

  Output: driver\out\Release\package\ (AirPodsL2cap.sys, .inf, .cat, all signed, plus signing-cert.cer and
  signing-cert.sha1 for install.ps1).

  Signing (red-team review 2026-11-08): every build makes a NEW single-use self-signed certificate, signs with
  it, and then DELETES the private key. No key is left anywhere, so nothing can sign with this certificate
  later, even though install.ps1 makes Windows trust it. Older AirPodsGyro signing keys left by earlier builds
  are deleted from your certificate store too.

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
$certPrefix = 'CN=AirPodsGyro Test Signing'

function Step($t) { Write-Host "== $t" -ForegroundColor Cyan }
function Run($exe, [string[]]$a) {
    & $exe @a
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed with exit code $LASTEXITCODE" }
}
function Assert-MicrosoftSigned($path) {
    $sig = Get-AuthenticodeSignature -FilePath $path
    if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw "$path is not validly signed by Microsoft (status $($sig.Status)); delete it and run again."
    }
}

Step 'remove old AirPodsGyro signing keys from your certificate store'
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "$certPrefix*" } | ForEach-Object {
    Write-Host "deleting $($_.Thumbprint) ($($_.Subject))"
    Remove-Item -Path $_.PSPath -DeleteKey
}

Step 'restore WDK/SDK NuGet packages'
$nuget = Join-Path $root 'tools\nuget.exe'
if (-not (Test-Path $nuget)) {
    New-Item -ItemType Directory -Force (Split-Path $nuget) | Out-Null
    Invoke-WebRequest https://dist.nuget.org/win-x86-commandline/v6.14.0/nuget.exe -OutFile $nuget
}
Assert-MicrosoftSigned $nuget
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
$infverif = Join-Path $wdk 'tools\10.0.26100.0\x64\infverif.exe'
Assert-MicrosoftSigned $infverif
Run $infverif @('/v', (Join-Path $pkg 'AirPodsL2cap.inf'))

Step 'catalog'
$inf2cat = Join-Path $wdk 'bin\10.0.26100.0\x86\Inf2Cat.exe'
# Inf2Cat is signed with Microsoft's internal build-tools certificate, which Windows does not chain to a
# trusted root, so pin the exact file from WDK NuGet package 10.0.26100.6584 instead.
$inf2catHash = 'B594728D38B271979367ABC8060A971B8E42422738009BE126710B1F5DD0FCBC'
if ((Get-FileHash $inf2cat -Algorithm SHA256).Hash -ne $inf2catHash) {
    throw "$inf2cat does not match the pinned SHA-256; delete driver\packages and run again."
}
Run $inf2cat @("/driver:$pkg", '/os:10_X64,10_RS5_X64,10_VB_X64,10_CO_X64,10_NI_X64,10_GE_X64', '/uselocaltime')

Step 'sign with a new single-use certificate'
$signtool = Join-Path $sdk 'bin\10.0.26100.0\x64\signtool.exe'
Assert-MicrosoftSigned $signtool
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
# Not a CA (cannot issue other certificates), code signing only; the key is deleted below.
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "$certPrefix $stamp" `
    -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 `
    -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(10) `
    -TextExtension @('2.5.29.19={text}false')
try {
    foreach ($f in 'AirPodsL2cap.sys', 'airpodsl2cap.cat') {
        Run $signtool @('sign', '/q', '/fd', 'sha256', '/sha1', $cert.Thumbprint, '/s', 'My', (Join-Path $pkg $f))
    }
    Export-Certificate -Cert $cert -FilePath (Join-Path $pkg 'signing-cert.cer') | Out-Null
    Set-Content -Path (Join-Path $pkg 'signing-cert.sha1') -Value $cert.Thumbprint -Encoding ascii
} finally {
    Remove-Item -Path $cert.PSPath -DeleteKey     # private key gone: nothing can be signed with it again
}
if (Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }) {
    throw 'could not delete the signing key from Cert:\CurrentUser\My'
}

Step 'done'
Get-ChildItem $pkg | Format-Table Name, Length -AutoSize
Write-Host "Signing certificate $($cert.Thumbprint) (private key deleted)."
Write-Host "Install (admin):  powershell -ExecutionPolicy Bypass -File `"$root\install.ps1`""
