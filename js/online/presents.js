'use strict';
// Tomtens presenter: var 15:e minut göms 100 presenter, lika många på varje bana. Samma presenter för alla
// spelare – den som hittar en först får den (servern avgör), och sedan är den borta för alla andra.

const PRESENT_COUNT = 100;
const PRESENT_WINDOW = 15 * 60 * 1000;
const PRESENT_PAY = 500;    // pengar per present
const PRESENT_POLL = 30;    // sekunder mellan kollarna av vilka som redan är tagna
// ready = servern har svarat vilka som är tagna (utan svar, t.ex. offline, läggs inga presenter ut)
const presents = { win: null, ready: false, claimed: new Set(), placed: new Map(), poll: 0, announced: null };

const presentWin = () => Math.floor(Date.now() / PRESENT_WINDOW);

// Var present nummer idx ligger i omgång win: samma för alla, inom den kortaste banlängden (Lätt) så att alla når den
function presentSpot(win, idx) {
  const ids = Object.keys(COURSES);
  const id = ids[idx % ids.length];
  const c = COURSES[id];
  const rand = mulberry32((win * 131 + idx * 7919) >>> 0);
  const len = DIFFICULTIES.easy.length * (c.lengthMult || 1);
  const half = c.pipe ? PIPE_COPING - 2 : (c.netX || NET_X) - 4;
  return { idx, course: id, d: 80 + rand() * (len - 140), x: (rand() - 0.5) * 2 * Math.min(half, 30) };
}

// Ny värld: inga presenter är utlagda än
function presentsReset() {
  presents.placed.clear();
}

function refreshPresentClaims() {
  const win = presents.win;
  Online.presentClaims(win).then((rows) => {
    if (presents.win !== win) return;
    for (const r of rows) presents.claimed.add(r.idx);
    presents.ready = true;
    for (const [idx, o] of presents.placed) if (presents.claimed.has(idx)) o.taken = true;
    // Meddelandet när presenterna har kommit (bara om det finns några kvar)
    if (presents.announced !== win && presents.claimed.size < PRESENT_COUNT) {
      presents.announced = win;
      setText('present-text', `🎅 ${t('present.spawn')}`);
      $('present-toast').classList.remove('hidden');
      setTimeout(() => $('present-toast').classList.add('hidden'), 7000);
    }
  }).catch(() => {});
}

// Lägg ut presenterna på den här banan när backen där är byggd. De påverkar inte hur backen byggs
// (samma bana för alla i ett race och för spöken) – står något i vägen flyttas presenten lite åt sidan.
function placePresents() {
  if (!presents.ready || tutorial || (race && (race.mode === 'duel' || race.mode === 'bigair'))) return;
  const type = OBSTACLES.find((o) => o.type === 'present');
  const ids = Object.keys(COURSES);
  for (let idx = ids.indexOf(save.course); idx >= 0 && idx < PRESENT_COUNT; idx += ids.length) {
    if (presents.placed.has(idx) || presents.claimed.has(idx)) continue;
    const s = presentSpot(presents.win, idx);
    if (s.d > nextSpawnD - 5 || s.d > runLength() - 25) continue;
    let o = null;
    for (const dx of [0, 2, -2, 4, -4, 6, -6, 9, -9]) {
      const x = courseX(s.d) + clamp(s.x + dx, -netX() + 2, netX() - 2);
      const c = makeObject(type, x, s.d);
      if (!collides(c) && featureY(x, s.d) > -0.3) {
        o = c;
        break;
      }
    }
    if (!o) o = makeObject(type, courseX(s.d + 3) + clamp(s.x, -netX() + 2, netX() - 2), s.d + 3); // fullt överallt: lägg den strax efter
    o.idx = idx;
    o.win = presents.win;
    // Sorterat efter sträcka – flera kontroller i världen läser listan bakifrån och slutar när de kommit tillräckligt långt upp
    let i = objects.length;
    while (i > 0 && objects[i - 1].d > o.d) i--;
    objects.splice(i, 0, o);
    presents.placed.set(idx, o);
  }
}

// Menyn: hur länge till nästa omgång presenter, och hur många som är kvar nu
function updatePresentTimer() {
  const el = $('present-timer');
  const show = Online.on && state === 'menu';
  el.classList.toggle('hidden', !show);
  if (!show) return;
  const left = Math.max(0, Math.ceil(((presents.win ?? presentWin()) + 1) * PRESENT_WINDOW - Date.now()) / 1000);
  const time = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  const remaining = presents.ready ? PRESENT_COUNT - presents.claimed.size : null;
  const text = `🎅 ${t('present.timer', { time })}${remaining !== null ? ` · ${t('present.left', { n: remaining })}` : ''}`;
  if (el.textContent !== text) el.textContent = text;
}

function updatePresents(dt) {
  updatePresentTimer();
  if (!Online.on) return;
  const win = presentWin();
  if (win !== presents.win) {
    // Ny omgång: de gamla presenterna försvinner, de nya läggs ut
    for (const o of presents.placed.values()) o.taken = true;
    presents.placed.clear();
    presents.win = win;
    presents.claimed = new Set();
    presents.ready = false;
    presents.poll = 0;
  }
  presents.poll -= dt;
  if (presents.poll <= 0) {
    presents.poll = PRESENT_POLL;
    refreshPresentClaims();
  }
  placePresents();
}

// Åkte igenom en present: fråga servern om jag var först
function takePresent(o) {
  if (o.retry && performance.now() < o.retry) return;
  o.taken = true;
  Sound.star();
  Online.claimPresent(o.win, o.idx).then((mine) => {
    presents.claimed.add(o.idx);
    if (mine) {
      save.bank += PRESENT_PAY;
      persist();
      popup(`🎁 ${t('present.got')}`, `+🪙 ${fmt(PRESENT_PAY)}`, '#c62828');
    } else popup(`🎁 ${t('present.gone')}`, '', '#757575');
  }).catch(() => {
    // Servern gick inte att nå: presenten kommer tillbaka och kan tas igen senare
    o.taken = false;
    o.retry = performance.now() + 3000;
  });
}
