// Files changed outside Hearth (round 42, filewatch): the rules, pure (UMD: filewatchmain.js and dev/filewatch-test.js
// require it, FileWatchCore in the window). No fs, no timers of its own: the platform, the path module, the clock and
// the timer functions are handed in, so the tests run a Mac and a Windows PC on Linux.
//   · ignored(name)       editors' and apps' temp / swap / placeholder files that are never news (.DS_Store, ~$x.docx,
//                         .x.swp, x.crdownload, iCloud's .x.icloud, Photoshop's temp, Hearth's own .hubtmp…)
//   · options(platform)   fs.watch options: one recursive watch per folder on the Mac (FSEvents) and Windows
//                         (ReadDirectoryChangesW); Linux recursive only for small trees (inotify costs a watch per folder)
//   · plan(wants, ctx)    the fewest OS watches covering every wanted file / folder: files by their folder, folders
//                         recursive where cheap, never the home folder / a disk's root recursively, nested ones merged
//   · createCoalescer()   a burst of events → one batch per quiet moment (settle) or at most every maxWait
//   · classify()          what a stat says happened (add / change / delete / offloaded to iCloud / still being written)
//   · pairRenames()       a delete + an add of the same size and modified time in the same batch = a rename
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FileWatchCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const SETTLE = 400; // ms of quiet before a batch goes out
  const MAX_WAIT = 3000; // …or this long after its first event, however busy
  const BUSY_MAX = 60000; // a file still being written waits (a long export) at most this long before it counts
  const POLL = 30000; // the slow check, only for folders the system couldn't watch (network drives, a full inotify table)
  const OWN_MS = 2500; // a file Hearth itself just wrote isn't news
  const LINUX_MAX_DIRS = 300; // a tree up to this many folders is watched recursively on Linux

  // ---------- names that are never news ----------
  const IGNORE_NAMES = [
    /^\.DS_Store$/, /^\._./, /^\.localized$/, /^Icon\r?$/, /^Thumbs\.db$/i, /^ehthumbs(_vista)?\.db$/i, /^desktop\.ini$/i,
    /^~\$/, // Office's owner files (~$report.docx)
    /^~WRL\d+\.tmp$/i, /^~PST\w*\.tmp$/i, /^Photoshop Temp\w*/i, /^PSAutoRecover/i, // Word / Photoshop's temp files
    /^\..+\.sw[a-p]$/i, /\.swp$/i, /~$/, /^\.#/, /^#.*#$/, /^4913$/, // vim, emacs (vim's 4913 write test)
    /\.(crdownload|part|partial|download|opdownload|tmp|temp|crswap|kate-swp)$/i, // browsers' half downloads, temp files
    /\.sb-[0-9a-f]{8}-\w{6}$/i, // the Mac's safe save (TextEdit, Preview…: file.txt.sb-1a2b3c4d-AbCdEf)
    /___jb_(tmp|old|bak)___$/, /^\.goutputstream-/, /^\.~lock\..*#$/, // JetBrains, GNOME, LibreOffice
    /\.tmp\.drive(download|upload)$/i, /^\.dropbox(\.attr)?$/i, /^\.~/, // Google Drive, Dropbox
    /\.icloud$/, // iCloud placeholders (.name.icloud): classify() reads them as "offloaded", never as a change
    /\.hubtmp$/, /^\.hearth-part-/, /\.hearth-tmp$/, // Hearth's own atomic writes and sync's pieces
  ];
  const IGNORE_DIRS = /(^|[\\/])(\.git|\.svn|\.hg|node_modules|\.Trash(es)?|\$RECYCLE\.BIN|System Volume Information|\.Spotlight-V100|\.fseventsd|\.TemporaryItems|\.DocumentRevisions-V100|\.dropbox\.cache|__pycache__|\.cache|Photoshop Temp\w*)([\\/]|$)/i;
  function ignored(rel) {
    const s = String(rel || '');
    const base = s.split(/[\\/]/).pop();
    if (!base) return false;
    if (IGNORE_DIRS.test(s)) return true;
    return IGNORE_NAMES.some((re) => re.test(base));
  }
  // iCloud's placeholder of an offloaded file: ".logo.png.icloud" → "logo.png"
  const icloudOf = (base) => { const m = /^\.(.+)\.icloud$/.exec(String(base || '')); return m ? m[1] : null; };

  // ---------- paths ----------
  // Windows compares paths without case; (round 46) the Mac too (its disks ignore case by default) and in one Unicode
  // form: FSEvents names "Músique.mp3" decomposed (NFD) while the window names it composed (NFC), so an accented file
  // was never matched; Linux exactly
  const keyOf = (p, platform) => (platform === 'win32' ? String(p).toLowerCase() : platform === 'darwin' ? String(p).normalize('NFC').toLowerCase() : String(p));
  function inside(child, dir, P, platform) {
    const c = keyOf(P.resolve(String(child)), platform); const d = keyOf(P.resolve(String(dir)), platform);
    if (c === d) return true;
    return c.startsWith(d.endsWith(P.sep) ? d : d + P.sep);
  }
  // folders never watched recursively: a disk's root, the home folder and what holds the homes / disks (a whole home
  // folder on Windows means AppData's endless writes; on the Mac ~/Library's)
  function huge(dir, { P, home, platform }) {
    const d = P.resolve(String(dir));
    if (P.dirname(d) === d) return true; // '/', 'C:\'
    const k = keyOf(d, platform);
    if (home && k === keyOf(P.resolve(home), platform)) return true;
    if (home && k === keyOf(P.dirname(P.resolve(home)), platform)) return true; // /Users, C:\Users, /home
    if (platform === 'darwin' && (/^\/Volumes(\/[^/]+)?$/.test(d) || /^\/(System|Library|Applications|private)$/.test(d))) return true;
    if (platform !== 'win32' && platform !== 'darwin' && /^\/(mnt|media)(\/[^/]+){0,2}$/.test(d)) return true;
    return false;
  }
  // where a disk is mounted (a missing one = unplugged, not deleted): /Volumes/X, D:\, \\server\share, /media/u/X
  function volumeOf(p, { P, platform }) {
    const d = P.resolve(String(p));
    if (platform === 'darwin') { const m = /^\/Volumes\/[^/]+/.exec(d); return m ? m[0] : null; }
    if (platform === 'win32') { const r = P.parse(d).root; return r && !/^[cC]:\\$/.test(r) ? r : null; }
    const m = /^\/(media\/[^/]+\/[^/]+|mnt\/[^/]+|run\/media\/[^/]+\/[^/]+)/.exec(d);
    return m ? m[0] : null;
  }

  // ---------- fs.watch options per computer ----------
  // persistent: false (a watch never keeps Hearth running); recursive where the system does it in one watch
  function options(platform, recursive = true) {
    const native = platform === 'darwin' || platform === 'win32';
    return { persistent: false, encoding: 'utf8', recursive: Boolean(recursive) && (native || platform === 'linux' || platform === 'freebsd') };
  }
  const nativeRecursive = (platform) => platform === 'darwin' || platform === 'win32';

  // ---------- the plan: which folders the system watches ----------
  // wants: [{ path, kind: 'file' | 'folder', deep?: true (a folder: everything inside, default), force?: recursive even
  // where it's costly (sync's own folders, watched recursively before this round too) }]
  // ctx: { platform, P (path / path.win32 / path.posix), home, smallTree(dir) → bool (Linux: a cheap bounded count) }
  // → [{ dir, recursive, n (wants it covers) }]: shortest first, none inside a recursive one
  function plan(wants, ctx) {
    const { platform, P } = ctx;
    const want = [];
    for (const w of wants || []) {
      if (!w || !w.path) continue;
      const p = P.resolve(String(w.path));
      if (w.kind === 'folder') {
        const deep = w.deep !== false;
        const rec = deep && (w.force || (!huge(p, ctx) && (nativeRecursive(platform) || Boolean(ctx.smallTree?.(p)))));
        want.push({ dir: p, recursive: Boolean(rec) });
      } else want.push({ dir: P.dirname(p), recursive: false });
    }
    // the same folder twice: recursive wins; shortest first so ancestors are kept before what they cover
    const by = new Map();
    for (const w of want) {
      const k = keyOf(w.dir, platform);
      const had = by.get(k);
      if (had) { had.recursive = had.recursive || w.recursive; had.n += 1; } else by.set(k, { dir: w.dir, recursive: w.recursive, n: 1 });
    }
    const list = [...by.values()].sort((a, b) => a.dir.length - b.dir.length || (a.dir < b.dir ? -1 : 1));
    const out = [];
    for (const r of list) {
      const cover = out.find((o) => o.recursive && inside(r.dir, o.dir, P, platform));
      if (cover) { cover.n += r.n; continue; }
      out.push(r);
    }
    return out;
  }
  // does a root plan differ from the one running (so the watches are only touched when it does)
  const planSig = (roots, platform) => roots.map((r) => `${r.recursive ? 'R' : 'D'}${keyOf(r.dir, platform)}`).sort().join('\n');

  // ---------- coalescing ----------
  // push(path, ev) for every raw event; onFlush([{ path, n, evs }], rawCount) once things go quiet (settle) or at most
  // maxWait after the first event of a burst. Timers: one per burst at most a few times (a quiet check re-arms for
  // what's left, not on every event).
  function createCoalescer({ settle = SETTLE, maxWait = MAX_WAIT, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onFlush } = {}) {
    const pend = new Map(); let t = null; let first = 0; let last = 0; let raw = 0; let flushes = 0;
    function arm(ms) { t = setTimer(check, Math.max(0, ms)); t?.unref?.(); }
    function check() {
      t = null;
      if (!pend.size) { first = 0; return; }
      const due = Math.min(last + settle, first + maxWait);
      if (now() < due) { arm(due - now()); return; }
      fire();
    }
    function fire() {
      if (t) { clearTimer(t); t = null; }
      const items = [...pend.values()]; const n = raw;
      pend.clear(); first = 0; raw = 0;
      if (items.length) { flushes += 1; onFlush?.(items, n); }
    }
    function push(path, ev = 'change') {
      raw += 1;
      const k = String(path);
      const x = pend.get(k) || { path: k, n: 0, evs: [] };
      x.n += 1; if (!x.evs.includes(ev)) x.evs.push(ev);
      pend.set(k, x);
      last = now(); if (!first) first = last;
      if (!t) arm(settle);
    }
    function cancel() { if (t) { clearTimer(t); t = null; } pend.clear(); first = 0; raw = 0; }
    return { push, flush: fire, cancel, size: () => pend.size, flushes: () => flushes };
  }

  // ---------- what happened to one file ----------
  // prev: the stamp known before ({ size, mtime } or null) · st: a stat now ({ size, mtime, isDir } or null) ·
  // placeholder: iCloud's ".name.icloud" is there · t: now
  // → { kind: 'add' | 'change' | 'delete' | 'offloaded' | null (nothing new), busy?: still being written }
  function classify(prev, st, { placeholder = false, t = Date.now(), settle = SETTLE } = {}) {
    if (!st) {
      if (placeholder) return { kind: prev?.offloaded ? null : 'offloaded' };
      return { kind: prev && !prev.none ? 'delete' : null };
    }
    if (st.isDir) return { kind: prev && !prev.none ? null : 'add', dir: true };
    // written in the last moment: an app is still saving it (a long export, a big Photoshop file)
    const busy = t - st.mtime < settle / 2 && st.mtime <= t + 1000;
    if (!prev || prev.none || prev.offloaded) return { kind: 'add', busy };
    if (prev.size === st.size && Math.abs(prev.mtime - st.mtime) < 1) return { kind: null };
    return { kind: 'change', busy };
  }
  const stampOf = (st) => (st ? { size: st.size, mtime: Math.round(st.mtime * 1000) / 1000 } : { none: true });

  // ---------- renames ----------
  // changes: [{ path, kind, size, mtime, prev? }] in one batch. A delete (with its last stamp) and an add of the same size
  // and modified time (a rename / move keeps both) in the same folder, or with the same name elsewhere → one rename.
  function pairRenames(changes, { P, platform }) {
    const dels = changes.filter((c) => c.kind === 'delete' && c.prev && !c.prev.none);
    const adds = changes.filter((c) => c.kind === 'add' && !c.dir);
    const out = []; const used = new Set();
    for (const d of dels) {
      const cand = adds.filter((a) => !used.has(a) && a.size === d.prev.size && Math.abs(a.mtime - d.prev.mtime) < 2);
      const same = (x, y) => keyOf(x, platform) === keyOf(y, platform);
      const pick = cand.find((a) => same(P.dirname(a.path), P.dirname(d.path))) || cand.find((a) => same(P.basename(a.path), P.basename(d.path)));
      if (!pick) continue;
      used.add(pick); used.add(d);
      out.push({ ...d, kind: 'rename', to: pick.path, size: pick.size, mtime: pick.mtime });
    }
    return [...changes.filter((c) => !used.has(c)), ...out];
  }

  // ---------- who wants it ----------
  // wants: [{ path, kind, tag, deep }] → the tags a changed path belongs to
  function tagsFor(p, wants, { P, platform }) {
    const k = keyOf(P.resolve(String(p)), platform);
    const tags = [];
    for (const w of wants) {
      const wk = keyOf(P.resolve(String(w.path)), platform);
      if (w.kind === 'folder') {
        if (k === wk) { tags.push(w.tag); continue; }
        if (w.presence) continue; // only the folder itself (there / gone), never what changes inside
        if (!inside(p, w.path, P, platform)) continue;
        if (w.deep === false && keyOf(P.dirname(P.resolve(String(p))), platform) !== wk) continue;
        tags.push(w.tag);
      } else if (k === wk) tags.push(w.tag);
    }
    return [...new Set(tags)];
  }

  // ---------- plain words ----------
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  function words(changes) {
    const n = changes.length;
    if (!n) return '';
    if (n === 1) {
      const c = changes[0];
      return c.kind === 'rename' ? `${base(c.path)} is now ${base(c.to)}` : c.kind === 'delete' ? `${base(c.path)} was deleted` : `${base(c.path)} updated from disk`;
    }
    return `${n} files updated from disk`;
  }

  return { SETTLE, MAX_WAIT, BUSY_MAX, POLL, OWN_MS, LINUX_MAX_DIRS, ignored, icloudOf, keyOf, inside, huge, volumeOf, options, nativeRecursive, plan, planSig, createCoalescer, classify, stampOf, pairRenames, tagsFor, words, base };
}));
