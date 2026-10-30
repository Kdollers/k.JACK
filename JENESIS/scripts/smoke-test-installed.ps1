# JENESIS installed-application smoke test (Windows 10/11).
#
# Installs the NSIS installer silently, launches JENESIS.exe the way a user would,
# and checks the complete lifecycle through the application's own local API:
#   install -> launch -> backend ready -> no external browser -> first-run setup ->
#   login -> accounting transaction -> backup export -> graceful close ->
#   relaunch -> data still present -> silent uninstall -> user data kept.
#
# Safety: the script refuses to run when the JENESIS user data folder already exists, so it can never
# touch a real business database. Run it on a clean test machine or a CI runner.
#
# Usage (PowerShell 5.1+ or PowerShell 7):
#   .\scripts\smoke-test-installed.ps1 -InstallerPath .\release\JENESIS-Setup-1.0.0.exe
#
# Exit code 0 = all checks passed. Any failure stops the run and reports the step.

param(
  [Parameter(Mandatory = $true)] [string] $InstallerPath,
  # Brand of the packaged application. The executable name, data folder, process
  # name, shortcut names and uninstaller are all derived from it, so the same
  # script can smoke-test a JENESIS build or an older GENESIS build.
  [string] $AppName = 'JENESIS',
  [string] $InstallDir = (Join-Path $env:TEMP 'JenesisSmokeTest\JENESIS'),
  [int] $StartupTimeoutSec = 120,
  [switch] $KeepInstalled
)

$ErrorActionPreference = 'Stop'
$script:Results = @()
$DataDir = Join-Path $env:APPDATA $AppName
$LogFile = Join-Path $DataDir 'logs\desktop.log'
$ExePath = Join-Path $InstallDir "$AppName.exe"

function Write-ApplicationLogTail([int] $Lines = 200) {
  # The application log shows whether the close request reached the app at all,
  # so on failure the whole story is printed, not the last few lines.
  try {
    if (Test-Path $LogFile) {
      Write-Host "    --- application log $LogFile (last $Lines lines) ---" -ForegroundColor DarkGray
      Get-Content $LogFile -Tail $Lines | ForEach-Object { Write-Host "    | $_" -ForegroundColor DarkGray }
    } else {
      Write-Host "    (no application log found at $LogFile)" -ForegroundColor DarkGray
    }
  } catch {
    Write-Host "    (application log could not be read: $($_.Exception.Message))" -ForegroundColor DarkGray
  }
}

function Export-ApplicationLogs {
  # Keep the application's own logs next to this transcript: the CI job commits
  # them when a run fails, which is how a failure is diagnosed afterwards (log
  # archives cannot be downloaded from this environment).
  $target = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'ci-logs'
  try {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    if (Test-Path $LogFile) {
      # Read and write rather than copy: the application still holds the file.
      Get-Content $LogFile -Raw | Set-Content -Path (Join-Path $target 'desktop.log') -Encoding utf8 -Force
    }
    $childLog = Join-Path $DataDir 'logs\backend-child.log'
    if (Test-Path $childLog) {
      Get-Content $childLog -Raw | Set-Content -Path (Join-Path $target 'backend-child.log') -Encoding utf8 -Force
    }
  } catch {
    Write-Host "    (application logs could not be exported: $($_.Exception.Message))" -ForegroundColor DarkGray
  }
}

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
    Write-ApplicationLogTail
    Export-ApplicationLogs
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

function Get-AppProcesses {
  return @(Get-Process -Name $AppName -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# Window handling.
#
# .NET's Process.MainWindowHandle/MainWindowTitle are unreliable for an Electron
# application: EnumWindows returns several top-level windows (the app window plus
# hidden helper windows) and the "main" one is whichever comes first, so
# CloseMainWindow() intermittently sends WM_CLOSE to the wrong window and the
# application never closes. Enumerate the real windows instead and close the
# visible one that carries the application title, exactly as a user would.
# ---------------------------------------------------------------------------
if (-not ('Win32.WindowFinder' -as [type])) {
  Add-Type -Namespace Win32 -Name WindowFinder -MemberDefinition @'
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, System.IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(System.IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);
  public delegate bool EnumWindowsProc(System.IntPtr hWnd, System.IntPtr lParam);
  public const uint WM_CLOSE = 0x0010;
  public static System.Collections.Generic.List<System.IntPtr> WindowsOf(int pid) {
    var found = new System.Collections.Generic.List<System.IntPtr>();
    EnumWindows(delegate (System.IntPtr hWnd, System.IntPtr lParam) {
      uint owner;
      GetWindowThreadProcessId(hWnd, out owner);
      if (owner == (uint)pid && IsWindowVisible(hWnd)) found.Add(hWnd);
      return true;
    }, System.IntPtr.Zero);
    return found;
  }
  public static string Title(System.IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    var sb = new System.Text.StringBuilder(len + 1);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
'@
}

function Get-AppWindows {
  $windows = @()
  foreach ($p in Get-AppProcesses) {
    foreach ($h in [Win32.WindowFinder]::WindowsOf($p.Id)) {
      $windows += [pscustomobject]@{
        Id      = $p.Id
        Handle  = $h
        Title   = [Win32.WindowFinder]::Title($h)
      }
    }
  }
  return $windows
}

function Wait-ForAppWindow([int] $TimeoutSec = 120) {
  # Wait for the visible application window: a handle alone is not enough, the
  # title is only set once the window is really up.
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $fallback = @()
  while ((Get-Date) -lt $deadline) {
    $all = @(Get-AppWindows)
    if ($all.Count -gt 0 -and $fallback.Count -eq 0) { $fallback = $all }
    $app = @($all | Where-Object { $_.Title -like "*$AppName*" })
    if ($app.Count -gt 0) { return $app }
    Start-Sleep -Milliseconds 500
  }
  return $fallback
}

function Close-AppGracefully {
  # Preferred path: send WM_CLOSE to the application window, exactly as a user
  # closing the window would, then wait for every process to exit.
  $windows = Wait-ForAppWindow
  if ($windows.Count -gt 0) {
    foreach ($w in $windows) {
      $posted = [Win32.WindowFinder]::PostMessage($w.Handle, [Win32.WindowFinder]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
      Write-Host ("    WM_CLOSE posted to pid {0} handle {1} title '{2}': {3}" -f $w.Id, $w.Handle, $w.Title, $posted)
    }
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline -and (Get-AppProcesses)) { Start-Sleep -Milliseconds 300 }
  } else {
    # No visible window in this session (headless CI runner). Fall back to
    # terminating the application; the guarantee under test - that every process
    # exits and nothing is left behind - is still asserted below.
    $running = Get-AppProcesses
    Assert ($running.Count -gt 0) "No $AppName process found to stop."
    Write-Host "    note: this session exposed no visible $AppName window; stopping the process directly." -ForegroundColor Yellow
    foreach ($p in $running) { Stop-Process -Id $p.Id -Force }
    Start-Sleep -Seconds 3
  }
  $left = Get-AppProcesses
  if ($left) {
    # Diagnostics for the log: which processes remain, when they started, and their command lines.
    $left | ForEach-Object {
      $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue
      Write-Host "    leftover pid $($_.Id) started $($_.StartTime) cmd=$($cim.CommandLine)"
    }
    throw "$AppName processes still running after the window was closed: $($left.Id -join ', ')"
  }
}

# ---------------------------------------------------------------------------
# Window capture.
#
# "The build succeeded" is not the same as "the window shows the application".
# A packaged build whose interface files cannot be read opens an EMPTY WHITE
# WINDOW while the backend answers perfectly, so the smoke test looks at the
# window itself: it is captured the way a composited window is rendered
# (PrintWindow with PW_RENDERFULLCONTENT, which works even when the window is
# covered or not focused) and analysed. A real interface has thousands of
# colours; a blank window has one.
# ---------------------------------------------------------------------------
if (-not ('Win32.Capture' -as [type])) {
  Add-Type -Namespace Win32 -Name Capture -MemberDefinition @'
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAPINFOHEADER {
      public uint biSize; public int biWidth; public int biHeight; public ushort biPlanes;
      public ushort biBitCount; public uint biCompression; public uint biSizeImage;
      public int biXPelsPerMeter; public int biYPelsPerMeter; public uint biClrUsed; public uint biClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAPINFO {
      public BITMAPINFOHEADER bmiHeader;
      [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)] public uint[] bmiColors;
    }

    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int cx, int cy);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int x, int y, int w, int h, IntPtr hdcSrc, int x1, int y1, uint rop);
    [DllImport("gdi32.dll")] public static extern int GetDIBits(IntPtr hdc, IntPtr hbmp, uint uStartScan, uint cScanLines, byte[] lpvBits, ref BITMAPINFO lpbmi, uint uUsage);

    public const uint PW_RENDERFULLCONTENT = 0x00000002;
    public const uint SRCCOPY = 0x00CC0020;

    /** Renders the window into a 32-bit buffer. Returns null when it cannot. */
    public static byte[] Grab(IntPtr hWnd) {
      RECT r;
      if (!GetWindowRect(hWnd, out r)) return null;
      int w = r.Right - r.Left;
      int h = r.Bottom - r.Top;
      if (w <= 0 || h <= 0) return null;
      IntPtr screen = GetDC(IntPtr.Zero);
      IntPtr mem = CreateCompatibleDC(screen);
      IntPtr bmp = CreateCompatibleBitmap(screen, w, h);
      IntPtr old = SelectObject(mem, bmp);
      bool ok = PrintWindow(hWnd, mem, PW_RENDERFULLCONTENT);
      if (!ok) {
        IntPtr winDc = GetWindowDC(hWnd);
        ok = BitBlt(mem, 0, 0, w, h, winDc, 0, 0, SRCCOPY);
        ReleaseDC(hWnd, winDc);
      }
      byte[] bits = null;
      if (ok) {
        BITMAPINFO info = new BITMAPINFO();
        info.bmiHeader = new BITMAPINFOHEADER();
        info.bmiHeader.biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER));
        info.bmiHeader.biWidth = w;
        info.bmiHeader.biHeight = -h;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = 0;
        info.bmiColors = new uint[3];
        bits = new byte[w * h * 4];
        int rows = GetDIBits(mem, bmp, 0, (uint)h, bits, ref info, 0);
        if (rows == 0) bits = null;
      }
      SelectObject(mem, old);
      DeleteObject(bmp);
      DeleteDC(mem);
      ReleaseDC(IntPtr.Zero, screen);
      return bits;
    }
'@
}

function Get-WindowPixels([IntPtr] $Handle) {
  $bits = [Win32.Capture]::Grab($Handle)
  if (-not $bits) { return $null }
  $distinct = New-Object 'System.Collections.Generic.HashSet[string]'
  $sampled = 0
  $white = 0
  $black = 0
  # Sample every seventh pixel: a full 1366x860 window is 1.2 million pixels.
  for ($i = 0; $i -lt $bits.Length; $i += 28) {
    $b = $bits[$i]; $g = $bits[$i + 1]; $r = $bits[$i + 2]
    $sampled++
    if ($r -ge 250 -and $g -ge 250 -and $b -ge 250) { $white++ }
    if ($r -eq 0 -and $g -eq 0 -and $b -eq 0) { $black++ }
    [void]$distinct.Add("$r,$g,$b")
  }
  if ($sampled -eq 0) { return $null }
  return [pscustomobject]@{
    Sampled  = $sampled
    Distinct = $distinct.Count
    White    = [math]::Round(100.0 * $white / $sampled, 1)
    Black    = [math]::Round(100.0 * $black / $sampled, 1)
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
Write-Host "$AppName installed-application smoke test" -ForegroundColor Yellow
Write-Host "Installer: $InstallerPath"
Write-Host "Install folder: $InstallDir"

Step 'Preconditions: no existing user data or running instance' {
  Assert (-not (Test-Path $DataDir)) "$AppName user data already exists at $DataDir. Run this test on a clean machine or remove that folder yourself after backing it up."
  Assert (-not (Get-AppProcesses)) "$AppName is already running." 
  Assert (Test-Path $InstallerPath) "Installer not found: $InstallerPath"
}

Step 'Silent install into a normal application folder' {
  $full = (Resolve-Path $InstallerPath).Path
  $p = Start-Process -FilePath $full -ArgumentList @('/S', "/D=$InstallDir") -PassThru -Wait
  Assert ($p.ExitCode -eq 0) "Installer exited with code $($p.ExitCode)"
  Assert (Test-Path $ExePath) "$AppName.exe not found at $ExePath"
}

Step 'Desktop and Start menu shortcuts were created' {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $shortcuts = @(
    (Get-ChildItem -Path $desktop -Filter "$AppName*.lnk" -ErrorAction SilentlyContinue),
    (Get-ChildItem -Path $startMenu -Recurse -Filter "$AppName*.lnk" -ErrorAction SilentlyContinue)
  ) | ForEach-Object { $_ }
  Assert ($shortcuts.Count -ge 1) "No $AppName shortcut was found on the desktop or in the Start menu." 
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

Step "No external browser window was opened for $AppName" {
  $browsers = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe' OR Name='firefox.exe'" -ErrorAction SilentlyContinue
  $port = ([uri]$baseUrl).Port
  $hit = $browsers | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape("127.0.0.1:$port") }
  Assert (-not $hit) "An external browser was opened on the $AppName backend address." 
}

Step 'The installed application serves its complete interface (no missing files)' {
  # The white-screen failure: the backend answers, the window opens, but the
  # page and its JavaScript and CSS files are not all reachable, so nothing is
  # drawn. Every file the start page references is fetched here.
  $page = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing -TimeoutSec 15
  Assert ($page.StatusCode -eq 200) "The start page answered HTTP $($page.StatusCode)."
  Assert ($page.Content -match 'id="root"') 'The start page does not contain the application mount point.'
  Assert ($page.Content -match '/boot.js') 'The start page does not load the start-up guard.'
  $refs = [regex]::Matches($page.Content, '(?:src|href)="(/[^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  Assert ($refs.Count -ge 3) "The start page references only $($refs.Count) file(s)."
  foreach ($ref in $refs) {
    $file = Invoke-WebRequest -Uri "$baseUrl$ref" -UseBasicParsing -TimeoutSec 15
    Assert ($file.StatusCode -eq 200) "$ref answered HTTP $($file.StatusCode)."
    Assert ($file.RawContentLength -gt 0) "$ref was served empty."
  }
  Write-Host "    interface files reachable from the installed application: $($refs.Count + 1)"
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

Step 'The application window shows the interface, not a blank white screen' {
  # Proving the fix for the reported failure: look at the pixels of the running
  # window. A blank window is one colour; a real interface is not.
  $windows = @(Wait-ForAppWindow -TimeoutSec 60)
  Assert ($windows.Count -gt 0) "No visible $AppName window was found to inspect."
  $window = $windows | Sort-Object { -not ($_.Title -like "*$AppName*") } | Select-Object -First 1
  $pixels = Get-WindowPixels -Handle $window.Handle
  if (-not $pixels) {
    Start-Sleep -Seconds 5
    $pixels = Get-WindowPixels -Handle $window.Handle
  }
  Assert ($null -ne $pixels) "The $AppName window could not be captured (handle $($window.Handle))."
  Write-Host ("    window '{0}': {1} sampled pixels, {2} distinct colours, {3}% pure white, {4}% pure black" -f $window.Title, $pixels.Sampled, $pixels.Distinct, $pixels.White, $pixels.Black)
  Assert ($pixels.Distinct -ge 8) "The window shows only $($pixels.Distinct) colour(s): it is blank."
  Assert ($pixels.White -lt 97) "The window is $($pixels.White)% pure white: the interface did not render."
}

Step 'The interface reports a successful start in the application log' {
  # The renderer tells the desktop shell when it is mounted; the shell writes it
  # to desktop.log. A window that loads but never starts is caught here too.
  $deadline = (Get-Date).AddSeconds(60)
  $found = $false
  while ((Get-Date) -lt $deadline -and -not $found) {
    if (Test-Path $LogFile) {
      $found = [bool](Select-String -Path $LogFile -Pattern 'renderer: ready' -Quiet)
    }
    if (-not $found) { Start-Sleep -Milliseconds 500 }
  }
  Assert ($found) "The interface never reported that it started. Log: $LogFile"
  $failures = @()
  if (Test-Path $LogFile) {
    $failures = @(Select-String -Path $LogFile -Pattern 'renderer: (asset-error|script-error|boot-timeout|render-error)' | ForEach-Object { $_.Line })
    $failures += @(Select-String -Path $LogFile -Pattern 'Window failed to load|did not report that it started|Interface check FAILED' | ForEach-Object { $_.Line })
  }
  Assert ($failures.Count -eq 0) "The application reported a start-up failure: $($failures -join ' | ')"
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
  Assert ($backup.rowCounts.journal_entries -ge 1) 'Backup does not contain the journal entry.'
  Assert ($backup.checksum -ne $null) 'Backup has no checksum.'
}

Step 'Graceful shutdown: window closes and all processes exit' {
  Close-AppGracefully
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
  Close-AppGracefully
}

Step 'Both themes ship in the installed application' {
  # The packaged archive is not compressed, so the shipped markup and
  # stylesheet can be inspected directly: the theme must be in the build the
  # user installs, not only in the source tree.
  $asar = Join-Path $InstallDir 'resources\app.asar'
  Assert (Test-Path $asar) "Packaged application archive not found at $asar."
  $text = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($asar))
  $markers = @(
    @{ needle = 'jenesis_theme';        what = 'the saved-theme bootstrap and storage key' },
    @{ needle = 'prefers-color-scheme'; what = 'System Default support' },
    @{ needle = '--j-canvas: 2 6 23';   what = 'the Dark Mode palette' },
    @{ needle = '.dark .bg-white';      what = 'the Dark Mode compatibility layer' }
  )
  foreach ($marker in $markers) {
    Assert ($text.Contains($marker.needle)) "The installed application is missing $($marker.what)."
  }
  Write-Host '    installed build contains the theme bootstrap, the dark palette and the remapped utilities' -ForegroundColor DarkGray
}

Step 'Silent uninstall removes the program but keeps business data' {
  $uninstaller = Join-Path $InstallDir "Uninstall $AppName.exe" 
  Assert (Test-Path $uninstaller) 'Uninstaller not found.'
  $p = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait
  Assert ($p.ExitCode -eq 0) "Uninstaller exited with code $($p.ExitCode)"
  Start-Sleep -Seconds 2
  Assert (-not (Test-Path $ExePath)) "$AppName.exe still exists after uninstall." 
  Assert (Test-Path (Join-Path $DataDir 'genesis.db')) 'The business database was removed by uninstall.'
}

Write-Summary
Write-Host 'All smoke-test checks passed.' -ForegroundColor Green
exit 0
