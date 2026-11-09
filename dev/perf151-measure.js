// (round 151, perf151) the whole-app cost table (docs/upgrades/perf151.md): Hearth as the owner uses it, measured.
// Not a check (dev/checks/perf151.js asserts the wins): a smoke.js script that reports, per setup, every process' CPU
// (ms a second) and memory, the window's wakeups by where they were asked for (timers, frames, observers), its
// style / layout / script time, what is painted, the CSS animations still running (seen or not), and the compositing
// suspects on screen (backdrop-filter, filters, will-change: count and area).
// Setups: a project chat open, idle · the Lab with the real scene (realscene-lib: the bundled Beat burst demo, a model,
// a song) playing · the Lab paused · Hearth hidden after the Lab. Run it twice: calm, and with --burn 3 (a busy PC).
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/perf151-measure.js [--burn 3]
// Prints one "[PERF151] {json}" line at the end (and returns it).
// (round 153a, lite153) Lite mode on for the whole run: add --eval "localStorage.setItem('hub.lite', 'true')" (the evals run
// before the script, and its reload keeps it); out.lite says which, each setup also counts the window's composited layers.
const probe = () => {
  if (window.__pfProbe) return;
  const P = window.__pfProbe = { n: 0, by: new Map(), since: performance.now(), raw: { setTimeout: window.setTimeout.bind(window) } };
  const site = () => {
    const s = String(new Error().stack || '').split('\n').slice(3).filter((x) => /\.(js|html)/.test(x));
    const f = (l) => (l || '?').trim().replace(/^at\s+/, '').replace(/\(?[^()]*\/([^/]+\.(?:js|html)):(\d+):\d+\)?/, '$1:$2').slice(0, 70);
    return /\/(ui|powerwise)\.js:/.test(s[0] || '') && s[1] ? `${f(s[0])} < ${f(s[1])}` : f(s[0]);
  };
  const count = (k) => { P.n += 1; P.by.set(k, (P.by.get(k) || 0) + 1); };
  for (const [name, kind] of [['setTimeout', 'timeout'], ['setInterval', 'interval'], ['requestAnimationFrame', 'raf'], ['requestIdleCallback', 'idle']]) {
    const orig = window[name];
    if (!orig) continue;
    window[name] = function (fn, ...rest) {
      if (typeof fn !== 'function') return orig.call(window, fn, ...rest);
      const k = `${kind} ${site()}`;
      return orig.call(window, function (...a) { count(k); return fn.apply(this, a); }, ...rest);
    };
  }
  for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const Orig = window[name];
    if (!Orig) continue;
    window[name] = class extends Orig { constructor(fn, ...rest) { const k = `${name} ${site()}`; super(function (...a) { count(k); return fn.apply(this, a); }, ...rest); } };
  }
  P.take = () => {
    const ms = performance.now() - P.since;
    const per = (x) => Math.round(x * 10000 / ms) / 10;
    const out = { perSec: per(P.n), top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${per(v)}/s ${k}`) };
    P.n = 0; P.by.clear(); P.since = performance.now();
    return out;
  };
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
localStorage.setItem('idlecpu.hushMs', '8000'); // (the owner away: the minute before the hush shortened, the same before and after)
return 'probe installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const P = window.__pfProbe;
const T = (o) => window.hub.power.test(o);
const MEASURE = Number(window.PF_MS || 10000);
const out = { burn: window.SMOKE_BURN || 0, lite: Boolean(window.HearthLite?.on), setups: {}, notes: [] };
const r1 = (x) => Math.round(x * 10) / 10;
const sbx = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: `(() => { ${expr} })()`, returnByValue: true } }))?.result?.value;
const label = (m, pid) => {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'window';
  if (pages.some((p) => /three-sandbox/.test(p.url))) return 'lab preview';
  if (pages.length) return `page ${pages[0].type} ${pages[0].url.split('/').pop().slice(0, 30)}`;
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : `${pr.type.toLowerCase()}${pr.name ? ` ${pr.name}` : ''}`;
};
const met = async () => (await T({ metrics: true }))?.metrics || { procs: [], pages: [] };
const perf = async (target) => { const r = await smoke(target ? { cdp: 'Performance.getMetrics', target } : { cdp: 'Performance.getMetrics' }); const o = {}; for (const m of r?.metrics || []) o[m.name] = m.value; return o; };
function anims() {
  const list = document.getAnimations().filter((a) => a.playState === 'running');
  const desc = (a) => {
    const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement;
    const id = n ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}.${String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/).slice(0, 2).join('.')}` : '?';
    const seen = n ? n.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && n.getBoundingClientRect().width > 0 : false;
    return `${a.animationName || a.transitionProperty || 'anim'} ${id}${a.effect?.getTiming?.().iterations === Infinity ? ' ∞' : ''}${seen ? '' : ' (unseen)'}`;
  };
  return { n: list.length, infinite: list.filter((a) => a.effect?.getTiming?.().iterations === Infinity).length, unseen: list.filter((a) => { const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement; return !n || !n.checkVisibility({ visibilityProperty: true, opacityProperty: true }); }).length, list: list.slice(0, 14).map(desc) };
}
// what asks the compositor for its own layer / an expensive effect, on screen now
function suspects() {
  const res = { backdrop: { n: 0, kpx: 0, top: [] }, filter: { n: 0, kpx: 0, top: [] }, willChange: { n: 0, kpx: 0, top: [] }, bigShadow: { n: 0 }, fixed: { n: 0, kpx: 0 } };
  const vw = innerWidth; const vh = innerHeight;
  const name = (n) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}.${String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/).slice(0, 2).join('.')}`;
  for (const n of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none') continue;
    const r = n.getBoundingClientRect();
    const w = Math.max(0, Math.min(vw, r.right) - Math.max(0, r.left)); const h = Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top));
    const a = (w * h) / 1000;
    if (!(a > 0) || cs.visibility === 'hidden') continue;
    const add = (k) => { res[k].n += 1; res[k].kpx += a; if (res[k].top) res[k].top.push([Math.round(a), name(n)]); };
    if (cs.backdropFilter && cs.backdropFilter !== 'none') add('backdrop');
    if (cs.filter && cs.filter !== 'none' && /blur|drop-shadow/.test(cs.filter)) add('filter');
    if (cs.willChange && cs.willChange !== 'auto') add('willChange');
    if (cs.position === 'fixed' && a > 200) { res.fixed.n += 1; res.fixed.kpx += a; }
    if (cs.boxShadow && cs.boxShadow !== 'none' && /(\d{2,})px\s+(\d{2,})px/.test(cs.boxShadow) && a > 50) res.bigShadow.n += 1;
  }
  for (const v of Object.values(res)) { if (v.kpx != null) v.kpx = Math.round(v.kpx); if (v.top) v.top = v.top.sort((x, y) => y[0] - x[0]).slice(0, 6).map(([k, s]) => `${k}k ${s}`); }
  return res;
}
async function measure(name, { trace = true, target = null } = {}) {
  await smoke({ cdp: 'Performance.enable' }); if (target) await smoke({ cdp: 'Performance.enable', target });
  const snap = await smoke({ loadwait: 'snap' });
  const m0 = await met(); const w0 = await perf(); const s0 = target ? await perf(target) : null;
  const pace0 = target ? await sbx('return window.__labPace ? window.__labPace.state() : null') : null;
  P.take(); await T({ probe: 'start' });
  const t0 = performance.now();
  await new Promise((r) => P.raw.setTimeout(r, MEASURE));
  const page = P.take(); const main = (await T({ probe: 'take' }))?.probe;
  const m1 = await met(); const w1 = await perf(); const s1 = target ? await perf(target) : null;
  const pace1 = target ? await sbx('return window.__labPace ? window.__labPace.state() : null') : null;
  const sec = (performance.now() - t0) / 1000;
  const lw = await smoke({ loadwait: 1, since: snap.snap });
  const procs = {}; let all = 0; let mem = 0;
  for (const p1 of m1.procs) {
    const p0 = m0.procs.find((x) => x.pid === p1.pid);
    const k = label(m1, p1.pid);
    const cur = procs[k] ||= { msPerSec: 0, mb: 0, n: 0 };
    cur.n += 1; cur.mb += Math.round((p1.mem || 0) / 1024); mem += (p1.mem || 0) / 1024;
    if (p0 && p1.cpuS != null) { const ms = ((p1.cpuS - p0.cpuS) / sec) * 1000; cur.msPerSec += ms; all += ms; }
  }
  for (const v of Object.values(procs)) v.msPerSec = r1(v.msPerSec);
  const d = (a, b, k) => (a?.[k] != null && b?.[k] != null ? r1(((b[k] - a[k]) * 1000) / sec) : null);
  const lay = await smoke({ layers: true }).catch(() => null); // (round 153a) the window's composited layers now
  const r = { sec: r1(sec), layers: lay ? { count: lay.count, drawing: lay.drawing } : null, allMsPerSec: r1(all), allMb: Math.round(mem), procCount: m1.procs.length, procs,
    window: { task: d(w0, w1, 'TaskDuration'), script: d(w0, w1, 'ScriptDuration'), style: d(w0, w1, 'RecalcStyleDuration'), layout: d(w0, w1, 'LayoutDuration'), heapMb: Math.round((w1.JSHeapUsedSize || 0) / 1048576), nodes: w1.Nodes, listeners: w1.JSEventListeners },
    wakeups: page, mainTimers: { perMin: main?.perMin, top: main?.top?.slice(0, 6) }, anims: anims(), suspects: suspects(), visibility: document.visibilityState,
    load: { loadavg: lw?.loadavg?.map((x) => Math.round(x * 100) / 100), cpus: lw?.cpus, cpuWait: lw?.waited?.cpuWait } };
  if (target && s0 && s1) r.preview = { task: d(s0, s1, 'TaskDuration'), script: d(s0, s1, 'ScriptDuration'), drawnPerSec: pace0 && pace1 ? r1((pace1.drawn - pace0.drawn) / sec) : null, framesPerSec: pace0 && pace1 ? r1((pace1.frameTick - pace0.frameTick) / sec) : null };
  if (trace) {
    await smoke({ trace: 'start', detail: true }); await new Promise((res) => P.raw.setTimeout(res, 3000));
    const tr = await smoke({ trace: 'stop', detail: true });
    r.paint = { framesPerSec: r1((tr.detail?.frames?.n || 0) / 3), paintsPerSec: r1(tr.paints / 3), paintMsPerSec: r1(tr.paintMs / 3), rasterMsPerSec: r1(tr.rasterMs / 3), layerizeMsPerSec: r1(tr.layerizeMs / 3), stylesPerSec: r1(tr.styles / 3), layoutsPerSec: r1(tr.layouts / 3), top: (tr.top || []).slice(0, 3) };
  }
  out.setups[name] = r;
  console.log(`[PERF151:${name}]`, JSON.stringify(r));
  return r;
}

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
out.readyMs = Math.round(performance.getEntriesByName('hearth:ready')[0]?.startTime || 0);
// the owner's look (Forgeheart)
try { H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' }; delete H.config.theme.label; delete H.config.theme.group; applyTheme(document.getElementById('user-theme').textContent); } catch (err) { out.notes.push(`theme: ${err.message}`); }
// a project chat open, one reply in it
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); await until(() => ProjChats._ok(), 20000);
const proj = Projects.create({ name: 'Perf151 project' }); ProjChats.setScope(proj.id);
const claude = H.claudeAgent();
activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
await Native.send(claude.id, 'hello there, a short reply please');
await until(() => !Native.isAgentBusy(claude.id), 30000);
document.activeElement?.blur?.();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: 600, button: 'none' } });
// (the start's one-off work first: the recall index ≈ 45 s after the start, the warm Lab page)
await until(() => performance.now() > Number(window.PF_SETTLE || 70000), 120000);
await smoke({ cdp: 'HeapProfiler.collectGarbage' }); await wait(1500);
await measure('chat idle');

// the Lab: time to open, time to the preview's first drawn frame
const tl = performance.now();
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 60000);
out.labOpenMs = Math.round(performance.now() - tl);
await until(async () => (await sbx('return window.__labPace ? window.__labPace.state().drawn : 0')) > 0, 30000, 50);
out.labFirstFrameMs = Math.round(performance.now() - tl);
let info = null;
try { info = await RS.open({ size: [960, 540], particles: Number(window.PF_PARTICLES || 12) }); } catch (err) { out.notes.push(`RS.open: ${err.message}`); }
out.scene = info && { layers: info.layers, song: info.song, bpm: info.bpm };
await wait(4000);
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: 600, button: 'none' } });
await measure('lab playing', { target: 'three-sandbox' });
await RS.close(); await wait(4000);
await until(() => document.documentElement.hasAttribute('data-hush'), 20000); await wait(1500); // (nobody using Hearth: the song stopped, the scene still moving)
await measure('lab paused', { target: 'three-sandbox' });
// the same scene small enough for this software GPU to keep ~60 fps: the Lab window's own work per preview frame at the
// rate the owner's graphics card gives it (the window follows the preview's frames)
try { const c = await ThreeLab.cmd(); c.customSize(256, 144); c.size('custom'); await wait(2500); c.seek(1); await wait(200); c.play(true); } catch (err) { out.notes.push(`light: ${err.message}`); }
await wait(5000);
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: 600, button: 'none' } });
await measure('lab playing 60fps', { target: 'three-sandbox' });
await RS.close(); await wait(1500);
// Hearth hidden (tray / minimized) after using the Lab
await T({ window: 'hide' });
await until(() => document.visibilityState === 'hidden', 5000);
await wait(3000);
await measure('hidden', { trace: false, target: 'three-sandbox' });
await T({ window: 'show' }); await wait(800);
out.windows = (await T({ windows: true }))?.windows;
console.log('[PERF151]', JSON.stringify(out));
return JSON.stringify({ ok: true, ...out });
