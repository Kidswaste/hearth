// (round 66, bouncelog66) Session log for music, in the real app, by CLICKING (the owner doesn't use commands), with the
// fake instrument host (no audio device, no real plugins):
//   node dev/smoke.js --fake-vst --script dev/checks/bouncelog66.js --shot /tmp/bouncelog66.png
// The real creative-vst-host.py + creative-vst-sketch.py run with dev/fixtures/fake-vst-py (a sine 'Vital'). The session
// clock is moved forward with BounceLog._test.advance (a click in the desk each "minute"), so 10 minutes take a second.
// Fixtures: the open-mic quest at "Decide your own next step" (the Live set's step). Then: the Sessions button in the
// desk's top row (empty state) → 9 min: no strip → 10 min: "Nice session — 10 min." → the strip hides under the Live set
// → a note played → 💾 Save a 30-second sketch (a 48 kHz WAV in <data>/creative-sketches/<project>/) → ▶ Play → ✕ (never
// again this session) → Sessions: the row with ▶ and ✓ Log it → Log it = proof on the open-mic step (no XP) → another
// tool, 25 min away → a new session → its strip's ✓ Log it → Remove sketch (to the Trash) → nothing sent anywhere.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Session log: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
// nothing may leave the computer: every network call made from here on is recorded
const sent = []; const realFetch = window.fetch; window.fetch = (u, ...a) => { sent.push(String(u?.url || u)); return realFetch(u, ...a); };
const realOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { sent.push(String(u)); return realOpen.call(this, m, u, ...a); };
const dir = `${window.SMOKE_TMP}/bouncelog66`, PROJECT = 'Sunday session', MIN = 60000;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
// the journal: "Go to an open mic" with its first two steps done (the Live set's step is next)
await Lazy.load('questcore'); await Lazy.load('questjournal'); await Lazy.load('questhud');
const QC = QuestCore; let s = QC.upgrade(QC.initial()); QuestParis.startPersonal(s, 'openmic');
const om = s.campaigns.find(c => c.id === 'c-pq-openmic'); for (const q of om.quests.slice(0, 2)) s.records[q.id] = { completedAt: new Date().toISOString() };
await hub.kvSet('quest-journal', QC.validate(s)); await QuestHud.refresh();
const xp0 = QC.xp(s);
await Lazy.load('creative'); const K = BounceLogCore;
const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = PROJECT; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-instrument-card'), 15000, 'instrument cards');
const api = WorkbenchVST.api, stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
const T = BounceLog._test, strip = () => document.querySelector('.wb-sound-desk .bl-strip'), shown = el => !!el && el.checkVisibility({ visibilityProperty: true });
const desk = () => document.querySelector('.wb-sound-desk');
const minutes = async (n) => { for (let i = 0; i < n; i++) { T.advance(MIN); desk().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await T.tick(); } };
const click = async (sel, re) => { const b = await until(() => [...document.querySelectorAll(sel)].find(x => re.test(x.textContent.trim()) && !x.disabled && shown(x)), 15000, String(re)); b.click(); await wait(30); return b; };

// 1. the Sessions button, in words, in the desk's top row; its empty state
const sb = [...desk().querySelectorAll('button')].find(b => b.textContent === 'Sessions');
ok(sb && sb.parentElement === document.querySelector('.wb-park-toggle')?.parentElement, 'a visible "Sessions" button in the desk\'s top row (beside 🌳 Park mode, 🎤 Live set)');
sb.click(); const panel0 = await until(() => document.querySelector('.bl-panel'), 5000, 'the Sessions panel');
ok(/No sessions yet\. Play in the Sound desk for 10 minutes/.test(panel0.textContent), 'empty state says what to do: "' + panel0.querySelector('.bl-empty').textContent.slice(0, 70) + '…"');
await click('.bl-panel button', /^✕$/); ok(!document.querySelector('.bl-panel'), '✕ closes it');

// 2. the session clock: no strip at 9 minutes, the strip at 10
ok(T.timer() && BounceLog.session()?.inDesk, 'the session clock runs while the desk is on screen (one 30-second timer)');
await minutes(9); ok(!strip() && K.minutes(BounceLog.session()) === 9, '9 minutes in the desk: no strip yet');
await minutes(1); await until(() => strip(), 3000, 'the strip');
ok(shown(strip()) && strip().querySelector('.bl-text').textContent === 'Nice session — 10 min.', 'at 10 minutes a small strip: "' + strip().querySelector('.bl-text').textContent + '"');
const labels = [...strip().querySelectorAll('button')].filter(shown).map(b => b.textContent);
ok(labels.join('|') === '💾 Save a 30-second sketch|✓ Log it|✕', 'two labelled buttons and ✕: ' + labels.join(' · '));
const rect = strip().getBoundingClientRect(), hit = (r, b) => r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
const covered = [...desk().querySelectorAll('button, select, input')].filter(b => !strip().contains(b) && !b.closest('.ph-win') && shown(b) && hit(rect, b.getBoundingClientRect())) // (the ✦ Preset window floats over everything by design);
ok(rect.height < 60 && !covered.length && !document.querySelector('dialog[open], .modal-backdrop'), `non-blocking: a ${Math.round(rect.height)} px strip under the desk's top row, covering no control, no dialog` + (covered.length ? ': covers ' + covered.map(b => b.textContent).join(', ') : ''));
if (window.SMOKE_TMP && typeof smoke === 'function') await smoke({ shot: `${window.SMOKE_TMP}/../bouncelog66-strip.png` }).catch(() => {});
await minutes(3); ok(strip().querySelector('.bl-text').textContent === 'Nice session — 13 min.', 'the minutes follow the session (13 min)');
// the Live set counts as desk time and the strip steps aside under it
await click('.wb-sound-desk button', /^🎤 Live set$/); await until(() => document.querySelector('.lv-view'), 8000, 'the Live set');
await minutes(1); ok(!shown(strip()) && BounceLog.session().used.liveset, 'with the Live set open the strip hides (nothing over the pads); the session notes the Live set');
await click('.lv-view button', /^✕$/); await until(() => !document.querySelector('.lv-view'), 5000, 'Live set closed'); ok(shown(strip()), 'back in the desk: the strip again');

// 3. 💾 Save a 30-second sketch (a note played first: the fake Vital sings while a key is held)
await hub.vst.request({ action: 'midi', plugin: api.current().path, name: 'Vital', note: 69, on: true, velocity: 100 }); await wait(900);
await hub.vst.request({ action: 'midi', plugin: api.current().path, name: 'Vital', note: 69, on: false }); await wait(150);
let t0 = performance.now(); await click('.bl-strip button', /^💾 Save a 30-second sketch$/);
const sk = await until(() => BounceLog.session().sketches[0], 10000, 'the sketch'); out.timings.saveMs = Math.round(performance.now() - t0);
ok(/creative-sketches[\\/]Sunday session[\\/]Sketch \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d\.wav$/.test(sk.path), 'saved in <data>/creative-sketches/<project>/: ' + sk.path.split(/[\\/]/).slice(-2).join('/'));
const wav = ParkJamCore.decodeWav(new Uint8Array(await hub.fs.read(sk.path, { encoding: 'buffer' })));
let peak = 0; for (const v of wav.channels[0]) peak = Math.max(peak, Math.abs(v));
ok(wav.rate === 48000 && wav.channels.length === 2 && sk.seconds > 1 && sk.seconds <= 30 && peak > .05, `a 48 kHz stereo WAV of the last ${sk.seconds.toFixed(1)} s (everything since live audio started; up to 30 s), with the note in it`);
await until(() => /Sketch saved/.test(strip()?.textContent || ''), 3000, 'the saved line'); const play = strip().querySelector('.bl-play');
ok(shown(play), 'the strip says "' + strip().querySelector('.bl-text').textContent + '" and shows ▶ Play');
play.click(); await wait(100); ok(play.textContent === '■ Stop', '▶ Play plays the sketch (■ Stop to stop)'); play.click();
const stored = (await hub.kvGet(K.KV, null))?.sessions || []; ok(stored.length === 1 && stored[0].sketches[0].path === sk.path && !stored[0].logged, 'the session is in the Sessions list (kv music-sessions) with its sketch, not logged yet');
// ✕: never again for this session
await click('.bl-strip button', /^✕$/); await minutes(4); await wait(50); ok(!strip(), '✕ dismisses it; 4 more minutes later it hasn\'t come back');

// 4. Sessions: the row with ▶ and ✓ Log it → the open-mic step gets the sketch as proof (no XP)
await click('.wb-sound-desk button', /^Sessions$/); const panel = (await until(() => document.querySelector('.bl-panel .bl-row'), 5000, 'a row')).closest('.bl-panel');
const row = panel.querySelector('.bl-row'); ok(/· 1[89] min/.test(row.querySelector('strong').textContent) && /Vital · Live set/.test(row.textContent), 'the row: "' + row.querySelector('.bl-top').textContent.slice(0, 80) + '"');
const rowPlay = row.querySelector('.bl-play-row'); ok(rowPlay && rowPlay.getAttribute('aria-label').startsWith('Play the sketch'), 'its sketch has a ▶ play button'); rowPlay.click(); await wait(80); ok(rowPlay.textContent === '■ Stop', '▶ plays it'); rowPlay.click();
const events = []; document.addEventListener('hearth:quest-week', e => events.push(e.detail));
t0 = performance.now(); await click('.bl-panel .bl-row button', /^✓ Log it$/);
await until(() => document.querySelector('.bl-panel .bl-badge'), 15000, 'logged'); out.timings.logMs = Math.round(performance.now() - t0);
await QuestHud.refresh(); s = QuestHud.journal().S;
const step = om.quests[2], subs = s.submissions?.[step.id] || [];
ok(subs.length === 1 && subs[0].proof.kind === 'audio/wav' && /Session ses-/.test(subs[0].proof.excerpt) && subs[0].review === null, `✓ Log it: the sketch is proof on "${step.title}" (Go to an open mic), not reviewed`);
ok(QC.xp(s) === xp0 && !s.records[step.id]?.completedAt, 'no XP and no finish by itself (the review stays the owner\'s choice)');
ok(/✓ Logged · Go to an open mic/.test(panel.querySelector('.bl-badge').textContent), 'the row now says "' + panel.querySelector('.bl-badge').textContent + '"');
ok(events.some(e => e.kind === 'music-session'), 'announced for the week in review and My Paris (hearth:quest-week · music-session)');
const mp = ParisJournalCore.collect({ C: QC, s, P: QuestParis, sessions: (await hub.kvGet(K.KV, null)).sessions }).filter(m => m.kind === 'music');
ok(mp.length === 1 && mp[0].loop === sk.path && mp[0].campaign === 'c-pq-openmic', 'My Paris gets a "Music session" moment with the sketch to play and its quest');
await click('.bl-panel button', /^✕$/);

// 5. away for 25 minutes (another tool), back: a new session, its strip's ✓ Log it
const first = BounceLog.session().id;
activate('tool:quests'); await wait(300); await T.tick(); ok(!BounceLog.session() || !BounceLog.session().inDesk || !T.timer(), 'another tool: the clock stops (desk off screen)');
T.advance(25 * MIN); activate('tool:creative'); await wait(800); if (!desk()?.checkVisibility()) CreativePlayground.openFeature('vst'); await until(() => desk()?.checkVisibility() && desk().querySelector('.wb-park-toggle'), 15000, 'the desk again'); await T.tick();
ok(BounceLog.session().id !== first && K.minutes(BounceLog.session()) === 0, 'back after 25 minutes: a new session');
await minutes(11); await until(() => strip(), 3000, 'the new strip'); ok(/Nice session — 11 min\./.test(strip().textContent), 'its own strip at 10+ minutes');
await click('.bl-strip button', /^✓ Log it$/); await until(() => /Logged ✓/.test(strip()?.textContent || ''), 15000, 'logged line');
ok(/No music quest step fits this session right now/.test(strip().textContent), 'a plain session: "' + strip().querySelector('.bl-text').textContent + '"');
ok(!shown(strip().querySelector('.bl-log')), '✓ Log it is gone once logged');
const rows = (await hub.kvGet(K.KV, null)).sessions; ok(rows.length === 2 && rows.every(r => r.logged), 'both sessions are in the list, logged');
await QuestHud.refresh(); ok((QuestHud.journal().S.submissions[step.id] || []).length === 1, 'no second proof for the open-mic step from a plain session');

// 6. Remove sketch → the Trash
await click('.wb-sound-desk button', /^Sessions$/); await until(() => document.querySelectorAll('.bl-panel .bl-row').length === 2, 5000, 'two rows');
await click('.bl-panel button', /^Remove sketch$/);
const gone = await until(async () => !(await hub.fs.stat(sk.path).catch(() => null))?.size, 8000, 'the sketch to leave').catch(() => false);
const after = (await hub.kvGet(K.KV, null)).sessions.find(r => r.sketches.length === 0 && r.logged?.quests?.length);
ok(gone && after, 'Remove sketch sends the file to the Trash; the session stays, still logged' + (gone ? '' : ` (said: ${document.querySelector('.cp-feedback')?.textContent || '?'})`));
await click('.bl-panel button', /^✕$/);
document.querySelector('.bl-panel')?.remove();

const outward = sent.filter(u => /^(https?|wss?):/i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u));
ok(!outward.length, 'nothing sent anywhere (no network call during the whole run)' + (outward.length ? ': ' + outward.join(', ') : ''));
window.fetch = realFetch; XMLHttpRequest.prototype.open = realOpen;
return JSON.stringify(out);
