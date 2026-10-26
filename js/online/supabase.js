'use strict';
// Kopplingen till servern: inloggning, global topplista, namn och dagens spöken.

let lastRank = -1;
let lastRankCourse = null;

// Global topplista (Supabase REST). Utan config.js-nycklar finns bara den lokala listan.
const Online = (() => {
  const cfg = window.SKI_ONLINE || {};
  const on = !!(cfg.url && cfg.key && window.supabase);
  const api = on ? `${cfg.url.replace(/\/$/, '')}/rest/v1` : '';
  // En gemensam klient. Varje spelare loggas in anonymt (osynligt) så att servern vet vem som skriver –
  // man kan bara spara resultat och namn åt sig själv.
  const client = on ? window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'skiworld-auth' } }) : null;
  let signingIn = null;
  function auth() {
    if (!on) return Promise.resolve(null);
    signingIn = signingIn || (async () => {
      const { data } = await client.auth.getSession();
      let session = data.session;
      if (!session) {
        const res = await client.auth.signInAnonymously();
        if (res.error) throw res.error;
        session = res.data.session;
      }
      if (save.playerId !== session.user.id) {
        save.playerId = session.user.id;
        persist();
      }
      return session;
    })().catch(() => {
      signingIn = null; // försök igen nästa gång (t.ex. offline)
      return null;
    });
    return signingIn;
  }
  async function headers(extra = {}) {
    await auth();
    const { data } = on ? await client.auth.getSession() : { data: {} };
    const token = data.session ? data.session.access_token : cfg.key;
    return { apikey: cfg.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
  }
  const get = async (path, extra = {}) => {
    const res = await fetch(`${api}/${path}`, { headers: await headers(extra) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  };
  // Skickar ett åk. Misslyckas det (t.ex. offline) sparas det och skickas nästa gång.
  async function submit(entry) {
    if (!on) return false;
    save.pendingScores.push(entry);
    persist();
    return flush();
  }
  let flushing = null;
  function flush() {
    if (!on || !save.pendingScores.length) return Promise.resolve(true);
    flushing = flushing || (async () => {
      try {
        // Ett åk i taget: ett ogiltigt åk (400/409/422) slängs, annars (offline, 401, 429, 5xx) försöker vi igen senare
        if (!(await auth())) return false;
        let ok = true; // false = något åk kom inte fram eller nekades
        while (save.pendingScores.length) {
          // Åket sparas alltid på den inloggade spelaren
          const body = { ...save.pendingScores[0], player_id: save.playerId };
          const res = await fetch(`${api}/scores`, { method: 'POST', headers: await headers({ Prefer: 'return=minimal' }), body: JSON.stringify(body) });
          if (!res.ok && ![400, 409, 422].includes(res.status)) {
            ok = false;
            break;
          }
          if (!res.ok) ok = false; // ogiltigt eller spärrat (t.ex. för tätt) – slängs
          save.pendingScores.shift();
          persist();
        }
        return ok;
      } catch { return false; } finally { flushing = null; }
    })();
    return flushing;
  }
  const cols = 'player_id,name,score,dist,course,difficulty,rider,created_at';
  const top = async (course, limit = 50) => (await get(`best_scores?select=${cols}&course=eq.${course}&order=score.desc,created_at.asc&limit=${limit}`)).json();
  const mine = async (course) => (await get(`best_scores?select=${cols}&course=eq.${course}&player_id=eq.${encodeURIComponent(save.playerId)}`)).json();
  // Plats = antal spelare med högre bästa poäng + 1
  async function rank(course, score) {
    // Andra spelare med bättre bästa åk (mitt eget bästa räknas inte)
    const res = await get(`best_scores?select=player_id&course=eq.${course}&score=gt.${score}&player_id=neq.${encodeURIComponent(save.playerId)}&limit=1`, { Prefer: 'count=exact' });
    const n = Number((res.headers.get('content-range') || '').split('/')[1]);
    return Number.isFinite(n) ? n + 1 : null;
  }
  // Reservera ett namn: true = mitt nu, false = upptaget, null = gick inte att nå servern
  async function claimName(name) {
    try {
      if (!(await auth())) return null;
      const res = await fetch(`${api}/rpc/claim_name`, { method: 'POST', headers: await headers(), body: JSON.stringify({ p_name: name }) });
      if (!res.ok) return null;
      return (await res.json()) === true;
    } catch { return null; }
  }
  // Dagens utmaning: dagens topplista, vilka som har spöken och själva spöket
  const dailyTop = async (day) => (await get(`daily_best?select=player_id,name,score&day=eq.${day}&order=score.desc,created_at.asc&limit=10`)).json();
  const dailyReplayIds = async (day) => (await get(`daily_replays?select=player_id&day=eq.${day}`)).json();
  const dailyReplay = async (pid, day) => ((await (await get(`daily_replays?select=name,score,data&player_id=eq.${encodeURIComponent(pid)}&day=eq.${day}`)).json())[0] || null);
  async function saveReplay(day, score, name, data) {
    if (!(await auth())) return false;
    const res = await fetch(`${api}/rpc/save_replay`, { method: 'POST', headers: await headers(), body: JSON.stringify({ p_day: day, p_score: score, p_name: name, p_data: data }) });
    return res.ok;
  }
  return { on, client, auth, submit, flush, top, mine, rank, claimName, dailyTop, dailyReplayIds, dailyReplay, saveReplay };
})();
Online.flush();
