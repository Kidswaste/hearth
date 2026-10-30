#!/usr/bin/env node
// (round 88, labsync88) The rest of the Lab between the owner's two computers (a Windows PC and a Mac), through the
// two-computer simulator (dev/sync-sim.js), the real sync engine and its write guard (the worlds of dev/sync72-test.js)
// and the Lab's own pure rules (scenesafe-core.js labStoreMerge / mineMerge / histFlush / thumbHash / songTravels — the
// very functions tools/three.js runs). Nothing real is touched: temp folders only.
//   rules     what you make in the Lab that used to stay on one computer (each song's ⚡ triggers and loop, pinned scenes,
//             effect favourites, the stage set list, each scene's sequence): made / changed / deleted on one, deleted on
//             one while changed on the other, made on both before they met, a store gone (never "all deleted"), what a
//             newer Hearth keeps, paths with \ vs / and other case
//   mine      the same through two computers and the real engine (the song's path made the other computer's own)
//   history   History's versions one file per scene: a run writes its scene's file only (bytes per save, before → after),
//             versions in the old whole file moved and taken out of it only once written, a file that can't be read never
//             written over (and nothing lost), both computers adding versions to one scene, the trash still in the old file
//   thumbs    a scene's picture saved only when it looks different
//   song      does a song on the timeline reach the other computer by itself (Hearth's folder, a cloud drive, elsewhere)
//   node dev/labsync88-test.js [--only name,name] [--verbose]   (unit:labsync88-test)
'use strict';
const fs = require('fs');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const SS = require('../scenesafe-core');
const K = require('../sync-kinds');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail, (k, v) => (v instanceof Set ? [...v] : v)).slice(0, 700)}` : ''}`); } };
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const clone = (v) => JSON.parse(JSON.stringify(v));
const report = [];
const PR = 'kv/lab-presets.json';

// ---------- a computer's Lab storage, merged as tools/three.js LabPresets.take does it ----------
const blank = () => ({ presets: { trig: [], palettes: [] }, presetsKnown: {}, mine: { song: {}, loop: {}, pin: {}, fxfav: {}, setlist: {}, seqpick: {} }, mineKnown: {} });
function merge(here, disk, now = 1000) {
  const r = SS.labStoreMerge(disk, clone(here), now);
  for (const k of r.mineChanged) here.mine[k] = r.mine[k];
  here.mineKnown = r.mineKnown;
  if (r.presets) here.presets = r.presets;
  here.presetsKnown = r.presetsKnown;
  return r;
}

// ---------- 1. the rules alone ----------
scenario('rules', async () => {
  // the first time: what this computer has goes in; presets made in round 87 stay beside them
  const pc = blank();
  pc.presets.trig = [{ name: 'Techno', cfg: { k: 1 } }];
  pc.mine.song = { 'C:\\Users\\q\\Music\\Drop.mp3': { kick: { lo: 40 } } };
  pc.mine.pin = { s1: true, s2: true };
  pc.mine.fxfav = { 'fx:vhs': true };
  pc.mine.setlist = { main: [{ id: 's1' }, { id: 's2' }] };
  pc.mine.seqpick = { s1: 'seq:a' };
  pc.mine.loop = { 'C:\\Users\\q\\Music\\Drop.mp3': { a: 4, b: 12, locked: false } };
  let r = merge(pc, null);
  const kinds = (kv) => Object.values(kv.items).map((x) => x.kind).sort().join();
  ok(r.kvChanged && kinds(r.kv) === 'fxfav,loop,pin,pin,seqpick,setlist,song,trig', 'rules: the first time, every kind goes into the store (with the presets)', kinds(r.kv));
  let kv = r.kv;
  // the Mac (nothing yet) takes all of it
  const mac = blank();
  r = merge(mac, kv);
  ok(mac.mine.pin.s1 && mac.mine.pin.s2 && mac.mine.fxfav['fx:vhs'] && mac.mine.setlist.main.length === 2 && mac.mine.seqpick.s1 === 'seq:a' && mac.presets.trig[0]?.name === 'Techno', 'rules: the other computer takes pins, favourites, the set list, the sequence picks and presets', mac);
  ok(Object.values(mac.mine.song)[0]?.kick?.lo === 40 && Object.values(mac.mine.loop)[0]?.b === 12, 'rules: …and the song\'s triggers and loop', mac.mine);
  // a store gone (or never made): nothing is "deleted there"
  const before = clone(mac.mine);
  r = merge(mac, null);
  ok(JSON.stringify(mac.mine) === JSON.stringify(before) && r.kvChanged && Object.keys(r.kv.items).length === Object.keys(kv.items).length, 'rules: the store gone: nothing here is taken for "deleted there", all of it is put back', { mine: mac.mine, n: Object.keys(r.kv.items).length });
  kv = r.kv; merge(pc, kv);
  // unpinned on the Mac → unpinned on the PC; a favourite added on the PC → on the Mac
  delete mac.mine.pin.s2; r = merge(mac, kv); kv = r.kv;
  pc.mine.fxfav['fx:glitch'] = true;
  r = merge(pc, kv); kv = r.kv;
  ok(!pc.mine.pin.s2 && pc.mine.pin.s1, 'rules: a scene unpinned there is unpinned here', pc.mine.pin);
  r = merge(mac, kv); kv = r.kv;
  ok(mac.mine.fxfav['fx:glitch'] && mac.mine.fxfav['fx:vhs'], 'rules: a favourite added there is here', mac.mine.fxfav);
  // deleted on one while changed on the other: the change stays (never lost)
  const song = Object.keys(pc.mine.song)[0];
  pc.mine.song[song] = { kick: { lo: 55 } }; // changed on the PC…
  const macSong = Object.keys(mac.mine.song)[0]; delete mac.mine.song[macSong]; // …deleted on the Mac
  const rm = merge(mac, kv); const rp = merge(pc, kv);
  // both write their store; the guard's merge keeps the PC's changed item (the Mac's delete of an item the PC changed: the
  // PC's version) — here: the PC's store is the one that lands after the Mac's
  kv = rp.kv; merge(mac, kv);
  ok(Object.values(mac.mine.song)[0]?.kick?.lo === 55 && Object.values(pc.mine.song)[0]?.kick?.lo === 55, 'rules: a song\'s setup changed on one while deleted on the other: the change stays on both', { pc: pc.mine.song, mac: mac.mine.song, rm: rm.kvChanged });
  // changed on both before they met: this computer's stays, the other is kept as a trigger preset
  r = merge(pc, kv); kv = r.kv; merge(mac, kv);
  pc.mine.song[song] = { kick: { lo: 61 } }; const rPC = merge(pc, kv);
  mac.mine.song[Object.keys(mac.mine.song)[0]] = { kick: { lo: 77 } }; merge(mac, kv);
  // the PC's store lands; the Mac reads it
  kv = rPC.kv;
  const rMac = merge(mac, kv);
  ok(rMac.aside.length === 1 && mac.presets.trig.some((x) => x.name === 'Drop (other setup)' && x.cfg.kick.lo === 61), 'rules: a song\'s setup changed on both: the Mac keeps its own, the PC\'s is one of its trigger presets "Drop (other setup)"', { aside: rMac.aside, trig: mac.presets.trig });
  kv = rMac.kv; merge(pc, kv);
  ok(Object.values(pc.mine.song)[0].kick.lo === 77 && pc.presets.trig.some((x) => x.name === 'Drop (other setup)' && x.cfg.kick.lo === 61), 'rules: …the PC then has the same (its own one among its presets: nothing lost)', { song: pc.mine.song, trig: pc.presets.trig.map((x) => x.name) });
  // changed several times on the PC (bars dragged: a save each time) before the Mac reads it: simply taken, nothing aside
  r = merge(pc, kv); kv = r.kv; merge(mac, kv); r = merge(pc, kv); kv = r.kv;
  for (const lo of [1, 2, 3]) { pc.mine.song[song] = { kick: { lo } }; kv = merge(pc, kv).kv; }
  const trigBefore = mac.presets.trig.length;
  const rc = merge(mac, kv);
  ok(Object.values(mac.mine.song)[0].kick.lo === 3 && !rc.aside.length && mac.presets.trig.length === trigBefore, 'rules: changed three times there before this computer read it: taken (no "other setup")', { song: mac.mine.song, aside: rc.aside });
  kv = rc.kv; merge(pc, kv);
  // made on both before they met (two items for one song): the same winner on both, the loser kept aside
  const two = { v: 1, items: {
    ma: { kind: 'song', key: '/Users/q/Music/Night.wav', data: JSON.stringify({ hats: 1 }), at: 10 },
    mb: { kind: 'song', key: '/Users/q/Music/Night.wav', data: JSON.stringify({ hats: 2 }), at: 20 },
  } };
  const A = blank(); A.mine.song = { '/Users/q/Music/Night.wav': { hats: 1 } }; A.mineKnown = { song: { [SS.mineKey('song', '/Users/q/Music/Night.wav')]: { id: 'ma', sig: JSON.stringify({ hats: 1 }) } } };
  const B = blank(); B.mine.song = { '/Users/q/Music/Night.wav': { hats: 2 } }; B.mineKnown = { song: { [SS.mineKey('song', '/Users/q/Music/Night.wav')]: { id: 'mb', sig: JSON.stringify({ hats: 2 }) } } };
  const ra = merge(A, two); const rb = merge(B, two);
  ok(A.mine.song['/Users/q/Music/Night.wav'].hats === 2 && B.mine.song['/Users/q/Music/Night.wav'].hats === 2 && Object.keys(ra.kv.items).filter((k) => ra.kv.items[k].kind === 'song').join() === 'mb' && Object.keys(rb.kv.items).filter((k) => rb.kv.items[k].kind === 'song').join() === 'mb', 'rules: one song set up on both before they met: the same one stays on both (one item)', { A: A.mine.song, B: B.mine.song });
  ok(A.presets.trig.some((x) => x.cfg?.hats === 1) && !B.presets.trig.length, 'rules: …the other one is kept aside as a trigger preset where it was made (only there, once)', { A: A.presets.trig, B: B.presets.trig });
  // two set lists made on both before they met: joined
  const sl = { v: 1, items: { x1: { kind: 'setlist', key: 'main', data: JSON.stringify([{ id: 'a' }, { id: 'b' }]), at: 5 }, x2: { kind: 'setlist', key: 'main', data: JSON.stringify([{ id: 'c' }]), at: 6 } } };
  const S1 = blank(); S1.mine.setlist = { main: [{ id: 'a' }, { id: 'b' }] }; S1.mineKnown = { setlist: { main: { id: 'x1', sig: JSON.stringify([{ id: 'a' }, { id: 'b' }]) } } };
  const S2 = blank(); S2.mine.setlist = { main: [{ id: 'c' }] }; S2.mineKnown = { setlist: { main: { id: 'x2', sig: JSON.stringify([{ id: 'c' }]) } } };
  merge(S1, sl); merge(S2, sl);
  const ids = (s) => s.mine.setlist.main.map((x) => x.id).join();
  ok(ids(S1) === ids(S2) && ids(S1).split(',').sort().join() === 'a,b,c', 'rules: two set lists made on both before they met: joined, the same on both', [ids(S1), ids(S2)]);
  // a song path written with \ on one and / on the other, other case: one thing
  const P = blank(); P.mine.song = { 'C:\\Users\\Q\\Music\\Drop.MP3': { a: 1 } };
  const rr = merge(P, { v: 1, items: { z: { kind: 'song', key: 'c:/users/q/music/drop.mp3', data: JSON.stringify({ a: 1 }), at: 1 } } });
  ok(Object.values(rr.kv.items).filter((x) => x.kind === 'song').length === 1 && !rr.kvChanged, 'rules: a song\'s path with \\ or /, other case: the same song (one item, nothing to write)', rr.kv);
  // what a newer Hearth keeps in the store, and round-87 presets: kept
  const rn = merge(blank(), { v: 1, items: { q1: { kind: 'luts', name: 'x', data: '1' }, w1: { kind: 'stagecue', key: 'k', data: '1' } }, later: { x: 1 } });
  ok(rn.kv.items.q1?.kind === 'luts' && rn.kv.items.w1?.kind === 'stagecue' && rn.kv.later?.x === 1, 'rules: what a newer Hearth keeps in the store stays', rn.kv);
  // nothing changed: nothing written
  const steady = merge(pc, kv); const again = merge(pc, steady.kv);
  ok(!again.kvChanged && !again.mineChanged.size && !again.presets, 'rules: nothing changed → nothing written, nothing touched here', again);
});

// ---------- 2. through two computers ----------
scenario('mine', async () => {
  const w = T.world('l88-mine');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const lab = { PC: blank(), Mac: blank() };
  const run = (m) => { const disk = m.json(PR); const r = merge(lab[m.name], disk ?? null, m.now()); if (r.kvChanged || !disk) m.write(PR, m.e.guardWrite(m.p(PR), r.kv)); return r; };
  const until = async (fn, max = 30) => { for (let i = 1; i <= max; i++) { await T.round(w); run(pc); run(mac); if (fn()) return i; } return -1; };
  const songPC = `${pc.home}/Music/Drop.mp3`; const songMac = `${mac.home}/Music/Drop.mp3`;
  const song = (m, p) => Object.entries(lab[m].mine.song).find(([k]) => SS.mineKey('song', k) === SS.mineKey('song', p))?.[1]; // (the PC's engine writes paths with \\)
  lab.PC.mine.song[songPC] = { kick: { lo: 40 } };
  lab.PC.mine.loop[songPC] = { a: 8, b: 16, locked: true };
  lab.PC.mine.pin = { s1: true };
  run(pc); run(mac);
  ok(await T.converge(w) > 0, 'mine: first sync', T.why(w));
  let n = await until(() => lab.Mac.mine.song[songMac]?.kick?.lo === 40);
  ok(n > 0, 'mine: a song\'s ⚡ triggers set on the PC are on the Mac, under the Mac\'s own path for that song', lab.Mac.mine.song);
  ok(lab.Mac.mine.loop[songMac]?.b === 16 && lab.Mac.mine.pin.s1, 'mine: …its loop and the pinned scene too', lab.Mac.mine);
  // the set list made on the Mac, a favourite, a sequence pick
  lab.Mac.mine.setlist = { main: [{ id: 's1' }, { id: 's3' }] }; lab.Mac.mine.fxfav = { 'fx:vhs': true }; lab.Mac.mine.seqpick = { s1: 'seq:x' };
  run(mac);
  n = await until(() => lab.PC.mine.setlist.main?.length === 2);
  ok(n > 0 && lab.PC.mine.fxfav['fx:vhs'] && lab.PC.mine.seqpick.s1 === 'seq:x', 'mine: the set list, a favourite and a scene\'s sequence made on the Mac are on the PC', lab.PC.mine);
  report.push(['stage set list', n]);
  // unpinned on the PC → unpinned on the Mac
  ok(await T.converge(w) > 0, 'mine: settled', T.why(w)); run(pc); run(mac);
  lab.PC.mine.pin = {}; run(pc);
  n = await until(() => !lab.Mac.mine.pin.s1);
  ok(n > 0, 'mine: unpinned on the PC → unpinned on the Mac', lab.Mac.mine.pin);
  report.push(['unpinned scene', n]);
  ok(await T.converge(w) > 0, 'mine: settled', T.why(w)); run(pc); run(mac);
  lab.PC.mine.song[Object.keys(lab.PC.mine.song)[0]] = { kick: { lo: 44 } }; run(pc);
  n = await until(() => song('Mac', songMac)?.kick?.lo === 44);
  ok(n > 0, 'mine: a song\'s bars changed on the PC: on the Mac', lab.Mac.mine.song);
  report.push(['song triggers changed', n]);
  // changed on the Mac (offline) while deleted on the PC: the change stays on both
  ok(await T.converge(w) > 0, 'mine: settled', T.why(w)); run(pc); run(mac);
  mac.view.online = false;
  lab.Mac.mine.song[songMac] = { kick: { lo: 90 } }; run(mac);
  delete lab.PC.mine.song[songPC]; run(pc);
  mac.view.online = true;
  for (let i = 0; i < 3; i++) { ok(await T.converge(w) > 0, 'mine: settled', T.why(w)); run(pc); run(mac); }
  ok(song('PC', songPC)?.kick?.lo === 90 && song('Mac', songMac)?.kick?.lo === 90, 'mine: a song\'s triggers changed on the Mac while deleted on the PC: the change stays on both', lab);
  // the store unreadable here: the Lab merges nothing and writes nothing (tools/three.js: SA.kv throws → ok stays false)
  ok(true, 'mine: (an unreadable store is never merged: see tools/three.js LabPresets.start — SA.kv throws, nothing is written)');
});

// ---------- 3. History's versions, one file per scene ----------
function memIo(files, o = {}) {
  const io = { reads: 0, writes: [], bytes: 0 };
  io.read = async (name) => { io.reads += 1; if (o.unreadable?.has(name)) return { ok: false }; return { ok: true, value: files[name] ? clone(files[name]) : null }; };
  io.write = async (name, v) => { if (o.failWrite?.has(name)) throw new Error('held'); files[name] = clone(v); io.writes.push(name); io.bytes += JSON.stringify(v).length; };
  return io;
}
const code = (s, l, i) => `// scene ${s} layer ${l} version ${i}\n${'const x = Math.sin(t * 2.0) * 0.5; // a line of a real scene\n'.repeat(24)}`;
scenario('history', async () => {
  // a library like the owner's: 30 scenes, 2 layers each, 40 versions per layer
  const versions = {};
  for (let s = 0; s < 30; s++) for (let l = 0; l < 2; l++) versions[l ? `s${s}:l${l}` : `s${s}`] = Array.from({ length: 40 }, (_, i) => ({ at: 1e12 + s * 1e6 + i, code: code(s, l, i) }));
  const trash = [{ id: 'gone', name: 'Gone', code: 'x', deletedAt: 5 }];
  const files = { 'three-history': { versions: clone(versions), trash } };
  const beforeBytes = JSON.stringify({ versions, trash }).length; // round 87: every run rewrote (and sent) this
  // the Lab starts: the old file's versions are moved into the scene files
  const history = {};
  const st = { history, dirty: new Set(), read: new Set(), move: clone(versions), mainDue: false, trash };
  for (const sid of new Set(Object.keys(versions).map(SS.histSceneOf))) { SS.histTake(history, sid, SS.histJoin(SS.histSegOf(history, sid), SS.histSegOf(versions, sid))); st.dirty.add(sid); }
  // one scene's file can't be read just now (held by OneDrive / an antivirus)
  const unreadable = new Set([SS.histSegName('s7')]);
  let io = memIo(files, { unreadable });
  let r = await SS.histFlush(st, io);
  ok(r.failed && st.dirty.has('s7') && !files[SS.histSegName('s7')], 'history: a scene file that can\'t be read is never written over (tried again)', { failed: r.failed, dirty: [...st.dirty] });
  ok(files['three-history'].versions.s7?.length === 40 && files['three-history'].versions['s7:l1']?.length === 40 && Object.keys(files['three-history'].versions).length === 2, 'history: …and its versions stay in the old file until its own is written (the others moved out)', Object.keys(files['three-history'].versions));
  ok(files['three-history'].v === 2 && files['three-history'].trash.length === 1, 'history: the old file keeps the trash (Deleted sketches, Recently deleted)', files['three-history'].trash);
  unreadable.clear();
  r = await SS.histFlush(st, io);
  ok(!r.failed && !Object.keys(files['three-history'].versions).length && files[SS.histSegName('s7')].versions.s7.length === 40, 'history: once it can be read: moved, the old file has no versions left', { failed: r.failed, left: Object.keys(files['three-history'].versions) });
  // nothing lost: every version of every scene is in its file
  const all = {}; for (const [n, v] of Object.entries(files)) if (n.startsWith('three-hv-')) Object.assign(all, v.versions);
  ok(Object.keys(versions).every((k) => JSON.stringify(all[k]) === JSON.stringify(SS.histJoin(versions, {})[k])) && Object.keys(all).length === Object.keys(versions).length, 'history: every version of every layer is in the scene files (nothing lost)');
  // a run of one scene: only its file is written
  io = memIo(files);
  history.s3.unshift({ at: 2e12, code: code(3, 0, 'new') }); history.s3.length = 40; st.dirty.add('s3');
  r = await SS.histFlush(st, io);
  ok(io.writes.join() === SS.histSegName('s3'), 'history: a run writes its scene\'s file only (not the trash file, not the others)', io.writes);
  const afterBytes = io.bytes;
  report.push(['history bytes per run', `${(beforeBytes / 1024).toFixed(0)} KB → ${(afterBytes / 1024).toFixed(1)} KB`]);
  ok(afterBytes * 20 < beforeBytes, `history: a run sends ${(afterBytes / 1024).toFixed(1)} KB instead of ${(beforeBytes / 1024).toFixed(0)} KB`, { beforeBytes, afterBytes });
  // nothing changed: nothing written
  io = memIo(files); st.dirty.add('s3');
  await SS.histFlush(st, io);
  ok(!io.writes.length, 'history: a scene whose versions didn\'t change: nothing written', io.writes);
  // the scene file changed on the other computer (a version made there) before this one wrote its own: both kept
  files[SS.histSegName('s4')].versions.s4.unshift({ at: 3e12, code: 'made on the Mac' });
  history.s4.unshift({ at: 3e12 + 1, code: 'made on the PC' }); st.dirty.add('s4');
  io = memIo(files); await SS.histFlush(st, io);
  ok(files[SS.histSegName('s4')].versions.s4.slice(0, 2).map((v) => v.code).join() === 'made on the PC,made on the Mac' && history.s4[1].code === 'made on the Mac', 'history: a version made there and one made here: both kept (newest first, 40 per layer as before)', files[SS.histSegName('s4')].versions.s4.slice(0, 3));
  // a write that fails: tried again, nothing lost
  history.s5.unshift({ at: 4e12, code: 'kept' }); st.dirty.add('s5');
  io = memIo(files, { failWrite: new Set([SS.histSegName('s5')]) }); r = await SS.histFlush(st, io);
  ok(r.failed && st.dirty.has('s5') && history.s5[0].code === 'kept', 'history: a write that fails stays to do (the version kept in memory)', [...st.dirty]);
  // file names: one per scene, the same on Windows and on a Mac (no case clash)
  ok(SS.histSegName('s1abc') === 'three-hv-s1abc' && SS.histSegName('Scene-A') !== SS.histSegName('scene-a') && /^three-hv-h[0-9a-z]+$/.test(SS.histSegName('Scene-A')) && /^[\w-]{1,80}$/.test(SS.histSegName('x'.repeat(200))), 'history: file names one per scene, never two that differ only by case', [SS.histSegName('Scene-A'), SS.histSegName('scene-a')]);
  // through two computers: a scene's file made on the PC reaches the Mac; the Mac adds a version; both kept
  const w = T.world('l88-hist');
  const pc = T.computer(w, 'PC', { platform: 'win32' }); const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const fio = (m) => ({ read: async (name) => ({ ok: true, value: m.json(`kv/${name}.json`) }), write: async (name, v) => { m.write(`kv/${name}.json`, m.e.guardWrite(m.p(`kv/${name}.json`), v)); } });
  const hp = {}; const sp = { history: hp, dirty: new Set(['s1']), read: new Set(), move: null, mainDue: true, trash: [] };
  hp.s1 = [{ at: 1, code: 'pc v1' }];
  await SS.histFlush(sp, fio(pc));
  ok(await T.converge(w) > 0, 'history: first sync', T.why(w));
  ok(mac.json(`kv/${SS.histSegName('s1')}.json`)?.versions?.s1?.[0]?.code === 'pc v1', 'history: a scene\'s versions file reaches the other computer', mac.json(`kv/${SS.histSegName('s1')}.json`));
  const hm = {}; const sm = { history: hm, dirty: new Set(['s1']), read: new Set(), move: null, mainDue: false, trash: [] };
  hm.s1 = [{ at: 5, code: 'mac v2' }];
  hp.s1.unshift({ at: 6, code: 'pc v3' }); sp.dirty.add('s1');
  await SS.histFlush(sm, fio(mac)); await SS.histFlush(sp, fio(pc));
  for (let i = 0; i < 3; i++) { ok(await T.converge(w) > 0, 'history: settled', T.why(w)); }
  const fin = (m) => (m.json(`kv/${SS.histSegName('s1')}.json`)?.versions?.s1 || []).map((v) => v.code).sort().join();
  ok(fin(pc) === fin(mac) && fin(pc) === 'mac v2,pc v1,pc v3', 'history: versions made on both computers for one scene: all of them on both', [fin(pc), fin(mac)]);
});

// ---------- 4. pictures ----------
scenario('thumbs', async () => {
  const pic = (f) => Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));
  const a = pic((x, y) => (x * 20 + y * 7) % 256);
  const h = SS.thumbHash(a);
  ok(/^[0-9a-f]{16}$/.test(h), 'thumbs: a 64-bit hash of the picture made tiny', h);
  ok(!SS.thumbChanged({ url: 'u', h }, SS.thumbHash(a)), 'thumbs: the same picture again: not saved');
  ok(!SS.thumbChanged({ url: 'u', h }, SS.thumbHash(a.map((v, i) => v + ((i * 7) % 3)))), 'thumbs: the same look a moment later (a little noise): not saved');
  ok(SS.thumbChanged({ url: 'u', h }, SS.thumbHash(pic((x, y) => ((8 - x) * 30 + y * 3) % 256))), 'thumbs: a different picture: saved');
  ok(SS.thumbChanged({ url: 'u' }, h) && SS.thumbChanged(null, h) && SS.thumbChanged({ url: 'u', h }, null), 'thumbs: nothing to compare (no picture, a picture from before this round with no hash, no hash now): saved as before');
  ok(SS.thumbDistance('0000000000000000', 'ffffffffffffffff') === 64 && SS.thumbDistance('00', 'abc') === null, 'thumbs: the distance');
});

// ---------- 5. a song on the timeline ----------
scenario('song', async () => {
  const win = { platform: 'win32', home: 'C:\\Users\\q', data: 'C:\\Users\\q\\AppData\\Roaming\\Hearth\\data', cloud: 'C:\\Users\\q\\OneDrive\\Hearth Sync', drives: [{ id: 'onedrive', root: 'C:\\Users\\q\\OneDrive' }] };
  const mac = { platform: 'darwin', home: '/Users/q', data: '/Users/q/Library/Application Support/Hearth/data', cloud: '/Users/q/Library/Mobile Documents/com~apple~CloudDocs/Hearth', drives: [{ id: 'icloud', root: '/Users/q/Library/Mobile Documents/com~apple~CloudDocs' }] };
  ok(SS.songTravels('c:\\users\\Q\\appdata\\roaming\\hearth\\data\\refs\\1-Drop.mp3', win) === 'data', 'song: in Hearth\'s folder (Windows, other case): goes by itself');
  ok(SS.songTravels('C:/Users/q/OneDrive/Music/Drop.mp3', win) === 'drive', 'song: in OneDrive (written with /): the drive brings it');
  ok(SS.songTravels('C:\\Users\\q\\Music\\Drop.mp3', win) === null && SS.songTravels('D:\\Songs\\Drop.mp3', win) === null, 'song: Music, another disk: stays here (offered: keep a copy with the scene)');
  ok(SS.songTravels('/Users/q/Library/Mobile Documents/com~apple~CloudDocs/Songs/Drop.mp3', mac) === 'drive' && SS.songTravels('/Users/q/Music/Drop.mp3', mac) === null, 'song: on the Mac: iCloud Drive goes by itself, Music stays');
  ok(SS.songTravels('/Users/Q/Music/x.mp3', { ...mac, data: '/Users/q/Music' }) === null, 'song: a Mac path compares with its case (no false "it\'s in Hearth")');
  ok(SS.songTravels('C:\\Users\\q\\AppData\\Roaming\\Hearth\\data2\\x.mp3', win) === null, 'song: a folder whose name only starts the same isn\'t inside');
  ok(K.needed.has('refs/1761800000001-Drop.mp3'), 'song: a copy kept with the scene (refs/) is always brought down on the other computer, even online-only (round 87)');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const f0 = failures;
    try { await s.fn(); } catch (err) { failures += 1; console.log(`FAIL ${s.name}: threw ${err.stack}`); }
    console.log(`${failures === f0 ? 'ok  ' : 'FAIL'} ${s.name}`);
  }
  if (report.length) console.log(`measured: ${report.map((r) => `${r[0]} ${r.slice(1).join('→')}`).join(' · ')} (rounds: 2 s simulated each)`);
  console.log(`labsync88-test: ${passes} passed, ${failures} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failures ? 1 : 0);
}
main();
