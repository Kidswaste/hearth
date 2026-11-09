// (round 153c, labwin153) What the Lab window saves (docs/upgrades/labwin153.md): not a check, a smoke.js script.
// The same heavy scene (realscene-lib: the Beat burst demo's 30,000 particles, a glTF model, a raw rAF rig, bloom, a
// 124 BPM song) at 960 × 540, measured
//   (a) in Hearth's window (the Lab tab, as before), playing and stopped
//   (b) in the Lab window, Hearth's window hidden ("Hide Hearth while the Lab window is open"), playing and stopped
// Every process (CPU ms a second, memory, count: app.getAppMetrics), the preview's frames drawn a second, and the time
// from the click to the preview's first drawn frame. Run it calm and with --burn 3 (three CPU burners: a busy PC).
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/labwin153-measure.js [--burn 3]
// Prints one "[LABWIN153M] {json}" line at the end (and returns it).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const MEASURE = Number(window.LW_MS || 10000);
const r1 = (x) => Math.round(x * 10) / 10;
const out = { burn: window.SMOKE_BURN || 0, setups: {}, notes: [] };
const lw = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
// the preview page (Hearth's own, or the Lab window's: only one of them runs the scene at a time)
const pace = async () => { const r = await smoke({ pageEval: 'three-sandbox', frame: true, expr: 'JSON.stringify(window.__labPace ? window.__labPace.state() : null)' }); try { return JSON.parse(r?.value || 'null'); } catch { return null; } };
const met = async () => (await T({ metrics: true }))?.metrics || { procs: [], pages: [] };
const label = (m, pid) => {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /lab-window\.html/.test(p.url))) return 'lab window';
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'hearth window';
  if (pages.some((p) => /three-sandbox/.test(p.url))) return 'preview';
  if (pages.length) return `page ${pages[0].type}`;
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : `${pr.type.toLowerCase()}${pr.name ? ` ${pr.name}` : ''}`;
};
async function measure(name) {
  const snap = await smoke({ loadwait: 'snap' });
  const m0 = await met(); const p0 = await pace(); const t0 = performance.now();
  await wait(MEASURE);
  const m1 = await met(); const p1 = await pace(); const sec = (performance.now() - t0) / 1000;
  const lwait = await smoke({ loadwait: 1, since: snap.snap });
  const procs = {}; let all = 0; let mem = 0;
  for (const q of m1.procs) {
    const q0 = m0.procs.find((x) => x.pid === q.pid);
    const k = label(m1, q.pid);
    const cur = procs[k] ||= { msPerSec: 0, mb: 0, n: 0 };
    cur.n += 1; cur.mb += Math.round((q.mem || 0) / 1024); mem += (q.mem || 0) / 1024;
    if (q0 && q.cpuS != null) { const ms = ((q.cpuS - q0.cpuS) / sec) * 1000; cur.msPerSec += ms; all += ms; }
  }
  for (const v of Object.values(procs)) v.msPerSec = r1(v.msPerSec);
  const r = { sec: r1(sec), allMsPerSec: r1(all), allMb: Math.round(mem), procCount: m1.procs.length, procs,
    previewDrawnPerSec: p0 && p1 ? r1((p1.drawn - p0.drawn) / sec) : null, previewFps: p1?.fps ?? null, cap: p1?.cap ?? null,
    load: { loadavg: lwait?.loadavg?.map((x) => Math.round(x * 100) / 100), cpus: lwait?.cpus, cpuWait: lwait?.waited?.cpuWait } };
  out.setups[name] = r;
  console.log(`[LABWIN153M:${name}]`, JSON.stringify(r));
  return r;
}

await smoke({ cdnFor: 'lab-window\\.html' });
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
try { H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' }; delete H.config.theme.label; delete H.config.theme.group; applyTheme(document.getElementById('user-theme').textContent); } catch (err) { out.notes.push(`look: ${err.message}`); }
await until(() => performance.now() > Number(window.LW_SETTLE || 45000), 90000); // (the start's one-off work first)

// ---------- (a) the Lab in Hearth's window ----------
const tl = performance.now();
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && window.LabWinHost, 60000);
await until(async () => (await pace())?.drawn > 0, 30000, 50);
out.mainFirstFrameMs = Math.round(performance.now() - tl);
let info = null;
try { info = await RS.open({ size: [960, 540], particles: 12 }); } catch (err) { out.notes.push(`RS.open: ${err.message}`); }
out.scene = info && { layers: info.layers, song: info.song, bpm: info.bpm };
const id = ThreeLab.scenes.currentId();
await wait(4000);
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: 600, button: 'none' } });
await measure('a: Hearth window, playing');
await RS.close(); await wait(3000);
await measure('a: Hearth window, stopped');

// ---------- (b) the Lab window, Hearth hidden ----------
const tw = performance.now();
await LabWinHost.open(id, { hideMain: true });
const first = await until(async () => { const t = await lw('typeof LabWin !== "undefined" && LabWin.times().frame ? LabWin.times() : null'); return t || null; }, 60000, 100);
out.labwinFirstFrameMs = Math.round(performance.now() - tw); // (from the click: the window, its page, the Lab, the scene's first frame; polled every 100 ms)
out.labwinTimes = first;
await until(async () => (await pace())?.drawn > 5, 30000);
await wait(3000);
await lw('(async () => { const c = await ThreeLab.cmd(); c.seek(1); await new Promise((r) => setTimeout(r, 200)); c.play(true); return c.state.playing; })()');
await wait(3000);
await measure('b: Lab window, Hearth hidden, playing');
await lw('(async () => { (await ThreeLab.cmd()).play(false); return true; })()');
await wait(3000);
await measure('b: Lab window, Hearth hidden, stopped');
out.labwinState = await window.hub.labwin.state();
await window.hub.labwin.close();
await until(async () => !(await window.hub.labwin.state()).open, 15000);
console.log('[LABWIN153M]', JSON.stringify(out));
return JSON.stringify({ ok: true, ...out });
