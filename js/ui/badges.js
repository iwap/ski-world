'use strict';
// Badges: tjäna in och hämta pengar.

// ---------- Badges ----------

const badgeName = (b) => (b.course ? t('badge.course', { c: t(`course.${b.course}`) }) : b.diff ? t('badge.diff', { d: t(`diff.${b.diff}`) }) : t(`badge.${b.id}`));
const badgeDesc = (b) => (b.course ? t('badge.course.desc', { c: t(`course.${b.course}`) }) : b.diff ? t('badge.diff.desc', { d: t(`diff.${b.diff}`) }) : t(`badge.${b.id}.desc`));
const badgeIcon = (b) => b.icon || COURSE_ICONS[b.course] || '🏅';
const unclaimedBadges = () => BADGES.filter((b) => save.badges[b.id] === 'earned').length;

function earnBadge(id) {
  if (save.badges[id]) return;
  const b = BADGES.find((x) => x.id === id);
  if (!b) return;
  save.badges[id] = 'earned';
  persist();
  popup(`🏅 ${badgeName(b)}`, `${t('badge.earned')} · 🪙 ${fmt(b.reward)}`, '#b8860b');
  Sound.star();
  updateBadgeDot();
}

// Framsteg mot badges som kräver flera saker (alla grabs, alla banor på svår)
function badgeProgress(id, item) {
  const list = save.badgeProg[id] || (save.badgeProg[id] = []);
  if (!list.includes(item)) {
    list.push(item);
    persist();
  }
  const b = BADGES.find((x) => x.id === id);
  const valid = id === 'grabs' ? list.filter((g) => GRABS.some((x) => x.id === g)) : list; // Mute grab finns inte längre
  if (valid.length >= b.goal) earnBadge(id);
}

function trickBadges({ flips, fronts, spin, grabs, perfect }) {
  if (flips >= 1) earnBadge('backflip');
  if (fronts >= 1) earnBadge('frontflip');
  if (flips >= 2 || fronts >= 2) earnBadge('doubleflip');
  if (spin >= 720) earnBadge('spin720');
  if (spin >= 1080) earnBadge('spin1080');
  for (const g of grabs) badgeProgress('grabs', g);
  if (grabs.includes('chinese')) earnBadge('chinese');
  if (perfect) earnBadge('perfect');
}

// När åket är slut (krasch eller mål)
function runBadges(total, finished) {
  if (total >= 5000) earnBadge('score5k');
  if (total >= 10000) earnBadge('score10k');
  if (!finished) return;
  earnBadge(`course-${save.course}`);
  earnBadge(`diff-${save.difficulty}`);
  if (save.difficulty === 'hard') badgeProgress('hardall', save.course);
  if (course.slalom && run.missed === 0 && !player.dq) earnBadge('slalomclean');
}

function updateBadgeDot() {
  const n = unclaimedBadges();
  const dot = $('badge-dot');
  dot.textContent = n;
  dot.classList.toggle('hidden', n === 0);
}

function showBadges() {
  state = 'menu';
  renderBadges();
  showOverlay('badges');
}

function claimBadge(b) {
  if (save.badges[b.id] !== 'earned') return Sound.denied();
  save.badges[b.id] = 'claimed';
  save.bank += b.reward;
  persist();
  Sound.buy();
  keepFocus('badges', renderBadges);
}

function renderBadges() {
  const earned = BADGES.filter((b) => save.badges[b.id]).length;
  setText('badges-count', `${earned} / ${BADGES.length}`);
  setText('badges-bank', fmt(save.bank));
  const claimAll = $('btn-claim-all');
  const open = unclaimedBadges();
  claimAll.textContent = `${t('badge.claimAll')} (${open})`;
  claimAll.setAttribute('aria-disabled', String(open === 0));
  const wrap = $('badge-list');
  wrap.innerHTML = '';
  for (const cat of BADGE_CATS) {
    const h = document.createElement('h3');
    h.textContent = t(`badge.cat.${cat}`);
    wrap.append(h);
    const grid = document.createElement('div');
    grid.className = 'badge-grid';
    for (const b of BADGES.filter((x) => x.cat === cat)) {
      const st = save.badges[b.id] || 'locked';
      const card = document.createElement('div');
      card.className = `badge-card ${st}`;
      const prog = b.goal ? ` (${(save.badgeProg[b.id] || []).length}/${b.goal})` : '';
      card.innerHTML = `<div class="badge-ico">${st === 'locked' ? '🔒' : badgeIcon(b)}</div>
        <div class="badge-info"><div class="badge-name"></div><div class="badge-desc"></div></div>`;
      card.querySelector('.badge-name').textContent = badgeName(b);
      card.querySelector('.badge-desc').textContent = badgeDesc(b) + (st === 'locked' ? prog : '');
      const btn = document.createElement('button');
      btn.className = 'claim-btn';
      if (st === 'earned') btn.textContent = `${t('badge.claim')} 🪙 ${fmt(b.reward)}`;
      else if (st === 'claimed') btn.textContent = `✔ ${t('badge.claimed')}`;
      else btn.textContent = `🪙 ${fmt(b.reward)}`;
      btn.setAttribute('aria-disabled', String(st !== 'earned'));
      btn.addEventListener('click', () => claimBadge(b));
      card.append(btn);
      grid.append(card);
    }
    wrap.append(grid);
  }
}
