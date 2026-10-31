// (round 97, labproj97) A project's Lab work, whole, in a .hearthproject and in ⧉ Duplicate project. Round 75 carried
// a scene's code, layers, extras, references, notes, picture and timeline cues; the Lab has kept more of a scene's work
// elsewhere since, keyed by the scene or by its song, and none of it went along:
//   History            kv/three-hv-<scene>.json (labsync88), versions of each layer ("<scene>" / "<scene>:<layer>")
//   ⚡ trigger bars     the window's storage, three.triggersBySong[<song path>] (labsync88: synced in lab-presets)
//   a song's loop      three.loop:<song path>
//   a pin              three.sketchPins (scene ids)
//   its sequence pick  three.seq.byScene[<scene>] = "seq:<name>"
// Each scene in a bundle body now carries them as `lab` (this model; no DOM, no IPC: the window, the main process's
// worker and Node tests use it):
//   lab: { history?: { <scene>[:<layer>]: [{ at, code }] }, pinned?: true, seqpick?: "seq:…",
//          song?: { path, triggers?, loop? } }
// song.path is the scene's own song path (extras.media.path, the same text), so the export packs it once and the import
// rewrites both to the file it unpacked; the bars and loop are put back under that new path. The global Lab things
// (effect favourites, the stage set list, trigger presets, palettes) are this computer's, not a project's: not carried.
//   songKey(map, path)       the key a song's things are under here (the same text, else \ or / and any case: Windows)
//   sceneLab(o)              a scene's part from what the window read · remapLab(lab, old, new, seqMap) fresh ids
//   checkLab(lab, limits)    its shape before an import card · count(scenes) for the cards
//   histSegName / histJoin   History's own (scenesafe-core.js when loaded: the same results, dev/labproj97-test.js)
//   histFile(id, versions)   a scene's History file
//   ownSong(path, dataDir)   a song in Hearth's own folder (a kept copy, an imported one): copied with a duplicate
const LabProjCore = (() => {
  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const SS = () => (typeof SceneSafeCore !== 'undefined' ? SceneSafeCore : null);
  const HIST_MAX = 40;
  // a path as both systems compare it: \ and / alike, no case (Windows has none; a Mac rarely has two songs differing by case)
  const norm = (p) => String(p || '').replace(/^file:\/\/(localhost)?/i, '').replace(/\\/g, '/').replace(/\/+$/, '').normalize('NFC').toLowerCase();
  const same = (a, b) => Boolean(a) && Boolean(b) && norm(a) === norm(b);
  function songKey(map, p) {
    if (!p || !isObj(map)) return null;
    if (Object.prototype.hasOwnProperty.call(map, p)) return p;
    const n = norm(p);
    return Object.keys(map).find((k) => norm(k) === n) || null;
  }

  // ---------- History (scenesafe-core.js's, when it's loaded) ----------
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  const histSegName = (sid) => (SS()?.histSegName ? SS().histSegName(sid) : /^[a-z0-9_-]{1,60}$/.test(String(sid)) ? `three-hv-${sid}` : `three-hv-h${fnv(String(sid))}`);
  const histSceneOf = (key) => String(key).split(':')[0];
  function histSegOf(versions, sid) { const out = {}; for (const [k, list] of Object.entries(isObj(versions) ? versions : {})) if (histSceneOf(k) === sid && Array.isArray(list)) out[k] = list; return out; }
  function histJoin(a, b, max = HIST_MAX) {
    if (SS()?.histJoin) return SS().histJoin(a, b, max);
    const out = {};
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      const all = [...(Array.isArray(a?.[k]) ? a[k] : []), ...(Array.isArray(b?.[k]) ? b[k] : [])].filter((v) => v && typeof v.code === 'string');
      all.sort((x, y) => (y.at || 0) - (x.at || 0));
      const seen = new Set(); const list = [];
      for (const v of all) { if (seen.has(v.code)) continue; seen.add(v.code); list.push(v); if (list.length >= max) break; }
      if (list.length) out[k] = list;
    }
    return out;
  }
  const segVersions = (v) => (isObj(v) && isObj(v.versions) ? v.versions : {});
  const histFile = (sid, versions) => ({ v: 1, id: sid, versions: copy(versions) || {} });

  // ---------- a scene's part ----------
  // o: { id, song (its extras.media.path), versions (its History, already joined), pins (ids), bySong
  // (three.triggersBySong), loopOf(path) → the loop or null, seqpick (three.seq.byScene) } → lab or null
  function sceneLab({ id, song = null, versions = null, pins = [], bySong = {}, loopOf = () => null, seqpick = {} } = {}) {
    const lab = {};
    const hist = histSegOf(versions, id);
    if (Object.keys(hist).length) lab.history = copy(hist);
    if (Array.isArray(pins) && pins.includes(id)) lab.pinned = true;
    if (isObj(seqpick) && typeof seqpick[id] === 'string' && seqpick[id].startsWith('seq:')) lab.seqpick = seqpick[id];
    if (song && typeof song === 'string' && !/^scene:/.test(song)) {
      const k = songKey(bySong, song);
      const triggers = k ? bySong[k] : null;
      const loop = loopOf(song);
      if (isObj(triggers) || (isObj(loop) && loop.a != null)) lab.song = { path: song, ...(isObj(triggers) ? { triggers: copy(triggers) } : {}), ...(isObj(loop) && loop.a != null ? { loop: copy(loop) } : {}) };
    }
    return Object.keys(lab).length ? lab : null;
  }
  // fresh ids: History's keys follow the scene ("<old>" → "<new>", "<old>:<layer>" → "<new>:<layer>"; layer ids are the
  // scene's own and stay), the sequence pick follows its sequence (seqMap: old key → new key; one that didn't come: out)
  function remapLab(lab, oldId, newId, seqMap = null) {
    if (!isObj(lab)) return null;
    const out = copy(lab);
    if (isObj(out.history)) {
      const h = {};
      for (const [k, list] of Object.entries(out.history)) {
        if (histSceneOf(k) !== oldId) continue; // (another scene's versions never ride along)
        h[k === oldId ? newId : `${newId}${k.slice(String(oldId).length)}`] = list;
      }
      if (Object.keys(h).length) out.history = h; else delete out.history;
    }
    if (out.seqpick != null && seqMap) { const m = seqMap && (seqMap instanceof Map ? seqMap.get(out.seqpick) : seqMap[out.seqpick]); if (m) out.seqpick = m; else delete out.seqpick; }
    return out;
  }
  // its shape, before the import card (a bundle is never trusted): → [problems]
  function checkLab(lab, limits = {}) {
    const problems = [];
    if (lab == null) return problems;
    const code = limits.code || 8 * 1048576; const layers = limits.layers || 128;
    if (!isObj(lab)) return ['A scene\'s Lab part is broken.'];
    if (lab.history != null) {
      if (!isObj(lab.history) || Object.keys(lab.history).length > layers + 1) problems.push('A scene\'s History is broken or too big.');
      else for (const list of Object.values(lab.history)) if (!Array.isArray(list) || list.length > HIST_MAX || list.some((v) => !isObj(v) || typeof v.code !== 'string' || v.code.length > code)) { problems.push('A scene\'s History is broken or too big.'); break; }
    }
    if (lab.pinned != null && typeof lab.pinned !== 'boolean') problems.push('A scene\'s pin is broken.');
    if (lab.seqpick != null && (typeof lab.seqpick !== 'string' || !lab.seqpick.startsWith('seq:') || lab.seqpick.length > 200)) problems.push('A scene\'s sequence is broken.');
    if (lab.song != null && (!isObj(lab.song) || typeof (lab.song.path ?? '') !== 'string' || (lab.song.triggers != null && !isObj(lab.song.triggers)) || (lab.song.loop != null && !isObj(lab.song.loop)) || JSON.stringify(lab.song).length > 65536)) problems.push('A scene\'s song settings are broken.');
    return problems;
  }
  // for the cards: versions, songs with bars, pinned scenes
  function count(scenes) {
    let versions = 0; let bars = 0; let pinned = 0;
    for (const s of scenes || []) { const l = s?.lab; if (!isObj(l)) continue; for (const v of Object.values(isObj(l.history) ? l.history : {})) versions += Array.isArray(v) ? v.length : 0; if (l.song?.triggers) bars += 1; if (l.pinned) pinned += 1; }
    return { versions, bars, pinned };
  }

  // ---------- files ----------
  // (a reference's file another scene still uses is never trashed when it's removed: scenesafe-core.js refShared, in
  // the Lab's own group)
  // a song in Hearth's own folder (refs/: kept with a scene; assets/projects/: came in a project file): it is the
  // project's own copy, so a duplicate gets its own copy too. The owner's own music (anywhere else) stays shared.
  function ownSong(p, dataDir) {
    if (!p || !dataDir || /^scene:/.test(p)) return false;
    const n = norm(p); const d = norm(dataDir);
    return n.startsWith(`${d}/refs/`) || n.startsWith(`${d}/assets/projects/`);
  }

  return { HIST_MAX, norm, same, songKey, histSegName, histSegOf, histJoin, segVersions, histFile, sceneLab, remapLab, checkLab, count, ownSong, _fnv: fnv };
})();
if (typeof module !== 'undefined') module.exports = LabProjCore;
