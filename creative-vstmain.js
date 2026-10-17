// Serum 2 and Vital run in one persistent, isolated native host. No plugin code enters Electron.
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');
const ALLOWED = new Map([['vital.vst3', 'Vital'], ['serum2.vst3', 'Serum 2']]);
const allowedName = file => ALLOWED.get(path.basename(file).toLowerCase().replace(/ /g, ''));
// (round 58, codexcare58) Windows and the Mac's default disks ignore case, and the Mac gives accents decomposed (NFD):
// one key per plugin there, so a folder added twice in another spelling doesn't list it twice. Linux keeps exact names.
const FOLD = process.platform === 'win32' || process.platform === 'darwin';
const pathKey = (p, fold = FOLD) => fold ? p.normalize('NFC').toLowerCase() : p;
function discover(roots, fold = FOLD) {
  const found = [], seen = new Set();
  function walk(dir, depth) {
    if (depth > 8 || found.length >= 32) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = path.join(dir, e.name), key = pathKey(p, fold);
      if (seen.has(key)) continue; seen.add(key);
      if (/\.vst3$/i.test(e.name)) { const name = allowedName(p); if (name) found.push({ path: p, name }); }
      else if (e.isDirectory()) walk(p, depth + 1);
    }
  }
  // A root reached twice (a symlinked / aliased folder, the same folder in another spelling) is walked once; the paths
  // listed stay as the root was given, so saved selections keep matching.
  const walked = new Set();
  roots.forEach(p => { let real; try { real = fs.realpathSync.native(p); } catch { return; } const key = pathKey(real, fold); if (walked.has(key)) return; walked.add(key); walk(p, 0); });
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
function create({ dataDir, python, roots, helper = path.join(__dirname, 'creative-vst-host.py') }) {
  const home = path.join(dataDir, 'creative-vst'), runtime = path.join(home, 'runtime');
  const bin = python || process.env.HEARTH_VST_PYTHON || path.join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const standard = roots || (process.platform === 'win32' ? [path.join(process.env.CommonProgramFiles || 'C:/Program Files/Common Files', 'VST3'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs/Common/VST3')] : [path.join(os.homedir(), 'Library/Audio/Plug-Ins/VST3'), '/Library/Audio/Plug-Ins/VST3', '/usr/lib/vst3', path.join(os.homedir(), '.vst3')]);
  let known = new Set(), processChild = null, connection = null, starting = null, jobDir = null, pending = 0, setupBusy = false;
  const sockets = new Set();
  function run(exe, args, timeout) {
    return new Promise((resolve, reject) => {
      let stderr = ''; const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); processChild = child;
      const timer = setTimeout(() => { child.kill(); reject(Error('Runtime setup timed out. Retry setup.')); }, timeout);
      child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
      child.once('error', e => { clearTimeout(timer); if (processChild === child) processChild = null; reject(e); });
      child.once('close', code => { clearTimeout(timer); if (processChild === child) processChild = null; code === 0 ? resolve() : reject(Error(`Host exited (${code}). ${stderr}`)); });
    });
  }
  function stop() {
    connection = null;
    for (const s of sockets) s.destroy(Error('Plugin host stopped. Reload the instrument to recover.'));
    processChild?.kill(); processChild = null;
    return { ok: true };
  }
  async function ensure() {
    if (connection) return connection;
    if (starting) return starting;
    starting = (async () => {
      if (!fs.existsSync(bin)) throw Error('Install the local audio runtime first (64-bit Python 3.10–3.14 required).');
      fs.mkdirSync(home, { recursive: true }); const dir = fs.mkdtempSync(path.join(home, 'session-')); jobDir = dir;
      const token = crypto.randomBytes(32).toString('hex'), response = path.join(dir, 'ready.json'), file = path.join(dir, 'host.json');
      fs.writeFileSync(file, JSON.stringify({ action: 'serve', token }));
      let failure = '', stderr = '';
      const child = spawn(bin, [helper, file, response], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); processChild = child;
      child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
      child.once('error', e => { failure = e.message; });
      child.once('close', code => {
        failure ||= `Host exited (${code}). ${stderr.slice(-900)}`;
        if (processChild === child) { processChild = null; connection = null; for (const s of sockets) s.destroy(Error(failure)); }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* process shutdown may still hold files briefly */ }
        if (jobDir === dir) jobDir = null;
      });
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(response)) {
        if (failure) throw Error(failure);
        if (Date.now() > deadline) { child.kill(); throw Error('Audio host startup timed out.'); }
        await new Promise(r => setTimeout(r, 10));
      }
      let result; for (let i = 0; i < 10; i++) { try { result = JSON.parse(fs.readFileSync(response, 'utf8')); break; } catch { await new Promise(r => setTimeout(r, 10)); } }
      if (!result?.ok || !Number.isInteger(result.port)) { child.kill(); throw Error(result?.error || 'Invalid audio host startup response.'); }
      if (processChild !== child) throw Error('Audio host stopped.');
      connection = { port: result.port, token }; return connection;
    })();
    try { return await starting; } finally { starting = null; }
  }
  async function command(request) {
    const { port, token } = await ensure(); pending++;
    try {
      return await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port }); socket.setEncoding('utf8'); sockets.add(socket); let buffer = '', done = false;
        const finish = (error, result) => { if (done) return; done = true; sockets.delete(socket); socket.destroy(); error ? reject(error) : resolve(result); };
        socket.setTimeout(120000, () => { stop(); finish(Error('Plugin command timed out. Reload the instrument.')); });
        socket.once('connect', () => socket.write(JSON.stringify({ ...request, token }) + '\n'));
        socket.on('data', bytes => { buffer += bytes.toString('utf8'); if (buffer.length > 20e6) return finish(Error('Plugin response too large.')); if (buffer.endsWith('\n')) { try { finish(null, JSON.parse(buffer)); } catch { finish(Error('Invalid plugin response.')); } } });
        socket.once('error', error => finish(['ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(error.code) ? Error('Plugin host disconnected. Reload the instrument.') : error)); socket.once('close', () => { if (!done) finish(Error('Plugin host disconnected. Reload the instrument.')); });
      });
    } finally { pending--; }
  }
  async function safe(fn) { try { return await fn(); } catch (e) { return { ok: false, error: e.message }; } }
  return {
    scan(extra = []) {
      if (!Array.isArray(extra) || extra.length > 12 || extra.some(x => typeof x !== 'string' || !path.isAbsolute(x))) return { ok: false, error: 'Choose up to 12 absolute plugin folders.' };
      const locations = [...standard, ...extra], plugins = discover(locations); known = new Set(plugins.map(p => p.path)); return { ok: true, plugins, roots: locations };
    },
    status: () => safe(async () => fs.existsSync(bin) ? command({ action: 'status' }) : { ok: false, missing: true, error: 'Install the local audio runtime.' }),
    setup: () => safe(async () => {
      if (setupBusy) throw Error('Runtime setup is already running.'); setupBusy = true;
      try {
        stop();
        if (python || process.env.HEARTH_VST_PYTHON) return command({ action: 'status' });
        fs.mkdirSync(home, { recursive: true });
        if (!fs.existsSync(bin)) await run(process.platform === 'win32' ? 'py' : 'python3', ['-m', 'venv', runtime], 120000);
        await run(bin, ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', 'pedalboard==0.9.26', 'numpy==2.5.4', 'sounddevice==0.5.6'], 240000);
        return command({ action: 'status' });
      } finally { setupBusy = false; }
    }),
    request: request => safe(async () => {
      const actions = ['names', 'inspect', 'snapshot', 'editor', 'render', 'devices', 'live-start', 'live-stop', 'live-status', 'midi', 'panic', 'patch', 'volume'];
      if (!request || !actions.includes(request.action)) throw Error('Unknown instrument action.');
      if (!['devices'].includes(request.action) && (!known.has(request.plugin) || !allowedName(request.plugin))) throw Error('Scan and select Serum 2 or Vital first.');
      const name = request.plugin && allowedName(request.plugin);
      if (request.name && request.name !== name) throw Error('Only the Serum 2 and Vital instruments are supported.');
      if (typeof request.state !== 'undefined' && (typeof request.state !== 'string' || request.state.length > 12e6)) throw Error('Invalid plugin state.');
      if (JSON.stringify(request.parameters || {}).length > 200000 || (request.notes && (!Array.isArray(request.notes) || request.notes.length > 128))) throw Error('Plugin request too large.');
      const job = { action: request.action, plugin: request.plugin, name, parameters: request.parameters, notes: request.notes, duration: request.duration, state: request.state, note: request.note, on: request.on, velocity: request.velocity, gain: request.gain, buffer: request.buffer, device: request.device };
      if (request.action === 'render') { await ensure(); job.output = path.join(jobDir, 'render.wav'); }
      return command(job);
    }),
    stop,
    get busy() { return pending > 0 || setupBusy; }
  };
}
function register(ipcMain, { dataDir, getWin, app }) {
  const host = create({ dataDir });
  const own = (e, fn) => { if (e.sender !== getWin()?.webContents || e.senderFrame !== e.sender.mainFrame) return { ok: false, error: 'Only the Hearth workspace can use the plugin host.' }; return fn(); };
  ipcMain.handle('creative-vst:scan', (e, roots) => own(e, () => host.scan(roots)));
  ipcMain.handle('creative-vst:status', e => own(e, () => host.status()));
  ipcMain.handle('creative-vst:setup', e => own(e, () => host.setup()));
  ipcMain.handle('creative-vst:request', (e, r) => own(e, () => host.request(r)));
  ipcMain.handle('creative-vst:stop', e => own(e, () => host.stop()));
  app.once('will-quit', () => host.stop()); getWin()?.webContents.once('destroyed', () => host.stop());
}
module.exports = { create, discover, register, allowedName, pathKey };
