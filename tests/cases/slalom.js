// Slalom: autopiloten klarar portarna, ingen kan åka utanför näten, bottarna håller sig innanför. budget: 120000
runTest(async (t) => {
  save.lift = false;
  save.courses = Object.keys(COURSES);
  setCourse('slalom');
  startRun();
  let maxX = 0;
  play(60 * 200, () => {
    const gates = objects.filter((o) => o.type === 'gate' && !o.passed && !o.missed && o.d > player.d);
    const g = gates[0];
    // Som en riktig åkare: sikta på porten men börja svänga mot nästa precis innan, och bromsa lite i höga farter
    const aim = g && gates[1] && g.d - player.d < 2.5 && Math.abs(player.x - g.x) < GATE_HALF ? gates[1] : g;
    steerTo(aim ? aim.x : 0, Math.max(4, aim ? aim.d - player.d : 12));
    keys.delete('ArrowDown');
    if (g && player.speed > 12 && Math.abs(g.x - player.x) > 4 && g.d - player.d < 14) keys.add('ArrowDown');
    maxX = Math.max(maxX, Math.abs(player.x));
  }, { invuln: true, until: () => state !== 'playing' });
  keys.clear();
  t.eq(run.missed, 0, 'missade portar');
  t.ok(run.gates >= 40, `bara ${run.gates} portar`);
  t.note(`${run.gates} portar utan miss`);
  // Håll höger hela tiden: stannar innanför nätet
  startRun();
  let edge = 0;
  let npcEdge = 0;
  play(60 * 30, () => {
    keys.add('ArrowRight');
    edge = Math.max(edge, Math.abs(player.x));
    for (const n of npcs) npcEdge = Math.max(npcEdge, Math.abs(n.x));
  }, { invuln: true });
  keys.clear();
  t.ok(edge <= netX(), `åkaren kom utanför nätet (${edge.toFixed(1)} m)`);
  t.ok(npcEdge <= netX(), `en bot kom utanför nätet (${npcEdge.toFixed(1)} m)`);

});
