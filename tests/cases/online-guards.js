// Skydd: ingen prisfuskning, inga indragningar mitt i annat, ingen HTML från andra spelare. budget: 60000
runTest(async (t) => {
  save.lift = false;
  showMenu();
  await wait(50);
  // Elak ikon från en annan spelare visas som text
  mockJoin({ id: 'p2', name: '<b>Anna</b>', icon: '<img src=x onerror="window.__xss=1">', status: '<i>x</i>' });
  showParty();
  t.ok(!window.__xss && !document.querySelector('#party-list img, #party-list b'), 'HTML från en annan spelare kördes');
  // Motståndaren lämnar innan duellen börjat: inget pris
  mockJoin({ id: 'p2', name: 'Anna', icon: '🐧', status: 'menu' });
  party.mode = 'duel';
  showParty();
  sendInvite(party.players[0]);
  const sid = party.hosting.sid;
  mockEmit('ski-lobby', 'broadcast', 'reply', { to: save.playerId, from: 'p2', sid, ok: true });
  startSession();
  const bank0 = save.bank;
  mockEmit(`ski-s-${sid}`, 'broadcast', 'leave', { id: 'p2' });
  t.ok(!race, 'duellen avbröts inte');
  t.eq(save.bank, bank0, 'pengar för en motståndare som lämnade');
  // Inbjuden som börjar köra dagens utmaning dras inte in i racet
  showMenu();
  mockEmit('ski-lobby', 'broadcast', 'invite', { to: save.playerId, from: 'p2', fromName: 'Anna', sid: 'g9', mode: 'race', course: 'classic', difficulty: 'normal' });
  answerInvite(true);
  await wait(50);
  t.ok(!!party.joined, 'gick inte med i gruppen');
  showMenu();
  startDaily();
  t.ok(!party.joined, 'lämnade inte gruppen');
  mockEmit('ski-s-g9', 'broadcast', 'start', { sid: 'g9', mode: 'race', course: 'classic', difficulty: 'normal', seed: 1, members: [{ id: 'p2', name: 'Anna' }, { id: save.playerId, name: 'Ivo' }], host: 'p2' });
  t.ok(!race && !!daily, 'drogs in i racet mitt i dagens åk');
  // Låst bana i race-läget: tackar nej automatiskt
  showMenu();
  save.courses = ['classic'];
  mockEmit('ski-lobby', 'broadcast', 'invite', { to: save.playerId, from: 'p2', fromName: 'Anna', sid: 'g10', mode: 'race', course: 'bigair', difficulty: 'normal' });
  const reply = sentEvents('reply').pop();
  t.ok(reply && !reply.payload.ok && reply.payload.locked, 'låst bana tackade inte nej');
});
