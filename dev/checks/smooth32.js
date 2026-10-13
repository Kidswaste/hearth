// Smoothness after rounds 26–31 (round 32, smooth32): the everyday stretches, driven with real input events (CDP)
// under a timeline trace (dev/trace-stats.js, the hz240 machinery), in the owner's look:
//   typing in the composer of a 300-message chat, a streamed reply (fake engine, "long") in that chat, ⋯ AI setup ×5,
//   switching chats from the chats list ×6, the grid view (4 chats) with a column handle dragged, and the Lab on screen
//   (a busy scene) while its docked director chat streams a reply.
// Plus counts the timeline can't attribute: DOM mutations per streamed piece, and page listeners on window.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth32.js
const { wait, until } = M;
const out = {};
const claude = H.claudeAgent();
const cdp = (method, params) => smoke({ cdp: method, params });
const press = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
const release = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
const move = (x, y, button = 'none') => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button });
const click = async (x, y) => { await press(x, y); await release(x, y); };
const KEYS = { Escape: [27, 'Escape'], Backspace: [8, 'Backspace'] };
async function key(k) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0] } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), text: k };
  await cdp('Input.dispatchKeyEvent', { type: special ? 'rawKeyDown' : 'keyDown', ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// ---- the Lab: a docked director (as the owner has) and a busy scene, left loaded ----
if (!H.agents().some((a) => a.dock === 'three' && a.mode === 'native')) {
  H.config.agents.push({ id: 's32director', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', enabled: true });
  await saveConfig(); await wait(1500);
}
activate('tool:three'); await wait(400);
await ThreeLab.cmd();
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 160, 24), new THREE.MeshNormalMaterial()); scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.x = t / 900; mesh.rotation.y = t / 700; renderer.render(scene, camera); });`;
await ThreeLab.director.newSketch('smooth32 busy', BG, 3);
await wait(2000);

// ---- chats: one of 300 messages, three of 120 (to switch between) ----
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}`;
const mk = async (title, n) => {
  const at0 = Date.now() - 100000;
  const c = { id: `s32-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title, createdAt: at0, updatedAt: at0, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 100 })) };
  await window.hub.saveChat(c); Native.save(c); return c;
};
const big = await mk('S32 long chat', 300);
const others = [await mk('S32 chat A', 120), await mk('S32 chat B', 120)];
activate(claude.id); await wait(400);
Native.open(claude.id, big.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 10000);
await wait(1500);

const segs = [];
const seg = async (name, fn) => { performance.mark(`hz240:${name}`); segs.push(name); try { await fn(); } catch (err) { out[`${name}Error`] = String(err.message || err); } await settle(); };
const winListeners = async () => {
  const w = await cdp('Runtime.evaluate', { expression: 'window' });
  const r = await cdp('DOMDebugger.getEventListeners', { objectId: w.result.objectId });
  return r.listeners?.length ?? null;
};
// a reply streaming in `agentId`'s chat: DOM mutations per streamed text change (MutationObserver on the document)
const streamIn = async (agentId, text) => {
  let muts = 0; const by = {};
  const lbl = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; return e ? `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}` : '?'; };
  const mo = new MutationObserver((rs) => { muts += rs.length; for (const r of rs) { const k = `${r.type}:${lbl(r.target)}`; by[k] = (by[k] || 0) + 1; } });
  mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const t = performance.now();
  Native.sendText(agentId, text);
  await until(() => Native.isAgentBusy(agentId), 5000);
  await until(() => !Native.isAgentBusy(agentId), 60000);
  mo.disconnect();
  return { ms: Math.round(performance.now() - t), muts, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v}× ${k}`) };
};
const lw0 = await winListeners().catch(() => null);
await smoke({ trace: 'start', detail: true });
const t0 = performance.now();

await seg('idle', () => wait(1500));
await seg('type', async () => {
  const v = Native.view(claude.id); v.input.focus(); await settle();
  for (const c of 'the quick brown fox jumps over the lazy dog and keeps going ') { await key(c); await wait(4); }
  for (let i = 0; i < 12; i++) { await key('Backspace'); await wait(4); }
});
(() => { const v = Native.view(claude.id); v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true })); })();
await seg('stream', async () => { out.streamChat = await streamIn(claude.id, 'long table please'); });
await seg('ai-setup', async () => {
  const b = [...Native.view(claude.id).root.querySelectorAll('.native-head button')].find((n) => n.textContent.trim() === '⋯' && n.getBoundingClientRect().width);
  for (let i = 0; i < 5; i++) {
    await click(...mid(b)); await until(() => document.querySelector('.opt-sheet'), 4000); await settle();
    const s = document.querySelector('.opt-sheet'); const r = s.getBoundingClientRect();
    for (let y = r.top + 6; y < Math.min(r.bottom, innerHeight) - 6; y += 14) { await move(Math.round(r.left + r.width / 2), Math.round(y)); await wait(4); }
    await click(...mid(b)); await settle();
  }
});
await seg('switch-chats', async () => {
  if (!H.panelOpen) { H.panelOpen = true; applyLayout(); await settle(); }
  for (let i = 0; i < 6; i++) {
    const c = [others[0], others[1], big][i % 3];
    const row = [...document.querySelectorAll('#panel .item')].find((r) => (r.dataset.key || '').includes(c.id));
    if (row) { row.scrollIntoView({ block: 'nearest' }); await settle(); await click(...mid(row)); } else Native.open(claude.id, c.id);
    await wait(400);
  }
});
await seg('grid', async () => {
  H.grid = true; applyLayout(); await wait(500);
  const h = document.querySelector('.grid-handle.col');
  if (!h) { out.gridNote = `no handle (${H.railAgents().length} chats on the rail)`; return; }
  const [x, y] = mid(h);
  await press(x, y);
  for (let i = 0; i < 40; i++) { await move(x + Math.round(Math.sin(i / 6) * 160), y, 'left'); await wait(8); }
  await release(x, y); await wait(300);
  H.grid = false; applyLayout(); await wait(300);
});
await seg('lab-stream', async () => {
  const dir = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
  activate('tool:three'); await wait(800);
  if (!dir) { out.labNote = 'no director'; return; }
  Tools.syncDocks?.(); Native.newChat(dir.id); await wait(300);
  out.streamLab = await streamIn(dir.id, 'long please');
});
// the Lab on screen playing the director chat's own scene (a new chat gets a keyframed orb): what runs per second
await seg('lab-playing', async () => {
  let muts = 0; const mo = new MutationObserver((rs) => { muts += rs.length; });
  mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  await wait(3000); mo.disconnect();
  out.labPlayingMutsPerSec = Math.round(muts / 3);
});
await seg('idle-after', () => wait(1500));
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const dd = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
out.all = `tasks>4.2ms ${dd.tasks?.over4} (>8.3 ${dd.tasks?.over8}, >50 ${dd.tasks?.over50}, max ${dd.tasks?.maxMs}) · frames ${dd.frames?.n} over4.2 ${dd.frames?.over4} over8.3 ${dd.frames?.over8} p95 ${dd.frames?.p95} · forced ${dd.forced?.n}/${dd.forced?.ms}ms · style ${dd.style?.n}× ${dd.style?.elements}el ${dd.style?.ms}ms · layout ${dd.layout?.n}× ${dd.layout?.objects}obj ${dd.layout?.ms}ms`;
const line = (s) => `in ${s.inputs} · work p50 ${s.work.p50} p95 ${s.work.p95} max ${s.work.max} (>4.2: ${s.work.over4}) · frames ${s.frames.n} >4.2 ${s.frames.over4} >8.3 ${s.frames.over8} worst ${s.frames.worst} · tasks>4.2 ${s.longTasks.over4} max ${s.longTasks.max} · style ${s.style.n}×${s.style.elements}el ${s.style.ms}ms · layout ${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms · forced ${s.forced.n}/${s.forced.ms}ms`;
out.segments = {};
for (const n of segs) { const s = dd.segments?.[n]; if (!s) continue; out.segments[n] = line(s); out.segments[`${n} time`] = `${s.phases} · scripts: ${s.scripts.join(' | ')}`; if (s.forced.n) out.segments[`${n} forced`] = s.forced.top.join(' | '); }
const lw1 = await winListeners().catch(() => null);
out.windowListeners = `${lw0} → ${lw1}`;
const broken = Object.keys(out).filter((k) => k.endsWith('Error'));
if (broken.length) throw new Error(`smooth32: ${broken.map((k) => `${k}: ${out[k]}`).join(' · ')}`);
return JSON.stringify(out, null, 1);
