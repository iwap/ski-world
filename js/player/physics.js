'use strict';
// Åkfysik: landning, grind, svängar, luft och krockar.

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
  // Ner i Big Air-gapet: åket är slut, hjälmar hjälper inte
  const gap = features.find((f) => f.mega && p.d > f.lip + 0.5 && p.d < f.d2 && Math.abs(p.x - f.x) < f.kHalf + 1);
  if (gap) {
    // Big Air-tävling: bara försöket är slut. Annars: åket är slut, hjälmar hjälper inte.
    if (race && race.attempt) {
      race.attempt.crashed = true;
      endAttempt();
      return;
    }
    p.lives = 0;
    crash('crash.gap');
    return;
  }
  p.prevBvy = 0;
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
  const pw = course.powder ? 2.5 : 1;
  burst(f.x, f.y + 0.1, f.z, Math.round((small ? 8 : 45) * pw), small ? 2 : 4 * Math.sqrt(pw), 0.45 * Math.sqrt(pw));
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
    p.combo.pts += Math.round(g.dist * g.o.ptsPerM * g.mult * (1 + ability('grind')));
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
  const noise = (Math.random() - 0.5) * 6 / (1 + save.upgrades.binding * 0.2) * difficulty.balance * (o.type === 'box' ? 0.6 : 1) / (1 + ability('grind'));
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
  const powder = course.powder ? 1 : 0; // djup pudersnö i off-pist
  sprayAcc += p.speed * (0.4 + turning * 9 + p.braking * 14 + powder * (2.5 + turning * 12)) * dt;
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
      ((strong ? 1.2 + Math.random() * 3.5 : 0.3 + Math.random()) + powder * (1.5 + Math.random() * 3)) * Math.min(1, p.speed / 10),
      fz * fwd + rz * side + (Math.random() - 0.5),
      0.15 + Math.random() * 0.25 + powder * (0.2 + Math.random() * 0.35),
      0.35 + Math.random() * 0.45 + powder * 0.5,
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
  // Cooldown mellan volterna så att man inte kan spamma dem
  p.trickCd = Math.max(0, (p.trickCd || 0) - dt);
  if (!p.flipping && p.trickCd <= 0 && (front || wasPressed('ArrowDown', 'KeyS'))) {
    p.flipping = true;
    p.flipProg = 0;
    p.flipDir = front ? -1 : 1;
  }
  if (p.flipping) {
    p.flipProg += dt / s.flipTime;
    if (p.flipProg >= 1) {
      p.flipping = false;
      p.trickCd = TRICK_COOLDOWN;
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
    if (o.taken || o.type === 'gate' || o.type === 'spine' || o.type === 'rollers' || o.type === 'bump' || o.type === 'cliff' || o.type === 'deco') continue; // portar, terrängformer och dekor

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

    if (o.type === 'ramp') continue; // hoppen är terräng – lyftet sker i update() när kanten passeras
    const dd = o.d - p.d;
    const dx = o.x - p.x;
    if (Math.abs(dd) > 4 || Math.abs(dx) > 4) continue;
    if (o.type === 'star') {
      if (p.z < 3 && dx * dx + dd * dd < 1.3 * 1.3) {
        o.taken = true;
        run.stars += Math.round(25 * (1 + ability('stars')));
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
