/* =========================================================
   STERNENFÄNGER — Noahs Spieleecke
   Fang Sterne mit dem Korb, weiche Bomben aus.
   Highscores: Online-API (api/api.php), Fallback: localStorage
   ========================================================= */
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const API_URL = "../../api/api.php";
const GAME_ID = "sterne";
const LS_KEY = "noah_sterne_scores";
const LS_NAME = "noah_player_name";

/* ---------- Zustand ---------- */
const S = { MENU: 0, PLAY: 1, OVER: 2, ENTER_NAME: 3, SCORES: 4 };
let state = S.MENU;

let player, items, particles, score, lives, level, spawnTimer, time;
let playerName = localStorage.getItem(LS_NAME) || "";
let lastRank = null, topList = [], onlineOk = null;

function reset() {
  player = { x: W / 2, w: 84, h: 56, targetX: W / 2 };
  items = [];
  particles = [];
  score = 0;
  lives = 3;
  level = 1;
  spawnTimer = 0;
  time = 0;
}

/* ---------- Sound (WebAudio, ganz simpel) ---------- */
let audioCtx = null;
function beep(freq, dur = 0.08, type = "sine", vol = 0.15) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* Ton ist optional */ }
}

/* ---------- Eingabe ---------- */
const keys = {};
addEventListener("keydown", e => {
  keys[e.key] = true;
  if (state === S.ENTER_NAME) handleNameKey(e);
  else if (e.key === " " || e.key === "Enter") advance();
});
addEventListener("keyup", e => keys[e.key] = false);

function canvasX(e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  return cx * (W / r.width);
}
canvas.addEventListener("mousemove", e => { if (state === S.PLAY) player.targetX = canvasX(e); });
canvas.addEventListener("touchmove", e => { e.preventDefault(); if (state === S.PLAY) player.targetX = canvasX(e); }, { passive: false });
canvas.addEventListener("pointerdown", e => {
  if (state === S.PLAY) {
    player.targetX = canvasX(e);
  } else if (state === S.ENTER_NAME) {
    const n = window.prompt("Wie heißt du? (min. 2 Zeichen)", playerName);
    if (n && n.trim().length >= 2) {
      playerName = n.trim().slice(0, 16);
      localStorage.setItem(LS_NAME, playerName);
      submitScore(playerName, score);
      state = S.OVER;
    }
  } else {
    advance();
  }
});

function advance() {
  if (state === S.MENU || state === S.SCORES) { reset(); state = S.PLAY; }
  else if (state === S.OVER) { state = S.SCORES; loadScores(); }
}

/* ---------- Namenseingabe ---------- */
function handleNameKey(e) {
  if (e.key === "Enter") {
    if (playerName.trim().length >= 2) {
      localStorage.setItem(LS_NAME, playerName.trim());
      submitScore(playerName.trim(), score);
      state = S.OVER;
    }
  } else if (e.key === "Backspace") {
    playerName = playerName.slice(0, -1);
  } else if (e.key.length === 1 && playerName.length < 16) {
    playerName += e.key;
  }
  e.preventDefault();
}

/* ---------- Highscores ---------- */
async function loadScores() {
  try {
    const res = await fetch(`${API_URL}?action=top&game=${GAME_ID}`);
    const data = await res.json();
    if (data.ok) { topList = data.top; onlineOk = true; return; }
    throw new Error(data.error);
  } catch (e) {
    onlineOk = false;
    topList = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  }
}

async function submitScore(name, sc) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", game: GAME_ID, name, score: sc }),
    });
    const data = await res.json();
    if (data.ok) { lastRank = data.rank; topList = data.top; onlineOk = true; return; }
    throw new Error(data.error);
  } catch (e) {
    onlineOk = false;
    const local = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    local.push({ name, score: sc, created_at: new Date().toISOString().slice(0, 10) });
    local.sort((a, b) => b.score - a.score);
    localStorage.setItem(LS_KEY, JSON.stringify(local.slice(0, 10)));
    topList = local.slice(0, 10);
    lastRank = topList.findIndex(t => t.name === name && t.score === sc) + 1 || null;
  }
}

/* ---------- Spiellogik ---------- */
const TYPES = {
  star:    { emoji: "⭐", pts: 10,  r: 20, weight: 62 },
  rainbow: { emoji: "🌈", pts: 50,  r: 22, weight: 8  },
  bomb:    { emoji: "💣", pts: 0,   r: 20, weight: 30 },
};

function spawnItem() {
  const roll = Math.random() * 100;
  let type = "star", acc = 0;
  for (const [k, t] of Object.entries(TYPES)) {
    acc += t.weight;
    if (roll < acc) { type = k; break; }
  }
  items.push({
    type,
    x: 30 + Math.random() * (W - 60),
    y: -30,
    vy: (110 + Math.random() * 60) * (1 + level * 0.12),
    wobble: Math.random() * Math.PI * 2,
  });
}

function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, color });
  }
}

function update(dt) {
  time += dt;
  level = 1 + Math.floor(time / 15);

  if (keys.ArrowLeft)  player.targetX -= 420 * dt;
  if (keys.ArrowRight) player.targetX += 420 * dt;
  player.targetX = Math.max(player.w / 2, Math.min(W - player.w / 2, player.targetX));
  player.x += (player.targetX - player.x) * Math.min(1, dt * 14);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = Math.max(0.28, 0.9 - level * 0.06);
  }

  const catchY = H - 70;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.y += it.vy * dt;
    it.wobble += dt * 3;
    it.x += Math.sin(it.wobble) * 20 * dt;

    const t = TYPES[it.type];
    if (it.y > catchY - 10 && it.y < catchY + 34 && Math.abs(it.x - player.x) < player.w / 2 + t.r * 0.6) {
      items.splice(i, 1);
      if (it.type === "bomb") {
        lives--;
        burst(it.x, it.y, "#ff5544", 22);
        beep(90, 0.25, "sawtooth", 0.25);
        if (lives <= 0) { gameOver(); return; }
      } else {
        score += t.pts;
        burst(it.x, it.y, it.type === "rainbow" ? "#a06bff" : "#ffd93d");
        beep(it.type === "rainbow" ? 880 : 620, 0.07, "triangle");
      }
    } else if (it.y > H + 40) {
      items.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function gameOver() {
  beep(160, 0.5, "sawtooth", 0.2);
  lastRank = null;
  state = playerName ? S.OVER : S.ENTER_NAME;
  if (playerName) submitScore(playerName, score);
  else state = S.ENTER_NAME;
}

/* ---------- Zeichnen ---------- */
const bgStars = Array.from({ length: 60 }, () => ({
  x: Math.random() * W, y: Math.random() * H,
  r: 0.5 + Math.random() * 1.5, tw: Math.random() * Math.PI * 2,
}));

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#141034");
  g.addColorStop(1, "#2a1a5e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const s of bgStars) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + s.tw);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCenteredText(lines, startY, gap = 44) {
  ctx.textAlign = "center";
  lines.forEach(([txt, size, color], i) => {
    ctx.font = `bold ${size}px "Segoe UI", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(txt, W / 2, startY + i * gap);
  });
}

function draw(t) {
  drawBackground(t);

  if (state === S.MENU) {
    drawCenteredText([
      ["⭐", 80, "#fff"],
      ["Sternenfänger", 42, "#ffd93d"],
      ["Fang die Sterne mit dem Korb!", 20, "#cfc8ff"],
      ["⭐ = 10 Punkte   🌈 = 50 Punkte   💣 = Leben weg!", 17, "#cfc8ff"],
    ], 180, 56);
    if (Math.sin(t * 4) > -0.2) {
      drawCenteredText([["Klicken oder Leertaste zum Starten", 22, "#6bcbff"]], 480);
    }
    return;
  }

  if (state === S.PLAY || state === S.OVER || state === S.ENTER_NAME) {
    for (const it of items) {
      ctx.font = `${TYPES[it.type].r * 2}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(TYPES[it.type].emoji, it.x, it.y);
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    ctx.font = "44px serif";
    ctx.textAlign = "center";
    ctx.fillText("🧺", player.x, H - 34);

    ctx.textAlign = "left";
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffd93d";
    ctx.fillText(`${score}`, 16, 34);
    ctx.textAlign = "right";
    ctx.fillText("❤️".repeat(Math.max(0, lives)), W - 16, 34);
    ctx.textAlign = "center";
    ctx.fillStyle = "#cfc8ff";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillText(`Level ${level}`, W / 2, 30);
  }

  if (state === S.ENTER_NAME) {
    ctx.fillStyle = "#000a";
    ctx.fillRect(0, 0, W, H);
    drawCenteredText([
      ["Game Over!", 44, "#ff7b6b"],
      [`${score} Punkte`, 30, "#ffd93d"],
      ["Wie heißt du?", 22, "#cfc8ff"],
    ], 200, 52);
    ctx.fillStyle = "#ffffff22";
    ctx.fillRect(W / 2 - 140, 370, 280, 52);
    const cursor = Math.sin(t * 6) > 0 ? "|" : " ";
    drawCenteredText([[playerName + cursor, 28, "#fff"]], 406);
    drawCenteredText([["Tippen und Enter drücken (min. 2 Zeichen)", 15, "#cfc8ff88"]], 460);
  }

  if (state === S.OVER) {
    ctx.fillStyle = "#000a";
    ctx.fillRect(0, 0, W, H);
    const lines = [
      ["Game Over!", 44, "#ff7b6b"],
      [`${score} Punkte`, 32, "#ffd93d"],
    ];
    if (lastRank) lines.push([`Platz ${lastRank} in der Bestenliste! 🏆`, 22, "#6bcbff"]);
    lines.push(["Klick: Bestenliste ansehen", 18, "#cfc8ff"]);
    drawCenteredText(lines, 230, 56);
  }

  if (state === S.SCORES) {
    drawCenteredText([["🏆 Bestenliste", 36, "#ffd93d"]], 70);
    if (onlineOk === false) {
      drawCenteredText([["(offline — lokal gespeichert)", 15, "#cfc8ff88"]], 100);
    }
    ctx.font = "bold 20px 'Segoe UI', sans-serif";
    if (!topList.length) {
      drawCenteredText([["Noch keine Einträge — sei der Erste!", 20, "#cfc8ff"]], 200);
    }
    topList.slice(0, 10).forEach((row, i) => {
      const y = 150 + i * 40;
      ctx.textAlign = "left";
      ctx.fillStyle = i === 0 ? "#ffd93d" : "#f4f1ff";
      ctx.fillText(`${i + 1}.`, 60, y);
      ctx.fillText(row.name, 110, y);
      ctx.textAlign = "right";
      ctx.fillText(String(row.score), W - 70, y);
    });
    drawCenteredText([["Klicken für neue Runde ▶", 20, "#6bcbff"]], 600);
  }
}

/* ---------- Hauptschleife ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === S.PLAY) update(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(loop);
