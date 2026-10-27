'use strict';
// Slalomportar och generering av hinder, hopp och rails längs backen.

// ---------- Slalomportar ----------

const GATE_HALF = 2.1; // halva portens bredd
const SLALOM_MAX_MISS = 3; // så många missade portar innan man blir diskad
const gateMats = {
  red: new THREE.MeshLambertMaterial({ color: '#e53935', side: THREE.DoubleSide }),
  blue: new THREE.MeshLambertMaterial({ color: '#1e88e5', side: THREE.DoubleSide }),
};
const gatePoleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6).translate(0, 0.9, 0); // vanliga slalomkäppar
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
    const x = gateSide * (4 + Math.random() * 2.5); // sicksack över den smala backen
    const o = { type: 'gate', x, d, dEnd: d, s: 1, color: gateSide > 0 ? 'red' : 'blue', passed: false, missed: false };
    if (course.pslalom) {
      // Parallellslalom: samma port i båda banorna
      o.x = -LANE_X + x * 0.7;
      o.lane = 0;
      const twin = { ...o, x: LANE_X + x * 0.7, lane: 1 };
      twin.mesh = buildGate(twin);
      scene.add(twin.mesh);
      objects.push(twin);
    }
    o.mesh = buildGate(o);
    scene.add(o.mesh);
    // Håll fritt från träd mellan föregående port och den här
    if (lastGate) {
      const dx = o.x - lastGate.x;
      const dd = d - lastGate.d;
      const L = Math.hypot(dx, dd);
      lastGate.zone = { x: lastGate.x, d: lastGate.d, ux: dx / L, ud: dd / L, len: L, half: 3.5 };
    }
    objects.push(o);
    lastGate = o;
    gateSide = -gateSide;
    nextGateD += 22 + Math.random() * 5;
  }
}

function checkGates() {
  const p = player;
  for (const o of objects) {
    if (o.type !== 'gate' || o.passed || o.missed || p.d < o.d) continue;
    if (o.lane !== undefined && race && o.lane !== race.lane) continue; // den andra spelarens bana
    if (Math.abs(p.x - o.x) <= GATE_HALF + 0.3) { // lite förlåtande: att snudda vid stången räknas
      o.passed = true;
      run.gates++;
      run.tricks += 30;
      popup(`🚩 ${t('gate.passed')}`, '+30', o.color === 'red' ? '#e53935' : '#1e88e5');
      Sound.star();
    } else {
      o.missed = true;
      run.missed++;
      popup(t('gate.missed'), `${run.missed}/${SLALOM_MAX_MISS}`, '#e53935');
      Sound.denied();
      if (run.missed >= SLALOM_MAX_MISS) {
        p.crashReason = t('crash.dq');
        p.dq = true;
        endRun();
        return;
      }
    }
  }
}

// Rail ner för hoppets landning, där man landar i normal fart – hoppa, gör en 360 och landa på railen
const RAIL_AFTER_JUMP = 0.6;
function spawnRailAfterJump(ramp) {
  const f = ramp.feature;
  if (ramp.ramp.mega || !course.weights.rail || Math.random() > RAIL_AFTER_JUMP) return;
  // Railen börjar lite före normal landning och räcker långt så att både lite långsammare och snabbare åkare når den
  const start = f.lip + f.reach * 0.75;
  const len = Math.max(14, f.reach * 0.6 + 10);
  if (start + len > runLength() - 40 || pipeEnv(start + len + 20) > 0) return;
  const rail = makeObject(OBSTACLES.find((o) => o.type === 'rail'), f.x, start, { variant: 'straight', ra: 0, len });
  rail.jump = ramp;
  if (collides(rail)) return removeObject(rail);
  objects.push(rail);
  ramp.zone.len = Math.max(ramp.zone.len, start + len + 8 - ramp.zone.d);
}

// Big Air-banan: jättehopp efter varandra mitt i backen, med fri sträcka efter varje landning
let nextMegaD = 60;
function spawnMegaJumps(toD) {
  const rampType = OBSTACLES.find((o) => o.type === 'ramp');
  while (nextMegaD < toD && nextMegaD < runLength() - 170) {
    const o = makeObject(rampType, 0, nextMegaD);
    objects.push(o);
    // Skylt i hoppets färg vid sidan av uppfarten
    const sign = makeGradeSign(o, netX() - 1.5, o.d - 30);
    if (!collides(sign)) objects.push(sign);
    else removeObject(sign);
    // Ibland en rail nerför landningen, där man landar i normal fart
    const f = o.feature;
    if (f && Math.random() < 0.45) {
      const reach = (f.d2 - f.lip) / 0.68; // hopplängden i normal fart
      const x = (Math.random() - 0.5) * 2 * (netX() - 5);
      const rail = makeObject(OBSTACLES.find((t) => t.type === 'rail'), x, f.lip + reach * 0.85, { variant: 'straight', ra: 0, len: reach * 0.6 + 12 });
      rail.jump = o;
      if (collides(rail)) removeObject(rail);
      else objects.push(rail);
    }
    nextMegaD = (o.feature ? o.feature.d3 : nextMegaD + 120) + 60; // skogsparti mellan hoppen
  }
}

// Off-pist: ibland en liten stuga där man landar efter ett hopp (klippa eller snöpuck)
function spawnHutAfter(jump, x, d) {
  const hut = makeObject(OBSTACLES.find((t) => t.type === 'hut'), x, d);
  hut.jump = jump;
  if (Math.abs(x) > netX() - 3 || d > runLength() - 40 || collides(hut)) return removeObject(hut);
  objects.push(hut);
}

// Off-pist: ibland en klippa över hela bredden – man kan inte åka förbi, bara hoppa
let nextCliffD = 0;
function spawnCliffs(toD) {
  const cliffType = OBSTACLES.find((o) => o.type === 'cliff');
  while (nextCliffD < toD) {
    const d = nextCliffD;
    nextCliffD += 130 + Math.random() * 110;
    if (d < 80) continue;
    const o = makeObject(cliffType, 0, d);
    // Landningen nedanför ska hinnas före målet
    if (o.feature.d3 + o.feature.land > runLength() - 25) {
      removeObject(o);
      features = features.filter((f) => f !== o.feature);
      nextCliffD = Infinity;
      return;
    }
    objects.push(o);
    const f = o.feature;
    if (Math.random() < 0.5) spawnHutAfter(o, (Math.random() - 0.5) * 2 * (netX() - 5), f.d3 + 6 + f.H * 1.2);
    nextCliffD = Math.max(nextCliffD, o.feature.lip + 60);
  }
}

// Skylt i hoppets färg (grönt, blått, rött, svart) som i riktiga parker
function makeGradeSign(o, x, d) {
  const g = GRADES[o.ramp.grade];
  return makeSign(x, d, `${g.icon} ${t('sign.jump')}`, g.color, 2.6);
}

// I ett race genereras backen från ett gemensamt frö så att båda åker samma bana (mulberry32 finns ovan)
let worldRng = null;

function spawnUntil(limitD) {
  if (!worldRng) return spawnRows(limitD);
  const random = Math.random;
  Math.random = worldRng;
  try { spawnRows(limitD); } finally { Math.random = random; }
}

function spawnRows(limitD) {
  limitD = Math.min(limitD, runLength() - 20); // tomt vid målet så att man kan stanna
  while (nextSpawnD < limitD) {
    if (course.slalom) spawnGates(nextSpawnD + 40); // portarna i takt med raderna så att listan hålls sorterad
    if (course.mega) spawnMegaJumps(nextSpawnD + ROW + 60); // hoppen läggs ut i förväg så att uppfarten hålls fri från träd
    if (course.cliffs) spawnCliffs(nextSpawnD + ROW + 100); // klipporna läggs ut i förväg (uppfarten är lång)
    // Svårare och svårare nerför backen: glest i början, tätt mot målet
    const prog = clamp(nextSpawnD / runLength(), 0, 1);
    const density = 0.0075 * (0.5 + 1.2 * prog) * course.density * difficulty.density;
    for (let n = BAND * ROW * density; n > 0; n--) {
      if (n < 1 && Math.random() > n) break;
      const d = nextSpawnD + Math.random() * ROW;
      const piped = pipeEnv(d) > 0;
      const x = piped ? (Math.random() - 0.5) * 2 * (PIPE_COPING - 1.5) : (Math.random() - 0.5) * Math.min(BAND, 2 * (netX() - 3));
      if (d < 45 && Math.abs(x) < 8) continue; // fri start
      const kind = pickObstacle();
      if (piped && kind.type !== 'star') continue; // i pipen ligger bara stjärnor
      if ((kind.type === 'ramp' || isLinear(kind)) && pipeEnv(d + 90) > 0) continue; // landningar/räcken ska inte gå in i pipen
      if (isLinear(kind) && Math.abs(x) > NET_X - 8) continue;
      if ((kind.type === 'ramp' || kind.type === 'bump' || isLinear(kind)) && d > runLength() - 130) continue; // landningar ska hinnas före målet
      // Håll fritt runt räcken och stockar så att de går att åka på
      if (blockedByLinear(x, d, isLinear(kind) ? 5 : 3)) continue;
      if (BLOCKS_LANDING.has(kind.type) && inLandingZone(x, d, isLinear(kind) ? 1 : 1.5)) continue;
      // Klippans uppfart: träd och stenar får stå där, men inga puckar eller stockar (de skulle försvinna i snön)
      const onCliff = course.cliffs && features.some((f) => f.cliff && d > f.d0 - 30 && d < f.d3 + f.land);
      if (onCliff && (kind.type === 'bump' || isLinear(kind))) continue;
      if (kind.type !== 'star' && featureY(x, d) > 0.02 && !(onCliff && featureY(x, d) === cliffY(x, d))) continue; // inget på landningsvallar
      if (featureY(x, d) < -0.3) continue; // inget nere i Big Air-gapet
      // Big Air: fri uppfart till kickern och fri landning – träden står mellan hoppen
      if (kind.type !== 'star' && features.some((f) => f.mega && d > f.d0 - 25 && d < f.d3 + 6)) continue;
      if (isLinear(kind) && overlaps(x, d, 2)) continue;
      const o = makeObject(kind, x, d);
      // Inget får redan stå i räckets bana eller i hoppets landningszon
      const laneBlocked = isLinear(o) && o.pts.slice(1).some((b, i) => {
        const a = o.pts[i];
        const L = Math.hypot(b.x - a.x, b.d - a.d) || 1;
        return stripBlocked({ x: a.x, d: a.d, ux: (b.x - a.x) / L, ud: (b.d - a.d) / L, len: L, half: 1.5 });
      });
      if ((!isLinear(o) && overlaps(x, d, footprint(o))) || laneBlocked || (o.zone && stripBlocked(o.zone)) || collides(o)) {
        removeObject(o);
        if (o.feature) features = features.filter((f) => f !== o.feature);
        continue;
      }
      objects.push(o);
      if (o.type === 'ramp') spawnRailAfterJump(o);
      if (o.type === 'bump' && Math.random() < 0.25) spawnHutAfter(o, o.x, o.feature.lip + 12);
      // Skylt före hoppet: hoppets färg (spines: varning)
      if (o.type === 'ramp' || o.type === 'spine') {
        const sx = o.x + (o.x > 0 ? -1 : 1) * ((o.ramp ? o.ramp.w : 3) + 2);
        const sd = o.feature.d0 - 10;
        const sign = o.ramp ? makeGradeSign(o, sx, sd) : makeSign(sx, sd, `⚠️ ${t('sign.jump')}`, '#e65100', 2.6);
        if (!overlaps(sign.x, sign.d, 1) && !inLandingZone(sign.x, sign.d, 1) && !blockedByLinear(sign.x, sign.d, 1.5) && !collides(sign)) objects.push(sign);
        else removeObject(sign);
      }
    }
    spawnDecor(nextSpawnD, nextSpawnD + ROW);
    // Tät skog utanför näten
    for (const side of [-1, 1]) {
      if (Math.random() < 0.85) {
        const tree = OBSTACLES[Math.random() < 0.8 ? 0 : 1];
        const o = makeObject(tree, side * (netX() + 2.5 + Math.random() * 30), nextSpawnD + Math.random() * ROW);
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
  nextMegaD = 60;
  nextCliffD = 0;
  presentsReset();
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

const courseUnlocked = (id = save.course) => save.courses.includes(id);
const pointsMult = () => difficulty.points * (COURSE_REWARD[save.course] || 1) * (COURSE_POINTS[save.course] || 1) * (1 + ability('coins'));
const SCORE_SCALE = 0.4; // alla poäng från åket (distans, tricks, stjärnor)
const runScore = () => (Math.round((Math.floor(player.d) + run.tricks + run.stars) * pointsMult() * SCORE_SCALE) + (run.finishBonus || 0)) * (run.finished ? FINISH_MULT : 1);
