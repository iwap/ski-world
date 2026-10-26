'use strict';
// Online-party: lobby, inbjudningar, race, parallellslalom, trick-duell, Big Air-tävling.

// ---------- Online: party, sessioner med flera spelare och olika spellägen ----------
// Bygger på Supabase Realtime (presence + broadcast). Lobbyn "ski-lobby" visar vilka som är online och
// skickar inbjudningar. Varje session har en egen kanal "ski-s-<id>" för start, positioner och resultat.
const party = {
  on: Online.on,
  client: null, lobby: null, ready: false,
  players: [],      // andra spelare online
  mode: 'race',     // valt spelläge i Online-menyn
  hosting: null,    // min grupp innan start: { sid, mode, course, difficulty, ch, invited: Map }
  joined: null,     // gruppen jag gått med i och väntar på start: { sid, host, hostName, mode, ch }
  incoming: null,   // inbjudan till mig
};
// Spellägen: max antal spelare (inklusive mig)
const PARTY_MODES = {
  race:    { icon: '🏁', max: 8 },
  pslalom: { icon: '🚩', max: 2 },
  duel:    { icon: '🔤', max: 2 },
  bigair:  { icon: '🚀', max: 4 },
};
const EMOTES = ['👏', '🔥', '😂', '😤'];
const DUEL_WORD = 'SKIDA';
const BIGAIR_ATTEMPTS = 3;
// Banor för partylägen (syns inte i menyn)
const PARTY_COURSES = {
  pslalom: { ...COURSES.slalom, netX: 26, density: 0, pslalom: true, weights: { star: 0 } },
  duel: { ...COURSES.park, netX: 14, density: 0, waves: [], bumps: 0, weights: { star: 0 } },
  bigair: { ...COURSES.bigair, density: 0, weights: { star: 0 } },
};
const LANE_X = 12; // parallellslalom: banornas mitt på var sin sida

let race = null;   // pågående session (se beginSession)
let lastSession = null; // senaste avslutade sessionen, för revansch och emojis
const RACE_COUNTDOWN = 4000;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sessionBusy = () => !!(race || party.hosting || party.joined || party.incoming || tutorial || daily);

function partyMe() {
  const ch = currentCharacter();
  const status = race || party.joined ? 'race' : ['menu', 'shop', 'gameover'].includes(state) ? 'menu' : 'riding';
  return { id: save.playerId, name: playerName(), icon: ch.icon, status, course: save.course };
}

async function partyConnect() {
  if (!party.on || party.client) return;
  party.client = Online.client;
  // Kanalerna är privata: logga in (anonymt) först
  const session = await Online.auth();
  if (!session) {
    party.client = null; // försök igen när Online-menyn öppnas
    renderParty();
    return;
  }
  try {
    party.client.realtime.setAuth(session.access_token);
    party.lobby = party.client.channel('ski-lobby', { config: { private: true, presence: { key: save.playerId }, broadcast: { self: false } } });
    party.lobby
      .on('presence', { event: 'sync' }, partySync)
      .on('broadcast', { event: 'invite' }, ({ payload }) => onInvite(payload))
      .on('broadcast', { event: 'reply' }, ({ payload }) => onReply(payload))
      .subscribe((status) => {
        party.ready = status === 'SUBSCRIBED';
        if (party.ready) partyTrack(true);
        renderParty();
      });
  } catch {
    party.on = false;
  }
}

// Uppdatera min status (meny/åker/race) när den ändras
let lastTrack = '';
function partyTrack(force = false) {
  if (!party.ready) return;
  const me = partyMe();
  const key = JSON.stringify(me);
  if (!force && key === lastTrack) return;
  lastTrack = key;
  party.lobby.track(me);
}

const onlineIds = () => new Set(party.players.map((p) => p.id));

function partySync() {
  const state0 = party.lobby.presenceState();
  party.players = Object.values(state0).map((list) => list[0]).filter((p) => p && p.id !== save.playerId);
  const ids = onlineIds();
  // Någon i sessionen har stängt spelet
  // Någon saknas i listan: räkna som borta först efter 6 s (korta avbrott i nätet ska inte avgöra något)
  if (race) {
    for (const [id, o] of race.others) {
      if (ids.has(id)) o.missingSince = 0;
      else if (!o.left && !o.missingSince) o.missingSince = performance.now();
    }
  }
  if (party.joined && !ids.has(party.joined.host)) leaveLobbyGroup('party.cancelled', party.joined.hostName);
  if (party.hosting) {
    for (const [id, m] of party.hosting.invited) if (m.status !== 'gone' && !ids.has(id)) m.status = 'gone';
  }
  renderParty();
}

function showParty() {
  state = 'menu';
  partyConnect();
  showOverlay('party');
  renderParty();
}

function setPartyMode(mode) {
  if (party.hosting) return Sound.denied(); // gruppen är redan inbjuden till ett läge
  party.mode = mode;
  renderParty();
}

function renderParty() {
  if ($('party').classList.contains('hidden')) return;
  const status = !party.on ? t('party.offline') : !party.ready ? t('party.connecting') : '';
  setText('party-status', status);
  $('party-status').classList.toggle('hidden', !status);
  setText('party-me', party.ready ? t('party.me', { name: playerName(), course: t(`course.${save.course}`) }) : '');
  // Spelläge
  for (const b of $('party-modes').children) {
    b.classList.toggle('active', b.dataset.mode === party.mode);
    b.setAttribute('aria-disabled', String(!!party.hosting && b.dataset.mode !== party.mode));
  }
  setText('party-mode-desc', t(`mode.${party.mode}.desc`, { n: PARTY_MODES[party.mode].max }));
  // Min grupp (som värd) eller väntan på start (som inbjuden)
  const box = $('party-group');
  box.innerHTML = '';
  box.classList.toggle('hidden', !party.hosting && !party.joined);
  if (party.hosting) {
    const h = party.hosting;
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = `${PARTY_MODES[h.mode].icon} ${t(`mode.${h.mode}`)}`;
    box.append(title);
    for (const [, m] of h.invited) {
      const row = document.createElement('div');
      row.className = `group-row g-${m.status}`;
      row.textContent = `${m.name} · ${t(`group.${m.status}`)}`;
      box.append(row);
    }
    const btns = document.createElement('div');
    btns.className = 'group-btns';
    const start = document.createElement('button');
    start.className = 'primary';
    const ready = [...h.invited.values()].filter((m) => m.status === 'joined').length;
    start.textContent = t('group.start', { n: ready + 1 });
    start.setAttribute('aria-disabled', String(ready === 0));
    start.addEventListener('click', () => (ready ? startSession() : Sound.denied()));
    const cancel = document.createElement('button');
    cancel.textContent = t('group.cancel');
    cancel.addEventListener('click', cancelHosting);
    btns.append(cancel, start);
    box.append(btns);
  } else if (party.joined) {
    const j = party.joined;
    const row = document.createElement('div');
    row.className = 'group-title';
    row.textContent = `${PARTY_MODES[j.mode].icon} ${t('group.waitHost', { name: j.hostName, mode: t(`mode.${j.mode}`) })}`;
    const leave = document.createElement('button');
    leave.textContent = t('group.leave');
    leave.addEventListener('click', () => {
      j.ch.send({ type: 'broadcast', event: 'leave', payload: { id: save.playerId } });
      leaveLobbyGroup();
    });
    box.append(row, leave);
  }
  // Spelare online
  const list = $('party-list');
  list.innerHTML = '';
  const max = PARTY_MODES[party.mode].max;
  const invitedCount = party.hosting ? [...party.hosting.invited.values()].filter((m) => m.status === 'invited' || m.status === 'joined').length : 0;
  for (const p of party.players) {
    const st = ['menu', 'riding', 'race'].includes(p.status) ? p.status : 'menu';
    const row = document.createElement('div');
    row.className = `party-row st-${st}`;
    // Allt från andra spelare sätts som text, aldrig som HTML
    row.innerHTML = '<span class="party-ico"></span><span class="party-name"></span><span class="party-st"></span>';
    row.querySelector('.party-ico').textContent = String(p.icon || '⛷️').slice(0, 8);
    row.querySelector('.party-name').textContent = String(p.name || '').slice(0, 24);
    row.querySelector('.party-st').textContent = t(`party.st.${st}`);
    const btn = document.createElement('button');
    btn.className = 'party-invite';
    const already = party.hosting && party.hosting.invited.has(p.id) && ['invited', 'joined'].includes(party.hosting.invited.get(p.id).status);
    btn.textContent = already ? t('party.waiting') : t('party.invite');
    const busy = st !== 'menu' || already || !!race || !!party.joined || invitedCount + 1 >= max;
    btn.setAttribute('aria-disabled', String(busy));
    btn.addEventListener('click', () => (busy ? Sound.denied() : sendInvite(p)));
    row.append(btn);
    list.append(row);
  }
  $('party-empty').classList.toggle('hidden', !party.ready || party.players.length > 0);
}

// Gemensam sessionskanal: samma hanterare för värd och inbjudna
function openSessionChannel(sid, onReady) {
  const ch = party.client.channel(`ski-s-${sid}`, { config: { private: true, broadcast: { self: false } } });
  const mine = (fn) => ({ payload }) => {
    if (race && race.id === sid) fn(payload);
  };
  ch.on('broadcast', { event: 'start' }, ({ payload }) => {
    if (!party.joined || party.joined.sid !== sid) return;
    // Har börjat göra något annat: lämna i stället för att dras in
    if (!['menu', 'shop', 'gameover'].includes(state) || daily || tutorial) return leaveJoinedGroup();
    beginSession(payload);
  })
    .on('broadcast', { event: 'cancel' }, () => {
      if (party.joined && party.joined.sid === sid) leaveLobbyGroup('party.cancelled', party.joined.hostName);
    })
    .on('broadcast', { event: 'leave' }, ({ payload }) => {
      if (party.hosting && party.hosting.sid === sid && party.hosting.invited.has(payload.id)) {
        party.hosting.invited.get(payload.id).status = 'gone';
        renderParty();
      }
      if (race && race.id === sid) memberLeft(payload.id);
    })
    .on('broadcast', { event: 'pos' }, mine((m) => { const o = race.others.get(m.id); if (o) o.pos = m; }))
    .on('broadcast', { event: 'done' }, mine((m) => { const o = race.others.get(m.id); if (o) { o.done = m; checkSessionEnd(); } }))
    .on('broadcast', { event: 'trick' }, mine((m) => applyDuel(m.id, m.sig, m.landed, m.turn)))
    .on('broadcast', { event: 'attempt' }, mine((m) => bigairScore(m.id, m.n, m.score)))
    .on('broadcast', { event: 'emote' }, ({ payload }) => showEmote(payload.id, payload.e))
    .subscribe((status) => { if (status === 'SUBSCRIBED' && onReady) onReady(); });
  return ch;
}

function sendInvite(p) {
  // Första inbjudan: skapa gruppen och dess kanal
  if (!party.hosting) {
    const sid = newId();
    party.hosting = { sid, mode: party.mode, course: save.course, difficulty: save.difficulty, invited: new Map() };
    party.hosting.ch = openSessionChannel(sid);
  }
  const h = party.hosting;
  h.invited.set(p.id, { name: String(p.name || '').slice(0, 24), status: 'invited' });
  party.lobby.send({ type: 'broadcast', event: 'invite', payload: { to: p.id, from: save.playerId, fromName: playerName(), sid: h.sid, mode: h.mode, course: h.course, difficulty: h.difficulty } });
  Sound.click();
  renderParty();
  // Inget svar inom 20 s
  setTimeout(() => {
    const m = party.hosting && party.hosting.sid === h.sid && h.invited.get(p.id);
    if (m && m.status === 'invited') {
      m.status = 'noanswer';
      renderParty();
    }
  }, 20000);
}

function cancelHosting() {
  const h = party.hosting;
  if (!h) return;
  h.ch.send({ type: 'broadcast', event: 'cancel', payload: {} });
  party.hosting = null;
  setTimeout(() => party.client.removeChannel(h.ch), 1000);
  renderParty();
  partyTrack(true);
}

// Jag väntade i en grupp men började göra något annat: säg till värden och lämna
function leaveJoinedGroup() {
  if (!party.joined || race) return;
  party.joined.ch.send({ type: 'broadcast', event: 'leave', payload: { id: save.playerId } });
  leaveLobbyGroup();
}

// Lämna gruppen jag väntade i (eller värden avbröt)
function leaveLobbyGroup(msgKey, name) {
  const j = party.joined;
  if (!j) return;
  party.joined = null;
  setTimeout(() => party.client.removeChannel(j.ch), 1000);
  if (msgKey) popup(`👥 ${t(msgKey, { name })}`, '', '#5d4037');
  renderParty();
  partyTrack(true);
}

function onInvite(inv) {
  if (inv.to !== save.playerId || !PARTY_MODES[inv.mode]) return;
  // Upptagen eller (i race-läget) låst bana: tacka nej direkt
  const locked = inv.mode === 'race' && !courseUnlocked(inv.course);
  if (sessionBusy() || !['menu', 'shop', 'gameover'].includes(state) || locked) {
    party.lobby.send({ type: 'broadcast', event: 'reply', payload: { to: inv.from, from: save.playerId, sid: inv.sid, ok: false, locked } });
    return;
  }
  party.incoming = inv;
  const where = inv.mode === 'race' ? t(`course.${inv.course}`) : t(`mode.${inv.mode}`);
  setText('invite-text', t(inv.mode === 'race' ? 'party.invited' : 'party.invitedMode', { name: String(inv.fromName).slice(0, 24), course: where }));
  $('invite-toast').classList.remove('hidden');
  Sound.combo(3);
  setTimeout(() => { if (party.incoming === inv) answerInvite(false); }, 20000);
}

function answerInvite(ok) {
  const inv = party.incoming;
  if (!inv) return;
  party.incoming = null;
  $('invite-toast').classList.add('hidden');
  if (!['menu', 'shop', 'gameover'].includes(state) || race || party.hosting || party.joined || tutorial || daily) ok = false; // har börjat göra annat
  const reply = (yes) => party.lobby.send({ type: 'broadcast', event: 'reply', payload: { to: inv.from, from: save.playerId, sid: inv.sid, ok: yes } });
  if (!ok) return reply(false);
  // Gå med i gruppens kanal först, svara sedan – då missar jag inte startsignalen
  party.joined = { sid: inv.sid, host: inv.from, hostName: String(inv.fromName).slice(0, 24), mode: inv.mode };
  party.joined.ch = openSessionChannel(inv.sid, () => reply(true));
  showParty();
  partyTrack(true);
}

function onReply(r) {
  if (r.to !== save.playerId) return;
  const h = party.hosting;
  const m = h && h.sid === r.sid && h.invited.get(r.from);
  if (!m) {
    // Svar till en grupp som inte finns längre: säg till att den är avbruten
    if (r.ok) {
      const ch = party.client.channel(`ski-s-${r.sid}`, { config: { private: true, broadcast: { self: false } } });
      ch.subscribe((st) => {
        if (st !== 'SUBSCRIBED') return;
        ch.send({ type: 'broadcast', event: 'cancel', payload: {} });
        setTimeout(() => party.client.removeChannel(ch), 1000);
      });
    }
    return;
  }
  if (m.status !== 'invited' && m.status !== 'noanswer') return;
  m.status = r.ok ? 'joined' : r.locked ? 'locked' : 'declined';
  if (r.ok) Sound.click();
  renderParty();
}

// Värden startar: alla som gått med får samma frö och samma lista över spelare
function startSession() {
  const h = party.hosting;
  if (!h || !['menu', 'shop', 'gameover'].includes(state)) return;
  const members = [{ id: save.playerId, name: playerName() }];
  for (const [id, m] of h.invited) if (m.status === 'joined') members.push({ id, name: m.name });
  if (members.length < 2) return Sound.denied();
  const start = { sid: h.sid, mode: h.mode, course: h.course, difficulty: h.difficulty, seed: Math.floor(Math.random() * 2 ** 31), members, host: save.playerId };
  h.ch.send({ type: 'broadcast', event: 'start', payload: start });
  party.joined = { ch: h.ch, sid: h.sid };
  party.hosting = null;
  beginSession(start);
}

// Bygg sessionens värld från fröet: samma bana för alla
function buildSessionWorld() {
  const r = race;
  worldRng = mulberry32(r.seed);
  if (r.mode === 'race') {
    course = COURSES[r.course] || COURSES.classic;
    resetWorld();
  } else if (r.mode === 'pslalom') {
    course = PARTY_COURSES.pslalom;
    resetWorld();
  } else {
    // Trick-duell och Big Air-tävling: ett enda hopp, samma för alla
    course = PARTY_COURSES[r.mode];
    resetWorld();
    objects.forEach(removeObject);
    objects = [];
    features = [];
    nextSpawnD = 1e9;
    nextMegaD = 1e9;
    nextGateD = 1e9;
    const rampType = OBSTACLES.find((o) => o.type === 'ramp');
    const size = r.mode === 'duel' ? 3 : RAMPS.length - 1;
    const real = course;
    course = { ...real, rampSizes: RAMPS.map((_, i) => (i === size ? 1 : 0)) };
    const o = makeObject(rampType, 0, 70);
    course = real;
    objects.push(o);
    r.kickD = o.d;
    r.endD = (o.feature ? o.feature.d3 : o.d + 60) + 6;
  }
  worldRng = null;
  r.rng = mulberry32(r.seed + 1);
  if (r.mode === 'pslalom') {
    player.x = (r.lane === 0 ? -1 : 1) * LANE_X;
    buildLaneDivider();
  }
  player.speed = stats().cruise;
  if (r.mode === 'duel' || r.mode === 'bigair') player.lives = 99; // en krasch avslutar bara försöket
}

function beginSession(start) {
  if (race) return;
  const others = new Map();
  for (const m of start.members) {
    if (m.id === save.playerId) continue;
    const mesh = makeNpcMesh();
    mesh.add(makeNameTag(String(m.name).slice(0, 14)));
    mesh.visible = false;
    others.set(m.id, { name: String(m.name).slice(0, 24), pos: null, done: null, left: false, mesh, attempts: [] });
  }
  const ch = party.joined ? party.joined.ch : null;
  party.joined = null;
  party.incoming = null;
  $('invite-toast').classList.add('hidden');
  race = {
    id: start.sid, mode: start.mode, seed: start.seed, course: start.course, difficulty: start.difficulty,
    members: start.members, others, ch, host: start.host, myDone: null, startedAt: 0, sent: 0,
    startAt: performance.now() + RACE_COUNTDOWN,
    lane: start.members.findIndex((m) => m.id === save.playerId) === 0 ? 0 : 1,
    prev: { course: save.course, difficulty: save.difficulty },
    attempts: [], attempt: null, duel: null,
  };
  // Race och parallellslalom räknas som vanliga åk på den banan
  if (race.mode === 'race' || race.mode === 'pslalom') {
    save.course = race.mode === 'pslalom' ? 'slalom' : COURSES[race.course] ? race.course : 'classic';
    save.difficulty = DIFFICULTIES[race.difficulty] ? race.difficulty : 'normal';
  } else {
    save.difficulty = 'normal';
  }
  difficulty = DIFFICULTIES[save.difficulty];
  if (race.mode === 'duel') {
    const letters = {};
    for (const m of race.members) letters[m.id] = 0;
    race.duel = { setter: race.host, active: race.host, phase: 'set', trick: null, letters, msg: '', turn: 0 };
  }
  buildSessionWorld();
  $('popups').innerHTML = '';
  wasMenu = true;
  showOverlay(null);
  if (race.mode === 'duel' && race.duel.active !== save.playerId) enterSpectate();
  else startCountdown(RACE_COUNTDOWN);
  partyTrack(true);
}

function startCountdown(ms) {
  race.startAt = performance.now() + ms;
  state = 'countdown';
  $('countdown').classList.remove('hidden');
}

// Väntar på min tur: stå still vid starten och titta på de andra
function enterSpectate() {
  state = 'spectate';
  player.speed = 0;
  $('countdown').classList.add('hidden');
}

// Nedräkning 3-2-1-KÖR
function updateCountdown() {
  const left = race ? race.startAt - performance.now() : 0;
  const n = Math.ceil(left / 1000) - 1;
  const txt = n > 0 ? String(n) : t('race.go');
  if ($('countdown').textContent !== txt) {
    $('countdown').textContent = txt;
    if (left > 0) Sound.tick();
  }
  if (left <= 0) {
    state = 'playing';
    if (race) {
      race.startedAt = performance.now();
      if (race.mode === 'duel' || race.mode === 'bigair') race.attempt = { crashed: false, combo: null, maxZ: 0 };
    }
    Sound.combo(4);
    setTimeout(() => $('countdown').classList.add('hidden'), 600);
  }
}

// Varje bildruta: skicka min position, flytta de andras åkare, kolla försök i minilägena
function updateRace(dt) {
  if (race && !race.myDone && (race.mode === 'race' || race.mode === 'pslalom')) worldRng = race.rng;
  const hud = $('race-hud');
  if (!race) {
    hud.classList.add('hidden');
    const results = !$('gameover').classList.contains('hidden') || !$('sessres').classList.contains('hidden');
    $('emote-bar').classList.toggle('hidden', !(lastSession && results));
    return;
  }
  const p = player;
  const now = performance.now();
  for (const [id, o] of race.others) if (o.missingSince && now - o.missingSince > 6000 && !o.left) memberLeft(id);
  if (!race) return;
  // Färre positionsmeddelanden när många är med (gratisnivåns gränser)
  const every = race.members.length > 4 ? 250 : race.members.length > 2 ? 150 : 100;
  if (state === 'playing' && now - race.sent > every) {
    race.sent = now;
    race.ch.send({ type: 'broadcast', event: 'pos', payload: { id: save.playerId, x: p.x, d: p.d, z: p.z, a: p.angle, spin: p.spin } });
  }
  for (const [, o] of race.others) {
    const m = o.mesh;
    const q = o.pos;
    m.visible = !!q && !o.left;
    if (!q) continue;
    // Mjuk förflyttning mot senast kända position (hoppa direkt vid stora språng, t.ex. nytt försök)
    const far = m.userData.d === undefined || Math.abs(q.d - m.userData.d) > 30;
    const k = far ? 1 : smooth(10, dt);
    m.userData.x = far ? q.x : m.userData.x + (q.x - m.userData.x) * k;
    m.userData.d = far ? q.d : m.userData.d + (q.d - m.userData.d) * k;
    m.position.set(m.userData.x, groundY(m.userData.x, m.userData.d) + (q.z || 0), -m.userData.d);
    m.rotation.set(0, -q.a + (q.spin || 0), 0);
  }
  // Försök i trick-duell och Big Air-tävling: slut när man passerat landningen
  const at = race.attempt;
  if (at && state === 'playing') {
    at.maxZ = Math.max(at.maxZ, p.air ? p.z : 0);
    if (p.d > race.endD) endAttempt();
  }
  const playing = ['playing', 'countdown', 'crashing', 'finish', 'spectate'].includes(state);
  hud.classList.toggle('hidden', !playing);
  $('emote-bar').classList.toggle('hidden', !(playing || !$('gameover').classList.contains('hidden')));
  if (playing) setText('race-hud', sessionHudText());
}

function sessionHudText() {
  const r = race;
  if (r.mode === 'duel') {
    const d = r.duel;
    const letters = r.members.map((m) => `${m.id === save.playerId ? t('party.you') : m.name}: ${DUEL_WORD.slice(0, d.letters[m.id]) || '–'}`).join(' · ');
    return `🔤 ${letters}${d.msg ? `\n${d.msg}` : ''}`;
  }
  if (r.mode === 'bigair') {
    const row = (name, list) => `${name}: ${[0, 1, 2].map((i) => (list[i] === undefined ? '–' : fmt(list[i]))).join(' / ')}`;
    return `🚀 ${[row(t('party.you'), r.attempts), ...[...r.others.values()].map((o) => row(o.name, o.attempts))].join('\n')}`;
  }
  // Race och parallellslalom: avstånd till de andra
  const p = player;
  const parts = [...r.others.values()].filter((o) => o.pos && !o.left).sort((a, b) => b.pos.d - a.pos.d).slice(0, 3).map((o) => {
    const diff = Math.round(p.d - o.pos.d);
    return `${o.name} ${diff >= 0 ? '+' : ''}${diff} m`;
  });
  return `🆚 ${parts.join(' · ') || '…'}`;
}

// Namnskylt ovanför en annan spelare
function makeNameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(106, 27, 154, 0.85)';
  g.beginPath();
  g.roundRect(4, 8, 248, 48, 24);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name.slice(0, 14), 128, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.4;
  return sprite;
}

// Parallellslalom: stolpar i mitten som skiljer banorna åt
let laneDivider = null;
function buildLaneDivider() {
  removeLaneDivider();
  const n = Math.ceil(runLength() / 8);
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6).translate(0, 0.6, 0), new THREE.MeshLambertMaterial({ color: '#1565c0' }), n);
  for (let i = 0; i < n; i++) {
    const d = i * 8;
    dummy.position.set(0, groundY(0, d), -d);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
  laneDivider = mesh;
}
function removeLaneDivider() {
  if (laneDivider) scene.remove(laneDivider);
  laneDivider = null;
}

// ---------- Trick-duell och Big Air-tävling: försök ----------

// Första landade tricket efter kickern räknas
function partyCombo(c, pts) {
  const at = race && race.attempt;
  if (!at || at.combo || player.d < race.kickD - 2) return;
  at.combo = { sig: (c.sig || []).slice(), pts };
}

function partyCrash() {
  if (race && race.attempt) race.attempt.crashed = true;
}

// Tricket som en jämförbar lista: snurr, volter och grabs – samma på alla språk
function trickSig(combo) {
  return combo ? [...new Set(combo.sig)].filter((s) => /^(spin\d+|back\d+|front\d+|grab-[a-z]+)$/.test(s)).sort() : [];
}

// Tricket i text på mitt språk, t.ex. "360 + Dubbel backflip + Indy grab"
function sigLabel(sig) {
  return sig.map((s) => {
    let m = s.match(/^spin(\d+)$/);
    if (m) return m[1];
    m = s.match(/^(back|front)(\d+)$/);
    if (m) {
      const n = Number(m[2]);
      const base = m[1] === 'back' ? 'Backflip' : 'Frontflip';
      return n === 1 ? base : n === 2 ? t(m[1] === 'back' ? 'trick.doubleBackflip' : 'trick.doubleFrontflip') : `${n}x ${base.toLowerCase()}`;
    }
    const g = GRABS.find((x) => `grab-${x.id}` === s);
    return g ? g.name : s;
  }).join(' + ');
}

function endAttempt() {
  const r = race;
  const at = r.attempt;
  r.attempt = null;
  finishCombo();
  if (r.mode === 'duel') {
    const sig = trickSig(at.combo);
    const landed = !at.crashed && sig.length > 0;
    sendReliable(r, 'trick', { id: save.playerId, sig, landed, turn: r.duel.turn });
    enterSpectate();
    applyDuel(save.playerId, sig, landed, r.duel.turn);
  } else {
    const score = at.crashed ? 0 : Math.round((at.combo ? at.combo.pts : 0) + at.maxZ * 15);
    const n = r.attempts.length;
    r.attempts.push(score);
    sendReliable(r, 'attempt', { id: save.playerId, n, score });
    enterSpectate();
    popup(`🚀 ${t('bigair.attempt', { n: n + 1 })}`, `${fmt(score)}`, '#6a1b9a');
    if (r.attempts.length < BIGAIR_ATTEMPTS) {
      setTimeout(() => {
        if (race !== r) return;
        buildSessionWorld();
        startCountdown(3000);
      }, 1500);
    } else {
      r.myDone = { attempts: r.attempts };
      buildSessionWorld();
      enterSpectate();
      checkSessionEnd();
    }
  }
}

// Trick-duell: samma regler på båda klienterna, så de kommer fram till samma läge
function applyDuel(id, sig, landed, turn) {
  const r = race;
  const d = r && r.duel;
  // Varje drag har ett nummer: dubbletter (omsändningar) och gamla drag ignoreras
  if (!d || id !== d.active || r.over || turn !== d.turn) return;
  d.turn += 1;
  sig = Array.isArray(sig) ? sig.map(String).slice(0, 8) : [];
  const other = (x) => r.members.find((m) => m.id !== x).id;
  const name = (x) => (x === save.playerId ? t('party.you') : r.members.find((m) => m.id === x).name);
  if (d.phase === 'set') {
    if (landed) {
      d.trick = sig;
      d.phase = 'match';
      d.active = other(id);
      d.msg = t('duel.match', { trick: sigLabel(sig) });
    } else {
      d.setter = other(id);
      d.active = d.setter;
      d.msg = t('duel.missedSet', { name: name(id) });
    }
  } else {
    const ok = landed && d.trick.every((s) => sig.includes(s));
    if (!ok) d.letters[id] += 1;
    d.msg = ok ? t('duel.matched', { name: name(id) }) : t('duel.letter', { name: name(id), letter: DUEL_WORD[d.letters[id] - 1] });
    d.phase = 'set';
    d.trick = null;
    d.active = d.setter;
    if (d.letters[id] >= DUEL_WORD.length) {
      r.over = true;
      finishSession([other(id), id]);
      return;
    }
  }
  popup(`🔤 ${d.msg}`, '', '#00695c');
  // Min tur: nytt försök. Annars titta på.
  setTimeout(() => {
    if (race !== r || r.over) return;
    buildSessionWorld();
    if (d.active === save.playerId) startCountdown(3000);
    else enterSpectate();
  }, 1800);
}

function bigairScore(id, n, score) {
  const o = race.others.get(id);
  if (!o) return;
  o.attempts[n] = Math.max(0, Math.round(Number(score) || 0));
  if (o.attempts.length >= BIGAIR_ATTEMPTS) o.done = { attempts: o.attempts };
  checkSessionEnd();
}

// Viktiga meddelanden skickas tre gånger (de är gjorda så att dubbletter inte gör något)
function sendReliable(r, event, payload) {
  for (const ms of [0, 500, 1500]) {
    setTimeout(() => {
      if (r.ch) r.ch.send({ type: 'broadcast', event, payload });
    }, ms);
  }
}

// ---------- Slut på sessionen ----------

// Mitt åk är slut (race och parallellslalom): berätta det för de andra
function raceDone(dist, score, finished) {
  if (!race || race.myDone || (race.mode !== 'race' && race.mode !== 'pslalom')) return;
  worldRng = null;
  const time = race.startedAt ? (performance.now() - race.startedAt) / 1000 : 0;
  race.myDone = { dist, score, finished, time };
  sendReliable(race, 'done', { id: save.playerId, ...race.myDone });
  partyTrack(true);
  checkSessionEnd();
}

function memberLeft(id) {
  const o = race && race.others.get(id);
  if (!o || o.left) return;
  o.left = true;
  o.mesh.visible = false;
  popup(`👋 ${t('party.leftGame', { name: o.name })}`, '', '#5d4037');
  // Alla andra borta innan något har hänt: ingen vinnare, inga pengar
  if (!race.startedAt && [...race.others.values()].every((x) => x.left)) {
    abortRace();
    return;
  }
  // Trick-duell: den som går förlorar, men det ger inga prispengar
  if (race.mode === 'duel' && !race.over) {
    race.over = true;
    finishSession([save.playerId, id], null, true);
    return;
  }
  checkSessionEnd();
}

// Alla klara (eller borta)? Räkna ut placeringarna
function checkSessionEnd() {
  const r = race;
  if (!r || r.over || !r.myDone) return;
  if (![...r.others.values()].every((o) => o.done || o.left)) {
    if (r.mode === 'race' || r.mode === 'pslalom') renderRaceResult();
    return;
  }
  r.over = true;
  const entries = [{ id: save.playerId, ...r.myDone }];
  for (const [id, o] of r.others) if (!o.left) entries.push({ id, ...o.done });
  let order;
  if (r.mode === 'bigair') {
    const best2 = (list) => list.slice().sort((a, b) => b - a).slice(0, 2).reduce((s, v) => s + v, 0);
    for (const e of entries) e.total = best2(e.attempts || []);
    order = entries.sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1));
  } else {
    // I mål före inte i mål, snabbast tid, annars längst sträcka. Exakt lika: spelar-id avgör.
    order = entries.sort((a, b) => (b.finished - a.finished)
      || (a.finished ? a.time - b.time : b.dist - a.dist)
      || (a.id < b.id ? -1 : 1));
  }
  const left = [...r.others.keys()].filter((id) => r.others.get(id).left);
  finishSession([...order.map((e) => e.id), ...left], order);
}

const PRIZES = { duel: [1500, 300], bigair: [2000, 800, 300], pslalom: null, race: null };

// Placeringar klara: pengar, text och revansch
function finishSession(ids, entries = null, forfeit = false) {
  const r = race;
  const myPlace = ids.indexOf(save.playerId);
  const name = (id) => (id === save.playerId ? t('party.you') : (r.others.get(id) || {}).name || '?');
  const scoreOf = (id) => {
    const e = entries && entries.find((x) => x.id === id);
    if (!e) return '';
    if (r.mode === 'bigair') return ` (${fmt(e.total)})`;
    return e.finished ? ` (${e.time.toFixed(1)} s)` : ` (${fmt(e.dist)} m)`;
  };
  const lines = ids.map((id, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${name(id)}${r.others.get(id) && r.others.get(id).left ? ` – ${t('party.gone')}` : scoreOf(id)}`);
  // Pris: race/parallellslalom: vinnaren får dubbla pengar för åket. Minilägen: fasta priser per placering.
  // Inga pris om motståndaren gav upp, och i Big Air-tävlingen bara om man fått poäng
  let prize = 0;
  const myTotal = entries && (entries.find((e) => e.id === save.playerId) || {}).total;
  if (forfeit || (r.mode === 'bigair' && !myTotal)) prize = 0;
  else if (PRIZES[r.mode]) prize = PRIZES[r.mode][Math.min(myPlace, PRIZES[r.mode].length - 1)];
  else if (myPlace === 0 && r.myDone && r.myDone.score > 0) prize = r.myDone.score;
  if (prize > 0) {
    save.bank += prize;
    persist();
  }
  const head = myPlace === 0 ? t('race.wonAll') : t('race.place', { n: myPlace + 1 });
  const text = `${head}${prize ? ` · +🪙 ${fmt(prize)}` : ''}\n${lines.join('\n')}`;
  if (myPlace === 0) Sound.combo(5);
  if (lastSession && lastSession.ch && lastSession.ch !== r.ch) party.client.removeChannel(lastSession.ch);
  lastSession = { mode: r.mode, course: r.course, difficulty: r.difficulty, others: [...r.others.entries()].filter(([, o]) => !o.left).map(([id, o]) => ({ id, name: o.name })), ch: r.ch };
  const mini = r.mode === 'duel' || r.mode === 'bigair';
  endRace();
  if (mini) {
    // Minilägen har ingen vanlig resultatskärm
    $('countdown').classList.add('hidden');
    setText('sessres-title', `${PARTY_MODES[lastSession.mode].icon} ${t(`mode.${lastSession.mode}`)}`);
    $('sessres-text').textContent = text;
    state = 'menu';
    resetWorld();
    showOverlay('sessres');
  } else {
    raceResultText = { text, w: myPlace === 0 ? 'me' : 'opp' };
    if (!$('gameover').classList.contains('hidden')) renderRaceResult();
    else popup(head, prize ? `+🪙 ${fmt(prize)}` : '', myPlace === 0 ? '#2e7d32' : '#c62828');
  }
  $('btn-rematch').classList.toggle('hidden', !lastSession.others.length);
  $('btn-sessres-rematch').classList.toggle('hidden', !lastSession.others.length);
  // Kanalen hålls öppen en stund för emojis
  const ch = lastSession.ch;
  setTimeout(() => {
    if (lastSession && lastSession.ch === ch) {
      party.client.removeChannel(ch);
      lastSession = null;
      $('btn-rematch').classList.add('hidden');
      $('btn-sessres-rematch').classList.add('hidden');
    }
  }, 120000);
}

let raceResultText = null; // senaste resultatet, visas på resultatskärmen
function renderRaceResult() {
  const el = $('go-race');
  if (dailyResultText) {
    el.textContent = `🗓️ ${dailyResultText}`;
    el.className = 'rank race-res race-me';
    dailyResultText = null;
    return;
  }
  $('btn-rematch').classList.toggle('hidden', !(lastSession && lastSession.others.length && !race));
  if (race && race.myDone && !race.over && (race.mode === 'race' || race.mode === 'pslalom')) {
    const waiting = [...race.others.values()].filter((o) => !o.done && !o.left).map((o) => o.name);
    el.className = 'rank race-res';
    el.textContent = t('race.waiting', { name: waiting.join(', ') });
    el.classList.remove('hidden');
    return;
  }
  el.classList.toggle('hidden', !raceResultText);
  if (raceResultText) {
    el.textContent = raceResultText.text;
    el.className = `rank race-res race-${raceResultText.w}`;
    raceResultText = null; // visas en gång
  }
}

function endRace() {
  if (!race) return;
  // Tillbaka till min egen bana och svårighetsgrad
  save.course = race.prev.course;
  save.difficulty = race.prev.difficulty;
  course = COURSES[save.course] || COURSES.classic;
  difficulty = DIFFICULTIES[save.difficulty] || DIFFICULTIES.normal;
  persist();
  for (const [, o] of race.others) scene.remove(o.mesh);
  const ch = race.ch;
  const keep = lastSession && lastSession.ch === ch;
  race = null;
  if (!keep) setTimeout(() => { if (party.client) party.client.removeChannel(ch); }, 1500);
  removeLaneDivider();
  worldRng = null;
  partyTrack(true);
}

// Sessionen blev inte av (alla andra försvann före start)
function abortRace() {
  endRace();
  $('countdown').classList.add('hidden');
  resetWorld();
  showMenu();
  popup(`👥 ${t('party.cancelledAll')}`, '', '#5d4037');
}

// Lämna en pågående session (Avsluta i pausmenyn eller Tillbaka)
function leaveSession() {
  if (!race) return;
  race.ch.send({ type: 'broadcast', event: 'leave', payload: { id: save.playerId } });
  endRace();
  $('countdown').classList.add('hidden');
}

// ---------- Emojis och revansch ----------
function sendEmote(i) {
  const e = EMOTES[i];
  const ch = race ? race.ch : lastSession && lastSession.ch;
  if (!e || !ch) return;
  const now = performance.now();
  if (now - (sendEmote.last || 0) < 800) return; // inte spamma
  sendEmote.last = now;
  ch.send({ type: 'broadcast', event: 'emote', payload: { id: save.playerId, e } });
  showEmote(save.playerId, e);
}

function showEmote(id, e) {
  if (!EMOTES.includes(e)) return;
  const o = race && race.others.get(id);
  const who = id === save.playerId ? t('party.you') : o ? o.name : (lastSession && (lastSession.others.find((x) => x.id === id) || {}).name) || '';
  popup(`${e}`, who, '#3949ab');
  Sound.click();
}

function rematch() {
  const ls = lastSession;
  if (!ls || !party.ready || race || party.hosting || party.joined) return Sound.denied();
  party.mode = ls.mode;
  const online = new Map(party.players.map((p) => [p.id, p]));
  const targets = ls.others.filter((o) => online.has(o.id) && online.get(o.id).status === 'menu');
  showParty();
  if (!targets.length) {
    popup(`👥 ${t('party.rematchNone')}`, '', '#5d4037');
    return;
  }
  for (const o of targets) sendInvite(online.get(o.id));
}

// Knappar för emojis och spellägen
for (const [i, e] of EMOTES.entries()) {
  const b = document.createElement('button');
  b.className = 'emote-btn';
  b.textContent = e;
  b.addEventListener('click', () => sendEmote(i));
  $('emote-bar').append(b);
}
for (const mode of Object.keys(PARTY_MODES)) {
  $('party-modes').append(segButton(`${PARTY_MODES[mode].icon}`, { mode }, () => setPartyMode(mode)));
}
for (const b of $('party-modes').children) b.textContent = `${PARTY_MODES[b.dataset.mode].icon} ${t(`mode.${b.dataset.mode}`)}`;

partyConnect(); // syns direkt som online för andra
