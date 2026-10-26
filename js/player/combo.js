'use strict';
// Combos och trickkedjor.

const CHAIN_TIME = 3;
const TRICK_COOLDOWN = 0.25; // sekunder mellan två volter i luften
const TRICK_SCALE = 0.5; // trickpoängen halveras
const chainMult = (n) => Math.min(4, 1 + 0.5 * (n - 1));

function finishCombo() {
  const c = player.combo;
  if (c.parts.length && c.pts > 0) {
    const mult = Math.max(1, c.parts.length - (c.noMult || 0));
    // Trickkedja: landar du ett nytt trick innan tiden tar slut växer kedjan
    const ch = player.chain;
    ch.n = ch.timer > 0 ? ch.n + 1 : 1;
    ch.timer = CHAIN_TIME;
    const cm = chainMult(ch.n);
    const pts = Math.round(c.pts * mult * cm * TRICK_SCALE * (1 + ability('tricks')) / (course.mega || course.pipe ? 3 : 1)); // Big Air och halfpipe: en tredjedel
    partyCombo(c, Math.round(c.pts * mult)); // trick-duell och Big Air-tävling
    run.tricks += pts;
    run.maxChain = Math.max(run.maxChain || 0, ch.n);
    if (c.parts.length - (c.noMult || 0) >= 3) earnBadge('combo3');
    if (ch.n >= 3) earnBadge('chain3');
    if (ch.n >= 5) earnBadge('chain5');
    Sound.combo(mult + ch.n - 1);
    const extra = [mult > 1 ? `combo x${mult}` : '', ch.n > 1 ? `🔥 ${t('chain.label')} x${cm}` : ''].filter(Boolean).join(' · ');
    popup(c.parts.join(' + '), `+${fmt(pts)}${extra ? ` (${extra})` : ''}`, ch.n > 1 ? '#d84315' : '#ef6c00');
  }
  player.combo = { parts: [], pts: 0 };
}

// Kedjans tid räknas bara ner när man står på snön
function updateChain(dt) {
  const p = player;
  const ch = p.chain;
  // Tiden räknas ner även i luften, men står still medan man faktiskt gör ett trick (rotation, grab eller grind)
  const tricking = p.grind || (p.air && (p.flipping || p.flips > 0 || p.frontFlips > 0 || Math.abs(p.spin) > 0.5 || currentGrab()));
  if (ch.timer > 0 && !tricking) {
    ch.timer -= dt;
    if (ch.timer <= 0) {
      ch.timer = 0;
      if (ch.n >= 3) popup(`🔥 ${t('chain.done', { n: ch.n })}`, '', '#d84315');
      ch.n = 0;
    }
  }
  const show = ch.n >= 1 && ch.timer > 0 && state === 'playing';
  $('chain').classList.toggle('hidden', !show);
  if (show) {
    setText('chain-text', `🔥 ${t('chain.label')} x${chainMult(ch.n + 1)}`);
    $('chain-bar').style.width = `${(ch.timer / CHAIN_TIME) * 100}%`;
  }
}
