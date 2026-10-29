// Agentic deployment (round 14), main side: finds the official CLIs (vercel, netlify, wrangler, gh + git), signs in
// through the CLI's own browser flow in a terminal window you can see (Hearth never sees a password or a token: the
// CLI keeps its own login), builds what gets published, previews it on 127.0.0.1, checks it renders in a hidden
// window, deploys, and removes / rolls back where the CLI can.
//   build: a Lab scene becomes a self-contained static page: index.html hosts lab.html (the Lab's own player,
//   tools/three-sandbox.html) with three.js copied next to it (./three/, from a local copy or fetched once and kept in
//   data/deploy/three@<version>), the scene's layers and its reference files (./assets/). A video becomes a player
//   page; a folder / project is published as it is.
// Electron is only required inside the functions that need it, so dev/deploy-test.js runs this file in plain Node.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const C = require('./deploy-core');

let DATA_DIR = null;
const dataDir = () => DATA_DIR || (DATA_DIR = require('./store').DATA_DIR);
const ROOT = () => path.join(dataDir(), 'deploy');
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p); } catch { return false; } };
const isMac = () => process.platform === 'darwin';
const isWin = () => process.platform === 'win32';
// (windows hourly 11) the GitHub Pages copy is a git repository: git makes its object files read-only, and on Windows
// a read-only file can't be deleted, so rmSync threw EPERM, the deploy that had just been pushed said it failed, and
// a hearth-ghpages-… folder stayed in Temp each time. Those files are made writable, then removed again.
function rmGitCopy(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch (err) { if (!isWin() || !['EPERM', 'EACCES'].includes(err.code)) throw err; }
  const writable = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) writable(p); else { try { fs.chmodSync(p, 0o666); } catch { /* gone */ } } } };
  writable(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- finding the CLIs ----------
// GUI apps on a Mac don't get the shell's PATH: npm / Homebrew / nvm / volta folders are searched by hand.
function extraDirs() {
  const home = os.homedir();
  const nvm = (() => { try { const d = path.join(home, '.nvm', 'versions', 'node'); return fs.readdirSync(d).sort().reverse().map((v) => path.join(d, v, 'bin')); } catch { return []; } })();
  if (isWin()) {
    return [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links'),
      'C:\\Program Files\\GitHub CLI', 'C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\nodejs', path.join(home, 'scoop', 'shims'), path.join(process.env.LOCALAPPDATA || '', 'pnpm'), path.join(home, '.volta', 'bin')];
  }
  return ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.npm-global', 'bin'), path.join(home, '.volta', 'bin'), path.join(home, '.bun', 'bin'),
    path.join(home, 'Library', 'pnpm'), path.join(home, '.local', 'bin'), path.join(home, 'bin'), ...nvm, '/usr/bin', '/bin'];
}
const pathDirs = () => [...(process.env.PATH || '').split(path.delimiter).map((d) => d.trim().replace(/^"(.*)"$/, '$1')), ...extraDirs()].filter(Boolean);
const cache = {};
function findCli(name, override) {
  if (override && exists(override)) return override;
  const c = cache[name];
  if (c && exists(c)) return c;
  const exts = isWin() ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const d of pathDirs()) for (const e of exts) { const p = path.join(d, name + e); if (exists(p) && !fs.statSync(p).isDirectory()) { cache[name] = p; return p; } }
  cache[name] = null;
  return null;
}
// the environment a CLI runs with: its own folder and node's on PATH (an npm CLI is a node script), no colors
function cliEnv(cli) {
  const dirs = [cli && path.dirname(cli), findCli('node') && path.dirname(findCli('node')), ...pathDirs()].filter(Boolean);
  const env = { ...process.env, PATH: [...new Set(dirs)].join(path.delimiter), NO_COLOR: '1', FORCE_COLOR: '0', NO_UPDATE_NOTIFIER: '1', NETLIFY_CLI_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false' };
  delete env.ELECTRON_RUN_AS_NODE; // Hearth's own Electron-as-Node flag isn't for them
  return env;
}
const quoteWin = (a) => (/^[\w\-./:=@\\]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
// run a CLI; .cmd shims on Windows go through cmd.exe. Never interactive: stdin is closed, so a prompt fails fast.
function runCli(cli, args, { cwd, emit, timeout = 15 * 60000, env } = {}) {
  return new Promise((resolve) => {
    let child;
    const opts = { cwd: cwd || os.tmpdir(), env: env || cliEnv(cli), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
    try {
      child = isWin() && /\.(cmd|bat)$/i.test(cli)
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[quoteWin(cli), ...args.map(quoteWin)].join(' ')}"`], { ...opts, windowsVerbatimArguments: true })
        : spawn(cli, args, opts);
    } catch (err) { resolve({ code: -1, out: '', err: err.message }); return; }
    let out = ''; let err = ''; let buf = '';
    const feed = (d, which) => {
      const s = String(d);
      if (which === 'out') out += s; else err += s;
      buf += s;
      let nl;
      while ((nl = buf.search(/\r?\n/)) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1).replace(/^\n/, ''); if (line) emit?.({ type: 'log', line: line.slice(0, 400) }); }
    };
    child.stdout.on('data', (d) => feed(d, 'out'));
    child.stderr.on('data', (d) => feed(d, 'err'));
    // (windows hourly 10) on Windows the whole tree (taskkill /T): kill() ended only cmd.exe, the CLI under it kept running
    // and holding the output pipes, so 'close' never came and a timed-out deploy waited forever
    const stop = () => {
      if (isWin() && child.pid) { try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => { try { child.kill(); } catch { /* gone */ } }); return; } catch { /* below */ } }
      try { child.kill(); } catch { /* gone */ }
    };
    const timer = setTimeout(() => { stop(); err += '\nTimed out.'; }, timeout);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: `${err}${e.message}` }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

// ---------- status / sign in ----------
async function providerStatus(id, { check = false, paths = {} } = {}) {
  const p = C.provider(id);
  const cli = findCli(p.cli, paths[p.id]);
  const out = { id: p.id, name: p.name, cli: p.cli, icon: p.icon, found: Boolean(cli), path: cli, install: C.installHint(p, process.platform), signedIn: null, account: null };
  if (p.needsGit) out.git = findCli('git', paths.git);
  if (!cli) { out.reason = `The ${p.name} CLI (${p.cli}) isn't installed. Install it in a terminal: ${out.install}${p.needsNode && !findCli('node') ? ' (it needs Node.js: https://nodejs.org)' : ''}`; return out; }
  if (check) {
    const r = await runCli(cli, p.whoami, { timeout: 20000 });
    const text = `${r.out}\n${r.err}`;
    out.signedIn = r.code === 0 && !p.signedOut.test(text);
    out.account = out.signedIn ? ((text.match(/(?:Logged in (?:to [^\s]+ )?(?:account|as)\s+|Email:\s*|associated with the email\s+)([^\s(]+)/i)?.[1] || text.split('\n').map((l) => l.trim()).find((l) => /^[\w.@-]+$/.test(l)) || '').replace(/[.,;]+$/, '') || null) : null;
  }
  return out;
}
async function status(opts = {}) {
  return { platform: process.platform, node: findCli('node'), git: findCli('git', opts.paths?.git), providers: await Promise.all(C.PROVIDERS.map((p) => providerStatus(p.id, opts))) };
}
// Sign in with the CLI's own flow, in a terminal window the owner sees (it opens the browser by itself)
function login(id, { paths = {} } = {}) {
  const p = C.provider(id);
  if (!p) throw new Error(`Unknown service ${id}`);
  const cli = findCli(p.cli, paths[p.id]);
  if (!cli) throw new Error(`Install the ${p.name} CLI first: ${C.installHint(p, process.platform)}`);
  const env = cliEnv(cli);
  if (isMac()) {
    const sh = `export PATH=${JSON.stringify(env.PATH)}; ${JSON.stringify(cli)} ${p.login.join(' ')}; echo; echo "Done: you can close this window and go back to Hearth."`;
    const script = `tell application "Terminal"\n  activate\n  do script ${JSON.stringify(sh)}\nend tell`;
    const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return { started: true, how: 'Terminal', command: `${p.cli} ${p.login.join(' ')}` };
  }
  if (isWin()) {
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', `"Sign in to ${p.name}"`, 'cmd', '/k', `"${quoteWin(cli)} ${p.login.join(' ')}"`], { detached: true, stdio: 'ignore', env, windowsVerbatimArguments: true });
    child.on('error', () => {});
    child.unref();
    return { started: true, how: 'Command Prompt', command: `${p.cli} ${p.login.join(' ')}` };
  }
  // elsewhere: a terminal emulator if there is one, else the CLI itself (it prints / opens the sign-in page)
  const term = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'].map((t) => findCli(t)).find(Boolean);
  const child = term ? spawn(term, ['-e', cli, ...p.login], { detached: true, stdio: 'ignore', env }) : spawn(cli, p.login, { detached: true, stdio: 'ignore', env });
  child.on('error', () => {});
  child.unref();
  return { started: true, how: term ? path.basename(term) : 'background', command: `${p.cli} ${p.login.join(' ')}` };
}

// ---------- three.js, copied next to the page ----------
// (round 79, winstart79) the answer kept a few minutes (each ▶ Play / publish asked again: a few synchronous opens)
const srcMemo = new Map();
function threeSources(version, opts = {}) {
  const dirs = [opts.threeDir, process.env.HEARTH_THREE_DIR, path.join(__dirname, 'node_modules', 'three'), path.join(ROOT(), `three@${version}`)].filter(Boolean);
  const k = `${version}|${dirs.join('|')}`; const m = srcMemo.get(k);
  if (m && Date.now() - m.at < 5 * 60e3) return m.dirs;
  const found = threeSourcesNow(version, dirs);
  if (found.length) srcMemo.set(k, { at: Date.now(), dirs: found }); // (none yet: asked again, the download makes one)
  return found;
}
function threeSourcesNow(version, dirs) {
  return dirs.filter((d) => {
    try { const v = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version; return !v || v === version; } catch { return exists(path.join(d, 'build')); }
  });
}
async function fetchThree(version, rel) {
  // fetched once from the same CDN the Lab uses, then kept in data/deploy/three@<version>
  const url = `https://cdn.jsdelivr.net/npm/three@${version}/${rel}`;
  let res;
  try { const { net } = require('electron'); res = await (net?.fetch ? net.fetch(url) : fetch(url)); } catch { res = await fetch(url).catch((e) => ({ ok: false, statusText: e.message })); }
  // (round 60, trimdrive60) one plain message, marked calm: the caller answers it as a result, not a main-process error
  if (!res?.ok) {
    const offline = !res?.status;
    const err = new Error(offline
      ? `Hearth needs three.js ${version} for this and downloads it once, but this computer seems to be offline and it isn't downloaded yet. Try again when you're online: after that it works offline too.`
      : `Couldn't download three.js ${version} (${rel}: ${res.status} ${res.statusText || ''}). Try again in a moment.`);
    err.calm = true; err.offline = offline;
    throw err;
  }
  const text = await res.text();
  const dest = path.join(ROOT(), `three@${version}`, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // kept for the next time, offline too: written whole (temp + rename), so a cut-short download is never reused
  const tmp = `${dest}.${process.pid}.part`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, dest);
  if (!exists(path.join(ROOT(), `three@${version}`, 'package.json'))) fs.writeFileSync(path.join(ROOT(), `three@${version}`, 'package.json'), JSON.stringify({ name: 'three', version }));
  return text;
}
async function vendorThree(version, codes, dest, opts = {}) {
  const srcs = threeSources(version, opts);
  // (round 79, winstart79) read and written asynchronously (three.js is 1.3 MB: the synchronous read + write held the
  // main thread ≈ 200 ms at a ▶ Play / publish, longer on Windows with Defender scanning the new file); a file already
  // there with the same size (▶ Play rebuilding a scene of the same three.js) isn't written again
  const read = async (rel) => {
    for (const d of srcs) { const f = path.join(d, rel); try { return await fs.promises.readFile(f, 'utf8'); } catch { /* the next source */ } }
    return fetchThree(version, rel);
  };
  const same = async (out, text) => { try { return (await fs.promises.stat(out)).size === Buffer.byteLength(text); } catch { return false; } };
  const want = ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js'];
  for (const code of codes) for (const s of C.importsOf(code)) { const r = C.threePath(s); if (r) want.push(r); }
  const done = new Set();
  const missing = [];
  while (want.length) {
    const rel = path.posix.normalize(want.shift());
    if (done.has(rel) || rel.startsWith('..')) continue;
    done.add(rel);
    let text;
    try { text = await read(rel); } catch (err) { if (rel === 'build/three.module.js') throw err; missing.push(rel); continue; }
    const out = path.join(dest, ...rel.split('/'));
    if (!(await same(out, text))) { await fs.promises.mkdir(path.dirname(out), { recursive: true }); await fs.promises.writeFile(out, text); }
    for (const s of C.importsOf(text)) {
      if (s.startsWith('.')) want.push(path.posix.join(path.posix.dirname(rel), s));
      else { const r = C.threePath(s); if (r) want.push(r); }
    }
  }
  return { files: [...done].filter((f) => !missing.includes(f)), missing };
}
// the Lab's player with three.js read from ./three/ instead of the CDN
function sandboxLibs() {
  const w = {};
  for (const f of ['sandbox-motion.js', 'sandbox-lab3d.js', 'three-materials-core.js']) new Function('window', fs.readFileSync(path.join(__dirname, 'tools', f), 'utf8'))(w); // eslint-disable-line no-new-func
  return Object.values(w.__sbxLibFn).map((fn) => `<script type="module">\nimport * as THREE from 'three';\n(${fn})();\n</script>\n`).join('');
}
function labPage() {
  const html = fs.readFileSync(path.join(__dirname, 'tools', 'three-sandbox.html'), 'utf8');
  const re = /const base = location\.protocol === 'file:' && \/Electron\\\/[^\n]+\n\s*\? `hearth-three:\/\/library\/\$\{V\}` : `https:\/\/cdn\.jsdelivr\.net\/npm\/three@\$\{V\}`;/;
  if (!re.test(html)) throw new Error('The Lab player changed (three.js import line not found): update deploymain.js labPage().');
  return html.replace(/<script data-hearth-playback>[\s\S]*?<\/script>/, '').replace(re, "const base = new URL('three', location.href).href; // published by Hearth: three.js next to this page")
    .replace('<!-- Runs untrusted sketch code: it may load three.js and addons from CDNs, nothing from the hub. -->', '<!-- The Lab\'s player, published by Hearth: three.js comes from ./three/ -->')
    // (round 25, diet) the motion kit and the 3D-model runtime live in their own files the Lab sends on demand; a
    // published page has no hub to ask, so they go back in as modules before the page's own
    .replace('<script type="module">', () => `${sandboxLibs()}<script type="module">`);
}

// ---------- builds ----------
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };
function dirSize(d) {
  let n = 0; let files = 0;
  const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else { files += 1; n += fs.statSync(f).size; } } };
  try { walk(d); } catch { /* unreadable */ }
  return { bytes: n, files };
}
function pruneBuilds(keep = 60) {
  const dir = path.join(ROOT(), 'builds');
  try {
    const old = fs.readdirSync(dir).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isDirectory()).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(keep);
    for (const f of old) fs.rmSync(f, { recursive: true, force: true });
  } catch { /* housekeeping */ }
}
// spec: { kind: scene|video|page|folder|project, name, … } (see deploy.js) → { dir, slug, kind, bytes, files, notes }
async function build(spec, opts = {}) {
  const kind = spec.kind || 'scene';
  const slug = C.slug(spec.slug || spec.name || path.basename(spec.path || '') || 'hearth');
  if (kind === 'folder' || kind === 'project') {
    if (!spec.path || !exists(spec.path) || !fs.statSync(spec.path).isDirectory()) throw new Error(`Folder not found: ${spec.path || '(none)'}`);
    const notes = [];
    const hasIndex = exists(path.join(spec.path, 'index.html'));
    const hasPkg = exists(path.join(spec.path, 'package.json'));
    if (kind === 'folder' && !hasIndex) notes.push(hasPkg ? 'No index.html here but a package.json: publish it as a project (Vercel / Netlify build it).' : 'No index.html in this folder: the address will show a 404.');
    return { dir: spec.path, slug, kind, ...dirSize(spec.path), notes, asIs: true };
  }
  // builds/<time>/<slug>/: the folder's own name is the site's name (Vercel names a new project after it)
  const dir = path.join(ROOT(), 'builds', `${stamp()}-${Math.random().toString(36).slice(2, 6)}`, slug);
  fs.mkdirSync(dir, { recursive: true });
  const notes = [];
  if (kind === 'page') fs.writeFileSync(path.join(dir, 'index.html'), String(spec.html || ''));
  else if (kind === 'video') {
    if (!spec.path || !exists(spec.path)) throw new Error(`Video not found: ${spec.path || '(none)'}`);
    const ext = path.extname(spec.path).toLowerCase() || '.mp4';
    if (!['.mp4', '.webm', '.m4v', '.mov'].includes(ext)) notes.push(`${ext} may not play in every browser: an MP4 (H.264) plays everywhere.`);
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.copyFileSync(spec.path, path.join(dir, 'media', `video${ext}`));
    let poster = null;
    if (spec.poster && exists(spec.poster)) { poster = `media/poster${path.extname(spec.poster)}`; fs.copyFileSync(spec.poster, path.join(dir, poster)); }
    fs.writeFileSync(path.join(dir, 'index.html'), C.videoPage({ title: spec.name || path.basename(spec.path), file: `media/video${ext}`, poster, w: spec.w, h: spec.h }));
  } else {
    const layers = (spec.layers || []).filter((L) => L && typeof L.code === 'string');
    if (!layers.length) throw new Error('This scene has no code to publish.');
    const version = String(spec.version || '0.186.1');
    const v = await vendorThree(version, layers.map((L) => L.code), path.join(dir, 'three'), opts);
    if (v.missing.length) notes.push(`Not found for three.js ${version}: ${v.missing.join(', ')}`);
    fs.writeFileSync(path.join(dir, 'lab.html'), labPage());
    const refs = [];
    for (const r of spec.refs || []) {
      if (!r.path || !exists(r.path)) { notes.push(`Reference "${r.key}" is missing (${r.path || 'no file'})`); continue; }
      const file = `assets/${String(r.key || path.basename(r.path)).replace(/[^\w.-]+/g, '_')}${path.extname(r.path)}`;
      fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
      fs.copyFileSync(r.path, path.join(dir, file));
      refs.push({ key: r.key, kind: r.kind, mime: MIME[path.extname(r.path).toLowerCase()] || '', file });
    }
    if (layers.some((L) => /\b(audio|media)\.\w/.test(L.code))) notes.push('The page plays without the Lab\'s song: music-driven parts stay calm (the timeline still runs).');
    fs.writeFileSync(path.join(dir, 'index.html'), C.hostPage({ title: spec.name || 'Hearth scene', version, layers, palette: spec.palette, refs, frame: spec.frame, description: spec.description }));
  }
  fs.writeFileSync(path.join(dir, 'hearth-build.json'), JSON.stringify({ kind, name: spec.name || slug, slug, at: Date.now(), version: spec.version || null }, null, 2));
  pruneBuilds();
  return { dir, slug, kind, ...dirSize(dir), notes };
}

// ---------- local preview (127.0.0.1 only) ----------
const servers = new Map(); // dir -> { server, url }
function preview(dir) {
  if (!dir || !exists(dir)) return Promise.reject(new Error(`Not found: ${dir}`));
  const have = servers.get(dir);
  if (have) return Promise.resolve({ url: have.url, dir });
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(String(req.url || '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}/`;
      servers.set(dir, { server, url });
      resolve({ url, dir });
    });
  });
}
function stopPreviews() { for (const { server } of servers.values()) try { server.close(); } catch { /* closed */ } servers.clear(); }
let previewWin = null;
function showPreview(url, title = 'Preview') {
  const { BrowserWindow } = require('electron');
  if (!previewWin || previewWin.isDestroyed()) {
    previewWin = new BrowserWindow({ width: 1100, height: 720, title: `Preview · ${title}`, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, partition: 'deploy-preview' } });
    previewWin.on('closed', () => { previewWin = null; });
  } else previewWin.setTitle(`Preview · ${title}`);
  previewWin.loadURL(url).catch(() => {});
  previewWin.show();
  return { shown: true, url };
}
// Loads the page in a hidden window and checks that it draws: { ok, ready, drawn, errors, nonBlank, colors, shot }
async function verify(url, { width = 960, height = 540, timeout = 30000 } = {}) {
  const { BrowserWindow } = require('electron');
  const win = new BrowserWindow({ show: false, width, height, paintWhenInitiallyHidden: true, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, partition: 'deploy-verify', offscreen: true } });
  const errors = [];
  win.webContents.on('console-message', (...a) => { const e = a[0] && typeof a[0] === 'object' && 'message' in a[0] ? a[0] : { level: a[1], message: a[2] }; if (e.level === 3 || e.level === 'error') errors.push(String(e.message).slice(0, 300)); });
  try {
    await win.loadURL(url);
    const t0 = Date.now();
    let st = null;
    while (Date.now() - t0 < timeout) {
      st = await win.webContents.executeJavaScript('JSON.stringify(window.__hearthBuild || null)').then((s) => JSON.parse(s)).catch(() => null);
      if (st?.drawn || st?.errors?.length) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 700)); // a few frames after the first one
    const img = await win.webContents.capturePage();
    const size = img.getSize();
    const bmp = img.toBitmap();
    const seen = new Set(); let lit = 0; let n = 0;
    const step = Math.max(1, Math.floor((size.width * size.height) / 4000));
    for (let i = 0; i < size.width * size.height; i += step) {
      const o = i * 4; const b = bmp[o]; const g = bmp[o + 1]; const r = bmp[o + 2];
      n += 1; if (r + g + b > 30) lit += 1;
      seen.add(`${r >> 3},${g >> 3},${b >> 3}`);
    }
    const shot = img.isEmpty() ? null : img.resize({ width: Math.min(480, size.width) }).toDataURL();
    const nonBlank = n > 0 && lit / n > 0.002 && seen.size > 2;
    const errs = [...(st?.errors || []), ...errors.filter((e) => !/favicon|DevTools|Autofill/i.test(e))];
    return { ok: Boolean(st?.drawn) && nonBlank && !(st?.errors || []).length, ready: Boolean(st?.ready), drawn: Boolean(st?.drawn), errors: errs.slice(0, 8), nonBlank, colors: seen.size, lit: n ? Math.round((lit / n) * 1000) / 10 : 0, size, shot };
  } finally { if (!win.isDestroyed()) win.destroy(); }
}

// ---------- deploy / remove / roll back ----------
const firstLine = (s) => String(s || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^(›|>|\s*$)/.test(l)).pop() || '';
function explain(p, r) {
  const text = `${r.out}\n${r.err}`;
  if (p.signedOut.test(text)) return `You're not signed in to ${p.name}: /deploy login ${p.id} (a terminal opens with ${p.name}'s own sign-in).`;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network|offline|getaddrinfo/i.test(text)) return `${p.name} couldn't be reached (offline?).`;
  if (/rate limit|429/i.test(text)) return `${p.name} says: too many requests, try again in a minute.`;
  return `${p.name}: ${firstLine(r.err) || firstLine(r.out) || `exit ${r.code}`}`.slice(0, 400);
}
// job: { provider, dir, slug, prod, site, owner } → { ok, url, deployId, site, owner, log }
async function deploy(job, emit = () => {}, { paths = {} } = {}) {
  const p = C.provider(job.provider);
  if (!p) return { ok: false, error: `Unknown service ${job.provider}` };
  const cli = findCli(p.cli, paths[p.id]);
  if (!cli) return { ok: false, error: `The ${p.name} CLI isn't installed. Install it in a terminal: ${C.installHint(p, process.platform)}`, install: C.installHint(p, process.platform) };
  if (!job.dir || !exists(job.dir)) return { ok: false, error: `Nothing to publish at ${job.dir}` };
  const step = (pct, label) => emit({ type: 'progress', pct, label });
  const log = [];
  const go = async (args, o = {}) => { const r = await runCli(cli, args, { cwd: o.cwd || job.dir, emit: (e) => { log.push(e.line); emit(e); } }); return r; };
  let site = job.site || null; let owner = job.owner || null;
  step(5, `Starting ${p.name}`);
  if (p.id === 'vercel') {
    step(20, 'Uploading');
    const r = await go(p.deploy({ dir: job.dir, slug: job.slug, prod: job.prod }));
    const u = C.parseUrl(p, `${r.out}\n${r.err}`);
    if (r.code !== 0 || !u) return { ok: false, error: explain(p, r), log };
    return { ok: true, url: u.url, deployId: u.url, site: job.slug, log };
  }
  if (p.id === 'netlify') {
    if (!site) {
      step(12, 'Creating the site');
      for (const name of [job.slug, `${job.slug}-${Math.random().toString(36).slice(2, 6)}`]) {
        const r = await go(p.createSite({ slug: name }), { cwd: os.tmpdir() });
        const j = (() => { try { return JSON.parse(r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1)); } catch { return null; } })();
        if (r.code === 0 && j?.id) { site = j.id; break; }
        if (p.signedOut.test(`${r.out}\n${r.err}`)) return { ok: false, error: explain(p, r), log };
      }
      if (!site) return { ok: false, error: `${p.name}: couldn't create a site named ${job.slug}.`, log };
    }
    step(30, 'Uploading');
    const r = await go(p.deploy({ dir: job.dir, site, prod: job.prod }));
    const u = C.parseUrl(p, r.out);
    if (r.code !== 0 || !u) return { ok: false, error: explain(p, r), log, site };
    return { ok: true, url: job.prod ? (u.siteUrl || u.url) : u.url, deployUrl: u.url, deployId: u.deployId, site: u.site || site, log };
  }
  if (p.id === 'cloudflare') {
    step(12, 'Preparing the project');
    const c = await go(p.createSite({ slug: job.slug }), { cwd: os.tmpdir() });
    if (c.code !== 0 && p.signedOut.test(`${c.out}\n${c.err}`)) return { ok: false, error: explain(p, c), log };
    step(30, 'Uploading');
    const r = await go(p.deploy({ dir: job.dir, slug: job.slug, prod: job.prod }));
    const u = C.parseUrl(p, `${r.out}\n${r.err}`);
    if (r.code !== 0 || !u) return { ok: false, error: explain(p, r), log };
    return { ok: true, url: job.prod ? `https://${job.slug}.pages.dev` : u.url, deployUrl: u.url, deployId: u.url.match(/https:\/\/([a-f0-9]+)\./)?.[1] || null, site: job.slug, log };
  }
  if (p.id === 'github') {
    const git = findCli('git', paths.git);
    if (!git) return { ok: false, error: `GitHub Pages also needs git: ${isMac() ? 'xcode-select --install' : isWin() ? 'winget install Git.Git' : 'install git'}` };
    if (!owner) {
      const u = await go(p.user, { cwd: os.tmpdir() });
      owner = u.code === 0 ? u.out.trim().split('\n').pop().trim() : null;
      if (!owner) return { ok: false, error: explain(p, u), log };
    }
    step(12, 'Making the repository');
    const c = await go(p.createSite({ slug: job.slug }), { cwd: os.tmpdir() });
    if (c.code !== 0 && !/already exists|Name already exists/i.test(`${c.out}\n${c.err}`)) return { ok: false, error: explain(p, c), log };
    const v = await go(['repo', 'view', `${owner}/${job.slug}`, '--json', 'url', '--jq', '.url'], { cwd: os.tmpdir() });
    const remote = v.code === 0 && v.out.trim() ? `${v.out.trim().split('\n').pop().trim().replace(/\.git$/, '')}.git` : `https://github.com/${owner}/${job.slug}.git`;
    step(30, 'Pushing the page');
    // a fresh one-commit branch from a copy of the build (the build folder itself stays as it is)
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ghpages-'));
    try {
      fs.cpSync(job.dir, work, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s.slice(job.dir.length)) });
      fs.writeFileSync(path.join(work, '.nojekyll'), '');
      const g = (args) => runCli(git, args, { cwd: work, emit: (e) => { log.push(e.line); emit(e); }, env: cliEnv(git) });
      const helper = `!${JSON.stringify(cli.replace(/\\/g, '/'))} auth git-credential`;
      for (const args of [['init', '-q'], ['checkout', '-q', '-b', 'gh-pages'], ['add', '-A'], ['-c', 'user.name=Hearth', '-c', 'user.email=hearth@users.noreply.github.com', 'commit', '-q', '-m', 'Published from Hearth'], ['-c', 'credential.helper=', '-c', `credential.helper=${helper}`, 'push', '-q', '-f', remote, 'gh-pages']]) {
        const r = await g(args);
        if (r.code !== 0) return { ok: false, error: `git ${args.find((a) => /^(init|checkout|add|commit|push)$/.test(a))}: ${firstLine(r.err) || firstLine(r.out)}`, log };
      }
    } finally { try { rmGitCopy(work); } catch (err) { console.warn('deploy: temp copy left', work, err.message); } } // (never the deploy's own result)
    step(80, 'Turning Pages on');
    await go(p.pages({ owner, slug: job.slug }), { cwd: os.tmpdir() }); // already on: 409, fine
    return { ok: true, url: `https://${owner.toLowerCase()}.github.io/${job.slug}/`, site: job.slug, owner, log, note: 'GitHub Pages takes a minute to go live the first time.' };
  }
  return { ok: false, error: `${p.name} isn't supported` };
}
// entry: a history entry; what: 'deploy' (this deploy only, where the CLI can) | 'site' (the whole site / repo)
async function remove(entry, what = 'deploy', { paths = {} } = {}) {
  const p = C.provider(entry.provider);
  const cli = p && findCli(p.cli, paths[p.id]);
  if (!cli) return { ok: false, error: p ? `The ${p.name} CLI isn't installed.` : 'Unknown service' };
  const whole = what === 'site' || !p.canRemoveDeploy;
  const args = p.id === 'vercel' ? (whole ? ['remove', entry.slug, '--yes'] : p.remove({ url: entry.deployId || entry.url })) : p.remove({ site: entry.site, slug: entry.slug, owner: entry.owner });
  const r = await runCli(cli, args, {});
  return r.code === 0 ? { ok: true, whole } : { ok: false, error: explain(p, r) };
}
// back to an earlier deploy: Vercel / Netlify switch to it on their side; the others publish its kept build again
async function rollback(entry, prev, emit, { paths = {} } = {}) {
  const p = C.provider(entry.provider);
  const cli = p && findCli(p.cli, paths[p.id]);
  if (!cli) return { ok: false, error: p ? `The ${p.name} CLI isn't installed.` : 'Unknown service' };
  if (p.id === 'vercel' && prev.deployId) { const r = await runCli(cli, p.rollback({ url: prev.deployId }), {}); return r.code === 0 ? { ok: true, url: entry.url, how: 'switched' } : { ok: false, error: explain(p, r) }; }
  if (p.id === 'netlify' && prev.deployId && prev.site) { const r = await runCli(cli, p.rollback({ site: prev.site, deployId: prev.deployId }), {}); return r.code === 0 ? { ok: true, url: prev.url, how: 'switched' } : { ok: false, error: explain(p, r) }; }
  if (!prev.build || !exists(prev.build)) return { ok: false, error: 'The earlier build is gone from this computer, so it can\'t be published again.' };
  const r = await deploy({ provider: p.id, dir: prev.build, slug: prev.slug, prod: true, site: prev.site, owner: prev.owner }, emit, { paths });
  return r.ok ? { ...r, how: 'republished' } : r;
}

function register(ipcMain, getWin, settings) {
  const paths = () => settings?.()?.deployPaths || {};
  const send = (ev) => { try { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('deploy:event', ev); } catch { /* window gone */ } };
  ipcMain.handle('deploy:status', (_e, o = {}) => status({ check: Boolean(o.check), paths: { ...paths(), ...(o.paths || {}) } }));
  ipcMain.handle('deploy:login', (_e, id, o = {}) => login(id, { paths: { ...paths(), ...(o.paths || {}) } }));
  ipcMain.handle('deploy:build', (_e, spec, o = {}) => build(spec, o));
  ipcMain.handle('deploy:preview', async (_e, dir, o = {}) => { const r = await preview(dir); if (o.show) showPreview(r.url, o.title); return r; });
  ipcMain.handle('deploy:verify', async (_e, dir, o = {}) => verify((await preview(dir)).url, o));
  ipcMain.handle('deploy:run', (_e, job, o = {}) => deploy(job, (ev) => send({ id: job.id, ...ev }), { paths: { ...paths(), ...(o.paths || {}) } }));
  ipcMain.handle('deploy:remove', (_e, entry, what, o = {}) => remove(entry, what, { paths: { ...paths(), ...(o.paths || {}) } }));
  ipcMain.handle('deploy:rollback', (_e, entry, prev, o = {}) => rollback(entry, prev, (ev) => send({ id: entry.id, ...ev }), { paths: { ...paths(), ...(o.paths || {}) } }));
  ipcMain.handle('deploy:dir', () => { fs.mkdirSync(ROOT(), { recursive: true }); return ROOT(); });
  try { require('electron').app.on('before-quit', stopPreviews); } catch { /* tests */ }
}

module.exports = { register, vendorThree, labPage, status, providerStatus, login, build, preview, stopPreviews, verify, deploy, remove, rollback, findCli, runCli, _test: { setDataDir: (d) => { DATA_DIR = d; }, vendorThree, labPage, cache } };
