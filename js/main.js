'use strict';
// Huvudloopen som startar spelet.

// ---------- Huvudloop ----------

let last = performance.now();
let wasMenu = true;


function frame(now) {
  // rAF-tidsstämpeln kan ligga före performance.now() vid start: negativ dt får posen att skena iväg
  const realDt = clamp((now - last) / 1000, 0, 0.05);
  const dt = realDt;
  const time = now / 1000;
  last = now;

  if (state === 'countdown') updateCountdown();
  else if (state === 'playing') {
    if (tutorial) updateTutorial(dt);
    update(dt);
    if (state === 'playing') updateNpcs(dt);
  } else if (state === 'crashing') updateCrash(dt);
  else if (state === 'finish') updateFinish(dt);
  else if (state === 'lift') updateLift(dt);

  const inMenu = state === 'menu' || state === 'shop';
  updateRace(dt);
  updateDaily(dt);
  updateRunSeed(dt);
  updatePresents(dt);
  updateWorld(state === 'paused' ? 0 : dt, time);
  updateCamera(dt, time, wasMenu && !inMenu);
  wasMenu = inMenu;
  if (state !== 'paused') {
    updateDecorParticles(dt);
    updateSpray(dt);
    updateFlakes(dt, time);
  }

  const p = player;
  Sound.update({
    active: state === 'playing' || state === 'finish',
    speed: p.speed,
    carve: Math.abs(p.turnVel) / stats().turnRate,
    braking: p.braking,
    air: (p.air && !p.smallAir) || !!p.onRock,
    grind: p.grind ? p.grind.o.type : null,
  });

  renderer.render(scene, camera);
  updateHud();
  pressed.clear();
  requestAnimationFrame(frame);
}

applyLanguage();
applyTime();
resetWorld();
showIntro();
requestAnimationFrame(frame);
