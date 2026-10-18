// (round 64, parisjournal64) My Paris in the app, on fixture records: a journal with finished place quests and a walk, a
// show night with a photo in showprep62's log, two park takes written the way parkjam62 writes them. Checks the layer's
// pins on the Paris map (photo pins, one per spot), the month filter, the timeline strip under the map, a pin → the
// moment (photo, rating, note, the loop to play), /paris month (the recap in words), the recap card (20 arrondissements,
// Paris explored), the PNG image card written in this run's folder (a real 1080×1350 PNG), nothing sent anywhere, no
// timers. Everything is done by CLICKING (owner rule: the ✦ chip, Open Sidequest Studio, Paris after hours, the My Paris
// chip, month chips, pins, dots, "My month in Paris" in the strip and in the ✦ tracker). Offline map tiles, no AI.
//   node dev/smoke.js --script dev/checks/parisjournal64.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const tmp = `${window.SMOKE_TMP || window.SMOKE_SAVES}/parisjournal64`;
// anything sent out of the window (fetch / XHR / beacon / socket to a network address) is recorded
const sent = [];
const net = (u) => /^(?:https?|wss?):/i.test(String(u)) && !/^https?:\/\/(?:127\.0\.0\.1|localhost)[:/]/i.test(String(u));
const ofetch = window.fetch; window.fetch = function (u, ...a) { if (net(u?.url || u)) sent.push(String(u?.url || u)); return ofetch.call(this, u, ...a); };
const oopen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { if (net(u)) sent.push(String(u)); return oopen.call(this, m, u, ...a); };
const obeacon = navigator.sendBeacon?.bind(navigator); if (obeacon) navigator.sendBeacon = (u, d) => { sent.push(String(u)); return obeacon(u, d); };
const OWS = window.WebSocket; window.WebSocket = function (u, p) { if (net(u)) sent.push(String(u)); return new OWS(u, p); };
// timers made by the My Paris code (by the stack)
const T = { n: 0 };
for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) { const orig = window[name]; if (!orig) continue; window[name] = function (...a) { if (/parisjournal/.test(new Error().stack || '')) T.n++; return orig.apply(this, a); }; }
// a tiny real WAV (0.1 s of quiet) and a real JPEG (a canvas)
function wav() { const n = 4800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 48000, true); v.setUint32(28, 96000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true); return new Uint8Array(b); }
async function jpeg(color) { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.fillRect(100, 60, 120, 120); const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); return new Uint8Array(await b.arrayBuffer()); }

try {
  // ---------- 1. fixture records: the journal, the show log, park takes (this month and last month) ----------
  await Lazy.load('questcore');
  const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
  const thisMonth = (d, h = 15) => new Date(Y, M, d, h).toISOString(), lastMonth = (d, h = 15) => new Date(Y, M - 1, d, h).toISOString();
  const photo1 = `${tmp}/photos/superfly.jpg`, photo2 = `${tmp}/photos/cigale.jpg`;
  await window.hub.fs.write(photo1, await jpeg('#c0396b')); await window.hub.fs.write(photo2, await jpeg('#2f7fd0'));
  const showKey = 'fixturecigale64';
  await window.hub.kvSet('show-nights', { v: 1, prep: {}, went: [{ id: `went-${showKey}`, key: showKey, show: { key: showKey, title: 'Fixture Band at La Cigale', start: Date.parse(thisMonth(1, 20)), end: null, doors: null, venue: { key: '', name: 'La Cigale', address: '120 boulevard de Rochechouart, 75018 Paris', lat: 48.8822, lon: 2.3404, url: '' }, lineup: ['Fixture Band'], links: {}, tickets: [], platforms: [] }, rating: 5, moment: 'The encore with the whole room singing', photo: { path: photo2, jpg: photo2 }, note: '', questId: '', at: thisMonth(2), updatedAt: thisMonth(2) }] });
  await Lazy.load('questjournal'); // (the show log above is read once, when the group loads)
  const C = QuestCore, P = QuestParis, K = ParisJournalCore;
  const s = C.upgrade(C.initial()); P.addGuide(s);
  const proof = (n, img, text) => ({ type: 'chat', title: 'Fixture field note ' + n, chatId: 'chat-fixture', agentId: 'astra', messageId: String(n), excerpt: text, analysis: '', coverage: 'Fixture only', images: img ? [img] : [], fingerprint: String(n).repeat(64).slice(0, 64) });
  const finish = (c, when, { img = '', text = '', upto = c.quests.length } = {}) => c.quests.slice(0, upto).forEach((q, i) => { s.records[q.id] = { startedAt: when, completedAt: when }; if (img && i === upto - 1) (s.submissions ||= {})[q.id] = [{ id: 'submission-fx' + i, at: when, proof: proof(i + 1, img, text), intent: '', brief: q.done, review: null }]; });
  finish(P.startPlace(s, 'pp-superfly'), lastMonth(12), { img: photo1, text: 'The counter played me a Brazilian record' });
  finish(P.startPlace(s, 'pp-bataclan'), thisMonth(2));
  finish(P.startPlace(s, 'pp-sainte-chapelle'), thisMonth(2), { upto: 2 }); // half done: not a moment
  const stops = ['pp-betinos', 'pp-denoyez', 'place-canal'];
  s.campaigns.push({ id: 'c-walk-fixture64', title: 'Walk: Betino’s → Rue Dénoyez → Canal Saint-Martin', subtitle: 'PARIS / WALK / 2 H', path: 'life', badge: 'Paris walker', why: 'Fixture walk.',
    walk: { v: 1, budget: 120, m: 2300, km: 2.3, total: 100, start: { id: null, name: 'Oberkampf', lat: 48.8648, lon: 2.3683, kind: 'metro', lines: [], minutes: 0 }, end: { id: null, name: 'République', lat: 48.8675, lon: 2.3637, kind: 'metro', lines: [], minutes: 0 }, stops: stops.map((x) => ({ id: x, name: P.byId(x).name, lat: P.byId(x).lat, lon: P.byId(x).lon, kind: P.byId(x).kind, lines: [], minutes: 20 })), link: 'https://www.google.com/maps/dir/?api=1' },
    quests: stops.map((x, i) => ({ id: `q-walk-fixture64-${i + 1}`, title: `${i + 1}. ${P.byId(x).name}`, done: 'Fixture stop.', tiny: 'Fixture.', deep: 'Fixture.', minutes: 30, xp: 25, tool: null, place: x })) });
  finish(s.campaigns.at(-1), thisMonth(1, 11));
  C.validate(s);
  await window.hub.kvSet('quest-journal', s);
  const sketch = 'Park sketch · Belleville · fixture', PJ = ParkJamCoreLike();
  function ParkJamCoreLike() { return { names: (place, d) => { const st = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.00`; return { loop: `${place} loop ${st}.wav`, notes: `${place} loop ${st}.json` }; } }; }
  const loops = [];
  for (const h of [14, 15]) {
    const at = thisMonth(1, h), n = PJ.names('Belleville', new Date(at));
    const loop = (await window.hub.vst.parkSave(sketch, n.loop, wav())).path; loops.push(loop);
    await window.hub.vst.parkSave(sketch, n.notes, new TextEncoder().encode(JSON.stringify({ v: 1, id: 'take-fx' + h, at, week: 'W', sketch, place: 'Belleville', bars: 8, beats: 4, bpm: 96, seconds: 20, notes: 12, instrument: 'Vital', output: 'Speakers', loop, notesPlayed: [] })));
  }
  step('fixture records written (journal valid, show log, two park takes on disk)', loops.length === 2 && loops.every(Boolean));
  step('My Paris rides in the Studio\'s lazy group (nothing on the first screen)', typeof ParisJournal === 'object' && Lazy.isIn('questjournal'));
  await ShowPrep.load();

  // ---------- 2. by clicking: the ✦ chip → Open Sidequest Studio → Paris after hours; My Paris is on by default ----------
  const click = (b, what) => { if (!b) throw Error(`no button: ${what}`); b.click(); };
  const byText = (scope, t) => [...(scope || document).querySelectorAll('button')].find((b) => b.textContent.trim() === t || b.textContent.trim().startsWith(t));
  await QuestHud.refresh(); // (setup: the tracker reads the fixture journal written above)
  await until(() => document.querySelector('#rail .qh-chip') && !document.querySelector('#rail .qh-chip').hidden, 'the ✦ chip');
  click(document.querySelector('#rail .qh-chip'), '✦ chip');
  await until(() => document.querySelector('.qh-foot [data-k="studio"]'), 'the tracker panel');
  click(document.querySelector('.qh-foot [data-k="studio"]'), 'Open Sidequest Studio');
  await until(() => root()?.querySelector('.qj-map-key') && QuestJournal.ready(), 'the Studio');
  ParisJournal._test.dir = `${tmp}/cards`; // (setup: the card goes in this run's folder, never the real Pictures folder)
  click(root().querySelector('.qj-map-key'), 'Paris after hours');
  await until(() => root()?.querySelector('.qj-atlas'), 'the Paris map');
  await until(() => root()?.querySelectorAll('.qj-atlas-pin[data-place^="mp-"]').length >= 5, 'My Paris pins (visible by default)');
  const pins = () => [...root().querySelectorAll('.qj-atlas-pin[data-place^="mp-"]')];
  const all = ParisJournal.moments(), mine = K.monthOf(Date.now());
  step('visible by default: My Paris pins on the map with no click or command', ParisJournal.prefs.on === true && pins().length === 5);
  step('moments from every record: 2 places, 1 walk, 1 show, 1 park session (half-done quests left out)', ['place', 'walk', 'show', 'park'].map((k) => all.filter((m) => m.kind === k).length).join() === '2,1,1,1', all.map((m) => m.id));
  step('one pin per spot on the map (5), drawn among the guide\'s own pins', pins().length === 5 && root().querySelectorAll('.qj-atlas-pin:not([data-place^="mp-"])').length > 20, pins().length);
  const photoPins = pins().filter((b) => b.querySelector('img.qj-atlas-logo'));
  step('moments with a photo show it on their pin (Superfly, La Cigale)', photoPins.length === 2 && photoPins.every((b) => b.querySelector('img').src.startsWith('file:')), photoPins.map((b) => b.getAttribute('aria-label')));
  // (round 64, mapfirst64) My Paris is the Visited chip of the map's one chip row (Places · Shows · My walks · Visited); without that row, the filter row's own chip
  const chipOf = () => root().querySelector('.qmf-strip [data-chip="visited"]') || root().querySelector('.qj-map-filters .pj-chip[data-chip="visited"]');
  step('one Visited / My Paris chip, pressed, with its 5 moments (no duplicate in the filter row)', /^(✓ My Paris · 5|Visited\s*5)$/.test(chipOf()?.textContent.trim()) && chipOf().getAttribute('aria-pressed') === 'true' && root().querySelectorAll('[data-chip="visited"]').length === 1, chipOf()?.textContent);
  await smoke({ shot: `${tmp}/parisjournal-map.png` });

  // ---------- 3. the timeline strip under the map, the month filter (clicks) ----------
  const strip = () => root().querySelector('.pj-strip');
  step('the timeline strip sits under the map (after it, before the footer)', Boolean(strip()) && Boolean(strip().previousElementSibling?.querySelector('.qj-atlas')) && strip().nextElementSibling?.classList.contains('qj-field-footer'));
  const chips = [...strip().querySelectorAll('.pj-month')].map((b) => b.textContent);
  step('visible month filter: All · 5, this month · 4, last month · 1', chips.length === 3 && chips[0] === 'All · 5' && /· 4$/.test(chips[1]) && /· 1$/.test(chips[2]), chips);
  step('all time: one dot per moment, and "My month in Paris" in the strip', strip().querySelectorAll('.pj-dot').length === 5 && Boolean(byText(strip(), 'My month in Paris')));
  click(strip().querySelector(`.pj-month[data-month="${mine}"]`), 'this month');
  await until(() => pins().length === 4 && root().querySelector(`.pj-month.on[data-month="${mine}"]`), 'this month only');
  step('this month: 4 pins, 4 dots (Superfly, from last month, leaves)', pins().length === 4 && root().querySelectorAll('.pj-dot').length === 4 && !pins().some((b) => /Superfly/.test(b.getAttribute('aria-label'))));
  const last = K.shiftMonth(mine, -1);
  click(root().querySelector(`.pj-month[data-month="${last}"]`), 'last month');
  await until(() => pins().length === 1, 'last month only');
  step('last month: only Superfly', /Superfly/.test(pins()[0].getAttribute('aria-label')));
  step('the month is remembered on this computer (a tiny preference)', ParisJournal.prefs.month === last && store.get('parisjournal64', {}).month === last);
  click(root().querySelector('.pj-month[data-month="all"]'), 'All'); await until(() => pins().length === 5, 'all again');

  // ---------- 4. tap a pin → the moment ----------
  click(pins().find((b) => /Cigale/.test(b.getAttribute('aria-label'))), 'the Cigale pin');
  await until(() => root().querySelector('dialog[open].pj-dialog'), 'the moment');
  let d = root().querySelector('dialog[open].pj-dialog');
  step('a show pin → the moment: its photo, 5 stars, the night\'s moment, the arrondissement', Boolean(d.querySelector('img.pj-photo')?.src.startsWith('file:')) && d.querySelector('.pj-stars')?.textContent === '★★★★★' && /whole room singing/.test(d.textContent) && /18E/.test(d.textContent), d.textContent.slice(0, 160));
  click(byText(d, '×'), 'close'); await wait(150);
  click(pins().find((b) => /Park session/.test(b.getAttribute('aria-label'))), 'the park pin');
  await until(() => root().querySelector('dialog[open].pj-dialog'), 'the park moment');
  d = root().querySelector('dialog[open].pj-dialog');
  const au = d.querySelector('audio.pj-loop');
  step('a park pin → the session: 2 loops, the newest loop to play (a file: audio), Show file', Boolean(au) && au.src.startsWith('file:') && decodeURIComponent(au.src).endsWith(loops[1].split(/[\\/]/).pop()) && /2 loops · 8 bars at 96 BPM/.test(d.textContent) && Boolean(byText(d, 'Show file')), au?.src);
  click(byText(d, '×'), 'close'); await wait(150);
  click(root().querySelector('.pj-dot.pj-walk'), 'the walk dot');
  await until(() => root().querySelector('dialog[open].pj-dialog'), 'the walk from its dot');
  d = root().querySelector('dialog[open].pj-dialog');
  step('a dot in the strip → its moment (the walk: its stops, km, Open the quest)', /Betino’s Record Shop → Rue Dénoyez → Canal Saint-Martin · 2.3 km/.test(d.textContent) && Boolean(byText(d, 'Open the quest')));
  click(byText(d, '×'), 'close'); await wait(150);
  strip().scrollIntoView({ block: 'end' }); await wait(150);
  await smoke({ shot: `${tmp}/parisjournal-strip.png` });

  // ---------- 5. "My month in Paris" (the strip's button) → the recap card ----------
  click(byText(strip(), 'My month in Paris'), 'My month in Paris');
  await until(() => root().querySelector('dialog[open].pj-recap'), 'the recap card');
  d = root().querySelector('dialog[open].pj-recap');
  const cells = [...d.querySelectorAll('.pj-cell')], lit = cells.filter((c) => c.classList.contains('lit')).map((c) => c.textContent);
  const r = ParisJournalCore.recap(ParisJournal.moments(), mine, { guide: P.guide, stamps: [] });
  step('the recap: this month, 4 tiles (1 place · 1 show · 1 walk · 1 park session), 20 arrondissement cells, 10e 11e 18e 20e lit', d.dataset.month === mine && [...d.querySelectorAll('.pj-tile b')].map((b) => b.textContent).join() === '1,1,1,1' && cells.length === 20 && lit.join() === '10e,11e,18e,20e', lit);
  step('Paris explored: a meter at the guide %, and what\'s new this month', d.querySelector('.pj-bar')?.getAttribute('aria-valuenow') === String(r.explored.pct) && r.explored.pct > 0 && /NEW THIS MONTH/.test(d.textContent) && /Le Bataclan/.test(d.textContent), r.explored);
  await smoke({ shot: `${tmp}/parisjournal-recap.png` });
  click(byText(d, `‹ ${K.monthName(last, true)}`), 'previous month');
  await until(() => root().querySelector(`dialog[open].pj-recap[data-month="${last}"]`), 'last month\'s recap');
  d = root().querySelector('dialog[open].pj-recap');
  step('‹ the month before: 1 place, the 3e new, Superfly new', [...d.querySelectorAll('.pj-tile b')].map((b) => b.textContent).join() === '1,0,0,0' && d.querySelector('.pj-cell.new')?.textContent === '3e' && /Superfly Records/.test(d.textContent));

  // ---------- 6. Save image card: drawn here, a PNG in the owner's folder (here: the run's folder), nothing sent ----------
  const sentBefore = sent.length;
  click(byText(d, 'Save image card'), 'Save image card');
  await until(() => ParisJournal._test.saved.length === 1 && /Saved in your Pictures folder/.test(d.querySelector('.pj-saved')?.textContent || ''), 'the card saved');
  const card = ParisJournal._test.saved[0], bytes = new Uint8Array(await window.hub.fs.read(card.file, { encoding: 'buffer' }));
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x), w = new DataView(bytes.buffer).getUint32(16), h = new DataView(bytes.buffer).getUint32(20);
  step('Save image card: a real PNG (1080×1350) written to the folder, named for the month, Show file beside it', isPng && w === 1080 && h === 1350 && card.file.endsWith(`My Paris ${last}.png`) && bytes.length > 20000 && Boolean(byText(d.querySelector('.pj-saved'), 'Show file')), { file: card.file.slice(-40), w, h, bytes: bytes.length });
  click(byText(d, '×'), 'close'); await wait(150);

  // ---------- 7. the ✦ tracker panel: "My month in Paris" there too ----------
  click(document.querySelector('#rail .qh-chip'), '✦ chip');
  await until(() => byText(document.querySelector('.qh-body'), '🗺 My month in Paris'), 'the tracker\'s My month in Paris');
  click(byText(document.querySelector('.qh-body'), '🗺 My month in Paris'), 'tracker: My month in Paris');
  await until(() => root().querySelector(`dialog[open].pj-recap[data-month="${mine}"]`), 'this month\'s recap from the tracker');
  d = root().querySelector('dialog[open].pj-recap');
  click(byText(d, 'Save image card'), 'Save image card (this month)');
  await until(() => ParisJournal._test.saved.length === 2, 'the second card');
  step('✦ tracker → 🗺 My month in Paris → this month\'s recap; its card saved too', ParisJournal._test.saved[1].file.endsWith(`My Paris ${mine}.png`));
  step('nothing was sent anywhere while making the cards (no fetch / XHR / beacon / socket)', sent.length === sentBefore, sent.slice(sentBefore));
  click(byText(d, '×'), 'close'); await wait(150);

  // ---------- 8. the chip hides it, the strip brings it back; idle ----------
  click(chipOf(), 'the My Paris chip');
  await until(() => pins().length === 0 && root().querySelector('.pj-strip.pj-off'), 'hidden');
  step('the chip hides My Paris (records untouched); the strip says so, with Show my Paris and My month in Paris', chipOf().getAttribute('aria-pressed') === 'false' && /5 moments kept/.test(strip().textContent) && Boolean(byText(strip(), 'My month in Paris')) && (await window.hub.kvGet('show-nights')).went.length === 1);
  click(byText(strip(), 'Show my Paris'), 'Show my Paris');
  await until(() => pins().length === 5, 'back on');
  step('Show my Paris: back on the map', chipOf().getAttribute('aria-pressed') === 'true');
  step('one /paris command (secondary), no duplicate names', Commands.get('paris')?.name === 'paris' && !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
  const t0 = T.n; await wait(1200);
  step('idle: the My Paris code runs no timers', T.n === t0, T.n - t0);
  step('nothing sent anywhere during the whole check', sent.length === 0, sent);
} catch (err) { step('the check ran to the end', false, String(err?.stack || err).slice(0, 400)); }
return JSON.stringify({ pass: !fails.length, errors: fails, ...out }, null, 1);
