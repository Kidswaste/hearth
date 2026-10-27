// (round 74, synchard74) Sync on real Windows / Mac computers: the pure rules (no files, no Electron). Used by
// sync-engine.js, sync-merge.js (secrets never sync), syncmain.js and the simulator tests (dev/synchard74-test.js).
//   winBad(rel, o)       a data-folder path a Windows PC can't hold: characters (: ? * " < > | \), a name ending in a
//                        dot or a space, a reserved device name (CON, NUL, COM1…), or too long for the PC's folders
//   winSafeRel(rel, o)   the same path renamed so the PC can hold it ("Capture 10:32.png" → "Capture 10-32.png")
//   classify(err, o)     an fs error in plain categories: locked (another program holds it), read-only, denied (macOS
//                        privacy: Hearth not allowed in that folder), disk-full, too-long, bad-name, drive (the drive
//                        went away / timed out), gone, other
//   secretName(rel)      files that hold keys / tokens / passwords (never synced, wherever they are)
//   secretKey(k) / secretValue(v)   settings fields / values that are secrets (never in the synced settings)
//   FORMAT               this Hearth's sync format: stamped in its machine record and journal lines; a computer whose
//                        format is older than the cloud's .sync/format.json "min" stops writing (it would damage data
//                        a newer Hearth wrote), and never merges / pushes over a file a newer Hearth wrote last
'use strict';

const FORMAT = 74;

// ---------- Windows names ----------
const WIN_CHARS = /[<>:"|?*\\\u0000-\u001f]/; // eslint-disable-line no-control-regex
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.[^.]*)?$/i;
// Windows' classic path limit (MAX_PATH = 260 including the drive and the ending NUL): Explorer, most programs and some
// cloud clients still can't open a longer one, even where Node can
const WIN_MAX = 259;
// a PC's folders when no Windows computer has said where its folders are yet (C:\Users\<name>\OneDrive\Hearth\files\)
const WIN_ROOT_GUESS = 48;
// → null (fine on Windows) or { why: 'win-chars' | 'win-reserved' | 'win-ending' | 'win-long', part, chars? }
// o.rootLen: the longest of the Windows computers' data / cloud folder paths (a folder separator is added)
function winBad(rel, o = {}) {
  const parts = String(rel || '').split('/');
  for (const p of parts) {
    if (!p) continue;
    if (WIN_CHARS.test(p)) return { why: 'win-chars', part: p, chars: [...new Set([...p].filter((c) => WIN_CHARS.test(c)))].map((c) => (c < ' ' ? '(control)' : c)).join(' ') };
    if (/[. ]$/.test(p)) return { why: 'win-ending', part: p };
    if (WIN_RESERVED.test(p) || WIN_RESERVED.test(p.replace(/ +(\.|$)/, '$1'))) return { why: 'win-reserved', part: p };
  }
  const len = (o.rootLen ?? WIN_ROOT_GUESS) + 1 + String(rel).length;
  if (len > WIN_MAX) return { why: 'win-long', part: parts[parts.length - 1], over: len - WIN_MAX };
  return null;
}
// one name made safe: ":" "|" "/" → "-", "?" "*" and quotes dropped, < > → ( ), control characters gone, no dot / space
// at the end, a reserved device name gets "_" ("CON.txt" → "CON_.txt")
function winSafeName(name) {
  let n = String(name || '')
    .replace(/[:|\\]/g, '-').replace(/[<]/g, '(').replace(/[>]/g, ')').replace(/["]/g, '\'').replace(/[?*]/g, '')
    .replace(/[\u0000-\u001f]/g, '') // eslint-disable-line no-control-regex
    .replace(/[. ]+$/, '');
  const m = /^([^.]*)(\..*)?$/.exec(n);
  if (m && WIN_RESERVED.test(n.replace(/ +(\.|$)/, '$1'))) n = `${m[1].trimEnd()}_${m[2] || ''}`;
  return n || '_';
}
// the whole path made safe; too long → the file name is shortened (its extension and a short tag kept, so two long
// names that start the same stay two files). o: { rootLen, taken(rel) → true when that name is already used }
function winSafeRel(rel, o = {}) {
  const parts = String(rel).split('/').map(winSafeName);
  const room = WIN_MAX - (o.rootLen ?? WIN_ROOT_GUESS) - 1;
  // too long: the longest part is shortened first, folders included, each the same way wherever it appears (its start
  // + "~" + a short tag of the whole name: two long names that start the same stay two; every too-long file of one
  // folder lands in the same shorter folder)
  const total = () => parts.reduce((n, p) => n + p.length, 0) + parts.length - 1;
  for (let guard = 0; total() > room && guard < parts.length * 2; guard++) {
    let i = 0; for (let k = 1; k < parts.length; k++) if (parts[k].length > parts[i].length) i = k;
    const p = parts[i]; const last = i === parts.length - 1;
    const dot = last ? p.lastIndexOf('.') : -1; const ext = dot > 0 && p.length - dot <= 12 ? p.slice(dot) : '';
    const stem = p.slice(0, p.length - ext.length); const tag = `~${hash6(String(rel).split('/')[i])}`;
    const want = Math.max(12, p.length - (total() - room));
    if (p.length <= want || stem.length <= 6) break;
    parts[i] = `${stem.slice(0, Math.max(4, want - ext.length - tag.length)).replace(/[. ]+$/, '')}${tag}${ext}`;
  }
  let out = parts.join('/');
  if (o.taken) {
    const dot = out.lastIndexOf('.'); const slash = out.lastIndexOf('/');
    const stem = dot > slash + 1 ? out.slice(0, dot) : out; const ext = dot > slash + 1 ? out.slice(dot) : '';
    // "~2", not " 2": a name ending in " 2" looks like a cloud client's own copy of the file
    for (let i = 2; o.taken(out) && i < 1000; i++) out = `${stem}~${i}${ext}`;
  }
  return out;
}
function hash6(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).slice(0, 6); }

// ---------- fs errors, in plain categories ----------
// o: { readOnly: true when the file was found read-only, platform } → 'locked' | 'read-only' | 'denied' | 'disk-full' |
// 'too-long' | 'bad-name' | 'drive' | 'gone' | 'other'
function classify(err, o = {}) {
  const c = err && err.code;
  if (!c) return 'other';
  if (c === 'ENOSPC' || c === 'EDQUOT' || c === 'EFBIG') return 'disk-full';
  if (c === 'ENAMETOOLONG') return 'too-long';
  if (c === 'EBUSY' || c === 'ETXTBSY' || c === 'ELOCKED') return 'locked';
  // Windows: a file in use is EPERM / EACCES (or EBUSY); on a Mac it is macOS refusing (privacy settings, a locked file)
  if (c === 'EPERM' || c === 'EACCES') return o.readOnly ? 'read-only' : o.platform && o.platform !== 'win32' ? 'denied' : 'locked';
  if (c === 'EINVAL' || c === 'EILSEQ') return 'bad-name';
  if (['EIO', 'ENXIO', 'ENODEV', 'ETIMEDOUT', 'EHOSTDOWN', 'EHOSTUNREACH', 'ENOTCONN', 'ESTALE', 'ECONNRESET', 'ENETDOWN', 'ENETUNREACH', 'ECANCELED'].includes(c)) return 'drive';
  if (c === 'ENOENT') return 'gone';
  return 'other';
}
const BLOCKING = new Set(['locked', 'read-only', 'denied', 'disk-full', 'too-long', 'bad-name', 'drive']);

// ---------- secrets ----------
// Files that hold keys / tokens / passwords: never synced, on either computer, wherever they are (a chat's project in
// the workspace, an attachment). Names, not contents (a chat that mentions a key is still a chat). Keynote's ".key"
// is NOT one of them: only names that say they are keys ("server.key", "private_key", "id_rsa").
const SECRET_FILE = [
  /^\.env(\.[\w.-]+)?$/i, /^\.(npmrc|netrc|pgpass|pypirc|git-credentials|htpasswd)$/i, /^_netrc$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, /\.(pem|p12|pfx|jks|keystore|ppk|kdbx|gpg|asc)$/i, /\.keychain(-db)?$/i,
  /(^|[-_.])(private|server|client|ssl|tls|ssh|signing|secret|api)[-_.]?key(\.[a-z]+)?$/i,
  /^credentials?(\.(json|ya?ml|toml|ini|txt|xml))?$/i, /^secrets?(\.(json|ya?ml|toml|ini|txt|env))?$/i,
  /^(service[-_]?account|client[-_]?secret)[^/]*\.json$/i, /^(token|tokens|auth|oauth)(\.(json|txt))$/i,
];
const SECRET_DIR = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|\.docker|Keychains)(\/|$)/i;
function secretName(rel) {
  const r = String(rel || '').replace(/\\/g, '/');
  if (SECRET_DIR.test(r)) return true;
  const name = r.slice(r.lastIndexOf('/') + 1);
  return SECRET_FILE.some((re) => re.test(name));
}
// settings fields named like secrets ("apiKey", "OPENAI_API_KEY", "githubToken", "password") and values that look like
// one (sk-…, ghp_…, xoxb-…, AKIA…, AIza…): never in the synced (portable) settings; kept on this computer
const SECRET_KEY_WHOLE = /^(api[-_]?key|apikey|secret|client[-_]?secret|password|passwd|passphrase|token|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer|private[-_]?key|credentials?|cookie|session[-_]?key)$/i;
const SECRET_KEY_END = /([a-z0-9](ApiKey|Secret|Password|Passwd|Passphrase|Token|PrivateKey|Credentials?|Cookie)|[-_](api[-_]?key|secret|password|passwd|token|private[-_]?key|credentials?))$/;
const secretKey = (k) => typeof k === 'string' && (SECRET_KEY_WHOLE.test(k) || SECRET_KEY_END.test(k) || /[-_]API[-_]?KEY$|[-_]TOKEN$|[-_]SECRET$|[-_]PASSWORD$/.test(k));
const SECRET_VALUE = /^(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|glpat-[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
const secretValue = (v) => typeof v === 'string' && SECRET_VALUE.test(v.trim());

// ---------- what a blocked file says (the panel's words; the engine sends the code) ----------
// why → { title, fix? } fix: the button the panel shows ('rename' | 'writable' | 'retry' | 'space' | 'unsecret' | null)
const BLOCK = {
  'win-chars': { fix: 'rename' }, 'win-ending': { fix: 'rename' }, 'win-reserved': { fix: 'rename' }, 'win-long': { fix: 'rename' },
  'win-there': { fix: null }, locked: { fix: 'retry' }, 'read-only': { fix: 'writable' }, denied: { fix: 'retry' }, 'disk-full': { fix: 'space' },
  'too-long': { fix: 'rename' }, 'bad-name': { fix: 'rename' }, drive: { fix: 'retry' }, 'newer-app': { fix: null }, 'secret-cloud': { fix: 'unsecret' },
};

module.exports = { FORMAT, WIN_MAX, winBad, winSafeName, winSafeRel, classify, BLOCKING, secretName, secretKey, secretValue, BLOCK };
