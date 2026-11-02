// fps107 (round 107): nothing draws or wakes more than it needs to on a 240 Hz screen, after twenty rounds of new code
// (docs/upgrades/fps107.md). gpuload84's method for every state the owner is in: a 240 Hz screen is faked, in Hearth's
// window AND in the Lab preview's own page, before their scripts run (requestAnimationFrame answered on a 240-a-second
// grid while the page is really being drawn: a hidden window or a parked frame gets no frames, as on the real screen),
// and every frame callback, timer and idle callback that runs is counted by where it was asked for.
//   chat       idle Hearth with a chat open (after a reply)
//   giant      the 6,000-message chat open, scrolled up and back, then idle
//   lab        the Lab with a scene playing on Auto (≤ 60 drawn a second)
//   labBehind  the same with another app in front (≤ 30 drawn), then minimized (hidden: nothing drawn, no frames)
//   behind     Hearth on a chat behind another app
//   stream     a long reply streaming
// Per state: frame callbacks a second (and the frames that had one), timers a second, idle callbacks a second, in the
// window and in the Lab's page; the Lab's drawn frames; endless CSS animations running. Budgets below (FPS107_REPORT = 1
// reports without failing).
//   node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat84 --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/fps107.js
const probe = () => {
  if (window.__fps107) return;
  if (location.protocol === 'about:') return;
  const raw = { st: window.setTimeout, si: window.setInterval, raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame, ric: window.requestIdleCallback, now: performance.now.bind(performance) };
  const P = window.__fps107 = { hz: 240, ticks: 0, busy: 0, n: { raf: 0, timeout: 0, interval: 0, idle: 0 }, by: new Map(), since: raw.now(), raw };
  const site = () => {
    const s = String(new Error().stack || '').split('\n').slice(3).filter((x) => /\.(js|html)/.test(x) && !/fps107/.test(x));
    const f = (l) => (l || '?').trim().replace(/^at\s+/, '').replace(/\(?[^()]*\/([^/?]+\.(?:js|html))[^:]*:(\d+):\d+\)?/, '$1:$2').slice(0, 80);
    return /\/(ui|powerwise)\.js:/.test(s[0] || '') && s[1] ? `${f(s[0])} < ${f(s[1])}` : f(s[0]);
  };
  const count = (kind, k) => { P.n[kind] += 1; const key = `${kind} ${k}`; P.by.set(key, (P.by.get(key) || 0) + 1); };
  // ---- the fake 240 Hz screen: while callbacks wait, each real frame (60 Hz here) carries 4 fake ones a quarter apart ----
  const q = new Map(); let id = 0; let realOn = false; let idleFrames = 0;
  const fire = () => {
    if (!q.size) return;
    P.ticks += 1; P.busy += 1;
    const t = raw.now(); const list = [...q.values()]; q.clear();
    for (const [cb, k] of list) { count('raf', k); try { cb(t); } catch (err) { raw.st.call(window, () => { throw err; }); } }
  };
  const real = () => { lastReal = raw.now(); if (q.size || timer) raw.raf.call(window, real); else realOn = false; arm(); };
  const want = () => { if (!realOn) { realOn = true; raw.raf.call(window, real); } };
  // (one interval while frames are wanted: a chain of timeouts is clamped and drifts; it stops after 3 empty ticks)
  let empty = 0; const rci = window.clearInterval.bind(window);
  const arm = () => {
    if (timer || !q.size) return;
    want();
    if (raw.now() - lastReal > 100) return; // (not drawn lately: the next real frame starts the grid again)
    empty = 0;
    timer = raw.si.call(window, () => {
      if (raw.now() - lastReal > 100) { rci(timer); timer = 0; want(); return; }
      if (!q.size) { empty += 1; if (empty > 3) { rci(timer); timer = 0; } return; }
      empty = 0; fire();
    }, step());
  };
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return raw.raf.call(window, cb);
    id += 1; q.set(id, [cb, site()]);
    if (!realOn) { realOn = true; idleFrames = 0; raw.raf.call(window, real); }
    return id;
  };
  window.cancelAnimationFrame = function (i) { if (!q.delete(i)) raw.caf.call(window, i); };
  for (const [name, kind] of [['setTimeout', 'timeout'], ['setInterval', 'interval'], ['requestIdleCallback', 'idle']]) {
    const orig = raw[{ setTimeout: 'st', setInterval: 'si', requestIdleCallback: 'ric' }[name]];
    if (!orig) continue;
    window[name] = function (fn, ...rest) {
      if (typeof fn !== 'function') return orig.call(window, fn, ...rest);
      const k = site();
      return orig.call(window, function (...a) { count(kind, k); return fn.apply(this, a); }, ...rest);
    };
  }
  // the fake screen's own rate, with a loop of its own (not while measuring: it would be counted)
  const fakeRaf = window.requestAnimationFrame;
  P.screen = (ms = 1000) => new Promise((res) => { let n = 0; const t0 = raw.now(); const go = () => { n += 1; if (raw.now() - t0 < ms) fakeRaf(go); else res(Math.round((n * 10000) / (raw.now() - t0)) / 10); }; fakeRaf(go); });
  P.take = () => {
    const ms = raw.now() - P.since; const per = (x) => Math.round((x * 10000) / ms) / 10;
    const r = { s: Math.round(ms / 100) / 10, rafPerSec: per(P.n.raf), framesPerSec: per(P.busy), timersPerSec: per(P.n.timeout + P.n.interval), idlePerSec: per(P.n.idle),
      top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${per(v)}/s ${k}`) };
    P.by.clear(); P.n = { raf: 0, timeout: 0, interval: 0, idle: 0 }; P.busy = 0; P.since = raw.now();
    return r;
  };
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
await smoke({ frameScript: { match: '', source: `if (/three-sandbox/.test(location.href)) (${probe.toString()})();` } });
return 'probe installed';
//@@ reload
const { step, wait, until } = J;
const out = J.out; out.states = {};
const P = window.__fps107; const sleep = (ms) => new Promise((r) => P.raw.st.call(window, r, ms));
const T = (o) => window.hub.power.test(o);
const MEASURE = Number(localStorage.getItem('fps107.ms')) || 5000;
const sbx = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: `(() => { ${expr} })()`, returnByValue: true, awaitPromise: true } }))?.result?.value;
const labUp = () => Boolean(H.surfaces.get('tool:three')?.mounted);
step('the counters are in (window)', Boolean(P));
await J.mouse('mouseMoved', 2, 990, { button: 'none' });
// the endless CSS animations running on things that can be seen
const anims = () => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations === Infinity).map((a) => {
  const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement;
  return n && n.checkVisibility({ visibilityProperty: true, opacityProperty: true }) ? `${a.animationName || 'anim'} ${n.tagName.toLowerCase()}.${String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/)[0]}` : null;
}).filter(Boolean);
async function measure(name, ms = MEASURE) {
  const lab = labUp() || name.startsWith('lab');
  P.take(); if (lab) await sbx('return window.__fps107?.take()');
  const s0 = lab ? await sbx('return window.__labPace?.state()') : null;
  const t0 = performance.now();
  await sleep(ms);
  const win = P.take();
  const page = lab ? await sbx('return window.__fps107?.take() || null') : null;
  const s1 = lab ? await sbx('return window.__labPace?.state()') : null;
  const sec = (performance.now() - t0) / 1000;
  const r = { window: win, anims: anims() };
  if (page) r.labPage = page;
  if (s0 && s1) r.labDrawnPerSec = Math.round(((s1.drawn - s0.drawn) / sec) * 10) / 10;
  out.states[name] = r;
  console.log(`[FPS107] ${name}`, JSON.stringify(r));
  return r;
}

// ---------- 1. idle with a chat open ----------
const claude = H.claudeAgent();
activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
await Native.send(claude.id, 'hello there');
await until(() => !Native.isAgentBusy(claude.id), 30000);
document.activeElement?.blur?.();
await sleep(3000);
await measure('chat early');
await until(() => performance.now() > 75000, 120000);
await measure('chat');

// ---------- 2. the giant chat open, then idle ----------
const GIANT = 'claude-giant0';
if ((H.chats || []).some((c) => c.id === GIANT)) {
  Native.open(claude.id, GIANT);
  const list = () => Native.view(claude.id)?.list;
  await until(() => list()?.querySelector('.msg[data-index="5999"]'), 60000);
  await sleep(1500);
  for (let i = 0; i < 30 && !list().querySelector('.msg[data-index="0"]'); i++) { list().scrollTop = 0; await sleep(150); }
  for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await sleep(300); }
  document.activeElement?.blur?.();
  await sleep(3000);
  await measure('giant');
} else step('the giant chat is in the list', false);

// ---------- 6. a long reply streaming ----------
Native.newChat(claude.id); await wait(300);
Native.send(claude.id, 'long code table please');
await until(() => document.querySelector('.surface.active .msg.streaming'), 15000);
await sleep(500);
await measure('stream', 3000);
await until(() => !Native.isAgentBusy(claude.id), 60000);
document.activeElement?.blur?.();
await sleep(3000);
await measure('streamDone'); // (the reply ended: nothing goes on animating)

// ---------- the sync panel open, idle ----------
if (typeof SyncPanel === 'undefined') await Lazy.load('syncpanel');
await SyncPanel.open();
document.activeElement?.blur?.();
await sleep(1500);
await measure('syncPanel');
SyncPanel.close();

// ---------- 5. Hearth behind another app ----------
document.activeElement?.blur?.();
await sleep(1500);
const realHasFocus = document.hasFocus;
document.hasFocus = () => false;
await T({ winEvent: { event: 'blur' } }); window.dispatchEvent(new Event('blur'));
await sleep(6500);
await measure('behind');
delete document.hasFocus;
await T({ winEvent: { event: 'focus' } }); window.dispatchEvent(new Event('focus'));
void realHasFocus;

// ---------- 3. the Lab with a scene playing on Auto ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 30000);
const lab = await ThreeLab.cmd();
const LOOP = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 96, 16), new THREE.MeshNormalMaterial()); scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; renderer.render(scene, camera); });`;
await ThreeLab.director.newSketch('fps107 loop', LOOP, 1);
await sleep(4000);
out.labIn = { pageCounters: await sbx('return Boolean(window.__fps107)'), screen: await sbx('return window.__fps107?.screen(1000)'), windowScreen: await P.screen(1000) };
step('the counters are in (the Lab preview\'s page)', out.labIn.pageCounters === true, out.labIn);
document.activeElement?.blur?.();
await measure('lab');

// ---------- 4. the Lab behind another app, then minimized ----------
document.hasFocus = () => false;
await T({ winEvent: { event: 'blur' } }); window.dispatchEvent(new Event('blur'));
await sleep(2000);
await measure('labBehind');
await T({ window: 'hide' });
await until(() => document.visibilityState === 'hidden', 5000);
await sleep(2000);
await measure('labHidden');
await T({ window: 'show' });
delete document.hasFocus;
await T({ winEvent: { event: 'focus' } }); window.dispatchEvent(new Event('focus'));
await sleep(1500);

// ---------- budgets (per second, on the faked 240 Hz screen) ----------
// idle: nothing per frame, a timer now and then; streaming: paced (not the screen's rate); the Lab: its page draws ≤ 60
// (≤ 30 behind) and wakes ≤ 2 frames per drawn one (it woke on each of the screen's 240); hidden: nothing at all
const B = { idleRaf: 1, idleTimers: 3, streamRaf: 40, streamTimers: 60, labDrawn: 62, labDrawnBehind: 32, labPageRaf: 140, labPageRafBehind: 80, labWindowRaf: 10, hiddenTimers: 1.5, ...(window.FPS107_BUDGET || {}) };
const S = out.states; const no = (k) => !S[k];
const over = (name, ok, info) => { if (!ok) out.problems.push(`${name}: ${JSON.stringify(info)}`); };
for (const k of ['chat', 'giant', 'streamDone', 'behind', 'syncPanel']) {
  if (no(k)) { out.problems.push(`${k}: not measured`); continue; }
  const w = S[k].window;
  over(`${k}: frame callbacks ≤ ${B.idleRaf}/s idle`, w.rafPerSec <= B.idleRaf, w);
  over(`${k}: timers ≤ ${B.idleTimers}/s idle`, w.timersPerSec <= B.idleTimers, w);
}
if (S.behind) over('behind: no endless animation runs with another app in front', !S.behind.anims.length, S.behind.anims);
if (S.stream) over(`stream: paced, not the screen's rate (≤ ${B.streamRaf} frame callbacks/s, ≤ ${B.streamTimers} timers/s)`, S.stream.window.rafPerSec <= B.streamRaf && S.stream.window.timersPerSec <= B.streamTimers, S.stream.window);
const L = (k) => S[k]?.labPage;
if (!L('lab') || !L('labBehind') || !L('labHidden')) out.problems.push('the Lab page\'s counters: not measured');
else {
  // (the Lab page's own thread is busy with the scene on software GL here: its fake screen ticks slower than the window's)
  over('the fake screen ticks like a fast one (≥ 150 frames a second in the window, ≥ 90 in the busy Lab page)', out.labIn.screen >= 90 && out.labIn.windowScreen >= 150, out.labIn);
  over(`lab: drawn ≤ ${B.labDrawn}/s on Auto, and drawn at all`, S.lab.labDrawnPerSec > 3 && S.lab.labDrawnPerSec <= B.labDrawn, S.lab.labDrawnPerSec);
  over(`lab: the Lab page wakes ≤ ${B.labPageRaf} frames/s and ≤ 2.5 per drawn one (it woke on every one of the screen's)`, L('lab').framesPerSec <= B.labPageRaf && L('lab').framesPerSec <= 2.5 * S.lab.labDrawnPerSec + 6, { page: L('lab'), drawn: S.lab.labDrawnPerSec });
  over(`lab: the window ≤ ${B.labWindowRaf} frame callbacks/s beside it`, S.lab.window.rafPerSec <= B.labWindowRaf, S.lab.window);
  over(`labBehind: drawn ≤ ${B.labDrawnBehind}/s`, S.labBehind.labDrawnPerSec > 1 && S.labBehind.labDrawnPerSec <= B.labDrawnBehind, S.labBehind.labDrawnPerSec);
  over(`labBehind: the Lab page wakes ≤ ${B.labPageRafBehind} frames/s and ≤ 2.5 per drawn one`, L('labBehind').framesPerSec <= B.labPageRafBehind && L('labBehind').framesPerSec <= 2.5 * S.labBehind.labDrawnPerSec + 6, { page: L('labBehind'), drawn: S.labBehind.labDrawnPerSec });
  over('labHidden: minimized, nothing drawn and no frames', S.labHidden.labDrawnPerSec === 0 && L('labHidden').rafPerSec === 0 && S.labHidden.window.rafPerSec === 0, { page: L('labHidden'), window: S.labHidden.window });
  over(`labHidden: ≤ ${B.hiddenTimers} timers/s in the window and the Lab page`, S.labHidden.window.timersPerSec <= B.hiddenTimers && L('labHidden').timersPerSec <= B.hiddenTimers, { page: L('labHidden'), window: S.labHidden.window });
  // test-only probes inert in normal use: the hitch recorder and the pictures' settle wait never ran a timer or a frame
  const probeSites = Object.values(S).flatMap((r) => [...(r.window.top || []), ...(r.labPage?.top || [])]).filter((x) => /hxTick|picsSettle|__labHitch|__labPicsSettle/.test(x));
  over('test-only probes (__labHitch, __labPicsSettle) never woke anything', !probeSites.length, probeSites);
}
out.table = Object.entries(out.states).map(([k, r]) => `${k}: window ${r.window.rafPerSec} rAF/s (${r.window.framesPerSec} frames) · ${r.window.timersPerSec} timers/s · ${r.window.idlePerSec} idle/s${r.labPage ? ` · lab page ${r.labPage.rafPerSec} rAF/s (${r.labPage.framesPerSec} frames) · ${r.labPage.timersPerSec} timers/s · drawn ${r.labDrawnPerSec}/s` : ''} · ${r.anims.length} endless anims`);
if (window.FPS107_REPORT) { out.unenforced = out.problems; out.problems = []; }
return J.done();
