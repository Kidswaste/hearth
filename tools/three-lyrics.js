// 🎤 Lyrics synced to the song (round 133, lyrics133). docs/upgrades/lyrics133.md
// One small fold-away card (Sections ▾ › 🎤 Lyrics…, ＋ Add › 🅰 Type › 🎤 Lyrics synced…, a lyrics layer's right-click,
// /lyrics-sync, Ctrl/⌘+K) and one thin lane under the song, built on what the Lab had:
//   · lyrics in: paste (one line per line), or open an .lrc / .srt / .txt (TypeLyrics.parse, round 25); kept with the
//     scene (sketch.lyrics, ThreeLab.stageHooks.setLyrics) and in the 🅰 lyrics layer's code when there is one
//   · timing: an .lrc keeps its times; ✦ Auto-time puts the lines on the song's bars and sections by syllables, locally
//     (tools/three-lyrics-core.js, no AI); 🎤 Tap to time: the song plays, Space at each line start, snapped to the beat
//     grid (Backspace back, Enter keep, Esc cancel)
//   · the lane: each line a small block under the song; drag one (on the beat; Alt: free), click to hear it. Every
//     change here is ONE undo step (the Lab's Ctrl/⌘+Z, LabDirect.push, the timeline's own undo with a song)
//   · the layer: "＋ Add a lyrics layer" is a 🅰 type layer (LabType.codeFor) in a style from a compact list with live
//     previews (karaoke, word on the beat, fades, punchy…), coloured from the scene's palette; sliders for size,
//     position and the kick
//   · Per section (free): calm where it's quiet, punchy on the drops, as hold keyframes on the layer's own sliders.
//     ✦ Style the lyrics: the director picks per section with three_keyframes (no new tool) after the cost is shown;
//     its reply is one undo step (LabTxn). Nothing is sent without that click.
// Lazy group "lyrics" (after lab).
const LabLyrics = (() => {
  const C = () => LyricsCore;
  const LY = () => TypeLyrics;
  const LT = () => LabType;
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks || {} : {});
  const D = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director : null);
  const player = () => hk().player || null;
  const sid = () => hk().sketchId?.() || null;
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  const S = { pop: null, lane: null, track: null, hooked: null, view: null, ver: 0, sig: '', tick: 0, tap: null, drag: null, raf: 0 };
  const stats = { writes: 0, undos: 0, asked: 0, taps: 0 };

  // ---------- the lines: the lyrics layer's (when there is one), else the scene's ----------
  const isLyr = (code) => { try { return Array.isArray(LT().optsOf(code).lyrics); } catch { return false; } };
  const host = () => window.LabMatHook?.host?.() || null; // the Lab's layers (raw: id, name, code) and selection
  const codeOf = (id) => host()?.layerById(id)?.code ?? D()?.codeOf(id)?.code ?? '';
  function layer() {
    const h = host(); if (!h) return null;
    let rows = []; try { rows = (h.layers() || []).filter((L) => LT().isType(L.code) && isLyr(L.code)); } catch { rows = []; }
    const sel = h.sel?.()?.id;
    const L = rows.find((r) => r.id === sel) || rows[rows.length - 1] || null;
    return L ? { id: L.id, name: L.name } : null;
  }
  function now() {
    const L = layer();
    const sc = hk().lyrics?.() || null;
    if (L) { let o = {}; try { o = LT().optsOf(codeOf(L.id)); } catch { o = {}; } return { L, kind: sc?.kind || 'layer', lines: LY().unpack(o.lyrics) }; }
    return { L: null, kind: sc?.kind || null, lines: sc ? LY().unpack(sc.lines) : [] };
  }
  // the song as LabType.music() reads it, from the Lab's own player (also while a chat is on screen beside the dock)
  function music() {
    const P = player();
    if (!P?.loaded || P.isClock || !P.duration) { try { return LT().music(); } catch { return null; } }
    const a = P.analysis || {};
    return { duration: P.duration, bpm: P.bpm, bpb: P.beatsPerBar || 4, downbeat: P.downbeat ?? 0, beats: P.beatsIn(0, P.duration), sections: (a.sections || []).map((x) => ({ start: x.start, end: x.end, label: x.label, energy: x.energy })) };
  }
  const palette = () => { try { return ThreeLab.scenes?.get(sid())?.palette || null; } catch { return null; } };
  async function call(tool, args) { const r = await HubBridge.call(tool, args, { chatId: null }); if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`); return r.value; }
  const setCode = (L, code) => call('three_update_layer', { layer: L.id, code, wait: 0.5 });

  // one undo step: the scene's lyrics, the layer's code and keys as they were
  function snapshot(L = layer(), props = []) {
    return { sid: sid(), scene: hk().lyrics?.() || null, lid: L?.id || null, code: L ? codeOf(L.id) : null, keys: L ? Object.fromEntries(props.map((p) => [p, hk().keysOf(L.id, p)])) : {} };
  }
  function pushUndo(before, label) {
    const fn = () => {
      if (before.sid !== sid()) { toast('That lyrics change was in another scene.', { timeout: 2000 }); return false; }
      stats.undos += 1;
      hk().setLyrics?.(before.scene);
      if (before.lid && hk().layerById?.(before.lid)) {
        for (const [p, keys] of Object.entries(before.keys || {})) hk().setKeys(before.lid, p, keys);
        if (codeOf(before.lid) !== before.code) setCode({ id: before.lid }, before.code).then(changed).catch(err);
      }
      changed();
      return true;
    };
    if (!window.LabDirect?.push?.(null, `🎤 ${label}`, fn)) S.fallback = fn;
  }
  // new lines into the scene and the layer: one undo step
  async function write(lines, label, { kind = null, undo = true } = {}) {
    const L = layer();
    const before = snapshot(L);
    const pk = LY().pack(lines);
    hk().setLyrics?.({ kind: kind || hk().lyrics?.()?.kind || 'plain', lines: pk });
    if (undo) pushUndo(before, label); // (the step is there at once: a quick Ctrl/⌘+Z never undoes the step before it)
    if (L) await setCode(L, LT().setOpts(codeOf(L.id), (o) => { o.lyrics = pk; delete o.text; }));
    stats.writes += 1;
    changed();
    return { lines: lines.length };
  }

  // ---------- lyrics in ----------
  async function take(text, name = '', { label = 'Lyrics in' } = {}) {
    const r = C().read(text, name);
    if (!r.lines.length) throw new Error('No lyric lines in there (one line of lyrics per line).');
    let lines = r.lines; let how = `${lines.length} lines, times from the ${r.kind === 'lrc' ? '.lrc' : r.kind === 'srt' ? 'subtitles' : 'file'}`;
    if (!r.timed) { const a = C().autoTime(lines, music() || { duration: Math.max(20, lines.length * 3), bpm: 120 }); lines = a.lines; how = `${a.how}${music() ? '' : ' (no song yet: on a 120 BPM grid)'}`; }
    await write(lines, label, { kind: r.kind });
    toast(`🎤 ${how} · drag a block to adjust, Ctrl/⌘+Z undoes`, { timeout: 3200 });
    return { lines: lines.length, how, kind: r.kind };
  }
  async function paste() {
    const cur = now().lines.map((L) => L.text).join('\n');
    const t = await Modal.prompt('🎤 Lyrics: one line of the song per line', { multiline: true, value: cur, label: 'Paste the lyrics (or an .lrc with its times)' });
    if (t == null || !String(t).trim()) return null;
    return take(t, '', { label: 'Lyrics pasted' });
  }
  async function openFile(path = null) {
    let p = path;
    if (!p) [p] = (await window.hub.openDialog({ title: 'Lyrics (.lrc, .txt, .srt)', filters: [{ name: 'Lyrics', extensions: ['lrc', 'txt', 'srt', 'vtt'] }] })) || [];
    if (!p) return null;
    const text = await window.hub.fs.read(p);
    return take(typeof text === 'string' ? text : String(text?.text ?? text ?? ''), p, { label: 'Lyrics from a file' });
  }

  // ---------- timing ----------
  async function autoTime() {
    const { lines } = now();
    if (!lines.length) throw new Error('Paste the lyrics first.');
    const m = music();
    if (!m) throw new Error('Load the song first (🎵 in the Lab timeline): ✦ Auto-time follows its bars and sections.');
    const r = C().autoTime(lines, m);
    await write(r.lines, 'Auto-timed lyrics');
    toast(`✦ ${r.how}`, { timeout: 2600 });
    return r;
  }
  function tapStrip() {
    const T = S.tap; if (!T) return;
    const L = T.lines[T.i];
    T.el.firstChild.textContent = L ? `🎤 ${T.i + 1}/${T.lines.length} “${L.text.slice(0, 50)}” · Space at its start` : `🎤 All ${T.lines.length} lines tapped · Enter keeps them`;
  }
  function tapStart({ play = true } = {}) {
    const { lines } = now();
    if (!lines.length) throw new Error('Paste the lyrics first.');
    const P = player();
    if (!P?.loaded) throw new Error('Load the song first: tap to time plays it.');
    if (S.tap) tapStop(false);
    const box = el('div', { class: 'ly-tap', attrs: { role: 'status' } }, el('span', { text: '' }), el('span', { class: 'hint', text: ' · ⌫ back · Enter keep · Esc cancel' }));
    document.body.append(box);
    S.tap = { lines: lines.map((x) => ({ ...x })), i: 0, tapped: new Set(), hist: [], el: box, before: snapshot() };
    const onKey = (e) => {
      if (!S.tap) return;
      const k = e.key;
      if (k === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); tapAt(P.time ?? 0); } else if (k === 'Backspace') { e.preventDefault(); e.stopPropagation(); tapBack(); } else if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); tapStop(true).catch(err); } else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); tapStop(false).catch(err); }
    };
    addEventListener('keydown', onKey, true);
    S.tap.off = () => removeEventListener('keydown', onKey, true);
    tapStrip();
    if (play && !P.playing) { try { P.seek(Math.max(0, (lines[0]?.a ?? 1) - 2)); P.toggle(true); } catch { /* the player decides */ } }
    return { lines: lines.length };
  }
  function tapAt(t) {
    const T = S.tap; if (!T || T.i >= T.lines.length) return null;
    T.hist.push(T.lines);
    const r = C().tapAt(T.lines, T.i, t, music(), T.tapped);
    T.lines = r.lines; T.tapped.add(T.i); T.i += 1; stats.taps += 1;
    tapStrip(); S.ver += 1; layout();
    return { line: T.i - 1, at: r.at };
  }
  function tapBack() { const T = S.tap; if (!T || !T.hist.length) return; T.lines = T.hist.pop(); T.i = Math.max(0, T.i - 1); T.tapped.delete(T.i); tapStrip(); S.ver += 1; layout(); }
  async function tapStop(keep = true) {
    const T = S.tap; if (!T) return null;
    S.tap = null; T.off?.(); T.el.remove();
    try { if (player()?.playing) player().toggle(false); } catch { /* fine */ }
    if (keep && T.tapped.size) { await write(T.lines, `Tapped ${T.tapped.size} line${T.tapped.size === 1 ? '' : 's'}`); toast(`🎤 ${T.tapped.size} line${T.tapped.size === 1 ? '' : 's'} on the beat · one Ctrl/⌘+Z undoes`, { timeout: 2200 }); } else changed();
    return { kept: keep, tapped: T.tapped.size, lines: T.lines };
  }
  async function moveLine(i, a, { snap = true } = {}) {
    const { lines } = now();
    if (!lines[i]) return null;
    const next = C().move(lines, i, a, music(), { snap });
    if (next[i].a === lines[i].a) { changed(); return { line: i, at: lines[i].a, moved: false }; }
    await write(next, `Moved “${lines[i].text.slice(0, 24)}”`);
    return { line: i, at: next[i].a, moved: true };
  }

  // ---------- the layer, its style and sliders ----------
  async function addLayer(style = 'karaoke') {
    const { lines } = now();
    if (!lines.length) throw new Error('Paste the lyrics first.');
    const ex = layer(); if (ex) return applyStyle(style);
    const p = LT().preset('karaoke');
    const code = LT().codeFor(p, { name: 'Lyrics', sliders: C().styleValues(style, palette()), opts: { lyrics: LY().pack(lines) } });
    const before = snapshot(null);
    const out = await call('three_add_layer', { name: '🅰 Lyrics', code, wait: 1.2 });
    const row = (host()?.layers() || []).find((r) => r.name === (out?.added || '🅰 Lyrics'));
    hk().setLyrics?.({ kind: before.scene?.kind || 'plain', lines: LY().pack(lines) });
    if (row) {
      window.LabDirect?.push?.(null, '🎤 Lyrics layer added', () => { if (before.sid !== sid()) return false; stats.undos += 1; hk().setLyrics?.(before.scene); call('three_remove_layer', { layer: row.id }).then(changed).catch(err); return true; });
    }
    changed();
    toast(`🎤 Lyrics layer added · ${C().styleOf(style)?.name || style}`, { timeout: 2000 });
    return { layer: row?.name || '🅰 Lyrics', id: row?.id || null, style };
  }
  async function applyStyle(style) {
    const L = layer(); if (!L) return addLayer(style);
    const v = C().styleValues(style, palette());
    if (!v) throw new Error(`Styles: ${C().STYLES.map((s) => s.id).join(', ')}`);
    const before = snapshot(L);
    let code = codeOf(L.id);
    for (const [k, x] of Object.entries(v)) code = LT().setValue(code, k, x).code;
    pushUndo(before, `Lyrics style: ${C().styleOf(style).name}`);
    await setCode(L, code);
    changed();
    return { layer: L.name, style };
  }
  async function setSlider(key, value) {
    const L = layer(); if (!L) throw new Error('Add a lyrics layer first.');
    const before = snapshot(L);
    const code = LT().setValue(codeOf(L.id), key, value).code;
    pushUndo(before, `Lyrics ${key}`);
    await setCode(L, code);
    return { key, value };
  }
  const has = (code, k) => new RegExp(`^[ \\t]*${k}\\s*:\\s*\\{\\s*value\\s*:`, 'm').test(code);
  // calm where it's quiet, punchy on the drops: hold keyframes on the layer's own sliders (free, one undo)
  async function perSection(picks = {}) {
    const L = layer(); if (!L) throw new Error('Add a lyrics layer first.');
    const m = music(); const secs = m ? C().sectionsOf(m) : [];
    if (!secs.length) throw new Error('The song has no sections yet (load it and let it be analyzed).');
    const plan = C().sectionPlan(secs, picks);
    const props = Object.keys(plan).map((k) => `s:${k}`);
    const before = snapshot(L, props);
    let code = codeOf(L.id); const code0 = code;
    for (const k of Object.keys(plan)) if (!has(code, k)) code = LT().setValue(code, k, C().BASEV[k]).code;
    pushUndo(before, 'Lyrics styled per section');
    if (code !== code0) await setCode(L, code);
    for (const k of Object.keys(plan)) hk().setKeys(L.id, `s:${k}`, plan[k]);
    changed();
    const words = secs.map((s) => `${s.name}: ${C().styleOf(picks[s.name] || C().pick(s)).name}`).join(' · ');
    toast(`🎤 ${words}`, { timeout: 3200 });
    return { sections: secs.length, words };
  }

  // ---------- ✦ Style the lyrics: the director, the cost first ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || H.agents().find((a) => a.threeTools) || null;
  function askText() {
    const L = layer(); if (!L) throw new Error('Add a lyrics layer first.');
    const m = music(); const secs = m ? C().sectionsOf(m) : [];
    if (!secs.length) throw new Error('The song has no sections yet (load it and let it be analyzed).');
    return C().askText({ layer: L.name, sections: secs, lines: now().lines });
  }
  async function ask({ confirm = true } = {}) {
    const dir = directorOf();
    if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    const L = layer(); const text = askText();
    const c = C().estimate(text.length);
    if (confirm && !(await Modal.confirm('✦ Style the lyrics with the AI?', `${dir.name} gets the song's sections and the lyric styles (≈${c.toLocaleString()} tokens with its reply) and picks a style per section, as keyframes on "${L.name}". Its whole answer is one undo step (↶ in the dock).`, { ok: `Style them (≈${c.toLocaleString()} tokens)` }))) return false;
    // the sliders it keyframes exist on the layer (a lyrics layer made elsewhere): your own step, before it answers
    let code = codeOf(L.id); const code0 = code;
    for (const k of C().SECTION_KEYS) if (!has(code, k)) code = LT().setValue(code, k, C().BASEV[k]).code;
    if (code !== code0) { pushUndo(snapshot(L), 'Lyrics sliders'); await setCode(L, code); }
    stats.asked += 1;
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    await Native.send(dir.id, text);
    return true;
  }

  // ---------- the lane under the song ----------
  function hook() {
    const P = player();
    if (!P?.addHooks || S.hooked === P) return;
    S.hooked = P;
    P.addHooks({
      frameKey: () => (S.lane ? `ly${S.ver}` : ''),
      drawOver: (g, { X, s0, sp, w }) => {
        const v = S.view;
        S.view = { X, s0, sp, w };
        if (!v || v.s0 !== s0 || v.sp !== sp || v.w !== w) { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(layout); }
      },
    });
  }
  function ensureLane(show) {
    const P = player();
    if (!show || !P?.el) { if (S.lane) { S.lane.remove(); S.lane = null; S.track = null; } return null; }
    hook();
    if (!S.lane || !S.lane.isConnected || S.lane.parentElement !== P.el) {
      S.lane?.remove();
      S.track = el('div', { class: 'ly-track' });
      S.lane = el('div', { class: 'ly-lane', title: '' },
        el('button', { type: 'button', class: 'ghost small ly-head', text: '🎤', title: 'Lyrics: paste, time, style (the card)', on: { click: (e) => { e.stopPropagation(); toggle(e.currentTarget); } } }),
        S.track);
      const wrap = P.el.querySelector('.mb-tl-wrap');
      if (wrap?.nextSibling) P.el.insertBefore(S.lane, wrap.nextSibling); else P.el.append(S.lane);
      S.view = null; P.redraw?.();
    }
    return S.lane;
  }
  function linesShown() { return S.tap ? S.tap.lines : now().lines; }
  function layout() {
    if (!S.lane || !S.track) return;
    const P = player(); const V = S.view;
    const lines = linesShown();
    const canvas = P?.el?.querySelector('.mb-tl-wrap canvas');
    if (!V || !canvas) return;
    const off = S.track.getBoundingClientRect().left - canvas.getBoundingClientRect().left;
    const cur = C().lineAt(lines, P?.time ?? 0);
    const kids = [...S.track.children];
    lines.forEach((L, i) => {
      let b = kids[i];
      if (!b) { b = el('div', { class: 'ly-blk', dataset: { i: String(i) } }); b.addEventListener('pointerdown', down); S.track.append(b); }
      b.dataset.i = String(i);
      const vis = L.a != null && L.a < V.s0 + V.sp && (L.b ?? L.a + 2) > V.s0;
      b.hidden = !vis;
      if (!vis) return;
      const x0 = V.X(L.a) - off; const x1 = V.X(L.b ?? L.a + 2) - off;
      b.style.left = `${Math.round(x0)}px`; b.style.width = `${Math.max(6, Math.round(x1 - x0) - 1)}px`;
      if (b.textContent !== L.text) b.textContent = L.text;
      b.title = `${L.text}\n${C().fmt(L.a)} – ${C().fmt(L.b ?? L.a + 2)} · drag to move (on the beat; Alt: free) · click to hear it`;
      b.classList.toggle('on', i === cur);
      b.classList.toggle('tapped', Boolean(S.tap?.tapped.has(i)));
    });
    for (let i = lines.length; i < kids.length; i += 1) kids[i].remove();
  }
  function down(e) {
    if (e.button !== 0 || S.tap) return;
    const b = e.currentTarget; const i = Number(b.dataset.i);
    const L = now().lines[i]; const V = S.view;
    if (!L || !V) return;
    e.preventDefault(); e.stopPropagation();
    try { b.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ }
    const x0 = e.clientX; const left0 = parseFloat(b.style.left) || 0;
    S.drag = { i, a0: L.a, moved: false };
    const move = (ev) => { const dx = ev.clientX - x0; if (Math.abs(dx) > 2) S.drag.moved = true; b.style.left = `${left0 + dx}px`; b.classList.add('drag'); };
    const up = (ev) => {
      b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); b.classList.remove('drag');
      const d = S.drag; S.drag = null;
      if (!d?.moved) { try { player()?.seek(L.a); } catch { /* fine */ } layout(); return; }
      const dt = ((ev.clientX - x0) * V.sp) / Math.max(1, V.w);
      moveLine(i, d.a0 + dt, { snap: !ev.altKey }).catch(err);
    };
    b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  function changed() {
    S.ver += 1;
    const lines = linesShown();
    ensureLane(lines.length > 0);
    layout();
    player()?.redraw?.();
    paint();
  }
  // the lane follows the scene: another scene, lines changed elsewhere (/lyrics, the 🅰 menu), the playhead's line
  function watch() {
    if (S.tick) return;
    S.tick = setInterval(() => {
      const P = player();
      if (!P?.el?.isConnected) return;
      if (!P.el.offsetParent && !S.pop) return;
      const lines = linesShown();
      const sig = `${sid()}|${lines.map((L) => `${L.a}:${L.b}:${L.text}`).join('|')}`;
      if (sig !== S.sig) { S.sig = sig; changed(); return; }
      if (S.lane) { const cur = C().lineAt(lines, P.time ?? 0); const on = S.track.querySelector('.ly-blk.on'); if (Number(on?.dataset.i ?? -1) !== cur) layout(); }
    }, 400);
  }

  // ---------- the card ----------
  const b = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); try { const r = fn(e); if (r?.catch) r.catch(err); } catch (x) { err(x); } } } });
  function toggle(anchor = null) { if (S.pop) { close(); return null; } return open(anchor); }
  function open(anchor = null) {
    watch();
    if (!S.pop) {
      S.pop = el('div', { class: 'ly-pop', attrs: { role: 'dialog', 'aria-label': 'Lyrics' } });
      S.pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      document.body.append(S.pop);
    }
    const r = (anchor?.getBoundingClientRect?.() || S.lane?.getBoundingClientRect() || player()?.el?.getBoundingClientRect() || { left: 80, top: 200, bottom: 200 });
    const W = 330;
    S.pop.style.left = `${Math.max(8, Math.min(innerWidth - W - 8, r.left))}px`;
    const below = r.bottom + 6; const H0 = 380;
    S.pop.style.top = `${below + H0 < innerHeight ? below : Math.max(8, r.top - H0 - 6)}px`;
    changed();
    return S.pop;
  }
  function close() { cancelAnimationFrame(S.prevRaf); S.pop?.remove(); S.pop = null; }
  function slider(L, key, label, min, max, step) {
    const c = hk().ctlOf?.(L.id); let v = null;
    try { v = c?.controls().find((x) => x.key === key)?.value; } catch { v = null; }
    if (typeof v !== 'number') { const m = new RegExp(`^[ \\t]*${key}\\s*:\\s*\\{\\s*value\\s*:\\s*(-?[\\d.]+)`, 'm').exec(codeOf(L.id)); v = m ? Number(m[1]) : (min + max) / 2; }
    const out = el('span', { class: 'ly-v', text: String(Math.round(v * 100) / 100) });
    const inp = el('input', { type: 'range', min, max, step, value: v, dataset: { key },
      on: { input: (e) => { const x = Number(e.target.value); out.textContent = String(Math.round(x * 100) / 100); try { c?.setMany({ [key]: x }); } catch { /* the code below still saves it */ } },
        change: (e) => { setSlider(key, Number(e.target.value)).catch(err); } } });
    return el('label', { class: 'ly-sl' }, el('span', { text: label }), inp, out);
  }
  function paint() {
    if (!S.pop) return;
    const { L, lines, kind } = now();
    const m = music();
    const timed = lines.length && lines.every((x) => x.a != null);
    const head = el('div', { class: 'ly-h' }, el('b', { text: '🎤 Lyrics' }),
      el('span', { class: 'hint', text: lines.length ? ` ${lines.length} line${lines.length === 1 ? '' : 's'}${timed ? ' · timed' : ''}${kind === 'lrc' ? ' · .lrc' : ''}` : ' paste them or open a file' }),
      el('span', { class: 'spacer' }), b('✕', 'Close (Esc)', () => close(), 'ghost small ly-x'));
    const inRow = el('div', { class: 'ly-row' }, b('Paste…', 'Paste the lyrics: one line of the song per line (an .lrc keeps its times)', () => paste(), 'ghost small ly-paste'), b('Open file…', '.lrc (timed), .txt or .srt', () => openFile(), 'ghost small ly-open'));
    const timeRow = lines.length ? el('div', { class: 'ly-row' },
      b('✦ Auto-time', m ? 'Put the lines on the song\'s bars and sections by syllables (on this computer, free)' : 'Load the song first', () => autoTime(), 'ghost small ly-auto'),
      b('🎤 Tap to time', 'The song plays: press Space as each line starts (snapped to the beat)', () => tapStart(), 'ghost small ly-taptime')) : null;
    let body = null;
    if (lines.length && !L) body = el('div', { class: 'ly-row' }, b('＋ Add a lyrics layer', 'A 🅰 lyrics layer in the style picked below (karaoke by default)', () => addLayer(S.style || 'karaoke'), 'primary small ly-add'));
    const styles = lines.length ? el('div', { class: 'ly-styles' }, ...C().STYLES.map((s) => {
      const cv = el('canvas', { class: 'ly-prev', width: 128, height: 36, dataset: { style: s.id } });
      return el('button', { type: 'button', class: `ly-style${S.style === s.id ? ' on' : ''}`, dataset: { style: s.id }, title: s.desc,
        on: { click: (e) => { e.stopPropagation(); S.style = s.id; (layer() ? applyStyle(s.id) : Promise.resolve(paint())).catch(err); } } }, cv, el('span', { text: s.name }));
    })) : null;
    const sliders = L ? el('div', { class: 'ly-sls' }, slider(L, 'size', 'Size', 0.02, 0.3, 0.005), slider(L, 'x', 'Left / right', -1, 1, 0.01), slider(L, 'y', 'Up / down', -1, 1, 0.01), slider(L, 'kickScale', 'Kick', 0, 1, 0.01)) : null;
    const ai = L ? el('div', { class: 'ly-row' },
      b('Per section', 'Calm where it\'s quiet, punchy on the drops: keyframes on the layer (free, one undo)', () => perSection(), 'ghost small ly-persec'),
      b('✦ Style the lyrics', 'The director picks a style per section (the cost shows first; nothing is sent before you say so)', () => ask(), 'ghost small ly-ai')) : null;
    S.pop.replaceChildren(head, inRow, timeRow, body, styles ? el('div', { class: 'hint ly-sub', text: L ? 'Style' : 'Style for the new layer' }) : null, styles, sliders, ai);
    previews();
  }

  // ---------- the live previews (a 120 BPM beat, the first lyric line) ----------
  function previews() {
    cancelAnimationFrame(S.prevRaf);
    const cards = [...(S.pop?.querySelectorAll('canvas.ly-prev') || [])];
    if (!cards.length) return;
    const text = (now().lines[0]?.text || 'sing it out loud tonight').slice(0, 28);
    const words = text.split(/\s+/);
    const t0 = performance.now();
    const frame = () => {
      if (!S.pop?.isConnected) return;
      const t = (performance.now() - t0) / 1000; const beat = 0.5; const loop = 3; const u = (t % loop) / loop;
      for (const cv of cards) {
        const g = cv.getContext('2d'); const W = 96; const Hh = 26; // (drawn at 2× for a sharp small card)
        g.setTransform(cv.width / W, 0, 0, cv.height / Hh, 0, 0); g.clearRect(0, 0, W, Hh); g.textAlign = 'center'; g.textBaseline = 'middle';
        const st = cv.dataset.style; const kick = 1 - (t % beat) / beat;
        g.font = '700 10px system-ui, sans-serif'; g.fillStyle = '#fff'; g.globalAlpha = 1;
        if (st === 'karaoke') { g.fillStyle = '#ffffff99'; g.fillText(text, W / 2, Hh / 2); const tw = g.measureText(text).width; g.save(); g.beginPath(); g.rect(W / 2 - tw / 2, 0, tw * u, Hh); g.clip(); g.fillStyle = '#ffd75e'; g.fillText(text, W / 2, Hh / 2); g.restore(); } else if (st === 'wordbeat') { const n = Math.min(words.length, Math.floor(t / beat) % (words.length + 2)); const shown = words.slice(0, n).join(' '); const k = (t % beat) / beat; g.globalAlpha = 1; g.fillText(shown, W / 2, Hh / 2 + (n ? 0 : 4) - (1 - Math.min(1, k * 3)) * 2); } else if (st === 'fade' || st === 'calm') { const sp = st === 'calm' ? 0.5 : 1; g.globalAlpha = Math.max(0, Math.sin(Math.PI * ((t * sp) % 1.5) / 1.5)); g.fillText(text, W / 2, Hh / 2); } else if (st === 'punchy') { const w = words[Math.floor(t / beat) % words.length]; const s = 1 + kick * 0.35; g.font = `900 ${Math.round(15 * s)}px system-ui, sans-serif`; g.fillStyle = '#ffd75e'; g.fillText(w.toUpperCase(), W / 2, Hh / 2); } else if (st === 'typed') { g.font = '600 10px Consolas, monospace'; g.fillText(text.slice(0, Math.floor(u * (text.length + 6))), W / 2, Hh / 2); } else if (st === 'scroll') { const y = (u * 3) % 1; for (let j = -1; j <= 2; j += 1) { g.globalAlpha = j === 0 ? 1 : 0.35; g.fillText(j === 0 ? text : words.slice(j).join(' ') || text, W / 2, Hh / 2 + (j - y) * 11); } }
        g.globalAlpha = 1;
      }
      S.prevRaf = requestAnimationFrame(frame);
    };
    S.prevRaf = requestAnimationFrame(frame);
  }

  // ---------- /lyrics-sync and Ctrl/⌘+K ----------
  if (typeof Commands !== 'undefined' && !Commands.get('lyrics-sync')) {
    Commands.register({
      name: 'lyrics-sync', area: 'Three.js Lab', args: '[paste|open|auto|tap|add [style]|style <style>|sections|ai|close]',
      desc: 'Lyrics synced to the song: paste or open an .lrc, auto-time them on the bars, tap to time, a lyrics layer in a style',
      examples: ['/lyrics-sync', '/lyrics-sync auto', '/lyrics-sync tap', '/lyrics-sync add karaoke', '/lyrics-sync ai'],
      keywords: 'lyrics lrc karaoke words song sync timing tap lane captions sing',
      complete: (a) => ['paste', 'open', 'auto', 'tap', 'add', 'style', 'sections', 'ai', 'close'].filter((x) => x.startsWith(a.trim().toLowerCase())).map((value) => ({ value })),
      run: async (args) => {
        const [w, x] = String(args || '').trim().toLowerCase().split(/\s+/);
        if (w === 'close') { close(); return 'Closed'; }
        if (w === 'paste') { const r = await paste(); return r ? `${r.lines} lines` : null; }
        if (w === 'open') { const r = await openFile(); return r ? `${r.lines} lines` : null; }
        if (w === 'auto') return (await autoTime()).how;
        if (w === 'tap') { tapStart(); return 'Space at each line start · Enter keeps'; }
        if (w === 'add') { const r = await addLayer(x || 'karaoke'); return `Added ${r.layer}`; }
        if (w === 'style') { await applyStyle(x || 'karaoke'); return `Style: ${x || 'karaoke'}`; }
        if (w === 'sections') return (await perSection()).words;
        if (w === 'ai') { await ask(); return null; }
        open(); return null;
      },
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Lab: 🎤 Lyrics synced to the song (paste, .lrc, auto-time, tap, a lyrics layer)', () => { try { open(); } catch (e) { err(e); } });

  return { open, close, toggle, paste, openFile, take, autoTime, tapStart, tapAt, tapBack, tapStop, moveLine, addLayer, applyStyle, setSlider, perSection, ask, askText, now, layer, stats, get pop() { return S.pop; }, get lane() { return S.lane; }, get tapping() { return S.tap ? { i: S.tap.i, n: S.tap.lines.length, lines: S.tap.lines } : null; } };
})();
window.LabLyrics = LabLyrics;
