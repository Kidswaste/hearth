// Jank watch (round 20, jankwatch): how smooth Hearth really is on the owner's own computers, measured while it's used,
// and a gentle hand when it isn't. Every earlier speed pass was measured headless on a software GPU; this one watches
// the real thing. Observers only: no polling, no per-frame work, nothing sent anywhere.
//   long frames  PerformanceObserver 'long-animation-frame' (≥ 50 ms; 'longtask' where that's missing) and why: script
//                and tasks, style & layout forced by a script, the frame's own style / layout / paint, other browser
//                work. Which code: Chromium names only scripts that aren't file:// URLs (Hearth's are), so when unnamed
//                long frames keep coming a short profile names them (file:line, function, the handler it started
//                from; jankmain.js), a few times a day at most; /smooth profile asks for one
//   inputs       Event Timing ('event', ≥ 16 ms) grouped by interaction (key, click, tap: input → next paint), plus a
//                count of every interaction so p50 / p95 stay honest (fast ones never make an entry)
//   dropped      frames lost to a long frame while something moves (an animation runs, you scroll or drag)
//   Lab preview  its own stats (fps, worst frame, cap) from tools/three.js: Jank.lab(msg)
//   main / GPU   main-process event-loop lag, GPU process crashes, pages crashing / hanging (jankmain.js), and WebGL
//                views losing their context
// Grouped by area (chat, Lab, board, menus, dialogs, Commands page, apps, rail, start…) and kept as hourly buckets of
// one week in kv/jank-log.json (local to this computer, never synced), saved every 5 minutes at most, when idle.
//
// Busy now: while the owner types, drags or scrolls (and 0.7 s after), Jank.busy() is true and 'hearth:busy'
// ({ detail: { busy } }) fires on each change. Background work waits for the gesture to end:
//   await Jank.calm(maxMs, label)   resolves at once when calm, else when the gesture ends (≤ maxMs); label counts it
//   (window.Jank?.calm?.(…) ?? Promise.resolve()) from modules that may load first
// The report and its commands (/smooth, /smooth reset|off|on) are in jank-report.js (loaded on first use).
const Jank = (() => {
  const KV = 'jank-log';
  const HOUR = 3600e3; const KEEP = 24 * 7; // hourly buckets, a week
  const HOLD = 700; // ms after the last key / drag / wheel that still counts as busy
  // input latency bins (ms): bin i holds EDGES[i-1] ≤ d < EDGES[i]; bin 0 (< 16 ms) is every interaction without an entry
  const EDGES = [16, 24, 32, 48, 64, 100, 150, 200, 300, 500, 1000, Infinity];
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* no storage */ } return null; };
  let off = ls('jank.off') === '1';
  let readyAt = 0;
  let env = { hz: 60, test: false }; // jankmain info(): refresh rate, GPU, a test copy
  const BASE = location.href.replace(/[^/]*([?#].*)?$/, '');
  const rel = (url) => { const u = String(url || ''); return (u.startsWith(BASE) ? decodeURIComponent(u.slice(BASE.length)) : u.split('/').pop() || '').split(/[?#]/)[0]; };

  // ---------- areas ----------
  const TOOL_AREA = { 'tool:three': 'Lab', 'tool:board': 'board', 'tool:commands': 'Commands page', 'tool:forgeheart': 'Forge' };
  const FILE_AREA = [[/^tools\/(three|cut)|^nodes|three-sandbox/, 'Lab'], [/^board/, 'board'], [/^(cmdpage|flows)/, 'Commands page'], [/^apps/, 'apps'],
    [/^(cmdbar|keys-ui)/, 'menus'], [/^(native|panel|chat-|md\.js|meter|director-dock)/, 'chat'], [/^(capture|framereader)/, 'capture'], [/^tools\/forge/, 'Forge']];
  const fileArea = (f) => { for (const [re, a] of FILE_AREA) if (re.test(f)) return a; return ''; };
  const surfArea = (sid) => TOOL_AREA[sid] || (String(sid).startsWith('tool:') ? sid.slice(5) : 'chat');
  function viewArea() {
    if (!readyAt) return 'start';
    const m = document.getElementById('menu');
    if ((m && !m.hidden) || document.querySelector('.palette, .cmdbar:not([hidden])')) return 'menus';
    if (document.querySelector('dialog[open]')) return 'dialogs';
    let sid = '';
    try { sid = H.surfaceIdFor(H.activeId) || ''; } catch { /* before the app is up */ }
    return surfArea(sid);
  }
  function targetArea(t) {
    if (!readyAt) return 'start';
    const e = t?.closest ? t : t?.parentElement;
    if (!e?.closest) return viewArea();
    if (e.closest('#menu, .palette, .cmdbar, .mb-menu')) return 'menus';
    if (e.closest('dialog')) return e.closest('[class*="apps-"]') ? 'apps' : 'dialogs';
    if (e.closest('#rail')) return 'rail';
    if (e.closest('.tool-dock')) return 'chat';
    const s = e.closest('.surface');
    return s ? surfArea(s.dataset.id || '') : viewArea();
  }

  // ---------- this hour's numbers (a delta since the last save; merged into the log on save) ----------
  let cur = null; let dirty = false; const older = []; // older: hours that ended before a save
  function bucket() {
    const now = Date.now(); const t = now - (now % HOUR);
    if (!cur || cur.t !== t) { if (cur && dirty) older.push(cur); cur = { t, a: {}, c: {}, lab: null, main: null, ev: [], ad: {} }; }
    dirty = true; armFlush();
    return cur;
  }
  const areaOf = (b, area) => (b.a[area] ||= { n: 0, h: EDGES.map(() => 0), lf: 0, ms: 0, worst: 0, drop: 0, s: 0, f: 0, r: 0, o: 0, wi: 0 });
  const note = (kind, what) => { const b = bucket(); b.ev.push({ t: Date.now(), kind, what: String(what).slice(0, 160) }); if (b.ev.length > 20) b.ev.shift(); };

  // ---------- busy now ----------
  let busyUntil = 0; let isBusy = false; let moving = 0; // moving: scroll / drag until (frames lost then count as dropped)
  const waiters = [];
  function poke(drag) {
    const now = performance.now();
    busyUntil = now + HOLD;
    if (drag) moving = busyUntil;
    if (isBusy) return;
    isBusy = true; changed();
    setTimeout(function check() { const left = busyUntil - performance.now(); if (left > 0) { setTimeout(check, left + 20); return; } isBusy = false; changed(); }, HOLD + 20);
  }
  function changed() {
    try { window.hub?.jank?.busy(isBusy); } catch { /* old preload */ }
    dispatchEvent(new CustomEvent('hearth:busy', { detail: { busy: isBusy } }));
    if (!isBusy) release();
  }
  // waiting work resumes one job per idle moment, not all at once when the gesture ends
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 30));
  function release() {
    if (isBusy || !waiters.length) return;
    const w = waiters.shift(); clearTimeout(w.t); w.res(true);
    if (waiters.length) idle(release);
  }
  function calm(max = 8000, label = 'background work') {
    if (off || !isBusy) return Promise.resolve(true);
    if (label) { const b = bucket(); b.ad[label] = (b.ad[label] || 0) + 1; }
    return new Promise((res) => {
      const w = { res, t: setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); res(false); }, max) };
      waiters.push(w);
    });
  }
  let lastArea = 'start';
  function interact(e) {
    if (off) return;
    poke(e.type === 'pointerdown');
    if (e.repeat) return;
    lastArea = targetArea(e.target);
    areaOf(bucket(), lastArea).n += 1;
  }
  const opt = { capture: true, passive: true };
  addEventListener('keydown', interact, opt);
  addEventListener('pointerdown', interact, opt);
  addEventListener('pointermove', (e) => { if (e.buttons && !off) poke(true); }, opt);
  addEventListener('wheel', () => { if (!off) poke(true); }, opt);

  // ---------- long frames ----------
  let animSeen = 0; let animAt = -1e9;
  const animating = () => {
    const now = performance.now();
    if (now < moving) return true; // (round 26, smooth26) a scroll / drag says it: getAnimations() would style the page mid-scroll
    // (round 32, smooth32) asked right after the next frame, when the page's style is fresh: asked here (a long-frame
    // report, often while a reply streams) it styled the whole page first (≈ 5 ms each here); the last answer stands meanwhile
    if (now - animAt > 1000) { animAt = now; requestAnimationFrame(() => setTimeout(() => { try { animSeen = document.getAnimations().some((a) => a.playState === 'running') ? 1 : 0; } catch { animSeen = 0; } }, 0)); }
    return animSeen || now < moving;
  };
  function frame(e) {
    const dur = e.duration;
    if (off || !(dur >= 50)) return;
    const scripts = e.scripts || [];
    let sMs = 0; let forced = 0; let top = null;
    for (const s of scripts) { sMs += s.duration; forced += s.forcedStyleAndLayoutDuration || 0; if (!top || s.duration > top.duration) top = s; }
    const end = e.startTime + dur;
    const render = e.styleAndLayoutStart ? Math.max(0, end - e.styleAndLayoutStart) : 0; // the frame's style, layout and paint
    // (Hearth's own scripts are file:// URLs, which Chromium leaves out of `scripts`: then the time before the frame's
    // rendering counts as script / tasks, and a short profile names the code when long frames keep coming)
    const named = scripts.some((x) => x.sourceURL);
    const script = scripts.length ? Math.max(0, sMs - forced) : Math.max(0, dur - render);
    const other = Math.max(0, dur - script - forced - render);
    const file = top ? rel(top.sourceURL) : '';
    const area = (top && top.duration >= dur * 0.3 && fileArea(file)) || viewArea();
    const b = bucket(); const r = areaOf(b, area);
    r.lf += 1; r.ms += Math.round(dur); r.worst = Math.max(r.worst, Math.round(dur));
    r.s += Math.round(script); r.f += Math.round(forced); r.r += Math.round(render); r.o += Math.round(other);
    if (animating()) r.drop += Math.max(1, Math.round(dur / (1000 / (env.hz || 60))) - 1);
    if (top && top.duration >= 20) {
      const fn = String(top.sourceFunctionName || '').slice(0, 60);
      const key = `${file}|${top.sourceCharPosition ?? -1}|${fn}|${top.invokerType || ''}`;
      const c = (b.c[key] ||= { f: file, p: top.sourceCharPosition ?? -1, fn, it: top.invokerType || '', inv: String(top.invoker || '').slice(0, 80), a: area, n: 0, ms: 0, worst: 0, fl: 0 });
      c.n += 1; c.ms += Math.round(top.duration); c.worst = Math.max(c.worst, Math.round(dur)); c.fl += Math.round(top.forcedStyleAndLayoutDuration || 0);
    }
    if (!named && readyAt && area !== 'start') {
      recent.push(e.startTime);
      while (recent.length && e.startTime - recent[0] > 15000) recent.shift();
      if (recent.length >= 3) autoProfile();
    }
  }

  // ---------- profiles: which code (jankmain.js samples the page's JS for a few seconds) ----------
  // Automatically when 3 unnamed long frames come within 15 s: at most every 3 minutes and 12 times a day (never in a
  // test copy); or on demand (/smooth profile). Each long stretch found becomes a culprit: the app line it spent the
  // most time under, and the handler it started from.
  const recent = []; let profiling = null; let lastProf = 0;
  function autoProfile() {
    recent.length = 0;
    if (profiling || off || env.test || Date.now() - lastProf < 180e3) return;
    const day = new Date().toDateString();
    let q = {};
    try { q = JSON.parse(ls('jank.prof') || '{}'); } catch { /* fresh */ }
    const n = q.day === day ? q.n || 0 : 0;
    if (n >= 12) return;
    ls('jank.prof', JSON.stringify({ day, n: n + 1 }));
    profile(8000, 'auto');
  }
  function profile(ms = 8000, why = 'asked') {
    if (profiling) return profiling;
    if (off || !window.hub?.jank?.profile) return Promise.resolve({ error: off ? 'the jank watch is off' : 'not available' });
    lastProf = Date.now();
    const areaAt = viewArea();
    profiling = window.hub.jank.profile(ms).then((r) => {
      if (!r || r.error || off) return r || { error: 'no answer' };
      const b = bucket();
      b.ad[why === 'auto' ? 'profile (automatic)' : 'profile (asked)'] = (b.ad[why === 'auto' ? 'profile (automatic)' : 'profile (asked)'] || 0) + 1;
      for (const st of r.stretches || []) {
        const w = st.where; if (!w) continue;
        const area = fileArea(w.f) || fileArea(st.entry?.f || '') || areaAt;
        const key = `${w.f}|L${w.line}|${w.fn}|profiled`;
        const c = (b.c[key] ||= { f: w.f, l: w.line, p: -1, fn: String(w.fn).slice(0, 60), it: 'profiled', inv: st.entry ? `${st.entry.fn || 'anonymous'} (${st.entry.f}:${st.entry.line})`.slice(0, 120) : '', a: area, n: 0, ms: 0, worst: 0, fl: 0 });
        c.n += 1; c.ms += w.ms; c.worst = Math.max(c.worst, st.ms);
      }
      return r;
    }).catch((err) => ({ error: err.message })).finally(() => { profiling = null; });
    return profiling;
  }
  // ---------- inputs (input → next paint) ----------
  // one interaction (pointerdown, pointerup, click…) counts once, at its slowest event; its events can arrive in
  // separate batches, so a slower one arriving later moves it to its bin
  const seen = new Map(); // interactionId → { r, i }
  function input(e, id) {
    let i = 1; while (e.duration >= EDGES[i]) i += 1;
    const was = seen.get(id);
    if (was && was.i >= i) return;
    const r = was?.r || areaOf(bucket(), e.target?.isConnected ? targetArea(e.target) : lastArea);
    if (was && cur && was.b === cur) r.h[was.i] -= 1; else if (was) return; // (that hour was saved already)
    r.h[i] += 1;
    if (e.duration > r.wi) r.wi = Math.round(e.duration);
    seen.set(id, { r, i, b: cur });
    if (seen.size > 64) seen.delete(seen.keys().next().value);
  }
  function onEvents(list) {
    if (off) return;
    for (const e of list.getEntries()) if (e.interactionId) input(e, e.interactionId);
  }
  const observers = [];
  function observe() {
    const types = PerformanceObserver.supportedEntryTypes || [];
    const add = (fn, o) => { try { const ob = new PerformanceObserver(fn); ob.observe(o); observers.push(ob); } catch { /* not in this engine */ } };
    if (types.includes('long-animation-frame')) add((l) => { for (const e of l.getEntries()) frame(e); }, { type: 'long-animation-frame', buffered: true });
    else if (types.includes('longtask')) add((l) => { for (const e of l.getEntries()) frame(e); }, { type: 'longtask', buffered: true });
    if (types.includes('event')) add(onEvents, { type: 'event', durationThreshold: 16, buffered: true });
  }
  if (!off) observe();
  // WebGL views in this page losing their GPU context (the Lab's preview tells through Jank.gpu)
  addEventListener('webglcontextlost', () => { if (!off) note('gpu', `A WebGL view lost its GPU context (${viewArea()})`); }, true);

  // ---------- the Lab preview (its stats message, twice a second while it's on screen) ----------
  const ring = new Uint8Array(60); let ri = 0; let asked = ls('jank.labAsked') === '1';
  function lab(msg) {
    if (off || !msg || !(msg.fps >= 0)) return;
    const target = msg.cap > 0 ? Math.min(msg.cap, env.hz || 60) : env.hz || 60;
    const bad = msg.fps < target * 0.8 || (msg.worst || 0) > 2.5 * (1000 / target);
    const L = (bucket().lab ||= { n: 0, bad: 0, fps: 0, drop: 0, worst: 0, p95: 0, q: 1, light: 0 });
    L.n += 1; L.fps += msg.fps; if (bad) L.bad += 1;
    L.drop += Math.max(0, Math.round((target - msg.fps) / 2));
    L.worst = Math.max(L.worst, Math.round(msg.worst || 0)); L.p95 = Math.max(L.p95, Number(msg.p95) || 0);
    if (msg.quality > 0) L.q = Math.min(L.q, msg.quality);
    if (msg.light) L.light += 1;
    ring[ri++ % ring.length] = bad ? 1 : 0;
    // keeps dropping frames (40 of the last 30 s), even at lowered resolution: suggest Light mode, once, ever
    if (!asked && !msg.light && !env.test && ri >= ring.length && ring.reduce((a, x) => a + x, 0) >= 40) suggestLight();
  }
  function suggestLight() {
    asked = true; ls('jank.labAsked', '1');
    const b = bucket(); b.ad['Light mode suggested'] = (b.ad['Light mode suggested'] || 0) + 1;
    toast('The Lab preview keeps dropping frames on this computer. Light mode draws 30 steady fps at 1× pixels (recordings and stills stay full size).', {
      timeout: 15000,
      action: { label: '🪶 Light mode', fn: () => { const c = bucket(); c.ad['Light mode turned on'] = (c.ad['Light mode turned on'] || 0) + 1; Commands.exec('/lab light on').catch?.(() => {}); } },
    });
  }

  // ---------- the log ----------
  const sumKeys = ['n', 'lf', 'ms', 'drop', 's', 'f', 'r', 'o'];
  function merge(dst, src) {
    for (const [area, r] of Object.entries(src.a || {})) {
      const d = (dst.a[area] ||= { n: 0, h: EDGES.map(() => 0), lf: 0, ms: 0, worst: 0, drop: 0, s: 0, f: 0, r: 0, o: 0, wi: 0 });
      for (const k of sumKeys) d[k] = (d[k] || 0) + (r[k] || 0);
      r.h?.forEach((v, i) => { d.h[i] = (d.h[i] || 0) + (v || 0); });
      d.worst = Math.max(d.worst || 0, r.worst || 0); d.wi = Math.max(d.wi || 0, r.wi || 0);
    }
    for (const [k, c] of Object.entries(src.c || {})) {
      const d = dst.c[k];
      if (!d) { dst.c[k] = { ...c }; continue; }
      d.n += c.n; d.ms += c.ms; d.fl = (d.fl || 0) + (c.fl || 0); d.worst = Math.max(d.worst, c.worst);
    }
    // the 12 costliest culprits of the hour are kept
    const cs = Object.entries(dst.c);
    if (cs.length > 12) dst.c = Object.fromEntries(cs.sort((x, y) => y[1].ms - x[1].ms).slice(0, 12));
    if (src.lab) {
      const d = (dst.lab ||= { n: 0, bad: 0, fps: 0, drop: 0, worst: 0, p95: 0, q: 1, light: 0 });
      for (const k of ['n', 'bad', 'fps', 'drop', 'light']) d[k] += src.lab[k] || 0;
      d.worst = Math.max(d.worst, src.lab.worst || 0); d.p95 = Math.max(d.p95, src.lab.p95 || 0); d.q = Math.min(d.q, src.lab.q ?? 1);
    }
    if (src.main) dst.main = mergeLag(dst.main, src.main);
    dst.ev = [...(dst.ev || []), ...(src.ev || [])].slice(-20);
    for (const [k, v] of Object.entries(src.ad || {})) dst.ad[k] = (dst.ad[k] || 0) + v;
    return dst;
  }
  const mergeLag = (d, s) => (!d ? { p50: s.p50, p99: s.p99, max: s.max, n: s.n }
    : { p50: Math.round(((d.p50 * d.n + s.p50 * s.n) / Math.max(1, d.n + s.n)) * 10) / 10, p99: Math.max(d.p99, s.p99), max: Math.max(d.max, s.max), n: d.n + s.n });
  let flushT = 0; let saving = null;
  function armFlush() { if (!flushT) flushT = setTimeout(() => { flushT = 0; flush(); }, 5 * 60e3); }
  async function load() {
    let L = null;
    try { L = await window.hub.kvGet(KV, null); } catch { /* no store */ }
    return L && Array.isArray(L.hours) ? L : { v: 1, since: Date.now(), hours: [] };
  }
  function flush({ now = false } = {}) {
    if (saving) return saving;
    saving = (async () => {
      if (!now) await calm(20000, null);
      // the main process's side since the last save: loop lag, GPU / page events, sync passes it held
      try {
        const m = await window.hub?.jank?.take?.();
        if (m && !off) {
          if (m.lag) { const b = bucket(); b.main = mergeLag(b.main, m.lag); }
          for (const ev of m.events || []) { const b = bucket(); b.ev.push(ev); }
          if (m.held) { const b = bucket(); b.ad['sync pass'] = (b.ad['sync pass'] || 0) + m.held; }
        }
      } catch { /* old main.js */ }
      if (!dirty && !older.length) return;
      const deltas = [...older.splice(0), ...(cur && dirty ? [cur] : [])]; cur = null; dirty = false;
      const L = await load();
      for (const delta of deltas) {
        const at = L.hours.find((h) => h.t === delta.t);
        if (at) merge(at, delta); else L.hours.push(merge({ t: delta.t, a: {}, c: {}, ad: {}, ev: [] }, delta));
      }
      L.hours.sort((x, y) => x.t - y.t);
      if (L.hours.length > KEEP) L.hours.splice(0, L.hours.length - KEEP);
      L.host = { hz: env.hz, gpu: env.gpu || '', platform: env.platform || '' };
      try { await window.hub.kvSet(KV, L); } catch { /* next time */ }
    })().finally(() => { saving = null; });
    return saving;
  }
  addEventListener('pagehide', () => { flush({ now: true }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush({ now: true }); });
  addEventListener('hearth:ready', () => {
    readyAt = performance.now();
    armFlush();
    window.hub?.jank?.info?.().then((i) => { if (i) env = i; }).catch(() => {});
    if (off) window.hub?.jank?.off?.(true);
  }, { once: true });

  // ---------- on / off / reset (the /smooth commands, jank-report.js) ----------
  function setOff(o) {
    off = Boolean(o); ls('jank.off', off ? '1' : null);
    try { window.hub?.jank?.off?.(off); } catch { /* old preload */ }
    if (off) {
      for (const ob of observers.splice(0)) ob.disconnect();
      isBusy = false; busyUntil = 0; moving = 0; cur = null; dirty = false; older.length = 0;
      for (const w of waiters.splice(0)) { clearTimeout(w.t); w.res(true); }
    } else if (!observers.length) observe();
    return off;
  }
  async function reset() {
    cur = null; dirty = false; older.length = 0;
    try { await window.hub?.jank?.take?.(); } catch { /* fine */ }
    await window.hub.kvSet(KV, { v: 1, since: Date.now(), hours: [] });
  }
  async function data() { await flush({ now: true }); return load(); }

  return {
    busy: () => isBusy && !off, calm, later: (fn, max, label) => calm(max, label).then(fn),
    lab, profile, profiling: () => Boolean(profiling), gpu: (what) => { if (!off) note('gpu', `${what} lost its GPU context`); },
    data, flush, reset, setOff, isOff: () => off, env: () => ({ ...env }), merge, EDGES,
    _test: { frame, input, interact, rel, fileArea, targetArea, viewArea, live: () => cur, suggestLight, ring },
  };
})();
window.Jank = Jank;
