#!/usr/bin/env node
// Voice (round 23), plain Node: voice commands (VoiceCore.route), the push-to-talk key, voice activity detection,
// resampling + the WAV, whisper's output lines, the read-aloud text (no code), and the main side (voicemain.js) against
// dev/fake-whisper.js: whisper-cli found by hand, its arguments (-m model -f wav -l -np), text by the tone it heard,
// partial text streamed, the WAV removed, a failing tool, no model, cancel, and the model download (a local server,
// a redirect, progress, cut short).
//   node dev/voice-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'voice-core.js'));
const FAKE = path.join(__dirname, 'fake-whisper.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-test-'));
const LOG = path.join(tmp, 'args.jsonl');
process.env.FAKE_WHISPER_LOG = LOG;
let n = 0;
const ok = (c, what) => { assert.ok(c, what); n += 1; };
const eq = (a, b, what) => { assert.deepStrictEqual(a, b, what); n += 1; };

const tone = (hz, sec, rate = 48000, quiet = 0) => { const a = new Float32Array(Math.round((sec + quiet) * rate)); for (let i = 0; i < sec * rate; i++) a[i + Math.round(quiet * rate / 2)] = 0.5 * Math.sin(2 * Math.PI * hz * i / rate); return a; };

(async () => {
  // ---------- voice commands ----------
  const all = () => true;
  eq(C.route('Freeze.', { has: all }), { kind: 'cmd', line: '/freeze' }, 'freeze');
  eq(C.route('Unfreeze!', { has: all }), { kind: 'cmd', line: '/freeze off' }, 'unfreeze');
  eq(C.route('freeze on the next bar', { has: all }), { kind: 'cmd', line: '/freeze bar' }, 'freeze on the bar');
  eq(C.route('Save.', { has: all }), { kind: 'cmd', line: '/save-sliders' }, 'save');
  eq(C.route('Next scene.', { has: all }), { kind: 'cmd', line: '/look next' }, 'next scene');
  eq(C.route('previous look', { has: all }), { kind: 'cmd', line: '/look prev' }, 'previous look');
  eq(C.route('Shuffle the colors', { has: all }), { kind: 'cmd', line: '/shuffle Colors' }, 'shuffle colours');
  eq(C.route('Okay, play the song please.', { has: all }), { kind: 'cmd', line: '/play' }, 'filler words dropped');
  eq(C.route('Stop talking.', { has: all }), { kind: 'do', what: 'hush' }, 'stop reading');
  eq(C.route('Send it.', { has: all }), { kind: 'do', what: 'send' }, 'send');
  eq(C.route('Scratch that.', { has: all }), { kind: 'do', what: 'clear' }, 'clear');
  eq(C.route('Director, make it pinker.', { has: all }), { kind: 'agent', who: 'director', text: 'Make it pinker.' }, 'director prefix');
  eq(C.route('hey Astra: what do you think of this', { has: all }), { kind: 'agent', who: 'astra', text: 'What do you think of this' }, 'astra prefix');
  eq(C.route('Director, freeze.', { has: all }), { kind: 'cmd', line: '/freeze' }, 'director + a command word runs the command (no tokens)');
  eq(C.route('Save the world in your next reply please, with lots of detail', { has: all }), null, 'a long sentence is a message');
  eq(C.route('Make the particles drift slower.', { has: all }), null, 'an ordinary sentence');
  eq(C.route('freeze', { has: () => false }), null, 'a command that does not exist is not run');
  eq(C.route('command size 9 16', { has: (x) => x === 'size' }), { kind: 'cmd', line: '/size 9 16' }, '"command <name>"');
  eq(C.route('Make it pop!', { has: all, own: { 'make it pop': '/shuffle wild' } }), { kind: 'cmd', line: '/shuffle wild' }, 'own words');
  eq(C.route('', { has: all }), null, 'empty');
  ok(C.words().length >= 15 && C.words().every((w) => w.what && w.line), 'the words list');

  // ---------- push-to-talk key ----------
  const k = C.parseCombo('Ctrl+Space');
  eq(k.text, 'Ctrl+Space', 'combo text');
  ok(C.matches(k, { type: 'keydown', code: 'Space', ctrlKey: true }), 'Ctrl+Space presses');
  ok(C.matches(k, { type: 'keydown', code: 'Space', metaKey: true }), '⌘+Space presses on a Mac');
  ok(!C.matches(k, { type: 'keydown', code: 'Space' }), 'Space alone does not');
  ok(!C.matches(k, { type: 'keydown', code: 'Space', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Space does not');
  ok(C.releases(k, { code: 'Space' }) && C.releases(k, { code: 'ControlLeft' }) && C.releases(k, { code: 'MetaLeft' }) && !C.releases(k, { code: 'KeyA' }), 'letting go of the key or Ctrl ends');
  eq(C.parseCombo('F8').text, 'F8', 'a function key alone');
  eq(C.parseCombo('option+shift+v').text, 'Alt+Shift+V', 'Mac names');
  eq(C.parseCombo('v'), null, 'a bare letter would type');
  eq(C.parseCombo('Space'), null, 'a bare Space would type');
  eq(C.parseCombo('Hyper+Q'), null, 'unknown modifier');
  const m4 = C.parseCombo('mouse4');
  ok(m4.button === 3 && C.matches(m4, { type: 'mousedown', button: 3 }) && !C.matches(m4, { type: 'mousedown', button: 0 }) && !C.releases(m4, { code: 'Space' }), 'a mouse side button');

  // ---------- voice activity detection ----------
  const feed = (v, rms, ms, chunk = 20) => { const evs = []; for (let t = 0; t < ms; t += chunk) { const e = v.feed(rms, chunk); if (e) evs.push(e); } return evs; };
  let v = C.vad({ silenceMs: 1000 });
  eq(feed(v, 0.002, 600), [], 'quiet room: nothing');
  eq(feed(v, 0.2, 800), ['start'], 'speech starts');
  eq(feed(v, 0.002, 500), [], 'a short pause keeps going');
  eq(feed(v, 0.2, 300), [], 'more speech');
  eq(feed(v, 0.002, 1100), ['end'], 'a second of quiet ends it');
  ok(v.state().heard && v.state().first > 500 && v.state().first < 700 && v.state().lastLoud > 2000, 'where speech was');
  v = C.vad({ idleMs: 3000 });
  ok(feed(v, 0.002, 3100).includes('idle'), 'nothing said: idle');
  v = C.vad();
  eq(feed(v, 0.2, 60), [], 'a click is not speech');
  v = C.vad({ maxMs: 2000 });
  ok(feed(v, 0.2, 2100).includes('max'), 'too long: max');
  ok(Math.abs(C.rms(new Float32Array([0.5, -0.5, 0.5, -0.5])) - 0.5) < 1e-6, 'rms');

  // ---------- resample + WAV ----------
  const t48 = tone(500, 1);
  const r16 = C.resample(t48, 48000, 16000);
  eq(r16.length, 16000, '48 k → 16 k length');
  let cross = 0; for (let i = 1; i < r16.length; i++) if (r16[i - 1] < 0 && r16[i] >= 0) cross += 1;
  ok(Math.abs(cross - 500) < 5, `the pitch survives (${cross})`);
  eq(C.resample(new Float32Array([1, 2]), 16000, 16000).length, 2, 'same rate copies');
  const w = C.wav(r16);
  eq(Buffer.from(w.slice(0, 4)).toString(), 'RIFF', 'RIFF');
  const dv = new DataView(w.buffer);
  ok(dv.getUint32(24, true) === 16000 && dv.getUint16(22, true) === 1 && dv.getUint16(34, true) === 16 && dv.getUint32(40, true) === 32000 && w.length === 44 + 32000, 'WAV header: 16 kHz mono 16-bit');
  eq(C.trim(new Float32Array(16000), 16000, 500, 600, 100).length, 4800, 'trim keeps speech + pads');
  eq(C.trim(new Float32Array(10), 16000, -1, 0).length, 10, 'nothing heard: untouched');

  // ---------- whisper lines / reading aloud ----------
  eq(C.segmentText('[00:00:00.000 --> 00:00:02.000]   Hello there.'), 'Hello there.', 'segment');
  eq(C.segmentText('[00:00:00.000 --> 00:00:02.000]   [BLANK_AUDIO]'), '', 'blank audio');
  eq(C.segmentText('whisper_init_from_file: x'), '', 'log lines');
  eq(C.joinText(['Hi ,', 'there .']), 'Hi, there.', 'join');
  const said = C.speakable('# Title\nHere is **bold** and `x`.\n```js\nconst a = 1;\nconst b = 2;\nconsole.log(a);\n```\nSee [the docs](https://x.y) or https://a.b/c 🔥\n| a | b |\n|---|---|\n| 1 | 2 |');
  ok(!/const a|console|```|\*\*|#|🔥|https/.test(said) && /code skipped/.test(said) && /bold and x/.test(said) && /the docs/.test(said) && /a link/.test(said) && /a table/.test(said), `speakable: ${said}`);
  ok(C.chunks('One. Two! Three?', 8).length === 3 && C.chunks('x'.repeat(1300)).length === 3, 'chunks');
  ok(C.installSteps('darwin').some((s) => /brew install whisper-cpp/.test(s)) && C.installSteps('win32').some((s) => /whisper-cli\.exe/.test(s)), 'install steps');
  ok(/Fn/.test(C.dictationHint('darwin')) && /Win\+H/.test(C.dictationHint('win32')), 'dictation hints');
  ok(/ggml-base\.bin$/.test(C.modelUrl('base')) && /ggml-small\.bin$/.test(C.modelUrl('small')), 'model URLs');

  // ---------- main side ----------
  const M = require(path.join(ROOT, 'voicemain.js'));
  const handlers = {}; const sent = [];
  const ipc = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const win = { isDestroyed: () => false, webContents: { send: (ch, p) => sent.push({ ch, p }) } };
  const dataDir = path.join(tmp, 'data');
  M.register(ipc, () => win, { settings: () => ({}), dataDir });
  ok(['voice:status', 'voice:transcribe', 'voice:cancel', 'voice:download', 'voice:say', 'voice:hush', 'voice:voices', 'voice:mic'].every((c) => handlers[c]), 'channels');
  const call = (ch, o) => handlers[ch]({}, o);

  // whisper-cli given by hand, no model yet
  const st0 = await call('voice:status', { whisperPath: FAKE });
  ok(st0.engine === 'whisper.cpp' && st0.bin === FAKE && !st0.model && !st0.ready && st0.models.length === 5 && st0.modelsDir.startsWith(dataDir), 'found, no model');
  const wav500 = C.wav(C.resample(tone(500, 1, 48000, 0.6), 48000, 16000));
  const nm = await call('voice:transcribe', { id: 'a', wav: wav500, whisperPath: FAKE });
  eq(nm, { ok: false, error: 'no-model' }, 'no model: says so');

  // a model in the data folder
  fs.mkdirSync(path.join(dataDir, 'voice', 'models'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'voice', 'models', 'ggml-base.bin'), Buffer.alloc(2e6));
  const st1 = await call('voice:status', { whisperPath: FAKE });
  ok(st1.ready && /ggml-base\.bin$/.test(st1.model) && st1.models.find((m) => m.name === 'base').have, 'model found');
  const r1 = await call('voice:transcribe', { id: 'b1', wav: wav500, whisperPath: FAKE, lang: 'en' });
  ok(r1.ok && r1.text === 'Freeze.' && r1.engine === 'whisper.cpp', `500 Hz → Freeze. (${JSON.stringify(r1)})`);
  const a1 = JSON.parse(fs.readFileSync(LOG, 'utf8').trim().split('\n').pop());
  ok(a1.args[a1.args.indexOf('-m') + 1] === st1.model && a1.args.includes('-np') && a1.args[a1.args.indexOf('-l') + 1] === 'en' && a1.args.includes('-t'), `arguments (${a1.args.join(' ')})`);
  ok(Math.abs(a1.freq - 500) < 20 && a1.seconds > 1.5, `the WAV reached it (${a1.freq} Hz, ${a1.seconds} s)`);
  const wavFile = a1.args[a1.args.indexOf('-f') + 1];
  ok(wavFile.startsWith(path.join(dataDir, 'voice', 'tmp')) && !fs.existsSync(wavFile), 'the WAV is in the data folder and removed after');
  const r2 = await call('voice:transcribe', { id: 'b2', wav: C.wav(C.resample(tone(300, 1), 48000, 16000)), whisperPath: FAKE });
  eq(r2.text, 'Make the particles drift slower, please.', 'two segments joined');
  const parts = sent.filter((s) => s.ch === 'voice:partial' && s.p.id === 'b2').map((s) => s.p.text);
  eq(parts, ['Make the particles', 'Make the particles drift slower, please.'], 'partial text streams');
  eq((await call('voice:transcribe', { id: 'b3', wav: wav500, whisperPath: FAKE, lang: 'x; rm -rf' })).ok, true, 'a bad language is ignored');
  ok(JSON.parse(fs.readFileSync(LOG, 'utf8').trim().split('\n').pop()).args.includes('auto'), 'a bad language becomes auto');
  process.env.FAKE_WHISPER_FAIL = '1';
  const rf = await call('voice:transcribe', { id: 'c', wav: wav500, whisperPath: FAKE });
  ok(!rf.ok && /failed to load model/.test(rf.error), `a failing tool says why (${rf.error})`);
  delete process.env.FAKE_WHISPER_FAIL;
  // cancel mid-way
  process.env.FAKE_WHISPER_TEXT = 'x';
  const pc = call('voice:transcribe', { id: 'd', wav: wav500, whisperPath: FAKE });
  await new Promise((r) => setTimeout(r, 30));
  const cancelled = await call('voice:cancel', 'd');
  const rc = await pc;
  ok(cancelled && (rc.cancelled || rc.ok), `cancel (${JSON.stringify(rc)})`);
  delete process.env.FAKE_WHISPER_TEXT;
  // HEARTH_WHISPER(_MODEL) env
  process.env.HEARTH_WHISPER = FAKE; process.env.HEARTH_WHISPER_MODEL = FAKE;
  const st2 = await call('voice:status', {});
  ok(st2.ready && st2.bin === FAKE && st2.model === FAKE, 'env overrides');
  delete process.env.HEARTH_WHISPER; delete process.env.HEARTH_WHISPER_MODEL;

  // ---------- the model download ----------
  const body = Buffer.alloc(3e6, 7);
  let cut = false;
  const srv = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/model' }); res.end(); return; }
    if (req.url === '/model') { res.writeHead(200, { 'Content-Length': body.length }); if (cut) { res.write(body.subarray(0, 1000)); res.destroy(); return; } res.end(body); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const d404 = await call('voice:download', { model: 'tiny', url: `${base}/nope` });
  ok(!d404.ok && /404/.test(d404.error), 'a missing file says so');
  cut = true;
  const dcut = await call('voice:download', { model: 'tiny', url: `${base}/model` });
  ok(!dcut.ok && !fs.existsSync(path.join(dataDir, 'voice', 'models', 'ggml-tiny.bin')), `cut short: nothing kept (${dcut.error})`);
  cut = false;
  const d = await call('voice:download', { model: 'tiny', url: `${base}/redirect` });
  ok(d.ok && d.bytes === body.length && fs.statSync(path.join(dataDir, 'voice', 'models', 'ggml-tiny.bin')).size === body.length && !fs.existsSync(`${d.path}.part`), 'downloaded through a redirect');
  ok(sent.some((s) => s.ch === 'voice:progress' && s.p.done && s.p.model === 'tiny'), 'progress reported');
  ok((await call('voice:download', { model: 'tiny', url: `${base}/nope` })).already, 'already there: not downloaded again');
  srv.close();

  // the system voice: never throws (no speech tool on a test machine is fine)
  const sy = await call('voice:say', { text: 'hello' });
  ok(typeof sy.ok === 'boolean', 'say answers');
  ok(await call('voice:hush') === false, 'nothing to hush');
  ok((await call('voice:mic')) === 'granted' || process.platform === 'darwin', 'mic (not a Mac: granted)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`voice-test: ${n} checks passed`);
})().catch((err) => { console.error(`FAIL ${err.message}`); process.exit(1); });
