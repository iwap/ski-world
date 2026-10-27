// Tomtens presenter: 100 per omgång, lika på alla banor, samma platser för alla. Först till presenten får 500,
// tagna presenter syns inte, och backen byggs likadant med presenter. budget: 60000
runTest(async (t) => {
  const calls = [];
  let taken = [0, 7];   // redan tagna av andra
  let first = true;     // servern: jag hinner först
  window.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    const json = (v) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } });
    if (String(url).includes('present_claims')) return json(taken.map((idx) => ({ idx })));
    if (String(url).includes('rpc/claim_present')) return json(first);
    return json([]);
  };
  // Spelets loop kan redan ha hämtat presenterna innan testet bytte server: börja om
  presents.win = null;
  presents.announced = null;
  save.courses = Object.keys(COURSES);
  save.lift = false;
  // Lika många på varje bana
  const per = {};
  for (let i = 0; i < PRESENT_COUNT; i++) per[presentSpot(1, i).course] = (per[presentSpot(1, i).course] || 0) + 1;
  t.ok(Object.values(per).every((n) => n >= 14 && n <= 15) && Object.keys(per).length === Object.keys(COURSES).length, `ojämnt fördelat ${JSON.stringify(per)}`);
  t.eq(JSON.stringify(presentSpot(5, 3)), JSON.stringify(presentSpot(5, 3)), 'samma plats för alla');

  setCourse('classic');
  startRun();
  play(60 * 2);
  // Vänta tills servern har svarat om vilka som är tagna
  for (let i = 0; i < 40 && presents.claimed.size < 2; i++) {
    await wait(50);
    play(2);
  }
  t.ok(!$('present-toast').classList.contains('hidden'), 'meddelandet om presenterna visades inte');
  t.ok($('present-text').textContent.includes(t2('present.spawn')), 'fel text');
  showMenu();
  play(2);
  t.ok(!$('present-timer').classList.contains('hidden') && /\d+:\d\d/.test($('present-timer').textContent), `nedräkningen syns inte (${$('present-timer').textContent})`);
  t.ok($('present-timer').textContent.includes(String(PRESENT_COUNT - 2)), `antal kvar visas inte (${$('present-timer').textContent})`);
  startRun();
  play(2);
  spawnUntil(runLength());
  play(2);
  const mine = objects.filter((o) => o.type === 'present' && !o.taken);
  t.eq(mine.length, 15 - 2, 'fel antal presenter på Klassisk (två redan tagna)');
  t.ok(mine.every((o) => o.idx % Object.keys(COURSES).length === 0), 'presenter från en annan bana');

  // Åk igenom en present: jag var först
  const bank0 = save.bank;
  const p = mine[0];
  player.x = p.x;
  player.d = p.d - 1;
  player.z = 0;
  player.air = false;
  play(30, () => { player.x = p.x; }, { invuln: true });
  await wait(100);
  t.ok(p.taken, 'presenten togs inte');
  const claim = calls.find((c) => c.url.includes('rpc/claim_present'));
  t.ok(claim && claim.body.p_idx === p.idx && claim.body.p_win === presentWin(), 'servern fick inte rätt present');
  t.eq(save.bank - bank0, PRESENT_PAY, 'fick inte 500');

  // Någon annan hann före: inga pengar
  first = false;
  const q = mine[1];
  const bank1 = save.bank;
  player.x = q.x;
  player.d = q.d - 1;
  play(30, () => { player.x = q.x; }, { invuln: true });
  await wait(100);
  t.eq(save.bank, bank1, 'fick pengar fast någon annan var först');

  // Servern svarar med fel (t.ex. tabellen saknas): inga pengar, inget "någon hann före", presenten kommer tillbaka
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => (String(url).includes('rpc/claim_present') ? new Response('{}', { status: 404 }) : realFetch(url, opts));
  const r = mine[2];
  const bank2 = save.bank;
  const pops = () => $('popups').textContent;
  $('popups').innerHTML = '';
  player.x = r.x;
  player.d = r.d - 1;
  play(30, () => { player.x = r.x; }, { invuln: true });
  await wait(100);
  t.eq(save.bank, bank2, 'fick pengar trots serverfel');
  t.ok(!pops().includes(t2('present.gone')), 'serverfel visades som att någon hann före');
  t.ok(!r.taken, 'presenten försvann trots serverfel');
  window.fetch = realFetch;
  // Utan svar om vilka som är tagna läggs inga presenter ut
  presents.win = null;
  window.fetch = async () => new Response('{}', { status: 404 });
  setCourse('park');
  startRun();
  play(60);
  await wait(100);
  play(60);
  t.eq(objects.filter((o) => o.type === 'present').length, 0, 'presenter lades ut fast servern inte svarade');
  window.fetch = realFetch;
  presents.win = null;
  play(2);
  for (let i = 0; i < 40 && !presents.ready; i++) { await wait(50); play(2); }

  // Backen byggs likadant med presenter (race och spöken)
  const layout = () => objects.filter((o) => o.type !== 'present' && o.type !== 'sign').map((o) => `${o.type}@${o.x.toFixed(2)},${o.d.toFixed(2)}`).join('|');
  // Backen byggs bit för bit medan presenterna läggs ut, precis som när man åker
  const build = (withP) => {
    worldRng = mulberry32(42);
    resetWorld();
    for (let d = VIEW_AHEAD; d < runLength() + 50; d += 40) {
      spawnUntil(d);
      if (withP) placePresents();
    }
    worldRng = null;
  };
  taken = [];
  presents.claimed = new Set();
  build(true);
  t.ok(objects.filter((o) => o.type === 'present').length >= 14, 'inga presenter lades ut i testet');
  const withPresents = layout();
  build(false);
  t.eq(layout(), withPresents, 'presenterna ändrade backen');
  showMenu();
});
function t2(k) { return window.t(k); }
