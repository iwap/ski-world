// Dagens utmaning: samma bana varje gång, spöket följer med, egen bana återställs och sparas aldrig över. budget: 120000
runTest(async (t) => {
  save.lift = false;
  showMenu();
  const myCourse = save.course;
  persist();
  save.courses = ['classic'];
  const sig = () => objects.filter((o) => o.type !== 'sign').slice(0, 25).map((o) => `${o.type}${Math.round(o.x)}/${Math.round(o.d)}`).join(',');
  startDaily();
  t.eq(save.course, dayInfo().course, 'fel bana under dagens åk');
  const first = sig();
  const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
  t.eq(stored.course, myCourse, 'dagens bana sparades över min egen');
  play(60 * 400, () => steerTo(0), { invuln: true, until: () => state !== 'playing' && state !== 'crashing' && state !== 'finish' });
  t.ok(save.dailyBest && save.dailyBest.day === dayKey(), 'dagens bästa sparades inte');
  t.ok(save.dailyGhost && save.dailyGhost.data.length > 50, 'spöket spelades inte in');
  startDaily({ data: save.dailyGhost.data, name: 'test' });
  t.eq(sig(), first, 'dagens bana blev inte likadan andra gången');
  play(300, null, { invuln: true });
  t.ok(Math.abs(daily.ghost.mesh.position.z + player.d) < 15, 'spöket följer inte med');
  showMenu();
  t.ok(!daily, 'dagens åk avslutades inte');
  t.eq(save.course, myCourse, 'min bana återställdes inte');
});
