// Hjälpfunktioner för testerna. Varje testfall anropar runTest(async (t) => { ... }).
// Resultatet skrivs i sidans titel som JSON så att run.mjs kan läsa det.
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(`${e.message} @${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(`promise: ${e.reason}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Kör spelet n bildrutor (1/60 s) som huvudloopen gör, utan rendering. hook(i) körs före varje bildruta.
function play(n, hook, opts = {}) {
  for (let i = 0; i < n; i++) {
    if (hook && hook(i) === false) break;
    if (opts.invuln) player.invuln = 5;
    if (state === 'countdown') updateCountdown();
    else if (state === 'playing') {
      if (tutorial) updateTutorial(1 / 60);
      update(1 / 60);
      if (state === 'playing') updateNpcs(1 / 60);
    } else if (state === 'crashing') updateCrash(1 / 60);
    else if (state === 'finish') updateFinish(1 / 60);
    else if (state === 'lift') updateLift(1 / 60);
    updateRace(1 / 60);
    updateDaily(1 / 60);
    pressed.clear();
    if (opts.until && opts.until()) break;
  }
}

// Enkel autopilot: styr mot x (på marken)
function steerTo(x, ahead = 12) {
  keys.delete('ArrowLeft');
  keys.delete('ArrowRight');
  if (player.air) return;
  const want = Math.atan2(x - player.x, ahead) * 0.7;
  if (player.angle < want - 0.04) keys.add('ArrowRight');
  else if (player.angle > want + 0.04) keys.add('ArrowLeft');
}

function runTest(fn, delay = 300) {
  setTimeout(async () => {
    const fails = [];
    const notes = [];
    const t = {
      ok(cond, msg) { if (!cond) fails.push(msg); },
      eq(a, b, msg) { if (a !== b) fails.push(`${msg}: fick ${JSON.stringify(a)}, väntade ${JSON.stringify(b)}`); },
      note(msg) { notes.push(msg); },
    };
    try {
      save.lang = 'sv';
      applyLanguage();
      await fn(t);
    } catch (e) {
      fails.push(`undantag: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    }
    for (const e of window.__errors) fails.push(`JS-fel: ${e}`);
    document.title = JSON.stringify({ ok: fails.length === 0, fails, notes });
  }, delay);
}
