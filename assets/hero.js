/* ส่วนหัว: ฉากลานตู้ HEUNG A (ตู้น้ำเงิน/เขียวซ้อนกัน, ปั้นจั่นยกตู้ลงรถ, รถขนตู้วิ่งเข้าออก) + นาฬิกา */
(function(){
  const host = document.getElementById("hero-scene");
  if (host) {
    const BLUES = ["#1C5DA8","#2873C4","#164B8C","#3A8BD6"];
    const GREENS = ["#1D8A57","#26A167","#13744A","#3BB27B"];
    const COLORS = [...BLUES, ...GREENS];
    const W = 52, H = 22, GROUND = 170;
    const rowTop = k => GROUND - H - 23 * k;

    // one container symbol per colour: corrugated side, rails, door end, "HEUNG A" on the side
    let ribs = "";
    for (let x = 3; x < W - 7; x += 3.5) ribs += `M${x.toFixed(1)} 2.4V19.6`;
    const defs = COLORS.map((c, i) => `
      <symbol id="ctr${i}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <rect width="${W}" height="${H}" rx="1.2" fill="${c}"/>
        <path d="${ribs}" stroke="#06223F" stroke-opacity=".22" stroke-width=".8"/>
        <rect width="${W}" height="2.4" fill="#06223F" opacity=".22"/>
        <rect y="19.6" width="${W}" height="2.4" fill="#06223F" opacity=".28"/>
        <rect x="${W - 6}" width="6" height="${H}" fill="#06223F" opacity=".14"/>
        <path d="M${W - 4} 4V18M${W - 2} 4V18" stroke="#fff" stroke-opacity=".35" stroke-width=".6"/>
        <text x="${(W - 6) / 2}" y="14.2" text-anchor="middle" font-family="'Bai Jamjuree',system-ui,sans-serif" font-size="6.6" font-weight="700" letter-spacing=".7" fill="#fff">HEUNG A</text>
      </symbol>`).join("");
    const ctr = (i, x, y, extra = "") => `<use href="#ctr${i % COLORS.length}" x="${x}" y="${y}" ${extra}/>`;

    // container stacks (fixed pattern so the scene looks the same for everyone)
    const stack = (x0, heights, seed) => heights.map((h, col) => {
      let s = "";
      for (let k = 0; k < h; k++) s += ctr((seed + col * 3 + k * 5) % COLORS.length, x0 + col * (W + 2), rowTop(k));
      return s;
    }).join("");
    const left = stack(8, [3, 4, 4, 2, 4, 3, 4, 3], 1);
    const right = stack(800, [4, 3, 4, 4, 2, 4, 3], 4);
    // extra stacks past both edges: wide screens show them instead of cropping the crane's top
    const farLeft = stack(-296, [2, 4, 3, 4, 3], 3), farRight = stack(1180, [3, 4, 2, 4, 3, 4], 2);
    // column under the crane: 2 fixed + the top one the crane picks up
    const PICK_X = 474, TRUCK_X = 690;
    const under = ctr(2, PICK_X, rowTop(0)) + ctr(5, PICK_X, rowTop(1));

    const truck = (cab, body = "") => `
      <rect x="-44" y="147" width="88" height="5" rx="1" fill="#24364A"/>
      ${body}
      <path d="M44 152V131q0-4 4-4h11q4 0 6 4l5 9v12z" fill="${cab}"/>
      <path d="M50 131h8l5 9H50z" fill="#CFE7FA"/>
      <rect x="44" y="152" width="26" height="4" fill="#24364A"/>
      ${[-32, -18, 30, 58].map(x => `<circle cx="${x}" cy="162" r="7" fill="#1B2733"/><circle cx="${x}" cy="162" r="2.6" fill="#9FB0BF"/>`).join("")}`;

    const K = "0;0.08;0.10;0.20;0.40;0.55;0.60;0.70;0.92;1";
    const svg = `
<svg viewBox="-300 0 1800 200" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" role="img" aria-label="A gantry crane lifts a HEUNG A container from the stack onto a truck">
  <defs>${defs}</defs>
  <g fill="#fff" opacity=".9">
    <g><ellipse cx="140" cy="28" rx="34" ry="9"/><ellipse cx="165" cy="22" rx="22" ry="10"/>
      <animateTransform attributeName="transform" type="translate" values="0 0;60 0;0 0" dur="60s" repeatCount="indefinite"/></g>
    <g><ellipse cx="980" cy="20" rx="40" ry="9"/><ellipse cx="1005" cy="14" rx="24" ry="9"/>
      <animateTransform attributeName="transform" type="translate" values="0 0;-50 0;0 0" dur="70s" repeatCount="indefinite"/></g>
  </g>
  <rect x="-300" y="${GROUND}" width="1800" height="30" fill="#C7D5E1"/>
  <rect x="-300" y="${GROUND}" width="1800" height="2" fill="#AFC0CE"/>
  <path d="M-300 186H1500" stroke="#fff" stroke-width="2" stroke-dasharray="18 14" opacity=".8"/>
  ${farLeft}${left}${right}${farRight}${under}
  <!-- top container of the column: hidden while the crane carries it -->
  <g>${ctr(1, PICK_X, rowTop(2))}<animate attributeName="opacity" values="1;0;1" keyTimes="0;0.10;0.92" dur="10s" calcMode="discrete" repeatCount="indefinite"/></g>

  <!-- truck under the crane: waits, receives a box, drives off; an empty one rolls in -->
  <g>
    <g>${truck("#1D8A57")}
      <g>${ctr(1, -26, 125)}<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.60;0.80" dur="10s" calcMode="discrete" repeatCount="indefinite"/></g>
    </g>
    <animateTransform attributeName="transform" type="translate" dur="10s" repeatCount="indefinite"
      values="${TRUCK_X} 0;${TRUCK_X} 0;${TRUCK_X + 560} 0;${TRUCK_X - 700} 0;${TRUCK_X - 700} 0;${TRUCK_X} 0" keyTimes="0;0.64;0.80;0.80;0.84;1"/>
  </g>

  <!-- rubber-tyred gantry crane -->
  <g fill="#2166B0">
    <rect x="440" y="24" width="10" height="146"/><rect x="766" y="24" width="10" height="146"/>
    <rect x="432" y="18" width="352" height="11" rx="2"/>
    <rect x="432" y="29" width="352" height="3" fill="#174E8A"/>
    <path d="M450 40L766 150M450 150L766 40" stroke="#2166B0" stroke-width="2.4" opacity=".25" fill="none"/>
    <rect x="424" y="164" width="34" height="8" rx="3" fill="#1B2733"/><rect x="758" y="164" width="34" height="8" rx="3" fill="#1B2733"/>
    <rect x="452" y="34" width="20" height="16" rx="2" fill="#1D8A57"/><rect x="456" y="38" width="12" height="6" fill="#CFE7FA"/>
  </g>
  <!-- trolley + hoist + carried box -->
  <g>
    <rect x="-16" y="30" width="32" height="9" rx="2" fill="#F2B23A"/>
    <line x1="-9" y1="39" x2="-9" y2="48" stroke="#1B2733" stroke-width="1.4"><animate attributeName="y2" dur="10s" repeatCount="indefinite" keyTimes="${K}" values="48;98;98;48;48;121;121;48;48;48"/></line>
    <line x1="9" y1="39" x2="9" y2="48" stroke="#1B2733" stroke-width="1.4"><animate attributeName="y2" dur="10s" repeatCount="indefinite" keyTimes="${K}" values="48;98;98;48;48;121;121;48;48;48"/></line>
    <g>
      <rect x="-28" y="48" width="56" height="4" rx="1" fill="#F2B23A"/>
      <g>${ctr(1, -26, 52)}<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.10;0.60" dur="10s" calcMode="discrete" repeatCount="indefinite"/></g>
      <animateTransform attributeName="transform" type="translate" dur="10s" repeatCount="indefinite" keyTimes="${K}" values="0 0;0 50;0 50;0 0;0 0;0 73;0 73;0 0;0 0;0 0"/>
    </g>
    <animateTransform attributeName="transform" type="translate" dur="10s" repeatCount="indefinite" keyTimes="${K}"
      values="${PICK_X + 26} 0;${PICK_X + 26} 0;${PICK_X + 26} 0;${PICK_X + 26} 0;${TRUCK_X} 0;${TRUCK_X} 0;${TRUCK_X} 0;${TRUCK_X} 0;${PICK_X + 26} 0;${PICK_X + 26} 0"/>
  </g>

  <!-- a loaded truck passing on the front lane -->
  <g>
    <g transform="translate(0 24)">${truck("#2166B0", ctr(4, -26, 125))}</g>
    <animateTransform attributeName="transform" type="translate" values="-460 0;1660 0" dur="22s" repeatCount="indefinite"/>
  </g>
</svg>`;
    host.innerHTML = svg;
    const el = host.querySelector("svg");
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches && el.pauseAnimations) {
      el.setCurrentTime(4.8); el.pauseAnimations();
    }
  }

  const clock = document.getElementById("hero-clock");
  if (clock) {
    const fmt = new Intl.DateTimeFormat("en-US", {weekday:"short", month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit"});
    const tick = () => { clock.textContent = fmt.format(new Date()); };
    tick(); setInterval(tick, 1000);
  }
})();
