// (round 168, forge168) Forgeheart frames cheaper, no visible change (docs/upgrades/forge168.md), ONE check. Its own temp
// data folder and profile (smoke.js), the fake engines; never an owner's data. A 200-turn chat in the Forgeheart look.
// What this round found: over the compositor-scrolled chat (round 166) the ground's lights were drawn by the chat's wrap
// on a GPU layer the size of the chat (1148 × 728 here), drawn again in every frame on software GL (≈ 25 % of a
// Forgeheart frame), though nearly all of it was transparent: the warm light from above reaches ~190 px down the window,
// the violet ember only the bottom-right corner. Each light now has its own small box (native.js placeTints, the wrap's
// ::before / ::after, still fixed to the window).
//   layers   the lights' layers cover ≤ 25 % of the chat's wrap (the old way: all of it); the chat still scrolls on
//            the compositor (its own layer)
//   pixels   the window looks the same as the old way (one layer the size of the wrap with every light): the chat,
//            Settings open, and the chat once the composer has grown (the wrap changed size): ≤ 2 levels anywhere (what
//            changed by itself between two pictures this way left out)
//   frame    one frame's GPU-process CPU (a 3 px dot changed 10 times), this way and the old way in turn, 3 times: the
//            chat ≤ 85 % of the old way, Settings open ≤ 95 %
//   scroll   30 wheel turns up the chat, this way and the old way in turn, 3 times: the GPU process' CPU and the window's
//            paint / raster ms reported; only a regression (> 110 % of the old way's GPU CPU) fails
//   plain    back in the plain look no lights are drawn
// window.F168_REPORT = 1: report without failing.
//   node dev/smoke.js --fake-engines --check-timeout 1200000 --script dev/checks/forge168.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const out = { problems: [], cantTell: [] };
const bad = (m) => out.problems.push(m);
const B = { lightsShare: 0.25, maxLevels: 2, frameChat: 0.85, frameDialog: 0.95, scroll: 1.1 };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const r2 = (v) => Math.round(v * 100) / 100;

// ---------- the chat, in Forgeheart ----------
await until(() => performance.now() > 25000, 40000); // (the start's own work first)
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
const reply = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? ['```js', ...Array.from({ length: 8 }, (_, j) => `const v${j} = scene.getObjectByName('layer${i}_${j}');`), '```'].join('\n') : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.'].join('\n');
const N = 200; const t0 = Date.now() - N * 60000;
const chat = { id: `f168-${Date.now()}`, agentId: claude.id, title: 'Forge frames 168', createdAt: t0, updatedAt: Date.now(), messages: Array.from({ length: N }, (_, i) => (i % 2 === 0 ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000 } : { role: 'assistant', text: reply(i), at: t0 + i * 60000, usage: { input: 2000 + i, output: 300 + i } })) };
await window.hub.saveChat(chat); Native.save(chat);
Native.open(claude.id, chat.id);
const list = () => Native.view(claude.id).list;
await until(() => H.activeChat[claude.id] === chat.id && list()?.querySelectorAll('.msg').length > 20, 15000);
const themeBefore = H.config.theme ? JSON.parse(JSON.stringify(H.config.theme)) : null;
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
try { window.Look?.applyPreset?.('forgeheart', { quiet: true }); } catch { /* the look's own */ }
await wait(2500);
const toEnd = async () => { for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(200); } await wait(800); };
await toEnd();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: innerHeight - 10 } }); // (no hover)
document.activeElement?.blur?.();
const L = list(); const wrap = L.parentElement;
const F = out.forge = { skin: document.documentElement.dataset.skin || null, look: document.documentElement.dataset.look || null, solid: L.classList.contains('solid-back'), tint: wrap.classList.contains('tint-back'), two: wrap.classList.contains('tint-two'), lights: (wrap.tintList || []).length, why: L.backWhy || undefined };
if (!F.solid || !F.tint) bad(`forge: the list did not take the ground's base and lights (${JSON.stringify(F)})`);

// the old way (round 167): one layer the size of the wrap with every light
const oldStyle = document.createElement('style'); oldStyle.id = 'f168-old'; document.head.append(oldStyle);
const oldWay = (on) => { oldStyle.textContent = on ? `.messages-wrap.tint-back::before { inset: 0 !important; width: auto !important; height: auto !important; background-image: ${(wrap.tintList || []).join(', ')} !important; } .messages-wrap.tint-back::after { display: none !important; }` : ''; };
const dot = document.createElement('div'); dot.style.cssText = 'position:fixed;left:2px;bottom:2px;width:3px;height:3px;z-index:2147483647;background:#111;pointer-events:none'; document.body.append(dot);

// ---------- layers ----------
async function layers() {
  for (let k = 0; k < 3; k++) {
    setTimeout(() => { dot.style.background = '#131313'; }, 250); setTimeout(() => { dot.style.background = '#111'; }, 900);
    const r = await smoke({ layers: true, detail: true }).catch(() => null);
    if (r && !r.timedOut && r.list?.some((l) => /div\.messages/.test(l.who) && /OverflowScrolling/.test(l.why))) return r.list; // (a partial snapshot: once more) · (round 170, switch170: the list's scroller, not its own will-change layer, says the tree is whole)
    await wait(400);
  }
  return null;
}
const wr = wrap.getBoundingClientRect();
const lightsOf = (ls) => (ls || []).filter((l) => /^::(before|after)/.test(l.who) && l.w <= Math.ceil(wr.width) + 1 && l.h <= Math.ceil(wr.height) + 1 && !(l.w >= innerWidth - 1 && l.h >= innerHeight - 1));
{
  const now = await layers(); oldWay(true); await wait(500); const old = await layers(); oldWay(false); await wait(500);
  const area = (ls) => sum(lightsOf(ls).map((l) => l.w * l.h));
  out.layers = { wrap: `${Math.round(wr.width)}x${Math.round(wr.height)}`, now: lightsOf(now).map((l) => `${l.who} ${l.w}x${l.h}`), old: lightsOf(old).map((l) => `${l.who} ${l.w}x${l.h}`), share: r2(area(now) / (wr.width * wr.height)), oldShare: r2(area(old) / (wr.width * wr.height)), listComposited: Boolean(now?.some((l) => /div\.messages/.test(l.who) && /OverflowScrolling/.test(l.why))) };
  if (!now) out.cantTell.push('layers: no layer tree came');
  else {
    if (out.layers.share > B.lightsShare) bad(`layers: the lights' layers cover ${out.layers.share} of the chat's wrap (> ${B.lightsShare}): ${out.layers.now.join('; ')}`);
    if (!out.layers.listComposited) bad('layers: the chat no longer scrolls on the compositor (its own layer)');
  }
}

// ---------- pixels: the same as the old way ----------
const shot = async () => { await wait(350); return (await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png' } }))?.data; };
const px = async (d) => { const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
function compare(A, Bp, A2, w) {
  let n = 0; let mx = 0; let noise = 0; let over = 0; const box = [1e9, 1e9, -1, -1];
  for (let i = 0; i < A.length; i += 4) {
    if (Math.max(Math.abs(A[i] - A2[i]), Math.abs(A[i + 1] - A2[i + 1]), Math.abs(A[i + 2] - A2[i + 2]))) { noise += 1; continue; }
    const d = Math.max(Math.abs(A[i] - Bp[i]), Math.abs(A[i + 1] - Bp[i + 1]), Math.abs(A[i + 2] - Bp[i + 2]));
    if (d) { n += 1; mx = Math.max(mx, d); }
    if (d > B.maxLevels) { over += 1; const x = (i / 4) % w; const y = Math.floor(i / 4 / w); box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  }
  return { px: A.length / 4, differ: n, maxLevels: mx, overMax: over, where: over ? box : undefined, changedByItself: noise };
}
const abA = async () => { const A = await px(await shot()); oldWay(true); const Bp = await px(await shot()); oldWay(false); const A2 = await px(await shot()); return compare(A, Bp, A2, innerWidth); };
const openSettings = async () => { await AppUI.openSettings(); await until(() => document.querySelector('dialog.settings-dialog[open]'), 5000); await wait(2000); document.activeElement?.blur?.(); await wait(300); };
const closeDialogs = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await wait(500); };
out.pixels = {};
dot.style.display = 'none';
out.pixels.chat = await abA();
await openSettings(); out.pixels.settings = await abA(); await closeDialogs();
{ // the composer grown: the wrap is shorter, the lights placed again
  const h0 = wrap.getBoundingClientRect().height;
  const grow = document.createElement('div'); grow.style.cssText = 'flex: 0 0 140px'; wrap.after(grow); await wait(600); // (as a composer grown by 6 lines)
  const h1 = wrap.getBoundingClientRect().height;
  out.pixels.grown = { ...(await abA()), wrapHeight: `${Math.round(h0)} → ${Math.round(h1)}` };
  if (Math.abs(h1 - h0) < 4) out.cantTell.push(`pixels grown: the composer did not grow (${Math.round(h0)} → ${Math.round(h1)})`);
  grow.remove(); await wait(600);
}
dot.style.display = '';
for (const [k, v] of Object.entries(out.pixels)) {
  if (v.maxLevels > B.maxLevels) bad(`pixels ${k}: the window looks different from the old way (${v.overMax} of ${v.px} pixels over ${B.maxLevels} levels, up to ${v.maxLevels}, in ${JSON.stringify(v.where)})`);
  if (v.changedByItself > v.px * 0.2) out.cantTell.push(`pixels ${k}: ${v.changedByItself} pixels changed by themselves between two pictures this way`);
}

// ---------- frame: one frame's GPU-process CPU ----------
const gpuWin = async () => { const m = (await T({ metrics: true }))?.metrics || { procs: [], pages: [] }; let gpu = 0; let win = 0; for (const q of m.procs) { if (q.type === 'GPU') gpu += q.cpuS || 0; if (m.pages.some((p) => p.pid === q.pid && p.type === 'window' && /index\.html/.test(p.url))) win += q.cpuS || 0; } return { gpu, win }; };
const frames = async (n = 10) => { const a = await gpuWin(); for (let i = 0; i < n; i++) { dot.style.background = i % 2 ? '#111' : '#121212'; await wait(300); } return Math.round(((await gpuWin()).gpu - a.gpu) * 1000 / n); };
out.frame = { chat: { now: [], old: [] }, settings: { now: [], old: [] } };
for (let r = 0; r < 3; r++) {
  for (const way of ['now', 'old']) {
    oldWay(way === 'old'); await wait(800);
    out.frame.chat[way].push(await frames());
    await openSettings();
    out.frame.settings[way].push(await frames());
    await closeDialogs();
  }
}
oldWay(false);
for (const k of ['chat', 'settings']) { const f = out.frame[k]; f.ratio = r2(sum(f.now) / Math.max(1, sum(f.old))); f.msNow = Math.round(sum(f.now) / f.now.length); f.msOld = Math.round(sum(f.old) / f.old.length); }
if (out.frame.chat.ratio > B.frameChat) bad(`frame chat: a Forgeheart frame costs the graphics process ${out.frame.chat.ratio} × the old way (> ${B.frameChat}): ${JSON.stringify(out.frame.chat)}`);
if (out.frame.settings.ratio > B.frameDialog) bad(`frame settings: a Forgeheart frame with Settings open costs ${out.frame.settings.ratio} × the old way (> ${B.frameDialog}): ${JSON.stringify(out.frame.settings)}`);

// ---------- scroll: 30 wheel turns up ----------
const r = L.getBoundingClientRect();
const wheel = (dy) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: dy } });
const wheelUp = async () => { const s0 = L.scrollTop; for (let i = 0; i < 30; i++) { await wheel(-400); await wait(90); } await wait(800); return Math.round(s0 - L.scrollTop); };
out.scroll = { now: [], old: [] };
await toEnd(); await wheelUp(); // (once to warm up: the older turns drawn the first time)
for (let k = 0; k < 3; k++) {
  for (const way of k % 2 ? ['old', 'now'] : ['now', 'old']) {
    oldWay(way === 'old'); await toEnd(); await wait(500);
    const a = await gpuWin(); const moved = await wheelUp(); const b = await gpuWin();
    out.scroll[way].push({ gpuMs: Math.round((b.gpu - a.gpu) * 1000), windowMs: Math.round((b.win - a.win) * 1000), px: moved });
  }
}
// the window's paint / raster while scrolling (a trace, once each way: the trace's own cost left out of the CPU above)
for (const way of ['now', 'old']) {
  oldWay(way === 'old'); await toEnd(); await wait(500);
  const traced = await smoke({ trace: 'start' }).then((x) => !x?.error).catch(() => false);
  await wheelUp();
  const t = traced ? await smoke({ trace: 'stop', window: true }).catch(() => null) : null;
  out.scroll[`${way}Window`] = t?.window ? { paints: t.window.paints, paintMs: t.window.paintMs, rasterMs: t.window.rasterMs } : null;
}
oldWay(false); await toEnd();
{
  const s = out.scroll; const g = (w) => sum(s[w].map((x) => x.gpuMs));
  s.gpuNowMs = Math.round(g('now') / s.now.length); s.gpuOldMs = Math.round(g('old') / s.old.length); s.ratio = r2(g('now') / Math.max(1, g('old')));
  if (s.now.some((x) => x.px < 2000)) out.cantTell.push(`scroll: the wheel moved the chat only ${s.now.map((x) => x.px).join(' / ')} px`);
  if (s.ratio > B.scroll) bad(`scroll: wheeling costs the graphics process ${s.ratio} × the old way (> ${B.scroll}): ${s.gpuOldMs} → ${s.gpuNowMs} ms`);
}

// ---------- back to the plain look: no lights ----------
H.config.theme = themeBefore || {}; applyTheme(document.getElementById('user-theme').textContent);
try { window.Look?.applyPreset?.(themeBefore?.preset || 'default', { quiet: true }); } catch { /* the look's own */ }
await wait(2500);
out.plain = { skin: document.documentElement.dataset.skin || null, tint: wrap.classList.contains('tint-back'), two: wrap.classList.contains('tint-two'), before: getComputedStyle(wrap, '::before').content, after: getComputedStyle(wrap, '::after').content };
if (out.plain.skin !== 'forge' && (out.plain.tint || out.plain.two)) bad(`plain look: the wrap still draws a ground's lights (${JSON.stringify(out.plain)})`);

out.summary = `frame chat ${out.frame.chat.msOld} → ${out.frame.chat.msNow} ms (${out.frame.chat.ratio}), Settings ${out.frame.settings.msOld} → ${out.frame.settings.msNow} ms (${out.frame.settings.ratio}), scroll GPU ${out.scroll.gpuOldMs} → ${out.scroll.gpuNowMs} ms (${out.scroll.ratio}); lights ${out.layers.oldShare} → ${out.layers.share} of the wrap; pixels max ${Object.values(out.pixels).map((v) => v.maxLevels).join(' / ')} levels`;
out.budget = B;
if (window.F168_REPORT) { out.unenforced = out.problems; out.problems = []; }
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
