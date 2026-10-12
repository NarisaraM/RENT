/* หน้า คำนวณด่วน */
const locSel=$("q-loc");
["BKK","UTCT","LCH"].forEach(a=>{
  const g=document.createElement("optgroup"); g.label=a;
  LOCS.filter(l=>l.area===a).forEach(l=>{ const o=document.createElement("option"); o.value=l.code; o.textContent=l.name; g.appendChild(o); });
  locSel.appendChild(g);
});
locSel.value="BKK04";

// ISO 6346: check digit of a container number (owner code + U + 6-digit serial)
function iso6346Check(code){
  const val=c=>{ if(/\d/.test(c)) return +c; let v=10+c.charCodeAt(0)-65; return v+Math.floor((v-1)/10); }; // skips 11, 22, 33
  const sum=[...code].reduce((s,c,i)=>s+val(c)*2**i,0);
  return sum%11%10;
}
// ISO size/type code for the plate on the blue band (e.g. 22G1 = 20' general purpose)
const ISO_TYPE={GP:"G1",DG:"G1",FLEXIBAG:"G1",RF:"R1",OOG:"U1",TK:"T1"};
function plate(size,cargo){
  const d=new Date(), serial=String(d.getFullYear()%100).padStart(2,"0")+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
  const owner="HALU"+serial;
  $("q-ctrno").textContent=`HALU ${serial} ${iso6346Check(owner)}`;
  $("q-iso").textContent=(size==="20'"?"22":"45")+ISO_TYPE[cargo];
}

function quick(){
  const loc=locSel.value, size=document.querySelector("input[name=size]:checked").value;
  const cargo=document.querySelector("input[name=cargo]:checked").value;
  const dg=cargo==="DG", rf=cargo==="RF", key=custKey(cargo,size);
  plate(size,cargo);
  const din=dayFromISO($("q-in").value), etd=dayFromISO($("q-etd").value);
  const qty=Math.max(1, parseInt($("q-qty").value)||1);
  const ftIn=$("q-sft").value.trim(), ftDef=custFtOf(cargo);
  $("q-sft").placeholder = `Default ${ftDef} days`;
  const ftSet = ftIn!=="" && Number(ftIn)>=0;
  const ft = ftSet ? parseInt(ftIn)||0 : ftDef;
  const valid = din!=null && etd!=null && etd>=din;
  const stay = valid ? etd-din+1 : null;
  const days = valid ? Math.max(stay-ft,0) : 0;
  const stor = custCharge(key,days), elec = rf ? days*ELECTRIC_RF[size] : 0, per = stor+elec;

  $("r-total").innerHTML = `${money(per*qty)}<small>THB</small>`;
  $("r-note").textContent = (din==null||etd==null) ? "Enter the gate-in date and ETD to calculate"
    : !valid ? "Check the dates: ETD cannot be before gate-in"
    : qty>1 ? `${money(per)} THB/container × ${qty} containers` : days>0 ? "Over free time" : "Within free time, no charge";
  const L=LOCS.find(l=>l.code===loc);
  $("r-chips").innerHTML = `<span class="chip">${L.area} · ${esc(L.name)}</span><span class="chip">${size}</span>`
    + (dg?'<span class="chip dg">DG</span>':rf?'<span class="chip rf">RF</span>':`<span class="chip">${esc(cargo)}</span>`)
    + (ftSet?'<span class="chip acc">Free Time entered</span>':'');
  $("r-stay").textContent = valid ? `${stay} days` : "–";
  $("r-ft").textContent = `${ft} days`;
  $("r-days").textContent = valid ? `${days} days` : "–";
  $("r-freeuntil").textContent = din!=null ? (ft>0 ? `${dow(din+ft-1)} ${fmtDay(din+ft-1)}` : "No free time") : "–";

  let html="";
  if(valid && days>0){
    custBreakdown(key,days).forEach(b=>{ html+=`<tr><td>Chargeable day${b.to>b.from?"s":""} ${b.from}${b.to>b.from?"–"+b.to:""} <span class="total-note">· ${b.n} day${b.n>1?"s":""} × ${money(b.rate)}</span></td><td class="num">${money(b.amt)}</td></tr>`; });
    if(elec) html+=`<tr><td>Electric charge (RF) <span class="total-note">· ${days} day${days>1?"s":""} × ${money(ELECTRIC_RF[size])}</span></td><td class="num">${money(elec)}</td></tr>`;
  } else if(valid){
    html=`<tr><td class="total-note">Within ${ft} days free time · no storage charge</td><td></td></tr>`;
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
    return `<div class="bar ${cls}"><span class="d">${dow(v.d)} ${fmtDay(v.d,true)} · ${v.st}d</span><span class="track"><span class="fill" style="width:${w}%"></span></span><span class="a">${v.ds>0?money(v.amt):"Free"}</span></div>`;
  }).join("");
}
$("qform").addEventListener("input",quick);
$("qform").addEventListener("change",quick);
$("qform").addEventListener("submit",e=>e.preventDefault());
quick();
