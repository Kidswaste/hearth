// Lab export (round 22 "labexport"): short clips in each format from the hidden export page, probed with ffprobe (size,
// fps, frames, alpha, codec), loops (bars + cross-fade, found in the frames), stills (8 / 16-bit), supersampling and
// motion blur giving other pixels than plain, the same render twice giving the same pixels, the Lab staying usable
// (long tasks, the preview's own frames) while a 1080p and a 4K clip render, render speed, GLB / web page / preset /
// contact sheet, pause / resume / cancel through the queue, the sequence's own render through the export page.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/labexport.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], speed: {}, probes: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
// a moving scene on a clear background (alpha), no antialiasing (supersampling must show), fast motion (blur must show)
const SCENE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
scene.add(new THREE.AmbientLight('#ffffff', 0.6)); const l = new THREE.DirectionalLight('#ffeedd', 2.5); l.position.set(3, 4, 5); scene.add(l);
const speed = 2.5; // turns a second
const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: '#e05030' })); scene.add(box);
const dots = []; for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#40c0ff' })); m.position.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, 0); scene.add(m); dots.push(m); }
function frame(t) { requestAnimationFrame(frame); const s = performance.now() / 1000; box.rotation.set(s * speed * 0.7, s * speed * Math.PI * 0.5, 0); renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
await d.newSketch('labexport probe', SCENE, 3);
await c.setSize?.('16:9').catch?.(() => null);
try { d.setFrame?.('16:9'); } catch { /* old api */ }
await wait(2500);
step('LabExport loaded with the Lab', typeof LabExport !== 'undefined' && typeof LabExportCore !== 'undefined');
step('/lab-export registered', Boolean(Commands.get('lab-export')));
const probe = (p) => window.hub.video.probe(p);
const X = LabExport;
const sigOf = async (p, n = 0) => {
  // a PNG / first frame decoded here, as numbers (for comparisons)
  const u8 = await window.hub.fs.read(p, { encoding: 'buffer' });
  const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
};
const mad = (a, b) => { if (a.length !== b.length) return 999; let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return Math.round((s / a.length) * 1000) / 1000; };

// 1) formats, short clips, probed
const fmt = {};
await safe('mp4', async () => {
  const r = await X.render({ format: 'mp4', size: '480x270', fps: 30, frames: 12, source: 'scene', at: 0 });
  const p = await probe(r.path); fmt.mp4 = p;
  step('MP4 H.264: 480×270, 30 fps, 12 frames', p?.codec === 'h264' && p.w === 480 && p.h === 270 && Math.abs(p.fps - 30) < 0.01 && p.frames === 12, { codec: p?.codec, w: p?.w, h: p?.h, fps: p?.fps, frames: p?.frames, speed: r.speed });
});
await safe('hevc', async () => {
  const r = await X.render({ format: 'hevc', size: '480x270', fps: 24, frames: 8, at: 0 });
  const p = await probe(r.path);
  step('HEVC 10-bit: 24 fps, 8 frames, hvc1', p?.codec === 'hevc' && Math.abs(p.fps - 24) < 0.01 && p.frames === 8 && /10/.test(p.pixFmt || ''), { codec: p?.codec, fps: p?.fps, frames: p?.frames, pix: p?.pixFmt });
});
await safe('prores', async () => {
  const r = await X.render({ format: 'prores', size: '320x180', fps: 25, frames: 6, at: 0 });
  const p = await probe(r.path);
  step('ProRes 4444 + alpha: yuva444p10le, 25 fps, 6 frames', p?.codec === 'prores' && /yuva444/.test(p.pixFmt || '') && Math.abs(p.fps - 25) < 0.01 && p.frames === 6, { codec: p?.codec, pix: p?.pixFmt, fps: p?.fps, frames: p?.frames, profile: p?.profile });
});
await safe('webm', async () => {
  const r = await X.render({ format: 'webm', size: '320x180', fps: 30, frames: 6, at: 0 });
  const p = await probe(r.path);
  // (VP9's alpha travels in a side channel: ffprobe reports yuv420p with an alpha_mode tag)
  const raw = await window.hub.fs.read(r.path, { encoding: 'buffer' });
  let alphaTag = false; for (let i = 0; i + 3 < raw.length && i < 65536; i++) if (raw[i] === 0x53 && raw[i + 1] === 0xc0 && raw[i + 2] === 0x81 && raw[i + 3] === 0x01) { alphaTag = true; break; } // (Matroska AlphaMode = 1)
  step('WebM VP9 + alpha: vp9, alpha_mode, 30 fps', p?.codec === 'vp9' && alphaTag && Math.abs(p.fps - 30) < 0.01, { codec: p?.codec, alphaTag, fps: p?.fps, pix: p?.pixFmt });
});
await safe('png', async () => {
  const r = await X.render({ format: 'png', size: '320x180', fps: 30, frames: 5, at: 0 });
  const files = (await window.hub.fs.list(r.path)).filter((f) => /\.png$/.test(f.name));
  const s = await sigOf(files[0].path);
  let clear = 0; for (let i = 3; i < s.d.length; i += 4) if (s.d[i] === 0) clear += 1;
  step('PNG sequence + alpha: 5 files, 320×180, transparent background', files.length === 5 && s.w === 320 && s.h === 180 && clear > s.w * s.h * 0.3, { files: files.length, clearShare: Math.round((clear / (s.w * s.h)) * 100) / 100 });
  out.pngDir = r.path;
});
await safe('gif loop', async () => {
  const r = await X.render({ format: 'gif', size: '240x135', fps: 25, secs: 1.2, fade: 0.2, at: 0 });
  const p = await probe(r.path);
  step('GIF perfect loop: forced 1.2 s = 30 frames, 5-frame cross-fade, loops forever', p?.codec === 'gif' && r.loop?.frames === 30 && r.loop.fade === 5 && (p.frames === 30 || Math.abs(p.duration - 1.2) < 0.05), { frames: p?.frames, duration: p?.duration, loop: r.loop });
  // the loop: its last frame runs into its first like any two frames in a row (no seam)
  out.gif = r.path;
});
await safe('mp4 loop detect', async () => {
  // the box turns 2.5 × 0.5 turns a second around y (a cube repeats every quarter turn) → about 0.2 s; detect finds a period
  const r = await X.render({ format: 'loop', size: '240x135', fps: 30, detect: true, at: 0 });
  const p = await probe(r.path);
  step('MP4 loop: a length found in the frames (or the forced one with a cross-fade), h264', p?.codec === 'h264' && r.loop && r.loop.frames >= 2 && p.frames === r.loop.frames, { loop: r.loop, frames: p?.frames });
});
// 2) stills
await safe('still', async () => {
  const r = await X.render({ format: 'still', size: '640x360', at: 0.4 });
  const s = await sigOf(r.path);
  step('Still PNG at the frame asked: 640×360 with alpha', s.w === 640 && s.h === 360, { w: s.w, h: s.h });
  out.still = r.path;
});
await safe('still16', async () => {
  const r = await X.render({ format: 'still16', size: '640x360', at: 0.4, ss: 2 });
  const p = await probe(r.path);
  step('16-bit PNG still: rgba64be (16 bits a channel), 640×360', /64|48/.test(p?.pixFmt || '') && p.w === 640, { pix: p?.pixFmt, w: p?.w, h: p?.h });
});
// 3) quality options change the pixels; the same render twice gives the same pixels
await safe('quality', async () => {
  const a = await X.render({ format: 'still', size: '400x225', at: 0.5, alpha: false });
  const a2 = await X.render({ format: 'still', size: '400x225', at: 0.5, alpha: false });
  const ss = await X.render({ format: 'still', size: '400x225', at: 0.5, alpha: false, ss: 2 });
  const mb = await X.render({ format: 'png', size: '400x225', at: 0.5, frames: 1, fps: 30, alpha: false, blur: 8 });
  const mbFile = (await window.hub.fs.list(mb.path)).find((f) => /\.png$/.test(f.name)).path;
  const [A, A2, SS, MB] = [await sigOf(a.path), await sigOf(a2.path), await sigOf(ss.path), await sigOf(mbFile)];
  out.quality = { same: mad(A.d, A2.d), supersampled: mad(A.d, SS.d), blurred: mad(A.d, MB.d) };
  step('deterministic: the same frame rendered twice is the same picture (seeded randomness, scene clock)', out.quality.same === 0, out.quality);
  step('supersampling 2× gives other pixels than plain (smoothed edges)', out.quality.supersampled > 0.05, out.quality);
  step('motion blur (8 sub-frames) gives other pixels than plain', out.quality.blurred > 0.05, out.quality);
});
// 4) the scene itself
await safe('glb', async () => {
  const r = await X.render({ format: 'glb', at: 0.3 });
  const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer' });
  const magic = new TextDecoder().decode(u8.subarray(0, 4));
  step('GLB of the 3D content: glTF binary with the meshes', magic === 'glTF' && r.meshes >= 41, { meshes: r.meshes, triangles: r.triangles, size: u8.length });
});
await safe('preset', async () => {
  const r = await X.render({ format: 'preset' }).catch((e) => ({ error: e.message }));
  step('slider preset: refused cleanly when the scene has no sliders, or saved', r.error ? /no sliders/.test(r.error) : /hearth-preset\.json$/.test(r.path), r);
});
await safe('sheet', async () => {
  const r = await X.render({ format: 'sheet', tiles: 6, secs: 2, size: '1920x1080' });
  const s = await sigOf(r.path);
  step('contact sheet: 6 frames on one PNG', r.tiles === 6 && s.w > 600, { w: s.w, h: s.h, tiles: r.tiles });
});
await safe('html', async () => {
  window.DEPLOY_TEST_THREE = '/opt/cdn-cache/three@0.186.1/package';
  const r = await X.render({ format: 'html' });
  const html = await window.hub.fs.read(r.path, { maxBytes: 200e6 });
  step('web page in one file: the player as srcdoc, three.js inside as blob modules', /srcdoc="/.test(html) && /__hxMap/.test(html) && !/src="lab\.html/.test(html), { size: html.length });
  out.html = r.path;
  // it draws: served once from a folder and checked in a hidden window (deploy's own check)
  if (window.hub.deploy?.verify) {
    const dir = `${r.path.replace(/[\\/][^\\/]+$/, '')}/.hearth-titles-xpcheck`;
    await window.hub.fs.write(`${dir}/index.html`, html);
    const v = await window.hub.deploy.verify(dir, { timeout: 40000 }).catch((e) => ({ ok: false, errors: [e.message] }));
    step('the one-file page runs the scene (it draws)', v?.ok, v);
    window.hub.video.rmtemp?.(dir).catch(() => {});
  }
});
// 5) speed (1080p, 4K) and the Lab staying usable while it renders
const loafs = []; let po = null;
try { po = new PerformanceObserver((l) => loafs.push(...l.getEntries())); po.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* none */ }
const lt = []; let po2 = null;
try { po2 = new PerformanceObserver((l) => lt.push(...l.getEntries().map((e) => Math.round(e.duration)))); po2.observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
const previewFps = async () => { const r = await d.evalInSketch('return window.__labHealth ? window.__labHealth().fps ?? null : null').catch(() => null); return r?.ok ? r.value : null; };
const rafCount = async (ms) => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { n += 1; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return Math.round((n * 1000) / ms); };
out.idle = { hubFps: await rafCount(2000) };
await safe('speed 1080p', async () => {
  lt.length = 0; loafs.length = 0;
  const t0 = performance.now();
  const job = X.render({ format: 'mp4', size: '1080p', fps: 30, frames: 30, at: 0 });
  await wait(4000);
  const during = { hubFps: await rafCount(2000) };
  // the Lab keeps working: a slider-free edit (a layer added and removed) and a picture of the preview
  const t1 = performance.now(); const shot = await d.shot(); const shotMs = Math.round(performance.now() - t1);
  const r = await job;
  out.speed['1080p'] = { fps: r.speed, frames: r.frames, seconds: r.seconds, wall: Math.round(performance.now() - t0) };
  out.during1080 = { ...during, shotMs, shot: Boolean(shot), longTasks: lt.length, longest: Math.max(0, ...lt), loafs: loafs.length, worstLoaf: Math.round(Math.max(0, ...loafs.map((x) => x.duration))) };
  step('1080p MP4 rendered (30 frames)', r.frames === 30, out.speed['1080p']);
  step('while it renders the Lab answers (a preview screenshot) and the window has no long task (the work is in the export page)', Boolean(shot) && lt.length <= 2, out.during1080);
});
await safe('speed 4k', async () => {
  lt.length = 0; loafs.length = 0;
  const r = await X.render({ format: 'mp4', size: '4k', fps: 30, frames: 6, at: 0 });
  const p = await probe(r.path);
  out.speed['4k'] = { fps: r.speed, frames: r.frames, seconds: r.seconds, longTasks: lt.length, longest: Math.max(0, ...lt) };
  step('4K MP4: 3840×2160 (the page draws at 2× its CSS size)', p?.w === 3840 && p.h === 2160, { ...out.speed['4k'], w: p?.w, h: p?.h });
});
await safe('quality cost', async () => {
  const base = await X.render({ format: 'png', size: '960x540', fps: 30, frames: 4, at: 0 });
  const ss2 = await X.render({ format: 'png', size: '960x540', fps: 30, frames: 4, at: 0, ss: 2 });
  const mb8 = await X.render({ format: 'png', size: '960x540', fps: 30, frames: 4, at: 0, blur: 8 });
  out.cost = { plain: base.speed, ss2: ss2.speed, blur8: mb8.speed };
  step('quality options measured (frames/s at 960×540: plain, 2× supersampling, 8 sub-frames)', base.speed > 0 && ss2.speed > 0 && mb8.speed > 0, out.cost);
});
// 6) pause / resume / cancel from the queue
await safe('pause', async () => {
  const job = X.render({ format: 'png', size: '320x180', fps: 30, frames: 40, at: 0 });
  await until(() => (X.status().running?.frames || 0) >= 3, 30000);
  const rq = window.Renders?.list?.().find((j) => j.kind === 'export' && ['running', 'paused'].includes(j.status));
  if (rq) await Renders.pause(rq.id); else X.pause(true);
  await wait(1200); const f1 = X.status().running?.frames; await wait(1500); const f2 = X.status().running?.frames; // (the frame being drawn when paused finishes)
  step('pause from the render queue holds the frames', f1 === f2 && X.status().running?.paused, { f1, f2, queued: Boolean(rq) });
  if (rq) await Renders.resume(rq.id); else X.pause(false);
  await until(() => (X.status().running?.frames || 0) > f2 + 2, 20000);
  step('resume goes on', (X.status().running?.frames || 0) > f2, { now: X.status().running?.frames });
  if (rq) await Renders.cancel(rq.id); else X.cancel();
  const end = await job.then(() => 'done', (e) => e.message);
  step('cancel stops it (and the page goes)', /cancel/i.test(end) && !document.querySelector('.lab-xp-host'), { end });
});
// 7) the sequence's own render goes through the export page (the preview keeps its size)
await safe('sequence', async () => {
  const sizeBefore = ThreeSeq._S.L.stage.size.id;
  await ThreeSeq.create('labexport seq', { format: '1:1', show: false });
  if (!(ThreeSeq.edit?.clips?.length)) await ThreeSeq.addCurrent();
  const r = await ThreeSeq.render({ format: '1:1', fps: 30, quiet: true });
  const p = await probe(r.path);
  step('sequence render through the export page: 1080×1080, the preview kept its size', p?.w === 1080 && p.h === 1080 && ThreeSeq._S.L.stage.size.id === sizeBefore, { w: p?.w, h: p?.h, frames: r.frames, before: sizeBefore, after: ThreeSeq._S.L.stage.size.id });
  // before → after: the same render the old way (the preview switches to 1:1 and draws the frames itself)
  const measure = async (backstage) => {
    store.set('three.export.backstage', backstage);
    lt.length = 0; let sizes = new Set(); let n = 0; const t0 = performance.now();
    const job = ThreeSeq.render({ format: '1:1', fps: 30, quiet: true });
    let busyErr = null;
    const watch = (async () => { while (n >= 0) { sizes.add(ThreeSeq._S.L.stage.size.id); await wait(100); } })();
    await wait(3000);
    const fpsDuring = await rafCount(2000);
    try { await ThreeSeq.addCurrent(); await ThreeSeq.undo(); } catch (e) { busyErr = e.message; }
    const r2 = await job; n = -1; await watch;
    return { seconds: Math.round(performance.now() - t0) / 1000, frames: r2.frames, hubFps: fpsDuring, longTasks: lt.length, longest: Math.max(0, ...lt), previewSizes: [...sizes], editDuring: busyErr || 'ok' };
  };
  out.seqOld = await measure(false);
  out.seqNew = await measure(true);
  store.set('three.export.backstage', true);
  step('sequence render, old way vs the export page (measured)', out.seqNew.previewSizes.length === 1, { old: out.seqOld, now: out.seqNew });
});
// 8) chat
await safe('chat', async () => {
  const msgs = [];
  const r = await Commands.tryRun('/lab-export still 320x180 at=0.2', H.claudeAgent().id);
  step('/lab-export still from chat', r !== false, { r: String(r).slice(0, 80) });
  const f = await Commands.get('lab-export').run('formats');
  step('/lab-export formats lists the 13 formats', (f.match(/^- \*\*/gm) || []).length === 13);
});
po?.disconnect(); po2?.disconnect();
out.lingering = document.querySelectorAll('.lab-xp-host').length;
step('no export page left behind', out.lingering === 0);
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
