# Builds the GENESIS Windows installer from source on a Windows 10/11 x64 machine.
# Requires Node.js 22 LTS installed on the BUILD machine only (end users never need it).
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
#
# Output: release\GENESIS-Setup-<version>.exe
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Run([string] $cmd) {
  Write-Host "> $cmd" -ForegroundColor Cyan
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" }
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'   # unsigned build unless a certificate is configured

Run 'npm ci'
Run 'npm run test:all'
Run 'npm run desktop:dist'
Run 'node scripts\verify-package.cjs release\win-unpacked'

$installer = Get-ChildItem release -Filter 'GENESIS-Setup-*.exe' | Select-Object -First 1
if (-not $installer) { throw 'Installer was not produced.' }
Write-Host "Installer ready: $($installer.FullName)" -ForegroundColor Green
Write-Host 'Next: powershell -ExecutionPolicy Bypass -File scripts\smoke-test-installed.ps1 -InstallerPath <installer>'
