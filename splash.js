// (round 19, splash) The loading screen. Its picture and colors are inline in index.html (<style id="splash-css">,
// <div id="splash">), so they paint in the window's first frame with nothing else loaded; main.js keeps the window
// hidden until that frame is drawn ('ready-to-show'), on the same background color, so there's no white flash.
// This file (the first script to run) moves the bar along real milestones and takes the splash away:
//   shell     every always-loaded script has run (DOMContentLoaded)
//   chats     your chats, history and settings are read (start.js)
//   ready     the first screen is up ('hearth:ready'): the splash fades out (≈ 0.2 s; at once with reduced motion)
//   features  the features that load after the first screen are in (lazy.js): a 2 px line along the top edge,
//             only while they're still loading, then gone
// If a step takes longer than usual, the splash says what it's waiting for (a sync pass, the engine check, a read of
// saved data…), and after a start error it offers to go on anyway. It never stays longer than the first screen needs.
// Splash.track(what, promise) names a startup wait; Splash.step(name); Splash.state() (dev: marks, waits, timings).
// Dev: localStorage 'splash.hold' = '1' keeps the splash up (for a screenshot of it).
const Splash = (() => {
  const T0 = performance.now();
  const root = document.getElementById('splash');
  const STEPS = { paint: 0.1, shell: 0.38, chats: 0.72, ready: 1 };
  const SAY = { paint: 'Starting…', shell: 'Reading your chats…', chats: 'Opening your last view…', ready: 'Ready' };
  // what a slow wait is, in plain words
  const WAITS = {
    chats: 'reading your chats', history: 'reading your history', settings: 'reading your settings',
    engines: 'checking where Claude Code and Codex are installed', kv: 'reading saved data', look: 'loading your look',
  };
  const SLOW_MS = 2500; // "taking longer than usual" after this long on one step
  const GIVE_UP_MS = 15000; // the first screen never waits behind the splash longer than this
  const marks = {};
  const pending = new Map(); // what → the promise
  let done = false; let err = null; let slowTimer = 0; let lastStep = 'paint';
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  let hold = false;
  try { hold = localStorage.getItem('splash.hold') === '1'; } catch { /* no storage */ }

  const $q = (s) => root?.querySelector(s);
  function mark(name) {
    if (marks[name] != null) return;
    marks[name] = Math.round(performance.now());
    try { performance.mark(`splash:${name}`); } catch { /* old engine */ }
  }
  function setBar(p) {
    const f = $q('.sp-fill');
    if (f) f.style.transform = `scaleX(${p})`;
    root?.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }
  function step(name) {
    if (!(name in STEPS) || marks[name] != null) return;
    mark(name);
    if (!root || done) return;
    lastStep = name;
    setBar(STEPS[name]);
    const s = $q('.sp-step');
    if (s && SAY[name]) s.textContent = SAY[name];
    armSlow();
    // the look's own stylesheet (Swirl) still loading: a moment more (≤ 0.6 s), so the first screen shows up styled
    if (name === 'ready') Promise.race([pending.get('look'), new Promise((r) => setTimeout(r, 600))]).then(() => finish());
  }

  // ---------- taking longer than usual ----------
  function armSlow() {
    clearTimeout(slowTimer);
    root?.classList.remove('slow');
    slowTimer = setTimeout(slow, SLOW_MS);
  }
  async function slow() {
    if (done || !root) return;
    const what = [...pending.keys()].map((k) => WAITS[k] || k);
    // the main process knows about waits the page can't see (a sync pass from your other computer)
    let main = null;
    try { main = await Promise.race([window.hub?.bootStatus?.(), new Promise((r) => setTimeout(() => r('busy'), 1200))]); } catch { /* old main.js */ }
    if (done) return;
    if (main === 'busy') what.unshift('the app’s main process to answer');
    else if (main?.syncing) what.unshift(`a sync pass with ${main.syncing}`);
    if (main?.reads?.length) what.push(`saved data (${main.reads.slice(0, 3).join(', ')})`);
    if (hold) what.push('nothing: the splash is held for a test (localStorage splash.hold)');
    const line = $q('.sp-slow');
    if (line) line.textContent = `Taking longer than usual… ${what.length ? `waiting for ${[...new Set(what)].join(', ')}` : lastStep === 'paint' ? 'loading Hearth’s scripts' : 'building the first screen'}.`;
    root.classList.add('slow');
    showGo();
    slowTimer = setTimeout(slow, 2000); // keep the reason current
  }
  function showGo() {
    const go = $q('.sp-go');
    if (!go || !go.hidden) return;
    go.hidden = false;
    go.onclick = () => finish(true);
  }

  // ---------- away ----------
  function finish(force) {
    if (done || (hold && !force)) return;
    done = true;
    clearTimeout(slowTimer);
    mark('gone');
    if (!root) return;
    const gone = () => root.remove(); // (#splash-css stays: it also styles the features line)
    if (reduced()) { gone(); return; }
    root.classList.add('out');
    root.addEventListener('transitionend', (e) => { if (e.target === root) gone(); });
    setTimeout(gone, 400); // (no transitionend when the window is hidden)
  }

  // ---------- after the first screen: the features still loading, as a hairline along the top ----------
  function featuresLine() {
    const soon = () => (window.Lazy ? Lazy.state().filter((g) => g.tier === 'soon') : []);
    const left = () => soon().filter((g) => g.state !== 'loaded' && g.state !== 'failed').length;
    const all = soon().length;
    if (!all || !left()) { mark('features'); return; }
    let line = null;
    const show = setTimeout(() => {
      if (!left()) return;
      line = document.createElement('div');
      line.id = 'boot-line';
      line.setAttribute('aria-hidden', 'true');
      document.body.append(line);
      upd();
    }, 150); // only if they're still loading a moment after the first screen
    const upd = () => { if (line) line.style.transform = `scaleX(${Math.max(0.05, (all - left()) / all)})`; };
    const on = () => {
      upd();
      if (left()) return;
      removeEventListener('hearth:lazy', on);
      clearTimeout(show);
      mark('features');
      if (!line) return;
      const l = line;
      l.classList.add('out');
      setTimeout(() => l.remove(), reduced() ? 0 : 450);
    };
    addEventListener('hearth:lazy', on);
  }

  // ---------- wiring ----------
  function track(what, promise) {
    const key = String(what);
    pending.set(key, promise);
    const end = () => pending.delete(key);
    Promise.resolve(promise).then(end, end);
    return promise;
  }
  if (root) {
    mark('start'); // the first script: the splash is already in the page (first in <body>), its frame due now
    armSlow();
    addEventListener('DOMContentLoaded', () => step('shell'), { once: true });
    addEventListener('hearth:ready', () => { step('ready'); featuresLine(); }, { once: true });
    // an error before the first screen: say so and let you in
    const onErr = (e) => {
      if (done || marks.ready != null) return;
      err = e?.message || e?.reason?.message || String(e?.reason || 'unknown error');
      const line = $q('.sp-slow');
      if (line) line.textContent = `Something went wrong while starting: ${err}`;
      root.classList.add('slow', 'failed');
      showGo();
    };
    addEventListener('error', onErr);
    addEventListener('unhandledrejection', onErr);
    addEventListener('hearth:ready', () => { removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr); }, { once: true });
    setTimeout(() => finish(), GIVE_UP_MS);
  } else {
    addEventListener('hearth:ready', featuresLine, { once: true });
  }

  // ---------- /startup: how long this start took, step by step (and the last few starts) ----------
  const HIST = 'splash.starts';
  const fmt = (ms) => (ms == null || !Number.isFinite(ms) ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
  async function timings() {
    let main = null;
    try { main = await window.hub?.bootStatus?.(); } catch { /* old main.js */ }
    const t = main?.times || {};
    const off = t.wall0 ? performance.timeOrigin - t.wall0 : null; // this page's clock → ms since the app launched
    const at = (k) => (marks[k] == null || off == null ? null : marks[k] + off);
    const reloaded = off != null && t.shown != null && off > t.shown + 1500; // the window was reloaded since the launch
    return { t, at, reloaded, syncOn: Boolean(main?.syncOn) };
  }
  function remember({ t, at, reloaded }) {
    if (reloaded || !t.wall0) return;
    try {
      const h = JSON.parse(localStorage.getItem(HIST) || '[]').filter((x) => x && x.launch !== t.wall0);
      h.push({ launch: Math.round(t.wall0), shown: t.shown ?? null, ready: Math.round(at('ready') ?? 0) || null, features: Math.round(at('features') ?? 0) || null, sync: t.syncMs ?? null });
      localStorage.setItem(HIST, JSON.stringify(h.slice(-12)));
    } catch { /* no storage: /startup still shows this start */ }
  }
  addEventListener('hearth:ready', () => {
    const save = () => timings().then(remember).catch(() => {});
    if (marks.features != null) save(); else addEventListener('hearth:lazy', function on() { if (marks.features == null) return; removeEventListener('hearth:lazy', on); save(); });
  }, { once: true });
  async function report() {
    const r = await timings();
    const { t, at } = r;
    const steps = [['app ready', t.appReady], ['window made', t.window], ['first frame (the loading screen)', t.firstFrame], ['on screen', t.shown],
      ['scripts in', at('shell')], ['chats read', at('chats')], ['first screen ready', at('ready')], ['every feature loaded', at('features')]];
    const lines = [`**This start** (from launch${r.reloaded ? '; the window was reloaded since, so the page steps are from the reload' : ''}):`,
      steps.filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(' → ')];
    lines.push(r.syncOn ? `Sync pass at launch: ${fmt(t.syncMs)} (your data waited for it; the window didn't)` : 'Sync at launch: off');
    if (err) lines.push(`A start error was shown: ${err}`);
    let h = [];
    try { h = JSON.parse(localStorage.getItem(HIST) || '[]'); } catch { /* none */ }
    if (h.length > 1) {
      const med = (k) => { const xs = h.map((x) => x[k]).filter(Number.isFinite).sort((a, b) => a - b); return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null; };
      lines.push(`**Last ${h.length} starts**, typical: on screen ${fmt(med('shown'))} · first screen ${fmt(med('ready'))} · every feature ${fmt(med('features'))}`);
    }
    return lines.join('\n');
  }
  addEventListener('DOMContentLoaded', () => {
    if (typeof Commands !== 'undefined' && !Commands.get('startup')) {
      Commands.register({
        name: 'startup', aliases: ['boot-time'], area: 'App', keywords: 'loading screen splash launch slow start open time',
        desc: 'How long Hearth took to open, step by step (window, loading screen, chats, first screen, features)',
        run: () => report(),
      });
    }
    if (typeof AppUI !== 'undefined') AppUI.addAction?.('Startup: how long Hearth took to open', () => Commands.exec('/startup'));
  }, { once: true });

  return {
    step, track, finish: () => finish(true),
    state: () => ({ marks: { ...marks }, pending: [...pending.keys()], done, error: err, t0: Math.round(T0), shown: Boolean(document.getElementById('splash')) }),
  };
})();
window.Splash = Splash; // (start.js and others reach it as window.Splash?.…)
