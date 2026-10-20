// ==========================================================================
// Keyboard Controller page controller (module)
// ==========================================================================
// Purpose : drives the remote-control page: theme engine, WASD/arrow drive, speed/turn sliders, motor slots, and live stats.
// Depends : js/config.js (CONFIG global) — classic script
// Depends : js/hub/spike-hub.js (SPIKE global) — classic script
// Exports : none (side-effect module — wires the page and starts it)
//
// The old inline copy wrapped everything in an IIFE for isolation; a module
// is already scoped and strict, so the wrapper was dropped and the body kept.
// ---------------------------------------------------------------------

// ==========================================================================
// THEME ENGINE  (port of themes.py)
// ==========================================================================
function hls(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  let m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  let m1 = 2 * l - m2;
  const v = (m1, m2, hue) => {
    hue = ((hue % 1) + 1) % 1;
    if (hue < 1/6) return m1 + (m2 - m1) * hue * 6;
    if (hue < 0.5) return m2;
    if (hue < 2/3) return m1 + (m2 - m1) * (2/3 - hue) * 6;
    return m1;
  };
  const r = Math.round(v(m1, m2, h + 1/3) * 255);
  const g = Math.round(v(m1, m2, h)       * 255);
  const b = Math.round(v(m1, m2, h - 1/3) * 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function makeTheme(hue, sec, lift, sat) {
  const c = [0.045,0.08,0.11,0.14,0.17,0.23,0.15,0.03].map(x => Math.min(0.95, x + lift * 0.25));
  const g = (h, s, l) => hls(h, s, Math.min(0.95, l));
  const bg = g(hue, 0.14+sat*0.10, c[0]);
  const panel = g(hue, 0.16+sat*0.10, c[1]);
  const panel2 = g(hue, 0.17+sat*0.10, c[2]);
  const border = g(hue, 0.16+sat*0.10, c[7]);
  const btn = g(hue, 0.15+sat*0.10, c[3]);
  const btn_hi = g(hue, 0.17+sat*0.12, c[4]);
  const btn_pr = g(hue, 0.18+sat*0.12, c[5]);
  const text = g(hue, 0.10, 0.90);
  const muted = g(hue, 0.08, 0.58);
  const cyan = g(hue, sat, 0.62);
  const green = g(145, 0.55, 0.56);
  const amber = g(38, 0.80, 0.62);
  const red = g(0, 0.72, 0.62);
  const logbg = g(hue, 0.12, 0.035);
  const logfg = g(hue, 0.10, 0.74);
  return {
    name:"", group:"",
    bg, panel, panel2, border, text, muted, cyan, green, amber, red,
    btn, btn_hi, btn_pr,
    logbg, logfg,
    log_cmd:cyan, log_err:red, log_ok:green, log_dim:muted,
    connect_bg:g(hue,0.35,0.34), connect_hi:g(hue,0.42,0.45),
    connect_pr:g(hue,0.40,0.24), connect_dis:g(hue,0.22,0.20),
    diag_bg:g(sec,0.30,0.26), diag_fg:g(sec,0.40,0.85),
    diag_hi:g(sec,0.34,0.37), diag_dis:g(sec,0.22,0.18),
    sel_bg:g(hue,0.45,0.32), banner_bg:g(38,0.35,0.20), banner_fg:g(40,0.75,0.74),
    pad_down_bg:g(sec,0.38,0.30),
    space_bg:g(0,0.42,0.26), space_fg:g(0,0.75,0.84), space_hi:g(0,0.48,0.34),
    space_on_bg:g(0,0.62,0.33), space_on_hi:g(0,0.66,0.44),
    test_bg:g(150,0.34,0.28), test_fg:g(150,0.60,0.86), test_hi:g(150,0.44,0.38),
    port_bg:g(150,0.42,0.28), port_hi:g(150,0.48,0.38), port_fg:g(150,0.70,0.86),
    rev_bg:g(38,0.48,0.28), rev_hi:g(38,0.55,0.38), rev_fg:g(40,0.80,0.86),
    scan_dis:g(hue,0.16,0.16)
  };
}

function defaultTheme() {
  return {
    name:"default 1", group:"★ Default",
    bg:"#0d1017", panel:"#141925", panel2:"#1b2233", border:"#242e45",
    text:"#e9edf5", muted:"#8b96ab", cyan:"#00e5ff", green:"#3ddc97",
    amber:"#ffb054", red:"#ff5c5c",
    btn:"#232b3f", btn_hi:"#2e3a55", btn_pr:"#17203a",
    logbg:"#080b12", logfg:"#c9d2e0",
    log_cmd:"#00e5ff", log_err:"#ff5c5c", log_ok:"#3ddc97", log_dim:"#8b96ab",
    connect_bg:"#1d5a86", connect_hi:"#2471a6", connect_pr:"#17486a", connect_dis:"#173d56",
    diag_bg:"#3b3554", diag_fg:"#d9cfff", diag_hi:"#4c4380", diag_dis:"#2c2850",
    sel_bg:"#124f7a", banner_bg:"#3a2a12", banner_fg:"#ffd9a0",
    pad_down_bg:"#12364f",
    space_bg:"#5a2d2d", space_fg:"#ffd0d0", space_hi:"#7a3a3a",
    space_on_bg:"#8a1f1f", space_on_hi:"#ab3333",
    test_bg:"#1d5a3e", test_fg:"#dffff0", test_hi:"#27945f",
    port_bg:"#1f5a34", port_hi:"#2d8a4d", port_fg:"#d8ffe9",
    rev_bg:"#6b4a12", rev_hi:"#a8731f", rev_fg:"#ffe0a0",
    scan_dis:"#26324f"
  };
}

const THEME_SPECS = [
  ["🌸 Soft / Cute", [
    ["CuteBlossom",340,160,0.10,0.55],["Bubblegum",325,180,0.12,0.60],["Pastel",270,200,0.08,0.35],
    ["Cotton Candy",300,190,0.14,0.48],["Lavender",265,210,0.10,0.45],["Peach",25,160,0.12,0.55],
    ["Dreamy",285,170,0.11,0.40],["Sweetheart",350,150,0.13,0.58],["Soft Glow",40,190,0.09,0.35],
    ["Cloud",210,180,0.07,0.30],["Powder Rose",355,200,0.11,0.32],["Lemonade",55,180,0.10,0.42],
    ["Strawberry",345,130,0.12,0.62],["Blossom Glow",320,170,0.11,0.50]
  ]],
  ["🌑 Dark / Sleek", [
    ["Midnight",235,190,0.03,0.25],["Eclipse",260,200,0.02,0.20],["Obsidian",0,140,0.01,0.10],
    ["Shadow",220,170,0.02,0.16],["Noir",250,150,0.0,0.06],["Carbon",200,180,0.01,0.12],
    ["Onyx",330,160,0.01,0.14],["Nightfall",245,210,0.04,0.22],["Dark Matter",280,170,0.0,0.08],
    ["Void",260,200,0.0,0.04],["Ink",225,200,0.01,0.10],["Dusk",265,160,0.03,0.18],
    ["Umbra",280,140,0.0,0.06],["Slate Black",210,190,0.02,0.14]
  ]],
  ["💻 Techy / Futuristic", [
    ["Cyber",190,150,0.07,0.85],["Neon",160,200,0.08,0.90],["Circuit",135,190,0.06,0.75],
    ["Quantum",215,160,0.07,0.80],["Matrix",115,170,0.05,0.70],["Digital",175,205,0.08,0.82],
    ["Synth",285,160,0.09,0.85],["Aurora",210,150,0.08,0.72],["Hyper",320,180,0.09,0.88],
    ["Nova",45,200,0.08,0.85],["Byte",150,210,0.06,0.78],["Chip",190,140,0.06,0.72],
    ["Plasma",300,170,0.08,0.86],["Hologram",240,190,0.07,0.70]
  ]],
  ["🌿 Nature", [
    ["Forest",120,160,0.05,0.48],["Evergreen",140,170,0.04,0.45],["Meadow",90,150,0.06,0.55],
    ["Ocean",200,170,0.06,0.58],["Wildflower",300,120,0.06,0.50],["Moss",80,160,0.04,0.40],
    ["Sunset",20,170,0.08,0.60],["Alpine",210,190,0.04,0.35],["Earth",30,150,0.05,0.45],
    ["Rainfall",195,160,0.05,0.40],["Dune",35,160,0.06,0.35],["Tide",205,150,0.06,0.50],
    ["Vine",105,175,0.05,0.45],["Bamboo",135,185,0.05,0.42]
  ]],
  ["🧊 Minimal / Clean", [
    ["Pure",210,170,0.06,0.12],["Clear",190,160,0.07,0.20],["Simple",0,150,0.05,0.05],
    ["Mono",0,0,0.05,0.0],["Slate",220,180,0.05,0.18],["Frost",200,190,0.08,0.25],
    ["Linen",40,150,0.06,0.10],["Paper",50,160,0.07,0.08],["Neutral",250,170,0.05,0.10],
    ["Glass",180,200,0.06,0.22],["Fog",210,170,0.04,0.08],["Ice",185,190,0.08,0.18],
    ["Mercury",0,150,0.02,0.05],["Pearl",60,180,0.07,0.12]
  ]],
  ["🔥 Bold / Energetic", [
    ["Inferno",12,45,0.09,0.95],["Electric",270,200,0.08,0.90],["Pulse",330,210,0.08,0.92],
    ["Ignite",18,150,0.09,0.90],["Rush",130,200,0.07,0.88],["Voltage",60,200,0.08,0.85],
    ["Blaze",25,10,0.09,0.92],["Turbo",220,190,0.07,0.88],["Impact",350,160,0.08,0.90],
    ["Surge",165,210,0.07,0.90],["Sonic",260,190,0.08,0.90],["Laser",70,210,0.08,0.88],
    ["Fuse",340,140,0.08,0.86],["Thunder",230,200,0.07,0.85]
  ]],
  ["✨ Fancy / Premium", [
    ["Royal",265,200,0.08,0.75],["Velvet",320,180,0.08,0.70],["Prestige",240,190,0.09,0.55],
    ["Platinum",205,190,0.08,0.25],["Luxe",300,45,0.09,0.65],["Opal",200,170,0.08,0.35],
    ["Diamond",210,180,0.09,0.28],["Silk",275,160,0.08,0.40],["Gold",42,30,0.08,0.75],
    ["Imperial",30,300,0.07,0.60],["Sapphire",215,200,0.08,0.60],["Crimson",350,200,0.07,0.68],
    ["Emerald",145,210,0.06,0.55],["Champagne",50,180,0.08,0.35]
  ]],
  ["🪐 Weird / Experimental", [
    ["Cosmic",280,170,0.07,0.85],["Glitch",315,140,0.09,0.95],["Flux",150,300,0.08,0.85],
    ["Paradox",45,320,0.08,0.80],["Distortion",340,80,0.09,0.90],["Gravity",260,200,0.04,0.60],
    ["Mirage",190,40,0.08,0.75],["Chaos",20,250,0.09,0.95],["Phantom",300,120,0.05,0.50],
    ["Dimension",230,60,0.06,0.80],["Enigma",205,60,0.05,0.65],["Abyss",300,90,0.03,0.45],
    ["Mixture",60,290,0.07,0.72],["Anomaly",330,50,0.09,0.88]
  ]]
];

const THEMES = {"default 1": defaultTheme()};
for (const [group, entries] of THEME_SPECS)
  for (const [name, hue, sec, lift, sat] of entries) {
    const t = makeTheme(hue, sec, lift, sat);
    t.name = name; t.group = group; THEMES[name] = t;
  }

function setThemeVars(t) {
  const r = document.documentElement.style;
  const map = {
    bg:t.bg, panel:t.panel, panel2:t.panel2, border:t.border, text:t.text,
    muted:t.muted, cyan:t.cyan, green:t.green, amber:t.amber, red:t.red,
    btn:t.btn, "btn-hi":t.btn_hi, "btn-pr":t.btn_pr,
    logbg:t.logbg, logfg:t.logfg,
    "log-cmd":t.log_cmd, "log-err":t.log_err, "log-ok":t.log_ok, "log-dim":t.log_dim,
    conn:t.connect_bg, "conn-hi":t.connect_hi, "conn-pr":t.connect_pr, "conn-dis":t.connect_dis,
    diag:t.diag_bg, "diag-hi":t.diag_hi, "diag-dis":t.diag_dis,
    sel:t.sel_bg, "pad-down":t.pad_down_bg,
    space:t.space_bg, "space-fg":t.space_fg, "space-hi":t.space_hi,
    "space-on":t.space_on_bg, "space-on-hi":t.space_on_hi,
    test:t.test_bg, "test-fg":t.test_fg, "test-hi":t.test_hi,
    port:t.port_bg, "port-hi":t.port_hi, "port-fg":t.port_fg,
    rev:t.rev_bg, "rev-hi":t.rev_hi, "rev-fg":t.rev_fg,
    "scan-dis":t.scan_dis
  };
  for (const [k,v] of Object.entries(map)) r.setProperty("--"+k, v);
}

let currentTheme = localStorage.getItem("spike_kc_theme") || "default 1";
if (!THEMES[currentTheme]) currentTheme = "default 1";
function applyTheme(name, save=true) {
  currentTheme = name;
  setThemeVars(THEMES[name]);
  document.getElementById("tTheme").textContent = name;
  if (save) { localStorage.setItem("spike_kc_theme", name); bump("theme_switches"); }
  // update gauge stroke color
  const gc = THEMES[name].muted;
  document.getElementById("gauge").setAttribute("stroke", gc);
  // motor accent per card could stay cyan for now
}

// ---- build picker menu ----
function buildPicker() {
  const el = document.getElementById("picker");
  let html = '<div class="opt on" data-t="default 1"><span class="preview" style="background:#0d1017"></span>default 1</div>';
  for (const [group, entries] of THEME_SPECS) {
    html += '<div class="grp">' + group + '</div>';
    for (const [name] of entries)
      html += '<div class="opt" data-t="'+name+'"><span class="preview" style="background:'+makeTheme(...entries.find(e=>e[0]===name).slice(1)).bg+'"></span>'+name+'</div>';
  }
  el.innerHTML = html;
  el.addEventListener("click", (e) => {
    const opt = e.target.closest(".opt");
    if (!opt) return;
    applyTheme(opt.dataset.t);
    el.querySelectorAll(".opt").forEach(o => o.classList.toggle("on", o.dataset.t === currentTheme));
    document.getElementById("picker").classList.remove("open");
  });
}
buildPicker();
applyTheme(currentTheme, false); // restore without bumping switch count on load
document.getElementById("tTheme").textContent = currentTheme;

// ==========================================================================
// STATE
// ==========================================================================
const C = CONFIG;
const $ = (id) => document.getElementById(id);
const hub = new SPIKE.WebSpikeHub();
let selectedDev = null;       // currently selected device in list
let connected = false;
let connectName = "";
const devices = [];           // [{dev,name,id}]
const physKeys = new Set();
const padKeys = new Set();
let stopEngaged = false;
let spaceToggledAt = 0;
let speed = C.DEFAULT_SPEED_PERCENT;
let stepVal = C.DEFAULT_SPEED_STEP;
let turnStrength = C.DEFAULT_TURN_STRENGTH;
let mode = C.DEFAULT_DRIVE_MODE;
const front = { f1: C.FRONT_SLOT_PORTS[0], f2: C.FRONT_SLOT_PORTS[1] };
const back = { b1: C.BACK_SLOT_PORTS[0], b2: C.BACK_SLOT_PORTS[1] };
const reversed = new Set(C.REVERSED_PORTS || []);
const motors = {};
const rotation = {};
const prevAngle = {};
let logLines = 0;
let logClearAt = 600;

// ==========================================================================
// LOG
// ==========================================================================
const logBox = $('log');
function log(text, cls) {
  const ts = '[' + new Date().toLocaleTimeString([], {hour12:false}) + '] ';
  const span = document.createElement("span");
  span.className = cls || "";
  span.textContent = ts + text + "\n";
  logBox.appendChild(span);
  logLines++;
  if (logLines > logClearAt) { logBox.textContent = ''; logLines = 0; }
  logBox.scrollTop = logBox.scrollHeight;
  $('logCount').textContent = 'lines: ' + logLines;
}

// ==========================================================================
// STATS  (same keys as desktop stats.py)
// ==========================================================================
const LIFE_KEY = 'spike_kc_lifetime_v1';
const SESSION_ROWS = [
  ['uptime','Uptime','time'],['connect_ok','Connects','count'],
  ['connected_time','Time connected','time'],['driving_time','Time driving','time'],
  ['drive_commands','Drive commands','count'],['handbrake_pulls','Handbrake pulls','count'],
  ['handbrake_releases','Handbrake releases','count'],['max_speed','Fastest speed','pct'],
  ['speed_changes','Speed changes','count'],
  ['motor_rotation','Motor rotation','deg'],
  ['key_W','W / forward keys','count'],['key_A','A / left keys','count'],
  ['key_S','S / reverse keys','count'],['key_D','D / right keys','count'],
  ['arrows_up','Speed up presses','count'],['arrows_down','Speed down presses','count'],
  ['space_pressed','Space presses','count'],
];
const LIFETIME_ROWS = [
  ['sessions','App launches','count'],['scans','Bluetooth scans','count'],
  ['hubs_found','Hubs discovered','count'],['connect_attempts','Connect attempts','count'],
  ['connect_ok','Connects','count'],['connect_fail','Connect failures','count'],
  ['connected_time','Time connected (all time)','time'],
  ['driving_time','Time driving (all time)','time'],
  ['drive_commands','Drive commands (all time)','count'],
  ['forward','Forward runs','count'],['backward','Reverse runs','count'],
  ['left','Left turns','count'],['right','Right turns','count'],
  ['handbrake_pulls','Handbrake pulls (all time)','count'],
  ['handbrake_releases','Handbrake releases (all time)','count'],
  ['motor_rotation','Motor rotation (all time)','deg'],
  ['max_battery','Highest charge seen','pct'],
  ['theme_switches','Theme switches','count'],['motor_checks','Attachment checks','count'],
];
const FMT = {
  count: (n) => String(Math.round(n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,','),
  pct:   (n) => Math.round(n||0)+'%',
  deg:   (n) => Math.round(n||0).toLocaleString()+'°',
  time:  (s) => {
    s = Math.max(0, Math.round(s||0));
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return h ? h+'h '+('0'+m).slice(-2)+'m '+('0'+sec).slice(-2)+'s'
         : m  ? m+'m '+('0'+sec).slice(-2)+'s'
         : sec+'s';
  }
};
function loadLife() { try { return JSON.parse(localStorage.getItem(LIFE_KEY)) || {}; } catch { return {}; } }
function saveLife() { try { localStorage.setItem(LIFE_KEY, JSON.stringify(lifeStats)); } catch {} }
const sess = {};
let lifeStats = loadLife();
if (!('sessions' in lifeStats)) lifeStats.sessions = 0;
lifeStats.sessions += 1;
const boot = Date.now() / 1000;
let drivingNow = false;
let battery = null, batteryTemp = null;

function bump(key, n) {
  sess[key] = (sess[key]||0) + (n||1);
  if (key !== 'sessions') lifeStats[key] = (lifeStats[key]||0) + (n||1);
  saveLife(); renderStats();
}
function maxstat(key, v) {
  if (v > (sess[key]||0)) sess[key] = v;
  if (v > (lifeStats[key]||0)) lifeStats[key] = v;
  saveLife(); renderStats();
}
function accu(key, s) {
  sess[key] = (sess[key]||0) + s;
  lifeStats[key] = (lifeStats[key]||0) + s;
  saveLife();
}

// ==========================================================================
// HEADER / TABS
// ==========================================================================
function refreshHeader() {
  const led = $('led'), txt = $('status');
  if (connected) {
    txt.textContent = 'CONNECTED' + (connectName ? ' · ' + connectName : '');
    txt.style.color = 'var(--green)'; led.style.color = 'var(--green)';
    $('connDetail').textContent = 'Connected to ' + connectName;
  } else {
    txt.textContent = 'DISCONNECTED'; txt.style.color = 'var(--red)'; led.style.color = 'var(--red)';
    $('connDetail').textContent = 'Not connected';
  }
  // stats tile
  const shown = connected ? 'CONNECTED' : 'OFFLINE';
  const col = connected ? 'var(--green)' : 'var(--red)';
  const tConn = $('tConn'); tConn.textContent = shown; tConn.style.color = col;
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const t = e.target.closest(".tab"); if (!t) return;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.t === t.dataset.t));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("on"));
  document.getElementById("page-" + t.dataset.t).classList.add("on");
  renderStats();
});

// ==========================================================================
// DEVICE LIST
// ==========================================================================
function renderDevList() {
  const el = $('devlist');
  if (!devices.length) { el.innerHTML = '<div class="ph">No Hub yet — press SCAN</div>'; return; }
  el.innerHTML = devices.map((d,i) =>
    '<div class="dev' + (selectedDev===d?' sel':'') + '" data-i="'+i+'"><span class="nm">'+d.name+'</span><span class="id">'+d.id+'</span></div>'
  ).join('');
}
$('devlist').addEventListener("click", (e) => {
  const row = e.target.closest(".dev"); if (!row) return;
  selectedDev = devices[parseInt(row.dataset.i)] || null;
  renderDevList();
});

// ==========================================================================
// MOTOR CHECK
// ==========================================================================
function renderMotorCheck() {
  const ports = hub.profile ? hub.profile.all_ports.filter(Boolean) : [];
  if (!ports.length) { $('mcheck').innerHTML = 'MOTOR CHECK: <span style="color:var(--muted)">no drive ports configured</span>'; return; }
  const parts = ports.map(p => {
    const ok = (motors[p]||-1) > 0;
    return '<span class="' + (ok?'port-ok':'port-fail') + '">' + p + (ok?'✓':'✗') + '</span>';
  });
  $('mcheck').innerHTML = 'MOTOR CHECK: ' + parts.join(' ');
  if (ports.some(p => (motors[p]||-1) <= 0)) log('Check motors: plug a motor into every configured port and reconnect.');
}

// ==========================================================================
// BLUETOOTH
// ==========================================================================
$('scanBtn').addEventListener("click", doScan);
$('connectBtn').addEventListener("click", doConnect);
$('disconnectBtn').addEventListener("click", doDisconnect);

async function doScan() {
  if (!SPIKE.WebSpikeHub.supported()) { log('This browser has no Web Bluetooth. Use Chrome, Edge or Safari 17+ on Mac.','err'); return; }
  $('scanBtn').disabled = true; bump('scans');
  try {
    log('Choosing a Hub (pick your SPIKE in the popup)...');
    const dev = await hub.pickDevice();
    log('Found: ' + dev.name + '  (' + dev.id + ')', 'ok');
    // dedupe by id
    const existing = devices.find(d => d.id === dev.id);
    if (!existing) devices.push(dev); else Object.assign(existing, dev);
    selectedDev = devices.find(d => d.id === dev.id) || dev;
    renderDevList();
    $('connectBtn').disabled = false;
    $('mcheck').textContent = 'MOTOR CHECK: —';
    bump('hubs_found');
  } catch(e) { log('Scan cancelled or failed: ' + (e && e.message || e), 'dim'); }
  finally { $('scanBtn').disabled = false; }
}
async function doConnect() {
  if (!selectedDev) { log('Select a hub from the list first.','err'); return; }
  if (selectedDev !== devices[devices.length-1]) {
    log('Only the most recently picked Hub can be connected — SCAN again to re-pick it.', 'dim'); return;
  }
  bump('connect_attempts'); $('connectBtn').disabled = true; $('scanBtn').disabled = true;
  $('status').textContent = 'CONNECTING...'; $('status').style.color = 'var(--amber)'; $('led').style.color = 'var(--amber)';
  try {
    await hub.connect();
    connected = true; connectName = hub.connectedName || selectedDev.name;
    bump('connect_ok'); log('Connected to ' + connectName + ' · protocol ' + hub.protocol, 'ok');
    applyProfile();
  } catch(e) { connected = false; bump('connect_fail'); log('Could not connect to the Hub: ' + (e && e.message||e), 'err'); }
  finally { $('scanBtn').disabled = false; $('connectBtn').disabled = !connected; $('disconnectBtn').disabled = !connected; refreshHeader(); }
}
async function doDisconnect() {
  $('disconnectBtn').disabled = true;
  stopRamp();
  try { await hub.disconnect(); } catch {}
  connected = false; drivingNow = false;
  $('connectBtn').disabled = true; $('disconnectBtn').disabled = true;
  $('mcheck').textContent = 'MOTOR CHECK: —';
  log('Disconnected.','dim'); refreshHeader(); renderStats();
}
hub.onLog = (msg) => log(msg);
hub.onDisconnect = () => {
  connected = false;
  stopRamp();
  try { refreshHeader(); } catch (e) { }
  log('Hub disconnected — reconnect to continue.', 'err');
};
hub.onAttach = (dm) => { Object.keys(motors).forEach(k=>delete motors[k]); Object.assign(motors,dm); bump('motor_checks'); renderMotorCheck(); };
hub.onState = (st) => {
  if (typeof st.battery === 'number') { battery = st.battery; maxstat('max_battery', st.battery); }
  if (typeof st.temperature === 'number') batteryTemp = st.temperature;
  for (const L of 'ABCDEF') {
    if (typeof st[L] !== 'number') continue;
    const v = st[L], prev = prevAngle[L];
    if (prev !== undefined) {
      let d = v - prev;
      if (d > 300) d -= 360; else if (d < -300) d += 360;
      rotation[L] = (rotation[L]||0) + Math.abs(d);
      bump('motor_rotation', Math.round(Math.abs(d)));
    }
    prevAngle[L] = v;
  }
  renderMotors(); renderStats();
};

// ==========================================================================
// DRIVE CONFIG
// ==========================================================================
function initSlotUI() {
  const el = $('slots');
  const slots = [
    ['f1','FRONT 1','f'],['f2','FRONT 2','f'],['b1','BACK 1','b'],['b2','BACK 2','b']
  ];
  el.innerHTML = slots.map(([k,lbl,cls]) =>
    '<div class="slot-row" id="row-'+k+'"><span class="slot-label '+cls+'">'+lbl+' · </span><button class="slot-btn" data-k="'+k+'">—</button></div>'
  ).join('');
  el.addEventListener("click", (e) => {
    const btn = e.target.closest(".slot-btn"); if (!btn) return;
    cycleSlot(btn.dataset.k);
  });
  // rev buttons
  const rb = $('revBtns');
  rb.innerHTML = C.AVAILABLE_PORTS.map(p =>
    '<button class="rev-btn" data-p="'+p+'">'+p+'</button>'
  ).join('');
  rb.addEventListener("click", (e) => {
    const btn = e.target.closest(".rev-btn"); if (!btn) return;
    toggleRev(btn.dataset.p);
  });
  refreshSlotUI();
}

function cycleSlot(key) {
  const store = key.startsWith('f') ? front : back;
  const used = new Set([front.f1,front.f2,back.b1,back.b2].filter(Boolean));
  const ports = C.AVAILABLE_PORTS.filter(p => !used.has(p) || p === store[key]);
  const idx = ports.indexOf(store[key]);
  store[key] = ports[idx+1] || null;
  refreshSlotUI();
  applyProfile();
  saveProfile();
  log('DRIVE CONFIG: ' + mode + '  F1='+(front.f1||'-')+' F2='+(front.f2||'-')+' B1='+(back.b1||'-')+' B2='+(back.b2||'-'));
  reapplyHeld();
}
function setDriveMode(m) {
  mode = m;
  $('m2wd').classList.toggle('on', m==='2WD');
  $('m4wd').classList.toggle('on', m==='4WD');
  refreshSlotUI(); applyProfile(); saveProfile();
  log('DRIVE MODE → ' + m);
  reapplyHeld();
}
function toggleRev(port) {
  if (reversed.has(port)) reversed.delete(port); else reversed.add(port);
  refreshSlotUI(); applyProfile(); saveProfile();
  log('REV ' + port + (reversed.has(port)?' ON':' OFF'));
  reapplyHeld();
}
function refreshSlotUI() {
  const is4 = mode==='4WD';
  ['b1','b2'].forEach(k => $('row-'+k).style.display = is4 ? '' : 'none');
  for (const [key,store] of [['f1',front],['f2',front],['b1',back],['b2',back]]) {
    const btn = document.querySelector('.slot-btn[data-k="'+key+'"]');
    const port = store[key];
    btn.textContent = port || '—';
    const isBack = key.startsWith('b');
    btn.classList.toggle('ported', !!port && !isBack);
    btn.classList.toggle('back-active', !!port && isBack);
    btn.style.color = port ? (isBack ? '#000' : 'var(--port-fg)') : '';
  }
  document.querySelectorAll('.rev-btn').forEach(b => {
    const on = reversed.has(b.dataset.p);
    b.classList.toggle('on', on);
    b.style.color = on ? 'var(--rev-fg)' : '';
  });
  validateDrivePorts();
}
function applyProfile() {
  hub.setProfile({ mode, front_ports:[front.f1,front.f2], back_ports:[back.b1,back.b2], reversed_ports:Array.from(reversed) });
}
function validateDrivePorts() {
  const f1=front.f1, f2=front.f2, b1=back.b1, b2=back.b2;
  const used = [f1,f2,b1,b2].filter(Boolean);
  const overlap = used.length !== new Set(used).size;
  const needsB1 = mode==='4WD';
  const valid = f1 && f2 && (!needsB1||b1) && !overlap;
  const el = $('driveHint');
  if (!valid) {
    const r = [];
    if (!f1) r.push('FRONT 1 needs a motor');
    if (!f2) r.push('FRONT 2 needs a motor');
    if (needsB1 && !b1) r.push('BACK 1 needs a motor');
    if (overlap) r.push('duplicate port');
    el.className = 'drive-hint warn'; el.textContent = '⚠  ' + r.join(' · ');
  } else {
    const parts = [];
    if (f1) parts.push('F1:'+f1); if (f2) parts.push('F2:'+f2); if (b1) parts.push('B1:'+b1); if (b2) parts.push('B2:'+b2);
    const rev = reversed.size ? '   ⇄ UP:'+Array.from(reversed).sort().join(',') : '';
    el.className = 'drive-hint ok'; el.textContent = 'DRIVING   ' + parts.join('   ') + '   (' + mode + ')' + rev;
  }
}

$('m2wd').addEventListener("click", () => setDriveMode('2WD'));
$('m4wd').addEventListener("click", () => setDriveMode('4WD'));
initSlotUI();

// ==========================================================================
// DRIVE LOGIC
// ==========================================================================
function commandFor(held) {
  const f=held.has('w'), b=held.has('s')&&!f, l=held.has('a'), r=held.has('d')&&!l;
  if (f) return l?'forward-left':r?'forward-right':'forward';
  if (b) return l?'backward-left':r?'backward-right':'backward';
  if (l) return 'left'; if (r) return 'right'; return 'stop';
}
// How much the inner wheel slows on a moving turn. turnStrength 0..100 maps
// to a factor 1..-1 (see config): >0 eases the arc, 0 stops the inner wheel,
// <0 counter-rotates for a tighter turn.
function turnFactor() {
  const t = Math.max(0, Math.min(100, turnStrength)) / 100;
  return Math.max(-1, Math.min(1, 1 - 2 * t));
}
function axisFor(cmd, s) {
  const k = turnFactor();
  const m = {forward:[s,s],backward:[-s,-s],left:[-s,s],right:[s,-s],
    'forward-left':[s*k,s],'forward-right':[s,s*k],
    'backward-left':[-s*k,-s],'backward-right':[-s,-s*k],stop:[0,0]};
  const a = m[cmd]||m.stop;
  return [Math.round(a[0]), Math.round(a[1])];
}
let lastAxis = null;
let rampId = 0;
let rampCur = [0,0,0];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function stopRamp() { rampId++; rampCur = [0,0,0]; }
// Send a drive target. Unless `immediate`, glide to it over TURN_RAMP_MS so
// starts, stops and turns don't jerk the tracks. Returns nothing; a newer
// target cancels an in-flight ramp.
function sendAxis(left,right,back, immediate) {
  if (!connected) return;
  left = Math.round(left||0); right = Math.round(right||0); back = Math.round(back||0);
  if (lastAxis && left===lastAxis[0] && right===lastAxis[1] && back===lastAxis[2]) return;
  lastAxis=[left,right,back]; bump('drive_commands');
  log('drive: L'+left+' R'+right+(back?' B'+back:''));
  drivingNow = !!(left||right||back);
  const myId = ++rampId;
  const target = [left,right,back];
  if (immediate || !(C.TURN_RAMP_MS > 0)) { rampCur = target.slice(); hub.drive(left,right,back); return; }
  const from = rampCur.slice();
  (async () => {
    for (let i=1; i<=C.TURN_RAMP_STEPS; i++) {
      await sleep(C.TURN_RAMP_MS / C.TURN_RAMP_STEPS);
      if (myId !== rampId || !connected) return;
      const f = i / C.TURN_RAMP_STEPS;
      const cur = [0,1,2].map(n => Math.round(from[n] + (target[n]-from[n])*f));
      rampCur = cur;
      try { await hub.drive(cur[0],cur[1],cur[2]); } catch (e) { return; }
    }
    rampCur = target.slice();
  })();
}
function reapplyHeld() {
  const held = new Set([...physKeys,...padKeys]);
  paintPad(held);
  const cmd = commandFor(held);
  if (cmd!=='stop') bump(cmd);
  if (stopEngaged) { sendAxis(0,0,0,true); return; }
  const [l,r] = axisFor(cmd, speed);
  let back=0; const f=held.has('w'), b=held.has('s')&&!f;
  if (mode==='4WD') { if (f) back=speed; else if (b) back=-speed; }
  sendAxis(l,r,back);
}
function paintPad(held) {
  document.querySelectorAll('.wk').forEach(b => b.classList.toggle('dn', held.has(b.dataset.k)));
}

// ==========================================================================
// SPACE / STOP
// ==========================================================================
function toggleStop() {
  const now = performance.now();
  if (now - spaceToggledAt < 300) return;
  spaceToggledAt = now; stopEngaged = !stopEngaged; bump('space_pressed');
  $('spBtn').classList.toggle('eng', stopEngaged);
  if (stopEngaged) { bump('handbrake_pulls'); physKeys.clear(); padKeys.clear(); paintPad(new Set()); sendAxis(0,0,0,true); log('HANDBRAKE: pulled  (SPACE again to release)'); }
  else { bump('handbrake_releases'); lastAxis=null; log('HANDBRAKE: released'); reapplyHeld(); }
}

// ==========================================================================
// SPEED / STEP
// ==========================================================================
function nudge(d) {
  if (stopEngaged) return;
  const next = Math.max(C.SPEED_MIN, Math.min(C.SPEED_MAX, speed + d));
  if (next===speed) return;
  bump(d>0?'arrows_up':'arrows_down'); bump('speed_changes');
  speed = next; $('spd').value=speed; $('spdVal').textContent=speed+'%'; $('tSpd').textContent=speed+'%';
  maxstat('max_speed', speed); log('SPEED → '+speed+'%  (step '+stepVal+')');
  saveProfile();
  reapplyHeld();
}
$('spd').addEventListener("input", function() {
  if (stopEngaged) { $('spd').value = speed; return; }
  speed = Math.max(C.SPEED_MIN, Math.min(C.SPEED_MAX, parseInt(this.value,10)||0));
  $('spdVal').textContent=speed+'%'; $('tSpd').textContent=speed+'%';
  maxstat('max_speed', speed); saveProfile(); reapplyHeld();
});
function clampStep() { if (stopEngaged) { $('step').value = stepVal; return; } stepVal = Math.max(1, Math.min(50, parseInt($('step').value,10)||C.DEFAULT_SPEED_STEP)); $('step').value=stepVal; saveProfile(); }
$('step').addEventListener("change", clampStep);
$('nUp').addEventListener("click", () => nudge(stepVal));
$('nDn').addEventListener("click", () => nudge(-stepVal));
$('turn').value = turnStrength; $('turnVal').textContent = turnStrength + '%';
$('turn').addEventListener("input", function() {
  turnStrength = Math.max(0, Math.min(100, parseInt(this.value,10)||0));
  $('turnVal').textContent = turnStrength + '%';
  saveProfile();
  reapplyHeld();
});

// ==========================================================================
// WASD PAD + KEYBOARD
// ==========================================================================
document.querySelectorAll('.wk').forEach(btn => {
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); padPress(btn.dataset.k); });
  btn.addEventListener("pointerup", () => padRelease(btn.dataset.k));
  btn.addEventListener("pointerleave", () => padRelease(btn.dataset.k));
});
function padPress(k) { if (tutOpen) return; if (k==='space') { toggleStop(); return; } if (stopEngaged) return; if (!padKeys.has(k)) { padKeys.add(k); bump('key_'+k.toUpperCase()); } reapplyHeld(); }
function padRelease(k) { if (k==='space') return; padKeys.delete(k); reapplyHeld(); }

const KEY_MAP = {' ':'space','Spacebar':'space','ArrowUp':'up','ArrowDown':'down','ArrowLeft':'left','ArrowRight':'right','Enter':'enter'};
const MOVE_KEYS = new Set(['w','a','s','d',' ','ArrowUp','ArrowDown']);
window.addEventListener("keydown", (e) => {
  if (tutOpen) return;
  if (e.repeat && e.key!==' ') return;
  const raw = e.key;
  if (MOVE_KEYS.has(raw)) e.preventDefault();
  if (raw==='ArrowUp') { nudge(stepVal); return; }
  if (raw==='ArrowDown') { nudge(-stepVal); return; }
  if (raw==='ArrowLeft' || raw==='ArrowRight') return;
  if (raw==='Escape' || raw==='q') return;
  const k = KEY_MAP[raw] || (raw.length===1 ? raw.toLowerCase() : null);
  if (!k) return;
  if (k==='space') { if (!e.repeat) toggleStop(); return; }
  if (stopEngaged) return;
  if (!physKeys.has(k)) {
    physKeys.add(k);
    bump('key_'+k.toUpperCase());
    if (['w','a','s','d'].includes(k)) log('key: ' + k + ' down', 'dim');
  }
  reapplyHeld();
});
window.addEventListener("keyup", (e) => {
  if (tutOpen) return;
  const k = KEY_MAP[e.key] || (e.key.length===1 ? e.key.toLowerCase() : null);
  if (!k || k==='space') return;
  if (physKeys.has(k) && ['w','a','s','d'].includes(k)) log('key: ' + k + ' up', 'dim');
  physKeys.delete(k); reapplyHeld();
});
window.addEventListener("blur", () => { physKeys.clear(); padKeys.clear(); reapplyHeld(); });

// ==========================================================================
// MOTOR CARDS
// ==========================================================================
function initMotorCards() {
  const shell = $('motorShell');
  shell.innerHTML = 'ABCDEF'.split('').map(L =>
    '<div class="mcard" id="mc-'+L+'" style="display:none"><div class="badge"><span class="dot">'+L+'</span><span class="port-lbl">PORT</span></div><div class="angle" id="ma-'+L+'">0°</div><div class="spin" id="ms-'+L+'">↻ 0° this run</div><div class="bar"><div class="bar-fill" id="mb-'+L+'"></div></div></div>'
  ).join('');
}
initMotorCards();
function renderMotors() {
  let anyActive = false;
  for (const L of 'ABCDEF') {
    const angle = prevAngle[L] ?? 0;
    const rot = rotation[L] || 0;
    const active = (motors[L]||0)>0 || angle !== 0 || rot > 0;
    const card = $('mc-'+L); if (!card) continue;
    card.style.display = active ? '' : 'none';
    if (!active) continue; anyActive = true;
    $('ma-'+L).textContent = angle.toLocaleString()+'°';
    $('ms-'+L).textContent = '↻ '+Math.round(rot).toLocaleString()+'° this run';
    $('mb-'+L).style.width = Math.min(100, (rot/720)*100) + '%';
  }
  $('motorEmpty').style.display = anyActive ? 'none' : '';
}

// ==========================================================================
// BATTERY GAUGE
// ==========================================================================
const circ = 2 * Math.PI * 44; // ≈276.46
function drawGauge() {
  const pct = battery;
  const g = $('gauge');
  if (pct == null) { g.setAttribute('stroke-dasharray','0 '+circ); $('gPct').textContent='—'; $('gTemp').textContent=''; return; }
  const f = Math.max(0, Math.min(100, pct)) / 100;
  const col = pct >= 50 ? 'var(--green)' : (pct >= 20 ? 'var(--amber)' : 'var(--red)');
  g.setAttribute('stroke', col);
  g.setAttribute('stroke-dasharray', (circ*f)+' '+circ);
  $('gPct').textContent = pct+'%';
  $('gPct').setAttribute('fill', 'var(--text)');
  $('gTemp').textContent = batteryTemp != null ? batteryTemp+'°C' : '';
  $('gTemp').setAttribute('fill', col);
  $('tTemp').textContent = batteryTemp != null ? batteryTemp+'°C' : '—';
}

// ==========================================================================
// STATS RENDER
// ==========================================================================
function renderStats() {
  sess.uptime = Date.now()/1000 - boot;
  $('sessRows').innerHTML = SESSION_ROWS.map(([k,lbl,f]) =>
    '<div class="tally-row"><span class="k">'+lbl+'</span><span class="v '+f+'">'+FMT[f](sess[k])+'</span></div>'
  ).join('');
  $('lifeRows').innerHTML = LIFETIME_ROWS.map(([k,lbl,f]) =>
    '<div class="tally-row"><span class="k">'+lbl+'</span><span class="v '+f+'">'+FMT[f](lifeStats[k])+'</span></div>'
  ).join('');
  $('tSpd').textContent = speed+'%';
  drawGauge();
}

// ==========================================================================
// THEME PICKER TOGGLE
// ==========================================================================
$('paletteBtn').addEventListener("click", (e) => { e.stopPropagation(); $('picker').classList.toggle('open'); });
document.addEventListener("click", () => $('picker').classList.remove('open'));
document.addEventListener("keydown", (e) => { if (e.key==='Escape') $('picker').classList.remove('open'); });

// ==========================================================================
// STATISTICS TICK  (1 Hz)
// ==========================================================================
setInterval(() => {
  if (connected) {
    accu('connected_time', 1);
    if (drivingNow) accu('driving_time', 1);
  }
  renderStats();
}, 1000);

// ==========================================================================
// TUTORIAL / HELP OVERLAY
// ==========================================================================
// ==========================================================================
// SAVED SETTINGS  (browser persistence: theme + drive config + stats)
// ==========================================================================
// Theme is saved under 'spike_kc_theme' and all-time stats under LIFE_KEY
// (see above). Here we add the drive config so the whole setup survives a
// reload. Session stats intentionally reset each run (desktop parity).
const PROFILE_KEY = 'spike_kc_profile_v1';
function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      mode, front:{ f1:front.f1, f2:front.f2 }, back:{ b1:back.b1, b2:back.b2 },
      reversed:Array.from(reversed), speed, step:stepVal, turn:turnStrength
    }));
  } catch {}
}
function loadProfile() {
  let p; try { p = JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch {}
  if (!p || typeof p !== 'object') return;
  if (p.mode === '2WD' || p.mode === '4WD') mode = p.mode;
  if (p.front) { if (p.front.f1 !== undefined) front.f1 = p.front.f1; if (p.front.f2 !== undefined) front.f2 = p.front.f2; }
  if (p.back)  { if (p.back.b1  !== undefined) back.b1  = p.back.b1;  if (p.back.b2  !== undefined) back.b2  = p.back.b2; }
  if (Array.isArray(p.reversed)) { reversed.clear(); p.reversed.forEach(x => reversed.add(x)); }
  if (typeof p.speed === 'number') speed = Math.max(C.SPEED_MIN, Math.min(C.SPEED_MAX, p.speed));
  if (typeof p.step === 'number')  stepVal = Math.max(1, Math.min(50, p.step));
  if (typeof p.turn === 'number')  turnStrength = Math.max(0, Math.min(100, p.turn));
}
function syncDriveControls() {
  $('m2wd').classList.toggle('on', mode==='2WD');
  $('m4wd').classList.toggle('on', mode==='4WD');
  $('spd').value = speed; $('spdVal').textContent = speed + '%'; $('tSpd').textContent = speed + '%';
  $('step').value = stepVal;
  $('turn').value = turnStrength; $('turnVal').textContent = turnStrength + '%';
}
function resetSaved() {
  if (!confirm('Reset your saved theme, drive config and all-time stats?')) return;
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem('spike_kc_theme');
    localStorage.removeItem(LIFE_KEY);
  } catch {}
  location.reload();
}

// ==========================================================================
// TUTORIAL / HELP OVERLAY  (coach marks: dim + spotlight + pointing card)
// ==========================================================================
const TUT_KEY = 'spike_kc_tutorial_seen_v1';
const kbKey = (k) => '<span class="tut-kbd">' + k + '</span>';
const TUT_STEPS = [
  { icon:'⬢', title:'Welcome to your remote', target:null,
    html:'A 60-second tour. This page controls your <b>LEGO SPIKE Prime hub</b> straight from the browser — nothing is installed and no files are touched.' },
  { icon:'◉', title:'Connect the hub', target:'#cardBt',
    html:'Turn the hub on, then press <b>SCAN</b>. Your browser\'s popup <i>is</i> the scan list — pick your Hub there and press <b>CONNECT</b>. The status pill turns green when you\'re linked.' },
  { icon:'⚙', title:'Tell it how you drive', target:'#cardDrive',
    html:'Choose <b>2 WHEEL</b> or <b>4 WHEEL</b>, then tap a port to assign each motor. <b>REV</b> flips a motor that spins backwards. This setup is <b>saved</b> in your browser for next time.' },
  { icon:'⌨', title:'Take the controls', target:'#cardCtl',
    html:'Drive with <b>W/A/S/D</b>, <b>SPACE</b> for the handbrake, and <b>↑/↓</b> to change speed. Or tap the on-screen pad. The <b>TURN</b> slider sets how sharp corners are.' },
  { icon:'◐', title:'Make it yours', target:'#paletteBtn',
    html:'Open the palette for <b>50+ themes</b>. Your pick is remembered automatically — there is no save button to press.' },
  { icon:'◷', title:'Watch your progress', target:'#tabs',
    html:'The <b>STATS</b> tab tracks this session and your <b>all-time</b> totals — motor rotation, drive time, handbrake pulls. All-time stats persist across visits.' },
  { icon:'▸', title:'The live log', target:'#cardLog',
    html:'Everything the hub does is echoed here. If something misbehaves, this is the first place to look.' },
  { icon:'✓', title:'You\'re all set', target:null,
    html:'That\'s the tour. Stuck later? Hit <b>❔ HELP</b> up top to reopen this tour or the quick reference.' }
];
const TUT_REF = [
  ['DRIVING',
    '<span class="k">Move:</span> ' + kbKey('W') + ' forward · ' + kbKey('S') + ' reverse · ' + kbKey('A') + ' / ' + kbKey('D') + ' turn',
    '<span class="k">Handbrake:</span> ' + kbKey('SPACE') + ' toggles stop / release',
    '<span class="k">Speed:</span> ' + kbKey('↑') + ' / ' + kbKey('↓') + ' by the STEP amount, or the SPEED slider',
    '<span class="k">Turn:</span> TURN slider, or tap the on-screen W/A/S/D pad'],
  ['CONNECTING',
    '1. Hub on, Bluetooth on, browser = Chrome / Edge / Safari 17+.',
    '2. Press <b>SCAN</b> and pick your Hub in the browser popup.',
    '3. Press <b>CONNECT</b> — status turns green when linked.',
    '<span class="k">No hub listed?</span> Check the hub is powered on and awake, then SCAN again.'],
  ['DRIVE CONFIG',
    'Pick <b>2 WHEEL</b> or <b>4 WHEEL</b>, tap a port chip to assign each motor.',
    '<b>REV</b> flips a motor spinning the wrong way. <b>MOTOR CHECK</b> pings the attachment.'],
  ['SAVED IN YOUR BROWSER',
    'Your <b>theme</b>, <b>drive config</b> and <b>all-time stats</b> are saved automatically in this browser and restored on your next visit.'],
  ['STATS',
    '<b>STATS</b> tab: session totals (reset each run) vs. all-time totals that persist.'],
  ['FEEDBACK',
    'Use the <b>feedback</b> link in the header to tell us what works or broke.']
];
let tutOpen = false, tutStep = 0, tutTab = 'tour', tutRaf = 0;
let tutSeen = false;
try { tutSeen = localStorage.getItem(TUT_KEY) === '1'; } catch {}

function tutTargetEl() {
  if (tutTab !== 'tour') return null;
  const sel = TUT_STEPS[tutStep].target;
  if (!sel) return null;
  const el = document.querySelector(sel);
  return el && el.offsetParent !== null ? el : null;
}
function tutRender() {
  const isTour = tutTab === 'tour';
  $('tutTabTour').classList.toggle('on', isTour);
  $('tutTabRef').classList.toggle('on', !isTour);
  $('tutHeadTxt').textContent = isTour ? 'Getting started' : 'Quick help';
  $('tutCard').classList.toggle('wide', !isTour);
  if (isTour) {
    const s = TUT_STEPS[tutStep];
    $('tutView').innerHTML =
      '<div class="tut-icon">' + s.icon + '</div><div class="tut-title">' + s.title + '</div>' +
      '<div class="tut-text">' + s.html + '</div>' +
      '<div class="tut-dots">' + TUT_STEPS.map((_, i) =>
        '<span class="tut-dot' + (i === tutStep ? ' on' : '') + '"></span>').join('') + '</div>';
    $('tutProgress').textContent = 'Step ' + (tutStep + 1) + ' of ' + TUT_STEPS.length;
    $('tutBack').style.display = ''; $('tutBack').disabled = tutStep === 0;
    $('tutNext').style.display = '';
    $('tutNext').textContent = tutStep === TUT_STEPS.length - 1 ? 'Finish ✓' : 'Next →';
    $('tutSkip').style.display = tutStep === TUT_STEPS.length - 1 ? 'none' : '';
  } else {
    $('tutView').innerHTML = TUT_REF.map(([title, ...rows]) =>
      '<div class="tut-ref-section"><div class="tut-ref-title">' + title + '</div>' +
      rows.map(r => '<div class="tut-ref-row">' + r + '</div>').join('') + '</div>').join('') +
      '<button class="tut-danger" id="tutReset">Reset saved settings &amp; stats</button>';
    const rb = $('tutReset'); if (rb) rb.addEventListener('click', resetSaved);
    $('tutProgress').textContent = 'Reopen any time with ❔ HELP';
    $('tutBack').style.display = 'none';
    $('tutNext').style.display = 'none';
    $('tutSkip').style.display = 'none';
  }
  $('tutBody').scrollTop = 0;
  tutLayout(true);
}
function tutLayout(scroll) {
  cancelAnimationFrame(tutRaf);
  tutRaf = requestAnimationFrame(() => {
    const dim = $('tutDim'), ring = $('tutRing'), card = $('tutCard'), arrow = $('tutArrow');
    const m = 12, pad = 10;
    const vw = innerWidth, vh = innerHeight;
    const el = tutTargetEl();
    if (el) {
      if (scroll) el.scrollIntoView({ block:'center' });
      const r = el.getBoundingClientRect();
      const hx = r.left - pad, hy = r.top - pad, hw = r.width + 2*pad, hh = r.height + 2*pad;
      dim.classList.add('spot');
      dim.style.setProperty('--hx', hx + 'px');
      dim.style.setProperty('--hy', hy + 'px');
      dim.style.setProperty('--hw', hw + 'px');
      dim.style.setProperty('--hh', hh + 'px');
      ring.classList.remove('hidden');
      ring.style.left = hx + 'px'; ring.style.top = hy + 'px';
      ring.style.width = hw + 'px'; ring.style.height = hh + 'px';
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const below = (r.bottom + pad + m + ch) <= vh - m;
      let top = below ? (r.bottom + pad + m) : (r.top - pad - m - ch);
      if (top < m) top = m;
      let left = r.left + r.width/2 - cw/2;
      left = Math.max(m, Math.min(left, vw - cw - m));
      card.style.left = left + 'px'; card.style.top = top + 'px';
      // caret pointing at the target
      arrow.classList.remove('hidden');
      const ax = Math.max(left + 18, Math.min(r.left + r.width/2, left + cw - 18));
      arrow.style.left = (ax - 7) + 'px';
      arrow.style.top = ((below ? top - 7 : top + ch - 7)) + 'px';
    } else {
      dim.classList.remove('spot');
      ring.classList.add('hidden');
      arrow.classList.add('hidden');
      card.style.left = Math.max(m, (vw - card.offsetWidth)/2) + 'px';
      card.style.top  = Math.max(m, (vh - card.offsetHeight)/2) + 'px';
    }
  });
}
function openTut(fromStart) {
  if (fromStart) { tutStep = 0; tutTab = 'tour'; }
  tutOpen = true;
  physKeys.clear(); padKeys.clear(); reapplyHeld();
  $('picker').classList.remove('open');
  $('tutOverlay').classList.remove('hidden');
  tutRender();
  window.addEventListener('scroll', tutLayout);
  window.addEventListener('resize', tutLayout);
}
function closeTut() {
  tutOpen = false;
  $('tutOverlay').classList.add('hidden');
  window.removeEventListener('scroll', tutLayout);
  window.removeEventListener('resize', tutLayout);
  cancelAnimationFrame(tutRaf);
  tutSeen = true;
  try { localStorage.setItem(TUT_KEY, '1'); } catch {}
}
$('tutBtn').addEventListener('click', () => openTut(true));
$('tutCloseBtn').addEventListener('click', closeTut);
$('tutSkip').addEventListener('click', closeTut);
$('tutBack').addEventListener('click', () => { if (tutStep > 0) { tutStep--; tutRender(); } });
$('tutNext').addEventListener('click', () => {
  if (tutStep < TUT_STEPS.length - 1) { tutStep++; tutRender(); } else closeTut();
});
$('tutTabTour').addEventListener('click', () => { tutTab = 'tour'; tutRender(); });
$('tutTabRef').addEventListener('click', () => { tutTab = 'ref'; tutRender(); });
$('tutOverlay').addEventListener('click', (e) => { if (e.target === $('tutOverlay') && tutTab === 'ref') closeTut(); });
document.addEventListener('keydown', (e) => { if (tutOpen && e.key === 'Escape') { e.preventDefault(); closeTut(); } });

// ==========================================================================
// INIT
// ==========================================================================
loadProfile();
applyProfile(); refreshSlotUI(); renderStats(); refreshHeader(); syncDriveControls();
if (!tutSeen) setTimeout(() => openTut(true), 450);

