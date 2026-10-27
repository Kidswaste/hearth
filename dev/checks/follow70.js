// (round 70, follow70) ★ Follow in the real app, on a throwaway profile, offline: showsync61's saved sample shows
// (dev/fixtures/showsync through shows:test; no network) and a seeded "Shows I went to" log (Floating Points twice at
// Petit Bain). By clicking only: the ✦ Shows list's "★ Following" (suggestions from the nights you went to, one-click
// ★ Follow, Follow by name), a show card's "★ Follow <artist>" / "★ Follow <venue>" (click again: unfollow), the ★ on
// the list's rows and on the map's venue pins; then a LATER sync ("Refresh now", the same sync as always, with a saved
// page that has two new shows: a followed artist in a b2b 18 days ahead, a new night at a followed venue) → the ✦ quest
// tracker's "★ New: Call Super at Petit Bain, Sat 14 Nov" rows: Bring someone (the invite card), Dismiss, Make it a quest
// (Codex's journal valid). Following itself fetches nothing; the follow code is not on the first screen.
//   node dev/smoke.js --script dev/checks/follow70.js
const atlasImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...atlasImageSource, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.tileFixture = String(value); queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } atlasImageSource.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const errors = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 300) : JSON.stringify(info).slice(0, 300)}`}`); if (!ok) errors.push(name); };
const said = [];
const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: () => {}, error: (t) => said.push('ERROR ' + t) }); await until(() => said.some((t) => !/^Reading/.test(t)), line, 250); return said.filter((t) => !/^Reading/.test(t)).join('\n'); };
const dialogs = () => [...document.querySelectorAll('dialog.qj-dialog[open]')];
const top = () => dialogs().at(-1) || null;
const label = (b) => (b.querySelector('.qj-action-text')?.textContent ?? b.textContent).trim();
const btnIn = (root, re) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(label(b)));
const vis = (n) => Boolean(n && !n.hidden && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/follow70-${n}.png` });
const kv = async (k) => (await window.hub.kvGet(k, null, { status: true }))?.value || null;
const closeAll = async () => { for (let i = 0; i < 6 && top(); i++) { top().close(); await wait(40); } };
const DICE = 'https://dice.fm/browse/paris-5b23e8a0e63cc224a4c36a2d';
let asks = 0; const realAsk = window.hub.askOnce; window.hub.askOnce = (...a) => { asks++; return realAsk(...a); };

try {
  step('the follow code is not on the first screen', typeof Follow === 'undefined' && typeof FollowCore === 'undefined' && !Lazy.isIn('follow'));
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable: ' + JSON.stringify(t));

  // ---------- fixtures: a journal (the ✦ chip) and "Shows I went to": Floating Points twice at Petit Bain ----------
  await Lazy.load('questcore'); await Lazy.load('questjournal');
  step('it rides with the Studio’s show code', Lazy.isIn('follow') && typeof FollowHook !== 'undefined');
  const C = QuestCore; await window.hub.kvSet('quest-journal', C.validate(C.upgrade(C.initial())));
  const day = 86400e3, night = (key, lineup, venue, ago) => ({ show: { key, title: lineup.join(' + '), start: Date.now() - ago * day, venue: { name: venue, address: 'Paris' }, lineup, tickets: [] }, moment: 'one good moment', rating: 4 });
  await window.hub.kvSet('show-nights', ShowPrepCore.validate({ v: 1, prep: {}, went: [ShowPrepCore.entry(night('f70went01', ['Floating Points'], 'Petit Bain', 40)), ShowPrepCore.entry(night('f70went02', ['Floating Points (DJ set)', 'Four Tet'], 'Petit Bain', 12)), ShowPrepCore.entry(night('f70went03', ['Koze'], 'Rex Club', 5))] }));
  await until(() => typeof QuestHud !== 'undefined', 'the tracker'); await QuestHud.refresh();
  await run('/shows'); // the one sync of the saved sample responses (the main process caches the list)
  const hits0 = (await window.hub.shows.test({ report: true })).value?.hits?.length;

  // ---------- 1. ✦ Shows this week › ★ Following: suggestions from the nights you went to ----------
  activate('tool:quests');
  await until(() => QuestJournal.ready?.(), 'journal ready');
  QuestJournal.navigate('world');
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  await until(() => btnIn(top(), /^★ Following/), 'the ★ Following button in the shows list'); await wait(300); // the list draws twice (saved list, then fresh)
  const fol = await until(() => { const b = btnIn(top(), /^★ Following/); return b?.isConnected && vis(b) ? b : null; }, 'the ★ Following button on screen');
  step('the shows list: a labelled "★ Following" button', vis(fol), label(fol));
  fol.click();
  const fd = await until(() => document.querySelector('dialog.fw-dialog[open]'), 'the Following dialog');
  await until(() => fd.querySelector('.fw-sug'), 'suggestions');
  const sug = [...fd.querySelectorAll('.fw-sug')].map((r) => r.dataset.name);
  step('suggested from Shows I went to: two nights or more (Floating Points, Petit Bain), not one-night ones', sug.includes('Floating Points') && sug.includes('Petit Bain') && !sug.includes('Koze') && !sug.includes('Four Tet'), sug);
  step('empty state says where to click', /Click ★ Follow on a show’s card/.test(fd.textContent));
  await shot('following-empty');
  btnIn(fd, /^★ Follow Floating Points$/).click();
  await until(() => [...fd.querySelectorAll('.fw-item')].some((r) => /Floating Points/.test(r.textContent)), 'Floating Points followed');
  btnIn(fd, /^★ Follow Petit Bain$/).click();
  await until(() => [...fd.querySelectorAll('.fw-item')].some((r) => /Petit Bain/.test(r.textContent)), 'Petit Bain followed');
  step('one click each: both in Following, gone from the suggestions', !fd.querySelector('.fw-sug'), [...fd.querySelectorAll('.fw-item strong')].map((x) => x.textContent));
  // anyone else, by name: a venue
  const input = fd.querySelector('.fw-name input'), kind = fd.querySelector('.fw-name select');
  input.value = 'cigale'; kind.value = 'venue'; btnIn(fd, /^★ Follow$/).click();
  const cig = await until(() => [...fd.querySelectorAll('.fw-item')].find((r) => /Cigale/i.test(r.textContent)), 'Cigale followed by name');
  step('Follow by name (a venue): the listing’s spelling, its listed show counts as coming up', /La Cigale/.test(cig.querySelector('strong').textContent) && /venue · 1 coming up/.test(cig.textContent) && !!btnIn(cig, /Arlo Parks/), cig.textContent);
  let st = await kv('show-follows');
  step('saved (kv show-follows): 3 follows, nothing "new" for shows already listed', st?.follows?.length === 3 && st.news.length === 0, { follows: st?.follows?.map((f) => f.name), news: st?.news?.length });
  await shot('following');
  await closeAll();

  // ---------- 2. a show card: ★ Follow <artist> · ★ Follow <venue> ----------
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  (await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /Ben UFO/.test(r.textContent)), 'Ben UFO row')).click();
  const callSuper = await until(() => btnIn(top(), /^★ Follow Call Super$/), 'the card’s ★ Follow Call Super');
  const row = callSuper.closest('.fw-row');
  step('the card: ★ Follow for each artist and the venue, labelled', [...row.querySelectorAll('button')].map(label).join('|') === '★ Follow Ben UFO|★ Follow Call Super|★ Follow La Machine du Moulin Rouge' && vis(row), [...row.querySelectorAll('button')].map(label));
  callSuper.click();
  await until(() => label(callSuper) === '★ Following Call Super', 'relabelled');
  step('click: "★ Following Call Super" (pressed), a toast', callSuper.getAttribute('aria-pressed') === 'true' && /Following Call Super · 1 show already listed/.test(document.body.textContent), label(callSuper));
  await shot('card');
  await closeAll();

  // ---------- 3. the ★ on the list and on the map ----------
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  const ufoRow = await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /Ben UFO/.test(r.textContent)), 'Ben UFO row (2)');
  const others = [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].filter((r) => /Bon Entendeur/.test(r.textContent));
  step('the list: ★ on the show with someone you follow, not on others', !!ufoRow.querySelector('.fw-badge') && others.every((r) => !r.querySelector('.fw-badge')) && /you follow Call Super/.test(ufoRow.getAttribute('aria-label')), ufoRow.getAttribute('aria-label'));
  step('the button says how many you follow', /^★ Following · 4$/.test(label(btnIn(top(), /^★ Following/))), label(btnIn(top(), /^★ Following/)));
  await closeAll();
  const pins = ShowSync.layer.pins({}), starred = pins.filter((p) => p.favorite).map((p) => p.name);
  step('the map: the venue pins with a followed show wear ★ (La Machine, La Cigale), others not', starred.some((n) => /Machine/.test(n)) && starred.some((n) => /Cigale/.test(n)) && !starred.some((n) => /Bataclan|Trabendo/.test(n)), starred);
  QuestJournal.navigate('world');
  const pinStar = await until(() => document.querySelector('.qj-atlas-pin .qj-pin-star'), 'a ★ pin on the map', 80).catch(() => null);
  step('drawn on the map', !!pinStar, pinStar?.closest('.qj-atlas-pin')?.title);
  const hits1 = (await window.hub.shows.test({ report: true })).value?.hits?.length;
  step('following fetched nothing (the sync’s page count unchanged)', hits1 === hits0, { hits0, hits1 });

  // ---------- 4. a later sync brings new shows ("Refresh now": the same sync, its saved page now has two more) ----------
  await window.hub.shows.test({ dev: window.SMOKE_DEV, overrides: { [DICE]: { file: 'follow70-dice-paris.html', headers: { 'content-type': 'text/html' } } } });
  await window.hub.shows.test({ advance: 11 * 60e3 }); // past the sync's own 10-minute floor
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  (await until(() => btnIn(top(), /^Refresh now$/), 'Refresh now')).click();
  st = await until(async () => { const v = await kv('show-follows'); return v?.news?.length >= 2 ? v : null; }, 'the news saved');
  const cs = st.news.find((n) => /Call Super/.test(n.text)), jw = st.news.find((n) => /Jessie Ware/.test(n.text));
  step('two new shows: a followed artist in a b2b 18 days ahead (any date), a new night at a followed venue', !!cs && !!jw && st.news.length === 2 && cs.show.start > Date.now() + 15 * day, st.news.map((n) => n.text));
  step('the words: "<artist> at <venue>, <day> <date> <month>" in Paris time', /^Call Super at Petit Bain, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/.test(cs.text) && /^Jessie Ware at Cigale, /.test(jw.text), [cs.text, jw.text]);
  const newRow = await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /CALL SUPER b2b Objekt/i.test(r.textContent)), 'the new show in the list (look ahead)', 60).catch(() => null)
    || (btnIn(top(), /^Next 7 days/)?.click(), await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /CALL SUPER b2b Objekt/i.test(r.textContent)), 'the new show in the list (6 months)'));
  step('the new show has its ★ in the list', !!newRow.querySelector('.fw-badge'), newRow.textContent);
  await closeAll();

  // ---------- 5. the ✦ quest tracker: ★ New rows ----------
  QuestHud.close(); await QuestHud.open();
  const rows = await until(() => { const r = [...document.querySelectorAll('.qh-panel .fw-hud')]; return r.length === 2 ? r : null; }, 'two ★ New rows');
  const csRow = rows.find((r) => r.dataset.show === cs.key), jwRow = rows.find((r) => r.dataset.show === jw.key);
  step('the tracker: "★ New: Call Super at Petit Bain, …" with Make it a quest · Bring someone · Dismiss', vis(csRow) && csRow.querySelector('.qh-row-title').textContent === `New: ${cs.text}` && csRow.querySelector('.qh-pi').textContent === '★'
    && jwRow.querySelector('.qh-sub').textContent === 'At a venue you follow' && ['Make it a quest', 'Bring someone', 'Dismiss'].every((w) => [...csRow.querySelectorAll('button')].some((b) => b.textContent === w)), csRow?.textContent);
  step('the chip wears a small ★ and says why', document.querySelector('.qh-chip')?.classList.contains('qh-fw-new') && /new shows? from artists \/ venues you follow/.test(document.querySelector('.qh-chip').title), document.querySelector('.qh-chip')?.title);
  await shot('tracker');
  // Dismiss
  jwRow.querySelector('.fw-hud-dismiss').click();
  await until(() => document.querySelectorAll('.qh-panel .fw-hud').length === 1, 'Dismiss removes the row');
  step('Dismiss: the row goes (you still follow La Cigale)', (await kv('show-follows')).news.find((n) => n.key === jw.key)?.dismissedAt && (await kv('show-follows')).follows.some((f) => /cigale/i.test(f.name) && !f.removedAt));
  // Bring someone → the invite card (drafts only)
  document.querySelector('.qh-panel .fw-hud-bring').click();
  const iv = await until(() => document.querySelector('dialog.iv-dialog[open]'), 'the invite card');
  const ivText = iv.querySelector('.iv-text')?.value || '';
  step('Bring someone: the invite card for that show (venue, ticket link)', /Petit Bain/.test(ivText) && ivText.includes('https://dice.fm/event/f70a-call-super-objekt'), ivText.slice(0, 160));
  iv.close(); await wait(60);
  // Make it a quest
  QuestHud.close(); await QuestHud.open();
  (await until(() => document.querySelector('.qh-panel .fw-hud-quest'), 'Make it a quest')).click();
  const camp = await until(async () => (await kv('quest-journal'))?.campaigns?.find((c) => c.id === `c-show-${cs.key}`), 'the show quest saved');
  const qj = await kv('quest-journal');
  step('Make it a quest: "Go see … at Petit Bain" in the journal, the row goes', /Go see .* at Petit Bain/.test(camp.title) && !!(await kv('show-follows')).news.find((n) => n.key === cs.key)?.questAt, camp?.title);
  step('Codex’s journal still validates', (() => { try { C.validate(qj); return true; } catch (e) { return e.message; } })() === true);
  QuestHud.close(); await QuestHud.open(); await wait(150);
  step('no ★ New rows left, the chip’s ★ goes', !document.querySelector('.qh-panel .fw-hud') && !document.querySelector('.qh-chip')?.classList.contains('qh-fw-new'));
  QuestHud.close();

  // ---------- 6. Unfollow (the Following list) and the card's toggle ----------
  QuestJournal.navigate('world');
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  (await until(() => btnIn(top(), /^★ Following/), '★ Following')).click();
  const fd2 = await until(() => document.querySelector('dialog.fw-dialog[open]'), 'the Following dialog (2)');
  const cigItem = await until(() => [...fd2.querySelectorAll('.fw-item')].find((r) => /Cigale/.test(r.textContent)), 'cigale item');
  btnIn(cigItem, /^Unfollow$/).click();
  await until(() => ![...fd2.querySelectorAll('.fw-item')].some((r) => /Cigale/.test(r.textContent)), 'unfollowed');
  step('Unfollow from the Following list', (await kv('show-follows')).follows.find((f) => /cigale/i.test(f.name))?.removedAt);
  await closeAll();
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  (await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /Ben UFO/.test(r.textContent)), 'Ben UFO row (3)')).click();
  const cs2 = await until(() => btnIn(top(), /^★ Following Call Super$/), 'the card remembers');
  cs2.click(); await until(() => label(cs2) === '★ Follow Call Super', 'unfollowed on the card');
  step('the card’s button unfollows too', cs2.getAttribute('aria-pressed') === 'false');
  await closeAll();

  // ---------- 7. chat (secondary) ----------
  const r1 = await run('/shows follow Overmono');
  const r2 = await run('/shows following');
  const r3 = await run('/shows unfollow overmono');
  step('/shows follow <name> · following · unfollow <name> (a link still follows a page)', /★ Following Overmono \(artist\)/.test(r1) && /Overmono/.test(r2) && /Stopped following Overmono/.test(r3), [r1, r2.split('\n')[0], r3]);
  step('no AI call', asks === 0, asks);
} catch (err) {
  step('no exception', false, err.stack || err.message);
}
window.hub.askOnce = realAsk;
return JSON.stringify({ pass: !errors.length, errors, ...out }, null, 1);
