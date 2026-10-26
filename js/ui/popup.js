'use strict';
// Popup-texter mitt på skärmen.

function popup(title, sub = '', color = '#1d2b3a') {
  const el = document.createElement('div');
  el.className = 'popup';
  const t = document.createElement('div');
  t.className = 'title';
  t.style.color = color;
  t.textContent = title;
  el.append(t);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'sub';
    s.textContent = sub;
    el.append(s);
  }
  $('popups').append(el);
  setTimeout(() => el.remove(), 1600);
}
