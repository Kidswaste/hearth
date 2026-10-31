#!/usr/bin/env node
// (round 94, keptaside94) The compare-and-choose flow's core and its main side, without a window:
//   core      keptaside-core.js: what kind a thing is; the line diff (side by side, folds, nothing dropped); Combine's
//             starting text keeps every line of both; a text put back in place (ids in lists, the item marked
//             changed); what differs in words (settings "on / off", a Lab preset's setup looked into, a project's
//             name, items only on one side); a chat's differing messages; Undo's Deleted-files entry
//   engine    through the two-computer simulator (dev/sync-sim.js via dev/sync72-test.js) and the real sync engine,
//             conflicts left for a choice (auto-settle off), with keptasidemain.js's helpers as the window calls them:
//             · a Lab scene's code changed on the same line on both → "Combine": the other version in Deleted files
//               (Keep this one), this one too (keepCopy), the combined code saved → both computers end with it; Undo
//               (Restore with replace) brings this computer's code back and the combined one goes to Deleted files
//             · a board renamed on both → Keep both after keepTheirs: the other version whole in Deleted files (before:
//               only in the trash's hidden conflicts folder), both names on both computers
//             · a picture changed on both → Keep the other: this one in Deleted files; Undo brings it back
//             · a sound changed on both → Keep both: "(from Mac)" next to it; Undo (putAway) → in Deleted files, gone
//               from both computers, the original untouched
//             · a very long chat's differing messages from the store thread (storework.js chatDiff); a file that
//               can't be read is said so, never "no messages"
//             · the helpers refuse anything that isn't a synced thing ("..", settings' own place, a file that isn't a
//               copy Keep both made)
// Never touches real data or a real cloud drive: temp folders only.
//   node dev/keptaside94-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('./sync72-test');
const K = require('../keptaside-core');
const KM = require('../keptasidemain');

let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); } };
const L = (...a) => a.join('\n');

// ---------- core ----------
function core() {
  ok(K.kindOf('chats/abc.json') === 'chat' && K.kindOf('app/config.json') === 'settings' && K.kindOf('kv/three-sketches.json') === 'scene' && K.kindOf('kv/lab-presets.json') === 'preset' && K.kindOf('kv/notes.json') === 'note' && K.kindOf('kv/boards.json') === 'board' && K.kindOf('kv/projects.json') === 'project' && K.kindOf('refs/a.PNG') === 'image' && K.kindOf('stems/x.wav') === 'audio' && K.kindOf('renders/x.mp4') === 'video' && K.kindOf('kv/usage.json') === 'data' && K.kindOf('x.bin') === 'file', 'core: kinds');
  // the line diff
  const a = L('one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve');
  const b = L('one', 'TWO', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen');
  const d = K.lineDiff(a, b);
  ok(d.rows.some((r) => r.t === 'chg' && r.a === 'two' && r.b === 'TWO' && r.na === 2 && r.nb === 2), 'core: a line changed both ways is one row, both sides, with its numbers', d.rows);
  ok(d.rows.some((r) => r.t === 'add' && r.b === 'thirteen' && r.a === null), 'core: a line only on the other side', d.rows);
  ok(d.rows.some((r) => r.t === 'fold' && r.n >= 3), 'core: a long unchanged stretch folds ("… n lines the same")', d.rows);
  ok(d.onlyHere === 1 && d.onlyThere === 2, 'core: the counts', d);
  ok(K.lineDiff('x', 'x').changed === 0 && K.lineDiff('', 'a').changed === 1, 'core: same text → no change; empty vs one line');
  // the diff's steps give back both texts, with as many shared lines as there can be (random texts against a table)
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let wrong = 0;
  for (let n = 0; n < 1500; n++) {
    const r = () => Array.from({ length: Math.floor(rnd() * 14) }, () => 'abcde'[Math.floor(rnd() * 5)]);
    const x = r(); const y = r(); const o = K.ops(x.join('\n'), y.join('\n'));
    const lcs = (() => { const T = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0)); for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) T[i][j] = x[i] === y[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]); return T[0][0]; })();
    if (o.filter((q) => q.t !== 'add').map((q) => q.a).join('\n') !== x.join('\n') || o.filter((q) => q.t !== 'del').map((q) => q.b).join('\n') !== y.join('\n') || (x.length && y.length && o.filter((q) => q.t === 'same').length !== lcs)) wrong += 1;
  }
  ok(!wrong, 'core: 1,500 random texts: the diff gives back both, sharing every line it can', wrong);
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
  const t0 = Date.now(); const bd = K.lineDiff(L(...big), L(...big.map((x, i) => (i % 500 === 7 ? `${x}!` : x)))); ok(bd.changed === 6 && Date.now() - t0 < 3000, 'core: 3,000 lines with 6 changed: found, quickly', { changed: bd.changed, ms: Date.now() - t0 });
  // Combine keeps every line of both, in order, the common ones once
  for (const [x, y] of [[a, b], [L('a', 'b', 'c'), L('a', 'B', 'c', 'd')], [L('x'), L('y')], ['', L('p', 'q')], [L('k', 'k', 'm'), L('k', 'm', 'm')]]) {
    const c = K.combineText(x, y).split('\n');
    const has = (lines) => { let i = 0; for (const l of c) if (l === lines[i]) i += 1; return i === lines.length; };
    ok(has(x.split('\n')) && has(y.split('\n')), 'core: Combine keeps every line of both (each in its order)', { x, y, c });
  }
  ok(K.combineText(L('a', 'b1', 'c'), L('a', 'b2', 'c')) === L('a', 'b1', 'b2', 'c'), 'core: Combine: where they differ, this side\'s line then the other\'s');
  // setAt
  const sc = [{ id: 's1', name: 'Neon', updatedAt: 5, layers: [{ id: 'l1', name: 'Back', code: 'a' }] }, { id: 's2', name: 'Rose', code: 'z' }];
  const set = K.setAt(sc, 's1.layers.l1.code', 'combined', 1000);
  ok(set[0].layers[0].code === 'combined' && set[0].updatedAt === 1000 && sc[0].layers[0].code === 'a' && set[1].code === 'z', 'core: a text put back at its path (ids inside lists), the scene marked changed, the original untouched', set);
  ok(K.setAt(sc, 's9.code', 'x') === null && K.setAt(sc, 's1.layers.l9.code', 'x') === null && K.setAt(sc, '', 'x') === null, 'core: a path that isn\'t there → null (never written somewhere else)');
  ok(K.at(sc, 's1.layers.l1.code') === 'a' && K.at([{ role: 'user', at: 7, text: 'hi' }], 'user@7.text') === 'hi', 'core: at (ids, and who@when for messages)');
  // words
  const cfgRows = K.rows({ settings: { notify: true, zoom: 1, theme: 'dark' } }, { settings: { notify: false, zoom: 1, theme: 'light', updatedAt: 5 } });
  ok(cfgRows.length === 2 && cfgRows.find((r) => r.label === 'notify')?.here === 'on' && cfgRows.find((r) => r.label === 'notify')?.there === 'off' && cfgRows.find((r) => r.label === 'theme')?.there === '“light”', 'core: settings in words (on / off, “text”), times left out', cfgRows);
  const pr = K.rows({ v: 1, items: { p1: { kind: 'trig', name: 'Neon', data: JSON.stringify({ bars: 4, on: true }) } } }, { v: 1, items: { p1: { kind: 'trig', name: 'Neon', data: JSON.stringify({ bars: 8, on: true }) } } });
  ok(pr.length === 1 && /“Neon”/.test(pr[0].label) && /bars/.test(pr[0].label) && pr[0].here === '4' && pr[0].there === '8', 'core: a Lab preset\'s setup (JSON text) is looked into: “Neon” › setup › bars: 4 · 8', pr);
  const pj = K.rows({ v: 1, list: [{ id: 'p1', name: 'Neon (PC)', items: [] }] }, { v: 1, list: [{ id: 'p1', name: 'Neon (Mac)', items: [] }, { id: 'p2', name: 'Tour', items: [] }] });
  ok(pj.some((r) => r.label === '“Neon (PC)” › name' && r.here === '“Neon (PC)”' && r.there === '“Neon (Mac)”') && pj.some((r) => r.how === 'onlyThere' && /Tour/.test(r.there)), 'core: a project\'s name both ways, a project only on one side', pj);
  const tr = K.textRows(sc, [{ ...sc[0], layers: [{ id: 'l1', name: 'Back', code: L('a', 'b') }] }, sc[1]]);
  ok(tr.length === 1 && tr[0].path === 's1.layers.l1.code' && tr[0].label === '“Neon” › “Back” › code', 'core: the code that differs is a text row (Combine offers it), named by scene and layer', tr);
  ok(K.canCombine('kv/three-sketches.json', sc, [{ ...sc[0], layers: [{ id: 'l1', name: 'Back', code: L('a', 'b') }] }, sc[1]]) && !K.canCombine('app/config.json', { a: L('x', 'y') }, { a: L('x', 'z') }) && !K.canCombine('kv/boards.json', [{ id: 'b', name: 'A' }], [{ id: 'b', name: 'B' }]), 'core: Combine for a store\'s text only (not settings, not a name)');
  // a chat
  const ch = K.chatDiff({ title: 'Tour', messages: [{ id: 1, role: 'user', text: 'a' }, { id: 2, role: 'assistant', text: 'b' }, { id: 3, role: 'user', text: 'here only' }] }, { title: 'Tour (Mac)', messages: [{ id: 1, role: 'user', text: 'a' }, { id: 2, role: 'assistant', text: 'b, edited on the Mac' }, { id: 4, role: 'user', text: 'there only' }] });
  ok(ch.title?.there === 'Tour (Mac)' && ch.onlyHere.length === 1 && ch.onlyHere[0].text === 'here only' && ch.onlyThere[0].text === 'there only' && ch.changed.length === 1 && ch.same === 1, 'core: a chat: the title, the messages only one side has, a message changed on both', ch);
  const many = { messages: Array.from({ length: 100 }, (_, i) => ({ id: i, role: 'user', text: `m${i}` })) };
  const mm = K.chatDiff(many, { messages: [] }, { max: 10 });
  ok(mm.onlyHere.length === 10 && mm.more.onlyHere === 90 && mm.onlyHere[9].text === 'm99', 'core: a long list: the last ones, and how many more', mm.more);
  // Undo: the entry that appeared
  ok(K.plainRel('kv/1a2b3c4d-notes.json') === 'kv/notes.json' && K.plainRel('chats/1a2b3c-x.json') === 'chats/x.json' && K.plainRel('kv/notes.json') === 'kv/notes.json', 'core: a Deleted-files name without its prefix');
  const ne = K.newEntries([{ id: 'cloud:x' }], [{ id: 'cloud:x', rel: 'kv/a.json' }, { id: 'cloud:y', rel: 'kv/a.json', where: 'cloud' }, { id: 'here:z', rel: 'kv/1a2b3c4d-a.json', where: 'here' }, { id: 'here:w', rel: 'kv/b.json', where: 'here' }], 'kv/a.json');
  ok(ne.length === 2 && ne[0].id === 'here:z', 'core: Undo\'s entry: new, for this thing, this computer\'s first', ne);
}

// ---------- engine ----------
let worker = null; let seq = 0; const jobs = new Map();
function runOff(op, args) {
  if (!worker) {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(__dirname, '..', 'storework.js')); worker.unref();
    worker.on('message', ({ id, res, err }) => { const j = jobs.get(id); if (!j) return; jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  }
  return new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); worker.postMessage({ ...args, op, id }); });
}
// the window's calls into keptasidemain.js, on this computer's engine
function helpers(m) {
  const H = new Map();
  KM.register((ch, fn) => H.set(ch, fn), { engine: () => m.e, dataDir: () => m.data, store: { runOff }, schedule: () => {} });
  return (ch, ...a) => H.get(ch)(...a);
}
async function pair(name) {
  const w = T.world(`ka94-${name}`);
  const pc = T.computer(w, 'PC', { platform: 'win32' }); const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.auto = false; mac.auto = false; // conflicts wait for a choice
  return { w, pc, mac };
}
const PNG = (n) => Buffer.from(`\x89PNG\r\n\x1a\n${'x'.repeat(n)}`, 'binary');

async function engine() {
  // a Lab scene's code, the same line both ways → Combine
  {
    const { w, pc, mac } = await pair('scene');
    const rel = 'kv/three-sketches.json';
    const code = L('const a = 1;', 'const b = 2;', 'const c = 3;');
    pc.write(rel, [{ id: 's1', name: 'Neon', updatedAt: 1, code }]);
    ok(await T.converge(w) > 0, 'scene: first sync', T.why(w));
    pc.edit(rel, (v) => { v[0].code = v[0].code.replace('b = 2', 'b = 20 /* PC */'); v[0].updatedAt = 2; });
    mac.edit(rel, (v) => { v[0].code = v[0].code.replace('b = 2', 'b = 200 /* Mac */'); v[0].updatedAt = 3; });
    await T.converge(w);
    const cs = (await pc.e.conflicts()).concat(await mac.e.conflicts());
    ok(cs.length >= 1 && cs.every((c) => c.rel === rel), 'scene: the same line changed both ways is a conflict to choose', cs);
    const m = (await pc.e.conflicts()).length ? pc : mac; const o = m === pc ? mac : pc;
    const call = helpers(m);
    const c = (await m.e.conflicts())[0];
    const p = await m.e.preview(c.id);
    const rows = K.textRows(p.ours, p.theirs);
    ok(rows.length === 1 && rows[0].path === 's1.code', 'scene: the code is offered to Combine', rows);
    const before = await m.e.trash();
    // Combine, as keptaside.js does it: Keep this one (the other → Deleted files), this one kept too, the combined saved
    ok((await m.e.resolve(c.id, 'mine')).ok, 'scene: Keep this one (first step of Combine)');
    const kept = await call('sync:keepCopy', rel);
    ok(kept.ok && /^here:\d{4}-\d\d-\d\d\/kv\/(?:[0-9a-f]{8}-)?three-sketches\.json$/.test(kept.id), 'scene: this computer\'s version kept in Deleted files before the combined one is saved', kept);
    const combined = K.combineText(rows[0].here, rows[0].there);
    m.write(rel, K.setAt(m.json(rel), rows[0].path, combined));
    const fresh = K.newEntries(before, await m.e.trash(), rel);
    ok(fresh.some((t) => t.where === 'cloud') && fresh.some((t) => t.id === kept.id), 'scene: both earlier versions are in Deleted files (the other computer\'s, this one\'s)', fresh);
    ok(await T.converge(w) > 0 && o.json(rel)[0].code === combined && /b = 20 \/\* PC/.test(combined) && /b = 200 \/\* Mac/.test(combined), 'scene: the combined code is on both computers', o.json(rel)[0].code);
    // Undo: this computer's code back; the combined one into Deleted files
    const u = await m.e.restore(kept.id, { replace: true });
    ok(u.ok && m.json(rel)[0].code === p.ours[0].code, 'scene: Undo brings back the code that was in place before', m.json(rel)[0].code);
    const t2 = K.newEntries(before, await m.e.trash(), rel);
    const inTrash = (t) => { const f = t.where === 'here' ? path.join(m.e.stateDir, 'trash', ...t.id.slice(5).split('/')) : path.join(m.e.cloudDir, 'trash', ...t.id.slice(6).split('/')); try { return JSON.parse(fs.readFileSync(f, 'utf8'))[0].code; } catch { return null; } };
    ok(t2.some((t) => inTrash(t) === combined) && t2.some((t) => inTrash(t) === p.theirs[0].code), 'scene: …and the combined one and the other computer\'s are in Deleted files (nothing lost)', t2.map((t) => [t.id, inTrash(t)]));
  }
  // a board renamed both ways → Keep both, the other version whole in Deleted files first
  {
    const { w, pc, mac } = await pair('board');
    const rel = 'kv/boards.json';
    pc.write(rel, [{ id: 'b1', name: 'Moods', updatedAt: 1, items: [] }]);
    ok(await T.converge(w) > 0, 'board: first sync', T.why(w));
    pc.edit(rel, (v) => { v[0].name = 'Moods (PC)'; }); mac.edit(rel, (v) => { v[0].name = 'Moods (Mac)'; });
    await T.converge(w);
    const m = (await pc.e.conflicts()).length ? pc : mac; const o = m === pc ? mac : pc;
    const call = helpers(m);
    const c = (await m.e.conflicts())[0];
    ok(Boolean(c) && c.rel === rel, 'board: a conflict', c);
    const before = await m.e.trash();
    const pv = await m.e.preview(c.id);
    const flip = c.fromId === m.e.machine().id;
    ok(flip === (m === pc ? c.by !== 'PC' : c.by !== 'Mac'), 'board: the record is listed on both computers; on the one the copy came from, the copy is its own version (the compare view labels it so)', { by: c.by, from: c.from, fromId: c.fromId, me: m.e.machine().id });
    const kt = await call('sync:keepTheirs', c.id);
    ok(kt.ok && kt.id && JSON.parse(fs.readFileSync(path.join(m.e.stateDir, 'trash', ...kt.id.slice(5).split('/')), 'utf8'))[0].name === pv.theirs[0].name, 'board: the other version, whole, in Deleted files before Keep both', kt);
    ok((await m.e.resolve(c.id, 'both')).ok, 'board: Keep both');
    const names = m.json(rel).map((b) => b.name).sort();
    ok(names.length === 2 && names.some((n) => /^Moods \((PC|Mac)\)$/.test(n)) && names.some((n) => / \(from (PC|Mac)\)$/.test(n)), 'board: both boards', names);
    ok(await T.converge(w) > 0 && JSON.stringify(o.json(rel).map((b) => b.name).sort()) === JSON.stringify(names), 'board: both on both computers', o.json(rel));
    ok(K.newEntries(before, await m.e.trash(), rel).length === 2, 'board: both earlier versions are listed in Deleted files', (await m.e.trash()).map((t) => t.id));
  }
  // a picture changed on both → Keep the other → Undo
  {
    const { w, pc, mac } = await pair('picture');
    const rel = 'refs/cover.png';
    pc.write(rel, PNG(100));
    ok(await T.converge(w) > 0, 'picture: first sync', T.why(w));
    pc.write(rel, PNG(200)); mac.write(rel, PNG(300));
    await T.converge(w);
    const m = (await pc.e.conflicts()).length ? pc : mac;
    const c = (await m.e.conflicts())[0];
    const p = c && await m.e.preview(c.id);
    ok(Boolean(p) && p.kind === 'file' && fs.existsSync(p.here) && fs.existsSync(p.there) && p.size !== p.theirsSize, 'picture: both pictures are there to show (two files, two sizes)', p);
    const mine = fs.readFileSync(m.p(rel)).length;
    const before = await m.e.trash();
    ok((await m.e.resolve(c.id, 'theirs')).ok && fs.readFileSync(m.p(rel)).length !== mine, 'picture: Keep the other');
    const back = K.newEntries(before, await m.e.trash(), rel).find((t) => t.where === 'here');
    ok(Boolean(back), 'picture: this one is in Deleted files', back);
    const used = fs.readFileSync(m.p(rel)).length;
    ok((await m.e.restore(back.id, { replace: true })).ok && fs.readFileSync(m.p(rel)).length === mine, 'picture: Undo brings it back');
    const now = K.newEntries(before, await m.e.trash(), rel).filter((t) => t.where === 'here');
    ok(now.some((t) => fs.statSync(path.join(m.e.stateDir, 'trash', ...t.id.slice(5).split('/'))).size === used), 'picture: …and the other one is in Deleted files now', now);
  }
  // a sound changed on both → Keep both → Undo (put away)
  {
    const { w, pc, mac } = await pair('sound');
    const rel = 'stems/loop.wav';
    pc.write(rel, Buffer.from('RIFF0000WAVEaaaa'));
    ok(await T.converge(w) > 0, 'sound: first sync', T.why(w));
    pc.write(rel, Buffer.from('RIFF0000WAVEpcpcpc')); mac.write(rel, Buffer.from('RIFF0000WAVEmacmacmacmac'));
    await T.converge(w);
    const m = (await pc.e.conflicts()).length ? pc : mac; const o = m === pc ? mac : pc;
    const call = helpers(m);
    const c = (await m.e.conflicts())[0];
    const r = await m.e.resolve(c.id, 'both');
    ok(r.ok && / \(from (PC|Mac)\)\.wav$/.test(r.made) && m.has(r.made), 'sound: Keep both: the other one next to it', r);
    ok(await T.converge(w) > 0 && o.has(r.made), 'sound: …on both computers');
    const keep = m.read(rel);
    const pa = await call('sync:putAway', r.made);
    ok(pa.ok && !m.has(r.made) && (await m.e.trash()).some((t) => t.id === pa.id), 'sound: Undo puts the copy into Deleted files', pa);
    ok(await T.converge(w) > 0 && !o.has(r.made) && m.read(rel) === keep && o.read(rel) === keep, 'sound: …gone from both computers, the original untouched');
    ok(!(await call('sync:putAway', rel)).ok && !(await call('sync:putAway', '../x (from Mac).wav')).ok && !(await call('sync:keepCopy', 'app/config.json')).ok && !(await call('sync:keepCopy', 'kv/../../x.json')).ok, 'helpers: refuse what isn\'t theirs to touch (an original, "..", settings\' own place)');
  }
  // a very long chat's differing messages, on the store thread
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ka94-chat-'));
    try {
      const msgs = Array.from({ length: 3000 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', at: i, text: `message ${i} ${'x'.repeat(200)}` }));
      fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ id: 'c', title: 'Tour diary', messages: [...msgs, { id: 'here1', role: 'user', at: 9e9, text: 'only on the PC' }] }));
      fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ id: 'c', title: 'Tour diary', messages: [...msgs.slice(0, 2999), { ...msgs[2999], text: 'edited on the Mac' }, { id: 'there1', role: 'user', at: 9e9, text: 'only on the Mac' }] }));
      const r = await runOff('chatDiff', { a: path.join(dir, 'a.json'), b: path.join(dir, 'b.json'), max: 40 });
      ok(r.onlyHere?.[0]?.text === 'only on the PC' && r.onlyThere?.[0]?.text === 'only on the Mac' && r.changed?.[0]?.there === 'edited on the Mac' && r.same === 2999, 'giant chat: the differing messages, from the store thread', r && { ...r, onlyHere: r.onlyHere?.length });
      const bad = await runOff('chatDiff', { a: path.join(dir, 'a.json'), b: path.join(dir, 'missing.json') });
      ok(bad.error && bad.side === 'there', 'giant chat: a version that can\'t be read is said so (never "no messages")', bad);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}

(async () => {
  core();
  await engine();
  console.log(`keptaside94-test: ${passes} passed, ${failures} failed`);
  worker?.terminate();
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
