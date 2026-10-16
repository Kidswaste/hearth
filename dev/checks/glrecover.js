// The graphics card going away (round 43, glrecover), on a throwaway copy, simulated the way a GPU reset looks to a
// page: every WebGL context lost (WEBGL_lose_context), then given back, or not.
//  1. lost + restored in the Lab preview while a song plays: the scene runs again in the same page (no new page), the
//     slider moved before is where it was (in the picture and in the Lab), the song keeps playing from its place,
//     the look-around view and the undo history are the same, nothing is written to the Lab's saved files, a picture
//     asked for meanwhile (🎲 / ◧ / the director) waits and isn't blank, the effects picker's thumbnails draw again,
//     and one calm note says so
//  2. lost and never given back: after a few seconds the preview page is made again (the scene, its slider value,
//     the song near its place, no history snapshot, nothing written, no banner)
//  3. lost in the middle of a render (an MP4 streamed into ffmpeg): it picks up at the frame not finished and
//     completes with every frame; and with no restore on the export page: a new page picks up, the render completes
//  4. the GPU process gone (stubbed in main) while drawing falls back to software: one note "Hearth is drawing without
//     the graphics card right now — Restart Hearth to get it back" with a Restart button; a restart the Lab already
//     told isn't told twice
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/glrecover.js --shot /tmp/glrecover.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const SONG = '/tmp/hearth-glrecover-check.wav';
try {
  // ---------- a 20 s song (a click every half second) ----------
  {
    const sr = 22050; const n = 20 * sr; const data = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const t = (i % (sr / 2)) / sr; data.setInt16(44 + i * 2, Math.round(Math.sin(i * 0.3) * Math.exp(-t * 30) * 20000), true); }
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
renderer.setAnimationLoop(() => { scene.background.setScalar(Math.min(1, P.glow * 0.45)); cube.scale.setScalar(P.size); cube.rotation.y = audio.time * 0.8; renderer.render(scene, camera); });`;
  const info = await window.hub.reach.info();
  const KV = `${info.dataDir}/kv`;
  const msgs = [];
  addEventListener('message', (e) => { if (e.data?.source === 'three-sandbox' && /^(gpu-|ready$|stack-drawn$)/.test(e.data.type)) msgs.push({ t: Math.round(performance.now()), type: e.data.type }); });

  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(800);
  const drawn0 = msgs.length;
  ThreeLab.openCode(SKETCH);
  await until(() => c.sliders().some((s) => s.key === 'glow'), 15000);
  await until(() => msgs.slice(drawn0).some((m) => m.type === 'stack-drawn'), 20000);
  const D = ThreeLab.director;
  const ev = async (code) => { for (let i = 0; i < 6; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
  const evJ = async (code) => { const v = await ev(`return JSON.stringify(${code})`); try { return JSON.parse(v); } catch { return null; } };
  await until(async () => (await evJ('__glRecover.state()'))?.contexts >= 1, 15000);
  const sceneId = ThreeLab.scenes.currentId();
  const r = await c.loadSong(SONG);
  step('setup: the song loads', r?.ok, r);
  c.setSlider('glow', 1.3);
  await wait(400);
  // a look-around view (Z: frame the subject)
  const frameEl = () => document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame') || document.querySelector('.three-preview .three-frame');
  frameEl()?.contentWindow.postMessage({ target: 'three-sandbox', type: 'view', cmd: 'frame' }, '*');
  c.seek(2); c.play(true);
  await wait(3000); // (the slider's save and the song's analysis land before the files are looked at)
  const ctl = ThreeAudio.lab.selCtl();
  const undo0 = ctl.undoDepth;
  const hist0 = (ThreeLab.tm?.versions?.(sceneId) || []).length;
  // the Lab's saved files (kv three-*): what they hold before, compared after each recovery (the song's playhead, which
  // the Lab notes every 5 s while it plays, aside)
  const files = async () => { const o = {}; for (const f of await window.hub.fs.list(KV).catch(() => [])) { const name = f.name || f; if (/^three-.*\.json$/.test(name) && !/\.prev\./.test(name)) o[name] = String(await window.hub.fs.read(`${KV}/${name}`).catch(() => '')).replace(/"time":\s*[0-9.e-]+/g, '"time":0'); } return o; };
  const same = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => { let i = 0; while (i < a[k].length && a[k][i] === b[k]?.[i]) i += 1; return `${k} @${i}: ${String(a[k]).slice(Math.max(0, i - 80), i + 60)} → ${String(b[k] || '').slice(Math.max(0, i - 80), i + 60)}`; });
  const bright = async (url) => { if (!url) return -1; const img = new Image(); img.src = url; await img.decode(); const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 765; };
  const thumbs = () => evJ('Object.values(filter.thumbs([{ id: "t1", type: "ascii", P: {} }], 48, 32)).filter((u) => /^data:image/.test(u)).length');
  step('setup: an effect thumbnail draws', (await thumbs()) === 1);

  // ---------- 1. lost, then given back ----------
  const f0 = await files();
  // (round 50) the song's place is compared with the page's own clock (now), read in the same breath as audio.time: the
  // hub's clock around two round trips to a busy page drifted by more than the margin under load
  const before = await evJ('({ s: __glRecover.state(), glow: __slider("glow"), t: audio.time, playing: audio.playing, now: performance.now() })');
  const reloads0 = ThreeLab.live.counts().reloads?.preview || 0;
  const notes0 = GLRecover.state().notes.length;
  const m0 = msgs.length; const tLose = performance.now();
  const lostN = await ev('__glRecover.lose({ restore: 600 })');
  await until(() => msgs.slice(m0).some((m) => m.type === 'gpu-lost'), 4000);
  const shotP = D.shotSmall(200); // (asked while it's away: 🎲 variations, ◧ before / after and the director ask this way)
  // (round 50) the GPU wait (glrecover.wait) plus the rebuild's own time once it is back (tools/three.js GL_REBUILD_MS):
  // on a loaded machine the rebuild alone took seconds
  const back = await until(() => msgs.slice(m0).some((m) => m.type === 'gpu-restored'), 30000);
  const ms = back ? msgs.slice(m0).find((m) => m.type === 'gpu-restored').t - Math.round(tLose) : null;
  const after = await evJ('({ s: __glRecover.state(), glow: __slider("glow"), t: audio.time, playing: audio.playing, now: performance.now() })');
  const dt = after?.now && before?.now ? (after.now - before.now) / 1000 : (performance.now() - tLose) / 1000;
  step('1. a GPU reset in the preview: every live context lost, then the scene runs again in the same page', lostN >= 1 && back && after?.s?.rebuilds >= 1 && after.s.last?.layers >= 1 && (ThreeLab.live.counts().reloads?.preview || 0) === reloads0, { lostN, ms, state: after?.s, gl: ThreeLab.gl.state().log.slice(-2) });
  step('1. the slider keeps its value (in the picture and in the Lab)', before?.glow === 1.3 && after?.glow === 1.3 && c.sliders().find((s) => s.key === 'glow')?.value === 1.3, { before: before?.glow, after: after?.glow });
  step('1. the song keeps playing from its place', before?.playing && after?.playing && after.t > before.t && Math.abs(after.t - (before.t + dt)) < 1.2, { before: before?.t, after: after?.t, dt: +dt.toFixed(2) });
  step('1. the look-around view and the undo history are as they were', JSON.stringify(after?.s?.views) === JSON.stringify(before?.s?.views) && Object.keys(before?.s?.views || {}).length >= 1 && ctl.undoDepth === undo0 && ThreeLab.scenes.currentId() === sceneId, { views: after?.s?.views, undo: [undo0, ctl.undoDepth] });
  const url = await shotP;
  const lum = await bright(url);
  step('1. a picture asked for while it was away waits, then shows the scene (not blank)', lum > 0.3, { lum: +lum.toFixed(3) });
  step('1. the effects picker\'s thumbnails draw again', (await thumbs()) === 1);
  await wait(1500);
  const f1 = await files();
  step('1. nothing written to the Lab\'s saved files during the recovery', same(f0, f1).length === 0 && (ThreeLab.tm?.versions?.(sceneId) || []).length === hist0, { changed: same(f0, f1) });
  await until(() => GLRecover.state().notes.slice(notes0).some((n) => n.kind === 'restarted' && n.showed), 15000);
  const note1 = GLRecover.state().notes.slice(notes0).find((n) => n.kind === 'restarted');
  const toastEl = [...document.querySelectorAll('#toasts > *')].find((t) => /graphics card restarted/.test(t.textContent));
  step('1. one calm note: "The graphics card restarted — the Lab picked up where it was"', note1?.text === 'The graphics card restarted — the Lab picked up where it was' && Boolean(toastEl), note1);
  step('1. no banner over the preview', document.querySelector('.three-stall')?.hidden !== false);
  await smoke({ shot: '/tmp/glrecover-restored.png' }).catch(() => {});

  // ---------- 2. lost, never given back: the page is made again ----------
  const f2 = await files();
  const b2 = await evJ('({ t: audio.time, playing: audio.playing, glow: __slider("glow") })');
  const m2 = msgs.length; const t2 = performance.now();
  await ev('__glRecover.lose({ restore: null })');
  const remade = await until(() => ThreeLab.gl.state().log.some((x) => x.state === 'restored' && x.how === 'new page' && x.at > Date.now() - (performance.now() - t2)), 45000); // (round 50: the 4 s GPU wait + a page start, which sandboxFrame itself allows 10 s per try)
  const msR = Math.round(performance.now() - t2);
  await until(async () => (await evJ('__glRecover.state()'))?.contexts >= 1, 10000);
  await wait(800);
  const a2 = await evJ('({ s: __glRecover.state(), t: audio.time, playing: audio.playing, glow: __slider("glow") })');
  const dt2 = (performance.now() - t2) / 1000;
  step('2. no restore: after a few seconds the preview page is made again, with the scene', remade && (ThreeLab.live.counts().reloads?.preview || 0) === reloads0 + 1 && a2?.s?.epoch === 0 && ThreeLab.scenes.currentId() === sceneId, { ms: msR, msgs: msgs.slice(m2).map((m) => m.type), reloads: ThreeLab.live.counts().reloads });
  // (the song plays on in the old page while it waits for the GPU; the new page picks it up where it was when the old
  // page went: a moment of the song is lost while the page loads, never a jump back to the start)
  const wait2 = (Number(store.get('glrecover.wait', 4000)) || 4000) / 1000;
  step('2. the slider and the song are back (where the song was when the page was made again, playing)', a2?.glow === 1.3 && a2?.playing && a2.t >= b2.t + wait2 - 1 && a2.t <= b2.t + dt2 + 0.3, { before: b2, after: a2 && { t: a2.t, glow: a2.glow, playing: a2.playing }, dt: +dt2.toFixed(2), gap: +(b2.t + dt2 - a2.t).toFixed(2) });
  await wait(1500);
  const f3 = await files();
  step('2. nothing written and no history snapshot; the undo history is the same; no banner', same(f2, f3).length === 0 && (ThreeLab.tm?.versions?.(sceneId) || []).length === hist0 && ctl.undoDepth === undo0 && document.querySelector('.three-stall')?.hidden !== false, { changed: same(f2, f3), undo: [undo0, ctl.undoDepth] });

  // ---------- 3. lost in the middle of a render ----------
  c.play(false);
  const X = LabExport;
  const xpFrame = () => document.querySelector('.lab-xp-host iframe');
  const midRender = async (restore) => {
    const p = X.render({ format: 'mp4', size: '320x180', fps: 30, frames: 36, at: 0, quiet: true });
    let hit = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 60000) {
      const run = [...X._S.runs][0];
      if (run && run.frames >= 6 && xpFrame()) { xpFrame().contentWindow.postMessage({ target: 'three-sandbox', type: 'gl-sim', restore }, '*'); hit = true; break; }
      await wait(30);
    }
    let res = null; let err = null;
    try { res = await p; } catch (e) { err = e.message; }
    const st = res?.path ? await window.hub.fs.stat(res.path) : null;
    return { hit, res, err, size: st?.size || 0 };
  };
  const r3 = await midRender(400);
  step('3. a GPU reset mid-render (streamed MP4): it picks up where it was and completes with every frame', r3.hit && r3.res?.frames === 36 && r3.size > 1000 && r3.res?.gpu?.lost >= 1 && !r3.res.gpu.restarted, { err: r3.err, frames: r3.res?.frames, gpu: r3.res?.gpu, size: r3.size, stream: X.status?.().speeds?.slice(-1)[0]?.stream });
  if (r3.res?.path) {
    const probe = await window.hub.video?.probe?.(r3.res.path).catch(() => null);
    if (probe) step('3. the video has all its frames', !probe.frames || Math.abs(probe.frames - 36) <= 1, { frames: probe.frames, duration: probe.duration });
  }
  const r4 = await midRender(null);
  step('3. no restore on the export page: a new page picks up, the render completes', r4.hit && r4.res?.frames === 36 && r4.size > 1000 && r4.res?.gpu?.newPage >= 1, { err: r4.err, gpu: r4.res?.gpu, size: r4.size });
  for (const x of [r3, r4]) if (x.res?.path) await window.hub.fs.trash([x.res.path]).catch(() => {});

  // ---------- 4. the GPU process gone in main, drawing falls back to software ----------
  const n4 = GLRecover.state().notes.length;
  await window.hub.glr.sim({ status: { gpu_compositing: 'enabled', webgl: 'enabled' }, info: true, delays: { crash: 300, late: 800, info: 50 } });
  await wait(400);
  await window.hub.glr.sim({ gone: 'crashed' }); // still on the GPU: "restarted" (told by the Lab a moment ago: not twice)
  await wait(1500);
  const restartedTwice = GLRecover.state().notes.slice(n4).some((n) => n.kind === 'restarted');
  await window.hub.glr.sim({ status: { gpu_compositing: 'disabled_software', webgl: 'unavailable_software' }, gone: 'crashed' });
  await until(() => GLRecover.state().notes.slice(n4).some((n) => n.kind === 'software' && n.showed), 30000);
  const soft = GLRecover.state().notes.slice(n4).find((n) => n.kind === 'software');
  await wait(300);
  const softToast = [...document.querySelectorAll('#toasts > *')].find((t) => /drawing without the graphics card/.test(t.textContent));
  const restartBtn = softToast && [...softToast.querySelectorAll('button')].find((b) => /^Restart$/.test(b.textContent.trim()));
  step('4. the GPU process gone + software drawing: one note with a Restart button', soft?.text === 'Hearth is drawing without the graphics card right now — Restart Hearth to get it back' && Boolean(restartBtn), { soft, buttons: softToast ? [...softToast.querySelectorAll('button')].map((b) => b.textContent) : null });
  step('4. a restart the Lab already told isn\'t told twice', !restartedTwice, GLRecover.state().notes.slice(n4));
  const st4 = await window.hub.glr.state();
  step('4. main knows: software now, crashes counted', st4.kind === 'software' && st4.crashes >= 2, { kind: st4.kind, crashes: st4.crashes });
  const say = await Commands.tryRun('/graphics', H.claudeAgent().id, null, { say: (t) => { out.graphics = String(t); }, note: (t) => { out.graphics = String(t); } });
  await wait(300);
  step('/graphics says what Hearth draws with', /software/.test(out.graphics || '') && /restarted/.test(out.graphics || ''), out.graphics || say);
  await smoke({ shot: '/tmp/glrecover-software.png' }).catch(() => {});
  await window.hub.glr.sim({ status: null });
} catch (err) { step('the check ran to the end', false, String(err?.stack || err)); }
const fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
if (localStorage.getItem('glrShort') === '1') return `[GLRECOVER]${JSON.stringify(out.steps.map((s) => (s.ok ? `ok ${s.name}` : { FAIL: s.name, info: s.info })), null, 1)}${fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nPASS'}`;
return `[GLRECOVER]${JSON.stringify(out, null, 1)}${fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nPASS'}`;
