@echo off
REM Double-click to install the HAL Mail helper (opens billing-email drafts in Outlook classic).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-halmail.ps1"
echo.
pause
