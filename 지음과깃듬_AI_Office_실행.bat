@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or not available in PATH.
  echo Install Node.js with npm, then run this file again.
  pause
  exit /b 1
)

echo Stopping previous server processes...
taskkill /F /IM node.exe /T >nul 2>nul

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "AI Office Browser Launcher" cmd /c "timeout /t 4 /nobreak >nul && start "" http://localhost:5173"

echo Starting Ji-eum AI Office...
call npm run dev

if errorlevel 1 (
  echo The dev server stopped with an error.
  pause
)

endlocal
