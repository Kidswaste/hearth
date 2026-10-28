#!/usr/bin/env node
// (round 78, guardloss78) Edits on ADJACENT lines of one text on two computers, and the side that loses a real conflict,
// through the two-computer simulator (dev/sync-sim.js via the worlds of dev/sync72-test.js) and the real sync engine:
//   text          the line merge on its own: a line changed on one side and a line added / changed right next to it
//                 on the other merge cleanly (both kept, in order); the same line changed two ways stays a conflict
//                 (code) or keeps both (prose); both adding at one place stays a conflict for code
//   adjacent      per store type (notes, a Lab scene's code, the worktable's text, a chat message), on both paths:
//                 a sync pass (both files changed) and the write guard (the window saves its older copy right after the
//                 Mac's version arrived): the Mac changed line 3, the PC added a line right after it → both lines on
//                 both computers, no conflict, nothing kept aside
//   guard-loses   the same line changed two ways and the window saves through the guard: this computer's line wins,
//                 the Mac's version is in Deleted files (restorable) with a note ("kept aside"); saving again doesn't
//                 add notes; Compare shows both; Keep both brings the Mac's line back next to it; Use that one restores
//                 the Mac's version (and the window's change waiting goes through the guard, not over it); OK clears it
//   auto-loses    a pass conflict settled by itself (the newer side wins a field): the older side is in Deleted files
//                 under its real name (before: only in the trash's conflicts/ folder, never listed) with a note
// Never touches real data or a real cloud drive: a temp folder.
//   node dev/guardloss78-test.js [--only name,name]
'use strict';
const T = require('./sync72-test');
const S = require('../sync-merge');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); } };
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const clone = (v) => JSON.parse(JSON.stringify(v));
const take = (m) => { const l = m.pulled.slice(); m.pulled.length = 0; return l; };
async function pair(name) {
  const w = T.world(`gl-${name}`);
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  return { w, pc, mac };
}

// ---------- 1. the line merge on its own ----------
scenario('text', async () => {
  const mt = (b, o, t, key = 'code') => { const r = S.merge3({ [key]: b }, { [key]: o }, { [key]: t }); return { v: r.value?.[key], c: r.conflicts.length }; };
  const L = (...a) => a.join('\n');
  let r = mt(L('a', 'b', 'c', 'd'), L('a', 'b', 'c', 'X', 'd'), L('a', 'b', 'C', 'd'));
  ok(r.c === 0 && r.v === L('a', 'b', 'C', 'X', 'd'), 'text: line 3 changed there, a line added right after it here → both', r);
  r = mt(L('a', 'b', 'c', 'd'), L('a', 'b', 'C', 'd'), L('a', 'b', 'c', 'X', 'd'));
  ok(r.c === 0 && r.v === L('a', 'b', 'C', 'X', 'd'), 'text: the same, sides swapped → the same text', r);
  r = mt(L('a', 'b', 'c', 'd'), L('a', 'B', 'c', 'd'), L('a', 'b', 'C', 'd'));
  ok(r.c === 0 && r.v === L('a', 'B', 'C', 'd'), 'text: two neighbouring lines changed, one on each side → both', r);
  r = mt(L('a', 'b', 'c'), L('X', 'a', 'b', 'c'), L('a', 'b', 'c', 'Y'));
  ok(r.c === 0 && r.v === L('X', 'a', 'b', 'c', 'Y'), 'text: added at the top here, at the end there → both', r);
  r = mt(L('a', 'b', 'c'), L('a', 'c'), L('a', 'b', 'c', 'Z'));
  ok(r.c === 0 && r.v === L('a', 'c', 'Z'), 'text: a line removed here, one added later there → both', r);
  r = mt(L('a', 'b', 'c', 'd'), L('a', 'b', 'c', 'd', 'E'), L('a', 'b', 'c', 'D'));
  ok(r.c === 0 && r.v === L('a', 'b', 'c', 'D', 'E'), 'text: the last line changed there, a line added after it here → both', r);
  r = mt(L('a', 'b', 'c', 'd'), L('a', 'B', 'c', 'd'), L('a', 'B2', 'c', 'd'));
  ok(r.c === 1, 'text: one line changed two ways (code) → still a conflict', r);
  r = mt(L('a', 'b', 'c'), L('a', 'X', 'b', 'c'), L('a', 'Y', 'b', 'c'));
  ok(r.c === 1, 'text: two different lines added at the same place (code) → a conflict (their order is unknown)', r);
  r = mt(L('a', 'b', 'c'), L('a', 'X', 'b', 'c'), L('a', 'X', 'b', 'c'));
  ok(r.c === 0 && r.v === L('a', 'X', 'b', 'c'), 'text: the same line added on both → once', r);
  r = mt(L('a', 'b', 'c', 'd'), L('a', 'b', 'c', 'X', 'd'), L('a', 'b', 'C', 'd'), 'notes');
  ok(r.c === 0 && r.v === L('a', 'b', 'C', 'X', 'd'), 'text: prose (notes) — no duplicate of the old line any more', r);
  r = mt(L('a', 'b', 'c'), L('a', 'B', 'c'), L('a', 'B2', 'c'), 'notes');
  ok(r.c === 0 && r.v === L('a', 'B', 'B2', 'c'), 'text: prose, one line changed two ways → both kept', r);
  // lists without ids (a worktable's storyboard): one place edited on both sides merges inside; a move doesn't
  const A = { title: 'One', notes: L('a', 'b', 'c') }; const B = { title: 'Two', notes: 'x' };
  let q = S.merge3({ p: [A, B] }, { p: [{ ...A, notes: L('a', 'b', 'X', 'c') }, B] }, { p: [{ ...A, notes: L('a', 'B', 'c') }, B] });
  ok(!q.conflicts.length && q.value.p[0].notes === L('a', 'B', 'X', 'c'), 'text: a shot without an id edited on both sides → merged inside', q);
  q = S.merge3({ p: [A, B] }, { p: [B, A] }, { p: [{ ...A, title: 'One!' }, B] });
  ok(q.conflicts.length === 1, 'text: shots swapped here and one edited there → still a conflict (no mixed-up shots)', q);
});

// ---------- 2. per store type, adjacent edits, through a pass and through the guard ----------
const LINES = ['line one', 'line two', 'line three', 'line four', 'line five'];
const TXT = LINES.join('\n');
const STORES = [
  { name: 'notes', rel: 'kv/notes.json', init: () => [{ id: 'n1', title: 'Shot list', text: TXT, updatedAt: 1 }], get: (v) => v[0].text, set: (v, t) => { v[0].text = t; } },
  { name: 'scene code', rel: 'kv/three-sketches.json', init: () => [{ id: 's1', name: 'Orb', code: TXT, layers: [{ id: 'l1', name: 'Base', code: TXT }] }], get: (v) => v[0].layers[0].code, set: (v, t) => { v[0].layers[0].code = t; } },
  { name: 'worktable text', rel: 'kv/workbench-pj1.json', init: () => ({ v: 1, title: 'Clink', script: TXT, storyboard: { panels: [{ title: 'One', notes: TXT }] } }), get: (v) => v.script, set: (v, t) => { v.script = t; } },
  { name: 'worktable notes (prose)', rel: 'kv/workbench-pj2.json', init: () => ({ v: 1, title: 'Clink', storyboard: { panels: [{ title: 'One', notes: TXT }] } }), get: (v) => v.storyboard.panels[0].notes, set: (v, t) => { v.storyboard.panels[0].notes = t; } },
  { name: 'chat', rel: 'chats/c1.json', init: () => T.chat('c1', [T.msg('user', 1, 'Hello'), T.msg('assistant', 2, TXT)]), get: (v) => v.messages[1].text, set: (v, t) => { v.messages[1].text = t; } },
];
const macEdit = (t) => t.replace('line three', 'line three (Mac)');
const pcEdit = (t) => t.replace('line three\n', 'line three\nadded on the PC\n');
const WANT = 'line one\nline two\nline three (Mac)\nadded on the PC\nline four\nline five';
scenario('adjacent', async () => {
  for (const st of STORES) {
    // a) both files changed, then a pass (the engine's three-way merge with the last version both had)
    {
      const { w, pc, mac } = await pair(`pass-${st.rel.replace(/\W/g, '')}`);
      pc.write(st.rel, st.init());
      ok(await T.converge(w) > 0, `adjacent/pass ${st.name}: first sync`, T.why(w));
      mac.edit(st.rel, (v) => { st.set(v, macEdit(st.get(v))); return v; });
      pc.edit(st.rel, (v) => { st.set(v, pcEdit(st.get(v))); return v; });
      ok(await T.converge(w) > 0, `adjacent/pass ${st.name}: converges`, T.why(w));
      for (const m of [pc, mac]) ok(st.get(m.json(st.rel)) === WANT, `adjacent/pass ${st.name}: both lines, in order, on the ${m.name}`, st.get(m.json(st.rel)));
      const cs = [...await pc.e.conflicts(), ...await mac.e.conflicts()];
      ok(!cs.length && !pc.autoResolved.length && !mac.autoResolved.length, `adjacent/pass ${st.name}: no conflict`, cs.map((c) => c.fields));
      ok(!(await pc.e.aside()).length && !(await mac.e.aside()).length, `adjacent/pass ${st.name}: nothing kept aside`);
    }
    // b) the PC's window holds the version from before the Mac's arrived, and saves its change through the guard
    {
      const { w, pc, mac } = await pair(`guard-${st.rel.replace(/\W/g, '')}`);
      pc.write(st.rel, st.init());
      ok(await T.converge(w) > 0, `adjacent/guard ${st.name}: first sync`, T.why(w));
      pc.e.ackPulled(); take(pc);
      const held = pc.json(st.rel);
      mac.edit(st.rel, (v) => { st.set(v, macEdit(st.get(v))); return v; });
      ok(await T.converge(w) > 0 && pc.e.hasPulled(st.rel), `adjacent/guard ${st.name}: the Mac's edit arrives`, T.why(w));
      st.set(held, pcEdit(st.get(held)));
      pc.write(st.rel, pc.e.guardWrite(pc.p(st.rel), clone(held)));
      ok(st.get(pc.json(st.rel)) === WANT, `adjacent/guard ${st.name}: the guard merges both lines`, st.get(pc.json(st.rel)));
      ok(!(await pc.e.aside()).length, `adjacent/guard ${st.name}: nothing kept aside (nothing lost)`);
      ok(await T.converge(w) > 0 && st.get(mac.json(st.rel)) === WANT, `adjacent/guard ${st.name}: the Mac ends with both lines`, st.get(mac.json(st.rel)));
    }
  }
});

// ---------- 3. a real conflict settled by the guard: the losing side kept aside ----------
scenario('guard-loses', async () => {
  const { w, pc, mac } = await pair('guard-loses');
  const rel = 'kv/notes.json';
  pc.write(rel, [{ id: 'n1', title: 'Shot list', text: TXT, updatedAt: 1 }]);
  ok(await T.converge(w) > 0, 'guard-loses: first sync', T.why(w));
  pc.e.ackPulled(); take(pc);
  const held = pc.json(rel);
  mac.edit(rel, (v) => { v[0].text = v[0].text.replace('line three', 'line three, as the Mac says'); return v; });
  ok(await T.converge(w) > 0, 'guard-loses: the Mac\'s edit arrives', T.why(w));
  held[0].text = held[0].text.replace('line three', 'line three, as the PC says');
  pc.write(rel, pc.e.guardWrite(pc.p(rel), clone(held)));
  ok(pc.json(rel)[0].text.includes('as the PC says'), 'guard-loses: this computer\'s line stays in place (as before)', pc.json(rel)[0].text);
  let notes = await pc.e.aside();
  ok(notes.length === 1 && notes[0].rel === rel && notes[0].why === 'guard' && notes[0].side === 'theirs' && notes[0].fromPlatform === 'darwin', 'guard-loses: one note — the Mac\'s version kept aside', notes);
  const trash = await pc.e.trash();
  const item = trash.find((t) => t.where === 'here' && t.rel === rel);
  ok(Boolean(item) && notes[0].trash === item?.id, 'guard-loses: the Mac\'s version is in Deleted files under its real name', { trash, notes });
  ok((pc.e.status().aside || []).length === 1, 'guard-loses: the status carries the note (the sync panel lists it)', pc.e.status().aside);
  // the window keeps saving (still before it reads the store again): no new note
  held[0].text = held[0].text.replace('line five', 'line five, more typing');
  pc.write(rel, pc.e.guardWrite(pc.p(rel), clone(held)));
  ok((await pc.e.aside()).length === 1, 'guard-loses: later saves don\'t add notes (their "other side" is this computer\'s own merge)', await pc.e.aside());
  // Compare
  const cmp = await pc.e.aside(notes[0].id, 'compare');
  ok(cmp.ok && cmp.kept?.[0]?.text.includes('as the Mac says') && cmp.now?.[0]?.text.includes('as the PC says'), 'guard-loses: Compare shows both versions', cmp);
  // Keep both: the Mac's line is back, next to the PC's
  const r = await pc.e.aside(notes[0].id, 'both');
  const all = pc.json(rel); const t = all.map((x) => x.text).join('\n');
  ok(r.ok && t.includes('as the Mac says') && t.includes('as the PC says') && t.includes('more typing') && all.some((x) => / \(from Mac\)$/.test(x.title)), 'guard-loses: Keep both → the Mac\'s version stays beside it (“Shot list (from Mac)”), the PC\'s line and the later typing kept', { r, all });
  ok(take(pc).some((p) => p.rel === rel) && !(await pc.e.aside()).length, 'guard-loses: the window is told (as for an arrival) and the note is gone', await pc.e.aside());
  ok(await T.converge(w) > 0 && mac.json(rel)[0].text === pc.json(rel)[0].text, 'guard-loses: both computers end the same', [mac.json(rel)[0].text, pc.json(rel)[0].text]);

  // a second round: Use that one, while the window has a change of its own waiting
  pc.e.ackPulled(); take(pc);
  const held2 = pc.json(rel);
  mac.edit(rel, (v) => { v[0].text = v[0].text.replace('line one', 'line one — Mac'); return v; });
  ok(await T.converge(w) > 0, 'guard-loses: another Mac edit arrives', T.why(w));
  held2[0].text = held2[0].text.replace('line one', 'line one — PC');
  pc.write(rel, pc.e.guardWrite(pc.p(rel), clone(held2)));
  notes = await pc.e.aside();
  ok(notes.length === 1, 'guard-loses: kept aside again', notes);
  const r2 = await pc.e.aside(notes[0].id, 'theirs');
  ok(r2.ok && pc.json(rel)[0].text.includes('line one — Mac') && !pc.json(rel)[0].text.includes('line one — PC'), 'guard-loses: Use that one → the Mac\'s version is back', pc.json(rel)[0].text);
  ok((await pc.e.trash()).filter((x) => /(^|\/)([0-9a-f]{8}-)?notes\.json$/.test(x.rel) && x.where === 'here').length >= 3, 'guard-loses: the version it replaced waits in Deleted files too');
  // the window's change written after that (through the guard): merged with the restored version, not over it
  held2[0].title = 'Shot list (renamed on the PC)';
  pc.write(rel, pc.e.guardWrite(pc.p(rel), clone(held2)));
  const after = pc.json(rel)[0];
  ok(after.title === 'Shot list (renamed on the PC)' && after.text.includes('line one — Mac'), 'guard-loses: a change the window wrote after it goes through the guard (the restored version stays)', after);
  // OK (dismiss)
  pc.e.ackPulled(); take(pc);
  const held3 = pc.json(rel);
  mac.edit(rel, (v) => { v[0].text = v[0].text.replace('line two', 'line two — Mac'); return v; });
  ok(await T.converge(w) > 0, 'guard-loses: a third Mac edit arrives', T.why(w));
  held3[0].text = held3[0].text.replace('line two', 'line two — PC');
  pc.write(rel, pc.e.guardWrite(pc.p(rel), clone(held3)));
  notes = await pc.e.aside();
  const r3 = await pc.e.aside(notes[0]?.id, 'dismiss');
  ok(r3.ok && !(await pc.e.aside()).length && (await pc.e.trash()).some((x) => x.id === notes[0].trash), 'guard-loses: OK clears the note; the version stays in Deleted files', r3);
  // the restore from Deleted files gives the Mac's text
  const back = await pc.e.restore(notes[0].trash, { replace: true });
  ok(back.ok && pc.json(rel)[0].text.includes('line two — Mac'), 'guard-loses: restored from Deleted files, it is the Mac\'s version', pc.json(rel)[0].text);
});

// ---------- 4. a pass conflict settled by itself: the older side under its real name, with a note ----------
scenario('auto-loses', async () => {
  const { w, pc, mac } = await pair('auto-loses');
  const rel = 'kv/three-sketches.json';
  pc.write(rel, [{ id: 's1', name: 'Orb', code: TXT }]);
  ok(await T.converge(w) > 0, 'auto-loses: first sync', T.why(w));
  pc.edit(rel, (v) => { v[0].code = v[0].code.replace('line three', 'line three // PC'); return v; });
  w.clock.advance(5000);
  mac.edit(rel, (v) => { v[0].code = v[0].code.replace('line three', 'line three // Mac (newer)'); return v; });
  ok(await T.converge(w) > 0, 'auto-loses: converges (settled by itself)', T.why(w));
  const both = [pc, mac].map((m) => m.json(rel)[0].code);
  const won = both[0].includes('// PC') ? '// PC' : '// Mac (newer)'; const lostLine = won === '// PC' ? '// Mac (newer)' : '// PC';
  ok(both[0] === both[1] && (both[0].includes('// PC') !== both[0].includes('// Mac')), 'auto-loses: one line wins, the same on both', both);
  const notes = [...await pc.e.aside(), ...await mac.e.aside()];
  ok(notes.length >= 1 && notes.every((n) => n.why === 'auto' && n.rel === rel), 'auto-loses: a note on the computer that settled it', notes);
  const n = notes[0];
  const owner = (await pc.e.aside()).length ? pc : mac;
  const tr = await owner.e.trash();
  ok(tr.some((x) => x.id === n.trash && x.rel === rel), 'auto-loses: the losing side is listed in Deleted files under its real name', { n, tr });
  const cmp = await owner.e.aside(n.id, 'compare');
  ok(cmp.ok && JSON.stringify(cmp.kept).includes(lostLine) && JSON.stringify(cmp.now).includes(won), 'auto-loses: what was kept aside is the line that lost', { cmp, won });
  const r = await owner.e.aside(n.id, 'both');
  const after = owner.json(rel);
  ok(r.ok && JSON.stringify(after).includes(lostLine) && JSON.stringify(after).includes(won), 'auto-loses: Keep both brings it back beside the winner', after);
  ok(await T.converge(w) > 0 && JSON.stringify(pc.json(rel)) === JSON.stringify(mac.json(rel)), 'auto-loses: both computers end the same', T.why(w));
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const f0 = failures;
    try { await s.fn(); } catch (err) { failures += 1; console.log(`FAIL ${s.name}: threw ${err.stack || err}`); }
    console.log(`${failures === f0 ? 'ok  ' : 'FAIL'} ${s.name}`);
  }
  console.log(JSON.stringify({ pass: failures === 0, passes, failures, ms: Date.now() - t0 }));
  process.exit(failures ? 1 : 0);
}
main();
