/* หน้า Tariff */
/* ------------------------------------------------------------------ tariff view */
(function(){
  const ts=CUST_RATES["GP|20'"];
  const rows=ts.map((t,i)=>{
    const lbl = i+1<ts.length ? `วันที่ ${t[0]}–${ts[i+1][0]-1}` : `วันที่ ${t[0]} ขึ้นไป`;
    return `<tr><td>${lbl}</td>${["GP|20'","GP|40'","DG|20'","DG|40'"].map(k=>`<td class="num">${money(CUST_RATES[k][i][1])}</td>`).join("")}</tr>`;
  }).join("");
  $("t-cards").innerHTML = `<div class="panel tcard"><h3><span class="chip acc">Customer</span>ค่า Storage ลูกค้า (บาท/วัน/ตู้)</h3>
      <p>ใช้ทุก terminal · Free time GP/OOG/TK/FLEXIBAG 5 วัน · DG/RF 3 วัน</p>
      <div style="overflow-x:auto"><table class="tt"><thead><tr><th></th><th colspan="2" style="text-align:center">GP · RF · OOG · TK · FLEXIBAG</th><th colspan="2" style="text-align:center">DG</th></tr><tr><th>วันคิดเงิน</th><th>20'</th><th>40'</th><th>20'</th><th>40'</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="panel tcard"><h3><span class="chip rf">RF</span>Electric charge (บาท/วัน/ตู้)</h3>
      <p>คิดเฉพาะตู้ RF ตามจำนวนวันคิดเงิน (เกิน free time 3 วัน)</p>
      <div style="overflow-x:auto"><table class="tt"><thead><tr><th></th><th>20' RF</th><th>40' RF</th></tr></thead><tbody><tr><td>ต่อวัน</td><td class="num">${money(ELECTRIC_RF["20'"])}</td><td class="num">${money(ELECTRIC_RF["40'"])}</td></tr></tbody></table></div></div>`;
})();
