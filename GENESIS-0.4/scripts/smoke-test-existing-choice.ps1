# Disposable Windows smoke for an existing GENESIS ledger and the NEW separate
# installation choice. Uses release/win-unpacked/JENESIS.exe, the same binary the
# installer contains. Never point this script at a real Windows app-data folder.
param(
  [Parameter(Mandatory = $true)] [string] $ExePath,
  [int] $TimeoutSec = 120
)
$ErrorActionPreference = 'Stop'
$ExePath = (Resolve-Path $ExePath).Path
$root = Join-Path $env:TEMP ('JenesisExistingChoiceSmoke-' + [guid]::NewGuid().ToString('N'))
$appData = Join-Path $root 'AppData'
$legacyDir = Join-Path $appData 'GENESIS'
$currentDir = Join-Path $appData 'JENESIS'
$legacyDb = Join-Path $legacyDir 'genesis.db'
$currentDb = Join-Path $currentDir 'genesis.db'
$originalAppData = $env:APPDATA

function Assert([bool] $condition, [string] $message) {
  if (-not $condition) { throw $message }
}

function Invoke-NativeButton([string] $buttonName) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $rootElement = [System.Windows.Automation.AutomationElement]::RootElement
  $selector = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty, $buttonName)
  while ((Get-Date) -lt $deadline) {
    try {
      $button = $rootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $selector)
      if ($button) {
        $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $invoke.Invoke()
        Write-Host "    Clicked native dialog button: $buttonName"
        return
      }
    } catch { } # A window can disappear during a UI Automation search.
    Start-Sleep -Milliseconds 400
  }
  $visible = @(Get-Process -Name JENESIS -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.MainWindowTitle })
  throw "Native button '$buttonName' did not appear. Visible windows: $($visible -join ', ')"
}

function Wait-ForIsolatedBackend {
  $log = Join-Path $currentDir 'logs\desktop.log'
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $log) {
      $last = Get-Content $log | Select-String -Pattern 'Backend ready at (http://127\.0\.0\.1:\d+/)' | Select-Object -Last 1
      if ($last) {
        $url = $last.Matches[0].Groups[1].Value.TrimEnd('/')
        try {
          $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
          if ($health.appId -eq 'jenesis-accounting') { return $url }
        } catch { } # Backend may have stopped or restarted between log and request.
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "The isolated JENESIS backend did not start. Check $log"
}

try {
  Assert (-not (Test-Path $appData)) 'The test app-data folder must not exist beforehand.'
  New-Item -ItemType Directory -Path $legacyDir -Force | Out-Null
  # Copy the archived historical database ONLY to this isolated temporary path.
  # Its accounts and transactions must not enter the new installation.
  node -e "require('./tests/fixture-db.cjs').writeLegacyFixture(process.argv[1])" $legacyDb
  Assert ($LASTEXITCODE -eq 0) 'Could not construct the disposable legacy fixture.'
  $before = (Get-FileHash $legacyDb -Algorithm SHA256).Hash
  $env:APPDATA = $appData
  Write-Host "==> Launching the packaged JENESIS binary with an isolated legacy database"
  Start-Process -FilePath $ExePath | Out-Null
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Invoke-NativeButton 'Start separate JENESIS installation'
  Invoke-NativeButton 'Create separate empty installation'
  $url = Wait-ForIsolatedBackend
  $status = Invoke-RestMethod -Uri "$url/api/setup/status" -TimeoutSec 15
  Assert ($status.needsSetup -eq $true -and $status.hasAdministrator -eq $false) `
    'A separately selected empty JENESIS database must offer first-run setup.'
  Assert (Test-Path $currentDb) 'The new installation did not create its own database.'
  $choice = Get-Content (Join-Path $currentDir 'installation-choice.json') -Raw | ConvertFrom-Json
  Assert ($choice.selected -eq 'current' -and $choice.currentInitialized -eq $true) `
    'The explicit choice was not persisted and marked initialized.'
  Assert ((Get-FileHash $legacyDb -Algorithm SHA256).Hash -eq $before) 'The older GENESIS database changed.'
  $archived = node -e "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true,fileMustExist:true});console.log(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);db.close()" $legacyDb
  Assert ($LASTEXITCODE -eq 0 -and [int]$archived -ge 1) 'The original user accounts were lost.'
  $newUsers = node -e "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true,fileMustExist:true});console.log(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);db.close()" $currentDb
  Assert ($LASTEXITCODE -eq 0 -and [int]$newUsers -eq 0) 'The new installation imported existing accounts.'
  Write-Host '    PASS: native choice -> separate first-run setup; original ledger unchanged.' -ForegroundColor Green
} finally {
  $env:APPDATA = $originalAppData
  # Close only the disposable unpacked executable, never any installed app.
  $deadline = (Get-Date).AddSeconds(30)
  do {
    $owned = @(Get-CimInstance Win32_Process -Filter "Name='JENESIS.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.ExecutablePath -eq $ExePath })
    foreach ($entry in $owned) {
      try {
        $process = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
        if ($process -and $process.MainWindowHandle -ne 0) { [void]$process.CloseMainWindow() }
      } catch { }
    }
    if ($owned.Count -gt 0) { Start-Sleep -Milliseconds 450 }
  } while ($owned.Count -gt 0 -and (Get-Date) -lt $deadline)
  if ($owned.Count -gt 0) {
    # The isolated runner is disposable; stop only this unpacked test binary.
    $owned | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  Write-Host "    Isolated test data: $root (runner-only; never a user's database)"
}
