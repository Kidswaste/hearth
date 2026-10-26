// (round 67, sketchpads67) Sketches → playable material, the main-process side (docs/upgrades/sketchpads67.md).
// A loop trimmed from a session's sketch (Sessions › ✂ Trim loop › Save loop) is a NEW file beside the sketch:
//   <Hearth data>/creative-sketches/<project>/Sketch 2026-10-26 14.05.33 loop 4 bars 120 BPM.wav   (48 kHz, 16-bit)
//   … and its card, "… BPM.json": the shape of a park take ({ v, loop, bpm, bars, beats, place, sketch, at }) plus
//   kind 'sketch-loop' and `from` (the sketch), so Arrange (loopsong63), the Live set's shelf (liveset64) and the weekend
//   plan find it through creative-vstmain's parkList (one additive line there).
// The sketch itself is only read, never changed. Nothing is ever overwritten (" 2", " 3"… when a name is taken); files
// are written whole (.part, then renamed). Removing a loop goes to the Trash (the window calls hub.fs.trash after
// asking `ours` here).
const fs = require('fs');
const path = require('path');
const { isOurs } = require('./bouncelogmain.js');

const ROOT = (dataDir) => path.join(path.resolve(dataDir), 'creative-sketches');
const num = (v, a, b) => (Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b ? Number(v) : null);
// a 16-bit PCM WAV at 48 kHz, 1–2 channels, with audio in it (what the window encodes; anything else is refused)
function wavInfo(buf) {
  if (!buf || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let o = 12, fmt = null, data = 0;
  while (o + 8 <= buf.length) { const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4); if (id === 'fmt ') fmt = o + 8; if (id === 'data') { data = Math.min(size, buf.length - o - 8); break; } o += 8 + size + (size & 1); }
  if (!fmt || !data) return null;
  const format = buf.readUInt16LE(fmt), channels = buf.readUInt16LE(fmt + 2), rate = buf.readUInt32LE(fmt + 4), bits = buf.readUInt16LE(fmt + 14);
  return { format, channels, rate, bits, frames: Math.floor(data / (channels * bits / 8)) };
}
// the loop's own name: the window proposes it (SketchPadsCore.loopName), main keeps it plain and never takes an existing one
function freeName(dir, name) {
  const plain = String(name || '').normalize('NFC').replace(/[^\w .·,-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.wav$/i, '').slice(0, 120) || 'Sketch loop';
  let file = path.join(dir, `${plain}.wav`);
  for (let i = 2; (fs.existsSync(file) || fs.existsSync(file.replace(/\.wav$/i, '.json'))) && i < 200; i++) file = path.join(dir, `${plain} ${i}.wav`);
  if (fs.existsSync(file)) throw Error('Too many loops with that name already.');
  return file;
}
/** Save a loop beside its sketch. sketch: the sketch's path (must be one of ours and exist); bytes: the loop as a 16-bit
 *  48 kHz WAV; meta: { name, bpm, bars, beats, start, project }. → { path, take } */
function saveLoop(dataDir, sketch, bytes, meta = {}) {
  if (!isOurs(dataDir, sketch) || !/\.wav$/i.test(sketch) || !fs.existsSync(sketch)) throw Error('That sketch is not in your sketches folder any more.');
  const data = Buffer.isBuffer(bytes) ? bytes : bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null;
  if (!data || data.length > 80e6) throw Error('Invalid loop file.');
  const w = wavInfo(data);
  if (!w || w.format !== 1 || w.bits !== 16 || w.rate !== 48000 || w.channels < 1 || w.channels > 2 || w.frames < 4800) throw Error('A loop is a 16-bit 48 kHz WAV of at least 0.1 s.');
  const bpm = num(meta.bpm, 40, 240), bars = num(meta.bars, 1, 256), beats = num(meta.beats ?? 4, 2, 7), start = num(meta.start ?? 0, 0, 3600);
  if (!bpm || !Number.isInteger(bars) || !Number.isInteger(beats) || start == null) throw Error('A loop needs its tempo and a whole number of bars.');
  const dir = path.dirname(path.resolve(sketch)), file = freeName(dir, meta.name), card = file.replace(/\.wav$/i, '.json');
  const take = { v: 1, kind: 'sketch-loop', id: 'sketchloop-' + Date.now().toString(36), at: new Date().toISOString(), loop: file, from: path.resolve(sketch), start: Math.round(start * 1000) / 1000,
    bpm, bars, beats, seconds: Math.round(w.frames / 48 * 10) / 10000, place: 'Sketch loop', sketch: String(meta.project || path.basename(dir)).slice(0, 160), notes: 0 };
  const tmp = file + '.part'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
  fs.writeFileSync(card + '.part', JSON.stringify(take, null, 1)); fs.renameSync(card + '.part', card);
  return { path: file, take };
}
// a loop's card, read carefully (datasafe-core: a locked / half-synced file is retried): one that can't be read now is
// just not listed this time; cards are never rewritten, so nothing is ever saved over one
function readCard(file) {
  const r = require('./datasafe-core').load(fs, file, null, { prev: false }), j = r.state === 'ok' ? r.value : null;
  return j?.v === 1 && j.kind === 'sketch-loop' && typeof j.loop === 'string' && j.bpm && j.bars && fs.existsSync(j.loop) ? { ...j, notesFile: file } : null;
}
/** Every loop trimmed from one sketch (newest first). */
function loopsOf(dataDir, sketch) {
  if (!isOurs(dataDir, sketch)) return [];
  const dir = path.dirname(path.resolve(sketch)), out = [];
  let names = []; try { names = fs.readdirSync(dir); } catch { return out; }
  for (const n of names) { if (!/ BPM( \d+)?\.json$/i.test(n)) continue; const t = readCard(path.join(dir, n)); if (t && path.resolve(t.from) === path.resolve(sketch)) out.push(t); }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
/** Every sketch loop in every project, as park-take-shaped entries (creative-vstmain's parkList adds them). */
function loopTakes(dataDir, max = 200) {
  const root = ROOT(dataDir), out = [];
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return out; }
  for (const d of dirs) {
    let names = []; try { names = fs.readdirSync(path.join(root, d.name)); } catch { continue; }
    for (const n of names) { if (out.length >= max) return out; if (!/ BPM( \d+)?\.json$/i.test(n)) continue; const t = readCard(path.join(root, d.name, n)); if (t) out.push({ ...t, folder: d.name }); }
  }
  return out;
}
// a loop the window wants to trash: one of ours, and its card goes with it
function trashList(dataDir, file) {
  if (!isOurs(dataDir, file) || !/ BPM( \d+)?\.wav$/i.test(file)) return null;
  const card = file.replace(/\.wav$/i, '.json'); return fs.existsSync(card) ? [file, card] : [file];
}
function register(ipcMain, { dataDir }) {
  ipcMain.handle('sketchpads:save-loop', (e, sketch, bytes, meta) => { try { return { ok: true, ...saveLoop(dataDir, sketch, bytes, meta) }; } catch (err) { return { ok: false, error: err.message }; } });
  ipcMain.handle('sketchpads:loops', (e, sketch) => ({ ok: true, loops: loopsOf(dataDir, sketch) }));
  ipcMain.handle('sketchpads:trash-list', (e, file) => trashList(dataDir, file));
}
module.exports = { register, saveLoop, loopsOf, loopTakes, trashList, wavInfo, freeName };
