// (round 153, trim153) What switching off every optional feature saves at the start and at rest (docs/upgrades/trim153.md).
// Not a check: a smoke.js script with two runs of the same app, everything on, then every switchable feature off (Trim
// Hearth's setting), each from a fresh reload: the groups loaded right after the first frame and once the start is
// over (count and KB of code), the repeating timers alive, the window's wakeups a second at rest, the JS heap, DOM nodes.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/trim153-measure.js
// Prints "[TRIM153] {json}" at the end.
const probe = () => {
  if (window.__trProbe) return;
  const P = window.__trProbe = { live: new Map(), wake: 0 };
  const si = window.setInterval; const ci = window.clearInterval;
  window.setInterval = function (fn, ms, ...rest) {
    const site = String(new Error().stack || '').split('\n').slice(2).find((l) => /\.js/.test(l)) || '?';
    const id = si.call(window, typeof fn === 'function' ? function (...a) { P.wake += 1; return fn.apply(this, a); } : fn, ms, ...rest);
    P.live.set(id, `${ms}ms ${site.trim().replace(/^at\s+/, '').replace(/\(?[^()]*\/([^/]+\.js):(\d+):\d+\)?/, '$1:$2').slice(0, 60)}`);
    return id;
  };
  window.clearInterval = function (id) { P.live.delete(id); return ci.call(window, id); };
  for (const name of ['setTimeout', 'requestAnimationFrame', 'requestIdleCallback']) {
    const orig = window[name];
    if (!orig) continue;
    window[name] = function (fn, ...rest) { return orig.call(window, typeof fn === 'function' ? function (...a) { P.wake += 1; return fn.apply(this, a); } : fn, ...rest); };
  }
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
localStorage.removeItem('hub.trim.off');
return 'probe installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const measure = async () => {
  await until(() => window.Lazy && Lazy.state().some((g) => g.state === 'loaded'));
  await wait(2500);
  const asap = Lazy.state().filter((g) => g.state === 'loaded').map((g) => g.name);
  Lazy.calmNow();
  await until(() => Lazy.state().filter((g) => g.tier === 'soon' && !g.off).every((g) => g.state === 'loaded'));
  await wait(4000);
  const start = Lazy.state().filter((g) => g.state === 'loaded').map((g) => g.name);
  const P = window.__trProbe; P.wake = 0;
  await wait(10000);
  const wakePerSec = Math.round(P.wake / 10 * 10) / 10;
  const intervals = [...P.live.values()];
  await Lazy.load('trim');
  const kb = (list) => list.reduce((a, g) => a + (TrimData.KB[g] || 0), 0);
  return { off: HearthFeatures.offIds().length, offGroups: Lazy.state().filter((g) => g.off).length, asapGroups: asap.length, asapKB: kb(asap), startGroups: start.length, startKB: kb(start), intervals: intervals.length, intervalSites: intervals, wakePerSec, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e5) / 10, domNodes: document.getElementsByTagName('*').length, scripts: document.scripts.length };
};
const on = await measure();
localStorage.setItem('trim153.measure.on', JSON.stringify(on));
localStorage.setItem('hub.trim.off', JSON.stringify(HearthFeatures.list().filter((f) => !f.core).map((f) => f.id)));
return { on };
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const measure = async () => {
  await until(() => window.Lazy && Lazy.state().some((g) => g.state === 'loaded'));
  await wait(2500);
  const asap = Lazy.state().filter((g) => g.state === 'loaded').map((g) => g.name);
  Lazy.calmNow();
  await until(() => Lazy.state().filter((g) => g.tier === 'soon' && !g.off).every((g) => g.state === 'loaded'));
  await wait(4000);
  const start = Lazy.state().filter((g) => g.state === 'loaded').map((g) => g.name);
  const P = window.__trProbe; P.wake = 0;
  await wait(10000);
  const wakePerSec = Math.round(P.wake / 10 * 10) / 10;
  const intervals = [...P.live.values()];
  await Lazy.load('trim');
  const kb = (list) => list.reduce((a, g) => a + (TrimData.KB[g] || 0), 0);
  return { off: HearthFeatures.offIds().length, offGroups: Lazy.state().filter((g) => g.off).length, asapGroups: asap.length, asapKB: kb(asap), startGroups: start.length, startKB: kb(start), intervals: intervals.length, intervalSites: intervals, wakePerSec, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e5) / 10, domNodes: document.getElementsByTagName('*').length, scripts: document.scripts.length };
};
const off = await measure();
const on = JSON.parse(localStorage.getItem('trim153.measure.on') || 'null');
localStorage.removeItem('hub.trim.off'); localStorage.removeItem('trim153.measure.on');
const res = { on, off };
console.log(`[TRIM153] ${JSON.stringify(res)}`);
return res;
