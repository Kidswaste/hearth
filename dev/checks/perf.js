// Perf: what a user feels, measured inside the page. Startup marks, memory, CSS size and style recalc cost,
// running animations / timers at idle, palette and "/" menu open time, first open of each tool, the Lab's frame time
// with a few filter layers and (with --fake-engines) a streaming reply's paint cost. dev/perf-report.js runs this
// too and adds the CDP numbers (script eval per file, long tasks, idle CPU) plus the budget check.
//   node dev/smoke.js --fake-engines --script dev/checks/perf.js --check-timeout 180000
// Set window.__perfQuick = true before running to skip the Lab and the streaming reply.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(16); } return false; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // after the next paint
const round = (n) => Math.round(n * 10) / 10;
const out = {};
// ---------- startup (navigation start = 0) ----------
const nav = performance.getEntriesByType('navigation')[0];
const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, round(p.startTime)]));
out.startup = {
  domContentLoaded: round(nav.domContentLoadedEventEnd), load: round(nav.loadEventEnd),
  firstPaint: paint['first-paint'], firstContentfulPaint: paint['first-contentful-paint'],
  ready: round(performance.getEntriesByName('hearth:ready')[0]?.startTime ?? NaN),
  scripts: document.scripts.length, stylesheets: document.styleSheets.length,
};
// ---------- memory and DOM ----------
out.memory = { jsHeapMB: round(performance.memory.usedJSHeapSize / 1048576), domNodes: document.getElementsByTagName('*').length };
// ---------- CSS ----------
let rules = 0, bytes = 0, has = 0, universal = 0;
const walk = (list) => { for (const r of list) { if (r.cssRules && !(r instanceof CSSStyleRule)) walk(r.cssRules); else { rules += 1; bytes += r.cssText.length; const s = r.selectorText || ''; if (s.includes(':has(')) has += 1; if (/(^|[\s>+~,(])\*(?![=])/.test(s)) universal += 1; } } };
for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* cross-origin */ } }
// a full style recalc: a custom property on :root invalidates every element (what a look / theme change costs)
const recalc = [];
for (let i = 0; i < 6; i++) { const t = performance.now(); document.documentElement.style.setProperty('--perf-probe', String(i)); document.body.offsetHeight; recalc.push(performance.now() - t); }
document.documentElement.style.removeProperty('--perf-probe');
recalc.sort((a, b) => a - b);
out.css = { rules, kb: round(bytes / 1024), hasSelectors: has, universalSelectors: universal, fullRecalcMs: round(recalc[3]) };
// ---------- idle: animations and work while nothing happens ----------
const running = () => document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.constructor.name}@${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? a.effect?.target?.tagName}`.slice(0, 80));
out.idle = { runningAnimations: running() };
{ // timeouts / rAF scheduled over 3 s at idle (wrapping the schedulers; intervals set earlier show up in perf-report's trace)
  const counts = { timeout: 0, interval: 0, raf: 0 };
  const st = window.setTimeout, si = window.setInterval, rf = window.requestAnimationFrame;
  const origins = {};
  const tag = (kind, fn) => function (...a) { counts[kind] += 1; const k = `${kind}:${String(fn).slice(0, 60)}`; origins[k] = (origins[k] || 0) + 1; return fn.apply(this, a); };
  window.setTimeout = (fn, ...a) => st(typeof fn === 'function' ? tag('timeout', fn) : fn, ...a);
  window.requestAnimationFrame = (fn) => rf(tag('raf', fn));
  const t0 = performance.now(); let busy = 0, last = t0;
  // main-thread busy time estimate: gaps in a 50 ms heartbeat beyond its period
  const hb = si(() => { const n = performance.now(); busy += Math.max(0, n - last - 50); last = n; }, 50);
  await new Promise((r) => st(r, 3000));
  clearInterval(hb);
  window.setTimeout = st; window.requestAnimationFrame = rf;
  out.idle.callbacks3s = counts; out.idle.heartbeatLagMs = round(busy);
  out.idle.top = Object.entries(origins).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${n}× ${k}`);
}
// ---------- palette and "/" menu ----------
const timeIt = async (fn, done) => { const t = performance.now(); await fn(); await until(done, 5000); await frame(); return round(performance.now() - t); };
const claude = H.claudeAgent();
activate(claude.id);
await frame();
out.ui = {};
out.ui.paletteMs = await timeIt(() => AppUI.palette(), () => document.querySelector('.palette .palette-item, .palette .palette-list > *'));
document.querySelector('.palette')?.remove();
out.ui.palette2Ms = await timeIt(() => AppUI.palette(), () => document.querySelector('.palette .palette-list > *'));
document.querySelector('.palette')?.remove();
const ta = Native.view(claude.id)?.input || document.querySelector(`[data-id="${claude.id}"] .composer textarea`) || document.querySelector('.composer textarea');
const slash = async () => { ta.focus(); ta.value = '/'; return timeIt(() => ta.dispatchEvent(new Event('input')), () => document.querySelector('.slash-menu .slash-item')); };
out.ui.slashMenuMs = await slash();
ta.value = ''; ta.dispatchEvent(new Event('input')); await frame();
out.ui.slashMenu2Ms = await slash();
ta.value = ''; ta.dispatchEvent(new Event('input')); ta.blur(); await wait(200);
// ---------- first open of each tool ----------
out.tools = {};
for (const id of ['three', 'ae', 'forgeheart']) {
  if (!Tools.get(id)) continue;
  const s = H.surfaces.get(`tool:${id}`);
  out.tools[id] = await timeIt(() => activate(`tool:${id}`), () => s?.mounted && s.el.querySelector('.tool-body')?.childElementCount);
  if (id === 'three') { const t = performance.now(); await until(() => !s.el.querySelector('.three-stats')?.hidden && s.el.querySelector('.three-stats')?.textContent, 30000); out.tools.threeFirstFrame = round(performance.now() - t + out.tools.three); }
  await wait(300);
}
activate(claude.id); await frame();
out.tools.reopenThree = await timeIt(() => activate('tool:three'), () => true);
// ---------- the Lab with a few filter layers (SwiftShader: relative numbers only) ----------
if (!window.__perfQuick && typeof ThreeLab !== 'undefined') {
  const d = ThreeLab.director;
  const base = ThreeLayers.TEMPLATES.find((t) => t.id === 'rings') || ThreeLayers.TEMPLATES[0];
  const r0 = await d.newSketch('perf probe', base.code, 3);
  const ids = ['bloom', 'rgb', 'grain', 'vignette', 'chroma'];
  const filters = ids.map((id) => ThreeLayers.FILTERS.find((f) => f.id.includes(id))).filter(Boolean).slice(0, 3);
  for (const f of filters) await d.addLayer({ name: f.name, code: f.code }, 1);
  await wait(3000);
  const st = (await d.addLayer({ name: 'probe end', code: '// nothing' }, 3)).stats;
  out.lab = { base: base.id, filters: filters.map((f) => f.id), plain: r0.stats, withFilters: st };
}
activate(claude.id); await wait(500);
out.idle.afterToolsAnimations = running();
// ---------- a streaming reply (needs --fake-engines): frame gaps and long tasks while it paints ----------
if (!window.__perfQuick && (await window.hub.engineStatus())?.claude?.found !== false) {
  Native.newChat(claude.id);
  const gaps = []; let last = performance.now(); let on = true; let longMs = 0, longN = 0;
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { longMs += e.duration; longN += 1; } });
  try { po.observe({ type: 'longtask' }); } catch { /* not supported */ }
  const loop = () => { const n = performance.now(); gaps.push(n - last); last = n; if (on) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  let busy = 0, hbLast = performance.now();
  const hb = setInterval(() => { const n = performance.now(); busy += Math.max(0, n - hbLast - 20); hbLast = n; }, 20);
  const t = performance.now();
  await Native.send(claude.id, 'long table code please');
  const chatId = H.activeChat[claude.id];
  const ok = await until(() => !Native.isBusy(chatId), 60000);
  on = false; po.disconnect(); clearInterval(hb);
  gaps.sort((a, b) => a - b);
  out.stream = ok ? { ms: round(performance.now() - t), frames: gaps.length, p95FrameMs: round(gaps[Math.floor(gaps.length * 0.95)] || 0), worstFrameMs: round(gaps.at(-1) || 0), longTasks: longN, longTaskMs: round(longMs), mainThreadLagMs: round(busy) } : 'no engine';
}
return JSON.stringify(out, null, 1);
