// (round 161, fix161) What Hearth's window holds while the Lab window has the scene (docs/upgrades/fix161.md): not a
// check, a smoke.js script (dev/checks/labwin153.js asserts the release). Measured the way dev/mem154-measure.js does
// (every process' working set, private and proportional memory, each page's JS heap after a GC), per setup:
//   chat idle            a chat on screen, the Lab never opened (what Hearth's window costs without its Lab)
//   lab in hearth        the Lab on realscene-lib's heavy scene in Hearth's window, playing
//   lab window, shown    the Lab window on that scene, Hearth's window shown on a chat beside it
//   lab window, hidden   the same, Hearth's window hidden and trimmed (memtrim)
//   back                 the Lab window closed: Hearth's Lab back on the scene, playing
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/fix161-measure.js [--app <base copy>]
// (HEARTH_TRIM_MS=5000 in the environment: the hidden window trims after 5 s.) Prints "[FIX161M] {json}" at the end.
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
const heapOf = async () => { const r = await smoke({ cdp: 'Runtime.getHeapUsage' }); return r && r.usedSize != null ? Math.round(r.usedSize / 1048576 * 10) / 10 : null; };
const gc = async () => { try { await smoke({ cdp: 'HeapProfiler.collectGarbage' }); } catch { /* none */ } };
const lw = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
async function measure(name) {
  await gc(); await wait(300); await gc();
  await wait(2500);
  const m = (await T({ metrics: true, mem: true }))?.metrics || { procs: [], pages: [] };
  const procs = {}; let ws = 0; let priv = 0; let pss = 0;
  for (const q of m.procs) {
    const k = label(m, q.pid);
    const cur = procs[k] ||= { ws: 0, priv: 0, pss: 0, n: 0 };
    cur.n += 1; cur.ws += MB(q.mem); cur.priv += MB(q.priv); cur.pss += MB(q.pss);
    ws += q.mem || 0; priv += q.priv || 0; pss += q.pss || 0;
  }
  const r = { ws: MB(ws), priv: MB(priv), pss: MB(pss), procCount: m.procs.length, procs, hearthHeapMb: await heapOf(), domNodes: document.getElementsByTagName('*').length,
    lab: { mounted: Boolean(H.surfaces.get('tool:three')?.mounted), dropped: window.ThreeLab?.dropped?.() ?? null, api: Boolean(window.ThreeLab?.director) } };
  out.setups[name] = r;
  console.log(`[FIX161M:${name}]`, JSON.stringify(r));
  return r;
}

await smoke({ cdnFor: 'lab-window\\.html' });
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
const claude = H.claudeAgent();
activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
await Native.send(claude.id, 'hello there, a short reply please');
await until(() => !Native.isAgentBusy(claude.id), 30000);
document.activeElement?.blur?.();
await until(() => performance.now() > Number(window.MEM_SETTLE || 60000), 150000);
await measure('chat idle');

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 60000);
let info = null;
try { info = await RS.open({ size: [960, 540], particles: 12 }); } catch (err) { out.notes.push(`RS.open: ${err.message}`); }
out.scene = info && { layers: info.layers, song: info.song, bpm: info.bpm };
const id = ThreeLab.scenes.currentId();
await wait(5000);
await measure('lab in hearth, playing');
await RS.close(); await wait(1500);

await LabWinHost.open(id, { hideMain: false });
await until(async () => lw('typeof LabWin !== "undefined" && LabWin.times().frame ? true : null'), 60000, 200);
await wait(2000);
await lw('(async () => { const c = await ThreeLab.cmd(); c.seek(1); await new Promise((r) => setTimeout(r, 200)); c.play(true); return c.state.playing; })()');
activate(claude.id); await wait(Number(window.MEM_LW_WAIT || 12000));
await measure('lab window, hearth shown on a chat');
await window.hub.labwin.hideMain();
await wait(Number(window.MEM_TRIM_WAIT || 12000));
out.memtrim = (await T({ memtrim: true }))?.memtrim;
await measure('lab window, hearth hidden');
await window.hub.labwin.close();
await until(async () => !(await window.hub.labwin.state()).open, 15000);
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.workspace?.state?.().ready, 30000);
try { const c = await ThreeLab.cmd(); c.play?.(true); } catch (err) { out.notes.push(`back: ${err.message}`); }
await wait(5000);
await measure('lab window closed, lab back in hearth');
console.log('[FIX161M]', JSON.stringify(out));
return JSON.stringify({ ok: true, ...out });
