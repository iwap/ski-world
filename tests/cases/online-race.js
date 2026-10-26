// Online-race med flera spelare: inbjudan, start, spöken, placeringar, pris, emoji och revansch. budget: 60000
runTest(async (t) => {
  save.lift = false;
  save.name = 'Ivo';
  showMenu();
  await wait(50);
  mockJoin({ id: 'p2', name: 'Anna', icon: '🐧', status: 'menu' });
  mockJoin({ id: 'p3', name: 'Kalle', icon: '🤖', status: 'menu' });
  party.mode = 'race';
  showParty();
  sendInvite(party.players[0]);
  sendInvite(party.players[1]);
  const sid = party.hosting.sid;
  mockEmit('ski-lobby', 'broadcast', 'reply', { to: save.playerId, from: 'p2', sid, ok: true });
  mockEmit('ski-lobby', 'broadcast', 'reply', { to: save.playerId, from: 'p3', sid, ok: false });
  t.eq([...party.hosting.invited.values()].map((m) => m.status).join(), 'joined,declined', 'fel status i gruppen');
  startSession();
  t.ok(race && race.members.length === 2, 'sessionen startade inte med 2 spelare');
  race.startAt = performance.now() - 1;
  const ch = `ski-s-${sid}`;
  play(60 * 5, () => mockEmit(ch, 'broadcast', 'pos', { id: 'p2', x: 2, d: player.d - 5, z: 0, a: 0, spin: 0 }));
  t.ok(race.others.get('p2').mesh.visible, 'motståndaren syns inte');
  mockEmit(ch, 'broadcast', 'done', { id: 'p2', dist: 400, score: 200, finished: false, time: 20 });
  const bank0 = save.bank;
  player.lives = 0;
  crash('crash.tree');
  play(60 * 6);
  t.eq(state, 'gameover', 'resultatskärmen visas inte');
  t.ok(!race, 'sessionen avslutades inte');
  t.ok($('go-race').textContent.includes('Anna'), 'placeringarna visas inte');
  t.ok(save.bank - bank0 < 200, 'förloraren fick vinstpengar');
  t.ok(!$('btn-rematch').classList.contains('hidden'), 'revanschknappen syns inte');
  sendEmote(1);
  t.eq(sentEvents('emote').length, 1, 'emoji skickades inte');
  // Revansch bjuder in samma spelare igen
  mockJoin({ id: 'p2', name: 'Anna', icon: '🐧', status: 'menu' });
  rematch();
  t.ok(party.hosting && party.hosting.invited.has('p2'), 'revanschen bjöd inte in Anna');
});
