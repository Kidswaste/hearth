// Serum 2 and Vital run in persistent, isolated native hosts (one per open instrument since round 61). No plugin code enters Electron.
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
// (round 61, vstlive61) live mode: 'open' (load + optional live start), 'values' (a few controls, fresh), 'sequence'
// (a phrase played by the host's audio thread), 'midi-in' (which controller). STREAMED actions may also travel on the
// persistent no-reply socket (send()). jobOf() is the one whitelist of fields that reach the Python host.
const LIVE_ACTIONS = ['open', 'values', 'sequence', 'midi-in'];
const STREAMED = ['midi', 'patch', 'volume', 'panic', 'sequence'];
// (round 62, parkjam62) the loop recorder (docs/upgrades/parkjam62.md): 'record' arms a take in the host's audio thread,
// 'record-status' / 'record-cancel', 'record-take' writes the WAV in the session folder and hands its bytes back here.
const PARK_ACTIONS = ['record', 'record-status', 'record-take', 'record-cancel'];
function jobOf(r, name) {
  if (r.keys !== undefined && (!Array.isArray(r.keys) || r.keys.length > 512 || r.keys.some(k => typeof k !== 'string'))) throw Error('Ask for up to 512 parameter keys.');
  if (r.sequence !== undefined && (!Array.isArray(r.sequence) || r.sequence.length > 256)) throw Error('A phrase has up to 256 notes.');
  if (r.midiIn !== undefined && r.midiIn !== null && (typeof r.midiIn !== 'string' || r.midiIn.length > 200)) throw Error('Invalid MIDI input.');
  if ([r.bars, r.beats, r.bpm].some(v => v !== undefined && !Number.isFinite(v))) throw Error('Invalid loop length.'); // (round 62, parkjam62)
  return { action: r.action, plugin: r.plugin, name, parameters: r.parameters, notes: r.notes, duration: r.duration, state: r.state, note: r.note, on: r.on, velocity: r.velocity, gain: r.gain, buffer: r.buffer, device: r.device,
    exclusive: r.exclusive === true || undefined, midiIn: r.midiIn ?? undefined, keys: r.keys, sequence: r.sequence, loop: r.loop, live: r.live === true || undefined,
    bars: r.bars, beats: r.beats, bpm: r.bpm, wait: r.wait === 'note' ? 'note' : undefined }; // (round 62, parkjam62) the loop recorder's fields
}
function create({ dataDir, python, roots, helper = path.join(__dirname, 'creative-vst-host.py'), flags = { asio: process.env.HEARTH_VST_ASIO !== '0' }, lowPriority = false }) {
  const home = path.join(dataDir, 'creative-vst'), runtime = path.join(home, 'runtime');
  const bin = python || process.env.HEARTH_VST_PYTHON || path.join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const standard = roots || (process.platform === 'win32' ? [path.join(process.env.CommonProgramFiles || 'C:/Program Files/Common Files', 'VST3'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs/Common/VST3')] : [path.join(os.homedir(), 'Library/Audio/Plug-Ins/VST3'), '/Library/Audio/Plug-Ins/VST3', '/usr/lib/vst3', path.join(os.homedir(), '.vst3')]);
  let known = new Set(), processChild = null, connection = null, starting = null, jobDir = null, pending = 0, setupBusy = false;
  let stream = null; // (round 61, vstlive61) one persistent socket for notes / knob moves (no replies)
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
      // (round 61, vstlive61) SD_ENABLE_ASIO: sounddevice's Windows wheel then loads its ASIO-enabled PortAudio DLL, so
      // ASIO drivers (Universal Audio's) are listed and opened directly. flags.asio turns off after an ASIO driver crashed it.
      const env = { ...process.env }; if (flags.asio) env.SD_ENABLE_ASIO = '1'; else delete env.SD_ENABLE_ASIO;
      const child = spawn(bin, [helper, file, response], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env }); processChild = child;
      // (round 63, soundbank63) the Sound bank's preview host runs below normal priority: the live host keeps the CPU first
      if (lowPriority) try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed here: normal priority */ }
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
      const actions = ['names', 'inspect', 'snapshot', 'editor', 'render', 'devices', 'live-start', 'live-stop', 'live-status', 'midi', 'panic', 'patch', 'volume', ...LIVE_ACTIONS, ...PARK_ACTIONS];
      if (!request || !actions.includes(request.action)) throw Error('Unknown instrument action.');
      if (!['devices'].includes(request.action) && (!known.has(request.plugin) || !allowedName(request.plugin))) throw Error('Scan and select Serum 2 or Vital first.');
      const name = request.plugin && allowedName(request.plugin);
      if (request.name && request.name !== name) throw Error('Only the Serum 2 and Vital instruments are supported.');
      if (typeof request.state !== 'undefined' && (typeof request.state !== 'string' || request.state.length > 12e6)) throw Error('Invalid plugin state.');
      if (JSON.stringify(request.parameters || {}).length > 200000 || (request.notes && (!Array.isArray(request.notes) || request.notes.length > 128))) throw Error('Plugin request too large.');
      const job = jobOf(request, name);
      if (request.action === 'render') { await ensure(); job.output = path.join(jobDir, 'render.wav'); }
      // (round 62, parkjam62) the finished loop: the host writes the WAV here, its bytes go back to the window (no base64)
      if (request.action === 'record-take') {
        await ensure(); const file = job.output = path.join(jobDir, `loop-${crypto.randomBytes(4).toString('hex')}.wav`);
        const taken = await command(job); if (!taken.ok) throw Error(taken.error);
        try { return { ...taken, wav: fs.readFileSync(file) }; } finally { fs.rmSync(file, { force: true }); }
      }
      // (round 61, vstlive61) listing devices loads every ASIO driver: if one takes the host down, list again without ASIO.
      const result = await command(job).catch(e => ({ ok: false, error: e.message }));
      if (!result.ok && request.action === 'devices' && flags.asio && /disconnected|exited|stopped/i.test(result.error || '')) {
        flags.asio = false; flags.asioNote = 'An ASIO driver stopped the audio host while listing devices; Hearth listed them again without ASIO (WASAPI).';
        stop(); const again = await command(job); return { ...again, asioNote: flags.asioNote };
      }
      if (!result.ok && request.action !== 'devices') throw Error(result.error);
      return flags.asioNote && request.action === 'devices' ? { ...result, asioNote: flags.asioNote } : result;
    }),
    // (round 61, vstlive61) fire-and-forget live messages over one persistent socket. false = no host yet (the caller
    // falls back to request()). The host validates each message again; failures are counted in live-status.
    send(request) {
      if (!request || !STREAMED.includes(request.action) || !known.has(request.plugin) || !allowedName(request.plugin) || !connection) return false;
      if (JSON.stringify(request).length > 200000) return false;
      if (!stream || stream.destroyed) {
        const s = net.createConnection({ host: '127.0.0.1', port: connection.port }); s.setNoDelay(true); sockets.add(s); stream = s;
        s.on('error', () => {}); s.on('close', () => { sockets.delete(s); if (stream === s) stream = null; });
        s.write(JSON.stringify({ action: 'stream', token: connection.token }) + '\n');
      }
      stream.write(JSON.stringify(jobOf(request, allowedName(request.plugin))) + '\n'); return true;
    },
    stop,
    knows: p => known.has(p) && !!allowedName(p), // (round 61) the pool asks before giving a path its own host
    get alive() { return !!connection; },
    get busy() { return pending > 0 || setupBusy; }
  };
}
// (round 61, vstlive61) one long-lived host process per open instrument (Serum 2 and Vital stay loaded side by side, so
// switching back is instant). The first host started (the runtime check when the desk opens) is adopted by the first
// instrument opened, so opening doesn't pay a second Python start. Only one instrument streams to the audio device at
// a time (ASIO drivers are usually single-client): starting one stops the other's stream, not its process.
function pool(options) {
  const flags = { asio: process.env.HEARTH_VST_ASIO !== '0' };
  let extra = [], base = null, last = null; const hosts = new Map(); // plugin path -> host
  const make = () => { const h = create({ ...options, flags }); h.scan(extra); return h; };
  const anyAlive = () => [...hosts.values()].find(h => h.alive) || base || (base = make());
  function hostFor(plugin, adopt = true) {
    if (!plugin) return anyAlive();
    let h = hosts.get(plugin); if (h) return h;
    if (!adopt) return null;
    if (base) { h = base; base = null; } else h = make();
    hosts.set(plugin, h);
    if (hosts.size > 3) { const [old, oh] = [...hosts.entries()].find(([p]) => p !== plugin && p !== last) || []; if (oh) { oh.stop(); hosts.delete(old); } }
    return h;
  }
  async function quietOthers(plugin) {
    for (const [p, h] of hosts) if (p !== plugin && h.alive) await h.request({ action: 'live-stop', plugin: p }).catch(() => {});
  }
  return {
    scan(roots = []) {
      const r = (base || anyAlive()).scan(roots); if (!r.ok) return r;
      extra = roots; for (const h of hosts.values()) h.scan(roots); return r;
    },
    status: () => anyAlive().status(),
    setup: async () => { for (const h of hosts.values()) h.stop(); hosts.clear(); base = base || make(); return base.setup(); },
    async request(r) {
      if (r?.plugin && !hosts.has(r.plugin) && !anyAlive().knows(r.plugin)) return { ok: false, error: 'Scan and select Serum 2 or Vital first.' };
      // (round 62, parkjam62) 'solo': Park mode keeps one instrument loaded (the others' hosts are stopped, battery)
      if (r?.action === 'solo') { let n = 0; for (const [p, h] of [...hosts]) if (p !== r.plugin) { h.stop(); hosts.delete(p); n++; } return { ok: true, stopped: n }; }
      const h = hostFor(r?.plugin, !['devices', 'live-status', 'live-stop', 'panic', 'record-status', 'record-cancel'].includes(r?.action)) || (r?.action === 'devices' ? anyAlive() : null);
      if (!h) return { ok: true, playing: false }; // status / stop / panic of an instrument that isn't open: nothing plays
      if (r.action === 'live-start' || (r.action === 'open' && r.live === true)) { last = r.plugin; await quietOthers(r.plugin); }
      return h.request(r);
    },
    send(r) {
      const h = r && STREAMED.includes(r.action) && hosts.get(r.plugin);
      if (!h) return { ok: false };
      if (h.send(r)) return { ok: true };
      if (h) h.request(r).catch(() => {}); // no stream yet: the same message as a normal request
      return { ok: !!h };
    },
    stop() { for (const h of hosts.values()) h.stop(); base?.stop(); return { ok: true }; },
    get busy() { return [...hosts.values()].some(h => h.busy) || !!base?.busy; },
    get hosts() { return hosts.size; },
    flags
  };
}
// (round 62, parkjam62) <data>/creative-park/<sketch>/<file>: the sketch name made safe for every disk, plain file names only
function parkSave(dataDir, sketch, name, bytes) {
  const folder = String(sketch || 'Park sketch').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Park sketch';
  if (typeof name !== 'string' || !/^[\w .·-]{1,80}\.(wav|mid|json)$/i.test(name) || name.startsWith('.')) throw Error('Invalid park file name.');
  const data = bytes instanceof Uint8Array ? bytes : typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : null;
  if (!data || data.length < 1 || data.length > 120e6) throw Error('Invalid park file.');
  const dir = path.join(dataDir, 'creative-park', folder), file = path.join(dir, name);
  fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.part'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
  return file;
}
// (round 63, loopsong63) From park loops to a song (tools/loopsong.js): every take of every park sketch (their notes JSON,
// written by parkjam62), and an MP3 of an exported mix when ffmpeg is there (Hearth's own detection, aemain.ffStatus).
// Both stay inside <data>/creative-park/; the MP3 is written next to its WAV, atomically (.part, then renamed).
const parkFolder = (dataDir, sketch) => path.join(dataDir, 'creative-park', String(sketch || 'Park sketch').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Park sketch'); // parkSave's folder rule
function parkList(dataDir) {
  const root = path.join(dataDir, 'creative-park'), takes = [];
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return { root, takes }; }
  for (const d of dirs) {
    let names = []; try { names = fs.readdirSync(path.join(root, d.name)); } catch { continue; }
    for (const n of names) {
      if (!/\.json$/i.test(n) || / song\.json$/i.test(n) || takes.length >= 400) continue;
      try { const j = JSON.parse(fs.readFileSync(path.join(root, d.name, n), 'utf8')); if (j?.v === 1 && typeof j.loop === 'string' && j.bpm && j.bars) { delete j.notesPlayed; takes.push({ ...j, notesFile: path.join(root, d.name, n), folder: d.name }); } } catch { /* not a take */ }
    }
  }
  takes.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return { root, takes };
}
function parkMp3(dataDir, sketch, name, ffmpeg) {
  if (!ffmpeg) return Promise.resolve({ ok: false, error: 'ffmpeg is not installed, so the MP3 was skipped (the WAV is there).' });
  const dir = parkFolder(dataDir, sketch), wav = path.resolve(dir, String(name || ''));
  if (path.dirname(wav) !== dir || !/\.wav$/i.test(wav) || !fs.existsSync(wav)) return Promise.resolve({ ok: false, error: 'No such mix in the sketch folder.' });
  const mp3 = wav.replace(/\.wav$/i, '.mp3'), tmp = mp3 + '.part';
  return new Promise(resolve => require('child_process').execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', tmp], { timeout: 120000, windowsHide: true }, err => {
    if (err) { try { fs.unlinkSync(tmp); } catch { /* none */ } resolve({ ok: false, error: `The MP3 failed (${String(err.message).split('\n')[0].slice(0, 160)}); the WAV is there.` }); return; }
    try { fs.renameSync(tmp, mp3); resolve({ ok: true, path: mp3 }); } catch (e) { resolve({ ok: false, error: e.message }); }
  }));
}
function register(ipcMain, { dataDir, getWin, app, settings }) {
  const host = pool({ dataDir });
  const own = (e, fn) => { if (e.sender !== getWin()?.webContents || e.senderFrame !== e.sender.mainFrame) return { ok: false, error: 'Only the Hearth workspace can use the plugin host.' }; return fn(); };
  ipcMain.handle('creative-vst:scan', (e, roots) => own(e, () => host.scan(roots)));
  ipcMain.handle('creative-vst:status', e => own(e, () => host.status()));
  ipcMain.handle('creative-vst:setup', e => own(e, () => host.setup()));
  ipcMain.handle('creative-vst:request', (e, r) => own(e, () => host.request(r)));
  ipcMain.handle('creative-vst:stop', e => own(e, () => host.stop()));
  ipcMain.on('creative-vst:send', (e, r) => { own(e, () => host.send(r)); }); // (round 61, vstlive61) no reply: notes, knob moves
  // (round 62, parkjam62) Park jam: a take's files (loop / ambience / layered WAV, MIDI, notes) in the sketch's own folder
  ipcMain.handle('creative-vst:park-save', (e, sketch, name, bytes) => own(e, () => { try { return { ok: true, path: parkSave(dataDir, sketch, name, bytes) }; } catch (err) { return { ok: false, error: err.message }; } }));
  // (round 63, loopsong63) the takes of every park sketch · an exported mix as MP3 (ffmpeg found the way Hearth finds it)
  ipcMain.handle('creative-vst:park-list', e => own(e, () => parkList(dataDir)));
  ipcMain.handle('creative-vst:park-mp3', (e, sketch, name) => own(e, () => parkMp3(dataDir, sketch, name, require('./aemain').ffStatus({ ffmpeg: settings?.().ffmpegPath || undefined }).ffmpeg)));
  // (round 64, audiodoctor64) /audio doctor's "Turn off ASIO" / "Turn ASIO back on": the owner's choice is Settings
  // vstAsio (false = off, saved by the renderer); here it applies to the pool's hosts, which restart on the next use.
  if (settings?.().vstAsio === false) host.flags.asio = false;
  ipcMain.handle('creative-vst:asio', (e, on) => own(e, () => { host.flags.asio = on !== false && process.env.HEARTH_VST_ASIO !== '0'; delete host.flags.asioNote; host.stop(); return { ok: true, asio: host.flags.asio }; }));
  app.once('will-quit', () => host.stop()); getWin()?.webContents.once('destroyed', () => host.stop());
}
module.exports = { create, pool, discover, register, allowedName, pathKey, jobOf, parkSave, parkList, parkMp3 };
