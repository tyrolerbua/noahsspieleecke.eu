/* =========================================================
   TURBO-RENNEN — Noahs Spieleecke
   Karriere-Rennspiel: Rennen fahren → Geld verdienen →
   bessere Autos kaufen und lackieren.
   6 Fahrer pro Rennen (du + 5 KI-Gegner), 3 Runden.
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

/* ================= Autos & Farben ================= */

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

/* ================= Spielstand ================= */

let save = { money: 0, owned: ["kart"], sel: "kart", colors: {} };
try {
  const s = JSON.parse(localStorage.getItem(LS_SAVE));
  if (s && Array.isArray(s.owned)) save = Object.assign(save, s);
} catch (e) { /* Neuer Spielstand */ }
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
    theme: { grass: "#3f9e4d", grass2: "#37904a", road: "#41414b", deco: "tree", line: "#ffffff55" },
    ctrl: [[420, 320], [1300, 210], [2100, 320], [2330, 820], [2080, 1330], [1480, 1460], [900, 1310], [1080, 900], [520, 1010], [300, 650]],
  },
  {
    name: "Wüsten-Schleife", emoji: "🌵", pot: 2500, width: 85,
    theme: { grass: "#d8b36a", grass2: "#cea75c", road: "#4b4650", deco: "cactus", line: "#ffe9b855" },
    ctrl: [[420, 420], [1000, 250], [1620, 420], [1930, 260], [2320, 520], [2210, 1010], [2400, 1400], [1800, 1560], [1300, 1360], [820, 1520], [400, 1260], [610, 810]],
  },
  {
    name: "Nacht-GP", emoji: "🌙", pot: 6000, width: 78,
    theme: { grass: "#1d2438", grass2: "#181e30", road: "#33364a", deco: "city", line: "#9fd0ff66" },
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

function buildTrack(def) {
  const pts = catmullClosed(def.ctrl);
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1], b = pts[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const len = cum[n];

  const path = new Path2D();
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();

  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }

  // Deko (Bäume/Kakteen/Häuser) abseits der Strecke verteilen
  const deco = [];
  let guard = 0;
  while (deco.length < 70 && guard++ < 900) {
    const x = minX - 320 + Math.random() * (maxX - minX + 640);
    const y = minY - 320 + Math.random() * (maxY - minY + 640);
    let d2 = 1e18;
    for (let i = 0; i < n; i += 3) {
      const dx = x - pts[i][0], dy = y - pts[i][1];
      const q = dx * dx + dy * dy;
      if (q < d2) d2 = q;
    }
    const min = def.width * 0.5 + 46;
    if (d2 > min * min) deco.push({ x, y, s: 0.7 + Math.random() * 0.7, v: Math.floor(Math.random() * 3) });
  }
  return Object.assign({ pts, n, cum, len, path, deco, minX, minY, maxX, maxY }, def);
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
function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
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
let finishTimer = -1, lastStandings = [], playerPrize = 0;
let particles = [];
let camX = 0, camY = 0;
let crashCooldown = 0;

function makeCar(spec, colors, ai, name, skill) {
  return {
    spec, colors, ai, name, skill,
    x: 0, y: 0, angle: 0, speed: 0, steer: 0,
    ti: 0, prevT: 0, half: false, lap: 0,
    finished: false, finishTime: 0, off: false,
  };
}

function aiOpponents(playerTier) {
  const names = AI_NAMES.slice().sort(() => Math.random() - 0.5);
  const usedColors = new Set();
  const list = [];
  const tiers = [
    Math.max(0, playerTier - 1), playerTier, playerTier,
    Math.max(0, playerTier - 1), Math.min(CARS.length - 1, playerTier + 1),
  ];
  for (let i = 0; i < 5; i++) {
    let col;
    do { col = BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)]; } while (usedColors.has(col));
    usedColors.add(col);
    list.push(makeCar(
      CARS[tiers[i]],
      { body: col, accent: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)] },
      true, names[i], 0.84 + Math.random() * 0.13
    ));
  }
  return list;
}

function placeGrid() {
  cars.forEach((car, i) => {
    const row = Math.floor(i / 2), col = i % 2;
    const d = 250 - row * 62;
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
  particles = [];
  raceTime = 0;
  finishTimer = -1;
  paused = false;

  if (isDemo) {
    cars = aiOpponents(Math.floor(Math.random() * CARS.length));
    cars.push(makeCar(CARS[Math.floor(Math.random() * CARS.length)],
      { body: BODY_COLORS[6], accent: ACCENT_COLORS[2] }, true, AI_NAMES[6], 0.9));
    countdown = 0;
  } else {
    const spec = specById(save.sel);
    const tier = CARS.indexOf(spec);
    const player = makeCar(spec, carColors(spec.id), false, playerName || "Du", 1);
    cars = aiOpponents(tier);
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
  car.off = bestD > (track.width * 0.5) ** 2;

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

function driveAI(car, dt) {
  const look = 7 + Math.floor(car.speed * 0.045);
  const tp = track.pts[(car.ti + look) % track.n];
  const desired = Math.atan2(tp[1] - car.y, tp[0] - car.x);
  const diff = normAngle(desired - car.angle);
  car.steer = Math.max(-1, Math.min(1, diff * 2.6));

  const a1 = dirAt(track, (car.ti + 8) % track.n);
  const a2 = dirAt(track, (car.ti + 26) % track.n);
  const curv = Math.abs(normAngle(a2 - a1));
  let target = car.spec.maxSpeed * car.skill * (1 - Math.min(0.68, curv * 1.05));
  if (car.off) target = Math.min(target, 95);

  if (car.speed < target) car.speed += car.spec.accel * dt;
  else car.speed -= car.spec.accel * 1.6 * dt;
}

function drivePlayer(car, dt, inp) {
  if (inp.gas)   car.speed += car.spec.accel * dt;
  if (inp.brake) car.speed -= car.spec.accel * 1.5 * dt;
  car.speed -= car.speed * 0.35 * dt;
  car.steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

  const cap = car.off ? car.spec.maxSpeed * 0.34 : car.spec.maxSpeed;
  car.speed = Math.max(-car.spec.maxSpeed * 0.3, Math.min(cap, car.speed));
  if (car.off) car.speed -= car.speed * 1.6 * dt;
}

function physics(car, dt) {
  const grip = Math.max(-1, Math.min(1, car.speed / (car.spec.maxSpeed * 0.3)));
  car.angle += car.steer * car.spec.turn * grip * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  if (car.off && Math.abs(car.speed) > 40 && Math.random() < 0.5) {
    particles.push({
      x: car.x, y: car.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
      life: 0.5, color: track.theme.deco === "cactus" ? "#d8b36a" : "#7a6a4f", size: 5,
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
        a.speed = a.speed * 0.6 + avg * 0.35;
        b.speed = b.speed * 0.6 + avg * 0.35;
        if (crashCooldown <= 0 && (!a.ai || !b.ai)) { beep(110, 0.12, "sawtooth", 0.14); crashCooldown = 0.4; }
      }
    }
  }
  crashCooldown -= dt;
}

function onPlayerFinish() {
  const pos = standings().findIndex(c => !c.ai) + 1; // vor ai=true-Umschaltung aufgerufen
  finishTimer = 1.4;
  lastStandings = null;                              // wird beim Anzeigen berechnet
  playerPrize = Math.round(track.pot * PRIZE_SPLIT[Math.max(0, pos - 1)]);
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: cars[cars.length - 1].x, y: cars[cars.length - 1].y,
      vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300,
      life: 1.2, color: ["#ffd93d", "#6bcbff", "#ff7b6b", "#7dff9b"][i % 4], size: 6,
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

function drawCar(g, spec, colors, steer = 0) {
  const l = spec.l, w = spec.w;
  g.save();

  // Schatten
  g.fillStyle = "#00000038";
  g.beginPath(); g.ellipse(1, 3, l * 0.55, w * 0.62, 0, 0, Math.PI * 2); g.fill();

  const wheel = (x, y, ww, wh, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.fillStyle = "#16161c";
    g.beginPath(); g.roundRect(-ww / 2, -wh / 2, ww, wh, 2); g.fill();
    g.restore();
  };

  if (spec.style === "formula" || spec.style === "kart") {
    // Freistehende Räder
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
  grad.addColorStop(0.5, "#ffffffcc");
  grad.addColorStop(0.51, colors.body);
  grad.addColorStop(1, colors.body);

  if (spec.style === "kart") {
    g.fillStyle = colors.body;
    g.beginPath(); g.roundRect(-l * 0.42, -w * 0.34, l * 0.84, w * 0.68, 5); g.fill();
    g.fillStyle = "#23252e";
    g.beginPath(); g.roundRect(l * 0.34, -w * 0.42, 5, w * 0.84, 2); g.fill();  // Frontbügel
    g.beginPath(); g.roundRect(-l * 0.46, -w * 0.42, 5, w * 0.84, 2); g.fill(); // Heckbügel
    g.fillStyle = colors.accent;                                                 // Helm
    g.beginPath(); g.arc(-l * 0.06, 0, w * 0.26, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff88";
    g.beginPath(); g.arc(-l * 0.02, -w * 0.08, w * 0.09, 0, Math.PI * 2); g.fill();
  } else if (spec.style === "formula") {
    g.fillStyle = colors.accent;                                                 // Flügel
    g.beginPath(); g.roundRect(l * 0.40, -w * 0.68, 8, w * 1.36, 3); g.fill();
    g.beginPath(); g.roundRect(-l * 0.5, -w * 0.62, 9, w * 1.24, 3); g.fill();
    g.fillStyle = grad;                                                          // Rumpf
    g.beginPath();
    g.moveTo(l * 0.48, 0);
    g.quadraticCurveTo(l * 0.2, -w * 0.34, -l * 0.2, -w * 0.4);
    g.lineTo(-l * 0.42, -w * 0.3); g.lineTo(-l * 0.42, w * 0.3);
    g.lineTo(-l * 0.2, w * 0.4);
    g.quadraticCurveTo(l * 0.2, w * 0.34, l * 0.48, 0);
    g.fill();
    g.fillStyle = "#16161c";                                                     // Cockpit
    g.beginPath(); g.ellipse(-l * 0.08, 0, l * 0.13, w * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = colors.accent;
    g.beginPath(); g.arc(-l * 0.08, 0, w * 0.14, 0, Math.PI * 2); g.fill();      // Helm
  } else {
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(-l / 2, -w / 2, l, w, w * 0.32); g.fill();
    if (spec.style !== "compact") {                                              // Spoiler
      g.fillStyle = colors.accent;
      g.beginPath(); g.roundRect(-l * 0.52, -w * 0.44, 7, w * 0.88, 3); g.fill();
    }
    g.fillStyle = "#1b2c44";                                                     // Scheiben
    g.beginPath(); g.roundRect(l * 0.02, -w * 0.32, l * 0.2, w * 0.64, 4); g.fill();
    g.beginPath(); g.roundRect(-l * 0.3, -w * 0.32, l * 0.16, w * 0.64, 4); g.fill();
    g.fillStyle = colors.accent;                                                 // Rennstreifen
    g.fillRect(-l * 0.48, -2.2, l * 0.96, 4.4);
    g.fillStyle = "#fff9d9";                                                     // Scheinwerfer
    g.beginPath(); g.roundRect(l * 0.44, -w * 0.34, 4, w * 0.2, 2); g.fill();
    g.beginPath(); g.roundRect(l * 0.44, w * 0.14, 4, w * 0.2, 2); g.fill();
  }
  g.restore();
}

/* ================= Zeichnen: Welt ================= */

function drawDeco(d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(d.s, d.s);
  const t = track.theme.deco;
  if (t === "tree") {
    ctx.fillStyle = "#00000030"; ctx.beginPath(); ctx.ellipse(4, 6, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.v === 0 ? "#2c7a3a" : d.v === 1 ? "#35914f" : "#256b33";
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff22"; ctx.beginPath(); ctx.arc(-6, -6, 9, 0, Math.PI * 2); ctx.fill();
  } else if (t === "cactus") {
    ctx.fillStyle = "#00000028"; ctx.beginPath(); ctx.ellipse(3, 16, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3d8b40";
    ctx.beginPath(); ctx.roundRect(-5, -18, 10, 34, 5); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-16, -10, 12, 7, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(4, -2, 12, 7, 4); ctx.fill();
  } else {
    ctx.fillStyle = "#0d1120"; ctx.fillRect(-16, -26, 32, 52);
    ctx.fillStyle = "#ffd93d";
    for (let yy = -20; yy < 22; yy += 10)
      for (let xx = -11; xx < 12; xx += 10)
        if ((d.v + xx + yy) % 3 !== 0) ctx.fillRect(xx, yy, 5, 5);
  }
  ctx.restore();
}

function drawTrack() {
  const th = track.theme;
  // Randstreifen (rot-weiß)
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#d33";
  ctx.lineWidth = track.width + 16;
  ctx.setLineDash([30, 30]);
  ctx.stroke(track.path);
  ctx.strokeStyle = "#eee";
  ctx.lineDashOffset = 30;
  ctx.stroke(track.path);
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // Asphalt
  ctx.strokeStyle = th.road;
  ctx.lineWidth = track.width;
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
}

function drawMinimap(st) {
  const mw = 148, mh = 96, pad = 12;
  const x0 = W - mw - pad, y0 = pad;
  ctx.fillStyle = "#00000066";
  ctx.beginPath(); ctx.roundRect(x0 - 8, y0 - 8, mw + 16, mh + 16, 10); ctx.fill();
  const sx = mw / (track.maxX - track.minX), sy = mh / (track.maxY - track.minY);
  const s = Math.min(sx, sy);
  const ox = x0 + (mw - (track.maxX - track.minX) * s) / 2;
  const oy = y0 + (mh - (track.maxY - track.minY) * s) / 2;
  ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < track.n; i += 2) {
    const p = track.pts[i];
    const px = ox + (p[0] - track.minX) * s, py = oy + (p[1] - track.minY) * s;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();
  for (const c of cars) {
    ctx.fillStyle = c.ai ? c.colors.body : "#ffd93d";
    ctx.beginPath();
    ctx.arc(ox + (c.x - track.minX) * s, oy + (c.y - track.minY) * s, c.ai ? 3 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHUD() {
  const player = cars[cars.length - 1];
  const st = standings();
  const pos = st.indexOf(player) + 1;

  ctx.fillStyle = "#00000066";
  ctx.beginPath(); ctx.roundRect(10, 10, 210, 92, 12); ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd93d";
  ctx.font = "bold 30px 'Segoe UI', sans-serif";
  ctx.fillText(`${pos}. Platz`, 24, 44);
  ctx.fillStyle = "#f4f1ff";
  ctx.font = "bold 19px 'Segoe UI', sans-serif";
  ctx.fillText(`Runde ${Math.min(LAPS, player.lap + 1)}/${LAPS}`, 24, 70);
  ctx.fillStyle = "#6bcbff";
  ctx.fillText(`${Math.round(Math.abs(player.speed) * 0.4)} km/h`, 24, 93);

  drawMinimap(st);

  if (isTouch) {
    for (const b of touchBtns) {
      ctx.fillStyle = "#ffffff2e";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffffcc";
      ctx.font = "30px serif"; ctx.textAlign = "center";
      ctx.fillText(b.label, b.x, b.y + 11);
    }
  }

  if (countdown > 0) {
    const num = Math.ceil(countdown - 0.6);
    ctx.textAlign = "center";
    ctx.font = "bold 110px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffd93d";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 18;
    ctx.fillText(num > 0 ? String(num) : "LOS!", W / 2, H / 2 - 40);
    ctx.shadowBlur = 0;
  }
  if (paused) {
    ctx.fillStyle = "#000000aa"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.font = "bold 60px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#f4f1ff";
    ctx.fillText("⏸ Pause", W / 2, H / 2);
  }
}

function render() {
  const th = track.theme;
  ctx.fillStyle = th.grass;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2 - camX, H / 2 - camY);

  // Gras-Muster
  ctx.fillStyle = th.grass2;
  const gs = 130;
  const x0 = Math.floor((camX - W / 2) / gs) * gs, y0 = Math.floor((camY - H / 2) / gs) * gs;
  for (let gx = x0; gx < camX + W / 2 + gs; gx += gs)
    for (let gy = y0; gy < camY + H / 2 + gs; gy += gs)
      if (((gx + gy) / gs) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);

  drawTrack();

  for (const d of track.deco) {
    if (Math.abs(d.x - camX) < W / 2 + 80 && Math.abs(d.y - camY) < H / 2 + 80) drawDeco(d);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  for (const c of cars) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    drawCar(ctx, c.spec, c.colors, c.steer);
    ctx.restore();
    if (mode === "race" && !c.finished) {
      ctx.fillStyle = "#00000055";
      ctx.font = "bold 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      const nm = c === cars[cars.length - 1] && !demo ? "" : c.name;
      if (nm) ctx.fillText(nm, c.x, c.y - 26);
    }
  }
  ctx.restore();

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

  // Kamera
  const focus = racing ? cars[cars.length - 1] : standings()[0];
  if (focus) {
    camX += (focus.x - camX) * Math.min(1, dt * 5);
    camY += (focus.y - camY) * Math.min(1, dt * 5);
  }

  // Motorsound
  if (engineOsc && racing) {
    const player = cars[cars.length - 1];
    engineOsc.frequency.value = 65 + (Math.abs(player.speed) / player.spec.maxSpeed) * 150 + Math.sin(raceTime * 30) * 4;
  }

  if (finishTimer > 0) {
    finishTimer -= dt;
    if (finishTimer <= 0) { finishTimer = -1; showResult(); }
  }

  // Demo neu starten, wenn Führender fertig ist
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
  const cols = carColors(spec.id);
  const panel = document.getElementById("customPanel");
  panel.innerHTML = `<h3>🎨 ${spec.name} lackieren</h3>
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
  // Nur die Vorschau-Canvases aktualisieren (ohne kompletten Rebuild)
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

function renderTracks() {
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
