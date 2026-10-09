// After Effects bridge: finds AE (Windows and Mac), runs ExtendScript in it, installs scripts into its Scripts
// menu, reads output-module templates and drives aerender with live progress. Also finds ffmpeg / ffprobe
// (optional) for exact frame rates, social export presets, crops and playable proxies in Video Review.
const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./store');

const AE_DIR = path.join(DATA_DIR, 'ae');
fs.mkdirSync(AE_DIR, { recursive: true });

function versionKey(name) {
  return (name.match(/\d+(\.\d+)?/g) || ['0']).map(Number);
}
function newest(dirs) {
  return dirs.sort((a, b) => {
    const x = versionKey(a); const y = versionKey(b);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  })[0];
}
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p); } catch { return false; } };

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// ---------- locating After Effects ----------
// Mac: /Applications/Adobe After Effects 2026/ holds "Adobe After Effects 2026.app" and aerender.
// The override may be that folder, the .app itself, or (Windows) the "Support Files" folder.
function macDirFrom(p) {
  if (!p) return null;
  if (/\.app\/?$/i.test(p) && exists(p)) return path.dirname(p.replace(/\/$/, ''));
  if (exists(p) && fs.readdirSync(p).some((f) => /^Adobe After Effects.*\.app$/i.test(f))) return p;
  return null;
}
let spotlightCache;
function macSpotlight() {
  // AE installed somewhere unusual (another volume, ~/Applications): ask Spotlight once.
  if (spotlightCache !== undefined) return spotlightCache;
  spotlightCache = null;
  try {
    const out = execFileSync('mdfind', ["kMDItemCFBundleIdentifier == 'com.adobe.AfterEffects*'"], { timeout: 4000, encoding: 'utf8' });
    const apps = out.split('\n').filter((l) => /\.app$/.test(l) && !/Uninstall|Beta Uninstall/i.test(l));
    const pick = newest(apps.map((a) => path.dirname(a)));
    spotlightCache = pick || null;
  } catch { /* no Spotlight (or indexing off) */ }
  return spotlightCache;
}
function locate(override) {
  if (IS_MAC) {
    const o = macDirFrom(override);
    if (o) return o;
    const roots = ['/Applications', path.join(os.homedir(), 'Applications')];
    const found = [];
    for (const root of roots) {
      let dirs = [];
      try { dirs = fs.readdirSync(root).filter((d) => /^Adobe After Effects/i.test(d)); } catch { continue; }
      for (const d of dirs) if (macDirFrom(path.join(root, d))) found.push(path.join(root, d));
    }
    // prefer release versions over Beta
    const release = found.filter((d) => !/beta/i.test(d));
    return newest(release.length ? release : found) || macSpotlight();
  }
  if (override && exists(path.join(override, 'AfterFX.exe'))) return override;
  if (override && exists(path.join(override, 'Support Files', 'AfterFX.exe'))) return path.join(override, 'Support Files');
  const bases = [process.env.ProgramFiles || 'C:\\Program Files', 'C:\\Program Files', 'D:\\Program Files'].map((b) => path.join(b, 'Adobe'));
  for (const base of [...new Set(bases)]) {
    let dirs = [];
    try { dirs = fs.readdirSync(base).filter((d) => /^Adobe After Effects/i.test(d)); } catch { continue; }
    const pick = newest(dirs.filter((d) => exists(path.join(base, d, 'Support Files', 'AfterFX.exe'))));
    if (pick) return path.join(base, pick, 'Support Files');
  }
  return null;
}

function prefsDir() {
  const root = IS_MAC ? path.join(os.homedir(), 'Library', 'Preferences', 'Adobe', 'After Effects') : path.join(process.env.APPDATA || '', 'Adobe', 'After Effects');
  try {
    const v = newest(fs.readdirSync(root).filter((d) => /^\d+(\.\d+)?$/.test(d)));
    return v ? path.join(root, v) : null;
  } catch { return null; }
}

function macApp(dir) {
  try { const app = fs.readdirSync(dir).find((f) => /^Adobe After Effects.*\.app$/i.test(f)); return app ? path.join(dir, app) : null; } catch { return null; }
}

function status(override) {
  const dir = locate(override);
  const afterfx = dir && (IS_MAC ? macApp(dir) : path.join(dir, 'AfterFX.exe'));
  const aer = dir && path.join(dir, IS_MAC ? 'aerender' : 'aerender.exe');
  const prefs = prefsDir();
  const version = dir ? (path.basename(IS_MAC ? dir : path.dirname(dir)).match(/After Effects\s*(.+)$/i)?.[1] || '').trim() : '';
  return {
    found: Boolean(afterfx),
    platform: process.platform,
    dir,
    version,
    appName: afterfx ? path.basename(afterfx, '.app') : null,
    afterfx,
    aerender: exists(aer) ? aer : null,
    userScripts: prefs && path.join(prefs, 'Scripts'),
    // Plain words for the UI when something is missing.
    reason: afterfx ? null : IS_MAC
      ? 'After Effects isn\'t installed in /Applications (or ~/Applications). Install it from Creative Cloud, or set its folder in Settings → Folders.'
      : IS_WIN ? 'After Effects isn\'t installed in Program Files\\Adobe. Install it from Creative Cloud, or set its "Support Files" folder in Settings → Folders.'
        : 'After Effects only runs on Windows and macOS.',
  };
}

// Is AE open right now? (Scripts start it when it isn't; this only changes the wording in the UI.)
function running() {
  return new Promise((resolve) => {
    if (IS_MAC) execFile('pgrep', ['-f', 'After Effects.app/Contents/MacOS'], (err, out) => resolve(!err && Boolean(String(out).trim())));
    else if (IS_WIN) execFile('tasklist', ['/FI', 'IMAGENAME eq AfterFX.exe', '/NH'], { windowsHide: true }, (err, out) => resolve(!err && /AfterFX\.exe/i.test(String(out))));
    else resolve(false);
  });
}

// Output-module template names from AE's own preferences (hidden internal ones skipped).
function templates() {
  const dir = prefsDir();
  if (!dir) return [];
  try {
    const file = fs.readdirSync(dir).find((f) => /Prefs-indep-output\.txt$/.test(f));
    if (!file) return [];
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const names = [...text.matchAll(/"Output Module Spec Strings Name \d+"\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    return [...new Set(names.filter((n) => !n.startsWith('_HIDDEN')))];
  } catch { return []; }
}

// Explains an osascript failure in plain words (the first run asks for Automation permission).
function macError(stderr) {
  const s = String(stderr || '');
  if (/-1743|not authori[sz]ed/i.test(s)) return 'macOS blocked Hearth from controlling After Effects. Allow it in System Settings → Privacy & Security → Automation → Hearth → After Effects, then try again.';
  if (/-1728|-1708|doesn.t understand/i.test(s)) return 'After Effects didn\'t accept the script (AppleScript DoScriptFile). Make sure After Effects finished starting, then try again.';
  if (/-600|isn.t running/i.test(s)) return 'After Effects isn\'t running and couldn\'t be started.';
  if (/-10814|-1728.*application|Can.t get application/i.test(s)) return 'macOS couldn\'t find the After Effects app by name. Set its folder in Settings → Folders.';
  return s.trim().split('\n').pop() || 'osascript failed';
}

// Runs a script in the running AE (or starts AE first): AfterFX.exe -r on Windows, AppleScript DoScriptFile on a Mac.
// Resolves when AE accepted the script (or after a few seconds while AE is still starting).
function runScript(code, label = 'script', override) {
  const st = status(override);
  if (!st.found) throw new Error(st.reason);
  const file = path.join(AE_DIR, `${String(label).replace(/[^\w-]+/g, '_').slice(0, 60)}-${Date.now()}.jsx`);
  // Wrap in an undo group so one Ctrl+Z (⌘Z) in AE reverts the whole script.
  fs.writeFileSync(file, `app.beginUndoGroup(${JSON.stringify(`Hearth: ${label}`)});\ntry {\n${code}\n} catch (e) { alert("Hearth script error: " + e.toString() + (e.line ? " (line " + e.line + ")" : "")); }\napp.endUndoGroup();\n`);
  // Keep only the 30 newest generated scripts.
  try {
    const old = fs.readdirSync(AE_DIR).filter((f) => f.endsWith('.jsx')).map((f) => path.join(AE_DIR, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(30);
    for (const f of old) fs.rmSync(f, { force: true });
  } catch { /* housekeeping only */ }
  if (!IS_MAC) {
    spawn(st.afterfx, ['-r', file], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return Promise.resolve({ file, ok: true });
  }
  // AppleScript strings: escape backslashes and quotes. `tell application` launches AE when it isn't open.
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "${esc(st.appName)}"\n  activate\n  DoScriptFile "${esc(file)}"\nend tell`;
  return new Promise((resolve) => {
    let done = false;
    const child = execFile('osascript', ['-e', script], { timeout: 10 * 60 * 1000 }, (err, _out, stderr) => {
      if (done) return;
      done = true;
      resolve(err ? { file, ok: false, error: macError(stderr || err.message) } : { file, ok: true });
    });
    // A long script (or AE's splash screen) keeps osascript waiting: report "sent" after 8 s.
    setTimeout(() => { if (!done) { done = true; resolve({ file, ok: true, pending: true }); } }, 8000);
    child.on('error', (err) => { if (!done) { done = true; resolve({ file, ok: false, error: err.message }); } });
  });
}

function installScript(name, code, override) {
  const st = status(override);
  if (!st.userScripts) throw new Error(st.found ? 'Couldn\'t find After Effects\' user Scripts folder (open AE once so it creates its preferences).' : st.reason);
  fs.mkdirSync(st.userScripts, { recursive: true });
  const file = path.join(st.userScripts, `${name.replace(/[^\w\- ]+/g, '_')}.jsx`);
  fs.writeFileSync(file, code);
  return { file };
}

function findProjects(dirs, depth = 6) {
  const out = [];
  const walk = (d, level) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (level < depth && !/^(node_modules|\.git|AppData|Library|Adobe After Effects Auto-Save)$/i.test(e.name) && !e.name.endsWith(' Logs') && !e.name.endsWith('.app')) walk(full, level + 1);
      } else if (/\.aep$/i.test(e.name)) {
        try { const s = fs.statSync(full); out.push({ name: e.name, path: full, size: s.size, mtime: s.mtimeMs }); } catch { /* skip */ }
      }
    }
  };
  for (const d of dirs) if (d && exists(d)) walk(d, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 300);
}

// ---------- aerender ----------
const renders = new Map(); // job id -> child
const tc = (s) => {
  const parts = s.split(/[:;]/).map(Number);
  return parts.length === 4 ? parts : null;
};
function render(job, emit, override) {
  const st = status(override);
  if (!st.found) throw new Error(st.reason);
  if (!st.aerender) throw new Error(`aerender was not found next to After Effects (${st.dir}).`);
  if (!job.project || !exists(job.project)) throw new Error(`Project not found: ${job.project}`);
  const args = ['-project', job.project];
  if (job.comp) args.push('-comp', job.comp);
  if (job.rqindex) args.push('-rqindex', String(job.rqindex));
  if (job.omTemplate) args.push('-OMtemplate', job.omTemplate);
  if (job.rsTemplate) args.push('-RStemplate', job.rsTemplate);
  if (job.output) { fs.mkdirSync(path.dirname(job.output), { recursive: true }); args.push('-output', job.output); }
  if (job.start !== '' && job.start != null) args.push('-s', String(job.start));
  if (job.end !== '' && job.end != null) args.push('-e', String(job.end));
  if (job.multiFrames) args.push('-mfr', 'ON', '100');
  args.push('-v', 'ERRORS_AND_PROGRESS');
  const child = spawn(st.aerender, args, { windowsHide: true });
  renders.set(job.id, child);
  const started = Date.now();
  let fps = 0;
  let durationFrames = 0;
  let buffer = '';
  let errorLine = null; // aerender can exit with code 0 after an error, so watch the log too
  const onLine = (line) => {
    emit({ id: job.id, type: 'log', line });
    if (!errorLine && /aerender error|after effects error/i.test(line)) errorLine = line.replace(/^.*?error:\s*/i, '');
    const rate = line.match(/Frame Rate:\s*([\d.]+)/);
    if (rate) fps = Number(rate[1]);
    const dur = line.match(/Duration:\s*([\d:;]+)/);
    if (dur && tc(dur[1])) { const [h, m, s, f] = tc(dur[1]); durationFrames = Math.round((h * 3600 + m * 60 + s) * (fps || 30) + f); }
    const frame = line.match(/PROGRESS:\s+[\d:;]+\s+\((\d+)\)/);
    if (frame && durationFrames) {
      const done = Number(frame[1]);
      const pct = Math.min(1, done / durationFrames);
      const elapsed = (Date.now() - started) / 1000;
      emit({ id: job.id, type: 'progress', pct, frame: done, total: durationFrames, eta: pct > 0.01 ? Math.round(elapsed / pct - elapsed) : null });
    }
  };
  const feed = (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.search(/\r?\n/)) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1).replace(/^\n/, '');
      if (line) onLine(line);
    }
  };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  child.on('close', (code) => {
    renders.delete(job.id);
    emit({ id: job.id, type: 'done', code: code === 0 && errorLine ? 1 : code, error: errorLine, cancelled: code === null, seconds: Math.round((Date.now() - started) / 1000), output: job.output || null });
  });
  child.on('error', (err) => emit({ id: job.id, type: 'done', code: -1, error: err.message }));
  return { started: true };
}

// ---------- ffmpeg / ffprobe (optional) ----------
// GUI apps on a Mac don't get the shell's PATH, so Homebrew's folders are checked by hand.
const toolCache = {};
function findTool(name, override) {
  if (override && exists(override)) return override;
  if (toolCache[name] !== undefined) return toolCache[name];
  const exe = IS_WIN ? `${name}.exe` : name;
  const dirs = [
    ...(process.env.PATH || '').split(path.delimiter),
    ...(IS_MAC ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', path.join(os.homedir(), 'bin')] : []),
    ...(IS_WIN ? ['C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin', 'C:\\ProgramData\\chocolatey\\bin', path.join(os.homedir(), 'scoop', 'shims'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links')] : ['/usr/bin', '/usr/local/bin']),
  ].filter(Boolean);
  toolCache[name] = dirs.map((d) => path.join(d, exe)).find(exists) || null;
  return toolCache[name];
}
function ffStatus(overrides = {}) {
  const ffmpeg = findTool('ffmpeg', overrides.ffmpeg);
  const ffprobe = findTool('ffprobe', overrides.ffprobe || (ffmpeg && path.join(path.dirname(ffmpeg), IS_WIN ? 'ffprobe.exe' : 'ffprobe')));
  return { ffmpeg, ffprobe, hint: ffmpeg ? null : IS_MAC ? 'Install ffmpeg with Homebrew: brew install ffmpeg' : IS_WIN ? 'Install ffmpeg: winget install Gyan.FFmpeg' : 'Install ffmpeg with your package manager' };
}
// Exact stream facts (frame rate, codec, frames) that the browser's <video> doesn't expose.
function probe(file, overrides) {
  const { ffprobe } = ffStatus(overrides);
  if (!ffprobe) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 15000, windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => {
      if (err) { resolve(null); return; }
      try {
        const j = JSON.parse(out);
        const v = j.streams.find((s) => s.codec_type === 'video');
        const a = j.streams.find((s) => s.codec_type === 'audio');
        const rate = (r) => { const [n, d] = String(r || '0/1').split('/').map(Number); return d ? n / d : 0; };
        resolve({
          fps: v ? Math.round(rate(v.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate) * 1000) / 1000 : 0,
          w: v?.width, h: v?.height, codec: v?.codec_name, profile: v?.profile, pixFmt: v?.pix_fmt, frames: Number(v?.nb_frames) || null,
          bitrate: Number(j.format?.bit_rate) || null, duration: Number(j.format?.duration) || null,
          audio: a ? { codec: a.codec_name, rate: Number(a.sample_rate), channels: a.channels } : null,
          rotation: Number(v?.tags?.rotate || v?.side_data_list?.find((x) => x.rotation != null)?.rotation || 0),
        });
      } catch { resolve(null); }
    });
  });
}
// ffmpeg job with progress (-progress pipe:1). args come from VideoData.ffmpegArgs with INPUT / OUTPUT placeholders.
const jobs = new Map();
function transcode(job, emit, overrides) {
  const { ffmpeg } = ffStatus(overrides);
  if (!ffmpeg) throw new Error(ffStatus().hint);
  // an edit with no footage at all (colors, titles, shapes) has no INPUT to check: its inputs are inside the args
  if ((job.args || []).includes('INPUT') && !exists(job.input)) throw new Error(`File not found: ${job.input}`);
  fs.mkdirSync(path.dirname(job.output), { recursive: true });
  const args = job.args.map((a) => (a === 'INPUT' ? job.input : a === 'OUTPUT' ? job.output : a));
  args.splice(args.length - 1, 0, '-progress', 'pipe:1', '-nostats');
  const child = spawn(ffmpeg, args, { windowsHide: true });
  jobs.set(job.id, child);
  const started = Date.now();
  let err = '';
  child.stdout.on('data', (d) => {
    const m = String(d).match(/out_time_(?:us|ms)=(\d+)/g);
    if (m && job.duration) {
      const us = Number(m[m.length - 1].split('=')[1]);
      const pct = Math.min(1, us / 1e6 / job.duration);
      emit({ id: job.id, type: 'progress', pct });
    }
  });
  child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  child.on('close', (code) => {
    jobs.delete(job.id);
    emit({ id: job.id, type: 'done', code, output: job.output, cancelled: code === null, seconds: Math.round((Date.now() - started) / 1000), error: code ? err.trim().split('\n').slice(-3).join('\n') : null });
  });
  child.on('error', (e) => emit({ id: job.id, type: 'done', code: -1, error: e.message }));
  return { started: true, output: job.output };
}

function registerIpc(ipcMain, getWin, getOverride) {
  const send = (ev) => getWin()?.webContents.send('ae:render-event', ev);
  const sendJob = (ev) => getWin()?.webContents.send('video:job-event', ev);
  ipcMain.handle('ae:status', () => status(getOverride()));
  ipcMain.handle('ae:running', () => running());
  ipcMain.handle('ae:templates', () => templates());
  ipcMain.handle('ae:run', (_e, code, label) => runScript(code, label, getOverride()));
  ipcMain.handle('ae:install', (_e, name, code) => installScript(name, code, getOverride()));
  ipcMain.handle('ae:projects', (_e, dirs) => findProjects(dirs));
  ipcMain.handle('ae:render', (_e, job) => render(job, send, getOverride()));
  ipcMain.handle('ae:cancel', (_e, id) => { renders.get(id)?.kill(); return true; });
  ipcMain.handle('video:tools', (_e, overrides) => ffStatus(overrides));
  ipcMain.handle('video:probe', (_e, file, overrides) => probe(file, overrides));
  ipcMain.handle('video:transcode', (_e, job, overrides) => transcode(job, sendJob, overrides));
  ipcMain.handle('video:cancel', (_e, id) => { jobs.get(id)?.kill(); return true; });
  // the editor's temporary title frames (a folder it made itself, named .hearth-titles-…) go away after a render
  ipcMain.handle('video:rmtemp', (_e, dir) => {
    if (typeof dir !== 'string' || !path.isAbsolute(dir) || !/^\.hearth-titles-[a-z0-9]+$/.test(path.basename(dir))) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  });
}

module.exports = { registerIpc, templates, status, running, ffStatus, probe, _test: { locate, macError, findTool } };
