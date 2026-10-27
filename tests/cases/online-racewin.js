// Online-race: vinnaren får 1,5 gånger pengarna för åket. budget: 60000
runTest(async (t) => {
  save.lift = false;
  save.name = 'Ivo';
  showMenu();
  await wait(50);
  mockJoin({ id: 'p2', name: 'Anna', icon: '🐧', status: 'menu' });
  party.mode = 'race';
  showParty();
  sendInvite(party.players[0]);
  const sid = party.hosting.sid;
  mockEmit('ski-lobby', 'broadcast', 'reply', { to: save.playerId, from: 'p2', sid, ok: true });
  startSession();
  race.startAt = performance.now() - 1;
  const ch = `ski-s-${sid}`;
  play(60 * 5);
  mockEmit(ch, 'broadcast', 'done', { id: 'p2', dist: 10, score: 5, finished: false, time: 20 });
  player.d = 300; // längre än Anna
  const bank0 = save.bank;
  player.lives = 0;
  crash('crash.tree');
  play(60 * 6);
  t.eq(state, 'gameover', 'resultatskärmen visas inte');
  t.ok($('go-race').textContent.includes('🏆'), 'vinsten visas inte');
  const total = save.leaderboard.reduce((a, e) => (e.at > a.at ? e : a)).score; // det sparade resultatet
  t.eq(save.bank - bank0, total + Math.round(total * 0.5), 'vinnaren ska få 1,5 gånger pengarna');
});
