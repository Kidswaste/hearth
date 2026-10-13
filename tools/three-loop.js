// ∞ Make it loop (round 31, perfectloop): the Lab scene loops perfectly, for looping 9:16 Shorts / Reels / TikToks.
//   · Make it loop over N bars of the song (from the bar the playhead is in) or N seconds of the scene's own timeline:
//     the timeline loops there, and the preview's clock follows it (tools/three-sandbox.html "perfect loop"): a
//     layer's frame time and performance.now() are the timeline's time folded into the loop, so code, keyframes and
//     music reactions all come round together. Renders do the same (the export page gets the loop's clock; a perfect
//     loop's frames are exactly its length; a blend's frames past the end are what the scene does next).
//   · Keyframes come back round: a setting keyed to end elsewhere gets a key at the loop's end with its start value
//     (undone with Loop off).
//   · Code made to loop reads the loop's phase: loopT(), loopSin(n), loopCos(n), loopWave(n), loopAngle(n),
//     loopNoise(x, y) (noise on a circle), loop.len… (the director learns them with help loop, on demand).
//   · The seamless check: small frames of the loop drawn on the export page (a simulation steps through all of them),
//     the last frame against the first with publishkit's loop check → "≈ seamless" or "a visible jump", with one
//     click to fix it: blend the last beat into the first (the preview fades its seam; renders cross-fade the frames),
//     or (cost shown first) the director makes the motion itself periodic.
//   · Render the loop: a perfect-loop MP4 (or GIF) of exactly the loop, with the song's bars under it when it has one.
// Ways in: ✦ More › ⇪ Make › ∞ Make it loop, the ◎ mission "Make it loop", Ready to post's loop fix on a Lab render,
// ⌘/Ctrl+K, the director (three_do loop), and /make-loop (the app's internal API). Model: tools/three-loop-core.js.
const PerfectLoop = (() => {
  const C = () => LoopCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const err = (e) => toast(String(e?.message || e), { type: 'error' });
  const S = { card: null, last: null, busy: null, hooked: false, made: new Set(), sent: '' };

  // ---------- the Lab ----------
  async function lab(show = true) {
    const cmd = await ThreeLab.cmd({ show });
    for (let i = 0; i < 100 && !(ThreeLab.director && ThreeLab.stageHooks?.player); i += 1) await sleep(100);
    if (!ThreeLab.director || !ThreeLab.stageHooks?.player) throw new Error('The Lab is not ready yet.');
    hook();
    return { cmd, d: ThreeLab.director, hooks: ThreeLab.stageHooks, P: ThreeLab.stageHooks.player };
  }
  const hooks = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const player = () => hooks()?.player || null;
  const sceneId = () => hooks()?.sketchId?.() || null;
  const stateOf0 = (id = sceneId()) => (id && ThreeLab.scenes?.extrasOf?.(id)?.perfectloop) || null;
  // the loop as the timeline has it now (its A–B loop dragged by hand while looping: the loop follows)
  function stateOf(id = sceneId()) {
    const st = stateOf0(id); const r = st?.on && id === sceneId() ? player()?.loop : null;
    if (r && (Math.abs(r.a - st.a) > 1e-3 || Math.abs(r.b - r.a - st.len) > 1e-3)) { const n = { ...st, a: r.a, len: Math.round((r.b - r.a) * 1e4) / 1e4, check: null }; save(id, n); return n; }
    return st;
  }
  const save = (id, st) => { if (id) ThreeLab.scenes?.setExtras?.(id, { perfectloop: st }); };
  const songOf = (P) => (P?.loaded && !P.isClock && P.bpm > 0 ? { bpm: P.bpm, bpb: P.beatsPerBar || 4, anchor: P.downbeat ?? 0, duration: P.duration || 0, path: P.path } : null);
  const frameSize = () => { const z = hooks()?.size || {}; return { w: z.w || z.width || 1080, h: z.h || z.height || 1920 }; };

  // the preview's clock: the scene's loop (or off), sent once per change and again to a fresh page / another scene
  function clockMsg(st = stateOf()) {
    return st?.on ? { type: 'loop-clock', on: true, a: st.a, len: st.len, fade: st.fade ? st.beat || 0.5 : 0 } : { type: 'loop-clock', on: false };
  }
  function sendClock(force = false) {
    const box = hooks()?.box;
    if (!box) return;
    const m = clockMsg();
    const k = `${sceneId()}|${JSON.stringify(m)}`;
    if (!force && k === S.sent) return;
    S.sent = k;
    box.send(m);
  }
  function hook() {
    if (S.hooked || !player()) return;
    S.hooked = true;
    // another scene (its song or its own timeline loads): its loop, or none
    player().on?.('load', () => setTimeout(() => { sendClock(true); if (S.card && S.card.dataset.scene !== sceneId()) closeCard(); }, 0));
  }
  function onReady() { hook(); sendClock(true); }

  // ---------- keyframes come back round ----------
  function layersNow() {
    const id = sceneId(); const sk = id && ThreeLab.scenes?.get?.(id);
    return sk ? ThreeLab.scenes.layersOf(sk) || [] : [];
  }
  const toKeys = (list) => list.map((k) => ({ time: k.t, value: k.v, ease: k.ease || 'ease' }));
  function closeKeys(d, a, len) {
    const undo = [];
    for (const L of layersNow()) {
      for (const [prop, keys] of Object.entries(L.keys || {})) {
        const next = C().close(keys, a, len);
        if (!next) continue;
        try { d.setKeyframes(L.id, prop.replace(/^s:/, ''), toKeys(next)); undo.push({ layer: L.id, prop: prop.replace(/^s:/, ''), keys: toKeys(keys) }); } catch (e) { console.warn('perfectloop: keys', e); }
      }
    }
    return undo;
  }
  // → the ones that couldn't go back (their slider is gone from the code for now): kept for the next time
  function restoreKeys(d, undo = []) { const left = []; for (const u of undo) { try { d.setKeyframes(u.layer, u.prop, u.keys); } catch { if (layersNow().some((L) => L.id === u.layer)) left.push(u); } } return left; }

  // ---------- make it loop / off ----------
  // o: { bars, secs, fade, quiet, check (default true) }
  async function make(o = {}) {
    const { cmd, d, P } = await lab(o.show !== false);
    await cmd.waitSong?.();
    if (!P.loaded) { try { d.timelineEdit({}); } catch { /* no timeline */ } }
    const id = sceneId();
    if (!id) throw new Error('No scene is open in the Lab.');
    const prev = stateOf(id);
    const song = songOf(P);
    const n = o.n ?? null;
    let p = C().plan({ song, clock: P.clock ? { len: P.clock.seconds } : null, bars: o.bars ?? (song ? n : null) ?? (prev?.kind === 'bars' ? prev.bars : null), secs: o.secs ?? (!song ? n : null) ?? (prev?.kind === 'secs' ? prev.secs : null), at: P.time || 0, F: 30, fade: false });
    if (p.fit && P.isClock && (P.duration || 0) < p.fit - 1e-3) { P.setClockLength(Math.ceil(p.fit)); for (let i = 0; i < 30 && (player().duration || 0) < p.fit - 1e-3; i += 1) await sleep(50); }
    const keep = prev?.on ? prev.undo : { region: P.loop || null, keys: [] };
    // a loop the owner locked stays: it becomes the loop
    if (!P.setLoop(p.a, p.b)) { const r = P.loop; if (r) p = { ...p, a: r.a, len: Math.round((r.b - r.a) * 1e4) / 1e4, b: r.b, L: Math.max(2, Math.round((r.b - r.a) * 30)) }; }
    P.setLoopOn?.(true);
    const before = prev?.undo?.keys || [];
    restoreKeys(d, before); // (a new length: the keys close at the new end)
    const closed = closeKeys(d, p.a, p.len);
    const keys = [...closed, ...before.filter((u) => !closed.some((k) => k.layer === u.layer && k.prop === u.prop))]; // (the keys as they were before any loop)
    const fade = o.fade ?? prev?.fade ?? false;
    const st = { on: true, kind: p.kind, bars: p.bars || null, secs: p.secs || null, a: p.a, len: p.len, beat: p.beat, F: 30, fade: Boolean(fade), undo: { region: keep.region, keys }, check: null, at: Date.now() };
    save(id, st);
    sendClock(true);
    await cmd.run?.(); // setup times line up with the loop's clock
    try { P.seek?.(p.a); if (!P.playing) P.toggle?.(); } catch { /* the timeline stays */ }
    S.last = null;
    if (!o.quiet) toast(`∞ Loops over ${C().label(p)}${closed.length ? ` · ${closed.length} keyframed setting${closed.length === 1 ? '' : 's'} come back round` : ''}`, { timeout: 3500, action: { label: 'Loop off', fn: () => off().catch(err) } });
    if (o.check !== false) { const r = await check({ quiet: true }).catch((e) => { console.warn(e); return null; }); if (r) showCard(); }
    return { plan: p, keys: closed.length, state: stateOf(id) };
  }
  async function off({ quiet = false } = {}) {
    const id = sceneId(); const st = stateOf(id);
    if (!st?.on) return false;
    const { cmd, d, P } = await lab(false);
    const left = restoreKeys(d, st.undo?.keys);
    const r = st.undo?.region;
    P.setLoop(r ? r.a : null, r?.b);
    save(id, { ...st, on: false, undo: left.length ? { region: null, keys: left } : null });
    sendClock(true);
    await cmd.run?.();
    closeCard();
    if (!quiet) toast('∞ Loop off: the scene runs on its own clock again', { timeout: 2500 });
    return true;
  }
  async function setFade(on = true) {
    const id = sceneId(); const st = stateOf(id);
    if (!st?.on) throw new Error('Make it loop first.');
    save(id, { ...st, fade: Boolean(on) });
    sendClock(true);
    paintCard();
    return Boolean(on);
  }

  // ---------- the seamless check ----------
  async function grayOf(buf, w, h) {
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' }));
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h); bmp.close?.();
    const px = g.getImageData(0, 0, w, h).data; const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i += 1) out[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0;
    return out;
  }
  // { quiet } → { seamless, ratio, diff, usual, blended, again, verdict, first, last (pictures), plan }
  function check(o = {}) {
    if (S.busy) return S.busy;
    S.busy = (async () => {
      try { return await checkNow(o); } finally { S.busy = null; }
    })();
    return S.busy;
  }
  async function checkNow({ quiet = false } = {}) {
    const { P } = await lab(false);
    if (typeof LabExport === 'undefined' || !LabExport.probe) throw new Error('The Lab export is not loaded.');
    if (typeof PublishCore === 'undefined') await window.Lazy?.load?.('publishkit');
    const id = sceneId();
    const st = stateOf(id);
    const p = st?.on ? st : (() => { const r = P.loop; if (r) return { a: r.a, len: r.b - r.a, kind: 'secs', secs: r.b - r.a }; return C().plan({ song: songOf(P), clock: P.clock ? { len: P.clock.seconds } : null, at: P.time || 0 }); })();
    const F = p.len <= 10 ? 30 : 15;
    const L = Math.max(3, Math.round(p.len * F));
    const fr = frameSize();
    const w = 72; const h = Math.max(8, Math.round((w * fr.h) / fr.w / 2) * 2);
    const pk = `perfectloop:${Date.now().toString(36)}`;
    window.Progress?.set(pk, { title: '∞ Seamless check', icon: '∞', kind: 'lab-export', pct: 1, label: 'drawing the loop small' });
    let res;
    try {
      res = await LabExport.probe({ w, h, F, n: L + 1, times: (k) => C().frameTime(k, { T0: p.a, F, L }), clock: { on: Boolean(st?.on), a: p.a, len: L / F, fade: 0 }, onFrame: (k, n) => window.Progress?.set(pk, { pct: (k / n) * 95, label: `frame ${k} / ${n}` }) });
      window.Progress?.done(pk);
    } catch (e) { window.Progress?.done(pk, { ok: false, label: 'failed' }); throw e; }
    const grays = [];
    for (const b of res.frames) grays.push(await grayOf(b, w, h));
    const r = C().seam(grays, PublishCore, L);
    if (!r) throw new Error('The loop is too short to check.');
    const pic = (b) => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' }));
    for (const u of [S.last?.first, S.last?.last]) if (u) URL.revokeObjectURL(u);
    S.last = { ...r, scene: id, plan: { a: p.a, len: p.len, kind: p.kind, bars: p.bars, secs: p.secs }, F, L, first: pic(res.frames[0]), last: pic(res.frames[L - 1]), errors: res.errors, at: Date.now() };
    if (st?.on) save(id, { ...stateOf(id), check: { seamless: r.seamless, ratio: r.ratio, diff: r.diff, blended: Boolean(r.blended?.seamless), again: r.again, at: Date.now() } });
    const v = C().verdict(r, Boolean(st?.fade));
    if (!quiet) toast(`∞ ${v.text}: ${v.detail}`, { timeout: 5000 });
    paintCard();
    return { ...summary(), verdict: v };
  }
  function summary() {
    const l = S.last; const st = stateOf();
    if (!l) return null;
    return { seamless: l.seamless, ratio: l.ratio, diff: l.diff, usual: l.usual, blended: l.blended ? { seamless: l.blended.seamless, ratio: l.blended.ratio } : null, again: l.again, frames: l.L, fps: l.F, plan: l.plan, on: Boolean(st?.on), fade: Boolean(st?.fade) };
  }

  // ---------- the card over the preview ----------
  function closeCard() { S.card?.remove(); S.card = null; }
  // the one click that fixes what the check found
  function fixOf(st = stateOf(), l = S.last) {
    if (!st?.on) return { id: 'make', label: '∞ Make it loop', title: 'The timeline loops, the clock follows it, keyframes come back round' };
    if (!l) return { id: 'check', label: 'Check it', title: 'Draws the loop small and compares its last frame with its first' };
    if (l.seamless) return { id: 'render', label: '⇪ Render the loop', title: 'A perfect-loop MP4 of exactly the loop, at the frame size' };
    if (!st.fade) return { id: 'blend', label: '✦ Blend the last beat into the first', title: 'The preview fades its seam; renders cross-fade the last beat into the first frames' };
    return { id: 'ask', label: '✦ Ask the director to make it loop', title: 'It makes the motion itself periodic with loopT / loopNoise (the cost shows first)' };
  }
  async function runFix(id) {
    if (id === 'make') return make();
    if (id === 'check') return check();
    if (id === 'render') return render();
    if (id === 'blend') return setFade(true);
    if (id === 'ask') return ask();
    return null;
  }
  function paintCard() {
    const card = S.card; if (!card) return;
    const st = stateOf(); const l = S.last && S.last.scene === sceneId() ? S.last : null;
    const v = C().verdict(l, Boolean(st?.fade));
    const fx = fixOf(st, l);
    const pics = l ? el('div', { class: 'pl-pics' }, el('figure', {}, el('img', { src: l.last, alt: 'The last frame' }), el('figcaption', { text: 'last frame' })), el('span', { class: 'pl-arrow', text: '→' }), el('figure', {}, el('img', { src: l.first, alt: 'The first frame' }), el('figcaption', { text: 'first frame' }))) : null;
    card.querySelector('.pl-body').replaceChildren(
      el('div', { class: 'pl-len', text: st?.on ? `Loops over ${C().label(st)}${st.fade ? ' · the last beat blends into the first' : ''}` : 'Not looping yet' }),
      el('div', { class: `pl-verdict pl-${v.state}`, title: v.detail || '', text: l ? v.text : S.busy ? 'checking…' : 'not checked yet' }),
      l ? el('small', { class: 'pl-detail', text: v.detail }) : '',
      pics || '');
    const b = card.querySelector('.pl-fix');
    b.textContent = fx.label; b.title = fx.title; b.dataset.fix = fx.id;
    card.querySelector('.pl-blend').hidden = !st?.on || !st.fade;
    card.querySelector('.pl-off').hidden = !st?.on;
  }
  function showCard() {
    const host = ThreeLab.scenes?.previewHost?.() || hooks()?.host;
    if (!host) return;
    closeCard();
    const fix = el('button', { type: 'button', class: 'lm-btn lm-ask pl-fix', on: { click: (e) => { const b = e.currentTarget; b.disabled = true; runFix(b.dataset.fix).catch(err).finally(() => { b.disabled = false; paintCard(); }); } } });
    S.card = el('div', { class: 'pl-card', dataset: { scene: sceneId() || '' }, attrs: { 'aria-label': 'Make it loop' }, on: { contextmenu: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeCard(); } } } },
      el('div', { class: 'lm-head' }, el('b', { text: '∞ Perfect loop' }), el('span', { class: 'lm-src', text: 'checked here, no tokens' }),
        el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (the loop stays)', on: { click: () => closeCard() } })),
      el('div', { class: 'pl-body' }),
      el('div', { class: 'lm-acts' }, fix,
        el('button', { type: 'button', class: 'lm-btn pl-recheck', text: 'Check again', title: 'Draws the loop small again (after a change)', on: { click: () => check().catch(err) } }),
        el('button', { type: 'button', class: 'lm-btn pl-blend', text: 'No blend', title: 'Back to a plain cut at the seam', on: { click: () => setFade(false).catch(err) } }),
        el('button', { type: 'button', class: 'lm-btn pl-off', text: 'Loop off', title: 'The scene runs on its own clock again; keyframes and the timeline loop as before', on: { click: () => off().catch(err) } })));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(S.card);
    paintCard();
  }

  // ---------- render ----------
  // o: { format: 'loop' | 'gif', size, fps, sound (default: the song when the scene has one), name, quiet }
  async function render(o = {}) {
    if (!stateOf()?.on) await make({ check: false, quiet: true });
    const st = stateOf(); const P = player();
    if (typeof LabExport === 'undefined') throw new Error('The Lab export is not loaded.');
    const name = `${hooks()?.sketchName?.() || 'Lab'} loop`;
    const res = await LabExport.render({ format: o.format || 'loop', source: 'scene', at: st.a, secs: st.len, fade: st.fade ? st.beat || 0.5 : 0, perfect: true, name, size: o.size || undefined, fps: o.fps || undefined, quiet: true });
    let out = res.path;
    const song = songOf(P);
    if (song?.path && (o.format || 'loop') === 'loop' && o.sound !== false) out = await withSound(out, song.path, st).catch((e) => { console.warn('perfectloop: sound', e); return out; });
    S.made.add(out);
    if (!o.quiet) toast(`∞ Perfect loop ready: ${base(out)} (${C().label(st)})`, { timeout: 7000, action: typeof PublishKit !== 'undefined' || window.Lazy ? { label: '📮 Post', fn: () => openPost(out) } : undefined });
    return { ...res, path: out, loop: { ...res.loop, a: st.a, len: st.len, blend: st.fade } };
  }
  async function openPost(file) { if (typeof PublishKit === 'undefined') await window.Lazy?.load?.('publishkit'); return PublishKit.open(file, {}); }
  // the song's bars under the loop (the same N bars: the music loops too)
  async function withSound(video, songPath, st) {
    if (typeof Renders === 'undefined') await window.Lazy?.load?.('renders');
    const output = video.replace(/(\.[^.]+)$/, ' + sound$1');
    const id = `pl${Date.now().toString(36)}`;
    const t = (x) => (Math.round(x * 1e4) / 1e4).toFixed(4);
    await Renders.transcode({ id, input: video, output, duration: st.len, args: ['-hide_banner', '-y', '-i', 'INPUT', '-ss', t(st.a), '-t', t(st.len), '-i', songPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', t(st.len), '-movflags', '+faststart', 'OUTPUT'] }, undefined, { title: `∞ Loop + its bars · ${base(video)}`, owner: 'perfectloop', quiet: true });
    const r = await Renders.whenDone(id);
    if (r.code !== 0) throw new Error(r.error || 'the sound could not be added');
    window.hub.fs.trash?.([video]).catch(() => {});
    return r.output || output;
  }
  // what export renders need (tools/three-export.js): the scene's loop clock for its helpers (a perfect loop: exactly
  // its frames long)
  function clockFor(o, loop) {
    const st = stateOf();
    if (st?.on) return { on: true, a: st.a, len: o?.perfect && loop ? loop.L / (o.F || 30) : st.len, fade: 0 };
    const r = player()?.loop;
    return r ? { on: false, a: r.a, len: r.b - r.a, fade: 0 } : null;
  }

  // ---------- Ready to post: a Lab render's loop fix renders the scene again as a perfect loop ----------
  function isLabRender(pk) {
    if (!pk?.file || typeof ThreeLab === 'undefined' || !ThreeLab.peek?.()) return false;
    if (S.made.has(pk.file)) return true;
    if (pk.o?.job && pk.o.job.kind !== 'export') return false;
    const name = hooks()?.sketchName?.(); if (!name) return false;
    const safe = (typeof LabExportCore !== 'undefined' ? LabExportCore.safe(name) : name).toLowerCase();
    return base(pk.file).toLowerCase().startsWith(safe);
  }
  async function forPost(pk) {
    const d = Number(pk.info?.duration) || 0;
    const P = player(); const song = songOf(P);
    const st0 = stateOf();
    if (!st0?.on) {
      if (song) await make({ bars: Math.max(1, Math.min(16, Math.round(d / C().barLen(song.bpm, song.bpb)) || 4)), check: false, quiet: true, show: false });
      else await make({ secs: Math.max(2, Math.round(d) || 8), check: false, quiet: true, show: false });
    }
    const r = await check({ quiet: true }).catch(() => null);
    if (r && !r.seamless && !stateOf()?.fade) await setFade(true);
    const w = pk.info?.w; const h = pk.info?.h;
    return render({ size: w && h ? { w, h } : undefined, fps: pk.info?.fps ? Math.round(pk.info.fps) : undefined, quiet: true });
  }

  // ---------- the director ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function ask(words = '', { agentId = null, confirm = true } = {}) {
    const dir = agentId ? (H.agent?.(agentId) || { id: agentId, name: 'The director' }) : directorOf();
    if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    const st = stateOf();
    const text = C().brief({ len: st?.len, kind: st?.kind, bars: st?.bars, verdictText: C().verdict(S.last, Boolean(st?.fade)).text, words });
    const c = C().cost(text);
    if (confirm && !(await Modal.confirm('Ask the director to make the motion loop?', `${dir.name} gets a short brief (the loop, the check, the loop helpers)${words ? ' and your words' : ''}: ≈${c} tokens with this message, plus its reply and the work it does.`, { ok: `Ask (≈${c} tokens)` }))) return false;
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    await Native.send(dir.id, text);
    return true;
  }
  // three_do loop {bars | secs | off | check | render | fade | status}
  async function tool(_t, a = {}) {
    try {
      if (a.off) { await off({ quiet: true }); return { ok: true, value: 'Loop off: the scene runs on its own clock again.' }; }
      const want = a.bars != null || a.secs != null || (!stateOf()?.on && !a.status);
      if (want) { const r = await make({ bars: a.bars, secs: a.secs, fade: a.fade, quiet: true, check: false, show: false }); if (!a.check && !a.render) return { ok: true, value: `Loops over ${C().label(r.plan)} (from ${r.plan.a} s); ${r.keys} keyframed setting(s) closed. Code: loopT() / loopSin(n) / loopNoise(x, y) (help loop); check: true says if it's seamless.` }; }
      if (a.fade != null && !want) await setFade(Boolean(a.fade));
      if (a.check) { const r = await check({ quiet: true }); return { ok: true, value: `${r.verdict.text}: ${r.verdict.detail}. Loop ${C().label(stateOf())}${stateOf()?.fade ? ', blended' : ''}.${r.seamless ? '' : ' Fix: fade: true (blend the last beat), or make the motion periodic (help loop).'}` }; }
      if (a.render) { const r = await render({ format: a.render === 'gif' ? 'gif' : 'loop', quiet: true }); return { ok: true, value: { file: r.path, frames: r.frames, seconds: stateOf()?.len } }; }
      const st = stateOf();
      return { ok: true, value: st?.on ? { loop: C().label(st), start: st.a, length: st.len, blend: st.fade, check: st.check || 'not checked' } : 'Not looping (three_do loop {bars | secs} makes it loop).' };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ---------- ways in ----------
  function item() {
    const st = stateOf(); const P = player();
    const song = Boolean(songOf(P));
    const lens = song ? C().BARS.map((n) => ({ label: `${n} bar${n === 1 ? '' : 's'}${n === 4 ? ' (good for Shorts)' : ''}`, cmd: 'make-loop', action: () => make({ bars: n }).catch(err) }))
      : C().SECS.map((n) => ({ label: `${n} s`, cmd: 'make-loop', action: () => make({ secs: n }).catch(err) }));
    if (!st?.on) return { label: '∞ Make it loop', hint: song ? 'over N bars of the song · seamless check' : 'over N seconds · seamless check', items: () => lens };
    return { label: '∞ Make it loop', hint: `${C().label(st)}${st.check ? ` · ${st.check.seamless || (st.fade && st.check.blended) ? '≈ seamless' : 'a jump'}` : ''}`, items: () => [
      { label: 'Is it seamless?', hint: 'compares the last frame with the first', cmd: 'make-loop', action: () => check().then(() => showCard()).catch(err) },
      { label: st.fade ? '✓ The last beat blends into the first' : 'Blend the last beat into the first', hint: st.fade ? 'again: a plain cut' : 'for what can\'t loop by itself', cmd: 'make-loop', action: () => setFade(!st.fade).catch(err) },
      { label: '⇪ Render the loop', hint: 'a perfect-loop MP4', cmd: 'make-loop', action: () => render().catch(err) },
      { label: 'Render as a GIF', cmd: 'make-loop', more: true, action: () => render({ format: 'gif' }).catch(err) },
      { label: 'Another length', items: () => lens },
      { label: 'Show the card', cmd: 'make-loop', action: () => showCard() },
      { label: 'Loop off', cmd: 'make-loop', action: () => off().catch(err) },
    ] };
  }
  async function mission(agentId, text = '') {
    const want = C().parse(text);
    try {
      await make({ bars: want.bars, secs: want.secs, n: want.n, fade: want.fade, quiet: true, check: false });
      const r = await check({ quiet: true });
      showCard();
      if (r.seamless) { toast(`∞ ${r.verdict.text}: nothing more to do (0 tokens)`, { timeout: 4000 }); return true; }
      const sent = await ask(text.replace(/\b\d+(?:\.\d+)?\s*(?:bars?|s|sec|secs|seconds?)\b/gi, '').trim(), { agentId });
      if (!sent) { await setFade(true); toast('∞ The last beat blends into the first instead (no tokens)', { timeout: 4000 }); if (text) Native.setDraft?.(agentId, text); }
    } catch (e) { err(e); }
    return true;
  }
  function register() {
    if (typeof Missions !== 'undefined' && Missions.add) {
      Missions.add({ id: 'lab-loop', icon: '∞', label: 'Make it loop', when: (id) => H.agent?.(id)?.dock === 'three',
        desc: 'The scene loops perfectly over N bars of the song (say "4 bars" or "8 s"): the timeline wraps, keyframes come back round, a seamless check. Only if it still jumps, the director makes the motion loop (cost shown first).',
        submit: (agent, text) => { mission(agent, text); return true; } });
    }
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Make it loop (∞ perfect loop, seamless check)', () => make().catch(err));
    if (typeof HubBridge !== 'undefined') HubBridge.register(['three_loop'], tool);
    if (typeof Commands === 'undefined' || Commands.get?.('make-loop')) return;
    Commands.register({
      name: 'make-loop', aliases: ['perfect-loop'], area: 'Three.js Lab',
      args: '[N bars | N s | check | blend | no blend | render [gif] | off | status]',
      desc: 'Make the Lab scene loop perfectly: the timeline loops over N bars of the song (or N seconds), the preview\'s and renders\' clock wraps with it, keyframes come back round; check: ≈ seamless or a visible jump (last frame vs first); blend: the last beat cross-fades into the first; render: a perfect-loop MP4 (with its bars of the song)',
      keywords: 'loop loops looping perfect seamless seam shorts reels tiktok gif wrap periodic cycle repeat bars crossfade blend',
      examples: ['/make-loop', '/make-loop 4 bars', '/make-loop 8 s', '/make-loop check', '/make-loop blend', '/make-loop render', '/make-loop off'],
      complete: (x) => ['4 bars', '2 bars', '8 bars', '8 s', 'check', 'blend', 'no blend', 'render', 'render gif', 'off', 'status'].filter((v) => v.startsWith(String(x || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const w = C().parse(args);
        if (w.off) return (await off({ quiet: true })) ? '∞ Loop off: the scene runs on its own clock again.' : 'It wasn\'t looping.';
        if (w.status) { const st = stateOf(); return st?.on ? `∞ Loops over ${C().label(st)}${st.fade ? ', the last beat blended' : ''}${st.check ? ` · ${C().verdict(st.check, st.fade).text}` : ''}` : 'Not looping.'; }
        if (w.bars != null || w.secs != null || w.n != null || !stateOf()?.on) { const r = await make({ bars: w.bars, secs: w.secs, n: w.n, fade: w.fade, quiet: true, check: false }); if (!w.check && !w.render) { check({ quiet: true }).then(() => showCard()).catch(() => {}); return `∞ Loops over ${C().label(r.plan)}${r.keys ? ` · ${r.keys} keyframed setting${r.keys === 1 ? '' : 's'} come back round` : ''}. Checking if it's seamless…`; } } else if (w.fade != null) await setFade(w.fade);
        if (w.check) { const r = await check({ quiet: true }); showCard(); return `∞ ${r.verdict.text}: ${r.verdict.detail}`; }
        if (w.render) { const r = await render({ format: w.render, quiet: true }); return `∞ Perfect loop: ${r.path}`; }
        if (w.fade != null) return w.fade ? '∞ The last beat blends into the first (preview and renders).' : '∞ A plain cut at the seam.';
        return 'Say: 4 bars, 8 s, check, blend, render or off.';
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();

  return { make, off, check, setFade, render, ask, mission, item, tool, clockFor, isLabRender, forPost, onReady, showCard, closeCard, state: () => stateOf(), summary, get card() { return S.card; }, get busy() { return S.busy; }, _S: S };
})();
window.PerfectLoop = PerfectLoop;
