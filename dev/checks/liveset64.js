// (round 64, liveset64) Live set for an open mic, in the real app, driven by CLICKS and keys only (the owner doesn't use
// commands), with the fake instrument host:
//   node dev/smoke.js --fake-vst --script dev/checks/liveset64.js --shot /tmp/liveset64.png
// The real creative-vst-host.py + creative-vst-liveset.py run with dev/fixtures/fake-vst-py (a sine 'Vital').
// Fixtures (as the owner would have them): two park takes on disk (120 and 110 BPM: the second is stretched), a loopsong63
// arrangement in the desk, two bank presets ("Soft", "Loud"). Then: 🎤 Live set in the desk's top row → ✎ Build this
// song → takes added by clicking ＋ and by DRAG AND DROP, the arranged song, the presets → ✓ Done → a pad clicked launches
// on the bar (exact sample in the host) → key W switches to "Loud" on the beat (preloaded twin, no underrun) → the knob →
// ● Rehearse → Esc = panic → ■ Stop rehearsal (the run WAV + log) → ⛶ Stage (everything else hidden, keys still reach the
// pads with focus elsewhere) → \ back → "Offer as open-mic proof" (Go to an open mic) → the quest card's "🎤 Rehearse
// your set" opens the Live set → ✕ closes it and nothing polls any more.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Live set: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/liveset64`, SKETCH = 'Park sketch · Belleville · 18 Oct';
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const P = ParkJamCore, S = LoopSongCore, C = LiveSetCore;
const sine = (bpm, hz, bars = 1) => { const n = Math.round(bars * 4 * 60 / bpm * 48000), L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = .3 * Math.sin(2 * Math.PI * hz * i / 48000); return { rate: 48000, channels: [L, L.slice()] }; };
async function fixture(place, bpm, hz, at) {
  const names = P.takeNames(place, new Date(at)), save = async (n, b) => (await hub.vst.parkSave(SKETCH, n, b)).path;
  const entry = { v: 1, id: 'take-' + bpm, at, week: P.isoWeek(new Date(at)), sketch: SKETCH, place, bars: 1, beats: 4, bpm, seconds: 4 * 60 / bpm, notes: 0, instrument: 'Vital', output: 'Speakers', peak: .3, silent: false };
  entry.loop = await save(names.loop, P.encodeWav(sine(bpm, hz))); await save(names.notes, JSON.stringify({ ...entry, notesPlayed: [] })); return entry;
}
const t120 = await fixture('Belleville', 120, 440, '2026-10-17T10:00:00.000Z'), t110 = await fixture('Buttes-Chaumont', 110, 660, '2026-10-16T10:00:00.000Z');
const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = SKETCH;
const song = S.create({ title: 'Sunday song', sketch: SKETCH, bpm: 120 }); S.addClip(song, t120, { lane: 0 }); S.repeat(song, song.clips[0].id, 2); project.vst.song = song;
await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
const api = WorkbenchVST.api, stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
await api.set({ level: .9 }); await api.savePreset('Loud'); await api.set({ level: .5 }); await api.savePreset('Soft');
const calls = []; // (hub is a frozen bridge object: polling is checked through LiveSet._test.polling)
const click = async (sel, re) => { const b = await until(() => [...document.querySelectorAll(sel)].find(x => re.test(x.textContent.trim()) && !x.disabled), 15000, String(re)); b.click(); await wait(30); return b; };

// 1. the entry: a visible "🎤 Live set" button in the desk's top row (beside 🌳 Park mode)
const entry = [...document.querySelectorAll('.wb-sound-desk button')].find(b => b.textContent === '🎤 Live set');
ok(entry && entry.parentElement === document.querySelector('.wb-park-toggle')?.parentElement, 'a visible 🎤 Live set button in the desk\'s top row, beside 🌳 Park mode');
let t0 = performance.now(); entry.click(); const view = await until(() => document.querySelector('.lv-view'), 8000, 'the Live set view'); out.timings.openMs = Math.round(performance.now() - t0);
ok(view.getAttribute('role') === 'region' && !document.querySelector('dialog[open], .modal-backdrop'), 'the view opens over the desk (no modal)');

// 2. build by clicking and dragging
await click('.lv-view button', /^✎ Build this song/);
const chips = async kind => until(() => { const c = [...document.querySelectorAll(`.lv-view .lv-chip[data-kind="${kind}"]`)]; return c.length && c; }, 8000, kind + ' chips');
let takeChips = await chips('take'); ok(takeChips.length === 2 && /Belleville · 1 bar · 120 BPM/.test(takeChips[0].textContent), 'park takes listed as chips: ' + takeChips.map(c => c.textContent).join(' | '));
takeChips[0].click(); await until(() => LiveSet.set().scenes[0].pads.length === 1, 8000, 'the first take added');
const set = () => LiveSet.set(), sc0 = () => set().scenes[0];
ok(sc0().bpm === 120 && sc0().pads[0].file === t120.loop, 'clicking ＋ adds the take as pad 1; the song takes its tempo (120 BPM), no copy needed');
takeChips = await chips('take'); const dt = new DataTransfer(), drop = document.querySelector('.lv-view .lv-drop');
takeChips[1].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
drop.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
await until(() => sc0().pads.length === 2 && sc0().pads[1].prepared, 15000, 'the dropped take');
const stretched = sc0().pads[1]; ok(stretched.prepared.ratio > 1.09 && /creative-live/.test(stretched.file), 'dragging a take onto the pads adds it; the 110 BPM take is stretched to 120 into the set\'s folder');
const w = P.decodeWav(new Uint8Array(await hub.fs.read(stretched.file, { encoding: 'buffer' }))); ok(w.channels[0].length === 96000, 'the stretched loop is exactly 1 bar at 120 BPM (96,000 samples)');
(await chips('song'))[0].click(); await until(() => set().scenes.length === 2 && set().scenes[1].pads[0]?.file, 20000, 'the arranged song');
ok(set().scenes[1].name === 'Sunday song' && set().scenes[1].pads[0].loop === false, 'the arranged song becomes a one-shot pad in its own song');
await click('.lv-view button', /^‹$/); ok(LiveSet._test.scene() === sc0(), '‹ goes back to song 1');
let presetChips = await chips('preset'); ok(presetChips.map(c => c.textContent.replace('＋', '')).join('|') === 'Soft|Loud', 'the desk\'s presets listed as chips');
presetChips[0].click(); await until(() => C.presets(sc0()).length === 1, 5000, 'Soft'); presetChips = await chips('preset'); presetChips[1].click(); await until(() => C.presets(sc0()).length === 2, 5000, 'Loud');
await click('.lv-view button', /^✓ Done$/);
const pads = [...document.querySelectorAll('.lv-view .lv-pad')]; ok(pads.length === 4 && pads.map(p => p.querySelector('kbd').textContent).join('') === '12QW', 'four big pads, keys 1 2 Q W');

// 3. perform: a click launches on the bar; W switches to Loud on the beat
t0 = performance.now(); pads[0].querySelector('.lv-hit').click();
await until(() => LiveSet._test.armed(), 20000, 'the set armed (clips loaded in the host)'); out.timings.armMs = Math.round(performance.now() - t0);
const st1 = await until(() => { const s = LiveSet._test.status(); return s?.pads?.[sc0().pads[0].id]?.state === 'playing' && s; }, 8000, 'pad 1 playing');
ok(document.querySelector('.lv-pad.lv-playing') && /^Bar \d+ · \d\/4$/.test(document.querySelector('.lv-bar').textContent), 'pad 1 plays; the bar counter runs: ' + document.querySelector('.lv-bar').textContent);
const res = await hub.vst.request({ action: 'set-status', plugin: api.current().path, name: 'Vital' }); ok(res.open && res.bpm === 120, 'the host transport is at 120 BPM');
await until(() => LiveSet._test.status()?.twin, 8000, 'a preset preloaded'); const u0 = LiveSet._test.status().underruns;
view.focus(); view.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
await until(() => LiveSet._test.status()?.current === C.presets(sc0())[1].id, 8000, 'Loud on');
const swap = LiveSet._test.status().swaps.at(-1); ok((swap.at - LiveSet._test.status().origin) % 24000 === 0, `key W: "Loud" switched exactly on a beat line (bar ${swap.bar}, beat ${swap.beat})`);
ok(api.current() && (await api.values(['level'])).level.value === .9, 'the live synth now plays "Loud"');
await wait(300); ok(LiveSet._test.status().underruns === u0, `no underrun across the preset switch (${u0} → ${LiveSet._test.status().underruns})`);
const pad1 = () => document.querySelector(`.lv-view .lv-pad[data-pad="${sc0().pads[0].id}"]`); // (sweep69) the pads are drawn again once the set arms and its run recorder starts: read the pad on screen, not the one clicked before
const knob = pad1().querySelector('.lv-knob'); knob.value = '-0.6'; knob.dispatchEvent(new Event('input', { bubbles: true }));
await until(() => Math.abs((LiveSet._test.status()?.pads?.[sc0().pads[0].id]?.fx ?? 0) + 0.6) < 1e-6, 4000, 'the knob in the host'); ok(/Low-pass/.test(pad1().querySelector('.lv-fx').textContent), 'the pad\'s knob filters it in the host: ' + pad1().querySelector('.lv-fx').textContent);

// 4. rehearse, panic, keep the run
await click('.lv-view button', /^● Rehearse$/); await until(() => LiveSet._test.status()?.run, 5000, 'recording'); ok(!document.querySelector('.lv-rec').hidden, '● REC shows while rehearsing');
await wait(700); view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await until(() => { const s = LiveSet._test.status(); return s && !s.panic && Object.values(s.pads).every(p => p.state === 'stopped'); }, 4000, 'panic');
ok(view.isConnected && LiveSet._test.status().playing, 'Esc = panic: every clip faded out, the view and the stream stay');
await click('.lv-view button', /^■ Stop rehearsal$/); const lastRun = await until(() => LiveSet._test.lastRun(), 15000, 'the run kept');
ok(lastRun.kind === 'Rehearsal' && lastRun.seconds > 0.5 && lastRun.events.some(e => e.kind === 'panic') && lastRun.events.some(e => e.kind === 'switch') === false, `the rehearsal is kept: ${C.runSummary(lastRun)}`);
ok(await hub.fs.exists?.(lastRun.path) !== false && /creative-live/.test(lastRun.path) && lastRun.log, 'its WAV and log are in the set\'s folder');
ok(document.querySelector('.lv-run') && /Rehearsal ·/.test(document.querySelector('.lv-run').textContent), 'the run shows under the pads');

// 5. stage: everything else hidden; keys reach the pads even when focus is elsewhere
await click('.lv-view button', /^⛶ Stage$/);
ok(document.documentElement.classList.contains('liveset-stage') && view.parentElement === document.body && getComputedStyle(view).position === 'fixed', 'Stage: the view takes the whole window');
const other = [...document.body.children].find(x => x !== view && x.offsetParent !== undefined && x.tagName !== 'SCRIPT'); ok(other && getComputedStyle(other).visibility === 'hidden', 'everything else is hidden');
ok(![...view.querySelectorAll('button')].some(b => /✎ Edit|✕/.test(b.textContent)), 'no editing on stage');
document.activeElement?.blur?.(); const input = document.createElement('input'); document.body.append(input); input.focus();
window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); await until(() => LiveSet._test.status()?.pads?.[sc0().pads[0].id]?.state === 'playing', 8000, 'pad 1 by key on stage');
ok(true, 'on stage the 1 key launches pad 1 even with focus in another field'); input.remove();
window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
ok(!document.documentElement.classList.contains('liveset-stage') && view.parentElement?.classList.contains('wb-sound-desk'), '\\ turns the stage off: the view is back over the desk');
view.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await until(() => LiveSet._test.status()?.pads?.[sc0().pads[0].id]?.state === 'stopped', 8000, 'Space stops on the bar');

// 6. the open-mic quest: proof from the run, and the quest card's way in
await Lazy.load('questjournal'); await QuestParisUI.journal(); const J = QuestJournal.paris;
await J.mutate(st => { const c = QuestParis.startPersonal(st, 'openmic'); for (const q of c.quests.slice(0, 2)) st.records[q.id] = { startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }; return c; }, 'test: the first two steps done');
activate('tool:creative'); await click('.wb-sound-desk button', /^🎤 Live set$/); await until(() => document.querySelector('.lv-view .lv-run'), 8000, 'the Live set again, with its last run');
await click('.lv-view button', /^Offer as open-mic proof$/); await until(() => set().runs[0].proof, 30000, 'the proof');
await until(() => H.activeId === 'tool:quests' && document.querySelector('.qj dialog[open]'), 15000, 'the offered quest opens in Life'); // (sweep69) the offer opens its quest after saving the proof; wait for it so it can't land after the Rehearse click below
const qs = J.ui().state(), camp = qs.campaigns.find(c => c.id === 'c-pq-openmic'), item = qs.submissions[set().runs[0].proof.quest].at(-1);
ok(camp.quests.length === 4 && set().runs[0].proof.step === 'Decide your own next step' && /Live set run/.test(item.proof.excerpt) && /cannot hear/.test(item.proof.coverage) && !QuestCore.done(qs, set().runs[0].proof.quest), 'the rehearsal is proof for “Decide your own next step” (Go to an open mic, 4 steps); no XP before a review');
J.ui().questDetail(camp.quests[2].id); const rehearse = await until(() => [...document.querySelectorAll('button')].find(b => b.textContent === '🎤 Rehearse your set'), 8000, 'the quest card\'s button');
ok(!document.querySelector('.lv-view'), 'the journal opened on the quest (the Live set closed with the desk)');
rehearse.click(); await until(() => document.querySelector('.lv-view'), 15000, 'the Live set from the quest card'); ok(true, 'the open-mic quest card has “🎤 Rehearse your set”, which opens the Live set');

// 7. idle: closed = nothing polls
document.querySelector('.lv-view .lv-close').click(); await wait(400); const n = calls.length; await wait(1200);
ok(calls.length === n && !LiveSet._test.view() && !LiveSet._test.polling() && !LiveSet._test.armed(), 'closed: no status polling, no keys listener, the host set closed');
// for the screenshot: the pads again
activate('tool:creative'); await click('.wb-sound-desk button', /^🎤 Live set$/); await until(() => document.querySelectorAll('.lv-view .lv-pad').length === 4, 8000, 'the pads');
for (const d of document.querySelectorAll('dialog[open]')) d.close(); // the quest card the proof opened (the owner closes it)
const r = document.querySelector('.lv-view').getBoundingClientRect(); out.view = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), dialogs: document.querySelectorAll('dialog[open]').length, scroll: document.querySelector('.lv-view').closest('[class*=wb]')?.scrollTop };
return JSON.stringify(out, null, 1);
