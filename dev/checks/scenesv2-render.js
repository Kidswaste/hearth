// (Nov 9) Scenes v2 phase 4: renders and stills of a v2 scene from the export page (?gpu=1&xp=1, the same v2 runtime,
// frames read from its one canvas). Its own temp data: the "Music visual (v2)" template, a short MP4 (probed), stills
// (decoded: a picture, not black; two times differ: it moves on the render's clock; the same time twice: the same
// pixels), and an old-format scene's still beside it (unchanged path).
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --check-timeout 400000 --script dev/checks/scenesv2-render.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const pic = async (p) => {
  const u8 = await window.hub.fs.read(p, { encoding: 'buffer' });
  const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 40) lit += 1;
  return { w: bmp.width, h: bmp.height, lit: Math.round((lit / (d.length / 4)) * 100) / 100, d };
};
const mad = (a, b) => { if (a.length !== b.length) return 999; let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]); return Math.round((s / a.length) * 1000) / 1000; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  await ThreeLab.cmd();
  await until(() => typeof LabExport !== 'undefined', 30000);
  const t = ThreeData.V2_TEMPLATES.find((x) => x.id === 'v2-music'); const Ls = ThreeData.v2Layers(t);
  ThreeLab.scenes.create({ name: 'v2 render', code: Ls[0].code, layers: Ls, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000); await wait(2000);
  const t0 = Date.now();
  const v = await LabExport.render({ format: 'mp4', size: '640x360', fps: 30, frames: 45, source: 'scene', at: 0 });
  const ms = Date.now() - t0;
  const p = v?.path ? await window.hub.video.probe(v.path) : null;
  step('v2: an MP4 renders (640×360, 45 frames)', Boolean(p) && (p.width === 640 || p.w === 640), { probe: p, ms, speed: v?.speed });
  const a = await LabExport.render({ format: 'still', size: '640x360', at: 0.5 });
  const b = await LabExport.render({ format: 'still', size: '640x360', at: 1.5 });
  const a2 = await LabExport.render({ format: 'still', size: '640x360', at: 0.5 });
  const A = await pic(a.path); const B = await pic(b.path); const A2 = await pic(a2.path);
  step('v2: a still shows the scene (not black)', A.lit > 0.3, { lit: A.lit, w: A.w, h: A.h });
  step('v2: stills at two times differ (the render clock moves the scene)', mad(A.d, B.d) > 0.5, { mad: mad(A.d, B.d) });
  step('v2: the same time twice gives (nearly) the same pixels', mad(A.d, A2.d) < 1.5, { mad: mad(A.d, A2.d) });
  out.v2still = a.path;
  // an old-format scene's still, beside it
  const OLD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#203040'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 16), new THREE.MeshNormalMaterial()); scene.add(m);
renderer.setAnimationLoop((now) => { m.rotation.y = now / 1000; renderer.render(scene, camera); });`;
  ThreeLab.scenes.create({ name: 'old render', code: OLD, open: true });
  await until(() => ThreeLab.workspace.state().ready, 60000); await wait(2000);
  const o = await LabExport.render({ format: 'still', size: '640x360', at: 0.5 });
  const O = await pic(o.path);
  step('old: a still renders as before (not black)', O.lit > 0.5, { lit: O.lit });
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
