// ▶ Play's sound (round 54, gameaudio): sound in the game window is instant and never hitches the picture.
// A throwaway three.js game ("Clink", /tmp/hearth-gameaudio/game: three.js from the ▶ Play fixture in /tmp/hearth-gamemode)
// that makes its sound the way most three.js games do: the AudioListener (its AudioContext) and each sound loaded and
// decoded the first time it's needed (a 0.4 s effect, then a 30 s music track ≈ 5 MB). Three ▶ Plays of it:
//   before   Hearth's sound part off (store gameaudio.off): what the game pays itself on its first sounds
//   first    on, the first launch: the sound system started behind the card (warm), the sounds not known yet
//   after    on, again: the sounds the folder served last time decoded before the first frame → the game's own decode
//            gets the decoded buffer at once
// Per run: the AudioContext's cost on the game's frame (ms), how late each sound played after it was asked for, the
// worst frame around it vs the median frame, the context running with no click. Then (after): the latency (base +
// output) on the F chip and in pub(), Ctrl/⌘+P (playloop rest) suspends the game's sound and wake brings it back
// running from where it was, the doctor's plain-words findings (a sound decoded mid-play: "came late"), a Lab scene
// whose sound reference is decoded before its first frame, and the game's files unchanged.
// Xvfb: no sound card (Chromium's fake output), software GL: absolute ms carry the machine; the before → after
// differences are Hearth's.
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/gameaudio.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 4 min`)), 240000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-gameaudio';
const GAME = `${DIR}/game`;
const EXT = 'wav'; // (16-bit PCM, made here)
const G = () => window.hub.game;
const ev = async (code) => { const r = await G().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- the fixture game (the "owner's game": only ever read) ----------
function wavBytes(secs, { rate = 44100, ch = 2, tone = 220, noise = 0 } = {}) {
  const n = Math.floor(secs * rate); const u = new Uint8Array(44 + n * ch * 2); const v = new DataView(u.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let seed = 7;
  for (let i = 0; i < n; i += 1) { const env = Math.exp(-i / rate * (noise ? 8 : 0.05)); seed = (seed * 1103515245 + 12345) >>> 0; const s = (Math.sin(2 * Math.PI * tone * i / rate) * (1 - noise) + ((seed / 4294967296) * 2 - 1) * noise) * env * 12000; for (let c = 0; c < ch; c += 1) v.setInt16(44 + (i * ch + c) * 2, s, true); }
  return u;
}
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Clink</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style>
<script type="importmap">{"imports":{"three":"./lib/three.module.js"}}</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 4;
const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); scene.add(box);
const G = window.__clink = { frames: [], sounds: [] };
let last = 0;
renderer.setAnimationLoop((t) => { const n = performance.now(); if (last) { G.frames.push([Math.round(n), Math.round((n - last) * 10) / 10]); if (G.frames.length > 6000) G.frames.shift(); } last = n; box.rotation.y = t / 700; renderer.render(scene, camera); });
// sound as most three.js games make it: the listener (its AudioContext) and each sound loaded when first needed
let listener = null; const loader = new THREE.AudioLoader();
window.__boom = (file) => new Promise((done) => {
  const asked = performance.now(); const r = { file, asked: Math.round(asked) };
  if (!listener) { const t = performance.now(); listener = new THREE.AudioListener(); camera.add(listener); r.ctxMs = Math.round((performance.now() - t) * 10) / 10; r.ctxState = listener.context.state; }
  loader.load('sounds/' + file, (buf) => { const s = new THREE.Audio(listener); s.setBuffer(buf); s.play(); const p = performance.now(); r.played = Math.round(p); r.lateMs = Math.round((p - asked) * 10) / 10; r.state = listener.context.state; G.sounds.push(r); done(r); }, undefined, (e) => { r.error = String(e && e.message || e); done(r); });
});
window.__ctx = () => listener ? { state: listener.context.state, time: listener.context.currentTime } : null;
</script></body></html>`;
const ORIG = [`${GAME}/index.html`, `${GAME}/sounds/boom.${EXT}`, `${GAME}/sounds/music.${EXT}`, `${GAME}/lib/three.module.js`];
await safe('fixtures', async () => {
  const lib = '/tmp/hearth-gamemode/html/lib';
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.write(`${GAME}/lib/${f}`, await window.hub.fs.read(`${lib}/${f}`));
  await window.hub.fs.write(`${GAME}/index.html`, HTML);
  await window.hub.fs.write(`${GAME}/sounds/boom.${EXT}`, wavBytes(0.4, { noise: 0.7, tone: 90 }));
  await window.hub.fs.write(`${GAME}/sounds/music.${EXT}`, wavBytes(30, { tone: 220 }));
  await window.hub.fs.write(`${DIR}/zap.${EXT}`, wavBytes(0.3, { noise: 0.3, tone: 600 }));
  out.hashBefore = await window.hub.gameReady.hash(ORIG);
  step('fixtures: a three.js game with a 0.4 s effect and a 30 s music track (≈ 5 MB), loaded when first needed', out.hashBefore.every((h) => h.hash), out.hashBefore.map((h) => [h.path.split('/').slice(-2).join('/'), h.size]));
});

await Lazy.load('gamemode'); await Lazy.load('gameready');
if (typeof GamePerf === 'undefined') await Lazy.load('gameperf').catch(() => {});
const source = { kind: 'html', path: `${GAME}/index.html`, title: 'Clink' };
async function leave() { await GameMode.leave(); await until(async () => !(await G().state())?.playing, 10000); await wait(800); }
const framesAround = (frames, from, to) => frames.filter(([t]) => t >= from && t <= to).map(([, dt]) => dt);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
// one ▶ Play: playing (the card gone) → 1.5 s → the first sound → 1.5 s → the music → 1.5 s; the frames around each
async function run(label, { off = false, then } = {}) {
  store.set('gameaudio.off', off);
  await GameMode.play(source);
  await until(async () => (await ev('window.__gameReady ? window.__gameReady.phase : (window.__clink ? "playing" : "")')) === 'playing' && await ev('Boolean(window.__boom)'), 90000);
  await wait(1500);
  const boom = await ev(`window.__boom('boom.${EXT}')`);
  await wait(1500);
  const music = await ev(`window.__boom('music.${EXT}')`);
  await wait(1500);
  const frames = await ev('window.__clink.frames');
  const base = median(framesAround(frames, boom.asked - 1500, boom.asked - 50));
  const worst = (r) => Math.max(0, ...framesAround(frames, r.asked - 2, (r.played || r.asked) + 120));
  const audio = JSON.parse((await ev('window.__gameAudio ? window.__gameAudio.pub() : "null"')) || 'null');
  const ready = JSON.parse((await ev('window.__gameReady ? window.__gameReady.pub() : "null"')) || 'null');
  const m = { medianFrameMs: base, ctxMs: boom.ctxMs, ctxStateNoClick: boom.ctxState, boom: { lateMs: boom.lateMs, worstFrameMs: worst(boom), state: boom.state, error: boom.error }, music: { lateMs: music.lateMs, worstFrameMs: worst(music), error: music.error }, audio: audio && { warmMs: audio.warmMs, latencyMs: audio.latencyMs, baseMs: audio.baseMs, outputMs: audio.outputMs, rate: audio.rate, hits: audio.hits, misses: audio.misses, pre: audio.pre, fromMemory: audio.fromMemory, firstCtxMs: audio.firstCtxMs, slow: audio.slow, late: audio.late, events: audio.events }, readySounds: ready?.result?.sounds || null };
  out.measure[label] = m;
  if (then) await then(m, audio);
  await leave();
  return m;
}

let before = null; let first = null; let after = null;
await safe('before', async () => {
  before = await run('before', { off: true });
  step('before (Hearth\'s sound part off): the game\'s own first sounds measured', before.boom.lateMs != null && before.music.lateMs != null && !before.boom.error, before);
});
await safe('first', async () => {
  first = await run('first', {
    then: async (m, audio) => {
      // the doctor, on this run's numbers: the music decoded mid-play came late
      let ids = null; let titles = null;
      try { if (typeof GamePerf !== 'undefined' && GamePerf.measure) { const r = await GamePerf.measure({ secs: 0 }); ids = r.findings.map((f) => f.id); titles = r.findings.filter((f) => /^sound-/.test(f.id)).map((f) => f.title); } } catch (err) { ids = [`error: ${err.message}`]; }
      const rules = typeof GamePerfCore !== 'undefined' ? GamePerfCore.soundFindings(audio, { secs: 6 }) : [];
      out.measure.firstDoctor = { ids, titles, rules: rules.map((f) => f.title) };
      step('first launch: the sound system started behind the card (the game\'s own AudioContext costs ≈ nothing), running with no click', audio && audio.warmMs != null && m.ctxMs != null && m.ctxStateNoClick === 'running' && (before?.ctxMs == null || m.ctxMs <= Math.max(2, before.ctxMs)), { warmMs: audio?.warmMs, ctxMs: m.ctxMs, beforeCtxMs: before?.ctxMs, state: m.ctxStateNoClick });
      // the rules on known numbers (any machine): a decode in a frame that froze, a sound held back, a slow sound-system start
      const syn = typeof GamePerfCore !== 'undefined' ? GamePerfCore.soundFindings({ slow: [{ kind: 'decode', name: 'music.ogg', bytes: 5.2e6, ms: 140, frameMs: 190 }, { kind: 'context', ms: 120, frameMs: 120 }], late: [{ name: 'boom.ogg', bytes: 70000, ms: 260 }, { name: 'music.ogg', bytes: 5.2e6, ms: 140 }] }, { secs: 10 }) : [];
      out.measure.doctorRules = syn.map((f) => `[${f.id}] ${f.title}`);
      step('the doctor\'s sound findings in plain words: the file, its size, the frame it froze / how late it was', syn.length === 3 && /music\.ogg \(5 MB\).*190 ms/.test(syn.find((f) => f.id === 'sound-decode')?.title || '') && /boom\.ogg \(68 KB\).*260 ms/.test(syn.find((f) => f.id === 'sound-late')?.title || '') && /froze 120 ms/.test(syn.find((f) => f.id === 'sound-start')?.title || ''), out.measure.doctorRules);
      // this run: the music decoded mid-play (its decode ms here depends on the machine): named when it counted; never the warmed-up start
      const counted = (audio?.late?.length || 0) + (audio?.slow?.length || 0);
      step('this run\'s doctor: the music named when its decode held it back / froze a frame; no "sound started mid-play" (warmed up)', !rules.some((f) => f.id === 'sound-start') && (!counted || rules.some((f) => /^sound-(late|decode)$/.test(f.id) && /music/.test(f.title))) && (!ids || !counted || ids.some((x) => /^sound-/.test(x))), { ...out.measure.firstDoctor, decodes: audio?.events?.filter((e) => e.kind === 'decode').map((e) => [e.name, e.ms]) });
    },
  });
});
await safe('after', async () => {
  after = await run('after', {
    then: async (m, audio) => {
      step('again: the sounds it loaded last time decoded before the first frame (the card waited for them)', audio?.pre?.n >= 2 && audio.pre.done >= 2 && audio.hits >= 2, { pre: audio?.pre, hits: audio?.hits, misses: audio?.misses, readySounds: m.readySounds });
      // (what's left is the game's own fetch of the file, read in chunks across frames: ≈ 1–2 of this machine's slow frames)
      // (the music's "before" depends most on how fast this machine decodes 5 MB: what's left after is the game's loader reading the bytes, ≈ a frame)
      step('again: the first sounds play at once (decoded, the file already read) — the effect ≥ 3× sooner, the music sooner and within 2 frames', m.boom.lateMs != null && m.music.lateMs != null && m.music.lateMs < (before?.music.lateMs ?? Infinity) && m.music.lateMs <= 2 * (m.medianFrameMs || 17) + 10 && m.boom.lateMs <= Math.max(20, (before?.boom.lateMs ?? 0) / 3), { before: before && { boom: before.boom.lateMs, music: before.music.lateMs }, after: { boom: m.boom.lateMs, music: m.music.lateMs } });
      step('the latency is known (base + output) and asked for small (interactive)', audio?.latencyMs != null && audio.latencyMs > 0 && audio.latencyMs < 250, { latencyMs: audio?.latencyMs, baseMs: audio?.baseMs, outputMs: audio?.outputMs, rate: audio?.rate });
      // the F chip shows it
      await G().key({ key: 'F' }); await wait(2600);
      const chip = await ev('(() => { const h = document.querySelector("hearth-game-ui"); const c = h && h.shadowRoot.querySelector(".chip"); return c && !c.hidden ? c.textContent : null; })()');
      await G().key({ key: 'F' });
      step('the F chip shows the sound\'s latency', /sound \d+ ms/.test(chip || ''), chip);
      // Ctrl/⌘+P (playloop's rest): the game's sound pauses with it and comes back where it was
      const c0 = await ev('window.__ctx()');
      await G().loop({ op: 'rest' }); await wait(900);
      const r = { pub: JSON.parse(await ev('window.__gameAudio.pub()')), ctx: await ev('window.__ctx()') };
      await wait(700);
      const r2 = await ev('window.__ctx()');
      await G().loop({ op: 'wake' }); await wait(1200);
      const w = { pub: JSON.parse(await ev('window.__gameAudio.pub()')), ctx: await ev('window.__ctx()') };
      out.measure.rest = { before: c0, resting: r.ctx, restingLater: r2, why: r.pub.why, woke: w.ctx, wokeWhy: w.pub.why };
      step('Ctrl/⌘+P: the game\'s sound suspended while it rests (its clock stopped), running again after, from where it was', r.pub.rest && r.ctx?.state === 'suspended' && Math.abs((r2?.time ?? 0) - (r.ctx?.time ?? 1)) < 0.05 && !w.pub.rest && w.ctx?.state === 'running' && w.ctx.time >= r2.time, out.measure.rest);
    },
  });
});
if (before && after) {
  out.measure.summary = {
    firstAudioContextMs: { before: before.ctxMs, first: first?.ctxMs, after: after.ctxMs, warmAtLoad: after.audio?.warmMs ?? first?.audio?.warmMs },
    firstSoundLateMs: { before: before.boom.lateMs, first: first?.boom.lateMs, after: after.boom.lateMs },
    musicLateMs: { before: before.music.lateMs, first: first?.music.lateMs, after: after.music.lateMs },
    worstFrameOnFirstSoundMs: { before: before.boom.worstFrameMs, first: first?.boom.worstFrameMs, after: after.boom.worstFrameMs, median: after.medianFrameMs },
    worstFrameOnMusicMs: { before: before.music.worstFrameMs, first: first?.music.worstFrameMs, after: after.music.worstFrameMs },
    latencyMs: after.audio?.latencyMs,
  };
  step('the first sound\'s frame is no worse than before (its AudioContext no longer on it)', after.boom.worstFrameMs <= Math.max(before.boom.worstFrameMs * 1.25, (after.medianFrameMs || 17) * 2.5), out.measure.summary.worstFrameOnFirstSoundMs);
}

// ---------- a Lab scene: its sound reference decoded before its first frame ----------
const LAB_ID = 'gaudio1';
const LAB = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 4;
scene.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 24, 64), new THREE.MeshNormalMaterial()));
renderer.setAnimationLoop(() => renderer.render(scene, camera));
let listener = null;
window.__zap = () => new Promise((done) => { const t = performance.now(); if (!listener) { listener = new THREE.AudioListener(); camera.add(listener); } new THREE.AudioLoader().load(refs.zap, (b) => { const s = new THREE.Audio(listener); s.setBuffer(b); s.play(); done({ lateMs: Math.round((performance.now() - t) * 10) / 10, state: listener.context.state }); }, undefined, (e) => done({ error: String(e) })); });`;
await safe('lab', async () => {
  store.set('gameaudio.off', false);
  const sk = (await window.hub.kvGet('three-sketches', [])) || [];
  if (!sk.some((x) => x.id === LAB_ID)) { sk.push({ id: LAB_ID, name: 'Clink sounds', layers: [{ id: 'game', name: 'Game', code: LAB }], createdAt: Date.now(), updatedAt: Date.now() }); await window.hub.kvSet('three-sketches', sk); }
  const refs = (await window.hub.kvGet('three-refs', {})) || {};
  refs[LAB_ID] = [{ id: 'z1', key: 'zap', kind: 'audio', name: `zap.${EXT}`, path: `${DIR}/zap.${EXT}` }];
  await window.hub.kvSet('three-refs', refs);
  await GameMode.play({ kind: 'lab', id: LAB_ID, title: 'Clink sounds' });
  await until(async () => (await ev('window.__gameReady ? window.__gameReady.phase : ""')) === 'playing' && await ev('Boolean(window.__zap)'), 120000);
  await wait(800);
  const z = await ev('window.__zap()');
  const a = JSON.parse(await ev('window.__gameAudio.pub()'));
  out.measure.lab = { zap: z, pre: a.pre, hits: a.hits, misses: a.misses, latencyMs: a.latencyMs };
  step('a Lab scene: its sound reference decoded before the first frame, played at once', a.pre?.done >= 1 && a.hits >= 1 && z && !z.error && z.state === 'running', out.measure.lab);
  await leave();
});

await safe('files', async () => {
  const h = await window.hub.gameReady.hash(ORIG);
  step('the game\'s files unchanged (only ever read)', out.hashBefore && h.every((x, i) => x.hash === out.hashBefore[i].hash), h.map((x) => x.hash?.slice(0, 8)));
});
store.set('gameaudio.off', false);
out.pass = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
