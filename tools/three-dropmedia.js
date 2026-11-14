// Drop media on the timeline (round 140, dropmedia140). docs/upgrades/dropmedia140.md
// Files from the computer, moodboard tiles (the board drawer) and Lab references (🖼 References' cards) dropped on the
// Lab timeline become layers at that time. Nothing new on screen until something is dragged over the timeline:
//   · a picture: a picture layer (dragdrop's own, round 38) from the drop to the next cue or the end of its section,
//     with a fade in and out · a clip: a footage layer at the drop, as long as the clip, its own time following the
//     timeline · a song: the scene's song (when one is set, it asks "Use as the scene's song?" first)
//   · several files: one after another from the drop, each on a bar (Alt: on beats)
//   · one item snaps to the beat grid (Alt: exactly where it's dropped)
//   · while dragging: a thin ghost bar where each item will land, with its name (drawn on the timeline)
//   · the layers go into the "Dropped" group (outline136), coloured from the project's (else the scene's) palette; the
//     files become the scene's references the usual way (ThreeLab.addReference); each drop is ONE Ctrl/⌘+Z
//   · the bars drag like any layer's (start and length: the timeline's own trim / move); a clip follows its bar
// No AI. The timeline's part is in tools/three-media.js (the drop zone); the plan in tools/three-dropmedia-core.js.
// Lazy group "dropmedia" (after lab), loaded on the first drag over the timeline.
const LabDropMedia = (() => {
  const C = DropMediaCore;
  const REF = 'application/x-hearth-ref';
  const LABREF = 'application/x-hearth-labref';
  const GROUP = 'Dropped';
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks || {} : {});
  const P = () => hk().player || null;
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  const S = { ghosts: null, sig: '', hooked: new WeakSet(), stash: null, busy: false };
  const stats = { drops: 0, undos: 0, ghostDraws: 0, asked: 0 };
  const last = { ghosts: null, drop: null };

  // ---------- what's being dragged ----------
  // a drag from inside Hearth (a moodboard tile, a Lab reference): its data is readable at its start only
  document.addEventListener('dragstart', (e) => {
    const dt = e.dataTransfer; S.stash = null;
    if (!dt) return;
    try {
      const lab = dt.getData(LABREF); const ref = dt.getData(REF);
      if (lab) S.stash = { lab: JSON.parse(lab) };
      else if (ref) S.stash = { ref: JSON.parse(ref) };
    } catch { S.stash = null; }
  });
  document.addEventListener('dragend', () => { S.stash = null; if (S.ghosts) { S.ghosts = null; S.api?.redraw(); } });
  function boardItems(ref) {
    try {
      if (typeof Board === 'undefined') return [];
      const b = Board.current?.();
      const ids = ref.itemIds || [];
      const list = ids.length ? ids.map((id) => Board.item(id, b)).filter(Boolean) : (b?.items || []).filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
      return list.map((it) => {
        if (it.hidden) return null;
        const kind = it.type === 'video' ? (it.src ? 'video' : it.poster ? 'image' : null) : ['image', 'gif', 'web'].includes(it.type) ? 'image' : null;
        const src = it.type === 'video' ? it.src || it.poster : it.type === 'web' ? it.src && !/^https?:/i.test(it.src) ? it.src : it.thumb || it.tiny || it.src : it.src || it.thumb;
        return kind && src ? { name: it.title || C.stem(src), kind, src, duration: it.duration || 0 } : null;
      }).filter(Boolean);
    } catch { return []; }
  }
  // while dragging (names are only known for Hearth's own drags and synthetic ones; the computer's give their kinds)
  function sniff(dt, stash = S.stash) {
    if (stash?.lab) return [{ name: C.stem(stash.lab.name || stash.lab.key), kind: stash.lab.kind === 'video' ? 'video' : 'image' }];
    if (stash?.ref) return boardItems(stash.ref).map((x) => ({ name: C.stem(x.name), kind: x.kind, duration: x.duration }));
    const files = [...(dt?.files || [])];
    if (files.length) return files.map((f) => ({ name: C.stem(f.name), kind: C.kindOf(f.name, f.type) })).filter((x) => x.kind);
    return [...(dt?.items || [])].filter((i) => i.kind === 'file').map((i) => C.kindOf('', i.type)).filter(Boolean).map((k) => ({ name: C.WORD[k], kind: k }));
  }
  function music() {
    const p = P();
    const a = p?.analysis || {};
    return { bpm: p?.bpm || 120, bpb: p?.beatsPerBar || 4, downbeat: p?.downbeat ?? 0, duration: p?.duration || 0, cues: (p?.cues || []).map((c) => c.time), sections: (a.sections || []).map((x) => ({ start: x.start, end: x.end, label: x.label })) };
  }

  // ---------- the ghost bars ----------
  function hook(api) {
    S.api = api;
    if (S.hooked.has(api)) return;
    S.hooked.add(api);
    api.addHooks({
      frameKey: () => S.sig,
      drawOver: (g, { X, s0, sp, top }) => {
        if (!S.ghosts?.length) return;
        stats.ghostDraws += 1;
        g.save();
        g.font = '10px system-ui, sans-serif';
        g.textBaseline = 'top';
        S.ghosts.forEach((x, i) => {
          if (x.b < s0 || x.a > s0 + sp) return;
          const xa = X(x.a); const xb = Math.max(xa + 3, X(x.b)); const y = top + 2 + (i % 2) * 15;
          g.fillStyle = x.kind === 'video' ? '#48ddff55' : x.kind === 'audio' ? '#7cd99255' : '#ffd75e55';
          g.fillRect(xa, y, xb - xa, 3);
          g.fillStyle = x.kind === 'video' ? '#48ddff' : x.kind === 'audio' ? '#7cd992' : '#ffd75e';
          g.fillRect(xa, y - 1, 2, 5);
          const label = `${x.kind === 'video' ? '🎞' : x.kind === 'audio' ? '🎵' : '🖼'} ${x.name}`;
          const tw = g.measureText(label).width + 6;
          g.fillStyle = '#0d1013c8'; g.fillRect(xa + 3, y + 3, tw, 11);
          g.fillStyle = '#f4ece0'; g.fillText(label, xa + 6, y + 4);
        });
        g.restore();
      },
    });
  }
  function ghostsFor(items, t, alt) {
    const m = music();
    const media = items.filter((x) => x.kind !== 'audio');
    const plan = C.plan(media, { ...m, t, alt });
    const song = items.find((x) => x.kind === 'audio');
    return song && !media.length ? [{ name: song.name, kind: 'audio', a: 0, b: m.duration || t + 8 }] : plan;
  }
  function over(e, api) {
    hook(api);
    const t = api.timeAt(e.clientX);
    const items = sniff(e.dataTransfer);
    const g = items.length ? ghostsFor(items, t, e.altKey) : null;
    const sig = g ? JSON.stringify(g) : '';
    if (sig === S.sig) return;
    S.sig = sig; S.ghosts = g; last.ghosts = g;
    api.redraw();
  }
  function leave(api) { if (!S.ghosts) return; S.ghosts = null; S.sig = ''; (api || S.api)?.redraw(); }

  // ---------- the drop ----------
  const pathOf = (f) => { try { return window.hub.pathForFile(f) || ''; } catch { return ''; } };
  function drop(e, api) {
    hook(api);
    const dt = e.dataTransfer;
    const t = api.timeAt(e.clientX); const alt = e.altKey;
    let entries = [];
    let lab = null; let ref = null;
    try { lab = dt.getData(LABREF) ? JSON.parse(dt.getData(LABREF)) : null; } catch { lab = null; }
    try { ref = !lab && dt.getData(REF) ? JSON.parse(dt.getData(REF)) : null; } catch { ref = null; }
    if (lab) entries = [{ name: lab.name || lab.key, kind: lab.kind === 'video' ? 'video' : 'image', path: lab.path, refKey: lab.key }];
    else if (ref) entries = boardItems(ref).map((x) => ({ name: x.name, kind: x.kind, src: x.src, duration: x.duration }));
    else entries = [...(dt.files || [])].map((f) => ({ name: f.name, kind: C.kindOf(f.name, f.type), path: pathOf(f), blob: f })).filter((x) => x.kind);
    S.ghosts = null; S.sig = ''; S.stash = null; api.redraw();
    if (!entries.length) { toast('Pictures, clips and songs go on the timeline', { timeout: 2500 }); return null; }
    return place(entries, { t, alt }).catch(err);
  }

  // a dropped thing as a file on this computer (a picture pasted or dragged without a place is saved once)
  async function fileOf(x) {
    if (x.path) return x.path;
    if (x.src) {
      if (!/^(https?:|data:)/i.test(x.src)) return x.src;
      if (typeof BoardDrop === 'undefined') throw new Error(`${x.name}: open the board once, then drop it again`);
      return BoardDrop._.intoAttachments(x.src, `${C.stem(x.name)}${x.kind === 'video' ? '.mp4' : '.png'}`);
    }
    const buf = new Uint8Array(await x.blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const safe = String(x.name || 'dropped').replace(/[\\/:*?"<>|]/g, '_');
    return window.hub.saveAttachment(safe, btoa(bin));
  }
  const fileUrl = (p) => (typeof WinMac !== 'undefined' && WinMac.fileUrl ? WinMac.fileUrl(p) : `file://${String(p).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '/$1:')}`);
  // a clip's own length (a webm made by a recorder says "Infinity" until it's read to its end)
  function clipLength(path) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      let done = false;
      const end = (d) => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); v.load(); resolve(d > 0 && Number.isFinite(d) ? Math.round(d * 1000) / 1000 : 0); };
      const to = setTimeout(() => end(0), 8000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => { if (Number.isFinite(v.duration)) end(v.duration); else { v.ondurationchange = () => { if (Number.isFinite(v.duration)) end(v.duration); }; v.currentTime = 1e7; } };
      v.onerror = () => end(0);
      v.src = fileUrl(path);
    });
  }

  // the "Dropped" group: the one in the scene, else a new one (its colour tag from the palette)
  function palette() {
    const sid = hk().sketchId?.();
    try {
      const PL = window.LabProjLook;
      const p = PL && typeof Projects !== 'undefined' ? Projects.ofItem('scene', sid)?.[0] : null;
      const cols = p ? C.hexes(PL.paletteOf(p)?.colors) : [];
      if (cols.length) return cols;
    } catch { /* the scene's own */ }
    try { return C.hexes(ThreeLab.scenes?.get(sid)?.palette); } catch { return []; }
  }
  function groupSpot() {
    const h = hk();
    const ids = (h.layers?.() || []).map((x) => x.id);
    let at = -1; let g = null;
    ids.forEach((id, i) => { const L = h.layerById(id); if (L?.group?.name === GROUP) { at = i; g = L.group; } });
    return { index: at >= 0 ? at + 1 : null, group: g ? { ...g } : null };
  }

  async function song(x) {
    const p = P();
    if (p?.loaded && !p.isClock) {
      const now = String(p.info?.()?.file || '').split(/[\\/]/).pop() || 'the song';
      stats.asked += 1;
      const ok = await Modal.confirm('Use as the scene\'s song?', `"${x.name}" would replace "${now}" as this scene's song. Your layers, cues and keyframes stay where they are.`, { ok: 'Use it' });
      if (!ok) return { song: null, kept: now };
    }
    const path = await fileOf(x);
    const cmd = await ThreeLab.cmd({ show: false });
    const r = await cmd.loadSong(path);
    if (r?.ok === false) throw new Error(r.error || `${x.name} didn't load`);
    return { song: x.name };
  }

  // entries: [{ name, kind, path | src | blob, duration? }] · o: { t (seconds), alt }
  async function place(entries, { t = 0, alt = false } = {}) {
    if (S.busy) { toast('One drop at a time: a moment', { timeout: 1500 }); return null; }
    S.busy = true;
    try {
      const h = hk(); const sid = h.sketchId?.();
      if (!sid || !h.addLayers) throw new Error('Open a scene in the Lab first');
      const out = { song: null, layers: [], skipped: [] };
      const songs = entries.filter((x) => x.kind === 'audio');
      const media = entries.filter((x) => x.kind === 'image' || x.kind === 'video').slice(0, 24);
      if (songs.length) Object.assign(out, await song(songs[0]));
      if (!media.length) { last.drop = out; return out; }
      if (typeof DragDropCore === 'undefined') await window.Lazy?.load('dragdrop');
      const ready = [];
      for (const x of media) {
        try {
          const path = await fileOf(x);
          const duration = x.kind === 'video' ? (await clipLength(path)) || x.duration || 0 : 0;
          ready.push({ ...x, path, duration });
        } catch (e) { out.skipped.push(`${x.name}: ${e.message}`); }
      }
      const plan = C.plan(ready.map((x) => ({ name: C.stem(x.name), kind: x.kind, duration: x.duration })), { ...music(), t, alt });
      if (h.sketchId?.() !== sid) throw new Error('The scene changed while the files were read: drop them again');
      const cols = palette();
      const spot = groupSpot();
      const group = spot.group || { id: LayerGroups.gid(), name: GROUP, ...(cols[0] ? { color: C.tagFor(cols[0], LayerGroups.COLORS) } : {}) };
      const specs = [];
      for (let i = 0; i < plan.length; i += 1) {
        const x = ready[i]; const pl = plan[i];
        let key = x.refKey;
        if (!key || !(await refThere(key))) key = (await ThreeLab.addReference(x.path)).key;
        const v2 = ThreeLab.director?.layers?.().format === 'v2'; // (round 179, v2only179: a v2 scene gets v2 layers)
        const code = x.kind === 'video' ? C.footageCode(key, pl.a, { v2 }) : DragDropCore.pictureLayer(key, { v2 });
        specs.push({ name: `${x.kind === 'video' ? '🎞' : '🖼'} ${pl.name}`, code, props: { in: pl.a, out: pl.b, fadeIn: pl.fadeIn, fadeOut: pl.fadeOut, group: { ...group }, ...(cols.length ? { color: cols[i % cols.length] } : {}) } });
      }
      if (h.sketchId?.() !== sid) throw new Error('The scene changed while the files were read: drop them again');
      const ids = h.addLayers(specs, spot.index);
      out.layers = specs.map((s, i) => ({ id: ids[i], name: s.name, in: s.props.in, out: s.props.out }));
      const label = ids.length === 1 ? `Dropped ${specs[0].name}` : `Dropped ${ids.length} files`;
      window.LabDirect?.push?.(null, label, () => { if (hk().sketchId?.() !== sid) return false; stats.undos += 1; return hk().dropUndo(ids); });
      stats.drops += 1;
      const words = out.layers.length === 1 ? `${out.layers[0].name} · ${fmt(out.layers[0].in)} → ${fmt(out.layers[0].out)}` : `${out.layers.length} layers from ${fmt(out.layers[0].in)}${alt ? ' on beats' : ' on bars'}`;
      toast(`${words} · in "${GROUP}" · drag the bars to adjust, Ctrl/⌘+Z undoes${out.skipped.length ? ` · ${out.skipped.join(' · ')}` : ''}`, { timeout: 3500 });
      last.drop = out;
      return out;
    } finally { S.busy = false; }
  }
  const fmt = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
  async function refThere(key) { try { return (ThreeLab.refsOf?.(hk().sketchId?.()) || []).some((r) => r.key === key); } catch { return false; } }

  // a dropped clip's bar moved on the timeline: its own time starts with it ("Starts at")
  function moved(id, v) {
    if (v?.in == null) return;
    const L = hk().layerById?.(id);
    if (!L || !/A clip dropped on the timeline/.test(L.code || '')) return;
    try { const c = hk().ctlOf(id); if (c && Math.abs((c.controls().find((x) => x.key === 'from')?.value ?? -1) - v.in) > 1e-3) { c.setMany({ from: v.in }); c.save(); } } catch { /* its slider can be set by hand */ }
  }

  try {
    Keys.add(
      { area: 'Lab', keys: 'Drop pictures / clips / a song on the timeline', what: 'a layer at that time, in the "Dropped" group (several: one per bar · Alt: free, or on beats) · one Ctrl/⌘+Z' },
    );
  } catch { /* no keys sheet */ }

  return { over, leave, drop, place, moved, sniff, stats, last, get ghosts() { return S.ghosts ? S.ghosts.map((g) => ({ ...g })) : null; } };
})();
window.LabDropMedia = LabDropMedia;
