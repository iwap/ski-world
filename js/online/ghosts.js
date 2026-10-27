'use strict';
// Spöken på vanliga banor: varje åk byggs från ett frö och spelas in, så att man kan jaga sitt eget eller andras bästa åk.

const GHOST_KEY = 'skiworld-ghosts';
let runSeed = null;         // pågående vanligt åk: { seed, ws, rng, rec, t, next, ghost, prev, done }
let ghostAgain = null;      // "Åk igen" efter en spökjakt jagar samma spöke igen
let ghostResultText = null; // jämförelsen med spöket, visas på resultatskärmen

// Mina bästa åk per bana (egen nyckel – inspelningarna är för stora för att sparas med allt annat varje gång)
function loadGhosts() {
  try {
    const g = JSON.parse(localStorage.getItem(GHOST_KEY));
    return g && typeof g === 'object' ? g : {};
  } catch { return {}; }
}
const myGhosts = loadGhosts();

// ---------- Inspelning och uppspelning (används också av dagens utmaning) ----------
function recordFrame(rec) {
  const p = player;
  rec.push(Math.round(p.x * 10), Math.round(p.d * 10), Math.round(p.z * 10), Math.round(p.angle * 100), Math.round(p.spin * 100));
}

function makeGhostMesh(name) {
  const mesh = makeNpcMesh();
  mesh.add(makeNameTag(`👻 ${name}`));
  mesh.traverse((o) => {
    if (o.material && !o.isSprite) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
    }
  });
  return mesh;
}

// Spökets läge vid tiden t (mellan två mätpunkter)
function ghostAt(data, time) {
  const n = data.length / 5;
  const f = clamp(time / REPLAY_STEP, 0, n - 1);
  const i = Math.floor(f);
  const k = f - i;
  const j = Math.min(i + 1, n - 1);
  const v = (o) => (data[i * 5 + o] + (data[j * 5 + o] - data[i * 5 + o]) * k);
  return { x: v(0) / 10, d: v(1) / 10, z: v(2) / 10, yaw: -v(3) / 100 + v(4) / 100, n };
}

function placeGhost(g, time) {
  const s = ghostAt(g.data, time);
  g.mesh.visible = s.n > 1;
  g.mesh.position.set(s.x, groundY(s.x, s.d) + s.z, -s.d);
  g.mesh.rotation.set(0, s.yaw, 0);
}

// ---------- Vanliga åk ----------
// Bygger backen från ett frö: ett nytt, eller spökets så att banan blir exakt likadan.
// Hoppens landningar räknas från åkarens fart, så spöket tar med sig de värden banan byggdes med.
function seedRun(ghost = null) {
  endRunSeed();
  ghostResultText = null;
  ghostAgain = ghost;
  let prev = null;
  if (ghost && ghost.difficulty !== save.difficulty) {
    // Spökets svårighetsgrad gäller bara under jakten
    prev = { course: save.course, difficulty: save.difficulty };
    save.difficulty = ghost.difficulty;
    difficulty = DIFFICULTIES[ghost.difficulty];
  }
  const s = stats();
  const seed = ghost ? ghost.seed : Math.floor(Math.random() * 2 ** 32);
  const ws = ghost ? { cruise: ghost.cruise, jumpPower: ghost.jump } : { cruise: s.cruise, jumpPower: s.jumpPower };
  runSeed = { seed, ws, rng: null, rec: [], t: 0, next: 0, ghost: null, prev, done: false };
  worldRng = mulberry32(seed);
  resetWorld();
  runSeed.rng = mulberry32(seed + 1);
  worldRng = runSeed.rng;
  if (ghost) {
    runSeed.ghost = { ...ghost, mesh: makeGhostMesh(ghost.name) };
    scene.add(runSeed.ghost.mesh);
  }
}

// Varje bildruta: håll backen på fröet, spela in mig själv och flytta spöket
function updateRunSeed(dt) {
  const r = runSeed;
  if (!r || race || daily || tutorial) return;
  if (!r.done) worldRng = r.rng;
  if (state === 'playing') {
    r.t += dt;
    if (r.t >= r.next) {
      r.next += REPLAY_STEP;
      recordFrame(r.rec);
    }
  }
  if (r.ghost && (state === 'playing' || state === 'crashing' || state === 'finish')) placeGhost(r.ghost, r.t);
}

// Hur långt före (+) eller efter (–) spöket man är, i meter
function ghostGap() {
  const r = runSeed;
  if (!r || !r.ghost || r.done) return null;
  return player.d - ghostAt(r.ghost.data, r.t).d;
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// Åket är slut: spara det som mitt nya spöke om det var mitt bästa på banan, och jämför med spöket jag jagade.
// Returnerar spöket som ska skickas till servern (eller null).
function finishRunSeed(total, finished) {
  const r = runSeed;
  if (!r || r.done || race || daily || tutorial) return null;
  r.done = true;
  worldRng = null;
  const time = finished ? Math.round(r.t * 10) / 10 : null;
  const g = r.ghost;
  if (g) {
    const timed = finished && g.time ? ` · ⏱ ${fmtTime(time)} / ${fmtTime(g.time)}` : '';
    ghostResultText = total > g.score
      ? { text: `👻 ${t('ghost.won', { name: g.name, a: fmt(total), b: fmt(g.score) })}${timed}`, w: 'me' }
      : { text: `👻 ${t('ghost.lost', { name: g.name, a: fmt(g.score), b: fmt(total) })}${timed}`, w: 'opp' };
  }
  const mine = myGhosts[save.course];
  if (total <= 0 || r.rec.length < 10 || (mine && mine.score >= total)) return null;
  const entry = {
    course: save.course, score: total, name: playerName().slice(0, 24), difficulty: save.difficulty, rider: save.rider,
    seed: r.seed, cruise: r.ws.cruise, jump: r.ws.jumpPower, time, data: r.rec, // exakta värden – annars flyttas landningarna en aning
  };
  myGhosts[save.course] = entry;
  try { localStorage.setItem(GHOST_KEY, JSON.stringify(myGhosts)); } catch { /* privat läge eller fullt */ }
  return entry;
}

// Lämnar åket: ta bort spöket och återställ svårighetsgraden om jakten ändrade den
function endRunSeed() {
  const r = runSeed;
  if (!r) return;
  runSeed = null;
  if (r.ghost) scene.remove(r.ghost.mesh);
  if (!r.done) worldRng = null;
  if (r.prev) {
    save.difficulty = r.prev.difficulty;
    difficulty = DIFFICULTIES[save.difficulty] || DIFFICULTIES.normal;
    persist();
  }
}

// Starta en jakt på ett spöke (mitt eget från den här enheten, eller någons från servern)
function chaseGhost(ghost) {
  if (!ghost || !Array.isArray(ghost.data) || !COURSES[ghost.course] || !DIFFICULTIES[ghost.difficulty]) return;
  if (!courseUnlocked(ghost.course)) return Sound.denied();
  save.course = ghost.course;
  course = COURSES[ghost.course];
  persist();
  startRun(ghost);
}

async function chaseOnline(pid, course, name) {
  setStatus('board.loading');
  const rep = await Online.courseReplay(pid, course).catch(() => null);
  if (!rep || !Array.isArray(rep.data)) return setStatus('board.error');
  $('lb-status').classList.add('hidden');
  const mine = pid === save.playerId;
  chaseGhost({ ...rep, course, name: mine ? t('ghost.mine') : String(name || rep.name || '').slice(0, 14) });
}
