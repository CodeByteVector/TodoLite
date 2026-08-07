@echo off
title TodoLite - Test Start
rem ============================================
rem  TodoLite test launcher
rem  Starts the production app (no dev server,
rem  no browser, no console window from the app).
rem ============================================

set "EXE=%~dp0src-tauri\target\release\todolite.exe"

if not exist "%EXE%" (
  echo Release binary not found: %EXE%
  echo.
  echo Build it first with:  npm run tauri build
  echo.
  pause
  exit /b 1
)

echo Starting TodoLite...
start "" "%EXE%"
exit /b 0