// The song's parts in the Lab (round 30, stems): a generated song (4 s of bass notes alone, then kicks on the beat
// with bass notes off the beat) and a sketch reading audio.stems.drums. Checks: nothing is asked or computed before a
// sketch reads a part; the split comes (in a Worker, once) and reaches the preview; at the playhead the drums are high
// on the kicks and low on the bass notes, the bass is high on the bass notes; the second time it comes from the cache
// (/stems); a slider follows "the drums" (/react-to … the drums, the ♪ chips, the curve editor's sound list); the
// presets and the Lab mission are there; no duplicate commands.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/stems.js --shot /tmp/stems.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-stems-check.wav';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- the test song: 120 BPM; 0–4 s bass notes only, 4–14 s kicks on the beat + bass notes between ----------
const sr = 44100; const secs = 14; const n = secs * sr; const x = new Float32Array(n);
const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
const kicks = []; const bassOn = [];
const NOTES = [55, 73.42, 65.41, 82.41];
const bass = (t, len, k) => { const f = NOTES[k % 4]; add(t, len, (s) => 0.45 * Math.min(1, s / 0.012) * Math.min(1, (len - s) / 0.03) * (Math.sin(2 * Math.PI * f * s) + 0.25 * Math.sin(4 * Math.PI * f * s))); bassOn.push(t); };
const kick = (t) => { let ph = 0; let prev = 0; add(t, 0.25, (s) => { const f = 50 + 110 * Math.exp(-s * 35); ph += 2 * Math.PI * f * (s - prev); prev = s; return 0.9 * Math.sin(ph) * Math.exp(-s * 14); }); kicks.push(t); };
for (let k = 0; k < 8; k++) bass(k * 0.5 + 0.1, 0.42, k);
for (let k = 0; k < 20; k++) { const t = 4 + k * 0.5; kick(t); bass(t + 0.2, 0.26, k); }
{
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}

// ---------- the Lab, a sketch that doesn't read the parts, the song ----------
activate('tool:three');
const c = await ThreeLab.cmd();
await wait(1200);
step('/stems registered in the Lab area', Commands.get('stems')?.area === 'Three.js Lab');
step('no duplicate commands', !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
const tpl = ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code;
const base = tpl.replace('const cube = ', "const P = tweak({ size: [1, 0.2, 3], glow: [0.4, 0, 2] });\nconst cube = ")
  .replace('cube.rotation.set(t * 0.4, t * 0.6, 0);', 'cube.rotation.set(t * 0.4, t * 0.6, 0); cube.scale.setScalar(P.size); cube.material.emissiveIntensity = P.glow;');
ThreeLab.openCode(base);
await until(() => c.sliders().some((s) => s.key === 'glow'), 12000);
const r = await c.loadSong(SONG);
step('the test song loads', r.ok, r);
await wait(3000);
step('nothing asks for or computes the parts while no sketch reads them', LabStems.stats.asks === 0 && LabStems.stats.computed === 0, LabStems.stats);

// ---------- a sketch reads audio.stems.drums: the split comes ----------
await ThreeLab.director.editCode(null, [{ find: 'cube.material.emissiveIntensity = P.glow;', replace: 'cube.material.emissiveIntensity = P.glow + 2 * audio.stems.drums;' }], 1);
const t0 = performance.now();
await until(() => LabStems.stats.sent > 0, 60000);
step('a sketch reading audio.stems.drums asks once; the song is split (in a Worker) and sent to the preview', LabStems.stats.sent > 0 && LabStems.stats.computed === 1, { ...LabStems.stats, ms: Math.round(performance.now() - t0) });
const D = ThreeLab.director;
const ev = async (code) => { for (let i = 0; i < 4; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(400); } return null; };
await until(async () => (await ev('audio.stems.ready')) === true, 10000);
step('the preview has the parts for this song (audio.stems.ready)', (await ev('audio.stems.ready')) === true);
const at = async (t, what = 'drums') => { c.seek(t); await wait(220); return Number(await ev(`audio.stems.${what}`)); };
{
  const ks = kicks.slice(2, 10); const on = []; const off = []; const solo = [];
  for (const t of ks) on.push(await at(t + 0.02));
  for (const t of bassOn.filter((b) => b > 4.1).slice(2, 10)) off.push(await at(t + 0.02));
  for (const t of bassOn.filter((b) => b < 3.9).slice(1, 7)) solo.push(await at(t + 0.02));
  step('audio.stems.drums is high on the kicks', on.filter((v) => v > 0.5).length >= ks.length - 1, on.map(r2));
  step('…and low on the bass notes between them', off.every((v) => v < 0.35), off.map(r2));
  step('…and low on the bass notes alone (no drums)', solo.every((v) => v < 0.35), solo.map(r2));
  const b = []; for (const t of bassOn.filter((q) => q < 3.9).slice(1, 6)) b.push(await at(t + 0.15, 'bass'));
  step('audio.stems.bass is high on the bass notes', b.every((v) => v > 0.4), b.map(r2));
  const v = await at(2, 'vocals');
  step('audio.stems.vocals stays low (no voice in the song)', v < 0.2, r2(v));
}
await J.shot('stems-sketch');

// ---------- /stems, the cache ----------
const s1 = await say('/stems');
step('/stems: the parts, from the cache the second time', /drums \d+%/.test(s1) && /cache/i.test(s1), s1.split('\n')[0] + ' | ' + s1.split('\n')[1]);

// ---------- sliders follow the parts ----------
const rt = await say('/react-to size the drums 40');
step('/react-to size the drums: the slider follows the drums', c.sliders().find((s) => s.key === 'size')?.followsMusic?.band === 'stemDrums', rt);
const rb = await say('/react-to glow the bass 30');
step('/react-to glow the bass: the bass line (not the bass band)', c.sliders().find((s) => s.key === 'glow')?.followsMusic?.band === 'stemBass', rb);
step('the curve editor\'s sound list starts with the song\'s parts in plain words', ThreeAudio.GROUPS[0]?.[0] === LabStems.GROUP && ThreeAudio.GROUPS[0][1].map((p) => p[1]).slice(0, 3).join(', ') === 'The drums, The bass, The voice');
step('reaction presets: pump with the drums, throb with the bass, glow with the voice', ['pump-drums', 'throb-bass', 'glow-voice'].every((id) => ThreeAudioMap.PRESETS.some((p) => p.id === id)));
const rp = await say('/react-preset glow with the voice glow');
step('/react-preset glow with the voice', c.sliders().find((s) => s.key === 'glow')?.followsMusic?.band === 'stemVocals', rp);
step('the Lab mission "React to the drums, bass and voice"', Missions.LIST.some((m) => m.id === 'lab-stems'));
{
  // the ♪ panel of a slider: three chips in plain words
  document.querySelector('.tw-music-btn')?.click();
  // (round 38, beatlink) ♪ opens ♪ Move with the music; its More ▾ has this panel
  if (typeof BeatLink !== 'undefined' && BeatLink.card) { const a = BeatLink.card.a; BeatLink.close(); a.panel(); }
  await wait(400);
  const chips = [...document.querySelectorAll('.tw-bind:not([hidden]) .tw-chip')].map((b) => b.textContent);
  step('the slider\'s ♪ panel offers The drums / The bass / The voice', ['The drums', 'The bass', 'The voice'].every((t) => chips.includes(t)), chips.slice(-6));
  await J.shot('stems-panel');
}
// a slider following the drums moves on a kick, not on a bass note
{
  const k = kicks[6]; const b = bassOn.filter((q) => q > 4.1)[6];
  c.seek(k + 0.02); await wait(260); const vk = Number(await ev("__slider('size')"));
  c.seek(b + 0.02); await wait(260); const vb = Number(await ev("__slider('size')"));
  step('a slider following the drums: up on a kick, still on a bass note', vk - 1 > 3 * (vb - 1) && vk > 1.8, { kick: r2(vk), bass: r2(vb) });
}
return J.done();
