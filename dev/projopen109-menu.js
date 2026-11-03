// (round 109, projopen109) The Desk's ⋯ and its rows, clicked fast around a Desk redraw, on projopen86's fixture
// (Clink: 1,063 things, a big Desk; made up, never real data). Round 108 saw a ⋯ row do nothing 3 times in ~10 runs.
// Every click is a real one (CDP press, a human's ~70 ms hold, release) and each kind is tried at many moments:
//   redraw    a project change (setWorkspace: the Desk is drawn again ≈ 80 ms later) and the ⋯ pressed 0–240 ms after
//   switch    the Desk asked for (from the project's chat) and the ⋯ pressed 0–240 ms after
//   row       the menu open, a project change, and a row (Notes…) pressed 0–240 ms after
// What counts: the ⋯ opened its menu / the row opened its prompt. ClickWatch (renderer.js) must name every miss.
//   node dev/smoke.js --fake-engines --data <projopen86 fixture> --wait 1000 --check-timeout 900000 --lib dev/projaudit108-lib.js --script dev/projopen109-menu.js
// window.PO109_NOHOLD = 1 (an --eval): the Desk draws under a press as before this round (DeskPaint.hold off)
const res = { redraw: [], switch: [], row: [] };
const HOLD_MS = 70;
const at = (n) => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) }; };
const pressAt = async ({ x, y }) => { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }); };
const releaseAt = async ({ x, y }) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
const menuOpen = () => Boolean(document.querySelector('#menu button') && visible(document.querySelector('#menu button')));
const promptOpen = () => [...document.querySelectorAll('dialog[open]')].find((d) => /Notes ·/.test(d.textContent));
const closeAll = async () => { try { hideMenu(); } catch { /* */ } for (let i = 0; i < 3 && promptOpen(); i++) { await key('Escape'); await wait(150); } for (const d of document.querySelectorAll('dialog[open]')) { if (!d.classList.contains('pw-loading')) try { d.close(); } catch { /* */ } } };
try {
  if (window.PO109_NOHOLD && window.DeskPaint?.holdPress) DeskPaint.holdPress(false);
  await until(() => document.querySelector('#agent-buttons .space-button'), 60000);
  await Lazy.load('projects'); await Projects.ready();
  const P = Projects; const p = P.get('pjbp0');
  await onDesk(p.id); await wait(2500);
  ClickWatch.clear();
  const delays = [0, 20, 40, 60, 80, 100, 120, 140, 160, 200, 240];
  for (const round of [0, 1]) {
    for (const d of delays) {
      await closeAll(); await wait(500);
      const dots = deskDots(); const spot = at(dots);
      P.setWorkspace(P.get(p.id), {}); // (the Desk drawn again in ≈ 80 ms: what a sync landing, a rename or an open's save does)
      await wait(d); const t = performance.now();
      await pressAt(spot); await wait(HOLD_MS); await releaseAt(spot);
      const ok = Boolean(await until(menuOpen, 1200, 20));
      res.redraw.push({ d, round, ok, ms: Math.round(performance.now() - t), sameNode: dots.isConnected });
    }
    for (const d of delays) {
      await closeAll(); await ProjectWorkspace.go('chat').catch(() => {}); await wait(700);
      const go = ProjectWorkspace.go('overview'); await wait(d);
      const dots = await until(() => { const b = deskDots(); return b && visible(b) ? b : null; }, 3000, 5);
      if (!dots) { res.switch.push({ d, round, ok: false, why: 'no ⋯' }); continue; }
      const spot = at(dots);
      await pressAt(spot); await wait(HOLD_MS); await releaseAt(spot);
      const ok = Boolean(await until(menuOpen, 1200, 20));
      res.switch.push({ d, round, ok, sameNode: dots.isConnected });
      await go.catch(() => {});
    }
    for (const d of delays) {
      await closeAll(); await wait(400);
      if (!await openDots()) { res.row.push({ d, round, ok: false, why: 'menu not open' }); continue; }
      const row = menuItem(/^Notes…/); if (!row) { res.row.push({ d, round, ok: false, why: 'no row' }); continue; }
      row.scrollIntoView({ block: 'center' }); await frame();
      const spot = at(row);
      P.setWorkspace(P.get(p.id), {});
      await wait(d);
      await pressAt(spot); await wait(HOLD_MS); await releaseAt(spot);
      const ok = Boolean(await until(promptOpen, 2000, 20));
      res.row.push({ d, round, ok, sameNode: row.isConnected });
    }
  }
  await closeAll();
  const sum = (xs) => ({ tries: xs.length, missed: xs.filter((x) => !x.ok).length, at: xs.filter((x) => !x.ok).map((x) => `${x.d}${x.why ? ` ${x.why}` : ''}`) });
  const misses = ClickWatch.misses();
  const missed = res.redraw.concat(res.switch, res.row).filter((x) => !x.ok).length;
  step('slow steps (ms)', true, { hold: !window.PO109_NOHOLD, redraw: sum(res.redraw), switch: sum(res.switch), row: sum(res.row), clickWatch: misses.slice(-12), deskPaint: window.DeskPaint?.pressStats?.() || null, burn: window.SMOKE_BURN });
  step('every ⋯ press opened its menu and every row press its prompt (a Desk redrawn under the press doesn\'t eat it)', window.PO109_NOHOLD || missed === 0, { missed });
  step('ClickWatch named every miss (as many misses as it caught, or more)', misses.length >= missed, { missed, caught: misses.length, why: [...new Set(misses.map((m) => m.why))] });
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 700));
}
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
