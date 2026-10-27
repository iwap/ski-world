'use strict';
// Ett åk: start, paus, poäng, sparning av resultat och resultatskärmen.

// ghost = spöket man jagar (då byggs banan från spökets frö)
function startRun(ghost = null) {
  leaveJoinedGroup();
  raceResultText = null;
  if (race) leaveSession();
  if (daily) endDaily();
  dailyAgain = false;
  if (!courseUnlocked()) {
    if (state !== 'menu') return showMenu();
    return unlockCourse();
  }
  seedRun(ghost);
  $('popups').innerHTML = '';
  wasMenu = true; // kameran hoppar direkt till starten istället för att svepa genom backen
  player.speed = stats().cruise;
  state = 'playing';
  showOverlay(null);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showOverlay('pause');
  } else if (state === 'paused') {
    state = 'playing';
    showOverlay(null);
  }
}

// Sparar åket (poäng, rekord, topplista) och returnerar resultatet
function recordRun() {
  if (daily) return recordDaily();
  const dist = Math.min(runLength(), Math.floor(player.d));
  const total = runScore();
  const record = total > save.best;
  const ghost = finishRunSeed(total, dist >= runLength() && !player.dq);
  save.bank += total;
  save.best = Math.max(save.best, total);
  save.bestDist = Math.max(save.bestDist, dist);
  // Topplistan: de 10 bästa åken
  const entry = {
    name: playerName(), score: total, dist, rider: save.rider,
    course: save.course, difficulty: save.difficulty, at: Date.now(),
  };
  // Topp 10 per bana
  const same = (e) => (e.course || 'classic') === save.course;
  const mine = [...save.leaderboard.filter(same), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  lastRank = mine.indexOf(entry);
  lastRankCourse = save.course;
  save.leaderboard = [...save.leaderboard.filter((e) => !same(e)), ...mine];
  persist();
  globalRank = null;
  if (Online.on && total > 0) {
    const course = save.course;
    Online.submit({
      player_id: save.playerId, name: entry.name.slice(0, 24), score: total, dist,
      course, difficulty: save.difficulty, rider: save.rider,
    }).then((accepted) => {
      if (ghost && accepted) Online.saveCourseReplay(ghost).catch(() => {});
      return Online.rank(course, total);
    }).then((r) => {
      if (!r) return;
      globalRank = r;
      setText('go-grank', t('go.grank', { rank: r }));
      $('go-grank').classList.remove('hidden');
    }).catch(() => {});
  }
  runBadges(total, dist >= runLength());
  raceDone(dist, total, dist >= runLength() && !player.dq);
  return { dist, total, record };
}

let globalRank = null;

function rankText() {
  return lastRank >= 0 ? t('go.rank', { rank: lastRank + 1, course: t(`course.${save.course}`) }) : '';
}

function endRun() {
  // Trick-duell och Big Air-tävling: avsluta = lämna sessionen, en krasch avslutar bara försöket
  if (race && (race.mode === 'duel' || race.mode === 'bigair')) {
    if (!player.quit && race.attempt) {
      race.attempt.crashed = true;
      endAttempt();
      return;
    }
    leaveSession();
    resetWorld();
    showMenu();
    return;
  }
  showResults(recordRun(), t(player.dq ? 'go.dq' : player.quit ? 'go.quit' : 'go.crash'), player.crashReason);
}

// Resultatskärmen: emoji, rolig kommentar, 1–3 stjärnor, färgglada rutor och konfetti vid rekord/mål
function showResults({ dist, total, record }, title, reason) {
  const finished = player.finishRes && dist >= runLength();
  const kind = player.dq ? 'dq' : player.quit ? 'quit' : finished ? 'finish' : 'crash';
  $('go-emoji').textContent = { crash: '💥', finish: '🏁', dq: '🚩', quit: '👋' }[kind];
  $('go-panel').className = `panel go-panel go-${kind}`;
  const quips = kind === 'finish' ? 4 : 6;
  $('go-quip').textContent = kind === 'quit' ? '' : t(`quip.${kind === 'finish' ? 'finish' : 'crash'}.${Math.floor(Math.random() * quips)}`);

  // Betyg efter hur långt man kom och hur mycket poäng det blev per meter
  const perM = total / Math.max(1, runLength());
  const stars = finished ? (perM > 1.8 ? 3 : 2) : dist > runLength() * 0.6 ? 2 : dist > runLength() * 0.2 ? 1 : 0;
  const rating = $('go-rating');
  rating.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const st = document.createElement('span');
    st.textContent = '★';
    st.className = i < stars ? 'on' : '';
    st.style.animationDelay = `${0.35 + i * 0.18}s`;
    rating.append(st);
  }

  renderRaceResult();
  $('go-rank').textContent = rankText();
  $('go-grank').classList.toggle('hidden', !globalRank);
  if (globalRank) setText('go-grank', t('go.grank', { rank: globalRank }));
  $('go-rank').classList.toggle('hidden', lastRank < 0 || total <= 0);
  $('go-title').textContent = title;
  $('go-reason').textContent = reason;
  $('go-dist').textContent = `${fmt(dist)} m`;
  $('go-tricks').textContent = fmt(run.tricks);
  $('go-stars').textContent = fmt(run.stars);
  $('go-speed').textContent = `${fmt(run.maxSpeed * 3.6)} km/h`;
  $('go-air').textContent = `${run.maxAir.toLocaleString(locale(), { maximumFractionDigits: 1 })} m`;
  $('go-gates').textContent = `${run.gates} ✓ · ${run.missed} ✗`;
  for (const el of document.querySelectorAll('.gates-row')) el.classList.toggle('hidden', !course.slalom);
  $('go-total').textContent = fmt(total);
  $('go-record').classList.toggle('hidden', !record);
  state = 'gameover';
  $('popups').innerHTML = '';
  showOverlay('gameover');

  // Konfetti vid nytt rekord eller målgång
  const conf = $('confetti');
  conf.innerHTML = '';
  if (record || finished) {
    const colors = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ff9800'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      c.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      conf.append(c);
    }
  }
}
