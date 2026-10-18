// (round 62, showprep62) The show night companion in the real app, on showsync61's saved sample responses
// (dev/fixtures/showsync through the shows:test IPC: no network). Checks /shows prep (times, Métro, routes, listen links,
// calendar link), the show card's "Get ready" card (lineup links, the .ics file in Paris time), the reminder (armed in
// the main process only while switched on; when it goes: through Hearth's notifications), "How was it?" (the log, the
// moment as the show quest's proof with NO AI, then — asked — Astra's check finishing the quest's steps; Astra is a
// stub here), a photo, /shows log, the visited badges on the Paris map (also a venue that isn't on this week's list),
// following the artist / venue in showsync61, and the show quest's own "Get ready / How was it?".
//   node dev/smoke.js --script dev/checks/showprep62.js
const atlasImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...atlasImageSource, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.tileFixture = String(value); queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } atlasImageSource.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const errors = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 300) : JSON.stringify(info).slice(0, 300)}`}`); if (!ok) errors.push(name); };
const said = []; const notes = [];
const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: (t, o) => notes.push({ t: String(t), o }), error: (t) => said.push('ERROR ' + t) }); await until(() => said.some((t) => !/^Reading/.test(t)), line, 250); return said.filter((t) => !/^Reading/.test(t)).join('\n'); };
const dlg = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1) || null; // the topmost one
const btn = (re, root = dlg()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test((b.querySelector('.qj-action-text')?.textContent ?? b.textContent).trim()));
const closeAll = () => document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close());
const shot = (n) => smoke({ shot: `${window.SMOKE_SAVES}/showprep62-${n}.png` });

try {
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable: ' + JSON.stringify(t));
  await run('/shows'); // loads this week's list from the fixtures
  step('ShowPrep loaded with the Studio group', typeof ShowPrep !== 'undefined' && typeof ShowPrepCore !== 'undefined');

  // ---------- /shows prep ----------
  const prep = await run('/shows prep ben ufo');
  // times are shown in Paris time whatever the computer's zone (the fixtures are written in the computer's own)
  const ufo = ShowSync.upcoming().find((s) => /Ben UFO/.test(s.title)), P = ShowPrepCore, T = { doors: P.hm(ufo.doors), start: P.hm(ufo.start), remind: P.hm(P.reminderAt(ufo)) };
  out.paris = T;
  step('/shows prep: time, doors, venue', /^Machine Club: Ben UFO, Call Super/.test(prep) && prep.includes(`doors ${T.doors}, starts ${T.start} Paris time`) && /La Machine du Moulin Rouge · 90 Boulevard de Clichy/.test(prep), prep.split('\n').slice(0, 3));
  step('/shows prep: nearest Métro + live routes', /Métro: Blanche \(line 2\) 1 min/.test(prep) && /citymapper\.com\/directions\?endcoord=48\.8841%2C2\.3322/.test(prep) && /ratp\.fr\/itineraires/.test(prep));
  step('/shows prep: one listen link per artist (listing first, no scraping)', /Ben UFO https:\/\/shotgun\.live\/en\/artists\/ben-ufo/.test(prep) && /Call Super https:\/\/soundcloud\.com\/callsuper/.test(prep));
  step('/shows prep: Google Calendar link + reminder off by default', /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/.test(prep) && /Reminder: off/.test(prep));
  const pnote = notes.find((n) => /^Get ready/.test(n.t));
  step('/shows prep: a note with calendar / reminder / card', pnote?.o?.actions?.map((a) => a.label).join(' | ') === 'Add to calendar (.ics) | Remind me on the day | Open the card', pnote?.o?.actions?.map((a) => a.label));

  // ---------- the map's show card → Get ready ----------
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => QuestJournal.ready?.(), 'journal ready');
  QuestJournal.navigate('world');
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  const row = await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /Ben UFO/.test(r.textContent)), 'Ben UFO row');
  step('the ✦ list has "Shows I went to"', !!btn(/^Shows I went to/));
  row.click();
  const ready = await until(() => btn(/^Get ready$/), 'Get ready on the card');
  step('show card: Get ready joins its actions (no How was it? before the show)', !!ready && !btn(/^How was it\?$/) && !!btn(/Make it a quest/));
  ready.click();
  const pd = await until(() => document.querySelector('dialog.qj-dialog[open][data-showprep]'), 'prep card');
  const artists = [...pd.querySelectorAll('.sp-artist')].map((b) => `${b.textContent.trim()}|${b.dataset.kind}`);
  step('prep card: time line, Métro, lineup links', pd.textContent.includes(`DOORS ${T.doors} · STARTS ${T.start} · PARIS TIME`) && /Blanche/.test(pd.querySelector('.sp-metro')?.textContent) && artists.length === 2 && artists[0].endsWith('|page') && artists[1].endsWith('|listen'), artists);
  const remindBox = pd.querySelector('.sp-remind input');
  step('prep card: reminder off by default', remindBox && !remindBox.checked && pd.querySelector('.sp-remind').textContent.includes(`around ${T.remind}`), pd.querySelector('.sp-remind')?.textContent);
  await shot('ready');

  // .ics download (the test save dir stands in for the save dialog)
  btn(/Add to calendar \(\.ics\)/, pd).click();
  const icsPath = `${window.SMOKE_SAVES}/machine-club-ben-ufo-call-super.ics`;
  const ics = await until(async () => { const r = await window.hub.fs.read(icsPath).catch(() => null); return typeof r === 'string' ? r : r?.text || r?.content || null; }, 'ics file');
  step('.ics: saved, Paris time zone, wall-clock start', /BEGIN:VTIMEZONE\r\nTZID:Europe\/Paris/.test(ics) && ics.includes(`\r\nDTSTART;TZID=Europe/Paris:${(() => { const t = P.paris.parts(ufo.start), z = (n) => String(n).padStart(2, '0'); return `${t.y}${z(t.m)}${z(t.d)}T${z(t.h)}${z(t.mi)}00`; })()}\r\n`) && /UID:show-[0-9a-f]{12}@hearth/.test(ics) && /SUMMARY:Machine Club: Ben UFO\\, Call Super/.test(ics), ics.slice(0, 80));

  // the reminder: one timer in the main process only while on
  const st0 = (await window.hub.shows.remind({ op: 'state' })).value;
  step('reminder: nothing armed while off', st0.armed === false && !st0.next, st0);
  remindBox.click();
  const st1 = await until(async () => { const v = (await window.hub.shows.remind({ op: 'state' })).value; return v.armed ? v : null; }, 'armed');
  const key = ShowPrep.store.prep && Object.keys(ShowPrep.store.prep)[0];
  step('reminder: switched on → armed for that show', st1.armed && st1.next.key === key && st1.next.at > Date.now(), st1);
  remindBox.click();
  const st2 = await until(async () => { const v = (await window.hub.shows.remind({ op: 'state' })).value; return !v.armed ? v : null; }, 'disarmed');
  step('reminder: switched off → no timer', st2.armed === false);
  remindBox.click(); await until(async () => (await window.hub.shows.remind({ op: 'state' })).value.armed, 'armed again');
  await Lazy.load?.('notify').catch?.(() => {});
  const sentBefore = Notify._test.sent.length;
  await window.hub.shows.remind({ op: 'fire' });
  const rem = await until(() => Notify._test.sent.slice(sentBefore).find((x) => x.type === 'reminder'), 'reminder through notify');
  step('reminder: when it goes, through Hearth\'s notifications (once)', /Ben UFO & Call Super/.test(rem.title) && (await window.hub.shows.remind({ op: 'state' })).value.armed === false, rem);
  closeAll(); await wait(100);

  // ---------- the show quest, then How was it? ----------
  const q = await run('/shows quest ben ufo');
  step('a show quest to finish', /^Quest saved: Go see Ben UFO & Call Super/.test(q));
  await QuestJournal.flush();
  const camp = QuestJournal.snapshot().campaigns.find((c) => c.id === `c-show-${key}`);
  let reviewCalls = 0;
  const review = { status: 'reviewed', score: 76, dimensions: [19, 19, 19, 19], meetsBrief: true, summary: 'A specific, honest field note.', better: 'Name the track.', next: 'Add the track name.', coverage: 'The field note.', limitations: 'Self-reported.' };
  const realRun = QuestReview.run; QuestReview.run = () => { reviewCalls++; return { promise: Promise.resolve({ ...review }), cancel() {} }; };
  QuestJournal.questDetail(camp.quests[0].id);
  const aside = await until(() => dlg()?.querySelector('.sp-aside'), 'show quest aside');
  step('show quest: Get ready / How was it? in its detail', !!btn(/^Get ready$/, aside) && !!btn(/^How was it\?$/, aside));
  btn(/^How was it\?$/, aside).click();
  const wd = await until(() => document.querySelector('dialog.qj-dialog[open][data-showwent]'), 'how was it dialog');
  wd.querySelectorAll('.sp-star')[3].click();
  wd.querySelector('.sp-moment').value = 'The last record at 5 am, everyone singing';
  await shot('went');
  btn(/Save to my show log/, wd).click();
  await until(() => wd.querySelector('.sp-saved'), 'saved');
  await QuestJournal.flush();
  const s1 = QuestJournal.snapshot(), subs = camp.quests.map((x) => QuestCore.submissions(s1, x.id).length);
  step('How was it?: saved to the log (rating, moment)', /Saved to Shows I went to \(1\)/.test(wd.textContent) && ShowPrep.store.went[0]?.rating === 4 && /last record/.test(ShowPrep.store.went[0]?.moment));
  step('How was it?: the moment is the quest\'s proof, saved with NO AI call', subs[0] === 1 && reviewCalls === 0 && !camp.quests.some((x) => QuestCore.done(s1, x.id)) && /proof/.test(wd.querySelector('.sp-quest')?.textContent || ''), { subs, reviewCalls });
  const disk = await window.hub.kvGet('show-nights', null, { status: true });
  step('the log is on disk (and the prepared show left the reminder list)', disk.state === 'ok' && disk.value.went.length === 1 && !disk.value.prep[key]);
  // asked: Astra checks it (stubbed) → every step of the show quest completes
  btn(/Ask Astra to check it/, wd).click();
  await until(() => /Done: 3 steps/.test(wd.querySelector('.sp-quest')?.textContent || ''), 'astra chain', 200);
  await QuestJournal.flush();
  const s2 = QuestJournal.snapshot();
  step('asked → Astra\'s check completes the show quest (3 steps, 3 reviews)', camp.quests.every((x) => QuestCore.done(s2, x.id)) && reviewCalls === 3, { reviewCalls, done: camp.quests.map((x) => QuestCore.done(s2, x.id)) });
  QuestReview.run = realRun;

  // ---------- follow from the after-show view ----------
  const fol = [...wd.querySelectorAll('.sp-follow')].map((b) => b.textContent);
  step('follow: the venue and the artist, one tap each', fol.join(' | ') === 'Follow La Machine du Moulin Rouge | Follow Ben UFO', fol);
  wd.querySelectorAll('.sp-follow')[1].click();
  await until(() => /Following Ben UFO/.test(wd.querySelectorAll('.sp-follow')[1].textContent), 'followed');
  const follows = (await window.hub.shows.get()).value.follows;
  step('follow: showsync61 now reads that artist page', follows.some((f) => f.kind === 'artist' && f.url === 'https://shotgun.live/en/artists/ben-ufo'), follows);
  await shot('after');
  closeAll(); await wait(100);

  // ---------- a second night with a photo (API), a third at a venue not on this week's map ----------
  const arlo = await ShowPrep.findShow('arlo parks');
  const r2 = await ShowPrep.went(arlo, { rating: 5, moment: 'Quiet room, loud chorus', photo: { path: `${window.SMOKE_DEV}/fixtures/showsync/cigale.png` } });
  step('a photo is kept (a copy + a resized JPEG)', r2.entry.photo?.path && /\.jpg$/.test(r2.entry.photo.jpg) && !r2.step, r2.entry.photo);
  const poss = await ShowPrep.findShow('possession');
  await ShowPrep.went(poss, { moment: 'Glazart, 4 am' });
  const log = await run('/shows log');
  step('/shows log: count, venues, artists', /^Shows I went to: 3 · 3 venues · \d+ artists · 4\.5★ average/.test(log) && /La Machine du Moulin Rouge/.test(log) && /Arlo Parks/.test(log), log.split('\n').slice(0, 3));
  const w2 = await run('/shows went bon entendeur: 3/5 the encore');
  step('/shows went <show>: rating + moment from chat', /^Logged: Bon Entendeur[^★]* ★★★☆☆ — “the encore”\. Shows I went to: 4\./.test(w2), w2);

  // ---------- the Paris map: visited badges ----------
  QuestJournal.navigate('adventure'); await wait(50); QuestJournal.navigate('world');
  await until(() => document.querySelectorAll('.qj-atlas-pin.visited[data-place^="show-venue-"]').length >= 3, 'visited pins');
  const visited = [...document.querySelectorAll('.qj-atlas-pin.visited[data-place^="show-venue-"]')].map((p) => p.getAttribute('aria-label') || p.textContent);
  out.visited = visited;
  const glazart = ShowPrepCore.stats(ShowPrep.store).venues.find((v) => /Glazart/.test(v.name));
  step('map: venues you went to carry a ✓ badge (incl. one not on this week\'s list)', visited.length >= 4 && !!document.querySelector(`.qj-atlas-pin.visited[data-place="show-venue-${ShowSyncCore.hash(glazart.key)}"]`), visited);
  step('map: the badge is drawn', getComputedStyle(document.querySelector('.qj-atlas-pin.visited[data-place^="show-venue-"]'), '::after').content.includes('✓'));
  document.querySelector(`.qj-atlas-pin[data-place="show-venue-${ShowSyncCore.hash(glazart.key)}"]`).click();
  const vl = await until(() => dlg(), 'venue you know');
  step('map: a visited-only pin opens its nights', /YOU WENT 1×/.test(vl.textContent) && /Glazart, 4 am/.test(vl.textContent));
  closeAll();
  await shot('map');
  // the log dialog from the ✦ list
  document.querySelector('[data-focus="map-shows"]').click();
  (await until(() => btn(/^Shows I went to · 4/), 'log button')).click();
  const ld = await until(() => document.querySelector('dialog.qj-dialog[open][data-showlog]'), 'log dialog');
  step('log dialog: badges + entries', ld.querySelectorAll('.sp-badge').length === 4 && ld.querySelectorAll('.sp-entry').length === 4, { badges: ld.querySelectorAll('.sp-badge').length });
  await shot('log');
  closeAll();

  // ---------- quiet: no duplicates, completions ----------
  step('/shows completions include prep / went / log', ['prep ', 'went ', 'log'].every((v) => Commands.get('shows').complete('').some((c) => c.value === v)) && Commands.get('shows').complete('prep ben').length >= 1);
  step('no duplicate commands', !Commands.duplicates().some((d) => d.name === 'shows'));
} catch (err) { errors.push(String(err.stack || err).slice(0, 600)); }
out.pass = !errors.length; out.errors = errors;
return JSON.stringify(out);
