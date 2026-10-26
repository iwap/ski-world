// Regler: chanser i boxen, förmågor, volt-cooldown, trick-namn oberoende av språk. budget: 20000
runTest(async (t) => {
  // Boxen: 100 000 dragningar ska ligga nära chanserna
  const count = {};
  for (let i = 0; i < 100000; i++) {
    const c = rollCharacter();
    count[c.rarity] = (count[c.rarity] || 0) + 1;
  }
  for (const [id, r] of Object.entries(RARITIES)) {
    if (!r.chance) continue;
    const got = (count[id] || 0) / 1000;
    t.ok(Math.abs(got - r.chance) < 1, `${id}: ${got.toFixed(1)} % i stället för ${r.chance} %`);
  }
  // Förmågor: Guldkungen är snabbare
  save.chars.push('goldking');
  save.character = 'classic';
  const base = stats().cruise;
  save.character = 'goldking';
  t.ok(Math.abs(stats().cruise / base - 1.2) < 0.001, 'Guldkungens fart är inte +20 %');
  save.character = 'classic';
  // Volt-cooldown: en ny volt kan inte börja direkt efter den förra
  startRun();
  player.air = true;
  player.z = 50;
  player.vz = 0;
  player.flips = 0;
  player.flipping = true;
  player.flipProg = 0.99;
  updateAir(1 / 60, stats());
  t.ok(!player.flipping && player.trickCd > 0, 'cooldown startar inte efter volten');
  pressed.add('ArrowDown');
  updateAir(1 / 60, stats());
  t.ok(!player.flipping, 'ny volt startade under cooldown');
  pressed.clear();
  // Trick-duellens jämförelse är densamma på alla språk
  const sigs = [];
  for (const l of Object.keys(LANGS)) {
    save.lang = l;
    applyLanguage();
    player.combo = { parts: [], pts: 0 };
    player.spin = Math.PI * 2;
    player.flips = 2;
    player.frontFlips = 0;
    player.flipping = false;
    player.grabTimes = { indy: 1 };
    collectAirTricks();
    sigs.push(JSON.stringify(trickSig({ sig: player.combo.sig })));
  }
  t.ok(new Set(sigs).size === 1, `tricket jämförs olika på olika språk: ${sigs.join(' ')}`);
  t.eq(sigs[0], JSON.stringify(['back2', 'grab-indy', 'spin360']), 'fel trick-signatur');
});
