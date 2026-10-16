// 🧹 Disk calm (round 53, diskcalm), the pure parts. UMD: main (diskcalmmain.js measures, frees and tidies), the window
// (diskcalm.js: the line in Settings › This computer & sync, its fold, /disk) and Node tests (dev/diskcalm-test.js).
//   PARTS            what Hearth keeps on the disk, in plain words: rebuildable ones (free: true) say what comes back
//                    by itself; the owner's work, backups and safety copies are never offered
//   classify(rel)    a path inside the data folder → the part it belongs to (the owner's work unless proven otherwise)
//   summary(parts)   "2.4 GB: backups 1.2 GB · game cache 600 MB · bakes 400 MB · other 200 MB"
//   capPlan(...)     what goes when a cache is over its cap: the oldest first, never one used in the last hour
//   orphan rules     Play builds / bakes of scenes that are gone, render frames left by a render that ended, temp
//                    folders Hearth made and a killed task left, optimized copies no index points at. Each rule
//                    decides nothing when what it compares against couldn't be read (null = unknown, not "none")
//   hintFor(...)     one calm note only past a threshold or when the disk is nearly full
const DiskCalmCore = (() => {
  const KB = 1024; const MB = KB * 1024; const GB = MB * 1024;
  const HOUR = 3600e3; const DAY = 24 * HOUR;

  // ---------- the parts ----------
  // group: the word in the one-line summary · free: a "Free up" button (moves it to the Trash, or empties Chromium's
  // own cache for the live ones) · back: what comes back by itself · keep: why it's never offered
  const PARTS = [
    { id: 'backups', group: 'backups', label: 'Backups', what: 'Your automatic backups, outside the data folder', keep: 'Your safety net: old ones go by themselves (Backups… to see them)', free: false },
    { id: 'play', group: 'game cache', label: '▶ Play builds', what: 'Your Lab scenes made ready to play', back: 'Rebuilt next time you press ▶ Play', free: true },
    { id: 'optimized', group: 'game cache', label: 'Optimized 3D models', what: 'Models Optimize for play compressed', back: 'Made again next time you choose Optimize for play', free: true },
    { id: 'gameshaders', group: 'game cache', label: 'Game shader cache', what: 'What ▶ Play compiled before, so games start faster', back: 'Comes back by itself next time you play (that first start is a little slower)', free: true, live: true },
    { id: 'bakes', group: 'bakes', label: 'Present bakes', what: 'Shows baked to a video for a perfect Present', back: 'Baked again next time you Present that scene', free: true },
    { id: 'appcache', group: 'caches', label: 'Web caches', what: 'Hearth\'s own browser caches (pages, code, graphics)', back: 'They fill again by themselves as you use Hearth', free: true, live: true },
    { id: 'thumbs', group: 'caches', label: 'Asset pictures', what: 'Small pictures of your assets and downloads', back: 'Made again when you look at your assets', free: true },
    { id: 'logs', group: 'other', label: 'Logs', what: 'What the AI programs printed, and problem reports', back: 'New ones start by themselves', free: true },
    { id: 'leftovers', group: 'other', label: 'Leftovers', what: 'Pieces left by renders, copies and saves that were cut off', back: 'Nothing needs them', free: true },
    { id: 'safety', group: 'safety copies', label: 'Safety copies', what: 'Automatic copies of your things, recently deleted chats, what sync set aside', keep: 'They keep you safe and go by themselves after a while', free: false },
    { id: 'profile', group: 'other', label: 'Sign-ins and window settings', what: 'Websites and app windows you signed in to, Hearth\'s own page data', keep: 'Your sign-ins live here', free: false },
    { id: 'other', group: 'other', label: 'Hearth\'s own records', what: 'Sync\'s records, this computer\'s settings, AI run files', keep: 'Hearth needs these to run', free: false },
    { id: 'work', group: 'your work', label: 'Your work', what: 'Your chats, scenes, memory, settings, captures, renders and files', keep: 'Hearth never frees your work', free: false },
  ];
  const BY = Object.fromEntries(PARTS.map((p) => [p.id, p]));
  const FREEABLE = PARTS.filter((p) => p.free).map((p) => p.id);

  // ---------- where a file in the data folder belongs ----------
  // rel: relative to the data folder, '/' or '\' (Windows). Anything not proven to be a cache, a log, a leftover or a
  // safety copy is the owner's work: the fold says so and nothing there is ever offered.
  const CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache'];
  const TITLES = /^\.hearth-titles-[a-z0-9]+$/i; // a Lab render's temporary title frames (tools/three-export.js, aemain.js)
  const SAFETY_NAME = /^(kv\/)?[^/]+(\.prev\.json|-torn-[a-z0-9]+(\.json)?)$/i; // a store's .prev copy, a cut-off store crashsafe kept aside
  function classify(rel, { bakesRel = 'captures/Present bakes' } = {}) {
    const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const top = r.split('/')[0];
    const b = String(bakesRel || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (b && (r === b || r.startsWith(`${b}/`))) return 'bakes';
    if (r.split('/').some((s) => TITLES.test(s))) return 'leftovers';
    if (/(^|\/)\.hearth-(tmp|part)-/.test(r)) return 'leftovers';
    if (/\.(tmp|hubtmp|partial)$/i.test(r) && top !== 'workspace') return 'leftovers'; // a save cut off (crashsafe's sweep decides what goes)
    if (top === 'game') return 'play';
    if (top === 'game-cache') return 'optimized';
    if (top === '.cache') return 'thumbs';
    if (/^engine(\.prev)?\.log$/.test(r)) return 'logs';
    if (['.history', '.held', 'trash', '.undo-hold', 'safetynet', '.backup', 'test-trash'].includes(top) || /^kv\/\.history\//.test(r) || /^sync\/trash\//.test(r)) return 'safety';
    if (SAFETY_NAME.test(r)) return 'safety';
    if (['sync', 'mcp-runs'].includes(top) || /^(window|game-bridge|engine-installs|claude-flags|shell-path|gpu52|tool-wake|hearth-origin|connectors|chrome-prefs|mcp-forgeheart)\.json$/.test(r)
      || /^(hearth-icon\.(png|ico)|now-playing[\w-]*\.(ps1|jpg))$/.test(r) || r === '.datasafe-faults.json') return 'other';
    return 'work';
  }
  // a path inside Electron's own profile folder (userData) → gameshaders / appcache / profile
  function classifyProfile(rel) {
    const segs = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/');
    if (segs[0] === 'Partitions' && segs.length > 2) {
      const cache = CACHE_DIRS.includes(segs[2]);
      if (!cache) return 'profile';
      return segs[1].toLowerCase() === 'hearth-game' ? 'gameshaders' : 'appcache';
    }
    return CACHE_DIRS.includes(segs[0]) ? 'appcache' : 'profile';
  }
  // Hearth's own temp folders in the computer's temp folder (made with mkdtemp: a killed task leaves them behind)
  const TEMP_PREFIX = /^(hearth-(backup|datasafe|scenesafe|ghpages|fix|firstrun|post|report|remote|term)-|hearth-frames$|hub-(zip|restore)-|agent-hub-import-)/;
  const isHearthTemp = (name) => TEMP_PREFIX.test(String(name || ''));

  // ---------- words ----------
  function fmt(b) {
    const n = Math.max(0, Number(b) || 0);
    if (n >= 1000 * MB) return `${(n / GB).toFixed(n >= 100 * GB ? 0 : 1)} GB`; // (never "1001 MB")
    if (n >= MB) return `${Math.round(n / MB)} MB`;
    if (n >= KB) return `${Math.round(n / KB)} KB`;
    return n ? `${n} bytes` : '0 KB';
  }
  // parts: { id: bytes } → groups by size (the word, bytes, the part ids)
  function groups(parts) {
    const g = new Map();
    for (const p of PARTS) {
      const n = Number(parts?.[p.id]) || 0;
      if (!n) continue;
      const x = g.get(p.group) || { group: p.group, bytes: 0, ids: [] };
      x.bytes += n; x.ids.push(p.id); g.set(p.group, x);
    }
    return [...g.values()].sort((a, b) => b.bytes - a.bytes);
  }
  const total = (parts) => PARTS.reduce((s, p) => s + (Number(parts?.[p.id]) || 0), 0);
  // the one line: the total, the three biggest groups, the rest as "other"
  function summary(parts, { top = 3 } = {}) {
    const t = total(parts);
    if (!t) return 'Nothing yet';
    const gs = groups(parts);
    const named = gs.filter((x) => x.group !== 'other').slice(0, top);
    const rest = t - named.reduce((s, x) => s + x.bytes, 0);
    const bits = named.map((x) => `${x.group} ${fmt(x.bytes)}`);
    if (rest > 0) bits.push(`other ${fmt(rest)}`);
    return `${fmt(t)}: ${bits.join(' · ')}`;
  }
  const freeable = (parts) => FREEABLE.reduce((s, id) => s + (Number(parts?.[id]) || 0), 0);

  // ---------- caps: the oldest first ----------
  // entries: [{ path, bytes, at }] (at: last built / used) → { drop: [...], keep: n, bytes: after }
  // Never drops one used in the last hour (a build being played, a bake being shown), whatever the cap.
  const CAPS = {
    play: { bytes: 2 * GB, count: 8, why: '▶ Play builds: at most 8 scenes / 2 GB' },
    thumbs: { bytes: 1 * GB, count: 20000, why: 'asset pictures: at most 1 GB' },
  };
  function capPlan(entries, { bytes = Infinity, count = Infinity, now = Date.now(), fresh = HOUR } = {}) {
    const list = (entries || []).filter((e) => e && e.path).map((e) => ({ ...e, bytes: Number(e.bytes) || 0, at: Number(e.at) || 0 }));
    let sum = list.reduce((s, e) => s + e.bytes, 0);
    let n = list.length;
    const drop = [];
    for (const e of [...list].sort((a, b) => a.at - b.at)) {
      if (sum <= bytes && n <= count) break;
      if (now - e.at < fresh) continue;
      drop.push(e); sum -= e.bytes; n -= 1;
    }
    return { drop, keep: n, bytes: sum };
  }

  // ---------- leftovers that are provably orphaned ----------
  const safeId = (id) => String(id || 'scene').replace(/[^\w-]+/g, '_').slice(0, 60); // gamemodemain.buildScene's folder name
  // the Lab's scene ids, from three-sketches read as it is (state 'ok' from the file, a list with at least one scene);
  // anything else is "unknown": no orphan rule that needs it runs
  function sceneIds(read) {
    if (!read || read.state !== 'ok' || read.from === 'prev' || !Array.isArray(read.value) || !read.value.length) return null;
    const ids = read.value.map((s) => s && s.id).filter((x) => typeof x === 'string' && x);
    return ids.length ? ids : null;
  }
  // ▶ Play builds whose scene is gone (an hour old at least: never the one being built)
  function orphanBuilds(builds, ids, { now = Date.now() } = {}) {
    if (!Array.isArray(ids)) return [];
    const have = new Set(ids.map(safeId));
    return (builds || []).filter((b) => b && b.name && !have.has(b.name) && now - (Number(b.at) || 0) > HOUR);
  }
  // bakes: index entries of scenes that are gone, and files in the bakes folder no entry points at (a day old)
  function orphanBakes(index, ids, files, { now = Date.now(), same = (a, b) => a === b } = {}) {
    if (!Array.isArray(index)) return { entries: [], files: [] };
    const entries = Array.isArray(ids) ? index.filter((e) => e && e.scene && !ids.includes(e.scene)) : [];
    const listed = index.filter((e) => e && e.path).map((e) => e.path);
    const strays = (files || []).filter((f) => f && f.path && !listed.some((p) => same(p, f.path)) && now - (Number(f.at) || 0) > DAY);
    return { entries, files: strays };
  }
  // optimized copies no index entry points at (a killed Optimize's .part, an entry dropped while its file was held)
  function orphanOptimized(index, files, { now = Date.now(), same = (a, b) => a === b } = {}) {
    if (!index || typeof index.entries !== 'object' || !index.entries) return [];
    const outs = Object.values(index.entries).map((e) => e && e.out).filter(Boolean);
    return (files || []).filter((f) => f && f.path && !outs.some((o) => same(o, f.path)) && now - (Number(f.at) || 0) > DAY);
  }
  // a render's temporary title frames: its render ended long ago (6 h; renders write their frames as they go)
  const staleTitles = (dirs, { now = Date.now() } = {}) => (dirs || []).filter((d) => d && TITLES.test(d.name) && now - (Number(d.at) || 0) > 6 * HOUR);
  // Hearth's temp folders in the computer's temp folder, two days untouched (nothing Hearth does runs that long)
  const staleTemps = (ents, { now = Date.now() } = {}) => (ents || []).filter((d) => d && isHearthTemp(d.name) && now - (Number(d.at) || 0) > 2 * DAY);

  // ---------- the one quiet line in Activity ----------
  function tidyLine(moved) {
    const list = (moved || []).filter((m) => m && m.bytes >= 0);
    if (!list.length) return '';
    const bytes = list.reduce((s, m) => s + (m.bytes || 0), 0);
    const kinds = [...new Set(list.map((m) => (BY[m.part]?.label || 'Leftovers').replace(/^▶ /, '')).map((l) => (/^[A-Z][a-z]/.test(l) ? l[0].toLowerCase() + l.slice(1) : l)))];
    return `Tidied ${fmt(bytes)} Hearth no longer needed (${kinds.slice(0, 3).join(', ')}) — to the Trash`;
  }

  // ---------- the calm note ----------
  const THRESHOLD = 25 * GB; const LOW = 5 * GB;
  function hintFor({ total: t = 0, freeable: f = 0, diskFree = null, threshold = THRESHOLD, low = LOW } = {}) {
    if (diskFree != null && diskFree < low) {
      return { kind: 'low', text: `Your disk has ${fmt(diskFree)} left.${f >= 100 * MB ? ` Hearth can free ${fmt(f)} it can rebuild by itself.` : ' Hearth itself has little to free.'}` };
    }
    if (t > threshold && f >= GB) return { kind: 'big', text: `Hearth uses ${fmt(t)}. ${fmt(f)} of it is caches it can rebuild by itself.` };
    return null;
  }

  return { PARTS, BY, FREEABLE, CACHE_DIRS, CAPS, THRESHOLD, LOW, KB, MB, GB, HOUR, DAY, classify, classifyProfile, isHearthTemp, fmt, groups, total, summary, freeable, capPlan, safeId, sceneIds, orphanBuilds, orphanBakes, orphanOptimized, staleTitles, staleTemps, tidyLine, hintFor };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DiskCalmCore;
if (typeof window !== 'undefined') window.DiskCalmCore = DiskCalmCore;
