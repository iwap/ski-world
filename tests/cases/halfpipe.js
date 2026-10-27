// Halfpipe: i högsta fart blir luften inte orimligt hög, och landningen studsar inte på kanten. budget: 120000
runTest(async (t) => {
  save.lift = false;
  save.courses = Object.keys(COURSES);
  save.upgrades.skis = 5;
  setCourse('pipe');
  startRun();
  let side = 1;
  let maxZ = 0;
  let landings = 0;
  let bounces = 0;
  let sinceLand = 99;
  let wasAir = false;
  let wasPipeAir = false;
  play(60 * 40, () => {
    keys.delete('ArrowLeft');
    keys.delete('ArrowRight');
    if (!player.air) {
      const want = side * 0.9;
      if (player.angle < want - 0.05) keys.add('ArrowRight');
      else if (player.angle > want + 0.05) keys.add('ArrowLeft');
      if (Math.abs(player.x) > PIPE_COPING - 1 && Math.sign(player.x) === side) side = -side;
    } else maxZ = Math.max(maxZ, player.z);
    // Landning från väggen följd av ett "fall" (studs) strax efter
    sinceLand += 1 / 60;
    if (wasAir && !player.air && wasPipeAir) {
      landings++;
      sinceLand = 0;
    }
    if (!wasAir && player.air && player.smallAir && sinceLand < 0.6) bounces++;
    wasAir = player.air;
    wasPipeAir = !!player.pipeAir;
  }, { invuln: true });
  keys.clear();
  t.ok(maxZ > 2, `ingen luft i pipen (${maxZ.toFixed(1)} m)`);
  t.ok(maxZ < 10, `för hög luft (${maxZ.toFixed(1)} m)`);
  t.ok(landings > 5, `för få landningar i pipen (${landings})`);
  t.eq(bounces, 0, 'studsar på kanten efter landning');
  // Förlåtande landning i pipen: en lite sned 180 och en nästan färdig volt går bra här, men inte i en vanlig backe
  const tryLand = (spin, flipProg) => {
    Object.assign(player, { spin, flipping: flipProg > 0, flipProg, flipDir: 1, flips: 0, frontFlips: 0 });
    player.combo = { parts: [], pts: 0 };
    return collectAirTricks();
  };
  player.d = 200;
  t.eq(tryLand(Math.PI + 0.9, 0), null, 'sned 180 i pipen ska gå att landa');
  t.eq(tryLand(0, 0.6), null, 'nästan färdig volt i pipen ska gå att landa');
  setCourse('classic');
  startRun();
  player.d = 200;
  t.eq(tryLand(Math.PI + 0.9, 0), 'crash.crooked', 'sned 180 i vanlig backe ska fortfarande krascha');
  showMenu();
  t.note(`högsta luft ${maxZ.toFixed(1)} m, ${landings} landningar`);
});
