// (round 153a, lite153) ⚡ Lite mode (docs/upgrades/lite153.md), ONE focused check on its own fixture scene and temp data
// (smoke.js; never an owner's scene). Steps:
//   switch    the Lab ⋯ › View & help row turns it on (a real click): <html data-lite>, Motion: off, the store's hub.lite;
//             nothing the owner chose is changed or saved (theme fx, Lab look, stage, quality mode, stored motion)
//   preview   the fixture (an EffectComposer bloom layer at 2× pixels, antialias, a shadow-casting spot light): 30 fps
//             with the window in front, half resolution (pixel ratio ≤ 0.5), the composer's bloom stepped aside, no
//             shadow casters, antialias off (a fresh page)
//   ui        no animation running after a menu opens and the Lab bar wakes, no backdrop-filter or will-change on screen,
//             composited layers no more than with Lite off; the LITE tags in the Lab bar and the rail; Settings' row
//   renders   a still and a 1 s MP4 rendered with Lite on equal the same renders with Lite off (pixels, size, frames)
//   words     the command bar's "lite mode off / on", /lite, Ctrl/⌘+Alt+L
//   labwin    the Lab in its own window (labwin153) follows it: Lite on there (data-lite, its preview at 30 fps with
//             Hearth's window in front, half resolution), off from Hearth's window → off there too (the storage event)
//   persist   after a reload (a restart of the page) Lite is on before the first frame, the preview at 30 / half again
//   restore   the Lab bar's LITE tag turns it off: every attribute, stored setting and preview setting as before
//   offer     Lite off, a slow layer (≈ 12 fps): "Things are slow — turn on Lite mode?" shows once, never switches by itself
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/lite153.js
const probe = () => {
  window.__liteBoot = { dcl: null, frame: null };
  document.addEventListener('DOMContentLoaded', () => { window.__liteBoot.dcl = document.documentElement.hasAttribute('data-lite'); });
  requestAnimationFrame(() => { window.__liteBoot.frame = document.documentElement.hasAttribute('data-lite'); });
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
localStorage.setItem('hub.lite', 'false');
return 'probe installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const safe = async (name, fn, ms = 300000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(`${name} threw`, false, String(err?.stack || err).slice(0, 500)); } };
const de = document.documentElement;
const GLOW = `import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060a);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 2, 8); camera.lookAt(0, 0, 0);
const spot = new THREE.SpotLight(0xffffff, 60); spot.position.set(3, 6, 4); spot.castShadow = true; spot.shadow.mapSize.set(512, 512); scene.add(spot); scene.add(new THREE.AmbientLight(0xffffff, 0.2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x334455 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.2; floor.receiveShadow = true; scene.add(floor);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x552200 })); knot.castShadow = true; scene.add(knot);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.4, 0.4, 0.1));
composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop((t) => { knot.rotation.y = t / 1000; knot.rotation.x = t / 1700; composer.render(); });`;
const SLOW = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshNormalMaterial()); m.position.set(2, 1, 0); scene.add(m);
renderer.setAnimationLoop((t) => { const t0 = performance.now(); while (performance.now() - t0 < 70) { /* a slow frame on purpose */ } m.rotation.y = t / 500; renderer.render(scene, camera); });`;

let c = null; let D = null;
const ev = async (code, tries = 8) => { for (let i = 0; i < tries; i++) { const r = await D.evalInSketch(code).catch(() => null); if (r?.ok) return r.value; await wait(500); } return null; };
const evj = async (code) => { const v = await ev(`return JSON.stringify(${code})`); try { return v ? JSON.parse(v) : null; } catch { return null; } };
const liteState = () => evj('window.__labLite ? window.__labLite.state() : null');
const smoothState = () => evj('window.__labSmooth ? window.__labSmooth.state() : null');
const glowR = (s) => (s?.renderers || []).find((r) => r.layer && r.pr != null && !r.helper) || null;
// what the owner chose (stored) and what is drawn from it now
const chosen = () => ({ themeFx: JSON.stringify(H.config?.theme?.fx || {}), lablook: store.get('three.labLook', null), stageFx: store.get('three.stageFx', null), quality: store.get('three.quality', null), qMode: ThreeLab.quality?.get?.() });
const shown = () => ({ motion: de.dataset.motion || '', tex: de.dataset.tex || '', glow: de.style.getPropertyValue('--glow'), lablook: de.dataset.lablook || '' });
const running = () => document.getAnimations().filter((a) => a.playState === 'running');
const pixels = async (p) => { const u8 = await window.hub.fs.read(p, { encoding: 'buffer' }); const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data }; };
const diff = (a, b) => { if (a.w !== b.w || a.h !== b.h) return 255; let s = 0; for (let i = 0; i < a.d.length; i += 1) s += Math.abs(a.d[i] - b.d[i]); return Math.round((s / a.d.length) * 100) / 100; };
async function renders(tag) {
  const st = await LabExport.render({ format: 'still', size: { w: 320, h: 180 }, at: 0.5, source: 'scene', quiet: true, track: false });
  const mp = await LabExport.render({ format: 'mp4', source: 'scene', at: 0, secs: 1, size: { w: 160, h: 90 }, fps: 24, quality: 'draft', sound: false, quiet: true, track: false });
  const size = (await window.hub.fs.stat(mp.path).catch(() => null))?.size ?? null;
  return { tag, still: await pixels(st.path), mp4: { w: mp.w, h: mp.h, frames: mp.frames, fps: mp.fps, bytes: size } };
}
const clickRow = async (re) => { const row = await until(() => [...document.querySelectorAll('.mb-menu.lab-pop .menu-item')].find((b) => re.test(b.textContent)), 3000); row?.click(); return Boolean(row); };

try {
  await smoke({ cdnFor: 'lab-window\\.html' }); // (the Lab window's preview: three.js from the local copy)
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length && window.HearthLite, 60000);
  await until(() => window.LiteUI, 15000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.quality, 60000);
  c = await ThreeLab.cmd(); D = ThreeLab.director;
  await D.newSketch('Lite fixture (lite153)', GLOW, 1);
  const fixId = ThreeLab.scenes.currentId();
  try { c.customSize(320, 180); c.size('custom'); } catch { /* fit */ }
  c.code?.(false);
  // (Force high quality: the preview's own resolution stays put while this software GL is slow, so "as before" is exact;
  // Lite goes over it all the same)
  ThreeLab.quality.set('high', { quiet: true });
  await until(async () => { const s = await smoothState(); const r = glowR(s); return r?.aa === true && r.pr >= 1.99 ? s : null; }, 40000, 600);
  await wait(2500);
  const before = { chosen: chosen(), shown: shown(), lite: await liteState(), smooth: await smoothState() };
  out.measure.before = { ...before, smooth: { renderers: before.smooth?.renderers } };
  const layersOff = await smoke({ layers: true });
  const offR = await safe('renders (off)', async () => { out._offR = await renders('off'); }, 400000).then(() => out._offR);

  // ---------- switch: the Lab ⋯ › View & help row ----------
  await safe('switch', async () => {
    document.querySelector('.three-toolbar [data-feature="Lab more"]').click();
    const clicked = await clickRow(/^View & help/) && await clickRow(/^⚡ Lite mode/); // (round 161, fix161) ⋯ › View & help › ⚡ Lite mode (menucalm's 11 top rows)
    await wait(600);
    const a = { clicked, attr: de.hasAttribute('data-lite'), stored: localStorage.getItem('hub.lite'), on: HearthLite.on, shown: shown(), chosen: chosen() };
    out.measure.switch = a;
    step('switch: the Lab ⋯ › View & help row turns Lite on (data-lite, Motion: off, no textures / glow, stored as hub.lite)', clicked && a.attr && a.on && a.stored === 'true' && a.shown.motion === 'off' && a.shown.tex === 'off' && a.shown.glow === '0', a);
    step('switch: nothing the owner chose is changed or saved (theme fx, Lab look, stage, quality mode)', JSON.stringify(a.chosen) === JSON.stringify(before.chosen) && a.shown.lablook === before.shown.lablook, { before: before.chosen, now: a.chosen });
  });

  // ---------- preview ----------
  await safe('preview', async () => {
    const s = await until(async () => { const x = await smoothState(); const r = glowR(x); return r && r.aa === false && r.pr <= 0.51 ? x : null; }, 40000, 600);
    const l0 = await liteState(); await wait(2000); const l1 = await liteState();
    const r = glowR(s || await smoothState());
    out.measure.preview = { lite: l1, renderer: r, focused: document.hasFocus() };
    step('preview: 30 fps (the window in front), the Lab\'s ⚡ settings at their lightest (1× pixels, no antialias, no shadows, filters at half)', l1?.on && l1.cap === 30 && l1.spd.px1 && l1.spd.noAA && l1.spd.sh === 0 && l1.spd.fxHalf, l1);
    step('preview: half resolution (pixel ratio ≤ 0.5 of a 2× scene), antialias off, the spot light\'s shadow held off', r && r.pr <= 0.51 && r.aa === false && l1?.shadowLights >= 1 && l1.shadowsOff === l1.shadowLights, { r, shadowLights: l1?.shadowLights, shadowsOff: l1?.shadowsOff });
    step('preview: the composer\'s bloom is stepped aside while it draws', l1 && l0 && l1.bypassed > l0.bypassed, { before: l0?.bypassed, after: l1?.bypassed });
  });

  // ---------- ui ----------
  await safe('ui', async () => {
    const tb = document.querySelector('.three-toolbar'); const r0 = tb.getBoundingClientRect();
    await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: Math.round(r0.left + 200), y: Math.round(r0.top + r0.height / 2), button: 'none' } });
    document.querySelector('.three-toolbar [data-feature="Lab more"]').click(); await wait(250);
    const anims = running().map((a) => `${a.animationName || a.transitionProperty || 'waapi'}@${String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? '').slice(0, 30)}`);
    document.querySelector('.mb-menu.lab-pop')?.remove();
    let backdrop = 0; let willChange = 0;
    for (const n of document.querySelectorAll('body *')) { const cs = getComputedStyle(n); if (cs.backdropFilter && cs.backdropFilter !== 'none') backdrop += 1; if (cs.willChange && cs.willChange !== 'auto') willChange += 1; }
    await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: innerHeight - 6, button: 'none' } }); await wait(600);
    const layersOn = await smoke({ layers: true });
    const tags = [...document.querySelectorAll('.lite-tag')].map((n) => ({ rail: n.id === 'lite-rail', seen: n.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && n.getBoundingClientRect().width > 0 }));
    out.measure.ui = { anims, backdrop, willChange, layers: { off: layersOff?.count, on: layersOn?.count }, tags, stage: LabHudStage.state().fx };
    step('ui: no animation runs (a menu opened, the Lab bar woken), no backdrop-filter or will-change anywhere, no reactive stage', !anims.length && !backdrop && !willChange && LabHudStage.state().fx === 'none', out.measure.ui);
    step('ui: composited layers no more than with Lite off', layersOn?.count != null && layersOff?.count != null && layersOn.count <= layersOff.count, out.measure.ui.layers);
    step('ui: the LITE tag shows in the Lab bar and in the rail', tags.some((t) => !t.rail && t.seen) && tags.some((t) => t.rail && t.seen), tags);
    await AppUI.openSettings(); await wait(600);
    const box = document.querySelector('dialog.settings-dialog .lite-row input[type=checkbox]');
    const foldLine = box?.closest('details')?.querySelector('summary')?.textContent || '';
    step('ui: Settings › Look & size › More looks and tweaks has the Lite mode switch, ticked, and the fold\'s line says so (round 161)', Boolean(box?.checked) && /Lite mode on/.test(foldLine), { found: Boolean(box), foldLine });
    document.querySelector('dialog.settings-dialog')?.close();
  });

  // ---------- renders ----------
  await safe('renders', async () => {
    const on = await renders('on');
    const d = offR ? diff(offR.still, on.still) : null;
    out.measure.renders = { stillDiff: d, still: { off: offR && [offR.still.w, offR.still.h], on: [on.still.w, on.still.h] }, mp4: { off: offR?.mp4, on: on.mp4 }, lite: (await liteState())?.on };
    const m0 = offR?.mp4; const m1 = on.mp4;
    step('renders: a still rendered with Lite on equals the one rendered with Lite off (full size, bloom, antialias)', d != null && d <= 1.5 && on.still.w === 320 && on.still.h === 180, out.measure.renders);
    step('renders: a 1 s MP4 rendered with Lite on has the same size, frames and frame rate as with Lite off (and about the same bytes)', m0 && m1 && m0.w === m1.w && m0.h === m1.h && m0.frames === m1.frames && m0.fps === m1.fps && (m0.bytes == null || Math.abs(m1.bytes - m0.bytes) <= m0.bytes * 0.15), out.measure.renders.mp4);
    delete out._offR;
  });

  // ---------- words ----------
  await safe('words', async () => {
    if (typeof CmdBar === 'undefined') await Lazy.load('cmdbar');
    await CmdBar.runLine('lite mode off', { quiet: true }); await wait(300);
    const off1 = HearthLite.on;
    await CmdBar.runLine('turn on lite mode', { quiet: true }); await wait(300);
    const on1 = HearthLite.on;
    await Commands.tryRun?.('/lite off', H.claudeAgent()?.id); await wait(300);
    const off2 = HearthLite.on;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', key: 'l', ctrlKey: true, altKey: true, bubbles: true }));
    await wait(300);
    const on2 = HearthLite.on;
    CmdBar.close?.();
    out.measure.words = { off1, on1, off2, on2 };
    step('words: the command bar\'s "lite mode off" / "turn on lite mode", /lite off, Ctrl/⌘+Alt+L', off1 === false && on1 === true && off2 === false && on2 === true, out.measure.words);
    HearthLite.set(true);
  });

  localStorage.setItem('lite153.fix', fixId);
  localStorage.setItem('lite153.before', JSON.stringify({ chosen: before.chosen, shown: before.shown, lite: before.lite, r: glowR(before.smooth) }));
  // ---------- labwin: the Lab in its own window follows Lite ----------
  await safe('labwin', async () => {
    if (!window.LabWinHost || !window.hub?.labwin) { step('labwin: the Lab window is there (labwin153)', false); return; }
    const lw = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
    const pv = (code) => lw(`ThreeLab.director.evalInSketch(${JSON.stringify(`return JSON.stringify(${code})`)}).then((r) => (r && r.ok ? JSON.parse(r.value) : null))`);
    await LabWinHost.open(fixId);
    await until(async () => (await lw('typeof LabWin !== "undefined" && LabWin.times().frame ? 1 : 0')) === 1, 60000);
    await lw('window.hub.labwin.showMain({})'); // (Hearth's window in front: the Lab window would draw at full rate)
    const on = await until(async () => { const x = await pv('window.__labLite ? window.__labLite.state() : null'); return x?.on && x.cap === 30 ? x : null; }, 30000, 600);
    const page = await lw(`({ on: window.HearthLite?.on, attr: document.documentElement.hasAttribute('data-lite'), motion: document.documentElement.dataset.motion || '', host: window.LabWinHost?.lite?.(), tag: Boolean(document.querySelector('.three-toolbar .lite-tag')?.checkVisibility()) })`);
    const r = await until(async () => { const x = await pv('window.__labSmooth ? window.__labSmooth.state().renderers : null'); return x?.length ? x[0] : null; }, 20000, 600);
    HearthLite.set(false);
    const off = await until(async () => { const x = await pv('window.__labLite ? window.__labLite.state() : null'); return x && !x.on && x.cap !== 30 ? x : null; }, 20000, 600);
    const page2 = await lw(`({ on: window.HearthLite?.on, attr: document.documentElement.hasAttribute('data-lite') })`);
    out.measure.labwin = { on, page, r, off, page2 };
    step('labwin: in the Lab window Lite is on too (data-lite, Motion: off, its LITE tag), its preview at 30 fps with Hearth\'s window in front, half resolution', Boolean(on) && page?.on === true && page.attr && page.motion === 'off' && page.host === true && page.tag && r && r.q <= 0.5, out.measure.labwin);
    step('labwin: off from Hearth\'s window → off in the Lab window too (its full rate back)', Boolean(off) && page2?.on === false && !page2.attr, { off, page2 });
    await Promise.race([window.hub.labwin.close(), wait(10000)]); // (closed from Hearth's side: an eval in a page that is closing can wait forever)
    await until(() => !LabWinHost.away(), 20000);
    await wait(1500);
  });
  if (ThreeLab.scenes.currentId() !== fixId) { try { ThreeLab.scenes.open(fixId); } catch { /* the next part opens it */ } }
  HearthLite.set(true);
} catch (err) { step(`threw: ${String(err?.stack || err).slice(0, 500)}`, false); }
localStorage.setItem('lite153.out', JSON.stringify(out));
return JSON.stringify({ part: 1, steps: out.steps });
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = JSON.parse(localStorage.getItem('lite153.out') || '{"steps":[],"measure":{}}');
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const safe = async (name, fn, ms = 300000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(`${name} threw`, false, String(err?.stack || err).slice(0, 500)); } };
const de = document.documentElement;
const before = JSON.parse(localStorage.getItem('lite153.before') || 'null');
let c = null; let D = null;
const ev = async (code, tries = 8) => { for (let i = 0; i < tries; i++) { const r = await D.evalInSketch(code).catch(() => null); if (r?.ok) return r.value; await wait(500); } return null; };
const evj = async (code) => { const v = await ev(`return JSON.stringify(${code})`); try { return v ? JSON.parse(v) : null; } catch { return null; } };
const liteState = () => evj('window.__labLite ? window.__labLite.state() : null');
const smoothState = () => evj('window.__labSmooth ? window.__labSmooth.state() : null');
const glowR = (s) => (s?.renderers || []).find((r) => r.layer && r.pr != null && !r.helper) || null;
const chosen = () => ({ themeFx: JSON.stringify(H.config?.theme?.fx || {}), lablook: store.get('three.labLook', null), stageFx: store.get('three.stageFx', null), quality: store.get('three.quality', null), qMode: ThreeLab.quality?.get?.() });
const shown = () => ({ motion: de.dataset.motion || '', tex: de.dataset.tex || '', glow: de.style.getPropertyValue('--glow'), lablook: de.dataset.lablook || '' });
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length && window.HearthLite, 60000);
  // ---------- persist ----------
  await safe('persist', async () => {
    const boot = { ...(window.__liteBoot || {}) };
    activate('tool:three');
    await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.quality, 60000);
    c = await ThreeLab.cmd(); D = ThreeLab.director;
    const fix = localStorage.getItem('lite153.fix');
    if (fix && ThreeLab.scenes.currentId() !== fix) { ThreeLab.scenes.open(fix); await wait(2500); }
    try { c.customSize(320, 180); c.size('custom'); } catch { /* fit */ }
    const s = await until(async () => { const x = await smoothState(); const r = glowR(x); return r && r.aa === false && r.pr <= 0.51 ? x : null; }, 40000, 600);
    const l = await liteState();
    out.measure.persist = { boot, on: HearthLite.on, lite: l, r: glowR(s) };
    step('persist: after a reload Lite is on before the first frame (lite-early.js, at the top of <head>; round 161: powerwise.js alone is deferred and a first frame could come before it), Motion: off', HearthLite.on && boot.dcl === true && boot.frame === true && de.dataset.motion === 'off', out.measure.persist);
    step('persist: the preview is at 30 fps and half resolution again, antialias off', l?.on && l.cap === 30 && glowR(s)?.pr <= 0.51 && glowR(s)?.aa === false, out.measure.persist);
  });

  // ---------- restore: the Lab bar's LITE tag ----------
  await safe('restore', async () => {
    const tag = document.querySelector('.three-toolbar .lite-tag');
    tag?.click();
    await wait(600);
    const s = await until(async () => { const x = await smoothState(); const r = glowR(x); return r && r.aa === true && r.pr >= 1.99 ? x : null; }, 40000, 600);
    const l0 = await liteState(); await wait(2000); const l1 = await liteState();
    const r = glowR(s || await smoothState());
    const now = { chosen: chosen(), shown: shown(), lite: l1, r };
    out.measure.restore = { tag: Boolean(tag), stored: localStorage.getItem('hub.lite'), before, now, bypassedIn2s: l1 && l0 ? l1.bypassed - l0.bypassed : null };
    step('restore: the Lab bar\'s LITE tag turns Lite off and is gone (stored off)', Boolean(tag) && !HearthLite.on && !de.hasAttribute('data-lite') && localStorage.getItem('hub.lite') === 'false' && !tag.checkVisibility(), out.measure.restore.stored);
    step('restore: the look, motion, textures, glow, Lab look, stage and quality mode exactly as before', before && JSON.stringify(now.chosen) === JSON.stringify(before.chosen) && JSON.stringify(now.shown) === JSON.stringify(before.shown), { before: before && { ...before.chosen, ...before.shown }, now: { ...now.chosen, ...now.shown } });
    step('restore: the preview as before (frame cap, ⚡ settings, pixel ratio, antialias, no shadow held off, no bypass)', before && l1 && l1.on === false && l1.cap === before.lite?.cap && JSON.stringify(l1.spd) === JSON.stringify(before.lite?.spd) && r && Math.abs(r.pr - before.r?.pr) < 0.01 && r.aa === before.r?.aa && l1.shadowsOff === 0 && l1.bypassed === l0.bypassed, { before: before && { cap: before.lite?.cap, spd: before.lite?.spd, r: before.r }, now: { cap: l1?.cap, spd: l1?.spd, r, shadowsOff: l1?.shadowsOff, bypassed: [l0?.bypassed, l1?.bypassed] } });
  });

  // ---------- offer: a slow layer, Lite off ----------
  await safe('offer', async () => {
    await D.addLayer({ name: 'Slow', code: `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshNormalMaterial()); m.position.set(2, 1, 0); scene.add(m);
renderer.setAnimationLoop((t) => { const t0 = performance.now(); while (performance.now() - t0 < 70) { /* a slow frame on purpose */ } m.rotation.y = t / 500; renderer.render(scene, camera); });` }, 1);
    LiteUI._test.reset();
    const t0 = Date.now();
    const shownAt = await until(() => (document.querySelector('#toasts .lite-offer') ? Date.now() : null), 60000, 300);
    const first = LiteUI.state();
    await wait(16000);
    const after = LiteUI.state();
    const toasts = document.querySelectorAll('#toasts .lite-offer').length;
    out.measure.offer = { seconds: shownAt ? Math.round((shownAt - t0) / 1000) : null, first, after, toasts, fps: ThreeLab.perf?.()?.fps ?? null, on: HearthLite.on };
    step('offer: under the slow layer "Things are slow — turn on Lite mode?" shows, once, and Lite is not switched on by itself', Boolean(shownAt) && after.offers === 1 && toasts <= 1 && !HearthLite.on, out.measure.offer);
    document.querySelector('#toasts .lite-offer .toast-x')?.click();
    try { D.removeLayer?.('Slow'); } catch { /* fine */ }
  });
} catch (err) { step(`threw: ${String(err?.stack || err).slice(0, 500)}`, false); }
HearthLite.set(false);
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
