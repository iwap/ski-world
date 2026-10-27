// Cork (G): ett snett snurr i luften som ger poäng, kraschar om det inte hinner bli klart, och Mute grab är borta. budget: 60000
runTest(async (t) => {
  save.lift = false;
  t.ok(!GRABS.some((g) => g.key === 'KeyG'), 'G ska inte längre vara en grab');
  // Hoppa högt, tryck G och låt corken bli klar före landningen
  const jumpCork = (pressAt, vz) => {
    setCourse('classic');
    startRun();
    objects.forEach(removeObject);
    objects = [];
    features = [];
    nextSpawnD = 1e9;
    player.d = 40;
    player.speed = 12;
    launch(vz);
    let maxTilt = 0;
    let parts = null;
    let i = 0;
    play(60 * 6, () => {
      keys.clear();
      if (i++ === pressAt) { keys.add('KeyG'); pressed.add('KeyG'); }
      if (player.corking) maxTilt = Math.max(maxTilt, player.corkProg);
      if (!player.air && player.combo.parts.length) parts = player.combo.parts.slice();
    }, { until: () => !player.air || state !== 'playing' });
    return { state, parts: player.combo.parts.slice(), reason: player.crashReason, run: run.tricks, maxTilt };
  };
  const ok = jumpCork(3, 14);
  t.ok(ok.state === 'playing', `kraschade på en hel cork (${ok.reason})`);
  t.ok(ok.run > 0 || ok.parts.some((s) => /Cork/.test(s)), `corken gav inga poäng (${ok.parts.join(', ')})`);
  t.ok(ok.maxTilt > 0.5, 'corken startade inte');
  t.ok(save.badges.cork, 'märket Korkskruv tjänades inte in');
  player.lives = 0;
  const late = (() => {
    setCourse('classic');
    startRun();
    player.lives = 0;
    objects.forEach(removeObject);
    objects = [];
    features = [];
    nextSpawnD = 1e9;
    player.d = 40;
    player.speed = 12;
    launch(5);
    let i = 0;
    let done = false;
    play(60 * 4, () => {
      keys.clear();
      i++;
      // Tryck G strax före landningen
      if (!done && player.air && player.vz < 0 && player.z < 1) { keys.add('KeyG'); pressed.add('KeyG'); done = true; }
    }, { until: () => state !== 'playing' || (!player.air && i > 5) });
    return { state, reason: player.crashReason };
  })();
  t.ok(late.state !== 'playing', `en halv cork vid landningen borde krascha (${late.state})`);
  t.eq(trickSig({ sig: ['cork1', 'spin360'] }).join(','), 'cork1,spin360', 'trick-duellen känner igen cork');
  t.eq(sigLabel(['cork1']), 'Cork 360', 'cork har ett namn i trick-duellen');
  showMenu();
});
