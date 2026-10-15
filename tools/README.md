# HAL Mail helper (Outlook classic)

A web page cannot open Outlook classic with an attachment by itself. This small helper closes that gap.

**Install (once per Windows user, no administrator rights):** double-click `install-halmail.cmd`.
It copies two small scripts to `%LOCALAPPDATA%\HALMail` and registers a link type `halmail:` for your Windows user only.

**Use:** on the Vessel Files page, press *Draft billing emails*, tick *Outlook classic helper*, then press *Open in Outlook*.
The page saves the draft (.eml) to Downloads and opens a `halmail:` link; the helper opens that draft in Outlook classic
with the table in the body and the Excel attached, then deletes the temporary file. The first time, the browser asks whether
to open the HAL Mail helper; allow it.

**What it will and will not do:** it only opens files named `COST-STORAGE-RENT*.eml` in your Downloads folder whose first line
is `X-Unsent: 1` (an unsent draft). It never sends mail; you review and press Send in Outlook.

**Remove:** double-click `uninstall-halmail.cmd`.
