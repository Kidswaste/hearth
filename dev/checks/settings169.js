// (round 169, settings169) Settings cheaper to draw while open, the Mood board's +17 % (docs/upgrades/settings169.md), ONE
// check. Its own temp data folder and profile (smoke.js), the fake engines; never an owner's data. A 200-turn chat behind.
// What this round found, on software GL (every frame redraws the whole window):
//   plain    the dialog was painted into its backdrop's layer, so the backdrop (a plain dim the compositor fills for
//            nothing) became a full-window picture drawn in every frame, and its form (not opaque) scrolled by repainting
//            it. Now (appui-dialogs.js .sd-solid, features.css) the dialog has a layer of its own and the form takes the
//            dialog's colour: an opaque scroller the compositor moves.
//   forge    each Forgeheart plate (.settings-section, opaque) was a GPU layer of its own (kept for LCD text), so the
//            dialog's cut corners (clip-path) needed a mask layer over them, drawn in every frame. The plates' colour is
//            99.6 % opaque in Settings now (look.css): one picture, corners cut in paint.
//   board    round 167's backwards fill dropped the board surface's layer when its entrance ended and the board's own
//            layers under it were drawn afresh then; the board's surface keeps a plain (not animated) layer
//            (polish8-board.css).
// The old way (round 168) is put back with a style, in turn with this way:
//   layers   plain: the dialog on a layer of its own and the form scrolling on the compositor; forge: no plate and no
//            mask layer in Settings
//   pixels   Settings open, plain and forge, and the board: the same as the old way, ≤ 2 levels anywhere, except (plain)
//            the form's two left rounded corners, now clipped by the compositor: counted apart, ≤ 8 levels, ≤ 80 px
//   frame    one frame's GPU-process CPU with Settings open (a 3 px dot changed 10 times), 3 times each way: plain ≤ 92 %
//            of the old way, forge ≤ 85 %
//   scroll   16 wheel turns inside Settings: plain ≤ 60 % of the old way; forge reported (fails only > 115 %)
//   open     Settings opened and closed twice: reported (fails only > 110 % of the old way)
//   board    the Mood board opened (4 s) and left (1.5 s), 3 times each way: opening ≤ 95 % of the old way, open + leave
//            ≤ 100 %; a frame on the board reported (fails only > 110 %)
// window.S169_REPORT = 1: report without failing.
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/settings169.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const out = { problems: [], cantTell: [] };
const bad = (m) => out.problems.push(m);
const B = { maxLevels: 2, cornerLevels: 8, cornerPx: 80, framePlain: 0.92, frameForge: 0.85, scrollPlain: 0.6, scrollForge: 1.15, open: 1.1, boardOpen: 0.95, boardAll: 1.0, boardFrame: 1.1 };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const r2 = (v) => Math.round(v * 100) / 100;
const ratio = (now, old) => r2(sum(now) / Math.max(1, sum(old)));

// ---------- the chat ----------
await until(() => performance.now() > 25000, 40000); // (the start's own work first)
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
const reply = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? ['```js', ...Array.from({ length: 8 }, (_, j) => `const v${j} = scene.getObjectByName('layer${i}_${j}');`), '```'].join('\n') : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.'].join('\n');
const N = 200; const t0 = Date.now() - N * 60000;
const chat = { id: `s169-${Date.now()}`, agentId: claude.id, title: 'Settings frames 169', createdAt: t0, updatedAt: Date.now(), messages: Array.from({ length: N }, (_, i) => (i % 2 === 0 ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000 } : { role: 'assistant', text: reply(i), at: t0 + i * 60000, usage: { input: 2000 + i, output: 300 + i } })) };
await window.hub.saveChat(chat); Native.save(chat);
Native.open(claude.id, chat.id);
const list = () => Native.view(claude.id).list;
await until(() => H.activeChat[claude.id] === chat.id && list()?.querySelectorAll('.msg').length > 20, 15000);
const toEnd = async () => { for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(200); } await wait(800); };
await toEnd();
const noHover = () => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: innerHeight - 10 } });
await noHover();
const themeBefore = H.config.theme ? JSON.parse(JSON.stringify(H.config.theme)) : null;
const setLook = async (forge) => {
  if (forge) { H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' }; delete H.config.theme.label; delete H.config.theme.group; } else H.config.theme = themeBefore || {};
  applyTheme(document.getElementById('user-theme').textContent);
  try { window.Look?.applyPreset?.(forge ? 'forgeheart' : (themeBefore?.preset || 'default'), { quiet: true }); } catch { /* the look's own */ }
  await wait(2500); await toEnd();
};

// the old way (round 168)
const OPAQUE = 'linear-gradient(var(--hud), var(--hud)) top left / 12px 1px no-repeat, linear-gradient(var(--hud), var(--hud)) top left / 1px 12px no-repeat, linear-gradient(var(--hud), var(--hud)) bottom right / 12px 1px no-repeat, linear-gradient(var(--hud), var(--hud)) bottom right / 1px 12px no-repeat, var(--tx-brushed), linear-gradient(180deg, color-mix(in srgb, var(--fh-strong) 3%, var(--fh-iron-1)), var(--fh-iron-2))';
const OLD = `.settings-dialog.sd-solid[open] { will-change: auto !important; } .settings-dialog.sd-solid form { background-color: transparent !important; }
:root[data-look~=v2] dialog .settings-section { background: ${OPAQUE} !important; }
.surface.active[data-id="tool:board"] { will-change: auto !important; }`;
const oldStyle = document.createElement('style'); oldStyle.id = 's169-old'; document.head.append(oldStyle);
const oldWay = (on) => { oldStyle.textContent = on ? OLD : ''; };
const calm = document.createElement('style'); calm.textContent = '* { caret-color: transparent !important; }'; document.head.append(calm); // (no blinking caret in the pictures)
const dot = document.createElement('div'); dot.style.cssText = 'position:fixed;left:2px;bottom:2px;width:3px;height:3px;z-index:2147483647;background:#111;pointer-events:none'; document.body.append(dot);

// ---------- helpers ----------
async function layers() {
  for (let k = 0; k < 3; k++) {
    setTimeout(() => { dot.style.background = '#131313'; }, 250); setTimeout(() => { dot.style.background = '#111'; }, 900);
    const r = await smoke({ layers: true, detail: true }).catch(() => null);
    if (r && !r.timedOut && r.list?.length > 3) return r.list;
    await wait(400);
  }
  return null;
}
const gpuWin = async () => { const m = (await T({ metrics: true }))?.metrics || { procs: [], pages: [] }; let gpu = 0; for (const q of m.procs) if (q.type === 'GPU') gpu += q.cpuS || 0; return gpu; };
const frames = async (n = 10) => { const a = await gpuWin(); for (let i = 0; i < n; i++) { dot.style.background = i % 2 ? '#111' : '#121212'; await wait(300); } return Math.round(((await gpuWin()) - a) * 1000 / n); };
const shot = async () => { await wait(400); return (await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png' } }))?.data; };
const px = async (d) => { const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
// corners: [x0, y0, x1, y1] boxes counted apart
function compare(A, Bp, A2, w, corners = []) {
  let n = 0; let mx = 0; let noise = 0; let over = 0; let cn = 0; let cmx = 0; const box = [1e9, 1e9, -1, -1];
  for (let i = 0; i < A.length; i += 4) {
    if (Math.max(Math.abs(A[i] - A2[i]), Math.abs(A[i + 1] - A2[i + 1]), Math.abs(A[i + 2] - A2[i + 2]))) { noise += 1; continue; }
    const d = Math.max(Math.abs(A[i] - Bp[i]), Math.abs(A[i + 1] - Bp[i + 1]), Math.abs(A[i + 2] - Bp[i + 2]));
    if (!d) continue;
    const x = (i / 4) % w; const y = Math.floor(i / 4 / w);
    if (d > B.maxLevels && corners.some((c) => x >= c[0] && x < c[2] && y >= c[1] && y < c[3])) { cn += 1; cmx = Math.max(cmx, d); continue; }
    n += 1; mx = Math.max(mx, d);
    if (d > B.maxLevels) { over += 1; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  }
  return { px: A.length / 4, differ: n, maxLevels: mx, overMax: over, where: over ? box : undefined, cornerPx: cn, cornerLevels: cmx, changedByItself: noise };
}
const abA = async (corners) => { dot.style.display = 'none'; const A = await px(await shot()); oldWay(true); const Bp = await px(await shot()); oldWay(false); const A2 = await px(await shot()); dot.style.display = ''; return compare(A, Bp, A2, innerWidth, corners); };
const dlg = () => document.querySelector('dialog.settings-dialog[open]');
const openSettings = async () => { await AppUI.openSettings(); await until(dlg, 5000); await wait(2000); document.activeElement?.blur?.(); await wait(300); };
const closeDialogs = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await wait(500); };
const key = async (k, code) => { for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: { Escape: 27 }[k] || 0 } }); };
const wheelIn = async () => {
  const f = dlg()?.querySelector('form'); if (!f) return null; const r = f.getBoundingClientRect(); const a = await gpuWin();
  for (let i = 0; i < 16; i++) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: i < 8 ? 120 : -120 } }); await wait(120); }
  await wait(700); const b = await gpuWin(); await noHover(); return Math.round((b - a) * 1000);
};
const fmt = (l) => `${l.who} ${l.w}x${l.h} ${l.why}`;

// ---------- Settings, in each look ----------
for (const look of ['plain', 'forge']) {
  await setLook(look === 'forge');
  const o = out[look] = { skin: document.documentElement.dataset.skin || null, lookV: document.documentElement.dataset.look || null };
  await openSettings();
  const d = dlg(); const dr = d.getBoundingClientRect();
  o.solid = d.classList.contains('sd-solid');
  if (look === 'plain' && !o.solid) bad('plain: the Settings dialog did not take .sd-solid (an opaque colour, no clip-path)');
  if (look === 'forge' && o.solid) bad('forge: the Settings dialog took .sd-solid (its background is a picture)');
  // layers
  const now = await layers(); oldWay(true); await wait(600); const old = await layers(); oldWay(false); await wait(600);
  const inDlg = (ls) => (ls || []).filter((l) => /^dialog|^form|settings-section|^\(no node\)/.test(l.who) && l.w <= dr.width + 200 && l.h <= dr.height + 200 && l.w > 40).map(fmt);
  o.layers = { now: inDlg(now), old: inDlg(old) };
  if (!now) out.cantTell.push(`${look} layers: no layer tree came`);
  else if (look === 'plain') {
    if (!now.some((l) => /^dialog/.test(l.who))) bad(`plain layers: the dialog has no layer of its own (${o.layers.now.join('; ')})`);
    if (!now.some((l) => /^form/.test(l.who) && /OverflowScrolling/.test(l.why))) bad(`plain layers: the form does not scroll on the compositor (${o.layers.now.join('; ')})`);
  } else {
    const plates = now.filter((l) => /settings-section/.test(l.who) || (/^::after/.test(l.who) && Math.abs(l.w - (dr.width - 52)) < 30));
    const mask = now.filter((l) => /^\(no node\)/.test(l.who) && Math.abs(l.w - dr.width) < 10 && Math.abs(l.h - dr.height) < 10);
    if (plates.length || mask.length) bad(`forge layers: Settings still has plate or mask layers: ${[...plates, ...mask].map(fmt).join('; ')}`);
  }
  // pixels (plain: the form's two left rounded corners counted apart)
  const f = d.querySelector('form').getBoundingClientRect();
  const corners = look === 'plain' ? [[Math.floor(f.left) - 1, Math.floor(f.top) - 1, Math.ceil(f.left) + 16, Math.ceil(f.top) + 16], [Math.floor(f.left) - 1, Math.floor(f.bottom) - 16, Math.ceil(f.left) + 16, Math.ceil(f.bottom) + 1]] : [];
  o.pixels = await abA(corners);
  if (o.pixels.maxLevels > B.maxLevels) bad(`${look} pixels: Settings looks different from the old way (${o.pixels.overMax} of ${o.pixels.px} pixels over ${B.maxLevels} levels, up to ${o.pixels.maxLevels}, in ${JSON.stringify(o.pixels.where)})`);
  if (o.pixels.cornerLevels > B.cornerLevels || o.pixels.cornerPx > B.cornerPx) bad(`${look} pixels: the form's rounded corners differ by more than anti-aliasing (${o.pixels.cornerPx} px up to ${o.pixels.cornerLevels} levels)`);
  if (o.pixels.changedByItself > o.pixels.px * 0.2) out.cantTell.push(`${look} pixels: ${o.pixels.changedByItself} pixels changed by themselves between two pictures this way`);
  // frame, scroll: in turn
  o.frame = { now: [], old: [] }; o.scroll = { now: [], old: [] };
  for (let r = 0; r < 3; r++) {
    for (const way of r % 2 ? ['old', 'now'] : ['now', 'old']) {
      oldWay(way === 'old'); await wait(800);
      o.frame[way].push(await frames());
      o.scroll[way].push(await wheelIn());
    }
  }
  oldWay(false);
  o.frame.ratio = ratio(o.frame.now, o.frame.old); o.frame.msNow = Math.round(sum(o.frame.now) / 3); o.frame.msOld = Math.round(sum(o.frame.old) / 3);
  o.scroll.ratio = ratio(o.scroll.now, o.scroll.old); o.scroll.msNow = Math.round(sum(o.scroll.now) / 3); o.scroll.msOld = Math.round(sum(o.scroll.old) / 3);
  await closeDialogs();
  const fb = look === 'plain' ? B.framePlain : B.frameForge;
  if (o.frame.ratio > fb) bad(`${look} frame: a frame with Settings open costs the graphics process ${o.frame.ratio} × the old way (> ${fb}): ${o.frame.msOld} → ${o.frame.msNow} ms`);
  const sb = look === 'plain' ? B.scrollPlain : B.scrollForge;
  if (o.scroll.ratio > sb) bad(`${look} scroll: wheeling inside Settings costs the graphics process ${o.scroll.ratio} × the old way (> ${sb}): ${o.scroll.msOld} → ${o.scroll.msNow} ms`);
  // opening / closing Settings twice
  o.open = { now: [], old: [] };
  for (let r = 0; r < 2; r++) {
    for (const way of r % 2 ? ['old', 'now'] : ['now', 'old']) {
      oldWay(way === 'old'); await wait(800);
      const a = await gpuWin();
      await AppUI.openSettings(); await wait(1500); await key('Escape', 'Escape'); await wait(600); await AppUI.openSettings(); await wait(800); await key('Escape', 'Escape'); await wait(600);
      o.open[way].push(Math.round(((await gpuWin()) - a) * 1000));
      await closeDialogs();
    }
  }
  oldWay(false);
  o.open.ratio = ratio(o.open.now, o.open.old); o.open.msNow = Math.round(sum(o.open.now) / 2); o.open.msOld = Math.round(sum(o.open.old) / 2);
  if (o.open.ratio > B.open) bad(`${look} open: opening / closing Settings costs ${o.open.ratio} × the old way (> ${B.open}): ${o.open.msOld} → ${o.open.msNow} ms`);
}
await setLook(false);

// ---------- the Mood board ----------
{
  const o = out.board = {};
  activate('tool:board'); await until(() => window.Board?.isMounted?.(), 10000); await wait(3000);
  await noHover(); await wait(500);
  o.pixels = await abA();
  if (o.pixels.maxLevels > B.maxLevels) bad(`board pixels: the board looks different from the old way (${o.pixels.overMax} px over ${B.maxLevels} levels, up to ${o.pixels.maxLevels}, in ${JSON.stringify(o.pixels.where)})`);
  const now = await layers();
  o.surfaceLayer = (now || []).filter((l) => /section\.surface/.test(l.who)).map(fmt);
  if (now && !o.surfaceLayer.some((l) => /WillChangeOpacity/.test(l))) bad(`board layers: the board's surface has no plain layer of its own (${o.surfaceLayer.join('; ') || 'none'})`);
  if (now && o.surfaceLayer.some((l) => /Active(Opacity|Transform)Animation/.test(l))) bad(`board layers: the board's surface layer is an animated one (${o.surfaceLayer.join('; ')})`);
  o.frame = { now: [], old: [] };
  for (let r = 0; r < 3; r++) for (const way of r % 2 ? ['old', 'now'] : ['now', 'old']) { oldWay(way === 'old'); await wait(800); o.frame[way].push(await frames()); }
  oldWay(false); activate(claude.id); await wait(2000);
  o.frame.ratio = ratio(o.frame.now, o.frame.old); o.frame.msNow = Math.round(sum(o.frame.now) / 3); o.frame.msOld = Math.round(sum(o.frame.old) / 3);
  if (o.frame.ratio > B.boardFrame) bad(`board frame: a frame on the board costs ${o.frame.ratio} × the old way (> ${B.boardFrame}): ${o.frame.msOld} → ${o.frame.msNow} ms`);
  // open (4 s) / leave (1.5 s), as round 166's audit and paint167 do it
  const act = async () => { const a = await gpuWin(); activate('tool:board'); await wait(4000); const m = await gpuWin(); activate(claude.id); await wait(1500); const b = await gpuWin(); return { open: Math.round((m - a) * 1000), leave: Math.round((b - m) * 1000) }; };
  o.act = { now: [], old: [] };
  for (let r = 0; r < 3; r++) for (const way of r % 2 ? ['old', 'now'] : ['now', 'old']) { oldWay(way === 'old'); await wait(1200); o.act[way].push(await act()); await wait(1000); }
  oldWay(false);
  const s = (w, k) => sum(o.act[w].map((x) => x[k]));
  o.openRatio = r2(s('now', 'open') / Math.max(1, s('old', 'open'))); o.allRatio = r2((s('now', 'open') + s('now', 'leave')) / Math.max(1, s('old', 'open') + s('old', 'leave')));
  o.ms = `open ${Math.round(s('old', 'open') / 3)} → ${Math.round(s('now', 'open') / 3)} ms, leave ${Math.round(s('old', 'leave') / 3)} → ${Math.round(s('now', 'leave') / 3)} ms`;
  if (o.openRatio > B.boardOpen) bad(`board open: opening the board costs ${o.openRatio} × the old way (> ${B.boardOpen}): ${o.ms}`);
  if (o.allRatio > B.boardAll) bad(`board open + leave: ${o.allRatio} × the old way (> ${B.boardAll}): ${o.ms}`);
}

out.summary = `Settings frame plain ${out.plain.frame.msOld} → ${out.plain.frame.msNow} ms (${out.plain.frame.ratio}), forge ${out.forge.frame.msOld} → ${out.forge.frame.msNow} ms (${out.forge.frame.ratio}); scroll plain ${out.plain.scroll.ratio}, forge ${out.forge.scroll.ratio}; open/close plain ${out.plain.open.ratio}, forge ${out.forge.open.ratio}; board ${out.board.ms} (open ${out.board.openRatio}, all ${out.board.allRatio}), frame ${out.board.frame.ratio}; pixels max ${out.plain.pixels.maxLevels} / ${out.forge.pixels.maxLevels} / ${out.board.pixels.maxLevels} levels (plain corners ${out.plain.pixels.cornerPx} px ≤ ${out.plain.pixels.cornerLevels})`;
out.budget = B;
if (window.S169_REPORT) { out.unenforced = out.problems; out.problems = []; }
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
