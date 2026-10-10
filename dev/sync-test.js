#!/usr/bin/env node
// Sync engine tests (no Electron): two "computers" (two data folders + two app folders) and one shared "cloud drive"
// folder, all in a temp dir. Never touches real data or real cloud folders.
//   node dev/sync-test.js [--fuzz N] [--seed S] [--keep]
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const S = require('../sync-merge');
const { createEngine, hearthIn } = require('../sync-engine');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const FUZZ = Number(arg('--fuzz', 220));
let seed = Number(arg('--seed', 1234567));
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

let failures = 0; let passes = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const eqj = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-sync-test-'));
const W = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const R = (file) => fs.readFileSync(file, 'utf8');
const J = (file) => JSON.parse(R(file));
const has = (file) => fs.existsSync(file);
const bump = (file) => { const t = new Date(Date.now() + Math.floor(rnd() * 1000) + 1000 * (++bumps)); fs.utimesSync(file, t, t); };
let bumps = 0;

// one computer: data/, app/config.json, app/theme.css, a home folder
function computer(world, name, extra = {}) {
  const base = path.join(world.dir, name);
  const m = {
    name,
    data: path.join(base, 'data'),
    config: path.join(base, 'app', 'config.json'),
    theme: path.join(base, 'app', 'theme.css'),
    home: path.join(base, 'home'),
    pulled: [],
  };
  fs.mkdirSync(m.data, { recursive: true }); fs.mkdirSync(m.home, { recursive: true });
  if (!has(m.config)) W(m.config, `${JSON.stringify({ agents: [{ id: 'claude', name: 'Claude', mode: 'native' }], theme: { accent: '#ff0' }, layout: { gridColumns: 2 }, settings: { notify: true, enginePaths: { claude: `${m.home}/bin/claude` } } }, null, 2)}\n`);
  if (!has(m.theme)) W(m.theme, '/* theme */\n');
  m.make = (o = {}) => createEngine({ dataDir: m.data, configPath: m.config, themePath: m.theme, cloudRoot: world.cloud, machineName: name, home: m.home, settleMs: 0, chunk: 256 * 1024, onPulled: (l) => m.pulled.push(...l), ...extra, ...o });
  m.e = m.make();
  m.p = (rel) => path.join(m.data, ...rel.split('/'));
  return m;
}
function world(name) {
  const dir = path.join(ROOT, name);
  const w = { dir, cloud: path.join(dir, 'cloud') };
  fs.mkdirSync(w.cloud, { recursive: true });
  return w;
}
const cloudFile = (w, rel) => path.join(w.cloud, 'Hearth', 'files', ...rel.split('/'));
async function settle(...ms) { for (let i = 0; i < 3; i++) for (const m of ms) await m.e.pass(); }
const chat = (id, msgs, extra = {}) => ({ id, agentId: 'claude', title: `Chat ${id}`, updatedAt: 1, messages: msgs, ...extra });
const msg = (role, at, text) => ({ role, at, text });
// the synced part of a data folder: rel → content hash (JSON compared in cloud form via each machine's own paths)
function snapshot(m) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!S.localOnly(`${r}/x`)) walk(path.join(dir, e.name), r); continue; }
      if (S.ignoredName(e.name) || S.localOnly(r)) continue;
      const raw = fs.readFileSync(path.join(dir, e.name));
      out[r] = S.isJsonRel(r) ? JSON.stringify(S.toCloud(JSON.parse(raw), m.e.ctx())) : crypto.createHash('sha1').update(raw).digest('hex');
    }
  };
  walk(m.data, '');
  return out;
}

async function main() {
  // ---------- pure parts ----------
  {
    const r = S.merge3({ a: 1, b: 1, list: [{ id: 1, v: 1 }] }, { a: 2, b: 1, list: [{ id: 1, v: 1 }, { id: 2, v: 2 }] }, { a: 1, b: 3, list: [{ id: 1, v: 5 }, { id: 3, v: 3 }] });
    ok(eqj(r.value, { a: 2, b: 3, list: [{ id: 1, v: 5 }, { id: 2, v: 2 }, { id: 3, v: 3 }] }) && !r.conflicts.length, 'merge3: fields and keyed lists merge');
    const c = S.merge3({ t: 'a' }, { t: 'b' }, { t: 'c' });
    ok(c.value.t === 'b' && c.conflicts.length === 1 && c.conflicts[0].path === 't', 'merge3: a true conflict keeps ours and is reported');
    const d = S.merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 });
    ok(eqj(d.value, { a: 1, c: 3 }), 'merge3: a removal on one side and an addition on the other');
    const u = S.merge3({ n: 10, updatedAt: 5 }, { n: 12, updatedAt: 9 }, { n: 15, updatedAt: 7 }, { counters: true });
    ok(u.value.n === 17 && u.value.updatedAt === 9 && !u.conflicts.length, 'merge3: counters add both increments, times take the latest');
    const two = S.merge3(null, { a: 1, list: [1, 2] }, { b: 2, list: [2, 3] });
    ok(eqj(two.value, { a: 1, list: [1, 2, 3], b: 2 }), 'merge3: first join (no base) unions both sides');
    const msgs = S.merge3({ m: [msg('user', 1, 'a')] }, { m: [msg('user', 1, 'a'), msg('assistant', 5, 'b')] }, { m: [msg('user', 1, 'a'), msg('user', 3, 'c')] });
    ok(eqj(msgs.value.m.map((x) => x.at), [1, 3, 5]), 'merge3: chat messages added on two computers stay, in time order');

    const win = { dataDir: 'C:\\Users\\quent\\agent-hub\\data', cloudRoot: 'C:\\Users\\quent\\Dropbox', home: 'C:\\Users\\quent', win: true };
    const mac = { dataDir: '/Users/quent/Library/Application Support/Hearth/data', cloudRoot: '/Users/quent/Library/CloudStorage/Dropbox', home: '/Users/quent', win: false };
    const v = { a: 'C:\\Users\\quent\\agent-hub\\data\\attachments\\x.png', b: 'c:/users/quent/Dropbox/footage/clip.mp4', c: 'C:\\Users\\quent\\Desktop\\song.mp3', u: 'file:///C:/Users/quent/agent-hub/data/refs/a%20b.png', d: 'D:\\other\\x.mp4', n: 'hello' };
    const cl = S.toCloud(v, win);
    ok(cl.a === 'hearth-data:/attachments/x.png' && cl.b === 'hearth-cloud:/footage/clip.mp4' && cl.c === 'hearth-home:/Desktop/song.mp3' && cl.u === 'hearth-data-url:/refs/a%20b.png' && cl.d === v.d, 'paths: Windows paths to cloud form');
    const onMac = S.fromCloud(cl, mac);
    ok(onMac.a === '/Users/quent/Library/Application Support/Hearth/data/attachments/x.png' && onMac.b === '/Users/quent/Library/CloudStorage/Dropbox/footage/clip.mp4' && onMac.c === '/Users/quent/Desktop/song.mp3' && onMac.u === 'file:///Users/quent/Library/Application%20Support/Hearth/data/refs/a%20b.png', 'paths: cloud form to Mac paths');
    ok(eqj(S.toCloud(onMac, mac), cl), 'paths: Mac → cloud gives the same cloud form (no back-and-forth churn)');
    ok(S.fromCloud(cl, win).a === v.a, 'paths: back on Windows, backslashes');
    // a stale Windows path already on the Mac (another computer's folders are aliases)
    const macA = { ...mac, aliases: { data: [win.dataDir], home: [win.home], cloud: [win.cloudRoot] } };
    ok(S.fromCloud(S.toCloud({ p: 'C:\\Users\\quent\\agent-hub\\data\\refs\\r.png' }, macA), mac).p === '/Users/quent/Library/Application Support/Hearth/data/refs/r.png', 'paths: the other computer\'s old paths are fixed too');

    const pc = S.portableConfig({ agents: [{ id: 'a', name: 'A', folder: 'C:\\work' }], layout: { gridColumns: 3 }, settings: { notify: true, enginePaths: { claude: 'x' }, ffmpegPath: 'C:\\ff', hotkey: 'Control+Alt+H', videoDirs: ['C:\\v'] }, theme: { accent: '#f00' } });
    ok(eqj(pc, { agents: [{ id: 'a', name: 'A' }], settings: { notify: true }, theme: { accent: '#f00' } }), 'config: machine paths, engines, hotkey and layout stay local');
    const back = S.applyPortable({ agents: [{ id: 'a', name: 'A', folder: '/Users/q/work' }], layout: { gridColumns: 1 }, settings: { enginePaths: { claude: '/opt/claude' }, notify: false } }, { agents: [{ id: 'a', name: 'A2' }, { id: 'b', name: 'B' }], settings: { notify: true }, theme: { accent: '#0f0' } });
    ok(back.agents[0].folder === '/Users/q/work' && back.agents[0].name === 'A2' && back.agents[1].id === 'b' && back.settings.enginePaths.claude === '/opt/claude' && back.settings.notify === true && back.layout.gridColumns === 1 && back.theme.accent === '#0f0', 'config: portable part applied, this computer\'s parts kept');

    for (const n of ['.icloud', 'x.icloud', '~$doc.docx', 'a.tmp', 'desktop.ini', '.DS_Store', 'Doc.gdoc', 'Thumbs.db', '.hearth-tmp-1-a.json', 'x.json.hubtmp', '.hearth-part-x.mp4', 'kv.prev.json']) ok(S.ignoredName(n), `ignored: ${n}`);
    for (const r of ['sync/state.json', 'workspace/x', 'window.json', 'engine.log', 'captures/frames/1.png', 'mcp-forgeheart.json', 'kv/a.prev.json']) ok(S.localOnly(r), `local only: ${r}`);
    for (const r of ['chats/a.json', 'kv/three-sketches.json', 'captures/recordings/x.mp4', 'board/media/a.png', 'memory.json', 'prompts/x.md', 'trash/c.json']) ok(!S.localOnly(r), `syncs: ${r}`);

    // finding drives (a fake file system, no real folders)
    const fake = new Set(['/Users/q/Library/CloudStorage', '/Users/q/Library/CloudStorage/GoogleDrive-q@x.com', '/Users/q/Library/CloudStorage/GoogleDrive-q@x.com/My Drive', '/Users/q/Library/CloudStorage/Dropbox', '/Users/q/Library/Mobile Documents/com~apple~CloudDocs', '/Users/q/Library/CloudStorage/OneDrive-Personal']);
    const io = { platform: 'darwin', home: '/Users/q', exists: (p) => fake.has(p), readdir: (p) => [...fake].filter((f) => path.posix.dirname(f) === p).map((f) => path.posix.basename(f)), readJson: () => null };
    const found = S.detectClouds(io);
    ok(found.map((f) => f.id).sort().join() === 'dropbox,gdrive,icloud,onedrive' && found.find((f) => f.id === 'gdrive').root.endsWith('My Drive'), 'detect: Mac drives (iCloud, Google Drive, Dropbox, OneDrive)');
    ok(S.proposeCloud(found).id === 'dropbox' && S.proposeCloud(found.map((f) => (f.id === 'icloud' ? { ...f, hearth: { lastSeen: 5 } } : f))).id === 'icloud', 'detect: proposes the drive that already has Hearth, else Dropbox');
    const wfake = new Set(['C:\\Users\\q\\Dropbox', 'G:\\My Drive', 'C:\\Users\\q\\OneDrive', 'C:\\Users\\q\\iCloudDrive']);
    const wfound = S.detectClouds({ platform: 'win32', home: 'C:\\Users\\q', env: { USERPROFILE: 'C:\\Users\\q', OneDrive: 'C:\\Users\\q\\OneDrive' }, exists: (p) => wfake.has(p), readdir: () => [], readJson: () => null });
    ok(wfound.length === 4 && wfound.some((f) => f.root === 'G:\\My Drive'), 'detect: Windows drives (G:\\My Drive, %OneDrive%, iCloudDrive, Dropbox)');
  }

  // ---------- two computers ----------
  const w = world('basic');
  const A = computer(w, 'Mac');
  const B = computer(w, 'PC');
  W(A.p('chats/c1.json'), JSON.stringify(chat('c1', [msg('user', 1, 'hi'), msg('assistant', 2, 'hello')]), null, 2));
  W(A.p('kv/three-sketches.json'), JSON.stringify({ s1: { name: 'Orb', code: 'a' }, s2: { name: 'Waves', code: 'b' } }));
  W(A.p('attachments/pic.png'), crypto.randomBytes(5000));
  W(A.p('chats/c2.json'), JSON.stringify(chat('c2', [msg('user', 1, 'see'), msg('user', 2, A.p('attachments/pic.png'))])));
  W(A.p('workspace/session.json'), '{}'); W(A.p('window.json'), '{"x":1}');
  let r = await A.e.pass();
  ok(r.state === 'synced' && r.last.pushed >= 5, `first computer pushes (${r.state}, ${r.last.pushed})`);
  ok(has(cloudFile(w, 'chats/c1.json')) && !has(cloudFile(w, 'workspace/session.json')) && !has(cloudFile(w, 'window.json')), 'machine-only files stay local');
  ok(R(cloudFile(w, 'chats/c2.json')).includes('hearth-data:/attachments/pic.png'), 'cloud copy stores data paths relative to the data folder');
  ok(hearthIn(w.cloud)?.machines?.length === 1, 'the second computer can see the existing Hearth');
  r = await B.e.pass();
  ok(r.state === 'synced' && has(B.p('chats/c1.json')) && has(B.p('attachments/pic.png')), 'second computer pulls everything');
  ok(J(B.p('chats/c2.json')).messages[1].text === B.p('attachments/pic.png'), 'attachment path points into the second computer\'s data folder');
  ok(J(B.config).settings.enginePaths.claude.startsWith(B.home) && J(B.config).agents.length === 1, 'config: engine paths stay per computer');
  ok(eqj(snapshot(A), snapshot(B)), 'both data folders match');

  // edits on both sides, different files
  W(A.p('kv/notes.json'), JSON.stringify({ list: [{ id: 'n1', text: 'from mac' }] }));
  W(B.p('memory.json'), JSON.stringify({ shared: 'likes orbs', agents: {} }));
  await settle(A, B);
  ok(J(B.p('kv/notes.json')).list[0].text === 'from mac' && J(A.p('memory.json')).shared === 'likes orbs', 'edits on both sides cross over');

  // concurrent edits of the same chat (append-only) and the same store (different fields): merged, no conflict
  const c1a = J(A.p('chats/c1.json')); c1a.messages.push(msg('user', 10, 'mac says')); c1a.updatedAt = 10; W(A.p('chats/c1.json'), JSON.stringify(c1a, null, 2));
  const c1b = J(B.p('chats/c1.json')); c1b.messages.push(msg('user', 11, 'pc says'), msg('assistant', 12, 'reply on pc')); c1b.updatedAt = 12; W(B.p('chats/c1.json'), JSON.stringify(c1b, null, 2));
  const ska = J(A.p('kv/three-sketches.json')); ska.s1.name = 'Orb 2'; W(A.p('kv/three-sketches.json'), JSON.stringify(ska));
  const skb = J(B.p('kv/three-sketches.json')); skb.s2.code = 'bb'; skb.s3 = { name: 'New', code: 'c' }; W(B.p('kv/three-sketches.json'), JSON.stringify(skb));
  await settle(A, B);
  const merged = J(A.p('chats/c1.json'));
  ok(merged.messages.length === 5 && eqj(merged.messages.map((x) => x.at), [1, 2, 10, 11, 12]) && merged.updatedAt === 12, 'concurrent chat messages merge in time order');
  const sk = J(B.p('kv/three-sketches.json'));
  ok(sk.s1.name === 'Orb 2' && sk.s2.code === 'bb' && sk.s3 && eqj(J(A.p('kv/three-sketches.json')), sk), 'scenes merge field by field');
  ok(!(await A.e.conflicts()).length, 'no conflict for clean merges');
  ok(eqj(snapshot(A), snapshot(B)), 'both match after merges');

  // a true conflict: the same field changed two ways
  const t1 = J(A.p('chats/c1.json')); t1.title = 'Mac title'; W(A.p('chats/c1.json'), JSON.stringify(t1, null, 2));
  const t2 = J(B.p('chats/c1.json')); t2.title = 'PC title'; W(B.p('chats/c1.json'), JSON.stringify(t2, null, 2));
  await A.e.pass(); r = await B.e.pass(); await A.e.pass();
  const cf = await B.e.conflicts();
  ok(cf.length === 1 && cf[0].rel === 'chats/c1.json' && cf[0].fields[0].path === 'title' && r.state === 'conflict', 'a true conflict is recorded with the field');
  ok(J(A.p('chats/c1.json')).title === J(B.p('chats/c1.json')).title, 'one version wins on both computers');
  const winner = J(B.p('chats/c1.json')).title;
  await B.e.resolve(cf[0].id, 'theirs');
  await settle(B, A);
  ok(J(A.p('chats/c1.json')).title !== winner && J(A.p('chats/c1.json')).title === J(B.p('chats/c1.json')).title && !(await A.e.conflicts()).length, '"use the other version" swaps on both computers and clears the conflict');

  // whole-file conflict (theme.css): both kept
  W(A.theme, '/* mac theme */'); W(B.theme, '/* pc theme, longer */');
  await A.e.pass(); await B.e.pass(); await A.e.pass();
  const fc = (await A.e.conflicts()).find((c) => c.rel === 'app/theme.css');
  ok(fc && R(A.theme) === R(B.theme) && has(path.join(w.cloud, 'Hearth', '.sync', 'conflicts', fc.copy)), 'whole-file conflict: one in place, the other kept as a copy');
  await A.e.resolve(fc.id, 'mine');
  ok(!(await A.e.conflicts()).length, 'dismissing a conflict');

  // deletes + restore
  fs.rmSync(A.p('chats/c2.json'));
  await A.e.pass();
  ok(!has(cloudFile(w, 'chats/c2.json')), 'a delete reaches the cloud…');
  const tr = await A.e.trash();
  ok(tr.some((t) => t.rel === 'chats/c2.json' && t.where === 'cloud'), '…and waits in the synced trash');
  await B.e.pass();
  ok(!has(B.p('chats/c2.json')) && (await B.e.trash()).some((t) => t.rel === 'chats/c2.json' && t.where === 'here'), 'the other computer moves its copy to its own trash (recoverable)');
  const item = (await B.e.trash()).find((t) => t.rel === 'chats/c2.json' && t.where === 'cloud');
  const rs = await B.e.restore(item.id);
  await settle(B, A);
  ok(rs.ok && has(A.p('chats/c2.json')) && has(B.p('chats/c2.json')) && J(A.p('chats/c2.json')).messages[1].text === A.p('attachments/pic.png'), 'restore from the synced trash brings it back on both');

  // changed here while deleted there: kept
  fs.rmSync(A.p('kv/notes.json'));
  const nb = J(B.p('kv/notes.json')); nb.list.push({ id: 'n2', text: 'pc note' }); W(B.p('kv/notes.json'), JSON.stringify(nb));
  await A.e.pass(); await B.e.pass(); await A.e.pass();
  ok(has(A.p('kv/notes.json')) && J(A.p('kv/notes.json')).list.length === 2, 'a delete never wins over an edit made meanwhile');

  // renames (a chat to the trash folder, a big recording moved): moved, not copied again
  fs.mkdirSync(A.p('trash'), { recursive: true });
  fs.renameSync(A.p('chats/c2.json'), A.p('trash/c2.json'));
  const big = crypto.randomBytes(9 * 1024 * 1024 + 123);
  W(A.p('captures/recordings/take.mp4'), big);
  await settle(A, B);
  ok(has(B.p('captures/recordings/take.mp4')) && fs.statSync(B.p('captures/recordings/take.mp4')).size === big.length, 'a big file (9 MB) syncs in chunks');
  fs.mkdirSync(A.p('captures/keep'), { recursive: true });
  fs.renameSync(A.p('captures/recordings/take.mp4'), A.p('captures/keep/take-final.mp4'));
  r = await A.e.pass();
  ok(r.last.renamed === 1 && r.last.pushed === 0, `a moved big file is moved in the cloud, not uploaded again (renamed ${r.last.renamed}, pushed ${r.last.pushed})`);
  r = await B.e.pass();
  ok(r.last.renamed >= 1 && has(B.p('captures/keep/take-final.mp4')) && !has(B.p('captures/recordings/take.mp4')) && has(B.p('trash/c2.json')), 'renames repeat on the other computer');

  // "Sync big videos" off: big files stay on each computer
  B.e.set({ big: false, bigCap: 1024 * 1024 });
  W(B.p('captures/recordings/huge.mp4'), crypto.randomBytes(2 * 1024 * 1024));
  r = await B.e.pass();
  ok(!has(cloudFile(w, 'captures/recordings/huge.mp4')) && r.skippedBig.includes('captures/recordings/huge.mp4') && has(B.p('captures/keep/take-final.mp4')), 'big videos off: skipped and listed, nothing deleted');
  B.e.set({ big: true });
  await settle(B, A);
  ok(has(A.p('captures/recordings/huge.mp4')), 'big videos on again: they sync');

  // cloud clients' own files are ignored (never pulled, never deleted)
  const junk = ['.DS_Store', 'desktop.ini', '~$notes.docx', 'x.tmp', 'Plan.gdoc', '.hearth-tmp-ab12cd34-c1.json', 'kv/.~lock.notes.json#', 'Icon\r'];
  for (const j of junk) W(cloudFile(w, j), 'junk');
  await settle(A, B);
  ok(junk.every((j) => !has(A.p(j)) && !has(B.p(j))) && junk.every((j) => has(cloudFile(w, j))), 'cloud temp files ignored on both sides');

  // an iCloud placeholder for a known file: not a delete, waits
  const vid = cloudFile(w, 'captures/keep/take-final.mp4');
  fs.renameSync(vid, path.join(path.dirname(vid), '.take-final.mp4.icloud'));
  r = await B.e.pass();
  ok(has(B.p('captures/keep/take-final.mp4')) && r.state === 'synced', 'an evicted iCloud file (".icloud" stub) is not a delete');
  fs.renameSync(path.join(path.dirname(vid), '.take-final.mp4.icloud'), vid);

  // a file the other computer is still bringing down (journal says 300 bytes, only 100 arrived)
  W(A.p('board/media/clip.png'), crypto.randomBytes(300));
  await A.e.pass();
  const cpng = cloudFile(w, 'board/media/clip.png');
  const full = fs.readFileSync(cpng);
  fs.writeFileSync(cpng, full.subarray(0, 100));
  r = await B.e.pass();
  ok(!has(B.p('board/media/clip.png')) && r.pending >= 1, 'a half-arrived file waits');
  fs.writeFileSync(cpng, full);
  await B.e.pass();
  ok(has(B.p('board/media/clip.png')) && fs.readFileSync(B.p('board/media/clip.png')).equals(full), 'then arrives whole');

  // a JSON store half written in the cloud (a cloud client mid-download): waits, never merged
  const half = cloudFile(w, 'kv/three-sketches.json');
  const halfFull = R(half);
  W(half, halfFull.slice(0, 20));
  r = await B.e.pass();
  ok(eqj(J(B.p('kv/three-sketches.json')), JSON.parse(halfFull.replace(/hearth-data:\/[^"]*/g, (s) => S.strFromCloud(s, B.e.ctx())))) && r.pending >= 1, 'a half-written JSON store in the cloud waits');
  W(half, halfFull);

  // Dropbox "conflicted copy": merged back into the store
  const nbx = J(cloudFile(w, 'kv/notes.json')); nbx.list.push({ id: 'n9', text: 'from a conflicted copy' });
  W(cloudFile(w, 'kv/notes (PC\'s conflicted copy 2026-10-10).json'), JSON.stringify(nbx));
  await settle(A, B);
  ok(J(A.p('kv/notes.json')).list.some((x) => x.id === 'n9') && J(B.p('kv/notes.json')).list.some((x) => x.id === 'n9') && !has(cloudFile(w, 'kv/notes (PC\'s conflicted copy 2026-10-10).json')), 'a cloud client\'s conflicted copy is merged in, then trashed');

  // offline (the drive gone), edits meanwhile, back online
  const away = `${w.cloud}-away`;
  fs.renameSync(w.cloud, away);
  W(A.p('kv/offline.json'), JSON.stringify({ made: 'offline' }));
  r = await A.e.pass();
  ok(r.state === 'offline' && has(A.p('kv/offline.json')) && has(A.p('chats/c1.json')), 'offline is calm: nothing changes, status offline');
  fs.renameSync(away, w.cloud);
  await settle(A, B);
  ok(J(B.p('kv/offline.json')).made === 'offline' && A.e.status().state === 'synced', 'back online: catches up');

  // the Hearth folder in the cloud deleted by hand: nothing is deleted locally, sync waits
  fs.renameSync(path.join(w.cloud, 'Hearth', 'files'), path.join(w.cloud, 'Hearth', 'files-gone'));
  r = await B.e.pass();
  ok(r.state === 'offline' && r.error === 'missing' && has(B.p('chats/c1.json')), 'a missing cloud Hearth folder never empties this computer');
  fs.renameSync(path.join(w.cloud, 'Hearth', 'files-gone'), path.join(w.cloud, 'Hearth', 'files'));

  // many deletions at once wait for a yes
  for (let i = 0; i < 40; i++) W(A.p(`chats/bulk${i}.json`), JSON.stringify(chat(`bulk${i}`, [msg('user', i, 'x')])));
  await settle(A, B);
  for (let i = 0; i < 40; i++) fs.rmSync(A.p(`chats/bulk${i}.json`));
  r = await A.e.pass();
  ok(r.state === 'held' && r.held.deletes === 40 && has(cloudFile(w, 'chats/bulk1.json')), 'many deletions at once are held');
  r = await A.e.pass({ mass: 'keep' });
  ok(has(A.p('chats/bulk1.json')) && has(cloudFile(w, 'chats/bulk1.json')), '"keep them" brings them back');
  for (let i = 0; i < 40; i++) fs.rmSync(A.p(`chats/bulk${i}.json`));
  await A.e.pass(); r = await A.e.pass({ mass: 'apply' });
  await B.e.pass({ mass: 'apply' });
  ok(!has(B.p('chats/bulk1.json')) && (await B.e.trash()).some((t) => t.rel === 'chats/bulk1.json'), '"delete them" deletes (to the trash) on both');

  // the write guard: the app saves an older in-memory chat after a pull; the other computer's message survives
  const g = J(A.p('chats/c1.json')); g.messages.push(msg('user', 100, 'new on mac')); W(A.p('chats/c1.json'), JSON.stringify(g, null, 2));
  const stale = J(B.p('chats/c1.json')); // B's app holds this in memory
  await A.e.pass(); await B.e.pass();
  ok(B.e.hasPulled('chats/c1.json'), 'the pull is remembered for the guard');
  stale.messages.push(msg('user', 101, 'typed on pc meanwhile'));
  const guarded = B.e.guardWrite(B.p('chats/c1.json'), stale);
  ok(guarded.messages.some((x) => x.text === 'new on mac') && guarded.messages.some((x) => x.text === 'typed on pc meanwhile'), 'a stale save is merged with what arrived');
  W(B.p('chats/c1.json'), JSON.stringify(guarded, null, 2));
  B.e.ackPulled();
  await settle(B, A);
  ok(J(A.p('chats/c1.json')).messages.some((x) => x.text === 'typed on pc meanwhile'), 'and reaches the other computer');

  // config: agents travel, engine paths stay
  const ca = J(A.config); ca.agents.push({ id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' }); ca.settings.enginePaths = { claude: '/mac/claude' }; ca.theme.accent = '#123456'; W(A.config, JSON.stringify(ca, null, 2));
  await settle(A, B);
  const cb = J(B.config);
  ok(cb.agents.some((x) => x.id === 'astra') && cb.theme.accent === '#123456' && cb.settings.enginePaths.claude.startsWith(B.home) && cb.layout.gridColumns === 2, 'config: agents and look travel; engine paths and layout stay');
  B.e.ackPulled(['app/config.json']); // the app reloaded its config (config:changed)
  const cfgGuard = B.e.guardWrite(B.config, { ...J(B.config), agents: [{ id: 'claude', name: 'Claude', mode: 'native' }] });
  ok(cfgGuard.agents.length === 1, 'config guard keeps an intended removal after the app reloaded (no pull pending: untouched)');

  // a crash mid-sync (between the temp file and the rename): the next start finishes cleanly
  W(A.p('kv/crash1.json'), JSON.stringify({ a: 1 })); W(A.p('kv/crash2.json'), JSON.stringify({ b: 2 })); W(A.p('kv/crash3.json'), JSON.stringify({ c: 3 }));
  let n = 0;
  const crashing = A.make({ fault: (stage) => { if (stage === 'push' && ++n === 2) throw Object.assign(new Error('power cut'), { code: 'FAULT' }); } });
  let crashed = false; try { await crashing.pass(); } catch (err) { crashed = err.code === 'FAULT'; }
  ok(crashed, 'simulated crash happened');
  A.e = A.make();
  await settle(A, B);
  ok(['crash1', 'crash2', 'crash3'].every((k) => has(B.p(`kv/${k}.json`))) && eqj(snapshot(A), snapshot(B)), 'after the crash: resumed, nothing lost, both match');

  // a big copy cut short resumes where it stopped
  const big2 = crypto.randomBytes(12 * 1024 * 1024 + 7);
  W(A.p('captures/recordings/long.mp4'), big2);
  let chunks = 0;
  const cut = A.make({ fault: (stage) => { if (stage === 'chunk' && ++chunks === 20) throw Object.assign(new Error('quit'), { code: 'FAULT' }); } });
  try { await cut.pass(); } catch { /* the cut */ }
  const parts = fs.readdirSync(path.dirname(cloudFile(w, 'captures/recordings/long.mp4'))).filter((f) => f.includes('.hearth-part-long'));
  ok(parts.length >= 1, 'a cut-short copy leaves a resumable part');
  A.e = A.make();
  r = await A.e.pass();
  ok(r.resumed >= 1 && r.bytes < big2.length && fs.readFileSync(cloudFile(w, 'captures/recordings/long.mp4')).equals(big2), `the copy resumed (${Math.round(r.bytes / 1024)} KB copied after the cut of ${Math.round(big2.length / 1024)} KB)`);
  await B.e.pass();
  ok(fs.readFileSync(B.p('captures/recordings/long.mp4')).equals(big2), 'and arrives whole on the other computer');

  // both computers syncing at the same moment
  for (let i = 0; i < 5; i++) {
    const a = J(A.p('chats/c1.json')); a.messages.push(msg('user', 1000 + i * 2, `mac ${i}`)); W(A.p('chats/c1.json'), JSON.stringify(a, null, 2));
    const b = J(B.p('chats/c1.json')); b.messages.push(msg('user', 1001 + i * 2, `pc ${i}`)); W(B.p('chats/c1.json'), JSON.stringify(b, null, 2));
    await Promise.all([A.e.pass(), B.e.pass()]);
  }
  await settle(A, B);
  const both = J(A.p('chats/c1.json')).messages.map((x) => x.text);
  ok([0, 1, 2, 3, 4].every((i) => both.includes(`mac ${i}`) && both.includes(`pc ${i}`)) && eqj(snapshot(A), snapshot(B)), 'simultaneous passes on both computers: every message kept');

  // a third computer joins an existing Hearth with its own data: merged, never overwritten
  const C3 = computer(w, 'Laptop');
  W(C3.p('chats/c1.json'), JSON.stringify(chat('c1', [msg('user', 1, 'hi'), msg('user', 5000, 'laptop only')])));
  W(C3.p('kv/laptop.json'), JSON.stringify({ mine: true }));
  await settle(C3, A, B);
  ok(J(A.p('chats/c1.json')).messages.some((x) => x.text === 'laptop only') && J(C3.p('chats/c1.json')).messages.some((x) => x.text === 'mac 4') && has(B.p('kv/laptop.json')), '"Use this Hearth" on a new computer merges both ways');
  ok(eqj(snapshot(A), snapshot(B)) && eqj(snapshot(A), snapshot(C3)), 'three computers match');

  await fuzz();

  console.log(`\n${passes} passed, ${failures} failed`);
  if (!argv.includes('--keep')) fs.rmSync(ROOT, { recursive: true, force: true });
  else console.log(`kept: ${ROOT}`);
  process.exit(failures ? 1 : 0);
}

// ---------- randomized: two computers, random edits, random (sometimes simultaneous) passes; nothing lost ----------
async function fuzz() {
  const w = world('fuzz');
  const A = computer(w, 'Mac'); const B = computer(w, 'PC');
  const ms = [A, B];
  const made = new Set(); // every message text ever written
  const blobs = new Map(); // rel → last content written (any computer)
  let ids = 0;
  const chats = () => (m) => (fs.existsSync(m.p('chats')) ? fs.readdirSync(m.p('chats')).filter((f) => f.endsWith('.json')) : []);
  let inflight = null; // sometimes a pass runs while the next edits happen (the app saving mid-sync)
  for (let step = 0; step < FUZZ; step++) {
    const m = pick(ms);
    if (inflight && rnd() < 0.5) { await inflight; inflight = null; }
    await new Promise((res) => setImmediate(res));
    const list = chats()(m);
    const act = rnd();
    try {
      if (act < 0.2 || !list.length) { // new chat
        const id = `f${++ids}`;
        const t = `${m.name}-new-${id}`; made.add(t);
        W(m.p(`chats/${id}.json`), JSON.stringify(chat(id, [msg('user', step, t)], { updatedAt: step }), null, 2));
      } else if (act < 0.6) { // append
        const f = pick(list); const c = J(m.p(`chats/${f}`));
        const t = `${m.name}-s${step}`; made.add(t);
        c.messages.push(msg(rnd() < 0.5 ? 'user' : 'assistant', step + rnd(), t)); c.updatedAt = step;
        W(m.p(`chats/${f}`), JSON.stringify(c, null, 2));
      } else if (act < 0.68) { // rename title (may conflict)
        const f = pick(list); const c = J(m.p(`chats/${f}`)); c.title = `${m.name} ${step}`; W(m.p(`chats/${f}`), JSON.stringify(c, null, 2));
      } else if (act < 0.74) { // delete a chat (to the app's trash folder, as Hearth does)
        const f = pick(list); fs.mkdirSync(m.p('trash'), { recursive: true });
        if (!has(m.p(`trash/${f}`))) fs.renameSync(m.p(`chats/${f}`), m.p(`trash/${f}`));
      } else if (act < 0.86) { // a store, field-level edits
        const file = m.p('kv/scenes.json'); const v = has(file) ? J(file) : {};
        const k = `k${Math.floor(rnd() * 6)}`; v[k] = { ...(v[k] || {}), [`${m.name}${Math.floor(rnd() * 3)}`]: step };
        W(file, JSON.stringify(v));
      } else { // binary files: new or replaced
        const rel = `board/media/b${Math.floor(rnd() * 5)}.bin`;
        const buf = crypto.randomBytes(200 + Math.floor(rnd() * 3000)); W(m.p(rel), buf); blobs.set(rel, true);
      }
    } catch (err) { console.log('fuzz step error', err.message); }
    const sync = rnd();
    if (inflight) continue;
    if (sync < 0.2) await m.e.pass();
    else if (sync < 0.32) await Promise.all([A.e.pass(), B.e.pass()]);
    else if (sync < 0.42) inflight = Promise.all([A.e.pass(), B.e.pass()]);
  }
  if (inflight) await inflight;
  for (let i = 0; i < 4; i++) { await A.e.pass(); await B.e.pass(); }
  const sa = snapshot(A); const sb = snapshot(B);
  ok(eqj(sa, sb), `fuzz (${FUZZ} steps): both computers end identical`);
  if (!eqj(sa, sb)) for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (sa[k] !== sb[k]) console.log('  differs:', k);
  // every message ever typed is in a chat, in the app's trash, or in a synced / local trash
  const texts = new Set();
  const scan = (dir) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) scan(f); else if (f.endsWith('.json')) { try { const c = JSON.parse(R(f)); for (const x of c.messages || []) texts.add(x.text); } catch { /* not a chat */ } } } };
  for (const m of ms) { scan(m.p('chats')); scan(m.p('trash')); scan(path.join(m.data, 'sync', 'trash')); }
  scan(path.join(w.cloud, 'Hearth', 'trash')); scan(path.join(w.cloud, 'Hearth', '.sync', 'conflicts'));
  const lost = [...made].filter((t) => !texts.has(t));
  ok(!lost.length, `fuzz: no message lost (${made.size} written${lost.length ? `, lost: ${lost.slice(0, 5).join(', ')}` : ''})`);
  const sc = has(A.p('kv/scenes.json')) ? J(A.p('kv/scenes.json')) : {};
  console.log(`  fuzz: ${made.size} messages, ${(await A.e.conflicts()).length} conflicts`);
  ok(Object.keys(sc).length > 0, `fuzz: the store merged (${Object.keys(sc).length} keys), ${(await A.e.conflicts()).length} conflicts recorded`);
}

main().catch((err) => { console.error(err); console.log('FAIL crashed'); process.exit(1); });
