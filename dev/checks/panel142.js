// (round 142, panel142) ONE Layers & knobs panel, fast (docs/upgrades/panel142.md), in one check on realscene-lib's real
// scene (the demo's backdrop, 30,000 particles, a textured 🧊 model, a beat rig, ✦ Bloom, a song playing) plus 25 more
// layers with sliders (30 in all, two groups, one layer with 40 sliders), made in the check's own temp data:
//   1. one panel: the layers and, under the selected one, its knobs (no separate Sliders box); ★ Favourites and
//      🎛 Dials sit folded at the top; the old ⚡ Sliders button, Ctrl/⌘+K and / open the same panel at the right place
//   2. expand / collapse: only the selected layer is open; ▸ opens another in place, 📌 keeps one open, ▾ folds it
//   3. groups, rename in place, 🔍 find and solo still work in the merged list
//   4. a slider row keeps 🔒, ♪ / 〰, ◆ and its right-click; a knob drag is ONE undo step on release
//   5. the timings, load-aware (dev/loadwait.js through smoke): select a layer, a knob drag (main-thread time per input,
//      no forced layout per input: a timeline trace), messages to the preview per frame, open / fold a layer, scroll the
//      panel (no long task), a reply landing while it is open (rows patched, not rebuilt)
//   window.P142_ONLY = 'timing' runs only step 5 (the before / after numbers of the round's note)
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --lib dev/checks/realscene-lib.js --script dev/checks/panel142.js
const out = { steps: [], numbers: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async (ms = 60) => { await frame(); await frame(); await wait(ms); };
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(4000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const ONLY = String(window.P142_ONLY || '');

try {
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.stageHooks?.pane && ThreeLab.search, 60000);
  const D = () => ThreeLab.director;
  const hk = ThreeLab.stageHooks;
  const info = await RS.open({ play: true });
  step('the real scene opened (demo layers, 🧊 model, beat rig, a song playing)', info.demo && info.song, { layers: info.layers, bpm: info.bpm });

  // ---------- 25 more layers with sliders (each reads its sliders every frame: they are live) ----------
  const LAYER = (n, extra = 0) => {
    const sl = [['amount', 0.5, 0, 1, 'Amount', 'Look'], ['speed', 1, 0, 4, 'Speed', 'Motion'], ['size', 0.3, 0, 1, 'Size', 'Look'], ['glow', 0.4, 0, 2, 'Glow', 'Look'], ['spin', 0.2, -2, 2, 'Spin', 'Motion'],
      ['react', 0.6, 0, 2, 'React to kick', 'Music'], ['decay', 0.3, 0, 1, 'Decay', 'Music'], ['blur', 0.1, 0, 1, 'Blur', 'Look'], ['wobble', 0.2, 0, 1, 'Wobble', 'Motion'], ['count', 12, 1, 64, 'Count', 'Shape', true]];
    for (let k = 0; k < extra; k += 1) sl.push([`x${k}`, 0.5, 0, 1, `Extra ${k + 1}`, `Group ${1 + (k % 4)}`]);
    const body = sl.map(([key, v, lo, hi, label, group, int]) => `  ${key}: { value: ${v}, min: ${lo}, max: ${hi}, ${int ? 'step: 1, ' : ''}label: '${label}', group: '${group}' },`).join('\n');
    return `// panel142 layer ${n}
const P = tweak({
${body}
  tint: { value: '#${(0x335577 + n * 0x0a1203).toString(16).slice(-6)}', label: 'Tint', group: 'Look' },
  mode: { value: 'soft', options: ['soft', 'hard', 'glow'], label: 'Mode', group: 'Look' },
});
const c = document.createElement('canvas'); c.width = 4; c.height = 4; c.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0'; document.body.append(c);
const g = c.getContext('2d');
function loop() { let s = 0; for (const k in P) { const v = P[k]; if (typeof v === 'number') s += v; } g.globalAlpha = Math.min(1, s / 100); g.fillStyle = P.tint; g.fillRect(0, 0, 4, 4); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
`;
  };
  const NAMES = ['Kick rings', 'Snare flash', 'Hat sparks', 'Bass wave', 'Sub pulse', 'Clap burst', 'Pad clouds', 'Pad shimmer', 'Lead line', 'Arp dots', 'Vox glow', 'Chord fog', 'Strings', 'Riser', 'Impact', 'Grain', 'Vignette', 'Dust', 'Stars', 'Haze', 'Light leaks', 'Strobe', 'Tunnel', 'Lyrics bed', 'Big mixer'];
  const n0 = D().layers().layers.length;
  for (let i = 0; i < NAMES.length; i += 1) await D().addLayer({ name: NAMES[i], code: LAYER(i, NAMES[i] === 'Big mixer' ? 30 : 0), position: n0 + i }, 0.2);
  const ids = () => ThreeLab.search.layers().map((L) => L.id);
  const idOf = (name) => ThreeLab.search.layers().find((L) => L.name === name)?.id;
  await until(() => ids().length >= 30, 30000);
  if (typeof LabGroups === 'undefined' && window.Lazy) await Lazy.load('groups').catch(() => {});
  try { LabGroups.groupPicked({ name: 'Drums', ids: ['Kick rings', 'Snare flash', 'Hat sparks', 'Clap burst'].map(idOf) }); LabGroups.groupPicked({ name: 'Pads', ids: ['Pad clouds', 'Pad shimmer', 'Chord fog', 'Strings'].map(idOf) }); } catch (err) { out.groupError = String(err); }
  await until(() => hk.ctlOf(idOf('Big mixer'))?.controls().some((c) => c.key === 'x0' && c.live === true), 30000);
  step('30 layers with their sliders, 2 groups (the realistic scene)', ids().length >= 30, { layers: ids().length });

  const merged = () => document.querySelector('.lk-merged');
  const panelEl = () => document.querySelector('.tw-column');
  const rowOf = (id) => panelEl()?.querySelector(`.ly-row[data-id="${CSS.escape(id)}"]`);
  const selectRow = async (id) => { const r = rowOf(id); r?.scrollIntoView({ block: 'nearest' }); await settle(); return r; };
  const lw = async () => (await smoke({ loadwait: 'snap' }).catch(() => null))?.snap || null;
  // load-aware: the series' p50 against its budget, with the box's wait over the series shared out per op
  const judged = async (snap, n, p50, budget) => {
    const r = snap ? await smoke({ loadwait: 1, since: snap }).catch(() => null) : null; const w = r?.waited;
    const per = w ? (w.cpuWait + w.ioFull) / Math.max(1, n) : 0;
    return { verdict: !(p50 > budget) ? 'ok' : (p50 - per <= budget ? 'load' : 'over'), waitPerOp: r1(per), loadavg: r?.loadavg?.[0] != null ? r1(r.loadavg[0]) : null };
  };
  const longTasks = []; try { new PerformanceObserver((l) => longTasks.push(...l.getEntries().map((e) => ({ at: e.startTime, ms: e.duration })))).observe({ type: 'longtask' }); } catch { /* none */ }
  const tasksIn = (a, b) => longTasks.filter((t) => t.at >= a && t.at < b);

  // ---------- 5. timings (before / after) ----------
  ThreeLab.search.selectLayer(idOf('Haze'));
  await settle(400);
  // select: click a row, then the style and layout it caused (forced here so they are counted with it)
  {
    const pick = ['Kick rings', 'Bass wave', 'Lead line', 'Grain', 'Stars', 'Tunnel', 'Riser', 'Vox glow', 'Dust', 'Strobe', 'Sub pulse', 'Impact'];
    const snap = await lw(); const ms = []; const t0 = performance.now();
    for (const n of pick) { const r = await selectRow(idOf(n)); if (!r) continue; const a = performance.now(); r.click(); void document.body.offsetHeight; ms.push(performance.now() - a); await settle(80); }
    const j = await judged(snap, ms.length, pct(ms, 0.5), 16);
    out.numbers.select = { p50: pct(ms, 0.5), max: r1(Math.max(...ms)), n: ms.length, longTasks: tasksIn(t0, performance.now()).length, ...j };
  }
  // a knob drag: real mouse input; each pointermove's handlers timed (window capture → window bubble), messages to the
  // preview counted in the preview page, frames here counted
  const dragKnob = async (moves = 60) => {
    await settle(200);
    const knob = [...panelEl().querySelectorAll('.tweaks .tw-knob')].find((k) => k.getClientRects().length && k.getBoundingClientRect().top > 0 && k.getBoundingClientRect().bottom < innerHeight);
    if (!knob) return null;
    const kr = knob.getBoundingClientRect(); const x = kr.left + kr.width / 2; let y = kr.top + kr.height / 2;
    await RS.pv("window.__p142 = window.__p142 || { n: 0 }; if (!window.__p142on) { window.__p142on = 1; addEventListener('message', (e) => { if (e.data && (e.data.type === 'tweak' || e.data.type === 'tweaks')) window.__p142.n += 1; }); } window.__p142.n = 0; return 1");
    const per = []; let a = 0;
    const cap = (e) => { if (e.type === 'pointermove') a = performance.now(); };
    const bub = (e) => { if (e.type === 'pointermove' && a) { per.push(performance.now() - a); a = 0; } };
    addEventListener('pointermove', cap, true); addEventListener('pointermove', bub, false);
    let frames = 0; let on = true; const fr = () => { if (!on) return; frames += 1; requestAnimationFrame(fr); }; requestAnimationFrame(fr);
    const undo0 = hk.ctl()?.undoDepth;
    await mouse('mousePressed', x, y);
    for (let k = 0; k < moves; k += 1) { y -= 1.5; await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1 }); await wait(14); }
    await mouse('mouseReleased', x, y);
    await settle(200);
    on = false; removeEventListener('pointermove', cap, true); removeEventListener('pointermove', bub, false);
    const msgs = await RS.pv('return window.__p142.n');
    return { per, frames, msgs, undoSteps: (hk.ctl()?.undoDepth ?? 0) - (undo0 ?? 0) };
  };
  ThreeLab.search.selectLayer(idOf('Big mixer'));
  await settle(400);
  {
    const snap = await lw();
    const d = await dragKnob(60);
    if (d) {
      const j = await judged(snap, d.per.length, pct(d.per, 0.5), 4);
      out.numbers.knob = { inputs: d.per.length, p50: pct(d.per, 0.5), p95: pct(d.per, 0.95), max: r1(Math.max(...d.per)), msgsToPreview: d.msgs, framesHere: d.frames, msgsPerFrame: r1(d.msgs / Math.max(1, d.frames)), undoSteps: d.undoSteps, ...j };
    } else out.numbers.knob = { error: 'no knob on screen' };
  }
  // forced layouts per input: the same drag under a timeline trace (forced style / layout inside an input handler)
  {
    let traced = false; try { await smoke({ trace: 'start', detail: true }); traced = true; } catch { /* none */ }
    performance.mark('hz240:knob');
    const d = await dragKnob(30);
    performance.mark('hz240:end');
    if (traced) {
      const t = await smoke({ trace: 'stop', detail: { budget: 4 } }).catch(() => null);
      const s = t?.detail?.segments?.knob;
      out.numbers.knobTrace = s ? { inputs: d?.per.length, forcedInInput: s.forced.inInputJs, forced: s.forced.n, forcedTop: s.forced.top, longestCpu: s.longestCpu, files: s.filesCpu } : { error: 'no trace' };
    }
  }
  // open / fold: the merged panel opens and folds a layer in place; before, the ⚡ Sliders button showed / hid the column
  {
    const snap = await lw(); const ms = [];
    for (let k = 0; k < 6; k += 1) {
      const toggle = merged() ? rowOf(idOf('Big mixer'))?.querySelector('.ly-exp') : document.querySelector('[data-feature="Layers & sliders"]');
      if (!toggle) break;
      const a = performance.now(); toggle.click(); void document.body.offsetHeight; ms.push(performance.now() - a); await settle(80);
    }
    const j = await judged(snap, ms.length, pct(ms, 0.5), 16);
    out.numbers.openFold = { how: merged() ? 'a layer folded / opened in place' : 'the ⚡ Sliders column hidden / shown', p50: pct(ms, 0.5), max: ms.length ? r1(Math.max(...ms)) : null, n: ms.length, ...j };
  }
  // scroll: the wheel over the panel (merged: the one list, with the selected layer and 2 more open; before: the Sliders
  // box of the 40-slider layer); long tasks and the longest gap between two frames here
  {
    if (merged()) { for (const n of ['Kick rings', 'Pad clouds']) panelEl().querySelector(`.ly-row[data-id="${CSS.escape(idOf(n))}"] .ly-pin`)?.click(); }
    ThreeLab.search.selectLayer(idOf('Big mixer'));
    await settle(400);
    const sc = merged() ? merged().querySelector('.ly-list') : [...document.querySelectorAll('.tweaks .tw-body')].find((b) => b.getClientRects().length);
    if (sc) {
      sc.scrollTop = 0; await settle(100);
      const r = sc.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + Math.min(r.height / 2, 200);
      const snap = await lw();
      let last = performance.now(); let gap = 0; let on = true; const fr = (t) => { if (!on) return; gap = Math.max(gap, t - last); last = t; requestAnimationFrame(fr); }; requestAnimationFrame((t) => { last = t; requestAnimationFrame(fr); });
      const t0 = performance.now();
      for (let k = 0; k < 40; k += 1) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY: k < 20 ? 120 : -120 }); await wait(16); }
      await settle(150); on = false;
      const lt = tasksIn(t0, performance.now());
      const j = await judged(snap, 1, lt.length ? Math.max(...lt.map((t) => t.ms)) : 0, 50);
      out.numbers.scroll = { scrollHeight: sc.scrollHeight, longTasks: lt.length, longestTask: lt.length ? r1(Math.max(...lt.map((t) => t.ms))) : 0, longestFrameGap: r1(gap), ...j };
    } else out.numbers.scroll = { error: 'no scroller' };
  }
  // a reply landing while the panel is open: a director edit of another layer's code (as a chat's reply does); the
  // panel's rows added / removed in that time (a whole rebuild replaces every row) and the long tasks
  {
    const list = panelEl().querySelector('.ly-list');
    let added = 0; let removed = 0; const which = new Set();
    const mo = new MutationObserver((ms) => { for (const m of ms) { added += [...m.addedNodes].filter((n) => n.classList?.contains('ly-row')).length; for (const n of m.addedNodes) if (n.classList?.contains('ly-row')) which.add(n.querySelector('.ly-name')?.textContent); removed += [...m.removedNodes].filter((n) => n.classList?.contains('ly-row')).length; } });
    mo.observe(list, { childList: true, subtree: true });
    const snap = await lw(); const t0 = performance.now();
    const code = LAYER(7).replace("value: 0.5, min: 0, max: 1, label: 'Amount'", "value: 0.7, min: 0, max: 1, label: 'Amount'");
    await D().updateLayer(idOf('Lead line'), { code }, 1);
    await D().updateLayer(idOf('Grain'), { opacity: 0.8 }, 0.3);
    await settle(300);
    mo.disconnect();
    const lt = tasksIn(t0, performance.now());
    const j = await judged(snap, 1, lt.length ? Math.max(...lt.map((t) => t.ms)) : 0, 50);
    out.numbers.reply = { rowsAdded: added, rowsRemoved: removed, rowsInList: list.querySelectorAll('.ly-row').length, rebuilt: [...which].slice(0, 8), longTasks: lt.length, longestTask: lt.length ? r1(Math.max(...lt.map((t) => t.ms))) : 0, ...j };
  }
  const N = out.numbers;
  const mergedNow = Boolean(merged());
  if (mergedNow) {
    step('timing: a click selects a layer in under 16 ms (p50, load-aware)', N.select?.verdict !== 'over', N.select);
    step('timing: a knob input costs under 4 ms of main-thread time (p50, load-aware), with no forced layout per input', N.knob?.verdict !== 'over' && N.knobTrace?.forcedInInput === 0, { knob: N.knob, trace: N.knobTrace });
    step('timing: the knob\'s moves reach the preview at most once a frame (batched)', N.knob?.msgsPerFrame != null && N.knob.msgsPerFrame <= 1.2, { msgs: N.knob?.msgsToPreview, frames: N.knob?.framesHere });
    step('timing: a layer opens / folds in place in under 16 ms (p50, load-aware)', N.openFold?.verdict !== 'over', N.openFold);
    step('timing: scrolling the panel has no long task over 50 ms (load-aware)', N.scroll?.verdict !== 'over', N.scroll);
    step('timing: a reply landing while the panel is open patches rows, it doesn\'t rebuild them all', N.reply && N.reply.rowsAdded < 6 && N.reply.verdict !== 'over', N.reply);
  } else step('timing (before): numbers only', true, N);
  if (ONLY === 'timing') throw Object.assign(new Error('timing only'), { done: true });

  // ---------- 1. one panel: the layers and, under the selected one, its knobs ----------
  if (!mergedNow) throw new Error('the merged Layers & knobs panel is not there');
  const P = () => hk.lkPanel();
  const boxOf = (id) => panelEl().querySelector(`.ly-knobs[data-for="${CSS.escape(id)}"]`);
  const openIds = () => [...panelEl().querySelectorAll('.ly-knobs')].map((b) => b.dataset.for);
  const nameOf = (id) => ThreeLab.search.layers().find((L) => L.id === id)?.name;
  for (const n of ['Kick rings', 'Pad clouds']) P().pin(idOf(n), false);
  ThreeLab.search.selectLayer(idOf('Bass wave'));
  await settle(300);
  {
    const col = panelEl(); const box = boxOf(idOf('Bass wave'));
    const sections = [...col.querySelectorAll('.lk-secs > details.lk-sec')];
    const head = col.querySelector('.layers > .tw-head b')?.textContent;
    step('ONE panel: the layers\' list, and right under the selected layer\'s row its knobs (no separate Sliders box)',
      head === 'Layers & knobs' && !col.querySelector(':scope > .tw-slot, :scope > .tweaks') && box && box.previousElementSibling === rowOf(idOf('Bass wave')) && box.querySelector('.tweaks .tw-knob, .tweaks input[type=range]') && openIds().length === 1,
      { head, open: openIds().map(nameOf), knobs: box?.querySelectorAll('.tw-knob-cell, .tw-row').length });
    step('★ Favourites and 🎛 Dials: two folded sections at the top', sections.length === 2 && sections.every((d) => !d.open) && /Favourites/.test(sections[0].textContent) && /Dials/.test(sections[1].textContent) && col.querySelector('.lk-secs').compareDocumentPosition(col.querySelector('.ly-list')) & Node.DOCUMENT_POSITION_FOLLOWING, sections.map((d) => d.textContent));
    // the ways in: ★ in the knobs' head, the Sliders ⋯ › 🎛 Dials…, Ctrl/⌘+K's rows, 🔎 Lab search's reveal, /
    box.querySelector('.tw-favs')?.click();
    const fv = await until(() => col.querySelector('.lk-favs[open] .fv-pop'), 15000);
    LabFavs.close(); await settle(100);
    if (typeof LabDials === 'undefined') await Lazy.load('dials');
    await LabDials.open();
    const md = await until(() => col.querySelector('.lk-dials[open] .md-pop'), 8000);
    LabDials.close(); await settle(100);
    const pickedId = idOf('Stars');
    ThreeLab.search.revealSlider(pickedId, 'Glow');
    await settle(300);
    const rv = hk.layer()?.id === pickedId && boxOf(pickedId)?.getBoundingClientRect().height > 0;
    hk.lkPanel().open(pickedId, false); await settle(100);
    hk.lkOpen(); // (what a picture click's "open its sliders", / and the searches call)
    await settle(200);
    step('every way in opens this panel at the right place: ★ → its section, 🎛 Dials → its section, a found slider → its layer open (also when folded)', Boolean(fv) && Boolean(md) && rv && Boolean(boxOf(pickedId)), { favs: Boolean(fv), dials: Boolean(md), reveal: rv, reopened: Boolean(boxOf(pickedId)), favsAfterClose: col.querySelector('.lk-favs')?.open });
  }

  // ---------- 2. expand / collapse in place; pin ----------
  {
    const a = idOf('Grain'); const b = idOf('Tunnel');
    ThreeLab.search.selectLayer(a); await settle(200);
    const onlySel = openIds().length === 1 && openIds()[0] === a;
    rowOf(a).querySelector('.ly-exp').click(); await settle(100);
    const folded = !boxOf(a) && rowOf(a).querySelector('.ly-exp').textContent === '▸';
    rowOf(a).querySelector('.ly-exp').click(); await settle(100);
    const reopened = Boolean(boxOf(a));
    rowOf(a).querySelector('.ly-pin').click(); await settle(100);
    rowOf(b).querySelector('.ly-exp').click(); await settle(250);
    const both = hk.layer()?.id === b && Boolean(boxOf(a)) && Boolean(boxOf(b)) && boxOf(a).querySelector('.tweaks .tw-knob-cell, .tweaks .tw-row') && boxOf(b).querySelector('.tw-slot .tweaks');
    rowOf(a).querySelector('.ly-pin').click(); await settle(100);
    step('only the selected layer is open; ▾ folds it and ▸ opens it in place; 📌 keeps a layer\'s knobs open while another is selected', onlySel && folded && reopened && both && !boxOf(a), { onlySel, folded, reopened, both: Boolean(both), afterUnpin: openIds().map(nameOf) });
  }

  // ---------- 3. groups, rename in place, find, solo, Alt+↑ ----------
  {
    const head = [...panelEl().querySelectorAll('.ly-row.ly-group')].find((r) => /Drums/.test(r.textContent));
    head?.querySelector('.ly-caret')?.click(); await settle(150);
    const foldedOut = !rowOf(idOf('Kick rings'));
    [...panelEl().querySelectorAll('.ly-row.ly-group')].find((r) => /Drums/.test(r.textContent))?.querySelector('.ly-caret')?.click(); await settle(150);
    const back = Boolean(rowOf(idOf('Kick rings')));
    // rename in place
    const rid = idOf('Riser');
    rowOf(rid).querySelector('.ly-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const inp = await until(() => rowOf(rid)?.querySelector('.ly-rename'), 2000);
    if (inp) { inp.value = 'Riser up'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    await settle(150);
    const renamed = nameOf(rid) === 'Riser up' && rowOf(rid)?.querySelector('.ly-name')?.textContent === 'Riser up';
    window.LabDirect?.undo?.(); await settle(200);
    const unRenamed = nameOf(rid) === 'Riser';
    // find
    P().find('pad'); await settle(150);
    const shownRows = [...panelEl().querySelectorAll('.ly-row[data-id]')].map((r) => nameOf(r.dataset.id));
    P().find(null); await settle(150);
    const all = panelEl().querySelectorAll('.ly-row[data-id]').length;
    // solo
    const sid = idOf('Tunnel');
    rowOf(sid).querySelector('.ly-solo').click(); await settle(200);
    const soloed = ThreeLab.search.layers().filter((L) => L.visible).map((L) => L.name);
    rowOf(sid).querySelector('.ly-solo').click(); await settle(200);
    const unsolo = ThreeLab.search.layers().filter((L) => L.visible).length;
    // Alt+↑: a real click on the row, then the key
    const hid = idOf('Haze'); const where = () => JSON.stringify(ThreeLab.groupsHost.layers().map((L) => [L.id, L.group?.id || ''])); const before = where();
    (await selectRow(hid)); const hr = rowOf(hid).getBoundingClientRect();
    await mouse('mousePressed', hr.left + 60, hr.top + hr.height / 2); await mouse('mouseReleased', hr.left + 60, hr.top + hr.height / 2);
    await settle(150);
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 1, key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 1, key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    await wait(500);
    const moved = where() !== before; // (a step past its neighbour, or into the group next to it)
    window.LabDirect?.undo?.(); await wait(500);
    step('groups fold and unfold, a name changes in place (one Undo), 🔍 find keeps the matching layers, S solos and back, Alt+↑ moves a layer (one Undo)',
      foldedOut && back && renamed && unRenamed && shownRows.length >= 3 && shownRows.every((n) => /Pad|Chord|Strings/.test(n) || /pad/i.test(n)) && all >= 30 && soloed.length === 1 && soloed[0] === 'Tunnel' && unsolo >= 29 && moved && where() === before,
      { foldedOut, back, renamed, unRenamed, find: shownRows, all, soloed, unsolo, moved, back2: where() === before });
  }

  // ---------- 4. a slider row keeps 🔒, ♪ / 〰, ◆ and its right-click; a knob drag is one Undo ----------
  {
    const lid = idOf('Big mixer');
    ThreeLab.search.selectLayer(lid); await settle(300);
    const box = boxOf(lid);
    const cell = [...box.querySelectorAll('.tw-knob-cell, .tw-row')].find((r) => /Glow/.test(r.querySelector('.tw-name, .tw-ktop')?.textContent || ''));
    let items = [];
    if (cell) {
      const r = cell.getBoundingClientRect();
      cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
      await until(() => document.querySelector('.mb-menu .menu-item'), 3000);
      items = [...document.querySelectorAll('.mb-menu .menu-item')].map((x) => x.textContent);
      [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => /Lock at this value/.test(x.textContent))?.click();
      await settle(150);
    }
    const locked = hk.ctlOf(lid).locked('glow');
    hk.ctlOf(lid).lock('glow', false);
    const has = (re) => items.some((t) => re.test(t));
    step('a knob keeps its right-click: 🔒 Lock, ♪ / 🎚 follow the music, ◆ Keyframe, ★ Pin; Lock works from here', has(/Lock at this value/) && has(/Move with the music|Follow the music|React to a sound/) && has(/Keyframe at the playhead/) && has(/Pin to favourites/) && locked, { items, locked });
    step('a knob drag in the panel is ONE undo step on release', N.knob?.undoSteps === 1, { undoSteps: N.knob?.undoSteps });
  }
} catch (err) {
  if (!err?.done) step(`no error: ${err?.message || err}`, false, String(err?.stack || '').split('\n').slice(0, 4).join(' | '));
}
await RS.close();
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
