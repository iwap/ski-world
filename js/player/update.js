'use strict';
// Halfpipen och huvuduppdateringen av åkaren varje bildruta.

// ---------- Halfpipe ----------

// På marken i pipen: flyg upp när man når kanten på väg utåt, och vänd om man stannar på väggen
function updatePipe(s) {
  const p = player;
  const side = Math.sign(p.x) || 1;
  const outward = Math.sin(p.angle) * side;
  if (Math.abs(p.x) >= PIPE_COPING - 0.2 && outward > 0.05) {
    // All fart ut mot väggen blir fart rakt upp, resten fortsätter nedför pipen
    const vlat = p.speed * Math.abs(Math.sin(p.angle));
    const vlong = p.speed * Math.cos(p.angle);
    // Lite extra skjuts vid kanten, som när man "pumpar" i pipen. Över 10 m/s ger mer fart bara lite högre luft.
    const up = vlat + 3;
    launch((up <= 10 ? up : 10 + (up - 10) * 0.35) * s.jumpPower);
    p.pipeAir = { side, vlat: vlat + 3, a0: p.angle, vz0: p.vz };
    p.angle = 0;
    p.turnVel = 0;
    p.speed = Math.max(3, vlong);
    p.x = side * (PIPE_COPING - 0.05);
  } else if (Math.abs(p.x) > PIPE_FLAT + 0.5 && outward > 0 && p.speed * outward < 1.2) {
    // Orkade inte upp: glid tillbaka ner
    p.angle = -p.angle;
    p.turnVel = 0;
  }
}

function update(dt) {
  const s = stats();
  const p = player;
  if (p.invuln > 0) p.invuln -= dt;
  updateChain(dt);

  run.maxSpeed = Math.max(run.maxSpeed, p.speed);
  if (p.air && !p.smallAir) run.maxAir = Math.max(run.maxAir, p.z);
  if (p.grind) {
    updateGrind(dt, s);
  } else {
    if (p.air) updateAir(dt, s);
    else updateGround(dt, s);

    const b0 = bumpY(p.x, p.d);
    p.prevD = p.d;
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.d += Math.cos(p.angle) * p.speed * dt;
    const db = bumpY(p.x, p.d) - b0;

    if (p.air) {
      p.vz -= GRAVITY * dt;
      p.z += p.vz * dt - db; // marken under rör sig när man flyger över puckar
      p.maxZ = Math.max(p.maxZ || 0, p.z);
      if (p.z <= 0) land();
    } else if (db < -0.6 && !p.onRock) {
      // Marken försvann under en (en kant) – fall ner istället för att teleporteras
      p.air = true;
      p.smallAir = true;
      p.z = -db;
      p.vz = 0;
    } else if (inPipe(p.d) && Math.abs(p.x) < PIPE_COPING + 0.3) {
      updatePipe(s);
    } else if (!p.onRock) {
      // Big Air-kickern: lyft när kanten passeras. Skjutsen beror på hur högt upp på kickern man
      // faktiskt var – åker man upp från den låga sidan blir det bara ett litet lyft.
      const kick = features.find((f) => (f.kicker || f.spine) && p.prevD < f.lip && p.d >= f.lip && Math.abs(p.x - f.x) < f.kHalf + f.sideW);
      const kickFrac = kick ? clamp(featureY(p.x, kick.lip - 0.2) / kick.hK, 0, 1) : 0;
      const bvy = db / dt;
      if (kick && kickFrac > 0.35) {
        launch((kick.vz + p.speed * 0.06) * s.jumpPower * Math.pow(kickFrac, 1.5));
      }
      // Över ett krön faller marken bort snabbare än tyngdkraften drar ner dig – då lyfter du
      else if ((p.prevBvy || 0) > 2.5 && (p.prevBvy - bvy) / dt > GRAVITY) {
        // Rollers ger riktiga (trixbara) luftfärder, vanliga krön bara små skutt
        const roll = features.some((f) => f.rollers && p.d > f.d0 && p.d < f.d3 && Math.abs(p.x - f.x) < f.half + 1);
        launch(roll ? Math.min(7, p.prevBvy * 0.7) : Math.min(4, p.prevBvy * 0.35), !roll);
      }
      // Plötsliga hopp i marken (t.ex. en kant) räknas inte som fart uppåt
      p.prevBvy = Math.abs(db) > 0.35 ? 0 : bvy;
    }
  }
  if (state !== 'playing') return;

  // Över mållinjen (på marken): stanna och ta liften upp
  if (p.d >= runLength() && !p.air && !p.grind) return finishRun();

  if (course.slalom) {
    checkGates();
    if (state !== 'playing') return;
  }

  // Studsa mot avspärrningsnäten
  // Parallellslalom: håll dig i din egen bana
  if (course.pslalom && race && !p.grind) {
    const lo = race.lane === 0 ? -netX() + 0.7 : 0.7;
    const hi = race.lane === 0 ? -0.7 : netX() - 0.7;
    if (p.x < lo || p.x > hi) {
      const side = p.x < lo ? -1 : 1;
      p.x = clamp(p.x, lo, hi);
      if (Math.sin(p.angle) * side > 0) {
        p.angle = -p.angle * 0.5;
        p.turnVel = 0;
        p.speed *= 0.7;
        Sound.bounce();
      }
    }
  }
  const limit = netX() - 0.7;
  if (!p.grind && Math.abs(p.x) > limit) {
    const side = Math.sign(p.x);
    p.x = side * limit;
    if (Math.sin(p.angle) * side > 0) {
      p.angle = -p.angle * 0.5;
      p.turnVel = 0;
      p.speed *= 0.7;
      const f = feet();
      burst(f.x, f.y + 0.6, f.z, 40, 3, 0.5);
      Sound.bounce();
    }
  }
  if (!p.air && !p.grind && !p.onRock && !p.onRamp) emitCarve(dt, s);
  if (!p.grind) checkCollisions(s);
  if (state !== 'playing') return;

  // Skidspår (inte uppe på stenar)
  if ((p.onRock || p.onRamp) && trail.length && !trail[trail.length - 1].gap) trail.push({ gap: true });
  if (!p.air && !p.grind && !p.onRock && !p.onRamp) {
    const last = trail[trail.length - 1];
    if (!last || last.gap || (p.x - last.x) ** 2 + (p.d - last.d) ** 2 > 0.6) {
      trail.push({ x: p.x, d: p.d, a: p.angle, y: groundY(p.x, p.d) });
      while (trail.length > TRACK_MAX) trail.shift();
      rebuildTracks();
    }
  }

  spawnUntil(p.d + VIEW_AHEAD);
  features = features.filter((f) => f.d3 > p.d - 40);
  objects = objects.filter((o) => {
    const keep = o.dEnd > p.d - 15 && !(o.type === 'star' && o.taken);
    if (!keep) removeObject(o);
    return keep;
  });
}
