// Two computers, the pure parts (round 35, twocomputers): no files, no Electron, no window. Loaded as a plain script in
// the window (TwoCore) and required by twocomputersmain.js and dev/twocomputers-test.js.
//
// The owner uses Hearth on a Mac and on a Windows PC with sync. A path only means something on the computer that wrote
// it, so:
//   · Paths have a portable form: "@home/Projects/site" (inside the home folder), "@data/…" (inside Hearth's data
//     folder), "@cloud/…" (inside the drive sync uses) and "@icloud/…", "@dropbox/…", "@gdrive/…", "@onedrive/…"
//     (inside a cloud drive found on this computer: iCloud Drive lives in ~/Library/Mobile Documents/… on the Mac but
//     in C:\Users\…\iCloudDrive on the PC). Not sync-merge.js' own "hearth-home:/…" tokens: sync expands those to
//     this computer's absolute paths on arrival, and an absolute path never travels in a portable config. Sync's
//     forms are still read (fromPortable).
//   · A path written the other computer's way (C:\… on the Mac, /Users/… on Windows) is "foreign": never used as it is
//     (on Windows "/Users/x" would quietly become C:\Users\x, on the Mac "D:\Work" a relative name).
//   · An AI's folders (agent.fileAccess.folders, absolute) stay on each computer (sync-merge.js applyPortable keeps
//     them); what travels is agent.fileAccess.computers = { <machine id>: { os, name, at, folders: [{ name, rel, on }],
//     skip: [key], matched: { otherKey: ownKey } } }, written by each computer for itself only, with no absolute path
//     in it. The other computer maps them on load: a folder found at the same portable place is used (the same folder),
//     anything else waits for one click ("Pick this folder on this computer"); never a guess by name.
//   · Media (Lab songs, footage) are found again by their portable place, then by content: a quick hash (sha1 of the
//     size + the first and last MiB) and the size, in the usual media folders (relink()).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TwoCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const isWinForm = (p) => typeof p === 'string' && (/^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p) || /^\\\\[?.]\\/.test(p));
  const isPosixForm = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
  const fwd = (s) => String(s).replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\[?.]\\/, '').replace(/\\/g, '/');
  const trim = (s) => { const f = fwd(s); return f.length > 1 ? f.replace(/\/+$/, '') : f; };
  const nfc = (s) => (s.normalize ? s.normalize('NFC') : s);

  // ---------- which computer ----------
  const osOf = (platform) => (platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux');
  const KIND = { mac: 'Mac', win: 'Windows PC', linux: 'Linux computer' };
  // "Mac (Quentin's MacBook Pro)", "Windows PC (QUENT-PC)"
  function computerLabel(m) {
    const kind = KIND[m?.os || osOf(m?.platform)] || 'computer';
    const name = String(m?.name || '').replace(/\.local$/i, '').trim();
    return name ? `${kind} (${name})` : kind;
  }
  const shortLabel = (m) => KIND[m?.os || osOf(m?.platform)] || 'computer'; // "your Windows PC"

  // A path that can't belong to this computer: written the other computer's way.
  function foreign(p, platform) {
    if (typeof p !== 'string' || !p) return false;
    const s = /^file:/i.test(p) ? p.replace(/^file:\/\/(localhost)?/i, '').replace(/^\/([A-Za-z]:)/, '$1') : p;
    return platform === 'win32' ? isPosixForm(s) : isWinForm(s);
  }
  const usable = (list, platform) => (Array.isArray(list) ? list.filter((f) => typeof f === 'string' && f && !foreign(f, platform)) : []);

  // ---------- portable forms ----------
  // roots: { platform, home, data, cloud (sync's drive root), drives: [{ id: 'icloud' | 'dropbox' | …, root }] }
  function rootsList(roots) {
    const out = [];
    const add = (token, dir) => { if (dir) out.push({ token, dir: trim(dir), ci: roots.platform === 'win32' || isWinForm(dir) }); };
    add('data', roots.data);
    add('cloud', roots.cloud);
    for (const d of roots.drives || []) if (d && d.id && d.root && !out.some((o) => o.token === d.id)) add(String(d.id).replace(/[^a-z]/gi, '').toLowerCase(), d.root);
    add('home', roots.home);
    return out.sort((a, b) => b.dir.length - a.dir.length); // the most precise first (data and the drives are inside home)
  }
  // "/Users/q/Projects/site" → "@home/Projects/site"; null when it is in none of them (another disk…)
  const PORT = /^@([a-z]+)\/(.*)$/s;
  function toPortable(abs, roots) {
    if (typeof abs !== 'string' || !abs) return null;
    if (PORT.test(abs)) return abs;
    const sm = /^hearth-([a-z]+):\/(.*)$/s.exec(abs); if (sm) return `@${sm[1]}/${sm[2]}`;
    const f = nfc(trim(abs));
    for (const r of rootsList(roots)) {
      const head = f.slice(0, r.dir.length);
      if (!(r.ci ? head.toLowerCase() === nfc(r.dir).toLowerCase() : head === nfc(r.dir))) continue;
      const rest = f.slice(r.dir.length);
      if (rest && rest[0] !== '/') continue;
      return `@${r.token}/${rest.replace(/^\/+/, '')}`;
    }
    return null;
  }
  // the other way: this computer's path, or null when this computer has no such place (no iCloud Drive here…)
  function fromPortable(rel, roots) {
    const m = PORT.exec(String(rel || '')) || /^hearth-([a-z]+):\/(.*)$/s.exec(String(rel || ''));
    if (!m) return null;
    const r = rootsList(roots).find((x) => x.token === m[1]);
    if (!r) return null;
    const win = roots.platform === 'win32';
    const base = win ? r.dir.replace(/\//g, '\\') : r.dir;
    const rest = m[2].split('/').filter((x) => x && x !== '.' && x !== '..'); // never climbs out of its root
    return rest.length ? `${base.replace(/[\\/]+$/, '')}${win ? '\\' : '/'}${rest.join(win ? '\\' : '/')}` : base;
  }
  const kindOf = (rel) => (/^@([a-z]+)\//.exec(String(rel || '')) || [])[1] || null;
  const DRIVE = { icloud: 'iCloud Drive', dropbox: 'Dropbox', gdrive: 'Google Drive', onedrive: 'OneDrive', cloud: 'your cloud drive', data: 'Hearth\'s data folder' };
  function baseName(p) { const f = trim(p); return f.split(/[\\/]/).pop() || f; }
  // plain words for where a folder is, without an absolute path (those never travel): "~/Projects/site",
  // "iCloud Drive/Work", "the D: drive", "the disk Work", "outside the home folder"
  function whereText(abs, roots) {
    const rel = toPortable(abs, roots);
    if (rel) {
      const k = kindOf(rel); const rest = rel.replace(/^@[a-z]+\//, '');
      if (k === 'home') return rest ? `~/${rest}` : 'the home folder';
      return rest ? `${DRIVE[k] || k}/${rest}` : DRIVE[k] || k;
    }
    const f = trim(abs);
    const d = /^([A-Za-z]):/.exec(f); if (d) return `the ${d[1].toUpperCase()}: drive`;
    if (/^\/\//.test(f)) return `the network share ${f.split('/')[2] || ''}`.trim();
    const v = /^\/Volumes\/([^/]+)/.exec(f); if (v) return `the disk ${v[1]}`;
    return 'outside the home folder';
  }

  // ---------- an AI's folders on each computer ----------
  const keyOf = (f) => (f.rel ? f.rel : `name:${String(f.name || '').toLowerCase()}|${f.on || ''}`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const recOf = (abs, roots) => ({ name: baseName(abs), rel: toPortable(abs, roots), on: whereText(abs, roots) });
  // This computer's entry, brought up to date with its folders. A folder that was listed before and is gone now was
  // taken out here on purpose: when it stood for another computer's folder, that one is skipped here from now on (so
  // it isn't mapped back by itself). → { fa, changed }
  function recordHere(fa, me, roots, now = Date.now()) {
    const a = fa && typeof fa === 'object' ? fa : {};
    const comps = a.computers && typeof a.computers === 'object' ? a.computers : {};
    const prev = comps[me.id] || null;
    const folders = usable(a.folders, roots.platform).map((f) => recOf(f, roots));
    const keys = new Set(folders.map(keyOf));
    let skip = (prev?.skip || []).slice();
    const matched = { ...(prev?.matched || {}) };
    const others = Object.entries(comps).filter(([id]) => id !== me.id).flatMap(([, c]) => (c?.folders || []).map(keyOf));
    for (const f of prev?.folders || []) {
      const k = keyOf(f);
      if (keys.has(k)) continue;
      for (const [o, own] of Object.entries(matched)) if (own === k) { delete matched[o]; if (!skip.includes(o)) skip.push(o); }
      if (others.includes(k) && !skip.includes(k)) skip.push(k);
    }
    // a folder added back here clears its skip
    skip = skip.filter((k) => !keys.has(k) && !Object.values(matched).includes(k)).slice(-40);
    for (const [o, own] of Object.entries(matched)) if (!keys.has(own)) delete matched[o];
    const entry = { os: me.os || osOf(me.platform), name: me.name || '', folders, ...(skip.length ? { skip } : {}), ...(Object.keys(matched).length ? { matched } : {}) };
    const was = prev ? { ...prev } : null; if (was) delete was.at;
    if (was && same(was, entry)) return { fa: a, changed: false };
    return { fa: { ...a, computers: { ...comps, [me.id]: { ...entry, at: now } } }, changed: true };
  }
  // The other computers' folders this one doesn't have yet → [{ key, name, on, rel, from, fromId, here, how }]
  //   how 'same'    found at the same portable place here (the same folder: inside the home folder, a cloud drive or
  //                 Hearth's data): used without asking
  //   how 'ask'     the whole home folder / a whole drive: asks first (it was a warned choice over there too)
  //   how 'missing' not here at that place (another disk, a folder only that computer has): one click to pick it
  function pendingHere(fa, me, roots, exists) {
    const a = fa || {};
    const comps = a.computers || {};
    const own = comps[me.id] || {};
    const have = new Set([...usable(a.folders, roots.platform).map((f) => keyOf(recOf(f, roots))), ...(own.skip || []), ...Object.keys(own.matched || {})]);
    const out = [];
    const list = Object.entries(comps).filter(([id]) => id !== me.id).sort((x, y) => (y[1]?.at || 0) - (x[1]?.at || 0));
    for (const [id, c] of list) {
      for (const f of c?.folders || []) {
        const key = keyOf(f);
        if (have.has(key) || out.some((o) => o.key === key)) continue;
        const here = f.rel ? fromPortable(f.rel, roots) : null;
        const found = Boolean(here && exists(here));
        const whole = /^@[a-z]+\/$/.test(f.rel || '');
        out.push({ key, name: f.name || '', on: f.on || '', rel: f.rel || null, from: computerLabel(c), fromKind: shortLabel(c), fromId: id, here: found ? here : null, how: found ? (whole ? 'ask' : 'same') : 'missing' });
      }
    }
    return out;
  }
  // a folder picked here for another computer's folder: remembered on this computer's entry
  function matchHere(fa, me, otherKey, pickedAbs, roots, now = Date.now()) {
    const a = { ...(fa || {}) };
    const folders = [...new Set([...(a.folders || []), pickedAbs])].slice(0, 12);
    const r = recordHere({ ...a, folders }, me, roots, now);
    const entry = { ...r.fa.computers[me.id] };
    entry.matched = { ...(entry.matched || {}), [otherKey]: keyOf(recOf(pickedAbs, roots)) };
    if (entry.skip) entry.skip = entry.skip.filter((k) => k !== otherKey);
    return { ...r.fa, computers: { ...r.fa.computers, [me.id]: { ...entry, at: now } } };
  }
  function skipHere(fa, me, otherKey, now = Date.now()) {
    const a = fa || {};
    const comps = a.computers || {};
    const entry = { ...(comps[me.id] || { os: me.os || osOf(me.platform), name: me.name || '', folders: [] }) };
    entry.skip = [...new Set([...(entry.skip || []), otherKey])].slice(-40);
    return { ...a, computers: { ...comps, [me.id]: { ...entry, at: now } } };
  }

  // ---------- media found again ----------
  const QH_PART = 1 << 20; // the quick hash reads the first and the last MiB
  // where a file is looked for, best first: as it is (not foreign), its portable place, this computer's own link (a
  // relink or "Find this file" made here before), the same name in the usual media folders (then its size and quick
  // hash must match, when they are known)
  //   ref: { path, rel?, hash?, size?, name? } · io: { roots, platform, exists(p), statSize(p), hashOf(p) (async),
  //   links: { [key]: path } (this computer's, by hash and by path), list(dir, depth) → [paths] (files by name) }
  async function relink(ref, io) {
    const r = typeof ref === 'string' ? { path: ref } : { ...(ref || {}) };
    const tried = new Set();
    const name = r.name || (r.path ? baseName(r.path) : '');
    const sizeOk = (p) => (r.size == null ? true : io.statSize(p) === r.size);
    const hashOk = async (p) => (r.hash ? (await io.hashOf(p).catch(() => null)) === r.hash : true);
    const good = async (p, strict) => {
      if (!p || tried.has(p)) return false;
      tried.add(p);
      if (foreign(p, io.platform) || !io.exists(p)) return false;
      if (!strict) return true;
      return sizeOk(p) && hashOk(p);
    };
    const links = io.links || {};
    if (r.path && await good(r.path, false)) return { path: r.path, how: 'here' };
    if (r.hash && links[`h:${r.hash}`] && await good(links[`h:${r.hash}`], true)) return { path: links[`h:${r.hash}`], how: 'link' };
    if (r.path && links[`p:${trim(r.path).toLowerCase()}`] && await good(links[`p:${trim(r.path).toLowerCase()}`], false)) return { path: links[`p:${trim(r.path).toLowerCase()}`], how: 'link' };
    const rel = r.rel || null;
    const mapped = rel ? fromPortable(rel, io.roots) : null;
    // the same portable place: the file is expected to be the same, but a hash known and different says otherwise
    if (mapped && await good(mapped, Boolean(r.hash))) return { path: mapped, how: kindOf(rel) === 'home' ? 'home' : 'drive' };
    if (!name || (!r.hash && r.size == null)) return null; // a name alone is never enough: "Find this file"
    const dirs = mediaDirs(io.roots);
    const lc = nfc(name).toLowerCase();
    let sameSize = [];
    for (const d of dirs) {
      let files = [];
      try { files = await io.list(d, 4); } catch { files = []; }
      for (const f of files) {
        if (nfc(baseName(f)).toLowerCase() === lc) { if (await good(f, true)) return { path: f, how: 'found' }; } else if (r.hash && r.size != null && sameSize.length < 40 && io.statSize(f) === r.size) sameSize.push(f);
      }
    }
    // renamed: the same content under another name (only with a hash to prove it)
    for (const f of sameSize) if (await good(f, true)) return { path: f, how: 'found' };
    return null;
  }
  // the usual places for songs, footage and pictures on this computer (folders that don't exist are skipped by list())
  function mediaDirs(roots) {
    const win = roots.platform === 'win32';
    const j = (a, ...b) => `${String(a).replace(/[\\/]+$/, '')}${win ? '\\' : '/'}${b.join(win ? '\\' : '/')}`;
    const out = [];
    if (roots.data) for (const d of ['attachments', 'assets', 'refs', 'renders', 'captures', 'board', 'media']) out.push(j(roots.data, d));
    if (roots.cloud) out.push(j(roots.cloud, 'Hearth', 'files'));
    for (const d of roots.drives || []) if (d?.root) out.push(d.root);
    if (roots.home) for (const d of ['Music', 'Movies', 'Videos', 'Downloads', 'Desktop', 'Documents', 'Pictures']) out.push(j(roots.home, d));
    return [...new Set(out)];
  }
  // this computer's own links (kv media-here, never synced): a file found or picked here, by hash and by the path asked
  function linkHere(links, ref, found) {
    const out = { ...(links || {}) };
    if (ref?.hash) out[`h:${ref.hash}`] = found;
    if (ref?.path) out[`p:${trim(ref.path).toLowerCase()}`] = found;
    const keys = Object.keys(out);
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete out[k];
    return out;
  }

  // ---------- the welcome note on a new computer ----------
  // What needs a click here after the first sync: folders to pick (per AI), the AIs to check (engines and sign-ins
  // are this computer's own), missing media. → [{ kind, text, n }]
  function welcomeList({ pending = [], agents = [], media = 0 } = {}) {
    const out = [];
    const pick = pending.filter((p) => p.how !== 'same');
    if (pick.length) out.push({ kind: 'folders', n: pick.length, text: `${pick.length} folder${pick.length === 1 ? '' : 's'} your AIs use on ${pick[0].fromKind === 'Mac' ? 'your Mac' : `your ${pick[0].fromKind}`}: pick ${pick.length === 1 ? 'it' : 'them'} on this computer` });
    const natives = agents.filter((a) => a && (a.engine === 'claude' || a.engine === 'codex') && !a.dock);
    if (natives.length) out.push({ kind: 'check', n: natives.length, text: `Check ${natives.map((a) => a.name).slice(0, 3).join(' and ')}${natives.length > 3 ? ' and the others' : ''} here: each computer has its own copy and sign-in` });
    if (media) out.push({ kind: 'media', n: media, text: `${media} song${media === 1 ? '' : 's'} or video${media === 1 ? '' : 's'} in your scenes ${media === 1 ? 'isn\'t' : 'aren\'t'} on this computer yet: "Find this file" when a scene asks` });
    return out;
  }

  return { osOf, computerLabel, shortLabel, foreign, usable, isWinForm, isPosixForm, toPortable, fromPortable, kindOf, whereText, baseName,
    keyOf, recordHere, pendingHere, matchHere, skipHere, relink, mediaDirs, linkHere, welcomeList, QH_PART };
}));
