// Shared probe for the smoothness checks (dev/checks/smooth-*.js). Put in front of a check with --lib:
//   node dev/smoke.js --fake-engines --lib dev/checks/smooth-lib.js --script dev/checks/smooth-video.js
// M.measure(ms, during?) records, for `ms` milliseconds while `during()` runs (optional):
//   frames: rAF frames, worst gap and how many gaps over 25 ms (a dropped frame at 60 Hz)
//   loaf: Long Animation Frames (count, total blocking ms, the scripts that took longest)
//   mut: DOM mutation records (MutationObserver on the whole document) and the busiest targets
//   trace: the harness's timeline trace (painted px, paint / raster / style / layout ms and counts)
// Numbers under Xvfb + SwiftShader are relative: compare a before and an after run on the same machine.
const M = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(50); } return false; };
  const label = (n) => { if (!n) return '?'; const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '#text'; const c = typeof e.className === 'string' ? e.className : e.className?.baseVal || ''; return `${e.tagName.toLowerCase()}${c ? `.${c.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`; };
  async function measure(ms, during) {
    const gaps = []; let last = 0; let on = true;
    const tick = (t) => { if (last) gaps.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const loafs = [];
    let po = null;
    try { po = new PerformanceObserver((l) => loafs.push(...l.getEntries())); po.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* no LoAF */ }
    let muts = 0; const byTarget = {};
    const mo = new MutationObserver((recs) => { muts += recs.length; for (const r of recs) { const k = `${r.type}:${label(r.target)}`; byTarget[k] = (byTarget[k] || 0) + 1; } });
    mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    await smoke({ trace: 'start' });
    const t0 = performance.now();
    const work = during ? during() : null;
    await wait(ms);
    await work;
    const elapsed = performance.now() - t0;
    const trace = await smoke({ trace: 'stop' });
    on = false; mo.disconnect(); po?.disconnect();
    gaps.sort((a, b) => a - b);
    const scripts = {};
    for (const f of loafs) for (const s of f.scripts || []) { const k = `${(s.sourceFunctionName || s.invoker || '?').slice(0, 40)} @${(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition ?? ''}`; scripts[k] = (scripts[k] || 0) + s.duration; }
    return {
      ms: Math.round(elapsed),
      frames: { n: gaps.length, fps: Math.round((gaps.length / elapsed) * 1000), worst: Math.round(gaps.at(-1) || 0), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0), over25: gaps.filter((g) => g > 25).length },
      loaf: { n: loafs.length, ms: Math.round(loafs.reduce((a, f) => a + f.duration, 0)), blockingMs: Math.round(loafs.reduce((a, f) => a + (f.blockingDuration || 0), 0)), top: Object.entries(scripts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${Math.round(v)}ms ${k}`) },
      mut: { n: muts, perSec: Math.round((muts / elapsed) * 1000), top: Object.entries(byTarget).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v}× ${k}`) },
      trace: { paints: trace.paints, paintedKpx: Math.round(trace.paintedPx / 1000), paintMs: trace.paintMs, rasterMs: trace.rasterMs, styleMs: trace.styleMs, styles: trace.styles, layoutMs: trace.layoutMs, layouts: trace.layouts, layoutObjects: trace.layoutObjects, top: trace.top?.slice(0, 4) },
    };
  }
  // a compact one-line summary for before / after tables
  const brief = (r) => `fps ${r.frames.fps} worst ${r.frames.worst}ms drops ${r.frames.over25} · LoAF ${r.loaf.n}/${r.loaf.blockingMs}ms · mut ${r.mut.perSec}/s · paint ${r.trace.paints}× ${r.trace.paintedKpx}kpx ${r.trace.paintMs}ms · style ${r.trace.styles}× ${r.trace.styleMs}ms · layout ${r.trace.layouts}× ${r.trace.layoutMs}ms ${r.trace.layoutObjects ?? '?'}obj`;
  async function mouse(type, x, y, extra = {}) { return smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1, ...extra } }); }
  return { wait, until, measure, brief, mouse };
})();
