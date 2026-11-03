// (round 112, labopen112) The Lab's first open, phase by phase (docs/upgrades/labopen112.md). Not a pass / fail check:
// dev/labopen112.js runs it (each run a fresh profile, a throwaway data folder) and reads what it leaves in SMOKE_TMP.
// Setup: two scenes, never an owner's: "LO demo" (two plain torus layers, each with its own renderer and frame loop) and
// labchecks109's real scene (dev/checks/realscene-lib.js: the bundled Beat burst demo + a model, a beat rig, bloom and a
// song). Then each part is one start of the app (a reload) and one open of the Lab from the first screen:
//   cold   the Lab's code not in (labload94 mode 'none'), no warm page: the code loads on the press
//   code   the Lab's code in at the start ('now'), no warm preview page (tools/three-boot.js off)
//   warm   the Lab's code in and the warm preview page drawn and parked (the everyday open)
// for the demo, then the real scene. Each open: activate('tool:three') 4 s after the first screen (the start settled),
// a full trace of every process from just before the press to the first frame, the window's and the preview page's own
// clocks (lined up through performance.timeOrigin), the page's long animation frames with their scripts, its WebGL
// context creations and its GL calls that wait for the GPU (a program's link status, texture uploads).
//   node dev/labopen112.js [--runs 2] [--app <dir>] [--only demo,real] [--cases cold,code,warm]
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 16), new THREE.MeshStandardMaterial({ color: '${color}', roughness: 0.4 }));
scene.add(mesh, new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 3, 4); scene.add(sun);
console.log('${name} ready');
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });
`;
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const PLAN = JSON.parse(localStorage.getItem('lo112.plan') || 'null') || (window.LO112_PLAN || ['demo:cold', 'demo:code', 'demo:warm', 'real:cold', 'real:code', 'real:warm']);
const out = { setup: {} };
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && H.surfaces.get('tool:three')?.mounted, 60000);
await wait(1500);
// the real scene (labchecks109), made with the Lab's own commands; its song paused (each open starts it again as the owner's would)
if (PLAN.some((x) => x.startsWith('real'))) {
  try { out.setup.real = await RS.open({ play: false }); } catch (err) { out.setup.realError = String(err?.message || err); }
  out.setup.realId = ThreeLab.scenes.currentId();
  try { (await ThreeLab.cmd()).play(false); } catch { /* none */ }
  await wait(2500); // (its versions and extras saved)
}
const A = 'lo112demo';
const prev = (await window.hub.kvGet('three-sketches', null)) || [];
await window.hub.kvSet('three-sketches', [...prev.filter((x) => x.id !== A), { id: A, name: 'LO demo', code: LAYER('Base', '#ff3d7f'), updatedAt: Date.now(), layers: [{ id: `${A}L1`, name: 'Base', code: LAYER('Base', '#ff3d7f'), visible: true, opacity: 1, blend: 'normal', slot: 0 }, { id: `${A}L2`, name: 'Ring', code: LAYER('Ring', '#3dc0ff'), visible: true, opacity: 1, blend: 'normal', slot: 1 }] }]);
out.setup.demoId = A;
H.config.settings = { ...H.config.settings, startOn: 'tool:home' };
await saveConfig();
localStorage.setItem('lo112.ids', JSON.stringify({ demo: A, real: out.setup.realId }));
localStorage.setItem('lo112.plan', JSON.stringify(PLAN));
localStorage.setItem('lo112.i', '0');
// the next start: the first case
{
  const [scene, kind] = PLAN[0].split(':');
  store.set('three.current', scene === 'demo' ? A : out.setup.realId);
  localStorage.setItem('lazy.lab.mode', kind === 'cold' ? 'none' : 'now');
  localStorage.setItem('labboot.warm', kind === 'warm' ? '1' : '0');
}
await wait(1500);
await window.hub.fs.write(`${window.SMOKE_TMP}/lo112-setup.json`, JSON.stringify(out));
return `[LABOPEN112] setup: ${JSON.stringify({ realId: out.setup.realId, layers: out.setup.real?.layers, err: out.setup.realError || null })}`;
//@@ reload
// ---------- one open (the same body in every part) ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const PLAN = JSON.parse(localStorage.getItem('lo112.plan'));
const IDS = JSON.parse(localStorage.getItem('lo112.ids'));
const I = Number(localStorage.getItem('lo112.i')) || 0;
if (I >= PLAN.length) return '[LABOPEN112] (no case left)';
const [SCENE, KIND] = PLAN[I].split(':');
const R = { case: PLAN[I], scene: SCENE, kind: KIND, w: {}, msgs: [], page: null, problems: [] };
const now = () => Math.round(performance.now() * 10) / 10;
// the preview page's probe: every new sandbox document from now on (the warm page was made before this part: see below)
const probe = () => {
  if (window.__lo112 || !/three-sandbox/.test(location.href) || /mode=(shader|viewer)/.test(location.href)) return;
  const tn = () => performance.now();
  const P = window.__lo112 = { origin: performance.timeOrigin, ctx: [], gl: {}, loaf: [], dcl: null, raf: null };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) {
    if (!/webgl/i.test(String(t))) return gc.call(this, t, ...a);
    const t0 = tn(); try { return gc.call(this, t, ...a); } finally { P.ctx.push([Math.round(t0), Math.round((tn() - t0) * 10) / 10]); }
  };
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const fn of ['getProgramParameter', 'getShaderParameter', 'linkProgram', 'compileShader', 'texImage2D', 'texSubImage2D', 'texStorage2D', 'readPixels', 'finish']) {
      const o = C.prototype[fn]; if (typeof o !== 'function') continue;
      C.prototype[fn] = function (...a) { const t0 = tn(); try { return o.apply(this, a); } finally { const d = tn() - t0; const k = P.gl[fn] ||= { n: 0, ms: 0, first: null, last: 0, max: 0 }; k.n += 1; k.ms += d; k.max = Math.max(k.max, d); if (k.first == null) k.first = t0; k.last = t0 + d; } };
    }
  }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.loaf.push({ s: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(e.blockingDuration || 0), r: Math.round(e.renderStart || 0), scripts: (e.scripts || []).map((x) => ({ s: Math.round(x.startTime), d: Math.round(x.duration), c: Math.round(x.pauseDuration || 0), inv: String(x.invoker || '').slice(0, 60), type: x.invokerType, src: String(x.sourceURL || '').replace(/^.*\/(tools\/)?/, '').slice(0, 60), fn: x.sourceFunctionName || '' })) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* none */ }
  addEventListener('DOMContentLoaded', () => { P.dcl = tn(); });
};
await smoke({ frameScript: { match: '', source: `(${probe.toString()})();` } });
// the window's own times
const W = R.w;
addEventListener('message', (e) => { const d = e.data; if (d?.source === 'three-sandbox' && W.t0 != null) R.msgs.push([d.type, now() - W.t0, d.layer || null]); });
addEventListener('hearth:lab-ready', () => { if (W.t0 != null) W.labReady ??= now() - W.t0; });
new MutationObserver((list) => {
  if (W.t0 == null) return;
  for (const m of list) {
    if (m.type === 'attributes' && m.target.classList?.contains('three-frame') && m.attributeName === 'src' && m.target.closest('.three-preview')) W.src ??= now() - W.t0;
    for (const n of m.addedNodes || []) if (n.nodeType === 1 && (n.matches?.('.three-preview .three-frame') || n.querySelector?.('.three-preview .three-frame'))) W.frameIn ??= now() - W.t0;
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
const lab = () => Lazy.state().find((g) => g.name === 'lab');
R.before = { lab: lab()?.state, mode: window.LabIntent?.state?.().mode };
// settle: 4 s after the first screen, and for 'warm' the warm page drawn and parked
{ const left = ready + 4000 - performance.now(); if (left > 0) await wait(left); }
if (KIND === 'warm') R.before.warm = Boolean(await until(() => window.LabBoot?.state?.().drawn, 60000, 100)) && LabBoot.state();
if (KIND !== 'cold') await until(() => Lazy.loaded('lab'), 30000);
await wait(1200);
R.before.labboot = Lazy.loaded('lab') ? window.LabBoot?.state?.() || null : null; // (never a Lab global before it's in: that loads it)
R.before.lab = lab()?.state;
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
await cdp('Performance.enable');
const thr = async () => { const m = (await cdp('Performance.getMetrics'))?.metrics || []; const v = m.find((x) => x.name === 'ThreadTime')?.value; return Number.isFinite(v) ? v * 1000 : NaN; };
const pageEval = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))?.result?.value;
const DUMP = `${window.SMOKE_TMP}/lo112-trace-${I}.json`;
await smoke({ trace: 'start', cats: 'v8,disabled-by-default-v8.compile,blink.user_timing,toplevel,loading,blink,gpu' });
await wait(300);
const c0 = await thr();
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
performance.mark('lo112-press');
W.t0 = performance.now(); W.t0abs = performance.timeOrigin + W.t0; R.atPress = { lab: lab()?.state, by: window.Lazy?.by?.('lab') || null, sinceReady: Math.round(W.t0 - ready) };
activate('tool:three');
W.activateMs = now() - W.t0;
// first frame: the page's __labPace counts a drawn frame (perfguard's labcold rule), polled
let first = null;
await until(async () => { const n = await pageEval('window.__labPace?.state()?.drawn').catch(() => null); if (n > 0) { first = now() - W.t0; return true; } return false; }, 60000, 15);
W.first = first;
W.cpu = Math.round((await thr()) - c0);
// a bit more (the late compiles and the stack-drawn after a warm swap)
await until(() => R.msgs.some((m) => m[0] === 'stack-drawn'), 8000, 25);
await wait(1500);
await smoke({ trace: 'stop', dump: DUMP });
const g = lab();
W.labBy = window.Lazy?.by?.('lab') || null;
W.lazyLab = g ? { state: g.state, ms: g.ms, at: g.at != null ? Math.round(g.at - W.t0) : null } : null;
R.after = { labboot: window.LabBoot?.state?.() || null, intent: window.LabIntent?.state?.() || null, sketch: window.ThreeLab?.scenes?.currentId?.() || null };
R.page = await pageEval('JSON.stringify(window.__lo112 ? { ...window.__lo112, nav: performance.getEntriesByType("navigation").map((e) => ({ s: e.startTime, rs: e.responseStart, re: e.responseEnd, di: Math.round(e.domInteractive), dcl: Math.round(e.domContentLoadedEventEnd), le: Math.round(e.loadEventEnd) }))[0], res: performance.getEntriesByType("resource").filter((e) => /three|sandbox|lab3d|motion|addons|examples/.test(e.name)).map((e) => ({ n: e.name.replace(/^.*\\//, ""), s: Math.round(e.startTime), e: Math.round(e.responseEnd), size: e.transferSize || e.encodedBodySize || 0 })), pace: window.__labPace?.state() || null, wg: window.__labWarmGap?.state?.() || null, health: window.__labHealth?.() || null } : null)').catch((err) => String(err));
try { R.page = JSON.parse(R.page); } catch { /* as text */ }
R.trace = DUMP;
// the next start
localStorage.setItem('lo112.i', String(I + 1));
if (I + 1 < PLAN.length) {
  const [scene, kind] = PLAN[I + 1].split(':');
  activate('tool:home'); await wait(500);
  store.set('three.current', IDS[scene]);
  localStorage.setItem('lazy.lab.mode', kind === 'cold' ? 'none' : 'now');
  localStorage.setItem('labboot.warm', kind === 'warm' ? '1' : '0');
  await wait(1200);
}
await window.hub.fs.write(`${window.SMOKE_TMP}/lo112-${I}.json`, JSON.stringify(R));
return `[LABOPEN112] ${R.case}: first frame ${W.first} ms (window CPU ${W.cpu} ms, lab ${R.before.lab} → ${W.lazyLab?.state})`;
