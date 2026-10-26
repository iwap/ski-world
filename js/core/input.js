'use strict';
// Tangentbord: styrning i spelet och navigering i menyerna.

// ---------- Input ----------

const keys = new Set();
const pressed = new Set();
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyT', 'KeyC', ...GRABS.map((g) => g.key)];

const ARROW_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

window.addEventListener('keydown', (e) => {
  const overlay = activeOverlay();
  // Namnfältet: skriv fritt, ↑/↓ eller Enter flyttar vidare
  if (e.target instanceof HTMLInputElement) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter') {
      e.preventDefault();
      moveFocus(overlay, e.code === 'ArrowUp' ? 'up' : 'down');
    } else if (e.code === 'Escape') {
      e.target.blur();
    }
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) setAudio('music', !save.audio.music);
  // Menyer: piltangenter flyttar markeringen, Enter/Space trycker på knappen, Esc går tillbaka
  if (overlay) {
    // En tangent som hölls nere under åket (t.ex. vid en krasch) ska inte styra menyn förrän den släppts
    if (keys.has(e.code)) {
      e.preventDefault();
      return;
    }
    const dir = ARROW_DIRS[e.code];
    const el = document.activeElement;
    if (el && el.id === 'course-card' && (dir === 'left' || dir === 'right')) {
      e.preventDefault();
      cycleCourse(dir === 'right' ? 1 : -1);
    } else if (el instanceof HTMLSelectElement && (dir === 'left' || dir === 'right')) {
      e.preventDefault();
      const i = clamp(el.selectedIndex + (dir === 'right' ? 1 : -1), 0, el.options.length - 1);
      if (i !== el.selectedIndex) {
        el.selectedIndex = i;
        el.dispatchEvent(new Event('change'));
        Sound.tick();
      }
    } else if (dir) {
      e.preventDefault();
      moveFocus(overlay, dir);
    } else if (e.code === 'Escape' || (overlay === 'pause' && e.code === 'KeyP')) {
      e.preventDefault();
      goBack(overlay);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && !$(overlay).contains(document.activeElement)) {
      e.preventDefault();
      focusDefault(overlay);
    }
    return;
  }
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  // Under tutorialen styr boten – Esc/Enter hoppar över
  if (tutorial) {
    if (!e.repeat && (e.code === 'Escape' || e.code === 'Enter')) endTutorial();
    return;
  }
  // Emojis i online-lägen: 1–4
  const emo = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (emo >= 0 && !e.repeat && (race || lastSession)) sendEmote(emo);
  if (state === 'spectate' && e.code === 'Escape' && !e.repeat) {
    leaveSession();
    resetWorld();
    showMenu();
    return;
  }
  if (e.code === 'KeyC' && !e.repeat && (state === 'playing' || state === 'lift')) toggleCamera();
  if (state === 'lift' && !e.repeat && (e.code === 'Enter' || e.code === 'Escape')) return endLift(); // hoppa över liften
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) togglePause();
});
window.addEventListener('keyup', (e) => { if (!tutorial) keys.delete(e.code); });
window.addEventListener('blur', () => {
  if (tutorial) return;
  keys.clear();
  if (state === 'playing') togglePause();
});

const isLeft = () => keys.has('ArrowLeft') || keys.has('KeyA');
const isRight = () => keys.has('ArrowRight') || keys.has('KeyD');
const isDown = () => keys.has('ArrowDown') || keys.has('KeyS');
const isTuck = () => keys.has('KeyT'); // ducka för mer fart på marken
const currentGrab = () => GRABS.find((g) => keys.has(g.key)) || null; // grab i luften
const isGrab = () => !!currentGrab();
const wasPressed = (...codes) => codes.some((c) => pressed.has(c));

// Pekskärm (mobil/surfplatta): knappar på skärmen istället för tangentbord. ?touch=1 tvingar fram det.
const TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches || /[?&]touch=1/.test(location.search);
if (TOUCH) {
  document.body.classList.add('touch');
  $('air-hint').dataset.i18n = 'hint.airTouch';
  document.querySelector('.intro-hint').dataset.i18n = 'intro.hintTouch';
}
