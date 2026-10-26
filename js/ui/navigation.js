'use strict';
// Skärmar och tangentbordsnavigering i menyerna.

// ---------- Skärmar ----------

const OVERLAYS = ['intro', 'menu', 'shop', 'gameover', 'pause', 'board', 'settings', 'help', 'characters', 'badges', 'box', 'party', 'tutask', 'reset1', 'reset2', 'daily', 'sessres'];

function showOverlay(name) {
  for (const id of OVERLAYS) $(id).classList.toggle('hidden', id !== name);
  $('hud').classList.toggle('hidden', ['intro', 'menu', 'shop', 'board', 'settings', 'help', 'characters', 'badges', 'box', 'party', 'tutask', 'reset1', 'reset2', 'daily', 'sessres'].includes(name));
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (name) focusDefault(name);
}

// ---------- Tangentbordsnavigering i menyerna ----------

const activeOverlay = () => OVERLAYS.find((id) => !$(id).classList.contains('hidden')) || null;

function focusables(overlay) {
  return [...$(overlay).querySelectorAll('button, input, select, a[href]')].filter((el) => !el.disabled && el.offsetParent !== null);
}

function focusDefault(overlay) {
  const el = $(overlay).querySelector('[data-autofocus]') || focusables(overlay)[0];
  if (el) el.focus();
}

// Flytta markeringen till närmaste knapp i pilens riktning (fungerar både i listor och rutnät)
function moveFocus(overlay, dir) {
  const els = focusables(overlay);
  const cur = document.activeElement;
  if (!els.includes(cur)) return focusDefault(overlay);
  const r0 = cur.getBoundingClientRect();
  const cx = r0.left + r0.width / 2;
  const cy = r0.top + r0.height / 2;
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  let best = null;
  let bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const along = (vertical ? dy : dx) * sign;
    if (along <= 4) continue;
    if (!vertical && Math.abs(dy) > r0.height * 0.6) continue; // vänster/höger stannar på samma rad
    const score = along + Math.abs(vertical ? dx : dy) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) {
    // Inget i den riktningen: gå runt (vänster/höger följer ordningen i listan)
    const i = els.indexOf(cur);
    best = vertical ? els[sign > 0 ? 0 : els.length - 1] : els[(i + sign + els.length) % els.length];
  }
  best.focus();
  Sound.tick();
}

function goBack(overlay) {
  if (overlay === 'pause') togglePause();
  else if (overlay === 'intro') leaveIntro();
  else if (overlay !== 'menu') {
    if (overlay === 'characters') applyLook();
    if (overlay === 'box') {
      if (!boxSpinning) showCharacters();
      return;
    }
    showMenu();
  }
}

// Behåll markeringen på samma plats när butiken ritas om efter ett köp
function keepFocus(overlay, render) {
  const idx = focusables(overlay).indexOf(document.activeElement);
  render();
  const els = focusables(overlay);
  if (idx >= 0 && els.length) els[Math.min(idx, els.length - 1)].focus();
}
