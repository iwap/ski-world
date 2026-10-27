'use strict';
// Innehåll: uppgraderingar, stilar, karaktärer, rariteter, grabs och badges.

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
// Karaktärer: tre startgubbar, resten får man ur boxen. ab = förmåga (andel extra, t.ex. 0.1 = +10 %).
const CHARACTERS = [
  { id: 'classic', icon: '⛷️', rarity: 'starter', ab: { coins: 0.05 } },
  { id: 'girl',   icon: '👧', rarity: 'starter', ab: { spin: 0.1 }, jacket: '#ec407a', skin: '#f3c9a5', hair: '#8d5a2b', parts: ['hairLong', 'face'], noHelmet: true, noGoggles: true },
  { id: 'boy',    icon: '👦', rarity: 'starter', ab: { flip: 0.1 }, jacket: '#1e88e5', skin: '#c98e66', hair: '#2b1d14', parts: ['hairShort', 'face'], noHelmet: true, noGoggles: true },
  { id: 'pirate', icon: '🏴‍☠️', rarity: 'common', ab: { stars: 0.5 }, jacket: '#6d1b1b', pants: '#d7ccc8', accent: '#c9a227', skin: '#d9a27a', boot: '#3e2723', pack: '#5d4037', parts: ['pirate', 'face'], noHelmet: true, noGoggles: true },
  { id: 'penguin', icon: '🐧', rarity: 'common', ab: { land: 0.25 }, jacket: '#1b1b1b', pants: '#1b1b1b', accent: '#263238', skin: '#1b1b1b', pack: '#263238', boot: '#ff9800', parts: ['penguin'], noHelmet: true, noGoggles: true },
  { id: 'viking', icon: '🪓', rarity: 'common', ab: { speed: 0.05 }, jacket: '#5d4037', pants: '#3e2723', accent: '#a1887f', skin: '#f0c39b', pack: '#795548', boot: '#4e342e', hair: '#e65100', parts: ['viking', 'face'], noHelmet: true, noGoggles: true },
  { id: 'santa',  icon: '🎅', rarity: 'uncommon', ab: { coins: 0.15 }, jacket: '#c62828', pants: '#b71c1c', accent: '#ffffff', pack: '#8d6e4f', boot: '#1b1b1b', parts: ['santa', 'face'], noHelmet: true, noGoggles: true },
  { id: 'ninja',  icon: '🥷', rarity: 'uncommon', ab: { spin: 0.15, flip: 0.15 }, jacket: '#1c1c1c', pants: '#161616', accent: '#b71c1c', skin: '#1c1c1c', pack: '#262626', parts: ['ninja'], noHelmet: true, noGoggles: true },
  { id: 'robot',  icon: '🤖', rarity: 'rare', ab: { grind: 0.4 }, jacket: '#cfd8dc', pants: '#90a4ae', accent: '#37474f', skin: '#90a4ae', pack: '#546e7a', metal: true, parts: ['robot'], noHelmet: true, noGoggles: true },
  { id: 'astronaut', icon: '🧑‍🚀', rarity: 'rare', ab: { air: 0.2 }, jacket: '#eceff1', pants: '#e0e0e0', accent: '#90a4ae', skin: '#f0c39b', pack: '#cfd8dc', boot: '#eceff1', hair: '#4e342e', parts: ['astro', 'face', 'hairShort'], noHelmet: true, noGoggles: true },
  { id: 'alien',  icon: '👽', rarity: 'epic', ab: { spin: 0.25, flip: 0.25, land: 0.3 }, jacket: '#6a1b9a', pants: '#4a148c', accent: '#76ff03', skin: '#7cb342', parts: ['alien'], noHelmet: true, noGoggles: true },
  { id: 'hero',   icon: '🦸', rarity: 'epic', ab: { speed: 0.12, air: 0.1 }, jacket: '#1565c0', pants: '#1565c0', accent: '#c62828', skin: '#f0c39b', pack: '#c62828', boot: '#c62828', hair: '#212121', parts: ['hero', 'face', 'hairShort'], noHelmet: true, noGoggles: true },
  { id: 'goldking', icon: '👑', rarity: 'legendary', ab: { speed: 0.2, tricks: 0.5, spin: 0.3, flip: 0.3, land: 0.5 }, jacket: '#ffd54f', pants: '#f9a825', accent: '#6a1b9a', skin: '#f0c39b', pack: '#6a1b9a', boot: '#ffd54f', hair: '#6d4c41', gold: true, parts: ['crown', 'face', 'kingcape'], noHelmet: true, noGoggles: true },
];
// Boxen: chans per raritet (summa 100) och hur mycket man får tillbaka för en dubblett
const RARITIES = {
  starter:   { chance: 0,  refund: 0,     color: '#90a4ae' },
  common:    { chance: 45, refund: 1500,  color: '#78909c' },
  uncommon:  { chance: 30, refund: 2500,  color: '#43a047' },
  rare:      { chance: 17, refund: 4000,  color: '#1e88e5' },
  epic:      { chance: 7,  refund: 6000,  color: '#8e24aa' },
  legendary: { chance: 1,  refund: 10000, color: '#ffb300' },
};
const BOX_PRICE = 5000;
const ABILITY_KEYS = ['speed', 'spin', 'flip', 'land', 'air', 'tricks', 'coins', 'stars', 'grind', 'lives'];
// Grabs: varsin tangent. Poäng per sekund man håller i.
const GRABS = [
  { id: 'indy',    key: 'KeyF', name: 'Indy grab',    pts: 120 },
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
  { id: 'cork',       cat: 'tricks', icon: '🌀', reward: 800 },
  { id: 'cliff',      cat: 'tricks', icon: '🏔️', reward: 1500 },
  { id: 'roof',       cat: 'tricks', icon: '🛖', reward: 1000 },
  { id: 'highfive',   cat: 'tricks', icon: '✋', reward: 300 },
  { id: 'nearmiss',   cat: 'tricks', icon: '😮', reward: 300 },
  ...['classic', 'park', 'moguls', 'pipe', 'slalom', 'bigair', 'offpiste'].map((c) => ({ id: `course-${c}`, cat: 'courses', course: c, reward: 1000 })),
  { id: 'slalomclean', cat: 'courses', icon: '🎿', reward: 2000 },
  { id: 'diff-easy',   cat: 'diff', diff: 'easy',   icon: '🟢', reward: 500 },
  { id: 'diff-normal', cat: 'diff', diff: 'normal', icon: '🔵', reward: 1000 },
  { id: 'diff-hard',   cat: 'diff', diff: 'hard',   icon: '⚫', reward: 2500 },
  { id: 'hardall',     cat: 'diff', icon: '👑', reward: 10000, goal: Object.keys(COURSES).length },
  { id: 'score5k',     cat: 'diff', icon: '💰', reward: 1000 },
  { id: 'score10k',    cat: 'diff', icon: '💎', reward: 3000 },
];
const BADGE_CATS = ['tricks', 'courses', 'diff'];

const CHAR_DEFAULT = { pants: '#2b3a4a', accent: '#1a2a3a', skin: '#e8b98f', pack: '#3d4650', boot: '#eceff1' };
