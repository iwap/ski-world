'use strict';
// Hinder och hopp i backen: modeller, typer, landningar och Big Air-kanter.

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
// Hoppen är byggda av snö som i en riktig park: uppfart (kicker) → bord → knuckle → landning, allt i ett.
// Svårighet som i backarna: grönt, blått, rött – och svart bara på Big Air-banan.
// w = kickerns halva bredd, l = halva uppfartens längd, h = kantens höjd, vz = utgångsfart uppåt (höjd ≈ vz² / 20)
const RAMPS = [
  { name: 'Grönt hopp', grade: 'green', w: 1.8, l: 2.6, h: 0.8, vz: 6.2,  weight: 50 },
  { name: 'Blått hopp', grade: 'blue',  w: 2.3, l: 3.4, h: 1.3, vz: 7.8,  weight: 35 },
  { name: 'Rött hopp',  grade: 'red',   w: 2.8, l: 4.4, h: 1.9, vz: 9.4,  weight: 15 },
  { name: 'Big Air',    grade: 'red',   w: 3.6, l: 6.0, h: 3.2, vz: 11.2, weight: 7 },
  // Jättehopp på Big Air-banan i tre storlekar: går över hela den smala backen, med ett gap före landningen
  { name: 'Mega S', grade: 'blue',  w: BIGAIR_NET + 2, l: 8,  h: 3.5, vz: 11, weight: 0, mega: true },
  { name: 'Mega M', grade: 'red',   w: BIGAIR_NET + 2, l: 12, h: 6,   vz: 14, weight: 0, mega: true },
  { name: 'Mega L', grade: 'black', w: BIGAIR_NET + 2, l: 16, h: 9,   vz: 17, weight: 0, mega: true },
];
const GRADES = {
  green: { icon: '🟢', color: '#2e7d32' },
  blue: { icon: '🔵', color: '#1565c0' },
  red: { icon: '🔴', color: '#c62828' },
  black: { icon: '⚫', color: '#212121' },
};
addModel('star', new THREE.OctahedronGeometry(0.4).scale(1, 1.4, 0.5), starMat);
// Tomtens present: rött paket med guldband och rosett
addModel('present', buildGeometry([
  { geo: new THREE.BoxGeometry(0.8, 0.7, 0.8), color: C('#d32f2f') },
  { geo: new THREE.BoxGeometry(0.84, 0.72, 0.16), color: C('#ffc107') },
  { geo: new THREE.BoxGeometry(0.16, 0.72, 0.84), color: C('#ffc107') },
  { geo: new THREE.TorusGeometry(0.14, 0.05, 6, 10), matrix: m4().makeRotationY(Math.PI / 4).setPosition(-0.1, 0.45, 0), color: C('#ffc107') },
  { geo: new THREE.TorusGeometry(0.14, 0.05, 6, 10), matrix: m4().makeRotationY(-Math.PI / 4).setPosition(0.1, 0.45, 0), color: C('#ffc107') },
]), objMat, 120);

const OBSTACLES = [
  { type: 'tree',    weight: 44, r: 1.0,  h: 3.6, crash: 'crash.tree' },
  { type: 'pine',    weight: 10, r: 0.5,  h: 99,  crash: 'crash.pine' },
  { type: 'rock',    weight: 13, r: 0.9,  h: 0.8, crash: 'crash.rock' },
  { type: 'stump',   weight: 6,  r: 0.45, h: 0.6, crash: 'crash.stump' },
  { type: 'snowman', weight: 4,  r: 0.6,  h: 2.0, crash: 'crash.snowman' },
  { type: 'ramp',    weight: 9,  r: 0,    h: 0 }, // hopp: bara terräng (se RAMPS)
  { type: 'star',    weight: 8,  r: 0.7,  h: 0 },
  { type: 'present', weight: 0,  r: 0.7,  h: 0 }, // tomtens presenter (online, se presents.js)
  // Grind-objekt: ligger längs med backen, hoppa upp på dem
  { type: 'rail',    weight: 4,  r: 0.25, h: 0.7,  crash: 'crash.rail', ptsPerM: 18 },
  { type: 'log',     weight: 5,  r: 0.45, h: 0.78, crash: 'crash.log', ptsPerM: 12 },
  { type: 'box',     weight: 0,  r: 0.45, h: 0.6,  crash: 'crash.box', ptsPerM: 14 },
  // Parkhinder i snön (ingen krock – de är en del av backen)
  { type: 'spine',   weight: 0,  r: 0,    h: 0 },
  { type: 'rollers', weight: 0,  r: 0,    h: 0 },
  { type: 'bump',    weight: 0,  r: 0,    h: 0 }, // naturlig snöpuck i off-pist: ett litet hopp utan markeringar
  { type: 'cliff',   weight: 0,  r: 0,    h: 0 }, // klippa över hela bredden i off-pist
  { type: 'hut',     weight: 0,  r: 0,    h: 0, crash: 'crash.hut' }, // liten stuga efter ett hopp i off-pist – landa på taket
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

// Räknar ut var spelaren landar i normal fart och bygger hoppet (kicker, bord och landning) efter det.
// Under ett race byggs banan av grundvärden så att båda spelarna får exakt samma bana.
// Ett vanligt åk byggs av värdena det startade med (eller spökets, så att jakten får samma bana).
function worldStats() {
  if (runSeed && !race && !daily && !tutorial) return runSeed.ws;
  if (!worldRng) return stats();
  return { cruise: Math.min(100, 50 * difficulty.speed) * KMH, jumpPower: 1 };
}

function makeLanding(o) {
  const r = o.ramp;
  const s = worldStats();
  const v = s.cruise;
  const vz = (r.vz + v * 0.06) * s.jumpPower;
  const H = r.mega ? r.h * 0.7 : r.h * 0.9; // bordet ligger strax under kanten
  // Tid från kanten (höjd h) tills man är nere på bordets höjd igen
  const tLand = (vz + Math.sqrt(Math.max(0, vz * vz + 2 * GRAVITY * (r.h - H)))) / GRAVITY;
  const dist = v * tLand;
  const lip = o.d + r.l;
  const f = {
    x: o.x, half: r.w + 1.5, H, sideW: 4, reach: dist,
    d0: lip + 1, d1: lip + 7,
    d2: lip + Math.max(9, dist * 0.7), // kanten
    d3: lip + dist * 1.3 + 6,          // slutet av landningen
  };
  // Jättehoppet: gap (ett djupt hål) mellan kanten och landningen, sedan en lång landning.
  // För lite fart = man hamnar i hålet.
  if (r.mega) {
    // Uppmätt i spelet: luftfärden tar ungefär 0,105 s per m/s uppåtfart, oavsett fart framåt.
    // Gapet är ungefär 45 % av hopplängden i normal fart och djupt som halva kickern – för långsamt = ner i hålet.
    const tAir = 0.105 * vz;
    Object.assign(f, { mega: true, H: r.h * 0.7, gap: Math.max(2.5, r.h * 0.55), d2: lip + Math.max(9, v * tAir * 0.45), d3: lip + v * tAir * 1.5 + 30 });
  }
  // Kickern är en del av samma snöbyggnad, med flacka sidor att åka upp på (större hopp = bredare sidor)
  Object.assign(f, { kicker: true, hK: r.h, kHalf: r.w, vz: r.vz, lip, d0: o.d - r.l, d1: lip, half: r.w + 2.5, sideW: 3 + r.h * 1.3 });
  if (r.mega) f.sideW = 7;
  features.push(f);
  o.zone.len = Math.max(o.zone.len, f.d3 - o.zone.d + 6);
  return f;
}

const lipMarkerMat = new THREE.MeshLambertMaterial({ color: '#ff6d00' });
const gradeMats = Object.fromEntries(Object.entries(GRADES).map(([k, g]) => [k, new THREE.MeshLambertMaterial({ color: g.color })]));
const lipMarkerGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).translate(0, 0.8, 0);

// Käppar som markerar kickerns kant – i hoppets färg (spines: orange)
function buildLipMarkers(o, lip = o.d + o.ramp.l, halfW = o.ramp.w + 0.3) {
  const mat = o.ramp ? gradeMats[o.ramp.grade] : lipMarkerMat;
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(lipMarkerGeo, mat);
    const x = o.x + s * halfW;
    m.position.set(x, groundY(x, lip - 0.3), -(lip - 0.3));
    m.castShadow = true;
    g.add(m);
  }
  // Färgad linje över kanten, så att man ser var den är (och hur svårt hoppet är)
  if (o.ramp) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(o.ramp.w * 2, 0.05, 0.3), mat);
    line.position.set(o.x, groundY(o.x, lip - 0.2) + 0.02, -(lip - 0.2));
    g.add(line);
  }
  scene.add(g);
  return g;
}

// Jättehoppets kant: en linje i hoppets färg över hela bredden + orange koner
function buildLipLine(o) {
  const lip = o.d + o.ramp.l;
  const g = new THREE.Group();
  const line = new THREE.Mesh(new THREE.BoxGeometry(o.ramp.w * 2, 0.06, 0.35), gradeMats[o.ramp.grade]);
  line.position.set(o.x, groundY(o.x, lip - 0.25) + 0.02, -(lip - 0.25));
  g.add(line);
  for (let x = -o.ramp.w + 4; x <= o.ramp.w - 4; x += 6) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 8), lipMarkerMat);
    m.position.set(x, groundY(x, lip - 0.6) + 0.25, -(lip - 0.6));
    g.add(m);
  }
  scene.add(g);
  return g;
}

// Klippväggen: ojämna stenblock i olika storlek längs hela kanten, med snö ovanpå
function buildCliffFace(o) {
  const f = o.feature;
  const g = new THREE.Group();
  const w = netX() + 8;
  const geos = [MODELS.rock0.mesh.geometry, MODELS.rock1.mesh.geometry];
  for (let x = -w; x <= w; x += 1.6 + Math.random() * 1.2) {
    const m = new THREE.Mesh(geos[Math.floor(Math.random() * 2)], objMat);
    // Stenens modell är ungefär 2,4 m bred och 1,3 m hög
    const h = f.H * (0.75 + Math.random() * 0.35);
    m.scale.set(0.9 + Math.random() * 0.8, h / 1.3, 0.6 + Math.random() * 0.5);
    const dd = f.lip + (f.d3 - f.lip) * (0.4 + Math.random() * 0.5);
    m.position.set(x, baseY(f.d3) + f.H - h * 0.95 + Math.random() * 0.2, -dd); // toppen i höjd med kanten
    m.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  // Några nedfallna block vid foten (bara vid sidorna, så att landningen är fri)
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(geos[i % 2], objMat);
    const s = 0.5 + Math.random() * 0.6;
    m.scale.setScalar(s);
    const x = (i < 2 ? -1 : 1) * (netX() + 1 + Math.random() * 5);
    m.position.set(x, baseY(f.d3 + 2), -(f.d3 + 1 + Math.random() * 3));
    m.rotation.y = Math.random() * Math.PI * 2;
    g.add(m);
  }
  scene.add(g);
  return g;
}

function makeObject(t, x, d, opts = {}) {
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
    case 'bump': {
      // Upp till ett krön och sedan en lång, mjuk slänt ner att landa i
      const H = 0.9 + Math.random() * 0.7;
      const up = 5 + Math.random() * 2;
      const half = 1.5 + Math.random();
      o.feature = { bump: true, x, H, hK: H, half, kHalf: half, sideW: 2.2, d0: d, lip: d + up, d1: d + up, d3: d + up + 10 + H * 4, vz: 4.5 + H * 2 };
      features.push(o.feature);
      o.dEnd = o.feature.d3;
      o.zone = { x, d: d + up, ux: 0, ud: 1, len: 24, half: 2.5 };
      break;
    }
    case 'hut': {
      // Nocken går nedför backen så att man kan åka längs taket
      o.rot = 0;
      o.mesh = new THREE.Mesh(cabinGeo, objMat);
      o.mesh.position.set(x, groundY(x, d), -d);
      o.mesh.castShadow = true;
      o.mesh.receiveShadow = true;
      scene.add(o.mesh);
      break;
    }
    case 'cliff': {
      // Små, mellanstora och stora klippor. Marken byggs långsamt upp mot kanten (fortfarande nedför)
      // och stupar sedan nästan rakt ner. land = fri sträcka nedanför där man landar.
      const r = Math.random();
      const H = r < 0.4 ? 2 + Math.random() * 2 : r < 0.8 ? 4 + Math.random() * 3 : 8 + Math.random() * 4;
      const lip = d + 9 * H + 6;
      const w = netX() + 3;
      o.feature = { cliff: true, x: 0, H, hK: H, half: w, kHalf: w, sideW: 4, d0: d, lip, d1: lip, d3: lip + 1 + H * 0.2, vz: 2.5, land: 14 + H * 2.2 };
      features.push(o.feature);
      o.dEnd = o.feature.d3;
      o.zone = { x: 0, d: lip, ux: 0, ud: 1, len: o.feature.land, half: w };
      o.mesh = buildCliffFace(o);
      break;
    }
    case 'ramp': {
      const sizeW = course.rampSizes || RAMPS.map((rp) => rp.weight);
      let r = Math.random() * sizeW.reduce((sum, w) => sum + w, 0);
      o.size = sizeW.findIndex((w) => (r -= w) < 0);
      if (course.moguls && o.size === 3) o.size = 2; // ingen Big Air mitt i puckelpisten
      o.ramp = RAMPS[o.size];
      o.rot = 0;
      // Fri zon efter hoppet: så långt det kan bära i hög fart, plus marginal
      const airtime = 2 * (o.ramp.vz + 28 * 0.06) / GRAVITY;
      o.zone = { x: o.x, d: o.d + o.ramp.l, ux: 0, ud: 1, len: airtime * 26 + 10, half: 3.5 + (o.size === 3 ? 1.5 : 0) };
      o.feature = makeLanding(o);
      o.dEnd = o.feature.d3;
      o.mesh = o.ramp.mega ? buildLipLine(o) : buildLipMarkers(o);
      if (course.moguls) calmZones.push({ x: o.x, d0: o.d - 8, d1: o.feature.d3 + 4, half: o.ramp.w + 3 });
      break;
    }
    case 'rail':
    case 'log':
    case 'box': {
      o.len = t.type === 'rail' ? 15 + Math.random() * 8 : t.type === 'box' ? 9 + Math.random() * 5 : 11 + Math.random() * 6;
      const vs = LINEAR_VARIANTS[t.type];
      o.variant = opts.variant || vs[Math.floor(Math.random() * vs.length)];
      if (o.variant === 'up') o.len *= 0.75;
      if (opts.len) o.len = opts.len;
      o.ra = opts.ra ?? (Math.random() - 0.5) * 0.3;
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
