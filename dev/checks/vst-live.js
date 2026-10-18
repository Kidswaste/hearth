// (round 61, vstlive61) The Sound desk's live mode in the real app, with the fake host:
//   node dev/smoke.js --fake-vst --script dev/checks/vst-live.js --shot /tmp/vst-live.png
// The real creative-vst-host.py runs with dev/fixtures/fake-vst-py (fake Pedalboard / sounddevice / rtmidi): a UA
// interface on ASIO + WASAPI, a sine 'Vital', a 'Fake Keys' controller. Checked like the owner would use it: opening
// Vital goes live at once; the picker lists ASIO first with the UA preselected; buffer 64–1024; keys sound; a phrase;
// knob moves reach the instrument; the native editor doesn't stop audio and its change is read back; a busy window
// doesn't starve the audio; WASAPI exclusive; Pause; leaving the desk stops; the API for presethover61.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['live UI part: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/vst-live`;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
const stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
const live = () => hub.vst.request({ action: 'live-status', plugin: WorkbenchVST.api.current()?.path });
const pick = (label, value) => { const s = document.querySelector(`select[aria-label="${label}"]`); s.value = String(value); s.dispatchEvent(new Event('change', { bubbles: true })); };
// 1. open Vital: live in one press
let t0 = performance.now(); [...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'LIVE after opening'); out.timings.openToLiveMs = Math.round(performance.now() - t0);
ok(out.timings.openToLiveMs < 4000, `opening Vital goes live in ${out.timings.openToLiveMs} ms`);
// 2. the picker
const outSel = document.querySelector('select[aria-label="Audio output"]'), labels = [...outSel.options].map(o => o.textContent);
ok(/★ Universal Audio Thunderbolt · ASIO/.test(labels[0]) && outSel.value === outSel.options[0].value, `ASIO first, the UA interface preselected (${labels[0]})`);
ok(/★ .*Universal Audio.* · WASAPI exclusive/.test(labels[1]) && labels.at(-1).startsWith('System output'), 'then the UA WASAPI endpoint (exclusive, then shared), system output last');
ok(/Universal Audio Thunderbolt · ASIO · 48 kHz · 512 samples/.test(stats()), `the readout names device, driver, rate, buffer: ${stats()}`);
const bufSel = document.querySelector('select[aria-label="Buffer"]'); ok([...bufSel.options].map(o => +o.value).join() === '64,128,256,512,1024', 'buffer sizes 64–1024');
pick('Buffer', 128); await until(() => /128 samples/.test(stats()), 8000, 'buffer 128 live'); ok((await live()).buffer === 128 && (await live()).playing, 'changing the buffer while live restarts the stream at 128');
ok(/DSP \d+ % · \d+ underruns/.test(stats()), 'DSP load and underruns shown');
// 3. keys sound; controller listed
const key = document.querySelector('.wb-key'); t0 = performance.now(); key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31 }));
await until(async () => (await live()).peak > .01, 4000, 'the key to sound'); out.timings.keyToSoundMs = Math.round(performance.now() - t0); key.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31 }));
ok(true, `an on-screen key sounds in ${out.timings.keyToSoundMs} ms (incl. status polling)`);
const midiSel = document.querySelector('select[aria-label="MIDI in"]'); ok([...midiSel.options].some(o => o.value === 'Fake Keys') && midiSel.value === 'all', 'MIDI in lists the controller, all controllers by default');
await until(async () => (await live()).midi.open.includes('Fake Keys'), 4000, 'controller open'); ok(true, 'the controller is open in the host');
// 4. a phrase from the host's sequencer
pick('Phrase', 'arp'); await until(async () => (await live()).sequence, 4000, 'phrase running'); pick('Phrase', ''); await until(async () => !(await live()).sequence, 4000, 'phrase stopped'); ok(true, 'Phrase plays an arpeggio in the host and stops');
// 5. controls stream to the instrument
await until(() => document.querySelector('.wb-live-params input[aria-label="Level"]'), 15000, 'controls read');
const level = document.querySelector('.wb-live-params input[aria-label="Level"]'); level.value = .9; level.dispatchEvent(new Event('input', { bubbles: true }));
await until(async () => { const r = await hub.vst.request({ action: 'values', plugin: WorkbenchVST.api.current().path, keys: ['level'] }); return r.ok && Math.abs(r.values.level.value - .9) < 1e-6; }, 3000, 'knob to reach the instrument');
ok(true, 'a knob move reaches the running instrument without a re-render');
// 6. a busy window doesn't starve the audio (it lives in the host)
const pre = await live(); const busyUntil = performance.now() + 1500; while (performance.now() < busyUntil) { /* the window is busy */ }
const post = await live(); out.underrunsWhileBusy = post.underruns - pre.underruns; out.blocksWhileBusy = post.blocks - pre.blocks;
ok(post.playing && out.blocksWhileBusy > 400, `audio kept flowing while the window was blocked 1.5 s (${out.blocksWhileBusy} blocks, ${out.underrunsWhileBusy} underruns)`);
// 7. the API presethover61 builds on
const api = WorkbenchVST.api; let seen = null; const off = api.on('params', d => { seen = d; });
ok(api.version === 1 && api.current().ready && api.current().name === 'Vital' && api.current().live, 'api.current()');
ok(api.parameters({ query: 'macro', limit: 5 }).parameters.length === 5 && api.parameters({ query: 'macro' }).count >= 40, 'api.parameters({query, limit})');
await api.set({ level: .3 }, { source: 'hover' }); ok(seen?.source === 'hover' && seen.changed[0] === 'level' && api.get(['level']).level === .3, 'api.set streams + emits params');
let refused = false; try { await api.set({ level: 7 }); } catch { refused = true; } ok(refused, 'api.set refuses out-of-range values before touching the plugin');
await api.savePreset('Hover test'); ok(api.presets().some(p => p.label === 'Hover test'), 'api.savePreset'); await api.set({ level: .6 }); await api.loadPreset('Hover test'); ok(Math.abs(api.get(['level']).level - .3) < 1e-6 && (await live()).playing, 'api.loadPreset recalls while staying live');
off();
// 8. the native editor: audio keeps going; its knob change is read back
const press = async label => { const b = [...document.querySelectorAll('.wb-shell button')].find(b => b.textContent === label); ok(b, 'button ' + label); b.click(); await until(() => !b.disabled, 15000, label); };
const before = await live(); await press('Open native editor'); await until(() => /native editor open/.test(stats()), 4000, 'editor open in the readout');
await until(() => !/native editor open/.test(stats()), 8000, 'editor closed'); const afterEd = await live(); ok(afterEd.blocks > before.blocks + 100 && afterEd.playing, 'audio kept running with the native editor open');
await until(() => Math.abs((api.get(['macro_0']).macro_0 ?? 0) - .9) < 1e-6, 5000, 'editor change read back'); ok(true, 'the knob turned in the native editor shows in the desk afterwards');
// 9. WASAPI exclusive on the UA endpoint, then Pause
pick('Audio output', outSel.options[1].value); await until(() => /WASAPI exclusive/.test(stats()), 8000, 'exclusive live'); ok((await live()).exclusive, 'switching to WASAPI exclusive restarts the stream on the UA endpoint');
await press('Pause audio'); await until(() => /^PAUSED/.test(stats()), 4000, 'paused'); ok(!(await live()).playing && !(await live()).midi.open.length, 'Pause stops the stream and frees the controller');
// a key press while paused starts live audio again by itself
key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 32 })); await until(() => /^LIVE/.test(stats()), 8000, 'key starts live'); key.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 32 }));
ok(WorkbenchUI.snapshot().vst.live?.saved?.exclusive === true, 'the chosen device is remembered by name (+ exclusive)');
// 10. leaving the desk stops the stream (Codex's rule), the screenshot first
await wait(300);
const path = WorkbenchVST.api.current().path; activate(H.claudeAgent().id); await wait(400);
ok(!(await hub.vst.request({ action: 'live-status', plugin: path })).playing, 'leaving the Sound desk stops live audio');
activate('tool:creative'); CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-live-keys'), 15000, 'desk again');
await wait(500);
out.result = `Live mode UI with the fake host: ${out.checks.length} checks passed.`;
return JSON.stringify(out, null, 1);
