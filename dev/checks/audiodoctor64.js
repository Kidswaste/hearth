// (round 64, audiodoctor64) The audio setup check in the real app, with vstlive61's fake plugin host:
//   node dev/smoke.js --fake-vst --script dev/checks/audiodoctor64.js --shot /tmp/audiodoctor.png
// The owner's way (no commands): Creative Playground → Sound desk → the visible "🎚 Check my audio setup" button. One
// card opens in the desk with a row per check (runtime, packages, ASIO, ASIO devices with the UA first, WASAPI, MIDI in,
// Serum 2, Vital, the 2-second live test, preset folders, ffmpeg), ✓ / ! / ✗ and one fix button per row. Checked: nothing
// loaded before the click; the card renders with the right rows; the desk on the laptop speakers → "Pick the UA device"
// sets the desk's own picker to the UA on ASIO; "Run again" re-runs the live test; "Turn off ASIO" → "Turn ASIO back on";
// "Copy report"; the "🎚 Check setup" button next to Audio output; a live start that fails opens the card by itself with
// a friendly reason; secondary: /audio quick in a chat and /doctor's "Music setup".
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(50); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['audio setup check UI: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
ok(!Lazy.isIn('audiodoctor'), 'nothing of the audio doctor is loaded before it is asked for');
// the Sound desk's extra plugin folder (as vst-live does), and the desk remembering the laptop speakers for now
const dir = `${window.SMOKE_TMP}/audiodoctor`;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir];
project.vst.live = { saved: { name: 'Speakers (Realtek(R) Audio)', api: 'Windows WASAPI', exclusive: false }, buffer: 256, gain: .2, midiIn: 'all' };
await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
ok(!Lazy.isIn('audiodoctor'), 'opening the Sound desk loads nothing of it either');
const card = () => document.querySelector('.wb-sound-desk .ad-card');
const rowOf = id => card()?.querySelector(`li[data-ad-row="${id}"]`);
const markOf = id => (rowOf(id)?.className.match(/\bad-(ok|warn|bad)\b/) || [])[1];
const btnOf = id => rowOf(id)?.querySelector('.ad-fix');
const actOf = label => [...(card()?.querySelectorAll('.ad-acts button') || [])].find(b => b.textContent === label);
const liveDone = () => rowOf('live') && !/Playing a quiet/.test(rowOf('live').textContent) && /underrun/.test(rowOf('live').textContent);

// 1. the visible button in the desk's top row → the card in the desk, the live test run by itself
const top = [...document.querySelectorAll('.wb-sound-desk > .wb-row button')].find(b => b.textContent === '🎚 Check my audio setup');
ok(!!top && top.checkVisibility(), 'a visible "🎚 Check my audio setup" button in the Sound desk\'s top row');
let t0 = performance.now(); top.click();
await until(() => card(), 8000, 'the card'); ok(/checking…|Checking/.test(card().textContent) || rowOf('runtime'), 'the card shows at once (checking…)');
await until(liveDone, 30000, 'the card with the live test done'); out.timings.checkMs = Math.round(performance.now() - t0);
const ids = [...card().querySelectorAll('li[data-ad-row]')].map(li => li.dataset.adRow);
ok(['runtime', 'packages', 'asio', 'asio-devices', 'wasapi', 'midi', 'serum', 'vital', 'live', 'presets', 'ffmpeg'].every(id => ids.includes(id)), `one card in the desk, a row per check: ${ids.join(', ')} (${out.timings.checkMs} ms incl. the 2-s test)`);
ok(/^🎚 Audio setup check/.test(card().querySelector('.ad-head').textContent), 'the card headline');
ok(markOf('runtime') === 'ok' && /Python 3\.[\d.]+ \(64-bit\)/.test(rowOf('runtime').textContent), `runtime ✓: ${rowOf('runtime').textContent.slice(0, 80)}`);
ok(markOf('asio') === 'ok' && /ASIO PortAudio loaded/.test(rowOf('asio').textContent), 'ASIO PortAudio loaded ✓');
ok(markOf('serum') === 'ok' && markOf('vital') === 'ok' && /Loads in the host: Vital/.test(rowOf('vital').textContent), 'Serum 2 and Vital load in the host ✓');
ok(markOf('midi') === 'ok' && /Fake Keys/.test(rowOf('midi').textContent), 'the controller is seen ✓');
ok(/Speakers \(Realtek\(R\) Audio\) \(WASAPI, 48 kHz, 256\): \d+ underruns?/.test(rowOf('live').textContent), `the live test ran on the desk's device and buffer: ${rowOf('live').textContent.slice(0, 120)}`);
ok(/Vital DSP/.test(rowOf('live').textContent), 'through Vital (not the sine) since it loads');
ok(['Copy report', 'Loopback test', 'Check again'].every(actOf), 'Copy report · Loopback test · Check again under the card');

// 2. the desk is on the laptop speakers while the UA is there: ! with "Pick the UA device" → the desk's own picker
ok(markOf('asio-devices') === 'warn' && btnOf('asio-devices')?.textContent === 'Pick the UA device', `ASIO devices ! with Pick the UA device: ${rowOf('asio-devices').textContent.slice(0, 120)}`);
t0 = performance.now(); btnOf('asio-devices').click();
await until(() => markOf('asio-devices') === 'ok', 30000, 'the UA picked'); out.timings.pickUAms = Math.round(performance.now() - t0);
const o = WorkbenchVST.api.output();
ok(o.device?.api === 'ASIO' && /Universal Audio/.test(o.device.name), `the Sound desk now plays through ${o.device?.name} · ${o.device?.api} (${out.timings.pickUAms} ms)`);
ok(document.querySelector('select[aria-label="Audio output"]')?.selectedOptions[0]?.textContent.startsWith('★ Universal Audio Thunderbolt · ASIO'), 'its Audio output picker shows the UA on ASIO');
await until(async () => (await hub.kvGet('creative-workbenches', null))?.vst?.live?.saved?.api === 'ASIO', 5000, 'the choice remembered');
ok(true, 'remembered like the owner\'s own choice (by name)');
ok(!!card(), 'the card stays in the desk while the instrument opens');

// 3. "Run again": the live test again, now on the UA's ASIO
const before = rowOf('live').textContent; btnOf('live').click();
await until(() => /Universal Audio Thunderbolt \(ASIO/.test(rowOf('live')?.textContent || ''), 15000, 'the live test on the UA');
ok(rowOf('live').textContent !== before, `Run again re-runs the live test: ${rowOf('live').textContent.slice(0, 110)}`);

// 4. Turn off ASIO → the row offers Turn ASIO back on (a click) → ASIO ✓ again
await AudioDoctor.fix({ do: 'asio-off' });
await until(() => markOf('asio') === 'warn' && btnOf('asio')?.textContent === 'Turn ASIO back on' && liveDone(), 30000, 'ASIO off');
ok(H.settings().vstAsio === false, 'Turn off ASIO: saved in Settings (vstAsio false), the hosts restarted without it');
ok(!rowOf('asio-devices'), 'with ASIO off no ASIO device is listed');
btnOf('asio').click();
await until(() => markOf('asio') === 'ok' && liveDone(), 30000, 'ASIO back on'); ok(H.settings().vstAsio === true && markOf('asio-devices') === 'ok', 'Turn ASIO back on (button): ASIO ✓ and the UA listed again');

// 5. Copy report (the button): the short text the owner pastes
actOf('Copy report').click(); await wait(400);
let clip = ''; try { clip = await navigator.clipboard.readText(); } catch { clip = await AudioDoctor.copyReport(); }
ok(/^Hearth audio doctor · \d{4}-\d\d-\d\d \d\d:\d\d · /.test(clip) && clip.split('\n').length === card().querySelectorAll('li[data-ad-row]').length + 1, `Copy report: ${clip.split('\n').length} lines on the clipboard`);
ok(/✓ Vital: Loads in the host/.test(clip) && /✓ ASIO devices: ★ Universal Audio Thunderbolt/.test(clip), 'the report says what the card says');
ok([...document.querySelectorAll('.toast')].some(t => /Audio report copied/.test(t.textContent)), 'Copy report: toast');
out.fixes = Object.fromEntries([...card().querySelectorAll('.ad-fix')].map(b => [b.closest('li').dataset.adRow, b.dataset.fix]));
ok(!out.fixes.presets || ['folder', 'sounds'].includes(out.fixes.presets), `preset folders: ${out.fixes.presets || 'no fix needed'}`);
ok(!out.fixes.ffmpeg || out.fixes.ffmpeg === 'ffmpeg', `ffmpeg: ${out.fixes.ffmpeg || 'found'}`);
ok(document.querySelectorAll('.ad-card').length === 1, 'one card in the desk');

// 6. "🎚 Check setup" right after Audio output · Buffer (an instrument is open now): the card again
await until(() => document.querySelector('.wb-live-setup .ad-desk-small'), 10000, 'the button next to the picker');
card().querySelector('.ad-close').click(); ok(!card(), '× closes the card');
document.querySelector('.wb-live-setup .ad-desk-small').click();
await until(() => card() && liveDone(), 30000, 'the card from the picker button'); ok(true, '"🎚 Check setup" next to Audio output opens the card');
card().querySelector('.ad-close').click();

// 7. live audio fails to start → the card opens by itself, with a friendly reason (quick: no tone, no plugin loads)
// the instrument's host went away behind the desk's back (as after a crash): pausing, then Start, fails
[...document.querySelectorAll('.wb-live-transport button')].find(b => b.textContent === 'Pause audio').click(); await wait(400);
await hub.vst.stop(); await wait(300);
[...document.querySelectorAll('.wb-live-transport button')].find(b => b.textContent === 'Start live audio').click();
await until(() => card() && rowOf('runtime'), 20000, 'the card after a failed start');
ok(/^Live audio didn't start: .+Here is what this PC looks like/.test(card().querySelector('.ad-reason')?.textContent || ''), `a failed start opens the card by itself: ${card().querySelector('.ad-reason')?.textContent.slice(0, 120)}`);
ok(markOf('live') === 'warn' && btnOf('live')?.textContent === 'Run live test', 'after a failure: a quick check (no tone), the live test offered');
ok(/audio process had stopped/.test(card().querySelector('.ad-reason').textContent) && actOf('Reset host'), 'the host had stopped: said in plain words, with Reset host under the card');
actOf('Reset host').click(); await until(() => !card().querySelector('.ad-reason') && liveDone(), 30000, 'Reset host');
ok(WorkbenchVST.api.current()?.name === 'Vital', 'Reset host: the hosts restarted and Vital loaded again');
const st = await WorkbenchVST.api.start(); ok(st?.playing === true, 'live audio starts again after Reset host');

// 8. secondary: /audio quick in a chat, /doctor's "Music setup"
const agent = H.claudeAgent(); activate(agent.id); await wait(300);
t0 = performance.now(); await Commands.tryRun('/audio quick', agent.id); out.timings.quickMs = Math.round(performance.now() - t0);
const note = document.querySelector('.msg.note[data-note-id="audio-doctor"]');
ok(note && note.querySelectorAll('li[data-ad-row]').length >= 10, `/audio quick in a chat: the same rows as a chat card (${out.timings.quickMs} ms)`);
await Commands.tryRun('/doctor', agent.id);
const doc = await until(() => document.querySelector('.msg.note[data-note-id="doctor"]'), 20000, 'the /doctor card');
ok([...doc.querySelectorAll('.note-acts button')].some(b => b.textContent === 'Check my audio setup'), '/doctor\'s card offers Check my audio setup');
activate('tool:creative'); await wait(300); CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-sound-desk .wb-row button'), 10000, 'desk again');
[...document.querySelectorAll('.wb-sound-desk > .wb-row button')].find(b => b.textContent === '🎚 Check my audio setup').click();
await until(() => card() && rowOf('runtime'), 20000, 'card for the screenshot'); card().scrollIntoView();
return JSON.stringify(out);
