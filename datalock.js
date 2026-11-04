// (round 119, datalock119) Hearth's data folder is locked for any chat whose file access covers it. The data folder
// holds the owner's chats, settings (with keys and tokens), memory and sync state; a chat given Hearth's own folder
// (to edit Hearth's code) used to get it too. Main process only (Node); the decision itself is access-rules.js
// (classify's `locked`), the same for Claude's permission tool and for Astra.
//   (which data folders a chat's folders cover: engines.js dataLocksOf — <source>/data of every Hearth source folder
//   among them, and the running copy's data folder, store.js DATA_DIR, when a folder contains it)
//   claudeRules(locks)                          --disallowedTools rules: Claude Code reads files in its folders
//                                               without asking Hearth, so its own deny rules keep it out of the
//                                               data folder (workspace/ stays open, attachments/ readable)
//   codexDecider({ locks, folders, … })         Astra's app-server asks Hearth before each edit and each command
//                                               that isn't a plain read (approval policy "untrusted" on these chats):
//                                               edits into the data folder (or outside the folders) and commands that
//                                               name it are declined; the rest go ahead as before
// See docs/upgrades/datalock119.md for what each engine can and can't be held to.
const fs = require('fs');
const os = require('os');
const path = require('path');
const AccessRules = require('./access-rules');

const LOCK_MSG = AccessRules.LOCK_MSG;
// workspace/ is where both engines run (their scratch folder); attachments/ is what the owner attached (read only)
const OPEN_ALWAYS = 'workspace';
const READ_OPEN = 'attachments';

// Claude Code's own path rules: //<absolute path> (Windows C:\x → //c/x), gitignore patterns
const ruleRoot = (p) => { let s = String(p).replace(/\\/g, '/'); if (/^[A-Za-z]:\//.test(s)) s = `/${s[0].toLowerCase()}${s.slice(2)}`; return `/${s.replace(/\/+$/, '')}`; };
const esc = (n) => n.replace(/[[\]*?!#\\]/g, '\\$&');
function claudeRules(locks) {
  const out = [];
  for (const L of locks || []) {
    const root = ruleRoot(L);
    if (/[(),]/.test(root)) { out.push(`Read(${root}/**)`, `Edit(${root}/**)`); continue; } // can't be written as a rule piece by piece
    let names = [];
    try { names = fs.readdirSync(L, { withFileTypes: true }); } catch { /* no data folder yet: Hearth's own check covers it */ }
    if (names.length > 400) { out.push(`Read(${root}/**)`, `Edit(${root}/**)`); continue; }
    // one rule per folder, and the files by extension (*.json…): a short list (Windows caps a whole command line)
    const pieces = new Set();
    for (const d of names) {
      if (d.name === OPEN_ALWAYS) continue;
      const ext = !d.isDirectory() && /^[^.].*\.([A-Za-z0-9_-]{1,12})$/.exec(d.name);
      pieces.add(d.isDirectory() ? `${esc(d.name)}/**` : ext ? `*.${ext[1]}` : esc(d.name));
    }
    for (const x of pieces) {
      out.push(`Edit(${root}/${x})`);
      if (x !== `${READ_OPEN}/**`) out.push(`Read(${root}/${x})`);
    }
    // a command naming the data folder by its full path (Hearth's check covers the rest when Claude asks it)
    out.push(`Bash(*${L}*)`, `PowerShell(*${L}*)`);
  }
  return out;
}

// One shell line from Codex's command (an argv array or a string), quoted the POSIX way
const shellLine = (c) => (Array.isArray(c) ? c.map((a) => { const s = String(a); return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`; }).join(' ') : String(c || ''));
function codexDecider({ locks, folders, level, cwd, home = os.homedir(), mac = process.platform === 'darwin' }) {
  const base = { folders, home, mac, locked: locks };
  return (method, p = {}, item = null) => {
    const at = p.cwd || item?.cwd || cwd;
    if (/fileChange|applyPatch/.test(method)) {
      const paths = [...Object.keys(p.fileChanges || {}), ...[...(Array.isArray(p.changes) ? p.changes : []), ...(Array.isArray(item?.changes) ? item.changes : [])].map((c) => c && c.path)]
        .filter((x) => typeof x === 'string' && x);
      if (!paths.length) return { ok: false, why: 'Hearth couldn\'t see which files this edit changes, so it wasn\'t applied.' };
      for (const f of paths) {
        const c = AccessRules.classify({ ...base, tool: 'Write', input: { file_path: f }, level, cwd: at });
        if (c.verdict !== 'allow') return { ok: false, why: c.locked ? LOCK_MSG : `Not applied: ${c.why}.` };
      }
      return { ok: true };
    }
    const raw = p.command ?? item?.command;
    const command = shellLine(raw);
    if (!command.trim()) return { ok: false, why: 'Hearth couldn\'t see this command, so it didn\'t run.' };
    // commands ran sandboxed before at Read & write too: the same silent rules as Claude's Full (no card here)
    const c = AccessRules.classify({ ...base, tool: 'Bash', input: { command }, level: 'full', cwd: at });
    if (c.verdict === 'allow') return { ok: true };
    return { ok: false, why: c.locked ? LOCK_MSG : `Not run: ${c.why || 'Hearth can\'t ask the owner about it from here'}.` };
  };
}

module.exports = { claudeRules, codexDecider, LOCK_MSG, ruleRoot };
