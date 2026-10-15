' HAL Mail helper launcher: runs halmail.ps1 without a visible console window.
' Only a strictly formatted link is accepted, anything else is ignored.
Option Explicit
Dim arg, re, sh, ps1, cmd
If WScript.Arguments.Count < 1 Then WScript.Quit 1
arg = WScript.Arguments(0)
Set re = New RegExp
re.Pattern = "^halmail:(//)?open\?f=COST-STORAGE-RENT[A-Za-z0-9._-]*\.eml/?$"
re.IgnoreCase = True
If Not re.Test(arg) Then WScript.Quit 2
ps1 = Left(WScript.ScriptFullName, Len(WScript.ScriptFullName) - 4) & ".ps1"
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ """ & arg & """"
Set sh = CreateObject("WScript.Shell")
sh.Run cmd, 0, False
