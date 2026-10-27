// Spöken online: bästa åket laddas upp efter resultatet, och andras spöken i topplistan går att jaga. budget: 120000
runTest(async (t) => {
  const calls = [];
  let replay = null;
  window.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const json = (v) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } });
    if (String(url).includes('rpc/save_course_replay')) return json(true);
    if (String(url).includes('course_replays?select=player_id')) return json([{ player_id: 'p2' }]);
    if (String(url).includes('course_replays?select=name')) return json(replay ? [replay] : []);
    if (String(url).includes('best_scores') && !String(url).includes('player_id=eq')) return json([{ player_id: 'p2', name: 'Anna', score: 900, dist: 1500, course: 'classic', difficulty: 'normal', rider: 'ski', created_at: new Date().toISOString() }]);
    return json([]);
  };
  save.lift = false;
  save.difficulty = 'normal';
  difficulty = DIFFICULTIES.normal;
  setCourse('classic');
  startRun();
  play(60 * 400, () => steerTo(0), { invuln: true, until: () => state === 'gameover' });
  keys.clear();
  await wait(300);
  const up = calls.find((c) => c.url.includes('rpc/save_course_replay'));
  t.ok(up, 'spöket laddades inte upp');
  if (!up) return;
  t.eq(up.body.p_course, 'classic', 'bana');
  t.eq(up.body.p_seed, myGhosts.classic.seed, 'frö');
  t.ok(Array.isArray(up.body.p_data) && JSON.stringify(up.body.p_data).length < 120000, 'inspelningen är för stor');
  t.ok(calls.findIndex((c) => c.url.includes('/scores') && c.method === 'POST') < calls.indexOf(up), 'spöket skickades före resultatet');

  // Annas spöke = mitt åk under hennes namn; topplistan visar 👻 och jakten startar
  replay = { name: 'Anna', score: 900, difficulty: 'normal', rider: 'ski', seed: up.body.p_seed, cruise: up.body.p_cruise, jump: up.body.p_jump, time: 80, data: up.body.p_data };
  showMenu();
  boardMode = 'global';
  showBoard('classic');
  await wait(200);
  const btn = document.querySelector('#lb-body .lb-ghost');
  t.ok(btn, 'ingen spökknapp i globala topplistan');
  if (!btn) return;
  btn.click();
  await wait(200);
  t.eq(state, 'playing', 'jakten startade inte');
  t.ok(runSeed && runSeed.ghost && runSeed.ghost.name === 'Anna', 'fel spöke');
  play(120, null, { invuln: true });
  showMenu();
});
