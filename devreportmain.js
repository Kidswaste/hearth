// Report to the developer, main side (round 21, devreport). What the window can't do itself:
//   info     Hearth's version (the git HEAD of the app's own checkout, like updatermain.js), OS, Electron / Chrome /
//            Node versions, the home folder (so the report can say ~) and the app folder (so stacks say "native.js:12")
//   gh       whether the GitHub CLI (`gh`) is installed and signed in; send() files the issue with it
//            (`gh issue create --repo kidswaste/hearth --label hearth-report --title … --body-file …`), creating the
//            label when the repo doesn't have it yet. Hearth never sees or stores a token: gh holds the sign-in.
//   states   open / closed of sent reports (`gh issue view N --json state,stateReason`)
//   log      the commit messages an update brought (from..to), so the window can say "your report #N is fixed"
//   crashes  the window's page or the GPU process going down, kept in a small local file (the window reloads after a
//            crash, so it can't keep this itself); the window takes the unseen ones at start and offers a report
// Required from main.js: register(ipcMain, { dataDir }) once. HEARTH_GH (env) points at another gh (dev/fake-gh.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const REPO = 'kidswaste/hearth';
const LABEL = 'hearth-report';
let GH = process.env.HEARTH_GH || 'gh';
let crashFile = '';

function run(bin, args, { timeout = 30000, cwd } = {}) {
  // a .js "gh" (the dev fake) runs with this program as Node
  const js = /\.js$/i.test(bin);
  const file = js ? process.execPath : bin;
  const argv = js ? [bin, ...args] : args;
  const env = { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1', ...(js ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
  return new Promise((resolve) => {
    try {
      execFile(file, argv, { timeout, cwd, env, windowsHide: true, maxBuffer: 4 * 1048576 }, (err, stdout, stderr) => {
        resolve({ ok: !err, code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim(), missing: err?.code === 'ENOENT' });
      });
    } catch (err) { resolve({ ok: false, code: 1, out: '', err: err.message, missing: true }); }
  });
}
const git = (args) => run('git', args, { cwd: __dirname, timeout: 15000 });

async function info() {
  const [head, branch, dirty] = await Promise.all([git(['rev-parse', '--short', 'HEAD']), git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['status', '--porcelain', '--untracked-files=no'])]);
  let release = os.release();
  try { if (process.getSystemVersion) release = process.getSystemVersion(); } catch { /* os.release() then */ }
  return {
    head: head.ok ? head.out : '', branch: branch.ok ? branch.out : '', dirty: dirty.ok && dirty.out ? dirty.out.split('\n').length : 0,
    os: { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform] || process.platform, release, arch: process.arch,
    electron: process.versions.electron || '', chrome: process.versions.chrome || '', node: process.versions.node || '',
    home: os.homedir(), appDir: __dirname,
  };
}

async function gh() {
  const v = await run(GH, ['--version'], { timeout: 8000 });
  if (!v.ok) return { installed: false, signedIn: false };
  const a = await run(GH, ['auth', 'status', '--hostname', 'github.com'], { timeout: 10000 });
  return { installed: true, signedIn: a.ok, version: (v.out.split('\n')[0] || '').replace(/^gh version\s*/, '').split(' ')[0] };
}

// files the issue; { ok, number, url } or { ok: false, error, reason: 'gh' | 'auth' | 'failed' }
async function send({ title, body } = {}) {
  const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!t || !body) return { ok: false, reason: 'failed', error: 'A report needs a title and a text.' };
  const st = await gh();
  if (!st.installed) return { ok: false, reason: 'gh', error: 'The GitHub CLI (gh) isn\'t installed.' };
  if (!st.signedIn) return { ok: false, reason: 'auth', error: 'The GitHub CLI isn\'t signed in (run `gh auth login` in a terminal).' };
  const file = path.join(os.tmpdir(), `hearth-report-${process.pid}-${Date.now().toString(36)}.md`);
  fs.writeFileSync(file, String(body));
  try {
    const args = ['issue', 'create', '--repo', REPO, '--label', LABEL, '--title', t, '--body-file', file];
    let r = await run(GH, args, { timeout: 60000 });
    if (!r.ok && /label/i.test(r.err) && /not found|could not add|does not exist/i.test(r.err)) {
      await run(GH, ['label', 'create', LABEL, '--repo', REPO, '--color', 'D9480F', '--description', 'Filed from Hearth (Report to the developer)'], { timeout: 30000 });
      r = await run(GH, args, { timeout: 60000 });
    }
    if (!r.ok) return { ok: false, reason: 'failed', error: (r.err.split('\n').filter(Boolean).pop() || 'gh failed').slice(0, 300) };
    const m = r.out.match(/https:\/\/github\.com\/[^\s]+\/issues\/(\d+)/);
    return { ok: true, url: m ? m[0] : r.out.split('\n').pop(), number: m ? Number(m[1]) : null };
  } finally { try { fs.unlinkSync(file); } catch { /* gone */ } }
}

// { [n]: 'open' | 'closed' | 'fixed' } for up to 10 issue numbers (gh only; {} without it)
async function states(numbers = []) {
  const list = [...new Set((numbers || []).map(Number).filter((n) => n > 0))].slice(0, 10);
  if (!list.length) return {};
  const st = await gh();
  if (!st.signedIn) return {};
  const out = {};
  await Promise.all(list.map(async (n) => {
    const r = await run(GH, ['issue', 'view', String(n), '--repo', REPO, '--json', 'state,stateReason'], { timeout: 20000 });
    try { const j = JSON.parse(r.out); out[n] = j.state === 'CLOSED' ? (j.stateReason === 'COMPLETED' ? 'fixed' : 'closed') : 'open'; } catch { /* unknown */ }
  }));
  return out;
}

// the full messages of the commits between two versions (an update)
async function log({ from, to } = {}) {
  const ref = /^[0-9a-f]{4,40}$/i;
  if (!ref.test(String(from || '')) || !ref.test(String(to || ''))) return [];
  const r = await git(['log', '--format=%B%x1e', '-n', '300', `${from}..${to}`]);
  return r.ok ? r.out.split('\x1e').map((s) => s.trim()).filter(Boolean) : [];
}

// ---------- crashes ----------
function readCrashes() { try { const j = JSON.parse(fs.readFileSync(crashFile, 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; } }
function writeCrashes(list) { try { require('./crashsafe-core').writeAtomicSync(fs, crashFile, JSON.stringify(list, null, 1)); } catch { /* best effort */ } }
// (round 52, chatkeep) what the computer looked like when it happened: free / total memory and Hearth's biggest
// processes (the window's own page is gone by then; the page that comes back adds its last reading: annotate)
function memNow() {
  const mb = (kb) => Math.round((kb || 0) / 1024);
  const out = {};
  try { const m = process.getSystemMemoryInfo(); out.freeMB = mb(m.free); out.totalMB = mb(m.total); } catch { /* not in Electron */ }
  try {
    const { app } = require('electron');
    const procs = app.getAppMetrics().map((p) => ({ type: p.type, name: p.name || p.serviceName || '', mb: mb(p.memory?.workingSetSize) }));
    out.hearthMB = procs.reduce((a, p) => a + p.mb, 0);
    out.top = procs.sort((a, b) => b.mb - a.mb).slice(0, 5);
  } catch { /* not in Electron */ }
  return out;
}
// kind: 'page' (the window's page crashed) · 'gpu' · 'reload' (the window reloaded on purpose: why says who asked)
function noteCrash(kind, what, extra = {}) {
  if (!crashFile) return;
  const list = readCrashes().slice(-39);
  list.push({ t: Date.now(), kind, what: String(what || '').slice(0, 200), seen: kind === 'reload', ...extra, ...(kind === 'reload' ? {} : { mem: memNow() }) });
  writeCrashes(list);
}
// the page that came back adds what it knew (its last memory reading, what it was showing) to the newest page crash
function annotate(info = {}) {
  const list = readCrashes();
  const c = [...list].reverse().find((x) => x.kind === 'page' || x.kind === 'reload');
  if (!c || Date.now() - c.t > 10 * 60000 || c.page) return false;
  c.page = JSON.parse(JSON.stringify(info || {}));
  writeCrashes(list);
  return true;
}
// the crashes the window hasn't been told about (they're marked seen); reloads on purpose aren't crashes
function takeCrashes() {
  const list = readCrashes();
  const fresh = list.filter((c) => !c.seen && c.kind !== 'reload');
  if (list.some((c) => !c.seen)) { for (const c of list) c.seen = true; writeCrashes(list); }
  return fresh;
}

function register(ipcMain, { dataDir } = {}) {
  crashFile = dataDir ? path.join(dataDir, 'devreport-crashes.json') : '';
  try {
    const { app } = require('electron');
    app.on('render-process-gone', (_e, wc, d) => { if (d?.reason !== 'clean-exit') noteCrash('page', `${wc?.getTitle?.() || 'a window'}: ${d?.reason || 'gone'}${d?.exitCode ? ` (code ${d.exitCode})` : ''}`, { reason: d?.reason || 'gone', code: d?.exitCode ?? null, url: String(wc?.getURL?.() || '').split(/[?#]/)[0].split(/[\\/]/).pop() }); });
    app.on('child-process-gone', (_e, d) => { if (d?.type === 'GPU' && d.reason !== 'clean-exit') noteCrash('gpu', `GPU process ${d.reason}${d.exitCode ? ` (code ${d.exitCode})` : ''}`); });
  } catch { /* not in Electron (tests) */ }
  ipcMain.handle('devreport:info', () => info());
  ipcMain.handle('devreport:gh', () => gh());
  ipcMain.handle('devreport:send', (_e, r) => send(r || {}));
  ipcMain.handle('devreport:states', (_e, n) => states(n));
  ipcMain.handle('devreport:log', (_e, r) => log(r || {}));
  ipcMain.handle('devreport:crashes', () => takeCrashes());
  ipcMain.handle('devreport:annotate', (_e, info) => annotate(info)); // (round 52, chatkeep)
}

module.exports = { register, info, gh, send, states, log, noteCrash, takeCrashes, annotate, readCrashes, _setGh: (p) => { GH = p || 'gh'; }, _setCrashFile: (f) => { crashFile = f; } };
