// 🛟 Scene safety (round 43, scenesafe): the Lab's scenes (kv three-sketches) are never replaced by an empty or
// starter list because a read failed. Pure parts, no Electron, no DOM (dev/scenesafe-test.js); used by store.js and
// storework.js (main process / store thread), scenesafemain.js (the recovery scan) and tools/three-scenesafe.js.
//   prepareWrite / afterWrite  around a guarded store's save (the guard, the copies, a damaged file or .prev kept aside)
//   readStatus(fs, file)   a kv file read that says WHAT happened: 'ok' | 'missing' | 'unreadable'. "Couldn't read it"
//                          (Windows: EBUSY / EPERM / EACCES while an antivirus, OneDrive, iCloud for Windows or the
//                          search indexer holds the file; an online-only placeholder) is retried, and never means "empty".
//   guardScenes(…)         a save that would drop scenes nobody deleted keeps them (an explicit delete passes its ids)
//   copies: names / prune  rotating copies in data/kv/.history/<store>/ (newest 10, one per day for a week, the fullest)
//   collect(…)             the recovery scan's sources → one list of scenes that aren't in your list (or are newer)
//   mergeInto(…)           bringing scenes back: added next to yours, never replacing one
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SceneSafeCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  // errors that mean "the file is there but held / not ready" (Windows sharing violations, cloud placeholders, I/O)
  const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE', 'EIO', 'UNKNOWN', 'ETIMEDOUT', 'ECANCELED']);
  const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no wait here */ } };
  // read a text file, retrying a held one a few times (≈ 0.4 s in all); throws the last error
  function readRetry(fs, file, { tries = 5, wait = sleepSync } = {}) {
    for (let i = 0; ; i++) {
      try { return fs.readFileSync(file, 'utf8'); } catch (err) {
        if (i >= tries - 1 || !BUSY.has(err.code)) throw err;
        wait(30 * (i + 1));
      }
    }
  }
  // → { state: 'ok', value, from: 'file' | 'prev' } · { state: 'missing', prev? } · { state: 'unreadable', code, prev? }
  // (prev: the .prev.json copy's value when it reads, for callers that accept it)
  function readStatus(fs, file, o = {}) {
    const prevFile = file.replace(/\.json$/, '.prev.json');
    const prev = () => { try { return JSON.parse(readRetry(fs, prevFile, o)); } catch { return undefined; } };
    let text;
    try { text = readRetry(fs, file, o); } catch (err) {
      if (err.code === 'ENOENT') return { state: 'missing', prev: prev() };
      return { state: 'unreadable', code: err.code || 'ERR', prev: prev() };
    }
    try { return { state: 'ok', value: JSON.parse(text), from: 'file' }; } catch { /* cut short or garbled */ }
    const p = prev();
    if (p !== undefined) return { state: 'ok', value: p, from: 'prev', garbled: true };
    return { state: 'unreadable', code: 'EGARBLED' };
  }

  // ---------- the scenes guard ----------
  const isList = (v) => Array.isArray(v);
  const idsOf = (list) => (isList(list) ? list.filter((x) => x && typeof x.id === 'string').map((x) => x.id) : []);
  // disk: the scenes on disk now · sent: the ids the Lab sent (before sync's merge) · value: what would be written
  // removed: ids the Lab deleted on purpose (Delete…, a toast's Undo). Scenes on disk that the Lab didn't send and
  // didn't delete are kept; scenes a merge with the other computer would drop are kept when it's many at once (two or
  // more and a quarter of them: that is a list lost elsewhere, not a delete). → { value, restored: [ids], refused? }
  function guardScenes({ disk, sent = null, value, removed = [] }) {
    if (!isList(disk) || !disk.length) return { value, restored: [] };
    if (!isList(value)) return { value: disk, restored: [], refused: 'not a list of scenes' };
    const allow = new Set(removed || []);
    const have = new Set(idsOf(value));
    const sentIds = new Set(sent ? sent : idsOf(value));
    const lost = disk.filter((s) => s && typeof s.id === 'string' && !have.has(s.id) && !allow.has(s.id));
    const byCaller = lost.filter((s) => !sentIds.has(s.id));
    const byMerge = lost.filter((s) => sentIds.has(s.id));
    const mass = byMerge.length >= 2 && byMerge.length >= disk.length * 0.25;
    const back = [...byCaller, ...(mass ? byMerge : [])];
    if (!back.length) return { value, restored: [] };
    return { value: [...value, ...back], restored: back.map((s) => s.id) };
  }
  // the starter scene only (what a fresh Lab makes): a list like this next to copies holding more is suspicious
  const onlyStarter = (list) => isList(list) && list.length <= 1 && (!list.length || /^basic scene$/i.test(String(list[0]?.name || '')));

  // ---------- rotating copies: data/kv/.history/<store>/<stamp>-n<count>.json ----------
  const pad = (n) => String(n).padStart(2, '0');
  function copyName(at, count, tag = '') {
    const d = new Date(at);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-n${count}${tag ? `-${tag}` : ''}.json`;
  }
  const COPY = /^(\d{4})-(\d\d)-(\d\d)T(\d\d)-(\d\d)-(\d\d)-n(\d+)(?:-([\w]+))?\.json$/;
  function parseCopy(name) {
    const m = COPY.exec(name);
    if (!m) return null;
    const at = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    return { name, at, count: +m[7], tag: m[8] || '', day: `${m[1]}-${m[2]}-${m[3]}` };
  }
  // the copies to delete: kept are the newest `keep`, the newest of each of the last 7 days, and the fullest one
  function pruneCopies(names, { keep = 10, days = 7, now = Date.now() } = {}) {
    const list = names.map(parseCopy).filter(Boolean).sort((a, b) => b.at - a.at);
    const stay = new Set(list.slice(0, keep).map((c) => c.name));
    const seenDay = new Set();
    for (const c of list) { if (now - c.at > days * 864e5) continue; if (!seenDay.has(c.day)) { seenDay.add(c.day); stay.add(c.name); } }
    const fullest = list.reduce((b, c) => (!b || c.count > b.count ? c : b), null);
    if (fullest) stay.add(fullest.name);
    return list.filter((c) => !stay.has(c.name)).map((c) => c.name);
  }
  // a copy is due when the newest one is older than gap, or when this save drops scenes (always kept, right before)
  const copyDue = (newestAt, now, { gapMs = 10 * 60000, dropping = false } = {}) => dropping || !newestAt || now - newestAt >= gapMs;

  // ---------- a guarded save (store.js writeSync and storework.js write, before the .prev copy and the rename) ----------
  // Which stores: the Lab's scenes (guarded + copies) and its History (copies). env: { fs, path, cache: Map, now }
  const GUARDED = { 'three-sketches': { scenes: true, keep: 10 }, 'three-history': { scenes: false, keep: 6 } };
  const guardedName = (file) => { const m = /(?:^|\/)kv\/([\w-]+)\.json$/.exec(String(file).replace(/\\/g, '/')); return m && GUARDED[m[1]] ? m[1] : null; };
  const statOf = (fs, f) => { try { return fs.statSync(f); } catch { return null; } };
  // ids of a JSON file of scenes, cached by size + modified time (a save that follows our own write reads nothing)
  function idsCached(env, file, st) {
    const c = env.cache.get(file);
    if (c && st && c.size === st.size && c.mtimeMs === st.mtimeMs) return c;
    return null;
  }
  // o: { file, value, sent (ids), removed (ids) } → { value, restored, keepPrev, copied: [names] }; throws when the file
  // on disk can't be read (held by another program): the save waits for the next one instead of writing blind
  function prepareWrite(env, o) {
    const { fs, path } = env;
    const now = env.now ? env.now() : Date.now();
    const name = guardedName(o.file);
    const out = { value: o.value, restored: [], keepPrev: true, copied: [] };
    if (!name) return out;
    const conf = GUARDED[name];
    const dir = path.join(path.dirname(o.file), '.history', name);
    const st = statOf(fs, o.file);
    let text = null; let disk; let ids = null;
    if (st) {
      const c = conf.scenes ? idsCached(env, o.file, st) : null;
      if (c) ids = c.ids;
      else {
        try { text = readRetry(fs, o.file); } catch (err) { if (err.code !== 'ENOENT') { const e = new Error(`${name} is held by another program (${err.code})`); e.code = err.code; throw e; } }
        if (text != null) { try { disk = JSON.parse(text); ids = conf.scenes ? idsOf(disk) : null; } catch { disk = undefined; } }
      }
    }
    const copy = (body, count, tag) => {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const n = copyName(now, count, tag);
        fs.writeFileSync(path.join(dir, n), body);
        out.copied.push(n);
        env.cache.set(`dir:${dir}`, now);
      } catch { /* a copy is a bonus: the save goes on */ }
    };
    if (text != null && disk === undefined) { copy(text, 0, 'garbled'); out.keepPrev = false; } // a damaged file: aside, the good .prev stays
    if (conf.scenes && ids) {
      const valueIds = new Set(idsOf(o.value));
      const lost = ids.filter((id) => !valueIds.has(id));
      if (lost.length || !Array.isArray(o.value)) {
        if (disk === undefined && text == null) { try { text = readRetry(fs, o.file); disk = JSON.parse(text); } catch { disk = null; } }
        if (Array.isArray(disk)) {
          const g = guardScenes({ disk, sent: o.sent || null, value: o.value, removed: o.removed || [] });
          out.value = g.value; out.restored = g.restored;
        }
      }
    }
    // the copy: every 10 minutes, and always right before scenes leave the file
    const finalIds = conf.scenes && Array.isArray(out.value) ? new Set(idsOf(out.value)) : null;
    const dropping = Boolean(finalIds && ids && ids.some((id) => !finalIds.has(id)));
    let newest = env.cache.get(`dir:${dir}`);
    if (newest === undefined) { try { newest = Math.max(0, ...fs.readdirSync(dir).map((n) => parseCopy(n)?.at || 0)); } catch { newest = 0; } env.cache.set(`dir:${dir}`, newest); }
    if (st && out.keepPrev && copyDue(newest, now, { dropping })) {
      if (text == null) { try { text = readRetry(fs, o.file); } catch { text = null; } }
      if (text != null) copy(text, ids ? ids.length : 0, dropping ? 'before' : '');
    }
    // the .prev copy about to be replaced holds scenes the file doesn't: kept aside first (the file went missing, or a
    // starter list was saved over it, and the scenes now live only in .prev)
    if (conf.scenes) {
      const prevFile = o.file.replace(/\.json$/, '.prev.json');
      const pst = statOf(fs, prevFile);
      if (pst) {
        let pc = idsCached(env, prevFile, pst);
        let ptext = null;
        if (!pc) { try { ptext = readRetry(fs, prevFile); pc = { size: pst.size, mtimeMs: pst.mtimeMs, ids: idsOf(JSON.parse(ptext)) }; env.cache.set(prevFile, pc); } catch { pc = null; } }
        const have = new Set(ids || []);
        if (pc && pc.ids.some((id) => !have.has(id)) && env.cache.get(`kept:${prevFile}`) !== `${pst.size}:${pst.mtimeMs}`) {
          if (ptext == null) { try { ptext = readRetry(fs, prevFile); } catch { ptext = null; } }
          if (ptext != null) { copy(ptext, pc.ids.length, 'prev'); env.cache.set(`kept:${prevFile}`, `${pst.size}:${pst.mtimeMs}`); }
        }
      }
    }
    if (out.copied.length) { try { for (const n of pruneCopies(fs.readdirSync(dir), { keep: conf.keep, now })) fs.rmSync(path.join(dir, n), { force: true }); } catch { /* fine */ } }
    return out;
  }
  // after the write: what is on disk now (so the next save reads nothing)
  function afterWrite(env, file, value) {
    if (!guardedName(file) || !GUARDED[guardedName(file)].scenes) return;
    const st = statOf(env.fs, file);
    if (st) env.cache.set(file, { size: st.size, mtimeMs: st.mtimeMs, ids: idsOf(value) });
    const prevFile = file.replace(/\.json$/, '.prev.json');
    env.cache.delete(prevFile);
  }

  // ---------- the recovery scan ----------
  // a scene as the Lab keeps it, from any source (fields checked, nothing else touched)
  function cleanScene(s) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) return null;
    const layers = isList(s.layers) ? s.layers.filter((L) => L && typeof L.code === 'string') : null;
    const code = typeof s.code === 'string' ? s.code : layers?.[0]?.code;
    if (typeof code !== 'string') return null;
    return { ...s, code, ...(layers && layers.length ? { layers } : {}), name: String(s.name || '').trim() || null, updatedAt: Number(s.updatedAt) || 0 };
  }
  // three-history.json { versions: { sceneId | sceneId:layerId: [{ at, code }] }, trash: [scene + deletedAt] }
  function fromHistory(hist) {
    const out = { trash: [], versions: [] };
    if (!hist || typeof hist !== 'object') return out;
    for (const t of isList(hist.trash) ? hist.trash : []) { const s = cleanScene({ ...t, updatedAt: t?.updatedAt || t?.deletedAt }); if (s) out.trash.push({ ...s, deletedAt: Number(t.deletedAt) || 0 }); }
    const by = new Map();
    for (const [key, list] of Object.entries(hist.versions || {})) {
      if (!isList(list) || !list.length || typeof list[0]?.code !== 'string') continue;
      const [sid, lid] = key.split(':');
      if (!sid) continue;
      const e = by.get(sid) || { id: sid, main: null, layers: [], at: 0 };
      const newest = list.reduce((b, v) => ((v?.at || 0) > (b?.at || 0) ? v : b), list[0]);
      e.at = Math.max(e.at, Number(newest.at) || 0);
      if (lid) e.layers.push({ id: lid, name: lid === 'main' ? 'Layer 1' : `Layer ${e.layers.length + 1}`, code: newest.code });
      else e.main = newest.code;
      by.set(sid, e);
    }
    for (const e of by.values()) {
      const layers = e.layers.length ? (e.main != null && !e.layers.some((L) => L.id === 'main') ? [{ id: 'main', name: 'Layer 1', code: e.main }, ...e.layers] : e.layers) : null;
      const s = cleanScene({ id: e.id, name: null, code: e.main ?? layers?.[0]?.code, ...(layers && layers.length > 1 ? { layers } : {}), updatedAt: e.at });
      if (s) out.versions.push(s);
    }
    return out;
  }
  // a time machine document (kv three-tm-<id>): its newest version's state (tools/three-history-core.js decodes it)
  function fromTm(id, doc, TM) {
    try {
      if (!doc?.versions?.length || !TM) return null;
      const v = TM.latest(doc);
      const st = v ? TM.stateOf(doc, v) : null;
      if (!st?.layers?.length) return null;
      return cleanScene({ id, name: null, layers: st.layers, code: st.layers[0].code, updatedAt: v.at, ...(st.palette ? { palette: st.palette } : {}) });
    } catch { return null; }
  }
  // how much a source is trusted for a scene's content: whole scenes first, then the time machine, then layer versions
  const RANK = { scenes: 0, trash: 0, tm: 1, versions: 2 };
  const same = (a, b) => JSON.stringify({ c: a.code, l: a.layers || null }) === JSON.stringify({ c: b.code, l: b.layers || null });
  // current: the scenes in your list now · sources: [{ label, at, kind: 'scenes' | 'trash' | 'tm' | 'versions', list }]
  // thumbs: { id: { url } } → [{ id, name, updatedAt, layers, from, fromAll, state: 'missing' | 'newer', thumb, scene }]
  function collect(current, sources, thumbs = {}) {
    const mine = new Map((isList(current) ? current : []).filter((s) => s?.id).map((s) => [s.id, s]));
    const best = new Map(); // id → { scene, rank, label, labels: Set, name }
    for (const src of sources || []) {
      const rank = RANK[src.kind] ?? 0;
      for (const raw of src.list || []) {
        const s = cleanScene(raw);
        if (!s) continue;
        const b = best.get(s.id);
        if (!b) { best.set(s.id, { scene: s, rank, label: src.label, labels: new Set([src.label]), name: s.name, deleted: src.kind === 'trash' }); continue; }
        b.labels.add(src.label);
        b.name ||= s.name; if (src.kind === 'trash') b.deleted = true;
        if (rank < b.rank || (rank === b.rank && s.updatedAt > b.scene.updatedAt)) { b.scene = s; b.rank = rank; b.label = src.label; }
      }
    }
    const out = [];
    for (const [id, b] of best) {
      const have = mine.get(id);
      let state = 'missing';
      if (have) {
        if (same(have, b.scene) || (b.scene.updatedAt || 0) <= (Number(have.updatedAt) || 0)) continue;
        state = 'newer';
      }
      const name = b.name || b.scene.name || `Recovered scene (${new Date(b.scene.updatedAt || Date.now()).toLocaleDateString()})`;
      out.push({ id, name, updatedAt: b.scene.updatedAt || 0, layers: b.scene.layers?.length || 1, from: b.label, fromAll: [...b.labels], state, deleted: Boolean(b.deleted), thumb: thumbs?.[id]?.url || null, scene: { ...b.scene, name } });
    }
    return out.sort((a, b) => (a.state === b.state ? 0 : a.state === 'missing' ? -1 : 1) || b.updatedAt - a.updatedAt);
  }

  // ---------- bringing them back ----------
  // picks: scenes from collect(); one whose id is in the list already comes in as a copy "(recovered)" with its own id
  // → { list (a new array: yours first, then the ones brought back), added: [ids] }
  function mergeInto(current, picks, { now = Date.now(), rand = () => Math.floor(Math.random() * 1296).toString(36) } = {}) {
    const list = isList(current) ? [...current] : [];
    const ids = new Set(list.map((s) => s?.id));
    const added = [];
    for (const p of picks || []) {
      const s = cleanScene(p?.scene || p);
      if (!s) continue;
      let scene = { ...s, name: s.name || 'Recovered scene' };
      if (ids.has(scene.id)) {
        const twin = list.find((x) => x.id === scene.id);
        if (twin && same(twin, scene)) continue;
        scene = { ...scene, id: `s${now.toString(36)}${rand()}${added.length}`, name: `${scene.name} (recovered)` };
      }
      scene.updatedAt = scene.updatedAt || now;
      ids.add(scene.id); list.push(scene); added.push(scene.id);
    }
    return { list, added };
  }

  return { BUSY, readRetry, readStatus, idsOf, guardScenes, onlyStarter, copyName, parseCopy, pruneCopies, copyDue, GUARDED, guardedName, prepareWrite, afterWrite, cleanScene, fromHistory, fromTm, collect, mergeInto };
}));
