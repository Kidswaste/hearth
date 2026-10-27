// Sync, the pure parts (no files, no Electron): what syncs, three-way JSON merge, Mac ⇄ Windows path forms,
// the portable part of config.json, and finding the cloud drive folders. Used by sync-engine.js (the engine,
// main process) and dev/sync-test.js.
//
// Path forms: JSON stores keep absolute paths (attachments, references, captures…). In the cloud copy, paths inside
// the data folder become "hearth-data:/rel/with/slashes", paths inside the cloud drive "hearth-cloud:/…" and paths
// in the home folder "hearth-home:/…" (file:/// URLs get "hearth-data-url:" and friends). Each machine expands them
// to its own folders when it reads the cloud copy, so a chat attachment made on the PC opens on the Mac.
const path = require('path');
// PowerShell and several Windows exporters prefix otherwise valid UTF-8 JSON.
const parseJson = text => JSON.parse(String(text).replace(/^\uFEFF/, ''));

// ---------- what syncs ----------
// Cloud clients' own files and half-written files, on either side (never synced, never deleted by Hearth).
const IGNORE_NAME = [
  /\.icloud$/i, /^~\$/, /\.tmp$/i, /\.temp$/i, /^desktop\.ini$/i, /^\.ds_store$/i, /^thumbs\.db$/i, /^icon\r?$/i,
  /\.g(doc|sheet|slides|draw|form|site|map|table|link)$/i, /^\.~lock\./i, /\.crdownload$/i, /\.part$/i, /\.partial$/i,
  /\.hubtmp$/i, /\.hearth-part/i, /^\.hearth-tmp-/i, /^\.dropbox/i, /\.dropbox\.attr$/i, /^\.(git|svn)$/i, /\.swp$/i,
  /\.prev\.json$/i, /^\._/, /\.download$/i,
];
const ignoredName = (name) => IGNORE_NAME.some((re) => re.test(name));
// Folders and files of the data folder that belong to this computer only.
// (round 19, reach) the chats' workspace (data/workspace: what Claude / Astra make) syncs too, without what can be
// rebuilt: dependency folders, Python caches and virtualenvs anywhere (hidden folders like .git never sync).
const LOCAL_DIRS = new Set(['sync', 'mcp-runs', 'ae', 'node_modules', 'electron', 'captures/frames', 'remote', 'safetynet', 'chrome', 'leavesoon', 'bugbutton']); // (round 68, leavesoon68) leavesoon: this computer's leave reminders (the other computer would ring them too) · (round 68, bugbutton68) bugbutton: this computer's problem log + reports after an unexpected close // (round 24) remote: this computer's paired phones' keys · (round 29) safetynet: this computer's session marker + work journal · (round 30) chrome: the Hearth Chrome's profile on this computer
const HEAVY_DIRS = new Set(['node_modules', '__pycache__', 'venv', 'bower_components', '.venv', '.git', '.cache', '.next', '.parcel-cache', '.turbo']);
const transientWorkspace = rel => /^workspace\//i.test(rel) && /\/(?:[^/]+[-_])?(?:qa|chrome|chromium|browser|playwright|puppeteer)[-_]profile(?:\/|$)|^workspace\/.*\/(?:build-msvc|CMakeFiles)(?:\/|$)/i.test(rel);
const LOCAL_FILES = new Set(['window.json', 'game-bridge.json', 'hearth-origin.json', 'twocopies.json' /* (round 64) this folder's answer to "you already have Hearth" */, 'hearth-icon.png', 'hearth-icon.ico', 'engine-installs.json',
  'connectors.json', 'claude-flags.json', 'now-playing.ps1', 'now-playing-control.ps1', 'now-playing-cover.jpg', 'kv/fake-switches.json', 'kv/downloads-log.json',
  'kv/jank-log.json', 'kv/dev-reports.json', 'devreport-crashes.json', 'kv/offline-queue.json',
  'chrome-prefs.json', 'interop/obs.json', 'kv/media-here.json',
  'config.json', 'theme.css']); // (round 20) this computer's smoothness log: about this machine, never synced · (round 34) offline-queue: messages waiting to go out from THIS computer (synced, the other one would send them too) · (round 35, twocomputers) chrome-prefs: this computer's Chrome (browser, shown or not) · interop/obs.json: this computer's OBS address + keychain-sealed password · media-here: files found again on this computer · (round 55, configsafe) config.json / theme.css: the owner's settings in data/, synced as app/config.json / app/theme.css (portable part), never a second time as data files
function localOnly(rel) {
  const r = rel.replace(/\\/g, '/');
  // Recent clicks / learned shortcuts describe this computer. Repeatedly merging
  // them across devices creates a feedback loop of iCloud conflict copies.
  if (/^kv\/speed(?: \d+| ?\(\d+\)| \([^()]*conflicted copy[^()]*\))?\.json$/i.test(r)) return true;
  if (transientWorkspace(r)) return true;
  if (LOCAL_FILES.has(r)) return true;
  if (/(^|\/)\./.test(r)) return true; // hidden files / folders
  if (/\.log(\.\d+)?$/i.test(r) || /^mcp-[^/]*\.json$/i.test(r)) return true;
  const parts = r.split('/');
  for (let i = 1; i < parts.length; i++) if (LOCAL_DIRS.has(parts.slice(0, i).join('/')) || HEAVY_DIRS.has(parts[i - 1])) return true;
  return parts.some(ignoredName) || /\.py[co]$/i.test(r);
}
const dirLocalOnly = (relDir) => { const r = relDir.replace(/\\/g, '/'); return LOCAL_DIRS.has(r) || /(^|\/)\./.test(r) || HEAVY_DIRS.has(r.split('/').pop()); };
// Own metadata writes must not start another sync pass; files/ changes still do.
function watchIgnored(name, cloud = false) {
  let r=String(name||'').replace(/\\/g,'/');
  if (cloud) { if (/^(?:\.sync|trash)(?:\/|$)/.test(r)) return true; r=r.replace(/^files\//,''); }
  return localOnly(r) || localOnly(`${r}/x`);
}
// JSON stores merge field by field; everything else (media, Markdown, CSS) is a whole file. A project's own JSON in
// the workspace (package.json, a scene file a chat wrote) is a whole file too: kept byte for byte, never reformatted.
const isWorkspaceRel = (rel) => /^workspace\//.test(String(rel).replace(/\\/g, '/'));
const isJsonRel = (rel) => /\.json$/i.test(rel) && !isWorkspaceRel(rel);
// Stores of counts (token usage, button usage): when both computers added to a number, both additions count.
const COUNTER_RELS = [/^usage\.json$/, /^kv\/token-stats\.json$/, /^kv\/ui-usage\.json$/, /^kv\/astra-scoreboard\.json$/];
const isCounterRel = (rel) => COUNTER_RELS.some((re) => re.test(rel));
// Chats and stores have names without spaces, so "x 2.json" / "x (1).json" in the cloud are copies made by a cloud client.
const MEDIA = /\.(mp4|mov|webm|mkv|m4v|avi|gif|png|jpe?g|webp|wav|mp3|m4a|aac|flac|ogg|aiff?)$/i;

// ---------- deep equality / cloning ----------
function eq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false; return true; }
  const ka = Object.keys(a); const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !eq(a[k], b[k])) return false;
  return true;
}
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------- three-way merge ----------
// merge3(base, ours, theirs) → { value, conflicts: [{ path, ours, theirs }] }. base = the last version both computers
// had (null = none: the first join merges two histories). Changes on one side win; changes on both sides merge
// field by field; lists of objects with an id (or chat messages: role + time) merge item by item, so messages
// added on two computers all stay, in time order. A true conflict (one field changed two ways) keeps ours and is
// reported, so the caller can keep their whole version as a conflict copy.
const ABSENT = Symbol('absent');
const TIME_KEY = /(^|[a-z])(At|Time|Ts)$|^(updated|modified|lastSeen|last|mtime|seen|since)$/;
function merge3(base, ours, theirs, opts = {}) {
  base = compactProjects(base); ours = compactProjects(ours); theirs = compactProjects(theirs);
  const conflicts = [];
  const b = base === null || base === undefined ? ABSENT : base;
  const value = m(b, ours, theirs, [], conflicts, { counters: Boolean(opts.counters), twoWay: b === ABSENT });
  return { value: value === ABSENT ? null : value, conflicts };
}
const short = (v) => { if (v === ABSENT) return '(removed)'; const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 80 ? `${s.slice(0, 77)}…` : s; };
function m(b, o, t, p, c, opt) {
  if (eq(o, t)) return o;
  if (b !== ABSENT && eq(b, o)) return t;
  if (b !== ABSENT && eq(b, t)) return o;
  if (o === ABSENT) return t; // removed on one side, changed on the other: keep the change (nothing is lost)
  if (t === ABSENT) return o;
  if (isObj(o) && isObj(t)) return mergeObj(isObj(b) ? b : {}, o, t, p, c, opt, b === ABSENT);
  if (Array.isArray(o) && Array.isArray(t)) return mergeArr(Array.isArray(b) ? b : [], o, t, p, c, opt, b === ABSENT);
  if (typeof o === 'number' && typeof t === 'number') {
    const k = String(p[p.length - 1] ?? '');
    if (TIME_KEY.test(k)) return Math.max(o, t);
    if (opt.counters) { const bn = typeof b === 'number' ? b : 0; return bn + (o - bn) + (t - bn); }
  }
  c.push({ path: p.join('.') || '(whole file)', ours: short(o), theirs: short(t) });
  return o;
}
function mergeObj(b, o, t, p, c, opt, noBase) {
  const out = {};
  const keys = [...Object.keys(o), ...Object.keys(t).filter((k) => !Object.prototype.hasOwnProperty.call(o, k))];
  for (const k of keys) {
    const has = (x) => Object.prototype.hasOwnProperty.call(x, k);
    const bv = !noBase && has(b) ? b[k] : ABSENT;
    const ov = has(o) ? o[k] : ABSENT;
    const tv = has(t) ? t[k] : ABSENT;
    // removed on one side, untouched on the other: removed
    if (ov === ABSENT && bv !== ABSENT && eq(bv, tv)) continue;
    if (tv === ABSENT && bv !== ABSENT && eq(bv, ov)) continue;
    const r = m(bv, ov, tv, [...p, k], c, opt);
    if (r !== ABSENT) out[k] = r;
  }
  return out;
}
// an item's identity in a list: its id, else (chat messages) role + time
function keyOf(x) {
  if (isObj(x)) {
    if (x.id !== undefined && x.id !== null && (typeof x.id === 'string' || typeof x.id === 'number')) return `id:${x.id}`;
    if (typeof x.at === 'number') return `at:${x.role ?? ''}@${x.at}`;
    return null;
  }
  if (typeof x === 'string' || typeof x === 'number') return `v:${typeof x}:${x}`;
  return null;
}
function keyed(list) {
  const map = new Map();
  for (const x of list) { const k = keyOf(x); if (k === null || map.has(k)) return null; map.set(k, x); }
  return map;
}
function mergeArr(b, o, t, p, c, opt, noBase) {
  const B = keyed(noBase ? [] : b); const O = keyed(o); const T = keyed(t);
  if (B && O && T) {
    const out = []; // [key, value]
    for (const [k, ov] of O) {
      const inB = B.has(k); const inT = T.has(k);
      if (inT) out.push([k, m(inB ? B.get(k) : ABSENT, ov, T.get(k), [...p, k.replace(/^\w+:/, '')], c, opt)]);
      else if (inB && eq(B.get(k), ov)) continue; // removed on their side
      else out.push([k, ov]); // added here, or changed here while removed there (keep the change)
    }
    // their new items go after the item they followed
    let after = null;
    for (const [k, tv] of T) {
      if (O.has(k)) { after = k; continue; }
      if (B.has(k) && eq(B.get(k), tv)) continue; // removed on our side
      let i = after === null ? -1 : out.findIndex(([kk]) => kk === after);
      while (i + 1 < out.length && !B.has(out[i + 1][0]) && !T.has(out[i + 1][0])) i += 1; // after our own new items there
      out.splice(i + 1, 0, [k, tv]);
      after = k;
    }
    const vals = out.map(([, v]) => v);
    // chat messages and other timed lists stay in time order
    const timed = (list) => list.length > 1 && list.every((x) => isObj(x) && typeof x.at === 'number');
    const sorted = (list) => list.every((x, i) => i === 0 || list[i - 1].at <= x.at);
    if (timed(vals) && sorted(o) && sorted(t)) return vals.map((v, i) => [v, i]).sort((x, y) => x[0].at - y[0].at || x[1] - y[1]).map(([v]) => v);
    return vals;
  }
  // a list both sides only added to
  const prefix = (list) => b.length <= list.length && b.every((x, i) => eq(x, list[i]));
  if (!noBase && prefix(o) && prefix(t)) {
    const ot = o.slice(b.length);
    return [...o, ...t.slice(b.length).filter((x) => !ot.some((y) => eq(x, y)))];
  }
  if (noBase) { // first join: everything from both
    return [...o, ...t.filter((x) => !o.some((y) => eq(x, y)))];
  }
  c.push({ path: p.join('.') || '(whole file)', ours: short(o), theirs: short(t) });
  return o;
}

// ---------- path forms (Mac ⇄ Windows) ----------
// ctx: { dataDir, cloudRoot, home, win (this computer is Windows), aliases: { data: [], cloud: [], home: [] } (other
// computers' folders, from their machine records), ext: { rel → absolute path } (renders kept outside the data folder) }
const ROOTS = [['data', 'hearth-data'], ['cloud', 'hearth-cloud'], ['home', 'hearth-home']];
const isWinPath = (s) => /^[A-Za-z]:[\\/]/.test(s) || /^\\\\[^\\]/.test(s);
const fwd = (s) => String(s).replace(/\\/g, '/').replace(/\/+$/, '');
function urlOf(dir) {
  const f = fwd(dir);
  return `file://${f.startsWith('/') ? '' : '/'}${f}`;
}
function encUrlOf(dir) {
  const f = fwd(dir);
  return `file://${f.startsWith('/') ? '' : '/'}${f.split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/')}`;
}
const PREFIXES = new WeakMap();
function prefixesOf(ctx) {
  if (PREFIXES.has(ctx)) return PREFIXES.get(ctx);
  const out = [];
  for (const [kind, token] of ROOTS) {
    const own = { data: ctx.dataDir, cloud: ctx.cloudRoot, home: ctx.home }[kind];
    const dirs = [own, ...((ctx.aliases && ctx.aliases[kind]) || [])].filter(Boolean);
    for (const d of [...new Set(dirs)]) {
      const ci = isWinPath(d) || ctx.win; // Windows paths compare without case
      out.push({ token, plain: fwd(d), ci, url: false });
      out.push({ token: `${token}-url`, plain: urlOf(d), ci, url: true });
      if (encUrlOf(d) !== urlOf(d)) out.push({ token: `${token}-url`, plain: encUrlOf(d), ci, url: true });
    }
  }
  out.sort((a, b) => b.plain.length - a.plain.length); // the most precise folder first (data is inside home)
  PREFIXES.set(ctx, out);
  return out;
}
function strToCloud(s, ctx) {
  if (typeof s !== 'string' || s.length < 3) return s;
  if (ctx.extRev && ctx.extRev.has(normKey(s, ctx))) return `hearth-data:/${ctx.extRev.get(normKey(s, ctx))}`;
  const first = s[0];
  if (first !== '/' && first !== '\\' && first !== 'f' && first !== 'F' && !/^[A-Za-z]:/.test(s)) return s;
  const sf = s.startsWith('file:') ? s : s.replace(/\\/g, '/');
  for (const p of prefixesOf(ctx)) {
    if (sf.length < p.plain.length) continue;
    const head = sf.slice(0, p.plain.length);
    if (!(p.ci ? head.toLowerCase() === p.plain.toLowerCase() : head === p.plain)) continue;
    const rest = sf.slice(p.plain.length);
    if (rest && rest[0] !== '/') continue;
    return `${p.token}:/${rest.replace(/^\//, '')}`;
  }
  return s;
}
function strFromCloud(s, ctx) {
  if (typeof s !== 'string' || !s.startsWith('hearth-')) return s;
  const mt = /^hearth-(data|cloud|home)(-url)?:\/(.*)$/s.exec(s);
  if (!mt) return s;
  const [, kind, url, rest] = mt;
  if (kind === 'data' && !url && ctx.ext && ctx.ext[rest]) return ctx.ext[rest];
  const dir = kind === 'data' ? ctx.dataDir : kind === 'cloud' ? ctx.cloudRoot : ctx.home;
  if (!dir) return s;
  if (url) return `${encUrlOf(dir)}${rest ? `/${rest}` : ''}`;
  const sep = ctx.win ? '\\' : '/';
  const base = String(dir).replace(/[\\/]+$/, '');
  return rest ? `${base}${sep}${rest.split('/').join(sep)}` : base;
}
const normKey = (s, ctx) => (ctx.win ? fwd(s).toLowerCase() : fwd(s));
function walkStrings(v, fn) {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => walkStrings(x, fn));
  if (isObj(v)) { const out = {}; for (const k of Object.keys(v)) out[k] = walkStrings(v[k], fn); return out; }
  return v;
}
// Derived project item IDs contain file paths too. Rebuild them from the translated ref:
// leaving a Windows ID beside a Mac ref makes the same capture a "new" item on every join.
const compactProjects = v => v?.v === 1 && Array.isArray(v.list) && v.list.some(p => p?.ident && Array.isArray(p.items)) ? require('./projects-core').compact(v, { identities: true }) : v;
const toCloud = (v, ctx) => compactProjects(walkStrings(compactProjects(v), (s) => strToCloud(s, ctx)));
const fromCloud = (v, ctx) => compactProjects(walkStrings(compactProjects(v), (s) => strFromCloud(s, ctx)));
// ext renders: { rel: abs } → the reverse lookup used by toCloud
function withExt(ctx, ext) {
  const out = { ...ctx, ext: ext || {} };
  out.extRev = new Map(Object.entries(ext || {}).map(([rel, abs]) => [normKey(abs, out), rel]));
  return out;
}

// ---------- config.json: the portable part ----------
// Engine paths, folders, start-up / tray, the hotkey, the window layout and sync's own settings stay on each
// computer; agents, the look and the rest of the settings travel. Machine paths anywhere are left out too.
const MACHINE_SETTINGS = new Set(['enginePaths', 'aePath', 'ffmpegPath', 'captureDir', 'videoDirs', 'aeProjectDirs', 'forgeheartFolder', 'forgeDebugBuild',
  'launchAtStartup', 'closeToTray', 'hotkey', 'quickIdeaKey', 'sync', 'zoom']); // (round 71, quickidea71) quickIdeaKey: each computer its own
const MACHINE_KEY = /(Path|Paths|Dir|Dirs|Folder|Folders|Exe|Bin)$/;
const MACHINE_TOP = new Set(['layout']);
// (round 35, twocomputers) fields that are this computer's own wherever they are (an agent's "Run commands without its
// sandbox" is a Windows opt-in: copied to the Mac it would run Astra unsandboxed there)
const MACHINE_FIELD = new Set(['astraNoSandbox']);
const absPath = (s) => typeof s === 'string' && (isWinPath(s) || (s.startsWith('/') && s.length > 1 && !s.startsWith('//')));
function stripMachine(v, isSettings) {
  if (Array.isArray(v)) return v.filter((x) => !absPath(x)).map((x) => stripMachine(x, false));
  if (!isObj(v)) return v;
  const out = {};
  for (const k of Object.keys(v)) {
    if ((isSettings && MACHINE_SETTINGS.has(k)) || MACHINE_KEY.test(k) || MACHINE_FIELD.has(k) || absPath(v[k])) continue;
    out[k] = stripMachine(v[k], false);
  }
  return out;
}
function portableConfig(cfg) {
  const c = clone(cfg) || {};
  const out = {};
  for (const k of Object.keys(c)) {
    if (MACHINE_TOP.has(k)) continue;
    out[k] = stripMachine(c[k], k === 'settings');
  }
  return out;
}
// The merged portable config written back over this computer's config, keeping its own machine parts.
function applyPortable(local, portable) {
  const keep = (lv, pv, settings) => {
    if (isObj(lv) && isObj(pv)) {
      const out = {};
      for (const k of Object.keys(pv)) out[k] = keep(lv[k], pv[k], false);
      for (const k of Object.keys(lv)) {
        if (Object.prototype.hasOwnProperty.call(pv, k)) continue;
        if ((settings && MACHINE_SETTINGS.has(k)) || MACHINE_KEY.test(k) || MACHINE_FIELD.has(k) || absPath(lv[k])) out[k] = lv[k]; // this computer's own
      }
      return out;
    }
    // (round 35, twocomputers) a list with this computer's own paths in it (an AI's folders): the portable form never has
    // them, so they were dropped on every arrival (the Mac's folders gone after the PC synced); they stay now
    if (Array.isArray(lv) && Array.isArray(pv) && lv.some(absPath)) { const own = lv.filter(absPath); return [...pv.filter((x) => !own.includes(x)), ...own]; }
    if (Array.isArray(lv) && Array.isArray(pv) && keyed(lv) && keyed(pv)) {
      // agents: each keeps its own machine fields (an agent's file folder…)
      const L = keyed(lv);
      return pv.map((x) => { const k = keyOf(x); return L.has(k) ? keep(L.get(k), x, false) : x; });
    }
    return pv === undefined ? lv : pv;
  };
  const out = {};
  const l = local || {};
  for (const k of Object.keys(portable || {})) out[k] = keep(l[k], portable[k], k === 'settings');
  for (const k of Object.keys(l)) if (!(k in out) && MACHINE_TOP.has(k)) out[k] = l[k];
  // (round 56, fixes56) defaultsSeen (configsafe: the default agents the owner has had a say on) only ever grows: both
  // sides' together. A config from a computer still on a version before the move has none, and it used to drop this
  // computer's: a default agent the owner had removed then came back here once
  const seen = [...(Array.isArray(l.defaultsSeen) ? l.defaultsSeen : []), ...(Array.isArray(portable?.defaultsSeen) ? portable.defaultsSeen : [])].filter((x) => typeof x === 'string');
  if (Array.isArray(l.defaultsSeen) || Array.isArray(portable?.defaultsSeen)) out.defaultsSeen = [...new Set(seen)];
  return out;
}

// ---------- finding the cloud drive folders ----------
// env: { platform, home, env, exists(p), readdir(p) → names, readJson(p) }. Returns [{ id, label, root }].
function detectClouds(io) {
  const { platform, home, env = {} } = io;
  const P = platform === 'win32' ? path.win32 : path.posix;
  const found = [];
  const add = (id, label, root) => {
    if (!root) return;
    let ok = false;
    try { ok = io.exists(root); } catch { ok = false; }
    if (ok && !found.some((f) => fwd(f.root).toLowerCase() === fwd(root).toLowerCase())) found.push({ id, label, root });
  };
  const ls = (d) => { try { return io.readdir(d) || []; } catch { return []; } };
  const dropboxInfo = (file) => { try { const j = io.readJson(file); return [j?.personal?.path, j?.business?.path].filter(Boolean); } catch { return []; } };
  if (platform === 'darwin') {
    const cs = P.join(home, 'Library', 'CloudStorage');
    for (const d of ls(cs)) {
      if (/^Dropbox/.test(d)) add('dropbox', 'Dropbox', P.join(cs, d));
      if (/^GoogleDrive-/.test(d)) { const inner = ls(P.join(cs, d)).find((x) => /^(My Drive|Mon Drive|Meine Ablage|Mi unidad|Il mio Drive)$/.test(x)) || 'My Drive'; add('gdrive', `Google Drive (${d.slice(12)})`, P.join(cs, d, inner)); }
      if (/^OneDrive/.test(d)) add('onedrive', d.includes('-') ? `OneDrive (${d.split('-').slice(1).join('-')})` : 'OneDrive', P.join(cs, d));
    }
    for (const p of dropboxInfo(P.join(home, '.dropbox', 'info.json'))) add('dropbox', 'Dropbox', p);
    add('dropbox', 'Dropbox', P.join(home, 'Dropbox'));
    add('onedrive', 'OneDrive', P.join(home, 'OneDrive'));
    add('icloud', 'iCloud Drive', P.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
  } else if (platform === 'win32') {
    const up = env.USERPROFILE || home;
    for (const f of [env.LOCALAPPDATA && P.join(env.LOCALAPPDATA, 'Dropbox', 'info.json'), env.APPDATA && P.join(env.APPDATA, 'Dropbox', 'info.json')].filter(Boolean)) for (const p of dropboxInfo(f)) add('dropbox', 'Dropbox', p);
    add('dropbox', 'Dropbox', P.join(up, 'Dropbox'));
    for (const L of 'GHIJKLMNOPQRSTUVWXYZDEF') for (const n of ['My Drive', 'Mon Drive', 'Meine Ablage', 'Mi unidad']) add('gdrive', `Google Drive (${L}:)`, `${L}:\\${n}`);
    add('gdrive', 'Google Drive', P.join(up, 'Google Drive'));
    add('gdrive', 'Google Drive', P.join(up, 'My Drive'));
    for (const k of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) if (env[k]) add('onedrive', k === 'OneDriveCommercial' ? 'OneDrive (work)' : 'OneDrive', env[k]);
    add('onedrive', 'OneDrive', P.join(up, 'OneDrive'));
    add('icloud', 'iCloud Drive', P.join(up, 'iCloudDrive'));
    add('icloud', 'iCloud Drive', P.join(up, 'iCloud Drive'));
  } else {
    add('dropbox', 'Dropbox', P.join(home, 'Dropbox'));
    add('gdrive', 'Google Drive', P.join(home, 'Google Drive'));
    add('onedrive', 'OneDrive', P.join(home, 'OneDrive'));
  }
  return found;
}
// Which one to propose: a drive that already has Hearth in it (the newest), else Dropbox, Google Drive, OneDrive, iCloud.
const RANK = { dropbox: 0, gdrive: 1, onedrive: 2, icloud: 3 };
function proposeCloud(list) {
  return [...list].sort((a, b) => (b.hearth ? 1 : 0) - (a.hearth ? 1 : 0) || (b.hearth?.lastSeen || 0) - (a.hearth?.lastSeen || 0) || (RANK[a.id] ?? 9) - (RANK[b.id] ?? 9))[0] || null;
}

module.exports = {
  parseJson, watchIgnored,
  ignoredName, localOnly, dirLocalOnly, isJsonRel, isWorkspaceRel, HEAVY_DIRS, isCounterRel, MEDIA,
  eq, clone, merge3, keyOf,
  toCloud, fromCloud, strToCloud, strFromCloud, withExt, isWinPath,
  portableConfig, applyPortable, stripMachine,
  detectClouds, proposeCloud,
};
