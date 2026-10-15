@echo off
REM Double-click to remove the HAL Mail helper.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-halmail.ps1"
echo.
pause
