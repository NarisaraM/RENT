# HAL Mail helper: opens a billing-email draft (.eml) from the Downloads folder in Outlook CLASSIC.
# Called by halmail.vbs for links like  halmail:open?f=COST-STORAGE-RENT_xxx.eml
# Safety: only accepts COST-STORAGE-RENT*.eml in Downloads whose first line is "X-Unsent: 1" (an unsent draft).
# It never sends anything; the person presses Send in Outlook.
param([string]$Uri)
$ErrorActionPreference = 'Stop'

function Show-Problem([string]$msg) {
    try { (New-Object -ComObject WScript.Shell).Popup($msg, 20, 'HAL Mail helper', 48) | Out-Null } catch {}
}

try {
    if ($Uri -notmatch '^halmail:(//)?open\?f=(COST-STORAGE-RENT[A-Za-z0-9._\-]{0,180}\.eml)/?$') { throw 'Unrecognised link.' }
    $name = $Matches[2]

    $downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
    $path = Join-Path $downloads $name

    # wait until the browser has finished writing the file (size stops changing)
    $deadline = (Get-Date).AddSeconds(40); $last = -1
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $path) {
            $len = (Get-Item -LiteralPath $path).Length
            if ($len -gt 0 -and $len -eq $last) { break }
            $last = $len
        }
        Start-Sleep -Milliseconds 400
    }
    if (-not (Test-Path -LiteralPath $path)) { throw "The draft file was not found in Downloads: $name" }

    $first = Get-Content -LiteralPath $path -TotalCount 1
    if ($first -ne 'X-Unsent: 1') { throw 'That file is not a HAL email draft.' }

    $outlook = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE' -ErrorAction SilentlyContinue).'(default)'
    if (-not $outlook -or -not (Test-Path -LiteralPath $outlook)) { throw 'Outlook (classic) was not found on this PC.' }

    Start-Process -FilePath $outlook -ArgumentList '/eml', ('"' + $path + '"')

    # the draft is loaded into Outlook; remove the temporary file a little later
    Start-Sleep -Seconds 25
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
}
catch {
    Show-Problem ($_.Exception.Message)
}
