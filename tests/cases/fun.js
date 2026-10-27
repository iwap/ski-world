// Fun slope: banan slingrar med skarpa svängar, ett hopp på varje rakt parti, och man kommer inte förbi kanterna. budget: 120000
runTest(async (t) => {
  save.courses = Object.keys(COURSES);
  save.lift = false;
  setCourse('fun');
  startRun();
  spawnUntil(runLength());
  const xs = [];
  for (let d = 0; d < runLength(); d += 10) xs.push(courseX(d));
  t.ok(Math.max(...xs) > 10 && Math.min(...xs) < -10, 'banan slingrar inte');
  t.ok(Math.abs(courseX(0)) < 0.1 && Math.abs(courseX(runLength())) < 0.1, 'start och mål ska ligga mitt i backen');
  // Brantaste svängen
  let sharp = 0;
  for (let d = 0; d < runLength(); d += 1) sharp = Math.max(sharp, Math.abs(courseX(d + 1) - courseX(d)));
  t.ok(sharp > 0.7, `svängarna är inte skarpa (${sharp.toFixed(2)})`);
  const ramps = objects.filter((o) => o.type === 'ramp');
  t.ok(ramps.length >= 10, `för få hopp (${ramps.length})`);
  t.ok(ramps.every((o) => !o.ramp.mega && ['green', 'blue', 'red'].includes(o.ramp.grade)), 'fel sorts hopp');
  // Hoppet och hela landningen ligger på ett rakt parti
  t.ok(ramps.every((o) => Math.abs(courseX(o.feature.d0) - courseX(o.feature.d3)) < 0.01), 'ett hopp ligger i en sväng');

  // Följ banans mitt: kommer i mål och flyger ordentligt från hoppen
  let maxZ = 0;
  let airs = 0;
  let wasAir = false;
  play(60 * 200, () => {
    steerTo(courseX(player.d + 10), 10);
    if (player.air && !player.smallAir) maxZ = Math.max(maxZ, player.z);
    if (player.air && !player.smallAir && !wasAir) airs++;
    wasAir = player.air && !player.smallAir;
  }, { invuln: true, until: () => state !== 'playing' });
  keys.clear();
  t.ok(['finish', 'lift', 'menu'].includes(state) || player.d >= runLength(), `kom inte i mål (${state}, ${Math.round(player.d)} m)`);
  t.ok(airs >= 8 && maxZ > 1.5, `för lite luft (${airs} hopp, högst ${maxZ.toFixed(1)} m)`);

  // Håll höger hela tiden: man kommer aldrig utanför kanten
  setCourse('fun');
  startRun();
  let edge = 0;
  play(60 * 40, () => {
    keys.add('ArrowRight');
    edge = Math.max(edge, Math.abs(player.x - courseX(player.d)));
  }, { invuln: true, until: () => state !== 'playing' });
  keys.clear();
  t.ok(edge <= netX(), `kom utanför kanten (${edge.toFixed(1)} m från mitten)`);
  // Utan att styra alls: vallarna i svängarna styr runt åkaren, så man fastnar inte mot kanten
  setCourse('fun');
  startRun();
  let slowest = 99;
  play(60 * 60, () => {
    keys.clear();
    if (player.d > 60) slowest = Math.min(slowest, player.speed);
  }, { invuln: true, until: () => player.d > 600 || state !== 'playing' });
  t.ok(player.d > 600, `fastnade utan att styra (${Math.round(player.d)} m)`);
  t.ok(slowest > 5, `tappade nästan all fart mot kanten (${slowest.toFixed(1)} m/s)`);
  t.note(`${ramps.length} hopp, ${airs} luftfärder, högst ${maxZ.toFixed(1)} m`);
  showMenu();
  setCourse('classic');
});
