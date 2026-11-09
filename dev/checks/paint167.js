// (round 167, paint167) dialogs and switches draw less (docs/upgrades/paint167.md), ONE check. Its own temp data folder
// and profile (smoke.js), the fake engines; never an owner's data. 3 projects × 2 chats of 200 turns, the plain look.
// What this round found: on this box (software GL) the graphics process redraws the whole window for every frame
// (≈ 40–110 ms of its CPU each, whatever changed), so an action costs its frames × what each frame draws. The
// entrances (a dialog, the open surface, the board's empty card, the last message in two looks) filled "both": their
// keyframes are a 'from' only, so the end is the element's own style, but a forwards fill that changes nothing left the
// element on its own GPU layer for good, drawn again in every later frame. They fill "backwards" now.
//   layers   when nothing animates, no layer is kept for an animation (chat, Settings open, the board), and none
//            for the surface or a dialog
//   pixels   the window looks the same either way: the chat and Settings open, this way vs the old way (the old fill
//            put back, the entrance played again): ≤ 2 levels anywhere (what changed by itself left out; the chat's
//            scrollbar counted apart: the old way drew its thumb by another path, 1–3 px longer)
//   frame    one frame's GPU-process CPU (a 3 px dot changed 8 times, in turn with the old way): the chat ≤ 85 % of
//            the old way's, Settings open ≤ 90 %
//   updates  what draws one frame at a time: 17 letters typed in the chat box (one every 250 ms), this way and the old
//            way in turn, twice: ≤ 90 % of the old way's GPU-process CPU
//   actions  Settings open / close ×2, the Mood board open / left, 6 project switches, this way and the old way in
//            turn, twice: GPU-process CPU and the window's main-thread task ms reported. Here an entrance keeps the
//            graphics process busy for as long as it moves (software GL draws as many frames as it can: cheaper frames
//            come out as more frames, a smoother entrance), so these totals follow the entrances' length, not the work
//            per frame: reported, and only a regression (> 115 % of the old way) fails
// window.P167_REPORT = 1: report without failing.
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/paint167.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const out = { problems: [], cantTell: [] };
const bad = (m) => out.problems.push(m);
const B = { maxLevels: 2, frameChat: 0.85, frameDialog: 0.9, updates: 0.9, actions: 1.15 };
const OLD = ':root:not([data-motion=off]) :is(dialog[open], dialog[open]::backdrop, .surface.active, .bd-empty) { animation-fill-mode: both !important; }';

// ---------- the numbers ----------
const sum = (a) => a.reduce((x, y) => x + y, 0);
const gpuWin = async () => { const m = (await T({ metrics: true }))?.metrics || { procs: [], pages: [] }; let gpu = 0; let win = 0; for (const q of m.procs) { if (q.type === 'GPU') gpu += q.cpuS || 0; if (m.pages.some((p) => p.pid === q.pid && p.type === 'window' && /index\.html/.test(p.url))) win += q.cpuS || 0; } return { gpu, win }; };
const perf = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const x of r?.metrics || []) o[x.name] = x.value; return o; };
await smoke({ cdp: 'Performance.enable', params: {} });
async function cost(fn) {
  const a = await gpuWin(); const p0 = await perf();
  await fn();
  const b = await gpuWin(); const p1 = await perf();
  return { gpuMs: Math.round((b.gpu - a.gpu) * 1000), windowMs: Math.round((b.win - a.win) * 1000), taskMs: Math.round((p1.TaskDuration - p0.TaskDuration) * 1000) };
}

// ---------- the chats ----------
await until(() => performance.now() > 25000, 40000); // (the start's own work first)
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); await until(() => ProjChats._ok(), 20000);
const reply = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? ['```js', ...Array.from({ length: 8 }, (_, j) => `const v${j} = scene.getObjectByName('layer${i}_${j}');`), '```'].join('\n') : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.'].join('\n');
const fixture = (N, tag) => { const t0 = Date.now() - N * 60000; return { id: `p167-${tag}-${Date.now()}`, agentId: claude.id, title: `Session ${tag}`, createdAt: t0, updatedAt: Date.now(), messages: Array.from({ length: N }, (_, i) => (i % 2 === 0 ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000 } : { role: 'assistant', text: reply(i), at: t0 + i * 60000, usage: { input: 2000 + i, output: 300 + i } })) }; };
const projects = []; const chats = {};
for (let k = 0; k < 3; k++) {
  const p = Projects.create({ name: `Paint project ${k + 1}` }); projects.push(p); ProjChats.setScope(p.id); await wait(300); chats[p.id] = [];
  for (let j = 0; j < 2; j++) {
    const c = fixture(200, `${k}${j}`); await window.hub.saveChat(c); Native.save(c);
    H.chats = [{ id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: false }, ...H.chats.filter((x) => x.id !== c.id)];
    Projects.add(p, 'chat', c.id, c.title, { links: false }); chats[p.id].push(c.id);
  }
}
await Projects.flush?.();
const list = () => Native.view(claude.id).list;
const openChat = async (id) => { Native.open(claude.id, id); await until(() => H.activeChat[claude.id] === id && list()?.querySelectorAll('.msg').length >= 20, 15000); await wait(400); };
for (const p of projects) { ProjChats.setScope(p.id); await wait(300); for (const id of chats[p.id]) await openChat(id); }
const key = async (k, code) => { for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: { Escape: 27 }[k] || 0 } }); };
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: innerHeight - 10 } }); // (no hover)
const oldStyle = document.createElement('style'); oldStyle.id = 'p167-old'; document.head.append(oldStyle);
const oldWay = (on) => { oldStyle.textContent = on ? OLD : ''; };
const dot = document.createElement('div'); dot.style.cssText = 'position:fixed;left:2px;bottom:2px;width:3px;height:3px;z-index:2147483647;background:#111;pointer-events:none'; document.body.append(dot);
const still = () => !document.getAnimations().some((a) => a.playState === 'running' || a.playState === 'pending');
const replaySurface = async () => { activate('tool:board'); await wait(1800); activate(claude.id); await wait(1500); };
const openSettings = async () => { await AppUI.openSettings(); await until(() => document.querySelector('dialog.settings-dialog[open]'), 5000); await wait(2000); document.activeElement?.blur?.(); await wait(300); }; // (no caret blinking in the pictures)
const closeDialogs = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await wait(500); };

// ---------- layers: none kept for an animation once nothing animates ----------
// (the layer tree is sent with the next commit: the dot changes meanwhile so there is one)
async function layers() {
  for (let k = 0; k < 3; k++) {
    setTimeout(() => { dot.style.background = '#131313'; }, 250); setTimeout(() => { dot.style.background = '#111'; }, 900);
    const r = await smoke({ layers: true, detail: true }).catch(() => null);
    if (r && !r.timedOut && r.list) return r.list;
  }
  return null;
}
const animLayers = (ls) => (ls || []).filter((l) => /Active(Transform|Opacity|Filter)Animation/.test(l.why) || /section\.surface|^dialog/.test(l.who)).map((l) => `${l.who} ${l.w}x${l.h} ${l.why}`);
out.layers = {};
await replaySurface(); await until(still, 3000);
out.layers.chat = { still: still(), kept: animLayers(await layers()) };
await openSettings(); await until(still, 3000);
out.layers.settings = { still: still(), kept: animLayers(await layers()) };
await closeDialogs();
activate('tool:board'); await until(() => window.Board?.isMounted?.(), 10000); await wait(1800); await until(still, 3000);
out.layers.board = { still: still(), kept: animLayers(await layers()) };
activate(claude.id); await wait(1500);
for (const [k, v] of Object.entries(out.layers)) {
  if (v.kept === null || !v.still) out.cantTell.push(`layers ${k}: ${v.kept === null ? 'no layer tree came' : 'something still animated'}`);
  else if (v.kept.length) bad(`layers ${k}: a GPU layer kept for an animation that ended: ${v.kept.join('; ')}`);
}

// ---------- pixels: the same either way ----------
let shotN = 0;
const shot = async () => { await wait(300); if (window.P167_SHOTS) await smoke({ shot: `${window.P167_SHOTS}/p167-${++shotN}.png` }); return (await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png' } }))?.data; };
const px = async (d) => { const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
const dotOff = () => { dot.style.display = 'none'; }; const dotOn = () => { dot.style.display = ''; };
// (the chat's scrollbar is left out: on its own layer the old way's thumb came out 1–3 px longer, drawn by another path;
// counted on its own line)
const barOf = () => { const r = list()?.getBoundingClientRect(); return r ? [Math.floor(r.right - 16), Math.floor(r.top), Math.ceil(r.right), Math.ceil(r.bottom)] : null; };
function compare(A, Bp, A2, w, bar = barOf()) {
  let n = 0; let mx = 0; let noise = 0; let over2 = 0; let inBar = 0; const box = [1e9, 1e9, -1, -1];
  for (let i = 0; i < A.length; i += 4) {
    if (Math.max(Math.abs(A[i] - A2[i]), Math.abs(A[i + 1] - A2[i + 1]), Math.abs(A[i + 2] - A2[i + 2]))) { noise += 1; continue; }
    const d = Math.max(Math.abs(A[i] - Bp[i]), Math.abs(A[i + 1] - Bp[i + 1]), Math.abs(A[i + 2] - Bp[i + 2]));
    if (d && bar) { const x = (i / 4) % w; const y = Math.floor(i / 4 / w); if (x >= bar[0] && x < bar[2] && y >= bar[1] && y < bar[3]) { inBar += 1; continue; } }
    if (d) { n += 1; mx = Math.max(mx, d); }
    if (d > B.maxLevels) { over2 += 1; const x = (i / 4) % w; const y = Math.floor(i / 4 / w); box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  }
  return { px: A.length / 4, differ: n, maxLevels: mx, overMax: over2, where: over2 ? box : undefined, scrollbarPx: inBar, changedByItself: noise };
}
out.pixels = {};
dotOff();
{ // the chat after the surface's entrance
  await replaySurface(); const A = await px(await shot());
  oldWay(true); await replaySurface(); const Bp = await px(await shot());
  oldWay(false); await replaySurface(); const A2 = await px(await shot());
  out.pixels.chat = compare(A, Bp, A2, innerWidth);
}
{ // Settings open, after its entrance
  await openSettings(); const A = await px(await shot()); await closeDialogs();
  oldWay(true); await openSettings(); const Bp = await px(await shot()); await closeDialogs();
  oldWay(false); await openSettings(); const A2 = await px(await shot()); await closeDialogs();
  out.pixels.settings = compare(A, Bp, A2, innerWidth);
}
dotOn();
for (const [k, v] of Object.entries(out.pixels)) {
  if (v.maxLevels > B.maxLevels) bad(`pixels ${k}: the window looks different from the old way (${v.differ} of ${v.px} pixels, up to ${v.maxLevels} levels)`);
  if (v.changedByItself > v.px * 0.2) out.cantTell.push(`pixels ${k}: ${v.changedByItself} pixels changed by themselves between two pictures this way`);
}

// ---------- frame: one frame's GPU-process CPU ----------
const frames = async (n = 8) => { const a = await gpuWin(); for (let i = 0; i < n; i++) { dot.style.background = i % 2 ? '#111' : '#121212'; await wait(300); } return Math.round(((await gpuWin()).gpu - a.gpu) * 1000 / n); };
out.frame = { chat: { now: [], old: [] }, settings: { now: [], old: [] } };
for (let r = 0; r < 2; r++) {
  for (const way of ['now', 'old']) {
    oldWay(way === 'old');
    await replaySurface(); document.activeElement?.blur?.(); await wait(600);
    out.frame.chat[way].push(await frames());
    await openSettings(); await wait(300);
    out.frame.settings[way].push(await frames());
    await closeDialogs();
  }
}
oldWay(false);
for (const k of ['chat', 'settings']) { const f = out.frame[k]; f.ratio = Math.round((sum(f.now) / Math.max(1, sum(f.old))) * 100) / 100; }
if (out.frame.chat.ratio > B.frameChat) bad(`frame chat: a frame costs the graphics process ${out.frame.chat.ratio} × the old way (> ${B.frameChat}): ${JSON.stringify(out.frame.chat)}`);
if (out.frame.settings.ratio > B.frameDialog) bad(`frame settings: a frame with Settings open costs ${out.frame.settings.ratio} × the old way (> ${B.frameDialog}): ${JSON.stringify(out.frame.settings)}`);

// ---------- updates: one frame at a time ----------
const composer = () => Native.view(claude.id).input;
const UPDATES = {
  typing: async () => { const ta = composer(); ta.focus(); await wait(400); const c = await cost(async () => { for (const ch of 'paint less please') { await smoke({ cdp: 'Input.insertText', params: { text: ch } }); await wait(250); } await wait(400); }); ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.blur(); return c; },
};
out.updates = {};
for (let r = 0; r < 2; r++) {
  for (const way of ['now', 'old']) {
    oldWay(way === 'old'); await replaySurface(); await wait(800);
    for (const [k, fn] of Object.entries(UPDATES)) { const c = await fn(); await closeDialogs(); const a = out.updates[k] ||= { now: [], old: [] }; a[way].push(c.gpuMs); await wait(800); }
  }
}
oldWay(false);
{
  let n = 0; let o = 0;
  for (const a of Object.values(out.updates)) { a.ratio = Math.round((sum(a.now) / Math.max(1, sum(a.old))) * 100) / 100; n += sum(a.now); o += sum(a.old); }
  out.updatesRatio = Math.round((n / Math.max(1, o)) * 100) / 100;
  if (out.updatesRatio > B.updates) bad(`updates: typing costs the graphics process ${out.updatesRatio} × the old way (> ${B.updates}): ${JSON.stringify(out.updates)}`);
}

// ---------- actions: as the session audit does them (audit166-measure.js), this way and the old way in turn ----------
const ACTIONS = {
  settings: async () => { await AppUI.openSettings(); await wait(1500); await key('Escape', 'Escape'); await wait(600); await AppUI.openSettings(); await wait(800); await key('Escape', 'Escape'); await wait(600); },
  board: async () => { activate('tool:board'); await wait(4000); activate(claude.id); await wait(1500); },
  switches: async () => { for (let i = 0; i < 6; i++) { ProjChats.setScope(projects[i % 3].id); await wait(500); await openChat(chats[projects[i % 3].id][i % 2]); } },
};
out.actions = {};
for (let r = 0; r < 2; r++) {
  for (const way of ['now', 'old']) {
    oldWay(way === 'old'); await replaySurface(); await wait(1500);
    for (const [k, fn] of Object.entries(ACTIONS)) { const c = await cost(fn); const a = out.actions[k] ||= { now: [], old: [] }; a[way].push(c); await wait(1200); }
  }
}
oldWay(false);
let gNow = 0; let gOld = 0;
for (const a of Object.values(out.actions)) {
  const s = (w, f) => sum(a[w].map((x) => x[f]));
  a.gpuNowMs = s('now', 'gpuMs') / a.now.length; a.gpuOldMs = s('old', 'gpuMs') / a.old.length;
  a.taskNowMs = s('now', 'taskMs') / a.now.length; a.taskOldMs = s('old', 'taskMs') / a.old.length;
  a.ratio = Math.round((a.gpuNowMs / Math.max(1, a.gpuOldMs)) * 100) / 100;
  gNow += a.gpuNowMs; gOld += a.gpuOldMs;
}
out.actionsRatio = Math.round((gNow / Math.max(1, gOld)) * 100) / 100;
out.table = Object.entries(out.actions).map(([k, a]) => `${k}: GPU process ${Math.round(a.gpuOldMs)} → ${Math.round(a.gpuNowMs)} ms (${a.ratio}) · window main thread ${Math.round(a.taskOldMs)} → ${Math.round(a.taskNowMs)} ms`);
if (out.actionsRatio > B.actions) bad(`actions: Settings, the board and 6 switches cost the graphics process ${out.actionsRatio} × the old way (> ${B.actions}: worse, not just the same): ${out.table.join(' · ')}`);

if (window.P167_REPORT) { out.unenforced = out.problems; out.problems = []; }
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
