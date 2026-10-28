#!/usr/bin/env node
// (round 75, syncstate75) The usage merge (store.js mergeKV) while cloud sync guards writes: on the store thread, the main
// process only passing the changes on (≈ 50 ms of it once a minute before: sync's guard turned the memo off, so the
// whole year-sized store was read and parsed on the main process each minute). Run by dev/syncstate75-test.js
// (scenario usage); prints one JSON line { checks: [[ok, what, detail]], ms }. store.js and its helpers are copied to a
// temp folder (it keeps its data next to itself: real data is never touched), with the store thread on.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.argv[2] !== '--inside') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-syncstate75-usage-'));
  for (const f of ['store.js', 'scenesafe-core.js', 'datasafe-core.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
  fs.copyFileSync(__filename, path.join(dir, 't.js'));
  const r = spawnSync(process.execPath, [path.join(dir, 't.js'), '--inside'], { cwd: dir, env: { ...process.env, HEARTH_STORE_THREAD: '1' }, encoding: 'utf8', timeout: 90000 });
  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exit(r.status ?? 1);
}

const checks = []; const ok = (c, what, detail) => checks.push([Boolean(c), what, detail]);
const store = require(path.join(process.cwd(), 'store.js'));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const ms = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };
(async () => {
  const kv = path.join(store.DATA_DIR, 'kv'); const file = path.join(kv, 'ui-usage.json');
  // a year of use (≈ 1 MB, like dev/bigprofile.js's)
  const items = {}; for (let i = 0; i < 4000; i++) items[`Area ${i % 40} › Button ${i}`] = { n: 1 + (i % 50), first: 1, last: 2 };
  const days = {}; for (let d = 0; d < 365; d++) days[`d${d}`] = Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`Area ${j % 40} › Button ${(d * 7 + j) % 4000}`, 1]));
  await store.setKV('ui-usage', { since: 1, items, days, hidden: [] }); await store.idle();
  const minute = []; for (let i = 0; i < 60; i++) minute.push(['inc', ['items', `Area 1 › Button ${i}`, 'n'], 1], ['max', ['items', `Area 1 › Button ${i}`, 'last'], 99], ['inc', ['days', 'today'], 1]);
  // sync on, nothing just arrived from the other computer: the guard wants no file
  let guarded = 0;
  store.setBeforeWrite((f, v) => { guarded += 1; return v; }, () => false);
  const [p1, t1] = ms(() => store.mergeKV('ui-usage', minute)); const r1 = await p1; await store.idle();
  const [p2, t2] = ms(() => store.mergeKV('ui-usage', minute)); const r2 = await p2; await store.idle();
  ok(r1?.ok && r2?.ok && J(file).days.today === 120 && J(file).items['Area 1 › Button 1'].n === 4, 'two minutes of clicks merged into the year-sized store (sync on)', { r1, r2, today: J(file).days.today });
  ok(t1 < 5 && t2 < 5, `the main process's part of each merge: ${t1.toFixed(2)} ms, ${t2.toFixed(2)} ms (budget 5; was ≈ 50 with sync on)`, { t1, t2 });
  ok(guarded === 0, 'the guard is not run for a file it doesn\'t want');
  ok(J(path.join(kv, 'ui-usage.prev.json')).days.today === 60, 'the .prev copy is the store before the last merge');
  // another writer between two merges (sync bringing the other computer's counts): read again, never written over
  const o2 = J(file); o2.days.today += 1000; fs.writeFileSync(file, JSON.stringify(o2));
  await store.mergeKV('ui-usage', [['inc', ['days', 'today'], 1]]); await store.idle();
  ok(J(file).days.today === 1121, 'a change by someone else between two merges is kept', J(file).days.today);
  // (round 77, storeack77) a merge is made from the file on disk right now, so it already holds what arrived: it is
  // written fresh, never merged again by the guard (that counted the other computer's clicks twice each minute)
  store.setBeforeWrite((f, v) => { guarded += 1; return /ui-usage/.test(f) ? { ...v, guardSaw: true } : v; }, (f) => /ui-usage/.test(f));
  const r3 = await store.mergeKV('ui-usage', [['inc', ['days', 'today'], 1]]); await store.idle();
  ok(r3?.ok && guarded === 0 && !J(file).guardSaw && J(file).days.today === 1122, 'a file the guard wants: written fresh from disk, not merged twice (its change kept, counted once)', { r3, guarded, today: J(file).days.today });
  store.setBeforeWrite((f, v) => { guarded += 1; return v; });
  await store.mergeKV('ui-usage', [['inc', ['days', 'today'], 1]]); await store.idle();
  ok(guarded === 0 && J(file).days.today === 1123, 'a guard without a file list: still written fresh, counted once');
  store.setBeforeWrite(null);
  // a whole save still on its way, then a merge: built on it; a thread merge then a main one: in order
  store.setKV('ui-usage', { ...J(file), days: { ...J(file).days, today: 5000 } });
  const r4 = await store.mergeKV('ui-usage', [['inc', ['days', 'today'], 1]]); await store.idle();
  ok(r4?.ok && J(file).days.today === 5001, 'a merge after a whole save on its way builds on it', J(file).days.today);
  store.setBeforeWrite((f, v) => v, () => false);
  const a = store.mergeKV('ui-usage', [['inc', ['days', 'today'], 1]]);
  store.setBeforeWrite((f, v) => v, () => true);
  const b = store.mergeKV('ui-usage', [['inc', ['days', 'today'], 2]]);
  await a; await b; await store.idle(); store.setBeforeWrite(null);
  ok(J(file).days.today === 5004, 'a merge on the thread then one on the main side: both count, in order', J(file).days.today);
  // missing / unreadable stores still say so (the window then saves them whole)
  ok((await store.mergeKV('nothing-here', [['inc', ['a'], 1]]))?.state === 'missing', 'a missing store says so');
  fs.writeFileSync(path.join(kv, 'garbled.json'), '{"a":');
  const g = await store.mergeKV('garbled', [['inc', ['a'], 1]]);
  ok(g?.ok === false && g.state === 'unreadable' && fs.readFileSync(path.join(kv, 'garbled.json'), 'utf8') === '{"a":', 'an unreadable store is left alone and says so', g);
  store.flushSync?.();
  console.log(JSON.stringify({ checks, ms: { first: Math.round(t1 * 100) / 100, next: Math.round(t2 * 100) / 100 } }));
  process.exit(0);
})().catch((err) => { console.log(JSON.stringify({ checks: [[false, 'threw', err.stack]] })); process.exit(1); });
