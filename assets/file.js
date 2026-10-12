/* หน้า คำนวณจากไฟล์เรือ */
/* ------------------------------------------------------------------ file mode */
// รับได้ทั้งไฟล์ดิบจากระบบ LOAD / BKG / GATE (.xls) และไฟล์ TEMPLATE ที่มีชีท 1.Loading 2.Bookinglist 3.GateMove
let SOURCES=[];            // {name, kind, loading, booking, gate, manual, info, error}
let ROWS=[], WARNINGS=[];
const OVERRIDES=new Map(); // `${file}|${cntr}` -> F/T ที่แก้ในตาราง
const CUST_ETD_OVR=new Map(); // `${file}|${cntr}` -> CUST ETD (day number) ที่แก้ในตาราง
let CUST_CALC=false;          // กดปุ่มคำนวณค่า Storage ลูกค้าแล้ว
let AREA_FILTER="ALL", ONLY_PAID=false, QUERY="";
let BKG_HEAD=[], GATE_HEAD=[];  // header rows kept for export
const KIND_LABEL={LOAD:"Loading",BKG:"Booking",GATE:"Gate move",TEMPLATE:"Template"};

function sheetRows(wb,name){ return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null}); }
const clean = rows => rows.filter(r=>r&&r[0]!=null&&String(r[0]).trim()!=="");

function classify(wb,name){
  const src={name,kind:null,loading:[],booking:[],gate:[],manual:{},info:""};
  if(["1.Loading","2.Bookinglist","3.GateMove"].every(s=>wb.SheetNames.includes(s))){
    src.kind="TEMPLATE";
    src.loading=clean(sheetRows(wb,"1.Loading").slice(1));
    src.booking=clean(sheetRows(wb,"2.Bookinglist").slice(1));
    src.gate=clean(sheetRows(wb,"3.GateMove").slice(1));
    BKG_HEAD=(sheetRows(wb,"2.Bookinglist")[0]||[]).filter(v=>v!=null); GATE_HEAD=sheetRows(wb,"3.GateMove")[0]||GATE_HEAD;
    if(wb.SheetNames.includes("CS")){
      const ws=wb.Sheets["CS"], cs=sheetRows(wb,"CS");
      for(let i=2;i<cs.length;i++){ const r=cs[i]; if(!r||!r[0]) continue;
        const y=ws["Y"+(i+1)];
        src.manual[r[0]]={orig:r[18],allow:r[21],spft:Number(r[27])||0,tml:String(r[28]??"").trim(),collect:Number(r[33])||0,
          ftOverride:(y&&!y.f&&typeof y.v==="number")?y.v:null};
      }
    }
  } else {
    for(const sn of wb.SheetNames){
      const rows=sheetRows(wb,sn);
      for(let h=0;h<Math.min(rows.length,6);h++){
        const hdr=(rows[h]||[]).map(v=>String(v??"").trim());
        let kind=null;
        if(hdr[0]==="B/K No") kind="BKG";
        else if(hdr[0]==="Container No."&&hdr.includes("EQ Date")) kind="LOAD";
        else if(hdr[0]==="Container No"&&hdr.includes("GateDate")) kind="GATE";
        if(kind){
          src.kind=kind; const data=clean(rows.slice(h+1));
          if(kind==="LOAD") src.loading=data; else if(kind==="BKG"){ src.booking=data; BKG_HEAD=rows[h]; } else { src.gate=data; GATE_HEAD=rows[h]; }
          break;
        }
      }
      if(src.kind) break;
    }
  }
  if(!src.kind){ src.error="Unrecognised file (must be a Loading, Booking, Gate move or TEMPLATE file)"; return src; }
  if(src.kind==="LOAD"||src.kind==="TEMPLATE"){
    const full=src.loading.filter(r=>r[10]==="F");
    const v=[...new Set(full.map(r=>`${r[2]} ${r[3]}`))];
    src.info=`${v.join(", ")||"–"} · ${full.length} containers`;
  } else if(src.kind==="BKG") src.info=`${src.booking.length} booking`;
  else src.info=`${src.gate.length} moves`;
  return src;
}

function recompute(){
  const bk={}, gates={};
  SOURCES.forEach(s=>s.booking.forEach(r=>{ if(!(r[0] in bk)) bk[r[0]]=r; }));
  SOURCES.forEach(s=>s.gate.forEach(r=>{ (gates[r[0]] ||= []).push(r); }));
  const hasBkg=SOURCES.some(s=>s.booking.length), hasGate=SOURCES.some(s=>s.gate.length), hasLoad=SOURCES.some(s=>s.loading.length);
  ROWS=[]; WARNINGS=[];
  if(SOURCES.length&&!hasLoad) WARNINGS.push("No Loading (LOAD) file yet; it lists the containers to calculate");
  if(hasLoad&&!hasBkg) WARNINGS.push("No Booking (BKG) file yet, so DG containers, service and CUST ETD are unknown");
  if(hasLoad&&!hasGate) WARNINGS.push("No Gate move (GATE) file yet, so gate-in dates are unknown and storage cannot be calculated");
  SOURCES.filter(s=>s.loading.length).forEach(s=>{
    s.loading.forEach(r=>{
      if(r[10]!=="F") return;
      const cntr=r[0], loc=r[13], bkno=r[16], tpsz=String(r[4]||"");
      const b=bk[bkno]||[]; if(hasBkg&&!bk[bkno]) WARNINGS.push(`${cntr}: booking ${bkno} not found`);
      const gl=gates[cntr]||[], g=gl.find(x=>x[12]===bkno)||gl[0];
      if(hasGate&&!g) WARNINGS.push(`${cntr}: no gate-in date in the Gate move file`);
      const m=s.manual[cntr]||{};
      const dg=![null,undefined,"",0,"0"].includes(b[42]), rf=tpsz.endsWith("RE");
      const size=tpsz.startsWith("22")?"20'":"40'", svc=b[11];
      const etd=toDay(r[1]), din=g?toDay(g[3]):null;
      let ftDefault=ftTerminal(loc,dg,b[84]), ftNote=(ftDefault===0&&CFS_ZERO_FT_LOCS.includes(loc))?"CFS/CY at PAT: F/T 0 days":"";
      if(m.ftOverride!=null&&m.ftOverride!==ftDefault){ WARNINGS.push(`${cntr}: using F/T = ${m.ftOverride} days entered in the CS sheet (rule gives ${ftDefault} days)`); ftDefault=m.ftOverride; ftNote="Entered in CS sheet"; }
      if(m.tml&&m.tml.toUpperCase()==="TML"&&m.spft>0){ ftDefault=m.spft; ftNote="Special F/T (TML)"; }
      const allow=toDay(m.allow);
      const over=(allow!=null&&din!=null)?Math.max(Math.max(allow-din,0)-(m.spft||0),0):0;
      const key=`${s.name}|${cntr}`;
      const row={key,file:s.name,cntr,loc,area:areaOf(loc),group:groupOf(loc),bkno,shipper:b[26]||r[22]||"",tpsz,size,dg,rf,
        vessel:r[2],voy:r[3],svc,etd,din,stay:(etd!=null&&din!=null)?etd-din+1:null,
        ftDefault,ftNote,ftOverride:OVERRIDES.has(key)?OVERRIDES.get(key):null,custFt:custFtOf(dg?"DG":rf?"RF":"GP"),custEtdFile:toDay(b[100]),custEtd:CUST_ETD_OVR.has(key)?CUST_ETD_OVR.get(key):toDay(b[100]),
        custAmt:tierCharge(`CUST|${dg?"DG":"GP"}|${size}`,over),collect:m.collect||0,
        vsl:b[12]||r[2]||"",voyNo:b[13]||r[3]||"",pol:b[14]||r[7]||"",lwharf:b[15]||r[27]||loc||"",
        orig:toDay(m.orig),allow,over,spft:m.spft||0,tml:m.tml||"",_r:r,_b:b,_g:g||null};
      row.setKey=[row.etd,row.svc,row.vsl,row.voyNo,row.pol,row.lwharf].join("|");
      calcRow(row); ROWS.push(row);
    });
  });
}
function calcRow(r){
  r.ft = r.ftOverride ?? r.ftDefault;
  r.days = r.stay==null ? 0 : Math.max(r.stay-r.ft,0);
  r.charge = tierCharge(`${r.group}|${r.dg?"DG":"GP"}|${r.size}`, r.days);
  // ฝั่งลูกค้า: นับวันถึง CUST ETD แทน ETD เรือ คิดตามตาราง Customer ใน COST-RENT (+ Electric charge ถ้าเป็น RF)
  r.cStay = (r.custEtd!=null&&r.din!=null) ? r.custEtd-r.din+1 : null;
  r.cDays = r.cStay==null ? 0 : Math.max(r.cStay-r.custFt,0);
  r.cCharge = custCharge(custKey(r.dg?"DG":"GP",r.size), r.cDays) + (r.rf ? r.cDays*ELECTRIC_RF[r.size] : 0);
}

async function addFiles(list){
  for(const f of list){
    let src;
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellFormula:true});
      src=classify(wb,f.name);
    }catch(e){ src={name:f.name,kind:null,loading:[],booking:[],gate:[],manual:{},error:"Could not read the file. Check it is an Excel file without a password"}; }
    SOURCES=SOURCES.filter(x=>x.name!==f.name).concat(src);
  }
  renderFiles();
}
const input=$("f-input"), drop=$("drop");
input.addEventListener("change",()=>{ addFiles([...input.files]); input.value=""; });
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
drop.addEventListener("drop",e=>addFiles([...e.dataTransfer.files]));

function allRows(){ return ROWS; }

function renderFiles(){
  recompute();
  const has=k=>SOURCES.some(s=>s.kind===k||s.kind==="TEMPLATE");
  const slots = SOURCES.length ? `<div class="slots">${["LOAD","BKG","GATE"].map(k=>`<span class="slot ${has(k)?"on":""}"><b>${has(k)?"✓":"·"}</b>${k} <span>${KIND_LABEL[k]}</span></span>`).join("")}</div>` : "";
  $("f-list").innerHTML = SOURCES.length ? slots + SOURCES.map((s,i)=>`<span class="chip ${s.error?"dg":"ok"}" title="${esc(s.error||"")}"><b>${s.kind||"?"}</b> ${esc(s.name)}${s.info?" · "+esc(s.info):""}<button type="button" class="x" data-i="${i}" aria-label="Remove ${esc(s.name)}">×</button></span>`).join("")
    + `<button class="btn" id="f-clear" type="button">Clear all</button>` : "";
  $("f-list").querySelectorAll(".x").forEach(b=>b.onclick=()=>{ SOURCES.splice(+b.dataset.i,1); renderFiles(); });
  if($("f-clear")) $("f-clear").onclick=()=>{SOURCES=[];OVERRIDES.clear();CUST_ETD_OVR.clear();CUST_CALC=false;renderFiles();};
  const w=SOURCES.filter(s=>s.error).map(s=>`${s.name} — ${s.error}`).concat(WARNINGS);
  $("f-warn").innerHTML = w.length ? `<div class="warns"><strong>Please check</strong>${w.map(x=>`<span>${esc(x)}</span>`).join("")}</div>` : "";
  renderResults();
}

function renderResults(){
  const rows=allRows(), out=$("f-out");
  if(!rows.length){ out.innerHTML = SOURCES.some(s=>s.loading.length) ? `<p class="empty">No full containers in the Loading file</p>` : ""; return; }
  const areas=["BKK","UTCT","LCH"];
  const tiles = areas.map(a=>{ const s=agg(rows.filter(r=>r.area===a));
    return `<div class="panel area ${s.charge>0?"has":""}"><span class="label">${a}</span><span class="amt">${money(s.charge)}</span>
      <span class="sub">${s.n} containers · ${s.over} over F/T · ${s.days} days</span></div>`; }).join("");
  const g=agg(rows);
  const grand=`<div class="panel area grand"><span class="label">Total (HAL pays)</span><span class="amt">${money(g.hal)}</span>
      <span class="sub">${g.n} containers · 20' ${g.c20} / 40' ${g.c40} · customer ${money(g.cust)}</span></div>`;

  // per voyage set (ETD SVC VSL VOY POL LWharf) — one export file each
  const vt = voyageSets().map(v=>{ const s=agg(v.rows); const r0=v.rows[0];
    return `<tr><td>${r0.area}</td><td class="num">${fmtDay(r0.etd)}</td><td>${esc(r0.svc)}</td><td>${esc(r0.vsl)} ${esc(r0.voyNo)}</td><td>${esc(r0.pol)}</td><td>${esc(r0.lwharf)}</td>
      <td class="r num">${s.n}</td><td class="r num">${s.c20}</td><td class="r num">${s.c40}</td><td class="r num">${s.over}</td><td class="r num">${s.days}</td>
      <td class="r num">${money(s.charge)}</td><td class="r num">${money(s.cust)}</td><td class="r num">${money(s.hal)}</td>
      <td style="display:flex;gap:6px"><button class="btn xbtn" type="button" data-k="${esc(v.key)}" title="${esc(exportName(r0))}">Export</button></td></tr>`; }).join("");

  out.innerHTML = `<div class="areas">${tiles}${grand}</div>
  <div class="section-h"><h2>Voyage summary</h2>
    <div class="tools"><span class="total-note" id="x-status" aria-live="polite"></span><button class="btn primary" type="button" id="x-all">Export all (.xlsx)</button></div>
  </div>
  <div class="scroll"><table class="grid"><thead><tr><th>Area</th><th>ETD</th><th>SVC</th><th>VSL / VOY</th><th>POL</th><th>LWharf</th><th class="r">Cntrs</th><th class="r">20'</th><th class="r">40'</th><th class="r">Over F/T</th><th class="r">Chargeable days</th><th class="r">Storage</th><th class="r">Customer</th><th class="r">HAL pays</th><th>File</th></tr></thead><tbody>${vt}</tbody></table></div>
  <p class="total-note" style="margin-top:8px">Export file name = ETD_SVC_VSL_VOY_POL_LWharf, e.g. <span class="mono">${esc(exportName(voyageSets()[0].rows[0]))}</span></p>
  <div class="section-h"><h2>Containers</h2>
    <div class="tools">
      <div class="filt" role="group" aria-label="Filter by area">${["ALL",...areas].map(a=>`<button type="button" data-a="${a}" aria-pressed="${AREA_FILTER===a}">${a==="ALL"?"All":a}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="f-paid" ${ONLY_PAID?"checked":""}> Charged only</label>
      <input type="search" id="f-q" placeholder="Search container / booking / shipper" value="${esc(QUERY)}">
      <button class="btn primary" type="button" id="f-ccalc">Calculate customer storage (by CUST ETD)</button>
      <button class="btn" type="button" id="f-copy">Copy table for Excel</button>
    </div>
  </div>
  <div id="f-csum" class="csum" aria-live="polite" hidden></div>
  <div id="f-copyfallback"></div>
  <div class="scroll" id="f-tablewrap"></div>
  <p class="total-note" style="margin-top:8px">F/T and CUST ETD can be edited per container to try a calculation (clear the value to go back to the file) · edits are not written back to the files</p>`;

  out.querySelectorAll(".filt button").forEach(b=>b.onclick=()=>{AREA_FILTER=b.dataset.a; out.querySelectorAll(".filt button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); renderTable();});
  $("f-paid").onchange=e=>{ONLY_PAID=e.target.checked; renderTable();};
  $("f-q").oninput=e=>{QUERY=e.target.value; renderTable();};
  $("f-copy").onclick=copyTable;
  $("f-ccalc").onclick=()=>{ CUST_CALC=true; renderTable(); };
  out.querySelectorAll(".xbtn").forEach(b=>b.onclick=()=>exportSets(voyageSets().filter(v=>v.key===b.dataset.k)));
  $("x-all").onclick=()=>exportSets(voyageSets());
  renderTable();
}

function visibleRows(){
  const q=QUERY.trim().toLowerCase();
  return allRows().filter(r=>(AREA_FILTER==="ALL"||r.area===AREA_FILTER)&&(!ONLY_PAID||r.charge>0)
    &&(!q||[r.cntr,r.bkno,r.shipper].some(v=>String(v||"").toLowerCase().includes(q))))
    .sort((a,b)=>b.charge-a.charge||String(a.cntr).localeCompare(b.cntr));
}
function renderCustSummary(){
  const box=$("f-csum"); if(!box) return;
  box.hidden=!CUST_CALC; if(!CUST_CALC) return;
  const rows=visibleRows(), done=rows.filter(r=>r.cStay!=null), missing=rows.length-done.length;
  const paid=done.filter(r=>r.cCharge>0), total=done.reduce((s,r)=>s+r.cCharge,0);
  box.innerHTML=`<span class="label">Customer storage (by CUST ETD)</span><span class="amt">${money(total)} <small>THB</small></span>
    <span class="total-note">${done.length} containers calculated · ${paid.length} charged${missing?` · <b class="miss">${missing} without CUST ETD</b>, enter a date in the table to include them`:""}</span>`;
}
function renderTable(){
  const rows=visibleRows(), wrap=$("f-tablewrap"); if(!wrap) return;
  renderCustSummary();
  if(!rows.length){ wrap.innerHTML=`<p class="empty">No containers match the filter</p>`; return; }
  const s=agg(rows), cTotal=rows.reduce((t,r)=>t+r.cCharge,0), cDays=rows.reduce((t,r)=>t+r.cDays,0);
  const iso=n=>n==null?"":isoDay(n);
  const cHead = CUST_CALC ? `<th class="r cc">Days to CUST ETD</th><th class="r cc">Customer chargeable days</th><th class="r cc">Customer storage</th>` : "";
  wrap.innerHTML=`<table class="grid"><thead><tr><th>Container</th><th>Loc</th><th>Booking</th><th>Shipper</th><th>Type</th><th></th><th>Gate in</th><th>ETD</th><th>CUST ETD</th><th class="r">Days</th><th class="r">F/T</th><th class="r">Chargeable days</th><th class="r">Storage</th><th class="r">Customer F/T</th>${cHead}</tr></thead>
  <tbody>${rows.map(r=>`<tr class="${r.charge>0?"paid":""}"><td class="mono">${esc(r.cntr)}</td><td>${esc(r.loc)}</td><td class="mono">${esc(r.bkno)}</td>
    <td class="shp" title="${esc(r.shipper)}">${esc(r.shipper)}</td><td class="mono">${esc(r.tpsz)}</td>
    <td>${r.dg?'<span class="chip dg">DG</span>':""}${r.rf?'<span class="chip rf">RF</span>':""}</td>
    <td class="num">${fmtDay(r.din,true)}</td><td class="num">${fmtDay(r.etd,true)}</td>
    <td><input class="cetd ${CUST_ETD_OVR.has(r.key)?"set":""} ${r.custEtd==null?"miss":""}" type="date" value="${iso(r.custEtd)}" data-k="${esc(r.key)}" aria-label="CUST ETD ${esc(r.cntr)}" title="${r.custEtdFile!=null?"From file: "+fmtDay(r.custEtdFile):"No CUST ETD in the file"}"></td>
    <td class="r num">${r.stay??"–"}</td>
    <td class="r"><input class="ftin ${r.ftOverride!=null||r.ftNote?"set":""}" type="number" min="0" step="1" value="${r.ft}" data-c="${esc(r.cntr)}" data-f="${esc(r.file)}" aria-label="F/T ${esc(r.cntr)}" title="${esc(r.ftNote||"Default "+r.ftDefault+" days")}"></td>
    <td class="r num">${r.days}</td><td class="r num amt">${money(r.charge)}</td><td class="r num">${r.custFt}</td>
    ${CUST_CALC?`<td class="r num cc">${r.cStay??"–"}</td><td class="r num cc">${r.cStay==null?"–":r.cDays}</td><td class="r num cc ${r.cCharge>0?"camt":""}">${r.cStay==null?"–":money(r.cCharge)}</td>`:""}</tr>`).join("")}</tbody>
  <tfoot><tr><td colspan="11">${s.n} containers</td><td class="r num">${s.days}</td><td class="r num">${money(s.charge)}</td><td></td>${CUST_CALC?`<td></td><td class="r num">${cDays}</td><td class="r num">${money(cTotal)}</td>`:""}</tr></tfoot></table>`;
  wrap.querySelectorAll(".ftin").forEach(inp=>inp.addEventListener("change",()=>{
    const r=allRows().find(x=>x.cntr===inp.dataset.c&&x.file===inp.dataset.f); if(!r) return;
    const v=inp.value.trim(); r.ftOverride = v===""||Number(v)===r.ftDefault ? null : Math.max(0,parseInt(v)||0);
    if(r.ftOverride==null) OVERRIDES.delete(r.key); else OVERRIDES.set(r.key,r.ftOverride);
    calcRow(r); renderResults();
  }));
  wrap.querySelectorAll(".cetd").forEach(inp=>inp.addEventListener("change",()=>{
    const r=allRows().find(x=>x.key===inp.dataset.k); if(!r) return;
    const d=inp.value ? dayFromISO(inp.value) : null;
    if(inp.value && !inp.validity.valid) return;   // วันที่ยังพิมพ์ไม่ครบ
    if(d==null || d===r.custEtdFile){ CUST_ETD_OVR.delete(r.key); r.custEtd=r.custEtdFile; } else { CUST_ETD_OVR.set(r.key,d); r.custEtd=d; }
    calcRow(r); renderTable();
  }));
}

/* ------------------------------------------------------------------ export (.xlsx) */
function voyageSets(){
  const m=new Map();
  ROWS.forEach(r=>{ if(!m.has(r.setKey)) m.set(r.setKey,{key:r.setKey,rows:[]}); m.get(r.setKey).rows.push(r); });
  return [...m.values()].sort((a,b)=>(a.rows[0].etd??0)-(b.rows[0].etd??0)||a.key.localeCompare(b.key));
}
const CS_HEAD=["Container No.","Group","Location","Booking No.","Shipper","Org Shipper","RCVCD","POL","POD","TS PORT","Type Size","CGO TERM","DG","RF",
  "Vessel","Voyage","SVC","Size","Original Schedule","ETD","Vssl Delay","1st Date allow to return","Date In","Total Stay","Normal F/T Terminal",
  "Total Storage Days","Total Storage Charge","Special F/T","HQ Ref No. / TML / APP BY","Free Time Customer","Return before ETD","Over F/T Customer",
  "Amount due to Customer","Collection","Amount due to HAL","Remark","SALESNM","CUST ETD","PICK UP","COMMON REMARKS","ROLL"];
const serial = n => n==null ? null : n+25569;   // day number -> Excel date serial

// Excel look: Tahoma 8, thin grid on every used cell, dark header row, amber total row
const XL_LINE={style:"thin",color:{rgb:"7F8A93"}}, XL_BORDER={top:XL_LINE,bottom:XL_LINE,left:XL_LINE,right:XL_LINE};
function styleGrid(ws,{head=0,total=null,paidCol=null,skipEmpty=false,labelCol=null}={}){
  if(!ws["!ref"]) return;
  const R=XLSX.utils.decode_range(ws["!ref"]);
  for(let r=R.s.r;r<=R.e.r;r++){
    let empty=true; for(let c=R.s.c;c<=R.e.c;c++){ const x=ws[XLSX.utils.encode_cell({r,c})]; if(x&&x.v!==""&&x.v!=null){empty=false;break;} }
    if(skipEmpty&&empty) continue;
    const pc=paidCol!=null?ws[XLSX.utils.encode_cell({r,c:paidCol})]:null, paid=pc&&typeof pc.v==="number"&&pc.v>0&&r!==head&&r!==total;
    for(let c=R.s.c;c<=R.e.c;c++){
      const a=XLSX.utils.encode_cell({r,c}); if(!ws[a]){ if(skipEmpty) continue; ws[a]={t:"s",v:""}; }
      let st={font:{name:"Tahoma",sz:8},border:XL_BORDER,alignment:{vertical:"center"}};
      if(r===head) st={font:{name:"Tahoma",sz:8,bold:true,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1F3A4D"}},border:XL_BORDER,alignment:{horizontal:"center",vertical:"center",wrapText:true}};
      else if(r===total) st={...st,font:{name:"Tahoma",sz:8,bold:true},fill:{fgColor:{rgb:"FFF1D6"}}};
      else if(paid&&c===paidCol) st={...st,font:{name:"Tahoma",sz:8,bold:true},fill:{fgColor:{rgb:"FBE2C8"}}};
      else if(labelCol===c) st={...st,font:{name:"Tahoma",sz:8,bold:true},fill:{fgColor:{rgb:"F3F5F7"}}};
      ws[a].s=st;
    }
  }
}
function buildWorkbook(set){
  const rows=[...set.rows].sort((a,b)=>b.charge-a.charge||String(a.cntr).localeCompare(b.cntr)), r0=rows[0], s=agg(rows);
  // ฝั่งลูกค้า: ใช้ค่า Storage ลูกค้าที่นับถึง CUST ETD (ตู้ที่ไม่มี CUST ETD ไม่นับ)
  const hasC=r=>r.cStay!=null, custTotal=rows.reduce((t,r)=>t+(hasC(r)?r.cCharge:0),0), custDays=rows.reduce((t,r)=>t+(hasC(r)?r.cDays:0),0), noCetd=rows.filter(r=>!hasC(r)).length;
  const wb=XLSX.utils.book_new();
  // Summary
  const sum=[["HAL Storage — Storage summary"],[],
    ["ETD",serial(r0.etd)],["SVC",r0.svc],["VSL",r0.vsl],["VOY",r0.voyNo],["POL",r0.pol],["LWharf",r0.lwharf],["Area",r0.area],["Terminal group",r0.group],[],
    ["Containers",s.n],["20'",s.c20],["40'",s.c40],["Over F/T",s.over],["Storage Days",s.days],
    ["Total Storage Charge",s.charge],["Amount due to Customer (by CUST ETD)",custTotal],["Collection",rows.reduce((t,r)=>t+r.collect,0)],["Amount due to HAL",s.hal],[],
    ["Calculated at",new Date().toLocaleString("en-GB")],["Source files",[...new Set(rows.map(r=>r.file))].join(", ")]].concat(noCetd?[["No CUST ETD",`${noCetd} containers (no customer charge)`]]:[]);
  const ws1=XLSX.utils.aoa_to_sheet(sum);
  if(ws1.B3) ws1.B3.z="dd/mm/yyyy";
  ["B17","B18","B19","B20"].forEach(a=>{ if(ws1[a]) ws1[a].z="#,##0"; });
  ws1["!cols"]=[{wch:24},{wch:34}];
  styleGrid(ws1,{head:0,skipEmpty:true,labelCol:0});
  XLSX.utils.book_append_sheet(wb,ws1,"Summary");
  // CS (same columns as the template's CS sheet, values)
  const data=rows.map(r=>{ const b=r._b;
    return [r.cntr,r.group,r.loc,r.bkno,b[26]??"",b[27]??"",b[4]??"",b[14]??"",b[18]??"",b[25]??"",r.tpsz,b[84]??"",r.dg?"DG":"",r.rf?"RF":"",
      r.vessel,r.voy,r.svc??"",r.size,serial(r.orig),serial(r.etd),(r.orig!=null&&r.etd!=null)?r.etd-r.orig:null,serial(r.allow),serial(r.din),r.stay,r.ft,
      r.days,r.charge,r.spft||null,r.tml||null,r.custFt,(r.allow!=null&&r.etd!=null)?r.etd-r.allow+1:null,hasC(r)?r.cDays:null,
      hasC(r)?r.cCharge:null,r.collect||null,r.charge-r.collect,[r.ftOverride!=null?`F/T edited in app (was ${r.ftDefault})`:r.ftNote, hasC(r)?null:"No CUST ETD"].filter(Boolean).join(" · ")||null,b[39]??"",serial(r.custEtd),b[62]??"",b[51]??"",b[102]??""]; });
  const tot=["TOTAL",`${s.n} containers`]; tot[25]=s.days; tot[26]=s.charge; tot[31]=custDays; tot[32]=custTotal; tot[34]=s.hal;
  const ws2=XLSX.utils.aoa_to_sheet([CS_HEAD,...data,tot]);
  const dateCols=[18,19,21,22,37], moneyCols=[26,32,33,34];
  for(let i=1;i<=data.length+1;i++){
    dateCols.forEach(c=>{ const a=XLSX.utils.encode_cell({r:i,c}); if(ws2[a]&&ws2[a].t==="n") ws2[a].z="dd/mm/yyyy"; });
    moneyCols.forEach(c=>{ const a=XLSX.utils.encode_cell({r:i,c}); if(ws2[a]&&ws2[a].t==="n") ws2[a].z="#,##0"; });
  }
  ws2["!cols"]=CS_HEAD.map((h,i)=>({wch:[4,5,26,27].includes(i)?32:[0,3].includes(i)?17:[39,40].includes(i)?40:12}));
  ws2["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:data.length,c:CS_HEAD.length-1}})};
  styleGrid(ws2,{head:0,total:data.length+1,paidCol:26});
  XLSX.utils.book_append_sheet(wb,ws2,"CS");
  // raw source rows for this voyage, same layout as the template's input sheets
  const bks=[...new Set(rows.map(r=>r.bkno))];
  const H={LOAD:["Container No.","EQ Date","Vessel","Voyage","Type Size","CD","R.C.V","P.O.L","P.O.D","D.L.V","F/E","LEASE_TYPE","Move Code","Location","Area","Nation","Booking No.","T/S","S.O.C","Service","Remark","Auth. No.","Shipper","PreVSLMove","Consignee","Notify","CNTR WGT.","L-Wharf(B/L)","D-Wharf(B/L)"]};
  const rawSheet=(head,body)=>{ const w=XLSX.utils.aoa_to_sheet([head,...body]); styleGrid(w); return w; };
  XLSX.utils.book_append_sheet(wb,rawSheet(H.LOAD,rows.map(r=>r._r.slice(0,H.LOAD.length))),"1.Loading");
  const bkRows=bks.map(k=>rows.find(r=>r.bkno===k)._b).filter(b=>b.length);
  if(bkRows.length) XLSX.utils.book_append_sheet(wb,rawSheet(BKG_HEAD,bkRows.map(b=>b.slice(0,BKG_HEAD.length))),"2.Bookinglist");
  const gRows=rows.map(r=>r._g).filter(Boolean);
  if(gRows.length) XLSX.utils.book_append_sheet(wb,rawSheet(GATE_HEAD,gRows.map(g=>g.slice(0,GATE_HEAD.length))),"3.GateMove");
  return wb;
}

let DL_NS; // downloads namespace (resolved lazily)
async function getDownloads(){
  if(DL_NS!==undefined) return DL_NS;
  try{ DL_NS = window.claude?.use ? await window.claude.use("downloads") : null; }catch(e){ DL_NS=null; }
  return DL_NS;
}
async function exportSets(sets){
  const st=$("x-status"); if(!sets.length) return;
  const inViewer=!!window.claude?.use;
  const dl=inViewer ? await getDownloads() : null;
  let ok=0, last="";
  for(const set of sets){
    const name=exportName(set.rows[0]);
    const buf=XLSX.write(buildWorkbook(set),{bookType:"xlsx",type:"array"});
    if(dl){
      try{ await dl.save({filename:name,data:new Blob([buf])}); ok++; last=name; }
      catch(e){
        const c=e&&e.code;
        if(c==="declined"){ st.textContent=`Save cancelled: ${name}`; continue; }
        if(c==="rate_limited"){ st.textContent="A save dialog is already open. Try again in a moment"; return; }
        st.textContent="This page cannot save files. Open the app on GitHub Pages instead"; return;
      }
    } else if(!inViewer){
      XLSX.writeFile(buildWorkbook(set),name); ok++; last=name;   // opened as a local file
    } else { st.textContent="This page cannot save files. Open the app on GitHub Pages instead"; return; }
  }
  if(ok) st.textContent = ok===1 ? `Saved: ${last}` : `Saved ${ok} files`;
}

function copyTable(){
  const head=["Container","Location","Area","Booking","Shipper","Type","DG","RF","Vessel","Voyage","Date In","ETD","Total Stay","F/T","Storage Days","Storage Charge","Customer F/T","CUST ETD","Stay to CUST ETD","Customer Storage Days","Customer Storage Charge","File"];
  const lines=[head.join("\t")].concat(visibleRows().map(r=>[r.cntr,r.loc,r.area,r.bkno,r.shipper,r.tpsz,r.dg?"DG":"",r.rf?"RF":"",r.vessel,r.voy,
    fmtDay(r.din),fmtDay(r.etd),r.stay??"",r.ft,r.days,r.charge,r.custFt,fmtDay(r.custEtd),r.cStay??"",r.cStay==null?"":r.cDays,r.cStay==null?"":r.cCharge,r.file].join("\t")));
  const text=lines.join("\n"), btn=$("f-copy");
  const fallback=()=>{ $("f-copyfallback").innerHTML=`<textarea class="copybox" id="f-copytext" aria-label="Table data" readonly></textarea>`; const t=$("f-copytext"); t.value=text; t.select(); btn.textContent="Text selected, press Ctrl+C"; };
  try{ navigator.clipboard.writeText(text).then(()=>{ btn.textContent="Copied"; setTimeout(()=>btn.textContent="Copy table for Excel",1800); }, fallback); }
  catch(e){ fallback(); }
}
