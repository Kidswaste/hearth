// (round 89, desk89) The Desk's drawing, the page side: its scroll place is set in the coming frame instead of laying
// out the window inside the task that built the Desk (desk-paint-core.js says why and how). projects-home.js calls
// DeskPaint.place(S, y) where it wrote S.root.scrollTop (two marked lines). Loaded with the projects group, before it.
const DeskPaint = (() => {
  const core = DeskPaintCore.placer({
    frame: (fn) => requestAnimationFrame(fn), clearFrame: (id) => cancelAnimationFrame(id),
    timer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    wait: 100, // a hidden window draws no frame: the write comes after this instead
  });
  return { place: core.place, flush: core.flush, pending: core.pending, stats: core.stats };
})();
window.DeskPaint = DeskPaint;
