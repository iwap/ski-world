'use strict';
// Sparning i webbläsaren och spelarens värden (fart, hopp, förmågor).

function loadSave() {
  const fresh = {
    bank: 0, best: 0, bestDist: 0, upgrades: {},
    owned: STYLES.filter((st) => st.cost === 0).map((st) => st.id),
    style: { jacket: 'jacket-orange', helmet: 'helmet-blue', gear: 'gear-blue', poles: 'poles-none' },
    rider: 'ski', character: 'classic', badges: {}, badgeProg: {}, courses: ['classic'], course: 'classic', difficulty: 'normal', night: false, fpv: false, lift: true, helmetOn: true, turnSens: 1, lang: detectLang(), name: '', leaderboard: [], audio: { music: true, sfx: true, song: 0 },
  };
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    Object.assign(fresh, data, { style: { ...fresh.style, ...(data.style || {}) } });
  } catch { /* ingen sparning än */ }
  for (const u of UPGRADES) fresh.upgrades[u.id] = fresh.upgrades[u.id] || 0;
  // Okända värden (t.ex. från en äldre version) ersätts med standard
  if (!COURSES[fresh.course]) fresh.course = 'classic';
  // Anonymt spelar-id för den globala topplistan (så att man ser sina egna rader)
  if (typeof fresh.playerId !== 'string' || fresh.playerId.length < 8) {
    fresh.playerId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  }
  if (!Array.isArray(fresh.pendingScores)) fresh.pendingScores = [];
  if (!Array.isArray(fresh.courses)) {
    // Äldre sparning: banor man redan har åkt behåller man
    fresh.courses = ['classic', ...new Set(fresh.leaderboard.map((e) => e.course).filter((c) => c && c !== 'classic'))];
  }
  fresh.courses = fresh.courses.filter((c) => COURSES[c]);
  if (!fresh.courses.includes('classic')) fresh.courses.unshift('classic');
  if (!fresh.courses.includes(fresh.course)) fresh.course = 'classic';
  if (!DIFFICULTIES[fresh.difficulty]) fresh.difficulty = 'normal';
  if (!CHARACTERS.some((c) => c.id === fresh.character)) fresh.character = 'classic';
  // Ägda karaktärer: startgubbarna + det man fått ur boxen (äldre sparningar behåller den man har valt)
  if (!Array.isArray(fresh.chars)) fresh.chars = [fresh.character];
  for (const c of CHARACTERS) if (c.rarity === 'starter' && !fresh.chars.includes(c.id)) fresh.chars.push(c.id);
  fresh.chars = fresh.chars.filter((id) => CHARACTERS.some((c) => c.id === id));
  if (!fresh.chars.includes(fresh.character)) fresh.character = 'classic';
  if (!fresh.badges || typeof fresh.badges !== 'object') fresh.badges = {};
  if (!fresh.badgeProg || typeof fresh.badgeProg !== 'object') fresh.badgeProg = {};
  if (!LANGS[fresh.lang]) fresh.lang = detectLang();
  fresh.audio = { music: true, sfx: true, song: 0, ...(fresh.audio || {}) };
  for (const cat of STYLE_CATS) {
    if (!STYLES.some((st) => st.id === fresh.style[cat.id])) fresh.style[cat.id] = STYLES.find((st) => st.cat === cat.id).id;
  }
  // Nya gratisval (t.ex. stavar) ska finnas även i äldre sparningar
  for (const st of STYLES) if (st.cost === 0 && !fresh.owned.includes(st.id)) fresh.owned.push(st.id);
  return fresh;
}

function persist() {
  // Under dagens utmaning, online-sessioner och spökjakter är bana/svårighetsgrad tillfälliga – spara mina egna
  let tmp = null;
  try { tmp = daily || race || runSeed; } catch { /* anropas även innan de är deklarerade (vid start) */ }
  const data = tmp && tmp.prev ? { ...save, course: tmp.prev.course, difficulty: tmp.prev.difficulty } : save;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* privat läge */ }
}

const save = loadSave();
course = COURSES[save.course] || COURSES.classic;
difficulty = DIFFICULTIES[save.difficulty] || DIFFICULTIES.normal;
const upgradeCost = (u, level) => Math.round(u.base * Math.pow(u.growth, level) / 50) * 50;
const styleColor = (cat) => (STYLES.find((st) => st.id === save.style[cat]) || STYLES.find((st) => st.cat === cat)).color;
const isBoard = () => save.rider === 'board';

const KMH = 1 / 3.6;
const MAX_SPEED = 100 * KMH;

// Vald karaktärs förmåga, t.ex. { speed: 0.1 }
const ability = (key) => ((CHARACTERS.find((c) => c.id === save.character) || CHARACTERS[0]).ab || {})[key] || 0;

function stats() {
  const u = save.upgrades;
  return {
    cruise: Math.min(100, (50 + u.skis * 10) * difficulty.speed) * KMH * (1 + ability('speed')) * (course.speed || 1), // fart rakt ner – också starthastigheten
    pull: (6 + u.wax * 1.5) * (1 + ability('speed')), // hur hårt backen drar (acceleration)
    turnRate: (1.7 + u.boots * 0.2) * (isBoard() ? 0.92 : 1) * clamp(save.turnSens || 1, 0.5, 2), // svängkänslighet från inställningarna
    jumpPower: (1 + u.binding * 0.025) * (1 + ability('air')),
    spinRate: (5.6 + u.binding * 0.5) * (1 + ability('spin')), // 360 på drygt en sekund
    flipTime: (0.8 - u.binding * 0.04) / (1 + ability('flip')),
    lives: (save.helmetOn === false ? 0 : u.helmet) + ability('lives'), // utan hjälm: en krasch och åket är slut
  };
}
