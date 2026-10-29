// gpuload84: what Hearth draws on a fast screen. On the owner's 240 Hz screen the Lab preview drew 240 times a second
// and the graphics card's load made Windows' audio crackle in every app; this round paces the other places that drew
// at the screen's rate (docs/upgrades/gpuload84.md). The test machine's screen is 60 Hz (Xvfb), so a 240 Hz screen is
// faked: requestAnimationFrame of the window (or of a Lab tool's page) is driven by a 240-a-second timer, and each fixed
// loop's drawn frames per second are counted against it.
//   kit        the Easing tool's preview dot: ≤ 60 moves a second; none while the tool isn't on screen
//   shader     the Shader nodes editor's preview (WebGL2): ≤ 60 draws a second, ≤ 30 with another app in front, ≤ 10
//              paused, none while not on screen
//   pickers    the 🅰 kinetic type / 🎵 visualizer / ⬟ shape pickers' animated cards: ≤ 30 frames a second
//   labtools   the Lab's Shader playground and Model viewer tabs: ≤ 60 draws a second (their pages' own frames)
//   blurhush   another app in front, 5 s without input: every endless CSS animation pauses (a busy dot included); the
//              window in front again, or a pointer move over it: they run again
//   minimized  the ▶ Play game window and the Stage window: minimized, their pages may rest (backgroundThrottling on);
//              restored, off again
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/gpuload84.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], rates: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const T = (o) => window.hub.power.test(o);
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- a fake 240 Hz screen for this window: rAF callbacks run from a 240-a-second timer ----------
// (a callback sees performance.now() as its frame time, like the real one; drv.n is the frame number while it runs)
function fakeScreen(hz = 240) {
  const real = { raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame };
  const q = new Map(); let id = 0;
  const drv = { n: 0, cur: 0, on: true };
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => { q.delete(i); };
  const timer = setInterval(() => {
    drv.n += 1; drv.cur = drv.n;
    const t = performance.now(); const list = [...q.values()]; q.clear();
    for (const cb of list) { try { cb(t); } catch (err) { console.warn('gpuload84 fake frame', err); } }
    drv.cur = 0;
  }, 1000 / hz);
  drv.stop = () => { if (!drv.on) return; drv.on = false; clearInterval(timer); window.requestAnimationFrame = real.raf; window.cancelAnimationFrame = real.caf; for (const cb of q.values()) real.raf.call(window, cb); q.clear(); };
  return drv;
}
// frames (of the fake screen) in which something was drawn, per second over ms
const drawnSet = new Set(); let drv = null;
const mark = () => { if (drv?.cur) drawnSet.add(drv.cur); };
async function rate(ms = 2000) {
  drawnSet.clear(); const n0 = drv.n; const t0 = performance.now();
  await wait(ms);
  const s = (performance.now() - t0) / 1000;
  return { drawn: r1(drawnSet.size / s), screen: r1((drv.n - n0) / s) };
}
// what counts as drawing: WebGL2 draws, 2D canvas paints inside `within`, style writes on `styled`
let within = null;
for (const P of [window.WebGL2RenderingContext?.prototype]) {
  for (const m of ['drawArrays', 'drawElements']) { const f = P?.[m]; if (typeof f === 'function') P[m] = function (...a) { mark(); return f.apply(this, a); }; }
}
{
  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['clearRect', 'fillRect', 'fillText', 'drawImage', 'fill', 'stroke', 'putImageData']) { const f = P[m]; P[m] = function (...a) { if (within && within.contains(this.canvas)) mark(); return f.apply(this, a); }; }
}

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 30000);

// ---------- Kit › Easing: the preview dot ----------
await safe('kit', async () => {
  if (typeof Kit === 'undefined') await Lazy.load('kit');
  const dlg = Kit.open('easing');
  const dot = await until(() => dlg.querySelector('.kit-ease-dot'), 5000);
  const mo = new MutationObserver(() => { if (drv?.n) drawnSet.add(drv.n); }); mo.observe(dot, { attributes: true, attributeFilter: ['style'] });
  drv = fakeScreen();
  await wait(300);
  const a = await rate();
  out.rates.kit = a;
  step('the fake screen ticks like a fast one (≥ 150 frames a second)', a.screen >= 150, a);
  // (the observer hears a write after the frame's task, before the next frame: counted on that frame's number)
  step('Kit › Easing: the preview dot moves ≤ 60 times a second on a 240 Hz screen (it moved on every frame)', a.drawn > 20 && a.drawn <= 64, a);
  dlg.style.visibility = 'hidden';
  await wait(700);
  const h = await rate();
  out.rates.kitHidden = h;
  step('…and not at all while the tool isn\'t on screen', h.drawn <= 1, h);
  dlg.style.visibility = '';
  mo.disconnect(); drv.stop(); dlg.close();
});

// ---------- the Shader nodes editor's preview ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 30000);
await ThreeLab.cmd();
await wait(800);
await safe('shader', async () => {
  if (typeof ShaderNodes === 'undefined') await until(() => typeof ShaderNodes !== 'undefined', 15000);
  drv = fakeScreen();
  const ui = ShaderNodes.open({ presetId: 'plasma' });
  await until(() => ui.preview && ui.dialog?.open, 8000);
  await wait(600);
  const a = await rate();
  out.rates.shader = a;
  step('Shader nodes preview: ≤ 60 draws a second on a 240 Hz screen (240 before)', a.drawn > 20 && a.drawn <= 64 && a.screen >= 150, a);
  document.hasFocus = () => false; // (another app in front)
  const b = await rate();
  delete document.hasFocus;
  out.rates.shaderBehind = b;
  step('…≤ 30 while another app is in front', b.drawn > 8 && b.drawn <= 33, b);
  ui.preview.toggle(false);
  const c = await rate();
  out.rates.shaderPaused = c;
  step('…≤ 10 while paused (it drew every frame paused too)', c.drawn >= 3 && c.drawn <= 11.5, c);
  ui.preview.toggle(true);
  ui.dialog.style.visibility = 'hidden';
  await wait(700);
  const d = await rate();
  out.rates.shaderHidden = d;
  step('…and none while it isn\'t on screen', d.drawn <= 1, d);
  ui.dialog.style.visibility = '';
  await wait(800);
  const e = await rate(1000);
  step('…back on screen, it draws again', e.drawn > 20, e);
  drv.stop(); ui.close();
});

// ---------- the Lab's animated pickers ----------
for (const [name, group, get] of [['kinetic type', 'kinetictype', () => window.LabKinetic], ['visualizers', 'labvis', () => window.LabVis], ['shapes', 'labshapes', () => window.LabShapes]]) {
  await safe(`picker ${name}`, async () => {
    if (!get()) await Lazy.load(group);
    await get().open();
    const shade = await until(() => get().picker?.el, 8000);
    await wait(500);
    within = shade; drv = fakeScreen();
    await wait(300);
    const a = await rate();
    out.rates[name] = a;
    within = null; drv.stop();
    get().picker?.close?.();
    // (each card frame is a lot of 2D drawing on this software-drawn machine, so the fake screen itself slows down
    // while they draw: what counts is that they skip most of its frames and never pass 30)
    step(`the ${name} picker's cards: ≤ 30 frames a second, never every frame of a fast screen (240 before)`, a.drawn >= 2 && a.drawn <= 33 && a.drawn <= a.screen * 0.4 + 1, a);
  });
}

// ---------- the Lab's Shader playground / Model viewer tabs (their own pages) ----------
// (an eval in that page, as the Lab's own messages: a fake 240 Hz screen there, and its drawn frames: window.__toolPace)
function frameEval(frame, code) {
  return new Promise((resolve) => {
    const id = `g84${Math.random().toString(36).slice(2)}`;
    const on = (e) => { if (e.source !== frame.contentWindow || e.data?.type !== 'eval-result' || e.data.id !== id) return; removeEventListener('message', on); resolve(e.data); };
    addEventListener('message', on);
    frame.contentWindow.postMessage({ target: 'three-sandbox', type: 'eval', id, code }, '*');
    setTimeout(() => { removeEventListener('message', on); resolve({ ok: false, error: 'no answer' }); }, 5000);
  });
}
const FAKE_IN = `if (!window.__g84) { const q = new Map(); let id = 0; const g = window.__g84 = { n: 0 };
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; }; window.cancelAnimationFrame = (i) => q.delete(i);
  setInterval(() => { g.n += 1; const t = performance.now(); const l = [...q.values()]; q.clear(); for (const cb of l) { try { cb(t); } catch (e) { console.warn(e); } } }, 1000 / 240); }
return 1`;
for (const [tab, mode] of [['shader', 'shader'], ['models', 'viewer']]) {
  await safe(`lab tab ${tab}`, async () => {
    const btn = await until(() => [...document.querySelectorAll('.surface.active .tabbar button')].find((b) => b.dataset.id === tab), 8000);
    btn.click();
    const frame = await until(() => [...document.querySelectorAll('iframe.three-frame')].find((f) => f.src.includes(`mode=${mode}`) && f.getBoundingClientRect().width > 0), 10000);
    const ready = await until(async () => (await frameEval(frame, 'return Boolean(window.__toolPace)')).value === true, 20000);
    if (!ready) { step(`Lab ${tab} tab: its page answers`, false); return; }
    await frameEval(frame, FAKE_IN);
    await wait(500);
    const read = async () => JSON.parse((await frameEval(frame, 'return JSON.stringify({ d: window.__toolPace.drawn, n: window.__g84.n, t: performance.now() })')).value);
    const a = await read(); await wait(2000); const b = await read();
    const s = (b.t - a.t) / 1000;
    const r = { drawn: r1((b.d - a.d) / s), screen: r1((b.n - a.n) / s) };
    out.rates[`lab ${tab}`] = r;
    step(`the Lab's ${tab === 'shader' ? 'Shader playground' : 'Model viewer'}: ≤ 60 draws a second on a 240 Hz screen (240 before)`, r.drawn > 20 && r.drawn <= 64 && r.screen >= 150, r);
  });
}
{ const b = [...document.querySelectorAll('.surface.active .tabbar button')].find((x) => x.dataset.id === 'sketch'); b?.click(); }

// ---------- another app in front: endless CSS animations pause ----------
await safe('blurhush', async () => {
  if (typeof IdleCpu === 'undefined') await Lazy.load('idlecpu');
  const dot = document.createElement('div'); dot.className = 'typing'; dot.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:5'; dot.append(document.createElement('i'));
  document.body.append(dot);
  await wait(200);
  const running = () => dot.firstChild.getAnimations().filter((x) => x.playState === 'running').length;
  step('a busy dot pulses while Hearth is in front', running() >= 1 && IdleCpu.state().focused, { running: running(), st: IdleCpu.state() });
  await T({ winEvent: { event: 'blur' } });
  await until(() => !IdleCpu.state().focused, 3000);
  const ms = IdleCpu.state().blurMs;
  await wait(ms - 1500);
  step('another app in front: still moving before 5 s without input', running() >= 1 && !document.documentElement.hasAttribute('data-blurhush'), IdleCpu.state());
  const hushed = await until(() => document.documentElement.hasAttribute('data-blurhush'), 4000);
  step('…then every endless animation pauses where it is (the busy dot too)', hushed && running() === 0 && document.getAnimations().filter((x) => x instanceof CSSAnimation && x.playState === 'running').length === 0, { running: running(), all: document.getAnimations().filter((x) => x instanceof CSSAnimation && x.playState === 'running').map((x) => x.animationName).slice(0, 8), st: IdleCpu.state() });
  dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
  await wait(50);
  step('…a pointer move over the window plays them on', running() >= 1 && !document.documentElement.hasAttribute('data-blurhush'), IdleCpu.state());
  await until(() => document.documentElement.hasAttribute('data-blurhush'), ms + 3000);
  await T({ winEvent: { event: 'focus' } });
  await until(() => IdleCpu.state().focused, 3000);
  await wait(50);
  step('…and Hearth in front again plays them on at once', running() >= 1 && !document.documentElement.hasAttribute('data-blurhush'), IdleCpu.state());
  // a recording of Hearth keeps its look as it is
  document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: true } }));
  await T({ winEvent: { event: 'blur' } });
  await wait(ms + 1200);
  step('…never while Hearth records itself', running() >= 1 && !document.documentElement.hasAttribute('data-blurhush'), IdleCpu.state());
  document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: false } }));
  await T({ winEvent: { event: 'focus' } });
  dot.remove();
});

// ---------- minimized windows: the Stage and the ▶ Play game ----------
const winOf = async (prefix) => (await T({ windows: true })).windows.find((w) => w.url.startsWith(prefix));
await safe('stage minimized', async () => {
  await window.hub.stageOpen({ query: `?mode=sketch&v=${ThreeData.VERSIONS[0]}&n=g84`, width: 640, height: 360 });
  const w0 = await until(async () => (await T({ windows: true })).windows.find((w) => /three-sandbox\.html\?mode=sketch&v=[^&]+&n=g84/.test(w.url)), 10000);
  step('the Stage window: its page never rests while on screen', w0 && w0.throttling === false, w0);
  const url = w0?.url.slice(0, 60) || 'none';
  await T({ winEvent: { url, event: 'minimize' } });
  const w1 = await winOf(url);
  step('…minimized, it may rest (backgroundThrottling on)', w1?.throttling === true, w1);
  await T({ winEvent: { url, event: 'restore' } });
  const w2 = await winOf(url);
  step('…restored, never again', w2?.throttling === false, w2);
  await window.hub.stageClose();
});
await safe('game minimized', async () => {
  const DIR = '/tmp/hearth-gpuload84-game';
  await window.hub.fs.write(`${DIR}/index.html`, '<!doctype html><meta charset="utf-8"><title>g84</title><canvas id="c" width="320" height="180"></canvas><script>window.__f = 0; const g = document.getElementById("c").getContext("2d"); (function f() { window.__f += 1; g.fillStyle = `hsl(${window.__f % 360} 60% 50%)`; g.fillRect(0, 0, 320, 180); requestAnimationFrame(f); })();</script>');
  if (typeof GameMode === 'undefined') await Lazy.load('gamemode');
  await GameMode.play({ kind: 'html', path: `${DIR}/index.html` });
  const on = await until(async () => Number((await window.hub.game.eval('window.__f || 0'))?.value) > 10, 60000);
  step('▶ Play: a game plays', on);
  const w0 = await winOf('hearth-game:');
  step('…its page never rests while on screen (another screen, partly covered)', w0?.throttling === false, w0);
  await T({ winEvent: { url: 'hearth-game:', event: 'minimize' } });
  const w1 = await winOf('hearth-game:');
  step('…minimized, it may rest like any hidden page', w1?.throttling === true, w1);
  await T({ winEvent: { url: 'hearth-game:', event: 'restore' } });
  const w2 = await winOf('hearth-game:');
  step('…restored, back to never', w2?.throttling === false, w2);
  await window.hub.game.leave().catch(() => {});
  await until(async () => !(await window.hub.game.state())?.playing, 15000);
});

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
