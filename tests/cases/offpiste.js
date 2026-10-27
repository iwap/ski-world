// Off-pist: tät skog utan byggda hopp och räcken, med fallna träd att grinda på och snöpuckar som lyfter. budget: 120000
runTest(async (t) => {
  save.courses = Object.keys(COURSES);
  save.lift = false;
  const counts = {};
  for (const seed of [1, 2, 3]) {
    setCourse('offpiste');
    worldRng = mulberry32(seed);
    resetWorld();
    spawnUntil(runLength());
    worldRng = null;
    for (const o of objects) if (Math.abs(o.x) < netX()) counts[o.type] = (counts[o.type] || 0) + 1;
  }
  t.note(JSON.stringify(counts));
  for (const type of ['ramp', 'rail', 'box', 'spine', 'cannon']) t.ok(!counts[type], `${type} i off-pist (${counts[type]})`);
  for (const type of ['tree', 'rock', 'stump', 'log', 'bump']) t.ok(counts[type] > 10, `för få ${type} (${counts[type] || 0})`);

  // En snöpuck lyfter så att man kan tricksa, och man landar på pucken baksida
  const bumpType = OBSTACLES.find((o) => o.type === 'bump');
  const out = [];
  for (const H of [0.9, 1.6]) {
    startRun();
    objects.forEach(removeObject);
    objects = [];
    features = [];
    nextSpawnD = 1e9;
    const o = makeObject(bumpType, 0, 60);
    Object.assign(o.feature, { H, hK: H, vz: 4.5 + H * 2 });
    objects.push(o);
    const f = o.feature;
    player.speed = stats().cruise;
    let maxZ = 0;
    let airT = 0;
    let landD = null;
    play(60 * 12, () => {
      keys.clear();
      player.speed = Math.max(player.speed, stats().cruise * 0.98);
      if (player.air && player.d > f.lip - 0.5) { maxZ = Math.max(maxZ, player.z); airT += 1 / 60; }
      if (airT > 0 && !player.air && landD === null) landD = player.d;
    }, { invuln: true, until: () => landD !== null });
    out.push(`puck ${H} m: ${maxZ.toFixed(1)} m upp, ${airT.toFixed(1)} s i luften, landade ${landD && (landD - f.lip).toFixed(1)} m efter krönet`);
    t.ok(maxZ > 0.6 && airT > 0.5, `pucken (${H} m) lyfte för lite: ${maxZ.toFixed(1)} m, ${airT.toFixed(1)} s`);
  }
  t.note(out.join(' · '));
  showMenu();
  setCourse('classic');
});
