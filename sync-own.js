// (round 99, kvrename99) Hearth's own files and sync's renames. Pure (no files, no Electron): used by sync-engine.js,
// syncmain.js and dev/kvrename99-test.js.
//
// Some files in the data folder are found by Hearth BY THEIR NAME: a kv store's name is the app's id for it
// (kv/board-<id>.json, kv/projects.json), a chat is chats/<id>.json and its deleted copy trash/<id>.json, a show's
// listings are showsync/<name>.json, a template is templates/<id>/… Renamed, the app never reads them again: projects,
// boards, Lab presets or settings would seem to vanish. Links don't help: nothing points at them, the name IS the link.
// The owner's own files (captures, attachments, renders, the workspace, refs, photos…) are found through links that
// "Rename for Windows" follows (sync-engine.js relink), so those can still be renamed.
//
//   appNamed(rel)            a file Hearth finds by its name: never renamed by sync, never offered "Rename for Windows"
//   followMove(from, to, o)  a rename that arrived from the other computer (a delete + the same bytes under another
//                            name): may this computer follow it? Not when it would take a Hearth-named file away from its
//                            name (an older Hearth's "Rename for Windows"), except the app's own moves: a chat to its
//                            Deleted copy (trash/) and back, anything into trash/, and a case-only change on a disk that
//                            ignores case (the same file there: the app still opens it)
//   winBlock(rel, bad, o)    a name a Windows PC can't hold (sync-hard.js winBad) → what the sync panel says: an owner's
//                            file keeps its code (Rename for Windows); a Hearth-named one gets 'win-long-app' (the
//                            folder path on the PC is too long: shorten the folder, never the name) or 'win-name-app'
//   rootLen(dataDir, cloudRoot)   how much of a Windows path this computer's folders take (as sync-engine winRootLen)
//   record(blocked)          what this computer's machine record says about Hearth-named files it holds back for a PC
//                            ({ winLong: { n, over, sample } } or {}): the PC shows "folder path too long" from it
//   longHere(o)              on a Windows PC: Hearth-named files too long for this PC's own folders (its own, the
//                            cloud's, and what the other computer holds back) → { n, over, sample, data, cloud, which }
//                            or null. which: 'data' | 'cloud', the folder that is longer (the one to move)
//   REFUSE                   the words fix(rel, 'rename') answers for a Hearth-named file
'use strict';
const Hard = require('./sync-hard');

// folders whose JSON files Hearth finds by name (a fixed name or an id): kv stores, chats and their deleted copies, the
// tickets' index, show listings, the sound bank's index, the quest guide's session, prompts, the safety net, reminders
const APP_JSON_DIRS = /^(?:kv|chats|trash|tickets|showsync|creative-vst|quest-guide|prompts|safetynet|leavesoon|bugbutton|deploy|interop)\//i;
// folders Hearth finds whole by an id (a template: its folder's files are named in its template.json, relative)
const APP_DIRS = /^(?:templates|sync|app|\.sync)\//i;
function appNamed(rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!r) return false;
  if (!r.includes('/')) return true; // the data folder's own files (memory.json, usage.json, web-history.json…)
  if (APP_DIRS.test(r)) return true;
  if (/^kv\//i.test(r)) return true; // every kv store, whatever its extension
  if (/^(?:chats|trash)\/[^/]+$/i.test(r)) return true; // a chat, a deleted chat (restored by its id)
  return APP_JSON_DIRS.test(r) && /\.json$/i.test(r);
}
const fold = (s) => String(s).normalize('NFC').toLowerCase();
// o: { ci: the disk ignores case (Mac, Windows) }
function followMove(from, to, o = {}) {
  if (!appNamed(from)) return true;
  const f = String(from); const t = String(to);
  if (o.ci !== false && fold(f) === fold(t)) return true; // the same file on a Mac / PC disk: the app still opens it
  if (/^trash\//i.test(t)) return true; // the app's delete (a chat to its Deleted copy, a ticket to Hearth's trash)
  const chat = /^(?:chats|trash)\/([^/]+)$/i;
  const a = chat.exec(f); const b = chat.exec(t);
  if (a && b && a[1] === b[1]) return true; // a deleted chat restored (trash/<id>.json → chats/<id>.json)
  return false;
}
// bad: Hard.winBad(rel, …) (not null) → { why, fix, app }
function winBlock(rel, bad) {
  if (!bad) return null;
  if (!appNamed(rel)) return { why: bad.why, fix: Hard.BLOCK[bad.why]?.fix ?? null, app: false };
  return bad.why === 'win-long' ? { why: 'win-long-app', fix: null, app: true, over: bad.over || 0 } : { why: 'win-name-app', fix: null, app: true };
}
const rootLen = (dataDir, cloudRoot) => Math.max(String(dataDir || '').length, cloudRoot ? String(cloudRoot).length + 14 : 0);
// blocked: the engine's status.blocked ([{ rel, why, over? }])
function record(blocked) {
  const l = (blocked || []).filter((b) => b.why === 'win-long-app');
  if (!l.length) return {};
  return { winLong: { n: l.length, over: Math.max(0, ...l.map((b) => b.over || 0)), sample: l.slice(0, 3).map((b) => b.rel) } };
}
// o: { dataDir, cloudRoot, rels: iterables of data-folder paths, peers: machine records (winLong) }
function longHere(o = {}) {
  const data = String(o.dataDir || '').length; const cloud = o.cloudRoot ? String(o.cloudRoot).length + 14 : 0;
  const len = Math.max(data, cloud);
  const room = Hard.WIN_MAX - len - 1;
  let n = 0; let over = 0; const sample = [];
  const seen = new Set(); let by = '';
  for (const it of o.rels || []) {
    for (const rel of it || []) {
      if (rel.length <= room || seen.has(rel) || !appNamed(rel)) continue; // (most names fit: one comparison each, 100,000 names at 50,000 files)
      seen.add(rel);
      const bad = Hard.winBad(rel, { rootLen: len });
      if (!bad || bad.why !== 'win-long') continue;
      n += 1; over = Math.max(over, bad.over || 0); if (sample.length < 3) sample.push(rel);
    }
  }
  for (const p of o.peers || []) {
    const w = p && p.winLong;
    if (!w || !(w.n > 0)) continue;
    n += Number(w.n) || 0; over = Math.max(over, Number(w.over) || 0);
    for (const s of w.sample || []) if (sample.length < 3 && !sample.includes(s)) sample.push(String(s));
    if (!by) by = String(p.name || '');
  }
  if (!n) return null;
  return { n, over, sample, data, cloud, which: data >= cloud ? 'data' : 'cloud', ...(by ? { by } : {}) };
}
const REFUSE = 'This is one of Hearth\'s own files: Hearth finds it by this name, so it is never renamed. The folder path on the PC is what is too long: move Hearth\'s folder (or the cloud folder) there somewhere shorter.';

module.exports = { appNamed, followMove, winBlock, rootLen, record, longHere, REFUSE };
