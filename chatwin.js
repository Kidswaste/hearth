// (round 86, chatwindow86) Long chats keep their older messages on disk until you scroll up to them. A GIANT chat (≥ 8 MB
// on disk: thousands of messages with tool output) was held whole in the window (≈ 60 MB of objects, ≈ 150–250 MB of
// heap) and a garbage collection over it could make one task ≈ 50 ms. Opened "windowed" (Settings › Chats › "Keep only
// the newest part of very long chats in memory", on by default), the window holds its own fields, its last ≈ 300
// messages (plus its pinned ones and the blocks you scrolled up to) and one small record per message; the rest is read
// by range from the store thread when a block wakes (chat-rest.js), and let go again when it goes back to rest far away.
// The rules (chatwin-core.js has the array and its stubs):
//   · "not loaded" is never "not there": chat.messages keeps the chat's true length; an unloaded message reads as a stub
//     that gives its small fields and throws NotLoaded on its text, thinking, tools…; whatever walks the whole chat for
//     its content stops with an error (and the chat loads whole in the background, so trying again works), never sees
//     a part as the whole. A stub can't be saved, copied or sent (Proxy objects can't be cloned).
//   · saving by change (native.js saveChat → save here): only loaded messages can change; an unloaded one is unchanged
//     by definition. A chat cut shorter on purpose says so (trunc). When the store thread can't take a change (sync's
//     guard wants the chat, another save wrote it whole), the chat is loaded whole first, then saved whole, as before.
//   · load-all (whole): Native.load (every other module's way to a chat), export, branch, stats, a second opinion, the
//     summary when continuing lighter, the earlier conversation sent along when the engine session is gone: the chat is
//     read whole (in ≈ 400-message ranges, parsed on a worker) before they run, then let go again after a quiet minute.
//   · find (Alt+F) asks the store thread which resting messages hold the words (chatFind), then wakes those blocks;
//     jump to #k wakes the block of k; "Show all" pages 300 more instead of drawing thousands.
//   · a refused write to the array (something moved messages it couldn't see) "poisons" the chat: its saves stop and
//     it is read again from disk (nothing half-moved is ever written).
const ChatWin = (() => {
  const C = ChatWinCore;
  const R = Native._rest; const SV = R.sv;
  const S = new WeakMap(); // chat → its window: { id, a (chatwin-core makeArray), meta, cpl, … }
  const TAIL = 300; // the last messages always held
  const PART = 400; // messages per range when the whole chat is read
  const stat = { opened: 0, fetched: 0, ranges: 0, released: 0, wholes: [], misses: [], poisoned: 0, rewindowed: 0, refused: [] };
  const live = (chat) => { const st = chat && S.get(chat); return st && chat.messages === st.px ? st : null; };
  const is = (chat) => Boolean(live(chat));
  const text = (b) => new TextDecoder().decode(b);

  // ---------- bytes parsed off this thread (chatparse-worker.js: its own fields first, then ≈ 1 MB batches, each its own task) ----------
  let wk = null; let seq = 0; const jobs = new Map();
  function parse(bytes) {
    if (bytes.length < 1.5e6) { try { return Promise.resolve({ head: JSON.parse(text(bytes)), msgs: null }); } catch (err) { return Promise.reject(err); } }
    if (!wk) {
      wk = new Worker('chatparse-worker.js');
      wk.onmessage = (e) => {
        const d = e.data; const j = jobs.get(d.id); if (!j) return;
        if (d.err) { jobs.delete(d.id); j.no(new Error(d.err)); return; }
        if (d.head) j.head = d.head; else if (d.msgs) j.got.push(d); else if ('chat' in d) j.head = d.chat;
        if (d.done) { jobs.delete(d.id); const msgs = []; for (const g of j.got.sort((a, b) => a.from - b.from)) for (const m of g.msgs) msgs.push(m); setTimeout(() => j.ok({ head: j.head, msgs: j.got.length ? msgs : null }), 0); }
      };
      wk.onerror = () => { for (const j of jobs.values()) j.no(new Error('parser stopped')); jobs.clear(); wk = null; };
    }
    const id = ++seq;
    return new Promise((ok, no) => { jobs.set(id, { ok, no, got: [] }); const b = bytes.byteOffset || bytes.byteLength !== bytes.buffer.byteLength ? bytes.slice() : bytes; wk.postMessage({ id, parts: [b], chunk: 1e6, tail: 0 }, [b.buffer]); });
  }
  const msgsOf = (p) => p.msgs || p.head?.messages || [];

  // ---------- open ----------
  // w: the store's answer { ver, n, from, head, bytes } (storework.js chatWinOpen)
  async function open(id, w) {
    const head = JSON.parse(w.head);
    const p = await parse(w.bytes);
    const { h, u, r } = p.head || {}; const tail = msgsOf(p); const pk = p.head?.pk || []; const pins = p.head?.pins || [];
    if (!Array.isArray(h) || h.length !== w.n || u?.length !== w.n || r?.length !== w.n || tail.length !== w.n - w.from || pins.length !== pk.length) throw new Error('a windowed chat that doesn\'t add up');
    // per message: its height (h), its usage (u) and its record text (r: read when a stub is asked for a field)
    const st = { id, n: w.n, h, u, r, cpl: p.head.cpl, find: null, inflight: new Map(), whole: null, poison: null, full: 0 };
    const loaded = tail.map((m, i) => [w.from + i, m]); pk.forEach((k, i) => loaded.push([k, pins[i]]));
    st.a = C.makeArray({ n: w.n, loaded, meta: (k) => st.r[k], miss: (k, key) => miss(chat, st, k, key), refuse: (k, why, hard) => refuse(chat, st, k, why, hard) });
    st.px = st.a.px;
    const chat = {}; for (const k of Object.keys(head)) chat[k] = k === 'messages' ? st.px : head[k];
    if (!('messages' in head)) chat.messages = st.px;
    S.set(chat, st);
    // its shape for saving by change (native.js): its own fields and its LOADED messages
    const sh = { ver: w.ver, keys: Object.keys(chat), head: new Map(), msgs: [] };
    for (const k of sh.keys) if (k !== 'messages') sh.head.set(k, SV.shapeOf(chat[k]));
    sh.msgs.length = w.n; for (const k of st.a.keys()) sh.msgs[k] = SV.shapeOf(st.a.t[k]);
    SV.shapes.set(chat, sh);
    stat.opened += 1;
    return chat;
  }

  // ---------- what isn't loaded ----------
  function miss(chat, st, k, key) {
    if (stat.misses.length < 200) stat.misses.push({ chat: st.id, k, key: String(key), at: Date.now(), where: String(new Error().stack || '').split('\n').slice(3, 7).map((l) => l.trim()).join(' | ') });
    if (!window.CW86_NOHEAL) setTimeout(() => whole(chat, 'miss').catch(() => {}), 0); // (so trying again works; CW86_NOHEAL: the app check lists every miss)
    throw new C.NotLoaded(k, key);
  }
  function refuse(chat, st, k, why, hard) {
    if (!hard) return miss(chat, st, k, why);
    if (!st.poison) {
      st.poison = why; stat.poisoned += 1;
      console.warn('chatwin: stopped', why);
      toast('Hearth stopped a change to this long chat that it couldn\'t see whole. Nothing was saved; it opens again from disk.', { type: 'error', timeout: 8000 });
      reloadSoon(chat);
    }
    throw new Error(`Hearth stopped a change to this long chat: ${why}. Nothing was saved.`);
  }
  // a chat read again from disk once nothing is answering in it (a poisoned one, or one whose file changed under it)
  function reloadSoon(chat, n = 0) {
    setTimeout(() => {
      if (R.chats.get(chat.id) !== chat) return;
      if (!Native.forget(chat.id)) { if (n < 120) reloadSoon(chat, n + 1); return; }
      for (const [agentId] of R.views) if (H.activeChat[agentId] === chat.id) Native.refresh(agentId, { keepScroll: true });
    }, n ? 1000 : 50);
  }
  const bad = (chat) => Boolean(S.get(chat)?.poison);
  // a windowed chat whose list something replaced with a new array (chat.messages = …): that array is the chat now,
  // unless it carries stubs (made from the window's unloaded messages): then it can't be saved (that would be a part
  // as the whole): it is read again from disk. → true when the save must not go
  function replaced(chat) {
    const st = S.get(chat);
    if (!st || st.full || chat.messages === st.px) return Boolean(st?.poison);
    if (Array.isArray(chat.messages) && chat.messages.some((m) => C.isStub(m))) { try { refuse(chat, st, 0, 'a list made of messages that aren\'t loaded', true); } catch { /* stopped */ } return true; }
    S.delete(chat); // (a whole new list: the chat as any other from now on)
    return false;
  }

  // messages [a, b) read from the store thread and put in place (each with its shape: unchanged). other: a file that
  // isn't the version this window holds may fill them (the whole-save fallback: sync merges that save as before)
  async function fetchInto(chat, st, a, b, other = false) {
    const key = `${a}:${b}`;
    if (st.inflight.has(key)) return st.inflight.get(key);
    const job = (async () => {
      const s = SV.shapes.get(chat);
      const r = await window.hub.chatWin('range', { id: chat.id, ver: s?.ver, from: a, to: b });
      if (!r?.bytes) throw new Error(r?.error === 'gone' ? 'This chat isn\'t on disk any more.' : 'This long chat\'s older messages can\'t be read just now. Nothing was changed; try again in a moment.');
      if (!r.same && !other) { reloadSoon(chat); throw new Error('This long chat changed on disk: it opens again.'); }
      if (r.n < b || r.from !== a || r.to !== b) throw new Error('This long chat is shorter on disk than here: nothing was changed.');
      const msgs = msgsOf(await parse(r.bytes));
      if (msgs.length !== b - a) throw new Error('A part of this long chat didn\'t read whole: nothing was changed.');
      stat.ranges += 1;
      if (chat.messages !== st.px) return;
      const sh = SV.shapes.get(chat);
      for (let i = 0; i < msgs.length; i++) { const k = a + i; if (st.a.loaded(k) || k >= st.a.t.length) continue; st.a.put(k, msgs[i]); if (sh && k < sh.msgs.length) sh.msgs[k] = SV.shapeOf(msgs[i]); stat.fetched += 1; }
    })().finally(() => st.inflight.delete(key));
    st.inflight.set(key, job);
    return job;
  }
  // the unloaded runs of [lo, hi), read in pieces of ≤ max messages
  async function fill(chat, st, lo, hi, max, other) {
    for (let k = Math.max(0, lo); k < Math.min(hi, st.a.t.length);) {
      if (st.a.loaded(k)) { k += 1; continue; }
      let e = k; while (e < Math.min(hi, st.a.t.length) && !st.a.loaded(e) && e - k < max) e += 1;
      await fetchInto(chat, st, k, e, other);
      if (chat.messages !== st.px) return;
      k = e;
    }
  }
  // messages [lo, hi) loaded (a block woken, an old message acted on)
  async function ensure(chat, lo, hi) {
    const st = live(chat);
    if (!st) return true;
    if (st.poison) throw new Error('This long chat opens again from disk first.');
    await fill(chat, st, lo, hi, PART, false);
    return true;
  }
  // the chat cut to its first n messages (edit-from-here, retry): its new end loaded first (what it shows, what the
  // next message sends along), then cut in place; saved by change with trunc (chatDelta's "truncate to n")
  async function cut(chat, n) {
    const st = live(chat);
    if (!st) { chat.messages = chat.messages.slice(0, n); return; }
    await ensure(chat, Math.max(0, n - TAIL), n);
    if (chat.messages === st.px) chat.messages.length = n; else chat.messages = chat.messages.slice(0, n);
  }
  const has = (chat, k, hi = k + 1) => { const st = live(chat); if (!st) return true; for (let i = k; i < Math.min(hi, st.a.t.length); i++) if (!st.a.loaded(i)) return false; return true; };
  const keys = (chat) => live(chat)?.a.keys() || [];

  // ---------- the whole chat (load-all) ----------
  function whole(chat, why = '') {
    const st = live(chat);
    if (!st) return Promise.resolve(chat);
    if (st.poison) return Promise.reject(new Error('This long chat opens again from disk first.'));
    if (st.whole) return st.whole;
    const t0 = performance.now(); let note = null; const where = String(new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim()).join(' | ');
    const nt = setTimeout(() => { note = toast('Loading the whole chat…', { timeout: 30000 }); }, 400);
    st.whole = (async () => {
      await fill(chat, st, 0, st.a.t.length, PART, true);
      if (chat.messages !== st.px) return chat;
      const a = st.a; const all = new Array(a.t.length);
      for (let k = 0; k < all.length; k++) { if (a.gone.has(k)) continue; if (!(k in a.t)) throw new Error('This long chat didn\'t load whole: nothing was changed.'); all[k] = a.t[k]; }
      chat.messages = all; // (the same message objects, now one plain array: the chat as any other)
      st.full = Date.now();
      stat.wholes.push({ chat: st.id, why, ms: Math.round(performance.now() - t0), where });
      if (stat.wholes.length > 40) stat.wholes.shift();
      later(chat);
      return chat;
    })().finally(() => { clearTimeout(nt); note?.remove?.(); st.whole = null; });
    return st.whole;
  }
  // after a quiet minute, a giant chat loaded whole goes back to its window (what isn't saved, drawn or pinned stays)
  // (the timer holds the chat weakly: a chat let go meanwhile isn't kept for it)
  function later(chat, ms = 60000) { const st = S.get(chat); if (!st) return; const ref = new WeakRef(chat); clearTimeout(st.backT); st.backT = setTimeout(() => { const c = ref.deref(); if (c && !rewindow(c)) later(c, 60000); }, ms); }
  function rewindow(chat, now = false) { // (now: the app check, without the quiet minute)
    const st = S.get(chat);
    if (!st || !st.full || is(chat) || !on() || R.chats.get(chat.id) !== chat) return true; // (nothing to do: stop)
    const ms = chat.messages; const s = SV.shapes.get(chat);
    if (!Array.isArray(ms) || !s || s.msgs.length !== ms.length || Native.isBusy(chat.id) || (!now && Date.now() - st.full < 30000)) return false;
    const n = ms.length;
    let keepFrom = Math.max(0, n - TAIL);
    const awake = new Set();
    for (const [agentId, v] of R.views) if (H.activeChat[agentId] === chat.id) { for (const b of v.list?.awake || []) awake.add(b); keepFrom = Math.min(keepFrom, R.shownFrom(chat, R.unreadFrom.get(chat.id))); }
    if (n && !(n - 1 in ms)) return false; // (a hole at the end: it stays whole)
    const loaded = []; const h = st.h.slice(0, n); const u = st.u.slice(0, n); const r = st.r.slice(0, n);
    for (let k = 0; k < n; k++) {
      const m = ms[k];
      const keep = k >= keepFrom || awake.has(Math.floor(k / R.BLOCK)) || (m && typeof m === 'object' && m.pinnedMsg) || !(k in ms) || !C.sameSaved(s.msgs[k], m);
      if (keep) loaded.push([k, m]); else { const x = C.metaOf(m, st.cpl); h[k] = x[0]; u[k] = x[3]; r[k] = C.recOf(x); }
    }
    const a = C.makeArray({ n, loaded, meta: (k) => st.r[k], miss: (k, key) => miss(chat, st, k, key), refuse: (k, why, hard) => refuse(chat, st, k, why, hard) });
    for (let k = 0; k < n; k++) if (!(k in ms)) { delete a.t[k]; a.gone.add(k); }
    Object.assign(st, { h, u, r }); st.a = a; st.px = a.px; st.full = 0; st.find = null;
    chat.messages = a.px;
    for (let k = 0; k < n; k++) if (!a.loaded(k)) delete s.msgs[k];
    stat.rewindowed += 1; stat.lastRewindow = { kept: loaded.length, of: n };
    return true;
  }
  // a block far away back to rest: its messages let go (not the last ones, a pinned one, or one changed and not saved yet)
  function release(chat, lo, hi) {
    const st = live(chat); const s = SV.shapes.get(chat);
    if (!st || !s) return 0;
    let n = 0; const end = Math.min(hi, st.a.t.length - TAIL);
    for (let k = Math.max(0, lo); k < end; k++) {
      if (!(k in st.a.t)) continue;
      const m = st.a.t[k];
      if ((m && typeof m === 'object' && m.pinnedMsg) || k >= s.msgs.length || !C.sameSaved(s.msgs[k], m)) continue;
      const x = C.metaOf(m, st.cpl); st.h[k] = x[0]; st.u[k] = x[3]; st.r[k] = C.recOf(x); st.a.drop(k); delete s.msgs[k]; n += 1;
    }
    stat.released += n;
    return n;
  }
  // the resting blocks' height (native.js restBit): a loaded message measured as guessH does, the others by their record
  function guess(chat, lo, hi, w) {
    const st = live(chat); const cpl = Math.max(30, (w - 90) / 7.4); let all = 0;
    for (let k = lo; k < hi; k++) all += st && !st.a.loaded(k) ? (st.h[k] || 0) : C.msgPx(chat.messages[k], cpl);
    return all;
  }
  // the header's token total (native.js render) and the pinned messages (planOf): from the records, no stub made
  function usage(chat) { const st = live(chat); if (!st) return 0; let n = 0; for (let k = 0; k < st.a.t.length; k++) n += st.a.loaded(k) ? C.useOf(st.a.t[k]) : (st.u[k] || 0); return n; }
  const pins = (chat) => { const st = live(chat); return st ? st.a.keys().filter((k) => st.a.t[k]?.pinnedMsg) : []; }; // (a pinned message is always loaded: opened with it, never let go)

  // ---------- saving by change ----------
  function save(chat) {
    const st = live(chat);
    if (st?.poison) return Promise.reject(new Error('This long chat opens again from disk: this change wasn\'t saved.'));
    const s = SV.shapes.get(chat);
    const fall = () => whole(chat, 'save').then(() => SV.saveWhole(chat));
    if (!st || !s) return fall();
    const d = C.delta(chat, s, st.a.keys(), (k) => st.a.t[k], SV);
    if (!d) return Promise.resolve();
    const from = s.ver; const to = s.ver = SV.newVer();
    return window.hub.saveChatDelta({ id: chat.id, from, to, ...d }).then((r) => { if (!r?.ok) stat.refused.push(String(r?.why || 'none')); return r?.ok || SV.shapes.get(chat)?.ver !== to ? r : fall(); }, () => (SV.shapes.get(chat)?.ver === to ? fall() : null));
  }

  // ---------- find in the chat (chat-rest.js restingHits) ----------
  // the resting messages that hold `needle`: the store thread's answer for the whole file (cached per words), kept to
  // those `keep` says (resting, not drawn); [] while it's on its way, then again() is called
  function hits(chat, needle, keep, again) {
    const st = live(chat);
    if (!st || !needle) return [];
    if (st.find?.q === needle) return st.find.res ? st.find.res.filter(keep) : [];
    const f = st.find = { q: needle, res: null };
    window.hub.chatWin('find', { id: chat.id, q: needle }).then((r) => {
      if (st.find !== f) return;
      if (!Array.isArray(r?.hits)) { st.find = null; toast('Find couldn\'t read this long chat\'s older messages just now (only what\'s drawn was searched).', { timeout: 4000 }); return; }
      f.res = r.hits; again?.();
    }, () => { if (st.find === f) st.find = null; });
    return [];
  }

  // ---------- whole-chat numbers (autocompact.js, sendpreview.js, historylean.js), worked out on the store thread ----------
  // kind: 'lighter' (continue lighter?), 'preview' (the history a message re-reads), 'lean' (the lighter history before
  // message `upto`). Kept by a key of what they depend on (the same idea as those modules' own memos); calcSync gives the
  // kept answer or null (asked for now: again() when it's in). Never an answer made from a part of the chat: none
  // until the store thread has read the file (nothing is offered or decided meanwhile)
  const calcKey = (chat, kind, upto, tools) => { const ms = chat.messages; const u = upto ?? ms.length; return `${kind}|${u}|${ms[u - 1]?.at || 0}|${chat.compact?.index ?? ''}|${chat.compact?.tail ?? ''}|${chat.handoff?.at ?? ''}|${chat.lean?.at ?? ''}|${chat.session?.id || ''}|${chat.leanOff ? 1 : 0}|${chat.lighterOffered || 0}|${tools ? 1 : 0}`; };
  const agentOf = (chat) => { const a = H.agent(chat.agentId); return a && chat.engine && chat.engine !== a.engine ? { ...a, engine: chat.engine } : a; };
  function calc(chat, kind, { upto, tools = false } = {}) {
    const st = live(chat);
    if (!st) return Promise.resolve(null);
    const key = calcKey(chat, kind, upto, tools);
    const c = (st.calc ||= new Map()); const had = c.get(kind);
    if (had?.key === key) return had.p;
    const a = agentOf(chat) || {};
    const p = window.hub.chatWin('calc', { id: chat.id, what: [kind], agent: { id: a.id, mode: a.mode, engine: a.engine, lighterAt: a.lighterAt, model: a.model }, tools, upto }).then((r) => {
      const v = r && !r.error ? r[kind] ?? null : null;
      const e = c.get(kind); if (e?.key === key) { e.v = v; e.done = true; if (v == null) c.delete(kind); }
      return v;
    }, () => { if (c.get(kind)?.key === key) c.delete(kind); return null; });
    c.set(kind, { key, p, v: null, done: false });
    return p;
  }
  function calcSync(chat, kind, o = {}) {
    const st = live(chat);
    if (!st) return null;
    const had = st.calc?.get(kind);
    if (had?.key === calcKey(chat, kind, o.upto, o.tools) && had.done) return had.v;
    calc(chat, kind, o).then((v) => { if (v != null) o.again?.(); });
    return null;
  }

  const on = () => store.get('chat.window86', true) !== false;
  // turned off: every windowed chat loads whole now
  function all() { for (const c of R.chats.values()) if (is(c)) whole(c, 'off').catch((err) => console.warn('chatwin', err)); }
  function stats() {
    let loaded = 0; let windowed = 0; let total = 0;
    for (const c of R.chats.values()) { const st = live(c); if (st) { windowed += 1; loaded += st.a.keys().length; total += st.a.t.length; } }
    return { ...stat, windowed, loaded, total };
  }
  const api = { is, open, keys, has, ensure, cut, whole, release, guess, usage, pins, save, hits, calc, calcSync, bad, replaced, all, stats, rewindow, on, TAIL };
  R.W.x = api;
  return api;
})();
