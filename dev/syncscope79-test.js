#!/usr/bin/env node
// (round 79, syncscope79) Scoped sync passes, proven under LOST watcher events. Two computers (PC / Mac) over the
// simulated cloud provider of dev/sync-sim.js (own views, delays, placeholders, its own copies, skewed clocks). The
// "watchers" are simulated from what really changed on each disk between two passes (every file added / changed /
// removed in the data folder and in <cloud>/Hearth/files, sync's own writes included, as real watchers hear them); a
// share of them is DROPPED at random (5–20 %), and a folder that appeared or went is sometimes reported only as the
// folder (Linux's recursive watch after a rename, FSEvents' "rescan this folder"). Each pass gets only what was heard
// (engine.pass({ scope })), as syncmain.js does.
// Scenarios:
//   lossless   nothing dropped: everything syncs with scoped passes only (no whole look after the first), and a scoped
//              pass looks at far fewer files than a whole one
//   detect     every event of one change dropped: the engine's own checks (folders' times, files in turn, the journals)
//              find it within a few passes, it syncs, and a whole look follows at once
//   lossy      random work on both computers (chats, new chats, scenes, notes, pictures, folders made / renamed /
//              removed, deletes, a computer offline, restarts, time jumps) with 5 / 10 / 20 % of events dropped:
//              after the periodic safety look (fullEveryMs) both computers are identical, every message once, every
//              scene / note line / file / folder there, deleted things gone, no duplicates
//   fallback   a whole look on: a restart, a wake, an option changed, a fix, the cloud folder replaced, an unreadable
//              folder, a nameless event (overflow), too many paths, the 6-hour mark
//   node dev/syncscope79-test.js [--only name] [--seeds N] [--verbose] [--keep]
'use strict';
const fs = require('fs');
const path = require('path');
const Sim = require('./sync-sim');
Sim.install();
const S = require('../sync-merge');
const T = require('./sync72-test'); // its world / computers / convergence helpers (requiring it runs nothing)

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', '');
const SEEDS = Number(arg('--seeds', 3));
const VERBOSE = argv.includes('--verbose');
const raw = Sim.raw;
let failures = 0; let passes = 0;
const ok = (cond, what, detail) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`); } };

// every fs.promises stat / readdir of the process (the engine's looks), counted per pass
const fsp = fs.promises; const count = { stat: 0, readdir: 0 };
for (const k of ['stat', 'readdir']) { const f = fsp[k]; fsp[k] = (...a) => { count[k] += 1; return f(...a); }; }

const ROOTS = new Set(); // sync72-test's temp folder (removed at the end)
const DBG = process.env.SCOPE79_DBG || ''; // a name to follow (tests)
const ALLFULL = Boolean(process.env.SCOPE79_ALLFULL); // (comparison: every pass looks at everything, as before this round)
const TALLY = { aside: 0, gone: 0, dropped: 0, heard: 0, scoped: 0, full: 0, missed: 0 };
const FULL_MS = 20 * 60000; // the safety look in this test (6 h in the app): 20 minutes of the simulated clock
// ---------- the simulated watchers ----------
// what is on a disk: files → "size:mtime", folders → true (raw fs: never counted, never through the provider)
function listing(root, skipDir) {
  const out = new Map();
  const walk = (dir, rel) => {
    let ents; try { ents = raw.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (skipDir(r)) continue; out.set(r, 'dir'); walk(path.join(dir, e.name), r); continue; }
      if (/^\.sim-/.test(e.name)) continue; // the provider's own temp files (it renames them in a moment)
      let st; try { st = raw.statSync(path.join(dir, e.name)); } catch { continue; }
      out.set(r, `${st.size}:${st.mtimeMs}`);
    }
  };
  walk(root, '');
  return out;
}
const sideRoot = (m, side) => (side === 'local' ? m.data : path.join(m.cloudRoot, 'Hearth', 'files'));
const skipOf = (side) => (side === 'local' ? (r) => r === 'sync' || S.dirLocalOnly(r) : () => false);
// what changed since the last look (both sides) → { local: [paths], cloud: [paths], heard, dropped }
function hear(m, w, drop) {
  const out = { local: [], cloud: [], heard: 0, dropped: 0 };
  for (const side of ['local', 'cloud']) {
    const now = listing(sideRoot(m, side), skipOf(side));
    const was = m.lists?.[side] || new Map();
    let ev = [];
    for (const [r, v] of now) if (was.get(r) !== v && v !== 'dir') ev.push(r);
    for (const [r, v] of was) if (!now.has(r) && v !== 'dir') ev.push(r);
    // a folder that appeared or went: sometimes heard only as the folder (its files' events lost)
    const newDirs = [...now].filter(([r, v]) => v === 'dir' && was.get(r) !== 'dir').map(([r]) => r);
    const goneDirs = [...was].filter(([r, v]) => v === 'dir' && !now.has(r)).map(([r]) => r);
    for (const d of [...newDirs, ...goneDirs]) {
      if (w.rnd() < 0.5) { ev = ev.filter((r) => !r.startsWith(`${d}/`)); ev.push(d); }
    }
    ev = [...new Set(ev)];
    for (const r of ev) { out.heard += 1; if (w.rnd() < drop) { out.dropped += 1; if (DBG && r.includes(DBG)) console.log(`   [${m.name}] LOST ${side}:${r}`); continue; } if (DBG && r.includes(DBG)) console.log(`   [${m.name}] heard ${side}:${r}`); out[side].push(r); }
    (m.lists ||= {})[side] = now;
  }
  return out;
}
// one pass as the app runs it: what was heard (minus the lost events), the big lane's copies settled after it
async function spass(m, w, o = {}) {
  if (DBG) { const rel = `${DBG}.json`; const cf = path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/')); console.log(`   [${m.name}] before: here ${m.has(rel)} cloud ${raw.existsSync(cf)} trash-here ${m.has(rel.replace('chats/', 'trash/'))}`); }
  const h = hear(m, w, o.drop ?? 0);
  w.heard += h.heard; w.dropped += h.dropped;
  const s0 = count.stat + count.readdir;
  m.last = await m.e.pass(o.full || ALLFULL ? {} : { scope: { local: h.local, cloud: h.cloud } });
  if (m.e.laneIdle) { await m.e.laneIdle(); if (m.e.status().moving === 0 && m.last.pending) m.last = await m.e.pass(o.full ? {} : { scope: { local: [], cloud: [] } }); }
  const sc = m.e.scope();
  if (DBG) { const p = (m.pulled || []).filter((x) => String(x.rel || x).includes(DBG)); if (p.length) console.log(`   [${m.name}] pulled`, JSON.stringify(p), sc.mode, sc.lastWhy, JSON.stringify(m.last.last)); m.pulled = []; const rel = `${DBG}.json`; const cf = path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/')); console.log(`   [${m.name}] after ${sc.mode}/${sc.lastWhy}: here ${m.has(rel)} cloud ${raw.existsSync(cf)} trash-here ${m.has(rel.replace('chats/', 'trash/'))} base ${Boolean(m.e._state().base[rel])} t=${w.clock.now()}`); }
  (m.looks ||= []).push({ mode: sc.mode, why: sc.lastWhy, fs: count.stat + count.readdir - s0 });
  return m.last;
}
async function sround(w, o = {}) {
  w.clock.advance(o.step ?? 2000);
  const list = w.rnd() < 0.5 ? w.ms : [...w.ms].reverse();
  for (const m of list) { m.view.tick(); if (m.offline) continue; await spass(m, w, o); }
}
async function sconverge(w, max, o) {
  for (let i = 1; i <= max; i++) { await sround(w, o); if (i >= 2 && T.settled(w)) return i; }
  return -1;
}
function setup(name, o = {}) {
  const w = T.world(`scope-${name}`, { seed: o.seed || 1 });
  w.heard = 0; w.dropped = 0; ROOTS.add(path.dirname(w.dir));
  const extra = { fullEveryMs: FULL_MS, ...(o.engine || {}) };
  const pc = T.computer(w, 'PC', { platform: 'win32', style: o.style || 'onedrive', placeholders: o.pcPh ?? null, skew: o.skew || 0, slowUp: 64 * 1024 });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', nfd: true, placeholders: o.macPh ?? null, skew: -(o.skew || 0), partialDown: 64 * 1024 });
  for (const m of [pc, mac]) { const make = m.make; m.make = (x = {}) => make({ ...extra, ...x }); m.e = m.make(); }
  // half the saves as apps make them: a temp file renamed over the old one (only the folder's time says so when its
  // event is lost), half written in place
  for (const m of [pc, mac]) { const write = m.write; m.write = (rel, data) => { if (w.rnd() < 0.5 || !m.has(rel)) return write(rel, data); const f = m.p(rel); const tmp = `${f}.tmp-save`; raw.writeFileSync(tmp, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2)); const t = new Date(m.now()); raw.utimesSync(tmp, t, t); raw.renameSync(tmp, Sim.ci(f)); }; }
  return { w, pc, mac };
}
const PROJECT = (notes) => ({ v: 1, list: [{ id: 'p1', name: 'Clink', status: 'active', notes, items: [], created: 1, updated: 1 }] });
const scene = (id, name) => ({ id, name, layers: [{ id: 'l', name: 'L', code: `// ${id}` }], updated: 1 });
const looksOf = (m, from = 0) => (m.looks || []).slice(from);

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- nothing lost: scoped passes do it all ----------
scenario('lossless', async () => {
  const { w, pc, mac } = setup('lossless');
  for (let i = 0; i < 300; i++) pc.write(`attachments/a${i}.bin`, Buffer.alloc(200 + i, i & 255));
  for (let i = 0; i < 40; i++) pc.write(`chats/c${i}.json`, T.chat(`c${i}`, [T.msg('user', i, `hello ${i}`)]));
  pc.write('kv/projects.json', PROJECT('Goal'));
  ok(await sconverge(w, 40) > 0, 'lossless: first sync', T.why(w));
  const from = { pc: pc.looks.length, mac: mac.looks.length };
  // everyday work on both
  pc.edit('chats/c1.json', (c) => { c.messages.push(T.msg('user', 100, 'PC more')); });
  mac.edit('chats/c2.json', (c) => { c.messages.push(T.msg('user', 101, 'Mac more')); });
  mac.write('chats/new1.json', T.chat('new1', [T.msg('user', 102, 'new on the Mac')]));
  pc.write('workspace/proj/src/a.txt', 'one'); pc.write('workspace/proj/src/deep/b.txt', 'two');
  pc.edit('kv/projects.json', (d) => { d.list[0].notes += '\nPC line'; });
  pc.deleteChat('c3');
  ok(await sconverge(w, 40) > 0, 'lossless: everyday work syncs', T.why(w));
  // a folder renamed on the Mac (its files only heard as the folder, half the time)
  raw.renameSync(path.join(mac.data, 'workspace', 'proj'), path.join(mac.data, 'workspace', 'proj2'));
  ok(await sconverge(w, 40) > 0, 'lossless: a folder renamed on the Mac', T.why(w));
  ok(pc.read('workspace/proj2/src/deep/b.txt') === 'two' && !pc.has('workspace/proj/src/a.txt'), 'lossless: the renamed folder arrives on the PC, the old name gone', { b: pc.read('workspace/proj2/src/deep/b.txt'), old: pc.has('workspace/proj/src/a.txt') });
  for (const m of [pc, mac]) {
    ok(T.texts(m.json('chats/c1.json')).includes('PC more') && T.texts(m.json('chats/c2.json')).includes('Mac more') && m.has('chats/new1.json') && !m.has('chats/c3.json'), `lossless: chats on the ${m.name}`);
    ok(m.json('kv/projects.json').list[0].notes.includes('PC line'), `lossless: notes on the ${m.name}`);
  }
  const after = [...looksOf(pc, from.pc), ...looksOf(mac, from.mac)];
  const whole = after.filter((l) => l.mode === 'full');
  ok(whole.length === 0, 'lossless: after the first sync, no pass looked at everything', whole);
  const scopedFs = after.filter((l) => l.mode === 'scoped').map((l) => l.fs);
  const fullFs = [...pc.looks.slice(0, from.pc), ...mac.looks.slice(0, from.mac)].filter((l) => l.mode === 'full').map((l) => l.fs);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
  if (VERBOSE) console.log('  lossless: fs calls per pass — whole', fullFs, 'scoped median', med(scopedFs), 'max', Math.max(...scopedFs));
  ok(med(scopedFs) * 3 < Math.max(...fullFs), 'lossless: a scoped pass looks at far fewer files than a whole one', { scoped: med(scopedFs), whole: Math.max(...fullFs) });
});

// ---------- every event of a change lost: the engine finds it ----------
scenario('detect', async () => {
  const { w, pc, mac } = setup('detect', { engine: { sampleN: 8, dirsN: 4 } });
  for (let i = 0; i < 60; i++) pc.write(`attachments/sub${i % 6}/a${i}.bin`, Buffer.alloc(300 + i, i & 255));
  ok(await sconverge(w, 40) > 0, 'detect: first sync', T.why(w));
  for (const m of [pc, mac]) m.lists = { local: listing(sideRoot(m, 'local'), skipOf('local')), cloud: listing(sideRoot(m, 'cloud'), skipOf('cloud')) };
  // a file changed in place on the PC, and a new file on the PC: both their events lost
  w.clock.advance(5000);
  pc.write('attachments/sub2/a2.bin', Buffer.alloc(999, 7)); pc.write('attachments/sub3/new.bin', Buffer.alloc(77, 1));
  const lost = () => { for (const side of ['local', 'cloud']) pc.lists[side] = listing(sideRoot(pc, side), skipOf(side)); }; // the watcher never says
  lost();
  let found = -1; const m0 = pc.e.scope().missed;
  for (let i = 1; i <= 30; i++) {
    w.clock.advance(5000); // (each pass well after the change: the change is "late")
    pc.view.tick(); await spass(pc, w); lost();
    if (pc.e.scope().missed > m0) { found = i; break; }
  }
  ok(found > 0, 'detect: the lost change is found by the checks (folders\' times / files in turn), long before the 20-minute look', { found, scope: pc.e.scope() });
  ok(looksOf(pc).slice(-1)[0]?.mode === 'full', 'detect: a whole look follows at once', looksOf(pc).slice(-3));
  ok(await sconverge(w, 30) > 0, 'detect: converges', T.why(w));
  ok(mac.has('attachments/sub3/new.bin') && fs.readFileSync(mac.p('attachments/sub2/a2.bin')).length === 999, 'detect: both lost changes reach the Mac');
  // a store saved by a rename (temp file + rename, how Hearth saves) with its event lost: only its folder's time changed;
  // no file checks in turn here (sampleN 0): the folder check finds it
  { const e0 = pc.e; pc.e = pc.make({ sampleN: 0, dirsN: 256 }); await spass(pc, w); await spass(pc, w);
    w.clock.advance(5000);
    const f = pc.p('attachments/sub4/a4.bin'); raw.writeFileSync(`${f}.tmp`, Buffer.alloc(4444, 9)); const t = new Date(pc.now()); raw.utimesSync(`${f}.tmp`, t, t); raw.renameSync(`${f}.tmp`, f);
    lost(); const n0 = pc.looks.length;
    w.clock.advance(5000); await spass(pc, w); lost();
    ok(pc.e._state().local['attachments/sub4/a4.bin']?.[0] === 4444 && looksOf(pc, n0).every((l) => l.mode === 'scoped'), 'detect: a file replaced by a rename, its event lost: found by its folder\'s time, in a scoped pass', { cache: pc.e._state().local['attachments/sub4/a4.bin'], looks: looksOf(pc, n0) });
    ok(await sconverge(w, 30) > 0 && fs.readFileSync(mac.p('attachments/sub4/a4.bin')).length === 4444, 'detect: and it reaches the Mac', T.why(w));
    void e0; }
  // the other way: a file the Mac's cloud client brought whose event was lost: the PC's journal names it
  mac.write('attachments/sub1/frommac.bin', Buffer.alloc(55, 3));
  await spass(mac, w); // up (the Mac heard it)
  for (let i = 0; i < 4; i++) { w.clock.advance(2000); pc.view.tick(); mac.view.tick(); }
  for (const side of ['cloud']) pc.lists[side] = listing(sideRoot(pc, side), skipOf(side)); // the PC's cloud watcher lost it
  const before = pc.looks.length;
  w.clock.advance(2000); await spass(pc, w);
  ok(pc.has('attachments/sub1/frommac.bin') && looksOf(pc, before).every((l) => l.mode === 'scoped'), 'detect: an arrival whose event was lost is found through the other computer\'s journal, in a scoped pass', looksOf(pc, before));
});

// ---------- a chat deleted (moved to trash/) with some of its events lost: never comes back ----------
scenario('deletes', async () => {
  for (const lose of [['chats/'], ['trash/'], ['chats/', 'trash/']]) {
    const tag = `deletes (lost: ${lose.join(' + ')})`;
    const { w, pc, mac } = setup(`deletes-${lose.length}-${lose[0].slice(0, 1)}`);
    for (let i = 0; i < 6; i++) pc.write(`chats/c${i}.json`, T.chat(`c${i}`, [T.msg('user', i, `m ${i}`)]));
    pc.deleteChat('c0'); // (trash/ exists)
    ok(await sconverge(w, 30) > 0, `${tag}: first sync`, T.why(w));
    w.clock.advance(5000);
    pc.deleteChat('c1');
    const h = hear(pc, w, 0); // what the PC's watcher heard, minus the lost ones
    const scope = { local: h.local.filter((r) => !lose.some((x) => r.startsWith(x))), cloud: h.cloud };
    w.clock.advance(2000); pc.view.tick();
    pc.last = await pc.e.pass({ scope });
    ok(await sconverge(w, 30) > 0, `${tag}: converges`, T.why(w));
    for (const m of [pc, mac]) ok(!m.has('chats/c1.json') && m.has('trash/c1.json'), `${tag}: the chat stays deleted on the ${m.name}`, { chat: m.has('chats/c1.json'), trash: m.has('trash/c1.json') });
  }
});

// ---------- random work, events lost at random: the safety look converges, nothing lost ----------
scenario('lossy', async () => {
  for (let sd = 1; sd <= SEEDS; sd++) {
    for (const drop of [0.05, 0.1, 0.2]) {
      const tag = `lossy ${sd} @${Math.round(drop * 100)}%`;
      const { w, pc, mac } = setup(`lossy-${sd}-${Math.round(drop * 100)}`, { seed: sd * 7919 + Math.round(drop * 100), skew: 40000, macPh: sd % 2 ? 'dataless' : null, pcPh: sd % 3 === 0 ? 'win' : null, style: ['onedrive', 'dropbox', 'icloud'][sd % 3] });
      const R = w.rnd; const pick = (a) => a[Math.floor(R() * a.length)];
      const said = new Map(); let at = 10;
      const say = (m, id) => { const t = `${m.name} ${at}`; m.edit(`chats/${id}.json`, (c) => { (c || (c = T.chat(id, []))).messages.push(T.msg('user', at++, t)); return c; }); said.get(id).add(t); };
      for (const id of ['x', 'y', 'z']) { said.set(id, new Set()); pc.write(`chats/${id}.json`, T.chat(id, [])); }
      const victims = ['v1', 'v2', 'v3']; const deleted = new Set();
      for (const id of victims) pc.write(`chats/${id}.json`, T.chat(id, [T.msg('user', 1, `victim ${id}`)]));
      for (let i = 0; i < 120; i++) pc.write(`attachments/old/o${i}.bin`, Buffer.alloc(100 + i, i & 255));
      pc.write('kv/projects.json', PROJECT('Notes'));
      const scenes = new Set(); const lines = new Set(); const files = new Map(); const goneFiles = new Set(); const folders = new Map(); // folders: name → { files: Map rel → content }
      ok(await sconverge(w, 60, { drop }) > 0 || (await sconverge(w, 60, { drop, step: FULL_MS }) > 0), `${tag}: first sync`, T.why(w));
      for (let step = 0; step < 70; step++) {
        const m = pick([pc, mac]); const r = R();
        if (r < 0.3) { if (m.has(`chats/${pick(['x', 'y', 'z'])}.json`)) say(m, pick(['x', 'y', 'z'])); }
        else if (r < 0.4) { const id = `n${sd}${step}`; said.set(id, new Set()); m.write(`chats/${id}.json`, T.chat(id, [])); say(m, id); }
        else if (r < 0.5) { const rel = `attachments/new/f${step}.bin`; const b = Buffer.alloc(500 + Math.floor(R() * 90000), step & 255); m.write(rel, b); files.set(rel, b.length); }
        else if (r < 0.55) { const rel = `attachments/old/o${Math.floor(R() * 120)}.bin`; if (!goneFiles.has(rel) && m.has(rel)) { fs.rmSync(m.p(rel)); goneFiles.add(rel); } }
        else if (r < 0.6) { scenes.add(`s${step}`); m.edit('kv/three-sketches.json', (l) => { const list = Array.isArray(l) ? l : []; list.push(scene(`s${step}`, `${m.name} ${step}`)); return list; }); }
        else if (r < 0.65) { const t = `${m.name} note ${step}`; lines.add(t); m.edit('kv/projects.json', (d) => { d.list[0].notes += `\n${t}`; }); }
        else if (r < 0.68) { const id = victims.find((v) => !deleted.has(v)); if (id && m.has(`chats/${id}.json`)) { m.deleteChat(id); deleted.add(id); } }
        else if (r < 0.74) { // a project folder made (nested)
          const name = `p${step}`; const f = new Map([[`workspace/${name}/README.md`, `# ${name}`], [`workspace/${name}/src/main.js`, `// ${name}`], [`workspace/${name}/src/lib/util.js`, `// util ${step}`]]);
          for (const [rel, t] of f) m.write(rel, t);
          folders.set(name, { files: f });
        } else if (r < 0.79) { // a project folder renamed where it is (both computers have it)
          const name = [...folders.keys()].find((n) => pc.has(`workspace/${n}/README.md`) && mac.has(`workspace/${n}/README.md`));
          if (name) {
            const to = `${name}r`; raw.renameSync(path.join(m.data, 'workspace', name), path.join(m.data, 'workspace', to));
            const f = new Map([...folders.get(name).files].map(([rel, t]) => [rel.replace(`workspace/${name}/`, `workspace/${to}/`), t]));
            folders.delete(name); folders.set(to, { files: f });
          }
        } else if (r < 0.82) { // a project folder removed (both have it)
          const name = [...folders.keys()].find((n) => pc.has(`workspace/${n}/README.md`) && mac.has(`workspace/${n}/README.md`));
          if (name) { raw.rmSync(path.join(m.data, 'workspace', name), { recursive: true, force: true }); folders.get(name).gone = true; }
        } else if (r < 0.87) { const v = pick([pc, mac]).view; v.online = !v.online; }
        else if (r < 0.9) m.e = m.make(); // Hearth restarted there
        else await sround(w, { step: Math.floor(R() * 300000), drop });
        if (R() < 0.5) await sround(w, { drop });
      }
      pc.view.online = true; mac.view.online = true;
      // scoped passes with lost events for a while, then the periodic safety look (the clock passes fullEveryMs)
      for (let i = 0; i < 12; i++) await sround(w, { drop });
      const n = await sconverge(w, 90, { drop, step: FULL_MS / 6 });
      ok(n > 0, `${tag}: converges (lost events: ${w.dropped} of ${w.heard})`, T.why(w));
      // nothing lost: every message / scene / note line is there, or (a true conflict under this harsh workload, the
      // same with every pass looking at everything: SCOPE79_ALLFULL=1) its losing side is kept whole in Deleted files /
      // the conflicts, as the engine promises — never gone
      const gone = []; const aside = [];
      const sort = (list, needle) => { for (const x of list) (T.recoverable(w, needle(x)) ? aside : gone).push(x); };
      const lost = []; const twice = [];
      for (const [id, set] of said) for (const m of [pc, mac]) { const t = T.texts(m.json(`chats/${id}.json`)); lost.push(...[...set].filter((x) => !t.includes(x)).map((x) => ({ x, at: `${m.name}:${id}` }))); if (T.dupes(t).length) twice.push(`${m.name}:${id}: ${T.dupes(t)}`); }
      sort(lost, (l) => JSON.stringify(l.x));
      ok(!twice.length, `${tag}: no message twice`, twice);
      for (const m of [pc, mac]) {
        const ids = new Set((m.json('kv/three-sketches.json') || []).map((x) => x.id));
        sort([...scenes].filter((id) => !ids.has(id)).map((x) => ({ x, at: `${m.name}:scenes` })), (l) => JSON.stringify(l.x));
        const notes = m.json('kv/projects.json')?.list?.[0]?.notes || '';
        sort([...lines].filter((t) => !notes.includes(t)).map((x) => ({ x, at: `${m.name}:notes` })), (l) => l.x);
      }
      ok(!gone.length, `${tag}: no message, scene or note line gone (${aside.length} kept aside by a conflict)`, gone.slice(0, 8));
      TALLY.aside += aside.length; TALLY.gone += gone.length;
      for (const m of [pc, mac]) {
        ok([...deleted].every((id) => !m.has(`chats/${id}.json`)) && victims.filter((v) => !deleted.has(v)).every((id) => m.has(`chats/${id}.json`)), `${tag}: deleted chats gone, the others there, on the ${m.name}`, { deleted: [...deleted], here: victims.filter((id) => m.has(`chats/${id}.json`)), trash: victims.filter((id) => m.has(`trash/${id}.json`)) });
        const missing = [...files].filter(([rel, size]) => !m.has(rel) || fs.statSync(m.p(rel)).size !== size).map(([rel]) => rel);
        ok(!missing.length, `${tag}: every new picture, on the ${m.name}`, missing);
        ok([...goneFiles].every((rel) => !m.has(rel)), `${tag}: removed pictures gone, on the ${m.name}`, [...goneFiles].filter((rel) => m.has(rel)));
        const fl = []; for (const [name, f] of folders) for (const [rel, t] of f.files) { if (f.gone ? m.has(rel) : m.read(rel) !== t) fl.push(`${rel}${f.gone ? ' (removed)' : ''}`); }
        ok(!fl.length, `${tag}: every folder made / renamed / removed, on the ${m.name}`, fl.slice(0, 8));
      }
      ok(!T.copies(pc).length && !T.copies(mac).length, `${tag}: no duplicate files`, [...T.copies(pc), ...T.copies(mac)]);
      const all = [...pc.looks, ...mac.looks];
      const sc = { scoped: all.filter((l) => l.mode === 'scoped').length, full: all.filter((l) => l.mode === 'full').length, why: [...new Set(all.filter((l) => l.mode === 'full').map((l) => l.why))], missed: pc.e.scope().missed + mac.e.scope().missed };
      if (VERBOSE) console.log(`  ${tag}: ${w.dropped}/${w.heard} events lost; passes`, sc);
      if (!ALLFULL) ok(sc.scoped > sc.full, `${tag}: most passes are scoped`, sc);
      TALLY.dropped += w.dropped; TALLY.heard += w.heard; TALLY.scoped += sc.scoped; TALLY.full += sc.full; TALLY.missed += sc.missed;
    }
  }
});

// ---------- when a pass looks at everything ----------
scenario('fallback', async () => {
  const { w, pc, mac } = setup('fallback');
  for (let i = 0; i < 30; i++) pc.write(`chats/c${i}.json`, T.chat(`c${i}`, [T.msg('user', i, `m ${i}`)]));
  ok(await sconverge(w, 30) > 0, 'fallback: first sync', T.why(w));
  const lastWhy = async (m, o = {}) => { await spass(m, w, o); return looksOf(m).slice(-1)[0]; };
  ok((await lastWhy(pc)).mode === 'scoped', 'fallback: a calm pass is scoped');
  pc.e = pc.make(); ok((await lastWhy(pc)).why === 'start', 'fallback: after a restart: whole');
  ok((await lastWhy(pc)).mode === 'scoped', 'fallback: then scoped again');
  pc.e.woke(60000); ok((await lastWhy(pc)).why === 'wake', 'fallback: after a wake: whole');
  pc.e.set({ big: false }); ok((await lastWhy(pc)).why === 'set', 'fallback: an option changed: whole'); pc.e.set({ big: true }); await spass(pc, w);
  await pc.e.fix('chats/c1.json', 'writable').catch(() => {}); ok((await lastWhy(pc)).why === 'wrote', 'fallback: after a fix: whole');
  // a nameless event (a watcher overflow), too many paths, a scope with nothing in it is still scoped
  pc.last = await pc.e.pass({ scope: { local: [''], cloud: [] } }); ok(pc.e.scope().lastWhy === 'root', 'fallback: a nameless event (the system lost track): whole', pc.e.scope());
  pc.last = await pc.e.pass({ scope: { local: Array.from({ length: 5000 }, (_, i) => `x/${i}`), cloud: [] } }); ok(pc.e.scope().lastWhy === 'many', 'fallback: thousands of paths: whole', pc.e.scope());
  pc.last = await pc.e.pass({ scope: { local: [], cloud: [] } }); ok(pc.e.scope().mode === 'scoped', 'fallback: nothing heard (the calm check): scoped', pc.e.scope());
  // the 20-minute (6 h in the app) mark
  w.clock.advance(FULL_MS + 1000); ok((await lastWhy(pc)).why === 'due', 'fallback: the periodic safety look');
  // a folder that can't be read: the next pass looks at everything
  Sim.T.hook = (op, p) => (op === 'scandir' && /[\\/]chats$/.test(String(p)) && /PC/.test(String(p)) ? 'EBUSY' : null);
  await spass(pc, w, { full: true }); Sim.T.hook = null;
  ok((await lastWhy(pc)).why === 'unlisted', 'fallback: after a folder that couldn\'t be read: whole', looksOf(pc).slice(-2));
  // the cloud folder replaced by another one (a client relocating it): whole
  const files = path.join(pc.cloudRoot, 'Hearth', 'files');
  raw.renameSync(files, `${files}-old`); fs.cpSync(`${files}-old`, files, { recursive: true, preserveTimestamps: true }); raw.rmSync(`${files}-old`, { recursive: true, force: true });
  ok((await lastWhy(pc)).why === 'moved', 'fallback: the cloud folder replaced: whole', looksOf(pc).slice(-1));
  ok(await sconverge(w, 30) > 0, 'fallback: still converges', T.why(w));
  ok(!T.differs(pc, mac).length, 'fallback: identical');
});

// ---------- the app's sync main side (syncmain.js) on two computers, in real time: its passes are scoped ----------
scenario('main', async () => {
  const { execFileSync } = require('child_process');
  let r = null;
  try { r = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'synclatency77.js'), '--json', '--profile', 'fast', '--items', 'chat,note,small', '--mode', 'idle'], { encoding: 'utf8', timeout: 240000, maxBuffer: 16e6, env: { ...process.env, HEARTH_SYNC_SCOPE: '1' } })); } catch (err) { ok(false, 'main: the live run', String(err.stdout || err.message).slice(0, 400)); return; }
  ok(r.results.length === 6 && r.results.every((x) => !x.timedOut), 'main: every item reaches the other computer', r.results.map((x) => `${x.from}→${x.to} ${x.item} ${x.timedOut ? 'timed out' : `${x.window} ms`}`));
  for (const n of ['PC', 'Mac']) ok((r.scopes?.[n]?.scoped || 0) > 0 && (r.scopes[n].full || 0) <= 2, `main: the ${n}'s passes are scoped after the first`, r.scopes);
  ok(r.results.filter((x) => x.item !== 'small').every((x) => x.engineDown < 2000), 'main: stores still shown < 2 s after they land (as round 77)', r.results.map((x) => x.engineDown));
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.split(',').includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  if (TALLY.heard) console.log(`lossy: ${TALLY.dropped} of ${TALLY.heard} watcher events lost; passes ${TALLY.scoped} scoped / ${TALLY.full} whole; lost events found by the checks: ${TALLY.missed}; kept aside by conflicts: ${TALLY.aside}; gone: ${TALLY.gone}${ALLFULL ? ' (every pass whole)' : ''}`);
  if (!argv.includes('--keep')) for (const r of ROOTS) fs.rmSync(r, { recursive: true, force: true });
  console.log(`\nsyncscope79: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
