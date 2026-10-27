// (round 73, syncmedia73) Free up space: ask the cloud drive itself to make a file in ITS folder online-only (the file
// stays in the cloud and on the other computer; it downloads again if something reads it). Main process, no Electron.
//   Windows (Files On-Demand: OneDrive, iCloud for Windows, Dropbox): attrib -P +U, then its attributes must say so
//   Mac: iCloud Drive → brctl evict; drives under ~/Library/CloudStorage (OneDrive, Dropbox, Google Drive) →
//        fileproviderctl evict; then the file must have no blocks on the disk (or be an iCloud stub)
// Anything else (a plain synced folder, Linux, Google Drive's G: drive) says so plainly instead of pretending. Used by
// syncmain.js (engine option evict) only when the owner clicks "Make them online-only" after seeing the list.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PINNED = 0x80000; const UNPINNED = 0x100000; const RECALL = 0x400000; const OFFLINE = 0x1000;
// can this drive do it, before anything is tried (the panel says why not, in words)
function support({ platform = process.platform, provider = '', root = '' } = {}) {
  const p = String(provider || '');
  if (platform === 'win32') {
    if (p === 'gdrive') return { ok: false, why: 'Google Drive on Windows doesn\'t let other apps make its files online-only. Its own menu can (right-click a file in Google Drive → Offline access).' };
    if (['onedrive', 'icloud', 'dropbox'].includes(p)) return { ok: true, how: 'Files On-Demand' };
    return { ok: false, why: 'This sync folder isn\'t a cloud drive with online-only files (Files On-Demand), so there is nothing Hearth can free here.' };
  }
  if (platform === 'darwin') {
    if (p === 'icloud') return { ok: true, how: 'iCloud Drive' };
    if (/[\\/]Library[\\/]CloudStorage[\\/]/.test(String(root))) return { ok: true, how: 'your cloud drive' };
    return { ok: false, why: 'This cloud drive\'s folder can\'t be made online-only from other apps on this Mac (only iCloud Drive and the drives in ~/Library/CloudStorage can).' };
  }
  return { ok: false, why: 'Online-only files aren\'t available for cloud drives on this computer.' };
}
const run = (exec, file, args, ms = 15000) => new Promise((resolve) => {
  try { exec(file, args, { windowsHide: true, timeout: ms }, (err, out, errOut) => resolve({ err, out: String(out || ''), errOut: String(errOut || '') })); } catch (err) { resolve({ err }); }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// → { ok, already?, later? (the drive frees it in a moment), unsupported?, error? }
async function evict(file, o = {}) {
  const platform = o.platform || process.platform;
  const exec = o.execFile || cp.execFile;
  const sup = support({ platform, provider: o.provider, root: o.root });
  if (!sup.ok) return { ok: false, unsupported: true, error: sup.why };
  const wait = o.waitMs ?? 3000; const step = o.stepMs ?? 500;
  if (platform === 'win32') {
    const attributes = o.attributes || require('./cloud-files').attributes;
    const attr = async () => { try { return (await attributes([file])).get(file); } catch { return null; } };
    const a0 = await attr();
    if (Number.isInteger(a0) && (a0 & (RECALL | OFFLINE))) return { ok: true, already: true };
    const sys = path.win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'attrib.exe');
    const r = await run(exec, o.attribExe || sys, ['-P', '+U', file]);
    if (r.err) return { ok: false, error: (r.errOut || r.out || r.err.message || 'attrib failed').trim() };
    for (let t = 0; ; t += step) {
      const a = await attr();
      if (Number.isInteger(a) && (a & (RECALL | OFFLINE))) return { ok: true };
      if (Number.isInteger(a) && !(a & (UNPINNED | PINNED))) return { ok: false, unsupported: true, error: 'This folder doesn\'t support online-only files (Files On-Demand is off, or it isn\'t a cloud drive).' };
      if (t >= wait) return Number.isInteger(a) && (a & UNPINNED) ? { ok: true, later: true } : { ok: false, error: 'The cloud drive didn\'t answer.' };
      await sleep(step);
    }
  }
  // Mac
  const stat = o.stat || ((f) => fs.promises.stat(f));
  const stub = path.join(path.dirname(file), `.${path.basename(file)}.icloud`);
  const freed = async () => { try { const st = await stat(file); return st.size > 0 && st.blocks === 0; } catch (err) { if (err.code !== 'ENOENT') return false; try { await stat(stub); return true; } catch { return false; } } };
  if (await freed()) return { ok: true, already: true };
  const icloud = o.provider === 'icloud';
  const r = await run(exec, icloud ? 'brctl' : 'fileproviderctl', ['evict', file]);
  if (r.err && (r.err.code === 'ENOENT' || /unknown|usage:/i.test(`${r.errOut}${r.out}`))) return { ok: false, unsupported: true, error: `This Mac\'s ${icloud ? 'iCloud tool (brctl)' : 'cloud drive tool (fileproviderctl)'} can\'t make files online-only.` };
  if (r.err) return { ok: false, error: (r.errOut || r.out || r.err.message || 'evict failed').trim() };
  for (let t = 0; ; t += step) {
    if (await freed()) return { ok: true };
    if (t >= wait) return { ok: true, later: true };
    await sleep(step);
  }
}
module.exports = { support, evict, PINNED, UNPINNED, RECALL, OFFLINE };
