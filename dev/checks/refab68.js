// (round 68, refab68) 🎧 Reference A/B in the Sound desk, in the real app, by CLICKING, with the fake instrument host (no
// audio device, no real plugins) and an isolated profile:
//   node dev/smoke.js --fake-vst --script dev/checks/refab68.js --shot /tmp/refab68.png
// Fixtures (generated here): a 30 s 48 kHz session sketch (light low end) in <data>/creative-sketches/<project>/ with its
// session in Sessions, and a 40 s 44.1 kHz reference WAV (quiet / LOUD 15–30 s / quiet; a heavier low end).
// Then: the 🎧 Reference button in the desk's top row (nothing loaded before) → the panel → "The desk" is silent (said in
// words) → a note → ↻ Measure again (the host's last 30 s, LUFS shown) → a text file dropped (refused in words) → the
// reference dropped (decoded, LUFS ≈ the generated file's, the loop = its loudest 15 s) → the sketch picked as yours →
// level-matched (the dB shown = the difference) → A ⇄ B (gains switch, playing) → the End handle dragged (the loop and the
// match follow) → Whole track → tone balance in words ("lighter") → the output line says Web Audio → ✕ frees the audio →
// "Use again" loads it by path → a track dropped on the 🎧 Reference button itself → nothing sent anywhere.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Reference A/B: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const sent = []; const realFetch = window.fetch; window.fetch = (u, ...a) => { sent.push(String(u?.url || u)); return realFetch(u, ...a); };
const realOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { sent.push(String(u)); return realOpen.call(this, m, u, ...a); };
const dir = `${window.SMOKE_TMP}/refab68`, PROJECT = 'Friday jam', SEP = navigator.platform.startsWith('Win') ? '\\' : '/';
try { localStorage.removeItem('hearth.refab.last'); } catch { /* fine */ }
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
await Lazy.load('creative');
// the generated sound: three tones (60 Hz / 1 kHz / 10 kHz) and a little noise
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const tones = (rate, sec, parts) => { const n = Math.round(sec * rate), x = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / rate, p = parts(t); x[i] = p[0] * Math.sin(2 * Math.PI * 60 * t) + p[1] * Math.sin(2 * Math.PI * 1000 * t) + p[2] * Math.sin(2 * Math.PI * 10000 * t) + rnd() * 0.01; } return x; };
const sk = tones(48000, 30, () => [0.04, 0.12, 0.03]);
const folder = (await hub.bouncelog.folder(PROJECT)).path, sketch = `${folder}${SEP}Sketch 2026-10-26 14.05.33.wav`;
await hub.fs.write(sketch, ParkJamCore.encodeWav({ rate: 48000, channels: [sk, Float32Array.from(sk)] }));
const RR = 44100, refL = tones(RR, 40, t => (t >= 15 && t < 30 ? [0.32, 0.3, 0.08] : [0.16, 0.15, 0.04]));
const refBytes = ParkJamCore.encodeWav({ rate: RR, channels: [refL, Float32Array.from(refL)] }), refPath = `${dir}/Reference.wav`; await hub.fs.write(refPath, refBytes);
const at = new Date(Date.now() - 3600e3).toISOString();
await hub.kvSet('music-sessions', { v: 1, sessions: [{ id: 'ses-friday', start: at, end: new Date(Date.now() - 2200e3).toISOString(), minutes: 23, used: { park: false, liveset: false, arrange: false }, instruments: ['Vital'], place: '', sketches: [{ path: sketch, at, seconds: 30 }], logged: null }] });
const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = PROJECT; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-instrument-card'), 15000, 'instrument cards');
const api = WorkbenchVST.api, stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
const shown = el => !!el && el.checkVisibility({ visibilityProperty: true });
const click = async (sel, re, root = document) => { const b = await until(() => [...root.querySelectorAll(sel)].find(x => re.test(x.textContent.trim()) && !x.disabled && shown(x)), 15000, String(re)); b.click(); await wait(30); return b; };
const said = () => document.querySelector('.ra-said')?.textContent || '';
const fileOf = (bytes, name, type) => new File([bytes], name, { type });
const drop = (target, file) => { const dt = new DataTransfer(); dt.items.add(file); target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); };

// 1. the button, labelled, in the desk's top row; nothing loaded before the click
ok(!Lazy.loaded('refab') && typeof RefAB === 'undefined', 'nothing of Reference A/B loads before its button is clicked (lazy group "refab")');
const rb = await until(() => [...document.querySelectorAll('.wb-sound-desk button')].find(b => b.textContent === '🎧 Reference' && shown(b)), 8000, 'the 🎧 Reference button');
const sessionsBtn = [...document.querySelectorAll('.wb-sound-desk button')].find(b => b.textContent === 'Sessions');
ok(sessionsBtn && rb.parentElement === sessionsBtn.parentElement && /reference track/.test(rb.title), 'a labelled "🎧 Reference" button sits in the desk\'s top row, next to Sessions');
let t0 = performance.now(); rb.click();
const panel = await until(() => document.querySelector('.wb-sound-desk > .ra-panel'), 8000, 'the panel'); out.timings.openMs = Math.round(performance.now() - t0);
ok(Lazy.loaded('refab') && /Drop a reference track here/.test(panel.textContent) && [...panel.querySelectorAll('button')].some(b => b.textContent === 'Choose a file…' && shown(b)) && /WAV · MP3 · FLAC · M4A/.test(panel.textContent), 'the panel: "Drop a reference track here", WAV · MP3 · FLAC · M4A, a "Choose a file…" button');
const truth = RefabCore.analyze([refL, refL], RR), truthWhole = RefabCore.integrated(truth), truthLoud = RefabCore.integrated(truth, 15, 30);
const sel = () => panel.querySelector('.ra-yours'); await until(() => sel()?.options.length >= 2, 8000, 'your sound choices');
const opts = [...sel().options].map(o => o.textContent.trim());
ok(/^The desk: the last 30 s Vital played$/.test(opts[0]) && opts.some(o => /^Sketch · .* · 30 s$/.test(o)), 'Your sound: "The desk: the last 30 s Vital played" first, then the session sketch: ' + opts.join(' | '));
await until(() => /(silent for the last 30 seconds|Nothing played in the desk yet)/.test(said()), 10000, 'the silent desk said').catch(() => { throw Error('a silent desk should be said in words; the panel says: "' + said() + '" / ' + (document.querySelector('.ra-yours-lufs')?.textContent || '')); });
ok(/play something, then measure again/.test(said()), 'a silent desk is said in words: "' + said() + '"');

// 2. a note, then ↻ Measure again: the host's last 30 s
await hub.vst.request({ action: 'midi', plugin: api.current().path, name: 'Vital', note: 69, on: true, velocity: 100 }); await wait(1200);
await hub.vst.request({ action: 'midi', plugin: api.current().path, name: 'Vital', note: 69, on: false }); await wait(150);
await click('.ra-panel button', /^↻ Measure again$/);
await until(() => /LUFS/.test(panel.querySelector('.ra-yours-lufs').textContent), 10000, 'the desk measured');
const deskL = RefAB._test.state().yours.lufs; ok(Number.isFinite(deskL) && /^≈ −\d+\.\d LUFS$/.test(panel.querySelector('.ra-yours-lufs').textContent) && /the last \d+ s the desk played/.test(said()), `↻ Measure again: the desk measures ${panel.querySelector('.ra-yours-lufs').textContent} ("${said()}")`);

// 3. a text file dropped: refused in words; the reference dropped: decoded, measured, its loudest 15 s looped
drop(panel, fileOf(new TextEncoder().encode('hello'), 'notes.txt', 'text/plain')); await until(() => /isn't an audio file/.test(said()), 4000, 'refusal');
ok(/“notes\.txt” isn't an audio file/.test(said()) && !RefAB._test.state().ref, 'a dropped text file is refused in words, nothing loaded');
t0 = performance.now(); drop(panel, fileOf(refBytes, 'Reference.wav', 'audio/wav'));
await until(() => RefAB._test.state().ref && panel.querySelector('.ra-cv'), 15000, 'the reference measured'); out.timings.refMs = Math.round(performance.now() - t0);
const R = RefAB._test.state().ref;
ok(R.name === 'Reference.wav' && Math.abs(R.lufs - truthWhole) < 0.2 && panel.querySelector('.ra-refline').textContent.includes(RefabCore.lufsText(R.lufs)), `the reference (44.1 kHz, decoded to 48 kHz) measures ${RefabCore.lufsText(R.lufs)}; the file itself: ${truthWhole.toFixed(2)} LUFS`);
ok(Math.abs(R.region.start - 15) < 0.3 && Math.abs(R.region.end - R.region.start - 15) < 1e-6 && /^Loop 0:1\d\.\d – 0:[23]\d\.\d \(15\.0 s\) · ≈ −/.test(panel.querySelector('.ra-loop').textContent), `the loop is its loudest 15 s: "${panel.querySelector('.ra-loop').textContent}"`);
ok(panel.querySelectorAll('.ra-h[role=slider]').length === 2 && [...panel.querySelectorAll('.ra-h-label')].map(x => x.textContent).join() === 'Start,End', 'two handles on the waveform, labelled Start / End');

// 4. the sketch as yours: level-matched, the dB shown
const sv = [...sel().options].find(o => /^Sketch/.test(o.textContent.trim())).value; sel().value = sv; sel().dispatchEvent(new Event('change'));
await until(() => RefAB._test.state().yours?.key === sv, 10000, 'the sketch measured');
const Y = RefAB._test.state().yours, refLoop = RefabCore.integrated(R.res, R.region.start, R.region.end), diff = refLoop - Y.lufs, mt = panel.querySelector('.ra-match').textContent;
ok(diff > 3 && Math.abs(refLoop - truthLoud) < 0.2 && mt.includes(`the reference plays ${diff.toFixed(1)} dB quieter, so both sit at ${RefabCore.lufsText(Y.lufs)}`), `level-matched in words: "${mt}"`);

// 5. A ⇄ B: playing, the gains switch (the reference turned down by the difference)
await click('.ra-panel button.ra-ab', /A ⇄ B/);
let P = RefAB._test.state().play; ok(P && RefAB._test.state().ab === 'B' && /Hearing B · the reference/.test(panel.querySelector('.ra-ab').textContent) && panel.querySelector('.ra-play').textContent === '■ Stop', 'A ⇄ B: playing, now B · the reference; ▶ Play became ■ Stop');
await wait(250); ok(Math.abs(P.b.gain.value - 10 ** (-diff / 20)) < 0.01 && P.a.gain.value < 0.01, `B: the reference plays at ${(20 * Math.log10(P.b.gain.value)).toFixed(1)} dB, yours is silent`);
await click('.ra-panel button.ra-ab', /A ⇄ B/); await wait(250); P = RefAB._test.state().play;
ok(RefAB._test.state().ab === 'A' && Math.abs(P.a.gain.value - 1) < 0.01 && P.b.gain.value < 0.01 && /Hearing A · yours/.test(panel.querySelector('.ra-ab').textContent), 'A: yours at 0 dB, the reference silent');
ok(P.sb.loop && Math.abs(P.sb.loopStart - R.region.start) < 1e-6 && Math.abs(P.sb.loopEnd - R.region.end) < 1e-6 && P.sa.loop, 'the reference loops its region; yours loops whole');

// 6. the End handle dragged: the loop, its loudness and the match follow (and the playing loop)
const wave = panel.querySelector('.ra-wave'), xOf = t => { const r = wave.getBoundingClientRect(); return r.left + t / R.res.seconds * r.width; };
const dragTo = async (el, from, to) => { const o = { bubbles: true, pointerId: 1, button: 0, isPrimary: true }; el.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: from, clientY: 10 })); for (let i = 1; i <= 6; i++) { el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: from + (to - from) * i / 6, clientY: 10 })); await wait(24); } el.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: to, clientY: 10 })); await wait(40); };
const before = mt; await dragTo(panel.querySelector('.ra-h-end'), xOf(R.region.end), xOf(38));
ok(Math.abs(R.region.end - 38) < 0.3 && panel.querySelector('.ra-match').textContent !== before && Math.abs(RefAB._test.state().play.sb.loopEnd - R.region.end) < 1e-6, `End dragged to 38 s: "${panel.querySelector('.ra-loop').textContent}"; the match follows ("${panel.querySelector('.ra-match').textContent}")`);
await click('.ra-panel button', /^Whole track$/); ok(/^Whole track 0:00\.0 – 0:40\.0/.test(panel.querySelector('.ra-loop').textContent) && panel.querySelector('.ra-h-start').hidden, 'Whole track: the loop is all of it (handles hidden); the button now says "Loudest part"');
await click('.ra-panel button', /^Loudest part$/);

// 7. tone balance in words, bars
const rows = [...panel.querySelectorAll('.ra-band')].map(r => [r.querySelector('.ra-band-name').textContent, r.querySelector('.ra-band-words').textContent]);
ok(rows.length === 3 && rows.map(r => r[0]).join() === 'Low,Mid,High' && /^Your low end is \d+ dB lighter than the reference\.$/.test(rows[0][1]) && panel.querySelector('.ra-band[data-band=low] .ra-fill.ra-less'), 'tone balance: Low / Mid / High rows; "' + rows.map(r => r[1]).join(' · ') + '"');
ok(panel.querySelector('.ra-tone-first').textContent.length > 10, 'the biggest difference is said first: "' + panel.querySelector('.ra-tone-first').textContent + '"');
// 8. where it plays: the window's Web Audio, said
const outLine = panel.querySelector('.ra-out').textContent; ok(/Web Audio/.test(outLine) && /not through the instrument host/.test(outLine), 'the output line says it is the window\'s Web Audio: "' + outLine + '"');

// 9. ✕ frees the audio; "Use again" loads the last reference by its path
const ctx = RefAB._test.ctx(); await click('.ra-panel button', /^✕$/);
await until(() => ctx.state === 'closed', 4000, 'audio closed');
ok(!document.querySelector('.ra-panel') && !RefAB._test.state().play && !RefAB._test.state().ref, '✕ closes the panel, stops the sound and frees the audio (context closed)');
localStorage.setItem('hearth.refab.last', JSON.stringify({ path: refPath, name: 'Reference.wav' }));
rb.click(); const p2 = await until(() => document.querySelector('.ra-panel'), 8000, 'panel again');
await click('.ra-panel button', /^Use again: “Reference\.wav”$/); await until(() => RefAB._test.state().ref, 15000, 'reference by path');
ok(Math.abs(RefAB._test.state().ref.lufs - truthWhole) < 0.2 && RefAB._test.state().ref.path === refPath, '"Use again: “Reference.wav”" loads the last reference from its file');
await click('.ra-panel button', /^✕$/);
// 10. a track dropped on the 🎧 Reference button opens the panel with it
drop(rb, fileOf(refBytes, 'Dropped.wav', 'audio/wav')); await until(() => RefAB._test.state().ref?.name === 'Dropped.wav', 15000, 'drop on the button');
ok(document.querySelector('.ra-panel') && /Dropped\.wav/.test(document.querySelector('.ra-refline').textContent), 'a track dropped on the 🎧 Reference button opens the panel with it');
{ const s3 = document.querySelector('.ra-yours'); await until(() => s3.options.length >= 2, 8000, 'choices'); s3.value = sv; s3.dispatchEvent(new Event('change')); await until(() => RefAB._test.state().yours?.key === sv, 10000, 'the sketch again'); }
const r2 = await RefAB.run('ab'); ok(/^[AB] · /.test(r2), '/reference ab switches (secondary): "' + r2 + '"');
RefAB.close(); void p2;
const outward = sent.filter(u => /^(https?|wss?):/i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u));
ok(!outward.length, 'nothing sent anywhere' + (outward.length ? ': ' + outward.join(', ') : ''));
window.fetch = realFetch; XMLHttpRequest.prototype.open = realOpen;
return JSON.stringify(out);
