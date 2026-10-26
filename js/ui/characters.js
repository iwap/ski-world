'use strict';
// Karaktärsvalet och karaktärsboxen.

// Karaktärer: rutnät med kort, markerad karaktär visas direkt på åkaren i 3D
function showCharacters() {
  state = 'menu';
  renderCharacters();
  showOverlay('characters');
  const sel = $('char-grid').querySelector('.selected');
  if (sel) sel.focus();
}

function renderCharacters() {
  const grid = $('char-grid');
  grid.innerHTML = '';
  $('btn-box').textContent = `🎁 ${t('box.title')} · 🪙 ${fmt(BOX_PRICE)}`;
  for (const ch of CHARACTERS) {
    const b = document.createElement('button');
    const owned = save.chars.includes(ch.id);
    b.className = `char-card char-${ch.id} rar-${ch.rarity}${ch.id === save.character ? ' selected' : ''}${owned ? '' : ' locked'}`;
    b.style.setProperty('--rar', RARITIES[ch.rarity].color);
    b.dataset.char = ch.id;
    b.innerHTML = `<span class="char-ico">${ch.icon}</span><span class="char-name">${t(`char.${ch.id}`)}</span>${owned ? '' : '<span class="char-lock">🔒</span>'}`;
    b.addEventListener('focus', () => previewCharacter(ch));
    b.addEventListener('mouseenter', () => previewCharacter(ch));
    b.addEventListener('click', () => {
      if (!save.chars.includes(ch.id)) {
        Sound.denied();
        b.classList.remove('denied');
        void b.offsetWidth;
        b.classList.add('denied');
        return;
      }
      save.character = ch.id;
      persist();
      applyLook();
      Sound.buy();
      for (const c of grid.children) c.classList.toggle('selected', c === b);
      previewCharacter(ch);
    });
    grid.append(b);
  }
  previewCharacter(currentCharacter());
}

// Förmågan som text, t.ex. "+10 % fart · +1 extraliv"
function abilityText(ch) {
  return ABILITY_KEYS.filter((k) => ch.ab && ch.ab[k])
    .map((k) => t(`ab.${k}`, { n: k === 'lives' ? ch.ab[k] : Math.round(ch.ab[k] * 100) }))
    .join(' · ');
}

function rarityTag(ch) {
  const span = document.createElement('span');
  span.className = `rar-tag rar-${ch.rarity}`;
  span.style.setProperty('--rar', RARITIES[ch.rarity].color);
  span.textContent = t(`rar.${ch.rarity}`) + (RARITIES[ch.rarity].chance ? ` · ${RARITIES[ch.rarity].chance} %` : '');
  return span;
}

function previewCharacter(ch) {
  applyLook(ch);
  const owned = save.chars.includes(ch.id);
  const title = $('char-title');
  title.textContent = `${ch.icon} ${t(`char.${ch.id}`)} `;
  title.append(rarityTag(ch));
  $('char-desc').textContent = t(`char.${ch.id}.desc`);
  $('char-ability').textContent = `⚡ ${t('char.ability')}: ${abilityText(ch)}`;
  $('char-pick').textContent = !owned ? t('char.locked') : ch.id === save.character ? `✔ ${t('shop.selected')}` : t('chars.pick');
  $('char-pick').classList.toggle('is-selected', owned && ch.id === save.character);
  $('char-pick').classList.toggle('is-locked', !owned);
}

// ---------- Karaktärsbox: snurra för 10 000, raritet avgör chansen ----------
const BOX_CARD = 104; // kortbredd + mellanrum i snurran (px)
const BOX_WIN = 40;   // vinnande kortets plats i remsan
let boxSpinning = false;
let boxResult = null;

function rollCharacter() {
  let r = Math.random() * 100;
  let rarity = 'common';
  for (const [id, info] of Object.entries(RARITIES)) {
    if (!info.chance) continue;
    if (r < info.chance) { rarity = id; break; }
    r -= info.chance;
  }
  const pool = CHARACTERS.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function boxCard(ch) {
  const d = document.createElement('div');
  d.className = `box-card rar-${ch.rarity}`;
  d.style.setProperty('--rar', RARITIES[ch.rarity].color);
  d.innerHTML = `<span class="char-ico">${ch.icon}</span><span class="char-name">${t(`char.${ch.id}`)}</span>`;
  return d;
}

function showBox() {
  state = 'menu';
  boxResult = null;
  renderBox();
  // Remsan fylls med slumpade karaktärer så att den inte är tom innan man snurrar
  const reel = $('box-reel');
  reel.innerHTML = '';
  reel.style.transition = 'none';
  reel.style.transform = 'translateX(0)';
  for (let i = 0; i < 12; i++) reel.append(boxCard(rollCharacter()));
  showOverlay('box');
}

function renderBox() {
  setText('box-bank', fmt(save.bank));
  const spin = $('btn-box-spin');
  spin.textContent = t('box.spin', { p: fmt(BOX_PRICE) });
  spin.setAttribute('aria-disabled', String(boxSpinning || save.bank < BOX_PRICE));
  spin.classList.toggle('cant', save.bank < BOX_PRICE);
  $('btn-box-equip').classList.toggle('hidden', !boxResult || !boxResult.isNew || boxSpinning);
  const odds = $('box-odds');
  odds.innerHTML = '';
  for (const [id, info] of Object.entries(RARITIES)) {
    if (!info.chance) continue;
    const row = document.createElement('div');
    row.className = 'odds-row';
    row.style.setProperty('--rar', info.color);
    const chars = CHARACTERS.filter((c) => c.rarity === id).map((c) => `<span title="${t(`char.${c.id}`)}" class="${save.chars.includes(c.id) ? 'got' : ''}">${c.icon}</span>`).join('');
    row.innerHTML = `<b>${t(`rar.${id}`)}</b><span class="odds-pct">${info.chance} %</span><span class="odds-chars">${chars}</span>`;
    odds.append(row);
  }
}

function spinBox() {
  if (boxSpinning) return;
  if (save.bank < BOX_PRICE) {
    Sound.denied();
    setText('box-msg', t('box.poor', { p: fmt(BOX_PRICE) }));
    $('box-msg').classList.remove('hidden');
    return;
  }
  save.bank -= BOX_PRICE;
  const win = rollCharacter();
  const isNew = !save.chars.includes(win.id);
  const refund = isNew ? 0 : RARITIES[win.rarity].refund;
  if (isNew) save.chars.push(win.id);
  else save.bank += refund;
  persist(); // resultatet sparas direkt, även om man stänger under snurren
  boxResult = { ch: win, isNew, refund };
  boxSpinning = true;
  $('box-result').classList.add('hidden');
  $('box-msg').classList.add('hidden');
  renderBox();
  setText('box-bank', fmt(save.bank + (isNew ? 0 : -refund)));

  const reel = $('box-reel');
  reel.innerHTML = '';
  reel.style.transition = 'none';
  reel.style.transform = 'translateX(0)';
  for (let i = 0; i < BOX_WIN + 5; i++) {
    // Lite fler sällsynta kort i remsan än i verkligheten – det ser spännande ut när de susar förbi
    let ch = rollCharacter();
    if (i === BOX_WIN) ch = win;
    else if (Math.random() < 0.08) ch = CHARACTERS.filter((c) => c.rarity === 'legendary' || c.rarity === 'epic')[Math.floor(Math.random() * 3)];
    reel.append(boxCard(ch));
  }
  void reel.offsetWidth;
  const wrapW = $('box-reel-wrap').clientWidth;
  const jitter = (Math.random() - 0.5) * (BOX_CARD - 30);
  const target = -(BOX_WIN * BOX_CARD + BOX_CARD / 2 - wrapW / 2 + jitter);
  const dur = 5200;
  reel.style.transition = `transform ${dur}ms cubic-bezier(0.08, 0.6, 0.12, 1)`;
  reel.style.transform = `translateX(${target}px)`;
  // Tick-ljud varje gång ett kort passerar mitten
  let lastIdx = -1;
  const tick = () => {
    if (!boxSpinning) return;
    const x = new DOMMatrixReadOnly(getComputedStyle(reel).transform).m41;
    const idx = Math.floor((wrapW / 2 - x) / BOX_CARD);
    if (idx !== lastIdx) { lastIdx = idx; Sound.tick(); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(revealBox, dur + 150);
}

function revealBox() {
  boxSpinning = false;
  const { ch, isNew, refund } = boxResult;
  const card = reelWinCard();
  if (card) card.classList.add('won');
  const res = $('box-result');
  res.innerHTML = '';
  res.style.setProperty('--rar', RARITIES[ch.rarity].color);
  res.className = `box-result rar-${ch.rarity}`;
  const big = document.createElement('div');
  big.className = 'box-big';
  big.textContent = ch.icon;
  const info = document.createElement('div');
  info.className = 'box-info';
  const head = document.createElement('div');
  head.className = 'box-head';
  head.textContent = isNew ? t('box.new') : t('box.dupe', { n: fmt(refund) });
  const name = document.createElement('div');
  name.className = 'box-name';
  name.textContent = `${t(`char.${ch.id}`)} `;
  name.append(rarityTag(ch));
  const ab = document.createElement('div');
  ab.className = 'box-ab';
  ab.textContent = `⚡ ${abilityText(ch)}`;
  info.append(head, name, ab);
  res.append(big, info);
  Sound.reveal(Object.keys(RARITIES).indexOf(ch.rarity));
  renderBox();
  (isNew ? $('btn-box-equip') : $('btn-box-spin')).focus();
}

const reelWinCard = () => $('box-reel').children[BOX_WIN];

function equipBoxResult() {
  if (!boxResult) return;
  save.character = boxResult.ch.id;
  persist();
  applyLook();
  Sound.buy();
  showCharacters();
}

function showHelp() {
  state = 'menu';
  showOverlay('help');
}

function setRider(rider) {
  save.rider = rider;
  persist();
  resetCrash();
  applyLook();
  refreshSettings();
  $(rider === 'ski' ? 'rider-ski' : 'rider-board').focus();
}
