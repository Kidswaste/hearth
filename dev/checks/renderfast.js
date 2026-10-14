// Render fast (round 41, renderfast): Lab exports streamed into ffmpeg while they draw, frames encoded at once
// (OffscreenCanvas.convertToBlob instead of the idle-time toBlob), the preview easing off during a render, All
// formats side by side, a measured time left. Every new path is compared with the reference path (`legacy`: toBlob,
// a folder of frames, ffmpeg after the last one): the files must be the same bytes, and their decoded frames the same
// (ffmpeg framemd5, every frame). Then a timing budget: a simple and a heavy scene, 1080p and 4K MP4, All formats.
//   node dev/smoke.js --check-timeout 1500000 --script dev/checks/renderfast.js
// (The numbers depend on the machine and its load: SwiftShader draws on the CPU here, so the drawing, the encoders and
// the other agents' work share 4 cores. The budget only asks the new path not to be slower in total.)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], timing: {}, eq: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && typeof LabExport !== 'undefined', 30000);
const d = ThreeLab.director;
const X = LabExport;
// a moving scene on a clear background (alpha for ProRes / PNG), seeded randomness (the dots)
const SIMPLE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.AmbientLight('#ffffff', 0.6)); const l = new THREE.DirectionalLight('#ffeedd', 2.5); l.position.set(3, 4, 5); scene.add(l);
const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: '#e05030' })); scene.add(box);
for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#40c0ff' })); m.position.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, 0); scene.add(m); }
function frame() { requestAnimationFrame(frame); const s = performance.now() / 1000; box.rotation.set(s * 1.7, s * 3.9, 0); renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
// heavy: 4,000 instanced physical-material spheres under three point lights, antialiased, every matrix moved each frame
const HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101820');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 14);
scene.add(new THREE.AmbientLight('#ffffff', 0.3));
for (const [c, x] of [['#ff6040', -6], ['#40a0ff', 6], ['#ffffff', 0]]) { const l = new THREE.PointLight(c, 60, 40); l.position.set(x, 4, 6); scene.add(l); }
const N = 4000;
const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.18, 2), new THREE.MeshPhysicalMaterial({ color: '#d0c0a0', roughness: 0.3, metalness: 0.6, clearcoat: 1 }), N);
scene.add(mesh); const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const v = new THREE.Vector3(); const sc = new THREE.Vector3(1, 1, 1);
const seeds = Array.from({ length: N }, () => [Math.random() * 6.28, Math.random() * 6.28, 2 + Math.random() * 5]);
function frame() { requestAnimationFrame(frame); const s = performance.now() / 1000;
  for (let i = 0; i < N; i++) { const [a, b, r] = seeds[i]; v.set(Math.cos(a + s * 0.4) * r, Math.sin(b + s * 0.3) * r * 0.6, Math.sin(a + s * 0.4) * r * 0.5); m.compose(v, q, sc); mesh.setMatrixAt(i, m); }
  mesh.instanceMatrix.needsUpdate = true; mesh.rotation.y = s * 0.2; renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
const made = [];
const hash = async (p) => { const u8 = await window.hub.fs.read(p, { encoding: 'buffer', maxBytes: 2e9 }); const h = await crypto.subtle.digest('SHA-256', u8); return [...new Uint8Array(h)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join(''); };
// every decoded frame's md5 (ffmpeg framemd5), through the app's own ffmpeg runner
let jobsOn = false; const jobs = new Map();
const ff = (args, input, output) => new Promise((resolve, reject) => {
  if (!jobsOn) { jobsOn = true; window.hub.video.onJob((ev) => { const j = jobs.get(ev.id); if (j && ev.type === 'done') { jobs.delete(ev.id); (ev.code === 0 ? j.resolve : j.reject)(ev); } }); }
  const id = `rf${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
  jobs.set(id, { resolve, reject });
  window.hub.video.transcode({ id, input, output, args, duration: 1 }).catch(reject);
});
const md5s = async (p) => {
  const o = `${p}.framemd5.txt`;
  await ff(['-y', '-i', 'INPUT', '-map', '0:v', '-f', 'framemd5', 'OUTPUT'], p, o);
  const t = String(await window.hub.fs.read(o)); made.push(o);
  return t.split('\n').filter((l) => /^\d/.test(l)).map((l) => l.split(',').pop().trim());
};
const run = async (o) => { const t0 = performance.now(); const r = await X.render({ source: 'scene', at: 0, quiet: true, ...o }); made.push(r.path); const last = X.status().speeds.slice(-1)[0] || {}; return { ...r, wall: Math.round(performance.now() - t0), stream: Boolean(last.stream) }; };
// the same render the reference way and the new way: same bytes, same decoded frames
async function same(label, o) {
  const ref = await run({ ...o, legacy: true });
  const fast = await run(o);
  const [ha, hb] = [await hash(ref.path), await hash(fast.path)];
  const [ma, mb] = [await md5s(ref.path), await md5s(fast.path)];
  const diff = ma.findIndex((x, i) => x !== mb[i]);
  out.eq[label] = { bytes: ha === hb, frames: ma.length, firstDiff: diff, stream: fast.stream, wall: [ref.wall, fast.wall] };
  step(`${label}: the new path makes the same file (bytes) and the same ${ma.length} decoded frames as the reference`, ha === hb && ma.length > 0 && ma.length === mb.length && diff === -1 && fast.stream && !ref.stream, out.eq[label]);
  return { ref, fast };
}
const tmpLeft = async (dir) => (await window.hub.fs.list(dir).catch(() => [])).filter((f) => /^\.hearth-titles-xp/.test(f.name)).map((f) => f.name);

await d.newSketch('renderfast simple', SIMPLE, 3);
try { d.setFrame?.('16:9'); } catch { /* old api */ }
await wait(2500);
step('the streaming bridge is there (hub.rfast)', Boolean(window.hub.rfast?.open && window.hub.rfast?.write));

// 1) frame equality, format by format (small sizes: the decode compares every frame)
await safe('eq mp4', async () => { await same('MP4 H.264 640×360, 12 frames', { format: 'mp4', size: '640x360', fps: 30, frames: 12 }); });
await safe('eq prores', async () => { await same('ProRes 4444 + alpha 320×180, 6 frames (PNG frames, alpha)', { format: 'prores', size: '320x180', fps: 25, frames: 6 }); });
await safe('eq hevc', async () => { await same('HEVC 10-bit 320×180, 6 frames', { format: 'hevc', size: '320x180', fps: 24, frames: 6 }); });
await safe('eq gif', async () => { await same('GIF perfect loop 240×135 (cross-fade)', { format: 'gif', size: '240x135', fps: 25, secs: 1.2, fade: 0.2 }); });
await safe('eq loop', async () => { await same('MP4 perfect loop 320×180 (cross-fade)', { format: 'loop', size: '320x180', fps: 30, secs: 1, fade: 0.2 }); });
await safe('eq still', async () => {
  // stills keep their own way, but their PNG is now encoded by convertToBlob: the same bytes as toBlob's
  const a = await run({ format: 'still', size: '640x360', at: 0.4, legacy: true }); const b = await run({ format: 'still', size: '640x360', at: 0.4 });
  const ok = (await hash(a.path)) === (await hash(b.path));
  step('Still · PNG with alpha: convertToBlob gives the same bytes as toBlob', ok);
});
await safe('no temp frames', async () => {
  const dir = (made.find((p) => /\.mp4$/.test(p)) || '').replace(/[\\/][^\\/]+$/, '');
  const left = await tmpLeft(dir);
  step('streamed renders leave no temporary frame folders', left.length === 0, { left });
});

// 2) cancel mid-render: ffmpeg stopped, its unfinished file removed
await safe('cancel', async () => {
  const p = X.render({ format: 'mp4', size: '640x360', fps: 30, frames: 60, at: 0, quiet: true });
  await until(() => (X.status().running?.frames || 0) >= 4, 60000);
  X.cancel();
  let err = null; await p.catch((e) => { err = e.message; });
  const last = X._S.last;
  await wait(800);
  const dir = (made.find((p2) => /\.mp4$/.test(p2)) || '').replace(/[\\/][^\\/]+$/, '');
  const partial = (await window.hub.fs.list(dir).catch(() => [])).filter((f) => /renderfast simple mp4 640x360/.test(f.name) && !made.includes(f.path));
  step('cancel mid-render: "cancelled", the half-made video is removed', /cancel/i.test(err || '') && partial.length === 0, { err, partial: partial.map((f) => f.name), lastWas: last?.path?.split(/[\\/]/).pop() });
});

// 3) the time left: measured early, close to what it really took
await safe('eta', async () => {
  const N = 24; const samples = [];
  const t0 = performance.now();
  const p = X.render({ format: 'mp4', size: '960x540', fps: 30, frames: N, at: 0, quiet: true, onProgress: (pr, label, left) => { if (left != null) samples.push({ t: performance.now(), left, pr }); } });
  const r = await p; made.push(r.path);
  const tEnd = performance.now();
  const early = samples.find((s) => s.pr >= 0.2);
  const real = early ? (tEnd - early.t) / 1000 : null;
  const job = window.Renders?.list?.()?.find?.((j) => j.title?.includes('960×540')) || null;
  out.eta = { early: early?.left, real: real && Math.round(real * 10) / 10, samples: samples.length, total: Math.round((tEnd - t0) / 100) / 10, queueJob: Boolean(job) };
  step('time left is known from the first frames and within ×0.5–×2 of the real time (at 20 %)', early && real && early.left >= real * 0.5 - 1 && early.left <= real * 2 + 1, out.eta);
  // the render queue counts down from the render's own time
  const R = RendersCore;
  const t = Date.now();
  const v = R.eta({ status: 'running', pct: 10, started: t - 4000, etaS: 30, etaAt: t - 5000 }, t);
  step('the render queue uses the render\'s own time left, counting down between reports', v === 25, { v });
});

// 4) the preview eases off (Auto: 30 fps) while an export renders, and comes back
await safe('preview eases', async () => {
  const cap = async () => (await d.evalInSketch('return window.__labPace.state().cap'))?.value;
  const before = await cap();
  const p = X.render({ format: 'mp4', size: '640x360', fps: 30, frames: 20, at: 0, quiet: true });
  await until(() => (X.status().running?.frames || 0) >= 2, 60000);
  const during = await cap();
  const r = await p; made.push(r.path);
  await wait(500);
  const after = await cap();
  out.previewCap = { before, during, after };
  step('Auto preview: 30 fps while the export renders, back after', during === 30 && after === before, out.previewCap);
});

// 5) timing budget: the reference path vs the new path, same scenes, same sizes
const timed = async (label, o) => {
  const ref = await run({ ...o, legacy: true });
  const fast = await run(o);
  out.timing[label] = { ref: ref.wall, fast: fast.wall, gain: Math.round((1 - fast.wall / ref.wall) * 100), refSplit: ref.split, fastSplit: fast.split, same: (await hash(ref.path)) === (await hash(fast.path)) };
};
await safe('timing simple 1080p', () => timed('simple 1080p MP4, 30 frames', { format: 'mp4', size: '1080p', fps: 30, frames: 30 }));
await safe('timing simple 4k', () => timed('simple 4K MP4, 8 frames', { format: 'mp4', size: '4k', fps: 30, frames: 8 }));
await safe('timing prores', () => timed('simple 1080p ProRes 4444, 10 frames', { format: 'prores', size: '1080p', fps: 30, frames: 10 }));
await d.newSketch('renderfast heavy', HEAVY, 3);
await wait(3000);
await safe('timing heavy', () => timed('heavy 1080p MP4, 6 frames', { format: 'mp4', size: '1080p', fps: 30, frames: 6 }));
await d.newSketch('renderfast simple 2', SIMPLE, 3);
await wait(2500);
// All formats: one after another the reference way vs the new way (side by side on 2 lanes): same files
await safe('all formats', async () => {
  if (typeof LabFormats === 'undefined') await Lazy.load('multiformat');
  const F = LabFormats;
  const t0 = performance.now();
  // (the reference: each format's own legacy render, as the batch made it before)
  const refs = [];
  for (const fid of ['16:9', '9:16', '1:1']) { const sz = FormatsCore.sizeOf(fid, 640); const n = FormatsCore.clamp({ z: 1, x: 0, y: 0 }); refs.push(await run({ format: 'mp4', size: sz, frames: 15, fps: 30, reframe: FormatsCore.toPage(n), stem: `rf-ref ${fid.replace(':', 'x')}`, legacy: true })); }
  const tRef = performance.now() - t0;
  const t1 = performance.now();
  const r = await F.exportAll({ formats: ['16:9', '9:16', '1:1'], long: 640, frames: 15, fps: 30, at: 0, quiet: true, parallel: 2, nudges: { '16:9': { z: 1, x: 0, y: 0 }, '9:16': { z: 1, x: 0, y: 0 }, '1:1': { z: 1, x: 0, y: 0 } } });
  const tNew = performance.now() - t1;
  for (const f of r.files) made.push(f.path);
  const hs = await Promise.all(r.files.map((f) => hash(f.path)));
  const hr = await Promise.all(refs.map((x) => hash(x.path)));
  out.timing['All formats 16:9 + 9:16 + 1:1 (long side 640, 15 frames)'] = { ref: Math.round(tRef), fast: Math.round(tNew), gain: Math.round((1 - tNew / tRef) * 100), side: 2 };
  step('All formats side by side (2 lanes): the same 3 files as one after another the reference way, in the order picked', r.files.length === 3 && hs.every((h, i) => h === hr[i]) && r.files.map((f) => f.id).join() === '16:9,9:16,1:1', { files: r.files.map((f) => f.id), same: hs.map((h, i) => h === hr[i]) });
});
{
  const T = Object.values(out.timing).filter((x) => x.ref && x.fast);
  const ref = T.reduce((n, x) => n + x.ref, 0); const fast = T.reduce((n, x) => n + x.fast, 0);
  out.total = { ref, fast, gain: Math.round((1 - fast / ref) * 100) };
  step('timing budget: the new path is faster in total than the reference path', T.length >= 4 && fast < ref, out.total);
  step('every timed pair made the same file both ways', Object.values(out.timing).filter((x) => 'same' in x).every((x) => x.same));
}

// cleanup: the files this check made (never anything else)
for (const p of made) { try { await window.hub.fs.trash?.(p); } catch { /* gone */ } }
out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
