#!/usr/bin/env node
// (round 73, chatsteady73) The feature-usage store saved by what changed (store.js mergeKV / applyOps, usage.js), no
// Electron: store.js and its helpers copied to a temp folder (it keeps its data next to itself: real data is never
// touched), run with the store thread on (HEARTH_STORE_THREAD=1). What changed, applied to the file, gives exactly what
// a whole save of the window's copy gives; a save on its way is built on; the .prev copy is kept; a missing or
// unreadable store says so (the window then saves it whole); bad paths do nothing; a year-sized store merges quickly.
//   node dev/chatsteady73-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.argv[2] !== '--inside') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-chatsteady73-'));
  for (const f of ['store.js', 'scenesafe-core.js', 'datasafe-core.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js' /* (round 75) */]) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
  fs.copyFileSync(__filename, path.join(dir, 't.js'));
  const r = spawnSync(process.execPath, [path.join(dir, 't.js'), '--inside'], { cwd: dir, env: { ...process.env, HEARTH_STORE_THREAD: '1' }, stdio: 'inherit', timeout: 60000 });
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const store = require(path.join(process.cwd(), 'store.js'));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
(async () => {
  const kv = path.join(store.DATA_DIR, 'kv');
  const file = path.join(kv, 'ui-usage.json');
  // the window's side (usage.js track(), in short): its copy changes and each change is noted
  const day = '2026-10-27';
  const copy = { since: 1, items: { 'A › b': { n: 2, first: 1, last: 5, label: 'b', area: 'A' } }, days: { [day]: 2 }, hidden: [], dayItems: { '2026-09-01': { 'A › b': 1 }, [day]: { 'A › b': 2 } } };
  ok((await store.mergeKV('ui-usage', [['inc', ['days', day], 1]]))?.state === 'missing', 'a missing store says so (the window saves it whole)');
  await store.setKV('ui-usage', JSON.parse(JSON.stringify(copy))); await store.idle();
  const ops = [];
  const track = (key, now) => {
    if (!copy.items[key]) { copy.items[key] = { n: 0, first: now, label: key.split(' › ')[1], area: key.split(' › ')[0] }; ops.push(['def', ['items', key], { ...copy.items[key] }]); }
    copy.items[key].n += 1; ops.push(['inc', ['items', key, 'n'], 1]);
    copy.items[key].last = now; ops.push(['max', ['items', key, 'last'], now]);
    copy.days[day] += 1; ops.push(['inc', ['days', day], 1]);
    copy.dayItems[day][key] = (copy.dayItems[day][key] || 0) + 1; ops.push(['inc', ['dayItems', day, key], 1]);
  };
  track('A › b', 10); track('C › new one', 11); track('C › new one', 12);
  delete copy.dayItems['2026-09-01']; ops.push(['del', ['dayItems', '2026-09-01']]);
  copy.hidden = ['C › new one']; ops.push(['set', ['hidden'], copy.hidden]);
  const r = await store.mergeKV('ui-usage', ops); await store.idle();
  ok(r?.ok === true, `merge: ${JSON.stringify(r)}`);
  ok(JSON.stringify(J(file)) === JSON.stringify(copy), `merged file = the window's copy: ${JSON.stringify(J(file))}`);
  ok(J(path.join(kv, 'ui-usage.prev.json')).items['A › b'].n === 2, 'the .prev copy is the store before');
  // counts another writer added in between (the other computer, through sync) stay: the window only adds its own
  const other = J(file); other.items['A › b'].n += 5; other.days[day] += 5; fs.writeFileSync(file, JSON.stringify(other));
  await store.mergeKV('ui-usage', [['inc', ['items', 'A › b', 'n'], 1], ['max', ['items', 'A › b', 'last'], 3], ['def', ['items', 'A › b'], { n: 0 }]]); await store.idle();
  const after = J(file);
  ok(after.items['A › b'].n === 9 && after.items['A › b'].last === 10 && after.days[day] === 10, `both writers' counts kept: ${JSON.stringify(after.items['A › b'])} ${after.days[day]}`);
  // two merges in a row, the first still on its way: the second builds on it
  store.mergeKV('ui-usage', [['inc', ['days', day], 1]]); store.mergeKV('ui-usage', [['inc', ['days', day], 2]]); await store.idle();
  ok(J(file).days[day] === 13, `back-to-back merges both count: ${J(file).days[day]}`);
  // bad paths change nothing (and never reach Object.prototype)
  const before = JSON.stringify(J(file));
  await store.mergeKV('ui-usage', [['set', ['__proto__', 'polluted'], 1], ['inc', [], 1], ['set', 'hidden', 1], 'x', ['inc', ['constructor', 'prototype', 'p'], 1]]); await store.idle();
  ok(({}).polluted === undefined && ({}).p === undefined, 'no prototype pollution');
  ok(JSON.stringify(J(file)) === before, 'bad ops change nothing');
  // an unreadable store (garbled, no .prev) says so and is left alone
  fs.writeFileSync(path.join(kv, 'garbled.json'), '{"a":'); try { fs.unlinkSync(path.join(kv, 'garbled.prev.json')); } catch { /* none */ }
  const g = await store.mergeKV('garbled', [['inc', ['a'], 1]]);
  ok(g?.ok === false && g.state === 'unreadable' && fs.readFileSync(path.join(kv, 'garbled.json'), 'utf8') === '{"a":', `unreadable left alone: ${JSON.stringify(g)}`);
  // the Lab's scenes are never merged (whole saves with their own guard)
  ok((await store.mergeKV('three-sketches', [['set', ['x'], 1]]))?.ok === false, 'the Lab scenes refuse a merge');
  // a year of use (like dev/bigprofile.js's 900 KB store): a minute's clicks applied quickly on the main side
  const items = {}; for (let i = 0; i < 4000; i++) items[`Area ${i % 40} › Button ${i}`] = { n: 1 + (i % 50), first: 1, last: 2 };
  const dayItems = {}; for (let d = 0; d < 35; d++) dayItems[`2026-${String(1 + (d % 12)).padStart(2, '0')}-${String(1 + d).padStart(2, '0')}`] = Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`Area ${j % 40} › Button ${(d * 7 + j) % 4000}`, 1]));
  const days = {}; for (let d = 0; d < 365; d++) days[`d${d}`] = Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`Area ${j % 40} › Button ${(d * 7 + j) % 4000}`, 1]));
  await store.setKV('ui-usage', { since: 1, items, days, hidden: [], dayItems }); await store.idle();
  const size = fs.statSync(file).size;
  const minute = []; for (let i = 0; i < 60; i++) minute.push(['inc', ['items', `Area 1 › Button ${i}`, 'n'], 1], ['max', ['items', `Area 1 › Button ${i}`, 'last'], 99], ['inc', ['days', 'today'], 1]);
  const t0 = process.hrtime.bigint(); store.mergeKV('ui-usage', minute); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  await store.idle();
  ok(J(file).days.today === 60 && J(file).items['Area 1 › Button 1'].n === 3, 'the big store merged');
  // the next minute: the store as last merged is kept (nobody else changed it), not read and parsed again
  const t1 = process.hrtime.bigint(); store.mergeKV('ui-usage', minute); const ms2 = Number(process.hrtime.bigint() - t1) / 1e6;
  await store.idle();
  ok(J(file).days.today === 120 && J(file).items['Area 1 › Button 1'].n === 4, 'the next merge builds on the last one');
  // … and a change by someone else in between is read (not overwritten)
  const o2 = J(file); o2.days.today += 1000; fs.writeFileSync(file, JSON.stringify(o2));
  store.mergeKV('ui-usage', [['inc', ['days', 'today'], 1]]); await store.idle();
  ok(J(file).days.today === 1121, `another writer's change after a merge is kept: ${J(file).days.today}`);
  console.log(JSON.stringify({ storeKB: Math.round(size / 1024), mergeMainMs: Math.round(ms * 10) / 10, nextMergeMainMs: Math.round(ms2 * 10) / 10, opsSent: minute.length, opsJsonKB: Math.round(JSON.stringify(minute).length / 102.4) / 10 }));
  ok(ms < 150, `merging a minute of clicks into the year-sized store took ${ms} ms on the main side`);
  ok(ms2 < 15, `the next minute's merge took ${ms2} ms on the main side`);
  console.log(`${failures ? 'FAIL' : 'PASS'} chatsteady73-test: ${passes} passed, ${failures} failed`);
  store.flushSync?.();
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.log(`FAIL ${err.stack}`); process.exit(1); });
