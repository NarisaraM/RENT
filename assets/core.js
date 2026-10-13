/* HAL Storage — ส่วนที่ใช้ร่วมกันทุกหน้า: tariff, terminal, วันที่, ตัวเลข */
/* ------------------------------------------------------------------ tariff (ชีท Charge) */
const TIERS = {
  "G1|GP|20'":[[0,0,125],[3,375,250],[10,2275,400]],
  "G1|GP|40'":[[0,0,250],[3,750,500],[10,4550,800]],
  "G1|DG|20'":[[0,0,375],[3,1125,750],[10,6825,1200]],
  "G1|DG|40'":[[0,0,750],[3,2250,1500],[10,13650,2400]],
  "G2|GP|20'":[[0,0,125],[7,875,250],[14,2625,400]],
  "G2|GP|40'":[[0,0,250],[7,1750,500],[14,5250,800]],
  "G2|DG|20'":[[0,0,375],[7,2625,750],[14,7875,1200]],
  "G2|DG|40'":[[0,0,750],[7,5250,1500],[14,15750,2400]],
  "G3|GP|20'":[[0,0,160],[7,1120,275],[14,3045,390]],
  "G3|GP|40'":[[0,0,320],[7,2240,550],[14,6090,780]],
  "G3|DG|20'":[[0,0,480],[7,3360,825],[14,9135,1170]],
  "G3|DG|40'":[[0,0,960],[7,6720,1650],[14,18270,2340]],
  "G4|GP|20'":[[0,0,50]], "G4|GP|40'":[[0,0,100]],
  "G4|DG|20'":[[0,0,150]],"G4|DG|40'":[[0,0,300]],
  "CUST|GP|20'":[[0,0,375],[5,1200,750],[9,4800,1500]],
  "CUST|GP|40'":[[0,0,750],[7,2400,1500],[14,9600,3000]],
  "CUST|DG|20'":[[0,0,900],[5,3360,1800],[9,9135,3600]],
  "CUST|DG|40'":[[0,0,1800],[9,6720,3600],[9,18270,7200]],
};
// รายชื่อ terminal ตามชีท Charge ในไฟล์ COST-RENT.xlsx (code ใช้ภายในสำหรับอ่านไฟล์เรือและเลือกอัตรา)
const LOCS = [
  {code:"BKK04",name:"PAT / Terminal 1",area:"BKK"},
  {code:"BKK01",name:"PAT / Terminal 2",area:"BKK"},
  {code:"BKK02",name:"UNITHAI",area:"UTCT"},
  {code:"LCH01",name:"ESCO B3",area:"LCH"},
  {code:"LCH02",name:"Hutchison A2",area:"LCH"},
  {code:"LCH03",name:"TIPS B4",area:"LCH"},
  {code:"LCH04",name:"LCMT A0/B1",area:"LCH"},
  {code:"LCH05",name:"LCIT B5/C3",area:"LCH"},   // B5 (LCH05) and C3 (LCH10) share the same rates; vessel files still read both codes
  {code:"LCH06",name:"Hutchison A3",area:"LCH"},
  {code:"LCH08",name:"Hutchison C1C2",area:"LCH"},
  {code:"LCH09",name:"Hutchison D1",area:"LCH"},
];
const GROUP_OF_LOC = {LCH04:"G1",BKK01:"G3",BKK04:"G3",BKK02:"G4"};
const TERMINAL_FT = {LCH01:7,LCH02:7,LCH03:7,LCH04:7,LCH05:7,LCH06:7,LCH08:7,LCH09:7,LCH10:7,BKK02:5};
const GROUP_INFO = {
  G1:{title:"LCMT",locs:"LCH04"}, G2:{title:"ESCO · TIPS · LCIT · Hutchison",locs:"LCH01 02 03 05 06 08 09 10"},
  G3:{title:"PAT",locs:"BKK01 Terminal 2 · BKK04 Terminal 1"}, G4:{title:"Unithai (UTCT)",locs:"BKK02 · single rate"},
  CUST:{title:"Customer (early return)",locs:"All terminals"}
};

const groupOf = loc => GROUP_OF_LOC[loc] || "G2";
const areaOf = loc => !loc ? "OTHER" : loc==="BKK02" ? "UTCT" : loc.startsWith("BKK") ? "BKK" : loc.startsWith("LCH") ? "LCH" : "OTHER";
const CFS_ZERO_FT_LOCS = ["BKK01","BKK04"];   // PAT: CGO TERM CFS/CY (stuffing ใน terminal) ไม่มี free time
const isCfsCy = cgo => String(cgo??"").replace(/\s/g,"").toUpperCase()==="CFS/CY";
const ftTerminal = (loc,dg,cgo) => (CFS_ZERO_FT_LOCS.includes(loc)&&isCfsCy(cgo)) ? 0 : dg ? 1 : (TERMINAL_FT[loc] ?? 3);
const custFt = (loc,dg,rf,svc) => (dg||rf?3:5) + ((loc||"").startsWith("BKK")&&rf&&svc==="KTS"?1:0) + (svc==="KHS"?1:0);

/* ------------------------------------------------------------------ ค่าฝั่งลูกค้า (ชีท Charge ใน COST-RENT.xlsx) */
// ตาราง Customer: [วันคิดเงินเริ่ม, อัตราต่อวัน] · GP/RF/OOG/TK/FLEXIBAG ใช้อัตราเดียวกัน, DG แยก
const CUST_RATES = {
  "GP|20'":[[1,375],[5,750],[9,1500]],  "GP|40'":[[1,750],[5,1500],[9,3000]],
  "DG|20'":[[1,900],[5,1800],[9,3600]], "DG|40'":[[1,1800],[5,3600],[9,7200]],
};
const ELECTRIC_RF = {"20'":1000,"40'":1200};   // COST ELECTRIC CHARGE ต่อวันคิดเงิน เฉพาะตู้ RF
const custKey = (cargo,size) => `${cargo==="DG"?"DG":"GP"}|${size}`;
const PAT_LOCS = ["BKK01","BKK04"];   // PAT Terminal 1 / 2
// customer free time (container return): GP-type 5 days, DG 3, RF 3 (4 at PAT)
// PAT + CGO TERM CFS/CY (stuffed inside the terminal): no free time at all
const custFtOf = (cargo,loc,cgo) => (PAT_LOCS.includes(loc)&&isCfsCy(cgo)) ? 0 : cargo==="RF" ? (PAT_LOCS.includes(loc)?4:3) : cargo==="DG" ? 3 : 5;
// RF electric charge starts after 3 days everywhere, even at PAT where the return free time is 4 days
const ELECTRIC_FT = 3;
const electricDays = (stay,elecFt=ELECTRIC_FT) => stay==null ? 0 : Math.max(stay-elecFt,0);
function custBreakdown(key, days){
  const ts=CUST_RATES[key], out=[];
  ts.forEach((t,i)=>{
    const end = i+1<ts.length ? ts[i+1][0]-1 : Infinity;
    const to = Math.min(days,end), n = to-t[0]+1;
    if(n>0) out.push({from:t[0],to,n,rate:t[1],amt:n*t[1]});
  });
  return out;
}
const custCharge = (key,days) => days>0 ? custBreakdown(key,days).reduce((s,b)=>s+b.amt,0) : 0;

function tierCharge(key, days){
  if(!(days>0)) return 0;
  let row; for(const t of TIERS[key]) if(t[0]<=days) row=t;
  return row[1] + (days-row[0])*row[2];
}
function breakdown(key, days){
  const ts=TIERS[key], out=[];
  ts.forEach((t,i)=>{
    const end = i+1<ts.length ? ts[i+1][0] : Infinity;
    const n = Math.min(days,end) - t[0];
    if(n>0) out.push({from:t[0]+1,to:t[0]+n,n,rate:t[2],amt:n*t[2]});
  });
  return out;
}

/* ------------------------------------------------------------------ dates as day numbers */
const DAY=864e5;
function dayFromISO(s){ if(!s) return null; const [y,m,d]=s.split("-").map(Number); return Date.UTC(y,m-1,d)/DAY; }
function toDay(v){
  if(v==null||v==="") return null;
  if(typeof v==="number") return Math.floor(v) - 25569;           // Excel serial
  if(v instanceof Date) return Date.UTC(v.getFullYear(),v.getMonth(),v.getDate())/DAY;
  const s=String(v).trim();
  let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m) return Date.UTC(+m[1],m[2]-1,+m[3])/DAY;
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return Date.UTC(+m[3],m[2]-1,+m[1])/DAY;
  return null;
}
function fmtDay(n, short){ if(n==null) return "–"; const d=new Date(n*DAY);
  const dd=String(d.getUTCDate()).padStart(2,"0"), mm=String(d.getUTCMonth()+1).padStart(2,"0");
  return short ? `${dd}/${mm}` : `${dd}/${mm}/${d.getUTCFullYear()}`; }
const TH_DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const dow = n => TH_DOW[new Date(n*DAY).getUTCDay()];
const money = n => Math.round(n).toLocaleString("en-US");
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $=id=>document.getElementById(id);

function agg(rows){ return {n:rows.length, over:rows.filter(r=>r.days>0).length, days:rows.reduce((s,r)=>s+r.days,0),
  charge:rows.reduce((s,r)=>s+r.charge,0), cust:rows.reduce((s,r)=>s+r.custAmt,0), hal:rows.reduce((s,r)=>s+r.charge-r.collect,0),
  c20:rows.filter(r=>r.size==="20'").length, c40:rows.filter(r=>r.size==="40'").length}; }
function isoDay(n){ if(n==null) return "NOETD"; const d=new Date(n*DAY); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; }
function exportName(r){
  return [isoDay(r.etd),r.svc,r.vsl,r.voyNo,r.pol,r.lwharf].map(v=>String(v||"-").trim().replace(/[\\/:*?"<>|\s]+/g,"-")).join("_")+".xlsx";
}
const LOC_NAME = code => (LOCS.find(l=>l.code===code)||{}).name || code || "";
const voyName = r0 => exportName(r0).replace(/\.xlsx$/,"");
const docId = name => name.replace(/[^A-Za-z0-9_.~:@+-]/g,"-").slice(0,190) || "voyage";
const monthOf = v => (v.meta.etd||"").slice(0,7);
const TH_MONTH=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthLabel = m => m ? `${TH_MONTH[+m.slice(5,7)-1]} ${m.slice(0,4)}` : "No ETD";
const etdDay = v => v.meta.etd ? dayFromISO(v.meta.etd) : null;
const sumOf = vs => vs.reduce((t,v)=>{ for(const k in v.sum) t[k]=(t[k]||0)+(v.sum[k]||0); return t; },{});
