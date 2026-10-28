// Smoothness after rounds 25–26 (round 26, smooth26): the everyday stretches the new work touches, driven with real
// input events (CDP) under a timeline trace (dev/trace-stats.js, the hz240 machinery), in the owner's look:
//   idle with a busy Lab scene (a physics + a kinetic type layer) left behind a chat, the Lab hidden (should cost ~0),
//   wheeling a 300-message chat, typing in the chat box, opening ⋯ (AI setup) and ◎ (Missions) 5× each, switching
//   windows (chat → Lab → board → chat), and the Lab on screen with that scene.
// Plus page listeners on window before / after ⋯ and ◎ were opened and closed 5× each.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth26.js
const { wait, until } = M;
const out = {};
const claude = H.claudeAgent();
const cdp = (method, params) => smoke({ cdp: method, params });
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
const click = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const wheel = (x, y, dy) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
const KEYS = { Escape: [27, 'Escape'], Backspace: [8, 'Backspace'] };
async function key(k) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0] } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), text: k };
  await cdp('Input.dispatchKeyEvent', { type: special ? 'rawKeyDown' : 'keyDown', ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const railBtn = (id) => RAIL.button(id); // (round 74) today's rail: dev/checks/rail-lib.js

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// ---- the Lab: a busy scene (physics + kinetic type over a plain background) ----
activate('tool:three'); await wait(400);
await ThreeLab.cmd();
const d = ThreeLab.director;
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
await d.newSketch('smooth26 busy', BG, 3);
try { await LabPhysics.add('bounce'); } catch (err) { out.physicsError = String(err.message || err); }
try { await LabType.add('title', { text: 'SMOOTH 240', sliders: { hold: 0, start: 0 } }); } catch (err) { out.typeError = String(err.message || err); }
await wait(2500);

// ---- a 300-message chat ----
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}`;
const at0 = Date.now() - 1000;
const big = { id: `s26-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'S26 long chat', createdAt: at0, updatedAt: at0, messages: Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 1000 })) };
await window.hub.saveChat(big); Native.save(big);
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
const lw0 = await winListeners().catch(() => null);
await smoke({ trace: 'start', detail: true });
const t0 = performance.now();

// the Lab behind a chat: nothing should run
await seg('idle-lab-hidden', () => wait(2000));
await seg('scroll-chat', async () => { const [x, y] = mid(Native.view(claude.id).list); for (let i = 0; i < 40; i++) { await wheel(x, y, i < 30 ? -120 : 120); await wait(10); } });
await seg('type', async () => {
  const v = Native.view(claude.id); v.input.focus(); await settle();
  for (const c of 'the quick brown fox jumps over the lazy dog and keeps going ') { await key(c); await wait(4); }
  for (let i = 0; i < 12; i++) { await key('Backspace'); await wait(4); }
});
await (async () => { const v = Native.view(claude.id); v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true })); v.input.blur(); })();
// ⋯ (AI setup): open, point down it, close, 5 times (the first one loads it)
await seg('ai-setup', async () => {
  const b = [...Native.view(claude.id).root.querySelectorAll('.native-head button')].find((n) => n.textContent.trim() === '⋯' && n.getBoundingClientRect().width);
  for (let i = 0; i < 5; i++) {
    await click(...mid(b)); await until(() => document.querySelector('.opt-sheet'), 4000); await settle();
    const s = document.querySelector('.opt-sheet'); const r = s.getBoundingClientRect();
    for (let y = r.top + 6; y < Math.min(r.bottom, innerHeight) - 6; y += 14) { await move(Math.round(r.left + r.width / 2), Math.round(y)); await wait(4); }
    await click(...mid(b)); await settle();
  }
});
// ◎ (Missions): open, point across the cards, Esc, 5 times
await seg('missions', async () => {
  if (H.activeId !== claude.id) { activate(claude.id); await settle(); await wait(300); } // (round 74) its chat on screen
  const b = Native.view(claude.id).root.querySelector('.ms-btn');
  for (let i = 0; i < 5; i++) {
    await click(...mid(b)); await settle();
    const p = document.querySelector('.ms-pop'); const r = p.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom - 6; y += 10) { await move(Math.round(r.left + (y % 3 + 1) * r.width / 4), Math.round(y)); await wait(4); }
    await key('Escape'); await settle();
  }
  await move(700, 400);
});
// switching windows: chat → Lab → board → chat, twice
await seg('switch', async () => {
  for (let i = 0; i < 2; i++) for (const id of ['tool:three', 'tool:board', claude.id]) { const b = railBtn(id); if (b) await click(...mid(b)); else activate(id); await wait(350); }
});
await seg('idle-after', () => wait(2000));
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const dd = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
out.all = `tasks>4.2ms ${dd.tasks?.over4} (>8.3 ${dd.tasks?.over8}, >50 ${dd.tasks?.over50}, max ${dd.tasks?.maxMs}) · frames ${dd.frames?.n} over4.2 ${dd.frames?.over4} over8.3 ${dd.frames?.over8} p95 ${dd.frames?.p95} · forced ${dd.forced?.n}/${dd.forced?.ms}ms · style ${dd.style?.n}× ${dd.style?.elements}el ${dd.style?.ms}ms · layout ${dd.layout?.n}× ${dd.layout?.objects}obj ${dd.layout?.ms}ms`;
const line = (s) => `in ${s.inputs} · work p50 ${s.work.p50} p95 ${s.work.p95} max ${s.work.max} (>4.2: ${s.work.over4}) · frames ${s.frames.n} >4.2 ${s.frames.over4} >8.3 ${s.frames.over8} worst ${s.frames.worst} · tasks>4.2 ${s.longTasks.over4} max ${s.longTasks.max} · style ${s.style.n}×${s.style.elements}el ${s.style.ms}ms · layout ${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms · forced ${s.forced.n}/${s.forced.ms}ms`;
out.segments = {};
for (const n of segs) { const s = dd.segments?.[n]; if (!s) continue; out.segments[n] = line(s); out.segments[`${n} time`] = `${s.phases} · scripts: ${s.scripts.join(' | ')}`; if (s.forced.n) out.segments[`${n} forced`] = s.forced.top.join(' | '); }
// page listeners on window after ⋯ / ◎ were opened and closed 5× each (left-behind handlers grow this)
const lw1 = await winListeners().catch(() => null);
out.windowListeners = `${lw0} → ${lw1}`;
out.lazyOptions = Lazy.state().find((g) => g.name === 'options');
const broken = Object.keys(out).filter((k) => k.endsWith('Error'));
if (broken.length) throw new Error(`smooth26: ${broken.map((k) => `${k}: ${out[k]}`).join(' · ')}`);
return JSON.stringify(out, null, 1);
