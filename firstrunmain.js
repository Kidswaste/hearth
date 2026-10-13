// Check this computer (round 28, firstrun), main side: the few facts the checklist can't get from the parts that
// already check themselves (engines.js / installs.js for Claude Code and Codex, aemain for ffmpeg, syncmain, updatermain).
//   firstrun:facts ({ bins })  the platform, the exact commands a button would run (shown BEFORE the click: ffmpeg,
//                              sign-in for the copy in use, Git on a Mac, long paths on Windows), the Mac privacy
//                              permissions (screen recording, camera, microphone), Windows' long-path switch
//   firstrun:folders           the folders chats reach (each chat's file access, agents' project folders), each one
//                              resolved like a chat would (reachmain: the other computer's paths → this one's)
//   firstrun:perm (which, how) Mac: ask for camera / microphone (the system's own prompt), or open the right pane of
//                              System Settings › Privacy & Security; nothing else is ever opened from here
//   firstrun:run (id)          one of two documented commands, in a visible Terminal / PowerShell window, only after
//                              the owner's click (installs.runInTerminal: tests only echo it)
// Loaded on first use (main.js lazyIpc). Nothing here installs anything by itself.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const PANES = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
};
const LONG_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem';
// the documented commands (ids only cross IPC: the window can't make Hearth run anything else)
const COMMANDS = {
  git: { mac: true, title: 'Install Git (Apple\'s command line tools) for Hearth updates', lines: ['xcode-select --install'] },
  longpaths: { win: true, title: 'Allow long file paths on Windows (asks for administrator)', lines: [`Start-Process reg.exe -Verb RunAs -Wait -ArgumentList 'add ${LONG_KEY} /v LongPathsEnabled /t REG_DWORD /d 1 /f'`] },
};
let opts = { readConfig: () => ({}), dataDir: path.join(__dirname, 'data') };

function perms() {
  if (!IS_MAC) return null;
  try {
    const { systemPreferences } = require('electron');
    return Object.fromEntries(['screen', 'camera', 'microphone'].map((k) => [k, systemPreferences.getMediaAccessStatus(k)]));
  } catch { return null; }
}
function longPaths() {
  if (!IS_WIN) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('reg', ['query', LONG_KEY, '/v', 'LongPathsEnabled'], { timeout: 5000, windowsHide: true }, (err, out) => {
      if (err) { resolve(null); return; }
      const m = /LongPathsEnabled\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(out));
      resolve(m ? parseInt(m[1], 16) === 1 : null);
    });
  });
}
const isFile = (p) => { try { return typeof p === 'string' && path.isAbsolute(p) && fs.statSync(p).isFile(); } catch { return false; } };

async function facts({ bins = {} } = {}) {
  const I = require('./installs');
  const login = {};
  for (const e of ['claude', 'codex']) if (isFile(bins[e])) login[e] = I.loginPlan(e, bins[e]);
  const cmd = (id) => (COMMANDS[id] && ((COMMANDS[id].mac && IS_MAC) || (COMMANDS[id].win && IS_WIN)) ? COMMANDS[id].lines.join('\n') : null);
  return {
    platform: process.platform, arch: process.arch, test: Boolean(process.env.HEARTH_TEST_SAVE_DIR),
    appDir: __dirname, dataDir: opts.dataDir, home: os.homedir(),
    commands: { ffmpeg: I.ffmpegLines().join('\n'), git: cmd('git'), longpaths: cmd('longpaths') },
    login, perms: perms(), longPaths: await longPaths(),
  };
}

// the folders chats reach: every chat's own file access (the newest 400 chats) and the agents' project folders
async function folders() {
  const seen = new Map(); // path → { path, from: Set }
  const add = (p, from) => {
    if (typeof p !== 'string' || !p.trim()) return;
    const k = p.trim();
    if (!seen.has(k)) seen.set(k, { path: k, from: new Set() });
    seen.get(k).from.add(from);
  };
  let cfg = {};
  try { cfg = opts.readConfig() || {}; } catch { /* none */ }
  for (const a of cfg.agents || []) if (a.workspace) add(a.workspace, a.name || a.id);
  const dir = path.join(opts.dataDir, 'chats');
  let files = [];
  try {
    files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.json'));
    const st = await Promise.all(files.map((f) => fs.promises.stat(path.join(dir, f)).then((s) => s.mtimeMs, () => 0)));
    files = files.map((f, i) => [f, st[i]]).sort((a, b) => b[1] - a[1]).slice(0, 400).map(([f]) => f);
  } catch { files = []; }
  for (const f of files) {
    let text;
    try { text = await fs.promises.readFile(path.join(dir, f), 'utf8'); } catch { continue; }
    if (!text.includes('"access"')) continue; // most chats never had folders: no parse
    try {
      const c = JSON.parse(text);
      for (const p of c.access?.folders || []) add(p, c.title || 'a chat');
    } catch { /* a half-written file */ }
  }
  const R = require('./reachmain');
  return [...seen.values()].slice(0, 60).map(({ path: p, from }) => {
    const r = R.resolveOne(p);
    const state = r.exists ? (r.foreign ? 'mapped' : 'here') : r.waiting ? 'waiting' : 'missing';
    return { path: p, here: r.exists ? r.path : null, state, isDir: r.isDir, from: [...from].slice(0, 4), waitingFrom: r.waiting?.from || null };
  });
}

async function perm(which, how) {
  if (!IS_MAC || !PANES[which]) return { ok: false, status: null };
  const { systemPreferences, shell, desktopCapturer } = require('electron');
  const now = () => systemPreferences.getMediaAccessStatus(which);
  if (how === 'ask' && now() !== 'granted') {
    try {
      // camera / microphone: the system asks once ("not determined"); screen recording can't be asked for, but a
      // first look at the screens puts Hearth in the list (and macOS shows its own prompt)
      if (which === 'screen') await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      else if (now() === 'not-determined') await systemPreferences.askForMediaAccess(which);
    } catch { /* the pane below */ }
  }
  if (how === 'open' || now() !== 'granted') await shell.openExternal(PANES[which]).catch(() => {});
  return { ok: true, status: now(), opened: how === 'open' || now() !== 'granted' };
}

function run(id) {
  const c = COMMANDS[id];
  if (!c || !((c.mac && IS_MAC) || (c.win && IS_WIN) || process.env.HEARTH_TEST_SAVE_DIR)) return { ok: false, error: 'Not on this computer' };
  const I = require('./installs');
  const marker = path.join(os.tmpdir(), `hearth-firstrun-${id}-${Date.now()}.done`);
  return { ...I.runInTerminal({ title: c.title, lines: c.lines, marker }), marker, command: c.lines.join('\n') };
}

function register(ipcMain, _getWin, o = {}) {
  opts = { ...opts, ...o };
  ipcMain.handle('firstrun:facts', (_e, a) => facts(a || {}));
  ipcMain.handle('firstrun:folders', () => folders());
  ipcMain.handle('firstrun:perm', (_e, which, how) => perm(String(which), String(how || 'ask')));
  ipcMain.handle('firstrun:run', (_e, id) => run(String(id)));
}

module.exports = { register, facts, folders, PANES, COMMANDS };
