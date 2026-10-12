/* หน้า Dashboard */
let D_AREA="ALL", D_MONTH="ALL", D_OPEN=null, D_CONFIRM=null;
Store.onChange(renderDash);

function renderDash(){
  const all=Store.docs, out=$("d-out"), st=$("d-status");
  st.textContent = Store.mode==="db" ? `ฐานข้อมูลร่วม · ${all.length} เที่ยว`
    : Store.mode==="local" ? `เก็บในเบราว์เซอร์นี้ · ${all.length} เที่ยว`
    : "กำลังโหลดฐานข้อมูล…";
  $("d-import-lbl").hidden = Store.mode==="loading" || !Store.canWrite;
  // filters (one row, above the charts)
  $("d-area").innerHTML=["ALL","BKK","UTCT","LCH"].map(a=>`<button type="button" data-a="${a}" aria-pressed="${D_AREA===a}">${a==="ALL"?"ทุกพื้นที่":a}</button>`).join("");
  $("d-area").querySelectorAll("button").forEach(b=>b.onclick=()=>{D_AREA=b.dataset.a; renderDash();});
  const months=[...new Set(all.map(monthOf))].sort().reverse();
  if(D_MONTH!=="ALL"&&!months.includes(D_MONTH)) D_MONTH="ALL";
  $("d-month").innerHTML=`<option value="ALL">ทุกเดือน (ETD)</option>`+months.map(m=>`<option value="${esc(m)}" ${m===D_MONTH?"selected":""}>${esc(monthLabel(m))}</option>`).join("");
  $("d-month").onchange=e=>{D_MONTH=e.target.value; renderDash();};

  if(Store.mode==="loading") return;
  if(!all.length){
    out.innerHTML=`<div class="panel dash-empty"><strong>ยังไม่มีเที่ยวเรือใน Dashboard</strong>
      <p>ไปที่หน้า <a href="file.html">คำนวณจากไฟล์เรือ</a> ใส่ไฟล์ LOAD / BKG / GATE แล้วกด "บันทึกเข้า Dashboard"${Store.canWrite?" หรือนำเข้าไฟล์ DATABASE/STORAGE_DATABASE.xlsx ที่ได้จาก run_storage.bat":""}</p></div>`;
    return;
  }
  const vs=all.filter(v=>(D_AREA==="ALL"||v.meta.area===D_AREA)&&(D_MONTH==="ALL"||monthOf(v)===D_MONTH))
              .sort((a,b)=>(etdDay(b)??0)-(etdDay(a)??0)||a.meta.name.localeCompare(b.meta.name));
  const t=sumOf(vs);
  const scope=all.filter(v=>D_MONTH==="ALL"||monthOf(v)===D_MONTH);
  const tiles=["BKK","UTCT","LCH"].map(a=>{ const s=sumOf(scope.filter(v=>v.meta.area===a));
    return `<div class="panel area ${s.charge>0?"has":""}"><span class="label">${a}</span><span class="amt">${money(s.charge||0)}</span>
      <span class="sub">${s.n||0} ตู้ · เกิน F/T ${s.over||0} ตู้ · ${scope.filter(v=>v.meta.area===a).length} เที่ยว</span></div>`; }).join("")
    + `<div class="panel area grand"><span class="label">HAL จ่าย ${D_AREA==="ALL"?"รวม":D_AREA}</span><span class="amt">${money(t.hal||0)}</span>
      <span class="sub">${vs.length} เที่ยว · ${t.n||0} ตู้ · เก็บลูกค้า ${money(t.cust||0)}</span></div>`;
  if(!vs.length){ out.innerHTML=`<div class="areas">${tiles}</div><p class="empty">ไม่มีเที่ยวเรือตามตัวกรองนี้</p>`; return; }

  const mx=Math.max(...vs.map(v=>v.sum.charge||0),1);
  const vbars=vs.map(v=>`<div class="hb" title="${esc(v.meta.name)} · ${money(v.sum.charge||0)} บาท · ${v.sum.n} ตู้">
      <span class="lab">${fmtDay(etdDay(v),true)} ${esc(v.meta.vsl)} ${esc(v.meta.voy)} <span class="total-note">${esc(v.meta.lwharf)}</span></span>
      <span class="track">${v.sum.charge?`<span class="fillbar" style="width:${(v.sum.charge/mx*100).toFixed(2)}%"></span>`:`<span class="zero"></span>`}</span>
      <span class="val"><b>${money(v.sum.charge||0)}</b> ฿</span></div>`).join("");

  const shp={};
  vs.forEach(v=>(v.rows||[]).forEach(r=>{ if(r.charge>0){ const k=r.shipper||"-"; shp[k]=shp[k]||[0,0]; shp[k][0]+=r.charge; shp[k][1]++; } }));
  const top=Object.entries(shp).sort((a,b)=>b[1][0]-a[1][0]).slice(0,10), smx=top.length?top[0][1][0]:1;
  const sbars = top.length ? top.map(([k,x])=>`<div class="hb" title="${esc(k)} · ${x[1]} ตู้ · ${money(x[0])} บาท">
      <span class="lab">${esc(k)}</span><span class="track"><span class="fillbar" style="width:${(x[0]/smx*100).toFixed(2)}%"></span></span>
      <span class="val"><b>${money(x[0])}</b> · ${x[1]}</span></div>`).join("") : `<p class="total-note">ไม่มีตู้ที่เสียค่า storage ในช่วงนี้</p>`;

  const canDel = Store.canWrite;
  const trs=vs.map(v=>{ const id=docId(v.meta.name), open=D_OPEN===id;
    let html=`<tr class="${v.sum.charge>0?"paid":""}"><td><button class="linkbtn" type="button" data-open="${esc(id)}" aria-expanded="${open}">${open?"▾":"▸"} ${esc(v.meta.name)}</button></td>
      <td class="num">${fmtDay(etdDay(v))}</td><td>${esc(v.meta.area)}</td><td>${esc(v.meta.terminal)}</td>
      <td class="r num">${v.sum.n}</td><td class="r num">${v.sum.over}</td><td class="r num">${v.sum.days}</td>
      <td class="r num amt">${money(v.sum.charge||0)}</td><td class="r num">${money(v.sum.cust||0)}</td><td class="r num">${money(v.sum.hal||0)}</td>
      <td>${canDel?`<button class="btn sm ${D_CONFIRM===id?"danger":""}" type="button" data-del="${esc(id)}">${D_CONFIRM===id?"ยืนยันลบ":"ลบ"}</button>`:""}</td></tr>`;
    if(open){
      const rs=[...(v.rows||[])].sort((a,b)=>b.charge-a.charge||String(a.cntr).localeCompare(b.cntr));
      html+=`<tr class="detail"><td colspan="11"><div class="scroll"><table class="grid"><thead><tr><th>Container</th><th>Loc</th><th>Booking</th><th>Shipper</th><th>Type</th><th></th><th>ตู้เข้า</th><th class="r">อยู่</th><th class="r">F/T</th><th class="r">วันคิดเงิน</th><th class="r">ค่า Storage</th></tr></thead><tbody>`
        + rs.map(r=>`<tr class="${r.charge>0?"paid":""}"><td class="mono">${esc(r.cntr)}</td><td>${esc(r.loc)}</td><td class="mono">${esc(r.bkno)}</td><td class="shp" title="${esc(r.shipper)}">${esc(r.shipper)}</td><td class="mono">${esc(r.tpsz)}</td>
          <td>${r.dg?'<span class="chip dg">DG</span>':""}${r.rf?'<span class="chip rf">RF</span>':""}</td><td class="num">${r.din?fmtDay(dayFromISO(r.din)):"–"}</td>
          <td class="r num">${r.stay??"–"}</td><td class="r num">${r.ft}</td><td class="r num">${r.days}</td><td class="r num amt">${money(r.charge)}</td></tr>`).join("")
        + `</tbody></table></div><p class="total-note" style="margin:8px 0 0">ไฟล์ต้นทาง: ${esc((v.meta.sources||[]).join(", ")||"–")} · บันทึกเมื่อ ${v.meta.savedAt?new Date(v.meta.savedAt).toLocaleString("th-TH"):"–"}</p></td></tr>`;
    }
    return html; }).join("");

  out.innerHTML=`<div class="areas">${tiles}</div>
    <div class="dash-grid" style="margin-top:16px">
      <div class="panel"><h3>ค่า Storage ต่อเที่ยวเรือ</h3><p class="total-note" style="margin:0 0 10px">THB · ETD ล่าสุดอยู่บนสุด · ชี้ที่แถวเพื่อดูรายละเอียด</p><div class="hbars">${vbars}</div></div>
      <div class="panel"><h3>Shipper ที่มีค่า Storage สูงสุด</h3><p class="total-note" style="margin:0 0 10px">10 อันดับแรก · THB · จำนวนตู้ที่เสียค่า</p><div class="hbars wide">${sbars}</div></div>
    </div>
    <div class="section-h"><h2>เที่ยวเรือ (${vs.length})</h2><span class="total-note">คลิกชื่อเที่ยวเพื่อดูรายตู้</span></div>
    <div class="scroll"><table class="grid"><thead><tr><th>ETD_SVC_VSL_VOY_POL_LWharf</th><th>ETD</th><th>พื้นที่</th><th>Terminal</th><th class="r">ตู้</th><th class="r">เกิน F/T</th><th class="r">วันคิดเงิน</th><th class="r">ค่า Storage</th><th class="r">เก็บลูกค้า</th><th class="r">HAL จ่าย</th><th></th></tr></thead>
    <tbody>${trs}</tbody><tfoot><tr><td colspan="4">รวม ${vs.length} เที่ยว</td><td class="r num">${t.n||0}</td><td class="r num">${t.over||0}</td><td class="r num">${t.days||0}</td><td class="r num">${money(t.charge||0)}</td><td class="r num">${money(t.cust||0)}</td><td class="r num">${money(t.hal||0)}</td><td></td></tr></tfoot></table></div>`;

  out.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{ D_OPEN = D_OPEN===b.dataset.open ? null : b.dataset.open; renderDash(); });
  out.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.del;
    if(D_CONFIRM!==id){ D_CONFIRM=id; renderDash(); setTimeout(()=>{ if(D_CONFIRM===id){ D_CONFIRM=null; renderDash(); } },4000); return; }
    D_CONFIRM=null; b.disabled=true;
    try{ await Store.remove(id); $("d-status").textContent="ลบแล้ว"; }
    catch(e){ $("d-status").textContent="ลบไม่สำเร็จ ลองอีกครั้ง"; renderDash(); }
  });
}

// import DATABASE/STORAGE_DATABASE.xlsx (from run_storage.bat) into the shared database
$("d-import").addEventListener("change",async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  const st=$("d-status");
  try{
    const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
    if(!wb.Sheets.Voyages||!wb.Sheets.Containers){ st.textContent="ไฟล์นี้ไม่ใช่ STORAGE_DATABASE.xlsx (ต้องมีชีท Voyages และ Containers)"; return; }
    const V=XLSX.utils.sheet_to_json(wb.Sheets.Voyages,{defval:null}).map(r=>({...r,Voyage:r["Voyage Key"]??r.Voyage})).filter(r=>r.Voyage&&!String(r.Voyage).startsWith("TOTAL"));
    const C=XLSX.utils.sheet_to_json(wb.Sheets.Containers,{defval:null});
    const iso=v=>{ const d=toDay(v); return d==null?null:isoDay(d); };
    let ok=0;
    for(const v of V){
      const rs=C.filter(c=>(c["Voyage Key"]??c.Voyage)===v.Voyage).map(c=>({cntr:c["Container No."],bkno:c["Booking No."]||"",shipper:c.Shipper||"",tpsz:c["Type Size"]||"",
        loc:c.Location||"",dg:!!c.DG,rf:!!c.RF,din:iso(c["Date In"]),stay:c["Total Stay"],ft:c["Normal F/T Terminal"],
        days:c["Total Storage Days"]||0,charge:c["Total Storage Charge"]||0,cust:c["Amount due to Customer"]||0,collect:c.Collection||0,size:c.Size}));
      const sum={n:rs.length,c20:rs.filter(r=>r.size==="20'").length,c40:rs.filter(r=>r.size==="40'").length,dg:rs.filter(r=>r.dg).length,rf:rs.filter(r=>r.rf).length,
        over:rs.filter(r=>r.days>0).length,days:rs.reduce((t,r)=>t+r.days,0),charge:rs.reduce((t,r)=>t+r.charge,0),cust:rs.reduce((t,r)=>t+r.cust,0),
        collect:rs.reduce((t,r)=>t+r.collect,0)}; sum.hal=sum.charge-sum.collect;
      rs.forEach(r=>{ delete r.collect; delete r.size; });
      const d={meta:{name:String(v.Voyage),etd:iso(v.ETD),svc:v.SVC||"",vsl:v.VSL||"",voy:String(v.VOY??""),pol:v.POL||"",lwharf:v.LWharf||"",
        area:v.Area||"",group:v.Group||"",terminal:v.Terminal||"",sources:[f.name],savedAt:new Date().toISOString(),via:"import"},sum,rows:rs};
      st.textContent=`กำลังนำเข้า ${ok+1}/${V.length}…`;
      await Store.save(docId(d.meta.name),d); ok++;
    }
    st.textContent=`นำเข้าแล้ว ${ok} เที่ยว`;
  }catch(err){
    st.textContent = err&&err.code==="invalid_argument" ? "บัญชีนี้ดูได้อย่างเดียว นำเข้าไม่ได้" : "นำเข้าไม่สำเร็จ ตรวจว่าเป็นไฟล์ STORAGE_DATABASE.xlsx";
  }
});
