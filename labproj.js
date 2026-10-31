// (round 97, labproj97) A project's Lab work, whole, through Export / Import / ⧉ Duplicate project (projbundle.js calls
// these at marked places; the model is labproj-core.js). Loaded with the projbundle group.
//   addTo(scenes)          gather: each scene's History (its own file kv/three-hv-<scene>.json, what the old whole file
//                          still holds for it, what the Lab has in memory not written yet), its song's ⚡ trigger bars
//                          and loop, its pin, its sequence pick → scene.lab. A History file that can't be read stops the
//                          export / copy (never "no History"); nothing is written here
//   start(b, { mode, skipped })   apply, before the scenes are added: Duplicate gives a scene whose song is Hearth's own
//                          copy (kept with the scene, or come in a project file) its own copy of the song, so the copy's
//                          bars, loop and beat grid are its own (the owner's own music elsewhere stays shared, as his
//                          files do); a song that can't be copied is named. → ctx
//   history(s, ctx)        before a scene is added: its History written to its own file (new id: never over one)
//   place(s, ctx)          after: its pin, its song's bars and loop (under this computer's path for the song, never
//                          over bars already set for that song here), its sequence pick
//   finish(ctx) / undo(ctx)  the presets' store told once (they sync) / what was put back taken out (a failed apply)
const LabProj = (() => {
  const LP = LabProjCore;
  const hub = () => window.hub;
  const st = () => window.store;
  const LOOP = 'three.loop:';
  async function read(name) {
    const r = await hub().kvGet(name, null, { status: true });
    if (r?.state === 'unreadable') throw new Error(`Hearth couldn't read the Lab's History (${name}) just now (nothing was written): try again in a moment`);
    return r?.state === 'ok' ? r.value : null;
  }
  const labOn = () => Boolean(window.Lazy?.loaded('lab') && typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.versionsOf);
  // a song's loop under its path here (the same text, else the same file written another way)
  function loopOf(p) {
    const v = st().get(`${LOOP}${p}`, null);
    if (v && v.a != null) return v;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`hub.${LOOP}`) && LP.same(k.slice(4 + LOOP.length), p)) { const x = st().get(k.slice(4), null); if (x && x.a != null) return x; }
      }
    } catch { /* storage is a convenience */ }
    return null;
  }
  // (the old whole file, kv/three-history.json, is read only when the Lab hasn't read it: once it has, the versions still
  // waiting there to move are in its memory, and the file — its trash of deleted scenes — isn't copied into this window)
  async function historyOf(id, ctx) {
    let v = LP.segVersions(await read(LP.histSegName(id)));
    const inLab = labOn() && (ThreeLab.scenes.okStores?.() || []).includes('three-history');
    if (!inLab) { if (ctx.legacy === undefined) ctx.legacy = LP.segVersions(await read('three-history')); v = LP.histJoin(v, LP.histSegOf(ctx.legacy, id)); }
    if (labOn()) { try { v = LP.histJoin(v, await ThreeLab.scenes.versionsOf(id)); } catch { /* its file, read above */ } }
    return LP.histSegOf(v, id);
  }
  async function addTo(scenes) {
    const ctx = {};
    const pins = st().get('three.sketchPins', []); const bySong = st().get('three.triggersBySong', {}); const seqpick = st().get('three.seq.byScene', {});
    for (const s of scenes || []) {
      const lab = LP.sceneLab({ id: s.id, song: s.extras?.media?.path || null, versions: await historyOf(s.id, ctx), pins: Array.isArray(pins) ? pins : [], bySong, loopOf, seqpick });
      if (lab) s.lab = lab; else delete s.lab;
    }
    return scenes;
  }

  // ---------- apply ----------
  const exists = async (p) => Boolean(p) && Boolean(await hub().fs.stat(p).catch(() => null));
  async function start(b, { mode = 'import', skipped = [] } = {}) {
    const ctx = { mode, skipped, pins: [], bars: [], loops: [], seqpick: [], hist: [], touched: false };
    if (mode !== 'duplicate') return ctx;
    let dataDir = '';
    try { dataDir = (await hub().reach.info())?.dataDir || ''; } catch { /* no song copied: shared, said below */ }
    const copies = new Map(); // a song several scenes play: one copy for the duplicate
    for (const s of b.scenes || []) {
      const song = s.extras?.media?.path;
      if (!song || !LP.ownSong(song, dataDir)) continue;
      if (!copies.has(song)) {
        let np = null;
        if (!(await exists(song))) skipped.push(`The song of “${s.sketch?.name || 'a scene'}” isn't on this computer (${String(song).split(/[\\/]/).pop()}): the copy points at it as the original does`);
        else { try { np = await hub().importRef(song); } catch (err) { skipped.push(`The song of “${s.sketch?.name || 'a scene'}” couldn't be copied (${err?.message || 'error'}): the copy plays the original's file`); } }
        copies.set(song, np);
      }
      const np = copies.get(song);
      if (!np) continue;
      s.extras.media.path = np;
      if (s.lab?.song) s.lab.song.path = np;
      if (s.maps && s.maps[song]) { s.maps[np] = s.maps[song]; delete s.maps[song]; }
    }
    return ctx;
  }
  async function history(s, ctx) {
    const h = s.lab?.history;
    if (!h || !Object.keys(h).length) return;
    const name = LP.histSegName(s.id);
    const was = await hub().kvGet(name, null, { status: true }).catch(() => ({ state: 'unreadable' }));
    if (was?.state !== 'missing') { ctx.skipped.push(`The History of “${s.sketch?.name || 'a scene'}” (its file was there already: left as it was)`); return; }
    const r = await hub().kvSet(name, LP.histFile(s.id, h)).catch((err) => ({ error: err?.message || 'error' }));
    if (r?.error) ctx.skipped.push(`The History of “${s.sketch?.name || 'a scene'}” (it couldn't be saved: ${r.error})`);
    else ctx.hist.push(name);
  }
  function place(s, ctx) {
    const l = s.lab;
    if (!l) return;
    if (l.pinned) { const p = st().get('three.sketchPins', []); if (Array.isArray(p) && !p.includes(s.id)) { st().set('three.sketchPins', [...p, s.id]); ctx.pins.push(s.id); ctx.touched = true; } }
    if (l.seqpick) { const m = st().get('three.seq.byScene', {}) || {}; if (!m[s.id]) { st().set('three.seq.byScene', { ...m, [s.id]: l.seqpick }); ctx.seqpick.push(s.id); ctx.touched = true; } }
    const song = s.extras?.media?.path || l.song?.path;
    if (l.song && song) {
      if (l.song.triggers) { const m = st().get('three.triggersBySong', {}) || {}; if (!LP.songKey(m, song)) { st().set('three.triggersBySong', { ...m, [song]: l.song.triggers }); ctx.bars.push(song); ctx.touched = true; } }
      if (l.song.loop && !loopOf(song)) { st().set(`${LOOP}${song}`, l.song.loop); ctx.loops.push(song); ctx.touched = true; }
    } else if (l.song && !song && (l.song.triggers || l.song.loop)) ctx.skipped.push(`The ⚡ trigger bars of “${s.sketch?.name || 'a scene'}” (its song wasn't in the file)`);
  }
  function finish(ctx) { if (ctx?.touched) { try { window.LabPresets?.changed(); } catch { /* synced at its next change */ } } }
  async function undo(ctx) {
    if (!ctx) return;
    try {
      if (ctx.pins.length) st().set('three.sketchPins', (st().get('three.sketchPins', []) || []).filter((x) => !ctx.pins.includes(x)));
      if (ctx.seqpick.length) { const m = { ...(st().get('three.seq.byScene', {}) || {}) }; for (const id of ctx.seqpick) delete m[id]; st().set('three.seq.byScene', m); }
      if (ctx.bars.length) { const m = { ...(st().get('three.triggersBySong', {}) || {}) }; for (const p of ctx.bars) delete m[p]; st().set('three.triggersBySong', m); }
      for (const p of ctx.loops) st().set(`${LOOP}${p}`, null);
      finish(ctx);
    } catch { /* storage is a convenience */ }
    // (a History file written for a scene that was taken back stays: a small file nobody points at, as labsync88's do)
  }
  return { addTo, start, history, place, finish, undo, loopOf };
})();
window.LabProj = LabProj;
