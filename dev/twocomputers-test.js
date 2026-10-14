#!/usr/bin/env node
// (round 35, twocomputers) two computers, simulated: a Mac (path.posix, /Users/quent) and a Windows PC (path.win32,
// C:\Users\quent), two machine ids, and one shared synced folder (a temp "cloud drive" with the real sync engine).
// Covers twocomputers-core.js (portable forms, foreign paths, an AI's folders per computer, picks / skips, media found
// again by place or content, the welcome list), the sync side (sync-merge.js: an AI's folders, engine paths, the
// "no sandbox" opt-in, Chrome's prefs, OBS' password and this computer's media links never cross; the folders record
// does), reachmain.localize never using the other computer's path as it is, access-rules with foreign folders, and
// twocomputersmain.js (quick hash, relink in real folders, "Find this file" links).
//   node dev/twocomputers-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../twocomputers-core');
const S = require('../sync-merge');
const R = require('../access-rules');
const { createEngine } = require('../sync-engine');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const noAbs = (v) => !/"(\/(Users|Volumes|home)\/|[A-Za-z]:\\\\)/.test(JSON.stringify(v)); // no absolute path of either kind

const MAC = { id: 'Quentins-MBP-aaaa1111', name: 'Quentin\'s MacBook Pro', platform: 'darwin', os: 'mac' };
const PC = { id: 'QUENT-PC-bbbb2222', name: 'QUENT-PC', platform: 'win32', os: 'win' };
const macRoots = {
  platform: 'darwin', home: '/Users/quent', data: '/Users/quent/Library/Application Support/Hearth/data', cloud: '/Users/quent/Library/CloudStorage/Dropbox',
  drives: [{ id: 'icloud', root: '/Users/quent/Library/Mobile Documents/com~apple~CloudDocs' }, { id: 'dropbox', root: '/Users/quent/Library/CloudStorage/Dropbox' }],
};
const pcRoots = {
  platform: 'win32', home: 'C:\\Users\\quent', data: 'C:\\Users\\quent\\Hearth\\data', cloud: 'C:\\Users\\quent\\Dropbox',
  drives: [{ id: 'icloud', root: 'C:\\Users\\quent\\iCloudDrive' }, { id: 'dropbox', root: 'C:\\Users\\quent\\Dropbox' }],
};

async function main() {
  // ---------- which computer ----------
  eq(T.computerLabel(MAC), 'Mac (Quentin\'s MacBook Pro)', 'label: Mac');
  eq(T.computerLabel(PC), 'Windows PC (QUENT-PC)', 'label: Windows PC');
  eq(T.computerLabel({ platform: 'darwin', name: 'mbp.local' }), 'Mac (mbp)', 'label: .local dropped');
  eq(T.computerLabel({ platform: 'win32' }), 'Windows PC', 'label: no name');

  // ---------- foreign paths ----------
  ok(T.foreign('C:\\Users\\quent\\x', 'darwin'), 'foreign: C:\\ on the Mac');
  ok(T.foreign('\\\\server\\share\\x', 'darwin'), 'foreign: UNC on the Mac');
  ok(T.foreign('/Users/quent/x', 'win32'), 'foreign: /Users on Windows');
  ok(T.foreign('file:///Users/quent/x', 'win32'), 'foreign: file:///Users on Windows');
  ok(!T.foreign('file:///C:/Users/quent/x', 'win32'), 'foreign: file:///C: on Windows is its own');
  ok(!T.foreign('C:\\x', 'win32') && !T.foreign('/Users/quent', 'darwin') && !T.foreign('\\Users\\x', 'win32'), 'foreign: own forms are not');
  eq(T.usable(['/Users/quent/a', 'D:\\Work', 'C:\\x'], 'darwin'), ['/Users/quent/a'], 'usable: the Mac keeps its own');
  eq(T.usable(['/Users/quent/a', 'D:\\Work', 'C:\\x'], 'win32'), ['D:\\Work', 'C:\\x'], 'usable: the PC keeps its own');

  // ---------- portable forms, both ways ----------
  eq(T.toPortable('C:\\Users\\quent\\Projects\\site', pcRoots), '@home/Projects/site', 'portable: PC home');
  eq(T.toPortable('c:\\users\\QUENT\\Projects\\site', pcRoots), '@home/Projects/site', 'portable: PC home, other case');
  eq(T.toPortable('/Users/quent/Projects/site', macRoots), '@home/Projects/site', 'portable: Mac home');
  eq(T.toPortable('/Users/Quent/Projects/site', macRoots), null, 'portable: the Mac compares case exactly');
  eq(T.toPortable('C:\\Users\\quent\\iCloudDrive\\Notes', pcRoots), '@icloud/Notes', 'portable: iCloud on the PC');
  eq(T.toPortable('/Users/quent/Library/Mobile Documents/com~apple~CloudDocs/Notes', macRoots), '@icloud/Notes', 'portable: iCloud on the Mac');
  eq(T.toPortable('C:\\Users\\quent\\Hearth\\data\\projects\\claude', pcRoots), '@data/projects/claude', 'portable: data first (inside home)');
  eq(T.toPortable('C:\\Users\\quent\\Dropbox\\Music\\a.mp3', pcRoots), '@cloud/Music/a.mp3', 'portable: sync\'s drive');
  eq(T.toPortable('D:\\Work', pcRoots), null, 'portable: another disk has none');
  eq(T.toPortable('C:\\Users\\quentin\\x', pcRoots), null, 'portable: a longer name is not inside');
  eq(T.toPortable('/Users/quent/Café'.normalize('NFD'), macRoots), '@home/Café'.normalize('NFC'), 'portable: Finder\'s accents');
  eq(T.fromPortable('@home/Projects/site', macRoots), '/Users/quent/Projects/site', 'from: Mac home');
  eq(T.fromPortable('@home/Projects/site', pcRoots), 'C:\\Users\\quent\\Projects\\site', 'from: PC home');
  eq(T.fromPortable('@icloud/Notes', macRoots), '/Users/quent/Library/Mobile Documents/com~apple~CloudDocs/Notes', 'from: iCloud on the Mac');
  eq(T.fromPortable('@icloud/Notes', pcRoots), 'C:\\Users\\quent\\iCloudDrive\\Notes', 'from: iCloud on the PC');
  eq(T.fromPortable('@home/../../etc', macRoots), '/Users/quent/etc', 'from: never climbs out of its root');
  eq(T.fromPortable('@onedrive/x', macRoots), null, 'from: a drive this computer hasn\'t');
  eq(T.fromPortable('@home/', pcRoots), 'C:\\Users\\quent', 'from: the home folder itself');
  eq(T.whereText('D:\\Work', pcRoots), 'the D: drive', 'where: another drive');
  eq(T.whereText('/Volumes/Work/x', macRoots), 'the disk Work', 'where: an external disk');
  eq(T.whereText('C:\\Users\\quent\\Projects\\site', pcRoots), '~/Projects/site', 'where: home');
  eq(T.whereText('C:\\Users\\quent\\iCloudDrive\\Notes', pcRoots), 'iCloud Drive/Notes', 'where: iCloud');

  // ---------- an AI's folders: the PC chooses, the Mac maps ----------
  const pcFolders = ['C:\\Users\\quent\\Projects\\site', 'D:\\Work', 'C:\\Users\\quent\\iCloudDrive\\Notes', 'C:\\Users\\quent', 'C:\\Users\\quent\\Hearth\\data\\projects\\claude'];
  let pcFa = T.recordHere({ level: 'write', folders: pcFolders }, PC, pcRoots, 100).fa;
  ok(pcFa.computers[PC.id] && pcFa.computers[PC.id].folders.length === 5, 'record: the PC writes its own entry');
  ok(noAbs(pcFa.computers), 'record: no absolute path in what travels');
  eq(pcFa.computers[PC.id].folders.map((f) => f.rel), ['@home/Projects/site', null, '@icloud/Notes', '@home/', '@data/projects/claude'], 'record: portable forms');
  ok(T.recordHere(pcFa, PC, pcRoots, 200).changed === false, 'record: unchanged → no rewrite (no sync churn)');

  // what the Mac gets through sync: the PC's config, portable part, applied over the Mac's own
  const pcConfig = { agents: [{ id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', fileAccess: pcFa },
    { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', astraNoSandbox: true, fileAccess: { level: 'full', folders: ['C:\\Users\\quent\\Projects\\site'] } }],
  settings: { enginePaths: { claude: 'C:\\Users\\quent\\AppData\\Roaming\\npm\\claude.cmd', codex: 'C:\\x\\codex.exe' }, reachFolders: { '/Users/quent/Work': 'D:\\Work' }, notify: true } };
  const macConfig = { agents: [{ id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', fileAccess: { level: 'read', folders: ['/Users/quent/Mine'] } },
    { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native' }],
  settings: { enginePaths: { claude: '/opt/homebrew/bin/claude' }, notify: false } };
  const portable = S.portableConfig(pcConfig);
  ok(noAbs(portable), 'sync: the PC\'s portable config has no absolute path');
  ok(!('enginePaths' in portable.settings), 'sync: engine paths never travel');
  ok(!('astraNoSandbox' in portable.agents[1]), 'sync: "run without its sandbox" never travels');
  ok(!('reachFolders' in portable.settings), 'sync: this computer\'s folder matches never travel');
  const onMac = S.applyPortable(macConfig, portable);
  eq(onMac.settings.enginePaths, { claude: '/opt/homebrew/bin/claude' }, 'sync: the Mac keeps its engine path');
  eq(onMac.agents[0].fileAccess.folders, ['/Users/quent/Mine'], 'sync: the Mac keeps its own folders (were wiped before)');
  eq(onMac.agents[0].fileAccess.level, 'write', 'sync: the level travels');
  ok(onMac.agents[0].fileAccess.computers?.[PC.id]?.folders?.length === 5, 'sync: the PC\'s folders record arrives');
  ok(onMac.agents[1].astraNoSandbox === undefined, 'sync: Astra stays sandboxed on the Mac');
  ok(!/C:\\\\|D:\\\\/.test(JSON.stringify(onMac)), 'sync: nothing of the PC\'s paths on the Mac');
  const macWithOpt = S.applyPortable({ ...macConfig, agents: [macConfig.agents[0], { ...macConfig.agents[1], astraNoSandbox: true }] }, S.portableConfig(macConfig));
  ok(macWithOpt.agents[1].astraNoSandbox === true, 'sync: this computer\'s own opt-in stays here');

  // the Mac maps: same place found → used; another disk → one click; the whole home → asks first
  const macDisk = new Set(['/Users/quent/Projects/site', '/Users/quent/Library/Mobile Documents/com~apple~CloudDocs/Notes', '/Users/quent', '/Users/quent/Library/Application Support/Hearth/data/projects/claude']);
  let macFa = T.recordHere(onMac.agents[0].fileAccess, MAC, macRoots, 300).fa;
  let pend = T.pendingHere(macFa, MAC, macRoots, (p) => macDisk.has(p));
  eq(pend.map((p) => [p.name, p.how]), [['site', 'same'], ['Work', 'missing'], ['Notes', 'same'], ['quent', 'ask'], ['claude', 'same']], 'map: what the Mac does with each');
  ok(pend.every((p) => p.how === 'missing' ? p.here === null : p.here.startsWith('/Users/quent')), 'map: never a PC path, never a guess for a missing one');
  eq(pend.find((p) => p.name === 'Work').from, 'Windows PC (QUENT-PC)', 'map: says which computer');
  eq(pend.find((p) => p.name === 'Work').on, 'the D: drive', 'map: says where, without the path');
  // nothing on the Mac's disk: no folder is granted
  const none = T.pendingHere(macFa, MAC, macRoots, () => false);
  ok(none.every((p) => p.how === 'missing' && !p.here), 'map: nothing found → nothing used, all "Pick this folder on this computer"');
  // the "same" ones used (what twocomputers.js reconcile does)
  macFa = T.recordHere({ ...macFa, folders: [...macFa.folders, ...pend.filter((p) => p.how === 'same').map((p) => p.here)] }, MAC, macRoots, 400).fa;
  pend = T.pendingHere(macFa, MAC, macRoots, (p) => macDisk.has(p));
  eq(pend.map((p) => p.name), ['Work', 'quent'], 'map: used ones are done');
  eq(T.usable(macFa.folders, 'darwin'), macFa.folders, 'map: the Mac\'s folders are all Mac paths');
  // "Pick this folder on this computer": /Volumes/Work stands for the PC's D:\Work
  const work = pend.find((p) => p.name === 'Work');
  macFa = T.matchHere(macFa, MAC, work.key, '/Volumes/Work', macRoots, 500);
  ok(macFa.folders.includes('/Volumes/Work'), 'pick: the picked folder is used');
  eq(T.pendingHere(macFa, MAC, macRoots, (p) => macDisk.has(p)).map((p) => p.name), ['quent'], 'pick: the PC\'s folder is matched');
  ok(noAbs(macFa.computers), 'pick: still no absolute path in what travels');
  // the Mac removes site → not mapped back by itself
  macFa = T.recordHere({ ...macFa, folders: macFa.folders.filter((f) => f !== '/Users/quent/Projects/site') }, MAC, macRoots, 600).fa;
  ok(!T.pendingHere(macFa, MAC, macRoots, (p) => macDisk.has(p)).some((p) => p.name === 'site'), 'remove: a folder taken out here stays out');
  // and removing the pick skips D:\Work too
  macFa = T.recordHere({ ...macFa, folders: macFa.folders.filter((f) => f !== '/Volumes/Work') }, MAC, macRoots, 700).fa;
  ok(!T.pendingHere(macFa, MAC, macRoots, (p) => macDisk.has(p)).some((p) => p.name === 'Work'), 'remove: an unpicked match stays skipped');
  // ✕ "Not on this computer"
  macFa = T.skipHere(macFa, MAC, '@home/', 800);
  eq(T.pendingHere(macFa, MAC, macRoots, (p) => macDisk.has(p)), [], 'skip: nothing left to click');
  // added back by hand: the skip goes
  macFa = T.recordHere({ ...macFa, folders: [...macFa.folders, '/Users/quent/Projects/site'] }, MAC, macRoots, 900).fa;
  ok(!(macFa.computers[MAC.id].skip || []).includes('@home/Projects/site'), 'skip: cleared when the folder is added again');

  // the PC reads the Mac's record back: both entries, each computer's own, merged by sync without a conflict
  const m3 = S.merge3({ fa: pcFa }, { fa: pcFa }, { fa: { ...pcFa, computers: { ...pcFa.computers, [MAC.id]: macFa.computers[MAC.id] } } });
  ok(!m3.conflicts.length && m3.value.fa.computers[MAC.id] && m3.value.fa.computers[PC.id], 'sync: both computers\' records merge');
  const pcDisk = new Set(['C:\\Users\\quent\\Projects\\site']);
  const pcPend = T.pendingHere(m3.value.fa, PC, pcRoots, (p) => pcDisk.has(p));
  ok(pcPend.every((p) => p.how !== 'same' || p.here.startsWith('C:\\')), 'map back: the PC only ever gets PC paths');
  ok(pcPend.some((p) => p.name === 'Mine' && p.how === 'missing'), 'map back: the Mac\'s own folder waits for a pick on the PC');
  ok(!pcPend.some((p) => p.name === 'Work'), 'map back: the PC\'s own D:\\Work isn\'t offered back to it');

  // ---------- no grant leaks in the folder checks ----------
  // On Windows a Mac folder "/Users/quent/proj" left in a chat would let a write to C:\Users\quent\proj\… through
  const leak = R.classify({ tool: 'Write', input: { file_path: '/Users/quent/proj/a.txt' }, level: 'write', folders: ['/Users/quent/proj'], cwd: 'C:\\Users\\quent\\Hearth\\data\\workspace', home: 'C:\\Users\\quent' });
  const fixed = R.classify({ tool: 'Write', input: { file_path: '/Users/quent/proj/a.txt' }, level: 'write', folders: T.usable(['/Users/quent/proj'], 'win32'), cwd: 'C:\\Users\\quent\\Hearth\\data\\workspace', home: 'C:\\Users\\quent' });
  ok(leak.verdict === 'allow', 'leak (before): a foreign folder let the write through silently');
  ok(fixed.verdict !== 'allow', 'leak (after): without it, the write asks / is refused');
  const reach = require('../reachmain');
  const lz = reach.localize('/Users/quent/proj', { platform: 'win32', home: 'C:\\Users\\quent', dataDir: '/nonexistent-data', map: {}, ctx: null });
  ok(!lz || lz.foreign === true, 'reach: a Mac path on Windows is mapped, never used as it is');
  const lz2 = reach.localize('/Volumes/Work/x', { platform: 'win32', home: 'C:\\Users\\quent', dataDir: '/nonexistent-data', map: {}, ctx: null });
  eq(lz2, null, 'reach: an external disk of the other computer maps to nothing');

  // ---------- engines, sign-ins, Chrome: this computer's own ----------
  for (const rel of ['chrome/profile/Default/Cookies', 'chrome-prefs.json', 'interop/obs.json', 'kv/media-here.json', 'engine-installs.json', 'sync/machine.json', 'connectors.json']) ok(S.localOnly(rel), `local: ${rel} never syncs`);
  for (const rel of ['kv/media-ids.json', 'kv/three-lab-extras.json', 'kv/three-beatmaps.json']) ok(!S.localOnly(rel), `synced: ${rel}`);

  // ---------- the real sync engine, one shared folder, two computers ----------
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-two-test-'));
  try {
    const W = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); };
    const cloud = path.join(ROOT, 'cloud'); fs.mkdirSync(cloud, { recursive: true });
    const mk = (name, platform, cfg) => {
      const base = path.join(ROOT, name);
      const m = { data: path.join(base, 'data'), config: path.join(base, 'app', 'config.json'), theme: path.join(base, 'app', 'theme.css'), home: path.join(base, 'home') };
      fs.mkdirSync(m.data, { recursive: true }); fs.mkdirSync(m.home, { recursive: true });
      W(m.config, JSON.stringify(cfg(m), null, 2)); W(m.theme, '/* */\n');
      m.e = createEngine({ dataDir: m.data, configPath: m.config, themePath: m.theme, cloudRoot: cloud, machineName: name, home: m.home, platform, settleMs: 0 });
      return m;
    };
    const A = mk('mac', 'darwin', (m) => ({ agents: [{ id: 'claude', name: 'Claude', mode: 'native', fileAccess: { level: 'write', folders: [path.join(m.home, 'site')], computers: { [MAC.id]: { os: 'mac', name: 'mac', folders: [{ name: 'site', rel: '@home/site', on: '~/site' }], at: 1 } } } }, { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', astraNoSandbox: true }], settings: { enginePaths: { claude: path.join(m.home, 'bin', 'claude') }, notify: true } }));
    const B = mk('pc', 'win32', (m) => ({ agents: [{ id: 'claude', name: 'Claude', mode: 'native', fileAccess: { level: 'write', folders: [path.join(m.home, 'pc-only')] } }, { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native' }], settings: { enginePaths: { claude: path.join(m.home, 'npm', 'claude.cmd') }, notify: false } }));
    W(path.join(A.data, 'chrome-prefs.json'), '{"browser":"edge","show":true}');
    W(path.join(A.data, 'interop', 'obs.json'), '{"url":"ws://127.0.0.1:4455","kx":"c2VhbGVk"}');
    W(path.join(A.data, 'kv', 'media-here.json'), JSON.stringify({ 'h:abc': path.join(A.home, 'Music', 'a.mp3') }));
    W(path.join(A.data, 'chrome', 'profile', 'Default', 'Cookies'), 'cookies');
    W(path.join(A.data, 'kv', 'media-ids.json'), JSON.stringify([{ path: path.join(A.home, 'Music', 'a.mp3'), rel: '@home/Music/a.mp3', hash: 'abc', size: 3, name: 'a.mp3' }]));
    for (let i = 0; i < 3; i++) { await A.e.pass(); await B.e.pass(); }
    const cfgB = JSON.parse(fs.readFileSync(B.config, 'utf8'));
    eq(cfgB.settings.enginePaths, { claude: path.join(B.home, 'npm', 'claude.cmd') }, 'engine: the PC keeps its own engine path');
    eq(cfgB.agents[0].fileAccess.folders, [path.join(B.home, 'pc-only')], 'engine: the PC keeps its own folders');
    ok(cfgB.agents[0].fileAccess.computers?.[MAC.id]?.folders?.[0]?.rel === '@home/site', 'engine: the Mac\'s folders record arrived');
    ok(cfgB.agents[1].astraNoSandbox === undefined, 'engine: the Mac\'s no-sandbox opt-in did not arrive');
    ok(!JSON.stringify(cfgB).includes(A.home), 'engine: no Mac path in the PC\'s config');
    const cfgA = JSON.parse(fs.readFileSync(A.config, 'utf8'));
    eq(cfgA.agents[0].fileAccess.folders, [path.join(A.home, 'site')], 'engine: the Mac kept its folders after the PC\'s pass');
    ok(cfgA.agents[1].astraNoSandbox === true, 'engine: the Mac kept its own opt-in');
    for (const rel of ['chrome-prefs.json', 'interop/obs.json', 'kv/media-here.json', 'chrome/profile/Default/Cookies']) ok(!fs.existsSync(path.join(B.data, ...rel.split('/'))) && !fs.existsSync(path.join(cloud, 'Hearth', 'files', ...rel.split('/'))), `engine: ${rel} stayed on the Mac`);
    const ids = JSON.parse(fs.readFileSync(path.join(B.data, 'kv', 'media-ids.json'), 'utf8'));
    eq(ids[0].path, `${B.home}\\Music\\a.mp3`, 'engine: media ids arrive with this computer\'s home path (the PC\'s way)');
    eq(ids[0].rel, '@home/Music/a.mp3', 'engine: the portable form arrives as it is (not expanded by sync)');
  } finally { fs.rmSync(ROOT, { recursive: true, force: true }); }

  // ---------- media found again (a Windows PC, simulated) ----------
  const pcFiles = new Map([
    ['C:\\Users\\quent\\Music\\Song.mp3', { size: 4000, hash: 'h-song' }],
    ['C:\\Users\\quent\\Music\\renamed take.mp3', { size: 5000, hash: 'h-take' }],
    ['C:\\Users\\quent\\Downloads\\song.mp3', { size: 4000, hash: 'h-other' }],
    ['C:\\Users\\quent\\iCloudDrive\\Footage\\clip.mov', { size: 9000, hash: 'h-clip' }],
    ['D:\\Footage\\b-roll.mp4', { size: 7000, hash: 'h-broll' }],
  ]);
  const P = path.win32;
  const io = (links = {}) => ({
    roots: pcRoots, platform: 'win32', links,
    exists: (p) => pcFiles.has(p), statSize: (p) => pcFiles.get(p)?.size ?? -1,
    hashOf: async (p) => { if (!pcFiles.has(p)) throw new Error('none'); return pcFiles.get(p).hash; },
    list: async (dir) => [...pcFiles.keys()].filter((f) => f.toLowerCase().startsWith(`${dir.toLowerCase()}\\`)),
  });
  eq(await T.relink({ path: 'C:\\Users\\quent\\Music\\Song.mp3' }, io()), { path: 'C:\\Users\\quent\\Music\\Song.mp3', how: 'here' }, 'media: here as it is');
  eq(await T.relink({ path: '/Users/quent/Music/Song.mp3', rel: '@home/Music/Song.mp3', hash: 'h-song', size: 4000 }, io()), { path: 'C:\\Users\\quent\\Music\\Song.mp3', how: 'home' }, 'media: by its home-relative place');
  eq(await T.relink({ path: '/Users/quent/Library/Mobile Documents/com~apple~CloudDocs/Footage/clip.mov', rel: '@icloud/Footage/clip.mov', hash: 'h-clip', size: 9000 }, io()), { path: 'C:\\Users\\quent\\iCloudDrive\\Footage\\clip.mov', how: 'drive' }, 'media: by its iCloud-relative place');
  eq(await T.relink({ path: '/Volumes/Music/take.mp3', hash: 'h-take', size: 5000, name: 'take.mp3' }, io()), { path: 'C:\\Users\\quent\\Music\\renamed take.mp3', how: 'found' }, 'media: renamed, found by content');
  eq(await T.relink({ path: '/Users/quent/Desktop/Song.mp3', hash: 'h-song', size: 4000 }, io()), { path: 'C:\\Users\\quent\\Music\\Song.mp3', how: 'found' }, 'media: same name elsewhere, content checked');
  eq(await T.relink({ path: '/Users/quent/Desktop/song.mp3', rel: '@home/Downloads/song.mp3', hash: 'h-song', size: 4000 }, io()), { path: 'C:\\Users\\quent\\Music\\Song.mp3', how: 'found' }, 'media: a same-place file with other content is not taken');
  eq(await T.relink({ path: '/Users/quent/Desktop/song.mp3' }, io()), null, 'media: a name alone is never enough');
  eq(await T.relink({ path: '/Volumes/X/b-roll.mp4', hash: 'h-broll', size: 7000 }, io()), null, 'media: not in the usual folders → "Find this file"');
  eq(await T.relink({ path: '/Volumes/X/b-roll.mp4', hash: 'h-broll', size: 7000 }, io(T.linkHere({}, { path: '/Volumes/X/b-roll.mp4', hash: 'h-broll' }, 'D:\\Footage\\b-roll.mp4'))), { path: 'D:\\Footage\\b-roll.mp4', how: 'link' }, 'media: "Find this file" remembered here (by hash)');
  eq(await T.relink({ path: '/Volumes/X/b-roll.mp4' }, io(T.linkHere({}, { path: '/Volumes/X/b-roll.mp4' }, 'D:\\Footage\\b-roll.mp4'))), { path: 'D:\\Footage\\b-roll.mp4', how: 'link' }, 'media: "Find this file" remembered here (by path)');
  ok(!(await T.relink({ path: 'D:\\Footage\\b-roll.mp4' }, { ...io(), platform: 'darwin', roots: macRoots, exists: () => true })), 'media: a PC path is never opened as it is on the Mac');
  ok(T.mediaDirs(pcRoots).every((d) => P.isAbsolute(d) && d.startsWith('C:\\')), 'media: the PC\'s folders are PC paths');

  // ---------- the welcome list ----------
  const wl = T.welcomeList({ pending: [{ how: 'missing', fromKind: 'Windows PC' }, { how: 'ask', fromKind: 'Windows PC' }], agents: [{ name: 'Claude', engine: 'claude' }, { name: 'Astra', engine: 'codex' }, { name: 'Dir', engine: 'claude', dock: 'three' }], media: 1 });
  eq(wl.map((x) => x.kind), ['folders', 'check', 'media'], 'welcome: what needs a click');
  ok(/your Windows PC/.test(wl[0].text) && /Claude and Astra/.test(wl[1].text), 'welcome: plain words');
  eq(T.welcomeList({ agents: [] }), [], 'welcome: nothing to click');

  // ---------- twocomputersmain.js: quick hash, relink in real folders, Find this file ----------
  const M = require('../twocomputersmain');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-two-main-'));
  try {
    const home = path.join(TMP, 'home'); const data = path.join(TMP, 'data');
    fs.mkdirSync(path.join(home, 'Music', 'Album'), { recursive: true }); fs.mkdirSync(path.join(data, 'kv'), { recursive: true });
    const big = Buffer.alloc(3 * 1024 * 1024 + 17); for (let i = 0; i < big.length; i += 4096) big[i] = i % 251;
    fs.writeFileSync(path.join(home, 'Music', 'Album', 'track.wav'), big);
    M._set({ dataDir: data, home, platform: process.platform, syncmain: null });
    const q = await M.quickHash(path.join(home, 'Music', 'Album', 'track.wav'));
    ok(/^[0-9a-f]{40}$/.test(q.hash) && q.size === big.length, 'main: quick hash');
    const big2 = Buffer.from(big); big2[2 * 1024 * 1024] = 99; // a change in the middle (not read by the quick hash)
    const f2 = path.join(TMP, 'x.wav'); fs.writeFileSync(f2, big2);
    eq((await M.quickHash(f2)).hash, q.hash, 'main: the quick hash reads the ends only (fast on big videos)');
    const r1 = await M.relink({ path: 'C:\\Users\\quent\\Music\\track.wav', hash: q.hash, size: q.size, name: 'track.wav' });
    eq(r1 && r1.path, path.join(home, 'Music', 'Album', 'track.wav'), 'main: found in Music by name + content');
    const links = JSON.parse(fs.readFileSync(path.join(data, 'kv', 'media-here.json'), 'utf8'));
    ok(links[`h:${q.hash}`] === path.join(home, 'Music', 'Album', 'track.wav'), 'main: remembered on this computer');
    const r2 = await M.relink({ path: 'C:\\Users\\quent\\Music\\track.wav', hash: q.hash, size: q.size });
    eq(r2 && r2.how, 'link', 'main: next time from the link, no search');
    const picked = path.join(TMP, 'picked.wav'); fs.writeFileSync(picked, 'other');
    const lk = await M.link({ path: '/Volumes/X/song.wav', hash: q.hash }, picked);
    ok(lk.ok && lk.same === false, 'main: Find this file says when the content differs');
    const r3 = await M.relink({ path: '/Volumes/X/song.wav' });
    eq(r3 && r3.path, picked, 'main: the owner\'s pick counts (by path)');
    const mid = M.machine();
    ok(mid.id && mid.id === M.machine().id && fs.existsSync(path.join(data, 'sync', 'machine.json')), 'main: a stable machine id (sync\'s own file)');
  } finally { fs.rmSync(TMP, { recursive: true, force: true }); }

  console.log(`${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
