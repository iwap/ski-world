// Spöken på vanliga banor: jakten får exakt samma bana (även med andra uppgraderingar och svårighetsgrad),
// spöket följer med, resultatet jämförs och min egen svårighetsgrad återställs. budget: 240000
runTest(async (t) => {
  save.lift = false;
  save.courses = Object.keys(COURSES);
  save.upgrades.skis = 0;
  save.difficulty = 'hard';
  difficulty = DIFFICULTIES.hard;
  setCourse('park');
  startRun();
  const key = (o) => `${o.type}:${o.x.toFixed(2)}:${o.d.toFixed(2)}`;
  const collect = (set) => () => {
    steerTo(0);
    for (const o of objects) if (o.type !== 'sign' && o.d < 900) set.add(key(o));
  };
  const seen1 = new Set();
  play(60 * 400, collect(seen1), { invuln: true, until: () => state === 'gameover' });
  keys.clear();
  const g = myGhosts.park;
  t.ok(g && g.data.length > 100, 'mitt åk sparades inte som spöke');
  if (!g) return;
  t.eq(g.difficulty, 'hard', 'spökets svårighetsgrad');
  if (player.finishRes) t.ok(g.time > 0, 'spöket kom i mål men har ingen tid');
  t.ok(JSON.parse(localStorage.getItem(GHOST_KEY)).park.seed === g.seed, 'spöket sparades inte i webbläsaren');

  // Jaga spöket med snabbare skidor och en annan vald svårighetsgrad
  save.difficulty = 'easy';
  difficulty = DIFFICULTIES.easy;
  save.upgrades.skis = 5;
  showMenu();
  t.ok(!$('btn-ghost-me').classList.contains('hidden'), 'knappen Jaga mitt bästa syns inte');
  $('btn-ghost-me').click();
  t.eq(state, 'playing', 'jakten startade inte');
  t.eq(save.difficulty, 'hard', 'jakten ska köras på spökets svårighetsgrad');
  t.eq(JSON.parse(localStorage.getItem(SAVE_KEY)).difficulty, 'easy', 'min svårighetsgrad sparades över');
  const seen2 = new Set();
  let gapSeen = false;
  let follows = true;
  let ghostD = 0;
  play(60 * 400, () => {
    collect(seen2)();
    if (ghostGap() !== null) gapSeen = true;
    const r = runSeed;
    if (r && r.ghost && state === 'playing' && r.t > 0.5) {
      const d = -r.ghost.mesh.position.z;
      if (!r.ghost.mesh.visible || Math.abs(d - ghostAt(g.data, r.t).d) > 2) follows = false;
      ghostD = Math.max(ghostD, d);
    }
  }, { invuln: true, until: () => state === 'gameover' });
  keys.clear();
  const missing = [...seen1].filter((k) => !seen2.has(k));
  const extra = [...seen2].filter((k) => !seen1.has(k));
  t.ok(seen1.size > 30, `för få hinder (${seen1.size})`);
  t.ok(!missing.length && !extra.length, `banan blev inte likadan: ${missing.length} saknas, ${extra.length} nya (${missing.slice(0, 3).join(' ')} | ${extra.slice(0, 3).join(' ')})`);
  t.ok(gapSeen, 'spökmätaren visades aldrig');
  t.ok(follows && ghostD > 300, `spöket följer inte med (${Math.round(ghostD)} m)`);
  t.ok($('go-race').textContent.includes('👻'), `ingen jämförelse med spöket (${$('go-race').textContent})`);

  // "Åk igen" jagar samma spöke igen
  $('btn-again').click();
  t.ok(runSeed && runSeed.ghost && runSeed.seed === g.seed, 'Åk igen jagade inte spöket');
  showMenu();
  t.ok(!runSeed, 'jakten avslutades inte');
  t.eq(save.difficulty, 'easy', 'min svårighetsgrad återställdes inte');

  // Ett vanligt åk efter jakten har ett nytt frö
  startRun();
  t.ok(runSeed && !runSeed.ghost && runSeed.seed !== g.seed, 'vanligt åk efter jakten');
  showMenu();

  // Lokala topplistan: spökknappen på bästa raden
  boardMode = 'local';
  showBoard('park');
  t.eq(document.querySelectorAll('#lb-body .lb-ghost').length, 1, 'spökknapp i lokala topplistan');
  showMenu();
  t.note(`${seen1.size} hinder likadana, spöket ${g.time} s`);
});
