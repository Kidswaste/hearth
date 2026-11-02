// (round 108, projaudit108) helpers shared by the app runs of dev/checks/projaudit108.js (given to dev/smoke.js with
// --lib: they run before each script part). Fixtures only, made in the run's own temp folder; never real data.
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, ms = 10000, every = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: ran to the end`, false, String(err?.stack || err).slice(0, 700)); } for (const d of document.querySelectorAll('dialog[open]')) { try { d.close(); } catch { /* */ } } try { hideMenu?.(); } catch { /* */ } };
const cdp = (method, params = {}) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const visible = (n) => { if (!n || !n.isConnected) return false; const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
// a real mouse click in the middle of a node (CDP), or a right-click
async function click(node, { right = false } = {}) {
  if (typeof node === 'string') node = document.querySelector(node);
  if (!node) throw Error('nothing to click');
  node.scrollIntoView?.({ block: 'nearest' }); await frame();
  const r = node.getBoundingClientRect(); const x = Math.round(r.left + Math.min(r.width / 2, 40)); const y = Math.round(r.top + r.height / 2);
  const button = right ? 'right' : 'left';
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, buttons: right ? 2 : 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1, buttons: 0 });
  await wait(120);
}
const key = async (k, { ctrl = false } = {}) => {
  const codes = { Enter: 13, Escape: 27, ArrowDown: 40, k: 75 };
  const base = { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: codes[k] || 0, modifiers: ctrl ? 2 : 0 };
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await wait(80);
};
const typeText = (text) => cdp('Input.insertText', { text });
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()) && visible(b));
const pickMenu = async (re, ms = 4000) => { await until(() => menuItem(re), ms); const b = menuItem(re); if (b) await click(b); return Boolean(b); };
const card = () => document.querySelector('dialog.pb-card[open]');
const deskName = () => document.querySelector('.pj-home .pj-p-name')?.textContent || '';
const nameBtn = () => document.querySelector('.workspace-switcher .workspace-project-name');
const deskDots = () => [...document.querySelectorAll('.pj-home .pj-p-actions button')].find((b) => b.textContent.trim() === '⋯');
// the Desk's ⋯ opened (the Desk paints in the coming frame: a node may be redrawn under the pointer; tried again)
const openDots = async () => { for (let i = 0; i < 4; i++) { await wait(250); const d = deskDots(); if (!d) continue; d.scrollIntoView({ block: 'center' }); await wait(200); await click(deskDots()); if (await until(() => document.querySelectorAll('#menu button').length && visible(document.querySelector('#menu button')), 1500)) return true; } return false; };
const size = async (p) => (p ? (await hub.fs.stat(p).catch(() => null))?.size ?? -1 : -1);
const onDesk = async (id) => { if (ProjectWorkspace.current()?.id !== id) await ProjectWorkspace.open(id); await ProjectWorkspace.go('overview'); return until(() => visible(document.querySelector('.pj-home .pj-p-name')) && deskName() === Projects.get(id)?.name, 20000); };
const fileRow = async (re) => { const d = document.querySelector('.pj-home .pw-project-files'); if (d && !d.open) { d.open = true; await wait(200); } await until(() => [...document.querySelectorAll('.pj-home .pw-project-files .pj-item')].some((r) => re.test(r.textContent)), 6000); return [...document.querySelectorAll('.pj-home .pw-project-files .pj-item')].find((r) => re.test(r.textContent)) || null; };
const timed = async (fn) => { const t = performance.now(); const r = await fn(); return { r, ms: Math.round(performance.now() - t) }; };

// ---------- the model fixture: a .gltf cube, its .bin in buffers/, its colour picture in textures/ (a space in its
// name), its emissive picture a folder up (../shared/): labmodels99's car ----------
const RED = [230, 20, 20]; const YELLOW = [250, 240, 10];
const png = async (rgb, n = 8) => { const c = new OffscreenCanvas(n, n); const g = c.getContext('2d'); g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, n, n); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
function cube() {
  const P = []; const U = []; const I = [];
  const faces = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]]];
  for (const [n, up] of faces) {
    const r = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
    const b = P.length / 3;
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(...[0, 1, 2].map((k) => 0.5 * (n[k] + s * r[k] + t * up[k]))); U.push((s + 1) / 2, (1 - t) / 2); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { P: new Float32Array(P), U: new Float32Array(U), I: new Uint16Array(I) };
}
function cubeGltf(images) {
  const c = cube();
  const parts = [new Uint8Array(c.P.buffer), new Uint8Array(c.U.buffer), new Uint8Array(c.I.buffer)];
  let off = 0; const views = []; const chunks = []; const pad = (n) => (n + 3) & ~3;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); chunks.push(p, new Uint8Array(pad(p.length) - p.length)); off += pad(p.length); }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, emissiveTexture: { index: 1 }, emissiveFactor: [0, 0, 0] }],
    textures: images.map((_, i) => ({ source: i })), images: images.map((uri) => ({ uri })),
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, { bufferView: 1, componentType: 5126, count: 24, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }],
    bufferViews: views, buffers: [{ uri: 'buffers/car.bin', byteLength: bin.length }] };
  return { json, bin };
}
async function makeCar(dir) {
  const car = cubeGltf(['textures/paint%20red.png', '../shared/glow.png']);
  await hub.fs.write(`${dir}/car/car.gltf`, JSON.stringify(car.json, null, 2)); await hub.fs.write(`${dir}/car/buffers/car.bin`, car.bin);
  await hub.fs.write(`${dir}/car/textures/paint red.png`, await png(RED)); await hub.fs.write(`${dir}/shared/glow.png`, await png(YELLOW));
  return `${dir}/car/car.gltf`;
}
// the Lab's preview page: a model layer loaded (lab3d.list), its textures' texels read back from the graphics card
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await ThreeLab.director.evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error })); if (!r?.error) return r; await wait(400); } return r; };
const modelLoaded = (name) => until(async () => { const l = await sbx(`return JSON.stringify((globalThis.lab3d?.list() || []).find((x) => x.name === ${JSON.stringify(name)}) || null)`); const v = typeof l === 'string' ? JSON.parse(l) : null; return v && (v.loaded || v.error) ? v : null; }, 40000, 300);
const PIX = (layer) => `const e = window.__scenes[${JSON.stringify(layer)}] || Object.values(window.__scenes).find((x) => x?.id === ${JSON.stringify(layer)}); if (!e) return JSON.stringify({ error: 'no layer ' + Object.keys(window.__scenes).join(',') });
const r = e.renderer; const gl = r.getContext(); const maps = {};
e.scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'emissiveMap']) if (m[k] && !maps[k]) maps[k] = m[k]; });
const texel = (tex) => { const p = r.properties.get(tex); if (!p?.__webglTexture) return 'not on the graphics card'; const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, p.__webglTexture, 0); const px = new Uint8Array(4); gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState(); return Array.from(px); };
r.render(e.scene, e.camera);
return JSON.stringify({ map: maps.map ? texel(maps.map) : 'no map', emissiveMap: maps.emissiveMap ? texel(maps.emissiveMap) : null, maps: Object.keys(maps) });`;
const pixels = async (layer) => { const v = await until(async () => { const s = await sbx(PIX(layer)); const j = typeof s === 'string' ? JSON.parse(s) : null; return j && Array.isArray(j.map) && Array.isArray(j.emissiveMap) ? j : null; }, 20000, 400); return v || JSON.parse((await sbx(PIX(layer))) || '{}'); };
const near = (px, rgb, tol = 40) => Array.isArray(px) && rgb.every((c, i) => Math.abs(px[i] - c) <= tol);
const layerNamed = (sid, name) => ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid) || {}).find((L) => L.name === name) || null;
const allCode = (x) => (x ? ThreeLab.scenes.layersOf(x).map((L) => L.code).join('\n/*-*/\n') : null);
const histCodes = async (id) => { const v = await ThreeLab.scenes.versionsOf(id); return JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, l]) => [k === id ? 'main' : k.slice(id.length + 1), l.map((x) => x.code)]).sort((x, y) => (x[0] < y[0] ? -1 : 1)))); };
