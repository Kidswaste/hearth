// The Lab's audio reactivity (round 23, labaudio): a generated test song (intro, a build, a drop at a known time,
// kicks on every beat) and a fake live input (getUserMedia stubbed with the drop looped through an AudioContext;
// enumerateDevices stubbed with a "BlackHole 2ch" loopback device). Checks: nothing runs before something reads a
// feature; the whole-song features (drop, build, kick hits) at the playhead; bar phase from the grid; /song-features;
// the live AudioWorklet path (features in the preview, kick hits, tempo with a confidence); a slider mapped to the
// kick moving in the preview, its meter and the curve editor; presets; every new command; no duplicate commands; no
// slow frames from the new code.
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/labaudio.js --shot /tmp/labaudio.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-labaudio-check.wav';
const BPM = 128; const LEAD = 0.25; const beat = 60 / BPM; const bar = beat * 4;
const FORM = [['Intro', 4], ['Build', 4], ['Drop', 8], ['Outro', 2]];
const DROP = LEAD + 8 * bar;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---------- the test song ----------
const sr = 44100;
const beats = FORM.reduce((s, f) => s + f[1] * 4, 0);
const n = Math.round((LEAD + beats * beat + 0.5) * sr); const x = new Float32Array(n);
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
const kicks = [];
for (let k = 0; k < beats; k++) {
  const t = LEAD + k * beat; const inBar = k % 4;
  let acc = 0; let part = 'Intro'; let pk = 0; for (const [name, bars] of FORM) { if (k < acc + bars * 4) { part = name; pk = (k - acc) / (bars * 4); break; } acc += bars * 4; }
  const g = { Intro: 0.5, Build: 0.7, Drop: 1.25, Outro: 0.55 }[part];
  if (part !== 'Intro') { add(t, 0.3, (s) => g * 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-s * 30)) * s) * Math.exp(-s * 9)); kicks.push(t); }
  if (part === 'Drop' && inBar % 2 === 1) add(t, 0.18, (s) => g * 0.45 * rnd() * Math.exp(-s * 18));
  if (part === 'Build') { const subs = pk < 0.5 ? 1 : pk < 0.75 ? 2 : 4; for (let q = 0; q < subs; q++) add(t + (q * beat) / subs, 0.15, (s) => (0.2 + 0.6 * pk) * 0.45 * rnd() * Math.exp(-s * 20)); }
  for (const h of [0, 0.5]) { let prev = 0; add(t + h * beat, 0.04, (s) => { const v = rnd(); const d = v - prev; prev = v; return (part === 'Drop' ? 0.22 : 0.12) * d * Math.exp(-s * 90); }); }
  if (inBar === 0 && part !== 'Build') add(t, beat * 3.5, (s) => g * 0.25 * Math.sin(2 * Math.PI * [55, 55, 65.4, 49][Math.floor(k / 4) % 4] * s) * Math.min(1, s * 40) * Math.exp(-s * 0.8));
}
let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
for (let i = 0; i < n; i++) x[i] = (x[i] / peak) * 0.9;
{
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round(x[i] * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}

// ---------- the Lab, a sketch with sliders read every frame ----------
activate('tool:three');
const c = await ThreeLab.cmd();
await wait(1200);
// (round 74, checkhealth74) the Audio doctor's /audio holds the name since round 64: the Lab's is /hear, and /audio hands it
// "names" and a bare /audio in the Lab (checked below by what /audio says)
for (const nm of [Commands.get('audio')?.area === 'Three.js Lab' ? 'audio' : 'hear', 'audio-in', 'loopback', 'react-to', 'react-preset', 'react-curve', 'react-off', 'song-features']) if (Commands.get(nm)?.area !== 'Three.js Lab') step(`/${nm} registered in the Lab area`, false);
step('8 new commands registered', ['audio', 'audio-in', 'loopback', 'react-to', 'react-preset', 'react-curve', 'react-off', 'song-features'].every((nm) => Commands.get(nm)));
step('no duplicate commands', !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
const base = ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code
  .replace('const cube = ', "const P = tweak({ size: [1, 0.2, 3], glow: [0.4, 0, 2], speed: [1, 0, 4], zoom: [1, 0.5, 2], tint: '#ff3cac' });\nconst cube = ")
  .replace('cube.rotation.set(t * 0.4, t * 0.6, 0);', 'cube.rotation.set(t * 0.4 * P.speed, t * 0.6 * P.speed, 0); cube.scale.setScalar(P.size * P.zoom); cube.material.emissive.set(P.tint); cube.material.emissiveIntensity = P.glow;');
ThreeLab.openCode(base);
await until(() => c.sliders().some((s) => s.key === 'glow'), 12000);
await wait(2500);
const longs = [];
const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { const mine = (e.scripts || []).filter((s) => /three-audio/.test(s.sourceURL || '')); if (mine.length) longs.push({ ms: Math.round(e.duration), by: mine.map((s) => `${(s.sourceURL || '').split('/').pop()} ${s.sourceFunctionName || ''} ${Math.round(s.duration)}ms`).slice(0, 2) }); } });
try { po.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* no LoAF */ }
const r = await c.loadSong(SONG);
step('the test song loads', r.ok, r);
await until(() => ThreeLab.director && c.state.bpm > 0, 15000);
await wait(2500);
step('nothing computes audio features before something reads one (no request, no core sent)', !ThreeAudio.stats.wanted && !ThreeAudio.stats.coreSent, ThreeAudio.stats);

// ---------- a slider follows the kick: the whole-song features come ----------
const rt = await say('/react-to size kick 40 release=150');
step('/react-to binds a slider to a feature with a curve', /Size → Kick hits 40%.*release 150 ms/.test(rt), rt);
const sizeB = c.sliders().find((s) => s.key === 'size')?.followsMusic;
step('…stored as { band: kickOn, amount, c: { rel } }', sizeB?.band === 'kickOn' && sizeB.amount === 0.4 && sizeB.c?.rel === 150, sizeB);
await until(async () => /whole-song/.test((await ThreeAudio.probe(['kickOn']))?.from || ''), 30000);
const probe = async (t, names) => { c.seek(t); await wait(250); return (await ThreeAudio.probe(names)) || {}; };
const p0 = await ThreeAudio.probe(['kickOn']);
step('the song\'s features were computed (in a Worker) and reached the preview', /whole-song/.test(p0?.from || ''), p0?.from);
{
  const kIn = kicks.filter((t) => t > DROP + 1).slice(0, 6);
  const on = []; const off = [];
  for (const t of kIn) { on.push((await probe(t + 0.012, ['kickOn'])).values?.kickOn); off.push((await probe(t + beat * 0.55, ['kickOn'])).values?.kickOn); }
  step('kick hits at the playhead: high on the kicks, low between them', on.filter((v) => v > 0.6).length >= 5 && off.every((v) => v < 0.35), { on: on.map(r3), off: off.map(r3) });
}
{
  const d = await probe(DROP + 0.12, ['drop', 'build', 'intensity']);
  const b = await probe(DROP - 1.5, ['drop', 'build']);
  const i0 = await probe(3, ['build', 'drop', 'intensity']);
  step('drop: a pulse right after the drop', d.values?.drop > 0.75, d.values);
  step('build: ramps up before the drop', b.values?.build > 0.4 && i0.values?.build < 0.05, { before: b.values, intro: i0.values });
  step('intensity: higher in the drop than in the intro', (await probe(DROP + 4, ['intensity'])).values?.intensity > i0.values?.intensity + 0.2);
}
{
  const down = LEAD + 10 * bar; // a downbeat in the drop (the grid is found by the music analysis)
  const a = await probe(down + 0.03, ['beatInBar', 'barPhase', 'beatConf']);
  const h = await probe(down + bar / 2 + 0.01, ['beatInBar', 'barPhase']);
  step('bar position from the grid: beat 1 at a downbeat, half way at beat 3', a.values?.beatInBar === 1 && a.values.barPhase < 0.06 && h.values?.beatInBar === 3 && Math.abs(h.values.barPhase - 0.5) < 0.06, { a: a.values, h: h.values });
}
const sf = await say('/song-features');
const dm = sf.match(/Drops\*\*: ([\d:, ]+)/);
const dts = dm ? dm[1].split(',').map((s) => { const [m, ss] = s.trim().split(':'); return Number(m) * 60 + Number(ss); }) : [];
step('/song-features: the drop found (±1.5 s) and a build before it', dts.some((t) => Math.abs(t - DROP) < 1.5) && /Builds\*\*: \d/.test(sf), sf.split('\n').slice(0, 4).join(' | '));
step('/song-features again comes from the cache', /cache/i.test(await say('/song-features')));

// ---------- a fake live input: the drop, looped, as a "BlackHole 2ch" device ----------
const fake = new AudioContext({ sampleRate: 48000 });
const buf = fake.createBuffer(1, Math.round(8 * bar * sr), sr);
buf.getChannelData(0).set(x.subarray(Math.round(DROP * sr), Math.round((DROP + 8 * bar) * sr)));
const src = fake.createBufferSource(); src.buffer = buf; src.loop = true;
const dest = fake.createMediaStreamDestination(); src.connect(dest); src.start(); await fake.resume();
const asked = [];
const realEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
navigator.mediaDevices.enumerateDevices = async () => [...(await realEnum()).filter((d) => d.kind !== 'audioinput'), { kind: 'audioinput', deviceId: 'mic-1', label: 'MacBook Pro Microphone', groupId: 'a' }, { kind: 'audioinput', deviceId: 'bh-1', label: 'BlackHole 2ch', groupId: 'b' }];
navigator.mediaDevices.getUserMedia = async (constraints) => { asked.push(constraints); return dest.stream; };
const list = await say('/audio-in list');
step('/audio-in list: the loopback device marked 🔁, the mic 🎙', /🔁 BlackHole 2ch/.test(list) && /🎙 MacBook Pro Microphone/.test(list), list);
const li = await say('/audio-in loopback');
step('/audio-in loopback picks BlackHole and starts live sound', /BlackHole/.test(li) && asked.some((q) => q.audio?.deviceId?.exact === 'bh-1'), { li, asked: asked.map((q) => q.audio?.deviceId) });
await until(() => ThreeAudio.stats.worklet && ThreeAudio.stats.frames > 100, 15000);
step('live analysis runs in the AudioWorklet (≈ 90 compact buffers a second)', ThreeAudio.stats.worklet && ThreeAudio.stats.frames > 100, ThreeAudio.stats);
step('monitoring is off by default', !ThreeAudio.monitorOn());
const f0 = ThreeAudio.stats.frames; await wait(2000); const rate = (ThreeAudio.stats.frames - f0) / 2;
step('…at the audio rate (80–100 a second)', rate > 70 && rate < 110, rate);
{
  const samples = []; const t0 = performance.now();
  while (performance.now() - t0 < 9000) { const p = await ThreeAudio.probe(['kickOn', 'low', 'bpm', 'beatConf', 'beatPhase', 'barPhase', 'loudness']); if (p) samples.push({ ...p.values, src: p.from }); await wait(60); }
  const ks = samples.map((s) => s.kickOn);
  const last = samples[samples.length - 1] || {};
  step('live features reach the preview from the worklet', samples.length > 20 && samples.every((s) => /worklet/.test(s.src)), samples[0]?.src);
  step('live kick hits: pulses (high and low values)', Math.max(...ks) > 0.7 && Math.min(...ks) < 0.2, { max: r3(Math.max(...ks)), min: r3(Math.min(...ks)), n: ks.length });
  step('live tempo 128 (±3 %) with a confidence', Math.abs(last.bpm - BPM) / BPM < 0.03 && last.beatConf > 0.3, { bpm: last.bpm, conf: last.beatConf });
  step('live bar phase moves through the bar', new Set(samples.slice(-40).map((s) => Math.floor(s.barPhase * 4))).size >= 3);
  step('live loudness and bands are in', last.loudness > 0.1 && samples.some((s) => s.low > 0.2), { loudness: last.loudness });
}
// the mapped slider moves in the preview, and its meter in the panel
{
  const vals = [];
  for (let i = 0; i < 24; i++) { const e = await ThreeLab.director.evalInSketch("__slider('size')"); if (e?.ok) vals.push(Number(e.value)); await wait(70); }
  const spread = Math.max(...vals) - Math.min(...vals);
  step('a slider mapped to the kick moves with the live sound (size 1 → up to +1.12)', spread > 0.3 && Math.min(...vals) >= 0.99, { min: r3(Math.min(...vals)), max: r3(Math.max(...vals)), n: vals.length });
  const m = ThreeAudioMap.lastMeter.get('k:size');
  const bar0 = document.querySelector('.tw-am[data-mid="k:size"]');
  step('its live meter: values come back and the bar under the slider moves', Boolean(m) && Boolean(bar0) && /scaleX/.test(bar0.style.transform), { m, transform: bar0?.style.transform });
}
// presets, the list, the curve editor
{
  const pr = await say('/react-preset glow on hats');
  step('/react-preset glow on hats', c.sliders().find((s) => s.key === 'glow')?.followsMusic?.band === 'hatOn', pr);
  const pz = await say('/react-preset zoom on drops');
  step('/react-preset zoom on drops picks the zoom slider by its name', c.sliders().find((s) => s.key === 'zoom')?.followsMusic?.band === 'drop', pz);
  const ls = await say('/react-to');
  step('/react-to lists what follows what', /Size → Kick hits/.test(ls) && /Glow → Hat hits/.test(ls) && /Zoom → Drops/.test(ls), ls);
  await say('/react-curve size');
  const pop = document.querySelector('.am-pop');
  step('/react-curve opens the curve editor', Boolean(pop));
  const thr = pop?.querySelectorAll('input[type=range]')[1];
  if (thr) { thr.value = '0.5'; thr.dispatchEvent(new Event('input')); }
  await wait(250);
  step('the curve editor sets the threshold on the binding', c.sliders().find((s) => s.key === 'size')?.followsMusic?.c?.thr === 0.5, c.sliders().find((s) => s.key === 'size')?.followsMusic);
  await J.shot('labaudio-curve');
  await wait(600);
  step('the editor\'s curve shows the live input (dot + history)', Boolean(ThreeAudioMap.open));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(150);
  step('Esc closes the editor', !document.querySelector('.am-pop'));
}
{
  const au = await say('/audio');
  step('/audio says what it hears', /Hearing\*\*: live \(worklet\)/.test(au) && /Hits: kick/.test(au) && /LUFS/.test(au), au.split('\n').slice(0, 3).join(' | '));
  const nm = await say('/audio names');
  step('/audio names lists the features', /kickOn/.test(nm) && /barPhase/.test(nm) && /keyHue/.test(nm));
  await say('/audio-in monitor on'); const mOn = ThreeAudio.monitorOn(); await say('/audio-in monitor off');
  step('/audio-in monitor on / off', mOn && !ThreeAudio.monitorOn());
  const off = await say('/react-off everything');
  step('/react-off everything', /3 sliders/.test(off) && !c.sliders().some((s) => s.followsMusic), off);
}
po.disconnect();
step('no slow frames from the audio code (none over 50 ms)', longs.every((l) => l.ms < 50), longs.slice(0, 5));
await say('/live off');
src.stop(); fake.close();
step('live off: the worklet stops', !ThreeAudio.stats.worklet);
return J.done();
