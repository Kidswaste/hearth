#!/usr/bin/env node
// (round 31, winmac) A static scan for patterns that tend to break on one of the owner's two machines (a Mac and a
// Windows PC). It reads the app's own JS / HTML (not dev/, node_modules, vendored libs) and prints each hit with its
// rule, file:line and the line itself. Heuristics: a hit is "look at this", not "this is a bug"; lines that are known
// to be fine carry a `winmac-ok` comment (or match a rule's own allow pattern) and are skipped.
//   node dev/winmac-scan.js                 # every rule, grouped
//   node dev/winmac-scan.js --rule file-url  # one rule
//   node dev/winmac-scan.js --json           # machine-readable
//   node dev/winmac-scan.js --count          # rule → number of hits (dev/winmac-test.js wants 0 for the path / URL rules;
//                                            (round 46) and for zip-tool / trash-direct / case-win-only)
//   node dev/winmac-scan.js --all            # also the hits reviewed as fine (REVIEWED below)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dev', 'docs', '.git', '.claude', 'vendor', 'lib', 'assets', 'mac', 'data']);
const SKIP_FILES = /(\.min\.js|three\.module\.js|lazy-manifest\.js)$/;

// A path-ish expression: a name that holds a file / folder path
const PATHY = /\b(?:p|f|fp|full|file|files?Path|filePath|path|paths|src|dir|folder|root|out|output|dest|target|abs|rel|name|base|cwd|home|DATA_DIR|WORKSPACE|[a-z]*(?:Path|Dir|Folder|File))\b/;

const RULES = [
  {
    id: 'file-url',
    what: 'file:// URL built by hand: breaks on a Mac ("file:////Users"), on Windows ("file://C:\\…" = host C) or with # ? % in a name',
    test: (l) => /[`'"]file:\/\/\/?(?:\$\{|['"`]\s*\+)/.test(l) || /['"]file:\/\/\/?['"]\s*\+/.test(l),
    // the shared shape: segments through encodeURIComponent, drive letter kept → fine
    ok: (l) => /split\('\/'\)\.map\(\(?\w*\)?\s*=>\s*\(?[^)]*encodeURIComponent|split\('\/'\)\.map\(encodeURIComponent\)|WinMac\.fileUrl|pathToFileURL/.test(l),
  },
  {
    id: 'slash-split',
    what: "a path split on '/' only: Windows paths use \\ (split on /[\\\\/]/ or use path.basename)",
    test: (l) => new RegExp(`${PATHY.source}[\\w.?()\\]]*\\.split\\(['"]\\/['"]\\)\\.pop\\(\\)`).test(l) || /lastIndexOf\(['"]\/['"]\)/.test(l),
    ok: (l) => /https?:|url|URL|href|mime|type\.split|\.replace\(\/\\\\\/g, '\/'\)\.split|sep\b|lastIndexOf\('\\\\'\)/.test(l),
  },
  {
    id: 'slash-join',
    what: "a path joined with '/': fine for Node on Windows, but wrong when shown, compared or handed to Windows tools",
    test: (l) => /(?:DATA_DIR|WORKSPACE|__dirname|homedir\(\)|getPath\([^)]*\))\s*\+\s*['"`]\//.test(l) || /`\$\{(?:DATA_DIR|WORKSPACE|__dirname|os\.homedir\(\)|app\.getPath\([^)]*\)|home|dir|folder|outDir|root|await window\.hub\.fs\.home\(\))\}\/[^`]*`/.test(l),
    ok: (l) => /file:|https?:|url/i.test(l),
  },
  {
    id: 'ctrl-text',
    what: 'a "Ctrl+…" in text the owner reads that nothing turns into ⌘ on the Mac (covered: title=, placeholder=, toasts, hint text, menu labels / keys, the keys sheet, Commands.keyText)',
    test: (l) => /\b(?:say|note|alert|confirm|prompt)\(\s*[`'"][^`'"]*\bCtrl\+(?!click|drag)/.test(l) || /\btext:\s*[`'"][^`'"]*\bCtrl\+(?!click|drag)/.test(l),
    ok: (l) => /IS_MAC|isMac|navigator\.platform|macKeys|macText|keyText|⌘|class:\s*'[^']*hint/.test(l),
  },
  {
    id: 'shell-cmd',
    what: 'a command that only exists on one OS, or a shell string (quoting differs between sh and cmd.exe)',
    test: (l) => /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\(\s*['"`](?:rm|cp|mv|open|xdg-open|explorer|start|which|where|cmd|sh|bash|osascript|pbcopy|pbpaste|clip|powershell|kill|pkill|taskkill|ps|reg|ditto|unzip|tar)\b/.test(l) || /shell:\s*true/.test(l) || /\bexecSync?\(\s*`/.test(l),
    ok: (l) => /IS_WIN|IS_MAC|platform\s*===|isWin|isMac|win32|darwin/.test(l),
  },
  {
    id: 'path-delim',
    what: "PATH split on ':' (Windows uses ';' : use path.delimiter)",
    test: (l) => /PATH[^;]*\.split\(['"]:['"]\)/.test(l),
    ok: (l) => /win32|platform/.test(l),
  },
  {
    id: 'ext-case',
    what: 'a media extension test without the i flag / toLowerCase: Finder and Explorer keep ".JPG" / ".MOV" from cameras and phones',
    test: (l) => /\\\.\((?:[a-z0-9?]+\|)*(?:png|jpe?g|gif|webp|mp4|mov|webm|mp3|wav|m4a|glb|gltf|hdr|exr|srt|lrc|vtt|mkv|avi|flac|ogg)(?:\|[a-z0-9?]+)*\)\$\/(?![a-z]*i)/.test(l) || /\.endsWith\(['"]\.(?:png|jpe?g|gif|webp|mp4|mov|webm|mp3|wav|m4a|glb|gltf|hdr|exr|srt|lrc|vtt)['"]\)/.test(l),
    ok: (l) => /toLowerCase\(\)|\.lower/.test(l),
  },
  {
    id: 'crlf',
    what: "a file the owner may edit read and split on '\\n' only: Windows editors save \\r\\n (use /\\r?\\n/ or drop \\r first)",
    test: (l) => /readFile(?:Sync)?\([^;]*\.split\(['"]\\n['"]\)/.test(l) || (/\.split\(['"]\\n['"]\)/.test(l) && /\b(?:srt|lrc|vtt|lyrics?|subs?|captions?)\b/i.test(l)),
    ok: (l) => /\\r|JSON\.parse|\.trim\(\)/.test(l),
  },
  {
    id: 'hard-path',
    what: 'a hard-coded absolute folder that only exists on one OS',
    test: (l) => /['"`](?:\/Users\/|\/home\/|\/tmp\/|C:\\\\Users|\/Applications\/|\/opt\/homebrew)/.test(l),
    ok: (l) => /IS_WIN|IS_MAC|platform|darwin|win32|isMac|isWin|e\.g\.|\/\/ |example|→|\bmac\b/i.test(l),
  },
  // (round 46, platform46) what rounds 41–45 tripped on
  {
    id: 'zip-tool',
    what: 'a zip made or read with an outside tool (zip / unzip / tar / ditto / PowerShell): Windows\' tar.exe garbles accented names, the Mac\'s tar adds "._" files, Linux may lack unzip — use zipkit.js',
    test: (l) => /\b(?:execFile|execFileSync|spawn|spawnSync)\(\s*(?:TAR\b|['"`](?:zip|unzip|tar|ditto)['"`])|Compress-Archive|Expand-Archive/.test(l),
  },
  {
    id: 'trash-direct',
    what: 'shell.trashItem without the bin check: on a network share (and a USB stick on Windows) the "Trash" deletes for good — WinPolish / MacPolish.trashCheck first',
    test: (l) => /\btrashItem\(/.test(l),
    ok: (l) => /trashCheck|check\.path|trashable|binCheck/.test(l),
  },
  {
    id: 'case-win-only',
    what: 'paths folded to lower case on Windows only: the Mac\'s disks ignore case too, and its FSEvents / Finder give accents decomposed (NFD) — fold on darwin too, with normalize(\'NFC\')',
    test: (l) => /win32['"]\s*\?[^:;]*toLowerCase\(\)\s*:/.test(l),
    ok: (l) => /darwin|NFC/.test(l),
  },
];

// Reviewed and fine as they are (rule, file, a piece of the line): guarded per platform a few lines up, or not a path
const REVIEWED = [
  ['shell-cmd', 'powerwisemain.js', "execFile('powershell.exe'"], // (round 40) Windows battery saver, guarded by process.platform === 'win32'
  ['file-url', 'portable.js', 'file:///'], // stored file:/// prefixes from the old data folder, matched as they were written
  ['file-url', 'sync-merge.js', 'file://'], // both the raw and the encoded spellings, on purpose (path tokens across machines)
  ['slash-split', 'sync.js', 'rel.split'], ['slash-split', 'sync-engine.js', 'rel.'], // sync's own relative names always use /
  ['shell-cmd', 'adobemain.js', 'osascript'], ['shell-cmd', 'adobemain.js', "spawn('open'"], ['shell-cmd', 'aemain.js', 'osascript'],
  ['shell-cmd', 'deploymain.js', 'osascript'], ['shell-cmd', 'nowplaying.js', ''], ['shell-cmd', 'appshell.js', 'powershell.exe'],
  ['shell-cmd', 'chrome-cdp.js', "'reg'"], ['shell-cmd', 'firstrunmain.js', "'reg'"], ['shell-cmd', 'installs.js', ''],
  ['shell-cmd', 'engines.js', "'ps'"], ['shell-cmd', 'engines.js', "'taskkill'"], // each inside an IS_MAC / IS_WIN branch
  ['path-delim', 'chrome-cdp.js', 'env.PATH'], // the Linux branch only
  ['hard-path', 'deploymain.js', '/opt/homebrew'], // a list of Mac folders, stat'ed before use
  ['hard-path', 'tools/forge', 'quent'], // the owner's own Forgeheart defaults (Windows); "Choose the folder…" changes them
  ['ext-case', 'boardmain.js', 'urlExt'], // urlExt is lower-cased the line before
  ['crlf', 'sync-engine.js', 'fsp.readFile'], // sync's own JSON lines (written by Hearth with \n; JSON.parse ignores a \r anyway)
  ['slash-join', 'sync-engine.js', 'id: `${where}:${d}/'], // an id, not a path
  ['slash-join', 'access-rules.js', '${base}/${s}'], // normalised to / right after (the rules compare / paths)
  ['slash-join', 'tools/three-seq.js', "'tools/"], ['slash-join', 'tools/three-export.js', "'tools/"], // the app's own files (Node reads either slash)
  ['slash-join', 'access-rules.js', '`${folder}/`'], // paths normalised to / (and lower case on Windows) first
  ['slash-join', 'astra.js', 'engine.log'], ['slash-join', 'devreport.js', 'engine.log'], // read by Node: either slash works
  ['slash-join', 'tools/three-seq.js', '${dir}/frame_'], ['slash-join', 'tools/three-seq.js', '.hearth-titles-seq'], ['slash-join', 'tools/three-export.js', '.hearth-titles-xp'], // temporary files Node / ffmpeg read
  ['*', 'winmac.js', ''], // the helpers themselves
  ['shell-cmd', 'winpolish.js', 'powershell.exe'], // (round 32) the Windows-only drive-type probe (trashCheck runs it only on win32)
  ['*', 'macpolish.js', ''], // (round 33) the Mac's own helpers: Mac folders, ':' PATHs, xattr / mount (each runs only on darwin)
  // (round 46) the system's zip tool only as the fallback for a zip zipkit can't read (another program's compression)
  ['zip-tool', 'fsapi.js', 'execFile('], ['zip-tool', 'datasafemain.js', 'execFile('], ['zip-tool', 'scenesafemain.js', 'execFile('],
  ['zip-tool', 'importer.js', 'execFileSync('], // claude.ai / ChatGPT exports (other programs' zips), read once at import
  ['trash-direct', 'backupautomain.js', 'trashItem(p)'], // trashable(p) the line before
];
const reviewed = (h) => REVIEWED.some(([r, f, piece]) => (r === '*' || r === h.rule) && h.file.startsWith(f) && h.text.includes(piece));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, out); } else if (/\.(js|html)$/.test(e.name) && !SKIP_FILES.test(e.name)) out.push(full);
  }
  return out;
}

function scanText(text, file, rules = RULES) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 4000 || /winmac-ok/.test(line)) return; // minified / known fine
    const code = line.replace(/^\s*\/\/.*$/, ''); // whole-line comments aren't code
    if (!code.trim()) return;
    for (const r of rules) if (r.test(code) && !(r.ok && r.ok(code))) hits.push({ rule: r.id, file, line: i + 1, text: line.trim().slice(0, 200) });
  });
  return hits;
}

function scan({ root = ROOT, rule = null, all = false } = {}) {
  const rules = rule ? RULES.filter((r) => r.id === rule) : RULES;
  const hits = [];
  for (const f of walk(root)) hits.push(...scanText(fs.readFileSync(f, 'utf8'), path.relative(root, f).split(path.sep).join('/'), rules));
  return all ? hits : hits.filter((h) => !reviewed(h));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rule = args.includes('--rule') ? args[args.indexOf('--rule') + 1] : null;
  const hits = scan({ rule, all: args.includes('--all') });
  if (args.includes('--json')) { process.stdout.write(`${JSON.stringify(hits, null, 1)}\n`); process.exit(0); }
  const by = {};
  for (const h of hits) (by[h.rule] = by[h.rule] || []).push(h);
  if (args.includes('--count')) { for (const r of RULES) console.log(`${r.id.padEnd(12)} ${(by[r.id] || []).length}`); process.exit(0); }
  for (const r of RULES) {
    const list = by[r.id] || [];
    if (rule && r.id !== rule) continue;
    console.log(`\n## ${r.id} (${list.length}): ${r.what}`);
    for (const h of list) console.log(`  ${h.file}:${h.line}  ${h.text}`);
  }
  console.log(`\n${hits.length} hits`);
}

module.exports = { RULES, REVIEWED, scan, scanText };
