@echo off
cd /d "%~dp0"
echo Stopping previous server processes...
taskkill /F /IM node.exe /T >nul 2>nul
start "AI Office Browser Launcher" cmd /c "timeout /t 4 /nobreak >nul && start "" http://localhost:5173"
npm run dev
