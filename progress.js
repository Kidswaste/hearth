// Progress (round 11): one progress model for everything in Hearth that takes time. The owner: "when we create
// something or it's in the middle of being created, give me a loading bar of how far the progression seems to be".
// This file is the model only (no DOM): it runs in the app and in Node for the unit tests (dev/progress-test.js).
// progress-ui.js draws the bars (on the thing itself + one quiet indicator at the bottom of the rail) and
// progress-hooks.js feeds it from chats, flows, renders, captures, video projects, comps, jams, sync and installs.
//
// The API (other streams call it; keep it exactly like this):
//   Progress.set(key, { pct, label, eta, parent, …more })   create or update an item
//     key     any string, unique per thing ('chat:<chatId>', 'flow:<runId>', 'job:<ffmpeg id>', 'make:<id>', 'make:<id>:<part>')
//     pct     0–100 when it is MEASURED (frames done, steps done, bytes): never a 0–1 fraction. Leave it out and Hearth
//             estimates it (time, tool calls and text streamed against this kind's own history). A pct given with
//             `estimate: true` is a hint, drawn soft like any estimate.
//     label   a short line on what it is doing now ("frame 120 / 300", "writing", "waiting for you")
//     eta     seconds left, when the caller knows (else Hearth gives one only when it is confident)
//     parent  the key of a parent item: a parent with no pct of its own shows the weighted mean of its children
//             (a /dispatch comp and its parts, a make and its parts, a video project and its steps)
//   more (all optional):
//     title   what it is, for the list ("Claude · reply", "Render · Reels 9:16")
//     kind    the learning bucket for estimates, from general to specific with ':' ('reply:claude:<agentId>:long');
//             finished runs teach every prefix, an estimate uses the most specific one with enough history
//     expect  { ms, tools, chars, writeAt } defaults for a kind with no history yet
//     signals { tools, chars, steps: [done, total, doing], agentPct, note }: what the estimator reads (merged)
//     estimate true: drawn as an estimate (soft style, "about") even with a pct
//     state   'wait' (paused for you: not hung), 'run' (back to running)
//     where   [locators] where bars go: 'reply:<chatId>', 'row:<chatId>', 'rail:<surface id>', a CSS selector, or a
//             function returning element(s) (progress-ui.js resolves them; keys 'make:<id>' also find [data-make="<id>"])
//     jump    a function that shows the thing (a click in the rail list)
//     icon, weight (among siblings, default 1), hungMs (no news this long → hung), actions [{ label, run }]
//   Progress.done(key, { ok = true, label })    finished (fills to 100 % and fades; ok: false = failed); teaches its kind
//   Progress.drop(key)                           gone without finishing (stopped, removed): teaches nothing
//   Progress.on(fn) → off                        fn(item, what): what = 'set' | 'tick' | 'done' | 'remove'
//   Progress.get(key) · list({ all }) · children(key) · tick(now) · configure({ now, load, save }) · forget(kind?)
//   The makes stream: Makes.progress(makeId, partId?, { pct, label, eta }) = Progress.set(partId ? `make:${makeId}:${partId}`
//   : `make:${makeId}`, { pct, label, eta, parent: partId ? `make:${makeId}` : undefined }).
//
// Honest bars: a measured bar shows its number; an estimated one is marked as an estimate (about 40 %), never goes
// backwards, never sits at 99 % forever: it stops at 95 % and says "almost there", then "waiting on the agent" (or
// "taking longer than usual"); no news for long enough is "hung" (flows offer Pick up here). An ETA shows only when
// the rate (measured) or this kind's history (estimated) is steady enough to trust.
const Progress = (() => {
  const CAP_EST = 95; // an estimate never goes past this before done()
  const LINGER = { done: 1400, failed: 4500 }; // ms a finished bar stays (it fills, then fades) before it is removed
  const HUNG_MS = 4 * 60000;
  // what a kind takes before Hearth has seen one finish (prefix → defaults); callers can pass `expect` instead
  const DEFAULTS = {
    reply: { ms: 25000, tools: 1, chars: 900, writeAt: 0.45 },
    flow: { ms: 60000 }, 'flow-step': { ms: 20000 }, render: { ms: 60000 }, 'seq-render': { ms: 90000 },
    snap: { ms: 8000 }, sync: { ms: 4000 }, engine: { ms: 180000 }, ffmpeg: { ms: 240000 }, jam: { ms: 480000 },
    'jam-round': { ms: 120000 }, intro: { ms: 600000 }, record: { ms: 30000 }, comp: { ms: 120000 }, make: { ms: 120000 },
  };
  const items = new Map();
  const listeners = new Set();
  let hist = {}; // kind → { n, lm (mean of log ms), lv (variance of log ms), tools, chars, writeAt }
  let env = { now: () => Date.now(), load: () => null, save: () => {} };
  let saveT = null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  function configure(e = {}) {
    env = { ...env, ...e };
    try { const h = env.load(); if (h && typeof h === 'object') hist = h; } catch { /* fresh history */ }
    return env;
  }
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  function emit(it, what) { for (const fn of listeners) { try { fn(it, what); } catch (err) { console.warn(err); } } }

  // ---------- learning: per kind, every prefix ----------
  const prefixes = (kind) => { const p = String(kind || '').split(':').filter(Boolean); return p.map((_, i) => p.slice(0, i + 1).join(':')); };
  function defaultsFor(kind, given) {
    if (given) return given;
    for (const k of prefixes(kind).reverse()) if (DEFAULTS[k]) return DEFAULTS[k];
    return { ms: 30000 };
  }
  // what to expect for a kind: the most specific prefix with 2+ finished runs (a single run is blended with the default)
  function expect(kind, given = null) {
    const d = { tools: 0, chars: 0, writeAt: 0.5, ...defaultsFor(kind, given) };
    const ps = prefixes(kind).reverse();
    let h = ps.map((k) => hist[k]).find((x) => x && x.n >= 2);
    let blend = 1;
    if (!h) { h = ps.map((k) => hist[k]).find((x) => x && x.n >= 1); blend = 0.5; }
    if (!h) return { ...d, n: 0, sd: Infinity, learned: false };
    const ms = Math.exp(h.lm);
    const mix = (a, b) => (b == null ? a : a * (1 - blend) + b * blend);
    return { ms: mix(d.ms, ms), tools: mix(d.tools, h.tools), chars: mix(d.chars, h.chars), writeAt: mix(d.writeAt, h.writeAt), n: h.n, sd: Math.sqrt(h.lv || 0), learned: true };
  }
  function learn(kind, sample) {
    const ms = Number(sample.ms);
    if (!kind || !(ms > 50)) return;
    const lms = Math.log(ms);
    for (const k of prefixes(kind)) {
      const h = hist[k] || (hist[k] = { n: 0, lm: lms, lv: 0, tools: 0, chars: 0, writeAt: 0.5 });
      h.n += 1;
      const a = Math.max(1 / h.n, 0.25); // a plain mean for the first runs, then the recent ones weigh more
      const d = lms - h.lm;
      h.lm += a * d;
      h.lv = (1 - a) * (h.lv + a * d * d);
      if (sample.tools != null) h.tools += a * (Number(sample.tools) - h.tools);
      if (sample.chars != null) h.chars += a * (Number(sample.chars) - h.chars);
      if (sample.writeAt != null) h.writeAt += a * (clamp(Number(sample.writeAt), 0, 1) - h.writeAt);
      h.at = env.now();
    }
    // the history stays small: the 300 most recent kinds
    const keys = Object.keys(hist);
    if (keys.length > 300) for (const k of keys.sort((x, y) => (hist[x].at || 0) - (hist[y].at || 0)).slice(0, keys.length - 300)) delete hist[k];
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { env.save(hist); } catch { /* the history is a convenience */ } }, 400);
  }
  function forget(kind) {
    if (!kind) hist = {}; else for (const k of Object.keys(hist)) if (k === kind || k.startsWith(`${kind}:`)) delete hist[k];
    try { env.save(hist); } catch { /* fine */ }
  }

  // ---------- the estimate ----------
  // f = how far along it seems (1 = as long as usual). Up to 1 the bar rises to 85 %, then creeps towards 95 %.
  function curve(f) {
    if (!(f > 0)) return 0;
    if (f <= 1) return 85 * (1 - (1 - f) ** 1.5);
    return 85 + (CAP_EST - 85) * (1 - Math.exp(-(f - 1) * 1.2));
  }
  function estimate(it, now) {
    const E = expect(it.kind, it.expect);
    const el = Math.max(0, now - it.started);
    const s = it.signals || {};
    const fTime = el / Math.max(500, E.ms);
    // time, then tool calls made against the usual count, then (once it writes) the text against the usual length
    let wsum = 0.5; let fsum = 0.5 * Math.min(fTime, 2);
    if (E.tools > 0.5 && s.tools != null) { wsum += 0.3; fsum += 0.3 * Math.min(s.tools / E.tools, 1.5); }
    let f = fsum / wsum;
    if (s.chars > 0 && E.chars > 0) {
      const w0 = clamp(E.writeAt ?? 0.5, 0.05, 0.95);
      const fw = w0 + (1 - w0) * Math.min(s.chars / E.chars, 1.3);
      f = Math.max(f, fw);
    }
    let pct = curve(f);
    // a plan with steps (chat_progress, a Codex todo list, a flow) is a stronger signal than time
    if (Array.isArray(s.steps) && s.steps[1] > 0) {
      const [done, total, doing = 0] = s.steps;
      const fs = clamp((done + 0.5 * doing) / total, 0, 1);
      pct = 0.35 * pct + 0.65 * Math.min(CAP_EST, fs * 100);
    }
    // the agent said where it is (<progress pct="40"/> or a progress field in a hub call)
    if (num(s.agentPct) != null) pct = 0.3 * pct + 0.7 * clamp(num(s.agentPct), 0, CAP_EST);
    return { pct: Math.min(CAP_EST, pct), f, E, el };
  }

  // ---------- items ----------
  function set(key, o = {}) {
    if (!key) return null;
    key = String(key);
    const now = env.now();
    let it = items.get(key);
    if (!it || it.state === 'done' || it.state === 'failed') {
      it = { key, title: '', label: '', kind: '', started: now, updated: now, signaled: now, shown: 0, measured: false, state: 'run', signals: {}, samples: [], weight: 1, where: [], rate: 0 };
      items.set(key, it);
    }
    const p = num(o.pct);
    if (p != null) {
      it.raw = clamp(p, 0, 100);
      if (!o.estimate && !it.forceEst) it.measured = true;
      it.samples.push([now, it.raw]);
      if (it.samples.length > 8) it.samples.shift();
    }
    if (o.estimate) { it.forceEst = true; it.measured = false; }
    if (o.signals) it.signals = { ...it.signals, ...o.signals };
    for (const k of ['title', 'label', 'kind', 'expect', 'parent', 'jump', 'icon', 'weight', 'hungMs', 'actions', 'meta']) if (o[k] !== undefined) it[k] = o[k];
    if (o.where !== undefined) it.where = [].concat(o.where || []);
    if (o.eta !== undefined) it.eta = num(o.eta);
    if (o.state === 'wait' || o.state === 'run') it.state = o.state;
    if (o.state === 'hung') it.state = 'hung';
    it.updated = now;
    if (o.pct != null || o.signals || o.label !== undefined || o.state) it.signaled = now;
    if (it.state === 'hung' && o.state !== 'hung' && (o.pct != null || o.signals)) it.state = 'run';
    // a parent named before it exists is made empty (its number comes from its children at the next tick, so parts
    // dispatched together start the parent at their mean, not at the first one's)
    if (o.parent) { const pa = items.get(o.parent); if (!pa || pa.state === 'done' || pa.state === 'failed') items.set(o.parent, { key: o.parent, title: '', label: '', kind: '', started: now, updated: now, signaled: now, shown: 0, measured: false, state: 'run', signals: {}, samples: [], weight: 1, where: [], rate: 0 }); }
    compute(it, now);
    emit(it, 'set');
    return it;
  }
  const children = (key) => [...items.values()].filter((c) => c.parent === key);
  // the bar's number for one item at `now` (never lower than what it showed before)
  function compute(it, now = env.now()) {
    if (it.state === 'done') { it.shown = 100; return it; }
    const kids = children(it.key);
    let target; let estimated;
    if (it.raw != null && !kids.length) { target = it.raw; estimated = !it.measured; }
    else if (kids.length && it.raw == null) {
      let w = 0; let s = 0; estimated = false;
      for (const c of kids) { if (c.state !== 'done') compute(c, now); const cw = Number(c.weight) || 1; w += cw; s += cw * (c.state === 'done' ? 100 : c.shown); if (!c.measured && c.state !== 'done') estimated = true; }
      target = w ? s / w : 0;
    } else {
      const e = estimate(it, now);
      target = e.pct; estimated = true;
      it.f = e.f; it.expectMs = e.E.ms; it.confident = e.E.n >= 3 && e.E.sd <= 0.5;
      // a measured hint below the estimate (the agent's own number) stays a floor
      if (it.raw != null) target = Math.max(target, Math.min(CAP_EST, it.raw));
    }
    if (estimated) target = Math.min(CAP_EST, target);
    it.estimated = estimated;
    it.shown = Math.max(it.shown || 0, clamp(target, 0, 100));
    // the state: almost there / waiting on the agent instead of a bar frozen near the end; hung after a long silence
    if (it.state !== 'wait' && it.state !== 'failed') {
      const quiet = now - (it.signaled || it.started);
      const hungMs = Number(it.hungMs) || HUNG_MS;
      const est = it.estimated && it.raw == null && !kids.length;
      const timeOnly = est && !Object.keys(it.signals || {}).length;
      if ((!timeOnly && quiet > hungMs) || (timeOnly && it.f > 6 && quiet > hungMs)) it.state = 'hung';
      else if (it.state === 'hung' && quiet <= hungMs) it.state = 'run';
      if (it.state !== 'hung') {
        if (est && it.f > 1) it.state = it.f > 1.7 ? 'late' : 'almost';
        else if (!est && it.shown >= 99 && now - (it.samples.at(-1)?.[0] || now) > 8000) it.state = 'almost';
        else it.state = 'run';
      }
    }
    // the time left: given, or from a steady measured rate, or from a steady history
    it.etaShown = null;
    if (it.eta != null) it.etaShown = it.eta;
    else if (it.measured && it.samples.length >= 3) {
      const [t0, p0] = it.samples[0]; const [t1, p1] = it.samples.at(-1);
      const rate = (p1 - p0) / Math.max(1, t1 - t0); // % per ms
      if (rate > 0 && t1 - it.started > 2000 && p1 >= 2) it.etaShown = (100 - p1) / rate / 1000;
    } else if (it.confident && it.expectMs && it.state === 'run') {
      const left = (it.expectMs - (now - it.started)) / 1000;
      if (left > 1) it.etaShown = left;
    }
    return it;
  }
  function done(key, { ok = true, label } = {}) {
    const it = items.get(String(key));
    if (!it || it.state === 'done' || it.state === 'failed') return it || null;
    const now = env.now();
    // a parent finishes its unfinished children with it
    for (const c of children(it.key)) if (c.state !== 'done' && c.state !== 'failed') done(c.key, { ok });
    if (ok && it.kind) learn(it.kind, { ms: now - it.started, tools: it.signals?.tools, chars: it.signals?.chars, writeAt: it.signals?.writeAtMs != null ? it.signals.writeAtMs / Math.max(1, now - it.started) : undefined });
    it.state = ok ? 'done' : 'failed';
    if (ok) it.shown = 100;
    if (label !== undefined) it.label = label;
    it.ended = now; it.updated = now;
    emit(it, 'done');
    // a parent whose children all finished (and that has no number of its own) finishes too
    const pa = it.parent && items.get(it.parent);
    if (pa && pa.raw == null && pa.state !== 'done' && pa.state !== 'failed' && children(pa.key).every((c) => c.state === 'done' || c.state === 'failed')) done(pa.key, { ok: children(pa.key).some((c) => c.state === 'done') });
    return it;
  }
  function drop(key) {
    const it = items.get(String(key));
    if (!it) return false;
    for (const c of children(it.key)) drop(c.key);
    items.delete(it.key);
    emit(it, 'remove');
    return true;
  }
  // moves estimates on, finds hung ones, removes finished bars after they faded; the UI calls it a few times a second
  // while something runs (and never when nothing does)
  function tick(now = env.now()) {
    for (const it of [...items.values()]) {
      if (it.state === 'done' || it.state === 'failed') {
        if (now - (it.ended || now) > LINGER[it.state]) { items.delete(it.key); emit(it, 'remove'); }
        continue;
      }
      if (it.parent && items.has(it.parent)) continue; // computed with its parent
      const before = `${Math.round(it.shown * 10)}|${it.state}|${Math.round(it.etaShown ?? -1)}`;
      compute(it, now);
      if (`${Math.round(it.shown * 10)}|${it.state}|${Math.round(it.etaShown ?? -1)}` !== before) emit(it, 'tick');
      for (const c of children(it.key)) emit(c, 'tick');
    }
  }
  const get = (key) => items.get(String(key)) || null;
  // the top-level items (children are listed under their parent), running first, oldest first
  function list({ all = false } = {}) {
    const out = [...items.values()].filter((it) => all || !it.parent || !items.has(it.parent));
    const rank = (it) => (it.state === 'done' || it.state === 'failed' ? 2 : it.state === 'hung' ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || a.started - b.started);
  }
  const active = () => [...items.values()].some((it) => it.state !== 'done' && it.state !== 'failed');
  // words for a bar: "about 40 %" (estimated) or "40 %", the state, the time left
  function words(it) {
    if (!it) return '';
    const pct = Math.round(it.shown);
    const n = it.state === 'done' ? 'done' : it.state === 'failed' ? 'failed' : `${it.estimated ? 'about ' : ''}${pct} %`;
    const st = { almost: 'almost there', late: /^(reply|flow-step:ai|jam|comp)/.test(it.kind || '') || /^chat:/.test(it.key) ? 'waiting on the agent' : 'taking longer than usual', hung: 'no news for a while', wait: 'waiting for you' }[it.state] || '';
    const eta = it.etaShown != null && it.state === 'run' && it.etaShown >= 2 ? (it.etaShown >= 90 ? `about ${Math.round(it.etaShown / 60)} min left` : `about ${Math.max(5, Math.round(it.etaShown / 5) * 5)} s left`) : '';
    return [n, st || it.label, st && it.label ? it.label : '', eta].filter(Boolean).join(' · ');
  }

  return { set, done, drop, on, get, list, children, tick, active, words, configure, forget, CAP_EST, LINGER, _test: { expect, learn, estimate, curve, prefixes, hist: () => hist, items } };
})();
if (typeof module !== 'undefined') module.exports = Progress;
if (typeof window !== 'undefined') window.Progress = Progress;
