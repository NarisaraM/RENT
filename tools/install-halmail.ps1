# Installs the HAL Mail helper for the current Windows user (no administrator rights needed).
#  1. copies halmail.vbs / halmail.ps1 to %LOCALAPPDATA%\HALMail
#  2. registers the link type  halmail:  for this user only (HKCU\Software\Classes\halmail)
# Remove it again with uninstall-halmail.cmd.
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$dst = Join-Path $env:LOCALAPPDATA 'HALMail'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -LiteralPath (Join-Path $src 'halmail.vbs') -Destination $dst -Force
Copy-Item -LiteralPath (Join-Path $src 'halmail.ps1') -Destination $dst -Force

$vbs = Join-Path $dst 'halmail.vbs'
$root = 'HKCU:\Software\Classes\halmail'
New-Item -Path $root -Force | Out-Null
Set-ItemProperty -Path $root -Name '(default)' -Value 'URL:HAL Mail helper'
New-ItemProperty -Path $root -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$root\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$root\shell\open\command" -Name '(default)' -Value ('wscript.exe //B //Nologo "' + $vbs + '" "%1"')

if (-not (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE' -ErrorAction SilentlyContinue)) {
    Write-Host 'Warning: Outlook (classic) was not found on this PC.'
}
Write-Host "HAL Mail helper installed in $dst"
