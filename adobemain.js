// Adobe suite bridges (round 14), main side: finds Photoshop, Illustrator, Premiere Pro, Media Encoder and InDesign
// (Mac and Windows, with their versions), runs ExtendScript in them and reads the answer back:
//   Mac      osascript: `do javascript` (Photoshop, Illustrator) / `do script … language javascript` (InDesign)
//   Windows  cscript + COM: DoJavaScriptFile / DoScript
//   Premiere Pro, Media Encoder: no AppleScript / COM door, so a tiny invisible panel (the "Hearth bridge", CEP)
//            runs the scripts Hearth drops in data/adobe/queue/<PPRO|AME>/ (installed once, with the owner's OK)
// After Effects keeps its own bridge (aemain.js); this file only reports it in the status.
// Every script writes its answer to a .json file next to it (AdobeData.wrap), so all three doors read alike.
// Also opens a file in an app the plain way (Finder / Explorer "Open with") and the Adobe web apps in a window.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('./adobe-data');

let DATA_DIR = null;
const dataDir = () => DATA_DIR || (DATA_DIR = require('./store').DATA_DIR);
const ROOT = () => path.join(dataDir(), 'adobe');
const SCRIPTS = () => path.join(ROOT(), 'scripts');
const QUEUE = () => path.join(ROOT(), 'queue');
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p); } catch { return false; } };
const isMac = () => process.platform === 'darwin';
const isWin = () => process.platform === 'win32';

function versionKey(name) { return (String(name).match(/\d+(\.\d+)?/g) || ['0']).map(Number); }
function newest(list) {
  return list.slice().sort((a, b) => {
    const x = versionKey(a); const y = versionKey(b);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  })[0];
}

// ---------- finding the apps ----------
// Mac: /Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app (also ~/Applications); Windows: Program Files\Adobe.
// overrides: { photoshop: '/path/to/the.app or the .exe or its folder' } (Settings, /adobe where)
function macRoots() { return ['/Applications', path.join(os.homedir(), 'Applications')]; }
function winRoots() { return [...new Set([process.env.ProgramFiles, 'C:\\Program Files', 'D:\\Program Files'].filter(Boolean).map((b) => path.join(b, 'Adobe')))]; }
function readVersion(appPath) {
  // the app's own version (Info.plist is XML for Adobe apps); the folder's year otherwise
  try {
    const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8');
    const v = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
    if (v) return v[1].trim();
  } catch { /* not readable */ }
  return '';
}
function fromOverride(a, o) {
  if (!o || !exists(o)) return null;
  if (isMac()) {
    if (/\.app\/?$/i.test(o)) return o.replace(/\/$/, '');
    try { const f = fs.readdirSync(o).find((x) => a.app.test(x)); return f ? path.join(o, f) : null; } catch { return null; }
  }
  if (/\.exe$/i.test(o)) return o;
  for (const rel of a.win) if (exists(path.join(o, ...[].concat(rel)))) return path.join(o, ...[].concat(rel));
  return null;
}
function locate(a, override) {
  const o = fromOverride(a, override);
  if (o) return o;
  if (isMac()) {
    const found = [];
    for (const root of macRoots()) {
      let dirs = [];
      try { dirs = fs.readdirSync(root).filter((d) => a.folder.test(d)); } catch { continue; }
      for (const d of dirs) {
        let apps = [];
        try { apps = fs.readdirSync(path.join(root, d)).filter((f) => a.app.test(f) && !/uninstall/i.test(f)); } catch { continue; }
        for (const f of apps) found.push(path.join(root, d, f));
      }
    }
    const release = found.filter((p) => !/beta/i.test(p));
    return newest(release.length ? release : found) || null;
  }
  if (isWin()) {
    const found = [];
    for (const base of winRoots()) {
      let dirs = [];
      try { dirs = fs.readdirSync(base).filter((d) => a.folder.test(d)); } catch { continue; }
      for (const d of dirs) for (const rel of a.win) if (exists(path.join(base, d, ...[].concat(rel)))) found.push(path.join(base, d, ...[].concat(rel)));
    }
    const release = found.filter((p) => !/beta/i.test(p));
    return newest(release.length ? release : found) || null;
  }
  return null;
}
function appStatus(a, override) {
  if (a.how === 'ae') {
    let st = null;
    try { st = require('./aemain').status(override); } catch { /* aemain not loadable (tests) */ }
    return { id: a.id, name: a.name, short: a.short, how: 'ae', found: Boolean(st?.found), version: st?.version || '', path: st?.afterfx || null, reason: st?.reason || null };
  }
  const p = locate(a, override);
  const version = p ? (isMac() ? readVersion(p) : '') || (p.match(/(20\d\d|CC \d{4}|\b\d{2}\.\d)/)?.[1] || '') : '';
  const appName = p ? (isMac() ? path.basename(p, '.app') : path.basename(p, '.exe')) : null;
  const reason = p ? null : !isMac() && !isWin() ? `${a.name} only runs on macOS and Windows.`
    : isMac() ? `${a.name} isn't installed in /Applications (or ~/Applications). Install it from Creative Cloud, or tell Hearth where it is: /adobe where ${a.id} <path>.`
      : `${a.name} isn't installed in Program Files\\Adobe. Install it from Creative Cloud, or tell Hearth where it is: /adobe where ${a.id} <path>.`;
  const out = { id: a.id, name: a.name, short: a.short, how: a.how, found: Boolean(p), version, path: p, appName, reason };
  if (a.how === 'cep') out.bridge = bridgeStatus();
  return out;
}
function status(overrides = {}) {
  return { platform: process.platform, apps: D.APPS.map((a) => appStatus(a, overrides[a.id])), bridge: bridgeStatus(), web: D.WEB };
}

// Is the app open? (only changes the wording: scripts start it when it isn't)
function running(a, p) {
  return new Promise((resolve) => {
    if (!p) { resolve(false); return; }
    if (isMac()) execFile('pgrep', ['-f', `${path.basename(p)}/Contents/MacOS`], (err, out) => resolve(!err && Boolean(String(out).trim())));
    else if (isWin()) execFile('tasklist', ['/FI', `IMAGENAME eq ${path.basename(p)}`, '/NH'], { windowsHide: true }, (err, out) => resolve(!err && String(out).toLowerCase().includes(path.basename(p).toLowerCase())));
    else resolve(false);
  });
}

// ---------- running scripts ----------
function scriptFile(appId, label) {
  fs.mkdirSync(SCRIPTS(), { recursive: true });
  // keep the 40 newest generated scripts (and their answers)
  try {
    const old = fs.readdirSync(SCRIPTS()).filter((f) => /\.(jsx|json|vbs)$/.test(f)).map((f) => path.join(SCRIPTS(), f))
      .sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs).slice(120);
    for (const f of old) fs.rmSync(f, { force: true });
  } catch { /* housekeeping only */ }
  return path.join(SCRIPTS(), `${appId}-${String(label || 'script').replace(/[^\w-]+/g, '_').slice(0, 40)}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}.jsx`);
}
const readJson = (f) => { try { return D.parseResult(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const waitFor = (fn, ms, every = 250) => new Promise((resolve) => {
  const t0 = Date.now();
  const tick = () => { const v = fn(); if (v || Date.now() - t0 > ms) resolve(v || null); else setTimeout(tick, every); };
  tick();
});

// run(appId, code, { label, activate, timeout, override }) → { ok, value } | { ok: false, error }
async function run(appId, code, opts = {}) {
  const a = D.app(appId);
  if (!a) return { ok: false, error: `Unknown app "${appId}": ${D.APPS.map((x) => x.id).join(', ')}` };
  if (a.how === 'ae') {
    return { ok: false, error: 'After Effects scripts go through its own bridge (hub.ae.run, aemain.js).' };
  }
  const st = appStatus(a, opts.override);
  if (!st.found) return { ok: false, error: st.reason, missing: true };
  const file = scriptFile(a.id, opts.label);
  const result = file.replace(/\.jsx$/, '.json');
  fs.writeFileSync(file, D.wrap(code, result));
  const timeout = opts.timeout || 120000;
  if (a.how === 'cep') return runCep(a, st, file, result, timeout, opts);
  if (isMac()) {
    const script = D.applescript(a, file, { appName: st.appName, activate: opts.activate !== false });
    const out = await new Promise((resolve) => {
      execFile('osascript', ['-e', script], { timeout, maxBuffer: 8 << 20 }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    });
    const r = readJson(result) || D.parseResult(out.stdout);
    if (r) return { ...r, script: file };
    return { ok: false, error: D.explain(out.stderr || out.err?.message || 'no answer', a), script: file };
  }
  if (isWin()) {
    const vbs = file.replace(/\.jsx$/, '.vbs');
    fs.writeFileSync(vbs, D.vbscript(a, file));
    const out = await new Promise((resolve) => {
      execFile('cscript', ['//nologo', vbs], { timeout, windowsHide: true, maxBuffer: 8 << 20 }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    });
    const r = readJson(result) || D.parseResult(out.stdout);
    if (r) return { ...r, script: file };
    return { ok: false, error: D.explain(out.stderr || out.err?.message || 'no answer', a), script: file };
  }
  return { ok: false, error: `${a.name} only runs on macOS and Windows.` };
}

// Premiere Pro / Media Encoder: start the app when needed, drop the script in the bridge's folder, wait for its answer
async function runCep(a, st, file, result, timeout, opts) {
  const b = bridgeStatus();
  if (!b.installed) return { ok: false, error: `${a.name} needs the Hearth bridge (a small invisible panel) to take scripts. Install it once: /adobe bridge install, then restart ${a.name}.`, needsBridge: true };
  const dir = path.join(QUEUE(), a.cep);
  fs.mkdirSync(dir, { recursive: true });
  const job = path.join(dir, path.basename(file));
  fs.copyFileSync(file, job);
  // the panel rewrites alive.txt every 0.4 s while the app runs; start the app when it's quiet
  const alive = () => { try { return Date.now() - Number(fs.readFileSync(path.join(dir, 'alive.txt'), 'utf8')) < 3000; } catch { return false; } };
  if (!alive()) openApp(a, st.path, null, { background: opts.activate === false });
  const r = await waitFor(() => readJson(result), timeout);
  if (r) return { ...r, script: file };
  try { fs.rmSync(job, { force: true }); } catch { /* the panel took it */ }
  return { ok: false, error: alive() ? `${a.name} didn't answer in time (a dialog may be open in it).` : `${a.name} didn't pick up the script: is it open, and was it restarted after the Hearth bridge was installed? (/adobe bridge)`, script: file };
}

// Open files in the app the plain way (no scripting): Finder's / Explorer's "Open with"
function openApp(a, appPath, files, { background = false } = {}) {
  const list = [].concat(files || []).filter(Boolean);
  if (isMac()) {
    const child = spawn('open', [...(background ? ['-g'] : []), '-a', appPath, ...list], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } else if (isWin()) {
    const child = spawn(appPath, list, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {});
    child.unref();
  }
  return { opened: true, app: a.name, files: list };
}
function openWith(appId, files, override) {
  const a = D.app(appId);
  if (!a) throw new Error(`Unknown app "${appId}"`);
  const st = appStatus(a, override);
  if (!st.found) throw new Error(st.reason);
  for (const f of [].concat(files || [])) if (!exists(f)) throw new Error(`File not found: ${f}`);
  return openApp(a, st.path, files);
}

// ---------- the Hearth bridge (CEP) ----------
function cepDir() {
  if (isMac()) return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', 'hearth-bridge');
  if (isWin()) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions', 'hearth-bridge');
  return null;
}
function bridgeStatus() {
  const dir = cepDir();
  const installed = Boolean(dir) && exists(path.join(dir, 'CSXS', 'manifest.xml'));
  const seen = {};
  for (const h of ['PPRO', 'AME']) { try { seen[h] = Number(fs.readFileSync(path.join(QUEUE(), h, 'alive.txt'), 'utf8')) || null; } catch { seen[h] = null; } }
  return { installed, dir, seen };
}
// CEP versions of the 2019–2026 apps: unsigned panels load when PlayerDebugMode is on for that version
const CSXS = [9, 10, 11, 12, 13];
function execP(cmd, args) { return new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || err?.message || '') }))); }
async function installBridge() {
  const dir = cepDir();
  if (!dir) throw new Error('The Hearth bridge is for Premiere Pro and Media Encoder on macOS and Windows.');
  fs.mkdirSync(path.join(dir, 'CSXS'), { recursive: true });
  fs.mkdirSync(QUEUE(), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CSXS', 'manifest.xml'), D.cepManifest());
  fs.writeFileSync(path.join(dir, 'index.html'), D.cepPanel(QUEUE()));
  fs.writeFileSync(path.join(dir, '.debug'), `<?xml version="1.0" encoding="UTF-8"?>\n<ExtensionList><Extension Id="${D.BRIDGE_ID}.panel"><HostList><Host Name="PPRO" Port="7088"/><Host Name="AME" Port="7089"/></HostList></Extension></ExtensionList>\n`);
  const steps = [];
  for (const v of CSXS) {
    const r = isMac() ? await execP('defaults', ['write', `com.adobe.CSXS.${v}`, 'PlayerDebugMode', '1'])
      : await execP('reg', ['add', `HKCU\\Software\\Adobe\\CSXS.${v}`, '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f']);
    steps.push({ csxs: v, ok: r.ok });
  }
  return { installed: true, dir, debugMode: steps, next: 'Restart Premiere Pro / Media Encoder once: the bridge starts with them (it stays invisible).' };
}
async function removeBridge() {
  const dir = cepDir();
  if (dir && exists(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return { removed: true, dir };
}

// Media Encoder presets the owner saved (Documents/Adobe/Adobe Media Encoder/<version>/Presets)
function mePresets() {
  const roots = [path.join(os.homedir(), 'Documents', 'Adobe', 'Adobe Media Encoder')];
  const out = [];
  for (const r of roots) {
    let vers = [];
    try { vers = fs.readdirSync(r); } catch { continue; }
    for (const v of vers) {
      const p = path.join(r, v, 'Presets');
      try { for (const f of fs.readdirSync(p)) if (/\.epr$/i.test(f)) out.push({ name: f.replace(/\.epr$/i, ''), path: path.join(p, f), version: v }); } catch { /* none */ }
    }
  }
  return out;
}

// ---------- the Adobe web apps (Express, Firefly) in a window of their own, signed in through their own page ----------
const webWins = new Map();
function openWeb(id) {
  const w = D.WEB.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown web app ${id}`);
  const { BrowserWindow, shell } = require('electron');
  const old = webWins.get(id);
  if (old && !old.isDestroyed()) { old.show(); old.focus(); return { id, reused: true }; }
  const win = new BrowserWindow({ width: 1280, height: 860, title: w.name, autoHideMenuBar: true, webPreferences: { partition: 'persist:adobe-web', contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Adobe's sign-in pages open in the same window (so the session sticks); other links in the browser
    if (/^https:\/\/([\w-]+\.)*(adobe\.com|adobelogin\.com|adobe\.io|behance\.net|google\.com|apple\.com|facebook\.com|microsoft\.com|live\.com)\//i.test(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(w.url).catch(() => {});
  webWins.set(id, win);
  win.on('closed', () => webWins.delete(id));
  return { id, opened: true };
}

function register(ipcMain, getWin, settings) {
  const overrides = () => ({ ...(settings?.()?.adobePaths || {}), aftereffects: settings?.()?.aePath || undefined });
  ipcMain.handle('adobe:status', () => status(overrides()));
  ipcMain.handle('adobe:run', (_e, appId, code, opts = {}) => run(appId, code, { ...opts, override: overrides()[D.app(appId)?.id] }));
  ipcMain.handle('adobe:open', (_e, appId, files) => openWith(appId, files, overrides()[D.app(appId)?.id]));
  ipcMain.handle('adobe:running', (_e, appId) => { const a = D.app(appId); const st = a && appStatus(a, overrides()[a.id]); return st?.found ? running(a, st.path) : false; });
  ipcMain.handle('adobe:bridge', (_e, what) => (what === 'install' ? installBridge() : what === 'remove' ? removeBridge() : bridgeStatus()));
  ipcMain.handle('adobe:presets', () => mePresets());
  ipcMain.handle('adobe:dir', () => { fs.mkdirSync(path.join(ROOT(), 'out'), { recursive: true }); return ROOT(); });
  ipcMain.handle('adobe:web', (_e, id) => openWeb(String(id)));
}

module.exports = { register, status, run, openWith, installBridge, removeBridge, bridgeStatus, mePresets, _test: { locate, appStatus, setDataDir: (d) => { DATA_DIR = d; }, cepDir } };
