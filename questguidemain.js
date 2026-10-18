// A local, read-only quest companion. No screen capture, keystrokes, audio recording or AI polling.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const Core = require('./questguide-core');
const FLP = require('./questguide-flp');
const DS = require('./datasafe-core');
const CS = require('./crashsafe-core');

function discoverFL(saved, platform = process.platform) {
  if (saved && fs.existsSync(saved)) return saved;
  if (platform === 'darwin') return ['/Applications/FL Studio.app', '/Applications/FL Studio 2025.app'].find(p => fs.existsSync(p)) || null;
  if (platform !== 'win32') return null;
  const roots = [process.env.ProgramFiles || 'C:/Program Files', process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'];
  for (const root of roots) {
    const p = path.join(root, 'Image-Line');
    let dirs = []; try { dirs = fs.readdirSync(p).filter(x => /^FL Studio(?: \d+)?$/i.test(x)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); } catch { continue; }
    for (const d of dirs) for (const name of ['FL64.exe', 'FL.exe']) { const f = path.join(p, d, name); if (fs.existsSync(f)) return f; }
  }
  return null;
}
function runningFL(platform = process.platform) {
  return new Promise(resolve => {
    const cmd = platform === 'win32' ? 'tasklist.exe' : 'ps';
    const args = platform === 'win32' ? ['/FO', 'CSV', '/NH'] : ['-A', '-o', 'comm='];
    execFile(cmd, args, { windowsHide: true, timeout: 4000, maxBuffer: 2 * 1024 * 1024 }, (err, out) => resolve(err ? null : platform === 'win32' ? /^"FL(?:64)?\.exe",/mi.test(out) : /\/FL Studio(?:\.app\/.*)?$/mi.test(out)));
  });
}
function create({ dataDir, localDir = dataDir, documentsDir, now = () => Date.now(), emit = () => {}, pollRunning = runningFL, ui = {}, platform = process.platform }) {
  const file = path.join(dataDir, 'quest-guide', 'session.json');
  const prefsFile = path.join(localDir, 'hearth-quest-guide-local.json');
  const telemetryFile = path.join(localDir, 'hearth-quest-guide-telemetry.json');
  const read = DS.load(fs, file, { session: null, history: [] });
  const prefRead = DS.load(fs, prefsFile, {});
  let store = { session: Core.valid(read.value?.session), history: Array.isArray(read.value?.history) ? read.value.history.slice(-15) : [] };
  let prefs = prefRead.value || {}, flPath = discoverFL(prefs.flPath, platform);
  let observation = { running: null, telemetry: null, project: null }, busy = false, timer = null, visible = false, lastLease = 0;
  let projectStamp = '', projectError = '';
  let nonce = crypto.randomBytes(20).toString('hex'), disposed = false, lastFingerprint = '';
  function save() {
    if (!read.canSave) throw new Error('Your saved guide cannot be read safely. Try again after restarting Hearth.');
    fs.mkdirSync(path.dirname(file), { recursive: true }); CS.writeAtomicSync(fs, file, JSON.stringify(store));
  }
  function savePrefs() {
    if (!prefRead.canSave) throw new Error('The companion connection settings cannot be read safely.');
    fs.mkdirSync(path.dirname(prefsFile), { recursive: true }); CS.writeAtomicSync(fs, prefsFile, JSON.stringify(prefs));
  }
  const hardwareDir = () => path.join(prefs.flFolder || path.join(documentsDir || path.join(require('os').homedir(), 'Documents'), 'Image-Line', 'FL Studio'), 'Settings', 'Hardware', 'HearthQuestGuide');
  const installed = () => fs.existsSync(path.join(hardwareDir(), 'device_HearthQuest.py'));
  function lease(active) {
    if (!installed()) return;
    const config = { active, expiresAt: active ? now() + 12000 : 0, telemetryFile, nonce };
    fs.mkdirSync(localDir, { recursive: true });
    CS.writeAtomicSync(fs, path.join(hardwareDir(), 'hearth-config.json'), JSON.stringify(config));
    lastLease = now();
  }
  function state() {
    const s = store.session, step = Core.current(s), connected = Core.fresh(observation.telemetry, now());
    return { session: s, step, index: Core.index(s), completed: s?.done.length || 0, total: s?.steps.length || 0, visible,
      telemetry: connected ? observation.telemetry : null,
      project: { path: prefs.projectQuestId === s?.questId ? prefs.flProject || null : null, error: projectError, savedAt: observation.project?.savedAt || null, bpm: observation.project?.bpm || null },
      fl: { path: flPath, running: observation.running, connected, installed: installed(), folder: hardwareDir(), setupNeeded: !connected,
        status: connected ? 'Connected · reading FL Studio' : installed() ? 'Waiting for FL Studio · enable Hearth Quest Guide in MIDI settings' : 'Connect FL Studio for tempo and bass auto-checks' } };
  }
  function publish(force = false) {
    const value = state();
    const fingerprint = JSON.stringify([value.session, value.visible, value.fl, value.project, value.telemetry && { bpm: value.telemetry.bpm, playing: value.telemetry.playing, channels: value.telemetry.channels }]);
    if (force || fingerprint !== lastFingerprint) { lastFingerprint = fingerprint; emit('questguide:changed', value); }
    return value;
  }
  function active() { return !!store.session && !store.session.paused && !!Core.current(store.session); }
  async function poll() {
    if (busy || disposed || !active()) return;
    busy = true;
    const observedSession = store.session;
    try {
      if (now() - lastLease > 4000) lease(true);
      observation.running = await pollRunning(platform);
      if (store.session !== observedSession || disposed) return;
      if (prefs.flProject && prefs.projectQuestId === store.session?.questId) {
        try {
          const watchedFile = prefs.flProject;
          const st = await fs.promises.stat(watchedFile), stamp = `${st.size}:${st.mtimeMs}`;
          if (st.size > FLP.MAX_BYTES) throw new Error('This project is larger than the 64 MB observation limit. Use the live connection instead.');
          if (stamp !== projectStamp) {
            const parsed = FLP.parse(await fs.promises.readFile(watchedFile));
            if (store.session !== observedSession || prefs.flProject !== watchedFile || disposed) return;
            observation.project = { ...parsed, savedAt: st.mtimeMs, checkedAt: now() }; projectStamp = stamp; projectError = '';
          } else if (observation.project) observation.project.checkedAt = now();
        } catch (err) { observation.project = null; projectError = err.code === 'ENOENT' ? 'The selected project moved. Choose its new file.' : err.message; }
      } else observation.project = null;
      if (store.session !== observedSession || disposed) return;
      try {
        const stat = fs.statSync(telemetryFile);
        if (stat.size > 65536) throw new Error('oversize telemetry');
        const t = JSON.parse(fs.readFileSync(telemetryFile, 'utf8'));
        if (t.version === 1 && t.nonce === nonce && Core.fresh(t, now()) && Number.isFinite(t.bpm) && t.bpm > 0 && t.bpm < 1000 && Array.isArray(t.channels) && t.channels.length <= 128) {
          observation.telemetry = { at: t.at, bpm: t.bpm, playing: t.playing === true, channels: t.channels.map(c => ({ name: String(c.name || '').slice(0, 100), notes: Math.max(0, Math.min(64, Number(c.notes) || 0)), activity: Math.max(0, Math.min(1, Number(c.activity) || 0)) })) };
        }
      } catch { /* disconnected or midway through a replace: stale data never advances a step */ }
      const next = Core.observe(store.session, observation, now());
      if (next !== store.session) { store.session = next; save(); if (!active()) { lease(false); if (timer) clearInterval(timer); timer = null; } }
      publish();
    } finally { busy = false; }
  }
  function arm() {
    if (timer) clearInterval(timer); timer = null;
    if (active()) { timer = setInterval(() => poll().catch(e => emit('questguide:error', { error: e.message })), 1600); timer.unref?.(); poll().catch(e => emit('questguide:error', { error: e.message })); }
    else lease(false);
  }
  async function call(a = {}) {
    const op = a.op || 'state';
    if (op === 'state') return state();
    if (op === 'start') {
      if (!a.restart && store.session?.questId === a.questId && Core.current(store.session)) { store.session.paused = false; }
      else {
        if (store.session) store.history = [...store.history, store.session].slice(-15);
        store.session = Core.start(a, now());
      }
      // Explicit imported outing progress only. Never presented as observed app activity.
      // A resumed outing can have moved ahead in its plan while the helper was hidden.
      const imported = Array.isArray(a.completedIds) && store.session.questId.startsWith('outing:') ? a.completedIds.slice(0, 30) : [];
      for (let i = 0; i < imported.length; i++) {
        if (store.session.steps[i]?.id !== imported[i]) break;
        if (i >= store.session.done.length) store.session = Core.complete(store.session, { kind: 'manual', summary: 'Already completed in your outing plan', source: 'outing-plan' }, now());
      }
      save(); visible = true; await ui.show?.(); arm();
    } else if (op === 'show') { visible = true; await ui.show?.(); }
    else if (op === 'hide') { visible = false; ui.hide?.(); }
    else if (op === 'pause' || op === 'resume') { if (store.session) { store.session.paused = op === 'pause'; store.session.updatedAt = now(); save(); arm(); } }
    else if (op === 'stop') { if (store.session) store.history = [...store.history, store.session].slice(-15); store.session = null; save(); arm(); visible = false; ui.hide?.(); }
    else if (op === 'manual') { store.session = Core.manual(store.session, a.stepId, a.note, now()); save(); arm(); }
    else if (op === 'back') {
      if (store.session?.done.length) { store.session.done.pop(); store.session.enteredAt = now() + 1; store.session.updatedAt = now(); store.session.paused = true; save(); arm(); }
    } else if (op === 'tool-opened') {
      const s = Core.current(store.session);
      if (store.session?.paused || s?.id !== a.stepId || s.check !== 'tool' || s.action?.tool !== a.tool) throw new Error('That workbench does not match the current step.');
      store.session = Core.complete(store.session, { kind: 'automatic', summary: `Opened ${a.tool} in Hearth`, source: 'hearth-tool' }, now()); save(); arm();
    } else if (op === 'action') {
      const s = Core.current(store.session);
      if (s?.id !== a.stepId) throw new Error('The step changed.');
      if (s.action?.type === 'hearth-tool') emit('questguide:tool', { questId: store.session.questId, stepId: s.id, tool: s.action.tool });
      if (s.action?.type === 'outing') emit('questguide:outing', { questId: store.session.questId, stepId: s.id, planId: s.action.planId });
    } else if (op === 'review') {
      if (store.session) {
        ui.focusMain?.();
        if (store.session.questId.startsWith('outing:') && !store.session.reviewQuestId) emit('questguide:outing', { planId: store.session.questId.slice(7), questId: store.session.questId });
        else emit('questguide:review', { questId: store.session.reviewQuestId || store.session.questId });
      }
    } else if (op === 'launch') {
      flPath = discoverFL(prefs.flPath, platform); if (!flPath) throw new Error('Choose your FL Studio application first.');
      if (platform === 'darwin') { await new Promise((resolve, reject) => execFile('open', ['-a', flPath], err => err ? reject(err) : resolve())); }
      else { await new Promise((resolve, reject) => { const p = spawn(flPath, [], { detached: true, stdio: 'ignore', windowsHide: false }); p.once('error', reject); p.once('spawn', () => { p.unref(); resolve(); }); }); }
    } else if (op === 'choose-fl') {
      const p = await ui.chooseFL?.(); if (p) { if (platform === 'win32' && !/^FL(?:64)?\.exe$/i.test(path.basename(p))) throw new Error('Choose FL64.exe or FL.exe from your FL Studio folder.'); prefs.flPath = p; flPath = p; savePrefs(); }
    } else if (op === 'choose-fl-folder') {
      const p = await ui.chooseFolder?.(); if (p) { lease(false); prefs.flFolder = p; savePrefs(); }
    } else if (op === 'choose-project') {
      if (!store.session) throw new Error('Start a quest before connecting its FL project.');
      const sessionId = store.session.id;
      const p = await ui.chooseProject?.();
      if (p) {
        if (path.extname(p).toLowerCase() !== '.flp') throw new Error('Choose a saved .flp project.');
        const st = await fs.promises.stat(p); if (st.size > FLP.MAX_BYTES) throw new Error('This project exceeds the 64 MB observation limit.');
        FLP.parse(await fs.promises.readFile(p));
        if (store.session?.id !== sessionId) throw new Error('The guided quest changed while choosing a project. Choose the file again for this quest.');
        prefs.flProject = p; prefs.projectQuestId = store.session.questId; projectStamp = ''; projectError = ''; observation.project = null; savePrefs(); await poll();
      }
    } else if (op === 'forget-project') { prefs.flProject = null; prefs.projectQuestId = null; projectStamp = ''; projectError = ''; observation.project = null; savePrefs();
    } else if (op === 'setup-fl') {
      const dest = hardwareDir(); fs.mkdirSync(dest, { recursive: true });
      const target = path.join(dest, 'device_HearthQuest.py');
      if (fs.existsSync(target)) {
        const old = fs.readFileSync(target, 'utf8');
        if (!old.includes('# name=Hearth Quest Guide')) throw new Error('This script folder already contains another script. Choose another FL Studio user-data folder.');
        fs.copyFileSync(target, `${target}.previous`);
      }
      fs.copyFileSync(path.join(__dirname, 'integrations', 'fl-studio', 'device_HearthQuest.py'), target); lease(active());
    } else if (op === 'open-fl-folder') { await ui.openFolder?.(hardwareDir()); }
    else throw new Error('Unknown guide action.');
    return publish(true);
  }
  function dispose() { disposed = true; if (timer) clearInterval(timer); timer = null; try { lease(false); } catch { /* closing */ } }
  arm();
  return { call, state, poll, dispose, setVisible(value) { visible = value; publish(); }, telemetryFile, hardwareDir, _nonce: () => nonce };
}

function register(ipcMain, { dataDir, getWin, onChanged }) {
  const { app, BrowserWindow, screen, dialog, shell } = require('electron');
  let companion = null, api = null;
  const main = () => { const w = getWin?.(); return w && !w.isDestroyed() ? w : null; };
  let lastSession = '';
  const emit = (channel, value) => {
    if (channel === 'questguide:changed') {
      const fingerprint = JSON.stringify(value.session);
      if (fingerprint !== lastSession) { lastSession = fingerprint; try { Promise.resolve(onChanged?.(value)).catch(err => console.warn('[questguide] progress sync:', err.message)); } catch (err) { console.warn('[questguide] progress sync:', err.message); } }
    }
    for (const w of [main(), companion]) if (w && !w.isDestroyed()) w.webContents.send(channel, value);
  };
  const show = async () => {
    if (companion && !companion.isDestroyed()) { companion.showInactive(); return; }
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    companion = new BrowserWindow({ width: 360, height: 410, minWidth: 320, minHeight: 260, maxWidth: 620, x: area.x + area.width - 380, y: area.y + 70,
      title: 'Quest Guide · Hearth', frame: false, alwaysOnTop: true, show: false, resizable: true, autoHideMenuBar: true, backgroundColor: '#151416',
      webPreferences: { preload: path.join(__dirname, 'questguide-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    companion.setAlwaysOnTop(true, 'floating');
    companion.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    companion.webContents.on('will-navigate', e => e.preventDefault());
    companion.on('close', e => { if (!app.isQuitting) { e.preventDefault(); companion.hide(); api?.setVisible(false); } });
    await companion.loadFile(path.join(__dirname, 'questguide-window.html'));
    companion.showInactive();
  };
  const owner = () => companion && !companion.isDestroyed() && companion.isVisible() ? companion : main();
  api = create({ dataDir, localDir: process.env.HEARTH_TEST_SAVE_DIR || app.getPath('userData'), documentsDir: app.getPath('documents'), emit,
    ui: { show, hide: () => companion?.hide(), focusMain: () => { const w = main(); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } },
      chooseFL: async () => { const r = await dialog.showOpenDialog(owner(), { title: 'Choose FL Studio', properties: ['openFile'], filters: [{ name: 'FL Studio', extensions: process.platform === 'win32' ? ['exe'] : ['app'] }] }); return r.canceled ? null : r.filePaths[0]; },
      chooseFolder: async () => { const r = await dialog.showOpenDialog(owner(), { title: 'Choose the FL Studio user data folder (contains Settings)', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
      chooseProject: async () => { const r = await dialog.showOpenDialog(owner(), { title: 'Choose this quest’s saved FL Studio project', properties: ['openFile'], filters: [{ name: 'FL Studio project', extensions: ['flp'] }] }); return r.canceled ? null : r.filePaths[0]; },
      openFolder: p => shell.openPath(p),
    } });
  ipcMain.handle('questguide:call', async (e, a) => {
    if (e.sender !== main()?.webContents && e.sender !== companion?.webContents) return { ok: false, error: 'This guide belongs to Hearth.' };
    if (a?.op === 'tool-opened' && e.sender !== main()?.webContents) return { ok: false, error: 'Only Hearth can verify a workbench opened.' };
    try { return { ok: true, value: await api.call(a) }; } catch (err) { return { ok: false, error: err.message }; }
  });
  app.once('before-quit', () => { app.isQuitting = true; api.dispose(); companion?.destroy(); companion = null; });
  return api;
}
module.exports = { create, register, discoverFL, runningFL };
