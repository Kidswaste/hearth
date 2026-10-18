#!/usr/bin/env node
// (round 64, twocopies64) Two Hearth folders on one computer, without Electron: twocopies-core.js on fixture folder trees.
//   · finding the other copies: a Windows layout (C:\Users\you\agent-hub with chats, the new C:\Users\you\Hearth, a
//     Desktop\Hearth-Windows\Hearth, OneDrive's Desktop, Downloads, where the Start menu Hearth.lnk and the login item
//     point) and a Mac layout (~/Library/Application Support/Hearth, ~/Applications/Hearth.app's launcher,
//     /Applications/Hearth.app's boot.js HEARTH_DIR) — real files in a temp folder, the platform's own path rules
//   · the profile: the copy with the chats keeps Electron's usual profile, a new empty copy gets its own (in every
//     order the two can start), a moved copy keeps it, a gone owner's is taken over, an unreadable note decides nothing
//   · profile entries kept apart: what the empty copy notes (its open chat, scene, queue…) never reaches the real one
//   · "Bring its chats here" through 🛟 Recover's own code: copied, the other folder byte-identical; Recover lists the
//     other folder's chats unticked
//   · Open that one (how to start the other copy), the login item, the shortcuts, the card's rule, the folder's id
//   node dev/twocopies-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const C = require('../twocopies-core');
const W = require('../winfresh-core');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-twocopies-'));
const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v)); };

// a file system whose absolute paths (C:\… or /…) live under one temp folder: the other platform's layout, for real
function mapped(root, platform) {
  const P = C.pathOf(platform);
  const real = (p) => {
    const s = String(p);
    if (platform === 'win32') { const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(P.normalize(s)); if (!m) throw new Error(`not absolute: ${s}`); return path.join(root, m[1].toUpperCase(), ...m[2].split(/[\\/]+/).filter(Boolean)); }
    return path.join(root, ...P.normalize(s).split('/').filter(Boolean));
  };
  const back = (r) => {
    const rel = path.relative(root, r).split(path.sep);
    return platform === 'win32' ? `${rel[0]}:\\${rel.slice(1).join('\\')}` : `/${rel.join('/')}`;
  };
  return {
    existsSync: (p) => fs.existsSync(real(p)),
    readdirSync: (p, o) => fs.readdirSync(real(p), o),
    readFileSync: (p, o) => fs.readFileSync(real(p), o),
    statSync: (p) => fs.statSync(real(p)),
    realpathSync: (p) => back(fs.realpathSync(real(p))),
    mkdirSync: (p, o) => fs.mkdirSync(real(p), o),
    put: (p, v) => write(real(p), v),
    real,
  };
}
const copyAt = (mfs, P, dir, chats = 0, extra = {}) => {
  mfs.put(P.join(dir, 'main.js'), '// hearth'); mfs.put(P.join(dir, 'store.js'), '// store');
  mfs.mkdirSync(P.join(dir, 'data', 'chats'), { recursive: true });
  for (let i = 0; i < chats; i++) mfs.put(P.join(dir, 'data', 'chats', `claude-${i}.json`), { id: `claude-${i}`, agentId: 'claude', title: `Chat ${i}`, messages: [{ role: 'user', text: `hi ${i}` }] });
  if (chats) mfs.put(P.join(dir, 'data', 'chats', 'claude-0.prev.json'), { id: 'x' }); // a .prev copy isn't a chat
  for (const [k, v] of Object.entries(extra)) mfs.put(P.join(dir, k), v);
};

(async () => {
  // ---------- Windows: where other copies are ----------
  {
    const P = C.pathOf('win32');
    const mfs = mapped(path.join(T, 'win'), 'win32');
    const home = 'C:\\Users\\you';
    copyAt(mfs, P, `${home}\\agent-hub`, 142);
    copyAt(mfs, P, `${home}\\Hearth`, 0); // this copy (new, empty)
    copyAt(mfs, P, `${home}\\Desktop\\Hearth-Windows\\Hearth`, 0); // unzipped on the Desktop, never used
    copyAt(mfs, P, `${home}\\Downloads\\Hearth (1)`, 1);
    copyAt(mfs, P, `${home}\\OneDrive\\Desktop\\Hearth`, 2);
    copyAt(mfs, P, 'D:\\Apps\\HearthX', 5); // only the Start menu shortcut knows it
    copyAt(mfs, P, 'E:\\Tools\\Flame', 7); // only the login item knows it
    mfs.put(`${home}\\Documents\\Hearth backups\\a.zip`, 'zip'); // a Hearth-looking folder that isn't a copy
    mfs.put(`${home}\\Downloads\\HearthNotes\\readme.txt`, 'x');
    const links = [{ target: 'D:\\Apps\\HearthX\\electron\\electron.exe', args: '"D:\\Apps\\HearthX" --restart' }, { target: `${home}\\Hearth\\electron\\electron.exe`, args: `"${home}\\Hearth" --restart` }];
    const loginItems = [{ name: 'Hearth', path: 'E:\\Tools\\Flame\\electron\\electron.exe', args: ['"E:\\Tools\\Flame"'] }];
    const cands = C.candidates({ fs: mfs, platform: 'win32', home, env: {}, links, loginItems });
    ok(cands.some((d) => /Desktop\\Hearth-Windows\\Hearth$/.test(d)), 'a copy one level inside a Desktop folder (Hearth-Windows\\Hearth) is looked at');
    ok(cands.some((d) => d === 'D:\\Apps\\HearthX') && cands.some((d) => d === 'E:\\Tools\\Flame'), 'the Start menu shortcut\'s and the login item\'s folders are looked at');
    const found = C.findOthers({ fs: mfs, platform: 'win32', home, env: {}, appDir: 'c:\\users\\YOU\\Hearth\\', links, loginItems });
    ok(found.map((x) => x.dir).join('|') === `C:\\Users\\you\\agent-hub|E:\\Tools\\Flame|D:\\Apps\\HearthX|${home}\\OneDrive\\Desktop\\Hearth|${home}\\Downloads\\Hearth (1)`, `the other copies with chats, the most first (${found.map((x) => `${x.dir}=${x.chats}`).join(', ')})`);
    ok(found[0].chats === 142, 'chats are counted from data\\chats (not .prev copies)');
    ok(!found.some((x) => /\\Hearth$/i.test(x.dir) && /you\\Hearth$/i.test(x.dir)), 'this copy itself is never listed (case, trailing slash)');
    ok(!found.some((x) => /Hearth-Windows/.test(x.dir)), 'a copy with no chats is not offered');
    // from the real copy's side: the empty one has no chats, so nothing is found
    const fromReal = C.findOthers({ fs: mfs, platform: 'win32', home, env: {}, appDir: `${home}\\agent-hub` });
    ok(!fromReal.some((x) => /you\\Hearth$/.test(x.dir)), 'the real copy never offers the empty one');
    // an OneDrive env path
    const od = C.candidates({ fs: mfs, platform: 'win32', home, env: { OneDrive: `${home}\\OneDrive` } });
    ok(od.some((d) => d === `${home}\\OneDrive\\Desktop\\Hearth`), 'OneDrive\'s Desktop (a redirected Desktop) is looked at');
    // Open that one
    mfs.put(`${home}\\agent-hub\\electron\\electron.exe`, 'exe');
    const op = C.openPlan({ fs: mfs, platform: 'win32', other: `${home}\\agent-hub`, execPath: `${home}\\Hearth\\electron\\electron.exe` });
    ok(op.cmd === `${home}\\agent-hub\\electron\\electron.exe` && op.args[0] === `${home}\\agent-hub` && !op.args.includes('--restart'), 'Open that one starts the other copy with its own electron.exe (a running one just comes forward)');
    mfs.put(`${home}\\OneDrive\\Desktop\\Hearth\\Start Hearth.cmd`, '@echo off');
    const op2 = C.openPlan({ fs: mfs, platform: 'win32', other: `${home}\\OneDrive\\Desktop\\Hearth` });
    ok(op2.cmd === 'cmd.exe' && op2.args.join(' ').includes('Start Hearth.cmd'), 'no electron.exe there: its Start Hearth.cmd');
    // the login item: off in the empty copy never removes the real copy's
    ok(C.loginItemPlan({ want: false, items: [{ name: 'Hearth', path: `${home}\\agent-hub\\electron\\electron.exe`, args: [`"${home}\\agent-hub"`] }], appDir: `${home}\\Hearth` }) === 'leave', '"Start with Windows" off in the new copy leaves the real copy\'s entry');
    ok(C.loginItemPlan({ want: false, items: [{ name: 'Hearth', path: `${home}\\Hearth\\electron\\electron.exe`, args: [`"${home}\\Hearth"`] }], appDir: `${home}\\Hearth` }) === 'clear', 'off clears this copy\'s own entry');
    ok(C.loginItemPlan({ want: false, items: [], appDir: `${home}\\Hearth` }) === 'clear' && C.loginItemPlan({ want: true, items: [], appDir: `${home}\\Hearth` }) === 'set', 'none there → clear (no change); on → set');
    // the shortcuts (winfresh60's plan + the hold)
    const existing = { target: `${home}\\agent-hub\\electron\\electron.exe`, args: `"${home}\\agent-hub" --restart` };
    const plan = W.shortcutPlan({ marker: null, existing, execPath: `${home}\\Hearth\\electron\\electron.exe`, appDir: `${home}\\Hearth`, exists: (d) => mfs.existsSync(P.join(d, 'main.js')) });
    ok(plan.action === 'elsewhere' && plan.other === `${home}\\agent-hub`, 'verified: shortcuts to another copy that still exists are left alone (winfresh60)');
    const gone = W.shortcutPlan({ marker: null, existing: { target: 'Z:\\gone\\electron\\electron.exe', args: '"Z:\\gone" --restart' }, execPath: `${home}\\Hearth\\electron\\electron.exe`, appDir: `${home}\\Hearth`, exists: (d) => mfs.existsSync(P.join(d, 'main.js')) });
    ok(gone.action === 'create', 'a gone copy\'s shortcuts would be re-pointed here…');
    const hold = C.shortcutHold({ chatsHere: 0, others: found });
    ok(hold && hold.action === 'elsewhere' && hold.other === `${home}\\agent-hub` && hold.hold, '…but not while this copy has no chats and another has (held, asked again later)');
    ok(C.shortcutHold({ chatsHere: 3, others: found }) === null && C.shortcutHold({ chatsHere: 0, others: [] }) === null, 'a copy with chats, or no other copy: winfresh60\'s plan as before');
    const sh = fs.readFileSync(path.join(ROOT, 'appshell.js'), 'utf8');
    ok(/shortcutHold\(/.test(sh) && sh.indexOf('shortcutHold(') < sh.indexOf("if (plan.action === 'create') { ensureIcon()"), 'appshell checks the hold before it makes any shortcut');
    ok(/loginItemPlan\(/.test(sh) && /loginItemArgs\(__dirname\)/.test(sh), 'appshell asks loginItemPlan before writing the login item');
  }

  // ---------- Mac: where other copies are ----------
  {
    const P = C.pathOf('darwin');
    const mfs = mapped(path.join(T, 'mac'), 'darwin');
    const home = '/Users/you';
    const sup = `${home}/Library/Application Support/Hearth`;
    copyAt(mfs, P, sup, 9);
    copyAt(mfs, P, `${home}/Downloads/Hearth`, 0); // this copy
    copyAt(mfs, P, '/Volumes/Work/Odd "Hearth"', 3); // only /Applications/Hearth.app's boot.js knows it (a quote in the name)
    copyAt(mfs, P, '/opt/flame', 2); // only the old ~/Applications launcher knows it
    mfs.put('/Applications/Hearth.app/Contents/Resources/app/boot.js', `const HEARTH_DIR = "/Volumes/Work/Odd \\"Hearth\\"";\nif (fs.existsSync(path.join(HEARTH_DIR, 'main.js'))) {}`);
    mfs.put(`${home}/Applications/Hearth.app/Contents/MacOS/hearth`, '#!/bin/bash\nexec "/opt/electron/Electron.app/Contents/MacOS/Electron" "/opt/flame" --restart "$@"\n');
    ok(C.bootDir(mfs.readFileSync('/Applications/Hearth.app/Contents/Resources/app/boot.js', 'utf8')) === '/Volumes/Work/Odd "Hearth"', 'boot.js\'s HEARTH_DIR is read (escaped quotes)');
    ok(C.launcherDir(mfs.readFileSync(`${home}/Applications/Hearth.app/Contents/MacOS/hearth`, 'utf8')) === '/opt/flame', 'the old launcher\'s folder is read');
    const found = C.findOthers({ fs: mfs, platform: 'darwin', home, env: {}, appDir: `${home}/Downloads/Hearth` });
    ok(found.map((x) => `${x.dir}=${x.chats}`).join('|') === `${sup}=9|/Volumes/Work/Odd "Hearth"=3|/opt/flame=2`, `the Mac's copies with chats (${found.map((x) => `${x.dir}=${x.chats}`).join(', ')})`);
    const op = C.openPlan({ fs: mfs, platform: 'darwin', other: '/Volumes/Work/Odd "Hearth"', execPath: '/Applications/Hearth.app/Contents/MacOS/Electron', home });
    ok(op.cmd === 'open' && op.args[1] === '/Applications/Hearth.app', 'Open that one on a Mac: the Hearth.app that starts that folder');
    const op2 = C.openPlan({ fs: mfs, platform: 'darwin', other: sup, execPath: '/Applications/Hearth.app/Contents/MacOS/Electron', home });
    ok(op2.folder === sup, 'an installed Hearth.app always runs its own folder: the other one\'s folder is shown instead (never this copy again)');
    const op3 = C.openPlan({ fs: mfs, platform: 'darwin', other: sup, execPath: '/opt/electron/Electron.app/Contents/MacOS/Electron', home });
    ok(op3.cmd === '/opt/electron/Electron.app/Contents/MacOS/Electron' && op3.args[0] === sup, 'a plain Electron starts the other folder');
  }

  // ---------- the profile: which copy keeps Electron's usual one ----------
  {
    const base = path.join(T, 'prof'); fs.mkdirSync(base, { recursive: true });
    const def = path.join(base, 'agent-hub'); // %APPDATA%\agent-hub
    const real = { appDir: path.join(base, 'home', 'agent-hub'), chats: 142 };
    const empty = { appDir: path.join(base, 'home', 'Hearth'), chats: 0 };
    for (const c of [real, empty]) { c.dataDir = path.join(c.appDir, 'data'); fs.mkdirSync(path.join(c.dataDir, 'chats'), { recursive: true }); c.id = C.ensureId({ fs, path, dataDir: c.dataDir, appDir: c.appDir }); }
    ok(real.id && empty.id && real.id !== empty.id && /^[0-9a-f]{32}$/.test(real.id), 'each data folder gets its own id');
    ok(C.ensureId({ fs, path, dataDir: real.dataDir, appDir: real.appDir }) === real.id, 'the id stays');
    const pick = (c, others = []) => {
      const p = C.pickProfile({ fs, path, defaultDir: def, copyId: c.id, dataDir: c.dataDir, appDir: c.appDir, chatsHere: c.chats, others: () => others });
      if (p.claim) C.writeMarker({ fs, path, defaultDir: def, copyId: c.id, dataDir: c.dataDir, appDir: c.appDir });
      if (p.dir !== def) fs.mkdirSync(p.dir, { recursive: true });
      return p;
    };
    // the owner's case: the profile has been used for months (no note: every version before this one)
    write(path.join(def, 'Local Storage', 'leveldb', 'CURRENT'), 'x');
    // the empty copy (with this version) starts first
    const e1 = pick(empty, [{ dir: real.appDir, chats: 142 }]);
    ok(e1.dir !== def && !e1.primary && !fs.existsSync(path.join(def, C.MARKER)), `the new empty copy gets its own profile and claims nothing (${e1.why})`);
    ok(path.dirname(e1.dir) === base && /agent-hub-copy-[0-9a-f]{8}$/.test(e1.dir), `next to the usual one (${path.basename(e1.dir)})`);
    const r1 = pick(real, [{ dir: empty.appDir, chats: 0 }]);
    ok(r1.dir === def && r1.primary && r1.claim, `the real copy keeps the usual profile (${r1.why}) and notes it`);
    ok(pick(empty).dir === e1.dir && pick(real).dir === def, 'from then on each keeps its own');
    // the other order: a fresh pair, the real copy first
    fs.rmSync(path.join(def, C.MARKER)); fs.rmSync(e1.dir, { recursive: true });
    ok(pick(real, [{ dir: empty.appDir, chats: 0 }]).dir === def, 'real first: the usual profile');
    ok(pick(empty, [{ dir: real.appDir, chats: 142 }]).dir !== def, 'empty second: its own');
    // the empty copy got some chats meanwhile: it still doesn't take it over
    ok(pick({ ...empty, chats: 3 }, [{ dir: real.appDir, chats: 142 }]).dir !== def, 'a copy that later has a few chats keeps its own profile');
    // no note, both have chats: the one with the most keeps it
    fs.rmSync(path.join(def, C.MARKER)); fs.rmSync(e1.dir, { recursive: true, force: true });
    const small = pick({ ...empty, chats: 4 }, [{ dir: real.appDir, chats: 142 }]);
    ok(small.dir !== def, 'no note yet, both have chats: the one with fewer gets its own');
    fs.rmSync(small.dir, { recursive: true, force: true });
    const big = pick(real, [{ dir: empty.appDir, chats: 4 }]);
    ok(big.dir === def && big.claim, '…the one with the most keeps the usual one');
    // a profile nobody used: the first copy takes it (a new computer: nothing changes)
    const def2 = path.join(base, 'fresh-profile');
    const f1 = C.pickProfile({ fs, path, defaultDir: def2, copyId: empty.id, dataDir: empty.dataDir, appDir: empty.appDir, chatsHere: 0 });
    ok(f1.dir === def2 && f1.claim && f1.why === 'fresh profile', 'a profile nobody used yet is this copy\'s (a first install: the usual profile)');
    // the real copy moved to another folder (its data folder, and so its id, went with it): it keeps its profile
    const moved = { ...real, appDir: path.join(base, 'elsewhere', 'agent-hub') };
    moved.dataDir = path.join(moved.appDir, 'data');
    fs.mkdirSync(path.dirname(moved.appDir), { recursive: true }); fs.renameSync(real.appDir, moved.appDir);
    const mv = pick(moved);
    ok(mv.dir === def && mv.claim && mv.why === 'mine', 'a moved copy keeps its profile (the note is refreshed)');
    ok(JSON.parse(fs.readFileSync(path.join(def, C.MARKER), 'utf8')).dataDir === moved.dataDir, 'the note says where it is now');
    ok(pick(empty).dir !== def, 'the other copy still has its own');
    // the owner deleted the copy that owned it: the next copy takes it over
    const lone = { appDir: path.join(base, 'home', 'Hearth3'), chats: 0 }; lone.dataDir = path.join(lone.appDir, 'data'); fs.mkdirSync(lone.dataDir, { recursive: true }); lone.id = C.ensureId({ fs, path, dataDir: lone.dataDir, appDir: lone.appDir });
    fs.rmSync(moved.appDir, { recursive: true, force: true });
    const og = pick(lone);
    ok(og.dir === def && og.why === 'owner gone', 'the copy that owned it is gone: taken over');
    // an unreadable note (held / half-written): nothing decided, nothing written
    fs.writeFileSync(path.join(def, C.MARKER), '{"copyId": "abc');
    const held = C.pickProfile({ fs, path, defaultDir: def, copyId: 'f'.repeat(32), dataDir: lone.dataDir, appDir: lone.appDir, chatsHere: 0 });
    ok(held.dir === def && !held.claim && held.why === 'marker held', 'an unreadable note decides nothing (the usual profile, nothing written)');
    // an unreadable hearth-origin.json: no id, nothing decided
    const odd = path.join(base, 'odd', 'data'); fs.mkdirSync(odd, { recursive: true }); fs.mkdirSync(path.join(odd, 'hearth-origin.json'));
    ok(C.ensureId({ fs, path, dataDir: odd, appDir: path.dirname(odd) }) === null, 'hearth-origin.json that can\'t be read: no id (that start uses the usual profile, as before)');
    // the id goes into hearth-origin.json next to what portable.js keeps there, and portable keeps it
    const o2 = path.join(base, 'o2'); fs.mkdirSync(o2, { recursive: true });
    write(path.join(o2, 'hearth-origin.json'), { dataDir: 'C:\\old\\data', appDir: 'C:\\old', platform: 'win32', at: 1 });
    const id2 = C.ensureId({ fs, path, dataDir: o2, appDir: '/x' });
    const og2 = JSON.parse(fs.readFileSync(path.join(o2, 'hearth-origin.json'), 'utf8'));
    ok(og2.copyId === id2 && og2.dataDir === 'C:\\old\\data', 'the id is added without touching the moved-path note (portable.js still sees where the data was)');
    const port = fs.readFileSync(path.join(ROOT, 'portable.js'), 'utf8');
    ok(/copyId \? \{ \.\.\.o, copyId \}/.test(port), 'portable.js keeps the id when it rewrites hearth-origin.json');
    ok(require('../sync-merge').localOnly('hearth-origin.json'), 'hearth-origin.json never syncs (each computer, each folder its own)');
  }

  // ---------- profile entries kept apart (two copies, one Electron profile folder) ----------
  {
    // a stand-in for localStorage: a file per profile; each copy reads / writes the profile pickProfile gave it
    const base = path.join(T, 'iso'); const def = path.join(base, 'agent-hub');
    write(path.join(def, 'Preferences'), '{}');
    const mk = (name, chats) => { const appDir = path.join(base, name); const dataDir = path.join(appDir, 'data'); fs.mkdirSync(path.join(dataDir, 'chats'), { recursive: true }); for (let i = 0; i < chats; i++) write(path.join(dataDir, 'chats', `c${i}.json`), { id: `c${i}`, messages: [] }); return { appDir, dataDir, chats, id: C.ensureId({ fs, path, dataDir, appDir }) }; };
    const real = mk('agent-hub', 3); const empty = mk('Hearth', 0);
    const run = (c, others) => { const p = C.pickProfile({ fs, path, defaultDir: def, copyId: c.id, dataDir: c.dataDir, appDir: c.appDir, chatsHere: c.chats, others: () => others }); if (p.claim) C.writeMarker({ fs, path, defaultDir: def, copyId: c.id, dataDir: c.dataDir, appDir: c.appDir }); fs.mkdirSync(p.dir, { recursive: true }); return p.dir; };
    const ls = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'ls.json'), 'utf8')); } catch { return {}; } };
    const setLs = (dir, k, v) => { const o = ls(dir); o[k] = v; write(path.join(dir, 'ls.json'), o); };
    const pr = run(real, [{ dir: empty.appDir, chats: 0 }]);
    setLs(pr, 'hearth.view', { active: 'claude', chats: { claude: { chatId: 'c2' } } }); setLs(pr, 'offline.held', [{ agentId: 'claude', chatId: 'c1', texts: ['typed while it answered'] }]); setLs(pr, 'routines.list', [{ id: 'r', chatId: 'c0', status: 'running' }]);
    const pe = run(empty, [{ dir: real.appDir, chats: 3 }]);
    ok(pe !== pr, 'the two copies use two profiles');
    ok(!ls(pe)['offline.held'] && !ls(pe)['routines.list'], 'the empty copy sees none of the real copy\'s queue / routines (it used to take the queue and stop the routines)');
    setLs(pe, 'hearth.view', { active: 'claude', chats: { claude: { chatId: 'new-empty-chat' } } }); setLs(pe, 'three.current', 's-empty'); setLs(pe, 'firstrun.seen', 'shown');
    const after = ls(run(real));
    ok(after['hearth.view'].chats.claude.chatId === 'c2' && after['offline.held'][0].chatId === 'c1' && after['routines.list'][0].status === 'running' && !after['three.current'] && !after['firstrun.seen'], 'the real copy finds its own entries as it left them, nothing of the empty copy\'s');
  }

  // ---------- "Bring its chats here" (Recover's own code), and Recover listing the other folder ----------
  {
    const base = path.join(T, 'bring');
    const other = path.join(base, 'agent-hub'); const here = path.join(base, 'Hearth'); const D = path.join(here, 'data');
    for (let i = 0; i < 6; i++) write(path.join(other, 'data', 'chats', `claude-${i}.json`), { id: `claude-${i}`, agentId: i === 5 ? 'my-writer' : 'claude', title: `Chat ${i}`, updatedAt: 1000 + i, messages: [{ role: 'user', text: `q${i}` }, { role: 'assistant', text: `a${i}` }] });
    write(path.join(other, 'data', 'memory.json'), { shared: 'I live in Paris\nI make music' });
    write(path.join(other, 'data', 'config.json'), { agents: [{ id: 'claude', name: 'Claude' }, { id: 'my-writer', name: 'My writer', mode: 'native' }], settings: { theme: 'forge' } });
    write(path.join(other, 'data', 'kv', 'chat-meta.json'), { 'claude-1': { folder: 'Music' } });
    write(path.join(other, 'data', 'kv', 'notes.json'), [{ id: 'n' }]); // not a chat's list: not brought
    write(path.join(other, 'main.js'), '//'); write(path.join(other, 'store.js'), '//');
    const hashTree = (dir) => { const h = crypto.createHash('sha256'); const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { h.update(path.relative(dir, f)); h.update(fs.readFileSync(f)); h.update(String(fs.statSync(f).mtimeMs)); } } }; walk(dir); return h.digest('hex'); };
    const before = hashTree(other);
    fs.mkdirSync(path.join(D, 'chats'), { recursive: true });
    const files = () => fs.readdirSync(path.join(D, 'chats')).filter((f) => f.endsWith('.json'));
    const readC = (id) => { try { return JSON.parse(fs.readFileSync(path.join(D, 'chats', `${id}.json`), 'utf8')); } catch { return null; } };
    let mem = {}; const kv = {};
    const store = {
      listChats: () => files().map((f) => { const c = readC(f.slice(0, -5)); return { id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt }; }),
      getChat: (id) => readC(id), saveChat: (c) => write(path.join(D, 'chats', `${c.id}.json`), c),
      getMemory: () => mem, saveMemory: (m) => { mem = m; }, getKV: (n, d) => kv[n] ?? d, setKV: (n, v) => { kv[n] = v; },
    };
    let cfgAgents = [{ id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' }];
    const cfg = { read: () => ({ agents: cfgAgents, settings: { theme: 'forge', backupDir: path.join(base, 'no-backups') } }), save: (v) => { cfgAgents = v.agents; return { ok: true }; } };
    const DM = require(path.join(ROOT, 'datasafemain.js'));
    DM._set({ dataDir: D, configPath: path.join(D, 'config.json'), store, cfg, syncmain: null, home: path.join(base, 'home'), workspace: path.join(D, 'workspace') });
    const label = `Your other Hearth folder (${other})`;
    const r = await DM.scan({ quick: true, copies: [{ dir: other, label }] });
    ok(r.chats.filter((c) => c.from === label).length === 6 && r.chats.every((c) => c.other), 'the other folder\'s 6 chats are found, marked as another folder\'s (unticked in Recover…)');
    ok(r.memory.filter((m) => m.from === label).length === 2 && r.settings.some((s) => s.what === 'agent' && s.id === 'my-writer'), 'its memory lines and the AI this copy lacks');
    ok(r.kv.some((k) => k.name === 'chat-meta' && k.other) && !r.kv.some((k) => k.name === 'notes'), 'its chats\' folders come along, not other tool data');
    const mine = (x) => x.from === label;
    const done = await DM.recover([...r.chats.filter(mine), ...r.memory.filter(mine), ...r.settings.filter((x) => mine(x) && x.what === 'agent'), ...r.kv.filter(mine)].map((x) => x.key));
    ok(done.chats.length === 6 && files().length === 6 && readC('claude-3').messages.length === 2, 'Bring its chats here: 6 chats copied here, whole');
    ok(cfgAgents.some((a) => a.id === 'my-writer') && /Paris/.test(mem.shared || '') && kv['chat-meta']?.['claude-1']?.folder === 'Music', 'with the AI its chat needs, the memory lines and the chats\' folders');
    ok(hashTree(other) === before, 'the other folder is byte-identical afterwards (nothing written, moved or deleted there)');
    const again = await DM.scan({ quick: true, copies: [{ dir: other, label }] });
    ok(!again.chats.length, `a second look finds nothing more to bring (${JSON.stringify(again.chats.map((c) => [c.id, c.state, c.from]))})`);
    // the main side picks only from that folder, only chats not here
    const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    ok(/async function bringFromCopy\(dir\)/.test(mainSrc) && /datasafe\.recover\(picks\)/.test(mainSrc) && /c\.state === 'missing'/.test(mainSrc), 'main.js brings them with Recover\'s own scan / recover (copy only)');
  }

  // ---------- the card's rule ----------
  {
    const others = [{ dir: 'C:\\Users\\you\\agent-hub', chats: 142 }];
    ok(C.shouldAsk({ chatsHere: 0, choice: null, others }), 'an empty copy with another copy that has chats: the card');
    ok(!C.shouldAsk({ chatsHere: 1, choice: null, others }), 'a copy with chats: no card');
    ok(!C.shouldAsk({ chatsHere: 0, choice: { choice: 'fresh' }, others }), '"Start fresh here" is remembered');
    ok(!C.shouldAsk({ chatsHere: 0, choice: { held: true }, others }), 'an unreadable choice file: no card (never asks twice by mistake)');
    ok(!C.shouldAsk({ chatsHere: 0, choice: null, others: [] }), 'nothing else on this computer: no card');
    const d = path.join(T, 'choice'); fs.mkdirSync(d, { recursive: true });
    ok(C.readChoice({ fs, path, dataDir: d }) === null && C.writeChoice({ fs, path, dataDir: d, choice: 'fresh', other: 'x' }) && C.readChoice({ fs, path, dataDir: d }).choice === 'fresh', 'the choice is kept in data/twocopies.json');
    ok(require('../sync-merge').localOnly('twocopies.json'), 'twocopies.json never syncs');
    const html = fs.readFileSync(path.join(ROOT, 'twocopies.html'), 'utf8');
    ok(/Open that one \(recommended\)/.test(html) && /Bring its chats here/.test(html) && /Start fresh here/.test(html) && /You already have Hearth with /.test(html), 'the card\'s words');
    const tm = fs.readFileSync(path.join(ROOT, 'twocopiesmain.js'), 'utf8');
    ok(/name === 'agent-hub'/.test(tm), 'only the real app looks at the computer\'s folders (test copies are renamed)');
    const bm = fs.readFileSync(path.join(ROOT, 'backupautomain.js'), 'utf8');
    ok(/theirCopy \? !cp\.id \|\| theirCopy === cp\.id : cp\.primary/.test(bm), 'backups another Hearth folder made are never rotated away by this one');
  }

  // ---------- the Windows zip recipe ----------
  {
    const sh = fs.readFileSync(path.join(ROOT, 'dev', 'make-windows-zip.sh'), 'utf8');
    ok(/git update-ref refs\/remotes\/origin\/main HEAD/.test(sh), 'the zip recipe points origin/main at the zipped version');
    ok(/data/.test(sh) && /README-FIRST\.txt/.test(sh) && /If you already have Hearth, don't use this/.test(sh) && /Update in your Hearth instead/.test(sh), 'it leaves data out and says "If you already have Hearth, don\'t use this"');
  }

  fs.rmSync(T, { recursive: true, force: true });
  console.log(`twocopies: ${pass} passed, ${fail} failed`);
  console.log(JSON.stringify({ pass: fail === 0, passed: pass, failed: fail }));
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); fs.rmSync(T, { recursive: true, force: true }); process.exit(1); });
