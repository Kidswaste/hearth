// (round 63, loopsong63) From park loops to a song, in the real app, with the fake instrument host:
//   node dev/smoke.js --fake-vst --script dev/checks/loopsong63.js --shot /tmp/loopsong63.png
// The real creative-vst-host.py runs with dev/fixtures/fake-vst-py (a sine 'Vital' whose 'level' sets its loudness).
// Three park takes from two park sketches: one recorded in the desk with parkjam62's loop recorder (Belleville, 200 BPM,
// two notes), two written as parkjam62 writes them (Buttes-Chaumont: one with park ambience at 200 BPM, one at 180 BPM
// that gets time-stretched). Arranged like the owner would: "Arrange" in the Park jam fold, takes picked from both
// sketches, lanes, repeat / fades / ambience off; one take re-rendered through the live synth with another bank preset
// (WorkbenchVST.api.loadPreset; the owner's sound comes back); played in the window's Web Audio graph (no host call);
// exported (mix at −1 dBFS + one stem per lane adding up to it + the MIDI + the song JSON + an MP3 with ffmpeg) into the
// sketch's folder; offered as proof to "Finish a track" (added to the journal; no XP before a review); /song by chat.
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Arrange: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/loopsong63`, HOME = 'Park sketch · Belleville · 18 Oct', OTHER = 'Park sketch · Buttes-Chaumont · 12 Oct';
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = HOME; await hub.kvSet('creative-workbenches', project);
const P = ParkJamCore, S = LoopSongCore;
// two takes written the way parkjam62 writes them, in another park sketch (they're only on disk: parkList finds them)
const sine = (bpm, hz, amp = .3) => { const n = Math.round(16 * 60 / bpm * 48000), L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = amp * Math.sin(2 * Math.PI * hz * i / 48000) * ((i % 24000) < 12000 ? 1 : .3); return { rate: 48000, channels: [L, L.slice()] }; };
async function fixture(place, bpm, hz, { layered = false, at }) {
  const names = P.takeNames(place, new Date(at)), save = async (n, b) => (await hub.vst.parkSave(OTHER, n, b)).path, pcm = sine(bpm, hz);
  const notesPlayed = [{ note: 57, time: 0, length: .5, velocity: 100 }, { note: 60, time: 60 / bpm * 4, length: .5, velocity: 90 }];
  const entry = { v: 1, id: 'take-fx-' + bpm + hz, at, week: P.isoWeek(new Date(at)), sketch: OTHER, place, bars: 4, beats: 4, bpm, seconds: 16 * 60 / bpm, notes: 2, instrument: 'Vital', output: 'Speakers', peak: .3, silent: false };
  entry.loop = await save(names.loop, P.encodeWav(pcm)); entry.midi = await save(names.midi, P.midiFile(notesPlayed, { bpm }));
  if (layered) { const amb = { rate: 48000, channels: [Float32Array.from({ length: 48000 }, (_, i) => .2 * Math.sin(i / 3))] }; entry.layered = await save(names.layered, P.encodeWav(P.layer(pcm, amb))); }
  await save(names.notes, JSON.stringify({ ...entry, notesPlayed })); return entry;
}
const t2 = await fixture('Buttes-Chaumont', 200, 330, { layered: true, at: '2026-10-12T10:00:00.000Z' }), t3 = await fixture('Buttes-Chaumont', 180, 440, { at: '2026-10-12T11:00:00.000Z' });
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
const api = WorkbenchVST.api, stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
// 1. take 1: recorded in the desk (parkjam62's recorder), two notes played, 4 bars at 200 BPM
let t0 = performance.now(); const rec = ParkJam.record({ bars: 4, bpm: 200, wait: 'now', ambience: false });
await wait(250); await api.play(60, { length: .4 }); await wait(1200); await api.play(64, { length: .4 });
const t1 = await rec; out.timings.recordMs = Math.round(performance.now() - t0);
ok(t1.notes === 2 && t1.bpm === 200 && t1.sketch === HOME, `take 1 recorded in the desk: ${t1.bars} bars at ${t1.bpm} BPM, ${t1.notes} notes`);
// a bank preset to re-render with ('Loud lead': level 0.9), then the owner's own sound back (level 0.5)
await api.set({ level: .9 }); await api.savePreset('Loud lead'); await api.set({ level: .5 });
ok(api.presets().some(p => p.label === 'Loud lead') && api.get(['level']).level === .5, 'a bank preset "Loud lead" (level 0.9); the desk plays at level 0.5');
// 2. Arrange from the Park jam fold (no new row: the button sits beside Record loop)
const fold = document.querySelector('.wb-park'); fold.open = true;
const arrangeBtn = [...fold.querySelectorAll('button')].find(b => b.textContent === 'Arrange'); ok(arrangeBtn && arrangeBtn.parentElement === [...fold.querySelectorAll('button')].find(b => b.textContent === 'Record loop').parentElement, 'Arrange sits in the fold\'s Record loop row');
const rowsBefore = document.querySelectorAll('.wb-sound-desk .wb-row').length;
arrangeBtn.click(); const view = await until(() => document.querySelector('.ls-view'), 8000, 'the Arrange panel');
ok(view.getAttribute('role') === 'dialog' && /Arrange/.test(view.getAttribute('aria-label')) && view.querySelectorAll('.ls-lane').length === 5 && view.querySelector('.ls-rerender'), 'Arrange opens over the desk: four lanes + the re-render lane');
const takeSel = view.querySelector('select[aria-label="Take"]'), opts = [...takeSel.options].map(o => o.textContent);
const idx = re => opts.findIndex(o => re.test(o));
ok(opts.length === 3 && idx(/Belleville · 4 bars · 200 BPM · 2 notes/) >= 0 && idx(/Buttes-Chaumont · 4 bars · 200 BPM .*\+ ambience/) >= 0 && idx(/Buttes-Chaumont · 4 bars · 180 BPM/) >= 0, 'takes from both park sketches to pick from: ' + opts.join(' | '));
const pick = (label, value) => { const s = view.isConnected ? document.querySelector(`.ls-view select[aria-label="${label}"]`) : null; s.value = String(value); s.dispatchEvent(new Event('change', { bubbles: true })); };
const press = async label => { const b = [...document.querySelectorAll('.ls-view button')].find(b => b.textContent.trim() === label); ok(b, 'button ' + label); b.click(); await wait(30); await until(() => !b.isConnected || !b.disabled, 60000, label); };
pick('Take', idx(/Belleville/)); pick('Lane', 0); await press('Add');
const song = () => LoopSong.song();
ok(song().clips.length === 1 && song().bpm === 200 && /200 BPM · 4\/4 · 4 bars/.test(document.querySelector('.ls-meta').textContent), 'first clip on Lane 1; the song\'s tempo comes from the take (200 BPM)');
pick('Take', idx(/Buttes-Chaumont · 4 bars · 200/)); pick('Lane', 1); await press('Add');
pick('Take', idx(/180 BPM/)); pick('Lane', 2); await press('Add');
const [c1, c2, c3] = song().clips;
ok(c2.lane === 1 && c2.start === 0 && c3.lane === 2 && c3.ambience === false && c2.ambience === true, 'takes 2 and 3 on Lanes 2 and 3 at bar 1');
let plan = S.tempoPlan(song(), c3); ok(plan.stretch && Math.abs(plan.ratio - 200 / 180) < 1e-9 && !document.querySelector('.ls-warn'), 'the 180 BPM take is time-stretched to 200 (no warning)');
// drag clip 3 two bars right (snapped), arrow key a lane down and back
const el3 = () => document.querySelector(`.ls-clip[data-clip="${c3.id}"]`), r3 = el3().getBoundingClientRect();
el3().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7, clientX: r3.left + 5, clientY: r3.top + 5 }));
el3().dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: r3.left + 5 + 28 * 2.3, clientY: r3.top + 6 }));
el3().dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: r3.left + 5 + 28 * 2.3, clientY: r3.top + 6 }));
ok(c3.start === 2 && c3.lane === 2, 'dragged 2.3 bars → snapped to bar 3');
el3().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); ok(c3.start === 3, 'arrow key: one bar right'); el3().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
// clip 1: repeat ×2 and a fade out, from its details
el3(); document.querySelector(`.ls-clip[data-clip="${c1.id}"]`).click(); await until(() => document.querySelector('.ls-inspect'), 3000, 'the clip details');
const field = (label, v) => { const i = document.querySelector(`.ls-inspect input[aria-label="${label}"]`); i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true })); };
field('Repeat', 2); await wait(50); field('Fade out (s)', 1.5); await wait(50);
ok(c1.repeat === 2 && c1.fadeOut === 1.5 && S.bars(song()) === 8, 'clip 1 repeated twice with a 1.5 s fade out: the song is 8 bars');
// clip 2: park ambience off (its dry loop plays)
document.querySelector(`.ls-clip[data-clip="${c2.id}"]`).click(); await wait(50);
const amb = document.querySelector('.ls-inspect input[aria-label="Park ambience"]'); amb.checked = false; amb.dispatchEvent(new Event('change', { bubbles: true })); await wait(50);
ok(c2.ambience === false && S.sourceOf(song(), c2).file === t2.loop && /· dry/.test(document.querySelector(`.ls-clip[data-clip="${c2.id}"]`).textContent), 'clip 2: ambience muted (the dry loop plays)');
// a tempo mismatch is said plainly
const say = async line => { const def = Commands.get('song'), v = def.variants?.find(x => x.when) || def; return v.run(line, { agentId: H.claudeAgent().id, place: 'creative', say: () => {} }); };
let t = await say('tempo 140'); ok(/⚠ .*200 BPM in a 140 BPM song .*drifts/.test(t) && document.querySelector('.ls-warn'), '/song tempo 140: the 200 BPM takes are too far to stretch → warned');
await say('tempo 200'); ok(!document.querySelector('.ls-warn'), 'back at 200 BPM: no warning');
// 3. re-render: take 1's MIDI through the live synth with "Loud lead", on the re-render lane
pick('Take', idx(/Belleville/)); pick('Lane', 4); await press('Add'); const c4 = song().clips[3];
ok(c4.lane === 4 && document.querySelector(`.ls-clip[data-clip="${c4.id}"]`).classList.contains('ls-empty'), 'on the re-render lane: silent until re-rendered');
document.querySelector(`.ls-clip[data-clip="${c4.id}"]`).click(); await until(() => document.querySelector('.ls-inspect select[aria-label="Preset"]'), 3000, 'preset picker');
pick('Preset', 'Loud lead'); t0 = performance.now(); await press('Re-render'); await until(() => c4.rerender, 30000, 'the re-render'); out.timings.rerenderMs = Math.round(performance.now() - t0);
const rr = P.decodeWav(new Uint8Array(await hub.fs.read(c4.rerender.file, { encoding: 'buffer', maxBytes: 80e6 }))), orig = P.decodeWav(new Uint8Array(await hub.fs.read(t1.loop, { encoding: 'buffer', maxBytes: 80e6 })));
const rms = ch => Math.sqrt(ch.reduce((n, v) => n + v * v, 0) / ch.length), louder = rms(rr.channels[0]) / rms(orig.channels[0]);
ok(c4.rerender.preset === 'Loud lead' && c4.rerender.instrument === 'Vital' && rr.channels[0].length === orig.channels[0].length && louder > 1.5 && louder < 2.2, `re-rendered live through Vital with “Loud lead”: same length, ${louder.toFixed(2)}× louder (level 0.9 vs 0.5) (${out.timings.rerenderMs} ms)`);
const onset = ch => ch.findIndex(v => Math.abs(v) > .01); ok(Math.abs(onset(rr.channels[0]) - onset(orig.channels[0])) < 1200, `its first note lands where the take's did (${onset(rr.channels[0])} vs ${onset(orig.channels[0])} samples)`);
ok(c4.rerender.file.includes('/creative-park/' + HOME + '/') && api.get(['level']).level === .5, 'saved in the sketch\'s folder; the desk\'s own sound is back (level 0.5)');
// 4. playback in the window's Web Audio graph: the instrument host isn't asked anything
let hostCalls = 0; const real = hub.vst.request; hub.vst.request = (...a) => { hostCalls++; return real(...a); };
await press('▶ Play'); await until(() => LoopSong._test.playing(), 15000, 'playing');
ok(document.querySelector('.ls-playhead').getAnimations().length === 1 && document.querySelector('.ls-play').textContent === '■ Stop', 'playing: the playhead moves on the compositor (one animation, no per-frame script)');
await wait(600); await press('■ Stop'); hub.vst.request = real;
ok(!LoopSong._test.playing() && hostCalls === 0 && document.querySelector('.ls-playhead').getAnimations().length === 0, 'stopped: no host call while playing, nothing left running (zero idle cost)');
// 5. export: mix + stems + MIDI (+ MP3) into the sketch folder
t0 = performance.now(); await press('Export'); const ex = await until(() => song().exports[0], 60000, 'the export'); out.timings.exportMs = Math.round(performance.now() - t0);
const files = [ex.mix, ex.midi, ex.json, ...ex.stems.map(s => s.path)];
ok(files.every(f => f.includes('/creative-park/' + HOME + '/')) && ex.stems.length === 4 && ex.stems.map(s => s.lane).join(',') === 'Lane 1,Lane 2,Lane 3,Re-render', `exported into “${HOME}”: the mix, ${ex.stems.length} stems (one per lane used), the MIDI, the song (${out.timings.exportMs} ms)`);
for (const f of files) ok((await hub.fs.stat(f))?.size > 40 && !(await hub.fs.stat(f + '.part')), 'written whole: ' + f.split('/').pop());
const read = async f => P.decodeWav(new Uint8Array(await hub.fs.read(f, { encoding: 'buffer', maxBytes: 200e6 })));
const mix = await read(ex.mix), stems = await Promise.all(ex.stems.map(s => read(s.path)));
const peak = Math.max(...mix.channels.map(ch => ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
ok(Math.abs(20 * Math.log10(peak) + 1) < .01 && Math.abs(mix.channels[0].length / 48000 - 8 * 4 * 60 / 200) < .01, `the mix: ${(mix.channels[0].length / 48000).toFixed(2)} s (8 bars at 200 BPM), peak ${(20 * Math.log10(peak)).toFixed(3)} dBFS`);
let worst = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < mix.channels[c].length; i++) { let sum = 0; for (const s of stems) sum += s.channels[c][i]; worst = Math.max(worst, Math.abs(sum - mix.channels[c][i])); }
ok(worst <= 5 / 32768, `the stems add up to the mix (max ${Math.round(worst * 32768)} LSB of 16-bit)`);
const midi = new Uint8Array(await hub.fs.read(ex.midi, { encoding: 'buffer' })); ok(String.fromCharCode(...midi.subarray(0, 4)) === 'MThd' && ex.notes === 2 * 2 + 2 + 2 + 2, `the song's MIDI: ${ex.notes} notes (clip 1 twice, clips 2–4)`);
const sj = JSON.parse(await hub.fs.read(ex.json)); ok(sj.kind === 'park-song' && sj.song.clips.length === 4 && sj.song.bpm === 200, 'the song itself saved as JSON next to it');
const ff = await hub.ffmpegStatus(); if (ff?.ffmpeg) ok(ex.mp3 && (await hub.fs.stat(ex.mp3))?.size > 1000 && /mix\.mp3$/.test(ex.mp3), 'ffmpeg here: an MP3 of the mix too'); else out.checks.push('MP3 skipped: no ffmpeg here');
ok(/Exported .* mix \+ 4 stems \+ MIDI/.test(document.querySelector('.ls-status').textContent) && /Last export/.test(document.querySelector('.ls-last').textContent), 'the panel says what was exported');
// 6. proof: "Finish a track" (added to the journal; the review stays the owner's choice)
const offerBtn = [...document.querySelectorAll('.ls-view button')].find(b => /Finish a track/.test(b.textContent)); ok(offerBtn, 'Offer as “Finish a track” proof');
offerBtn.click(); await until(() => song().exports[0].proof, 30000, 'proof saved');
// (sweep69) after saving the proof the offer opens the quest in Codex's Life space (its dialogs open there now): wait for it,
// so it can't land in the middle of the /song steps below (they bring the Sound desk back)
await until(() => H.activeId === 'tool:quests' && document.querySelector('.qj dialog[open]'), 15000, 'the quest opens in Life'); document.querySelector('.qj dialog[open]').close();
const qs = QuestJournal.paris.ui().state(), camp = qs.campaigns.find(c => c.id === 'c-pq-track'); ok(camp && camp.title === 'Finish a track' && camp.quests.length === 3, '"Finish a track" is in the journal');
const qid = song().exports[0].proof.quest, item = qs.submissions[qid].at(-1);
ok(item.proof.type === 'file' && /audio\/(mpeg|wav)/.test(item.proof.kind) && /refs/.test(item.proof.path) && /Park song · Belleville song · 8 bars at 200 BPM/.test(item.proof.excerpt) && /cannot hear/.test(item.proof.coverage) && /song made from park loops/.test(item.intent), 'the song is the proof: copied into references, honest coverage, an intent line');
ok(!item.review && !QuestCore.done(qs, qid), 'no XP and no review by itself');
let again = null; try { await LoopSong.offer(); } catch (err) { again = err.message; } ok(/already on this quest/.test(again || ''), 'the same song can\'t be submitted twice');
// 7. /song from chat, and the Lab keeps its /song
const def = Commands.get('song'), mine = def.variants?.find(x => x.when);
ok(mine && mine.when({ place: 'chat' }, '') && mine.when({ place: 'three' }, 'export') && !mine.when({ place: 'three' }, 'play') && !mine.when({ place: 'chat' }, 'seek 1:20') && mine.when({ place: 'creative' }, 'play'), '/song shares its name with the Lab\'s: Arrange for its words, a bare /song and in the Playground; the Lab\'s otherwise');
ok(/1\. Lane 1 · bar 1 · Belleville 4 bars ×2\n2\. Lane 2[\s\S]*\n4\. Re-render .*↻ Loud lead/.test(await say('list')), '/song list');
ok(/Belleville · 4 bars · 200 BPM/.test(await say('takes')), '/song takes (every park sketch)');
ok(document.querySelectorAll('.wb-sound-desk .wb-row').length - document.querySelectorAll('.ls-view .wb-row').length === rowsBefore, 'no new row in the desk itself (Arrange is a panel over it)');
ok(/Arrange: 3 park takes/.test(await say("")) && document.querySelector(".ls-view"), "a bare /song opens Arrange again (the song is kept)"); document.querySelector(`.ls-clip[data-clip="${c1.id}"]`).click(); await wait(300);
out.result = `Arrange with the fake host: ${out.checks.length} checks passed.`;
return JSON.stringify(out, null, 1);
