'use strict';
// Customize: färger på kläder, hjälm, skidor och stavar. Jacka och byxor väljs per karaktär.

let customRedraw = false;

function showCustomize() {
  state = 'menu'; // samma kamera som Karaktärer: åkaren syns bredvid panelen
  renderCustomize();
  showOverlay('customize');
}

// Köp en färg en gång (den kan sedan användas på alla karaktärer), välj sedan fritt
function renderCustomize() {
  const ch = currentCharacter();
  $('custom-bank').textContent = fmt(save.bank);
  setText('custom-char', `${ch.icon} ${t(`char.${ch.id}`)}`);
  const wrap = $('custom-styles');
  wrap.innerHTML = '';
  const look = save.look[ch.id] || {};
  for (const cat of ['jacket', 'jacketWrap', 'pants', 'pantsWrap', 'helmet', 'gear', 'wrap', 'poles']) {
    if (cat === 'poles' && isBoard()) continue; // inga stavar på snowboard
    const perChar = CHAR_STYLE_CATS.includes(cat);
    const row = document.createElement('div');
    row.className = 'style-row';
    const title = document.createElement('div');
    title.className = 'cat';
    title.textContent = perChar ? `${t(`style.${cat}`)} · ${ch.icon}` : t(`style.${cat}`);
    const list = document.createElement('div');
    list.className = 'swatches';
    // Original = karaktärens egna färger
    const wraps = STYLES.filter((x) => x.cat === 'wrap' && x.id !== 'wrap-none');
    const options = cat === 'jacketWrap' || cat === 'pantsWrap'
      ? [{ id: null, name: 'color.none', color: 'transparent', cost: 0 }, ...wraps]
      : perChar ? [{ id: null, name: 'color.original', color: null, cost: 0 }, ...STYLES.filter((x) => x.cat === cat)] : STYLES.filter((x) => x.cat === cat);
    for (const st of options) {
      const owned = !st.id || save.owned.includes(st.id);
      const selected = perChar ? (look[cat] || null) === st.id : save.style[cat] === st.id;
      const btn = document.createElement('button');
      btn.className = `swatch${selected ? ' selected' : owned ? ' owned' : ''}`;
      const dot = document.createElement('i');
      if (st.color) dot.style.background = st.color;
      if (st.icon) dot.textContent = st.icon;
      else if (!st.color) dot.textContent = ch.icon;
      if (st.color === 'transparent') dot.classList.add('none');
      if (!st.color || st.icon) dot.classList.add('orig');
      btn.dataset.style = !st.id ? `${cat}-orig` : st.cat === cat ? st.id : `${cat}:${st.id}`; // samma wrap finns i flera rader
      const name = document.createElement('span');
      name.className = 'sw-name';
      name.textContent = t(st.name);
      const price = document.createElement('span');
      price.className = 'sw-price';
      price.textContent = selected ? `✔ ${t('shop.selected')}` : owned ? t('shop.choose') : `🪙 ${fmt(st.cost)}`;
      btn.append(dot, name, price);
      btn.setAttribute('aria-disabled', String(!owned && save.bank < st.cost));
      // Se hur det blir innan man köper
      btn.addEventListener('mouseenter', () => previewSwatch(ch, cat, st.id, perChar));
      btn.addEventListener('focus', () => previewSwatch(ch, cat, st.id, perChar));
      btn.addEventListener('mouseleave', () => applyLook());
      btn.addEventListener('blur', () => { if (!customRedraw) applyLook(); });
      btn.addEventListener('click', () => {
        if (st.id && !save.owned.includes(st.id)) {
          if (save.bank < st.cost) return Sound.denied();
          Sound.buy();
          save.bank -= st.cost;
          save.owned.push(st.id);
        } else Sound.tick();
        if (perChar) {
          const l = save.look[ch.id] || (save.look[ch.id] = {});
          if (st.id) l[cat] = st.id;
          else delete l[cat];
        } else {
          save.style[cat] = st.id;
          if (cat === 'poles' && st.id !== 'poles-none') save.lastPoles = st.id;
        }
        persist();
        applyLook();
        // Fokus flyttas när listan ritas om – det ska inte räknas som att peka på en annan färg
        customRedraw = true;
        keepFocus('customize', renderCustomize);
        customRedraw = false;
      });
      list.append(btn);
    }
    row.append(title, list);
    wrap.append(row);
  }
}

// Visar en färg eller wrap på åkaren utan att spara den
function previewSwatch(ch, cat, id, perChar) {
  if (customRedraw) return;
  const before = perChar ? save.look[ch.id] : save.style[cat];
  if (perChar) {
    const l = { ...(before || {}) };
    if (id) l[cat] = id;
    else delete l[cat];
    save.look[ch.id] = l;
  } else save.style[cat] = id;
  applyLook();
  if (perChar) {
    if (before) save.look[ch.id] = before;
    else delete save.look[ch.id];
  } else save.style[cat] = before;
}
