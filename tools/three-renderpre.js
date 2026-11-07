// One-click render presets (round 131, renderpre131): a "Presets" row of chips at the top of the Lab's Render card
// (tools/three-export.js panel() calls attach()). A click on a chip ticks it and fills the card's fields (format,
// size, frame rate, quality) with that preset; the owner can still change them before ⇪ Export. With presets ticked,
// ⇪ Export renders each of them, one after another in the render queue, named "<project> – <preset> – <date>" in
// the project's folder inside the usual renders folder. A file of that name already there: asked first (replace it,
// the old one to the Trash, or keep both). "＋ Save as preset" keeps the card's settings on the project
// (p.prefs.renderPresets, it syncs with the project); the project menu's "Render the main scene…" opens the card on
// the project's last-used preset (p.prefs.renderLast). The model: tools/three-renderpre-core.js.
const LabRenderPre = (() => {
  const C = RenderPreCore;
  const XC = () => LabExportCore;
  const SEQ = () => (typeof ThreeSeq !== 'undefined' ? ThreeSeq : null);
  const player = () => { try { return ThreeLab.stageHooks?.player || SEQ()?._S?.L?.player || null; } catch { return null; } };
  const sketchId = () => { try { return ThreeLab.scenes?.currentId?.() || null; } catch { return null; } };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const S = { tiny: null, last: null, runs: 0, asked: 0 };

  // ---------- the project of the scene on screen ----------
  function projectNow() { try { const id = sketchId(); return (id && window.Projects?.ofItem?.('scene', id)?.[0]) || null; } catch { return null; } }
  const prefs = (p) => (p?.prefs && typeof p.prefs === 'object' ? p.prefs : {});
  // (the same way projmenu.js keeps p.prefs: an ordinary project field, it syncs; written with p.updated)
  function setPrefs(p, patch) {
    p.prefs = { ...prefs(p), ...patch };
    for (const k of Object.keys(p.prefs)) if (p.prefs[k] == null || p.prefs[k] === '') delete p.prefs[k];
    p.updated = Date.now();
    window.Projects?.changed?.(p, 'prefs');
  }
  const savedOf = (p) => C.saved(prefs(p).renderPresets);

  // ---------- what the presets read: the frame, the song, the loop, the encoders ----------
  let prores = null;
  async function hasProres() {
    if (prores != null) return prores;
    try { const l = (await window.hub.renders?.encoders?.({ ffmpeg: H.settings().ffmpegPath || undefined }))?.list || []; prores = l.some((x) => /^prores/.test(x)); } catch { prores = false; }
    return prores;
  }
  function songCtx() {
    const P = player();
    if (!P) return {};
    let grid = null;
    try { const g = P.timeline?.().grid; if (g?.bpm) grid = { bpm: g.bpm, bpb: g.beatsPerBar || 4, anchor: g.downbeat ?? 0 }; } catch { /* no grid */ }
    const song = P.loaded && !P.isClock;
    const an = song && P.analysis ? { ...P.analysis, grid: grid || P.analysis.grid } : null;
    let perfect = null; try { perfect = window.PerfectLoop?.state?.() || null; } catch { /* no loop */ }
    let loopOn = true; try { loopOn = store.get('three.mediaLoop', true) !== false; } catch { /* the default: looping */ } // (round 142, renderrange142) the timeline's ⟲ Loop
    return { analysis: an, duration: song ? P.duration : P.clock?.seconds || 0, playhead: P.time || 0, ab: P.loop || null, grid, perfect, loopOn, song };
  }
  // (round 142, renderrange142) the Lab sequence the scene on screen is in: the one open now (when it has the scene), else
  // the scene's own (▤ Sequence's list: a sequence it owns or starts with); never makes one
  async function seqOf() {
    const Q = SEQ(); const sid = sketchId();
    if (!Q) return null;
    try {
      const e = Q.edit;
      if (e && Q.key && (!sid || e.seq?.scene === sid || (e.clips || []).some((c) => c.sketch === sid) || Q.active)) return { key: Q.key, name: e.seq?.name || String(Q.key).replace(/^seq:/, ''), secs: Q.compile(e).plan.dur || 0 };
      if (!sid) return null;
      const all = await Q.list();
      const by = store.get('three.seq.byScene', {})[sid];
      const x = all.find((s) => s.key === by && s.scene === sid) || all.find((s) => s.scene === sid) || all.find((s) => !s.scene && s.firstScene === sid);
      return x ? { key: x.key, name: x.name || String(x.key).replace(/^seq:/, ''), secs: x.seconds || 0 } : null;
    } catch { return null; }
  }
  async function ctxOf(st, frame) {
    const p = projectNow();
    return { ...songCtx(), frame, fps: Number(prefs(p).fps || p?.workspace?.fps) || null, prores: await hasProres(), source: st.source, seq: await seqOf() };
  }

  // ---------- the row in the card ----------
  // o: { st (the card's state), paint (draws the card again), frame () → { w, h }, preset ('last' or an id to start on) }
  async function attach({ st, paint, frame, preset = null }) {
    const R = { ticked: [], shown: null, filled: {}, ctx: await ctxOf(st, frame()), p: projectNow() };
    const pick = () => ({ format: st.format, size: st.size, custom: st.custom, fps: st.fps, quality: st.quality, ss: st.ss, blur: st.blur });
    const fillOf = (id) => {
      if (!R.filled[id]) {
        const sp = savedOf(R.p).find((x) => x.id === id);
        R.filled[id] = sp ? C.fillSaved(sp, R.ctx) : C.fill(id, R.ctx);
      }
      return R.filled[id];
    };
    const keep = () => { if (R.shown && R.filled[R.shown]) R.filled[R.shown].fields = pick(); };
    const put = (id) => { const f = fillOf(id)?.fields; if (!f) return; Object.assign(st, { format: f.format, size: f.size, custom: f.custom || st.custom, fps: f.fps, quality: f.quality, ss: f.ss || 1, blur: f.blur || 1 }); R.shown = id; };
    function click(id) {
      if (!fillOf(id)) return;
      if (!R.ticked.includes(id)) { keep(); R.ticked.push(id); put(id); } else if (R.shown === id) {
        keep(); R.ticked = R.ticked.filter((x) => x !== id); R.shown = null;
        if (R.ticked.length) put(R.ticked[R.ticked.length - 1]);
      } else { keep(); put(id); }
      paint();
    }
    // the project's last-used preset (the project menu's "Render the main scene…"), or the one asked for
    const start = preset === 'last' ? prefs(R.p).renderLast : preset;
    if (start && (C.get(start) || savedOf(R.p).some((x) => x.id === start))) { R.ticked.push(start); put(start); }

    // ---------- (round 142, renderrange142) What to render: Full song · Loop · Sequence · Custom ----------
    // The card's own choice (R.kind, R.len) renders when no preset is ticked; a preset shown on the chips shows its own
    // pick there (the reel's window, the loop preset's loop) and a click on a chip changes that preset's length.
    const savedRange = () => { const x = prefs(R.p).renderRange; return x && typeof x === 'object' ? x : null; };
    R.custom = (() => { const c = savedRange()?.custom; return Array.isArray(c) && c[1] > c[0] ? { a: c[0], b: c[1] } : null; })();
    R.kind = st.source === 'seq' && R.ctx.seq ? 'seq' : C.firstKind(R.ctx, savedRange());
    R.len = C.lengthFor(R.kind, R.ctx, R.custom) || C.lengthFor('full', R.ctx);
    st.source = R.kind === 'seq' ? 'seq' : 'scene';
    const shownFill = () => (R.shown ? fillOf(R.shown) : null);
    const ctxNow = () => ({ ...R.ctx, source: st.source });
    const kindNow = () => { const f = shownFill(); return f ? C.kindOf(f.length, ctxNow()) : R.kind; };
    const lenNow = () => { const f = shownFill(); return f ? f.length : R.len; };
    function remember() {
      if (!R.p) return;
      const L = C.loopOf(R.ctx);
      const was = savedRange() || {};
      const next = { kind: R.kind, loop: C.loopKey(L), ...(R.custom ? { custom: [R.custom.a, R.custom.b] } : {}) };
      if (was.kind === next.kind && was.loop === next.loop && JSON.stringify(was.custom || null) === JSON.stringify(next.custom || null)) return;
      setPrefs(R.p, { renderRange: next });
    }
    async function choose(kind) {
      if (kind === 'custom') {
        const L = lenNow() || {};
        const a0 = L.range ? L.range.a : L.whole ? 0 : Number(L.at) || 0; const b0 = L.range ? L.range.b : L.whole ? (R.ctx.duration || 10) : a0 + (Number(L.secs) || 10);
        const v = await Modal.prompt('From – to (seconds)', { value: `${a0}-${b0}`, label: 'Where the render starts and ends in the song, e.g. 22.5-45' });
        const m = String(v || '').match(/^\s*(\d+(?:\.\d+)?)\s*[-–to ]+\s*(\d+(?:\.\d+)?)\s*$/);
        if (!m || Number(m[2]) <= Number(m[1])) return;
        R.custom = { a: Number(m[1]), b: Number(m[2]) };
      }
      if (kind === 'seq') { // the scene's sequence, loaded (not shown) so the render has it
        const Q = SEQ();
        try { if (Q && R.ctx.seq && Q.key !== R.ctx.seq.key) await Q.open(R.ctx.seq.key, { show: false }); } catch (err) { toast(`The sequence: ${err.message}`, { type: 'error' }); return; }
      }
      const len = C.lengthFor(kind, R.ctx, R.custom);
      if (!len) return;
      st.source = kind === 'seq' ? 'seq' : 'scene';
      const f = shownFill();
      if (f) { f.length = { ...len }; f.note = len.why; }
      R.kind = kind; R.len = len;
      remember();
      paint();
    }
    function rangeRow() {
      const can = C.offered(R.ctx);
      const k = kindNow(); const len = lenNow(); const f = shownFill();
      const chips = C.RANGES.filter((x) => can.includes(x.id)).map((x) => el('button', { type: 'button', class: `sq-chip rr-chip${k === x.id ? ' on' : ''}`, text: x.label, title: x.tip, attrs: { 'data-range': x.id }, on: { click: () => choose(x.id) } }));
      const line = `${f ? `${f.name} chose · ` : ''}${C.rangeLine(k, len, ctxNow())}`;
      return el('div', { class: 'sq-rp-row rr-row' }, el('b', { text: 'What to render' }), el('div', { class: 'rp-wrap' }, el('div', { class: 'sq-chips' }, chips), el('div', { class: 'rr-line', text: line, title: line })));
    }

    async function editLength() {
      const f = R.shown && fillOf(R.shown); if (!f) return;
      const L = f.length || {};
      const now = L.range ? `${L.range.a}-${L.range.b}` : L.whole ? '' : `${L.at}-${Math.round((L.at + L.secs) * 1000) / 1000}`;
      const v = await Modal.prompt('From – to (seconds)', { value: now, label: `${f.name}: where it starts and ends in the song, e.g. 22.5-45` });
      const m = String(v || '').match(/^\s*(\d+(?:\.\d+)?)\s*[-–to ]+\s*(\d+(?:\.\d+)?)\s*$/);
      if (!m || Number(m[2]) <= Number(m[1])) return;
      f.length = { range: { a: Number(m[1]), b: Number(m[2]) }, why: 'set by hand' };
      paint();
    }
    async function saveAs() {
      if (!R.p) return;
      keep();
      const shown = R.shown && fillOf(R.shown);
      const name = await Modal.prompt('Save as a preset of this project', { value: shown ? `${shown.name} (mine)` : 'My preset', label: `Kept with “${R.p.name}” (it syncs with the project)` });
      if (!name) return;
      const sp = C.makeSaved(name, shown ? (shown.saved ? (savedOf(R.p).find((x) => x.id === shown.id)?.base || 'full') : shown.id) : 'full', pick());
      setPrefs(R.p, { renderPresets: [...savedOf(R.p), sp].slice(-12) });
      R.ticked = R.ticked.filter((x) => x !== R.shown).concat(sp.id); R.filled[sp.id] = C.fillSaved(sp, R.ctx); R.shown = sp.id;
      toast(`Preset “${sp.name}” saved with “${R.p.name}”`, { timeout: 3000 });
      paint();
    }
    function forget(id) {
      if (!R.p) return;
      setPrefs(R.p, { renderPresets: savedOf(R.p).filter((x) => x.id !== id), renderLast: prefs(R.p).renderLast === id ? null : prefs(R.p).renderLast });
      R.ticked = R.ticked.filter((x) => x !== id); delete R.filled[id];
      if (R.shown === id) { R.shown = null; if (R.ticked.length) put(R.ticked[R.ticked.length - 1]); }
      paint();
    }
    function row() {
      const chip = (id, label, title) => {
        const on = R.ticked.includes(id);
        const b = el('button', { type: 'button', class: `sq-chip rp-chip${on ? ' on' : ''}${R.shown === id ? ' rp-shown' : ''}`, text: `${on ? '✓ ' : ''}${label}`, title, attrs: { 'data-preset': id }, on: { click: () => click(id) } });
        if (id.startsWith('my-')) b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); showMenu(ev.clientX, ev.clientY, [{ label: `Remove “${label}” from this project`, action: () => forget(id) }]); });
        return b;
      };
      const chips = [...C.PRESETS.map((x) => chip(x.id, `${x.icon} ${x.name}`, `${x.tip}. Click to tick it and fill the card; tick several to render them in one go.`)),
        ...savedOf(R.p).map((x) => chip(x.id, `★ ${x.name}`, `This project's preset (from ${C.get(x.base)?.name || 'Full song'}). Right-click to remove it.`))];
      const f = R.shown && fillOf(R.shown);
      const lenText = f ? `${f.name}: ${C.lengthText(f.length)}${f.extra?.length ? ` · + ${f.extra.map((x) => `${x.label} ${x.size.w}×${x.size.h}`).join(', ')}` : ''}` : 'Tick a preset to fill the card, or set it up yourself below.';
      const line = el('div', { class: 'rp-line' },
        el('span', { class: 'rp-len', text: lenText, title: lenText }),
        f && !f.length?.whole ? el('button', { type: 'button', class: 'ghost small rp-edit', text: '✎', title: 'Change where it starts and ends', on: { click: editLength } }) : null,
        el('span', { class: 'spacer' }),
        R.p ? el('button', { type: 'button', class: 'ghost small rp-save', text: '＋ Save as preset', title: `Keep the card's settings as a preset of “${R.p.name}” (it syncs with the project)`, on: { click: saveAs } }) : null);
      return el('div', { class: 'sq-rp-row rp-row' }, el('b', { text: 'Presets' }), el('div', { class: 'rp-wrap' }, el('div', { class: 'sq-chips' }, chips), line));
    }
    const api = {
      row, rangeRow, choose, // (round 142, renderrange142)
      // what the card renders now: the shown preset's length, else the card's choice → LabExport.render options
      lengthOpts: (format) => C.lengthOpts(lenNow(), format),
      range: () => ({ kind: kindNow(), length: lenNow() && JSON.parse(JSON.stringify(lenNow())), line: C.rangeLine(kindNow(), lenNow(), ctxNow()), source: st.source }),
      active: () => R.ticked.length > 0,
      label: () => (R.ticked.length > 1 ? `⇪ Export ${R.ticked.length} presets` : null),
      state: () => ({ ticked: R.ticked.slice(), shown: R.shown, filled: JSON.parse(JSON.stringify(R.filled)) }),
      click, saveAs, editLength,
      // ⇪ Export with presets ticked: each one's jobs, the shown one with the card's fields as they are now
      async run(o = {}) { // (round 140, preflight140) o.check: the Render card's check before a render (one for every ticked preset)
        keep();
        const list = R.ticked.map((id) => fillOf(id)).filter(Boolean);
        const shown = R.shown;
        return queue(list, { frame: frame(), source: st.source, project: R.p, check: o.check || null, onGo: () => { if (R.p && shown) setPrefs(R.p, { renderLast: shown }); } });
      },
    };
    S.cur = api; // (the card open now: the check reads its state)
    return api;
  }

  // ---------- the queue: every ticked preset, one after another ----------
  async function outBase() { try { return await SEQ().outDir(); } catch { return WinMac.join(await window.hub.fs.home(), 'Hearth exports'); } }
  const exists = (p) => window.hub.fs.stat(p).then((s) => Boolean(s), () => false);
  // the saved framing for a shape (▦ All formats' nudges for this scene), when the preset's shape isn't the scene's
  async function reframeFor(size, frame) {
    const sid = sketchId();
    const all = store.get('three.formats.nudge', {})[`scene:${sid || ''}`];
    if (!all || !Object.keys(all).length || Math.abs(Math.log((size.w / size.h) / (frame.w / frame.h))) < 0.02) return null;
    if (typeof FormatsCore === 'undefined') await window.Lazy?.load?.('multiformat').catch(() => null);
    if (typeof FormatsCore === 'undefined') return null;
    const n = all[FormatsCore.nearest(size.w, size.h)];
    return n ? FormatsCore.toPage(FormatsCore.clamp(n)) : null;
  }
  async function queue(list, { frame, source = 'scene', project = null, quiet = false, check = null, onGo = null } = {}) {
    const name = project?.name || (() => { try { return ThreeLab.scenes.get(sketchId())?.name; } catch { return null; } })() || 'Lab';
    let dir = WinMac.join(await outBase(), XC().safe(name));
    let jobs = [];
    const date = new Date();
    for (const f of list) {
      const x = f.fields;
      const size = x.size === 'custom' ? XC().size(x.custom || 'frame', frame) : XC().size(x.size, frame);
      jobs.push(...C.jobs(f, { format: x.format, size, fps: x.fps, quality: x.quality, ss: x.ss, blur: x.blur }, { name, source, date, perfect: true }));
    }
    if (S.tiny) jobs = C.tiny(jobs, S.tiny);
    // (round 140, preflight140) one combined check of every ticked preset before anything renders (tools/three-preflight.js):
    // a reel or a square post is meant to be its own shape; the presets that follow the song want one. Cancel: nothing renders.
    if (check && typeof LabPreflight === 'undefined') await Promise.resolve(window.Lazy?.load?.('preflight')).catch(() => null);
    if (check && typeof LabPreflight !== 'undefined') {
      const baseOf = (id) => (C.get(id) ? id : savedOf(project).find((x) => x.id === id)?.base || 'full');
      let song = false; try { song = Boolean(ThreeLab.scenes.songOf?.(sketchId())); } catch { /* none */ }
      const ctxR = { ...songCtx(), source, seq: source === 'seq' ? await seqOf() : null }; // (round 142, renderrange142) each preset's range on the check
      const ranges = list.map((f) => `${f.name}: ${C.rangeLine(C.kindOf(f.length, ctxR), f.length, ctxR)}`);
      const pf = await check({ jobs: jobs.map((j) => LabPreflight.jobOf(j, { label: j.label, shape: /^(reel|square)$/.test(baseOf(j.preset)) ? 'fixed' : 'free', song })), dir, source, range: ranges.join(' · '), title: list.length > 1 ? `Before these ${list.length} presets` : null,
        wantSong: source === 'seq' ? [] : list.filter((f) => /^(reel|full|master|square)$/.test(baseOf(f.id))).map((f) => f.name) });
      if (!pf) return null;
      jobs = jobs.map((j, k) => (pf.jobs[k] ? { ...j, size: { w: pf.jobs[k].w, h: pf.jobs[k].h }, fps: pf.jobs[k].fps } : j));
      if (pf.flags?.dir) dir = pf.dir;
    } else if (check) await check({ jobs: [], dir, source }); // (the check couldn't load: the card just closes)
    onGo?.();
    // a file of that name already there: asked first (replace: the old one goes to the Trash; else both are kept)
    for (const j of jobs) {
      const target = WinMac.join(dir, `${XC().safe(j.stem)}${j.ext ? `.${j.ext}` : ''}`);
      if (!(await exists(target))) continue;
      S.asked += 1;
      const yes = await Modal.confirm(`Replace “${base(target)}”?`, `A render with this name is already in “${base(dir)}”. Replace it? The old one goes to the ${/Mac/.test(navigator.platform) ? 'Trash' : 'Recycle Bin'}. Cancel keeps both (the new one gets a number).`, { ok: 'Replace it' });
      if (yes) await window.hub.fs.trash([target]).catch((err) => toast(`Couldn't move the old file away: ${err.message}`, { type: 'error' }));
    }
    S.runs += 1;
    const out = { dir, files: [], failed: [] };
    S.last = out;
    // one after another through LabExport.render (its own queue: each is a row of the render queue)
    await Promise.all(jobs.map(async (j) => {
      const reframe = j.source === 'scene' ? await reframeFor(j.size, frame) : null;
      try {
        const r = await LabExport.render({ ...j, dir, stem: j.stem, name, quiet: true, title: `⇪ ${j.label} · ${j.size.w}×${j.size.h}`, ...(reframe ? { reframe } : {}) });
        out.files.push({ preset: j.preset, label: j.label, path: r.path, w: r.w, h: r.h, fps: r.fps, frames: r.frames, format: r.format });
      } catch (err) { out.failed.push({ preset: j.preset, label: j.label, error: err.message }); }
    }));
    // each render joins the project: the render queue's row does it when the project is the one in front of you (the
    // scene's); a moment later, any that didn't join it then join here (once each)
    if (project && out.files.length) {
      setTimeout(() => {
        for (const f of out.files) {
          try { if (!(project.items || []).some((it) => it.type === 'render' && (it.ref === f.path || window.Renders?.get?.(it.ref)?.output === f.path))) window.Projects?.madeHere?.('render', f.path, project); } catch { /* the queue's own join */ }
        }
      }, 1500);
    }
    out.files.sort((a, b) => jobs.findIndex((j) => j.label === a.label) - jobs.findIndex((j) => j.label === b.label));
    if (!quiet) {
      if (out.files.length) toast(`${out.files.length} render${out.files.length === 1 ? '' : 's'} ready in “${base(dir)}”${out.failed.length ? ` (${out.failed.map((x) => x.label).join(', ')} failed: ${out.failed[0].error})` : ''}`, { timeout: 8000, action: { label: 'Show', fn: () => window.hub.fs.reveal(out.files[0].path) } });
      else if (out.failed.length && !/cancel/i.test(out.failed[0].error)) toast(`Presets: ${out.failed[0].error}`, { type: 'error' });
    }
    return out;
  }

  return { attach, queue, projectNow, ctxOf, hasProres, tiny: (t) => { S.tiny = t || null; }, get last() { return S.last; }, get asked() { return S.asked; }, _S: S };
})();
window.LabRenderPre = LabRenderPre;
