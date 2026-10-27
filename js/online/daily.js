'use strict';
// Dagens utmaning med dagstopplista och spöken.

// ---------- Dagens utmaning: samma bana för alla varje dag, med spöken ----------
const DAILY_COURSES = ['classic', 'park', 'moguls', 'slalom', 'bigair', 'pipe'];
const REPLAY_STEP = 0.15; // sekunder mellan spökets mätpunkter
let daily = null;         // pågående dagens åk: { day, seed, course, rng, rec, t, ghost, prev, done }
let dailyAgain = false;   // "Åk igen" på resultatskärmen kör dagens bana igen
let dailyResultText = null;

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10); // UTC-datum, samma för alla
function dayInfo(day = dayKey()) {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const idx = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  return { day, seed: h >>> 0, course: DAILY_COURSES[idx % DAILY_COURSES.length] };
}

function timeToNextDay() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const m = Math.max(0, Math.floor((next - now) / 60000));
  return t('daily.next', { h: Math.floor(m / 60), m: m % 60 });
}

function myDailyBest() {
  const b = save.dailyBest;
  return b && b.day === dayKey() ? b : null;
}

function showDaily() {
  state = 'menu';
  dailyAgain = false;
  showOverlay('daily');
  renderDaily();
}

let dailyReq = 0;
function renderDaily() {
  const info = dayInfo();
  $('daily-course').className = `daily-course course-${info.course}`;
  setText('daily-course-name', `${COURSE_ICONS[info.course]} ${t(`course.${info.course}`)}`);
  setText('daily-next', timeToNextDay());
  const best = myDailyBest();
  setText('daily-best', best ? t('daily.myBest', { n: fmt(best.score) }) : t('daily.noRun'));
  const ghostMine = $('btn-daily-ghost-me');
  ghostMine.classList.toggle('hidden', !(save.dailyGhost && save.dailyGhost.day === info.day));
  const list = $('daily-list');
  list.innerHTML = '';
  if (!Online.on) {
    setText('daily-status', t('daily.offline'));
    return;
  }
  setText('daily-status', t('board.loading'));
  const req = ++dailyReq;
  Promise.all([Online.dailyTop(info.day), Online.dailyReplayIds(info.day)]).then(([rows, ghosts]) => {
    if (req !== dailyReq) return;
    setText('daily-status', rows.length ? '' : t('daily.empty'));
    const withGhost = new Set(ghosts.map((g) => g.player_id));
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = `daily-row${r.player_id === save.playerId ? ' me' : ''}`;
      row.innerHTML = '<span class="dr-rank"></span><span class="dr-name"></span><span class="dr-score"></span>';
      row.querySelector('.dr-rank').textContent = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      row.querySelector('.dr-name').textContent = String(r.name || '').slice(0, 24);
      row.querySelector('.dr-score').textContent = fmt(r.score);
      if (withGhost.has(r.player_id) && r.player_id !== save.playerId) {
        const b = document.createElement('button');
        b.className = 'dr-ghost';
        b.textContent = t('daily.raceGhost');
        b.addEventListener('click', () => startDailyGhost(r.player_id, r.name));
        row.append(b);
      }
      list.append(row);
    });
  }).catch(() => {
    if (req === dailyReq) setText('daily-status', t('board.error'));
  });
}

async function startDailyGhost(pid, name) {
  setText('daily-status', t('board.loading'));
  const rep = await Online.dailyReplay(pid, dayKey()).catch(() => null);
  if (!rep || !Array.isArray(rep.data)) {
    setText('daily-status', t('board.error'));
    return;
  }
  startDaily({ data: rep.data, name: String(name || rep.name || '').slice(0, 14) });
}

// Starta dagens åk (valfritt mot ett spöke). Banan byggs från dagens frö, ingen upplåsning behövs.
function startDaily(ghostRep = null) {
  leaveJoinedGroup();
  raceResultText = null;
  if (race) leaveSession();
  if (party.hosting) cancelHosting();
  endRunSeed();
  endDaily();
  const info = dayInfo();
  daily = { ...info, rec: [], t: 0, next: 0, prev: { course: save.course, difficulty: save.difficulty }, ghost: null, done: false };
  save.course = info.course;
  save.difficulty = 'normal';
  course = COURSES[info.course];
  difficulty = DIFFICULTIES.normal;
  worldRng = mulberry32(info.seed);
  resetWorld();
  worldRng = null;
  daily.rng = mulberry32(info.seed + 1);
  if (ghostRep) daily.ghost = { data: ghostRep.data, mesh: makeGhostMesh(ghostRep.name) };
  $('popups').innerHTML = '';
  wasMenu = true;
  player.speed = stats().cruise;
  state = 'playing';
  showOverlay(null);
  popup(`🗓️ ${t('daily.title')}`, t(`course.${info.course}`), '#00838f');
}

// Varje bildruta: spela in mig själv och flytta spöket
function updateDaily(dt) {
  if (!daily) return;
  if (!daily.done) worldRng = daily.rng;
  if (state !== 'playing' && state !== 'crashing' && state !== 'finish') return;
  const p = player;
  if (state === 'playing') {
    daily.t += dt;
    if (daily.t >= daily.next) {
      daily.next += REPLAY_STEP;
      recordFrame(daily.rec);
    }
  }
  if (daily.ghost) placeGhost(daily.ghost, daily.t);
}

// Dagens åk är slut: pengar som vanligt, dagstopplistan och spöket – inte den vanliga topplistan.
// Banan ligger kvar tills man lämnar resultatet (liften och målet behöver samma terräng).
function recordDaily() {
  lastRank = -1;
  globalRank = null;
  const dist = Math.min(runLength(), Math.floor(player.d));
  const total = runScore();
  save.bank += total;
  daily.done = true;
  worldRng = null;
  const prevBest = myDailyBest();
  const better = !prevBest || total > prevBest.score;
  if (better) {
    save.dailyBest = { day: daily.day, score: total };
    if (total > 0) save.dailyGhost = { day: daily.day, score: total, data: daily.rec };
  }
  persist();
  dailyResultText = better && prevBest ? t('daily.newBest', { n: fmt(total) }) : better ? t('daily.firstRun', { n: fmt(total) }) : t('daily.best', { n: fmt(prevBest.score) });
  if (Online.on && total > 0) {
    const day = daily.day;
    const rec = daily.rec;
    Online.submit({ player_id: save.playerId, name: playerName(), score: total, dist, course: daily.course, difficulty: 'normal', rider: save.rider, day })
      .then((accepted) => (better && accepted ? Online.saveReplay(day, total, playerName(), rec) : null))
      .catch(() => {});
  }
  dailyAgain = true;
  return { dist, total, record: false };
}

function endDaily() {
  if (!daily) return;
  if (daily.ghost) scene.remove(daily.ghost.mesh);
  save.course = daily.prev.course;
  save.difficulty = daily.prev.difficulty;
  course = COURSES[save.course] || COURSES.classic;
  difficulty = DIFFICULTIES[save.difficulty] || DIFFICULTIES.normal;
  daily = null;
  worldRng = null;
  persist();
}
