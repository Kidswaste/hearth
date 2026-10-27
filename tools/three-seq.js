// The Lab's Sequence: a video timeline built right in the Three.js Lab. "▤ Sequence" on the timeline's top strip (or
// /sequence) turns the Lab timeline into tracks: Scenes (your sketches / chat scenes / looks as clips, with
// transitions between them) and footage on the main track, Titles (styles and animations, tools/cut-presets.js),
// Overlays (Lab layers or filters over a range) and Sound (the song: its analysis still drives what reacts to it).
// The preview plays the sequence live, in the same page (scenes switch and cross-fade without reloads, each scene
// on its own clock, so any frame can be reached exactly), and ⇪ renders it frame by frame (the sandbox steps its
// clock, every frame is captured at the frame size, ffmpeg muxes the sound) into a video file (Open / Show in Finder).
// The sequence is a CutData edit stored in kv video-cuts ("seq:<name>", seq.lab = true; tools/cut-store.js,
// tools/three-seq-data.js). Chat: tools/three-seq-cmds.js; directors: three_do sequence.
const ThreeSeq = (() => {
  const D = ThreeSeqData;
  const C = CutData;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const IS_MAC = /Mac/.test(navigator.platform);
  const MOD = IS_MAC ? '⌘' : 'Ctrl';
  const VID = /\.(mp4|m4v|mov|webm|mkv)$/i;
  const AUD = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;
  const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i;
  const SCENE_TYPE = 'application/x-hearth-scene';
  const REF_TYPE = 'application/x-hearth-ref';
  const AREA = 'Lab sequence';

  const S = {
    L: null, view: false, key: null, edit: null, sel: new Set(), undo: [], redo: [], T: 0, playing: false, rate: 1, shuttle: 0, loop: false,
    snap: store.get('three.seq.snap', true), vr: null, sent: { libs: false, assets: new Set(), plan: '' }, entered: null, storing: false,
    render: null, probes: new Map(), drag: null, hover: null, waits: [], frames: new Map(),
    // seq2: songs' beat maps (each scene's own hits and cue looks), nested sequences' edits, clip pictures
    maps: {}, nested: new Map(), thumbs: new Map(),
    // seqguard: the page generation (each new preview page), playing as you asked for it (a page being replaced
    // reports "paused" for a moment), the plan's number the page should show, the watchdog's counts
    page: 0, want: false, planId: 0, restoring: 0, lastState: 0, guard: { soft: 0, hard: 0, remount: 0, assets: 0, last: null, log: [] },
    // seqguard: undo labels (the history list), clip color labels
    undoLabels: [], redoLabels: [],
    // seqsolid: the clips whose scene threw in the preview (clip id → { message, n }), marked ⚠ on the timeline
    errs: new Map(), errSig: new Map(),
  };
  const A = typeof SeqArrange !== 'undefined' ? SeqArrange : null;
  const TR = () => (typeof SeqTrans !== 'undefined' ? SeqTrans : null);
  const X = () => (typeof SeqCut !== 'undefined' ? SeqCut : null); // labcut: framing, sound, captions, looks, outputs
  const listeners = {};
  const emit = (ev, d) => { for (const fn of listeners[ev] || []) { try { fn(d); } catch (err) { console.error(err); } } };
  const lab = () => S.L;
  const fps = () => S.edit?.seq?.fps || 30;
  const frameOf = (T) => Math.floor(T * fps() + 1e-3);
  const frameStart = (n) => Math.max(0, n) / fps();
  const total = () => (S.edit ? programEnd(S.edit) : 0);
  // the program ends with the last picture (a longer song is cut there); a sequence with only sound lasts the sound
  function programEnd(e0) {
    const e = flat(e0);
    const vis = Math.max(C.mainTotal(e), ...(e.tracks || []).filter((k) => k.type !== 'audio').flatMap((k) => k.items.map((x) => C.itemEnd(x))), 0);
    if (vis > 0) return vis;
    return Math.max(0, ...(e.tracks || []).flatMap((k) => k.items.map((x) => C.itemEnd(x))));
  }
  const tc = (T) => {
    const F = fps(); const n = frameOf(T); const nom = Math.round(F);
    const p2 = (x) => String(Math.floor(x)).padStart(2, '0');
    const s = Math.floor(n / nom);
    return `${p2(s / 3600)}:${p2((s / 60) % 60)}:${p2(s % 60)}:${p2(n % nom)}`;
  };

  // ---------- storage (kv video-cuts, tools/cut-store.js) ----------
  const VC = () => (typeof CutStore !== 'undefined' ? CutStore : null);
  async function readEdit(key) { const e = await VC()?.editFor(key); return e ? C.normalize(e) : null; }
  async function writeEdit(label) {
    if (!S.key || !S.edit) return;
    S.storing = true;
    try { await VC()?.storeEdit(S.key, withEnd(C.copy(S.edit)), label || 'From the Lab sequence'); } finally { S.storing = false; }
  }
  // a song longer than the pictures: the stored edit gets the same end as an in–out range (renders stop there too),
  // unless you set your own range
  function withEnd(e) {
    const vis = programEnd(e); const all = C.total(e);
    if (all > vis + 0.05 && vis > 0) { if (!e.mark || e.mark.lab) e.mark = { a: 0, b: r4(vis), lab: true }; } else if (e.mark?.lab) e.mark = null;
    return e;
  }
  const saveSoon = saver(() => { writeEdit().catch((err) => console.warn(err)); }, 300); // (round 29) also on leaving (CutStore then writes at once)
  // nested sequences (a sequence as a clip): their edits, loaded before the program is compiled
  async function loadNested(e, depth = 0) {
    for (const c of e?.clips || []) {
      if (c.kind !== 'seq' || depth > 3) continue;
      const sub = await readEdit(c.ref).catch(() => null);
      if (sub) { S.nested.set(c.ref, sub); await loadNested(sub, depth + 1); }
    }
  }
  const flat = (e) => (e?.clips?.some((c) => c.kind === 'seq') ? D.flatten(e, (ref) => S.nested.get(ref) || null, 0, new Set(S.key ? [S.key] : [])) : e);
  // the songs' beat maps (kv three-beatmaps): a scene's own hits and cue looks travel with its clips
  async function loadMaps() { try { S.maps = (await window.hub.kvGet('three-beatmaps', {})) || {}; } catch { S.maps = {}; } }
  async function list() {
    const v = VC();
    if (!v) return [];
    await v.editFor('seq:__probe__'); // loads the kv once
    const out = [];
    const alive = (id) => Boolean(id && lab()?.scenes?.get(id));
    for (const s of v.sequences()) {
      const e = await readEdit(s.key);
      if (!D.isLab(e)) continue;
      const scene = alive(e.seq?.scene) ? e.seq.scene : null;
      out.push({ key: s.key, name: s.name, seconds: r4(programEnd(e)), clips: e.clips.length, format: D.formatOf(e), scene, firstScene: e.clips.find((c) => c.kind === 'scene')?.sketch || null });
    }
    // what the chat rows and the scene menus show without asking again (each scene's own sequence)
    listCache = out;
    S.index = new Map();
    for (const x of out) if (x.scene && (!S.index.has(x.scene) || store.get('three.seq.byScene', {})[x.scene] === x.key)) S.index.set(x.scene, x);
    const sig = JSON.stringify([...S.index.values()].map((x) => [x.scene, x.key, x.clips, x.seconds]));
    if (sig !== S.indexSig) { S.indexSig = sig; dispatchEvent(new CustomEvent('hearth:sequences')); }
    return out;
  }
  let listCache = [];
  async function uniqueKey(name) {
    const v = VC();
    await v?.editFor('seq:__probe__');
    const taken = new Set((v?.sequences() || []).map((s) => s.key));
    let key = `seq:${String(name || 'Sequence').trim() || 'Sequence'}`;
    for (let i = 2; taken.has(key); i += 1) key = `seq:${name} ${i}`;
    return key;
  }
  // every change: one undo step, saved, redrawn, the preview follows
  // merge: a run of the same kind of change (frame swaps, nudges, key trims) within 2 s is one undo step
  function commit(next, label, { merge = null } = {}) {
    if (!S.edit || !next || next === S.edit) return false;
    const now = performance.now();
    const same = merge && S.lastMerge?.kind === merge && now - S.lastMerge.at < 2000 && S.undo.length;
    if (!same) {
      S.undo.push(JSON.stringify(S.edit));
      S.undoLabels.push({ label: String(label || 'Change').replace(/^[✂＋✦♪▤]\s*/u, ''), at: Date.now() });
      if (S.undo.length > 150) { S.undo.shift(); S.undoLabels.shift(); }
    } else S.undoLabels[S.undoLabels.length - 1] = { label: String(label || 'Change'), at: Date.now() };
    S.lastMerge = merge ? { kind: merge, at: now } : null;
    S.redo = []; S.redoLabels = [];
    setEdit(next);
    if (label) flash(label);
    return true;
  }
  function setEdit(next, { save = true } = {}) {
    const { lastClip: _a, lastItem: _b, ...keep } = next;
    S.edit = keep;
    for (const id of [...S.sel]) if (!C.find(S.edit, id)) S.sel.delete(id);
    if (S.T > total()) S.T = total();
    if (save) saveSoon();
    if (S.view && S.loop) send({ type: 'seq-loop', on: true, range: rangeOf() }); // (an undone range: the loop follows)
    redraw();
    pushPlan();
    emit('change', { key: S.key });
  }
  function undo() { if (!S.undo.length) return false; const lb = S.undoLabels.pop(); S.redo.push(JSON.stringify(S.edit)); S.redoLabels.push(lb || { label: 'Change' }); S.lastMerge = null; setEdit(JSON.parse(S.undo.pop())); flash(`Undo${lb ? `: ${lb.label}` : ''}`); return true; }
  function redo() { if (!S.redo.length) return false; const lb = S.redoLabels.pop(); S.undo.push(JSON.stringify(S.edit)); S.undoLabels.push(lb || { label: 'Change' }); S.lastMerge = null; setEdit(JSON.parse(S.redo.pop())); flash(`Redo${lb ? `: ${lb.label}` : ''}`); return true; }
  // the history list (⋯ → History, /sequence history): the latest steps first; going back n steps is n undos
  function history() {
    const now = Date.now();
    const ago = (t) => { const s = Math.round((now - (t || now)) / 1000); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
    return { back: S.undoLabels.map((x, i) => ({ steps: S.undoLabels.length - i, label: x?.label || 'Change', ago: ago(x?.at) })).reverse(), forward: S.redoLabels.map((x, i) => ({ steps: S.redoLabels.length - i, label: x?.label || 'Change' })).reverse() };
  }
  function goBack(n = 1) { let k = 0; for (; k < n && undo(); k += 1); if (k > 1) flash(`Back ${k} steps`); return k; }
  function goForward(n = 1) { let k = 0; for (; k < n && redo(); k += 1); if (k > 1) flash(`Forward ${k} steps`); return k; }

  // ---------- opening ----------
  async function open(key, { show = true } = {}) {
    const e = await readEdit(key);
    if (!e) throw new Error(`No sequence "${String(key).replace(/^seq:/, '')}"`);
    if (!e.seq?.lab) e.seq = { ...(e.seq || {}), lab: true };
    S.errs.clear(); S.errSig.clear();
    S.key = key; S.edit = e; S.undo = []; S.redo = []; S.undoLabels = []; S.redoLabels = []; S.lastMerge = null; S.sel.clear(); S.T = 0; S.vr = null; S.thumbs.clear();
    S.loop = Boolean(e.seq?.loop);
    // the scene it belongs to (the one it was opened for, when it belongs to none: an "other" sequence)
    S.owner = e.seq?.scene || lab()?.sketchId() || null;
    S.explicit = true; // opened on purpose: it stays until another scene comes on screen
    store.set('three.seq.current', key);
    if (e.seq?.scene) store.set('three.seq.byScene', { ...store.get('three.seq.byScene', {}), [e.seq.scene]: key });
    await loadNested(e);
    emit('change', { key }); // the name chip follows
    await ensureSong();
    if (show) await enter();
    else { redraw(); pushPlan(); }
    return key;
  }
  // a new sequence: the frame size you're on, the scene on screen as its first clip, with its song (no decisions)
  async function create(name = null, { format = null, empty = false, show = true, scene = undefined } = {}) {
    const L = lab();
    const sid = scene === undefined ? L?.sketchId() : scene;
    const sk = sid ? L.scenes.get(sid) : null;
    const fmt = format || (D.FORMATS[L?.stage?.size?.id] ? L.stage.size.id : '9:16');
    const key = await uniqueKey(name || (sk ? `${sk.name} sequence` : 'Sequence'));
    let e = D.create({ format: fmt, fps: 30, name: key.slice(4) });
    if (sid) e.seq.scene = sid; // each scene owns its sequence (it travels with the scene)
    const song = sid ? L.scenes.songOf(sid) : null;
    if (song && AUD.test(song)) { const d = (L.player.path === song && L.player.duration) || (await durationOf(song)); if (d) e = D.setSong(e, song, d); }
    S.key = key; S.edit = e;
    await ensureSong();
    const g = grid();
    // no questions: the scene as one clip on its song; a scene with its own timeline (no song, the orb) as one clip
    // of its timeline's length; else empty (✦ Arrange or ＋ fill it)
    const own = sid && !D.songOf(e) ? L.scenes.timelineOf?.(sid) : null;
    if (!empty && sk && D.songOf(e)) e = D.addScene(e, sceneOf(sk), { grid: g });
    else if (!empty && sk && own) e = D.addScene(e, sceneOf(sk), { dur: own.len });
    if (!empty && sk && g) e = D.fitBars(e, g, { songStart: songStart(e) });
    S.edit = e;
    await writeEdit('New Lab sequence');
    return open(key, { show });
  }
  // The scene's own sequence: the one it owns (the last one you opened for it, if it has several); a sequence
  // made before scenes owned them is taken over by the scene it starts with; else a new one, made without asking.
  async function keyForScene(sid, { make = true } = {}) {
    const all = await list();
    const mine = all.filter((x) => x.scene === sid);
    const last = store.get('three.seq.byScene', {})[sid];
    let k = mine.find((x) => x.key === last)?.key || mine[0]?.key || null;
    if (!k && sid) {
      const legacy = all.find((x) => !x.scene && x.firstScene === sid);
      if (legacy) { const e = await readEdit(legacy.key); e.seq = { ...e.seq, scene: sid }; await VC()?.storeEdit(legacy.key, e, 'Belongs to its scene'); k = legacy.key; }
    }
    if (!k && make) {
      const L = lab();
      const was = { key: S.key, edit: S.edit };
      k = await create(null, { show: false, scene: sid, name: L?.scenes.get(sid) ? `${L.scenes.get(sid).name} sequence` : null });
      if (was.key && S.view) { S.key = was.key; S.edit = was.edit; }
    }
    return k;
  }
  async function current({ make = true, scene = undefined } = {}) {
    const sid = scene === undefined ? lab()?.sketchId() || null : scene;
    if (S.key && S.edit && (!sid || S.owner === sid || (S.explicit && scene === undefined))) return S.key;
    if (sid) { const k = await keyForScene(sid, { make }); if (!k) return null; if (k !== S.key || !S.edit) await open(k, { show: false }); S.explicit = false; S.owner = sid; return k; }
    const want = store.get('three.seq.current', null);
    const all = await list();
    const k = all.find((x) => x.key === want)?.key || all[0]?.key;
    if (k) return open(k, { show: false });
    return make ? create(null, { show: false }) : null;
  }
  // another scene came on screen (you, a chat switch, a jam): its own sequence takes the view, cross-fading in the
  // same page like a scene switch (no reload)
  // (seqsolid) one switch at a time, and only the latest: switches used to run side by side, and a slower one's
  // open() could land after a newer one's, so the scene on screen showed another scene's sequence
  let switching = null; let switchChain = Promise.resolve();
  function switchTo(sid) {
    if (!sid || S.render) return Promise.resolve();
    const run0 = (switching = Symbol('switch'));
    const p = switchChain.then(() => (switching === run0 ? switchNow(sid, run0) : null));
    switchChain = p.catch(() => {});
    return p;
  }
  async function switchNow(sid, run0) {
    const k = await keyForScene(sid);
    if (switching !== run0 || !k) return;
    if (k !== S.key) { await open(k, { show: false }); }
    if (switching !== run0) return;
    S.owner = sid; S.entered = sid; S.explicit = false;
    if (!S.view) return;
    await Promise.all([ensureSong(), loadMaps()]);
    if (switching !== run0) return;
    S.sent.plan = '';
    await sendPlan({ force: true, fade: true });
    send({ type: 'seq-seek', T: S.T });
    send({ type: 'seq-loop', on: S.loop, range: rangeOf() });
    redraw(); placeHead(); paintTime();
    emit('switch', { scene: sid, key: S.key });
  }
  // a scene's sequence in a few words (the chat rows' still, the scene menus): from the last listing, no reads
  function summaryFor(sid) { const x = S.index?.get(sid); return x ? { key: x.key, name: x.name, clips: x.clips, seconds: x.seconds } : null; }
  // a scene copied (Duplicate): its sequence comes along, owned by the copy (clips of the scene itself follow it)
  async function sceneCopied(from, to) {
    const k = await keyForScene(from, { make: false });
    if (!k) return null;
    const e = await readEdit(k);
    const copy = C.copy(e);
    copy.seq = { ...copy.seq, scene: to };
    copy.clips = copy.clips.map((c) => (c.kind === 'scene' && c.sketch === from ? { ...c, sketch: to, name: lab()?.scenes.get(to)?.name || c.name } : c));
    const key = await uniqueKey(`${lab()?.scenes.get(to)?.name || 'Scene'} sequence`);
    copy.seq.name = key.slice(4);
    await VC()?.storeEdit(key, copy, 'Copied with its scene');
    await list();
    return key;
  }
  const sceneOf = (sk, extra = {}) => ({ sketch: sk.id, name: sk.name, poster: null, ...extra });

  // ---------- the song (loaded through the Lab's player: grid, analysis, waveform as usual) ----------
  const songItem = () => (S.edit ? D.songOf(S.edit) : null);
  const songStart = (e = S.edit) => { const s = e ? D.songOf(e) : null; return s ? s.start - s.in : 0; };
  function grid() {
    const s = songItem(); const P = lab()?.player;
    if (!s || !P?.loaded || P.path !== s.src) return null;
    const g = P.timeline().grid;
    return g?.bpm ? { bpm: g.bpm, anchor: g.downbeat ?? P.downbeat ?? 0, bpb: g.beatsPerBar || P.beatsPerBar || 4 } : null;
  }
  async function ensureSong() {
    const s = songItem(); const P = lab()?.player;
    if (!s || !P) return;
    if (P.path !== s.src) { S.gridTries = 0; await P.load(s.src, { quiet: true }); }
  }
  async function durationOf(p) {
    const pr = await probe(p);
    if (pr?.duration) return pr.duration;
    return new Promise((r) => { const m = document.createElement(VID.test(p) ? 'video' : 'audio'); m.preload = 'metadata'; m.onloadedmetadata = () => r(m.duration || 0); m.onerror = () => r(0); m.src = WinMac.fileUrl(p); setTimeout(() => r(0), 6000); });
  }
  async function probe(p) {
    if (S.probes.has(p)) return S.probes.get(p);
    let pr = null;
    try { pr = await window.hub.video.probe(p, { ffprobe: H.settings().ffprobePath || undefined }); } catch { /* no ffprobe */ }
    if (pr) S.probes.set(p, pr);
    return pr;
  }

  // ---------- the plan the preview plays (tools/three-sandbox.html "the sequence") ----------
  // per layer: its code with the clip's look / board vibe as slider values, keyframes moved to the clip
  const scanCache = new Map();
  function scanOf(code) {
    if (scanCache.has(code)) return scanCache.get(code);
    let sc = null;
    try { sc = ThreeTweaks.scan(code); } catch { sc = null; }
    if (scanCache.size > 60) scanCache.delete(scanCache.keys().next().value);
    scanCache.set(code, sc);
    return sc;
  }
  // the looks' value ids (as tools/three-tweaks.js keys them: named controls by key, others by name + occurrence)
  function idsFor(items) {
    const seen = {};
    return items.map((it) => {
      if (it.key != null) return `k:${it.key}`;
      const b = it.name || `${it.before.trim()}|${it.raw}`;
      seen[b] = (seen[b] || 0) + 1;
      return `${b}#${seen[b]}`;
    });
  }
  const runtime = (it, v) => (it.kind === 'color' && !it.quote && typeof v === 'string' ? parseInt(v.slice(1), 16) : v);
  // (rate: the clip's speed: a key at the scene's own time k lands at t0 + k / rate in the sequence)
  const shiftKeys = (keys, dt, rate = 1) => keys.map((k) => ({ ...k, t: r4(k.t / rate + dt) }));
  const ANIM = ['opacity', 'x', 'y', 'scale', 'rotate'];
  function prepLayer(L, slot, { look = null, palette = null, t0 = 0, vary = null, cues = null, rate = 1, links = null } = {}) {
    const keys = Object.fromEntries(ANIM.filter((p) => L.keys?.[p]?.length).map((p) => [p, shiftKeys(L.keys[p], t0, rate)]));
    const sc = scanOf(L.code || '');
    if (!sc?.items?.length) return { code: L.code || '', values: undefined, keys, sliderKeys: {} };
    const b = slot * 10000;
    const ids = idsFor(sc.items);
    const vals = sc.items.map((it) => it.orig);
    if (look) ids.forEach((id, i) => { if (id in look) vals[i] = look[id]; });
    // a variation of the clip (seeded: the same clip always looks the same)
    if (vary) for (const [i, v] of Object.entries(D.varyValues(sc.items, vary, vals))) vals[i] = v;
    if (palette?.length) { let k = 0; sc.items.forEach((it, i) => { if (it.kind === 'color') { vals[i] = palette[k % palette.length]; k += 1; } }); }
    const sliderKeys = {};
    for (const [prop, ks] of Object.entries(L.keys || {})) {
      if (!prop.startsWith('s:') || !ks?.length) continue;
      const i = sc.items.findIndex((it) => it.key === prop.slice(2));
      if (i >= 0) sliderKeys[b + i] = { call: sc.items[i].call, key: sc.items[i].key, num: sc.items[i].kind === 'color' && !sc.items[i].quote, keys: shiftKeys(ks, t0, rate) };
    }
    // the scene's cue looks (✦ a look per song section) move with the clip too: held slider keys at the cues' times
    if (cues?.length) {
      ids.forEach((id, i) => {
        if (sliderKeys[b + i] || !cues.some((q) => id in q.values)) return;
        const ks = [{ t: -1e6, v: runtime(sc.items[i], vals[i]), ease: 'hold' }];
        for (const q of cues) if (id in q.values) ks.push({ t: r4(q.t / rate + t0), v: runtime(sc.items[i], q.values[id]), ease: 'hold' });
        sliderKeys[b + i] = { call: sc.items[i].call, key: sc.items[i].key, num: false, keys: ks };
      });
    }
    // (round 38, beatlink) its sliders' ♪ Move with the music links: the page computes them from the song's time, so the
    // sequence and its renders move like the Lab (only links with a "how"; the older curves follow the live analyser)
    let lk = null;
    if (links) ids.forEach((id, i) => { const m = links[id]; if (m?.how && sc.items[i].kind === 'number') (lk ||= {})[b + i] = { ...m, int: sc.items[i].int, call: sc.items[i].call, key: sc.items[i].key }; });
    let code = sc.code;
    try { code = ThreeTweaks.instrument(sc.code, sc.items, b); } catch { return { code: L.code, values: undefined, keys, sliderKeys: {} }; }
    return { code, values: Object.fromEntries(vals.map((v, i) => [b + i, runtime(sc.items[i], v)])), keys, sliderKeys, ...(lk ? { links: lk } : {}) };
  }
  function looksOf(sk) {
    const ex = lab()?.scenes.extrasOf?.(sk.id) || {};
    const out = { main: ex.looks || [] };
    for (const [id, x] of Object.entries(ex.layers || {})) out[id] = x.looks || [];
    return out;
  }
  const lookNames = (sk) => [...new Set(Object.values(looksOf(sk)).flat().map((l) => l.name))];
  function sceneLayers(c, x, slot0) {
    const L = lab();
    const sk = L?.scenes.get(c.sketch);
    if (!sk) return null;
    const rate = c.speed > 0 ? c.speed : 1;
    const t0 = r4(x.start - (c.in || 0) / rate);
    const looks = looksOf(sk);
    // its own song's hand-placed hits and cue looks (in the scene's own time: they move with the clip)
    const map = S.maps?.[L.scenes.songOf?.(sk.id)] || null;
    const marks = map?.marks && ['kick', 'snare', 'hit'].some((k) => map.marks[k]?.length) ? { kick: map.marks.kick || [], snare: map.marks.snare || [], hit: map.marks.hit || [] } : null;
    return L.scenes.layersOf(sk).filter((ly) => ly.visible !== false).map((ly, j) => {
      const mine = looks[ly.id] || looks.main || [];
      const look = c.look ? mine.find((l) => l.name === c.look)?.values : null;
      const cues = !c.look && map?.cues?.length ? map.cues.map((q) => ({ t: q.t, name: q.looks?.find((l) => l.layer === ly.id || l.layer === ly.name)?.name })).filter((q) => q.name).map((q) => ({ t: q.t, values: mine.find((l) => l.name === q.name)?.values })).filter((q) => q.values) : null;
      const lex = L.scenes.extrasOf?.(sk.id) || {}; const links = (ly.id === 'main' ? lex.bindings : lex.layers?.[ly.id]?.bindings) || null; // (round 38, beatlink)
      const p = prepLayer(ly, slot0 + j, { look, palette: c.vibe?.palette, t0, vary: c.vary ? { seed: (c.vary.seed || 1) + j * 101, amount: c.vary.amount ?? 0.4 } : null, cues, rate, links });
      return { id: `${c.id}~${ly.id}`, code: p.code, values: p.values, props: { name: `${c.name} · ${ly.name}`, share: shareKey(ly), opacity: ly.opacity ?? 1, blend: ly.blend || 'normal', x: ly.x || 0, y: ly.y || 0, scale: ly.scale ?? 1, rotate: ly.rotate || 0, mask: ly.mask || null, in: ly.in != null ? r4(ly.in / rate + t0) : null, out: ly.out != null ? r4(ly.out / rate + t0) : null, fadeIn: ly.fadeIn || 0, fadeOut: ly.fadeOut || 0, keys: p.keys, sliderKeys: p.sliderKeys, ...(p.links ? { links: p.links } : {}), ...(ly.camMoves?.length && typeof CamCore !== 'undefined' ? { camMoves: CamCore.shift(CamCore.cleanAll(ly.camMoves), t0, rate) } : {}), ...(ly.overrides ? { overrides: ly.overrides } : {}), /* (round 50, labmaterials: the 3D editor's placements and ◉ looks, as in the preview) */ ...(marks ? { seqMarks: marks } : {}), ...(ly.precomp && typeof ThreeComp !== 'undefined' ? { precomp: ThreeComp.specOf(ly, sk.id, { slotBase: 3000 + (slot0 + j) * 50 }) } : {}) } };
    });
  }
  // what makes two scenes' layers "the same layer" for a morph: its name, or its code when the name says nothing
  const hashStr = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const shareKey = (ly) => { const nm = String(ly.name || '').trim(); return !nm || /^(main|layer\s*\d*|new layer.*)$/i.test(nm) ? `code:${hashStr(ly.code || '')}` : nm.toLowerCase(); };
  const TITLE_KEYS = ['text', 'style', 'anim', 'out', 'animDur', 'lower', 'x', 'y', 'size', 'color', 'align', 'font', 'weight', 'stroke', 'strokeW', 'shadow', 'glow', 'box', 'upper', 'tracking', 'shape', 'bg', 'fg', 'italic', 'rotate'];
  const titleOf = (x) => Object.fromEntries(TITLE_KEYS.filter((k) => x[k] != null).map((k) => [k, x[k]]));
  // (labcut) a clip's color look (its own, else the sequence's), as one color matrix for the preview page
  const lookOfClip = (c, e) => { const gr = c.grade || e.seq?.grade; return gr?.look && typeof EditFX !== 'undefined' ? X()?.lookSpec(EditFX, gr) || null : null; };
  function compile(e0 = S.edit) {
    const e = flat(e0); // nested sequences play what they hold
    const groups = []; const titles = []; const assets = new Set(); const sounds = [];
    const fmt = D.formatOf(e); const x0 = X();
    const frameOf = (c, fit) => (x0 ? x0.frameSpec(fit && !c.fit ? { ...c, fit } : c, fmt) : null);
    let slot = 100;
    for (const x of D.timing(e)) {
      const c = x.clip;
      const g = { id: c.id, main: true, start: r4(x.start), end: r4(x.end), td: r4(x.td || 0), trans: c.trans?.type || null, z: 100 + x.i * 20 };
      const lk = lookOfClip(c, e); if (lk) g.look = lk;
      if (c.off) continue;
      const cg = typeof GradeCore !== 'undefined' ? GradeCore.clipLayers(c.cgrade || e.seq?.cgrade, c.id) : null; if (cg) g.cgrade = cg; // (round 24) its ◐ grade
      if (c.kind === 'scene') {
        const layers = sceneLayers(c, x, slot);
        slot += 16;
        const rate = c.speed > 0 ? c.speed : 1;
        if (layers) groups.push({ ...g, kind: 'scene', t0: r4(x.start - (c.in || 0) / rate), ...(rate !== 1 ? { rate } : {}), layers });
        else groups.push({ ...g, kind: 'card', card: { text: `Missing scene “${c.name}”`, style: 'bold', bg: '#200810' } });
      } else if (c.kind === 'video') { groups.push({ ...g, kind: 'footage', asset: c.src, a: c.reverse ? c.out : c.in, speed: c.speed || 1, mute: c.mute !== false, volume: c.volume ?? 1, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0, fps: S.probes.get(c.src)?.fps || 30, fit: c.fit || 'cover', frame: frameOf(c) }); assets.add(c.src); }
      else if (c.kind === 'title') groups.push({ ...g, kind: 'card', card: { ...titleOf(c), bg: c.bg || '#000000' } });
      else if (c.kind === 'color') groups.push({ ...g, kind: 'color', card: { fill: c.fill || '#000000' } });
      else if (c.kind === 'image') { groups.push({ ...g, kind: 'image', asset: c.src, fit: c.fit || 'cover', frame: frameOf(c) }); assets.add(c.src); }
    }
    (e.tracks || []).filter((k) => k.type === 'video' && !k.hide).forEach((k, ti) => k.items.forEach((it, j) => {
      if (it.off) return;
      const g = { id: it.id, main: false, start: r4(it.start), end: r4(C.itemEnd(it)), td: 0, z: 10000 + ti * 1000 + j * 20 };
      if (it.kind === 'layer') { const p = prepLayer({ code: it.code, keys: it.keys }, slot, { t0: it.start }); slot += 1; groups.push({ ...g, kind: 'scene', t0: g.start, layers: [{ id: `${it.id}~o`, code: p.code, values: p.values, props: { name: it.name || 'Overlay', opacity: it.opacity ?? 1, blend: it.blend || 'normal', keys: p.keys, sliderKeys: p.sliderKeys } }] }); }
      else if (it.kind === 'video') { groups.push({ ...g, kind: 'footage', asset: it.src, a: it.in, speed: it.speed || 1, mute: it.mute !== false, volume: it.volume ?? 1, fadeIn: it.fadeIn || 0, fadeOut: it.fadeOut || 0, fps: S.probes.get(it.src)?.fps || 30, fit: it.fit || 'contain', frame: frameOf(it, 'contain') }); assets.add(it.src); }
      else if (it.kind === 'image') { groups.push({ ...g, kind: 'image', asset: it.src, fit: it.fit || 'contain', frame: frameOf({ motion: 'none', ...it }, 'contain') }); assets.add(it.src); }
      const lk = it.kind === 'layer' ? null : lookOfClip(it, { seq: {} }); if (lk) groups[groups.length - 1].look = lk;
    }));
    for (const k of (e.tracks || []).filter((x) => x.type === 'text' && !x.hide)) for (const it of k.items) if (!it.off) titles.push({ id: it.id, start: r4(it.start), end: r4(C.itemEnd(it)), item: titleOf(it) });
    const s = D.songOf(e);
    const song = s ? { offset: r4(s.start - s.in), start: r4(s.start), end: r4(s.start + (s.out - s.in) / (s.speed || 1)), src: s.src, volume: s.volume ?? 1, fadeIn: s.fadeIn || 0, fadeOut: s.fadeOut || 0 } : null;
    // the other sound clips play in the preview too (and in the real-time recording); a voice track's clips aren't ducked
    for (const k of (e.tracks || []).filter((x) => x.type === 'audio' && !x.mute)) for (const it of k.items) if (!it.song && !it.off && it.src) { sounds.push({ id: it.id, asset: it.src, start: r4(it.start), end: r4(C.itemEnd(it)), a: r4(it.in || 0), volume: it.volume ?? 1, speed: it.speed || 1, fadeIn: it.fadeIn || 0, fadeOut: it.fadeOut || 0, ...(x0?.isVoice(k) ? { voice: true } : {}) }); assets.add(it.src); }
    // (labcut) the music ducks under the voice (the song, sounds, footage sound; ⋯ → Sound › Ducking)
    const ranges = x0 && e.seq?.duck !== false ? x0.voiceRanges(e, C.itemEnd) : [];
    const duck = ranges.length ? { ranges, amount: e.seq?.duckAmt ?? x0.DEFAULT_DUCK } : null;
    return { plan: { fps: e.seq?.fps || 30, w: e.seq?.w || 1080, h: e.seq?.h || 1920, dur: r4(programEnd(e)), song, groups, titles, sounds, ...(duck ? { duck } : {}) }, assets: [...assets] };
  }
  // the drawing code for titles and transitions, the footage files: sent once per preview page
  const appDir = () => { let p = decodeURIComponent(new URL('.', location.href).pathname); if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); return p.replace(/[\\/]$/, ''); };
  let libText = null;
  async function libs() {
    if (libText) return libText;
    const dir = appDir();
    const [a, b, c, d] = await Promise.all(['tools/cut-presets.js', 'tools/cut-titles.js', 'tools/three-seq-trans.js', 'tools/three-seq-cut.js'].map((f) => window.hub.fs.read(`${dir}/${f}`)));
    libText = `${a}\n${b}\n${c}\n${d}`; // (the Lab transitions add themselves to EditFX in there too; labcut: framing, gains)
    return libText;
  }
  let planSeq = 0;
  async function sendPlan({ force = false, fade = false } = {}) {
    const L = lab();
    if (!L || !S.view || !S.edit) return;
    const my = ++planSeq;
    // seqguard: everything below goes to one page; a page replaced meanwhile (a frame swap, ↻) gets it all again
    // from its own "ready" (restore), so a half-sent plan never lands on the new page without its titles code or files
    const sent = S.sent; const page = S.page;
    const gone = () => sent !== S.sent || page !== S.page;
    const { plan, assets } = compile();
    for (const p of assets) if (!S.probes.has(p)) await probe(p);
    if (my !== planSeq || gone()) return;
    const fresh = compile().plan; // fps from the probes
    if (!sent.libs) {
      sent.libs = true;
      try { const code = await libs(); if (gone()) return; L.send({ type: 'seq-libs', code }); } catch (err) { console.warn('Sequence: titles / transitions code', err); }
      try { const f = await window.hub.fs.read(`${appDir()}/assets/oxanium.ttf`, { encoding: 'buffer' }); if (gone()) return; L.send({ type: 'seq-font', name: 'Oxanium', buffer: f }); } catch { /* the fallback fonts */ }
    }
    for (const p of assets) {
      if (sent.assets.has(p)) continue;
      sent.assets.add(p);
      try { const bytes = await window.hub.fs.read(p, { encoding: 'buffer' }); if (gone()) return; L.send({ type: 'seq-asset', id: p, buffer: bytes, mime: IMG.test(p) ? `image/${/png$/i.test(p) ? 'png' : 'jpeg'}` : AUD.test(p) ? `audio/${({ mp3: 'mpeg', m4a: 'mp4', aac: 'aac', wav: 'wav', ogg: 'ogg', flac: 'flac', opus: 'ogg' })[p.split('.').pop().toLowerCase()] || 'mpeg'}` : 'video/mp4' }); } catch (err) { sent.assets.delete(p); toast(`Couldn't read ${base(p)}: ${err.message}`, { type: 'error' }); }
    }
    if (my !== planSeq || gone()) return;
    const text = JSON.stringify(fresh);
    if (!force && text === sent.plan) return;
    sent.plan = text;
    errsAfterPlan(fresh);
    S.planId += 1;
    L.send({ type: 'seq-set', plan: fresh, fade, id: S.planId });
    plan.dur = fresh.dur;
  }
  const pushPlan = debounce(() => { sendPlan().catch((err) => console.warn(err)); }, 40);

  // ---------- the view (the Lab timeline becomes the sequence) ----------
  async function enter() {
    const L = lab();
    if (!L) throw new Error('Open the Three.js Lab first');
    await current(); // the scene on screen's own sequence
    if (S.view) { redraw(); return true; }
    if (L.player.recording) throw new Error('Stop the recording first');
    S.view = true;
    S.entered = L.sketchId();
    S.sent.plan = '';
    L.bar.classList.add('seq-on');
    refs.tab.classList.add('on');
    refs.view.hidden = false;
    await Promise.all([ensureSong(), loadMaps(), loadNested(S.edit)]);
    S.playing = false; S.want = false;
    if (L.player.playing) L.player.toggle(false);
    // the preview takes the sequence's shape (one pretty reload when it was "fit"); the size you had comes back after
    S.sizeBefore = L.stage.size.id;
    const fmt = D.formatOf(S.edit);
    if (L.stage.size.id !== fmt) L.stage.setMode(fmt);
    await sendPlan({ force: true });
    send({ type: 'seq-seek', T: S.T });
    L.send({ type: 'seq-loop', on: S.loop, range: rangeOf() });
    requestAnimationFrame(() => { measure(); redraw(); placeHead(); paintTime(); });
    S.lastState = performance.now(); guardOn();
    emit('mode', { on: true });
    return true;
  }
  // back to the sketch: the sequence leaves the page, the sketch (and its own song) come back in place
  async function leave({ rerun = true } = {}) {
    const L = lab();
    if (!S.view || !L) return false;
    stopShuttle();
    S.view = false; S.playing = false; S.want = false; guardOff();
    L.send({ type: 'seq-off' });
    L.bar.classList.remove('seq-on');
    refs.tab.classList.remove('on');
    refs.view.hidden = true;
    head().getAnimations().forEach((a) => a.cancel());
    // the scene on screen gets its own frame size back (another scene may have come on while the sequence showed)
    const own = L.scenes.frameOf?.(L.sketchId()) || S.sizeBefore;
    if (own && L.stage.size.id !== own && rerun) L.stage.setMode(own);
    S.sizeBefore = null;
    if (rerun) {
      const sid = L.sketchId();
      const song = sid ? L.scenes.songOf(sid) : null;
      if (song) { if (L.player.path !== song) await L.player.load(song, { quiet: true }); else L.player.attach({ playing: false }); } else if (sid && L.scenes.timelineOf?.(sid)) { L.player.unload({ silent: true }); L.send({ type: 'media-unload' }); L.scenes.mediaUp(sid); } else if (L.player.loaded) { L.player.unload({ silent: true }); L.send({ type: 'media-unload' }); }
      L.rerun();
    }
    emit('mode', { on: false });
    return true;
  }
  const toggle = (on) => ((on ?? !S.view) ? enter() : leave());
  // tools/three.js asks before running the sketch: while the sequence is on screen it keeps the page (another sketch
  // opened takes the page back)
  function keep(sketchId) {
    if (!S.view) return false;
    // another scene: its own sequence takes the view (the page stays)
    if (sketchId && S.entered && sketchId !== S.entered) { S.entered = sketchId; switchTo(sketchId).catch((err) => console.warn('Sequence switch', err)); }
    return true;
  }
  // a sketch changed (an edit, a director call): the clips using it play the new version
  function sketchChanged() { if (S.view) pushPlan(); }
  // (seqsolid) an error from a clip's scene (its layers are "<clip>~<layer>" in the preview): ⚠ on that clip, said
  // once in the row's note; it goes when the clip's code changes (a fix), the clip goes, or another sequence shows
  function clipError(msg) {
    const cid = String(msg.layer || '').split('~')[0];
    const f = cid && S.edit ? C.find(S.edit, cid) : null;
    if (!f) return;
    const was = S.errs.get(cid);
    S.errs.set(cid, { message: String(msg.message || 'Error').slice(0, 200), line: msg.line || null, n: (was?.n || 0) + 1 });
    if (!was) { flash(`⚠ ${f.clip.name || 'This clip'}: ${String(msg.message || '').slice(0, 80)}`); redraw(); }
  }
  // what a clip runs (its layers' code): a new version clears its ⚠
  function errsAfterPlan(plan) {
    if (!S.errs.size && !S.errSig.size) return;
    const sig = new Map();
    for (const g of plan.groups || []) if (g.layers) sig.set(g.id, g.layers.map((L) => L.code).join('\n'));
    let n = 0;
    for (const id of [...S.errs.keys()]) if (!sig.has(id) || (S.errSig.has(id) && S.errSig.get(id) !== sig.get(id))) { S.errs.delete(id); n += 1; }
    S.errSig = sig;
    if (n) redraw();
  }
  // the preview page was replaced (a new frame size, a restart): everything goes again
  function onMessage(msg) {
    if (msg.type === 'error') { if (S.view && !S.render) clipError(msg); return false; } // (the Lab's console still logs it)
    if (msg.type === 'ready') { restore('ready').catch((err) => console.warn('Sequence restore', err)); return false; }
    if (msg.type === 'seq-health') { onHealth(msg); return true; }
    if (msg.type === 'seq-state') {
      // a page on its way out (a frame swap's reload) still answers the seeks it had: its clock isn't the sequence's
      // any more (it used to pull the playhead back to where you were before the swap)
      if (lab()?.pageReady && !lab().pageReady()) return true;
      // …and a page being put back reports its first frame before it gets the seek (restore)
      if (S.restoreBusy) { if (Math.abs(msg.T - S.restoreBusy.T) > 0.02 && performance.now() < S.restoreBusy.until) return true; S.restoreBusy = 0; }
      if (S.seekN && (msg.ack || 0) < S.seekN) return true; // answers an older seek
      const was = S.playing;
      S.lastState = performance.now();
      if (S.shuttle >= 0 || !S.shuttleTimer) S.T = msg.T;
      // a page being restored says "paused" until it gets the play again: what you asked for stays on screen
      S.playing = msg.playing || Boolean(S.want && S.restoring && performance.now() < S.restoring);
      if (msg.ended) { S.want = false; S.playing = false; }
      if (msg.ended && was) emit('ended', {});
      paintTime(); follow(); placeHead(); paintPlay();
      if (!msg.playing) thumbSoon();
      for (const w of S.waits.splice(0)) w(msg);
      return true;
    }
    if (msg.type === 'seq-thumb') { onThumb(msg); return true; }
    if (msg.type === 'seq-frame') { const f = S.frames.get(msg.n); if (f) { S.frames.delete(msg.n); f(msg); } return true; }
    if (msg.type === 'seq-offline') return true;
    // the song's own state while the sequence plays it: the sequence owns the clock (the hidden music timeline
    // would otherwise keep redrawing its time and beat readout for nothing)
    if (S.view && msg.type === 'media-state' && !S.render) return true;
    return false;
  }

  // ---------- transport ----------
  // every seek carries a number the page echoes back in its states: a state answering an older seek (or a page that
  // hasn't had one yet) doesn't pull the playhead back (seqguard: scrubbing through a swap used to land on the
  // frame before)
  const send = (m) => { if (m?.type === 'seq-seek' && m.n == null) { S.seekN = (S.seekN || 0) + 1; m = { ...m, n: S.seekN }; } return lab()?.send(m); };
  function seek(T, { snapFrame = true } = {}) {
    const D0 = total();
    S.T = clamp(snapFrame ? frameStart(frameOf(T + 1e-6)) : T, 0, D0);
    if (S.restoreBusy) S.restoreBusy = { ...S.restoreBusy, T: S.T };
    S.moved = (S.moved || 0) + 1;
    if (S.view) send({ type: 'seq-seek', T: S.T });
    paintTime(); placeHead();
    return S.T;
  }
  function play(on = !S.playing, rate = 1) {
    if (!S.view) { enter().then(() => play(on, rate)); return; }
    stopShuttle();
    clearTimeout(aroundT);
    S.playing = on; S.rate = rate; S.want = Boolean(on); S.lastState = performance.now();
    send({ type: 'seq-play', on, rate });
    paintPlay(); placeHead();
  }
  const step = (n) => { play(false); return seek(frameStart(frameOf(S.T) + n)); };
  function stopShuttle() { clearInterval(S.shuttleTimer); S.shuttleTimer = 0; S.shuttle = 0; }
  // J / K / L: L plays (again: 2×, 4×), J plays backward by stepping frames (again: 2×, 4×), K stops on a frame
  function shuttle(dir) {
    if (dir === 0) { stopShuttle(); play(false); seek(S.T); return 0; }
    if (dir > 0) { stopShuttle(); const r = S.playing && S.rate >= 1 ? Math.min(8, S.rate * 2) : 1; play(true, r); S.shuttle = r; return r; }
    const r = S.shuttle < 0 ? Math.min(4, -S.shuttle * 2) : 1;
    play(false); S.shuttle = -r;
    clearInterval(S.shuttleTimer);
    S.shuttleTimer = setInterval(() => { if (S.T <= 0) { stopShuttle(); return; } S.T = Math.max(0, S.T - 1 / fps()); send({ type: 'seq-seek', T: S.T }); paintTime(); placeHead(); }, Math.max(16, 1000 / fps() / r));
    return -r;
  }
  // edit points: cuts, clip and item edges, markers
  function points() {
    const e = S.edit; if (!e) return [];
    const out = new Set([0, total()]);
    for (const x of D.timing(e)) { out.add(r4(x.start)); out.add(r4(x.end)); if (x.td) out.add(r4(x.cut)); }
    for (const k of e.tracks || []) for (const it of k.items) { out.add(r4(it.start)); out.add(r4(C.itemEnd(it))); }
    for (const m of e.markers || []) out.add(r4(m.t));
    return [...out].sort((a, b) => a - b);
  }
  function jump(dir) { const p = points(); const t = dir > 0 ? p.find((x) => x > S.T + 1e-3) : [...p].reverse().find((x) => x < S.T - 1e-3); if (t != null) seek(t); return t; }
  // waits for the preview to report it is at T (checks / directors)
  function settle(ms = 1500) { return new Promise((r) => { const w = (m) => { clearTimeout(t); r(m); }; const t = setTimeout(() => { S.waits = S.waits.filter((x) => x !== w); r(null); }, ms); S.waits.push(w); send({ type: 'seq-seek', T: S.T }); }); } // (seqsolid: a wait that timed out doesn't stay behind)

  // ---------- edits (the classic editing keys) ----------
  const selIds = () => [...S.sel].filter((id) => S.edit && C.find(S.edit, id));
  const underHead = () => { const x = S.edit && C.at(S.edit, Math.min(S.T, Math.max(0, C.mainTotal(S.edit) - 1e-4))); return S.T < C.mainTotal(S.edit || C.empty()) ? x?.clip || null : null; };
  const targets = () => (selIds().length ? selIds() : underHead() ? [underHead().id] : []);
  function split(T = S.T) { const items = selIds().filter((id) => C.find(S.edit, id)?.where === 'item'); return commit(D.split(S.edit, T, { items }), '✂ Split'); }
  function del(ripple = false, ids = targets()) { if (!ids.length) return false; return commit(D.remove(S.edit, ids, { ripple }), ripple ? 'Ripple delete' : 'Deleted (gap kept)'); }
  function dup(id = targets()[0]) { if (!id) return false; const n = D.duplicate(S.edit, id); return commit(n, 'Duplicated'); }
  function slipBy(frames, id = targets()[0]) { if (!id) return false; return commit(D.slip(S.edit, id, frames / fps()), `Slip ${frames > 0 ? '+' : ''}${frames}f`); }
  function trimToHead(edge, id = targets()[0]) {
    const f = id && C.find(S.edit, id); if (!f) return false;
    const st = f.where === 'clip' ? D.timing(S.edit)[f.i] : { start: f.clip.start, end: C.itemEnd(f.clip) };
    return commit(D.trim(S.edit, id, edge, edge === 'in' ? S.T - st.start : S.T - st.end), edge === 'in' ? 'Starts here' : 'Ends here');
  }
  function marker(label = '') { return commit(C.addMarker(S.edit, S.T, label), `Marker ${(S.edit.markers || []).length + 1}`); }
  function setTransition(type, id = null, dur = null) {
    const ids = id ? [id] : selIds().filter((x) => S.edit.clips.some((c) => c.id === x));
    const list = ids.length ? ids : S.edit.clips.slice(1).map((c) => c.id);
    const t = type === 'cut' || type === 'none' ? 'cut' : (EditFX.TRANS[type] ? type : EditFX.find(EditFX.TRANSITIONS, type)?.id);
    if (!t) throw new Error(`No transition "${type}" (try dissolve, dip-black, wipe-left, push-left, zoom-in…)`);
    const d = dur ?? (t === 'cut' ? 0 : EditFX.TRANS[t]?.group === 'Lab' ? EditFX.TRANS[t].d : D.defaultTransDur(grid()) || EditFX.TRANS[t]?.d || 0.5);
    let n = S.edit;
    for (const x of list) n = D.setTrans(n, x, t, d);
    commit(n, t === 'cut' ? 'Cut' : `${EditFX.TRANS[t].name}${ids.length ? '' : ' between every clip'}`);
    return t;
  }
  function setLength(id, secs) { return commit(D.setDur(S.edit, id, secs), `${secs.toFixed(2)} s`); }
  function setLook(id, look) { return commit(C.patchAny(S.edit, [id], (c) => { c.look = look || null; }), look ? `Look “${look}”` : 'No look'); }
  function fit() { const g = grid(); if (!g) { flash('Fitting needs a song with a beat grid'); return false; } return commit(D.fitBars(S.edit, g, { songStart: songStart() }), 'Every cut on a bar'); }
  function setFormat(fmt) { if (!D.FORMATS[fmt]) throw new Error('9:16, 16:9, 1:1 or 4:5'); commit(D.setFormat(S.edit, fmt), `Format ${fmt}`); if (S.view && lab().stage.size.id !== fmt) lab().stage.setMode(fmt); return fmt; }

  // ---------- seqguard: editing power (round 13): nudge, key trims, speed, markers, selection, colors, zoom ----------
  const beatSecs = () => { const g = grid(); return g ? D.beatLen(g) : null; };
  const signed = (x, unit) => `${x > 0 ? '+' : ''}${x}${unit}`;
  // a main clip nudged: it slides between its neighbours (they trim); the first / last one moves a gap before it
  // instead (a gap is made when it moves later, shrinks when it moves back)
  function nudgeMain(e, id, dt) {
    const i = e.clips.findIndex((c) => c.id === id);
    if (i < 0) return e;
    if (i > 0 && i < e.clips.length - 1 && e.clips[i - 1].kind !== 'gap') { const n = D.slide(e, id, dt); if (n !== e) return n; }
    const n = C.copy(e); const pv = n.clips[i - 1];
    if (pv?.kind === 'gap') { const d = r4(pv.dur + dt); if (d < 1 / fps() / 2) n.clips.splice(i - 1, 1); else pv.dur = d; return n; }
    if (dt > 0) { n.clips.splice(i, 0, { id: C.uid(), kind: 'gap', dur: r4(dt), mute: true, fadeIn: 0, fadeOut: 0, speed: 1 }); return n; }
    return e;
  }
  // , / . one frame · Shift: one beat (ten frames without a song) · several selected clips move together
  function nudge(frames = 1, { beats = 0, ids = targets() } = {}) {
    if (!S.edit || !ids.length) { flash('Select a clip to nudge'); return false; }
    const b = beats ? beatSecs() : null;
    const dt = beats ? (b ? beats * b : (beats * 10) / fps()) : frames / fps();
    let n = S.edit;
    for (const id of ids) { const f = C.find(n, id); if (!f) continue; n = f.where === 'item' ? D.move(n, id, Math.max(0, f.clip.start + dt)) : nudgeMain(n, id, dt); }
    if (n === S.edit) { flash('No room to nudge it'); return false; }
    return commit(n, `Nudge ${beats ? (b ? signed(beats, ' beat') : signed(beats * 10, 'f')) : signed(frames, 'f')}`, { merge: 'nudge' });
  }
  // [ / ] the clip's end one frame earlier / later · { / } its start (a scene's content stays in place)
  function trimBy(edge, frames, id = targets()[0]) {
    if (!id) { flash('Select a clip to trim'); return false; }
    const n = D.trim(S.edit, id, edge, frames / fps());
    if (n === S.edit) return false;
    return commit(n, `${edge === 'in' ? 'Start' : 'End'} ${signed(frames, 'f')}`, { merge: `trim-${edge}` });
  }
  // per-clip speed: footage and sound play faster / slower (their length follows), a scene's own clock runs at it
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
  const speedable = (c) => c && (c.kind === 'scene' || c.kind === 'video' || (c.kind === 'audio' && !c.song));
  function setSpeed(rate, ids = targets()) {
    const r = Number(String(rate).replace(/[x×%]/gi, '')) / (/%/.test(String(rate)) ? 100 : 1);
    if (!(r > 0)) throw new Error('Speed: a number like 0.5, 2 or 150%');
    const ok = ids.filter((id) => speedable(C.find(S.edit, id)?.clip));
    if (!ok.length) { flash('Speed is for scene, footage and sound clips'); return false; }
    let n = S.edit; for (const id of ok) n = D.setSpeed(n, id, r);
    return commit(n, `Speed ${r4(r)}×`);
  }
  // markers: go to / rename / delete by number (in time order), name, "next" / "prev"
  const markersSorted = () => [...(S.edit?.markers || [])].sort((a, b) => a.t - b.t);
  function markerRef(ref) {
    const ms = markersSorted();
    if (ref == null || ref === '') return null;
    const s0 = String(ref).trim().toLowerCase();
    if (/^\d+$/.test(s0)) return ms[Number(s0) - 1] || null;
    if (s0 === 'next') return ms.find((m) => m.t > S.T + 1e-3) || null;
    if (s0 === 'prev' || s0 === 'previous') return [...ms].reverse().find((m) => m.t < S.T - 1e-3) || null;
    return ms.find((m) => (m.label || '').toLowerCase() === s0) || ms.find((m) => (m.label || '').toLowerCase().includes(s0)) || null;
  }
  const markerName = (m) => m.label || `Marker ${markersSorted().indexOf(m) + 1}`;
  function goMarker(ref) { const m = markerRef(ref); if (!m) { flash('No marker there'); return null; } play(false); seek(m.t); flash(`▾ ${markerName(m)}`); return m; }
  function renameMarker(ref, label) { const m = markerRef(ref); if (!m) return false; return commit({ ...S.edit, markers: S.edit.markers.map((x) => (x === m ? { ...x, label: String(label || '').trim() } : x)) }, 'Marker renamed'); }
  function deleteMarker(ref) { const m = markerRef(ref); if (!m) return false; return commit({ ...S.edit, markers: S.edit.markers.filter((x) => x !== m) }, 'Marker deleted'); }
  async function namedMarker() { const v = await Modal.prompt('Marker name', { value: '' }); if (v != null) marker(String(v).trim()); }
  const markerList = () => markersSorted().map((m, i) => ({ n: i + 1, t: r4(m.t), label: m.label || '', timecode: tc(m.t) }));
  function setSnap(on = !S.snap) { S.snap = Boolean(on); store.set('three.seq.snap', S.snap); flash(S.snap ? 'Snapping on: bars, beats, markers, edges' : 'Snapping off'); return S.snap; }
  // selection: everything (⌘/Ctrl+A), a time range, from the playhead on (A)
  const pickable = () => (S.edit ? [...S.edit.clips.filter((c) => c.kind !== 'gap').map((c) => c.id), ...(S.edit.tracks || []).flatMap((k) => k.items.filter((x) => !x.song).map((x) => x.id))] : []);
  function selectAll() { S.sel = new Set(pickable()); redraw(); flash(`${S.sel.size} selected`); return S.sel.size; }
  function selectRange(a, b, { main = false } = {}) {
    if (!S.edit) return 0;
    const t0 = Math.min(a, b); const t1 = Math.max(a, b);
    const ids = D.timing(S.edit).filter((x) => x.clip.kind !== 'gap' && x.end > t0 + 1e-4 && x.start < t1 - 1e-4).map((x) => x.clip.id);
    if (!main) for (const k of S.edit.tracks || []) for (const it of k.items) if (!it.song && C.itemEnd(it) > t0 + 1e-4 && it.start < t1 - 1e-4) ids.push(it.id);
    S.sel = new Set(ids); redraw(); flash(`${ids.length} selected`);
    return ids.length;
  }
  const selectAfter = () => selectRange(S.T, total() + 1);
  // clip colors (a label for your own sorting: drawn as a tint and a stripe; the picture doesn't change)
  const SWATCHES = { red: '#e0565b', orange: '#e8934a', yellow: '#e3c34d', green: '#5bbf6a', teal: '#47b7b0', blue: '#4f8de0', violet: '#9a6be0', pink: '#df6fb4' };
  function setColor(name, ids = targets()) {
    const key = name == null || /^(none|off|no|clear)$/i.test(String(name)) ? null : String(name).toLowerCase();
    if (key && !SWATCHES[key]) throw new Error(`Colors: ${Object.keys(SWATCHES).join(', ')}, none`);
    if (!ids.length) { flash('Select a clip to color'); return false; }
    return commit(C.patchAny(S.edit, ids, (c) => { if (key) c.swatch = key; else delete c.swatch; }), key ? `Color ${key}` : 'No color');
  }
  // zoom to the selection (Z; nothing selected: the whole sequence)
  function zoomToSel() {
    const ids = selIds();
    if (!ids.length) { zoomTo('fit'); return null; }
    const T0 = D.timing(S.edit); let a = Infinity; let b = 0;
    for (const id of ids) { const f = C.find(S.edit, id); const x = f.where === 'clip' ? T0[f.i] : { start: f.clip.start, end: C.itemEnd(f.clip) }; a = Math.min(a, x.start); b = Math.max(b, x.end); }
    const pad = Math.max(0.1, (b - a) * 0.06);
    S.vr = { t0: Math.max(0, a - pad), t1: b + pad }; redraw(); placeHead();
    return [r4(a), r4(b)];
  }
  // Shift+Space: play around the playhead (2 s before to 1 s after) and come back: check an edit without losing your place
  let aroundT = 0;
  function playAround(pre = 2, post = 1) {
    if (!S.edit) return false;
    const at = S.T;
    seek(Math.max(0, at - pre)); play(true);
    aroundT = setTimeout(() => { if (S.playing) play(false); seek(at); }, ((Math.min(pre, at) + post) * 1000) / (S.rate || 1));
    return true;
  }
  // the In–Out range (I / Shift+I): render just that, loop it
  const rangeOf = (e = S.edit) => (e?.mark && !e.mark.lab && e.mark.b > e.mark.a ? { a: e.mark.a, b: e.mark.b } : null);
  function setRange(a, b) {
    if (!S.edit) return null;
    const lo = clamp(Math.min(a, b), 0, total()); const hi = clamp(Math.max(a, b), 0, total());
    if (hi - lo < 1 / fps()) { flash('The range needs an In before its Out'); return null; }
    commit({ ...S.edit, mark: { a: r4(lo), b: r4(hi) } }, `Range ${tc(lo)} – ${tc(hi)}`);
    send({ type: 'seq-loop', on: S.loop, range: rangeOf() });
    return rangeOf();
  }
  function markIn(t = S.T) { const r = rangeOf(); return setRange(t, r && r.b > t ? r.b : total()); }
  function markOut(t = S.T) { const r = rangeOf(); return setRange(r && r.a < t ? r.a : 0, t); }
  function clearRange() { if (!rangeOf()) return false; commit({ ...S.edit, mark: null }, 'No range'); send({ type: 'seq-loop', on: S.loop, range: null }); return true; }
  function rangeToClip(id = targets()[0]) { const f = id && C.find(S.edit, id); if (!f) return null; const x = f.where === 'clip' ? D.timing(S.edit)[f.i] : { start: f.clip.start, end: C.itemEnd(f.clip) }; return setRange(x.start, x.end); }
  // every gap closes (the clips after each one move up): one step, undoable
  function closeGaps() { const gaps = (S.edit?.clips || []).filter((c) => c.kind === 'gap').map((c) => c.id); if (!gaps.length) { flash('No gaps'); return 0; } commit(D.remove(S.edit, gaps, { ripple: true }), `Closed ${gaps.length} gap${gaps.length > 1 ? 's' : ''}`); return gaps.length; }

  // ---------- labcut (round 18): footage framing, sound, captions, looks, chops, outputs ----------
  const fmtNow = () => D.formatOf(S.edit);
  const kindsOf = (ids, ok) => ids.filter((id) => ok(C.find(S.edit, id)?.clip));
  const framable = (c) => c && (c.kind === 'video' || c.kind === 'image');
  const hasSound = (c) => c && (c.kind === 'audio' || c.kind === 'video');
  const gradable = (c) => c && ['scene', 'video', 'image', 'seq', 'title', 'color'].includes(c.kind);
  function needs(ids, what) { if (!ids.length) { flash(`Select ${what} first`); return false; } return true; }
  // framing: per output format (frames[fmt]); "every format" keeps one framing (frame / fit) for all
  function setFrame(spec, ids = targets(), { all = false } = {}) {
    ids = kindsOf(ids, framable);
    if (!needs(ids, 'footage or a picture') || !spec) return false;
    const f0 = fmtNow();
    return commit(C.patchAny(S.edit, ids, (c) => {
      if (spec.reset) { if (all) { delete c.frame; delete c.fit; delete c.frames; } else if (c.frames) { delete c.frames[f0]; if (!Object.keys(c.frames).length) delete c.frames; } return; }
      const { fit, ...pos } = spec;
      if (all) { if (Object.keys(pos).length) c.frame = { ...(c.frame || {}), ...pos }; if (fit) c.fit = fit; return; }
      c.frames = { ...(c.frames || {}) };
      const had = c.frames[f0] || c.frame || {};
      c.frames[f0] = { ...had, ...pos, ...(fit ? { fit } : {}) };
      if (!pos.to && (pos.x != null || pos.y != null) && c.frames[f0].to) delete c.frames[f0].to; // a new spot: a still framing
    }), all ? 'Framing (every format)' : `Framing ${f0}`);
  }
  const setFit = (fit, ids = targets()) => setFrame({ fit }, ids);
  function frameEverywhere(ids = targets()) {
    const f0 = fmtNow();
    ids = kindsOf(ids, framable);
    if (!needs(ids, 'footage or a picture')) return false;
    return commit(C.patchAny(S.edit, ids, (c) => { const own = c.frames?.[f0]; if (own) { const { fit, ...pos } = own; c.frame = pos; if (fit) c.fit = fit; } delete c.frames; }), 'Same framing in every format');
  }
  function setMotion(id, ids = targets()) {
    ids = kindsOf(ids, framable);
    if (!needs(ids, 'footage or a picture')) return false;
    if (id !== 'auto' && !X().MOTION[id]) throw new Error(`Moves: ${X().MOTIONS.map((m) => m.id).join(', ')}, auto`);
    return commit(C.patchAny(S.edit, ids, (c) => { c.motion = id; }), id === 'none' ? 'No move' : `Move: ${id === 'auto' ? '✦ auto' : X().MOTION[id].name}`);
  }
  // sound: volume (a gain: 0.5 = −6 dB), fades in / out (seconds), on footage, sound clips and the song
  const soundIds = (ids) => kindsOf(ids, hasSound);
  function setVolume(v, ids = targets()) {
    const g = typeof v === 'number' ? v : X().parseVolume(v);
    if (g == null) throw new Error('A volume: 50%, 0.5, -6 dB, mute');
    ids = soundIds(ids);
    if (!needs(ids, 'footage or a sound clip')) return false;
    return commit(C.patchAny(S.edit, ids, (c) => { c.volume = r4(clamp(g, 0, 4)); if (c.kind === 'video' && g > 0) c.mute = false; }), `Volume ${Math.round(g * 100)} % (${X().dbOf(g)})`);
  }
  function setFade(edge, secs, ids = targets()) {
    ids = soundIds(ids);
    if (!needs(ids, 'footage or a sound clip')) return false;
    const key = edge === 'in' ? 'fadeIn' : 'fadeOut';
    const d0 = Number(secs) || 0;
    return commit(C.patchAny(S.edit, ids, (c) => { c[key] = r4(clamp(d0, 0, C.durOf(c) / 2)); }), d0 > 0 ? `Sound fade ${edge} ${d0} s` : `No fade ${edge}`);
  }
  function setDuck(on = S.edit?.seq?.duck === false, amount = null) {
    const seq = { ...S.edit.seq, duck: Boolean(on) };
    if (amount != null) seq.duckAmt = clamp(Number(amount), 0.02, 1);
    commit({ ...S.edit, seq }, on ? `The music ducks under the voice (${X().dbOf(seq.duckAmt ?? X().DEFAULT_DUCK)})` : 'No ducking');
    return seq.duck;
  }
  function muteTrack(trackId, on = null) {
    const k = (S.edit.tracks || []).find((x) => x.id === trackId);
    if (!k) return false;
    const key = k.type === 'audio' ? 'mute' : 'hide';
    const v = on == null ? !k[key] : Boolean(on);
    commit({ ...S.edit, tracks: S.edit.tracks.map((x) => (x === k ? { ...x, [key]: v } : x)) }, `${k.name} ${v ? (k.type === 'audio' ? 'muted' : 'hidden') : 'back on'}`);
    return v;
  }
  // color looks (the EditFX looks) on a clip, or on the whole sequence (clips without their own)
  function setGrade(look, { amt = null, ids = targets(), all = false } = {}) {
    if (look && !EditFX.LOOK[look]) { const f = EditFX.find(EditFX.LOOKS, look); if (!f) throw new Error(`No look "${look}" (e.g. ${X().LOOK_PICKS.join(', ')})`); look = f.id; }
    const gr = look ? { look, amt: amt ?? 1 } : null;
    const name = look ? EditFX.LOOK[look].name : 'No look';
    if (all) { const seq = { ...S.edit.seq }; if (gr) seq.grade = gr; else delete seq.grade; commit({ ...S.edit, seq }, `Sequence look: ${name}`); return look; }
    ids = kindsOf(ids, gradable);
    if (!needs(ids, 'a clip')) return null;
    commit(C.patchAny(S.edit, ids, (c) => { if (gr) c.grade = gr; else delete c.grade; }), `Look: ${name}`);
    return look;
  }
  // (round 24 "grade") a clip's ◐ grade (tools/three-grade.js: { grade, lens, name }), or the whole sequence's; null: none
  function setCGrade(spec, { ids = targets(), all = false } = {}) {
    if (all) { const seq = { ...S.edit.seq }; if (spec) seq.cgrade = spec; else delete seq.cgrade; return commit({ ...S.edit, seq }, spec ? `Sequence grade: ${spec.name || '◐'}` : 'No sequence grade'); }
    ids = kindsOf(ids, gradable);
    if (!needs(ids, 'a clip')) return false;
    return commit(C.patchAny(S.edit, ids, (c) => { if (spec) c.cgrade = spec; else delete c.cgrade; }), spec ? `◐ ${spec.name || 'Grade'}` : 'No grade', { merge: spec ? `cgrade:${ids.join(',')}` : null });
  }
  function setGradeAmt(amt, ids = targets()) { ids = kindsOf(ids, (c) => c?.grade); if (!needs(ids, 'a clip with a look')) return false; return commit(C.patchAny(S.edit, ids, (c) => { c.grade = { ...c.grade, amt: clamp(Number(amt), 0, 1.5) }; }), `Look strength ${Math.round(amt * 100)} %`); }
  // ✂ on the music: the clip cut at every bar (2 bars, a beat) of the song
  function chop(every = 'bar', ids = targets()) {
    const g = grid();
    if (!g) { flash('Chopping on the music needs a song with a beat grid'); return 0; }
    const T0 = D.timing(S.edit);
    const mains = ids.map((id) => T0.find((x) => x.clip.id === id)).filter((x) => x && x.clip.kind !== 'gap');
    const times = mains.flatMap((x) => X().chopTimes(g, x.start + x.td, x.end - (T0[x.i + 1]?.td || 0), { every, songStart: songStart() }));
    if (!times.length) { flash('No bar line inside that clip'); return 0; }
    let n = S.edit;
    for (const t of times) n = D.split(n, t);
    commit(n, `✂ Chopped on every ${every === 'beat' ? 'beat' : typeof every === 'number' ? `${every} bars` : 'bar'} (${times.length} cuts)`);
    return times.length;
  }
  // captions: a Captions track from an .srt / .vtt, or typed lines; a look for all of them; back out as .srt
  function captionsFromCues(cues, { look = S.edit?.seq?.captionLook || 'clean', offset = 0, replace = true } = {}) {
    if (!cues.length) throw new Error('No captions in there');
    let n = S.edit;
    if (replace) n = { ...n, tracks: (n.tracks || []).map((k) => (k.type === 'text' && /^captions/i.test(k.name) ? { ...k, items: [] } : k)) };
    for (const q of cues) n = D.addTo(n, 'captions', X().captionItem({ a: q.a + offset, b: q.b + offset, text: q.text }, look));
    commit(n, `${cues.length} caption${cues.length > 1 ? 's' : ''}`);
    return cues.length;
  }
  async function captionsFile(p, opts = {}) {
    if (!p) { [p] = (await window.hub.openDialog({ title: 'Captions (.srt or .vtt)', filters: [{ name: 'Captions', extensions: ['srt', 'vtt'] }] })) || []; if (!p) return 0; }
    const text = await window.hub.fs.read(p);
    return captionsFromCues(X().parseSubs(text), opts);
  }
  function captionsTyped(text, { each = null, look } = {}) {
    const rg = rangeOf(); const g = grid();
    const start = rg ? rg.a : S.T >= total() - 1e-3 ? 0 : S.T;
    const cues = X().typedCues(text, rg ? { start: rg.a, end: rg.b } : { start, each: each || (g ? D.barLen(g) : 2) });
    return captionsFromCues(cues, { ...(look ? { look } : {}), replace: false });
  }
  function captionLook(look) {
    if (!X().CAPTION_LOOK[look]) throw new Error(`Caption looks: ${X().CAPTION_LOOKS.map((l) => l.id).join(', ')}`);
    const L = X().CAPTION_LOOK[look];
    const n = { ...S.edit, seq: { ...S.edit.seq, captionLook: look }, tracks: (S.edit.tracks || []).map((k) => (k.type === 'text' && /^captions/i.test(k.name) ? { ...k, items: k.items.map((x) => ({ ...x, style: L.style, anim: L.anim, caption: L.id })) } : k)) };
    commit(n, `Captions: ${L.name}`);
    return look;
  }
  async function exportCaptions() {
    const cues = captionCues(S.edit);
    if (!cues.length) throw new Error('No captions yet (⋯ → Text & captions)');
    const p = await uniqueOut(await outDir(), `${(S.edit.seq?.name || S.key.slice(4)).replace(/[\\/:*?"<>|]+/g, '_')} captions`, 'srt');
    await window.hub.fs.write(p, X().toSRT(cues));
    toast(`Captions saved: ${base(p)}`, { timeout: 4000, action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    return p;
  }
  function addLower(text, { preset = 'forge', at = S.T, dur = null } = {}) {
    if (!EditFX.LTHIRD[preset]) { const f = EditFX.find(EditFX.LOWER_THIRDS, preset); if (!f) throw new Error(`Lower thirds: ${EditFX.LOWER_THIRDS.slice(0, 8).map((l) => l.id).join(', ')}…`); preset = f.id; }
    const g = grid();
    const n = D.addTo(S.edit, 'titles', X().lowerThird(text, { preset, at, dur: dur || (g ? 2 * D.barLen(g) : 4) }));
    commit(n, `＋ Lower third (${EditFX.LTHIRD[preset].name})`);
    select(n.lastItem);
    return n.lastItem;
  }
  // outputs: one sequence, several formats; ⇪ renders them one after the other (the render queue shows each)
  const outputsOf = (e = S.edit) => (e?.seq?.outputs?.length ? e.seq.outputs.filter((f) => D.FORMATS[f]) : [D.formatOf(e)]);
  function setOutputs(list) {
    const fs = [...new Set([].concat(list || []).filter((f) => D.FORMATS[f]))];
    if (!fs.length) throw new Error('Formats: 9:16, 1:1, 16:9, 4:5 (or socials, all)');
    commit({ ...S.edit, seq: { ...S.edit.seq, outputs: fs } }, `Outputs: ${fs.join(' · ')}`);
    return fs;
  }
  async function renderOutputs(opts = {}) {
    const last = store.get('three.seq.renderOpts', {});
    const out = [];
    for (const f of outputsOf()) out.push(await render({ format: f, fps: last.fps || null, crf: QUALITY[last.quality]?.crf || 18, sound: true, ...opts }));
    return out;
  }
  // go to a clip (by number, "Titles.2" or name): selected, the playhead at its start
  function goClip(ref) {
    const id = D.resolve(S.edit, ref); if (!id) return null;
    const f = C.find(S.edit, id); const st = f.where === 'clip' ? D.timing(S.edit)[f.i].start : f.clip.start;
    play(false); seek(st); select(id);
    return id;
  }

  // ---------- adding (drag from sources, the ＋ picker, commands, directors) ----------
  // what: { sketch } | { chat } | { look, sketch } | { path } | { text } | { overlay: { name, code } } | { board: { boardId, itemIds } }
  async function add(what, { at = null, index = null, dur = null, bars = null, look = undefined, trans, gap = false } = {}) {
    if (!S.edit) await current();
    const g = grid();
    const len = bars && g ? r4(bars * D.barLen(g)) : dur;
    let n = S.edit;
    if (what.chat) { const sid = typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(what.chat) : null; if (!sid) throw new Error('That chat has no scene yet'); what = { sketch: sid }; }
    if (what.sketch) {
      const sk = lab().scenes.get(what.sketch);
      if (!sk) throw new Error('No such sketch');
      n = D.addScene(n, sceneOf(sk, { look: look ?? what.look ?? null }), { at, index, dur: len, grid: g, trans, gap });
      if (g && !len && at == null) n = D.fitBars(n, g, { songStart: songStart(n) });
      commit(n, `＋ ${sk.name}`);
      select(n.lastClip);
      return n.lastClip;
    }
    if (what.path) {
      const p = what.path;
      // (labcut) footage keeps an in / out it came with (a board clip's), captions files make the Captions track
      if (VID.test(p)) { const d = await durationOf(p); await probe(p); const a0 = Number(what.a) > 0 ? Math.min(Number(what.a), Math.max(0, d - 0.1)) : 0; const b0 = Number(what.b) > a0 ? Math.min(Number(what.b), d) : null; n = D.addFootage(n, p, { duration: d, a: a0, ...(b0 ? { b: b0 } : {}), at, index, grid: g, trans, gap, mute: Boolean(songItem()) }); if (len) n = D.setDur(n, n.lastClip, len); commit(n, `＋ ${base(p)}`); select(n.lastClip); return n.lastClip; }
      if (AUD.test(p)) {
        const d = await durationOf(p);
        if (!what.role && (!songItem() || what.song)) { n = D.setSong(n, p, d); commit(n, `♪ ${base(p)}`); await ensureSong(); return 'song'; }
        n = D.addAudio(n, p, d, { at: at ?? S.T, role: what.role || 'sound' }); commit(n, `＋ ${what.role === 'voice' ? '🎙 ' : what.role === 'sfx' ? '✸ ' : ''}${base(p)}`); select(n.lastItem); return n.lastItem;
      }
      if (/\.(srt|vtt)$/i.test(p)) { await captionsFile(p); return 'captions'; }
      if (IMG.test(p)) { const id = C.uid(); const it = { kind: 'image', src: p, dur: len || 2, mute: true }; n = D.place(n, { ...it, id, speed: 1, fadeIn: 0, fadeOut: 0 }, { at, index, grid: g, trans }); commit(n, `＋ ${base(p)}`); select(id); return id; }
      throw new Error(`${base(p)}: a video, a picture, a sound or a captions file`);
    }
    if (what.text != null) { n = D.addTitle(n, what.text, { at: at ?? S.T, dur: len || 2.5, style: what.style || 'bold', anim: what.anim || 'fade-up' }); commit(n, '＋ Title'); select(n.lastItem); return n.lastItem; }
    if (what.overlay) { n = D.addOverlay(n, what.overlay, { at: at ?? S.T, dur: len || Math.max(1, (total() || 4) - (at ?? S.T)) }); commit(n, `＋ ${what.overlay.name}`); select(n.lastItem); return n.lastItem; }
    if (what.board) return applyVibe(what.board, { at });
    if (what.seq) return nest(what.seq, { at });
    if (what.arrange) return arrange();
    throw new Error('Nothing to add');
  }
  // a mood-board reference gives a clip its VIBE (its palette on the scene's colors), never its footage
  async function applyVibe(ref, { at = null } = {}) {
    if (typeof Board === 'undefined' || typeof BoardVibe === 'undefined') throw new Error('The mood board isn\'t loaded');
    await Board.ready?.();
    const b = ref.boardId ? await Board.load?.(ref.boardId) : Board.current();
    const items = (b?.items || []).filter((i) => i.type !== 'frame' && (!ref.itemIds?.length || ref.itemIds.includes(i.id)));
    const pal = (BoardVibe.summary(items).palette || []).slice(0, 5).map((c) => c.hex);
    if (!pal.length) throw new Error('No colors in that reference yet');
    const x = at != null ? C.at(S.edit, at) : null;
    const target = x?.clip?.kind === 'scene' ? x.clip : selIds().map((id) => C.find(S.edit, id)?.clip).find((c) => c?.kind === 'scene') || underHead();
    if (target?.kind === 'scene') { commit(C.patchAny(S.edit, [target.id], (c) => { c.vibe = { palette: pal, board: b?.name || null }; }), `Board vibe on “${target.name}” (its colors, not its footage)`); return target.id; }
    const sid = lab().sketchId();
    return add({ sketch: sid, look: null }, { at }).then((id) => { commit(C.patchAny(S.edit, [id], (c) => { c.vibe = { palette: pal, board: b?.name || null }; }), 'Board vibe'); return id; });
  }
  // the scene on screen at the playhead (the preview's right-click "add this scene here")
  async function addCurrent({ at = null } = {}) {
    const sid = lab()?.sketchId();
    if (!sid) throw new Error('No scene on screen');
    if (!S.edit) await current();
    const id = await add({ sketch: sid }, { at: at ?? (S.view ? S.T : null) });
    if (!S.view) toast(`Added “${lab().scenes.get(sid)?.name}” to the sequence`, { timeout: 2600, action: { label: '▤ Show it', fn: () => enter() } });
    return id;
  }
  function select(id, { add: plus = false } = {}) {
    if (!plus) S.sel.clear();
    if (id && S.edit && C.find(S.edit, id)) S.sel.add(id);
    redraw();
  }

  // ---------- ✦ arranging (seq2): fewer decisions (tools/three-seq-arrange.js, tools/three-seq-templates.js) ----------
  const sceneSpec = (id) => { const sk = lab()?.scenes.get(id); return sk ? { sketch: id, name: sk.name, looks: lookNames(sk), song: lab().scenes.songOf?.(id) || null } : null; };
  // the scenes to arrange: the one on screen (this chat's), the other chats' scenes, then your latest sketches
  function pickScenes({ from = 'auto', names = null, max = 6 } = {}) {
    const L = lab(); if (!L) return [];
    const out = []; const add = (id) => { if (id && !out.includes(id) && L.scenes.get(id)) out.push(id); };
    if (names?.length) { for (const nm of names) add(sceneRefSync(nm)); return out.map(sceneSpec).filter(Boolean); }
    add(S.owner || L.sketchId());
    if (from !== 'recent' && typeof ChatScenes !== 'undefined') for (const c of [...(H.chats || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) add(ChatScenes.linkOf?.(c.id));
    if (from !== 'chats') for (const sk of [...L.scenes.all()].sort((a, b) => b.updatedAt - a.updatedAt)) add(sk.id);
    return out.slice(0, max).map(sceneSpec).filter(Boolean);
  }
  function sceneRefSync(v) {
    const L = lab(); if (!L || v == null) return null;
    if (L.scenes.get(v)) return v;
    const q = String(v).toLowerCase(); const all = L.scenes.all();
    return (all.find((x) => x.name.toLowerCase() === q) || all.find((x) => x.name.toLowerCase().includes(q)))?.id || null;
  }
  // the song as the arranger needs it: its length, beat grid and sections (waits for the Lab's analysis)
  async function songInfo(e = S.edit) {
    const s = e ? D.songOf(e) : null; const P = lab()?.player;
    if (!s || !P) return null;
    if (P.path !== s.src) await P.load(s.src, { quiet: true });
    for (let i = 0; i < 120 && !P.analysis && P.path === s.src; i += 1) await sleep(200);
    const g = grid(); const a = P.analysis;
    return { src: s.src, dur: P.duration || s.max || s.out, grid: g ? { bpm: g.bpm, anchor: g.anchor, bpb: g.bpb } : null, sections: a?.sections || [], drops: a?.drops || [] };
  }
  const newSeed = () => Math.floor(Math.random() * 1e5) + 1;
  async function arrange({ template = null, scenes = null, from = 'auto', names = null, secs = null, seed = null, lines = null, keepOrder = false, song: songPath = null } = {}) {
    if (!A) throw new Error('The arranger is not loaded');
    if (!S.edit) await current();
    const sc = scenes || pickScenes({ from, names });
    if (!sc.length) throw new Error('No scenes to arrange yet: make one in the Lab first');
    let base = S.edit;
    // the song: the one asked for, the sequence's own, else the scene's
    const want = songPath || (!D.songOf(base) && sc[0]?.song && AUD.test(sc[0].song) ? sc[0].song : null);
    if (want) { const d = await durationOf(want); if (d) base = D.setSong(base, want, d); }
    await ensureSongOf(base);
    const song = await songInfo(base);
    const T = A.find(template) || A.find(base.seq?.arranged?.template) || A.find('music-video');
    const r = A.arrange(base, { scenes: sc, song, template: T, secs, seed: seed ?? newSeed(), lines, name: base.seq?.name, keepOrder });
    commit(r.edit, `✦ ${r.info.name}: ${r.info.clips} clips${r.info.cutsOnBars ? ', cuts on bars' : ''}`);
    S.loop = Boolean(r.edit.seq?.loop); send({ type: 'seq-loop', on: S.loop, range: rangeOf() });
    S.vr = null; seek(0);
    return r.info;
  }
  // a template from the menu: lyric videos and changelogs ask for their lines (one per line; empty: placeholders)
  async function arrangeAs(t) {
    let lines = null;
    if (t.lines) { const v = await Modal.prompt(t.lines === 'lyric' ? 'The lyrics, one line each (or leave it empty)' : 'The items, one per line (or leave it empty)', { value: '', multiline: true }); if (v == null) return null; lines = String(v).split(/\r?\n/).map((x) => x.trim()).filter(Boolean); }
    return arrange({ template: t.id, lines }).catch((err) => toast(err.message, { type: 'error' }));
  }
  // ✦ Let Astra pick the arrangement: one small question (decide.js), applied with Undo
  async function decideArrangement(goal = '') {
    if (typeof Decide === 'undefined' || !Decide.KINDS?.arrangement) return arrange();
    if (!S.edit) await current();
    const song = D.songOf(S.edit) ? await songInfo() : null;
    const names = pickScenes().map((x) => x.name).join(', ');
    return Decide.run('arrangement', { goal: `${goal ? `${goal}. ` : ''}the shape that suits these scenes (${names}) on this song (${A.songWords(song)})` });
  }
  // ✦ Again: the same template, another arrangement (like 🎲 Shuffle)
  const again = () => arrange({ template: S.edit?.seq?.arranged?.template || null, secs: S.edit?.seq?.arranged?.secs || null });
  // re-time to a song: the clips keep their order and looks, the cuts move to the new song's bars and sections
  async function retime(songPath = null) {
    if (!S.edit) await current();
    const clips = S.edit.clips.filter((c) => c.kind === 'scene');
    if (!clips.length) throw new Error('No scene clips to re-time');
    return arrange({ scenes: clips, keepOrder: true, song: songPath, template: S.edit.seq?.arranged?.template || 'music-video' });
  }
  // the 15 s and 6 s versions: new sequences (this scene's too) around the drop of the same song
  async function versions(lens = [15, 6], { render: doRender = false } = {}) {
    if (!S.edit) await current();
    const song = await songInfo();
    const made = [];
    for (const secs of lens) {
      const r = A.cutdown(S.edit, Number(secs), { song, seed: newSeed() });
      const key = await uniqueKey(`${S.key.slice(4)} ${secs}s`);
      r.edit.seq = { ...r.edit.seq, name: key.slice(4), scene: S.owner || r.edit.seq?.scene || null };
      await VC()?.storeEdit(key, r.edit, `${secs} s version`);
      made.push({ key, secs: Number(secs), clips: r.info.clips, seconds: r.info.seconds });
      if (doRender) { const out = await renderEdit(r.edit, { name: key.slice(4) }); made[made.length - 1].file = out.path; }
    }
    await list();
    toast(`Made ${made.map((m) => `${m.secs} s`).join(' and ')} version${made.length > 1 ? 's' : ''} (▾ the name chip opens them)`, { timeout: 4000, action: made[0] ? { label: `Open ${made[0].secs} s`, fn: () => open(made[0].key) } : null });
    return made;
  }
  async function fillGap(id) {
    const r = A.fillGap(S.edit, id, pickScenes(), { grid: grid(), seed: newSeed() });
    commit(r.edit, `✦ Filled with “${r.scene}”`);
    if (r.id) select(r.id);
    return r;
  }
  // a variation of a clip (V: another one, like Shuffle; Shift+V: back to the scene as saved)
  function vary(id = targets()[0], { amount = null, reset = false } = {}) {
    const f = id && C.find(S.edit, id);
    if (!f || f.clip.kind !== 'scene') { flash('Select a scene clip'); return false; }
    const amt = amount ?? f.clip.vary?.amount ?? 0.4;
    return commit(C.patchAny(S.edit, [id], (c) => { if (reset) delete c.vary; else c.vary = { seed: newSeed(), amount: r4(clamp(amt, 0.05, 1)) }; }), reset ? 'As saved' : `Variation ${Math.round(amt * 100)} %`);
  }
  const varySections = () => commit(A.varySections(S.edit, { seed: newSeed() }), 'A variation per section');
  // the look (saved look, variation, board vibe) of one clip onto another, or two clips swapping theirs
  let lookClip = null;
  const lookOf = (c) => ({ look: c.look || null, vary: c.vary || null, vibe: c.vibe || null });
  function copyLook(id) { const c = C.find(S.edit, id)?.clip; if (c?.kind !== 'scene') return false; lookClip = lookOf(c); flash('Look copied'); return true; }
  function pasteLook(id) { if (!lookClip) return false; return commit(C.patchAny(S.edit, [].concat(id), (c) => { if (c.kind !== 'scene') return; c.look = lookClip.look; if (lookClip.vary) c.vary = { ...lookClip.vary }; else delete c.vary; if (lookClip.vibe) c.vibe = lookClip.vibe; else delete c.vibe; }), 'Look pasted'); }
  function swapLooks(id) {
    const i = S.edit.clips.findIndex((c) => c.id === id);
    const j = S.edit.clips.findIndex((c, k) => k > i && c.kind === 'scene');
    if (i < 0 || j < 0) { flash('No scene after it'); return false; }
    const a = lookOf(S.edit.clips[i]); const b = lookOf(S.edit.clips[j]);
    const put = (c, x) => { c.look = x.look; if (x.vary) c.vary = x.vary; else delete c.vary; if (x.vibe) c.vibe = x.vibe; else delete c.vibe; };
    return commit(C.patchAny(C.patchAny(S.edit, [S.edit.clips[i].id], (c) => put(c, b)), [S.edit.clips[j].id], (c) => put(c, a)), 'Looks swapped');
  }
  // a sequence as a clip (nested): it plays that sequence's pictures and titles
  async function nest(key, { at = null } = {}) {
    if (!S.edit) await current();
    if (key === S.key) throw new Error('A sequence can\'t hold itself');
    const sub = await readEdit(key);
    if (!sub) throw new Error('No such sequence');
    S.nested.set(key, sub); await loadNested(sub);
    const clip = D.seqClip(key, key.slice(4), programEnd(sub));
    commit(D.place(S.edit, clip, { at, grid: grid() }), `＋ ▤ ${key.slice(4)}`);
    return clip.id;
  }
  // a nested clip back to its own clips (here, editable)
  function unnest(id) {
    const f = C.find(S.edit, id);
    if (f?.clip.kind !== 'seq') return false;
    const only = C.copy(S.edit);
    const others = only.clips.filter((c) => c.kind === 'seq' && c.id !== id).map((c) => c.id);
    only.clips = only.clips.map((c) => (others.includes(c.id) ? { ...c, kind: '__seq' } : c));
    const n = D.flatten(only, (ref) => S.nested.get(ref) || null, 0, new Set([S.key]));
    n.clips = n.clips.map((c) => (c.kind === '__seq' ? { ...c, kind: 'seq' } : c));
    return commit(n, 'Unnested');
  }

  // scene clips rendered through the Lab (for Premiere's FCP XML, adobe.js): each one becomes a video of exactly its
  // length (offline, at the sequence's frame size), the rest of the edit stays as it is
  const needsBake = (e) => Boolean(e?.clips?.some((c) => c.kind === 'scene' || c.kind === 'seq') || (e?.tracks || []).some((k) => k.items.some((x) => x.kind === 'layer')));
  // Scenes joined by a transition only the Lab can draw (a morph through shared layers, a camera fly-through) are
  // baked together, transition included, so the export shows exactly what the Lab shows; the others one by one.
  function bakeRuns(e) {
    const runs = [];
    e.clips.forEach((c, i) => {
      if (c.kind !== 'scene') return;
      const prev = runs[runs.length - 1];
      if (prev && prev.end === i - 1 && c.trans && TR()?.bakeTogether(c.trans.type)) prev.end = i; else runs.push({ start: i, end: i });
    });
    return runs;
  }
  async function bake(e0, { onProgress } = {}) {
    if (!needsBake(e0)) return e0;
    await loadNested(e0);
    const n = C.copy(flat(e0));
    const runs = bakeRuns(n);
    const items = (n.tracks || []).flatMap((k) => k.items.filter((x) => x.kind === 'layer'));
    const jobs = runs.length + items.length;
    let done = 0;
    const one = () => { const o = D.create({ format: D.formatOf(n), fps: n.seq?.fps || 30, name: 'bake' }); o.seq.w = n.seq?.w || o.seq.w; o.seq.h = n.seq?.h || o.seq.h; return o; };
    // from the last run back (the indices before it stay right)
    for (const r of [...runs].reverse()) {
      const clips = n.clips.slice(r.start, r.end + 1).map((c, j) => (j ? C.copy(c) : { ...C.copy(c), trans: undefined }));
      const solo = C.normalize({ ...one(), clips });
      const name = clips.map((c) => c.name || 'scene').join(' + ');
      const out = await renderEdit(solo, { name: `${name} (baked)`, quiet: true, library: false, onProgress: (p) => onProgress?.((done + p) / jobs) });
      done += 1;
      const d = C.mainTotal(solo);
      const first = n.clips[r.start];
      n.clips.splice(r.start, r.end - r.start + 1, { ...C.videoClip(out.path, 0, d, d), mute: true, trans: first.trans, name, fromScene: first.sketch });
    }
    for (const c of items) {
      const solo = C.normalize(D.addOverlay(one(), { name: c.name, code: c.code, opacity: 1 }, { at: 0, dur: C.durOf(c) }));
      const out = await renderEdit(solo, { name: `${c.name || 'layer'} (baked)`, quiet: true, library: false, onProgress: (p) => onProgress?.((done + p) / jobs) });
      done += 1;
      const d = C.durOf(c);
      Object.assign(c, { kind: 'video', src: out.path, in: 0, out: d, max: d, mute: true, blend: c.blend || 'screen' });
    }
    return n;
  }
  // ---------- render: frame by frame, at the frame size, muxed with the sound ----------
  async function renderFrames(e, { w, h, n0 = 0, n1, onFrame, onProgress, dir }) {
    const L = lab();
    const F = e.seq?.fps || 30;
    let wrote = 0;
    for (let n = n0; n < n1; n += 1) {
      while (S.render?.paused && !S.render.cancel) await sleep(200); // (round 13) paused from the render queue
      if (S.render?.cancel) throw new Error('Render cancelled');
      const msg = await new Promise((r) => { const t = setTimeout(() => { S.frames.delete(n); r({ error: 'The preview stopped answering' }); }, 30000); S.frames.set(n, (m) => { clearTimeout(t); r(m); }); L.send({ type: 'seq-frame', n, T: r4(n / F), w, h }); });
      if (msg.error) throw new Error(`Frame ${n}: ${msg.error}`);
      await window.hub.fs.write(`${dir}/frame_${String(n - n0).padStart(5, '0')}.jpg`, new Uint8Array(msg.buffer));
      wrote += 1;
      onFrame?.(n, msg);
      onProgress?.((n - n0 + 1) / (n1 - n0));
    }
    return wrote;
  }
  // the sound: the song from its in-point at its start, audio clips, footage with its sound on
  function audioPlan(e0, dur, from = 0) {
    const e = flat(e0);
    const parts = [];
    // (labcut) each part's fades, and whether it's the voice (the rest ducks under it)
    const voice = (k) => Boolean(X()?.isVoice(k));
    for (const k of (e.tracks || []).filter((x) => x.type === 'audio' && !x.mute)) for (const it of k.items) if (it.src && !it.off) parts.push({ src: it.src, at: it.start, a: it.in, len: (it.out - it.in) / (it.speed || 1), volume: it.volume ?? 1, speed: it.speed || 1, fadeIn: it.fadeIn || 0, fadeOut: it.fadeOut || 0, voice: voice(k) });
    for (const x of D.timing(e)) { const c = x.clip; if (c.kind === 'video' && !c.mute && !c.off) parts.push({ src: c.src, at: x.start, a: c.in, len: x.end - x.start, volume: c.volume ?? 1, speed: c.speed || 1, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0 }); }
    for (const k of (e.tracks || []).filter((x) => x.type === 'video' && !x.hide)) for (const it of k.items) if (it.kind === 'video' && it.mute === false && !it.off) parts.push({ src: it.src, at: it.start, a: it.in, len: C.itemEnd(it) - it.start, volume: it.volume ?? 1, speed: it.speed || 1, fadeIn: it.fadeIn || 0, fadeOut: it.fadeOut || 0 });
    // (from: a range render starts there: what began before it is cut to it, the rest moves up; a fade in that was
    // cut off goes)
    if (from > 0) for (const p of parts) { if (p.at < from) { const cut = from - p.at; p.a += cut * (p.speed || 1); p.len -= cut; p.at = 0; p.fadeIn = 0; } else p.at -= from; }
    return parts.filter((p) => p.at < dur - from && p.len > 0.01);
  }
  const duckOf = (e0) => { const e = flat(e0); const x0 = X(); if (!x0 || e.seq?.duck === false) return null; const ranges = x0.voiceRanges(e, C.itemEnd); return ranges.length ? { ranges, amount: e.seq?.duckAmt ?? x0.DEFAULT_DUCK } : null; };
  async function ffmpegOf() { try { const t = await window.hub.video.tools({ ffmpeg: H.settings().ffmpegPath || undefined }); return t?.ffmpeg ? t : null; } catch { return null; } }
  async function outDir() {
    try { const d = await window.hub.capture.dir(); if (d?.dir) return `${d.dir}${d.dir.includes('\\') ? '\\' : '/'}made`; } catch { /* below */ }
    const home = await window.hub.fs.home();
    return WinMac.join(home, 'Hearth sequences'); // (round 31, winmac) C:\Users\me\Hearth sequences on Windows
  }
  async function uniqueOut(dir, stem, ext) {
    let p = WinMac.join(dir, `${stem}.${ext}`);
    for (let i = 2; i < 200 && await window.hub.fs.stat(p).catch(() => null); i += 1) p = WinMac.join(dir, `${stem} (${i}).${ext}`);
    return p;
  }
  // ffmpeg jobs: one listener for all of them (the bridge's onJob can't be unsubscribed)
  const jobs = new Map();
  let jobsOn = false;
  function runJob(job) {
    if (!jobsOn) {
      jobsOn = true;
      window.hub.video.onJob((ev) => {
        const j = jobs.get(ev.id);
        if (!j) return;
        if (ev.type === 'progress') j.job.onProgress?.(ev.pct);
        if (ev.type === 'done') { jobs.delete(ev.id); if (ev.code === 0) j.resolve(ev); else j.reject(new Error(ev.error || `ffmpeg ended with ${ev.code}`)); }
      });
    }
    return new Promise((resolve, reject) => {
      jobs.set(job.id, { job, resolve, reject });
      window.hub.video.transcode({ id: job.id, input: job.input, output: job.output, args: job.args, duration: job.duration }, { ffmpeg: H.settings().ffmpegPath || undefined }).catch((err) => { jobs.delete(job.id); reject(err); });
    });
  }
  // an edit (the sequence, or one baked scene) → an mp4. Needs the Lab preview at the frame size (the page draws the
  // scenes at their real pixels), so it switches there first and comes back after.
  async function renderEdit(e, { format = null, name = null, quiet = false, library = true, onProgress = null, realtime = false, fps = null, crf = 18, sound = true, range = null } = {}) {
    const L = lab();
    if (!L) throw new Error('Open the Three.js Lab first');
    if (S.render) throw new Error('A render is running');
    const fmt = format || D.formatOf(e);
    const [w, h] = D.FORMATS[fmt] || [e.seq?.w || 1080, e.seq?.h || 1920];
    let re = C.copy(e);
    if (format) re = D.setFormat(re, fmt);
    if (fps) re = { ...re, seq: { ...(re.seq || {}), fps: Number(fps) } };
    const F = re.seq?.fps || 30;
    const dur = programEnd(re);
    if (!(dur > 0)) throw new Error('The sequence is empty');
    // (round 22 "labexport") the frames come from a hidden export page at the exact frame size (tools/three-export.js):
    // the preview keeps its size and the Lab stays usable while it renders; the way below stays for real-time takes
    if (!realtime && typeof LabExport !== 'undefined' && store.get('three.export.backstage', true) && await ffmpegOf()) {
      const R = range && range.b > range.a ? { a: Math.max(0, range.a), b: Math.min(dur, range.b) } : null;
      const nm = (name || re.seq?.name || S.key?.slice(4) || 'sequence').replace(/[\\/:*?"<>|]+/g, '_');
      S.xpRender = (S.xpRender || 0) + 1; // (rendering: true while it runs; the sequence itself stays editable)
      const out = await LabExport.renderEdit(re, { format: fmt, name: `${nm}${R ? ' range' : ''}`, quiet, onProgress, fps: F, crf, sound, range: R, title: `▤ ${nm} ${fmt.replace(':', 'x')}`, again: !quiet && S.key ? { type: 'seq-direct', key: S.key, opts: { format: fmt, fps: F, crf, sound } } : null  }).finally(() => { S.xpRender -= 1; });
      await writeCaptions(re, out.path, R).catch(() => null);
      emit('render', { output: out.path, frames: out.frames, format: fmt });
      return out;
    }
    const tools = realtime ? null : await ffmpegOf();
    const dir = await outDir();
    const stem = `${(name || re.seq?.name || S.key?.slice(4) || 'sequence').replace(/[\\/:*?"<>|]+/g, '_')} ${fmt.replace(':', 'x')}${range ? ' range' : ''}`;
    S.render = { cancel: false, t0: performance.now() };
    // (round 11) its progress bar: frames rendered (measured), then ffmpeg's mux
    const pgKey = `seq-render:${Date.now().toString(36)}`; const pgUser = onProgress;
    window.Progress?.set(pgKey, { title: `▤ Render · ${stem}`, icon: '▤', kind: 'seq-render', pct: 0, label: 'getting the preview ready', where: ['rail:tool:three', '.sq-view > .sq-row'], jump: () => activate('tool:three'), actions: [{ label: '■', title: 'Cancel the render', run: () => { if (S.render) S.render.cancel = true; } }] });
    onProgress = (p) => { window.Progress?.set(pgKey, { pct: p * 100, label: p < 0.85 ? `frame ${Math.round((p / 0.85) * Math.max(1, Math.round(dur * F)))} / ${Math.max(1, Math.round(dur * F))}` : 'muxing the sound' }); pgUser?.(p); };
    let pgOk = false;
    // (round 13) the render queue shows it (pause / cancel / time left / the make), says when it's done and keeps it in the history
    const rq = window.Renders?.track?.({ kind: 'seq', title: `▤ ${stem}`, pk: pgKey, quiet, cancel: () => { if (S.render) S.render.cancel = true; }, pause: (on) => { if (S.render) S.render.paused = on; }, again: !quiet && S.key ? { type: 'seq-direct', key: S.key, opts: { format: fmt, fps: F, crf, sound, realtime } } : null });
    const rqEnd = {};
    const wasView = S.view; const wasKey = S.key; const wasEdit = S.edit; const wasT = S.T; const wasSize = L.stage.size.id;
    const t = quiet ? null : toast('Rendering the sequence…', { timeout: 0, action: { label: 'Cancel', fn: () => { if (S.render) S.render.cancel = true; } } });
    const say = (txt) => { const sp = t?.querySelector('span'); if (sp) sp.textContent = txt; };
    try {
      // the sequence to render takes the preview, at the exact frame size
      if (!wasView) S.entered = L.sketchId();
      S.view = true; S.edit = re; S.key = S.key || 'seq:render';
      if (!wasView) { L.bar.classList.add('seq-on'); refs.view.hidden = false; }
      if (L.stage.size.id !== fmt) { L.stage.setMode(fmt); await waitPage(L, w, h); }
      S.sent.plan = '';
      await ensureSongOf(re);
      await sendPlan({ force: true });
      await sleep(300);
      if (!tools) { const rt = await recordRealtime(re, { w, h, dir, stem, dur, say, onProgress: (p) => { window.Progress?.set(pgKey, { pct: p * 100, label: 'recording in real time (no ffmpeg)' }); pgUser?.(p); } }); pgOk = true; rqEnd.out = rt?.path; if (rq) rq.job.quiet = true; return rt; }
      const tmp = `${dir}/.hearth-titles-seq${Date.now().toString(36)}`;
      // (seqguard) only the In–Out range: its frames, its sound from there
      const R = range && range.b > range.a ? { a: Math.max(0, range.a), b: Math.min(dur, range.b) } : null;
      const N0 = R ? Math.round(R.a * F) : 0;
      const N = Math.max(1, (R ? Math.round(R.b * F) : Math.round(dur * F)) - N0);
      let output;
      try {
        await renderFrames(re, { w, h, n0: N0, n1: N0 + N, dir: tmp, onProgress: (p) => { onProgress?.(p * 0.85); say(`Rendering the sequence… frame ${Math.round(p * N)} / ${N}`); } });
        send({ type: 'seq-offline', on: false });
        output = await uniqueOut(dir, stem, 'mp4');
        const parts = sound ? audioPlan(re, (N0 + N) / F, N0 / F) : [];
        const args = ['-y', '-framerate', String(F), '-i', `${tmp}/frame_%05d.jpg`];
        parts.forEach((p) => args.push('-i', p.src));
        if (parts.length) {
          // (labcut) fades per part, and the music ducking under the voice (the same envelope as the preview's)
          const dk = sound ? duckOf(re) : null;
          const duckF = dk ? X().ffDuck(dk.ranges, dk.amount, N0 / F) : null;
          const chains = parts.map((p, i) => `[${i + 1}:a]atrim=start=${p.a.toFixed(4)}:duration=${(p.len * (p.speed || 1)).toFixed(4)},asetpts=PTS-STARTPTS${p.speed && p.speed !== 1 ? `,atempo=${clamp(p.speed, 0.5, 2)}` : ''},volume=${p.volume.toFixed(3)}${(X()?.ffFades(p) || []).map((f) => `,${f}`).join('')},adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}${duckF && !p.voice ? `,${duckF}` : ''}[a${i}]`);
          args.push('-filter_complex', `${chains.join(';')};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=longest[aout]`, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
        } else args.push('-map', '0:v');
        args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(Math.max(10, Math.min(30, Number(crf) || 18))), '-pix_fmt', 'yuv420p', '-r', String(F), '-t', (N / F).toFixed(4), '-movflags', '+faststart', 'OUTPUT');
        say('Rendering the sequence… muxing the sound');
        await runJob({ id: `seq${Date.now().toString(36)}`, input: `${tmp}/frame_00000.jpg`, output, args, duration: N / F, onProgress: (p) => onProgress?.(0.85 + p * 0.15) });
      } finally { window.hub.video.rmtemp?.(tmp).catch(() => {}); }
      // (labcut) the Captions track also as an .srt next to the video (the platforms take it as real captions)
      await writeCaptions(re, output, R).catch(() => null);
      const secs = Math.round((performance.now() - S.render.t0) / 100) / 10;
      if (!quiet && !rq?.notifies) toast(`Rendered ${base(output)} (${N} frames, ${fmt}) in ${secs} s`, { timeout: 6000, action: { label: 'Open', fn: () => openOutput(output) } });
      emit('render', { output, frames: N, format: fmt });
      pgOk = true; rqEnd.out = output;
      return { path: output, frames: N, fps: F, w, h, format: fmt, seconds: secs };
    } catch (err) { rqEnd.err = err; throw err; } finally {
      if (pgOk) window.Progress?.done(pgKey); else window.Progress?.done(pgKey, { ok: false, label: S.render?.cancel ? 'cancelled' : 'failed' });
      if (pgOk) rq?.done(rqEnd.out); else rq?.fail(S.render?.cancel ? 'Render cancelled' : rqEnd.err || 'The render stopped');
      t?.remove();
      send({ type: 'seq-offline', on: false });
      S.render = null;
      S.edit = wasEdit; S.key = wasKey; S.T = wasT; S.sent.plan = '';
      if (L.stage.size.id !== wasSize) L.stage.setMode(wasSize);
      if (wasView) { await ensureSong(); await sendPlan({ force: true }); send({ type: 'seq-seek', T: S.T }); } else { S.view = false; L.bar.classList.remove('seq-on'); refs.view.hidden = true; L.send({ type: 'seq-off' }); const sid = L.sketchId(); const song = sid ? L.scenes.songOf(sid) : null; if (song) await L.player.load(song, { quiet: true }); L.rerun(); }
      redraw();
    }
  }
  const captionCues = (e) => (e?.tracks || []).filter((k) => k.type === 'text' && /^captions/i.test(k.name) && !k.hide).flatMap((k) => k.items.filter((x) => !x.off && x.text).map((x) => ({ a: x.start, b: C.itemEnd(x), text: x.text }))).sort((p, q) => p.a - q.a);
  async function writeCaptions(e, output, range = null) {
    const cues = captionCues(e);
    if (!cues.length || !X() || !output) return null;
    const p = output.replace(/\.[^./\\]+$/, '.srt');
    await window.hub.fs.write(p, X().toSRT(cues, range ? { from: range.a, to: range.b } : {}));
    return p;
  }
  async function ensureSongOf(e) { const s = D.songOf(e); const P = lab().player; if (s && P.path !== s.src) await P.load(s.src, { quiet: true }); }
  // the preview page at w × h (an exact frame size reloads the page once)
  async function waitPage(L, w, h) {
    for (let i = 0; i < 80; i += 1) {
      await sleep(150);
      const r = await L.director()?.evalInSketch?.('return [innerWidth * devicePixelRatio, innerHeight * devicePixelRatio]').catch(() => null);
      if (r?.ok && Math.abs(r.value[0] - w) < 2 && Math.abs(r.value[1] - h) < 2) { await sleep(300); return true; }
    }
    return false;
  }
  // no ffmpeg: the sequence plays once in real time into the page's recorder (WebM / MP4 with the song)
  async function recordRealtime(e, { w, h, dir, stem, dur, say, onProgress }) {
    const L = lab();
    say?.('ffmpeg isn\'t installed: recording the sequence in real time…');
    S.T = 0; send({ type: 'seq-seek', T: 0 });
    await sleep(500);
    const got = new Promise((resolve, reject) => { S.recWait = { resolve, reject }; setTimeout(() => reject(new Error('The recording never came back')), (dur + 30) * 1000); });
    let failed = null;
    got.catch((err) => { failed = err; }); // a refusal from the page ends the take early (awaited below)
    send({ type: 'record', cmd: 'start', fps: e.seq?.fps || 30, bitrate: 16e6 });
    send({ type: 'seq-play', on: true, rate: 1 });
    const t0 = performance.now();
    while ((performance.now() - t0) / 1000 < dur + 0.2) { if (S.render?.cancel || failed) break; onProgress?.(Math.min(0.99, (performance.now() - t0) / 1000 / dur)); await sleep(200); }
    send({ type: 'seq-play', on: false });
    send({ type: 'record', cmd: 'stop' });
    const msg = await got;
    const ext = msg.mime?.includes('mp4') ? 'mp4' : 'webm';
    const output = await uniqueOut(dir, `${stem} realtime`, ext);
    await window.hub.fs.write(output, new Uint8Array(msg.buffer));
    toast(`Recorded ${base(output)} in real time (${msg.width}×${msg.height})`, { timeout: 6000, action: { label: 'Open', fn: () => openOutput(output) } });
    return { path: output, realtime: true, w: msg.width, h: msg.height };
  }
  // the page's recording for a realtime render goes to the render, not the Lab's save dialog
  function takeRecording(msg) {
    if (!S.recWait) return false;
    if (msg.type === 'record-error') { S.recWait.reject(new Error(msg.message)); S.recWait = null; return true; }
    if (msg.type === 'recording') { S.recWait.resolve(msg); S.recWait = null; return true; }
    return msg.type === 'record-started';
  }
  const openOutput = (p) => MediaFile.open(p); // the system's own player
  async function render(opts = {}) {
    if (!S.edit) await current();
    await writeEdit();
    return renderEdit(S.edit, opts);
  }
  // one scene alone, as a video (the video projects' Lab beats: exact length, no screen recording)
  async function renderScene(sketchId, { secs = 4, format = '9:16', fps: F = 30, name = null, look = null } = {}) {
    const sk = lab()?.scenes.get(sketchId);
    if (!sk) throw new Error('No such sketch');
    let e = D.create({ format, fps: F, name: name || sk.name });
    e = D.addScene(e, sceneOf(sk, { look }), { dur: secs });
    return renderEdit(e, { format, name: name || `${sk.name} scene`, quiet: true, library: true });
  }

  // ---------- drawing (one canvas; the playhead moves on the compositor while playing) ----------
  const refs = {};
  const head = () => refs.head;
  const RULER = 14;
  const LANES = [{ id: 'titles', h: 15, type: 'text' }, { id: 'overlays', h: 15, type: 'video' }, { id: 'main', h: 42 }, { id: 'sound', h: 15, type: 'audio' }];
  // (labcut) a lane holds one row per track of its kind (song · voice · sfx; titles · captions), 12 px each once
  // there are several; the timeline grows to fit them (one height write when the track count changes)
  const ROW = 12;
  function lanes() {
    let y = RULER + 2;
    return LANES.map((l) => {
      const ks = l.type ? (S.edit?.tracks || []).filter((k) => k.type === l.type) : [];
      const rows = ks.length ? ks : [null];
      const h = rows.length > 1 ? rows.length * ROW : l.h;
      const o = { ...l, y, h, rows, rowH: rows.length > 1 ? ROW : h };
      y += h + 2;
      return o;
    });
  }
  const laneAt = (y) => lanes().find((l) => y >= l.y - 1 && y < l.y + l.h + 1) || null;
  const rowAt = (l, y) => (l?.rows ? l.rows[clamp(Math.floor((y - l.y) / l.rowH), 0, l.rows.length - 1)] : null);
  const rowLane = (l, k) => { const i = Math.max(0, l.rows.indexOf(k)); return { ...l, y: l.y + i * l.rowH, h: l.rows.length > 1 ? l.rowH - 1 : l.h }; };
  function measure() { if (!refs.cv) return; const r = refs.tl.getBoundingClientRect(); S.size = { w: Math.max(1, r.width), h: Math.max(1, r.height) }; }
  const W = () => S.size?.w || refs.tl?.clientWidth || 600;
  function span() { const D0 = Math.max(4, total() * 1.04 + 0.5); const v = S.vr || { t0: 0, t1: D0 }; return { t0: v.t0, t1: Math.max(v.t0 + 0.5, v.t1) }; }
  const xOf = (t) => { const v = span(); return ((t - v.t0) / (v.t1 - v.t0)) * W(); };
  const tOf = (x) => { const v = span(); return v.t0 + (x / W()) * (v.t1 - v.t0); };
  function zoomBy(k, at = S.T) { const v = span(); const len = clamp((v.t1 - v.t0) / k, 0.5, Math.max(8, total() * 2)); const f = (at - v.t0) / (v.t1 - v.t0 || 1); S.vr = { t0: Math.max(0, at - len * f), t1: Math.max(0, at - len * f) + len }; redraw(); placeHead(); }
  // zoom presets: the whole sequence, a few bars or seconds around the playhead (frames show at 1 s)
  function zoomTo(what) {
    if (what === 'fit' || what == null) { S.vr = null; redraw(); placeHead(); return null; }
    const g = grid();
    const secs = typeof what === 'number' ? what : /bars?$/.test(what) ? (parseFloat(what) || 1) * (g ? D.barLen(g) : 2) : parseFloat(what) || 4;
    const t0 = Math.max(0, S.T - secs * 0.2);
    S.vr = { t0, t1: t0 + secs }; redraw(); placeHead();
    return secs;
  }
  const ZOOMS = [['fit', 'The whole sequence', '\\'], ['8 bars', '8 bars'], ['4 bars', '4 bars'], ['1 bar', '1 bar'], [10, '10 s'], [5, '5 s'], [1, '1 s (frames)']];
  // playing while zoomed in: the view turns the page when the playhead nears its edge (one redraw a page, never a
  // scroll every frame)
  function follow() {
    if (!S.vr || !S.playing || S.drag) return;
    const v = span(); const len = v.t1 - v.t0;
    if (S.T > v.t1 - len * 0.04 || S.T < v.t0) { S.vr = { t0: Math.max(0, S.T - len * 0.05), t1: Math.max(0, S.T - len * 0.05) + len }; redraw(); placeHead(); }
  }
  const posters = new Map();
  // clip pictures: the clip as it shows in the sequence (its look, its variation), taken from the preview when the
  // playhead rests in it; until then the scene's own thumbnail; footage: its first frame
  const clipKey = (c) => JSON.stringify([c.kind, c.sketch || c.ref || c.src, c.look || null, c.vary?.seed || null, c.vibe?.palette || null]);
  const thumbSoon = debounce(() => {
    if (!S.view || S.playing || S.render || S.drag || !S.edit) return;
    const x = C.at(S.edit, Math.min(S.T, Math.max(0, C.mainTotal(S.edit) - 1e-4)));
    const c = x?.clip;
    if (!c || !['scene', 'seq', 'video', 'image'].includes(c.kind)) return;
    const key = clipKey(c);
    if (S.thumbs.get(c.id)?.key === key) return;
    const h = 72; const w = Math.max(24, Math.round(h * (S.edit.seq?.w || 1080) / (S.edit.seq?.h || 1920)));
    send({ type: 'seq-thumb', id: c.id, key, w, h });
  }, 450);
  function onThumb(msg) {
    if (!msg.url) return;
    const im = new Image(); im.onload = () => redraw(); im.src = msg.url;
    S.thumbs.set(msg.id, { key: msg.key, img: im });
    if (S.thumbs.size > 300) S.thumbs.delete(S.thumbs.keys().next().value);
  }
  const footPics = new Map();
  function footThumb(c) {
    const k = `${c.src}|${Math.round((c.in || 0) * 10)}`;
    let r = footPics.get(k);
    if (r) return r.img?.complete && r.img.naturalWidth ? r.img : null;
    r = {}; footPics.set(k, r);
    if (footPics.size > 120) footPics.delete(footPics.keys().next().value);
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto';
    v.addEventListener('loadeddata', () => { v.currentTime = Math.min((c.in || 0) + 0.04, Math.max(0, (v.duration || 1) - 0.05)); }, { once: true });
    v.addEventListener('seeked', () => {
      try { const cv = document.createElement('canvas'); cv.height = 64; cv.width = Math.max(16, Math.round((64 * v.videoWidth) / (v.videoHeight || 1))); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); const im = new Image(); im.onload = () => redraw(); im.src = cv.toDataURL('image/jpeg', 0.7); r.img = im; } catch { /* no picture */ }
      v.removeAttribute('src'); v.load();
    }, { once: true });
    v.src = WinMac.fileUrl(c.src); // (round 31, winmac) C:\… and # in names
    return null;
  }
  function poster(c) {
    const own = S.thumbs.get(c.id);
    if (own && own.key === clipKey(c) && own.img.complete && own.img.naturalWidth) return own.img;
    if (c.kind === 'video') return footThumb(c);
    const url = c.kind === 'scene' ? lab()?.scenes.thumbOf(c.sketch) : null;
    if (!url) return null;
    let im = posters.get(url);
    if (!im) { im = new Image(); im.onload = () => redraw(); im.src = url; posters.set(url, im); if (posters.size > 80) posters.delete(posters.keys().next().value); }
    return im.complete && im.naturalWidth ? im : null;
  }
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  let drawQueued = false;
  function redraw() { if (drawQueued || !refs.cv) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
  function draw() {
    const cv = refs.cv; if (!cv || refs.view.hidden) return;
    const dpr = devicePixelRatio || 1; const w = W(); const hh = refs.tl.clientHeight || 110;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const e = S.edit;
    const css = getComputedStyle(refs.view);
    const ink = css.getPropertyValue('--sq-ink').trim() || '#c9c2b8'; const dim = css.getPropertyValue('--sq-dim').trim() || '#6d6760'; const gold = css.getPropertyValue('--sq-gold').trim() || '#ffd75e';
    // ruler: bars (with a song's grid) or seconds
    const v = span(); const gr = grid(); const off = songStart();
    // the song's beat grid arrives after its analysis: look again a few times (bars on the ruler, snapping)
    if (songItem() && !gr && !S.gridWait && (S.gridTries = (S.gridTries || 0) + 1) < 40) S.gridWait = setTimeout(() => { S.gridWait = 0; redraw(); }, 1000);
    if (gr) S.gridTries = 0;
    g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
    if (gr) {
      const bar = D.barLen(gr); const every = Math.max(1, Math.ceil(46 / (xOf(bar) - xOf(0))));
      const bars = D.gridTimes(gr, v.t1, { every: 'bar', offset: off });
      bars.forEach((t, i) => { if (t < v.t0 - bar) return; const x = xOf(t); g.fillStyle = i % every ? dim : ink; g.fillRect(Math.round(x), i % every ? RULER - 4 : 2, 1, i % every ? 4 : RULER - 2); if (!(i % every)) g.fillText(String(i + 1), x + 3, 1); });
    } else {
      const stepS = [0.5, 1, 2, 5, 10, 30, 60].find((s) => xOf(s) - xOf(0) > 46) || 60;
      for (let t = Math.floor(v.t0 / stepS) * stepS; t <= v.t1; t += stepS) { const x = xOf(t); g.fillStyle = dim; g.fillRect(Math.round(x), 2, 1, RULER - 2); g.fillStyle = ink; g.fillText(stepS < 1 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, x + 3, 1); }
    }
    for (const m of e?.markers || []) { const x = xOf(m.t); g.fillStyle = gold; g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x, 6); g.fill(); if (m.label && x > -40 && x < w) { g.font = '9px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText(m.label, x + 5, 4, 70); g.font = '10px system-ui, sans-serif'; } }
    // (seqguard) the In–Out range: a band on the ruler, faint over the tracks
    const rg = rangeOf(e);
    if (rg) { const a = xOf(rg.a); const b2 = xOf(rg.b); g.fillStyle = 'rgba(255,215,94,0.22)'; g.fillRect(a, 0, b2 - a, RULER); g.fillStyle = 'rgba(255,215,94,0.06)'; g.fillRect(a, RULER, b2 - a, hh - RULER); g.fillStyle = gold; g.fillRect(Math.round(a), 0, 1, RULER); g.fillRect(Math.round(b2), 0, 1, RULER); }
    const Ls = lanes();
    const lane = (id) => Ls.find((l) => l.id === id);
    // (labcut) more tracks than fit: the timeline grows (written only when it changes)
    const need = Ls[Ls.length - 1].y + Ls[Ls.length - 1].h + 3; const hwant = need > 112 ? `${need}px` : '';
    if (refs.tl.style.height !== hwant) refs.tl.style.height = hwant;
    for (const l of Ls) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, l.y, w, l.h); if (l.rows.length > 1) { g.fillStyle = 'rgba(255,255,255,0.03)'; for (let i = 1; i < l.rows.length; i += 2) g.fillRect(0, l.y + i * l.rowH, w, l.rowH - 1); } }
    if (!e) return;
    // what each lane (each track row) takes, faint, where it is still empty; a muted / hidden track says so
    g.font = '9px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = dim;
    for (const l of Ls) {
      if (l.id === 'main') continue;
      l.rows.forEach((k, i) => {
        const off = k && (k.mute || k.hide);
        if (k?.items.length && !off) return;
        const nm = k ? k.name : { titles: 'Titles', overlays: 'Overlays', sound: 'Sound' }[l.id];
        g.fillText(`${nm}${off ? (k.type === 'audio' ? ' · muted' : ' · hidden') : ''}`, k?.items.length ? Math.max(6, w - 90) : 6, l.y + i * l.rowH + l.rowH / 2 + 0.5);
      });
    }
    const drawClip = (c, x0, x1, l, sel, label, color, img) => {
      const x = Math.max(-4, x0); const ww = Math.min(w + 4, x1) - x;
      if (ww < 1) return;
      g.save();
      g.beginPath(); if (g.roundRect) g.roundRect(x, l.y, ww, l.h, 3); else g.rect(x, l.y, ww, l.h); g.clip();
      g.fillStyle = color; g.fillRect(x, l.y, ww, l.h);
      const sw = c.swatch && SWATCHES[c.swatch]; // (seqguard) a color label: a tint under the picture, a stripe over it
      if (sw) { g.globalAlpha = 0.35; g.fillStyle = sw; g.fillRect(x, l.y, ww, l.h); g.globalAlpha = 1; }
      if (img) { const ih = l.h; const iw = (img.naturalWidth / img.naturalHeight) * ih; for (let px = x0; px < x1 && px < w; px += iw) if (px + iw > 0) { g.globalAlpha = 0.85; g.drawImage(img, px, l.y, iw, ih); } g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, l.y + l.h - 13, ww, 13); }
      g.fillStyle = '#fff'; g.font = `${l.h > 20 ? 11 : 10}px system-ui, sans-serif`; g.textBaseline = 'bottom';
      g.fillText(label, x + 4, l.y + l.h - 2, Math.max(0, ww - 8));
      if (sw) { g.fillStyle = sw; g.fillRect(x, l.y, ww, 3); }
      g.restore();
      if (sel) { g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(x + 1, l.y + 1, ww - 2, l.h - 2); }
    };
    const main = lane('main');
    for (const x of D.timing(e)) {
      const c = x.clip; const x0 = xOf(x.start); const x1 = xOf(x.end);
      if (x1 < -4 || x0 > w + 4) continue; // (only what's in view)
      if (c.kind === 'gap') { g.strokeStyle = dim; g.setLineDash([3, 3]); g.strokeRect(x0 + 0.5, main.y + 0.5, x1 - x0 - 1, main.h - 1); g.setLineDash([]); continue; }
      const color = c.kind === 'scene' ? `hsl(${hue(c.sketch)} 45% 30%)` : c.kind === 'video' ? 'hsl(205 40% 28%)' : c.kind === 'title' ? 'hsl(40 45% 26%)' : c.kind === 'seq' ? 'hsl(280 30% 26%)' : 'hsl(0 0% 22%)';
      const sp = c.speed && c.speed !== 1 ? ` ${c.speed}×` : '';
      const gl = c.grade ? ` ◑ ${EditFX.LOOK[c.grade.look]?.name || c.grade.look}` : ''; // (labcut) its color look, framing, move
      const fr = (c.frames?.[D.formatOf(e)] || c.frame || c.motion) && (c.kind === 'video' || c.kind === 'image') ? ' ⛶' : '';
      const label = c.kind === 'scene' ? `${c.name}${c.look ? ` · ${c.look}` : ''}${c.vary ? ' ✦' : ''}${c.vibe ? ' ◐' : ''}${sp}${gl}` : c.kind === 'video' ? `🎞 ${base(c.src)}${c.mute ? '' : ` 🔊${c.volume != null && c.volume !== 1 ? `${Math.round(c.volume * 100)}%` : ''}`}${sp}${fr}${gl}` : c.kind === 'image' ? `▣ ${base(c.src)}${fr}${gl}` : c.kind === 'title' ? `T ${c.text}` : c.kind === 'seq' ? `▤ ${c.name}${gl}` : c.kind;
      drawClip(c, x0, x1, main, S.sel.has(c.id), label, color, poster(c));
      if (S.errs.has(c.id)) errMark(g, x0, x1, main);
      // the transition into it: a bow tie over the overlap
      if (x.td > 0) { const a = xOf(x.start); const b = xOf(x.start + x.td); g.fillStyle = 'rgba(255,215,94,0.28)'; g.beginPath(); g.moveTo(a, main.y); g.lineTo(b, main.y + main.h); g.lineTo(b, main.y); g.lineTo(a, main.y + main.h); g.closePath(); g.fill(); }
    }
    for (const k of e.tracks || []) {
      const l = rowLane(k.type === 'text' ? lane('titles') : k.type === 'audio' ? lane('sound') : lane('overlays'), k);
      const voice = X()?.isVoice(k); const caps = k.type === 'text' && /^captions/i.test(k.name); const sfx = k.type === 'audio' && /^sfx/i.test(k.name);
      if (k.mute || k.hide) g.globalAlpha = 0.4;
      for (const it of k.items) {
        const x0 = xOf(it.start); const x1 = xOf(C.itemEnd(it));
        if (x1 < -4 || x0 > w + 4) continue; // (only what's in view)
        const color = it.kind === 'title' ? (caps ? 'hsl(200 30% 30%)' : it.lower ? 'hsl(25 55% 32%)' : 'hsl(40 55% 34%)') : it.kind === 'audio' ? (it.song ? 'hsl(150 35% 24%)' : voice ? 'hsl(190 40% 24%)' : sfx ? 'hsl(320 30% 24%)' : 'hsl(150 30% 20%)') : 'hsl(270 35% 30%)';
        const vol = it.volume != null && it.volume !== 1 ? ` ${Math.round(it.volume * 100)}%` : '';
        const label = it.kind === 'title' ? `${caps ? '💬 ' : it.lower ? '▁ ' : ''}${String(it.text).replace(/\n/g, ' · ')}` : it.kind === 'audio' ? `${it.song ? '♪ ' : voice ? '🎙 ' : sfx ? '✸ ' : ''}${base(it.src)}${vol}` : it.kind === 'layer' ? `◭ ${it.name}` : base(it.src);
        drawClip(it, x0, x1, l, S.sel.has(it.id), label, color, null);
        if (S.errs.has(it.id)) errMark(g, x0, x1, l);
        if (it.kind === 'audio' && (it.fadeIn || it.fadeOut)) fadeMarks(g, it, x0, x1, l);
      }
      g.globalAlpha = 1;
    }
    // the song's waveform on its row (from the Lab's analysis: peaks per column, drawn only on redraws)
    const soundL = lane('sound'); const songK = (e.tracks || []).find((k) => k.type === 'audio' && k.items.some((x) => x.song));
    const songL = songK ? rowLane(soundL, songK) : soundL;
    drawWave(g, songL, v, w);
    // beats on the song's row
    if (gr) { const l = songL; g.fillStyle = 'rgba(255,255,255,0.18)'; for (const t of D.gridTimes(gr, v.t1, { every: 'beat', offset: off })) { if (t < v.t0) continue; const x = xOf(t); if (x - xOf(t - D.beatLen(gr)) < 4) break; g.fillRect(Math.round(x), l.y + l.h - 4, 1, 4); } }
    if (S.drop != null) { g.fillStyle = gold; g.fillRect(Math.round(xOf(S.drop)) - 1, main.y - 2, 2, main.h + 4); }
    if (S.snapAt != null) { g.fillStyle = 'rgba(255,215,94,0.6)'; g.fillRect(Math.round(xOf(S.snapAt)), RULER, 1, hh - RULER); }
    refs.hint.hidden = Boolean(e.clips.length || (e.tracks || []).some((k) => k.items.length));
  }
  // (labcut) a sound clip's fades: a ramp drawn over each end
  // (seqsolid) a clip whose scene threw: a red corner with ⚠ (its message in the clip's menu)
  function errMark(g, x0, x1, l) {
    const x = Math.min(x1, W()) - 2; if (x - x0 < 10) return;
    g.save(); g.fillStyle = '#e5484d'; g.beginPath(); g.moveTo(x - 14, l.y); g.lineTo(x, l.y); g.lineTo(x, l.y + 14); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = '9px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText('!', x - 5, l.y + 1); g.restore();
  }
  function fadeMarks(g, it, x0, x1, l) {
    const pps = xOf(1) - xOf(0);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.beginPath();
    if (it.fadeIn) { g.moveTo(x0, l.y + l.h); g.lineTo(x0 + it.fadeIn * pps, l.y + 1); }
    if (it.fadeOut) { g.moveTo(x1 - it.fadeOut * pps, l.y + 1); g.lineTo(x1, l.y + l.h); }
    g.stroke();
  }
  function drawWave(g, l, v, w) {
    const s = songItem(); const P = lab()?.player;
    const wv = P?.path === s?.src ? P.wave : null;
    if (!s || !wv?.low?.length) return;
    const fr = wv.fps || 100; const n = wv.low.length;
    const x0 = Math.max(0, Math.floor(xOf(s.start))); const x1 = Math.min(w, Math.ceil(xOf(C.itemEnd(s))));
    const pps = (xOf(1) - xOf(0)) || 1;
    g.fillStyle = 'rgba(150, 230, 190, 0.42)';
    for (let x = x0; x < x1; x += 1) {
      const t = (tOf(x) - s.start) * (s.speed || 1) + (s.in || 0);
      const a = Math.max(0, Math.floor(t * fr)); const b = Math.min(n, Math.max(a + 1, Math.floor((t + (s.speed || 1) / pps) * fr)));
      let m = 0; for (let i = a; i < b; i += 1) { const q = Math.max(wv.low[i], wv.mid[i], wv.high[i]); if (q > m) m = q; }
      const hh = (m / 255) * (l.h - 2);
      if (hh > 0.5) g.fillRect(x, l.y + (l.h - hh) / 2, 1, hh);
    }
  }
  // the playhead: placed once when still; one compositor animation to the end while playing (no per-frame writes)
  let headAnim = null; let headFrom = null;
  function placeHead() {
    const el0 = head(); if (!el0 || refs.view.hidden) return;
    const x = xOf(S.T);
    if (S.playing && S.view) {
      const D0 = total(); const rate = S.rate || 1;
      const predicted = headFrom ? headFrom.x + ((performance.now() - headFrom.at) / 1000) * rate * (xOf(1) - xOf(0)) : null;
      if (headAnim && predicted != null && Math.abs(predicted - x) < 4 && headFrom.span === JSON.stringify(span())) return;
      headAnim?.cancel();
      const x1 = xOf(D0); const secs = Math.max(0.05, (D0 - S.T) / rate);
      headAnim = el0.animate([{ transform: `translateX(${x}px)` }, { transform: `translateX(${x1}px)` }], { duration: secs * 1000, easing: 'linear', fill: 'forwards' });
      headAnim.startTime = document.timeline.currentTime;
      headFrom = { x, at: performance.now(), span: JSON.stringify(span()) };
      return;
    }
    headAnim?.cancel(); headAnim = null; headFrom = null;
    const tf = `translateX(${Math.round(x * 10) / 10}px)`;
    if (el0.style.transform !== tf) el0.style.transform = tf;
  }
  function paintTime() { const txt = `${tc(S.T)} · f${frameOf(S.T)}`; if (refs.time && refs.time.textContent !== txt) refs.time.textContent = txt; }
  function paintPlay() { const t = S.playing ? '❚❚' : '▶'; if (refs.play && refs.play.textContent !== t) refs.play.textContent = t; }
  let flashT = 0;
  function flash(text) { if (!refs.flash) return; refs.flash.textContent = text; refs.flash.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(() => refs.flash.classList.remove('on'), 1300); }

  // ---------- pointer: select, scrub, move, trim (Alt: slip), snapping to bars / beats / markers / edges ----------
  function hit(ev) {
    const r = refs.cv.getBoundingClientRect(); const x = ev.clientX - r.left; const y = ev.clientY - r.top; const t = tOf(x);
    if (y < RULER) return { zone: 'ruler', t, x };
    const l = laneAt(y);
    if (!l || !S.edit) return { zone: 'empty', t, x };
    const near = (a) => Math.abs(xOf(a) - x) <= 6;
    if (l.id === 'main') {
      const T0 = D.timing(S.edit);
      // the later clip wins in an overlap; an edge within 6 px is a trim
      for (const xx of [...T0].reverse()) {
        if (t < xx.start - 0.01 || t > xx.end + 0.01) continue;
        const edge = near(xx.end) ? 'out' : near(xx.start) ? 'in' : null;
        return { zone: 'clip', where: 'clip', clip: xx.clip, i: xx.i, start: xx.start, end: xx.end, edge, t, x, lane: l };
      }
      return { zone: 'lane', lane: l, t, x };
    }
    // (labcut) the row under the pointer is one track (song · voice · sfx…)
    const k = rowAt(l, y);
    for (const it of k?.items || []) {
      const a = it.start; const b = C.itemEnd(it);
      if (t < a - 0.01 || t > b + 0.01) continue;
      return { zone: 'clip', where: 'item', clip: it, track: k, start: a, end: b, edge: near(b) ? 'out' : near(a) ? 'in' : null, t, x, lane: l };
    }
    return { zone: 'lane', lane: l, track: k, t, x };
  }
  function snapT(t, exclude = null) {
    S.snapAt = null;
    if (!S.snap || !S.edit) return frameStart(frameOf(t + 0.5 / fps()));
    const tol = (tOf(8) - tOf(0));
    const s = D.snap(t, [...D.snapTargets(S.edit, { grid: grid(), songStart: songStart(), exclude }), { t: S.T, kind: 'edge' }], tol);
    if (s.kind) { S.snapAt = s.t; return s.t; }
    return frameStart(frameOf(t + 0.5 / fps()));
  }
  function onDown(ev) {
    if (ev.button !== 0 || !S.edit) return;
    refs.tl.focus({ preventScroll: true });
    const h = hit(ev);
    refs.cv.setPointerCapture(ev.pointerId);
    if (h.zone === 'clip') {
      if (!S.sel.has(h.clip.id) || !ev.shiftKey) select(h.clip.id, { add: ev.shiftKey });
      const orig = S.edit;
      // Alt / Ctrl+drag: slip · Shift+drag an edge: roll the cut · Shift+drag a clip: slide it · else trim / move
      const main = h.where === 'clip';
      const mode = ev.altKey || ev.ctrlKey || ev.metaKey ? 'slip' : h.edge ? (ev.shiftKey && main ? 'roll' : 'trim') : ev.shiftKey && main ? 'slide' : 'move';
      S.drag = { h, orig, x0: ev.clientX, mode, moved: false };
    } else {
      if (!ev.shiftKey) { S.sel.clear(); redraw(); }
      S.drag = { mode: 'scrub' };
      play(false); seek(snapT(h.t));
    }
  }
  function onMove(ev) {
    const dr = S.drag;
    if (!dr) { const h = hit(ev); const cur = h.zone === 'clip' && h.edge ? (ev.shiftKey ? 'col-resize' : 'ew-resize') : h.zone === 'clip' ? 'grab' : 'default'; if (refs.cv.style.cursor !== cur) refs.cv.style.cursor = cur; return; }
    const r = refs.cv.getBoundingClientRect(); const t = tOf(ev.clientX - r.left);
    if (dr.mode === 'scrub') { seek(snapT(t)); redraw(); return; }
    const dx = ev.clientX - dr.x0;
    if (!dr.moved && Math.abs(dx) < 3) return;
    dr.moved = true;
    const dt = tOf(dx) - tOf(0);
    const id = dr.h.clip.id;
    let next = dr.orig;
    if (dr.mode === 'slip') next = D.slip(dr.orig, id, -dt);
    else if (dr.mode === 'roll') {
      // the cut at this edge moves (the clip before gets longer, the one after shorter)
      const i = dr.h.edge === 'out' ? dr.h.i + 1 : dr.h.i;
      const T0 = D.timing(dr.orig);
      if (i > 0 && i < T0.length) { const cut = T0[i].start; const want = snapT(cut + dt, id); next = D.roll(dr.orig, i, want - cut); }
    } else if (dr.mode === 'slide') next = D.slide(dr.orig, id, dt);
    else if (dr.mode === 'trim') {
      const edgeT = dr.h.edge === 'in' ? dr.h.start : dr.h.end;
      const want = snapT(edgeT + dt, id);
      next = D.trim(dr.orig, id, dr.h.edge, want - edgeT);
    } else if (dr.h.where === 'item') {
      const want = snapT(dr.h.start + dt, id);
      next = D.move(dr.orig, id, Math.max(0, want));
    } else {
      // a main clip goes between two others (the gold line shows where)
      const T0 = D.timing(dr.orig);
      const mid = T0.map((x) => (x.start + x.end) / 2);
      let to = mid.findIndex((m) => t < m);
      if (to < 0) to = T0.length;
      S.drop = to < T0.length ? T0[to].cut : C.mainTotal(dr.orig);
      dr.to = to;
      redraw();
      return;
    }
    S.edit = next; redraw(); pushPlan();
  }
  function onUp() {
    const dr = S.drag; S.drag = null; S.drop = null; S.snapAt = null;
    if (!dr || dr.mode === 'scrub') { redraw(); return; }
    if (!dr.moved) { play(false); seek(dr.h.t); redraw(); return; }
    const after = dr.mode === 'move' && dr.h.where === 'clip' ? D.move(dr.orig, dr.h.clip.id, dr.to) : S.edit;
    S.edit = dr.orig;
    commit(after, { slip: 'Slip', trim: 'Trim', roll: 'Rolled', slide: 'Slid' }[dr.mode] || 'Moved');
  }
  function onWheel(ev) {
    // (round 49) a mouse notch ≈ 1.25×; a trackpad pinch (Ctrl + many small wheel events) zooms gradually, not 1.25× per event
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); const r = refs.cv.getBoundingClientRect(); const notch = ev.deltaMode === 1 || (!IS_MAC && ev.wheelDeltaY && ev.wheelDeltaY % 120 === 0) || (!ev.ctrlKey && Math.abs(ev.deltaY) >= 50); const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY; zoomBy(Math.max(0.5, Math.min(2, Math.exp(-dy * (notch ? 0.0022 : 0.012)))), tOf(ev.clientX - r.left)); return; }
    if (S.vr && Math.abs(ev.deltaY) + Math.abs(ev.deltaX) > 0) { ev.preventDefault(); const v = span(); const d = ((ev.deltaX || ev.deltaY) / W()) * (v.t1 - v.t0); S.vr = { t0: Math.max(0, v.t0 + d), t1: Math.max(0, v.t0 + d) + (v.t1 - v.t0) }; redraw(); placeHead(); }
  }
  function onDbl(ev) {
    const h = hit(ev);
    if (h.zone !== 'clip') return;
    if (h.clip.kind === 'scene') editScene(h.clip);
    else if (h.clip.kind === 'title') retitle(h.clip.id);
  }
  async function retitle(id) { const f = C.find(S.edit, id); const v = await Modal.prompt('Title text', { value: f?.clip.text || '' }); if (v != null) commit(C.patchAny(S.edit, [id], (c) => { c.text = v; }), 'Title text'); }
  async function editScene(c) { await leave({ rerun: false }); S.hold = true; S.explicit = true; lab().scenes.open(c.sketch); flash(''); toast(`Editing “${c.name}”. ▤ Sequence on the timeline brings the sequence back.`, { timeout: 3500, action: { label: '▤ Sequence', fn: () => enter() } }); }

  // ---------- menus (right-click; submenus; Customise-friendly labels) ----------
  const TRANS_TOP = ['cut', 'dissolve', 'dip-black', 'dip-white', 'wipe-left', 'push-left', 'zoom-in', 'whip-left', 'glitch', 'iris-open'];
  function transItems(id) {
    const c = C.find(S.edit, id)?.clip;
    const cur = c?.trans?.type || 'cut';
    const it = (t) => ({ label: EditFX.TRANS[t]?.name || 'Cut', checked: cur === t, action: () => setTransition(t, id) });
    // (labcut) one searchable library: the most used first, then the Lab moves and every group as a submenu (the
    // menu's filter field finds any of them by name: "glitch", "dip gold", "iris")
    const lib = X() ? X().transLibrary(EditFX, TR()?.LAB || []) : TRANS_TOP.map((t) => ({ id: t, name: EditFX.TRANS[t]?.name, group: '★ Most used' }));
    const groups = [...new Set(lib.map((t) => t.group))].filter((gname) => gname !== '★ Most used');
    return [...lib.filter((t) => t.group === '★ Most used').map((t) => it(t.id)),
      ...groups.map((gname) => ({ label: gname, hint: gname === '✦ Lab moves' ? '3D, only here' : String(lib.filter((t) => t.group === gname).length), items: () => lib.filter((t) => t.group === gname).map((t) => ({ ...it(t.id), ...(t.desc ? { hint: t.desc } : {}) })) })),
      '-', ...[0.25, 0.5, 1, 2].map((d) => ({ label: `${d} s`, checked: Math.abs((c?.trans?.dur || 0) - d) < 1e-3, action: () => setTransition(c?.trans?.type || D.DEFAULT_TRANS, id, d) })),
      ...(grid() ? [{ label: 'One beat', hint: `${D.beatLen(grid()).toFixed(2)} s`, action: () => setTransition(c?.trans?.type || D.DEFAULT_TRANS, id, r4(D.beatLen(grid()))) }] : [])];
  }
  // (labcut) the clip menus' new parts: framing, sound, color looks, captions / lower thirds
  function frameItems(c, ids, where) {
    const f0 = D.formatOf(S.edit); const own = c.frames?.[f0] || c.frame || {};
    const fit = c.frames?.[f0]?.fit || c.fit || (where === 'item' ? 'contain' : 'cover');
    const mo = c.motion ?? (c.kind === 'image' ? X().DEFAULT_STILL_MOTION : 'none');
    return [
      { label: `Framing for ${f0}`, disabled: true },
      { label: 'Fit', hint: X().FITS[fit], items: () => Object.entries(X().FITS).map(([k, n]) => ({ label: n, checked: fit === k, action: () => setFit(k, ids) })) },
      { label: 'Position', items: () => Object.entries(X().SPOTS).map(([, [n, q]]) => ({ label: n, checked: (own.x || 0) === q.x && (own.y || 0) === q.y && !own.to, action: () => setFrame({ ...q }, ids) })) },
      { label: 'Zoom', hint: `${Math.round((own.z || 1) * 100)} %`, items: () => X().ZOOMS.map((z) => ({ label: `${Math.round(z * 100)} %`, checked: Math.abs((own.z || 1) - z) < 1e-3, action: () => setFrame({ z }, ids) })) },
      { label: 'Move', hint: mo === 'auto' ? '✦ auto' : X().MOTION[mo]?.name || '', items: () => [...X().MOTIONS.map((m) => ({ label: m.name, checked: mo === m.id, action: () => setMotion(m.id, ids) })), { label: '✦ Auto (one that suits it)', checked: mo === 'auto', action: () => setMotion('auto', ids) }] },
      { label: 'Pan across…', hint: 'from → to (keyframed)', action: async () => { const v = await Modal.prompt('Framing: "from left to right", "from top to bottom zoom 130%", "right third", "x 0.3 y -0.2 1.2x"', { value: own.to ? '' : 'from left to right' }); if (v == null) return; const spec = X().parseFrame(v); if (spec) setFrame(spec, ids); else flash('Try "from left to right"'); } },
      '-', { label: 'Same framing in every format', hint: 'this one everywhere', action: () => frameEverywhere(ids) },
      { label: 'Back to auto (centered)', action: () => setFrame({ reset: true }, ids) },
    ];
  }
  function soundItems(c, ids) {
    const v = c.volume ?? 1;
    const fades = (edge) => X().FADES.map((d) => ({ label: d ? `${d} s` : 'None', checked: Math.abs((c[edge === 'in' ? 'fadeIn' : 'fadeOut'] || 0) - d) < 1e-3, action: () => setFade(edge, d, ids) }));
    return [
      { label: 'Volume', hint: `${Math.round(v * 100)} %`, items: () => [...X().VOLUMES.map((g) => ({ label: g ? `${Math.round(g * 100)} %` : 'Mute', hint: X().dbOf(g), checked: Math.abs(v - g) < 1e-3, action: () => setVolume(g, ids) })), { label: 'Type a volume…', action: async () => { const t = await Modal.prompt('Volume (50%, 0.5, -6 dB)', { value: `${Math.round(v * 100)}%` }); if (t != null) { try { setVolume(t, ids); } catch (err) { toast(err.message, { type: 'error' }); } } } }] },
      { label: 'Fade in', hint: c.fadeIn ? `${c.fadeIn} s` : '', items: () => fades('in') },
      { label: 'Fade out', hint: c.fadeOut ? `${c.fadeOut} s` : '', items: () => fades('out') },
    ];
  }
  function gradeItems(cur, { ids = null, all = false } = {}) {
    const go = (look, amt) => () => { try { setGrade(look, { all, ...(ids ? { ids } : {}), ...(amt != null ? { amt } : {}) }); } catch (err) { toast(err.message, { type: 'error' }); } };
    const groups = [...new Set(EditFX.LOOKS.map((l) => l.group))];
    const row = (l) => ({ label: l.name, checked: cur?.look === l.id, action: go(l.id, cur?.amt) });
    return [{ label: all ? 'None (each clip its own)' : 'None', checked: !cur, action: go(null) },
      ...(cur && !all ? [{ label: 'Strength', hint: `${Math.round((cur.amt ?? 1) * 100)} %`, items: () => [0.25, 0.5, 0.75, 1].map((a) => ({ label: `${a * 100} %`, checked: Math.abs((cur.amt ?? 1) - a) < 1e-3, action: () => setGradeAmt(a, ids || targets()) })) }] : []),
      '-', ...X().LOOK_PICKS.filter((id) => EditFX.LOOK[id]).map((id) => row(EditFX.LOOK[id])),
      '-', ...groups.map((gname) => ({ label: gname, items: () => EditFX.LOOKS.filter((l) => l.group === gname).map(row) }))];
  }
  function textItems() {
    return [
      { label: '＋ Lower third…', hint: 'a name — a role', action: async () => { const v = await Modal.prompt('Lower third ("Name — Role")', { value: '' }); if (v?.trim()) addLower(v.trim(), { preset: S.edit.seq?.lowerLook || 'forge' }); } },
      { label: 'Lower third look', hint: EditFX.LTHIRD[S.edit?.seq?.lowerLook || 'forge']?.name, items: () => EditFX.LOWER_THIRDS.map((l) => ({ label: l.name, checked: (S.edit.seq?.lowerLook || 'forge') === l.id, action: () => lowerLook(l.id) })) },
      '-', { label: 'Captions from a file…', hint: '.srt · .vtt', action: () => captionsFile().catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Type captions…', hint: rangeOf() ? 'over the In–Out range' : grid() ? 'one line a bar' : 'one line every 2 s', action: async () => { const v = await Modal.prompt('Captions: one line each', { multiline: true, value: '' }); if (v?.trim()) { try { captionsTyped(v); } catch (err) { toast(err.message, { type: 'error' }); } } } },
      { label: 'Caption look', hint: X().CAPTION_LOOK[S.edit?.seq?.captionLook || 'clean']?.name, items: () => X().CAPTION_LOOKS.map((l) => ({ label: l.name, checked: (S.edit.seq?.captionLook || 'clean') === l.id, action: () => captionLook(l.id) })) },
      { label: 'Save the captions as .srt', disabled: !captionCues(S.edit).length, action: () => exportCaptions().catch((err) => toast(err.message, { type: 'error' })) },
    ];
  }
  // a lower-third look for the sequence (the new ones, and the selected lower thirds, or all of them)
  function lowerLook(id) {
    const sel = new Set(selIds());
    const n = { ...S.edit, seq: { ...S.edit.seq, lowerLook: id }, tracks: (S.edit.tracks || []).map((k) => ({ ...k, items: k.items.map((x) => (x.lower && (sel.has(x.id) || !sel.size) ? { ...x, lower: id } : x)) })) };
    commit(n, `Lower thirds: ${EditFX.LTHIRD[id]?.name}`);
    return id;
  }
  function soundMenuItems() {
    const sq = S.edit?.seq || {};
    const on = sq.duck !== false; const amt = sq.duckAmt ?? X().DEFAULT_DUCK;
    const song = songItem();
    const pick = (role) => async () => { const ps = await window.hub.openDialog({ title: role === 'voice' ? 'A voice-over' : role === 'sfx' ? 'A sound effect' : 'A sound', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'] }] }); for (const p of ps || []) await add({ path: p, role }, { at: S.T }).catch((err) => toast(err.message, { type: 'error' })); };
    return [
      { label: '＋ Voice-over…', hint: 'the music ducks under it', action: pick('voice') },
      { label: '＋ Sound effect…', hint: 'at the playhead', action: pick('sfx') },
      { label: '＋ Another sound…', action: pick('sound') },
      '-', { label: on ? 'Ducking under the voice: on' : 'Ducking under the voice: off', checked: on, action: () => setDuck(!on) },
      { label: 'How much the music ducks', hint: X().dbOf(amt), items: () => X().DUCKS.map((d) => ({ label: d.name, checked: Math.abs(amt - d.id) < 1e-3, action: () => setDuck(true, d.id) })) },
      ...(song ? [{ label: 'The song', items: () => soundItems(song, [song.id]) }] : []),
      ...((S.edit?.tracks || []).filter((k) => k.type === 'audio').length > 1 ? [{ label: 'Mute a track', items: () => S.edit.tracks.filter((k) => k.type === 'audio').map((k) => ({ label: k.name, checked: Boolean(k.mute), action: () => muteTrack(k.id) })) }] : []),
    ];
  }
  function outputItems() {
    const outs = new Set(outputsOf());
    const flip = (f) => { const n = new Set(outs); if (n.has(f) && n.size > 1) n.delete(f); else n.add(f); setOutputs(Object.keys(D.FORMATS).filter((x) => n.has(x))); };
    return [...Object.keys(D.FORMATS).map((f) => ({ label: f, hint: f === D.formatOf(S.edit) ? 'editing now' : D.FORMATS[f].join('×'), checked: outs.has(f), action: () => flip(f) })),
      '-', { label: 'Socials: 9:16 · 1:1 · 16:9', action: () => setOutputs(X().OUTPUT_SETS.socials) }, { label: 'All four', action: () => setOutputs(X().OUTPUT_SETS.all) },
      { label: `⇪ Render ${outs.size > 1 ? `the ${outs.size} outputs` : 'it'}`, hint: 'each with its own framing', action: () => renderOutputs().catch((err) => toast(err.message, { type: 'error' })) }];
  }
  function lengthItems(id) {
    const g = grid();
    return [...(g ? [1, 2, 4, 8].map((b) => ({ label: `${b} bar${b > 1 ? 's' : ''}`, action: () => setLength(id, b * D.barLen(g)) })) : []), ...[1, 2, 4, 8].map((s) => ({ label: `${s} s`, action: () => setLength(id, s) })),
      { label: 'Type a length…', action: async () => { const v = await Modal.prompt('Length (seconds, or "4 bars")', { value: '4' }); const s = secsOf(v); if (s > 0) setLength(id, s); } }];
  }
  function clipMenu(h, x, y) {
    const c = h.clip;
    const items = [];
    const er = S.errs.get(c.id); // (seqsolid) its scene threw: what, and the way to fix it
    if (er) items.push({ label: `⚠ ${er.message.slice(0, 60)}`, hint: c.kind === 'scene' ? 'open the scene to fix it' : `${er.n}×`, action: () => (c.kind === 'scene' ? editScene(c) : flash(er.message.slice(0, 120))) }, '-');
    if (c.kind === 'scene') {
      const sk = lab().scenes.get(c.sketch);
      const looks = sk ? lookNames(sk) : [];
      items.push({ label: `✎ Edit “${c.name}”`, hint: 'opens the scene', action: () => editScene(c) });
      items.push({ label: 'Look', hint: c.look || (c.vary ? 'a variation' : 'as saved'), items: () => [{ label: 'As saved (no look)', checked: !c.look && !c.vary, action: () => { setLook(c.id, null); if (c.vary) vary(c.id, { reset: true }); } }, ...looks.map((n) => ({ label: n, checked: c.look === n, action: () => setLook(c.id, n) })),
        '-', { label: '✦ A new variation', key: 'V', hint: 'its sliders, nudged', action: () => vary(c.id) },
        { label: 'Variation strength', hint: c.vary ? `${Math.round((c.vary.amount || 0.4) * 100)} %` : '', items: () => [0.15, 0.3, 0.5, 0.8].map((a) => ({ label: `${Math.round(a * 100)} %`, checked: Math.abs((c.vary?.amount || 0) - a) < 1e-3, action: () => vary(c.id, { amount: a }) })) },
        { label: 'Copy this look', action: () => copyLook(c.id) }, { label: 'Paste the look', disabled: !lookClip, action: () => pasteLook(selIds().length > 1 ? selIds() : c.id) },
        { label: 'Swap looks with the next scene', action: () => swapLooks(c.id) }] });
      items.push({ label: 'Replace with', items: () => sketchItems((sid) => commit(C.patchAny(S.edit, [c.id], (cc) => { const s2 = lab().scenes.get(sid); cc.sketch = sid; cc.name = s2.name; cc.look = null; }), 'Replaced')) });
      if (c.vibe) items.push({ label: 'Remove the board vibe', action: () => commit(C.patchAny(S.edit, [c.id], (cc) => { delete cc.vibe; }), 'Vibe removed') });
    }
    if (c.kind === 'title') {
      items.push({ label: '✎ Text…', action: () => retitle(c.id) });
      items.push({ label: 'Style', hint: c.style, items: () => EditFX.TITLE_STYLES.map((s) => ({ label: s.name, checked: c.style === s.id, action: () => commit(C.patchAny(S.edit, [c.id], (cc) => { cc.style = s.id; }), s.name) })) });
      items.push({ label: 'Animation', hint: c.anim, items: () => EditFX.TITLE_ANIMS.map((a) => ({ label: a.name, checked: c.anim === a.id, action: () => commit(C.patchAny(S.edit, [c.id], (cc) => { cc.anim = a.id; }), a.name) })) });
    }
    if (c.kind === 'gap') items.push({ label: '✦ Fill this gap', key: 'G', hint: 'a scene that fits, in a look of its own', action: () => fillGap(c.id).catch((err) => toast(err.message, { type: 'error' })) }, { label: 'Fill with', items: () => sketchItems((sid) => commit(C.fillGap(S.edit, c.id, { ...D.sceneClip({ sketch: sid, name: lab().scenes.get(sid).name }, c.dur) }), 'Filled')) });
    if (c.kind === 'seq') items.push({ label: `▤ Open “${c.name}”`, action: () => open(c.ref) }, { label: 'Unnest (its clips here)', action: () => unnest(c.id) });
    // (seqguard) speed, a color label, nudges, selecting the rest
    const ids = S.sel.has(c.id) && selIds().length > 1 ? selIds() : [c.id];
    if (c.kind === 'video') items.push({ label: c.mute ? '🔊 Its sound on' : '🔇 Its sound off', action: () => commit(C.patchAny(S.edit, [c.id], (cc) => { cc.mute = !cc.mute; }), c.mute ? 'Sound on' : 'Muted') });
    // (labcut) framing for this format (fit, crop, zoom, Ken Burns), sound (volume, fades), a color look, text looks
    if (X() && (c.kind === 'video' || c.kind === 'image')) items.push({ label: 'Frame', hint: D.formatOf(S.edit), items: () => frameItems(c, ids, h.where) });
    if (X() && (c.kind === 'audio' || (c.kind === 'video' && !c.mute))) items.push(...soundItems(c, ids));
    if (X() && gradable(c)) items.push({ label: 'Color look', hint: c.grade ? EditFX.LOOK[c.grade.look]?.name : '', items: () => gradeItems(c.grade, { ids }) });
    if (gradable(c) && typeof LabGrade !== 'undefined') items.push({ label: '◐ Grade', hint: c.cgrade?.name || '', items: () => LabGrade.clipMenu(c, ids) }); // (round 24)
    if (X() && c.kind === 'title' && c.caption) items.push({ label: 'Caption look', hint: X().CAPTION_LOOK[c.caption]?.name, items: () => X().CAPTION_LOOKS.map((l) => ({ label: l.name, checked: c.caption === l.id, action: () => captionLook(l.id) })) });
    if (X() && c.kind === 'title' && c.lower) items.push({ label: 'Lower third look', hint: EditFX.LTHIRD[c.lower]?.name, items: () => EditFX.LOWER_THIRDS.map((l) => ({ label: l.name, checked: c.lower === l.id, action: () => { S.sel = new Set([c.id]); lowerLook(l.id); } })) });
    if (h.where === 'clip' && h.i > 0) items.push({ label: 'Transition in', hint: c.trans ? EditFX.TRANS[c.trans.type]?.name : 'Cut', items: () => transItems(c.id) });
    items.push({ label: 'Length', hint: `${(h.end - h.start).toFixed(2)} s`, items: () => lengthItems(c.id) });
    if (X() && h.where === 'clip' && c.kind !== 'gap' && grid()) items.push({ label: '✂ Chop on the music', key: 'B', hint: 'a cut on every bar', items: () => [{ label: 'Every bar', key: 'B', action: () => chop('bar', ids) }, { label: 'Every 2 bars', action: () => chop(2, ids) }, { label: 'Every beat', key: 'Shift+B', action: () => chop('beat', ids) }] });
    if (speedable(c)) items.push({ label: 'Speed', hint: `${c.speed || 1}×`, items: () => [...SPEEDS.map((r) => ({ label: `${r}×`, checked: Math.abs((c.speed || 1) - r) < 1e-3, action: () => setSpeed(r, ids) })), { label: 'Type a speed…', action: async () => { const v = await Modal.prompt('Speed (0.5, 2, 150%…)', { value: String(c.speed || 1) }); if (v != null) { try { setSpeed(v, ids); } catch (err) { toast(err.message, { type: 'error' }); } } } }] });
    items.push({ label: 'Color', hint: c.swatch || '', items: () => [...Object.keys(SWATCHES).map((k) => ({ label: `● ${k}`, checked: c.swatch === k, action: () => setColor(k, ids) })), { label: 'No color', checked: !c.swatch, action: () => setColor(null, ids) }] });
    items.push({ label: 'Nudge', more: true, hint: ', . (Shift: a beat)', items: () => [{ label: '− 1 frame', key: ',', action: () => nudge(-1, { ids }) }, { label: '+ 1 frame', key: '.', action: () => nudge(1, { ids }) }, { label: '− 1 beat', key: 'Shift+,', action: () => nudge(0, { beats: -1, ids }) }, { label: '+ 1 beat', key: 'Shift+.', action: () => nudge(0, { beats: 1, ids }) }] });
    items.push({ label: 'Select from here to the end', more: true, key: 'A', action: () => selectRange(h.start, total() + 1) });
    items.push('-', { label: '✂ Split here', key: 'S', action: () => split() }, { label: 'Duplicate', key: 'D', action: () => dup(c.id) },
      { label: 'Starts here', key: 'Q', action: () => trimToHead('in', c.id) }, { label: 'Ends here', key: 'W', action: () => trimToHead('out', c.id) },
      { label: 'Copy', key: `${MOD}+C`, action: () => copySel(S.sel.has(c.id) ? selIds() : [c.id]) },
      ...(h.where === 'clip' ? [{ label: 'Edit points', more: true, items: () => [
        { label: 'Roll the cut before to the playhead', hint: 'Shift+drag an edge', disabled: !h.i, action: () => { const T0 = D.timing(S.edit); commit(D.roll(S.edit, h.i, S.T - T0[h.i].start), 'Rolled'); } },
        { label: 'Slide it to the playhead', hint: 'Shift+drag the clip', action: () => commit(D.slide(S.edit, c.id, S.T - h.start), 'Slid') },
        { label: 'Slip one frame earlier / later', hint: 'Alt+← / →', items: () => [{ label: '− 1 frame', action: () => slipBy(-1, c.id) }, { label: '+ 1 frame', action: () => slipBy(1, c.id) }, { label: '+ 1 beat', action: () => slipBy(Math.round(D.beatLen(grid()) * fps()), c.id) }] },
      ] }] : []),
      { label: 'Delete', key: 'Delete', danger: true, action: () => del(false, [c.id]) }, { label: 'Ripple delete', key: 'Shift+Delete', danger: true, action: () => del(true, [c.id]) });
    showMenu(x, y, items);
  }
  function rangeItems() {
    const r = rangeOf();
    return [{ label: 'In here', key: 'I', action: () => markIn() }, { label: 'Out here', key: 'Shift+I', action: () => markOut() },
      { label: 'The selected clip', disabled: !targets().length, action: () => rangeToClip() },
      { label: 'Go to the In', disabled: !r, action: () => { play(false); seek(r.a); } },
      { label: '⇪ Render the range…', disabled: !r, action: () => renderPanel().catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Clear the range', disabled: !r, action: () => clearRange() }];
  }
  // (seqguard) the markers as a list to jump to, with a named one and the song's sections
  function markerItems() {
    const ms = markersSorted();
    return [...ms.map((m, i) => ({ label: m.label || `Marker ${i + 1}`, hint: tc(m.t), action: () => goMarker(String(i + 1)) })), ...(ms.length ? ['-'] : []),
      { label: '＋ Marker here', key: 'M', action: () => marker() }, { label: '＋ Marker with a name…', key: 'Shift+M', action: () => namedMarker() },
      { label: 'Next marker', key: 'Shift+↓', disabled: !ms.length, action: () => goMarker('next') },
      { label: 'At the song\'s sections', disabled: !songItem(), action: () => sectionMarkers().catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Clear the markers', danger: true, more: true, disabled: !ms.length, action: () => commit({ ...S.edit, markers: [] }, 'Markers cleared') }];
  }
  // (seqguard) the undo history: click a step to go back to just before it (forward steps come back with Redo)
  function historyItems() {
    const h = history();
    if (!h.back.length && !h.forward.length) return [{ label: 'No changes yet', disabled: true }];
    return [...h.forward.slice(-5).map((x) => ({ label: `↷ ${x.label}`, hint: `redo ${x.steps}`, action: () => goForward(x.steps) })), ...(h.forward.length ? ['-'] : []),
      ...h.back.slice(0, 20).map((x) => ({ label: x.label, hint: x.ago, action: () => goBack(x.steps) })), ...(h.back.length > 20 ? [{ label: `… ${h.back.length - 20} older`, disabled: true }] : [])];
  }
  // the ruler: a marker under the pointer has its own menu (rename, go to, split there, delete)
  function rulerMenu(h, x, y) {
    const mk = (S.edit?.markers || []).find((m) => Math.abs(xOf(m.t) - h.x) <= 6);
    const zoom = { label: 'Zoom', items: () => ZOOMS.map(([z, label, key]) => ({ label, key, action: () => zoomTo(z) })) };
    if (!mk) { showMenu(x, y, [{ label: '＋ Marker here', key: 'M', action: () => { seek(snapT(h.t)); marker(); } }, { label: 'Markers', hint: String((S.edit?.markers || []).length || ''), items: markerItems }, zoom, { label: 'Markers at the song\'s sections', disabled: !songItem(), action: () => sectionMarkers().catch((err) => toast(err.message, { type: 'error' })) }]); return; }
    const patch = (fn, label) => commit({ ...S.edit, markers: S.edit.markers.map((m) => (m === mk ? fn({ ...m }) : m)) }, label);
    showMenu(x, y, [
      { label: `Go to “${mk.label || 'marker'}”`, action: () => { play(false); seek(mk.t); } },
      { label: 'Rename…', action: async () => { const v = await Modal.prompt('Marker', { value: mk.label || '' }); if (v != null) patch((m) => ({ ...m, label: v.trim() }), 'Marker renamed'); } },
      { label: '✂ Split there', action: () => { seek(mk.t); split(); } },
      { label: 'Delete the marker', danger: true, action: () => commit({ ...S.edit, markers: S.edit.markers.filter((m) => m !== mk) }, 'Marker deleted') },
      '-', zoom,
    ]);
  }
  // a named marker at each section of the song (intro, build, drop…), from the Lab's analysis
  async function sectionMarkers() {
    const song = await songInfo();
    const secs = song ? A.sectionsOf(song) : [];
    if (!secs.length) throw new Error('The song has no sections yet (still analyzing?)');
    const off = songStart();
    const ms = secs.map((x) => ({ t: r4(x.start + off), label: x.label || x.energy })).filter((m) => m.t >= 0 && m.t < total());
    return commit({ ...S.edit, markers: [...(S.edit.markers || []).filter((m) => !m.section), ...ms.map((m) => ({ ...m, section: true }))] }, `${ms.length} section markers`);
  }
  function sketchItems(fn) {
    const L = lab();
    const pins = new Set(store.get('three.sketchPins', []));
    const list = [...L.scenes.all()].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt).slice(0, 40);
    return list.map((sk) => ({ label: sk.name, hint: typeof ChatScenes !== 'undefined' ? ChatScenes.glyphFor(sk.id) : '', action: () => fn(sk.id) }));
  }
  function laneMenu(h, x, y) {
    const at = snapT(h.t);
    showMenu(x, y, [
      { label: '＋ Scene here', items: () => sketchItems((sid) => add({ sketch: sid }, { at })) },
      { label: '＋ This scene here', hint: lab().scenes.get(lab().sketchId())?.name || '', action: () => add({ sketch: lab().sketchId() }, { at }) },
      { label: '＋ Title here', action: async () => { const v = await Modal.prompt('Title', { value: 'Title' }); if (v != null) add({ text: v }, { at }); } },
      { label: '＋ Overlay here', items: () => overlayItems(at) },
      { label: '＋ Marker here', key: 'M', action: () => { seek(at); marker(); } },
      // (labcut) the lane's own adds: sounds on the Sound rows, text on the Titles rows; its track muted / hidden
      ...(X() && h.lane?.id === 'sound' ? ['-', ...soundMenuItems().slice(0, 3).map((it) => ({ ...it, action: () => { seek(at); it.action(); } }))] : []),
      ...(X() && h.lane?.id === 'titles' ? ['-', ...textItems().filter((it) => typeof it === 'object' && /^(＋|Captions|Type)/.test(it.label)).map((it) => ({ ...it, action: () => { seek(at); it.action(); } }))] : []),
      ...(h.track ? [{ label: h.track.type === 'audio' ? (h.track.mute ? `Unmute “${h.track.name}”` : `Mute “${h.track.name}”`) : (h.track.hide ? `Show “${h.track.name}”` : `Hide “${h.track.name}”`), more: true, action: () => muteTrack(h.track.id) }] : []),
      '-', { label: 'Paste', disabled: !clip, action: () => paste(at) },
    ]);
  }
  function overlayItems(at) {
    const L = lab(); const sk = L.scenes.get(L.sketchId());
    const own = sk ? L.scenes.layersOf(sk).map((ly) => ({ label: `◭ ${ly.name}`, hint: 'a layer of this scene', action: () => add({ overlay: { name: ly.name, code: ly.code, opacity: ly.opacity ?? 1, blend: ly.blend || 'normal', sketch: sk.id, layer: ly.id } }, { at }) })) : [];
    const filters = (typeof ThreeLayers !== 'undefined' ? ThreeLayers.FILTERS || [] : []).slice(0, 40).map((f) => ({ label: `✦ ${f.name}`, hint: 'filter', action: () => add({ overlay: { name: f.name, code: f.code } }, { at }) }));
    return [...own, ...(filters.length ? ['-', { label: 'Filters', items: () => filters }] : [])];
  }
  // the clipboard: several clips at once, kept across sequences (and restarts), so clips go from one scene's
  // sequence into another's
  let clip = (() => { const x = store.get('three.seq.clipboard', null); return Array.isArray(x) ? x : null; })();
  function copySel(ids = selIds()) {
    const list = ids.length ? D.copyClips(S.edit, ids) : [];
    clip = list.length ? list : null;
    try { store.set('three.seq.clipboard', clip); } catch { /* too big for storage: this session only */ }
    if (clip) flash(`Copied ${clip.length} clip${clip.length > 1 ? 's' : ''}`);
    return Boolean(clip);
  }
  function paste(at = S.T) {
    if (!clip?.length) return false;
    const r = D.pasteClips(S.edit, clip, at, { grid: grid() });
    const ok = commit(r.edit, `Pasted ${clip.length}`);
    if (ok) { S.sel = new Set(r.ids); redraw(); }
    return ok;
  }
  function nameMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    list().then((all) => {
      const sid = S.owner || lab()?.sketchId();
      const row = (s) => ({ label: s.name, hint: `${s.seconds.toFixed(1)} s · ${s.format}`, checked: s.key === S.key, action: () => open(s.key) });
      const mine = all.filter((s) => s.scene === sid); const others = all.filter((s) => s.scene !== sid);
      const sceneName = lab()?.scenes.get(sid)?.name || 'this scene';
      return showMenu(r.left, r.bottom + 4, [
      ...(mine.length ? [{ label: `${sceneName}'s`, disabled: true }, ...mine.map(row)] : []),
      ...(others.length ? [{ label: 'Other sequences', hint: String(others.length), items: () => [
        ...others.map((s) => ({ ...row(s), hint: `${lab()?.scenes.get(s.scene)?.name || 'no scene'} · ${s.seconds.toFixed(1)} s` })),
      ] }, { label: '＋ Nest one here', hint: 'a sequence as a clip', more: true, items: () => others.map((s) => ({ label: s.name, action: () => nest(s.key, { at: S.T }).catch((err) => toast(err.message, { type: 'error' })) })) }] : []),
      '-', { label: '＋ New sequence', hint: `for ${sceneName}`, action: () => create() },
      { label: 'Give this one to the scene on screen', more: true, disabled: !lab()?.sketchId() || S.edit?.seq?.scene === lab()?.sketchId(), action: () => { commit({ ...S.edit, seq: { ...S.edit.seq, scene: lab().sketchId() } }, 'Belongs to this scene'); S.owner = lab().sketchId(); list(); } },
      { label: 'Rename…', action: async () => { const v = await Modal.prompt('Sequence name', { value: S.key.slice(4) }); if (v?.trim()) rename(v.trim()); } },
      { label: 'Format', hint: D.formatOf(S.edit), items: () => Object.keys(D.FORMATS).map((f) => ({ label: f, checked: D.formatOf(S.edit) === f, action: () => setFormat(f) })) },
      { label: 'Delete this sequence…', danger: true, more: true, action: async () => { if (await Modal.confirm('Delete the sequence?', `"${S.key.slice(4)}" goes (the scenes and files stay).`, { ok: 'Delete', danger: true })) { VC().deleteSequence(S.key); S.key = null; S.edit = null; await current(); redraw(); pushPlan(); } } },
    ]); });
  }
  async function rename(name) {
    const key = await uniqueKey(name);
    const e = C.copy(S.edit); e.seq = { ...e.seq, name }; // (its scene stays)
    await VC().storeEdit(key, e, 'Renamed');
    VC().deleteSequence(S.key);
    S.key = key; S.edit = e; store.set('three.seq.current', key);
    emit('change', { key });
    flash(`“${name}”`);
    return key;
  }
  function moreMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const arr = S.edit?.seq?.arranged;
    showMenu(r.right - 240, r.bottom + 4, [
      { label: '✦ Arrange my scenes on the song', hint: arr ? `again: ${A?.find(arr.template)?.name || ''}` : 'no questions', action: () => (arr ? again() : arrange()).catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Arrange as', items: () => [...(A?.TEMPLATES || []).map((t) => ({ label: t.name, hint: t.desc, checked: arr?.template === t.id, action: () => arrangeAs(t) })), '-', { label: '✦ Let Astra pick one', action: () => decideArrangement().catch((err) => toast(err.message, { type: 'error' })) }] },
      { label: 'Shorter versions', items: () => [[15], [6], [15, 6], [30]].map((l) => ({ label: l.map((x) => `${x} s`).join(' + '), hint: 'new sequences around the drop', action: () => versions(l).catch((err) => toast(err.message, { type: 'error' })) })) },
      { label: '✦ A variation per section', hint: 'scenes that come back look different', action: () => varySections() },
      { label: 'Re-time to a song…', more: true, action: async () => { const [p] = await window.hub.openDialog({ title: 'Re-time the sequence to a song', filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }] }); if (p) retime(p).catch((err) => toast(err.message, { type: 'error' })); } },
      '-',
      { label: '▦ Every cut on a bar', hint: grid() ? '' : 'needs a song', disabled: !grid(), action: () => fit() },
      { label: 'Transitions everywhere', hint: 'every cut (or the selection)', items: () => transItems(null) },
      // (labcut) sound (voice-over, sfx, ducking), text (lower thirds, captions), a color look, the outputs
      ...(X() ? [{ label: 'Sound', hint: (S.edit?.tracks || []).some((k) => X().isVoice(k)) ? 'voice · ducking' : '', items: soundMenuItems },
        { label: 'Text & captions', items: textItems },
        { label: 'Color look', hint: S.edit?.seq?.grade ? EditFX.LOOK[S.edit.seq.grade.look]?.name : 'the whole sequence', items: () => gradeItems(S.edit?.seq?.grade, { all: true }) },
        { label: 'Outputs', hint: outputsOf().join(' · '), items: outputItems }] : []),
      { label: S.loop ? '⟲ Loop off' : '⟲ Loop', hint: rangeOf() ? 'the In–Out range' : '', action: () => { S.loop = !S.loop; send({ type: 'seq-loop', on: S.loop, range: rangeOf() }); } },
      { label: 'Range', hint: rangeOf() ? `${tc(rangeOf().a)} – ${tc(rangeOf().b)}` : 'I / Shift+I', items: rangeItems },
      { label: 'Close every gap', more: true, disabled: !(S.edit?.clips || []).some((c) => c.kind === 'gap'), action: () => closeGaps() },
      { label: S.snap ? 'Snapping off' : 'Snapping on', key: 'Shift+S', hint: 'bars, beats, markers, edges', action: () => setSnap() },
      { label: 'Zoom', key: '\\ + −', items: () => [{ label: 'To the selection', key: 'Z', disabled: !selIds().length, action: () => zoomToSel() }, ...ZOOMS.map(([z, label, key]) => ({ label, key, action: () => zoomTo(z) }))] },
      { label: 'Markers', hint: String((S.edit?.markers || []).length || ''), items: markerItems },
      { label: 'History', hint: S.undo.length ? `${S.undo.length} steps` : 'nothing yet', items: historyItems },
      { label: 'Select all', key: `${MOD}+A`, more: true, action: () => selectAll() },
      { label: 'Keys', action: () => Modal.alert('Lab sequence: keys', KEYS.map(([k, w]) => `${k.padEnd(18)} ${w}`).join('\n')) },
      { label: '♪ Song…', more: true, action: async () => { const [p] = await window.hub.openDialog({ title: 'The song', filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }] }); if (p) add({ path: p, song: true }); } },
      { label: 'Clear the sequence…', danger: true, more: true, action: async () => { if (await Modal.confirm('Clear the sequence?', 'Every clip and title goes (Undo brings them back).', { ok: 'Clear', danger: true })) commit({ ...S.edit, clips: [], tracks: (S.edit.tracks || []).map((k) => ({ ...k, items: k.type === 'audio' ? k.items.filter((x) => x.song) : [] })), markers: [] }, 'Cleared'); } },
    ]);
  }
  // ⇪ Render: one panel with the choices that matter (formats, frame rate, quality, sound), remembered for next time;
  // right-click the button for the quick menu
  const QUALITY = { draft: { crf: 24, label: 'Draft', hint: 'small file, quick look' }, high: { crf: 18, label: 'High', hint: 'for posting' }, best: { crf: 14, label: 'Best', hint: 'near lossless, big file' } };
  async function renderPanel() {
    if (S.render) { toast('A render is already running (the bar at the bottom of the rail can stop it)'); return; }
    if (!S.edit) await current();
    const cur = D.formatOf(S.edit);
    const last = store.get('three.seq.renderOpts', {});
    // (round 67) "With the sound" starts checked every time: turning it off is for one render (remembered, it left every
    // later render of a sequence with a song silent without anyone noticing)
    const st = { formats: new Set((last.formats || []).filter((f) => D.FORMATS[f])), fps: last.fps || S.edit?.seq?.fps || 30, quality: QUALITY[last.quality] ? last.quality : 'high', sound: true, open: last.open !== false, range: Boolean(rangeOf()) };
    if (S.edit?.seq?.outputs?.length) st.formats = new Set(outputsOf()); // (labcut) the sequence's outputs, when it has them
    if (!st.formats.size) st.formats.add(cur);
    const dlg = el('dialog', { class: 'ui-modal sq-render-panel' });
    const chip = (on, text, title, click) => el('button', { type: 'button', class: `sq-chip${on ? ' on' : ''}`, text, title, on: { click } });
    const body = el('div', { class: 'sq-rp-body' });
    const go = el('button', { type: 'button', class: 'primary', text: '⇪ Render' });
    const full = programEnd(S.edit);
    const rg = rangeOf();
    let len = rg && st.range ? rg.b - rg.a : full;
    function paint() {
      len = rg && st.range ? Math.min(rg.b, full) - rg.a : full;
      const n = st.formats.size;
      body.replaceChildren(
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Format' }), el('div', { class: 'sq-chips' }, Object.keys(D.FORMATS).map((f) => chip(st.formats.has(f), f, `${D.FORMATS[f].join('×')}${f === cur ? ' (the sequence\'s own)' : ''}`, () => { if (st.formats.has(f) && st.formats.size > 1) st.formats.delete(f); else st.formats.add(f); paint(); })))),
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Frame rate' }), el('div', { class: 'sq-chips' }, [24, 30, 60].map((f) => chip(st.fps === f, `${f} fps`, '', () => { st.fps = f; paint(); })))),
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Quality' }), el('div', { class: 'sq-chips' }, Object.entries(QUALITY).map(([k, q]) => chip(st.quality === k, q.label, q.hint, () => { st.quality = k; paint(); })))),
        el('label', { class: 'sq-rp-check' }, el('input', { type: 'checkbox', checked: st.sound, on: { change: (e) => { st.sound = e.target.checked; } } }), ' With the sound'),
        el('label', { class: 'sq-rp-check' }, el('input', { type: 'checkbox', checked: st.open, on: { change: (e) => { st.open = e.target.checked; } } }), ' Open it when it\'s done'),
        rg ? el('label', { class: 'sq-rp-check sq-rp-range' }, el('input', { type: 'checkbox', checked: st.range, on: { change: (e) => { st.range = e.target.checked; paint(); } } }), ` Only the In–Out range (${tc(rg.a)} – ${tc(rg.b)})`) : null,
        el('div', { class: 'sq-rp-sum', text: `${len > 0 ? `${len.toFixed(1)} s · ${Math.round(len * st.fps)} frames` : 'The sequence is empty'}${n > 1 ? ` · ${n} videos, one after the other` : ''}` }),
      );
      go.disabled = !(len > 0);
      go.textContent = n > 1 ? `⇪ Render ${n} formats` : `⇪ Render ${[...st.formats][0]}`;
    }
    const realtime = el('button', { type: 'button', class: 'ghost small', text: 'Record in real time instead', title: 'Without ffmpeg: the sequence plays once into a recording' });
    const best = typeof LabExport !== 'undefined' ? el('button', { type: 'button', class: 'ghost small', text: 'Export…', title: '4K / 8K, supersampling, motion blur, ProRes 4444 + alpha, PNG sequence, perfect loops (the Lab export)', on: { click: () => { dlg.close(); LabExport.panel({ source: 'seq' }); } } }) : null; // (round 22 "labexport")
    const more = window.Renders ? el('button', { type: 'button', class: 'ghost small', text: 'More formats…', title: 'GIF, WebM, ProRes master, audio only, YouTube 4K, Story, all socials (the render queue\'s presets)', on: { click: () => { dlg.close(); Renders.panel({ source: 'seq' }); } } }) : null; // (round 13)
    dlg.append(el('h3', { text: 'Render the sequence' }), body, el('div', { class: 'modal-actions' }, realtime, more, best, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => dlg.close() } }), go));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    paint();
    dlg.showModal();
    const start = async (opts) => {
      store.set('three.seq.renderOpts', { formats: [...st.formats], fps: st.fps, quality: st.quality, sound: st.sound, open: st.open });
      dlg.close();
      let lastOut = null;
      for (const f of st.formats) {
        try { lastOut = await render({ format: f, fps: st.fps, crf: QUALITY[st.quality].crf, sound: st.sound, range: rg && st.range && !opts.realtime ? rg : null, ...opts }); } catch (err) { if (!window.Renders) toast(err.message, { type: 'error' }); break; } // (the render queue says why, with the fix)
      }
      if (st.open && lastOut?.path) openOutput(lastOut.path);
    };
    go.addEventListener('click', () => start({}));
    realtime.addEventListener('click', () => start({ realtime: true }));
    return dlg;
  }
  // ↻: a fresh preview page when the sequence gets stuck (it happens while frames swap): the page reloads, and the
  // sequence, its song and the playhead come back where they were (sent again on the page's "ready")
  function reloadPreview() {
    const L = lab();
    if (!L?.reloadPage) return false;
    if (S.render) { toast('A render is running: wait for it, or stop it from the bar at the bottom of the rail'); return false; }
    flash('↻ Reloading the preview…');
    S.sent = { libs: false, assets: new Set(), plan: '' };
    S.restoring = performance.now() + 15000; // the watchdog waits for its "ready" (restore)
    L.reloadPage();
    return true;
  }
  // ---------- seqguard: the preview puts itself back (round 13) ----------
  // A new preview page (a frame swap through "fit", ↻, the browser restarting the frame, a crash) says "ready": the
  // sequence goes back on it at the same frame, playing again if it was playing (it used to come back paused, which
  // read as the sequence "bugging out" on every swap to or from Fit). Every load bumps S.page, so a plan still being
  // sent to the page before never lands half-done on the new one.
  async function restore(why = 'ready') {
    S.page += 1; const page = S.page;
    S.sent = { libs: false, assets: new Set(), plan: '' };
    if (!S.view || !S.edit) return false;
    // the frame it was on, now: the new page reports its own 0 when the plan lands, which isn't where you are
    const T0 = S.T; const n0 = S.moved || 0;
    S.restoring = performance.now() + 5000; S.restoreBusy = { T: T0, until: performance.now() + 6000 };
    let ok = false;
    try {
      await Promise.all([ensureSong(), loadMaps()]);
      if (page !== S.page || !S.view) return false;
      await sendPlan({ force: true });
      if (page !== S.page || !S.view) return false;
      // (you moved the playhead meanwhile: there)
      const T = (S.moved || 0) === n0 ? T0 : S.T;
      S.T = T; S.restoreBusy = { T, until: performance.now() + 1500 };
      send({ type: 'seq-loop', on: S.loop, range: rangeOf() });
      send({ type: 'seq-seek', T });
      if (S.want && !S.render) send({ type: 'seq-play', on: true, rate: S.rate || 1 });
      S.lastState = performance.now();
      ok = true;
      if (why !== 'ready') note(why);
      else if (S.pendingNote) { note(S.pendingNote); S.pendingNote = null; }
      return true;
    } finally { if (page === S.page) { S.restoring = ok ? performance.now() + 800 : 0; if (!ok) S.restoreBusy = 0; } }
  }
  // a frame swap while the sequence shows (the size pills, Shift+1…5, /size, the preview menu): the sequence takes
  // that shape (its render follows; one undo step for a run of swaps), Fit and the other sizes only change the
  // preview. (tools/three.js no longer writes the sequence's shape into the scene's own frame size meanwhile.)
  function sizeChanged(id) {
    if (!S.view || S.render || !S.edit) return false;
    if (D.FORMATS[id]) { if (D.formatOf(S.edit) !== id) return commit(D.setFormat(S.edit, id), `Format ${id}`, { merge: 'format' }); return false; }
    flash(`Preview only · the sequence stays ${D.formatOf(S.edit)}`);
    return false;
  }
  // The watchdog (only while the sequence shows, the Lab is on screen and nothing renders; a timer every second,
  // a ping every few seconds when paused, no per-frame work):
  //   playing, but the page's clock hasn't moved for 2.5 s → the plan again, seek, play (soft); still stuck 4 s
  //   later → a fresh page (hard, like ↻), which comes back by itself
  //   a ping unanswered twice → a fresh page
  //   the page lost the sequence (it says it's off, or shows an older plan) → the plan again
  //   a clip that should show but can't (its footage / picture file missing in the page, a decoder that failed, a
  //   scene whose layers were swept away) → its file again, the clip remounted
  // Each repair says "Preview restored" in the row's note (no dialog); ↻ stays the manual way.
  const GUARD_MS = 1000;
  let guardT = 0; let pingAt = 0; let pingId = 0; let unanswered = 0; let softAt = 0;
  const labVisible = () => document.visibilityState === 'visible' && Boolean(refs.view && !refs.view.hidden && refs.view.offsetParent);
  function note(why) {
    const g = S.guard;
    g.last = { why, at: Date.now() }; g.log.push(g.last); if (g.log.length > 30) g.log.shift();
    flash('Preview restored');
    emit('restored', { why });
  }
  function guardOn() { if (!guardT) guardT = setInterval(guardTick, GUARD_MS); }
  function guardOff() { clearInterval(guardT); guardT = 0; unanswered = 0; softAt = 0; }
  function guardTick() {
    if (!S.view || !lab()) { guardOff(); return; }
    const now = performance.now();
    if (S.render || S.drag || !labVisible() || (S.restoring && now < S.restoring)) { S.lastState = now; pingAt = now; return; }
    // the page restarting (a frame swap's reload): its own "ready" puts it back
    if (lab().pageReady && !lab().pageReady()) { S.lastState = now; return; }
    if (S.want && now - S.lastState > 2500) {
      if (softAt && now - softAt < 6500) { if (now - softAt > 4000) hardRepair('the preview stopped'); return; }
      softAt = now; S.guard.soft += 1;
      restore('the clock stalled').catch(() => {});
      return;
    }
    if (softAt && now - softAt > 6500) softAt = 0;
    // paused (or playing fine): a ping now and then
    if (now - pingAt > (S.want ? 4000 : 3000)) {
      if (pingId && unanswered >= 2) { unanswered = 0; hardRepair('the preview stopped answering'); return; }
      if (pingId) unanswered += 1;
      pingAt = now; pingId = (pingId % 1e6) + 1;
      send({ type: 'seq-health', id: pingId, plan: S.planId, T: S.T });
    }
  }
  function hardRepair(why) {
    if (S.render || !lab()?.reloadPage) return;
    S.guard.hard += 1; softAt = 0; pingId = 0;
    S.sent = { libs: false, assets: new Set(), plan: '' };
    S.restoring = performance.now() + 15000; // until its "ready"
    lab().reloadPage();
    S.pendingNote = why;
  }
  function onHealth(m) {
    if (m.id !== pingId) return;
    pingId = 0; unanswered = 0;
    if (!S.view || S.render) return;
    S.health = { at: Date.now(), ...m };
    if (!m.on || (m.plan || 0) < S.planId) { S.guard.soft += 1; restore('the preview lost the sequence').catch(() => {}); return; }
    if (m.missing?.length) { S.guard.assets += 1; for (const a of m.missing) S.sent.assets.delete(a); sendPlan({ force: true }).then(() => note('a file was missing in the preview')).catch(() => {}); return; }
    if (m.broken?.length) { S.guard.remount += 1; send({ type: 'seq-remount', ids: m.broken }); note('a clip couldn\'t show'); }
  }
  // what the watchdog did (/sequence health, status)
  function health() { return { watching: Boolean(guardT), restores: { ...S.guard, log: undefined }, last: S.guard.last, page: S.page, plan: S.planId, lastPing: S.health, errors: Object.fromEntries([...S.errs].map(([id, e]) => [id, e.message])) }; }

  function renderMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const cur = D.formatOf(S.edit);
    showMenu(r.right - 240, r.bottom + 4, [
      ...[cur, ...Object.keys(D.FORMATS).filter((f) => f !== cur)].map((f) => ({ label: `⇪ Render ${f}`, hint: `${D.FORMATS[f].join('×')}${f === cur ? ' · this one' : ''}`, action: () => render({ format: f }).catch((err) => toast(err.message, { type: 'error' })) })),
      '-', { label: 'Render every format', action: async () => { for (const f of Object.keys(D.FORMATS)) { try { await render({ format: f }); } catch (err) { toast(err.message, { type: 'error' }); break; } } } },
      { label: 'Record in real time', hint: 'without ffmpeg', more: true, action: () => render({ realtime: true }).catch((err) => toast(err.message, { type: 'error' })) },
    ]);
  }
  // the ＋ picker: sources you can click (adds at the playhead) or drag onto a track
  function picker(anchor) {
    const L = lab();
    refs.pick?.remove();
    const q = el('input', { class: 'sq-pick-q', placeholder: 'Scenes, chats, looks…', spellcheck: false });
    const grid0 = el('div', { class: 'sq-pick-grid' });
    const pop = el('div', { class: 'sq-pick', attrs: { role: 'dialog', 'aria-label': 'Add to the sequence' } }, q, grid0,
      el('div', { class: 'sq-pick-row' },
        el('button', { class: 'ghost small', text: '🎞 Footage / file…', on: { click: async () => { close(); const ps = await window.hub.openDialog({ title: 'Add to the sequence', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video, picture, sound, captions', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'srt', 'vtt'] }] }); for (const p of ps || []) await add({ path: p }, { at: S.T < total() - 1e-3 ? S.T : null }).catch((err) => toast(err.message, { type: 'error' })); } } }),
        el('button', { class: 'ghost small', text: 'T Title', on: { click: async () => { close(); const v = await Modal.prompt('Title', { value: 'Title' }); if (v != null) add({ text: v }); } } }),
        el('button', { class: 'ghost small', text: '◭ Overlay ›', on: { click: (e) => { const rr = e.currentTarget.getBoundingClientRect(); close(); showMenu(rr.left, rr.bottom + 4, overlayItems(S.T)); } } })));
    const close = () => { pop.remove(); removeEventListener('pointerdown', outside, true); };
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
    const tile = (label, sub, img, what, extra = {}) => {
      const t = el('button', { class: 'sq-tile', draggable: true, title: `${label}\nClick: add at the end · drag onto the sequence to place it`, on: {
        click: () => { close(); add(what, { ...extra }).catch((err) => toast(err.message, { type: 'error' })); },
        dragstart: (e) => { e.dataTransfer.setData(SCENE_TYPE, JSON.stringify({ what, ...extra })); e.dataTransfer.setData('text/plain', label); e.dataTransfer.effectAllowed = 'copy'; },
      } }, el('span', { class: 'sq-tile-img' }, img ? el('img', { src: img, alt: '', draggable: false }) : '◭'), el('b', { text: label }), sub ? el('small', { text: sub }) : null);
      return t;
    };
    const fill = () => {
      const s = q.value.trim().toLowerCase();
      const ok = (n) => !s || String(n).toLowerCase().includes(s);
      const out = [];
      if (!s && A) out.push(tile('✦ Arrange my scenes', 'on the song, no questions', null, { arrange: true }));
      for (const x of (S.index ? [...listCache] : []).filter((y) => y.key !== S.key && ok(y.name)).slice(0, 6)) out.push(tile(`▤ ${x.name}`, 'a sequence, as a clip', null, { seq: x.key }));
      // (labcut) your latest renders and recordings, as footage
      const made = (window.Renders?.history?.() || []).filter((j) => j.status === 'done' && !j.trashed && (VID.test(j.output || '') || IMG.test(j.output || '')) && ok(`${base(j.output)} ${j.title || ''} render recording`));
      for (const j of made.slice(0, s ? 9 : 3)) out.push(tile(base(j.output), j.kind === 'record' || /record/i.test(j.kind || '') ? 'recording' : 'render', IMG.test(j.output) ? WinMac.fileUrl(j.output) : null, { path: j.output }));
      const chats = typeof ChatScenes !== 'undefined' ? H.chats.filter((c) => ChatScenes.linkOf?.(c.id)).slice(0, 12) : [];
      for (const c of chats) { const sid = ChatScenes.linkOf(c.id); const sk = L.scenes.get(sid); if (sk && ok(c.title) ) out.push(tile(c.title || sk.name, `chat scene ${ChatScenes.glyphFor(sid)}`, L.scenes.thumbOf(sid), { chat: c.id })); }
      const pins = new Set(store.get('three.sketchPins', []));
      for (const sk of [...L.scenes.all()].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt)) {
        if (ok(sk.name)) out.push(tile(sk.name, 'sketch', L.scenes.thumbOf(sk.id), { sketch: sk.id }));
        for (const n of lookNames(sk)) if (ok(`${sk.name} ${n}`)) out.push(tile(`${sk.name} · ${n}`, 'saved look', L.scenes.thumbOf(sk.id), { sketch: sk.id, look: n }));
        if (out.length > 60) break;
      }
      grid0.replaceChildren(...(out.length ? out : [el('div', { class: 'sq-pick-none', text: 'Nothing matches' })]));
    };
    q.addEventListener('input', fill);
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter') grid0.querySelector('.sq-tile')?.click(); });
    fill();
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left))}px`;
    pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 6)}px`;
    refs.pick = pop;
    setTimeout(() => addEventListener('pointerdown', outside, true), 0);
    q.focus();
  }
  // drops: a tile, a board reference (its vibe), files from the computer
  function onDragOver(e) {
    const types = [...(e.dataTransfer?.types || [])];
    if (!types.some((t) => t === SCENE_TYPE || t === REF_TYPE || t === 'Files' || t === 'text/x-hearth-video')) return;
    e.preventDefault();
    const r = refs.cv.getBoundingClientRect();
    S.drop = snapT(tOf(e.clientX - r.left)); redraw();
  }
  async function onDrop(e) {
    const dt = e.dataTransfer; if (!dt) return;
    const r = refs.cv.getBoundingClientRect(); const at = S.drop ?? snapT(tOf(e.clientX - r.left));
    const lane = laneAt(e.clientY - r.top);
    S.drop = null; S.snapAt = null; redraw();
    e.preventDefault(); e.stopPropagation();
    try {
      if (dt.types.includes(SCENE_TYPE)) { const d = JSON.parse(dt.getData(SCENE_TYPE)); const { what, ...extra } = d; await add(what, { at, ...extra }); return; }
      if (dt.types.includes(REF_TYPE)) { await applyVibe(JSON.parse(dt.getData(REF_TYPE) || '{}'), { at }); return; }
      const vid = dt.getData('text/x-hearth-video');
      if (vid) { await add({ path: vid }, { at }); return; }
      // (labcut) a sound dropped on the voice / sfx row goes there; on the song's row it becomes the song
      const row = lane?.id === 'sound' ? rowAt(lane, e.clientY - r.top) : null;
      const role = row && X()?.isVoice(row) ? 'voice' : row && /^sfx/i.test(row.name) ? 'sfx' : null;
      for (const f of [...(dt.files || [])]) { const p = window.hub.pathForFile(f); if (p) await add({ path: p, song: lane?.id === 'sound' && !role && (!row || row.items.some((x) => x.song) || !songItem()), ...(role ? { role } : {}) }, { at }); }
    } catch (err) { toast(err.message, { type: 'error' }); }
  }

  // ---------- keys (S, Delete, Shift+Delete, ←/→, J/K/L, Alt for slip…) ----------
  const KEYS = [
    ['Space', 'Play / pause the sequence'], ['J / K / L', 'Backward · stop · forward (again: faster)'], ['← / →', 'One frame (Shift: ten)'], ['Home / End', 'Start / end'],
    ['↑ / ↓', 'Previous / next edit point'], ['S', 'Split at the playhead'], ['Delete', 'Delete (keeps a gap)'], ['Shift+Delete', 'Ripple delete (closes the gap)'],
    ['D', 'Duplicate'], ['Q / W', 'The clip starts / ends at the playhead'], ['Alt+← / →', 'Slip the clip one frame'], ['Alt+drag', 'Slip (another part of the scene / footage)'],
    ['M', 'Marker'], [`${MOD}+C / ${MOD}+V`, 'Copy / paste clips (also into another sequence)'], [`${MOD}+Z / ${MOD}+Shift+Z`, 'Undo / redo'], [`${MOD}+wheel`, 'Zoom the sequence'], ['\\', 'Zoom to fit'], ['Esc', 'Deselect'],
    ['V', 'A new variation of the scene clip (like Shuffle)'], ['Shift+V', 'The clip back to its scene as saved'], ['G', 'Fill the gap under the playhead with a scene'], ['+ / −', 'Zoom in / out at the playhead'],
    ['Shift+drag an edge', 'Roll the cut (one clip longer, the next shorter)'], ['Shift+drag a clip', 'Slide it (its neighbours trim)'], [`${MOD}+drag`, 'Slip (like Alt+drag)'],
    // seqguard (round 13)
    [', / .', 'Nudge the selected clips one frame earlier / later'], ['Shift+, / Shift+.', 'Nudge by one beat (ten frames without a song)'],
    ['[ / ]', 'The clip ends one frame earlier / later'], ['Shift+[ / Shift+]', 'The clip starts one frame earlier / later'],
    [`${MOD}+A`, 'Select every clip'], ['A', 'Select from the playhead to the end'], ['Z', 'Zoom to the selection (nothing selected: the whole sequence)'],
    ['Shift+S', 'Snapping on / off'], ['Shift+M', 'A marker with a name'], ['Shift+↑ / Shift+↓', 'Previous / next marker'],
    ['Shift+Space', 'Play around the playhead (2 s before, 1 s after) and come back'], ['I / Shift+I', 'Range: In / Out at the playhead (⟲ Loop and ⇪ Render can use just that)'],
    // labcut (round 18)
    ['B / Shift+B', 'Chop the clip on every bar / every beat of the song'],
  ];
  function onKey(e) {
    if (!S.view || !S.edit) return;
    const tag = e.target?.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable) return;
    if (e.target?.closest?.('.cm-editor, .code-editor, .tw-panel, dialog')) return;
    const k = e.key; const mod = e.ctrlKey || e.metaKey;
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    if (mod && (k === 'z' || k === 'Z')) { if (e.shiftKey) redo(); else undo(); done(); return; }
    if (mod && k === 'y') { redo(); done(); return; }
    if (mod && k === 'c') { if (copySel()) done(); return; }
    if (mod && k === 'v') { if (paste()) done(); return; }
    if (mod && (k === 'a' || k === 'A') && !e.shiftKey) { selectAll(); done(); return; }
    if (mod) return;
    if (k === ' ') { if (e.shiftKey) playAround(); else play(); done(); return; }
    if (!e.altKey && (k === ',' || k === '.')) { nudge(k === '.' ? 1 : -1); done(); return; }
    if (!e.altKey && (k === '<' || k === '>')) { nudge(0, { beats: k === '>' ? 1 : -1 }); done(); return; }
    if (!e.altKey && (k === '[' || k === ']')) { trimBy('out', k === ']' ? 1 : -1); done(); return; }
    if (!e.altKey && (k === '{' || k === '}')) { trimBy('in', k === '}' ? 1 : -1); done(); return; }
    if ((k === 'ArrowUp' || k === 'ArrowDown') && e.shiftKey && !e.altKey) { goMarker(k === 'ArrowDown' ? 'next' : 'prev'); done(); return; }
    if (k === 'ArrowRight' || k === 'ArrowLeft') { const d = k === 'ArrowRight' ? 1 : -1; if (e.altKey) slipBy(d); else step(d * (e.shiftKey ? 10 : 1)); done(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { play(false); jump(k === 'ArrowDown' ? 1 : -1); done(); return; }
    if (k === 'Home') { play(false); seek(0); done(); return; }
    if (k === 'End') { play(false); seek(total()); done(); return; }
    if (e.altKey) return;
    const low = k.toLowerCase();
    if (low === 'j') { shuttle(-1); done(); return; }
    if (low === 'k') { shuttle(0); done(); return; }
    if (low === 'l') { shuttle(1); done(); return; }
    if (low === 's' && !e.shiftKey) { split(); done(); return; }
    if (low === 's' && e.shiftKey) { setSnap(); done(); return; }
    if (low === 'm' && e.shiftKey) { namedMarker(); done(); return; }
    if (low === 'a' && !e.shiftKey) { selectAfter(); done(); return; }
    if (low === 'i') { if (e.shiftKey) markOut(); else markIn(); done(); return; }
    if (low === 'z' && !e.shiftKey) { zoomToSel(); done(); return; }
    if (k === 'Delete' || k === 'Backspace') { del(e.shiftKey); done(); return; }
    if (low === 'd' && !e.shiftKey) { dup(); done(); return; }
    if (low === 'q') { trimToHead('in'); done(); return; }
    if (low === 'w') { trimToHead('out'); done(); return; }
    if (low === 'm' && !e.shiftKey) { marker(); done(); return; }
    if (k === '\\') { S.vr = null; redraw(); placeHead(); done(); return; }
    if (low === 'v') { vary(undefined, { reset: e.shiftKey }); done(); return; }
    if (low === 'b' && X()) { chop(e.shiftKey ? 'beat' : 'bar'); done(); return; }
    if (low === 'g' && !e.shiftKey) { const x = C.at(S.edit, S.T); if (x?.clip.kind === 'gap') fillGap(x.clip.id).catch((err) => toast(err.message, { type: 'error' })); else flash('No gap under the playhead'); done(); return; }
    if (k === '+' || k === '=') { zoomBy(1.5); done(); return; }
    if (k === '-' || k === '_') { zoomBy(1 / 1.5); done(); return; }
    if (k === 'Escape' && S.sel.size) { S.sel.clear(); redraw(); done(); }
  }

  // ---------- mount (tools/three.js calls attach once the Lab's player exists) ----------
  function build(bar) {
    refs.tab = el('button', { class: 'ghost small sq-tab', text: '▤ Sequence', title: 'Build a video from your scenes, footage, titles and the song, right here', dataset: { feature: 'Sequence' }, on: { click: () => toggle().catch((err) => toast(err.message, { type: 'error' })) } });
    // ⇪ Render on the strip too: the scene (its own sequence: the scene on its timeline) without opening ▤ first
    refs.renderTab = el('button', { class: 'ghost small sq-render-tab', text: '⇪ Render', title: 'Render this scene as a video: format, frame rate, quality, sound (it renders the scene\'s own sequence)', dataset: { feature: 'Scene render' }, on: { click: async () => { try { await current(); if (!(programEnd(S.edit) > 0)) { await addCurrent?.({ at: 0 }); } await renderPanel(); } catch (err) { toast(err.message, { type: 'error' }); } } } });
    bar.querySelector('.mb-handle')?.append(refs.tab, refs.renderTab);
    refs.play = el('button', { class: 'ghost small sq-play', text: '▶', title: 'Play / pause the sequence (Space)', on: { click: () => play() } });
    refs.time = el('span', { class: 'sq-time', title: 'Timecode · frame (click to go to a time or frame)', on: { click: async () => { const v = await Modal.prompt('Go to (seconds, f120, 00:00:04:12, bar 9)', { value: tc(S.T) }); const t = v != null ? timeOf(v) : null; if (t != null) { play(false); seek(t); } } } });
    refs.name = el('button', { class: 'ghost small sq-name', title: 'Your Lab sequences · new · rename · format', on: { click: (e) => nameMenu(e.currentTarget) } });
    refs.add = el('button', { class: 'ghost small sq-add', text: '＋', title: 'Add a scene, a chat scene, a look, footage, a title or an overlay (or drag one onto the tracks)', dataset: { feature: 'Sequence add' }, on: { click: (e) => picker(e.currentTarget) } });
    refs.render = el('button', { class: 'primary small sq-render', text: '⇪ Render', title: 'Render the sequence: format, frame rate, quality, sound (right-click: quick menu)', dataset: { feature: 'Sequence render' }, on: { click: () => renderPanel().catch((err) => toast(err.message, { type: 'error' })), contextmenu: (e) => { e.preventDefault(); renderMenu(e.currentTarget); } } });
    refs.reload = el('button', { class: 'ghost small sq-reload', text: '↻', title: 'Reload the preview (when the sequence gets stuck): it comes back where it was', dataset: { feature: 'Sequence reload' }, on: { click: () => reloadPreview() } });
    refs.more = el('button', { class: 'ghost small sq-more', text: '⋯', title: 'Fit to bars, transitions, loop, snapping, keys', on: { click: (e) => moreMenu(e.currentTarget) } });
    refs.flash = el('span', { class: 'sq-flash', attrs: { 'aria-live': 'polite' } });
    refs.cv = el('canvas', { class: 'sq-canvas' });
    refs.head = el('div', { class: 'sq-playhead' });
    refs.hint = el('div', { class: 'sq-hint', text: 'Drag a scene here (＋), ⋯ → ✦ Arrange my scenes on the song, or right-click the preview → Add this scene' });
    refs.tl = el('div', { class: 'sq-tl', attrs: { tabindex: '0' } }, refs.cv, refs.head, refs.hint);
    refs.view = el('div', { class: 'sq-view', hidden: true }, el('div', { class: 'sq-row' }, refs.play, refs.time, refs.name, el('span', { class: 'spacer' }), refs.flash, refs.reload, refs.add, refs.render, refs.more), refs.tl);
    bar.append(refs.view);
    refs.cv.addEventListener('pointerdown', onDown);
    refs.cv.addEventListener('pointermove', onMove);
    refs.cv.addEventListener('pointerup', onUp);
    refs.cv.addEventListener('pointercancel', onUp);
    refs.cv.addEventListener('dblclick', onDbl);
    refs.cv.addEventListener('wheel', onWheel, { passive: false });
    refs.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const h = hit(e); if (h.zone === 'clip') { select(h.clip.id); clipMenu(h, e.clientX, e.clientY); } else if (h.zone !== 'ruler') laneMenu(h, e.clientX, e.clientY); else rulerMenu(h, e.clientX, e.clientY); });
    refs.tl.addEventListener('dragover', onDragOver);
    refs.tl.addEventListener('dragleave', () => { S.drop = null; redraw(); });
    refs.tl.addEventListener('drop', onDrop);
    new ResizeObserver(() => { measure(); redraw(); placeHead(); }).observe(refs.tl);
    const onDpr = () => { if (!refs.tl.isConnected) removeEventListener('hearth:dpr', onDpr); else { measure(); redraw(); } }; // (round 36, nativefeel) crisp after a screen-scale change
    addEventListener('hearth:dpr', onDpr);
    // the name chip follows the sequence (written only when it changes)
    listeners.change = [...(listeners.change || []), () => { const n = S.key ? `${S.key.slice(4)} · ${D.formatOf(S.edit)}` : 'Sequence'; if (refs.name.textContent !== `${n} ▾`) refs.name.textContent = `${n} ▾`; }];
  }
  function attach(L) {
    S.L = L;
    build(L.bar);
    L.pane.addEventListener('keydown', onKey, true);
    // the play button of the timeline's strip plays the sequence while it's on
    L.bar.querySelector('.mb-miniplay')?.addEventListener('click', (e) => { if (!S.view) return; e.stopImmediatePropagation(); play(); }, true);
    if (typeof Keys !== 'undefined') Keys.add(KEYS.map(([k, what]) => ({ area: AREA, keys: k, what, when: () => S.view })));
    return api;
  }
  // a time typed or given by a director: seconds, "1:02.5", "f120", "00:00:04:12", "bar 9"
  function timeOf(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim().toLowerCase();
    let m = /^bar\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (m) { const g = grid(); return g ? D.barAt(g, Number(m[1]), songStart()) : (Number(m[1]) - 1) * 2; }
    m = /^f(\d+)$/.exec(s) || /^(\d+)f$/.exec(s);
    if (m) return frameStart(Number(m[1]));
    m = /^(\d+):(\d\d):(\d\d)[:;](\d\d)$/.exec(s);
    if (m) return frameStart(((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * Math.round(fps()) + Number(m[4]));
    m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(s);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = Number(s.replace(/s$/, ''));
    return Number.isFinite(n) ? n : null;
  }
  function secsOf(v) { const s = String(v ?? '').trim().toLowerCase(); const m = /^(\d+(?:\.\d+)?)\s*bars?$/.exec(s); if (m) { const g = grid(); return g ? Number(m[1]) * D.barLen(g) : Number(m[1]) * 2; } const n = Number(s.replace(/s$/, '')); return Number.isFinite(n) ? n : 0; }

  // ---------- the directors (three_do sequence / three_sequence), lean ----------
  function status() {
    if (!S.edit) return { sequence: null, note: 'No Lab sequence yet: op "new" (or add a scene: one is made).' };
    const sh = D.showing(S.edit, S.T);
    return {
      sequence: S.key.slice(4), scene: lab()?.scenes.get(S.edit.seq?.scene || S.owner)?.name || null, format: D.formatOf(S.edit), fps: fps(), seconds: r4(total()), frames: Math.round(total() * fps()), on: S.view,
      playhead: { time: r4(S.T), frame: frameOf(S.T), timecode: tc(S.T), showing: sh.trans ? `${sh.trans.type} ${Math.round(sh.trans.p * 100)}%` : sh.main ? D.clipLabel(sh.main) : 'nothing' },
      song: songItem() ? base(songItem().src) : null, grid: grid() ? { bpm: grid().bpm, bar: r4(D.barLen(grid())) } : null,
      clips: D.describe(S.edit).slice(0, 40),
    };
  }
  async function sceneRef(v) {
    const L = lab();
    if (v == null || v === '' || v === 'current' || v === 'this') return L.sketchId();
    if (L.scenes.get(v)) return v;
    const s = String(v).toLowerCase();
    const all = L.scenes.all();
    const byName = all.find((x) => x.name.toLowerCase() === s) || all.find((x) => x.name.toLowerCase().includes(s));
    if (byName) return byName.id;
    if (/^\d+$/.test(s)) { const pins = new Set(store.get('three.sketchPins', [])); const sorted = [...all].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt); return sorted[Number(s) - 1]?.id || null; }
    return null;
  }
  async function handle(tool, a = {}, ctx = {}) {
    if (tool !== 'three_sequence') return null;
    const op = String(a.op || a.action || 'status');
    try {
      if (op === 'help') return { ok: true, value: 'ops: status | list | new {name, format} | open {name} | show | hide | add {scene | footage (path) | title (text) | overlay (layer / filter name) | song (path), at (s | "bar 9" | "f120"), bars | secs, look} | transition {clip, type, dur} (clip omitted: every cut) | length {clip, secs | bars} | trim {clip, edge: in|out, to} | split {at} | delete {clip, ripple} | move {clip, to (position 1..n)} | duplicate {clip} | slip {clip, frames} | look {clip, name} | fit (cuts on bars) | format {format} | seek {at} | frame {at, see} | play | pause | render {format: 9:16|16:9|1:1|4:5} | undo | redo · arrange {template, scenes: [names], secs, lines} (the scenes on the song sections, cuts on bars; again: another one) | templates | versions {secs: [15, 6], render} | fill {clip (a gap)} | vary {clip, amount, reset} | vary_sections | swap_looks {clip} | retime {song} | nest {name} | unnest {clip} | copy {clips: [..]} | paste {at, into (sequence name)} | roll {clip, to} | slide {clip, by} | marker {at, label} | section_markers | zoom {to: fit | "4 bars" | secs} | render {format: all} · nudge {clip(s), frames | beats} | trim_frames {clip, edge, frames} | speed {clip(s), rate} | color {clip(s), color | none} | markers_list | marker_go {name | n | next | prev} | marker_rename {n, label} | marker_delete {n} | snap {on} | select {what: all | none | after | range, from, until} | history {back | forward} | clip {clip} (go to it) | zoom_selection | range {in, out | clip | clear} (render {range: true} renders just it; loop loops it) | close_gaps | health · labcut: add {voice | sfx (path)} | volume {clip(s), volume: "50%" | 0.5 | "-6 dB"} | fade {clip(s), edge: in | out, secs} | reframe {clip(s), frame: "from left to right zoom 120%" | "right third" | "fit" | "blur" | "reset", all (every format)} | motion {clip(s), move: push-in | pull-out | pan-left | pan-right | pan-up | pan-down | punch | auto | none} | grade {clip(s) | all: true, look (EditFX look name | none), amt} | chop {clip(s), every: bar | beat | 2} | duck {on, amount 0..1} | mute_track {track} | captions {path (.srt / .vtt) | lines: [..], look} | caption_look {look: clean | box | social | gold | subtitle} | lower {text "Name — Role", preset, at} | outputs {formats: ["9:16","1:1","16:9"] | "socials"} | render_outputs. Each scene owns its sequence: ops act on the current scene one; of (or scene, except for add): another scene. clip = number (1 = first on the main track), "Titles.2", or a scene / title name.' };
      if (op === 'list') return { ok: true, value: { sequences: await list(), open: S.key?.slice(4) || null } };
      await ThreeLab.cmd({ show: true });
      if (op === 'new') { await create(a.name || null, { format: a.format || null, empty: Boolean(a.empty) }); return { ok: true, value: status() }; }
      if (op === 'open') { const all = await list(); const s = all.find((x) => x.name.toLowerCase() === String(a.name || '').toLowerCase()) || all.find((x) => x.name.toLowerCase().includes(String(a.name || '').toLowerCase())); if (!s) return { ok: false, error: `No sequence "${a.name}": ${all.map((x) => x.name).join(', ') || 'none yet'}` }; await open(s.key); return { ok: true, value: status() }; }
      // each scene owns its sequence: the one asked for (of / scene), the director chat's scene, else the one on screen
      const ask = a.of ?? (op !== 'add' && op !== 'arrange' ? a.scene : null);
      const sid = (ask != null ? await sceneRef(ask) : null) || ctx.sketchId || lab()?.sketchId() || null;
      if (ask != null && !sid) return { ok: false, error: `No scene "${ask}"` };
      // (a sequence you opened on purpose stays the one commands act on, until another scene comes on screen)
      if (!S.edit || (sid && S.owner !== sid && !(S.explicit && ask == null && !ctx.sketchId))) await current({ scene: sid });
      if (op === 'status' || op === 'read') return { ok: true, value: status() };
      if (op === 'show') { await enter(); return { ok: true, value: status() }; }
      if (op === 'hide') { await leave(); return { ok: true, value: { on: false } }; }
      const clipId = (ref) => { const id = D.resolve(S.edit, ref ?? targets()[0]); if (!id) throw new Error(`No clip "${ref}" (clips: ${D.describe(S.edit).slice(0, 12).join(' | ')})`); return id; };
      const len = () => (a.bars != null ? secsOf(`${a.bars} bars`) : a.secs != null ? Number(a.secs) : a.dur != null ? Number(a.dur) : null);
      if (op === 'add') {
        const at = timeOf(a.at ?? (a.bar != null ? `bar ${a.bar}` : null));
        const L0 = len();
        if (a.voice || a.sfx) await add({ path: a.voice || a.sfx, role: a.voice ? 'voice' : 'sfx' }, { at: at ?? S.T });
        else if (a.captions) await captionsFile(a.captions);
        else if (a.footage || a.path) await add({ path: a.footage || a.path, ...(a.in != null ? { a: Number(a.in) } : {}), ...(a.out != null ? { b: Number(a.out) } : {}) }, { at, dur: L0, gap: at != null });
        else if (a.song) await add({ path: a.song, song: true });
        else if (a.title != null || a.text != null) await add({ text: a.title ?? a.text, style: a.style, anim: a.anim }, { at, dur: L0 });
        else if (a.overlay) {
          const L = lab(); const sk = L.scenes.get(L.sketchId());
          const ly = sk ? L.scenes.layersOf(sk).find((x) => x.name.toLowerCase() === String(a.overlay).toLowerCase()) : null;
          const f = !ly && typeof ThreeLayers !== 'undefined' ? (ThreeLayers.FILTERS || []).find((x) => x.name.toLowerCase().includes(String(a.overlay).toLowerCase())) : null;
          if (!ly && !f) return { ok: false, error: `No layer or filter "${a.overlay}"` };
          await add({ overlay: ly ? { name: ly.name, code: ly.code, opacity: ly.opacity ?? 1, blend: ly.blend || 'normal' } : { name: f.name, code: f.code } }, { at, dur: L0 });
        } else {
          const sid = await sceneRef(a.scene ?? a.sketch ?? ctx.sketchId);
          if (!sid) return { ok: false, error: `No scene "${a.scene}" (scenes: ${lab().scenes.all().slice(0, 12).map((x) => x.name).join(', ')})` };
          await add({ sketch: sid, look: a.look || null }, { at, dur: L0, look: a.look || undefined, gap: at != null });
        }
        return { ok: true, value: status() };
      }
      if (op === 'transition') { const t = setTransition(a.type || 'dissolve', a.clip != null ? clipId(a.clip) : null, a.dur != null ? Number(a.dur) : null); return { ok: true, value: { transition: t, clips: D.describe(S.edit) } }; }
      if (op === 'length') { setLength(clipId(a.clip), len() || 4); return { ok: true, value: status() }; }
      if (op === 'trim') { const id = clipId(a.clip); const f = C.find(S.edit, id); const x = f.where === 'clip' ? D.timing(S.edit)[f.i] : { start: f.clip.start, end: C.itemEnd(f.clip) }; const to = timeOf(a.to); const edge = a.edge === 'in' ? 'in' : 'out'; const delta = to != null ? to - (edge === 'in' ? x.start : x.end) : Number(a.by) || 0; commit(D.trim(S.edit, id, edge, delta), 'Trim'); return { ok: true, value: status() }; }
      if (op === 'split') { seek(timeOf(a.at) ?? S.T); split(); return { ok: true, value: status() }; }
      if (op === 'delete') { del(Boolean(a.ripple), [clipId(a.clip)]); return { ok: true, value: status() }; }
      if (op === 'move') { const id = clipId(a.clip); const f = C.find(S.edit, id); commit(f.where === 'item' ? D.move(S.edit, id, timeOf(a.to) ?? 0) : D.move(S.edit, id, Math.max(0, Number(a.to) - 1 + (Number(a.to) - 1 > f.i ? 1 : 0))), 'Moved'); return { ok: true, value: status() }; }
      if (op === 'duplicate') { dup(clipId(a.clip)); return { ok: true, value: status() }; }
      if (op === 'slip') { slipBy(Number(a.frames) || 0, clipId(a.clip)); return { ok: true, value: status() }; }
      if (op === 'look') { setLook(clipId(a.clip), a.name || null); return { ok: true, value: status() }; }
      if (op === 'fit') { fit(); return { ok: true, value: status() }; }
      if (op === 'format') { setFormat(a.format); return { ok: true, value: status() }; }
      if (op === 'undo') { undo(); return { ok: true, value: status() }; }
      if (op === 'redo') { redo(); return { ok: true, value: status() }; }
      if (op === 'play' || op === 'pause') { await enter(); play(op === 'play'); return { ok: true, value: { playing: op === 'play' } }; }
      if (op === 'seek' || op === 'frame') {
        await enter();
        const t = a.frame != null ? frameStart(Number(a.frame)) : timeOf(a.at ?? a.time);
        if (t == null) return { ok: false, error: 'at: seconds, "f120", "00:00:04:12" or "bar 9"' };
        play(false); seek(t); await settle(); await sleep(250);
        const out = { ok: true, value: status().playhead };
        if (op === 'frame' && a.see !== false) { const url = await lab().director()?.shot?.(); if (url) out.images = [{ data: url.split(',')[1], mime: url.slice(5, url.indexOf(';')) }]; }
        return out;
      }
      if (op === 'templates') return { ok: true, value: (A?.TEMPLATES || []).map((t) => `${t.id}: ${t.name}, ${t.desc}`) };
      if (op === 'arrange' || op === 'again') {
        const names = [].concat(a.scenes || []).filter(Boolean);
        const info = op === 'again' ? await again() : await arrange({ template: a.template || null, names: names.length ? names : null, secs: a.secs != null ? Number(a.secs) : null, lines: a.lines ? [].concat(a.lines) : null, seed: a.seed != null ? Number(a.seed) : null });
        return { ok: true, value: { arranged: info, ...status() } };
      }
      if (op === 'decide') { const r = await decideArrangement(a.goal || ''); return { ok: true, value: { picked: r?.pick || null, by: r?.by || null, ...status() } }; }
      if (op === 'versions' || op === 'cutdown') { const made = await versions([].concat(a.secs || [15, 6]).map(Number), { render: Boolean(a.render) }); return { ok: true, value: { made } }; }
      if (op === 'fill') { const id = a.clip != null ? clipId(a.clip) : C.at(S.edit, S.T)?.clip.id; const r = await fillGap(id); return { ok: true, value: { filled: r.scene, ...status() } }; }
      if (op === 'vary') { vary(clipId(a.clip), { amount: a.amount != null ? Number(a.amount) : null, reset: Boolean(a.reset) }); return { ok: true, value: status() }; }
      if (op === 'vary_sections') { varySections(); return { ok: true, value: status() }; }
      if (op === 'swap_looks') { swapLooks(clipId(a.clip)); return { ok: true, value: status() }; }
      if (op === 'retime') { const info = await retime(a.song || a.path || null); return { ok: true, value: { arranged: info, ...status() } }; }
      if (op === 'nest') { const all = await list(); const q = String(a.name || '').toLowerCase(); const s0 = all.find((x) => x.name.toLowerCase() === q) || all.find((x) => x.name.toLowerCase().includes(q)); if (!s0) return { ok: false, error: `No sequence "${a.name}"` }; await nest(s0.key, { at: timeOf(a.at) }); return { ok: true, value: status() }; }
      if (op === 'unnest') { unnest(clipId(a.clip)); return { ok: true, value: status() }; }
      if (op === 'copy') { copySel([].concat(a.clips ?? a.clip ?? []).map((x) => clipId(x))); return { ok: true, value: { copied: clip?.length || 0 } }; }
      if (op === 'paste') {
        if (!clip?.length) return { ok: false, error: 'Nothing copied (op copy first)' };
        if (a.into) { const all = await list(); const q = String(a.into).toLowerCase(); const s0 = all.find((x) => x.name.toLowerCase() === q) || all.find((x) => x.name.toLowerCase().includes(q)); if (!s0) return { ok: false, error: `No sequence "${a.into}"` }; await open(s0.key, { show: S.view }); }
        paste(timeOf(a.at) ?? S.T); return { ok: true, value: status() };
      }
      if (op === 'roll') { const id = clipId(a.clip); const i = S.edit.clips.findIndex((c) => c.id === id); const T0 = D.timing(S.edit); const to = timeOf(a.to); if (i < 1 || to == null) return { ok: false, error: 'roll {clip (2..n): the cut before it, to: a time}' }; commit(D.roll(S.edit, i, to - T0[i].start), 'Rolled'); return { ok: true, value: status() }; }
      if (op === 'slide') { commit(D.slide(S.edit, clipId(a.clip), Number(a.by) || 0), 'Slid'); return { ok: true, value: status() }; }
      if (op === 'marker') { if (a.at != null) seek(timeOf(a.at) ?? S.T); marker(a.label || ''); return { ok: true, value: { markers: (S.edit.markers || []).map((m) => `${m.t.toFixed(2)} ${m.label || ''}`.trim()) } }; }
      if (op === 'section_markers') { await sectionMarkers(); return { ok: true, value: { markers: (S.edit.markers || []).map((m) => `${m.t.toFixed(2)} ${m.label || ''}`.trim()) } }; }
      if (op === 'zoom') { zoomTo(a.to === 'fit' || a.to == null ? 'fit' : /bar/.test(String(a.to)) ? String(a.to) : Number(a.to)); return { ok: true, value: { view: S.vr ? [r4(S.vr.t0), r4(S.vr.t1)] : 'all' } }; }
      if (op === 'render' && /^all$/i.test(String(a.format || ''))) { const out = []; for (const f of Object.keys(D.FORMATS)) out.push((await render({ format: f })).path); return { ok: true, value: { files: out, note: 'A video file (the owner opens it with Open / Show in Finder)' } }; }
      if (op === 'render') { const r = await render({ format: a.format || null, range: a.range ? rangeOf() : null }); return { ok: true, value: { file: r.path, frames: r.frames, format: r.format, size: `${r.w}×${r.h}`, note: 'A video file (the owner opens it with Open / Show in Finder)' } }; }
      // ---- seqguard (round 13): nudge, key trims, speed, colors, markers, snapping, selection, history, health ----
      const many = (v) => [].concat(v ?? []).map((x) => clipId(x));
      if (op === 'nudge') { const ids = a.clips != null || a.clip != null ? many(a.clips ?? a.clip) : targets(); nudge(Number(a.frames) || 0, { beats: Number(a.beats) || 0, ids }); return { ok: true, value: status() }; }
      if (op === 'trim_frames') { trimBy(a.edge === 'in' ? 'in' : 'out', Number(a.frames) || 0, clipId(a.clip)); return { ok: true, value: status() }; }
      if (op === 'speed') { setSpeed(a.rate ?? a.speed ?? 1, a.clips != null || a.clip != null ? many(a.clips ?? a.clip) : targets()); return { ok: true, value: status() }; }
      if (op === 'color') { setColor(a.color ?? null, a.clips != null || a.clip != null ? many(a.clips ?? a.clip) : targets()); return { ok: true, value: status() }; }
      if (op === 'markers_list') return { ok: true, value: { markers: markerList() } };
      if (op === 'marker_go') { const m = goMarker(a.name ?? a.marker ?? a.n ?? 'next'); return m ? { ok: true, value: { at: r4(m.t), label: markerName(m) } } : { ok: false, error: `No marker "${a.name ?? a.n}" (markers: ${markerList().map((x) => `${x.n} ${x.label}`).join(', ') || 'none'})` }; }
      if (op === 'marker_rename') { if (!renameMarker(a.marker ?? a.n, a.label ?? a.name)) return { ok: false, error: 'No such marker' }; return { ok: true, value: { markers: markerList() } }; }
      if (op === 'marker_delete') { if (!deleteMarker(a.marker ?? a.n ?? a.name)) return { ok: false, error: 'No such marker' }; return { ok: true, value: { markers: markerList() } }; }
      if (op === 'snap') { return { ok: true, value: { snap: setSnap(a.on == null ? undefined : Boolean(a.on) && a.on !== 'off') } }; }
      if (op === 'select') {
        const w = String(a.what ?? a.to ?? 'all').toLowerCase();
        const n = w === 'all' ? selectAll() : w === 'none' ? (S.sel.clear(), redraw(), 0) : /^(after|rest|forward)$/.test(w) ? selectAfter() : w === 'range' ? selectRange(timeOf(a.from) ?? 0, timeOf(a.until ?? a.end) ?? total()) : (S.sel = new Set(many(a.clips ?? w.split(/[\s,]+/))), redraw(), S.sel.size);
        return { ok: true, value: { selected: n, clips: selIds().map((id) => D.clipLabel(C.find(S.edit, id).clip)) } };
      }
      if (op === 'history') { if (a.back != null) goBack(Number(a.back) || 1); if (a.forward != null) goForward(Number(a.forward) || 1); return { ok: true, value: history() }; }
      if (op === 'clip' || op === 'goto_clip') { const id = goClip(a.clip ?? a.n); if (!id) return { ok: false, error: `No clip "${a.clip}"` }; return { ok: true, value: status().playhead }; }
      if (op === 'health') return { ok: true, value: health() };
      if (op === 'zoom_selection') return { ok: true, value: { view: zoomToSel() || 'all' } };
      if (op === 'range') {
        if (a.clear || a.to === 'clear') clearRange();
        else if (a.clip != null) rangeToClip(clipId(a.clip));
        else if (a.in != null || a.out != null || a.from != null) { const r0 = rangeOf(); setRange(timeOf(a.in ?? a.from) ?? r0?.a ?? 0, timeOf(a.out ?? a.until) ?? r0?.b ?? total()); }
        const r = rangeOf();
        return { ok: true, value: { range: r ? { a: r4(r.a), b: r4(r.b), from: tc(r.a), to: tc(r.b) } : null } };
      }
      if (op === 'close_gaps') { closeGaps(); return { ok: true, value: status() }; }
      // ---- labcut (round 18): footage framing, sound, looks, captions, lower thirds, outputs ----
      const sel = () => (a.clips != null || a.clip != null ? many(a.clips ?? a.clip) : targets());
      if (op === 'volume') { setVolume(a.volume ?? a.to ?? '100%', sel()); return { ok: true, value: status() }; }
      if (op === 'fade') { setFade(a.edge === 'out' ? 'out' : 'in', Number(a.secs ?? a.dur ?? 1), sel()); if (a.edge === 'both') setFade('out', Number(a.secs ?? a.dur ?? 1), sel()); return { ok: true, value: status() }; }
      if (op === 'reframe' || op === 'fit_frame') { // (op "frame" is the seek that looks at a frame)
        const spec = typeof a.frame === 'object' && a.frame ? a.frame : X().parseFrame(a.frame ?? a.to ?? a.fit ?? '');
        if (!spec) return { ok: false, error: 'frame: "from left to right", "right third", "zoom 120%", "fit", "blur", "fill" or "reset"' };
        setFrame(spec, sel(), { all: Boolean(a.all) });
        return { ok: true, value: { format: D.formatOf(S.edit), clips: D.describe(S.edit) } };
      }
      if (op === 'motion' || op === 'kenburns') { setMotion(String(a.move ?? a.motion ?? 'push-in'), sel()); return { ok: true, value: status() }; }
      if (op === 'grade' || op === 'look_clip') { const lk = /^(none|off)$/i.test(String(a.look ?? '')) ? null : a.look; const got = setGrade(lk || null, { amt: a.amt != null ? Number(a.amt) : null, ids: a.all ? [] : sel(), all: Boolean(a.all) }); return { ok: true, value: { look: got, name: got ? EditFX.LOOK[got].name : null } }; }
      if (op === 'chop') { const n = chop(a.every === 'beat' ? 'beat' : Number(a.every) > 0 ? Number(a.every) : 'bar', sel()); return { ok: true, value: { cuts: n, clips: D.describe(S.edit) } }; }
      if (op === 'duck') { setDuck(a.on == null ? true : Boolean(a.on) && a.on !== 'off', a.amount != null ? Number(a.amount) : null); return { ok: true, value: { duck: S.edit.seq.duck !== false, amount: S.edit.seq.duckAmt ?? X().DEFAULT_DUCK } }; }
      if (op === 'mute_track') { const k = (S.edit.tracks || []).find((x) => x.name.toLowerCase() === String(a.track || '').toLowerCase()); if (!k) return { ok: false, error: `No track "${a.track}" (tracks: ${(S.edit.tracks || []).map((x) => x.name).join(', ')})` }; return { ok: true, value: { [k.name]: muteTrack(k.id, a.on) ? 'off' : 'on' } }; }
      if (op === 'captions') { const n = a.path ? await captionsFile(a.path, a.look ? { look: a.look } : {}) : captionsTyped([].concat(a.lines ?? a.text ?? []).join('\n'), { each: a.each != null ? Number(a.each) : null, look: a.look }); return { ok: true, value: { captions: n, clips: D.describe(S.edit) } }; }
      if (op === 'caption_look') { captionLook(a.look); return { ok: true, value: { look: a.look } }; }
      if (op === 'lower') { if (a.at != null) seek(timeOf(a.at) ?? S.T); addLower(a.text || 'Name — Role', { preset: a.preset || S.edit.seq?.lowerLook || 'forge', dur: a.secs != null ? Number(a.secs) : null }); return { ok: true, value: status() }; }
      if (op === 'outputs') { const fs = Array.isArray(a.formats) ? a.formats : X().parseOutputs(a.formats ?? a.to ?? '', D.FORMATS); return { ok: true, value: { outputs: setOutputs(fs) } }; }
      if (op === 'render_outputs') { const rs = await renderOutputs(); return { ok: true, value: { files: rs.map((r) => r.path), note: 'One video per output, each with its own framing' } }; }
      return { ok: false, error: `Unknown op "${op}" (op: "help")` };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // the preview's right-click: add the scene on screen to the sequence
  function previewItem() {
    if (S.view) return { label: '▤ Sequence', items: () => [{ label: '＋ Add this scene here', hint: 'at the playhead', action: () => addCurrent({ at: S.T }) }, { label: '⇪ Render…', action: () => renderPanel() }, { label: '↻ Reload the preview', action: () => reloadPreview() }, { label: '← Back to the scene', action: () => leave() }] };
    return { label: '▤ Add this scene to the sequence', hint: S.key ? S.key.slice(4) : 'a new one', action: () => addCurrent().catch((err) => toast(err.message, { type: 'error' })) };
  }

  // "/decide arrangement" (and ✦ Let Astra pick one): Astra picks the template from a picture of the scene and a few
  // words about the scenes and the song (decide.js: one small question, Undo, a local default without tokens)
  addEventListener('DOMContentLoaded', () => {
    if (typeof Decide === 'undefined' || !Decide.KINDS || Decide.KINDS.arrangement || !A) return;
    Decide.KINDS.arrangement = {
      label: 'an arrangement for the Lab sequence', goal: 'the shape that suits these scenes on this song', visual: true,
      candidates: () => A.TEMPLATES.filter((t) => !t.lines).slice(0, 8).map((t) => ({ id: t.id, name: t.name })),
      async apply(c) { const before = S.edit ? JSON.stringify(S.edit) : null; await arrange({ template: c.id }); return () => { if (before) commit(JSON.parse(before), 'Back to before'); }; },
      local: async (cands) => { const song = S.edit && D.songOf(S.edit) ? await songInfo() : null; const want = !song ? 'reel' : song.dur > 90 ? 'teaser' : 'music-video'; return cands.find((c) => c.id === want) || cands[0]; },
    };
  });
  // each scene's sequence in a few words for the chat rows / scene menus, once the Lab is up (no reads after that
  // but the listings the sequence makes anyway)
  // another scene on screen while the sequence is hidden: the next ▤ Sequence opens that scene's own
  addEventListener('hearth:sketch', () => { if (S.hold) { S.hold = false; return; } if (!S.view && !S.render) S.explicit = false; });
  addEventListener('hearth:lab-ready', () => { setTimeout(() => list().then(() => emit('index', {})).catch(() => {}), 1500); });
  const api = {
    renderPanel, reloadPreview, setRange, markIn, markOut, clearRange, rangeToClip, rangeOf: () => rangeOf(), closeGaps, restore, sizeChanged, health, history, goBack, goForward, nudge, trimBy, setSpeed, setColor, goMarker, renameMarker, deleteMarker, markerList, setSnap, selectAll, selectRange, selectAfter, zoomToSel, playAround, goClip, SWATCHES, attach, onMessage, takeRecording, keep, owns: () => S.view, sketchChanged, previewItem,
    // (round 27, autoedit) a whole edit made elsewhere (tools/three-autoedit.js) as one undo step, from the start
    applyEdit: (e, label) => { const ok = commit(e, label); S.vr = null; seek(0); return ok; },
    enter, leave, toggle, open, create, current, list, add, addCurrent, applyVibe, select, split, del, dup, slipBy, trimToHead, marker, setTransition, setLength, setLook, fit, setFormat,
    play, seek, step, shuttle, jump, settle, undo, redo, render, renderEdit, renderScene, needsBake, bake, compile, status, handle, timeOf, secsOf, zoomBy,
    arrange, again, retime, versions, fillGap, vary, varySections, copyLook, pasteLook, swapLooks, nest, unnest, copySel, paste, zoomTo, sectionMarkers, decideArrangement,
    setFrame, setFit, frameEverywhere, setMotion, setVolume, setFade, setDuck, muteTrack, setGrade, setGradeAmt, setCGrade, chop, captionsFile, captionsTyped, captionsFromCues, captionLook, exportCaptions, addLower, lowerLook, setOutputs, outputsOf: () => outputsOf(), renderOutputs, writeCaptions,
    audioPlan, duckOf, // (labexport: the sound of an export page's render)
    outDir, keyForScene, switchTo, summaryFor, sceneCopied, songInfo, pickScenes, bakeRuns, get owner() { return S.owner; },
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    get active() { return S.view; }, get key() { return S.key; }, get edit() { return S.edit ? C.copy(S.edit) : null; }, get time() { return S.T; }, get playing() { return S.playing; }, get fps() { return fps(); },
    get selection() { return selIds(); }, get rendering() { return Boolean(S.render) || S.xpRender > 0; }, KEYS, _S: S, _draw: () => draw(), _hit: hit, _xOf: (t) => xOf(t), _lanes: () => lanes(),
  };
  return api;
})();
if (typeof module !== 'undefined') module.exports = ThreeSeq;
