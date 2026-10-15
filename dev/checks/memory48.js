// memory48 (round 48): Hearth stays light over a long day. A compressed hour of the owner's use, after two warm-up
// rounds: 30 chat switches across 12 chats (two of them 1,000 messages, some with code), a fresh chat answered per
// round, Lab scene switches between six scenes (a lit template, textures + a render target, a 3D model layer, a video
// reference texture, kinetic type, a 1.5M-number point cloud), slider shuffles, renders tracked and the render panel,
// chat / Lab menus and right-click menus, the palette, dialogs, ⋯ AI setup, the board (notes added and removed),
// Astra's tools panel, ◉ Activity, toasts. The session keeps its data steady (made chats and board notes go again),
// so whatever still grows is a leak, not data.
// Every sample (after the warm-up and each round, the same state each time: the first chat on screen, the Lab hidden
// on its first scene) comes after forced GCs, per process:
//   window: JS heap, DOM nodes, JS listeners, detached nodes, window / document listeners, live observers, intervals
//     and object URLs (soak.js PROBE, by the line that added them), chats kept in memory, kept chat lists' nodes
//   Lab preview (its own process): JS heap + arrays, DOM nodes, __labMem(): GL objects / programs / textures,
//     three.js renderer.info geometries / textures, canvases, videos, object URLs, ImageBitmaps, layer modules
//   workers (Markdown, …): JS heap · GPU process: memory · main process: JS heap, timers / handles, memory
// Growth per hour = the least-squares slope over the counted rounds (ROUNDS rounds = an hour). Fails when a metric
// grows past its budget per hour, or a total is past its steady-state budget (BUDGET below).
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/memory48.js
//   localStorage.m48Rounds (an --eval) = counted rounds (default 3: 10 chat switches + 8 Lab switches each)
//   test media: /tmp/hearth-test-videos (dev/make-test-videos.sh, made by dev/run-checks.js)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const src = await hub.fs.read(`${SMOKE_DEV}/soak.js`);
const body = src.slice(src.indexOf('const PROBE = `') + 15, src.indexOf('})();`;', src.indexOf('const PROBE = `')) + 5);
const PROBE = body.replace(/\\\\/g, '\\');
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: PROBE } });
return 'probe installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = { samples: [], errs: {} }; const fails = [];
const P = window.__soakProbe;
if (!P) fails.push('the probe is in (reload with the counters)');
const cdp = (method, params = {}) => smoke({ cdp: method, params });
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const MB = (b) => (b == null ? null : r1(b / 1048576));
const ROUNDS = Number(localStorage.m48Rounds) || 3;
const VIDS = '/tmp/hearth-test-videos';
await until(() => H.config && H.claudeAgent?.() && typeof ThreeLab !== 'undefined', 60000);
const C = H.claudeAgent(); const A = Native.astraAgent?.();
const say = async (line, id = C.id) => { let text = ''; await Commands.tryRun(line, id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `error: ${e}`; } }); return text; };
async function act(name, fn) {
  try { await fn(); } catch (err) { (out.errs[name] ||= []).push(String(err?.message || err).slice(0, 160)); if (out.errs[name].length > 3) out.errs[name].shift(); }
  hideMenu?.(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
}
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra });
async function rclick(node) { const r = node.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 120); const y = r.top + Math.min(r.height / 2, 60); await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'right' }); await mouse('mouseReleased', x, y, { button: 'right' }); await wait(250); }
async function key(k, mods = 0) { const code = k.length === 1 ? `Key${k.toUpperCase()}` : k; await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mods, windowsVirtualKeyCode: k === 'Escape' ? 27 : k.toUpperCase().charCodeAt(0) }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods, windowsVirtualKeyCode: k === 'Escape' ? 27 : k.toUpperCase().charCodeAt(0) }); await wait(120); }

// ---------- the chats: 12, two of 1,000 messages, some with code ----------
const at0 = Date.now() - 86400000 * 3;
const para = (i, code) => `Reply ${i}: some **text** with \`code\` and a [link](https://example.com), a few more words so it wraps like a real answer.\n\n- one point\n- another *point*${code && i % 6 === 1 ? `\n\n\`\`\`js\n${Array.from({ length: 18 }, (_, k) => `const v${k} = scene.children[${k}]?.position.x * ${k}; // line ${k}`).join('\n')}\n\`\`\`` : ''}`;
const chatIds = [];
for (let k = 0; k < 12; k++) {
  const n = k < 2 ? 1000 : 80; const at = at0 + k * 60000;
  const c = { id: `m48-chat-${k}`, agentId: C.id, title: `M48 chat ${k}${k < 2 ? ' (long)' : ''}`, createdAt: at, updatedAt: at + n * 100, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i, k % 3 === 2) : `Question ${i} about the scene?`, at: at + i * 100 })) };
  await window.hub.saveChat(c); chatIds.push(c.id);
}
H.chats = await hub.listChats(); Panel.render?.();
activate(C.id); await until(() => Native.hasView(C.id)); await Native.open(C.id, chatIds[2]); await wait(600);

// ---------- the Lab: six scenes ----------
activate('tool:three'); await ThreeLab.cmd({ show: true }); await until(() => ThreeLab.scenes && ThreeLab.director, 30000);
const d = ThreeLab.director; const S = ThreeLab.scenes; const T = ThreeData.TEMPLATES;
const drawnWait = async (go) => {
  let drawn = false; const on = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn') drawn = true; };
  addEventListener('message', on); try { await go(); await until(() => drawn, 20000); } finally { removeEventListener('message', on); }
  await wait(500); return drawn;
};
const open = async (id) => (S.currentId() === id ? true : drawnWait(() => S.open(id)));
const texScene = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#c63'; g.fillRect(0, 0, 256, 256);
const ct = new THREE.CanvasTexture(cv); const dt = new THREE.DataTexture(new Uint8Array(256 * 256 * 4).fill(90), 256, 256); dt.needsUpdate = true;
const rt = new THREE.WebGLRenderTarget(256, 256); const rs = new THREE.Scene(); rs.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: dt })));
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 160, 16), new THREE.MeshBasicMaterial({ map: rt.texture })); scene.add(m);
const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: ct })); p.position.z = -1; scene.add(p);
renderer.setAnimationLoop((t) => { m.rotation.y = t / 2000; renderer.setRenderTarget(rt); renderer.render(rs, camera); renderer.setRenderTarget(null); renderer.render(scene, camera); });`;
const videoScene = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 3;
const tex = refTexture('clip'); const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex })); scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.z = Math.sin(t / 1500) * 0.2; renderer.render(scene, camera); });`;
const cloud = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const arr = new Float32Array(1500000); for (let k = 0; k < arr.length; k++) arr[k] = (Math.random() - 0.5) * 4;
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.02, color: 0xffcc88 })); scene.add(pts);
renderer.setAnimationLoop((t) => { pts.rotation.y = t / 3000; renderer.render(scene, camera); });`;
// a GLB (one little mesh with an animation clip, as in dev/soak-page.js)
function glb() {
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]); const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
  const t = new Float32Array([0, 1]); const tr = new Float32Array([0, 0, 0, 0, 0.5, 0]);
  const parts = [pos, idx, t, tr]; const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'm48bot' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] } }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }, { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' }],
    animations: [{ name: 'Bounce', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  return u;
}
const DIR = `${SMOKE_SAVES}/m48`; await hub.fs.write(`${DIR}/m48bot.glb`, glb());
const ids = {};
ids.cube = S.create({ name: 'M48 template', code: T[0].code }).id;
ids.tex = S.create({ name: 'M48 textures', code: texScene }).id;
ids.model = S.create({ name: 'M48 model', code: T[1].code }).id;
ids.video = S.create({ name: 'M48 video', code: T[0].code }).id;
ids.type = S.create({ name: 'M48 type', code: T[0].code }).id;
ids.cloud = S.create({ name: 'M48 cloud', code: cloud }).id;
await open(ids.model); await wait(1200);
out.setup = { model: (await say(`/model add ${DIR}/m48bot.glb`)).slice(0, 80) }; await wait(1500);
await open(ids.video); await wait(800);
try { await d.refs.add(`${VIDS}/square_loop.mp4`, 'clip'); await d.setCode(videoScene, 0); await wait(1500); out.setup.video = 'ok'; } catch (err) { out.setup.video = String(err.message || err); }
await open(ids.type); await wait(800);
try { await window.Lazy?.load('labkinetic').catch(() => {}); if (typeof LabKinetic !== 'undefined') { await LabKinetic.apply('pop-words', { text: 'LONG DAY' }); out.setup.type = 'ok'; } else out.setup.type = (await say('/text-moves countdown')).slice(0, 80); } catch (err) { out.setup.type = String(err.message || err); }
await wait(1500);
const ORDER = [ids.cube, ids.tex, ids.model, ids.video, ids.type, ids.cloud, ids.tex, ids.cube];

// ---------- a round: ≈ 20 minutes of the owner's day, compressed ----------
let made = []; let boardItems = []; let switches = 0; let labSwitches = 0;
async function chatsPart(r) {
  activate(C.id); await wait(300);
  for (let k = 0; k < 10; k++) { const id = chatIds[((r + 1) * 7 + k * 5) % 12]; await Native.open(C.id, id); switches += 1; await wait(300); }
  // a right-click on a reply, the chat's ⋯ menu
  const v = Native.view(C.id); const msg = [...v.list.querySelectorAll('.msg.assistant .body')].pop();
  if (msg) { msg.scrollIntoView({ block: 'center' }); await wait(80); await rclick(msg); await key('Escape'); }
  // a fresh chat answered (a streamed reply), then the same with Astra
  Native.newChat(C.id); await wait(200);
  Native.sendText(C.id, `hello ${r} code table`); await until(() => Native.isAgentBusy(C.id), 5000); await until(() => !Native.isAgentBusy(C.id), 60000);
  made.push(Native.current?.(C.id)?.id || H.activeChat?.[C.id]);
  if (A) {
    activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(200);
    Native.sendText(A.id, `astra ${r}`); await until(() => Native.isAgentBusy(A.id), 5000); await until(() => !Native.isAgentBusy(A.id), 60000);
    made.push(Native.current?.(A.id)?.id || H.activeChat?.[A.id]);
    // Astra's tools panel, opened and closed
    await Lazy.load('astraconnect'); AstraConnect.open(A.id); await until(() => document.querySelector('dialog.ac-dialog[open]'), 3000); await wait(300);
    document.querySelector('dialog.ac-dialog[open]')?.close(); await wait(150);
    activate(C.id); await wait(200);
  }
}
async function uiPart(r) {
  activate(C.id); await wait(200);
  // ⋯ AI setup, the palette, dialogs, toasts, ◉ Activity
  const b = Native.view(C.id)?.root.querySelector('.native-head button[aria-label="Chat options"]');
  if (b) { b.click(); await until(() => document.querySelector('aside.opt-sheet')); await wait(300); Options.hide?.(); await wait(200); }
  await key('k', 2); await wait(300); await cdp('Input.insertText', { text: ['lab', 'board', 'render'][r % 3] }); await wait(300); await key('Escape');
  const m1 = Modal.confirm('Long day', 'A dialog opened and closed.'); await wait(250); document.querySelector('dialog[open]')?.close(); await m1;
  const m2 = Modal.form('Long day form', [{ name: 'a', label: 'A', value: 'x' }, { name: 'b', label: 'B', type: 'select', options: ['1', '2'] }]); await wait(250); document.querySelector('dialog[open]')?.close(); await m2;
  for (let k = 0; k < 6; k++) { toast(`Long day toast ${r}.${k}`, k % 2 ? { type: 'error' } : {}); await wait(60); }
  await wait(600); document.querySelectorAll('.toast').forEach((t) => t.remove());
  showMenu(200, 200, [{ label: 'One', run: () => {} }, { label: 'More', items: [{ label: 'Two', run: () => {} }] }]); await wait(200); hideMenu();
  await Lazy.load('activity'); Activity.open(); await wait(600); Activity.close(); await wait(200);
  // the board: zoom, a note and a swatch added, old ones removed
  activate('tool:board'); await until(() => typeof Board !== 'undefined' && Board.isMounted?.() && Board.current?.(), 15000);
  const n = await Board.addNote(`long day ${r}`); if (n?.id) boardItems.push(n.id);
  const s = Board.addSwatch?.('#ff5a1f'); if (s?.id) boardItems.push(s.id);
  await wait(400); const node = [...document.querySelectorAll('.bd-vp .bd-item')].pop(); if (node) { await rclick(node); await key('Escape'); }
  Board.removeItems(boardItems.splice(0)); await wait(300);
  activate(C.id); await wait(200);
}
async function labPart(r) {
  activate('tool:three'); await ThreeLab.cmd(); await wait(300);
  for (const id of ORDER) { await open(id); labSwitches += 1; await wait(500); }
  await say('/shuffle subtle'); await wait(400);
  const pic = [...document.querySelectorAll('.three-preview')].find((x) => x.offsetParent);
  if (pic) { await rclick(pic); await key('Escape'); }
  // a render tracked, the renders panel
  const t = Renders.track({ kind: 'seq', title: `Long day render ${r}`, pk: `m48-${r}`, cancel: () => {} });
  for (let p = 20; p <= 100; p += 40) { t.progress(p, `${p}%`); await wait(100); }
  t.done(`/tmp/m48-${r}.mp4`); Renders.panel?.(); await wait(300); Renders.close?.();
  await open(ids.cube);
}
async function closeRound() {
  // the same last four chats every time: the kept chat lists (the 3 most recent + the one on screen) compare like with like
  activate(C.id); for (const k of [5, 4, 3, 2]) { await Native.open(C.id, chatIds[k]); await wait(400); }
  for (const id of made.splice(0)) if (id) await Native.remove(id).catch(() => {});
  document.querySelectorAll('.toast').forEach((t) => t.remove());
}

// ---------- a sample ----------
const targets = async () => ((await cdp('Target.getTargets')).targetInfos || []);
const listenersOn = async (expr) => { const w = await cdp('Runtime.evaluate', { expression: expr }); const r = await cdp('DOMDebugger.getEventListeners', { objectId: w.result.objectId }); return r.listeners?.length ?? null; };
async function sample(label) {
  hideMenu?.(); document.querySelectorAll('dialog[open]').forEach((x) => x.close());
  await wait(3500); // (the Lab empties a gone scene 2.5 s after it; its guard reads at 3 s)
  for (let i = 0; i < 3; i++) { await cdp('HeapProfiler.collectGarbage'); await smoke({ target: 'three-sandbox', cdp: 'HeapProfiler.collectGarbage', params: {} }); await wait(200); }
  const tg = await targets();
  const workers = {};
  for (const w of tg.filter((x) => /worker/.test(x.type))) { const k = w.url.replace(/^.*\//, '').slice(0, 40) || w.type; const h = await smoke({ target: w.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cdp: 'Runtime.getHeapUsage', params: {} }); workers[k] = MB(h.usedSize); }
  const hh = await cdp('Runtime.getHeapUsage'); const dom = await cdp('Memory.getDOMCounters');
  await cdp('DOM.enable'); const dd = (await cdp('DOM.getDetachedDomNodes')).detachedNodes || []; await cdp('DOM.disable');
  let detached = 0; const detachedBy = {}; for (const n of dd) { const t = n.treeNode || {}; const a = t.attributes || []; const k = `${(t.nodeName || '?').toLowerCase()}${a.includes('class') ? `.${String(a[a.indexOf('class') + 1]).split(' ')[0]}` : ''}`; const c = 1 + (n.retainedNodeIds?.length || 0); detachedBy[k] = (detachedBy[k] || 0) + c; detached += c; }
  const ph = await smoke({ target: 'three-sandbox', cdp: 'Runtime.getHeapUsage', params: {} });
  const pdom = await smoke({ target: 'three-sandbox', cdp: 'Memory.getDOMCounters', params: {} });
  await smoke({ target: 'three-sandbox', cdp: 'DOM.enable', params: {} });
  const pdd = (await smoke({ target: 'three-sandbox', cdp: 'DOM.getDetachedDomNodes', params: {} })).detachedNodes || [];
  await smoke({ target: 'three-sandbox', cdp: 'DOM.disable', params: {} });
  for (const n of pdd) { const t = n.treeNode || {}; const a = t.attributes || []; const k = `lab:${(t.nodeName || '?').toLowerCase()}${a.includes('class') ? `.${String(a[a.indexOf('class') + 1]).split(' ')[0]}` : ''}${a.includes('style') ? '[style]' : ''}`; detachedBy[k] = (detachedBy[k] || 0) + 1 + (n.retainedNodeIds?.length || 0); }
  const lab = (await d.evalInSketch('return window.__labMem ? window.__labMem() : null'))?.value || null;
  const labDom = (await d.evalInSketch("const o = {}; for (const e of document.querySelectorAll('*')) { const k = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''); o[k] = (o[k] || 0) + 1; } return o"))?.value || {};
  const bg = await hub.bgState(); const procs = {}; for (const p of bg.procs) { const k = p.type === 'Utility' ? `Utility:${p.name}` : p.type; procs[k] = (procs[k] || 0) + p.mb; }
  const live = P.live(); const kept = Native._test?.kept?.() || {};
  const s = {
    label,
    win: { heapMB: MB(hh.usedSize), nodes: dom.nodes, listeners: dom.jsEventListeners, docs: dom.documents, detached, winL: await listenersOn('window'), docL: await listenersOn('document'), observers: live.observers, intervals: live.intervals, urls: live.urls, keptLists: kept.lists, keptNodes: kept.nodes, maps: Native._test?.maps?.() || null },
    lab: { heapMB: MB(ph.usedSize), arraysMB: MB(ph.backingStorageSize), nodes: pdom.nodes, listeners: pdom.jsEventListeners, glObjects: lab?.gl?.objects, programs: lab?.gl?.programs, glTextures: lab?.gl?.textures, contexts: (lab?.gl?.contexts || 0) + (lab?.gl?.pooled || 0), geometries: lab?.three?.geometries, textures: lab?.three?.textures, canvases: lab?.canvases, videos: lab?.videos, videosPlaying: lab?.videosPlaying, urls: lab?.objectURLs, bitmaps: lab?.bitmaps, modules: lab?.layerUrls, intervals: lab?.intervals },
    workers, gpuMB: procs.GPU || 0, main: { ...(bg.main || {}), mb: procs.Browser || 0 }, rendererMB: procs.Tab || 0, procMB: Object.values(procs).reduce((a, b) => a + b, 0), procN: bg.procs.length,
    topListeners: Object.entries(live.byListener).sort((a, b) => b[1] - a[1]).slice(0, 40), detachedBy, labDom, topObservers: live.topObservers, topIntervals: live.topIntervals, byDom: live.byDom,
  };
  out.samples.push(s);
  return s;
}

// ---------- the day ----------
const tStart = performance.now();
await closeRound();
await sample('start');
// two warm-up rounds (what loads on first use: AI setup, the renders panel, Astra's sheets, the board) then the counted ones
for (let r = -1; r <= ROUNDS; r++) {
  await act('chats', () => chatsPart(r));
  await act('ui', () => uiPart(r));
  await act('lab', () => labPart(r));
  await closeRound();
  if (r >= 0) await sample(r === 0 ? 'warm' : `round ${r}`);
}
out.ms = Math.round(performance.now() - tStart);
// localStorage.m48Snap = a folder: heap snapshots of the window and the Lab preview at the end (who keeps what)
if (localStorage.m48Snap) { await smoke({ snapshot: `${localStorage.m48Snap}/m48-window.heapsnapshot` }); await smoke({ snapshot: `${localStorage.m48Snap}/m48-lab.heapsnapshot`, target: 'three-sandbox' }); }
out.switches = { chats: switches, lab: labSwitches };

// ---------- growth per hour (slope over warm … round N, after two warm-up rounds; ROUNDS rounds = an hour) and the verdict ----------
const counted = out.samples.slice(1);
const slope = (f) => { const ys = counted.map(f); if (ys.some((y) => y == null)) return null; const n = ys.length; const mx = (n - 1) / 2; const my = ys.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; }); return den ? r1((num / den) * ROUNDS) : 0; };
const M = {
  'window heap MB': (s) => s.win.heapMB, 'window DOM nodes': (s) => s.win.nodes, 'window JS listeners': (s) => s.win.listeners, 'window detached nodes': (s) => s.win.detached,
  'window+document listeners': (s) => s.win.winL + s.win.docL, 'observers': (s) => s.win.observers, 'intervals': (s) => s.win.intervals, 'window object URLs': (s) => s.win.urls, 'kept chat list nodes': (s) => s.win.keptNodes, 'chats in memory': (s) => s.win.maps?.chats ?? null, 'per-chat maps': (s) => (s.win.maps ? Object.values(s.win.maps).reduce((a, b) => a + b, 0) : null),
  'Lab heap MB': (s) => s.lab.heapMB, 'Lab arrays MB': (s) => s.lab.arraysMB, 'Lab DOM nodes': (s) => s.lab.nodes, 'Lab GL objects': (s) => s.lab.glObjects, 'Lab programs': (s) => s.lab.programs,
  'Lab geometries': (s) => s.lab.geometries, 'Lab textures': (s) => s.lab.textures, 'Lab object URLs': (s) => s.lab.urls, 'Lab layer modules': (s) => s.lab.modules,
  'workers heap MB': (s) => Object.values(s.workers).reduce((a, b) => a + (b || 0), 0), 'GPU process MB': (s) => s.gpuMB, 'main heap MB': (s) => s.main.heapMB, 'main timers': (s) => s.main.timers, 'all processes MB': (s) => s.procMB,
};
// growth budgets per hour (after the warm-up) and steady-state totals (measured round 48: 4 CPUs, software GL)
const GROW = { 'window heap MB': 4, 'window DOM nodes': 1500, 'window JS listeners': 150, 'window detached nodes': 1500, 'window+document listeners': 6, observers: 3, intervals: 2, 'window object URLs': 2, 'kept chat list nodes': 4000, 'chats in memory': 2, 'per-chat maps': 4,
  'Lab heap MB': 6, 'Lab arrays MB': 8, 'Lab DOM nodes': 300, 'Lab GL objects': 80, 'Lab programs': 8, 'Lab geometries': 20, 'Lab textures': 10, 'Lab object URLs': 2, 'Lab layer modules': 2,
  'workers heap MB': 4, 'main heap MB': 12, 'main timers': 6 };
const TOTAL = { 'window heap MB': 60, 'window DOM nodes': 40000, 'Lab heap MB': 60, 'Lab arrays MB': 40, 'Lab GL objects': 900, 'Lab programs': 60, 'Lab object URLs': 12, 'kept chat list nodes': 20000, 'workers heap MB': 30, 'main heap MB': 80 };
const end = out.samples.at(-1); const s0 = out.samples[0];
out.perHour = {}; out.table = [];
for (const [k, f] of Object.entries(M)) {
  const g = slope(f); out.perHour[k] = g;
  out.table.push(`${k.padEnd(26)} start ${String(f(s0)).padStart(7)} · end ${String(f(end)).padStart(7)} · per hour ${g == null ? '–' : (g > 0 ? '+' : '') + g}`);
  if (GROW[k] != null && g != null && g > GROW[k]) fails.push(`${k} grows ${g}/h (budget ${GROW[k]}/h)`);
  if (TOTAL[k] != null && f(end) != null && f(end) > TOTAL[k]) fails.push(`${k} at ${f(end)} (budget ${TOTAL[k]})`);
}
if (end.lab.videosPlaying > 1) fails.push(`Lab videos still playing while hidden: ${end.lab.videosPlaying}`);
if (end.lab.bitmaps > 8) fails.push(`Lab ImageBitmaps open: ${end.lab.bitmaps}`);
// (round 48) gone layers' boxes and three.js canvases kept alive (by OrbitControls the page tracked, or by a stopped
// run's error stack): 16 boxes and 20 canvases after this session before the fix, none after
const goneOf = (re) => Object.entries(end.detachedBy).filter(([k]) => re.test(k)).reduce((a, [, n]) => a + n, 0);
if (goneOf(/^lab:div\.lab-layer/) > 4) fails.push(`gone Lab layers' boxes still alive: ${goneOf(/^lab:div\.lab-layer/)} nodes`);
if (goneOf(/^lab:canvas\[style\]/) > 4) fails.push(`gone Lab renderers' canvases still alive: ${goneOf(/^lab:canvas\[style\]/)}`);
// where it grows (from the warm sample to the end): listeners by the line that added them, detached DOM by class
const w = out.samples[1];
const diff = (x, y) => { const o = {}; for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) { const dd = (y?.[k] || 0) - (x?.[k] || 0); if (Math.abs(dd) >= 3) o[k] = dd; } return o; };
out.where = { listeners: diff(Object.fromEntries(w.topListeners), Object.fromEntries(end.topListeners)), detached: diff(w.detachedBy, end.detachedBy), labDom: diff(w.labDom, end.labDom), dom: diff(w.byDom, end.byDom), observers: end.topObservers, intervals: end.topIntervals };
out.steady = { windowHeapMB: end.win.heapMB, windowNodes: end.win.nodes, labHeapMB: end.lab.heapMB, labArraysMB: end.lab.arraysMB, gpuMB: end.gpuMB, mainHeapMB: end.main.heapMB, allProcessesMB: end.procMB, workers: end.workers };
for (const s of out.samples) { delete s.topListeners; delete s.byDom; delete s.labDom; s.detachedBy = Object.fromEntries(Object.entries(s.detachedBy).filter(([, n]) => n >= 50)); }
if (Object.keys(out.errs).length) out.notes = out.errs; delete out.errs;
// clean up what this check made
for (const id of Object.values(ids)) if (id !== ids.cube) try { S.remove(id); } catch { /* gone */ }
out.pass = !fails.length; out.fails = fails;
return JSON.stringify(out, null, 1);
