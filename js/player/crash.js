'use strict';
// Kraschfysik: kroppen och skidorna som flyger iväg.

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
