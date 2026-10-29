// (round 83, idleburst83) Loaded into Electron's main process beside dev/boot-probe.js (NODE_OPTIONS=--require) by
// dev/idleburst83.js: a 20 ms tick that notes every time the main thread was held ≥ 40 ms (when, how long), so a
// launch WITHOUT a profiler still shows its bursts. Written to $HEARTH_IB_TICK (JSON, ms since the process started)
// every second for HEARTH_IB_TICK_MS (default 45 s), then it stops. Anything that isn't Electron's main process is left alone.
const OUT = process.env.HEARTH_IB_TICK;
if (OUT && process.versions.electron && process.type === 'browser') {
  const fs = require('fs');
  const STEP = 20; const until = Number(process.env.HEARTH_IB_TICK_MS) || 45000;
  const held = []; let last = performance.now(); let n = 0;
  // child processes started and folders / files watched (when, what): background jobs show themselves by these
  const spawned = []; const watched = [];
  const cp = require('child_process');
  for (const fn of ['spawn', 'execFile', 'exec', 'fork']) {
    const orig = cp[fn];
    cp[fn] = function (cmd, a, ...rest) { if (performance.now() < until) spawned.push([Math.round(performance.now()), fn, String(cmd).split(/[\\/]/).pop().slice(0, 40), Array.isArray(a) ? a.slice(0, 3).map((x) => String(x).slice(0, 40)).join(' ') : '']); return orig.call(this, cmd, a, ...rest); };
  }
  const fsw = fs.watch;
  fs.watch = function (file, ...rest) { if (performance.now() < until) watched.push([Math.round(performance.now()), String(file).slice(-60), typeof rest[0] === 'object' && rest[0]?.recursive ? 'recursive' : '']); return fsw.call(this, file, ...rest); };
  // the main process's worker threads (the store / files threads): each op asked of them that took ≥ 20 ms on the
  // thread (when it was asked, which op, its ms there), as storework.js reports them back
  const ops = []; const opSecs = {}; // (and every op, summed per second: 'sec op' → [count, ms])
  const WT = require('worker_threads'); const W0 = WT.Worker;
  WT.Worker = class extends W0 {
    constructor(file, o) {
      super(file, o); const asked = new Map(); const name = String(file).split(/[\\/]/).pop();
      const post = this.postMessage.bind(this);
      this.postMessage = (m, ...r) => { if (m && m.id != null && m.op) asked.set(m.id, [performance.now(), m.op]); return post(m, ...r); };
      this.on('message', (m) => { const a = m && asked.get(m.id); if (!a) return; asked.delete(m.id); if (performance.now() >= until) return;
        if ((m.ms || 0) >= 20) ops.push([Math.round(a[0]), name, a[1], Math.round(m.ms), Math.round(performance.now() - a[0])]);
        const k = `${Math.floor(a[0] / 1000)} ${a[1]}`; const s = (opSecs[k] ||= [0, 0]); s[0] += 1; s[1] += Math.round((m.ms || 0) * 10) / 10; });
    }
  };
  const dump = () => JSON.stringify({ held, spawned, watched, ops, opSecs });
  const t = setInterval(() => {
    const now = performance.now(); const late = now - last - STEP;
    if (late >= 40) held.push([Math.round(last + STEP), Math.round(late)]);
    last = now;
    if (++n % 50 === 0) { try { fs.writeFileSync(OUT, dump()); } catch { /* ignore */ } }
    if (now > until) { clearInterval(t); try { fs.writeFileSync(OUT, dump()); } catch { /* ignore */ } }
  }, STEP);
  t.unref?.();
}
