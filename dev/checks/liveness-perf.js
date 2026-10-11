// Long tasks in a chat (round 21, liveness): what a minutes-long run costs the page while it streams, measured with
// the fake engines' long scenarios (dev/fake-liveness.js): a marathon of tool calls with a long thinking block, and a
// huge tool result. Main-thread time (CDP Performance.getMetrics), long tasks (≥ 50 ms) and the worst one, DOM churn,
// and the nodes of the live reply at its peak. Compare before / after runs from the same machine.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/liveness-perf.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(50); } return false; };
const out = {};
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
const v = () => Native.view(claude.id);
await smoke({ cdp: 'Performance.enable', params: {} });
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const longs = [];
new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(e.duration); }).observe({ type: 'longtask' });
async function run(text, timeout = 200000) {
  Native.newChat(claude.id); await wait(300);
  const m0 = await metrics(); longs.length = 0;
  let muts = 0; let peak = 0;
  const mo = new MutationObserver((r) => { muts += r.length; });
  mo.observe(v().list, { subtree: true, childList: true, characterData: true, attributes: true });
  const t0 = performance.now();
  Native.send(claude.id, text);
  await until(() => Native.isBusy(H.activeChat[claude.id]), 8000);
  await until(() => { const n = v().list.querySelector('.msg.streaming')?.querySelectorAll('*').length || 0; if (n > peak) peak = n; return !Native.isBusy(H.activeChat[claude.id]); }, timeout);
  const secs = (performance.now() - t0) / 1000;
  await wait(300);
  const m1 = await metrics();
  mo.disconnect();
  const chat = await window.hub.getChat(H.activeChat[claude.id]);
  const last = chat.messages.at(-1);
  return {
    secs: Math.round(secs * 10) / 10, scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    longTasks: longs.length, worstTaskMs: Math.round(Math.max(0, ...longs)), mutPerSec: Math.round(muts / secs), peakLiveNodes: peak, end: last.role, tools: last.tools?.length || 0,
  };
}
out.marathon = await run('marathon:300 longthink:400');
out.huge = await run('hugeout:24');
return JSON.stringify(out, null, 1);
