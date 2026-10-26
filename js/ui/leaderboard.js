'use strict';
// Topplistan (den här enheten och hela världen).

let boardCourse = 'classic';
let boardMode = Online.on ? 'global' : 'local';
let boardReq = 0;

function boardRow(e, i, me) {
  const tr = document.createElement('tr');
  if (me) tr.className = 'me';
  else if (i < 3) tr.classList.add(`podium-${i + 1}`);
  // Äldre åk sparades bara med datum
  const at = e.at || (e.created_at && Date.parse(e.created_at));
  const when = at
    ? `${new Date(at).toLocaleDateString(locale())} ${new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`
    : e.date;
  const level = t(`diff.${DIFFICULTIES[e.difficulty] ? e.difficulty : 'normal'}`);
  const cells = [['🥇', '🥈', '🥉'][i] || i + 1, e.name, e.rider === 'board' ? '🏂' : '⛷️', level, `${fmt(e.dist)} m`, fmt(e.score), when];
  for (const c of cells) {
    const td = document.createElement('td');
    td.textContent = c;
    tr.append(td);
  }
  return tr;
}

function setBoardMode(mode) {
  boardMode = mode;
  showBoard(boardCourse);
  $('lb-mode').querySelector(`[data-mode="${mode}"]`).focus();
}

function showBoard(courseId = save.course) {
  state = 'menu';
  boardCourse = courseId;
  $('lb-select').value = courseId;
  $('lb-mode').classList.toggle('hidden', !Online.on);
  for (const b of $('lb-mode').children) b.classList.toggle('active', b.dataset.mode === boardMode);
  const body = $('lb-body');
  body.innerHTML = '';
  $('lb-me').classList.add('hidden');
  $('lb-status').classList.add('hidden');
  const req = ++boardReq;
  if (boardMode === 'global' && Online.on) {
    $('lb-empty').classList.add('hidden');
    $('lb-note').textContent = t('board.global');
    setStatus('board.loading');
    Promise.all([Online.top(courseId), Online.mine(courseId)]).then(async ([list, mineRows]) => {
      if (req !== boardReq) return;
      $('lb-status').classList.add('hidden');
      list.forEach((e, i) => body.append(boardRow(e, i, e.player_id === save.playerId)));
      $('lb-empty').classList.toggle('hidden', list.length > 0);
      // Inte med bland de bästa: visa ens egen plats under listan
      const me = mineRows[0];
      if (me && !list.some((e) => e.player_id === save.playerId)) {
        const r = await Online.rank(courseId, me.score);
        if (req !== boardReq || !r) return;
        const meBody = $('lb-me-body');
        meBody.innerHTML = '';
        meBody.append(boardRow(me, r - 1, true));
        $('lb-me').classList.remove('hidden');
      }
    }).catch(() => {
      if (req === boardReq) setStatus('board.error');
    });
  } else {
    $('lb-note').textContent = t('board.local');
    // Äldre åk saknar bana och nivå: de räknas som Klassisk/Normal
    const list = save.leaderboard.filter((e) => (e.course || 'classic') === courseId);
    list.forEach((e, i) => body.append(boardRow(e, i, courseId === lastRankCourse && i === lastRank)));
    $('lb-empty').classList.toggle('hidden', list.length > 0);
  }
  if (!$('board').classList.contains('hidden')) return;
  showOverlay('board');
}

function setStatus(key) {
  setText('lb-status', t(key));
  $('lb-status').classList.remove('hidden');
}
