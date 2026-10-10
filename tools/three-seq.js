// The Lab's Sequence: a video timeline built right in the Three.js Lab. "▤ Sequence" on the timeline's top strip (or
// /sequence) turns the Lab timeline into tracks: Scenes (your sketches / chat scenes / looks as clips, with the
// editor's transitions between them) and footage on the main track, Titles (the editor's styles and animations),
// Overlays (Lab layers or filters over a range) and Sound (the song: its analysis still drives what reacts to it).
// The preview plays the sequence live, in the same page (scenes switch and cross-fade without reloads, each scene
// on its own clock, so any frame can be reached exactly), and ⇪ renders it frame by frame (the sandbox steps its
// clock, every frame is captured at the frame size, ffmpeg muxes the sound) into Video Review.
// One model with the editor: the sequence is a CutData edit stored with the editor's sequences (kv video-cuts,
// "seq:<name>", seq.lab = true; tools/three-seq-data.js), so Video Review's editor opens it for finishing (scene clips
// render through the Lab there) and the Lab takes it back. Chat: tools/three-seq-cmds.js; directors: three_do sequence.
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
  };
  const A = typeof SeqArrange !== 'undefined' ? SeqArrange : null;
  const TR = () => (typeof SeqTrans !== 'undefined' ? SeqTrans : null);
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

  // ---------- storage (the editor's sequences: kv video-cuts) ----------
  const VC = () => (typeof VideoCut !== 'undefined' ? VideoCut : null);
  async function readEdit(key) { const e = await VC()?.editFor(key); return e ? C.normalize(e) : null; }
  async function writeEdit(label) {
    if (!S.key || !S.edit) return;
    S.storing = true;
    try { await VC()?.storeEdit(S.key, withEnd(C.copy(S.edit)), label || 'From the Lab sequence'); } finally { S.storing = false; }
  }
  // a song longer than the pictures: the editor gets the same end as an in–out range (its renders stop there too),
  // unless you set your own range in the editor
  function withEnd(e) {
    const vis = programEnd(e); const all = C.total(e);
    if (all > vis + 0.05 && vis > 0) { if (!e.mark || e.mark.lab) e.mark = { a: 0, b: r4(vis), lab: true }; } else if (e.mark?.lab) e.mark = null;
    return e;
  }
  const saveSoon = debounce(() => writeEdit(), 300);
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
  function commit(next, label) {
    if (!S.edit || !next || next === S.edit) return false;
    S.undo.push(JSON.stringify(S.edit));
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
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
    redraw();
    pushPlan();
    emit('change', { key: S.key });
  }
  function undo() { if (!S.undo.length) return false; S.redo.push(JSON.stringify(S.edit)); setEdit(JSON.parse(S.undo.pop())); flash('Undo'); return true; }
  function redo() { if (!S.redo.length) return false; S.undo.push(JSON.stringify(S.edit)); setEdit(JSON.parse(S.redo.pop())); flash('Redo'); return true; }

  // ---------- opening ----------
  async function open(key, { show = true } = {}) {
    const e = await readEdit(key);
    if (!e) throw new Error(`No sequence "${String(key).replace(/^seq:/, '')}"`);
    if (!e.seq?.lab) e.seq = { ...(e.seq || {}), lab: true };
    S.key = key; S.edit = e; S.undo = []; S.redo = []; S.sel.clear(); S.T = 0; S.vr = null; S.thumbs.clear();
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
  let switching = null;
  async function switchTo(sid) {
    if (!sid || S.render) return;
    const run0 = (switching = Symbol('switch'));
    const k = await keyForScene(sid);
    if (switching !== run0 || !k) return;
    if (k !== S.key) { await open(k, { show: false }); }
    S.owner = sid; S.entered = sid; S.explicit = false;
    if (!S.view) return;
    await Promise.all([ensureSong(), loadMaps()]);
    if (switching !== run0) return;
    S.sent.plan = '';
    await sendPlan({ force: true, fade: true });
    send({ type: 'seq-seek', T: S.T });
    send({ type: 'seq-loop', on: S.loop });
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
    return new Promise((r) => { const m = document.createElement(VID.test(p) ? 'video' : 'audio'); m.preload = 'metadata'; m.onloadedmetadata = () => r(m.duration || 0); m.onerror = () => r(0); m.src = `file://${p}`; setTimeout(() => r(0), 6000); });
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
  const shiftKeys = (keys, dt) => keys.map((k) => ({ ...k, t: r4(k.t + dt) }));
  const ANIM = ['opacity', 'x', 'y', 'scale', 'rotate'];
  function prepLayer(L, slot, { look = null, palette = null, t0 = 0, vary = null, cues = null } = {}) {
    const keys = Object.fromEntries(ANIM.filter((p) => L.keys?.[p]?.length).map((p) => [p, shiftKeys(L.keys[p], t0)]));
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
      if (i >= 0) sliderKeys[b + i] = { call: sc.items[i].call, key: sc.items[i].key, num: sc.items[i].kind === 'color' && !sc.items[i].quote, keys: shiftKeys(ks, t0) };
    }
    // the scene's cue looks (✦ a look per song section) move with the clip too: held slider keys at the cues' times
    if (cues?.length) {
      ids.forEach((id, i) => {
        if (sliderKeys[b + i] || !cues.some((q) => id in q.values)) return;
        const ks = [{ t: -1e6, v: runtime(sc.items[i], vals[i]), ease: 'hold' }];
        for (const q of cues) if (id in q.values) ks.push({ t: r4(q.t + t0), v: runtime(sc.items[i], q.values[id]), ease: 'hold' });
        sliderKeys[b + i] = { call: sc.items[i].call, key: sc.items[i].key, num: false, keys: ks };
      });
    }
    let code = sc.code;
    try { code = ThreeTweaks.instrument(sc.code, sc.items, b); } catch { return { code: L.code, values: undefined, keys, sliderKeys: {} }; }
    return { code, values: Object.fromEntries(vals.map((v, i) => [b + i, runtime(sc.items[i], v)])), keys, sliderKeys };
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
    const t0 = r4(x.start - (c.in || 0));
    const looks = looksOf(sk);
    // its own song's hand-placed hits and cue looks (in the scene's own time: they move with the clip)
    const map = S.maps?.[L.scenes.songOf?.(sk.id)] || null;
    const marks = map?.marks && ['kick', 'snare', 'hit'].some((k) => map.marks[k]?.length) ? { kick: map.marks.kick || [], snare: map.marks.snare || [], hit: map.marks.hit || [] } : null;
    return L.scenes.layersOf(sk).filter((ly) => ly.visible !== false).map((ly, j) => {
      const mine = looks[ly.id] || looks.main || [];
      const look = c.look ? mine.find((l) => l.name === c.look)?.values : null;
      const cues = !c.look && map?.cues?.length ? map.cues.map((q) => ({ t: q.t, name: q.looks?.find((l) => l.layer === ly.id || l.layer === ly.name)?.name })).filter((q) => q.name).map((q) => ({ t: q.t, values: mine.find((l) => l.name === q.name)?.values })).filter((q) => q.values) : null;
      const p = prepLayer(ly, slot0 + j, { look, palette: c.vibe?.palette, t0, vary: c.vary ? { seed: (c.vary.seed || 1) + j * 101, amount: c.vary.amount ?? 0.4 } : null, cues });
      return { id: `${c.id}~${ly.id}`, code: p.code, values: p.values, props: { name: `${c.name} · ${ly.name}`, share: shareKey(ly), opacity: ly.opacity ?? 1, blend: ly.blend || 'normal', x: ly.x || 0, y: ly.y || 0, scale: ly.scale ?? 1, rotate: ly.rotate || 0, in: ly.in != null ? r4(ly.in + t0) : null, out: ly.out != null ? r4(ly.out + t0) : null, fadeIn: ly.fadeIn || 0, fadeOut: ly.fadeOut || 0, keys: p.keys, sliderKeys: p.sliderKeys, ...(marks ? { seqMarks: marks } : {}), ...(ly.precomp && typeof ThreeComp !== 'undefined' ? { precomp: ThreeComp.specOf(ly, sk.id, { slotBase: 3000 + (slot0 + j) * 50 }) } : {}) } };
    });
  }
  // what makes two scenes' layers "the same layer" for a morph: its name, or its code when the name says nothing
  const hashStr = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const shareKey = (ly) => { const nm = String(ly.name || '').trim(); return !nm || /^(main|layer\s*\d*|new layer.*)$/i.test(nm) ? `code:${hashStr(ly.code || '')}` : nm.toLowerCase(); };
  const TITLE_KEYS = ['text', 'style', 'anim', 'out', 'animDur', 'lower', 'x', 'y', 'size', 'color', 'align', 'font', 'weight', 'stroke', 'strokeW', 'shadow', 'glow', 'box', 'upper', 'tracking', 'shape', 'bg', 'fg', 'italic', 'rotate'];
  const titleOf = (x) => Object.fromEntries(TITLE_KEYS.filter((k) => x[k] != null).map((k) => [k, x[k]]));
  function compile(e0 = S.edit) {
    const e = flat(e0); // nested sequences play what they hold
    const groups = []; const titles = []; const assets = new Set(); const sounds = [];
    let slot = 100;
    for (const x of D.timing(e)) {
      const c = x.clip;
      const g = { id: c.id, main: true, start: r4(x.start), end: r4(x.end), td: r4(x.td || 0), trans: c.trans?.type || null, z: 100 + x.i * 20 };
      if (c.off) continue;
      if (c.kind === 'scene') {
        const layers = sceneLayers(c, x, slot);
        slot += 16;
        if (layers) groups.push({ ...g, kind: 'scene', t0: r4(x.start - (c.in || 0)), layers });
        else groups.push({ ...g, kind: 'card', card: { text: `Missing scene “${c.name}”`, style: 'bold', bg: '#200810' } });
      } else if (c.kind === 'video') { groups.push({ ...g, kind: 'footage', asset: c.src, a: c.reverse ? c.out : c.in, speed: c.speed || 1, mute: c.mute !== false, volume: c.volume ?? 1, fps: S.probes.get(c.src)?.fps || 30, fit: c.fit || 'cover' }); assets.add(c.src); }
      else if (c.kind === 'title') groups.push({ ...g, kind: 'card', card: { ...titleOf(c), bg: c.bg || '#000000' } });
      else if (c.kind === 'color') groups.push({ ...g, kind: 'color', card: { fill: c.fill || '#000000' } });
      else if (c.kind === 'image') { groups.push({ ...g, kind: 'image', asset: c.src, fit: c.fit || 'cover' }); assets.add(c.src); }
    }
    (e.tracks || []).filter((k) => k.type === 'video' && !k.hide).forEach((k, ti) => k.items.forEach((it, j) => {
      if (it.off) return;
      const g = { id: it.id, main: false, start: r4(it.start), end: r4(C.itemEnd(it)), td: 0, z: 10000 + ti * 1000 + j * 20 };
      if (it.kind === 'layer') { const p = prepLayer({ code: it.code, keys: it.keys }, slot, { t0: it.start }); slot += 1; groups.push({ ...g, kind: 'scene', t0: g.start, layers: [{ id: `${it.id}~o`, code: p.code, values: p.values, props: { name: it.name || 'Overlay', opacity: it.opacity ?? 1, blend: it.blend || 'normal', keys: p.keys, sliderKeys: p.sliderKeys } }] }); }
      else if (it.kind === 'video') { groups.push({ ...g, kind: 'footage', asset: it.src, a: it.in, speed: it.speed || 1, mute: it.mute !== false, fps: S.probes.get(it.src)?.fps || 30, fit: 'contain' }); assets.add(it.src); }
      else if (it.kind === 'image') { groups.push({ ...g, kind: 'image', asset: it.src, fit: 'contain' }); assets.add(it.src); }
    }));
    for (const k of (e.tracks || []).filter((x) => x.type === 'text' && !x.hide)) for (const it of k.items) if (!it.off) titles.push({ id: it.id, start: r4(it.start), end: r4(C.itemEnd(it)), item: titleOf(it) });
    const s = D.songOf(e);
    const song = s ? { offset: r4(s.start - s.in), start: r4(s.start), end: r4(s.start + (s.out - s.in) / (s.speed || 1)), src: s.src } : null;
    // the other sound clips play in the preview too (and in the real-time recording)
    for (const k of (e.tracks || []).filter((x) => x.type === 'audio' && !x.mute)) for (const it of k.items) if (!it.song && !it.off && it.src) { sounds.push({ id: it.id, asset: it.src, start: r4(it.start), end: r4(C.itemEnd(it)), a: r4(it.in || 0), volume: it.volume ?? 1, speed: it.speed || 1 }); assets.add(it.src); }
    return { plan: { fps: e.seq?.fps || 30, w: e.seq?.w || 1080, h: e.seq?.h || 1920, dur: r4(programEnd(e)), song, groups, titles, sounds }, assets: [...assets] };
  }
  // the editor's drawing code for titles and transitions, the footage files: sent once per preview page
  const appDir = () => { let p = decodeURIComponent(new URL('.', location.href).pathname); if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); return p.replace(/[\\/]$/, ''); };
  let libText = null;
  async function libs() {
    if (libText) return libText;
    const dir = appDir();
    const [a, b, c] = await Promise.all(['tools/cut-presets.js', 'tools/video-titles.js', 'tools/three-seq-trans.js'].map((f) => window.hub.fs.read(`${dir}/${f}`)));
    libText = `${a}\n${b}\n${c}`; // (the Lab transitions add themselves to EditFX in there too)
    return libText;
  }
  let planSeq = 0;
  async function sendPlan({ force = false, fade = false } = {}) {
    const L = lab();
    if (!L || !S.view || !S.edit) return;
    const my = ++planSeq;
    const { plan, assets } = compile();
    for (const p of assets) if (!S.probes.has(p)) await probe(p);
    if (my !== planSeq) return;
    const fresh = compile().plan; // fps from the probes
    if (!S.sent.libs) {
      S.sent.libs = true;
      try { L.send({ type: 'seq-libs', code: await libs() }); } catch (err) { console.warn('Sequence: titles / transitions code', err); }
      try { const f = await window.hub.fs.read(`${appDir()}/assets/oxanium.ttf`, { encoding: 'buffer' }); L.send({ type: 'seq-font', name: 'Oxanium', buffer: f }); } catch { /* the fallback fonts */ }
    }
    for (const p of assets) {
      if (S.sent.assets.has(p)) continue;
      S.sent.assets.add(p);
      try { const bytes = await window.hub.fs.read(p, { encoding: 'buffer' }); L.send({ type: 'seq-asset', id: p, buffer: bytes, mime: IMG.test(p) ? `image/${/png$/i.test(p) ? 'png' : 'jpeg'}` : AUD.test(p) ? `audio/${({ mp3: 'mpeg', m4a: 'mp4', aac: 'aac', wav: 'wav', ogg: 'ogg', flac: 'flac', opus: 'ogg' })[p.split('.').pop().toLowerCase()] || 'mpeg'}` : 'video/mp4' }); } catch (err) { S.sent.assets.delete(p); toast(`Couldn't read ${base(p)}: ${err.message}`, { type: 'error' }); }
    }
    if (my !== planSeq) return;
    const text = JSON.stringify(fresh);
    if (!force && text === S.sent.plan) return;
    S.sent.plan = text;
    L.send({ type: 'seq-set', plan: fresh, fade });
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
    S.playing = false;
    if (L.player.playing) L.player.toggle(false);
    // the preview takes the sequence's shape (one pretty reload when it was "fit"); the size you had comes back after
    S.sizeBefore = L.stage.size.id;
    const fmt = D.formatOf(S.edit);
    if (L.stage.size.id !== fmt) L.stage.setMode(fmt);
    await sendPlan({ force: true });
    L.send({ type: 'seq-seek', T: S.T });
    L.send({ type: 'seq-loop', on: S.loop });
    requestAnimationFrame(() => { measure(); redraw(); placeHead(); paintTime(); });
    emit('mode', { on: true });
    return true;
  }
  // back to the sketch: the sequence leaves the page, the sketch (and its own song) come back in place
  async function leave({ rerun = true } = {}) {
    const L = lab();
    if (!S.view || !L) return false;
    stopShuttle();
    S.view = false; S.playing = false;
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
  // the preview page was replaced (a new frame size, a restart): everything goes again
  function onMessage(msg) {
    if (msg.type === 'ready') { S.sent = { libs: false, assets: new Set(), plan: '' }; if (S.view) { ensureSong().then(() => sendPlan({ force: true })).then(() => lab()?.send({ type: 'seq-seek', T: S.T })); } return false; }
    if (msg.type === 'seq-state') {
      const was = S.playing;
      if (S.shuttle >= 0 || !S.shuttleTimer) S.T = msg.T;
      S.playing = msg.playing;
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
  const send = (m) => lab()?.send(m);
  function seek(T, { snapFrame = true } = {}) {
    const D0 = total();
    S.T = clamp(snapFrame ? frameStart(frameOf(T + 1e-6)) : T, 0, D0);
    if (S.view) send({ type: 'seq-seek', T: S.T });
    paintTime(); placeHead();
    return S.T;
  }
  function play(on = !S.playing, rate = 1) {
    if (!S.view) { enter().then(() => play(on, rate)); return; }
    stopShuttle();
    S.playing = on; S.rate = rate;
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
  function settle(ms = 1500) { return new Promise((r) => { const t = setTimeout(() => r(null), ms); S.waits.push((m) => { clearTimeout(t); r(m); }); send({ type: 'seq-seek', T: S.T }); }); }

  // ---------- edits (the editor's keys) ----------
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
      if (VID.test(p)) { const d = await durationOf(p); await probe(p); n = D.addFootage(n, p, { duration: d, at, index, grid: g, trans, gap, mute: Boolean(songItem()) }); if (len) n = D.setDur(n, n.lastClip, len); commit(n, `＋ ${base(p)}`); select(n.lastClip); return n.lastClip; }
      if (AUD.test(p)) {
        const d = await durationOf(p);
        if (!songItem() || what.song) { n = D.setSong(n, p, d); commit(n, `♪ ${base(p)}`); await ensureSong(); return 'song'; }
        n = D.addAudio(n, p, d, { at: at ?? S.T }); commit(n, `＋ ${base(p)}`); return n.lastItem;
      }
      if (IMG.test(p)) { const it = { kind: 'image', src: p, dur: len || 2, mute: true }; n = D.place(n, { ...it, id: C.uid(), speed: 1, fadeIn: 0, fadeOut: 0 }, { at, index, grid: g, trans }); commit(n, `＋ ${base(p)}`); return null; }
      throw new Error(`${base(p)}: a video, a picture or a sound file`);
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
    S.loop = Boolean(r.edit.seq?.loop); send({ type: 'seq-loop', on: S.loop });
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

  // ---------- the editor (Video Review): the same edit ----------
  async function toEditor() {
    if (!S.key) await current();
    await writeEdit('From the Lab sequence');
    if (S.view) await leave();
    activate('tool:ae');
    await Review.ensureMounted();
    if (VideoCut.active && VideoCut.path !== S.key) VideoCut.leave();
    await VideoCut.enter({ path: S.key });
    return S.key;
  }
  // back from the editor: whatever was changed there is the sequence now
  async function fromEditor(key = S.key) {
    if (!key) throw new Error('No sequence');
    if (typeof VideoCut !== 'undefined' && VideoCut.active && VideoCut.path === key) VideoCut.leave();
    activate('tool:three');
    await ThreeLab.cmd({ show: true });
    await open(key, { show: true });
    return key;
  }
  // the editor renders scene clips through the Lab: each one becomes a video of exactly its length (offline, at the
  // sequence's frame size), the rest of the edit renders as usual
  const needsBake = (e) => Boolean(e?.clips?.some((c) => c.kind === 'scene' || c.kind === 'seq') || (e?.tracks || []).some((k) => k.items.some((x) => x.kind === 'layer')));
  // Scenes joined by a transition only the Lab can draw (a morph through shared layers, a camera fly-through) are
  // baked together, transition included, so the editor's export shows exactly what the Lab shows; the others one
  // by one (the editor draws their transitions itself, Lab ones through their ffmpeg version).
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
  // the editor's export without ffmpeg (or "record"): its own recorder can only show a scene's picture, so the Lab
  // plays the sequence in real time into its recorder instead (scenes, transitions, footage and their sound)
  async function recordForEditor(key) {
    const e = await readEdit(key);
    if (!e) throw new Error('No such sequence');
    await loadNested(e);
    const r = await renderEdit(e, { realtime: true, name: `${key.slice(4)} (from the editor)` });
    return { output: r.path, done: Promise.resolve({ code: 0, output: r.path, seconds: 0 }) };
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
  function audioPlan(e0, dur) {
    const e = flat(e0);
    const parts = [];
    for (const k of (e.tracks || []).filter((x) => x.type === 'audio' && !x.mute)) for (const it of k.items) if (it.src && !it.off) parts.push({ src: it.src, at: it.start, a: it.in, len: (it.out - it.in) / (it.speed || 1), volume: it.volume ?? 1 });
    for (const x of D.timing(e)) { const c = x.clip; if (c.kind === 'video' && !c.mute && !c.off) parts.push({ src: c.src, at: x.start, a: c.in, len: x.end - x.start, volume: c.volume ?? 1, speed: c.speed || 1 }); }
    return parts.filter((p) => p.at < dur && p.len > 0.01);
  }
  async function ffmpegOf() { try { const t = await window.hub.video.tools({ ffmpeg: H.settings().ffmpegPath || undefined }); return t?.ffmpeg ? t : null; } catch { return null; } }
  async function outDir() {
    try { const d = await window.hub.capture.dir(); if (d?.dir) return `${d.dir}${d.dir.includes('\\') ? '\\' : '/'}made`; } catch { /* below */ }
    const home = await window.hub.fs.home();
    return `${home}/Hearth sequences`;
  }
  async function uniqueOut(dir, stem, ext) {
    let p = `${dir}/${stem}.${ext}`;
    for (let i = 2; i < 200 && await window.hub.fs.stat(p).catch(() => null); i += 1) p = `${dir}/${stem} (${i}).${ext}`;
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
  async function renderEdit(e, { format = null, name = null, quiet = false, library = true, onProgress = null, realtime = false, fps = null, crf = 18, sound = true } = {}) {
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
    const tools = realtime ? null : await ffmpegOf();
    const dir = await outDir();
    const stem = `${(name || re.seq?.name || S.key?.slice(4) || 'sequence').replace(/[\\/:*?"<>|]+/g, '_')} ${fmt.replace(':', 'x')}`;
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
      const N = Math.max(1, Math.round(dur * F));
      let output;
      try {
        await renderFrames(re, { w, h, n0: 0, n1: N, dir: tmp, onProgress: (p) => { onProgress?.(p * 0.85); say(`Rendering the sequence… frame ${Math.round(p * N)} / ${N}`); } });
        send({ type: 'seq-offline', on: false });
        output = await uniqueOut(dir, stem, 'mp4');
        const parts = sound ? audioPlan(re, N / F) : [];
        const args = ['-y', '-framerate', String(F), '-i', `${tmp}/frame_%05d.jpg`];
        parts.forEach((p) => args.push('-i', p.src));
        if (parts.length) {
          const chains = parts.map((p, i) => `[${i + 1}:a]atrim=start=${p.a.toFixed(4)}:duration=${(p.len * (p.speed || 1)).toFixed(4)},asetpts=PTS-STARTPTS${p.speed && p.speed !== 1 ? `,atempo=${clamp(p.speed, 0.5, 2)}` : ''},volume=${p.volume.toFixed(3)},adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}[a${i}]`);
          args.push('-filter_complex', `${chains.join(';')};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=longest[aout]`, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
        } else args.push('-map', '0:v');
        args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(Math.max(10, Math.min(30, Number(crf) || 18))), '-pix_fmt', 'yuv420p', '-r', String(F), '-t', (N / F).toFixed(4), '-movflags', '+faststart', 'OUTPUT');
        say('Rendering the sequence… muxing the sound');
        await runJob({ id: `seq${Date.now().toString(36)}`, input: `${tmp}/frame_00000.jpg`, output, args, duration: N / F, onProgress: (p) => onProgress?.(0.85 + p * 0.15) });
      } finally { window.hub.video.rmtemp?.(tmp).catch(() => {}); }
      if (library && typeof Review !== 'undefined') { try { await Review.noteRecording(output); } catch { /* the library is a bonus */ } }
      const secs = Math.round((performance.now() - S.render.t0) / 100) / 10;
      if (!quiet && !rq?.notifies) toast(`Rendered ${base(output)} (${N} frames, ${fmt}) in ${secs} s`, { timeout: 6000, action: { label: 'Open in Video Review', fn: () => openOutput(output) } });
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
    if (typeof Review !== 'undefined') { try { await Review.noteRecording(output); } catch { /* bonus */ } }
    toast(`Recorded ${base(output)} in real time (${msg.width}×${msg.height})`, { timeout: 6000, action: { label: 'Open in Video Review', fn: () => openOutput(output) } });
    return { path: output, realtime: true, w: msg.width, h: msg.height };
  }
  // the page's recording for a realtime render goes to the render, not the Lab's save dialog
  function takeRecording(msg) {
    if (!S.recWait) return false;
    if (msg.type === 'record-error') { S.recWait.reject(new Error(msg.message)); S.recWait = null; return true; }
    if (msg.type === 'recording') { S.recWait.resolve(msg); S.recWait = null; return true; }
    return msg.type === 'record-started';
  }
  async function openOutput(p) { activate('tool:ae'); await Review.ensureMounted(); return Review.open(p); }
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
  const LANES = [{ id: 'titles', h: 15 }, { id: 'overlays', h: 15 }, { id: 'main', h: 42 }, { id: 'sound', h: 15 }];
  function lanes() { let y = RULER + 2; return LANES.map((l) => { const o = { ...l, y }; y += l.h + 2; return o; }); }
  const laneAt = (y) => lanes().find((l) => y >= l.y - 1 && y < l.y + l.h + 1) || null;
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
    v.src = `file://${c.src}`;
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
    const Ls = lanes();
    const lane = (id) => Ls.find((l) => l.id === id);
    for (const l of Ls) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, l.y, w, l.h); }
    if (!e) return;
    // what each lane takes, faint, where it is still empty
    g.font = '9px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = dim;
    const busy = { titles: (e.tracks || []).some((k) => k.type === 'text' && k.items.length), overlays: (e.tracks || []).some((k) => k.type === 'video' && k.items.length), main: e.clips.length > 0, sound: (e.tracks || []).some((k) => k.type === 'audio' && k.items.length) };
    for (const l of Ls) if (!busy[l.id] && l.id !== 'main') g.fillText({ titles: 'Titles', overlays: 'Overlays', sound: 'Sound' }[l.id], 6, l.y + l.h / 2 + 0.5);
    const drawClip = (c, x0, x1, l, sel, label, color, img) => {
      const x = Math.max(-4, x0); const ww = Math.min(w + 4, x1) - x;
      if (ww < 1) return;
      g.save();
      g.beginPath(); if (g.roundRect) g.roundRect(x, l.y, ww, l.h, 3); else g.rect(x, l.y, ww, l.h); g.clip();
      g.fillStyle = color; g.fillRect(x, l.y, ww, l.h);
      if (img) { const ih = l.h; const iw = (img.naturalWidth / img.naturalHeight) * ih; for (let px = x0; px < x1 && px < w; px += iw) if (px + iw > 0) { g.globalAlpha = 0.85; g.drawImage(img, px, l.y, iw, ih); } g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, l.y + l.h - 13, ww, 13); }
      g.fillStyle = '#fff'; g.font = `${l.h > 20 ? 11 : 10}px system-ui, sans-serif`; g.textBaseline = 'bottom';
      g.fillText(label, x + 4, l.y + l.h - 2, Math.max(0, ww - 8));
      g.restore();
      if (sel) { g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(x + 1, l.y + 1, ww - 2, l.h - 2); }
    };
    const main = lane('main');
    for (const x of D.timing(e)) {
      const c = x.clip; const x0 = xOf(x.start); const x1 = xOf(x.end);
      if (c.kind === 'gap') { g.strokeStyle = dim; g.setLineDash([3, 3]); g.strokeRect(x0 + 0.5, main.y + 0.5, x1 - x0 - 1, main.h - 1); g.setLineDash([]); continue; }
      const color = c.kind === 'scene' ? `hsl(${hue(c.sketch)} 45% 30%)` : c.kind === 'video' ? 'hsl(205 40% 28%)' : c.kind === 'title' ? 'hsl(40 45% 26%)' : c.kind === 'seq' ? 'hsl(280 30% 26%)' : 'hsl(0 0% 22%)';
      const label = c.kind === 'scene' ? `${c.name}${c.look ? ` · ${c.look}` : ''}${c.vary ? ' ✦' : ''}${c.vibe ? ' ◐' : ''}` : c.kind === 'video' ? `🎞 ${base(c.src)}${c.mute ? '' : ' 🔊'}` : c.kind === 'title' ? `T ${c.text}` : c.kind === 'seq' ? `▤ ${c.name}` : c.kind;
      drawClip(c, x0, x1, main, S.sel.has(c.id), label, color, poster(c));
      // the transition into it: a bow tie over the overlap
      if (x.td > 0) { const a = xOf(x.start); const b = xOf(x.start + x.td); g.fillStyle = 'rgba(255,215,94,0.28)'; g.beginPath(); g.moveTo(a, main.y); g.lineTo(b, main.y + main.h); g.lineTo(b, main.y); g.lineTo(a, main.y + main.h); g.closePath(); g.fill(); }
    }
    for (const k of e.tracks || []) {
      const l = k.type === 'text' ? lane('titles') : k.type === 'audio' ? lane('sound') : lane('overlays');
      for (const it of k.items) {
        const x0 = xOf(it.start); const x1 = xOf(C.itemEnd(it));
        const color = it.kind === 'title' ? 'hsl(40 55% 34%)' : it.kind === 'audio' ? (it.song ? 'hsl(150 35% 24%)' : 'hsl(150 30% 20%)') : 'hsl(270 35% 30%)';
        const label = it.kind === 'title' ? it.text : it.kind === 'audio' ? `${it.song ? '♪ ' : ''}${base(it.src)}` : it.kind === 'layer' ? `◭ ${it.name}` : base(it.src);
        drawClip(it, x0, x1, l, S.sel.has(it.id), label, color, null);
      }
    }
    // the song's waveform on the sound lane (from the Lab's analysis: peaks per column, drawn only on redraws)
    drawWave(g, lane('sound'), v, w);
    // beats on the sound lane
    if (gr) { const l = lane('sound'); g.fillStyle = 'rgba(255,255,255,0.18)'; for (const t of D.gridTimes(gr, v.t1, { every: 'beat', offset: off })) { if (t < v.t0) continue; const x = xOf(t); if (x - xOf(t - D.beatLen(gr)) < 4) break; g.fillRect(Math.round(x), l.y + l.h - 4, 1, 4); } }
    if (S.drop != null) { g.fillStyle = gold; g.fillRect(Math.round(xOf(S.drop)) - 1, main.y - 2, 2, main.h + 4); }
    if (S.snapAt != null) { g.fillStyle = 'rgba(255,215,94,0.6)'; g.fillRect(Math.round(xOf(S.snapAt)), RULER, 1, hh - RULER); }
    refs.hint.hidden = Boolean(e.clips.length || (e.tracks || []).some((k) => k.items.length));
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
    const type = l.id === 'titles' ? 'text' : l.id === 'sound' ? 'audio' : 'video';
    for (const k of (S.edit.tracks || []).filter((kk) => kk.type === type)) for (const it of k.items) {
      const a = it.start; const b = C.itemEnd(it);
      if (t < a - 0.01 || t > b + 0.01) continue;
      return { zone: 'clip', where: 'item', clip: it, track: k, start: a, end: b, edge: near(b) ? 'out' : near(a) ? 'in' : null, t, x, lane: l };
    }
    return { zone: 'lane', lane: l, t, x };
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
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); const r = refs.cv.getBoundingClientRect(); zoomBy(ev.deltaY < 0 ? 1.25 : 0.8, tOf(ev.clientX - r.left)); return; }
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
    const groups = [...new Set(EditFX.TRANSITIONS.map((t) => t.group))].filter((gname) => gname !== 'Basic');
    return [...TRANS_TOP.map(it), { label: '✦ Lab moves', hint: '3D, only here', items: () => (TR()?.LAB || []).map((t) => ({ ...it(t.id), hint: t.desc })) }, { label: 'More transitions', items: () => groups.map((gname) => ({ label: gname, items: () => EditFX.TRANSITIONS.filter((t) => t.group === gname).map((t) => it(t.id)) })) },
      '-', ...[0.25, 0.5, 1].map((d) => ({ label: `${d} s`, checked: Math.abs((c?.trans?.dur || 0) - d) < 1e-3, action: () => setTransition(c?.trans?.type || D.DEFAULT_TRANS, id, d) }))];
  }
  function lengthItems(id) {
    const g = grid();
    return [...(g ? [1, 2, 4, 8].map((b) => ({ label: `${b} bar${b > 1 ? 's' : ''}`, action: () => setLength(id, b * D.barLen(g)) })) : []), ...[1, 2, 4, 8].map((s) => ({ label: `${s} s`, action: () => setLength(id, s) })),
      { label: 'Type a length…', action: async () => { const v = await Modal.prompt('Length (seconds, or "4 bars")', { value: '4' }); const s = secsOf(v); if (s > 0) setLength(id, s); } }];
  }
  function clipMenu(h, x, y) {
    const c = h.clip;
    const items = [];
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
    if (c.kind === 'video') items.push({ label: c.mute ? '🔊 Its sound on' : '🔇 Its sound off', action: () => commit(C.patchAny(S.edit, [c.id], (cc) => { cc.mute = !cc.mute; }), c.mute ? 'Sound on' : 'Muted') });
    if (h.where === 'clip' && h.i > 0) items.push({ label: 'Transition in', hint: c.trans ? EditFX.TRANS[c.trans.type]?.name : 'Cut', items: () => transItems(c.id) });
    items.push({ label: 'Length', hint: `${(h.end - h.start).toFixed(2)} s`, items: () => lengthItems(c.id) });
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
  // the ruler: a marker under the pointer has its own menu (rename, go to, split there, delete)
  function rulerMenu(h, x, y) {
    const mk = (S.edit?.markers || []).find((m) => Math.abs(xOf(m.t) - h.x) <= 6);
    const zoom = { label: 'Zoom', items: () => ZOOMS.map(([z, label, key]) => ({ label, key, action: () => zoomTo(z) })) };
    if (!mk) { showMenu(x, y, [{ label: '＋ Marker here', key: 'M', action: () => { seek(snapT(h.t)); marker(); } }, zoom, { label: 'Markers at the song\'s sections', disabled: !songItem(), action: () => sectionMarkers().catch((err) => toast(err.message, { type: 'error' })) }]); return; }
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
      { label: 'Delete this sequence…', danger: true, more: true, action: async () => { if (await Modal.confirm('Delete the sequence?', `"${S.key.slice(4)}" goes (the scenes and files stay).`, { ok: 'Delete', danger: true })) { VideoCut.deleteSequence(S.key); S.key = null; S.edit = null; await current(); redraw(); pushPlan(); } } },
    ]); });
  }
  async function rename(name) {
    const key = await uniqueKey(name);
    const e = C.copy(S.edit); e.seq = { ...e.seq, name }; // (its scene stays)
    await VC().storeEdit(key, e, 'Renamed');
    VideoCut.deleteSequence(S.key);
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
      { label: 'Transitions everywhere', items: () => [...TRANS_TOP.map((t) => ({ label: EditFX.TRANS[t]?.name || 'Cut', action: () => setTransition(t) })), { label: '✦ Lab moves', items: () => (TR()?.LAB || []).map((t) => ({ label: t.name, hint: t.desc, action: () => setTransition(t.id) })) }] },
      { label: '✂ Finish in the video editor', hint: 'the same sequence', action: () => toEditor() },
      { label: S.loop ? '⟲ Loop off' : '⟲ Loop', action: () => { S.loop = !S.loop; send({ type: 'seq-loop', on: S.loop }); } },
      { label: S.snap ? 'Snapping off' : 'Snapping on', hint: 'bars, beats, markers, edges', action: () => { S.snap = !S.snap; store.set('three.seq.snap', S.snap); } },
      { label: 'Zoom', key: '\\ + −', items: () => ZOOMS.map(([z, label, key]) => ({ label, key, action: () => zoomTo(z) })) },
      { label: 'Markers', more: true, items: () => [{ label: 'At the song\'s sections', action: () => sectionMarkers().catch((err) => toast(err.message, { type: 'error' })) }, { label: 'Clear the markers', danger: true, action: () => commit({ ...S.edit, markers: [] }, 'Markers cleared') }] },
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
    const st = { formats: new Set((last.formats || []).filter((f) => D.FORMATS[f])), fps: last.fps || S.edit?.seq?.fps || 30, quality: QUALITY[last.quality] ? last.quality : 'high', sound: last.sound !== false, open: last.open !== false };
    if (!st.formats.size) st.formats.add(cur);
    const dlg = el('dialog', { class: 'ui-modal sq-render-panel' });
    const chip = (on, text, title, click) => el('button', { type: 'button', class: `sq-chip${on ? ' on' : ''}`, text, title, on: { click } });
    const body = el('div', { class: 'sq-rp-body' });
    const go = el('button', { type: 'button', class: 'primary', text: '⇪ Render' });
    const len = programEnd(S.edit);
    function paint() {
      const n = st.formats.size;
      body.replaceChildren(
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Format' }), el('div', { class: 'sq-chips' }, Object.keys(D.FORMATS).map((f) => chip(st.formats.has(f), f, `${D.FORMATS[f].join('×')}${f === cur ? ' (the sequence\'s own)' : ''}`, () => { if (st.formats.has(f) && st.formats.size > 1) st.formats.delete(f); else st.formats.add(f); paint(); })))),
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Frame rate' }), el('div', { class: 'sq-chips' }, [24, 30, 60].map((f) => chip(st.fps === f, `${f} fps`, '', () => { st.fps = f; paint(); })))),
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Quality' }), el('div', { class: 'sq-chips' }, Object.entries(QUALITY).map(([k, q]) => chip(st.quality === k, q.label, q.hint, () => { st.quality = k; paint(); })))),
        el('label', { class: 'sq-rp-check' }, el('input', { type: 'checkbox', checked: st.sound, on: { change: (e) => { st.sound = e.target.checked; } } }), ' With the sound'),
        el('label', { class: 'sq-rp-check' }, el('input', { type: 'checkbox', checked: st.open, on: { change: (e) => { st.open = e.target.checked; } } }), ' Open in Video Review when it\'s done'),
        el('div', { class: 'sq-rp-sum', text: `${len > 0 ? `${len.toFixed(1)} s · ${Math.round(len * st.fps)} frames` : 'The sequence is empty'}${n > 1 ? ` · ${n} videos, one after the other` : ''}` }),
      );
      go.disabled = !(len > 0);
      go.textContent = n > 1 ? `⇪ Render ${n} formats` : `⇪ Render ${[...st.formats][0]}`;
    }
    const realtime = el('button', { type: 'button', class: 'ghost small', text: 'Record in real time instead', title: 'Without ffmpeg: the sequence plays once into a recording' });
    const more = window.Renders ? el('button', { type: 'button', class: 'ghost small', text: 'More formats…', title: 'GIF, WebM, ProRes master, audio only, YouTube 4K, Story, all socials (the render queue\'s presets)', on: { click: () => { dlg.close(); Renders.panel({ source: 'seq' }); } } }) : null; // (round 13)
    dlg.append(el('h3', { text: 'Render the sequence' }), body, el('div', { class: 'modal-actions' }, realtime, more, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => dlg.close() } }), go));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    paint();
    dlg.showModal();
    const start = async (opts) => {
      store.set('three.seq.renderOpts', { formats: [...st.formats], fps: st.fps, quality: st.quality, sound: st.sound, open: st.open });
      dlg.close();
      let lastOut = null;
      for (const f of st.formats) {
        try { lastOut = await render({ format: f, fps: st.fps, crf: QUALITY[st.quality].crf, sound: st.sound, ...opts }); } catch (err) { if (!window.Renders) toast(err.message, { type: 'error' }); break; } // (the render queue says why, with the fix)
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
    L.reloadPage();
    return true;
  }
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
        el('button', { class: 'ghost small', text: '🎞 Footage / file…', on: { click: async () => { close(); const ps = await window.hub.openDialog({ title: 'Add to the sequence', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video, picture, sound', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'wav', 'ogg', 'm4a', 'flac'] }] }); for (const p of ps || []) await add({ path: p }, { at: S.T < total() - 1e-3 ? S.T : null }).catch((err) => toast(err.message, { type: 'error' })); } } }),
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
  // drops: a tile, a board reference (its vibe), files from the computer, Video Review's library cards
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
      for (const f of [...(dt.files || [])]) { const p = window.hub.pathForFile(f); if (p) await add({ path: p, song: lane?.id === 'sound' }, { at }); }
    } catch (err) { toast(err.message, { type: 'error' }); }
  }

  // ---------- keys (the editor's: S, Delete, Shift+Delete, ←/→, J/K/L, Alt for slip…) ----------
  const KEYS = [
    ['Space', 'Play / pause the sequence'], ['J / K / L', 'Backward · stop · forward (again: faster)'], ['← / →', 'One frame (Shift: ten)'], ['Home / End', 'Start / end'],
    ['↑ / ↓', 'Previous / next edit point'], ['S', 'Split at the playhead'], ['Delete', 'Delete (keeps a gap)'], ['Shift+Delete', 'Ripple delete (closes the gap)'],
    ['D', 'Duplicate'], ['Q / W', 'The clip starts / ends at the playhead'], ['Alt+← / →', 'Slip the clip one frame'], ['Alt+drag', 'Slip (another part of the scene / footage)'],
    ['M', 'Marker'], [`${MOD}+C / ${MOD}+V`, 'Copy / paste clips (also into another sequence)'], [`${MOD}+Z / ${MOD}+Shift+Z`, 'Undo / redo'], [`${MOD}+wheel`, 'Zoom the sequence'], ['\\', 'Zoom to fit'], ['Esc', 'Deselect'],
    ['V', 'A new variation of the scene clip (like Shuffle)'], ['Shift+V', 'The clip back to its scene as saved'], ['G', 'Fill the gap under the playhead with a scene'], ['+ / −', 'Zoom in / out at the playhead'],
    ['Shift+drag an edge', 'Roll the cut (one clip longer, the next shorter)'], ['Shift+drag a clip', 'Slide it (its neighbours trim)'], [`${MOD}+drag`, 'Slip (like Alt+drag)'],
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
    if (mod) return;
    if (k === ' ') { play(); done(); return; }
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
    if (k === 'Delete' || k === 'Backspace') { del(e.shiftKey); done(); return; }
    if (low === 'd' && !e.shiftKey) { dup(); done(); return; }
    if (low === 'q') { trimToHead('in'); done(); return; }
    if (low === 'w') { trimToHead('out'); done(); return; }
    if (low === 'm') { marker(); done(); return; }
    if (k === '\\') { S.vr = null; redraw(); placeHead(); done(); return; }
    if (low === 'v') { vary(undefined, { reset: e.shiftKey }); done(); return; }
    if (low === 'g' && !e.shiftKey) { const x = C.at(S.edit, S.T); if (x?.clip.kind === 'gap') fillGap(x.clip.id).catch((err) => toast(err.message, { type: 'error' })); else flash('No gap under the playhead'); done(); return; }
    if (k === '+' || k === '=') { zoomBy(1.5); done(); return; }
    if (k === '-' || k === '_') { zoomBy(1 / 1.5); done(); return; }
    if (k === 'Escape' && S.sel.size) { S.sel.clear(); redraw(); done(); }
  }

  // ---------- mount (tools/three.js calls attach once the Lab's player exists) ----------
  function build(bar) {
    refs.tab = el('button', { class: 'ghost small sq-tab', text: '▤ Sequence', title: 'Build a video from your scenes, footage, titles and the song, right here (/sequence)', dataset: { feature: 'Sequence' }, on: { click: () => toggle().catch((err) => toast(err.message, { type: 'error' })) } });
    // ⇪ Render on the strip too: the scene (its own sequence: the scene on its timeline) without opening ▤ first
    refs.renderTab = el('button', { class: 'ghost small sq-render-tab', text: '⇪ Render', title: 'Render this scene as a video: format, frame rate, quality, sound (it renders the scene\'s own sequence)', dataset: { feature: 'Scene render' }, on: { click: async () => { try { await current(); if (!(programEnd(S.edit) > 0)) { await addCurrent?.({ at: 0 }); } await renderPanel(); } catch (err) { toast(err.message, { type: 'error' }); } } } });
    bar.querySelector('.mb-handle')?.append(refs.tab, refs.renderTab);
    refs.play = el('button', { class: 'ghost small sq-play', text: '▶', title: 'Play / pause the sequence (Space)', on: { click: () => play() } });
    refs.time = el('span', { class: 'sq-time', title: 'Timecode · frame (click to go to a time or frame)', on: { click: async () => { const v = await Modal.prompt('Go to (seconds, f120, 00:00:04:12, bar 9)', { value: tc(S.T) }); const t = v != null ? timeOf(v) : null; if (t != null) { play(false); seek(t); } } } });
    refs.name = el('button', { class: 'ghost small sq-name', title: 'Your Lab sequences · new · rename · format', on: { click: (e) => nameMenu(e.currentTarget) } });
    refs.add = el('button', { class: 'ghost small sq-add', text: '＋', title: 'Add a scene, a chat scene, a look, footage, a title or an overlay (or drag one onto the tracks)', dataset: { feature: 'Sequence add' }, on: { click: (e) => picker(e.currentTarget) } });
    refs.render = el('button', { class: 'primary small sq-render', text: '⇪ Render', title: 'Render the sequence: format, frame rate, quality, sound (right-click: quick menu)', dataset: { feature: 'Sequence render' }, on: { click: () => renderPanel().catch((err) => toast(err.message, { type: 'error' })), contextmenu: (e) => { e.preventDefault(); renderMenu(e.currentTarget); } } });
    refs.reload = el('button', { class: 'ghost small sq-reload', text: '↻', title: 'Reload the preview (when the sequence gets stuck): it comes back where it was', dataset: { feature: 'Sequence reload' }, on: { click: () => reloadPreview() } });
    refs.more = el('button', { class: 'ghost small sq-more', text: '⋯', title: 'Fit to bars, transitions, the video editor, loop, snapping, keys', on: { click: (e) => moreMenu(e.currentTarget) } });
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
    // the name chip follows the sequence (written only when it changes)
    listeners.change = [...(listeners.change || []), () => { const n = S.key ? `${S.key.slice(4)} · ${D.formatOf(S.edit)}` : 'Sequence'; if (refs.name.textContent !== `${n} ▾`) refs.name.textContent = `${n} ▾`; }];
  }
  function attach(L) {
    S.L = L;
    build(L.bar);
    L.pane.addEventListener('keydown', onKey, true);
    // the play button of the timeline's strip plays the sequence while it's on
    L.bar.querySelector('.mb-miniplay')?.addEventListener('click', (e) => { if (!S.view) return; e.stopImmediatePropagation(); play(); }, true);
    if (typeof VideoCut !== 'undefined') VideoCut.on('change', ({ path, from } = {}) => { if (S.storing || from === 'lab' || path !== S.key) return; readEdit(path).then((e) => { if (e) setEdit(e, { save: false }); }); });
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
      if (op === 'help') return { ok: true, value: 'ops: status | list | new {name, format} | open {name} | show | hide | add {scene | footage (path) | title (text) | overlay (layer / filter name) | song (path), at (s | "bar 9" | "f120"), bars | secs, look} | transition {clip, type, dur} (clip omitted: every cut) | length {clip, secs | bars} | trim {clip, edge: in|out, to} | split {at} | delete {clip, ripple} | move {clip, to (position 1..n)} | duplicate {clip} | slip {clip, frames} | look {clip, name} | fit (cuts on bars) | format {format} | seek {at} | frame {at, see} | play | pause | render {format: 9:16|16:9|1:1|4:5} | editor | back | undo | redo · arrange {template, scenes: [names], secs, lines} (the scenes on the song sections, cuts on bars; again: another one) | templates | versions {secs: [15, 6], render} | fill {clip (a gap)} | vary {clip, amount, reset} | vary_sections | swap_looks {clip} | retime {song} | nest {name} | unnest {clip} | copy {clips: [..]} | paste {at, into (sequence name)} | roll {clip, to} | slide {clip, by} | marker {at, label} | section_markers | zoom {to: fit | "4 bars" | secs} | render {format: all}. Each scene owns its sequence: ops act on the current scene one; of (or scene, except for add): another scene. clip = number (1 = first on the main track), "Titles.2", or a scene / title name.' };
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
        if (a.footage || a.path) await add({ path: a.footage || a.path }, { at, dur: L0, gap: at != null });
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
      if (op === 'render' && /^all$/i.test(String(a.format || ''))) { const out = []; for (const f of Object.keys(D.FORMATS)) out.push((await render({ format: f })).path); return { ok: true, value: { files: out, note: 'In Video Review (library)' } }; }
      if (op === 'render') { const r = await render({ format: a.format || null }); return { ok: true, value: { file: r.path, frames: r.frames, format: r.format, size: `${r.w}×${r.h}`, note: 'In Video Review (library)' } }; }
      if (op === 'editor') { await toEditor(); return { ok: true, value: { opened: 'Video Review editor, the same sequence', key: S.key } }; }
      if (op === 'back') { await fromEditor(); return { ok: true, value: status() }; }
      return { ok: false, error: `Unknown op "${op}" (op: "help")` };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // a scene clip's picture for the video editor (the Lab's automatic thumbnail; read from kv when the Lab isn't open)
  let kvThumbs = null;
  const editorPics = new Map();
  function posterImage(c, onload = null) {
    let url = c.poster || (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.thumbOf(c.sketch) : null);
    if (!url) {
      if (!kvThumbs) { kvThumbs = {}; window.hub.kvGet('three-thumbs', {}).then((t) => { kvThumbs = t || {}; onload?.(); }).catch(() => {}); }
      url = kvThumbs[c.sketch]?.url || null;
    }
    if (!url) return null;
    let im = editorPics.get(url);
    if (!im) { im = new Image(); im.onload = () => onload?.(); im.src = url; editorPics.set(url, im); if (editorPics.size > 60) editorPics.delete(editorPics.keys().next().value); }
    return im.complete && im.naturalWidth ? im : null;
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
    renderPanel, reloadPreview, attach, onMessage, takeRecording, keep, posterImage, owns: () => S.view, sketchChanged, previewItem,
    enter, leave, toggle, open, create, current, list, add, addCurrent, applyVibe, select, split, del, dup, slipBy, trimToHead, marker, setTransition, setLength, setLook, fit, setFormat,
    play, seek, step, shuttle, jump, settle, undo, redo, render, renderEdit, renderScene, toEditor, fromEditor, needsBake, bake, compile, status, handle, timeOf, secsOf, zoomBy,
    arrange, again, retime, versions, fillGap, vary, varySections, copyLook, pasteLook, swapLooks, nest, unnest, copySel, paste, zoomTo, sectionMarkers, decideArrangement, recordForEditor,
    outDir, keyForScene, switchTo, summaryFor, sceneCopied, songInfo, pickScenes, bakeRuns, get owner() { return S.owner; },
    on: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    get active() { return S.view; }, get key() { return S.key; }, get edit() { return S.edit ? C.copy(S.edit) : null; }, get time() { return S.T; }, get playing() { return S.playing; }, get fps() { return fps(); },
    get selection() { return selIds(); }, get rendering() { return Boolean(S.render); }, KEYS, _S: S, _draw: () => draw(), _hit: hit, _xOf: (t) => xOf(t), _lanes: () => lanes(),
  };
  return api;
})();
if (typeof module !== 'undefined') module.exports = ThreeSeq;
