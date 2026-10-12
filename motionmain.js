// Camera / body tracking's files (round 25, "motion"; the renderer side is tools/three-motion-in*.js).
// MediaPipe Tasks (Google's on-device hand / pose / face trackers and the selfie segmenter) run in the Lab preview,
// on this computer. Their library and models are downloaded ONCE, from pinned versions, into <data>/motion/<version>,
// only after the owner says yes (the renderer asks first and shows the size). Nothing else is ever sent anywhere:
// no picture, no number leaves the computer.
//   motion:status    which files are here, what's missing, the sizes
//   motion:download  the missing ones (progress: 'motion:progress'), motion:cancel stops it
//   motion:read      the files as bytes (the renderer hands them to the preview's tracking Worker)
//   motion:remove    the files go (the space comes back)
//   motion:camera    macOS: asks for the camera (the system prompt); elsewhere 'granted'
// HEARTH_MOTION_FILES=<folder> copies the files from that folder instead (offline installs, the checks).
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = 'tasks-vision-0.10.14';
const NPM = '@mediapipe/tasks-vision@0.10.14';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';
// id, file name, size (bytes, as published), where from (the first that answers wins)
const FILES = [
  { id: 'bundle', name: 'vision_bundle.cjs', size: 137025, urls: [`https://cdn.jsdelivr.net/npm/${NPM}/vision_bundle.cjs`, `https://unpkg.com/${NPM}/vision_bundle.cjs`] },
  { id: 'loader', name: 'vision_wasm_internal.js', size: 209826, urls: [`https://cdn.jsdelivr.net/npm/${NPM}/wasm/vision_wasm_internal.js`, `https://unpkg.com/${NPM}/wasm/vision_wasm_internal.js`] },
  { id: 'wasm', name: 'vision_wasm_internal.wasm', size: 9423986, urls: [`https://cdn.jsdelivr.net/npm/${NPM}/wasm/vision_wasm_internal.wasm`, `https://unpkg.com/${NPM}/wasm/vision_wasm_internal.wasm`] },
  { id: 'hands', name: 'hand_landmarker.task', size: 7819105, urls: [`${MODELS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`] },
  { id: 'pose', name: 'pose_landmarker_lite.task', size: 5777746, urls: [`${MODELS}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`] },
  { id: 'face', name: 'face_landmarker.task', size: 3758596, urls: [`${MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`] },
  { id: 'mask', name: 'selfie_segmenter.tflite', size: 249537, urls: [`${MODELS}/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`] },
];
const BASE = ['bundle', 'loader', 'wasm'];

// dataDir, base(file) → a URL (tests), fetch (tests: Node's; the app: Electron's net.fetch, which uses the system proxy)
function api({ dataDir, base = null, fetch: fetchFn = null } = {}) {
  const dir = path.join(dataDir || os.tmpdir(), 'motion', VERSION);
  const at = (f) => path.join(dir, f.name);
  const okFile = (f) => { try { const s = fs.statSync(at(f)); return s.isFile() && s.size > 0; } catch { return false; } };
  let ctl = null;
  const doFetch = () => fetchFn || (() => { try { return require('electron').net.fetch; } catch { return globalThis.fetch; } })();
  function status() {
    const have = FILES.filter(okFile).map((f) => f.id);
    const missing = FILES.filter((f) => !have.includes(f.id));
    return { dir, version: VERSION, have, missing: missing.map((f) => f.id), bytes: missing.reduce((s, f) => s + f.size, 0), total: FILES.reduce((s, f) => s + f.size, 0), ready: BASE.every((id) => have.includes(id)) && have.length > BASE.length, sizes: Object.fromEntries(FILES.map((f) => [f.id, f.size])), downloading: Boolean(ctl) };
  }
  async function fetchTo(f, signal, onBytes) {
    const tmp = `${at(f)}.part`;
    let lastErr = null;
    for (const url of base ? [base(f)] : f.urls) {
      try {
        const res = await doFetch()(url, { signal });
        if (!res.ok) throw new Error(`${url.split('/')[2]} answered ${res.status}`);
        const out = fs.createWriteStream(tmp); let got = 0;
        try {
          const rd = res.body.getReader();
          for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r)); onBytes(got); }
          await new Promise((r, j) => out.end((err) => (err ? j(err) : r())));
        } catch (err) { out.destroy(); throw err; }
        fs.renameSync(tmp, at(f));
        return got;
      } catch (err) { fs.rmSync(tmp, { force: true }); lastErr = err; if (signal.aborted) break; }
    }
    throw lastErr || new Error('no source');
  }
  // only: ids (the base files always come too); onProgress({ got, total, file })
  async function download({ only = null, onProgress = () => {} } = {}) {
    if (ctl) return { ok: false, error: 'already downloading' };
    fs.mkdirSync(dir, { recursive: true });
    const want = FILES.filter((f) => !okFile(f) && (!only || BASE.includes(f.id) || only.includes(f.id)));
    const total = want.reduce((s, f) => s + f.size, 0); let done = 0; let last = 0;
    ctl = new AbortController();
    try {
      const local = process.env.HEARTH_MOTION_FILES;
      for (const f of want) {
        if (local) { fs.copyFileSync(path.join(local, f.name), at(f)); done += f.size; onProgress({ got: done, total, file: f.name }); continue; }
        const n = await fetchTo(f, ctl.signal, (got) => { const now = Date.now(); if (now - last > 150) { last = now; onProgress({ got: done + got, total, file: f.name }); } });
        done += n;
      }
      onProgress({ got: done, total, file: '' });
      return { ok: true, ...status() };
    } catch (err) {
      return { ok: false, error: ctl.signal.aborted ? 'cancelled' : err.message };
    } finally { ctl = null; }
  }
  const cancel = () => { if (!ctl) return false; ctl.abort(); return true; };
  // ids → { id: Buffer } (missing ones left out)
  function read(ids = FILES.map((f) => f.id)) {
    const out = {};
    for (const f of FILES) if (ids.includes(f.id) && okFile(f)) out[f.id] = fs.readFileSync(at(f));
    return out;
  }
  function remove() { cancel(); fs.rmSync(dir, { recursive: true, force: true }); return { ok: true }; }
  return { dir, status, download, cancel, read, remove };
}

function register(ipcMain, getWin, { dataDir } = {}) {
  const A = api({ dataDir });
  const toWin = (m) => { try { getWin()?.webContents.send('motion:progress', m); } catch { /* window gone */ } };
  ipcMain.handle('motion:status', () => A.status());
  ipcMain.handle('motion:download', (_e, o = {}) => A.download({ only: o.only || null, onProgress: toWin }));
  ipcMain.handle('motion:cancel', () => A.cancel());
  ipcMain.handle('motion:read', (_e, ids) => A.read(ids || undefined));
  ipcMain.handle('motion:remove', () => A.remove());
  ipcMain.handle('motion:camera', async () => {
    if (process.platform !== 'darwin') return 'granted';
    try {
      const { systemPreferences } = require('electron');
      const s = systemPreferences.getMediaAccessStatus('camera');
      if (s === 'granted') return s;
      return (await systemPreferences.askForMediaAccess('camera')) ? 'granted' : 'denied';
    } catch { return 'unknown'; }
  });
  return A;
}

module.exports = { register, api, FILES, VERSION, BASE };
