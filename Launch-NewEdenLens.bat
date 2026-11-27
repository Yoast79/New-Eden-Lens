@echo off
title New Eden Lens
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting New Eden Lens...
call npm run dev
if errorlevel 1 (
  echo.
  echo New Eden Lens exited with an error.
  pause
)

