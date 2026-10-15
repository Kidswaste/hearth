// ✥ Direct (round 46, labdirect): working on the Lab preview's picture with real (trusted) CDP mouse and keys, as the
// owner's mouse / trackpad send them. A scene of two layers (a red WebGL square on the left, a blue 2D-canvas square on
// the right, nothing behind): a click on the red square picks its layer (the Lab selects it, the outline shows); a
// drag moves it (Move X follows, the merged picture shows it moved); Ctrl+Z undoes the drag in one step; a Shift-drag
// snaps its middle onto the frame's centre (a guide shows while dragging); the arrows nudge (Shift ×10) as one undo
// step; a corner scales it about its own middle; Alt+wheel scales; Esc lets go; a click on nothing lets go;
// a double-click on the blue square opens its sliders; the 3D chip shows on the WebGL layer only; the picture is read
// only on pointer events (no reads while idle) and the preview dozes again afterwards.
//   node dev/smoke.js --check-timeout 200000 --script dev/checks/labdirect.js --shot /tmp/labdirect.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [], problems: [] };
const step = (label, ok, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const errs = []; addEventListener('error', (e) => errs.push(e.message));

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && typeof LabDirect !== 'undefined', 60000);
const cmd = await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.groupsHost);
const S = ThreeLab.scenes; const D = ThreeLab.director; const GH = ThreeLab.groupsHost;
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
const DS = () => sbx('return window.__labDirect.state()');
try { cmd.customSize(640, 360); cmd.size('custom'); } catch (err) { out.sizeError = err.message; }

const RED = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.3), new THREE.MeshBasicMaterial({ color: '#ff0000' }));
m.position.set(0.25, 0.5, 0);
scene.add(m);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
renderer.setAnimationLoop(() => renderer.render(scene, cam));
`;
const BLUE = `const c = document.createElement('canvas');
c.style.cssText = 'width:100%;height:100%';
document.body.append(c);
const g = c.getContext('2d');
function draw() { c.width = innerWidth; c.height = innerHeight; g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#0000ff'; g.fillRect(c.width * 0.67, c.height * 0.35, c.width * 0.16, c.height * 0.3); }
draw();
addEventListener('resize', draw);
`;
const layers = [ThreeLayers.defaults({ id: 'ldRed', name: 'Red', code: RED, slot: 0 }), ThreeLayers.defaults({ id: 'ldBlue', name: 'Blue', code: BLUE, slot: 1 })];
const sk = S.create({ name: 'Direct check', code: RED, layers, frame: '16:9', open: true });
await until(() => S.currentId() === sk.id && document.querySelectorAll('.ly-row[data-id]').length === 2, 15000);
await wait(2500);
const byId = (id) => GH.layers().find((L) => L.id === id);

const frameEl = () => [...document.querySelectorAll('.three-preview iframe')].find((f) => f.getBoundingClientRect().width > 0) || document.querySelector('.three-preview iframe');
const R = () => frameEl().getBoundingClientRect();
const at = (fx, fy) => { const r = R(); return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) }; };
const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
async function click(fx, fy, { count = 1, mods = 0 } = {}) {
  const p = at(fx, fy);
  await mouse({ type: 'mouseMoved', ...p, button: 'none', modifiers: mods });
  for (let i = 1; i <= count; i++) { await mouse({ type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: i, modifiers: mods }); await mouse({ type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: i, modifiers: mods }); }
  await wait(250);
}
// a real drag from (fx, fy) by (dfx, dfy) of the frame, mid: called while still held
async function drag(fx, fy, dfx, dfy, { steps = 12, mods = 0, mid = null, from = null } = {}) {
  const p = from || at(fx, fy); const r = R(); const dx = r.width * dfx; const dy = r.height * dfy;
  await mouse({ type: 'mouseMoved', ...p, button: 'none', modifiers: mods });
  await mouse({ type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
  for (let i = 1; i <= steps; i++) { await mouse({ type: 'mouseMoved', x: p.x + Math.round((dx * i) / steps), y: p.y + Math.round((dy * i) / steps), button: 'left', buttons: 1, modifiers: mods }); await wait(16); }
  const m = mid ? await mid() : null;
  await mouse({ type: 'mouseReleased', x: p.x + Math.round(dx), y: p.y + Math.round(dy), button: 'left', buttons: 0, clickCount: 1, modifiers: mods });
  await wait(300);
  return m;
}
const key = async (k, code, vk, mods = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods } }), wait(3000)]); await wait(60); };
// the merged picture (stills / renders draw it so): which color is at a point of the frame
async function colorAt(points) {
  const url = await Promise.race([D.shot(), wait(12000).then(() => null)]);
  if (!url) return points.map(() => '?');
  const img = new Image(); img.src = url; await img.decode();
  const n = 160; const c = document.createElement('canvas'); c.width = n; c.height = 90; const g = c.getContext('2d');
  g.drawImage(img, 0, 0, n, 90);
  return points.map(([fx, fy]) => { const d = g.getImageData(Math.round(fx * (n - 1)), Math.round(fy * 89), 1, 1).data; return d[0] > 150 && d[1] < 90 && d[2] < 90 ? 'R' : d[2] > 150 && d[0] < 90 && d[1] < 90 ? 'B' : '-'; });
}
const near = (a, b, e) => Math.abs(a - b) <= e;

// ---------- 1. click picks ----------
const first = await until(async () => (await colorAt([[0.25, 0.5], [0.75, 0.5]])).join('') === 'RB', 20000);
step('the scene draws a red square left and a blue one right', first, await colorAt([[0.25, 0.5], [0.75, 0.5]]));
GH.select('ldBlue'); await wait(200);
await click(0.25, 0.5);
let st = await DS();
step('a click on the red square picks its layer: the Lab selects it (Layers list), the outline shows around the square', st.sel === 'ldRed' && GH.selected() === 'ldRed' && st.shown && st.bb && near((st.bb.x0 + st.bb.x1) / 2 / st.W, 0.25, 0.03) && near((st.bb.x1 - st.bb.x0) / st.W, 0.16, 0.03), { sel: st.sel, lab: GH.selected(), shown: st.shown, bb: st.bb });
step('the WebGL layer shows ✥ 3D on its outline', st.three === true);
await click(0.5, 0.15);
st = await DS();
step('a click on nothing lets go (no outline)', !st.sel && !st.shown, st);

// ---------- 2. drag moves, one undo ----------
const steps0 = LabDirect.steps.length;
await drag(0.25, 0.5, 0.1, 0);
const L1 = byId('ldRed');
step('a drag of 10 % of the frame moves the layer: Move X ≈ 10, Move Y ≈ 0', near(L1.x || 0, 10, 1) && near(L1.y || 0, 0, 1), { x: L1.x, y: L1.y });
const moved = await colorAt([[0.25, 0.5], [0.35, 0.5]]);
step('the picture shows it moved (the merged picture: renders follow)', moved.join('') === '-R', moved);
step('one undo step for the whole drag', LabDirect.steps.length === steps0 + 1, LabDirect.steps);
await key('z', 'KeyZ', 90, 2);
await until(() => near(byId('ldRed').x || 0, 0, 0.01), 4000);
step('a real Ctrl+Z (keys on the picture) puts it back', near(byId('ldRed').x || 0, 0, 0.01), { x: byId('ldRed').x });
step('… and the picture too', (await colorAt([[0.25, 0.5]])).join('') === 'R');

// ---------- 3. Shift-drag snaps to the centre, with a guide ----------
// the square's middle is at 25 %: a drag of 24.5 % ends 0.5 % short of the centre: Shift snaps it on
const mid = await drag(0.25, 0.5, 0.245, 0, { mods: 8, mid: async () => ({ guides: (await DS()).guides, awake: (await sbx('return window.__labPace.state().doze')) }) });
const guides = mid?.guides;
const L2 = byId('ldRed');
step('Shift-drag snaps its middle onto the frame\'s centre (Move X = 25)', near(L2.x || 0, 25, 0.2), { x: L2.x });
step('a thin guide shows while it snaps, none after', guides?.[0] === true && !(await DS()).guides[0], guides);
step('the preview is awake while dragging (no doze)', mid?.awake && !mid.awake.on && mid.awake.why === 'dragging', mid?.awake);

// ---------- 4. arrows nudge, as one undo step ----------
const x0 = byId('ldRed').x || 0; const n0 = LabDirect.steps.length; const { W: PW, H: PH } = await DS();
for (let i = 0; i < 3; i++) await key('ArrowRight', 'ArrowRight', 39);
await key('ArrowDown', 'ArrowDown', 40, 8);
await wait(1100);
const L3 = byId('ldRed');
step('arrows nudge 1 px of the frame (×3), Shift+↓ 10 px', near((L3.x || 0) - x0, 300 / PW, 0.02) && near(L3.y || 0, 1000 / PH, 0.02), { dx: (L3.x || 0) - x0, y: L3.y, PW, PH });
step('a run of keys is one undo step', LabDirect.steps.length === n0 + 1, LabDirect.steps.length - n0);

// ---------- 5. corner scales about its middle, Alt+wheel scales ----------
const corner = await sbx(`const r = document.querySelector('#lab-direct [data-h="se"]').getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }`);
const s0 = byId('ldRed').scale ?? 1;
await drag(0, 0, 0.08, 0.08, { from: at(corner.x, corner.y) });
const L4 = byId('ldRed');
const stillThere = await colorAt([[0.5 + 3 / PW, 0.5 + 10 / PH]]);
step('a corner handle scales it up about its own middle (Move X / Y make up for the frame-centred scale)', (L4.scale ?? 1) > s0 * 1.3 && stillThere[0] === 'R' && (L4.x || 0) > 25.5, { scale: L4.scale, x: L4.x, y: L4.y, corner, stillThere });
const s1 = byId('ldRed').scale ?? 1;
const p = at(0.55, 0.53);
await mouse({ type: 'mouseMoved', ...p, button: 'none' });
for (let i = 0; i < 4; i++) { await mouse({ type: 'mouseWheel', ...p, deltaX: 0, deltaY: 100, modifiers: 1 }); await wait(40); }
await wait(700);
step('Alt+wheel scales it (down: smaller)', (byId('ldRed').scale ?? 1) < s1 - 0.1, { before: s1, after: byId('ldRed').scale });

// ---------- 6. Esc lets go; double-click opens the sliders ----------
await key('Escape', 'Escape', 27);
st = await DS();
step('Esc lets go', !st.sel && !st.shown);
cmd.panel(false); await wait(200);
await click(0.75, 0.5, { count: 2 });
await wait(400);
st = await DS();
const col = document.querySelector('.tw-column');
step('a double-click on the blue square picks it and opens its sliders', GH.selected() === 'ldBlue' && st.sel === 'ldBlue' && Boolean(col && !col.closest('[hidden]') && col.getBoundingClientRect().width > 0), { lab: GH.selected(), st });
step('a 2D-canvas layer has no ✥ 3D', st.three === false);

// ---------- 7. cost: nothing read while idle; the preview dozes again ----------
const s7 = await DS(); const dz0 = (await sbx('return window.__labPace.state().doze')).dozes;
await wait(11500); // (no evals meanwhile: they wake the preview; a still one dozes after 10 s)
const s8 = await DS(); const dz1 = await sbx('return window.__labPace.state().doze');
step('nothing reads the picture while idle; the still preview dozes again (after 10 s still)', s8.reads === s7.reads && (dz1.dozes > dz0 || dz1.on), { reads: [s7.reads, s8.reads], dozes: [dz0, dz1.dozes], why: dz1.why });

out.errors = errs.filter((m) => !/ResizeObserver/.test(m));
out.pass = out.problems.length === 0;
return JSON.stringify(out, null, 1);
