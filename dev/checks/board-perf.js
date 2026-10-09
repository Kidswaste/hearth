// Mood board smoothness: 150 items (pictures, a clip, notes, colors), then 2 s of trackpad panning and wheel zooming
// under a trace. Pan / zoom should be one transform on one layer: few paints, no layouts from the items, and DOM
// writes only for culling (a class when an item enters / leaves the screen) — not per frame.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/board-perf.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const cdp = (cdpName, params) => smoke({ cdp: cdpName, params });
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const [img, gold, clip] = await Board.addFiles([`${FIX}/neon big.png`, `${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`]);
await until(() => Board.items().every((i) => !['image', 'video'].includes(i.type) || i.vibe), 30000);
// many references: copies of the same media + notes + colors
const base = [Board.item(img.id), Board.item(gold.id), Board.item(clip.id)];
Board.edit('perf fill', (b) => {
  for (let i = 0; i < 147; i++) {
    const src = base[i % 3];
    const kind = i % 7 === 0 ? 'note' : i % 11 === 0 ? 'swatch' : src.type;
    const it = Board._.newItem(kind, kind === 'note' ? { text: `Note ${i}: **warm** grain`, style: 'lemon' } : kind === 'swatch' ? { color: '#e6b450' } : { ...JSON.parse(JSON.stringify(src)), id: undefined }, b);
    if (!it.id) it.id = Board._.uid(b);
    Object.assign(it, { x: (i % 15) * 460, y: Math.floor(i / 15) * 380, w: 420, h: 300 });
    b.items.push(it);
  }
});
Board.zoomFit(false);
await wait(800);
const r = document.querySelector('.bd-vp').getBoundingClientRect();
const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
// DOM churn probe + frame times
let mutations = 0; let attrMut = 0; const byAttr = {}; let settles = 0;
Board.onChange((w) => { if (w === 'settle') settles++; });
const mo = new MutationObserver((list) => { for (const m of list) { mutations++; if (m.type === 'attributes') { attrMut++; byAttr[m.attributeName] = (byAttr[m.attributeName] || 0) + 1; } } });
mo.observe(document.querySelector('.bd-world'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
const frames = []; let last = performance.now(); let running = true;
const tick = (t) => { frames.push(t - last); last = t; if (running) requestAnimationFrame(tick); };
requestAnimationFrame(tick);
// 1 s of two-finger panning (60 small wheel events), then 1 s of pinch zooming in and out, each traced on its own
await smoke({ trace: 'start' });
for (let i = 0; i < 60; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: i < 30 ? 14.5 : -14.5, deltaY: (i % 20 < 10 ? 9.5 : -9.5) }); await wait(16); }
const pan = await smoke({ trace: 'stop' });
await wait(300);
await smoke({ trace: 'start' });
for (let i = 0; i < 30; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx + (i % 5) * 20, y: cy, deltaX: 0, deltaY: i < 15 ? -6 : 6, modifiers: 2 }); await wait(16); }
await wait(120);
const zoom = await smoke({ trace: 'stop' });
const trace = { pan, zoom };
running = false; mo.disconnect();
await wait(400);
frames.shift();
const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => Math.round(sorted[Math.floor(sorted.length * p)] * 10) / 10;
const world = document.querySelector('.bd-world');
return JSON.stringify({
  items: Board.items().length,
  onScreen: Board.items().filter((i) => !Board._.lastOff.get(i.id)).length,
  trace,
  domMutationsDuringMove: mutations, attributeMutations: attrMut, byAttr, settles,
  frames: { n: frames.length, p50: pct(0.5), p95: pct(0.95), max: Math.round(sorted.at(-1)) },
  worldTransform: world.style.transform, videosAtRest: document.querySelectorAll('.bd-world video').length,
}, null, 1);
