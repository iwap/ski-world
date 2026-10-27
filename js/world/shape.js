'use strict';
// Backens form: lutning, puckar, hopp och landningar i terrängen, halfpipe.

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
    if (f.cliff) {
      top = d < f.lip ? f.H * smoothstep(f.d0, f.lip - 4, d) : f.H * (1 - (d - f.lip) / (f.d3 - f.lip));
      h = Math.max(h, top * side);
      continue;
    }
    if (f.bump) {
      // Snöpuck (som en vindkant): konkav upp till krönet så att man lyfter där, sedan en mjuk slänt ner
      top = d < f.lip ? f.H * Math.pow((d - f.d0) / (f.lip - f.d0), 1.8) : f.H * (1 - smoothstep(f.lip, f.d3, d));
      h = Math.max(h, top * side);
      continue;
    }
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
    if (f.mega) {
      // Jättehopp: kicker → djupt gap → vägg upp till landningens knuckle → lång landning
      const kSide = 1 - smoothstep(f.kHalf, f.kHalf + f.sideW, lat);
      if (d < f.lip) top = f.hK * Math.pow((d - f.d0) / (f.lip - f.d0), 1.8);
      else if (d < f.d2 - 3) top = f.hK + (-f.gap - f.hK) * smoothstep(f.lip + 1.5, f.lip + 5, d); // kort platå vid kanten så att lyftet hinner registreras
      else if (d < f.d2) top = -f.gap + (f.H + f.gap) * smoothstep(f.d2 - 3, f.d2, d);  // d2 ≥ lip + 9, så väggen börjar först när gapet är nere
      else top = f.H * (1 - smoothstep(f.d2, f.d3, d));
      const v = top * kSide;
      if (Math.abs(v) > Math.abs(h)) h = v;
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

function cliffY(x, d) {
  const f = features.find((c) => c.cliff && d >= c.d0 && d <= c.d3);
  return f ? f.H * smoothstep(f.d0, f.lip - 4, d) * (1 - smoothstep(f.half, f.half + f.sideW, Math.abs(x - f.x))) : 0;
}

// Off-pist: små oregelbundna puckar överallt (minst ~7 m mellan topparna så att terrängnätet hinner med)
function lumpY(x, d) {
  return course.lumps * (Math.sin(x * 0.7 + Math.sin(d * 0.13) * 1.3) * Math.sin(d * 0.8 + x * 0.3) * 0.7
    + Math.sin(x * 0.45 - d * 0.6 + 1.1) * 0.3);
}

function bumpY(x, d) {
  return pipeY(x, d) + course.bumps * (Math.sin(x * 0.11 + d * 0.031) * Math.sin(d * 0.07 + 1.7) * 0.9
    + Math.sin(x * 0.37 + 2.1) * Math.sin(d * 0.23) * 0.25) + mogulY(x, d) + featureY(x, d) + (course.lumps ? lumpY(x, d) : 0);
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
