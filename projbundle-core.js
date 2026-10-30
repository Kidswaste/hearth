// Project bundles (round 75, projbundle75): a whole project as ONE file, a .hearthproject, and a project copied in
// place. This is the model: no DOM, no IPC; it runs in the window (projbundle.js: gather, preview, apply), in the main
// process (projbundlemain.js: the streamed zip, the checks before anything is written) and in Node (dev/projbundle-test.js).
// The file is a plain zip (anything that opens zips can look inside):
//   manifest.json   what it is: the format and its version, the Hearth that made it (version, platform, when), the
//                   versions of the stores it carries, what's inside (counts, sizes), what was left out and why
//   project.json    the body: the project (name, look, status, notes, its items, its workspace), its scenes (code,
//                   layers, extras, references, notes, still, timeline cues), their sequences, its boards, its chats
//                   (when chosen), the worktable, the links between them (chat ↔ scene, chat ↔ board); every file it
//                   points at written as "hearthproject:<entry>"
//   assets/<n>/<name>          each file the JSON points at (textures, the song, board pictures, chat attachments)
//   files/<n>/<name>[/<rel>]   the project's own files, captures and renders (when chosen); a folder keeps its tree
// Safety: entry names are checked before anything is read (no "..", no absolute or drive paths, no backslashes, no
// control or Windows-reserved names, a depth cap: no zip-slip), sizes are capped (the file, each entry, the total once
// unpacked, the number of entries, the JSON, the deflate ratio: no zip bombs), the versions are checked (a newer format
// asks for ⬆ Update), the body's shape is checked (counts, code sizes, types) before the preview card shows. Nothing is
// ever imported over something that's there: every id is fresh (remap), files land in Hearth's own folder.
// Secrets never travel: keys named like secrets are dropped, strings that look like API keys are replaced (scrub), files
// that look like keys / credentials / dotfiles are never packed (secretFile), a chat's engine session is left out.
//   names:    FORMAT · VERSION · EXT · MANIFEST · BODY · TOKEN · LIMITS · STORES
//   guard:    entryOk(name) · checkEntries(entries, size) · checkManifest(m) · checkBody(b) · inside(root, t, pathMod)
//   paths:    isPathLike(s) · secretFile(p) · collectPaths(obj) · rewrite(obj, fn) · tokenOf / entryOfToken · methodFor
//   body:     scrub(obj) · prepare(body, { chats, files }) · parts(body) · summarize(body) · describe(manifest)
//   ids:      remap(body, { ids, suffix }) → { body, map, dropped } · canon(body) (deep compare minus ids, for checks)
const ProjBundleCore = (() => {
  const FORMAT = 'hearthproject';
  const VERSION = 1;
  const EXT = '.hearthproject';
  const MANIFEST = 'manifest.json';
  const BODY = 'project.json';
  const TOKEN = 'hearthproject:';
  const MB = 1048576;
  const GB = 1024 * MB;
  const LIMITS = {
    bundle: 64 * GB, // the .hearthproject file itself
    entry: 16 * GB, // one file inside, unpacked
    total: 80 * GB, // everything inside, unpacked
    entries: 50000, // files inside
    body: 256 * MB, // project.json (long chats are most of it)
    manifest: 4 * MB,
    ratio: 400, // unpacked ÷ packed for one deflated entry (deflate tops out near 1032:1 on zeros; real data is far below)
    name: 240, depth: 16, // an entry's name: characters, folders deep
    scenes: 500, layers: 128, code: 8 * MB, chats: 3000, boards: 300, items: 50000, sequences: 500, refs: 2000,
  };
  // the stores a bundle's parts come from, with the shape version this Hearth writes (a newer one on import: ⬆ Update)
  const STORES = { projects: 1, 'three-sketches': 1, 'three-lab-extras': 1, 'three-refs': 1, 'three-notes': 1, 'three-thumbs': 1, 'three-beatmaps': 1, 'video-cuts': 1, boards: 1, chats: 1, 'chat-scenes': 1, workbench: 1 };
  const KIND_ITEMS = ['file', 'capture', 'render', 'download']; // items that are files on disk (the optional "Files and captures")

  // ---------- small helpers ----------
  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const base = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
    if (n >= MB) return `${(n / MB).toFixed(n >= 100 * MB ? 0 : 1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  function walk(v, fn, key = '', depth = 0) {
    if (depth > 60) return v;
    if (typeof v === 'string') return fn(v, key);
    if (Array.isArray(v)) return v.map((x) => walk(x, fn, key, depth + 1));
    // (a key can be a path too: a song's beat map is kept under the song's path)
    if (isObj(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { const nk = k.length > 3 && /^(\/|[A-Za-z]:[\\/]|\\\\|file:|hearthproject:)/.test(k) ? fn(k, '') : k; o[nk || k] = walk(x, fn, k, depth + 1); } return o; }
    return v;
  }
  const rewrite = (obj, fn) => walk(obj, fn);

  // ---------- entry names (the zip-slip guard) ----------
  const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
  function entryOk(name) {
    if (typeof name !== 'string' || !name || name.length > LIMITS.name) return false;
    if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(name)) return false; // control characters, backslashes, drive colons, Windows-reserved characters
    if (name === MANIFEST || name === BODY) return true;
    const segs = name.split('/');
    if (!['assets', 'files'].includes(segs[0]) || segs.length < 3 || segs.length > LIMITS.depth) return false;
    if (!/^\d{1,6}$/.test(segs[1])) return false; // assets/<n>/…, files/<n>/…
    for (const s of segs.slice(2)) {
      if (!s || s === '.' || s === '..' || s.startsWith('.') || RESERVED.test(s) || /[ .]$/.test(s) || s.length > 160) return false;
    }
    return true;
  }
  // target sits inside root (both absolute; pathMod: Node's path, path.posix or path.win32)
  function inside(root, target, pathMod) {
    const rel = pathMod.relative(pathMod.resolve(root), pathMod.resolve(target));
    return Boolean(rel) && !rel.startsWith('..') && !pathMod.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..');
  }
  // every entry, checked before anything is read: → { ok, problems: [..], bytes (unpacked) }
  // entries: [{ name, method, flags, size, csize, offset }] (zipkit.entries)
  function checkEntries(entries, fileSize) {
    const problems = [];
    if (fileSize > LIMITS.bundle) problems.push(`The file is ${fmtSize(fileSize)}: the most Hearth opens is ${fmtSize(LIMITS.bundle)}.`);
    if (entries.length > LIMITS.entries) problems.push(`It holds ${entries.length} files: the most is ${LIMITS.entries}.`);
    const seen = new Set();
    let total = 0;
    for (const e of entries) {
      if (e.dir || String(e.name).endsWith('/')) { if (!entryOk(String(e.name).replace(/\/$/, '') + '/x')) problems.push(`"${String(e.name).slice(0, 80)}" isn't a name a project file may hold.`); continue; }
      if (!entryOk(e.name)) { problems.push(`"${String(e.name).slice(0, 80)}" isn't a name a project file may hold (it could write outside Hearth's folder).`); continue; }
      const k = e.name.normalize('NFC').toLowerCase();
      if (seen.has(k)) problems.push(`"${e.name}" is in it twice.`);
      seen.add(k);
      if (e.method !== 0 && e.method !== 8) problems.push(`"${e.name}" is packed in a way Hearth doesn't read.`);
      if (e.flags & 1) problems.push(`"${e.name}" is encrypted.`);
      if (!(e.size >= 0) || !(e.csize >= 0)) problems.push(`"${e.name}" has no size.`);
      if (e.size > LIMITS.entry) problems.push(`"${e.name}" is ${fmtSize(e.size)} unpacked: the most for one file is ${fmtSize(LIMITS.entry)}.`);
      if (e.method === 8 && e.size > e.csize * LIMITS.ratio + MB) problems.push(`"${e.name}" unpacks to far more than it weighs (a zip bomb?).`);
      if (e.method === 0 && e.size !== e.csize) problems.push(`"${e.name}" has two different sizes.`);
      if (e.offset + e.csize > fileSize) problems.push(`"${e.name}" runs past the end of the file.`);
      total += e.size;
    }
    if (total > LIMITS.total) problems.push(`Unpacked it would be ${fmtSize(total)}: the most is ${fmtSize(LIMITS.total)}.`);
    const man = entries.find((e) => e.name === MANIFEST);
    const body = entries.find((e) => e.name === BODY);
    if (!man || !body) problems.push('It has no manifest.json / project.json: not a Hearth project file.');
    if (man && man.size > LIMITS.manifest) problems.push('Its manifest.json is too big.');
    if (body && body.size > LIMITS.body) problems.push(`Its project.json is ${fmtSize(body.size)}: the most is ${fmtSize(LIMITS.body)}.`);
    return { ok: !problems.length, problems: [...new Set(problems)].slice(0, 8), bytes: total };
  }

  // ---------- the manifest ----------
  const PLATFORM = { darwin: 'a Mac', win32: 'Windows', linux: 'Linux' };
  // o: { name, app, version, platform, at, counts, bytes, leftOut, skipped, secrets }
  function makeManifest(o = {}) {
    return {
      format: FORMAT, v: VERSION, stores: { ...STORES },
      made: { app: o.app || 'Hearth', version: String(o.version || ''), platform: o.platform || '', at: o.at || Date.now() },
      name: String(o.name || 'Project').slice(0, 80), counts: o.counts || {}, bytes: Number(o.bytes) || 0, files: Number(o.files) || 0,
      leftOut: o.leftOut || {}, skipped: (o.skipped || []).slice(0, 200), secrets: Number(o.secrets) || 0,
    };
  }
  // → { ok, problems, m (cleaned) }
  function checkManifest(m) {
    const problems = [];
    if (!isObj(m) || m.format !== FORMAT) return { ok: false, problems: ['Not a Hearth project file (its manifest says something else).'], m: null };
    const v = Number(m.v);
    if (!(v >= 1)) problems.push('Its version is unknown.');
    else if (v > VERSION) problems.push(`It was made by a newer Hearth (project file version ${v}; this Hearth reads ${VERSION}): update Hearth (⬆ Update) to import it.`);
    for (const [k, sv] of Object.entries(isObj(m.stores) ? m.stores : {})) if (STORES[k] && Number(sv) > STORES[k]) problems.push(`Its ${k} data is from a newer Hearth: update Hearth (⬆ Update) to import it.`);
    const clean = { ...m, name: String(m.name || 'Project').replace(/[\u0000-\u001f]/g, '').slice(0, 80), skipped: Array.isArray(m.skipped) ? m.skipped.map(String).slice(0, 200) : [], leftOut: isObj(m.leftOut) ? m.leftOut : {}, counts: isObj(m.counts) ? m.counts : {} };
    return { ok: !problems.length, problems, m: clean };
  }
  function from(m) {
    const at = Number(m?.made?.at) || 0;
    const when = at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const plat = PLATFORM[m?.made?.platform] || '';
    return `Made with ${m?.made?.app || 'Hearth'}${m?.made?.version ? ` ${m.made.version}` : ''}${plat ? ` on ${plat}` : ''}${when ? ` · ${when}` : ''}`;
  }

  // ---------- the body's shape (before the preview card) ----------
  function checkBody(b) {
    const problems = [];
    if (!isObj(b) || !isObj(b.project)) return { ok: false, problems: ['Its project.json has no project in it.'] };
    const p = b.project;
    if (typeof p.name !== 'string') problems.push('The project has no name.');
    if (!Array.isArray(p.items) || p.items.length > LIMITS.items) problems.push('The project\'s list of things is missing or too long.');
    const arr = (k, max) => { if (b[k] != null && (!Array.isArray(b[k]) || b[k].length > max)) problems.push(`Its ${k} are broken or too many (the most is ${max}).`); return Array.isArray(b[k]) ? b[k] : []; };
    const scenes = arr('scenes', LIMITS.scenes); const chats = arr('chats', LIMITS.chats); const boards = arr('boards', LIMITS.boards); const seqs = arr('sequences', LIMITS.sequences); arr('files', LIMITS.items);
    for (const s of scenes) {
      const sk = s?.sketch;
      if (!isObj(sk) || typeof s.id !== 'string') { problems.push('A scene in it is empty.'); continue; }
      if (typeof (sk.code ?? '') !== 'string' || String(sk.code || '').length > LIMITS.code) problems.push(`"${String(sk.name).slice(0, 40)}" has code that's too big or not text.`);
      if (sk.layers != null && (!Array.isArray(sk.layers) || sk.layers.length > LIMITS.layers)) { problems.push(`"${String(sk.name).slice(0, 40)}" has broken layers or too many.`); continue; }
      for (const L of sk.layers || []) if (typeof (L?.code ?? '') !== 'string' || String(L?.code || '').length > LIMITS.code) problems.push(`A layer of "${String(sk.name).slice(0, 40)}" has code that's too big or not text.`);
      if (s.refs != null && (!Array.isArray(s.refs) || s.refs.length > LIMITS.refs)) problems.push(`"${String(sk.name).slice(0, 40)}" has broken references.`);
    }
    for (const c of chats) if (!isObj(c?.chat) || typeof c.id !== 'string' || !Array.isArray(c.chat.messages)) problems.push('A chat in it is broken.');
    for (const x of boards) if (!isObj(x?.board) || typeof x.id !== 'string' || !Array.isArray(x.board.items)) problems.push('A board in it is broken.');
    for (const q of seqs) if (!isObj(q?.edit) || typeof q.key !== 'string' || !q.key.startsWith('seq:')) problems.push('A sequence in it is broken.');
    return { ok: !problems.length, problems: [...new Set(problems)].slice(0, 8) };
  }

  // ---------- paths and secrets ----------
  const EXT_RE = /\.[A-Za-z0-9]{1,8}$/;
  // an absolute path to a file ("/Users/x/a.png", "C:\\x\\a.mp3", "\\\\server\\x.wav", "file:///…") with an extension
  function isPathLike(s) {
    if (typeof s !== 'string' || s.length < 4 || s.length > 1024 || /[\n\r\t]/.test(s)) return false;
    const p = s.replace(/^file:\/\/(localhost)?/i, '');
    if (!(/^\/[^/]/.test(p) || /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p))) return false;
    return EXT_RE.test(p);
  }
  // files that are never packed, whatever points at them: keys, credentials, dotfiles, Hearth's own secrets
  const SECRET_FILE = /(^\.|(^|[-_.])(secrets?|credentials?|tokens?|passwords?|keychain|keystore|id_rsa|id_ed25519|id_ecdsa)([-_.]|$)|\.(pem|key|p12|pfx|kdbx|keystore|jks|asc|gpg)$)/i;
  const secretFile = (p) => {
    const s = String(p || '').replace(/^file:\/\/(localhost)?/i, '');
    if (SECRET_FILE.test(base(s))) return true;
    return s.split(/[\\/]/).some((seg) => /^\.(ssh|gnupg|aws|azure|kube|docker|config\/gcloud)$/i.test(seg) || seg === '.git');
  };
  function collectPaths(obj) { const out = new Set(); walk(obj, (s) => { if (isPathLike(s) && !secretFile(s)) out.add(s); return s; }); return [...out]; }
  const tokenOf = (entry) => `${TOKEN}${entry}`;
  const entryOfToken = (s) => (typeof s === 'string' && s.startsWith(TOKEN) ? s.slice(TOKEN.length) : null);
  // already-compressed media (and anything big) is stored as it is; text-like files are deflated
  const STORE = /\.(png|jpe?g|webp|gif|avif|heic|ktx2|basis|mp3|m4a|aac|ogg|oga|opus|flac|mp4|m4v|mov|webm|mkv|avi|woff2?|glb|zip|7z|rar|gz|xz|bz2|usdz|hearthpack|hearthproject|pdf)$/i;
  const BIG = 16 * MB;
  const methodFor = (name, size = 0) => (STORE.test(name) || size >= BIG ? 0 : 8);

  // Secrets: keys named like secrets are dropped, strings that look like API keys replaced. → { value, count }
  const SECRET_KEY = /^(api[-_]?keys?|apikey|access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|bearer|token|secret|client[-_]?secret|password|passwd|pass|authorization|cookies?|session[-_]?(key|token|secret)|private[-_]?key)$/i;
  const SECRET_STR = /\b(sk-ant-[A-Za-z0-9_-]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|msy_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/g;
  function scrub(obj) {
    let count = 0;
    const go = (v, depth = 0) => {
      if (depth > 60) return v;
      if (typeof v === 'string') { if (!SECRET_STR.test(v)) return v; SECRET_STR.lastIndex = 0; return v.replace(SECRET_STR, () => { count += 1; return '[secret removed]'; }); }
      if (Array.isArray(v)) return v.map((x) => go(x, depth + 1));
      if (isObj(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { if (SECRET_KEY.test(k) && (typeof x === 'string' || isObj(x))) { count += 1; continue; } o[k] = go(x, depth + 1); } return o; }
      return v;
    };
    const value = go(obj);
    SECRET_STR.lastIndex = 0;
    return { value, count };
  }

  // ---------- the body ----------
  // What's left in the body once the owner chose (chats, files): chats out → the project's chat items and the links go;
  // files out → file / capture / render / download items go. Each chat's engine session, a reference's original path
  // (the other computer's folders), a make's link (local) never travel. → { body, leftOut: { chats, files }, secrets }
  function prepare(body, opts = {}) {
    const b = copy(body);
    const leftOut = shape(b, opts);
    const sc = scrub(b);
    return { body: sc.value, leftOut, secrets: sc.count };
  }
  // (round 89, desk89) prepare's middle, on its own copy b (changed in place) → leftOut: the same steps for prepare()
  // above and for the export's prepare in slices (prepslice-core.js), so both leave out exactly the same
  function shape(b, { chats = true, files = true } = {}) {
    const leftOut = {};
    const p = b.project;
    delete p.make; delete p.mkName; delete p.trash;
    if (!chats) {
      const n = (b.chats || []).length || p.items.filter((x) => x.type === 'chat').length;
      if (n) leftOut.chats = n;
      b.chats = [];
      p.items = p.items.filter((x) => x.type !== 'chat');
      if (p.workspace) delete p.workspace.chatId;
    }
    if (!files) {
      const n = p.items.filter((x) => KIND_ITEMS.includes(x.type)).length;
      if (n) leftOut.files = n;
      p.items = p.items.filter((x) => !KIND_ITEMS.includes(x.type));
      b.files = [];
    }
    if (p.cover && !p.items.some((x) => x.id === p.cover)) p.cover = null;
    for (const c of b.chats || []) { if (c.chat) { c.chat.session = {}; delete c.chat.lastReply; delete c.chat.pending; } }
    for (const s of b.scenes || []) for (const r of s.refs || []) delete r.src;
    return leftOut;
  }
  // the parts whose files are packed, for the export card's sizes: the base (scenes, boards, worktable), the chats
  // (attachments), the files (the project's file / capture / render / download items: { path, dir? } each)
  function parts(body) {
    const b = body || {};
    const baseObj = { project: { ...b.project, items: (b.project?.items || []).filter((x) => !KIND_ITEMS.includes(x.type)) }, scenes: b.scenes, sequences: b.sequences, boards: b.boards, workbench: b.workbench };
    return { base: collectPaths(baseObj), chats: collectPaths(b.chats || []), files: (b.files || []).filter((f) => f && f.path && !secretFile(f.path)).map((f) => ({ path: f.path, dir: Boolean(f.dir) })) };
  }
  const chatBytes = (body) => (body?.chats || []).reduce((n, c) => n + JSON.stringify(c).length, 0);
  // counts for the cards
  function summarize(body) {
    const b = body || {};
    const items = b.project?.items || [];
    const count = (t) => items.filter((x) => x.type === t).length;
    const layers = (b.scenes || []).reduce((n, s) => n + (s.sketch?.layers?.length || 1), 0);
    const refs = (b.scenes || []).reduce((n, s) => n + (s.refs || []).length, 0);
    const notes = (b.scenes || []).reduce((n, s) => n + (s.notes || []).length, 0);
    const messages = (b.chats || []).reduce((n, c) => n + (c.chat?.messages?.length || 0), 0);
    return { scenes: (b.scenes || []).length, layers, refs, sceneNotes: notes, sequences: (b.sequences || []).length, boards: (b.boards || []).length, chats: (b.chats || []).length, messages, files: (b.files || []).length, captures: count('capture'), renders: count('render'), notes: Boolean(b.project?.notes), worktable: b.workbench != null };
  }
  // plain lines for the import card: what will be added
  function describe(m, s = m?.counts || {}) {
    const lines = [];
    const sc = [s.scenes ? `${plural(s.scenes, 'scene')} (${plural(s.layers || s.scenes, 'layer')}${s.refs ? `, ${plural(s.refs, 'reference')}` : ''})` : '', s.sequences ? plural(s.sequences, 'sequence') : '', s.boards ? plural(s.boards, 'board') : ''].filter(Boolean);
    lines.push(sc.length ? sc.join(' · ') : 'No scenes or boards');
    lines.push(s.chats ? `${plural(s.chats, 'chat')} (${plural(s.messages || 0, 'message')})` : m?.leftOut?.chats ? `Chats left out when it was saved (${m.leftOut.chats})` : 'No chats');
    const f = (s.files || 0);
    lines.push(f ? `${plural(f, 'file')} and captures${m?.bytes ? ` · ${fmtSize(m.bytes)} in all` : ''}` : m?.leftOut?.files ? `Files and captures left out when it was saved (${m.leftOut.files})` : `${m?.files ? `${plural(m.files, 'file')} it uses · ${fmtSize(m.bytes)}` : 'No files'}`);
    if (s.notes || s.sceneNotes) lines.push(['Project notes', s.sceneNotes ? plural(s.sceneNotes, 'scene note') : ''].filter(Boolean).join(' · '));
    if (m?.secrets) lines.push(`${plural(m.secrets, 'secret')} (API keys, tokens) ${m.secrets === 1 ? 'was' : 'were'} removed when it was saved`);
    if ((m?.skipped || []).length) lines.push(`${plural(m.skipped.length, 'file')} weren't on the computer it came from: ${m.skipped.slice(0, 3).join(', ')}${m.skipped.length > 3 ? '…' : ''}`);
    return lines;
  }

  // ---------- fresh ids ----------
  // ids: { project(), scene(old), board(old), chat(old, agentId), ref(), note(), seqKey(name) } (the window passes
  // makers that check what exists; the defaults are unique enough for tests). suffix: added to the project, scene and
  // board names (" copy" for Duplicate). The bundle's own ids never reach the stores: every one is mapped.
  // → { body, map: { project, scene: Map, board: Map, chat: Map }, dropped: [plain lines] }
  let seqN = 0;
  const rid = (p) => `${p}${Date.now().toString(36)}${(seqN++ % 46656).toString(36).padStart(3, '0')}${Math.floor(Math.random() * 1296).toString(36)}`;
  const DEFAULT_IDS = { project: () => rid('pj'), scene: () => rid('s'), board: () => rid('b'), chat: (_old, agentId) => `${agentId || 'chat'}-${rid('')}`, ref: () => rid('r'), note: () => rid('n'), seqKey: (name) => `seq:${name}` };
  function remap(body, { ids = {}, suffix = '' } = {}) {
    const I = { ...DEFAULT_IDS, ...ids };
    const b = copy(body);
    const dropped = [];
    const map = { project: null, scene: new Map(), board: new Map(), chat: new Map() };
    const p = b.project;
    const oldPid = p.id;
    map.project = I.project();
    p.id = map.project;
    if (suffix) p.name = `${String(p.name || 'Project').slice(0, 48 - suffix.length)}${suffix}`;
    for (const s of b.scenes || []) { const n = I.scene(s.id); map.scene.set(s.id, n); s.id = n; if (s.sketch) { s.sketch.id = n; if (suffix) s.sketch.name = `${s.sketch.name || 'Scene'}${suffix}`; } }
    for (const x of b.boards || []) { const n = I.board(x.id); map.board.set(x.id, n); x.id = n; if (x.board) { x.board.id = n; if (suffix) x.board.name = `${String(x.board.name || 'Board').slice(0, 60 - suffix.length)}${suffix}`; } }
    for (const c of b.chats || []) {
      const agentId = c.chat?.agentId || c.agent?.id || '';
      const wasWorkspace = Boolean(oldPid && c.id === `${c.agent?.id || agentId}-project-${oldPid}`);
      const n = wasWorkspace ? `${agentId}-project-${map.project}` : I.chat(c.id, agentId);
      map.chat.set(c.id, n); c.id = n;
      if (c.chat) c.chat.id = n;
    }
    const sMap = (id) => map.scene.get(id) || null; const cMap = (id) => map.chat.get(id) || null; const bMap = (id) => map.board.get(id) || null;
    // the scenes' own parts
    for (const s of b.scenes || []) {
      for (const r of s.refs || []) r.id = I.ref(r.id);
      for (const nt of s.notes || []) if (nt && typeof nt === 'object') nt.id = I.note(nt.id);
      if (isObj(s.maps)) { const m2 = {}; for (const [k, v] of Object.entries(s.maps)) { const mm = /^scene:(.+)$/.exec(k); m2[mm ? `scene:${sMap(mm[1]) || mm[1]}` : k] = v; } s.maps = m2; }
    }
    // sequences: their scene and the scene clips follow; a clip of a scene outside the project stays as it was
    const keep = [];
    for (const q of b.sequences || []) {
      const sc = sMap(q.edit?.seq?.scene);
      if (!sc) { dropped.push(`A sequence (${String(q.key).slice(4, 44)}) whose scene isn't in the project`); continue; }
      q.edit.seq = { ...q.edit.seq, scene: sc };
      q.edit.clips = (q.edit.clips || []).map((cl) => (cl?.kind === 'scene' && sMap(cl.sketch) ? { ...cl, sketch: sMap(cl.sketch) } : cl));
      const nm = `${String(q.key).slice(4) || 'Sequence'}${suffix}`;
      q.key = I.seqKey(nm);
      if (q.edit.seq.name != null) q.edit.seq.name = q.key.slice(4);
      keep.push(q);
    }
    b.sequences = keep;
    // boards: the chats they're linked to
    for (const x of b.boards || []) if (x.board) x.board.chats = (x.board.chats || []).map(cMap).filter(Boolean);
    // chats: their links, where they came from
    for (const c of b.chats || []) {
      if (c.scene) c.scene = sMap(c.scene);
      if (c.board) c.board = bMap(c.board);
      if (c.chat) { c.chat.session = {}; if (c.chat.contextFrom) { const m = cMap(c.chat.contextFrom); if (m) c.chat.contextFrom = m; else delete c.chat.contextFrom; } }
    }
    // the project's items and workspace
    const items = [];
    for (const x of p.items || []) {
      let ref = x.ref;
      if (x.type === 'scene' || x.type === 'seq') ref = sMap(x.ref);
      else if (x.type === 'board') ref = bMap(x.ref);
      else if (x.type === 'chat') ref = cMap(x.ref);
      if (ref == null) { dropped.push(`${x.type === 'seq' ? 'A sequence' : `A ${x.type}`}${x.name ? ` (${String(x.name).slice(0, 40)})` : ''} that wasn't in the file`); continue; }
      items.push({ ...x, ref, id: `${x.type}:${ref}` });
    }
    const coverOld = p.cover && (p.items || []).find((x) => x.id === p.cover);
    p.items = items;
    p.cover = coverOld ? (items.find((x) => x.type === coverOld.type && (x.type === 'scene' || x.type === 'seq' ? x.ref === sMap(coverOld.ref) : x.type === 'board' ? x.ref === bMap(coverOld.ref) : x.type === 'chat' ? x.ref === cMap(coverOld.ref) : x.ref === coverOld.ref))?.id || null) : null;
    if (isObj(p.workspace)) {
      const w = p.workspace;
      if (w.chatId) { const m = cMap(w.chatId); if (m) w.chatId = m; else delete w.chatId; }
      if (w.sceneId) { const m = sMap(w.sceneId); if (m) w.sceneId = m; else delete w.sceneId; }
      if (w.boardId) { const m = bMap(w.boardId); if (m) w.boardId = m; else delete w.boardId; }
      delete w.importedAt;
    }
    return { body: b, map, dropped };
  }

  // ---------- deep compare minus ids (checks) ----------
  // ids become their role and place ("scene#0"), paths their file name, the moments that only say "when this copy was
  // made" go: two bodies that are the same project give the same canon.
  // (any absolute path, a folder too: canon only)
  const absLike = (s) => typeof s === 'string' && s.length < 1024 && !/[\n\r\t]/.test(s) && (/^\/[^/]/.test(s) || /^[A-Za-z]:[\\/]/.test(s) || /^\\\\[^\\]/.test(s) || /^file:\/\//i.test(s));
  const VOLATILE = new Set(['opened', 'updated', 'session', 'lastReply', 'pending', 'importedAt', 'at']);
  function canon(body, { volatile = VOLATILE } = {}) {
    const b = copy(body);
    const names = new Map();
    const name = (id, role) => { if (id != null && id !== '' && !names.has(String(id))) names.set(String(id), `${role}#${names.size}`); };
    // numbered in an order that doesn't depend on the ids: by what each thing is (names, code, sizes)
    const by = (xs, key) => (xs || []).slice().sort((x, y) => { const a = key(x); const z = key(y); return a < z ? -1 : a > z ? 1 : 0; });
    name(b.project?.id, 'project');
    by(b.scenes, (s) => `${s.sketch?.name}\u0001${s.sketch?.code || ''}\u0001${JSON.stringify(s.sketch?.layers || []).length}`).forEach((s) => name(s.id, 'scene'));
    by(b.boards, (x) => `${x.board?.name}\u0001${(x.board?.items || []).length}`).forEach((x) => name(x.id, 'board'));
    by(b.chats, (c) => `${c.chat?.title}\u0001${c.chat?.createdAt}\u0001${(c.chat?.messages || []).length}`).forEach((c) => name(c.id, 'chat'));
    by(b.scenes, (s) => `${s.sketch?.name}\u0001${s.sketch?.code || ''}`).forEach((s) => { by(s.refs, (r) => `${r.key}\u0001${r.name}`).forEach((r) => name(r.id, 'ref')); by(s.notes, (n) => `${n?.t}\u0001${n?.text}`).forEach((n) => name(n?.id, 'note')); });
    by(b.sequences, (q) => String(q.key)).forEach((q) => name(q.key, 'seq'));
    const ids = [...names.keys()].sort((x, y) => y.length - x.length);
    const swap = (s) => {
      if (names.has(s)) return names.get(s);
      if (absLike(s) || entryOfToken(s) != null) return `file:${base(entryOfToken(s) ?? s)}`;
      const ref = /^(chat|scene|seq|board):(.+)$/.exec(s); // a project item's id: its kind and its thing
      if (ref && names.has(ref[2])) return `${ref[1]}:${names.get(ref[2])}`;
      const it = /^(file|capture|render|download):(.+)$/.exec(s); // a project item's id: its kind and its file
      if (it && (absLike(it[2]) || entryOfToken(it[2]) != null)) return `${it[1]}:file:${base(entryOfToken(it[2]) ?? it[2])}`;
      let out = s;
      for (const id of ids) if (id.length >= 4 && out.includes(id)) out = out.split(id).join(names.get(id));
      return out;
    };
    const go = (v, depth = 0) => {
      if (depth > 60) return v;
      if (typeof v === 'string') return swap(v);
      if (Array.isArray(v)) return v.map((x) => go(x, depth + 1));
      if (isObj(v)) { const o = {}; for (const k of Object.keys(v).sort()) { if (volatile.has(k)) continue; const nk = swap(k); o[nk] = go(v[k], depth + 1); } return o; }
      return v;
    };
    // the order of things doesn't matter: each list by its canon
    const sortBy = (xs) => (Array.isArray(xs) ? xs.slice().sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)) : xs);
    const c = go(b);
    for (const k of ['scenes', 'boards', 'chats', 'sequences', 'files']) if (c[k]) c[k] = sortBy(c[k]);
    if (c.project?.items) c.project.items = sortBy(c.project.items);
    return c;
  }

  return { FORMAT, VERSION, EXT, MANIFEST, BODY, TOKEN, LIMITS, STORES, KIND_ITEMS, BIG, fmtSize, plural, base, copy, walk, rewrite, entryOk, inside, checkEntries, makeManifest, checkManifest, from, checkBody, isPathLike, secretFile, collectPaths, tokenOf, entryOfToken, methodFor, scrub, prepare, shape, SECRET_KEY, SECRET_STR, isObj, parts, chatBytes, summarize, describe, remap, canon };
})();
if (typeof module !== 'undefined') module.exports = ProjBundleCore;
