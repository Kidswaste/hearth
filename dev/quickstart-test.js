// "What can I do here?" (round 31, quickstart-core.js): the picking — per window, what's on screen first, what you
// used drops off, what this build lacks never shows, 3–5 at most, "not for me", where the card belongs, once by itself.
//   node dev/quickstart-test.js
const Q = require('../quickstart-core.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const ids = (list) => list.map((e) => e.id);

// ---- the catalog ----
ok('every entry has a known place, a label, a why and an icon', Q.CATALOG.every((e) => Q.PLACES.includes(e.place) && e.label && e.why && e.icon), Q.CATALOG.filter((e) => !e.label || !e.why).map((e) => e.id));
ok('ids are unique', new Set(Q.CATALOG.map((e) => e.id)).size === Q.CATALOG.length);
for (const p of Q.PLACES) ok(`${p}: at least 5 things to try`, Q.CATALOG.filter((e) => e.place === p).length >= 5);
ok('plain words: no /command in a label or why', Q.CATALOG.every((e) => !/(^|\s)\/[a-z]/.test(`${e.label} ${e.why}`)), Q.CATALOG.filter((e) => /(^|\s)\/[a-z]/.test(`${e.label} ${e.why}`)).map((e) => e.id));

// ---- context first ----
const song = Q.pick('lab', { song: true, director: true, empty: false, layers: 2 });
ok('a song loaded → "React to the drums" first', song[0]?.id === 'lab-drums', ids(song));
ok('…and it is marked as fitting what is on screen', song[0]?.fit === true);
ok('3–5 on the card', song.length >= 3 && song.length <= 5, song.length);
const empty = Q.pick('lab', { song: false, director: true, empty: true, layers: 1 });
ok('an empty scene → Describe it, then the gallery', ids(empty).slice(0, 2).join() === 'lab-describe,lab-gallery', ids(empty));
ok('an empty scene: nothing that needs a scene (polish, variations, history)', !ids(empty).some((x) => ['lab-polish', 'lab-variations', 'lab-history'].includes(x)), ids(empty));
ok('no song: no drums, but "Load a song"', !ids(empty).includes('lab-drums') && ids(Q.pick('lab', { empty: false, layers: 2, director: true })).includes('lab-song'));
ok('no director: no Lab missions', !ids(Q.pick('lab', { song: true, director: false, empty: false, layers: 2 }, { n: 20 })).some((x) => ['lab-drums', 'lab-variations', 'lab-vertical'].includes(x)));
const pics = Q.pick('board', { items: 12, pictures: 9, linked: true, director: true });
ok('a board with pictures → "Find images like this" first', pics[0]?.id === 'board-pins', ids(pics));
ok('a linked board: no "Link it to a chat"', !ids(pics).includes('board-link'));
const blank = Q.pick('board', { items: 0, pictures: 0 });
ok('an empty board → Add first, then a template', ids(blank).slice(0, 2).join() === 'board-add,board-template', ids(blank));
ok('an empty board: no vibe to read', !ids(blank).includes('board-vibe'));
const long = Q.pick('chat', { messages: 60, partner: true, boards: 1, chats: 9 });
ok('a long chat → "What did we decide?" first', long[0]?.id === 'chat-recall', ids(long));
ok('a long chat → a fresh chat is offered', ids(long).includes('chat-fresh'));
const fresh = Q.pick('chat', { messages: 0, partner: false, boards: 0, chats: 1 });
ok('a new chat: no recall / fresh / find', !ids(fresh).some((x) => ['chat-recall', 'chat-fresh', 'chat-find'].includes(x)), ids(fresh));
ok('a new chat: plan first and a personality are up top', ids(fresh).slice(0, 3).includes('chat-plan') && ids(fresh).slice(0, 3).includes('chat-setup'), ids(fresh));
ok('no Astra: no "side by side"', !ids(Q.pick('chat', { messages: 4, partner: false }, { n: 20 })).includes('chat-duo'));
ok('places never mix', Q.PLACES.every((p) => Q.pick(p, {}, { n: 50 }).every((e) => e.place === p)));

// ---- what you used drops off ----
const c = { song: true, director: true, empty: false, layers: 2 };
ok('a command you ran drops it (stems)', !ids(Q.pick('lab', c, { sig: { counts: { stems: 2 } } })).includes('lab-drums'));
ok('a button in the click log drops it', !ids(Q.pick('lab', c, { sig: { usage: ['Menus › Make it look finished'] } })).includes('lab-polish'));
ok('a mission seen in this chat drops it', !ids(Q.pick('lab', c, { sig: { missions: ['lab-stems'] } })).includes('lab-drums'));
ok('tried from the card drops it', !ids(Q.pick('lab', c, { sig: { tried: ['lab-drums'] } })).includes('lab-drums'));
ok('a count of 0 is not "used"', ids(Q.pick('lab', c, { sig: { counts: { stems: 0 } } })).includes('lab-drums'));
ok('"Not for me" hides it', !ids(Q.pick('lab', c, { hide: ['lab-drums'] })).includes('lab-drums'));
ok('the next ones move up', Q.pick('lab', c, { sig: { tried: ['lab-drums'] } })[0]?.id === 'lab-react');
const all = Q.CATALOG.filter((e) => e.place === 'board').map((e) => e.id);
ok('everything tried → an empty card', Q.pick('board', { items: 0 }, { sig: { tried: all } }).length === 0);
ok('a plan mission in another chat does not count here (only this chat\'s)', ids(Q.pick('chat', { messages: 0 }, { sig: { missions: [] } })).includes('chat-plan'));

// ---- what this build has ----
ok('a missing feature never shows', !ids(Q.pick('lab', c, { has: (g) => g !== 'Missions', n: 20 })).some((x) => ['lab-drums', 'lab-variations', 'lab-vertical'].includes(x)));
ok('nothing in the build → nothing', Q.pick('chat', { messages: 50 }, { has: () => false }).length === 0);
ok('a throwing context reads as "no"', Q.pick('lab', { get song() { throw new Error('x'); } }, { n: 20 }).every((e) => e.place === 'lab'));
ok('n caps the card', Q.pick('chat', { messages: 50, partner: true, boards: 2 }, { n: 3 }).length === 3);

// ---- where it belongs, once by itself ----
ok('the Lab', Q.placeOf('tool:three') === 'lab');
ok('the Lab director\'s docked chat is the Lab', Q.placeOf('a1', { mode: 'native', dock: 'three' }) === 'lab');
ok('the board', Q.placeOf('tool:board') === 'board');
ok('a chat with an AI', Q.placeOf('a2', { mode: 'native' }) === 'chat');
ok('a website agent / other tools: no card', Q.placeOf('a3', { mode: 'web' }) === null && Q.placeOf('tool:commands') === null);
ok('first time: by itself', Q.shouldAuto('lab', {}) === true);
ok('seen: never again by itself', Q.shouldAuto('lab', { seen: { lab: 1 } }) === false);
ok('dismissed: gone for good', Q.shouldAuto('board', { gone: { board: true } }) === false);
ok('one window seen does not hide another', Q.shouldAuto('chat', { seen: { lab: 1 } }) === true);

// ---- speed ----
const t0 = process.hrtime.bigint();
for (let i = 0; i < 2000; i++) Q.pick('lab', c, { sig: { usage: Array.from({ length: 300 }, (_, k) => `Area › control ${k}`), counts: { a: 1 } } });
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 2000;
ok(`a pick with a 300-key click log takes < 1 ms (${ms.toFixed(3)} ms)`, ms < 1);

console.log(`\n${n - fails}/${n} passed`);
if (fails) { console.log('FAIL'); process.exit(1); }
