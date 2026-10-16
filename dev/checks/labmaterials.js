// ◉ Looks for 3D things (round 50, labmaterials): a three.js layer with a red ball and a blue box (primitives) and a 🧊
// model made here. A real click picks the ball on the picture, the outline's ◉ Look › opens the picker (16 balls drawn
// by the preview's shared renderer, kept); pointing at a ball tries it on the thing (nothing saved), a click uses it
// (the pixels change: chrome is grey, gold is yellow, neon glows), one Ctrl/⌘+Z each (a real key), one part only
// (neon on the box), color + shine from /material, the look kept with the scene (switch away and back), the render
// (export page) = the preview, a model (its whole: not its ground) and one undo, three_do material, Lab search,
// the scene outline the directors read, a 📜 recipe step's words, and nothing running while the picker is closed.
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/labmaterials.js --shot /tmp/labmaterials.png
const DIR = '/tmp/hearth-labmaterials';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], problems: [] };
const step = (label, ok, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const errs = []; addEventListener('error', (e) => errs.push(e.message));
const CA = H.claudeAgent();
const say = async (line) => { let text = ''; let err = ''; await Commands.tryRun(line, CA.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { err = String(e); } }); return err || text; };

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && typeof LabDirect !== 'undefined' && window.LabMatHook, 60000);
const cmd = await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.groupsHost);
const S = ThreeLab.scenes; const D = ThreeLab.director; const GH = ThreeLab.groupsHost;
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
const LK = () => sbx('return window.__labLook ? window.__labLook.state() : null');
try { cmd.customSize(640, 360); cmd.size('custom'); } catch (err) { out.sizeError = err.message; }

const SHAPES = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#202024');
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
cam.position.set(0, 0, 7);
scene.add(new THREE.AmbientLight('#ffffff', 0.6));
const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(2, 3, 4); scene.add(sun);
const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: '#ff2020', roughness: 0.6 }));
ball.name = 'Ball'; ball.position.x = -1.6; scene.add(ball);
const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#2040ff', roughness: 0.6 }));
box.name = 'Box'; box.position.x = 1.6; box.rotation.set(0.5, 0.6, 0); scene.add(box);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
renderer.setAnimationLoop(() => renderer.render(scene, cam));
`;
const layers = [ThreeLayers.defaults({ id: 'lmShapes', name: 'Shapes', code: SHAPES, slot: 0 })];
const sk = S.create({ name: 'Looks check', code: SHAPES, layers, frame: '16:9', open: true });
await until(() => S.currentId() === sk.id && document.querySelectorAll('.ly-row[data-id]').length === 1, 15000);
await wait(2000);
const L0 = () => GH.layers().find((L) => L.id === 'lmShapes');
const look = () => JSON.stringify(L0()?.overrides?.['@look'] || null);

const frameEl = () => [...document.querySelectorAll('.three-preview iframe')].find((f) => f.getBoundingClientRect().width > 0) || document.querySelector('.three-preview iframe');
const R = () => frameEl().getBoundingClientRect();
const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
async function clickAt(p, mods = 0) {
  await mouse({ type: 'mouseMoved', ...p, button: 'none', modifiers: mods });
  await mouse({ type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
  await mouse({ type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1, modifiers: mods });
  await wait(250);
}
const at = (fx, fy) => { const r = R(); return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) }; };
const center = (node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
const key = async (k, code, vk, mods = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods } }), wait(3000)]); await wait(200); };
// pixels of a picture (a data URL or PNG bytes) at points of the frame (an average of a 5×5 patch)
async function pixelsOf(src, points) {
  const bmp = typeof src === 'string' ? await (async () => { const i = new Image(); i.src = src; await i.decode(); return i; })() : await createImageBitmap(new Blob([src], { type: 'image/png' }));
  const w = 320; const h = 180; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, w, h);
  return points.map(([fx, fy]) => { const d = g.getImageData(Math.round(fx * w) - 2, Math.round(fy * h) - 2, 5, 5).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map((x) => Math.round(x / 25)); });
}
const shot = () => Promise.race([D.shot(), wait(12000).then(() => null)]);
const BALL = [0.323, 0.5]; const BOX = [0.677, 0.5];
const px = async (points = [BALL, BOX]) => { const u = await shot(); return u ? pixelsOf(u, points) : points.map(() => [0, 0, 0]); };
const red = (c) => c[0] > 110 && c[0] > c[1] * 2 && c[0] > c[2] * 2;
const grey = (c) => Math.max(...c) - Math.min(...c) < 45 && Math.max(...c) > 25;
const yellow = (c) => c[0] > 60 && c[0] >= c[1] && c[1] > c[2] * 1.3 && c[2] < c[1] * 0.75;
const green = (c) => c[1] > 120 && c[1] > c[0] * 1.6 && c[1] > c[2] * 1.2;
const blue = (c) => c[2] > 100 && c[2] > c[0] * 1.6;

try {
  // ---------- 0. as it is ----------
  let p0 = null;
  await until(async () => { p0 = await px(); return red(p0[0]) && blue(p0[1]); }, 20000);
  step('the scene draws a red ball (left) and a blue box (right)', red(p0[0]) && blue(p0[1]), p0);

  // ---------- 1. pick the ball on the picture, ◉ Look › on its outline ----------
  await clickAt(at(...BALL));
  const chip = await until(async () => { const r = await sbx('const b = document.querySelector("#lab-direct .ld-look"); if (!b || b.hidden || document.querySelector("#lab-direct").hidden) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 };'); return r?.x ? r : null; }, 8000);
  step('a click on the ball picks its layer; its outline shows ◉ Look ›', Boolean(chip) && GH.selected() === 'lmShapes', chip);
  const k = R().width / (frameEl().offsetWidth || R().width);
  if (chip) await clickAt({ x: Math.round(R().left + chip.x * k), y: Math.round(R().top + chip.y * k) });
  const card = await until(() => LabMaterials?.card?.pop?.isConnected && LabMaterials.card, 15000).catch(() => null);
  step('◉ Look › opens the picker: 16 balls, on the part that was clicked (the ball)', Boolean(card) && card.pop.querySelectorAll('.lm-ball').length === 16 && card.target?.path === '#Ball', { path: card?.target?.path, n: card?.pop?.querySelectorAll('.lm-ball').length });
  const pics = await until(() => [...document.querySelectorAll('.lm-pick .lm-pic')].every((p) => /url\(/.test(p.style.backgroundImage)), 90000); // (SwiftShader here: each ball's shaders compile on the CPU)
  step('the balls are drawn (one picture from the preview\'s shared small renderer, one ball at a time)', Boolean(pics) && LabMaterials.stats.thumbs === 1, { ...LabMaterials.stats, ms: (await LK())?.thumbMs });
  const atlas = await LabMaterials.balls('');
  if (atlas?.url) {
    const cell = (i) => [((i % atlas.cols) + 0.5) / atlas.cols, (Math.floor(i / atlas.cols) + 0.5) / Math.ceil(atlas.n / atlas.cols)];
    const ids = MatCore.PRESETS.map((p) => p.id);
    const [ch, go, ne, cl] = await pixelsOf(atlas.url, ['chrome', 'gold', 'neon', 'clay'].map((x) => cell(ids.indexOf(x))));
    step('the balls look different: chrome grey, gold yellow, neon pink, clay pale', grey(ch) && yellow(go) && ne[0] > 120 && ne[2] > 80 && ne[1] < ne[0] * 0.6 && cl[0] > 100 && Math.abs(cl[0] - cl[1]) < 50, { ch, go, ne, cl });
  } else step('the balls look different', false, 'no atlas');
  const tile = (id) => document.querySelector(`.lm-pick .lm-ball[data-k="${id}"]`);

  // ---------- 2. point = try (nothing saved), click = use ----------
  await mouse({ type: 'mouseMoved', ...center(tile('gold')), button: 'none' }); await wait(700);
  let st = await LK(); let p1 = await px();
  step('pointing at Gold tries it on the ball (yellow), nothing saved', st?.layers?.[0]?.trying?.spec?.k === 'gold' && yellow(p1[0]) && look() === 'null', { trying: st?.layers?.[0]?.trying, p: p1[0], look: look() });
  await mouse({ type: 'mouseMoved', x: 5, y: 5, button: 'none' }); await wait(700);
  st = await LK(); p1 = await px();
  step('pointing away: the ball is red again', !st?.layers?.[0]?.trying && red(p1[0]), p1[0]);
  const u0 = LabDirect.steps.length;
  await clickAt(center(tile('chrome')));
  await until(() => look() !== 'null', 4000); await wait(600);
  st = await LK(); p1 = await px();
  step('a click on Chrome uses it on the ball only: kept with the layer, the ball is grey, the box stays blue', look() === '{"#Ball":{"k":"chrome"}}' && grey(p1[0]) && blue(p1[1]), { look: look(), p: p1 });
  step('a metal in a scene without an environment gets the built-in studio light', st?.layers?.[0]?.env === true && st.layers[0].meshes === 1, st?.layers?.[0]);
  step('one undo step', LabDirect.steps.length === u0 + 1, LabDirect.steps.slice(-1));

  // ---------- 3. whole layer, undo with the real keys ----------
  [...card.pop.querySelectorAll('.lm-chip')].find((b) => /Whole/.test(b.textContent))?.click();
  await clickAt(center(tile('gold')));
  await wait(700); p1 = await px();
  step('Whole layer: Gold on every mesh (ball and box yellow), the ball keeps its own Chrome', look() === '{"#Ball":{"k":"chrome"},"*":{"k":"gold"}}' && grey(p1[0]) && yellow(p1[1]), { look: look(), p: p1 });
  LabMaterials.close(); await wait(200);
  step('Esc / ✕ closes the picker; nothing is being tried', !document.querySelector('.lm-pick') && !(await LK())?.layers?.[0]?.trying);
  document.querySelector('.three-preview')?.focus?.();
  frameEl().focus(); await wait(100);
  await key('z', 'KeyZ', 90, navigator.platform.includes('Mac') ? 4 : 2);
  await wait(700); p1 = await px();
  step(`${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z takes the last look back (one step): the box is blue again, the ball still chrome`, look() === '{"#Ball":{"k":"chrome"}}' && blue(p1[1]) && grey(p1[0]), { look: look(), p: p1 });
  LabDirect.undo(); await wait(700); p1 = await px();
  step('another undo: the ball is red again, no look left', look() === 'null' && red(p1[0]), { look: look(), p: p1[0] });

  // ---------- 4. one part from code paths; /material with color + shine ----------
  LabMaterials.apply(LabMaterials.target({ layer: 'lmShapes', path: '#Box' }), { k: 'neon', c: '#00ff40' });
  const said = await say('/material chrome shine 90');
  await wait(900); p1 = await px();
  step('neon in green on the box only, /material chrome on the whole layer: the box glows green, the ball is chrome', green(p1[1]) && grey(p1[0]) && /Chrome/.test(said), { p: p1, said, look: look() });
  const said2 = await say('/material frosted glass #88ccff shine 40');
  step('/material frosted glass #88ccff shine 40: color and shine kept', JSON.parse(look())?.['*']?.k === 'frosted' && JSON.parse(look())?.['*']?.c === '#88ccff' && JSON.parse(look())?.['*']?.s === 0.4, { said: said2, look: look() });
  await say('/material chrome'); await wait(900);

  // ---------- 5. the render (export page) = the preview ----------
  const pv = await px();
  let still = null;
  try { still = await LabExport.render({ format: 'still', size: '640x360', at: 0, source: 'scene', quiet: true }); } catch (e) { still = { error: e.message }; }
  let rp = null;
  if (still?.path) { const u8 = await window.hub.fs.read(still.path, { encoding: 'buffer' }); rp = await pixelsOf(u8, [BALL, BOX]); }
  const dist = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
  step('a render (export page) draws the same looks as the preview', Boolean(rp) && grey(rp[0]) && green(rp[1]) && dist(rp[0], pv[0]) < 50 && dist(rp[1], pv[1]) < 60, { preview: pv, render: rp, still: still?.path || still });

  // ---------- 6. kept with the scene: away and back ----------
  const saved = JSON.stringify(S.get(sk.id)?.layers?.find((L) => L.id === 'lmShapes')?.overrides?.['@look'] || null);
  const other = S.create({ name: 'Looks check (other)', code: 'document.body.style.background = "#000";', open: true });
  await until(() => S.currentId() === other.id, 8000); await wait(1200);
  S.open(sk.id);
  await until(() => S.currentId() === sk.id, 8000);
  let back = null;
  await until(async () => { back = await px(); return grey(back[0]) && green(back[1]); }, 20000);
  step('saved with the scene: after switching away and back the ball is chrome, the box green', saved === look() && grey(back[0]) && green(back[1]), { saved, back });

  // ---------- 7. the directors ----------
  const r1 = await HubBridge.call('three_do', { cmd: 'material', op: 'set', layer: 'Shapes', preset: 'velvet', color: '#ff00aa' });
  const r2 = await HubBridge.call('three_do', { cmd: 'material', op: 'info' });
  step('three_do material: set velvet on the layer, info lists it', r1?.ok && JSON.parse(look())?.['*']?.k === 'velvet' && /Velvet/.test(JSON.stringify(r2?.value)), { r1: r1?.value || r1?.error, r2: r2?.value || r2?.error });
  const outline = JSON.stringify(D.layers ? D.layers() : null);
  step('the scene outline the directors read names the materials', /"materials"/.test(outline) && /Velvet/.test(outline) && !/"@look"/.test(outline), outline.slice(0, 300));
  step('a 📜 recipe step reads in plain words', typeof RecipeCore === 'undefined' || /◉ Look: Velvet/.test(RecipeCore.describe({ k: 'mat', spec: { k: 'velvet' }, layer: 'Shapes' })));

  // ---------- 8. a 🧊 model: its whole (not its ground) ----------
  const glb = () => {
    const pos = new Float32Array([-1, 0, 0.6, 1, 0, 0.6, 0, 1.6, 0, 0, 0, -1]);
    const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
    const b = new Uint8Array(pos.byteLength + idx.byteLength); b.set(new Uint8Array(pos.buffer), 0); b.set(new Uint8Array(idx.buffer), pos.byteLength);
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'pyramid' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.85, 0.5, 0.2, 1] } }],
      buffers: [{ byteLength: b.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-1, 0, -1], max: [1, 1.6, 0.6] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] };
    let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jp).fill(0x20)]);
    const bp = (4 - (b.length % 4)) % 4; const bin = new Uint8Array(b.length + bp); bin.set(b);
    const total = 28 + js.length + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
    dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
    return u;
  };
  await hub.fs.write(`${DIR}/pyramid.glb`, glb());
  const addSaid = await say(`/model add ${DIR}/pyramid.glb`);
  const ML = await until(() => GH.layers().find((L) => /pyramid/.test(L.name)), 20000);
  const loaded = await until(async () => { const r = await HubBridge.call('three_eval', { code: 'return JSON.stringify(lab3d.list())' }); return /"loaded":true/.test(r?.value?.result || r?.value || ''); }, 25000);
  step('a 🧊 model layer loads', Boolean(ML && loaded), addSaid);
  // hide the shapes so only the model counts
  if (ML) {
    const hid = await HubBridge.call('three_update_layer', { layer: 'Shapes', settings: { visible: false } });
    if (!hid?.ok) out.hide = hid?.error;
    await wait(1000);
    const greenCount = async () => { const u = await shot(); if (!u) return -1; const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 160, 90); const d = g.getImageData(0, 0, 160, 90).data; let n = 0; for (let j = 0; j < d.length; j += 4) if (d[j + 1] > 120 && d[j + 1] > d[j] + 25 && d[j + 1] > d[j + 2] + 25) n += 1; return n; };
    const g0 = await greenCount();
    const u1 = LabDirect.steps.length;
    LabMaterials.apply(LabMaterials.target({ layer: ML.id }), { k: 'neon', c: '#00ff40' });
    let g1 = 0; await until(async () => { g1 = await greenCount(); return g1 > g0 + 40; }, 10000);
    const lst = await LK(); const mst = lst?.layers?.find((x) => x.id === ML.id);
    if (!(g1 > g0 + 40)) { const u = await shot(); if (u) await hub.fs.write(`${DIR}/model-fail.png`, Uint8Array.from(atob(u.split(',')[1]), (ch) => ch.charCodeAt(0))); out.modelDebug = { list: (await HubBridge.call('three_eval', { code: 'return JSON.stringify(lab3d.list())' }))?.value, layers: GH.layers().map((L) => [L.name, L.visible]) }; }
    step('a look on the whole model (#Model): the model glows green, its ground keeps its own', JSON.stringify(ML.overrides?.['@look']) === '{"#Model":{"k":"neon","c":"#00ff40"}}' && g1 > g0 + 40 && mst?.meshes === 1, { g0, g1, look: ML.overrides?.['@look'], meshes: mst?.meshes });
    LabDirect.undo(); let g2 = 0; await until(async () => { g2 = await greenCount(); return g2 < g0 + 20; }, 10000);
    step('one undo: the model has its own material again', !ML.overrides?.['@look'] && LabDirect.steps.length === u1 && g2 < g0 + 20, { g2 });
  }

  // ---------- 9. Lab search; nothing running while closed ----------
  if (typeof Lazy !== 'undefined') await Lazy.load('labsearch');
  if (typeof LabSearch !== 'undefined') {
    LabSearch.open({ query: 'chrome' }); await wait(800);
    const found = async (q, re) => { LabSearch.input().value = q; LabSearch.input().dispatchEvent(new Event('input')); await wait(300); const top = (LabSearch.results || []).slice(0, 8); return { ok: top.some((r) => re.test(`${r.path || ''} › ${r.label}`)), top: top.slice(0, 4).map((r) => `${r.path || ''} › ${r.label}`) }; };
    const fM = await found('material', /◉ Material|Pick a look/); const fC = await found('chrome', /◉ Material › Chrome$/); const fG = await found('glass', /◉ Material › Glass$/);
    LabSearch.close();
    step('Lab search: "material", "chrome" and "glass" find the ◉ Material rows', fM.ok && fC.ok && fG.ok, { material: fM.top, chrome: fC.top, glass: fG.top });
  }
  const s1 = await LK(); await wait(3000); const s2 = await LK();
  step('with the picker closed nothing is tried and the looks cost a lookup every 30 frames at most', !document.querySelector('.lm-pick') && s2.layers.every((x) => !x.trying) && s2.scans - s1.scans <= 14, { scans: s2.scans - s1.scans });
} catch (err) { step('the check ran', false, String(err?.stack || err).slice(0, 600)); }

out.errors = errs.filter((m) => !/ResizeObserver/.test(m));
out.pass = out.problems.length === 0;
return JSON.stringify(out, null, 1);
