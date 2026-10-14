// Smoothness after rounds 33–40 (round 41, smooth41): what the newest always-on parts cost in the everyday stretches,
// driven with real input (CDP) under a timeline trace (dev/trace-stats.js), in the owner's look, with a docked Three
// Director and a busy Lab scene loaded:
//   idle in a chat · a long paste (a "Pasted text" chip: attachlean measures it) then typing beside the chip · a long
//   streamed reply in a 300-message chat · three short replies under two quiet notes (chatcalm folds them) · idle with a
//   tip waiting for another place (the hints queue) · the Lab on screen while its director streams · a Lab slider drag
//   · the Lab playing its chat's keyframed scene · idle on the Lab.
// Per stretch: script time per file (a11y.js, native.js, hints.js, attachlean.js, powerwise.js…), timers / idle
// callbacks / rAF fired, forced style / layout, long tasks, plus DOM mutations per streamed reply and what the page's
// whole-document observers were handed. Budgets (window.S41_REPORT = 1 reports without failing) guard what round 41
// fixed: a11y's naming pass during a stream and on the Lab, the paste's long task, the hints queue's ticks while a tip
// waits, chatcalm's line per reply.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth41.js
const { wait, until } = M;
const out = { problems: [] };
const claude = H.claudeAgent();
const cdp = (method, params) => smoke({ cdp: method, params });
const press = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
const release = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
const move = (x, y, button = 'none') => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button, ...(button === 'left' ? { buttons: 1 } : {}) });
const KEYS = { Backspace: [8, 'Backspace'] };
async function key(k) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0] } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), text: k };
  await cdp('Input.dispatchKeyEvent', { type: special ? 'rawKeyDown' : 'keyDown', ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const has = (name) => typeof window[name] !== 'undefined' || (() => { try { return typeof eval(name) !== 'undefined'; } catch { return false; } })();


H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// ---- the Lab: a docked director and a scene with sliders, left loaded ----
if (!H.agents().some((a) => a.dock === 'three' && a.mode === 'native')) {
  H.config.agents.push({ id: 's41director', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', enabled: true });
  await saveConfig(); await wait(1500);
}
activate('tool:three'); await wait(400);
const lab = await ThreeLab.cmd();
const SCENE = `import * as THREE from 'three';
const P = tweak({ turn: { value: 100, min: 0, max: 200, step: 1, label: 'Turn', group: 'Motion' }, glow: { value: 0.4, min: 0, max: 1, label: 'Glow', group: 'Look' }, tint: { value: '#7c5cff', label: 'Tint', group: 'Look' } });
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 160, 24), new THREE.MeshNormalMaterial()); scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.x = t / 900; mesh.rotation.z = P.turn / 200 * 6.283; renderer.render(scene, camera); });`;
await ThreeLab.director.newSketch('smooth41 scene', SCENE, 1);
await wait(2000);

// ---- chats: one of 300 messages ----
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}`;
const at0 = Date.now() - 100000;
const big = { id: `s41-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'S41 long chat', createdAt: at0, updatedAt: at0, messages: Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 100 })) };
await window.hub.saveChat(big); Native.save(big);
activate(claude.id); await wait(400);
Native.open(claude.id, big.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 10000);
await wait(1500);

const segs = [];
const seg = async (name, fn) => { performance.mark(`hz240:${name}`); segs.push(name); try { await fn(); } catch (err) { out[`${name}Error`] = String(err.message || err); } await settle(); };
const lbl = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; return e ? `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className ?? '').split(' ')[0]}` : '?'; };
// what a whole-page observer (childList + subtree, like a11y's) is handed while fn runs: records, added elements
const watchPage = async (fn) => {
  let recs = 0; let added = 0; let addedDeep = 0; const by = {};
  const mo = new MutationObserver((rs) => { recs += rs.length; for (const r of rs) { for (const n of r.addedNodes) if (n.nodeType === 1) { added++; addedDeep += 1 + n.getElementsByTagName('*').length; } const k = `${r.type}:${r.attributeName ? `${r.attributeName}:` : ''}${lbl(r.target)}`; by[k] = (by[k] || 0) + 1; } });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const t = performance.now(); const r = await fn(); mo.disconnect();
  return { ms: Math.round(performance.now() - t), recs, added, addedDeep, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v}× ${k}`), by, ...(r || {}) };
};
// a11y's naming pass (where A11y keeps its counts): controls it looked at / named again while fn ran
const a11yWork = async (fn) => {
  const st = window.A11y?._stats; const a = st ? { ...st } : null;
  const r = await fn(); await wait(400); // (its idle pass)
  if (st) Object.assign(r || {}, { a11yLooked: st.looked - a.looked, a11yNamed: st.named - a.named });
  return r;
};
const streamIn = (agentId, text) => watchPage(async () => {
  Native.sendText(agentId, text);
  await until(() => Native.isAgentBusy(agentId), 5000);
  await until(() => !Native.isAgentBusy(agentId), 60000);
});

await smoke({ trace: 'start', detail: true });
const t0 = performance.now();
await seg('idle-chat', () => wait(3000));

// a long paste (60k characters): a "Pasted text" chip that measures its cost (attachlean), then typing beside it
const v = Native.view(claude.id);
const LONG = Array.from({ length: 1500 }, (_, i) => `line ${i}: function step${i}(x) { return x * ${i % 7} + ${i}; } // some words to read`).join('\n');
await seg('paste', async () => {
  v.input.focus(); await settle();
  const dt = new DataTransfer(); dt.setData('text/plain', LONG);
  v.input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await until(() => v.attachments.some((a) => a.lean || a.kind === 'text'), 4000);
  await wait(600);
});
out.pasteChip = v.chips.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
await seg('type-chip', async () => {
  v.input.focus(); await settle();
  for (const c of 'please look at the step functions and tell me ') { await key(c); await wait(4); }
  for (let i = 0; i < 8; i++) { await key('Backspace'); await wait(4); }
});
v.attachments.length = 0; Native.renderChips(claude.id);
v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true }));

await seg('stream', async () => { out.streamChat = await a11yWork(() => streamIn(claude.id, 'long table please')); delete out.streamChat.by; });

// two quiet notes (folded into one line by chatcalm where it exists), then three short replies under them
Native.note(claude.id, '↻ The cache was rebuilt: the instructions changed mid-chat.', { id: 'cachewise' });
Native.note(claude.id, '🗜 This chat is getting long: Continue lighter.', { id: 'autocompact', actions: [{ label: '🗜 Continue lighter', run: () => {} }] });
await wait(300);
await seg('replies', async () => {
  out.replies = await a11yWork(() => watchPage(async () => { for (let i = 0; i < 3; i++) { await (streamIn(claude.id, `short answer ${i}`)); await wait(150); } })); delete out.replies.by;
});

// ⋯ AI setup and ◎ missions opened and closed with the mouse ×3 each: a11y moves focus into each and back after (reported:
// one forced style each time, the price of focus going in; measured in round 41 and left)
const shown = (n) => n && n.getBoundingClientRect().width > 0;
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const click = async (x, y) => { await press(x, y); await release(x, y); };
await seg('overlays', async () => {
  const optBtn = () => [...v.root.querySelectorAll('.native-head button')].find((n) => (n.getAttribute('aria-label') === 'Chat options' || n.textContent.trim() === '⋯') && shown(n));
  for (let i = 0; i < 3; i++) {
    await click(...mid(optBtn())); await until(() => document.querySelector('.opt-sheet'), 4000); await wait(300);
    await click(...mid(optBtn())); await wait(300);
  }
  const ms = v.root.querySelector('.ms-btn');
  if (ms) for (let i = 0; i < 3; i++) { await click(...mid(ms)); await until(() => document.querySelector('.ms-pop'), 3000); await wait(300); await click(...mid(ms)); await wait(300); }
});

// a tip that waits for another place (the board): the queue looks again while it waits
let hintWaits = false;
if (window.Hints) { Hints.offer({ id: `s41-wait-${Date.now()}`, place: 'board', kind: 'tip', ttl: 60000, show: () => null }).catch(() => {}); hintWaits = true; }
await seg('idle-hint', () => wait(3000));

// a slider drag in the sliders panel of the scene with sliders (its value, number box and ♪ rows rewrite as it moves)
await seg('lab-slider', async () => {
  activate('tool:three'); await wait(800);
  lab.panel?.(true); await wait(800);
  const L = document;
  const range = [...(L?.querySelectorAll('.tw-row') || [])].find((r) => /^Turn$/.test(r.querySelector('.tw-name')?.textContent || ''))?.querySelector('.tw-range input[type=range]')
    || [...(L?.querySelectorAll('.tw-range input[type=range]') || [])].find((x) => x.getBoundingClientRect().width > 40);
  if (!range) { out.sliderNote = 'no slider in the panel'; return; }
  range.scrollIntoView({ block: 'center' }); await settle();
  out.slider = await watchPage(async () => {
    const r = range.getBoundingClientRect(); const y = Math.round(r.top + r.height / 2);
    await press(Math.round(r.left + 8), y);
    for (let k = 0; k < 2; k++) for (let i = 0; i <= 40; i++) { const f = k ? 1 - i / 40 : i / 40; await move(Math.round(r.left + 8 + f * (r.width - 16)), y, 'left'); await wait(10); }
    await release(Math.round(r.left + r.width / 2), y); await wait(300);
  });
  delete out.slider.by;
});
// the docked director's new chat (its own keyframed orb scene, knobs in the panel) streaming beside the Lab
await seg('lab-stream', async () => {
  const dir = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
  if (!dir) { out.labNote = 'no director'; return; }
  Tools.syncDocks?.(); Native.newChat(dir.id); await wait(300);
  out.streamLab = await a11yWork(() => streamIn(dir.id, 'long please'));
  delete out.streamLab.by;
});
// the orb playing (its knobs animate): what the page writes per second
let playBy = {};
try { if (lab.player && !lab.player.playing) lab.player.toggle?.(true); await until(() => lab.player?.playing, 6000); await wait(800); } catch { /* reported by the guard */ }
out.orbPlaying = Boolean(lab.player?.playing);
await seg('lab-playing', async () => { out.labPlaying = await watchPage(() => wait(3000)); playBy = out.labPlaying.by; delete out.labPlaying.by; });
out.knobs = document.querySelectorAll('.tw-knob').length;
await seg('idle-lab', () => wait(3000));
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const dd = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
out.all = `tasks>4.2ms ${dd.tasks?.over4} (>8.3 ${dd.tasks?.over8}, >50 ${dd.tasks?.over50}, max ${dd.tasks?.maxMs}) · busy ${dd.tasks?.busyMs}ms · frames ${dd.frames?.n} over8.3 ${dd.frames?.over8} p95 ${dd.frames?.p95} · forced ${dd.forced?.n}/${dd.forced?.ms}ms · style ${dd.style?.n}× ${dd.style?.elements}el ${dd.style?.ms}ms · layout ${dd.layout?.n}× ${dd.layout?.objects}obj ${dd.layout?.ms}ms`;
const line = (s) => `busy ${s.busyMs}ms · tasks>8.3 ${s.longTasks.over8} max ${s.longTasks.max} · frames ${s.frames.n} >8.3 ${s.frames.over8} worst ${s.frames.worst} · style ${s.style.n}×${s.style.elements}el ${s.style.ms}ms · layout ${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms · forced ${s.forced.n}/${s.forced.ms}ms · fired t${s.fired.timer} i${s.fired.idle} r${s.fired.raf}`;
out.segments = {};
const fileMs = (s, f) => { const x = s?.files?.[f]; return x ? Number(String(x).split('ms')[0]) : 0; };
const fileN = (s, f) => { const x = s?.files?.[f]; return x ? Number(String(x).split('/')[1]) : 0; };
for (const n of segs) {
  const s = dd.segments?.[n]; if (!s) continue;
  out.segments[n] = line(s);
  out.segments[`${n} files`] = Object.entries(s.files || {}).map(([k, x]) => `${k} ${x}`).join(' · ');
  if (s.forced.n) out.segments[`${n} forced`] = s.forced.top.join(' | ');
}
// the numbers the budgets read (per stretch: a11y.js / hints.js / attachlean*.js script ms and calls)
const S = dd.segments || {};
out.parts = ['A11y', 'AttachLean', 'Hints', 'Power'].filter(has).join(' ') || 'none';
out.guard = {
  a11yStreamMs: fileMs(S.stream, 'a11y.js'), a11yStreamN: fileN(S.stream, 'a11y.js'),
  a11yLabStreamMs: fileMs(S['lab-stream'], 'a11y.js'), a11ySliderMs: fileMs(S['lab-slider'], 'a11y.js'), a11yPlayingMs: fileMs(S['lab-playing'], 'a11y.js'), a11yPlayingN: fileN(S['lab-playing'], 'a11y.js'),
  pasteLongestTask: S.paste?.longTasks.max ?? null, pasteAttachMs: fileMs(S.paste, 'attachlean.js') + fileMs(S.paste, 'attachlean-core.js'),
  typeChipAttachMs: fileMs(S['type-chip'], 'attachlean.js') + fileMs(S['type-chip'], 'attachlean-core.js'),
  hintsIdleN: fileN(S['idle-hint'], 'hints.js'), hintsIdleMs: fileMs(S['idle-hint'], 'hints.js'), hintWaits,
  idleChatTimers: S['idle-chat']?.fired.timer ?? null, idleLabTimers: S['idle-lab']?.fired.timer ?? null,
  repliesNativeMs: fileMs(S.replies, 'native.js'),
  a11yForcedOverlays: S.overlays?.forcedFiles?.['a11y.js'] || 0, forcedOverlays: S.overlays?.forced.n ?? null,
  a11yLookedStream: out.streamChat?.a11yLooked ?? null, a11yLookedReplies: out.replies?.a11yLooked ?? null, a11yNamedReplies: out.replies?.a11yNamed ?? null,
  // writes of what didn't change while the orb plays: the knobs' code-value notch, and the hints queue's looks
  notchWrites: playBy['attributes:transform:line.kn-notch'] || 0, knobTextWrites: playBy['childList:button.tw-kval'] || 0, knobArcWrites: playBy['attributes:stroke-dasharray:circle.kn-arc'] || 0,
};
// budgets: what round 41 brought down (generous: this machine's timings move ±30 %; the per-file numbers are steady)
const B = window.S41_BUDGET || { a11yNamedShare: 0.8, pasteLongestTask: 120, hintsIdleN: 2 };
// a11y names only controls that are new or changed: a chat redraw after each reply moves messages (their controls
// unchanged); before round 41 every control it looked at was walked and named again (named = looked)
if (out.guard.a11yLookedReplies != null && out.guard.a11yNamedReplies > out.guard.a11yLookedReplies * B.a11yNamedShare) out.problems.push(`a11y named ${out.guard.a11yNamedReplies} of the ${out.guard.a11yLookedReplies} controls it looked at over 3 replies (> ${B.a11yNamedShare * 100} %)`);
if (has('AttachLean') && out.guard.pasteLongestTask > B.pasteLongestTask) out.problems.push(`a long paste: a ${out.guard.pasteLongestTask} ms task (> ${B.pasteLongestTask})`);
if (hintWaits && out.guard.hintsIdleN > B.hintsIdleN) out.problems.push(`hints.js ran ${out.guard.hintsIdleN}× in 3 s while a tip waited for another place (> ${B.hintsIdleN})`);
if (!out.knobs) out.problems.push('no knobs in the Lab panel while the orb played: the knob guards measured nothing');
if (out.guard.notchWrites > 0) out.problems.push(`the knobs' code-value notch was rewritten ${out.guard.notchWrites}× in 3 s of playback (it never moves)`);
if (out.guard.knobTextWrites > out.guard.knobArcWrites) out.problems.push(`knob values rewritten ${out.guard.knobTextWrites}× for ${out.guard.knobArcWrites} moves`);
const broken = Object.keys(out).filter((k) => k.endsWith('Error'));
for (const k of broken) out.problems.push(`${k}: ${out[k]}`);
out.pass = window.S41_REPORT ? true : out.problems.length === 0;
return JSON.stringify(out, null, 1);
