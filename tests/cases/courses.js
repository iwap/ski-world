// Ett helt åk på varje bana och svårighetsgrad utan JS-fel, med boten osårbar. budget: 600000
runTest(async (t) => {
  save.lift = true;
  save.upgrades.helmet = 3;
  save.courses = Object.keys(COURSES);
  const results = [];
  for (const c of Object.keys(COURSES)) {
    for (const diff of Object.keys(DIFFICULTIES)) {
      save.difficulty = diff;
      difficulty = DIFFICULTIES[diff];
      setCourse(c);
      startRun();
      let gates = 0;
      play(60 * 400, () => {
        // Följ slalomportarna så att boten inte blir diskad
        if (course.slalom) {
          const g = objects.find((o) => o.type === 'gate' && !o.passed && !o.missed && o.d > player.d);
          steerTo(g ? g.x : 0, Math.max(4, g ? g.d - player.d : 12));
          gates = run.gates;
        } else steerTo(courseX(player.d + 10), 10); // Fun slope slingrar
      }, { invuln: true, until: () => !['playing', 'crashing', 'finish', 'lift'].includes(state) });
      keys.clear();
      results.push(`${c}/${diff}:${state}`);
      t.ok(['menu', 'gameover'].includes(state), `${c}/${diff} slutade i läget ${state}`);
      if (c === 'classic') t.ok(state === 'menu', `classic/${diff} kom inte i mål (${state}, ${Math.round(player.d)} m)`);
      if (c === 'slalom') t.ok(gates > 20, `slalom/${diff}: bara ${gates} portar`);
    }
  }
  t.note(`${results.length} åk`);
});
