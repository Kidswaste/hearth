#!/usr/bin/env node
// The time machine's data side (tools/three-history-core.js), in plain Node: line diffs round-trip on random edits,
// versions rebuild exactly from their key, sizes stay compact, thinning keeps today / hourly / daily, two computers'
// lists merged by id (sync-merge.js) still rebuild every version.
//   node dev/timemachine-test.js
const path = require('path');
const assert = require('assert');
const C = require(path.join(__dirname, '..', 'tools', 'three-history-core.js'));
const { merge3 } = require(path.join(__dirname, '..', 'sync-merge.js'));

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['mesh', 'scene', 'camera', 'P.speed', 'audio.kick', 'renderer', 'const', 'let', '0.5', '#ff3cac'];
const line = () => `  ${pick(WORDS)}.${pick(WORDS)} = ${Math.round(rnd() * 100) / 10};`;
let code = Array.from({ length: 120 }, line).join('\n');
const mutate = (c) => {
  const L = c.split('\n');
  const n = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i += 1) {
    const at = Math.floor(rnd() * L.length);
    const r = rnd();
    if (r < 0.4) L[at] = line(); else if (r < 0.7) L.splice(at, 0, line(), line()); else L.splice(at, 1 + Math.floor(rnd() * 3));
  }
  return L.join('\n');
};
const out = [];

// 1. diff / patch round-trips (300 random edits, a rewrite, empty sides)
for (let i = 0; i < 300; i += 1) { const next = mutate(code); assert.strictEqual(C.patch(code, C.diff(code, next)), next, `round-trip ${i}`); code = next; }
const rewrite = Array.from({ length: 200 }, line).join('\n');
assert.strictEqual(C.patch(code, C.diff(code, rewrite)), rewrite);
assert.strictEqual(C.patch('', C.diff('', 'a\nb')), 'a\nb');
assert.strictEqual(C.patch('a\nb', C.diff('a\nb', '')), '');
assert.strictEqual(C.diff('x', 'x'), null);
out.push('✓ diff/patch: 300 random edits + a rewrite round-trip');

// 2. a history of 120 changes rebuilds exactly; compact
const doc = C.blank();
const states = [];
let st = { layers: [{ id: 'main', name: 'Orb', code, opacity: 1 }], vals: {}, sel: 'main', palette: null };
// (round 105, units105) a fixed clock (noon): with Date.now() the merge in 5 thinned across midnight when the test
// ran in the last 17 minutes of a day (thin at t0 + 1,000 s: yesterday's versions hourly), and failed then only
const t0 = new Date(2026, 9, 12, 12, 0, 0).getTime();
for (let i = 0; i < 120; i += 1) {
  st = C.clone(st);
  const r = i % 6;
  if (r === 0 || r === 1) st.layers[0].code = mutate(st.layers[0].code);
  else if (r === 2) st.layers.push({ id: `L${i}`, name: `Glow ${i}`, code: Array.from({ length: 30 }, line).join('\n'), opacity: 0.8 });
  else if (r === 3 && st.layers.length > 1) st.layers.splice(1, 1);
  else if (r === 4) st.vals = { main: { speed: Math.round(rnd() * 50) / 10 } };
  else st.layers[0].opacity = Math.round(rnd() * 100) / 100;
  states.push(st);
  C.add(doc, st, { at: t0 + i * 1000, label: `#${i}`, kind: 'run' });
}
C.byTime(doc).forEach((v, i) => assert.ok(C.same(C.stateOf(doc, v), states[i]), `version ${i} rebuilds`));
const full = states.reduce((n, s) => n + JSON.stringify(s).length, 0);
const stored = JSON.stringify(doc).length;
out.push(`✓ 120 versions rebuild exactly · ${Object.keys(doc.keys).length} keys · stored ${(stored / 1024).toFixed(1)} KB vs ${(full / 1024).toFixed(1)} KB as full copies (${Math.round((stored / full) * 100)} %)`);
assert.ok(stored < full * 0.4, 'compact');

// 3. what changed
const ch = C.changes(states[0], states[2]);
assert.ok(ch.added.length === 1 && ch.code.length === 1, 'changes: added + code');
assert.ok(/added Glow/.test(C.summary(ch)));
out.push(`✓ changes: "${C.summary(ch)}"`);

// 4. thinning: today all, the week hourly (+ bookmarks), older daily, the newest always
const now = new Date(2026, 9, 12, 15, 0, 0).getTime();
const tdoc = C.blank();
let s2 = { layers: [{ id: 'main', name: 'Orb', code: 'a' }], vals: {}, sel: 'main' };
const H = 3600e3;
const times = [];
for (let h = 24 * 20; h >= 0; h -= 0.25) times.push(now - h * H); // every 15 min for 20 days
times.forEach((at, i) => { s2 = C.clone(s2); s2.layers[0].code = `a${i}`; C.add(tdoc, s2, { at, mark: i % 37 === 0 ? { by: 'claude', at } : undefined }); });
const before = tdoc.versions.length;
C.thin(tdoc, now, { cap: 100000 });
const today = new Date(now); today.setHours(0, 0, 0, 0);
const kept = C.byTime(tdoc);
const todayN = kept.filter((v) => v.at >= today.getTime()).length;
assert.strictEqual(todayN, times.filter((t) => t >= today.getTime()).length, 'every version of today');
const weekV = kept.filter((v) => v.at < today.getTime() && v.at >= today.getTime() - 6 * 864e5);
const hours = new Set(weekV.map((v) => Math.floor(v.at / H)));
assert.ok(weekV.length <= hours.size + weekV.filter((v) => v.mark).length, 'hourly in the week');
const older = kept.filter((v) => v.at < today.getTime() - 6 * 864e5);
assert.ok(older.length <= 15, `daily after (${older.length})`);
kept.forEach((v) => assert.ok(C.stateOf(tdoc, v), 'thinned history still rebuilds'));
C.thin(tdoc, now, { cap: 50 });
assert.strictEqual(tdoc.versions.length, 50);
assert.strictEqual(C.latest(tdoc).at, times[times.length - 1]);
out.push(`✓ thinning: ${before} → ${kept.length} (today ${todayN}, week ${weekV.length}, older ${older.length}) · cap 50 keeps the newest`);

// 5. two computers merged by id (sync-merge three-way): every version rebuilds
const base = C.clone(doc);
const a = C.clone(base); const b = C.clone(base);
let sa = C.stateOf(a, C.latest(a)); let sb = C.clone(sa);
for (let i = 0; i < 30; i += 1) { sa = C.clone(sa); sa.layers[0].code = mutate(sa.layers[0].code); C.add(a, sa, { at: t0 + 200000 + i * 1000 }); }
for (let i = 0; i < 30; i += 1) { sb = C.clone(sb); sb.layers[0].code = mutate(sb.layers[0].code); C.add(b, sb, { at: t0 + 200500 + i * 1000 }); }
C.thin(a, t0 + 1e6, { cap: 100 });
const m = merge3(base, a, b).value;
assert.strictEqual(C.heal(m), 0, 'no version lost its key');
C.gc(m);
assert.ok(m.versions.length >= 100, `merged versions (${m.versions.length})`);
m.versions.forEach((v) => assert.ok(C.stateOf(m, v), 'merged rebuild'));
out.push(`✓ merge by id: ${a.versions.length} + ${b.versions.length} → ${m.versions.length} versions, all rebuild`);

// 5b. (round 105, units105) one computer thins across midnight while the other adds versions on the same key: the
// other's versions all come through the merge and rebuild (its key was taken out with the thinned versions, and the
// merge took it out too: heal() dropped 15 of the other computer's 30 versions)
{
  const n0 = new Date(2026, 9, 12, 23, 50, 0).getTime();
  const d0 = C.blank();
  let s0 = { layers: [{ id: 'main', name: 'Orb', code }], vals: {}, sel: 'main' };
  for (let i = 0; i < 40; i += 1) { s0 = C.clone(s0); s0.layers[0].code = mutate(s0.layers[0].code); C.add(d0, s0, { at: n0 + i * 1000 }); }
  const base2 = C.clone(d0); const a2 = C.clone(base2); const b2 = C.clone(base2);
  let x = C.stateOf(a2, C.latest(a2)); let y = C.clone(x);
  for (let i = 0; i < 30; i += 1) { x = C.clone(x); x.layers[0].code = mutate(x.layers[0].code); C.add(a2, x, { at: n0 + 60000 + i * 1000 }); }
  const bIds = [];
  for (let i = 0; i < 30; i += 1) { y = C.clone(y); y.layers[0].code = mutate(y.layers[0].code); bIds.push([C.add(b2, y, { at: n0 + 60500 + i * 1000 }).id, y]); }
  const thinned = C.thin(a2, n0 + 20 * 60000); // 00:10 the next day: the 23:50 versions are yesterday's, hourly
  const m2 = merge3(base2, a2, b2).value;
  const lost = C.heal(m2);
  C.gc(m2, n0 + 20 * 60000);
  const back = bIds.filter(([id, st]) => { const v = m2.versions.find((w) => w.id === id); return v && C.same(C.stateOf(m2, v), st); }).length;
  assert.ok(thinned > 0, 'the thinning took versions out');
  assert.strictEqual(lost, 0, 'thinned across midnight: no version of the other computer lost its key');
  assert.strictEqual(back, 30, `the other computer's 30 versions all rebuild (${back})`);
  const later = C.clone(a2); C.thin(later, n0 + 8 * 864e5); C.gc(later, n0 + 8 * 864e5);
  assert.ok(!later.held && Object.keys(later.keys).every((k) => later.versions.some((v) => v.k === k)), 'a week on: the keys held for it are let go');
  out.push(`✓ thinned across midnight on one computer (${thinned} out), the other's 30 versions all through the merge; held keys let go a week on`);
}

// 6. code diff for the "what changed" view
const cd = C.codeDiff('a\nb\nc\nd\ne\nf\ng', 'a\nb\nC\nd\ne\nf\ng\nh', { ctx: 1 });
assert.deepStrictEqual(cd.filter((x) => x.op === '+' || x.op === '-').map((x) => x.op + x.line), ['-c', '+C', '+h']);
out.push('✓ code diff with context');
console.log(out.join('\n'));
