'use strict';
// Spelvärldens tillstånd och dekor (snökanoner, skyltar, stugor).

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
    case 'bump': return 6;
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
  if (crossed(130) && !course.mega && !course.offpiste) {
    const k = Math.floor(d1 / 130);
    const o = makeCannon(d1, k % 2 ? 1 : -1);
    if (!overlaps(o.x, o.d, 1.5) && !collides(o)) objects.push(o);
    else removeObject(o);
  }
  if (crossed(420, 200)) objects.push(makeDeco(hutGeo, NET_X + 13, d1, -Math.PI / 2 + 0.3));
  if (crossed(600, 380) && !course.offpiste) objects.push(makeDeco(snowcatGeo, NET_X + 8, d1, 0.4));
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

// ---------- Plats på marken: inget får stå inuti något annat ----------
// Varje sak tar plats som cirklar (hinder, punkter längs räcken) eller rektanglar (hopp med landning, spines, rollers).
// Lite marginal runt allt så att sakerna inte heller nuddar varandra.
const SOLID_R = { tree: 0.6, pine: 0.5, rock: 0.8, stump: 0.4, snowman: 0.6, cannon: 0.5, sign: 0.4, star: 0.5 };
const SHAPE_PAD = 0.3;

function shapesOf(o) {
  if (o.shapes) return o.shapes;
  let shapes = [];
  const f = o.feature;
  if (f) {
    // Halva sidosläntens bredd räknas också – annars hamnar saker halvvägs inne i snövallen
    const w = f.half + (f.sideW || 0) * 0.5 + SHAPE_PAD;
    shapes = f.cliff
      ? [{ x0: f.x - w, x1: f.x + w, d0: f.lip - 8, d1: f.d3 + f.land }] // fritt före kanten och nedanför (där man landar)
      : [{ x0: f.x - w, x1: f.x + w, d0: f.d0 - SHAPE_PAD, d1: f.d3 + SHAPE_PAD }];
  } else if (isLinear(o)) {
    const n = Math.max(2, Math.ceil(o.len));
    for (let i = 0; i <= n; i++) {
      const q = pointAt(o, i / n);
      shapes.push({ x: q.x, d: q.d, r: 0.6 + SHAPE_PAD });
    }
  } else if (SOLID_R[o.type] !== undefined) {
    shapes = [{ x: o.x, d: o.d, r: SOLID_R[o.type] * (o.type === 'rock' ? Math.max(1, o.s) : 1) + SHAPE_PAD }];
  }
  o.shapes = shapes;
  o.box = shapes.reduce((b, s) => ({
    x0: Math.min(b.x0, s.r ? s.x - s.r : s.x0), x1: Math.max(b.x1, s.r ? s.x + s.r : s.x1),
    d0: Math.min(b.d0, s.r ? s.d - s.r : s.d0), d1: Math.max(b.d1, s.r ? s.d + s.r : s.d1),
  }), { x0: Infinity, x1: -Infinity, d0: Infinity, d1: -Infinity });
  return shapes;
}

function shapesHit(a, b) {
  if (a.r && b.r) return (a.x - b.x) ** 2 + (a.d - b.d) ** 2 < (a.r + b.r) ** 2;
  if (!a.r && !b.r) return a.x0 < b.x1 && b.x0 < a.x1 && a.d0 < b.d1 && b.d0 < a.d1;
  const [c, r] = a.r ? [a, b] : [b, a];
  const nx = clamp(c.x, r.x0, r.x1);
  const nd = clamp(c.d, r.d0, r.d1);
  return (c.x - nx) ** 2 + (c.d - nd) ** 2 < c.r * c.r;
}

// Står det nya objektet o inuti något som redan finns? (ignore = det som o hör till, t.ex. railen på ett hopps landning)
function collides(o, ignore = null) {
  const A = shapesOf(o);
  if (!A.length) return false;
  const a = o.box;
  for (const e of objects) {
    if (e === o || e === ignore || e.jump === o || o.jump === e) continue;
    const B = shapesOf(e);
    if (!B.length) continue;
    const b = e.box;
    if (a.x0 > b.x1 || b.x0 > a.x1 || a.d0 > b.d1 || b.d0 > a.d1) continue;
    // Stjärnor svävar: de får ligga över hopp och landningar (men inte i träd eller på räcken)
    if (o.type === 'star' && (e.type === 'star' || !B[0].r)) continue;
    if (e.type === 'star' && !A[0].r) continue;
    if (A.some((s) => B.some((t) => shapesHit(s, t)))) return true;
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
