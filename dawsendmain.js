// (round 69, stems69) 📤 Send to my DAW, the main-process side (docs/upgrades/stems69.md).
// The window works out the audio (tools/dawsend.js + tools/dawsend-core.js) and hands it over in pieces; this writes
// the folder the owner chose:
//   <chosen place>/<song> — stems 2026-10-26/        (" 2", " 3"… when that name is taken: nothing is ever written over)
//     00 Mix - 124 BPM - A minor.wav, 01 <part> - 124 BPM - A minor.wav / .mid, Presets/…, README.txt
// While it's being written it is "<name>.part" (a folder of its own, made here); Finish renames it, Cancel removes that
// staging folder and only it. Files are created with 'wx' (never over an existing one), WAVs get their full header first
// and are checked to be exactly the promised size at the end. Preset files are COPIED (the original is only read);
// a preset kept in the Sound desk's bank (its state) is written out as a .vital when it is Vital's JSON preset.
// Nothing is uploaded anywhere; nothing outside the staging folder is ever written or removed.
const fs = require('fs');
const path = require('path');

const PRESET_EXT = /\.(vital|serumpreset|fxp|fxb|vstpreset)$/i;
const jobs = new Map(); // id → { final, part, open: Map(name → { fd, want, wrote }), files: [] }
const plain = (name) => { const s = String(name || ''); if (!s || s.length > 200 || /[\\/]/.test(s) || s === '.' || s === '..' || /[<>:"|?*\u0000-\u001f]/.test(s)) throw Error('Not a plain file name: ' + s.slice(0, 60)); return s; };
// a file inside the job's staging folder: "<name>" or "Presets/<name>" (the only sub-folder)
function target(job, name, { ext }) {
  const [a, b] = String(name || '').split('/');
  const rel = b === undefined ? [plain(a)] : a === 'Presets' ? ['Presets', plain(b)] : null;
  if (!rel || !ext.test(rel.at(-1))) throw Error('Not a file Send to my DAW writes: ' + String(name).slice(0, 60));
  const file = path.join(job.part, ...rel); fs.mkdirSync(path.dirname(file), { recursive: true }); return file;
}
function free(base) { let p = base; for (let i = 2; fs.existsSync(p) || fs.existsSync(p + '.part'); i++) { if (i > 500) throw Error('Too many folders with that name already.'); p = `${base} ${i}`; } return p; }
const jobOf = (id) => { const j = jobs.get(String(id)); if (!j) throw Error('That export is over (finished or cancelled).'); return j; };
const buf = (bytes) => (Buffer.isBuffer(bytes) ? bytes : bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : Array.isArray(bytes) ? Buffer.from(bytes) : typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : null);

/** A new export: the folder's final name is taken now (free), its contents go to "<final>.part" until finish(). */
function begin(dest, name) {
  const dir = path.resolve(String(dest || ''));
  if (!path.isAbsolute(String(dest || '')) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw Error('Choose a folder that exists (Change… in the panel).');
  const base = plain(String(name || '').trim().replace(/[. ]+$/, '') || 'Song — stems');
  const final = free(path.join(dir, base)), part = final + '.part';
  fs.mkdirSync(part);
  const id = 'daw-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  jobs.set(id, { id, final, part, open: new Map(), files: [] });
  return { job: id, folder: final, name: path.basename(final) };
}
/** A WAV: its header now (the whole size promised), then write() pieces, then close() checks the size. */
function open(id, name, header, total) {
  const j = jobOf(id), file = target(j, name, { ext: /\.wav$/i }), h = buf(header);
  if (!h || h.length !== 44 || h.toString('ascii', 0, 4) !== 'RIFF') throw Error('Bad WAV header.');
  const fd = fs.openSync(file, 'wx'); fs.writeSync(fd, h);
  j.open.set(name, { fd, file, want: 44 + Number(total || 0), wrote: 44 });
  return { ok: true };
}
function write(id, name, bytes) {
  const j = jobOf(id), f = j.open.get(name), b = buf(bytes); if (!f || !b) throw Error('That file is not open.');
  if (f.wrote + b.length > f.want) throw Error('More audio than the header promised.');
  fs.writeSync(f.fd, b); f.wrote += b.length; return { ok: true, wrote: f.wrote };
}
function close(id, name) {
  const j = jobOf(id), f = j.open.get(name); if (!f) throw Error('That file is not open.');
  try { fs.fsyncSync(f.fd); } catch { /* a drive that can't fsync */ } fs.closeSync(f.fd); j.open.delete(name);
  if (f.wrote !== f.want) throw Error(`${name} is ${f.wrote} bytes, not ${f.want}.`);
  j.files.push(name); return { ok: true, bytes: f.wrote };
}
/** A small whole file (MIDI, README, a preset from the bank). */
function put(id, name, bytes) {
  const j = jobOf(id), file = target(j, name, { ext: /\.(mid|txt|vital)$/i }), b = buf(bytes); if (!b || b.length > 64e6) throw Error('Bad file.');
  fs.writeFileSync(file, b, { flag: 'wx' }); j.files.push(name); return { ok: true, bytes: b.length };
}
/** A preset file copied as it is (read only; a preset file type, at most 16 MB). */
function copy(id, src, name) {
  const j = jobOf(id), from = path.resolve(String(src || ''));
  if (!PRESET_EXT.test(from) || !fs.existsSync(from) || !fs.statSync(from).isFile() || fs.statSync(from).size > 16e6) throw Error('Not a preset file: ' + path.basename(from));
  const file = target(j, name, { ext: PRESET_EXT });
  fs.copyFileSync(from, file, fs.constants.COPYFILE_EXCL); j.files.push(name); return { ok: true };
}
/** A preset from the Sound desk's bank (its state, 'z1:' + base64(zlib) or base64): written as a .vital when it is
 *  Vital's JSON preset; anything else can't be made into a file the plugin opens, so it is skipped (the README says so). */
function state(id, name, st) {
  const { decodeState } = require('./soundbankmain.js'), raw = typeof st === 'string' && st.length < 24e6 ? decodeState(st) : null;
  if (!raw) return { ok: false, error: 'unreadable state' };
  const text = raw.toString('utf8').replace(/\0+$/, ''); let json = null; try { json = text[0] === '{' ? JSON.parse(text) : null; } catch { json = null; }
  if (!json || !/\.vital$/i.test(name)) return { ok: false, error: 'not a Vital preset' };
  return put(id, name, Buffer.from(text, 'utf8'));
}
function finish(id) {
  const j = jobOf(id); for (const n of [...j.open.keys()]) { try { fs.closeSync(j.open.get(n).fd); } catch { /* closed */ } }
  if (j.open.size) { j.open.clear(); throw Error('A file was still being written.'); }
  let final = j.final; if (fs.existsSync(final)) final = free(final); // made meanwhile by someone else: the next free name
  fs.renameSync(j.part, final); jobs.delete(id);
  return { ok: true, folder: final, files: j.files.slice() };
}
/** Stop: the staging folder (made by begin, holding only what this export wrote) is removed; nothing else is touched. */
function cancel(id) {
  const j = jobs.get(String(id)); if (!j) return { ok: true, gone: false };
  for (const f of j.open.values()) { try { fs.closeSync(f.fd); } catch { /* closed */ } }
  jobs.delete(String(id));
  if (path.basename(j.part).endsWith('.part')) fs.rmSync(j.part, { recursive: true, force: true });
  return { ok: true, gone: true };
}
function defaultDir(app) {
  for (const k of ['music', 'documents', 'desktop', 'home']) { try { const p = app?.getPath?.(k); if (p && fs.existsSync(p)) return p; } catch { /* not on this system */ } }
  return require('os').homedir();
}
function register(ipcMain, { app } = {}) {
  const wrap = (fn) => async (e, ...a) => { try { return { ok: true, ...(await fn(...a)) }; } catch (err) { return { ok: false, error: err.message }; } };
  ipcMain.handle('dawsend:begin', wrap((dest, name) => begin(dest, name)));
  ipcMain.handle('dawsend:open', wrap((id, name, header, total) => open(id, name, header, total)));
  ipcMain.handle('dawsend:write', wrap((id, name, bytes) => write(id, name, bytes)));
  ipcMain.handle('dawsend:close', wrap((id, name) => close(id, name)));
  ipcMain.handle('dawsend:put', wrap((id, name, bytes) => put(id, name, bytes)));
  ipcMain.handle('dawsend:copy', wrap((id, src, name) => copy(id, src, name)));
  ipcMain.handle('dawsend:state', wrap((id, name, st) => state(id, name, st)));
  ipcMain.handle('dawsend:finish', wrap((id) => finish(id)));
  ipcMain.handle('dawsend:cancel', wrap((id) => cancel(id)));
  ipcMain.handle('dawsend:default-dir', wrap(() => ({ path: defaultDir(app) })));
}
module.exports = { register, begin, open, write, close, put, copy, state, finish, cancel, defaultDir, _jobs: jobs };
