/* หน้า คำนวณด่วน */
const locSel=$("q-loc");
["BKK","UTCT","LCH"].forEach(a=>{
  const g=document.createElement("optgroup"); g.label=a;
  LOCS.filter(l=>l.area===a).forEach(l=>{ const o=document.createElement("option"); o.value=l.code; o.textContent=l.name; g.appendChild(o); });
  locSel.appendChild(g);
});
locSel.value="BKK04";

function quick(){
  const loc=locSel.value, size=document.querySelector("input[name=size]:checked").value;
  const cargo=document.querySelector("input[name=cargo]:checked").value;
  const dg=cargo==="DG", rf=cargo==="RF", key=custKey(cargo,size);
  const din=dayFromISO($("q-in").value), etd=dayFromISO($("q-etd").value);
  const qty=Math.max(1, parseInt($("q-qty").value)||1);
  const ftIn=$("q-sft").value.trim(), ftDef=custFtOf(cargo);
  $("q-sft").placeholder = `ปกติ ${ftDef} วัน`;
  const ftSet = ftIn!=="" && Number(ftIn)>=0;
  const ft = ftSet ? parseInt(ftIn)||0 : ftDef;
  const valid = din!=null && etd!=null && etd>=din;
  const stay = valid ? etd-din+1 : null;
  const days = valid ? Math.max(stay-ft,0) : 0;
  const stor = custCharge(key,days), elec = rf ? days*ELECTRIC_RF[size] : 0, per = stor+elec;

  $("r-total").innerHTML = `${money(per*qty)}<small>THB</small>`;
  $("r-note").textContent = (din==null||etd==null) ? "ใส่วันตู้เข้าและ ETD เพื่อเริ่มคำนวณ"
    : !valid ? "ตรวจวันที่: ETD ต้องไม่ก่อนวันตู้เข้า"
    : qty>1 ? `${money(per)} บาท/ตู้ × ${qty} ตู้` : days>0 ? "เกิน free time" : "ยังอยู่ใน free time ไม่มีค่าใช้จ่าย";
  const L=LOCS.find(l=>l.code===loc);
  $("r-chips").innerHTML = `<span class="chip">${L.area} · ${esc(L.name)}</span><span class="chip">${size}</span>`
    + (dg?'<span class="chip dg">DG</span>':rf?'<span class="chip rf">RF</span>':`<span class="chip">${esc(cargo)}</span>`)
    + (ftSet?'<span class="chip acc">Free Time กรอกเอง</span>':'');
  $("r-stay").textContent = valid ? `${stay} วัน` : "–";
  $("r-ft").textContent = `${ft} วัน`;
  $("r-days").textContent = valid ? `${days} วัน` : "–";
  $("r-freeuntil").textContent = din!=null ? (ft>0 ? `${dow(din+ft-1)} ${fmtDay(din+ft-1)}` : "ไม่มี free time") : "–";

  let html="";
  if(valid && days>0){
    custBreakdown(key,days).forEach(b=>{ html+=`<tr><td>วันคิดเงินที่ ${b.from}${b.to>b.from?"–"+b.to:""} <span class="total-note">· ${b.n} วัน × ${money(b.rate)}</span></td><td class="num">${money(b.amt)}</td></tr>`; });
    if(elec) html+=`<tr><td>Electric charge (RF) <span class="total-note">· ${days} วัน × ${money(ELECTRIC_RF[size])}</span></td><td class="num">${money(elec)}</td></tr>`;
  } else if(valid){
    html=`<tr><td class="total-note">อยู่ภายใน free time ${ft} วัน · ไม่มีค่า storage</td><td></td></tr>`;
  }
  $("r-brk").innerHTML=html;

  // strip: gate-in options
  $("s-etd").textContent = etd!=null ? fmtDay(etd) : "–";
  if(etd==null){ $("s-bars").innerHTML=""; return; }
  const span = Math.max(ft+10, valid?stay:0, 14);
  const vals=[]; for(let k=span-1;k>=0;k--){ const d=etd-k, st=k+1, ds=Math.max(st-ft,0); vals.push({d,st,ds,amt:custCharge(key,ds)+(rf?ds*ELECTRIC_RF[size]:0)}); }
  const max=Math.max(...vals.map(v=>v.amt),1);
  $("s-bars").innerHTML = vals.map(v=>{
    const cls=(v.ds>0?"paid":"free")+(v.d===din?" sel":"");
    const w = v.ds>0 ? Math.max(v.amt/max*100,2) : 100;
    return `<div class="bar ${cls}"><span class="d">${dow(v.d)} ${fmtDay(v.d,true)} · ${v.st}ว</span><span class="track"><span class="fill" style="width:${w}%"></span></span><span class="a">${v.ds>0?money(v.amt):"ฟรี"}</span></div>`;
  }).join("");
}
$("qform").addEventListener("input",quick);
$("qform").addEventListener("change",quick);
$("qform").addEventListener("submit",e=>e.preventDefault());
quick();
