# GENESIS installed-application smoke test (Windows 10/11).
#
# Installs the NSIS installer silently, launches GENESIS.exe the way a user would,
# and checks the complete lifecycle through the application's own local API:
#   install -> launch -> backend ready -> no external browser -> first-run setup ->
#   login -> accounting transaction -> backup export -> graceful close ->
#   relaunch -> data still present -> silent uninstall -> user data kept.
#
# Safety: the script refuses to run when GENESIS user data already exists, so it can never
# touch a real business database. Run it on a clean test machine or a CI runner.
#
# Usage (PowerShell 5.1+ or PowerShell 7):
#   .\scripts\smoke-test-installed.ps1 -InstallerPath .\release\GENESIS-Setup-1.0.0.exe
#
# Exit code 0 = all checks passed. Any failure stops the run and reports the step.

param(
  [Parameter(Mandatory = $true)] [string] $InstallerPath,
  [string] $InstallDir = (Join-Path $env:TEMP 'GenesisSmokeTest\GENESIS'),
  [int] $StartupTimeoutSec = 120,
  [switch] $KeepInstalled
)

$ErrorActionPreference = 'Stop'
$script:Results = @()
$DataDir = Join-Path $env:APPDATA 'GENESIS'
$LogFile = Join-Path $DataDir 'logs\desktop.log'
$ExePath = Join-Path $InstallDir 'GENESIS.exe'

function Step([string] $Name, [scriptblock] $Body) {
  Write-Host "==> $Name" -ForegroundColor Cyan
  try {
    $value = & $Body
    $script:Results += [pscustomobject]@{ Step = $Name; Result = 'PASS' }
    Write-Host "    PASS" -ForegroundColor Green
    return $value
  } catch {
    $script:Results += [pscustomobject]@{ Step = $Name; Result = "FAIL: $($_.Exception.Message)" }
    Write-Host "    FAIL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Summary
    exit 1
  }
}

function Assert([bool] $Condition, [string] $Message) {
  if (-not $Condition) { throw $Message }
}

function Write-Summary {
  Write-Host ''
  Write-Host 'Summary' -ForegroundColor Yellow
  $script:Results | Format-Table -AutoSize | Out-String | Write-Host
}

function Get-BackendUrlFromLog {
  # The log records "Backend ready at http://127.0.0.1:<port>/" for each launch.
  if (-not (Test-Path $LogFile)) { return $null }
  $matches = Select-String -Path $LogFile -Pattern 'Backend ready at (http://127\.0\.0\.1:\d+/)' -AllMatches
  $last = $matches | ForEach-Object { $_.Matches } | Select-Object -Last 1
  if ($last) { return $last.Groups[1].Value.TrimEnd('/') } else { return $null }
}

function Wait-ForBackend([int] $AfterLines) {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogFile) {
      $lines = Get-Content $LogFile
      $ready = $lines | Select-String -Pattern 'Backend ready at' | Select-Object -Last 1
      if ($ready -and ($lines.Count -gt $AfterLines)) {
        $url = Get-BackendUrlFromLog
        if ($url) {
          try {
            $h = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3
            if ($h.appId -eq 'genesis-accounting') { return $url }
          } catch { }
        }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "The backend did not become ready within $StartupTimeoutSec seconds. See $LogFile"
}

function Get-GenesisProcesses {
  Get-Process -Name 'GENESIS' -ErrorAction SilentlyContinue
}

function Close-GenesisGracefully {
  $windows = Get-GenesisProcesses | Where-Object { $_.MainWindowHandle -ne 0 }
  Assert ($windows.Count -gt 0) 'No GENESIS window found to close.'
  foreach ($w in $windows) { [void]$w.CloseMainWindow() }
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline -and (Get-GenesisProcesses)) { Start-Sleep -Milliseconds 300 }
  $left = Get-GenesisProcesses
  if ($left) {
    # Diagnostics for the log: which processes remain, when they started, and their command lines.
    $left | ForEach-Object {
      $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue
      Write-Host "    leftover pid $($_.Id) started $($_.StartTime) window=$($_.MainWindowHandle) cmd=$($cim.CommandLine)"
    }
    throw "GENESIS processes still running after the window was closed: $($left.Id -join ', ')"
  }
}

function Invoke-Api([string] $Base, [string] $Method, [string] $Route, $Body = $null, [string] $Token = $null) {
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  $params = @{ Uri = "$Base/api$Route"; Method = $Method; Headers = $headers; ContentType = 'application/json'; TimeoutSec = 15 }
  if ($null -ne $Body) { $params['Body'] = ($Body | ConvertTo-Json -Depth 10) }
  return Invoke-RestMethod @params
}

# ---------------------------------------------------------------------------
Write-Host 'GENESIS installed-application smoke test' -ForegroundColor Yellow
Write-Host "Installer: $InstallerPath"
Write-Host "Install folder: $InstallDir"

Step 'Preconditions: no existing GENESIS user data or running instance' {
  Assert (-not (Test-Path $DataDir)) "GENESIS user data already exists at $DataDir. Run this test on a clean machine or remove that folder yourself after backing it up."
  Assert (-not (Get-GenesisProcesses)) 'GENESIS is already running.'
  Assert (Test-Path $InstallerPath) "Installer not found: $InstallerPath"
}

Step 'Silent install into a normal application folder' {
  $full = (Resolve-Path $InstallerPath).Path
  $p = Start-Process -FilePath $full -ArgumentList @('/S', "/D=$InstallDir") -PassThru -Wait
  Assert ($p.ExitCode -eq 0) "Installer exited with code $($p.ExitCode)"
  Assert (Test-Path $ExePath) "GENESIS.exe not found at $ExePath"
}

Step 'Desktop and Start menu shortcuts were created' {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $shortcuts = @(
    (Get-ChildItem -Path $desktop -Filter 'GENESIS*.lnk' -ErrorAction SilentlyContinue),
    (Get-ChildItem -Path $startMenu -Recurse -Filter 'GENESIS*.lnk' -ErrorAction SilentlyContinue)
  ) | ForEach-Object { $_ }
  Assert ($shortcuts.Count -ge 1) 'No GENESIS shortcut was found on the desktop or in the Start menu.'
}

$baseUrl = $null
Step 'Application starts from the executable, with no manual server or terminal' {
  $before = if (Test-Path $LogFile) { (Get-Content $LogFile).Count } else { 0 }
  Start-Process -FilePath $ExePath | Out-Null
  $script:baseUrl = Wait-ForBackend -AfterLines $before
  Assert ([bool]($script:baseUrl -match '^http://127\.0\.0\.1:\d+$')) "Backend is not on loopback: $($script:baseUrl)"
}

Step 'Backend listens on loopback only (not reachable on a LAN address)' {
  $port = ([uri]$baseUrl).Port
  $lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
  if ($lan) {
    $reachable = Test-NetConnection -ComputerName $lan.IPAddress -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    Assert (-not $reachable) "Backend port $port is reachable on $($lan.IPAddress)"
  }
}

Step 'No external browser window was opened for GENESIS' {
  $browsers = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe' OR Name='firefox.exe'" -ErrorAction SilentlyContinue
  $port = ([uri]$baseUrl).Port
  $hit = $browsers | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape("127.0.0.1:$port") }
  Assert (-not $hit) 'An external browser was opened on the GENESIS backend address.'
}

Step 'Unauthenticated API requests are refused' {
  try {
    Invoke-Api $baseUrl 'GET' '/accounts' | Out-Null
    throw 'Unauthenticated request was accepted.'
  } catch {
    Assert ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) "Expected HTTP 401, got: $($_.Exception.Message)"
  }
}

$script:Password = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ }) + 'Aa1!'
$script:Token = $null
Step 'First-run setup creates the company and administrator' {
  $status = Invoke-Api $baseUrl 'GET' '/setup/status'
  Assert ($status.needsSetup -eq $true) 'A fresh installation should require setup.'
  Invoke-Api $baseUrl 'POST' '/setup/initialize' @{
    company_name = 'Smoke Test Company'; full_name = 'Smoke Admin'; username = 'smoke.admin'; password = $script:Password
  } | Out-Null
}

Step 'Sign in and reach the application (no forced password change)' {
  $login = Invoke-Api $baseUrl 'POST' '/auth/login' @{ username = 'smoke.admin'; password = $script:Password }
  Assert ([bool]$login.token) 'Login did not return a session token.'
  Assert ($login.mustChangePassword -eq $false) 'A newly created administrator should not be asked to change password.'
  $script:Token = $login.token
  $me = Invoke-Api $baseUrl 'GET' '/auth/me' $null $script:Token
  Assert ($me.user.role -eq 'admin') 'Signed-in user is not the administrator.'
}

Step 'Accounting transaction: balanced journal entry is posted' {
  $entry = Invoke-Api $baseUrl 'POST' '/journal-entries' @{
    date = (Get-Date -Format 'yyyy-MM-dd'); reference = 'SMOKE-1'; description = 'Smoke test capital injection'
    lines = @(
      @{ accountId = 'acc-1010'; debit = 1000; credit = 0; description = 'Cash' },
      @{ accountId = 'acc-3010'; debit = 0; credit = 1000; description = 'Capital' }
    )
  } $script:Token
  Assert ([bool]$entry) 'The journal entry was not accepted.'
}

Step 'Trial balance is balanced' {
  $tb = Invoke-Api $baseUrl 'GET' '/reports/trial-balance' $null $script:Token
  Assert ($tb.isBalanced -eq $true) "Trial balance reports unbalanced totals: debit $($tb.grandDebit), credit $($tb.grandCredit)"
  Assert ([math]::Abs([double]$tb.grandDebit - [double]$tb.grandCredit) -lt 0.005) 'Trial balance totals differ.'
}

$script:BackupFile = Join-Path $env:TEMP 'genesis-smoke-backup.json'
Step 'Full backup export is produced and contains the transaction' {
  $headers = @{ Authorization = "Bearer $script:Token" }
  Invoke-WebRequest -Uri "$baseUrl/api/backup/export" -Headers $headers -OutFile $script:BackupFile -UseBasicParsing -TimeoutSec 30
  $backup = Get-Content $script:BackupFile -Raw | ConvertFrom-Json
  Assert ($backup.journalEntries.Count -ge 1) 'Backup does not contain the journal entry.'
}

Step 'Graceful shutdown: window closes and all processes exit' {
  Close-GenesisGracefully
  $stillAnswering = $true
  try { Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2 | Out-Null } catch { $stillAnswering = $false }
  Assert (-not $stillAnswering) 'The backend still answers after the application closed.'
}

Step 'Relaunch: business data persists after restart' {
  $before = (Get-Content $LogFile).Count
  Start-Process -FilePath $ExePath | Out-Null
  $script:baseUrl = Wait-ForBackend -AfterLines $before
  $login = Invoke-Api $script:baseUrl 'POST' '/auth/login' @{ username = 'smoke.admin'; password = $script:Password }
  $entries = Invoke-Api $script:baseUrl 'GET' '/journal-entries' $null $login.token
  $found = @($entries | Where-Object { $_.reference -eq 'SMOKE-1' -or $_.description -eq 'Smoke test capital injection' })
  Assert ($found.Count -ge 1) 'The journal entry is missing after restart.'
  $script:Token = $login.token
}

Step 'Backup restore protection: a restore first keeps a copy of the database' {
  # Restoring the exported file must be accepted and must leave a pre-restore copy on disk.
  # Restore contract: the backup document, the current password and the word RESTORE.
  # The exported file is sent byte-for-byte inside the envelope, so the checksum still matches.
  $raw = (Get-Content $script:BackupFile -Raw).Trim()
  $payload = '{"backup":' + $raw + ',"password":' + (ConvertTo-Json $script:Password) + ',"confirm":"RESTORE"}'
  $result = Invoke-RestMethod -Uri "$script:baseUrl/api/backup/import" -Method Post -Headers @{ Authorization = "Bearer $script:Token" } -ContentType 'application/json' -Body $payload -TimeoutSec 60
  Assert ($result.success -eq $true) 'The restore was not accepted.'
  Assert ($result.signedOut -eq $true) 'The restore did not sign the users out.'
  $copies = Get-ChildItem (Join-Path $DataDir 'backups') -Filter 'pre-restore-*.db' -ErrorAction SilentlyContinue
  Assert ($copies.Count -ge 1) 'No pre-restore database copy was written.'
  # The session used for the restore must now be revoked.
  $revoked = $false
  try { Invoke-Api $script:baseUrl 'GET' '/auth/me' $null $script:Token | Out-Null } catch { $revoked = $true }
  Assert $revoked 'The session used for the restore is still valid.'
  $script:Token = (Invoke-Api $script:baseUrl 'POST' '/auth/login' @{ username = 'smoke.admin'; password = $script:Password }).token
}

Step 'Close again and confirm clean shutdown' {
  Close-GenesisGracefully
}

Step 'Silent uninstall removes the program but keeps business data' {
  $uninstaller = Join-Path $InstallDir 'Uninstall GENESIS.exe'
  Assert (Test-Path $uninstaller) 'Uninstaller not found.'
  $p = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait
  Assert ($p.ExitCode -eq 0) "Uninstaller exited with code $($p.ExitCode)"
  Start-Sleep -Seconds 2
  Assert (-not (Test-Path $ExePath)) 'GENESIS.exe still exists after uninstall.'
  Assert (Test-Path (Join-Path $DataDir 'genesis.db')) 'The business database was removed by uninstall.'
}

Write-Summary
Write-Host 'All smoke-test checks passed.' -ForegroundColor Green
exit 0
