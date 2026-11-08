// (round 151, perf151) the whole-app performance pass (docs/upgrades/perf151.md), ONE check of its wins, load-aware
// (a box too busy to tell — dev/loadwait.js's wait, the load average, --burn — widens the CPU budgets and reports
// "can't tell" instead of failing). Its own temp data and a fixture scene; never an owner's scene.
//   idle      a project chat open, nobody using it, 10 s: every process together ≤ 30 ms of CPU a second, the window's
//             wakeups ≤ 1.5 a second, no endless animation running unseen, the main process' timers ≤ 20 a minute
//   hush      nobody using the window (the hush, shortened to 3 s here): the Lab look's ambient loops (instrument
//             headers' live dot / sweep, the glints, the playhead's halo) are paused, not one endless animation runs
//   rest      a moving scene left on screen, stopped, nobody using Hearth: Auto fps eases the preview to 30 (from 60);
//             the first input brings 60 back; playing never rests
//   timeline  while the song plays the timeline's tick runs (a play that began while its canvas had no size yet parked
//             it for the whole song: fixed this round)
//   readouts  while a scene plays, the usage pass (usage.js decorate) is not woken by the Lab's live readouts
//   pointer   a quick flick into the preview's top-right corner that stops inside one 120 ms step: the view controls
//             come back (the pointer's last position is always sent; round 150 dropped it and they stayed hidden)
//   hidden    the controls pinned (I), Hearth hidden after the Lab: the stage's label writer stops, the window's wakeups
//             ≤ 0.6 a second, every process together ≤ 25 ms a second, the window may rest (backgroundThrottling on)
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/perf151.js
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
  P.take = () => {
    const ms = performance.now() - P.since;
    const per = (x) => Math.round(x * 10000 / ms) / 10;
    const out = { perSec: per(P.n), by: Object.fromEntries([...P.by].map(([k, v]) => [k, per(v)])), top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${per(v)}/s ${k}`) };
    P.n = 0; P.by.clear(); P.since = performance.now();
    return out;
  };
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
localStorage.setItem('idlecpu.hushMs', '3000'); // (nobody using the window: the minute before the hush shortened)
return 'probe installed';
//@@ reload
const out = { steps: [], measure: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
// a CPU budget judged load-aware: over it while the box was busy is "can't tell", not a failure
const judged = (name, ok, busy, info) => { if (ok || !busy) return step(name, ok, info); out.cantTell.push(name); out.steps.push(`? ${name} (can't tell under load) · ${JSON.stringify(info)}`); return true; };
const P = window.__pfProbe;
const wait = (ms) => new Promise((r) => P.raw.setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const sbx = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: `(() => { ${expr} })()`, returnByValue: true } }))?.result?.value;
const move = (x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none' } });
const park = () => move(2, innerHeight - 6);
const running = () => document.getAnimations().filter((a) => a.playState === 'running');
const infinite = () => running().filter((a) => a.effect?.getTiming?.().iterations === Infinity);
const descr = (a) => { const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement; return `${a.animationName || 'anim'} ${n ? `${n.tagName.toLowerCase()}.${String(n.className?.baseVal ?? n.className ?? '').split(' ')[0]}` : '?'}`; };
const unseen = (a) => { const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement; return !n || !n.checkVisibility({ visibilityProperty: true, opacityProperty: true }); };
// every process' CPU (ms a second) over ms of nothing, the window's wakeups, the main process' timers
async function idle(ms) {
  const snap = await smoke({ loadwait: 'snap' });
  const m0 = (await T({ metrics: true })).metrics; P.take(); await T({ probe: 'start' });
  const t0 = performance.now(); await wait(ms); const sec = (performance.now() - t0) / 1000;
  const page = P.take(); const main = (await T({ probe: 'take' })).probe; const m1 = (await T({ metrics: true })).metrics;
  const lw = await smoke({ loadwait: 1, since: snap.snap });
  let all = 0; const by = {};
  for (const p1 of m1.procs) { const p0 = m0.procs.find((x) => x.pid === p1.pid); if (!p0 || p1.cpuS == null) continue; const v = ((p1.cpuS - p0.cpuS) / sec) * 1000; all += v; by[p1.type] = Math.round(((by[p1.type] || 0) + v) * 10) / 10; }
  const busy = Boolean(window.SMOKE_BURN) || (lw?.loadavg?.[0] || 0) / Math.max(1, lw?.cpus || 1) >= 0.75 || (lw?.waited?.cpuWait || 0) > (lw?.waited?.wallMs || 1) * 0.1;
  return { allMsPerSec: Math.round(all * 10) / 10, by, wakeups: page.perSec, page, mainPerMin: main?.perMin ?? null, mainTop: main?.top?.slice(0, 3), busy, load: lw?.loadavg?.[0] != null ? Math.round(lw.loadavg[0] * 100) / 100 : null };
}

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  // ---------- idle: a project chat open, nobody using it ----------
  if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
  await Projects.ready(); await until(() => ProjChats._ok(), 20000);
  const proj = Projects.create({ name: 'Perf151 check' }); ProjChats.setScope(proj.id);
  const claude = H.claudeAgent();
  activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
  await Native.send(claude.id, 'hello there');
  await until(() => !Native.isAgentBusy(claude.id), 30000);
  document.activeElement?.blur?.(); await park();
  await until(() => performance.now() > 60000, 90000); // (the start's one-off work first: the recall index, the warm Lab page)
  await smoke({ cdp: 'HeapProfiler.collectGarbage' }); await wait(1500);
  const a = await idle(10000);
  const anU = running().filter((x) => x.effect?.getTiming?.().iterations === Infinity && unseen(x)).map(descr);
  out.measure.idle = { ...a, page: undefined, top: a.page.top, unseenLoops: anU };
  judged('idle: a project chat open, nobody using it: every process together ≤ 30 ms of CPU a second', a.allMsPerSec <= (a.busy ? 90 : 30), a.busy, out.measure.idle);
  step('idle: the window wakes ≤ 1.5 times a second, the main process\' timers ≤ 20 a minute, no endless animation running unseen', a.wakeups <= 1.5 && (a.mainPerMin == null || a.mainPerMin <= 20) && !anU.length, { wakeups: a.wakeups, main: a.mainPerMin, unseen: anU });

  // ---------- the Lab, a moving scene, stopped ----------
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && window.LabHudStage, 60000);
  const c = await ThreeLab.cmd(); const D = ThreeLab.director;
  try { LabRegroup.setLook('forge'); } catch { /* the default look */ }
  await D.newSketch('Perf fixture (perf151)', `import * as THREE from 'three';
const r = new THREE.WebGLRenderer({ antialias: false }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const s = new THREE.Scene(); s.background = new THREE.Color('#06101c'); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.z = 5;
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 96, 12), new THREE.MeshNormalMaterial()); s.add(m);
r.setAnimationLoop((t) => { m.rotation.y = t / 900; m.rotation.x = t / 1700; r.render(s, cam); });`, 1);
  await until(async () => (await sbx('return window.__labPace ? window.__labPace.state().drawn : 0')) > 5, 30000);
  try { c.code?.(false); } catch { /* fine */ }
  await wait(1500);
  const pv = [...document.querySelectorAll('.surface.active .three-preview')].find((n) => n.getBoundingClientRect().width > 100);
  const pill = pv?.querySelector(':scope > .stage-pill');

  // ---------- pointer: a quick flick into the top-right corner ----------
  {
    const S = () => LabHudStage.state();
    const R = pv.getBoundingClientRect();
    const res = [];
    for (let i = 0; i < 3; i++) {
      await move(R.left + R.width * 0.4, R.top + R.height * 0.6); await wait(2600); // (awake, then idle: hidden)
      await move(R.left + R.width * 0.45, R.top + R.height * 0.55); // (sent: the first move after a pause)
      await wait(30);
      await move(R.right - 80, R.top + 36); // (inside the same 120 ms step, then still)
      await wait(700);
      res.push({ zone: S().zone, idle: S().idle, pill: Math.round(Number(getComputedStyle(pill).opacity) * 100) / 100 });
    }
    out.measure.flick = res;
    step('pointer: a quick flick into the preview\'s top-right corner that stops: the view controls come back (3 of 3)', res.every((x) => x.zone === 'tr' && x.pill > 0.9), res);
    await park();
  }

  // ---------- hush + rest ----------
  {
    await park(); document.activeElement?.blur?.();
    await until(() => document.documentElement.hasAttribute('data-hush'), 15000);
    await wait(600);
    const inf = infinite().map(descr);
    const capRest = await until(async () => { const v = await sbx('return window.__labPace.state().cap'); return v === 30 ? v : null; }, 5000);
    out.measure.hush = { hushed: document.documentElement.hasAttribute('data-hush'), infinite: inf, cap: capRest ?? await sbx('return window.__labPace.state().cap'), rest: window.__labRest?.() };
    step('hush: nobody using the window: not one endless animation runs (the Lab look\'s ambient loops paused)', out.measure.hush.hushed && !inf.length, out.measure.hush);
    step('rest: a moving scene left stopped with nobody using Hearth: the preview eases to 30 a second', capRest === 30, out.measure.hush);
    await move(innerWidth / 2, innerHeight - 4); // (an input in the window)
    const back = await until(async () => { const v = await sbx('return window.__labPace.state().cap'); return v === 60 ? v : null; }, 4000);
    step('rest: the first input brings the preview back to 60', back === 60, { cap: back ?? await sbx('return window.__labPace.state().cap'), hushed: document.documentElement.hasAttribute('data-hush') });
    await park();
    await until(() => document.documentElement.hasAttribute('data-hush'), 15000);
    // (a song on the timeline: realscene-lib's 124 BPM one, the check's own temp file)
    try { const f = await RS.files(); await c.loadSong(f.song); await until(() => c.state.bpm > 0, 30000); } catch (err) { out.songNote = String(err).slice(0, 200); }
    await park(); await until(() => document.documentElement.hasAttribute('data-hush'), 15000);
    const t0 = window.LabPlay?.counts?.().tick || 0;
    c.play(true); await until(() => window.LabPlay?.playing, 5000); await wait(1200);
    const ticks = await until(() => ((window.LabPlay?.counts?.().tick || 0) - t0) >= 5 ? (window.LabPlay.counts().tick - t0) : null, 6000);
    step('timeline: while the song plays the timeline ticks (its playheads and picture move), the window hushed', Boolean(ticks), { ticks, song: Boolean(c.state.bpm) });
    const capPlay = await sbx('return window.__labPace.state().cap');
    // readouts: the usage pass is not woken while it plays
    P.take(); await wait(6000); const pg = P.take();
    const deco = Object.entries(pg.by).filter(([k]) => /idleDecorate|usage\.js:2\d\d/.test(k)).reduce((s, [, v]) => s + v, 0);
    c.play(false); await wait(400);
    out.measure.play = { cap: capPlay, hushed: document.documentElement.hasAttribute('data-hush'), decoratePerSec: deco, top: pg.top };
    step('rest: never while it plays (60 while the song plays, the window hushed)', capPlay === 60, out.measure.play);
    step('readouts: while a scene plays the usage pass is not woken by the Lab\'s live readouts (≤ 0.2 a second)', deco <= 0.2, out.measure.play);
  }

  // ---------- hidden: pinned, then Hearth hidden ----------
  {
    LabHudStage.pin(true); await wait(500);
    const labelsOn = Boolean(LabHudStage.state().pinned);
    await T({ window: 'hide' });
    await until(() => document.visibilityState === 'hidden', 5000);
    await wait(3000);
    const h = await idle(10000);
    const labels = Object.entries(h.page.by).filter(([k]) => /^interval .*three-hudstage\.js/.test(k)).reduce((s, [, v]) => s + v, 0);
    const wins = (await T({ windows: true }))?.windows || [];
    await T({ window: 'show' }); await wait(800);
    LabHudStage.pin(false);
    out.measure.hidden = { ...h, page: undefined, top: h.page.top, labels, labelsOn, windows: wins };
    step('hidden: the stage\'s label writer stops (pinned, Hearth hidden), the window wakes ≤ 0.6 times a second', labelsOn && labels === 0 && h.wakeups <= 0.6, { labels, wakeups: h.wakeups, top: h.page.top });
    judged('hidden: every process together ≤ 25 ms of CPU a second', h.allMsPerSec <= (h.busy ? 75 : 25), h.busy, { all: h.allMsPerSec, by: h.by });
    const main = wins.find((w) => /index\.html/.test(w.url));
    step('hidden: Hearth\'s window may rest when hidden (backgroundThrottling on)', main?.throttling === true, wins);
  }
} catch (err) { step(`threw: ${String(err?.stack || err).slice(0, 500)}`, false); }
if (!out.cantTell.length) delete out.cantTell;
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
