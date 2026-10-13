// Lab gestures (round 34 "labgestures"), in the real preview with trusted input (CDP mouse / wheel events, as the
// owner's trackpad and mouse send them): a mouse wheel zooms, ctrl+wheel (a pinch) zooms finer, two-finger scrolls
// (sideways deltas) turn, right-drag turns and coasts, a right-click without a drag still opens the Lab's menu,
// middle-drag pans, double-click and Z frame the subject, Shift+Z resets, Keep this view becomes the scene's camera;
// synthetic events move nothing; once the view settles nothing runs and labpace's still check stops drawing again;
// a scene with OrbitControls keeps them (the wheel is theirs) while Z / Shift+Z still frame and reset it.
//   node dev/smoke.js --fake-engines --check-timeout 200000 --script dev/checks/labgestures.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(600); } return r; };
const GS = () => sbx('return window.__labGest.state()');
const view = async () => (await GS())?.views?.[0] || null;
const frameEl = () => [...document.querySelectorAll('.three-preview iframe')].find((f) => f.getBoundingClientRect().width > 0) || document.querySelector('.three-preview iframe');
const vis = (s) => [...document.querySelectorAll(s)].some((n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0);
const R = () => frameEl().getBoundingClientRect();
const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
const at = (fx = 0.5, fy = 0.5) => { const r = R(); return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) }; };
const wheel = (o, p = at()) => mouse({ type: 'mouseWheel', ...p, deltaX: 0, deltaY: 0, ...o });
async function drag(button, dx, dy, { steps = 10, ms = 12, mods = 0, hold = 0 } = {}) {
  const p = at(); const buttons = button === 'right' ? 2 : button === 'middle' ? 4 : 1;
  await mouse({ type: 'mouseMoved', ...p, button: 'none' });
  await mouse({ type: 'mousePressed', ...p, button, buttons, clickCount: 1, modifiers: mods });
  for (let i = 1; i <= steps; i++) { await mouse({ type: 'mouseMoved', x: p.x + Math.round((dx * i) / steps), y: p.y + Math.round((dy * i) / steps), button, buttons, modifiers: mods }); await wait(ms); }
  if (hold) await wait(hold);
  await mouse({ type: 'mouseReleased', x: p.x + dx, y: p.y + dy, button, buttons: 0, clickCount: 1, modifiers: mods });
}
const key = async (k, code, mods = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods } }), wait(3000)]); };
// keys reach the Lab from the picture (after a click on it), as the owner presses them
const focusPic = async () => { const p = at(0.5, 0.6); await mouse({ type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await mouse({ type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await wait(150); };
const settled = () => until(async () => { const s = await GS(); return s && !s.loop; }, 6000);
const PROBE = `if (!window.__dp) {
  const dp = window.__dp = { calls: 0, frames: [], last: -1, on: false };
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = P[m]; if (typeof f !== 'function') continue;
      P[m] = function (...a) { if (dp.on) { dp.calls += 1; const t = document.timeline.currentTime; if (t !== dp.last) { dp.frames.push(t); dp.last = t; } } return f.apply(this, a); };
    }
  }
}
window.__dp.calls = 0; window.__dp.frames = []; window.__dp.last = -1; window.__dp.on = true; return 1`;
try { c.customSize(640, 360); c.size('custom'); } catch (err) { out.sizeError = err.message; }
await wait(1000);

// a scene with a plain camera and no controls of its own (drawn every frame by its loop, still)
const PLAIN = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141a2a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1, 9); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight('#ffffff', 0.6)); const l = new THREE.DirectionalLight('#ffffff', 2); l.position.set(3, 4, 5); scene.add(l);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 120, 16), new THREE.MeshStandardMaterial({ color: '#80c0ff', roughness: 0.4 })); knot.position.set(1.5, 0, 0); scene.add(knot);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#223' })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.5; scene.add(ground);
window.__plainCam = camera;
function frame() { requestAnimationFrame(frame); renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
await d.newSketch('labgestures plain', PLAIN, 3);
await wait(1800);
const s0 = await GS();
step('the gestures runtime is in the preview, the plain scene is the gesture layer, nothing moves', s0 && s0.target && !s0.loop && !s0.views.length, s0);

await safe('mouse wheel', async () => {
  await wheel({ deltaY: 100 }); await wait(120); await wheel({ deltaY: 100 });
  await wait(60);
  const mid = await view();
  await settled();
  const v = await view();
  step('a mouse wheel notch zooms out (eased: on its way, then settles)', v && v.s > 1.2 && mid && mid.s < v.s, { mid: mid?.s, end: v?.s });
  out.wheelS = v?.s;
});
await wait(500);
await safe('pinch', async () => {
  const s1 = (await view())?.s;
  for (let i = 0; i < 6; i++) { await wheel({ deltaY: -4.5, modifiers: 2 }); await wait(16); }
  await settled();
  const s2 = (await view())?.s;
  step('ctrl+wheel (a trackpad pinch) zooms in, finer than a notch', s2 < s1 && s2 > s1 * 0.6, { s1, s2 });
  // a real pinch (Chromium turns it into ctrl+wheel events), when this build can synthesize one
  const p = at();
  const r = await Promise.race([smoke({ cdp: 'Input.synthesizePinchGesture', params: { x: p.x, y: p.y, scaleFactor: 1.6, relativeSpeed: 600, gestureSourceType: 'mouse' } }).then(() => 'ok', (e) => String(e?.message || e)), wait(4000).then(() => 'timeout')]);
  await settled();
  const s3 = (await view())?.s;
  out.realPinch = { r, before: s2, after: s3 };
});
await wait(500);
await safe('two-finger scroll', async () => {
  const v0 = await view();
  for (let i = 0; i < 8; i++) { await wheel({ deltaX: -12, deltaY: 0 }); await wait(16); }
  await settled();
  const v1 = await view();
  step('two-finger sideways scroll turns around the subject (fingers right → the camera goes left)', v1 && v1.yaw < v0.yaw - 0.1, { yaw0: v0?.yaw, yaw1: v1?.yaw });
});
await wait(500);
await safe('right-drag', async () => {
  const v0 = await view(); const st0 = await GS();
  await drag('right', 140, -30, { steps: 10, ms: 10 });
  const justAfter = await GS();
  await wait(250);
  const menu = vis('#menu');
  await settled();
  const v1 = await view();
  step('right-drag turns the view (yaw and pitch)', v1 && Math.abs(v1.yaw - v0.yaw) > 0.5 && Math.abs(v1.pitch - v0.pitch) > 0.05, { yaw: [v0?.yaw, v1?.yaw], pitch: [v0?.pitch, v1?.pitch] });
  step('… it coasts after the release (still moving right after, then stops)', justAfter?.loop === true && (await GS()).loop === false, { loopAfterRelease: justAfter?.loop });
  step('… and a right-drag does not open the menu', !menu, { menu, steps: [st0.steps, justAfter.steps] });
  try { hideMenu(); } catch { /* none */ }
});
await wait(400);
await safe('right-click', async () => {
  try { hideMenu(); } catch { /* none */ }
  const p = at(0.4, 0.4);
  await mouse({ type: 'mousePressed', ...p, button: 'right', buttons: 2, clickCount: 1 });
  await wait(60);
  await mouse({ type: 'mouseReleased', ...p, button: 'right', buttons: 0, clickCount: 1 });
  const ok = await until(() => vis('#menu'), 2500);
  const rows = [...document.querySelectorAll('#menu .menu-item, #menu button, #menu [role="menuitem"]')].map((n) => n.textContent.trim().slice(0, 40));
  step('a right-click without a drag still opens the Lab\'s menu', ok, rows.slice(0, 6));
  try { hideMenu(); } catch { /* none */ }
});
await wait(400);
await safe('middle-drag', async () => {
  const v0 = await view();
  await drag('middle', 80, 40, { steps: 8, ms: 10, hold: 120 });
  await settled();
  const v1 = await view();
  step('middle-drag pans (the content follows: right → the view moves left; down → up)', v1 && v1.px < v0.px && v1.py > v0.py && Math.abs(v1.yaw - v0.yaw) < 1e-9, { px: [v0?.px, v1?.px], py: [v0?.py, v1?.py] });
});
await safe('untrusted', async () => {
  const v0 = await view();
  await sbx('for (let i = 0; i < 5; i++) dispatchEvent(new WheelEvent("wheel", { deltaY: 300, clientX: 100, clientY: 100, cancelable: true })); dispatchEvent(new PointerEvent("pointerdown", { button: 2, pointerId: 9 })); return 1');
  await wait(300);
  const v1 = await view();
  step('synthetic (untrusted) wheel / pointer events move nothing (the director\'s three_input, a sketch\'s own events)', v1 && v1.s === v0.s && v1.yaw === v0.yaw, { s: [v0?.s, v1?.s] });
});
// still after the moves: nothing runs, labpace stops drawing
await safe('still', async () => {
  await settled(); await wait(1200);
  await sbx(PROBE);
  const t0 = performance.now(); const steps0 = (await GS()).steps;
  await wait(2500);
  const r = await sbx('window.__dp.on = false; return { calls: window.__dp.calls, frames: window.__dp.frames.length }');
  const el = (performance.now() - t0) / 1000;
  const g = await GS(); const pace = await sbx('return window.__labPace.state()');
  out.still = { framesPerSec: Math.round((r.frames / el) * 10) / 10, gestureSteps: g.steps - steps0, loop: g.loop, still: pace?.still };
  step('a moved view, once settled: the gesture loop is off and runs no steps', !g.loop && g.steps === steps0, out.still);
  step('… and labpace\'s still check stops drawing again (≈ once a second)', r.frames / el <= 2.5, out.still);
  step('… the picture drawn is the moved view (the camera put back after each draw)', g.pose.some((x) => x !== 0) && (await sbx('return window.__plainCam.position.toArray()')).join() === '0,1,9', { pose: g.pose });
});
// a view command by key: wait for the preview's answer, then for the view to settle
const keyed = async (k, mods = 0) => { const n = c.state.view; await focusPic(); await key(k, 'KeyZ', mods); const ok = await until(() => c.state.view > n, 3000); await wait(100); await settled(); return ok; };
const pivotAt = async () => { const g = await GS(); return g.pose.slice(4, 7); };
const KNOT = [1.5, 0, 0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
await safe('keys', async () => {
  const ok = await keyed('z');
  const pv = await pivotAt();
  step('Z frames the subject (the knot, not the 200 m ground): the view turns around it now', ok && dist(pv, KNOT) < 0.5, { pivot: pv, seq: c.state.view, say: ThreeGestures.last()?.say });
  const ok2 = await keyed('Z', 8);
  const g = await GS();
  step('Shift+Z resets the view to the scene\'s own camera', ok2 && (g.views.length === 0 || g.views[0].idle), g.views[0]);
});
await safe('double-click', async () => {
  const p = at(0.6, 0.5);
  const dbl = async () => { await mouse({ type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await mouse({ type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await mouse({ type: 'mousePressed', ...p, button: 'left', clickCount: 2 }); await mouse({ type: 'mouseReleased', ...p, button: 'left', clickCount: 2 }); await wait(150); await settled(); };
  await dbl();
  const pv = await pivotAt();
  await dbl();
  const v2 = await view();
  step('double-click frames the subject (a Mac smart-zoom double-tap), again: back to the view before', dist(pv, KNOT) < 0.5 && v2 && v2.idle, { framed: pv, back: v2 });
});
await safe('keep', async () => {
  await wheel({ deltaY: 100 }); await settled();
  const n = c.state.view;
  ThreeGestures.keep();
  await until(() => c.state.view > n, 3000);
  const g = await GS();
  step('Keep this view: the view becomes the scene\'s camera override (saved, the editor\'s undo), the offset goes', g.kept.length === 1 && (!g.views.length || g.views[0].idle), { kept: g.kept, say: ThreeGestures.last()?.say });
});
await safe('menus', async () => {
  const items = ThreeGestures.viewItems().filter((x) => x && x !== '-').map((x) => x.label);
  step('the preview\'s right-click › View has frame / reset / keep / moving around', items.length === 4, items);
  const dlg = ThreeGestures.help(); await wait(200);
  step('"Moving around…" opens a one-screen help', dlg.open && dlg.textContent.includes('Pinch'), dlg.textContent.slice(0, 80));
  dlg.close();
  const lines = Keys.all().filter((k) => k.area === 'Lab' && /^(Z|Shift\+Z)$|Two-finger/.test(k.keys)).map((k) => k.keys);
  step('the keys sheet lists Z, Shift+Z and the gestures', lines.length === 3, lines);
  const r = await Commands.tryRun('/lab-view reset', H.claudeAgent().id).catch((e) => e.message);
  step('/lab-view drives it from a chat', r !== false, r);
});
// a scene with OrbitControls (the starter): its controls keep the wheel; Z / Shift+Z frame and reset it
await safe('orbit controls', async () => {
  const ORBIT = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x15181e);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(3, 2, 5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x7c5cff })); cube.position.set(4, 0, -3); scene.add(cube);
window.__oc = { camera, controls };
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });`;
  await d.newSketch('labgestures orbit', ORBIT, 3);
  await wait(1800);
  const g0 = await GS();
  step('OrbitControls report themselves; the scene is not a gesture layer (its controls keep the wheel and drags)', g0.orbits >= 1 && !g0.target && g0.keys, g0);
  const p0 = await sbx('return window.__oc.camera.position.toArray()');
  await wheel({ deltaY: 100 }); await wait(600);
  const g1 = await GS(); const p1 = await sbx('return window.__oc.camera.position.toArray()');
  step('… a wheel goes to OrbitControls (its camera dollies), no Lab view is made', !g1.views.length && p1.join() !== p0.join(), { p0, p1 });
  const n = c.state.view;
  await focusPic(); await key('z', 'KeyZ');
  await until(() => c.state.view > n, 3000); await settled();
  const t = await sbx('return window.__oc.controls.target.toArray()');
  step('Z frames an OrbitControls scene: its target moves to the subject (the cube at 4, 0, -3)', Math.abs(t[0] - 4) < 0.05 && Math.abs(t[2] + 3) < 0.05, t);
  { const n2 = c.state.view; await key('Z', 'KeyZ', 8); await until(() => c.state.view > n2, 3000); await wait(100); await settled(); }
  const t2 = await sbx('return window.__oc.controls.target.toArray()');
  step('Shift+Z puts its target and camera back where the scene started them', Math.hypot(...t2) < 0.05, t2);
});
await d.newSketch('labgestures done', PLAIN, 2).catch(() => {});
out.ok = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
