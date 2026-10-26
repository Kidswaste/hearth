// parisquests61: the Paris guide on Codex's map, driven from chat and from the map. Isolated profile, offline map
// tiles (no OSM traffic), no purchase, booking, message or model turn.
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = ms => new Promise(r => setTimeout(r, ms)), until = async (fn, what = 'condition') => { for (let i = 0; i < 200; i++) { if (await fn()) return; await wait(50); } throw Error('Timed out: ' + what); };
let checks = 0; const check = (ok, msg) => { if (!ok) throw Error(msg); checks++; };
const root = () => document.querySelector('.qj'), scope = () => root().querySelector('dialog[open]') || root(), state = () => QuestJournal.snapshot();
const pins = () => root().querySelectorAll('.qj-atlas-pin').length;
const opened = []; window.hub.openExternal = url => { opened.push(url); };
const agent = H.claudeAgent().id;
async function cmd(line) { const said = [], errors = []; await Commands.tryRun(line, agent, null, { say: t => said.push(String(t)), note: t => said.push(String(t)), error: t => errors.push(String(t)) }); await wait(120); if (errors.length) throw Error(line + ' → ' + errors.join(' | ')); return said.join('\n'); }
const press = async (name, parent = scope()) => { const b = [...parent.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent.trim() === name); check(b, 'Button ' + name); b.click(); await until(() => !b.disabled, name); await wait(80); };
const P = () => window.QuestParis, guideNew = () => P().guide.filter(g => g.id.startsWith('pp-')).length;
// (questfix65) Codex's quieter Paris map (65b428c): the default shows its picks (food stops, record shops, a few outdoor stops: QuestParis.mapPicks)
// plus the familiar clubs; the whole guide comes with the strip's More places or /quest paris. Its category is a select now.
const picks = () => P().guide.filter(g => P().mapPicks.has(g.id)).length;
const category = async v => { const n = root().querySelector('[aria-label="Place category"]'); check(n, 'Place category'); n.value = v; n.dispatchEvent(new Event('change', { bubbles: true })); await wait(150); };

// 0. (round 64, mapfirst64) no command: opening the Studio's map shows the guide's places by default (stored once)
await Lazy.load('questjournal');
activate('tool:quests'); await until(() => root() && QuestJournal.ready(), 'journal'); QuestJournal.navigate('world');
await until(() => root().querySelectorAll('.qj-atlas-pin.qj-pin-guide').length >= Math.min(10, picks()), 'guide pins by default');
check(state().atlas.places.length === 6 + picks(), 'the guide’s picks are on the map with no command (' + state().atlas.places.length + ')');
check([...root().querySelectorAll('.qj-atlas-pin.qj-pin-guide:not([data-place^="ml-"])')].every(b => P().mapPicks.has(b.dataset.place)), 'the default map shows only the picks'); // (round 66, mapbuttons66) ml-… = the Park jams / place quests layer (not journal pins), on by default
check(root().querySelector('.qmf-strip [data-layer="places"][aria-pressed="true"]'), 'Places chip on by default');
// 1. chat drives the map: /quest paris adds the guide once and opens the map
check(Commands.get('quest'), '/quest registered');
// (round 61, questhud61) one /quest: bare /quest is the tracker's; its Paris words (help, paris, add…) pass through
const help = await cmd('/quest help'); check(/\/quest paris/.test(help) && /\/quest add/.test(help), 'help lists the subcommands');
let out = await cmd('/quest paris');
await until(() => root()?.querySelector('.qj-atlas'), 'map open');
check(/Paris guide on your map/.test(out), 'paris reply: ' + out);
check(state().atlas.places.length === 6 + guideNew(), 'guide pins stored once (' + state().atlas.places.length + ')');
await until(() => pins() > 20, 'pins drawn'); const allPins = pins();
check(allPins >= 30, 'guide pins render on the map (' + allPins + ')');
check(root().querySelector('.qj-paris-guide'), 'one Paris guide button in the map footer');
await cmd('/quest paris'); check(state().atlas.places.length === 6 + guideNew(), 'running it again adds nothing');

// 2. filters: a guide word from chat, the chip clears it; Codex's kind filters still work on guide pins
out = await cmd('/quest paris shows');
const shows = P().guide.filter(g => P().matches(g, 'show')).length;
await until(() => pins() <= shows, 'shows filter'); check(pins() > 3 && pins() <= shows, 'shows filter narrows the pins (' + pins() + '/' + shows + ')');
check(root().querySelector('.qj-paris-chip'), 'filter chip shown'); check(/for “shows”/.test(out), 'reply names the filter');
await cmd('/quest paris 11e'); check([...root().querySelectorAll('.qj-atlas-pin')].every(b => P().byId(b.dataset.place)?.arr === 11), 'arrondissement filter');
root().querySelector('.qj-paris-chip').click(); await wait(150); check(!root().querySelector('.qj-paris-chip'), 'chip clears the filter');
await until(() => pins() >= allPins - 2, 'all pins back');
await category('music'); check(pins() >= 12, 'Codex kind filter includes guide music places'); await category('all');
const search = root().querySelector('[aria-label="Find a saved place"]'); search.value = 'records'; search.dispatchEvent(new Event('input', { bubbles: true })); await until(() => pins() === 4, 'search narrows the pins').catch(() => {}); // (lifechecks70) Codex's smoother search updates the map on the next frame (pins diffed), not within 150 ms
check(pins() === 4, 'search finds guide words (records: ' + pins() + ')'); search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); await until(() => pins() >= allPins - 2, 'search cleared');
const list = await cmd('/quest places records'); check(list.split('\n').length === 4 && /Superfly/.test(list) && /Dizonord/.test(list), 'places lists in chat');

// 3. a pin's panel shows the guide note and starts its go → do → proof quest
root().querySelector('.qj-atlas-pin[data-place="pp-bataclan"]').click(); await until(() => /Le Bataclan/.test(root().querySelector('.qj-field-place-head')?.textContent || ''), 'bataclan selected');
check(root().querySelector('.qj-paris-note') && /11e/.test(root().querySelector('.qj-paris-note').textContent), 'guide note with arrondissement');
await press('Start this quest', root()); // (round 64, mapfirst64) the panel's quest card
await until(() => state().campaigns.some(c => c.id === 'c-pp-bataclan'), 'place quest saved');
const bat = state().campaigns.find(c => c.id === 'c-pp-bataclan'); check(bat.quests.length === 3 && state().active === bat.id, 'three steps, tracked');
check(root().querySelector('dialog[open]'), 'the first step opens'); scope().close(); await wait(100);
check(QuestCore.xp(state()) === 0, 'starting awards nothing');

// 4. steps progress through the journal's own proof + review gate (fixture review, no model call)
const qid = bat.quests[0].id;
await QuestJournal.paris.mutate(s => { const item = QuestCore.submit(s, qid, { type: 'chat', title: 'Fixture', chatId: 'chat-fixture', agentId: 'astra', messageId: '1', excerpt: 'TEST FIXTURE', analysis: '', coverage: 'Fixture', images: [], fingerprint: 'b'.repeat(64) }); QuestCore.saveReview(s, qid, item.id, { status: 'reviewed', meetsBrief: true, score: 60, dimensions: [15, 15, 15, 15], summary: 'F', better: 'F', next: 'F', coverage: 'F', limitations: 'F' }); QuestCore.complete(s, qid); });
check(QuestCore.xp(state()) === 20, 'step one pays its XP after review');
out = await cmd('/quest list'); check(/Le Bataclan: 1\/3 · next:/.test(out), '/quest list shows step progress: ' + out);
QuestJournal.navigate('world'); await wait(150); root().querySelector('.qj-atlas-pin[data-place="pp-bataclan"]')?.click(); await wait(200);
check([...root().querySelectorAll('.qj-paris-start')].some(b => /Continue: Hear how/.test(b.textContent)), 'panel names the next step');
if (root().querySelector('dialog[open]')) scope().close();

// 5. personal quests from chat
out = await cmd('/quest add airpods');
check(state().campaigns.some(c => c.id === 'c-pq-airpods') && state().atlas.places.some(p => p.id === 'pp-apple-opera'), 'AirPods quest + Apple Opéra pin');
check(/Check stock/.test(out), 'reply lists the steps: ' + out); if (root().querySelector('dialog[open]')) scope().close();
out = await cmd('/quest add drink'); check(/Offer, then accept any answer/.test(out), 'drink quest steps'); if (root().querySelector('dialog[open]')) scope().close();
out = await cmd('/quest go canal'); check(state().campaigns.some(c => c.id === 'c-pp-canal') && /Canal Saint-Martin/.test(out), '/quest go canal'); if (root().querySelector('dialog[open]')) scope().close();
out = await cmd('/quest add nothing-like-this'); check(/Add one of/.test(out), 'unknown personal quest is explained');
const comp = Commands.get('quest').complete('add a'); check(comp.some(x => x.value === 'add airpods'), 'completion for add');
check(Commands.get('quest').complete('go bat').some(x => x.value === 'go bataclan'), 'completion for go');

// 6. the guide dialog (footer) lists personal quests and filters
QuestJournal.navigate('world'); await wait(150); await press('Paris guide', root());
check(scope().querySelectorAll('[data-personal]').length === P().personal.length, 'personal quest cards');
check(/In notebook/.test(scope().querySelector('[data-personal="airpods"]').textContent), 'started quest shows progress');
await press('Parks'); await wait(150); check(root().querySelector('.qj-paris-chip') && pins() >= 4 && pins() < allPins, 'guide dialog filter');
root().querySelector('.qj-paris-chip').click(); await wait(120);

// 7. music at the park: the workbench sketch is named after the park
out = await cmd('/quest park belleville');
check(/Park sketch · Belleville/.test(out), 'park reply: ' + out);
await until(() => H.activeId === 'tool:creative', 'workbench open');
check(/^Park sketch · Belleville/.test(WorkbenchUI.snapshot().title), 'worktable named after the park');
check(state().campaigns.find(c => c.id === 'c-pq-park')?.parisPlace === 'pp-belleville-view', 'park quest pinned to Belleville');

// 8. guide off keeps what matters; narrow layout keeps the map usable
activate('tool:quests'); await wait(200);
out = await cmd('/quest guide off'); check(/untouched guide pins taken off/.test(out), out);
check(['pp-bataclan', 'pp-apple-opera', 'place-canal', 'pp-belleville-view'].every(id => state().atlas.places.some(p => p.id === id)), 'quest pins stay');
await cmd('/quest guide on'); check(state().atlas.places.length >= 6 + guideNew(), 'guide back on');
const host = root().closest('.surface') || root().parentElement; const old = host.style.width; host.style.width = '420px'; await wait(250);
check(root().scrollWidth <= root().clientWidth + 2, 'no sideways scroll at a narrow width'); host.style.width = old;
check(!opened.length, 'nothing opened in the browser on its own');
return JSON.stringify({ checks, pins: allPins, xp: QuestCore.xp(state()) });
