# HAL Mail helper: opens a billing-email draft (.eml) in Outlook CLASSIC.
# Called by halmail.vbs for these links:
#   halmail:clip                          the draft text is on the clipboard (no file, no Save As dialog)
#   halmail:open?f=COST-STORAGE-RENT*.eml a draft already saved in the Downloads folder
# Safety: it only accepts text that starts with the header "X-Unsent: 1" (an unsent draft) and, for the clipboard
# mode, also contains "X-HAL-Draft: 1". It never sends anything; the person presses Send in Outlook.
param([string]$Uri)
$ErrorActionPreference = 'Stop'

function Show-Problem([string]$msg) {
    try { (New-Object -ComObject WScript.Shell).Popup($msg, 20, 'HAL Mail helper', 48) | Out-Null } catch {}
}

try {
    $outlook = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE' -ErrorAction SilentlyContinue).'(default)'
    if (-not $outlook -or -not (Test-Path -LiteralPath $outlook)) { throw 'Outlook (classic) was not found on this PC.' }

    $temp = $null          # file we created and must remove afterwards
    if ($Uri -match '^halmail:(//)?clip/?$') {
        $text = $null
        for ($i = 0; $i -lt 12 -and -not $text; $i++) {
            try { $text = Get-Clipboard -Raw } catch { $text = $null }
            if (-not $text) { Start-Sleep -Milliseconds 300 }
        }
        if (-not $text) { throw 'The clipboard is empty. Press Open in Outlook again.' }
        if ($text.Length -gt 8000000) { throw 'The clipboard content is too large.' }
        if (-not $text.StartsWith('X-Unsent: 1') -or $text -notmatch "(?m)^X-HAL-Draft: 1\r?$") {
            throw 'The clipboard does not hold a HAL email draft. Press Open in Outlook again.'
        }
        $dir = Join-Path $env:TEMP 'HALMail'
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $path = Join-Path $dir ('draft_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff') + '.eml')
        [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false)))
        $temp = $path
    }
    elseif ($Uri -match '^halmail:(//)?open\?f=(COST-STORAGE-RENT[A-Za-z0-9._\-]{0,180}\.eml)/?$') {
        $name = $Matches[2]
        $downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
        $path = Join-Path $downloads $name
        $deadline = (Get-Date).AddSeconds(40); $last = -1
        while ((Get-Date) -lt $deadline) {      # wait until the browser has finished writing the file
            if (Test-Path -LiteralPath $path) {
                $len = (Get-Item -LiteralPath $path).Length
                if ($len -gt 0 -and $len -eq $last) { break }
                $last = $len
            }
            Start-Sleep -Milliseconds 400
        }
        if (-not (Test-Path -LiteralPath $path)) { throw "The draft file was not found in Downloads: $name" }
        if ((Get-Content -LiteralPath $path -TotalCount 1) -ne 'X-Unsent: 1') { throw 'That file is not a HAL email draft.' }
        $temp = $path
    }
    else { throw 'Unrecognised link.' }

    Start-Process -FilePath $outlook -ArgumentList '/eml', ('"' + $temp + '"')

    # the draft is loaded into Outlook; remove the temporary file a little later
    Start-Sleep -Seconds 25
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
catch {
    Show-Problem ($_.Exception.Message)
}
