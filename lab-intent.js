// (round 94, labload94) When the Lab's code loads. The Lab (lazy group 'lab', ≈ 3.4 MB of code) used to load right
// after the first frame of every start (≈ 200–350 ms of the window's time), even when the Lab wasn't opened that
// session. Its commands, keys, rail button, agent tools and Ctrl/⌘+K lines are stand-ins (lazy.js) that load it on
// first use, so it can wait. This file decides when it loads, without making the first open wait:
//   now    right after the first frame, as before: the last start ended in the Lab, or Hearth opens on it
//   calm   in the background 5 s after the first screen (1.5 s without input), paced in idle moments: the
//          Lab was opened in at least half of the last 8 starts, or the newest project was left on its Scene
//   idle   the same, but ≥ 40 s after the first screen and 3 s without a key / click / scroll: the Lab was used in the
//          last 14 days, less often
//   none   only on intent: not used in 14 days
// and at once, whatever the mode, on intent: the pointer on (or focus to) a button that opens the Lab (the rail, a
// project's Scene, a chat code block's ▶ Apply to scene / Open in Three.js Lab), a Lab line among the first rows of
// Ctrl/⌘+K, the Lab shown. A history it can't read counts as "calm" (it behaves as for someone who uses the Lab).
// The warm preview page (tools/three-boot.js) follows the Lab's code as before. Tests: localStorage 'lazy.lab.mode'
// = now | calm | idle | none forces a mode; LabIntent.state() says what happened.
const LabIntent = (() => {
  const G = 'lab'; const SURFACE = 'tool:three'; const DAY = 864e5; const KEEP = 8; const IDLE_AFTER = 40000; const CALM_AFTER = 5000; const QUIET = 3000;
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* no storage */ } return null; };
  const json = (k) => { const raw = ls(k); return raw == null ? null : JSON.parse(raw); };
  const st = { mode: null, why: '', intent: null, intentAt: null, prefetchAt: null, shownAt: null, inWhenShown: null };
  const ready = () => performance.getEntriesByName('hearth:ready')[0]?.startTime || 0;
  const lazyOk = () => Boolean(window.Lazy?.prefetch);
  const isIn = () => !lazyOk() || Lazy.loaded(G);

  // ---------- this start in the history: did it open the Lab? ----------
  let past = null; // the last starts, 1 = the Lab was shown; null = unreadable
  try { const a = json('lazy.lab.starts'); past = Array.isArray(a) ? a.slice(-KEEP).map((x) => (x ? 1 : 0)) : a == null ? [] : null; } catch { past = null; }
  const lastView = ls('lazy.lab.lastView');
  const hist = [...(past || []), 0].slice(-KEEP);
  ls('lazy.lab.starts', JSON.stringify(hist));
  let view = lastView;

  function go(why) {
    if (isIn()) return;
    if (!st.intent) { st.intent = why; st.intentAt = Math.round(performance.now()); }
    Lazy.load(G).catch(() => {});
  }

  // ---------- the mode for this start ----------
  function projectOnLab() {
    const pts = Object.values(json('hub.workspace.returnPoints') || {}).filter((x) => x && typeof x === 'object');
    const p = pts.sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    return Boolean(p && p.tab === 'scene' && p.at > Date.now() - 14 * DAY);
  }
  function decide() {
    const forced = ls('lazy.lab.mode');
    if (/^(now|calm|idle|none)$/.test(forced || '')) return [forced, 'set for a test'];
    if (lastView === '1') return ['now', 'the last start ended in the Lab'];
    try { if (H.settings?.().startOn === SURFACE) return ['now', 'Hearth opens on the Lab']; } catch { /* no settings yet */ }
    if (past == null) return ['calm', 'its history could not be read'];
    const used = past.filter(Boolean).length;
    if (past.length >= 2 && used * 2 >= past.length) return ['calm', `opened in ${used} of the last ${past.length} starts`];
    try { if (projectOnLab()) return ['calm', 'the newest project was left on its scene']; } catch { return ['calm', 'the projects could not be read']; }
    let t = 0; try { t = Number(json('hub.labboot.used')) || 0; } catch { return ['calm', 'its last use could not be read']; }
    if (used || t > Date.now() - 14 * DAY) return ['idle', 'used in the last 14 days'];
    return ['none', 'not used in the last 14 days'];
  }

  // ---------- in the background ----------
  let lastInput = 0;
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = performance.now(); }, { capture: true, passive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function background(idleMode) {
    // calm: 5 s after the first screen and 1.5 s without input (ahead of the calm start's other groups, so an open
    // about 10 s in finds it in; measured: docs/upgrades/labload94.md) · idle: the calm start first (≤ 30 s), the other
    // feature groups (≤ 6 s), then ≥ 40 s after the first screen and 3 s without input
    const until = async (at, quiet) => { for (;;) { const w = Math.max(ready() + at - performance.now(), lastInput + quiet - performance.now()); if (w <= 0) return; await sleep(Math.min(w + 20, 5000)); } };
    if (!idleMode) await until(CALM_AFTER, 1500);
    else {
      while (!Lazy.calm?.().open && performance.now() - ready() < 30000) await sleep(500);
      const t0 = performance.now();
      while (Lazy.state().some((g) => g.tier === 'soon' && (g.state === 'stub' || g.state === 'loading')) && performance.now() - t0 < 6000) await sleep(400);
      await until(IDLE_AFTER, QUIET);
    }
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 3000 }) : setTimeout(r, 200)));
    if (isIn() || st.intent) return;
    st.prefetchAt = Math.round(performance.now());
    Lazy.prefetch(G).catch(() => {});
  }

  // ---------- intent ----------
  const opensLab = (t) => {
    const e = t?.closest?.('[data-surface], .agent-btn[data-id], .code-act');
    if (!e) return false;
    if (e.classList.contains('code-act')) return ['apply', 'three', 'shader'].includes(e.dataset.act);
    const id = e.dataset.surface || e.dataset.id;
    return id === SURFACE || H.surfaceIdFor?.(id) === SURFACE;
  };
  // (pointermove, not pointerover: a pointer resting where a button is drawn isn't intent, nor Chromium's own moves after
  // a layout or a scroll, which have no movement; each new target looked at once)
  let lastT = null;
  const onPoint = (e) => { if (e.type === 'pointermove' && !e.movementX && !e.movementY) return; if (e.target === lastT) return; lastT = e.target; if (opensLab(e.target)) go(e.type === 'focusin' ? 'focus' : 'pointer'); };
  // Ctrl/⌘+K (appui.js paletteRender, something typed): a Lab line among the first three rows
  function isLabRow(it) {
    const id = String(it?.id || '');
    const cmd = id.startsWith('p:/') ? id.slice(3) : it?.cmdName;
    if (cmd && Lazy.groupOf(cmd) === G) return true;
    const label = id.startsWith('p:') ? id.slice(2) : id.startsWith('tl:') ? id.slice(3) : String(it?.label || '');
    if (Lazy.groupOfAction(label) === G) return true;
    const kind = id.startsWith('t:') ? id.slice(2, id.indexOf('|')) : it?.kind;
    return (typeof Tools !== 'undefined' ? Tools.all() : []).some((x) => x.__lazy === G && (x.name === label || x.name === kind));
  }
  function seen(rows) {
    if (isIn()) return;
    try { if ((rows || []).slice(0, 3).some(isLabRow)) go('palette'); } catch { /* a row it can't read */ }
  }
  // the Lab on screen: this start used it; the last surface shown is kept for the next start
  function onActivate(e) {
    const on = e.detail?.surfaceId === SURFACE ? '1' : '0';
    if (on !== view) { view = on; ls('lazy.lab.lastView', on); }
    if (on !== '1') return;
    if (st.shownAt == null) { st.shownAt = Math.round(performance.now()); st.inWhenShown = isIn(); }
    if (!hist[hist.length - 1]) { hist[hist.length - 1] = 1; ls('lazy.lab.starts', JSON.stringify(hist)); }
    go('shown');
  }

  function init() {
    if (!lazyOk()) return; // (the manifest's copy of the old order has no lazy.js)
    document.addEventListener('hearth:activate', onActivate);
    if (H.surfaceIdFor?.(H.activeId) === SURFACE) onActivate({ detail: { surfaceId: SURFACE } });
    if (isIn()) return;
    const [mode, why] = decide();
    st.mode = mode; st.why = why;
    document.addEventListener('pointermove', onPoint, { capture: true, passive: true });
    document.addEventListener('focusin', onPoint, { capture: true, passive: true });
    window.Lazy.when(G, () => { document.removeEventListener('pointermove', onPoint, { capture: true }); document.removeEventListener('focusin', onPoint, { capture: true }); });
    if (mode === 'now') go('start');
    else if (mode !== 'none') background(mode === 'idle').catch(() => {});
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init, { once: true }); else init();

  return { seen, go, state: () => ({ ...st, past: past && past.slice(), loaded: isIn() }) };
})();
window.LabIntent = LabIntent;
