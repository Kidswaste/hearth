// (round 113, search113) A small set of realistic chats and the queries the owner would type to find them, with the
// result each should give. Made up (never real data). Used by dev/search113-test.js (the store thread's chatfind over
// these + 2,000 made-up filler chats) and dev/checks/search113.js (the same queries typed into Ctrl/⌘+K on the heavy
// profile with these chats added). What they cover:
//   · the obvious chat first (its title and its messages say it), a partial word, two words in any order
//   · accents and case (café / CAFÉ / cafe, Söhne / sohne), a ligature (œuvre / oeuvre), a French elision (l'intro)
//   · pinned before unpinned and recent before old when the rest is equal
//   · a word only in the chat's title + one in its messages ("clink flicker")
//   · never: a chat in the Trash, a version sync kept aside (data/sync/trash), a .prev copy as a second row
//   · a chat that can't be read is named (unread), never silently missing
//   · each row's project (an archived project's chat: its project, marked "(archived)"; round 127)
//   · a long chat (read in slices) and a giant one (read by its bytes) land on the right message
// (a plain script too: the app check gets it in front of its body with smoke.js --lib, as S113Set)
const S113Set = (() => {
const DAY = 864e5;
const PROJECTS = [
  { id: 'pj-s113-travel', name: 'Travel', chats: ['s113-kyoto'] },
  { id: 'pj-s113-clink', name: 'Clink', chats: ['s113-intro', 's113-clink-shader'] },
  { id: 'pj-s113-old', name: 'Old archive', chats: ['s113-arch'], status: 'archived' },
];
function chats(now = Date.now()) {
  const u = (text, at) => ({ role: 'user', text, at });
  const a = (text, at) => ({ role: 'assistant', text, at, usage: { input: 900, output: 200 } });
  const t = (d) => now - d * DAY;
  return [
    { id: 's113-kyoto', agentId: 'claude', title: 'Kyoto trip plan', updatedAt: t(2), messages: [u('Plan four days in Kyoto in April: temples, a ryokan, food.', t(3)), a('Day 1: Fushimi Inari early. Stay in a ryokan near Gion; budget about ¥40,000 a night for the ryokan.', t(3)), u('Keep the ryokan budget under ¥45,000.', t(2)), a('Noted: the ryokan budget stays under ¥45,000. Kyoto in April is busy, book now.', t(2))] },
    { id: 's113-kyoto-old', agentId: 'claude', title: 'Japan ideas (old)', updatedAt: t(220), messages: [u('Someday: Tokyo, Osaka, maybe Kyoto.', t(220)), a('Osaka for food, Tokyo for everything else.', t(220))] },
    { id: 's113-cafe', agentId: 'claude', title: 'Café Oberkampf menu', updatedAt: t(9), messages: [u('Write the menu for the Café: crêpes, café crème, tartines.', t(9)), a('Menu: crêpe beurre-sucre 4 €, café crème 3,50 €, tartine du jour 6 €.', t(9))] },
    { id: 's113-oeuvre', agentId: 'claude', title: 'Expo notes', updatedAt: t(30), messages: [u('La dernière œuvre de l’artiste est au fond de la salle.', t(30)), a('Noted for the review.', t(30))] },
    { id: 's113-intro', agentId: 'claude', title: 'Intro reel typography', updatedAt: t(5), messages: [u('What font for the intro titles?', t(6)), a('Use Söhne Breit for the intro titles, Söhne Mono for the credits.', t(6)), u('Let’s go with Söhne for the intro font, decided.', t(5)), a('Done: the intro font is Söhne Breit.', t(5))] },
    { id: 's113-introfr', agentId: 'astra', title: 'Montage du teaser', updatedAt: t(12), messages: [u('On garde l’intro courte, 4 secondes, puis le logo.', t(12)), a('D’accord : l’intro courte, coupe sur le kick.', t(12))] },
    { id: 's113-shader-a', agentId: 'claude', title: 'Glass look A', pinned: true, updatedAt: t(40), messages: [u('Add a fresnel rim glow on the glass.', t(40)), a('Fresnel rim added, strength 0.6.', t(40))] },
    { id: 's113-shader-b', agentId: 'claude', title: 'Glass look B', updatedAt: t(40), messages: [u('Add a fresnel rim glow on the glass.', t(40)), a('Fresnel rim added, strength 0.6.', t(40))] },
    { id: 's113-recent', agentId: 'claude', title: 'Lens pass, new', updatedAt: t(1), messages: [u('A chromatic aberration pass on the edges.', t(1)), a('Chromatic aberration added at 0.3.', t(1))] },
    { id: 's113-old', agentId: 'claude', title: 'Lens pass, first try', updatedAt: t(300), messages: [u('A chromatic aberration pass on the edges.', t(300)), a('Chromatic aberration added at 0.3.', t(300))] },
    { id: 's113-prev', agentId: 'claude', title: 'Budget sheet', updatedAt: t(15), messages: [u('Make a spreadsheet of the gear budget.', t(15)), a('Spreadsheet: mic, interface, stands.', t(15))] },
    { id: 's113-clink-shader', agentId: 'claude', title: 'Clink', updatedAt: t(4), messages: [u('The portal shader flickers on the second loop.', t(4)), a('The flicker is a NaN in the noise: clamp before the pow.', t(4))] },
    { id: 's113-arch', agentId: 'claude', title: 'Spice rack', updatedAt: t(400), messages: [u('Tamarind paste goes in the left jar.', t(400))] },
    { id: 's113-serum', agentId: 'claude', title: 'SERUM patch bank', updatedAt: t(20), messages: [u('Sort the Serum patches by mood.', t(20)), a('Serum bank sorted: dark, bright, plucks.', t(20))] },
  ];
}
// (written by place, not by the store: a chat in the Trash, a version sync kept aside, a .prev copy, a damaged file)
function extras(now = Date.now()) {
  const m = (text) => [{ role: 'user', text, at: now - DAY }];
  return {
    trash: { id: 's113-trash', agentId: 'claude', title: 'Deleted thoughts', updatedAt: now - DAY, deletedAt: now - DAY, messages: m('A zorblax idea I deleted.') },
    aside: { id: 's113-aside', agentId: 'claude', title: 'Kept aside version', updatedAt: now - DAY, messages: m('The quimbly version sync kept aside.') },
    brokenText: '{"id":"s113-broken","agentId":"claude","title":"Broken chat","messages":[{"role":"user","text":"half writ',
  };
}
// a long chat (read in slices: ≥ 128 KB) and a giant one (read by its bytes: ≥ the giant size), each with one rare word
function longChat(id, n, at, word, now = Date.now(), pad = 40) {
  const filler = 'the render queue kept the same frame order while the export ran ';
  const messages = Array.from({ length: n }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: `${k === at ? `${word} ` : ''}${filler.repeat(pad)}step ${k}`, at: now - (n - k) * 60e3 }));
  return { id, agentId: 'claude', title: id === 's113-giant' ? 'Render log (giant)' : 'Render log (long)', updatedAt: now - 3600e3, messages };
}
// the queries: top = the chat that must come first; order = these chats in this order; once = only one row for it;
// none = no row at all; k = the message it lands on; project = the project the top row names (archived: marked so)
const QUERIES = [
  { q: 'kyoto', top: 's113-kyoto', project: 'Travel', why: 'the obvious chat first (title + messages), its project' },
  { q: 'ky', top: 's113-kyoto', why: 'two letters: the start of a word' },
  { q: 'kyot', top: 's113-kyoto', why: 'a partial word' },
  { q: 'ryokan budget', top: 's113-kyoto', why: 'two words in a message' },
  { q: 'budget ryokan', top: 's113-kyoto', why: 'the same two words in the other order' },
  { q: 'cafe', top: 's113-cafe', why: 'no accent typed: café' },
  { q: 'CAFÉ', top: 's113-cafe', why: 'capitals and an accent' },
  { q: 'creme', top: 's113-cafe', why: 'crème without its accent' },
  { q: 'oeuvre', top: 's113-oeuvre', why: 'œ typed as oe' },
  { q: 'intro font', top: 's113-intro', project: 'Clink', why: 'the decision first, with its project' },
  { q: 'font intro', top: 's113-intro', why: 'words in any order' },
  { q: 'sohne', top: 's113-intro', why: 'Söhne without its accent' },
  { q: 'intro courte', top: 's113-introfr', why: 'a French elision: l’intro' },
  { q: 'fresnel', order: ['s113-shader-a', 's113-shader-b'], why: 'pinned before unpinned' },
  { q: 'chromatic', order: ['s113-recent', 's113-old'], why: 'recent before old' },
  { q: 'zorblax', none: 's113-trash', why: 'a chat in the Trash never shows' },
  { q: 'quimbly', none: 's113-aside', why: 'a version sync kept aside never shows' },
  { q: 'spreadsheet', top: 's113-prev', once: true, why: 'a .prev copy is never a second row' },
  { q: 'clink flicker', top: 's113-clink-shader', why: 'one word in the title, one in a message' },
  { q: 'serum', top: 's113-serum', why: 'case: SERUM / Serum' },
  { q: 'tamarind', top: 's113-arch', project: 'Old archive', archived: true, why: 'an archived project’s chat: its project, “(archived)”' }, // (round 127, checksweep127)
  { q: 'xylophonic', top: 's113-giant', k: 30, why: 'a giant chat: lands on #30, read by its bytes' },
  { q: 'marmalade', top: 's113-long', k: 500, why: 'a long chat read in slices: lands on #500' },
];
// writes them into a profile folder (data/): chats/, trash/, sync/trash/…/chats/, kv/projects.json (merged with its own)
function addTo(dataDir, { now = Date.now(), giantN = 3000, giantPad = 40, fs = require('fs'), path = require('path') } = {}) {
  const W = (rel, text) => { const f = path.join(dataDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  for (const c of chats(now)) W(`chats/${c.id}.json`, JSON.stringify(c, null, 2));
  const x = extras(now);
  W('trash/s113-trash.json', JSON.stringify(x.trash, null, 2));
  W('sync/trash/2026-11-01/chats/s113-aside.json', JSON.stringify(x.aside, null, 2));
  W('chats/s113-prev.prev.json', JSON.stringify(chats(now).find((c) => c.id === 's113-prev'), null, 2));
  W('chats/s113-broken.json', x.brokenText);
  W('chats/s113-long.json', JSON.stringify(longChat('s113-long', 700, 500, 'marmalade', now, 4), null, 2));
  W('chats/s113-giant.json', JSON.stringify(longChat('s113-giant', giantN, 30, 'xylophonic', now, giantPad), null, 2));
  const pf = path.join(dataDir, 'kv', 'projects.json');
  let data = { v: 1, list: [], dismissed: [] };
  try { data = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch { /* none yet */ }
  data.list = (data.list || []).filter((p) => !String(p.id).startsWith('pj-s113-'));
  for (const p of PROJECTS) {
    // (a profile that has a project of that name already, like the heavy one's Clink with its workspace: its chats join it)
    const had = data.list.find((x) => x.name === p.name && x.status !== 'archived');
    if (had) { for (const id of p.chats) if (!had.items.some((x) => x.ref === id)) had.items.push({ id: `chat:${id}`, type: 'chat', ref: id, name: '', at: now - DAY }); continue; }
    data.list.push({ id: p.id, name: p.name, from: 'hand', notes: '', cover: null, make: null, status: p.status || 'active', at: now - 30 * DAY, opened: now - DAY, updated: now - DAY,
      ident: { ci: 1, color: '#7fb8ff', gi: 1, glyph: '●' }, items: p.chats.map((id) => ({ id: `chat:${id}`, type: 'chat', ref: id, name: '', at: now - DAY })) });
  }
  W('kv/projects.json', JSON.stringify(data));
}
return { PROJECTS, QUERIES, chats, extras, longChat, addTo, DAY };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = S113Set;
