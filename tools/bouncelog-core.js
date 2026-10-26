// (round 66, bouncelog66) Session log for music, the thinking with no DOM (node-tested by dev/bouncelog66-test.js).
//   · the session clock: time really spent in the Sound desk (Serum 2 / Vital, the Live set, Arrange). Time counts while
//     the desk is on screen AND something happens (a click or key in the window, or sound from the instrument host) at
//     least every 3 minutes; a desk left open on a quiet screen stops counting after 3 minutes. Leaving the desk pauses
//     the clock; coming back within 20 minutes continues the same session, later starts a new one.
//   · the strip: offered once the session reaches 10 minutes, until it is dismissed (never again for that session) or
//     logged.
//   · Log it: which active music quests the session can be offered to (the step it fits, never a step it can't prove),
//     the proof's words (Codex's QuestCore.checkProof shape) and the session's line in the Sessions list / My Paris.
//   · the Sessions store (kv 'music-sessions', read and saved through DataSafe): its shape, validate, upsert (≤ 200).
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.BounceLogCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const MIN = 60000;
  const OFFER_MIN = 10;          // the strip appears after 10 minutes in the desk
  const IDLE_MS = 3 * MIN;       // no click / key / sound for longer than this: the clock stops counting
  const BREAK_MS = 20 * MIN;     // away from the desk longer than this: the next visit is a new session
  const SKETCH_S = 30;           // "Save a 30-second sketch"
  const KEEP = 200;              // sessions kept in the list
  const KV = 'music-sessions';

  // ---------- the clock ----------
  function start(now, id = `ses-${now.toString(36)}`) {
    return { id, start: now, last: now, active: 0, lastActivity: now, inDesk: true, awayAt: null, dismissed: false, logged: false, offered: false,
      used: { desk: true, park: false, liveset: false, arrange: false }, instruments: [], place: '', sketches: [] };
  }
  // count the time since the last look, but only up to IDLE_MS after the last sign of life
  function accrue(st, now) {
    if (!st || !st.inDesk) return st;
    const upto = Math.min(now, st.lastActivity + IDLE_MS);
    if (upto > st.last) st.active += upto - st.last;
    st.last = Math.max(st.last, now);
    return st;
  }
  /** The desk came on screen. → { st, ended }: `ended` is the previous session when the break was long enough. */
  function enter(st, now) {
    if (st && !st.inDesk && st.awayAt != null && now - st.awayAt <= BREAK_MS) {
      st.inDesk = true; st.awayAt = null; st.last = now; st.lastActivity = now; return { st, ended: null };
    }
    if (st && st.inDesk) { accrue(st, now); st.lastActivity = Math.max(st.lastActivity, now); return { st, ended: null }; }
    return { st: start(now), ended: st || null };
  }
  /** The desk left the screen (closed, another tool, the window hidden). */
  function leave(st, now) { if (!st || !st.inDesk) return st; accrue(st, now); st.inDesk = false; st.awayAt = now; return st; }
  /** A sign of life at `at` (a click / key now, or sound the host heard a few seconds ago), seen at `now`. */
  function activity(st, at, now = at) {
    if (!st || !st.inDesk) return st;
    at = Math.min(at, now);
    // the sound came after a quiet stretch: count from the last counted point only from that sound on
    if (at > st.lastActivity + IDLE_MS) { accrue(st, at); st.last = Math.max(st.last, at); }
    st.lastActivity = Math.max(st.lastActivity, at);
    return accrue(st, now);
  }
  const tick = (st, now) => accrue(st, now);
  const minutes = (st) => (st ? Math.floor(st.active / MIN) : 0);
  /** Should the strip show? */
  const shouldOffer = (st) => !!st && st.inDesk && !st.dismissed && !st.logged && st.active >= OFFER_MIN * MIN;
  const dismiss = (st) => { if (st) st.dismissed = true; return st; };
  /** What the desk is doing (seen on a tick): Park mode, the Live set, Arrange, the instrument and the park's name. */
  function use(st, { park = false, liveset = false, arrange = false, instrument = '', place = '', bpm = null } = {}) {
    if (!st) return st;
    if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 240) st.bpm = Math.round(bpm * 10) / 10; // (round 67, sketchpads67) the tempo the desk last played at (Live set song, Arrange, a park take): ✂ Trim loop's grid
    if (park) st.used.park = true; if (liveset) st.used.liveset = true; if (arrange) st.used.arrange = true;
    if (instrument && !st.instruments.includes(instrument) && st.instruments.length < 4) st.instruments.push(String(instrument).slice(0, 40));
    if (park && place) st.place = String(place).slice(0, 80);
    return st;
  }
  const stripText = (n) => `Nice session — ${n} min.`;
  const what = (st) => [st.instruments.length ? st.instruments.join(' + ') : 'the Sound desk', st.used.park ? `Park mode${st.place ? ` (${st.place})` : ''}` : '', st.used.liveset ? 'Live set' : '', st.used.arrange ? 'Arrange' : ''].filter(Boolean).join(' · ');

  // ---------- Log it: the music quests it fits ----------
  // explicit steps for the three music quests the desk was built for; any other music quest only when its step asks
  // for a sketch / loop / patch / demo you make at home, and only with a saved sketch to show
  const STUDIO = /\b(loop|beat|patch|demo|bounce|vital|serum|sketch|pad|drone|bass|synth|track|melody)\b/i;
  const AWAY = /\b(go to|go and|get to|getting there|outdoors|on a bench|ticket|after the set|during|shop|listings|at the venue|walk)\b/i;
  function fits(cid, index, step, sess) {
    const u = sess.used || {}, sketch = !!(sess.sketches || []).length;
    if (cid === 'c-pq-park') return index === 1 && !!u.park;                          // "Make a two-minute sketch outdoors"
    if (cid === 'c-pq-track') return (index === 0 || index === 1) && !!u.arrange;     // pick the loops / bounce the whole thing
    if (cid === 'c-pq-openmic') return (index === 2 || index === 3) && !!u.liveset;  // decide your next step / play your set
    const words = `${step?.title || ''} ${step?.done || ''}`;
    return sketch && STUDIO.test(words) && !AWAY.test(words);
  }
  // "active": a quest the owner took on — added from Paris (place / personal), the one tracked, or one with a step started,
  // done or proven. Codex's untouched starter campaigns are templates, not active quests.
  const active = (s, c) => !!(c.parisPersonal || c.parisPlace || s.active === c.id || c.quests.some((q) => s.records?.[q.id]?.startedAt || s.records?.[q.id]?.completedAt || s.submissions?.[q.id]?.length));
  /** The active music quests (taken on, not paused, not finished) whose current step this session fits.
   *  C = QuestCore, s = the journal. → [{ campaign, title, quest, step, index }] */
  function credits(C, s, sess) {
    const out = [];
    for (const c of s?.campaigns || []) {
      if (c.path !== 'music' || c.paused || !Array.isArray(c.quests) || !active(s, c)) continue;
      const q = C.next(s, c); if (!q || C.done(s, q.id) || (C.available && !C.available(s, q.id))) continue;
      const index = c.quests.findIndex((x) => x.id === q.id);
      if (index < 0 || !fits(c.id, index, q, sess)) continue;
      if ((s.submissions?.[q.id] || []).some((x) => x.proof?.excerpt?.includes(`Session ${sess.id}`))) continue; // already offered
      out.push({ campaign: c.id, title: c.title, quest: q.id, step: q.title, index });
    }
    return out;
  }
  const clock = (ms) => { const m = Math.max(0, Math.round(ms / MIN)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const day = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  /** The proof's words for a session (Codex's checkProof fields excerpt / analysis / coverage). */
  function proofText(sess, sketch = null) {
    const excerpt = [`Session ${sess.id} · ${day(sess.start)} · ${clock(sess.active)} in the Sound desk`, `Played: ${what(sess)}`,
      sketch ? `Sketch: the last ${Math.round(sketch.seconds)} s of the desk's output (48 kHz WAV)` : 'No sketch saved: the session note is the proof.'].join('\n');
    return { excerpt: excerpt.slice(0, 20000), analysis: JSON.stringify({ minutes: Math.round(sess.active / MIN), used: sess.used, instruments: sess.instruments, place: sess.place || null, sketchSeconds: sketch?.seconds ?? null }).slice(0, 6000),
      coverage: 'Session log only: how long the Sound desk was in use, what was open, and (when saved) the last seconds of its output. Astra cannot hear audio; no claims about the music itself.' };
  }
  const intentOf = (sess, credit) => `A ${clock(sess.active)} music session (${what(sess)}), logged from the Sound desk toward “${credit.step}”.`;
  const noteText = (sess) => `Hearth · Sound desk session\n${day(sess.start)} · ${clock(sess.active)}\nPlayed: ${what(sess)}\n`;

  // ---------- the Sessions list (kv 'music-sessions') ----------
  const empty = () => ({ v: 1, sessions: [] });
  /** One row of the list from the live session. */
  function entry(st, now = Date.now()) {
    return { id: st.id, start: new Date(st.start).toISOString(), end: new Date(Math.max(st.start, st.last, now)).toISOString(), minutes: minutes(st),
      used: { park: !!st.used.park, liveset: !!st.used.liveset, arrange: !!st.used.arrange }, instruments: st.instruments.slice(0, 4), place: st.place || '',
      sketches: st.sketches.slice(0, 20), logged: st.logged ? (st.loggedInfo || { at: new Date(now).toISOString(), quests: [] }) : null, ...(st.bpm ? { bpm: st.bpm } : {}) }; // (round 67) + bpm when known
  }
  const str = (x, n) => typeof x === 'string' && x.length <= n;
  const iso = (x) => str(x, 40) && Number.isFinite(Date.parse(x));
  function okRow(r) {
    return r && str(r.id, 60) && r.id && iso(r.start) && iso(r.end) && Number.isInteger(r.minutes) && r.minutes >= 0 && r.minutes < 100000 && r.used && typeof r.used === 'object'
      && Array.isArray(r.instruments) && r.instruments.every((x) => str(x, 40)) && str(r.place || '', 80) && Array.isArray(r.sketches)
      && r.sketches.every((k) => k && str(k.path, 2000) && iso(k.at) && Number.isFinite(k.seconds)) && (r.logged == null || (iso(r.logged.at) && Array.isArray(r.logged.quests)));
  }
  /** A stored list → a clean one (bad rows dropped, never the whole list). */
  function validate(v) { const out = empty(); if (!v || v.v !== 1 || !Array.isArray(v.sessions)) return out; out.sessions = v.sessions.filter(okRow).slice(0, KEEP); return out; }
  /** Put a row in (replacing its old version), newest first, ≤ 200. */
  function upsert(list, row) {
    const v = validate(list), i = v.sessions.findIndex((r) => r.id === row.id);
    if (i >= 0) v.sessions[i] = row; else v.sessions.unshift(row);
    v.sessions.sort((a, b) => b.start.localeCompare(a.start)); v.sessions = v.sessions.slice(0, KEEP); return v;
  }
  const rowTitle = (r) => `${new Date(r.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${r.minutes} min`;
  const rowWhat = (r) => [r.instruments.length ? r.instruments.join(' + ') : 'Sound desk', r.used.park ? `Park mode${r.place ? ` · ${r.place}` : ''}` : '', r.used.liveset ? 'Live set' : '', r.used.arrange ? 'Arrange' : ''].filter(Boolean).join(' · ');

  return { MIN, OFFER_MIN, IDLE_MS, BREAK_MS, SKETCH_S, KEEP, KV, start, enter, leave, activity, tick, minutes, shouldOffer, dismiss, use, stripText, what,
    fits, credits, proofText, intentOf, noteText, clock, empty, entry, validate, upsert, rowTitle, rowWhat };
});
