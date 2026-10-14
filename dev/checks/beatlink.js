// ♪ Move with the music (round 38, beatlink): a fixture song (120 BPM: a kick on every beat, soft hats between), a
// scene whose background brightness is its "glow" slider. Checks: right-click the slider › ♪ Move with the music… opens
// the card and links it (one undo step), Kick + Pulse, the ♪ badge on the slider, the "to" handle dragged on the slider
// itself (one undo step), /move-with with an exact range; during playback the slider's value is the pulse of the
// song's kicks at the playhead (and only there); the meter; two renders from the hidden export page give the same
// pixels, brighter on the kicks; undo walks back one change at a time; the link comes back after switching scenes, is
// in the scene's pack and survives 📐 My templates; Lab search and Find anything find it ("move with the beat",
// "pulse on kick"); no duplicate commands.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/beatlink.js --shot /tmp/beatlink.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-beatlink-check.wav';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const B = BeatLinkCore;

// ---------- the song: 13 s at 120 BPM, kicks on every beat from 0.5 s, soft hats on the off-beats ----------
const sr = 44100; const secs = 13; const n = secs * sr; const x = new Float32Array(n);
const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
const kicks = [];
const kick = (t) => { let ph = 0; let prev = 0; add(t, 0.25, (s) => { const f = 50 + 110 * Math.exp(-s * 35); ph += 2 * Math.PI * f * (s - prev); prev = s; return 0.9 * Math.sin(ph) * Math.exp(-s * 14); }); kicks.push(t); };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
for (let k = 0; k < 24; k++) { kick(0.5 + k * 0.5); add(0.75 + k * 0.5, 0.04, (s) => 0.12 * rnd() * Math.exp(-s * 90)); }
{
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}
const SKETCH = `import * as THREE from 'three';
const P = tweak({ glow: { value: 0.2, min: 0, max: 2, label: 'Glow' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 5);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff3cac' }));
scene.add(cube);
renderer.setAnimationLoop(() => { scene.background.setScalar(Math.min(1, P.glow * 0.45)); cube.scale.setScalar(P.size); renderer.render(scene, camera); });`;

// ---------- the Lab, the scene, the song ----------
activate('tool:three');
const c = await ThreeLab.cmd();
await wait(1000);
step('/move-with is a Lab command; no duplicate commands', Commands.get('move-with')?.area === 'Three.js Lab' && !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
ThreeLab.openCode(SKETCH);
await until(() => c.sliders().some((s) => s.key === 'glow'), 12000);
const sceneId = ThreeLab.scenes.currentId();
const r = await c.loadSong(SONG);
step('the fixture song loads', r.ok, r);
await until(() => c.player.analysis?.onsets?.kick?.length > 12, 30000);
const D = ThreeLab.director;
const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
const onsets = (await ev('JSON.stringify(audio.analysis?.onsets?.kick?.map((o) => o.t) || [])')) || '[]';
const hits = JSON.parse(onsets);
step('the song\'s kicks are found (what the link reads)', hits.filter((t) => kicks.some((k) => Math.abs(k - t) < 0.04)).length >= 20, { found: hits.length });
const ctl = ThreeAudio.lab.selCtl();
// (the Lab's default layout shows a number like this one as a knob; Knobs or sliders › Sliders shows a slider)
const rowOf = () => document.querySelector('.tweaks [data-tw-key="glow"]');
await until(() => rowOf(), 6000);

// ---------- one gesture: right-click the slider › ♪ Move with the music… ----------
const undo0 = ctl.undoDepth;
{
  const row = rowOf(); const rr = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rr.left + 40, clientY: rr.top + 8 }));
  await wait(250);
  const items = [...document.querySelectorAll('.mb-menu .menu-item')];
  const mi = items.find((x) => /Move with the music/.test(x.textContent));
  step('right-click a slider: "♪ Move with the music…" is its first row', mi && items.indexOf(mi) <= 1, items.slice(0, 3).map((x) => x.textContent.slice(0, 40)));
  mi?.click();
  await wait(300);
}
step('the card opens and the slider is linked (one undo step)', Boolean(BeatLink.card) && B.isLink(ctl.binding('glow')) && ctl.undoDepth === undo0 + 1, { link: ctl.binding('glow'), undo: ctl.undoDepth - undo0 });
const chipClick = (sel, text) => [...document.querySelectorAll(`.bl-pop ${sel} .bl-chip`)].find((b) => b.textContent === text)?.click();
chipClick('.bl-drv', 'Kick'); await wait(80);
chipClick('.bl-seg', 'Pulse'); await wait(150);
const l1 = ctl.binding('glow');
step('Kick + Pulse: linked to the kick, pulsing, with a range above where the slider was', l1?.band === 'kick' && l1?.how === 'pulse' && l1.hi > l1.lo && Math.abs(l1.lo - 0.2) < 1e-9, l1);
step('the ♪ badge on the slider (and its range handles)', rowOf().classList.contains('bl-linked') && rowOf().dataset.beatlink === 'Kick · pulse' && rowOf().querySelector('.tw-music-btn.on') && rowOf().querySelector('.bl-on-knob, .bl-on-slider:not([hidden])')?.getAttribute('visibility') !== 'hidden', { badge: rowOf().dataset.beatlink, knob: Boolean(rowOf().querySelector('.bl-on-knob')), live: ctl.controls().find((q) => q.key === 'glow').live, note: document.querySelector('.bl-note')?.textContent });
await J.shot('beatlink-card');
const undoCard = ctl.undoDepth;

// ---------- the range, dragged on the slider itself ----------
{
  BeatLink.close();
  const knob = rowOf().querySelector('svg.tw-knob');
  const h = rowOf().querySelector('.bl-h.hi');
  const hr = h.getBoundingClientRect();
  let to; let toY;
  if (knob) {
    // 80 % around the knob's 270° arc (from 135°): 351°
    const kr = knob.getBoundingClientRect(); const R = (kr.width / 48) * 22; const th = ((135 + 0.8 * 270) * Math.PI) / 180;
    to = kr.left + kr.width / 2 + R * Math.cos(th); toY = kr.top + kr.height / 2 + R * Math.sin(th);
  } else { const wr = rowOf().querySelector('.tw-range').getBoundingClientRect(); to = wr.left + 7 + (wr.width - 14) * 0.8; toY = hr.top + 4; }
  const x0 = hr.left + hr.width / 2; const y0 = hr.top + hr.height / 2;
  const pe = (type, el, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientX: x, clientY: y }));
  const v0 = ctl.controls().find((q) => q.key === 'glow').value;
  pe('pointerdown', h, x0, y0);
  for (let k = 1; k <= 5; k++) { pe('pointermove', h, x0 + ((to - x0) * k) / 5, y0 + ((toY - y0) * k) / 5); await wait(16); }
  pe('pointerup', h, to, toY);
  await wait(150);
  const l2 = ctl.binding('glow');
  step('drag the "to" handle on the slider: the range follows, one undo step for the whole drag (the slider itself didn\'t turn)', Math.abs(l2.hi - 1.6) < 0.05 && l2.lo === l1.lo && ctl.undoDepth === undoCard + 1 && ctl.controls().find((q) => q.key === 'glow').value === v0, { hi: l2.hi, undo: ctl.undoDepth - undoCard });
}
const linkDrag = JSON.stringify(ctl.binding('glow'));
const rc = await say('/move-with glow kick pulse from 0.2 to 1.8');
const L = ctl.binding('glow');
step('/move-with glow kick pulse from 0.2 to 1.8', L.lo === 0.2 && L.hi === 1.8 && L.band === 'kick' && L.how === 'pulse', rc);

// ---------- playback: the value is the pulse of the kicks at the playhead ----------
const expect = (t) => B.value(L, { t, hit: B.hitsOf(hits), beat: B.hitsOf(hits), level: () => 0, hist: true })[0];
{
  c.seek(2); c.play(true);
  await wait(400);
  const samples = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 3000) { const v = await ev('JSON.stringify([audio.time, __slider("glow")])'); if (v) samples.push(JSON.parse(v)); await wait(15); }
  c.play(false);
  const vals = samples.map((s) => s[1]);
  const close = samples.filter(([t, v]) => Math.abs(v - expect(t)) < 0.02).length;
  step('during playback the slider pulses on the kicks (up to ≈ 1.8 on a hit, back to 0.2 between)', Math.max(...vals) > 1.3 && Math.min(...vals) < 0.35, { n: samples.length, max: r3(Math.max(...vals)), min: r3(Math.min(...vals)) });
  step('…exactly the pulse of the song\'s kicks at the playhead (every sample)', samples.length > 30 && close >= samples.length - 1, { close, n: samples.length });
  const m = ThreeAudioMap.lastMeter.get('k:glow');
  step('the live meter has the driver', Array.isArray(m) && m.length === 2, m);
}
{
  const k = hits.find((t) => t > 4);
  c.seek(k + 0.004); await wait(250); const on = Number(await ev('__slider("glow")'));
  c.seek(k + 0.4); await wait(250); const off = Number(await ev('__slider("glow")'));
  c.seek(k + 0.004); await wait(250); const on2 = Number(await ev('__slider("glow")'));
  step('paused: 4 ms after a kick ≈ 1.7, 0.4 s later back near 0.2, the same value at the same time', on > 1.6 && off < 0.3 && on === on2 && Math.abs(on - expect(k + 0.004)) < 0.01, { on: r3(on), off: r3(off), on2: r3(on2) });
}

// ---------- renders: the hidden export page, twice ----------
{
  const k = hits.filter((t) => t > 3 && t < 9);
  const times = (j) => (j % 2 ? k[j >> 1] + 0.3 : k[j >> 1] + 0.001);
  const shoot = async () => (await LabExport.probe({ w: 64, h: 36, F: 30, n: 8, times })).frames;
  const lum = async (buf) => { const bm = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, 8, 8).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
  try {
    const a = await shoot(); const b = await shoot();
    const same = a.length === b.length && a.every((f, i) => { const x1 = new Uint8Array(f); const x2 = new Uint8Array(b[i]); return x1.length === x2.length && x1.every((v, j) => v === x2[j]); });
    const L1 = await Promise.all(a.map(lum));
    const onK = L1.filter((_, j) => j % 2 === 0); const offK = L1.filter((_, j) => j % 2);
    step('a render twice: the same pixels, frame for frame', same, { frames: a.length });
    step('…brighter on the kicks than between them (the link renders)', Math.min(...onK) > Math.max(...offK) + 40, { on: onK.map(Math.round), off: offK.map(Math.round) });
  } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
}

// ---------- live: the computer's sound (a loopback device, stubbed: the fixture song looped) ----------
{
  const fake = new AudioContext({ sampleRate: 44100 });
  const buf = fake.createBuffer(1, n, sr); buf.getChannelData(0).set(x);
  const src = fake.createBufferSource(); src.buffer = buf; src.loop = true;
  const dest = fake.createMediaStreamDestination(); src.connect(dest); src.start(); await fake.resume();
  const realEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async () => [...(await realEnum()).filter((d) => d.kind !== 'audioinput'), { kind: 'audioinput', deviceId: 'bh-1', label: 'BlackHole 2ch', groupId: 'b' }];
  navigator.mediaDevices.getUserMedia = async () => dest.stream;
  try {
    await say('/audio-in loopback');
    await until(() => ThreeAudio.stats.worklet && ThreeAudio.stats.frames > 60, 15000);
    await wait(1500);
    const vals = []; const t0 = performance.now();
    while (performance.now() - t0 < 4000) { const v = await ev('__slider("glow")'); if (v != null) vals.push(Number(v)); await wait(20); }
    let rises = 0; for (let i = 1; i < vals.length; i++) if (vals[i] > 1.2 && vals[i - 1] < 1.0) rises += 1;
    step('live sound: the same link pulses on the kicks it hears (≈ 2 a second)', Math.max(...vals) > 1.3 && Math.min(...vals) < 0.5 && rises >= 4 && rises <= 10, { n: vals.length, max: r3(Math.max(...vals)), min: r3(Math.min(...vals)), rises });
  } catch (err) { step('live sound', false, String(err?.message || err)); }
  await say('/live off');
  navigator.mediaDevices.enumerateDevices = realEnum; navigator.mediaDevices.getUserMedia = realGum;
  src.stop(); fake.close();
  await until(() => c.player.loaded, 8000);
}

// ---------- undo: one change at a time ----------
ctl.undo(); await wait(100);
step('undo: back to the dragged range (the /move-with change undone)', JSON.stringify(ctl.binding('glow')) === linkDrag, ctl.binding('glow'));
ctl.undo(); await wait(100);
step('undo again: the drag undone', Math.abs(ctl.binding('glow').hi - l1.hi) < 1e-9, ctl.binding('glow'));
ctl.undo(); ctl.undo(); await wait(150);
step('…and twice more: Kick, then the link itself (the slider is still again, no badge)', !ctl.binding('glow') && !rowOf().classList.contains('bl-linked'), ctl.binding('glow'));
await say('/move-with glow kick pulse from 0.2 to 1.8');

// ---------- saved with the scene, its pack, 📐 My templates ----------
{
  const ex = ThreeLab.scenes.extrasOf(sceneId);
  step('saved with the scene (its music links)', ex?.bindings?.['k:glow']?.how === 'pulse', ex?.bindings?.['k:glow']);
  ThreeLab.openCode(ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code);
  await wait(1500);
  c.openSketch(ThreeLab.scenes.get(sceneId).name);
  await until(() => ThreeAudio.lab.selCtl()?.binding?.('glow'), 10000);
  await until(() => rowOf()?.classList.contains('bl-linked'), 6000);
  const b2 = ThreeAudio.lab.selCtl().binding('glow');
  step('switch scenes and back: the link, its badge', b2?.how === 'pulse' && b2.hi === 1.8 && rowOf()?.classList.contains('bl-linked'), b2);
  await c.waitSong?.();
  await until(() => c.player.loaded, 8000);
  const k = hits.find((t) => t > 5);
  let v = 0;
  await until(async () => { c.seek(k + 0.004); await wait(150); v = Number(await ev('__slider("glow")')); return v > 1.6; }, 10000);
  const diag = v > 1.6 ? null : { page: await ev('JSON.stringify({ lib: Boolean(globalThis.beatlink), t: audio.time, kicks: audio.analysis?.onsets?.kick?.length ?? null, loaded: audio.loaded })'), link: ThreeAudio.lab.selCtl()?.binding?.('glow'), song: c.player.path, loaded: c.player.loaded, live: ThreeAudio.lab.selCtl()?.controls?.().find((q) => q.key === 'glow') };
  step('…and it still pulses there', v > 1.6, diag ? { v: r3(v), diag } : r3(v));
  // (round 38 merge) the race behind a flaky "…still pulses there": a value computed at a playhead time before the song's
  // hits arrived stayed cached for that time (a paused scene reads the same time every frame), so it never caught up.
  // Made deterministic: paused just after a beat, the grid moves under it (new beats, same playhead): the value must follow.
  {
    const ctl4 = ThreeAudio.lab.selCtl();
    const keep = ctl4.binding('glow');
    ctl4.link('glow', { ...keep, band: 'beat', how: 'pulse' });
    c.seek(6.2); await wait(300);
    const bt = Number(await ev('audio.time - audio.since("beat")')); // the grid's beat (yours or the analysis')
    c.seek(bt + 0.004); await wait(400);
    const onBeat = Number(await ev('__slider("glow")'));
    c.nudgeGrid(60); await wait(500); // the beats move 60 ms later: the playhead is now just before one
    const moved = Number(await ev('__slider("glow")'));
    c.nudgeGrid(-60); await wait(500);
    const back = Number(await ev('__slider("glow")'));
    step('the grid changes under a paused playhead: the value follows at once (nothing stale from before)', onBeat > 1.6 && moved < 0.4 && back > 1.6, { onBeat: r3(onBeat), moved: r3(moved), back: r3(back) });
    ctl4.link('glow', keep);
  }
  await Lazy.load('packs');
  const pd = await LabPacks.sceneData(sceneId);
  step('in the scene\'s pack (.hearthpack)', pd.extras?.bindings?.['k:glow']?.how === 'pulse');
  await Lazy.load('labtemplates');
  try {
    const sv = await LabTemplates.saveCurrent({ name: 'beatlink probe' });
    const t = (await LabTemplates.list({ fresh: true })).find((x) => x.id === sv.id);
    const made = await LabTemplates.create(t, {}, { quiet: true });
    await until(() => ThreeAudio.lab.selCtl()?.binding?.('glow'), 10000);
    const b3 = ThreeAudio.lab.selCtl()?.binding?.('glow');
    step('📐 a scene made from My templates keeps the link', made.id !== sceneId && b3?.how === 'pulse' && b3.band === 'kick', b3);
    await LabTemplates.remove?.(t).catch?.(() => {});
  } catch (err) { step('📐 My templates', false, String(err?.message || err)); }
}

// ---------- found: Lab search, Find anything ----------
{
  if (typeof LabSearch === 'undefined') await Lazy.load('labsearch');
  LabSearch.buildIndex?.();
  const top = (q) => LabSearch.find(q, 3).map((x) => x.item.label);
  const a = top('move with the beat'); const b = top('pulse on kick');
  step('Lab search: "move with the beat", "pulse on kick" → ♪ Move a slider with the music…', /Move a slider with the music/.test(a[0] || '') && /Move a slider with the music/.test(b[0] || ''), { a, b });
  let found = null;
  try {
    AppUI.palette();
    await until(() => document.querySelector('.palette-input'), 3000);
    await until(() => typeof AppSearch !== 'undefined', 8000);
    const inp = document.querySelector('.palette-input');
    inp.value = 'pulse on kick'; inp.dispatchEvent(new Event('input'));
    await wait(500);
    found = [...document.querySelectorAll('.palette .palette-item .p-label')].slice(0, 6).map((x) => x.textContent);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } catch (err) { found = String(err); }
  step('Find anything: "pulse on kick" finds it', Array.isArray(found) && found.some((l) => /move .*with the music/i.test(l || '')), found);
}
{
  // a slider that follows an older curve (/react-to) keeps it when the card opens; a choice there replaces it (one undo step back)
  await say('/react-to size kick 40');
  const ctl3 = ThreeAudio.lab.selCtl();
  const old = JSON.stringify(ctl3.binding('size'));
  ctl3.openLink('size'); await wait(250);
  const kept = JSON.stringify(ctl3.binding('size')) === old;
  [...document.querySelectorAll('.bl-pop .bl-seg .bl-chip')].find((b) => b.textContent === 'Step')?.click(); await wait(100);
  const now = ctl3.binding('size');
  ctl3.undo(); await wait(100);
  step('an older curve is kept until a choice in the card (Kick, the sound it followed, is offered); undo brings the curve back', kept && now?.how === 'step' && now.band === 'kick' && JSON.stringify(ctl3.binding('size')) === old, { now, back: ctl3.binding('size') });
  BeatLink.close();
  await say('/react-to size off');
}
{
  // Knobs or sliders › Sliders: the range is a band under the slider's track with two handles; drag the "from" one
  const mi = (re) => [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => re.test(x.textContent));
  const layoutTo = async (re) => { document.querySelector('.tweaks .tw-more')?.click(); await wait(200); if (!mi(re)) { mi(/^Show/)?.click(); await wait(250); } mi(re)?.click(); await wait(300); };
  await layoutTo(/Sliders for every number/);
  const row = document.querySelector('.tw-row[data-tw-key="glow"]');
  const ov = row?.querySelector('.bl-on-slider');
  const ctl2 = ThreeAudio.lab.selCtl();
  const d0 = ctl2.undoDepth;
  if (ov && !ov.hidden) {
    const wr = row.querySelector('.tw-range').getBoundingClientRect(); const h = ov.querySelector('.bl-h.lo'); const hr = h.getBoundingClientRect();
    const to = wr.left + 7 + (wr.width - 14) * 0.25; // 0.5 of 0…2
    const pe = (type, x0) => h.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, button: 0, clientX: x0, clientY: hr.top + 3 }));
    pe('pointerdown', hr.left + hr.width / 2); pe('pointermove', (hr.left + to) / 2); pe('pointermove', to); pe('pointerup', to);
    await wait(120);
  }
  const b = ctl2.binding('glow');
  step('as a slider: the band and its handles under the track; dragging "from" sets it (one undo step)', ov && !ov.hidden && Math.abs(b.lo - 0.5) < 0.03 && ctl2.undoDepth === d0 + 1, { lo: b?.lo, undo: ctl2.undoDepth - d0 });
  row?.scrollIntoView({ block: 'center' });
  await J.shot('beatlink-slider');
  await layoutTo(/Auto: knobs for decimals/);
}
{
  // the picture: the knob with its ♪ range arc, playing
  BeatLink.close();
  rowOf()?.scrollIntoView({ block: 'center' });
  c.seek(4); c.play(true); await wait(600); c.play(false);
}
return J.done();
