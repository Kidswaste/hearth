// ▶ Play's hitch map (round 63, hitchmap63: tools/hitchmap-page.js, hitchmap-core.js, hitchmapmain.js, hitchmap.js).
//   off      a Lab scene ("Clink hitch": a player lapping a circle of radius 6, the camera following, saveState /
//            restoreState, and a forced hitch of 450 ms each time the player passes x 6, z 0) played with the hitch map
//            off (the default): no recorder script in the page, no window.__hearthHitch, ▶ Play's budget has no 'hitch'
//            helper, the hint doesn't mention it, no hitch folder for the game; the page's listeners on window /
//            document and frame callbacks a frame counted (the baseline for "on")
//   on       /playtest hitchmap on → the next ▶ Play records: the hint says so, F → the chip reads "● Hitch map 0:12",
//            the budget lists 'the hitch map' as a helper; exactly one listener (visibilitychange) and one frame callback
//            more than off; its own time under 0.05 ms a frame (its count and the budget's), its garbage per frame
//            (V8's sampling heap profiler, bytes booked to /__hitchmap-page.js) ≤ 96 B, about the budget watch's own
//   map      after ≥ 3 forced hitches, Ctrl/⌘+P back to editing → "▦ Hitch map of Clink hitch" → Open the map: the
//            heatmap, the timeline, the worst spot listed first is the forced one (x 6, z 0 within 1.5), 1–4 pictures of
//            spikes, saved in data/game-cache/lab-<scene>/hitch/
//   jump     Jump there on spot 1 → the Lab preview's layer gets restoreState() with what it saved at the spike (the
//            player's angle at x 6, z 0), or (no picture there) its camera put back
//   fix      Fix this → the docked director's box holds the hitch map's task with the numbers (and the picture), not sent
//   chat     /playtest hitchmap lists the spots; leaving rebuilds the map at the window's close; /playtest hitchmap off
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/hitchmap63.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const ui = (sel, what = 'textContent') => ev(`(() => { const n = document.querySelector('hearth-game-ui')?.shadowRoot?.querySelector(${JSON.stringify(sel)}); return n ? (${JSON.stringify(what)} === 'shown' ? !n.hidden : n.textContent) : null; })()`);
const pc = (method, params, ms = 30000) => Promise.race([smoke({ pageCdp: '^hearth-game:', cdp: method, params }), wait(ms).then(() => ({ error: 'timeout' }))]);
const X = (req) => G().hitch(req);
const say = async (line) => { let t = ''; const grab = (x) => { t += `${t ? '\n' : ''}${x ?? ''}`; }; await Commands.tryRun(line, H.claudeAgent().id, null, { source: 'chat', say: grab, note: grab }); return t; };
const toasts = () => [...document.querySelectorAll('.toast')].map((x) => x.textContent);
const budget = async () => { const v = await ev('window.__hearthBudget ? window.__hearthBudget.pub() : ""'); return v ? JSON.parse(v) : null; };
const K = { x: 6, z: 0 };

async function listeners() {
  let n = 0; const by = {};
  for (const expr of ['window', 'document']) {
    const o = await pc('Runtime.evaluate', { expression: expr });
    const id = o?.result?.objectId; if (!id) return { error: o?.error || 'no object' };
    for (const l of (await pc('DOMDebugger.getEventListeners', { objectId: id }))?.listeners || []) { n += 1; by[l.type] = (by[l.type] || 0) + 1; }
  }
  return { n, by };
}
// the page's frame callbacks a frame: requestAnimationFrame calls counted for 1.5 s (Hearth's captured the real one at
// load: counted through the frames instead — the recorder's frames count goes up by one a frame)
async function rafPerFrame() {
  await ev(`(() => { const W = window; if (W.__hmRaf) return 1; const raf = W.requestAnimationFrame; const c = { calls: 0, frames: 0, raf }; W.__hmRaf = c; W.requestAnimationFrame = function (f) { c.calls += 1; return raf.call(W, f); }; const tick = () => { c.frames += 1; if (W.__hmRaf === c) raf.call(W, tick); }; raf.call(W, tick); return 1; })()`);
  await wait(1500);
  const r = JSON.parse(await ev(`(() => { const c = window.__hmRaf; window.requestAnimationFrame = c.raf; delete window.__hmRaf; return JSON.stringify({ calls: c.calls, frames: c.frames }); })()`));
  return { ...r, perFrame: r.frames ? +(r.calls / r.frames).toFixed(2) : null };
}
// bytes a frame booked to the recorder's script (V8's sampling heap profiler, what dies young included: gcchurn60's way).
// The browser's own bookkeeping at the start of every frame of a WebGL page is booked to whichever JavaScript runs first
// in the frame: gcchurn60's empty first-in-frame function (a CSS animation's animationiteration listener) takes it and it
// is counted apart (frameStart), neither the recorder's nor the game's
const SINK = `(() => { if (window.__hm63sink != null) return 1; const st = document.createElement('style'); st.textContent = '@keyframes hm63f { from { opacity: 1 } to { opacity: 0.99 } } .hm63f { position: fixed; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; animation: hm63f 4ms linear infinite; }'; document.documentElement.appendChild(st); const d = document.createElement('div'); d.className = 'hm63f'; document.documentElement.appendChild(d); window.__hm63sink = 0; addEventListener('animationiteration', function browserFrameStart() { window.__hm63sink += 1; }); return 1; })()`;
async function garbage(sec = 6) {
  const SAMPLE = 64;
  await ev(SINK); await wait(1500);
  await pc('HeapProfiler.enable', {}); await pc('HeapProfiler.collectGarbage', {});
  const f0 = JSON.parse(await ev('window.__hearthHitch.pub()')).frames;
  const s = await pc('HeapProfiler.startSampling', { samplingInterval: SAMPLE, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  if (s?.error) return { error: s.error };
  await wait(sec * 1000);
  const p = await pc('HeapProfiler.stopSampling', {}, 60000);
  const f1 = JSON.parse(await ev('window.__hearthHitch.pub()')).frames;
  if (!p?.profile) return { error: 'no profile' };
  let mine = 0; let total = 0; let start = 0; let watch = 0; const top = {};
  const stack = [];
  const walk = (nd) => {
    stack.push(nd);
    if (nd.selfSize) {
      total += nd.selfSize;
      let at = null; let first = false; for (let i = stack.length - 1; i >= 0 && !at; i -= 1) { if (stack[i].callFrame.functionName === 'browserFrameStart') first = true; if (stack[i].callFrame.url) at = stack[i].callFrame; }
      if (first) start += nd.selfSize;
      else if (at && /__playbudget-page\.js/.test(at.url)) watch += nd.selfSize;
      else if (at && /__hitchmap-page\.js/.test(at.url)) { mine += nd.selfSize; const k = `${at.functionName || '(anon)'}:${at.lineNumber + 1} ← ${nd.callFrame.functionName || '?'}`; top[k] = (top[k] || 0) + nd.selfSize; }
    }
    for (const c of nd.children || []) walk(c);
    stack.pop();
  };
  walk(p.profile.head);
  const frames = Math.max(1, f1 - f0);
  return { frames, perFrame: Math.round((mine / frames) * 10) / 10, frameStart: Math.round((start / frames) * 10) / 10, watchPerFrame: Math.round((watch / frames) * 10) / 10, totalPerFrame: Math.round(total / frames), top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${Math.round(v / frames * 10) / 10} B ${k}`) };
}

const GAME = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0f1622');
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: '#1e2a3a' })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const spot = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.05, 24), new THREE.MeshBasicMaterial({ color: '#7a2730' })); spot.position.set(6, 0.03, 0); scene.add(spot);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshNormalMaterial()); player.name = 'player'; scene.add(player);
let ang = Math.PI; let last = 0; let lastHitch = -1e9;
const S = { hitches: 0, restored: null, cam, player, hold: false };
globalThis.game = { player };
globalThis.__hm = S;
renderer.setAnimationLoop((t) => {
  const dt = last ? Math.min(t - last, 100) : 16; last = t;
  ang += (dt / 1000) * ((Math.PI * 2) / 8); // a lap in 8 s
  player.position.set(6 * Math.cos(ang), 0.3, 6 * Math.sin(ang));
  cam.position.set(player.position.x * 1.7, 8, player.position.z * 1.7 + 0.01); cam.lookAt(0, 0, 0);
  // the known stutter: 450 ms of work each time the player passes x 6, z 0
  if (!S.hold && Math.hypot(player.position.x - 6, player.position.z) < 1.2 && t - lastHitch > 3000) { lastHitch = t; S.hitches += 1; const until = performance.now() + 450; while (performance.now() < until) { /* stall */ } }
  renderer.render(scene, cam);
});
export function saveState() { return { ang, hitches: S.hitches }; }
export function restoreState(s) { ang = s.ang; S.restored = s; }`;
const LAYERS = [{ id: 'game', name: 'Game', code: GAME }];

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
await Commands.tryRun('/director-setup', H.claudeAgent().id);
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
await Lazy.load('gamemode');
await Lazy.load('directorgame').catch(() => {});
let src = null; let map = null;
const up = async () => { const ok = await until(() => ev('Boolean(window.__hearthGame && window.__hearthGame.drawn && globalThis.__hm && window.__labHot && window.__labHot.info().hooks.includes("game"))'), 90000); await until(async () => (await budget())?.playing, 20000); return ok; };
const leave = async () => { await GameMode.leave(); await until(async () => !(await G().state())?.playing, 10000); };

await safe('off', async () => {
  const x = ThreeLab.scenes.create({ name: 'Clink hitch', code: GAME, layers: LAYERS, open: true });
  const id = x?.id || ThreeLab.scenes.all().find((s) => s.name === 'Clink hitch')?.id;
  ThreeLab.scenes.open(id);
  await wait(2500);
  src = { kind: 'lab', id, title: 'Clink hitch' };
  step('the hitch map is off by default', HitchMap.isOn() === false && HitchMap.prefs().on === false);
  await GameMode.play(src);
  step('the scene plays in ▶ Play', await up());
  await wait(2500);
  const b = await budget();
  const page = JSON.parse(await ev(`JSON.stringify({ hitch: typeof window.__hearthHitch, tags: [...document.scripts].filter((s) => /__hitchmap/.test(s.src)).length })`));
  const hint = await ui('.hint');
  out.measure.off = { helpers: Object.keys(b?.helpers || {}), hearthMs: b?.avgMs, listeners: await listeners(), raf: await rafPerFrame(), page, hint };
  step('off: nothing of it in the game window (no script, no window.__hearthHitch)', page.hitch === 'undefined' && page.tags === 0, page);
  step('… ▶ Play\'s budget has no hitch-map helper (its helpers as before)', b && !('hitch' in (b.helpers || {})) && Object.keys(b.helpers).length > 0, out.measure.off.helpers);
  step('… the hint doesn\'t mention it', !/hitch/i.test(hint || ''), hint);
  await leave();
  const ls = await X({ op: 'list', source: src });
  step('… and no map made for the game', ls?.ok && ls.maps.length === 0, ls);
});

await safe('on', async () => {
  const t = await say('/playtest hitchmap on');
  step('/playtest hitchmap on → recording from the next ▶ Play', HitchMap.isOn() && /next ▶ Play/.test(t), t);
  await GameMode.play(src);
  step('the scene plays again', await up());
  const hint = await ui('.hint');
  step('the start hint says it records', /recording the hitch map/.test(hint || ''), hint);
  await wait(1500);
  await G().key({ key: 'F' });
  const chip = await until(async () => { const c = await ui('.chip'); return /● Hitch map \d:\d\d/.test(c || '') ? c : null; }, 8000);
  step('F: the chip shows "● Hitch map 0:0x" while it records', chip, chip || await ui('.chip'));
  await G().key({ key: 'F' });
  const page = JSON.parse(await ev(`JSON.stringify({ hitch: typeof window.__hearthHitch, tags: [...document.scripts].filter((s) => /__hitchmap/.test(s.src)).length })`));
  const ls = await listeners(); const rf = await rafPerFrame();
  out.measure.on = { page, listeners: ls, raf: rf };
  const off = out.measure.off;
  step('on: its script is in the page (once)', page.hitch === 'object' && page.tags === 1, page);
  step('… one listener more than off (visibilitychange)', !ls.error && !off.listeners.error && ls.n === off.listeners.n + 1 && (ls.by.visibilitychange || 0) === (off.listeners.by.visibilitychange || 0) + 1, { off: off.listeners.by, on: ls.by });
  step('… frame callbacks a frame: what off had (its own frame callback took the real requestAnimationFrame at load)', rf.perFrame != null && Math.abs(rf.perFrame - off.raf.perFrame) < 0.35, { off: off.raf, on: rf });
});

await safe('cost', async () => {
  // play past the known spot a few times
  const n = await until(async () => { const v = await ev('__hm.hitches'); return v >= 3 ? v : null; }, 150000);
  await wait(1200);
  const p = JSON.parse(await ev('window.__hearthHitch.pub()'));
  const b = await budget();
  const g = await garbage(6);
  out.measure.cost = { hitches: n, page: p, helper: b?.helpers?.hitch, hearthMs: b?.avgMs, garbage: g };
  step('the forced hitches happened while it recorded', n >= 3 && p.frames > 50 && p.on, { hitches: n, frames: p.frames, spikes: p.spikes });
  step('its own time under 0.05 ms a frame (its count)', p.avgMs != null && p.avgMs < 0.05, { avgMs: p.avgMs, spentMs: p.spentMs, frames: p.frames });
  step('… a helper of ▶ Play\'s budget, measured there under 0.05 ms and still on', b?.helpers?.hitch && b.helpers.hitch.on && (b.helpers.hitch.avg ?? b.helpers.hitch.ms) < 0.05, b?.helpers?.hitch);
  // (the ring itself makes nothing; what's left is this machine running the frame callback unoptimised: its two clock
  // reads boxed, like the budget watch's own, which is reported beside it)
  step('… garbage a frame booked to it: ≤ 96 B (typed ring, positions copied by builtins; about the budget watch\'s own)', !g.error && g.perFrame <= 96, g);
  step('pictures of spikes: 1 to 4', p.shots >= 1 && p.shots <= 4, { shots: p.shots, spikes: p.spikes });
});

await safe('map', async () => {
  for (const x of document.querySelectorAll('.toast')) x.remove();
  await ev('__hm.hold = true; 1'); // (no stall while the map is read)
  await G().key({ key: 'P', mods: ['control'] });
  const rested = await until(() => GameMode.state().resting, 8000);
  const t = await until(() => toasts().find((x) => /▦ Hitch map of Clink hitch/.test(x)), 15000);
  step('Ctrl/⌘+P back to editing → "▦ Hitch map of Clink hitch"', rested && t, { toasts: toasts() });
  [...document.querySelectorAll('.toast button')].find((b) => /Open the map/.test(b.textContent))?.click();
  const dlg = await until(() => document.querySelector('dialog.hm-map[open] .hm-row') && document.querySelector('dialog.hm-map[open]'), 8000);
  map = HitchMap.state().view ? (await X({ op: 'get', source: src }))?.map : null;
  const top = map?.spots?.[0];
  out.measure.map = map ? { brief: HitchMapCore.brief(map), secs: map.secs, frames: map.frames, typical: map.typical, hitch: map.hitch, hitches: map.hitches, axes: map.grid.axes, grid: [map.grid.w, map.grid.h], spots: map.spots.map((s) => HitchMapCore.line(s, map)), top: top && { x: top.x, z: top.z, n: top.n, worst: top.worst, lost: top.lost, shot: top.shot || null }, shots: map.shots.length, cost: map.cost } : null;
  step('the map opens: the heatmap, the timeline, the spots', dlg && dlg.querySelectorAll('canvas.hm-canvas').length === 2 && dlg.querySelectorAll('.hm-row').length >= 1, { rows: [...(dlg?.querySelectorAll('.hm-line') || [])].map((x) => x.textContent) });
  step('the worst spot is the forced hitch (x 6, z 0)', top && map.grid.axes.join() === 'x,z' && Math.hypot(top.x - K.x, top.z - K.z) < 1.5 && top.n >= 2 && top.worst >= 400, out.measure.map?.top);
  step('… spikes pictured (1–4), the worst spot\'s among them', map && map.shots.length >= 1 && map.shots.length <= 4 && Boolean(top?.shot), { shots: map?.shots?.map((s) => [s.t, s.dt, s.file, s.pos]) });
  const shot = top?.shot ? map.shots.find((x) => x.id === top.shot) : null;
  const p = shot?.file ? await X({ op: 'shot', source: src, file: shot.file, path: true }) : null;
  out.measure.path = p?.path;
  step('saved per game in data/game-cache/lab-<scene>/hitch/', (await X({ op: 'list', source: src }))?.maps?.length >= 1 && /game-cache[\\/]lab-[^\\/]+[\\/]hitch[\\/]h\w+-\d\.jpg$/.test(p?.path || ''), p?.path);
});

await safe('jump', async () => {
  const d = ThreeLab.director;
  await until(async () => (await d.evalInSketch('return Boolean(globalThis.__hm && window.__labHot && window.__labHot.info().hooks.includes("game"))'))?.value === true, 20000);
  await d.evalInSketch('__hm.restored = null; return 1');
  const b = [...document.querySelectorAll('dialog.hm-map[open] .hm-row')][0]?.querySelector('.hm-acts button');
  b?.click();
  const r = await until(async () => { const x = await d.evalInSketch('return JSON.stringify(__hm.restored)'); const v = x?.ok ? JSON.parse(x.value) : null; return v || null; }, 10000);
  const tst = await until(() => toasts().find((x) => /hitch spot 1/.test(x)), 4000);
  out.measure.jump = { restored: r, toast: tst };
  step('Jump there → the Lab\'s layer back at that moment (restoreState: the player at x 6, z 0)', r && Math.cos(r.ang) > 0.8 && Math.abs(Math.sin(r.ang)) < 0.6 && /what it saved then/.test(tst || ''), out.measure.jump);
});

await safe('fix', async () => {
  await HitchMap.open({ source: src });
  await until(() => document.querySelectorAll('dialog.hm-map[open] .hm-row').length >= 1, 5000);
  const btn = [...document.querySelectorAll('dialog.hm-map[open] .hm-row')][0]?.querySelectorAll('.hm-acts button')[1];
  btn?.click();
  const dir = H.agents().find((a) => a.dock === 'three');
  const ta = await until(() => [...document.querySelectorAll('.composer textarea')].find((x) => /Hitch map from Clink hitch/.test(x.value)), 12000);
  const pics = await until(() => (Native.view(dir.id)?.attachments || []).filter((a) => a.kind === 'image' && /\.jpe?g$/i.test(a.path || a.name || '')), 6000);
  await wait(1500);
  out.measure.draft = ta?.value;
  step('Fix this → the director\'s box holds the task with the numbers and the picture', ta && /Worst spot #1 of \d+, near x [56]/.test(ta.value) && /worst \d+ ms/.test(ta.value) && /Fix this:/.test(ta.value) && pics?.length >= 1, { draft: ta?.value, pics: pics?.length });
  step('… never sent (still in the box)', ta && /Hitch map from/.test(ta.value));
  if (ta) Native.setDraft(dir.id, '');
  if (Native.view(dir.id)) Native.view(dir.id).attachments.length = 0;
});

await safe('chat', async () => {
  const t = await say('/playtest hitchmap');
  (await until(() => document.querySelector('dialog.hm-map[open]'), 4000))?.close?.();
  await until(() => !HitchMap.state().view, 3000);
  step('/playtest hitchmap lists the spots', /Clink hitch — hitch map: /.test(t) && /^1\. near x/m.test(t), t);
  // leaving: the window's close waits for the page's ring once and the map is built again
  const before = (await X({ op: 'list', source: src }))?.maps?.[0];
  for (const x of document.querySelectorAll('.toast')) x.remove();
  await PlayLoop.wake?.().catch?.(() => {});
  await wait(800);
  await leave();
  const again = await until(() => toasts().find((x) => /▦ Hitch map of Clink hitch/.test(x)), 8000);
  const after = (await X({ op: 'get', source: src }))?.map;
  step('leaving: the map built again at the window\'s close (same session)', again && after && after.id === before?.id && after.why === 'end', { why: after?.why, id: after?.id, toast: again });
  const o = await say('/playtest hitchmap off');
  step('/playtest hitchmap off', !HitchMap.isOn() && /off/.test(o), o);
});

try { if (GameMode.playing) await GameMode.leave(); } catch { /* fine */ }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out);
