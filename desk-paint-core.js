// (round 89, desk89) The Desk's scroll place, set without laying out the window in the middle of a script.
// Drawing a project's Desk (projects-home.js paintProject) ended by writing its kept place: `S.root.scrollTop = y`. A
// scrollTop write makes the browser lay out the window there and then, so the Desk just built (and everything the
// switch had changed: the surface coming forward, its classes) was styled and laid out inside the same task: 15–30 ms of
// the 50–70 ms task on Clink (1,069 things) in projopen86's switches.
// place(S, y) gives the same place without that:
//   · nothing to do when the Desk is already there (S.top, kept by its scroll events since round 86, is y): the write
//     only made a layout happen, it moved nothing (most switches: both Desks at the top)
//   · otherwise S.top says y at once (keepDesk reads S.top, so leaving before the frame keeps y, as before), and the
//     write happens in the coming frame, just before that frame lays out the window anyway: one layout, not two, and
//     the first frame drawn shows the Desk at y (no frame at the old place)
//   · a newer place, or a scroll meanwhile (S.top changed: the person scrolled), wins: the old write is dropped
//   · a window that isn't drawing (hidden: no frames) gets the write after `wait` ms instead (as painted() does)
//   · when the Desk puts the caret back in one of its fields ({ now: true }), the write is done at once, as before:
//     putting the caret back lays the window out anyway, and where the browser scrolls to show a caret depends on it
// The page side (desk-paint.js) gives it requestAnimationFrame and setTimeout; tests give it their own.
const DeskPaintCore = (() => {
  function placer({ frame, timer, clearFrame = () => {}, clearTimer = () => {}, wait = 100 } = {}) {
    let pending = null;
    const stats = { kept: 0, deferred: 0, written: 0, dropped: 0, byTimer: 0 };
    function cancel() {
      if (!pending) return;
      clearFrame(pending.f); clearTimer(pending.t); pending = null;
    }
    // S: { root, top } (projects-home.js's state: root is the Desk's scrolling element); y: the place to show
    // now: write it at once, as before (the Desk is about to put the caret back in a field: that lays the window out
    // anyway, and the browser keeps a caret in view by the layout it has then, so the place is written first, as it was)
    function place(S, y, { now = false } = {}) {
      const want = Number(y) || 0;
      if (pending) { cancel(); stats.dropped += 1; }
      if (now) { S.top = S.root.scrollTop = want; stats.written += 1; stats.now = (stats.now || 0) + 1; return 'written'; }
      const at = S.top ?? 0; // (no scroll event yet: the element was never scrolled, it is at 0)
      S.top = want;
      if (at === want) { stats.kept += 1; return 'kept'; }
      stats.deferred += 1;
      const job = { S, want };
      const run = (why) => {
        if (pending !== job) return;
        clearFrame(job.f); clearTimer(job.t); pending = null;
        if (S.top !== want) { stats.dropped += 1; return; } // scrolled meanwhile: that place stays
        S.root.scrollTop = want; // (S.top already says it; a place that gets clamped comes back by its scroll event, as before)
        stats.written += 1; if (why === 'timer') stats.byTimer += 1;
      };
      pending = job;
      job.f = frame(() => run('frame'));
      job.t = timer(() => run('timer'), wait);
      return 'deferred';
    }
    // a write still waiting (for a check, or a caller that must read the element's own scrollTop now): done at once
    function flush() { if (!pending) return false; const j = pending; cancel(); if (j.S.top === j.want) { j.S.root.scrollTop = j.want; stats.written += 1; } return true; }
    return { place, flush, cancel, pending: () => Boolean(pending), stats };
  }
  return { placer };
})();
if (typeof module !== 'undefined') module.exports = DeskPaintCore;
