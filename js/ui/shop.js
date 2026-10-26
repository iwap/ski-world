'use strict';
// Butiken.

function showShop() {
  state = 'shop';
  renderShop();
  showOverlay('shop');
}

function renderShop() {
  $('shop-bank').textContent = fmt(save.bank);
  const wrap = $('shop-items');
  wrap.innerHTML = '';
  for (const u of UPGRADES) {
    const level = save.upgrades[u.id];
    const maxed = level >= u.max;
    const cost = upgradeCost(u, level);

    const item = document.createElement('div');
    item.className = `item${maxed ? ' maxed' : save.bank >= cost ? ' afford' : ''}`;
    item.innerHTML = `
      <div class="icon">${u.icon}</div>
      <div class="info">
        <div class="name">${t(`up.${u.id}`)}</div>
        <div class="desc">${t(`up.${u.id}.desc`)}</div>
        <div class="pips">${'<i class="on"></i>'.repeat(level)}${'<i></i>'.repeat(u.max - level)}<small>${t('shop.level', { l: level, m: u.max })}</small></div>
      </div>`;

    const btn = document.createElement('button');
    btn.className = 'buy-btn';
    btn.textContent = maxed ? `✔ ${t('shop.max')}` : `🪙 ${fmt(cost)}`;
    btn.setAttribute('aria-disabled', String(maxed || save.bank < cost));
    btn.addEventListener('click', () => {
      if (save.bank < cost || save.upgrades[u.id] >= u.max) return Sound.denied();
      Sound.buy();
      save.bank -= cost;
      save.upgrades[u.id]++;
      persist();
      keepFocus('shop', renderShop);
    });
    item.append(btn);
    wrap.append(item);
  }

  // Stil: köp en färg en gång, välj sedan fritt bland dem du äger
  const styles = $('shop-styles');
  styles.innerHTML = '';
  for (const cat of STYLE_CATS) {
    if (cat.id === 'poles' && isBoard()) continue; // inga stavar på snowboard
    const row = document.createElement('div');
    row.className = 'style-row';
    const title = document.createElement('div');
    title.className = 'cat';
    title.textContent = t(`style.${cat.id}`);
    const list = document.createElement('div');
    list.className = 'swatches';
    for (const st of STYLES.filter((x) => x.cat === cat.id)) {
      const owned = save.owned.includes(st.id);
      const selected = save.style[cat.id] === st.id;
      const btn = document.createElement('button');
      btn.className = `swatch${selected ? ' selected' : owned ? ' owned' : ''}`;
      const dot = document.createElement('i');
      dot.style.background = st.color;
      if (st.color === 'transparent') dot.classList.add('none');
      const name = document.createElement('span');
      name.className = 'sw-name';
      name.textContent = t(st.name);
      const price = document.createElement('span');
      price.className = 'sw-price';
      price.textContent = selected ? `✔ ${t('shop.selected')}` : owned ? t('shop.choose') : `🪙 ${fmt(st.cost)}`;
      btn.append(dot, name, price);
      btn.setAttribute('aria-disabled', String(!owned && save.bank < st.cost));
      btn.addEventListener('click', () => {
        if (!save.owned.includes(st.id)) {
          if (save.bank < st.cost) return Sound.denied();
          Sound.buy();
          save.bank -= st.cost;
          save.owned.push(st.id);
        }
        save.style[cat.id] = st.id;
        if (cat.id === 'poles' && st.id !== 'poles-none') save.lastPoles = st.id;
        persist();
        applyLook();
        keepFocus('shop', renderShop);
      });
      list.append(btn);
    }
    row.append(title, list);
    styles.append(row);
  }
}
