// opt-in: GC104
// (round 104, checksgc104) A measurement, not a check: the window's garbage collections after a giant chat's /export
// json (and, since round 105, html) and after a whole load (Native.loadWhole, then back to its window as a quiet minute later), each followed by
// 20 s of ordinary use (a scroll up and back every 2 s) under a light trace with V8's GC events. Reports per stretch
// the window's GC-only tasks (wall / own CPU), its longest GC, the GC time in all and the heap's peak. Run against an
// older build with dev/smoke.js --app <its folder> for the before numbers. Fixture: dev/bigchat84-fixture.js.
//   HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat84 --wait 1000 --check-timeout 900000 --script dev/checks/gc104-measure.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, n = 400) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const r1 = (x) => Math.round(x * 10) / 10;
const ID = 'claude-giant0';
const out = { pass: true };
await until(() => document.querySelector('#panel .item'), 600);
await wait(4000);
store.set('chat.window86', true);
const claude = H.claudeAgent();
activate(claude.id); await wait(800);
Native.open(claude.id, ID);
await until(() => Native.view(claude.id)?.list?.querySelector('.msg[data-index="5999"]'), 800);
await wait(3000);
const chat = Native.current(claude.id);
const CW = () => Native._rest?.W?.x;
const gc = async () => { for (let i = 0; i < 3; i++) { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(150); } };
const list = () => Native.view(claude.id).list;
async function stretch(name, fn) {
  await gc(); await wait(1000);
  await smoke({ trace: 'start', tasks: true });
  performance.mark(`gc104:${name}`);
  let peak = 0; const tick = setInterval(() => { peak = Math.max(peak, performance.memory?.usedJSHeapSize || 0); }, 50);
  const t = performance.now();
  await fn();
  const ms = Math.round(performance.now() - t);
  for (let i = 0; i < 10; i++) { list().scrollTop = Math.max(0, list().scrollHeight * 0.9); await wait(1000); list().scrollTop = list().scrollHeight; await wait(1000); }
  clearInterval(tick);
  const r = await smoke({ trace: 'stop', tasks: { min: 10, mark: `gc104:${name}`, observed: [] }, ...(window.GC104_DUMP ? { dump: `${window.GC104_DUMP}-${name}.json` } : {}) });
  const gcs = (r?.tasks || []).filter((x) => x.gc);
  out[name] = { ms, windowed: Boolean(Native.isWin?.(chat)), gcTasks: gcs.map((x) => `${x.ms}/${x.cpuMs}`), worstGcCpu: Math.max(0, ...gcs.map((x) => x.cpuMs || 0)), peakHeapMB: r1(peak / 1048576) };
}
const saves = window.SMOKE_SAVES || '';
await stretch('export', async () => {
  if (typeof ChatCmds === 'undefined' && window.Lazy?.load) await Lazy.load('chatcmds');
  await Commands.exec('/export json', claude.id, { say: () => {}, note: () => {} });
  await wait(500);
  CW()?.rewindow?.(chat, true); // (a quiet minute later, here at once: nothing to do when it never left its window)
});
// (round 105, merge105) the web page too (on round 104 it loaded the chat whole first, then went back to its window)
if (!window.GC104_SKIP_HTML) await stretch('exportHtml', async () => {
  await Commands.exec('/export html', claude.id, { say: () => {}, note: () => {} });
  await wait(500);
  CW()?.rewindow?.(chat, true);
});
await stretch('loadWhole', async () => { await Native.loadWhole(ID); await wait(500); CW()?.rewindow?.(chat, true); });
await stretch('quiet', async () => { await wait(500); });
void saves;
return JSON.stringify(out);
