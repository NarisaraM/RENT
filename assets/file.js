/* หน้า คำนวณจากไฟล์เรือ */
/* ------------------------------------------------------------------ file mode */
// รับได้ทั้งไฟล์ดิบจากระบบ LOAD / BKG / GATE (.xls) และไฟล์ TEMPLATE ที่มีชีท 1.Loading 2.Bookinglist 3.GateMove
let SOURCES=[];            // {name, kind, loading, booking, gate, manual, info, error}
let ROWS=[], WARNINGS=[];
const OVERRIDES=new Map(); // `${file}|${cntr}` -> F/T ที่แก้ในตาราง
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
  if(!src.kind){ src.error="ไม่รู้จักรูปแบบไฟล์ (ต้องเป็นไฟล์ Loading, Booking, Gate move หรือ TEMPLATE)"; return src; }
  if(src.kind==="LOAD"||src.kind==="TEMPLATE"){
    const full=src.loading.filter(r=>r[10]==="F");
    const v=[...new Set(full.map(r=>`${r[2]} ${r[3]}`))];
    src.info=`${v.join(", ")||"–"} · ${full.length} ตู้`;
  } else if(src.kind==="BKG") src.info=`${src.booking.length} booking`;
  else src.info=`${src.gate.length} รายการ`;
  return src;
}

function recompute(){
  const bk={}, gates={};
  SOURCES.forEach(s=>s.booking.forEach(r=>{ if(!(r[0] in bk)) bk[r[0]]=r; }));
  SOURCES.forEach(s=>s.gate.forEach(r=>{ (gates[r[0]] ||= []).push(r); }));
  const hasBkg=SOURCES.some(s=>s.booking.length), hasGate=SOURCES.some(s=>s.gate.length), hasLoad=SOURCES.some(s=>s.loading.length);
  ROWS=[]; WARNINGS=[];
  if(SOURCES.length&&!hasLoad) WARNINGS.push("ยังไม่มีไฟล์ Loading (LOAD) ซึ่งใช้เป็นรายชื่อตู้ที่จะคำนวณ");
  if(hasLoad&&!hasBkg) WARNINGS.push("ยังไม่มีไฟล์ Booking (BKG) จึงยังแยกตู้ DG และ Service ไม่ได้");
  if(hasLoad&&!hasGate) WARNINGS.push("ยังไม่มีไฟล์ Gate move (GATE) จึงยังไม่รู้วันตู้เข้า และคำนวณค่า storage ไม่ได้");
  SOURCES.filter(s=>s.loading.length).forEach(s=>{
    s.loading.forEach(r=>{
      if(r[10]!=="F") return;
      const cntr=r[0], loc=r[13], bkno=r[16], tpsz=String(r[4]||"");
      const b=bk[bkno]||[]; if(hasBkg&&!bk[bkno]) WARNINGS.push(`${cntr}: ไม่พบ Booking ${bkno}`);
      const gl=gates[cntr]||[], g=gl.find(x=>x[12]===bkno)||gl[0];
      if(hasGate&&!g) WARNINGS.push(`${cntr}: ไม่พบวันตู้เข้าในไฟล์ Gate move`);
      const m=s.manual[cntr]||{};
      const dg=![null,undefined,"",0,"0"].includes(b[42]), rf=tpsz.endsWith("RE");
      const size=tpsz.startsWith("22")?"20'":"40'", svc=b[11];
      const etd=toDay(r[1]), din=g?toDay(g[3]):null;
      let ftDefault=ftTerminal(loc,dg,b[84]), ftNote=(ftDefault===0&&CFS_ZERO_FT_LOCS.includes(loc))?"CFS/CY ที่ PAT: F/T 0 วัน":"";
      if(m.ftOverride!=null&&m.ftOverride!==ftDefault){ WARNINGS.push(`${cntr}: ใช้ F/T = ${m.ftOverride} วัน ตามที่กรอกเองในชีท CS (กฎให้ ${ftDefault} วัน)`); ftDefault=m.ftOverride; ftNote="กรอกเองในชีท CS"; }
      if(m.tml&&m.tml.toUpperCase()==="TML"&&m.spft>0){ ftDefault=m.spft; ftNote="Special F/T (TML)"; }
      const allow=toDay(m.allow);
      const over=(allow!=null&&din!=null)?Math.max(Math.max(allow-din,0)-(m.spft||0),0):0;
      const key=`${s.name}|${cntr}`;
      const row={key,file:s.name,cntr,loc,area:areaOf(loc),group:groupOf(loc),bkno,shipper:b[26]||r[22]||"",tpsz,size,dg,rf,
        vessel:r[2],voy:r[3],svc,etd,din,stay:(etd!=null&&din!=null)?etd-din+1:null,
        ftDefault,ftNote,ftOverride:OVERRIDES.has(key)?OVERRIDES.get(key):null,custFt:custFt(loc,dg,rf,svc),
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
}

async function addFiles(list){
  for(const f of list){
    let src;
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellFormula:true});
      src=classify(wb,f.name);
    }catch(e){ src={name:f.name,kind:null,loading:[],booking:[],gate:[],manual:{},error:"อ่านไฟล์ไม่ได้ ตรวจว่าเป็นไฟล์ Excel ที่ไม่ได้ตั้งรหัสผ่าน"}; }
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
  $("f-list").innerHTML = SOURCES.length ? slots + SOURCES.map((s,i)=>`<span class="chip ${s.error?"dg":"ok"}" title="${esc(s.error||"")}"><b>${s.kind||"?"}</b> ${esc(s.name)}${s.info?" · "+esc(s.info):""}<button type="button" class="x" data-i="${i}" aria-label="เอาไฟล์ ${esc(s.name)} ออก">×</button></span>`).join("")
    + `<button class="btn" id="f-clear" type="button">ล้างทั้งหมด</button>` : "";
  $("f-list").querySelectorAll(".x").forEach(b=>b.onclick=()=>{ SOURCES.splice(+b.dataset.i,1); renderFiles(); });
  if($("f-clear")) $("f-clear").onclick=()=>{SOURCES=[];OVERRIDES.clear();renderFiles();};
  const w=SOURCES.filter(s=>s.error).map(s=>`${s.name} — ${s.error}`).concat(WARNINGS);
  $("f-warn").innerHTML = w.length ? `<div class="warns"><strong>ข้อควรตรวจสอบ</strong>${w.map(x=>`<span>${esc(x)}</span>`).join("")}</div>` : "";
  renderResults();
}

function renderResults(){
  const rows=allRows(), out=$("f-out");
  if(!rows.length){ out.innerHTML = SOURCES.some(s=>s.loading.length) ? `<p class="empty">ไม่พบตู้ Full ในไฟล์ Loading</p>` : ""; return; }
  const areas=["BKK","UTCT","LCH"];
  const tiles = areas.map(a=>{ const s=agg(rows.filter(r=>r.area===a));
    return `<div class="panel area ${s.charge>0?"has":""}"><span class="label">${a}</span><span class="amt">${money(s.charge)}</span>
      <span class="sub">${s.n} ตู้ · เกิน F/T ${s.over} ตู้ · ${s.days} วัน</span></div>`; }).join("");
  const g=agg(rows);
  const grand=`<div class="panel area grand"><span class="label">รวมทั้งหมด (HAL จ่าย)</span><span class="amt">${money(g.hal)}</span>
      <span class="sub">${g.n} ตู้ · 20' ${g.c20} / 40' ${g.c40} · เก็บลูกค้า ${money(g.cust)}</span></div>`;

  // per voyage set (ETD SVC VSL VOY POL LWharf) — one export file each
  const vt = voyageSets().map(v=>{ const s=agg(v.rows); const r0=v.rows[0];
    return `<tr><td>${r0.area}</td><td class="num">${fmtDay(r0.etd)}</td><td>${esc(r0.svc)}</td><td>${esc(r0.vsl)} ${esc(r0.voyNo)}</td><td>${esc(r0.pol)}</td><td>${esc(r0.lwharf)}</td>
      <td class="r num">${s.n}</td><td class="r num">${s.c20}</td><td class="r num">${s.c40}</td><td class="r num">${s.over}</td><td class="r num">${s.days}</td>
      <td class="r num">${money(s.charge)}</td><td class="r num">${money(s.cust)}</td><td class="r num">${money(s.hal)}</td>
      <td style="display:flex;gap:6px"><button class="btn xbtn" type="button" data-k="${esc(v.key)}" title="${esc(exportName(r0))}">Export</button>
      <button class="btn sbtn" type="button" data-k="${esc(v.key)}" data-n="${esc(voyName(r0))}">บันทึกเข้า Dashboard</button></td></tr>`; }).join("");

  out.innerHTML = `<div class="areas">${tiles}${grand}</div>
  <div class="section-h"><h2>สรุปตามเที่ยวเรือ</h2>
    <div class="tools"><span class="total-note" id="x-status" aria-live="polite"></span><button class="btn" type="button" id="s-all">บันทึกทั้งหมดเข้า Dashboard</button><button class="btn primary" type="button" id="x-all">Export ทั้งหมด (.xlsx)</button></div>
  </div>
  <div class="scroll"><table class="grid"><thead><tr><th>พื้นที่</th><th>ETD</th><th>SVC</th><th>VSL / VOY</th><th>POL</th><th>LWharf</th><th class="r">ตู้</th><th class="r">20'</th><th class="r">40'</th><th class="r">เกิน F/T</th><th class="r">วันคิดเงิน</th><th class="r">ค่า Storage</th><th class="r">เก็บลูกค้า</th><th class="r">HAL จ่าย</th><th>ไฟล์</th></tr></thead><tbody>${vt}</tbody></table></div>
  <p class="total-note" style="margin-top:8px">ชื่อไฟล์ Export = ETD_SVC_VSL_VOY_POL_LWharf เช่น <span class="mono">${esc(exportName(voyageSets()[0].rows[0]))}</span></p>
  <div class="section-h"><h2>รายตู้</h2>
    <div class="tools">
      <div class="filt" role="group" aria-label="กรองพื้นที่">${["ALL",...areas].map(a=>`<button type="button" data-a="${a}" aria-pressed="${AREA_FILTER===a}">${a==="ALL"?"ทั้งหมด":a}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="f-paid" ${ONLY_PAID?"checked":""}> เฉพาะที่มีค่า</label>
      <input type="search" id="f-q" placeholder="ค้นหาตู้ / booking / shipper" value="${esc(QUERY)}">
      <button class="btn" type="button" id="f-copy">คัดลอกตารางไปวาง Excel</button>
    </div>
  </div>
  <div id="f-copyfallback"></div>
  <div class="scroll" id="f-tablewrap"></div>
  <p class="total-note" style="margin-top:8px">ช่อง F/T แก้ได้ทีละตู้เพื่อลองคำนวณ (ลบค่าออกเพื่อกลับไปใช้ค่าเดิม) · ค่าที่แก้จะไม่ถูกบันทึกกลับไปที่ไฟล์</p>`;

  out.querySelectorAll(".filt button").forEach(b=>b.onclick=()=>{AREA_FILTER=b.dataset.a; out.querySelectorAll(".filt button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); renderTable();});
  $("f-paid").onchange=e=>{ONLY_PAID=e.target.checked; renderTable();};
  $("f-q").oninput=e=>{QUERY=e.target.value; renderTable();};
  $("f-copy").onclick=copyTable;
  out.querySelectorAll(".xbtn").forEach(b=>b.onclick=()=>exportSets(voyageSets().filter(v=>v.key===b.dataset.k)));
  $("x-all").onclick=()=>exportSets(voyageSets());
  out.querySelectorAll(".sbtn").forEach(b=>b.onclick=()=>saveSets(voyageSets().filter(v=>v.key===b.dataset.k)));
  if($("s-all")) $("s-all").onclick=()=>saveSets(voyageSets());
  refreshSaveLabels();
  renderTable();
}

function visibleRows(){
  const q=QUERY.trim().toLowerCase();
  return allRows().filter(r=>(AREA_FILTER==="ALL"||r.area===AREA_FILTER)&&(!ONLY_PAID||r.charge>0)
    &&(!q||[r.cntr,r.bkno,r.shipper].some(v=>String(v||"").toLowerCase().includes(q))))
    .sort((a,b)=>b.charge-a.charge||String(a.cntr).localeCompare(b.cntr));
}
function renderTable(){
  const rows=visibleRows(), wrap=$("f-tablewrap"); if(!wrap) return;
  if(!rows.length){ wrap.innerHTML=`<p class="empty">ไม่มีตู้ที่ตรงกับตัวกรอง</p>`; return; }
  const s=agg(rows);
  wrap.innerHTML=`<table class="grid"><thead><tr><th>Container</th><th>Loc</th><th>Booking</th><th>Shipper</th><th>Type</th><th></th><th>ตู้เข้า</th><th>ETD</th><th class="r">อยู่</th><th class="r">F/T</th><th class="r">วันคิดเงิน</th><th class="r">ค่า Storage</th><th class="r">F/T ลูกค้า</th></tr></thead>
  <tbody>${rows.map(r=>`<tr class="${r.charge>0?"paid":""}"><td class="mono">${esc(r.cntr)}</td><td>${esc(r.loc)}</td><td class="mono">${esc(r.bkno)}</td>
    <td class="shp" title="${esc(r.shipper)}">${esc(r.shipper)}</td><td class="mono">${esc(r.tpsz)}</td>
    <td>${r.dg?'<span class="chip dg">DG</span>':""}${r.rf?'<span class="chip rf">RF</span>':""}</td>
    <td class="num">${fmtDay(r.din,true)}</td><td class="num">${fmtDay(r.etd,true)}</td><td class="r num">${r.stay??"–"}</td>
    <td class="r"><input class="ftin ${r.ftOverride!=null||r.ftNote?"set":""}" type="number" min="0" step="1" value="${r.ft}" data-c="${esc(r.cntr)}" data-f="${esc(r.file)}" aria-label="F/T ${esc(r.cntr)}" title="${esc(r.ftNote||"ค่าเริ่มต้น "+r.ftDefault+" วัน")}"></td>
    <td class="r num">${r.days}</td><td class="r num amt">${money(r.charge)}</td><td class="r num">${r.custFt}</td></tr>`).join("")}</tbody>
  <tfoot><tr><td colspan="10">${s.n} ตู้</td><td class="r num">${s.days}</td><td class="r num">${money(s.charge)}</td><td></td></tr></tfoot></table>`;
  wrap.querySelectorAll(".ftin").forEach(inp=>inp.addEventListener("change",()=>{
    const r=allRows().find(x=>x.cntr===inp.dataset.c&&x.file===inp.dataset.f); if(!r) return;
    const v=inp.value.trim(); r.ftOverride = v===""||Number(v)===r.ftDefault ? null : Math.max(0,parseInt(v)||0);
    if(r.ftOverride==null) OVERRIDES.delete(r.key); else OVERRIDES.set(r.key,r.ftOverride);
    calcRow(r); renderResults();
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
  "Total Storage Days","Total Storage Charge","Special F/T","HQ Ref No. / TML / APP BY","Free Time Customer","คืนก่อนเรือออก","Over F/T Customer",
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
  const wb=XLSX.utils.book_new();
  // Summary
  const sum=[["HAL Storage — สรุปค่า Storage"],[],
    ["ETD",serial(r0.etd)],["SVC",r0.svc],["VSL",r0.vsl],["VOY",r0.voyNo],["POL",r0.pol],["LWharf",r0.lwharf],["Area",r0.area],["Terminal group",r0.group],[],
    ["จำนวนตู้",s.n],["20'",s.c20],["40'",s.c40],["ตู้ที่เกิน F/T",s.over],["Storage Days",s.days],
    ["Total Storage Charge",s.charge],["Amount due to Customer",s.cust],["Collection",rows.reduce((t,r)=>t+r.collect,0)],["Amount due to HAL",s.hal],[],
    ["คำนวณเมื่อ",new Date().toLocaleString("th-TH")],["ไฟล์ต้นทาง",[...new Set(rows.map(r=>r.file))].join(", ")]];
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
      r.days,r.charge,r.spft||null,r.tml||null,r.custFt,(r.allow!=null&&r.etd!=null)?r.etd-r.allow+1:null,r.over,
      r.custAmt,r.collect||null,r.charge-r.collect,r.ftOverride!=null?`F/T แก้ในแอพ (เดิม ${r.ftDefault})`:(r.ftNote||null),b[39]??"",b[100]??"",b[62]??"",b[51]??"",b[102]??""]; });
  const tot=["TOTAL",`${s.n} ตู้`]; tot[25]=s.days; tot[26]=s.charge; tot[32]=s.cust; tot[34]=s.hal;
  const ws2=XLSX.utils.aoa_to_sheet([CS_HEAD,...data,tot]);
  const dateCols=[18,19,21,22], moneyCols=[26,32,33,34];
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
        if(c==="declined"){ st.textContent=`ยกเลิกการบันทึก ${name}`; continue; }
        if(c==="rate_limited"){ st.textContent="มีหน้าต่างบันทึกเปิดค้างอยู่ ลองอีกครั้งในอีกสักครู่"; return; }
        st.textContent="หน้านี้บันทึกไฟล์ไม่ได้ ลองเปิดแอพจากไฟล์ storage_app.html ในเครื่อง"; return;
      }
    } else if(!inViewer){
      XLSX.writeFile(buildWorkbook(set),name); ok++; last=name;   // opened as a local file
    } else { st.textContent="หน้านี้บันทึกไฟล์ไม่ได้ ลองเปิดแอพจากไฟล์ storage_app.html ในเครื่อง"; return; }
  }
  if(ok) st.textContent = ok===1 ? `บันทึกแล้ว: ${last}` : `บันทึกแล้ว ${ok} ไฟล์`;
}

function copyTable(){
  const head=["Container","Location","Area","Booking","Shipper","Type","DG","RF","Vessel","Voyage","Date In","ETD","Total Stay","F/T","Storage Days","Storage Charge","Customer F/T","File"];
  const lines=[head.join("\t")].concat(visibleRows().map(r=>[r.cntr,r.loc,r.area,r.bkno,r.shipper,r.tpsz,r.dg?"DG":"",r.rf?"RF":"",r.vessel,r.voy,
    fmtDay(r.din),fmtDay(r.etd),r.stay??"",r.ft,r.days,r.charge,r.custFt,r.file].join("\t")));
  const text=lines.join("\n"), btn=$("f-copy");
  const fallback=()=>{ $("f-copyfallback").innerHTML=`<textarea class="copybox" id="f-copytext" aria-label="ข้อมูลตาราง" readonly></textarea>`; const t=$("f-copytext"); t.value=text; t.select(); btn.textContent="เลือกข้อความแล้ว กด Ctrl+C"; };
  try{ navigator.clipboard.writeText(text).then(()=>{ btn.textContent="คัดลอกแล้ว"; setTimeout(()=>btn.textContent="คัดลอกตารางไปวาง Excel",1800); }, fallback); }
  catch(e){ fallback(); }
}

function voyageDoc(set){
  const r0=set.rows[0], s=agg(set.rows);
  return {
    meta:{name:voyName(r0), etd:r0.etd!=null?isoDay(r0.etd):null, svc:r0.svc||"", vsl:r0.vsl||"", voy:r0.voyNo||"",
      pol:r0.pol||"", lwharf:r0.lwharf||"", area:r0.area, group:r0.group,
      terminal:[...new Set(set.rows.map(r=>LOC_NAME(r.loc)))].join(" / "),
      sources:[...new Set(set.rows.map(r=>r.file))], savedAt:new Date().toISOString(), via:"app"},
    sum:{n:s.n,c20:s.c20,c40:s.c40,dg:set.rows.filter(r=>r.dg).length,rf:set.rows.filter(r=>r.rf).length,
      over:s.over,days:s.days,charge:s.charge,cust:s.cust,collect:set.rows.reduce((t,r)=>t+r.collect,0),hal:s.hal},
    rows:set.rows.map(r=>({cntr:r.cntr,bkno:r.bkno||"",shipper:r.shipper||"",tpsz:r.tpsz,loc:r.loc||"",dg:!!r.dg,rf:!!r.rf,
      din:r.din!=null?isoDay(r.din):null,stay:r.stay,ft:r.ft,days:r.days,charge:r.charge,cust:r.custAmt}))
  };
}

async function saveSets(sets){
  const st=$("x-status"); if(!sets.length) return;
  let ok=0;
  for(const set of sets){
    const d=voyageDoc(set);
    try{ await Store.save(docId(d.meta.name),d); ok++; }
    catch(e){
      if(e&&e.code==="invalid_argument"){ st.textContent="บัญชีนี้ดูได้อย่างเดียว บันทึกเข้า Dashboard ไม่ได้"; refreshSaveLabels(); return; }
      if(e&&e.code==="quota_exceeded"){ st.textContent="ฐานข้อมูลเต็ม ลบเที่ยวเรือเก่าในหน้า Dashboard ก่อน"; return; }
      st.textContent = Store.mode==="local" ? "เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ (อาจเปิดแบบส่วนตัวหรือพื้นที่เต็ม)" : `บันทึก ${d.meta.name} ไม่สำเร็จ ลองอีกครั้ง`; return;
    }
  }
  st.innerHTML = (ok===1 ? "บันทึกเข้า Dashboard แล้ว" : `บันทึกเข้า Dashboard แล้ว ${ok} เที่ยว`) + ' · <a href="dashboard.html">เปิด Dashboard</a>';
  refreshSaveLabels();
}
function refreshSaveLabels(){
  document.querySelectorAll(".sbtn").forEach(b=>{
    b.hidden=!Store.canWrite;
    b.textContent = Store.docs.some(v=>v.meta&&v.meta.name===b.dataset.n) ? "อัปเดตใน Dashboard" : "บันทึกเข้า Dashboard";
  });
  const all=$("s-all"); if(all) all.hidden=!Store.canWrite;
}
Store.onChange(refreshSaveLabels);

