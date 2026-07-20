/* =========================================================
   TURBO-RENNEN — Noahs Spieleecke
   Karriere-Rennspiel: Rennen fahren → Geld verdienen →
   bessere Autos kaufen und lackieren.
   6 Fahrer pro Rennen (du + 5 KI-Gegner), 3 Runden.
   KI fährt auf einer berechneten Ideallinie mit
   vorausschauendem Bremsen und Überholmanövern.
   Highscores (Kontostand): api/api.php, Fallback: localStorage
   ========================================================= */
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const API_URL = "../../api/api.php";
const GAME_ID = "rennen";
const LS_SAVE = "noah_rennen_save";
const LS_KEY  = "noah_rennen_scores";
const LS_NAME = "noah_player_name";
const LAPS = 3;

/* ================= Autos, Farben, Schwierigkeit ================= */

const CARS = [
  { id: "kart",    name: "Go-Kart",       price: 0,     maxSpeed: 250, accel: 150, turn: 3.2,  l: 34, w: 22, style: "kart" },
  { id: "flitzer", name: "Flitzer",       price: 2000,  maxSpeed: 310, accel: 185, turn: 3.0,  l: 42, w: 26, style: "compact" },
  { id: "sport",   name: "Sportwagen",    price: 8000,  maxSpeed: 380, accel: 235, turn: 3.25, l: 46, w: 24, style: "sport" },
  { id: "super",   name: "Supersport",    price: 25000, maxSpeed: 450, accel: 285, turn: 3.45, l: 48, w: 26, style: "super" },
  { id: "formel",  name: "Formel-Renner", price: 60000, maxSpeed: 520, accel: 345, turn: 3.7,  l: 50, w: 22, style: "formula" },
];

const BODY_COLORS   = ["#e03131", "#3b82f6", "#2fb356", "#f5a800", "#e64ce6", "#00b8c4", "#f1f1f5", "#23252e", "#ff7b00", "#8b5cf6"];
const ACCENT_COLORS = ["#ffffff", "#23252e", "#ffd93d", "#e03131", "#3b82f6", "#2fb356", "#e64ce6", "#00b8c4"];
const AI_NAMES = ["Blitz-Bernd", "Turbo-Tina", "Rasende Rita", "Speedy Paul", "Drift-Dieter", "Kurven-Karla", "Nitro-Nina", "Vollgas-Vera", "Bremsspur-Bruno"];
const PRIZE_SPLIT = [0.40, 0.25, 0.15, 0.10, 0.06, 0.04];

const DIFFS = {
  leicht: { label: "😌 Leicht", lo: 0.78, hi: 0.88, tierUp: 0, band: 0.11, react: 0.30 },
  mittel: { label: "😎 Mittel", lo: 0.90, hi: 0.97, tierUp: 0, band: 0.06, react: 0.22 },
  schwer: { label: "🔥 Schwer", lo: 1.00, hi: 1.07, tierUp: 1, band: 0.02, react: 0.12 },
  extrem: { label: "💀 Extrem", lo: 1.06, hi: 1.14, tierUp: 2, band: 0.00, react: 0.06 },
};

/* ================= Spielstand ================= */

let save = { money: 0, owned: ["kart"], sel: "kart", colors: {}, diff: "mittel" };
try {
  const s = JSON.parse(localStorage.getItem(LS_SAVE));
  if (s && Array.isArray(s.owned)) save = Object.assign(save, s);
} catch (e) { /* Neuer Spielstand */ }
if (!DIFFS[save.diff]) save.diff = "mittel";
function persist() { localStorage.setItem(LS_SAVE, JSON.stringify(save)); }
function carColors(id) {
  return save.colors[id] || { body: BODY_COLORS[0], accent: ACCENT_COLORS[0] };
}
function specById(id) { return CARS.find(c => c.id === id) || CARS[0]; }
function euro(n) { return n.toLocaleString("de-DE") + " €"; }

let playerName = localStorage.getItem(LS_NAME) || "";

/* ================= Strecken ================= */

const TRACK_DEFS = [
  {
    name: "Wiesen-Ring", emoji: "🌳", pot: 1000, width: 95,
    theme: { grass: "#3f9e4d", grass2: "#37904a", road: "#41414b", deco: "tree", line: "#ffffff55", night: false },
    ctrl: [[420, 320], [1300, 210], [2100, 320], [2330, 820], [2080, 1330], [1480, 1460], [900, 1310], [1080, 900], [520, 1010], [300, 650]],
  },
  {
    name: "Wüsten-Schleife", emoji: "🌵", pot: 2500, width: 85,
    theme: { grass: "#d8b36a", grass2: "#cea75c", road: "#4b4650", deco: "cactus", line: "#ffe9b855", night: false },
    ctrl: [[420, 420], [1000, 250], [1620, 420], [1930, 260], [2320, 520], [2210, 1010], [2400, 1400], [1800, 1560], [1300, 1360], [820, 1520], [400, 1260], [610, 810]],
  },
  {
    name: "Nacht-GP", emoji: "🌙", pot: 6000, width: 78,
    theme: { grass: "#232c48", grass2: "#1e2740", road: "#3a3e56", deco: "city", line: "#9fd0ff66", night: true },
    ctrl: [[320, 520], [820, 260], [1420, 360], [1720, 210], [2220, 360], [2420, 770], [2010, 960], [2310, 1260], [1900, 1560], [1400, 1410], [1000, 1560], [500, 1410], [260, 1000], [660, 860]],
  },
];

function catmullClosed(ctrl, per = 14) {
  const n = ctrl.length, pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      pts.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return pts;
}

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function buildTrack(def) {
  const pts = catmullClosed(def.ctrl);
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1], b = pts[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const len = cum[n];
  const step = len / n;

  const dirOf = i => {
    const a = pts[((i % n) + n) % n], b = pts[(((i + 1) % n) + n) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };

  // Krümmung je Segment + Präfixsummen (für Ideallinie & KI-Bremsen)
  const cstep = new Float32Array(n);
  for (let i = 0; i < n; i++) cstep[i] = normAngle(dirOf(i + 1) - dirOf(i));
  const pre = new Float32Array(3 * n + 1);
  for (let k = 0; k < 3 * n; k++) pre[k + 1] = pre[k] + cstep[k % n];
  const turnAt = (i, from, to) => pre[i + n + to] - pre[i + n + from];

  // Ideallinie: zum Kurveninneren versetzt (Apex schneiden), dann geglättet
  let line = [];
  const maxOff = def.width * 0.30;
  for (let i = 0; i < n; i++) {
    const t = turnAt(i, -9, 9);
    const off = Math.max(-maxOff, Math.min(maxOff, t * def.width * 0.38));
    const d = dirOf(i);
    line.push([pts[i][0] - Math.sin(d) * off, pts[i][1] + Math.cos(d) * off]);
  }
  for (let pass = 0; pass < 2; pass++) {
    line = line.map((p, i) => {
      let sx = 0, sy = 0;
      for (let k = -2; k <= 2; k++) {
        const q = line[((i + k) % n + n) % n];
        sx += q[0]; sy += q[1];
      }
      return [sx / 5, sy / 5];
    });
  }

  const path = new Path2D();
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();

  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }

  // Deko abseits der Strecke verteilen
  const deco = [];
  const farFromTrack = (x, y, min) => {
    for (let i = 0; i < n; i += 3) {
      const dx = x - pts[i][0], dy = y - pts[i][1];
      if (dx * dx + dy * dy < min * min) return false;
    }
    return true;
  };
  let guard = 0;
  while (deco.length < 70 && guard++ < 1000) {
    const x = minX - 320 + Math.random() * (maxX - minX + 640);
    const y = minY - 320 + Math.random() * (maxY - minY + 640);
    if (farFromTrack(x, y, def.width * 0.5 + 52))
      deco.push({ kind: "main", x, y, s: 0.7 + Math.random() * 0.7, v: Math.floor(Math.random() * 3) });
  }
  guard = 0;
  while (deco.length < 130 && guard++ < 1000) {
    const x = minX - 250 + Math.random() * (maxX - minX + 500);
    const y = minY - 250 + Math.random() * (maxY - minY + 500);
    if (farFromTrack(x, y, def.width * 0.5 + 20))
      deco.push({ kind: "small", x, y, s: 0.6 + Math.random() * 0.8, v: Math.floor(Math.random() * 4) });
  }

  // Tribünen am Start + Straßenlaternen (Nachtstrecke)
  const stands = [];
  for (let i = 10; i <= 42; i += 11) {
    const d = dirOf(i);
    const nx = -Math.sin(d), ny = Math.cos(d);
    for (const side of [-1, 1]) {
      const off = side * (def.width / 2 + 42);
      stands.push({
        x: pts[i][0] + nx * off, y: pts[i][1] + ny * off, ang: d,
        crowd: Array.from({ length: 14 }, () => BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)]),
      });
    }
  }
  const lamps = [];
  if (def.theme.night) {
    for (let i = 0; i < n; i += 24) {
      const d = dirOf(i);
      const side = (i / 24) % 2 === 0 ? 1 : -1;
      lamps.push({
        x: pts[i][0] - Math.sin(d) * side * (def.width / 2 + 16),
        y: pts[i][1] + Math.cos(d) * side * (def.width / 2 + 16),
      });
    }
  }

  return Object.assign({ pts, n, cum, len, step, path, deco, stands, lamps, line, turnAt, minX, minY, maxX, maxY }, def);
}

const TRACKS = TRACK_DEFS.map(buildTrack);

function dirAt(tr, i) {
  const a = tr.pts[i % tr.n], b = tr.pts[(i + 1) % tr.n];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
function idxAtDist(tr, d) {
  d = ((d % tr.len) + tr.len) % tr.len;
  let lo = 0, hi = tr.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (tr.cum[m] <= d) lo = m + 1; else hi = m; }
  return Math.max(0, lo - 1);
}

/* ================= Sound ================= */

let audio = null, master = null, engineOsc = null, engineGain = null, muted = false;
function initAudio() {
  if (audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(audio.destination);
  } catch (e) { /* Ton optional */ }
}
function beep(freq, dur = 0.1, type = "square", vol = 0.12) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
  o.connect(g).connect(master);
  o.start(); o.stop(audio.currentTime + dur);
}
function cashSound() { beep(660, 0.09, "sine", 0.15); setTimeout(() => beep(990, 0.14, "sine", 0.15), 90); }
function engineStart() {
  if (!audio || engineOsc) return;
  engineOsc = audio.createOscillator();
  engineGain = audio.createGain();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 70;
  engineGain.gain.value = 0.045;
  engineOsc.connect(engineGain).connect(master);
  engineOsc.start();
}
function engineStop() {
  if (engineOsc) { try { engineOsc.stop(); } catch (e) {} engineOsc = null; }
}

/* ================= Eingabe ================= */

const keys = {};
addEventListener("keydown", e => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  initAudio();
  if (e.key.toLowerCase() === "p" && mode === "race") paused = !paused;
  if (e.key.toLowerCase() === "m") { muted = !muted; if (master) master.gain.value = muted ? 0 : 1; }
});
addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener("pointerdown", initAudio);

const isTouch = "ontouchstart" in window;
const touchBtns = [
  { id: "left",  x: 78,  y: H - 66, r: 46, label: "◀" },
  { id: "right", x: 190, y: H - 66, r: 46, label: "▶" },
  { id: "brake", x: W - 190, y: H - 66, r: 46, label: "🛑" },
  { id: "gas",   x: W - 78,  y: H - 66, r: 46, label: "🚀" },
];
const pointers = new Map();
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
}
canvas.addEventListener("pointerdown", e => { pointers.set(e.pointerId, canvasPos(e)); });
canvas.addEventListener("pointermove", e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, canvasPos(e)); });
addEventListener("pointerup",     e => pointers.delete(e.pointerId));
addEventListener("pointercancel", e => pointers.delete(e.pointerId));
canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
canvas.addEventListener("touchmove",  e => e.preventDefault(), { passive: false });

function readInput() {
  const inp = {
    gas:   !!(keys.arrowup || keys.w),
    brake: !!(keys.arrowdown || keys.s),
    left:  !!(keys.arrowleft || keys.a),
    right: !!(keys.arrowright || keys.d),
  };
  for (const [, [px, py]] of pointers) {
    for (const b of touchBtns) {
      if ((px - b.x) ** 2 + (py - b.y) ** 2 < (b.r + 14) ** 2) inp[b.id] = true;
    }
  }
  return inp;
}

/* ================= Rennen / Simulation ================= */

let mode = "menu";          // menu | garage | tracks | race | result | scores
let paused = false;
let track = TRACKS[0];
let cars = [];
let raceTime = 0, countdown = 0, demo = true;
let finishTimer = -1, playerPrize = 0;
let particles = [], skids = [];
let camX = 0, camY = 0, zoom = 1, shake = 0, shX = 0, shY = 0;
let crashCooldown = 0;

const lightCanvas = document.createElement("canvas");
lightCanvas.width = W; lightCanvas.height = H;
const lctx = lightCanvas.getContext("2d");

function makeCar(spec, colors, ai, name, skill) {
  return {
    spec, colors, ai, name, skill,
    x: 0, y: 0, angle: 0, speed: 0, steer: 0, braking: false,
    ti: 0, prevT: 0, half: false, lap: 0,
    finished: false, finishTime: 0, off: false,
  };
}

function aiOpponents(playerTier, diffKey) {
  const diff = DIFFS[diffKey] || DIFFS.mittel;
  const names = AI_NAMES.slice().sort(() => Math.random() - 0.5);
  const usedColors = new Set();
  const list = [];
  const base = Math.min(CARS.length - 1, playerTier + diff.tierUp);
  const tiers = [
    base, base, Math.max(0, base - 1),
    Math.min(CARS.length - 1, base + (diff.tierUp ? 0 : 1)), Math.max(0, base - 1),
  ];
  for (let i = 0; i < 5; i++) {
    let col;
    do { col = BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)]; } while (usedColors.has(col));
    usedColors.add(col);
    list.push(makeCar(
      CARS[tiers[i]],
      { body: col, accent: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)] },
      true, names[i], diff.lo + Math.random() * (diff.hi - diff.lo)
    ));
  }
  return list;
}

function placeGrid() {
  cars.forEach((car, i) => {
    const react = demo ? 0.22 : DIFFS[save.diff].react;
    car.launch = (demo ? 0.2 : 3.0) + i * react;   // vordere Reihe fährt zuerst los
    const row = Math.floor(i / 2), col = i % 2;
    const d = 320 - row * 85;
    const idx = idxAtDist(track, d);
    const dir = dirAt(track, idx);
    const nx = -Math.sin(dir), ny = Math.cos(dir);
    const off = (col ? 1 : -1) * track.width * 0.22;
    car.x = track.pts[idx][0] + nx * off;
    car.y = track.pts[idx][1] + ny * off;
    car.angle = dir;
    car.speed = 0;
    car.ti = idx;
    car.prevT = track.cum[idx] / track.len;
    car.half = false; car.lap = 0;
    car.finished = false;
  });
}

function startRace(trackIdx, isDemo) {
  track = TRACKS[trackIdx];
  demo = isDemo;
  particles = []; skids = [];
  raceTime = 0;
  finishTimer = -1;
  paused = false;
  zoom = isDemo ? 1 : 1.1;

  if (isDemo) {
    cars = aiOpponents(Math.floor(Math.random() * CARS.length), "mittel");
    cars.push(makeCar(CARS[Math.floor(Math.random() * CARS.length)],
      { body: BODY_COLORS[6], accent: ACCENT_COLORS[2] }, true, AI_NAMES[6], 0.93));
    countdown = 0;
  } else {
    const spec = specById(save.sel);
    const tier = CARS.indexOf(spec);
    const player = makeCar(spec, carColors(spec.id), false, playerName || "Du", 1);
    cars = aiOpponents(tier, save.diff);
    cars.push(player);           // Spieler startet hinten
    countdown = 3.6;
    engineStart();
  }
  placeGrid();
  const focus = cars[cars.length - 1];
  camX = focus.x; camY = focus.y;
}

function totalProgress(car) {
  return car.lap * track.len + track.cum[car.ti];
}

function standings() {
  return cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return totalProgress(b) - totalProgress(a);
  });
}

function distToSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

function updateTrackPos(car) {
  const n = track.n;
  let best = -1, bestD = 1e18;
  for (let k = -35; k <= 35; k++) {
    const i = ((car.ti + k) % n + n) % n;
    const dx = car.x - track.pts[i][0], dy = car.y - track.pts[i][1];
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  car.ti = best;
  // Exakter Abstand zur Streckenlinie (Segment-Projektion statt Punktabstand)
  const dSeg = Math.min(
    distToSeg(car.x, car.y, track.pts[best], track.pts[(best + 1) % n]),
    distToSeg(car.x, car.y, track.pts[(best - 1 + n) % n], track.pts[best])
  );
  car.off = dSeg > track.width * 0.5 + 6;

  const t = track.cum[best] / track.len;
  if (car.prevT > 0.82 && t < 0.18) {          // Ziellinie vorwärts überquert
    if (car.half) {
      car.lap++;
      car.half = false;
      if (!car.ai && car.lap < LAPS) beep(880, 0.12, "triangle", 0.14);
      if (car.lap >= LAPS && !car.finished) {
        car.finished = true;
        car.finishTime = raceTime;
        if (!car.ai) onPlayerFinish();
        car.ai = true;                          // fährt als KI weiter
      }
    }
  } else if (t > 0.82 && car.prevT < 0.18) {   // rückwärts → Runde ungültig
    car.half = false;
  }
  if (t > 0.4 && t < 0.6) car.half = true;
  car.prevT = t;
}

/* ---------- KI: Ideallinie, Bremsen, Überholen, Gummiband ---------- */

function driveAI(car, dt) {
  if (raceTime < car.launch) { car.braking = false; return; }   // gestaffelter Start
  const n = track.n;
  let tx, ty;
  if (car.off) {
    // Im Gras: auf kürzestem Weg zurück auf die Strecke
    const tp = track.line[(car.ti + 3) % n];
    tx = tp[0]; ty = tp[1];
  } else {
    const look = 4 + Math.floor(car.speed * 0.028);
    const tp = track.line[(car.ti + look) % n];
    tx = tp[0]; ty = tp[1];

    // Überholen: Auto direkt voraus? → seitlich versetzen
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      const ahead = dx * fx + dy * fy;
      const lat = -dx * fy + dy * fx;
      if (ahead > 0 && ahead < 85 && Math.abs(lat) < 30) {
        const side = lat > 0 ? -1 : 1;
        tx += -fy * side * 34;
        ty += fx * side * 34;
        break;
      }
    }
  }

  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = normAngle(desired - car.angle);
  car.steer = Math.max(-1, Math.min(1, diff * 3.6));

  // Vorausschauendes Bremsen: physikalisch mögliche Kurvengeschwindigkeit
  // (v_max = Lenkrate / Krümmung; Bremsweg über v² = v_c² + 2·a·D)
  const ms = car.spec.maxSpeed * car.skill;
  const brake = car.spec.accel * 2.0;
  let target = ms;
  for (const d of [0, 5, 11, 18, 26, 36, 48]) {
    const turn = Math.abs(track.turnAt(car.ti, d, d + 6));
    const kappa = turn / (6 * track.step);
    if (kappa < 0.0005) continue;
    const vc = (car.spec.turn * 0.80) / kappa;   // ohne Skill: Lenkphysik setzt die Grenze
    const D = Math.max(0, d * track.step - 30);
    target = Math.min(target, Math.sqrt(vc * vc + 2 * brake * D));
  }
  if (car.off) target = Math.min(target, 110);

  // Gummiband: hält das Feld eng zusammen (stärker auf „Leicht")
  if (!demo) {
    const band = DIFFS[save.diff].band;
    const gap = totalProgress(cars[cars.length - 1]) - totalProgress(car);
    target *= 1 + Math.max(-1, Math.min(1, gap / 3500)) * band;
  }

  car.braking = target < car.speed - 25;
  if (car.speed < target) car.speed += car.spec.accel * car.skill * dt;
  else car.speed -= car.spec.accel * 2.2 * dt;
}

function drivePlayer(car, dt, inp) {
  if (inp.gas)   car.speed += car.spec.accel * dt;
  if (inp.brake) car.speed -= car.spec.accel * 1.5 * dt;
  car.speed -= car.speed * 0.35 * dt;
  car.steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  car.braking = inp.brake;

  const cap = car.off ? car.spec.maxSpeed * 0.34 : car.spec.maxSpeed;
  car.speed = Math.max(-car.spec.maxSpeed * 0.3, Math.min(cap, car.speed));
  if (car.off) car.speed -= car.speed * 1.6 * dt;
}

function physics(car, dt) {
  const grip = Math.max(-1, Math.min(1, car.speed / (car.spec.maxSpeed * 0.3)));
  car.angle += car.steer * car.spec.turn * grip * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Reifenspuren bei scharfem Einlenken
  if (!car.off && Math.abs(car.steer) > 0.55 && Math.abs(car.speed) > car.spec.maxSpeed * 0.45) {
    const bx = car.x - Math.cos(car.angle) * car.spec.l * 0.3;
    const by = car.y - Math.sin(car.angle) * car.spec.l * 0.3;
    const nx = -Math.sin(car.angle) * car.spec.w * 0.4, ny = Math.cos(car.angle) * car.spec.w * 0.4;
    skids.push({ x: bx + nx, y: by + ny, a: car.angle, life: 7 });
    skids.push({ x: bx - nx, y: by - ny, a: car.angle, life: 7 });
    if (skids.length > 900) skids.splice(0, skids.length - 900);
  }

  // Staub im Gras
  if (car.off && Math.abs(car.speed) > 40 && Math.random() < 0.5) {
    particles.push({
      x: car.x, y: car.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
      life: 0.5, color: track.theme.deco === "cactus" ? "#d8b36a" : "#7a6a4f", size: 5, grow: 12,
    });
  }
  // Abgasqualm beim Beschleunigen
  if (!car.off && !car.braking && Math.abs(car.speed) > 30 && Math.random() < 0.25) {
    particles.push({
      x: car.x - Math.cos(car.angle) * car.spec.l * 0.55,
      y: car.y - Math.sin(car.angle) * car.spec.l * 0.55,
      vx: (Math.random() - 0.5) * 25, vy: (Math.random() - 0.5) * 25,
      life: 0.4, color: "#aaaaaa55", size: 4, grow: 18,
    });
  }
}

function collisions(dt) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = 30;
      if (d > 0 && d < min) {
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const avg = (a.speed + b.speed) / 2;
        a.speed = (a.speed * 0.75 + avg * 0.25) * 0.985;
        b.speed = (b.speed * 0.75 + avg * 0.25) * 0.985;
        if (crashCooldown <= 0 && (!a.ai || !b.ai)) {
          beep(110, 0.12, "sawtooth", 0.14);
          crashCooldown = 0.4;
          shake = 0.4;
        }
      }
    }
  }
  crashCooldown -= dt;
}

function onPlayerFinish() {
  finishTimer = 1.4;
  const p = cars[cars.length - 1];
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 120,
      vx: (Math.random() - 0.5) * 340, vy: (Math.random() - 0.5) * 340,
      life: 1.4, color: ["#ffd93d", "#6bcbff", "#ff7b6b", "#7dff9b", "#e64ce6"][i % 5], size: 6, grow: 0,
    });
  }
}

function showResult() {
  const st = standings();
  const playerCar = cars[cars.length - 1];   // Spieler ist immer das letzte Auto im Array
  const pos = st.indexOf(playerCar) + 1;
  playerPrize = Math.round(track.pot * PRIZE_SPLIT[Math.max(0, Math.min(5, pos - 1))]);
  save.money += playerPrize;
  persist();
  cashSound();
  engineStop();

  document.getElementById("resultTitle").textContent =
    pos === 1 ? "🥇 Sieg! Wahnsinn!" : pos === 2 ? "🥈 Zweiter Platz!" : pos === 3 ? "🥉 Dritter Platz!" : `${pos}. Platz — weiter so!`;

  const list = document.getElementById("resultList");
  list.innerHTML = "";
  st.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "res-row" + (c === playerCar ? " me" : "");
    const prize = Math.round(track.pot * PRIZE_SPLIT[i]);
    row.innerHTML = `<span>${["🥇", "🥈", "🥉", "4.", "5.", "6."][i]} ${c === playerCar ? (playerName || "Du") : c.name}</span>
                     <span class="prize">+ ${euro(c === playerCar ? playerPrize : prize)}</span>`;
    list.appendChild(row);
  });
  document.getElementById("moneyResult").textContent = "💰 Kontostand: " + euro(save.money);

  const nameBox = document.getElementById("nameBox");
  if (!playerName) {
    nameBox.style.display = "block";
    document.getElementById("nameInput").value = "";
  } else {
    nameBox.style.display = "none";
    submitScore(playerName, save.money);
  }
  setMode("result");
}

/* ================= Highscores ================= */

async function submitScore(name, sc) {
  try {
    const res = await fetch(API_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", game: GAME_ID, name, score: sc }),
    });
    if (!(await res.json()).ok) throw new Error();
  } catch (e) {
    const local = JSON.parse(localStorage.getItem(LS_KEY) || "[]").filter(r => r.name !== name);
    local.push({ name, score: sc });
    local.sort((a, b) => b.score - a.score);
    localStorage.setItem(LS_KEY, JSON.stringify(local.slice(0, 10)));
  }
}

async function loadScores() {
  const box = document.getElementById("scoreList");
  box.innerHTML = '<p class="sub">Lade…</p>';
  let top = [], online = true;
  try {
    const res = await fetch(`${API_URL}?action=top&game=${GAME_ID}`);
    const data = await res.json();
    if (!data.ok) throw new Error();
    top = data.top;
  } catch (e) {
    online = false;
    top = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  }
  box.innerHTML = online ? "" : '<p class="sub">(offline — lokal gespeichert)</p>';
  if (!top.length) box.innerHTML += '<p class="sub">Noch keine Einträge — fahr das erste Rennen!</p>';
  top.slice(0, 10).forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "res-row" + (r.name === playerName ? " me" : "");
    row.innerHTML = `<span>${["🥇", "🥈", "🥉"][i] || (i + 1) + "."} ${r.name}</span><span class="prize">${euro(+r.score)}</span>`;
    box.appendChild(row);
  });
}

/* ================= Zeichnen: Auto ================= */

function drawCar(g, spec, colors, steer = 0, braking = false) {
  const l = spec.l, w = spec.w;
  g.save();

  // Schatten (leicht versetzt, wie tiefstehende Sonne)
  g.fillStyle = "#00000042";
  g.beginPath(); g.ellipse(2, 4, l * 0.58, w * 0.66, 0, 0, Math.PI * 2); g.fill();

  const wheel = (x, y, ww, wh, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.fillStyle = "#16161c";
    g.beginPath(); g.roundRect(-ww / 2, -wh / 2, ww, wh, 2); g.fill();
    g.fillStyle = "#3a3a46";
    g.fillRect(-ww / 2 + 1.5, -1, ww - 3, 2);
    g.restore();
  };

  if (spec.style === "formula" || spec.style === "kart") {
    wheel(l * 0.30, -w * 0.62, 11, 7, steer * 0.4);
    wheel(l * 0.30,  w * 0.62, 11, 7, steer * 0.4);
    wheel(-l * 0.34, -w * 0.62, 12, 8);
    wheel(-l * 0.34,  w * 0.62, 12, 8);
  } else {
    wheel(l * 0.28, -w * 0.5, 12, 6, steer * 0.4);
    wheel(l * 0.28,  w * 0.5, 12, 6, steer * 0.4);
    wheel(-l * 0.3, -w * 0.5, 12, 6);
    wheel(-l * 0.3,  w * 0.5, 12, 6);
  }

  const grad = g.createLinearGradient(0, -w / 2, 0, w / 2);
  grad.addColorStop(0, colors.body);
  grad.addColorStop(0.45, "#ffffffb0");
  grad.addColorStop(0.55, colors.body);
  grad.addColorStop(1, colors.body);

  if (spec.style === "kart") {
    g.fillStyle = colors.body;
    g.beginPath(); g.roundRect(-l * 0.42, -w * 0.34, l * 0.84, w * 0.68, 5); g.fill();
    g.fillStyle = "#23252e";
    g.beginPath(); g.roundRect(l * 0.34, -w * 0.42, 5, w * 0.84, 2); g.fill();
    g.beginPath(); g.roundRect(-l * 0.46, -w * 0.42, 5, w * 0.84, 2); g.fill();
    g.fillStyle = colors.accent;
    g.beginPath(); g.arc(-l * 0.06, 0, w * 0.26, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff88";
    g.beginPath(); g.arc(-l * 0.02, -w * 0.08, w * 0.09, 0, Math.PI * 2); g.fill();
  } else if (spec.style === "formula") {
    g.fillStyle = colors.accent;
    g.beginPath(); g.roundRect(l * 0.40, -w * 0.68, 8, w * 1.36, 3); g.fill();
    g.beginPath(); g.roundRect(-l * 0.5, -w * 0.62, 9, w * 1.24, 3); g.fill();
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(l * 0.48, 0);
    g.quadraticCurveTo(l * 0.2, -w * 0.34, -l * 0.2, -w * 0.4);
    g.lineTo(-l * 0.42, -w * 0.3); g.lineTo(-l * 0.42, w * 0.3);
    g.lineTo(-l * 0.2, w * 0.4);
    g.quadraticCurveTo(l * 0.2, w * 0.34, l * 0.48, 0);
    g.fill();
    g.fillStyle = "#16161c";
    g.beginPath(); g.ellipse(-l * 0.08, 0, l * 0.13, w * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = colors.accent;
    g.beginPath(); g.arc(-l * 0.08, 0, w * 0.14, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(-l / 2, -w / 2, l, w, w * 0.32); g.fill();
    if (spec.style !== "compact") {
      g.fillStyle = colors.accent;
      g.beginPath(); g.roundRect(-l * 0.52, -w * 0.44, 7, w * 0.88, 3); g.fill();
    }
    g.fillStyle = "#1b2c44";
    g.beginPath(); g.roundRect(l * 0.02, -w * 0.32, l * 0.2, w * 0.64, 4); g.fill();
    g.beginPath(); g.roundRect(-l * 0.3, -w * 0.32, l * 0.16, w * 0.64, 4); g.fill();
    g.fillStyle = "#ffffff44";
    g.beginPath(); g.roundRect(l * 0.04, -w * 0.30, l * 0.16, w * 0.18, 3); g.fill();
    g.fillStyle = colors.accent;
    g.fillRect(-l * 0.48, -2.2, l * 0.96, 4.4);
    g.fillStyle = "#fff9d9";
    g.beginPath(); g.roundRect(l * 0.44, -w * 0.34, 4, w * 0.2, 2); g.fill();
    g.beginPath(); g.roundRect(l * 0.44, w * 0.14, 4, w * 0.2, 2); g.fill();
  }

  // Bremslichter
  if (braking) {
    g.shadowColor = "#ff2222"; g.shadowBlur = 10;
    g.fillStyle = "#ff3b30";
    g.beginPath(); g.roundRect(-l * 0.52, -w * 0.34, 4, w * 0.2, 2); g.fill();
    g.beginPath(); g.roundRect(-l * 0.52, w * 0.14, 4, w * 0.2, 2); g.fill();
    g.shadowBlur = 0;
  }
  g.restore();
}

/* ================= Zeichnen: Welt ================= */

function drawDeco(d, t) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(d.s, d.s);
  const kind = track.theme.deco;
  if (d.kind === "small") {
    if (kind === "tree") {                       // Blumen
      ctx.fillStyle = ["#ffffff", "#ffd93d", "#ff9ecb", "#b9e4ff"][d.v];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#f5a800";
      ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "cactus") {              // Steine
      ctx.fillStyle = "#00000022"; ctx.beginPath(); ctx.ellipse(2, 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ["#b59a6a", "#a98f60", "#c2a877", "#9c8558"][d.v];
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, d.v, 0, Math.PI * 2); ctx.fill();
    } else {                                     // kleine Lichter/Büsche
      ctx.fillStyle = "#2c3654";
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "tree") {
    ctx.fillStyle = "#00000030"; ctx.beginPath(); ctx.ellipse(6, 8, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.v === 0 ? "#2c7a3a" : d.v === 1 ? "#35914f" : "#256b33";
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.v === 0 ? "#358a46" : d.v === 1 ? "#3fa35c" : "#2c7a3a";
    ctx.beginPath(); ctx.arc(-3, -3, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff2e"; ctx.beginPath(); ctx.arc(-7, -7, 7, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "cactus") {
    ctx.fillStyle = "#00000028"; ctx.beginPath(); ctx.ellipse(4, 17, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3d8b40";
    ctx.beginPath(); ctx.roundRect(-5, -18, 10, 34, 5); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-16, -10, 12, 7, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(4, -2, 12, 7, 4); ctx.fill();
    ctx.fillStyle = "#57a95a";
    ctx.fillRect(-2, -16, 2, 30);
  } else {                                       // Hochhaus (Nacht)
    const hw = 16 + d.v * 4, hh = 26 + d.v * 8;
    ctx.fillStyle = "#00000045"; ctx.fillRect(-hw + 5, -hh + 7, hw * 2, hh * 2);
    ctx.fillStyle = ["#141a2e", "#1a2138", "#10152a"][d.v];
    ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    ctx.fillStyle = "#ffd93d";
    for (let yy = -hh + 5; yy < hh - 4; yy += 9)
      for (let xx = -hw + 4; xx < hw - 3; xx += 9)
        if ((d.v + xx * 3 + yy) % 4 !== 0) { ctx.globalAlpha = 0.9; ctx.fillRect(xx, yy, 4, 4); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawStands() {
  for (const s of track.stands) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    ctx.fillStyle = "#00000035"; ctx.fillRect(-40, -12, 84, 30);
    ctx.fillStyle = "#4a4f60";
    ctx.beginPath(); ctx.roundRect(-42, -14, 84, 28, 5); ctx.fill();
    ctx.fillStyle = "#61687e";
    ctx.beginPath(); ctx.roundRect(-42, -14, 84, 9, 5); ctx.fill();
    s.crowd.forEach((col, k) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(-36 + (k % 7) * 12, -7 + Math.floor(k / 7) * 12, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

function drawStartArch() {
  const p0 = track.pts[0], d0 = dirAt(track, 0);
  const half = track.width / 2;
  ctx.save();
  ctx.translate(p0[0], p0[1]);
  ctx.rotate(d0);
  // Pfosten
  ctx.fillStyle = "#23252e";
  ctx.beginPath(); ctx.arc(0, -half - 13, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0,  half + 13, 7, 0, Math.PI * 2); ctx.fill();
  // Banner mit Schachbrettmuster
  ctx.fillStyle = "#00000030";
  ctx.fillRect(-4, -half - 14, 14, track.width + 28);
  for (let k = -half - 12; k < half + 12; k += 9) {
    ctx.fillStyle = Math.floor((k + half) / 9) % 2 === 0 ? "#f4f1ff" : "#16161c";
    ctx.fillRect(-6, k, 12, 9);
  }
  ctx.restore();
}

function drawTrack() {
  const th = track.theme;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // Bankett (dunkler Rand)
  ctx.strokeStyle = "#00000025";
  ctx.lineWidth = track.width + 26;
  ctx.stroke(track.path);
  // Curbs (rot-weiß)
  ctx.strokeStyle = "#d33";
  ctx.lineWidth = track.width + 14;
  ctx.setLineDash([30, 30]);
  ctx.stroke(track.path);
  ctx.strokeStyle = "#eee";
  ctx.lineDashOffset = 30;
  ctx.stroke(track.path);
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // Asphalt in Schichten (wirkt plastischer)
  ctx.strokeStyle = th.road;
  ctx.lineWidth = track.width;
  ctx.stroke(track.path);
  ctx.strokeStyle = "#00000015";
  ctx.lineWidth = track.width * 0.86;
  ctx.stroke(track.path);
  ctx.strokeStyle = "#ffffff0a";
  ctx.lineWidth = track.width * 0.4;
  ctx.stroke(track.path);
  // Mittellinie
  ctx.strokeStyle = th.line;
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 34]);
  ctx.stroke(track.path);
  ctx.setLineDash([]);

  // Ziellinie (Schachbrett)
  const dir = dirAt(track, 0);
  ctx.save();
  ctx.translate(track.pts[0][0], track.pts[0][1]);
  ctx.rotate(dir);
  const half = track.width / 2, sq = 11;
  for (let r = 0; r < 2; r++) {
    for (let k = -half; k < half; k += sq) {
      ctx.fillStyle = (Math.floor(k / sq) + r) % 2 === 0 ? "#f4f1ff" : "#1c1c22";
      ctx.fillRect(r * sq - sq, k, sq, Math.min(sq, half - k));
    }
  }
  ctx.restore();

  drawStands();
}

function drawSkids() {
  for (const s of skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.globalAlpha = Math.min(0.3, s.life * 0.05);
    ctx.fillStyle = "#111";
    ctx.fillRect(-4, -1.6, 8, 3.2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function worldToScreen(wx, wy) {
  return [W / 2 + zoom * (wx - camX + shX), H / 2 + zoom * (wy - camY + shY)];
}

function drawNightLighting() {
  lctx.clearRect(0, 0, W, H);
  lctx.fillStyle = "rgba(6, 8, 24, 0.55)";
  lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = "destination-out";

  const punch = (sx, sy, r, strength) => {
    const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(sx, sy, r, 0, Math.PI * 2); lctx.fill();
  };

  for (const lamp of track.lamps) {
    const [sx, sy] = worldToScreen(lamp.x, lamp.y);
    if (sx > -120 && sx < W + 120 && sy > -120 && sy < H + 120) punch(sx, sy, 95 * zoom, 0.85);
  }
  for (const c of cars) {
    const fx = c.x + Math.cos(c.angle) * 85, fy = c.y + Math.sin(c.angle) * 85;
    const [sx, sy] = worldToScreen(fx, fy);
    punch(sx, sy, 110 * zoom, 0.95);
    const [cx2, cy2] = worldToScreen(c.x, c.y);
    punch(cx2, cy2, 55 * zoom, 0.8);
  }
  lctx.globalCompositeOperation = "source-over";
  ctx.drawImage(lightCanvas, 0, 0);

  // warme Lampen-Punkte
  for (const lamp of track.lamps) {
    const [sx, sy] = worldToScreen(lamp.x, lamp.y);
    if (sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20) {
      ctx.fillStyle = "#ffd93d";
      ctx.beginPath(); ctx.arc(sx, sy, 3.4 * zoom, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ================= HUD ================= */

function panel(x, y, w2, h2) {
  const g = ctx.createLinearGradient(x, y, x, y + h2);
  g.addColorStop(0, "#1c1636ee");
  g.addColorStop(1, "#10244aee");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(x, y, w2, h2, 14); ctx.fill();
  ctx.strokeStyle = "#ffffff2a"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, w2, h2, 14); ctx.stroke();
}

function drawSpeedo(player) {
  const cx = W / 2, cy = H - 16, r = 58;
  const frac = Math.min(1, Math.abs(player.speed) / player.spec.maxSpeed);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#00000070";
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
  const col = frac > 0.85 ? "#ff5b4d" : frac > 0.55 ? "#ffd93d" : "#6bcbff";
  ctx.strokeStyle = col;
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + frac * Math.PI); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(Math.abs(player.speed) * 0.4)}`, cx, cy - 10);
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#ffffff99";
  ctx.fillText("km/h", cx, cy + 3);
}

function drawMinimap() {
  const mw = 148, mh = 96, pad = 12;
  const x0 = W - mw - pad, y0 = pad;
  panel(x0 - 8, y0 - 8, mw + 16, mh + 16);
  const s = Math.min(mw / (track.maxX - track.minX), mh / (track.maxY - track.minY));
  const ox = x0 + (mw - (track.maxX - track.minX) * s) / 2;
  const oy = y0 + (mh - (track.maxY - track.minY) * s) / 2;
  ctx.strokeStyle = "#ffffff66"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < track.n; i += 2) {
    const p = track.pts[i];
    const px = ox + (p[0] - track.minX) * s, py = oy + (p[1] - track.minY) * s;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  for (const c of cars) {
    ctx.fillStyle = c === cars[cars.length - 1] && !demo ? "#ffd93d" : c.colors.body;
    ctx.beginPath();
    ctx.arc(ox + (c.x - track.minX) * s, oy + (c.y - track.minY) * s, c === cars[cars.length - 1] && !demo ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHUD() {
  const player = cars[cars.length - 1];
  const st = standings();
  const pos = st.indexOf(player) + 1;

  panel(10, 10, 212, 96);
  ctx.textAlign = "left";
  const posCol = pos === 1 ? "#ffd93d" : pos === 2 ? "#cfd4e4" : pos === 3 ? "#e8a366" : "#f4f1ff";
  ctx.fillStyle = posCol;
  ctx.font = "bold 40px 'Segoe UI', sans-serif";
  ctx.fillText(`${pos}.`, 24, 52);
  ctx.font = "bold 17px 'Segoe UI', sans-serif";
  ctx.fillText("Platz", 24, 72);
  // Runden-Punkte
  for (let i = 0; i < LAPS; i++) {
    ctx.beginPath();
    ctx.arc(100 + i * 24, 40, 8, 0, Math.PI * 2);
    ctx.fillStyle = i < player.lap ? "#7dff9b" : "#ffffff26";
    ctx.fill();
  }
  ctx.fillStyle = "#cfc8ff";
  ctx.font = "bold 14px 'Segoe UI', sans-serif";
  ctx.fillText(`Runde ${Math.min(LAPS, player.lap + 1)}/${LAPS}`, 92, 72);
  ctx.fillStyle = "#ffd93d";
  ctx.fillText("💰 " + euro(save.money), 24, 94);

  drawMinimap();
  drawSpeedo(player);

  if (isTouch) {
    for (const b of touchBtns) {
      ctx.fillStyle = "#ffffff2e";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ffffffcc";
      ctx.font = "30px serif"; ctx.textAlign = "center";
      ctx.fillText(b.label, b.x, b.y + 11);
    }
  }

  // Start-Ampel
  if (countdown > 0) {
    const num = Math.ceil(countdown - 0.6);
    panel(W / 2 - 78, 14, 156, 62);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 - 40 + i * 40, 45, 15, 0, Math.PI * 2);
      if (num <= 0) {
        ctx.fillStyle = "#2fe368";
        ctx.shadowColor = "#2fe368"; ctx.shadowBlur = 16;
      } else {
        const lit = i < (4 - num);   // Lichter gehen nacheinander an: 3→1, 2→2, 1→3
        ctx.fillStyle = lit ? "#ff4438" : "#42132f";
        ctx.shadowColor = "#ff4438"; ctx.shadowBlur = lit ? 12 : 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (num <= 0) {
      ctx.textAlign = "center";
      ctx.font = "bold 90px 'Segoe UI', sans-serif";
      ctx.fillStyle = "#2fe368";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 18;
      ctx.fillText("LOS!", W / 2, H / 2 - 60);
      ctx.shadowBlur = 0;
    }
  }
  if (paused) {
    ctx.fillStyle = "#000000aa"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.font = "bold 60px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#f4f1ff";
    ctx.fillText("⏸ Pause", W / 2, H / 2);
  }
}

/* ================= Rendern ================= */

function render() {
  const th = track.theme;
  ctx.fillStyle = th.grass;
  ctx.fillRect(0, 0, W, H);

  shX = (Math.random() - 0.5) * shake * 20;
  shY = (Math.random() - 0.5) * shake * 20;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX + shX, -camY + shY);

  const vw = W / zoom, vh = H / zoom;

  // Gras-Muster
  ctx.fillStyle = th.grass2;
  const gs = 130;
  const gx0 = Math.floor((camX - vw / 2) / gs) * gs, gy0 = Math.floor((camY - vh / 2) / gs) * gs;
  for (let gx = gx0; gx < camX + vw / 2 + gs; gx += gs)
    for (let gy = gy0; gy < camY + vh / 2 + gs; gy += gs)
      if (((gx + gy) / gs) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);

  drawTrack();
  drawSkids();

  for (const d of track.deco) {
    if (Math.abs(d.x - camX) < vw / 2 + 90 && Math.abs(d.y - camY) < vh / 2 + 90) drawDeco(d);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    const sz = p.size + (p.grow || 0) * (1 - Math.max(0, p.life));
    ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  for (const c of cars) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    drawCar(ctx, c.spec, c.colors, c.steer, c.braking);
    ctx.restore();
    if (mode === "race" && !c.finished && c !== cars[cars.length - 1]) {
      ctx.fillStyle = "#ffffffbb";
      ctx.strokeStyle = "#00000066"; ctx.lineWidth = 3;
      ctx.font = "bold 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText(c.name, c.x, c.y - 26);
      ctx.fillText(c.name, c.x, c.y - 26);
    }
  }

  drawStartArch();
  ctx.restore();

  if (th.night) drawNightLighting();
  if (mode === "race") drawHUD();
}

/* ================= Hauptschleife ================= */

function step(dt) {
  if (paused) return;
  const racing = mode === "race";
  if (racing && countdown > 0) {
    const before = Math.ceil(countdown - 0.6);
    countdown -= dt;
    const after = Math.ceil(countdown - 0.6);
    if (before !== after) beep(after > 0 ? 440 : 880, after > 0 ? 0.12 : 0.4, "square", 0.14);
    if (countdown < -0.6) countdown = 0;
  }
  const frozen = racing && countdown > 0.6;

  raceTime += dt;
  for (const c of cars) {
    if (frozen) break;
    if (c.ai) driveAI(c, dt);
    else drivePlayer(c, dt, readInput());
    physics(c, dt);
    updateTrackPos(c);
  }
  if (!frozen) collisions(dt);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = skids.length - 1; i >= 0; i--) {
    skids[i].life -= dt;
    if (skids[i].life <= 0) skids.splice(i, 1);
  }
  shake = Math.max(0, shake - dt * 1.1);

  // Kamera + Tempo-Zoom
  const focus = racing ? cars[cars.length - 1] : standings()[0];
  if (focus) {
    camX += (focus.x - camX) * Math.min(1, dt * 5);
    camY += (focus.y - camY) * Math.min(1, dt * 5);
    const tz = racing
      ? Math.max(0.92, Math.min(1.14, 1.14 - (Math.abs(focus.speed) / focus.spec.maxSpeed) * 0.24))
      : 1.0;
    zoom += (tz - zoom) * Math.min(1, dt * 1.6);
  }

  if (engineOsc && racing) {
    const player = cars[cars.length - 1];
    engineOsc.frequency.value = 65 + (Math.abs(player.speed) / player.spec.maxSpeed) * 150 + Math.sin(raceTime * 30) * 4;
  }

  if (finishTimer > 0) {
    finishTimer -= dt;
    if (finishTimer <= 0) { finishTimer = -1; showResult(); }
  }

  if (demo && cars.length && standings()[0].lap >= LAPS) {
    startRace(Math.floor(Math.random() * TRACKS.length), true);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.045, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

/* ================= UI / Overlays ================= */

const overlays = ["menu", "garage", "tracks", "result", "scores"];
function setMode(m) {
  mode = m;
  for (const id of overlays) {
    document.getElementById(id).classList.toggle("show", id === m);
  }
  if (m === "menu") document.getElementById("moneyMenu").textContent = "💰 Kontostand: " + euro(save.money);
  if (m !== "race" && demo === false && m !== "result") {
    engineStop();
    startRace(Math.floor(Math.random() * TRACKS.length), true);
  }
}

function statRow(label, val) {
  return `<div class="stat-label">${label}</div><div class="statbar"><i style="width:${Math.round(val * 100)}%"></i></div>`;
}

function renderGarage() {
  document.getElementById("moneyGarage").textContent = "💰 Kontostand: " + euro(save.money);
  const grid = document.getElementById("carGrid");
  grid.innerHTML = "";
  for (const spec of CARS) {
    const owned = save.owned.includes(spec.id);
    const card = document.createElement("div");
    card.className = "shop-card" + (save.sel === spec.id ? " selected" : "") + (owned ? "" : " locked");
    const cv = document.createElement("canvas");
    cv.width = 160; cv.height = 84;
    card.appendChild(cv);
    const info = document.createElement("div");
    info.innerHTML = `<h3>${spec.name}</h3>
      ${statRow("Tempo", spec.maxSpeed / 520)}
      ${statRow("Beschleunigung", spec.accel / 345)}
      ${statRow("Lenkung", spec.turn / 3.7)}
      ${owned ? (save.sel === spec.id ? '<div class="owned">✔ Ausgewählt</div>' : '<div class="owned">In der Garage</div>')
              : `<div class="price">${euro(spec.price)}</div>`}`;
    card.appendChild(info);
    const g = cv.getContext("2d");
    g.save(); g.translate(80, 44); g.scale(2.1, 2.1); g.rotate(-0.25);
    drawCar(g, spec, owned ? carColors(spec.id) : { body: "#8a8a95", accent: "#5a5a64" });
    g.restore();
    if (!owned) {
      g.font = "26px serif"; g.textAlign = "left"; g.fillText("🔒", 6, 30);
    }

    card.addEventListener("click", () => {
      if (owned) {
        save.sel = spec.id;
      } else if (save.money >= spec.price) {
        save.money -= spec.price;
        save.owned.push(spec.id);
        save.sel = spec.id;
        cashSound();
      } else {
        beep(150, 0.2, "sawtooth", 0.15);
        document.getElementById("moneyGarage").textContent = "💰 Zu wenig Geld! Fahr Rennen und verdien dir " + euro(spec.price - save.money) + " dazu!";
        return;
      }
      persist();
      renderGarage();
    });
    grid.appendChild(card);
  }
  renderCustomPanel();
}

function renderCustomPanel() {
  const spec = specById(save.sel);
  const panel2 = document.getElementById("customPanel");
  panel2.innerHTML = `<h3>🎨 ${spec.name} lackieren</h3>
    <canvas id="customPreview" width="260" height="110" style="background:#ffffff0d;border-radius:10px"></canvas>
    <div class="lbl">Lackfarbe</div><div class="swatches" id="swBody"></div>
    <div class="lbl">Streifen &amp; Details</div><div class="swatches" id="swAcc"></div>`;
  const drawPreview = () => {
    const cv = document.getElementById("customPreview");
    const g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    g.save(); g.translate(130, 55); g.scale(3, 3); g.rotate(-0.18);
    drawCar(g, spec, carColors(spec.id));
    g.restore();
  };
  const makeSwatches = (elId, colors, key) => {
    const el = document.getElementById(elId);
    colors.forEach(col => {
      const s = document.createElement("div");
      s.className = "swatch" + (carColors(spec.id)[key] === col ? " sel" : "");
      s.style.background = col;
      s.addEventListener("click", () => {
        save.colors[spec.id] = Object.assign({}, carColors(spec.id), { [key]: col });
        persist();
        el.querySelectorAll(".swatch").forEach(x => x.classList.remove("sel"));
        s.classList.add("sel");
        drawPreview();
        renderGarageCardsOnly();
      });
      el.appendChild(s);
    });
  };
  makeSwatches("swBody", BODY_COLORS, "body");
  makeSwatches("swAcc", ACCENT_COLORS, "accent");
  drawPreview();
}

function renderGarageCardsOnly() {
  const cards = document.querySelectorAll("#carGrid .shop-card canvas");
  CARS.forEach((spec, i) => {
    const cv = cards[i];
    if (!cv) return;
    const owned = save.owned.includes(spec.id);
    const g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    g.save(); g.translate(80, 44); g.scale(2.1, 2.1); g.rotate(-0.25);
    drawCar(g, spec, owned ? carColors(spec.id) : { body: "#8a8a95", accent: "#5a5a64" });
    g.restore();
    if (!owned) { g.font = "26px serif"; g.textAlign = "left"; g.fillText("🔒", 6, 30); }
  });
}

function renderDiffRow() {
  const row = document.getElementById("diffRow");
  row.innerHTML = "";
  for (const [key, d] of Object.entries(DIFFS)) {
    const b = document.createElement("button");
    b.className = "btn diff-btn" + (save.diff === key ? "" : " secondary");
    b.textContent = d.label;
    b.addEventListener("click", () => {
      save.diff = key;
      persist();
      renderDiffRow();
    });
    row.appendChild(b);
  }
}

function renderTracks() {
  renderDiffRow();
  const grid = document.getElementById("trackGrid");
  grid.innerHTML = "";
  TRACKS.forEach((tr, i) => {
    const card = document.createElement("div");
    card.className = "shop-card track-card";
    const cv = document.createElement("canvas");
    cv.width = 184; cv.height = 110;
    card.appendChild(cv);
    card.insertAdjacentHTML("beforeend",
      `<h3>${tr.emoji} ${tr.name}</h3><div class="pot">Preisgeld: ${euro(tr.pot)}</div>`);
    const g = cv.getContext("2d");
    g.fillStyle = tr.theme.grass;
    g.fillRect(0, 0, cv.width, cv.height);
    const s = Math.min((cv.width - 24) / (tr.maxX - tr.minX), (cv.height - 24) / (tr.maxY - tr.minY));
    const ox = (cv.width - (tr.maxX - tr.minX) * s) / 2, oy = (cv.height - (tr.maxY - tr.minY) * s) / 2;
    g.strokeStyle = tr.theme.road; g.lineWidth = 8; g.lineJoin = "round";
    g.beginPath();
    for (let k = 0; k < tr.n; k += 2) {
      const p = tr.pts[k];
      const px = ox + (p[0] - tr.minX) * s, py = oy + (p[1] - tr.minY) * s;
      k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath(); g.stroke();
    g.fillStyle = "#ffd93d";
    g.beginPath(); g.arc(ox + (tr.pts[0][0] - tr.minX) * s, oy + (tr.pts[0][1] - tr.minY) * s, 4, 0, Math.PI * 2); g.fill();

    card.addEventListener("click", () => {
      initAudio();
      setMode("race");
      startRace(i, false);
    });
    grid.appendChild(card);
  });
}

/* Buttons */
document.getElementById("btnRace").addEventListener("click", () => { renderTracks(); setMode("tracks"); });
document.getElementById("btnGarage").addEventListener("click", () => { renderGarage(); setMode("garage"); });
document.getElementById("btnScores").addEventListener("click", () => { loadScores(); setMode("scores"); });
document.getElementById("btnGarageBack").addEventListener("click", () => setMode("menu"));
document.getElementById("btnTracksBack").addEventListener("click", () => setMode("menu"));
document.getElementById("btnScoresBack").addEventListener("click", () => setMode("menu"));
document.getElementById("btnAgain").addEventListener("click", () => {
  initAudio();
  setMode("race");
  startRace(TRACKS.indexOf(track), false);
});
document.getElementById("btnResultGarage").addEventListener("click", () => { renderGarage(); setMode("garage"); });
document.getElementById("btnResultMenu").addEventListener("click", () => setMode("menu"));
document.getElementById("btnSaveName").addEventListener("click", () => {
  const v = document.getElementById("nameInput").value.trim();
  if (v.length < 2) return;
  playerName = v.slice(0, 16);
  localStorage.setItem(LS_NAME, playerName);
  document.getElementById("nameBox").style.display = "none";
  submitScore(playerName, save.money);
});

/* Start: Demo-Rennen hinter dem Menü */
startRace(0, true);
setMode("menu");
requestAnimationFrame(loop);
