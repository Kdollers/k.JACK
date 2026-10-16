# Native first-launch choice on a DISPOSABLE, CLEAN Windows runner ONLY.
# Electron's app.getPath('appData') uses the Windows roaming known folder (it
# cannot reliably be redirected with an APPDATA environment override). Refuse
# to start unless BOTH product directories are absent. All files this script
# creates are marked and removed after the packaged app closes, so the next
# clean-install smoke test starts from a genuinely empty runner profile.
param(
  [Parameter(Mandatory = $true)] [string] $ExePath,
  [int] $TimeoutSec = 75
)
$ErrorActionPreference = 'Stop'
$ExePath = (Resolve-Path $ExePath).Path
$appData = [Environment]::GetFolderPath('ApplicationData')
$legacyDir = Join-Path $appData 'GENESIS'
$currentDir = Join-Path $appData 'JENESIS'
$legacyDb = Join-Path $legacyDir 'genesis.db'
$currentDb = Join-Path $currentDir 'genesis.db'
$marker = 'jenesis-ci-disposable-' + [guid]::NewGuid().ToString('N')
$markerName = 'CI_TEST_OWNED_DO_NOT_USE_FOR_BUSINESS.txt'
$createdFixture = $false

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
  $logPaths = @((Join-Path $legacyDir 'logs\desktop.log'), (Join-Path $currentDir 'logs\desktop.log'))
  $logs = @($logPaths | Where-Object { Test-Path $_ } | ForEach-Object { Get-Content $_ -Tail 4 })
  throw "Native button '$buttonName' did not appear. Visible windows: $($visible -join ', '). Logs: $($logs -join ' | ')"
}

function Wait-ForNewBackend {
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
        } catch { } # The backend may be restarting between the log and request.
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "The separate JENESIS backend did not start. See $log"
}

# SAFETY PRECONDITIONS: never run over an existing installation or other app.
Assert (-not (Test-Path $legacyDir)) "Existing data at $legacyDir; refusing to run."
Assert (-not (Test-Path $currentDir)) "Existing data at $currentDir; refusing to run."
Assert (-not (Get-Process -Name JENESIS -ErrorAction SilentlyContinue)) 'JENESIS is already running.'
Assert (Test-Path $ExePath) 'The unpacked Windows executable was not built.'

try {
  New-Item -ItemType Directory -Path $legacyDir, $currentDir -Force | Out-Null
  $createdFixture = $true
  Set-Content -Path (Join-Path $legacyDir $markerName) -Value $marker -NoNewline
  Set-Content -Path (Join-Path $currentDir $markerName) -Value $marker -NoNewline
  # The archived source fixture is copied ONLY to the disposable runner path.
  node -e "require('./tests/fixture-db.cjs').writeLegacyFixture(process.argv[1])" $legacyDb
  Assert ($LASTEXITCODE -eq 0) 'Could not construct the disposable legacy fixture.'
  $before = (Get-FileHash $legacyDb -Algorithm SHA256).Hash
  Write-Host "==> Launching the packaged JENESIS binary with a runner-only legacy database"
  Start-Process -FilePath $ExePath | Out-Null
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Invoke-NativeButton 'Start separate JENESIS installation'
  Invoke-NativeButton 'Create separate empty installation'
  $url = Wait-ForNewBackend
  $status = Invoke-RestMethod -Uri "$url/api/setup/status" -TimeoutSec 15
  Assert ($status.needsSetup -eq $true -and $status.hasAdministrator -eq $false) `
    'A separately selected empty database must offer first-run setup.'
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
  # Gracefully close only the unpacked test binary, not another installed app.
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
    $owned | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    throw 'The disposable JENESIS binary did not shut down cleanly.'
  }
  if ($createdFixture) {
    # Delete ONLY the runner fixture we ourselves created; a mismatched marker
    # means someone changed these folders, so leave them intact and fail.
    foreach ($dir in @($legacyDir, $currentDir)) {
      $tag = Join-Path $dir $markerName
      Assert ((Test-Path $tag) -and (Get-Content $tag -Raw) -eq $marker) `
        "Runner fixture ownership cannot be verified: $dir (not removing it)."
    }
    Remove-Item $legacyDir, $currentDir -Recurse -Force
    Write-Host '    Removed only the two marked CI fixture folders; next installer test starts clean.'
  }
}
