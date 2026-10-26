// (round 66, bouncelog66) Session log, the main-process side (docs/upgrades/bouncelog66.md).
// Where a session's files go: <Hearth data>/creative-sketches/<the Sound desk project>/
//   · "Sketch 2026-10-26 14.05.33.wav"  the last 30 s of the desk, written by the instrument host ('sketch-save' in
//     creative-vst-sketch.py) at the path made HERE (creative-vstmain.js asks sketchPath; the window never names one)
//   · "Session 2026-10-26 14.05.33.txt" a session's few lines, written when it is logged to a quest without a sketch
//     (Codex's proof contract needs a file)
// Nothing is uploaded; nothing is written until the owner clicks. Removing a session's sketch goes to the Trash
// (the window calls hub.fs.trash).
const fs = require('fs');
const path = require('path');

const safe = (name, fallback) => String(name || fallback).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || fallback;
const folder = (dataDir, project) => path.join(dataDir, 'creative-sketches', safe(project, 'Sound desk'));
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}
// a new sketch's path (never an existing file: a second save in the same second gets " 2")
function sketchPath(dataDir, project, now = new Date()) {
  const dir = folder(dataDir, project); fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, `Sketch ${stamp(now)}.wav`);
  for (let i = 2; fs.existsSync(file) && i < 100; i++) file = path.join(dir, `Sketch ${stamp(now)} ${i}.wav`);
  return file;
}
// a session's note (plain text, ≤ 4 kB), written atomically (.part, then renamed)
function writeNote(dataDir, project, text, now = new Date()) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw Error('Invalid session note.');
  const dir = folder(dataDir, project); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `Session ${stamp(now)}.txt`), tmp = file + '.part';
  fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, file);
  return file;
}
// a path the window hands back (to trash a sketch) must be one of ours
function isOurs(dataDir, file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.(wav|txt)$/i.test(file)) return false;
  const root = path.join(path.resolve(dataDir), 'creative-sketches') + path.sep, real = path.resolve(file);
  return real.toLowerCase().startsWith(root.toLowerCase()) && !real.split(path.sep).includes('..');
}
function register(ipcMain, { dataDir }) {
  ipcMain.handle('bouncelog:note', (e, project, text) => { try { return { ok: true, path: writeNote(dataDir, project, text) }; } catch (err) { return { ok: false, error: err.message }; } });
  ipcMain.handle('bouncelog:folder', (e, project) => ({ ok: true, path: folder(dataDir, project) }));
  ipcMain.handle('bouncelog:ours', (e, file) => isOurs(dataDir, file));
}
module.exports = { register, sketchPath, writeNote, folder, isOurs, stamp, safe };
