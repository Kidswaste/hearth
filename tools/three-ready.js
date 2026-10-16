// ▣ Present, got ready (round 52, presentready). The owner asked: "could the Present button be a sort of compile button
// that loads everything in advance, compresses it and makes the scene run at 100 % quality with no lag at all?"
// Present (▣, P) is still one button. It goes full screen at once (the press is what lets it) and shows a calm card on
// the big screen while it gets the scene ready behind it, at the size the show will draw:
//   1. the song's analysis in;  2. every picture, video (first frame) and model in;  3. every shader the scene draws
//   compiled (KHR_parallel_shader_compile via compileAsync) and its textures uploaded;  4. frames drawn at moments
//   across the timeline (anything the timeline shows later compiles now);  5. a short measured run at the heaviest
//   moments: does this computer hold the screen's rate at full quality?
// Then the card goes and the show runs at 100 %: no adaptive steps, the scene's own resolution, no doze, no fps cap
// (tools/three-sandbox.html RDY.lock); background work waits (Power.hush + main's power:quiet: backups, sync, updates, tips).
// When the measure says it can't hold (or the owner picks "Bake for a perfect show"), the show is baked: rendered to a
// video at the presentation's size and the screen's rate (60 fps for pieces over 30 s) with the export's streamed
// encoder (tools/three-export.js), then played full screen with the song in it: frame-perfect, never late. Not live: the
// mic, camera and sliders don't react. Bakes are kept (a hash of the compiled scene, the song, the size and the rate:
// ReadyCore.key), so an unchanged scene presents at once the next time; a scene's older bakes and the oldest past
// 4 GB / 12 go to the Trash. Esc leaves and puts everything back. Model: tools/three-ready-core.js.
const PresentReady = (() => {
  const C = ReadyCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const LX = () => (typeof LabExport !== 'undefined' ? LabExport : null); // (a const global: not on window)
  // (checks: localStorage 'presentready.test' = { force: 'cant' | 'holds', fps, scale, measureMs, points })
  const T = () => { try { return JSON.parse(localStorage.getItem('presentready.test') || 'null') || {}; } catch { return {}; } };
  let L = null; // the Lab's handle (tools/three.js api.present: host, player, send, frame, scene, syncPark)
  let R = null; // the show being got ready / running
  const S = { runs: 0, last: null };
  const waits = new Set();

  // ---------- the preview's answers ----------
  function onBox(msg) {
    if (msg.type === 'ready-progress' && R && msg.id === R.id) R.progress?.(msg.stage, msg.total ? msg.done / msg.total : 1);
    for (const w of [...waits]) if (w.test(msg)) { waits.delete(w); w.resolve(msg); }
  }
  function ask(m, test, ms = 20000) {
    return new Promise((resolve) => { const w = { test, resolve }; waits.add(w); setTimeout(() => { if (waits.delete(w)) resolve(null); }, ms); L.send(m); });
  }
  const count = () => ask({ type: 'ready-count' }, (m) => m.type === 'ready-count', 4000);
  // the screen's refresh, from this window's own frames (a fullscreen page draws at the screen's rate)
  function hzProbe(ms = 350) {
    // (a window whose frames don't come — hidden, throttled — answers with what it has, or 60, after a moment)
    return new Promise((res) => { const g = []; let last = 0; let done = false; const t0 = performance.now(); const end = () => { if (!done) { done = true; res(C.hzOf(g)); } }; const go = (t) => { if (done) return; if (last) g.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(go); else end(); }; requestAnimationFrame(go); setTimeout(end, ms + 400); });
  }

  // ---------- the card ----------
  function card(r) {
    const title = el('div', { class: 'pr-title', text: 'Getting ready…' });
    const line = el('div', { class: 'pr-line', text: C.labelOf('song') });
    const fill = el('i');
    const bar = el('div', { class: 'pr-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
    const note = el('div', { class: 'pr-note', hidden: true });
    const main = el('button', { class: 'pr-btn pr-main', type: 'button', text: 'Start now', on: { click: () => (r.phase === 'bake' ? live(r) : skip(r)) } });
    const bake = el('button', { class: 'pr-btn', type: 'button', text: 'Bake for a perfect show', title: 'Renders it to a video first, then plays it: perfect, but not live (the mic, camera and sliders won\'t react)', on: { click: () => { r.bake = true; skip(r, true); } } });
    const esc = el('div', { class: 'pr-esc', text: 'Esc to cancel' });
    const box = el('div', { class: 'pr-card' }, title, line, bar, note, el('div', { class: 'pr-row' }, main, bake), esc);
    const wrap = el('div', { class: 'pr-ready', role: 'status', 'aria-live': 'polite' }, box);
    L.host.append(wrap);
    let pct = -1; let text = '';
    const ui = {
      wrap,
      set(p, t) {
        p = Math.max(0, Math.min(100, Math.round(p)));
        if (p !== pct) { pct = p; fill.style.transform = `scaleX(${p / 100})`; bar.setAttribute('aria-valuenow', String(p)); }
        const tx = `${t} · ${p} %`;
        if (tx !== text) { text = tx; line.textContent = tx; }
      },
      bakeMode(why, fpsWhy) {
        title.textContent = 'Baking a perfect show…';
        note.hidden = false;
        note.textContent = `${why ? `${why}. ` : ''}It's rendered to a video at ${fpsWhy}, then played full screen with the song: no lag at all. Not live: the mic, camera and slider moves won't react during the show.`;
        main.textContent = 'Present live instead'; bake.hidden = true; esc.textContent = 'Esc to cancel';
      },
      remove() { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 260); },
    };
    return ui;
  }

  // ---------- getting ready ----------
  // background work waits during a show (powerwise's schedule here, the main process' backups / sync / config watching),
  // except 🔁 Keep going, hooks and the Lab's own timers; tips wait too (Hints.busy reads Power.quietNow)
  function quiet(on) {
    const P = window.Power;
    if (!P?.hush || Boolean(P.quietNow?.()) === Boolean(on)) return;
    P.hush(on, ['routines', 'hooks', 'lab-media', 'lab-stall', ...(P.timers?.() || []).map((x) => x.id).filter((id) => /^chromeview/.test(id))]);
    window.hub?.power?.quiet?.(on)?.catch?.(() => {});
  }
  function lock(r, on) {
    if (r.locked === on) return;
    r.locked = on;
    L.send({ type: 'ready-lock', on });
    quiet(on);
  }
  function skip(r, toBake = false) { if (r.phase !== 'ready') return; r.skip = true; r.skipBake = toBake; r.wake?.(); }
  const race = (r, p) => Promise.race([p, r.stopped]);
  async function prepare(r) {
    const P = L.player; const t = T();
    const set = (stage, f) => r.ui.set(C.progress(stage, f), C.labelOf(stage));
    r.progress = set;
    // 1. the song
    set('song', 0);
    if (P.loaded && !P.isClock && !P.analysis) { const t0 = Date.now(); while (!P.analysis && Date.now() - t0 < 10000 && !r.skip) await race(r, sleep(100)); }
    if (r.skip) return;
    // 2–3. pictures / videos / models, then shaders and textures
    set('assets', 0);
    const id = r.id;
    r.steps.prep = await race(r, ask({ type: 'ready-prep', id }, (m) => m.type === 'ready-prepped' && m.id === id, 60000));
    if (r.skip) return;
    // 4. frames across the timeline (the playhead goes back where it was)
    const dur = P.loaded ? Number(P.duration) || 0 : 0;
    const pts = C.points(dur, t.points || (dur > 60 ? 12 : 8));
    if (P.playing) P.toggle(false);
    const works = [];
    for (let i = 0; i < pts.length && !r.skip; i += 1) {
      if (P.loaded) P.seek(pts[i]);
      const w = await race(r, ask({ type: 'ready-warm', id, n: 3 }, (m) => m.type === 'ready-warmed' && m.id === id, 8000));
      works.push({ t: pts[i], work: w?.work || 0, gl: w?.gl || null });
      set('warm', (i + 1) / pts.length);
    }
    r.steps.warm = works;
    if (r.skip) return;
    // 5. the heaviest moments, measured at full quality on this screen
    const heavy = works.slice().sort((a, b) => b.work - a.work).slice(0, 2);
    const gaps = [];
    for (let i = 0; i < heavy.length && !r.skip; i += 1) {
      if (P.loaded) P.seek(heavy[i].t);
      await race(r, ask({ type: 'ready-warm', id, n: 2 }, (m) => m.type === 'ready-warmed' && m.id === id, 6000));
      L.send({ type: 'ready-rec', on: true });
      await race(r, sleep(t.measureMs || 900));
      const rec = await ask({ type: 'ready-rec', on: false, id }, (m) => m.type === 'ready-rec' && m.id === id, 4000);
      gaps.push(...(rec?.gaps || []));
      set('measure', (i + 1) / heavy.length);
    }
    r.hz = await r.hzP;
    r.verdict = C.verdict(gaps, r.hz);
  }
  function restorePlayer(r) {
    if (!r.player || r.playerBack) return;
    r.playerBack = true;
    const P = L.player;
    if (P.loaded && Math.abs(P.time - r.player.time) > 0.01) P.seek(r.player.time);
    if (r.player.playing && !P.playing) P.toggle(true);
  }

  async function start(lab, { mode = null } = {}) {
    if (R) stop();
    L = lab;
    const t = T();
    let wake = null;
    const r = R = { id: `pr${Date.now().toString(36)}${S.runs}`, mode: mode || t.mode || null, phase: 'ready', t0: performance.now(), steps: {}, skip: false, bake: mode === 'bake', locked: false, player: { time: L.player.time, playing: L.player.playing } };
    r.stopped = new Promise((res) => { wake = res; }); r.wake = () => wake?.();
    S.runs += 1;
    r.ui = card(r);
    r.hzP = hzProbe();
    lock(r, true);
    // a bake of this very scene is kept: the show starts at once (it was baked because live couldn't be perfect here)
    if (r.mode !== 'live' && !t.noPrep && LX()?.sceneEdit) {
      try { r.hz = await r.hzP; const F = await findBake(r); if (F.hit && R === r) { r.found = F; r.readyMs = Math.round(performance.now() - r.t0); restorePlayer(r); await bakeAndShow(r); return; } } catch (err) { console.warn('Present: the bake cache', err); }
      if (R !== r) return;
    }
    if (!r.bake && !t.noPrep) { try { await prepare(r); } catch (err) { r.prepError = String(err?.message || err); console.warn('Present: getting ready', err); } } // (noPrep: the old Present, for a check's "before")
    if (t.force === 'cant') r.verdict = { ...(r.verdict || C.verdict([], 60)), holds: false, forced: true, why: 'checked as too slow (a test)' };
    if (t.force === 'holds') r.verdict = { ...(r.verdict || C.verdict([], 60)), holds: true, forced: true };
    if (R !== r) return;
    r.readyMs = Math.round(performance.now() - r.t0);
    if (r.skipBake) r.bake = true;
    restorePlayer(r);
    r.hz ||= await r.hzP;
    if (r.bake || (r.verdict && !r.verdict.holds && r.mode !== 'live' && !r.skip)) { await bakeAndShow(r); return; }
    await goLive(r);
  }

  // ---------- the live show ----------
  async function goLive(r) {
    if (R !== r) return;
    r.phase = 'live';
    r.ui.remove();
    lock(r, true);
    // what the GPU compiles / uploads and how the frames pace in the first 5 s of the show (checks read state())
    const c0 = await count();
    if (R !== r) return;
    L.send({ type: 'ready-rec', on: true });
    r.t5 = setTimeout(async () => {
      if (R !== r) return;
      const c1 = await count();
      const rec = await ask({ type: 'ready-rec', on: false, id: r.id }, (m) => m.type === 'ready-rec' && m.id === r.id, 4000);
      if (c0 && c1) r.first5 = { compiles: c1.compiles - c0.compiles, links: c1.links - c0.links, uploads: c1.uploads - c0.uploads, reuploads: c1.reuploads - c0.reuploads, shares: c1.shares, cap: c1.cap, doze: c1.doze, dozeWhy: c1.dozeWhy, lock: c1.lock, level: c1.level };
      if (rec) r.pace = C.verdict(rec.gaps, r.hz);
      S.last = info(r);
    }, 5000);
    S.last = info(r);
  }
  function live(r) {
    // from the bake card: "Present live instead" (the bake stops)
    r.mode = 'live';
    if (r.baking) { r.liveInstead = true; LX()?.cancel?.(); return; }
    goLive(r);
  }

  // ---------- the baked show ----------
  async function bakeDir() {
    try { const d = await window.hub.capture.dir(); if (d?.dir) return WinMac.join(d.dir, 'Present bakes'); } catch { /* below */ }
    return WinMac.join(await window.hub.fs.home(), 'Hearth presentations');
  }
  async function readIndex() {
    try { const r = await window.hub.kvGet('present-bakes', null, { status: true }); if (r?.state === 'ok') return Array.isArray(r.value) ? r.value : []; if (r?.state === 'missing') return []; return null; } catch { return null; }
  }
  // the bake's identity: the scene compiled the export's way (its layers with the live slider values, keyframes,
  // placements, looks), the song file, the size, the rate
  async function keyNow(r, { w, h, fps, kind, dur }) {
    const X = LX();
    const { e, sk } = await X.sceneEdit({ w, h, F: fps, end: Math.max(1 / fps, dur - 1 / fps) });
    const compiled = X.compileLive(e, sk);
    const P = L.player;
    const song = P.loaded && !P.isClock ? P.path : null;
    const st = song ? await window.hub.fs.stat(song).catch(() => null) : null;
    // (the clip ids are made new for each compile: not the scene, so they're named by their place)
    let txt = JSON.stringify(compiled.plan);
    (compiled.plan.groups || []).forEach((g, i) => { if (g.id) txt = txt.split(String(g.id)).join(`#g${i}`); });
    const plan = JSON.parse(txt);
    return { compiled, key: C.key({ plan, song: song ? { path: song, size: st?.size, mtime: st?.mtime } : null, w, h, fps, kind }), song };
  }
  // what a bake of the scene now would be (its rate, size, key) and whether the cache has it
  async function findBake(r) {
    const P = L.player; const t = T();
    const dur = P.loaded ? Number(P.duration) || 0 : 0;
    const kind = dur > 0 ? 'mp4' : 'loop';
    const b = C.bakeFps(r.hz || 60, dur || 8);
    const fps = Number(t.fps) || b.fps;
    const k = Number(t.scale) || 1;
    const size = C.bakeSize({ w: L.host.clientWidth * devicePixelRatio * k, h: L.host.clientHeight * devicePixelRatio * k }, L.frame());
    const id = await keyNow(r, { w: size.w, h: size.h, fps, kind, dur: dur || 9 }); // (a loop is found in up to 8 s of the scene)
    const scene = L.scene()?.id || null;
    const idx = await readIndex();
    const pl = C.plan(idx || [], { key: id.key, scene });
    const okFile = pl.hit ? await window.hub.fs.stat(pl.hit.path).catch(() => null) : null;
    return { dur, kind, b, fps, size, id, scene, idx, hit: pl.hit && okFile?.size ? pl.hit : null, fpsWhy: t.fps ? `${fps} fps` : b.why };
  }
  async function bakeAndShow(r) {
    if (R !== r) return;
    r.phase = 'bake';
    const X = LX();
    if (!X?.render) { r.bakeError = 'no Lab export'; toast('Baking needs the Lab export: presenting live', { timeout: 5000 }); return goLive(r); }
    r.ui.set(0, 'looking for a bake of this scene');
    let entry = null;
    try {
      const F = r.found || await findBake(r);
      const { dur, kind, fps, size, id, scene, idx } = F;
      r.ui.bakeMode(r.bake || r.found ? '' : `This computer can't hold the screen's ${r.verdict?.hz || r.hz} fps at full quality here (${r.verdict?.why || 'too slow'})`, F.fpsWhy);
      r.key = id.key;
      const pl = { hit: F.hit }; const okFile = F.hit ? { size: 1 } : null;
      if (pl.hit && okFile?.size) {
        r.cache = 'hit'; entry = pl.hit;
        if (idx) window.hub.kvSet('present-bakes', C.use(idx, id.key, Date.now())).catch(() => {});
      } else {
        r.cache = 'miss';
        const dir = await bakeDir();
        r.baking = true;
        const t0 = performance.now();
        const go = (hw) => X.render({
          source: 'scene', format: kind, size: { w: size.w, h: size.h }, fps, quality: 'best', compiled: id.compiled, name: L.scene()?.name || 'Show',
          ...(kind === 'mp4' ? { range: { a: 0, b: dur } } : {}), sound: Boolean(id.song), dir, stem: id.key, quiet: true, track: false, hw,
          onProgress: (p, label, left) => { if (R === r) r.ui.set(p * 100, `${left != null ? `${C.fmtLeft(left)} left · ` : ''}${String(label || 'baking').replace(/^frame /, 'frame ')}`); },
        });
        let res;
        try { res = await go(true); } catch (err) { if (R !== r || r.liveInstead || /cancel/i.test(err.message)) throw err; console.warn('Present: hardware encode failed, x264', err); res = await go(false); }
        r.baking = false;
        r.bakeMs = Math.round(performance.now() - t0);
        entry = { key: id.key, scene, path: res.path, bytes: res.size || 0, w: size.w, h: size.h, fps, secs: Math.round((res.frames / fps) * 1000) / 1000, at: Date.now(), loop: kind === 'loop', sound: Boolean(id.song) };
        // the index (only after a real read: an unreadable one is never written over, and nothing is deleted)
        if (idx) {
          const p2 = C.plan(idx, { key: id.key, scene });
          const gone = [...p2.stale, ...p2.over];
          const next = C.add(C.drop(idx, gone.map((x) => x.key)), entry);
          const after = C.plan(next, { key: id.key, scene });
          const extra = after.over.filter((x) => x.key !== id.key);
          await window.hub.kvSet('present-bakes', C.drop(next, extra.map((x) => x.key)));
          const trash = [...gone, ...extra].map((x) => x.path).filter(Boolean);
          if (trash.length) { r.trashed = trash; window.hub.fs.trash(trash).catch(() => {}); }
        }
      }
    } catch (err) {
      r.baking = false;
      if (R !== r) return;
      if (r.liveInstead) { r.ui.set(100, 'live'); return goLive(r); }
      toast(`Couldn't bake the show (${String(err.message || err).slice(0, 120)}): presenting live`, { type: 'error', timeout: 7000 });
      r.bakeError = String(err.message || err);
      return goLive(r);
    }
    if (R !== r) return;
    show(r, entry);
  }
  function show(r, entry) {
    r.phase = 'baked'; r.entry = entry;
    r.ui.remove();
    lock(r, true);
    const P = L.player;
    if (P.playing) P.toggle(false); // (the video has the song in it)
    const v = el('video', { class: 'pr-video', attrs: { preload: 'auto', 'aria-label': 'The baked show' } });
    v.src = `${WinMac.fileUrl(entry.path)}?v=${entry.at}`;
    v.loop = Boolean(entry.loop) || (P.loaded && P.loop?.a === 0);
    const wrap = el('div', { class: 'pr-show' }, v);
    L.host.append(wrap);
    L.host.classList.add('pr-baked'); L.syncPark(); // (the live preview rests behind the video)
    r.video = v; r.wrap = wrap;
    const startAt = entry.sound && P.loaded ? Math.min(Math.max(0, r.player.time), Math.max(0, entry.secs - 0.05)) : 0;
    v.addEventListener('loadedmetadata', () => { try { v.currentTime = startAt; } catch { /* fine */ } if (entry.loop || r.player.playing || !entry.sound) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }, { once: true });
    // keys: Space play / pause, arrows seek (Shift: a frame), Home the top, 1–9 the song's cues, F pauses; Esc leaves
    r.keys = (e) => {
      if (R !== r || e.ctrlKey || e.metaKey || e.altKey) return;
      const fr = 1 / (entry.fps || 30);
      const cues = P.cues || [];
      let hit = true;
      if (e.code === 'Space' || e.key.toLowerCase() === 'f' || e.key === '\\') { if (v.paused) v.play().catch(() => {}); else v.pause(); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? fr : 5); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); } else if (e.key === 'Home') v.currentTime = 0;
      else if (/^[1-9]$/.test(e.key) && cues[Number(e.key) - 1]) v.currentTime = Math.min(v.duration || 0, cues[Number(e.key) - 1].time);
      else if (e.key === 'PageDown' || e.key === 'PageUp') { /* other scenes: not in a baked show */ } else hit = false;
      if (hit) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    addEventListener('keydown', r.keys, true);
    // the mouse hides after 2 s still
    let mt = 0;
    const hide = () => { wrap.style.cursor = 'none'; };
    r.mouse = () => { if (wrap.style.cursor) wrap.style.cursor = ''; clearTimeout(mt); mt = setTimeout(hide, 2000); };
    wrap.addEventListener('mousemove', r.mouse); mt = setTimeout(hide, 2000);
    r.mt = () => clearTimeout(mt);
    S.last = info(r);
  }

  // ---------- leaving (Esc, P, the fullscreen going away) ----------
  function stop() {
    const r = R;
    if (!r) return false;
    R = null;
    r.skip = true; r.wake?.();
    clearTimeout(r.t5);
    if (r.baking) LX()?.cancel?.();
    if (r.phase === 'live') L.send({ type: 'ready-rec', on: false, id: 'stop' });
    r.ui?.wrap?.remove();
    if (r.keys) removeEventListener('keydown', r.keys, true);
    r.mt?.();
    if (r.video) {
      const P = L.player;
      const at = r.video.currentTime;
      try { r.video.pause(); r.video.removeAttribute('src'); r.video.load(); } catch { /* gone */ }
      r.wrap.remove();
      L.host.classList.remove('pr-baked'); L.syncPark();
      if (r.entry?.sound && P.loaded && Number.isFinite(at)) { r.playerBack = true; P.seek(at); }
    }
    restorePlayer(r);
    lock(r, false);
    r.phase = 'done';
    S.last = { ...info(r), left: true };
    return true;
  }
  document.addEventListener('fullscreenchange', () => { if (R && L && document.fullscreenElement !== L.host) stop(); });

  function info(r) {
    return { id: r.id, phase: r.phase, mode: r.mode, readyMs: r.readyMs ?? null, verdict: r.verdict || null, hz: r.hz || null, prep: r.steps.prep ? { ms: r.steps.prep.ms, assets: r.steps.prep.assets, renderers: r.steps.prep.renderers, textures: r.steps.prep.textures, gl: r.steps.prep.gl } : null,
      warm: (r.steps.warm || []).map((w) => ({ t: w.t, work: w.work, compiles: w.gl?.compiles || 0, uploads: w.gl?.uploads || 0 })), first5: r.first5 || null, pace: r.pace || null, cache: r.cache || null, key: r.key || null, bakeMs: r.bakeMs ?? null, entry: r.entry || null, trashed: r.trashed || null, bakeError: r.bakeError || null, prepError: r.prepError || null, skipped: Boolean(r.skip && r.phase !== 'done') };
  }
  const api = { start, stop, onBox, state: () => (R ? info(R) : S.last), get active() { return Boolean(R); }, runs: () => S.runs, _keyNow: (o) => keyNow(R || {}, o), _index: readIndex, _bakeDir: bakeDir };
  window.PresentReady = api; // (tools/three.js routes the preview's ready-* answers through window.PresentReady)
  return api;
})();
