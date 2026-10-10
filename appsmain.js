// App windows, main side (round 14, apps stream). Each app (Meshy, Suno, Figma, Poly Haven…) opens in its own
// window: a slim chrome page (apps-window.html: back, reload, open in browser, send to chat, downloads) around a
// <webview> in the app's own persistent session ("persist:app-<id>"), so the owner signs in on the service's own
// page and Hearth never sees a password. Closing a window only hides it (sign-in and page kept); a window hidden for
// a few minutes is parked (destroyed, its last address remembered) so it costs nothing.
// Downloads from an app window land in Downloads/Hearth/<App> and are offered to the right place in the hub
// (apps.js routes them: Lab, board, Video Review, the chat).
// API keys the owner pastes (Meshy) are encrypted with Electron's safeStorage in the profile folder (never in data/,
// never synced, never in a backup), used only here: no page and no engine ever receives one. Meshy jobs run here
// (apps-meshy-api.js is the only file that knows Meshy's API) and survive a reload of the hub page.
// Tests: HEARTH_MESHY_BASE / HEARTH_POLYHAVEN_BASE point the services at dev/fake-meshy.js.
const { app, BrowserWindow, safeStorage, session, shell, net, nativeImage, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AppsCore = require('./apps-core');
const MeshyAPI = require('./apps-meshy-api');

const PARK_MS = Number(process.env.HEARTH_APPS_PARK_MS) || 5 * 60000;
const MESHY_BASE = process.env.HEARTH_MESHY_BASE || MeshyAPI.BASE;
const POLY_BASE = process.env.HEARTH_POLYHAVEN_BASE || 'https://api.polyhaven.com';
const POLL_MS = process.env.HEARTH_MESHY_BASE ? 250 : 4000;
// sign-in pages that open as a popup inside the app window (the session stays the app's)
const AUTH_HOSTS = ['accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com', 'github.com', 'discord.com', 'auth0.com', 'clerk.com', 'adobelogin.com', 'facebook.com', 'id.tiktok.com', 'workos.com'];
const isAuth = (url) => { const h = AppsCore.hostOf(url); return AUTH_HOSTS.some((a) => h === a || h.endsWith(`.${a}`)) || /\/(oauth|auth|login|signin|sso)\b/i.test(String(url)); };

let getWin = () => null;
let store = null;
let appshell = null;
const wins = new Map(); // app id → { win, spec, park, lastUrl, title, guestId }
const hostIds = new Set(); // webContents ids of the chrome pages (their guests are app pages)
let catalog = []; // [{ id, name, icon, group }] from the hub page (the chrome's app switcher)
const downloads = []; // newest first: { id, app, appName, name, path, state, received, total, url, at }
const hooked = new Set(); // partitions whose downloads are routed here
const pasteWaits = new Map();

const toHub = (data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('apps:event', data); };
const toChrome = (appId, channel, data) => { const e = wins.get(appId); if (e?.win && !e.win.isDestroyed()) e.win.webContents.send(channel, data); };
const uid = () => `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const testDir = () => process.env.HEARTH_TEST_SAVE_DIR || null;
const dataDir = () => store?.DATA_DIR || path.join(__dirname, 'data');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJson = (p, v) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 1)); fs.renameSync(`${p}.tmp`, p); } catch (err) { console.warn('apps:', err.message); } };

// ---------- folders ----------
function downloadsRoot() { return testDir() ? path.join(testDir(), 'apps-downloads') : path.join(app.getPath('downloads'), 'Hearth'); }
function downloadsDir(appName) { const d = path.join(downloadsRoot(), AppsCore.safeName(appName || 'Apps')); fs.mkdirSync(d, { recursive: true }); return d; }
const meshyDir = () => { const d = path.join(dataDir(), 'apps', 'meshy'); fs.mkdirSync(d, { recursive: true }); return d; };
function uniquePath(dir, name) {
  const p = path.parse(AppsCore.safeName(name, 120));
  let target = path.join(dir, p.base);
  for (let n = 1; fs.existsSync(target); n += 1) target = path.join(dir, `${p.name} (${n})${p.ext}`);
  return target;
}

// ---------- API keys (safeStorage) ----------
const KEYS_FILE = () => path.join(app.getPath('userData'), 'hearth-app-keys.json');
const sessionKeys = new Map(); // only when this computer can't encrypt: kept until Hearth quits
function canEncrypt() { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } }
function getKey(service) {
  if (service === 'meshy' && process.env.HEARTH_MESHY_KEY) return process.env.HEARTH_MESHY_KEY;
  if (sessionKeys.has(service)) return sessionKeys.get(service);
  const enc = readJson(KEYS_FILE(), {})[service];
  if (!enc) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return null; }
}
function setKey(service, value) {
  const v = String(value || '').trim();
  if (!/^[\w.-]{8,200}$/.test(v)) return { ok: false, error: 'That doesn\'t look like an API key (copy it from the service\'s API settings).' };
  const all = readJson(KEYS_FILE(), {});
  if (canEncrypt()) {
    all[service] = safeStorage.encryptString(v).toString('base64');
    writeJson(KEYS_FILE(), all);
    sessionKeys.delete(service);
    return { ok: true, stored: 'keychain' };
  }
  sessionKeys.set(service, v);
  return { ok: true, stored: 'session' };
}
function forgetKey(service) {
  sessionKeys.delete(service);
  const all = readJson(KEYS_FILE(), {});
  delete all[service];
  writeJson(KEYS_FILE(), all);
  return { ok: true };
}
const keyInfo = (service) => { const k = getKey(service); return { has: Boolean(k), test: k === MeshyAPI.TEST_KEY, stored: sessionKeys.has(service) ? 'session' : k ? 'keychain' : null, canEncrypt: canEncrypt() }; };

// ---------- downloads from app windows ----------
function hookSession(partition, appIdOf) {
  if (hooked.has(partition)) return;
  hooked.add(partition);
  const ses = session.fromPartition(partition);
  appshell?.skipDownloads?.(ses); // the hub's own download toast (appshell.setupDownloads) leaves these to us
  ses.on('will-download', (_e, item, wc) => {
    const appId = appIdOf(wc);
    const spec = wins.get(appId)?.spec || catalog.find((a) => a.id === appId) || { id: appId, name: appId };
    const target = uniquePath(downloadsDir(spec.name), item.getFilename() || 'download');
    item.setSavePath(target);
    const d = { id: uid(), app: spec.id, appName: spec.name, name: path.basename(target), path: target, state: 'progressing', received: 0, total: item.getTotalBytes(), url: item.getURL(), at: Date.now() };
    downloads.unshift(d);
    downloads.length = Math.min(downloads.length, 200);
    let lastSent = 0;
    const report = (state, force) => {
      d.state = state; d.received = item.getReceivedBytes(); d.total = item.getTotalBytes();
      const now = Date.now();
      if (!force && now - lastSent < 400) return; // a fast download sends ≤ 2–3 updates a second
      lastSent = now;
      toChrome(spec.id, 'appwin:downloads', listDownloads(spec.id));
      toHub({ type: 'download', d: { ...d } });
    };
    report('progressing', true);
    item.on('updated', (_ev, state) => report(state));
    item.once('done', (_ev, state) => report(state === 'completed' ? 'completed' : state, true));
  });
}
const listDownloads = (appId) => downloads.filter((d) => !appId || d.app === appId).slice(0, 40);
// a file Hearth fetched for an app (Poly Haven, Meshy's web results…), in the same list
async function fetchTo({ url, appId, appName, name } = {}) {
  if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: 'Only web addresses can be downloaded.' };
  const dir = downloadsDir(appName || appId || 'Apps');
  const target = uniquePath(dir, name || decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'));
  const d = { id: uid(), app: appId || 'apps', appName: appName || appId || 'Apps', name: path.basename(target), path: target, state: 'progressing', received: 0, total: 0, url, at: Date.now() };
  downloads.unshift(d);
  toHub({ type: 'download', d: { ...d }, quiet: true });
  try {
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(`The server answered ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(target, buf);
    Object.assign(d, { state: 'completed', received: buf.length, total: buf.length });
  } catch (err) { Object.assign(d, { state: 'failed', error: err.message }); }
  toChrome(d.app, 'appwin:downloads', listDownloads(d.app));
  toHub({ type: 'download', d: { ...d }, quiet: true });
  return d.state === 'completed' ? { ok: true, path: target, id: d.id } : { ok: false, error: d.error };
}
async function fetchJson(url) {
  if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: 'Not a web address' };
  try { const res = await net.fetch(url, { headers: { Accept: 'application/json' } }); if (!res.ok) return { ok: false, error: `${res.status}` }; return { ok: true, value: await res.json() }; } catch (err) { return { ok: false, error: err.message }; }
}

// ---------- the windows ----------
const boundsFile = () => path.join(app.getPath('userData'), 'hearth-app-windows.json');
const savedBounds = (id) => readJson(boundsFile(), {})[id] || null;
function saveBounds(id, win) {
  if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  const all = readJson(boundsFile(), {});
  all[id] = { ...win.getBounds(), url: wins.get(id)?.lastUrl || all[id]?.url || null };
  writeJson(boundsFile(), all);
}
function guestOf(entry) { try { return entry.guestId ? webContents.fromId(entry.guestId) : null; } catch { return null; } }
function park(entry) {
  clearTimeout(entry.park);
  entry.park = setTimeout(() => {
    const w = entry.win;
    if (!w || w.isDestroyed() || w.isVisible()) return;
    if (guestOf(entry)?.isCurrentlyAudible?.()) { park(entry); return; } // still playing something: later
    entry.parked = true; entry.closing = true;
    saveBounds(entry.spec.id, w);
    w.destroy();
  }, PARK_MS);
}
function openWindow(spec = {}) {
  const id = String(spec.id || '').replace(/[^\w-]/g, '');
  if (!id) return { ok: false, error: 'No app id' };
  const url = spec.url && /^(https?|file):/i.test(spec.url) ? spec.url : null;
  const ex = wins.get(id);
  if (ex?.win && !ex.win.isDestroyed()) {
    clearTimeout(ex.park);
    if (url && spec.go) toChrome(id, 'appwin:navigate', url);
    if (!spec.background) { if (ex.win.isMinimized()) ex.win.restore(); ex.win.show(); ex.win.focus(); }
    toHub({ type: 'window', id, state: 'shown' });
    return { ok: true, reused: true };
  }
  const partition = `persist:app-${String(spec.partition || id).replace(/[^\w-]/g, '')}`;
  hookSession(partition, (wc) => { const host = wc?.hostWebContents; for (const [aid, e] of wins) if (e.win && !e.win.isDestroyed() && (host?.id === e.win.webContents.id || e.guestId === wc?.id)) return aid; return id; });
  const b = savedBounds(id);
  const hub = getWin();
  const win = new BrowserWindow({
    width: b?.width || 1280, height: b?.height || 860, ...(b?.x != null ? { x: b.x, y: b.y } : {}), minWidth: 420, minHeight: 300,
    title: `${spec.name || id} · Hearth`, backgroundColor: '#14161b', autoHideMenuBar: true, show: !spec.background,
    icon: appshell?.ensureIcon?.(),
    webPreferences: { preload: path.join(__dirname, 'apps-preload.js'), contextIsolation: true, sandbox: true, webviewTag: true, spellcheck: true },
  });
  const entry = { win, spec: { ...spec, id, partition }, park: null, lastUrl: (spec.resume !== false && b?.url && AppsCore.sameSite(b.url, url || b.url) && !spec.go) ? b.url : url, title: '', guestId: null };
  wins.set(id, entry);
  hostIds.add(win.webContents.id);
  const hostId = win.webContents.id;
  win.loadFile(path.join(__dirname, 'apps-window.html'), { query: { id } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-attach-webview', (_e, guest) => { entry.guestId = guest.id; configureGuest(guest, entry); });
  win.on('close', (e) => {
    if (entry.closing || !hub || hub.isDestroyed()) return;
    e.preventDefault();
    saveBounds(id, win);
    const g = guestOf(entry);
    // hidden windows don't keep playing: the media on the page pauses (it resumes with a click when shown again)
    g?.executeJavaScript?.('document.querySelectorAll("video,audio").forEach((m) => { try { m.pause(); } catch {} })', true).catch(() => {});
    win.hide();
    park(entry);
    toHub({ type: 'window', id, state: 'hidden' });
  });
  win.on('show', () => clearTimeout(entry.park));
  win.on('closed', () => { hostIds.delete(hostId); if (wins.get(id) === entry) wins.delete(id); toHub({ type: 'window', id, state: 'closed' }); });
  if (hub && !hub.__appsHooked) { hub.__appsHooked = true; hub.once('closed', closeAll); }
  toHub({ type: 'window', id, state: 'opened' });
  return { ok: true };
}
function configureGuest(guest, entry) {
  const home = entry.spec.url || entry.lastUrl;
  guest.setWindowOpenHandler(({ url }) => {
    if (isAuth(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    // the service's own links stay in its window; anything else opens in the normal browser
    if (AppsCore.sameSite(url, home) || (entry.spec.hosts || []).some((h) => AppsCore.hostOf(url).endsWith(h))) { guest.loadURL(url).catch(() => {}); return { action: 'deny' }; }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  guest.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || (process.platform === 'darwin' && input.meta);
    const k = String(input.key || '').toLowerCase();
    const act = (op) => { event.preventDefault(); toChrome(entry.spec.id, 'appwin:key', op); };
    if ((mod && k === 'r') || k === 'f5') act('reload');
    else if ((input.alt && k === 'arrowleft') || (mod && k === '[')) act('back');
    else if ((input.alt && k === 'arrowright') || (mod && k === ']')) act('forward');
    else if (mod && k === 'w') act('close');
    else if (mod && input.shift && k === 'enter') act('to-chat');
    else if (mod && k === 'l') act('copy-link');
  });
}
function closeWindow(id, { destroy = false } = {}) {
  const e = wins.get(id);
  if (!e?.win || e.win.isDestroyed()) return { ok: false, error: 'Not open' };
  if (destroy) { e.closing = true; saveBounds(id, e.win); e.win.destroy(); } else e.win.close();
  return { ok: true };
}
function closeAll() { for (const [id, e] of wins) { if (e.win && !e.win.isDestroyed()) { e.closing = true; saveBounds(id, e.win); e.win.destroy(); } } }
const listWindows = () => [...wins.entries()].filter(([, e]) => e.win && !e.win.isDestroyed()).map(([id, e]) => ({ id, name: e.spec.name, visible: e.win.isVisible(), focused: e.win.isFocused(), url: e.lastUrl, title: e.title, audible: Boolean(guestOf(e)?.isCurrentlyAudible?.()) }));

// text typed into the app's page (Suno's lyrics / style boxes): the chrome page fills it and reads it back
function paste(id, { text, field, strict } = {}) {
  const e = wins.get(id);
  if (!e?.win || e.win.isDestroyed()) return Promise.resolve({ ok: false, error: 'The app window isn\'t open.' });
  const reqId = uid();
  return new Promise((resolve) => {
    pasteWaits.set(reqId, resolve);
    toChrome(id, 'appwin:paste', { reqId, text: String(text || ''), field: field || '', strict: Boolean(strict) });
    setTimeout(() => { if (pasteWaits.has(reqId)) { pasteWaits.delete(reqId); resolve({ ok: false, error: 'The page didn\'t answer (still loading?)' }); } }, 15000);
  });
}
async function pagePicture(id, { whole = false } = {}) {
  // whole: the window with its chrome (a picture of how the app window looks), else the app's page only
  const g = whole ? wins.get(id)?.win?.webContents : guestOf(wins.get(id) || {});
  if (!g) return null;
  try { const img = await g.capturePage(); if (img.isEmpty()) return null; const s = img.getSize(); const small = s.width > 1600 ? img.resize({ width: 1600 }) : img; return store.saveAttachment(`${id}-page.jpg`, small.toJPEG(85).toString('base64')); } catch { return null; }
}

// ---------- Meshy jobs ----------
const JOBS_FILE = () => path.join(meshyDir(), 'jobs.json');
let jobs = null; // [{ id, op, name, prompt, opts, step, steps, tasks: { preview, refine, … }, status, pct, label, files, error, at, acked, credits }]
const loadJobs = () => { jobs ||= readJson(JOBS_FILE(), []); return jobs; };
const saveJobs = () => writeJson(JOBS_FILE(), loadJobs().slice(0, 60));
const running = new Map(); // job id → { stop }
function meshyClient() { return MeshyAPI.client({ key: getKey('meshy'), base: MESHY_BASE, fetch: (u, o) => net.fetch(u, o) }); }
const pub = (j) => { const { opts, ...rest } = j; return { ...rest, opts: { ...opts, imageUrl: opts?.imageUrl && /^data:/.test(opts.imageUrl) ? '(picture)' : opts?.imageUrl, modelUrl: opts?.modelUrl && /^data:/.test(opts.modelUrl) ? '(model file)' : opts?.modelUrl } }; };
function emitJob(j) { toHub({ type: 'meshy', job: pub(j) }); }
// a local picture → a data: URI Meshy accepts (PNG / JPEG, at most 2048 px)
function imageUri(src) {
  const s = String(src || '');
  if (/^(https?:|data:image\/)/i.test(s)) return s;
  if (!fs.existsSync(s)) throw new Error(`No picture at ${s}`);
  let img = nativeImage.createFromPath(s);
  if (img.isEmpty()) throw new Error('Meshy reads PNG or JPEG pictures (this one couldn\'t be opened).');
  const { width, height } = img.getSize();
  if (Math.max(width, height) > 2048) img = img.resize(width >= height ? { width: 2048 } : { height: 2048 });
  return `data:image/jpeg;base64,${img.toJPEG(90).toString('base64')}`;
}
function modelUri(src) {
  const s = String(src || '');
  if (/^(https?:|data:)/i.test(s)) return s;
  const st = fs.statSync(s);
  if (st.size > 40 * 1048576) throw new Error('That model is over 40 MB: Meshy needs it smaller.');
  return `data:model/gltf-binary;base64,${fs.readFileSync(s).toString('base64')}`;
}
function startMeshy(args = {}) {
  if (!getKey('meshy')) return { ok: false, error: 'No Meshy API key yet: /meshy key to paste it once (Meshy → Settings → API). It is stored encrypted on this computer and never shown to a chat.' };
  const op = String(args.op || 'text');
  const o = { ...(args.opts || {}) };
  try {
    if (op === 'image') o.imageUrl = imageUri(o.image);
    if ((op === 'retexture' || op === 'remesh') && !o.taskId) o.modelUrl = modelUri(o.model);
    delete o.image; delete o.model;
    const steps = op === 'text' ? (o.draft ? ['preview'] : ['preview', 'refine']) : [op];
    MeshyAPI.body(steps[0], o); // validates before anything is spent
    const est = MeshyAPI.estimate(op, o);
    const j = { id: `m${uid()}`, op, name: AppsCore.safeName(args.name || o.prompt || o.stylePrompt || op, 48), prompt: o.prompt || o.stylePrompt || '', opts: o, steps, step: steps[0], tasks: {}, status: 'running', pct: 0, label: 'starting', files: {}, error: '', at: Date.now(), acked: false, credits: est.credits, chatId: args.chatId || null, to: args.to || null, source: args.source || null };
    loadJobs().unshift(j);
    saveJobs();
    runJob(j);
    return { ok: true, job: pub(j) };
  } catch (err) { return { ok: false, error: err.message }; }
}
async function runJob(j) {
  if (running.has(j.id)) return;
  const ctl = { stopped: false };
  running.set(j.id, ctl);
  const span = j.steps.length === 2 ? { preview: [0, 55], refine: [55, 94] } : { [j.steps[0]]: [0, 94] };
  try {
    const c = meshyClient();
    for (const step of j.steps) {
      j.step = step;
      if (!j.tasks[step]) {
        const o = step === 'refine' ? { ...j.opts, previewId: j.tasks.preview } : j.opts;
        j.label = `${step === 'refine' ? 'texturing' : 'sending'}…`; emitJob(j);
        j.tasks[step] = await c.create(step, o);
        saveJobs();
      }
      const [a, b] = span[step];
      const t = await c.wait(step, j.tasks[step], {
        interval: POLL_MS, stop: () => ctl.stopped,
        onProgress: (task) => { j.pct = Math.round(a + (b - a) * task.progress / 100); j.label = `${step === 'preview' ? 'shape' : step === 'refine' ? 'texture' : step} ${task.progress} %${task.status === 'waiting' && task.queue ? ` · ${task.queue} ahead in Meshy's queue` : ''}`; emitJob(j); },
      });
      j.result = { glb: t.glb, thumb: t.thumb, fbx: t.fbx, usdz: t.usdz };
    }
    j.label = 'downloading the model'; j.pct = 96; emitJob(j);
    if (!j.result?.glb) throw new Error('Meshy finished without a GLB file.');
    const base = `${AppsCore.safeName(j.name, 40)}-${j.id.slice(-6)}`;
    const glb = path.join(meshyDir(), `${base}.glb`);
    const res = await net.fetch(j.result.glb);
    if (!res.ok) throw new Error(`The model download failed (${res.status})`);
    fs.writeFileSync(glb, Buffer.from(await res.arrayBuffer()));
    j.files.glb = glb;
    if (j.result.thumb) {
      try { const r2 = await net.fetch(j.result.thumb); if (r2.ok) { const p = path.join(meshyDir(), `${base}.png`); fs.writeFileSync(p, Buffer.from(await r2.arrayBuffer())); j.files.thumb = p; } } catch { /* the picture is a bonus */ }
    }
    j.status = 'done'; j.pct = 100; j.label = 'ready';
  } catch (err) {
    j.status = ctl.stopped ? 'stopped' : 'failed';
    j.error = ctl.stopped ? 'Stopped (Meshy may still finish it: /meshy resume)' : err.message;
    j.label = j.status;
  } finally {
    running.delete(j.id);
    saveJobs();
    emitJob(j);
  }
}
function meshy(op, args = {}) {
  if (op === 'start') return startMeshy(args);
  if (op === 'jobs') {
    // jobs that were running when Hearth closed carry on (polling only: nothing is spent twice)
    if (args.resume !== false && getKey('meshy')) for (const j of loadJobs()) if (j.status === 'running' && !running.has(j.id)) runJob(j);
    return { ok: true, value: loadJobs().slice(0, 40).map(pub) };
  }
  if (op === 'resume') {
    const j = loadJobs().find((x) => x.id === args.id) || loadJobs().find((x) => ['failed', 'stopped'].includes(x.status) && Object.keys(x.tasks || {}).length);
    if (!j) return { ok: false, error: 'Nothing to pick up.' };
    j.status = 'running'; j.error = '';
    runJob(j);
    return { ok: true, job: pub(j) };
  }
  if (op === 'stop') { const c = running.get(args.id); if (c) c.stopped = true; return { ok: Boolean(c) }; }
  if (op === 'ack') { for (const j of loadJobs()) if (j.id === args.id) j.acked = true; saveJobs(); return { ok: true }; }
  if (op === 'forget') { jobs = loadJobs().filter((j) => j.id !== args.id); saveJobs(); return { ok: true }; }
  if (op === 'balance') return meshyClient().balance().then((n) => ({ ok: true, value: n })).catch((err) => ({ ok: false, error: err.message }));
  if (op === 'estimate') { try { return { ok: true, value: MeshyAPI.estimate(args.op || 'text', args.opts || {}) }; } catch (err) { return { ok: false, error: err.message }; } }
  return { ok: false, error: `Unknown Meshy operation ${op}` };
}

// ---------- IPC ----------
function register(ipcMain, gw, deps = {}) {
  getWin = gw;
  store = deps.store || require('./store');
  appshell = deps.appshell || null;
  app.on('before-quit', () => { for (const e of wins.values()) e.closing = true; for (const c of running.values()) c.stopped = true; });
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...a) => fn(...a));
  // from the hub page
  h('apps:open', (spec) => openWindow(spec || {}));
  h('apps:close', (id, o) => closeWindow(String(id), o || {}));
  h('apps:closeAll', () => { closeAll(); return { ok: true }; });
  h('apps:windows', () => listWindows());
  h('apps:nav', (id, op, url) => {
    if (!wins.has(id)) return { ok: false, error: 'Not open' };
    // a file fetched in the app's own session (its sign-in cookies apply), landing like any download from the window
    if (op === 'download') { const g = guestOf(wins.get(id)); if (!g || !/^https?:/i.test(String(url))) return { ok: false, error: 'No page' }; g.downloadURL(String(url)); return { ok: true }; }
    toChrome(id, 'appwin:key', op === 'url' ? { op: 'url', url } : op); return { ok: true }; });
  h('apps:paste', (id, o) => paste(String(id), o || {}));
  h('apps:picture', (id, o) => pagePicture(String(id), o || {}));
  h('apps:catalog', (list) => { catalog = Array.isArray(list) ? list.slice(0, 200) : []; for (const id of wins.keys()) toChrome(id, 'appwin:catalog', catalog); return true; });
  h('apps:downloads', (appId) => listDownloads(appId || null));
  h('apps:dirs', () => ({ downloads: downloadsRoot(), meshy: meshyDir() }));
  h('apps:key', (service, op, value) => {
    const s = String(service || '').replace(/[^\w-]/g, '');
    if (op === 'set') return setKey(s, value);
    if (op === 'forget') return forgetKey(s);
    return keyInfo(s);
  });
  h('apps:fetchTo', (o) => fetchTo(o || {}));
  h('apps:fetchJson', (url) => fetchJson(String(url || '')));
  h('apps:meshy', (op, args) => meshy(String(op || ''), args || {}));
  h('apps:status', () => ({ meshyBase: MESHY_BASE, polyBase: POLY_BASE, meshyKey: keyInfo('meshy'), windows: listWindows(), downloadsDir: downloadsRoot(), parkMs: PARK_MS, testBase: process.env.HEARTH_MESHY_BASE || null }));

  // from an app window's chrome (apps-window.html via apps-preload.js); the sender names its app
  const appOf = (e) => { for (const [id, x] of wins) if (x.win && !x.win.isDestroyed() && x.win.webContents.id === e.sender.id) return [id, x]; return [null, null]; };
  const c = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { const [id, x] = appOf(e); return id ? fn(id, x, ...a) : null; });
  c('appwin:init', (id, x) => ({ spec: x.spec, url: x.lastUrl || x.spec.url || 'about:blank', catalog, downloads: listDownloads(id), mac: process.platform === 'darwin' }));
  c('appwin:state', (id, x, s = {}) => { if (s.url && /^https?:/i.test(s.url)) x.lastUrl = s.url; if (s.title != null) { x.title = String(s.title).slice(0, 200); x.win.setTitle(`${x.title ? `${x.title} · ` : ''}${x.spec.name} · Hearth`); } return true; });
  c('appwin:external', (_id, _x, url) => { if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url)); return true; });
  c('appwin:toChat', async (id, x, o = {}) => { const pic = o.picture === false ? null : await pagePicture(id); toHub({ type: 'to-chat', app: id, appName: x.spec.name, url: o.url || x.lastUrl, title: o.title || x.title, selection: String(o.selection || '').slice(0, 4000), picture: pic }); const w = getWin(); if (w && !w.isDestroyed()) { w.show(); w.focus(); } return { ok: true }; });
  c('appwin:route', (id, _x, downloadId, target) => { const d = downloads.find((y) => y.id === downloadId); if (!d) return { ok: false }; toHub({ type: 'route', d: { ...d }, target: String(target) }); return { ok: true }; });
  c('appwin:action', (id, x, action, o = {}) => { toHub({ type: 'action', app: id, action: String(action), url: o.url || x.lastUrl, title: o.title || x.title }); return true; });
  c('appwin:openApp', (_id, _x, other) => { toHub({ type: 'open', id: String(other) }); return true; });
  c('appwin:reveal', (_id, _x, p) => { if (downloads.some((d) => d.path === p)) shell.showItemInFolder(p); else shell.openPath(downloadsRoot()); return true; });
  c('appwin:pasteResult', (_id, _x, reqId, r) => { pasteWaits.get(reqId)?.(r || { ok: false }); pasteWaits.delete(reqId); return true; });
  c('appwin:signOut', async (id, x) => { await session.fromPartition(x.spec.partition).clearStorageData(); toChrome(id, 'appwin:key', 'reload'); return { ok: true }; });
  c('appwin:hide', (id) => closeWindow(id));
}

module.exports = { register, isAppGuest: (contents) => Boolean(contents?.hostWebContents && hostIds.has(contents.hostWebContents.id)), _test: { isAuth, imageUri } };
