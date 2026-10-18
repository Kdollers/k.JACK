@echo off
setlocal
title JENESIS - Windows installer builder
cd /d "%~dp0"

echo ============================================================
echo  JENESIS - builds release\JENESIS-Setup-x.x.x.exe
echo  Run this file from the extracted project folder.
echo ============================================================
echo.

echo [1/3] Checking Node.js...
where node >nul 2>nul || (
  echo ERROR: Node.js was not found.
  echo Install Node.js 20 or 22 LTS from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)
node -v

if not exist node_modules (
  echo [2/3] Installing dependencies - first run only, needs internet...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed - see the message above.
    echo If it mentions better-sqlite3, run:  npm rebuild better-sqlite3
    pause
    exit /b 1
  )
) else (
  echo [2/3] Dependencies already present - skipping npm install.
)

echo [3/3] Building the production app and the NSIS installer...
call npm run desktop:dist
if errorlevel 1 (
  echo ERROR: the build failed - see the message above.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  DONE. Your Windows installer is in the release folder
echo  that just opened:  JENESIS-Setup-*.exe
echo  Double-click it to install JENESIS like any Windows app.
echo ============================================================
explorer release
pause
