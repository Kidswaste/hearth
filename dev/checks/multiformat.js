// ▦ All formats (round 33, multiformat): the Lab scene exported to several shapes in one go, each reframed.
// A 3D scene with its subject (a red box) on the right of a 16:9 frame: in 9:16 the scene's own framing loses it, the
// automatic reframe keeps it. Checks the ways in (⇪ Export, ✦ More › ⇪ Make, the toolbar's ⋯, 📮 Ready to post), the
// files loading on first use, the picker (defaults: the Lab's shape + 9:16, remembered), the four previews (one
// zoomed-out picture each, the subject measured, the 9:16 frame moved to keep it), the nudge (drag = pan, wheel and
// − / + = zoom, ↺ = back to auto, remembered per scene), the sandbox's reframe on real export frames (stills with and
// without it), a real export of 2 formats (small, short: right sizes, one folder, one progress line), and cleanup.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/multiformat.js --shot /tmp/multiformat.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err?.message || err).slice(0, 400) }); } };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd({ show: true });
const d = ThreeLab.director;
await until(() => typeof LabEasy !== 'undefined' && typeof LabExport !== 'undefined', 20000);
const SCENE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101418');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6);
const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: '#ff2a1a' })); box.position.set(2.4, 0, 0); scene.add(box);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
function frame() { requestAnimationFrame(frame); box.rotation.y = performance.now() / 1000; renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
await d.newSketch('formats probe', SCENE, 3);
try { await c.size?.('16:9'); } catch { /* old api */ }
await wait(2500);
store.set('three.formats.picks', null); store.set('three.formats.nudge', {});
const hosts0 = document.querySelectorAll('.lab-xp-host').length;
// red pixels in a picture (a blob / url), or in a crop of it (fractions)
const redIn = async (src, crop = null) => {
  const bmp = await createImageBitmap(src);
  const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
  const cr = crop || { left: 0, top: 0, width: 1, height: 1 };
  const x0 = Math.max(0, Math.floor(cr.left * bmp.width)); const y0 = Math.max(0, Math.floor(cr.top * bmp.height));
  const w = Math.min(bmp.width - x0, Math.ceil(cr.width * bmp.width)); const h = Math.min(bmp.height - y0, Math.ceil(cr.height * bmp.height));
  const px = g.getImageData(x0, y0, w, h).data; let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 160 && px[i + 1] < 90 && px[i + 2] < 90) n += 1;
  return n;
};

// ---------- ways in ----------
const lazyBefore = typeof LabFormats === 'undefined';
const make = LabEasy.previewGroups().find((x) => /Make/.test(x.label)).items();
step('✦ More › ⇪ Make has ▦ All formats first; the toolbar\'s ⋯ and ⇪ Export have it; the Lab audit finds it',
  /All formats/.test(make[0]?.label) && LabEasy.toolbarItems().some((r) => /All formats/.test(r[0])) && LabExport.previewItem().items().some((x) => /All formats/.test(x?.label || '')) && LabEasy.placed().has('all-formats'),
  make.slice(0, 2).map((x) => x.label));
step('/all-formats is known before its files load (lazy manifest)', Boolean(Commands.get('all-formats')));

// ---------- the picker + previews ----------
let t0 = performance.now();
make[0].action();
await until(() => typeof LabFormats !== 'undefined' && LabFormats._S.st && !LabFormats._S.st.busy, 120000);
const msOpen = Math.round(performance.now() - t0);
const F = typeof LabFormats !== 'undefined' ? LabFormats : null;
const st = F?._S.st;
step('its files load on first use (lazy group "multiformat")', lazyBefore && typeof FormatsCore !== 'undefined' && Boolean(F));
if (!st) { step('the picker opens', false, { toasts: [...document.querySelectorAll('.toast')].map((x) => x.textContent) }); return JSON.stringify(out, null, 1); }
const dlg = document.querySelector('dialog.lf-panel');
const boxes = [...dlg.querySelectorAll('.lf-card input[type=checkbox]')];
step('the picker: 4 shapes with checkboxes, the Lab\'s 16:9 + 9:16 picked the first time', boxes.length === 4 && [...st.picks].join() === '16:9,9:16' && boxes.filter((b) => b.checked).length === 2, { picks: [...st.picks], msOpen });
boxes[2].click(); // 1:1 on
step('a pick is remembered', JSON.stringify(store.get('three.formats.picks')) === '["16:9","9:16","1:1"]' && /Export 3 formats/.test(dlg.querySelector('.lf-go').textContent), store.get('three.formats.picks'));
boxes[2].click(); // and off again
const prev = st.prev;
step('four previews, each one zoomed-out picture of its own shape', ['16:9', '9:16', '1:1', '4:5'].every((id) => prev[id]?.url && Math.abs(prev[id].w / prev[id].h - FormatsCore.get(id).w / FormatsCore.get(id).h) < 0.02),
  Object.fromEntries(Object.entries(prev).map(([k, p]) => [k, p.error || `${p.w}x${p.h} box ${JSON.stringify(p.box)}`])));
step('no export page left open after the previews', document.querySelectorAll('.lab-xp-host').length === hosts0);
await safe('reframe previews', async () => {
  const plain = FormatsCore.view({ z: 1, x: 0, y: 0 });
  const r169 = await redIn(prev['16:9'].blob, plain);
  const r916plain = await redIn(prev['9:16'].blob, plain);
  const a = st.auto['9:16'];
  const r916auto = await redIn(prev['9:16'].blob, FormatsCore.view(a));
  step('16:9 keeps the scene\'s own framing (the subject is in it)', FormatsCore.isPlain(st.auto['16:9']) && r169 > 20, { auto: st.auto['16:9'], red: r169 });
  step('9:16: the scene\'s own framing loses the subject; the automatic reframe brings it back in', r916plain < 3 && r916auto > 20 && a.x > 0, { auto: a, plainRed: r916plain, autoRed: r916auto });
  const img = st.cards['9:16'].img;
  step('the 9:16 card shows that reframe (its picture placed by the crop)', img.getAttribute('src') === prev['9:16'].url && parseFloat(img.style.left) < -50 && /auto/.test(st.cards['9:16'].note.textContent), { left: img.style.left, note: st.cards['9:16'].note.textContent });
});
await safe('screenshot', async () => { await wait(300); await smoke({ shot: '/tmp/multiformat-picker.png' }); });

// ---------- the nudge ----------
await safe('nudge', async () => {
  const k = st.cards['16:9'];
  const r = k.frame.getBoundingClientRect();
  const left0 = k.img.style.left;
  const ev = (type, x, y) => k.frame.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: y, button: 0, buttons: 1 }));
  ev('pointerdown', r.left + r.width / 2, r.top + r.height / 2);
  ev('pointermove', r.left + r.width * 0.75, r.top + r.height / 2);
  ev('pointerup', r.left + r.width * 0.75, r.top + r.height / 2);
  const n1 = st.nudge['16:9'];
  step('drag pans the framing (the picture follows, nothing is drawn again)', n1 && Math.abs(n1.x + 0.5) < 0.02 && k.img.style.left !== left0, { n1, left0, left: k.img.style.left });
  k.frame.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 200, clientX: r.left + 5, clientY: r.top + 5 }));
  const n2 = st.nudge['16:9'];
  const minus = [...k.c.querySelectorAll('.lf-b')].find((b) => b.textContent === '−');
  minus.click();
  const n3 = st.nudge['16:9'];
  step('wheel and − zoom out (more around the subject), kept in the zoomed-out picture', n2.z < 1 && n3.z < n2.z && n3.z >= FormatsCore.Z_MIN && /yours/.test(k.note.textContent), { n2, n3 });
  const saved = store.get('three.formats.nudge', {});
  step('the nudge is remembered for this scene', Object.values(saved).some((m) => m['16:9'] && Math.abs(m['16:9'].z - n3.z) < 1e-3), saved);
  [...k.c.querySelectorAll('.lf-b')].find((b) => b.textContent === '↺').click();
  step('↺ goes back to the automatic framing', !st.nudge['16:9'] && /as it is|auto/.test(k.note.textContent), k.note.textContent);
});
const auto916 = { ...st.auto['9:16'] };

// ---------- the sandbox's reframe on real export frames ----------
await safe('reframe in exports', async () => {
  const stillOf = async (reframe) => { const r = await LabExport.render({ format: 'still', size: { w: 90, h: 160 }, source: 'scene', at: 0, quiet: true, track: false, reframe }); const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer' }); window.hub.fs.trash?.([r.path]).catch(() => {}); return new Blob([u8], { type: 'image/png' }); };
  const plain = await redIn(await stillOf(null));
  const re = await redIn(await stillOf(FormatsCore.toPage(auto916)));
  step('an exported 9:16 frame: no subject in the scene\'s own framing, the subject with the reframe', plain < 3 && re > 10, { plain, reframed: re });
});

// ---------- export 2 formats (small, short) ----------
F.close();
step('closing frees the picker (dialog gone, pictures released)', !document.querySelector('dialog.lf-panel') && !F.status().open);
let res = null; const seen = new Set(); let maxRows = 0;
await safe('export', async () => {
  const off = window.Progress?.on?.((it) => { seen.add(it.key.split(':')[0]); });
  const tick = setInterval(() => { const n = (window.Progress?.list?.() || []).filter((x) => /^lab-(export|formats):/.test(x.key) && !x.done).length; maxRows = Math.max(maxRows, n); }, 50);
  t0 = performance.now();
  const p = F.exportAll({ formats: ['16:9', '9:16'], nudges: { '9:16': auto916 }, long: 160, frames: 6, fps: 30, at: 0 });
  await until(() => F.status().running, 5000);
  const running = F.status().running;
  res = await p;
  clearInterval(tick); off?.();
  step('one batch, one progress line (the formats\' own jobs don\'t add theirs)', running?.n === 2 && seen.has('lab-formats') && !seen.has('lab-export') && maxRows === 1, { running, seen: [...seen], maxRows });
  const probes = await Promise.all(res.files.map((f) => window.hub.video.probe(f.path)));
  const dirs = new Set(res.files.map((f) => f.path.replace(/[\\/][^\\/]+$/, '')));
  step('2 MP4s with the right sizes (160×90, 90×160), 6 frames each', res.files.length === 2 && probes[0]?.w === 160 && probes[0]?.h === 90 && probes[1]?.w === 90 && probes[1]?.h === 160 && probes.every((p) => p.frames === 6 && p.codec === 'h264'),
    { files: res.files.map((f) => f.path), probes: probes.map((p) => p && `${p.codec} ${p.w}x${p.h} ${p.frames}f`), ms: Math.round(performance.now() - t0) });
  step('named clearly, in one folder', dirs.size === 1 && /all formats/.test([...dirs][0]) && /formats probe 16x9 160x90\.mp4$/.test(res.files[0].path) && /formats probe 9x16 90x160\.mp4$/.test(res.files[1].path), [...dirs]);
  const s = await Commands.tryRun('/all-formats status', H.claudeAgent().id, undefined, { say: (t) => { out.status = t; } });
  step('/all-formats status names the files', /16:9/.test(out.status || '') && /9:16/.test(out.status || ''), { s, said: out.status });
});
step('no export page, no temp folder left', document.querySelectorAll('.lab-xp-host').length === hosts0);
await safe('temp files', async () => {
  const dir = res?.dir; let names = [];
  await until(async () => { names = (dir ? await window.hub.fs.list(dir) : []).map((x) => x.name); return names.length === 2; }, 6000);
  step('the folder holds just the 2 videos (frames cleaned up)', names.length === 2 && names.every((n) => /\.mp4$/.test(n)), names);
});

// ---------- Ready to post's way in ----------
await safe('publishkit', async () => {
  if (typeof PublishKit === 'undefined') await Lazy.load('publishkit');
  await PublishKit.open(res.files[1].path);
  const b = await until(() => document.querySelector('.pk-formats'), 8000) && document.querySelector('.pk-formats');
  b?.click();
  await until(() => F.status().open, 8000);
  step('📮 Ready to post › ▦ All formats closes the kit and opens the picker', Boolean(b) && !PublishKit.current && F.status().open);
  await until(() => !F.status().busy, 120000);
  F.close();
});
await safe('cleanup', async () => {
  if (res?.dir) await window.hub.fs.trash?.([res.dir]);
  step('cleanup: nothing open, nothing running, exports removed', !F.status().open && !F.status().running && !document.querySelector('dialog.lf-panel') && document.querySelectorAll('.lab-xp-host').length === hosts0 && !(await window.hub.fs.stat(res.dir)));
});
out.ok = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
