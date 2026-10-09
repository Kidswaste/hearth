// Capture, main side: Hearth screenshots and records itself, and reads frames of any video (framereader.js).
// Required from main.js with one line; the renderer side is capture.js (+ capture-frames.js, capture-cmds.js) and the
// agents' side is mcp/capture-mcp.js. Everything lands in the captures folder (Settings: settings.captureDir, default
// data/captures): shots/, recordings/, frames/ (frame-reader pictures), sheets/.
//
// IPC (preload.js → window.hub.capture.*):
//   dir()                          → { dir, ffmpeg, ffprobe, platform, scale }
//   shot({ rect, format, quality, scale, name, save, preview, sub }) → { path?, w, h, scale, dataUrl? }   rect in window DIPs
//   save({ name, data, sub, ext }) → path   (data: base64 / data: URL / bytes; renderer-made pictures: annotated, stitched…)
//   list({ kind, limit })          → [{ path, name, kind, size, mtime }] newest first (kind: shot | video | frame | all)
//   copyImage(pathOrDataUrl)       → true (the picture on the clipboard)
//   prep({ audio, source })        → arms the next getDisplayMedia() of the hub page: its own frame (tab capture: no cursor,
//                                    no other windows, the app's own sound when audio = 'app'), or the window ('window')
//   recOpen({ name, ext }) / recWrite(id, bytes) / recClose(id) → a recording streamed to disk while it records
//   finish({ path, mp4, fps, keep }) → { webm, mp4?, duration } fixes MediaRecorder's WebM (duration / seeking) and makes an MP4
//   indicator({ on, paused, elapsed, label }) → the small REC window: on top of Hearth but never in the recorded frame
//   frames(op, file, args, opts)   → framereader.js op (probe, locate, at, frames, every, spread, scenes, motion, analyze, sheet, times)
//   trash(path)                    → moved to the Recycle Bin / Trash (never a permanent delete)
//   startDrag(path)                → a native file drag (drop it in a chat, the board, Finder, an editor)
//   windowSize({ width, height })  → { before, now } the window's content at an exact size (tours), or just the size
// Events to the renderer: 'capture:key' ({ key }) for Ctrl/⌘+Alt+S/A/R/P/V/Esc even while the Lab's frame has the keys,
// 'capture:indicator' ({ action: 'stop' | 'pause' }), 'capture:progress' ({ id, pct }).
const { app, BrowserWindow, clipboard, desktopCapturer, nativeImage, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const FR = require('./framereader');
const { DATA_DIR } = require('./store');

const SUBS = ['shots', 'recordings', 'frames', 'sheets', 'tours'];
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO = /\.(webm|mp4|mov|m4v|mkv)$/i;

function register(ipcMain, getWin, getSettings = () => ({})) {
  const settings = () => { try { return getSettings() || {}; } catch { return {}; } };
  const dir = () => {
    const d = settings().captureDir || path.join(DATA_DIR, 'captures');
    for (const s of SUBS) fs.mkdirSync(path.join(d, s), { recursive: true });
    return d;
  };
  const ffOverrides = () => ({ ffmpeg: settings().ffmpegPath || undefined });
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const safe = (n) => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90);
  const uniquePath = (folder, base, ext) => {
    let p = path.join(folder, `${base}.${ext}`);
    for (let i = 2; fs.existsSync(p); i += 1) p = path.join(folder, `${base} (${i}).${ext}`);
    return p;
  };
  const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  const scaleOf = (w) => { try { return screen.getDisplayMatching(w.getBounds()).scaleFactor || 1; } catch { return 1; } };

  ipcMain.handle('capture:dir', () => {
    FR.setOverrides(ffOverrides());
    const t = FR.tools();
    const w = getWin();
    return { dir: dir(), ffmpeg: t.ffmpeg, ffprobe: t.ffprobe, platform: process.platform, scale: w ? scaleOf(w) : 1 };
  });

  // A picture of the window or a part of it. capturePage gives device pixels (2× on a Retina screen), which is what
  // a social post wants; scale: 1 halves it back to CSS size on HiDPI.
  ipcMain.handle('capture:shot', async (_e, o = {}) => {
    const w = getWin();
    if (!w) throw new Error('No window');
    const r = o.rect && o.rect.width > 0 && o.rect.height > 0 ? {
      x: Math.max(0, Math.round(o.rect.x)), y: Math.max(0, Math.round(o.rect.y)), width: Math.round(o.rect.width), height: Math.round(o.rect.height),
    } : undefined;
    let img = await w.webContents.capturePage(r, { stayHidden: true });
    if (img.isEmpty()) throw new Error('The window gave an empty picture (is it minimized?)');
    const dev = img.getSize();
    if (o.scale && o.scale !== 'native' && r) {
      const want = Math.round(r.width * Number(o.scale));
      if (want > 0 && Math.abs(want - dev.width) > 1) img = img.resize({ width: want, quality: 'best' });
    }
    const size = img.getSize();
    const out = { w: size.width, h: size.height, scale: r ? Math.round((dev.width / r.width) * 100) / 100 : scaleOf(w) };
    const fmt = o.format === 'jpg' || o.format === 'jpeg' ? 'jpg' : 'png';
    const bytes = fmt === 'jpg' ? img.toJPEG(Math.round((o.quality ?? 0.92) * 100)) : img.toPNG();
    if (o.save !== false) {
      const folder = path.join(dir(), o.sub && SUBS.includes(o.sub) ? o.sub : 'shots');
      out.path = uniquePath(folder, safe(o.name) || `Hearth ${stamp()}`, fmt);
      fs.writeFileSync(out.path, bytes);
    }
    if (o.preview || o.save === false) {
      // a data URL for the renderer (annotation, stitching); preview: N = scaled down to N px wide
      const p = o.preview && size.width > o.preview ? img.resize({ width: Math.round(o.preview), quality: 'good' }) : img;
      out.dataUrl = fmt === 'jpg' ? `data:image/jpeg;base64,${p.toJPEG(90).toString('base64')}` : p.toDataURL();
    }
    return out;
  });

  ipcMain.handle('capture:save', (_e, o = {}) => {
    let buf;
    if (typeof o.data === 'string') buf = Buffer.from(o.data.replace(/^data:[^,]*,/, ''), 'base64');
    else buf = Buffer.from(o.data || []);
    const ext = (o.ext || (String(o.name || '').match(/\.(\w+)$/)?.[1]) || 'png').toLowerCase();
    const folder = path.join(dir(), o.sub && SUBS.includes(o.sub) ? o.sub : 'shots');
    const p = uniquePath(folder, safe(String(o.name || '').replace(/\.\w+$/, '')) || `Hearth ${stamp()}`, ext);
    fs.writeFileSync(p, buf);
    return p;
  });

  ipcMain.handle('capture:list', (_e, o = {}) => {
    const root = dir();
    const kind = o.kind || 'all';
    const subs = kind === 'shot' ? ['shots'] : kind === 'video' ? ['recordings'] : kind === 'frame' ? ['frames', 'sheets'] : ['shots', 'recordings', 'sheets'];
    const items = [];
    const walk = (d, depth) => {
      let names = [];
      try { names = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const n of names) {
        const p = path.join(d, n.name);
        if (n.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
        if (!IMAGE.test(n.name) && !VIDEO.test(n.name)) continue;
        if (/\.part\.webm$/.test(n.name)) continue;
        try { const st = fs.statSync(p); items.push({ path: p, name: n.name, kind: VIDEO.test(n.name) ? 'video' : 'shot', size: st.size, mtime: st.mtimeMs }); } catch { /* gone */ }
      }
    };
    for (const s of subs) walk(path.join(root, s), 0);
    items.sort((a, b) => b.mtime - a.mtime);
    return items.slice(0, Math.max(1, Math.min(2000, o.limit || 300)));
  });

  ipcMain.handle('capture:copyImage', async (_e, src) => {
    const img = /^data:/.test(String(src)) ? nativeImage.createFromDataURL(String(src)) : nativeImage.createFromPath(String(src));
    if (img.isEmpty()) throw new Error('Not a picture');
    // older Electron: writeImage; Electron 44's clipboard is the async one (write({ image }))
    if (typeof clipboard.writeImage === 'function') clipboard.writeImage(img);
    else await clipboard.write({ image: img });
    return true;
  });
  ipcMain.handle('capture:trash', async (_e, p) => { await shell.trashItem(String(p)); return true; });

  // ---------- recording: the hub page's own frame through getDisplayMedia ----------
  let armed = null; // { audio, source, until }
  ipcMain.handle('capture:prep', (_e, o = {}) => { armed = { audio: o.audio || 'none', source: o.source || 'frame', until: Date.now() + 8000 }; return true; });
  // The hub's display-media requests: an armed capture gets Hearth itself; anything else keeps what main.js answers
  // (the screen, + the computer's sound on Windows, for the Lab's "System sound"). Set after main.js's own handler.
  function displayHandler(req, cb) {
    const w = getWin();
    // armed only by the hub page itself, a moment before its own getDisplayMedia() call
    const mine = armed && armed.until > Date.now() && w && !w.isDestroyed();
    if (mine) {
      const a = armed; armed = null;
      if (a.source === 'window') {
        desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } }).then((list) => {
          const id = w.getMediaSourceId();
          const src = list.find((s) => s.id === id) || list.find((s) => /Hearth/.test(s.name));
          cb(src ? { video: src, ...(a.audio === 'app' ? { audio: w.webContents.mainFrame } : {}) } : {});
        }).catch(() => cb({}));
        return;
      }
      cb({ video: w.webContents.mainFrame, ...(a.audio === 'app' ? { audio: w.webContents.mainFrame } : a.audio === 'system' && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
      return;
    }
    desktopCapturer.getSources({ types: ['screen'] }).then(([src]) => cb(src ? { video: src, ...(process.platform === 'win32' ? { audio: 'loopback' } : {}) } : {})).catch(() => cb({}));
  }
  app.whenReady().then(() => setImmediate(() => { try { session.defaultSession.setDisplayMediaRequestHandler(displayHandler); } catch (err) { console.error('capture: display handler', err); } }));

  // A recording is written to disk as it comes (a long take never sits in memory).
  const writers = new Map();
  ipcMain.handle('capture:recOpen', (_e, o = {}) => {
    const folder = path.join(dir(), 'recordings');
    const final = uniquePath(folder, safe(o.name) || `Hearth ${stamp()}`, o.ext || 'webm');
    const part = final.replace(/\.(\w+)$/, '.part.$1');
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    writers.set(id, { fd: fs.openSync(part, 'w'), part, final, bytes: 0 });
    return { id, path: final };
  });
  ipcMain.handle('capture:recWrite', (_e, id, bytes) => {
    const wr = writers.get(id);
    if (!wr) return false;
    const b = Buffer.from(bytes);
    fs.writeSync(wr.fd, b);
    wr.bytes += b.length;
    return wr.bytes;
  });
  ipcMain.handle('capture:recClose', (_e, id) => {
    const wr = writers.get(id);
    if (!wr) return null;
    writers.delete(id);
    fs.closeSync(wr.fd);
    if (!wr.bytes) { try { fs.unlinkSync(wr.part); } catch { /* nothing */ } return null; }
    fs.renameSync(wr.part, wr.final);
    return wr.final;
  });
  // MediaRecorder's WebM has no duration and no seek index: remux it (lossless, quick) so players can scrub, and make
  // the MP4 when asked. Without ffmpeg the WebM stays as recorded (it plays; scrubbing may be slow).
  ipcMain.handle('capture:finish', async (_e, o = {}) => {
    FR.setOverrides(ffOverrides());
    const src = String(o.path || '');
    if (!fs.existsSync(src)) throw new Error(`Recording not found: ${src}`);
    const out = { webm: src, ffmpeg: Boolean(FR.tools().ffmpeg) };
    if (!out.ffmpeg) return out;
    const id = o.id || path.basename(src);
    const fixed = src.replace(/\.webm$/i, '.fixed.webm');
    try { await FR.convert(src, fixed); fs.renameSync(fixed, src); } catch (err) { try { fs.unlinkSync(fixed); } catch { /* none */ } out.remuxError = err.message; }
    try { const p = await FR.probe(src); out.duration = p.duration; out.w = p.w; out.h = p.h; out.fps = p.fps; } catch { /* probe is a bonus */ }
    if (o.mp4) {
      const mp4 = src.replace(/\.webm$/i, '.mp4');
      try {
        await FR.convert(src, mp4, { mp4: true, fps: o.fps || null, crf: o.crf || 18, duration: out.duration, onProgress: (pct) => send('capture:progress', { id, pct }) });
        out.mp4 = mp4;
        if (o.keep === false) { await shell.trashItem(src).catch(() => {}); out.webm = null; }
      } catch (err) { out.mp4Error = err.message; }
    }
    return out;
  });

  // ---------- the recording indicator: a tiny window of its own, so it is never in the recorded frame ----------
  let ind = null;
  const IND_HTML = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent;font:600 12px system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;user-select:none;overflow:hidden}
    .pill{display:flex;align-items:center;gap:6px;height:28px;margin:3px;padding:0 6px 0 10px;border-radius:15px;background:rgba(20,16,14,.88);box-shadow:0 2px 10px rgba(0,0,0,.45);-webkit-app-region:drag}
    .dot{width:9px;height:9px;border-radius:50%;background:#ff3b30;animation:b 1.2s ease-in-out infinite}.paused .dot{background:#ffb020;animation:none}
    @keyframes b{50%{opacity:.25}} #t{font-variant-numeric:tabular-nums;min-width:38px} #l{opacity:.7;max-width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    button{-webkit-app-region:no-drag;border:0;border-radius:10px;width:22px;height:20px;background:rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer;padding:0}
    button:hover{background:rgba(255,255,255,.28)}
  </style><div class="pill" id="p"><span class="dot"></span><span id="t">0:00</span><span id="l"></span>
  <button id="pa" title="Pause / resume (Ctrl+Alt+P)">❚❚</button><button id="st" title="Stop (Ctrl+Alt+R)">■</button></div>
  <script>let n=0;const say=(a)=>{document.title=a+':'+(++n)};pa.onclick=()=>say('pause');st.onclick=()=>say('stop');
  window.set=(o)=>{t.textContent=o.time||'0:00';l.textContent=o.label||'';p.classList.toggle('paused',!!o.paused);pa.textContent=o.paused?'▶':'❚❚'};</script>`;
  function placeIndicator() {
    const w = getWin();
    if (!ind || ind.isDestroyed() || !w) return;
    const b = w.getContentBounds();
    ind.setPosition(Math.round(b.x + b.width - 196), Math.round(b.y + 6));
  }
  ipcMain.handle('capture:indicator', async (_e, o = {}) => {
    const w = getWin();
    if (!o.on) { if (ind && !ind.isDestroyed()) ind.destroy(); ind = null; return false; }
    if (!ind || ind.isDestroyed()) {
      ind = new BrowserWindow({ width: 190, height: 34, frame: false, transparent: true, resizable: false, movable: true, minimizable: false, maximizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false, backgroundColor: '#00000000', webPreferences: { sandbox: true, contextIsolation: true } });
      // left out of the OS's own screen recordings and screenshots too (macOS / Windows)
      try { ind.setContentProtection(true); } catch { /* not on every platform */ }
      ind.setAlwaysOnTop(true, 'screen-saver');
      ind.webContents.on('page-title-updated', (_ev, title) => { const action = String(title).split(':')[0]; if (action === 'stop' || action === 'pause') send('capture:indicator', { action }); });
      await ind.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(IND_HTML)}`);
      placeIndicator();
      ind.showInactive();
      if (w) { w.on('move', placeIndicator); w.on('resize', placeIndicator); ind.once('closed', () => { if (!w.isDestroyed()) { w.off('move', placeIndicator); w.off('resize', placeIndicator); } }); }
    }
    try { await ind.webContents.executeJavaScript(`window.set(${JSON.stringify({ time: String(o.time || ''), label: String(o.label || '').slice(0, 20), paused: Boolean(o.paused) })})`); } catch { /* closing */ }
    return true;
  });

  // Drag a capture out of Hearth as a real file: into a chat (it attaches), the board, Finder / Explorer, an editor.
  ipcMain.on('capture:drag', (e, p) => {
    const file = String(p || '');
    if (!fs.existsSync(file)) return;
    let icon = IMAGE.test(file) ? nativeImage.createFromPath(file) : nativeImage.createEmpty();
    if (!icon.isEmpty()) icon = icon.resize({ width: 96 });
    else { try { icon = nativeImage.createFromPath(path.join(DATA_DIR, 'hearth-icon.png')).resize({ width: 48 }); } catch { /* below */ } }
    if (icon.isEmpty()) icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGP436PxnxLMMGrAqAGjBgwXAwAYNrIfHzn2lAAAAABJRU5ErkJggg==');
    e.sender.startDrag({ file, icon });
  });
  // Tours: the window's content at an exact size (1920×1080 for a clean 16:9 recording), and back.
  ipcMain.handle('capture:windowSize', (_e, o = {}) => {
    const w = getWin();
    if (!w) return null;
    const [cw, ch] = w.getContentSize();
    if (o.width && o.height) {
      if (w.isMaximized()) w.unmaximize();
      if (w.isFullScreen()) w.setFullScreen(false);
      w.setContentSize(Math.round(o.width), Math.round(o.height));
    }
    const [nw, nh] = w.getContentSize();
    return { before: { width: cw, height: ch }, now: { width: nw, height: nh } };
  });

  // ---------- frame reader ----------
  const OPS = { probe: (f) => FR.probe(f), times: (f) => FR.frameTimes(f), locate: (f, a) => FR.locate(f, a), at: (f, a, o) => FR.frameAt(f, a, o), frames: (f, a, o) => FR.frames(f, a, o), every: (f, a, o) => FR.every(f, a, o), spread: (f, a, o) => FR.spread(f, a, o), scenes: (f, a, o) => FR.scenes(f, a, o), motion: (f, a) => FR.motion(f, a), analyze: (f, a) => FR.analyze(f, a), sheet: (f, a, o) => FR.sheet(f, a, o) };
  ipcMain.handle('capture:frames', async (_e, op, file, args = {}, opts = {}) => {
    FR.setOverrides(ffOverrides());
    const fn = OPS[op];
    if (!fn) throw new Error(`Unknown frame op: ${op}`);
    try {
      return { ok: true, value: await fn(String(file), args || {}, { dir: path.join(dir(), op === 'sheet' ? 'sheets' : 'frames'), ...(opts || {}) }) };
    } catch (err) { return { ok: false, error: err.message, code: err.code || null }; }
  });

  // ---------- keys that must work wherever the keyboard is (the Lab's sandboxed frame, a video) ----------
  const KEYS = { s: 'menu', a: 'region', r: 'record', p: 'pause', v: 'library', t: 'tour' };
  app.on('browser-window-created', (_e, created) => setImmediate(() => {
    if (created !== getWin()) return;
    created.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const mod = input.control || (process.platform === 'darwin' && input.meta);
      const k = String(input.code || '').replace(/^Key/, '').toLowerCase(); // the key's place: ⌥S types ß on a Mac
      if (mod && input.alt && !input.shift && KEYS[k]) { event.preventDefault(); send('capture:key', { key: KEYS[k] }); }
    });
  }));
}

module.exports = { register };
