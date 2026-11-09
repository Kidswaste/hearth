// (round 165, chat165) Long chats stay light (docs/upgrades/chat165.md). A made-up long working session (never real
// data: made here, saved in the smoke run's own temp data folder) of 2,000 turns: Markdown, code blocks (some long),
// tables, folded tool-step cards, thinking, pictures in replies (Markdown pictures, a reply's made pictures, Lab
// screenshots) and pictures attached to questions; plus ~300 chats in the chats list. ONE check of what matters:
//   open      its row clicked → its messages drawn + the next frame: within B.openMs; DOM nodes in the chat ≤ B.listNodes
//             and elements in the page (not counting the chats kept ready out of sight) ≤ B.pageEls; it opens at its end
//   scroll    wheeling up through ~25 screens of it (load-aware: a light trace; a task over 50 ms of the window's own CPU
//             fails, one over 50 ms only because the box was busy is "can't tell")
//   stream    a long reply streamed into it (fake engine "huge-text-40k"): every DOM change lands in the last turn (the
//             live reply) or the list's end, and the style / layout each paint causes is the same as in a short chat
//             (within B.streamRatio): the 2,000 turns above cost nothing per piece; it stays at the bottom while it streams
//   find      Alt+F, a word only in turn #7 (far off screen, resting): found, woken and on screen
//   jump      Native.jumpTo turn #31: drawn and on screen
//   ground    (plain look) the chat over one plain colour takes that colour and scrolls on the compositor (its own layer),
//             and its pixels are the same with and without it (≤ B.pixelShare of them off by ≤ B.pixelLevels levels);
//             Forgeheart (a ground of gradients) is left transparent as it was; its scroll is measured and judged too
//   copy      a turn's text (what Copy / Read aloud use) is the message's, and no message text sits in data-raw attributes
//   images    every picture drawn in the chat is loading=lazy + decoding=async
//   list      ~300 chats in the chats list: rows drawn ≤ B.listRows, a full redraw ≤ B.listMs
// window.C165_REPORT = 1: report without failing (the before numbers) · window.C165_SIZES = [500, 2000]: the turn counts
// measured (the check: [2000]) · window.C165_CHATS = 300
//   node dev/smoke.js --fake-engines --check-timeout 900000 --lib dev/checks/smooth-lib.js --script dev/checks/chat165.js
const { wait, until } = M;
const out = { problems: [], cantTell: [], sizes: {} };
const bad = (msg) => out.problems.push(msg);
const B = { openMs: 1500, listNodes: 5000, pageEls: 6000, pixelShare: 0.0005, pixelLevels: 8, longTaskMs: 50, streamRatio: 1.6, streamSlackMs: 1.5, listRows: 160, listMs: 40, heapMB: 40, outside: 2 }; // (outside: a one-off change to an earlier turn while a reply streams, e.g. its fold measured as it comes near; never one per piece)
const SIZES = window.C165_SIZES || [2000];
const NCHATS = window.C165_CHATS ?? 300;
const claude = H.claudeAgent();
activate(claude.id); await wait(400);
const v = () => Native.view(claude.id);
const list = () => v().list;
await smoke({ cdp: 'Performance.enable', params: {} });
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const gc = async () => { for (let i = 0; i < 2; i++) { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(100); } };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const MB = (x) => Math.round((x / 1048576) * 10) / 10;
const r1 = (x) => Math.round(x * 10) / 10;
const nodes = () => list().getElementsByTagName('*').length;
// the chats kept ready out of sight (round 45, chatswitch: the last 3 chats' lists, parked) are not this chat's
const parked = () => [...document.querySelectorAll('.messages.parked')].reduce((a, n) => a + 1 + n.getElementsByTagName('*').length, 0);
const pageEls = () => document.getElementsByTagName('*').length;
const key = async (k, code, mods = 0, text) => { for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Enter: 13, Escape: 27 }[k] || 0, ...(type === 'keyDown' && text ? { text } : {}) } }); };
const wheel = (dy) => { const r = list().getBoundingClientRect(); return smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: dy } }); };
const click = async (node) => { node.scrollIntoView({ block: 'nearest' }); await frame(); const r = node.getBoundingClientRect(); for (const type of ['mousePressed', 'mouseReleased']) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x: r.left + r.width / 2, y: r.top + r.height / 2, button: 'left', clickCount: 1 } }); };
const onScreen = (n) => { if (!n?.isConnected) return false; const r = n.getBoundingClientRect(); const lr = list().getBoundingClientRect(); return r.bottom > lr.top + 2 && r.top < lr.bottom - 2; };
// the window's renderer: its memory (working set, private) from the main process (powerwisemain's test hook)
const winMem = async () => {
  try {
    const m = (await window.hub.power.test({ metrics: true, mem: true }))?.metrics; if (!m) return null;
    const page = (m.pages || []).find((p) => /index\.html/.test(p.url) && p.type === 'window'); const pr = page && m.procs.find((x) => x.pid === page.pid);
    return pr ? { wsMB: Math.round(pr.mem / 1024), privMB: pr.priv ? Math.round(pr.priv / 1024) : null } : null;
  } catch { return null; }
};

// ---------- the chat paints its own ground (round 165): scrolled on the compositor, the same pixels ----------
async function lookOf(L) {
  const solid = L.classList.contains('solid-back');
  let composited = false; // (the first layer snapshot can time out: asked up to 3 times)
  for (let k = 0; k < 3 && !composited; k++) { const ly = await smoke({ layers: true, detail: true }).catch(() => null); composited = Boolean(ly?.list?.some((l) => /div\.messages/.test(l.who) && /OverflowScrolling/.test(l.why))); if (!composited) await wait(300); }
  const r = L.getBoundingClientRect(); const clip = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width) - 20, height: Math.round(r.height), scale: 1 };
  const shot = async () => { await frame(); await frame(); await wait(150); return (await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip } }))?.data; };
  const px = async (d) => { const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
  const out1 = { solid, why: L.backWhy || undefined, ground: L.style.getPropertyValue('--solid-back-img') ? 'gradients' : L.style.getPropertyValue('--solid-back') || null, composited, samePixels: null };
  if (!solid) return out1;
  // with its own ground, without it (transparent, as before this round), with it again (anything that moved by itself)
  const a = await shot(); L.classList.remove('solid-back'); const b = await shot(); L.classList.add('solid-back'); const a2 = await shot();
  if (!a || !b || !a2) return out1;
  const [pa, pb, pa2] = await Promise.all([px(a), px(b), px(a2)]);
  let n = 0; let mx = 0; let noise = 0;
  for (let i = 0; i < pa.length; i += 4) { const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])); const d2 = Math.max(Math.abs(pa[i] - pa2[i]), Math.abs(pa[i + 1] - pa2[i + 1]), Math.abs(pa[i + 2] - pa2[i + 2])); if (d2) noise += 1; else if (d) { n += 1; mx = Math.max(mx, d); } }
  return { ...out1, samePixels: n === 0, px: pa.length / 4, diffPx: n, maxDiff: mx, noisePx: noise };
}
// ---------- the wheel, up ~25 screens: the window's main-thread work, frames, long tasks (load-aware) ----------
async function scrollOf(L, tag) {
  const frames = []; let last = 0; let on = true;
  const tick = (ts) => { if (last) frames.push(ts - last); last = ts; if (on) requestAnimationFrame(tick); };
  const lt = []; let po = null; try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push(e.duration); }); po.observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
  const traced = await smoke({ trace: 'start', tasks: true }).then((r) => !r?.error).catch(() => false);
  performance.mark('c165:scroll');
  const m0 = await metrics(); const s0 = L.scrollTop; const ts0 = performance.now();
  requestAnimationFrame(tick);
  for (let i = 0; i < 50; i++) { await wheel(-500); await wait(90); }
  await wait(900); on = false; po?.disconnect();
  const m1 = await metrics();
  const lts = traced ? await smoke({ trace: 'stop', ...(window.C165_DUMP ? { dump: `${window.C165_DUMP}-${tag}.json` } : {}), tasks: { min: B.longTaskMs, mark: 'c165:scroll' } }).catch(() => null) : null;
  frames.sort((a, b) => a - b);
  // a task over 50 ms is the window's when its OWN CPU time is (the host's steal taken out); one that is long only on the
  // wall clock waited for a CPU or for the GPU process (software GL here): can't tell
  const steal = (lts?.stealPct || 0) / 100;
  const own = (lts?.tasks || []).map((x) => ({ ...x, own: x.cpuMs == null ? null : Math.round(x.cpuMs * (1 - steal) * 10) / 10 }));
  const verdict = !lts ? null : own.some((x) => x.own > B.longTaskMs) ? 'over' : own.some((x) => x.ms > B.longTaskMs) ? 'load' : 'ok';
  return { px: Math.round(s0 - L.scrollTop), ms: Math.round(performance.now() - ts0), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    frames: frames.length, worstGapMs: Math.round(frames.at(-1) || 0), p95GapMs: Math.round(frames[Math.floor(frames.length * 0.95)] || 0), gapsOver50: frames.filter((g) => g > 50).length, longTasks: lt.length, longestTaskMs: Math.round(Math.max(0, ...lt)),
    trace: lts ? { verdict, tasks: own.slice(0, 4).map((x) => `${x.ms}ms cpu ${x.cpuMs}`), runDelayMs: lts.runDelayMs, cpuMs: lts.cpuMs } : null, peakNodes: nodes() };
}

// ---------- the made-up long working session ----------
const root = decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const png = `${root}assets/swirl.svg`;
const RARE = 'quokkaprism';
const code = (n, k) => ['```js', ...Array.from({ length: n }, (_, j) => `const v${j} = scene.getObjectByName('layer${k}_${j}'); // tweak ${j}`), '```'].join('\n');
const table = (n) => ['| part | value | note |', '|---|---:|---|', ...Array.from({ length: n }, (_, j) => `| bloom ${j} | ${j * 3} | glow and grain ${j} |`)].join('\n');
const replyText = (i) => [`Reply ${i}: here is **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing to try', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? code(i % 3 === 0 ? 60 : 12, i) : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.',
  i % 7 === 3 ? `\n${table(8)}` : '', i % 11 === 5 ? `\n![frame ${i}](https://img.hearth.test/480x270/${i}.png)` : '',
  i % 9 === 5 ? `\n${Array.from({ length: 10 }, (_, k) => `Paragraph ${k} of a long answer with enough words to wrap across the line at least once.`).join('\n\n')}` : ''].join('\n');
function fixture(N, tag) {
  const t0 = Date.now() - N * 60000;
  const messages = Array.from({ length: N }, (_, i) => {
    const at = t0 + i * 60000;
    if (i % 2 === 0) return { role: 'user', text: i === 6 ? `Question ${i}: can the ${RARE} layer glow?` : `Question ${i}: what about this part?`, at, ...(i % 50 === 10 ? { attachments: [{ kind: 'image', name: 'ref.png' }], images: [png] } : {}) };
    return { role: 'assistant', text: replyText(i), at, usage: { input: 2000 + i, output: 300 + i },
      ...(i % 6 === 1 ? { thinking: `Thinking about ${i}. `.repeat(30), thinkMs: 3000 } : {}),
      ...(i % 3 === 2 ? { tools: ['mcp__hearth__three_eval', 'mcp__hearth__three_screenshot', 'mcp__hearth__three_edit_code', 'Read', 'Grep'] } : {}),
      ...(i % 15 === 7 ? { shows: [{ path: png, caption: `Lab screenshot ${i}` }] } : {}),
      ...(i % 20 === 9 ? { things: [{ k: 'image', path: png, name: 'poster.png', src: 'made' }] } : {}) };
  });
  return { id: `c165-${tag}-${Date.now()}`, agentId: claude.id, title: `Long session ${N}`, createdAt: t0, updatedAt: Date.now(), messages };
}
const shortChat = { id: `c165s-${Date.now()}`, agentId: claude.id, title: 'Short chat 165', createdAt: Date.now() - 9e5, updatedAt: Date.now() - 2000, messages: fixture(8, 's').messages };
await window.hub.saveChat(shortChat); Native.save(shortChat);
// (a chat made here goes into the open project, as an imported one does: the chats list shows the open project's)
const place = async (ids) => { try { if (window.ProjChats?.imported) await ProjChats.imported(ids); } catch (err) { console.warn('chat165 place', err); } };
await place([shortChat.id]);

// ---------- a reply streamed: its paints' style / layout, and where its DOM changes land ----------
async function stream(chatId) {
  const L = list();
  await until(() => L.querySelectorAll('.msg').length > 3, 5000);
  for (let i = 0; i < 4; i++) { L.scrollTop = L.scrollHeight; await wait(120); }
  await wait(800);
  let outside = 0; const where = {}; let paints = 0; let live = null;
  const mo = new MutationObserver((recs) => {
    let touched = false;
    for (const r of recs) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const msg = t?.closest?.('.msg');
      if (msg && msg.classList.contains('streaming')) { live = msg; touched = true; continue; }
      if (t === L && r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeType !== 1 || n.classList?.contains('streaming') || n === L.lastElementChild || n.classList?.contains('msg-new') || !n.previousElementSibling?.nextElementSibling)) continue;
      outside += 1; const k = `${r.type}${r.attributeName ? `(${r.attributeName}=${String(r.target.getAttribute?.(r.attributeName)).slice(0, 40)})` : ''}:${msg ? `msg#${msg.dataset.index}` : (t?.className && typeof t.className === 'string' ? t.className.split(' ')[0] : t?.tagName)}`; where[k] = (where[k] || 0) + 1;
    }
    if (touched) paints += 1;
  });
  const ta = v().input; ta.value = 'huge-text-40k'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  const send = v().root.querySelector('form button.primary[type=submit]');
  if (send) await click(send); else ta.closest('form').requestSubmit();
  await until(() => Native.isBusy(chatId), 8000);
  await until(() => list().querySelector('.msg.streaming .body')?.textContent.length > 800, 15000);
  mo.observe(L, { subtree: true, childList: true, attributes: true, characterData: true });
  const m0 = await metrics(); const t = performance.now(); let atEnd = 0; let samples = 0;
  await smoke({ trace: 'start', detail: true });
  for (let k = 0; k < 25; k++) { await wait(120); samples += 1; if (L.scrollHeight - L.scrollTop - L.clientHeight < 4) atEnd += 1; }
  const tr = await smoke({ trace: 'stop', detail: true });
  const m1 = await metrics(); mo.disconnect();
  const ms = performance.now() - t;
  await until(() => !Native.isBusy(chatId), 60000); await wait(400);
  const d = tr.detail || {};
  const per = (x) => (paints ? r1(x / paints) : null);
  return { paints, paintsPerSec: r1((paints / ms) * 1000), styleMsPerPaint: per((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layoutMsPerPaint: per((m1.LayoutDuration - m0.LayoutDuration) * 1000), scriptMsPerPaint: per((m1.ScriptDuration - m0.ScriptDuration) * 1000), taskMsPerPaint: per((m1.TaskDuration - m0.TaskDuration) * 1000),
    styleElPerPaint: per(d.style?.elements || 0), layoutObjPerPaint: per(d.layout?.objects || 0), paintMs: tr.paintMs, frames: d.frames ? { n: d.frames.n, p95: d.frames.p95, over8: d.frames.over8 } : null,
    outside, outsideWhere: Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k2, n]) => `${n}× ${k2}`), followed: `${atEnd}/${samples}`, liveWasLast: live ? live === L.querySelector(':scope > .msg:last-of-type') || !live.isConnected : null };
}

// the short chat's reply: the per-paint reference
Native.open(claude.id, shortChat.id); await wait(800);
out.streamShort = await stream(shortChat.id);

for (const N of SIZES) {
  const R = out.sizes[N] = {};
  const big = fixture(N, String(N));
  await window.hub.saveChat(big); Native.save(big); await place([big.id]);
  Native.open(claude.id, shortChat.id); await wait(800);
  // ---------- open: its row clicked ----------
  await gc(); const heap0 = (await metrics()).JSHeapUsedSize;
  const sel = `#chat-groups .item[data-key="${CSS.escape(big.id)}"]`;
  const row = (await until(() => document.querySelector(sel), 5000)) ? document.querySelector(sel) : null;
  let m0 = await metrics(); const t = performance.now();
  if (row) await click(row); else Native.open(claude.id, big.id);
  await until(() => H.activeChat[claude.id] === big.id && list().querySelectorAll('.msg').length >= 20, 15000);
  await frame();
  const openMs = Math.round(performance.now() - t);
  await wait(1500); let m1 = await metrics();
  await gc(); const mo = await metrics(); const dc = await smoke({ cdp: 'Memory.getDOMCounters', params: {} });
  const L = list();
  R.open = { ms: openMs, scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    messagesInDom: L.querySelectorAll('.msg').length, listNodes: nodes(), docNodes: dc.nodes, pageEls: pageEls(), parkedEls: parked(), listeners: dc.jsEventListeners, heapMB: MB(mo.JSHeapUsedSize), heapGrowMB: MB(mo.JSHeapUsedSize - heap0), mem: await winMem(), viaRow: Boolean(row),
    atEnd: L.scrollHeight - L.scrollTop - L.clientHeight < 4 };
  if (N === SIZES[0]) R.look = await lookOf(L);
  // ---------- images ----------
  {
    const imgs = [...L.querySelectorAll('img')];
    R.images = { drawn: imgs.length, notLazy: imgs.filter((i) => i.loading !== 'lazy').map((i) => i.className || i.parentElement?.className).slice(0, 5), notAsync: imgs.filter((i) => i.decoding !== 'async').map((i) => i.className || i.parentElement?.className).slice(0, 5), loaded: imgs.filter((i) => i.complete && i.naturalWidth).length };
  }
  R.scroll = await scrollOf(L, N);
  // ---------- find: a word only in turn #7 ----------
  {
    for (let i = 0; i < 6; i++) { L.scrollTop = L.scrollHeight; await wait(250); }
    await wait(900);
    R.find = { inDomBefore: Boolean(L.querySelector('.msg[data-index="6"]')) };
    v().input.focus();
    await key('f', 'KeyF', 1); await wait(300);
    const bar = v().root.querySelector('.chat-find input');
    const tf = performance.now();
    if (bar) { bar.focus(); await smoke({ cdp: 'Input.insertText', params: { text: RARE } }); await wait(400); await key('Enter', 'Enter'); }
    const hit = await until(() => list().querySelector('.msg[data-index="6"] mark.find-hit'), 8000);
    R.find.ms = Math.round(performance.now() - tf);
    await wait(700);
    Object.assign(R.find, { bar: Boolean(bar), count: v().root.querySelector('.chat-find .find-count')?.textContent, found: Boolean(hit), onScreen: onScreen(list().querySelector('.msg[data-index="6"] mark.find-hit')) });
    if (bar) { await key('Escape', 'Escape'); await wait(200); }
  }
  // ---------- jump: turn #31 ----------
  {
    for (let i = 0; i < 6; i++) { L.scrollTop = L.scrollHeight; await wait(250); }
    await wait(900);
    const tj = performance.now();
    Native.jumpTo(claude.id, 30);
    const ok = await until(() => onScreen(list().querySelector('.msg[data-index="30"]')), 8000);
    R.jump = { ms: Math.round(performance.now() - tj), onScreen: ok };
    await wait(600); R.jump.stillOnScreen = onScreen(list().querySelector('.msg[data-index="30"]'));
  }
  // ---------- copy: a turn's text (what Copy writes) ----------
  {
    const n = [...list().querySelectorAll('.msg.assistant[data-index]')].pop();
    const idx = Number(n?.dataset.index);
    R.copy = { index: idx, same: n ? (Native.rawOf ? Native.rawOf(n) : n.dataset.raw) === big.messages[idx]?.text : null, dataRawChars: [...list().querySelectorAll('.msg[data-raw]')].reduce((a, x) => a + x.dataset.raw.length, 0) };
  }
  // ---------- a reply streamed into the long chat ----------
  {
    for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(200); }
    R.stream = await stream(big.id);
  }
  // back at the end: what's in the chat once it settles
  { for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(250); } await wait(1500); await gc(); const dc2 = await smoke({ cdp: 'Memory.getDOMCounters', params: {} }); const m2 = await metrics(); R.settled = { listNodes: nodes(), docNodes: dc2.nodes, pageEls: pageEls(), parkedEls: parked(), heapMB: MB(m2.JSHeapUsedSize), mem: await winMem() }; }
  // ---------- the owner's look (Forgeheart: a ground of gradients behind the chat) ----------
  if (N === SIZES.at(-1) && !window.C165_NO_FORGE) {
    H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
    delete H.config.theme.label; delete H.config.theme.group;
    applyTheme(document.getElementById('user-theme').textContent);
    try { window.Look?.applyPreset?.('forgeheart'); } catch { /* the look's own */ }
    await wait(2000);
    for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(250); } await wait(1200);
    R.forge = { skin: document.documentElement.dataset.skin, look: await lookOf(list()) };
    R.forge.scroll = await scrollOf(list(), `${N}-forge`);
  }
  Native.open(claude.id, shortChat.id); await wait(500);
}

// ---------- the chats list with ~300 chats ----------
if (NCHATS) {
  const t0 = Date.now() - NCHATS * 3600e3; const ids = [];
  for (let i = 0; i < NCHATS; i++) {
    const c = { id: `c165l-${i}-${Date.now()}`, agentId: claude.id, title: `Session ${i}: ${['orb', 'bloom', 'reel', 'shader', 'poster'][i % 5]} tweaks`, createdAt: t0 + i * 3600e3, updatedAt: t0 + i * 3600e3, messages: [{ role: 'user', text: `hi ${i}`, at: t0 + i * 3600e3 }, { role: 'assistant', text: `ok ${i}`, at: t0 + i * 3600e3 + 1000 }] };
    await window.hub.saveChat(c); Native.save(c); ids.push(c.id);
  }
  await wait(300); await place(ids);
  await wait(1500);
  const G = document.getElementById('chat-groups');
  const times = [];
  for (let k = 0; k < 5; k++) { const ts = performance.now(); Panel.redrawRows(); times.push(performance.now() - ts); await frame(); }
  times.sort((a, b) => a - b);
  const dc = await smoke({ cdp: 'Memory.getDOMCounters', params: {} });
  out.list = { chats: NCHATS, rows: G ? G.querySelectorAll('.item').length : null, listNodes: G ? G.getElementsByTagName('*').length : null, redrawMs: r1(times[2]), docNodes: dc.nodes };
}

// ---------- verdicts ----------
out.budget = B;
for (const [N, R] of Object.entries(out.sizes)) {
  if (R.open.ms > B.openMs) bad(`${N} turns: opening took ${R.open.ms} ms (> ${B.openMs})`);
  if (R.open.listNodes > B.listNodes) bad(`${N} turns: ${R.open.listNodes} DOM nodes in the chat (> ${B.listNodes})`);
  if (R.open.pageEls - R.open.parkedEls > B.pageEls) bad(`${N} turns: ${R.open.pageEls - R.open.parkedEls} elements in the page, not counting ${R.open.parkedEls} in chats kept ready out of sight (> ${B.pageEls})`);
  if (R.open.heapMB > B.heapMB) bad(`${N} turns: JS heap ${R.open.heapMB} MB (> ${B.heapMB})`);
  if (!R.open.atEnd) bad(`${N} turns: the chat did not open at its end`);
  for (const [what, sc] of [['scroll', R.scroll], ['scroll (Forgeheart)', R.forge?.scroll]]) {
    if (!sc) continue;
    if (sc.trace?.verdict === 'over') bad(`${N} turns ${what}: a task over ${B.longTaskMs} ms of the window's own CPU (${sc.trace.tasks.join(', ')})`);
    else if (sc.trace?.verdict === 'load') out.cantTell.push(`${N} turns ${what}: tasks over ${B.longTaskMs} ms on the wall clock only, the box's (${sc.trace.tasks.join(', ')})`);
    else if (!sc.trace && sc.longestTaskMs > B.longTaskMs) out.cantTell.push(`${N} turns ${what}: a ${sc.longestTaskMs} ms task (no trace to judge it)`);
  }
  if (R.scroll.px < 3000) bad(`${N} turns: the wheel scrolled only ${R.scroll.px} px`);
  if (R.find.inDomBefore) bad(`${N} turns: turn #7 was drawn before find (the test needs it resting)`);
  if (!R.find.found || !R.find.onScreen) bad(`${N} turns: find: ${JSON.stringify(R.find)}`);
  if (!R.jump.onScreen || !R.jump.stillOnScreen) bad(`${N} turns: jump: ${JSON.stringify(R.jump)}`);
  if (R.images.notLazy.length || R.images.notAsync.length) bad(`${N} turns: pictures not lazy / async: ${JSON.stringify(R.images)}`);
  if (R.copy.same === false) bad(`${N} turns: a turn's copy text differs from the message`);
  if (R.copy.dataRawChars) bad(`${N} turns: ${R.copy.dataRawChars} characters of message text copied into data-raw attributes`);
  for (const [what, lk] of [['plain look', R.look], ['Forgeheart', R.forge?.look]]) {
    if (!lk) continue;
    if (what === 'plain look' ? !lk.solid || !lk.composited : lk.solid && !lk.composited) bad(`${N} turns (${what}): the chat does not scroll on the compositor: ${JSON.stringify(lk)}`); // (Forgeheart's ground is gradients: left as it was, list.backWhy says so)
    if (lk.samePixels === false && (lk.diffPx > lk.px * B.pixelShare || lk.maxDiff > B.pixelLevels)) bad(`${N} turns (${what}): the chat looks different painting its own ground (${lk.diffPx} of ${lk.px} pixels, up to ${lk.maxDiff} levels)`);
  }
  if (R.stream.outside > B.outside) bad(`${N} turns: streaming touched the DOM outside the last turn: ${R.stream.outsideWhere.join(', ')}`);
  if (R.stream.liveWasLast === false) bad(`${N} turns: the live reply was not the last turn`);
  if (!/^(2[3-5])\//.test(R.stream.followed)) bad(`${N} turns: did not stay at the bottom while streaming (${R.stream.followed})`);
  for (const k of ['styleMsPerPaint', 'layoutMsPerPaint']) {
    const a = R.stream[k]; const s = out.streamShort[k];
    if (a != null && s != null && a > s * B.streamRatio + B.streamSlackMs) bad(`${N} turns: ${k} ${a} ms vs ${s} in a short chat (the long chat costs per piece)`);
  }
}
if (out.list) { if (out.list.rows > B.listRows) bad(`chats list: ${out.list.rows} rows drawn (> ${B.listRows})`); if (out.list.redrawMs > B.listMs) bad(`chats list: a redraw took ${out.list.redrawMs} ms (> ${B.listMs})`); }
if (out.streamShort.outside > B.outside) bad(`short chat: streaming touched the DOM outside the last turn: ${out.streamShort.outsideWhere.join(', ')}`);
out.pass = window.C165_REPORT ? true : out.problems.length === 0;
return JSON.stringify(out, null, 1);
