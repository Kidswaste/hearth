// Input → paint latency (round 38, inputlatency): how long from a real input (CDP Input.*, trusted, as the owner's
// keyboard, mouse and trackpad send them) to the next painted frame, for the everyday interactions, in the owner's
// look (Forgeheart) with a docked Three Director:
//   typing in the chat box (a short draft and a 30,000-character one), Enter to send (fake engine), Ctrl/⌘+K, a
//   right-click menu, ⋯ AI setup, clicking chats in the list, wheeling a long chat, dragging a Lab slider, orbiting the
//   Lab preview (right-drag), scrubbing the music timeline, dragging a gap in the grid view.
// Per interaction, two views of the same thing:
//   et     the Event Timing API in the page (PerformanceEventTiming): `duration` (input → the frame presented, 8 ms
//          steps) p50 / p95 over every event of the stretch's kinds (events under 16 ms aren't reported by the API:
//          they count as "< 16" through performance.eventCounts), processing time, and the slowest event
//   trace  the timeline trace's EventTiming (dev/trace-stats.js): input delay (waiting for the main thread), handlers,
//          presentation (last handler → the frame's commit), input → commit p50 / p95, and forced layouts in handlers
//   Lab slider → frame: for every value the slider took, the preview frames that ran after its pointer move until a
//   frame drew that value (1 = the very next preview frame), and the ms; orbit: pointer move → the next preview draw.
// Fails above the budgets (BUDGET below; window.IL_REPORT = 1 reports without failing, window.IL_ONLY = 'type,…').
// Xvfb is a 60 Hz display with software GL on shared CPUs: absolute ms carry up to a 16.7 ms vsync wait and the
// machine's load, so the budgets are loose (a real regression is several times over them, not a few ms).
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/inputlatency.js
const { wait, until } = M;
const TRACE = Boolean(window.IL_TRACE); // the timeline trace slows everything down: on to find causes, off for the numbers
const out = { budgets: {}, problems: [] };
const only = String(window.IL_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const claude = H.claudeAgent();
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(4000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const move = (x, y, button = 'none', buttons = 0) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button, buttons });
const click = async (x, y, button = 'left') => { await mouse('mousePressed', x, y, { button }); await mouse('mouseReleased', x, y, { button }); };
const wheel = (x, y, dy) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY: dy });
const KEYS = { Escape: [27, 'Escape'], Enter: [13, 'Enter'], Backspace: [8, 'Backspace'], ArrowDown: [40, 'ArrowDown'] };
async function key(k, modifiers = 0) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0], ...(k === 'Enter' ? { text: '\r' } : {}) } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : k === ' ' ? 'Space' : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...(modifiers ? {} : { text: k }) };
  await cdp('Input.dispatchKeyEvent', { type: (special && k !== 'Enter') || modifiers ? 'rawKeyDown' : 'keyDown', modifiers, ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...p });
}
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
// budgets, p95 ms: input → its handlers done (waiting for the page + the handlers: what Hearth's own code decides; the
// presentation after it is this machine's software compositor), the handlers alone (a 120 Hz frame for typing and
// drags, a 60 Hz one for what builds a surface), and the Lab slider in preview frames
const BUDGET = window.IL_BUDGET || { 'type-short': 50, 'type-long': 50, 'enter-send': 50, 'ctrl-k': 100, menu: 100, 'ai-setup': 150, 'chat-click': 150, sliderFramesP95: 2 };
const HANDLERS = window.IL_HANDLERS || { 'type-short': 8, 'type-long': 8, 'enter-send': 16, 'ctrl-k': 16, menu: 16, 'ai-setup': 24, 'chat-click': 40, scroll: 4, 'grid-gap': 8, 'lab-slider': 8, scrub: 8 };
out.budgets = { toHandled: BUDGET, handlers: HANDLERS };

// ---- Event Timing in the page: every event ≥ 16 ms (the API's floor), counts of all events per kind ----
const etEntries = [];
try { new PerformanceObserver((l) => etEntries.push(...l.getEntries())).observe({ type: 'event', durationThreshold: 16, buffered: false }); } catch (err) { out.problems.push(`no Event Timing: ${err.message}`); }
const counts = () => Object.fromEntries([...performance.eventCounts.entries()]);
const KINDS = {
  type: ['keydown', 'keypress', 'beforeinput', 'input', 'keyup'],
  click: ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'contextmenu'],
  drag: ['pointerdown', 'mousedown', 'pointermove', 'mousemove', 'pointerup', 'mouseup', 'input', 'change'],
  wheel: ['wheel'],
};
function etOf(from, to, c0, c1, kinds) {
  const e = etEntries.filter((x) => x.startTime >= from && x.startTime < to && kinds.includes(x.name));
  const total = kinds.reduce((a, k) => a + Math.max(0, (c1[k] || 0) - (c0[k] || 0)), 0);
  const durs = e.map((x) => x.duration).sort((a, b) => a - b);
  // p-th of all events: those the API didn't report were under 16 ms
  const at = (p) => { if (!total) return null; const rank = Math.floor(total * p); const under = total - durs.length; return rank < under ? '<16' : durs[Math.min(durs.length - 1, rank - under)]; };
  const proc = e.map((x) => x.processingEnd - x.processingStart);
  const worst = e.slice().sort((a, b) => b.duration - a.duration)[0];
  return { events: total, over16: durs.length, p50: at(0.5), p95: at(0.95), max: durs.at(-1) || '<16', procP95: pct(proc, 0.95), worst: worst ? `${worst.name} ${worst.duration}ms (delay ${r1(worst.processingStart - worst.startTime)} · handlers ${r1(worst.processingEnd - worst.processingStart)} · after ${r1(worst.startTime + worst.duration - worst.processingEnd)})` : null };
}
const num = (x) => (x === '<16' ? 15 : x);
// ---- every input → the next frame the page renders (Event Timing leaves out pointermove / wheel and everything under
// 16 ms): per trusted event, its timeStamp, when the page started handling it (a window capture listener, the first to
// run), when its handlers were done (a window bubble listener, the last), and the end of the first frame whose rAF ran
// after that (a message posted from rAF runs once the frame's style / layout / paint are done) ----
const probe = { on: false, ev: [], frames: [] };
const cur = new Map();
// an event stopped before it bubbled to the window: its handlers end with its task (a message posted at its start
// runs right after that task)
const endCh = new MessageChannel();
endCh.port1.onmessage = (m) => { for (const [e, x] of cur) if (x.id === m.data) { x.end = x.stopped || performance.now(); probe.ev.push(x); cur.delete(e); } };
// …or when a handler stopped it (the handlers after it on the same element aren't counted)
for (const fn of ['stopPropagation', 'stopImmediatePropagation']) {
  const orig = Event.prototype[fn];
  Event.prototype[fn] = function (...a) { const x = cur.get(this); if (x) x.stopped = performance.now(); return orig.apply(this, a); };
}
let evId = 0;
for (const t of [...new Set(Object.values(KINDS).flat())]) {
  addEventListener(t, (e) => {
    if (!probe.on || !e.isTrusted || cur.has(e)) return;
    const x = { id: ++evId, type: t, ts: e.timeStamp, start: performance.now() };
    // already stopped by a window listener that ran before this one (the menu's keys): its handlers are done
    if (e.cancelBubble) { x.end = x.start; probe.ev.push(x); return; }
    cur.set(e, x); endCh.port2.postMessage(x.id);
  }, { capture: true, passive: true });
  addEventListener(t, (e) => { const x = cur.get(e); if (x) { cur.delete(e); x.end = performance.now(); probe.ev.push(x); } }, { passive: true });
}
const flushCur = () => { for (const [e, x] of cur) if (performance.now() - x.start > 2000) { x.end = x.start; cur.delete(e); } };
const mc = new MessageChannel();
mc.port1.onmessage = (m) => { probe.frames.push([m.data, performance.now()]); };
const tick = () => { if (!probe.on) return; flushCur(); mc.port2.postMessage(performance.now()); requestAnimationFrame(tick); };
function probeOf() {
  flushCur();
  const F = probe.frames;
  const rows = probe.ev.map((x) => { const f = F.find((fr) => fr[0] >= x.end); return f ? { ...x, frame: f[1] } : null; }).filter(Boolean);
  const s = (fn) => { const a = rows.map(fn); return { p50: pct(a, 0.5), p95: pct(a, 0.95), max: a.length ? r1(Math.max(...a)) : null }; };
  const byType = {}; for (const x of rows) { const b = (byType[x.type] ||= { n: 0, handlersMax: 0 }); b.n += 1; b.handlersMax = Math.max(b.handlersMax, r1(x.end - x.start)); }
  const worst = rows.slice().sort((a, b) => (b.frame - b.ts) - (a.frame - a.ts))[0];
  return { rows, events: rows.length, types: byType, toFrame: s((x) => x.frame - x.ts), delay: s((x) => x.start - x.ts), handlers: s((x) => x.end - x.start), afterHandlers: s((x) => x.frame - x.end), worst: worst ? `${worst.type} ${r1(worst.frame - worst.ts)}ms (delay ${r1(worst.start - worst.ts)} · handlers ${r1(worst.end - worst.start)} · to the frame ${r1(worst.frame - worst.end)})` : null };
}

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// ---- chats: one of 300 messages, and some to click between ----
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}`;
const mk = async (title, n, ago = 100000) => {
  const at0 = Date.now() - ago;
  const c = { id: `il-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title, createdAt: at0, updatedAt: at0, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 100 })) };
  await window.hub.saveChat(c); Native.save(c); return c;
};
const big = await mk('IL long chat', 300, 1000);
const others = [await mk('IL chat A', 120, 50000), await mk('IL chat B', 60, 60000)];
activate(claude.id); await wait(400);
Native.open(claude.id, big.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 10000);
await wait(1200);

// first uses load their code (lazy groups, measured by the fastboot / lazy checks): each surface opens once before
const optBtn = () => [...Native.view(claude.id).root.querySelectorAll('.native-head button')].find((n) => n.getAttribute('aria-label') === 'Chat options' && n.getBoundingClientRect().width);
await key('k', 2); await until(() => document.querySelector('.palette-input'), 4000); await wait(1200); await key('Escape'); await wait(300);
await click(...mid(optBtn()), 'right'); await wait(800); await key('Escape'); await wait(300);
await click(...mid(optBtn())); await until(() => document.querySelector('.opt-sheet'), 6000); await wait(800); await click(...mid(optBtn())); await wait(500);
const segs = [];
const seg = async (name, kinds, fn) => {
  if (!want(name)) return;
  await settle();
  performance.mark(`hz240:${name}`); segs.push(name);
  const c0 = counts(); const from = performance.now();
  probe.ev = []; probe.frames = []; probe.on = true; requestAnimationFrame(tick);
  try { await fn(); } catch (err) { out.problems.push(`${name}: ${String(err.message || err).slice(0, 200)}`); }
  await settle(); await wait(120);
  probe.on = false;
  out[name] = { frame: probeOf(), et: etOf(from, performance.now(), c0, counts(), kinds) };
};

if (TRACE) await smoke({ trace: 'start', detail: true });
const t0 = performance.now();
const v = Native.view(claude.id);

await seg('type-short', KINDS.type, async () => {
  v.input.focus(); await settle();
  for (const ch of 'the quick brown fox jumps over the lazy dog and keeps going ') { await key(ch); await wait(6); }
  for (let i = 0; i < 12; i++) { await key('Backspace'); await wait(6); }
});
// a very long draft (pasted notes): 30,000 characters, then typing at its end
const longDraft = Array.from({ length: 300 }, (_, i) => `Line ${i} of a long pasted draft with plenty of words in it to wrap around.`).join('\n').slice(0, 30000);
await seg('type-long', KINDS.type, async () => {
  v.input.value = longDraft; v.input.dispatchEvent(new Event('input', { bubbles: true })); v.input.focus();
  v.input.setSelectionRange(v.input.value.length, v.input.value.length); await settle(); await wait(500);
  for (const ch of ' and then some more words typed at the end') { await key(ch); await wait(6); }
  for (let i = 0; i < 10; i++) { await key('Backspace'); await wait(6); }
});
v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true })); await wait(500);
await seg('enter-send', KINDS.type, async () => {
  for (let i = 0; i < 3; i++) {
    v.input.focus();
    for (const ch of `hello ${i}`) { await key(ch); await wait(6); }
    await key('Enter');
    await until(() => Native.isAgentBusy(claude.id), 4000);
    await until(() => !Native.isAgentBusy(claude.id), 30000);
    await wait(200);
  }
});
await seg('ctrl-k', [...KINDS.type, 'keydown'], async () => {
  for (let i = 0; i < 4; i++) {
    await key('k', 2); await until(() => document.querySelector('.palette-input'), 3000); await settle();
    for (const ch of 'dark') { await key(ch); await wait(30); }
    await key('ArrowDown'); await wait(30);
    await key('Escape'); await settle();
  }
});
await seg('menu', KINDS.click, async () => {
  const b = [...v.root.querySelectorAll('.native-head button')].find((n) => n.getAttribute('aria-label') === 'Chat options' && n.getBoundingClientRect().width);
  for (let i = 0; i < 4; i++) { await click(...mid(b), 'right'); await settle(); await key('Escape'); await settle(); }
});
await seg('ai-setup', KINDS.click, async () => {
  const b = [...v.root.querySelectorAll('.native-head button')].find((n) => n.getAttribute('aria-label') === 'Chat options' && n.getBoundingClientRect().width);
  await move(...mid(b)); await wait(600); // pointing fetches it (round 26)
  for (let i = 0; i < 4; i++) { await click(...mid(b)); await until(() => document.querySelector('.opt-sheet'), 4000); await settle(); await click(...mid(b)); await settle(); }
});
await seg('chat-click', KINDS.click, async () => {
  if (!H.panelOpen) { H.panelOpen = true; applyLayout(); await settle(); }
  for (let i = 0; i < 6; i++) {
    const c = [others[0], others[1], big][i % 3];
    const row = [...document.querySelectorAll('#panel .item')].find((r) => (r.dataset.key || '').includes(c.id));
    if (!row) throw new Error(`no row for ${c.title}`);
    row.scrollIntoView({ block: 'nearest' }); await settle(); await click(...mid(row)); await wait(450);
  }
});
// the wheel over a long chat must never wait for the page: no blocking (non-passive) wheel / touch listener on the
// messages or any box around them (window, document and body ones are passive by the browser's own rule)
async function blockingWheel(node) {
  const found = [];
  for (let n = node, i = 0; n && n !== document.body && n !== document.documentElement; n = n.parentElement, i++) {
    n.dataset.ilChain = String(i);
    const r = await cdp('Runtime.evaluate', { expression: `document.querySelector('[data-il-chain="${i}"]')` });
    delete n.dataset.ilChain;
    const id = r?.result?.objectId; if (!id) continue;
    const ls = (await cdp('DOMDebugger.getEventListeners', { objectId: id }))?.listeners || [];
    for (const l of ls) if (/^(wheel|mousewheel|touchstart|touchmove)$/.test(l.type) && !l.passive) found.push(`${l.type} on ${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} (${String(l.handler?.description || '').slice(0, 60)})`);
  }
  return found;
}
await seg('scroll', KINDS.wheel, async () => {
  Native.open(claude.id, big.id); await wait(600);
  out.scrollBlocking = await blockingWheel(v.list);
  if (out.scrollBlocking.length) out.problems.push(`blocking wheel / touch listeners around the chat: ${out.scrollBlocking.join(' · ')}`);
  const [x, y] = mid(v.list);
  for (let i = 0; i < 40; i++) { await wheel(x, y, i < 30 ? -120 : 120); await wait(12); }
});
if (want('grid-gap')) { H.grid = true; applyLayout(); await wait(3500); } // (the grid view mounts the windows it shows: they settle first)
await seg('grid-gap', KINDS.drag, async () => {
  const h = document.querySelector('.grid-handle.col');
  if (!h) { out.gridNote = `no handle (${H.railAgents().length} chats on the rail)`; return; }
  const [x, y] = mid(h);
  if (window.IL_DEBUG) out.gridNv = [...document.querySelectorAll('.nv')].map((n) => `${n.clientWidth}x${n.clientHeight} ${n.checkVisibility({ visibilityProperty: true })} ${n.closest('.surface')?.dataset?.id}`);
  await mouse('mousePressed', x, y);
  for (let i = 0; i < 40; i++) { await move(x + Math.round(Math.sin(i / 6) * 160), y, 'left', 1); await wait(8); }
  await mouse('mouseReleased', x, y); await wait(300);
});
if (want('grid-gap')) { H.grid = false; applyLayout(); await wait(400); }

// ---- the Lab: a scene with one slider ("Turn") that turns a knot; each preview frame notes what it drew ----
activate('tool:three'); await wait(500);
const lab = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(600); } return r; };
const sbxJson = (r) => { try { return typeof r === 'string' ? JSON.parse(r) : {}; } catch { return {}; } }; // (arrays from the preview are cut to 60 items: long ones come as text)
store.set('three.twLayout', 'sliders');
const SCENE = `import * as THREE from 'three';
const P = tweak({ turn: { value: 0.5, min: 0, max: 1, step: 0.001, label: 'Turn', group: 'Motion' } });
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 100, 16), new THREE.MeshNormalMaterial()); scene.add(knot);
renderer.setAnimationLoop(() => { knot.rotation.z = P.turn * 6.283; renderer.render(scene, camera); const L = window.__ilFrames; if (L) L.push([performance.timeOrigin + performance.now(), P.turn]); });`;
await d.newSketch('inputlatency scene', SCENE, 1);
await wait(2500);
try { lab.customSize(640, 360); lab.size('custom'); } catch { /* the frame size stays */ }
lab.panel(true); await wait(800);
// draws per frame in the preview (as labgestures does): orbit latency is pointer move → the next draw
const PROBE = `if (!window.__ilDraw) { const dp = window.__ilDraw = { at: [], last: -1, on: false };
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) { if (!P) continue;
    for (const m of ['drawArrays', 'drawElements']) { const f = P[m]; if (typeof f !== 'function') continue;
      P[m] = function (...a) { if (dp.on) { const t = document.timeline.currentTime; if (t !== dp.last) { dp.last = t; dp.at.push(performance.timeOrigin + performance.now()); } } return f.apply(this, a); }; } }
  window.__ilMoves = []; addEventListener('pointermove', (e) => { if (window.__ilDraw.on) __ilMoves.push(performance.timeOrigin + e.timeStamp); }, true);
  window.__ilET = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (window.__ilDraw.on) __ilET.push([e.name, e.duration, e.processingEnd - e.processingStart]); }).observe({ type: 'event', durationThreshold: 16 }); } catch {}
} return 1`;
await sbx(PROBE);

const L = H.surfaces.get('tool:three')?.el;
const turnRange = () => [...L.querySelectorAll('.tw-row')].find((r) => /^Turn$/.test(r.querySelector('.tw-name')?.textContent || ''))?.querySelector('.tw-range input[type=range]');
await until(() => turnRange()?.getBoundingClientRect().width > 40, 8000);
await seg('lab-slider', KINDS.drag, async () => {
  const range = turnRange();
  if (!range) throw new Error('no "Turn" slider in the panel');
  range.scrollIntoView({ block: 'center' }); await settle();
  // each value the slider takes (after its own handler: the detent may change it) ← the pointer move that made it, and
  // when the Lab had it (its handler done: the value is on its way to the preview); page time → absolute
  let lastMove = 0; const sent = [];
  const onMove = (e) => { lastMove = performance.timeOrigin + e.timeStamp; };
  const onInput = (e) => { if (e.target === range) sent.push([lastMove, Number(range.value), performance.timeOrigin + performance.now()]); };
  addEventListener('pointermove', onMove, true); addEventListener('input', onInput);
  await sbx(`window.__ilFrames = []; window.__ilGot = []; if (!window.__ilGotOn) { window.__ilGotOn = 1; addEventListener('message', (e) => { if (e.data?.type === 'tweak' && window.__ilGot) __ilGot.push(performance.timeOrigin + performance.now()); }); } return 1`);
  const r = range.getBoundingClientRect(); const y = r.top + r.height / 2;
  await mouse('mousePressed', r.left + 8, y);
  for (let k = 0; k < 2; k++) for (let i = 0; i <= 40; i++) { const f = k ? 1 - i / 40 : i / 40; await move(r.left + 8 + f * (r.width - 16), y, 'left', 1); await wait(10); }
  await mouse('mouseReleased', r.left + r.width / 2, y);
  await wait(600);
  removeEventListener('pointermove', onMove, true); removeEventListener('input', onInput);
  const got = sbxJson(await sbx('const f = window.__ilFrames; const g = window.__ilGot; window.__ilFrames = null; window.__ilGot = null; return JSON.stringify({ f, g })')); // (as text: arrays from the preview are cut to 60 items)
  const frames = Array.isArray(got.f) ? got.f : []; const arrive = Array.isArray(got.g) ? got.g : [];
  // for every value: preview frames that started after the Lab had it, up to the first that drew it (or a later value:
  // a newer move can replace one before the preview's next frame); 1 = the very next preview frame
  const lat = []; const ms = []; const msHad = []; const deliver = []; let missed = 0;
  const same = (a, b) => Math.abs(a - b) < 1e-6;
  for (let j = 0; j < sent.length; j++) {
    const [at, , had] = sent[j]; if (!at) continue;
    const later = sent.slice(j).map((s) => s[1]);
    const after = frames.filter((f) => f[0] >= had);
    const hit = after.findIndex((f) => later.some((x) => same(x, f[1])));
    if (hit < 0) { missed++; if (window.IL_DEBUG) (out.sliderMissed ||= []).push({ val: sent[j][1], had: Math.round(had % 100000), next: after.slice(0, 3).map((f) => [Math.round(f[0] % 100000), f[1]]), last: frames.slice(-2).map((f) => [Math.round(f[0] % 100000), f[1]]) }); continue; }
    lat.push(hit + 1); ms.push(after[hit][0] - at); msHad.push(after[hit][0] - had);
    const a = arrive.find((t) => t >= had); if (a) deliver.push(a - had);
  }
  out.sliderToFrame = { values: sent.length, framesP50: pct(lat, 0.5), framesP95: pct(lat, 0.95), framesMax: lat.length ? Math.max(...lat) : null, moveToFrameMsP50: pct(ms, 0.5), moveToFrameMsP95: pct(ms, 0.95), labToFrameMsP50: pct(msHad, 0.5), labToFrameMsP95: pct(msHad, 0.95), deliveryMsP50: pct(deliver, 0.5), deliveryMsP95: pct(deliver, 0.95), missed, previewFrames: frames.length };
});
await seg('orbit', KINDS.drag, async () => {
  const f = [...document.querySelectorAll('.three-preview iframe')].find((x) => x.getBoundingClientRect().width > 0);
  if (!f) throw new Error('no preview');
  const r = f.getBoundingClientRect(); const x0 = r.left + r.width / 2; const y0 = r.top + r.height / 2;
  await sbx('window.__ilDraw.at = []; window.__ilMoves = []; window.__ilET = []; window.__ilDraw.on = true; return 1');
  await move(x0, y0);
  await mouse('mousePressed', x0, y0, { button: 'right', buttons: 2 });
  for (let i = 1; i <= 40; i++) { await move(x0 + Math.sin(i / 5) * 120, y0 + Math.cos(i / 7) * 40, 'right', 2); await wait(12); }
  await mouse('mouseReleased', x0, y0, { button: 'right', buttons: 0 });
  await wait(500);
  const got = sbxJson(await sbx('window.__ilDraw.on = false; return JSON.stringify({ draws: __ilDraw.at, moves: __ilMoves, et: __ilET })'));
  const draws = got.draws || []; const lat = [];
  for (const m of got.moves || []) { const nd = draws.find((t) => t >= m); if (nd) lat.push(nd - m); }
  const etd = (got.et || []).map((e) => e[1]);
  out.orbitToDraw = { moves: (got.moves || []).length, draws: draws.length, msP50: pct(lat, 0.5), msP95: pct(lat, 0.95), previewEventsOver16: etd.length, previewEventMax: etd.length ? Math.max(...etd) : '<16' };
  await key('z', 1); // Shift+Z: the scene's own camera again
});
const songOk = want('scrub') && await lab.loadSong('/tmp/hearth-test-song.wav').then((x) => x?.ok !== false, () => false);
await wait(1500);
await seg('scrub', KINDS.drag, async () => {
  if (!songOk) throw new Error('no test song');
  const cv = [...L.querySelectorAll('canvas.mb-timeline')].find((c) => c.getBoundingClientRect().width > 40);
  if (!cv) throw new Error('no timeline');
  cv.scrollIntoView({ block: 'nearest' }); await settle();
  const r = cv.getBoundingClientRect(); const y = r.top + Math.min(20, r.height / 3);
  await mouse('mousePressed', r.left + 20, y);
  for (let k = 0; k < 2; k++) for (let i = 0; i <= 40; i++) { const f = k ? 1 - i / 40 : i / 40; await move(r.left + 20 + f * (r.width - 40), y, 'left', 1); await wait(10); }
  await mouse('mouseReleased', r.left + 20, y);
  await wait(300);
});
performance.mark('hz240:end');
await settle();
const tr = TRACE ? await smoke({ trace: 'stop', detail: true }) : {};
const dd = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
for (const n of segs) {
  const s = dd.segments?.[n]; if (!s || !out[n]) continue;
  const ph = s.phasesOfInput || {};
  out[n].trace = `inputs ${s.inputs} · input→commit p50 ${s.latency.p50} p95 ${s.latency.p95} max ${s.latency.max} · delay p50 ${ph.delay?.p50} p95 ${ph.delay?.p95} · handlers p50 ${ph.proc?.p50} p95 ${ph.proc?.p95} · presentation p50 ${ph.pres?.p50} p95 ${ph.pres?.p95} · work p95 ${s.work.p95} · forced ${s.forced.n}/${s.forced.ms}ms`;
  if (s.forced.n) out[n].forced = s.forced.top.slice(0, 3);
  out[n].scripts = s.scripts.slice(0, 3);
}
// ---- budgets: the app's part of each event (waiting for the page + its handlers), p95; the frame's presentation on
// this machine (a software display compositor) is reported, not judged ----
for (const n of segs) {
  const f = out[n]?.frame;
  if (!f?.events) continue;
  f.toHandled = { p50: pct(f.rows.map((x) => x.end - x.ts), 0.5), p95: pct(f.rows.map((x) => x.end - x.ts), 0.95) };
  if (BUDGET[n] != null && f.toHandled.p95 > BUDGET[n]) out.problems.push(`${n}: p95 input → handled ${f.toHandled.p95} ms > ${BUDGET[n]} ms`);
  if (HANDLERS[n] != null && f.handlers.p95 > HANDLERS[n]) out.problems.push(`${n}: p95 handlers ${f.handlers.p95} ms > ${HANDLERS[n]} ms`);
}
for (const n of segs) if (out[n]?.frame) delete out[n].frame.rows;
if (out.sliderToFrame) {
  if (!(out.sliderToFrame.framesP95 <= BUDGET.sliderFramesP95)) out.problems.push(`lab slider → frame p95 ${out.sliderToFrame.framesP95} frames > ${BUDGET.sliderFramesP95}`);
  if (out.sliderToFrame.missed > out.sliderToFrame.values * 0.1) out.problems.push(`lab slider: ${out.sliderToFrame.missed} of ${out.sliderToFrame.values} values never drawn`);
}
if (out.orbitToDraw && want('orbit') && !(out.orbitToDraw.draws > 0)) out.problems.push('orbit: the preview never drew while turning');
out.ok = !out.problems.length || Boolean(window.IL_REPORT);
if (!out.ok) throw new Error(`inputlatency: ${out.problems.length} problem(s): ${out.problems.join(' · ')}\n${JSON.stringify(out, null, 1)}`);
return JSON.stringify(out, null, 1);
