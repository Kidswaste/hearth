// (round 62, parkjam62) Park jam in the real app, with the fake instrument host on a laptop with no UA interface:
//   node dev/smoke.js --fake-vst --fake-vst-no-ua --script dev/checks/parkjam62.js --shot /tmp/parkjam62.png
// The real creative-vst-host.py runs with dev/fixtures/fake-vst-py (fake Pedalboard: a sine 'Vital' with polyphony /
// oversampling controls; fake sounddevice: the laptop's speakers on MME / WASAPI + a Bluetooth hands-free headset). The
// laptop mic is a stubbed getUserMedia (an oscillator). Checked like the owner would use it on a bench: the owner's home
// output (MME, 128) → one tap on 🌳 Park mode → the built-in speakers on WASAPI shared at a safe buffer, polyphony /
// oversampling lowered, the screen dimmed, remembered for Belleville (not over the desk's own choice); 10 s of park
// ambience (shortened); a 4-bar loop played on the keys, saved in the park sketch's folder with its MIDI and the
// ambience layered under it; the loop offered as proof to the park quest (no XP before a review); the week's event;
// /jam park week / status / off putting everything back. Offline: no AI turn, no map tiles.
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Park jam UI: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/parkjam62`, SKETCH = 'Park sketch · Belleville · 18 Oct';
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = SKETCH; await hub.kvSet('creative-workbenches', project);
const weekEvents = []; document.addEventListener('hearth:quest-week', e => weekEvents.push(e.detail));
// the laptop mic: an oscillator through a MediaStream (what the stubbed getUserMedia gives the field recording)
const ac = new AudioContext(), osc = ac.createOscillator(), dest = ac.createMediaStreamDestination(); osc.frequency.value = 220; osc.connect(dest); osc.start();
let micAsks = 0; navigator.mediaDevices.getUserMedia = async c => { micAsks++; out.micConstraints = c; return dest.stream; };
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
const stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
const api = WorkbenchVST.api, live = () => hub.vst.request({ action: 'live-status', plugin: api.current()?.path });
const pick = (label, value) => { const s = document.querySelector(`select[aria-label="${label}"]`); s.value = String(value); s.dispatchEvent(new Event('change', { bubbles: true })); };
const press = async (label, root = document) => { const b = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === label); ok(b, 'button ' + label); b.click(); await wait(30); await until(() => !b.disabled, 30000, label); };
// 1. at home: Vital live, the owner's own choice is MME at 128 samples
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
const outSel = () => document.querySelector('select[aria-label="Audio output"]');
ok(![...outSel().options].some(o => /Universal Audio/.test(o.textContent)), 'no UA interface listed (the laptop alone)');
const mme = [...outSel().options].find(o => /Speakers .* · MME/.test(o.textContent)).value;
pick('Audio output', mme); await until(() => / · MME · /.test(stats()), 8000, 'MME live'); pick('Buffer', 128); await until(() => /128 samples/.test(stats()), 8000, 'buffer 128');
const homeSaved = WorkbenchUI.snapshot().vst.live?.saved; ok(homeSaved?.api === 'MME', 'the desk remembers the owner\'s own output (MME)');
ok(Math.round(api.get(['polyphony']).polyphony) === 16 && api.get(['oversampling']).oversampling === '2x', 'before: 16 voices, 2x oversampling ' + JSON.stringify(api.get(['polyphony', 'oversampling'])));
// 2. one tap: Park mode
let t0 = performance.now(); await press('🌳 Park mode'); await until(() => ParkJam.state()?.on, 20000, 'Park mode on'); out.timings.parkModeMs = Math.round(performance.now() - t0);
await until(() => /Speakers \(Realtek\(R\) Audio\) · WASAPI shared · 48 kHz · 512 samples/.test(stats()), 8000, 'live on the laptop speakers');
ok(true, `Park mode picks the built-in speakers on WASAPI shared at 512 samples (${out.timings.parkModeMs} ms): ${stats().slice(0, 80)}`);
ok(!(await live()).exclusive && (await live()).playing, 'shared (other apps keep their sound), still live');
ok(api.get(['polyphony']).polyphony === 8 && api.get(['oversampling']).oversampling === '1x', 'battery: polyphony 16 → 8, oversampling 2x → 1x');
ok((await hub.vst.request({ action: 'values', plugin: api.current().path, keys: ['polyphony'] })).values.polyphony.value === 8, 'the lowered polyphony reached the running instrument');
ok(document.documentElement.classList.contains('parkjam-dim') && getComputedStyle(document.body, '::after').pointerEvents === 'none', 'the screen dims (an overlay that never takes a click)');
ok(ParkJam.state().place === 'Belleville' && /Park jam · Belleville · capture/.test(document.querySelector('.wb-park summary').textContent), 'the place comes from the park sketch (Belleville)');
ok(ParkJam.state().hushed === true && window.Power.quietNow(), 'Hearth\'s background timers hushed while in the park (as ▶ Play does)');
const mem = WorkbenchUI.snapshot().vst.park.places.belleville; ok(mem?.output?.name === 'Speakers (Realtek(R) Audio)' && mem.output.api === 'Windows WASAPI' && mem.buffer === 512 && mem.instrument === 'Vital', 'remembered for Belleville: output by name, buffer, instrument');
ok(WorkbenchUI.snapshot().vst.live?.saved?.api === 'MME', 'the desk\'s own remembered output is untouched (home stays home)');
ok(document.querySelector('.wb-park-toggle')?.getAttribute('aria-pressed') === 'true', 'the button shows Park mode on');
// 3. the park ambience: the laptop mic (stubbed), shortened from 10 s for the test
t0 = performance.now(); const amb = await ParkJam.recordAmbience(1.5); out.timings.ambienceMs = Math.round(performance.now() - t0);
ok(micAsks === 1 && out.micConstraints.audio.echoCancellation === false && amb.seconds > 1 && amb.channels[0].some(v => Math.abs(v) > .05), `the field recording keeps the mic's sound, unprocessed (${amb.seconds.toFixed(2)} s)`);
ok(/creative-park\/Park sketch · Belleville · 18 Oct\/Belleville loop .* ambience\.wav$/.test(amb.path) && (await hub.fs.stat(amb.path))?.size > 1000, 'ambience saved in the park sketch\'s folder');
// 4. a 4-bar loop at 200 BPM (4.8 s), right away, played on the on-screen keys, from the fold's own controls
const fold = document.querySelector('.wb-park'); fold.open = true;
pick('Loop length', 4); const bpm = document.querySelector('input[aria-label="Tempo (BPM)"]'); bpm.value = '200'; bpm.dispatchEvent(new Event('change', { bubbles: true })); pick('Starts', 'now');
ok(document.querySelector('input[aria-label="Layer park ambience"]').checked, 'ambience layering on by default');
const rec = [...fold.querySelectorAll('button')].find(b => b.textContent === 'Record loop'); t0 = performance.now(); rec.click();
await until(() => /Recording · \d+ %/.test(document.querySelector('.wb-park-progress')?.textContent || ''), 5000, 'recording progress');
const key = document.querySelector('.wb-key'); key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41 })); await wait(500); key.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41 }));
const k2 = document.querySelectorAll('.wb-key')[4]; await wait(300); k2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 42 })); await wait(400); k2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 42 }));
await until(() => ParkJam._test.takes().length === 1, 20000, 'the take saved'); out.timings.loopMs = Math.round(performance.now() - t0);
const take = ParkJam._test.takes()[0];
ok(take.bars === 4 && take.bpm === 200 && Math.abs(take.seconds - 4.8) < 1e-6 && take.notes === 2, `a 4-bar loop at 200 BPM: ${take.seconds} s, ${take.notes} notes played live (${out.timings.loopMs} ms)`);
ok(take.sketch === SKETCH && take.place === 'Belleville' && take.output === 'Speakers (Realtek(R) Audio)' && take.instrument === 'Vital' && /^\d{4}-W\d\d$/.test(take.week), 'the take knows its sketch, park, output, instrument and week');
for (const k of ['loop', 'layered', 'midi']) ok(take[k]?.includes('/creative-park/Park sketch · Belleville · 18 Oct/') && (await hub.fs.stat(take[k]))?.size > 40, `${k} file saved in the park sketch`);
const loopPcm = ParkJamCore.decodeWav(new Uint8Array(await hub.fs.read(take.loop, { encoding: 'buffer', maxBytes: 80e6 }))), layered = ParkJamCore.decodeWav(new Uint8Array(await hub.fs.read(take.layered, { encoding: 'buffer', maxBytes: 80e6 })));
ok(loopPcm.channels[0].length === Math.round(4.8 * 48000) && layered.channels[0].length === loopPcm.channels[0].length, 'loop and layered WAV are exactly 4 bars long');
const rms = ch => Math.sqrt(ch.reduce((n, v) => n + v * v, 0) / ch.length), quiet = (ch, a, b) => rms(ch.subarray(a, b));
ok(rms(loopPcm.channels[0]) > .01, 'the loop holds the notes played');
const tail = [Math.round(4.0 * 48000), Math.round(4.6 * 48000)]; ok(quiet(loopPcm.channels[0], ...tail) < 1e-4 && quiet(layered.channels[0], ...tail) > .01, 'the park ambience is layered under the loop (heard where nothing was played)');
const notesJson = JSON.parse(await hub.fs.read(take.loop.replace(/\.wav$/, '.json'))); ok(notesJson.notesPlayed.length === 2 && notesJson.notesPlayed[0].note === 60 && notesJson.notesPlayed[1].note === 64, 'the notes kept (C4, E4) next to the loop');
const midi = new Uint8Array(await hub.fs.read(take.midi, { encoding: 'buffer' })); ok(String.fromCharCode(...midi.subarray(0, 4)) === 'MThd' && midi.some((v, i) => v === 0x90 && midi[i + 1] === 64), 'a MIDI file of the notes');
await until(() => document.querySelector('.wb-park-take audio'), 5000, 'the take card'); ok(/4 bars · 200 BPM · 2 notes · \+ ambience/.test(document.querySelector('.wb-park-take').textContent), 'the take shows under the fold with a player');
ok(weekEvents.length === 1 && weekEvents[0].kind === 'park-jam' && weekEvents[0].week === take.week && weekEvents[0].path === take.layered, 'the week\'s review hears about the loop (hearth:quest-week)');
const jam = Commands.get('jam'); const said = []; const ctx = { say: t => said.push(t), agentId: H.claudeAgent().id };
ok(/This week outside .*\n• Belleville: 4 bars at 200 BPM, 2 notes \+ ambience/.test(await jam.run('park week', ctx)), '/jam park week lists it');
ok((jam.complete('park ') || []).some(x => x.value === 'park record 4'), '/jam park suggestions');
await wait(300); // the screenshot moment is later; first the proof
// 5. proof: the loop is offered to the park quest (Codex's proof flow; no XP before a review)
const offerBtn = [...document.querySelectorAll('.wb-park-take button')].find(b => b.textContent === 'Offer as park-quest proof'); ok(offerBtn, 'Offer as park-quest proof');
offerBtn.click(); await until(() => ParkJam._test.takes()[0]?.proof, 30000, 'proof saved');
const qs = QuestJournal.paris.ui().state(), camp = qs.campaigns.find(c => c.id === 'c-pq-park'); ok(camp && camp.quests.some(q => q.id), 'the park quest is in the notebook');
const [qid, subs] = Object.entries(qs.submissions).find(([k]) => camp.quests.some(q => q.id === k)); const item = subs.at(-1);
ok(item.proof.type === 'file' && item.proof.kind === 'audio/wav' && /refs/.test(item.proof.path) && item.proof.bytes > 1000 && /^[a-f0-9]{64}$/.test(item.proof.fingerprint), 'proof: the layered WAV, copied into Hearth\'s references');
ok(/Park jam loop · Belleville · 4 bars of 4 at 200 BPM/.test(item.proof.excerpt) && /2 notes played live/.test(item.proof.excerpt) && /cannot hear/.test(item.proof.coverage) && /Made outside at Belleville/.test(item.intent), 'proof text: what was played, honest coverage, the owner\'s intent line');
ok(!item.review && !QuestCore.done(qs, qid), 'no XP and no review by itself: reviewing stays the owner\'s choice');
ok(ParkJam._test.takes()[0].proof?.quest === qid && weekEvents.length === 2 && weekEvents[1].proof?.quest === qid, 'the week\'s review hears the loop became proof');
await Lazy.load('questhud'); const rv = WeekQuestCore.review(QuestCore, qs, WeekQuestCore.reviewWeek()); ok(rv.moments.some(m => m.quest === qid && m.what === item.proof.title && /Park jam loop · Belleville/.test(m.note)), 'the loop is one of this week\'s moments in the week in review (weekquest62)');
let again = null; try { await ParkJam.offer(take.id); } catch (err) { again = err.message; } ok(/already on this quest/.test(again || ''), 'the same loop can\'t be submitted twice (Codex\'s rule)');
// 6. back to the desk; /jam park status / off put everything back
ok(/Park mode on · Belleville/.test(await jam.run('park status', ctx)), '/jam park status');
t0 = performance.now(); const offText = await jam.run('park off', ctx); out.timings.offMs = Math.round(performance.now() - t0);
ok(/Park mode off: polyphony \/ oversampling back, output and buffer back/.test(offText), offText);
await until(() => / · MME · .*128 samples/.test(stats()) || (/PAUSED/.test(stats()) && api.output().buffer === 128), 8000, 'home output back');
ok(api.output().buffer === 128 && api.output().device?.api === 'MME', 'the owner\'s MME output and 128 samples are back');
ok(Math.round(api.get(['polyphony']).polyphony) === 16 && api.get(['oversampling']).oversampling === '2x' && !document.documentElement.classList.contains('parkjam-dim'), 'polyphony / oversampling back, screen undimmed'); ok(!window.Power.quietNow(), 'background timers back');
// 7. /jam park belleville again: the remembered output, no question asked
ok(/Speakers \(Realtek\(R\) Audio\) \(as last time here\), 512 samples/.test(await jam.run('park belleville', ctx)), '/jam park belleville uses what was remembered there');
document.querySelector('.wb-park').open = true; document.querySelector('.wb-park').scrollIntoView({ block: 'center' });
await wait(500);
out.result = `Park jam with the fake laptop host: ${out.checks.length} checks passed.`;
return JSON.stringify(out, null, 1);
