@echo off
setlocal

cd /d "%~dp0"
set NEXT_IGNORE_INCORRECT_LOCKFILE=1
set AI_ARENA_PORT=3000
if "%OLLAMA_HOST%"=="" set OLLAMA_HOST=http://127.0.0.1:11434

echo.
echo ========================================
echo   AI Arena - local launcher
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

where ollama >nul 2>nul
if not errorlevel 1 (
  echo Checking local Ollama service...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri '%OLLAMA_HOST%/api/tags' -TimeoutSec 2 | Out-Null } catch { Start-Process -WindowStyle Hidden 'ollama' -ArgumentList 'serve' }"
) else (
  echo Ollama CLI was not found on PATH. Local Ollama models will work after Ollama is installed and running.
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  if exist ".env.example" (
    copy ".env.example" ".env.local" >nul
    echo Created .env.local from .env.example.
    echo Add your API keys there when you are ready.
    echo.
  )
)

echo Closing old AI Arena dev servers, if any...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$cwd=(Get-Location).Path; Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($cwd) -and ($_.CommandLine.Contains('next') -or $_.CommandLine.Contains('npm-cli.js') -or $_.CommandLine.Contains('npx-cli.js')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

if exist ".next" (
  echo Clearing Next.js cache...
  rmdir /s /q ".next"
)

echo Starting AI Arena...
echo The app will open at http://localhost:%AI_ARENA_PORT%
echo Keep this window open while using the app.
echo.

start "" "http://localhost:%AI_ARENA_PORT%"
call npx next dev -p %AI_ARENA_PORT%

echo.
echo AI Arena stopped.
pause
