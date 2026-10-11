#!/usr/bin/env node
// Background cost of Hearth (round 16, bgperf): what the whole app costs while nobody touches it, measured at the
// process level in a throwaway copy (like dev/perf-report.js). Every Electron process (main, renderers, GPU,
// utilities) is sampled from /proc: CPU ms per second (user + system) and memory (PSS, so shared pages count once).
//   1. idle: the app open on a chat for --seconds (default 60), nobody touching it
//   2. three app windows open (local pages that animate and run timers, like real web apps): memory while shown
//   3. the same three hidden (closed to the tray of app windows): CPU and memory while hidden
//   node dev/bgperf-report.js [--seconds 60] [--json /tmp/bg.json]
// Linux only (/proc). SwiftShader + a shared CPU: compare a before and an after run on the same machine.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const SECONDS = Number(opt('--seconds', 60));
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const PORT = 9400 + Math.floor(Math.random() * 500);
const HZ = 100; // clock ticks per second (getconf CLK_TCK)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (n) => Math.round(n * 10) / 10;

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-bgperf-'));
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(ROOT)) if (!skip.has(n)) fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-bgperf-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  // three "web apps": a canvas animated every frame, a timer every 50 ms, a big DOM, like a busy service page
  const page = (n) => `<!doctype html><meta charset="utf-8"><title>App ${n}</title><body style="margin:0;background:#123">
<canvas id="c" width="900" height="600"></canvas><div id="d"></div><script>
const c = document.getElementById('c').getContext('2d'); let t = 0;
const draw = () => { t++; c.fillStyle = 'hsl(' + (t % 360) + ',60%,40%)'; c.fillRect(0, 0, 900, 600); for (let i = 0; i < 200; i++) { c.fillStyle = '#fff3'; c.fillRect((i * 37 + t * 3) % 900, (i * 53) % 600, 20, 20); } requestAnimationFrame(draw); };
requestAnimationFrame(draw);
const d = document.getElementById('d'); for (let i = 0; i < 3000; i++) { const e = document.createElement('span'); e.textContent = 'item ' + i + ' '; d.append(e); }
const junk = []; for (let i = 0; i < 200000; i++) junk.push({ i, s: 'x' + i });
setInterval(() => { d.firstChild.textContent = 'tick ' + Date.now(); }, 50);
</script>`;
  fs.mkdirSync(path.join(dir, 'bg-pages'), { recursive: true });
  for (let i = 1; i <= 3; i++) fs.writeFileSync(path.join(dir, 'bg-pages', `app${i}.html`), page(i));
  return dir;
}

// ---------- /proc ----------
function children() {
  const map = new Map();
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const rest = st.slice(st.lastIndexOf(')') + 2).split(' '); map.set(Number(p), Number(rest[1])); } catch { /* gone */ }
  }
  return map;
}
function tree(rootPid) {
  const ppid = children(); const out = new Set([rootPid]);
  let grew = true;
  while (grew) { grew = false; for (const [p, pp] of ppid) if (!out.has(p) && out.has(pp)) { out.add(p); grew = true; } }
  return [...out];
}
function kindOf(pid) {
  let cmd = ''; try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' '); } catch { return null; }
  if (!/electron/.test(cmd)) return null;
  const t = /--type=([\w-]+)/.exec(cmd)?.[1];
  if (!t) return 'main';
  if (t === 'utility') return `utility:${/--utility-sub-type=([\w.]+)/.exec(cmd)?.[1]?.split('.').pop() || '?'}`;
  return t === 'gpu-process' ? 'gpu' : t;
}
function sample(rootPid) {
  const out = [];
  for (const pid of tree(rootPid)) {
    const kind = kindOf(pid); if (!kind) continue;
    try {
      const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const rest = st.slice(st.lastIndexOf(')') + 2).split(' ');
      const ticks = Number(rest[11]) + Number(rest[12]);
      let pss = 0; try { pss = Number(/Pss:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))[1]); } catch { /* no rollup */ }
      out.push({ pid, kind, ticks, pssKB: pss });
    } catch { /* gone */ }
  }
  return out;
}
const memMB = (s) => r1(s.reduce((a, p) => a + p.pssKB, 0) / 1024);
function cpuBetween(a, b, sec) {
  const before = new Map(a.map((p) => [p.pid, p.ticks]));
  const by = {}; let total = 0;
  for (const p of b) {
    const ms = ((p.ticks - (before.get(p.pid) ?? p.ticks)) * 1000) / HZ / sec;
    const k = p.kind.replace(/^utility:.*/, 'utility');
    by[k] = (by[k] || 0) + ms; total += ms;
  }
  return { totalMsPerSec: r1(total), ...Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r1(v)])) };
}
const memBy = (s) => { const by = {}; for (const p of s) { const k = p.kind.replace(/^utility:.*/, 'utility'); by[k] = r1((by[k] || 0) + p.pssKB / 1024); } return { totalMB: memMB(s), processes: s.length, ...by }; };

(async () => {
  const dir = copyApp();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-bgperf-profile-'));
  const env = { ...process.env, HEARTH_TEST_SAVE_DIR: path.join(dir, 'test-saves') };
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], { stdio: 'ignore', detached: true, env });
  const killAll = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', dir]); } catch { /* gone */ } };
  process.on('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killAll(); process.exit(1); });
  const report = { when: new Date().toISOString(), seconds: SECONDS, cpus: os.cpus().length };
  let code = 0;
  try {
    let wsUrl;
    for (let i = 0; i < 60 && !wsUrl; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))?.webSocketDebuggerUrl; } catch { /* not up */ }
      if (!wsUrl) await wait(500);
    }
    if (!wsUrl) throw new Error('no window');
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
    for (let i = 0; i < 100; i++) { if (await evaluate("Boolean(performance.getEntriesByName('hearth:ready').length)").catch(() => false)) break; await wait(200); }
    await evaluate('(() => { activate(H.claudeAgent().id); return true; })()');
    // the electron main process: the xvfb-run tree's process without --type
    const root = child.pid;
    await wait(10000); // startup work (install checks, sync, idle callbacks) settles
    const measure = async (sec) => { const a = sample(root); await wait(sec * 1000); const b = sample(root); return { cpu: cpuBetween(a, b, sec), mem: memBy(b) }; };
    if (args.includes('--probe')) { // where idle GPU time goes: focused composer, blurred, minimized
      report.probeFocused = await measure(15);
      console.log('caret-animation:', await evaluate("(() => { document.activeElement.style.caretAnimation = 'manual'; return getComputedStyle(document.activeElement).caretAnimation; })()"));
      report.probeCaretManual = await measure(15);
      await evaluate("(() => { document.activeElement.style.caretAnimation = ''; document.activeElement.style.caretColor = 'transparent'; return true; })()");
      report.probeCaretClear = await measure(15);
      await evaluate("(() => { document.activeElement.style.caretColor = ''; return true; })()");
      await evaluate('(() => { document.activeElement?.blur(); return true; })()');
      report.probeBlurred = await measure(15);
      const w = await send('Browser.getWindowForTarget');
      await send('Browser.setWindowBounds', { windowId: w.result?.windowId, bounds: { windowState: 'minimized' } });
      await wait(2000);
      report.probeMinimized = await measure(15);
      report.probeHidden = await evaluate('document.hidden');
      await send('Browser.setWindowBounds', { windowId: w.result?.windowId, bounds: { windowState: 'normal' } });
      for (const k of ['probeFocused', 'probeCaretManual', 'probeCaretClear', 'probeBlurred', 'probeMinimized']) console.log(k, JSON.stringify(report[k].cpu));
      console.log('hidden when minimized:', report.probeHidden);
    }
    report.idle = await measure(SECONDS);
    console.log(`idle ${SECONDS} s: CPU ${JSON.stringify(report.idle.cpu)} · memory ${JSON.stringify(report.idle.mem)}`);
    // three app windows
    const base = require('url').pathToFileURL(path.join(dir, 'bg-pages')).href;
    await evaluate(`(async () => { for (let i = 1; i <= 3; i++) await hub.apps.open({ id: 'bg' + i, name: 'BG ' + i, url: '${base}/app' + i + '.html', resume: false }); return true; })()`);
    await wait(8000);
    report.apps3Shown = await measure(Math.min(20, SECONDS));
    console.log(`3 app windows shown: CPU ${JSON.stringify(report.apps3Shown.cpu)} · memory ${JSON.stringify(report.apps3Shown.mem)}`);
    await evaluate("(async () => { for (let i = 1; i <= 3; i++) await hub.apps.close('bg' + i); return true; })()");
    await wait(6000);
    report.apps3Hidden = await measure(Math.min(30, SECONDS));
    report.apps3Hidden.windows = await evaluate('hub.apps.windows()').catch(() => null);
    console.log(`3 app windows hidden: CPU ${JSON.stringify(report.apps3Hidden.cpu)} · memory ${JSON.stringify(report.apps3Hidden.mem)} · live ${report.apps3Hidden.windows?.length}`);
    if (args.includes('--probe')) {
      const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => /bg-pages|apps-window/.test(t.url));
      for (const t of targets) {
        const w2 = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => { w2.onopen = r; w2.onerror = r; });
        const v = await new Promise((r) => { w2.onmessage = (m) => r(JSON.parse(m.data).result?.result?.value); w2.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { awaitPromise: true, returnByValue: true, expression: "new Promise((res) => { let n = 0; const f = () => { n++; requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(() => res(document.visibilityState + ' rAF/s=' + n), 1000); })" } })); setTimeout(() => r('timeout'), 4000); });
        console.log('hidden target', t.type, t.url.slice(-40), v); w2.close();
      }
      await evaluate("(async () => { for (let i = 1; i <= 3; i++) await hub.apps.close('bg' + i, { destroy: true }); return true; })()");
      await wait(3000);
      const m = await measure(10);
      console.log(`3 app windows destroyed: CPU ${JSON.stringify(m.cpu)} · memory ${JSON.stringify(m.mem)}`);
    }
    ws.close();
  } catch (err) {
    console.log(`harness: ${err.stack || err.message}`); code = 1;
  } finally {
    killAll();
    for (const d of [dir, userData]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* still in use */ } }
  }
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(report, null, 1));
  process.exit(code);
})();
