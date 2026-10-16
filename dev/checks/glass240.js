// Floating glass at 240 Hz (round 51, glass240): scroll240 took the blur off dialogs; this measures every other
// floating surface (menus and their flyouts, Ctrl/⌘+K, notes, tooltips, the Lab's menus) and the always-running
// decorations, with real input (CDP), in the owner's look (Forgeheart), under one timeline trace (dev/trace-stats.js):
//   idle        the chat screen at rest, the pointer away (the rail, the chats list, the chat): nothing should draw
//   stream      a long reply streaming in a busy chat (the reference for the next two)
//   toasts      a burst of 8 notes over that streaming chat
//   palette     Ctrl/⌘+K over that streaming chat: typing 9 letters, arrows, pointing down the list
//   menu        a long right-click menu (the chat header's) over the still chat: pointing down every row, into the
//               flyouts (#menu-fly) and back
//   lab-play    the Lab playing a song, nothing open (the reference for the next one)
//   lab-menu    the Lab playing, its picture's right-click open, pointing through it and into ✨ Look & motion
//   dock        the Lab playing with the Three Director docked, a reply streaming in the dock, the pointer on it
// Per stretch: the GPU process's time per drawn frame (software GL here: a backdrop blur over moving content shows
// there, never on the main thread), raster, paints, and how many glass surfaces on screen still blur what's behind
// them (backdrop-filter, sampled while open). Budgets on the reliable ones: blurring surfaces (a count) and nothing
// infinite running at idle; the GPU numbers are reported (compare a before and an after run on the same machine).
// window.G240_REPORT = 1 reports without failing, G240_ONLY = 'menu,palette', G240_CSS (an A/B), G240_SHOTS = dir
// (a picture of each surface open), G240_LIGHT = 1 (Forge Light instead of Forgeheart), G240_BUDGET overrides.
// Big screens: --screen 2560x1440 (the blur's cost grows with the area it covers).
//   node dev/smoke.js --fake-engines --screen 1280x800 --check-timeout 1200000 --lib dev/checks/smooth-lib.js --script dev/checks/glass240.js
//   (song: /tmp/hearth-test-song.wav, made by node dev/make-test-song.js)
const { wait, until } = M;
const SONG = '/tmp/hearth-test-song.wav';
const out = { numbers: {}, glass: {}, problems: [] };
const fail = (m) => out.problems.push(m);
const only = String(window.G240_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const SHOTS = window.G240_SHOTS || '';
const claude = H.claudeAgent();
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none' });
const click = async (x, y, button = 'left') => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button, buttons: button === 'right' ? 2 : 1, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button, buttons: 0, clickCount: 1 }); };
const KEYS = { Escape: [27, 'Escape'], ArrowDown: [40, 'ArrowDown'], Backspace: [8, 'Backspace'] };
async function key(k, modifiers = 0) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0] } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...(modifiers ? {} : { text: k }) };
  await cdp('Input.dispatchKeyEvent', { type: special || modifiers ? 'rawKeyDown' : 'keyDown', modifiers, ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...p });
}
const menuOpen = (id = 'menu') => { const m = document.getElementById(id); return m && m.getBoundingClientRect().height > 0 ? m : null; };
const mid = (n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const shot = async (name) => { if (!SHOTS) return; performance.mark('hz240:between'); await smoke({ shot: `${SHOTS}/${name}.png` }); };
// the glass surfaces on screen that blur what's behind them (an element with a backdrop-filter, seen)
const blurring = () => {
  const list = [];
  for (const n of document.querySelectorAll('body *')) {
    const s = getComputedStyle(n);
    if (s.backdropFilter && s.backdropFilter !== 'none' && n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0) list.push(`${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}.${String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/).slice(0, 2).join('.')}`);
  }
  for (const pe of ['::backdrop']) for (const d of document.querySelectorAll('dialog[open], [popover]:popover-open')) { const s = getComputedStyle(d, pe); if (s.backdropFilter && s.backdropFilter !== 'none') list.push(`${d.tagName.toLowerCase()}.${d.className}${pe}`); }
  return list;
};
// sampled outside the stretch's numbers (a style pass over the page)
const sample = (name) => { performance.mark('hz240:between'); const b = blurring(); out.glass[name] = b; return b; };
// the infinite animations running on something seen (idle should have none)
const loops = () => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations === Infinity).map((a) => {
  const t = a.effect?.target; const n = t?.nodeType === 1 ? t : t?.parentElement;
  const seen = n ? n.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && n.getBoundingClientRect().width > 0 : false;
  return { name: `${a.animationName || 'anim'} ${n ? `${n.tagName.toLowerCase()}.${String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/)[0]}` : '?'}${a.effect?.pseudoElement || ''}`, seen };
});

if (window.G240_LIGHT) { H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES['forge-light'], preset: 'forge-light' }; }
else H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
if (window.G240_CSS) document.head.append(Object.assign(document.createElement('style'), { textContent: window.G240_CSS }));
// (G240_SIZE = '2560x1440': the page laid out and drawn at that size, as labcalm / appcalm do)
const SIZE = /^(\d+)x(\d+)$/.exec(String(window.G240_SIZE || ''));
if (SIZE) { await cdp('Emulation.setDeviceMetricsOverride', { width: Number(SIZE[1]), height: Number(SIZE[2]), deviceScaleFactor: 1, mobile: false }); await wait(800); }
out.numbers.screen = `${innerWidth}×${innerHeight} @${devicePixelRatio}`;

// ---------- a busy chat: 200 messages with code, tables and pictures ----------
const para = (i) => {
  const base = `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\nAnother paragraph of plain words about the scene ${i}.`;
  if (i % 12 === 1) return `${base}\n\n\`\`\`js\nconst x${i} = ${i};\nfor (let k = 0; k < 4; k++) console.log(x${i} * k);\n\`\`\``;
  if (i % 12 === 5) return `${base}\n\n| a | b | c |\n| --- | ---: | --- |\n| ${i} | ${i * 2} | warm |\n| x | y | grain |`;
  return base;
};
const at0 = Date.now() - 2e7;
const busy = { id: `g240-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'G240 busy chat', createdAt: at0, updatedAt: at0 + 1e7, messages: Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 1000 })) };
await window.hub.saveChat(busy); Native.save(busy);
for (let i = 0; i < 40; i++) H.chats.push({ id: `g240f-${i}`, agentId: claude.id, title: `G240 chat ${i} about ${['shaders', 'the intro', 'beats', 'the board', 'colors'][i % 5]}`, updatedAt: at0 - 5000 - i * 60e3, pinned: false });
H.chats = H.chats.slice();
activate(claude.id); await wait(300);
Native.open(claude.id, busy.id);
const v = () => Native.view(claude.id);
await until(() => v().list.querySelectorAll('.msg').length >= 20, 15000);
Panel.render(); await wait(1200);
await move(2, innerHeight - 2); await wait(600);

const segs = [];
const seg = async (name, fn) => { if (!want(name)) return; performance.mark(`hz240:${name}`); segs.push(name); const t0 = performance.now(); try { await fn(); } catch (err) { out.numbers[`${name}Error`] = String(err.stack || err.message || err).slice(0, 300); fail(`${name}: ${err.message || err}`); } out.numbers[`${name}Sec`] = Math.round((performance.now() - t0) / 100) / 10; await settle(); performance.mark('hz240:between'); await wait(200); };

await smoke({ trace: 'start', detail: true, cats: 'viz' });

// ---------- idle: the chat screen at rest ----------
await seg('idle', async () => { await wait(2500); });
out.loopsIdle = loops();
out.numbers.idleFocus = document.activeElement?.tagName.toLowerCase();
if (want('idle')) await shot('idle');

// ---------- a reply streaming in the busy chat; Ctrl/⌘+K and notes over it ----------
const streaming = want('stream') || want('palette') || want('toasts');
if (streaming) {
  Native.sendText(claude.id, 'huge-40k');
  await until(() => v().list.querySelector('.msg.streaming .body')?.textContent.length > 400, 15000);
}
await seg('stream', async () => { await wait(2000); });
if (want('stream')) sample('stream');
await seg('toasts', async () => {
  for (let i = 0; i < 8; i++) { toast(`Note ${i + 1}: saved the scene`, i === 5 ? { type: 'error' } : {}); await wait(120); }
  await wait(600); sample('toasts'); await shot('toasts');
  await wait(900);
});
await seg('palette', async () => {
  await key('k', 2); await until(() => document.querySelector('.palette'), 3000); await settle();
  for (const c of 'lab glass') { await key(c); await wait(40); }
  for (let k = 0; k < 4; k++) { await key('ArrowDown'); await wait(40); }
  const L = document.querySelector('.palette-list');
  if (L) { const r = L.getBoundingClientRect(); for (let y = r.top + 5; y < Math.min(r.bottom, r.top + 300); y += 12) { await move(r.left + 100, y); await wait(16); } }
  sample('palette'); await shot('palette');
  { const p = document.querySelector('.palette'); const st = p && getComputedStyle(p); out.numbers.paletteDim = st ? `${st.opacity} ${st.backgroundImage.slice(0, 60)} ${p.getAnimations().map((a) => `${a.animationName}:${a.playState}`).join(',')}` : 'none'; }
  await key('Escape'); await settle();
});
if (want('palette') && !document.querySelector('.palette') && !out.glass.palette) fail('palette: Ctrl/⌘+K did not open');
if (streaming) { try { window.hub.stop(H.activeChat[claude.id]); } catch { /* ended */ } await wait(600); }

// ---------- a long right-click menu over the still chat, pointing through it and its flyouts ----------
await seg('menu', async () => {
  const head = v().root.querySelector('.native-head');
  const [hx, hy] = mid(head);
  for (let k = 0; k < 2; k++) {
    await move(hx, hy); await click(hx, hy, 'right'); await until(() => menuOpen(), 3000); await settle();
    const m = menuOpen(); if (!m) throw new Error('no menu');
    const rows = [...m.querySelectorAll(':scope > button')].filter((b) => b.getBoundingClientRect().height);
    out.numbers.menuRows = rows.length;
    for (const b of rows) {
      const r = b.getBoundingClientRect();
      for (let x = r.left + 10; x < r.left + 70; x += 20) { await move(x, r.top + r.height / 2); await wait(12); }
      // into the flyout when this row opened one: down its rows, then back
      const fly = b.classList.contains('has-sub') && await until(() => menuOpen('menu-fly'), 500) && menuOpen('menu-fly');
      if (fly && k === 0) {
        const fr = fly.getBoundingClientRect();
        await move(fr.left + 20, r.top + r.height / 2); await wait(30);
        for (const f of [...fly.querySelectorAll(':scope > button')].slice(0, 8)) { const q = f.getBoundingClientRect(); await move(q.left + 30, q.top + q.height / 2); await wait(16); }
        if (!out.glass.menu) { sample('menu'); await shot('menu'); }
        await move(r.left + 20, r.top + r.height / 2); await wait(30);
      }
    }
    await key('Escape'); await settle(); hideMenu?.(); await wait(100);
  }
});

// ---------- the Lab playing: its menus over the live picture, the director docked ----------
const lab = want('lab-play') || want('lab-menu') || want('dock');
let c = null;
if (lab) {
  performance.mark('hz240:between');
  if (want('dock')) { await Commands.tryRun('/director-setup', claude.id); await until(() => H.agents().some((a) => a.dock === 'three'), 8000); }
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes, 60000);
  c = await ThreeLab.cmd();
  await until(() => ThreeLab.search?.menus, 15000);
  // a picture that moves every frame (a 2D canvas layer never dozes), like a playing scene
  const code = `const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const fit = () => { c.width = innerWidth; c.height = innerHeight; }; fit(); addEventListener('resize', fit);
(function f(t) { const w = c.width, h = c.height; g.fillStyle = '#0b0d12'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) { const a = t / 900 + i * 0.26; g.fillStyle = 'hsl(' + ((i * 15 + t / 20) % 360) + ' 80% 55%)'; g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.35, h / 2 + Math.sin(a * 1.3) * h * 0.35, 18 + 10 * Math.sin(a * 2), 0, 7); g.fill(); }
  requestAnimationFrame(f); })(0);`;
  const sk = ThreeLab.scenes.create({ name: 'Glass240 moving', code, layers: [ThreeLayers.defaults({ id: 'g240L0', name: 'Moving dots', code, slot: 0, visible: true })], frame: '16:9', open: true });
  await until(() => ThreeLab.scenes.currentId() === sk.id, 20000);
  try { await c.loadSong(SONG); await until(() => c.player?.loaded, 8000); } catch (e) { out.numbers.songError = String(e); }
  await wait(2500);
  c.seek?.(1); c.play?.(true);
  await wait(5000); // (the new scene's first frames come in)
  out.numbers.labPlaying = Boolean(c.player?.playing);
}
const frame = () => [...document.querySelectorAll('iframe.three-frame')].find((f) => f.offsetParent && f.getBoundingClientRect().width > 100);
await seg('lab-play', async () => { await wait(2000); });
if (want('lab-play')) { sample('lab-play'); out.loopsLab = loops(); await shot('lab-play'); }
await seg('lab-menu', async () => {
  const fr = frame(); if (!fr) throw new Error('no Lab picture');
  const r0 = fr.getBoundingClientRect();
  const cx = r0.left + r0.width * 0.3; const cy = r0.top + r0.height * 0.35;
  for (let i = 0; i < 4 && !menuOpen(); i++) { await move(cx, cy); await click(cx, cy, 'right'); await until(() => menuOpen(), 2500); }
  const m = menuOpen(); if (!m) throw new Error('the picture\'s right-click did not open');
  const rows = [...m.querySelectorAll(':scope > button')].filter((b) => b.getBoundingClientRect().height);
  for (const b of rows) { const r = b.getBoundingClientRect(); await move(r.left + 30, r.top + r.height / 2); await wait(30); }
  const look = rows.find((b) => /Look & motion/.test(b.textContent));
  if (look) {
    const r = look.getBoundingClientRect(); await move(r.left + 20, r.top + r.height / 2); await move(r.left + 40, r.top + r.height / 2);
    await until(() => menuOpen('menu-fly'), 2000);
    const fly = menuOpen('menu-fly');
    if (fly) for (const f of [...fly.querySelectorAll(':scope > button')].slice(0, 8)) { const q = f.getBoundingClientRect(); await move(q.left + 30, q.top + q.height / 2); await wait(30); }
  }
  sample('lab-menu'); await shot('lab-menu');
  await wait(1500); // (held open over the playing picture)
  await key('Escape'); hideMenu?.(); await settle();
});
await seg('dock', async () => {
  const agent = H.agents().find((a) => a.dock === 'three'); if (!agent) throw new Error('no docked director');
  const dv = Native.view(agent.id);
  Native.sendText(agent.id, 'huge-40k');
  await until(() => dv?.list?.querySelector('.msg.streaming .body')?.textContent.length > 200, 15000);
  const [x, y] = mid(dv.list);
  for (let i = 0; i < 16; i++) { await move(x + (i % 8) * 6, y + (i % 5) * 10); await wait(60); }
  sample('dock'); out.loopsDock = loops(); await shot('dock');
  try { window.hub.stop(H.activeChat[agent.id]); } catch { /* ended */ }
});
if (lab) { try { c.play?.(false); } catch { /* stopped */ } }

const tr = await smoke({ trace: 'stop', detail: true });
if (SIZE) await cdp('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 0, mobile: false }).catch(() => null);
const d = tr.detail || {};
const S = {};
for (const name of segs) {
  const s = d.segments?.[name]; if (!s) continue;
  const rd = s.render || {};
  S[name] = {
    frames: s.frames.n, over4: s.frames.over4, over8: s.frames.over8,
    paint: `${rd.paints}× ${rd.paintMs}ms`, rasterMs: rd.rasterMs,
    gpu: { frames: rd.gpuFrames, ms: rd.gpuMs, perFrame: rd.gpuFrames ? Math.round((rd.gpuMs / rd.gpuFrames) * 10) / 10 : null, cpuPerFrame: rd.gpuFrames ? Math.round((rd.gpuCpuMs / rd.gpuFrames) * 10) / 10 : null },
    perSec: out.numbers[`${name}Sec`] ? Math.round(rd.gpuFrames / out.numbers[`${name}Sec`]) : null,
  };
}
out.stretches = S;

// ---------- budgets ----------
const BUDGET = window.G240_BUDGET || {
  blurring: 0, // glass surfaces on screen that blur what's behind them, in any stretch (before: Ctrl/⌘+K 2, each menu 1, a tooltip 1)
  idleLoopsSeen: 0, // infinite animations running on something seen at idle
};
out.budgets = BUDGET;
const over = (k, val, b) => { if (val == null || val > b) fail(`${k}: ${val} (budget ${b})`); };
for (const [name, list] of Object.entries(out.glass)) over(`${name}: glass surfaces that blur what's behind them (${list.join(', ')})`, list.length, BUDGET.blurring);
// reported, not budgeted: the GPU per frame against the same stretch's reference (stream / lab-play). On this software-GL
// machine under load the GPU process draws 1–4 frames a second, so a stretch's frames depend on what else it waits for
// (the times before / after are in docs/upgrades/glass240.md)
const ref = { palette: 'stream', toasts: 'stream', 'lab-menu': 'lab-play' };
for (const [name, r] of Object.entries(ref)) { const a = S[name]?.gpu.perFrame; const b = S[r]?.gpu.perFrame; if (a && b) S[name].gpu.vsRef = Math.round((a / b) * 100) / 100; }
if (out.loopsIdle) over(`idle: infinite animations on something seen (${out.loopsIdle.filter((l) => l.seen).map((l) => l.name).join(', ')})`, out.loopsIdle.filter((l) => l.seen).length, BUDGET.idleLoopsSeen);
if (window.G240_REPORT) { out.reportOnly = out.problems; out.problems = []; }
return JSON.stringify(out, null, 1);
