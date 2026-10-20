// Voice, main side (round 23): local speech-to-text and the system's own voices, all on this computer.
//   voice:status     which speech-to-text tool is installed (whisper.cpp's whisper-cli, or Python's faster-whisper),
//                    the speech models in the data folder, the install steps for this system
//   voice:transcribe a 16 kHz WAV from the renderer → text, in a child process (never on the main thread); each
//                    segment is sent as it is decoded (voice:partial) so the words appear while it works
//   voice:download   a whisper.cpp model into <data>/voice/models (the renderer asks the owner first), with progress
//   voice:say / voice:hush / voice:voices   macOS `say`, Windows SAPI through PowerShell (text on stdin, never in a
//                    command line), the installed voices
//   voice:mic        asks macOS for the microphone (the system prompt), granted elsewhere
// HEARTH_WHISPER / HEARTH_WHISPER_MODEL (env) point at a binary / model by hand (the dev checks use dev/fake-whisper.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const MODELS = { tiny: 'ggml-tiny.bin', base: 'ggml-base.bin', small: 'ggml-small.bin', 'base.en': 'ggml-base.en.bin', 'small.en': 'ggml-small.en.bin' };
const exists = (p) => { try { return Boolean(p) && fs.statSync(p).isFile(); } catch { return false; } };

// whisper.cpp's binary: whisper-cli (Homebrew's whisper-cpp, current releases), older names whisper-cpp / main
const BIN_NAMES = ['whisper-cli', 'whisper-cpp', 'whisper'];
let binCache = { at: 0, path: null };
function findWhisper(override) {
  for (const p of [override, process.env.HEARTH_WHISPER]) if (exists(p)) return p;
  if (binCache.path && exists(binCache.path)) return binCache.path;
  if (Date.now() - binCache.at < 30000) return null; // a miss is looked for again after 30 s (installed meanwhile)
  binCache.at = Date.now();
  const dirs = [
    ...(process.env.PATH || '').split(path.delimiter).map((d) => d.trim().replace(/^"(.*)"$/, '$1')),
    // GUI apps on a Mac don't get the shell's PATH
    ...(IS_MAC ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', path.join(os.homedir(), 'bin')] : []),
    ...(IS_WIN ? ['C:\\whisper\\Release', 'C:\\whisper', 'C:\\Program Files\\whisper.cpp', path.join(process.env.LOCALAPPDATA || '', 'whisper', 'Release'), path.join(process.env.LOCALAPPDATA || '', 'whisper'), path.join(os.homedir(), 'whisper', 'Release'), path.join(os.homedir(), 'scoop', 'shims'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links')] : ['/usr/local/bin', '/usr/bin', path.join(os.homedir(), '.local', 'bin')]),
  ].filter(Boolean);
  for (const n of BIN_NAMES) for (const d of dirs) { const p = path.join(d, IS_WIN ? `${n}.exe` : n); if (exists(p)) { binCache.path = p; return p; } }
  return null;
}

// faster-whisper (Python): looked for once (a few hundred ms), again after a minute when missing
let pyCache = null;
function findFasterWhisper() {
  if (pyCache && (pyCache.ok || Date.now() - pyCache.at < 60000)) return Promise.resolve(pyCache.ok ? pyCache.python : null);
  const pys = IS_WIN ? ['py', 'python'] : ['python3', ...(IS_MAC ? ['/opt/homebrew/bin/python3', '/usr/local/bin/python3'] : [])];
  return new Promise((resolve) => {
    const next = (i) => {
      if (i >= pys.length) { pyCache = { ok: false, at: Date.now() }; resolve(null); return; }
      execFile(pys[i], ['-c', 'import faster_whisper'], { timeout: 8000, windowsHide: true }, (err) => {
        if (!err) { pyCache = { ok: true, python: pys[i], at: Date.now() }; resolve(pys[i]); } else next(i + 1);
      });
    };
    next(0);
  });
}

function register(ipcMain, getWin, { settings = () => ({}), dataDir } = {}) {
  const voiceDir = path.join(dataDir || os.tmpdir(), 'voice');
  const modelsDir = path.join(voiceDir, 'models');
  const tmpDir = path.join(voiceDir, 'tmp');
  try { for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { force: true }); } catch { /* none yet */ } // WAVs a crash or a busy file left
  const send = (ch, payload) => { try { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, payload); } catch { /* window gone */ } };
  const jobs = new Map(); // id → child
  let speaker = null; // the running `say` / PowerShell

  const models = () => Object.entries(MODELS).map(([name, file]) => {
    const p = path.join(modelsDir, file);
    let size = 0; try { size = fs.statSync(p).size; } catch { /* not there */ }
    return { name, file, path: p, size, have: size > 1e6 };
  });
  function modelPath(name, override) {
    for (const p of [override, process.env.HEARTH_WHISPER_MODEL]) if (exists(p)) return p;
    const all = models().filter((m) => m.have);
    return (all.find((m) => m.name === name) || all.find((m) => m.name === 'base') || all[0])?.path || null;
  }

  async function status(o = {}) {
    const whisper = findWhisper(o.whisperPath || settings().whisperPath);
    const python = whisper ? null : await findFasterWhisper();
    const model = whisper ? modelPath(o.model || 'base', o.modelPath) : null;
    return {
      engine: whisper ? 'whisper.cpp' : python ? 'faster-whisper' : null,
      bin: whisper, python, model, ready: Boolean((whisper && model) || python),
      models: models(), modelsDir, platform: process.platform,
    };
  }

  // ---------- speech-to-text ----------
  async function transcribe(o = {}) {
    const id = String(o.id || Date.now());
    const st = await status(o);
    if (!st.engine) return { ok: false, error: 'no-engine' };
    if (st.engine === 'whisper.cpp' && !st.model) return { ok: false, error: 'no-model' };
    fs.mkdirSync(tmpDir, { recursive: true });
    const wavPath = path.join(tmpDir, `${id.replace(/[^\w-]/g, '')}.wav`);
    fs.writeFileSync(wavPath, Buffer.from(o.wav || []));
    const lang = /^[a-z]{2}$/.test(o.lang || '') ? o.lang : 'auto';
    const threads = String(Math.max(1, Math.min(8, (os.cpus()?.length || 4) - 1)));
    let cmd; let args;
    if (st.engine === 'whisper.cpp') {
      cmd = st.bin;
      // -np: no progress prints; segments with timestamps stream on stdout as they're decoded
      args = ['-m', st.model, '-f', wavPath, '-l', lang, '-t', threads, '-np', ...(o.prompt ? ['--prompt', String(o.prompt).slice(0, 200)] : [])];
    } else {
      cmd = st.python;
      const py = [
        'import sys', 'from faster_whisper import WhisperModel',
        'm = WhisperModel(sys.argv[2], device="cpu", compute_type="int8", download_root=sys.argv[4])',
        'segs, info = m.transcribe(sys.argv[1], language=(None if sys.argv[3] == "auto" else sys.argv[3]), vad_filter=True)',
        'for s in segs:', '    print(s.text.strip(), flush=True)',
      ].join('\n');
      args = [...(cmd === 'py' ? ['-3'] : []), '-c', py, wavPath, (o.model || 'base').replace(/^ggml-|\.bin$/g, ''), lang, path.join(modelsDir, 'faster-whisper')];
    }
    const started = Date.now();
    return new Promise((resolve) => {
      let child;
      try { child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (err) { resolve({ ok: false, error: err.message }); return; }
      jobs.set(id, child);
      const parts = []; let buf = ''; let errText = '';
      const line = (l) => {
        const t = String(l).replace(/^\s*\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, '').trim();
        if (!t || /^\[(BLANK_AUDIO|MUSIC|SILENCE)[^\]]*\]$/i.test(t) || /^\((music|silence|inaudible)\)$/i.test(t) || /^(whisper_|main:|system_info|output_)/.test(t)) return;
        parts.push(t);
        send('voice:partial', { id, text: parts.join(' ') });
      };
      child.stdout.on('data', (d) => { buf += d; const ls = buf.split(/\r?\n/); buf = ls.pop(); ls.forEach(line); });
      child.stderr.on('data', (d) => { errText = (errText + d).slice(-4000); });
      const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, Math.max(30000, (o.seconds || 30) * 6000));
      const done = (r) => { clearTimeout(timer); jobs.delete(id); try { fs.rmSync(wavPath, { force: true }); } catch { /* busy (Windows): the tidy below */ } resolve(r); };
      child.on('error', (err) => done({ ok: false, error: err.message }));
      child.on('close', (code, signal) => {
        if (buf) line(buf);
        const text = parts.join(' ').replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
        if (signal && !text) { done({ ok: false, error: 'cancelled', cancelled: true }); return; }
        if (code && !text) { done({ ok: false, error: (errText.trim().split('\n').filter((l) => /error|fail|not/i.test(l)).pop() || `${path.basename(cmd)} exited with ${code}`).slice(0, 300) }); return; }
        done({ ok: true, text, ms: Date.now() - started, engine: st.engine });
      });
    });
  }

  // ---------- the speech model download (asked first in the renderer) ----------
  let downloading = null;
  function download(o = {}) {
    const name = MODELS[o.model] ? o.model : 'base';
    const dest = path.join(modelsDir, MODELS[name]);
    if (exists(dest) && fs.statSync(dest).size > 1e6) return Promise.resolve({ ok: true, path: dest, already: true });
    if (downloading) return downloading;
    const url = o.url || process.env.HEARTH_WHISPER_MODEL_URL || `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODELS[name]}`;
    fs.mkdirSync(modelsDir, { recursive: true });
    const part = `${dest}.part`;
    downloading = new Promise((resolve) => {
      const get = (u, hops) => {
        const lib = u.startsWith('https:') ? require('https') : require('http');
        const req = lib.get(u, { headers: { 'User-Agent': 'Hearth' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) { res.resume(); get(new URL(res.headers.location, u).toString(), hops + 1); return; }
          if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: `download failed (HTTP ${res.statusCode})` }); return; }
          const total = Number(res.headers['content-length']) || 0; let got = 0; let lastSent = 0;
          const out = fs.createWriteStream(part);
          res.on('data', (c) => { got += c.length; const now = Date.now(); if (now - lastSent > 250) { lastSent = now; send('voice:progress', { model: name, got, total }); } });
          res.pipe(out);
          out.on('finish', () => {
            if (total && got < total) { fs.rm(part, { force: true }, () => {}); resolve({ ok: false, error: 'the download was cut short' }); return; }
            fs.renameSync(part, dest);
            send('voice:progress', { model: name, got, total: total || got, done: true });
            resolve({ ok: true, path: dest, bytes: got });
          });
          out.on('error', (err) => resolve({ ok: false, error: err.message }));
          res.on('error', (err) => resolve({ ok: false, error: err.message }));
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.setTimeout(30000, () => req.destroy(new Error('the download stalled')));
      };
      get(url, 0);
    }).finally(() => { downloading = null; });
    return downloading;
  }

  // ---------- the system's own voices ----------
  // macOS `say` reads stdin (-f -); Windows SAPI via PowerShell reads stdin too: the text never lands in a command line
  function say(o = {}) {
    hush();
    const master = require('./volumemain').get();
    const text = (IS_MAC ? `[[volm ${master}]]` : '') + String(o.text || '').slice(0, 20000);
    if (!master) return Promise.resolve({ ok: true });
    if (!text.trim()) return Promise.resolve({ ok: true });
    let cmd; let args;
    const rate = Math.min(2, Math.max(0.5, Number(o.rate) || 1));
    if (IS_MAC) { cmd = 'say'; args = ['-r', String(Math.round(185 * rate)), ...(o.voice ? ['-v', String(o.voice)] : []), '-f', '-']; }
    else if (IS_WIN) {
      cmd = 'powershell.exe';
      const v = String(o.voice || '').replace(/'/g, "''");
      const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Volume = ${Math.round(master * 100)}; $s.Rate = ${Math.round((rate - 1) * 8)}; ${v ? `try { $s.SelectVoice('${v}') } catch {}; ` : ''}$t = [Console]::In.ReadToEnd(); $s.Speak($t)`;
      args = ['-NoProfile', '-NonInteractive', '-Command', ps];
    } else { cmd = 'spd-say'; args = ['-w', '-r', String(Math.round((rate - 1) * 60)), ...(o.voice ? ['-y', String(o.voice)] : []), '-e']; }
    return new Promise((resolve) => {
      let child;
      try { child = spawn(cmd, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }); } catch (err) { resolve({ ok: false, error: err.message }); return; }
      speaker = child;
      let err = '';
      child.stderr.on('data', (d) => { err = (err + d).slice(-500); });
      child.on('error', (e) => { if (speaker === child) speaker = null; resolve({ ok: false, error: e.message }); });
      child.on('close', (code, signal) => { if (speaker === child) speaker = null; resolve({ ok: !code || Boolean(signal), stopped: Boolean(signal), error: code && !signal ? err.trim() || `exit ${code}` : undefined }); });
      child.stdin.on('error', () => { /* closed early */ });
      child.stdin.end(text);
    });
  }
  function hush() { const s = speaker; speaker = null; if (s) { try { s.kill(); } catch { /* gone */ } return true; } return false; }
  function voices() {
    return new Promise((resolve) => {
      if (IS_MAC) execFile('say', ['-v', '?'], { timeout: 8000 }, (err, out) => resolve(err ? [] : String(out).split('\n').map((l) => l.match(/^(.+?)\s{2,}([a-z]{2}[_-][A-Z]{2})/)).filter(Boolean).map((m) => ({ name: m[1].trim(), lang: m[2] }))));
      else if (IS_WIN) execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture }'], { timeout: 15000, windowsHide: true }, (err, out) => resolve(err ? [] : String(out).split(/\r?\n/).filter(Boolean).map((l) => { const [name, lang] = l.split('|'); return { name: name.trim(), lang: (lang || '').trim() }; })));
      else resolve([]);
    });
  }

  ipcMain.handle('voice:status', (_e, o) => status(o || {}));
  ipcMain.handle('voice:transcribe', (_e, o) => transcribe(o || {}));
  ipcMain.handle('voice:cancel', (_e, id) => { const c = jobs.get(String(id)); if (c) { try { c.kill(); } catch { /* gone */ } } return Boolean(c); });
  ipcMain.handle('voice:download', (_e, o) => download(o || {}));
  ipcMain.handle('voice:say', (_e, o) => say(o || {}));
  require('./volumemain').onChange(n => { if (!n) hush(); });
  ipcMain.handle('voice:hush', () => hush());
  ipcMain.handle('voice:voices', () => voices());
  ipcMain.handle('voice:mic', async () => {
    if (!IS_MAC) return 'granted';
    try {
      const { systemPreferences } = require('electron');
      const s = systemPreferences.getMediaAccessStatus('microphone');
      if (s === 'granted') return s;
      return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied';
    } catch { return 'unknown'; }
  });
  return { status, transcribe, download, say, hush, voices };
}

module.exports = { register, findWhisper, MODELS, _reset: () => { binCache = { at: 0, path: null }; pyCache = null; } };
