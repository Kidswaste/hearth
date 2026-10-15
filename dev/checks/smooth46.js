// The 240 Hz pass over rounds 44–45 (round 46, smooth46): what the newest code does inside the owner's everyday
// gestures, counted (counts don't move with this machine's load the way milliseconds do), in Forgeheart with the Lab
// loaded, real input (CDP):
//   · right-clicks in the chat on screen (its ⋯ menu): no 'hearth:view' round per press (a press re-activated the chat
//     on screen: ~20 modules told "the view changed", a style pass of the page in each right-click)
//   · menus opening: no page-wide search for an open dialog
//   · the jank watch noting a burst of long frames: at most a page-wide search or two, not two per frame
//   · switching chats from the list (still right: the chat shown, its draft back, the box focused; its handlers reported)
//   · the chats list search: the letter filters first (the projects' grouping is asked only about the matches)
//   · a burst of error notes: placed once in the coming frame, not once per note
//   · a 🅰 type layer moving on a clock: the kinetic plan's question is one object reused frame to frame
// plus the handlers' times (reported). Budgets fail above BUDGET (window.S46_REPORT = 1 reports without failing;
// window.S46_BUDGET overrides).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth46.js
const { wait, until } = M;
const out = { budgets: {}, numbers: {}, problems: [] };
const fail = (m) => out.problems.push(m);
const n = out.numbers;
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const claude = H.claudeAgent();
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(6000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 });
const click = async (x, y, button = 'left') => { await mouse('mousePressed', x, y, { button }); await mouse('mouseReleased', x, y, { button }); };
const esc = async () => { for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); };
const mid = (el) => { const r = el.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 80), r.top + r.height / 2]; };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const BUDGET = window.S46_BUDGET || {
  viewPerPress: 0, // 'hearth:view' rounds per right-click in the chat on screen (before: 1)
  dialogSearchPerMenu: 0, // page-wide `dialog[open]` searches per menu opened (before: 1)
  searchesPerBurst: 2, // page-wide searches while the jank watch notes 30 long frames in a burst (before: 60)
  skipAsksPerLetter: 40, // the projects' grouping asked about chats for a first letter (300 more chats, 12 match; before: every chat)
  kinArgObjects: 2, // distinct plan questions over ~1 s of a 🅰 layer moving on a clock (before: one per frame and hit)
  toastPlacesPerBurst: 1, // a burst of 10 error notes in one go: placed / docked-chat searches (before: 10 each)
};
out.budgets = BUDGET;
const over = (name, v, b) => { if (v == null || v > b) fail(`${name}: ${v} (budget ${b})`); };

// ---------- the owner's look, the Lab loaded, a long chat ----------
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
activate('tool:three'); await wait(400);
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 30000);
await wait(1500);
const at0 = Date.now() - 86400000;
const para = (i) => `Reply ${i}: some **bold** text and \`code\`.\n\n- one\n- two`;
const mk = async (title, count, ago = 0) => {
  const c = { id: `s46-${Math.random().toString(36).slice(2, 8)}`, agentId: claude.id, title, createdAt: at0 - ago, updatedAt: at0 - ago + count, messages: Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}`, at: at0 - ago + i })) };
  await window.hub.saveChat(c);
  H.chats = [{ id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: false }, ...H.chats.filter((x) => x.id !== c.id)];
  return c;
};
const C = [await mk('S46 long chat', 300), await mk('S46 chat A', 40, 1000), await mk('S46 chat B', 20, 2000)];
if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
Panel.render(); await settle();
activate(claude.id); await wait(300);
Native.open(claude.id, C[0].id);
await until(() => Native.view(claude.id)?.list.querySelectorAll('.msg').length >= 20, 15000);
await wait(1200);
const v = Native.view(claude.id);

// ---------- right-clicks in the chat on screen ----------
let views = 0;
addEventListener('hearth:view', () => { views += 1; });
let dlgSearches = 0;
for (const fn of ['querySelector', 'querySelectorAll']) {
  const orig = Document.prototype[fn];
  Document.prototype[fn] = function (sel) { if (typeof sel === 'string' && sel.includes('dialog[open]')) dlgSearches += 1; return orig.call(this, sel); };
}
const optBtn = () => [...v.root.querySelectorAll('.native-head button')].find((b) => b.getAttribute('aria-label') === 'Chat options' && b.getBoundingClientRect().width);
const hs = { mousedown: [], contextmenu: [] };
for (const t of Object.keys(hs)) {
  addEventListener(t, (e) => { if (e.isTrusted) e.__s46 = performance.now(); }, true);
  addEventListener(t, (e) => { if (e.__s46) hs[t].push(performance.now() - e.__s46); });
}
await click(...mid(optBtn()), 'right'); await settle(); await esc(); await settle(); // (the first opening loads its parts)
for (const t of Object.keys(hs)) hs[t].length = 0;
views = 0; dlgSearches = 0;
let menus = 0;
let inOpen = 0; // (counted from the press to the menu on screen: Esc's own handlers look for dialogs, as they should)
for (let i = 0; i < 4; i++) {
  const d0 = dlgSearches;
  await click(...mid(optBtn()), 'right'); await settle();
  inOpen += dlgSearches - d0;
  if (document.getElementById('menu') && !document.getElementById('menu').hidden) menus += 1;
  await esc(); await settle();
}
dlgSearches = inOpen;
n.press = { menusOpened: menus, viewRounds: views, dialogSearches: dlgSearches, mousedownMs: { p50: pct(hs.mousedown, 0.5), p95: pct(hs.mousedown, 0.95) }, contextmenuMs: { p50: pct(hs.contextmenu, 0.5), p95: pct(hs.contextmenu, 0.95) } };
if (menus !== 4) fail(`right-click on the chat's ⋯ should open its menu each time (${menus} of 4)`);
over('hearth:view rounds per right-click in the chat on screen', menus ? views / 4 : null, BUDGET.viewPerPress);
over('page-wide dialog searches per menu opened', menus ? dlgSearches / 4 : null, BUDGET.dialogSearchPerMenu);
// a press in another place still makes it the one on screen (the Lab → the chat by a press in the chat isn't possible
// while hidden, so: the chat surface marked active, a press in it keeps it so; the rail switches as before)
activate('tool:three'); await settle();
activate(claude.id); await settle();
if (H.activeId !== claude.id || !H.surfaces.get(claude.id)?.el.classList.contains('active')) fail('the chat should be the one on screen again');

// ---------- the jank watch: a burst of long frames ----------
{
  let searches = 0;
  const orig = Document.prototype.querySelector;
  Document.prototype.querySelector = function (sel) { if (typeof sel === 'string' && /\.palette|dialog\[open\]/.test(sel)) searches += 1; return orig.call(this, sel); };
  const J = window.Jank?._test;
  if (!J?.frame) fail('Jank._test.frame is missing');
  else {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) J.frame({ duration: 60, startTime: t0 + i, scripts: [] });
  }
  Document.prototype.querySelector = orig;
  n.longFrames = { notes: 30, pageSearches: searches };
  over('page-wide searches while 30 long frames are noted', searches, BUDGET.searchesPerBurst);
  // …and what's open still counts: a dialog opened by a key is "dialogs" right away
  const d = document.createElement('dialog'); d.textContent = 'smooth46'; document.body.append(d); d.showModal();
  dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
  const area = J?.viewArea?.();
  d.close(); d.remove();
  dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
  const back = J?.viewArea?.();
  n.longFrames.areas = [area, back];
  if (area !== 'dialogs' || back !== 'chat') fail(`long frames: the area with a dialog open should be "dialogs", then "chat" (got ${area}, ${back})`);
}

// ---------- switching chats from the list ----------
{
  store.set(`draft.${claude.id}.${C[2].id}`, 'half a thought');
  const clicks = [];
  addEventListener('click', (e) => { if (e.isTrusted) e.__s46 = performance.now(); }, true);
  addEventListener('click', (e) => { if (e.__s46) clicks.push(performance.now() - e.__s46); });
  const rowOf = (id) => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`);
  let ok = 0;
  for (let k = 0; k < 2; k++) {
    for (const c of [C[1], C[2], C[0]]) {
      const row = rowOf(c.id);
      if (!row) { fail(`no row for ${c.title}`); continue; }
      row.scrollIntoView({ block: 'nearest' }); await settle();
      const [x, y] = mid(row);
      await move(x, y); await wait(140); await click(x, y); await wait(500);
      if (H.activeChat[claude.id] === c.id && document.activeElement === v.input && v.paneKey === c.id) ok += 1;
      if (c === C[2] && v.input.value !== 'half a thought') fail(`the chat's draft should come back (got ${JSON.stringify(v.input.value)})`);
    }
  }
  n.switch = { switches: 6, right: ok, clickHandlersMs: { p50: pct(clicks, 0.5), p95: pct(clicks, 0.95) } };
  if (ok !== 6) fail(`switching chats: the chat clicked shown, drawn and its box focused (${ok} of 6)`);
}

// ---------- a burst of error notes (errorcalm's toasts) ----------
{
  let places = 0; let docks = 0;
  const H0 = window.Hints; const d0 = H0?.dodge;
  if (H0 && d0) H0.dodge = function (...a) { places += 1; return d0.apply(this, a); };
  const q0 = Document.prototype.querySelector;
  Document.prototype.querySelector = function (sel) { if (typeof sel === 'string' && sel.includes('.tool-dock')) docks += 1; return q0.call(this, sel); };
  for (let i = 0; i < 10; i++) toast(`smooth46 burst ${i}: ENOENT, open '/tmp/smooth46-${i}'`, { type: 'error', timeout: 1500 });
  await settle(); await settle();
  Document.prototype.querySelector = q0;
  if (H0 && d0) H0.dodge = d0;
  const shown = document.querySelectorAll('#toasts > .toast').length;
  n.toasts = { notes: 10, shown, placed: places, dockSearches: docks };
  if (shown !== 5) fail(`a burst of 10 notes shows the newest 5 (shows ${shown})`);
  over('notes placed (dodge) for a burst of 10 in one go', places, BUDGET.toastPlacesPerBurst);
  over('page-wide docked-chat searches for a burst of 10 notes', docks, BUDGET.toastPlacesPerBurst);
  document.querySelectorAll('#toasts > .toast').forEach((t) => t.remove());
}

// ---------- the chats list search ----------
{
  for (let i = 0; i < 300; i++) H.chats.push({ id: `s46f-${i}`, agentId: claude.id, title: i % 25 === 0 ? `S46 neon filler ${i}` : `S46 filler ${i}`, updatedAt: at0 - 5000 - i, pinned: false });
  H.chats = H.chats.slice(); // (a new list: the model sorts it again)
  let asks = 0;
  const hook = () => { asks += 1; return false; };
  Panel.hooks.skip.push(hook);
  Panel.render(); await settle();
  const per = [];
  for (const q of ['n', 'ne', 'neo', 'neon']) { asks = 0; Panel.setFilter(q); Panel.flush(); per.push(asks); await settle(); }
  const shown = document.querySelectorAll('#chat-groups .item[data-key^="s46f-"]').length;
  Panel.setFilter(''); Panel.flush();
  Panel.hooks.skip.splice(Panel.hooks.skip.indexOf(hook), 1);
  H.chats = H.chats.filter((c) => !String(c.id).startsWith('s46f-'));
  Panel.render(); await settle();
  n.search = { chats: 300, skipAsksPerLetter: per, neonRows: shown };
  if (shown !== 12) fail(`the search "neon" should show the 12 matching chats (shows ${shown})`);
  over('the projects\' grouping asked about chats for the first letter ("n")', per[0], BUDGET.skipAsksPerLetter);
}

// ---------- a 🅰 type layer moving on a clock ----------
{
  activate('tool:three'); await wait(600);
  const D = ThreeLab.director;
  const ev = async (code) => { for (let i = 0; i < 6; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(400); } return null; };
  try {
    await D.newSketch('smooth46 type', `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#07080c'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`, 1);
    await wait(2500);
    await LabKineticHook.lib(() => 1);
    const r = await LabKinetic.apply('typewriter', { text: 'SMOOTH AT TWO FORTY' });
    await wait(3000);
    const got = await ev(`return await new Promise((res) => { const K = globalThis.kinetic; if (!K) { res(null); return; } const was = K.plan; const seen = new Set(); let calls = 0; K.plan = function (P, a) { seen.add(a); calls += 1; return was.call(this, P, a); }; setTimeout(() => { K.plan = was; const st = window.__labType.info().find((x) => x.kin); res(JSON.stringify({ calls, objects: seen.size, kin: st ? st.kin : null, glyphs: st ? st.glyphs : 0 })); }, 1200); })`);
    const k = got ? JSON.parse(got) : null;
    n.kinetic = { layer: r?.layer || null, ...(k || {}) };
    if (!k || !k.calls) fail(`the 🅰 layer should plan its steps every frame (${JSON.stringify(k)})`);
    else {
      over('distinct plan questions over ~1 s of a 🅰 layer', k.objects, BUDGET.kinArgObjects);
      if (!k.kin || typeof k.kin.k !== 'number') fail(`the 🅰 layer's readout should carry its step (${JSON.stringify(k.kin)})`);
    }
  } catch (err) { fail(`🅰 type layer: ${err.message}`); }
}

if (window.S46_REPORT) { out.reportOnly = out.problems; out.problems = []; }
out.pass = out.problems.length === 0;
return JSON.stringify(out, null, 1);
