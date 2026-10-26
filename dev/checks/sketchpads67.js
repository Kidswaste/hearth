// (round 67, sketchpads67) Sketches → playable material, in the real app, by CLICKING, with the fake instrument host (no
// audio device, no real plugins) and an isolated profile:
//   node dev/smoke.js --fake-vst --script dev/checks/sketchpads67.js --shot /tmp/sketchpads67.png
// Fixtures: a generated 30-second 48 kHz sketch (a click track at 124 BPM, its first beat at 0.37 s, accents on the bar)
// in <data>/creative-sketches/<project>/, and one session in the Sessions list holding it (no tempo known: it is found).
// Then: Sessions › the sketch line has 🎛 Put on a pad and ✂ Trim loop → the trim: tempo found (124), handles snap to
// bars (drag, keys), a typed BPM, ▶ Preview loop (Web Audio loop points follow the handles), 💾 Save loop (a NEW WAV of
// exactly the bars, the sketch byte-for-byte unchanged) → the loop's line → 🎛 Put on a pad (pad 1, a loop pad) → the
// sketch itself on pad 2 (one-shot) → 🎤 Open the Live set → pad 1 plays in the host from creative-sketches → the loop in
// Arrange's takes and the Live set's shelf → Remove loop (to the Trash) → nothing sent anywhere.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Sketch pads: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const sent = []; const realFetch = window.fetch; window.fetch = (u, ...a) => { sent.push(String(u?.url || u)); return realFetch(u, ...a); };
const realOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { sent.push(String(u)); return realOpen.call(this, m, u, ...a); };
const dir = `${window.SMOKE_TMP}/sketchpads67`, PROJECT = 'Friday jam', BPM = 124, OFF = 0.37, SEP = navigator.platform.startsWith('Win') ? '\\' : '/';
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
await Lazy.load('creative');
// the generated sketch: 30 s, 48 kHz stereo, a click every beat at 124 BPM (low accent on each bar's first beat)
const rate = 48000, n = 30 * rate, Lc = new Float32Array(n), beat = 60 / BPM; let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
for (let i = 0; i < n; i++) Lc[i] = rnd() * 0.02;
for (let k = 0; OFF + k * beat < 30; k++) { const s = Math.round((OFF + k * beat) * rate), down = k % 4 === 0; for (let j = 0; j < 0.08 * rate && s + j < n; j++) Lc[s + j] += (down ? 0.9 : 0.35) * Math.exp(-j / (0.015 * rate)) * Math.sin(2 * Math.PI * (down ? 80 : 1200) * j / rate); }
const folder = (await hub.bouncelog.folder(PROJECT)).path, sketch = `${folder}${SEP}Sketch 2026-10-26 14.05.33.wav`;
const bytes = ParkJamCore.encodeWav({ rate, channels: [Lc, Float32Array.from(Lc)] }); await hub.fs.write(sketch, bytes);
const digest = async (f) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(await hub.fs.read(f, { encoding: 'buffer', maxBytes: 80e6 }))))).join(',');
const h0 = await digest(sketch);
const at = new Date(Date.now() - 3600e3).toISOString();
await hub.kvSet('music-sessions', { v: 1, sessions: [{ id: 'ses-friday', start: at, end: new Date(Date.now() - 2200e3).toISOString(), minutes: 23, used: { park: false, liveset: true, arrange: false }, instruments: ['Vital'], place: '', sketches: [{ path: sketch, at, seconds: 30 }], logged: null }] });
const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = PROJECT; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-instrument-card'), 15000, 'instrument cards');
const api = WorkbenchVST.api, stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
const shown = el => !!el && el.checkVisibility({ visibilityProperty: true });
const click = async (sel, re, root = document) => { const b = await until(() => [...root.querySelectorAll(sel)].find(x => re.test(x.textContent.trim()) && !x.disabled && shown(x)), 15000, String(re)); b.click(); await wait(30); return b; };
ok(!Lazy.loaded('sketchpads'), 'nothing of this loads before Sessions shows a sketch (lazy group "sketchpads")');

// 1. Sessions: the sketch line's two new buttons, in words
await click('.wb-sound-desk button', /^Sessions$/);
const line = await until(() => document.querySelector('.bl-panel .bl-sketch .sp-trim-btn')?.closest('.bl-sketch'), 8000, 'the sketch line\'s buttons');
ok(Lazy.loaded('sketchpads'), 'Sessions with a sketch in it loads the group');
const words = [...line.querySelectorAll('button')].filter(shown).map(b => b.textContent);
ok(words.includes('🎛 Put on a pad') && words.includes('✂ Trim loop') && words.includes('▶'), 'each sketch: ▶ · 🎛 Put on a pad · ✂ Trim loop (labelled, visible): ' + words.join(' · '));

// 2. ✂ Trim loop: the tempo found in the audio, the handles on bars
let t0 = performance.now(); await click('button', /^✂ Trim loop$/, line);
const box = await until(() => document.querySelector('.sp-trim .sp-cv') && document.querySelector('.sp-trim'), 8000, 'the trim'); out.timings.openMs = Math.round(performance.now() - t0);
const bpmIn = box.querySelector('.sp-bpm'), info = () => box.querySelector('.sp-info').textContent, T = () => SketchPads._test.open();
ok(Number(bpmIn.value) === BPM && /found in the audio/.test(box.querySelector('.sp-src').textContent), `no tempo in the session: found in the audio, ${bpmIn.value} BPM (${box.querySelector('.sp-src').textContent})`);
const bar = 4 * 60 / T().bpm, onGrid = t => Math.abs(((t - T().origin) / (bar / 4)) - Math.round((t - T().origin) / (bar / 4))) < 1e-6;
ok(T().plan.bars === 4 && onGrid(T().plan.start) && Math.abs(T().origin % bar - OFF) < 0.02 && /^4 bars · /.test(info()), `the first loop: 4 bars from the first bar line (${T().plan.start.toFixed(3)} s; the beat found at ${(T().origin % bar).toFixed(3)} s, the sketch's at ${OFF}): "${info()}"`);
ok(box.querySelectorAll('.sp-h[role=slider]').length === 2 && [...box.querySelectorAll('.sp-h-label')].map(x => x.textContent).join() === 'Start,End', 'two handles labelled Start / End (sliders for the keyboard too)');
const wave = box.querySelector('.sp-wave'), xOf = t => { const r = wave.getBoundingClientRect(); return r.left + t / T().dur * r.width; };
const dragTo = async (el, from, to) => { const o = { bubbles: true, pointerId: 1, button: 0, isPrimary: true }; el.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: from, clientY: 10 })); for (let i = 1; i <= 6; i++) { el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: from + (to - from) * i / 6, clientY: 10 })); await wait(16); } el.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: to, clientY: 10 })); await wait(30); };
const s0 = T().plan.start;
await dragTo(box.querySelector('.sp-h-end'), xOf(T().plan.end), xOf(s0 + 8 * bar + 0.3));
ok(T().plan.bars === 8 && Math.abs(T().plan.end - (s0 + 8 * bar)) < 1e-9 && /^8 bars/.test(info()), `End dragged to 8 bars + 0.3 s → snapped to exactly 8 bars: "${info()}"`);
await dragTo(box.querySelector('.sp-h-start'), xOf(s0), xOf(s0 + bar / 4 * 1.4));
ok(onGrid(T().plan.start) && Math.abs(T().plan.start - (s0 + bar / 4)) < 1e-9 && T().plan.bars === 8, `Start dragged 1.4 beats → snapped to the next beat (${T().plan.start.toFixed(3)} s), still whole bars`);
box.querySelector('.sp-h-end').focus(); box.querySelector('.sp-h-end').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await wait(20);
ok(T().plan.bars === 7, '← on the End handle: one bar shorter (7 bars), keyboard-only works');
await dragTo(box.querySelector('.sp-sel'), xOf(T().plan.start + 1), xOf(T().plan.start + 1 - bar / 4 * 1.1));
ok(Math.abs(T().plan.start - s0) < 1e-9 && T().plan.bars === 7, 'dragging the loop itself moves it a beat back, same length');
bpmIn.value = '20'; bpmIn.dispatchEvent(new Event('change')); await wait(20);
ok(Math.abs(Number(bpmIn.value) - T().bpm) < 1e-9 && /40 to 240/.test(box.querySelector('.sp-said').textContent), 'a tempo of 20 is refused in words ("' + box.querySelector('.sp-said').textContent + '")');
bpmIn.value = '128'; bpmIn.dispatchEvent(new Event('change')); await wait(20);
ok(T().bpm === 128 && box.querySelector('.sp-src').textContent === 'typed' && Math.abs(T().plan.seconds - T().plan.bars * 4 * 60 / 128) < 1e-9, `a typed tempo (128): the grid and the loop follow it ("${info()}")`);
bpmIn.value = String(BPM); bpmIn.dispatchEvent(new Event('change')); await wait(20);
box.querySelector('.sp-len').value = '4'; box.querySelector('.sp-len').dispatchEvent(new Event('change')); await wait(20);
ok(T().bpm === BPM && T().plan.bars === 4, 'back to 124 BPM; Length → 4 bars');

// 3. ▶ Preview loop (the window's Web Audio: no device to pick)
await click('button', /^▶ Preview loop$/, box); let src = await until(() => SketchPads._test.preview(), 4000, 'the preview');
ok(src.loop && Math.abs(src.loopStart - T().plan.start) < 1e-9 && Math.abs(src.loopEnd - T().plan.end) < 1e-9 && box.querySelector('.sp-preview').textContent === '■ Stop', `▶ Preview loop: the 4 bars go round (${src.loopStart.toFixed(3)}–${src.loopEnd.toFixed(3)} s), the button says ■ Stop`);
await dragTo(box.querySelector('.sp-h-end'), xOf(T().plan.end), xOf(T().plan.start + 2 * bar)); src = SketchPads._test.preview();
ok(src && T().plan.bars === 2 && Math.abs(src.loopEnd - T().plan.end) < 1e-9, 'the preview follows the handles (2 bars now)');
await click('button', /^■ Stop$/, box); ok(!SketchPads._test.preview() && box.querySelector('.sp-preview').textContent === '▶ Preview loop', '■ Stop stops it');

// 4. 💾 Save loop: a NEW file of exactly the bars; the sketch untouched
t0 = performance.now(); await click('button', /^💾 Save loop$/, box);
const loopLine = await until(() => document.querySelector(`.sp-loops .sp-loop`), 8000, 'the loop\'s line'); out.timings.saveMs = Math.round(performance.now() - t0);
const loopPath = loopLine.dataset.loop;
ok(loopPath.startsWith(folder) && /Sketch 2026-10-26 14\.05\.33 loop 2 bars 124 BPM\.wav$/.test(loopPath), 'saved beside the sketch: ' + loopPath.split(/[\\/]/).pop());
const wav = ParkJamCore.decodeWav(new Uint8Array(await hub.fs.read(loopPath, { encoding: 'buffer', maxBytes: 80e6 })));
ok(wav.rate === 48000 && wav.channels.length === 2 && wav.channels[0].length === Math.round(2 * 4 * 60 / BPM * 48000), `a 48 kHz stereo WAV of exactly 2 bars at 124 BPM (${wav.channels[0].length} frames)`);
ok(await digest(sketch) === h0, 'the sketch is byte-for-byte unchanged');
ok(/Saved “.*” beside the sketch \(the sketch is unchanged\)/.test(box.querySelector('.sp-said').textContent) && /2 bars · 124 BPM/.test(loopLine.textContent), 'the box says where it went; the loop has its own line: "' + loopLine.querySelector('span').textContent + '"');
const rawCard = await hub.fs.read(loopPath.replace(/\.wav$/, '.json')), card = JSON.parse(typeof rawCard === 'string' ? rawCard : new TextDecoder().decode(rawCard));
ok(card.kind === 'sketch-loop' && card.bpm === BPM && card.bars === 2 && card.from === sketch, 'its card beside it (tempo, bars, the sketch it came from)');

// 5. 🎛 Put on a pad: the loop on pad 1 (a loop pad), the whole sketch on pad 2 (one-shot)
await click('button', /^🎛 Put on a pad$/, loopLine);
const picker = await until(() => document.querySelector('.sp-pads .sp-songs') && document.querySelector('.sp-pads'), 5000, 'the pad picker');
ok(/Song 1/.test(picker.textContent) && picker.querySelectorAll('.sp-cell').length === 10 && [...picker.querySelectorAll('button.sp-free')].map(b => b.textContent).join() === '＋ 1', 'the picker: Song 1 with its 10 pads, the empty pad to click is "＋ 1"');
await click('button.sp-free', /^＋ 1$/, picker); await until(() => picker.querySelector('.sp-done'), 8000, 'on the pad');
const sc = () => LiveSet.set().scenes[0], clips = () => LiveSetCore.clips(sc());
ok(/✓ On pad 1 \(key 1\) of “Song 1”/.test(picker.textContent) && clips()[0].loop && clips()[0].bars === 2 && clips()[0].file === loopPath && sc().bpm === BPM, `the loop is on pad 1 as a loop pad (2 bars), played from where it is; the song took its tempo (${sc().bpm} BPM)`);
await click('button', /^🎛 Put on a pad$/, line); const picker2 = await until(() => document.querySelector('.sp-pads .sp-songs') && document.querySelector('.sp-pads'), 5000, 'the pad picker again');
if (typeof smoke === 'function') await smoke({ shot: `${window.SMOKE_TMP}/../sketchpads67-pads.png` }).catch(() => {});
ok(picker2.querySelectorAll('.sp-full').length === 1 && picker2.querySelector('button.sp-free').textContent === '＋ 2', 'pad 1 shows as used; the empty pad now is "＋ 2"');
await click('button.sp-free', /^＋ 2$/, picker2); await until(() => picker2.querySelector('.sp-done'), 8000, 'on pad 2');
ok(!clips()[1].loop && clips()[1].bars === SketchPadsCore.barsOf(30, BPM) && clips()[1].file === sketch && /124 BPM, found in the audio/.test(picker2.textContent), `the whole sketch on pad 2 as a one-shot (${clips()[1].bars} bars at 124 BPM): "${picker2.querySelector('.sp-done span').textContent}"`);

// 6. 🎤 Open the Live set → pad 1 plays in the (fake) host, from <data>/creative-sketches
await click('button', /^🎤 Open the Live set$/, picker2);
const view = await until(() => document.querySelector('.lv-view'), 8000, 'the Live set'); ok(!document.querySelector('.bl-panel') && view.querySelectorAll('.lv-clips .lv-pad').length === 2, 'the Live set opens with the two pads (Sessions closed)');
t0 = performance.now(); view.querySelector('.lv-clips .lv-pad .lv-hit').click();
await until(() => LiveSet._test.armed(), 20000, 'armed'); out.timings.armMs = Math.round(performance.now() - t0);
await until(() => LiveSet._test.status()?.pads?.[clips()[0].id]?.state === 'playing', 8000, 'pad 1 playing');
ok(true, 'pad 1 plays in the instrument host: the loop loaded straight from the sketches folder (main\'s clip guard lets it in)');
LiveSet.panic(); await wait(400);

// 7. the loop in the other pickers: Arrange's takes, the Live set's shelf
const list = await hub.parkSong.list(); ok(list.takes.some(t => t.kind === 'sketch-loop' && t.loop === loopPath), 'the park-take list (Arrange, the Live set\'s shelf) has the loop');
await click('.lv-view button', /^✎ Edit$/); const chip = await until(() => [...document.querySelectorAll('.lv-takes .lv-chip')].find(c => /Sketch loop/.test(c.textContent)), 8000, 'the Live set\'s shelf chip');
ok(chip, 'the Live set\'s "Park takes" shelf offers "' + chip.textContent.replace('＋', '').trim() + '"');
await click('.lv-view button', /^✓ Done$/); await click('.lv-view button', /^✕$/); await until(() => !document.querySelector('.lv-view'), 5000, 'closed');
await click('.wb-sound-desk button', /^Arrange loops$/); await until(() => document.querySelector('.ls-view'), 8000, 'Arrange');
await until(() => LoopSong._test.takes().length, 8000, 'Arrange takes');
ok(LoopSong._test.takes().some(t => t.loop === loopPath) && [...document.querySelectorAll('.ls-view option')].some(o => /Sketch loop · 2 bars · 124 BPM/.test(o.textContent)), 'Arrange\'s Take picker lists "Sketch loop · 2 bars · 124 BPM"');
LoopSong.close?.();

// 8. Remove loop → the Trash (its card too); the sketch stays
await click('.wb-sound-desk button', /^Sessions$/);
const l2 = await until(() => document.querySelector('.bl-panel .sp-loop'), 8000, 'the loop line again');
if (window.SMOKE_TMP && typeof smoke === 'function') { await click('button', /^✂ Trim loop$/, document.querySelector('.bl-panel .bl-sketch')); await until(() => document.querySelector('.sp-trim .sp-cv'), 8000, 'trim'); await smoke({ shot: `${window.SMOKE_TMP}/../sketchpads67-trim.png` }).catch(() => {}); }
await click('button', /^Remove loop$/, document.querySelector('.bl-panel .sp-loop'));
await until(async () => !(await hub.fs.stat(loopPath).catch(() => null))?.size, 8000, 'the loop to leave');
const cardGone = await until(async () => !(await hub.fs.stat(loopPath.replace(/\.wav$/, '.json')).catch(() => null))?.size, 4000, 'the card to leave').catch(() => false), sketchKept = (await hub.fs.stat(sketch).catch(() => null))?.size === bytes.length;
const lineGone = await until(() => !document.querySelector('.bl-panel .sp-loop'), 4000, 'the loop line to go').catch(() => false);
ok(cardGone && sketchKept && lineGone, `Remove loop: the loop and its card go to the Trash, the sketch stays (card gone ${cardGone}, sketch kept ${sketchKept}, line gone ${lineGone}; said: ${document.querySelector('.cp-feedback')?.textContent || ''})`);
await click('.bl-panel button', /^✕$/);

// 9. secondary: from chat, /sessions trim opens the newest sketch's trim (the clicks above are the way in)
const said = await BounceLog.run('trim'); ok(document.querySelector('.bl-panel .sp-trim .sp-cv') && /drag the handles/.test(said), '/sessions trim opens the newest sketch\'s trim: "' + said + '"');
BounceLog.closePanel(); ok(!SketchPads._test.open(), 'closing Sessions closes the trim (and its preview)');
const outward = sent.filter(u => /^(https?|wss?):/i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u));
ok(!outward.length, 'nothing sent anywhere' + (outward.length ? ': ' + outward.join(', ') : ''));
window.fetch = realFetch; XMLHttpRequest.prototype.open = realOpen;
return JSON.stringify(out);
