# HAL Mail helper (Outlook classic)

A web page cannot open Outlook classic with an attachment by itself. This small helper closes that gap.

**Install (once per Windows user, no administrator rights):** double-click `install-halmail.cmd`.
It copies two small scripts to `%LOCALAPPDATA%\HALMail` and registers a link type `halmail:` for your Windows user only.

**Use:** on the Vessel Files page, press *Draft billing emails*, keep *Outlook classic helper* ticked, then press *Open in Outlook*.
The page puts the finished draft on the clipboard and opens `halmail:clip`; the helper reads it and opens it in Outlook classic
with the table in the body and the Excel attached. No file is saved, so a browser set to "ask where to save each file" does not interfere.
The first time, the browser asks whether to open "Microsoft Windows Based Script Host"; tick *Always allow* and open it.
Your clipboard content is replaced by the draft.

**What it will and will not do:** it only opens text that starts with `X-Unsent: 1` (an unsent draft) and contains `X-HAL-Draft: 1`
(or a `COST-STORAGE-RENT*.eml` draft saved in Downloads). It never sends mail; you review and press Send in Outlook.

**Remove:** double-click `uninstall-halmail.cmd`.
