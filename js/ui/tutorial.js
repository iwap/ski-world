'use strict';
// Tutorialen där en bot visar hur man spelar.

// ---------- Tutorial: en bot åker en kort bana och visar knapparna ----------
let tutorial = null; // { step, t, botKeys, done }
const TUT_KEYS = {
  ArrowLeft: { key: '←', touch: '◀' }, ArrowRight: { key: '→', touch: '▶' }, ArrowDown: { key: '↓', touch: '▼' },
  Space: { key: 'Space', touch: 'HOPP' }, KeyF: { key: 'F', touch: '🤙' }, KeyT: { key: 'T', touch: '⬇' },
};
// Steg efter sträcka: vilka knappar som visas och var hindren ligger
const TUT_STEPS = [
  { id: 'steer', until: 45, keys: ['ArrowLeft', 'ArrowRight'] },
  { id: 'tuck', until: 75, keys: ['KeyT'] },
  { id: 'jump', until: 100, keys: ['Space'] },
  { id: 'spin', until: 172, keys: ['ArrowLeft', 'ArrowRight'], ramp: [2, 115] },
  { id: 'flip', until: 252, keys: ['ArrowDown'], ramp: [2, 190] },
  { id: 'grab', until: 330, keys: ['KeyF'], ramp: [2, 268] },
  { id: 'rail', until: 420, keys: ['Space'], ramp: [0, 345], rail: true },
  { id: 'done', until: Infinity, keys: [] },
];

function startTutorial() {
  leaveJoinedGroup();
  save.tutorialSeen = true;
  persist();
  if (race) leaveSession();
  if (party.hosting) cancelHosting();
  if (daily) endDaily();
  tutorial = { step: -1, t: 0, botKeys: new Set(), doneT: 0 };
  // Klassisk bana utan slumpade hinder – bara tutorialens hopp och rail
  course = COURSES.classic;
  resetWorld();
  objects.forEach(removeObject);
  objects = [];
  features = [];
  nextSpawnD = 1e9;
  nextGateD = 1e9;
  const rampType = OBSTACLES.find((o) => o.type === 'ramp');
  for (const st of TUT_STEPS) {
    if (!st.ramp) continue;
    const [size, d] = st.ramp;
    const real = course;
    course = { ...real, rampSizes: RAMPS.map((_, i) => (i === size ? 1 : 0)) };
    const o = makeObject(rampType, 0, d);
    course = real;
    if (o.feature) {
      features = features.filter((f) => f !== o.feature);
      o.feature = null;
    }
    objects.push(o);
    if (st.rail) {
      const random = Math.random;
      Math.random = () => 0; // railen ska alltid komma
      spawnRailAfterJump(o);
      Math.random = random;
    }
  }
  objects.sort((a, b) => a.d - b.d);
  player.lives = 99;
  player.speed = stats().cruise;
  $('popups').innerHTML = '';
  wasMenu = true;
  state = 'playing';
  showOverlay(null);
  $('tutorial').classList.remove('hidden');
}

function endTutorial() {
  if (!tutorial) return;
  for (const k of tutorial.botKeys) keys.delete(k);
  keys.clear();
  pressed.clear();
  tutorial = null;
  $('tutorial').classList.add('hidden');
  course = COURSES[save.course] || COURSES.classic;
  resetWorld();
  showMenu();
}

// Boten: styr mot mitten, gör stegets trick och "trycker" på knapparna
function updateTutorial(dt) {
  const p = player;
  const tu = tutorial;
  tu.t += dt;
  const idx = TUT_STEPS.findIndex((st) => p.d < st.until);
  if (idx !== tu.step) {
    tu.step = idx;
    tu.stepT = 0;
    tu.jumped = false;
    renderTutorial();
  }
  tu.stepT += dt;
  const st = TUT_STEPS[idx];
  const want = new Set();
  const airborne = p.air && !p.smallAir;
  if (!p.air && !p.grind) {
    // Styrning: slalom i första steget, annars rakt mot mitten
    const tx = st.id === 'steer' ? 7 * Math.sin(tu.stepT * 1.6) : 0;
    const aim = Math.atan2(tx - p.x, 10) * 0.7;
    if (p.angle < aim - 0.05) want.add('ArrowRight');
    else if (p.angle > aim + 0.05) want.add('ArrowLeft');
  }
  if (st.id === 'tuck' && !p.air) want.add('KeyT');
  if (st.id === 'jump' && !tu.jumped && p.d > 84) {
    want.add('Space');
    tu.jumped = true;
  }
  // Tricks bara på stegets hopp (inte på små skutt i backen)
  const overKicker = airborne && st.ramp && p.d > st.ramp[1] && p.d < st.ramp[1] + 40;
  if (st.id === 'spin' && overKicker) {
    // Snurra till 360 – hinns det inte före landningen, stanna på närmaste halvvarv
    const a = Math.abs(p.spin);
    const tLand = (p.vz + Math.sqrt(Math.max(0, p.vz * p.vz + 2 * GRAVITY * p.z))) / GRAVITY;
    const nearHalf = a > 1 && Math.abs(a - Math.round(a / Math.PI) * Math.PI) < 0.12;
    const nextHalf = (Math.floor(a / Math.PI) + 1) * Math.PI;
    const tooLate = (nextHalf - a) / stats().spinRate > tLand - 0.05;
    if (a < Math.PI * 2 - 0.12 && !(nearHalf && tooLate)) want.add('ArrowRight');
  }
  if (st.id === 'flip' && overKicker && !tu.jumped) {
    want.add('ArrowDown');
    tu.jumped = true;
  }
  if (st.id === 'grab' && overKicker && (p.vz > 0 || p.z > 0.6)) want.add('KeyF');
  if (st.id === 'done') {
    tu.doneT += dt;
    if (tu.doneT > 3) {
      endTutorial();
      return;
    }
  }
  // Släpp knappar som inte längre hålls, tryck nya
  for (const k of tu.botKeys) if (!want.has(k)) keys.delete(k);
  for (const k of want) if (!tu.botKeys.has(k)) virtualDown(k);
  tu.botKeys = want;
  for (const chip of $('tut-keys').children) chip.classList.toggle('on', keys.has(chip.dataset.code));
}

function renderTutorial() {
  const st = TUT_STEPS[tutorial.step];
  setText('tut-title', t(`tut.${st.id}`));
  setText('tut-desc', t(TOUCH ? `tut.${st.id}.dt` : `tut.${st.id}.d`));
  setText('tut-step', `${Math.min(tutorial.step + 1, TUT_STEPS.length - 1)} / ${TUT_STEPS.length - 1}`);
  const wrap = $('tut-keys');
  wrap.innerHTML = '';
  for (const code of st.keys) {
    const chip = document.createElement('kbd');
    chip.className = 'tut-key';
    chip.dataset.code = code;
    chip.textContent = TUT_KEYS[code][TOUCH ? 'touch' : 'key'];
    wrap.append(chip);
  }
}
