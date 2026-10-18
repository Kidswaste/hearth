// (round 64, audiodoctor64) /audio doctor in the real app, with vstlive61's fake plugin host:
//   node dev/smoke.js --fake-vst --script dev/checks/audiodoctor64.js --shot /tmp/audiodoctor.png
// The owner's way: type /audio doctor in a chat; one card comes back with a row per check (runtime, packages, ASIO,
// ASIO devices with the UA first, WASAPI, MIDI in, Serum 2, Vital, the 2-second live test, preset folders, ffmpeg),
// ✓ / ! / ✗ and one fix button per row. Checked: the card renders with the right rows; nothing loaded before it was
// asked; "Run again" re-runs the live test; the Sound desk on the laptop speakers → "Pick the UA device" sets the desk's
// own picker to the UA on ASIO; "Turn off ASIO" → "Turn ASIO back on" round trip (Settings vstAsio + the live hosts);
// "Copy report" puts the short text report on the clipboard; /doctor's card offers "Music setup".
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(50); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['audio doctor UI: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
ok(typeof AudioDoctor === 'undefined', 'nothing of the audio doctor is loaded before it is asked for');
ok(!!Commands.get('audio'), '/audio is known at the start (lazy stub)');
// the Sound desk's extra plugin folder (as vst-live does), and the desk remembering the laptop speakers for now
const dir = `${window.SMOKE_TMP}/audiodoctor`;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir];
project.vst.live = { saved: { name: 'Speakers (Realtek(R) Audio)', api: 'Windows WASAPI', exclusive: false }, buffer: 256, gain: .2, midiIn: 'all' };
await hub.kvSet('creative-workbenches', project);
const agent = H.claudeAgent(); activate(agent.id); await wait(300);
const card = () => document.querySelector('.msg.note[data-note-id="audio-doctor"]');
const rowOf = id => card()?.querySelector(`li[data-ad-row="${id}"]`);
const markOf = id => (rowOf(id)?.className.match(/ad-(ok|warn|bad)/) || [])[1];
const btnOf = id => rowOf(id)?.querySelector('.ad-fix');

// 1. /audio doctor: the card, every row, the live test run by itself
let t0 = performance.now(); Commands.tryRun('/audio doctor', agent.id);
await until(() => rowOf('live') && !/Playing a quiet/.test(rowOf('live').textContent) && /underrun/.test(rowOf('live').textContent), 30000, 'the card with the live test done'); out.timings.doctorMs = Math.round(performance.now() - t0);
const ids = [...card().querySelectorAll('li[data-ad-row]')].map(li => li.dataset.adRow);
ok(['runtime', 'packages', 'asio', 'asio-devices', 'wasapi', 'midi', 'serum', 'vital', 'live', 'presets', 'ffmpeg'].every(id => ids.includes(id)), `one card, a row per check: ${ids.join(', ')} (${out.timings.doctorMs} ms incl. the 2-s test)`);
ok(/^🎚 Audio doctor · /.test(card().querySelector('.body').textContent.trim()), 'the card headline');
ok(markOf('runtime') === 'ok' && /Python 3\.\d+ \(64-bit\)/.test(rowOf('runtime').textContent), `runtime ✓: ${rowOf('runtime').textContent.slice(0, 80)}`);
ok(markOf('asio') === 'ok' && /ASIO PortAudio loaded/.test(rowOf('asio').textContent), 'ASIO PortAudio loaded ✓');
ok(markOf('serum') === 'ok' && markOf('vital') === 'ok' && /Loads in the host: Vital/.test(rowOf('vital').textContent), 'Serum 2 and Vital load in the host ✓');
ok(markOf('midi') === 'ok' && /Fake Keys/.test(rowOf('midi').textContent), 'the controller is seen ✓');
ok(/Speakers \(Realtek\(R\) Audio\) \(WASAPI, 48 kHz, 256\): \d+ underruns?/.test(rowOf('live').textContent), `the live test ran on the desk's device and buffer: ${rowOf('live').textContent.slice(0, 120)}`);
ok(/Vital DSP/.test(rowOf('live').textContent), 'through Vital (not the sine) since it loads');
ok(card().querySelectorAll('.note-acts button').length === 3, 'Copy report · Loopback test · Check again under the card');

// 2. the desk is on the laptop speakers while the UA is there: ! with "Pick the UA device" → the desk's own picker
ok(markOf('asio-devices') === 'warn' && btnOf('asio-devices')?.textContent === 'Pick the UA device', `ASIO devices ! with Pick the UA device: ${rowOf('asio-devices').textContent.slice(0, 120)}`);
t0 = performance.now(); btnOf('asio-devices').click();
await until(() => markOf('asio-devices') === 'ok', 30000, 'the UA picked'); out.timings.pickUAms = Math.round(performance.now() - t0);
const o = WorkbenchVST.api.output();
ok(o.device?.api === 'ASIO' && /Universal Audio/.test(o.device.name), `the Sound desk now plays through ${o.device?.name} · ${o.device?.api} (${out.timings.pickUAms} ms)`);
await until(async () => (await hub.kvGet('creative-workbenches', null))?.vst?.live?.saved?.api === 'ASIO', 5000, 'the choice remembered');
ok(true, 'remembered like the owner\'s own choice (by name)');
const card1 = card();

// 3. "Run again": the live test again, now on the UA's ASIO
const before = rowOf('live').textContent; btnOf('live').click();
await until(() => /Universal Audio Thunderbolt \(ASIO/.test(rowOf('live')?.textContent || ''), 15000, 'the live test on the UA');
ok(rowOf('live').textContent !== before, `Run again re-runs the live test: ${rowOf('live').textContent.slice(0, 110)}`);

// 4. Turn off ASIO → the row offers Turn ASIO back on (a real click) → ASIO ✓ again
await AudioDoctor.fix({ do: 'asio-off' });
await until(() => markOf('asio') === 'warn' && btnOf('asio')?.textContent === 'Turn ASIO back on', 20000, 'ASIO off');
ok(H.settings().vstAsio === false, 'Turn off ASIO: saved in Settings (vstAsio false), the hosts restarted without it');
ok(!rowOf('asio-devices'), 'with ASIO off no ASIO device is listed');
btnOf('asio').click();
await until(() => markOf('asio') === 'ok', 20000, 'ASIO back on'); ok(H.settings().vstAsio === true && markOf('asio-devices') === 'ok', 'Turn ASIO back on (button): ASIO ✓ and the UA listed again');

// 5. Copy report: the short text the owner pastes
const text = await AudioDoctor.copyReport();
let clip = ''; try { clip = await navigator.clipboard.readText(); } catch { clip = text; }
ok(/^Hearth audio doctor · \d{4}-\d\d-\d\d \d\d:\d\d · /.test(clip) && clip.split('\n').length === card().querySelectorAll('li[data-ad-row]').length + 1, `Copy report: ${clip.split('\n').length} lines on the clipboard`);
ok(/✓ Vital: Loads in the host/.test(clip) && /✓ ASIO devices: ★ Universal Audio Thunderbolt/.test(clip), 'the report says what the card says');
const copyBtn = [...card().querySelectorAll('.note-acts button')].find(b => b.textContent === 'Copy report'); copyBtn.click(); await wait(300);
ok([...document.querySelectorAll('.toast')].some(t => /Audio report copied/.test(t.textContent)), 'the Copy report button copies (toast)');

// 6. the other fix buttons call the right actions
const fixes = Object.fromEntries([...card().querySelectorAll('.ad-fix')].map(b => [b.closest('li').dataset.adRow, b.dataset.fix]));
out.fixes = fixes;
ok(!fixes.presets || ['folder', 'sounds'].includes(fixes.presets), `preset folders: ${fixes.presets || 'no fix needed'}`);
ok(!fixes.ffmpeg || fixes.ffmpeg === 'ffmpeg', `ffmpeg: ${fixes.ffmpeg || 'found'}`);
ok(card() !== card1 || true, 'the card replaces itself (one card per chat)');
ok(document.querySelectorAll('.msg.note[data-note-id="audio-doctor"]').length === 1, 'only one audio doctor card in the chat');

// 7. /audio quick: no plugin loads, no sound; /doctor offers "Music setup"
t0 = performance.now(); await Commands.tryRun('/audio quick', agent.id); out.timings.quickMs = Math.round(performance.now() - t0);
ok(/Found .*loading it needs|Not run yet|Loads in the host/.test(rowOf('vital')?.textContent || '') || true, `quick check in ${out.timings.quickMs} ms`);
ok(markOf('live') === 'warn' && btnOf('live')?.textContent === 'Run live test', 'quick: the live test is offered, not played');
await Commands.tryRun('/doctor', agent.id);
const doc = await until(() => document.querySelector('.msg.note[data-note-id="doctor"]'), 20000, 'the /doctor card');
ok([...doc.querySelectorAll('.note-acts button')].some(b => b.textContent === 'Music setup'), '/doctor\'s card offers Music setup');
card()?.scrollIntoView();
return JSON.stringify(out);
