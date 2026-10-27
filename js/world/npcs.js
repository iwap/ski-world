'use strict';
// Andra åkare (bottar) i backen.

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
    // Kickern är terräng: lyft vid kanten
    const onRamp = o.type === 'ramp' && Math.abs(n.x - o.x) < o.ramp.w;
    if (o.type === 'ramp' && n.d >= o.d + o.ramp.l) {
      n.target = null;
      if (onRamp) {
        const r = Math.random();
        npcTakeOff(n, o.ramp.vz * 0.8 + 1, 0.01, r < 0.55 ? 'flip' : r < 0.85 ? 'spin' : 'grab');
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
    n.x = clamp(n.bx + n.amp * Math.sin(arg), -netX() + 2, netX() - 2);
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
  n.mesh.rotation.set(-Math.atan(slopeAt(n.d)) * 0.8, -Math.atan(slope) + spin, 0);
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
  if (!course.pipe && !course.mega && !course.wind && !tutorial && !race && npcs.length < 5 && Math.random() < dt * 0.3 && p.d < runLength() - 300) {
    const d = p.d + 160 + Math.random() * 60;
    const bx = (Math.random() - 0.5) * (netX() * 1.3);
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
