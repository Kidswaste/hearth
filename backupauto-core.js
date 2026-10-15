// 💾 Automatic backups, the pure parts (round 45, backupauto). The owner nearly lost every Lab scene; backups now happen
// by themselves (once a day when the computer is idle, before every update and before a Recover / restore), are checked
// after they're written, kept on a rotation, and listed with what's inside. No Electron, no files: required by
// backupautomain.js (the main process does the work) and dev/backupauto-test.js; BackupAutoCore in the window (words).
//   PLAN / rotate(items, now)   which backups stay: the newest 3, one a day for 7 days, one a week for 4 weeks, one a
//                               month for 6 months, the newest made before an update / a restore; only this computer's
//   decide(st, env)             whether an automatic backup runs now: on (per computer), due (a day), idle, never while
//                               rendering / recording / presenting / updating, never on battery below 40 %, never asleep;
//                               after a failure it tries again later (30 min, 1 h, 2 h … 6 h at most)
//   places(io) / checkDir()     where backups go on this computer: Documents/Hearth backups by default; iCloud Drive (Mac)
//                               or OneDrive (Windows) offered when they're there; never inside Hearth's data folder, the
//                               app's folder or the sync folder in the cloud drive
//   split(files, prevMedia)     what goes in the zip (everything small; scenes, chats, memory, settings always) and what
//                               goes once into the media store next to the zips (big media, skipped while unchanged)
//   countsOf(read) / summary()  "12 scenes · 40 chats · memory · 3 AIs · settings"
//   compare(manifest, found)    the check after writing: every key file parses and the counts match the manifest
//   explain(err)                what went wrong, in plain words, and the one fix (Retry, another folder, room, permission)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BackupAutoCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const MIN = 60000; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
  const PLAN = { newest: 3, daily: 7, weekly: 4, monthly: 6 };
  const BIG = 20 * 1024 * 1024; // a file this big (not JSON) goes to the media store once instead of every zip
  const DUE = 20 * HOUR; // "once a day" with slack: a backup at 9:00 yesterday doesn't push today's to 9:00
  const IDLE = { need: 3 * MIN, hidden: MIN, late: 30000 }; // idle wanted (system idle time); less when Hearth is hidden or a backup is late
  const BATTERY_MIN = 0.4; // on battery: only above 40 %
  const BUSY = ['render', 'export', 'formats', 'record', 'present', 'update']; // powerwise's holds a backup never runs during
  const STALE = 3 * DAY; // no good backup for this long: one calm note
  const RETRY = [30 * MIN, HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR];
  const KEEP_REASONS = ['update', 'restore'];

  // ---------- names ----------
  const pad = (n) => String(n).padStart(2, '0');
  const slugOf = (name) => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'computer';
  // hearth-backup-2026-10-15-09-30-QUENT-PC.zip (local time: what the owner sees in Finder / Explorer)
  function fileName(at, computer) {
    const d = new Date(at);
    return `hearth-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}${computer ? `-${slugOf(computer)}` : ''}.zip`;
  }
  // → { at (local), computer? } or null for a zip that isn't a Hearth backup by name
  function parseName(name) {
    const m = String(name || '').match(/^hearth-backup-(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)(?:-([A-Za-z0-9-]+))?\.zip$/i);
    if (!m) return null;
    return { at: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(), computer: m[6] || '' };
  }

  // ---------- rotation ----------
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const monthKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}`; };
  function weekKey(t) { // ISO week (Monday first)
    const d = new Date(t); const day = (d.getDay() + 6) % 7;
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`;
  }
  // items: [{ name, at, ok (true / false / undefined = not checked, e.g. an older backup), mine, reason }]
  // → { keep: [names], drop: [names], why: { name: 'newest' | 'daily' | … } } — only this computer's (mine) are dropped;
  //   a failed backup goes once a good one is newer; the newest good one always stays
  function rotate(items, now = Date.now(), plan = PLAN) {
    const mine = (items || []).filter((b) => b && b.mine).sort((a, b) => b.at - a.at);
    const good = mine.filter((b) => b.ok !== false);
    const why = {};
    const mark = (b, w) => { if (b && !why[b.name]) why[b.name] = w; };
    good.slice(0, plan.newest).forEach((b) => mark(b, 'newest'));
    const buckets = (keyFn, n, w) => {
      const seen = new Set();
      for (const b of good) { const k = keyFn(b.at); if (seen.has(k)) continue; if (seen.size >= n) break; seen.add(k); mark(b, w); }
    };
    buckets(dayKey, plan.daily, 'daily');
    buckets(weekKey, plan.weekly, 'weekly');
    buckets(monthKey, plan.monthly, 'monthly');
    for (const r of KEEP_REASONS) mark(good.find((b) => b.reason === r), r);
    const newestGood = good[0]?.at || 0;
    for (const b of mine) if (b.ok === false && b.at > newestGood) mark(b, 'last try'); // the latest attempt failed: shown until a good one follows
    const keep = mine.filter((b) => why[b.name]).map((b) => b.name);
    const drop = mine.filter((b) => !why[b.name]).map((b) => b.name);
    return { keep, drop, why };
  }

  // ---------- when ----------
  // st: { auto, lastOk, lastTry, failures, since } (this computer's backup state)
  // env: { now, idleMs, hidden, holds: [reasons], battery, level (0..1 | null), asleep, running }
  // → { go, why, next? } why: 'off' | 'running' | 'asleep' | 'busy:<reason>' | 'battery' | 'not due' | 'retry later' | 'not idle' | 'due'
  function decide(st = {}, env = {}) {
    const now = env.now ?? Date.now();
    if (st.auto === false) return { go: false, why: 'off' };
    if (env.running) return { go: false, why: 'running' };
    if (env.asleep) return { go: false, why: 'asleep' };
    const busy = (env.holds || []).find((h) => BUSY.includes(h));
    if (busy) return { go: false, why: `busy:${busy}` };
    if (env.battery && !(typeof env.level === 'number' && env.level >= BATTERY_MIN)) return { go: false, why: 'battery' };
    const lastOk = Number(st.lastOk) || 0;
    if (lastOk && now - lastOk < DUE) return { go: false, why: 'not due', next: lastOk + DUE };
    const fails = Number(st.failures) || 0;
    const lastTry = Number(st.lastTry) || 0;
    if (fails && lastTry) { const wait = RETRY[Math.min(fails, RETRY.length) - 1]; if (now - lastTry < wait) return { go: false, why: 'retry later', next: lastTry + wait }; }
    const late = !lastOk || now - lastOk > 2 * DAY;
    const need = late ? IDLE.late : env.hidden ? IDLE.hidden : IDLE.need;
    if ((Number(env.idleMs) || 0) < need) return { go: false, why: 'not idle' };
    return { go: true, why: 'due' };
  }
  // the calm note: no good backup for 3 days (counted from when backups started on this computer when there never was one)
  function stale(st = {}, now = Date.now()) {
    if (st.auto === false) return false;
    const from = Number(st.lastOk) || Number(st.since) || now;
    return now - from >= STALE;
  }
  // before an update / a restore: skip when a good backup is this fresh
  const FRESH = { update: HOUR, restore: 10 * MIN, recover: 10 * MIN };
  const freshEnough = (st = {}, reason, now = Date.now()) => Boolean(st.lastOk) && now - st.lastOk < (FRESH[reason] ?? HOUR);

  // ---------- where ----------
  // io: { platform, home, documents?, env, drives: [{ id, label, root }] (sync-merge detectClouds) }
  // → { def: { id, label, dir, why }, offers: [{ id, label, dir, why }] }: Documents first; iCloud Drive on a Mac,
  //   OneDrive on Windows (only when they're on this computer), with a plain explanation
  function places(io = {}) {
    const P = pathOf(io.platform);
    const docs = io.documents || P.join(io.home || '', 'Documents');
    const def = { id: 'documents', label: 'Documents', dir: P.join(docs, 'Hearth backups'), why: 'On this computer only. Quick, and nothing leaves it.' };
    const offers = [];
    const want = io.platform === 'darwin' ? ['icloud', 'onedrive'] : io.platform === 'win32' ? ['onedrive', 'icloud'] : ['onedrive', 'dropbox', 'gdrive'];
    for (const id of want) {
      const d = (io.drives || []).find((x) => x.id === id);
      if (!d) continue;
      offers.push({ id, label: d.label, dir: P.join(d.root, 'Hearth backups'),
        why: `Also kept online by ${d.label}: if this ${io.platform === 'darwin' ? 'Mac' : 'computer'} breaks or is lost, the backups are still there. They use your ${d.label} space.` });
    }
    return { def, offers };
  }
  const pathOf = (platform) => {
    const p = typeof require === 'function' ? require('path') : null;
    if (!p) return { join: (...a) => a.filter(Boolean).join(platform === 'win32' ? '\\' : '/') };
    return platform === 'win32' ? p.win32 : p.posix;
  };
  // is `dir` inside (or the same as) `root`? (Windows: case-insensitive, either slash)
  function inside(dir, root, platform) {
    if (!dir || !root) return false;
    const P = pathOf(platform);
    const norm = (x) => { let s = P.resolve ? P.resolve(x) : x; s = s.replace(/[\\/]+$/, ''); return platform === 'win32' ? s.replace(/\//g, '\\').toLowerCase() : s; };
    const a = norm(dir); const b = norm(root);
    const sep = platform === 'win32' ? '\\' : '/';
    return a === b || a.startsWith(b + sep);
  }
  // → { ok: true } or { ok: false, why } — never inside Hearth's data folder (it syncs and is what's backed up), the
  //   app's own folder (an update would see it), or the sync folder in the cloud drive (sync would carry the zips)
  function checkDir(dir, ctx = {}) {
    const P = pathOf(ctx.platform);
    if (!dir || typeof dir !== 'string') return { ok: false, why: 'No folder was given.' };
    if (P.isAbsolute && !P.isAbsolute(dir)) return { ok: false, why: 'That isn\'t a full folder path.' };
    if (inside(dir, ctx.dataDir, ctx.platform)) return { ok: false, why: 'That folder is inside Hearth\'s own data folder: a backup there would be lost with the data (and sync would carry it). Choose a folder outside it.' };
    if (ctx.syncDir && inside(dir, ctx.syncDir, ctx.platform)) return { ok: false, why: 'That folder is Hearth\'s sync folder in your cloud drive: sync would carry the backups back and forth. Choose a folder next to it instead (e.g. "Hearth backups").' };
    if (ctx.appDir && inside(dir, ctx.appDir, ctx.platform)) return { ok: false, why: 'That folder is inside Hearth\'s own program folder: an update could get in the way. Choose a folder outside it.' };
    return { ok: true };
  }
  // a short plain place: "Documents › Hearth backups", "iCloud Drive › Hearth backups"
  function placeLabel(dir, io = {}) {
    if (!dir) return '';
    const P = pathOf(io.platform);
    const { def, offers } = places(io);
    for (const p of [def, ...offers]) if (inside(dir, p.dir, io.platform) && inside(p.dir, dir, io.platform)) return `${p.label} › Hearth backups`;
    const parts = String(dir).split(/[\\/]+/).filter(Boolean);
    return parts.length > 2 ? `${parts.at(-2)} › ${parts.at(-1)}` : (P.normalize ? P.normalize(dir) : dir);
  }

  // ---------- what goes where ----------
  // always in the zip, whatever their size: the owner's work (scenes, chats, memory, settings, tool data)
  const isKey = (rel) => /\.json$/i.test(rel) || /^(chats|kv|templates|recipes)\//.test(rel) || /^(memory|web-history|usage)\.json$/.test(rel);
  const mediaKey = (f) => { // the same file unchanged → the same key (no copy again)
    let h = 2166136261; const s = `${f.rel}\n${f.size}\n${Math.round(f.mtime || 0)}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    const ext = (String(f.rel).match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
    return `${(h >>> 0).toString(16).padStart(8, '0')}-${f.size.toString(36)}${ext}`;
  };
  // files: [{ rel (data/… with /), size, mtime }] · have: Set of media keys already in the store
  // → { zip: [rel], media: [{ rel, key, size, mtime }], copy: [same, only the new ones], zipBytes, copyBytes }
  function split(files, have = new Set(), big = BIG) {
    const zip = []; const media = []; const copy = [];
    let zipBytes = 0; let copyBytes = 0;
    for (const f of files || []) {
      const rel = String(f.rel).replace(/\\/g, '/');
      const inData = rel.replace(/^data\//, '');
      if (f.size >= big && !isKey(inData)) {
        const m = { rel, key: mediaKey({ ...f, rel }), size: f.size, mtime: f.mtime };
        media.push(m);
        if (!have.has(m.key)) { copy.push(m); copyBytes += f.size; }
      } else { zip.push(rel); zipBytes += f.size || 0; }
    }
    return { zip, media, copy, zipBytes, copyBytes };
  }

  // ---------- what's inside ----------
  // read(rel) → parsed JSON or undefined; list(relDir) → names. → { scenes, chats, memory, agents, notes, kv, attachments }
  function countsOf({ read, list }) {
    const arr = (v) => (Array.isArray(v) ? v.length : undefined);
    const mem = read('data/memory.json');
    const lines = (t) => String(t || '').split('\n').filter((l) => l.trim()).length;
    const memory = mem && typeof mem === 'object' ? lines(mem.shared) + Object.values(mem.agents || {}).reduce((a, t) => a + lines(t), 0) + Object.values(mem.places || {}).reduce((a, t) => a + lines(t), 0) : undefined;
    const cfg = read('config.json');
    const jsonIn = (d) => (list(d) || []).filter((n) => /\.json$/i.test(n) && !/\.prev\.json$/i.test(n));
    return {
      scenes: arr(read('data/kv/three-sketches.json')),
      chats: jsonIn('data/chats').length,
      memory,
      agents: arr(cfg?.agents),
      notes: arr(read('data/kv/notes.json')),
      kv: jsonIn('data/kv').length,
      attachments: (list('data/attachments') || []).length,
    };
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  function summary(c = {}, o = {}) {
    if (!c) return '';
    const parts = [];
    if (c.scenes != null) parts.push(plural(c.scenes, 'scene'));
    if (c.chats != null) parts.push(plural(c.chats, 'chat'));
    if (c.memory) parts.push(plural(c.memory, 'memory line'));
    if (c.agents != null) parts.push(plural(c.agents, 'AI'));
    if (c.notes) parts.push(plural(c.notes, 'note'));
    if (!o.short && c.media) parts.push(plural(c.media, 'big media file'));
    if (c.agents != null) parts.push('settings');
    return parts.join(' · ');
  }
  // manifest: what the backup said it held · found: { counts, files, bad: [rel], missing: [rel], media: { missing: [] } }
  // → { ok, problems: [plain words] }
  function compare(manifest, found) {
    const problems = [];
    if (!manifest || typeof manifest !== 'object') return { ok: false, problems: ['its list of contents (hearth-backup.json) is missing or damaged'] };
    if (found.unzip) problems.push(`the zip can't be opened (${found.unzip})`);
    for (const rel of (found.bad || []).slice(0, 5)) problems.push(`${rel} is damaged`);
    if ((found.bad || []).length > 5) problems.push(`and ${found.bad.length - 5} more damaged files`);
    for (const rel of (found.missing || []).slice(0, 5)) problems.push(`${rel} is missing`);
    if (manifest.files != null && found.files != null && found.files < manifest.files) problems.push(`${manifest.files - found.files} of ${manifest.files} files are missing`);
    for (const k of ['scenes', 'chats', 'agents']) {
      const a = manifest.counts?.[k]; const b = found.counts?.[k];
      if (a != null && b != null && a !== b) problems.push(`it should hold ${a} ${k === 'agents' ? 'AIs' : k} but holds ${b}`);
    }
    for (const rel of (found.media?.missing || []).slice(0, 3)) problems.push(`the big file ${rel} isn't in the media folder`);
    return { ok: !problems.length, problems };
  }

  // ---------- plain words ----------
  const fmtBytes = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);
  // err: an Error / { code, message, syscall, path, verify: [problems], free, need } · platform
  // → { why, fix: 'retry' | 'folder' | 'space' | 'permission', code }
  function explain(err, platform = 'linux') {
    const e = err || {};
    const code = e.code || '';
    const msg = String(e.message || e || '');
    const sys = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'The system';
    if (e.verify) return { code: 'VERIFY', fix: 'retry', why: `The backup was written, but checking it found a problem: ${e.verify.slice(0, 3).join('; ')}. It isn't counted as a good backup.` };
    if (code === 'INSIDE') return { code, fix: 'folder', why: msg };
    if (code === 'ENOSPC' || /no space|disk full|not enough (space|room)/i.test(msg)) return { code: 'ENOSPC', fix: 'space', why: `There isn't enough room on the disk for the backup${e.free != null ? ` (${fmtBytes(e.free)} free, about ${fmtBytes(e.need || 0)} needed)` : ''}. Free some space, or choose a folder on another disk.` };
    if (code === 'EACCES' || code === 'EPERM') {
      return { code, fix: 'permission', why: platform === 'win32'
        ? 'Windows didn\'t let Hearth write in the backup folder. If "Controlled folder access" is on (Windows Security › Virus & threat protection › Ransomware protection), allow Hearth there, or choose another folder.'
        : platform === 'darwin' ? 'macOS didn\'t let Hearth write in the backup folder. Allow it in System Settings › Privacy & Security › Files and Folders, or choose another folder.'
          : `${sys} didn't let Hearth write in the backup folder. Choose another folder.` };
    }
    if (code === 'EROFS') return { code, fix: 'folder', why: 'The backup folder is on a disk that can\'t be written to (read-only). Choose another folder.' };
    if (code === 'NOTOOL' || (code === 'ENOENT' && e.syscall && /spawn/.test(e.syscall))) return { code: 'NOTOOL', fix: 'retry', why: `The zip tool Hearth uses wasn't found (${platform === 'linux' ? 'zip / unzip' : 'tar'}). ${platform === 'win32' ? 'It comes with Windows 10 and 11 (System32\\tar.exe).' : 'Install it, then Retry.'}` };
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'NODIR') return { code: 'NODIR', fix: 'folder', why: 'The backup folder isn\'t there any more: a disk was unplugged, or a cloud drive was signed out or moved. Plug it back in, or choose another folder.' };
    if (code === 'EBUSY') return { code, fix: 'retry', why: 'Another program held a file for too long (an antivirus or a cloud drive). Nothing was changed; Retry in a moment.' };
    if (code === 'ETIMEDOUT' || e.killed || /timed? ?out/i.test(msg)) return { code: 'ETIMEDOUT', fix: 'retry', why: 'The backup took too long and was stopped. Retry when the computer is less busy.' };
    if (code === 'EIO') return { code, fix: 'folder', why: 'The disk had trouble reading or writing (EIO). If the backup folder is on an external or network disk, check it, or choose another folder.' };
    return { code: code || 'OTHER', fix: 'retry', why: `Something went wrong: ${msg.replace(/^Error:\s*/, '').slice(0, 200) || 'unknown error'}.` };
  }
  function ago(t, now = Date.now()) {
    if (!t) return 'never';
    const s = Math.max(0, now - t);
    if (s < 90e3) return 'just now';
    if (s < HOUR) return `${Math.round(s / MIN)} min ago`;
    if (s < DAY) return `${Math.round(s / HOUR)} h ago`;
    const d = Math.round(s / DAY);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  const REASON_WORDS = { auto: 'automatic', manual: 'you', update: 'before an update', restore: 'before a restore', recover: 'before a Recover', legacy: '' };

  return { PLAN, BIG, DUE, IDLE, BATTERY_MIN, BUSY, STALE, RETRY, FRESH, fileName, parseName, slugOf, dayKey, weekKey, monthKey, rotate, decide, stale, freshEnough, places, inside, checkDir, placeLabel, isKey, mediaKey, split, countsOf, summary, compare, explain, ago, fmtBytes, REASON_WORDS };
}));
