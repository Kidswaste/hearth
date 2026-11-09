// (round 166, audit166) the round's two fixes (docs/upgrades/audit166.md), ONE check. Its own temp data folder and
// profile (smoke.js), the fake engines; never an owner's data.
//   cache   a website session's HTTP cache stays at most 80 MB: a persistent session (as every web chat, app window and
//           pane has) fetches 160 cacheable 1 MB files from a local server: its cache (Disk calm's "Web caches") stays
//           ≤ 80 MB + slack (round 165: ≈ 160 MB, every one kept; Chromium's own cap here ≈ 1 GB per session)
//   forge   in the Forgeheart look a long chat scrolls on the compositor: the list takes the ground's plain base, the wrap
//           draws the ground's lights over it (native.js groundOf, chatcore.css .tint-back), the list scrolls in its own
//           layer, its pixels match the old way (the list transparent over the window's ground: ≤ 8 levels anywhere, ≤ 3 %
//           of pixels over 2 levels), wheeling up ~15 screens costs the window's main thread ≤ 60 % of the old way's
//           task time (both measured here, back to back) with no task over 50 ms of its own CPU (load-aware); back in the
//           plain look the list is plain again (no lights drawn)
// window.AU166_REPORT = 1: report without failing.
//   node dev/smoke.js --fake-engines --serve-dir dev/fixtures --check-timeout 900000 --script dev/checks/audit166.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const MB = (b) => Math.round((b / 1048576) * 10) / 10;
const out = { problems: [], cantTell: [] };
const bad = (m) => out.problems.push(m);
const B = { cacheMB: 80, cacheSlackMB: 8, fill: 160, maxLevels: 8, over2Share: 0.03, scrollRatio: 0.6, longTaskMs: 50 };

// ---------- cache: a persistent website session fills its HTTP cache ----------
{
  const before = (await window.hub.diskcalm.measure({ fresh: true }))?.parts?.appcache || 0;
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:audit166');
  wv.setAttribute('src', `${window.SMOKE_SERVE}/__fill/${B.fill}/1024`);
  Object.assign(wv.style, { position: 'fixed', left: '-2000px', top: '0', width: '400px', height: '300px' });
  document.body.appendChild(wv);
  const t = performance.now();
  const filled = await until(() => { try { return wv.getTitle() === 'filled'; } catch { return false; } }, 240000, 500);
  await wait(3000); // (the cache's index written)
  const after = (await window.hub.diskcalm.measure({ fresh: true }))?.parts?.appcache || 0;
  wv.remove();
  out.cache = { filled: Boolean(filled), fetchedMB: B.fill, seconds: Math.round((performance.now() - t) / 100) / 10, webCachesBeforeMB: MB(before), webCachesAfterMB: MB(after), grewMB: MB(after - before) };
  if (!filled) bad(`cache: the page did not fetch its ${B.fill} files`);
  else if (after - before > (B.cacheMB + B.cacheSlackMB) * 1048576) bad(`cache: a website session's cache grew ${MB(after - before)} MB (> ${B.cacheMB} MB + ${B.cacheSlackMB})`);
  else if (after - before < 20 * 1048576) out.cantTell.push(`cache: only ${MB(after - before)} MB cached (the cache may not have been written yet)`);
}

// ---------- forge: a long chat in the Forgeheart look ----------
await smoke({ cdp: 'Performance.enable', params: {} });
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
const png = `${decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1')}assets/swirl.svg`;
const code = (n, k) => ['```js', ...Array.from({ length: n }, (_, j) => `const v${j} = scene.getObjectByName('layer${k}_${j}');`), '```'].join('\n');
const N = 400; const t0 = Date.now() - N * 60000;
const big = { id: `au166-${Date.now()}`, agentId: claude.id, title: 'Forge scroll 166', createdAt: t0, updatedAt: Date.now(),
  messages: Array.from({ length: N }, (_, i) => (i % 2 === 0
    ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000, ...(i % 50 === 10 ? { attachments: [{ kind: 'image', name: 'ref.png' }], images: [png] } : {}) }
    : { role: 'assistant', text: `Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).\n\n- one thing\n- another, a little longer, to wrap across the line\n\n${i % 4 === 1 ? code(12, i) : 'A paragraph of plain words to give it some height and wrap once or twice.'}${i % 7 === 3 ? '\n\n| part | value |\n|---|---:|\n| bloom | 3 |' : ''}${i % 11 === 5 ? `\n![frame ${i}](https://img.hearth.test/480x270/${i}.png)` : ''}`, at: t0 + i * 60000, ...(i % 6 === 1 ? { thinking: 'Thinking about it. '.repeat(20), thinkMs: 2000 } : {}), ...(i % 3 === 2 ? { tools: ['Read', 'Grep', 'mcp__hearth__three_eval'] } : {}) })) };
await window.hub.saveChat(big); Native.save(big);
Native.open(claude.id, big.id);
const list = () => Native.view(claude.id).list;
await until(() => H.activeChat[claude.id] === big.id && list().querySelectorAll('.msg').length > 20, 15000);
const themeBefore = H.config.theme ? JSON.parse(JSON.stringify(H.config.theme)) : null;
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
try { window.Look?.applyPreset?.('forgeheart'); } catch { /* the look's own */ }
await wait(2500);
const toEnd = async () => { for (let i = 0; i < 8; i++) { list().scrollTop = list().scrollHeight; await wait(250); } await wait(1200); };
await toEnd();
const L = list(); const wrap = L.parentElement;
const composited = async () => { for (let k = 0; k < 3; k++) { const ly = await smoke({ layers: true, detail: true }).catch(() => null); if (ly?.list?.some((l) => /div\.messages/.test(l.who) && /OverflowScrolling/.test(l.why))) return true; await wait(300); } return false; };
const r = L.getBoundingClientRect();
const clip = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), scale: 1 };
const shot = async () => { await frame(); await frame(); await wait(250); return (await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip } }))?.data; };
const px = async (d) => { const bin = atob(d); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
const wheel = (dy) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: dy } });
async function scroll(tag) {
  const traced = await smoke({ trace: 'start', tasks: true }).then((x) => !x?.error).catch(() => false);
  performance.mark(`au166:${tag}`);
  const m0 = await metrics(); const s0 = L.scrollTop;
  for (let i = 0; i < 30; i++) { await wheel(-500); await wait(90); }
  await wait(900);
  const m1 = await metrics();
  const lts = traced ? await smoke({ trace: 'stop', tasks: { min: B.longTaskMs, mark: `au166:${tag}` } }).catch(() => null) : null;
  const steal = (lts?.stealPct || 0) / 100;
  const own = (lts?.tasks || []).map((x) => ({ ms: x.ms, own: x.cpuMs == null ? null : Math.round(x.cpuMs * (1 - steal) * 10) / 10 }));
  const res = { px: Math.round(s0 - L.scrollTop), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
    verdict: !lts ? null : own.some((x) => x.own > B.longTaskMs) ? 'over' : own.some((x) => x.ms > B.longTaskMs) ? 'load' : 'ok', tasks: own.slice(0, 4).map((x) => `${x.ms}ms cpu ${x.own}`) };
  await toEnd();
  return res;
}
const F = out.forge = { skin: document.documentElement.dataset.skin || null, look: document.documentElement.dataset.look || null, solid: L.classList.contains('solid-back'), tint: wrap.classList.contains('tint-back'), back: L.style.getPropertyValue('--solid-back'), why: L.backWhy || undefined };
F.composited = await composited();
// the old way: the list transparent over the window's ground, no lights drawn by the wrap (as round 165 left it);
// pictured back to back with this way, and this way once more (what changed by itself is left out)
const oldWay = (on) => { L.classList.toggle('solid-back', !on && F.solid); wrap.classList.toggle('tint-back', !on && F.tint); };
const A = await px(await shot()); oldWay(true); const Bp = await px(await shot()); oldWay(false); const A2 = await px(await shot());
{
  let n = 0; let over2 = 0; let mx = 0; let noise = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d2 = Math.max(Math.abs(A[i] - A2[i]), Math.abs(A[i + 1] - A2[i + 1]), Math.abs(A[i + 2] - A2[i + 2]));
    if (d2) { noise += 1; continue; }
    const d = Math.max(Math.abs(A[i] - Bp[i]), Math.abs(A[i + 1] - Bp[i + 1]), Math.abs(A[i + 2] - Bp[i + 2]));
    if (d) { n += 1; mx = Math.max(mx, d); if (d > 2) over2 += 1; }
  }
  F.pixels = { px: A.length / 4, differ: n, over2Levels: over2, maxLevels: mx, changedByItself: noise };
}
F.scroll = await scroll('now');
oldWay(true); await wait(400);
F.oldComposited = await composited();
F.oldScroll = await scroll('old');
oldWay(false);
if (!F.solid || !F.tint) bad(`forge: the list did not take the ground's base and lights (${JSON.stringify({ solid: F.solid, tint: F.tint, why: F.why })})`);
if (!F.composited) bad('forge: the chat does not scroll on the compositor (its own layer)');
if (F.pixels.maxLevels > B.maxLevels || F.pixels.over2Levels > F.pixels.px * B.over2Share) bad(`forge: the chat looks different (${F.pixels.over2Levels} of ${F.pixels.px} pixels over 2 levels, up to ${F.pixels.maxLevels})`);
if (F.scroll.px < 3000) bad(`forge: the wheel scrolled only ${F.scroll.px} px`);
if (F.scroll.verdict === 'over') bad(`forge: a task over ${B.longTaskMs} ms of the window's own CPU while scrolling (${F.scroll.tasks.join(', ')})`);
else if (F.scroll.verdict === 'load') out.cantTell.push(`forge: tasks over ${B.longTaskMs} ms on the wall clock only (${F.scroll.tasks.join(', ')})`);
if (F.oldComposited) out.cantTell.push('forge: the old way was composited too here (a screen at 150 % or more?): the scroll ratio says nothing');
else if (F.scroll.taskMs > F.oldScroll.taskMs * B.scrollRatio) bad(`forge: scrolling took ${F.scroll.taskMs} ms of the window's main thread vs ${F.oldScroll.taskMs} the old way (> ×${B.scrollRatio})`);

// ---------- back to the plain look: no lights ----------
H.config.theme = themeBefore || {}; applyTheme(document.getElementById('user-theme').textContent);
try { window.Look?.applyPreset?.(themeBefore?.preset || 'default'); } catch { /* the look's own */ }
await wait(2500);
out.plain = { skin: document.documentElement.dataset.skin || null, solid: list().classList.contains('solid-back'), tint: wrap.classList.contains('tint-back'), why: list().backWhy || undefined };
if (out.plain.skin !== 'forge' && out.plain.tint) bad('plain look: the wrap still draws a ground\'s lights');

out.budget = B;
out.pass = window.AU166_REPORT ? true : out.problems.length === 0;
return JSON.stringify(out, null, 1);
