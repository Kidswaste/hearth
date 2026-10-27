#!/usr/bin/env node
// (round 73, syncmedia73) Big files and choice, through the two-computer simulator (dev/sync-sim.js, the worlds of
// dev/sync72-test.js): each computer has its own view of the cloud drive and a fake provider moves files between them.
//   lanes      a big video copies on its own lane: a chat written meanwhile goes up (and reaches the Mac) at once;
//              progress per file; the half copy never sits in the cloud folder
//   rehash     big files are read once on the way up, never again when nothing changed (steady passes, a restart,
//              a renamed video); the Mac takes the hash from the journal
//   resume     Hearth quits mid-copy: the next start goes on from where it stopped
//   mix        both computers add big files and chats at once through a slow, piecemeal provider: identical, no copies
//   kinds      What syncs: a kind turned off is left alone on both sides (nothing deleted, nothing pending); turned on
//              again, everything is there on both; per-computer kinds start off; edits on both while off: both kept
//   free       Free up space: only big synced files are listed; the cloud drive's copy becomes online-only (Windows /
//              Mac dataless / iCloud stub); nothing downloads again; a change from the other computer still arrives;
//              never an unsynced file (Hearth's check, then the provider's); no provider tool → a plain "can't"
//   evict      cloud-evict.js: which tool per drive, what it checks after, the words when it can't
// Never touches real data or a real cloud drive: a temp folder.   node dev/syncmedia73-test.js [--only name] [--keep]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const Sim = require('./sync-sim');
const K = require('../sync-kinds');
const Evict = require('../cloud-evict');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`); } };
const MB = 1024 * 1024;
const rnd = (n) => crypto.randomBytes(n);
const io = () => { const t = fs.readFileSync('/proc/self/io', 'utf8'); const g = (k) => Number(new RegExp(`${k}: (\\d+)`).exec(t)?.[1] || 0); return { r: g('rchar'), w: g('wchar') }; };
const cloudFile = (m, rel) => path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/'));
const same = (a, b) => Boolean(a && b) && Buffer.compare(a, b) === 0;
const readOr = (f) => { try { return Sim.raw.readFileSync(f); } catch { return null; } };
const untilTrue = async (fn, ms = 20000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 5)); } return true; };
function partsIn(dir) { const out = []; const walk = (d) => { let es = []; try { es = Sim.raw.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.hearth-part/.test(e.name) && !/\.json$/.test(e.name)) out.push(f); } }; walk(dir); return out; }
// a copy held mid-way (the engine's test hook): resolves the first time it gets past `at` bytes
function holder(at) {
  const h = { on: true, hit: false, release: null };
  h.wait = async (_dst, pos) => { if (h.on && pos >= at) { h.hit = true; await new Promise((r) => { h.release = r; }); } };
  h.free = () => { h.on = false; h.release?.(); };
  return h;
}
// a file of that name in the cloud's synced trash (deleted everywhere)
function inTrash(m, name) { let hit = false; const walk = (d) => { let es = []; try { es = Sim.raw.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) walk(path.join(d, e.name)); else if (e.name.endsWith(name)) hit = true; } }; walk(path.join(m.cloudRoot, 'Hearth', 'trash')); return hit; }
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- 1. two lanes ----------
scenario('lanes', async () => {
  const w = T.world('m-lanes');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', nfd: true });
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hello')]));
  ok(await T.converge(w) > 0, 'lanes: the first chat syncs', T.why(w));
  const video = rnd(24 * MB);
  pc.write('renders/Intro final.mp4', video);
  const h = holder(12 * MB); pc.e.set({ chunkWait: h.wait });
  w.clock.advance(3000);
  const t0 = Date.now();
  const r1 = await pc.e.pass();
  ok(Date.now() - t0 < 5000 && !Sim.raw.existsSync(cloudFile(pc, 'renders/Intro final.mp4')), 'lanes: the pass ends without waiting for the video', { ms: Date.now() - t0 });
  ok(r1.pending >= 1 && r1.waiting.some((x) => x.rel === 'renders/Intro final.mp4' && x.why === 'queued'), 'lanes: the video is listed as waiting ("queued"), by name', r1.waiting);
  ok(await untilTrue(() => h.hit), 'lanes: the video copies on its own lane');
  const st = pc.e.status(); const tr = st.transfers?.[0];
  ok(tr && tr.rel === 'renders/Intro final.mp4' && tr.op === 'up' && tr.moving && tr.done >= 12 * MB && tr.done < tr.total && tr.total === video.length && st.moving === 1, 'lanes: its progress: up, moving, bytes done of the total', tr);
  ok(!partsIn(path.join(pc.cloudRoot, 'Hearth')).length && partsIn(path.join(pc.data, 'sync', 'parts')).length === 1, 'lanes: the half copy is put together in the sync folder, never in the cloud folder (no half upload)');
  // a chat written now goes up at once and reaches the Mac while the video is still on its way
  pc.write('chats/b.json', T.chat('b', [T.msg('user', 2, 'written while the video copies')]));
  w.clock.advance(3000);
  const r2 = await pc.e.pass();
  ok(Sim.raw.existsSync(cloudFile(pc, 'chats/b.json')) && r2.waiting.some((x) => x.rel === 'renders/Intro final.mp4' && x.why === 'moving'), 'lanes: the chat goes up while the video is moving', r2.waiting);
  pc.view.tick(); mac.view.tick(); w.clock.advance(3000);
  await mac.e.pass(); await mac.e.laneIdle();
  ok(mac.has('chats/b.json') && !mac.has('renders/Intro final.mp4'), 'lanes: the chat is on the Mac before the video');
  h.free(); await pc.e.laneIdle();
  ok(same(readOr(cloudFile(pc, 'renders/Intro final.mp4')), video) && !pc.e.status().moving, 'lanes: then the video lands whole in the cloud folder');
  ok(await T.converge(w) > 0, 'lanes: converges', T.why(w));
  ok(same(readOr(mac.p('renders/Intro final.mp4')), video), 'lanes: the video arrives whole on the Mac');
  // the journal: every file the lane and the passes wrote is announced once (flushes never overlap)
  const lines = Sim.raw.readFileSync(path.join(pc.cloudRoot, 'Hearth', '.sync', 'journal', `${pc.e.machine().id}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(['chats/a.json', 'chats/b.json', 'renders/Intro final.mp4'].every((r) => lines.some((j) => j.op === 'put' && j.rel === r)), 'lanes: the journal announces each file', lines.map((j) => j.rel));
});

// ---------- 2. no rehash ----------
scenario('rehash', async () => {
  const w = T.world('m-rehash');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const files = { 'renders/a.mp4': rnd(30 * MB), 'captures/recordings/b.mp4': rnd(20 * MB), 'creative-sketches/Night/stem 1.wav': rnd(12 * MB) };
  const total = Object.values(files).reduce((n, b) => n + b.length, 0);
  for (const [rel, b] of Object.entries(files)) pc.write(rel, b);
  pc.write('chats/c.json', T.chat('c', []));
  let a = io(); await pc.e.pass(); await pc.e.laneIdle(); await pc.e.pass(); let d = io().r - a.r;
  ok(d < total * 1.25 && d > total * 0.9, `rehash: the first upload reads each big file once (${Math.round(d / MB)} MB read for ${Math.round(total / MB)} MB; was twice)`);
  ok(await T.converge(w) > 0, 'rehash: converges', T.why(w));
  for (const [rel, b] of Object.entries(files)) ok(same(readOr(mac.p(rel)), b), `rehash: ${rel} whole on the Mac`);
  a = io(); for (let i = 0; i < 2; i++) { await pc.e.pass(); await mac.e.pass(); } d = io().r - a.r;
  ok(d < 2 * MB, `rehash: steady passes read nothing big (${Math.round(d / 1024)} KB)`);
  pc.e = pc.make(); mac.e = mac.make(); // Hearth restarted on both
  a = io(); await pc.e.pass(); await mac.e.pass(); d = io().r - a.r;
  ok(d < 2 * MB && !pc.e.status().pending && !mac.e.status().pending, `rehash: after a restart, nothing is read again (${Math.round(d / 1024)} KB)`);
  // a renamed video: moved in the cloud, not read, not uploaded again
  fs.mkdirSync(pc.p('renders/old'), { recursive: true }); fs.renameSync(pc.p('renders/a.mp4'), pc.p('renders/old/a.mp4'));
  w.clock.advance(3000);
  a = io(); const r = await pc.e.pass(); await pc.e.laneIdle(); d = io().r - a.r;
  ok(r.last.renamed === 1 && r.last.pushed === 0 && d < 2 * MB, `rehash: a renamed 30 MB video is moved in the cloud in one pass, not read (${Math.round(d / 1024)} KB) or uploaded`, r.last);
  ok(await T.converge(w) > 0 && mac.has('renders/old/a.mp4') && !mac.has('renders/a.mp4'), 'rehash: the Mac moves it too', T.why(w));
  // touched (same bytes, new time): read once to check, then nothing
  const t = new Date(pc.now() + 5000); fs.utimesSync(pc.p('captures/recordings/b.mp4'), t, t);
  await pc.e.pass(); await pc.e.laneIdle(); await pc.e.pass();
  a = io(); await pc.e.pass(); d = io().r - a.r;
  ok(d < 2 * MB && !pc.e.status().pending, 'rehash: a touched file is checked once, then left alone');
});

// ---------- 3. resume ----------
scenario('resume', async () => {
  const w = T.world('m-resume');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const big = rnd(20 * MB + 77);
  pc.write('captures/recordings/long take.mp4', big);
  const h = holder(10 * MB); pc.e.set({ chunkWait: h.wait });
  await pc.e.pass();
  ok(await untilTrue(() => h.hit), 'resume: the copy is half way');
  pc.e.stop(); h.free(); await pc.e.laneIdle(); // Hearth quits
  ok(!Sim.raw.existsSync(cloudFile(pc, 'captures/recordings/long take.mp4')) && partsIn(path.join(pc.data, 'sync', 'parts')).length === 1, 'resume: quit mid-copy: nothing half in the cloud, the part kept aside');
  pc.e = pc.make();
  const a = io(); await pc.e.pass(); await pc.e.laneIdle(); const st = pc.e.status(); const wrote = io().w - a.w;
  ok(st.resumed >= 1 && wrote < big.length * 0.65, `resume: the next start goes on where it stopped (${Math.round(wrote / MB)} MB written of ${Math.round(big.length / MB)} MB)`, { resumed: st.resumed });
  ok(same(readOr(cloudFile(pc, 'captures/recordings/long take.mp4')), big) && !partsIn(path.join(pc.data, 'sync', 'parts')).length, 'resume: whole in the cloud, the part gone');
  ok(await T.converge(w) > 0 && same(readOr(mac.p('captures/recordings/long take.mp4')), big), 'resume: whole on the Mac', T.why(w));
  // the source changed while the copy was stopped: never resumed into a mix of two versions
  const v2 = rnd(20 * MB + 77);
  pc.write('captures/recordings/long take.mp4', v2);
  const h2 = holder(8 * MB); pc.e.set({ chunkWait: h2.wait });
  w.clock.advance(3000); await pc.e.pass(); await pc.e.laneIdle(); // a changed big file: checked first (never uploaded if only touched)…
  await pc.e.pass(); // …then copied
  ok(await untilTrue(() => h2.hit), 'resume: a second version starts copying');
  pc.e.stop(); h2.free(); await pc.e.laneIdle();
  const v3 = rnd(20 * MB + 77); pc.write('captures/recordings/long take.mp4', v3);
  pc.e = pc.make();
  ok(await T.converge(w) > 0, 'resume: converges', T.why(w));
  ok(same(readOr(cloudFile(pc, 'captures/recordings/long take.mp4')), v3) && same(readOr(mac.p('captures/recordings/long take.mp4')), v3), 'resume: the newest version, whole, on both (no mix of two)');
});

// ---------- 4. a mix, both ways, through a slow provider ----------
scenario('mix', async () => {
  const w = T.world('m-mix');
  const pc = T.computer(w, 'PC', { platform: 'win32', slowUp: 1 * MB, upTicks: 3, skew: 40000 });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', nfd: true, partialDown: 1 * MB, downTicks: 2, skew: -30000 });
  const want = {};
  const put = (m, rel, b) => { m.write(rel, b); want[rel] = b; };
  put(pc, 'renders/Clink trailer.mp4', rnd(18 * MB)); put(pc, 'captures/recordings/Lab take one.mp4', rnd(9 * MB + 5));
  put(mac, 'creative-sketches/Night drive/bass.wav', rnd(10 * MB)); put(mac, 'creative-park/Park sketch/take two.wav', rnd(9 * MB));
  for (let i = 0; i < 8; i++) put(i % 2 ? pc : mac, `paris-photos/2026-10/p${i}.jpg`, rnd(150000 + i));
  put(pc, 'tickets/show-1/ticket.pdf', rnd(90000));
  for (let i = 0; i < 6; i++) (i % 2 ? pc : mac).write(`chats/m${i}.json`, T.chat(`m${i}`, [T.msg('user', i, `chat ${i}`)]));
  const n = await T.converge(w, 90);
  ok(n > 0, 'mix: converges (big files both ways, slow uploads, downloads in pieces, clocks apart)', T.why(w));
  for (const [rel, b] of Object.entries(want)) for (const m of [pc, mac]) ok(same(readOr(m.p(rel)), b), `mix: ${rel} whole on the ${m.name}`);
  ok(!T.copies(pc).length && !T.copies(mac).length, 'mix: no duplicate files', [...T.copies(pc), ...T.copies(mac)]);
  const ks = pc.e.status().kindSizes;
  ok(ks && ks.renders.n === 1 && ks.renders.bytes === want['renders/Clink trailer.mp4'].length && ks.music.n === 2 && ks.photos.n === 8 && ks.tickets.n === 1 && ks.chats.n === 6, 'mix: sizes per kind (What syncs)', ks);
  ok(!pc.e.status().transfers.length && !mac.e.status().transfers.length, 'mix: nothing left moving');
});

// ---------- 5. What syncs ----------
scenario('kinds', async () => {
  ok(K.kindOf('captures/recordings/a.mp4') === 'captures' && K.kindOf('chats/x.json') === 'chats' && K.kindOf('attachments/p.png') === 'chats' && K.kindOf('kv/three-sketches.json') === 'projects' && K.kindOf('creative-sketches/a/b.wav') === 'music' && K.kindOf('paris-photos/x.jpg') === 'photos' && K.kindOf('tickets/a/t.pdf') === 'tickets' && K.kindOf('renders/x.mp4') === 'renders' && K.kindOf('kv/memory.json') === '' && K.kindOf('memory.json') === '', 'kinds: files sort into kinds; settings and memory are in none (always sync)');
  ok(K.isOn('captures', {}) && !K.isOn('runtime', {}) && K.isOn('runtime', { runtime: true }) && !K.isOn('photos', { photos: false }) && K.skipper({}) && K.skipper({})('creative-vst/runtime/bin/python') && !K.skipper({})('creative-vst/soundbank/index.json'), 'kinds: all on by default, except a computer\'s own instrument runtime');
  const labels = K.list().map((k) => k.label);
  ok(['Chats', 'Projects & scenes', 'Lab captures', 'Renders', 'Music sketches & stems', 'Photos', 'Tickets'].every((l) => labels.includes(l)), 'kinds: the seven kinds the owner asked for', labels);
  const w = T.world('m-kinds');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  for (const m of [pc, mac]) m.e.set({ skip: K.skipper({}) });
  pc.write('captures/c.png', rnd(5000)); pc.write('chats/k.json', T.chat('k', [T.msg('user', 1, 'one')]));
  pc.write('creative-vst/runtime/bin/python', 'pc python'); mac.write('creative-vst/runtime/bin/python', 'mac python');
  for (let i = 0; i < 6; i++) await T.round(w); // (the two runtimes differ on purpose: never "identical")
  ok(mac.has('captures/c.png') && mac.has('chats/k.json') && mac.read('creative-vst/runtime/bin/python') === 'mac python' && pc.read('creative-vst/runtime/bin/python') === 'pc python' && !Sim.raw.existsSync(cloudFile(pc, 'creative-vst/runtime/bin/python')), 'kinds: each computer keeps its own runtime (off by default), the rest syncs');
  ok(!pc.last.pending && !mac.last.pending && pc.last.state === 'synced', 'kinds: a kind left alone is nothing waiting', [pc.last.state, pc.last.pending]);
  // Lab captures off on the PC
  pc.e.set({ skip: K.skipper({ captures: false }) });
  pc.write('captures/a.png', rnd(4000)); const b = rnd(4100); mac.write('captures/b.png', b);
  fs.rmSync(pc.p('captures/c.png')); // the owner frees room on the PC
  pc.edit('chats/k.json', (c) => { c.messages.push(T.msg('user', 2, 'pc')); });
  mac.edit('chats/k.json', (c) => { c.messages.push(T.msg('user', 3, 'mac')); });
  for (let i = 0; i < 8; i++) await T.round(w);
  ok(!Sim.raw.existsSync(cloudFile(pc, 'captures/a.png')) && !pc.has('captures/b.png'), 'kinds: off: nothing goes up, nothing comes down');
  ok(mac.has('captures/c.png') && Sim.raw.existsSync(cloudFile(mac, 'captures/c.png')) && !inTrash(mac, 'c.png'), 'kinds: off: a capture deleted on the PC stays in the cloud and on the Mac (never deleted)');
  ok(T.texts(pc.json('chats/k.json')).join() === 'one,pc,mac' && T.texts(mac.json('chats/k.json')).join() === 'one,pc,mac', 'kinds: chats still sync while captures are off');
  ok(!pc.last.pending && pc.last.state === 'synced' && pc.e.status().kindSizes.captures.n === 1, 'kinds: still "Synced" on the PC, the sizes still counted', { st: pc.last.state, pending: pc.last.pending });
  // on again: everything on both, the deleted one back where it was missing
  pc.e.set({ skip: K.skipper({ captures: true }) });
  for (let i = 0; i < 10; i++) await T.round(w);
  for (const m of [pc, mac]) ok(['captures/a.png', 'captures/b.png', 'captures/c.png'].every((r) => m.has(r)), `kinds: on again: every capture on the ${m.name}`, ['a', 'b', 'c'].map((x) => m.has(`captures/${x}.png`)));
  ok(same(readOr(pc.p('captures/b.png')), b) && !T.copies(pc).length && !T.copies(mac).length, 'kinds: …the Mac\'s as it was, no duplicates');
  // a file changed on both while off: both versions kept (one in place, the other recoverable)
  pc.e.set({ skip: K.skipper({ captures: false }) });
  mac.write('captures/b.png', 'MAC VERSION 2'); pc.write('captures/b.png', 'PC VERSION 3');
  for (let i = 0; i < 4; i++) await T.round(w);
  pc.e.set({ skip: K.skipper({ captures: true }) });
  for (let i = 0; i < 10; i++) await T.round(w);
  const here = [pc.read('captures/b.png'), mac.read('captures/b.png')];
  ok(here[0] === here[1] && ['MAC VERSION 2', 'PC VERSION 3'].every((v) => here.includes(v) || T.recoverable(w, v)), 'kinds: changed on both while off: one in place on both, the other in Deleted files / conflicts', here);
});

// ---------- 6. Free up space ----------
scenario('free', async () => {
  const w = T.world('m-free');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const v1 = rnd(12 * MB); const v2 = rnd(10 * MB);
  pc.write('renders/big1.mp4', v1); pc.write('captures/big2.mp4', v2); pc.write('paris-photos/p.jpg', rnd(300000)); pc.write('chats/f.json', T.chat('f', []));
  ok(await T.converge(w) > 0, 'free: synced', T.why(w));
  // no provider tool: a plain "can't", nothing touched
  const none = await mac.e.free(['renders/big1.mp4']);
  ok(none.unsupported && !none.done.length && !Sim.isDataless(cloudFile(mac, 'renders/big1.mp4')), 'free: no way to ask the cloud drive: says so, changes nothing');
  mac.e.set({ evict: async (f) => mac.view.evict(f) });
  let list = await mac.e.freeable();
  ok(list.items.map((x) => x.rel).sort().join() === 'captures/big2.mp4,renders/big1.mp4' && list.bytes === v1.length + v2.length && list.can, 'free: lists only the big synced files (not photos, chats)', list);
  // changed here and not synced yet: never listed, never freed
  const v2b = rnd(10 * MB); mac.write('captures/big2.mp4', v2b);
  list = await mac.e.freeable();
  ok(list.items.map((x) => x.rel).join() === 'renders/big1.mp4', 'free: a big file changed here and not synced yet isn\'t listed', list.items);
  let r = await mac.e.free(['renders/big1.mp4', 'captures/big2.mp4', 'paris-photos/p.jpg']);
  ok(r.done.join() === 'renders/big1.mp4' && r.bytes === v1.length && r.failed.length === 2 && r.failed.every((f) => f.why === 'not-synced'), 'free: only the synced big one is made online-only', r);
  ok(Sim.isDataless(cloudFile(mac, 'renders/big1.mp4')) && same(readOr(mac.p('renders/big1.mp4')), v1) && !Sim.isDataless(cloudFile(mac, 'captures/big2.mp4')), 'free: the cloud drive\'s copy is online-only; Hearth\'s own copy is untouched');
  const down = mac.view.stats.down;
  ok(await T.converge(w) > 0, 'free: converges after (the changed one syncs)', T.why(w));
  ok(Sim.isDataless(cloudFile(mac, 'renders/big1.mp4')) && !mac.last.pending && mac.last.state === 'synced', 'free: nothing downloads it again, nothing waits', { dataless: Sim.isDataless(cloudFile(mac, 'renders/big1.mp4')), st: mac.last.state, p: mac.last.pending, down: mac.view.stats.down - down });
  ok(same(readOr(pc.p('captures/big2.mp4')), v2b), 'free: the Mac\'s change still reached the PC');
  ok(!(await mac.e.freeable()).items.some((x) => x.rel === 'renders/big1.mp4'), 'free: an online-only one isn\'t listed again');
  // the PC changes the freed video: it still arrives on the Mac (downloaded because it changed)
  const v1b = rnd(12 * MB); pc.write('renders/big1.mp4', v1b);
  ok(await T.converge(w) > 0 && same(readOr(mac.p('renders/big1.mp4')), v1b), 'free: a new version from the other computer still arrives', T.why(w));
  ok((await mac.e.freeable()).items.some((x) => x.rel === 'renders/big1.mp4'), 'free: …and can be freed again');
  // Windows (Files On-Demand): the attributes say online-only; nothing downloads it again either
  pc.e.set({ evict: async (f) => pc.view.evict(f) });
  r = await pc.e.free((await pc.e.freeable()).items.map((x) => x.rel));
  ok(r.done.length === 2 && ['renders/big1.mp4', 'captures/big2.mp4'].every((x) => Sim.isDataless(cloudFile(pc, x))), 'free: Windows: both made online-only', r);
  ok(await T.converge(w) > 0 && ['renders/big1.mp4', 'captures/big2.mp4'].every((x) => Sim.isDataless(cloudFile(pc, x))) && !pc.last.pending, 'free: Windows: stays online-only, nothing waits', T.why(w));
  // a provider that won't (the file isn't uploaded yet): refused, left whole
  const v4 = rnd(9 * MB); mac.write('renders/new.mp4', v4); w.clock.advance(3000);
  await mac.e.pass(); await mac.e.laneIdle(); // Hearth copied it into the cloud folder; the provider hasn't uploaded it
  r = await mac.e.free(['renders/new.mp4']);
  ok(!r.done.length && r.failed[0]?.why === 'refused' && !Sim.isDataless(cloudFile(mac, 'renders/new.mp4')), 'free: the cloud drive refuses a file it hasn\'t uploaded: refused, left whole', r);
  // an iCloud Drive that evicts to ".icloud" stubs
  ok(await T.converge(w) > 0, 'free: converges', T.why(w));
  mac.view.placeholders = 'stub';
  r = await mac.e.free(['renders/new.mp4']);
  ok(r.done.length === 1 && Sim.raw.existsSync(path.join(mac.cloudRoot, 'Hearth', 'files', 'renders', '.new.mp4.icloud')), 'free: iCloud stub style: the file becomes a stub', r);
  for (let i = 0; i < 4; i++) await T.round(w);
  ok(!mac.last.pending && same(readOr(mac.p('renders/new.mp4')), v4) && Sim.raw.existsSync(path.join(mac.cloudRoot, 'Hearth', 'files', 'renders', '.new.mp4.icloud')), 'free: stub style: nothing asks for it again, nothing waits', { p: mac.last.pending, w: mac.last.waiting });
  mac.view.placeholders = null;
  // a kind turned off: not listed
  mac.e.set({ skip: K.skipper({ renders: false }) });
  ok(!(await mac.e.freeable()).items.some((x) => x.rel.startsWith('renders/')), 'free: a kind turned off isn\'t listed');
});

// ---------- 7. cloud-evict.js ----------
scenario('evict', async () => {
  const S = Evict.support;
  ok(S({ platform: 'win32', provider: 'onedrive' }).ok && S({ platform: 'win32', provider: 'icloud' }).ok && S({ platform: 'win32', provider: 'dropbox' }).ok, 'evict: Windows: OneDrive / iCloud / Dropbox can');
  ok(!S({ platform: 'win32', provider: 'gdrive' }).ok && /Google Drive/.test(S({ platform: 'win32', provider: 'gdrive' }).why) && !S({ platform: 'win32', provider: 'folder' }).ok, 'evict: Windows: Google Drive and a plain folder say why not');
  ok(S({ platform: 'darwin', provider: 'icloud' }).ok && S({ platform: 'darwin', provider: 'gdrive', root: '/Users/q/Library/CloudStorage/GoogleDrive-q/My Drive' }).ok && !S({ platform: 'darwin', provider: 'dropbox', root: '/Users/q/Dropbox' }).ok && !S({ platform: 'linux', provider: 'icloud' }).ok, 'evict: Mac: iCloud and ~/Library/CloudStorage drives can; a legacy folder and Linux say why not');
  // Windows: attrib -P +U, then the attributes must say online-only
  const calls = [];
  let attr = 0x100000 | 0x20;
  const exec = (file, args, _o, cb) => { calls.push([path.basename(file), ...args]); setTimeout(() => { attr = 0x100000 | 0x400000 | 0x20; cb(null, '', ''); }, 1); return { stdin: { on() {}, end() {} } }; };
  let r = await Evict.evict('C:\\Users\\q\\OneDrive\\Hearth\\files\\renders\\a.mp4', { platform: 'win32', provider: 'onedrive', execFile: exec, attributes: async (ps) => new Map(ps.map((p) => [p, attr])), stepMs: 5, waitMs: 50 });
  ok(r.ok && !r.unsupported && path.win32.basename(calls[0][0]) === 'attrib.exe' && calls[0].slice(1, 3).join(' ') === '-P +U', 'evict: Windows: attrib -P +U, then confirmed by the attributes', { r, calls });
  r = await Evict.evict('X:\\a.mp4', { platform: 'win32', provider: 'onedrive', execFile: (f, a, o, cb) => { cb(null, '', ''); }, attributes: async (ps) => new Map(ps.map((p) => [p, 0x20])), stepMs: 5, waitMs: 20 });
  ok(!r.ok && r.unsupported && /Files On-Demand/.test(r.error), 'evict: Windows: no online-only attributes at all → "this folder doesn\'t support it"', r);
  r = await Evict.evict('X:\\a.mp4', { platform: 'win32', provider: 'onedrive', execFile: (f, a, o, cb) => { cb(Object.assign(new Error('fail'), { code: 1 }), '', 'Access denied - X:\\a.mp4'); }, attributes: async (ps) => new Map(ps.map((p) => [p, 0x100000])), stepMs: 5, waitMs: 20 });
  ok(!r.ok && !r.unsupported && /Access denied/.test(r.error), 'evict: Windows: attrib refused → its words', r);
  r = await Evict.evict('X:\\a.mp4', { platform: 'win32', provider: 'onedrive', execFile: () => { throw new Error('no'); }, attributes: async (ps) => new Map(ps.map((p) => [p, 0x400000])), stepMs: 5, waitMs: 20 });
  ok(r.ok && r.already, 'evict: Windows: already online-only → nothing run');
  // Mac: brctl evict (iCloud), fileproviderctl (CloudStorage); then no blocks on the disk
  let blocks = 8; const mcalls = [];
  const mexec = (file, args, _o, cb) => { mcalls.push([file, ...args]); blocks = 0; cb(null, '', ''); };
  r = await Evict.evict('/Users/q/Library/Mobile Documents/com~apple~CloudDocs/Hearth/files/a.mp4', { platform: 'darwin', provider: 'icloud', execFile: mexec, stat: async () => ({ size: 1000, blocks }), stepMs: 5, waitMs: 20 });
  ok(r.ok && mcalls[0][0] === 'brctl' && mcalls[0][1] === 'evict', 'evict: Mac iCloud: brctl evict, then no blocks', { r, mcalls });
  blocks = 8;
  r = await Evict.evict('/Users/q/Library/CloudStorage/OneDrive-x/Hearth/files/a.mp4', { platform: 'darwin', provider: 'onedrive', root: '/Users/q/Library/CloudStorage/OneDrive-x', execFile: mexec, stat: async () => ({ size: 1000, blocks }), stepMs: 5, waitMs: 20 });
  ok(r.ok && mcalls[1][0] === 'fileproviderctl', 'evict: Mac CloudStorage drive: fileproviderctl evict', mcalls);
  r = await Evict.evict('/Users/q/Library/CloudStorage/OneDrive-x/a.mp4', { platform: 'darwin', provider: 'onedrive', root: '/Users/q/Library/CloudStorage/OneDrive-x', execFile: (f, a, o, cb) => cb(Object.assign(new Error('spawn fileproviderctl ENOENT'), { code: 'ENOENT' })), stat: async () => ({ size: 1000, blocks: 8 }), stepMs: 5, waitMs: 20 });
  ok(!r.ok && r.unsupported && /can't make files online-only/.test(r.error), 'evict: Mac: the tool missing → a plain "can\'t"', r);
  r = await Evict.evict('/x/a.mp4', { platform: 'linux', provider: 'icloud' });
  ok(!r.ok && r.unsupported, 'evict: Linux: can\'t');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nsyncmedia73: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  // the worlds live in sync72-test's temp folder
  const w = T.world('m-end'); if (!argv.includes('--keep')) fs.rmSync(path.dirname(w.dir), { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
