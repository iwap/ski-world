// Tutorialen: boten klarar alla steg utan krasch (även corken) och kommer tillbaka till menyn. budget: 60000
runTest(async (t) => {
  let crashes = 0;
  const realCrash = window.crash;
  startTutorial();
  const lives0 = player.lives;
  let corked = false;
  play(60 * 120, () => {
    if (player.lives < lives0 - crashes) crashes = lives0 - player.lives;
    if (player.corking) corked = true;
  }, { until: () => !tutorial });
  t.ok(corked, 'boten visade ingen cork');
  t.ok(!tutorial, 'tutorialen tog inte slut');
  t.eq(state, 'menu', 'kom inte tillbaka till menyn');
  t.eq(crashes, 0, 'boten kraschade');
  t.ok(save.tutorialSeen, 'tutorialSeen sattes inte');
  t.ok(realCrash === window.crash, 'crash ersattes');
});
