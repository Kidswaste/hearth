// ✈ The pre-flight check before a render (round 140, preflight140; docs/upgrades/preflight140.md). When the owner presses
// ⇪ Export (the Render card, its ticked presets, ⧉ Make a batch), Hearth looks, here, with no AI and in well under a
// second, for what would make him wait minutes for a broken video:
//   · files the scene uses that are gone or moved (references: pictures, footage, fonts, models and a model's other
//     files; the song; a reference the code names that the scene doesn't have)
//   · scene errors now (labhealth's records: a shader that didn't compile, a layer that throws)
//   · no song, or a silent one, when a preset follows the song (Vertical reel, Full song, 4K master, Square post)
//   · a shape that isn't the project's (a 9:16 project rendered 16:9)
//   · the time and the file size (the last renders' measured pace, else speed133's measure, else the preview's frame
//     time) and "Very slow: 4K at 60 fps would take about 40 min"
//   · room on the disk of the output folder
//   · solo on, or every (or most) layers hidden
// Nothing found: the render starts at once, no extra click. Something found: one small card lists it in plain words,
// each with a one-click fix where there is one (Relink…, Turn solo off, Switch to 9:16, Render at half size…), then
// Render anyway or Cancel (back to the card it came from). Several presets or a batch: one combined card.
// The model: tools/three-preflight-core.js. Lazy group 'preflight' (loaded with the Render card).
const LabPreflight = (() => {
  const C = PreflightCore;
  const XC = () => LabExportCore;
  const SEQ = () => (typeof ThreeSeq !== 'undefined' ? ThreeSeq : null);
  const P = () => { try { return ThreeLab.stageHooks?.player || SEQ()?._S?.L?.player || null; } catch { return null; } };
  const SC = () => { try { return ThreeLab.scenes || null; } catch { return null; } };
  const cmd = () => { try { return ThreeLab.peek?.() || null; } catch { return null; } };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const AUD = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|aiff?)$/i;
  // free: bytes to report for the output folder instead of asking the disk (the check's low-disk case); pick: a file /
  // folder picker standing in for the system's dialog (the check); last: the last check (its items, est, ms)
  const S = { free: undefined, pick: null, last: null, runs: 0, cards: 0, fixes: [], card: null };
  const timed = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms))]);
  // there or not: true / false; a stat that takes too long (a cloud file being fetched) counts as there
  const exists = (p) => timed(window.hub.fs.stat(p).then((s) => Boolean(s && !s.error), () => false), 700, true);
  const WHAT = { image: 'picture', video: 'footage', model: '3D model', audio: 'sound', font: 'font', data: 'file' };

  // ---------- the jobs: what will be rendered ----------
  // o: LabExport.render options (format, size { w, h }, fps, quality, ss, blur, range / at / secs / frames, source)
  function jobOf(o, { label = '', shape = 'free', song = false } = {}) {
    const f = XC().get(o.format || 'mp4') || XC().get('mp4');
    const sz = o.size && typeof o.size === 'object' ? o.size : { w: o.w || 1920, h: o.h || 1080 };
    return { label: label || f.name.split(' · ')[0], format: f.id, kind: f.kind, loop: Boolean(f.loop), w: sz.w, h: sz.h, fps: Number(o.fps) || 30, quality: o.quality || 'high', ss: o.ss || 1, blur: o.blur || 1, source: o.source || 'scene', range: o.range || null, at: o.at, secs: o.secs, frames: o.frames, audio: Boolean(f.audio) && song, shape };
  }

  // ---------- what the check reads ----------
  function projectOf(sid) { try { return (sid && window.Projects?.ofItem?.('scene', sid)?.[0]) || null; } catch { return null; } }
  // the shape the renders should have: the project's (prefs.aspect, its workspace frame), else the scene's frame
  function frameOf(sid, source) {
    if (source === 'seq' && SEQ()?.edit?.seq) { const s = SEQ().edit.seq; return { w: s.w, h: s.h, from: 'scene', name: s.name || 'The sequence' }; }
    const p = projectOf(sid);
    const a = C.aspectOf(p?.prefs?.aspect || p?.workspace?.frame);
    if (a) return { ...a, from: 'project', name: p.name };
    try { const f = LabExport.frameNow(); return { ...f, from: 'scene', name: '' }; } catch { return null; }
  }
  function costNow() {
    let speed = null; let preview = null;
    try {
      const raw = typeof LabSpeed !== 'undefined' ? LabSpeed._S?.raw : null;
      if (raw?.ok && LabSpeed._S.scene === SC()?.currentId?.()) {
        let px = 0; for (const L of raw.layers || []) for (const r of L.gl?.renderers || []) px = Math.max(px, (r.w || 0) * (r.h || 0) * (r.pr || 1) ** 2);
        if (px) speed = { fps: raw.fps, px };
      }
    } catch { /* not measured */ }
    try {
      const pf = cmd()?.perf?.();
      const ms = Number(pf?.frameMsP50) || (pf?.fps > 0 ? 1000 / pf.fps : 0);
      const host = ThreeLab.speed?.host;
      const px = host ? host.clientWidth * host.clientHeight * (window.devicePixelRatio || 1) : 0;
      if (ms > 0 && px > 0 && !pf.parked) preview = { ms, px };
    } catch { /* no preview */ }
    return C.costOf({ pace: store.get('three.export.pace', []), speed, preview });
  }
  function ctxNow(source) {
    const p = P(); const out = {};
    try { if (p?.loop && p.loop.b > p.loop.a) out.ab = { a: p.loop.a, b: p.loop.b }; } catch { /* none */ }
    try { const g = p?.loaded && !p.isClock ? p.timeline?.().grid : null; if (g?.bpm) { out.bpm = g.bpm; out.bpb = g.beatsPerBar || 4; } } catch { /* none */ }
    if (source === 'seq') { try { out.seqDur = SEQ().compile(SEQ().edit).plan.dur; } catch { /* none */ } }
    return out;
  }
  // the estimate for the Render card's summary line (tools/three-export.js paint(): "· about 2 min · ~45 MB")
  function estimateLine(o) {
    try { const j = jobOf(o, { song: Boolean(SC()?.songOf?.(SC().currentId())) }); return C.estimate([j], costNow(), ctxNow(j.source)).text; } catch { return ''; }
  }

  // the scene the renders draw: the one on screen, or (a batch) a template's copy of one
  function screenScene() {
    const sc = SC(); const sid = sc?.currentId?.(); const sk = sid ? sc.get(sid) : null;
    if (!sk) return null;
    let layers = []; try { layers = sc.layersOf(sk) || []; } catch { layers = []; }
    let refs = []; try { refs = ThreeLab.director?.refs?.list?.() || []; } catch { refs = []; }
    return { sid, name: sk.name, layers, refs, song: sc.songOf?.(sid) || null, live: true };
  }
  function templateScene(t) {
    const s = t?.scene || {};
    return { sid: null, name: t?.name || s.name, layers: s.layers || [], refs: s.refs || [], song: s.extras?.media?.path && AUD.test(s.extras.media.path) ? s.extras.media.path : null, live: false, t };
  }
  async function gather(sc, { jobs, dir, wantSong = [], skipped = 0, canDir = true, source = 'scene' }) {
    const plan = { jobs, dir, wantSong, skipped, canDir, missing: [], errors: [], layers: [], solo: null, song: null, free: null };
    const stats = [];
    if (sc) {
      // layers: hidden, solo
      plan.layers = sc.layers.map((L) => ({ id: L.id, name: L.name, visible: L.visible !== false }));
      const soloId = typeof LayerGroups !== 'undefined' ? LayerGroups.soloId(sc.layers) : null;
      if (soloId) {
        const g = typeof LayerGroups !== 'undefined' ? LayerGroups.groups(sc.layers).find((x) => x.id === soloId) : null;
        plan.solo = { id: soloId, name: g?.name || sc.layers.find((L) => L.id === soloId)?.name || 'one layer' };
      }
      // the files: each reference (Hearth's copy), a model's other files, the song
      sc.refs.forEach((r, i) => {
        if (!r.path) return;
        const id = r.id || `t${i}`;
        stats.push(exists(r.path).then((ok) => { if (!ok) plan.missing.push({ id, kind: 'ref', what: WHAT[r.kind] || 'reference', name: r.name || base(r.path), path: r.path, key: r.key }); }));
        if (sc.live && r.kind === 'model') {
          let files = []; try { files = ThreeLab.director.refs.files(r) || []; } catch { files = []; }
          for (const f of files.slice(0, 40)) stats.push(exists(f.path).then((ok) => { if (!ok) plan.missing.push({ id: `${id}|${f.rel}`, kind: 'file', ref: r.name, path: f.path }); }));
        }
      });
      if (sc.song) stats.push(exists(sc.song).then((ok) => { if (!ok) plan.missing.push({ id: 'song', kind: 'song', path: sc.song }); }));
      // a reference the code names that the scene doesn't have (refTexture('logo'))
      const keys = new Set(sc.refs.map((r) => r.key));
      const named = new Set();
      for (const L of sc.layers) {
        if (L.visible === false) continue;
        for (const m of String(L.code || '').matchAll(/\brefTexture\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) if (!keys.has(m[1]) && !named.has(m[1])) { named.add(m[1]); plan.missing.push({ id: `key:${m[1]}`, kind: 'key', name: m[1], layer: L.name }); }
      }
      // the song: there, and not silent
      if (sc.song) {
        const p = P();
        let silent = false;
        try { const lv = p?.path === sc.song && p.loaded && !p.isClock ? p.analysis?.level : null; if (lv?.length > 30) { let mx = 0; for (let i = 0; i < lv.length; i += 1) mx = Math.max(mx, lv[i]); silent = mx < 0.003; } } catch { /* not analysed */ }
        plan.song = { path: sc.song, silent };
      }
      // errors now (labhealth's records of the scene on screen)
      if (sc.live && typeof LabHealth !== 'undefined') {
        const now = Date.now();
        for (const r of LabHealth.state(sc.sid) || []) {
          if (r.kind === 'gpu' || r.ok) continue;
          if (!(r.paused || r.everyFrame || r.kind === 'shader' || r.kind === 'camera' || now - r.last < 120000)) continue;
          const L = sc.layers.find((x) => x.id === r.layer);
          if (L && L.visible === false) continue; // (a hidden layer isn't drawn)
          const what = r.kind === 'shader' ? 'a shader didn\'t compile' : r.paused ? 'it stopped (it threw on every frame)' : r.kind === 'camera' ? 'its camera went wrong' : r.kind === 'asset' ? 'a file didn\'t load' : 'it throws';
          plan.errors.push({ layer: L?.id || null, name: L?.name || 'The scene', text: `${what} (${String(r.message || '').replace(/\s+/g, ' ').slice(0, 80)}${r.line ? `, line ${r.line}` : ''})` });
          if (plan.errors.length >= 4) break;
        }
      }
    }
    // the disk at the output folder
    const free = S.free !== undefined ? Promise.resolve(S.free) : dir ? timed(window.hub.renders?.free?.(dir).then((r) => (r && Number.isFinite(r.free) ? r.free : null)), 600, null) : Promise.resolve(null);
    await timed(Promise.all([...stats, free.then((v) => { plan.free = v; })]), 900, null);
    plan.missing.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    plan.frame = frameOf(sc?.sid || SC()?.currentId?.(), source);
    plan.cost = costNow();
    plan.ctx = ctxNow(source);
    try { const st = LabExport.status(); plan.queue = { running: Boolean(st.running), waiting: st.waiting || 0 }; } catch { plan.queue = null; }
    return plan;
  }

  // ---------- the fixes ----------
  async function pick(what, o) {
    if (S.pick) return S.pick(what, o);
    const r = await window.hub.openDialog(o);
    return Array.isArray(r) ? r[0] || null : r || null;
  }
  const fileDlg = (title, filters) => ({ properties: ['openFile'], title, ...(filters ? { filters } : {}) });
  // → true when it did something (the card checks again)
  async function fix(id, g) {
    const sc = g.sc; const c = cmd();
    if (id === 'half') { g.jobs = C.half(g.jobs); g.flags.half = true; return true; }
    if (id === 'fps30') { g.jobs = C.fps30(g.jobs); g.flags.fps30 = true; return true; }
    if (id === 'shape') { g.jobs = C.reshape(g.jobs, g.plan.frame); g.flags.shape = true; return true; }
    if (id === 'dir') { const d = await pick('folder', { properties: ['openDirectory', 'createDirectory'], title: 'Save the renders in…' }); if (!d) return false; g.dir = d; g.flags.dir = d; return true; }
    if (id === 'solo') {
      if (sc?.live) c?.solo?.(null);
      if (sc?.t && typeof LayerGroups !== 'undefined') LayerGroups.unsolo(sc.t.scene.layers);
      return true;
    }
    if (id === 'showall') {
      for (const L of sc?.layers || []) if (L.visible === false) { if (sc.live) c?.showLayer?.(L.name, true); else L.visible = true; }
      return true;
    }
    if (id.startsWith('hide:')) {
      const L = (sc?.layers || []).find((x) => x.id === id.slice(5)); if (!L) return false;
      if (sc.live) c?.showLayer?.(L.name, false); else L.visible = false;
      if (sc.t && sc.live) { const T = sc.t.scene.layers.find((x) => x.id === L.id); if (T) T.visible = false; }
      return true;
    }
    if (id === 'song:add') {
      const p = await pick('song', fileDlg('A song for this scene', [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'aiff'] }]));
      if (!p) return false;
      if (sc?.live) { const r = await c?.loadSong?.(p); if (r && r.ok === false) throw new Error(r.error || 'That song didn\'t load'); }
      if (sc?.t) { sc.t.scene.extras = { ...(sc.t.scene.extras || {}), media: { ...(sc.t.scene.extras?.media || {}), path: p } }; sc.song = p; }
      return true;
    }
    if (id.startsWith('add:')) {
      const key = id.slice(4);
      const p = await pick('ref', fileDlg(`The file for "${key}"`));
      if (!p) return false;
      await ThreeLab.director.refs.add(p, key);
      return true;
    }
    if (id.startsWith('relink:')) {
      const mid = id.slice(7);
      const m = g.plan.missing.find((x) => x.id === mid); if (!m) return false;
      const p = await pick(m.kind, fileDlg(`Where is "${base(m.path)}" now?`));
      if (!p) return false;
      if (m.kind === 'song') {
        if (sc?.live) { const pl = P(); const r = pl?.path === m.path && pl.follow ? await pl.follow(p) : await c?.loadSong?.(p); if (r && r.ok === false) throw new Error(r.error || 'That song didn\'t load'); }
        if (sc?.t?.scene?.extras?.media) sc.t.scene.extras.media.path = p;
        sc.song = p;
        return true;
      }
      if (m.kind === 'file') { // a model's other file: copied back to Hearth's copy, read again
        const [rid, rel] = mid.split('|');
        await window.hub.fs.copy(p, m.path);
        await ThreeLab.director.refs.reloadFile?.(rid, rel).catch(() => null);
        return true;
      }
      if (sc?.live && !mid.startsWith('t')) {
        const r = await ThreeLab.director.refs.reload(mid, { from: p });
        if (r && r.ok === false) throw new Error(r.error || 'That file couldn\'t be used');
        const T = sc.t?.scene?.refs?.find((x) => x.path === m.path); if (T) T.path = m.path; // (the copy is back in its place)
      } else {
        const T = (sc?.refs || [])[Number(mid.slice(1))]; if (T) T.path = p; // (a template's reference: this batch uses the file you picked)
      }
      return true;
    }
    return false;
  }

  // ---------- the gate: nothing found → go at once; else the card ----------
  // o: { jobs (jobOf), dir (the output folder), template (a batch's), wantSong (preset names), skipped, canDir, source }
  // → { jobs, dir, flags, est } to render, or null (Cancel)
  async function gate(o = {}) {
    const t0 = performance.now();
    S.runs += 1;
    if (store.get('three.preflight', true) === false) return { jobs: o.jobs, dir: o.dir, flags: {}, est: null };
    const sc = o.template ? (o.template._scene && screenScene() ? { ...screenScene(), t: o.template } : templateScene(o.template)) : o.source === 'seq' ? null : screenScene(); // (▤ the sequence: its clips are other scenes; only the shape, time, size and disk)
    const g = { sc, jobs: (o.jobs || []).slice(), dir: o.dir || null, flags: {}, plan: null, res: null, done: [] };
    const run = async () => {
      if (sc?.live) { const now = screenScene(); if (now) Object.assign(sc, { layers: now.layers, refs: now.refs, song: now.song }); }
      g.plan = await gather(sc, { jobs: g.jobs, dir: g.dir, wantSong: o.wantSong || [], skipped: o.skipped || 0, canDir: o.canDir !== false, source: o.source || 'scene' });
      g.res = C.check(g.plan);
    };
    await run();
    S.last = { items: g.res.items.map((x) => ({ id: x.id, text: x.text, fixes: x.fixes.map((f) => f.label) })), est: g.res.est, ms: Math.round(performance.now() - t0), card: false };
    if (!g.res.items.length) return { jobs: g.jobs, dir: g.dir, flags: g.flags, est: g.res.est };
    S.cards += 1; S.last.card = true;
    return card(g, run, o);
  }

  function card(g, run, o) {
    return new Promise((resolve) => {
      const list = el('ul', { class: 'pf-list' });
      const done = el('div', { class: 'pf-done' });
      const est = el('div', { class: 'pf-est' });
      const go = el('button', { type: 'button', class: 'primary pf-go', text: 'Render anyway' });
      const dlg = el('dialog', { class: 'ui-modal pf-card' },
        el('h3', { text: o.title || (g.jobs.length > 1 ? `Before these ${g.jobs.length} renders` : 'Before you render') }),
        list, done, est,
        el('div', { class: 'modal-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost pf-cancel', text: 'Cancel', on: { click: () => end(null) } }), go));
      let busy = false; let over = false;
      function end(v) { if (over) return; over = true; S.card = null; try { if (dlg.open) dlg.close(); } catch { /* gone */ } dlg.remove(); resolve(v); }
      function paint() {
        list.replaceChildren(...g.res.items.map((it) => el('li', { class: 'pf-item', attrs: { 'data-id': it.id } },
          el('span', { class: 'pf-text', text: it.text }),
          it.fixes.length ? el('span', { class: 'pf-fixes' }, ...it.fixes.map((f) => el('button', { type: 'button', class: 'ghost small pf-fix', text: f.label, attrs: { 'data-fix': f.id }, on: { click: () => doFix(f) } }))) : null)));
        done.replaceChildren(...g.done.map((t) => el('div', { class: 'pf-ok', text: `✓ ${t}` })));
        done.hidden = !g.done.length;
        est.textContent = `⏱ ${g.res.est.line}`;
        go.textContent = g.res.items.length ? 'Render anyway' : (g.jobs.length > 1 ? `⇪ Render ${g.jobs.length}` : '⇪ Render');
        S.last = { ...S.last, items: g.res.items.map((x) => ({ id: x.id, text: x.text, fixes: x.fixes.map((f) => f.label) })), est: g.res.est };
      }
      async function doFix(f) {
        if (busy) return; busy = true; dlg.classList.add('pf-busy');
        try {
          if (await fix(f.id, g)) { g.done.push(f.label.replace(/…$/, '')); S.fixes.push(f.id); await new Promise((r) => setTimeout(r, 60)); await run(); paint(); }
        } catch (err) { toast(err.message, { type: 'error' }); } finally { busy = false; dlg.classList.remove('pf-busy'); }
      }
      go.addEventListener('click', () => end({ jobs: g.jobs, dir: g.dir, flags: g.flags, est: g.res.est, anyway: g.res.items.length > 0 }));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); end(null); });
      document.body.append(dlg);
      paint();
      dlg.showModal();
      S.card = dlg;
    });
  }

  return { gate, jobOf, estimateLine, costNow, _S: S, get last() { return S.last; } };
})();
window.LabPreflight = LabPreflight;
