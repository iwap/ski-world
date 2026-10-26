// Låtsas-Supabase för testerna: inget skickas till den riktiga servern.
// mockJoin(spelare) lägger till någon i lobbyn, mockEmit(kanal, typ, händelse, data) låtsas att ett meddelande kom.
window.SKI_ONLINE = { url: 'https://mock.invalid', key: 'test-key' };
window.__sent = [];
window.__chans = {};
window.fetch = async () => new Response('[]', { headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } });
window.supabase = {
  createClient: () => ({
    channel(name) {
      const ch = {
        name, handlers: [], presence: {},
        on(type, filter, cb) { this.handlers.push({ type, event: filter.event, cb }); return this; },
        subscribe(cb) { setTimeout(() => cb && cb('SUBSCRIBED'), 5); return this; },
        track(me) { this.presence[me.id] = [me]; },
        presenceState() { return this.presence; },
        send(msg) { window.__sent.push({ ch: name, ...msg }); },
      };
      window.__chans[name] = ch;
      return ch;
    },
    removeChannel() {},
    realtime: { setAuth() {} },
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'me-0000-test' } } } }),
      signInAnonymously: async () => ({ data: { session: { access_token: 't', user: { id: 'me-0000-test' } } } }),
    },
  }),
};
window.mockEmit = (name, type, event, payload) => {
  const ch = window.__chans[name];
  if (!ch) throw new Error(`ingen kanal ${name}`);
  for (const h of ch.handlers) if (h.type === type && h.event === event) h.cb({ payload });
};
window.mockJoin = (p) => {
  window.__chans['ski-lobby'].presence[p.id] = [p];
  window.mockEmit('ski-lobby', 'presence', 'sync');
};
window.sentEvents = (event) => window.__sent.filter((m) => m.event === event);
