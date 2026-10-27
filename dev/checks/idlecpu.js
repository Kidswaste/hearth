// Idle CPU (round 44, idlecpu): Hearth on screen, in front, with the owner doing nothing, should cost next to nothing:
// fans quiet, battery kept. For each everyday setup it waits for the page to settle, then counts 10 s of idle:
//   · CPU time per process (app.getAppMetrics: main, the window, GPU, utility, the Lab preview's page, the warm Lab page,
//     the store threads' busy time) and their wakeups (Linux: context switches per process, all its threads)
//   · the window's own wakeups: every timer / interval / animation frame / idle callback / observer callback that ran,
//     by where it was asked for (counters installed before the app's scripts: the reload below)
//   · the main process' timers (powerwisemain's counter)
//   · CSS animations still running, and whether what they move can be seen
// Setups: a chat open (no streaming) · the Lab with a still scene · the Lab with an animated (looping) scene, paused ·
// the board (pictures, a GIF, videos: /tmp/hearth-board-fixtures) · the grid view with 4 chats · ◉ Activity open · (round 73) Hearth hidden after
// using the Lab (the tray / minimized: every process together, budget hiddenAllCpu).
// Budgets per setup on the window's CPU and wakeups (window.IDLE_REPORT = 1 reports without failing).
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/idlecpu.js
const probe = () => {
  if (window.__icProbe) return;
  const P = window.__icProbe = { n: 0, by: new Map(), since: performance.now(), raw: { setTimeout: window.setTimeout.bind(window) } };
  // where it was asked for: the first frame in a file, and the one before it when that's a shared helper (ui.js'
  // debounce, the powerwise schedule)
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
    const out = { seconds: Math.round(ms / 100) / 10, n: P.n, perSec: per(P.n), top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${per(v)}/s ${k}`) };
    P.n = 0; P.by.clear(); P.since = performance.now();
    return out;
  };
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
localStorage.setItem('labboot.warm', '1'); // (the warm Lab page is made after the start, as for someone who uses the Lab)
localStorage.setItem('idlecpu.hushMs', '2000'); // (the owner away: the minute before the hush shortened to the settle time)
return 'probe installed';
//@@ reload
const { step, wait, until } = J;
const T = (o) => window.hub.power.test(o);
const P = window.__icProbe; const sleep = (ms) => new Promise((r) => P.raw.setTimeout(r, ms));
const MEASURE = Number(localStorage.getItem('ic.measureMs')) || 10000;
const out = J.out; out.setups = {};
const sbx = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: `(() => { ${expr} })()`, returnByValue: true } }))?.result?.value;
const labUp = () => Boolean(H.surfaces.get('tool:three')?.mounted);
// the owner's look (Forgeheart: its ambient touches included)
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
step('the counters are in', Boolean(P) && Boolean((await T({ metrics: true })).metrics?.procs?.length));
// park the pointer outside the page (no hover effects), nothing focused that blinks a caret
await J.mouse('mouseMoved', 2, 990, { button: 'none' });

// which process is what: the window, the Lab's preview page(s), the rest by Chromium's type
function label(m, pid) {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'window';
  if (pages.some((p) => /three-sandbox/.test(p.url))) return H.surfaces.get('tool:three')?.mounted ? 'lab preview' : 'lab (warm)';
  if (pages.length) return `page ${pages[0].type} ${pages[0].url.split('/').pop().slice(0, 30)}`;
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : `${pr.type.toLowerCase()}${pr.name ? ` ${pr.name}` : ''}`;
}
// the animations still running (CSS / Web Animations) and whether their element can be seen
function anims() {
  const list = document.getAnimations().filter((a) => a.playState === 'running');
  const desc = (a) => {
    const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement;
    const id = n ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}.${String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/).slice(0, 2).join('.')}` : '?';
    const seen = n ? n.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && n.getBoundingClientRect().width > 0 : false;
    const inf = a.effect?.getTiming?.().iterations === Infinity;
    return `${a.animationName || a.transitionProperty || a.id || 'anim'} ${id}${inf ? ' ∞' : ''}${seen ? '' : ' (unseen)'}`;
  };
  const de = document.documentElement;
  return { look: `${de.dataset.skin || ''}/${de.dataset.motion || 'full'}${matchMedia('(prefers-reduced-motion: reduce)').matches ? '/reduced' : ''}`, focus: document.activeElement?.tagName.toLowerCase(), n: list.length, infinite: list.filter((a) => a.effect?.getTiming?.().iterations === Infinity).length, list: list.slice(0, 12).map(desc) };
}
// the main process' numbers (a reply without them is noted, and counts as nothing measured)
async function met() {
  const r = await T({ metrics: true });
  if (!r?.metrics || r.metrics.error) (out.metricsTrouble ||= []).push(r?.metrics?.error || `no metrics: ${Object.keys(r || {}).join(',')}`);
  return r?.metrics || { procs: [], pages: [] };
}
async function measure(name) {
  await sleep(6000); // (what the last step started lands first: software GL draws for a few seconds after a change)
  // (the Lab on screen: someone away for a while, the still picture past its first 10 s)
  if (labUp() && /lab/.test(name)) out[`${name} doze wait`] = await until(async () => (await sbx('return window.__labPace?.state()'))?.doze?.ms >= 250, 25000);
  // (the garbage the last step left collected now: a big collection after the board read its clips took ≈ 1 s of the
  // window's CPU, once, whenever it came; that's the last step's cost, not idle work)
  await smoke({ cdp: 'HeapProfiler.collectGarbage' }); await sleep(1500);
  const m0 = await met();
  const s0 = labUp() ? await sbx('return window.__labPace?.state()') : null;
  P.take(); await T({ probe: 'start' });
  const t0 = performance.now();
  await sleep(MEASURE);
  const page = P.take(); const main = (await T({ probe: 'take' })).probe;
  const m1 = await met();
  const s1 = labUp() ? await sbx('return window.__labPace?.state()') : null;
  const sec = (performance.now() - t0) / 1000;
  const procs = {};
  for (const p1 of m1.procs) {
    const p0 = m0.procs.find((x) => x.pid === p1.pid);
    if (!p0 || p1.cpuS == null) continue;
    const k = label(m1, p1.pid);
    const cur = procs[k] || { cpuPct: 0, ctxPerSec: 0, n: 0 };
    cur.cpuPct += ((p1.cpuS - p0.cpuS) / sec) * 100; cur.n += 1;
    if (p1.ctx != null && p0.ctx != null) cur.ctxPerSec += (p1.ctx - p0.ctx) / sec;
    procs[k] = cur;
  }
  for (const v of Object.values(procs)) { v.cpuPct = Math.round(v.cpuPct * 100) / 100; v.ctxPerSec = Math.round(v.ctxPerSec * 10) / 10; }
  const th = {};
  for (const [k, v] of Object.entries(m1.threads || {})) { const a = m0.threads?.[k]; th[k] = a ? `${Math.round((v.activeMs - a.activeMs) * 10) / 10} ms busy` : 'started'; }
  const r = { procs, threads: th, page: { perSec: page.perSec, top: page.top }, mainTimers: { perMin: main?.perMin, top: main?.top?.slice(0, 5) }, anims: anims(),
    schedule: window.Power?.timers?.().filter((x) => x.every != null).map((x) => `${x.id} ${Math.round(x.every / 100) / 10}s`) || [] };
  // the Lab preview's page: frames it woke for (its frame counter's ticks), drawn, the still check's skips, dozing
  if (s0 && s1) r.lab = { framesPerSec: Math.round(((s1.frameTick - s0.frameTick) / sec) * 10) / 10, drawnPerSec: Math.round(((s1.drawn - s0.drawn) / sec) * 10) / 10, still: s1.still, doze: s1.doze || null, parked: s1.parked };
  // what was painted meanwhile (a short timeline trace after the count, so it doesn't weigh on it)
  await smoke({ trace: 'start', detail: true }); await sleep(3000);
  const tr = await smoke({ trace: 'stop', detail: true });
  r.paint = { framesPerSec: Math.round(((tr.detail?.frames?.n || 0) / 3) * 10) / 10, paintsPerSec: Math.round((tr.paints / 3) * 10) / 10, styles: tr.styles, layouts: tr.layouts, top: (tr.top || []).slice(0, 3) };
  out.setups[name] = r;
  console.log(`[IC] ${name}`, JSON.stringify(r));
  return r;
}

// (the start's one-off work done first: the recall index builds itself ≈ 45 s after the start, the warm Lab page, the
// first checks; then what's measured is what stays)
await until(() => performance.now() > 75000, 120000);

out.labboot = window.LabBoot?.state?.() || null;
// the hush (idlecpu.js): the look's ambient loops paused once nobody has used the window for a while; input plays them on
if (typeof IdleCpu !== 'undefined') {
  await until(() => IdleCpu.state().hushed, 6000);
  step('nobody using the window: the hush is on (<html data-hush>)', IdleCpu.state().hushed && document.documentElement.hasAttribute('data-hush'), IdleCpu.state());
  await J.mouse('mouseMoved', Math.round(innerWidth / 2), innerHeight - 6, { button: 'none' }); // (inside the page: the parking spot is outside it)
  await until(() => !IdleCpu.state().hushed, 1000); // (pointer moves reach the page with the next frame)
  step('… a pointer move plays the look on at once', !IdleCpu.state().hushed && !document.documentElement.hasAttribute('data-hush'));
  document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: true } }));
  await sleep(IdleCpu.state().hushMs + 1500);
  step('… never while Hearth records itself', !IdleCpu.state().hushed);
  document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: false } }));
  await J.mouse('mouseMoved', 2, 990, { button: 'none' });
}

// ---------- 1. a chat open, not streaming ----------
const claude = H.claudeAgent();
activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
await Native.send(claude.id, 'hello there');
await until(() => !Native.isAgentBusy(claude.id), 30000);
document.activeElement?.blur?.();
await measure('chat');

// ---------- 2. the Lab with a still scene ----------
activate('tool:three');
const lab = await ThreeLab.cmd();
await until(() => ThreeLab.director, 30000);
const STILL = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 160, 24), new THREE.MeshNormalMaterial()); scene.add(mesh);
renderer.setAnimationLoop(() => { renderer.render(scene, camera); });
window.__icMove = () => { mesh.rotation.x += 0.4; };`;
await ThreeLab.director.newSketch('idlecpu still', STILL, 1);
await wait(3000);
document.activeElement?.blur?.();
const still = await measure('lab still');
// the dozing preview: the scene changing by itself shows within a doze's step (≤ 500 ms) and wakes it to full rate;
// a pointer over the preview wakes it at once
const pace = () => sbx('return window.__labPace.state()');
if ((await pace())?.doze) {
  step('a still scene on screen: the preview dozes', still.lab?.doze?.on === true, still.lab);
  const d0 = (await pace()).drawn;
  await sbx('window.__icMove(); return 1'); // (straight into the page: not a message, so nothing pokes it)
  const t0 = performance.now(); let lag = null; let after = null;
  while (performance.now() - t0 < 2500) { after = await pace(); if (after.drawn > d0 && !after.doze.on) { lag = Math.round(performance.now() - t0); break; } await sleep(25); }
  out.selfChange = { lag, doze: after?.doze };
  step('… the scene changes by itself: drawn within a doze step (≤ 700 ms with the check\'s own round trips), full rate again', lag != null && lag <= 700 && after.doze.on === false, out.selfChange);
  await until(async () => (await pace()).doze.on, 15000);
  const before = await pace();
  const fr = document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame')?.getBoundingClientRect();
  if (fr) { await J.mouse('mouseMoved', fr.left + fr.width / 2, fr.top + fr.height / 2, { button: 'none' }); await sleep(120); }
  const woke = await pace();
  out.pointerWake = { before: before.doze, after: woke.doze };
  step('… a pointer over the preview wakes it at once', before.doze.on === true && woke.doze.on === false, out.pointerWake);
  await J.mouse('mouseMoved', 2, 990, { button: 'none' });
}

// ---------- 3. the Lab with an animated, looping scene, paused ----------
const LOOP = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 160, 24), new THREE.MeshNormalMaterial()); scene.add(mesh);
renderer.setAnimationLoop(() => { const t = globalThis.layer?.scene ?? 0; mesh.rotation.y = (t % 4) / 4 * 6.283; renderer.render(scene, camera); });`;
await ThreeLab.director.newSketch('idlecpu loop', LOOP, 1);
await wait(2500);
try { if (lab.player?.playing) lab.player.toggle?.(false); } catch { /* no player */ }
await wait(500);
out.labPaused = { playing: Boolean(lab.player?.playing) };
document.activeElement?.blur?.();
const paused = await measure('lab paused');
step('the Lab paused on screen: its knob timer sleeps (no 10×/s keyframe follow)', !paused.page.top.some((x) => /keyLoop|keyTick/.test(x)), paused.page.top);

// ---------- 4. the board ----------
activate('tool:board');
await until(() => window.Board && Board.isMounted() && Board.current(), 20000);
const FIX = '/tmp/hearth-board-fixtures';
if (Board.items().length < 3) { try { await Board.addFiles(['neon big.png', 'golden-hour.jpg', 'loop.gif', 'cuts.mp4', 'calm.mp4'].map((f) => `${FIX}/${f}`)); } catch (err) { out.boardNote = err.message; } }
await until(() => !Board.items().some((i) => ['image', 'gif', 'video'].includes(i.type) && !i.vibe), 60000); // (its reading of the vibes is work, not idle)
await wait(1500); Board.zoomFit?.(); await wait(800);
document.activeElement?.blur?.();
await measure('board');

// ---------- 5. the grid view with 4 chats ----------
const natives = () => H.railAgents().filter((a) => a.mode === 'native');
for (let i = natives().length; i < 4; i++) H.config.agents.push({ id: `ic-chat-${i}`, name: `Chat ${i + 1}`, icon: '✳', color: '#6aa0ff', mode: 'native', engine: 'claude', enabled: true });
await saveConfig(); await wait(1200);
for (const a of natives().slice(0, 4)) { activate(a.id); await wait(250); if (!H.activeChat[a.id]) { Native.newChat(a.id); await wait(150); } }
H.grid = true; applyLayout(); await wait(1500);
document.activeElement?.blur?.();
out.gridChats = [...document.querySelectorAll('#surfaces.grid > .surface')].filter((s) => s.offsetWidth).length;
await measure('grid');
H.grid = false; applyLayout();

// ---------- 6. ◉ Activity open ----------
activate(claude.id); await wait(300);
await Lazy.load('activity');
Activity.open(); await wait(1200);
out.activityOpen = Boolean(document.querySelector('.ac-pop'));
document.activeElement?.blur?.();
await measure('activity');
Activity.close?.();

// ---------- 7. (round 73, startfast73) Hearth hidden: in the tray / minimized, after using the Lab ----------
// The owner leaves Hearth running in the background: then every process should sleep (no frames, no polling). The window
// is hidden by the main process (as the tray's close does); every process counts, the Lab's pages included.
activate('tool:three'); await wait(1500);
await T({ window: 'hide' });
await until(() => document.visibilityState === 'hidden', 5000);
out.hiddenState = document.visibilityState;
await measure('hidden');
await T({ window: 'show' }); await wait(800);
{
  const r = out.setups.hidden;
  const all = Object.values(r.procs).reduce((a, v) => a + v.cpuPct, 0);
  r.allCpuPct = Math.round(all * 100) / 100;
  r.allCtxPerSec = Math.round(Object.values(r.procs).reduce((a, v) => a + v.ctxPerSec, 0) * 10) / 10;
}

// ---------- budgets (window.IDLE_REPORT = 1 reports without failing; window.IDLE_BUDGET overrides) ----------
// per setup, over 10 s of idle: the window's CPU and wakeups (timers, frames, idle callbacks, observers), the main
// process', and the Lab preview's page while the Lab is on screen (CPU, frames it wakes for)
const B = { windowCpu: 1.5, wakeups: 1.5, labWakeups: 2, mainCpu: 1, mainTimersPerMin: 20, labCpu: 2.5, labFrames: 15, hiddenWakeups: 0.3, hiddenMainTimersPerMin: 2, hiddenAllCpu: 0.8, ...(window.IDLE_BUDGET || {}) };
out.table = [];
for (const [name, r] of Object.entries(out.setups)) {
  const w = r.procs.window || { cpuPct: 0 }; const m = r.procs.main || { cpuPct: 0 }; const l = r.procs['lab preview'];
  const onLab = Boolean(r.lab && !r.lab.parked && /lab/.test(name));
  out.table.push(`${name}: window ${w.cpuPct}% ${r.page.perSec}/s · main ${m.cpuPct}% ${r.mainTimers.perMin}/min · gpu ${r.procs.gpu?.cpuPct ?? '?'}%${l ? ` · lab preview ${l.cpuPct}%${r.lab ? ` ${r.lab.framesPerSec} frames/s` : ''}` : ''}`);
  if (w.cpuPct > B.windowCpu) out.problems.push(`${name}: the window used ${w.cpuPct} % of a CPU idle (> ${B.windowCpu})`);
  // (the Lab on screen: its stall check and the preview's stats every 4 s, each a timer and a frame / idle callback: ≈ 1 / s)
  const wb = onLab ? B.labWakeups : B.wakeups;
  if (r.page.perSec > wb) out.problems.push(`${name}: the window woke ${r.page.perSec}×/s idle (> ${wb}): ${r.page.top.slice(0, 3).join('; ')}`);
  if (m.cpuPct > B.mainCpu) out.problems.push(`${name}: the main process used ${m.cpuPct} % idle (> ${B.mainCpu})`);
  if (r.mainTimers.perMin > B.mainTimersPerMin) out.problems.push(`${name}: the main process ran ${r.mainTimers.perMin} timers/min (> ${B.mainTimersPerMin})`);
  if (onLab && l && l.cpuPct > B.labCpu) out.problems.push(`${name}: the Lab preview used ${l.cpuPct} % idle (> ${B.labCpu})`);
  if (onLab && r.lab.framesPerSec > B.labFrames) out.problems.push(`${name}: the Lab preview woke for ${r.lab.framesPerSec} frames/s on a still picture (> ${B.labFrames})`);
}
// (round 73) hidden: the window next to nothing, the main process' own timers rare, every process together ≈ 0
{
  const r = out.setups.hidden;
  if (out.hiddenState !== 'hidden') out.problems.push(`hidden: the page still says ${out.hiddenState}`);
  if (r) {
    out.table.push(`hidden (all processes): ${r.allCpuPct}% · ${r.allCtxPerSec} wakeups/s (kernel)`);
    if (r.page.perSec > B.hiddenWakeups) out.problems.push(`hidden: the window woke ${r.page.perSec}×/s (> ${B.hiddenWakeups}): ${r.page.top.slice(0, 3).join('; ')}`);
    if (r.mainTimers.perMin > B.hiddenMainTimersPerMin) out.problems.push(`hidden: the main process ran ${r.mainTimers.perMin} timers/min (> ${B.hiddenMainTimersPerMin}): ${(r.mainTimers.top || []).slice(0, 3).join('; ')}`);
    if (r.allCpuPct > B.hiddenAllCpu) out.problems.push(`hidden: all processes used ${r.allCpuPct} % of a CPU (> ${B.hiddenAllCpu}): ${JSON.stringify(r.procs)}`);
  }
}
if (out.metricsTrouble) out.problems.push(`the process numbers failed: ${out.metricsTrouble[0]}`);
if (window.IDLE_REPORT) { out.unenforced = out.problems; out.problems = []; }
return J.done();
