// Isolated Electron profile. Explicit fixture reviews; no model usage or live journal writes.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async fn => { for (let i = 0; i < 160; i++) { if (await fn()) return; await wait(60); } throw Error('Mixtape UI timed out'); };
let checks = 0;
const check = (ok, why) => { if (!ok) throw Error(why); checks++; };
const root = () => document.querySelector('.qj');
const scope = () => root().querySelector('dialog[open]') || root();
const press = async (name, parent = scope()) => { const b = [...parent.querySelectorAll('button')].find(b => b.textContent === name); check(b, 'Button: ' + name); b.click(); await until(() => !b.disabled); await wait(90); };
const change = async (name, value) => { const n = scope().querySelector(`[aria-label="${name}"]`); check(n, 'Field: ' + name); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); await QuestJournal.flush(); await wait(100); };
// (lifechecks70) Codex's Life redesign folded the mixtape into Find a quest: its cards are the "Single quest" cards there
// (Open → the same brief with its creative constraint), saved and hidden cards share the "Saved ideas & cards" fold,
// parked side quests resume from Today, and motion lives in Life › Settings. The deal / Room-to-play / passport UI is
// gone with it, so those steps are dropped; the promises (save, hide + restore, constraint, proof, park + resume, layout,
// motion, three-slot limit, persistence) are checked on the current UI.
document.querySelector('#agent-buttons [data-space="life"]').click();
await until(() => root()?.querySelector('.qj-hero'));
const s = () => QuestJournal.snapshot(), C = QuestCore;
const card = id => root().querySelector(`[data-catalog-id="${id}"]`);
const filter = async (name, value) => { const n = root().querySelector(`[aria-label="${name}"]`); check(n, 'Filter: ' + name); n.value = value; n.dispatchEvent(new Event(n.tagName === 'INPUT' ? 'input' : 'change', { bubbles: true })); await wait(80); };
const kept = () => { const f = root().querySelector('.qj-catalog-kept'); f.open = true; return f; };
await press('Find a quest'); await filter('Length', 'small');
const shown = () => [...root().querySelectorAll('.qj-catalog-card')].map(n => n.dataset.catalogId).filter(id => C.deckCard(id));
check(root().dataset.view === 'catalog' && shown().length >= 20 && card('tape-hook'), 'the mixtape cards are single quests in Find a quest');
check(root().querySelector('[data-page="catalog"]').getAttribute('aria-current') === 'page', 'Find a quest is the current Today link');
document.querySelectorAll('.toast').forEach(n => n.remove());
await smoke({ shot: window.SMOKE_SAVES + '/mixtape-wide.png' });
await press('Open', card('tape-hook')); await press('Save for later'); scope().close(); await wait(80);
check(s().deck.saved.includes('tape-hook') && C.xp(s()) === 0, 'saving card persists with no XP');
await filter('Interest', 'music'); check(shown().length && shown().every(id => C.deckCard(id).path === 'music'), 'interest filter keeps only that world\'s briefs');
check(!root().querySelector('parsererror'), 'authored mixtape and Forgeheart SVGs parse cleanly');
await smoke({ shot: window.SMOKE_SAVES + '/mixtape-forgeheart.png' });
await filter('Search quests', 'voice-note'); check(shown().length === 1 && shown()[0] === 'tape-hook', 'search finds the saved card');
await filter('Search quests', ''); await filter('Interest', 'all');
const other = shown().find(id => id !== 'tape-hook');
await press('Open', card(other)); await press('Not my thing'); await wait(80);
check(s().deck.hidden.includes(other) && !card(other), 'hidden card leaves the quest list');
await press('Restore card', kept()); check(s().deck.hidden.length === 0 && card(other), 'restore brings the card back');
await press('Open saved card', kept());
const twist = scope().querySelector('[aria-label="Add the creative constraint"]'); twist.click();
check(scope().querySelector('.qj-objective').textContent.includes(C.deckCard('tape-hook').twist), 'constraint updates actual agreed brief');
await smoke({ shot: window.SMOKE_SAVES + '/mixtape-brief.png' });
await press('Take this quest →');
const q = s().sideQuests[0]; check(q.deckTwist && q.done.includes('Creative constraint:') && C.xp(s()) === 0, 'taking locks chosen brief with no XP');
await press('I reached the finish line →');
check(scope().textContent.includes('Submit proof'), 'taken card uses proof submission'); scope().close(); await wait(80);
QuestJournal.questDetail(q.id); await press('Park this side quest'); await wait(80);
QuestJournal.navigate('adventure'); const parked = [...root().querySelectorAll('details.qj-fold')].find(f => f.textContent.includes('Parked side quests')); check(parked, 'Today lists the parked side quest'); parked.open = true;
await press('Resume', parked);
check(!s().sideQuests[0].parked && C.sideCount(s()) === 1, 'Today resumes the parked quest');
await press('Find a quest'); await filter('Length', 'small');
await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 760, height: 1000, deviceScaleFactor: 1, mobile: false } }); await wait(200);
check(root().scrollWidth <= root().clientWidth + 2, 'mixtape fits narrow panel');
check([...root().querySelectorAll('.qj-catalog-card')].every(n => n.scrollWidth <= n.clientWidth + 2), 'card text and controls fit narrow layout');
await smoke({ shot: window.SMOKE_SAVES + '/mixtape-narrow.png' });
await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride' });
await press('Settings'); await press('Reduce motion'); scope().close(); await wait(80); check(s().motion === false, 'motion can be disabled');
check(getComputedStyle(root().querySelector('.qj-catalog-card')).animationName === 'none', 'motion preference stops card animation');
QuestReview.run = () => ({ promise: Promise.resolve({ status: 'reviewed', score: 60, dimensions: [15,15,15,15], meetsBrief: true, summary: 'TEST FIXTURE: the agreed hook and constraint are documented.', better: 'TEST FIXTURE: refine one supporting note.', next: 'Export a revised supporting note.', coverage: 'Pasted fixture text only.', limitations: 'Mock review, no artistic or audio assessment.' }), cancel() {} });
QuestJournal.questDetail(q.id); await press('I reached the finish line →');
await change('External chat link', 'https://chatgpt.com/c/mixtape-fixture'); await change('Paste the actual result from that chat', 'TEST FIXTURE result: a short hook demo with exactly one supporting instrument. The actual musical content is not evaluated by this deterministic fixture.');
await press('Use this pasted result'); await press('Submit proof & ask Astra'); await press('Complete quest · +35 XP');
check(C.xp(s()) === 35 && C.done(s(), q.id) && C.mastery(s(), 'songs').count === 1, 'reviewed finish earns XP and counts toward the Sound room route');
root().querySelector('.qj-celebrate')?.remove();
await QuestJournal.flush().catch(() => {});
await press('Find a quest'); await filter('Length', 'small');
// (lifechecks70) any card opened from Find a quest can be taken, not only the ones the old mixtape had dealt
for (let i = 0; i < 3; i++) { await press('Open', root().querySelector('.qj-catalog-card')); await press('Take this quest →'); check(s().sideQuests.length === i + 2, 'a card opened in Find a quest can be taken: ' + (root().querySelector('.qj-status')?.textContent || '')); scope().close(); await wait(80); await press('Find a quest'); await filter('Length', 'small'); }
await press('Open', root().querySelector('.qj-catalog-card'));
check([...scope().querySelectorAll('button')].find(b => b.textContent === 'Take this quest →').disabled && scope().textContent.includes('three side-quest slots are full'), 'full workbench prevents accepting a fourth quest with clear recovery (' + C.sideCount(s()) + ' slots, ' + s().sideQuests.map(q => q.id).join(' ') + ')');
scope().close(); await QuestJournal.flush();
return `Mixtape: ${checks} UI checks passed (cards in Find a quest, saved/hidden cards, twist, proof, park + resume, layout, motion and the three-slot limit).`;
//@@ reload
document.querySelector('#agent-buttons [data-space="life"]').click();
for (let i = 0; i < 160 && !document.querySelector('.qj-hero'); i++) await new Promise(r => setTimeout(r, 60));
const saved = QuestJournal.snapshot();
if (!saved.deck.saved.includes('tape-hook') || saved.motion !== false || QuestCore.xp(saved) !== 35 || !saved.sideQuests.find(q => q.deckCard === 'tape-hook')?.deckTwist) throw Error('Mixtape persistence failed');
QuestJournal.navigate('deck');
const fold = document.querySelector('.qj-catalog-kept');
if (document.querySelector('.qj').dataset.view !== 'catalog' || !document.querySelectorAll('.qj-catalog-card').length || !fold?.textContent.includes(QuestCore.deckCard('tape-hook').title)) throw Error('Saved cards failed to reload in Find a quest');
return 'Mixtape survives a real Electron reload with saved card, chosen brief, progress and motion preference intact.';
