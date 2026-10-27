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
}
