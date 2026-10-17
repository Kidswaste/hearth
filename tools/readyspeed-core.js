// ▶ Play, ready sooner (round 56, readyspeed): the pure part (UMD: the window loads it in the gameready group, the main
// process' gamereadymain.js and dev/readyspeed-test.js require it). No DOM, no I/O.
// The owner: "Clink should get from ▶ Play to its first smooth frame as fast as possible, especially the second time."
//   timeline(t)            one ▶ Play's getting ready, from the press to the first frame of play: { total, toWindow, toCard,
//                          toFirstFrame, toReady, steps: [{ id, label, ms }] } (every time an epoch ms: the hub, the main
//                          process and the game's page line up on it)
//   text(tl) / lines(tl)   the plain words: "Ready in 2.1 s · window 0.4 s · card 0.5 s · …" (/game ready)
//   faster(now, was)       "Ready in 2.1 s (was 6.8 s)" when this one was clearly sooner, else ''
//   note(entry, run)       a game's remembered times and what getting ready learnt (data/game-cache/readyspeed.json)
//   hints(entry, key)      what the next ▶ Play of that game may skip or shorten: { was, show, renderers, ab, quiet }
//   abFits(ab)             the budget's A/B said Hearth's helpers cost this game nothing (its verdict may be reused)
//   regression(base, now)  a check's verdict: now within its budget of base ({ ok, ratio, why })
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.ReadySpeedCore = m; })(typeof self !== 'undefined' ? self : this, () => {
  const V = 1; // bump when what a warm run may skip changes: every remembered hint is dropped
  // the page's marks in their order (tools/gameready-page.js) and their plain names
  const LAB = [['drawn', 'first frame behind the card'], ['counted', 'every layer drawing'], ['scanned', 'loading'], ['prepped', 'shaders + textures'], ['warmed', 'warm-up frames'], ['inventory', 'what it costs'], ['sounds', 'sounds'], ['ab', 'smooth check'], ['answered', 'your answer'], ['play', 'card goes']];
  const HTML = [['settled', 'loading'], ['textures', 'textures'], ['effects', 'shaders'], ['warmed', 'warm-up frames'], ['ab', 'smooth check'], ['answered', 'your answer'], ['play', 'card goes']];
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const r0 = (x) => (x == null ? null : Math.round(x));
  // t = { click (epoch), prep: { start, end } (epoch), main: { asked, built, window, loaded, cached } (epoch),
  //       page: { origin (epoch), mode: 'lab' | 'html', marks: { card, drawn, …, play, frame1 }, load } }
  function timeline(t = {}) {
    const click = num(t.click); const P = t.page || {}; const M = t.main || {}; const origin = num(P.origin); const mk = P.marks || {};
    if (click == null || origin == null) return null;
    const at = (pageMs) => (num(pageMs) == null ? null : origin + pageMs - click); // a page time → ms since the press
    const steps = [];
    const add = (id, label, a, b) => { if (a == null || b == null) return; steps.push({ id, label, ms: Math.max(0, Math.round(b - a)) }); };
    const prepEnd = num(t.prep?.end) != null ? t.prep.end - click : null;
    add('hub', 'Hearth looks at its files', 0, prepEnd);
    const built = num(M.built) != null ? M.built - click : null; const win = num(M.window) != null ? M.window - click : null;
    const asked = num(M.asked) != null ? M.asked - click : prepEnd;
    if (built != null) add('build', M.cached ? 'its page (kept)' : 'its page built', asked, built);
    add('window', 'the window opens', built ?? asked, win);
    const card = at(mk.card);
    add('page', 'the page starts', win, card);
    // the load's own times (Lab scene pages): fetched, decoded off the page's thread, transcoded (they overlap the
    // first frame: shown, not summed)
    const L = P.load || {}; const side = [];
    if (num(L.asked) != null && num(L.fetched) != null) side.push({ id: 'fetch', label: 'files read', ms: r0(L.fetched - L.asked) });
    if (L.decode && num(L.decode.from) != null) side.push({ id: 'decode', label: `${L.decode.n} picture${L.decode.n === 1 ? '' : 's'} decoded`, ms: r0(L.decode.to - L.decode.from) });
    if (L.ktx && num(L.ktx.from) != null) side.push({ id: 'ktx2', label: `${L.ktx.n} compressed transcoded`, ms: r0(L.ktx.to - L.ktx.from) });
    let prev = card;
    for (const [id, label] of P.mode === 'html' ? HTML : LAB) { const v = at(mk[id]); if (v == null) continue; add(id, label, prev, v); prev = v; }
    const frame1 = at(mk.frame1);
    add('frame1', 'first frame of play', at(mk.play), frame1);
    const ready = at(mk.play);
    const total = frame1 ?? ready;
    return { total: r0(total), toWindow: r0(win), toCard: r0(card), toFirstFrame: r0(at(mk.drawn) ?? at(mk.settled)), toReady: r0(ready), cached: M.cached ?? null, steps, side };
  }
  const secs = (ms) => `${(Math.round((ms || 0) / 100) / 10).toFixed(1)} s`;
  function text(tl) {
    if (!tl || tl.total == null) return '';
    const big = [...tl.steps].filter((s) => s.ms >= 50).sort((a, b) => b.ms - a.ms).slice(0, 4).map((s) => `${s.label} ${secs(s.ms)}`);
    return `Ready in ${secs(tl.total)}${big.length ? ` · longest: ${big.join(', ')}` : ''}`;
  }
  function lines(tl) {
    if (!tl) return [];
    const out = [`From ▶ Play to the first frame of play: ${secs(tl.total)} (window ${secs(tl.toWindow)}, card ${secs(tl.toCard)}${tl.toFirstFrame != null ? `, first frame behind it ${secs(tl.toFirstFrame)}` : ''})`];
    for (const s of tl.steps) out.push(`  ${s.label}: ${s.ms} ms`);
    for (const s of tl.side || []) out.push(`  (alongside) ${s.label}: ${s.ms} ms`);
    return out;
  }
  // clearly sooner: at least 15 % and 0.3 s
  const FASTER = { ratio: 0.85, ms: 300 };
  function faster(now, was) {
    if (!(now > 0) || !(was > 0)) return '';
    if (now > was * FASTER.ratio || was - now < FASTER.ms) return '';
    return `Ready in ${secs(now)} (was ${secs(was)})`;
  }
  // ---------- what a game's getting ready learnt (one entry per game) ----------
  // entry = { v, first: ms (its first, cold ▶ Play), last, best, runs, shown: bool ("was" told once), renderers,
  //           quiet: { n, clean } (warm passes that found nothing new in a row, last runs), ab: { key, fits, at }, at }
  function note(entry, run = {}, now = Date.now()) {
    const e = entry && entry.v === V ? { ...entry } : { v: V, runs: 0 };
    const ms = num(run.total);
    if (ms != null && !run.skipped && !run.noPrep) {
      if (e.first == null) e.first = ms;
      e.last = ms; e.best = e.best == null ? ms : Math.min(e.best, ms); e.runs = (e.runs || 0) + 1;
    }
    if (run.shown) e.shown = true;
    if (num(run.renderers) > 0) e.renderers = run.renderers;
    if (num(run.loads) > 0) e.loads = run.loads; // (an HTML build: its loads, all in → no quiet wait)
    // warm-up: did the first pass already find nothing new to compile / upload? (2 runs in a row → one quiet pass is enough)
    if (run.warm && Array.isArray(run.warm)) {
      const firstClean = run.warm.length > 0 && run.warm[0] && (run.warm[0].compiles || 0) + (run.warm[0].links || 0) + (run.warm[0].uploads || 0) === 0;
      e.clean = firstClean ? Math.min(9, (e.clean || 0) + 1) : 0;
    }
    if (run.first5) e.first5ok = (run.first5.compiles || 0) + (run.first5.links || 0) + (run.first5.uploads || 0) === 0;
    if (run.ab !== undefined) e.ab = run.ab && run.abKey ? { key: run.abKey, fits: abFits(run.ab), at: now } : null;
    // a helper switched off while it played (the budget's watch) or by the A/B: this game is one where Hearth's helpers
    // can cost frames, its A/B is never skipped again
    if (run.first5?.budgetOff > 0 || (run.ab && (run.ab.turnedOff || []).length)) { e.costly = true; e.ab = null; }
    e.at = now;
    return e;
  }
  // the budget's A/B: on ≈ off, nothing switched off, not skipped
  function abFits(ab) { return Boolean(ab && !ab.skipped && !(ab.turnedOff || []).length && ab.judge && ab.judge.slower === false); }
  // what the next ▶ Play may use: was (the first ▶ Play's time, said once when this one is clearly sooner), the number of
  // renderers to wait for, the A/B verdict when its key (the game's files + Hearth's helpers + the screen) is the same,
  // one quiet warm-up pass when the last two runs needed nothing more and played their first 5 s clean
  function hints(entry, key = {}) {
    const e = entry && entry.v === V ? entry : null;
    if (!e) return { was: null, show: false, renderers: null, loads: null, ab: false, quiet: 2 };
    return {
      was: e.first ?? null,
      show: !e.shown && e.first != null && e.runs >= 1,
      renderers: e.renderers || null,
      loads: e.loads || null,
      ab: Boolean(key.ab && !e.costly && e.ab && e.ab.fits && e.ab.key === key.ab && e.first5ok !== false),
      quiet: (e.clean || 0) >= 2 && e.first5ok !== false ? 1 : 2,
    };
  }
  // ---------- checks ----------
  // now within its budget of base: at most ratio × base + slack ms (a busy machine's noise gets the slack)
  function regression(base, now, { ratio = 1, slack = 0 } = {}) {
    if (!(base > 0) || !(now >= 0)) return { ok: false, why: 'no numbers' };
    const lim = base * ratio + slack;
    return { ok: now <= lim, ratio: +(now / base).toFixed(3), limit: Math.round(lim), why: now <= lim ? '' : `${Math.round(now)} ms over ${Math.round(lim)} ms` };
  }
  return { V, timeline, text, lines, faster, FASTER, note, hints, abFits, regression, secs };
});
