// 📈 Test play performance (round 76, gpuplay76): the plain-words summariser. Pure functions (no DOM, no clock, no
// Electron), so dev/gpuplay-test.js runs it in Node. Its input is what GpuPlay (gpuplay.js) gathered in 20 s of play:
//   sample = {
//     secs, title, kind ('lab' | 'html'), how,
//     page:   { frames, gaps[], cpu[], gpu[] (ms a frame, one per measured frame), gpuWhy ('' | 'no-timer' | 'disjoint' |
//               'game-queries' | 'no-context'), contexts, main: { w, h, cssW, cssH, dpr, attrs, renderer }, draws,
//               laf: { n, worst: [{ ms, where }] }, hearth: { budget, quality, look, hitch, info, probe } },
//     gpu:    gpu52:info (line, name, backend, kind, dual, decision, flags, status),
//     facts:  gpuplay:facts (platform, display: { hz, w, h, scale, primary, label }, displays, procs: { gpu, game, hub,
//             browser } (% of one core over the test), hags, pref, windowed, versions, cpu),
//     prefs:  { quality, look, lowLatency }
//   }
//   stats(list)          → { n, p50, p95, p99, mean, max }
//   summarise(sample)    → { bound, headline, lines[], tips[], actions[{ id, label, why }], numbers }
//   report(sample, sum?) → the text for a Claude dev session (numbers only; nothing is sent anywhere: the clipboard)
// "bound": 'smooth' (keeps up with the screen) · 'gpu' (the graphics card is the limit) · 'cpu' (the game's own frame on
// the main thread) · 'capped' (frames come at a lower steady rate while neither side is busy: the screen / Windows
// pace it) · 'software' (no graphics card in use) · 'unclear'.
(function () {
  const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
  const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  function stats(list) {
    const a = (Array.isArray(list) ? list : []).filter((x) => Number.isFinite(x) && x >= 0).sort((x, y) => x - y);
    const n = a.length;
    if (!n) return { n: 0, p50: null, p95: null, p99: null, mean: null, max: null };
    const at = (p) => a[Math.min(n - 1, Math.max(0, Math.ceil(n * p) - 1))];
    return { n, p50: r2(at(0.5)), p95: r2(at(0.95)), p99: r2(at(0.99)), mean: r2(a.reduce((s, x) => s + x, 0) / n), max: r2(a[n - 1]) };
  }
  const BACK = { d3d11: 'D3D11', d3d11on12: 'D3D11on12', vulkan: 'Vulkan', gl: 'OpenGL', metal: 'Metal', software: 'software' };
  // ANGLE's renderer string → { name, backend, vendor } (as gpu52-core.parseRenderer, kept here so this file stands alone)
  function renderer(s) {
    const str = String(s || '').trim();
    if (!str) return { name: '', backend: '', vendor: '' };
    if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(str)) return { name: /swiftshader/i.test(str) ? 'SwiftShader' : 'software', backend: 'software', vendor: 'software' };
    const m = /^ANGLE \(([^,]*),\s*(.*?)(?:,\s*([^,()]*))?\)$/.exec(str);
    const tail = m ? `${m[2]} ${m[3] || ''}` : str;
    const backend = /Metal/i.test(tail) ? 'Metal' : /D3D11on12/i.test(tail) ? 'D3D11on12' : /D3D11|Direct3D11/i.test(tail) ? 'D3D11' : /D3D9|Direct3D9/i.test(tail) ? 'D3D9' : /Vulkan/i.test(tail) ? 'Vulkan' : /OpenGL/i.test(tail) ? 'OpenGL' : '';
    let name = m ? m[2].replace(/ANGLE Metal Renderer:\s*/i, '').replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/\s+(Direct3D\d+.*|OpenGL.*|Vulkan.*)$/i, '').trim() : str.slice(0, 80);
    if (!name && m) name = m[1];
    const v = `${m ? m[1] : ''} ${name}`;
    const vendor = /nvidia|geforce|rtx|quadro/i.test(v) ? 'NVIDIA' : /amd|radeon|ati\b/i.test(v) ? 'AMD' : /intel/i.test(v) ? 'Intel' : /apple/i.test(v) ? 'Apple' : /qualcomm|adreno/i.test(v) ? 'Qualcomm' : '';
    return { name, backend, vendor };
  }
  // a small built-in card (the one a two-card laptop / desktop would save power with)
  const integrated = (r) => /intel/i.test(r.vendor) || /(radeon\(tm\)\s*graphics|radeon graphics|vega \d+ graphics|uhd|iris|hd graphics)/i.test(r.name);
  const nice = (n) => Math.round(n).toLocaleString('en-US');
  const ms = (v) => (v == null ? '—' : `${v < 10 ? r2(v) : r1(v)} ms`);

  function summarise(s = {}) {
    const page = s.page || {}; const gpu = s.gpu || {}; const facts = s.facts || {}; const prefs = s.prefs || {}; const hearth = page.hearth || {};
    const platform = facts.platform || gpu.decision?.platform || '';
    const win = platform === 'win32';
    const gaps = stats(page.gaps); const cpu = stats(page.cpu); const gpuT = stats(page.gpu);
    const secs = Number(s.secs) || (gaps.n && gaps.mean ? (gaps.n * gaps.mean) / 1000 : 0);
    const fps = gaps.mean ? 1000 / gaps.mean : 0;
    let hz = Number(facts.display?.hz) || Number(s.hz) || 0;
    const hzKnown = hz > 0;
    if (!hz) hz = gaps.p50 ? Math.round(1000 / gaps.p50) : 60; // (a screen that doesn't say its refresh: the pace measured)
    const budget = 1000 / hz;
    const r = renderer(page.main?.renderer || gpu.status?.renderer || '');
    const gpuKind = String(gpu.kind || '');
    const software = gpuKind === 'software' || gpuKind === 'none' || r.backend === 'software';
    const backend = r.backend || (gpu.backend && gpu.backend !== 'software' ? gpu.backend : '') || BACK[gpu.decision?.backend] || '';
    const cardName = software ? (r.name || 'software') : (r.name || gpu.name || 'the graphics card');
    const dual = Boolean(gpu.dual) || Boolean(facts.gpus && facts.gpus.filter((g) => !g.virtual).length > 1);
    const otherFast = (facts.gpus || []).some((g) => /nvidia|amd|radeon/i.test(`${g.vendor} ${g.name}`) && !/radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i.test(g.name || ''));
    const onSmall = !software && integrated(r) && (dual || otherFast);
    const hitches = (page.gaps || []).filter((g) => g > Math.max(50, budget * 4)).length;
    const keepsUp = fps >= hz * 0.93 && (gaps.p95 == null || gaps.p95 <= budget * 1.6);
    const gpuKnown = gpuT.n >= 10;
    const frame = gaps.p50 || budget;
    // the game's frame on the main thread: the frame's start → its rendering work done (gpuplay.js's probe)
    const cpuBusy = cpu.p50 != null && cpu.p50 >= Math.min(frame, budget) * 0.85 && cpu.p50 >= budget * 0.85;
    const gpuBusy = gpuKnown && (gpuT.p50 >= frame * 0.75 || gpuT.p50 >= budget * 1.05);
    const procGpu = Number(facts.procs?.gpu);
    let bound;
    if (software) bound = 'software';
    else if (keepsUp) bound = 'smooth';
    else if (gpuBusy && !(cpuBusy && cpu.p50 > gpuT.p50)) bound = 'gpu';
    else if (cpuBusy) bound = 'cpu';
    else if (!gpuKnown && cpu.p50 != null && cpu.p50 < budget * 0.6 && procGpu >= 70) bound = 'gpu'; // (no timer: the GPU process kept a core busy)
    else {
      const steady = gaps.p95 != null && gaps.p50 && gaps.p95 <= gaps.p50 * 1.25;
      const lower = [30, 50, 60, 72, 75, 90, 100, 120, 144, 165].find((x) => x < hz * 0.9 && Math.abs(fps - x) <= x * 0.06);
      bound = steady && lower ? 'capped' : 'unclear';
    }
    const fpsTxt = `${Math.round(fps)} fps`;
    const hzTxt = hzKnown ? `${Math.round(hz)} Hz` : 'your screen';
    const title = s.title || 'The game';
    const HEAD = {
      smooth: `${title} keeps up with ${hzKnown ? `your ${hzTxt} screen` : 'your screen'}: ${fpsTxt}${hitches ? `, with ${hitches} hitch${hitches === 1 ? '' : 'es'} over 50 ms` : ''}.`,
      gpu: `${title} runs at ${fpsTxt} on a ${hzTxt} screen: the graphics card is the limit${gpuKnown ? ` (${ms(gpuT.p50)} of GPU work a frame; ${ms(budget)} fits ${hzTxt})` : ''}.`,
      cpu: `${title} runs at ${fpsTxt} on a ${hzTxt} screen: the game's own frame on the processor is the limit (${ms(cpu.p50)} a frame; ${ms(budget)} fits ${hzTxt}).`,
      capped: `${title} runs at a steady ${fpsTxt} on a ${hzTxt} screen while neither the processor nor the graphics card is busy: something paces the window at ${Math.round(fps)} Hz.`,
      software: `${title} is drawn without the graphics card (software drawing${r.name && r.name !== 'software' ? `: ${r.name}` : ''}) — ${fpsTxt}${hzKnown ? ` on a ${hzTxt} screen` : ''}.`,
      unclear: `${title} runs at ${fpsTxt} on a ${hzTxt} screen, but neither the processor nor the graphics card looks full${gpuKnown ? '' : ' (this card doesn\'t time its own work here)'}.`,
    };
    const lines = [];
    lines.push(`Frames: ${fpsTxt} (${hzKnown ? `screen ${hzTxt}` : 'the screen didn\'t say its refresh'}) · frame time p50 ${ms(gaps.p50)} · p95 ${ms(gaps.p95)} · p99 ${ms(gaps.p99)}${hitches ? ` · ${hitches} hitch${hitches === 1 ? '' : 'es'} over 50 ms` : ''}`);
    if (software) lines.push(`Graphics card: none in use — software drawing (${r.name || 'software'})${gpu.flags?.['use-angle'] ? ` · started with --use-angle=${gpu.flags['use-angle']}` : ''}`);
    else lines.push(`Graphics card: ${cardName}${backend ? ` via ${backend}` : ''} (ANGLE) — ${onSmall ? 'the small built-in card, not your fast one ✗' : dual ? 'the fast card ✓' : 'the only card, so the fast one ✓'}`);
    lines.push(`GPU work a frame: ${gpuKnown ? `${ms(gpuT.p50)} (p95 ${ms(gpuT.p95)})` : { 'no-timer': 'not measurable here (no GPU timer on this path)', disjoint: 'not measurable this time (the card changed clocks mid-test)', 'game-queries': 'not measured (the game times its own GPU work)', 'no-context': 'not measured (no WebGL canvas found)' }[page.gpuWhy] || 'not measured'} · processor (the game's frame): ${ms(cpu.p50)} (p95 ${ms(cpu.p95)})`);
    const m = page.main || {};
    if (m.w && m.h) {
      const mp = (m.w * m.h) / 1e6;
      lines.push(`Drawing ${m.w}×${m.h} (${r1(mp)} MP${m.dpr ? `, pixel ratio ${r2(m.dpr)}` : ''}${m.attrs ? `, antialias ${m.attrs.antialias ? 'on' : 'off'}` : ''})${page.draws != null ? ` · ${nice(page.draws)} draw call${page.draws === 1 ? '' : 's'} a frame` : ''}${page.contexts > 1 ? ` · ${page.contexts} WebGL canvases` : ''}`);
    }
    // Hearth's side: its helpers in the game, its window behind the game, the GPU process
    const b = hearth.budget || null;
    const hearthMs = b && Number.isFinite(Number(b.ms ?? b.avg)) ? Number(b.ms ?? b.avg) : null;
    const costs = [];
    if (hearthMs != null) costs.push({ what: 'Hearth\'s helpers in the game', ms: hearthMs, text: `${ms(hearthMs)} a frame (${Math.round((hearthMs / budget) * 1000) / 10} % of a ${hzTxt} frame)` });
    if (b?.helpers) for (const [id, h] of Object.entries(b.helpers)) { const v = Number(h?.avg ?? h?.ms); if (h?.on && Number.isFinite(v) && v >= 0.005) costs.push({ what: h.name || id, ms: v, text: `${ms(v)} a frame`, helper: id }); }
    if (hearth.hitch && /●/.test(hearth.hitch)) costs.push({ what: 'the hitch map recording', ms: null, text: 'on (a little work every frame while it records)' });
    if (hearth.probe) costs.push({ what: 'the performance probe (stats chip / doctor)', ms: null, text: 'attached' });
    if (Number.isFinite(Number(facts.procs?.hub))) costs.push({ what: 'Hearth\'s main window behind the game', ms: null, pct: Number(facts.procs.hub), text: `${r1(Number(facts.procs.hub))} % of a processor core` });
    const top = costs.filter((c) => c.helper).sort((a, b2) => b2.ms - a.ms).slice(0, 3);
    const hearthLine = [hearthMs != null ? `Hearth's own work in the game: ${ms(hearthMs)} a frame${top.length ? ` (${top.map((c) => `${c.what} ${ms(c.ms)}`).join(', ')})` : ''}` : '', hearth.quality ? hearth.quality : `Quality ${prefs.quality || 'auto'}`, `Graphics ${prefs.look === 'balanced' ? 'Balanced' : 'Best'}`, prefs.lowLatency ? 'low-latency canvas on' : ''].filter(Boolean).join(' · ');
    lines.push(hearthLine);
    const procs = facts.procs || {};
    const pl = [Number.isFinite(Number(procs.game)) ? `the game ${r1(Number(procs.game))} %` : '', Number.isFinite(Number(procs.gpu)) ? `graphics process ${r1(Number(procs.gpu))} %` : '', Number.isFinite(Number(procs.hub)) ? `Hearth's window ${r1(Number(procs.hub))} %` : '', Number.isFinite(Number(procs.browser)) ? `Hearth's main process ${r1(Number(procs.browser))} %` : ''].filter(Boolean);
    if (pl.length) lines.push(`Processor use (of one core): ${pl.join(' · ')}`);
    if (page.laf?.n) lines.push(`Long frames (over 50 ms): ${page.laf.n}${page.laf.worst?.length ? ` — the longest ${ms(page.laf.worst[0].ms)}${page.laf.worst[0].where ? ` in ${page.laf.worst[0].where}` : ''}` : ''}`);
    if (win) {
      const w = [facts.hags === true ? 'hardware-accelerated GPU scheduling on' : facts.hags === false ? 'hardware-accelerated GPU scheduling off' : '', facts.pref ? `Windows graphics preference for Hearth: ${facts.pref}` : '', facts.windowed === true ? 'optimizations for windowed games on' : facts.windowed === false ? 'optimizations for windowed games off' : ''].filter(Boolean);
      if (w.length) lines.push(`Windows: ${w.join(' · ')}`);
    }
    if (facts.display && facts.display.primary === false) lines.push(`The game played on ${facts.display.label || 'a screen'} (${hzTxt}), which isn't your main display`);

    // ---------- what to do (one click each) ----------
    const actions = []; const tips = [];
    const add = (id, label, why) => { if (!actions.some((a) => a.id === id)) actions.push({ id, label, why }); };
    const dec = gpu.decision || {};
    const slow = bound !== 'smooth';
    if (software && gpu.decision && (facts.gpus || []).some((g) => !g.virtual)) add('restart', 'Restart Hearth', 'it started without the graphics card; a restart usually brings it back (if not, update the graphics driver)');
    if (win && !software && ((dec.backend && !['d3d11', 'auto'].includes(dec.backend)) || (backend && backend !== 'D3D11'))) add('backend-d3d11', 'Switch graphics path to D3D11', `${backend || BACK[dec.backend] || dec.backend} is in use; D3D11 is the fastest, most tested path for WebGL on Windows (takes effect after a restart)`);
    if (onSmall || dec.power === 'saver') add('power-high', 'Use the fast graphics card', onSmall ? `the game is drawn on ${cardName}, the small built-in card` : 'Hearth is set to the power-saving card');
    if (slow && !software && prefs.quality === 'full' && (bound === 'gpu' || bound === 'unclear')) add('quality-auto', 'Turn Quality: auto on', 'fewer pixels only when frames drop, back to every pixel when there\'s room');
    if (slow && !software && bound === 'gpu' && prefs.look !== 'balanced') add('look-balanced', 'Try Graphics: Balanced', 'the Best look\'s shadows and texture filtering cost the graphics card; Balanced keeps the game\'s own');
    if (slow && dec.canvas === 'graphite') add('canvas-auto', 'Back to the usual canvas renderer', 'the Graphite canvas renderer is on (experimental); the usual one is the tested path');
    if (slow && prefs.lowLatency) add('lowlat-off', 'Turn the low-latency canvas off', 'it skips the browser\'s compositor and can cost frames on some drivers');
    if (hearth.hitch && /●/.test(hearth.hitch)) add('hitch-off', 'Stop recording the hitch map', 'it does a little work every frame while it records');
    if (bound === 'cpu') add('doctor', 'Why is it slow? (performance doctor)', 'names the game\'s own costs: draw calls, garbage, long functions, with fixes');
    if (hearthMs != null && hearthMs > budget * 0.02 && hearthMs >= 0.1) add('helpers', 'Hearth\'s helpers: what they cost', 'Hearth\'s own work in the game is over its 2 % budget; the costliest are switched off for this game by themselves');
    if (bound === 'capped' || (hzKnown && hz <= 61 && win)) {
      if (facts.display && facts.display.primary === false) tips.push(`Windows paces Hearth by your main display: make the ${hzTxt} screen the main display (Settings › System › Display › “Make this my main display”), or play on the main one.`);
      if (hzKnown && hz <= 61) tips.push('Windows runs this screen at 60 Hz: if it can do more (240 Hz), pick it in Settings › System › Display › Advanced display › Choose a refresh rate.');
      if (win) add('display', 'Open Windows display settings', 'the refresh rate and the main display are set there');
      if (!tips.length) tips.push(`Frames come at a steady ${Math.round(fps)} per second: check the refresh rate in your display settings, and that V-Sync / frame caps are off for Hearth in the NVIDIA / AMD control panel.`);
    }
    if (bound === 'gpu' && gpuKnown && m.w && m.h && prefs.quality !== 'full') tips.push(`The card needs ${ms(gpuT.p50)} for ${r1((m.w * m.h) / 1e6)} MP: Quality auto already lowers the pixels when frames drop; the rest is the scene's own work (lights with shadows, post effects, particles).`);
    if (bound === 'cpu') tips.push('The processor side is the game\'s own frame (its update code and how many objects it sends to the card): the performance doctor names them.');
    if (bound === 'unclear' && !gpuKnown) tips.push('The graphics card\'s own time couldn\'t be measured on this path; Copy the report for Claude: the processor use and frame times say where to look.');
    if (bound === 'software') tips.push(software && (facts.gpus || []).some((g) => !g.virtual) ? 'Chromium turned the graphics card off for this start (a crash while starting or a driver it distrusts).' : 'This computer has no graphics card Hearth can use (a virtual machine, a remote desktop or a test machine).');

    const numbers = { fps: r1(fps), hz: hzKnown ? Math.round(hz) : null, budget: r2(budget), secs: r1(secs), gaps, cpu, gpu: gpuT, hitches, backend, card: cardName, vendor: r.vendor, onSmall, dual, software, keepsUp, hearthMs: hearthMs == null ? null : r2(hearthMs) };
    return { bound, headline: HEAD[bound], lines, tips, actions, numbers, costs };
  }

  // the text for a Claude dev session: numbers, the switches, Hearth's side, what the owner can click; no prose
  function report(s = {}, sum = summarise(s)) {
    const N = sum.numbers; const page = s.page || {}; const gpu = s.gpu || {}; const facts = s.facts || {};
    const st = (x) => (x?.n ? `p50 ${x.p50} · p95 ${x.p95} · p99 ${x.p99} · mean ${x.mean} · max ${x.max} ms (n ${x.n})` : 'n/a');
    const o = [`Hearth "📈 Test play performance" report (${N.secs} s of ▶ Play measured on the owner's machine; nothing was sent anywhere).`,
      `Game: ${s.title || '?'} (${s.kind || '?'}${s.how ? `, ${s.how}` : ''})`,
      `Verdict: ${sum.bound} — ${sum.headline}`,
      `Frames: ${N.fps} fps vs ${N.hz || '?'} Hz (budget ${N.budget} ms) · gaps ${st(N.gaps)} · hitches >50 ms: ${N.hitches}`,
      `Main-thread frame (rAF time → rendering done): ${st(N.cpu)}`,
      `GPU (EXT_disjoint_timer_query_webgl2, summed over ${page.contexts || 0} context(s)): ${N.gpu.n ? st(N.gpu) : `not measured (${page.gpuWhy || '?'})`}`,
      `GPU in use: ${page.main?.renderer || '?'} → ${N.card}${N.backend ? ` / ${N.backend}` : ''}${N.software ? ' (SOFTWARE)' : ''}${N.onSmall ? ' (integrated while a discrete card exists)' : ''} · dual: ${N.dual}`,
      `gpu52: ${gpu.line || '?'} · kind ${gpu.kind || '?'} · decision ${JSON.stringify({ backend: gpu.decision?.backend, auto: gpu.decision?.auto, power: gpu.decision?.power, canvas: gpu.decision?.canvas, switches: gpu.decision?.switches, fellBack: gpu.decision?.fellBack || null })}`,
      `Switches in effect: ${JSON.stringify(Object.fromEntries(Object.entries(gpu.flags || {}).filter(([, v]) => v)))}`,
      `Feature status: ${JSON.stringify(gpu.status || {})}`];
    const m = page.main || {};
    if (m.w) o.push(`Canvas: ${m.w}×${m.h} drawing buffer, ${m.cssW}×${m.cssH} CSS, dpr ${m.dpr} · attrs ${JSON.stringify(m.attrs || {})} · draws/frame ${page.draws ?? '?'} · contexts ${page.contexts}`);
    o.push(`Display: ${JSON.stringify(facts.display || {})} · all: ${JSON.stringify((facts.displays || []).map((d) => ({ hz: d.hz, w: d.w, h: d.h, scale: d.scale, primary: d.primary })))}`);
    o.push(`Processes (% of one core over the test): ${JSON.stringify(facts.procs || {})}`);
    o.push(`Machine: ${[facts.platform || '?', facts.os, facts.cpu, `Electron ${facts.versions?.electron || '?'} / Chrome ${facts.versions?.chrome || '?'}`, facts.platform === 'win32' ? `HAGS ${facts.hags} · GpuPreference ${facts.pref || 'unset'} · windowed-games opt ${facts.windowed}` : '', `GPUs ${JSON.stringify(facts.gpus || [])}`].filter(Boolean).join(' · ')}`);
    o.push(`Hearth in the game: ${JSON.stringify(page.hearth || {})}`);
    o.push(`Prefs: ${JSON.stringify(s.prefs || {})}`);
    if (page.laf?.n) o.push(`Long animation frames: ${page.laf.n} · worst ${JSON.stringify(page.laf.worst || [])}`);
    if (sum.actions.length) o.push(`Offered: ${sum.actions.map((a) => a.label).join(' | ')}`);
    if (sum.tips.length) o.push(`Tips shown: ${sum.tips.join(' | ')}`);
    o.push('Code: gpuplay.js (probe + card), gpuplay-core.js (this summary), gpuplaymain.js (facts), gpu52main.js (switches), gamemodemain.js (the ▶ Play window), gamequality-preload.js (Quality auto).');
    return o.join('\n');
  }

  const api = { stats, renderer, summarise, report, integrated };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else globalThis.GpuPlayCore = api;
}());
