// (round 69, midilearn69) 🎹 Map my controller in the Sound desk — in the real app, own profile, with the fake host:
//   node dev/smoke.js --fake-vst --fake-vst-embed --script dev/checks/midilearn69.js --shot /tmp/midilearn69.png
// The real creative-vst-host.py runs with dev/fixtures/fake-vst-py: a sine 'Vital', a 'Fake Keys' controller that plays
// what this check appends to window.SMOKE_TMP/fake-midi-inbox.jsonl (MIDI messages, or {"knob": …} = a control turned in
// the plugin's own window), the plugin's window on the fake Win32 layer. Like the owner: open Vital, click
// "🎹 Map my controller", Learn, turn a knob (the mod wheel is named, not learned), find "cutoff", pick it; the row
// "CC 21 → Filter cutoff"; Take over (no jump until the knob reaches it), then it follows and the plugin's window shows
// it; Jump + From / To + Invert; Learn → "the last one you touched in Vital's window"; Remove; mappings back after the
// panel closes and the host restarts (Reset host); Serum 2 has its own; the panel never hides the plugin's window.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/midilearn69`, inbox = `${window.SMOKE_TMP}/fake-midi-inbox.jsonl`;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
let sent = ''; await hub.fs.write(inbox, '');
const controller = async (...items) => { sent += items.map(x => JSON.stringify(x) + '\n').join(''); await hub.fs.write(inbox, sent); };
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
const api = WorkbenchVST.api, card = name => [...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === name);
const live = () => hub.vst.request({ action: 'live-status', plugin: api.current()?.path });
const button = (text, root = document) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const panel = () => document.querySelector('.ml-panel');
const value = async key => (await api.values([key]))[key].value;
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const stats = () => document.querySelector('.wb-live-stats')?.textContent || '';

// 1. open Vital live; its window in the desk
card('Vital').click(); await until(() => /^LIVE/.test(stats()), 15000, 'LIVE'); await until(() => api.current()?.ready, 20000, 'controls ready');
await until(async () => (await live()).midi.open.includes('Fake Keys'), 6000, 'controller open');
button('Open editor here').click(); await until(() => document.querySelector('.vx-frame')?.dataset.mode === 'embedded', 8000, 'editor in the desk');
// 2. the button, next to MIDI in, labelled
const mapBtn = button('🎹 Map my controller'); ok(mapBtn && mapBtn.closest('.wb-live-setup') && mapBtn.closest('.wb-live-setup').querySelector('select[aria-label="MIDI in"]'), 'a labelled "🎹 Map my controller" button sits next to MIDI in');
ok(!Lazy.loaded?.('midilearn'), 'the panel\'s code is not loaded before the first click');
let t0 = performance.now(); mapBtn.click(); await until(() => panel()?.querySelector('.ml-empty'), 8000, 'panel'); out.timings.firstOpenMs = Math.round(performance.now() - t0);
ok(/No knobs mapped yet\. Click Learn/.test(panel().textContent) && /Map my controller · Vital/.test(panel().textContent), `the panel opens with a helpful empty state (${out.timings.firstOpenMs} ms, code loaded on the click)`);
ok(/Pitch bend, the mod wheel and sustain always go straight to Vital/.test(panel().textContent), 'it says pitch bend / mod wheel / sustain pass untouched');
ok(button('Take over', panel()).getAttribute('aria-pressed') === 'true', 'Knob pickup: Take over by default');
// the panel sits above the instrument, never over the plugin's window (which stays shown)
const w0 = (await live()).editor.window; ok(w0 && !(Array.isArray(w0.region) && !w0.region.length) && panel().compareDocumentPosition(document.querySelector('.vx-frame')) & Node.DOCUMENT_POSITION_FOLLOWING, 'the plugin\'s window stays visible below the panel');
// 3. Learn: the mod wheel is named, then a knob is learned
button('Learn', panel()).click(); await until(() => button('Cancel learn', panel()), 5000, 'learning');
ok(/Turn a knob or move a fader/.test(panel().querySelector('.ml-step').textContent), 'Learn asks to turn a knob or move a fader');
await controller([0xB0, 1, 77]); await until(() => /mod wheel/.test(panel().querySelector('.ml-step').textContent), 5000, 'mod wheel named'); ok(true, 'moving the mod wheel is named, not learned');
t0 = performance.now(); await controller([0xB0, 21, 20]);
await until(() => /Got CC 21 · ch 1\. Now pick what it controls in Vital/.test(panel().querySelector('.ml-step').textContent), 5000, 'CC 21 learned'); out.timings.knobToLearnedMs = Math.round(performance.now() - t0);
ok(true, `turning a knob shows "Got CC 21 · ch 1" (${out.timings.knobToLearnedMs} ms)`);
const find = panel().querySelector('input[aria-label="Find a control"]'); ok(find, 'a searchable list of Vital\'s controls');
find.value = 'cutoff'; find.dispatchEvent(new Event('input', { bubbles: true }));
const item = await until(() => button('Filter cutoff', panel().querySelector('.ml-list')), 4000, 'cutoff listed'); ok(panel().querySelectorAll('.ml-item').length === 1, 'typing "cutoff" finds Filter cutoff');
item.click(); await until(() => /CC 21 → Filter cutoff/.test(panel().querySelector('.ml-rows').textContent), 5000, 'row');
ok(!panel().querySelector('.ml-step:not([hidden])') && button('Learn', panel()), 'picking it adds the row "CC 21 → Filter cutoff" and ends Learn');
// 4. Take over: the cutoff is at 70 %; the knob at 0 doesn't jump it
ok(near(await value('cutoff'), .7, 1e-6), 'the cutoff starts at 70 %');
await controller([0xB0, 21, 0]); await wait(400);
ok(near(await value('cutoff'), .7, 1e-6), 'Take over: the knob at 0 % leaves the cutoff at 70 % (no jump)');
await until(() => /turn the knob towards 70 %/.test(panel().querySelector('.ml-now').textContent), 4000, 'waiting line'); ok(true, `the row says it waits: "${panel().querySelector('.ml-now').textContent}"`);
const before = (await live()).editor.window, repaints0 = before.repaints;
t0 = performance.now(); await controller([0xB0, 21, 80], [0xB0, 21, 100], [0xB0, 21, 110]);
await until(async () => near(await value('cutoff'), 110 / 127, 1e-4), 5000, 'cutoff follows'); out.timings.knobToControlMs = Math.round(performance.now() - t0);
ok(true, `the knob passing 70 % picks it up; the cutoff follows to ${Math.round(110 / 127 * 100)} %`);
const shown = await until(async () => { const x = (await live()).editor.window; return near(x.shown?.cutoff ?? -1, 110 / 127, 1e-4) && x; }, 5000, 'plugin window shows it');
ok(shown.repaints > repaints0, `Vital's window shows the new cutoff (repainted ${shown.repaints - repaints0}×)`);
await until(() => /now 87 %/.test(panel().querySelector('.ml-now').textContent), 4000, 'row value'); ok(true, 'the row shows "now 87 %"');
// 5. Jump + From / To + Invert
button('Jump', panel()).click(); await until(() => button('Jump', panel()).getAttribute('aria-pressed') === 'true', 4000, 'jump on');
const setNum = async (label, v) => { const inp = panel().querySelector(`input[aria-label^="${label} (%)"]`); inp.value = String(v); inp.dispatchEvent(new Event('change', { bubbles: true })); await wait(300); };
await setNum('From', 20); await setNum('To', 60);
const inv = panel().querySelector('input[aria-label^="Invert"]'); inv.click(); await wait(300);
const st = await hub.vst.request({ action: 'midimap-status', plugin: api.current().path });
ok(st.pickup === 'jump' && near(st.maps[0].min, .2) && near(st.maps[0].max, .6) && st.maps[0].invert === true, 'Jump, From 20 % To 60 %, Invert: saved');
await controller([0xB0, 21, 127]); await until(async () => near(await value('cutoff'), .2, 1e-4), 5000, 'jump to 20 %'); ok(true, 'Jump + invert: knob up → the cutoff goes straight to 20 %');
await controller([0xB0, 21, 0]); await until(async () => near(await value('cutoff'), .6, 1e-4), 5000, 'knob down → 60 %'); ok(true, 'knob down → 60 %');
// pitch bend / mod wheel still reach the instrument (counted by the host, not taken)
const ev0 = (await live()).midi.events, taken0 = st.taken; await controller([0xE0, 0, 90], [0xB0, 1, 30]); await until(async () => (await live()).midi.events >= ev0 + 2, 4000, 'bend + wheel');
ok((await hub.vst.request({ action: 'midimap-status', plugin: api.current().path })).taken <= taken0 + 2, 'pitch bend and the mod wheel are not taken by the mappings');
// 6. Learn again: the control touched in Vital's window
button('Learn', panel()).click(); await until(() => button('Cancel learn', panel()), 5000, 'learning 2');
await controller([0xB0, 22, 64]); await until(() => /Got CC 22/.test(panel().textContent), 5000, 'CC 22');
await wait(400); await controller({ knob: 'macro_2', value: .61 });
const touched = await until(() => [...panel().querySelectorAll('.ml-touched')].find(b => /last one you touched in Vital's window: Macro 2/.test(b.textContent)), 6000, 'touched button');
ok(true, `"${touched.textContent}"`);
touched.click(); await until(() => /CC 22 → Macro 2/.test(panel().querySelector('.ml-rows').textContent), 5000, 'row 2'); ok(panel().querySelectorAll('.ml-row').length === 2, 'clicking it maps CC 22 → Macro 2');
button('Remove', panel().querySelectorAll('.ml-row')[1]).click(); await until(() => panel().querySelectorAll('.ml-row').length === 1, 4000, 'removed'); ok(true, 'Remove takes a row away');
await smoke({ shot: `${window.SMOKE_TMP}/midilearn69-panel.png` }).catch(() => {});
// 7. close / reopen; Reset host → the mapping comes back from the data folder
button('Close', panel()).click(); ok(!panel(), 'Close closes the panel');
const oldCard = card('Vital'); button('Reset host').click(); await until(() => !oldCard.isConnected && document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'the desk again after reset');
card('Vital').click(); await until(() => /^LIVE/.test(stats()), 15000, 'LIVE again'); await until(() => api.current()?.ready, 20000, 'controls again');
button('🎹 Map my controller').click(); await until(() => panel()?.querySelector('.ml-row'), 8000, 'rows back');
ok(/CC 21 → Filter cutoff/.test(panel().textContent) && button('Jump', panel()).getAttribute('aria-pressed') === 'true' && panel().querySelector('input[aria-label^="Invert"]').checked, 'after Reset host the mapping (range, invert, Jump) is back: saved for Vital in Hearth\'s data folder');
// 8. Serum 2 has its own
card('Serum 2').click(); await until(() => api.current()?.name === 'Serum 2' && api.current()?.ready, 20000, 'Serum 2');
await until(() => /Map my controller · Serum 2/.test(panel()?.textContent || '') && panel().querySelector('.ml-empty'), 8000, 'Serum 2 panel');
ok(true, 'switching to Serum 2: its own (empty) mappings in the same panel');
out.result = 'Map my controller: button next to MIDI in, lazy panel, Learn (mod wheel refused), searchable pick, Take over / Jump, range, invert, the plugin window repainted, the touched control, Remove, saved per instrument across a host restart.';
return JSON.stringify(out);
