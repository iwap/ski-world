// Halfpipe: i högsta fart blir luften inte orimligt hög. budget: 120000
runTest(async (t) => {
  save.lift = false;
  save.courses = Object.keys(COURSES);
  save.upgrades.skis = 5;
  setCourse('pipe');
  startRun();
  let side = 1;
  let maxZ = 0;
  play(60 * 40, () => {
    keys.delete('ArrowLeft');
    keys.delete('ArrowRight');
    if (!player.air) {
      const want = side * 0.9;
      if (player.angle < want - 0.05) keys.add('ArrowRight');
      else if (player.angle > want + 0.05) keys.add('ArrowLeft');
      if (Math.abs(player.x) > PIPE_COPING - 1 && Math.sign(player.x) === side) side = -side;
    } else maxZ = Math.max(maxZ, player.z);
  }, { invuln: true });
  keys.clear();
  t.ok(maxZ > 2, `ingen luft i pipen (${maxZ.toFixed(1)} m)`);
  t.ok(maxZ < 7, `för hög luft (${maxZ.toFixed(1)} m)`);
  t.note(`högsta luft ${maxZ.toFixed(1)} m`);
});
