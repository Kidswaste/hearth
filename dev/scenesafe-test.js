#!/usr/bin/env node
// Unit test for 🛟 scene safety (round 43, scenesafe): scenesafe-core.js (reads that say what happened, with Windows
// errors injected: EBUSY / EPERM / EACCES / an online-only placeholder; the scenes guard; rotating copies), store.js /
// storework.js on a throwaway copy (thread off and on: a starter list never replaces your scenes, explicit deletes
// still work, sync merging many scenes away is held, a damaged file and the scenes left only in .prev are kept aside,
// a file held by another program is never written blind), and the recovery scan (scenesafemain.js) over every place a
// scene can still be: .prev, the rotating copies, History's trash + versions, the time machine, sync's kept-aside
// files, the cloud folder's copy / trash / conflict copies, a backup zip. Also documents the bug: the round-42 path.
//   node dev/scenesafe-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const here = (f) => require(fs.existsSync(path.join(__dirname, f)) ? path.join(__dirname, f) : path.join(__dirname, '..', f)); // (the store part runs from a temp copy)
const C = here('scenesafe-core.js');
const S = here('sync-merge.js');
let fails = 0; let passes = 0;
const check = (ok, label, extra) => { if (ok) { passes += 1; console.log(`✓ ${label}`); } else { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra).slice(0, 400)}` : ''}`); } };
const sc = (id, name, code = `// ${id}`, extra = {}) => ({ id, name, code, updatedAt: 1000 + id.length, ...extra });
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const W = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };

// ---------- inside a throwaway copy of the store (store.js keeps data next to itself) ----------
if (process.argv[2] === '--store') {
  const store = require(path.join(process.cwd(), 'store.js'));
  const kv = path.join(process.cwd(), 'data', 'kv');
  const F = path.join(kv, 'three-sketches.json');
  const P = path.join(kv, 'three-sketches.prev.json');
  const H = path.join(kv, '.history', 'three-sketches');
  const threaded = process.env.HEARTH_STORE_THREAD === '1';
  const tag = threaded ? ' (store thread)' : ' (no thread)';
  const ids = (f) => J(f).map((x) => x.id);
  const copies = () => { try { return fs.readdirSync(H); } catch { return []; } };
  (async () => {
    const mine = [sc('a', 'Orb'), sc('b', 'Waves'), sc('c', 'Tunnel'), sc('d', 'Bloom')];
    W(F, mine);
    // a held file (Windows: antivirus / OneDrive / indexer): never "empty"
    if (!threaded) {
      const rf = fs.readFileSync; let held = 0;
      fs.readFileSync = function (f, ...a) { if (/three-sketches\.json$/.test(String(f)) && !/prev/.test(String(f))) { held += 1; const e = new Error('EBUSY: resource busy or locked'); e.code = 'EBUSY'; throw e; } return rf.call(this, f, ...a); };
      W(P, mine.slice(0, 3));
      const st = store.getKVStatus('three-sketches');
      check(st.state === 'unreadable' && st.code === 'EBUSY', `EBUSY on every try: the read says "unreadable", not empty${tag}`, st.state);
      check(held >= 5, 'a held file is tried again a few times first', held);
      const g = store.getKV('three-sketches', []);
      check(Array.isArray(g) && g.length === 3, 'the plain read falls back to the .prev copy, never to []', g.length);
      check(store.getKVOff('three-sketches', []).length === 3, 'getKVOff (the kv:get IPC) too');
      // the save that used to follow (the starter scene) while the file is held: refused, nothing written
      const r = await store.setKV('three-sketches', [sc('s1', 'Basic scene')]);
      fs.readFileSync = rf;
      check(ids(F).join() === 'a,b,c,d', 'a save while the scenes file is held writes nothing (the file is untouched)', ids(F));
      check(r === undefined, 'that save just waits for the next one (no error for the window)');
      // EPERM twice then fine (a placeholder downloading): read on the third try
      let n = 0;
      fs.readFileSync = function (f, ...a) { if (/three-sketches\.json$/.test(String(f)) && n < 2) { n += 1; const e = new Error('EPERM'); e.code = 'EPERM'; throw e; } return rf.call(this, f, ...a); };
      const st2 = store.getKVStatus('three-sketches');
      fs.readFileSync = rf;
      check(st2.state === 'ok' && st2.value.length === 4, 'EPERM twice, then readable: read for sure on a later try', st2.state);
      fs.rmSync(P, { force: true });
    }
    // the starter list saved over your scenes (the round-42 loss): your scenes stay, the starter joins them
    let r = await store.setKV('three-sketches', [sc('s1', 'Basic scene')]);
    check(ids(F).join() === 's1,a,b,c,d', `a starter list never replaces your scenes${tag}`, ids(F));
    check(r?.restored?.length === 4, 'the save answers which scenes were kept (the Lab shows them again)', r);
    check(copies().some((n) => /-n4\.json$/.test(n)), 'an automatic copy of the 4 scenes was kept before that save', copies());
    // an explicit delete still deletes
    r = await store.setKV('three-sketches', J(F).filter((x) => x.id !== 'a'), { removed: ['a'] });
    check(ids(F).join() === 's1,b,c,d' && !r, `Delete… still deletes (the Lab names what it deleted)${tag}`, ids(F));
    check(copies().some((n) => /-before\.json$/.test(n)), 'a copy is kept right before scenes leave the file', copies());
    // not a list: refused
    await store.setKV('three-sketches', { nope: true });
    check(Array.isArray(J(F)) && J(F).length === 4, `a value that isn't a list of scenes is never written over them${tag}`);
    // sync's merge drops many at once (a list lost on the other computer): held · one scene deleted there: passes
    store.setBeforeWrite((file, v) => (/three-sketches/.test(file) ? v.filter((x) => x.id === 's1') : v));
    r = await store.setKV('three-sketches', J(F));
    check(ids(F).length === 4 && r?.restored?.length === 3, `sync merging 3 of 4 scenes away is held (that's a lost list, not a delete)${tag}`, ids(F));
    store.setBeforeWrite((file, v) => (/three-sketches/.test(file) ? v.filter((x) => x.id !== 'd') : v));
    r = await store.setKV('three-sketches', J(F));
    check(ids(F).join() === 's1,b,c' && !r, `one scene deleted on the other computer still goes${tag}`, ids(F));
    store.setBeforeWrite(null);
    // the file goes missing; the scenes live only in .prev: saving a starter twice keeps .prev's scenes aside first
    const prevBefore = ids(P);
    fs.rmSync(F);
    await store.setKV('three-sketches', [sc('n1', 'Basic scene')]);
    await store.setKV('three-sketches', [sc('n1', 'Basic scene', '// changed')]);
    const kept = copies().filter((n) => /-prev\.json$/.test(n));
    check(kept.length >= 1 && J(path.join(H, kept[0])).length === prevBefore.length, `scenes that were only in .prev are kept aside before .prev is replaced${tag}`, { kept, prevBefore });
    // a damaged file (a crash mid-write, outside Hearth): the read uses .prev, the save keeps the damage aside and the good .prev
    W(P, mine);
    fs.writeFileSync(F, '[{"id":"a","name":"Or');
    const st3 = store.getKVStatus('three-sketches');
    check(st3.state === 'ok' && st3.from === 'prev' && st3.garbled, `a damaged file reads as its .prev copy (said so)${tag}`, st3);
    await store.setKV('three-sketches', st3.value);
    check(copies().some((n) => /-garbled\.json$/.test(n)), 'the damaged file is kept aside', copies());
    check(ids(P).join() === 'a,b,c,d', 'the good .prev copy is not replaced by the damaged file', ids(P));
    // copies stay capped
    for (const n of copies()) fs.rmSync(path.join(H, n));
    for (let i = 0; i < 30; i++) W(path.join(H, C.copyName(Date.now() - (i + 1) * 3600e3, 4)), mine);
    fs.writeFileSync(F, JSON.stringify(mine));
    await store.setKV('three-sketches', mine.slice(1), { removed: ['a'] }); // (a copy is due: scenes leave)
    check(copies().length <= 18, `the rotating copies stay capped${tag}`, copies().length);
    // History has copies too
    W(path.join(kv, 'three-history.json'), { versions: { a: [{ at: 1, code: 'x' }] }, trash: [] });
    await store.setKV('three-history', { versions: {}, trash: [] });
    check(fs.readdirSync(path.join(kv, '.history', 'three-history')).length === 1, `History keeps an automatic copy too${tag}`);
    // another store is untouched by all this
    await store.setKV('notes', []);
    check(!fs.existsSync(path.join(kv, '.history', 'notes')), 'other stores: no copies, no guard');
    await store.idle();
    console.log(`${passes} passed, ${fails} failed`);
    process.exit(fails ? 1 : 0);
  })().catch((err) => { console.error(err); process.exit(1); });
  return;
}

(async () => {
  // ---------- the bug, as it was (sync-merge.js is unchanged): one computer's starter list deletes everywhere ----------
  const all = [sc('a', 'Orb'), sc('b', 'Waves'), sc('c', 'Tunnel')];
  const merged = S.merge3(all, [sc('s1', 'Basic scene')], all).value;
  check(merged.length === 1 && merged[0].id === 's1', 'documents the amplifier: a starter list saved on one computer reads as "3 scenes deleted" to sync', merged.map((x) => x.id));
  const g = C.guardScenes({ disk: all, sent: ['s1'], value: merged });
  check(g.value.length === 4 && g.restored.length === 3, 'the guard keeps them (the Lab never sent them, nobody deleted them)');

  // ---------- reads that say what happened (fs injected: Windows errors) ----------
  const fake = (files, errs = {}) => ({ readFileSync(f) { const k = path.basename(f); const e = errs[k]; if (e && e.n > 0) { e.n -= 1; const x = new Error(e.code); x.code = e.code; throw x; } if (!(k in files)) { const x = new Error('ENOENT'); x.code = 'ENOENT'; throw x; } return files[k]; } });
  const nowait = { wait: () => {} };
  let r = C.readStatus(fake({}), '/kv/three-sketches.json', nowait);
  check(r.state === 'missing', 'no file: "missing"');
  r = C.readStatus(fake({ 'three-sketches.json': '[1]' }, { 'three-sketches.json': { code: 'EBUSY', n: 99 } }), '/kv/three-sketches.json', nowait);
  check(r.state === 'unreadable' && r.code === 'EBUSY', 'EBUSY (antivirus / OneDrive holding it): "unreadable", never empty');
  for (const code of ['EPERM', 'EACCES', 'EIO', 'UNKNOWN']) {
    r = C.readStatus(fake({ 'three-sketches.json': '[1]', 'three-sketches.prev.json': '[2]' }, { 'three-sketches.json': { code, n: 99 } }), '/kv/three-sketches.json', nowait);
    check(r.state === 'unreadable' && r.prev?.[0] === 2, `${code}: "unreadable", with the .prev copy offered`);
  }
  r = C.readStatus(fake({ 'three-sketches.json': '[1]' }, { 'three-sketches.json': { code: 'EBUSY', n: 3 } }), '/kv/three-sketches.json', nowait);
  check(r.state === 'ok' && r.value[0] === 1, 'held three times, then free: read for sure');
  r = C.readStatus(fake({ 'three-sketches.json': '[{"id":', 'three-sketches.prev.json': '[3]' }), '/kv/three-sketches.json', nowait);
  check(r.state === 'ok' && r.from === 'prev' && r.garbled, 'cut short: its .prev copy, said so');
  r = C.readStatus(fake({ 'three-sketches.json': '[{"id":' }), '/kv/three-sketches.json', nowait);
  check(r.state === 'unreadable' && r.code === 'EGARBLED', 'cut short without a .prev copy: "unreadable" (not empty)');

  // ---------- the guard ----------
  const four = [sc('a', 'A'), sc('b', 'B'), sc('c', 'C'), sc('d', 'D')];
  check(C.guardScenes({ disk: four, value: four.slice(1), removed: ['a'] }).restored.length === 0, 'a named delete passes');
  check(C.guardScenes({ disk: four, value: four.slice(1) }).restored.join() === 'a', 'an unnamed drop is kept back');
  check(C.guardScenes({ disk: four, sent: ['a', 'b', 'c', 'd'], value: four.slice(1) }).restored.length === 0, 'one scene merged away by sync passes');
  check(C.guardScenes({ disk: four, sent: ['a', 'b', 'c', 'd'], value: four.slice(2) }).restored.length === 2, 'two of four merged away at once: held');
  check(C.guardScenes({ disk: four, value: 'oops' }).refused, 'not a list: refused');
  check(C.guardScenes({ disk: [], value: [] }).restored.length === 0, 'an empty file: nothing to keep');
  check(C.onlyStarter([sc('x', 'Basic scene')]) && !C.onlyStarter(four) && C.onlyStarter([]), 'the starter list is recognised');

  // ---------- copies: names, pruning ----------
  const now = new Date(2026, 9, 15, 12, 0, 0).getTime();
  const nm = C.copyName(now, 7, 'before');
  check(C.parseCopy(nm)?.count === 7 && C.parseCopy(nm).at === now && C.parseCopy(nm).tag === 'before', 'a copy\'s name carries its time and scene count', nm);
  const names = Array.from({ length: 40 }, (_, i) => C.copyName(now - i * 6 * 3600e3, i === 33 ? 99 : 5));
  const gone = C.pruneCopies(names, { keep: 10, now });
  const left = names.filter((n) => !gone.includes(n));
  check(left.length <= 18 && left.includes(names[0]) && left.includes(names[33]), 'pruning keeps the newest, one a day for a week and the fullest one', left.length);
  check(C.copyDue(0, now) && !C.copyDue(now - 60e3, now) && C.copyDue(now - 60e3, now, { dropping: true }) && C.copyDue(now - 11 * 60e3, now), 'a copy every 10 minutes, and always before scenes leave');

  // ---------- store.js on throwaway copies, thread off and on ----------
  for (const thread of ['0', '1']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-scenesafe-'));
    for (const f of ['store.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'scenesafe-core.js', 'datasafe-core.js', 'recall-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
    fs.copyFileSync(__filename, path.join(dir, 't.js'));
    const run = spawnSync(process.execPath, [path.join(dir, 't.js'), '--store'], { cwd: dir, env: (({ HEARTH_STORE_THREAD: _t, ...e }) => (thread === '1' ? { ...e, HEARTH_STORE_THREAD: '1' } : e))(process.env), encoding: 'utf8', timeout: 60000 });
    const out = `${run.stdout}${run.stderr}`;
    for (const line of out.split('\n')) if (/^[✓✖]/.test(line)) { if (line.startsWith('✓')) passes += 1; else fails += 1; console.log(line); }
    if (run.status !== 0 && !/✖/.test(out)) { fails += 1; console.log(`✖ the store run (thread ${thread}) failed: ${out.slice(-800)}`); }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---------- the recovery scan ----------
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-scenesafe-scan-'));
  const kv = path.join(data, 'kv');
  const TM = require('../tools/three-history-core.js');
  W(path.join(kv, 'three-sketches.json'), [sc('s1', 'Basic scene'), sc('live', 'Still here')]);
  W(path.join(kv, 'three-sketches.prev.json'), [sc('a', 'Orb'), sc('live', 'Still here')]);
  W(path.join(kv, '.history', 'three-sketches', C.copyName(now - 3600e3, 2)), [sc('b', 'Waves'), sc('a', 'Orb', '// older orb', { updatedAt: 5 })]);
  W(path.join(kv, 'three-history.json'), { versions: { v1: [{ at: 7000, code: '// v1 newest' }, { at: 10, code: '// v1 old' }], 'v2:main': [{ at: 8000, code: '// v2 base' }], 'v2:top': [{ at: 8100, code: '// v2 top' }] }, trash: [{ id: 't1', name: 'Deleted one', code: '// t1', deletedAt: 9000 }] });
  const doc = TM.blank(); TM.add(doc, { layers: [{ id: 'main', name: 'Layer 1', code: '// tm scene' }], vals: {}, sel: null, palette: null }, { at: 9500 });
  W(path.join(kv, 'three-tm-tm1.json'), doc);
  W(path.join(kv, 'three-thumbs.json'), { a: { url: 'data:image/jpeg;base64,AAA', at: 1 } });
  W(path.join(data, 'sync', 'trash', '2026-10-14', 'kv', 'three-sketches.json'), [sc('sy', 'Kept by sync')]);
  const cloudRoot = path.join(data, 'cloud');
  W(path.join(cloudRoot, 'Hearth', 'files', 'kv', 'three-sketches.json'), [sc('cl', 'In the cloud')]);
  W(path.join(cloudRoot, 'Hearth', '.sync', 'conflicts', '2026-10-14-0a1b2c3d.json'), { id: '2026-10-14-0a1b2c3d', rel: 'kv/three-sketches.json', kind: 'json', copy: '2026-10-14-0a1b2c3d.copy.json', at: now, from: 'MacBook' });
  W(path.join(cloudRoot, 'Hearth', '.sync', 'conflicts', '2026-10-14-0a1b2c3d.copy.json'), [sc('cf', 'From the Mac')]);
  const bdir = path.join(data, 'backups');
  const bsrc = path.join(data, 'bsrc');
  W(path.join(bsrc, 'data', 'kv', 'three-sketches.json'), [sc('bk', 'In a backup')]);
  fs.mkdirSync(bdir, { recursive: true });
  let zipped = false;
  try { execFileSync('zip', ['-qr', path.join(bdir, 'hearth-backup-2026-10-13-09-00.zip'), 'data'], { cwd: bsrc }); zipped = true; } catch { console.log('(no zip here: the backup part is skipped)'); }
  const M = require('../scenesafemain.js');
  M._set({ dataDir: data, configPath: path.join(data, 'none.json'), backupDir: bdir, syncmain: { status: () => ({ root: cloudRoot }), pathCtx: () => null } });
  const q = await M.scan({ quick: true });
  const qid = new Set(q.found.map((f) => f.id));
  check(['a', 'b', 't1', 'v1', 'v2', 'tm1', 'sy'].every((id) => qid.has(id)), 'quick scan: .prev, the copies, History\'s trash + versions, the time machine, sync\'s kept-aside file', [...qid]);
  check(!qid.has('cl') && !qid.has('bk'), 'quick scan leaves the cloud folder and the backups alone');
  check(!qid.has('live') && !qid.has('s1'), 'scenes already in the list aren\'t offered');
  const full = await M.scan({});
  const by = Object.fromEntries(full.found.map((f) => [f.id, f]));
  check(by.cl && by.cf && (!zipped || by.bk), 'full scan: the cloud copy, a sync conflict copy, a backup zip', Object.keys(by));
  check(by.a.scene.code === '// a' && by.a.name === 'Orb', 'the newest whole copy of a scene wins (not an older copy)', by.a.scene.code);
  check(by.a.thumb && by.a.from === 'The save before the last one', 'with its picture and where it came from', { thumb: Boolean(by.a.thumb), from: by.a.from });
  check(by.v2.scene.layers?.length === 2 && by.v1.scene.code === '// v1 newest', 'History\'s layer versions rebuild a scene (newest version per layer)', by.v2.scene.layers);
  check(by.tm1.scene.code === '// tm scene', 'the time machine\'s newest state rebuilds a scene');
  check(by.cf.from.includes('MacBook'), 'a conflict copy says which computer it came from', by.cf.from);
  check(full.sources.length >= 8, 'every place it looked is listed', full.sources.map((s) => s.label));
  // newer than the one in the list: offered as "newer"
  const withOld = await M.scan({ current: [sc('a', 'Orb', '// a', { updatedAt: 1 })], quick: true });
  check(!withOld.found.some((f) => f.id === 'a' && f.state === 'missing'), 'a scene in the list with the same content isn\'t offered');
  const newer = C.collect([sc('a', 'Orb', '// mine', { updatedAt: 1 })], [{ label: 'x', kind: 'scenes', list: [sc('a', 'Orb', '// newer', { updatedAt: 99 })] }]);
  check(newer[0]?.state === 'newer', 'a newer copy of a scene in the list is offered as newer');
  // bringing back: merged, never replacing
  const cur = [sc('a', 'Orb', '// mine'), sc('z', 'Mine')];
  const m = C.mergeInto(cur, [by.b.scene, { ...sc('a', 'Orb', '// recovered') }, sc('z', 'Mine')]);
  check(m.list.length === 4 && m.list[0].code === '// mine' && m.list[1].id === 'z', 'brought back next to yours: nothing replaced', m.list.map((x) => x.id));
  check(m.list.some((x) => /\(recovered\)$/.test(x.name) && x.id !== 'a'), 'a different version of a scene you have comes in as a copy "(recovered)"');
  check(m.added.length === 2, 'an identical scene isn\'t added twice', m.added);
  check(cur.length === 2, 'the list passed in is not changed (Undo takes the added ids back)');
  fs.rmSync(data, { recursive: true, force: true });

  // ---------- sync: a short list arriving from the other computer never takes the only copy ----------
  {
    const { createEngine } = require('../sync-engine.js');
    const w = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-scenesafe-sync-'));
    const cloud = path.join(w, 'cloud'); fs.mkdirSync(cloud, { recursive: true });
    const mk = (name) => {
      const m = { data: path.join(w, name, 'data'), config: path.join(w, name, 'app', 'config.json'), theme: path.join(w, name, 'app', 'theme.css'), home: path.join(w, name, 'home') };
      fs.mkdirSync(m.data, { recursive: true }); fs.mkdirSync(m.home, { recursive: true });
      W(m.config, { agents: [], settings: {} }); W(m.theme, '/* */');
      m.e = createEngine({ dataDir: m.data, configPath: m.config, themePath: m.theme, cloudRoot: cloud, machineName: name, home: m.home, settleMs: 0 });
      m.p = (rel) => path.join(m.data, ...rel.split('/'));
      return m;
    };
    const mac = mk('Mac'); const pc = mk('PC');
    W(mac.p('kv/three-sketches.json'), [sc('a', 'Orb'), sc('b', 'Waves'), sc('c', 'Tunnel')]);
    for (let i = 0; i < 2; i++) { await mac.e.pass(); await pc.e.pass(); }
    check(J(pc.p('kv/three-sketches.json')).length === 3, 'sync: both computers have the 3 scenes');
    // the PC's file becomes a starter list (how the round-42 Lab did it), and sync carries it over
    await new Promise((res) => setTimeout(res, 20));
    W(pc.p('kv/three-sketches.json'), [sc('s1', 'Basic scene')]);
    for (let i = 0; i < 2; i++) { await pc.e.pass(); await mac.e.pass(); }
    const macNow = J(mac.p('kv/three-sketches.json'));
    const aside = fs.readdirSync(path.join(mac.data, 'kv', '.history', 'three-sketches'));
    check(macNow.length === 1, 'documents the old propagation: the Mac\'s file followed the short list', macNow.map((x) => x.id));
    check(aside.some((n) => /-n3-sync\.json$/.test(n)) && J(path.join(mac.data, 'kv', '.history', 'three-sketches', aside.find((n) => /-sync\.json$/.test(n)))).length === 3, 'sync kept the Mac\'s 3 scenes aside first (data/kv/.history, never synced)', aside);
    const SM = require('../scenesafemain.js');
    SM._set({ dataDir: mac.data, configPath: mac.config, backupDir: path.join(w, 'none'), syncmain: null });
    const found = (await SM.scan({ quick: true })).found.map((f) => f.id).sort().join();
    check(found === 'a,b,c', 'and 🛟 Recover finds them there', found);
    check(!fs.existsSync(path.join(cloud, 'Hearth', 'files', 'kv', '.history')), 'the copies stay on each computer (not in the cloud folder)');
    fs.rmSync(w, { recursive: true, force: true });
  }

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
