'use strict';

// ---------- Setup ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const PX_PER_M = 10;          // 10 pixlar = 1 meter
const GRAVITY = 900;          // px/s² för hopp
const PLAYER_SCREEN_Y = 0.3;  // åkaren ritas 30 % ner på skärmen
const ROW = 40;               // höjd på varje genererad rad med hinder

let W = 0;
let H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const fmt = (n) => Math.floor(n).toLocaleString('sv-SE');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- Sparning & utrustning ----------

const SAVE_KEY = 'backkungen-save-v1';

const UPGRADES = [
  { id: 'skis',    icon: '🎿', name: 'Skidor',               desc: 'Högre toppfart',                    max: 5, base: 400 },
  { id: 'wax',     icon: '🧴', name: 'Vallning',             desc: 'Snabbare acceleration',             max: 5, base: 300 },
  { id: 'boots',   icon: '🥾', name: 'Pjäxor',               desc: 'Skarpare svängar',                  max: 5, base: 350 },
  { id: 'binding', icon: '🌀', name: 'Freestyle-bindningar', desc: 'Högre hopp och snabbare tricks',    max: 5, base: 500 },
  { id: 'helmet',  icon: '⛑️', name: 'Hjälm',                desc: 'Överlev en krasch extra per nivå',  max: 3, base: 1200 },
];

function loadSave() {
  const fresh = { bank: 0, best: 0, bestDist: 0, upgrades: {} };
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    Object.assign(fresh, data);
  } catch { /* ingen sparning än */ }
  for (const u of UPGRADES) fresh.upgrades[u.id] = fresh.upgrades[u.id] || 0;
  return fresh;
}

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* privat läge */ }
}

const save = loadSave();

const upgradeCost = (u, level) => Math.round(u.base * Math.pow(1.9, level) / 10) * 10;

function stats() {
  const u = save.upgrades;
  return {
    maxSpeed: 320 + u.skis * 45,
    accel: 140 + u.wax * 40,
    turnRate: 2.2 + u.boots * 0.45,
    jumpPower: 1 + u.binding * 0.1,
    spinRate: 8 + u.binding * 1.3,
    flipTime: 0.75 - u.binding * 0.06,
    lives: u.helmet,
  };
}

// ---------- Input ----------

const keys = new Set();
const pressed = new Set();
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (state === 'playing') togglePause();
});

const isLeft = () => keys.has('ArrowLeft') || keys.has('KeyA');
const isRight = () => keys.has('ArrowRight') || keys.has('KeyD');
const isUp = () => keys.has('ArrowUp') || keys.has('KeyW');
const isDown = () => keys.has('ArrowDown') || keys.has('KeyS');
const wasPressed = (...codes) => codes.some((c) => pressed.has(c));

// ---------- Spelvärld ----------

const OBSTACLES = [
  { type: 'tree',    weight: 45, r: 14, h: 70,  crash: 'Rakt in i en gran!' },
  { type: 'bigtree', weight: 12, r: 20, h: 100, crash: 'Den stora tallen vann.' },
  { type: 'rock',    weight: 14, r: 13, h: 14,  crash: 'Snubblade på en sten!' },
  { type: 'stump',   weight: 8,  r: 9,  h: 12,  crash: 'Fastnade i en stubbe!' },
  { type: 'snowman', weight: 5,  r: 13, h: 36,  crash: 'Förlåt, snögubbe!' },
  { type: 'ramp',    weight: 9,  r: 0,  h: 0 },
  { type: 'star',    weight: 7,  r: 12, h: 0 },
];
const TOTAL_WEIGHT = OBSTACLES.reduce((sum, o) => sum + o.weight, 0);

function pickObstacle() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const o of OBSTACLES) {
    r -= o.weight;
    if (r < 0) return o;
  }
  return OBSTACLES[0];
}

let state = 'menu'; // menu | playing | paused | crashing | gameover | shop
let player;
let objects = [];
let trail = [];
let popups = [];
let run;
let nextSpawnY = 0;

function newPlayer() {
  return {
    x: 0, y: 0, angle: 0, speed: 0,
    z: 0, vz: 0, air: false,
    spin: 0, spinArmed: false, flipping: false, flipProg: 0, flips: 0, grabTime: 0,
    invuln: 0, lives: stats().lives, crashT: 0, crashReason: '',
  };
}

function spawnUntil(limitY) {
  const band = Math.max(W, 800) * 3;
  while (nextSpawnY < limitY) {
    const meters = nextSpawnY / PX_PER_M;
    const density = Math.min(1.4, 0.55 + meters / 1800);
    for (let n = (band / 1000) * density; n > 0; n--) {
      if (n < 1 && Math.random() > n) break;
      const o = pickObstacle();
      const x = player.x + (Math.random() - 0.5) * band;
      const y = nextSpawnY + Math.random() * ROW;
      if (y < 500 && Math.abs(x) < 120) continue; // fri start
      objects.push({ ...o, x, y, seed: Math.random(), taken: false });
    }
    nextSpawnY += ROW;
  }
}

function resetWorld() {
  player = newPlayer();
  objects = [];
  trail = [];
  popups = [];
  run = { tricks: 0, stars: 0 };
  nextSpawnY = 250;
  spawnUntil(H * 1.2);
}

const runScore = () => Math.floor(player.y / PX_PER_M) + run.tricks + run.stars;

// ---------- Skärmar ----------

const OVERLAYS = ['menu', 'shop', 'gameover', 'pause'];

function showOverlay(name) {
  for (const id of OVERLAYS) $(id).classList.toggle('hidden', id !== name);
  $('hud').classList.toggle('hidden', name === 'menu' || name === 'shop');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function showMenu() {
  state = 'menu';
  $('menu-bank').textContent = fmt(save.bank);
  $('menu-best').textContent = fmt(save.best);
  showOverlay('menu');
}

function showShop() {
  state = 'shop';
  renderShop();
  showOverlay('shop');
}

function renderShop() {
  $('shop-bank').textContent = fmt(save.bank);
  const wrap = $('shop-items');
  wrap.innerHTML = '';
  for (const u of UPGRADES) {
    const level = save.upgrades[u.id];
    const maxed = level >= u.max;
    const cost = upgradeCost(u, level);

    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div class="icon">${u.icon}</div>
      <div class="info">
        <div class="name">${u.name} <small>nivå ${level}/${u.max}</small></div>
        <div class="desc">${u.desc}</div>
        <div class="pips">${'<i class="on"></i>'.repeat(level)}${'<i></i>'.repeat(u.max - level)}</div>
      </div>`;

    const btn = document.createElement('button');
    btn.textContent = maxed ? 'Max' : `${fmt(cost)} p`;
    btn.disabled = maxed || save.bank < cost;
    btn.addEventListener('click', () => {
      if (save.bank < cost || save.upgrades[u.id] >= u.max) return;
      save.bank -= cost;
      save.upgrades[u.id]++;
      persist();
      renderShop();
    });
    item.append(btn);
    wrap.append(item);
  }
}

function startRun() {
  resetWorld();
  player.speed = 80;
  state = 'playing';
  showOverlay(null);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showOverlay('pause');
  } else if (state === 'paused') {
    state = 'playing';
    showOverlay(null);
  }
}

function endRun() {
  const dist = Math.floor(player.y / PX_PER_M);
  const total = runScore();
  const record = total > save.best;
  save.bank += total;
  save.best = Math.max(save.best, total);
  save.bestDist = Math.max(save.bestDist, dist);
  persist();

  $('go-reason').textContent = player.crashReason;
  $('go-dist').textContent = `${fmt(dist)} m`;
  $('go-tricks').textContent = fmt(run.tricks);
  $('go-stars').textContent = fmt(run.stars);
  $('go-total').textContent = fmt(total);
  $('go-record').classList.toggle('hidden', !record);
  state = 'gameover';
  showOverlay('gameover');
}

$('btn-play').addEventListener('click', startRun);
$('btn-shop').addEventListener('click', showShop);
$('btn-shop-back').addEventListener('click', showMenu);
$('btn-shop-play').addEventListener('click', startRun);
$('btn-again').addEventListener('click', startRun);
$('btn-go-shop').addEventListener('click', showShop);
$('btn-go-menu').addEventListener('click', showMenu);

// ---------- Spellogik ----------

function popup(title, sub = '', color = '#1d2b3a') {
  popups.push({ title, sub, color, t: 0, life: 1.6 });
}

function clearTricks() {
  const p = player;
  p.spin = 0;
  p.flipping = false;
  p.flipProg = 0;
  p.flips = 0;
  p.grabTime = 0;
}

function launch(vz) {
  const p = player;
  p.air = true;
  p.vz = vz;
  p.z = 0.01;
  clearTricks();
  // Styrningen från marken ska inte bli en oavsiktlig snurr – släpp först
  p.spinArmed = !isLeft() && !isRight();
  trail.push({ gap: true });
}

function crash(reason) {
  const p = player;
  clearTricks();
  p.air = false;
  p.z = 0;
  p.vz = 0;
  if (p.lives > 0) {
    p.lives--;
    p.invuln = 2;
    p.speed *= 0.3;
    popup(reason, 'Hjälmen räddade dig!', '#e53935');
    return;
  }
  p.crashReason = reason;
  p.crashT = 0;
  state = 'crashing';
}

function land() {
  const p = player;
  p.air = false;
  p.z = 0;
  p.vz = 0;

  let flips = p.flips;
  if (p.flipping) {
    if (p.flipProg < 0.8) return crash('Landade på huvudet!');
    flips++;
  }
  const turns = Math.round(p.spin / (Math.PI * 2));
  const off = Math.abs(p.spin - turns * Math.PI * 2);
  if (off > 0.6 && Math.abs(p.spin) > 1) return crash('Landade snett!');

  const parts = [];
  let pts = 0;
  const spins = Math.abs(turns);
  if (spins > 0) {
    parts.push(`${spins * 360}`);
    pts += 150 * spins * (spins + 1) / 2;
  }
  if (flips > 0) {
    parts.push(flips === 1 ? 'Backflip' : flips === 2 ? 'Dubbel backflip' : `${flips}x backflip`);
    pts += 300 * flips * (flips + 1) / 2;
  }
  if (p.grabTime > 0.25) {
    parts.push('Grab');
    pts += Math.round(p.grabTime * 250);
  }
  clearTricks();

  if (pts > 0) {
    const mult = parts.length;
    pts *= mult;
    run.tricks += pts;
    popup(parts.join(' + '), `+${fmt(pts)}${mult > 1 ? ` (combo x${mult})` : ''}`, '#ef6c00');
  }
}

function update(dt) {
  const s = stats();
  const p = player;
  const meters = p.y / PX_PER_M;
  const slopeBoost = 1 + Math.min(0.35, meters / 6000); // backen blir brantare ju längre ner
  if (p.invuln > 0) p.invuln -= dt;

  if (!p.air) {
    if (isLeft()) p.angle -= s.turnRate * dt;
    else if (isRight()) p.angle += s.turnRate * dt;
    else p.angle -= Math.sign(p.angle) * Math.min(Math.abs(p.angle), 1.4 * dt);
    p.angle = clamp(p.angle, -1.35, 1.35);

    let target = s.maxSpeed * slopeBoost * (0.25 + 0.75 * Math.cos(p.angle));
    if (isDown()) target *= 1.15;
    if (isUp()) target *= 0.25;
    if (p.speed < target) p.speed = Math.min(target, p.speed + s.accel * (isDown() ? 1.3 : 1) * dt);
    else p.speed = Math.max(target, p.speed - (isUp() ? 600 : 220) * dt);

    if (wasPressed('Space')) launch(250 * s.jumpPower);
  } else {
    if (!isLeft() && !isRight()) p.spinArmed = true;
    if (p.spinArmed && isLeft()) p.spin -= s.spinRate * dt;
    if (p.spinArmed && isRight()) p.spin += s.spinRate * dt;
    if (!p.flipping && wasPressed('ArrowUp', 'KeyW')) {
      p.flipping = true;
      p.flipProg = 0;
    }
    if (p.flipping) {
      p.flipProg += dt / s.flipTime;
      if (p.flipProg >= 1) {
        p.flipping = false;
        p.flips++;
      }
    }
    if (isDown()) p.grabTime += dt;
  }

  p.x += Math.sin(p.angle) * p.speed * dt;
  p.y += Math.cos(p.angle) * p.speed * dt;

  if (p.air) {
    p.vz -= GRAVITY * dt;
    p.z += p.vz * dt;
    if (p.z <= 0) land();
  }
  if (state !== 'playing') return;

  // Kollisioner
  for (const o of objects) {
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    if (Math.abs(dy) > 40 || Math.abs(dx) > 60 || o.taken) continue;
    if (o.type === 'ramp') {
      if (!p.air && Math.abs(dx) < 28 && Math.abs(dy) < 14) launch((330 + p.speed * 0.35) * s.jumpPower);
      continue;
    }
    if (o.type === 'star') {
      if (p.z < 70 && dx * dx + dy * dy < (o.r + 12) ** 2) {
        o.taken = true;
        run.stars += 50;
        popup('⭐ +50', '', '#f9a825');
      }
      continue;
    }
    if (p.invuln > 0 || p.z >= o.h) continue;
    if (dx * dx + dy * dy < (o.r + 7) ** 2) {
      crash(o.crash);
      break;
    }
  }

  // Skidspår
  if (!p.air) {
    const last = trail[trail.length - 1];
    if (!last || last.gap || (p.x - last.x) ** 2 + (p.y - last.y) ** 2 > 36) {
      trail.push({ x: p.x, y: p.y, ox: Math.cos(p.angle) * 4, oy: -Math.sin(p.angle) * 2 });
    }
  }

  // Generera nya hinder och städa bort gamla
  spawnUntil(p.y + H * (1 - PLAYER_SCREEN_Y) + 160);
  const cutoff = p.y - H * PLAYER_SCREEN_Y - 120;
  objects = objects.filter((o) => o.y > cutoff && !(o.type === 'star' && o.taken));
  while (trail.length && (trail[0].gap || trail[0].y < cutoff)) trail.shift();
}

function updateCrash(dt) {
  const p = player;
  p.crashT += dt;
  p.speed *= Math.max(0, 1 - 3 * dt);
  p.x += Math.sin(p.angle) * p.speed * dt;
  p.y += Math.cos(p.angle) * p.speed * dt;
  if (p.crashT > 1.2) endRun();
}

// ---------- Rendering ----------

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function drawSnow(camX, camY) {
  ctx.fillStyle = '#f3f7fb';
  ctx.fillRect(0, 0, W, H);
  const C = 140;
  const x0 = Math.floor(camX / C);
  const y0 = Math.floor(camY / C);
  ctx.strokeStyle = '#dde7f1';
  ctx.lineWidth = 2;
  for (let ix = x0 - 1; ix <= x0 + Math.ceil(W / C) + 1; ix++) {
    for (let iy = y0 - 1; iy <= y0 + Math.ceil(H / C) + 1; iy++) {
      const h = hash(ix, iy);
      if (h < 0.55) continue;
      const x = ix * C + hash(ix + 7, iy) * C - camX;
      const y = iy * C + hash(ix, iy + 3) * C - camY;
      ctx.beginPath();
      ctx.arc(x, y, 10 + h * 14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }
}

function drawTrail(camX, camY) {
  ctx.strokeStyle = '#cfdbe8';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    let open = false;
    for (const t of trail) {
      if (t.gap) { open = false; continue; }
      const x = t.x - camX + side * t.ox;
      const y = t.y - camY + side * t.oy;
      if (open) ctx.lineTo(x, y);
      else { ctx.moveTo(x, y); open = true; }
    }
    if (open && !player.air && state !== 'crashing') {
      ctx.lineTo(player.x - camX + side * Math.cos(player.angle) * 4, player.y - camY - side * Math.sin(player.angle) * 2);
    }
    ctx.stroke();
  }
}

function shadow(x, y, rx, ry) {
  ctx.fillStyle = 'rgba(70, 90, 120, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function triangle(x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function drawTree(x, y, big, seed) {
  const s = (big ? 1.5 : 1) * (0.85 + seed * 0.3);
  shadow(x + 8 * s, y, 20 * s, 6 * s);
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(x - 3 * s, y - 12 * s, 6 * s, 12 * s);
  const tiers = [[24, -8, -36], [19, -22, -48], [13, -36, -60]];
  const greens = big ? ['#1b5e20', '#2e7d32', '#388e3c'] : ['#2e7d32', '#388e3c', '#43a047'];
  tiers.forEach(([hw, base, apex], i) => {
    ctx.fillStyle = greens[i];
    triangle(x - hw * s, y + base * s, x + hw * s, y + base * s, x, y + apex * s);
    const k = 0.35;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    triangle(x - hw * k * s, y + (apex + (base - apex) * k) * s, x + hw * k * s, y + (apex + (base - apex) * k) * s, x, y + apex * s);
  });
}

function drawRock(x, y, seed) {
  const s = 0.9 + seed * 0.3;
  shadow(x + 4, y + 1, 16 * s, 5 * s);
  ctx.fillStyle = '#78909c';
  ctx.beginPath();
  ctx.ellipse(x, y - 5 * s, 15 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b0bec5';
  ctx.beginPath();
  ctx.ellipse(x - 4 * s, y - 8 * s, 6 * s, 3 * s, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x + 2 * s, y - 13 * s, 8 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStump(x, y) {
  shadow(x + 3, y + 1, 11, 4);
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(x - 8, y - 10, 16, 10);
  ctx.fillStyle = '#bcaaa4';
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 8, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 4, 1.7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSnowman(x, y) {
  shadow(x + 5, y, 14, 5);
  ctx.strokeStyle = '#b8c7d6';
  ctx.lineWidth = 1.5;
  ctx.fillStyle = '#fff';
  for (const [cy, r] of [[-10, 11], [-27, 8]]) {
    ctx.beginPath();
    ctx.arc(x, y + cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#263238';
  ctx.fillRect(x - 6, y - 36, 12, 3);
  ctx.fillRect(x - 4, y - 44, 8, 8);
  ctx.beginPath();
  ctx.arc(x - 3, y - 28, 1.2, 0, Math.PI * 2);
  ctx.arc(x + 3, y - 28, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fb8c00';
  triangle(x, y - 26, x, y - 23, x + 7, y - 24.5);
}

function drawRamp(x, y) {
  ctx.fillStyle = '#d6ebf8';
  ctx.strokeStyle = '#90bfe3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 22, y - 14);
  ctx.lineTo(x + 22, y - 14);
  ctx.lineTo(x + 27, y + 10);
  ctx.lineTo(x - 27, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#4f8fc7';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 27, y + 10);
  ctx.lineTo(x + 27, y + 10);
  ctx.stroke();
  ctx.strokeStyle = '#90bfe3';
  ctx.lineWidth = 2;
  for (const cy of [-7, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - 8, cy - 3);
    ctx.lineTo(x, cy + 3);
    ctx.lineTo(x + 8, cy - 3);
    ctx.stroke();
  }
}

function drawStar(x, y, seed, time) {
  const bob = Math.sin(time * 3 + seed * 10) * 3;
  shadow(x, y, 8, 3);
  ctx.save();
  ctx.translate(x, y - 18 + bob);
  ctx.rotate(time * 1.5 + seed * 6);
  ctx.fillStyle = '#ffc107';
  ctx.strokeStyle = '#ff8f00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.5 : 11;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawObject(o, x, y, time) {
  switch (o.type) {
    case 'tree': return drawTree(x, y, false, o.seed);
    case 'bigtree': return drawTree(x, y, true, o.seed);
    case 'rock': return drawRock(x, y, o.seed);
    case 'stump': return drawStump(x, y);
    case 'snowman': return drawSnowman(x, y);
    case 'star': return drawStar(x, y, o.seed, time);
  }
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawSkier(sx, sy) {
  const p = player;
  const sh = Math.max(0.4, 1 - p.z / 200);
  shadow(sx, sy, 13 * sh, 5 * sh);

  ctx.save();
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.translate(sx, sy - p.z * 0.8);
  const scale = 1 + p.z / 350;
  ctx.scale(scale, scale);

  let rot = 0;
  if (p.flipping) rot = -p.flipProg * Math.PI * 2;
  if (state === 'crashing') rot = p.crashT * 9;
  if (rot) {
    ctx.translate(0, -14);
    ctx.rotate(rot);
    ctx.translate(0, 14);
  }

  const a = p.angle + p.spin;
  const fx = Math.sin(a);
  const fy = Math.cos(a) * 0.5;
  const px = Math.cos(a) * 4;
  const py = -Math.sin(a) * 2;
  const grab = p.air && isDown();
  const lean = Math.sin(p.angle) * 2;
  const hip = grab ? -5 : -9;
  const top = grab ? -18 : -23;

  // Skidor
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1565c0';
  ctx.lineWidth = 3.5;
  for (const side of [-1, 1]) line(side * px - fx * 13, side * py - fy * 13, side * px + fx * 15, side * py + fy * 15);

  // Stavar eller grab
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 2;
  if (grab) {
    ctx.strokeStyle = '#c62828';
    ctx.lineWidth = 3;
    line(-6 + lean, top + 6, -px - 2, -py);
    line(6 + lean, top + 6, px + 2, py);
  } else {
    line(-8 + lean, top + 11, -11 - fx * 8, 2 - fy * 8);
    line(8 + lean, top + 11, 11 - fx * 8, 2 - fy * 8);
  }

  // Ben
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 4;
  line(-3, 0, -2 + lean * 0.5, hip);
  line(3, 0, 2 + lean * 0.5, hip);

  // Jacka
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.roundRect(-7 + lean, top, 14, hip - top + 2, 4);
  ctx.fill();

  // Huvud, mössa, goggles
  const headY = top - 5;
  ctx.fillStyle = '#ffcc80';
  ctx.beginPath();
  ctx.arc(lean, headY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e88e5';
  ctx.beginPath();
  ctx.arc(lean, headY - 1, 6.3, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(lean, headY - 8, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (Math.cos(p.spin) >= 0) {
    ctx.fillStyle = '#263238';
    ctx.fillRect(lean - 5, headY - 1, 10, 3.5);
  }
  ctx.restore();
}

function drawPopups() {
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  popups.forEach((pp, i) => {
    const k = pp.t / pp.life;
    ctx.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
    const y = H * 0.6 - pp.t * 25 - (popups.length - 1 - i) * 52;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.strokeText(pp.title, W / 2, y);
    ctx.fillStyle = pp.color;
    ctx.fillText(pp.title, W / 2, y);
    if (pp.sub) {
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.strokeText(pp.sub, W / 2, y + 22);
      ctx.fillStyle = '#1d2b3a';
      ctx.fillText(pp.sub, W / 2, y + 22);
    }
  });
  ctx.globalAlpha = 1;
}

function render(time) {
  const p = player;
  const camX = p.x - W / 2;
  const camY = p.y - H * PLAYER_SCREEN_Y;

  drawSnow(camX, camY);
  drawTrail(camX, camY);

  const visible = objects.filter((o) =>
    !o.taken && o.y - camY > -20 && o.y - camY < H + 150 && o.x - camX > -80 && o.x - camX < W + 80);

  for (const o of visible) if (o.type === 'ramp') drawRamp(o.x - camX, o.y - camY);

  // Rita i y-ordning så att saker längre ner hamnar framför
  const sorted = visible.filter((o) => o.type !== 'ramp').sort((a, b) => a.y - b.y);
  let skierDrawn = false;
  for (const o of sorted) {
    if (!skierDrawn && !p.air && o.y > p.y) {
      drawSkier(p.x - camX, p.y - camY);
      skierDrawn = true;
    }
    drawObject(o, o.x - camX, o.y - camY, time);
  }
  if (!skierDrawn) drawSkier(p.x - camX, p.y - camY);

  drawPopups();
}

function updateHud() {
  const p = player;
  $('hud-dist').textContent = `${fmt(p.y / PX_PER_M)} m`;
  $('hud-score').textContent = fmt(runScore());
  $('hud-speed').textContent = `${fmt((p.speed / PX_PER_M) * 3.6)} km/h`;
  $('hud-lives').textContent = p.lives > 0 ? '⛑️'.repeat(p.lives) : '–';
  $('air-hint').classList.toggle('hidden', !(p.air && state === 'playing'));
}

// ---------- Huvudloop ----------

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (wasPressed('Enter', 'NumpadEnter') && ['menu', 'shop', 'gameover'].includes(state)) startRun();
  if (state === 'playing') update(dt);
  else if (state === 'crashing') updateCrash(dt);

  if (state !== 'paused') {
    for (const pp of popups) pp.t += dt;
    popups = popups.filter((pp) => pp.t < pp.life);
  }

  render(now / 1000);
  updateHud();
  pressed.clear();
  requestAnimationFrame(frame);
}

resetWorld();
showMenu();
requestAnimationFrame(frame);
