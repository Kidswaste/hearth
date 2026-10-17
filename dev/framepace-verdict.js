// Does Hearth's Best look cost the game frames? (round 57, framepace57) The verdict gamefps54 (dev/checks/gamefps54.js)
// and framepace57 (dev/checks/framepace57.js) use, from INTERLEAVED blocks of frames inside one play: Hearth's helpers
// on, then stepped aside (playbudget's own switches: the look's hooks pass straight through and its shadow maps go back to
// the game's own 512², loads during play and the sound part step aside), alternating ABBA so a busy moment of the
// machine falls on both sides. Two separate plays minutes apart (round 54–56's verdict) read 100 vs 116 / 133 ms on this
// loaded machine with nothing of Hearth's running per frame: gaps between frames come in whole refreshes here.
// Per pair (an "on" block and its "off" block):
//   cpu     the time around the game's renderer.render() call (where the look's / loads during play's hooks run) on −
//           off. The median across pairs within 2 % of the frame's CPU (0.1 ms floor: playbudget's budget; 0.5 ms cap). The page's
//           clock is exact enough and CPU time barely depends on the machine's other load: this is what catches a
//           helper doing steady per-frame work, even when the frames are bound by a (software) graphics card
//   frames  the mean gap between the game's frames on − off. Slower = the bootstrap 95 % interval of the mean difference
//           lies above 0 (really slower, not noise) AND the mean difference is over the tolerance (5 % of the frame, at
//           least 2 ms). Both: noise alone can't fail it; a real slowdown the size of the tolerance can't hide in noise
//           for long (more pairs narrow the interval)
// Node: module.exports; a check: new Function('module', src) on this file's text.
(function (root) {
  const finite = (x) => typeof x === 'number' && Number.isFinite(x);
  const median = (a) => { const s = a.filter(finite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const mean = (a) => { const s = a.filter(finite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
  // a small seeded generator: the same pairs always give the same interval (a check never flips on its own dice)
  const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function boot(d, n = 4000, seed = 57) {
    const x = d.filter(finite); if (x.length < 3) return null;
    const r = rng(seed); const m = new Array(n);
    for (let i = 0; i < n; i += 1) { let s = 0; for (let k = 0; k < x.length; k += 1) s += x[Math.floor(r() * x.length)]; m[i] = s / x.length; }
    m.sort((a, b) => a - b);
    return [m[Math.floor(n * 0.025)], m[Math.floor(n * 0.975)]];
  }
  const r3 = (x) => (finite(x) ? +x.toFixed(3) : null);
  // pairs = [{ on: { gapMean, over, cpu }, off: { … } }, …] → { ok, cpu: { …, ok }, frames: { …, ok }, why }
  function judge(pairs, o = {}) {
    const ok = (pairs || []).filter((p) => p && p.on && p.off && finite(p.on.gapMean) && finite(p.off.gapMean) && finite(p.on.over) && finite(p.off.over));
    const minPairs = o.minPairs || 6;
    if (ok.length < minPairs) return { ok: false, why: `only ${ok.length} pairs measured (${minPairs} needed)`, pairs: ok.length };
    const offCpu = median(ok.map((p) => (finite(p.off.cpu) ? p.off.cpu : null)));
    const offGap = median(ok.map((p) => p.off.gapMean));
    // (capped at 0.5 ms: on a machine loaded to ~1 frame a second the frame's CPU time reads 30–600 ms, mostly waiting
    // for a core, and 2 % of that would let a real 1 ms of work a frame through)
    const allow = Math.min(o.capMs == null ? 0.5 : o.capMs, Math.max(o.floorMs == null ? 0.1 : o.floorMs, (o.cpuShare == null ? 0.02 : o.cpuShare) * (offCpu || 0)));
    const dOver = ok.map((p) => p.on.over - p.off.over);
    const cpuMed = median(dOver);
    const cpu = { med: r3(cpuMed), ci: (boot(dOver) || []).map(r3), allow: r3(allow), offCpu: r3(offCpu), ok: cpuMed <= allow };
    const dGap = ok.map((p) => p.on.gapMean - p.off.gapMean);
    const gm = mean(dGap); const ci = boot(dGap);
    const tol = Math.max(o.gapFloorMs == null ? 2 : o.gapFloorMs, (o.gapShare == null ? 0.05 : o.gapShare) * offGap);
    const slower = Boolean(ci && ci[0] > 0 && gm > tol);
    const frames = { mean: r3(gm), med: r3(median(dGap)), ci: ci && ci.map(r3), tol: r3(tol), offGap: r3(offGap), pct: r3((100 * gm) / offGap), slowerIn: dGap.filter((d) => d > 0).length, ok: !slower };
    const why = !cpu.ok ? `Hearth's work around the game's render: +${cpu.med} ms a frame (allowed ${cpu.allow})` : !frames.ok ? `frames ${frames.mean} ms slower (${frames.pct} %; 95 % interval ${frames.ci.join('…')} ms, tolerance ${frames.tol})` : '';
    return { ok: cpu.ok && frames.ok, cpu, frames, pairs: ok.length, why };
  }
  const api = { judge, median, mean, boot };
  if (typeof root === 'object' && root && root.exports !== undefined) root.exports = api;
  return api;
}(typeof module === 'object' ? module : null));
