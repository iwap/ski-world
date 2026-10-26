'use strict';
// Målgång och sittliften upp.

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
  const half = netX() - 0.5;
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
  // Målbonus på Normal och Svår (dyrare bana = större bonus)
  if (difficulty.finishBonus && !tutorial) {
    run.finishBonus = Math.round(difficulty.finishBonus * (COURSE_REWARD[save.course] || 1));
    popup(`🏅 ${t('finish.bonus', { d: t(`diff.${save.difficulty}`) })}`, `+${fmt(run.finishBonus)}`, '#b8860b');
  }
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
  nextMegaD = 60;
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
