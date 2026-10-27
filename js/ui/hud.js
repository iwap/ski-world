'use strict';
// Siffrorna under åket (HUD).

// Skriver bara till sidan när texten faktiskt ändrats (DOM-skrivningar varje bildruta är onödigt dyra)
const hudCache = {};
function setText(id, text) {
  if (hudCache[id] !== text) {
    hudCache[id] = text;
    $(id).textContent = text;
  }
}

function updateHud() {
  updateTouchUi();
  const p = player;
  if (state === 'menu' || state === 'shop' || state === 'lift' || state === 'intro') return;
  setText('hud-dist', `${fmt(Math.min(p.d, runLength()))} / ${fmt(runLength())} m`);
  setText('hud-score', fmt(runScore()));
  setText('hud-speed', `${fmt(p.speed * 3.6)} km/h`);
  setText('hud-lives', p.lives > 0 ? '⛑️'.repeat(p.lives) : '–');
  // Tutorialen och minilägena har extraliv – visa inte hjälmarna
  $('hud-lives').parentElement.classList.toggle('hidden', !!tutorial || !!(race && (race.mode === 'duel' || race.mode === 'bigair')));
  setText('hud-slope', `${Math.round(Math.atan(slopeAt(p.d)) * 180 / Math.PI)}°`);
  setText('hud-dir', t(isSwitch() ? 'dir.switch' : 'dir.forward'));
  $('hud-gates-wrap').classList.toggle('hidden', !course.slalom);
  if (course.slalom) setText('hud-gates', `${run.gates} ✓ · ${run.missed} ✗`);
  // Spökjakt: hur långt före eller efter spöket man är
  const gap = ghostGap();
  $('hud-ghost-wrap').classList.toggle('hidden', gap === null);
  if (gap !== null) setText('hud-ghost', `${Math.round(gap) > 0 ? '+' : Math.round(gap) < 0 ? '−' : ''}${fmt(Math.abs(Math.round(gap)))} m`);
  const playing = state === 'playing';
  if (!playing) $('chain').classList.add('hidden');
  $('air-hint').classList.toggle('hidden', !(p.air && !p.smallAir && playing && !tutorial));
  $('balance').classList.toggle('hidden', !(p.grind && playing));
  if (p.grind) $('balance-dot').style.left = `${50 + clamp(p.balance, -1, 1) * 50}%`;
}
