// Serum 2 and Vital run in persistent, isolated native hosts (one per open instrument since round 61). No plugin code enters Electron.
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');
const ALLOWED = new Map([['vital.vst3', 'Vital'], ['serum2.vst3', 'Serum 2']]);
const allowedName = file => ALLOWED.get(path.basename(file).toLowerCase().replace(/ /g, ''));
// (round 58, codexcare58) Windows and the Mac's default disks ignore case, and the Mac gives accents decomposed (NFD):
// one key per plugin there, so a folder added twice in another spelling doesn't list it twice. Linux keeps exact names.
const FOLD = process.platform === 'win32' || process.platform === 'darwin';
const pathKey = (p, fold = FOLD) => fold ? p.normalize('NFC').toLowerCase() : p;
function discover(roots, fold = FOLD, visited = null) {
  const found = [], seen = new Set();
  function walk(dir, depth) {
    if (depth > 8 || found.length >= 32) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    visited?.push(dir); // (round 64, vstembed64) the folders read, for the mtime cache below
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
// (round 64, vstembed64) the VST folders are walked again only when one of the folders read last time changed (a
// folder's mtime changes when an entry is added / removed / renamed in it): a plugin installed or removed is seen, an
// unchanged disk costs one stat per folder. Kept in memory and in <data>/creative-vst/scan-cache.json across restarts.
const scanMemo = new Map();
function discoverCached(roots, cacheFile, fold = FOLD) {
  const key = JSON.stringify([roots, fold]);
  let hit = scanMemo.get(key);
  if (!hit && cacheFile) { const c = require('./datasafe-core').load(fs, cacheFile, null, { prev: false }).value; if (c?.key === key && Array.isArray(c.found) && c.dirs && typeof c.dirs === 'object') hit = c; }
  if (hit) {
    const same = Object.entries(hit.dirs).every(([dir, m]) => { try { return fs.statSync(dir).mtimeMs === m; } catch { return false; } });
    const rootsThere = roots.every(r => { try { return fs.statSync(r).isDirectory() === (hit.rootsSeen?.[r] === true); } catch { return hit.rootsSeen?.[r] !== true; } });
    if (same && rootsThere) { scanMemo.set(key, hit); return { plugins: hit.found.map(p => ({ ...p })), cached: true }; }
  }
  const visited = [], found = discover(roots, fold, visited), dirs = {}, rootsSeen = {};
  for (const d of visited) { try { dirs[d] = fs.statSync(d).mtimeMs; } catch { /* gone meanwhile */ } }
  for (const r of roots) { try { rootsSeen[r] = fs.statSync(r).isDirectory(); } catch { rootsSeen[r] = false; } }
  const entry = { key, found, dirs, rootsSeen };
  scanMemo.set(key, entry);
  if (cacheFile) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); const tmp = cacheFile + '.part'; fs.writeFileSync(tmp, JSON.stringify(entry)); fs.renameSync(tmp, cacheFile); } catch { /* the walk still worked */ } }
  return { plugins: found.map(p => ({ ...p })), cached: false };
}
// (round 61, vstlive61) live mode: 'open' (load + optional live start), 'values' (a few controls, fresh), 'sequence'
// (a phrase played by the host's audio thread), 'midi-in' (which controller). STREAMED actions may also travel on the
// persistent no-reply socket (send()). jobOf() is the one whitelist of fields that reach the Python host.
const LIVE_ACTIONS = ['open', 'values', 'sequence', 'midi-in'];
const STREAMED = ['midi', 'patch', 'volume', 'panic', 'sequence', 'launch', 'pad-fx', 'preset-switch', 'set-panic', 'set-tempo', 'editor-place']; // (round 64, liveset64) + pad presses · (round 64, vstembed64) + the editor's layout
// (round 64, liveset64) the Live set (creative-vst-liveset.py, tools/liveset.js): transport, clips, the preset twin, panic,
// the run recorder. Clip files must be WAVs under <data>/creative-live or <data>/creative-park; a run's WAV path is made
// here (<data>/creative-live/<set>/<Rehearsal|Performance> <date>.wav), never taken from the window.
const LIVESET_ACTIONS = ['set-open', 'set-close', 'set-status', 'set-tempo', 'clip-load', 'clip-unload', 'launch', 'pad-fx', 'preset-preload', 'preset-switch', 'set-panic', 'run-record', 'run-stop'];
// (round 64, vstembed64) the editor inside Hearth and the fast control list (docs/upgrades/vstembed64.md):
// 'controls' (every control known so far + values; ready when all are), 'editor' {embed} (open it in the placeholder),
// 'editor-place' {embed: {x, y, clip, visible}} (streamed on layout changes), 'editor-embed' (a floating editor goes in),
// 'editor-pop' (out into its own window), 'editor-close'. Hearth's window handle is added here, never by the page.
const EMBED_ACTIONS = ['controls', 'editor-place', 'editor-embed', 'editor-pop', 'editor-close', 'editor-refresh']; // 'editor-refresh': reopen it on the instance now playing (liveset64's preset twin)
const int = (v, lo = -1e5, hi = 1e5) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined;
function embedOf(e) {
  if (!e || typeof e !== 'object') return undefined;
  const clip = Array.isArray(e.clip) && e.clip.length === 4 && e.clip.every(Number.isFinite) ? e.clip.map(v => int(v)) : null;
  const origin = Array.isArray(e.origin) && e.origin.length === 2 && e.origin.every(Number.isFinite) ? e.origin.map(v => int(v)) : undefined; // the Mac: Hearth's content origin (points)
  return { x: int(e.x), y: int(e.y), clip, visible: e.visible !== false, origin, scale: Number.isFinite(e.scale) && e.scale > 0 && e.scale < 8 ? e.scale : undefined };
}
// (round 62, parkjam62) the loop recorder (docs/upgrades/parkjam62.md): 'record' arms a take in the host's audio thread,
// 'record-status' / 'record-cancel', 'record-take' writes the WAV in the session folder and hands its bytes back here.
const PARK_ACTIONS = ['record', 'record-status', 'record-take', 'record-cancel'];
// (round 66, bouncelog66) "Save a sketch": the last 30 s the desk played ('sketch-save', the path made here) · 'sketch-status'
const SKETCH_ACTIONS = ['sketch-status', 'sketch-save', 'sketch-peek'];
// (round 69, midilearn69) 🎹 Map my controller (creative-vst-midimap.py): the mappings of the open instrument, learn the next CC
const MIDIMAP_ACTIONS = ['midimap-status', 'midimap-learn', 'midimap-set']; // (round 68, refab68) + 'sketch-peek': the same last 30 s to a scratch file, for 🎧 Reference to measure
function jobOf(r, name) {
  if (r.keys !== undefined && (!Array.isArray(r.keys) || r.keys.length > 512 || r.keys.some(k => typeof k !== 'string'))) throw Error('Ask for up to 512 parameter keys.');
  if (r.sequence !== undefined && (!Array.isArray(r.sequence) || r.sequence.length > 256)) throw Error('A phrase has up to 256 notes.');
  if (r.midiIn !== undefined && r.midiIn !== null && (typeof r.midiIn !== 'string' || r.midiIn.length > 200)) throw Error('Invalid MIDI input.');
  if ([r.bars, r.beats, r.bpm].some(v => v !== undefined && !Number.isFinite(v))) throw Error('Invalid loop length.'); // (round 62, parkjam62)
  return { action: r.action, plugin: r.plugin, name, parameters: r.parameters, notes: r.notes, duration: r.duration, state: r.state, note: r.note, on: r.on, velocity: r.velocity, gain: r.gain, buffer: r.buffer, device: r.device,
    exclusive: r.exclusive === true || undefined, midiIn: r.midiIn ?? undefined, keys: r.keys, sequence: r.sequence, loop: r.loop, live: r.live === true || undefined,
    bars: r.bars, beats: r.beats, bpm: r.bpm, wait: r.wait === 'note' ? 'note' : undefined, // (round 62, parkjam62) the loop recorder's fields
    embed: embedOf(r.embed), stateOnly: r.stateOnly === true || undefined, limit: Number.isInteger(r.limit) && r.limit > 0 && r.limit <= 5000 ? r.limit : undefined, // (round 64, vstembed64) the editor's placement (no parent from the page) · a state-only snapshot
    ...liveFields(r), ...require('./tools/midilearn-core.js').fields(r) }; // (round 64, liveset64) · (round 69, midilearn69) maps / pickup / learn
}
function liveFields(r) { // (round 64, liveset64) the Live set's fields, checked here and again in the host
  const str = (v, n) => v === undefined || (typeof v === 'string' && v.length <= n);
  if (!str(r.slot, 64) || !str(r.id, 120) || [r.fx, r.gainDb, r.fade].some(v => v !== undefined && !Number.isFinite(v))) throw Error('Invalid live set pad.');
  const out = {};
  if (r.slot !== undefined) out.slot = r.slot;
  if (r.id !== undefined) out.id = r.id;
  if (r.fx !== undefined) out.fx = Math.max(-1, Math.min(1, r.fx));
  if (r.gainDb !== undefined) out.gainDb = Math.max(-60, Math.min(12, r.gainDb));
  if (r.fade !== undefined) out.fade = r.fade;
  if (['toggle', 'play', 'stop'].includes(r.mode)) out.mode = r.mode;
  if (['bar', 'beat', 'now'].includes(r.at)) out.at = r.at;
  if (['bar', 'beat', 'now'].includes(r.quantize)) out.quantize = r.quantize;
  if (['Rehearsal', 'Performance'].includes(r.kind)) out.kind = r.kind;
  return out;
}
function create({ dataDir, python, roots, helper = path.join(__dirname, 'creative-vst-host.py'), flags = { asio: process.env.HEARTH_VST_ASIO !== '0' }, lowPriority = false }) {
  const home = path.join(dataDir, 'creative-vst'), runtime = path.join(home, 'runtime');
  const bin = python || process.env.HEARTH_VST_PYTHON || path.join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const standard = roots || (process.platform === 'win32' ? [path.join(process.env.CommonProgramFiles || 'C:/Program Files/Common Files', 'VST3'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs/Common/VST3')] : [path.join(os.homedir(), 'Library/Audio/Plug-Ins/VST3'), '/Library/Audio/Plug-Ins/VST3', '/usr/lib/vst3', path.join(os.homedir(), '.vst3')]);
  let known = new Set(), processChild = null, connection = null, starting = null, jobDir = null, pending = 0, setupBusy = false;
  let stream = null; // (round 61, vstlive61) one persistent socket for notes / knob moves (no replies)
  let lastStart = null; // (round 64, vstembed64) { ms (spawn → ready), boot (the host's own start), at }
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
      // (round 64, vstembed64) cacheDir: the host keeps each plugin version's control list there (types, ranges, choices)
      const began = Date.now(); fs.writeFileSync(file, JSON.stringify({ action: 'serve', token, cacheDir: path.join(home, 'controls-cache') }));
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
        // (round 68, bugbutton68 — Claude's addition) the host stopped by itself (stop() lets go of it first): 🪲 Something broke
        if (processChild === child) { try { require('./bugmain').gone('the plugin host (VST)', { code, what: stderr.trim().split('\n').pop()?.slice(0, 200) || '' }); } catch { /* outside Hearth's main process */ } }
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
      connection = { port: result.port, token }; lastStart = { ms: Date.now() - began, boot: result.bootMs ?? null, at: began }; return connection;
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
      // (round 64, vstembed64) unchanged folders aren't walked again (mtime cache)
      const t0 = Date.now(), locations = [...standard, ...extra], { plugins, cached } = discoverCached(locations, path.join(home, 'scan-cache.json')); known = new Set(plugins.map(p => p.path)); return { ok: true, plugins, roots: locations, cached, scanMs: Date.now() - t0 };
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
      const actions = ['names', 'inspect', 'snapshot', 'editor', 'render', 'devices', 'live-start', 'live-stop', 'live-status', 'midi', 'panic', 'patch', 'volume', ...LIVE_ACTIONS, ...PARK_ACTIONS, ...LIVESET_ACTIONS, ...EMBED_ACTIONS, ...SKETCH_ACTIONS, ...MIDIMAP_ACTIONS]; // (round 69, midilearn69)
      if (!request || !actions.includes(request.action)) throw Error('Unknown instrument action.');
      if (!['devices'].includes(request.action) && (!known.has(request.plugin) || !allowedName(request.plugin))) throw Error('Scan and select Serum 2 or Vital first.');
      const name = request.plugin && allowedName(request.plugin);
      if (request.name && request.name !== name) throw Error('Only the Serum 2 and Vital instruments are supported.');
      if (typeof request.state !== 'undefined' && (typeof request.state !== 'string' || request.state.length > 12e6)) throw Error('Invalid plugin state.');
      if (JSON.stringify(request.parameters || {}).length > 200000 || (request.notes && (!Array.isArray(request.notes) || request.notes.length > 128))) throw Error('Plugin request too large.');
      const job = jobOf(request, name);
      if (job.embed && typeof request.parent === 'string' && /^\d{1,20}$/.test(request.parent)) job.embed.parent = request.parent; // (round 64) set by register(), never by the page
      const asked = Date.now(); // (round 64) did this request start the host? (open → first sound timings)
      // (round 64, liveset64) a clip is a WAV Hearth made (creative-live) or a park take (creative-park); a run's file path is made here
      if (request.action === 'clip-load') { job.file = liveClip(dataDir, request.file); job.loop = request.loop === true; }
      if (request.action === 'run-record') job.output = liveRunPath(dataDir, request.set, job.kind || 'Rehearsal');
      if (request.action === 'sketch-save') job.output = require('./bouncelogmain.js').sketchPath(dataDir, typeof request.project === 'string' ? request.project : ''); // (round 66, bouncelog66)
      if (request.action === 'sketch-peek') job.output = require('./refabmain.js').peekPath(dataDir); // (round 68, refab68) a scratch path in the temp folder, made here
      if (request.action === 'preset-preload' && typeof request.state !== 'string') throw Error('A preset pad needs its state.');
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
      if (request.action === 'open' && lastStart && lastStart.at >= asked) result.hostStartMs = lastStart.ms; // (round 64)
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
    get lastStart() { return lastStart; }, // (round 64, vstembed64)
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
  const master = require('./volumemain'), monitor = new Map();
  const playback = r => {
    if (!r?.plugin || !['volume', 'live-start', 'open'].includes(r.action)) return r;
    if (r.action === 'open' && !r.live) return r;
    const gain = r.gain ?? monitor.get(r.plugin) ?? .2;
    if (!Number.isFinite(gain) || gain < 0 || gain > .5) throw Error('Volume outside 0–0.5.');
    monitor.set(r.plugin, gain);
    return { ...r, gain: gain * master.get() };
  };
  const flags = { asio: process.env.HEARTH_VST_ASIO !== '0' };
  let extra = [], base = null, last = null; const hosts = new Map(); // plugin path -> host
  master.onChange(level => {
    for (const [plugin, h] of hosts) if (h.alive && monitor.has(plugin)) {
      const job = { action: 'volume', plugin, gain: monitor.get(plugin) * level };
      if (!h.send(job)) h.request(job).catch(() => {});
    }
  });
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
      const h = hostFor(r?.plugin, !['devices', 'live-status', 'live-stop', 'panic', 'record-status', 'record-cancel', 'set-status', 'set-close', 'set-panic', 'run-stop', ...EMBED_ACTIONS, ...MIDIMAP_ACTIONS].includes(r?.action)) || (r?.action === 'devices' ? anyAlive() : null); // (round 64) + the editor / controls actions: only an open instrument's host
      if (!h) return { ok: true, playing: false }; // status / stop / panic of an instrument that isn't open: nothing plays
      if (r.action === 'live-start' || (r.action === 'open' && r.live === true)) { last = r.plugin; await quietOthers(r.plugin); }
      return h.request(playback(r));
    },
    send(r) {
      const h = r && STREAMED.includes(r.action) && hosts.get(r.plugin);
      if (!h) return { ok: false };
      r = playback(r);
      if (h.send(r)) return { ok: true };
      if (h) h.request(r).catch(() => {}); // no stream yet: the same message as a normal request
      return { ok: !!h };
    },
    stop() { for (const h of hosts.values()) h.stop(); base?.stop(); return { ok: true }; },
    // (round 64, vstembed64) warm: the host process started, its imports done and `plugin` loaded (no audio device), so
    // the first click on that instrument only starts the sound. Used at idle after startup when the owner used the
    // Sound desk last session (register → warmLater), never otherwise.
    async warm(plugin, roots = []) {
      const t0 = Date.now(); this.scan(roots);
      const h = plugin && anyAlive().knows(plugin) ? hostFor(plugin) : null;
      if (!h) { const s = await anyAlive().status(); return { ok: !!s.ok, loaded: false, ms: Date.now() - t0, error: s.error }; }
      const r = await h.request({ action: 'open', plugin, live: false });
      return { ok: !!r.ok, loaded: !!r.ok, ms: Date.now() - t0, error: r.error };
    },
    // (round 64) every open editor closes (Hearth's window is closing: never leave a child window behind it)
    closeEditors() { return Promise.all([...hosts].filter(([, h]) => h.alive).map(([p, h]) => h.request({ action: 'editor-close', plugin: p }).catch(() => {}))); },
    // (round 64) the Mac: the editor is a separate window aligned over the desk, so it follows Hearth's window
    follow(origin, scale) { for (const [p, h] of hosts) if (h.alive) h.send({ action: 'editor-place', plugin: p, embed: { origin, scale } }); return { ok: true }; },
    get busy() { return [...hosts.values()].some(h => h.busy) || !!base?.busy; },
    get hosts() { return hosts.size; },
    get roots() { return extra; }, // (round 64) the extra plugin folders, remembered with the warm instrument
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
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { dirs = []; } // (round 67, sketchpads67) no park folder yet: still list the sketch loops below
  for (const d of dirs) {
    let names = []; try { names = fs.readdirSync(path.join(root, d.name)); } catch { continue; }
    for (const n of names) {
      if (!/\.json$/i.test(n) || / song\.json$/i.test(n) || takes.length >= 400) continue;
      try { const j = JSON.parse(fs.readFileSync(path.join(root, d.name, n), 'utf8')); if (j?.v === 1 && typeof j.loop === 'string' && j.bpm && j.bars) { delete j.notesPlayed; takes.push({ ...j, notesFile: path.join(root, d.name, n), folder: d.name }); } } catch { /* not a take */ }
    }
  }
  try { takes.push(...require('./sketchpadsmain.js').loopTakes(dataDir, Math.max(0, 400 - takes.length))); } catch { /* (round 67, sketchpads67) loops trimmed from session sketches join the park takes; never a reason to list none */ }
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
// (round 64, vstembed64) the warm host: <data>/creative-vst/warm.json counts app sessions and remembers the instrument
// opened last and in which session. At idle after startup (main.js → warmLater) the host is started and that instrument
// loaded only when it was used in the previous (or this) session — never for someone who hasn't used the Sound desk.
const warmFile = dataDir => path.join(dataDir, 'creative-vst', 'warm.json');
function warmRead(dataDir) { const r = require('./datasafe-core').load(fs, warmFile(dataDir), {}, { prev: false }); return { value: r.value && typeof r.value === 'object' ? r.value : {}, canSave: r.canSave }; }
function warmWrite(dataDir, value) { try { const f = warmFile(dataDir); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(value)); fs.renameSync(f + '.part', f); } catch { /* a missed note only costs one cold start */ } }
function noteUse(dataDir, plugin, roots) {
  const r = warmRead(dataDir); if (!r.canSave) return;
  const v = r.value, session = v.session || 1;
  if (v.plugin === plugin && v.usedSession === session && JSON.stringify(v.roots || []) === JSON.stringify(roots || [])) return;
  warmWrite(dataDir, { ...v, session, plugin, roots: roots || [], usedSession: session, at: new Date().toISOString() });
}
let registered = null; // (round 64) the pool, for warmLater
function warmLater(dataDir, load, delay = 20000) {
  const r = warmRead(dataDir); if (!r.canSave || !r.value.plugin) return null; // never used: nothing written, nothing started
  const v = { ...r.value, session: (r.value.session || 0) + 1 }; warmWrite(dataDir, v);
  if (!v.plugin || !(v.usedSession >= v.session - 1) || process.env.HEARTH_VST_WARM === '0') return null;
  const t = setTimeout(() => { try { load(); registered?.host.warm(v.plugin, v.roots || []).then(w => { registered.warmed = w; }).catch(() => {}); } catch { /* not this time */ } }, delay);
  t.unref?.(); return { plugin: v.plugin, delay };
}
// (round 64, vstembed64) Hearth's window for the editor: Windows / Linux = the native handle (HWND / X11 id) as a decimal
// string; the Mac = the window number (CGWindowID, from getMediaSourceId) + the content area's top-left on screen.
function windowOf(win) {
  if (!win || win.isDestroyed?.()) return null;
  try {
    if (process.platform === 'darwin') {
      const id = /^window:(\d+):/.exec(win.getMediaSourceId() || '')?.[1]; const b = win.getContentBounds();
      const scale = require('electron').screen.getDisplayMatching(b).scaleFactor || 1;
      return id ? { parent: id, origin: [b.x, b.y], scale } : null;
    }
    const h = win.getNativeWindowHandle(); const id = h.length >= 8 ? h.readBigUInt64LE(0) : BigInt(h.readUInt32LE(0));
    return id ? { parent: String(id) } : null;
  } catch { return null; }
}
// (round 64, liveset64) <data>/creative-live/<set>/<file>: a live set's prepared clips, its runs (Rehearse / Perform) and
// their logs. Same folder-name rule as the park sketches; plain file names only; written atomically (.part, renamed).
const liveFolder = (dataDir, set) => path.join(dataDir, 'creative-live', String(set || 'Live set').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Live set');
function liveSave(dataDir, set, name, bytes) {
  if (typeof name !== 'string' || !/^[\w .·-]{1,100}\.(wav|json|mid)$/i.test(name) || name.startsWith('.')) throw Error('Invalid live set file name.');
  const data = bytes instanceof Uint8Array ? bytes : typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : null;
  if (!data || data.length < 1 || data.length > 200e6) throw Error('Invalid live set file.');
  const dir = liveFolder(dataDir, set), file = path.join(dir, name);
  fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.part'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
  return file;
}
function liveClip(dataDir, file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.wav$/i.test(file)) throw Error('A clip is a WAV file.');
  const real = path.resolve(file), roots = ['creative-live', 'creative-park', 'creative-sketches'].map(d => path.join(path.resolve(dataDir), d) + path.sep);
  if (!roots.some(r => pathKey(real).startsWith(pathKey(r))) || real.split(path.sep).includes('..')) throw Error('Clips come from your park sketches or the live set folder (or your session sketches).'); // (round 67, sketchpads67) + creative-sketches: a session sketch or a loop trimmed from one, on a pad
  if (!fs.existsSync(real)) throw Error(`A clip's file is gone: ${path.basename(real)}`);
  return real;
}
function liveRunPath(dataDir, set, kind) {
  const d = new Date(), p = n => String(n).padStart(2, '0'), dir = liveFolder(dataDir, set);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${kind === 'Performance' ? 'Performance' : 'Rehearsal'} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.wav`);
}
// a run as MP3 (for the quest proof: a 10-minute WAV is over the journal's 80 MB), next to its WAV, atomically
function liveMp3(dataDir, set, file, ffmpeg) {
  if (!ffmpeg) return Promise.resolve({ ok: false, error: 'ffmpeg is not installed, so the MP3 was skipped (the WAV is there).' });
  const dir = liveFolder(dataDir, set), wav = path.join(dir, path.basename(String(file || '')));
  if (!/\.wav$/i.test(wav) || !fs.existsSync(wav)) return Promise.resolve({ ok: false, error: 'No such recording in the live set folder.' });
  const mp3 = wav.replace(/\.wav$/i, '.mp3'), tmp = mp3 + '.part';
  return new Promise(resolve => require('child_process').execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '4', '-f', 'mp3', tmp], { timeout: 600000, windowsHide: true }, err => {
    if (err) { try { fs.unlinkSync(tmp); } catch { /* none */ } resolve({ ok: false, error: `The MP3 failed (${String(err.message).split('\n')[0].slice(0, 160)}); the WAV is there.` }); return; }
    try { fs.renameSync(tmp, mp3); resolve({ ok: true, path: mp3 }); } catch (e) { resolve({ ok: false, error: e.message }); }
  }));
}
function register(ipcMain, { dataDir, getWin, app, settings }) {
  const host = pool({ dataDir });
  registered = { host }; // (round 64, vstembed64)
  // (round 64) the editor in Hearth's window: the window's handle is added here (the page never names a window)
  const withWindow = r => {
    if (!r || typeof r !== 'object') return r;
    if (r.action === 'open' && typeof r.plugin === 'string') noteUse(dataDir, r.plugin, host.roots);
    if (!['editor', 'editor-embed'].includes(r.action) || !r.embed) return r;
    const w = windowOf(getWin()); if (!w) return { ...r, embed: undefined };
    return { ...r, parent: w.parent, embed: { ...r.embed, ...(w.origin ? { origin: w.origin, scale: w.scale } : {}) } };
  };
  const own = (e, fn) => { if (e.sender !== getWin()?.webContents || e.senderFrame !== e.sender.mainFrame) return { ok: false, error: 'Only the Hearth workspace can use the plugin host.' }; return fn(); };
  ipcMain.handle('creative-vst:scan', (e, roots) => own(e, () => host.scan(roots)));
  ipcMain.handle('creative-vst:status', e => own(e, () => host.status()));
  ipcMain.handle('creative-vst:setup', e => own(e, () => host.setup()));
  ipcMain.handle('creative-vst:request', (e, r) => own(e, () => host.request(withWindow(r))));
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
  // (round 64, liveset64) the Live set's folder: prepared clips / run logs, and a run as MP3 for the open-mic proof
  ipcMain.handle('creative-vst:live-save', (e, set, name, bytes) => own(e, () => { try { return { ok: true, path: liveSave(dataDir, set, name, bytes) }; } catch (err) { return { ok: false, error: err.message }; } }));
  ipcMain.handle('creative-vst:live-mp3', (e, set, file) => own(e, () => liveMp3(dataDir, set, file, require('./aemain').ffStatus({ ffmpeg: settings?.().ffmpegPath || undefined }).ffmpeg)));
  app.once('will-quit', () => host.stop()); getWin()?.webContents.once('destroyed', () => host.stop());
  // (round 64, vstembed64) an editor inside Hearth's window closes before the window does; on the Mac it follows the window
  const win = getWin();
  if (win && !win.isDestroyed()) {
    win.once('close', () => { host.closeEditors().catch(() => {}); });
    if (process.platform === 'darwin') { const follow = () => { const w = windowOf(win); if (w?.origin) host.follow(w.origin, w.scale); }; win.on('move', follow); win.on('resize', follow); }
  }
  ipcMain.handle('creative-vst:warm-status', e => own(e, () => ({ ok: true, warmed: registered?.warmed || null, hosts: host.hosts }))); // (round 64) what the idle warm did
}
module.exports = { create, pool, discover, discoverCached, register, allowedName, pathKey, jobOf, parkSave, parkList, parkMp3, liveSave, liveClip, liveRunPath, liveMp3, liveFolder, warmLater, noteUse, warmRead, windowOf }; // (round 64, liveset64) live* · (round 64, vstembed64) discoverCached, warmLater, noteUse, warmRead, windowOf
