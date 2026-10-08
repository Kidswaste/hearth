#!/usr/bin/env node
// Headless smoke test for development (Linux + Xvfb, no real data): copies the app to a temp folder with an
// empty data/ and a different profile name, launches it with remote debugging, then reports page errors,
// console errors and the results of optional checks. Never touches a real Hearth install.
//
//   node dev/smoke.js                       # launch, wait, report errors, save a screenshot
//   node dev/smoke.js --eval "JSON.stringify(Object.keys(H))"   # extra expressions (repeatable)
//   node dev/smoke.js --script dev/checks/foo.js                 # file of expressions, one async fn body
//   node dev/smoke.js --shot out.png --wait 6000
//
// Env: ELECTRON (path to the electron binary, default /opt/hearth-electron/electron).
// Exit code 1 when the page threw or logged errors (known harmless ones are filtered below).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const evals = []; args.forEach((a, i) => { if (a === '--eval') evals.push(args[i + 1]); });
const scriptFile = opt('--script');
const shot = opt('--shot', path.join(os.tmpdir(), 'hearth-smoke.png'));
const waitMs = Number(opt('--wait', 5000));
const keep = args.includes('--keep');
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const PORT = 9400 + Math.floor(Math.random() * 500);

// Errors that come from the test environment, not the app (no GPU, no engines installed, no network).
const IGNORE = [/GPU|gpu_|viz|dri3|libva|vaInitialize|Vulkan|EGL|GLES|ANGLE/i, /net::ERR_/, /Autofill\./, /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_PROXY|ERR_TUNNEL/, /Electron Security Warning/, /favicon/i, /DevTools/, /dbus|org\.freedesktop/i];

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-smoke-'));
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(ROOT)) if (!skip.has(n)) fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-smoke-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

async function cdpConnect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The app window never came up (no index.html page on the debug port).');
}

(async () => {
  const dir = copyApp();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-smoke-profile-'));
  const log = [];
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--disable-gpu'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const problems = [];
  let code = 0;
  try {
    const ws = new WebSocket(await cdpConnect());
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        problems.push(`exception: ${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (!IGNORE.some((re) => re.test(text))) problems.push(`console.error: ${text}`);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const e = msg.params.entry;
        if (!IGNORE.some((re) => re.test(e.text + (e.url || '')))) problems.push(`log: ${e.text} ${e.url || ''}`);
      }
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, waitMs));
    const run = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${/\breturn\b/.test(expr) ? expr : `return (${expr})`} })()`, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
      return { value: r.result?.result?.value };
    };
    const checks = [...evals];
    if (scriptFile) checks.push(fs.readFileSync(scriptFile, 'utf8'));
    for (const c of checks) {
      const r = await run(c);
      console.log(`\n▶ ${c.length > 160 ? `${c.slice(0, 160)}…` : c}\n${r.error ? `✖ ${r.error}` : typeof r.value === 'string' ? r.value : JSON.stringify(r.value, null, 2)}`);
      if (r.error) problems.push(`check failed: ${r.error}`);
    }
    await new Promise((r) => setTimeout(r, 500));
    const img = await send('Page.captureScreenshot', { format: 'png' });
    if (img.result?.data) { fs.writeFileSync(shot, Buffer.from(img.result.data, 'base64')); console.log(`\nscreenshot: ${shot}`); }
    ws.close();
  } catch (err) {
    problems.push(`harness: ${err.message}`);
  } finally {
    try { execFileSync('pkill', ['-f', dir]); } catch { /* already gone */ }
    child.kill('SIGKILL');
    const mainErrors = log.join('').split('\n').filter((l) => /Error|Uncaught|TypeError|ReferenceError|SyntaxError/.test(l) && !IGNORE.some((re) => re.test(l)));
    for (const l of mainErrors.slice(0, 30)) problems.push(`main: ${l.trim()}`);
    if (!keep) { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(userData, { recursive: true, force: true }); }
    else console.log(`kept: ${dir}`);
  }
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n${[...new Set(problems)].join('\n')}`); code = 1; } else console.log('\nOK: no page errors.');
  process.exit(code);
})();
