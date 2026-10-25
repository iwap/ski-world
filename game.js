'use strict';
/* global THREE */

// Ski World – samma spelregler som v1 men i 3D med tredjepersonskamera.
// Enheter: 1 = 1 meter. Åkaren rör sig nedför backen i -z; "d" är sträcka nedför.

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString(locale());
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

const GRAVITY = 20;                  // lite tyngre än verkligheten för snabbare hopp
const ROW = 3;                       // hinder genereras i rader om 3 m
const NET_X = 50;                    // avspärrningsnäten står vid x = ±50 m
const BAND = 2 * (NET_X - 3);        // bredd på området där hinder genereras
const VIEW_AHEAD = 240;
const LIFT_TIME = 15;                // sekunder upp med liften
const LIFT_X = -(NET_X + 14);        // liften går utanför skogen på vänster sida

// ---------- Banor & svårighetsgrader ----------

// slope = genomsnittligt höjdfall per meter. waves = långa vågor i lutningen [amplitud, frekvens, fas]
// som ger branta partier och flackare platåer. weights = hur vanliga olika hinder är.
const COURSES = {
  classic: {
    slope: 0.32, waves: [[0.12, 0.012, 0], [0.06, 0.031, 1]], bumps: 1, moguls: 0, density: 1,
    weights: { tree: 44, pine: 10, rock: 13, stump: 6, snowman: 4, ramp: 9, star: 8, rail: 4, log: 5, box: 0, spine: 2, rollers: 2 },
  },
  park: {
    slope: 0.27, waves: [[0.05, 0.015, 0]], bumps: 0.35, moguls: 0, density: 0.7,
    weights: { tree: 3, pine: 0, rock: 2, stump: 0, snowman: 3, ramp: 32, star: 14, rail: 20, log: 8, box: 16, spine: 8, rollers: 6 },
  },
  moguls: {
    slope: 0.36, waves: [[0.06, 0.012, 0]], bumps: 0.4, moguls: 0.5, density: 0.45,
    weights: { tree: 40, pine: 8, rock: 0, stump: 4, snowman: 6, ramp: 14, star: 30, rail: 0, log: 0, box: 0, rollers: 2 },
  },
  pipe: {
    slope: 0.28, waves: [], bumps: 0, moguls: 0, density: 0.12, pipe: true,
    weights: { tree: 0, pine: 0, rock: 0, stump: 0, snowman: 0, ramp: 0, star: 1, rail: 0, log: 0, box: 0 },
  },
  slalom: {
    slope: 0.3, waves: [[0.08, 0.012, 0]], bumps: 0.5, moguls: 0, density: 0.3, slalom: true,
    weights: { tree: 30, pine: 10, rock: 4, stump: 0, snowman: 3, ramp: 0, star: 10, rail: 0, log: 0, box: 0 },
  },
};
const DIFFICULTIES = {
  easy:   { length: 1000, density: 0.6,  speed: 0.9,  balance: 0.6, points: 0.75 },
  normal: { length: 1500, density: 1,    speed: 1,    balance: 1,   points: 1 },
  hard:   { length: 2000, density: 1.45, speed: 1.12, balance: 1.4, points: 1.5 },
};
let course = COURSES.classic;
let difficulty = DIFFICULTIES.normal;
// Backens längd beror på svårighetsgraden – vid målet väntar sittliften
const runLength = () => difficulty.length;

// Lutningen varierar längs backen. groundY använder integralen av slopeAt så att höjden stämmer exakt.
function slopeAt(d) {
  let s = course.slope;
  for (const [a, f, ph] of course.waves) s += a * Math.sin(d * f + ph);
  return s;
}

function baseY(d) {
  let drop = d * course.slope;
  for (const [a, f, ph] of course.waves) drop -= (a / f) * Math.cos(d * f + ph);
  return -drop;
}

// Puckelpist: puckarna ligger i fält (~200 m) med preparerade partier emellan, i ett slingrande
// stråk mitt i backen. Kanterna och starten är alltid preparerade så att man kan välja själv.
function mogulAmount(x, d) {
  if (!course.moguls || pipeEnv(d) > 0) return 0;
  const field = clamp((Math.sin(d * 0.0196 - 1.2) + 0.35) / 0.5, 0, 1) * clamp((d - 40) / 30, 0, 1);
  if (field === 0) return 0;
  const center = 16 * Math.sin(d * 0.006);
  return field * (1 - smoothstep(14, 24, Math.abs(x - center)));
}

// Runt hopp och landningar är puckarna utjämnade (som luftpuckarna i en puckeltävling)
let calmZones = [];
function mogulCalm(x, d) {
  let k = 1;
  for (const c of calmZones) {
    if (d < c.d0 - 6 || d > c.d1 + 6) continue;
    const m = (1 - smoothstep(c.half, c.half + 4, Math.abs(x - c.x))) * smoothstep(c.d0 - 6, c.d0, d) * (1 - smoothstep(c.d1, c.d1 + 6, d));
    k = Math.min(k, 1 - m);
  }
  return k;
}

// Ett diagonalt rutmönster av puckar (~1 m höga där fältet är som störst)
function mogulY(x, d) {
  const a = mogulAmount(x, d) * (calmZones.length ? mogulCalm(x, d) : 1);
  return a ? course.moguls * a * Math.sin(0.75 * x + 0.55 * d) * Math.sin(0.75 * x - 0.55 * d) : 0;
}

// Små ojämnheter + puckar ovanpå grundlutningen
// Landningar efter stora hopp: en snövall med bord, kant och brant landningsslänt
let features = [];

function featureY(x, d) {
  let h = 0;
  for (const f of features) {
    if (d < f.d0 || d > f.d3) continue;
    const lat = Math.abs(x - f.x);
    if (lat > f.half + f.sideW) continue;
    const side = 1 - smoothstep(f.half, f.half + f.sideW, lat);
    let top;
    if (f.spine) {
      // Spine: upp till en kam och ner på andra sidan
      top = d < f.lip ? f.H * smoothstep(f.d0, f.lip, d) : f.H * (1 - smoothstep(f.lip, f.d3, d));
      h = Math.max(h, top * side);
      continue;
    }
    if (f.rollers) {
      // Rollers: mjuka vågor efter varandra
      top = f.H * Math.sin(Math.PI * (d - f.d0) / f.spacing) ** 2;
      h = Math.max(h, top * side);
      continue;
    }
    if (f.kicker && d < f.lip) {
      // Kickern: en konkav uppfart som slutar vid kanten (lip)
      const u = (d - f.d0) / (f.lip - f.d0);
      const kSide = 1 - smoothstep(f.kHalf, f.kHalf + f.sideW, lat);
      top = f.hK * Math.pow(u, 1.8) * kSide;
      // Bordets sidor börjar redan längs kickern så att snön blir sammanhängande vid kanten
      h = Math.max(h, top, f.H * side * smoothstep(f.lip - 8, f.lip, d));
      continue;
    }
    if (f.kicker && d < f.lip + 0.6) top = f.hK + (f.H - f.hK) * (d - f.lip) / 0.6; // ner från kanten till bordet
    else if (d < f.d1) top = f.H * smoothstep(f.d0, f.d1, d);  // upp till bordet
    else if (d < f.d2) top = f.H;                              // bordet
    else top = f.H * (1 - smoothstep(f.d2, f.d3, d));         // kanten och landningsslänten
    h = Math.max(h, top * side);
  }
  return h;
}

// Halfpipe: platt botten, rundade väggar (kvartscirklar) och plana däck på sidorna
const PIPE_FLAT = 4;      // halva bottens bredd
const PIPE_R = 5.5;       // väggarnas radie = höjd
const PIPE_COPING = PIPE_FLAT + PIPE_R;
const PIPE_LINE = new THREE.Color('#2f6fd6');

// Hur mycket halfpipe det är vid sträckan d (0..1) – Halfpipe-banan är pipe hela vägen
function pipeEnv() {
  return course.pipe ? 1 : 0;
}
const inPipe = (d) => pipeEnv(d) > 0.95;

function pipeY(x, d) {
  const env = pipeEnv(d);
  if (env === 0) return 0;
  const a = Math.abs(x) - PIPE_FLAT;
  if (a <= 0) return 0;
  if (a >= PIPE_R) return PIPE_R * env;
  return (PIPE_R - Math.sqrt(PIPE_R * PIPE_R - a * a)) * env;
}

// Blå markeringslinjer i snön (som i riktiga parker) så att kammar och krön syns mot den vita snön
function onFeatureCrest(x, d) {
  for (const f of features) {
    if (d < f.d0 || d > f.d3 || Math.abs(x - f.x) > f.half) continue;
    if (f.spine && Math.abs(d - f.lip) < 0.7) return true;
    if (f.rollers) {
      const u = ((d - f.d0) / f.spacing) % 1;
      if (Math.abs(u - 0.5) < 0.07) return true;
    }
  }
  return false;
}

function bumpY(x, d) {
  return pipeY(x, d) + course.bumps * (Math.sin(x * 0.11 + d * 0.031) * Math.sin(d * 0.07 + 1.7) * 0.9
    + Math.sin(x * 0.37 + 2.1) * Math.sin(d * 0.23) * 0.25) + mogulY(x, d) + featureY(x, d);
}

function groundY(x, d) {
  return baseY(d) + bumpY(x, d);
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

// ---------- Sparning, utrustning, stil & topplista ----------

// 3D-versionen har en egen sparning (ny ekonomi) – v1 behåller sin gamla.
const SAVE_KEY = 'backkungen3d-save-v1';

const UPGRADES = [
  { id: 'skis',    icon: '🎿', max: 5, base: 1500, growth: 2.0 },
  { id: 'wax',     icon: '🧴', max: 8, base: 600,  growth: 1.6 },
  { id: 'boots',   icon: '🥾', max: 8, base: 700,  growth: 1.6 },
  { id: 'binding', icon: '🌀', max: 8, base: 900, growth: 1.65 },
  { id: 'helmet',  icon: '⛑️', max: 3, base: 4000, growth: 2.4 },
];

// Stil: färger på jacka, hjälm och skidor/bräda. Det första i varje kategori är gratis.
const STYLE_CATS = [
  { id: 'jacket' },
  { id: 'helmet' },
  { id: 'gear' },
  { id: 'poles' },
];
const STYLES = [
  { id: 'jacket-orange', cat: 'jacket', name: 'color.orange', color: '#d84315', cost: 0 },
  { id: 'jacket-blue',   cat: 'jacket', name: 'color.iceblue', color: '#0277bd', cost: 2500 },
  { id: 'jacket-green',  cat: 'jacket', name: 'color.forest', color: '#2e7d32', cost: 4000 },
  { id: 'jacket-pink',   cat: 'jacket', name: 'color.neonpink', color: '#e91e63', cost: 6000 },
  { id: 'jacket-black',  cat: 'jacket', name: 'color.black', color: '#212121', cost: 9000 },
  { id: 'jacket-gold',   cat: 'jacket', name: 'color.gold', color: '#c9a227', cost: 25000 },
  { id: 'helmet-blue',   cat: 'helmet', name: 'color.blue', color: '#1565c0', cost: 0 },
  { id: 'helmet-red',    cat: 'helmet', name: 'color.red', color: '#c62828', cost: 1500 },
  { id: 'helmet-white',  cat: 'helmet', name: 'color.white', color: '#f5f5f5', cost: 3000 },
  { id: 'helmet-black',  cat: 'helmet', name: 'color.matteblack', color: '#1b1b1b', cost: 5000 },
  { id: 'helmet-chrome', cat: 'helmet', name: 'color.chrome', color: '#cfd8dc', cost: 15000 },
  { id: 'gear-blue',     cat: 'gear',   name: 'color.blue', color: '#1e88e5', cost: 0 },
  { id: 'gear-yellow',   cat: 'gear',   name: 'color.yellow', color: '#fbc02d', cost: 2000 },
  { id: 'gear-purple',   cat: 'gear',   name: 'color.purple', color: '#7b1fa2', cost: 4000 },
  { id: 'gear-wood',     cat: 'gear',   name: 'color.wood', color: '#a1734a', cost: 7000 },
  { id: 'gear-white',    cat: 'gear',   name: 'color.white', color: '#fafafa', cost: 10000 },
  { id: 'poles-none',    cat: 'poles',  name: 'color.none', color: 'transparent', cost: 0 },
  { id: 'poles-alu',     cat: 'poles',  name: 'color.alu', color: '#b0bec5', cost: 0 },
  { id: 'poles-black',   cat: 'poles',  name: 'color.black', color: '#262626', cost: 1500 },
  { id: 'poles-red',     cat: 'poles',  name: 'color.red', color: '#c62828', cost: 2500 },
  { id: 'poles-gold',    cat: 'poles',  name: 'color.gold', color: '#c9a227', cost: 8000 },
];

// Karaktärer: färger som ersätter standarden och extra delar på huvud/kropp.
// Utan egen jackfärg används jackan från stilbutiken.
const CHARACTERS = [
  { id: 'classic', icon: '⛷️' },
  { id: 'girl',   icon: '👧', jacket: '#ec407a', skin: '#f3c9a5', hair: '#8d5a2b', parts: ['hairLong', 'face'], noHelmet: true, noGoggles: true },
  { id: 'boy',    icon: '👦', jacket: '#1e88e5', skin: '#c98e66', hair: '#2b1d14', parts: ['hairShort', 'face'], noHelmet: true, noGoggles: true },
  { id: 'ninja',  icon: '🥷', jacket: '#1c1c1c', pants: '#161616', accent: '#b71c1c', skin: '#1c1c1c', pack: '#262626', parts: ['ninja'], noHelmet: true, noGoggles: true },
  { id: 'santa',  icon: '🎅', jacket: '#c62828', pants: '#b71c1c', accent: '#ffffff', pack: '#8d6e4f', boot: '#1b1b1b', parts: ['santa', 'face'], noHelmet: true, noGoggles: true },
  { id: 'robot',  icon: '🤖', jacket: '#cfd8dc', pants: '#90a4ae', accent: '#37474f', skin: '#90a4ae', pack: '#546e7a', metal: true, parts: ['robot'], noHelmet: true, noGoggles: true },
  { id: 'alien',  icon: '👽', jacket: '#6a1b9a', pants: '#4a148c', accent: '#76ff03', skin: '#7cb342', parts: ['alien'], noHelmet: true, noGoggles: true },
  { id: 'pirate', icon: '🏴‍☠️', jacket: '#6d1b1b', pants: '#d7ccc8', accent: '#c9a227', skin: '#d9a27a', boot: '#3e2723', pack: '#5d4037', parts: ['pirate', 'face'], noHelmet: true, noGoggles: true },
];
// Grabs: varsin tangent. Poäng per sekund man håller i.
const GRABS = [
  { id: 'indy',    key: 'KeyF', name: 'Indy grab',    pts: 120 },
  { id: 'mute',    key: 'KeyG', name: 'Mute grab',    pts: 130 },
  { id: 'japan',   key: 'KeyR', name: 'Japan grab',   pts: 150 },
  { id: 'chinese', key: 'KeyV', name: 'Chinese grab', pts: 170 },
  { id: 'tail',    key: 'KeyQ', name: 'Tail grab',    pts: 140 },
];

// Badges: tjänas in under åken och hämtas (pengarna) i Badges-menyn
const BADGES = [
  { id: 'backflip',   cat: 'tricks', icon: '🔄', reward: 300 },
  { id: 'frontflip',  cat: 'tricks', icon: '🔃', reward: 300 },
  { id: 'doubleflip', cat: 'tricks', icon: '🌀', reward: 1200 },
  { id: 'spin720',    cat: 'tricks', icon: '🌪️', reward: 800 },
  { id: 'spin1080',   cat: 'tricks', icon: '💫', reward: 2000 },
  { id: 'chinese',    cat: 'tricks', icon: '🥢', reward: 400 },
  { id: 'grabs',      cat: 'tricks', icon: '🤙', reward: 1500, goal: GRABS.length },
  { id: 'perfect',    cat: 'tricks', icon: '✨', reward: 400 },
  { id: 'combo3',     cat: 'tricks', icon: '🎯', reward: 800 },
  { id: 'chain3',     cat: 'tricks', icon: '🔥', reward: 600 },
  { id: 'chain5',     cat: 'tricks', icon: '☄️', reward: 2000 },
  { id: 'grind30',    cat: 'tricks', icon: '🛤️', reward: 700 },
  { id: 'bigair',     cat: 'tricks', icon: '🚀', reward: 1000 },
  { id: 'highfive',   cat: 'tricks', icon: '✋', reward: 300 },
  { id: 'nearmiss',   cat: 'tricks', icon: '😮', reward: 300 },
  ...['classic', 'park', 'moguls', 'pipe', 'slalom'].map((c) => ({ id: `course-${c}`, cat: 'courses', course: c, reward: 1000 })),
  { id: 'slalomclean', cat: 'courses', icon: '🎿', reward: 2000 },
  { id: 'diff-easy',   cat: 'diff', diff: 'easy',   icon: '🟢', reward: 500 },
  { id: 'diff-normal', cat: 'diff', diff: 'normal', icon: '🔵', reward: 1000 },
  { id: 'diff-hard',   cat: 'diff', diff: 'hard',   icon: '⚫', reward: 2500 },
  { id: 'hardall',     cat: 'diff', icon: '👑', reward: 10000, goal: 5 },
  { id: 'score5k',     cat: 'diff', icon: '💰', reward: 1000 },
  { id: 'score10k',    cat: 'diff', icon: '💎', reward: 3000 },
];
const BADGE_CATS = ['tricks', 'courses', 'diff'];

const CHAR_DEFAULT = { pants: '#2b3a4a', accent: '#1a2a3a', skin: '#e8b98f', pack: '#3d4650', boot: '#eceff1' };

function loadSave() {
  const fresh = {
    bank: 0, best: 0, bestDist: 0, upgrades: {},
    owned: STYLES.filter((st) => st.cost === 0).map((st) => st.id),
    style: { jacket: 'jacket-orange', helmet: 'helmet-blue', gear: 'gear-blue', poles: 'poles-none' },
    rider: 'ski', character: 'classic', badges: {}, badgeProg: {}, course: 'classic', difficulty: 'normal', night: false, fpv: false, lift: true, helmetOn: true, turnSens: 1, lang: detectLang(), name: '', leaderboard: [], audio: { music: true, sfx: true, song: 0 },
  };
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    Object.assign(fresh, data, { style: { ...fresh.style, ...(data.style || {}) } });
  } catch { /* ingen sparning än */ }
  for (const u of UPGRADES) fresh.upgrades[u.id] = fresh.upgrades[u.id] || 0;
  // Okända värden (t.ex. från en äldre version) ersätts med standard
  if (!COURSES[fresh.course]) fresh.course = 'classic';
  if (!DIFFICULTIES[fresh.difficulty]) fresh.difficulty = 'normal';
  if (!CHARACTERS.some((c) => c.id === fresh.character)) fresh.character = 'classic';
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
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* privat läge */ }
}

const save = loadSave();
course = COURSES[save.course] || COURSES.classic;
difficulty = DIFFICULTIES[save.difficulty] || DIFFICULTIES.normal;
const upgradeCost = (u, level) => Math.round(u.base * Math.pow(u.growth, level) / 50) * 50;
const styleColor = (cat) => (STYLES.find((st) => st.id === save.style[cat]) || STYLES.find((st) => st.cat === cat)).color;
const isBoard = () => save.rider === 'board';

const KMH = 1 / 3.6;
const MAX_SPEED = 100 * KMH;

function stats() {
  const u = save.upgrades;
  return {
    cruise: Math.min(100, (50 + u.skis * 10) * difficulty.speed) * KMH, // fart rakt ner – också starthastigheten
    pull: 6 + u.wax * 1.5,                          // hur hårt backen drar (acceleration)
    turnRate: (1.7 + u.boots * 0.2) * (isBoard() ? 0.92 : 1) * clamp(save.turnSens || 1, 0.5, 2), // svängkänslighet från inställningarna
    jumpPower: 1 + u.binding * 0.025,
    spinRate: 7.5 + u.binding * 0.7,
    flipTime: 0.8 - u.binding * 0.04,
    lives: save.helmetOn === false ? 0 : u.helmet, // utan hjälm: en krasch och åket är slut
  };
}

// ---------- Input ----------

const keys = new Set();
const pressed = new Set();
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyT', 'KeyC', ...GRABS.map((g) => g.key)];

const ARROW_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

window.addEventListener('keydown', (e) => {
  const overlay = activeOverlay();
  // Namnfältet: skriv fritt, ↑/↓ eller Enter flyttar vidare
  if (e.target instanceof HTMLInputElement) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter') {
      e.preventDefault();
      moveFocus(overlay, e.code === 'ArrowUp' ? 'up' : 'down');
    } else if (e.code === 'Escape') {
      e.target.blur();
    }
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) setAudio('music', !save.audio.music);
  // Menyer: piltangenter flyttar markeringen, Enter/Space trycker på knappen, Esc går tillbaka
  if (overlay) {
    // En tangent som hölls nere under åket (t.ex. vid en krasch) ska inte styra menyn förrän den släppts
    if (keys.has(e.code)) {
      e.preventDefault();
      return;
    }
    const dir = ARROW_DIRS[e.code];
    const el = document.activeElement;
    if (el && el.id === 'course-card' && (dir === 'left' || dir === 'right')) {
      e.preventDefault();
      cycleCourse(dir === 'right' ? 1 : -1);
    } else if (el instanceof HTMLSelectElement && (dir === 'left' || dir === 'right')) {
      e.preventDefault();
      const i = clamp(el.selectedIndex + (dir === 'right' ? 1 : -1), 0, el.options.length - 1);
      if (i !== el.selectedIndex) {
        el.selectedIndex = i;
        el.dispatchEvent(new Event('change'));
        Sound.tick();
      }
    } else if (dir) {
      e.preventDefault();
      moveFocus(overlay, dir);
    } else if (e.code === 'Escape' || (overlay === 'pause' && e.code === 'KeyP')) {
      e.preventDefault();
      goBack(overlay);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && !$(overlay).contains(document.activeElement)) {
      e.preventDefault();
      focusDefault(overlay);
    }
    return;
  }
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.code === 'KeyC' && !e.repeat && (state === 'playing' || state === 'lift')) toggleCamera();
  if (state === 'lift' && !e.repeat && (e.code === 'Enter' || e.code === 'Escape')) return endLift(); // hoppa över liften
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (state === 'playing') togglePause();
});

const isLeft = () => keys.has('ArrowLeft') || keys.has('KeyA');
const isRight = () => keys.has('ArrowRight') || keys.has('KeyD');
const isDown = () => keys.has('ArrowDown') || keys.has('KeyS');
const isTuck = () => keys.has('KeyT'); // ducka för mer fart på marken
const currentGrab = () => GRABS.find((g) => keys.has(g.key)) || null; // grab i luften
const isGrab = () => !!currentGrab();
const wasPressed = (...codes) => codes.some((c) => pressed.has(c));

// Pekskärm (mobil/surfplatta): knappar på skärmen istället för tangentbord. ?touch=1 tvingar fram det.
const TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches || /[?&]touch=1/.test(location.search);
if (TOUCH) {
  document.body.classList.add('touch');
  $('air-hint').dataset.i18n = 'hint.airTouch';
  document.querySelector('.intro-hint').dataset.i18n = 'intro.hintTouch';
}

// ---------- Renderer, scen & ljus ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
// Mobiler orkar mindre: lägre upplösning och enklare skuggor
renderer.setPixelRatio(Math.min(TOUCH ? 1.5 : 2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const FOG_COLOR = '#dfe8f2';
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 70, VIEW_AHEAD);

function makeSky(top = '#5f9bd3', mid = '#a9cbea', bottom = FOG_COLOR) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const daySky = makeSky();
scene.background = daySky;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);

const hemi = new THREE.HemisphereLight('#dbe9ff', '#f2f5fa', 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Geometri-hjälpare ----------

// Slår ihop flera geometrier till en med vertexfärger, så varje modell blir ett enda draw call.
function buildGeometry(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    if (part.matrix) g.applyMatrix4(part.matrix);
    const p = g.attributes.position;
    const nm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      n.fromBufferAttribute(nm, i);
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      const c = typeof part.color === 'function' ? part.color(v, n) : part.color;
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Rubbar hörnen slumpmässigt (samma förskjutning för delade hörn så att inga hål uppstår).
function jitter(geo, amount, rand, keep = () => false) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const offsets = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let off = offsets.get(key);
    if (!off) {
      off = keep(v) ? [0, 0, 0] : [(rand() - 0.5) * amount, (rand() - 0.5) * amount * 0.7, (rand() - 0.5) * amount];
      offsets.set(key, off);
    }
    p.setXYZ(i, v.x + off[0], v.y + off[1], v.z + off[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

const m4 = () => new THREE.Matrix4();
const C = (hex) => new THREE.Color(hex);
const SNOW = C('#f3f7fc');
const SNOW_SHADE = C('#d3deea');

// Gran: stam + tät mörk kärna + grenvarv med nedhängande grenar. Snö på grenarnas ovansidor.
function makeSpruce(seed) {
  const rand = mulberry32(seed);
  const height = 6.2;
  const greens = ['#1b3626', '#21402c', '#284a33', '#1d3a2b'].map(C);
  const core = C('#14281c');
  const parts = [
    { geo: new THREE.CylinderGeometry(0.07, 0.2, height * 0.95, 7), matrix: m4().makeTranslation(0, height * 0.475, 0), color: C('#3e2c20') },
    // Kärnan fyller hålen mellan grenarna så att granen inte ser genomskinlig ut
    { geo: new THREE.ConeGeometry(0.95, height - 1.0, 9, 1), matrix: m4().makeTranslation(0, 1.0 + (height - 1.0) / 2, 0), color: core },
  ];

  const whorls = 13;
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1); // 0 = nederst, 1 = toppen
    const y = 0.75 + t * (height - 1.4) + (rand() - 0.5) * 0.15;
    const len = (2.1 * Math.pow(1 - t, 0.9) + 0.25) * (0.9 + rand() * 0.2);
    const count = Math.max(4, Math.round(7 - t * 3));
    const droop = 0.2 + (1 - t) * 0.4; // de nedre grenarna hänger mer
    const az0 = rand() * Math.PI * 2;
    for (let b = 0; b < count; b++) {
      const az = az0 + (b / count) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const l = len * (0.85 + rand() * 0.3);
      const geo = jitter(new THREE.ConeGeometry(l * 0.34, l, 6, 2).translate(0, l / 2, 0), l * 0.08, rand, (v) => v.y < 0.01);
      // Platt gren som pekar utåt och lite nedåt: platta till → vrid ut → vrid runt stammen
      const matrix = m4().makeRotationY(az)
        .multiply(m4().makeRotationZ(-Math.PI / 2 - droop))
        .multiply(m4().makeScale(0.32, 1, 1))
        .setPosition(0, y, 0);
      const green = greens[Math.floor(rand() * greens.length)];
      const under = green.clone().multiplyScalar(0.5);
      parts.push({
        geo,
        matrix,
        color: (v, n) => {
          if (n.y < 0.1) return under;
          const h = hash3(v.x * 3, v.y * 3, v.z * 3);
          if (n.y > 0.45 && h < 0.72) return h < 0.4 ? SNOW : SNOW_SHADE;
          return green;
        },
      });
    }
  }
  // Smal topp
  parts.push({ geo: new THREE.ConeGeometry(0.14, 1.0, 6), matrix: m4().makeTranslation(0, height - 0.2, 0), color: greens[1] });
  parts.push({ geo: new THREE.ConeGeometry(0.1, 0.35, 6), matrix: m4().makeTranslation(0, height - 0.05, 0), color: SNOW });
  return buildGeometry(parts);
}

// Tall: hög, bar stam med en snöig krona i toppen
function makePine(seed) {
  const rand = mulberry32(seed);
  const bark = C('#8a5534');
  const barkDark = C('#5a3a26');
  const parts = [{
    geo: new THREE.CylinderGeometry(0.1, 0.22, 9, 7),
    matrix: m4().makeTranslation(0, 4.5, 0),
    color: (v) => (v.y < 1.5 ? barkDark : bark),
  }];
  const greens = ['#22402a', '#2a4b2f', '#1d3825'].map(C);
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const y = 5.2 + t * 4;
    const a = rand() * Math.PI * 2;
    const spread = (1 - t) * (0.6 + rand() * 0.9);
    const r = 0.7 + (1 - t) * 0.6 + rand() * 0.3;
    const pos = [Math.cos(a) * spread, y, Math.sin(a) * spread];
    if (spread > 0.4) {
      parts.push({
        geo: new THREE.CylinderGeometry(0.04, 0.07, spread, 5),
        matrix: m4().makeRotationZ(Math.PI / 2).premultiply(m4().makeRotationY(-a)).setPosition(pos[0] / 2, y - 0.2, pos[2] / 2),
        color: bark,
      });
    }
    const green = greens[i % greens.length];
    const under = green.clone().multiplyScalar(0.6);
    parts.push({
      geo: jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.4, rand),
      matrix: m4().makeScale(1, 0.5, 1).setPosition(...pos),
      color: (v, n) => (n.y < -0.1 ? under : n.y > 0.5 && hash3(v.x, v.y, v.z) < 0.6 ? SNOW : green),
    });
  }
  return buildGeometry(parts);
}

function makeRock(seed) {
  const rand = mulberry32(seed);
  const grey = C('#6c747d');
  const geo = jitter(new THREE.IcosahedronGeometry(1, 1), 0.45, rand);
  return buildGeometry([{
    geo,
    matrix: m4().makeScale(1.2, 0.65, 1).setPosition(0, 0.25, 0),
    color: (v, n) => (n.y > 0.6 ? SNOW : n.y > 0.4 ? SNOW_SHADE : grey),
  }]);
}

function makeStump() {
  return buildGeometry([
    { geo: new THREE.CylinderGeometry(0.33, 0.42, 0.6, 10), matrix: m4().makeTranslation(0, 0.3, 0), color: C('#5b4030') },
    { geo: new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), matrix: m4().makeTranslation(0, 0.63, 0), color: SNOW },
  ]);
}

function makeSnowman() {
  const black = C('#1b1f24');
  const parts = [
    { geo: new THREE.SphereGeometry(0.55, 16, 12), matrix: m4().makeTranslation(0, 0.5, 0), color: SNOW },
    { geo: new THREE.SphereGeometry(0.4, 16, 12), matrix: m4().makeTranslation(0, 1.25, 0), color: SNOW },
    { geo: new THREE.SphereGeometry(0.28, 16, 12), matrix: m4().makeTranslation(0, 1.8, 0), color: SNOW },
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), matrix: m4().makeTranslation(0, 2.03, 0), color: black },
    { geo: new THREE.CylinderGeometry(0.19, 0.2, 0.32, 16), matrix: m4().makeTranslation(0, 2.2, 0), color: black },
    { geo: new THREE.ConeGeometry(0.05, 0.3, 8), matrix: m4().makeRotationX(Math.PI / 2).setPosition(0, 1.8, 0.4), color: C('#ef6c00') },
  ];
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.SphereGeometry(0.035, 6, 6), matrix: m4().makeTranslation(s * 0.1, 1.88, 0.24), color: black });
    parts.push({
      geo: new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5),
      matrix: m4().makeRotationZ(s * 1.0).setPosition(s * 0.65, 1.45, 0),
      color: C('#4e342e'),
    });
  }
  return buildGeometry(parts);
}

// Hoppbacke: en snökil som är högst i nedförsbacke-änden, med orange markeringspinnar
function makeRamp(w, l, h) {
  const a = [-w, 0, l], b = [w, 0, l], c = [w, h, -l], d = [-w, h, -l], e = [-w, 0, -l], f = [w, 0, -l];
  const tris = [a, b, c, a, c, d, d, c, f, d, f, e, a, d, e, b, f, c];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  const parts = [{ geo, color: (v, n) => (n.y > 0.5 ? C('#e4eef8') : C('#bcd0e4')) }];
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), matrix: m4().makeTranslation(s * w, h + 0.6, -l), color: C('#ff6d00') });
  }
  return buildGeometry(parts);
}

// ---------- Hindermodeller (InstancedMesh = ett draw call per typ) ----------

const objMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const starMat = new THREE.MeshStandardMaterial({ color: '#ffc400', emissive: '#ff8f00', emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3 });
const MODELS = {};

function addModel(key, geo, mat = objMat, cap = 800) {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.count = 0;
  scene.add(mesh);
  MODELS[key] = { mesh, cap };
}

[11, 23, 37].forEach((seed, i) => addModel(`tree${i}`, makeSpruce(seed)));
[5, 17].forEach((seed, i) => addModel(`pine${i}`, makePine(seed)));
[3, 8].forEach((seed, i) => addModel(`rock${i}`, makeRock(seed)));
addModel('stump', makeStump());
addModel('snowman', makeSnowman());
// Tre storlekar på hopp: liten kicker, mellan och stor. vz = utgångsfart uppåt (höjd ≈ vz² / 40)
const RAMPS = [
  { name: 'Liten kicker', w: 1.6, l: 1.8, h: 0.6, vz: 6,    weight: 50 },
  { name: 'Hoppbacke',    w: 2.1, l: 2.5, h: 1.1, vz: 7.8,  weight: 35 },
  { name: 'Stor kicker',  w: 2.6, l: 3.4, h: 1.7, vz: 9.6,  weight: 15, landing: 0.5 },
  { name: 'Big Air',      w: 3.6, l: 6.0, h: 3.2, vz: 12.8, weight: 7,  landing: 1, terrain: true },
];
RAMPS.forEach((r, i) => addModel(`ramp${i}`, makeRamp(r.w, r.l, r.h)));
addModel('star', new THREE.OctahedronGeometry(0.4).scale(1, 1.4, 0.5), starMat);

const OBSTACLES = [
  { type: 'tree',    weight: 44, r: 1.0,  h: 3.6, crash: 'crash.tree' },
  { type: 'pine',    weight: 10, r: 0.5,  h: 99,  crash: 'crash.pine' },
  { type: 'rock',    weight: 13, r: 0.9,  h: 0.8, crash: 'crash.rock' },
  { type: 'stump',   weight: 6,  r: 0.45, h: 0.6, crash: 'crash.stump' },
  { type: 'snowman', weight: 4,  r: 0.6,  h: 2.0, crash: 'crash.snowman' },
  { type: 'ramp',    weight: 9,  r: 0,    h: 0 },
  { type: 'star',    weight: 8,  r: 0.7,  h: 0 },
  // Grind-objekt: ligger längs med backen, hoppa upp på dem
  { type: 'rail',    weight: 4,  r: 0.25, h: 0.7,  crash: 'crash.rail', ptsPerM: 18 },
  { type: 'log',     weight: 5,  r: 0.45, h: 0.78, crash: 'crash.log', ptsPerM: 12 },
  { type: 'box',     weight: 0,  r: 0.45, h: 0.6,  crash: 'crash.box', ptsPerM: 14 },
  // Parkhinder i snön (ingen krock – de är en del av backen)
  { type: 'spine',   weight: 0,  r: 0,    h: 0 },
  { type: 'rollers', weight: 0,  r: 0,    h: 0 },
  // Sådant som finns i riktiga backar
  { type: 'cannon',  weight: 0,  r: 0.35, h: 99, crash: 'crash.cannon' },
  { type: 'sign',    weight: 0,  r: 0.2,  h: 99, crash: 'crash.sign' },
  { type: 'deco',    weight: 0,  r: 0,    h: 0 },
];
const isLinear = (o) => o.type === 'rail' || o.type === 'log' || o.type === 'box';

// Väljer ett hinder enligt den valda banans vikter
function pickObstacle() {
  const w = course.weights;
  let r = Math.random() * OBSTACLES.reduce((sum, o) => sum + (w[o.type] || 0), 0);
  for (const o of OBSTACLES) {
    r -= w[o.type] || 0;
    if (r < 0) return o;
  }
  return OBSTACLES[0];
}

// Räknar ut var spelaren landar i normal fart och lägger en landningsslänt där
function makeLanding(o) {
  const r = o.ramp;
  const s = stats();
  const v = s.cruise;
  const vz = (r.vz + v * 0.06) * s.jumpPower;
  const peak = r.h + vz * vz / (2 * GRAVITY);
  const H = r.terrain ? r.h * 0.9 : Math.min(4, peak * 0.45);
  // Tid från kanten (höjd h) tills man är nere på bordets höjd igen
  const tLand = (vz + Math.sqrt(Math.max(0, vz * vz + 2 * GRAVITY * (r.h - H)))) / GRAVITY;
  const dist = v * tLand;
  const lip = o.d + r.l;
  const f = {
    x: o.x, half: r.w + 1.5, H, sideW: 4,
    d0: lip + 1, d1: lip + 7,
    d2: lip + Math.max(9, dist * 0.7), // kanten
    d3: lip + dist * 1.3 + 6,          // slutet av landningen
  };
  if (r.terrain) {
    // Big Air: kickern är en del av samma snöbyggnad, med flacka sidor att åka upp på
    Object.assign(f, { kicker: true, hK: r.h, kHalf: r.w, vz: r.vz, lip, d0: o.d - r.l, d1: lip, half: r.w + 2.5, sideW: 7 });
  }
  features.push(f);
  o.zone.len = Math.max(o.zone.len, f.d3 - o.zone.d + 6);
  return f;
}

const lipMarkerMat = new THREE.MeshLambertMaterial({ color: '#ff6d00' });
const lipMarkerGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).translate(0, 0.8, 0);

// Orange käppar som markerar Big Air-kickerns kant
function buildLipMarkers(o, lip = o.d + o.ramp.l, halfW = o.ramp.w + 0.3) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(lipMarkerGeo, lipMarkerMat);
    const x = o.x + s * halfW;
    m.position.set(x, groundY(x, lip - 0.3), -(lip - 0.3));
    m.castShadow = true;
    g.add(m);
  }
  scene.add(g);
  return g;
}

function makeObject(t, x, d) {
  const o = { ...t, x, d, dEnd: d, s: 1, rot: Math.random() * Math.PI * 2, tint: null, taken: false, model: t.type };
  const k = 0.82 + Math.random() * 0.25;
  switch (t.type) {
    case 'tree':
      o.s = 0.75 + Math.random() * 0.55;
      o.model = `tree${Math.floor(Math.random() * 3)}`;
      o.tint = new THREE.Color(k, k + 0.04, k);
      break;
    case 'pine':
      o.s = 0.85 + Math.random() * 0.35;
      o.model = `pine${Math.floor(Math.random() * 2)}`;
      o.tint = new THREE.Color(k, k, k);
      break;
    case 'rock':
      o.s = 0.6 + Math.random() * 0.8;
      o.model = `rock${Math.floor(Math.random() * 2)}`;
      break;
    case 'stump':
      o.s = 0.9 + Math.random() * 0.3;
      break;
    case 'snowman':
      o.rot = (Math.random() - 0.5) * 0.6;
      break;
    case 'spine': {
      const H = 1.8;
      o.feature = { spine: true, x, H, hK: H, half: 3, kHalf: 3, sideW: 5, d0: d, lip: d + 6, d1: d + 6, d3: d + 13, vz: 7.5 };
      features.push(o.feature);
      o.dEnd = o.feature.d3;
      o.zone = { x, d: d + 6, ux: 0, ud: 1, len: 30, half: 4 };
      o.mesh = buildLipMarkers(o, d + 6, 3.4);
      break;
    }
    case 'rollers': {
      const spacing = 9;
      o.feature = { rollers: true, x, H: 1.1, half: 5, sideW: 4, d0: d, d3: d + 4 * spacing, spacing };
      features.push(o.feature);
      if (course.moguls) calmZones.push({ x, d0: d - 4, d1: o.feature.d3 + 2, half: 8 });
      o.dEnd = o.feature.d3;
      o.zone = { x, d, ux: 0, ud: 1, len: 4 * spacing + 6, half: 6 };
      break;
    }
    case 'ramp': {
      let r = Math.random() * RAMPS.reduce((sum, rp) => sum + rp.weight, 0);
      o.size = RAMPS.findIndex((rp) => (r -= rp.weight) < 0);
      if (course.moguls && o.size === 3) o.size = 2; // ingen Big Air mitt i puckelpisten
      o.ramp = RAMPS[o.size];
      o.model = `ramp${o.size}`;
      o.rot = 0;
      // Fri landningszon: så långt hoppet kan bära i hög fart, plus marginal
      const airtime = 2 * (o.ramp.vz + 28 * 0.06) / GRAVITY;
      o.zone = { x: o.x, d: o.d + o.ramp.l, ux: 0, ud: 1, len: airtime * 26 + 10, half: 3.5 + (o.size === 3 ? 1.5 : 0) };
      if (Math.random() < (o.ramp.landing || 0)) o.feature = makeLanding(o);
      if (o.ramp.terrain) o.mesh = buildLipMarkers(o);
      if (o.ramp.terrain) o.warn = true;
      if (course.moguls) {
        const end = o.feature ? o.feature.d3 : o.d + o.ramp.l + airtime * 14;
        calmZones.push({ x: o.x, d0: o.d - 8, d1: end + 4, half: o.ramp.w + 3 });
      }
      break;
    }
    case 'rail':
    case 'log':
    case 'box': {
      o.len = t.type === 'rail' ? 15 + Math.random() * 8 : t.type === 'box' ? 9 + Math.random() * 5 : 11 + Math.random() * 6;
      const vs = LINEAR_VARIANTS[t.type];
      o.variant = vs[Math.floor(Math.random() * vs.length)];
      if (o.variant === 'up') o.len *= 0.75;
      o.ra = (Math.random() - 0.5) * 0.3;
      o.ux = Math.sin(o.ra);
      o.ud = Math.cos(o.ra);
      buildPath(o);
      o.mesh = t.type === 'rail' ? buildRail(o) : t.type === 'box' ? buildBox(o) : buildLog(o);
      scene.add(o.mesh);
      // Fri zon efter räcket där inga träd får stå (i räckets riktning vid slutet)
      const end = pointAt(o, 1);
      o.zone = { x: o.x1, d: o.d1, ux: Math.sin(end.a), ud: Math.cos(end.a), len: 14, half: 3 };
      break;
    }
  }
  return o;
}

// ---------- Räcken, boxar och stockar längs en bana ----------

// Varianter: rak, slingrig (S-kurva i sidled), uppåt (reser sig mot slutet) och
// "påfart" (boxar som börjar i snöhöjd så att man kan glida upp på dem från marken).
const LINEAR_VARIANTS = {
  rail: ['straight', 'straight', 'curvy', 'curvy', 'up'],
  box: ['flat', 'rideon', 'rideon', 'curvy', 'up'],
  log: ['flat', 'flat', 'up'],
};

// Höjd på ovansidan över marken, f = 0..1 längs banan, along = meter från start
function linearHeight(o, f, along) {
  switch (o.type) {
    case 'rail': return o.variant === 'up' ? 0.45 + f * 1.6 : 0.7;
    case 'box':
      if (o.variant === 'rideon') return Math.min(0.55, 0.02 + (along / 2) * 0.53);
      return o.variant === 'up' ? 0.3 + f * 0.9 : 0.6;
    default: return o.variant === 'up' ? 0.78 + f * 1.2 : 0.78;
  }
}

// Bygger punkterna längs räcket: x, d, ovansidans höjd (y) och sträcka (s)
function buildPath(o) {
  const n = o.variant === 'curvy' ? 24 : 12;
  const amp = o.variant === 'curvy' ? (1.4 + Math.random()) * (Math.random() < 0.5 ? -1 : 1) : 0;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const along = f * o.len;
    const off = amp * Math.sin(f * Math.PI * 2);
    const x = o.x + o.ux * along + o.ud * off;
    const d = o.d + o.ud * along - o.ux * off;
    const prev = pts[i - 1];
    const s = prev ? prev.s + Math.hypot(x - prev.x, d - prev.d) : 0;
    pts.push({ x, d, y: groundY(x, d) + linearHeight(o, f, along), s });
  }
  o.pts = pts;
  o.len = pts[n].s;
  o.x1 = pts[n].x;
  o.d1 = pts[n].d;
  o.dEnd = Math.max(...pts.map((q) => q.d));
}

// Punkt längs banan vid t (0..1): position, höjd, färdriktning och lutning
function pointAt(o, t) {
  const s = clamp(t, 0, 1) * o.len;
  const pts = o.pts;
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].s < s) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const L = b.s - a.s || 1;
  const u = clamp((s - a.s) / L, 0, 1);
  return {
    x: a.x + (b.x - a.x) * u,
    d: a.d + (b.d - a.d) * u,
    y: a.y + (b.y - a.y) * u,
    a: Math.atan2(b.x - a.x, b.d - a.d),
    dyds: (b.y - a.y) / L,
  };
}

// Var befinner sig (x, d) relativt räcket? t = 0..1 längs banan, lat = avstånd i sidled
function linearInfo(o, x, d) {
  const pts = o.pts;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dd = b.d - a.d;
    const L = Math.hypot(dx, dd) || 1;
    let u = ((x - a.x) * dx + (d - a.d) * dd) / (L * L);
    // Före första och efter sista biten räknar vi fortsättningen rakt fram
    if (i > 0) u = Math.max(u, 0);
    if (i < pts.length - 2) u = Math.min(u, 1);
    const px = a.x + dx * u;
    const pd = a.d + dd * u;
    const dist = Math.hypot(x - px, d - pd);
    if (!best || dist < best.dist) {
      best = { dist, t: (a.s + u * L) / o.len, lat: ((x - a.x) * dd - (d - a.d) * dx) / L };
    }
  }
  return { t: best.t, lat: best.lat };
}

// Höjd över marken för räckets ovansida vid position t
function linearTopZ(o, t, x, d) {
  return pointAt(o, t).y - groundY(x, d);
}

const railPostGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8).translate(0, 0.5, 0);
const railFootGeo = new THREE.BoxGeometry(0.5, 0.06, 0.3);
const railMat = new THREE.MeshStandardMaterial({ color: '#e3e8ec', metalness: 0.35, roughness: 0.3 });
const railPostMat = new THREE.MeshStandardMaterial({ color: '#2f3b45', metalness: 0.5, roughness: 0.5 });
const toVec = (q, lift = 0) => new THREE.Vector3(q.x, q.y + lift, -q.d);

function buildRail(o) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(o.pts.map((q) => toVec(q)));
  const bar = new THREE.Mesh(new THREE.TubeGeometry(curve, o.pts.length * 4, 0.045, 8), railMat);
  bar.userData.owned = true;
  bar.castShadow = true;
  g.add(bar);
  const every = Math.max(1, Math.round((o.pts.length - 1) / Math.max(2, Math.round(o.len / 4))));
  const postIdx = [];
  for (let i = 0; i < o.pts.length; i += every) postIdx.push(i);
  if (postIdx[postIdx.length - 1] !== o.pts.length - 1) postIdx.push(o.pts.length - 1);
  for (const i of postIdx) {
    const q = o.pts[i];
    const gy = groundY(q.x, q.d);
    const post = new THREE.Mesh(railPostGeo, railPostMat);
    post.position.set(q.x, gy - 0.3, -q.d);
    post.scale.y = q.y - gy + 0.3;
    post.castShadow = true;
    const foot = new THREE.Mesh(railFootGeo, railPostMat);
    foot.position.set(q.x, gy + 0.02, -q.d);
    foot.rotation.y = -pointAt(o, q.s / o.len).a;
    g.add(post, foot);
  }
  return g;
}

const logGeo = (() => {
  const rand = mulberry32(42);
  const bark = C('#5d4330');
  const barkLight = C('#7a5a40');
  const geo = jitter(new THREE.CylinderGeometry(0.36, 0.42, 1, 12, 8), 0.06, rand)
    .rotateX(Math.PI / 2).translate(0, 0, 0.5);
  return buildGeometry([{
    geo,
    color: (v, n) => (n.y > 0.6 ? SNOW : n.y > 0.35 ? SNOW_SHADE : hash3(v.x, v.y, v.z * 9) < 0.5 ? bark : barkLight),
  }]);
})();
const rootGeo = (() => {
  const rand = mulberry32(7);
  const geo = jitter(new THREE.CylinderGeometry(0.95, 0.8, 0.3, 14, 1), 0.35, rand).rotateX(Math.PI / 2);
  return buildGeometry([{ geo, color: (v, n) => (n.y > 0.6 ? SNOW : C('#4a3a2c')) }]);
})();
const stubGeo = buildGeometry([{ geo: new THREE.CylinderGeometry(0.04, 0.08, 0.9, 6).translate(0, 0.45, 0), color: C('#5d4330') }]);

// Stock: en fallen trädstam. "Uppåt"-stockar vilar med ena änden på en sten.
function buildLog(o) {
  const g = new THREE.Group();
  const first = o.pts[0];
  const last = o.pts[o.pts.length - 1];
  const a = toVec(first, -0.42);
  const b = toVec(last, -0.42);
  const holder = new THREE.Group();
  holder.position.copy(a);
  holder.lookAt(b);
  g.add(holder);
  const trunk = new THREE.Mesh(logGeo, objMat);
  trunk.scale.z = a.distanceTo(b);
  const root = new THREE.Mesh(rootGeo, objMat);
  root.position.z = -0.1;
  holder.add(trunk, root);
  for (let i = 0; i < 4; i++) {
    const stub = new THREE.Mesh(stubGeo, objMat);
    stub.position.set(0, 0, o.len * (0.3 + i * 0.17));
    stub.rotation.set(0, 0, (i % 2 ? 1 : -1) * (0.9 + Math.random() * 0.5));
    stub.scale.y = 0.6 + Math.random() * 0.8;
    holder.add(stub);
  }
  if (o.variant === 'up') {
    const rock = new THREE.Mesh(MODELS.rock0.mesh.geometry, objMat);
    rock.position.set(last.x, groundY(last.x, last.d) - 0.1, -last.d);
    rock.scale.set(1.1, 1.6, 1.1);
    g.add(rock);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const boxMat = new THREE.MeshStandardMaterial({ color: '#29b6f6', roughness: 0.5 });
const boxTopMat = new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.25, metalness: 0.4 });

// Box: bred och lättare att balansera på. Byggs bit för bit så att den kan svänga och luta.
function buildBox(o) {
  const g = new THREE.Group();
  for (let i = 0; i < o.pts.length - 1; i++) {
    const a = o.pts[i];
    const b = o.pts[i + 1];
    // Sidorna går från ovansidan ner under snön och lutar med backen (annars blir det trappsteg)
    const depth = Math.max(a.y - groundY(a.x, a.d), b.y - groundY(b.x, b.d)) + 0.3;
    const len = Math.hypot(b.x - a.x, b.d - a.d) + 0.04;
    const body = new THREE.Mesh(boxGeo, boxMat);
    body.position.copy(toVec(a, -depth / 2));
    body.lookAt(toVec(b, -depth / 2));
    body.scale.set(0.9, depth - 0.02, len);
    const top = new THREE.Mesh(boxGeo, boxTopMat);
    top.position.copy(toVec(a, 0.005));
    top.lookAt(toVec(b, 0.005));
    top.scale.set(0.95, 0.03, len);
    for (const m of [body, top]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}

const dummy = new THREE.Object3D();
const NO_MODEL = new Set(['gate', 'spine', 'rollers', 'cannon', 'sign', 'deco']); // egna meshar eller bara terräng
const WHITE = new THREE.Color(1, 1, 1);

function syncInstances(time) {
  const counts = {};
  for (const o of objects) {
    if (o.taken || isLinear(o) || NO_MODEL.has(o.type)) continue;
    const m = MODELS[o.model];
    const i = counts[o.model] || 0;
    if (i >= m.cap) continue;
    const y = groundY(o.x, o.d);
    if (o.type === 'star') {
      dummy.position.set(o.x, y + 1.3 + Math.sin(time * 3 + o.rot) * 0.15, -o.d);
      dummy.rotation.set(0, time * 2.5 + o.rot, 0);
    } else if (o.type === 'ramp') {
      if (o.ramp.terrain) continue;
      dummy.position.set(o.x, y - 0.05, -o.d);
      dummy.rotation.set(-Math.atan(slopeAt(o.d)), 0, 0);
    } else {
      dummy.position.set(o.x, y - 0.08, -o.d);
      dummy.rotation.set(0, o.rot, 0);
    }
    dummy.scale.setScalar(o.s);
    dummy.updateMatrix();
    m.mesh.setMatrixAt(i, dummy.matrix);
    m.mesh.setColorAt(i, o.tint || WHITE);
    counts[o.model] = i + 1;
  }
  for (const [key, m] of Object.entries(MODELS)) {
    m.mesh.count = counts[key] || 0;
    m.mesh.instanceMatrix.needsUpdate = true;
    m.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- Terräng ----------

// Ett stort rutnät som följer åkaren. Det flyttas i hela rutsteg så att hörnen alltid
// ligger på samma världspunkter – då "simmar" inte backen när den räknas om.
const TERRAIN_W = 150;
const TERRAIN_L = 320;
const STEP = 1.25;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_L, TERRAIN_W / STEP, TERRAIN_L / STEP);
terrainGeo.rotateX(-Math.PI / 2);
const terrainBase = Float32Array.from(terrainGeo.attributes.position.array);
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(terrainBase.length), 3));
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
terrain.receiveShadow = true;
terrain.frustumCulled = false; // ytan flyttas långt ner i backen – låt den alltid ritas
scene.add(terrain);
let terrainKey = '';

function updateTerrain(px, pd) {
  // Flytta i hela 10 m (en jämn multipel av rutstorleken) så att hörnen alltid hamnar på samma världspunkter
  const cx = Math.round(px / 10) * 10;
  const cd = Math.round((pd + TERRAIN_L / 2 - 40) / 10) * 10;
  const key = `${cx},${cd}`;
  if (key === terrainKey) return;
  terrainKey = key;
  terrain.position.set(cx, 0, -cd);
  const pos = terrainGeo.attributes.position;
  const col = terrainGeo.attributes.color;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const wx = cx + terrainBase[i * 3];
    const wd = cd - terrainBase[i * 3 + 2];
    pos.setY(i, groundY(wx, wd));
    const n = hash3(Math.round(wx), Math.round(wd), 1);
    // Svackorna mellan puckarna blir lite mörkare så att puckarna syns
    const amount = mogulAmount(wx, wd);
    const trough = amount ? (0.5 - mogulY(wx, wd) / (course.moguls * amount) * 0.5) * 0.55 * amount : 0;
    tmp.copy(SNOW).lerp(SNOW_SHADE, 0.15 + n * 0.25 + Math.sin(wx * 0.05 + wd * 0.02) * 0.1 + trough);
    if (onFeatureCrest(wx, wd)) tmp.copy(PIPE_LINE); // blå linje på spinens kam och rollernas krön
    if (pipeEnv(wd) > 0.5) {
      // Halfpipe: skuggade väggar och en blå linje längs kanten, som i riktiga pipes
      const a = Math.abs(wx) - PIPE_FLAT;
      if (a > 0 && a < PIPE_R) tmp.lerp(SNOW_SHADE, 0.2 + 0.4 * a / PIPE_R);
      if (Math.abs(Math.abs(wx) - PIPE_COPING) < 0.65) tmp.copy(PIPE_LINE);
    }
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  terrainGeo.computeVertexNormals();
}

// Berg i fjärran: en sammanhängande bergskedja runt hela horisonten, genererad med
// "ridged noise" (skarpa åsar och dalar). Den följer med kameran och ser därför oändligt långt bort ut.
function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y) => {
    const g = h & 7;
    const u = g < 4 ? x : y;
    const v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  };
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    return lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u), lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v) * 0.7;
  };
}

function ridged(noise, x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let weight = 1;
  for (let o = 0; o < 6; o++) {
    let n = 1 - Math.abs(noise(x * freq, y * freq));
    n *= n * weight;
    weight = clamp(n * 1.5, 0, 1);
    sum += n * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

const mountains = new THREE.Group();
(() => {
  const noise = makeNoise2D(1234);
  const R0 = 560;
  const R1 = 1650;
  const segA = 420;
  const segR = 70;
  const pos = [];
  const radii = [];
  for (let j = 0; j <= segR; j++) {
    const r = R0 + (R1 - R0) * Math.pow(j / segR, 1.3);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Lägre förberg närmast, höga toppar längre bort
      const env = smoothstep(R0, R0 + 260, r) * (0.55 + 0.45 * smoothstep(650, 1100, r));
      const big = 0.6 + 0.4 * noise(x / 1400 + 7, z / 1400 - 3); // vissa delar av kedjan är högre
      const h = 300 * ridged(noise, x / 520, z / 520) * env * big - 50;
      pos.push(x, h, z);
      radii.push(r);
    }
  }
  const idx = [];
  const row = segA + 1;
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // Färger: skog på lägre sluttningar, mörka klippor i branter, snö på flackare och högre partier.
  // Längre bort bleknar allt mot himlen (luftperspektiv).
  const haze = C('#c6d6e8');
  const forest = C('#2c3d3a');
  const rock = C('#56606c');
  const rockDark = C('#3e4752');
  const snow = C('#f5f8fc');
  const snowShade = C('#c9d6e6');
  const n = geo.attributes.normal;
  const colors = new Float32Array(pos.length);
  const c = new THREE.Color();
  for (let k = 0; k < pos.length / 3; k++) {
    const h = pos[k * 3 + 1];
    const ny = n.getY(k);
    const jitterH = hash3(pos[k * 3], h, pos[k * 3 + 2]);
    const snowLimit = 0.78 - clamp(h / 350, 0, 1) * 0.42 + jitterH * 0.08;
    if (h > 60 && ny > snowLimit) c.copy(ny > snowLimit + 0.12 ? snow : snowShade);
    else if (h < 45 + jitterH * 30) c.copy(forest);
    else c.copy(jitterH < 0.5 ? rock : rockDark);
    const far = clamp((radii[k] - R0) / (R1 - R0), 0, 1);
    c.lerp(haze, 0.18 + far * 0.6);
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
  mountains.add(mesh);
  scene.add(mountains);
})();

// ---------- Avspärrning: skyddsnät längs kanterna ----------

const NET_SEG = 3;
const NET_POINTS = 110;
const NET_H = 1.5;
const netTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#ff6d00';
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const netGeo = new THREE.BufferGeometry();
const netPos = new Float32Array(2 * NET_POINTS * 2 * 3);
const netUv = new Float32Array(2 * NET_POINTS * 2 * 2);
const netIdx = [];
for (let side = 0; side < 2; side++) {
  for (let i = 0; i < NET_POINTS - 1; i++) {
    const a = (side * NET_POINTS + i) * 2;
    netIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}
netGeo.setIndex(netIdx);
netGeo.setAttribute('position', new THREE.BufferAttribute(netPos, 3));
netGeo.setAttribute('uv', new THREE.BufferAttribute(netUv, 2));
const nets = new THREE.Mesh(netGeo, new THREE.MeshLambertMaterial({
  map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
}));
nets.frustumCulled = false;
scene.add(nets);
const netPosts = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(0.05, 0.06, NET_H + 0.3, 6).translate(0, (NET_H + 0.3) / 2, 0),
  new THREE.MeshLambertMaterial({ color: '#263238' }), NET_POINTS,
);
netPosts.frustumCulled = false;
netPosts.castShadow = true;
scene.add(netPosts);
let netStart = null;

function updateNets(pd) {
  const start = Math.floor((pd - 30) / NET_SEG) * NET_SEG;
  if (start === netStart) return;
  netStart = start;
  let posts = 0;
  for (let side = 0; side < 2; side++) {
    const x = side ? NET_X : -NET_X;
    for (let i = 0; i < NET_POINTS; i++) {
      const d = start + i * NET_SEG;
      const y = groundY(x, d);
      const v = (side * NET_POINTS + i) * 2;
      netPos.set([x, y, -d, x, y + NET_H, -d], v * 3);
      netUv.set([d / 1.5, 0, d / 1.5, NET_H / 1.5 * 2], v * 2);
      if (d % (NET_SEG * 2) === 0) {
        dummy.position.set(x, y - 0.1, -d);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        netPosts.setMatrixAt(posts++, dummy.matrix);
      }
    }
  }
  netPosts.count = posts;
  netPosts.instanceMatrix.needsUpdate = true;
  netGeo.attributes.position.needsUpdate = true;
  netGeo.attributes.uv.needsUpdate = true;
  netGeo.computeVertexNormals();
}

// ---------- Åkaren ----------

// Armar och ben räknas ut med enkel tvåleds-IK: vi bestämmer var höfter, fötter, axlar
// och händer ska vara, och knän/armbågar hamnar där de naturligt böjer sig.
const UP = new THREE.Vector3(0, 1, 0);
const THIGH = 0.44;
const SHIN = 0.44;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;

const ikDir = new THREE.Vector3();
const ikPerp = new THREE.Vector3();
const limbDir = new THREE.Vector3();

function ik2(a, b, l1, l2, hint, out) {
  const dir = ikDir.subVectors(b, a);
  const d = clamp(dir.length(), 0.01, l1 + l2 - 0.001);
  dir.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const perp = ikPerp.copy(hint).addScaledVector(dir, -hint.dot(dir)).normalize();
  return out.copy(a).addScaledVector(dir, along).addScaledVector(perp, h);
}

function placeLimb(mesh, a, b) {
  const dir = limbDir.subVectors(b, a);
  const len = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  mesh.scale.set(1, len / mesh.userData.len, 1);
}

// Bygger en skida/bräda som ringar av tvärsnitt längs längden (rundade kanter istället för en låda).
// halfWidth(u), halfThick(u) och rise(u) anger form, tjocklek och uppböjning, u = 0 bak … 1 spets.
function makeBladeGeometry({ length, tailZ, halfWidth, halfThick, rise, rings = 56, segs = 14 }) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = tailZ - u * length;
    const w = halfWidth(u);
    const ht = halfThick(u);
    const lift = rise(u);
    for (let j = 0; j < segs; j++) {
      // Superellips: platt ovan- och undersida med rundade kanter
      const a = (j / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      pos.push(w * Math.sign(c) * Math.pow(Math.abs(c), 0.3), lift + ht * Math.sign(sn) * Math.pow(Math.abs(sn), 0.3), z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Ändarna stängs med en solfjäder
  const tail = pos.length / 3;
  pos.push(0, rise(0), tailZ);
  const tip = tail + 1;
  pos.push(0, rise(1), tailZ - length);
  for (let j = 0; j < segs; j++) {
    const j2 = (j + 1) % segs;
    idx.push(tail, j, j2);
    idx.push(tip, rings * segs + j2, rings * segs + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Rundar av ändarna: bredden krymper som en halvcirkel de sista bitarna
const roundEnds = (u, w, tailEnd, tipStart) => {
  if (u > tipStart) return w * Math.sqrt(Math.max(0.03, 1 - ((u - tipStart) / (1 - tipStart)) ** 2));
  if (u < tailEnd) return w * Math.sqrt(Math.max(0.12, 1 - ((tailEnd - u) / tailEnd) ** 2));
  return w;
};

function makeSkiGeometry() {
  // Riktig skida: midja (sidecut), bredare spets och bakände, uppböjd spets, lätt twin tip och tunnare ändar
  const geo = makeBladeGeometry({
    length: 1.78,
    tailZ: 0.84,
    halfWidth: (u) => roundEnds(u, 0.04 + 0.013 * ((u - 0.48) / 0.4) ** 2, 0.05, 0.9),
    halfThick: (u) => 0.009 - 0.005 * Math.min(1, Math.abs(u - 0.45) / 0.55),
    rise: (u) => (u > 0.8 ? 0.1 * ((u - 0.8) / 0.2) ** 2 : u < 0.1 ? 0.035 * ((0.1 - u) / 0.1) ** 2 : 0),
  });
  const top = C('#ffffff');
  const stripe = C('#30363b');
  const edge = C('#8e979f');
  const base = C('#1f2428');
  return buildGeometry([{
    geo,
    color: (v, n) => {
      if (n.y < -0.45) return base;            // belag
      if (n.y < 0.45) return edge;             // stålkanter
      // Ovansida: färgen kommer från materialet (stilbutiken), plus en rand och en logga mot spetsen
      return Math.abs(v.x) < 0.007 || (v.z < -0.55 && v.z > -0.68) ? stripe : top;
    },
  }]);
}

function makeBoardGeometry() {
  // Snowboard: bred, lätt midjad, rundade och uppböjda ändar åt båda håll (twin tip)
  const geo = makeBladeGeometry({
    length: 1.5,
    tailZ: 0.75,
    halfWidth: (u) => roundEnds(u, 0.124 + 0.018 * ((u - 0.5) / 0.4) ** 2, 0.09, 0.91),
    halfThick: (u) => 0.01 - 0.004 * Math.min(1, Math.abs(u - 0.5) / 0.5),
    rise: (u) => 0.075 * Math.max(0, Math.abs(u - 0.5) - 0.36) ** 2 / 0.14 ** 2,
    rings: 60,
    segs: 16,
  });
  const base = C('#1f2428');
  const edge = C('#8e979f');
  return buildGeometry([{
    geo,
    color: (v, n) => {
      if (n.y < -0.45) return base;
      if (n.y < 0.45) return edge;
      return Math.abs(v.z + v.x * 1.5) < 0.06 ? C('#30363b') : C('#ffffff');
    },
  }]);
}

// Extra delar för karaktärerna (hår, mössor, masker …). Framåt är -z, huvudets radie ca 0,11.
function makeCostumes(add, mat, head, upper, mats) {
  const parts = {};
  const group = (id, parent) => {
    const g = new THREE.Group();
    g.visible = false;
    parent.add(g);
    (parts[id] = parts[id] || []).push(g);
    return g;
  };
  const hairM = mat('#8d5a2b', { roughness: 0.9 });
  mats.hair = hairM;
  const white = mat('#ffffff', { roughness: 0.95 });
  const black = mat('#141414', { roughness: 0.6 });
  const red = mat('#c62828', { roughness: 0.7 });
  const gold = mat('#d4af37', { roughness: 0.3, metalness: 0.8 });

  // Ansikte: ögon, ögonbryn och leende för karaktärerna som syns utan goggles
  let g = group('face', head);
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.016, 8, 6), black, sx * 0.04, 0.02, -0.108, g);
    add(new THREE.BoxGeometry(0.035, 0.007, 0.01), black, sx * 0.042, 0.05, -0.108, g).rotation.z = sx * -0.15;
  }
  add(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), mat('#8d3b3b'), 0, -0.035, -0.11, g).rotation.z = Math.PI;

  // Tjej: hårkalott, hästsvans och slingor vid kinderna
  g = group('hairLong', head);
  add(new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM, 0, 0.012, 0.01, g).scale.set(1.02, 1.12, 1.07);
  const tail = add(new THREE.CapsuleGeometry(0.042, 0.2, 6, 10), hairM, 0, -0.05, 0.16, g);
  tail.rotation.x = 0.55;
  add(new THREE.SphereGeometry(0.03, 8, 6), red, 0, 0.04, 0.125, g);
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), hairM, sx * 0.1, -0.05, -0.02, g);

  // Kille: kort hår med lugg
  g = group('hairShort', head);
  add(new THREE.SphereGeometry(0.119, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 0.015, 0.012, g).scale.set(1.02, 1.12, 1.07);
  add(new THREE.BoxGeometry(0.15, 0.03, 0.04), hairM, 0, 0.085, -0.095, g).rotation.x = -0.4;

  // Ninja: ögonspringa, pannband med knyte och fladdrande band
  g = group('ninja', head);
  add(new THREE.CylinderGeometry(0.114, 0.114, 0.034, 20, 1, true, Math.PI - 0.9, 1.8), mat('#e8b98f'), 0, 0.012, 0, g);
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.014, 8, 6), black, sx * 0.04, 0.012, -0.112, g);
  add(new THREE.CylinderGeometry(0.121, 0.121, 0.032, 20, 1, true), red, 0, 0.06, 0, g);
  add(new THREE.SphereGeometry(0.026, 8, 6), red, 0, 0.06, 0.125, g);
  for (const sx of [-1, 1]) {
    const band = add(new THREE.BoxGeometry(0.03, 0.006, 0.22), red, sx * 0.025, 0.04, 0.23, g);
    band.rotation.set(-0.45, sx * 0.25, 0);
  }

  // Jultomte: luva med vit kant och tofs, skägg och mustasch, svart bälte
  g = group('santa', head);
  const hat = new THREE.Group();
  hat.position.set(0, 0.08, 0.02);
  hat.rotation.x = 0.55;
  g.add(hat);
  add(new THREE.ConeGeometry(0.125, 0.3, 18), red, 0, 0.15, 0, hat);
  add(new THREE.SphereGeometry(0.04, 10, 8), white, 0, 0.3, 0, hat);
  add(new THREE.TorusGeometry(0.122, 0.032, 8, 24), white, 0, 0.0, 0, hat).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.1, 14, 10), white, 0, -0.085, -0.07, g).scale.set(1.15, 1.35, 0.7);
  add(new THREE.CapsuleGeometry(0.022, 0.1, 4, 8), white, 0, -0.03, -0.112, g).rotation.z = Math.PI / 2;
  add(new THREE.SphereGeometry(0.02, 8, 6), mat('#e57373'), 0, -0.005, -0.12, g);
  g = group('santa', upper);
  add(new THREE.CylinderGeometry(0.158, 0.158, 0.05, 20), black, 0, 0.12, 0, g);
  add(new THREE.BoxGeometry(0.07, 0.06, 0.02), gold, 0, 0.12, -0.16, g);

  // Robot: lådhuvud, lysande visir, antenn och bultar
  g = group('robot', head);
  const metal = mat('#cfd8dc', { roughness: 0.3, metalness: 0.4 });
  add(new THREE.BoxGeometry(0.24, 0.25, 0.24), metal, 0, 0.015, 0, g);
  add(new THREE.BoxGeometry(0.19, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: '#00e5ff', emissive: '#00b8d4', emissiveIntensity: 1.2 }), 0, 0.03, -0.123, g);
  add(new THREE.BoxGeometry(0.1, 0.02, 0.01), black, 0, -0.06, -0.122, g);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), metal, 0, 0.2, 0, g);
  add(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff1744', emissive: '#d50000' }), 0, 0.27, 0, g);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), metal, sx * 0.13, 0.01, 0, g).rotation.z = Math.PI / 2;

  // Utomjording: stora svarta ögon och antenner med kulor
  g = group('alien', head);
  for (const sx of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.042, 12, 10), mat('#0d0d0d', { roughness: 0.1, metalness: 0.3 }), sx * 0.048, 0.015, -0.088, g);
    eye.scale.set(0.8, 1.3, 0.55);
    eye.rotation.z = sx * -0.55;
    const ant = add(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 6), mats.skin, sx * 0.05, 0.16, 0, g);
    ant.rotation.z = sx * -0.35;
    add(new THREE.SphereGeometry(0.025, 10, 8), mat('#76ff03', { emissive: '#33691e' }), sx * 0.075, 0.23, 0, g);
  }

  // Pirat: trekantig hatt med dödskalle, ögonlapp och skägg
  g = group('pirate', head);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 3), black, 0, 0.085, 0.01, g).rotation.y = Math.PI;
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 16), black, 0, 0.13, 0.01, g);
  add(new THREE.SphereGeometry(0.022, 8, 6), white, 0, 0.14, -0.105, g);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), black, 0.042, 0.012, -0.108, g).rotation.x = Math.PI / 2;
  const strap = add(new THREE.CylinderGeometry(0.114, 0.114, 0.01, 20, 1, true), black, 0, 0.03, 0, g);
  strap.rotation.z = 0.35;
  add(new THREE.SphereGeometry(0.09, 12, 10), mat('#3e2723', { roughness: 0.95 }), 0, -0.09, -0.06, g).scale.set(1.1, 0.9, 0.7);
  g = group('pirate', upper);
  add(new THREE.CylinderGeometry(0.157, 0.157, 0.05, 20), mat('#3e2723'), 0, 0.12, 0, g);
  add(new THREE.BoxGeometry(0.06, 0.06, 0.02), gold, 0, 0.12, -0.16, g);

  return parts;
}

// Pjäxans sidoprofil (z framåt negativt, y uppåt) som extruderas på bredden med rundade kanter
function makeBootGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.15, 0.025);                               // häl, nere
  shape.lineTo(-0.15, 0.025);                              // sulan fram till tån
  shape.quadraticCurveTo(-0.172, 0.03, -0.168, 0.065);     // tåns front
  shape.quadraticCurveTo(-0.162, 0.11, -0.115, 0.125);     // tåhättan
  shape.quadraticCurveTo(-0.07, 0.14, -0.05, 0.21);        // vristen
  shape.lineTo(-0.035, 0.37);                              // skaftets framsida (lutar framåt)
  shape.lineTo(0.105, 0.38);                               // skaftets överkant
  shape.quadraticCurveTo(0.12, 0.25, 0.135, 0.17);         // vaden
  shape.quadraticCurveTo(0.16, 0.12, 0.158, 0.05);         // hälen
  shape.quadraticCurveTo(0.157, 0.027, 0.15, 0.025);
  const w = 0.1;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.014, bevelSegments: 3, curveSegments: 8,
  });
  geo.rotateY(-Math.PI / 2); // profilens x blir z, bredden blir x
  geo.translate(w / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function makeSkier() {
  const root = new THREE.Group();
  const heading = new THREE.Group();
  const spinG = new THREE.Group();
  const flipG = new THREE.Group();
  const model = new THREE.Group();
  root.add(heading);
  heading.add(spinG);
  spinG.add(flipG);
  flipG.position.y = 0.9;
  flipG.add(model);
  model.position.y = -0.9;

  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...extra });
  const jacket = mat('#d84315', { roughness: 0.55 });
  const accent = mat('#1a2a3a', { roughness: 0.6 });
  const pants = mat('#2b3a4a', { roughness: 0.85 });
  const bootM = mat('#eceff1', { roughness: 0.35 });
  const buckleM = mat('#ff6f00', { roughness: 0.3, metalness: 0.4 });
  const bindM = mat('#37474f', { roughness: 0.4, metalness: 0.5 });
  const skin = mat('#e8b98f');
  const helmetM = mat('#1565c0', { roughness: 0.2, metalness: 0.25 });
  const stripeM = mat('#ffffff', { roughness: 0.3 });
  const darkM = mat('#15191d', { roughness: 0.5 });
  const lensM = new THREE.MeshStandardMaterial({
    color: '#ff9100', emissive: '#5a2a00', metalness: 0.9, roughness: 0.12, side: THREE.DoubleSide,
  });
  const packM = mat('#3d4650', { roughness: 0.8 });
  const skiM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
  const mats = { jacket, helmet: helmetM, gear: skiM, pants, accent, skin, pack: packM, boot: bootM };

  const add = (geo, m, x, y, z, parent = model) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const limb = (r, len, m) => {
    const o = add(new THREE.CapsuleGeometry(r, len - r, 6, 12), m, 0, 0, 0);
    o.userData.len = len;
    return o;
  };

  // Fötter: skida (kan lossna vid krasch) + pjäxa (sitter kvar på foten)
  const skiGeo = makeSkiGeometry();
  const bootGeo = makeBootGeometry();
  const feet = [-1, 1].map((s) => {
    const foot = new THREE.Group();
    foot.position.set(s * 0.13, 0, 0);
    model.add(foot);
    const board = new THREE.Group();
    foot.add(board);
    add(skiGeo, skiM, 0, 0.012, -0.05, board);
    add(new THREE.BoxGeometry(0.075, 0.035, 0.11), bindM, 0, 0.04, -0.2, board);
    add(new THREE.BoxGeometry(0.075, 0.045, 0.13), bindM, 0, 0.045, 0.19, board);
    add(new THREE.BoxGeometry(0.06, 0.02, 0.3), bindM, 0, 0.03, 0, board);
    // Pjäxa: skal med tåhätta, vrist och framåtlutat skaft, sula med klackar, spännen och powerstrap
    add(bootGeo, bootM, 0, 0, 0, foot);
    add(new THREE.BoxGeometry(0.13, 0.024, 0.335), darkM, 0, 0.013, -0.005, foot);           // sula
    add(new THREE.BoxGeometry(0.1, 0.03, 0.03), darkM, 0, 0.035, -0.172, foot);              // tåklack
    add(new THREE.BoxGeometry(0.1, 0.035, 0.035), darkM, 0, 0.04, 0.165, foot);              // hälklack
    for (const [y, z, rx] of [[0.13, -0.11, -0.75], [0.19, -0.065, -0.45], [0.27, -0.045, -0.1], [0.33, -0.045, -0.05]]) {
      const band = add(new THREE.BoxGeometry(0.145, 0.014, 0.034), buckleM, 0, y, z, foot);
      band.rotation.x = rx;
      add(new THREE.BoxGeometry(0.018, 0.03, 0.05), buckleM, s * 0.078, y, z + 0.035, foot).rotation.x = rx; // spak på utsidan
    }
    add(new THREE.CylinderGeometry(0.083, 0.083, 0.035, 16, 1, true), darkM, 0, 0.36, 0.035, foot).scale.set(0.95, 1, 1.05); // powerstrap
    add(new THREE.CylinderGeometry(0.06, 0.062, 0.04, 14), darkM, 0, 0.385, 0.035, foot);    // innersko
    return { foot, board };
  });

  // Snowboard med bindningar (visas i snowboard-läge)
  const snowboard = new THREE.Group();
  model.add(snowboard);
  add(makeBoardGeometry(), skiM, 0, 0.012, 0, snowboard);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.25, 0.03, 0.2), bindM, 0, 0.035, s * 0.24, snowboard).rotation.y = s * 0.25;
    add(new THREE.BoxGeometry(0.03, 0.2, 0.18), bindM, -0.12, 0.13, s * 0.24, snowboard).rotation.set(0, s * 0.25, 0.25);
  }

  // Bäcken
  const pelvis = add(new THREE.CapsuleGeometry(0.115, 0.14, 6, 12), pants, 0, 0.9, 0);
  pelvis.rotation.z = Math.PI / 2;

  // Överkropp (vrids/lutar runt höften)
  const upper = new THREE.Group();
  model.add(upper);
  add(new THREE.CapsuleGeometry(0.15, 0.12, 6, 14), jacket, 0, 0.13, 0, upper);
  add(new THREE.CapsuleGeometry(0.18, 0.18, 6, 14), jacket, 0, 0.36, 0, upper).scale.set(1.05, 1, 0.82);
  add(new THREE.CapsuleGeometry(0.1, 0.3, 6, 12), accent, 0, 0.5, 0, upper).rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.075, 0.1, 0.1, 14), accent, 0, 0.6, 0, upper);
  add(new THREE.BoxGeometry(0.26, 0.32, 0.12), packM, 0, 0.33, 0.19, upper);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.08, 12, 10), jacket, s * 0.22, 0.49, 0, upper);

  // Huvud med hjälm, goggles och band
  const head = new THREE.Group();
  head.position.set(0, 0.75, -0.01);
  upper.add(head);
  add(new THREE.SphereGeometry(0.11, 18, 14), skin, 0, 0, 0, head).scale.set(1, 1.12, 1.05);
  const helmetStart = head.children.length;
  add(new THREE.SphereGeometry(0.14, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), helmetM, 0, 0.02, 0.008, head);
  for (const phi of [Math.PI / 2, Math.PI * 1.5]) {
    add(new THREE.SphereGeometry(0.142, 4, 12, phi - 0.1, 0.2, 0, Math.PI * 0.5), stripeM, 0, 0.02, 0.008, head);
  }
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.045, 10, 8), helmetM, s * 0.125, -0.03, 0.01, head).scale.set(0.5, 1, 1);
  add(new THREE.BoxGeometry(0.2, 0.012, 0.05), helmetM, 0, 0.075, -0.13, head).rotation.x = 0.35; // skärm
  const helmetParts = head.children.slice(helmetStart);
  const goggleParts = [
    add(new THREE.CylinderGeometry(0.143, 0.143, 0.032, 24, 1, true), darkM, 0, 0.0, 0.008, head),
    add(new THREE.CylinderGeometry(0.138, 0.138, 0.08, 20, 1, true, Math.PI - 1.1, 2.2), lensM, 0, 0.0, 0.004, head),
  ];
  add(new THREE.BoxGeometry(0.03, 0.06, 0.04), darkM, 0, -0.08, -0.09, head); // halskrage/buff

  const legs = [-1, 1].map(() => ({ thigh: limb(0.1, THIGH, pants), shin: limb(0.085, SHIN, pants) }));
  const arms = [-1, 1].map(() => ({
    upper: limb(0.068, UPPER_ARM, jacket),
    fore: limb(0.06, FOREARM, jacket),
    hand: add(new THREE.SphereGeometry(0.058, 10, 8), darkM, 0, 0, 0),
  }));
  arms.forEach((a) => a.hand.scale.set(0.9, 1.25, 1));

  // Stavar (väljs i butiken): pekar nedåt från handen, längd 1,2 m
  const poleMat = mat('#b0bec5', { roughness: 0.3, metalness: 0.7 });
  mats.poles = poleMat;
  const poles = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 1.2, 6).translate(0, -0.6, 0), poleMat));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.14, 8).translate(0, -0.04, 0), darkM));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10).translate(0, -1.08, 0), darkM));
    g.traverse((o) => { o.castShadow = true; });
    g.visible = false;
    model.add(g);
    return g;
  });

  const costumes = makeCostumes(add, mat, head, upper, mats);

  scene.add(root);
  return {
    root, heading, spinG, flipG, model, feet, snowboard, pelvis, upper, head, legs, arms, mats, poles, helmetParts, goggleParts, costumes,
    pose: {
      hipY: 0.9, lift: 0, pitch: -0.25, tweak: 0,
      hands: [new THREE.Vector3(-0.4, 1.0, -0.3), new THREE.Vector3(0.4, 1.0, -0.3)],
    },
  };
}

const skier = makeSkier();

// Färger från stilbutiken + skidor eller snowboard
const currentCharacter = () => CHARACTERS.find((c) => c.id === save.character) || CHARACTERS[0];

function applyLook(ch = currentCharacter()) {
  const m = skier.mats;
  m.jacket.color.set(ch.jacket || styleColor('jacket'));
  m.jacket.metalness = ch.metal ? 0.35 : 0;
  m.jacket.roughness = ch.metal ? 0.35 : 0.55;
  for (const k of ['pants', 'accent', 'skin', 'pack', 'boot']) m[k].color.set(ch[k] || CHAR_DEFAULT[k]);
  m.pants.metalness = ch.metal ? 0.3 : 0;
  m.skin.metalness = ch.metal ? 0.4 : 0;
  if (ch.hair) m.hair.color.set(ch.hair);
  for (const [id, groups] of Object.entries(skier.costumes)) {
    for (const g of groups) g.visible = !!ch.parts && ch.parts.includes(id);
  }
  for (const part of skier.goggleParts) part.visible = !ch.noGoggles;
  skier.mats.helmet.color.set(styleColor('helmet'));
  const chrome = save.style.helmet === 'helmet-chrome';
  skier.mats.helmet.metalness = chrome ? 0.95 : 0.25;
  skier.mats.helmet.roughness = chrome ? 0.08 : 0.2;
  skier.mats.gear.color.set(styleColor('gear'));
  skier.snowboard.visible = isBoard();
  for (const part of skier.helmetParts) part.visible = save.helmetOn !== false && !ch.noHelmet;
  const poleStyle = save.style.poles || 'poles-none';
  for (const pole of skier.poles) pole.visible = !isBoard() && poleStyle !== 'poles-none';
  if (poleStyle !== 'poles-none') skier.mats.poles.color.set(styleColor('poles'));
  skier.mats.poles.metalness = poleStyle === 'poles-alu' || poleStyle === 'poles-gold' ? 0.75 : 0.2;
  for (const f of skier.feet) f.board.visible = !isBoard();
}
applyLook();

// ---------- Ljud ----------

Sound.setMusic(save.audio.music);
Sound.setSong(save.audio.song || 0);
Sound.setSfx(save.audio.sfx);
// Webbläsaren tillåter ljud först efter att användaren tryckt på något
window.addEventListener('keydown', Sound.init);
window.addEventListener('pointerdown', Sound.init);

function setAudio(kind, on) {
  save.audio[kind] = on;
  persist();
  if (kind === 'music') Sound.setMusic(on);
  else Sound.setSfx(on);
  updateAudioButtons();
}

function updateAudioButtons() {
  const onOff = (on) => t(on ? 'audio.on' : 'audio.off');
  $('btn-music').textContent = `🎵 ${t('audio.music')}: ${onOff(save.audio.music)}`;
  $('btn-sfx').textContent = `🔊 ${t('audio.sfx')}: ${onOff(save.audio.sfx)}`;
}

// ---------- Partiklar: snösprut ----------

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const dotTex = makeDotTexture();

const SPRAY_MAX = 3000;
const spray = {
  pos: new Float32Array(SPRAY_MAX * 3),
  vel: new Float32Array(SPRAY_MAX * 3),
  life: new Float32Array(SPRAY_MAX),
  maxLife: new Float32Array(SPRAY_MAX).fill(1),
  baseSize: new Float32Array(SPRAY_MAX),
  size: new Float32Array(SPRAY_MAX),
  alpha: new Float32Array(SPRAY_MAX),
  next: 0,
};
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray.pos, 3).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(spray.size, 1).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aAlpha', new THREE.BufferAttribute(spray.alpha, 1).setUsage(THREE.DynamicDrawUsage));
const sprayMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: dotTex }, scale: { value: 500 }, tint: { value: 1 } },
  vertexShader: `
    attribute float aSize;
    attribute float aAlpha;
    uniform float scale;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float dist = -mv.z;
      vAlpha = aAlpha * clamp((dist - 1.5) / 3.0, 0.0, 1.0);
      gl_PointSize = min(aSize * scale / dist, scale * 0.06);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D map;
    uniform float tint;
    varying float vAlpha;
    void main() {
      float a = texture2D(map, gl_PointCoord).a * vAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * tint, a);
    }`,
  transparent: true,
  depthWrite: false,
});
const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
sprayPoints.frustumCulled = false;
scene.add(sprayPoints);

function emit(x, y, z, vx, vy, vz, size, life) {
  const i = spray.next;
  spray.next = (i + 1) % SPRAY_MAX;
  const j = i * 3;
  spray.pos[j] = x;
  spray.pos[j + 1] = y;
  spray.pos[j + 2] = z;
  spray.vel[j] = vx;
  spray.vel[j + 1] = vy;
  spray.vel[j + 2] = vz;
  spray.life[i] = life;
  spray.maxLife[i] = life;
  spray.baseSize[i] = size;
}

function burst(x, y, z, count, power, size = 0.5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.3 + Math.random() * 0.7);
    emit(x, y, z, Math.cos(a) * sp, 1 + Math.random() * power * 0.6, Math.sin(a) * sp,
      size * (0.6 + Math.random() * 0.8), 0.6 + Math.random() * 0.8);
  }
}

function updateSpray(dt) {
  const drag = Math.max(0, 1 - 2.2 * dt);
  for (let i = 0; i < SPRAY_MAX; i++) {
    if (spray.life[i] <= 0) {
      spray.alpha[i] = 0;
      spray.size[i] = 0;
      continue;
    }
    spray.life[i] -= dt;
    const j = i * 3;
    spray.vel[j] *= drag;
    spray.vel[j + 1] = spray.vel[j + 1] * drag - 9.8 * dt;
    spray.vel[j + 2] *= drag;
    spray.pos[j] += spray.vel[j] * dt;
    spray.pos[j + 1] += spray.vel[j + 1] * dt;
    spray.pos[j + 2] += spray.vel[j + 2] * dt;
    const k = Math.max(0, spray.life[i] / spray.maxLife[i]);
    spray.alpha[i] = Math.min(1, k * 1.6) * 0.75;
    spray.size[i] = spray.baseSize[i] * (1 + (1 - k) * 1.4);
  }
  sprayGeo.attributes.position.needsUpdate = true;
  sprayGeo.attributes.aSize.needsUpdate = true;
  sprayGeo.attributes.aAlpha.needsUpdate = true;
  sprayMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

// ---------- Fallande snö ----------

const FLAKES = 1500;
const FLAKE_BOX = 70;
const flakeGeo = new THREE.BufferGeometry();
const flakePos = new Float32Array(FLAKES * 3);
for (let i = 0; i < flakePos.length; i++) flakePos[i] = (Math.random() - 0.5) * FLAKE_BOX;
flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3).setUsage(THREE.DynamicDrawUsage));
const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({
  size: 0.12, map: dotTex, transparent: true, depthWrite: false, opacity: 0.9,
}));
flakes.frustumCulled = false;
scene.add(flakes);

function wrap(v, center) {
  // Modulo så att flingorna hamnar rätt direkt, även när kameran hoppat långt (t.ex. vid nytt åk)
  const half = FLAKE_BOX / 2;
  return center + ((((v - center + half) % FLAKE_BOX) + FLAKE_BOX) % FLAKE_BOX) - half;
}

function updateFlakes(dt, time) {
  const c = camera.position;
  for (let i = 0; i < FLAKES; i++) {
    const j = i * 3;
    flakePos[j] = wrap(flakePos[j] + Math.sin(time * 0.7 + i) * 0.4 * dt, c.x);
    flakePos[j + 1] = wrap(flakePos[j + 1] - 1.4 * dt, c.y);
    flakePos[j + 2] = wrap(flakePos[j + 2], c.z);
  }
  flakeGeo.attributes.position.needsUpdate = true;
}

// ---------- Skidspår ----------

const TRACK_MAX = 90;
const trackPos = new Float32Array(TRACK_MAX * 2 * 6 * 3);
const trackGeo = new THREE.BufferGeometry();
trackGeo.setAttribute('position', new THREE.BufferAttribute(trackPos, 3).setUsage(THREE.DynamicDrawUsage));
const trackMesh = new THREE.Mesh(trackGeo, new THREE.MeshBasicMaterial({
  color: '#aebfd2', transparent: true, opacity: 0.5, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
}));
trackMesh.frustumCulled = false;
scene.add(trackMesh);

function rebuildTracks() {
  let n = 0;
  const put = (x, y, z) => { trackPos[n++] = x; trackPos[n++] = y; trackPos[n++] = z; };
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a.gap || b.gap) continue;
    for (const s of [-1, 1]) {
      const corners = [a, b].map((q) => {
        const rx = Math.cos(q.a);
        const rz = Math.sin(q.a);
        const cx = q.x + s * 0.14 * rx;
        const cz = -q.d + s * 0.14 * rz;
        return [cx - rx * 0.05, cz - rz * 0.05, cx + rx * 0.05, cz + rz * 0.05, q.y + 0.03];
      });
      const [p, q] = corners;
      put(p[0], p[4], p[1]); put(p[2], p[4], p[3]); put(q[2], q[4], q[3]);
      put(p[0], p[4], p[1]); put(q[2], q[4], q[3]); put(q[0], q[4], q[1]);
    }
  }
  trackGeo.setDrawRange(0, n / 3);
  trackGeo.attributes.position.needsUpdate = true;
}

// ---------- Spelvärld ----------

let state = 'menu'; // menu | playing | paused | crashing | gameover | shop
let player;
let objects = [];
let trail = [];
let run;
let nextSpawnD = 0;
let sprayAcc = 0;

function newPlayer() {
  return {
    x: 0, d: 0, angle: 0, speed: 0, turnVel: 0,
    z: 0, vz: 0, air: false,
    spin: 0, spinArmed: false, flipping: false, flipProg: 0, flips: 0, grabTime: 0,
    facing: 0, facingVis: 0,        // 0 = framlänges, π = baklänges (switch)
    grind: null, onRock: null, balance: 0, balanceVel: 0, twist: 0,
    combo: { parts: [], pts: 0 },
    chain: { n: 0, timer: 0 },     // flera trick i rad: nästa trick inom CHAIN_TIME ger högre multiplikator
    lean: 0, squash: 0, braking: 0,
    invuln: 0, lives: stats().lives, stumble: 0, crashReason: '',
  };
}

const isSwitch = () => Math.abs(Math.round(player.facing / Math.PI)) % 2 === 1;

function blockedByLinear(x, d, margin) {
  for (const o of objects) {
    if (!isLinear(o)) continue;
    const { t, lat } = linearInfo(o, x, d);
    if (t > -0.15 && t < 1.1 && Math.abs(lat) < margin) return true;
  }
  return false;
}

// Hur mycket plats varje objekt tar på marken (radie i meter)
function footprint(o) {
  switch (o.type) {
    case 'tree': return 1.7 * o.s;
    case 'pine': return 1.3 * o.s;
    case 'rock': return 1.3 * o.s;
    case 'stump': return 0.5 * o.s;
    case 'snowman': return 0.8;
    case 'ramp': return o.ramp.l + 0.5;
    case 'star': return 0.7;
    case 'spine': return 7;
    case 'rollers': return 8;
    case 'cannon': return 1.5;
    case 'sign': return 1;
    case 'gate': return 4;
    default: return 1;
  }
}

// Krockar ett nytt objekt (eller ett räckes startände) med något som redan finns i närheten?
function overlaps(x, d, radius) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const e = objects[i];
    // Portarna skapas en bit före övriga hinder, så listan är inte helt sorterad – hoppa bara över avlägsna
    if (Math.abs(e.d - d) > 12 || isLinear(e)) continue; // räcken hanteras av blockedByLinear
    const r = radius + footprint(e) + 0.3;
    if ((e.x - x) ** 2 + (e.d - d) ** 2 < r * r) return true;
  }
  return false;
}

// ---------- Sådant som finns i riktiga backar: snökanoner, skyltar, stugor, pistmaskin ----------

const cannonGeo = buildGeometry([
  { geo: new THREE.CylinderGeometry(0.1, 0.16, 6, 8).translate(0, 3, 0), color: C('#9aa4ad') },
  { geo: new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5).translate(0, 1.1, 0), matrix: m4().makeRotationZ(0.5).setPosition(0.4, 0, 0), color: C('#78909c') },
  { geo: new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5).translate(0, 1.1, 0), matrix: m4().makeRotationZ(-0.5).setPosition(-0.4, 0, 0), color: C('#78909c') },
  // Själva kanonen: ett gult rör som pekar ut över backen (+x)
  { geo: new THREE.CylinderGeometry(0.42, 0.3, 1.5, 14).rotateZ(-Math.PI / 2 + 0.35), matrix: m4().makeTranslation(0.45, 6.2, 0), color: C('#fbc02d') },
  { geo: new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14).rotateZ(-Math.PI / 2 + 0.35), matrix: m4().makeTranslation(1.15, 6.45, 0), color: C('#37474f') },
]);

// Snökanon vid kanten, riktad in mot backen
function makeCannon(d, side) {
  const o = makeObject(OBSTACLES.find((t) => t.type === 'cannon'), side * (NET_X - 2.5), d);
  o.s = 1;
  o.side = side;
  const mesh = new THREE.Mesh(cannonGeo, objMat);
  mesh.position.set(o.x, groundY(o.x, d) - 0.1, -d);
  mesh.rotation.y = side > 0 ? Math.PI : 0;
  mesh.castShadow = true;
  scene.add(mesh);
  o.mesh = mesh;
  return o;
}

// Skylt på en stolpe med text (t.ex. startskylt eller hoppvarning)
function makeSign(x, d, text, bg = '#1565c0', w = 3.2) {
  const o = makeObject(OBSTACLES.find((t) => t.type === 'sign'), x, d);
  o.s = 1;
  const g = new THREE.Group();
  const tex = canvasTexture(512, 160, (c, cw, ch) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, cw, ch);
    c.strokeStyle = '#fff';
    c.lineWidth = 10;
    c.strokeRect(8, 8, cw - 16, ch - 16);
    c.fillStyle = '#fff';
    c.font = 'bold 58px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cw / 2, ch / 2 + 3);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.31), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 2.4;
  board.userData.owned = true;
  board.userData.tex = tex;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), railPostMat);
  post.castShadow = true;
  g.add(post, board);
  g.position.set(x, groundY(x, d) - 0.15, -d);
  g.rotation.y = 0.25 * Math.sign(-x || 1); // vänd lite in mot backen
  scene.add(g);
  o.mesh = g;
  return o;
}

const hutGeo = (() => {
  const wood = C('#8d6e63');
  const dark = C('#5d4037');
  const roof = C('#b71c1c');
  const parts = [
    { geo: new THREE.BoxGeometry(7, 3.4, 5.5).translate(0, 1.7, 0), color: (v) => (Math.round(v.y * 3) % 2 ? wood : dark) },
    { geo: new THREE.BoxGeometry(1.2, 1.4, 0.1), matrix: m4().makeTranslation(-1.6, 1.8, 2.78), color: C('#ffe082') }, // upplyst fönster
    { geo: new THREE.BoxGeometry(1.2, 1.4, 0.1), matrix: m4().makeTranslation(1.6, 1.8, 2.78), color: C('#ffe082') },
    { geo: new THREE.BoxGeometry(1.1, 2.2, 0.1), matrix: m4().makeTranslation(0, 1.1, 2.78), color: dark },
    { geo: new THREE.BoxGeometry(0.7, 1.8, 0.7), matrix: m4().makeTranslation(2, 5, -1), color: C('#616161') },
  ];
  // Sadeltak med snö på
  for (const sgn of [-1, 1]) {
    parts.push({ geo: new THREE.BoxGeometry(8, 0.25, 3.6), matrix: m4().makeRotationX(sgn * 0.62).setPosition(0, 4.25, sgn * 1.45), color: (v, n) => (n.y > 0.5 ? SNOW : roof) });
  }
  return buildGeometry(parts);
})();

const snowcatGeo = buildGeometry([
  { geo: new THREE.BoxGeometry(2.6, 1.2, 4).translate(0, 1.3, 0), color: C('#d32f2f') },
  { geo: new THREE.BoxGeometry(2.2, 1.2, 1.8).translate(0, 2.5, -0.5), color: C('#c62828') },
  { geo: new THREE.BoxGeometry(2.25, 0.7, 1.85).translate(0, 2.6, -0.5), color: C('#263238') }, // fönster
  { geo: new THREE.BoxGeometry(0.7, 1, 4.6).translate(-1.45, 0.5, 0), color: C('#212121') },  // band
  { geo: new THREE.BoxGeometry(0.7, 1, 4.6).translate(1.45, 0.5, 0), color: C('#212121') },
  { geo: new THREE.BoxGeometry(4.2, 1, 0.3).translate(0, 0.6, -2.7), color: C('#cfd8dc') },  // blad
  { geo: new THREE.BoxGeometry(2.6, 0.1, 4).translate(0, 1.95, 0), color: SNOW },              // snö på taket
]);

function makeDeco(geo, x, d, rotY) {
  const o = makeObject(OBSTACLES.find((t) => t.type === 'deco'), x, d);
  const mesh = new THREE.Mesh(geo, objMat);
  mesh.position.set(x, groundY(x, d) - 0.2, -d);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  o.mesh = mesh;
  return o;
}

// Placerar dekor när raderna skapas (snökanoner var 130:e meter, stugor och pistmaskin utanför näten)
function spawnDecor(d0, d1) {
  if (course.pipe) return;
  const crossed = (every, offset = 0) => Math.floor((d1 - offset) / every) > Math.floor((d0 - offset) / every) && d1 > 60;
  if (crossed(130)) {
    const k = Math.floor(d1 / 130);
    const o = makeCannon(d1, k % 2 ? 1 : -1);
    if (!overlaps(o.x, o.d, 1.5)) objects.push(o);
    else removeObject(o);
  }
  if (crossed(420, 200)) objects.push(makeDeco(hutGeo, NET_X + 13, d1, -Math.PI / 2 + 0.3));
  if (crossed(600, 380)) objects.push(makeDeco(snowcatGeo, NET_X + 8, d1, 0.4));
}

// Snö från kanonerna och rök från stugornas skorstenar (bara nära åkaren)
function updateDecorParticles(dt) {
  const p = player;
  for (const o of objects) {
    if (Math.abs(o.d - p.d) > 120) continue;
    if (o.type === 'cannon' && Math.random() < dt * 40) {
      const gy = groundY(o.x, o.d);
      const dir = -o.side;
      emit(o.x + dir * 1.3, gy + 6.5, -o.d, dir * (6 + Math.random() * 4), 1 + Math.random() * 2, (Math.random() - 0.5) * 2,
        0.25 + Math.random() * 0.25, 1.2 + Math.random() * 0.8);
    } else if (o.type === 'deco' && o.mesh.geometry === hutGeo && Math.random() < dt * 6) {
      const m = o.mesh;
      const off = new THREE.Vector3(2, 6, -1).applyAxisAngle(WORLD_UP, m.rotation.y);
      emit(m.position.x + off.x, m.position.y + off.y, m.position.z + off.z, (Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4, 0.6, 2.5);
    }
  }
}

// Hinder man inte kan hoppa över eller åka på – de får inte stå i en landningszon
const BLOCKS_LANDING = new Set(['tree', 'pine', 'snowman', 'stump', 'rail', 'log', 'box']);

// Ligger punkten i en remsa (t.ex. landningszonen efter ett hopp)?
function inStrip(z, x, d, radius) {
  const dx = x - z.x;
  const dd = d - z.d;
  const t = dx * z.ux + dd * z.ud;
  const lat = dx * z.ud - dd * z.ux;
  return t > -1 - radius && t < z.len + radius && Math.abs(lat) < z.half + radius;
}

// Står (x, d) i landningszonen efter något hopp eller räcke?
function inLandingZone(x, d, radius) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const e = objects[i];
    if (e.d < d - 80) break;
    if (e.zone && inStrip(e.zone, x, d, radius)) return true;
  }
  return false;
}

// Finns redan något som blockerar i den här remsan (t.ex. i ett nytt hopps landningszon)?
function stripBlocked(z) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const e = objects[i];
    if (e.d < z.d - 30) break;
    if (BLOCKS_LANDING.has(e.type) && !isLinear(e) && inStrip(z, e.x, e.d, footprint(e))) return true;
  }
  return false;
}

// ---------- Slalomportar ----------

const GATE_HALF = 2.5; // halva portens bredd
const gateMats = {
  red: new THREE.MeshLambertMaterial({ color: '#e53935', side: THREE.DoubleSide }),
  blue: new THREE.MeshLambertMaterial({ color: '#1e88e5', side: THREE.DoubleSide }),
};
const gatePoleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6).translate(0, 0.95, 0);
const gateFlagGeo = new THREE.PlaneGeometry(GATE_HALF * 2 - 0.1, 0.7);
let nextGateD = 0;
let gateSide = 1;
let lastGate = null;

function buildGate(o) {
  const g = new THREE.Group();
  const mat = gateMats[o.color];
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(gatePoleGeo, mat);
    pole.position.set(s * GATE_HALF, 0, 0);
    pole.castShadow = true;
    g.add(pole);
  }
  const flag = new THREE.Mesh(gateFlagGeo, mat);
  flag.position.y = 1.5;
  flag.castShadow = true;
  g.add(flag);
  g.position.set(o.x, groundY(o.x, o.d), -o.d);
  return g;
}

// Portarna ligger växelvis åt vänster och höger kring en slingrande linje
function spawnGates(limitD) {
  limitD = Math.min(limitD, runLength() - 15);
  while (nextGateD < limitD) {
    const d = nextGateD;
    if (pipeEnv(d) > 0) {
      nextGateD += 25; // ingen slalomport i halfpipe-sektionen
      lastGate = null;
      continue;
    }
    const center = 14 * Math.sin(d * 0.005);
    const x = center + gateSide * (5 + Math.random() * 2);
    const o = { type: 'gate', x, d, dEnd: d, s: 1, color: gateSide > 0 ? 'red' : 'blue', passed: false, missed: false };
    o.mesh = buildGate(o);
    scene.add(o.mesh);
    // Håll fritt från träd mellan föregående port och den här
    if (lastGate) {
      const dx = x - lastGate.x;
      const dd = d - lastGate.d;
      const L = Math.hypot(dx, dd);
      lastGate.zone = { x: lastGate.x, d: lastGate.d, ux: dx / L, ud: dd / L, len: L, half: 3.5 };
    }
    objects.push(o);
    lastGate = o;
    gateSide = -gateSide;
    nextGateD += 22 + Math.random() * 6;
  }
}

function checkGates() {
  const p = player;
  for (const o of objects) {
    if (o.type !== 'gate' || o.passed || o.missed || p.d < o.d) continue;
    if (Math.abs(p.x - o.x) <= GATE_HALF + 0.2) {
      o.passed = true;
      run.gates++;
      run.tricks += 30;
      popup(`🚩 ${t('gate.passed')}`, '+30', o.color === 'red' ? '#e53935' : '#1e88e5');
      Sound.star();
    } else {
      o.missed = true;
      run.missed++;
      popup(t('gate.missed'), `${run.missed}/3`, '#e53935');
      Sound.denied();
      if (run.missed >= 3) {
        p.crashReason = t('crash.dq');
        p.dq = true;
        endRun();
        return;
      }
    }
  }
}

function spawnUntil(limitD) {
  limitD = Math.min(limitD, runLength() - 20); // tomt vid målet så att man kan stanna
  while (nextSpawnD < limitD) {
    if (course.slalom) spawnGates(nextSpawnD + 40); // portarna i takt med raderna så att listan hålls sorterad
    const density = Math.min(0.013, 0.005 + nextSpawnD / 1000 * 0.0035) * course.density * difficulty.density;
    for (let n = BAND * ROW * density; n > 0; n--) {
      if (n < 1 && Math.random() > n) break;
      const d = nextSpawnD + Math.random() * ROW;
      const piped = pipeEnv(d) > 0;
      const x = piped ? (Math.random() - 0.5) * 2 * (PIPE_COPING - 1.5) : (Math.random() - 0.5) * BAND;
      if (d < 45 && Math.abs(x) < 8) continue; // fri start
      const kind = pickObstacle();
      if (piped && kind.type !== 'star') continue; // i pipen ligger bara stjärnor
      if ((kind.type === 'ramp' || isLinear(kind)) && pipeEnv(d + 90) > 0) continue; // landningar/räcken ska inte gå in i pipen
      if (isLinear(kind) && Math.abs(x) > NET_X - 8) continue;
      if ((kind.type === 'ramp' || isLinear(kind)) && d > runLength() - 130) continue; // landningar ska hinnas före målet
      // Håll fritt runt räcken och stockar så att de går att åka på
      if (blockedByLinear(x, d, isLinear(kind) ? 5 : 3)) continue;
      if (BLOCKS_LANDING.has(kind.type) && inLandingZone(x, d, isLinear(kind) ? 1 : 1.5)) continue;
      if (kind.type !== 'star' && featureY(x, d) > 0.02) continue; // inget på landningsvallar
      if (isLinear(kind) && overlaps(x, d, 2)) continue;
      const o = makeObject(kind, x, d);
      // Inget får redan stå i räckets bana eller i hoppets landningszon
      const laneBlocked = isLinear(o) && o.pts.slice(1).some((b, i) => {
        const a = o.pts[i];
        const L = Math.hypot(b.x - a.x, b.d - a.d) || 1;
        return stripBlocked({ x: a.x, d: a.d, ux: (b.x - a.x) / L, ud: (b.d - a.d) / L, len: L, half: 1.5 });
      });
      if ((!isLinear(o) && overlaps(x, d, footprint(o))) || laneBlocked || (o.zone && stripBlocked(o.zone))) {
        removeObject(o);
        if (o.feature) features = features.filter((f) => f !== o.feature);
        continue;
      }
      objects.push(o);
      // Varningsskylt en bit före stora hopp
      if (o.warn || o.type === 'spine') {
        const sx = o.x + (o.x > 0 ? -1 : 1) * ((o.ramp ? o.ramp.w : 3) + 4);
        const sign = makeSign(sx, o.d - 24, `⚠️ ${t('sign.jump')}`, '#e65100', 2.6);
        if (!overlaps(sign.x, sign.d, 1) && !inLandingZone(sign.x, sign.d, 1)) objects.push(sign);
        else removeObject(sign);
      }
    }
    spawnDecor(nextSpawnD, nextSpawnD + ROW);
    // Tät skog utanför näten
    for (const side of [-1, 1]) {
      if (Math.random() < 0.85) {
        const tree = OBSTACLES[Math.random() < 0.8 ? 0 : 1];
        const o = makeObject(tree, side * (NET_X + 2.5 + Math.random() * 30), nextSpawnD + Math.random() * ROW);
        if (Math.abs(o.x - LIFT_X) > 6 && !overlaps(o.x, o.d, footprint(o) * 0.7)) objects.push(o); // fri gata för liften
      }
    }
    nextSpawnD += ROW;
  }
}

function removeObject(o) {
  if (!o.mesh) return;
  scene.remove(o.mesh);
  // Räckenas rör är unika per räcke – frigör dem (övriga geometrier delas och ska ligga kvar)
  o.mesh.traverse((m) => {
    if (m.userData.owned) m.geometry.dispose();
    if (m.userData.tex) m.userData.tex.dispose();
  });
}

function resetWorld() {
  objects.forEach(removeObject);
  clearNpcs();
  resetCrash();
  player = newPlayer();
  objects = [];
  trail = [];
  run = { tricks: 0, stars: 0, gates: 0, missed: 0, maxSpeed: 0, maxAir: 0 };
  nextSpawnD = 20;
  nextGateD = 60;
  features = [];
  calmZones = [];
  gateSide = 1;
  lastGate = null;
  terrainKey = '';
  netStart = null;
  spray.life.fill(0);
  spawnUntil(VIEW_AHEAD);
  objects.unshift(makeSign(-9, 14, `${t(`course.${save.course}`)} · ${fmt(runLength())} m`, '#1565c0', 4.2));
  rebuildTracks();
  buildFinish();
}

const runScore = () => Math.round((Math.floor(player.d) + run.tricks + run.stars) * difficulty.points);

// ---------- Skärmar ----------

const OVERLAYS = ['intro', 'menu', 'shop', 'gameover', 'pause', 'board', 'settings', 'help', 'characters', 'badges'];

function showOverlay(name) {
  for (const id of OVERLAYS) $(id).classList.toggle('hidden', id !== name);
  $('hud').classList.toggle('hidden', ['intro', 'menu', 'shop', 'board', 'settings', 'help', 'characters', 'badges'].includes(name));
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (name) focusDefault(name);
}

// ---------- Tangentbordsnavigering i menyerna ----------

const activeOverlay = () => OVERLAYS.find((id) => !$(id).classList.contains('hidden')) || null;

function focusables(overlay) {
  return [...$(overlay).querySelectorAll('button, input, select, a[href]')].filter((el) => !el.disabled && el.offsetParent !== null);
}

function focusDefault(overlay) {
  const el = $(overlay).querySelector('[data-autofocus]') || focusables(overlay)[0];
  if (el) el.focus();
}

// Flytta markeringen till närmaste knapp i pilens riktning (fungerar både i listor och rutnät)
function moveFocus(overlay, dir) {
  const els = focusables(overlay);
  const cur = document.activeElement;
  if (!els.includes(cur)) return focusDefault(overlay);
  const r0 = cur.getBoundingClientRect();
  const cx = r0.left + r0.width / 2;
  const cy = r0.top + r0.height / 2;
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  let best = null;
  let bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const along = (vertical ? dy : dx) * sign;
    if (along <= 4) continue;
    if (!vertical && Math.abs(dy) > r0.height * 0.6) continue; // vänster/höger stannar på samma rad
    const score = along + Math.abs(vertical ? dx : dy) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) {
    // Inget i den riktningen: gå runt (vänster/höger följer ordningen i listan)
    const i = els.indexOf(cur);
    best = vertical ? els[sign > 0 ? 0 : els.length - 1] : els[(i + sign + els.length) % els.length];
  }
  best.focus();
  Sound.tick();
}

function goBack(overlay) {
  if (overlay === 'pause') togglePause();
  else if (overlay === 'intro') leaveIntro();
  else if (overlay !== 'menu') {
    if (overlay === 'characters') applyLook();
    showMenu();
  }
}

// Behåll markeringen på samma plats när butiken ritas om efter ett köp
function keepFocus(overlay, render) {
  const idx = focusables(overlay).indexOf(document.activeElement);
  render();
  const els = focusables(overlay);
  if (idx >= 0 && els.length) els[Math.min(idx, els.length - 1)].focus();
}

const COURSE_ICONS = { classic: '🌲', park: '🏂', moguls: '⛰️', pipe: '🌀', slalom: '🚩' };

// Bläddra mellan banorna i menyn
function cycleCourse(dir) {
  const ids = Object.keys(COURSES);
  const i = ids.indexOf(save.course);
  const focused = document.activeElement && document.activeElement.id;
  setCourse(ids[(i + dir + ids.length) % ids.length]);
  // Kortet glider in från det håll man bläddrar
  const card = $('course-card');
  card.classList.remove('slide-left', 'slide-right');
  void card.offsetWidth;
  card.classList.add(dir > 0 ? 'slide-left' : 'slide-right');
  if (focused === 'course-prev' || focused === 'course-next') $(focused).focus();
  Sound.tick();
}

function setCourse(id) {
  save.course = id;
  course = COURSES[id];
  persist();
  resetCrash();
  resetWorld();
  showMenu();
  $('course-card').focus();
}

function setDifficulty(id) {
  save.difficulty = id;
  difficulty = DIFFICULTIES[id];
  persist();
  resetWorld();
  refreshSettings();
  $('diff-seg').querySelector(`[data-diff="${id}"]`).focus();
}

function segButton(label, data, onClick) {
  const b = document.createElement('button');
  b.className = 'seg-btn';
  b.textContent = label;
  Object.assign(b.dataset, data);
  b.addEventListener('click', onClick);
  return b;
}

for (const id of Object.keys(COURSES)) {
  const opt = document.createElement('option');
  opt.value = id;
  $('lb-select').append(opt);
  const dot = document.createElement('i');
  dot.dataset.course = id;
  $('course-dots').append(dot);
}
for (const id of Object.keys(DIFFICULTIES)) {
  $('diff-seg').append(segButton('', { diff: id }, () => setDifficulty(id)));
}
for (let i = 0; i < Sound.songCount; i++) {
  $('song-seg').append(segButton('', { song: i }, () => setSong(i)));
}
for (const on of [false, true]) {
  $('helmet-seg').append(segButton('', { helmet: on ? 'on' : 'off' }, () => setHelmetOn(on)));
}
for (const on of [false, true]) {
  $('lift-seg').append(segButton('', { lift: on ? 'on' : 'off' }, () => setLiftOn(on)));
}
for (const on of [false, true]) {
  $('poles-seg').append(segButton('', { poles: on ? 'on' : 'off' }, () => setPoles(on)));
}
for (const id of ['day', 'night']) {
  $('time-seg').append(segButton('', { time: id }, () => setTime(id === 'night')));
}
for (const [id, l] of Object.entries(LANGS)) {
  $('lang-seg').append(segButton(`${l.flag} ${l.label}`, { lang: id }, () => setLang(id)));
}

// Sätter alla texter på valt språk (statisk HTML + knappar som skapas i koden)
function applyLanguage() {
  lang = save.lang;
  applyStaticTexts();
  for (const opt of $('lb-select').options) opt.textContent = t(`course.${opt.value}`);
  for (const b of $('diff-seg').children) b.textContent = t(`diff.${b.dataset.diff}`);
  for (const b of $('time-seg').children) b.textContent = t(`time.${b.dataset.time}`);
  for (const b of $('poles-seg').children) b.textContent = t(b.dataset.poles === 'on' ? 'audio.on' : 'audio.off');
  for (const b of $('lift-seg').children) b.textContent = t(b.dataset.lift === 'on' ? 'audio.on' : 'audio.off');
  for (const b of $('helmet-seg').children) b.textContent = t(b.dataset.helmet === 'on' ? 'audio.on' : 'audio.off');
  for (const b of $('song-seg').children) b.textContent = t(`song.${b.dataset.song}`);
  updateAudioButtons();
}

function setSong(i) {
  save.audio.song = i;
  persist();
  Sound.setSong(i);
  if (!save.audio.music) setAudio('music', true);
  refreshSettings();
  $('song-seg').querySelector(`[data-song="${i}"]`).focus();
}

// Stavar av/på: "på" använder den stavfärg man senast valt i butiken (annars aluminium)
function updateSensLabel() {
  $('sens-value').textContent = `${Math.round((save.turnSens || 1) * 100)} %`;
}

function setHelmetOn(on) {
  save.helmetOn = on;
  persist();
  applyLook();
  refreshSettings();
  $('helmet-seg').querySelector(`[data-helmet="${on ? 'on' : 'off'}"]`).focus();
}

function setLiftOn(on) {
  save.lift = on;
  persist();
  refreshSettings();
  $('lift-seg').querySelector(`[data-lift="${on ? 'on' : 'off'}"]`).focus();
}

function setPoles(on) {
  if (isBoard()) return; // stavar används inte på snowboard
  save.style.poles = on ? save.lastPoles || 'poles-alu' : 'poles-none';
  persist();
  applyLook();
  refreshSettings();
  $('poles-seg').querySelector(`[data-poles="${on ? 'on' : 'off'}"]`).focus();
}

function setTime(night) {
  save.night = night;
  persist();
  applyTime();
  refreshSettings();
  $('time-seg').querySelector(`[data-time="${night ? 'night' : 'day'}"]`).focus();
}

function setLang(id) {
  save.lang = id;
  persist();
  applyLanguage();
  refreshSettings();
  $('lang-seg').querySelector(`[data-lang="${id}"]`).focus();
}

// ---------- Startskärm ----------

function showIntro() {
  state = 'intro';
  // Snöflingor som faller över titeln
  const snow = $('intro-snow');
  if (!snow.children.length) {
    for (let i = 0; i < 70; i++) {
      const f = document.createElement('span');
      f.className = 'flake';
      f.textContent = Math.random() < 0.35 ? '❄' : '•';
      f.style.left = `${Math.random() * 100}%`;
      f.style.fontSize = `${8 + Math.random() * 18}px`;
      f.style.opacity = `${0.4 + Math.random() * 0.6}`;
      f.style.animationDuration = `${6 + Math.random() * 9}s, ${3 + Math.random() * 3}s`;
      f.style.animationDelay = `${-Math.random() * 15}s, ${-Math.random() * 3}s`;
      snow.append(f);
    }
  }
  showOverlay('intro');
}

function leaveIntro() {
  if (state !== 'intro') return;
  Sound.init();
  Sound.click();
  $('intro').classList.add('leaving');
  setTimeout(() => {
    $('intro').classList.remove('leaving');
    showMenu();
  }, 450);
}

function showMenu() {
  state = 'menu';
  $('menu-bank').textContent = fmt(save.bank);
  updateBadgeDot();
  $('menu-best').textContent = fmt(save.best);
  // Bankortet i mitten: ikon, stort namn, beskrivning och egen färg per bana
  const card = $('course-card');
  card.className = `course-card course-${save.course}`;
  $('course-icon').textContent = COURSE_ICONS[save.course] || '🎿';
  $('course-name').textContent = t(`course.${save.course}`);
  for (const dot of $('course-dots').children) dot.classList.toggle('active', dot.dataset.course === save.course);
  $('course-desc').textContent = `${t(`course.${save.course}.desc`)} · ${t(`diff.${save.difficulty}`)}: ${fmt(runLength())} m, ${t('menu.pointsMult', { m: difficulty.points.toLocaleString(locale()) })}`;
  // Kort sammanfattning av inställningarna så att huvudmenyn kan vara ren
  $('menu-summary').textContent = [
    `${currentCharacter().icon} ${t(`char.${save.character}`)}`,
    t(isBoard() ? 'rider.board' : 'rider.ski'),
    t(`diff.${save.difficulty}`),
    t(save.night ? 'time.night' : 'time.day'),
  ].join(' · ');
  showOverlay('menu');
}

// Markerar valda alternativ i inställningsmenyn
function refreshSettings() {
  $('name-input').value = save.name || t('defaultName');
  $('rider-ski').classList.toggle('active', !isBoard());
  $('rider-board').classList.toggle('active', isBoard());
  for (const b of $('diff-seg').children) b.classList.toggle('active', b.dataset.diff === save.difficulty);
  for (const b of $('time-seg').children) b.classList.toggle('active', (b.dataset.time === 'night') === !!save.night);
  $('poles-row').classList.toggle('hidden', isBoard());
  $('sens-input').value = Math.round((save.turnSens || 1) * 100);
  updateSensLabel();
  for (const b of $('helmet-seg').children) b.classList.toggle('active', (b.dataset.helmet === 'on') === (save.helmetOn !== false));
  for (const b of $('lift-seg').children) b.classList.toggle('active', (b.dataset.lift === 'on') === (save.lift !== false));
  for (const b of $('poles-seg').children) b.classList.toggle('active', (b.dataset.poles === 'on') === (save.style.poles !== 'poles-none'));
  for (const b of $('song-seg').children) b.classList.toggle('active', Number(b.dataset.song) === (save.audio.song || 0));
  for (const b of $('lang-seg').children) b.classList.toggle('active', b.dataset.lang === save.lang);
  updateAudioButtons();
}

function showSettings() {
  state = 'menu';
  refreshSettings();
  showOverlay('settings');
}

// Karaktärer: rutnät med kort, markerad karaktär visas direkt på åkaren i 3D
function showCharacters() {
  state = 'menu';
  renderCharacters();
  showOverlay('characters');
  const sel = $('char-grid').querySelector('.selected');
  if (sel) sel.focus();
}

function renderCharacters() {
  const grid = $('char-grid');
  grid.innerHTML = '';
  for (const ch of CHARACTERS) {
    const b = document.createElement('button');
    b.className = `char-card char-${ch.id}${ch.id === save.character ? ' selected' : ''}`;
    b.dataset.char = ch.id;
    b.innerHTML = `<span class="char-ico">${ch.icon}</span><span class="char-name">${t(`char.${ch.id}`)}</span>`;
    b.addEventListener('focus', () => previewCharacter(ch));
    b.addEventListener('mouseenter', () => previewCharacter(ch));
    b.addEventListener('click', () => {
      save.character = ch.id;
      persist();
      applyLook();
      Sound.buy();
      for (const c of grid.children) c.classList.toggle('selected', c === b);
      previewCharacter(ch);
    });
    grid.append(b);
  }
  previewCharacter(currentCharacter());
}

function previewCharacter(ch) {
  applyLook(ch);
  $('char-title').textContent = `${ch.icon} ${t(`char.${ch.id}`)}`;
  $('char-desc').textContent = t(`char.${ch.id}.desc`);
  $('char-pick').textContent = ch.id === save.character ? `✔ ${t('shop.selected')}` : t('chars.pick');
  $('char-pick').classList.toggle('is-selected', ch.id === save.character);
}

function showHelp() {
  state = 'menu';
  showOverlay('help');
}

function setRider(rider) {
  save.rider = rider;
  persist();
  resetCrash();
  applyLook();
  refreshSettings();
  $(rider === 'ski' ? 'rider-ski' : 'rider-board').focus();
}

let lastRank = -1;
let lastRankCourse = null;

let boardCourse = 'classic';

function showBoard(courseId = save.course) {
  state = 'menu';
  boardCourse = courseId;
  $('lb-select').value = courseId;
  const body = $('lb-body');
  body.innerHTML = '';
  // Äldre åk saknar bana och nivå: de räknas som Klassisk/Normal
  const list = save.leaderboard.filter((e) => (e.course || 'classic') === courseId);
  list.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (courseId === lastRankCourse && i === lastRank) tr.className = 'me';
    // Äldre åk sparades bara med datum
    const when = e.at
      ? `${new Date(e.at).toLocaleDateString(locale())} ${new Date(e.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`
      : e.date;
    const level = t(`diff.${DIFFICULTIES[e.difficulty] ? e.difficulty : 'normal'}`);
    if (i < 3) tr.classList.add(`podium-${i + 1}`);
    const cells = [['🥇', '🥈', '🥉'][i] || i + 1, e.name, e.rider === 'board' ? '🏂' : '⛷️', level, `${fmt(e.dist)} m`, fmt(e.score), when];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    body.append(tr);
  });
  $('lb-empty').classList.toggle('hidden', list.length > 0);
  if (!$('board').classList.contains('hidden')) return;
  showOverlay('board');
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
    item.className = `item${maxed ? ' maxed' : save.bank >= cost ? ' afford' : ''}`;
    item.innerHTML = `
      <div class="icon">${u.icon}</div>
      <div class="info">
        <div class="name">${t(`up.${u.id}`)}</div>
        <div class="desc">${t(`up.${u.id}.desc`)}</div>
        <div class="pips">${'<i class="on"></i>'.repeat(level)}${'<i></i>'.repeat(u.max - level)}<small>${t('shop.level', { l: level, m: u.max })}</small></div>
      </div>`;

    const btn = document.createElement('button');
    btn.className = 'buy-btn';
    btn.textContent = maxed ? `✔ ${t('shop.max')}` : `🪙 ${fmt(cost)}`;
    btn.setAttribute('aria-disabled', String(maxed || save.bank < cost));
    btn.addEventListener('click', () => {
      if (save.bank < cost || save.upgrades[u.id] >= u.max) return Sound.denied();
      Sound.buy();
      save.bank -= cost;
      save.upgrades[u.id]++;
      persist();
      keepFocus('shop', renderShop);
    });
    item.append(btn);
    wrap.append(item);
  }

  // Stil: köp en färg en gång, välj sedan fritt bland dem du äger
  const styles = $('shop-styles');
  styles.innerHTML = '';
  for (const cat of STYLE_CATS) {
    if (cat.id === 'poles' && isBoard()) continue; // inga stavar på snowboard
    const row = document.createElement('div');
    row.className = 'style-row';
    const title = document.createElement('div');
    title.className = 'cat';
    title.textContent = t(`style.${cat.id}`);
    const list = document.createElement('div');
    list.className = 'swatches';
    for (const st of STYLES.filter((x) => x.cat === cat.id)) {
      const owned = save.owned.includes(st.id);
      const selected = save.style[cat.id] === st.id;
      const btn = document.createElement('button');
      btn.className = `swatch${selected ? ' selected' : owned ? ' owned' : ''}`;
      const dot = document.createElement('i');
      dot.style.background = st.color;
      if (st.color === 'transparent') dot.classList.add('none');
      const name = document.createElement('span');
      name.className = 'sw-name';
      name.textContent = t(st.name);
      const price = document.createElement('span');
      price.className = 'sw-price';
      price.textContent = selected ? `✔ ${t('shop.selected')}` : owned ? t('shop.choose') : `🪙 ${fmt(st.cost)}`;
      btn.append(dot, name, price);
      btn.setAttribute('aria-disabled', String(!owned && save.bank < st.cost));
      btn.addEventListener('click', () => {
        if (!save.owned.includes(st.id)) {
          if (save.bank < st.cost) return Sound.denied();
          Sound.buy();
          save.bank -= st.cost;
          save.owned.push(st.id);
        }
        save.style[cat.id] = st.id;
        if (cat.id === 'poles' && st.id !== 'poles-none') save.lastPoles = st.id;
        persist();
        applyLook();
        keepFocus('shop', renderShop);
      });
      list.append(btn);
    }
    row.append(title, list);
    styles.append(row);
  }
}

function startRun() {
  resetWorld();
  $('popups').innerHTML = '';
  wasMenu = true; // kameran hoppar direkt till starten istället för att svepa genom backen
  player.speed = stats().cruise;
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

// Sparar åket (poäng, rekord, topplista) och returnerar resultatet
function recordRun() {
  const dist = Math.min(runLength(), Math.floor(player.d));
  const total = runScore();
  const record = total > save.best;
  save.bank += total;
  save.best = Math.max(save.best, total);
  save.bestDist = Math.max(save.bestDist, dist);
  // Topplistan: de 10 bästa åken
  const entry = {
    name: save.name || t('defaultName'), score: total, dist, rider: save.rider,
    course: save.course, difficulty: save.difficulty, at: Date.now(),
  };
  // Topp 10 per bana
  const same = (e) => (e.course || 'classic') === save.course;
  const mine = [...save.leaderboard.filter(same), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  lastRank = mine.indexOf(entry);
  lastRankCourse = save.course;
  save.leaderboard = [...save.leaderboard.filter((e) => !same(e)), ...mine];
  persist();
  runBadges(total, dist >= runLength());
  return { dist, total, record };
}

function rankText() {
  return lastRank >= 0 ? t('go.rank', { rank: lastRank + 1, course: t(`course.${save.course}`) }) : '';
}

function endRun() {
  showResults(recordRun(), t(player.dq ? 'go.dq' : player.quit ? 'go.quit' : 'go.crash'), player.crashReason);
}

// Resultatskärmen: emoji, rolig kommentar, 1–3 stjärnor, färgglada rutor och konfetti vid rekord/mål
function showResults({ dist, total, record }, title, reason) {
  const finished = player.finishRes && dist >= runLength();
  const kind = player.dq ? 'dq' : player.quit ? 'quit' : finished ? 'finish' : 'crash';
  $('go-emoji').textContent = { crash: '💥', finish: '🏁', dq: '🚩', quit: '👋' }[kind];
  $('go-panel').className = `panel go-panel go-${kind}`;
  const quips = kind === 'finish' ? 4 : 6;
  $('go-quip').textContent = kind === 'quit' ? '' : t(`quip.${kind === 'finish' ? 'finish' : 'crash'}.${Math.floor(Math.random() * quips)}`);

  // Betyg efter hur långt man kom och hur mycket poäng det blev per meter
  const perM = total / Math.max(1, runLength());
  const stars = finished ? (perM > 1.8 ? 3 : 2) : dist > runLength() * 0.6 ? 2 : dist > runLength() * 0.2 ? 1 : 0;
  const rating = $('go-rating');
  rating.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const st = document.createElement('span');
    st.textContent = '★';
    st.className = i < stars ? 'on' : '';
    st.style.animationDelay = `${0.35 + i * 0.18}s`;
    rating.append(st);
  }

  $('go-rank').textContent = rankText();
  $('go-rank').classList.toggle('hidden', lastRank < 0 || total <= 0);
  $('go-title').textContent = title;
  $('go-reason').textContent = reason;
  $('go-dist').textContent = `${fmt(dist)} m`;
  $('go-tricks').textContent = fmt(run.tricks);
  $('go-stars').textContent = fmt(run.stars);
  $('go-speed').textContent = `${fmt(run.maxSpeed * 3.6)} km/h`;
  $('go-air').textContent = `${run.maxAir.toLocaleString(locale(), { maximumFractionDigits: 1 })} m`;
  $('go-gates').textContent = `${run.gates} ✓ · ${run.missed} ✗`;
  for (const el of document.querySelectorAll('.gates-row')) el.classList.toggle('hidden', !course.slalom);
  $('go-total').textContent = fmt(total);
  $('go-record').classList.toggle('hidden', !record);
  state = 'gameover';
  $('popups').innerHTML = '';
  showOverlay('gameover');

  // Konfetti vid nytt rekord eller målgång
  const conf = $('confetti');
  conf.innerHTML = '';
  if (record || finished) {
    const colors = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ff9800'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      c.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      conf.append(c);
    }
  }
}

$('btn-play').addEventListener('click', startRun);
$('btn-shop').addEventListener('click', showShop);
$('btn-shop-back').addEventListener('click', showMenu);
$('btn-shop-play').addEventListener('click', startRun);
$('btn-again').addEventListener('click', startRun);
$('btn-go-shop').addEventListener('click', showShop);
$('btn-go-menu').addEventListener('click', showMenu);
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', () => {
  player.crashReason = t('go.quitReason');
  player.quit = true;
  endRun();
});
$('btn-board').addEventListener('click', () => showBoard());
$('btn-start').addEventListener('click', leaveIntro);
$('btn-lift-skip').addEventListener('click', () => { if (state === 'lift') endLift(); });
$('course-prev').addEventListener('click', () => cycleCourse(-1));
$('course-next').addEventListener('click', () => cycleCourse(1));
$('course-card').addEventListener('click', startRun); // klick på kortet = åk den banan
$('lb-select').addEventListener('change', (e) => showBoard(e.target.value));
$('btn-settings').addEventListener('click', showSettings);
$('btn-help').addEventListener('click', showHelp);
$('btn-characters').addEventListener('click', showCharacters);
$('btn-badges').addEventListener('click', showBadges);
$('btn-badges-back').addEventListener('click', showMenu);
$('btn-claim-all').addEventListener('click', () => {
  const open = BADGES.filter((b) => save.badges[b.id] === 'earned');
  if (!open.length) return Sound.denied();
  for (const b of open) {
    save.badges[b.id] = 'claimed';
    save.bank += b.reward;
  }
  persist();
  Sound.combo(5);
  keepFocus('badges', renderBadges);
});
$('btn-chars-back').addEventListener('click', () => { applyLook(); showMenu(); });
$('char-grid').addEventListener('mouseleave', () => {
  const f = document.activeElement && document.activeElement.dataset.char;
  previewCharacter(CHARACTERS.find((c) => c.id === f) || currentCharacter());
});
$('btn-settings-back').addEventListener('click', showMenu);
$('btn-help-back').addEventListener('click', showMenu);
$('btn-music').addEventListener('click', () => setAudio('music', !save.audio.music));
$('btn-sfx').addEventListener('click', () => setAudio('sfx', !save.audio.sfx));
updateAudioButtons();
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && !btn.closest('#shop-items, #shop-styles')) Sound.click();
});
$('btn-go-board').addEventListener('click', () => showBoard());
$('btn-lb-back').addEventListener('click', showMenu);
$('rider-ski').addEventListener('click', () => setRider('ski'));
$('rider-board').addEventListener('click', () => setRider('board'));
$('sens-input').addEventListener('input', (e) => {
  save.turnSens = Number(e.target.value) / 100;
  persist();
  updateSensLabel();
});
$('name-input').addEventListener('input', (e) => {
  save.name = e.target.value.trim().slice(0, 16);
  persist();
});

function popup(title, sub = '', color = '#1d2b3a') {
  const el = document.createElement('div');
  el.className = 'popup';
  const t = document.createElement('div');
  t.className = 'title';
  t.style.color = color;
  t.textContent = title;
  el.append(t);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'sub';
    s.textContent = sub;
    el.append(s);
  }
  $('popups').append(el);
  setTimeout(() => el.remove(), 1600);
}

// ---------- Spellogik ----------

function feet() {
  return { x: player.x, y: groundY(player.x, player.d), z: -player.d };
}

function clearTricks() {
  const p = player;
  p.spin = 0;
  p.flipping = false;
  p.flipProg = 0;
  p.flips = 0;
  p.frontFlips = 0;
  p.flipDir = 1;
  p.grabTime = 0;
  p.grabTimes = {};
}

function launch(vz, quiet = false) {
  const p = player;
  p.air = true;
  p.vz = vz;
  p.z = Math.max(p.z, 0.01);
  p.onRock = null;
  p.onRamp = null;
  p.maxZ = 0;
  p.prevBvy = 0;
  p.takeoffSwitch = isSwitch();
  p.smallAir = quiet;
  clearTricks();
  // Styrningen från marken ska inte bli en oavsiktlig snurr – släpp först
  p.spinArmed = !isLeft() && !isRight();
  trail.push({ gap: true });
  const f = feet();
  if (quiet) return;
  burst(f.x, f.y + 0.1, f.z, 25, 3, 0.4);
  Sound.jump(Math.min(1, vz / 14));
}

function crash(reasonKey, obstacle, kind) {
  const p = player;
  const reason = t(reasonKey);
  const f = feet();
  const startZ = p.z;
  const rail = obstacle && isLinear(obstacle) ? obstacle : p.grind ? p.grind.o : null;
  clearTricks();
  p.grind = null;
  p.onRock = null;
  p.smallAir = false;
  p.combo = { parts: [], pts: 0 };
  if (p.chain.n >= 2) popup(`💔 ${t('chain.broken')}`, '', '#5d4037');
  p.chain = { n: 0, timer: 0 };
  p.air = false;
  p.z = 0;
  p.vz = 0;
  burst(f.x, f.y + 0.3, f.z, 160, 6, 0.7);
  Sound.crash(p.lives > 0 ? 0.6 : 1);
  if (obstacle && (obstacle.type === 'tree' || obstacle.type === 'pine')) {
    // Snö som rasar ner från grenarna
    const top = obstacle.type === 'pine' ? 8 : 4;
    for (let i = 0; i < 80; i++) {
      emit(obstacle.x + (Math.random() - 0.5) * 3, groundY(obstacle.x, obstacle.d) + 1 + Math.random() * top,
        -obstacle.d + (Math.random() - 0.5) * 3, (Math.random() - 0.5), -Math.random() * 2, (Math.random() - 0.5),
        0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.8);
    }
  }
  if (p.lives > 0) {
    p.lives--;
    p.invuln = 2;
    p.speed *= 0.4;
    p.stumble = 1;
    if (rail) {
      // Knuffa åt sidan så att man inte står kvar inne i räcket och kraschar igen
      const info = linearInfo(rail, p.x, p.d);
      const a = pointAt(rail, info.t).a;
      const side = Math.sign(info.lat) || 1;
      p.x += Math.cos(a) * side * (rail.r + 1);
      p.d -= Math.sin(a) * side * (rail.r + 1);
      p.noGrind = rail;
    }
    popup(reason, t('crash.helmetSaved'), '#e53935');
    return;
  }
  p.crashReason = reason;
  p.invuln = 0; // annars kan blinkningen frysa med åkaren osynlig under kraschen
  p.stumble = 0;
  state = 'crashing';
  const hard = obstacle && ['tree', 'pine', 'snowman'].includes(obstacle.type);
  startCrashPhysics(kind || (hard ? 'hard' : obstacle ? 'trip' : 'land'), startZ);
}

// Räknar ihop tricks från luftfasen in i combon. Returnerar en kraschorsak om landningen misslyckas.
// Grabs räknas likadant vid landning och när man landar på ett räcke
function addGrabs(c) {
  const p = player;
  const held = [];
  for (const g of GRABS) {
    const time = (p.grabTimes || {})[g.id] || 0;
    if (time > 0.25) {
      c.parts.push(g.name);
      c.pts += Math.round(time * g.pts);
      held.push(g.id);
    }
  }
  return held;
}

function collectAirTricks() {
  const p = player;
  let flips = p.flips;
  let fronts = p.frontFlips || 0;
  if (p.flipping) {
    if (p.flipProg < 0.8) return 'crash.head';
    if (p.flipDir < 0) fronts++;
    else flips++;
  }
  // Varje halvvarv (180°) är ett giltigt läge – udda antal betyder att du landar baklänges
  const halves = Math.round(p.spin / Math.PI);
  const off = Math.abs(p.spin - halves * Math.PI);
  if (off > 0.6 && Math.abs(p.spin) > 1) return 'crash.crooked';

  const prefix = p.takeoffSwitch ? 'Switch ' : '';
  const c = p.combo;
  const n = Math.abs(halves);
  if (n > 0) {
    c.parts.push(`${prefix}${n * 180}`);
    c.pts += 40 * n * (n + 1) / 2;
  }
  if (flips > 0) {
    c.parts.push(flips === 1 ? 'Backflip' : flips === 2 ? t('trick.doubleBackflip') : `${flips}x backflip`);
    c.pts += 150 * flips * (flips + 1) / 2;
  }
  if (fronts > 0) {
    c.parts.push(fronts === 1 ? 'Frontflip' : fronts === 2 ? t('trick.doubleFrontflip') : `${fronts}x frontflip`);
    c.pts += 170 * fronts * (fronts + 1) / 2;
  }
  const grabs = addGrabs(c);
  // Perfekt landning: nästan exakt rakt (under ~7°) efter snurr eller volt, och volten helt klar
  const flipClean = !p.flipping || p.flipProg >= 0.97;
  const perfect = (n > 0 || flips > 0 || fronts > 0) && off < 0.12 && flipClean;
  if (perfect) {
    c.parts.push(`✨ ${t('trick.perfect')}`);
    c.noMult = (c.noMult || 0) + 1;
    c.pts += Math.max(30, Math.round(c.pts * 0.25));
  }
  trickBadges({ flips, fronts, spin: n * 180, grabs, perfect });
  // Behåll den visuella vinkeln så att modellen inte hoppar, och byt åkriktning vid udda halvvarv
  p.facingVis += p.spin;
  p.facing += halves * Math.PI;
  clearTricks();
  return null;
}

// ---------- Badges ----------

const badgeName = (b) => (b.course ? t('badge.course', { c: t(`course.${b.course}`) }) : b.diff ? t('badge.diff', { d: t(`diff.${b.diff}`) }) : t(`badge.${b.id}`));
const badgeDesc = (b) => (b.course ? t('badge.course.desc', { c: t(`course.${b.course}`) }) : b.diff ? t('badge.diff.desc', { d: t(`diff.${b.diff}`) }) : t(`badge.${b.id}.desc`));
const badgeIcon = (b) => b.icon || COURSE_ICONS[b.course] || '🏅';
const unclaimedBadges = () => BADGES.filter((b) => save.badges[b.id] === 'earned').length;

function earnBadge(id) {
  if (save.badges[id]) return;
  const b = BADGES.find((x) => x.id === id);
  if (!b) return;
  save.badges[id] = 'earned';
  persist();
  popup(`🏅 ${badgeName(b)}`, `${t('badge.earned')} · 🪙 ${fmt(b.reward)}`, '#b8860b');
  Sound.star();
  updateBadgeDot();
}

// Framsteg mot badges som kräver flera saker (alla grabs, alla banor på svår)
function badgeProgress(id, item) {
  const list = save.badgeProg[id] || (save.badgeProg[id] = []);
  if (!list.includes(item)) {
    list.push(item);
    persist();
  }
  const b = BADGES.find((x) => x.id === id);
  if (list.length >= b.goal) earnBadge(id);
}

function trickBadges({ flips, fronts, spin, grabs, perfect }) {
  if (flips >= 1) earnBadge('backflip');
  if (fronts >= 1) earnBadge('frontflip');
  if (flips >= 2 || fronts >= 2) earnBadge('doubleflip');
  if (spin >= 720) earnBadge('spin720');
  if (spin >= 1080) earnBadge('spin1080');
  for (const g of grabs) badgeProgress('grabs', g);
  if (grabs.includes('chinese')) earnBadge('chinese');
  if (perfect) earnBadge('perfect');
}

// När åket är slut (krasch eller mål)
function runBadges(total, finished) {
  if (total >= 5000) earnBadge('score5k');
  if (total >= 10000) earnBadge('score10k');
  if (!finished) return;
  earnBadge(`course-${save.course}`);
  earnBadge(`diff-${save.difficulty}`);
  if (save.difficulty === 'hard') badgeProgress('hardall', save.course);
  if (course.slalom && run.missed === 0 && !player.dq) earnBadge('slalomclean');
}

function updateBadgeDot() {
  const n = unclaimedBadges();
  const dot = $('badge-dot');
  dot.textContent = n;
  dot.classList.toggle('hidden', n === 0);
}

function showBadges() {
  state = 'menu';
  renderBadges();
  showOverlay('badges');
}

function claimBadge(b) {
  if (save.badges[b.id] !== 'earned') return Sound.denied();
  save.badges[b.id] = 'claimed';
  save.bank += b.reward;
  persist();
  Sound.buy();
  keepFocus('badges', renderBadges);
}

function renderBadges() {
  const earned = BADGES.filter((b) => save.badges[b.id]).length;
  setText('badges-count', `${earned} / ${BADGES.length}`);
  setText('badges-bank', fmt(save.bank));
  const claimAll = $('btn-claim-all');
  const open = unclaimedBadges();
  claimAll.textContent = `${t('badge.claimAll')} (${open})`;
  claimAll.setAttribute('aria-disabled', String(open === 0));
  const wrap = $('badge-list');
  wrap.innerHTML = '';
  for (const cat of BADGE_CATS) {
    const h = document.createElement('h3');
    h.textContent = t(`badge.cat.${cat}`);
    wrap.append(h);
    const grid = document.createElement('div');
    grid.className = 'badge-grid';
    for (const b of BADGES.filter((x) => x.cat === cat)) {
      const st = save.badges[b.id] || 'locked';
      const card = document.createElement('div');
      card.className = `badge-card ${st}`;
      const prog = b.goal ? ` (${(save.badgeProg[b.id] || []).length}/${b.goal})` : '';
      card.innerHTML = `<div class="badge-ico">${st === 'locked' ? '🔒' : badgeIcon(b)}</div>
        <div class="badge-info"><div class="badge-name"></div><div class="badge-desc"></div></div>`;
      card.querySelector('.badge-name').textContent = badgeName(b);
      card.querySelector('.badge-desc').textContent = badgeDesc(b) + (st === 'locked' ? prog : '');
      const btn = document.createElement('button');
      btn.className = 'claim-btn';
      if (st === 'earned') btn.textContent = `${t('badge.claim')} 🪙 ${fmt(b.reward)}`;
      else if (st === 'claimed') btn.textContent = `✔ ${t('badge.claimed')}`;
      else btn.textContent = `🪙 ${fmt(b.reward)}`;
      btn.setAttribute('aria-disabled', String(st !== 'earned'));
      btn.addEventListener('click', () => claimBadge(b));
      card.append(btn);
      grid.append(card);
    }
    wrap.append(grid);
  }
}

const CHAIN_TIME = 2.5;
const chainMult = (n) => Math.min(4, 1 + 0.5 * (n - 1));

function finishCombo() {
  const c = player.combo;
  if (c.parts.length && c.pts > 0) {
    const mult = Math.max(1, c.parts.length - (c.noMult || 0));
    // Trickkedja: landar du ett nytt trick innan tiden tar slut växer kedjan
    const ch = player.chain;
    ch.n = ch.timer > 0 ? ch.n + 1 : 1;
    ch.timer = CHAIN_TIME;
    const cm = chainMult(ch.n);
    const pts = Math.round(c.pts * mult * cm);
    run.tricks += pts;
    run.maxChain = Math.max(run.maxChain || 0, ch.n);
    if (c.parts.length - (c.noMult || 0) >= 3) earnBadge('combo3');
    if (ch.n >= 3) earnBadge('chain3');
    if (ch.n >= 5) earnBadge('chain5');
    Sound.combo(mult + ch.n - 1);
    const extra = [mult > 1 ? `combo x${mult}` : '', ch.n > 1 ? `🔥 ${t('chain.label')} x${cm}` : ''].filter(Boolean).join(' · ');
    popup(c.parts.join(' + '), `+${fmt(pts)}${extra ? ` (${extra})` : ''}`, ch.n > 1 ? '#d84315' : '#ef6c00');
  }
  player.combo = { parts: [], pts: 0 };
}

// Kedjans tid räknas bara ner när man står på snön
function updateChain(dt) {
  const p = player;
  const ch = p.chain;
  if (ch.timer > 0 && !p.air && !p.grind) {
    ch.timer -= dt;
    if (ch.timer <= 0) {
      ch.timer = 0;
      if (ch.n >= 3) popup(`🔥 ${t('chain.done', { n: ch.n })}`, '', '#d84315');
      ch.n = 0;
    }
  }
  const show = ch.n >= 1 && ch.timer > 0 && state === 'playing';
  $('chain').classList.toggle('hidden', !show);
  if (show) {
    setText('chain-text', `🔥 ${t('chain.label')} x${chainMult(ch.n + 1)}`);
    $('chain-bar').style.width = `${(ch.timer / CHAIN_TIME) * 100}%`;
  }
}

function landOnRock(o, top) {
  const p = player;
  const fail = collectAirTricks();
  if (fail) return crash(fail);
  p.onRock = o;
  p.air = false;
  p.vz = 0;
  p.z = top;
  p.squash = 0.6;
  p.combo.parts.push('Rock tap');
  Sound.rockTap();
  p.combo.pts += 20;
  const f = feet();
  burst(f.x, f.y + top, f.z, 20, 2.5, 0.4);
}

function leaveRock() {
  const p = player;
  p.smallAir = false;
  p.onRock = null;
  p.air = true;
  p.vz = 1 + p.speed * 0.04;
  p.takeoffSwitch = isSwitch();
  p.spinArmed = !isLeft() && !isRight();
  trail.push({ gap: true });
}

function land() {
  const p = player;
  p.prevBvy = 0;
  p.slowmo = false;
  p.noGrind = null;
  if (p.pipeAir) {
    // Tillbaka ner längs väggen: den uppåtgående farten blir fart in mot pipen igen
    const { side, vlat } = p.pipeAir;
    const sp = Math.hypot(p.speed, vlat);
    p.angle = -side * Math.asin(Math.min(0.97, vlat / sp));
    p.speed = sp;
    p.pipeAir = null;
    if (p.maxZ > 0.6) {
      p.combo.parts.push(`Air ${p.maxZ.toLocaleString(locale(), { maximumFractionDigits: 1 })} m`);
      p.combo.pts += Math.round(p.maxZ * 12);
    }
  }
  const small = p.smallAir;
  p.smallAir = false;
  if (!small) Sound.land(Math.min(1, Math.abs(p.vz) / 14));
  p.air = false;
  p.z = 0;
  p.vz = 0;
  p.squash = small ? 0.4 : 1;
  const f = feet();
  burst(f.x, f.y + 0.1, f.z, small ? 8 : 45, small ? 2 : 4, 0.45);
  const fail = collectAirTricks();
  if (fail) return crash(fail);
  if (run.maxAir >= 8) earnBadge('bigair');
  finishCombo();
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Hur kroppen står mot räcket när du landar avgör vilken grind det blir (i steg om 45°)
function grindStyle(q) {
  const back = Math.abs(q) > 2;
  const deg = back ? 180 - Math.abs(q) * 45 : Math.abs(q) * 45;
  const switchPre = back ? 'Switch ' : '';
  const side = q > 0 ? 'Front' : 'Back';
  if (deg === 0) return { name: `${switchPre}50-50`, mult: 1 };
  if (deg === 45) return { name: `${switchPre}${isBoard() ? 'Diagonal 50-50' : 'Diagonal slide'}`, mult: 1.3 };
  return { name: isBoard() ? `${side}side boardslide` : `${side}slide`, mult: 1.6 };
}

function startGrind(o, info) {
  const p = player;
  // Kommer du in för tvärt över räcket går det inte att grinda
  const entry = pointAt(o, info.t);
  const crossing = Math.abs(wrapAngle(p.angle - entry.a));
  if (crossing > 1.1) return false;
  if (p.flipping && p.flipProg < 0.8) {
    crash('crash.railHead', o);
    return true;
  }

  const c = p.combo;
  const spinIn = Math.round(Math.abs(p.spin) / (Math.PI / 2)) * 90;
  if (spinIn >= 180) {
    c.parts.push(`${spinIn} in`);
    c.pts += spinIn / 90 * 40;
  }
  const flips = p.flips + (p.flipping && p.flipDir > 0 ? 1 : 0);
  const fronts = (p.frontFlips || 0) + (p.flipping && p.flipDir < 0 ? 1 : 0);
  if (flips > 0) {
    c.parts.push(flips === 1 ? 'Backflip' : `${flips}x backflip`);
    c.pts += 150 * flips;
  }
  if (fronts > 0) {
    c.parts.push(fronts === 1 ? 'Frontflip' : `${fronts}x frontflip`);
    c.pts += 170 * fronts;
  }
  const grabs = addGrabs(c);
  trickBadges({ flips, fronts, spin: spinIn, grabs, perfect: false });

  // Kroppens vinkel mot räcket, avrundad till närmaste 45°
  const visual = p.angle + p.spin + p.facingVis + p.twist;
  const rel = wrapAngle(p.angle + p.spin + p.facing - entry.a);
  const q = Math.round(rel / (Math.PI / 4));
  let facing = Math.abs(q) > 2 ? Math.sign(q) * Math.PI : 0;
  const style = grindStyle(q);
  if (o.type === 'box') style.name = `Box ${style.name}`;

  p.smallAir = false;
  Sound.grindStart(o.type);
  p.grind = { o, t: clamp(info.t, 0, 1), dist: 0, name: style.name, mult: style.mult, twist: q * Math.PI / 4 - facing };
  p.facingVis = visual - entry.a - p.twist; // modellen glider mjukt in i den nya ställningen
  // +180° och −180° är samma ställning – välj den som ligger närmast, annars snurrar modellen ett helt varv
  facing += Math.PI * 2 * Math.round((p.facingVis - facing) / (Math.PI * 2));
  p.facing = facing;
  clearTricks();
  p.speed *= Math.max(0.45, Math.cos(crossing));
  p.air = false;
  p.vz = 0;
  p.angle = entry.a;
  p.turnVel = 0;
  p.balance = (Math.random() - 0.5) * 0.2;
  p.balanceVel = 0;
  p.spinArmed = false;
  const f = feet();
  burst(f.x, f.y + p.z, f.z, 20, 2, 0.35);
  return true;
}

function exitGrind(vz) {
  const p = player;
  const g = p.grind;
  p.grind = null;
  p.smallAir = false;
  p.air = true;
  p.vz = vz;
  p.takeoffSwitch = isSwitch();
  p.spinArmed = !isLeft() && !isRight();
  trail.push({ gap: true });
  if (g.dist >= 30) earnBadge('grind30');
  if (g.dist > 1.5) {
    p.combo.parts.push(`${g.name} ${Math.round(g.dist)} m`);
    p.combo.pts += Math.round(g.dist * g.o.ptsPerM * g.mult);
  }
}

function updateGrind(dt, s) {
  const p = player;
  const g = p.grind;
  const o = g.o;
  const here = pointAt(o, g.t);
  // Friktion, och i uppförsbacke (räcket reser sig mot backen) tappar man lite extra fart
  p.speed -= ((o.type === 'rail' ? 0.6 : 1.8) + 8 * Math.max(0, here.dyds + 0.15)) * dt;
  if (p.speed < 3) {
    p.speed = 3;
    p.noGrind = o; // annars landar man på samma räcke igen direkt
    return exitGrind(2);
  }
  const step = p.speed * dt;
  g.dist += step;
  g.t += step / o.len;
  const pt = pointAt(o, g.t);
  p.x = pt.x;
  p.d = pt.d;
  p.z = pt.y - groundY(pt.x, pt.d);
  p.angle = pt.a; // följer kurvan

  // Balans: som en inverterad pendel som vill tippa – parera med ← →
  const input = isLeft() ? -1 : isRight() ? 1 : 0;
  const noise = (Math.random() - 0.5) * 6 / (1 + save.upgrades.binding * 0.2) * difficulty.balance * (o.type === 'box' ? 0.6 : 1);
  p.balanceVel += (p.balance * 2.6 + noise + input * 5) * dt;
  p.balanceVel *= Math.max(0, 1 - 1.5 * dt);
  p.balance += p.balanceVel * dt;
  if (Math.abs(p.balance) > 1) return crash('crash.balance', null, 'balance');

  if (Math.random() < dt * 40) {
    const f = feet();
    emit(f.x, f.y + p.z, f.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.15, 0.4);
  }
  if (wasPressed('Space')) exitGrind(6 * s.jumpPower);
  else if (g.t >= 1) exitGrind(3);
}

function emitCarve(dt, s) {
  const p = player;
  const turning = Math.abs(p.turnVel) / s.turnRate;
  sprayAcc += p.speed * (0.4 + turning * 9 + p.braking * 14) * dt;
  if (sprayAcc < 1) return;

  const f = feet();
  const fx = Math.sin(p.angle);
  const fz = -Math.cos(p.angle);
  const rx = Math.cos(p.angle);
  const rz = Math.sin(p.angle);
  const strong = turning > 0.2 || p.braking > 0.2;
  for (; sprayAcc >= 1; sprayAcc--) {
    const ski = Math.random() < 0.5 ? -1 : 1;
    const back = 0.3 + Math.random() * 0.6;
    // Snön sprutar ut mot svängens utsida (vid bromsning: framåt-snett som en hockeybroms)
    const out = Math.abs(p.turnVel) > 0.1 ? -Math.sign(p.turnVel) : ski;
    const side = (strong ? 2 + Math.random() * 4 : 0.4 + Math.random()) * out;
    const fwd = p.speed * (0.7 + Math.random() * 0.25) + p.braking * 3;
    emit(
      f.x - fx * back + rx * ski * 0.14, f.y + 0.05, f.z - fz * back + rz * ski * 0.14,
      fx * fwd + rx * side + (Math.random() - 0.5),
      (strong ? 1.2 + Math.random() * 3.5 : 0.3 + Math.random()) * Math.min(1, p.speed / 10),
      fz * fwd + rz * side + (Math.random() - 0.5),
      0.15 + Math.random() * 0.25,
      0.35 + Math.random() * 0.45,
    );
  }
}

function updateGround(dt, s) {
  const p = player;
  // Baklänges är vänster/höger omvänt (som sett från åkarens håll)
  const input = (isLeft() ? -1 : isRight() ? 1 : 0) * (isSwitch() ? -1 : 1);
  // Styrningen har tröghet: vinkelhastigheten glider mot målet, så svängarna blir mjuka bågar.
  // Släpper du tangenten glider du sakta tillbaka mot fallinjen.
  // I halfpipen centrerar styrningen sig mindre så att det är lätt att åka vägg till vägg
  const piped = inPipe(p.d);
  const targetVel = input ? input * s.turnRate * (piped ? 1.2 : 1) : -p.angle * (piped ? 0.35 : 1.1);
  p.turnVel += (targetVel - p.turnVel) * smooth(input ? 6 : 3, dt);
  p.angle += p.turnVel * dt;
  // I halfpipen behåller man alltid lite fart nedför pipen
  const maxAngle = piped ? 1.2 : 1.45;
  if (Math.abs(p.angle) > maxAngle) {
    p.angle = Math.sign(p.angle) * maxAngle;
    p.turnVel = 0;
  }

  p.braking += ((isDown() ? 1 : 0) - p.braking) * smooth(10, dt);
  if (wasPressed('KeyX')) {
    // Vänd 180° på marken och åk baklänges (eller tillbaka)
    p.facing += Math.PI;
    Sound.pivot();
    p.speed *= 0.92;
    const f = feet();
    burst(f.x, f.y + 0.1, f.z, 35, 3.5, 0.45);
  }

  // Fysik: backen drar framåt (mest rakt ner), luftmotståndet växer med farten.
  // Det ger en naturlig toppfart och svängar som bara kostar lite fart.
  const tuck = isTuck() && p.braking < 0.5;
  // Luftmotståndet är satt så att du håller "cruise" i en genomsnittlig backe.
  // Brantare backe drar hårdare (högre toppfart), flackare backe bromsar in dig.
  const steepness = slopeAt(p.d) / course.slope;
  // Puckarna bromsar där de finns: högre luftmotstånd ger lägre toppfart
  const drag = s.pull / (s.cruise * s.cruise) / (tuck ? 1.25 : 1) * (1 + mogulAmount(p.x, p.d) * course.moguls * 0.8);
  let acc = s.pull * steepness * Math.cos(p.angle) - drag * p.speed * p.speed;
  acc -= Math.abs(p.turnVel) * p.speed * 0.035;
  acc -= p.braking * 16;
  if (pipeEnv(p.d) > 0) {
    // Uppför väggen bromsar tyngdkraften, nerför accelererar den (lite snällare än verkligheten)
    const gx = (pipeY(p.x + 0.25, p.d) - pipeY(p.x - 0.25, p.d)) / 0.5;
    acc -= 9.8 * 0.45 * Math.min(3, gx) * Math.sin(p.angle);
  }
  p.speed = clamp(p.speed + acc * dt, 0, MAX_SPEED);

  if (wasPressed('Space')) launch(6.5 * s.jumpPower);
}

function updateAir(dt, s) {
  const p = player;
  if (p.smallAir) return updateGround(dt, s);
  p.turnVel *= Math.max(0, 1 - 4 * dt);
  p.braking = 0;
  if (!isLeft() && !isRight()) p.spinArmed = true;
  if (p.spinArmed && isLeft()) p.spin -= s.spinRate * dt;
  if (p.spinArmed && isRight()) p.spin += s.spinRate * dt;
  // ↑ = framåtvolt, ↓ = bakåtvolt
  const front = wasPressed('ArrowUp', 'KeyW');
  if (!p.flipping && (front || wasPressed('ArrowDown', 'KeyS'))) {
    p.flipping = true;
    p.flipProg = 0;
    p.flipDir = front ? -1 : 1;
  }
  if (p.flipping) {
    p.flipProg += dt / s.flipTime;
    if (p.flipProg >= 1) {
      p.flipping = false;
      if (p.flipDir < 0) p.frontFlips = (p.frontFlips || 0) + 1;
      else p.flips++;
    }
  }
  const grab = currentGrab();
  if (grab) {
    p.grabTime += dt;
    p.grabTimes = p.grabTimes || {};
    p.grabTimes[grab.id] = (p.grabTimes[grab.id] || 0) + dt;
  }
}

function checkCollisions(s) {
  const p = player;
  for (const o of objects) {
    if (o.taken || o.type === 'gate' || o.type === 'spine' || o.type === 'rollers' || o.type === 'deco') continue; // portar, terrängformer och dekor

    if (isLinear(o)) {
      const info = linearInfo(o, p.x, p.d);
      if (info.t < -0.02 || info.t > 1.02 || Math.abs(info.lat) > 1) continue;
      const top = linearTopZ(o, clamp(info.t, 0, 1), p.x, p.d);
      // Landa på räcket/stocken ovanifrån
      if (p.noGrind !== o && p.air && p.vz < 0 && Math.abs(info.lat) < 0.8 && p.z <= top + 0.5 && p.z >= top - 0.35) {
        if (startGrind(o, info)) return;
      }
      // Glid upp från marken där räcket/boxen börjar i snöhöjd (påfart)
      if (p.noGrind !== o && !p.air && !p.onRock && top < 0.3 && info.t >= 0 && info.t < 0.3 && Math.abs(info.lat) < 0.6) {
        if (startGrind(o, info)) return;
      }
      if (p.invuln <= 0 && p.noGrind !== o && p.z < top - 0.35 && Math.abs(info.lat) < o.r + 0.3) {
        crash(o.crash, o);
        return;
      }
      continue;
    }

    const dd = o.d - p.d;
    const dx = o.x - p.x;
    const reach = o.type === 'ramp' ? o.ramp.l + 1.5 : 4;
    if (Math.abs(dd) > reach || Math.abs(dx) > reach) continue;
    if (o.type === 'ramp') {
      // Åk uppför kickern och lyft vid kanten (dd = l där den börjar, -l vid kanten)
      const r = o.ramp;
      if (r.terrain) continue; // Big Air är terräng – lyftet sker i update() när kanten passeras
      if (!p.air && Math.abs(dx) < r.w && dd < r.l && dd > -r.l) {
        p.z = r.h * (r.l - dd) / (2 * r.l);
        p.onRamp = o;
      } else if (p.onRamp === o) {
        p.onRamp = null;
        if (!p.air && dd <= -r.l) launch((r.vz + p.speed * 0.06) * s.jumpPower);
        else if (!p.air) launch(1, true); // åkte av sidan på kickern
      }
      continue;
    }
    if (o.type === 'star') {
      if (p.z < 3 && dx * dx + dd * dd < 1.3 * 1.3) {
        o.taken = true;
        run.stars += 25;
        popup('⭐ +25', '', '#f9a825');
        Sound.star();
      }
      continue;
    }
    if (o.type === 'snowman' && !o.highfived && p.z < 1) {
      const dist = Math.sqrt(dx * dx + dd * dd);
      if (dist > o.r + 0.35 && dist < 2.4 && Math.abs(dd) < 0.8) {
        // Kör nära förbi en snögubbe = high five!
        o.highfived = true;
        earnBadge('highfive');
        const right = dx * Math.cos(p.angle) - dd * Math.sin(p.angle) > 0;
        p.highfive = { t: 0.6, right: isSwitch() ? !right : right };
        run.tricks += 25;
        popup('✋ High five!', '+25', '#1e88e5');
        Sound.highfive();
        burst(o.x - dx * 0.4, groundY(o.x, o.d) + 1.6, -(o.d - dd * 0.4), 18, 2, 0.3);
        continue;
      }
    }
    if (o.type === 'rock') {
      // Stenen är en rundad kupol: landa på den och åk över. Kör du in i den från sidan kraschar du.
      const R = 1.3 * o.s;
      const dist = Math.sqrt(dx * dx + dd * dd);
      const top = dist < R ? o.h * o.s * Math.sqrt(1 - (dist / R) ** 2) : 0;
      if (p.onRock === o) {
        if (top < 0.08) leaveRock();
        else p.z = top;
        continue;
      }
      if (top <= 0) continue;
      if (p.air && p.vz <= 0 && top > 0.15 && p.z <= top + 0.05 && p.z >= top - 0.45) {
        landOnRock(o, top);
        if (state !== 'playing') return;
        continue;
      }
      if (!p.air && !p.onRock && o.h * o.s < 0.6) {
        // Små stenar rullar man bara över
        p.onRock = o;
        p.z = top;
        continue;
      }
      if (p.invuln <= 0 && !p.onRock && p.z < top - 0.45) {
        crash(o.crash, o);
        return;
      }
      continue;
    }
    if (p.invuln > 0 || p.z >= o.h * o.s) continue;
    if (dx * dx + dd * dd < (o.r * o.s + 0.3) ** 2) {
      crash(o.crash, o);
      return;
    }
  }
}

// ---------- Halfpipe ----------

// På marken i pipen: flyg upp när man når kanten på väg utåt, och vänd om man stannar på väggen
function updatePipe(s) {
  const p = player;
  const side = Math.sign(p.x) || 1;
  const outward = Math.sin(p.angle) * side;
  if (Math.abs(p.x) >= PIPE_COPING - 0.2 && outward > 0.05) {
    // All fart ut mot väggen blir fart rakt upp, resten fortsätter nedför pipen
    const vlat = p.speed * Math.abs(Math.sin(p.angle));
    const vlong = p.speed * Math.cos(p.angle);
    // Lite extra skjuts vid kanten, som när man "pumpar" i pipen
    launch((vlat + 3) * s.jumpPower);
    p.pipeAir = { side, vlat: vlat + 3, a0: p.angle, vz0: p.vz };
    p.angle = 0;
    p.turnVel = 0;
    p.speed = Math.max(3, vlong);
    p.x = side * (PIPE_COPING - 0.05);
  } else if (Math.abs(p.x) > PIPE_FLAT + 0.5 && outward > 0 && p.speed * outward < 1.2) {
    // Orkade inte upp: glid tillbaka ner
    p.angle = -p.angle;
    p.turnVel = 0;
  }
}

function update(dt) {
  const s = stats();
  const p = player;
  if (p.invuln > 0) p.invuln -= dt;
  updateChain(dt);

  run.maxSpeed = Math.max(run.maxSpeed, p.speed);
  if (p.air && !p.smallAir) run.maxAir = Math.max(run.maxAir, p.z);
  if (p.grind) {
    updateGrind(dt, s);
  } else {
    if (p.air) updateAir(dt, s);
    else updateGround(dt, s);

    const b0 = bumpY(p.x, p.d);
    p.prevD = p.d;
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.d += Math.cos(p.angle) * p.speed * dt;
    const db = bumpY(p.x, p.d) - b0;

    if (p.air) {
      p.vz -= GRAVITY * dt;
      p.z += p.vz * dt - db; // marken under rör sig när man flyger över puckar
      p.maxZ = Math.max(p.maxZ || 0, p.z);
      if (p.z <= 0) land();
    } else if (db < -0.6 && !p.onRock) {
      // Marken försvann under en (en kant) – fall ner istället för att teleporteras
      p.air = true;
      p.smallAir = true;
      p.z = -db;
      p.vz = 0;
    } else if (inPipe(p.d) && Math.abs(p.x) < PIPE_COPING + 0.3) {
      updatePipe(s);
    } else if (!p.onRock) {
      // Big Air-kickern: lyft när kanten passeras. Skjutsen beror på hur högt upp på kickern man
      // faktiskt var – åker man upp från den låga sidan blir det bara ett litet lyft.
      const kick = features.find((f) => (f.kicker || f.spine) && p.prevD < f.lip && p.d >= f.lip && Math.abs(p.x - f.x) < f.kHalf + f.sideW);
      const kickFrac = kick ? clamp(featureY(p.x, kick.lip - 0.2) / kick.hK, 0, 1) : 0;
      const bvy = db / dt;
      if (kick && kickFrac > 0.35) {
        launch((kick.vz + p.speed * 0.06) * s.jumpPower * Math.pow(kickFrac, 1.5));
        p.slowmo = !!kick.kicker; // slow motion högst upp i Big Air
      }
      // Över ett krön faller marken bort snabbare än tyngdkraften drar ner dig – då lyfter du
      else if ((p.prevBvy || 0) > 2.5 && (p.prevBvy - bvy) / dt > GRAVITY) {
        // Rollers ger riktiga (trixbara) luftfärder, vanliga krön bara små skutt
        const roll = features.some((f) => f.rollers && p.d > f.d0 && p.d < f.d3 && Math.abs(p.x - f.x) < f.half + 1);
        launch(roll ? Math.min(7, p.prevBvy * 0.7) : Math.min(4, p.prevBvy * 0.35), !roll);
      }
      // Plötsliga hopp i marken (t.ex. en kant) räknas inte som fart uppåt
      p.prevBvy = Math.abs(db) > 0.35 ? 0 : bvy;
    }
  }
  if (state !== 'playing') return;

  // Över mållinjen (på marken): stanna och ta liften upp
  if (p.d >= runLength() && !p.air && !p.grind) return finishRun();

  if (course.slalom) {
    checkGates();
    if (state !== 'playing') return;
  }

  // Studsa mot avspärrningsnäten
  const limit = NET_X - 0.7;
  if (!p.grind && Math.abs(p.x) > limit) {
    const side = Math.sign(p.x);
    p.x = side * limit;
    if (Math.sin(p.angle) * side > 0) {
      p.angle = -p.angle * 0.5;
      p.turnVel = 0;
      p.speed *= 0.7;
      const f = feet();
      burst(f.x, f.y + 0.6, f.z, 40, 3, 0.5);
      Sound.bounce();
    }
  }
  if (!p.air && !p.grind && !p.onRock && !p.onRamp) emitCarve(dt, s);
  if (!p.grind) checkCollisions(s);
  if (state !== 'playing') return;

  // Skidspår (inte uppe på stenar)
  if ((p.onRock || p.onRamp) && trail.length && !trail[trail.length - 1].gap) trail.push({ gap: true });
  if (!p.air && !p.grind && !p.onRock && !p.onRamp) {
    const last = trail[trail.length - 1];
    if (!last || last.gap || (p.x - last.x) ** 2 + (p.d - last.d) ** 2 > 0.6) {
      trail.push({ x: p.x, d: p.d, a: p.angle, y: groundY(p.x, p.d) });
      while (trail.length > TRACK_MAX) trail.shift();
      rebuildTracks();
    }
  }

  spawnUntil(p.d + VIEW_AHEAD);
  features = features.filter((f) => f.d3 > p.d - 40);
  objects = objects.filter((o) => {
    const keep = o.dEnd > p.d - 15 && !(o.type === 'star' && o.taken);
    if (!keep) removeObject(o);
    return keep;
  });
}

// ---------- Kraschfysik ----------

// Vid en krasch blir åkaren en enkel fysikkropp: den kastas iväg, roterar, studsar mot snön,
// glider och lägger sig till rätta. Skidorna kan lossna och flyga iväg på egen hand.
const crashBody = {
  active: false, kind: 'trip',
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), angVel: new THREE.Vector3(),
  grounded: false, settle: 0, time: 0, lie: null,
};
const looseSkis = [];
const LIE_FRONT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const LIE_BACK = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpUp = new THREE.Vector3();

function startCrashPhysics(kind, startZ) {
  const p = player;
  const b = crashBody;
  const f = feet();
  const fx = Math.sin(p.angle);
  const fz = -Math.cos(p.angle);
  const v = p.speed;
  const side = Math.random() < 0.5 ? -1 : 1;
  b.active = true;
  b.kind = kind;
  b.grounded = false;
  b.settle = 0;
  b.time = 0;
  b.lie = null;
  b.pos.set(f.x, f.y + startZ + 0.9, f.z);
  b.q.copy(skier.flipG.quaternion);

  if (kind === 'hard') {
    // Rakt in i något: studsar bakåt och faller baklänges
    b.vel.set(-fx * v * 0.12, 1.5, -fz * v * 0.12);
    b.angVel.set(3 + Math.random() * 2, (Math.random() - 0.5) * 2, side * (1 + Math.random() * 2));
  } else if (kind === 'balance') {
    // Ramlar av räcket åt sidan
    const rx = Math.cos(p.angle);
    const rz = Math.sin(p.angle);
    b.vel.set(fx * v * 0.7 + rx * side * 2.5, 1, fz * v * 0.7 + rz * side * 2.5);
    b.angVel.set(-1 - Math.random() * 2, (Math.random() - 0.5) * 3, -side * (4 + Math.random() * 2));
  } else {
    // Snubblar eller landar fel: kastas framåt i en kullerbytta, ofta med lite vridning
    const twist = kind === 'land' ? 3 + Math.random() * 3 : 1 + Math.random() * 2;
    b.vel.set(fx * v * 0.75, 2 + v * 0.1, fz * v * 0.75);
    b.angVel.set(-(4 + v * 0.22 + Math.random() * 2), (Math.random() - 0.5) * 3, side * twist);
  }

  // Skidorna lossnar (båda vid hög fart eller hård smäll, annars ibland en)
  const count = isBoard() ? 0 : kind === 'hard' || v > 14 ? 2 : Math.random() < 0.6 ? 1 : 0;
  const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
  skier.root.updateMatrixWorld(true);
  for (const i of order.slice(0, count)) {
    const board = skier.feet[i].board;
    const mesh = board.clone();
    board.getWorldPosition(mesh.position);
    board.getWorldQuaternion(mesh.quaternion);
    board.visible = false;
    scene.add(mesh);
    looseSkis.push({
      mesh,
      vel: new THREE.Vector3(b.vel.x * 0.9 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, b.vel.z * 0.9 + (Math.random() - 0.5) * 4),
      angVel: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 18),
    });
  }
}

function resetCrash() {
  crashBody.active = false;
  for (const s of looseSkis) scene.remove(s.mesh);
  looseSkis.length = 0;
  applyLook();
}

function rotateBy(q, w, dt) {
  tmpE.set(w.x * dt, w.y * dt, w.z * dt);
  return q.multiply(tmpQ.setFromEuler(tmpE));
}

function stepCrashBody(dt) {
  const b = crashBody;
  b.time += dt;
  b.vel.y -= 13 * dt;
  b.pos.addScaledVector(b.vel, dt);
  rotateBy(b.q, b.angVel, dt);

  // Hur högt kroppens mittpunkt ligger beror på om den står upp eller ligger ner
  tmpUp.set(0, 1, 0).applyQuaternion(b.q);
  const minH = 0.2 + 0.6 * Math.abs(tmpUp.y);
  const d = -b.pos.z;
  const gy = groundY(b.pos.x, d);
  const hSpeed = Math.hypot(b.vel.x, b.vel.z);

  if (b.pos.y < gy + minH) {
    b.pos.y = gy + minH;
    // Marken sjunker när kroppen glider nedför – mät studsen relativt sluttningen
    const groundVy = slopeAt(d) * b.vel.z;
    const relVy = b.vel.y - groundVy;
    if (relVy < -2.5) {
      // Studs: snömoln och förlorad rotation
      b.vel.y = groundVy - relVy * 0.3;
      b.angVel.multiplyScalar(0.65);
      Sound.thud(Math.min(1, -relVy / 8));
      burst(b.pos.x, gy + 0.2, b.pos.z, 40 + Math.round(hSpeed * 3), 3 + hSpeed * 0.15, 0.6);
    } else {
      b.vel.y = Math.max(b.vel.y, groundVy);
    }
    // Friktion mot snön, men backen drar fortfarande lite nedåt
    const fr = Math.max(0, 1 - 1.6 * dt);
    b.vel.x *= fr;
    b.vel.z = b.vel.z * fr - slopeAt(d) * 3 * dt;
    b.angVel.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
    b.grounded = true;
    if (hSpeed > 2 && Math.random() < dt * hSpeed * 6) {
      emit(b.pos.x, gy + 0.1, b.pos.z, b.vel.x * 0.4 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2,
        b.vel.z * 0.4 + (Math.random() - 0.5) * 2, 0.35 + Math.random() * 0.3, 0.6 + Math.random() * 0.4);
    }
  }

  // När farten är nere lägger sig kroppen på mage eller rygg
  if (b.grounded && hSpeed < 4) {
    if (!b.lie) b.lie = Math.abs(b.q.dot(LIE_FRONT)) > Math.abs(b.q.dot(LIE_BACK)) ? LIE_FRONT : LIE_BACK;
    b.q.slerp(b.lie, smooth(2.5, dt));
    b.angVel.multiplyScalar(Math.max(0, 1 - 4 * dt));
    b.settle += dt;
  }
}

function stepLooseSkis(dt) {
  for (const s of looseSkis) {
    s.vel.y -= 13 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    rotateBy(s.mesh.quaternion, s.angVel, dt);
    const d = -s.mesh.position.z;
    const gy = groundY(s.mesh.position.x, d) + 0.05;
    if (s.mesh.position.y < gy) {
      s.mesh.position.y = gy;
      const groundVy = slopeAt(d) * s.vel.z;
      const relVy = s.vel.y - groundVy;
      if (relVy < -2) {
        s.vel.y = groundVy - relVy * 0.35;
        s.angVel.multiplyScalar(0.6);
        burst(s.mesh.position.x, gy, s.mesh.position.z, 8, 2, 0.35);
      } else {
        s.vel.y = Math.max(s.vel.y, groundVy);
      }
      const fr = Math.max(0, 1 - 2 * dt);
      s.vel.x *= fr;
      s.vel.z *= fr;
      s.angVel.multiplyScalar(Math.max(0, 1 - 3 * dt));
      // Lägg skidan platt på snön (behåll riktningen den pekar åt)
      if (Math.hypot(s.vel.x, s.vel.z) < 3) {
        tmpUp.set(0, 0, 1).applyQuaternion(s.mesh.quaternion);
        tmpE.set(-Math.atan(slopeAt(d)), Math.atan2(tmpUp.x, tmpUp.z), 0, 'YXZ');
        s.mesh.quaternion.slerp(tmpQ.setFromEuler(tmpE), smooth(4, dt));
      }
    }
  }
}

function updateCrash(dt) {
  const p = player;
  const b = crashBody;
  stepCrashBody(dt);
  p.x = b.pos.x;
  p.d = -b.pos.z;
  p.z = Math.max(0, b.pos.y - 0.9 - groundY(p.x, p.d));
  p.speed = Math.hypot(b.vel.x, b.vel.z);
  if (b.settle > 1.4 || b.time > 5) endRun();
}

// ---------- Andra åkare i backen ----------

// Enkla åkare som åker sicksack nedför backen. Krock = krasch, men en nära passage ger bonus.
let npcs = [];
const NPC_JACKETS = ['#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#f4511e', '#00acc1', '#e91e63'];
const npcSkinMat = new THREE.MeshLambertMaterial({ color: '#e8b98f' });
const npcPantsMat = new THREE.MeshLambertMaterial({ color: '#263238' });
const npcSkiMat = new THREE.MeshLambertMaterial({ color: '#455a64' });

function makeNpcMesh() {
  const g = new THREE.Group();
  const pivot = new THREE.Group(); // lutar i svängarna och snurrar i volterna (runt höften)
  pivot.position.y = 0.9;
  g.add(pivot);
  const body = new THREE.Group();
  body.position.y = -0.9;
  pivot.add(body);
  const jacket = new THREE.MeshLambertMaterial({ color: NPC_JACKETS[Math.floor(Math.random() * NPC_JACKETS.length)] });
  const helmet = new THREE.MeshLambertMaterial({ color: NPC_JACKETS[Math.floor(Math.random() * NPC_JACKETS.length)] });
  const add = (geo, m, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.09, 0.03, 1.6), npcSkiMat, s * 0.13, 0.02, -0.05);
    add(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), npcPantsMat, s * 0.12, 0.5, 0).rotation.x = -0.25;
  }
  add(new THREE.CapsuleGeometry(0.19, 0.4, 4, 10), jacket, 0, 1.15, -0.08).rotation.x = -0.35;
  add(new THREE.SphereGeometry(0.12, 12, 10), npcSkinMat, 0, 1.6, -0.2);
  add(new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet, 0, 1.62, -0.2);
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.055, 0.45, 4, 8), jacket, s * 0.28, 1.05, -0.25).rotation.x = -0.9;
  scene.add(g);
  return g;
}

// Bottarna åker slalom nerför backen, men siktar ibland på ett hopp eller ett räcke framför sig
function npcFindTarget(n) {
  for (const o of objects) {
    if (n.tried.has(o)) continue;
    const isRamp = o.type === 'ramp';
    if (!isRamp && !isLinear(o)) continue;
    const start = isRamp ? { x: o.x, d: o.d - o.ramp.l - 5 } : pointAt(o, 0);
    const ahead = start.d - n.d;
    if (ahead < 12 || ahead > 45 || Math.abs(start.x - n.x) > ahead * 0.5) continue;
    n.tried.add(o);
    if (Math.random() < 0.75) return { o, x: start.x, d: start.d };
  }
  return null;
}

function npcTakeOff(n, vz, z, trick) {
  const T = (vz + Math.sqrt(vz * vz + 2 * GRAVITY * Math.max(0, z))) / GRAVITY;
  // Flyger i absolut höjd så att marken under (t.ex. en landningsslänt) inte lyfter eller sänker dem
  n.air = { vz, t: 0, T, trick, dir: Math.random() < 0.6 ? 1 : -1, y: groundY(n.x, n.d) + z };
  n.z = z;
}

function moveNpc(n, dt) {
  const pivot = n.mesh.children[0];
  if (n.grind) {
    // På räcket: följ banan, kroppen på tvären
    const g = n.grind;
    g.t += n.v * dt / g.o.len;
    const pt = pointAt(g.o, g.t);
    n.x = pt.x;
    n.d = pt.d;
    n.z = pt.y - groundY(pt.x, pt.d);
    n.mesh.position.set(n.x, pt.y, -n.d);
    n.mesh.rotation.set(0, -pt.a + Math.PI / 2, 0);
    pivot.rotation.set(0, 0, Math.sin(g.t * 20) * 0.08);
    if (g.t >= 1) {
      n.grind = null;
      npcTakeOff(n, 3, n.z, Math.random() < 0.4 ? 'spin' : null);
      n.bx = n.x - n.amp * Math.sin(n.d * n.k + n.phase);
    }
    return;
  }

  n.d += n.v * dt;
  const arg = n.d * n.k + n.phase;
  let slope = n.amp * n.k * Math.cos(arg); // dx/dd: hur snett de åker
  if (!n.air && !n.target) {
    n.z = 0;
    n.target = npcFindTarget(n);
  }
  if (n.target) {
    // Styr mot hindret och släpp slalomen så länge
    const tg = n.target;
    const left = Math.max(0.5, tg.d - n.d);
    const nx = n.x + (tg.x - n.x) * Math.min(1, n.v * dt / left * 1.6);
    slope = (nx - n.x) / Math.max(0.01, n.v * dt);
    n.x = nx;
    const o = tg.o;
    const onRamp = o.type === 'ramp' && Math.abs(n.x - o.x) < o.ramp.w;
    // Kickern stiger jämnt från d - l till kanten vid d + l: åk upp längs ytan och luta med
    if (onRamp && !o.ramp.terrain) {
      const u = (n.d - (o.d - o.ramp.l)) / (2 * o.ramp.l);
      n.z = o.ramp.h * clamp(u, 0, 1);
      n.rampPitch = u > 0 && u < 1 ? Math.atan(o.ramp.h / (2 * o.ramp.l)) : 0;
    }
    if (o.type === 'ramp' && n.d >= o.d + o.ramp.l) {
      n.target = null;
      n.rampPitch = 0;
      if (onRamp) {
        const r = Math.random();
        npcTakeOff(n, o.ramp.vz * 0.8 + 1, o.ramp.terrain ? 0.01 : o.ramp.h, r < 0.55 ? 'flip' : r < 0.85 ? 'spin' : 'grab');
      } else n.z = 0;
      n.bx = n.x - n.amp * Math.sin(n.d * n.k + n.phase);
    } else if (o.type !== 'ramp' && n.d >= tg.d) {
      n.target = null;
      if (Math.abs(n.x - tg.x) < 1.2) {
        n.grind = { o, t: 0 };
        return;
      }
      n.bx = n.x - n.amp * Math.sin(n.d * n.k + n.phase);
    }
  } else if (!n.air) {
    n.x = clamp(n.bx + n.amp * Math.sin(arg), -NET_X + 3, NET_X - 3);
  }

  let flip = 0;
  let spin = 0;
  if (n.air) {
    const a = n.air;
    a.t += dt;
    a.y += a.vz * dt;
    a.vz -= GRAVITY * dt;
    n.z = a.y - groundY(n.x, n.d);
    const u = clamp(a.t / (a.T * 0.85), 0, 1);
    const e = u * u * (3 - 2 * u);
    if (a.trick === 'flip') flip = e * Math.PI * 2 * a.dir;
    if (a.trick === 'spin') spin = e * Math.PI * 2 * a.dir;
    if (n.z <= 0 && a.vz < 0) {
      n.z = 0;
      n.air = null;
      burst(n.x, groundY(n.x, n.d) + 0.1, -n.d, 20, 3, 0.4);
    }
    slope *= 0.2;
  }
  n.mesh.position.set(n.x, groundY(n.x, n.d) + n.z, -n.d);
  n.mesh.rotation.set(-Math.atan(slopeAt(n.d)) * 0.8 + (n.air ? 0 : n.rampPitch || 0), -Math.atan(slope) + spin, 0);
  pivot.rotation.set(flip, 0, clamp(-slope * 0.6, -0.5, 0.5));
  // Grab: böj ihop sig lite i luften
  pivot.scale.y = n.air && n.air.trick === 'grab' ? 0.85 : 1;
}

function clearNpcs() {
  for (const n of npcs) scene.remove(n.mesh);
  npcs = [];
}

function updateNpcs(dt) {
  const p = player;
  // Ny åkare en bit framför dig ibland (inte i halfpipen)
  if (!course.pipe && npcs.length < 5 && Math.random() < dt * 0.3 && p.d < runLength() - 300) {
    const d = p.d + 160 + Math.random() * 60;
    const bx = (Math.random() - 0.5) * (NET_X * 1.3);
    npcs.push({
      d, bx, x: bx, amp: 5 + Math.random() * 8, k: 0.06 + Math.random() * 0.05, phase: Math.random() * 6,
      v: 7 + Math.random() * 5, mesh: makeNpcMesh(), passed: false, z: 0, air: null, grind: null, target: null, tried: new Set(),
    });
  }
  for (const n of npcs) {
    moveNpc(n, dt);

    if (state !== 'playing') continue;
    const dd = n.d - p.d;
    const dx = n.x - p.x;
    // Krock
    if (!n.passed && Math.abs(dd) < 0.9 && Math.abs(dx) < 0.7 && Math.abs(p.z - n.z) < 1.4 && !p.grind && p.invuln <= 0) {
      n.passed = true;
      crash('crash.skier', null, 'hard');
      return;
    }
    // Nära ögat: man passerade riktigt nära utan att krocka
    if (!n.passed && dd < 0 && Math.abs(dx) < 2.2) {
      n.passed = true;
      run.tricks += 20;
      popup(`😮 ${t('npc.close')}`, '+20', '#6a1b9a');
      earnBadge('nearmiss');
      Sound.star();
    } else if (dd < -1.5) {
      n.passed = true;
    }
  }
  // Ta bort åkare som är långt bakom eller vid målet
  npcs = npcs.filter((n) => {
    const keep = n.d > p.d - 40 && n.d < runLength() - 5;
    if (!keep) scene.remove(n.mesh);
    return keep;
  });
}

// ---------- Mål och sittlift ----------

const LIFT_TOP_D = -20;
const liftBottomD = () => runLength() + 25;
const LIFT_H = 11;          // vajerns höjd över marken vid stolparna
const CHAIR_DROP = 2.4;     // stolen hänger under vajern
const CHAIR_SPACING = 24;
const CABLE_OFFSET = 1.6;   // uppåt- och nedåtgående vajer på var sin sida
let finishGroup = null;
let liftGroup = null;
let liftTowersD = [];
let liftChairs = null;
const liftSeat = new THREE.Vector3();
const liftView = { yaw: 0.7, pitch: -0.15 };
const liftDir = new THREE.Vector3();

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const checkerTex = canvasTexture(16, 16, (g) => {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
    g.fillRect(i * 8, j * 8, 8, 8);
  }
});
checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
checkerTex.repeat.set(6, 2);
checkerTex.magFilter = THREE.NearestFilter;

// Målportal med banderoll och en rutig mållinje över hela backens bredd (från nät till nät)
function buildFinish() {
  if (finishGroup) scene.remove(finishGroup);
  finishGroup = new THREE.Group();
  const d = runLength();
  const half = NET_X - 0.5;
  const postMat = new THREE.MeshLambertMaterial({ color: '#c62828' });
  let top = -Infinity;
  for (const sx of [-1, 1]) top = Math.max(top, groundY(sx * half, d));
  for (let x = -half; x <= half + 0.01; x += half) {
    const gy = groundY(x, d);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, top - gy + 8, 10).translate(0, (top - gy + 8) / 2, 0), postMat);
    post.position.set(x, gy - 0.3, -d);
    post.castShadow = true;
    finishGroup.add(post);
  }
  const bannerTex = canvasTexture(2048, 96, (g, w, h) => {
    g.fillStyle = '#c62828';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 24) {
      g.fillStyle = (i / 24) % 2 ? '#111' : '#fff';
      g.fillRect(i, 0, 24, 10);
      g.fillStyle = (i / 24) % 2 ? '#fff' : '#111';
      g.fillRect(i, h - 10, 24, 10);
    }
    g.fillStyle = '#fff';
    g.font = 'bold 54px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let k = 0; k < 4; k++) g.fillText(`🏁 ${t('finish.banner')} 🏁`, (k + 0.5) * w / 4, h / 2 + 3);
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 3.5), new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide }));
  banner.position.set(0, top + 6.5, -d);
  finishGroup.add(banner);
  // Mållinjen i bitar som följer snön
  const lineMat = new THREE.MeshLambertMaterial({ map: checkerTex, polygonOffset: true, polygonOffsetFactor: -4 });
  for (let x = -half; x < half; x += 5) {
    const cx = x + 2.5;
    const tilt = new THREE.Group();
    tilt.position.set(cx, groundY(cx, d) + 0.06, -d);
    tilt.rotation.set(-Math.atan(slopeAt(d)), 0, Math.atan((groundY(cx + 2.5, d) - groundY(cx - 2.5, d)) / 5));
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(5.05, 1.6), lineMat);
    seg.rotation.x = -Math.PI / 2;
    tilt.add(seg);
    finishGroup.add(tilt);
  }
  scene.add(finishGroup);
}

// Vajerns höjd vid sträckan d (rakt mellan stolparnas toppar)
function cableY(d) {
  const ts = liftTowersD;
  let i = 0;
  while (i < ts.length - 2 && ts[i + 1] < d) i++;
  const a = ts[i];
  const b = ts[i + 1];
  const u = clamp((d - a) / (b - a), 0, 1);
  const ya = groundY(LIFT_X, a) + LIFT_H;
  const yb = groundY(LIFT_X, b) + LIFT_H;
  return ya + (yb - ya) * u;
}

const chairGeo = buildGeometry([
  { geo: new THREE.CylinderGeometry(0.04, 0.04, CHAIR_DROP, 6), matrix: m4().makeTranslation(0, CHAIR_DROP / 2 + 0.6, 0.3), color: C('#37474f') },
  { geo: new THREE.BoxGeometry(1.5, 0.08, 0.55), matrix: m4().makeTranslation(0, 0, 0), color: C('#1e5aa8') },
  { geo: new THREE.BoxGeometry(1.5, 0.6, 0.07), matrix: m4().makeRotationX(-0.15).setPosition(0, 0.32, 0.3), color: C('#1e5aa8') },
  { geo: new THREE.BoxGeometry(0.05, 0.6, 0.05), matrix: m4().makeTranslation(-0.75, 0.3, 0.3), color: C('#37474f') },
  { geo: new THREE.BoxGeometry(0.05, 0.6, 0.05), matrix: m4().makeTranslation(0.75, 0.3, 0.3), color: C('#37474f') },
  { geo: new THREE.BoxGeometry(1.5, 0.04, 0.04), matrix: m4().makeTranslation(0, 0.55, -0.45), color: C('#cfd8dc') }, // säkerhetsbygel
  { geo: new THREE.BoxGeometry(0.04, 0.5, 0.04), matrix: m4().makeTranslation(0.75, 0.6, -0.1).multiply(m4().makeRotationX(0.9)), color: C('#cfd8dc') },
]);
const cableGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);

function buildLift() {
  if (liftGroup) scene.remove(liftGroup);
  liftGroup = new THREE.Group();
  liftTowersD = [];
  for (let d = LIFT_TOP_D; d < liftBottomD(); d += 70) liftTowersD.push(d);
  liftTowersD.push(liftBottomD());
  const towerMat = new THREE.MeshLambertMaterial({ color: '#90a4ae' });
  const cableMat = new THREE.MeshLambertMaterial({ color: '#263238' });
  for (const d of liftTowersD) {
    const gy = groundY(LIFT_X, d);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, LIFT_H + 1, 10).translate(0, (LIFT_H + 1) / 2, 0), towerMat);
    tower.position.set(LIFT_X, gy - 1, -d);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(CABLE_OFFSET * 2 + 0.8, 0.3, 0.4), towerMat);
    arm.position.set(LIFT_X, gy + LIFT_H + 0.2, -d);
    tower.castShadow = arm.castShadow = true;
    liftGroup.add(tower, arm);
  }
  // Vajrar mellan stolparna
  for (let i = 0; i < liftTowersD.length - 1; i++) {
    for (const off of [-CABLE_OFFSET, CABLE_OFFSET]) {
      const a = new THREE.Vector3(LIFT_X + off, groundY(LIFT_X, liftTowersD[i]) + LIFT_H, -liftTowersD[i]);
      const b = new THREE.Vector3(LIFT_X + off, groundY(LIFT_X, liftTowersD[i + 1]) + LIFT_H, -liftTowersD[i + 1]);
      const cable = new THREE.Mesh(cableGeo, cableMat);
      cable.position.copy(a);
      cable.lookAt(b);
      cable.scale.z = a.distanceTo(b);
      liftGroup.add(cable);
    }
  }
  // Stationer i båda ändar
  const wallMat = new THREE.MeshLambertMaterial({ color: '#8d6e63' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#b71c1c' });
  for (const d of [LIFT_TOP_D - 6, liftBottomD() + 6]) {
    const gy = groundY(LIFT_X, d);
    const house = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 8).translate(0, 2.5, 0), wallMat);
    house.position.set(LIFT_X, gy - 0.3, -d);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 4).rotateY(Math.PI / 4).translate(0, 6.2, 0), roofMat);
    roof.position.copy(house.position);
    house.castShadow = roof.castShadow = true;
    liftGroup.add(house, roof);
  }
  // Stolar på hela vajerslingan (InstancedMesh = ett draw call)
  const loop = 2 * (liftBottomD() - LIFT_TOP_D);
  liftChairs = new THREE.InstancedMesh(chairGeo, objMat, Math.ceil(loop / CHAIR_SPACING));
  liftChairs.castShadow = true;
  liftChairs.frustumCulled = false;
  liftGroup.add(liftChairs);
  scene.add(liftGroup);
}

// Flyttar alla stolar längs vajern; spelarens stol (nr 0) startar nere vid målet
function positionChairs(tLift) {
  const len = liftBottomD() - LIFT_TOP_D;
  const speed = len / LIFT_TIME;
  const n = liftChairs.count;
  for (let k = 0; k < n; k++) {
    const sPos = (((k * CHAIR_SPACING + tLift * speed) % (2 * len)) + 2 * len) % (2 * len);
    const up = sPos < len;
    const d = up ? liftBottomD() - sPos : LIFT_TOP_D + (sPos - len);
    const x = LIFT_X + (up ? CABLE_OFFSET : -CABLE_OFFSET);
    dummy.position.set(x, cableY(d) - CHAIR_DROP - 0.6, -d);
    dummy.rotation.set(0, up ? Math.PI : 0, 0); // man sitter vänd åt det håll stolen åker
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    liftChairs.setMatrixAt(k, dummy.matrix);
    if (k === 0) liftSeat.set(x, dummy.position.y + 0.05, -d);
  }
  liftChairs.instanceMatrix.needsUpdate = true;
}

function finishRun() {
  const p = player;
  state = 'finish';
  p.finishT = 0;
  finishCombo();
  const res = recordRun();
  p.finishRes = res;
  popup(`🏁 ${t('finish.title')}`, `+${fmt(res.total)}`, '#2e7d32');
  Sound.combo(5);
  // Resultatet visas i liftrutan
  const rank = rankText();
  $('lift-result').textContent = `${t('lift.result', { dist: fmt(res.dist), pts: fmt(res.total) })}${res.record ? ` · ${t('go.record')}` : ''}${rank ? ` · ${rank}` : ''}`;
}

// Efter mållinjen: hockeystopp, sedan till liften
function updateFinish(dt) {
  const p = player;
  p.finishT += dt;
  p.braking = 1;
  p.turnVel = 0;
  p.angle *= Math.max(0, 1 - 2 * dt);
  p.speed = Math.max(0, p.speed - 14 * dt);
  p.x += Math.sin(p.angle) * p.speed * dt;
  p.d += Math.cos(p.angle) * p.speed * dt;
  if (p.speed > 1) emitCarve(dt, stats());
  if (p.finishT > 2.6) {
    // Liften kan stängas av i inställningarna – då visas resultatet direkt
    if (save.lift !== false) startLift();
    else showResults(p.finishRes, t('finish.title'), '');
  }
}

function startLift() {
  const p = player;
  state = 'lift';
  Object.assign(p, { air: false, grind: null, z: 0, speed: 0, braking: 0, turnVel: 0, twist: 0, liftT: 0 });
  trail = [];
  rebuildTracks();
  // Fyll hela backen så att utsikten från liften blir fin
  clearNpcs();
  objects.forEach(removeObject);
  objects = [];
  features = [];
  calmZones = [];
  nextSpawnD = 20;
  nextGateD = 60;
  gateSide = 1;
  lastGate = null;
  spawnUntil(runLength());
  buildLift();
  positionChairs(0);
  liftView.yaw = 0.7;
  liftView.pitch = -0.15;
  // Längre sikt från liften
  scene.fog.near = save.night ? 40 : 140;
  scene.fog.far = save.night ? 300 : 460;
  terrainKey = '';
  netStart = null;
  wasMenu = true;
  $('popups').innerHTML = '';
  $('hud').classList.add('hidden');
  $('lift-hud').classList.remove('hidden');
}

function updateLift(dt) {
  const p = player;
  p.liftT += dt;
  // Titta runt med piltangenterna
  const r = 1.4 * dt;
  if (isLeft()) liftView.yaw += r;
  if (isRight()) liftView.yaw -= r;
  if (keys.has('ArrowUp') || keys.has('KeyW')) liftView.pitch += r * 0.7;
  if (isDown()) liftView.pitch -= r * 0.7;
  liftView.pitch = clamp(liftView.pitch, -1.2, 0.9);
  positionChairs(p.liftT);
  p.x = liftSeat.x;
  p.d = -liftSeat.z;
  const left = Math.max(0, Math.ceil(LIFT_TIME - p.liftT));
  setText('lift-time', t('lift.left', { s: `0:${String(left).padStart(2, '0')}` }));
  $('lift-progress').style.width = `${clamp(p.liftT / LIFT_TIME, 0, 1) * 100}%`;
  if (p.liftT >= LIFT_TIME) endLift();
}

function endLift() {
  if (liftGroup) scene.remove(liftGroup);
  liftGroup = null;
  $('lift-hud').classList.add('hidden');
  applyTime(); // återställ dimman
  resetWorld();
  showMenu();
}

// Musen: dra för att titta runt i liften
renderer.domElement.addEventListener('pointermove', (e) => {
  if (state !== 'lift' || !(e.buttons & 1)) return;
  liftView.yaw -= e.movementX * 0.005;
  liftView.pitch = clamp(liftView.pitch - e.movementY * 0.004, -1.2, 0.9);
});

// ---------- Uppdatera 3D-scenen ----------

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpJ = new THREE.Vector3();
const KNEE_HINT = [new THREE.Vector3(-0.12, 0, -1), new THREE.Vector3(0.12, 0, -1)];
const ELBOW_HINT = [new THREE.Vector3(-0.6, -0.4, 0.5), new THREE.Vector3(0.6, -0.4, 0.5)];
const shoulders = [new THREE.Vector3(), new THREE.Vector3()];
const ANKLE = new THREE.Vector3(0, 0.3, 0.02);
const DOWN = new THREE.Vector3(0, -1, 0);
const KNEE_HINT_BOARD = [new THREE.Vector3(1, 0, -0.3), new THREE.Vector3(1, 0, 0.3)];

function updateSkierModel(dt, time) {
  const p = player;
  const m = skier;
  const f = feet();
  const crashed = crashBody.active;
  const seated = state === 'lift';
  const air = p.air && !p.smallAir; // små luftskutt från puckar räknas som vanlig åkning
  const carve = air || p.grind || crashed || seated ? 0 : clamp(p.turnVel / stats().turnRate, -1, 1) * Math.min(1, p.speed / 10);

  m.root.visible = seated || !(p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0);
  if (seated) {
    // Sitter i stolen vänd uppför (höfterna på sitsen)
    m.root.position.copy(liftSeat).y -= 0.5;
    m.root.rotation.set(0, 0, 0);
    m.heading.rotation.y = Math.PI;
    m.spinG.rotation.y = 0;
    m.flipG.rotation.set(0, 0, 0);
    p.facingVis = p.facing;
  } else if (crashed) {
    m.root.position.copy(crashBody.pos).y -= 0.9;
    m.root.rotation.x = 0;
    m.flipG.quaternion.copy(crashBody.q);
  } else {
    m.root.position.set(f.x, f.y + p.z, f.z);
    m.root.rotation.x = -Math.atan(slopeAt(p.d)) * 0.8;
    // Luta med halfpipe-väggen (mjukt, så att det inte rycker vid kanten)
    const rollTarget = pipeEnv(p.d) > 0 && !air ? Math.atan((pipeY(p.x + 0.25, p.d) - pipeY(p.x - 0.25, p.d)) / 0.5) * 0.9 : 0;
    m.root.rotation.z += (rollTarget - m.root.rotation.z) * smooth(10, dt);
    if (p.pipeAir) {
      // Vrid mjukt i luften: upp med blicken mot väggen, ner mot pipen igen
      const prog = clamp((p.pipeAir.vz0 - p.vz) / (2 * p.pipeAir.vz0), 0, 1);
      m.heading.rotation.y = -p.pipeAir.a0 * Math.cos(prog * Math.PI);
    } else {
      m.heading.rotation.y = -p.angle;
    }

    // Åkriktning (fram/bak) + snurr + hur skidorna står (tvärs vid rail-slide och hockeybroms)
    p.facingVis += (p.facing - p.facingVis) * smooth(9, dt);
    const twistTarget = p.grind ? p.grind.twist : p.braking * 1.1;
    p.twist += (twistTarget - p.twist) * smooth(10, dt);
    m.spinG.rotation.y = -(p.spin + p.facingVis + p.twist);

    // Lutning in i svängen (hela kroppen + skidorna på kant)
    const leanTarget = p.grind ? -p.balance * 0.7 : -carve * 0.6;
    p.lean += (leanTarget - p.lean) * smooth(7, dt);
    p.stumble = Math.max(0, (p.stumble || 0) - dt * 1.4);
    const wobble = Math.sin(time * 22) * 0.35 * p.stumble;
    m.flipG.rotation.set(p.flipping ? p.flipDir * p.flipProg * Math.PI * 2 : -p.stumble * 0.5, 0, p.lean + wobble);
  }

  const grab = !crashed && !seated && air && isGrab();
  const grabId = grab ? currentGrab().id : null;
  const tuck = !crashed && !seated && !air && !p.grind && isTuck();
  p.squash = Math.max(0, p.squash - dt * 3);

  // Benen fjädrar i gupp: titta på hur backen kröker sig under åkaren
  let absorb = 0;
  if (!air && !p.grind && !crashed && !seated) {
    const fx = Math.sin(p.angle) * 1.5;
    const fd = Math.cos(p.angle) * 1.5;
    const curv = groundY(p.x + fx, p.d + fd) + groundY(p.x - fx, p.d - fd) - 2 * f.y;
    absorb = clamp(-curv * 2.5, -0.2, 0.2);
  }

  // Pose-mål
  const pose = m.pose;
  const board = isBoard();
  // Snowboard: positivt "toe" = tåsväng (mot bröstet), negativt = hälsväng
  const toe = board ? carve * (isSwitch() ? -1 : 1) : 0;
  const onSnow = !air && !p.grind && !crashed && !seated;
  let hipY = 0.9;
  let lift = 0;
  let pitch = -0.3;
  if (board) {
    // Tåsväng: böj fram över tårna. Hälsväng: sitt bak med lägre höfter och upprätt överkropp.
    hipY = 0.82 - 0.04 * Math.abs(toe) - (toe < 0 ? 0.07 * -toe : 0);
    pitch = -0.3 - (toe > 0 ? 0.15 : 0.2) * toe;
  }
  if (tuck) { hipY = 0.62; pitch = board ? -0.75 : -1.0; }
  if (p.braking > 0.3) { hipY = board ? 0.72 : 0.78; pitch = 0.0; }
  if (air) { hipY = board ? 0.76 : 0.82; lift = board ? 0.1 : 0; pitch = -0.35; }
  if (grab) { hipY = 0.72; lift = 0.42; pitch = -0.8; }
  if (p.grind) { hipY = 0.74; pitch = -0.3; }
  if (seated) { hipY = 0.5; lift = 0; pitch = 0.05; }
  if (crashed) {
    const flail = crashBody.lie ? 0 : 1;
    hipY = 0.86;
    pitch = -0.2 + Math.sin(time * 9) * 0.5 * flail;
  }
  hipY -= p.squash * (board ? 0.32 : 0.25) + Math.abs(carve) * 0.08 - absorb;
  if (onSnow) hipY += Math.sin(time * 2.3) * 0.012; // liten fjädring, aldrig helt stilla
  const k = smooth(grab ? 9 : 12, dt);
  pose.hipY += (hipY - pose.hipY) * k;
  pose.lift += (lift - pose.lift) * k;
  pose.pitch += (pitch - pose.pitch) * k;
  pose.tweak += ((grab ? 1 : 0) - pose.tweak) * smooth(6, dt);
  // Höfterna skjuts mot tårna i tåsväng och bakåt mot hälkanten i hälsväng
  const hipXTarget = board && onSnow ? (toe > 0 ? 0.08 : 0.12) * toe : 0;
  pose.hipX = (pose.hipX || 0) + (hipXTarget - (pose.hipX || 0)) * smooth(8, dt);

  if (p.highfive && (p.highfive.t -= dt) <= 0) p.highfive = null;
  m.snowboard.position.set(0, pose.lift, 0);
  m.snowboard.rotation.set(0.15 * pose.tweak, 0, -0.35 * pose.tweak);
  if (seated) {
    // I liften hänger brädan på tvären framför stolen
    m.snowboard.position.set(0, 0.12, -0.45);
    m.snowboard.rotation.set(0, Math.PI / 2, 0);
  }

  // Fötter: innerskidan lite före i svängen, "tweak" vid grab, isär vid krasch.
  // På snowboard står fötterna på tvären på brädan (vänster fot fram).
  m.feet.forEach(({ foot }, i) => {
    const s = i ? 1 : -1;
    if (seated) {
      // Benen hänger, skidorna/brädan framför stolen
      foot.position.set(s * (board ? 0.24 : 0.14), 0.12, -0.45);
      foot.rotation.set(board ? 0 : -0.3, board ? s * 0.25 : 0, 0);
    } else if (board) {
      foot.position.set(0, pose.lift, s * 0.24);
      foot.rotation.set(0.15 * pose.tweak, Math.PI / 2 + s * 0.25, -0.35 * pose.tweak);
    } else if (crashed) {
      const flail = crashBody.lie ? 0.3 : 1;
      foot.position.set(s * (0.2 + 0.08 * flail), 0.05 + Math.max(0, Math.sin(time * 11 + i * 2)) * 0.25 * flail, Math.sin(time * 8 + i * 3) * 0.25 * flail);
      foot.rotation.set(Math.sin(time * 7 + i) * 0.5 * flail, s * 0.4, s * 0.3);
    } else {
      const inside = Math.sign(carve) === s ? 1 : -1;
      foot.position.set(s * 0.13, pose.lift, -inside * Math.abs(carve) * 0.09);
      foot.rotation.set(0.2 * pose.tweak, 0.25 * pose.tweak, -0.5 * pose.tweak);
    }
    foot.updateMatrix();
  });

  // Bäcken och överkropp: angulation (överkroppen mer upprätt än benen) och kontrarotation
  m.pelvis.position.set(pose.hipX, pose.hipY, 0);
  // Vid grind/broms står skidorna snett men överkroppen vrids tillbaka mot färdriktningen
  const counter = crashed ? 0 : p.twist;
  // Snowboardåkaren står på sidan (bröstet mot tåkanten) men tittar nedför backen
  const side = board && !seated ? -Math.PI / 2 : 0;
  m.pelvis.rotation.set(0, side * 0.95 + carve * 0.15 + counter * 0.3, Math.PI / 2);
  m.upper.position.set(pose.hipX, pose.hipY, 0);
  // YXZ: först vridning, sedan framåtböj runt kroppens egen axel (för snowboard = mot tårna)
  m.upper.rotation.order = 'YXZ';
  m.head.rotation.order = 'YXZ';
  // Switch: kroppen står kvar på brädan/skidorna men vrids och tittar i färdriktningen (mjuk övergång)
  p.swBlend = (p.swBlend || 0) + ((isSwitch() && !crashed && !seated ? 1 : 0) - (p.swBlend || 0)) * smooth(6, dt);
  const sw = p.swBlend;
  const cs = 1 - 2 * sw; // vrid åt andra hållet i svängar när man åker switch
  if (board && !seated) {
    // Bröstet mot tåkanten i båda fallen, men överkropp och huvud vänds mot färdriktningen
    const upperYaw = side * 0.75 + (-Math.PI - 2 * side * 0.75) * sw; // switch: -π − side·0,75
    const headYaw = -side * 0.65 * cs;
    m.upper.rotation.set(pose.pitch, upperYaw + (carve * 0.4 + counter * 0.6) * cs, 0);
    m.head.rotation.set(-pose.pitch * 0.5, headYaw + (-carve * 0.7 + counter * 0.3) * cs, 0);
  } else {
    // Skidor switch: titta bakåt över axeln
    m.upper.rotation.set(pose.pitch, carve * 0.3 + counter * 0.6 + sw * 0.5, -p.lean * 0.55 * (crashed ? 0 : 1));
    m.head.rotation.set(-pose.pitch * 0.4, -carve * 0.25 + counter * 0.3 + sw * 1.3, p.lean * 0.3);
  }
  m.upper.updateMatrix();

  // Ben: höft → knä → fotled
  m.legs.forEach((leg, i) => {
    const s = i ? 1 : -1;
    if (board && !seated) tmpA.set(pose.hipX, pose.hipY - 0.02, s * 0.12);
    else tmpA.set(s * 0.1, pose.hipY - 0.02, 0);
    tmpB.copy(ANKLE).applyMatrix4(m.feet[i].foot.matrix);
    ik2(tmpA, tmpB, THIGH, SHIN, board && !seated ? KNEE_HINT_BOARD[i] : KNEE_HINT[i], tmpJ);
    placeLimb(leg.thigh, tmpA, tmpJ);
    placeLimb(leg.shin, tmpJ, tmpB);
  });

  // Armar: axel → armbåge → hand
  [-1, 1].forEach((s, i) => shoulders[i].set(s * 0.22, 0.49, 0).applyMatrix4(m.upper.matrix));
  const handTarget = (i) => {
    const s = i ? 1 : -1;
    const sh = shoulders[i];
    if (seated) return tmpA.set(sh.x * 0.6, sh.y - 0.32, sh.z - 0.3); // händerna i knät
    if (crashed) {
      if (crashBody.lie) return tmpA.set(sh.x + s * 0.5, sh.y + 0.1, sh.z - 0.1);   // utsträckt i snön
      return tmpA.set(sh.x + s * 0.4, sh.y + Math.sin(time * 13 + i * 2) * 0.4, sh.z + Math.cos(time * 11 + i) * 0.35);
    }
    if (p.highfive && i === (board ? 0 : p.highfive.right ? 1 : 0)) {
      const out = p.highfive.right ? 1 : -1;
      return tmpA.set(sh.x + out * 0.35, sh.y + 0.45, sh.z - 0.1);             // high five!
    }
    if (board) {
      const zs = p.swBlend > 0.5 ? -1 : 1; // färdriktningen längs brädan
      if (grab) {
        const gb = grabId;
        if (gb === 'indy' && i === 1) return tmpA.set(0.15, pose.lift + 0.06, 0.04);          // bakre handen på tåkanten
        if (gb === 'mute' && i === 0) return tmpA.set(0.15, pose.lift + 0.06, -0.22 * zs);    // främre handen på tåkanten
        if (gb === 'japan' && i === 0) return tmpA.set(-0.1, pose.lift + 0.08, -0.3 * zs);    // främre handen bakom, på hälkanten
        if (gb === 'tail' && i === 1) return tmpA.set(0, pose.lift + 0.05, 0.62 * zs);        // bakre handen på tailen
        if (gb === 'chinese') return tmpA.set(0.1, pose.lift + 0.05, (i ? 0.6 : -0.6) * zs); // nose och tail samtidigt
      }
      if (grab) return tmpA.set(sh.x + 0.1, sh.y + 0.2, sh.z - 0.45 * zs);
      const sway = Math.sin(time * 1.6 + i * 1.3) * 0.03;
      // Förstapersonsvy: håll armarna ut åt tåsidan så att brädan syns
      if (save.fpv && !air && !p.grind) return i ? tmpA.set(sh.x + 0.2, sh.y - 0.55 + sway, sh.z + 0.3 * zs) : tmpA.set(sh.x + 0.28, sh.y - 0.55 + sway, sh.z - 0.22 * zs);
      if (p.grind || air) return tmpA.set(sh.x + 0.05, sh.y - 0.05 + sway, sh.z + s * 0.5);
      if (tuck) return tmpA.set(sh.x + 0.25, sh.y - 0.45, sh.z + s * 0.12);
      // Främre armen leder, bakre följer. Tåsväng: händerna ner mot tårna. Hälsväng: upp och fram för balans.
      const heel = Math.max(0, -toe);
      const toes = Math.max(0, toe);
      return i === 0
        ? tmpA.set(sh.x + 0.2 + 0.12 * toes + 0.15 * heel, sh.y - 0.27 - 0.1 * toes + 0.12 * heel + sway, sh.z - 0.25 * zs)
        : tmpA.set(sh.x + 0.12 + 0.1 * toes + 0.15 * heel, sh.y - 0.38 - 0.06 * toes + 0.1 * heel + sway, sh.z + 0.14 * zs);
    }
    if (grab) {
      const gb = grabId;
      if (gb === 'indy' && i === 1) return tmpA.set(0.25, pose.lift + 0.1, -0.24);     // höger hand på höger skida
      if (gb === 'mute' && i === 0) return tmpA.set(0.22, pose.lift + 0.12, -0.5);     // vänster hand korsar till höger skida
      if (gb === 'japan' && i === 0) return tmpA.set(-0.05, pose.lift + 0.14, -0.4);   // knäna upp, skidorna dras bakåt
      if (gb === 'tail' && i === 1) return tmpA.set(0.2, pose.lift + 0.08, 0.55);      // bakänden på skidan
      if (gb === 'chinese') return tmpA.set(i ? 0.22 : -0.22, pose.lift + 0.08, 0.5); // båda händerna bak på skidorna
      return tmpA.set(sh.x + (i ? 0.5 : -0.5), sh.y + 0.2, sh.z + 0.1);                // andra armen ut för balans
    }
    if (p.grind || air || p.stumble > 0.2) return tmpA.set(sh.x + s * 0.5, sh.y - 0.05, sh.z);
    if (tuck) return tmpA.set(s * 0.12, sh.y - 0.25, sh.z - 0.42);              // händerna framför knäna
    // I förstapersonsvy: händerna framför kroppen så att de syns i bild
    if (save.fpv && !crashed) return tmpA.set(sh.x + s * 0.2, sh.y - 0.34, sh.z - 0.5);
    // Avslappnat framför kroppen; innerhanden lite längre fram i svängen
    const inside = Math.sign(carve) === s ? Math.abs(carve) : 0;
    return tmpA.set(sh.x + s * 0.2, sh.y - 0.4 + inside * 0.08, sh.z - 0.3 - inside * 0.15);
  };
  m.arms.forEach((arm, i) => {
    pose.hands[i].lerp(handTarget(i), smooth(crashed ? 20 : 14, dt));
    const sh = shoulders[i];
    ik2(sh, pose.hands[i], UPPER_ARM, FOREARM, ELBOW_HINT[i], tmpJ);
    placeLimb(arm.upper, sh, tmpJ);
    tmpB.copy(pose.hands[i]).sub(tmpJ);
    if (tmpB.length() > FOREARM) tmpB.setLength(FOREARM);
    tmpB.add(tmpJ);
    placeLimb(arm.fore, tmpJ, tmpB);
    arm.hand.position.copy(tmpB);
    arm.hand.quaternion.copy(arm.fore.quaternion);

    // Staven: från handen mot en spets som beror på hur man åker
    const pole = m.poles[i];
    if (pole.visible) {
      const s = i ? 1 : -1;
      if (crashed) tmpA.set(s * 0.4, -0.6 + Math.sin(time * 9 + i) * 0.4, 0.6);
      else if (tuck) tmpA.set(s * 0.05, -0.3, 1.1);                // under armarna
      else if (air || p.grind) tmpA.set(s * 0.3, -1.0, 0.45);      // ut åt sidorna
      else tmpA.set(s * 0.08 + (Math.sign(carve) === s ? 0.1 : 0), -1.1, 0.35); // bakåt mot snön
      pole.position.copy(tmpB);
      pole.quaternion.setFromUnitVectors(DOWN, tmpA.normalize());
    }
  });
}

// Förstapersonsvy (C): kameran sitter i hjälmen och följer huvudet, som en GoPro
const FPV_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0, 0));
const FPV_TILT_BOARD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0)); // i luften: titta ner mot brädan
const fpvPos = new THREE.Vector3();
const fpvQuat = new THREE.Quaternion();
const fpvMat = new THREE.Matrix4();
const fpvTarget = new THREE.Vector3();
const fpvNose = new THREE.Vector3();
const fpvBoardQuat = new THREE.Quaternion();
const fpvOffset = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const fpvFwd = new THREE.Vector3();
const fpvUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function toggleCamera() {
  save.fpv = !save.fpv;
  persist();
  popup(t(save.fpv ? 'cam.first' : 'cam.third'));
}

function updateFirstPerson(dt, snap) {
  const m = skier;
  m.root.updateMatrixWorld(true);
  m.head.getWorldPosition(fpvPos);
  m.head.getWorldQuaternion(fpvQuat);
  // Lite framför ansiktet (i huvudets egen riktning, inte nedåtblicken – annars hamnar kameran i bröstet)
  // Tåsidan ligger till höger om huvudet när man åker vanligt, till vänster när man åker switch
  camera.position.copy(fpvPos).add(fpvOffset.set(isBoard() ? (isSwitch() ? -0.45 : 0.45) : 0, 0.06, isBoard() ? -0.05 : -0.16).applyQuaternion(fpvQuat));
  fpvQuat.multiply(isBoard() ? FPV_TILT_BOARD : FPV_TILT);
  // På marken: behåll bara en tredjedel av huvudets lutning åt sidan (annars tippar horisonten i svängar).
  // I luften följer kameran huvudet exakt, så att volter och snurr ser ut precis som de är.
  fpvFwd.set(0, 0, -1).applyQuaternion(fpvQuat);
  fpvUp.set(0, 1, 0).applyQuaternion(fpvQuat).lerp(WORLD_UP, 0.65).normalize();
  if (isBoard() && !player.air) {
    // Snowboard: titta framåt längs backen, men tillräckligt nedåt för att brädan syns längst ner
    m.snowboard.getWorldPosition(fpvTarget);
    fpvNose.set(0, 0, -1).applyQuaternion(m.snowboard.getWorldQuaternion(fpvBoardQuat));
    fpvTarget.addScaledVector(fpvNose, isSwitch() ? -2.6 : 2.6).addScaledVector(WORLD_UP, -0.5); // switch: brädans bakände leder
    fpvMat.lookAt(camera.position, fpvTarget, fpvUp);
    fpvQuat.setFromRotationMatrix(fpvMat);
  } else if (!isBoard() && isSwitch() && !player.air) {
    // Skidor switch: titta över axeln åt det håll man åker
    const a = player.angle;
    fpvTarget.copy(camera.position).add(fpvNose.set(Math.sin(a), -0.45, -Math.cos(a)));
    fpvMat.lookAt(camera.position, fpvTarget, WORLD_UP);
    fpvQuat.setFromRotationMatrix(fpvMat);
  } else if (!player.air && Math.abs(fpvFwd.dot(fpvUp)) < 0.98) {
    fpvMat.lookAt(ORIGIN, fpvFwd, fpvUp);
    fpvQuat.setFromRotationMatrix(fpvMat);
  }
  if (snap) camera.quaternion.copy(fpvQuat);
  else camera.quaternion.slerp(fpvQuat, smooth(18, dt));
  const fov = isBoard() ? 96 : 80;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * smooth(6, dt);
    camera.updateProjectionMatrix();
  }
}

let camHeading = 0;
let wasThirdPerson = true;
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const lookCurrent = new THREE.Vector3();

function updateCamera(dt, time, snap = false) {
  const p = player;
  const f = feet();

  if (state === 'intro' || (state === 'menu' && !$('menu').classList.contains('hidden'))) {
    // Långsam svävande kamera som tittar ut över backen och bergen (startskärm och huvudmeny)
    const a = time * 0.06;
    camera.position.set(Math.sin(a) * 26, groundY(0, -15) + 13 + Math.sin(time * 0.25) * 1.5, 15 + Math.cos(a) * 6);
    lookCurrent.set(Math.sin(a * 0.7) * 10, groundY(0, 160) - 6, -160);
    camera.lookAt(lookCurrent);
    if (camera.fov !== 62) {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
    return;
  }

  if (state === 'menu' && !$('characters').classList.contains('hidden')) {
    // Karaktärsval: nära kamera som sakta går runt åkaren, åkaren till vänster om panelen
    skier.head.visible = true;
    skier.upper.visible = true;
    for (const leg of skier.legs) leg.thigh.visible = true;
    for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = true;
    const a = Math.PI + Math.sin(time * 0.35) * 0.9;
    camera.position.set(f.x + Math.sin(a) * 4, f.y + 1.6, f.z + Math.cos(a) * 4);
    lookCurrent.set(f.x, f.y + 0.95, f.z);
    camera.lookAt(lookCurrent);
    const wideScreen = innerWidth > 760;
    if (wideScreen) camera.translateX(1.25);
    camHeading = 0;
    return;
  }

  if (state === 'menu' || state === 'shop') {
    skier.head.visible = true;
    skier.upper.visible = true;
    for (const leg of skier.legs) leg.thigh.visible = true;
    for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = true;
    const a = time * 0.15;
    camera.position.set(f.x + Math.sin(a) * 6, f.y + 2.2, f.z + Math.cos(a) * 6);
    lookCurrent.set(f.x, f.y + 1, f.z);
    camera.lookAt(lookCurrent);
    camHeading = 0;
    return;
  }

  // Sittliften: titta runt fritt (piltangenter/mus), C växlar mellan stolen och vy utifrån
  if (state === 'lift') {
    const fpvLift = save.fpv;
    skier.head.visible = !fpvLift;
    skier.upper.visible = true;
    for (const leg of skier.legs) leg.thigh.visible = true;
    for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = true;
    liftDir.set(Math.sin(liftView.yaw) * Math.cos(liftView.pitch), Math.sin(liftView.pitch), Math.cos(liftView.yaw) * Math.cos(liftView.pitch));
    if (fpvLift) {
      skier.root.updateMatrixWorld(true);
      skier.head.getWorldPosition(camera.position);
      camera.position.y += 0.05;
    } else {
      camera.position.copy(liftSeat).addScaledVector(liftDir, -6.5).y += 1.6;
    }
    lookCurrent.copy(fpvLift ? camera.position : liftSeat).add(liftDir);
    if (!fpvLift) lookCurrent.y += 1;
    camera.lookAt(lookCurrent);
    if (Math.abs(camera.fov - 70) > 0.05) {
      camera.fov = 70;
      camera.updateProjectionMatrix();
    }
    return;
  }

  // Förstapersonsvy (inte vid krasch – då blir det för rörigt)
  const fpv = save.fpv && (state === 'playing' || state === 'paused');
  skier.head.visible = !fpv;
  // Snowboard i förstapersonsvy: axeln sitter vid kameran, så bål, lår och armar skymmer bara
  // (en ensam vante blir en svävande prick) – visa brädan och benen
  const hideBody = fpv && (isBoard() || isSwitch());
  skier.upper.visible = !hideBody;
  for (const leg of skier.legs) leg.thigh.visible = !hideBody;
  for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = !hideBody;
  if (fpv) {
    updateFirstPerson(dt, snap || wasThirdPerson);
    wasThirdPerson = false;
    return;
  }
  if (!wasThirdPerson) snap = true; // tillbaka till vanlig vy: hoppa direkt dit
  wasThirdPerson = true;

  if (inPipe(p.d)) {
    // Kameran står mitt i pipen bakom och ovanför, och siktar på åkaren
    camHeading = 0;
    const camD = p.d - 10;
    const skierY = groundY(p.x, p.d) + p.z;
    camTarget.set(p.x * 0.35, baseY(camD) + 4.5 + Math.max(0, skierY - baseY(p.d) - 5) * 0.5, -camD);
    lookTarget.set(p.x * 0.75, skierY * 0.7 + (baseY(p.d + 6) + 1.5) * 0.3, -(p.d + 3));
    if (snap) {
      camera.position.copy(camTarget);
      lookCurrent.copy(lookTarget);
    } else {
      camera.position.lerp(camTarget, smooth(6, dt));
      lookCurrent.lerp(lookTarget, smooth(8, dt));
    }
    camera.lookAt(lookCurrent);
    if (Math.abs(camera.fov - 66) > 0.05) {
      camera.fov += (66 - camera.fov) * smooth(3, dt);
      camera.updateProjectionMatrix();
    }
    return;
  }
  camHeading += (p.angle * 0.55 - camHeading) * smooth(3, dt);
  const sx = Math.sin(camHeading);
  const cz = Math.cos(camHeading);
  const back = 6;
  const camX = p.x - sx * back;
  const camD = p.d - cz * back;
  camTarget.set(camX, groundY(camX, camD) - mogulY(camX, camD) + 2.2 + p.z * 0.6, -camD);
  const lookD = p.d + cz * 10;
  const lookX = p.x + sx * 10;
  lookTarget.set(lookX, groundY(lookX, lookD) - mogulY(lookX, lookD) + 1 + p.z * 0.5, -lookD);

  if (snap) {
    camera.position.copy(camTarget);
    lookCurrent.copy(lookTarget);
  } else {
    camera.position.lerp(camTarget, smooth(12, dt));
    lookCurrent.lerp(lookTarget, smooth(12, dt));
  }
  camera.lookAt(lookCurrent);

  const fov = 60 + clamp(p.speed, 0, 28) * 0.55;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * smooth(3, dt);
    camera.updateProjectionMatrix();
  }
}

// ---------- Kvällsläge: mörk himmel, stjärnor och belysta backar ----------

const NIGHT_FOG = '#16233a';
const nightSky = makeSky('#02060f', '#0a1730', NIGHT_FOG);
const POLE_STEP = 16;          // en stolpe var 16:e meter, varannan sida
const POLE_X = NET_X - 4;
const POLE_H = 11;
const LAMP_COUNT = 6;          // så många lampor lyser på riktigt (närmast åkaren)
const LAMP_INTENSITY = 2600;

// Stjärnhimmel som följer kameran
const stars = (() => {
  const pos = [];
  for (let i = 0; i < 1800; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.asin(Math.random()) * 0.95 + 0.03;
    pos.push(Math.cos(a) * Math.cos(e) * 1800, Math.sin(e) * 1800, Math.sin(a) * Math.cos(e) * 1800);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  pts.visible = false;
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
})();

// Belysningsstolpar längs kanterna: stolpe, arm, lampa, ljussken och en svag ljuskägla
const lampGlowMat = new THREE.SpriteMaterial({ map: dotTex, color: '#ffd59a', blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const coneMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const poleMat = new THREE.MeshLambertMaterial({ color: '#3a4450' });
const lampHeadMat = new THREE.MeshBasicMaterial({ color: '#fff1d6' });
const poleGroup = new THREE.Group();
poleGroup.visible = false;
scene.add(poleGroup);
const poles = Array.from({ length: 18 }, () => {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, POLE_H, 8).translate(0, POLE_H / 2, 0), poleMat);
  pole.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12).translate(1.2, POLE_H, 0), poleMat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5).translate(2.2, POLE_H - 0.15, 0), lampHeadMat);
  const glow = new THREE.Sprite(lampGlowMat);
  glow.position.set(2.2, POLE_H - 0.4, 0);
  glow.scale.setScalar(4);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7, POLE_H, 20, 1, true).translate(0, POLE_H / 2, 0), coneMat);
  cone.position.set(2.2, -0.3, 0);
  g.add(pole, arm, head, glow, cone);
  poleGroup.add(g);
  return g;
});
// Stolpe nr k: sida och läge längs backen
const poleInfo = (k) => ({ side: k % 2 ? 1 : -1, d: k * POLE_STEP });

const lamps = Array.from({ length: LAMP_COUNT }, () => {
  const l = new THREE.SpotLight('#ffd7a0', 0, 80, 0.95, 0.6, 2);
  return l;
});
const playerLight = new THREE.PointLight('#cfe0ff', 0, 16, 2);

function updateLamps() {
  if (!save.night) return;
  const p = player;
  const first = Math.floor((p.d - 40) / POLE_STEP);
  poles.forEach((g, i) => {
    const { side, d } = poleInfo(first + i);
    const x = side * POLE_X;
    g.position.set(x, groundY(x, d), -d);
    g.rotation.y = side > 0 ? Math.PI : 0; // armen pekar in mot backen
  });
  const near = Math.floor((p.d - 12) / POLE_STEP);
  lamps.forEach((l, i) => {
    const { side, d } = poleInfo(near + i);
    const x = side * (POLE_X - 2.2);
    const gy = groundY(x, d);
    l.position.set(x, gy + POLE_H - 0.3, -d);
    l.target.position.set(side * (POLE_X - 22), groundY(side * (POLE_X - 22), d + 4), -(d + 4));
  });
  const f = feet();
  playerLight.position.set(f.x, f.y + 4, f.z + 2);
  stars.position.copy(camera.position);
}

function applyTime() {
  const night = !!save.night;
  scene.background = night ? nightSky : daySky;
  scene.fog.color.set(night ? NIGHT_FOG : FOG_COLOR);
  scene.fog.near = night ? 20 : 70;
  scene.fog.far = night ? 200 : VIEW_AHEAD;
  hemi.intensity = night ? 0.3 : 1.3;
  hemi.color.set(night ? '#4a5f8f' : '#dbe9ff');
  hemi.groundColor.set(night ? '#1a2238' : '#f2f5fa');
  sun.intensity = night ? 0.4 : 2.4; // på kvällen: svagt blått månsken
  sun.color.set(night ? '#a8c0ff' : '#fff3e0');
  stars.visible = night;
  poleGroup.visible = night;
  // Lamporna läggs bara till på kvällen (färre ljuskällor = snabbare på dagen)
  for (const l of lamps) {
    if (night) scene.add(l, l.target);
    else scene.remove(l, l.target);
    l.intensity = night ? LAMP_INTENSITY : 0;
  }
  if (night) scene.add(playerLight);
  else scene.remove(playerLight);
  playerLight.intensity = night ? 60 : 0;
  flakes.material.opacity = night ? 0.5 : 0.9;
  sprayMat.uniforms.tint.value = night ? 0.55 : 1;
  renderer.toneMappingExposure = night ? 1.2 : 1.05;
}

function updateWorld(dt, time) {
  const p = player;
  const f = feet();
  // I liften: visa backen bredvid och både upp- och nedåt
  const lifting = state === 'lift';
  updateTerrain(lifting ? -20 : p.x, lifting ? p.d - 140 : p.d);
  updateNets(lifting ? p.d - 150 : p.d);
  updateLamps();
  syncInstances(time);
  updateSkierModel(dt, time);
  if (state !== 'paused') stepLooseSkis(dt);
  sun.position.set(f.x - 30, f.y + 50, f.z + 25);
  sun.target.position.set(f.x, f.y, f.z);
  mountains.position.set(camera.position.x, camera.position.y - 170, camera.position.z);
}

// Skriver bara till sidan när texten faktiskt ändrats (DOM-skrivningar varje bildruta är onödigt dyra)
const hudCache = {};
function setText(id, text) {
  if (hudCache[id] !== text) {
    hudCache[id] = text;
    $(id).textContent = text;
  }
}

function updateHud() {
  updateTouchUi();
  const p = player;
  if (state === 'menu' || state === 'shop' || state === 'lift' || state === 'intro') return;
  setText('hud-dist', `${fmt(Math.min(p.d, runLength()))} / ${fmt(runLength())} m`);
  setText('hud-score', fmt(runScore()));
  setText('hud-speed', `${fmt(p.speed * 3.6)} km/h`);
  setText('hud-lives', p.lives > 0 ? '⛑️'.repeat(p.lives) : '–');
  setText('hud-slope', `${Math.round(Math.atan(slopeAt(p.d)) * 180 / Math.PI)}°`);
  setText('hud-dir', t(isSwitch() ? 'dir.switch' : 'dir.forward'));
  $('hud-gates-wrap').classList.toggle('hidden', !course.slalom);
  if (course.slalom) setText('hud-gates', `${run.gates} ✓ · ${run.missed} ✗`);
  const playing = state === 'playing';
  if (!playing) $('chain').classList.add('hidden');
  $('air-hint').classList.toggle('hidden', !(p.air && !p.smallAir && playing));
  $('balance').classList.toggle('hidden', !(p.grind && playing));
  if (p.grind) $('balance-dot').style.left = `${50 + clamp(p.balance, -1, 1) * 50}%`;
}

// ---------- Pekknappar ----------

// Knapparna låtsas vara tangenter, så att spellogiken är densamma som med tangentbord
function virtualDown(code) {
  if (!keys.has(code)) pressed.add(code);
  keys.add(code);
}

// Grab-knappen: riktningen du håller samtidigt väljer grab (ingen = Indy)
function touchGrabKey() {
  if (keys.has('ArrowLeft')) return 'KeyG';
  if (keys.has('ArrowRight')) return 'KeyR';
  if (keys.has('ArrowUp')) return 'KeyV';
  if (keys.has('ArrowDown')) return 'KeyQ';
  return 'KeyF';
}

const touchHeld = new Map(); // knapp -> tangentkod som hålls nere

function releaseTouch(btn) {
  const code = touchHeld.get(btn);
  if (!code) return;
  touchHeld.delete(btn);
  keys.delete(code);
  btn.classList.remove('on');
}

for (const btn of document.querySelectorAll('#touch-ui [data-key]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init();
    btn.setPointerCapture(e.pointerId);
    const code = btn.dataset.key === 'grab' ? touchGrabKey() : btn.dataset.key;
    touchHeld.set(btn, code);
    btn.classList.add('on');
    virtualDown(code);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => releaseTouch(btn));
}
$('tc-pause').addEventListener('click', () => togglePause());
$('tc-cam').addEventListener('click', () => toggleCamera());
// Inga långtryck-menyer eller dubbeltrycks-zoom på spelytan
document.addEventListener('contextmenu', (e) => { if (TOUCH) e.preventDefault(); });

let touchUiShown = false;
function updateTouchUi() {
  const show = TOUCH && state === 'playing';
  if (show === touchUiShown) return;
  touchUiShown = show;
  $('touch-ui').classList.toggle('hidden', !show);
  if (!show) for (const btn of [...touchHeld.keys()]) releaseTouch(btn);
}

// Mobil: helskärm och liggande läge när man trycker på START (fungerar på Android, iPhone ignorerar det)
function enterMobileFullscreen() {
  if (!TOUCH || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}
$('btn-start').addEventListener('click', enterMobileFullscreen);

// ---------- Huvudloop ----------

let last = performance.now();
let wasMenu = true;

let timeScale = 1;

function frame(now) {
  // rAF-tidsstämpeln kan ligga före performance.now() vid start: negativ dt får posen att skena iväg
  const realDt = clamp((now - last) / 1000, 0, 0.05);
  // Slow motion högst upp i Big Air-hoppen
  const p0 = player;
  const slow = state === 'playing' && p0.slowmo && p0.air && p0.z > 3;
  timeScale += ((slow ? 0.45 : 1) - timeScale) * smooth(slow ? 5 : 8, realDt);
  const dt = realDt * timeScale;
  const time = now / 1000;
  last = now;

  if (state === 'playing') {
    update(dt);
    if (state === 'playing') updateNpcs(dt);
  } else if (state === 'crashing') updateCrash(dt);
  else if (state === 'finish') updateFinish(dt);
  else if (state === 'lift') updateLift(dt);

  const inMenu = state === 'menu' || state === 'shop';
  updateWorld(state === 'paused' ? 0 : dt, time);
  updateCamera(dt, time, wasMenu && !inMenu);
  wasMenu = inMenu;
  if (state !== 'paused') {
    updateDecorParticles(dt);
    updateSpray(dt);
    updateFlakes(dt, time);
  }

  const p = player;
  Sound.update({
    active: state === 'playing' || state === 'finish',
    speed: p.speed,
    carve: Math.abs(p.turnVel) / stats().turnRate,
    braking: p.braking,
    air: (p.air && !p.smallAir) || !!p.onRock,
    grind: p.grind ? p.grind.o.type : null,
  });

  renderer.render(scene, camera);
  updateHud();
  pressed.clear();
  requestAnimationFrame(frame);
}

applyLanguage();
applyTime();
resetWorld();
showIntro();
requestAnimationFrame(frame);
