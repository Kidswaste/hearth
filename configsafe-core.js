// 🛡 Your settings live in your data folder (round 55, configsafe). Plain Node, no Electron (tests use it as is).
// config.json and theme.css are files git tracks: an update had to put the owner's copies in a stash while it merged,
// and round 53 → 54 left them there (the Lab's Three Director, its chats out of the Lab: labchats54). Now the owner's
// copies live in the data folder, which updates never touch, and the tracked files are read-only defaults:
//   data/config.json   the owner's settings, agents and look (a whole config; Settings, the agent editor, sync,
//                      Recover and the backups read and write this one)
//   data/theme.css     the owner's own CSS
//   config.json / theme.css (next to main.js)  the repo's defaults: read, never written by Hearth again
// What Hearth uses = the owner's config + what the defaults have that it lacks (effective(): agents join by id, the
// owner's values win, a default agent the owner removed stays removed: defaultsSeen).
//   paths(appDir, dataDir)            where each file is
//   migrate({ appDir, dataDir, fs })  once, at the start (sync, before anything reads the config): the tracked files'
//                                     content (the owner's, on an old-layout install) is copied into data (atomic,
//                                     flushed, read back), a copy kept in data/.configsafe/; a tracked file that can't
//                                     be read leaves this start on the old layout (tried again next start)
//   effective(own, defaults)          the config Hearth uses
//   ownFile(appDir, name)             data/<name> when it exists, else the tracked one (readers outside main.js)
//   readEffective(appDir)             the config Hearth uses, for a reader outside main.js (the capture MCP server)
const fs = require('fs');
const path = require('path');

const FILES = ['config.json', 'theme.css'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function paths(appDir, dataDir = path.join(appDir, 'data')) {
  const keep = path.join(dataDir, '.configsafe'); // hidden: this computer's own (sync leaves dot folders alone)
  return {
    appDir, dataDir, keep,
    defConfig: path.join(appDir, 'config.json'), defTheme: path.join(appDir, 'theme.css'),
    config: path.join(dataDir, 'config.json'), theme: path.join(dataDir, 'theme.css'),
    state: path.join(keep, 'state.json'),
  };
}

// a held file (Windows: an antivirus, OneDrive) is read again a few times before it counts as unreadable
const readRetry = (dfs, file) => require('./scenesafe-core').readRetry(dfs, file);
function writeAtomic(dfs, file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  require('./crashsafe-core').writeAtomicSync(dfs, file, text);
  // read back: what's on disk is what was meant (a disk that lies stops the migration here, nothing else written)
  if (dfs.readFileSync(file, 'utf8') !== text) throw Object.assign(new Error(`${path.basename(file)} read back differently`), { code: 'EREADBACK' });
}
const readState = (p, dfs = fs) => { try { return JSON.parse(dfs.readFileSync(p.state, 'utf8')); } catch { return null; } };
function writeState(p, value, dfs = fs) { try { writeAtomic(dfs, p.state, `${JSON.stringify(value, null, 2)}\n`); return true; } catch { return false; } }

// → { mode: 'data' | 'legacy', migrated: [files moved this start], why?, paths }
// 'legacy': this start reads and writes the tracked config.json as before (its content couldn't be read safely now)
function migrate({ appDir, dataDir, fs: dfs = fs, now = Date.now } = {}) {
  const p = paths(appDir, dataDir);
  const out = { mode: 'data', migrated: [], paths: p };
  if (dfs.existsSync(p.config)) {
    // the config is there: a theme.css never copied (none then, or held at that start) is copied now if it reads
    if (!dfs.existsSync(p.theme) && dfs.existsSync(p.defTheme) && !(readState(p, dfs)?.theme)) {
      try { const t = readRetry(dfs, p.defTheme); keepCopy(dfs, p, 'theme.css', t, now()); writeAtomic(dfs, p.theme, t); out.migrated.push('theme.css'); mark(p, dfs, { theme: now() }); } catch { /* next start */ }
    }
    return out;
  }
  let text = null;
  try { text = readRetry(dfs, p.defConfig); JSON.parse(text); } catch (err) {
    // a tracked config.json missing (a broken checkout) or not readable / not JSON right now: nothing is decided
    return { ...out, mode: 'legacy', why: err instanceof SyntaxError ? 'garbled' : err.code === 'ENOENT' ? 'missing' : 'held' };
  }
  try {
    dfs.mkdirSync(dataDir, { recursive: true });
    let theme = null;
    if (dfs.existsSync(p.defTheme) && !dfs.existsSync(p.theme)) { try { theme = readRetry(dfs, p.defTheme); } catch { theme = null; } }
    // the owner's content exactly as it was, kept aside first (byte for byte: nothing to lose even if all else fails)
    keepCopy(dfs, p, 'config.json', text, now());
    if (theme != null) keepCopy(dfs, p, 'theme.css', theme, now());
    // defaultsSeen: the agents the owner had a say on (a default agent missing from their list was removed by them)
    let v = JSON.parse(text);
    if (isObj(v) && Array.isArray(v.agents) && !Array.isArray(v.defaultsSeen)) { v = { ...v, defaultsSeen: v.agents.map((a) => a?.id).filter(Boolean) }; }
    if (theme != null) { writeAtomic(dfs, p.theme, theme); out.migrated.push('theme.css'); }
    writeAtomic(dfs, p.config, `${JSON.stringify(v, null, 2)}\n`); // last: its presence says "moved"
    out.migrated.unshift('config.json');
    mark(p, dfs, { migratedAt: now(), theme: theme != null ? now() : null });
    return out;
  } catch (err) {
    // half-way (a full disk…): no data/config.json → the old layout this start, the tracked file untouched
    try { if (!dfs.existsSync(p.config)) dfs.rmSync(p.theme, { force: true }); } catch { /* left */ }
    return { ...out, mode: 'legacy', migrated: [], why: err.code || 'write' };
  }
}
function keepCopy(dfs, p, name, text, at) {
  // data/.configsafe/<name> (the first one) + one dated copy each time something new is kept
  const first = path.join(p.keep, name);
  if (!dfs.existsSync(first)) { writeAtomic(dfs, first, text); return first; }
  try { if (dfs.readFileSync(first, 'utf8') === text) return first; } catch { /* a dated copy */ }
  const f = path.join(p.keep, name.replace(/(\.\w+)$/, `-${new Date(at).toISOString().replace(/[:.]/g, '-')}$1`));
  writeAtomic(dfs, f, text);
  return f;
}
function mark(p, dfs, patch) { writeState(p, { ...(readState(p, dfs) || {}), ...patch }, dfs); }

// the config Hearth uses: the owner's (own) + what the defaults have that it lacks. Agents join by id (the owner's
// fields win, a field only the default has is filled in); a default agent missing from the owner's list joins only
// when the owner never had it (defaultsSeen), so one they removed stays removed. A part (layout, theme…) the owner
// lacks comes from the defaults; an object part gains only the keys it lacks. Nothing of the owner's is replaced.
function effective(own, defaults) {
  if (!isObj(own)) return own;
  if (!isObj(defaults)) return own;
  const out = { ...own };
  for (const [k, dv] of Object.entries(defaults)) {
    if (k === 'defaultsSeen') continue;
    if (k === 'agents') {
      if (!Array.isArray(dv)) continue;
      const mine = Array.isArray(own.agents) ? own.agents : [];
      const seen = new Set(Array.isArray(own.defaultsSeen) ? own.defaultsSeen : []);
      const byId = new Map(dv.filter((a) => a?.id).map((a) => [a.id, a]));
      const joined = mine.map((a) => (a?.id && byId.has(a.id) ? fill(a, byId.get(a.id)) : a));
      const ids = new Set(mine.map((a) => a?.id));
      const add = dv.filter((a) => a?.id && !ids.has(a.id) && !seen.has(a.id)).map(clone);
      out.agents = add.length ? [...joined, ...add] : joined;
      // every default the owner now has a say on (shown to them: kept or removed by them from here on)
      const all = new Set(seen);
      for (const id of byId.keys()) all.add(id);
      if (all.size !== seen.size || !Array.isArray(own.defaultsSeen)) out.defaultsSeen = [...all];
      continue;
    }
    if (!(k in out)) { out[k] = clone(dv); continue; }
    if (isObj(dv) && isObj(out[k])) out[k] = fill(out[k], dv);
  }
  return out;
}
function fill(mine, def) {
  let out = mine;
  for (const [k, v] of Object.entries(def)) if (!(k in mine)) { if (out === mine) out = { ...mine }; out[k] = clone(v); }
  return out;
}

// readers outside main.js: the owner's file when it is there (the new layout), else the tracked one (an old layout)
const ownFile = (appDir, name, dataDir = path.join(appDir, 'data')) => { const f = path.join(dataDir, name); return fs.existsSync(f) ? f : path.join(appDir, name); };
function readEffective(appDir, dataDir = path.join(appDir, 'data')) {
  const p = paths(appDir, dataDir);
  const own = JSON.parse(readRetry(fs, ownFile(appDir, 'config.json', dataDir)));
  let def = null; try { def = JSON.parse(readRetry(fs, p.defConfig)); } catch { def = null; }
  return effective(own, def);
}

// a moment after the start (main.js; the test runs the same): what an update stash still holds of the owner's comes
// into data (updater.bringBack, labchats54's logic), then the tracked files go back to the repo's own (updater.settle)
// U: an updatermain instance · cfg: migrate()'s answer → { brought: [what], settled: [files] }
async function afterStart(U, cfg) {
  const own = cfg?.mode === 'data' ? { config: cfg.paths.config, theme: cfg.paths.theme } : null;
  const r = await U.bringBack({ own });
  const s = own ? await U.settle({ own, keep: cfg.paths.keep }).catch((err) => { console.warn('configsafe: settle', err.message); return null; }) : null;
  return { brought: [...(r?.brought || []), ...(s?.brought || [])], settled: s?.settled || [] };
}

module.exports = { afterStart, FILES, paths, migrate, effective, ownFile, readEffective, readState, writeState, keepCopy, writeAtomic };
