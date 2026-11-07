// ⚡ "Why is this slow?" (round 133, speed133): the speed fix-it card over the Lab preview (lazy group "speedcheck";
// its ways in are tools/three-speed-hook.js). It measures for 3 s on this computer, with no AI:
//   · per layer: its GPU time a frame (the frame with that layer left out for a moment, see tools/three-sandbox.html
//     "speed check"), draw calls, triangles, shaders (and the longest one), textures and offscreen passes;
//   · the preview's antialias, pixel ratio, shadow lights and filters.
// It names the top 3 causes in plain words, each with a one-click fix and the gain to expect ("Preview at 1× pixels
// (+40 fps, renders unaffected)"). Every fix is one undo step (its own ↶, the card's ↶ Undo, the toast's Undo); after a
// fix it measures again and shows the new fps. Preview-only fixes are the scene's preview settings (sketch.speed:
// ThreeLab.speed), which an export page or ▶ Play never reads: renders keep full quality (as 32f499f).
// ✦ Ask the AI to optimise 'Layer': only on a click, the cost shown first, the measured numbers sent to the director.
// The graphics card dropping the preview (glrecover): "Reopen in safe mode" (1× pixels, no antialias, no shadows).
//   LabSpeed.open() · measure() · fix(id) · undo() · safe() · aiOpen(layerId) · aiSend() · state() · close()
const LabSpeed = (() => {
  const C = () => SpeedCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', raw: e });
  const S = { hist: new Map(), card: null, busy: false, analysis: null, raw: null, undos: [], done: new Map(), scene: null, gl: null, ai: null, sent: [], measures: 0, showLayers: false };
  const sp = () => ThreeLab.speed;

  async function lab() {
    const cmd = await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !(ThreeLab.director && ThreeLab.speed); i += 1) await sleep(100);
    if (!ThreeLab.speed) throw new Error('The Lab is not ready yet.');
    if (S.scene !== sp().sceneId()) { S.scene = sp().sceneId(); S.undos = []; S.done.clear(); S.analysis = null; S.ai = null; S.hist.clear(); }
    return { d: ThreeLab.director, cmd };
  }
  const slidersOf = (id) => { try { return ThreeLab.director.sliders(id).sliders || []; } catch { return []; } };
  // the preview drawing again after a fresh page (an antialias change, safe mode): its first stats
  async function settled(cmd, ms = 25000) {
    const t0 = Date.now();
    await sleep(400);
    while (Date.now() - t0 < ms) { let p = null; try { p = cmd.perf(); } catch { p = null; } if (p?.fps > 0 && !p.parked) return true; await sleep(250); }
    return false;
  }

  // ---------- measuring ----------
  // toggle: how many of the heaviest layers are left out in turn (0 after a fix: the frames only; each layer's cost is
  // then the median kept from this scene's measures)
  async function measure(ms = 3000, toggle = 3) {
    const { cmd } = await lab();
    if (S.busy) throw new Error('Already measuring.');
    S.busy = true; paint();
    try {
      await settled(cmd);
      const res = await sp().measure(ms, toggle);
      S.raw = res; S.measures += 1;
      // each layer's GPU time: the median of this scene's last 3 measures (one measure on a busy computer jitters)
      if (res?.ok) for (const L of res.layers || []) { if (L.gpuMs == null) { const k = S.hist.get(L.id); if (k?.length) L.gpuMs = k.slice().sort((a, b) => a - b)[Math.floor(k.length / 2)]; continue; } const h = [...(S.hist.get(L.id) || []), L.gpuMs].slice(-3); S.hist.set(L.id, h); L.gpuMs = h.slice().sort((a, b) => a - b)[Math.floor(h.length / 2)]; }
      S.analysis = C().analyse(res, { nameOf: (id) => sp().name(id), sliders: slidersOf, set: sp().get() });
      return S.analysis;
    } finally { S.busy = false; paint(); }
  }

  // ---------- the fixes (each one undo step) ----------
  async function apply(c) {
    const f = c.fix;
    if (f.kind === 'set') {
      const before = sp().get();
      sp().set(f.set);
      return async () => { sp().set(before); };
    }
    if (f.kind === 'slider') {
      ThreeLab.director.sliders(f.layer, { [f.key]: f.to });
      S.hist.delete(f.layer); // (that layer's cost changed: measured afresh)
      return async () => { S.hist.delete(f.layer); try { ThreeLab.director.sliders(f.layer, { [f.key]: f.from }); } catch { /* the layer went away */ } };
    }
    return null;
  }
  async function fix(id) {
    const c = (S.analysis?.all || []).find((x) => x.id === id);
    if (!c) throw new Error('Measure first.');
    if (c.fix.kind === 'ai') return aiOpen(c.fix.layer);
    if (S.done.has(id)) return false;
    const { cmd } = await lab();
    const was = S.analysis.fps;
    const abDone = window.LabAB?.hold?.('speed', { label: `⚡ ${c.fix.label}` }); // ◧ Before / after: one change
    let undo;
    try { undo = await apply(c); } finally { abDone?.(); }
    if (!undo) return false;
    const entry = { id, label: c.fix.label, title: c.title, preview: c.preview, undo, was, now: null, layer: c.fix.kind === 'slider' ? c.fix.layer : null };
    S.undos.push(entry); S.done.set(id, entry);
    paint();
    toast(`⚡ ${c.fix.label}`, { timeout: 5000, action: { label: 'Undo', fn: () => undo1(entry).catch(err) } });
    await settled(cmd);
    const keep = S.analysis;
    try { const a = await measure(3000, c.fix.kind === 'slider' ? 1 : 0); entry.now = a.ok ? a.fps : null; } catch { S.analysis = keep; }
    paint();
    return entry;
  }
  async function undo1(entry) {
    const i = S.undos.indexOf(entry);
    if (i < 0) return false;
    S.undos.splice(i, 1);
    await entry.undo();
    S.done.delete(entry.id);
    paint();
    const { cmd } = await lab();
    await settled(cmd);
    await measure(3000, entry.layer ? 1 : 0).catch(() => null);
    return true;
  }
  async function undo() {
    const e = S.undos[S.undos.length - 1];
    if (!e) { toast('Nothing to undo.', { timeout: 1500 }); return false; }
    await undo1(e);
    toast(`↶ ${e.label}: undone`, { timeout: 1800 });
    return true;
  }
  // safe mode: 1× pixels, no antialias, no shadows (one undo step); the scene runs again on a fresh page
  async function safe() {
    await lab();
    const before = sp().get();
    const reload = Boolean(before.noAA);
    sp().set({ ...C().SAFE });
    if (reload) sp().reopen();
    const entry = { id: 'safe', label: 'Safe mode', title: 'Reopened in safe mode', preview: true, undo: async () => { sp().set(before); }, was: S.analysis?.fps ?? null, now: null };
    S.undos.push(entry); S.done.set('safe', entry); S.gl = null;
    if (typeof LabSpeedHook !== 'undefined') LabSpeedHook.hideChip();
    paint();
    toast('⚡ Safe mode: 1× pixels, no antialias, no shadows in the preview (renders keep full quality)', { timeout: 6000, action: { label: 'Undo', fn: () => undo1(entry).catch(err) } });
    return entry;
  }
  function glLost(g) { S.gl = g; paint(); }

  // ---------- ✦ the AI (only on a click, the cost shown first) ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function director() {
    if (directorOf()) return directorOf();
    await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'speedcheck', say: () => {}, note: () => {} });
    for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
    return directorOf();
  }
  async function aiOpen(layerId) {
    const a = S.analysis; if (!a?.ok) throw new Error('Measure first.');
    const L = a.layers.find((x) => x.id === layerId) || a.layers.find((x) => !x.fx);
    if (!L) throw new Error('No layer to optimise.');
    const text = C().ask(L, a);
    S.ai = { layer: L.id, name: L.name, text, line: 'Working out the cost…', est: null };
    paint();
    const dir = directorOf();
    let base = 9000;
    try { if (dir) { const r = await window.hub.directorCost?.([{ ...JSON.parse(JSON.stringify(dir)), threeTools: true, exact: true }]); base = r?.directors?.[0]?.total || base; } } catch { /* the usual size */ }
    const est = C().estimate(base, text.length);
    if (S.ai?.layer === L.id) { S.ai.est = est; S.ai.line = C().costLine(est, dir?.name || 'the Three Director'); }
    paint();
    return S.ai;
  }
  async function aiSend() {
    const q = S.ai; if (!q) throw new Error('Pick a layer first.');
    const dir = await director();
    if (!dir) throw new Error('No Three Director: make one from the toolbar\'s ⋯ › Director.');
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    const chat = H.activeChat?.[dir.id];
    if (chat && Native.isBusy?.(chat)) throw new Error(`${dir.name} is still answering: wait for it, or stop it first.`);
    S.sent.push({ agentId: dir.id, text: q.text, at: Date.now() });
    S.ai = null; paint();
    await Native.send(dir.id, q.text);
    toast(`Sent to ${dir.name} with the measured numbers: its change is one undo step`, { timeout: 4500 });
    return true;
  }

  // ---------- the card ----------
  const btn = (text, cls, fn, title) => el('button', { type: 'button', class: `lm-btn ${cls || ''}`, text, title: title || '', on: { click: (e) => { e.stopPropagation(); Promise.resolve().then(fn).catch((x) => { err(x); paint(); }); } } });
  function paint() {
    const c = S.card; if (!c?.isConnected) return;
    const a = S.analysis; const set = sp()?.get?.() || {};
    const head = el('div', { class: 'lm-head spd-head' },
      el('b', { text: '⚡ Why is this slow?' }),
      el('span', { class: 'spd-fps', text: S.busy ? 'Measuring 3 s…' : a?.ok ? `${Math.round(a.fps)} fps here · ${a.frameMs} ms a frame` : '' }),
      btn('✕', 'lm-x', close, 'Close'));
    const body = [];
    if (S.gl) body.push(el('div', { class: 'spd-row spd-gl' }, el('div', { class: 'spd-t', text: 'The graphics card dropped the preview.' }), el('div', { class: 'spd-acts' }, btn('Reopen in safe mode', 'spd-fix spd-safe', safe, 'Run it again at 1× pixels, without antialias or shadows, in the preview only (one undo step)'), el('span', { class: 'spd-gain', text: '1× pixels, no antialias, no shadows' }))));
    if (a && !a.ok) body.push(el('div', { class: 'spd-row' }, el('div', { class: 'spd-t', text: a.error })));
    // (round 142, smooth142) the preview's quality now: Smooth's automatic level and why, Balanced, or Force high
    const q = sp()?.quality?.();
    if (q) {
      const qn = { smooth: 'Smooth (auto)', balanced: 'Balanced', high: 'Force high quality' }[q.held ? 'high' : q.mode] || q.mode;
      const lvl = q.adapt && !q.held && q.mode !== 'high' ? `level ${q.adapt.level || 0} of 9` : '';
      body.push(el('div', { class: 'spd-sub spd-quality', text: `Quality: ${qn}${q.own ? ' (this scene)' : ''}${lvl ? ` · ${lvl}` : ''}${q.why ? ` · ${q.why}` : q.mode === 'high' || q.held ? ' · full resolution, antialias and shadows' : ' · full quality now'}` }));
    }
    if (a?.ok) {
      const list = a.causes.slice();
      for (const [id, e] of S.done) if (!list.some((x) => x.id === id)) list.push({ id, title: e.title, fix: { label: e.label }, gainLine: '', done: true });
      if (!list.length) body.push(el('div', { class: 'spd-ok', text: 'Nothing heavy stands out: every layer is light, at 1× pixels, without extra shadows.' }));
      list.forEach((x, i) => {
        const e = S.done.get(x.id);
        const row = el('div', { class: `spd-row spd-${x.kind || 'done'}${e ? ' fixed' : ''}`, attrs: { 'data-id': x.id } },
          el('div', { class: 'spd-t' }, el('b', { text: `${i + 1}. ${x.title}` }), x.why ? el('span', { class: 'spd-why', text: ` ${x.why}` }) : null),
          el('div', { class: 'spd-acts' },
            e ? el('span', { class: 'spd-done', text: `✓ ${e.label}${e.now != null ? ` · now ${Math.round(e.now)} fps (was ${Math.round(e.was)})` : ' · measuring…'}` }) : btn(x.fix.label, 'spd-fix', () => fix(x.id), x.fix.kind === 'ai' ? 'Shows the cost first; nothing is sent until you click Send' : x.preview ? 'For the preview only: renders keep full quality. One undo step.' : 'Changes the scene (renders too). One undo step.'),
            e ? btn('↶', 'spd-undo1', () => undo1(e), 'Undo this fix') : el('span', { class: 'spd-gain', text: `(${x.gainLine})` })));
        body.push(row);
      });
      // the layers, folded
      const tog = btn(`${S.showLayers ? '▾' : '▸'} Each layer (${a.layers.length})`, 'spd-tog', () => { S.showLayers = !S.showLayers; paint(); }, 'GPU time, draw calls, triangles, shaders, textures, offscreen passes');
      body.push(tog);
      if (S.showLayers) {
        const t = el('div', { class: 'spd-table' }, el('div', { class: 'spd-tr spd-th' }, ...['Layer', 'GPU', 'calls', 'tris', 'shaders', 'tex', 'passes'].map((h) => el('span', { text: h }))));
        for (const L of a.layers.slice(0, 8)) t.append(el('div', { class: 'spd-tr', attrs: { 'data-layer': L.id } }, el('span', { text: L.name }), el('span', { text: `${L.gpuMs != null ? '' : '~'}${C().ms1(L.cost)} ms` }), el('span', { text: C().big(L.calls) }), el('span', { text: C().big(L.tris) }), el('span', { text: `${L.progs}${L.frag ? ` · ${L.frag} ln` : ''}` }), el('span', { text: L.texMB ? `${Math.round(L.texMB)} MB` : '–' }), el('span', { text: L.rt ? String(L.rt) : '–' })));
        const L0 = a.layers[0];
        t.append(el('div', { class: 'spd-sub', text: `Preview: ${a.layers.some((L) => L.aa) ? 'antialias on' : 'no antialias'} · ${+(Math.max(1, ...a.layers.map((L) => L.pr || 1))).toFixed(2)}× pixels · ${a.layers.reduce((n, L) => n + L.shadowLights, 0)} shadow lights · ${a.layers.filter((L) => L.fx).length} filters${set.px1 || set.noAA || set.sh != null || set.fxHalf ? ' · preview settings on' : ''}${L0 ? '' : ''}` }));
        body.push(t);
      }
      const heavy = a.layers.find((L) => !L.fx);
      if (heavy && !S.ai) body.push(el('div', { class: 'spd-ai' }, btn(`✦ Ask the AI to optimise '${heavy.name}'`, 'spd-ask', () => aiOpen(heavy.id), 'Shows the cost first; the measured numbers go to the Three Director only when you click Send')));
    }
    if (S.ai) {
      body.push(el('div', { class: 'spd-row spd-aibox' },
        el('div', { class: 'spd-t', text: S.ai.text }),
        el('div', { class: 'spd-cost', text: S.ai.line }),
        el('div', { class: 'spd-acts' }, btn('Send', 'spd-fix spd-send', aiSend, 'Send this to the Three Director'), btn('Cancel', 'spd-cancel', () => { S.ai = null; paint(); }))));
    }
    const foot = el('div', { class: 'lm-acts spd-foot' },
      btn('Measure again', 'spd-again', () => measure(), 'Another 3 s on this computer'),
      S.undos.length ? btn('↶ Undo', 'spd-undo', undo, 'Undo the last fix (one step)') : null,
      Object.values(set).some((v) => v != null && v !== false) ? el('span', { class: 'spd-note', text: 'Preview settings are this scene\'s; renders stay full quality.' }) : null);
    c.classList.toggle('busy', S.busy);
    c.replaceChildren(head, el('div', { class: 'spd-body' }, ...body), foot);
  }
  async function open() {
    await lab();
    if (!S.card) {
      S.card = el('div', { class: 'spd-card', attrs: { role: 'dialog', 'aria-label': 'Why is this slow?' } });
      S.card.addEventListener('contextmenu', (e) => e.stopPropagation());
      S.card.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    }
    if (!S.card.isConnected) sp().host.append(S.card);
    if (typeof LabSpeedHook !== 'undefined') LabSpeedHook.hideChip();
    paint();
    if (!S.busy) await measure().catch((e) => { S.analysis = { ok: false, error: e.message }; paint(); });
    return S.card;
  }
  function close() { S.card?.remove(); S.ai = null; }
  addEventListener('hearth:sketch', () => { if (S.card?.isConnected) close(); });
  const isOpen = () => Boolean(S.card?.isConnected);
  const state = () => ({ open: isOpen(), busy: S.busy, analysis: S.analysis, raw: S.raw, undos: S.undos.map((e) => e.label), done: [...S.done.values()].map((e) => ({ id: e.id, label: e.label, was: e.was, now: e.now })), gl: S.gl, ai: S.ai ? { layer: S.ai.layer, text: S.ai.text, line: S.ai.line, est: S.ai.est } : null, sent: S.sent.slice(), measures: S.measures, set: sp()?.get?.() || null });
  return { open, close, measure, fix, undo, safe, glLost, aiOpen, aiSend, state, isOpen, get card() { return S.card; } };
})();
