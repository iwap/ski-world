// Trick-duell, Big Air-tävling och parallellslalom mot låtsasservern. budget: 120000
runTest(async (t) => {
  save.lift = false;
  save.name = 'Ivo';
  showMenu();
  await wait(50);
  mockJoin({ id: 'p2', name: 'Anna', icon: '🐧', status: 'menu' });
  const host = (mode) => {
    party.mode = mode;
    showParty();
    sendInvite(party.players[0]);
    const sid = party.hosting.sid;
    mockEmit('ski-lobby', 'broadcast', 'reply', { to: save.playerId, from: 'p2', sid, ok: true });
    startSession();
    return `ski-s-${sid}`;
  };
  const flipOnJump = () => {
    let did = false;
    return () => {
      if (player.air && !player.smallAir && !did && player.z > 1.5) {
        pressed.add('ArrowDown');
        did = true;
      }
    };
  };

  // Trick-duell: jag sätter en backflip, Anna missar fem gånger → jag vinner
  let ch = host('duel');
  race.startAt = performance.now() - 1;
  play(60 * 12, flipOnJump());
  await wait(50);
  const trick = sentEvents('trick').pop();
  t.ok(trick && trick.payload.landed && trick.payload.sig.includes('back1'), 'backflip räknades inte');
  mockEmit(ch, 'broadcast', 'trick', { id: 'p2', sig: [], landed: false, turn: 1 });
  mockEmit(ch, 'broadcast', 'trick', { id: 'p2', sig: [], landed: false, turn: 1 }); // omsändning
  t.eq(race.duel.letters.p2, 1, 'omsänt drag räknades två gånger');
  for (let k = 0; k < 4 && race; k++) {
    await wait(1900);
    if (!race) break;
    race.startAt = performance.now() - 1;
    play(60 * 12, flipOnJump());
    if (race) mockEmit(ch, 'broadcast', 'trick', { id: 'p2', sig: [], landed: false, turn: race.duel.turn });
  }
  t.ok(!$('sessres').classList.contains('hidden') && $('sessres-text').textContent.includes('1'), 'duellens resultat visas inte');

  // Big Air-tävling: tre hopp, de två bästa räknas
  showMenu();
  ch = host('bigair');
  for (let a = 0; a < 3 && race; a++) {
    race.startAt = performance.now() - 1;
    play(60 * 12, flipOnJump());
    await wait(1700);
  }
  for (let n = 0; n < 3; n++) mockEmit(ch, 'broadcast', 'attempt', { id: 'p2', n, score: 100 });
  t.ok(!$('sessres').classList.contains('hidden'), 'Big Air-resultatet visas inte');

  // Parallellslalom: egna portar, egen bana
  showMenu();
  ch = host('pslalom');
  race.startAt = performance.now() - 1;
  let maxX = -Infinity;
  play(60 * 60, () => {
    const g = objects.find((o) => o.type === 'gate' && o.lane === race.lane && !o.passed && !o.missed && o.d > player.d);
    steerTo(g ? g.x : player.x, Math.max(4, g ? g.d - player.d : 12));
    maxX = Math.max(maxX, race.lane === 0 ? player.x : -player.x);
  }, { invuln: true });
  keys.clear();
  t.ok(maxX < 0, 'åkaren kom över till den andra banan');
  t.ok(run.gates > 15 && run.missed === 0, `parallellslalom: ${run.gates} portar, ${run.missed} missade`);
});
