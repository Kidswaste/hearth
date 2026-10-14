// Accessibility audit (round 40, a11y): axe-like rules written here (no network, no library), run on the places the
// owner uses: the chat with its list, ⋯ AI setup, Settings, ◎ missions, Ctrl/⌘+K Find anything, a right-click menu,
// the Lab (sliders + knobs) and its pickers (✦ effects, 🔎 Lab search). Counts per rule, per place:
//   · unnamed       a control (button, link, field, role=button / switch / tab / slider / option / menuitem…) whose
//                   accessible name has no word in it: nothing at all, or only a symbol ("⋯", "◎", "✕", an emoji),
//                   which is what VoiceOver / Narrator would read (a title is only a fallback, after the text)
//   · noRole        something you can click or Tab to that isn't a control and says nothing about what it is: a
//                   focusable non-control without a role, the outermost pointer-cursor element without one
//   · noState       a role without its state: switch / checkbox without aria-checked, slider without aria-valuenow,
//                   tab without aria-selected, option without aria-selected
//   · imgNoAlt      a picture with no alt
//   · posTabindex   tabindex > 0 (breaks the order)
// Then, by keyboard (real key presses over CDP):
//   · focusRing     every Tab stop of the chat window shows a visible change when focused (outline, shadow, border,
//                   background), in every look: the full Tab walk in the owner's look, a sample of controls in the rest
//   · tabOrder      the walk: skip link first (to the chat box), no stop on something invisible, no stop twice in a
//                   row (a trap), the chat box reached, Shift+Tab walks back
//   · escReturn     Esc closes the top-most thing and focus returns to what opened it: AI setup, Settings, missions,
//                   Find anything, a menu (arrows move a real focus in it), the Lab's ✦ picker and 🔎 search
//   · contrast      key text against what's behind it in every look (WCAG AA: 4.5:1 body and small text; 3:1 for
//                   placeholders and big titles) — reply, your message, chat titles, list rows, hints, the chat box
//   · forcedColors  Windows High Contrast emulated (Emulation.setEmulatedMedia forced-colors: active): no control in
//                   the chat window or the Lab whose icon / text turns invisible (same color as behind it, or an icon
//                   drawn as a mask / background picture only), and focus still shows
//   · live          replies are announced politely once (not per token): a polite live region gets the finished
//                   reply; toasts / hints sit in a polite status region; a fake streamed reply changes the live
//                   region at most twice
//   · reducedMotion with the OS setting emulated, opening AI setup moves nothing (motionpolish checks the rest)
// The result's "counts" is the before / after table in docs/upgrades/a11y.md. Fails when a count is over its budget.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/a11y.js --shot /tmp/a11y.png
// window.A11Y_ONLY = ['surfaces', 'focus', 'esc', 'contrast', 'forced', 'live', 'motion'] runs some parts only.
const BUDGET = { unnamed: 0, noRole: 0, noState: 0, imgNoAlt: 0, posTabindex: 0, focusRing: 0, tabOrder: 0, escReturn: 0, contrast: 0, forcedColors: 0, live: 0, reducedMotion: 0 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; };
const cdp = (method, params = {}) => smoke({ cdp: method, params });
const KEYS = { Tab: ['Tab', 9], Escape: ['Escape', 27], Enter: ['Enter', 13], ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38], ' ': ['Space', 32] };
async function key(k, { shift = false } = {}) {
  const [code, vk] = KEYS[k];
  const p = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p, ...(k === 'Enter' ? { text: '\r' } : k === ' ' ? { text: ' ' } : {}) });
  if (k === 'Enter' || k === ' ') await cdp('Input.dispatchKeyEvent', { type: 'char', ...p, text: k === 'Enter' ? '\r' : ' ' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  await wait(40);
}
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const ONLY = window.A11Y_ONLY || null;
const part = (n) => !ONLY || ONLY.includes(n);
const out = { counts: Object.fromEntries(Object.keys(BUDGET).map((k) => [k, 0])), places: {}, examples: {}, looks: {} };
const note = (rule, where, what) => {
  out.counts[rule] += 1;
  const l = (out.examples[rule] ||= []); const t = `${where}: ${what}`; const same = l.find((x) => x.t === t);
  if (same) same.n += 1; else if (l.length < 60) l.push({ t, n: 1 });
};

// ---------- the rules ----------
const vis = (n) => Boolean(n) && n.isConnected && n.checkVisibility?.({ visibilityProperty: true, opacityProperty: false }) && (() => { const r = n.getBoundingClientRect(); return r.width > 1 && r.height > 1; })();
const CONTROL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=switch], [role=checkbox], [role=radio], [role=tab], [role=slider], [role=option], [role=menuitem], [role=menuitemcheckbox], [role=combobox], [role=spinbutton]';
const NATIVE = 'button, a[href], input, select, textarea, summary, label, iframe, webview, video, audio';
const textOf = (n) => {
  let t = '';
  const walk = (x) => {
    for (const c of x.childNodes) {
      if (c.nodeType === 3) t += c.textContent;
      else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !c.hidden && getComputedStyle(c).display !== 'none') {
        if (c.tagName === 'IMG') t += c.getAttribute('alt') || '';
        else if (c.getAttribute('aria-label')) t += ` ${c.getAttribute('aria-label')} `;
        else if (c.namespaceURI === 'http://www.w3.org/2000/svg') t += c.querySelector?.('title')?.textContent || '';
        else walk(c);
      }
    }
  };
  walk(n);
  return t.replace(/\s+/g, ' ').trim();
};
function accName(n) {
  const lb = n.getAttribute('aria-labelledby');
  if (lb) return lb.split(/\s+/).map((i) => textOf(document.getElementById(i) || document.createElement('i'))).join(' ').trim();
  if (n.getAttribute('aria-label')?.trim()) return n.getAttribute('aria-label').trim();
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) {
    const l = [...(n.labels || [])].map(textOf).join(' ').trim();
    if (l) return l;
    if (n.type === 'button' || n.type === 'submit') return n.value || '';
    return n.getAttribute('placeholder') || n.title || '';
  }
  return textOf(n) || n.title || '';
}
const worded = (s) => /[\p{L}\p{N}]{2,}/u.test(s || '');
const desc = (n) => `${n.tagName.toLowerCase()}${n.classList?.length ? `.${[...n.classList].slice(0, 2).join('.')}` : ''}${n.getAttribute('role') ? `[${n.getAttribute('role')}]` : ''} "${(n.textContent || n.getAttribute('aria-label') || '').trim().slice(0, 14)}" ${n.title ? `(${n.title.slice(0, 30)})` : ''}`.trim();
function audit(where, root = document.body) {
  const c = { unnamed: 0, noRole: 0, noState: 0, imgNoAlt: 0, posTabindex: 0, controls: 0 };
  const add = (rule, n) => { c[rule] += 1; note(rule, where, desc(n)); };
  const ctrls = [...root.querySelectorAll(CONTROL)].filter(vis);
  c.controls = ctrls.length;
  for (const n of ctrls) if (!worded(accName(n))) add('unnamed', n);
  for (const n of root.querySelectorAll('[tabindex]')) {
    if (!vis(n)) continue;
    if (n.tabIndex > 0) add('posTabindex', n);
    if (n.tabIndex >= 0 && !n.matches(NATIVE) && !n.getAttribute('role') && !n.isContentEditable && !n.matches('[data-a11y-root], dialog, .code-editor *, .cm-content')) add('noRole', n);
  }
  // the outermost pointer-cursor thing that isn't a control (its children inherit the cursor)
  for (const n of root.querySelectorAll('div, span, li, i, b, em, strong, p, svg, img')) {
    if (!vis(n) || n.closest(`${NATIVE}, [role]`) || n.querySelector(`${NATIVE}, [role], [tabindex]`)) continue;
    if (getComputedStyle(n).cursor !== 'pointer') continue;
    const p = n.parentElement;
    if (p && getComputedStyle(p).cursor === 'pointer' && !p.matches('body, #app')) continue;
    if (n.closest('[aria-hidden="true"], .md, .msg-text, .three-preview, .code-editor')) continue; // reply text (links inside are real <a>), the Lab picture
    add('noRole', n);
  }
  for (const n of root.querySelectorAll('[role=switch], [role=checkbox], [role=menuitemcheckbox]')) if (vis(n) && !n.hasAttribute('aria-checked')) add('noState', n);
  for (const n of root.querySelectorAll('[role=slider]')) if (vis(n) && !n.hasAttribute('aria-valuenow')) add('noState', n);
  for (const n of root.querySelectorAll('[role=tab], [role=option]')) if (vis(n) && !n.hasAttribute('aria-selected')) add('noState', n);
  for (const n of root.querySelectorAll('img')) if (vis(n) && !n.hasAttribute('alt')) add('imgNoAlt', n);
  out.places[where] = c;
  return c;
}

// ---------- colors ----------
// rgb() / rgba(), and color(srgb r g b / a) (what color-mix() computes to)
const parse = (s) => {
  const c = String(s).match(/color\(srgb\s+([^)]+)\)/);
  if (c) { const p = c[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 }; }
  const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
};
const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function bgOf(n) {
  const layers = [];
  for (let x = n; x; x = x.parentElement) {
    const s = getComputedStyle(x);
    const c = parse(s.backgroundColor);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
  }
  let bg = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
  if (bg.a < 1) bg = over(bg, { r: 255, g: 255, b: 255, a: 1 });
  for (const l of layers.reverse()) bg = over(l, bg);
  return bg;
}
function contrastOf(n, pseudo) {
  const s = getComputedStyle(n, pseudo || null);
  let fg = parse(s.color); if (!fg) return null;
  const bg = bgOf(n);
  fg = over({ ...fg, a: fg.a * (pseudo ? 1 : Number(s.opacity) || 1) }, bg);
  // a faded ancestor fades the text too
  for (let x = n.parentElement; x && x !== document.body; x = x.parentElement) { const o = Number(getComputedStyle(x).opacity); if (o < 1) fg = over({ ...fg, a: o }, bg); }
  return Math.round(ratio(fg, bg) * 100) / 100;
}

// ---------- setup: a chat with replies, the panel open ----------
const claude = H.claudeAgent();
const at0 = Date.now() - 200000;
const chat = { id: `a11y-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'Accessibility test chat', createdAt: at0, updatedAt: at0, messages: [
  { role: 'user', text: 'How do I make the orb pulse on the kick?', at: at0 },
  { role: 'assistant', text: 'Open **Layers & sliders**, then ♪ on the Size slider and pick *the kick*. Here is the code:\n\n```js\norb.scale.setScalar(1 + audio.kick * 0.3);\n```\n\nA [link](https://example.com) too.', at: at0 + 1000 },
  { role: 'user', text: 'Thanks!', at: at0 + 2000 },
] };
await window.hub.saveChat(chat); Native.save(chat);
activate(claude.id); await until(() => Native.hasView(claude.id));
Native.open(claude.id, chat.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 3, 8000);
if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
await wait(1500);
const view = () => Native.view(claude.id);
const box = () => view().root.querySelector('form.composer textarea, .composer textarea');
const S = {}; // where things are, for the later parts

// ---------- 1. the places ----------
if (part('surfaces')) {
  audit('chat window');
  // ⋯ AI setup, every fold open
  view().root.querySelector('.native-head button[aria-label="Chat options"]')?.click();
  const sheet = await until(() => document.querySelector('aside.opt-sheet'), 8000);
  if (sheet) { await wait(400); sheet.querySelectorAll('details').forEach((d) => { d.open = true; }); await settle(); await wait(250); audit('AI setup', sheet); (typeof Options !== 'undefined' && Options.hide()); }
  await wait(200);
  // Settings, every fold open
  await AppUI.openSettings(); const sd = await until(() => document.querySelector('dialog.settings-dialog[open]'));
  if (sd) { sd.querySelectorAll('details').forEach((d) => { d.open = true; }); await settle(); await wait(250); audit('Settings', sd); sd.close(); }
  await wait(200);
  // ◎ missions (More open)
  view().root.querySelector('.ms-btn')?.click();
  const pop = await until(() => document.querySelector('.ms-pop'));
  if (pop) { pop.querySelectorAll('details').forEach((d) => { d.open = true; }); await settle(); await wait(250); audit('missions', pop); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); pop.remove(); }
  // Find anything
  AppUI.palette(); const pal = await until(() => document.querySelector('.palette'));
  if (pal) { await wait(500); audit('Find anything', pal); pal.remove(); }
  // a right-click menu (a chat row)
  const row = document.querySelector('#chat-groups .item');
  if (row) { const r = row.getBoundingClientRect(); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 8 })); const m = await until(() => !$('menu').hidden && $('menu')); if (m) { audit('menu', m); hideMenu(); } }
}

// ---------- the Lab ----------
let lab = null;
async function openLab() {
  if (lab) { activate('tool:three'); await wait(400); return lab; }
  activate(claude.id); await wait(200);
  if (!H.agents().some((a) => a.dock === 'three')) {
    Commands.tryRun('/director-setup', claude.id);
    await until(() => [...document.querySelectorAll('dialog[open] button')].some((b) => /Add it/.test(b.textContent)) || H.agents().some((a) => a.dock === 'three'), 6000);
    [...document.querySelectorAll('dialog[open] button')].find((b) => /Add it/.test(b.textContent))?.click();
    await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
  }
  activate('tool:three'); await wait(300);
  const c = await ThreeLab.cmd();
  await until(() => ThreeLab.director && ThreeLab.scenes, 15000);
  const tpl = ThreeData.TEMPLATES.find((t) => (t.code || '').split('tweak(').length > 4) || ThreeData.TEMPLATES[0];
  c.newSketch(tpl.name); await wait(2500);
  c.panel(true); await wait(800);
  lab = { c, L: H.surfaces.get('tool:three')?.el };
  return lab;
}
if (part('surfaces') || part('esc') || part('forced')) {
  try {
    const { L } = await openLab();
    await until(() => L.querySelector('.tw-range input[type=range], svg.tw-knob'), 8000);
    for (const d of L.querySelectorAll('details')) if (!d.open && vis(d)) d.open = true;
    await wait(400);
    audit('Lab', L);
    // knobs too
    // named controls: knobs (decimals), an on / off, a color, a choice
    const SKETCH = `import * as THREE from 'three';
const P = tweak({ glow: { value: 0.2, min: 0, max: 2, label: 'Glow' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, spin: { value: true, label: 'Spin' }, tint: { value: '#ff3cac', label: 'Tint' }, mode: { value: 'soft', options: ['soft', 'hard'], label: 'Mode' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 5);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff3cac' })); scene.add(cube);
renderer.setAnimationLoop(() => { scene.background.setScalar(Math.min(1, P.glow * 0.45)); cube.scale.setScalar(P.size); if (P.spin) cube.rotation.y += 0.01; cube.material.color.set(P.tint); renderer.render(scene, camera); });`;
    ThreeLab.openCode(SKETCH);
    await until(() => lab.c.sliders().some((x) => x.key === 'glow'), 12000);
    await wait(800);
    for (const d of L.querySelectorAll('details')) if (!d.open && vis(d)) d.open = true;
    await until(() => L.querySelector('svg.tw-knob'), 4000); await wait(300);
    audit('Lab named controls', L);
    out.knobs = L.querySelectorAll('svg.tw-knob').length;
    out.labKinds = { toggle: L.querySelectorAll('.tw-toggle').length, color: L.querySelectorAll('.tw-color').length, seg: L.querySelectorAll('.tw-seg').length };
    if (typeof ThreeFX !== 'undefined') { ThreeFX.openPicker('add'); const p = await until(() => document.querySelector('.fx-picker')); if (p) { await wait(300); audit('Lab ✦ picker', p); ThreeFX.close?.(); p.isConnected && p.querySelector('button[title^="Close"]')?.click(); } }
    if (typeof LabSearchHook !== 'undefined') { await LabSearchHook.open(); const d = await until(() => document.querySelector('dialog.ls-dlg[open]'), 15000); if (d) { await wait(300); audit('Lab search', d); if (typeof LabSearch !== 'undefined') LabSearch.close(); } }
  } catch (e) { out.labError = String(e.message || e); }
  activate(claude.id); await wait(500);
}

// ---------- 2. focus rings and the Tab order ----------
const SNAP = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'backgroundColor', 'color', 'textDecorationLine'];
// the control, and up to three boxes around it (a chat box shows focus on its frame: :focus-within)
const snap = (n) => { const s = getComputedStyle(n); const up = []; for (let x = n.parentElement, i = 0; x && i < 3; x = x.parentElement, i++) { const p = getComputedStyle(x); up.push(p.boxShadow, p.borderTopColor, p.outlineStyle, p.backgroundColor); } return JSON.stringify([...SNAP.map((k) => s[k]), ...up]); };
// transitions / animations off while measuring: the focused end state, not a frame of the fade into it
const still = (on) => { let s = document.getElementById('a11y-still'); if (on && !s) { s = el('style', { id: 'a11y-still', text: '*, *::before, *::after { transition: none !important; animation: none !important; }' }); document.head.append(s); } else if (!on) s?.remove(); };
const shows = (n) => { const on = snap(n); const keep = document.activeElement; n.blur(); const off = snap(n); keep?.focus?.({ preventScroll: true }); return on !== off; };
async function walk(where, n = 70) {
  // start from the top of the page: a throwaway focus target first in <body>
  const top = document.createElement('span'); top.tabIndex = -1; document.body.prepend(top); top.focus(); 
  const stops = [];
  let stuck = 0;
  for (let i = 0; i < n; i++) {
    await key('Tab');
    if (top.isConnected) top.remove();
    const a = document.activeElement;
    if (!a || a === document.body) { stops.push('(body)'); continue; }
    if (stops.length && stops.at(-1).node === a) stuck += 1;
    stops.push({ node: a, vis: vis(a) || a.matches('.a11y-skip'), ring: shows(a) });
    if (stops.filter((s) => s.node === a).length > 2) break; // went round
  }
  return { stops, stuck };
}
if (part('focus')) {
  still(true);
  const looks = Object.keys(AppUI.THEMES);
  const was = { ...(H.config.theme || {}) };
  const setLook = (id) => { H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES[id], preset: id }; delete H.config.theme.label; delete H.config.theme.group; applyTheme(document.getElementById('user-theme').textContent); };
  // the full walk, in the owner's look
  setLook('forgeheart'); await wait(400);
  const w = await walk('chat window');
  const real = w.stops.filter((s) => s !== '(body)');
  out.tab = { stops: real.length, first: real[0] ? desc(real[0].node) : null, composer: real.some((s) => s.node === box()), noRing: real.filter((s) => !s.ring).length };
  for (const s of real) { if (!s.ring) note('focusRing', 'forgeheart', desc(s.node)); if (!s.vis) note('tabOrder', 'hidden stop', desc(s.node)); }
  if (w.stuck) note('tabOrder', 'trap', `${w.stuck} repeated stops`);
  if (!real[0]?.node.matches('.a11y-skip')) note('tabOrder', 'skip link', `first stop is ${real[0] ? desc(real[0].node) : 'nothing'}, not "Skip to the chat"`);
  if (!out.tab.composer) note('tabOrder', 'chat box', 'never reached by Tab');
  // the skip link goes to the chat box
  const skip = document.querySelector('.a11y-skip');
  if (skip) { const t0 = document.createElement('span'); t0.tabIndex = -1; document.body.prepend(t0); t0.focus(); await key('Tab'); t0.remove(); await key('Enter'); await settle(); if (document.activeElement !== box()) note('tabOrder', 'skip link', `Enter put focus on ${desc(document.activeElement || document.body)}`); }
  // Shift+Tab walks back
  box()?.focus(); const fwd = document.activeElement; await key('Tab', { shift: true }); const back = document.activeElement; await key('Tab');
  if (back === fwd || document.activeElement !== fwd) note('tabOrder', 'Shift+Tab', 'does not walk back and forth from the chat box');
  // every look: the controls the walk met (a sample of distinct kinds), keyboard focus, a visible change
  const kinds = new Map();
  for (const s of real) { const k = `${s.node.tagName}.${s.node.classList[0] || ''}`; if (!kinds.has(k)) kinds.set(k, s.node); }
  const sample = [...kinds.values()].slice(0, 30);
  for (const id of looks) {
    setLook(id); await settle();
    await key('Tab'); // keyboard modality
    let bad = 0;
    for (const n of sample) { if (!n.isConnected || !vis(n)) continue; n.focus({ preventScroll: true }); if (document.activeElement === n && !shows(n)) { bad += 1; note('focusRing', id, desc(n)); } }
    (out.looks[id] ||= {}).noRing = bad;
  }
  H.config.theme = was; applyTheme(document.getElementById('user-theme').textContent); await settle();
  still(false);
}

// ---------- 3. Esc closes the top-most thing; focus goes back ----------
async function escCase(name, opener, isOpen, { how = 'Enter' } = {}) {
  const o = typeof opener === 'function' ? opener() : opener;
  if (!o) { note('escReturn', name, 'no opener found'); return; }
  o.focus(); await key('Tab'); await key('Tab', { shift: true }); // keyboard modality, focus back on the opener
  if (document.activeElement !== o) o.focus();
  if (how === 'Enter') await key('Enter'); else await how(o);
  const open = await until(isOpen, 8000);
  if (!open) { note('escReturn', name, 'did not open'); return; }
  await wait(250);
  const inside = open.contains?.(document.activeElement);
  if (!inside && !/menu|Find anything/.test(name)) note('escReturn', name, `focus did not move into it (on ${desc(document.activeElement || document.body)}; open: ${A11y._open.map((x) => x.root.className).join(', ')}; same: ${open === isOpen()})`);
  const at = desc(document.activeElement || document.body);
  const seen = []; const onWin = (e) => seen.push(`win:${e.defaultPrevented}`); const onRoot = () => seen.push('root'); const onCap = (e) => seen.push(`cap:${desc(e.target)}`);
  addEventListener('keydown', onWin); addEventListener('keydown', onCap, true); open.addEventListener?.('keydown', onRoot, true);
  await key('Escape');
  removeEventListener('keydown', onWin); removeEventListener('keydown', onCap, true); open.removeEventListener?.('keydown', onRoot, true); await settle(); await wait(150);
  if (await until(() => !isOpen(), 1500) === null) note('escReturn', name, `Esc did not close it (focus on ${at}; ${typeof Options !== 'undefined' ? `sheet same: ${Options.sheet?.root === isOpen()}, page: ${Options.sheet?.page}` : ''}; open: ${A11y._open.map((x) => x.root.className).join(', ')}; keys: ${seen.join(' ')})`);
  else if (document.activeElement !== o) note('escReturn', name, `focus went to ${desc(document.activeElement || document.body)}, not back to ${desc(o)}`);
}
if (part('esc')) {
  activate(claude.id); await wait(300);
  if (window.A11Y_DEBUG) { const r = await cdp('Runtime.evaluate', { expression: "[...getEventListeners(window).keydown, ...getEventListeners(document).keydown].filter((l) => l.useCapture).map((l) => String(l.listener).slice(0, 220))", includeCommandLineAPI: true, returnByValue: true }); out.listeners = r.result?.value; }
  await escCase('AI setup', () => view().root.querySelector('.native-head button[aria-label="Chat options"]'), () => document.querySelector('aside.opt-sheet'));
  await escCase('Settings', () => $('config-btn')?.checkVisibility() ? $('config-btn') : [...document.querySelectorAll('#rail button')].find((b) => /Settings/.test(b.title) && vis(b)), () => document.querySelector('dialog.settings-dialog[open]'));
  await escCase('missions', () => view().root.querySelector('.ms-btn'), () => document.querySelector('.ms-pop'));
  await escCase('Find anything', () => box(), () => document.querySelector('.palette'), { how: async () => { AppUI.palette(); } });
  // a menu: opened from the keyboard (the rail's ⋯ More), arrows move a real focus
  {
    const more = [...document.querySelectorAll('#rail button')].find((b) => /^More\b/.test(b.title) && vis(b));
    await escCase('menu', () => more, () => (!$('menu').hidden ? $('menu') : null), { how: async () => { await key('Enter'); await wait(200); await key('ArrowDown'); await key('ArrowDown'); const f0 = document.activeElement; const f = f0?.getAttribute('aria-activedescendant') ? document.getElementById(f0.getAttribute('aria-activedescendant')) : f0; if (!$('menu').contains(f) || f.getAttribute('role') !== 'menuitem') note('escReturn', 'menu', `arrow keys don't move focus into the menu (on ${desc(f || document.body)})`); } });
  }
  // nested: a menu over Settings: Esc closes the menu first, then Settings
  {
    await AppUI.openSettings(); const sd = await until(() => document.querySelector('dialog.settings-dialog[open]'));
    if (sd) { showMenu(200, 200, [{ label: 'One', action() {} }, { label: 'Two', action() {} }]); await wait(100); await key('Escape'); await settle(); if (!$('menu').hidden || !sd.open) note('escReturn', 'menu over Settings', 'Esc did not close only the menu'); await key('Escape'); await settle(); if (sd.open) { note('escReturn', 'menu over Settings', 'second Esc left Settings open'); sd.close(); } }
  }
  try {
    const { L } = await openLab();
    const fxBtn = [...L.querySelectorAll('button')].find((b) => vis(b) && /^✦/.test(b.textContent.trim()) && /effect|add|More/i.test(b.title || b.getAttribute('aria-label') || ''));
    if (fxBtn && typeof ThreeFX !== 'undefined') await escCase('Lab ✦ picker', fxBtn, () => document.querySelector('.fx-picker'), { how: async (o) => { ThreeFX.openPicker('add', { anchor: o }); } });
    const lsBtn = L.querySelector('.ls-btn');
    if (lsBtn) await escCase('Lab search', lsBtn, () => document.querySelector('dialog.ls-dlg[open]'));
  } catch (e) { note('escReturn', 'Lab', String(e.message || e)); }
  activate(claude.id); await wait(400);
}

// ---------- 4. contrast in every look ----------
const TEXTS = [
  ['reply', () => view().list.querySelector('.msg.assistant p'), 4.5],
  ['your message', () => view().list.querySelector('.msg.user'), 4.5],
  ['code in a reply', () => view().list.querySelector('.msg.assistant pre code'), 4.5],
  ['chat title', () => view().root.querySelector('.native-head .chat-title, .native-head h2, .native-head b, .native-head .title'), 4.5],
  ['chat list row', () => document.querySelector('#chat-groups .item:not(.active) .item-title') || document.querySelector('#chat-groups .item-title'), 4.5],
  ['chat list group', () => document.querySelector('#chat-groups .group-name'), 4.5],
  ['message time', () => view().list.querySelector('.msg-time'), 4.5],
  ['chat box text', () => box(), 4.5],
  ['chat box placeholder', () => box(), 3, '::placeholder'],
  ['search chats placeholder', () => $('chat-search'), 3, '::placeholder'],
];
if (part('contrast')) {
  still(true); // (a message's entrance fade would read as faint text)
  const was = { ...(H.config.theme || {}) };
  for (const id of Object.keys(AppUI.THEMES)) {
    H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES[id], preset: id }; delete H.config.theme.label; delete H.config.theme.group;
    applyTheme(document.getElementById('user-theme').textContent); await settle(); await wait(60);
    const res = {};
    for (const [label, find, min, pseudo] of TEXTS) {
      const n = find(); if (!n || !vis(n)) continue;
      // measured until it holds still (a look change may cross-fade colors)
      let r = contrastOf(n, pseudo); for (let k = 0; k < 10; k++) { await wait(120); const r2 = contrastOf(n, pseudo); if (r2 === r) break; r = r2; }
      if (r == null) continue;
      res[label] = r;
      if (r < min) note('contrast', id, `${label} ${r}:1 (needs ${min})`);
    }
    (out.looks[id] ||= {}).contrast = res;
  }
  H.config.theme = was; applyTheme(document.getElementById('user-theme').textContent); await settle();
  still(false);
}

// ---------- 5. Windows High Contrast (forced colors) ----------
async function forcedScan(where, root) {
  for (const n of [...root.querySelectorAll('button, [role=button], [role=switch], [role=tab], a[href]')].filter(vis).slice(0, 400)) {
    const s = getComputedStyle(n);
    const bg = bgOf(n);
    const icon = n.querySelector('svg');
    const masked = [n, ...n.querySelectorAll('*')].some((x) => { const cs = getComputedStyle(x); return (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none'); });
    const hasText = worded(n.textContent) || /\S/.test(n.textContent);
    if (masked && !hasText) { note('forcedColors', where, `${desc(n)}: icon drawn as a mask`); continue; }
    if (icon && !hasText) {
      const parts = [...icon.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')];
      const seen = parts.some((p) => { const ps = getComputedStyle(p); return [ps.stroke, ps.fill].some((c) => { const x = parse(c); return x && x.a > 0 && ratio(over(x, bg), bg) >= 2; }); });
      if (parts.length && !seen) note('forcedColors', where, `${desc(n)}: icon the same color as behind it`);
    } else if (hasText) {
      const fg = parse(s.color);
      if (fg && ratio(over(fg, bg), bg) < 2) note('forcedColors', where, `${desc(n)}: text the same color as behind it`);
    }
  }
}
if (part('forced')) {
  still(true);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] }); await settle(); await wait(300);
  out.forcedMatches = matchMedia('(forced-colors: active)').matches;
  activate(claude.id); await wait(400);
  await forcedScan('chat window', document.body);
  // focus still shows
  const b = view().root.querySelector('.ms-btn'); if (b) { b.focus(); await key('Tab'); await key('Tab', { shift: true }); if (document.activeElement === b && !shows(b)) note('forcedColors', 'chat window', 'no focus ring on ◎'); }
  try { const { L } = await openLab(); await forcedScan('Lab', L); } catch { /* the Lab is optional here */ }
  activate(claude.id); await wait(300);
  await cdp('Emulation.setEmulatedMedia', { features: [] }); await settle();
  still(false);
}

// ---------- 6. announcements ----------
if (part('live')) {
  const polite = [...document.querySelectorAll('[aria-live="polite"], [role=status], [role=log]')];
  out.liveRegions = polite.map((n) => n.id || n.className).slice(0, 8);
  toast('a11y check toast', { timeout: 1500 });
  const tb = $('toasts');
  if (!tb || !(tb.getAttribute('aria-live') === 'polite' || tb.getAttribute('role') === 'status')) note('live', 'toasts', 'the notifications are not in a polite status region');
  const live = document.querySelector('#a11y-live');
  // a tip that shows by itself is read out (Hints.essential: the path every essential note takes)
  if (live && window.Hints?.essential) { const n = Hints.essential(() => { const d = el('div', { class: 'a11y-test-tip', text: 'A tip to be read out' }); document.body.append(d); return d; }); await wait(300); if (!/tip to be read/.test(live.textContent)) note('live', 'hints', 'a tip is not read out'); n?.remove(); }
  if (!live) note('live', 'replies', 'no polite region for finished replies');
  else {
    let changes = 0;
    const mo = new MutationObserver((l) => { changes += l.length ? 1 : 0; });
    mo.observe(live, { childList: true, characterData: true, subtree: true });
    Native.newChat(claude.id); await wait(300);
    const t = box(); t.value = 'long answer please'; t.dispatchEvent(new Event('input', { bubbles: true }));
    t.closest('form').requestSubmit();
    const done = await until(() => !Native.isBusy?.(H.activeChat[claude.id]) && /replied|answer/i.test(live.textContent), 40000);
    mo.disconnect();
    out.liveChanges = changes; out.liveText = live.textContent.slice(0, 120);
    if (!done) note('live', 'replies', `the finished reply was not announced (${live.textContent.slice(0, 60)})`);
    if (changes > 3) note('live', 'replies', `the live region changed ${changes} times for one reply (per token?)`);
  }
}

// ---------- 7. reduced motion ----------
if (part('motion')) {
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await settle();
  activate(claude.id); await wait(300);
  view().root.querySelector('.native-head button[aria-label="Chat options"]')?.click();
  await wait(30);
  const moving = document.getAnimations().filter((a) => { const kf = a.effect?.getKeyframes?.() || []; const t = a.effect?.getComputedTiming?.() || {}; return t.duration > 20 && (kf.some((k) => k.transform && k.transform !== 'none') || /transform|translate|scale/.test(a.transitionProperty || '')); });
  out.reducedMoving = moving.map((a) => `${a.effect?.target?.className || '?'}: ${a.animationName || a.transitionProperty}`).slice(0, 6);
  for (const m of out.reducedMoving) note('reducedMotion', 'AI setup', m);
  await wait(400); (typeof Options !== 'undefined' && Options.hide());
  await cdp('Emulation.setEmulatedMedia', { features: [] });
}

const over_ = Object.entries(out.counts).filter(([k, v]) => v > BUDGET[k]).map(([k, v]) => `${k} ${v} > ${BUDGET[k]}`);
out.pass = !over_.length;
if (over_.length) out.problems = over_;
return JSON.stringify(out, null, 1);
