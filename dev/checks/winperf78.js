// opt-in: WINPERF78
// (round 78, winperf78) What the owner's common actions cost on WINDOWS, counted here: every process the main process
// starts (each one ≈ 30–150 ms on Windows, more with Defender; PowerShell ≈ 300–800 ms), every fs call (sync ones stall
// the whole app; on Windows + Defender each open is scanned), fs.watch, and the main thread's stalls, per action, on
// the heavy profile with 40 projects (dev/bigprofile.js --projects 40), with the Windows simulation on
// (mainlag-probe.js, HEARTH_WINSIM=1: sync fs 150 µs slower, each process start holds the thread 40 ms and answers
// 120 ms later, PowerShell 500 ms more, async opens 1 ms later). Actions:
//   startup · open a long chat (its list row) · send a message (fake engine, until its reply is saved) · open a
//   project (Projects → its card) · open the Lab · a sync pass (sync on: the first pass; then a pass after a change)
//   · the Sound desk (fake VST host) · ▶ Play a Lab scene and leave
// Budgets (BUDGET below; window.WP_BUDGET overrides, window.WP_REPORT = 1 reports without failing): processes started,
// PowerShell starts, sync fs calls and async fs calls per action, and the main thread's worst stall (a busy stretch of
// the CPU profile, the simulated costs included).
// Opt-in (≈ 4 min): WINPERF78=1 node dev/run-checks.js --exact winperf78   (under flock /tmp/hearth-run.lock)
//   by hand: HEARTH_LOOPLAG=prof HEARTH_WINSIM=1 HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package
//   node dev/smoke.js --fake-engines --fake-vst --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 900000 --script dev/checks/winperf78.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 400, step = 50) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } throw Error(`timed out: ${what}`); };
const lag = (label) => window.hub.power.test({ lag: { label } });
const out = { sim: null, actions: {}, problems: [], fails: [] };
// per action: processes started (all / PowerShell), sync fs calls, async fs calls, the worst main-thread stall (ms)
const BUDGET = Object.assign({
  startup: { spawns: 2, ps: 0, fsSync: 1600, fsAsync: 1200, stall: 1500 },
  openChat: { spawns: 0, ps: 0, fsSync: 20, fsAsync: 80, stall: 250 },
  sendMessage: { spawns: 1, ps: 0, fsSync: 80, fsAsync: 200, stall: 250 },
  openProject: { spawns: 0, ps: 0, fsSync: 80, fsAsync: 400, stall: 300 },
  openLab: { spawns: 0, ps: 0, fsSync: 80, fsAsync: 400, stall: 300 },
  syncFirst: { spawns: 1, ps: 0, fsSync: 400, fsAsync: 40000, stall: 300 },
  syncChange: { spawns: 1, ps: 0, fsSync: 60, fsAsync: 6000, stall: 250 },
  soundDesk: { spawns: 2, ps: 0, fsSync: 80, fsAsync: 400, stall: 300 },
  playTest: { spawns: 1, ps: 0, fsSync: 120, fsAsync: 600, stall: 400 },
}, window.WP_BUDGET || {});
const longest = (r) => Math.max(0, ...(r.blocks || []).map((b) => b.ms));
const brief = (r, wall) => ({
  wall, spawns: r.spawns?.n ?? null, ps: r.spawns?.ps ?? null, spawnBlockMs: r.spawns?.blockMs ?? null, byProg: r.spawns?.byProg || [],
  spawnSites: (r.spawns?.top || []).slice(0, 5).map((x) => `${x.n}× ${x.k}`),
  fsSync: r.fsSync.n, fsSyncMs: r.fsSync.ms, fsSyncTop: r.fsSync.top.slice(0, 5).map((x) => `${x.n}× ${x.ms}ms ${x.k}`),
  fsAsync: r.fsAsync?.n ?? null, fsAsyncTop: (r.fsAsync?.top || []).slice(0, 5).map((x) => `${x.n}× ${x.k}`),
  watch: r.watch?.n ?? 0, watchTop: (r.watch?.top || []).slice(0, 4).map((x) => `${x.n}× ${x.k}`),
  stall: longest(r), delayMax: r.delay.max, blocks: (r.blocks || []).slice(0, 3).map((b) => `${b.ms}ms · ${(b.app || []).slice(0, 2).join(' | ')}`),
});
async function act(name, fn, settle = 1500) {
  await lag(`before ${name}`);
  const t0 = performance.now();
  try { await fn(); } catch (err) { out.problems.push(`${name}: ${String(err?.message || err).slice(0, 300)}`); }
  const wall = Math.round(performance.now() - t0);
  await wait(settle);
  const r = await lag(name);
  out.actions[name] = brief(r, wall);
  out.sim = out.sim || r.sim;
}
function judge() {
  for (const [name, b] of Object.entries(BUDGET)) {
    const a = out.actions[name]; if (!a) { out.fails.push(`${name}: not measured`); continue; }
    for (const k of ['spawns', 'ps', 'fsSync', 'fsAsync', 'stall']) if (a[k] != null && a[k] > b[k]) out.fails.push(`${name}: ${k} ${a[k]} > ${b[k]}`);
  }
}

if (!window.hub?.power?.test) { out.problems.push('no test hook'); return out; }
// ---------- startup: from the main process's start until the app is quiet ----------
await until(() => document.querySelector('#panel .item') || document.querySelector('#agent-buttons .space-button'), 'app', 1500);
{ const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
  for (let i = 0, last = -1, still = 0; i < 80 && still < 6; i++) { await wait(500); if (longs.length === last) still += 1; else { still = 0; last = longs.length; } } }
await wait(2000);
{ const r = await lag('startup'); if (!r?.spawns) { out.problems.push('the lag probe is off or old (HEARTH_LOOPLAG + winperf78 counters)'); return out; } out.actions.startup = brief(r, null); out.sim = r.sim; }
window.hub.openExternal = () => {};

const claude = H.claudeAgent();
const chats = (await window.hub.listChats().catch(() => [])) || [];
const longChats = chats.filter((c) => c.agentId === claude.id && /-long\d/.test(c.id)).slice(0, 4);
activate(claude.id); await wait(600);
await act('openChat', async () => {
  const row = await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(longChats[1].id)}"]`), 'a long chat row', 80).catch(() => null);
  if (row) row.click(); else Native.open(claude.id, longChats[1].id);
  await until(() => H.activeChat[claude.id] === longChats[1].id && Native.view(claude.id)?.list.querySelectorAll('.msg').length > 20, 'the long chat drawn', 200);
  await frame();
});
await act('sendMessage', async () => {
  await Native.send(claude.id, 'what about the fog in the intro scene');
  await wait(300); const chatId = H.activeChat[claude.id];
  await until(() => !Native.isBusy(chatId), 'the reply', 600, 100);
}, 2500);
await act('openProject', async () => {
  document.querySelector('#agent-buttons [data-space=projects]').click();
  const card = await until(() => document.querySelector('.pj-card[data-project="pjbp3"]'), 'project cards', 600);
  await Projects.ready?.(); card.click();
  await until(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === 'pjbp3', 'the project ready', 800);
}, 2500);
try { await ProjectWorkspace.home(); } catch { /* fine */ }
await wait(1500);
await act('openLab', async () => {
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 'the Lab', 800);
  await wait(800);
}, 2500);
// ---------- sync: switched on (its first pass), then a pass after a change ----------
const CLOUD = `${window.SMOKE_TMP}/wp78-cloud`;
await window.hub.fs.write(`${CLOUD}/.keep`, '');
await act('syncFirst', async () => {
  await window.hub.sync.on({ root: CLOUD });
  await until(async () => ['synced', 'conflict', 'pending'].includes((await window.hub.sync.status())?.state), 'the first pass', 900, 200);
}, 2000);
await act('syncChange', async () => {
  const before = (await window.hub.sync.status())?.at || 0;
  await window.hub.kvSet?.('winperf78-note', { at: Date.now(), text: 'a small change' });
  await window.hub.sync.now?.();
  await until(async () => ((await window.hub.sync.status())?.at || 0) > before, 'a pass after the change', 600, 100);
}, 2000);
await act('soundDesk', async () => {
  await Lazy.load('creative'); activate('tool:creative');
  await until(() => document.querySelector('.wb-stations, .wb-sound-desk, .creative-playground, [data-tool="creative"]'), 'the Sound desk', 300);
  try { CreativePlayground.openFeature?.('vst'); } catch { /* none */ }
  await wait(2500);
}, 2000);
await act('playTest', async () => {
  activate('tool:three');
  await until(() => ThreeLab.director, 'the Lab', 400);
  await ThreeLab.director.newSketch('winperf78 play', `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial()); scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; renderer.render(scene, camera); });`, 1);
  await wait(1500);
  const btn = await until(() => document.querySelector('.surface.active [data-feature="Play"]') || document.querySelector('[data-feature="Play"]'), 'the Play button', 200);
  btn.click();
  await until(async () => (await window.hub.game.state())?.playing, 'playing', 600, 100);
  await wait(3000);
  await window.hub.game.leave();
  await until(async () => !(await window.hub.game.state())?.playing, 'left', 200, 100);
}, 2000);
try { await window.hub.sync.off?.(); } catch { /* fine */ }

judge();
if (window.WP_REPORT) { out.report = out.fails; out.fails = []; }
out.table = Object.entries(out.actions).map(([k, a]) => `${k.padEnd(12)} spawns ${a.spawns} (ps ${a.ps}) · fsSync ${a.fsSync} (${a.fsSyncMs} ms) · fsAsync ${a.fsAsync} · watch ${a.watch} · stall ${a.stall} ms`);
try { await window.hub.fs.write(`${window.SMOKE_TMP}/winperf78.json`, JSON.stringify(out, null, 1)); out.file = `${window.SMOKE_TMP}/winperf78.json`; } catch { /* the printed result */ }
return out;
