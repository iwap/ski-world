'use strict';
// Pekknappar på mobil och surfplatta.

// ---------- Pekknappar ----------

// Knapparna låtsas vara tangenter, så att spellogiken är densamma som med tangentbord
function virtualDown(code) {
  if (!keys.has(code)) pressed.add(code);
  keys.add(code);
}

// Grab-knappen: riktningen du håller samtidigt väljer grab (ingen = Indy). ▶ = cork.
function touchGrabKey() {
  if (keys.has('ArrowLeft')) return 'KeyG';
  if (keys.has('ArrowRight')) return 'KeyR';
  if (keys.has('ArrowUp')) return 'KeyV';
  if (keys.has('ArrowDown')) return 'KeyQ';
  return 'KeyF';
}

const touchHeld = new Map(); // knapp -> tangentkod som hålls nere

function releaseTouch(btn) {
  const code = touchHeld.get(btn);
  if (!code) return;
  touchHeld.delete(btn);
  keys.delete(code);
  btn.classList.remove('on');
}

for (const btn of document.querySelectorAll('#touch-ui [data-key]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init();
    btn.setPointerCapture(e.pointerId);
    const code = btn.dataset.key === 'grab' ? touchGrabKey() : btn.dataset.key;
    touchHeld.set(btn, code);
    btn.classList.add('on');
    virtualDown(code);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => releaseTouch(btn));
}
$('tc-pause').addEventListener('click', () => {
  if (state === 'spectate') {
    leaveSession();
    resetWorld();
    showMenu();
  } else {
    togglePause();
  }
});
$('tc-cam').addEventListener('click', () => toggleCamera());
// Inga långtryck-menyer eller dubbeltrycks-zoom på spelytan
document.addEventListener('contextmenu', (e) => { if (TOUCH) e.preventDefault(); });

let touchUiShown = false;
function updateTouchUi() {
  const show = TOUCH && state === 'playing' && !tutorial;
  if (show === touchUiShown) return;
  touchUiShown = show;
  $('touch-ui').classList.toggle('hidden', !show);
  if (!show) for (const btn of [...touchHeld.keys()]) releaseTouch(btn);
}

// Mobil: helskärm och liggande läge när man trycker på START (fungerar på Android, iPhone ignorerar det)
function enterMobileFullscreen() {
  if (!TOUCH || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}
$('btn-start').addEventListener('click', enterMobileFullscreen);
