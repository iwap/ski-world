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
  for (const type of ['tree', 'rock', 'stump', 'log', 'bump']) t.ok(counts[type] > 10, `för få ${type} (${JSON.stringify(counts)})`);
  t.ok(counts.cliff >= 3, `för få klippor (${counts.cliff || 0})`);

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
  // Klippan går över hela bredden och man flyger ut från kanten
  const cliffType = OBSTACLES.find((o) => o.type === 'cliff');
  for (const x of [0, netX() - 1.5]) {
    startRun();
    objects.forEach(removeObject);
    objects = [];
    features = [];
    nextSpawnD = 1e9;
    nextCliffD = Infinity;
    const o = makeObject(cliffType, 0, 40);
    Object.assign(o.feature, { H: 5, hK: 5, lip: 40 + 51, d1: 40 + 51, d3: 40 + 53 });
    objects.push(o);
    const f = o.feature;
    player.x = x;
    player.speed = stats().cruise;
    let maxZ = 0;
    let landD = null;
    play(60 * 15, () => {
      keys.clear();
      player.x = x;
      player.speed = Math.max(player.speed, stats().cruise * 0.98);
      if (player.air && player.d > f.lip - 0.5) maxZ = Math.max(maxZ, player.z);
      if (maxZ > 0 && !player.air && landD === null) landD = player.d;
    }, { invuln: true, until: () => landD !== null });
    out.push(`klippa 5 m vid x=${x}: ${maxZ.toFixed(1)} m luft, landade ${landD && (landD - f.lip).toFixed(1)} m ut`);
    t.ok(maxZ > 4.5, `klippan vid x=${x}: bara ${maxZ.toFixed(1)} m luft`);
  }
  t.note(out.join(' · '));
  showMenu();
  setCourse('classic');
});
