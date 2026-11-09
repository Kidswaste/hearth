// (round 154, mem154) What Hearth holds in memory, per process (docs/upgrades/mem154.md): not a check, a smoke.js
// script (dev/checks/mem154.js asserts the wins). Per setup: every process' working set, private and proportional
// memory (app.getAppMetrics + /proc smaps_rollup on Linux), the process count, each page's JS heap (CDP
// Runtime.getHeapUsage, after a GC) and the main process' heap.
// Setups: a project chat open, idle · the Lab with the real scene (realscene-lib) playing · back to the chat after the
// Lab (the Lab hidden: right away and after its release time) · the Lab window with Hearth hidden, playing.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/mem154-measure.js [--app <copy>]
// Prints one "[MEM154M] {json}" line at the end (and returns it). window.MEM_SETTLE: ms after the start before the first
// setup (default 70 s: the start's one-off work done); window.MEM_AWAY: ms back in the chat before the "later" setup.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const out = { setups: {}, notes: [] };
const MB = (kb) => Math.round((kb || 0) / 1024);
const label = (m, pid) => {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /lab-window\.html/.test(p.url))) return 'lab window';
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'hearth window';
  if (pages.some((p) => /three-sandbox/.test(p.url))) return 'preview';
  if (pages.length) return `page ${pages[0].type} ${pages[0].url.split('/').pop().slice(0, 30)}`;
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : `${pr.type.toLowerCase()}${pr.name ? ` ${pr.name}` : ''}`;
};
const heap = async (target) => { const r = await smoke(target ? { cdp: 'Runtime.getHeapUsage', target } : { cdp: 'Runtime.getHeapUsage' }); return r && r.usedSize != null ? Math.round(r.usedSize / 1048576) : null; };
const gc = async (target) => { try { await smoke(target ? { cdp: 'HeapProfiler.collectGarbage', target } : { cdp: 'HeapProfiler.collectGarbage' }); } catch { /* none */ } };
async function measure(name, targets = []) {
  await gc(); for (const t of targets) await gc(t);
  await wait(2500);
  const m = (await T({ metrics: true, mem: true }))?.metrics || { procs: [], pages: [] };
  const procs = {}; let ws = 0; let priv = 0; let pss = 0;
  for (const q of m.procs) {
    const k = label(m, q.pid);
    const cur = procs[k] ||= { ws: 0, priv: 0, pss: 0, n: 0 };
    cur.n += 1; cur.ws += MB(q.mem); cur.priv += MB(q.priv); cur.pss += MB(q.pss);
    ws += q.mem || 0; priv += q.priv || 0; pss += q.pss || 0;
  }
  const heaps = { window: await heap() };
  for (const t of targets) heaps[t] = await heap(t);
  const r = { ws: MB(ws), priv: MB(priv), pss: MB(pss), procCount: m.procs.length, procs, heaps, mainHeapMb: Math.round((m.mainMem?.heapUsed || 0) / 1048576), mainRssMb: Math.round((m.mainMem?.rss || 0) / 1048576),
    pages: m.pages.map((p) => `${p.type} ${p.url.split('?')[0].split('/').pop().slice(0, 40)} ${p.pid}`) };
  out.setups[name] = r;
  console.log(`[MEM154M:${name}]`, JSON.stringify(r));
  return r;
}

await smoke({ cdnFor: 'lab-window\\.html' });
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
try { H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' }; delete H.config.theme.label; delete H.config.theme.group; applyTheme(document.getElementById('user-theme').textContent); } catch (err) { out.notes.push(`theme: ${err.message}`); }
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); await until(() => ProjChats._ok(), 20000);
const proj = Projects.create({ name: 'Mem154 project' }); ProjChats.setScope(proj.id);
const claude = H.claudeAgent();
activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
await Native.send(claude.id, 'hello there, a short reply please');
await until(() => !Native.isAgentBusy(claude.id), 30000);
document.activeElement?.blur?.();
await until(() => performance.now() > Number(window.MEM_SETTLE || 70000), 150000);
await measure('chat idle');

// the Lab playing the real scene
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 60000);
let info = null;
try { info = await RS.open({ size: [960, 540], particles: 12 }); } catch (err) { out.notes.push(`RS.open: ${err.message}`); }
out.scene = info && { layers: info.layers, song: info.song, bpm: info.bpm };
const id = ThreeLab.scenes.currentId();
await wait(5000);
await measure('lab playing', ['three-sandbox']);
await RS.close(); await wait(1500);

// back to the chat: the Lab hidden
activate(claude.id); await wait(3000);
await measure('chat after lab', ['three-sandbox']);
await wait(Number(window.MEM_AWAY || 0));
if (window.MEM_AWAY) await measure('chat after lab, later', ['three-sandbox']);

// the Lab window, Hearth hidden
activate('tool:three'); await until(() => ThreeLab.workspace.state().ready || ThreeLab.workspace.state().released, 20000); await wait(1500);
await LabWinHost.open(id, { hideMain: true });
const lw = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
await until(async () => lw('typeof LabWin !== "undefined" && LabWin.times().frame ? true : null'), 60000, 200);
await wait(3000);
await lw('(async () => { const c = await ThreeLab.cmd(); c.seek(1); await new Promise((r) => setTimeout(r, 200)); c.play(true); return c.state.playing; })()');
await wait(Number(window.MEM_LW_WAIT || 5000));
await measure('lab window, hearth hidden, playing', ['lab-window', 'three-sandbox']);
await window.hub.labwin.close();
await until(async () => !(await window.hub.labwin.state()).open, 15000);
console.log('[MEM154M]', JSON.stringify(out));
return JSON.stringify({ ok: true, ...out });
