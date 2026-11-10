// (round 170, switch170) a newly shown chat costs less to draw (docs/upgrades/switch170.md), ONE check. Its own temp
// data folder and profile (smoke.js), the fake engines; never an owner's data. 3 projects × 2 chats of 200 turns.
// What this round found: on this box (software GL) a chat switch's graphics-process CPU is nearly all the chat's
// entrance (polish.css .chat-enter: the list fades and slides up for 240 ms): every frame of it redraws the window,
// and a list that fades is a group of layers (its box, its scrolled content, its scrollbar) with an opacity, drawn
// into an offscreen picture and blended in, every frame. Over a solid colour (the list's --solid-back) the fade is now a
// cover of that colour clearing over the list, and the list only slides: the same pixels, no offscreen pass.
// Rastering the new chat itself was small (a chat kept from before vs one drawn afresh: ≈ 70 ms of the GPU process).
//   cover    during an entrance over a solid colour: a cover of the list's colour over exactly the list's box, the list
//            animates transform only, nothing but the cover animates opacity; the cover is gone once it ends, also when
//            you switch again mid-entrance; none with /motion off or Lite mode (where nothing animates)
//   pixels   the window mid-entrance (paused at 3 moments) and after it, this way vs the old way (the old animation put
//            back with a style), plain and Forgeheart: ≤ 3 levels of 255 anywhere (the scrollbar counted apart)
//   switches GPU-process CPU and the window's main-thread task ms per switch: switching between two chats kept from
//            before, and project switches through 6 chats (each drawn afresh), plain and Forgeheart, this way and the
//            old way in turn, 2 rounds: all switches ≤ 92 % of the old way's GPU-process CPU (each kind reported,
//            failing only when > 105 %)
//   memory   the window's and the GPU process' private memory after the switches, this way vs the old way: reported,
//            failing when the window grew > 10 MB more than the old way's
// window.S170_REPORT = 1: report without failing. window.S170_SHOTS = '<dir>': keep the pictures.
//   node dev/smoke.js --fake-engines --check-timeout 1700000 --script dev/checks/switch170.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const out = { problems: [], cantTell: [] };
const bad = (m) => out.problems.push(m);
const B = { maxLevels: 3, switches: 0.92, kind: 1.05, memMB: 10 };
const OLD = ':root:not([data-motion=off]) .chat-enter.chat-covered { animation-name: hx-chat !important; } .chat-cover { display: none !important; }';
const sum = (a) => a.reduce((x, y) => x + y, 0);
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- the numbers ----------
const gpuWin = async (mem = false) => { const m = (await T({ metrics: true, mem }))?.metrics || { procs: [], pages: [] }; let gpu = 0; let win = 0; let gpuMem = 0; let winMem = 0; for (const q of m.procs) { if (q.type === 'GPU') { gpu += q.cpuS || 0; gpuMem += q.priv || 0; } if (m.pages.some((p) => p.pid === q.pid && p.type === 'window' && /index\.html/.test(p.url))) { win += q.cpuS || 0; winMem += q.priv || 0; } } return { gpu, win, gpuMem, winMem }; };
const perf = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const x of r?.metrics || []) o[x.name] = x.value; return o; };
await smoke({ cdp: 'Performance.enable', params: {} });
async function cost(fn) {
  const a = await gpuWin(); const p0 = await perf();
  await fn();
  const b = await gpuWin(); const p1 = await perf();
  return { gpuMs: Math.round((b.gpu - a.gpu) * 1000), taskMs: Math.round((p1.TaskDuration - p0.TaskDuration) * 1000) };
}

// ---------- the chats ----------
await until(() => performance.now() > 25000, 40000); // (the start's own work first)
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); await until(() => ProjChats._ok(), 20000);
const reply = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? ['```js', ...Array.from({ length: 8 }, (_, j) => `const v${j} = scene.getObjectByName('layer${i}_${j}');`), '```'].join('\n') : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.'].join('\n');
const fixture = (N, tag) => { const t0 = Date.now() - N * 60000; return { id: `s170-${tag}-${Date.now()}`, agentId: claude.id, title: `Session ${tag}`, createdAt: t0, updatedAt: Date.now(), messages: Array.from({ length: N }, (_, i) => (i % 2 === 0 ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000 } : { role: 'assistant', text: reply(i), at: t0 + i * 60000, usage: { input: 2000 + i, output: 300 + i } })) }; };
const projects = []; const chats = {};
for (let k = 0; k < 3; k++) {
  const p = Projects.create({ name: `Switch project ${k + 1}` }); projects.push(p); ProjChats.setScope(p.id); await wait(300); chats[p.id] = [];
  for (let j = 0; j < 2; j++) {
    const c = fixture(200, `${k}${j}`); await window.hub.saveChat(c); Native.save(c);
    H.chats = [{ id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: false }, ...H.chats.filter((x) => x.id !== c.id)];
    Projects.add(p, 'chat', c.id, c.title, { links: false }); chats[p.id].push(c.id);
  }
}
await Projects.flush?.();
const view = () => Native.view(claude.id);
const list = () => view().list;
const all = projects.flatMap((p) => chats[p.id].map((id) => [p.id, id]));
const shown = (id) => H.activeChat[claude.id] === id && list()?.querySelectorAll('.msg').length >= 20;
const openChat = async (id, settle = 1500) => { Native.open(claude.id, id); await until(() => shown(id), 15000, 20); if (settle) await wait(settle); };
const sw = async (pid, id) => { ProjChats.setScope(pid); await wait(500); await openChat(id); };
for (const [pid, id] of all) await sw(pid, id);
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: innerHeight - 10 } }); // (no hover)
const oldStyle = document.createElement('style'); oldStyle.id = 's170-old'; document.head.append(oldStyle);
const oldWay = (on) => { oldStyle.textContent = on ? OLD : ''; };
const root = document.documentElement;
const LOOKS = { plain: () => { delete root.dataset.skin; delete root.dataset.look; }, forge: () => { root.dataset.skin = 'forge'; root.dataset.look = 'v2'; } };
const was = { skin: root.dataset.skin, look: root.dataset.look };
const setLook = async (k) => { LOOKS[k](); await wait(1500); };
const rect = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); };

// ---------- cover: what an entrance is made of ----------
out.cover = {};
for (const look of ['plain', 'forge']) {
  await setLook(look);
  const target = all[look === 'plain' ? 4 : 5][1];
  let seen = null;
  Native.open(claude.id, target);
  await until(() => { const l = list(); if (!l?.classList.contains('chat-enter') || H.activeChat[claude.id] !== target) return false; const c = l.chatCover; seen = { solid: l.classList.contains('solid-back'), cover: Boolean(c?.isConnected), sameBox: c ? rect(c) === rect(l) : false, coverColor: c ? getComputedStyle(c).backgroundColor === getComputedStyle(l).backgroundColor : false, listAnims: l.getAnimations().map((a) => [...new Set(a.effect.getKeyframes().flatMap((f) => Object.keys(f).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))))].join('+')), coverAnims: c ? c.getAnimations().map((a) => a.animationName) : [] }; return true; }, 5000, 5);
  await wait(800);
  out.cover[look] = { ...seen, leftover: document.querySelectorAll('.chat-cover').length, classLeft: list().classList.contains('chat-enter') };
  const s = out.cover[look];
  if (!seen) out.cantTell.push(`cover ${look}: the entrance was not seen`);
  else if (!seen.solid) out.cantTell.push(`cover ${look}: the list is not over a solid colour here (${list().backWhy})`);
  else {
    if (!seen.cover || !seen.sameBox || !seen.coverColor) bad(`cover ${look}: no cover of the list's colour over exactly the list (${JSON.stringify(seen)})`);
    if (seen.listAnims.some((x) => x !== 'transform')) bad(`cover ${look}: the list still animates more than its place (${seen.listAnims.join(', ')})`);
  }
  if (s.leftover || s.classLeft) bad(`cover ${look}: the entrance left ${s.leftover} cover(s) / its class behind`);
}
await setLook('plain');
{ // switched again mid-entrance: one cover at most, none after
  Native.open(claude.id, all[4][1]); await until(() => shown(all[4][1]), 8000, 10); await wait(60);
  Native.open(claude.id, all[5][1]); await until(() => shown(all[5][1]), 8000, 10); await wait(30);
  const mid = document.querySelectorAll('.chat-cover').length; await wait(900);
  out.cover.again = { mid, after: document.querySelectorAll('.chat-cover').length, parkedWithCover: [...document.querySelectorAll('.messages.parked')].filter((l) => l.chatCover).length };
  if (out.cover.again.mid > 1 || out.cover.again.after || out.cover.again.parkedWithCover) bad(`cover: switching again mid-entrance left covers (${JSON.stringify(out.cover.again)})`);
}
for (const [name, on, off] of [['/motion off', () => { root.dataset.motion = 'off'; }, () => { delete root.dataset.motion; }], ['Lite mode', () => root.setAttribute('data-lite', ''), () => root.removeAttribute('data-lite')]]) {
  const m0 = root.dataset.motion; const l0 = root.getAttribute('data-lite');
  on(); await wait(300);
  await openChat(all[4][1], 200); await openChat(all[5][1], 600);
  const n = document.querySelectorAll('.chat-cover').length;
  if (m0 == null) delete root.dataset.motion; else root.dataset.motion = m0;
  if (l0 == null) root.removeAttribute('data-lite'); else root.setAttribute('data-lite', l0);
  void off;
  (out.cover.off ||= {})[name] = n;
  if (n) bad(`cover: ${n} cover(s) with ${name} (nothing animates there)`);
  await openChat(all[4][1], 1200); // (the entrance left from its class: a normal switch puts it right)
}

// ---------- pixels: the same either way, mid-entrance and after ----------
let shotN = 0;
const shot = async () => { if (window.S170_SHOTS) await smoke({ shot: `${window.S170_SHOTS}/s170-${++shotN}.png` }); return (await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png' } }))?.data; };
const px = async (d) => { const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
const barOf = () => { const r = list()?.getBoundingClientRect(); return r ? [Math.floor(r.right - 16), Math.floor(r.top) - 12, Math.ceil(r.right), Math.ceil(r.bottom) + 12] : null; };
function compare(A, Bp, w, bar) {
  let n = 0; let mx = 0; let over = 0; let inBar = 0; const box = [1e9, 1e9, -1, -1];
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - Bp[i]), Math.abs(A[i + 1] - Bp[i + 1]), Math.abs(A[i + 2] - Bp[i + 2]));
    if (!d) continue;
    const x = (i / 4) % w; const y = Math.floor(i / 4 / w);
    if (bar && x >= bar[0] && x < bar[2] && y >= bar[1] && y < bar[3]) { inBar += 1; continue; }
    n += 1; mx = Math.max(mx, d);
    if (d > B.maxLevels) { over += 1; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  }
  return { differ: n, maxLevels: mx, overMax: over, where: over ? box : undefined, scrollbarPx: inBar };
}
// an entrance paused at `at` ms (both the list's and its cover's animations, so the moment is the same either way)
const MOMENTS = [30, 100, 170];
async function entranceAt(at, target, from) {
  await openChat(from, 900);
  const caret = document.activeElement; caret?.blur?.();
  Native.open(claude.id, target);
  const anims = await until(() => { const l = list(); if (H.activeChat[claude.id] !== target || !l.classList.contains('chat-enter')) return null; const a = [...l.getAnimations(), ...(l.chatCover?.getAnimations() || [])].filter((x) => /^hx-chat/.test(x.animationName)); return a.length ? a : null; }, 5000, 1);
  if (!anims) return null;
  for (const a of anims) { a.pause(); a.currentTime = at; }
  document.activeElement?.blur?.();
  await wait(400);
  const d = await shot();
  for (const a of anims) a.play();
  await wait(500);
  return d;
}
out.pixels = {};
for (const look of ['plain', 'forge']) {
  await setLook(look);
  const [from, target] = [all[4][1], all[5][1]];
  for (const at of [...MOMENTS, 'after']) {
    const take = async () => (at === 'after' ? (async () => { await openChat(from, 900); await openChat(target, 1200); document.activeElement?.blur?.(); await wait(400); return shot(); })() : entranceAt(at, target, from));
    oldWay(false); const A = await take();
    oldWay(true); const Bd = await take();
    oldWay(false);
    if (!A || !Bd) { out.cantTell.push(`pixels ${look} ${at}: no entrance to pause`); continue; }
    const c = compare(await px(A), await px(Bd), innerWidth, barOf());
    out.pixels[`${look} ${at}`] = c;
    if (c.maxLevels > B.maxLevels) bad(`pixels ${look} ${at === 'after' ? 'after the entrance' : `${at} ms into the entrance`}: differs from the old way (${c.differ} pixels, up to ${c.maxLevels} levels, ${c.overMax} over ${B.maxLevels} in ${c.where})`);
  }
}
await setLook('plain');

// ---------- switches: this way and the old way in turn ----------
const KINDS = {
  kept: async () => { for (let i = 0; i < 4; i++) { await wait(500); await openChat(all[4 + (i % 2)][1]); } },
  projects: async () => { for (let i = 0; i < 6; i++) await sw(...all[i]); },
};
const COUNT = { kept: 4, projects: 6 };
out.switches = {};
out.memory = { now: [], old: [] };
for (const look of ['plain', 'forge']) {
  await setLook(look);
  for (let r = 0; r < 2; r++) {
    for (const way of ['now', 'old']) {
      oldWay(way === 'old'); await openChat(all[4][1], 1500);
      for (const [k, fn] of Object.entries(KINDS)) { const c = await cost(fn); const a = (out.switches[`${look} ${k}`] ||= { now: [], old: [] }); a[way].push({ gpuMs: Math.round(c.gpuMs / COUNT[k]), taskMs: Math.round(c.taskMs / COUNT[k]) }); }
      if (look === 'plain') { await wait(1500); const m = await gpuWin(true); out.memory[way].push({ winMB: Math.round(m.winMem / 1024), gpuMB: Math.round(m.gpuMem / 1024) }); }
    }
  }
}
oldWay(false);
let gNow = 0; let gOld = 0;
out.table = [];
for (const [k, a] of Object.entries(out.switches)) {
  const m = (w, f) => sum(a[w].map((x) => x[f])) / a[w].length;
  a.gpuNowMs = Math.round(m('now', 'gpuMs')); a.gpuOldMs = Math.round(m('old', 'gpuMs')); a.taskNowMs = Math.round(m('now', 'taskMs')); a.taskOldMs = Math.round(m('old', 'taskMs'));
  a.ratio = r2(a.gpuNowMs / Math.max(1, a.gpuOldMs));
  gNow += a.gpuNowMs * COUNT[k.split(' ')[1]]; gOld += a.gpuOldMs * COUNT[k.split(' ')[1]];
  out.table.push(`${k}: GPU process ${a.gpuOldMs} → ${a.gpuNowMs} ms a switch (${a.ratio}) · window main thread ${a.taskOldMs} → ${a.taskNowMs} ms`);
  if (a.ratio > B.kind) bad(`switches ${k}: ${a.ratio} × the old way's GPU-process CPU (> ${B.kind}: worse)`);
}
out.switchesRatio = r2(gNow / Math.max(1, gOld));
if (out.switchesRatio > B.switches) bad(`switches: all of them cost the graphics process ${out.switchesRatio} × the old way (> ${B.switches}): ${out.table.join(' · ')}`);
{
  const m = (w, f) => Math.round(sum(out.memory[w].map((x) => x[f])) / Math.max(1, out.memory[w].length));
  out.memory.winMB = `${m('old', 'winMB')} → ${m('now', 'winMB')}`; out.memory.gpuMB = `${m('old', 'gpuMB')} → ${m('now', 'gpuMB')}`;
  if (m('now', 'winMB') - m('old', 'winMB') > B.memMB) bad(`memory: the window holds ${m('now', 'winMB') - m('old', 'winMB')} MB more than the old way after the switches`);
}
if (was.skin == null) delete root.dataset.skin; else root.dataset.skin = was.skin;
if (was.look == null) delete root.dataset.look; else root.dataset.look = was.look;

if (window.S170_REPORT) { out.unenforced = out.problems; out.problems = []; }
out.ok = !out.problems.length;
out.pass = out.ok;
return JSON.stringify(out, null, 1);
