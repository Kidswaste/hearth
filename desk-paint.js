// (round 89, desk89) The Desk's drawing, the page side: its scroll place is set in the coming frame instead of laying
// out the window inside the task that built the Desk (desk-paint-core.js says why and how). projects-home.js calls
// DeskPaint.place(S, y) where it wrote S.root.scrollTop (two marked lines). Loaded with the projects group, before it.
// (round 109, projopen109) held(root, paint): a Desk drawn again while a button on it is pressed waits for the release.
// The Desk is rebuilt whole (replaceChildren) about 80 ms after a project change (a sync landing, a rename, an open's
// save, the switch's own touch); a press that straddled it lost its click: the pressed ⋯ was gone at the release, so
// the click went to the Desk's body and nothing opened (round 108's "a ⋯ that did nothing"). Now the redraw waits
// until the click has been handled (the task after the release), 1.5 s at most (a release that never comes: a drag
// out of the window). holdPress(false) turns it off (a check's before).
// (round 114, projchecks114) a project card on Projects home too: it's a focusable <div>, not a button, so a card pressed
// while Home was drawn again (it shows the cards drawn last time, then draws them again 20–50 ms after it comes on
// screen, more on a busy start; any project change while it's on screen) lost its click: no click event at all, the
// project didn't open (measured on the heavy profile: a press, a project change, the release → 0 clicks).
const DeskPaint = (() => {
  const core = DeskPaintCore.placer({
    frame: (fn) => requestAnimationFrame(fn), clearFrame: (id) => cancelAnimationFrame(id),
    timer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    wait: 100, // a hidden window draws no frame: the write comes after this instead
  });
  const hold = { on: true, down: null, waiting: [], cap: 0, held: 0, ran: 0 };
  const release = () => {
    clearTimeout(hold.cap); hold.down = null;
    if (!hold.waiting.length) return;
    setTimeout(() => { if (hold.down) return; const fns = hold.waiting.splice(0); hold.ran += fns.length; for (const fn of fns) { try { fn(); } catch (err) { console.warn(err); } } }, 0);
  };
  addEventListener('pointerdown', (e) => { if (e.button === 0 && e.isPrimary) { hold.down = e.target; clearTimeout(hold.cap); hold.cap = setTimeout(release, 1500); } }, { capture: true, passive: true });
  addEventListener('pointerup', release, { capture: true, passive: true });
  addEventListener('pointercancel', release, { capture: true, passive: true });
  function held(root, fn) {
    const d = hold.down;
    if (!hold.on || !d || !(d instanceof Element) || !root?.contains(d) || !d.closest('button, a, input, select, textarea, summary, [role=button], .pj-card')) return false;
    hold.waiting.push(fn); hold.held += 1;
    return true;
  }
  return { place: core.place, flush: core.flush, pending: core.pending, stats: core.stats, pressStats: () => ({ held: hold.held, ran: hold.ran, on: hold.on }), held, holdPress: (on) => { hold.on = Boolean(on); return hold.on; } };
})();
window.DeskPaint = DeskPaint;
