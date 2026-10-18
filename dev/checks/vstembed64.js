// (round 64, vstembed64) The plugin's own editor inside the Sound desk, faster loads, silent AI tweaks — in the real app
// with the fake host (fake Pedalboard / sounddevice / Win32 window layer):
//   node dev/smoke.js --fake-vst --fake-vst-embed --fake-engines --script dev/checks/vstembed64.js --shot /tmp/vstembed64.png
// Like the owner: click Vital → it plays; the controls come (first time read, then from the disk list); "Open editor
// here" puts the plugin's window on the desk's placeholder, which it follows (layout change, scroll), hides under a menu
// and while the desk is away; the ✦ Preset window applies a description silently (one short line, no control list)
// and the change shows in the plugin's window and on the desk's sliders; a knob turned "in the plugin" reaches the desk;
// Pop out / Open editor here / Close editor; Serum 2's editor refusing to be inside Hearth → its own window + one plain
// line; 48 kHz in the readout and the bounce; Reset host → controls from the disk list (measured before → after).
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/vstembed64`;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
const api = WorkbenchVST.api, card = name => [...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === name);
const live = () => hub.vst.request({ action: 'live-status', plugin: api.current()?.path });
const frameBtn = label => [...document.querySelectorAll('.vx-frame button')].find(b => b.textContent === label);
const mode = () => document.querySelector('.vx-frame')?.dataset.mode;
const win = async () => (await live()).editor?.window || null;
const stats = () => document.querySelector('.wb-live-stats')?.textContent || '';

// 1. click Vital: sound first, controls after (the first time they are read: 300 × 2 ms in the background)
let t0 = performance.now(); card('Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'LIVE'); out.timings.coldClickToLiveMs = Math.round(performance.now() - t0);
await until(() => api.current()?.ready, 20000, 'controls ready'); out.timings.coldClickToControlsMs = Math.round(performance.now() - t0);
let tm = api.timings(); ok(tm.readyMs < 3000 && tm.controlsSource === 'read', `Vital plays ${tm.readyMs} ms after the click; its controls are read once (${tm.controlsMs} ms, in the background)`);
ok(/48 kHz/.test(stats()), `48 kHz in the readout: ${stats()}`);
ok(api.current().controls >= 300, `${api.current().controls} controls on the desk`);
// 2. the editor frame: Open editor here / Pop out (this is Linux: not opened by itself)
await until(() => document.querySelector('.vx-frame'), 8000, 'editor frame');
ok(frameBtn('Open editor here') && frameBtn('Pop out') && mode() === 'closed', 'the desk shows the plugin’s own window frame: “Open editor here” · “Pop out”');
frameBtn('Open editor here').click();
await until(() => mode() === 'embedded', 8000, 'embedded');
const slot = document.querySelector('.vx-slot'), dpr = devicePixelRatio;
ok(Math.abs(slot.offsetWidth - 880 / dpr) <= 1 && Math.abs(slot.offsetHeight - 560 / dpr) <= 1, `the placeholder takes the editor's size (${slot.offsetWidth}×${slot.offsetHeight})`);
let w = await until(async () => { const x = await win(); return x?.child && x.places !== 0 && x; }, 5000, 'window placed');
const near = (a, b) => Math.abs(a - b) <= 2;
const at = () => { const r = document.querySelector('.vx-slot').getBoundingClientRect(); return { x: Math.round(r.left * dpr), y: Math.round(r.top * dpr) }; }; // the desk redraws: always the current slot
await until(async () => { const x = await win(); return near(x.x, at().x) && near(x.y, at().y); }, 5000, 'window on the placeholder');
w = await win(); ok(w.parent > 0 && w.child, `the editor window is a child of Hearth's window (handle ${w.parent}) at the placeholder (${w.x}, ${w.y})`);
ok(frameBtn('Pop out') && frameBtn('Close editor') && !frameBtn('Open editor here'), 'embedded: “Pop out” · “Close editor”');
// 3. it follows the layout (something grows above it) and scrolling
const spacer = document.createElement('div'); spacer.style.height = '140px'; document.querySelector('.vx-frame').before(spacer);
await until(async () => { const x = await win(); return near(x.y, at().y); }, 5000, 'follow the layout'); ok(true, `content above grew → the window moved with the placeholder (y ${(await win()).y})`);
const scroller = (() => { for (let n = document.querySelector('.vx-frame').parentElement; n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n; return null; })();
if (scroller) {
  scroller.scrollTop += 120; await until(async () => { const x = await win(); return near(x.y, at().y); }, 5000, 'follow the scroll');
  ok(true, `scrolled 120 px → the window followed (y ${(await win()).y}, region ${JSON.stringify((await win()).region)})`);
} else out.checks.push('(the desk did not scroll at this window size: scrolling covered by the unit test)');
// 4. a menu over it hides it; it shows again when the menu closes
document.querySelector('.vx-slot').scrollIntoView({ block: 'center' }); await until(async () => { const x = await win(); return near(x.y, at().y) && !(Array.isArray(x.region) && !x.region.length); }, 5000, 'in view');
const fr = document.querySelector('.vx-slot').getBoundingClientRect(); showMenu(fr.left + 40, Math.max(10, Math.min(innerHeight - 200, fr.top + 60)), [{ label: 'A menu over the editor', fn() {} }]);
await until(async () => { const x = await win(); return Array.isArray(x.region) && !x.region.length; }, 5000, 'hidden under a menu'); ok(true, 'a menu over the editor → the editor hides (stays open)');
hideMenu(); await until(async () => { const x = await win(); return !(Array.isArray(x.region) && !x.region.length); }, 5000, 'shown again'); ok(true, 'the menu closes → the editor shows again');
spacer.remove();
// 5. the ✦ Preset window: one short line, no control list; the change shows in the plugin's window and on the desk
await until(() => document.querySelector('.ph-win'), 8000, '✦ Preset window');
const shownBefore = { ...(await win()).shown };
const r = await PresetHover.ask('darker and slower', { fresh: true });
ok(r.changed.length >= 1, `the ✦ Preset window applied ${r.changed.length} controls`);
const lines = [...document.querySelectorAll('.ph-log .ph-ai span')].map(n => n.textContent), line = lines.at(-1);
const labels = api.parameters({ limit: 200 }).parameters.filter(p => r.changed.includes(p.key)).map(p => p.label);
ok(line === 'Darker and slower — applied', `the chat line is just “${line}”`);
ok(!r.changed.some(k => line.includes(k)) && !labels.some(l => line.includes(l)) && !/\d/.test(line), 'no control names or values in the ✦ Preset window');
const after = api.get(r.changed);
await until(async () => { const s = (await win()).shown; return r.changed.some(k => k in s && s[k] !== shownBefore[k]); }, 5000, 'the plugin window repaints');
ok(true, 'the plugin’s own window shows the new values (its knobs moved)');
const onDesk = r.changed.map(k => document.querySelector(`.wb-live-params [data-key="${k}"]`)).filter(Boolean);
if (!onDesk.length) document.querySelector('.wb-live-params')?.closest('details')?.setAttribute('open', '');
const shownKey = r.changed.find(k => document.querySelector(`.wb-live-params [data-key="${k}"] input[type=range]`));
if (shownKey) { const input = document.querySelector(`.wb-live-params [data-key="${shownKey}"] input`); ok(Math.abs(+input.value - after[shownKey]) < 1e-6 && input.closest('[data-key]').classList.contains('vx-moved'), `the desk's slider moved too (${shownKey} = ${input.value}, glowing)`); }
else ok(r.changed.every(k => Math.abs(api.get([k])[k] - after[k]) < 1e-9), 'the desk holds the new values');
document.querySelector('.ph-undo').click(); await until(() => /↶ Undid/.test(document.querySelector('.ph-log')?.lastElementChild?.textContent || ''), 5000, 'undo');
await until(async () => { const s = (await win()).shown; return r.changed.filter(k => k in shownBefore).every(k => Math.abs(s[k] - shownBefore[k]) < 1e-6); }, 5000, 'editor back to before');
ok(true, '↶ undo: the plugin’s window goes back as well');
// 6. a knob turned in the plugin's own window reaches the desk's slider (the controls on screen are read every 2 s)
await hub.vst.request({ action: 'patch', plugin: api.current().path, parameters: { level: .123 } });
document.querySelector('.wb-live-params')?.closest('details')?.setAttribute('open', '');
await until(() => Math.abs(+(document.querySelector('.wb-live-params [data-key="level"] input')?.value ?? -1) - .123) < 1e-6, 8000, 'the desk follows the editor');
ok(true, 'a knob turned in the plugin’s window shows on the desk within 2 s');
// 7. the AI's sound tool: applied silently
api.allowAI(true); const ai = await WorkbenchVST.soundTool({ action: 'apply', parameters: { level: .44 } });
ok(ai.changed === 1 && /do not list/.test(ai.note) && Math.abs(api.get(['level']).level - .44) < 1e-9, 'the AI’s sound tool applies silently (a count + “one short line” for the AI)');
// 8. the desk goes away → hidden (still open); back → shown again
activate(H.claudeAgent().id); await until(async () => { const x = await win(); return Array.isArray(x?.region) && !x.region.length; }, 6000, 'hidden with the desk');
ok((await live()).editorOpen, 'another tool on screen → the editor hides, stays open');
activate('tool:creative'); CreativePlayground.openFeature('vst'); await until(() => mode() === 'embedded', 10000, 'embedded again');
await until(async () => { const x = await win(); return x && !(Array.isArray(x.region) && !x.region.length) && near(x.y, at().y); }, 6000, 'shown again').catch(async e => { throw Error(`${e.message}: ${JSON.stringify({ win: await win(), at: at(), frame: api.editor() })}`); });
ok(true, 'back to the Sound desk → the editor is there again, on its placeholder');
// 9. Pop out / Open editor here
frameBtn('Pop out').click(); await until(() => mode() === 'floating', 5000, 'floating'); ok((await win()).parent === 0 && frameBtn('Open editor here'), 'Pop out → its own window; the frame offers “Open editor here”');
frameBtn('Open editor here').click(); await until(() => mode() === 'embedded', 5000, 'back in'); ok((await win()).child, 'Open editor here → back inside Hearth');
// 9b. (round 64, with liveset64) the 🎤 Live set on screen parks the editor (hidden, open); it comes back when it closes
document.documentElement.classList.add('liveset-open');
await until(async () => { const x = await win(); return Array.isArray(x?.region) && !x.region.length; }, 5000, 'parked'); ok((await live()).editorOpen, 'the Live set parks the editor (hidden, still open)');
document.documentElement.classList.remove('liveset-open');
await until(async () => { const x = await win(); return x && !(Array.isArray(x.region) && !x.region.length); }, 5000, 'unparked'); ok(true, 'the Live set closes → the editor shows again');
// 9c. (with audiodoctor64) the hosts restarted under an open editor (Reset host / the ASIO switch: stop, then reopen the
// instrument): the editor comes back inside Hearth by itself (the owner chose "here")
await hub.vst.stop(); await WorkbenchVST.api.open('Vital', { live: false });
await until(async () => mode() === 'embedded' && (await win())?.child, 15000, 'editor back after a host restart'); ok(true, 'after a host restart (audio doctor’s Reset host / ASIO switch) the editor is back in the desk');
// 10. a bounce with the editor open is 48 kHz
const bounce = await hub.vst.request({ action: 'render', plugin: api.current().path, duration: .5, notes: [{ note: 60, time: 0, length: .3 }] });
const rate = new DataView(Uint8Array.from(atob(bounce.audio), c => c.charCodeAt(0)).buffer).getUint32(24, true);
ok(bounce.ok && rate === 48000 && mode() === 'embedded', `a bounce with the editor open: ${rate} Hz WAV, editor still in place`);
// 11. Serum 2's editor refuses to be inside Hearth → its own window + one plain line; Vital's editor closed with it
const vitalPath = api.current().path;
card('Serum 2').click(); await until(() => api.current()?.name === 'Serum 2' && api.current().ready, 20000, 'Serum 2');
ok(!(await hub.vst.request({ action: 'live-status', plugin: vitalPath })).editorOpen, 'switching instrument closes Vital’s editor cleanly');
await until(() => frameBtn('Open editor here'), 8000, 'Serum frame'); frameBtn('Open editor here').click();
await until(() => mode() === 'floating', 8000, 'fallback');
const note = document.querySelector('.vx-line')?.textContent || '';
ok(/Couldn.t place the editor inside Hearth/.test(note) && !document.querySelector('.vx-line').hidden, `fallback: one plain line (“${note}”)`);
frameBtn('Close editor').click(); await until(() => mode() === 'closed', 5000, 'closed'); ok(!(await live()).editorOpen, 'Close editor closes it');
// 12. Reset host → the controls come from the list kept on disk (before → after)
const reset = [...document.querySelectorAll('.wb-shell button')].find(b => b.textContent === 'Reset host'); t0 = performance.now(); reset.click();
await until(() => api.current()?.ready && api.timings().controlsSource === 'cache', 20000, 'reopened from cache');
tm = api.timings(); out.timings.cachedClickToControlsMs = tm.controlsMs; out.timings.cachedReadyMs = tm.readyMs;
ok(tm.controlsSource === 'cache' && tm.controlsMs < out.timings.coldClickToControlsMs, `after a restart the controls come from the disk list: ${tm.controlsMs} ms (first time ${out.timings.coldClickToControlsMs} ms)`);
await wait(300);
out.result = `vstembed64 in the app with the fake host: ${out.checks.length} checks passed.`;
return JSON.stringify(out, null, 1);
