// Resizable chats (grid-resize.js): in the grid view the gap between two chats is a handle; dragging it gives one
// chat more room and the sizes are kept; double-click shares the space equally again. A docked chat's divider goes
// up to 80% of the window.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/grid-resize.js --shot /tmp/grid-resize.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const surf = () => [...document.querySelectorAll('#surfaces.grid > .surface')].filter((s) => s.offsetWidth);
try {
  activate(H.claudeAgent().id); await wait(200);
  H.grid = true; applyLayout(); await wait(300);
  ok(await until(() => document.querySelector('.grid-handle.col')), 'the grid view has a handle between two chats');
  const h = document.querySelector('.grid-handle.col');
  const before = surf().map((s) => Math.round(s.getBoundingClientRect().width));
  const r = h.getBoundingClientRect();
  const x0 = r.left + r.width / 2; const y0 = r.top + r.height / 2;
  h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0, pointerId: 1 }));
  for (let i = 1; i <= 6; i++) { h.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x0 + i * 30, clientY: y0, pointerId: 1 })); await wait(30); }
  h.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x0 + 180, clientY: y0, pointerId: 1 }));
  await wait(400);
  const after = surf().map((s) => Math.round(s.getBoundingClientRect().width));
  out.widths = { before, after };
  ok(after[0] > before[0] + 100 && after[1] < before[1] - 100, `dragging the gap widens the first chat (${before} → ${after})`);
  const k = Object.keys(H.config.layout?.gridSizes || {})[0];
  ok(k && H.config.layout.gridSizes[k].cols?.length >= 2, `the sizes are kept (${k})`);
  document.querySelector('.grid-handle.col').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(400);
  const eq = surf().map((s) => Math.round(s.getBoundingClientRect().width));
  ok(Math.abs(eq[0] - eq[1]) <= 2, `double-click: equal again (${eq})`);
  H.grid = false; applyLayout(); await wait(200);
  ok(!document.querySelector('.grid-handle'), 'no handles outside the grid view');
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
