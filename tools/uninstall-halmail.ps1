# Removes the HAL Mail helper (link type and copied files) for the current Windows user.
$ErrorActionPreference = 'SilentlyContinue'
Remove-Item -Path 'HKCU:\Software\Classes\halmail' -Recurse -Force
Remove-Item -Path (Join-Path $env:LOCALAPPDATA 'HALMail') -Recurse -Force
Write-Host 'HAL Mail helper removed.'
