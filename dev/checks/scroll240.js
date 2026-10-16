// Every scroll and pan at 240 Hz (round 49, scroll240): real wheel input (CDP: mouse-wheel notches and trackpad-style
// small smooth deltas), in the owner's look (Forgeheart), under one timeline trace (dev/trace-stats.js), over:
//   chat-wheel     a 1,000-message chat (text, code, tables, pictures) wheeled up fast (earlier messages come in) and down
//   chat-pad       the same chat with trackpad-style deltas (small, every 4 ms)
//   chat-stream    wheeling up and down while a long reply streams in it
//   list           the chats list with 300 more chats, wheeled down and up
//   board          the mood board with 200 references: trackpad pan, then Ctrl+wheel (pinch) zoom
//   usage          the Usage window, wheeled through
//   settings       Settings, wheeled through
//   layers         the Lab's Layers list with 40 layers, wheeled through
//   notes          the 📰 patch notes, wheeled through
// Per stretch: drawn frames whose main-thread work went over 4.2 ms (one 240 Hz frame) / 8.3 ms, main-thread tasks over
// 4.2 ms, style / layout / forced work, paints and raster, the scroll / wheel listeners' time, IntersectionObserver
// passes, and the GPU process's time per drawn frame (software GL here: a backdrop blur or a big filter over a
// scrolling surface shows up there, never on the main thread). Budgets on the reliable ones (counts, and the GPU
// cost per frame as a ratio of the same stretch without the glass): window.S240_REPORT = 1 reports without failing,
// window.S240_BUDGET overrides, window.S240_ONLY = 'usage,notes' runs some stretches, window.S240_CSS tries CSS for an A/B.
// Big screens: add --screen 2560x1440 (or 3840x2160 --dpr 2) to the smoke line; paints and GPU work grow with the area.
//   sh dev/board-fixtures.sh /tmp/hearth-board-fixtures
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/scroll240.js
const { wait, until } = M;
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const out = { numbers: {}, problems: [] };
const fail = (m) => out.problems.push(m);
const only = String(window.S240_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const claude = H.claudeAgent();
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
// a wheel / trackpad keeps sending while the page is busy (Chromium coalesces what queues up): sent at their pace, not
// each after the last was handled (on this software-GL machine a frame can take 0.3–1 s); drain() waits for the rest
let inflight = []; let sent = 0;
const wheel = (x, y, dy, dx = 0, modifiers = 0) => { sent += 1; inflight.push(cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: dx, deltaY: dy, modifiers })); };
const drain = async () => { const all = inflight; inflight = []; await Promise.race([Promise.all(all), wait(30000)]); };
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none' });
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const mid = (n) => { const r = n.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 200), r.top + r.height / 2]; };
// the element a wheel over `n` scrolls (n itself or its nearest scrollable ancestor)
const scrollerOf = (n) => { for (let e = n; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4) return e; } return null; };
// the biggest scrollable thing inside `root`
const biggestScroller = (root) => [root, ...root.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 40; }).sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] || null;
// fast notches (a mouse wheel spun hard) and a trackpad's smooth small deltas
const notches = async (x, y, n, dy, gap = 8) => { for (let i = 0; i < n; i++) { wheel(x, y, dy); await wait(gap); } await drain(); };
const pad = async (x, y, n, dy, gap = 4) => { for (let i = 0; i < n; i++) { wheel(x, y, dy * (0.6 + 0.4 * Math.sin(i / 6))); await wait(gap); } await drain(); };
const reachOf = (sc) => Math.min(30, Math.ceil((sc.scrollHeight - sc.clientHeight) / 100) + 2);
const through = async (reach, x, y) => { await notches(x, y, reach, 100); await pad(x, y, 80, -14); await notches(x, y, reach, -100); };

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
if (window.S240_CSS) document.head.append(Object.assign(document.createElement('style'), { textContent: window.S240_CSS }));
await wait(400);

// ---------- fixtures (before the trace) ----------
const para = (i) => {
  const kind = i % 12;
  const base = `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\nAnother paragraph of plain words to give it some height, about the scene ${i}.`;
  if (kind === 1) return `${base}\n\n\`\`\`js\nconst x${i} = ${i};\n/* note */\nfor (let k = 0; k < 4; k++) console.log(x${i} * k, "s");\n\`\`\``;
  if (kind === 5) return `${base}\n\n| a | b | c |\n| --- | ---: | --- |\n| ${i} | ${i * 2} | warm |\n| x | y | grain |\n| z | w | glow |`;
  if (kind === 9) return `${base}\n\n![shot ${i}](https://img.hearth.test/480x270/${i}.png)`;
  return base;
};
const at0 = Date.now() - 2e7;
const long = { id: `s240-long-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'S240 long chat', createdAt: at0, updatedAt: at0 + 1e7, messages: Array.from({ length: 1000 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 1000 })) };
await window.hub.saveChat(long); Native.save(long);
for (let i = 0; i < 300; i++) H.chats.push({ id: `s240f-${i}`, agentId: claude.id, title: `S240 chat ${i} about ${['shaders', 'the intro', 'beats', 'the board', 'colors'][i % 5]}`, updatedAt: at0 - 5000 - i * 60e3, pinned: false });
H.chats = H.chats.slice();
activate(claude.id); await wait(300);
Native.open(claude.id, long.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 15000);
Panel.render(); await wait(600);
// the whole group out ("Show more" until all 300+ show: past 150 rows the list keeps only those near the screen)
for (let i = 0; i < 12; i++) { const b = document.querySelector('#chat-groups .show-more:not(.deep-search)'); if (!b) break; b.click(); Panel.flush?.(); await wait(150); }
await wait(800);

const segs = [];
const sentBy = {};
const seg = async (name, fn) => { if (!want(name)) return; performance.mark(`hz240:${name}`); segs.push(name); const t0 = performance.now(); sent = 0; try { await fn(); out.numbers[`${name}Sec`] = Math.round((performance.now() - t0) / 100) / 10; sentBy[name] = sent; } catch (err) { out.numbers[`${name}Error`] = String(err.stack || err.message || err).slice(0, 300); fail(`${name}: ${err.message || err}`); } await settle(); await wait(250); };
const idleMark = async () => { performance.mark('hz240:between'); await wait(200); };

await smoke({ trace: 'start', detail: true, cats: 'viz' });

// ---------- the long chat ----------
const v = () => Native.view(claude.id);
// the pointer comes to rest first (a tip it rests on shows before the stretch: only tips the scrolling arms count)
const rest = async (x, y) => { await move(x, y); await wait(700); await settle(); };
if (want('chat-wheel') || want('chat-pad')) await rest(...mid(v().list));
await seg('chat-wheel', async () => {
  const [x, y] = mid(v().list);
  const list = v().list; let top = list.scrollTop;
  const watch = () => { top = Math.min(top, list.scrollTop); }; list.addEventListener('scroll', watch, { passive: true });
  await notches(x, y, 60, -240);
  await until(() => list.querySelectorAll('.msg').length > 60, 4000); // (earlier messages come in at the top)
  out.numbers.chatShown = list.querySelectorAll('.msg').length;
  await notches(x, y, 60, 240);
  list.removeEventListener('scroll', watch);
  out.numbers.chatTop = Math.round(top);
});
await seg('chat-pad', async () => {
  const [x, y] = mid(v().list);
  await pad(x, y, 150, -12);
  await pad(x, y, 150, 12);
});
await idleMark();
await seg('chat-stream', async () => {
  Native.sendText(claude.id, 'huge-40k');
  await until(() => v().list.querySelector('.msg.streaming .body')?.textContent.length > 400, 15000);
  const [x, y] = mid(v().list);
  for (let k = 0; k < 2; k++) { await notches(x, y, 12, -100, 12); await pad(x, y, 60, 10); await notches(x, y, 12, 100, 12); }
  out.numbers.streaming = Native.isBusy(H.activeChat[claude.id]);
});
if (want('chat-stream')) { try { window.hub.stop(H.activeChat[claude.id]); } catch { /* ended */ } await wait(400); }
await idleMark();

// ---------- the chats list (300 more chats) ----------
const listRoot = document.getElementById('chat-groups');
const listSc = scrollerOf(listRoot.querySelector('.item') || listRoot) || listRoot;
if (want('list')) await rest(...mid(listSc));
await seg('list', async () => {
  const root = listRoot; const sc = listSc;
  const [x, y] = mid(sc);
  out.numbers.listRows = `${root.querySelectorAll('.item').length} drawn · ${Math.round(sc.scrollHeight)}px`;
  await notches(x, y, 30, 100);
  await pad(x, y, 80, -14);
  await notches(x, y, 30, -100);
});
await idleMark();

// ---------- dialogs: Usage, Settings, patch notes ----------
const dialogStretch = async (name, open, pick) => {
  if (!want(name)) return;
  await open(); await wait(900);
  const dlg = [...document.querySelectorAll('dialog[open]')].at(-1);
  let sc = dlg && (pick ? dlg.querySelector(pick) : null) || (dlg && biggestScroller(dlg));
  // (a dialog whose content fits (the calmer Usage window on test data) is made shorter, so its scrolling is still measured)
  if (!sc && dlg) { dlg.style.maxHeight = `${Math.round(dlg.clientHeight * 0.55)}px`; await wait(300); sc = biggestScroller(dlg); out.numbers[`${name}Shortened`] = true; }
  if (!sc) { fail(`${name}: nothing to scroll`); dlg?.close(); return; }
  const [x, y] = mid(sc);
  await rest(x, y);
  out.numbers[`${name}Scroll`] = `${sc.className || sc.tagName} ${sc.scrollHeight}/${sc.clientHeight}px`;
  const reach = reachOf(sc);
  await seg(name, () => through(reach, x, y));
  performance.mark('hz240:between'); // (closing it isn't scrolling)
  dlg.close(); await wait(300);
  await idleMark();
};
if (want('usage')) await until(() => typeof Meter !== 'undefined' && Meter.dashboard, 5000);
await dialogStretch('usage', () => Meter.dashboard());
await dialogStretch('settings', () => AppUI.openSettings());
await dialogStretch('notes', async () => { if (typeof PatchNotes === 'undefined') await Lazy.load('patchnotes'); await PatchNotes.open(); }, '.pn-scroll');

// ---------- the board, 200 references ----------
if (want('board')) {
  activate('tool:board');
  await until(() => typeof Board !== 'undefined' && Board.isMounted() && Board.current(), 30000);
  const files = await Board.addFiles([`${FIX}/neon big.png`, `${FIX}/golden-hour.jpg`]).catch(() => []);
  await until(() => Board.items().length >= 2, 10000);
  const base = files.length ? files.map((f) => Board.item(f.id)).filter(Boolean) : [];
  Board.edit('scroll240 fill', (b) => {
    for (let i = 0; i < 200 - base.length; i++) {
      const src = base[i % (base.length || 1)];
      const kind = !src || i % 5 === 0 ? 'note' : i % 11 === 0 ? 'swatch' : src.type;
      const it = Board._.newItem(kind, kind === 'note' ? { text: `Note ${i}: **warm** grain`, style: 'lemon' } : kind === 'swatch' ? { color: '#e6b450' } : { ...JSON.parse(JSON.stringify(src)), id: undefined }, b);
      if (!it.id) it.id = Board._.uid(b);
      Object.assign(it, { x: (i % 16) * 460, y: Math.floor(i / 16) * 380, w: 420, h: 300 });
      b.items.push(it);
    }
  });
  Board.zoomFit(false); await wait(1200);
  const r = document.querySelector('.bd-vp').getBoundingClientRect();
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  await rest(cx, cy);
  out.numbers.boardItems = Board.items().length;
  await seg('board', async () => {
    for (let i = 0; i < 120; i++) { wheel(cx, cy, i % 30 < 15 ? 9 : -9, i < 60 ? 14 : -14); await wait(5); }
    await drain();
    for (let i = 0; i < 60; i++) { wheel(cx + (i % 5) * 20, cy, i < 30 ? -6 : 6, 0, 2); await wait(8); }
    await drain();
  });
  await idleMark();
}

// ---------- the Lab's Layers list, 40 layers ----------
if (want('layers')) {
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
  const S = ThreeLab.scenes;
  const still = (i) => `// layer ${i}: a still color\nconst c = document.createElement('canvas'); c.width = c.height = 8; document.body.append(c);\nconst g = c.getContext('2d'); g.fillStyle = 'hsl(${i * 9} 70% 50%)'; g.fillRect(0, 0, 8, 8);\n`;
  const layers = Array.from({ length: 40 }, (_, i) => ThreeLayers.defaults({ id: `s240L${i}`, name: `Layer ${i + 1} · ${['glow', 'rings', 'grain', 'type', 'particles'][i % 5]}`, code: still(i), slot: i, visible: i < 3 }));
  const sk = S.create({ name: 'Scroll240 layers', code: layers[0].code, layers, frame: '16:9', open: true });
  await until(() => S.currentId() === sk.id && document.querySelectorAll('.ly-row[data-id]').length >= 40, 20000);
  await wait(1500);
  const row = document.querySelectorAll('.ly-row[data-id]')[3];
  const sc = row && scrollerOf(row);
  out.numbers.layerRows = document.querySelectorAll('.ly-row[data-id]').length;
  if (!sc) fail('layers: the Layers list doesn\'t scroll with 40 layers');
  else {
    out.numbers.layersScroll = `${sc.className} ${sc.scrollHeight}/${sc.clientHeight}px`;
    const [x, y] = mid(sc); await rest(x, y);
    const reach = reachOf(sc);
    await seg('layers', () => through(reach, x, y));
  }
  await idleMark();
}

const tr = await smoke({ trace: 'stop', detail: true, dump: window.S240_DUMP || undefined }); // (S240_DUMP: a file for the raw trace)
const d = tr.detail || {};
// ---------- per stretch ----------
const S = {};
for (const name of segs) {
  const s = d.segments?.[name]; if (!s) continue;
  const rd = s.render || {};
  S[name] = {
    inputs: s.inputs, frames: s.frames.n, over4: s.frames.over4, over8: s.frames.over8, worstFrame: s.frames.worst,
    tasksOver4: s.longTasks.over4, longest: s.longTasks.max,
    style: `${s.style.n}×${s.style.elements}el ${s.style.ms}ms`, layout: `${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms`, forced: `${s.forced.n}/${s.forced.ms}ms`,
    paint: `${rd.paints}× ${rd.paintMs}ms · raster ${rd.rasterMs}ms`, scrollJs: rd.scrollJs, io: rd.io,
    gpu: { frames: rd.gpuFrames, ms: rd.gpuMs, perFrame: rd.gpuFrames ? Math.round(rd.gpuMs / rd.gpuFrames) : null, cpuPerFrame: rd.gpuFrames ? Math.round((rd.gpuCpuMs / rd.gpuFrames) * 10) / 10 : null },
    phases: s.phases, scripts: s.scripts, forcedTop: s.forced.top, forcedFiles: s.forcedFiles,
  };
}
out.stretches = S;
out.whole = { frames: d.frames, tasks: d.tasks };

// ---------- budgets (counts and CPU time; wall milliseconds here move ±50 % with this machine's load) ----------
const BUDGET = window.S240_BUDGET || {
  scrollJsCpuPerWheel: 0.25, // scroll / wheel listeners' CPU ms per wheel event sent, any stretch (a chat streaming: 0.31–0.34, its scroll handler forced a style + layout pass)
  forced: { board: 8, usage: 4, settings: 4, notes: 4, list: 12, layers: 12 }, // style / layout forced inside scripts while scrolling (the board's cull: 19; tips measuring rows going by: 2 each)
  tipsWhileScrolling: 2, // style + layout forced by tooltips (showTip) while wheeling, any stretch: at most one tip (before: 2–8 per stretch; a busy machine's long glide can still let one through)
  dialogGpuVsChat: 2.5, // the GPU's time per frame scrolling a dialog, against wheeling the chat (the dialogs' glass: 3.8–11×)
};
out.budgets = BUDGET;
const over = (k, v, b) => { if (v == null || v > b) fail(`${k}: ${v} (budget ${b})`); };
for (const [name, s] of Object.entries(S)) {
  const n = sentBy[name];
  if (n) over(`${name}: scroll/wheel listeners CPU ms per wheel`, Math.round((s.scrollJs.cpuMs / n) * 100) / 100, BUDGET.scrollJsCpuPerWheel);
  if (BUDGET.forced[name] != null) over(`${name}: forced style/layout`, Number(String(s.forced).split('/')[0]), BUDGET.forced[name]);
  // (not while a reply streams: the reply growing under a resting pointer points it at new things, which is no scroll)
  if (name !== 'chat-stream') over(`${name}: tooltips measured while scrolling (forced in juice.js)`, s.forcedFiles?.['juice.js'] || 0, BUDGET.tipsWhileScrolling);
  s.wheels = n;
}
const chatGpu = S['chat-pad']?.gpu.perFrame || S['chat-wheel']?.gpu.perFrame;
for (const name of ['usage', 'settings', 'notes']) if (S[name]?.gpu.perFrame && chatGpu) over(`${name}: GPU per frame vs the chat (${S[name].gpu.perFrame} / ${chatGpu} ms)`, Math.round((S[name].gpu.perFrame / chatGpu) * 100) / 100, BUDGET.dialogGpuVsChat);
// still right: the long chat reached earlier messages, the board kept one transform, the list drew its rows
if (want('chat-wheel') && !(out.numbers.chatShown > 60)) fail(`chat-wheel: earlier messages didn't come in (${out.numbers.chatShown} shown)`);
if (want('list') && !(parseInt(out.numbers.listRows, 10) > 40)) fail(`list: ${out.numbers.listRows} rows`);
if (window.S240_REPORT) { out.reportOnly = out.problems; out.problems = []; }
return JSON.stringify(out, null, 1);
