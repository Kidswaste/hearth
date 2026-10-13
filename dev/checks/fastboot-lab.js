// (round 29, fastboot) Opening the Lab → its first frame, as a timeline (ms from the click on the Lab's rail button):
//   group     the Lab's files are in (0 when they had loaded after the first screen, as usual); press: a real press
//             (mouse down, 100 ms, up) on its rail button, times from the press
//   tool      the Lab tool is built (its preview frame is in the page)
//   nav       the preview page starts loading · parsed: its DOMContentLoaded · ready: its 'ready' message (three.js in,
//             the page set up) · ran: the scene's code ran · drawn: 'stack-drawn' (every layer drew its first frame)
// plus the preview page's own costs (script / parse time it reports, its JS heap) and the hub's busy time meanwhile.
// One sample per launch (the second open is a different, warm path); run it a few times for medians:
//   node dev/smoke.js --script dev/checks/fastboot-lab.js            (localStorage 'fastboot.cold' = '1': the Lab's
//   files not loaded yet when it's opened, the "opened in the first second" case)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(20); } return false; };
const cold = (() => { try { return localStorage.getItem('fastboot.cold') === '1'; } catch { return false; } })();
await until(() => performance.getEntriesByName('hearth:ready').length);
if (!cold) { await window.Lazy?.load('lab'); await until(() => !window.Lazy || Lazy.state().every((g) => g.tier === 'use' || g.state !== 'stub' && g.state !== 'loading'), 15000); await wait(1500); }
const out = { cold };
const t = {};
let t0 = 0;
const at = (k) => { if (t[k] == null) t[k] = Math.round(performance.now() - t0); };
addEventListener('message', (e) => {
  const d = e.data;
  if (d?.source !== 'three-sandbox') return;
  if (d.type === 'ready') at('ready');
  if (d.type === 'ran') at('ran');
  if (d.type === 'stack-drawn') at('drawn');
  if (log.length < 40) log.push(`${Math.round(performance.now() - t0)} ${d.type}${d.type === 'console' ? `: ${String(d.text).slice(0, 80)}` : ''}`);
});
const log = [];
// main-thread busy time of the hub while the Lab opens (long-task API: tasks > 50 ms)
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (t0 && e.startTime >= t0) longs.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch { /* no API */ }
const mo = new MutationObserver(() => { if (document.querySelector('iframe[src*="three-sandbox"]')) { at('tool'); mo.disconnect(); } });
mo.observe(document.body, { childList: true, subtree: true });
// a real press on the Lab's rail button: down, 100 ms (a quick human click), up (times count from the press)
const btn = document.querySelector('#agent-buttons .agent-btn[data-id="tool:three"]');
if (btn && typeof smoke === 'function') {
  const r = btn.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
  let down = 0; let up = 0;
  btn.addEventListener('pointerdown', (e) => { down ||= e.timeStamp; }, { capture: true, once: true });
  btn.addEventListener('click', (e) => { up ||= e.timeStamp; }, { capture: true, once: true });
  t0 = performance.now();
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } });
  if (down) { const shift = down - t0; t0 = down; for (const k of Object.keys(t)) t[k] -= Math.round(shift); }
  await wait(Math.max(0, 100 - (performance.now() - t0)));
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } });
  out.press = true; out.click = up ? Math.round(up - t0) : null;
} else { t0 = performance.now(); activate('tool:three'); }
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director).then(() => at('group'));
await until(() => t.drawn != null, 30000);
await wait(300);
// the preview page's own timeline, put on the hub's clock (both pages share the process's time origin space)
try {
  const r = await ThreeLab.director.evalInSketch(`const n = performance.getEntriesByType('navigation')[0]; const rs = performance.getEntriesByType('resource'); return [performance.timeOrigin, n ? n.domContentLoadedEventEnd : 0, performance.memory ? performance.memory.usedJSHeapSize : 0, rs.length, Math.max(0, ...rs.map((x) => x.responseEnd))].join(' ');`);
  const v = String(r?.value ?? r ?? '').replace(/^"|"$/g, '').split(' ').map(Number);
  const p = { origin: v[0], dcl: v[1], heap: Math.round(v[2] / 1e5) / 10, res: v[3], resEnd: v[4] };
  if (!Number.isFinite(p.origin)) throw new Error(`eval: ${JSON.stringify(r).slice(0, 200)}`);
  const shift = p.origin - performance.timeOrigin - t0; // the page's 0 on our clock, from the click
  out.nav = Math.round(shift);
  out.parsed = Math.round(shift + (p.dcl || 0));
  out.pageHeapMB = p.heap; out.pageResources = p.res; out.resourcesDone = Math.round(shift + p.resEnd);
} catch (err) { out.pageErr = String(err.message || err); }
Object.assign(out, t, { hubLongTasks: longs.length, hubLongMs: longs.reduce((a, b) => a + b, 0) });
if (localStorage.getItem('fastboot.log') === '1') out.log = log;
return `[FASTBOOT-LAB]${JSON.stringify(out)}`;
