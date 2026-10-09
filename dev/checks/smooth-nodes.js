// Smoothness of the node editor with 120 nodes and 160 wires, all flowing (live values): idle with the wires
// animating, panning (middle-button drag), zooming (wheel), dragging a node, the minimap.
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth-nodes.js
const { wait, until, measure, brief, mouse } = M;
const out = {};
const reg = NodeView.createRegistry({ name: 'smooth', types: { num: { color: '#48ddff', label: 'Number' } }, assemble: (parts) => '' });
reg.define({ type: 'add', title: 'Add', category: 'Math', color: '#48ddff', desc: 'a + b',
  inputs: [{ name: 'a', type: 'num', value: 0 }, { name: 'b', type: 'num', value: 1, min: 0, max: 10 }],
  outputs: [{ name: 'out', type: 'num' }], compile: (c) => ({ out: `(${c.in('a')} + ${c.in('b')})` }) });
const nodes = []; const links = [];
const COLS = 12;
for (let i = 0; i < 120; i++) nodes.push({ id: `n${i}`, type: 'add', x: (i % COLS) * 240, y: Math.floor(i / COLS) * 150 });
for (let i = 1; i < 120; i++) links.push({ from: [`n${i - 1}`, 'out'], to: [`n${i}`, 'a'] });
for (let i = 0; i < 40; i++) links.push({ from: [`n${i}`, 'out'], to: [`n${i + COLS + 1}`, 'b'] });
const host = el('div', { style: { position: 'fixed', left: '80px', top: '60px', width: '1300px', height: '820px', zIndex: 50, background: '#0f1115' } });
document.body.append(host);
const view = NodeView.create(host, { registry: reg, graph: { v: 1, kind: 'smooth', nodes, links, frames: [], notes: [] }, storeKey: 'smooth-test' });
await wait(800);
view.setDynamic(new Set(nodes.map((n) => `${n.id}.out`)));
await wait(500);
out.counts = { nodes: host.querySelectorAll('.nv-node').length, wires: host.querySelectorAll('.nv-link').length, flowing: host.querySelectorAll('.nv-wire-flow').length };
out.idleFlowing = brief(await measure(2000)); console.log('[J] idle', JSON.stringify(out.idleFlowing));
const r = host.getBoundingClientRect();
const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
// pan: middle-button drag across the canvas
out.pan = brief(await measure(1500, async () => {
  await mouse('mouseMoved', cx, cy, { button: 'none' }); await mouse('mousePressed', cx, cy, { button: 'middle' });
  for (let i = 1; i <= 50; i++) await mouse('mouseMoved', cx - i * 6, cy - i * 3, { button: 'middle', buttons: 4 });
  await mouse('mouseReleased', cx - 300, cy - 150, { button: 'middle' });
}));
console.log('[J] pan', JSON.stringify(out.pan));
// zoom: wheel steps over the canvas
out.zoom = brief(await measure(1500, async () => {
  for (let i = 0; i < 24; i++) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: i < 12 ? 100 : -100 } }); await wait(20); }
}));
console.log('[J] zoom', JSON.stringify(out.zoom));
// drag a node with wires in and out
const nodeEl = [...host.querySelectorAll('.nv-node')].find((n) => { const b = n.getBoundingClientRect(); return b.left > r.left + 100 && b.right < r.right - 300 && b.top > r.top + 100 && b.bottom < r.bottom - 200; });
if (nodeEl) {
  const b = nodeEl.querySelector('.nv-head, .nv-title')?.getBoundingClientRect() || nodeEl.getBoundingClientRect();
  const x = b.left + 20; const y = b.top + 8;
  out.nodeDrag = brief(await measure(1500, async () => {
    await mouse('mouseMoved', x, y, { button: 'none' }); await mouse('mousePressed', x, y);
    for (let i = 1; i <= 50; i++) await mouse('mouseMoved', x + i * 4, y + i * 2, { buttons: 1 });
    await mouse('mouseReleased', x + 200, y + 100);
  }));
}
out.wiresAfter = host.querySelectorAll('.nv-link').length;
view.destroy?.(); host.remove();
return JSON.stringify(out, null, 1);
