// Smoothness of the progress bars (round 11): a long streaming reply measured with the bars off and on, back to back
// in the same reply (off · on · on · off · off · on · on · off, so the machine's load is the same for both): frames, long animation frames,
// DOM mutations a second, painted area and paint / style / layout time (smoke({ trace })). The bars may only add their
// own few writes (a transform 4× a second at most, a short line of words when it changes) and no layout.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/progress-smooth.js
const { wait, until, measure, brief } = M;
const out = { off: [], on: [] }; const fail = [];
const C = H.claudeAgent();
activate(C.id); await wait(300);
const v = () => Native.view(C.id);
Native.newChat(C.id); await wait(200);
// a model write counter: how often the bars touch the page
let writes = 0;
const mo = new MutationObserver((recs) => { for (const r of recs) { const t = r.target.nodeType === 1 ? r.target : r.target.parentElement; if (t?.closest?.('.pg-bar, .pg-note, #pg-dot')) writes += 1; } });
mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
Native.send(C.id, 'slow long table progress'); // slow: ≈ 100 s of streaming, plenty for eight windows
await until(() => v().list.querySelector('.msg.streaming .body p'), 8000);
await wait(400);
const runs = [];
for (const on of [false, true, true, false, false, true, true, false]) {
  ProgressUI.setEnabled(on);
  await wait(900); // bars made (or removed) before the window: what's measured is the steady state while it streams
  writes = 0;
  const m = await measure(2500);
  runs.push({ on, m, writes });
  const b = brief(m);
  (on ? out.on : out.off).push(typeof b === 'string' ? `${b} · bar writes ${writes}` : { ...b, writes });
}
mo.disconnect();
ProgressUI.setEnabled(true);
const avg = (on, f) => { const r = runs.filter((x) => x.on === on); return Math.round((r.reduce((s, x) => s + f(x), 0) / r.length) * 10) / 10; };
out.summary = {
  mutPerSec: [avg(false, (x) => x.m.mut.perSec), avg(true, (x) => x.m.mut.perSec)],
  layoutMs: [avg(false, (x) => x.m.trace.layoutMs), avg(true, (x) => x.m.trace.layoutMs)],
  styleMs: [avg(false, (x) => x.m.trace.styleMs), avg(true, (x) => x.m.trace.styleMs)],
  paintMs: [avg(false, (x) => x.m.trace.paintMs), avg(true, (x) => x.m.trace.paintMs)],
  paintedKpx: [avg(false, (x) => x.m.trace.paintedKpx), avg(true, (x) => x.m.trace.paintedKpx)],
  fps: [avg(false, (x) => x.m.frames.fps), avg(true, (x) => x.m.frames.fps)],
  barWritesPerSec: avg(true, (x) => x.writes / 2.5),
};
// the bars write at most a few times a second (4 ticks × a transform or a class, a line of words when it changes)
if (out.summary.barWritesPerSec > 16) fail.push(`the bars wrote ${out.summary.barWritesPerSec} times a second`);
// (a window can be still: an estimate that grew less than half a percent in 2.5 s writes nothing)
if (!runs.filter((x) => x.on).some((x) => x.writes > 0)) fail.push('the bars never moved while on');
if (runs.filter((x) => !x.on).some((x) => x.writes > 0)) fail.push('the bars wrote while off');
await window.hub.stop(H.activeChat[C.id]);
await until(() => !Native.isBusy(H.activeChat[C.id]), 10000);
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
