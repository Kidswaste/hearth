// (round 77, perfguard77) The in-app half of dev/perfguard.js: one launch of Hearth on the heavy profile with 40
// projects (dev/bigprofile.js --projects 40), measuring the gains of rounds 65–76 the way their own checks did, each
// a few times in the launch (dev/perfguard.js launches it several times and takes medians). Samples, not verdicts:
// perfguard.js compares them with dev/perf-baseline.json.
//   project.coldOpen   the first project opened since this start (Clink, opened once in the session before), Hearth's
//                      part: the click → ready, minus the scene's own GPU work in its page (projects72 / coldopen73)
//   project.warmOpen   ‹ Projects → the Clink card again (×2)
//   project.switch     the name ▾ → another project (×6), Hearth's part
//   chat.switch        a list row clicked (real mouse) → the long chat drawn at the next frame (×8)
//   chat.clickHandler  the window's own handlers for that click (pointer / mouse / click events, capture → bubble)
//   chat.clickCpu      the window's CPU in the 600 ms after each row click (profiler samples, not idle)
//   chat.keyHandler    handlers per key while typing 30 keys in the long chat's box (chatsteady73)
//   lab.toolCall       a Lab tool call that sends no picture, end to end through the fake engine's real MCP calls
//                      (labcalls74: HubBridge's total), 9 tools × 2 rounds on a scene on screen
//   lab.stillDraws     a still scene left alone: the preview's draws a second over 10 s (labdraw74 / labpace)
//   idle.windowCpu / idle.allCpu   a chat on screen, nobody touching it: % of one CPU over 10 s (idlecpu)
//   mem.windowHeap     the window's JS heap after a forced GC at the end (MB; the flat-memory guard's cheap proxy)
// Each section's window CPU profile gives its top functions (self time): the culprit list perfguard.js prints.
// The result is written to <SMOKE_TMP>/perfguard-probe.json (smoke.js --tmp keeps that folder).
//   node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 600000 --script dev/perfguard-probe.js
{ const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
  const til = async (fn, what, n = 600) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await w8(20); } throw Error(`timed out: ${what}`); };
  // the session before: Clink opened once and left, as the owner always has a project they were in (coldopen73)
  await til(() => document.querySelector('#agent-buttons .space-button'), 'app', 1500); await w8(2500);
  document.querySelector('#agent-buttons [data-space=projects]').click();
  const c = await til(() => document.querySelector('.pj-card[data-project="pjbp0"]'), 'cards', 1500); await w8(300);
  c.click();
  await til(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === 'pjbp0', 'first open', 2000);
  await w8(500); await ProjectWorkspace.home(); await Projects.flush(); await w8(800);
  localStorage.setItem('idlecpu.hushMs', '2000'); // (the owner away: the look's ambient loops hushed after 2 s, not a minute, as idlecpu does)
  return 'the session before: Clink opened once'; }
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 600, step = 20) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } throw Error(`timed out: ${what}`); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
const R = { samples: {}, tops: {}, notes: {}, problems: [] };
const add = (k, v) => { if (Number.isFinite(v)) (R.samples[k] ||= []).push(Math.round(v * 10) / 10); };
const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const click = async (n) => { n.scrollIntoView({ block: 'nearest' }); await frame(); const [x, y] = mid(n); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const key = async (ch) => { const p = ch === ' ' ? { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 } : { key: ch, code: `Key${ch.toUpperCase()}`, text: ch, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) }; await cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: p.key, code: p.code, windowsVirtualKeyCode: p.windowsVirtualKeyCode }); };
// the window's own handlers per input: from the event reaching the window (capture) to it leaving (bubble)
const HT = { on: false, ms: 0 }; const began = new WeakMap();
for (const n of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown', 'keypress', 'beforeinput', 'input', 'keyup']) {
  addEventListener(n, (e) => { if (HT.on) began.set(e, performance.now()); }, true);
  addEventListener(n, (e) => { const s = began.get(e); if (s != null) { HT.ms += performance.now() - s; began.delete(e); } }, false);
}
// a section's window CPU profile: its top functions by self time (idle / program left out), and the busy ms per window
let prof = null;
async function profStart() { await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 250 }); await cdp('Profiler.start'); prof = { t0: performance.now() }; }
async function profStop(section, windows = []) {
  const p = (await cdp('Profiler.stop'))?.profile; const t0 = prof?.t0 || 0; prof = null;
  if (!p) { R.problems.push(`${section}: no profile`); return []; }
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const self = new Map(); const busy = windows.map(() => 0);
  let t = p.startTime; const off = t0 * 1000 - p.startTime;
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i] || 0; const dt = (p.timeDeltas[i + 1] || 0) / 1000; const at = (t + off) / 1000;
    const cf = byId.get(p.samples[i]).callFrame;
    if (/^\((idle|program)\)$/.test(cf.functionName)) continue;
    const k = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + dt);
    windows.forEach((w, j) => { if (at >= w[0] && at < w[1]) busy[j] += dt; });
  }
  R.tops[section] = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, ms]) => [k, Math.round(ms * 10) / 10]);
  return busy;
}
const section = async (name, fn) => { const t0 = Date.now(); try { await fn(); } catch (err) { R.problems.push(`${name}: ${String(err?.message || err).slice(0, 300)}`); if (prof) await profStop(name); } R.notes[`${name}Secs`] = Math.round((Date.now() - t0) / 100) / 10; };
window.hub.openExternal = () => {};
await until(() => document.querySelector('#panel .item') || document.querySelector('#agent-buttons .space-button'), 'app', 1500);
// quiet first: no window long task for 3 s (≤ 40 s), so each launch starts measuring from the same calm
{ const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
  for (let i = 0, last = -1, still = 0; i < 80 && still < 6; i++) { await wait(500); if (longs.length === last) still += 1; else { still = 0; last = longs.length; } } }

// ---------- projects (projects72's measure: Hearth's part = the wall minus the scene's own work in its page) ----------
await section('projects', async () => {
  const sc = { start: 0, drawn: 0, warm: 0 };
  addEventListener('message', (e) => { const d = e.data; const t = d?.type; if (t === 'fixture-layer-start' && !sc.start) sc.start = d.at; if (t === 'stack-drawn') sc.drawn = Date.now(); if (t === 'ready-prepped') sc.warm = Number(d.ms) || 0; }, true);
  const ready = (id) => { const s = ProjectWorkspace.state(); return s.phase === 'ready' && s.project === id; };
  const card = (id) => document.querySelector(`.pj-card[data-project="${id}"]`);
  const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()));
  const timed = async (id, act) => {
    await frame(); Object.assign(sc, { start: 0, drawn: 0, warm: 0 }); const t0 = performance.now(); act();
    await until(() => ready(id), `${id} ready`, 2000); await frame();
    const wall = performance.now() - t0; const scene = (sc.start && sc.drawn > sc.start ? sc.drawn - sc.start : 0) + sc.warm;
    return wall - scene;
  };
  const toProjects = async () => { (document.querySelector('.workspace-back') || document.querySelector('#agent-buttons [data-space=projects]')).click(); await until(() => !ProjectWorkspace.current() && card('pjbp0'), 'Projects home', 1500); await frame(); };
  document.querySelector('#agent-buttons [data-space=projects]').click();
  await until(() => card('pjbp0'), 'cards', 1500); await Projects.ready();
  // (the Lab may mount out of sight after the start for the last project's scene: given its time, as projects72 does)
  try { await until(() => H.surfaces.get('tool:three')?.mounted || (LabBoot.state().skipped && !LabBoot.state().up), 'lab mounted', 1000); } catch { /* not this time */ }
  card('pjbp0').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); await wait(300);
  await profStart();
  add('project.coldOpen', await timed('pjbp0', () => card('pjbp0').click()));
  for (let i = 0; i < 2; i++) { await toProjects(); await wait(300); add('project.warmOpen', await timed('pjbp0', () => card('pjbp0').click())); }
  for (let r = 0; r < 2; r++) for (const id of ['pjbp1', 'pjbp2', 'pjbp0']) {
    await wait(250);
    add('project.switch', await timed(id, () => { document.querySelector('.workspace-project-name').click(); const name = Projects.get(id).name; menuItem(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).click(); }));
  }
  await profStop('projects');
  await ProjectWorkspace.home(); await wait(800);
});

// ---------- chats: long chats opened by their list rows, then typing ----------
await section('chats', async () => {
  const claude = H.claudeAgent();
  const chats = (await window.hub.listChats().catch(() => [])) || [];
  const longChats = chats.filter((c) => c.agentId === claude.id && /-long\d/.test(c.id)).slice(0, 9);
  if (longChats.length < 9) throw Error(`only ${longChats.length} long chats`);
  activate(claude.id); await wait(500);
  Native.open(claude.id, longChats[0].id); await until(() => Native.view(claude.id)?.list.querySelectorAll('.msg').length > 20, 'first long chat', 200); await wait(2000);
  const marks = [];
  await profStart();
  for (let i = 1; i <= 8; i++) {
    const row = await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(longChats[i].id)}"]`), `row ${i}`, 40).catch(() => null);
    if (!row) { R.problems.push(`chats: no list row for ${longChats[i].id}`); continue; }
    HT.ms = 0; HT.on = true; const t0 = performance.now();
    await click(row);
    HT.on = false; const handler = HT.ms;
    await until(() => H.activeChat[claude.id] === longChats[i].id && Native.view(claude.id).list.querySelectorAll('.msg').length > 20, `long chat ${i}`, 200, 5);
    await frame(); const t1 = performance.now();
    add('chat.switch', t1 - t0); add('chat.clickHandler', handler);
    marks.push([t0, t0 + 600]);
    await wait(700);
  }
  const busy = await profStop('chats', marks);
  busy.forEach((ms) => add('chat.clickCpu', ms));
  const box = Native.view(claude.id)?.input || [...document.querySelectorAll('textarea')].find((t) => t.checkVisibility?.());
  if (!box) throw Error('no chat box');
  await click(box); await wait(200);
  for (const ch of 'the fog in the intro, bass drop') { HT.ms = 0; HT.on = true; await key(ch); HT.on = false; add('chat.keyHandler', HT.ms); await wait(30); }
  box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true }));
});

// ---------- the Lab: tool calls through the fake engine's real MCP calls, then a still scene left alone ----------
await section('lab', async () => {
  const C = H.agent('claude') || H.claudeAgent();
  C.threeTools = true; await saveConfig(); await wait(600);
  activate('tool:three'); await wait(400);
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 'the Lab', 1500);
  const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' }, color: { value: '${color}', label: 'Color' }, spin: [0.4, -2, 2] });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
scene.add(new THREE.AmbientLight(0xffffff, 1));
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 16, 64), new THREE.MeshStandardMaterial({ color: P.color }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000 * P.spin; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
  await ThreeLab.director.newSketch('perfguard calls', LAYER('Base', '#ff3d7f'), 2);
  const sceneId = ThreeLab.scenes.currentId();
  const layer = ThreeLab.director.layers().layers?.[0]?.name || 'Base';
  activate(C.id); await wait(300); Native.newChat(C.id); await wait(300);
  const turn = async (text) => { await Native.send(C.id, text); await wait(400); const chatId = H.activeChat[C.id]; await until(() => !Native.isBusy(chatId), 'the reply', 1200, 200); await wait(300); return chatId; };
  const chatId = await turn('hello there');
  ChatScenes.linkGuest(chatId, sceneId);
  const calls = (k) => [
    ['three_do', { cmd: 'layers' }], ['three_read_code', { layer, from: 1, to: 12 }], ['three_search_code', { pattern: 'mesh.rotation' }], ['three_console', {}],
    ['three_sliders', { layer, set: { size: +(1.1 + k * 0.1).toFixed(2) } }], ['three_update_layer', { layer, settings: { opacity: +(0.9 - k * 0.1).toFixed(2) } }],
    ['three_do', { cmd: 'keyframes', layer, property: 'opacity', keys: [{ time: 0, value: 1 }, { time: 2 + k, value: 0.5 }] }],
    ['three_do', { cmd: 'timeline_edit', cues: { add: [{ time: 1 + k, name: `Cue ${k}` }] } }], ['three_do', { cmd: 'material', op: 'set', layer, preset: k % 2 ? 'chrome' : 'gold' }],
  ];
  await profStart();
  for (let k = 0; k < 2; k++) {
    activate(C.id); Native.open(C.id, chatId); await wait(200); activate('tool:three'); await wait(300);
    const steps = calls(k);
    await turn(`mcp please\nmcp: ${JSON.stringify(steps)}`);
    await wait(200);
    const log = HubBridge.log().filter((e) => e.chatId === chatId && !e.running).slice(-steps.length);
    if (log.length < steps.length) R.problems.push(`lab: round ${k + 1} logged ${log.length} of ${steps.length} calls`);
    for (const e of log) if (!e.image) add('lab.toolCall', HubBridge.hopsOf?.(e)?.total ?? e.ms);
  }
  await profStop('lab');
  // a still scene, left alone (the pointer off the page): draws a second once settled
  await ThreeLab.director.newSketch('perfguard still', `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
scene.add(new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 160, 24), new THREE.MeshNormalMaterial()));
renderer.setAnimationLoop(() => { renderer.render(scene, camera); });`, 1);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 990 }); document.activeElement?.blur?.();
  const pace = async () => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: 'window.__labPace?.state()', returnByValue: true } }))?.result?.value;
  await wait(6000);
  const a = await pace(); const t0 = performance.now(); await wait(10000); const b = await pace();
  if (a?.drawn == null || b?.drawn == null) throw Error('no __labPace in the preview');
  add('lab.stillDraws', (b.drawn - a.drawn) / ((performance.now() - t0) / 1000));
});

// ---------- idle: a chat on screen, nobody touching it ----------
await section('idle', async () => {
  const claude = H.claudeAgent(); activate(claude.id); await wait(300);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 990 }); document.activeElement?.blur?.();
  await wait(5000); await cdp('HeapProfiler.collectGarbage'); await wait(1500);
  const met = async () => (await window.hub.power.test({ metrics: true }))?.metrics || { procs: [], pages: [] };
  const isWin = (m, pid) => m.pages.some((p) => p.pid === pid && p.type === 'window' && /index\.html/.test(p.url));
  // (no profiler while counting: sampling every 250 µs costs the window ≈ 10 % of a CPU by itself; the culprit list's
  // profile is the 5 s after)
  const m0 = await met(); const t0 = performance.now(); await wait(10000); const m1 = await met(); const sec = (performance.now() - t0) / 1000;
  await profStart(); await wait(5000); await profStop('idle');
  let win = 0; let all = 0; const by = {};
  for (const p1 of m1.procs) { const p0 = m0.procs.find((x) => x.pid === p1.pid); if (!p0 || p1.cpuS == null) continue; const pct = ((p1.cpuS - p0.cpuS) / sec) * 100; all += pct; if (isWin(m1, p1.pid)) win += pct; const pg = m1.pages.find((x) => x.pid === p1.pid); const k = isWin(m1, p1.pid) ? 'window' : pg ? String(pg.url).split('/').pop().slice(0, 30) : p1.type; by[k] = Math.round(((by[k] || 0) + pct) * 100) / 100; }
  R.notes.idleProcs = by; R.notes.idleAnims = document.getAnimations().filter((x) => x.playState === 'running').length;
  if (!m1.procs.length) throw Error('no process numbers (power.test metrics)');
  add('idle.windowCpu', win); add('idle.allCpu', all);
});

// ---------- memory: the window's heap after a forced GC, at the end of all of the above ----------
await section('memory', async () => {
  await cdp('HeapProfiler.collectGarbage'); await wait(500); await cdp('HeapProfiler.collectGarbage'); await wait(500);
  const h = await cdp('Runtime.getHeapUsage');
  add('mem.windowHeap', (h?.usedSize ?? performance.memory?.usedJSHeapSize ?? NaN) / 1048576);
});
R.medians = Object.fromEntries(Object.entries(R.samples).map(([k, v]) => [k, med(v)]));
await window.hub.fs.write(`${window.SMOKE_TMP}/perfguard-probe.json`, JSON.stringify(R, null, 1));
return JSON.stringify({ medians: R.medians, notes: R.notes, problems: R.problems });
