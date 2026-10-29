// Find in this project (round 81, projsearch81): projfind-core.js's index and ranking, on real files in a throwaway
// folder (chats, the Lab's scenes file, moodboards, the worktable) the way the store thread reads them, then the store
// thread itself (storework.js in a worker: a save marks what it wrote, the next find reads only that again), the
// slices (budgetMs), an arrival from the other computer (a new file on disk), unreadable files, letting go when idle,
// and timings on a project the size of the heavy fixture's "Clink" (15 long chats, 4 scenes, 3 boards, 740 files).
//   node dev/projsearch81-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const PF = require('../projfind-core.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info).slice(0, 600)); } else console.log(`✓ ${name}`); };
const NOW = Date.now(); const DAY = 864e5;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projsearch81-'));
const dirs = { chats: path.join(root, 'chats'), kv: path.join(root, 'kv') };
fs.mkdirSync(dirs.chats, { recursive: true }); fs.mkdirSync(dirs.kv, { recursive: true });
const W = (file, v) => fs.writeFileSync(file, JSON.stringify(v));
const chatFile = (id) => path.join(dirs.chats, `${id}.json`);
const kvFile = (name) => path.join(dirs.kv, `${name}.json`);
const env = { stat: (f) => { try { return fs.statSync(f); } catch { return null; } }, join: path.join, now: () => performance.now(), read: (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } } };
// a file's time moved on (a save or an arrival on the same millisecond would look unchanged: the store thread marks it)
const bump = (f, s = 2) => { const t = new Date(Date.now() + s * 1000); fs.utimesSync(f, t, t); };

// ---------- 1. words ----------
ok('fold keeps one character per character', PF.fold('Café Élan İstanbul ⚡x').length === 'Café Élan İstanbul ⚡x'.length, PF.fold('Café Élan İstanbul ⚡x'));
ok('fold: case and accents', PF.fold('Café ÉLAN Noël') === 'cafe elan noel', PF.fold('Café ÉLAN Noël'));
ok('words: one-letter words dropped, kept when alone', JSON.stringify(PF.words('a bloom x')) === '["bloom"]' && JSON.stringify(PF.words('x')) === '["x"]', [PF.words('a bloom x'), PF.words('x')]);
ok('words: digits kept', PF.words('layer 2').includes('2'));

// ---------- 2. a project on disk ----------
const msg = (role, text, daysAgo) => ({ role, text, at: NOW - daysAgo * DAY });
W(chatFile('claude-p1'), { id: 'claude-p1', agentId: 'claude', title: 'Clink main chat', updatedAt: NOW - DAY, messages: [
  msg('user', 'Make the orb glow with a soft bloom and a café neon sign.', 5),
  msg('assistant', 'Done: the orb now uses UnrealBloomPass at 0.6.', 5),
  msg('system', 'bloom system note (never searched)', 5),
  msg('user', 'The tunnel needs more fog near the portal.', 2),
  msg('assistant', 'Added FogExp2 with density 0.04 so the tunnel fades into the portal.', 2),
  { role: 'user', text: '', at: NOW },
] });
W(chatFile('astra-p1'), { id: 'astra-p1', agentId: 'astra', title: 'Shader ideas', updatedAt: NOW - 30 * DAY, messages: [
  msg('user', 'Try a MeshStandardMaterial with metalness 1 for chrome.', 30),
  msg('assistant', 'Chrome look: metalness 1, roughness 0.15, an HDRI for reflections.', 30),
] });
W(chatFile('claude-other'), { id: 'claude-other', agentId: 'claude', title: 'Not in the project', updatedAt: NOW, messages: [msg('user', 'bloom bloom bloom portal', 0)] });
const sketches = [
  { id: 'sk1', name: 'Clink tunnel', updatedAt: NOW - DAY, code: '', layers: [
    { id: 'L1', name: 'Tunnel rings', code: 'const rings = [];\nfor (let i = 0; i < 40; i++) {\n  const m = new THREE.Mesh(new THREE.TorusGeometry(2, 0.05), new THREE.MeshStandardMaterial({ metalness: 1 }));\n  rings.push(m);\n}\n' },
    { id: 'L2', name: 'Glow pass', code: 'composer.addPass(new UnrealBloomPass(size, 0.6, 0.4, 0.85));\n// bloom strength from the slider\n' },
  ] },
  { id: 'sk2', name: 'Portal bloom study', updatedAt: NOW - 3 * DAY, layers: [{ id: 'main', name: 'main', code: 'scene.fog = new THREE.FogExp2(0x000000, 0.04);\n' }] },
  { id: 'sk-other', name: 'Bloom elsewhere', updatedAt: NOW, layers: [{ id: 'x', name: 'bloom', code: 'bloom bloom' }] },
];
W(kvFile('three-sketches'), sketches);
W(kvFile('board-bd1'), { id: 'bd1', name: 'Clink · Moodboard', updated: NOW - DAY, items: [
  { id: 'i1', type: 'text', text: 'Neon portal at dusk, chrome edges', added: NOW - DAY },
  { id: 'i2', type: 'image', title: 'Tokyo alley reference', src: 'data:image/png;base64,AAAA', added: NOW - 2 * DAY },
  { id: 'i3', type: 'link', url: 'https://example.com/fog-study', added: NOW - 3 * DAY },
] });
W(kvFile('workbench-pj1'), { v: 1, title: 'Clink worktable', storyboard: { title: 'Opening', panels: [{ title: 'Wide tunnel', notes: 'Hold on the neon portal for two beats.', duration: 3, image: null }, { title: 'Ring close-up', notes: 'Chrome glints.', duration: 2, image: null }] },
  drawing: { prompt: 'a lantern made of glass', strokes: [{ color: '#ff0000', width: 4, points: [[1, 2]] }], color: '#ff547d', brush: 'pen' }, texture: { kind: 'cloud', color: '#b78aff' }, vst: { currentPatch: { name: 'Vital', state: 'portal portal portal' } } });
const spec = { pid: 'pj1', chats: ['claude-p1', 'astra-p1', 'claude-missing'], scenes: ['sk1', 'sk2'], boards: ['bd1'], notes: 'Deadline Friday.\nThe portal should feel like Noël lights.', description: 'A tunnel game with neon portals.',
  items: [{ type: 'file', ref: '/w/p1/portal-ref.png', name: 'portal-ref.png' }, { type: 'capture', ref: '/c/clink-12.png', name: 'clink-12.png' }, { type: 'render', ref: 'rj1', name: 'Clink render final' }, { type: 'chat', ref: 'claude-p1', name: 'ignored here' }] };

const ix = PF.createIndex();
const run = (o) => PF.run(ix, { spec, dirs, budgetMs: 1000, ...o }, env);
let r = run({});
ok('first ensure indexes every source of the project (a chat not on this computer: an empty source)', r.left === 0 && r.built === 9, r);
const q = (words, o) => run({ q: words, ...o });
const group = (res, g) => res.groups.find((x) => x.id === g) || { hits: [], total: 0 };

// ---------- 3. what is found, and where it opens ----------
r = q('bloom');
const msgs = group(r, 'chat').hits;
ok('messages: found with their place in the chat', msgs.some((h) => h.ref === 'claude-p1' && h.k === 1 && h.who === 'ai'), msgs);
ok('messages: a system note is never searched', !msgs.some((h) => h.k === 2));
ok('only this project\'s chats and scenes', !r.groups.some((g) => g.hits.some((h) => h.ref === 'claude-other' || h.ref === 'sk-other')), r.groups.map((g) => g.hits.map((h) => h.ref)));
const sc = group(r, 'scene').hits;
ok('scenes: a scene name ranks above code', sc[0]?.what === 'scene' && sc[0].ref === 'sk2', sc.map((h) => [h.what, h.ref, h.score]));
const code = sc.find((h) => h.what === 'code');
ok('scenes: layer code found with its layer and line', code && code.layer === 'L2' && code.line === 1 && /UnrealBloomPass/.test(code.snip), code);
r = q('slider bloom');
const c2 = group(r, 'scene').hits.find((h) => h.what === 'code');
ok('code: the line holding every word', c2?.line === 2 && /bloom strength from the slider/.test(c2.snip), c2);
r = q('standard');
ok('a word inside an identifier (MeshStandardMaterial)', group(r, 'scene').hits.some((h) => h.layer === 'L1' && h.line === 3) && group(r, 'chat').hits.some((h) => h.ref === 'astra-p1'), r.groups);
r = q('rings');
ok('a layer name opens that layer', group(r, 'scene').hits[0]?.what === 'layer' && group(r, 'scene').hits[0].layer === 'L1', group(r, 'scene').hits);
r = q('chrome edges');
const bh = group(r, 'board').hits[0];
ok('board note: its board and item', bh?.ref === 'bd1' && bh.item === 'i1' && bh.marks.length >= 1, bh);
r = q('tokyo');
ok('board: an image\'s title (never its picture data)', group(r, 'board').hits[0]?.item === 'i2');
r = q('AAAA');
ok('picture data is never searched', r.total === 0, r.groups);
r = q('two beats');
const wt = group(r, 'worktable').hits[0];
ok('worktable: storyboard notes open the storyboard', wt?.feature === 'story' && wt.path === 'storyboard.panels.0.notes' && wt.needle.toLowerCase() === 'two beats' && wt.title === 'Storyboard · panel 1', wt);
r = q('lantern');
ok('worktable: the drawing prompt opens the drawing', group(r, 'worktable').hits[0]?.feature === 'draw');
r = q('portal');
ok('worktable: a saved instrument patch is not words', !group(r, 'worktable').hits.some((h) => /vst/.test(h.path)), group(r, 'worktable').hits);
r = q('noel');
const nh = group(r, 'note').hits[0];
ok('notes: without accents, with the place to select', nh?.field === 'notes' && spec.notes.slice(nh.pos, nh.pos + nh.len) === 'Noël', nh);
r = q('neon portals');
ok('notes: the description too', group(r, 'note').hits.some((h) => h.field === 'description'));
r = q('clink');
const files = group(r, 'file').hits;
ok('files, captures and renders by name (chats among items are not files)', files.length === 2 && files.some((h) => h.type === 'capture') && files.some((h) => h.type === 'render') && !files.some((h) => h.ref === 'claude-p1'), files);
r = q('cafe');
ok('accents in the text match a plain query (café)', group(r, 'chat').hits[0]?.k === 0 && group(r, 'chat').hits[0].snip.includes('café'), group(r, 'chat').hits);
const mk = group(r, 'chat').hits[0];
ok('marks point at the words in the snippet', mk && mk.marks.every(([a, l]) => PF.fold(mk.snip.slice(a, a + l)) === 'cafe'), mk);
r = q('bloom zebra');
ok('every word must be there (AND)', r.total === 0);
r = q('');
ok('an empty query finds nothing', !r.groups);

// ---------- 4. ranking ----------
{
  const ix2 = PF.createIndex();
  const docs = [
    { g: 'chat', w: 1, text: 'the fog density is fine', title: 't', at: NOW - 100 * DAY, ref: 'a', k: 0 },
    { g: 'chat', w: 1, text: 'foggy morning', title: 't', at: NOW - 100 * DAY, ref: 'a', k: 1 },
    { g: 'chat', w: 1, text: 'an antifog coating', title: 't', at: NOW - 100 * DAY, ref: 'a', k: 2 },
    { g: 'chat', w: 1, text: 'density of the fog', title: 't', at: NOW - 100 * DAY, ref: 'a', k: 3 },
    { g: 'chat', w: 1, text: 'fog density again', title: 't', at: NOW, ref: 'a', k: 4 },
  ];
  ix2.put('chat:a', 'x', docs);
  const s2 = { pid: 'pz', chats: ['a'] };
  let hits = ix2.query(s2, dirs, 'fog', { now: NOW }).groups[0].hits.map((h) => h.k);
  ok('exact word above its start above inside it', hits.indexOf(0) < hits.indexOf(1) && hits.indexOf(1) < hits.indexOf(2), hits);
  hits = ix2.query(s2, dirs, 'fog density', { now: NOW }).groups[0].hits.map((h) => h.k);
  ok('the whole phrase above the same words apart; recent first among equals', hits[0] === 4 && hits[1] === 0 && hits[2] === 3, hits);
  const r3 = ix2.query(s2, dirs, 'fog', { now: NOW, limit: 2 });
  ok('limit per kind, with the true total', r3.groups[0].hits.length === 2 && r3.groups[0].total === 5 && r3.total === 5, r3.groups[0]);
}

// ---------- 5. only what changed is read again ----------
r = run({});
ok('nothing changed: nothing read again', r.built === 0 && r.left === 0, r);
const chat1 = JSON.parse(fs.readFileSync(chatFile('claude-p1'), 'utf8'));
chat1.messages.push(msg('user', 'Add a lighthouse beam sweeping the tunnel.', 0));
W(chatFile('claude-p1'), chat1); bump(chatFile('claude-p1'));
r = run({ q: 'lighthouse' });
ok('a chat saved: only it is read again, its new message found', r.built === 1 && group(r, 'chat').hits[0]?.k === 6, r);
// a Lab save that moved only a slider (same words): the file is read once, no scene indexed again
sketches[0].layers[0].opacity = 0.5; sketches[0].sliders = { spin: 0.3 };
W(kvFile('three-sketches'), sketches); bump(kvFile('three-sketches'), 4);
r = run({});
ok('scenes file changed but not their words: no scene indexed again', r.built === 0 && r.left === 0, r);
sketches[1].layers[0].code += '// lighthouse sweep\n';
W(kvFile('three-sketches'), sketches); bump(kvFile('three-sketches'), 6);
r = run({ q: 'lighthouse sweep' });
ok('one scene\'s code changed: only that scene indexed again', r.built === 1 && group(r, 'scene').hits.some((h) => h.ref === 'sk2' && h.line === 2), r);
// notes typed on the Desk (handed over by the window): read again from the spec, no file
r = PF.run(ix, { spec: { ...spec, notes: `${spec.notes}\nAsk Mia about the jellyfish.` }, dirs, budgetMs: 1000, q: 'jellyfish' }, env);
ok('notes typed (not saved yet): found at once', r.built === 1 && group(r, 'note').hits.length === 1, r);
// a save on the same millisecond: the store thread marks the file (stale)
const st0 = fs.statSync(kvFile('board-bd1'));
const b = JSON.parse(fs.readFileSync(kvFile('board-bd1'), 'utf8')); b.items.push({ id: 'i9', type: 'text', text: 'Saturn rings', added: NOW });
W(kvFile('board-bd1'), b); fs.utimesSync(kvFile('board-bd1'), st0.atime, st0.mtime);
const sizeSame = fs.statSync(kvFile('board-bd1')).size === st0.size;
ix.stale(kvFile('board-bd1'));
r = run({ q: 'saturn' });
ok('a save marked by the store thread is read again even on the same time', group(r, 'board').hits[0]?.item === 'i9', { r, sizeSame });

// ---------- 6. an arrival from the other computer (a new file on disk, written by sync) ----------
const arrived = JSON.parse(fs.readFileSync(chatFile('astra-p1'), 'utf8'));
arrived.messages.push(msg('user', 'From the Mac: try an aurora gradient in the sky.', 0)); arrived.title = 'Shader ideas (Mac)';
fs.writeFileSync(`${chatFile('astra-p1')}.tmp`, JSON.stringify(arrived)); fs.renameSync(`${chatFile('astra-p1')}.tmp`, chatFile('astra-p1')); bump(chatFile('astra-p1'), 8);
r = run({ q: 'aurora' });
ok('an arrival is found at the next find', group(r, 'chat').hits[0]?.ref === 'astra-p1' && group(r, 'chat').hits[0].title === 'Shader ideas (Mac)', r.groups);
// a chat taken out on the other computer: its file gone → nothing from it
fs.renameSync(chatFile('astra-p1'), `${chatFile('astra-p1')}.away`); bump(`${chatFile('astra-p1')}.away`);
r = run({ q: 'aurora' });
ok('a chat gone from disk: nothing found from it', r.total === 0, r.groups);
fs.renameSync(`${chatFile('astra-p1')}.away`, chatFile('astra-p1')); bump(chatFile('astra-p1'), 10);

// ---------- 7. unreadable for a moment (held / cut short): kept as it was, read next time ----------
const good = fs.readFileSync(chatFile('claude-p1'), 'utf8');
fs.writeFileSync(chatFile('claude-p1'), good.slice(0, 40)); bump(chatFile('claude-p1'), 12);
r = run({ q: 'lighthouse' });
ok('a chat cut short: its last index kept, nothing lost', group(r, 'chat').hits[0]?.k === 6, r.groups);
fs.writeFileSync(chatFile('claude-p1'), good); bump(chatFile('claude-p1'), 14);
r = run({ q: 'lighthouse' });
ok('then read again once whole', r.built === 1 && group(r, 'chat').hits[0]?.k === 6, r);

// ---------- 8. slices: a small budget moves on one source at a time ----------
{
  const ix3 = PF.createIndex();
  const seen = [];
  // (round 82, bigchat82) a source is built doc by doc now: budget 0 moves on one doc (or one source) per call
  for (let i = 0; i < 2000; i++) { const x = PF.run(ix3, { spec, dirs, budgetMs: 0 }, env); seen.push(x.left); if (!x.left) break; }
  ok('budget 0: one step per call, left goes down to 0', seen.at(-1) === 0 && seen.length >= 5 && seen.every((v, i) => i === 0 || v <= seen[i - 1]), seen.length);
  const part = PF.createIndex();
  const p1 = PF.run(part, { spec, dirs, budgetMs: 0, q: 'portal' }, env);
  ok('a query while reading: partial results and what is left', p1.left > 0 && typeof p1.total === 'number', p1);
}

// ---------- 9. letting go ----------
{
  const ix4 = PF.createIndex();
  PF.run(ix4, { spec, dirs, budgetMs: 1000 }, env);
  const before = ix4.size().sources;
  ix4.sweep(Date.now() + 16 * 60000, { keep: new Set() });
  ok('15 minutes unused: let go', before > 0 && ix4.size().sources === 0, { before, after: ix4.size() });
  const ix5 = PF.createIndex({ maxChars: 200 });
  PF.run(ix5, { spec, dirs, budgetMs: 1000 }, env);
  ix5.sweep(Date.now(), { keep: new Set(['chat:claude-p1']) });
  ok('over the size cap: the oldest let go, never the project asked', ix5.has('chat:claude-p1') && (ix5.size().chars <= 200 || ix5.keys().length === 1), ix5.keys());
}

// ---------- 10. the store thread itself (storework.js): a save marks it, the next find reads only that ----------
async function thread() {
  const w = new Worker(path.join(__dirname, '..', 'storework.js'));
  let id = 0; const jobs = new Map();
  w.on('message', ({ id: i, res, err }) => { const j = jobs.get(i); jobs.delete(i); if (err) j.reject(new Error(err)); else j.resolve(res); });
  const ask = (m) => new Promise((resolve, reject) => { const i = ++id; jobs.set(i, { resolve, reject }); w.postMessage({ ...m, id: i }); });
  try {
    let x = await ask({ op: 'projfind', spec, dirs, budgetMs: 1000 });
    ok('thread: built off the main thread', x.left === 0 && x.built >= 7, x);
    x = await ask({ op: 'projfind', spec, dirs, q: 'lighthouse' });
    ok('thread: found', x.groups?.[0]?.hits?.[0]?.k === 6, x);
    // a chat saved through the thread (as store.js saveChat does), on the same millisecond as before
    const c = JSON.parse(fs.readFileSync(chatFile('claude-p1'), 'utf8'));
    c.messages.push(msg('assistant', 'The beam now pulses with the kick drum.', 0));
    await ask({ op: 'write', file: chatFile('claude-p1'), value: c, chatDir: true });
    x = await ask({ op: 'projfind', spec, dirs, q: 'pulses kick' });
    ok('thread: a save is found at the next find (only it read again)', x.built === 1 && x.groups?.[0]?.hits?.[0]?.k === 7, x);
    x = await ask({ op: 'projfind', spec, dirs, q: 'pulses' });
    ok('thread: then nothing read again', x.built === 0, x);
  } finally { await w.terminate(); }
}

// ---------- 11. the size of the heavy fixture's Clink: building in slices, then a query ----------
function big() {
  const WORDS = 'orb particles bloom kick snare intro logo shader noise flow glitch neon chrome glass ember forge spark title beat drop bass synth camera orbit loop palette vinyl poster grain fog rain city night ocean tunnel portal crystal liquid smoke galaxy ribbon terrain ascii kinetic mask sequence render export reel Serum Vital Paris show quest'.split(' ');
  let s = 81; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pick = () => WORDS[Math.floor(rnd() * WORDS.length)];
  const sentence = (k) => Array.from({ length: k }, pick).join(' ');
  const bigSpec = { pid: 'pjbig', chats: [], scenes: [], boards: [], notes: sentence(600), description: sentence(20), items: [] };
  for (let i = 0; i < 15; i++) {
    const id = `claude-big${i}`; const nmsg = i === 0 ? 700 : 250 + Math.floor(rnd() * 650);
    W(chatFile(id), { id, agentId: 'claude', title: `Big ${i}`, updatedAt: NOW, messages: Array.from({ length: nmsg }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: k % 2 ? `Here is **${sentence(3)}**.\n\n- ${sentence(9)}\n- ${sentence(7)}\n\n${sentence(30 + Math.floor(rnd() * 80))}` : `${sentence(5 + Math.floor(rnd() * 20))}?`, at: NOW - k * 9e4 })) });
    bigSpec.chats.push(id);
  }
  const sk = Array.from({ length: 50 }, (_, i) => ({ id: `skb${i}`, name: `Scene ${i} ${sentence(2)}`, updatedAt: NOW, layers: Array.from({ length: 4 }, (_, l) => ({ id: `l${l}`, name: `${pick()} layer`, code: Array.from({ length: 120 }, (_, j) => `const v${j} = ${j}; // ${sentence(6)}`).join('\n') })) }));
  W(kvFile('three-sketches'), sk);
  bigSpec.scenes = sk.slice(0, 4).map((x) => x.id);
  for (let b = 0; b < 3; b++) { W(kvFile(`board-bdbig${b}`), { id: `bdbig${b}`, name: `Board ${b}`, items: Array.from({ length: 120 }, (_, k) => ({ id: `i${k}`, type: 'text', text: sentence(2 + (k % 10)) })) }); bigSpec.boards.push(`bdbig${b}`); }
  for (let k = 0; k < 740; k++) bigSpec.items.push({ type: ['file', 'capture', 'render'][k % 3], ref: `/w/${k}`, name: `${pick()}-${k}.png` });
  const ixb = PF.createIndex();
  const t0 = performance.now(); let calls = 0; let longest = 0; let x;
  do { const c0 = performance.now(); x = PF.run(ixb, { spec: bigSpec, dirs, budgetMs: 12 }, env); longest = Math.max(longest, performance.now() - c0); calls += 1; } while (x.left && calls < 500);
  const buildMs = performance.now() - t0;
  ok(`big project: built in slices (${calls} calls, ${Math.round(buildMs)} ms in all, longest slice ${Math.round(longest)} ms, ${x.size.docs} docs)`, x.left === 0 && calls > 3 && longest < 120, { calls, buildMs, longest, size: x.size });
  const times = [];
  for (const qq of ['bloom', 'neon portal', 'kinetic glitch shader', 'serum', 'xylophone', 'ri']) { const q0 = performance.now(); const y = PF.run(ixb, { spec: bigSpec, dirs, budgetMs: 12, q: qq }, env); times.push([qq, Math.round(performance.now() - q0), y.total]); }
  ok(`big project: every query under 100 ms (${times.map((t) => `${t[0]} ${t[1]} ms/${t[2]}`).join(', ')})`, times.every((t) => t[1] < 100), times);
}

(async () => {
  try { await thread(); } catch (err) { ok('thread ran', false, err.message); }
  big();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${n - fails}/${n} passed`);
  if (fails) { console.log(`FAIL projsearch81-test: ${fails} failed`); process.exit(1); }
})();
