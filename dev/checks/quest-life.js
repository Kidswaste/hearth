// Isolated Electron profile. Review responses are labelled fixtures, never live judgments.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async fn => { for (let i = 0; i < 160; i++) { if (await fn()) return; await wait(60); } throw Error('Life expedition UI timed out'); };
let checks = 0; const check = (ok, why) => { if (!ok) throw Error(why); checks++; };
const root = () => document.querySelector('.qj'), scope = () => root().querySelector('dialog[open]') || root();
const press = async (name, parent = scope()) => { const b = [...parent.querySelectorAll('button')].find(b => b.textContent === name); check(b, 'Button: ' + name); b.click(); await until(() => !b.disabled); await wait(80); };
const field = (name, value) => { const n = scope().querySelector(`[aria-label="${name}"]`); check(n, 'Field: ' + name); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); };
document.querySelector('#agent-buttons [data-space="life"]').click(); await until(() => root()?.querySelector('.qj-console-name')?.textContent);
const s = () => QuestJournal.snapshot(), C = QuestCore;
document.querySelectorAll('.toast').forEach(n => n.remove());
// (lifechecks70) Codex's Life redesign: the illustrated desk became three tabs; the expedition board became Find a quest
// with the Everyday-life interest (each route a card: Open → preview / Continue / Resume / Let this rest); motion moved
// into Life › Settings. The same promises are checked there.
check(root().querySelectorAll('.qj-life-nav .qj-command-tab[data-nav-group]').length === 3, 'Life keeps its three tabs (Today, Map, Progress)');
for (const n of root().querySelectorAll('.qj-session-desk,.qj-hero,.qj-life-nav')) check(getComputedStyle(n).borderLeftWidth === '1px', 'No thick left rail: ' + n.className);
const glass = root().querySelector('.qj-hero .qj-primary'); check(glass.querySelector('.qj-glint'), 'glass button has reflection layer');
const box = glass.getBoundingClientRect(); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: box.x + box.width / 2, y: box.y + box.height / 2 } });
check(getComputedStyle(glass.querySelector('.qj-glint'), '::before').animationName === 'qj-glass-sweep', 'pointer hover triggers reflection');
await smoke({ shot: window.SMOKE_SAVES + '/glass-desk.png' });
const lifeRoutes = async () => { await press('Find a quest'); const interest = root().querySelector('[aria-label="Interest"]'); interest.value = 'life'; interest.dispatchEvent(new Event('change', { bubbles: true })); await wait(80); };
const route = () => root().querySelector('[data-catalog-id="c-life-base"]');
await lifeRoutes(); check(root().querySelectorAll('[data-catalog-id^="c-life-"]').length === 6 && !s().campaigns.some(c => c.id.startsWith('c-life-')), 'six routes preview without adding obligations');
root().querySelector('.qj-content').scrollIntoView({ block: 'start' }); await wait(600); await smoke({ shot: window.SMOKE_SAVES + '/life-expeditions.png' });
await press('Open', route());
check(scope().querySelectorAll('.qj-life-brief').length === 3, 'all finish lines visible before accepting');
field('Make this expedition yours', 'My music desk / make the next demo easy'); await press('Accept expedition →');
check(s().active === 'c-life-base' && C.xp(s()) === 0 && s().sideQuests.length === 0, 'acceptance tracks route, spends no XP and uses no side slot');
await press('Open', route()); await press('Continue');
check(scope().querySelector('.qj-starting-note')?.textContent.includes('My music desk'), 'personal intention stays visible at the checkpoint');
QuestReview.run = () => ({ promise: Promise.resolve({ status: 'reviewed', score: 60, dimensions: [15,15,15,15], meetsBrief: true, summary: 'TEST FIXTURE: a concrete before/after checklist meets this small brief.', better: 'Keep the cleared area ready for the next session.', next: 'Prepare the project and headphones.', coverage: 'Pasted fixture checklist only.', limitations: 'No inspection of a real room.' }), cancel() {} });
await press('I reached the finish line →'); field('External chat link', 'https://chatgpt.com/c/life-fixture'); field('Paste the actual result from that chat', 'TEST FIXTURE: before, the laptop patch held five loose items. After, those five items were put away and the laptop patch was clear. Saved checklist of the actual small action.'); await press('Use this pasted result'); await press('Submit proof & ask Astra'); await press('Complete quest · +20 XP');
check(C.xp(s()) === 20 && C.mastery(s(), 'restart').rank === 1, 'proof review earns normal XP and life specialization credit');
root().querySelector('.qj-celebrate')?.remove(); await lifeRoutes();
const saved = s().campaigns.find(c => c.id === 'c-life-base'); check(saved.intention.includes('music desk') && route()?.textContent.includes('1 / 3 finished'), 'personal note and completed checkpoint are kept');
await press('Open', route()); check(scope().textContent.includes('✓ '), 'the route lists its finished checkpoint'); await press('Let this rest'); check(s().campaigns.find(c => c.id === saved.id).paused, 'route can rest without losing progress');
check(route().textContent.includes('Resting'), 'a resting route says so on its card');
await press('Open', route()); await press('Resume'); check(!s().campaigns.find(c => c.id === saved.id).paused && C.xp(s()) === 20, 'resume preserves XP and original route');
if (root().querySelector('dialog[open]')) scope().close(); await wait(80);
await press('Open', route()); await smoke({ shot: window.SMOKE_SAVES + '/life-checkpoints.png' }); scope().close(); await wait(80);
await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 760, height: 1000, deviceScaleFactor: 1, mobile: false } });
for (const page of ['adventure','catalog','skills','rewards','collection']) { QuestJournal.navigate(page); await wait(100); check(root().scrollWidth <= root().clientWidth + 2, page + ' has no narrow overflow'); }
await lifeRoutes(); root().querySelector('.qj-content').scrollIntoView({ block: 'start' }); await wait(600); await smoke({ shot: window.SMOKE_SAVES + '/life-narrow.png' });
await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride' });
await press('Settings'); await press('Reduce motion'); scope().close(); await wait(80); check(root().dataset.motion === 'off', 'motion toggle applies'); const card = route(); check(getComputedStyle(card).animationName === 'none', 'no new card motion while turned off');
await press('Settings'); await press('Enable motion'); scope().close(); await wait(80); await smoke({ cdp: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } });
check(getComputedStyle(route()).animationName === 'none' && getComputedStyle(root().querySelector('.qj-glint'), '::before').animationName === 'none', 'reduced-motion disables card movement and reflections');
await smoke({ cdp: 'Emulation.setEmulatedMedia', params: { features: [] } });
await QuestJournal.flush(); return `Life expeditions and glass: ${checks} checks passed.`;
//@@ reload
document.querySelector('#agent-buttons [data-space="life"]').click();
for (let i = 0; i < 160 && !document.querySelector('.qj-console-name')?.textContent; i++) await new Promise(r => setTimeout(r, 60));
const s = QuestJournal.snapshot(), c = s.campaigns.find(c => c.id === 'c-life-base');
if (!c?.intention.includes('music desk') || c.paused || QuestCore.xp(s) !== 20 || !QuestCore.done(s, 'q-life-base-clear') || !QuestCore.latest(s, 'q-life-base-clear')?.review || s.campaigns.filter(c => c.id === 'c-life-base').length !== 1) throw Error('Life expedition failed persistence after real reload');
QuestJournal.navigate('life'); return 'Personal expedition, review, XP and checkpoint state survive a real reload.';
