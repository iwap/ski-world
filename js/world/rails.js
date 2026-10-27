'use strict';
// Räcken, boxar och stockar som man kan grinda på.

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
const NO_MODEL = new Set(['gate', 'ramp', 'spine', 'rollers', 'cannon', 'sign', 'deco']); // egna meshar eller bara terräng
const WHITE = new THREE.Color(1, 1, 1);

function syncInstances(time) {
  const counts = {};
  for (const o of objects) {
    if (o.taken || isLinear(o) || NO_MODEL.has(o.type)) continue;
    const m = MODELS[o.model];
    const i = counts[o.model] || 0;
    if (!m || i >= m.cap) continue;
    const y = groundY(o.x, o.d);
    if (o.type === 'star') {
      dummy.position.set(o.x, y + 1.3 + Math.sin(time * 3 + o.rot) * 0.15, -o.d);
      dummy.rotation.set(0, time * 2.5 + o.rot, 0);
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
