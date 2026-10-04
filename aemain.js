// After Effects bridge: finds AE, runs ExtendScript in it, installs scripts into its Scripts menu,
// reads output-module templates and drives aerender with live progress.
const { spawn } = require('child_process');
const fs = require('fs');
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

function locate(override) {
  if (override && fs.existsSync(path.join(override, 'AfterFX.exe'))) return override;
  const base = 'C:\\Program Files\\Adobe';
  let dirs = [];
  try { dirs = fs.readdirSync(base).filter((d) => /^Adobe After Effects/i.test(d)); } catch { return null; }
  const pick = newest(dirs.filter((d) => fs.existsSync(path.join(base, d, 'Support Files', 'AfterFX.exe'))));
  return pick ? path.join(base, pick, 'Support Files') : null;
}

function prefsDir() {
  const root = path.join(process.env.APPDATA || '', 'Adobe', 'After Effects');
  try {
    const v = newest(fs.readdirSync(root).filter((d) => /^\d+(\.\d+)?$/.test(d)));
    return v ? path.join(root, v) : null;
  } catch { return null; }
}

function status(override) {
  const dir = locate(override);
  return {
    found: Boolean(dir),
    dir,
    afterfx: dir && path.join(dir, 'AfterFX.exe'),
    aerender: dir && fs.existsSync(path.join(dir, 'aerender.exe')) ? path.join(dir, 'aerender.exe') : null,
    userScripts: prefsDir() && path.join(prefsDir(), 'Scripts'),
  };
}

// Output-module template names from AE's own preferences (hidden internal ones skipped).
function templates() {
  const dir = prefsDir();
  if (!dir) return [];
  const file = fs.readdirSync(dir).find((f) => /Prefs-indep-output\.txt$/.test(f));
  if (!file) return [];
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const names = [...text.matchAll(/"Output Module Spec Strings Name \d+"\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(names.filter((n) => !n.startsWith('_HIDDEN')))];
}

// AfterFX.exe -r runs a script in the running AE (or starts AE first).
function runScript(code, label = 'script', override) {
  const st = status(override);
  if (!st.found) throw new Error('After Effects was not found on this PC.');
  const file = path.join(AE_DIR, `${label.replace(/[^\w-]+/g, '_')}-${Date.now()}.jsx`);
  // Wrap in an undo group so one Ctrl+Z in AE reverts the whole script.
  fs.writeFileSync(file, `app.beginUndoGroup(${JSON.stringify(`Agent Hub: ${label}`)});\ntry {\n${code}\n} catch (e) { alert("Agent Hub script error: " + e.toString() + (e.line ? " (line " + e.line + ")" : "")); }\napp.endUndoGroup();\n`);
  spawn(st.afterfx, ['-r', file], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  // Keep only the 30 newest generated scripts.
  const old = fs.readdirSync(AE_DIR).filter((f) => f.endsWith('.jsx')).map((f) => path.join(AE_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(30);
  for (const f of old) fs.rmSync(f, { force: true });
  return { file };
}

function installScript(name, code, override) {
  const st = status(override);
  if (!st.userScripts) throw new Error("Couldn't find After Effects' user Scripts folder.");
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
        if (level < depth && !/^(node_modules|\.git|AppData|Adobe After Effects Auto-Save)$/i.test(e.name) && !e.name.endsWith(' Logs')) walk(full, level + 1);
      } else if (/\.aep$/i.test(e.name)) {
        try { const s = fs.statSync(full); out.push({ name: e.name, path: full, size: s.size, mtime: s.mtimeMs }); } catch { /* skip */ }
      }
    }
  };
  for (const d of dirs) if (d && fs.existsSync(d)) walk(d, 0);
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
  if (!st.aerender) throw new Error('aerender was not found.');
  const args = ['-project', job.project];
  if (job.comp) args.push('-comp', job.comp);
  if (job.rqindex) args.push('-rqindex', String(job.rqindex));
  if (job.omTemplate) args.push('-OMtemplate', job.omTemplate);
  if (job.rsTemplate) args.push('-RStemplate', job.rsTemplate);
  if (job.output) args.push('-output', job.output);
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
    emit({ id: job.id, type: 'done', code: code === 0 && errorLine ? 1 : code, error: errorLine, cancelled: code === null, seconds: Math.round((Date.now() - started) / 1000) });
  });
  child.on('error', (err) => emit({ id: job.id, type: 'done', code: -1, error: err.message }));
  return { started: true };
}

function registerIpc(ipcMain, getWin, getOverride) {
  const send = (ev) => getWin()?.webContents.send('ae:render-event', ev);
  ipcMain.handle('ae:status', () => status(getOverride()));
  ipcMain.handle('ae:templates', () => templates());
  ipcMain.handle('ae:run', (_e, code, label) => runScript(code, label, getOverride()));
  ipcMain.handle('ae:install', (_e, name, code) => installScript(name, code, getOverride()));
  ipcMain.handle('ae:projects', (_e, dirs) => findProjects(dirs));
  ipcMain.handle('ae:render', (_e, job) => render(job, send, getOverride()));
  ipcMain.handle('ae:cancel', (_e, id) => { renders.get(id)?.kill(); return true; });
}

module.exports = { registerIpc, templates, status };
