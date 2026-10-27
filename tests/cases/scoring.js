// Poäng: ×2 på alla banor utom halfpipe och Big Air, och dubbla poäng när man klarar hela banan. budget: 60000
runTest(async (t) => {
  save.courses = Object.keys(COURSES);
  save.upgrades.coins = 0;
  save.lift = false;
  const at = (c) => {
    setCourse(c);
    startRun();
    player.d = 1000;
    run.tricks = 0;
    run.stars = 0;
    return runScore();
  };
  const base = at('pipe');
  t.ok(Math.abs(at('bigair') / COURSE_REWARD.bigair - base / COURSE_POINTS.pipe / COURSE_REWARD.pipe) < 2, 'Big Air ska ha samma poäng per meter som halfpipe (före pengabonus)');
  for (const c of ['classic', 'park', 'moguls', 'slalom', 'offpiste']) {
    t.ok(Math.abs(at(c) / COURSE_REWARD[c] - 2 * base / COURSE_POINTS.pipe / COURSE_REWARD.pipe) < 2, `${c} ska ge dubbla poäng`);
  }
  // Klarar hela banan: hela åket dubblas
  setCourse('classic');
  startRun();
  player.d = runLength() + 1;
  run.tricks = 400;
  player.air = false;
  const before = runScore();
  finishRun();
  t.eq(runScore(), (before + run.finishBonus) * 2, 'poängen ska dubblas i mål');
  t.ok(save.leaderboard.some((e) => e.score === (before + run.finishBonus) * 2), 'det dubblade resultatet ska sparas');
  showMenu();
});
