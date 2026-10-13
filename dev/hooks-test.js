// ⚡ Hooks (round 26): the plain part (hooks-core.js: hooks made safe, words, the guard rails' arithmetic, timers)
// and the main side's folder watcher (hooksmain.js: new files only, once they stop growing, no partial downloads).
//   node dev/hooks-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const C = require('../hooks-core.js');
const M = require('../hooksmain.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- hooks made safe ----------
  ok('unknown event drops', C.normalize({ when: { kind: 'nope' }, then: { text: 'x' } }) === null);
  ok('no words drops', C.normalize({ when: { kind: 'render' }, then: { text: '  ' } }) === null);
  ok('a folder hook needs its folder', C.normalize({ when: { kind: 'file' }, then: { text: 'x' } }) === null);
  ok('bad time drops', C.normalize({ when: { kind: 'time', at: '25:00' }, then: { text: 'x' } }) === null);
  const t = C.normalize({ when: { kind: 'time', at: '9:05' }, then: { text: 'hi' } });
  ok('time padded, on by default, an id', t.when.at === '09:05' && t.on === true && /^hk/.test(t.id), t);
  ok('every N hours in 1..24', C.normalize({ when: { kind: 'every', every: 99 }, then: { text: 'x' } }).when.every === 24 && C.normalize({ when: { kind: 'every', every: 0 }, then: { text: 'x' } }).when.every === 3);
  ok('reply defaults to any', C.normalize({ when: { kind: 'reply' }, then: { text: 'x' } }).when.from === 'any');
  const mi = C.normalize({ when: { kind: 'render' }, then: { kind: 'mission', mission: 'review', text: ' line one\nline two ' } });
  ok('a mission keeps its words', mi.then.kind === 'mission' && mi.then.text === 'line one\nline two', mi);
  ok('words capped', C.normalize({ when: { kind: 'render' }, then: { text: 'x'.repeat(5000) } }).then.text.length === 2000);
  ok('listOf skips broken ones', C.listOf({ hooks: [{ when: { kind: 'render' }, then: { text: 'a' } }, null, { when: {} }] }).length === 1);

  // ---------- words ----------
  ok('when, in words', C.whenText({ kind: 'file', dir: '/Users/me/Downloads' }) === 'When a file lands in Downloads' && C.whenText({ kind: 'every', every: 1 }) === 'Every hour' && C.whenText({ kind: 'reply', from: 'a1' }, () => 'Astra') === 'When Astra finishes a reply');
  ok('describe', C.describe({ when: { kind: 'render' }, then: { kind: 'message', text: 'Check it' } }) === 'When a render finishes → it gets “Check it”');
  const f = C.fact('render', { title: 'Loop', output: '/r/loop.mp4' });
  ok('render fact names the path', f === 'A render finished: Loop → /r/loop.mp4', f);
  ok('error fact has the line', /line 12/.test(C.fact('labError', { message: 'x is not defined', line: 12 })));
  ok('board fact counts', C.fact('board', { n: 2, board: 'Mood' }) === '2 new things on the mood board “Mood”.');
  const msg = C.compose(f, '  Look at it  ');
  ok('the message: Hearth\'s line marked as Hearth\'s, then your words as written', msg === '> ⚡ From Hearth (hook): A render finished: Loop → /r/loop.mp4\n\nLook at it', msg);

  // ---------- guard rails ----------
  const t0 = 1e12;
  ok('first fire goes', C.gate({}, t0).ok);
  let rec = C.fired({}, t0, 'a');
  ok('once a minute', C.gate(rec, t0 + 30000, 'b').wait === 30000);
  ok('after a minute again', C.gate(rec, t0 + 61000, 'b').ok);
  ok('same news in 10 min: once', C.gate(rec, t0 + 120000, 'a').skip === 'same news');
  ok('same news later: again', C.gate(rec, t0 + 11 * 60000, 'a').ok);
  rec = {}; for (let i = 0; i < 10; i++) rec = C.fired(rec, t0 + i * 61000, `n${i}`);
  ok('10 in an hour: capped', C.gate(rec, t0 + 11 * 61000, 'z').cap === true);
  ok('an hour later: not capped', C.gate(rec, t0 + 2 * 3600000, 'z').ok);
  const q = C.coalesce(C.coalesce(null, 'one'), 'two');
  ok('queued news: the newest, and how many', C.queuedFact(q) === 'two (and 1 more like it while it was busy)', q);

  // ---------- timers ----------
  const day = new Date(2026, 9, 12, 9, 3).getTime();
  ok('daily: due just after its time', C.due({ kind: 'time', at: '09:00' }, {}, day));
  ok('daily: not twice', !C.due({ kind: 'time', at: '09:00' }, { last: day - 60000 }, day));
  ok('daily: not when Hearth opens hours later', !C.due({ kind: 'time', at: '09:00' }, {}, day + 3 * 3600000));
  ok('daily: not before', !C.due({ kind: 'time', at: '09:00' }, {}, day - 10 * 60000));
  ok('every: waits from when it was made', !C.due({ kind: 'every', every: 2 }, { armed: day }, day + 3600000) && C.due({ kind: 'every', every: 2 }, { armed: day }, day + 2 * 3600000));
  ok('every: not armed yet, not due', !C.due({ kind: 'every', every: 1 }, {}, day));

  // ---------- junk files ----------
  ok('junk', ['.DS_Store', 'a.crdownload', 'b.part', '~$doc.docx', 'x.tmp', 'Thumbs.db'].every(C.junk) && !C.junk('render.mp4') && M.junk('c.download') && !M.junk('photo.jpg'));

  // ---------- the folder watcher ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-hooks-'));
  fs.writeFileSync(path.join(dir, 'old.txt'), 'there before');
  const got = [];
  const w = M.makeWatcher((d) => got.push(d), { settle: 150 });
  const r = w.set([dir, path.join(dir, 'missing'), 'relative/dir']);
  ok('watching the folder (a missing one says so, relative ones are ignored)', r[dir] === true && r[path.join(dir, 'missing')] === false && !('relative/dir' in r), r);
  fs.writeFileSync(path.join(dir, 'new.png'), 'abc');
  fs.writeFileSync(path.join(dir, 'half.crdownload'), 'x');
  fs.writeFileSync(path.join(dir, 'old.txt'), 'changed');
  await wait(900);
  ok('a new file is told once, with its path and size', got.length === 1 && got[0].path === path.join(dir, 'new.png') && got[0].size === 3 && got[0].dir === dir, got);
  // a file still growing waits until it stops
  const grow = path.join(dir, 'export.mp4');
  fs.writeFileSync(grow, 'a');
  for (let i = 0; i < 4; i++) { await wait(80); fs.appendFileSync(grow, 'bbbb'); }
  await wait(900);
  const g = got.find((d) => d.path === grow);
  ok('a growing file is told once it stops growing', g && g.size === 17 && got.filter((d) => d.path === grow).length === 1, got);
  fs.writeFileSync(path.join(dir, 'new.png'), 'rewritten');
  await wait(600);
  ok('a rewrite of a known file is not new', got.filter((d) => d.path.endsWith('new.png')).length === 1);
  w.set([]);
  fs.writeFileSync(path.join(dir, 'after.png'), 'x');
  await wait(600);
  ok('stopped: nothing more', !got.some((d) => d.path.endsWith('after.png')) && w.watching().length === 0);
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})();
