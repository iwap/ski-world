// Inga hinder inuti varandra: bygger hela backen för varje bana och svårighetsgrad (flera frön)
// och letar efter hinder, hopp, landningar och räcken som går in i varandra. budget: 240000
runTest(async (t) => {
  save.courses = Object.keys(COURSES);
  const SEEDS = [1, 2, 3, 4];
  const counts = {};
  const examples = [];
  // Hur mycket plats varje sak tar (kärnan – trädkronor får gå in i varandra)
  const CORE = { tree: 0.6, pine: 0.5, rock: 0.8, stump: 0.4, snowman: 0.6, cannon: 0.5, sign: 0.4, star: 0.5 };
  const shapesOf = (o) => {
    if (o.type === 'ramp' && o.feature) {
      const f = o.feature;
      return [{ kind: 'rect', x0: f.x - f.half, x1: f.x + f.half, d0: f.d0, d1: f.d3 }];
    }
    if (o.type === 'ramp') return [{ kind: 'rect', x0: o.x - o.ramp.w, x1: o.x + o.ramp.w, d0: o.d - o.ramp.l, d1: o.d + o.ramp.l }];
    if (o.type === 'hut') return [{ kind: 'rect', x0: o.x - CABIN.halfW, x1: o.x + CABIN.halfW, d0: o.d - CABIN.halfL, d1: o.d + CABIN.halfL }];
    if (o.type === 'cliff') {
      const f = o.feature;
      return [{ kind: 'rect', x0: f.x - f.half, x1: f.x + f.half, d0: f.lip - 8, d1: f.d3 + f.land }];
    }
    if (o.type === 'spine' || o.type === 'rollers' || o.type === 'bump') {
      const f = o.feature;
      return [{ kind: 'rect', x0: f.x - f.half, x1: f.x + f.half, d0: f.d0, d1: f.d3 }];
    }
    if (isLinear(o)) {
      const out = [];
      for (let s = 0; s <= 1.0001; s += 1 / Math.max(2, Math.ceil(o.len))) {
        const q = pointAt(o, s);
        out.push({ kind: 'circle', x: q.x, d: q.d, r: 0.45 });
      }
      return out;
    }
    if (CORE[o.type] !== undefined) return [{ kind: 'circle', x: o.x, d: o.d, r: CORE[o.type] * (o.type === 'rock' ? o.s : 1) }];
    return [];
  };
  const hit = (a, b) => {
    if (a.kind === 'circle' && b.kind === 'circle') return (a.x - b.x) ** 2 + (a.d - b.d) ** 2 < (a.r + b.r) ** 2;
    if (a.kind === 'rect' && b.kind === 'rect') return a.x0 < b.x1 && b.x0 < a.x1 && a.d0 < b.d1 && b.d0 < a.d1;
    const [c, r] = a.kind === 'circle' ? [a, b] : [b, a];
    const nx = clamp(c.x, r.x0, r.x1);
    const nd = clamp(c.d, r.d0, r.d1);
    return (c.x - nx) ** 2 + (c.d - nd) ** 2 < c.r * c.r;
  };
  for (const c of Object.keys(COURSES)) {
    for (const diff of Object.keys(DIFFICULTIES)) {
      for (const seed of SEEDS) {
        save.difficulty = diff;
        difficulty = DIFFICULTIES[diff];
        save.course = c;
        course = COURSES[c];
        worldRng = mulberry32(seed);
        resetWorld();
        spawnUntil(runLength());
        worldRng = null;
        const items = objects.filter((o) => Math.abs(o.x) < netX() + 0.5).map((o) => ({ o, shapes: shapesOf(o) })).filter((it) => it.shapes.length);
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const A = items[i];
            const B = items[j];
            if (A.o.type === 'star' && B.o.type === 'star') continue;
            // Stjärnor svävar – de får ligga över landningar och hopp
            if ((A.o.type === 'star' || B.o.type === 'star') && (A.shapes[0].kind === 'rect' || B.shapes[0].kind === 'rect')) continue;
            // Räcket som hör till hoppet ligger på landningen med flit
            if (A.o.jump === B.o || B.o.jump === A.o) continue;
            if (Math.abs(A.o.d - B.o.d) > 150) continue;
            if (A.shapes.some((a) => B.shapes.some((b) => hit(a, b)))) {
              const key = [A.o.type, B.o.type].sort().join('+');
              counts[key] = (counts[key] || 0) + 1;
              if (examples.length < 8) examples.push(`${c}/${diff}/${seed}: ${A.o.type}@${Math.round(A.o.x)},${Math.round(A.o.d)} ${B.o.type}@${Math.round(B.o.x)},${Math.round(B.o.d)}`);
            }
          }
        }
      }
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  t.eq(total, 0, `hinder inuti varandra ${JSON.stringify(counts)} t.ex. ${examples.join(' | ')}`);
  save.difficulty = 'normal';
  difficulty = DIFFICULTIES.normal;
  setCourse('classic');
});
