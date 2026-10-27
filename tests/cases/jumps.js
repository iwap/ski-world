// Hoppen: varje färg lyfter, och i normal fart landar man i landningsslänten (efter knucklen, före slutet). budget: 120000
runTest(async (t) => {
  save.lift = false;
  const rampType = OBSTACLES.find((o) => o.type === 'ramp');
  const out = [];
  for (const skis of [0, 5]) {
    save.upgrades.skis = skis;
    for (let size = 0; size < 4; size++) {
      setCourse('classic');
      startRun();
      objects.forEach(removeObject);
      objects = [];
      features = [];
      nextSpawnD = 1e9;
      const real = course;
      course = { ...real, rampSizes: RAMPS.map((_, i) => (i === size ? 1 : 0)) };
      const o = makeObject(rampType, 0, 80);
      course = real;
      objects.push(o);
      const f = o.feature;
      player.speed = stats().cruise;
      let landD = null;
      let maxZ = 0;
      let wasAir = false;
      play(60 * 20, () => {
        keys.clear();
        // Håll farten som i normal åkning
        player.speed = Math.max(player.speed, stats().cruise * 0.98);
        if (player.air) maxZ = Math.max(maxZ, player.z);
        if (wasAir && !player.air && landD === null && player.d > f.lip) landD = player.d;
        wasAir = player.air;
      }, { invuln: true, until: () => landD !== null });
      const where = landD === null ? 'ingen landning' : landD < f.d2 ? 'på bordet' : landD > f.d3 ? 'efter landningen' : 'i landningen';
      out.push(`${RAMPS[size].grade}${size}/skidor${skis}: ${maxZ.toFixed(1)} m, ${where}`);
      t.ok(maxZ > 0.8, `${RAMPS[size].name} lyfte inte (${maxZ.toFixed(1)} m)`);
      if (skis === 0) t.ok(landD !== null && landD >= f.d2 - 1 && landD <= f.d3, `${RAMPS[size].name}: landade ${where} (${landD && (landD - f.lip).toFixed(1)} m efter kanten, knuckle ${(f.d2 - f.lip).toFixed(1)}, slut ${(f.d3 - f.lip).toFixed(1)})`);
    }
  }
  save.upgrades.skis = 0;
  showMenu();
  t.note(out.join(' · '));
});
