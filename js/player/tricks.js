'use strict';
// Hopp, krascher och tricks i luften.

// ---------- Spellogik ----------

function feet() {
  return { x: player.x, y: groundY(player.x, player.d), z: -player.d };
}

function clearTricks() {
  const p = player;
  p.spin = 0;
  p.flipping = false;
  p.trickCd = 0;
  p.flipProg = 0;
  p.flips = 0;
  p.frontFlips = 0;
  p.flipDir = 1;
  p.corking = false;
  p.corkProg = 0;
  p.corks = 0;
  p.grabTime = 0;
  p.grabTimes = {};
}

function launch(vz, quiet = false) {
  const p = player;
  p.air = true;
  p.vz = vz;
  p.z = Math.max(p.z, 0.01);
  p.onRock = null;
  p.maxZ = 0;
  p.prevBvy = 0;
  p.takeoffSwitch = isSwitch();
  p.smallAir = quiet;
  clearTricks();
  // Styrningen från marken ska inte bli en oavsiktlig snurr – släpp först
  p.spinArmed = !isLeft() && !isRight();
  trail.push({ gap: true });
  const f = feet();
  if (quiet) return;
  burst(f.x, f.y + 0.1, f.z, 25, 3, 0.4);
  Sound.jump(Math.min(1, vz / 14));
}

function crash(reasonKey, obstacle, kind) {
  const p = player;
  partyCrash();
  const reason = t(reasonKey);
  const f = feet();
  const startZ = p.z;
  const rail = obstacle && isLinear(obstacle) ? obstacle : p.grind ? p.grind.o : null;
  clearTricks();
  p.grind = null;
  p.onRock = null;
  p.smallAir = false;
  p.combo = { parts: [], pts: 0 };
  if (p.chain.n >= 2) popup(`💔 ${t('chain.broken')}`, '', '#5d4037');
  p.chain = { n: 0, timer: 0 };
  p.air = false;
  p.z = 0;
  p.vz = 0;
  burst(f.x, f.y + 0.3, f.z, 160, 6, 0.7);
  Sound.crash(p.lives > 0 ? 0.6 : 1);
  if (obstacle && (obstacle.type === 'tree' || obstacle.type === 'pine')) {
    // Snö som rasar ner från grenarna
    const top = obstacle.type === 'pine' ? 8 : 4;
    for (let i = 0; i < 80; i++) {
      emit(obstacle.x + (Math.random() - 0.5) * 3, groundY(obstacle.x, obstacle.d) + 1 + Math.random() * top,
        -obstacle.d + (Math.random() - 0.5) * 3, (Math.random() - 0.5), -Math.random() * 2, (Math.random() - 0.5),
        0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.8);
    }
  }
  if (p.lives > 0) {
    p.lives--;
    p.invuln = 2;
    p.speed *= 0.4;
    p.stumble = 1;
    if (rail) {
      // Knuffa åt sidan så att man inte står kvar inne i räcket och kraschar igen
      const info = linearInfo(rail, p.x, p.d);
      const a = pointAt(rail, info.t).a;
      const side = Math.sign(info.lat) || 1;
      p.x += Math.cos(a) * side * (rail.r + 1);
      p.d -= Math.sin(a) * side * (rail.r + 1);
      p.noGrind = rail;
    }
    popup(reason, t('crash.helmetSaved'), '#e53935');
    return;
  }
  p.crashReason = reason;
  p.invuln = 0; // annars kan blinkningen frysa med åkaren osynlig under kraschen
  p.stumble = 0;
  state = 'crashing';
  const hard = obstacle && ['tree', 'pine', 'snowman'].includes(obstacle.type);
  startCrashPhysics(kind || (hard ? 'hard' : obstacle ? 'trip' : 'land'), startZ);
}

// Räknar ihop tricks från luftfasen in i combon. Returnerar en kraschorsak om landningen misslyckas.
// Grabs räknas likadant vid landning och när man landar på ett räcke
function addGrabs(c) {
  const p = player;
  const held = [];
  for (const g of GRABS) {
    const time = (p.grabTimes || {})[g.id] || 0;
    if (time > 0.25) {
      c.parts.push(g.name);
      c.pts += Math.round(time * g.pts);
      held.push(g.id);
    }
  }
  return held;
}

function collectAirTricks() {
  const p = player;
  let flips = p.flips;
  let fronts = p.frontFlips || 0;
  // I halfpipen är landningen mer förlåtande: halvfärdiga volter och sneda spins går bra
  const easy = inPipe(p.d) ? 1.8 : 1;
  if (p.flipping) {
    if (p.flipProg < (0.8 - 0.3 * ability('land')) / easy) return 'crash.head';
    if (p.flipDir < 0) fronts++;
    else flips++;
  }
  let corks = p.corks || 0;
  if (p.corking) {
    if (p.corkProg < (0.8 - 0.3 * ability('land')) / easy) return 'crash.head';
    corks++;
  }
  // Varje halvvarv (180°) är ett giltigt läge – udda antal betyder att du landar baklänges
  const halves = Math.round(p.spin / Math.PI);
  const off = Math.abs(p.spin - halves * Math.PI);
  if (off > 0.6 * (1 + ability('land')) * easy && Math.abs(p.spin) > 1) return 'crash.crooked';

  const prefix = p.takeoffSwitch ? 'Switch ' : '';
  const c = p.combo;
  const n = Math.abs(halves);
  c.sig = c.sig || []; // språkoberoende beskrivning av tricket (trick-duellen)
  if (n > 0) {
    c.parts.push(`${prefix}${n * 180}`);
    c.pts += 40 * n * (n + 1) / 2;
    c.sig.push(`spin${n * 180}`);
  }
  if (flips > 0) c.sig.push(`back${flips}`);
  if (fronts > 0) c.sig.push(`front${fronts}`);
  if (flips > 0) {
    c.parts.push(flips === 1 ? 'Backflip' : flips === 2 ? t('trick.doubleBackflip') : `${flips}x backflip`);
    c.pts += 150 * flips * (flips + 1) / 2;
  }
  if (fronts > 0) {
    c.parts.push(fronts === 1 ? 'Frontflip' : fronts === 2 ? t('trick.doubleFrontflip') : `${fronts}x frontflip`);
    c.pts += 170 * fronts * (fronts + 1) / 2;
  }
  if (corks > 0) {
    c.parts.push(corks === 1 ? 'Cork 360' : corks === 2 ? 'Double cork' : `${corks}x cork`);
    c.pts += 200 * corks * (corks + 1) / 2;
    c.sig.push(`cork${corks}`);
    earnBadge('cork');
  }
  const grabs = addGrabs(c);
  for (const g of grabs) c.sig.push(`grab-${g}`);
  // Perfekt landning: nästan exakt rakt (under ~7°) efter snurr, volt eller cork, och tricket helt klart
  const flipClean = (!p.flipping || p.flipProg >= 0.97) && (!p.corking || p.corkProg >= 0.97);
  const perfect = (n > 0 || flips > 0 || fronts > 0 || corks > 0) && off < 0.12 && flipClean;
  if (perfect) {
    c.parts.push(`✨ ${t('trick.perfect')}`);
    c.noMult = (c.noMult || 0) + 1;
    c.pts += Math.max(30, Math.round(c.pts * 0.25));
  }
  trickBadges({ flips, fronts, spin: n * 180, grabs, perfect });
  // Behåll den visuella vinkeln så att modellen inte hoppar, och byt åkriktning vid udda halvvarv
  p.facingVis += p.spin;
  p.facing += halves * Math.PI;
  clearTricks();
  return null;
}
