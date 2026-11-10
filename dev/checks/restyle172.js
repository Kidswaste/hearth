// (round 172, restyle172) everyday actions restyle only what they change (docs/upgrades/restyle172.md), ONE check. Its own
// temp data folder and profile (smoke.js), the fake engines; never an owner's data. 40 short chats in a project and one of
// 120 turns, the plain look (Forgeheart for the resize). Each action is traced (the window's renderer) and the elements its style passes restyled are
// counted (UpdateLayoutTree's elementCount):
//   blur     another app in front for 5 s (idlecpu's hush: every animation rests) and Hearth in front again: each ≤ B.hush
//            elements (a `:root[data-blurhush] *` rule restyled the whole page both ways); a busy dot rests while away
//            and runs again; no CSS animation left running while hushed
//   hidden   the window hidden and shown (juice.js' data-away): each ≤ B.hush; the dot rests while hidden
//   hush     a minute without input (idlecpu's data-hush: the look's loops rest), on and off: each ≤ B.idleHush (its
//            `.tabbar button` reached every button of the page)
//   first    the first wheel turn after 13 s without input (bgmain's steady caret, round 171): ≤ B.first, no pass over
//            B.share of a whole-page pass (the old blur way's, measured here)
//   typing   5 letters typed in the chat box: ≤ B.typing in all
//   rows     the pointer over 10 rows of the chats list: ≤ B.rows in all
//   menu     a row's right-click menu opened and closed with Esc: ≤ B.menu in all
//   insert   (round 173) a row arriving on top of the chats list: ≤ B.insert in all (`:nth-child(n+14)` restyled every
//            later row; now panel.js' .row-far), and .row-far on exactly the rows past the 13th child, after two
//            arrive and after they leave
//   alt      Alt held (the tucked buttons): the rail's tucked button shows with its dashed outline and goes with Alt;
//            biggest pass ≤ B.altEls, all passes ≤ B.altAll (round 173: the tucked controls carry .alt-reveal while
//            shown, so the rules keyed on .reveal-alt reach only them, not every button, span and titled element), and
//            ≤ B.alt × the old `.reveal-alt *` way's; round 172's per-selector rules are put back for the report
//   resize   Forgeheart, the window made narrower and back: ≤ B.resize (the lights' places, custom properties on the
//            chat's wrap, were inherited by every message: each resize frame restyled the whole chat)
// The old way of blur / hidden / Alt (their page-wide rules put back) is measured in the same run and reported.
// window.R172_REPORT = 1: report without failing.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/restyle172.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const cdp = (method, params) => smoke({ cdp: method, params });
const out = { problems: [], cantTell: [], actions: {}, old: {} };
const bad = (m) => out.problems.push(m);
const B = { hush: 60, first: 400, share: 0.5, typing: 150, rows: 150, menu: 300, alt: 0.25, resize: 300, idleHush: 100, insert: 60, altEls: 150, altAll: 650 };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
const key = async (k, code, opts = {}) => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: opts.vk || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0), ...(type === 'keyDown' && opts.text ? { text: opts.text } : {}) }); };
const center = (n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
// one action traced: the elements each style pass of the window restyled
async function restyled(fn, settle = 600) {
  await wait(250);
  await smoke({ trace: 'start' });
  try { await fn(); } finally { await wait(settle); }
  const r = await smoke({ trace: 'stop', window: true });
  const els = r?.window?.styleEls || [];
  return { elements: sum(els), passes: els.length, biggest: Math.max(0, ...els), styleMs: r?.window?.styleMs ?? null };
}
const oldRule = (css) => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); return () => s.remove(); };

// ---------- the chats ----------
await until(() => performance.now() > 25000, 40000); // (the start's own work first)
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); await until(() => ProjChats._ok(), 20000);
const reply = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another', '', i % 4 === 1 ? ['```js', 'const a = 1;', 'const b = 2;', '```'].join('\n') : 'A paragraph of plain words to give it some height.'].join('\n');
const t0 = Date.now() - 60 * 3600e3; const ids = [];
for (let i = 0; i < 40; i++) { const at = t0 + i * 3600e3; const c = { id: `r172l-${i}-${Date.now()}`, agentId: claude.id, title: `Session ${i}: tweaks`, createdAt: at, updatedAt: at, messages: [{ role: 'user', text: `hi ${i}`, at }, { role: 'assistant', text: `ok ${i}`, at: at + 1000 }] }; await window.hub.saveChat(c); Native.save(c); ids.push(c.id); }
const big = { id: `r172b-${Date.now()}`, agentId: claude.id, title: 'Long session', createdAt: Date.now() - 9e6, updatedAt: Date.now(), messages: Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? { role: 'user', text: `Question ${i}: what about this?`, at: Date.now() - 9e6 + i * 6e4 } : { role: 'assistant', text: reply(i), at: Date.now() - 9e6 + i * 6e4 })) };
await window.hub.saveChat(big); Native.save(big); ids.push(big.id);
H.chats = [...ids.map((id) => ({ id, agentId: claude.id, title: id, updatedAt: Date.now(), pinned: false })), ...H.chats.filter((x) => !ids.includes(x.id))];
const p = Projects.create({ name: 'Restyle project' }); ProjChats.setScope(p.id); await wait(300);
for (const id of ids) Projects.add(p, 'chat', id, id, { links: false });
await Projects.flush?.(); ProjChats.setScope(p.id); await wait(1500);
Native.open(claude.id, big.id); await until(() => Native.view(claude.id).list?.querySelectorAll('.msg').length >= 20, 15000); await wait(1500);
const v = () => Native.view(claude.id);
const rows = () => [...document.querySelectorAll('#chat-groups .item')];
if (typeof IdleCpu === 'undefined') await Lazy.load('idlecpu');
await mouse('mouseMoved', 600, innerHeight - 30); await wait(1500);
out.page = { elements: document.getElementsByTagName('*').length, rows: rows().length };
if (out.page.rows < 10) out.cantTell.push(`the chats list shows ${out.page.rows} rows (10 wanted)`);

// a busy dot (what a streaming reply shows): an endless animation to rest
const dot = document.createElement('div'); dot.className = 'typing'; dot.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:5'; dot.append(document.createElement('i')); document.body.append(dot);
const running = () => dot.firstChild.getAnimations().filter((x) => x.playState === 'running').length;
const runningAll = () => document.getAnimations().filter((x) => x instanceof CSSAnimation && x.playState === 'running').length;
await wait(300);

// ---------- another app in front, then Hearth again ----------
async function blurCycle() {
  const r = {};
  r.hush = await restyled(async () => { await T({ winEvent: { event: 'blur' } }); await until(() => document.documentElement.hasAttribute('data-blurhush'), IdleCpu.state().blurMs + 4000); }, 400);
  r.hushed = document.documentElement.hasAttribute('data-blurhush'); r.dotRunning = running(); r.running = runningAll();
  r.back = await restyled(async () => { await T({ winEvent: { event: 'focus' } }); await until(() => IdleCpu.state().focused, 3000); });
  await wait(100); r.dotAfter = running();
  return r;
}
{
  const r = await blurCycle(); out.actions.blur = r;
  if (!r.hushed) out.cantTell.push('blur: the hush never came');
  else {
    if (r.hush.elements > B.hush) bad(`blur: the hush restyled ${r.hush.elements} elements (≤ ${B.hush})`);
    if (r.back.elements > B.hush) bad(`blur: Hearth in front again restyled ${r.back.elements} elements (≤ ${B.hush})`);
    if (r.dotRunning || r.running) bad(`blur: animations still running while hushed (the dot ${r.dotRunning}, all ${r.running})`);
    if (!r.dotAfter) bad('blur: the dot did not run again once Hearth was in front');
  }
  const undo = oldRule(':root[data-blurhush] *, :root[data-blurhush] *::before, :root[data-blurhush] *::after { animation-play-state: paused !important; }');
  const o = await blurCycle(); undo(); out.old.blur = { hush: o.hush.elements, back: o.back.elements, hushMs: o.hush.styleMs, backMs: o.back.styleMs };
}

// ---------- the window hidden, then shown ----------
async function hiddenCycle() {
  const r = {};
  const setHidden = (on) => { if (on) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); else delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); };
  try {
    r.hide = await restyled(async () => { setHidden(true); });
    r.away = document.documentElement.hasAttribute('data-away'); r.dotRunning = running();
    r.show = await restyled(async () => { setHidden(false); });
  } finally { if (Object.getOwnPropertyDescriptor(document, 'hidden')) setHidden(false); }
  await wait(100); r.dotAfter = running();
  return r;
}
if (typeof Juice === 'undefined' && window.Lazy) await Lazy.load('juice').catch(() => {});
{
  const r = await hiddenCycle(); out.actions.hidden = r;
  if (!r.away) out.cantTell.push('hidden: data-away never came (juice.js not loaded?)');
  else {
    if (r.hide.elements > B.hush) bad(`hidden: hiding restyled ${r.hide.elements} elements (≤ ${B.hush})`);
    if (r.show.elements > B.hush) bad(`hidden: showing restyled ${r.show.elements} elements (≤ ${B.hush})`);
    if (r.dotRunning) bad('hidden: the dot still ran while the window was hidden');
    if (!r.dotAfter) bad('hidden: the dot did not run again once shown');
  }
  const undo = oldRule(':root[data-away] *, :root[data-away] *::before, :root[data-away] *::after { animation-play-state: paused !important; }');
  const o = await hiddenCycle(); undo(); out.old.hidden = { hide: o.hide.elements, show: o.show.elements, hideMs: o.hide.styleMs, showMs: o.show.styleMs };
}
dot.remove();

// ---------- a minute without input (idlecpu's hush of the look's loops): the attribute both ways ----------
async function hushCycle() {
  const root = document.documentElement; const was = root.hasAttribute('data-hush');
  const on = await restyled(async () => { root.setAttribute('data-hush', ''); });
  const off = await restyled(async () => { if (!was) root.removeAttribute('data-hush'); });
  return { on, off };
}
{
  const r = await hushCycle(); out.actions.hush = r;
  if (r.on.elements > B.idleHush || r.off.elements > B.idleHush) bad(`hush after a minute: ${r.on.elements} / ${r.off.elements} elements restyled (≤ ${B.idleHush})`);
  const undo = oldRule(':root[data-hush] .tabbar button::before, :root[data-hush] .tabbar button::after { animation-play-state: paused !important; }');
  const o = await hushCycle(); undo(); out.old.hush = { on: o.on.elements, off: o.off.elements, onMs: o.on.styleMs };
}

// ---------- the first input after 13 s ----------
await wait(13500);
{
  const r = await restyled(async () => { const [x, y] = center(v().list); await mouse('mouseMoved', x, y); await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: -100 }); });
  out.actions.first = r;
  if (r.elements > B.first) bad(`first input after 13 s: ${r.elements} elements restyled (≤ ${B.first})`);
  const full = out.old.blur?.hush || out.page.elements; // (a whole-page pass, measured above)
  if (r.biggest > B.share * full) bad(`first input after 13 s: one pass restyled ${r.biggest} elements (a whole page: ${full})`);
}

// ---------- typing ----------
{ const [x, y] = center(v().input); await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); await wait(400); }
{
  const r = await restyled(async () => { for (const c of 'hello') { await key(c, `Key${c.toUpperCase()}`, { text: c }); await wait(120); } });
  out.actions.typing = r;
  if (r.elements > B.typing) bad(`typing 5 letters: ${r.elements} elements restyled (≤ ${B.typing})`);
  for (let i = 0; i < 5; i++) { await key('Backspace', 'Backspace', { vk: 8 }); await wait(40); }
}

// ---------- the pointer over the chats list ----------
{
  const r = await restyled(async () => { for (const b of rows().slice(0, 10)) { const [x, y] = center(b); await mouse('mouseMoved', x, y); await wait(80); } });
  out.actions.rows = r;
  if (r.elements > B.rows) bad(`pointer over 10 rows: ${r.elements} elements restyled (≤ ${B.rows})`);
}
await mouse('mouseMoved', 600, innerHeight - 30); await wait(400);

// ---------- a row's menu ----------
{
  const row = rows()[2];
  const r = await restyled(async () => { if (!row) return; const [x, y] = center(row); await mouse('mousePressed', x, y, { button: 'right', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'right', clickCount: 1 }); await until(() => document.querySelector('#menu:not([hidden])'), 3000); await wait(400); await key('Escape', 'Escape', { vk: 27 }); });
  out.actions.menu = r;
  if (!row) out.cantTell.push('menu: no row');
  else if (r.elements > B.menu) bad(`a row's menu opened and closed: ${r.elements} elements restyled (≤ ${B.menu})`);
}

// ---------- (round 173) a row arriving in the chats list ----------
// a new chat on top of the project's 41: each row from the 14th child on skips layout while off screen; that was
// `:nth-child(n+14)`, so each row added or removed restyled every row after the first dozen (now panel.js' .row-far)
const rowOf = (id) => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`);
const addRow = async (n) => {
  const at = Date.now(); const c = { id: `r173n-${n}-${at}`, agentId: claude.id, title: `Arrived ${n}`, createdAt: at, updatedAt: at, messages: [{ role: 'user', text: `new ${n}`, at }] };
  await window.hub.saveChat(c); Native.save(c);
  const r = await restyled(async () => { H.chats = [{ id: c.id, agentId: claude.id, title: c.title, updatedAt: at, pinned: false }, ...H.chats]; Projects.add(p, 'chat', c.id, c.id, { links: false }); Panel.render(); await until(() => rowOf(c.id), 3000, 20); });
  r.added = Boolean(rowOf(c.id)); return r;
};
{
  const r = await addRow(1); out.actions.insert = r;
  const undo = oldRule('#chat-groups .group > .item:not(.active):nth-child(n+14) { content-visibility: auto; contain-intrinsic-size: auto 28px; }');
  const o = await addRow(2); undo(); out.old.insert = { elements: o.elements, biggest: o.biggest, styleMs: o.styleMs, added: o.added };
  if (!r.added) out.cantTell.push('a row arriving: no row came');
  else if (r.elements > B.insert) bad(`a row arriving in the chats list: ${r.elements} elements restyled (≤ ${B.insert}; the old way ${o.elements})`);
  const far = rows().filter((x) => x.classList.contains('row-far')).length;
  const want = rows().filter((x) => [...x.parentElement.children].indexOf(x) >= 13).length;
  if (far !== want) bad(`the chats list: ${far} rows carry .row-far, ${want} are past the 13th child`);
  // and gone again: the rows after them move up, the marks follow
  if (typeof Projects.remove === 'function') {
    for (const x of rows().filter((n) => n.dataset.key?.startsWith('r173n-'))) { Projects.remove(p, 'chat', x.dataset.key); H.chats = H.chats.filter((h) => h.id !== x.dataset.key); }
    Panel.render(); await wait(600);
    const far2 = rows().filter((x) => x.classList.contains('row-far')).length;
    const want2 = rows().filter((x) => [...x.parentElement.children].indexOf(x) >= 13).length;
    if (far2 !== want2) bad(`the chats list after two rows left: ${far2} rows carry .row-far, ${want2} are past the 13th child`);
  }
}

// ---------- Alt held ----------
// (round 173, alt173) the tucked controls carry .alt-reveal while shown (declutter.js); the rules keyed on .reveal-alt
// name only that class. Round 172's per-selector rules (`.reveal-alt <x>`, `:root:not(.reveal-alt) <x>`) are put back
// for the report.
const vis = (n) => Boolean(n?.checkVisibility?.({ visibilityProperty: true }));
const tucked = () => document.getElementById(document.querySelector('.hearth-three-spaces') ? 'palette-btn' : 'add-btn'); // (as declutter.js' check)
const shown = { during: null, outlined: null, after: null };
const altHold = () => restyled(async () => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 }); await wait(500);
  if (shown.during == null) { const a = tucked(); shown.during = vis(a); shown.outlined = a ? getComputedStyle(a).outlineStyle : null; }
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 });
});
{
  const r = await altHold(); out.actions.alt = r; await wait(100);
  shown.after = vis(tucked()); out.actions.alt.shown = shown;
  if (!shown.during || shown.outlined !== 'dashed') bad(`Alt held: the rail's tucked button did not show with its dashed outline (${JSON.stringify(shown)})`);
  if (shown.after) bad('Alt let go: the rail\'s tucked button still shows');
  if (r.biggest > B.altEls || r.elements > B.altAll) bad(`Alt held: its biggest pass restyled ${r.biggest} elements (≤ ${B.altEls}), ${r.elements} in all (≤ ${B.altAll})`);
  const undo = oldRule(':root[data-motion=off].reveal-alt * { animation: none !important; }');
  const o = await altHold(); undo(); out.old.alt = { elements: o.elements, biggest: o.biggest, styleMs: o.styleMs };
  if (r.biggest > B.alt * o.biggest) bad(`Alt held: its biggest pass restyled ${r.biggest} elements, the old way ${o.biggest} (≤ ${Math.round(B.alt * 100)} %)`);
  const keep = (x) => (x.keep ? `:not(${x.keep})` : '');
  const split = (s) => { const o = []; let d = 0; let c = ''; for (const ch of s) { if (ch === '(') d += 1; if (ch === ')') d -= 1; if (ch === ',' && !d) { o.push(c.trim()); c = ''; } else c += ch; } if (c.trim()) o.push(c.trim()); return o; };
  const css172 = Declutter.REVEAL.filter((x) => !Declutter.pinned(x.id)).flatMap((x) => split(x.sel).map((s) => (x.mode === 'alt'
    ? `.reveal-alt ${s}${keep(x)} { outline-offset: 1px; }`
    : `:root:not(.reveal-alt) ${x.host}:not(:hover) ${s}${keep(x)} { outline-offset: 0; }`))).join('\n');
  const undo172 = oldRule(css172);
  const o2 = await altHold(); undo172(); out.old.alt172 = { elements: o2.elements, biggest: o2.biggest, styleMs: o2.styleMs };
}

// ---------- Forgeheart: the window resized ----------
{
  Look.applyPreset('forgeheart', { quiet: true });
  const wrap = () => v().list?.parentElement;
  const lit = await until(() => wrap()?.classList.contains('tint-back'), 8000); await wait(800);
  const resize = () => restyled(async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: innerWidth - 120, height: innerHeight, deviceScaleFactor: 0, mobile: false }); await wait(300); await cdp('Emulation.clearDeviceMetricsOverride', {}); });
  if (!lit) out.cantTell.push('resize: the chat in Forgeheart has no lights (tint-back) to place');
  else {
    const r = await resize(); out.actions.resize = r;
    if (r.elements > B.resize) bad(`Forgeheart, the window resized: ${r.elements} elements restyled (≤ ${B.resize})`);
    const undo = oldRule('.messages-wrap > *:not(#r172-none) { --solid-tint: inherit; --tint-at: inherit; --tint-w: inherit; --tint-h: inherit; --solid-tint2: inherit; --tint-at2: inherit; --tint-w2: inherit; --tint-h2: inherit; }');
    const o = await resize(); undo(); out.old.resize = { elements: o.elements, styleMs: o.styleMs };
  }
}

out.pass = window.R172_REPORT ? true : out.problems.length === 0;
return JSON.stringify(out, null, 1);
