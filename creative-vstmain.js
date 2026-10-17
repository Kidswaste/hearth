// Native VST3 stays outside Electron. Discovery reads names only; loading is an explicit action.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const VERSION = '0.9.26';
function discover(roots) {
  const found = [], seen = new Set();
  function walk(dir, depth) {
    if (depth > 8 || found.length >= 2000) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = path.join(dir, e.name), key = process.platform === 'win32' ? p.toLowerCase() : p;
      if (seen.has(key)) continue; seen.add(key);
      if (/\.vst3$/i.test(e.name)) found.push({ path: p, name: e.name.replace(/\.vst3$/i, '') });
      else if (e.isDirectory()) walk(p, depth + 1);
    }
  }
  roots.forEach(p => walk(p, 0)); return found.sort((a, b) => a.name.localeCompare(b.name));
}
function create({ dataDir, python, roots, helper = path.join(__dirname, 'creative-vst-host.py') }) {
  const home = path.join(dataDir, 'creative-vst'), runtime = path.join(home, 'runtime');
  const bin = python || process.env.HEARTH_VST_PYTHON || path.join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const standard = roots || (process.platform === 'win32' ? [path.join(process.env.CommonProgramFiles || 'C:/Program Files/Common Files', 'VST3'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs/Common/VST3')] : [path.join(os.homedir(), 'Library/Audio/Plug-Ins/VST3'), '/Library/Audio/Plug-Ins/VST3', '/usr/lib/vst3', path.join(os.homedir(), '.vst3')]);
  let known = new Set(), active = null, busy = false;
  function run(exe, args, timeout = 60000) {
    return new Promise((resolve, reject) => {
      let stderr = '', failure = '';
      const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); active = child;
      const timer = setTimeout(() => { failure = 'Plugin operation timed out. You can retry or choose another plugin.'; child.kill(); }, timeout);
      child.stderr.on('data', d => { stderr = (stderr + d).slice(-3000); });
      child.once('error', e => { clearTimeout(timer); if (active === child) active = null; reject(e); });
      child.once('close', (code, signal) => { clearTimeout(timer); if (active === child) active = null; if (code === 0 && !failure) resolve(); else reject(Error(failure || (signal ? 'Plugin operation stopped.' : `Host exited (${code}). ${stderr.slice(-900)}`))); });
    });
  }
  async function locked(fn) { if (busy) return { ok: false, error: 'Finish or stop the current plugin operation first.' }; busy = true; try { return await fn(); } catch (e) { return { ok: false, error: e.message }; } finally { busy = false; } }
  async function job(request) {
    if (!fs.existsSync(bin)) throw Error('Install the local VST runtime first. Python 3.10–3.14 (64-bit) is required.');
    fs.mkdirSync(home, { recursive: true }); const dir = fs.mkdtempSync(path.join(home, 'job-'));
    try {
      const input = path.join(dir, 'input.wav'), output = path.join(dir, 'output.wav'), response = path.join(dir, 'result.json');
      const payload = { ...request, input, output };
      if (request.audio) { if (typeof request.audio !== 'string' || request.audio.length > 16e6) throw Error('Input audio is too large (12 MB maximum).'); fs.writeFileSync(input, Buffer.from(request.audio, 'base64')); delete payload.audio; }
      const file = path.join(dir, 'job.json'); fs.writeFileSync(file, JSON.stringify(payload));
      await run(bin, [helper, file, response], request.action === 'editor' ? 30 * 60e3 : 90000);
      if (fs.statSync(response).size > 16e6) throw Error('Plugin response too large.');
      const result = JSON.parse(fs.readFileSync(response, 'utf8'));
      if (result.ok && request.action === 'render') { if (fs.statSync(output).size > 12e6) throw Error('Rendered audio too large.'); result.audio = fs.readFileSync(output).toString('base64'); }
      return result;
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  return {
    scan(extra = []) { if (!Array.isArray(extra) || extra.length > 12 || extra.some(x => typeof x !== 'string' || !path.isAbsolute(x))) return { ok: false, error: 'Choose up to 12 absolute plugin folders.' }; const locations = [...standard, path.join(home, 'plugins'), ...extra]; const plugins = discover(locations); known = new Set(plugins.map(p => p.path)); return { ok: true, plugins, roots: locations }; },
    status: () => locked(async () => fs.existsSync(bin) ? job({ action: 'status' }) : { ok: false, missing: true, error: 'The local VST runtime has not been installed.' }),
    setup: () => locked(async () => {
      if (python || process.env.HEARTH_VST_PYTHON) return job({ action: 'status' });
      fs.mkdirSync(home, { recursive: true });
      await run(process.platform === 'win32' ? 'py' : 'python3', ['-m', 'venv', runtime], 120000);
      await run(bin, ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', `pedalboard==${VERSION}`, 'numpy==2.5.4'], 240000);
      return job({ action: 'status' });
    }),
    request: request => locked(async () => {
      if (!request || !['names', 'inspect', 'editor', 'render'].includes(request.action) || !known.has(request.plugin)) throw Error('Scan and select an installed VST3 plugin first.');
      if (typeof request.state !== 'undefined' && (typeof request.state !== 'string' || request.state.length > 12e6)) throw Error('Invalid plugin state.');
      if (JSON.stringify(request.parameters || {}).length > 200000 || (request.notes && (!Array.isArray(request.notes) || request.notes.length > 128))) throw Error('Plugin request too large.');
      return job({ action: request.action, plugin: request.plugin, name: String(request.name || '').slice(0, 300), state: request.state, parameters: request.parameters, notes: request.notes, duration: request.duration, tail: request.tail, audio: request.audio });
    }),
    stop() { active?.kill(); return { ok: true }; },
    get busy() { return busy; }
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
module.exports = { create, discover, register };
