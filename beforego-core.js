/* (round 70, leavefix70) "🎒 Before I go": the show-night checklist's thinking, no DOM, no fs, no Electron, shared by the
   window (beforego.js: the card on a show and when a show's ⏰ leave reminder rings) and the Node tests
   (dev/leavefix70-test.js).
     list(saved)               the owner's list (edited once, kept in this computer's localStorage) or Hearth's own:
                               Phone charged · Earplugs · ID · Card / cash
     parseEdit(text)           the edit box's lines → a clean list (bullets / ticks / blanks / doubles out, at most 12;
                               empty → back to Hearth's list)
     jacket(days, start)       🧥 only from a forecast ALREADY cached (weekquest62's, never fetched for this): rain likely
                               (≥ 40 %) and / or cold (a high of 12° or less) on the show's day in Paris → the words, else null
     rows({ list, ticket, days, start })   the rows in order: 🎟 Ticket (open it / add it), the list, 🧥 Jacket when
                               the forecast says so
     ticks: per show ({ v: 1, shows: { <show key>: { ids, at } } }): a new show starts with nothing ticked; old shows go
                               (two weeks, at most 40 kept)
   Nothing is sent anywhere and no AI is asked. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.BeforeGoCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const DEFAULTS = ['Phone charged', 'Earplugs', 'ID', 'Card / cash'];
  const MAX_ITEMS = 12, MAX_LEN = 40, KEEP_SHOWS = 40, KEEP_MS = 14 * 86400e3;
  const RAIN = 40; // % chance of rain: from here, a jacket
  const COLD = 12; // °C, the day's high: at or under this, a jacket (the evening is colder still)
  const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  const fold = (v) => clean(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** a row's id: its words, folded (an edit that keeps a row keeps its tick) */
  const idOf = (text) => `i:${fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'}`;
  // the ticket and the jacket are Hearth's own rows: typed into the list they'd show twice
  const OWN = /^(my )?(ticket|tickets|billet|jacket|coat|veste|manteau)s?$/;
  function tidy(arr) {
    const out = [], seen = new Set();
    for (const v of arr || []) {
      const t = clean(String(v ?? '').replace(/^\s*(?:[-*•·]|\[[ xX✓]?\]|☐|☑|✓|✔|\d+[.)])\s*/, ''));
      if (!t || OWN.test(fold(t)) || seen.has(idOf(t))) continue;
      seen.add(idOf(t)); out.push(t);
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  }
  /** the list in use: the owner's saved one when it's sound, else Hearth's */
  function list(saved) {
    if (!Array.isArray(saved)) return DEFAULTS.slice();
    const t = tidy(saved);
    return t.length ? t : DEFAULTS.slice();
  }
  /** the edit box → { list, reset } (an empty box means "back to Hearth's list") */
  function parseEdit(text) {
    const t = tidy(String(text ?? '').split(/\r?\n|;/));
    return t.length ? { list: t, reset: false } : { list: DEFAULTS.slice(), reset: true };
  }
  const isDefault = (l) => JSON.stringify(list(l)) === JSON.stringify(DEFAULTS);

  // ---------- the jacket (a cached forecast only) ----------
  /** the show's day in Paris ("2026-10-31"), whatever the computer's zone */
  function parisDay(ms) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch { return ''; }
  }
  /** days: [{ date, rain, tmax }] (weekquestmain's, as cached) → { why: 'rain' | 'cold' | 'both', text, title } or null */
  function jacket(days, start) {
    if (!Array.isArray(days) || !Number.isFinite(start)) return null;
    const day = parisDay(start), f = days.find((d) => d && d.date === day);
    if (!f || !Number.isFinite(f.rain) || !Number.isFinite(f.tmax)) return null;
    const wet = f.rain >= RAIN, cold = f.tmax <= COLD;
    if (!wet && !cold) return null;
    const bits = [wet ? `rain likely (${Math.round(f.rain)} %)` : '', cold ? `cold (${Math.round(f.tmax)}° at most)` : ''].filter(Boolean);
    return { why: wet && cold ? 'both' : wet ? 'rain' : 'cold', text: `Jacket: ${bits.join(', ')}`, title: `From the forecast Hearth already had for ${day} (Open-Meteo, Paris). Nothing was looked up for this.` };
  }

  // ---------- the rows ----------
  /** → [{ id, text, kind: 'ticket' | 'item' | 'jacket', has?, title? }] */
  function rows({ list: l, ticket = false, days = null, start = NaN } = {}) {
    const out = [{ id: 'ticket', kind: 'ticket', text: ticket ? 'Ticket (in Hearth)' : 'Ticket', has: !!ticket }];
    for (const t of list(l)) out.push({ id: idOf(t), kind: 'item', text: t });
    const j = jacket(days, start);
    if (j) out.push({ id: 'jacket', kind: 'jacket', text: j.text, title: j.title, why: j.why });
    return out;
  }

  // ---------- ticks, per show ----------
  const emptyTicks = () => ({ v: 1, shows: {} });
  function ticksOf(v) {
    if (!v || typeof v !== 'object' || v.v !== 1 || !v.shows || typeof v.shows !== 'object') return emptyTicks();
    const out = emptyTicks();
    for (const [k, s] of Object.entries(v.shows)) {
      if (!/^[\w:.-]{1,120}$/.test(k) || !s || !Array.isArray(s.ids)) continue;
      out.shows[k] = { ids: [...new Set(s.ids.filter((x) => typeof x === 'string' && x.length <= 60))].slice(0, 30), at: Number.isFinite(s.at) ? +s.at : 0 };
    }
    return out;
  }
  const ticked = (t, show) => new Set(ticksOf(t).shows[show]?.ids || []);
  /** tick / untick one row of one show → a new ticks object (old shows pruned) */
  function tick(t0, show, id, on, at = Date.now()) {
    const t = ticksOf(t0);
    if (!/^[\w:.-]{1,120}$/.test(String(show)) || typeof id !== 'string') return t;
    const ids = new Set(t.shows[show]?.ids || []);
    if (on) ids.add(id); else ids.delete(id);
    t.shows[show] = { ids: [...ids], at };
    return prune(t, at);
  }
  function prune(t, at = Date.now()) {
    const keep = Object.entries(t.shows).filter(([, s]) => s.at > at - KEEP_MS).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP_SHOWS);
    t.shows = Object.fromEntries(keep);
    return t;
  }
  /** "3 of 6 ready" · all: "All set ✓" */
  function progress(rs, set) {
    const done = rs.filter((r) => set.has(r.id)).length;
    return { done, total: rs.length, all: done === rs.length && rs.length > 0, text: done === rs.length && rs.length ? 'All set ✓' : `${done} of ${rs.length} ready` };
  }

  return { DEFAULTS, RAIN, COLD, MAX_ITEMS, idOf, list, parseEdit, isDefault, parisDay, jacket, rows, emptyTicks, ticksOf, ticked, tick, prune, progress };
});
