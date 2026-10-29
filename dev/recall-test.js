// Recall (round 30, recall-core.js): the ranking of "what did we decide about X?" over a few seeded chats, the
// snippets and their groups (decisions / open questions / mentions), incremental swaps, and a timing on a big index.
//   node dev/recall-test.js
const R = require('../recall-core.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const NOW = Date.UTC(2026, 9, 13);
const DAY = 86400e3;
const msg = (role, text, daysAgo, more = {}) => ({ role, text, at: NOW - daysAgo * DAY, ...more });
const chats = {
  intro: { id: 'c-intro', agentId: 'claude', title: 'Intro video', updatedAt: NOW - 2 * DAY, messages: [
    msg('user', 'What font should the intro titles use? Maybe Inter or Söhne.', 20),
    msg('assistant', 'Inter is free and reads well at small sizes; Söhne is paid. Both work for the intro.', 20),
    msg('user', "Let's go with Inter for the intro titles, bold, tracking -2%.", 19),
    msg('assistant', 'Done: the intro titles now use Inter Bold.\n```js\nconst font = "Söhne"; // old\n```', 19),
    msg('user', 'Should we add a logo sting at the end of the intro? Not sure yet.', 2),
  ] },
  shaders: { id: 'c-shaders', agentId: 'claude', title: 'Bloom shader', updatedAt: NOW - 40 * DAY, messages: [
    msg('user', 'The bloom is too strong on the orb.', 40),
    msg('assistant', 'I lowered bloom strength to 0.6 and the threshold to 0.85.', 40),
    msg('user', 'We decided to keep bloom at 0.6 from now on.', 40),
  ] },
  music: { id: 'c-music', agentId: 'astra', title: 'Beat sync', updatedAt: NOW - 1 * DAY, pinned: true, messages: [
    msg('user', 'For the beat sync, use the kick for the cuts instead of the snare.', 1),
    msg('assistant', 'Switched the cuts to the kick. The snare drives the flashes.', 1),
    msg('user', 'And the font in the lyric layer, Inter too?', 1),
  ] },
  noise: { id: 'c-noise', agentId: 'claude', title: 'Random', updatedAt: NOW - 5 * DAY, messages: [
    msg('user', 'Tell me about fonts in general, any fonts.', 5),
    msg('assistant', 'Fonts come in serif and sans families; fonts fonts fonts.', 5),
    msg('error', 'intro font decided', 5),
  ] },
};
const texts = new Map();
const idx = R.createIndex();
for (const [k, c] of Object.entries(chats)) { idx.add(k, c, c); texts.set(k, c.messages.map((m) => m.text)); }
const textOf = (key, i) => texts.get(key)?.[i] || '';
const ask = (q, o = {}) => idx.search(q, { textOf, now: NOW, ...o });

// ---------- words ----------
ok('stems: plural and -ing', R.stem('shaders') === 'shader' && R.stem('titles') === 'titl' && R.stem('flashing') === 'flash');
ok('decide / decided / decides land together', R.stem('decided') === R.stem('decide'));
ok('code blocks are not indexed', !R.tokens('use it\n```js\nconst sohneFont = 1\n```').includes('sohnefont'));
ok('the question keeps only what matters', JSON.stringify(R.questionTerms('What did we decide about the intro font?')) === JSON.stringify(['intro', 'font']), R.questionTerms('What did we decide about the intro font?'));
ok('only scaffolding: falls back to its words', R.questionTerms('what did we decide?').length > 0);
ok('questions are spotted', R.isQuestion('what did we decide about bloom') && R.isQuestion('intro font?') && R.isQuestion('did we pick a font') && !R.isQuestion('bloom') && !R.isQuestion('intro font'));

// ---------- ranking ----------
const font = ask('What did we decide about the intro font?');
ok('the decision comes first', font.decisions[0]?.chatId === 'c-intro' && /go with Inter/.test(font.decisions[0].snippet), font.decisions[0]);
ok('it points at the right message', font.decisions[0]?.k === 2);
ok('the open question is grouped apart', font.open.some((h) => h.chatId === 'c-intro' && /logo sting|Söhne/.test(h.snippet)), font.open);
ok('a chat that only says "fonts" a lot ranks below', !font.decisions.some((h) => h.chatId === 'c-noise'));
ok('error rows are not indexed', ![...font.decisions, ...font.open, ...font.mentions].some((h) => h.chatId === 'c-noise' && h.k === 2));
const bloom = ask('bloom strength?');
ok('an old decision is still found', bloom.decisions[0]?.chatId === 'c-shaders' && /0\.6/.test(bloom.decisions[0].snippet), bloom);
const kick = ask('what did we pick for the cuts');
ok('"use X instead" is a decision', kick.decisions[0]?.chatId === 'c-music' && /kick/.test(kick.decisions[0].snippet), kick);
ok('snippets are short and plain', [...font.decisions, ...font.open, ...font.mentions].every((h) => h.snippet.length <= 202 && !/[`*#]/.test(h.snippet)));

// recency and marks
const twin = (id, daysAgo, more = {}) => ({ id, agentId: 'claude', title: 'Palette', updatedAt: NOW - daysAgo * DAY, ...more, messages: [msg('user', "Let's go with the teal palette for the posters.", daysAgo)] });
const i2 = R.createIndex(); const t2 = new Map();
for (const c of [twin('old', 90), twin('new', 1)]) { i2.add(c.id, c); t2.set(c.id, c.messages.map((m) => m.text)); }
let r = i2.search('which palette for the posters', { textOf: (k, i) => t2.get(k)[i], now: NOW });
ok('newer wins a tie', r.decisions[0]?.chatId === 'new', r.decisions);
i2.add('old', { ...twin('old', 90), messages: [msg('user', "Let's go with the teal palette for the posters.", 90, { bookmark: true })] });
r = i2.search('which palette for the posters', { textOf: (k, i) => t2.get(k)[i], now: NOW });
ok('a bookmarked message beats recency', r.decisions[0]?.chatId === 'old', r.decisions);

// ---------- incremental ----------
const before = idx.size();
idx.add('shaders', { ...chats.shaders, messages: chats.shaders.messages.slice(0, 1) }, 'v2'); texts.set('shaders', chats.shaders.messages.slice(0, 1).map((m) => m.text));
ok('a changed chat is swapped in place', idx.size().messages === before.messages - 2 && idx.has('shaders', 'v2') && !idx.has('shaders', chats.shaders));
ok('its old decision is gone', !ask('bloom strength').decisions.length);
idx.drop('shaders');
ok('a deleted chat is dropped', idx.size().chats === before.chats - 1 && !ask('bloom').mentions.length);
ok('per chat: two at most per group', (() => { const x = ask('intro'); const per = {}; return [...x.decisions, ...x.open, ...x.mentions].every((h) => (per[`${h.chatId}${h.kind}`] = (per[`${h.chatId}${h.kind}`] || 0) + 1) <= 2); })());

// ---------- size / speed ----------
const big = R.createIndex(); const bt = new Map();
const vocab = 'orb bloom kick snare intro font palette teal title layer shader particle camera lens grain glow beat cut fade logo sting poster render export loop sequence slider color noise wave'.split(' ');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const t0 = Date.now();
for (let c = 0; c < 400; c++) {
  const messages = Array.from({ length: 60 }, (_, i) => msg(i % 2 ? 'assistant' : 'user', Array.from({ length: 40 }, () => vocab[Math.floor(rnd() * vocab.length)]).join(' ') + (i === 30 && c === 123 ? ". Let's go with the purple glow for the logo sting." : ''), rnd() * 200));
  big.add(`k${c}`, { id: `b${c}`, agentId: 'claude', title: `Chat ${c}`, updatedAt: NOW, messages }); bt.set(`k${c}`, messages.map((m) => m.text));
}
const built = Date.now() - t0;
const t1 = Date.now();
const hit = big.search('what did we decide for the purple glow on the logo sting?', { textOf: (k, i) => bt.get(k)[i], now: NOW });
const took = Date.now() - t1;
console.log(`  (24,000 messages: built in ${built} ms, answered in ${took} ms, ${big.size().terms} terms)`);
ok('the needle in 24,000 messages', hit.decisions[0]?.chatId === 'b123' && hit.decisions[0].k === 30, hit.decisions[0]);
ok('answers fast', took < 400, took);
// (round 34, lightweight) packed: ≈ 8 bytes a posting in typed arrays (the first layout was ≈ 100: a Map of arrays per chat)
big.trim();
const bytes = big._bytes();
console.log(`  (index: ${Math.round(bytes / 1024)} KB of typed arrays)`);
ok('the index stays small', bytes < 400 * 60 * 32 * 9, bytes);
// a term in many chats survives one of them going (df once counted chats coming and messages going)
for (let c = 0; c < 10; c++) big.drop(`k${c}`);
ok('a term still counts after chats that had it are dropped', big.search('purple glow logo sting', { textOf: (k, i) => bt.get(k)[i], now: NOW }).decisions[0]?.chatId === 'b123');
for (let c = 10; c < 300; c++) big.add(`k${c}`, { id: `b${c}`, agentId: 'claude', title: `Chat ${c}`, updatedAt: NOW, messages: bt.get(`k${c}`).map((t, i) => msg(i % 2 ? 'assistant' : 'user', t, 1)) }, `v2-${c}`);
ok('saved again and again: old postings swept, the same answer', big._bytes() < bytes * 1.6 && big.size().messages === 390 * 60 && big.search('purple glow logo sting', { textOf: (k, i) => bt.get(k)[i], now: NOW }).decisions[0]?.chatId === 'b123', { bytes: big._bytes(), size: big.size() });

// (round 83, idleburst83) kept between starts: snapshot() → createIndex(buffer) answers the same, knows each chat's src
// (a changed chat is read again), takes changes after it, and a damaged / foreign file is refused (built again instead)
{
  const snap = big.snapshot({ spans: [['k1', '1:2', [0, 5]]] });
  const back = R.createIndex(snap);
  const q = (ix) => ix.search('purple glow logo sting', { textOf: (k, i) => bt.get(k)[i], now: NOW });
  const a = q(big); const b = q(back);
  ok('kept between starts: the same answer, sizes and srcs', JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(big.size()) === JSON.stringify(back.size()) && back.has('k50', 'v2-50') && !back.has('k50', 'v3-50') && back.extra().spans?.[0]?.[0] === 'k1', { a: a.decisions[0], b: b.decisions[0], sa: big.size(), sb: back.size() });
  back.add('k123', { id: 'b123', agentId: 'claude', title: 'Chat 123', updatedAt: NOW, messages: [msg('user', 'nothing about it any more', 1)] }, 'v3-123');
  back.add('knew', { id: 'bnew', agentId: 'claude', title: 'New', updatedAt: NOW, messages: [msg('user', "Let's go with the teal grain for the poster.", 1)] }, 'v1');
  ok('a kept index takes changes after it', !q(back).decisions.some((d) => d.chatId === 'b123') && back.search('teal grain poster?', { textOf: (k) => (k === 'knew' ? "Let's go with the teal grain for the poster." : bt.get(k)?.[0] || ''), now: NOW }).decisions[0]?.chatId === 'bnew');
  let refused = 0; for (const bad of [Buffer.from('nope'), Buffer.concat([snap.subarray(0, 40), Buffer.alloc(10)])]) { try { R.createIndex(bad); } catch { refused += 1; } }
  ok('a damaged or foreign file is refused (the index is built again)', refused === 2, refused);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
