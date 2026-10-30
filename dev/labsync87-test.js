#!/usr/bin/env node
// (round 87, labsync87) The Lab's work between the owner's two computers (a Windows PC and a Mac), through the
// two-computer simulator (dev/sync-sim.js: each computer its own cloud folder, delays, half downloads, placeholders),
// the real sync engine and its write guard (the worlds of dev/sync72-test.js), the real StoreAck coordinator and the
// Lab's own pure rules (scenesafe-core.js trashArrived / presetsMerge, sync-kinds.js needed). Nothing real is touched.
//   scenes    a scene's code, its sliders' values, a new scene, a rename, a delete (gone from the list on the other
//             computer, in its trash: the other computer's entry or one made there at once; this computer's copy kept
//             aside in .history before the list without it replaced it) — rounds counted (a round = each computer's pass)
//   assets    references imported into a scene (refs/: a texture, a 12 MB model, a sound): their paths in three-refs made
//             the other computer's own; each file there once and never copied again while unchanged; a reference deleted
//             goes to the other computer's Deleted files; a big model online-only in the cloud drive (OneDrive on the PC,
//             iCloud stubs / dataless files on the Mac) is brought down (it never was before round 87: `--before` shows it)
//   lane      a 30 MB model going up doesn't hold a scene saved at the same moment (the big lane)
//   both      the scene open on both computers and edited on both: different lines → both kept, nothing aside; the same
//             line, the Mac's window with its change waiting → the Mac's line stays, the PC's version is kept aside (a
//             note + Deleted files), nothing lost; edited on both while offline → merged, a same-line clash settled with
//             the other side kept aside
//   scoped    after the first whole look, every Lab save syncs in scoped passes that name only the paths it wrote
//   presets   trigger presets / saved palettes across both computers (made, edited, deleted, made on both with one
//             name, deleted on one while edited on the other, a store gone)
//   trash     the trash rules alone
//   node dev/labsync87-test.js [--only name,name] [--verbose] [--before]   (unit:labsync87-test)
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const Sim = require('./sync-sim');
const SA = require('../storeack-core');
const SS = require('../scenesafe-core');
const K = require('../sync-kinds');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const BEFORE = argv.includes('--before'); // the engine as round 86 left it (no allowDownload): what was wrong
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const clone = (v) => JSON.parse(JSON.stringify(v));
const report = []; // what the doc's table says: rounds (2 s of simulated time each) from a save to the other computer
const MB = 1024 * 1024;
const rnd = (n, seed) => { const b = Buffer.alloc(n); let x = seed * 2654435761 >>> 0; for (let i = 0; i < n; i += 4) { x = (x * 1664525 + 1013904223) >>> 0; b.writeUInt32LE(x, Math.min(i, n - 4)); } return b; };
const same = (a, b) => Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && a.equals(b);
const readOr = (f) => { try { return Sim.raw.readFileSync(f); } catch { return null; } };

// a computer as the app runs it: the engine with syncmain's options (round 87: the Lab's files are always brought down)
function computer(w, name, o = {}) {
  const m = T.computer(w, name, o);
  if (!BEFORE) m.e = m.make({ allowDownload: K.needed });
  return m;
}
async function pair(name, o = {}) {
  const w = T.world(`ls-${name}`);
  const pc = computer(w, 'PC', { platform: 'win32', ...(o.pc || {}) });
  const mac = computer(w, 'Mac', { platform: 'darwin', ...(o.mac || {}) });
  return { w, pc, mac };
}
// rounds until `fn()` is true on the receiving side (each round: 2 s simulated, each computer's provider + pass)
async function until(w, fn, max = 30) { for (let i = 1; i <= max; i++) { await T.round(w); if (fn()) return i; } return -1; }
const take = (m) => { const l = m.pulled.slice(); m.pulled.length = 0; return l; };

const CODE = Array.from({ length: 12 }, (_, i) => `const v${i} = ${i}; // line ${i}`).join('\n');
const layer = (id, code, extra = {}) => ({ id, name: `Layer ${id}`, code, ...extra });
const sceneOf = (id, extra = {}) => ({ id, name: `Scene ${id}`, code: CODE, layers: [layer(`${id}-l1`, CODE, { values: { Speed: 1 } })], updatedAt: 1, ...extra });
const SK = 'kv/three-sketches.json'; const HI = 'kv/three-history.json'; const RF = 'kv/three-refs.json'; const PR = 'kv/lab-presets.json';
const ids = (m) => (m.json(SK) || []).map((s) => s.id);

// ---------- 1. scenes ----------
scenario('scenes', async () => {
  const { w, pc, mac } = await pair('scenes');
  pc.write(SK, [sceneOf('s1'), sceneOf('s2'), sceneOf('s3')]);
  pc.write(HI, { versions: {}, trash: [] });
  ok(await T.converge(w) > 0, 'scenes: first sync', T.why(w));
  // the code
  pc.edit(SK, (l) => { l[0].layers[0].code = l[0].layers[0].code.replace('const v3 = 3;', 'const v3 = 33; // PC'); l[0].updatedAt = 2; });
  let n = await until(w, () => /v3 = 33/.test(mac.read(SK) || ''));
  ok(n > 0, 'scenes: a code edit arrives', T.why(w)); report.push(['scene code', n]);
  // the sliders' values
  pc.edit(SK, (l) => { l[0].layers[0].values = { Speed: 2.5, Glow: 0.4 }; l[0].updatedAt = 3; });
  n = await until(w, () => mac.json(SK)?.[0]?.layers?.[0]?.values?.Glow === 0.4);
  ok(n > 0, 'scenes: slider values arrive', T.why(w)); report.push(['scene params', n]);
  // a new scene (on the Mac this time)
  mac.edit(SK, (l) => { l.push(sceneOf('s4', { name: 'Made on the Mac', updatedAt: 4 })); });
  n = await until(w, () => ids(pc).includes('s4'));
  ok(n > 0, 'scenes: a new scene arrives', T.why(w)); report.push(['new scene', n]);
  // a rename
  pc.edit(SK, (l) => { l[1].name = 'Neon (renamed)'; l[1].updatedAt = 5; });
  n = await until(w, () => mac.json(SK)?.[1]?.name === 'Neon (renamed)');
  ok(n > 0, 'scenes: a rename arrives', T.why(w)); report.push(['renamed scene', n]);
  ok(await T.converge(w) > 0, 'scenes: settled', T.why(w));
  // a delete on the PC, as the Lab does it: the scene into History's trash (three-history, written 1.5 s later), then out
  // of the list
  const gone = pc.json(SK)[2];
  pc.edit(SK, (l) => l.filter((s) => s.id !== 's3'));
  // the Mac's Lab holds its list and its trash (the window's side, as tools/three.js applies an arrival)
  let macTrash = []; const removed = [];
  n = await until(w, () => !ids(mac).includes('s3'));
  ok(n > 0, 'scenes: a delete arrives (the scene leaves the list)', T.why(w));
  removed.push(gone);
  // the trash file hasn't come yet: the Mac's Lab makes its own entry at once
  let r = SS.trashArrived(macTrash, removed, mac.json(HI)?.trash || null, 1000);
  macTrash = r.trash;
  ok(r.changed && macTrash.length === 1 && macTrash[0].id === 's3' && macTrash[0].there && macTrash[0].layers?.[0]?.code === CODE, 'scenes: deleted there → in this Lab\'s trash at once (its code kept)', macTrash);
  ok(Sim.raw.readdirSync(path.join(mac.data, 'kv', '.history', 'three-sketches')).some((f) => Sim.raw.readFileSync(path.join(mac.data, 'kv', '.history', 'three-sketches', f), 'utf8').includes('"s3"')), 'scenes: the Mac\'s list before the delete is kept aside (🛟 Recover lost scenes finds it)');
  w.clock.advance(1500);
  pc.edit(HI, (h) => { h.trash.unshift({ ...gone, deletedAt: w.clock.now() }); });
  const t0 = n;
  n = await until(w, () => (mac.json(HI)?.trash || []).some((t) => t.id === 's3'));
  ok(n > 0, 'scenes: the PC\'s trash entry arrives', T.why(w)); report.push(['deleted scene', t0, t0 + n]);
  r = SS.trashArrived(macTrash, [], mac.json(HI).trash, 2000);
  ok(r.trash.length === 1 && r.trash[0].id === 's3' && !r.trash[0].there, 'scenes: …and takes the place of the one made here (one entry per deleted scene)', r.trash);
  // the Mac's Lab saves its history with the entry made there before the real one came (the write guard merges)
  mac.write(HI, mac.e.guardWrite(mac.p(HI), { versions: {}, trash: macTrash }));
  ok(await T.converge(w) > 0, 'scenes: settled after the delete', T.why(w));
  for (const m of [pc, mac]) ok(SS.dedupeTrash(m.json(HI).trash).filter((t) => t.id === 's3').length === 1 && !ids(m).includes('s3'), `scenes: on the ${m.name}: deleted, once in the trash (read as the Lab reads it)`, m.json(HI));
});

// ---------- 2. assets ----------
async function assets(opt) {
  const tag = opt.name;
  const { w, pc, mac } = await pair(`assets-${tag}`, opt);
  pc.write(SK, [sceneOf('s1')]); pc.write(RF, { s1: [] });
  ok(await T.converge(w) > 0, `assets/${tag}: first sync`, T.why(w));
  const files = { tex: ['refs/1761800000001-Paint.png', rnd(2 * MB, 1), 'image'], model: ['refs/1761800000002-Robot.GLB', rnd(12 * MB, 2), 'model'], sound: ['refs/1761800000003-loop.wav', rnd(6 * MB, 3), 'audio'] };
  const from = opt.from === 'mac' ? mac : pc; const to = from === pc ? mac : pc;
  for (const [key, [rel, buf, kind]] of Object.entries(files)) {
    from.write(rel, buf);
    from.edit(RF, (r) => { r.s1.push({ id: `r-${key}`, key, name: path.basename(rel).replace(/^\d+-/, ''), kind, path: from.p(rel), size: buf.length, at: 1 }); });
    const n = await until(w, () => same(readOr(to.p(rel)), buf) && (to.json(RF)?.s1 || []).some((x) => x.key === key), 40);
    ok(BEFORE && key === 'model' && opt.ph ? n < 0 : n > 0, `assets/${tag}: ${key} (${(buf.length / MB).toFixed(0)} MB) ${BEFORE && key === 'model' && opt.ph ? 'never arrives (before round 87)' : 'arrives'}`, { n, why: T.why(w), only: to.last?.cloudOnly });
    if (opt.report) report.push([`${kind} (${(buf.length / MB).toFixed(0)} MB)${opt.ph ? ` · ${opt.ph}` : ''}`, n]);
  }
  if (BEFORE && opt.ph) return;
  ok(await T.converge(w) > 0, `assets/${tag}: settled`, T.why(w));
  // the paths in three-refs are the other computer's own (its data folder), every file there
  const refs = to.json(RF).s1;
  const fwd = (p) => String(p).replace(/\\/g, '/'); // (the PC's engine writes its paths with "\\": a real PC's form)
  ok(refs.length === 3 && refs.every((x) => fwd(x.path) === fwd(to.p(Object.values(files).find(([rel]) => rel.endsWith(x.name))[0])) && fs.existsSync(fwd(x.path))), `assets/${tag}: each reference's path is ${to.name}'s own and the file is there`, refs.map((x) => x.path));
  // unchanged: never copied again
  const before = [pc, mac].map((m) => ({ ...(m.last?.last || {}) }));
  let moved = 0;
  for (let i = 0; i < 4; i++) { await T.round(w); for (const m of [pc, mac]) moved += (m.last?.last?.pushed || 0) + (m.last?.last?.pulled || 0); }
  ok(moved === 0, `assets/${tag}: unchanged files are never copied again`, { moved, before });
  // a reference taken out on one computer (the Lab trashes its copy): gone on the other, in its Deleted files
  const [relS, bufS] = files.sound;
  Sim.raw.unlinkSync(from.p(relS)); from.edit(RF, (r) => { r.s1 = r.s1.filter((x) => x.key !== 'sound'); });
  const n = await until(w, () => !fs.existsSync(to.p(relS)));
  ok(n > 0, `assets/${tag}: a reference deleted on one computer leaves the other`, T.why(w));
  const tr = await to.e.trash();
  ok(tr.some((x) => x.rel === relS), `assets/${tag}: …into its Deleted files (restorable), not gone`, tr.map((x) => x.rel));
  ok(T.recoverable(w, bufS.subarray(0, 64).toString('latin1')) || tr.some((x) => x.rel === relS), `assets/${tag}: the sound can still be found`);
}
scenario('assets', async () => {
  await assets({ name: 'plain', report: true });
  await assets({ name: 'mac-icloud-stub', mac: { placeholders: 'stub' }, ph: 'iCloud stub on the Mac', report: true });
  await assets({ name: 'mac-dataless', mac: { placeholders: 'dataless' }, ph: 'Mac dataless', report: true });
  await assets({ name: 'pc-onedrive', pc: { placeholders: 'win' }, from: 'mac', ph: 'OneDrive online-only on the PC', report: true });
  // renders and captures keep the old rule: a big one isn't downloaded behind your back
  ok(!K.needed.has('renders/final.mp4') && !K.needed.has('captures/take.webm') && K.needed.has('refs/1-a.glb') && K.needed.has('templates/t1/model.glb') && K.needed.with(new Set(['renders/final.mp4'])).has('renders/final.mp4'), 'assets: only the Lab\'s references and templates are brought down by themselves (renders / captures as before; "Download the big files now" adds its own)');
});

// ---------- 3. the big lane ----------
scenario('lane', async () => {
  const { w, pc } = await pair('lane');
  pc.write(SK, [sceneOf('s1')]);
  ok(await T.converge(w) > 0, 'lane: first sync', T.why(w));
  pc.e.set({ chunkWait: async () => { await new Promise((r) => setTimeout(r, 30)); } }); // the model goes up slowly
  pc.write('refs/1761800000009-City.glb', rnd(30 * MB, 9));
  pc.edit(SK, (l) => { l[0].layers[0].code += '\n// saved while the model goes up'; l[0].updatedAt = 9; });
  w.clock.advance(2000); pc.view.tick();
  await pc.e.pass(); // one pass (the app's: it doesn't wait for the lane)
  const cloudSk = path.join(pc.cloudRoot, 'Hearth', 'files', 'kv', 'three-sketches.json');
  ok(/saved while the model goes up/.test(readOr(cloudSk)?.toString() || '') && (pc.e.status().moving > 0 || (pc.e.status().transfers || []).length > 0), 'lane: the scene is in the cloud folder while the 30 MB model is still going up beside it', pc.e.status());
  await pc.e.laneIdle();
});

// ---------- 4. the scene open on both computers, edited on both ----------
// a Lab window: its scenes in memory, a change waiting (not written yet), saved through sync's guard (as store.js does),
// held with StoreAck as tools/three.js holds three-sketches
function labWindow(m) {
  const w = { held: m.json(SK), dirty: false };
  w.save = () => { const v = m.e.guardWrite(m.p(SK), clone(w.held)); m.write(SK, v); w.dirty = false; return v; };
  w.sa = SA.create({ ack: (rels, since) => m.e.ackPulled(rels, since) });
  w.sa.hold(SK, { pending: () => w.dirty, flush: () => w.save(), read: async () => m.json(SK), apply: (v) => { w.held = v; } });
  return w;
}
scenario('both', async () => {
  const { w, pc, mac } = await pair('both');
  pc.write(SK, [sceneOf('s1')]);
  ok(await T.converge(w) > 0, 'both: first sync', T.why(w));
  take(pc); take(mac); pc.e.ackPulled(); mac.e.ackPulled();
  // different lines: the PC saves; the Mac's window has its own change waiting when the PC's arrives
  const win = labWindow(mac);
  pc.edit(SK, (l) => { l[0].layers[0].code = l[0].layers[0].code.replace('const v1 = 1;', 'const v1 = 10; // PC'); l[0].updatedAt = 2; });
  win.held[0].layers[0].code = win.held[0].layers[0].code.replace('const v9 = 9;', 'const v9 = 90; // Mac'); win.dirty = true;
  let n = await until(w, () => mac.pulled.some((p) => p.rel === SK));
  ok(n > 0, 'both: the PC\'s edit arrives on the Mac', T.why(w));
  await win.sa.arrived(take(mac));
  ok(/v1 = 10/.test(win.held[0].layers[0].code) && /v9 = 90/.test(win.held[0].layers[0].code), 'both: different lines: the Mac\'s window holds both edits', win.held[0].layers[0].code);
  ok(await T.converge(w) > 0, 'both: settled', T.why(w));
  for (const m of [pc, mac]) ok(/v1 = 10/.test(m.read(SK)) && /v9 = 90/.test(m.read(SK)), `both: different lines: both edits on the ${m.name}`);
  ok(!(await pc.e.aside()).length && !(await mac.e.aside()).length, 'both: different lines: nothing kept aside (nothing lost)');
  // the same line: the Mac's window has its change of that line waiting when the PC's arrives
  take(pc); take(mac);
  pc.edit(SK, (l) => { l[0].layers[0].code = l[0].layers[0].code.replace(/const v5 = 5;[^\n]*/, 'const v5 = 55; // PC same line'); l[0].updatedAt = 3; });
  win.held[0].layers[0].code = win.held[0].layers[0].code.replace(/const v5 = 5;[^\n]*/, 'const v5 = 500; // Mac same line'); win.dirty = true;
  n = await until(w, () => mac.pulled.some((p) => p.rel === SK));
  ok(n > 0, 'both: the PC\'s same-line edit arrives', T.why(w));
  await win.sa.arrived(take(mac));
  ok(/v5 = 500/.test(win.held[0].layers[0].code) && !/v5 = 55;/.test(win.held[0].layers[0].code), 'both: the same line: the Mac\'s window keeps its own line (never two versions pasted into code)', win.held[0].layers[0].code);
  const notes = await mac.e.aside();
  ok(notes.length === 1 && notes[0].rel === SK && notes[0].why === 'guard', 'both: the same line: "Kept aside" — the PC\'s version, with a note in the sync panel', notes);
  ok((await mac.e.trash()).some((t) => t.id === notes[0]?.trash), 'both: …in the Mac\'s Deleted files (Compare / Keep both / Use that one)');
  ok(await T.converge(w) > 0, 'both: settled after the clash', T.why(w));
  ok(T.recoverable(w, 'v5 = 55; // PC same line'), 'both: the PC\'s line can still be found (nothing lost)');
  for (const m of [pc, mac]) ok(/v5 = 500/.test(m.read(SK)), `both: one version of the line on the ${m.name} (the Mac's, whose window held it)`);
  // edited on both while the PC was offline (no window holding it): different lines merge
  const offline = async (pcFn, macFn) => {
    pc.view.online = false; pc.offline = true;
    pc.edit(SK, (l) => { l[0].layers[0].code = pcFn(l[0].layers[0].code); l[0].updatedAt += 1; });
    for (let i = 0; i < 2; i++) await T.round(w);
    mac.edit(SK, (l) => { l[0].layers[0].code = macFn(l[0].layers[0].code); l[0].updatedAt += 2; });
    for (let i = 0; i < 2; i++) await T.round(w);
    pc.view.online = true; pc.offline = false;
    ok(await T.converge(w) > 0, 'both/offline: settled', T.why(w));
    return pc.json(SK)[0].layers[0].code;
  };
  let code = await offline((c) => c.replace('const v2 = 2;', 'const v2 = 20; // PC offline'), (c) => c.replace('const v4 = 4;', 'const v4 = 40; // Mac'));
  ok(/v2 = 20/.test(code) && /v4 = 40/.test(code) && mac.read(SK) === pc.read(SK), 'both/offline: different lines: both kept, on both', code);
  // …and the same line (a real clash in that layer's code: one version of the code, never two pasted together; the other
  // computer's whole version kept aside)
  code = await offline((c) => c.replace(/const v7 = 7;[^\n]*/, 'const v7 = 7000; // PC offline'), (c) => c.replace(/const v7 = 7;[^\n]*/, 'const v7 = 77; // Mac'));
  const v7 = /const v7 = (\d+)/.exec(code)?.[1];
  ok(['7000', '77'].includes(v7) && T.recoverable(w, v7 === '77' ? 'v7 = 7000; // PC offline' : 'v7 = 77; // Mac'), 'both/offline: the same line: one version in the code, the other recoverable (kept aside / Deleted files)', { v7, aside: [...await pc.e.aside(), ...await mac.e.aside()].map((x) => x.rel) });
  const said = [...await pc.e.aside(), ...await mac.e.aside(), ...pc.autoResolved, ...mac.autoResolved];
  ok(said.length > 0, 'both/offline: the clash is said (a "kept aside" note or a conflict settled by itself)', said);
});

// ---------- 5. scoped passes: the Lab's own files ----------
scenario('scoped', async () => {
  const { w, pc, mac } = await pair('scoped');
  pc.write(SK, [sceneOf('s1')]); pc.write(RF, { s1: [] }); pc.write(PR, { v: 1, items: {} });
  ok(await T.converge(w) > 0, 'scoped: first sync', T.why(w));
  // each pass names only what its watchers heard (the paths written on this side, what landed on the other)
  const heard = { PC: new Set(), Mac: new Set() };
  const hear = (m, rel) => { heard[m.name].add(m.p(rel)); };
  const scopedRound = async () => {
    w.clock.advance(2000);
    for (const m of [pc, mac]) {
      m.view.tick();
      const local = [...heard[m.name]]; heard[m.name].clear();
      const cloud = []; Sim.raw.readdirSync(path.join(m.cloudRoot, 'Hearth', 'files'), { recursive: true }).forEach((f) => cloud.push(path.join(m.cloudRoot, 'Hearth', 'files', String(f))));
      m.last = await m.e.pass({ scope: { local, cloud } });
      if (m.e.laneIdle) await m.e.laneIdle();
    }
  };
  const writes = [
    ['scene', () => { pc.edit(SK, (l) => { l[0].name = 'Scoped'; l[0].updatedAt = 2; }); hear(pc, SK); }, () => mac.json(SK)?.[0]?.name === 'Scoped'],
    ['reference', () => { pc.write('refs/1761800000020-Tex.png', rnd(1 * MB, 20)); pc.edit(RF, (r) => { r.s1.push({ id: 'rt', key: 'tex', path: pc.p('refs/1761800000020-Tex.png') }); }); hear(pc, 'refs/1761800000020-Tex.png'); hear(pc, RF); }, () => fs.existsSync(mac.p('refs/1761800000020-Tex.png')) && (mac.json(RF)?.s1 || []).length === 1],
    ['template', () => { pc.write('templates/t1/template.json', { v: 1, name: 'Mine' }); hear(pc, 'templates/t1/template.json'); }, () => mac.json('templates/t1/template.json')?.name === 'Mine'],
    ['presets', () => { pc.edit(PR, (x) => { x.items.p1 = { kind: 'trig', name: 'Mine', data: '{"a":1}', at: 1 }; }); hear(pc, PR); }, () => Boolean(mac.json(PR)?.items?.p1)],
  ];
  for (const [what, write, there] of writes) {
    write();
    let n = -1; for (let i = 1; i <= 10; i++) { await scopedRound(); if (there()) { n = i; break; } }
    ok(n > 0 && pc.e.scope().mode === 'scoped' && mac.e.scope().mode === 'scoped', `scoped: a ${what} syncs in scoped passes (no whole look)`, { n, pc: pc.e.scope(), mac: mac.e.scope() });
  }
});

// ---------- 6. presets ----------
scenario('presets', async () => {
  // the rule alone (one computer's storage against the store)
  let r = SS.presetsMerge(null, { trig: [{ name: 'Techno', cfg: { k: 1 } }], palettes: [{ name: 'Dusk', colors: ['#111', '#f80'] }] }, {}, 1);
  const it = (x, name) => Object.values(x.kv.items).find((y) => y.name === name);
  ok(r.kvChanged && JSON.parse(it(r, 'Techno').data).k === 1 && JSON.parse(it(r, 'Dusk').data)[1] === '#f80' && r.known.trig.Techno?.id, 'presets: the first time, what this computer has goes into the store', r);
  r = SS.presetsMerge(null, { trig: [{ name: 'A', cfg: 1 }] }, { trig: { A: '1', B: '2' } }, 1);
  ok(r.local.trig.length === 1 && r.local.trig[0].name === 'A' && !r.localChanged, 'presets: no store (gone / never made): nothing here is taken for "deleted there"', r);
  r = SS.presetsMerge({ v: 1, items: { q1: { kind: 'luts', name: 'x', data: '1' } }, later: { x: 1 } }, { trig: [{ name: 'A', cfg: 1 }] }, {}, 1);
  ok(r.kv.later?.x === 1 && r.kv.items.q1?.kind === 'luts', 'presets: what a newer Hearth keeps in the store stays', r.kv);
  // through two computers: each computer's storage (localStorage) + the store synced by the engine
  const { w, pc, mac } = await pair('presets');
  const ls = { PC: { trig: [], palettes: [] }, Mac: { trig: [], palettes: [] } }; const known = { PC: {}, Mac: {} };
  const lab = (m) => { // what the Lab does at start, after a change here, and when the store arrives
    const disk = m.json(PR);
    const x = SS.presetsMerge(disk, ls[m.name], known[m.name], m.now());
    ls[m.name] = x.local; known[m.name] = x.known;
    if (x.kvChanged || !disk) m.write(PR, m.e.guardWrite(m.p(PR), x.kv));
    return x;
  };
  ls.PC.trig = [{ name: 'My techno', cfg: { kick: 0.8 } }]; ls.PC.palettes = [{ name: 'Neon', colors: ['#0ff', '#f0f'] }];
  ls.Mac.palettes = [{ name: 'Dusk', colors: ['#222', '#f80'] }, { name: 'Neon', colors: ['#000', '#fff'] }]; // the same name, other colours
  lab(pc); lab(mac);
  ok(await T.converge(w) > 0, 'presets: first sync', T.why(w));
  lab(pc); lab(mac); ok(await T.converge(w) > 0, 'presets: settled', T.why(w)); lab(pc); lab(mac);
  const names = (m, k) => ls[m.name][k].map((x) => x.name).sort().join();
  ok(names(pc, 'trig') === 'My techno' && names(mac, 'trig') === 'My techno', 'presets: a trigger preset made on the PC is on the Mac', ls);
  ok(names(pc, 'palettes') === names(mac, 'palettes') && names(pc, 'palettes') === 'Dusk,Neon,Neon (2)', 'presets: palettes from both; one name made on both before they met: both kept', ls);
  // deleted on the Mac → deleted on the PC
  ls.Mac.palettes = ls.Mac.palettes.filter((x) => x.name !== 'Dusk'); lab(mac);
  let n = await until(w, () => !mac.json(PR) ? false : !lab(pc).local.palettes.some((x) => x.name === 'Dusk'));
  ok(n > 0 && !ls.PC.palettes.some((x) => x.name === 'Dusk'), 'presets: a palette deleted on the Mac goes on the PC', ls.PC);
  report.push(['Lab presets', n]);
  // edited on the PC while deleted on the Mac: the edit stays (never lost)
  ok(await T.converge(w) > 0, 'presets: settled', T.why(w)); lab(pc); lab(mac);
  pc.view.online = false;
  ls.PC.trig[0].cfg = { kick: 0.9 }; lab(pc);
  ls.Mac.trig = []; lab(mac);
  pc.view.online = true;
  for (let i = 0; i < 3; i++) { ok(await T.converge(w) > 0, 'presets: settled', T.why(w)); lab(pc); lab(mac); }
  ok(ls.PC.trig.some((x) => x.name === 'My techno' && x.cfg.kick === 0.9) && ls.Mac.trig.some((x) => x.name === 'My techno' && x.cfg.kick === 0.9), 'presets: edited on one, deleted on the other: the edit stays on both', ls);
});

// ---------- 7. the trash rules alone ----------
scenario('trash', async () => {
  const s = { id: 's9', name: 'Gone', code: 'x', updatedAt: 50 };
  let r = SS.trashArrived([], [s], null, 100);
  ok(r.changed && r.trash[0].there && r.trash[0].deletedAt === 100, 'trash: made here when the other computer\'s entry isn\'t here', r);
  r = SS.trashArrived(r.trash, [s], null, 200);
  ok(!r.changed && r.trash.length === 1, 'trash: never twice', r);
  r = SS.trashArrived([], [s], [{ ...s, deletedAt: 80 }], 300);
  ok(r.trash.length === 1 && !r.trash[0].there && r.trash[0].deletedAt === 80, 'trash: the other computer\'s own entry when it\'s here', r);
  r = SS.trashArrived([{ ...s, deletedAt: 10 }], [s], null, 400);
  ok(r.trash.length === 2 && r.trash[0].there, 'trash: an older deletion of the same scene (brought back since) doesn\'t stand for this one', r);
  ok(SS.dedupeTrash(Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, deletedAt: i }))).length === 30, 'trash: at most 30, newest first');
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const f0 = failures;
    try { await s.fn(); } catch (err) { failures += 1; console.log(`FAIL ${s.name}: threw ${err.stack}`); }
    console.log(`${failures === f0 ? 'ok  ' : 'FAIL'} ${s.name}`);
  }
  if (report.length) console.log(`rounds from a save to the other computer (2 s simulated each): ${report.map((r) => `${r[0]} ${r.slice(1).join('→')}`).join(' · ')}`);
  console.log(`labsync87-test${BEFORE ? ' (--before)' : ''}: ${passes} passed, ${failures} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failures ? 1 : 0);
}
main();
