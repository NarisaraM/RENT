/* Billing emails: one Outlook draft (.eml) per booking, with the customer-facing table in the body
   and a matching Excel file attached. Nothing is sent from the page: the person reviews and presses Send in Outlook. */
const MAIL_TO = new Map(), MAIL_CC = new Map();   // booking -> text typed into the To / Cc boxes
let MAIL_DRAFTS = [];
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
const INTERNAL_DOMAIN = "heungaline.co.th";   // HAL's own addresses go to Cc, customers to To

const emailsIn = text => { const seen = new Set(), out = []; for (const e of String(text ?? "").match(EMAIL_RE) || []) { const k = e.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); } } return out; };
const isInternal = e => e.toLowerCase().endsWith("@" + INTERNAL_DOMAIN);
const voyLabel = v => /^V\./i.test(String(v ?? "")) ? String(v) : `V.${v ?? ""}`;
const dateOrBlank = n => n == null ? "" : fmtDay(n);
const safeName = s => String(s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/* ---------------------------------------------------------------- data */
function remarksFor(r) {
  const out = [];
  if (r.cDays > 0) out.push(`Storage Rent ${r.cDays} Day${r.cDays > 1 ? "s" : ""} = ${money(custCharge(custKey(r.dg ? "DG" : "GP", r.size), r.cDays))}THB`);
  if (r.cElecDays > 0) out.push(`Electric ${r.cElecDays} Day${r.cElecDays > 1 ? "s" : ""} = ${money(r.cElecDays * ELECTRIC_RF[r.size])}THB`);
  return out;
}
function rowCells(r) {
  const cargo = r.dg ? "DG" : r.rf ? "RF" : "GP", b = r._b || [], l = r._r || [];
  return {cntr: r.cntr, bk: r.bkno || "", shipper: r.shipper || "", org: String(b[27] ?? ""), pol: String(r.pol ?? ""), pod: String(b[18] ?? l[8] ?? ""),
    type: `1X${r.size}${cargo}`, vsl: r.vsl || "", voy: voyLabel(r.voyNo),
    orig: dateOrBlank(r.custEtd ?? r.orig), first: dateOrBlank(r.allow), ret: dateOrBlank(r.din), remarks: remarksFor(r)};
}
function rateText(rows) {
  const groups = new Map();
  for (const r of rows) {
    const cargo = r.dg ? "DG" : r.rf ? "RF" : "GP", label = `${r.size}${cargo}`, g = groups.get(label) || {key: custKey(cargo, r.size), max: 0};
    g.max = Math.max(g.max, r.cDays); groups.set(label, g);
  }
  const parts = [...groups].map(([label, g]) => {
    const ts = CUST_RATES[g.key];
    return {label, used: ts.map((t, i) => ({t, end: i + 1 < ts.length ? ts[i + 1][0] - 1 : null})).filter(x => x.t[0] <= Math.max(g.max, 1))};
  });
  if (parts.length === 1 && parts[0].used.length === 1) return `[${money(parts[0].used[0].t[1])}THB/CNTR/DAY]`;
  return "[" + parts.map(p => `${p.label}: ` + p.used.map(u => `${money(u.t[1])}THB/CNTR/DAY (day ${u.t[0]}${u.end ? "–" + u.end : "+"})`).join(", ")).join("; ") + "]";
}

/* One draft per booking, only containers that actually owe something and have a CUST ETD */
function mailDrafts() {
  const by = new Map(); let noEtd = 0;
  for (const r of allRows()) {
    if (r.cStay == null) { noEtd++; continue; }
    if (!(r.cCharge > 0)) continue;
    const k = r.bkno || `${r.file}|${r.cntr}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const drafts = [...by].map(([key, rows]) => {
    rows.sort((a, b) => String(a.cntr).localeCompare(String(b.cntr)));
    const r0 = rows[0], found = emailsIn(rows.flatMap(r => r._b || []).join(" ; "));   // booking list row only
    return {key, bkno: r0.bkno || "", shipper: r0.shipper || "", vsl: r0.vsl || "", voy: voyLabel(r0.voyNo), rows,
      total: rows.reduce((s, r) => s + r.cCharge, 0), to0: found.filter(e => !isInternal(e)), cc0: found.filter(isInternal),
      subject: `COST STORAGE RENT OF VSL : ${r0.vsl || ""} ${voyLabel(r0.voyNo)} // ${r0.shipper || ""} // ${r0.bkno || ""}`};
  });
  return {drafts, noEtd};
}
const toOf = d => MAIL_TO.has(d.key) ? MAIL_TO.get(d.key) : d.to0.join(", ");
const ccOf = d => MAIL_CC.has(d.key) ? MAIL_CC.get(d.key) : d.cc0.join(", ");

/* ---------------------------------------------------------------- body (HTML, mirrors the usual HAL notice) */
function mailBodyHtml(d) {
  const th = (t, color) => `<th style="border:1px solid #000;background:#BDE0F5;padding:4px 6px;text-align:center;font-size:10pt;font-weight:bold;${color ? "color:" + color + ";" : ""}">${esc(t)}</th>`;
  const td = h => `<td style="border:1px solid #000;padding:4px 6px;text-align:center;vertical-align:middle;font-size:10pt">${h}</td>`;
  const rows = d.rows.map(r => {
    const c = rowCells(r);
    return `<tr>${[c.cntr, c.bk, c.shipper, c.org, c.pol, c.pod, c.type, c.vsl, c.voy, c.orig, c.first, c.ret].map(v => td(esc(v))).join("")}${td(c.remarks.map(esc).join("<br>"))}</tr>`;
  }).join("");
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000">
<p><b>DEAR CUSTOMER,</b></p>
<p><b>COST STORAGE RENT DETAIL AS BELOW.</b></p>
<p style="color:#0000FF">Please advise your company name, address, and Tax ID for issue Invoice.</p>
<ul><li><b><span style="background:#FFFF00">TOTAL COST STORAGE RENT =&nbsp; ${money(d.total)} THB</span></b>&nbsp; ${esc(rateText(d.rows))}</li></ul>
<table style="border-collapse:collapse;width:auto"><thead><tr>${th("Container No.")}${th("Booking No.")}${th("Shipper")}${th("Org Shipper")}${th("POL")}${th("POD")}${th("Type Size")}${th("Vessel")}${th("Voyage")}${th("Original Schedule", "#C00000")}${th("1st Date Return", "#C00000")}${th("Return Date", "#0000FF")}${th("Remarks")}</tr></thead><tbody>${rows}</tbody></table>
</div>`;
}
function mailBodyText(d) {
  return ["DEAR CUSTOMER,", "", "COST STORAGE RENT DETAIL AS BELOW.", "", "Please advise your company name, address, and Tax ID for issue Invoice.", "",
    `TOTAL COST STORAGE RENT = ${money(d.total)} THB ${rateText(d.rows)}`, "",
    ...d.rows.map(r => { const c = rowCells(r); return [c.cntr, c.bk, c.shipper, c.org, c.pol, c.pod, c.type, c.vsl, c.voy, c.orig, c.first, c.ret, c.remarks.join(" / ")].join("\t"); })].join("\n");
}

/* ---------------------------------------------------------------- attachment: customer-facing Excel (no internal columns) */
function customerXlsx(d) {
  const head = ["Container No.", "Booking No.", "Shipper", "Org Shipper", "POL", "POD", "Type Size", "Vessel", "Voyage", "Original Schedule", "1st Date Return", "Return Date", "Remarks", "Amount (THB)"];
  const body = d.rows.map(r => { const c = rowCells(r); return [c.cntr, c.bk, c.shipper, c.org, c.pol, c.pod, c.type, c.vsl, c.voy, c.orig, c.first, c.ret, c.remarks.join(" / "), r.cCharge]; });
  const tot = Array(14).fill(""); tot[0] = "TOTAL COST STORAGE RENT"; tot[13] = d.total;
  const ws = XLSX.utils.aoa_to_sheet([head, ...body, tot]);
  for (let i = 1; i <= body.length + 1; i++) { const a = ws[XLSX.utils.encode_cell({r: i, c: 13})]; if (a) a.z = "#,##0"; }
  ws["!cols"] = [16, 20, 30, 28, 8, 8, 10, 18, 10, 14, 14, 14, 34, 14].map(wch => ({wch}));
  styleGrid(ws, {head: 0, total: body.length + 1});
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Storage Rent");
  return new Uint8Array(XLSX.write(wb, {bookType: "xlsx", type: "array"}));
}

/* ---------------------------------------------------------------- .eml (opens in Outlook as an unsent draft) */
const utf8 = s => new TextEncoder().encode(s);
function b64(bytes, wrap = true) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const out = btoa(s); return wrap ? out.replace(/.{76}/g, "$&\r\n") : out;
}
function headerWord(s) {   // RFC 2047 for non-ASCII subjects, folded in short chunks
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const chars = [...s], parts = []; for (let i = 0; i < chars.length; i += 16) parts.push(`=?UTF-8?B?${b64(utf8(chars.slice(i, i + 16).join("")), false)}?=`);
  return parts.join("\r\n ");
}
function buildEml(d, to, cc, xlsx, xlsxName) {
  const bd = "----=_HAL_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const html = `<html><head><meta charset="utf-8"></head><body>${mailBodyHtml(d)}</body></html>`;
  return [
    "X-Unsent: 1",
    ...(to ? ["To: " + to] : []), ...(cc ? ["Cc: " + cc] : []),
    "Subject: " + headerWord(d.subject), "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${bd}"`, "",
    "--" + bd, 'Content-Type: text/html; charset="utf-8"', "Content-Transfer-Encoding: base64", "", b64(utf8(html)),
    "--" + bd, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${xlsxName}"`,
    "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${xlsxName}"`, "", b64(xlsx),
    "--" + bd + "--", ""].join("\r\n");
}
const draftFiles = d => { const base = safeName(`COST-STORAGE-RENT_${d.vsl}_${d.voy}_${d.bkno}`) || "COST-STORAGE-RENT"; return {eml: base + ".eml", xlsx: base + ".xlsx"}; };

async function saveBlob(name, blob, st) {
  const inViewer = !!window.claude?.use, dl = inViewer ? await getDownloads() : null;
  if (dl) {
    try { await dl.save({filename: name, data: blob}); return true; }
    catch (e) { const c = e && e.code; st.textContent = c === "declined" ? `Save cancelled: ${name}` : c === "rate_limited" ? "A save dialog is already open. Try again in a moment" : "This page cannot save files. Open the app on GitHub Pages instead"; return false; }
  }
  if (inViewer) { st.textContent = "This page cannot save files. Open the app on GitHub Pages instead"; return false; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); return true;
}
async function saveDraft(d, st) {
  const to = emailsIn(toOf(d)).join(", "), cc = emailsIn(ccOf(d)).join(", "), f = draftFiles(d);
  const eml = buildEml(d, to, cc, customerXlsx(d), f.xlsx);
  return saveBlob(f.eml, new Blob([eml], {type: "message/rfc822"}), st);
}

/* ---------------------------------------------------------------- panel */
function renderMail() {
  const box = $("f-mail"); if (!box) return;
  box.hidden = !MAIL_ON;
  if (!MAIL_ON) { box.innerHTML = ""; return; }
  const {drafts, noEtd} = mailDrafts(); MAIL_DRAFTS = drafts;
  const noTo = drafts.filter(d => !emailsIn(toOf(d)).length).length;
  const rows = drafts.map(d => `<tr data-k="${esc(d.key)}">
      <td class="mono">${esc(d.bkno)}</td><td class="shp" title="${esc(d.shipper)}">${esc(d.shipper)}</td>
      <td class="r num">${d.rows.length}</td><td class="r num amt">${money(d.total)}</td>
      <td><input class="mto ${emailsIn(toOf(d)).length ? "" : "miss"}" type="text" value="${esc(toOf(d))}" placeholder="No email found in the Booking list" aria-label="To for ${esc(d.bkno)}"></td>
      <td><input class="mcc" type="text" value="${esc(ccOf(d))}" placeholder="Cc" aria-label="Cc for ${esc(d.bkno)}"></td>
      <td><div class="mact"><button class="btn sm m-prev" type="button">Preview</button><button class="btn sm m-copy" type="button">Copy body</button><button class="btn sm primary m-eml" type="button">Open in Outlook</button></div></td></tr>`).join("");
  box.innerHTML = `<div class="section-h"><h2>Billing emails</h2>
      <div class="tools"><span class="total-note" id="m-status" aria-live="polite"></span>${drafts.length ? `<button class="btn primary" type="button" id="m-all">Download all (.eml)</button>` : ""}</div></div>
    <p class="total-note mnote">One draft per booking, listing only containers with a charge. "Open in Outlook" saves a draft (.eml); open that file and Outlook shows an unsent email with the table and an Excel file attached. Check To / Cc, then press Send in Outlook. Nothing is sent from this page.</p>
    ${drafts.length ? `<div class="scroll"><table class="grid mailt"><thead><tr><th>Booking</th><th>Shipper</th><th class="r">Cntrs</th><th class="r">Total THB</th><th>To</th><th>Cc</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="total-note" style="margin-top:8px">${noTo ? `<b class="miss">${noTo} draft${noTo > 1 ? "s have" : " has"} no recipient.</b> ` : ""}${noEtd ? `${noEtd} container${noEtd > 1 ? "s have" : " has"} no CUST ETD and ${noEtd > 1 ? "are" : "is"} left out. ` : ""}Addresses are read from the Booking list; HAL (${INTERNAL_DOMAIN}) addresses go to Cc.</p>`
    : `<p class="empty">No containers with a customer charge yet.${noEtd ? ` ${noEtd} container${noEtd > 1 ? "s have" : " has"} no CUST ETD; enter the dates in the table.` : ""}</p>`}
    <div id="m-prev"></div>`;

  const st = $("m-status"), find = tr => MAIL_DRAFTS.find(d => d.key === tr.dataset.k);
  box.querySelectorAll("tbody tr").forEach(tr => {
    tr.querySelector(".mto").oninput = e => { MAIL_TO.set(tr.dataset.k, e.target.value); e.target.classList.toggle("miss", !emailsIn(e.target.value).length); };
    tr.querySelector(".mcc").oninput = e => MAIL_CC.set(tr.dataset.k, e.target.value);
    tr.querySelector(".m-eml").onclick = async () => {
      const d = find(tr); st.textContent = "";
      if (await saveDraft(d, st)) st.textContent = `Saved ${draftFiles(d).eml}. Open it to get the Outlook draft`;
    };
    tr.querySelector(".m-prev").onclick = () => {
      const d = find(tr);
      $("m-prev").innerHTML = `<div class="mprev"><div class="mprev-h"><b>To:</b> ${esc(emailsIn(toOf(d)).join(", ") || "(none)")}<br><b>Cc:</b> ${esc(emailsIn(ccOf(d)).join(", ") || "(none)")}<br><b>Subject:</b> ${esc(d.subject)}<br><b>Attachment:</b> ${esc(draftFiles(d).xlsx)}</div>${mailBodyHtml(d)}</div>`;
      $("m-prev").scrollIntoView({behavior: "smooth", block: "nearest"});
    };
    tr.querySelector(".m-copy").onclick = async () => {
      const d = find(tr), html = mailBodyHtml(d);
      try {
        await navigator.clipboard.write([new ClipboardItem({"text/html": new Blob([html], {type: "text/html"}), "text/plain": new Blob([mailBodyText(d)], {type: "text/plain"})})]);
        st.textContent = "Body copied. Paste it into an Outlook email";
      } catch (e) { st.textContent = "Copy is not available here. Use Open in Outlook instead"; }
    };
  });
  const all = $("m-all");
  if (all) all.onclick = async () => {
    st.textContent = ""; let n = 0;
    for (const d of MAIL_DRAFTS) { if (!await saveDraft(d, st)) break; n++; }
    if (n) st.textContent = `Saved ${n} draft${n > 1 ? "s" : ""}. Open them to get the Outlook drafts`;
  };
}
