'use strict';
// Huvudmenyn: banväljaren, inställningar, språk och startskärmen.

const COURSE_ICONS = { classic: '🌲', park: '🏂', moguls: '⛰️', pipe: '🌀', slalom: '🚩', bigair: '🚀', offpiste: '🪵', fun: '🎢' };

// Bläddra mellan banorna i menyn
function cycleCourse(dir) {
  const ids = Object.keys(COURSES);
  const i = ids.indexOf(save.course);
  const focused = document.activeElement && document.activeElement.id;
  setCourse(ids[(i + dir + ids.length) % ids.length]);
  // Kortet glider in från det håll man bläddrar
  const card = $('course-card');
  card.classList.remove('slide-left', 'slide-right');
  void card.offsetWidth;
  card.classList.add(dir > 0 ? 'slide-left' : 'slide-right');
  if (focused === 'course-prev' || focused === 'course-next') $(focused).focus();
  Sound.tick();
}

function unlockCourse(id = save.course) {
  const price = COURSE_PRICE[id] || 0;
  if (courseUnlocked(id)) return;
  if (save.bank < price) {
    Sound.denied();
    const card = $('course-card');
    card.classList.remove('denied');
    void card.offsetWidth;
    card.classList.add('denied');
    return;
  }
  save.bank -= price;
  save.courses.push(id);
  persist();
  Sound.buy();
  showMenu();
  const card = $('course-card');
  card.classList.add('unlocked-now');
  setTimeout(() => card.classList.remove('unlocked-now'), 700);
  $('btn-play').focus();
}

function setCourse(id) {
  save.course = id;
  course = COURSES[id];
  persist();
  resetCrash();
  resetWorld();
  showMenu();
  $('course-card').focus();
}

function setDifficulty(id) {
  save.difficulty = id;
  difficulty = DIFFICULTIES[id];
  persist();
  resetWorld();
  refreshSettings();
  $('diff-seg').querySelector(`[data-diff="${id}"]`).focus();
}

function segButton(label, data, onClick) {
  const b = document.createElement('button');
  b.className = 'seg-btn';
  b.textContent = label;
  Object.assign(b.dataset, data);
  b.addEventListener('click', onClick);
  return b;
}

for (const id of Object.keys(COURSES)) {
  const opt = document.createElement('option');
  opt.value = id;
  $('lb-select').append(opt);
  const dot = document.createElement('i');
  dot.dataset.course = id;
  $('course-dots').append(dot);
}
for (const id of Object.keys(DIFFICULTIES)) {
  $('diff-seg').append(segButton('', { diff: id }, () => setDifficulty(id)));
}
for (let i = 0; i < Sound.songCount; i++) {
  $('song-seg').append(segButton('', { song: i }, () => setSong(i)));
}
for (const on of [false, true]) {
  $('helmet-seg').append(segButton('', { helmet: on ? 'on' : 'off' }, () => setHelmetOn(on)));
}
for (const on of [false, true]) {
  $('lift-seg').append(segButton('', { lift: on ? 'on' : 'off' }, () => setLiftOn(on)));
}
for (const on of [false, true]) {
  $('poles-seg').append(segButton('', { poles: on ? 'on' : 'off' }, () => setPoles(on)));
}
for (const id of ['day', 'night']) {
  $('time-seg').append(segButton('', { time: id }, () => setTime(id === 'night')));
}
for (const [id, l] of Object.entries(LANGS)) {
  $('lang-seg').append(segButton(`${l.flag} ${l.label}`, { lang: id }, () => setLang(id)));
}

// Sätter alla texter på valt språk (statisk HTML + knappar som skapas i koden)
function applyLanguage() {
  lang = save.lang;
  applyStaticTexts();
  for (const opt of $('lb-select').options) opt.textContent = t(`course.${opt.value}`);
  for (const b of $('lb-mode').children) b.textContent = t(`board.${b.dataset.mode}Tab`);
  for (const b of $('party-modes').children) b.textContent = `${PARTY_MODES[b.dataset.mode].icon} ${t(`mode.${b.dataset.mode}`)}`;
  for (const b of $('diff-seg').children) b.textContent = t(`diff.${b.dataset.diff}`);
  for (const b of $('time-seg').children) b.textContent = t(`time.${b.dataset.time}`);
  for (const b of $('poles-seg').children) b.textContent = t(b.dataset.poles === 'on' ? 'audio.on' : 'audio.off');
  for (const b of $('lift-seg').children) b.textContent = t(b.dataset.lift === 'on' ? 'audio.on' : 'audio.off');
  for (const b of $('helmet-seg').children) b.textContent = t(b.dataset.helmet === 'on' ? 'audio.on' : 'audio.off');
  for (const b of $('song-seg').children) b.textContent = t(`song.${b.dataset.song}`);
  updateAudioButtons();
}

function setSong(i) {
  save.audio.song = i;
  persist();
  Sound.setSong(i);
  if (!save.audio.music) setAudio('music', true);
  refreshSettings();
  $('song-seg').querySelector(`[data-song="${i}"]`).focus();
}

// Stavar av/på: "på" använder den stavfärg man senast valt i butiken (annars aluminium)
function updateSensLabel() {
  $('sens-value').textContent = `${Math.round((save.turnSens || 1) * 100)} %`;
}

function setHelmetOn(on) {
  save.helmetOn = on;
  persist();
  applyLook();
  refreshSettings();
  $('helmet-seg').querySelector(`[data-helmet="${on ? 'on' : 'off'}"]`).focus();
}

function setLiftOn(on) {
  save.lift = on;
  persist();
  refreshSettings();
  $('lift-seg').querySelector(`[data-lift="${on ? 'on' : 'off'}"]`).focus();
}

function setPoles(on) {
  if (isBoard()) return; // stavar används inte på snowboard
  save.style.poles = on ? save.lastPoles || 'poles-alu' : 'poles-none';
  persist();
  applyLook();
  refreshSettings();
  $('poles-seg').querySelector(`[data-poles="${on ? 'on' : 'off'}"]`).focus();
}

function setTime(night) {
  save.night = night;
  persist();
  applyTime();
  refreshSettings();
  $('time-seg').querySelector(`[data-time="${night ? 'night' : 'day'}"]`).focus();
}

function setLang(id) {
  save.lang = id;
  persist();
  applyLanguage();
  refreshSettings();
  $('lang-seg').querySelector(`[data-lang="${id}"]`).focus();
}

// ---------- Startskärm ----------

function showIntro() {
  state = 'intro';
  // Snöflingor som faller över titeln
  const snow = $('intro-snow');
  if (!snow.children.length) {
    for (let i = 0; i < 70; i++) {
      const f = document.createElement('span');
      f.className = 'flake';
      f.textContent = Math.random() < 0.35 ? '❄' : '•';
      f.style.left = `${Math.random() * 100}%`;
      f.style.fontSize = `${8 + Math.random() * 18}px`;
      f.style.opacity = `${0.4 + Math.random() * 0.6}`;
      f.style.animationDuration = `${6 + Math.random() * 9}s, ${3 + Math.random() * 3}s`;
      f.style.animationDelay = `${-Math.random() * 15}s, ${-Math.random() * 3}s`;
      snow.append(f);
    }
  }
  showOverlay('intro');
}

function leaveIntro() {
  if (state !== 'intro') return;
  Sound.init();
  Sound.click();
  $('intro').classList.add('leaving');
  setTimeout(() => {
    $('intro').classList.remove('leaving');
    showMenu();
    if (!save.tutorialSeen) showOverlay('tutask'); // första gången: erbjud tutorialen
  }, 450);
}

function showMenu() {
  state = 'menu';
  if (daily) {
    endDaily();
    resetWorld();
  }
  if (runSeed) {
    endRunSeed();
    resetWorld();
  }
  dailyAgain = false;
  ghostAgain = null;
  partyTrack();
  $('menu-bank').textContent = fmt(save.bank);
  updateBadgeDot();
  $('menu-best').textContent = fmt(save.best);
  // Bankortet i mitten: ikon, stort namn, beskrivning och egen färg per bana
  const card = $('course-card');
  const locked = !courseUnlocked();
  const price = COURSE_PRICE[save.course] || 0;
  card.className = `course-card course-${save.course}${locked ? ' locked' : ''}`;
  $('course-icon').textContent = locked ? '🔒' : COURSE_ICONS[save.course] || '🎿';
  $('course-name').textContent = t(`course.${save.course}`);
  for (const dot of $('course-dots').children) {
    dot.classList.toggle('active', dot.dataset.course === save.course);
    dot.classList.toggle('locked', !courseUnlocked(dot.dataset.course));
  }
  const mult = Math.round(pointsMult() * 100) / 100;
  const bonus = Math.round((difficulty.finishBonus || 0) * (COURSE_REWARD[save.course] || 1));
  $('course-desc').textContent = `${t(`course.${save.course}.desc`)} · ${t(`diff.${save.difficulty}`)}: ${fmt(runLength())} m, ${t('menu.pointsMult', { m: mult.toLocaleString(locale()) })}${bonus ? `, ${t('menu.finishBonus', { n: fmt(bonus) })}` : ''}, ${t('menu.finishDouble', { m: FINISH_MULT })}`;
  const play = $('btn-play');
  play.classList.toggle('unlock', locked);
  play.classList.toggle('cant', locked && save.bank < price);
  play.textContent = locked ? `🔒 ${t('course.unlock')} · 🪙 ${fmt(price)}` : t('btn.play');
  const ghost = myGhosts[save.course];
  $('btn-ghost-me').classList.toggle('hidden', locked || !ghost);
  if (ghost) setText('ghost-me-score', fmt(ghost.score));
  // Kort sammanfattning av inställningarna så att huvudmenyn kan vara ren
  $('menu-summary').textContent = [
    `${currentCharacter().icon} ${t(`char.${save.character}`)}`,
    t(isBoard() ? 'rider.board' : 'rider.ski'),
    t(`diff.${save.difficulty}`),
    t(save.night ? 'time.night' : 'time.day'),
  ].join(' · ');
  showOverlay('menu');
}

// Markerar valda alternativ i inställningsmenyn
function refreshSettings() {
  $('name-input').value = playerName();
  $('rider-ski').classList.toggle('active', !isBoard());
  $('rider-board').classList.toggle('active', isBoard());
  for (const b of $('diff-seg').children) b.classList.toggle('active', b.dataset.diff === save.difficulty);
  for (const b of $('time-seg').children) b.classList.toggle('active', (b.dataset.time === 'night') === !!save.night);
  $('poles-row').classList.toggle('hidden', isBoard());
  $('sens-input').value = Math.round((save.turnSens || 1) * 100);
  updateSensLabel();
  for (const b of $('helmet-seg').children) b.classList.toggle('active', (b.dataset.helmet === 'on') === (save.helmetOn !== false));
  for (const b of $('lift-seg').children) b.classList.toggle('active', (b.dataset.lift === 'on') === (save.lift !== false));
  for (const b of $('poles-seg').children) b.classList.toggle('active', (b.dataset.poles === 'on') === (save.style.poles !== 'poles-none'));
  for (const b of $('song-seg').children) b.classList.toggle('active', Number(b.dataset.song) === (save.audio.song || 0));
  for (const b of $('lang-seg').children) b.classList.toggle('active', b.dataset.lang === save.lang);
  updateAudioButtons();
}

function showSettings() {
  state = 'menu';
  refreshSettings();
  showOverlay('settings');
}
