// 240 Hz interaction check (round 17, hz240): drives the everyday UI with real input events (CDP Input.*) at a high
// rate under a timeline trace, in the owner's look (Forgeheart), and reports per interaction:
//   input → next commit latency (main side) and the main-thread work in that span (≤ 4.2 ms fits one 240 Hz frame),
//   drawn frames whose main-thread work went over 4.2 ms / 8.3 ms, long tasks, forced layouts (layout / style read
//   inside script), style recalcs (count, elements) and layouts (count, objects).
// The vsync here is 60 Hz (Xvfb), so latency carries up to 16.7 ms of waiting; the *work* numbers are the budget ones.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/hz240.js
// window.HZ_ONLY = 'menu,palette' runs some stretches only; window.HZ_RAW: the full numbers instead of one line each.
const { wait, until } = M;
const out = {};
const only = String(window.HZ_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const claude = H.claudeAgent();
const cdp = (method, params) => smoke({ cdp: method, params });
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
const click = async (x, y, button = 'left') => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 }); };
const wheel = (x, y, dy) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
const KEYS = { Escape: [27, 'Escape'], ArrowDown: [40, 'ArrowDown'], ArrowUp: [38, 'ArrowUp'], Enter: [13, 'Enter'], Backspace: [8, 'Backspace'] };
async function key(k, modifiers = 0) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0] } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...(modifiers ? {} : { text: k }) };
  await cdp('Input.dispatchKeyEvent', { type: special || modifiers ? 'rawKeyDown' : 'keyDown', modifiers, ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...p });
}
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
// (round 26: the Commands page has no rail button any more: /commands opens it)
const railOpen = async (id) => { const btn = document.querySelector(`#agent-buttons .agent-btn[data-id="${id}"]`); if (btn) await click(...mid(btn)); else activate(id); };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));

// ---- the owner's look: Forgeheart (v2 materials, textures, glow) ----
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
// ---- fixtures: 40 chats in the list, one 300-message chat ----
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}${i % 5 === 0 ? `\n\n${Array.from({ length: 12 }, (_, k) => `Long paragraph ${k} with enough words to wrap across the line at least once or twice.`).join('\n\n')}` : ''}`;
const mk = (n, title, ago) => { const at = Date.now() - ago; return { id: `hz-${title.replace(/\W/g, '')}-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title, createdAt: at, updatedAt: at, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at + i * 1000 })) }; };
const big = mk(300, 'HZ long chat', 1000);
const chats = [big, ...Array.from({ length: 40 }, (_, i) => mk(4, `HZ chat ${i + 1} about ${['shaders', 'the intro', 'beats', 'the board', 'colors'][i % 5]}`, (i + 2) * 3600e3))];
for (const c of chats) { await window.hub.saveChat(c); Native.save(c); }
activate(claude.id); await wait(400);
Native.open(claude.id, big.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 10000);
await wait(1500);

if (window.HZ_CSS) document.head.append(Object.assign(document.createElement('style'), { textContent: window.HZ_CSS })); // experiments: extra CSS for a run
const segs = [];
const seg = async (name, fn) => { if (!want(name)) return; performance.mark(`hz240:${name}`); segs.push(name); try { await fn(); } catch (err) { out[`${name}Error`] = String(err.message || err); } await settle(); };
await smoke({ trace: 'start', detail: true });
const t0 = performance.now();

// idle (nothing should run)
await seg('idle', () => wait(1200));
// hovering down the rail, then the chats list, fast (a move every ~6 ms)
await seg('hover-rail', async () => {
  const btns = [...document.querySelectorAll('#rail button')].filter((b) => b.getBoundingClientRect().height);
  const x = mid(btns[0])[0]; const top = btns[0].getBoundingClientRect().top; const bottom = btns.at(-1).getBoundingClientRect().bottom;
  for (let k = 0; k < 2; k++) for (let y = top; y < bottom; y += 9) { await move(x, Math.round(k ? bottom - (y - top) : y)); await wait(4); }
  await move(700, 400);
});
await seg('hover-chats', async () => {
  const L = document.getElementById('chat-groups'); const r = L.getBoundingClientRect();
  for (let k = 0; k < 2; k++) for (let y = r.top + 4; y < r.bottom - 4; y += 7) { await move(Math.round(r.left + r.width / 2), Math.round(k ? r.bottom - (y - r.top) : y)); await wait(4); }
  await move(700, 400);
});
// scrolling the chats list and the long chat with the wheel
await seg('scroll-chats', async () => { const [x, y] = mid(document.getElementById('chat-groups')); for (let i = 0; i < 24; i++) { await wheel(x, y, i < 12 ? 100 : -100); await wait(10); } });
await seg('scroll-chat', async () => { const [x, y] = mid(Native.view(claude.id).list); for (let i = 0; i < 40; i++) { await wheel(x, y, i < 30 ? -120 : 120); await wait(10); } });
// the chat's ⋯ menu: open, move over it, close (Esc), 5 times
await seg('menu', async () => {
  const b = [...Native.view(claude.id).root.querySelectorAll('button')].find((n) => n.textContent.trim() === '⋯' && n.getBoundingClientRect().width);
  for (let i = 0; i < 5; i++) {
    await click(...mid(b), 'right'); await settle(); // (round 26: ⋯ opens AI setup, measured in smooth26.js; right-click ⋯ keeps the menu)
    const m = document.getElementById('menu'); const r = m.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom - 6; y += 12) { await move(Math.round(r.left + r.width / 2), Math.round(y)); await wait(4); }
    await key('Escape'); await settle();
  }
});
// right-click a chat row (its menu), 5 times
await seg('ctx-menu', async () => {
  const rows = [...document.querySelectorAll('#chat-groups .item')].filter((n) => n.getBoundingClientRect().height).slice(0, 5);
  for (const row of rows) { await click(...mid(row), 'right'); await settle(); await key('Escape'); await settle(); }
});
// the palette: Ctrl+K, type, arrows, Esc, 4 times
await seg('palette', async () => {
  for (let i = 0; i < 4; i++) {
    await key('k', 2); await settle();
    for (const c of ['t', 'h', 'r']) { await key(c); await wait(8); }
    for (let k = 0; k < 4; k++) { await key('ArrowDown'); await wait(8); }
    const L = document.querySelector('.palette-list'); if (L) { const r = L.getBoundingClientRect(); for (let y = r.top + 5; y < r.top + 300; y += 10) { await move(Math.round(r.left + 100), Math.round(y)); await wait(4); } }
    await key('Escape'); await settle();
  }
});
// typing in the composer (60 letters, one every ~8 ms), then clearing it
await seg('type', async () => {
  const v = Native.view(claude.id); v.input.focus(); await settle();
  for (const c of 'the quick brown fox jumps over the lazy dog and keeps going ') { await key(c); await wait(4); }
  for (let i = 0; i < 12; i++) { await key('Backspace'); await wait(4); }
});
await (async () => { const v = Native.view(claude.id); v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true })); v.input.blur(); })();
// a dialog (Appearance) and dragging its Glow slider
await seg('slider', async () => {
  Look.openDialog(); await settle();
  const adv = document.querySelector('.look-dialog .look-adv'); if (adv) adv.open = true; await settle();
  const s = document.querySelector('.look-dialog input[type=range]'); s.scrollIntoView({ block: 'center' }); await settle();
  const r = s.getBoundingClientRect(); const y = Math.round(r.top + r.height / 2);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(r.left + 4), y, button: 'left', clickCount: 1 });
  for (let k = 0; k < 2; k++) for (let x = r.left + 4; x < r.right - 4; x += 4) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(k ? r.right - (x - r.left) : x), y, button: 'left', buttons: 1 }); await wait(4); }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(r.left + r.width / 2), y, button: 'left', clickCount: 1 });
  await settle(); await key('Escape'); await wait(300);
});
// opening tools from the rail (Board, Commands) and back to the chat, twice
await seg('tools', async () => {
  for (let i = 0; i < 2; i++) for (const id of ['tool:board', 'tool:commands', claude.id]) { await railOpen(id); await wait(250); }
});
// the Commands page: hover down its list, wheel through it, search in it
await seg('cmdpage', async () => {
  await railOpen('tool:commands'); await wait(400);
  const L = document.querySelector('.cp-list'); const r = L.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2);
  for (let y = r.top + 40; y < r.bottom - 10; y += 8) { await move(x, Math.round(y)); await wait(4); }
  for (let i = 0; i < 30; i++) { await wheel(x, Math.round(r.top + r.height / 2), 160); await wait(10); }
  await click(...mid(document.querySelector('.cp-search')));
  for (const c of 'colors') { await key(c); await wait(30); }
  await wait(200);
  for (let i = 0; i < 6; i++) { await key('Backspace'); await wait(30); }
  await wait(300); await move(700, 400);
});
// toasts while pointing around
await seg('toasts', async () => { for (let i = 0; i < 5; i++) { toast(`HZ toast ${i}`, { timeout: 1500 }); await move(400 + i * 40, 300); await wait(60); } await wait(400); });
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const d = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
out.all = `tasks>4.2ms ${d.tasks?.over4} (>8.3 ${d.tasks?.over8}, >50 ${d.tasks?.over50}, max ${d.tasks?.maxMs}) · frames ${d.frames?.n} over4.2 ${d.frames?.over4} over8.3 ${d.frames?.over8} p95 ${d.frames?.p95} · forced ${d.forced?.n}/${d.forced?.ms}ms · style ${d.style?.n}× ${d.style?.elements}el ${d.style?.ms}ms · layout ${d.layout?.n}× ${d.layout?.objects}obj ${d.layout?.ms}ms`;
out.forcedTop = d.forced?.top;
const line = (s) => `in ${s.inputs} · lat p50 ${s.latency.p50} p95 ${s.latency.p95} max ${s.latency.max} · work p50 ${s.work.p50} p95 ${s.work.p95} max ${s.work.max} (>4.2: ${s.work.over4}) · frames ${s.frames.n} >4.2 ${s.frames.over4} >8.3 ${s.frames.over8} worst ${s.frames.worst} · tasks>4.2 ${s.longTasks.over4} max ${s.longTasks.max} · style ${s.style.n}×${s.style.elements}el ${s.style.ms}ms · layout ${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms · forced ${s.forced.n}/${s.forced.ms}ms`;
out.segments = {};
for (const n of segs) { const s = d.segments?.[n]; if (!s) continue; out.segments[n] = window.HZ_RAW ? s : line(s); if (window.HZ_RAW) continue; out.segments[`${n} time`] = `${s.phases} · scripts: ${s.scripts.join(' | ')}`; if (s.forced.n) out.segments[`${n} forced`] = s.forced.top.join(' | '); }
// totals across the interactive stretches (idle left out): inputs over budget, frames over budget
const S = segs.filter((n) => n !== 'idle').map((n) => d.segments?.[n]).filter(Boolean);
out.total = { inputs: S.reduce((a, s) => a + s.inputs, 0), inputsOver4: S.reduce((a, s) => a + s.work.over4, 0), frames: S.reduce((a, s) => a + s.frames.n, 0), framesOver4: S.reduce((a, s) => a + s.frames.over4, 0), framesOver8: S.reduce((a, s) => a + s.frames.over8, 0), forced: S.reduce((a, s) => a + s.forced.n, 0), styleElements: S.reduce((a, s) => a + s.style.elements, 0), layoutObjects: S.reduce((a, s) => a + s.layout.objects, 0) };
// a stretch that couldn't drive its UI (a menu that didn't open, a missing control) fails the check
const broken = Object.keys(out).filter((k) => k.endsWith('Error'));
if (broken.length) throw new Error(`hz240: ${broken.map((k) => `${k}: ${out[k]}`).join(' · ')}`);
return JSON.stringify(out, null, 1);
