// Big Air-banan: i normal och högsta fart kommer man över alla gap, för långsam = ner i gapet. budget: 300000
runTest(async (t) => {
  save.lift = false;
  save.upgrades.helmet = 3;
  save.courses = Object.keys(COURSES);
  const weights = { ...COURSES.bigair.weights };
  Object.assign(COURSES.bigair.weights, { tree: 0, pine: 0, stump: 0 }); // inga träd i vägen för boten
  for (const skis of [0, 5]) {
    save.upgrades.skis = skis;
    setCourse('bigair');
    startRun();
    let jumps = 0;
    let wasAir = false;
    play(60 * 300, () => {
      if (player.air && !player.smallAir && !wasAir) jumps += 1;
      wasAir = player.air;
    }, { until: () => state !== 'playing' });
    t.ok(state === 'finish' || player.d >= runLength() - 5, `skidor ${skis}: kom inte i mål (${player.crashReason}, ${Math.round(player.d)} m)`);
    t.ok(jumps >= 6, `skidor ${skis}: bara ${jumps} hopp`);
    t.note(`skidor ${skis}: ${jumps} hopp`);
  }
  // För långsamt på kickern
  save.upgrades.skis = 0;
  setCourse('bigair');
  startRun();
  const f = features.find((q) => q.mega);
  play(60 * 30, () => {
    if (!player.air && player.d > f.lip - 3 && player.d < f.lip) player.speed = Math.min(player.speed, 6);
  }, { until: () => state !== 'playing' && state !== 'crashing' });
  t.eq(player.crashReason, t2('crash.gap'), 'för långsam åkare hamnar inte i gapet');
  t.eq(player.lives, 0, 'gapet tar inte alla liv');
  Object.assign(COURSES.bigair.weights, weights);
  function t2(k) { return window.t(k); }
});
