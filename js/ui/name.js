'use strict';
// Spelarnamn (minst 3 tecken, unikt via servern).

// Namn: minst 3 tecken och unikt bland alla spelare (kollas mot servern när den finns)
function playerName() {
  return save.name || `${t('defaultName')}${save.playerId.slice(0, 4).toUpperCase()}`;
}
function nameMsg(key, vars = {}, kind = 'err') {
  const el = $('name-msg');
  el.textContent = key ? t(key, vars) : '';
  el.className = `name-msg ${kind}${key ? '' : ' hidden'}`;
}
let nameReq = 0;
async function commitName() {
  const input = $('name-input');
  const v = input.value.trim().slice(0, 16);
  if (v === playerName()) return nameMsg(null);
  if (v.length < 3) {
    nameMsg('name.short');
    input.value = playerName();
    return;
  }
  if (!Online.on) {
    save.name = v;
    persist();
    return nameMsg('name.saved', {}, 'ok');
  }
  const req = ++nameReq;
  nameMsg('name.checking', {}, 'info');
  const res = await Online.claimName(v);
  if (req !== nameReq) return;
  if (res === true) {
    save.name = v;
    persist();
    nameMsg('name.ok', { name: v }, 'ok');
    partyTrack(true);
  } else {
    nameMsg(res === false ? 'name.taken' : 'name.offline', { name: v });
    input.value = playerName();
  }
}
$('name-input').addEventListener('change', commitName);
$('name-input').addEventListener('input', () => nameMsg(null));
