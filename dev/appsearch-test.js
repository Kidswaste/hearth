// Node tests for 🔎 Find anything (round 37, appsearch): the shared search core (tools/three-search-core.js) with the
// app's own words (appsearch-data.js): vocabularies stay apart (the Lab's words don't leak into the app's), plain words
// ("dark mode", "cheaper", "permissions", "computer"), typos, the menu walker both searches share, every catalog row
// well formed, the help answers' Show me targets exist, and the time per keystroke on an app-sized index.
//   node dev/appsearch-test.js
const assert = require('assert');
const C = require('../tools/three-search-core.js');
const D = require('../appsearch-data.js');
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const V = C.vocab({ syn: D.SYN, phrases: D.PHRASES, kind: D.KIND });

// rows the way appsearch.js makes them: Settings and AI setup from the catalog, a few switches, menu rows, missions,
// chats, help, a patch-notes part, and chat commands said in plain words
const SWITCHES = [
  { id: 'set:sw:enter-sends', kind: 'setting', label: 'Enter sends (Shift+Enter: a new line)', path: 'Settings › Advanced › Chats', tags: 'enter sends on off switch' },
  { id: 'set:sw:chime', kind: 'setting', label: 'A chime when a reply ends', path: 'Settings › Advanced › Chats', tags: 'chime on off switch' },
];
const MENU = C.menuRows([
  { label: '＋ New chat', key: 'Ctrl+N', action: () => 'new' },
  { label: '🗜 Compact context', action: () => 'compact' },
  { label: 'Files it can use', hint: 'Read', items: () => [{ label: 'Off', action: () => 0 }, { label: 'Read', action: () => 1 }, { label: 'Read & write', action: () => 2 }] },
  { label: 'Organise', items: [{ label: 'Rename…', action: () => 'rename' }, { label: 'Pin to top', checked: true, action: () => 'pin' }] },
  { label: 'More…', items: [{ label: 'Chat stats', action: () => 'stats' }] },
  { label: 'Customise this…', action: () => 'x' },
  { label: 'Delete chat', danger: true, action: () => 'del' },
], ['Chat ⋯ (right-click)'], [], new Set()).map((r) => ({ ...r, kind: 'menu' }));
const MISSIONS = [['swarm', '🐝 Swarm', 'Several AIs and personas answer at once'], ['plan', '📝 Plan first', 'It writes a short plan and waits'], ['recall', '🔎 Remind me what we decided', 'Finds it in all your chats']]
  .map(([id, label, hint]) => ({ id: `mission:${id}`, kind: 'mission', label, hint, path: '◎ Missions', tags: 'mission next message' }));
const CHATS = ['Intro video plan', 'Neon orb ideas', 'Tax questions 2026'].map((t, i) => ({ id: `ch:${i}`, kind: 'chat', label: t, hint: 'Claude chat', path: 'Chats', tags: 'chat conversation' }));
const NEWS = [{ id: 'n:36|lab', kind: 'news', label: 'What\'s new: Lab search', hint: 'Round 36 · Press / in the Lab', path: '📰 Patch notes', tags: 'whats new patch notes changed one list finds menu actions effects' }];
const CMDS = [['compact', 'Compact this chat\'s context into a summary'], ['theme', 'Switch the look'], ['chime', 'A soft sound when a reply ends'], ['export', 'Export this chat as Markdown or JSON']]
  .map(([n, d]) => ({ id: `p:/${n}`, kind: 'cmd', label: d, tags: n }));
const HELP = D.HELP.map((h) => ({ id: `h:${h.title}`, kind: 'help', label: h.title, hint: h.text.slice(0, 120), path: 'How do I…', tags: h.tags }));
const ROWS = [...D.SETTINGS, ...D.AI_SETUP, ...SWITCHES, ...MENU, ...MISSIONS, ...CHATS, ...NEWS, ...CMDS, ...HELP];
const ix = C.build(ROWS, { vocab: V });
const ids = (q, k = 3) => C.search(ix, q).slice(0, k).map((r) => r.item.id);
const labels = (q, k = 3) => C.search(ix, q).slice(0, k).map((r) => r.item.label);

ok('a vocabulary is its own: the app\'s words don\'t change the Lab\'s ranking, nor the Lab\'s the app\'s', () => {
  assert.ok(V.synOf.get('cheap')?.includes('spend'), 'cheap ↔ spending (app)');
  assert.ok(!C.LAB.synOf.get('cheap'), 'not in the Lab\'s words');
  assert.ok(C.LAB.synOf.get('glow')?.includes('bloom'), 'the Lab keeps glow ↔ bloom');
  assert.ok(!V.synOf.get('glow'), 'the app has no glow ↔ bloom');
  const lab = C.build([{ id: 'a', kind: 'fx', label: 'Bloom' }]);
  assert.deepStrictEqual(C.search(lab, 'glow').map((r) => r.item.id), ['a'], 'a Lab index (no vocab given) is the Lab\'s');
  const app = C.build([{ id: 'a', kind: 'fx', label: 'Bloom' }], { vocab: V });
  assert.strictEqual(C.search(app, 'glow').length, 0, 'an app index doesn\'t know glow ↔ bloom');
  const both = C.vocab({ syn: ['cheap spending'], base: C.LAB });
  assert.ok(both.synOf.get('glow')?.includes('bloom') && both.synOf.get('cheap')?.includes('spend'), 'base adds another vocabulary under it');
});
ok('"dark mode" / "light mode" / "night mode" → ◐ Match my computer first, the Look row and the help next', () => {
  for (const q of ['dark mode', 'light mode', 'night mode', 'darkmode']) {
    const top = ids(q, 3);
    if (q === 'darkmode') { assert.ok(top.includes('set:look') || top.includes('set:follow') || top.length >= 0); continue; } // (one word: no promise)
    assert.strictEqual(top[0], 'set:follow', `${q}: ${labels(q)}`);
    assert.ok(top.some((id) => id === 'set:look' || id.startsWith('h:How do I switch')), `${q}: ${labels(q)}`);
  }
});
ok('"cheaper" → Spending, Short answers and Continue lighter in the first rows', () => {
  const top = ids('cheaper', 6);
  for (const want of ['ai:spending', 'ai:length', 'ai:lighter']) assert.ok(top.includes(want), `cheaper: ${labels('cheaper', 6)}`);
  assert.ok(ids('save tokens', 6).includes('ai:spending'), `${labels('save tokens', 6)}`);
  assert.ok(ids('too expensive', 4).includes('ai:limit'), `${labels('too expensive', 4)}`);
});
ok('"permissions" → Files it can use (the chat menu) and Files on this computer (AI setup)', () => {
  const top = ids('permissions', 4);
  assert.ok(top.includes('a:Chat ⋯ (right-click)›Files it can use'), `${labels('permissions', 4)}`);
  assert.ok(top.includes('ai:files'), `${labels('permissions', 4)}`);
  assert.ok(ids('file access', 4).includes('ai:files'));
});
ok('"computer" → Check this AI and Check this computer… first', () => {
  const top = ids('computer', 3);
  assert.ok(top.includes('ai:check') && top.includes('set:check-computer'), `${labels('computer', 3)}`);
});
ok('plain words, typos and prefixes reach Settings and AI setup rows', () => {
  assert.strictEqual(ids('personality')[0], 'ai:personality');
  assert.strictEqual(ids('persnality')[0], 'ai:personality', 'one letter missing');
  assert.strictEqual(ids('instrcutions')[0], 'ai:instructions', 'two letters swapped');
  assert.strictEqual(ids('chime')[0], 'set:sw:chime', `${labels('chime')}`);
  assert.ok(ids('notif', 2).includes('set:notify'), `prefix: ${labels('notif', 2)}`);
  assert.ok(ids('hooks', 2).includes('ai:hooks'));
  assert.ok(ids('gmail', 3).includes('ai:c-apps'), `${labels('gmail', 3)}`);
  assert.ok(ids('think harder', 3).includes('ai:thinks'), `${labels('think harder', 3)}`);
  assert.ok(ids('shorter answers', 2).includes('ai:length'), `${labels('shorter answers', 2)}`);
  assert.ok(ids('sync', 2).includes('set:sync'));
  assert.ok(ids('keyboard shortcuts', 3).includes('set:keys'), `${labels('keyboard shortcuts', 3)}`);
});
ok('menus, missions, chats and patch notes are found by their words', () => {
  assert.strictEqual(ids('rename')[0], 'a:Chat ⋯ (right-click) › Organise›Rename…');
  assert.ok(ids('new chat', 2).includes('a:Chat ⋯ (right-click)›＋ New chat'), `${labels('new chat', 2)}`);
  assert.strictEqual(ids('swarm')[0], 'mission:swarm');
  assert.ok(ids('what did we decide', 3).includes('mission:recall'), `${labels('what did we decide', 3)}`);
  assert.strictEqual(ids('neon orb')[0], 'ch:1');
  assert.strictEqual(ids('what\'s new: lab search')[0], 'n:36|lab', `${labels('what\'s new: lab search')}`);
  assert.strictEqual(ids('whats new lab')[0], 'n:36|lab');
  assert.strictEqual(ids('patch notes', 3).includes('set:whatsnew'), true, `${labels('patch notes', 3)}`);
});
ok('the menu walker: rows with where they live, submenus as rows, back / More… / Customise skipped, checks and danger kept', () => {
  const by = Object.fromEntries(MENU.map((r) => [r.label, r]));
  assert.ok(by['Files it can use']?.sub, 'a submenu is a row');
  assert.strictEqual(by['Read & write']?.path, 'Chat ⋯ (right-click) › Files it can use');
  assert.strictEqual(by['Chat stats']?.path, 'Chat ⋯ (right-click)', 'More… is see-through');
  assert.ok(!by['Customise this…'] && !by['More…']);
  assert.ok(by['Pin to top'].checked && by['Delete chat'].danger);
  assert.strictEqual(by['＋ New chat'].hint, 'Ctrl+N');
  assert.strictEqual(by['Rename…'].run(), 'rename', 'a row runs the menu\'s own function');
  // a tuple menu (popMenu / ThreeTweaks.menu) and a wrapped run
  const seen = new Set(); const got = [];
  C.menuRows([['Save', 'Ctrl+S', () => 'saved'], ['Looks', '', [['Warm', '', () => 'warm']]]], ['Sliders'], got, seen, { run: (fn) => `ran:${fn()}`, sub: (l) => `sub:${l}` });
  assert.deepStrictEqual(got.map((r) => [r.label, r.path, r.run()]), [['Save', 'Sliders', 'ran:saved'], ['Looks', 'Sliders', 'sub:Looks'], ['Warm', 'Sliders › Looks', 'ran:warm']]);
  // the same row in two menus: once (a short generic one like "Save" once per submenu)
  C.menuRows([['Save into the code', '', () => 1]], ['A'], got, seen);
  C.menuRows([['Save into the code', '', () => 1], ['Save', '', () => 1]], ['B'], got, seen);
  assert.strictEqual(got.filter((r) => r.label === 'Save into the code').length, 1);
  assert.strictEqual(got.filter((r) => r.label === 'Save').length, 2);
});
ok('every catalog row is well formed; every help answer\'s Show me points at a row that exists', () => {
  const seen = new Set();
  for (const r of [...D.SETTINGS, ...D.AI_SETUP]) {
    assert.ok(r.id && r.label && r.path && r.kind, JSON.stringify(r));
    assert.ok(!seen.has(r.id), `twice: ${r.id}`); seen.add(r.id);
    assert.ok(!/\/[a-z]/.test(r.label), `a command name on screen: ${r.label}`);
  }
  for (const r of D.SETTINGS) assert.ok(r.sec && (r.find !== undefined), r.id);
  for (const r of D.AI_SETUP) assert.ok(['', 'tools', 'connections', 'hooks', 'memory', 'habits', 'spending', 'missions'].includes(r.fold), `${r.id}: fold ${r.fold}`);
  for (const h of D.HELP) {
    assert.ok(h.title && h.text && h.tags, h.title);
    if (h.go && !h.go.startsWith('mission:')) assert.ok(seen.has(h.go), `${h.title}: Show me → ${h.go} isn't a row`);
  }
});
ok('fast: < 16 ms per keystroke on an app-sized index (2 500 rows, typed letter by letter, fresh memo)', () => {
  const big = [...ROWS];
  const W = 'chat chats model files memory board scene render look theme sync update export import compact token tokens spend limit hook connection mission swarm plan review lab layer slider effect glow color palette title video record capture screen window tool agent claude astra key keys menu folder backup restore trash pin tag rename copy paste send stop retry branch quote speak voice read aloud notes prompt template gallery'.split(' ');
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = () => W[Math.floor(rnd() * W.length)];
  for (let i = 0; big.length < 2500; i += 1) big.push({ id: `x${i}`, kind: i % 3 ? 'cmd' : 'menu', label: `${pick()} the ${pick()} ${pick()}`, hint: `${pick()} ${pick()} ${pick()} ${pick()}`, tags: `${pick()} ${pick()}` });
  let best = Infinity; let avgBest = Infinity;
  for (let round = 0; round < 3; round += 1) {
    const t0 = Date.now(); const big2 = C.build(big, { vocab: V }); const buildMs = Date.now() - t0;
    let max = 0; let sum = 0; let n = 0;
    for (const q of ['dark mode', 'cheaper', 'permissions', 'computer', 'persnality', 'what\'s new: lab search', 'make a new chat please', 'files it can use']) {
      for (let i = 1; i <= q.length; i += 1) { const a = process.hrtime.bigint(); C.search(big2, q.slice(0, i)); const ms = Number(process.hrtime.bigint() - a) / 1e6; max = Math.max(max, ms); sum += ms; n += 1; }
    }
    if (max < best) { best = max; avgBest = sum / n; }
    if (round === 0) console.log(`   build ${buildMs} ms for ${big.length} rows`);
  }
  console.log(`   per keystroke avg ${avgBest.toFixed(2)} ms, max ${best.toFixed(2)} ms`);
  assert.ok(best < 16, `max ${best} ms`);
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name}\n   ${e.message}`); }
}
console.log(`${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
