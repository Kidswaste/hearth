// The Lab's hub side, before → after (round 21 "labhub"): how instant the owner's most-used Lab actions feel.
//   slider drag: input event → the preview receiving the value (p50 / p95 ms), the hub's work per input event, long tasks
//   shuffle / tap / freeze / frame sizes / save: the hub's synchronous work and the next painted frame
//   scene switch: openSketch → the Lab UI painted (layers list, sliders, timeline) and → the preview's first frame
//   typing in a 2,000-line sketch: per key (the editor's own work + the next frame), Ctrl+Enter → what is re-sent
//   pickers: effects (suggested / browse all), looks, motion, sketches, templates, models library: open → painted
//   the Lab hidden behind a chat with a song playing: hub rAF callbacks / timers / DOM writes per second
//   node dev/make-test-song.js /tmp/hearth-test-song.wav
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/labhub.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(50); } return false; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // the next frame, painted
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
const r1 = (x) => Math.round(x * 10) / 10;
const out = {}; const problems = [];
// long tasks over the whole run (and per step: taken from this list by time)
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
const longIn = (t0, t1) => { const l = longs.filter((x) => x.at >= t0 && x.at <= t1); return { n: l.length, ms: Math.round(l.reduce((a, x) => a + x.ms, 0)), worst: Math.round(Math.max(0, ...l.map((x) => x.ms))) }; };
// time a synchronous action and the frame after it (style, layout and paint of what it changed)
async function timed(fn) {
  await frame();
  const t0 = performance.now();
  const r = fn();
  const sync = performance.now() - t0;
  if (r && typeof r.then === 'function') await r.catch(() => {});
  await frame();
  return { syncMs: r1(sync), paintedMs: r1(performance.now() - t0) };
}
async function median(n, fn) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(await fn(i));
  const keys = Object.keys(runs[0] || {});
  return Object.fromEntries(keys.map((k) => [k, pct(runs.map((x) => x[k]).filter((x) => typeof x === 'number'), 0.5)]));
}

activate('tool:three'); await wait(500);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const lab = () => H.surfaces.get('tool:three')?.el;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(700); } return r; };
// a template with many sliders
const tpl = ThreeData.TEMPLATES.slice().sort((a, b) => (b.code || '').split('tweak(').length - (a.code || '').split('tweak(').length)[0];
c.newSketch(tpl.name); await wait(3000);
out.sketch = tpl.name;
const songOk = await c.loadSong('/tmp/hearth-test-song.wav').then((r) => r?.ok !== false, () => false);
await wait(1200);
c.panel(true); await wait(600);

// ---------- 1. slider drag: input → preview (an instant ⚡ slider, and one that rebuilds ↻ the scene) ----------
async function drag(range) {
  const L = lab();
  L.querySelector('.three-preview')?.scrollIntoView({ block: 'start' }); await wait(300);
  await sbx(`window.__lh = { got: [] }; if (!window.__lhOn) { window.__lhOn = 1; addEventListener('message', (e) => { if (e.data?.type === 'tweak' && window.__lh) __lh.got.push([e.data.value, performance.timeOrigin + performance.now()]); }); } return 1`);
  const sent = []; const handler = [];
  const lo = Number(range.min); const hi = Number(range.max);
  const t0 = performance.now();
  for (let f = 0; f < 60; f++) {
    await new Promise((r) => requestAnimationFrame(r));
    for (let k = 0; k < 2; k++) {
      range.value = String(lo + ((f * 2 + k + 1) / 121) * (hi - lo));
      const v = Number(range.value);
      const a = performance.now();
      range.dispatchEvent(new Event('input', { bubbles: true }));
      handler.push(performance.now() - a);
      sent.push([v, performance.timeOrigin + a]);
    }
  }
  range.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(1500);
  const t1 = performance.now();
  const got = (await sbx('const g = __lh.got; window.__lh = null; return g')) || [];
  // each value the preview got ← the input that set it (the latest one with that value)
  const lat = [];
  for (const [v, at] of Array.isArray(got) ? got : []) {
    const hit = sent.filter(([sv, st]) => Math.abs(sv - v) < 1e-9 && st <= at + 1).at(-1);
    if (hit) lat.push(at - hit[1]);
  }
  return { inputs: sent.length, delivered: lat.length, latencyP50: pct(lat, 0.5), latencyP95: pct(lat, 0.95), lastMs: lat.length ? r1(lat.at(-1)) : null, handlerP50: pct(handler, 0.5), handlerP95: pct(handler, 0.95), handlerMax: r1(Math.max(...handler)), longTasks: longIn(t0, t1) };
}
{
  const L = lab();
  await until(() => L.querySelector('.tw-badge.tw-live') && L.querySelector('.tw-badge.tw-rerun'), 8000);
  const rangeOf = (cls) => [...L.querySelectorAll(`.tw-badge.${cls}`)].map((b) => b.closest('.tw-row')?.querySelector('.tw-range input[type=range]')).find((r) => r && r.getBoundingClientRect().width > 20);
  const live = rangeOf('tw-live'); const rb = rangeOf('tw-rerun');
  if (!live && !rb) problems.push('no slider to drag');
  if (live) { out.sliderDrag = await drag(live); c.resetSliders?.(); await wait(600); }
  if (rb) { out.sliderDragRebuild = await drag(rb); c.resetSliders?.(); await wait(1500); }
}

// ---------- 2. the most used actions: shuffle, save, tap, freeze, frame sizes ----------
{
  out.shuffle = await median(5, () => timed(() => c.shuffle()));
  out.save = await median(3, async () => { c.shuffle(); await frame(); return timed(() => c.save()); });
  out.tap = await median(8, () => timed(() => c.tap()));
  out.freeze = await median(4, (i) => timed(() => c.freeze(i % 2 === 0)));
  if (c.state.frozen) c.freeze(false);
  const sizes = ['9:16', '16:9', '4:5', '1:1'].filter((s) => ThreeMedia.SIZES.some((z) => z.id === s));
  out.frameSize = await median(sizes.length * 2, (i) => timed(() => c.size(sizes[i % sizes.length])));
  c.size('fit');
}

// ---------- 3. scene switches ----------
{
  const names = ['Basic scene', 'Particles (Points)', 'Instancing (10k objects)', 'Shadows'].filter((n) => ThreeData.TEMPLATES.some((t) => t.name === n));
  for (const n of names) { c.newSketch(n); await wait(2200); }
  const runs = [];
  const t0 = performance.now();
  for (let i = 0; i < 8; i++) {
    const want = names[i % names.length];
    let drawnAt = 0;
    const onMsg = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn' && !drawnAt) drawnAt = performance.now(); };
    addEventListener('message', onMsg);
    await frame();
    const a = performance.now();
    c.openSketch(want);
    const sync = performance.now() - a;
    await frame();
    const ui = performance.now() - a;
    await until(() => drawnAt, 8000);
    removeEventListener('message', onMsg);
    runs.push({ syncMs: r1(sync), uiMs: r1(ui), firstFrameMs: drawnAt ? r1(drawnAt - a) : null });
    await wait(900);
  }
  const t1 = performance.now();
  out.sceneSwitch = { ...Object.fromEntries(['syncMs', 'uiMs', 'firstFrameMs'].map((k) => [k, { p50: pct(runs.map((x) => x[k]).filter((x) => x != null), 0.5), worst: r1(Math.max(...runs.map((x) => x[k] || 0))) }])), longTasks: longIn(t0, t1) };
}

// ---------- 4. typing in a 2,000-line sketch ----------
{
  const base = ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene') || ThreeData.TEMPLATES[0];
  const filler = [];
  for (let i = 0; filler.length < 1950; i++) filler.push(`// helper ${i}: a long sketch line with words, numbers 0.${i} and "strings" too`, `const k${i} = Math.sin(${i} * 0.01) * 2.5 + /* note */ ${i % 7};`, `function f${i}(x) { return \`v\${x}\` + k${i}; }`);
  const big = `${base.code}\n${filler.join('\n')}\n`;
  c.newSketch(base.name); await wait(2500);
  c.code(true); await wait(400);
  const area = lab().querySelector('.code-editor .ce-area');
  if (!area) problems.push('no code editor');
  else {
    // the 2,000-line sketch, as if pasted
    area.focus(); area.value = big; out.bigLines = big.split('\n').length;
    out.bigLoad = await timed(() => area.dispatchEvent(new Event('input', { bubbles: true })));
    await wait(800);
    // type 40 characters in the middle of the visible part
    area.scrollTop = 0; area.setSelectionRange(base.code.length - 2, base.code.length - 2);
    const keys = []; const t0 = performance.now();
    for (let i = 0; i < 40; i++) {
      await frame();
      const a = performance.now();
      document.execCommand('insertText', false, 'x'); // what a key press does (it fires 'input' itself)
      const sync = performance.now() - a;
      await frame();
      keys.push({ sync, painted: performance.now() - a });
    }
    // and further down (line ~1,500)
    const pos = big.split('\n').slice(0, 1500).join('\n').length;
    area.setSelectionRange(pos, pos); area.scrollTop = 1500 * 19 - 200; await frame();
    for (let i = 0; i < 20; i++) {
      await frame();
      const a = performance.now();
      document.execCommand('insertText', false, 'y'); // what a key press does (it fires 'input' itself)
      const sync = performance.now() - a;
      await frame();
      keys.push({ sync, painted: performance.now() - a });
    }
    // scrolling the long sketch (the scroll handler's own work, and to the painted frame)
    const scrolls = []; const scrollSync = [];
    for (let i = 0; i < 20; i++) { area.scrollTop = (i * 2300) % 36000; void area.scrollTop; const a = performance.now(); area.dispatchEvent(new Event('scroll')); scrollSync.push(performance.now() - a); await frame(); scrolls.push(performance.now() - a); }
    // an empty frame here, for comparison (the preview shares the window's frames)
    const idle = []; for (let i = 0; i < 10; i++) { const a = performance.now(); await frame(); idle.push(performance.now() - a); }
    const t1 = performance.now();
    out.typing = { keySyncP50: pct(keys.map((k) => k.sync), 0.5), keySyncP95: pct(keys.map((k) => k.sync), 0.95), keyPaintedP50: pct(keys.map((k) => k.painted), 0.5), keyPaintedP95: pct(keys.map((k) => k.painted), 0.95), scrollSyncP50: pct(scrollSync, 0.5), scrollPaintedP50: pct(scrolls, 0.5), scrollPaintedP95: pct(scrolls, 0.95), emptyFrameP50: pct(idle, 0.5), preDomNodes: lab().querySelector('.code-editor .ce-pre').getElementsByTagName('*').length, gutterRows: lab().querySelector('.code-editor .ce-gutter').getElementsByTagName('*').length, longTasks: longIn(t0, t1) };
    // the text on screen is the code (the highlight lines up with the textarea): the first and the line at the top
    out.typingIntact = area.value.length === big.length + 60;
  }
  // Ctrl+Enter: what goes to the preview (only the layers that changed)
  const sentBefore = ThreeLab.live.counts().sent;
  area?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(600);
  const sentAfter = ThreeLab.live.counts().sent;
  out.ctrlEnterSent = Object.fromEntries(Object.entries(sentAfter).map(([k, v]) => [k, v - (sentBefore[k] || 0)]).filter(([, v]) => v));
  c.code(false); await wait(300);
}

// ---------- 5. pickers ----------
{
  const closeAll = async () => { document.querySelector('.fx-picker')?.remove(); if (typeof ThreeModels !== 'undefined') ThreeModels.closeLibrary?.(); for (const dl of document.querySelectorAll('dialog[open]')) dl.close(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(250); };
  const pick = async (name, fn, sel) => { const r = await median(3, async () => { const x = await timed(fn); x.nodes = document.querySelector(sel)?.getElementsByTagName('*').length ?? null; await closeAll(); return x; }); out.pickers[name] = r; };
  out.pickers = {};
  await pick('effects', () => ThreeFX.openPicker('add'), '.fx-picker');
  await pick('effectsAll', () => ThreeFX.openPicker('all'), '.fx-picker');
  await pick('filters', () => ThreeFX.openPicker('filter'), '.fx-picker');
  await pick('looks', () => ThreeFX.openPicker('look'), '.fx-picker');
  if (typeof ThreeMotion !== 'undefined') await pick('motion', () => ThreeMotion.openPicker(), '.fx-picker');
  await pick('sketches', () => c.browse(), '.sb-dialog');
  await pick('templates', () => c.newSketch(), '.gallery-dialog');
  if (typeof ThreeModels !== 'undefined') await pick('models', () => ThreeModels.openLibrary(), '.lab3d-panel:not([hidden])');
  // typing in the effects search
  ThreeFX.openPicker('all'); await wait(300);
  const q = document.querySelector('.fx-search');
  const ks = [];
  for (const ch of 'glow') { const a = performance.now(); q.value += ch; q.dispatchEvent(new Event('input', { bubbles: true })); await frame(); ks.push(performance.now() - a); }
  out.pickers.searchKeyPainted = pct(ks, 0.5);
  await closeAll();
}

// ---------- 6. the Lab hidden behind a chat, song playing ----------
if (songOk) {
  try { c.play(true); } catch { /* no song */ }
  await wait(600);
  activate(H.claudeAgent().id); await wait(800);
  let rafs = 0; let timers = 0; let muts = 0;
  const R = window.requestAnimationFrame; const S = window.setTimeout; const I = window.setInterval;
  window.requestAnimationFrame = function (f) { rafs += 1; return R.call(window, f); };
  window.setTimeout = function (f, ms, ...a) { timers += 1; return S.call(window, f, ms, ...a); };
  const mo = new MutationObserver((recs) => { muts += recs.length; }); mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const t0 = performance.now();
  await new Promise((r) => S.call(window, r, 3000));
  const el = performance.now() - t0;
  window.requestAnimationFrame = R; window.setTimeout = S; window.setInterval = I; mo.disconnect();
  out.hidden = { rafPerS: Math.round((rafs / el) * 1000), timersPerS: Math.round((timers / el) * 1000), domWritesPerS: Math.round((muts / el) * 1000) };
  activate('tool:three'); await wait(600);
  try { c.play(false); } catch { /* fine */ }
}
out.longTasksTotal = { n: longs.length, ms: Math.round(longs.reduce((a, x) => a + x.ms, 0)), worst: Math.round(Math.max(0, ...longs.map((x) => x.ms))) };
if (out.typingIntact === false) problems.push('typing lost characters');
out.problems = problems;
out.ok = problems.length === 0;
return JSON.stringify(out, null, 1);
