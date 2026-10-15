#!/usr/bin/env node
// (round 45, errorcalm) The plain-words mapper (errorcalm-core.js) on real raw texts: Node's file errors (with the
// file named), Electron's IPC wrapper, HTTP statuses for an app, the engines (through winpolish / macpolish on a
// simulated Windows PC / Mac), the network family (through offline-core), ffmpeg (through renders-core, and exit codes
// without it), WebGL, JSON, code errors, the Lab's scene errors; the owner's own words kept before the raw part; plain
// messages left exactly as they are; and no sentence ever carries jargon (isRaw is false on every output).
//   node dev/errorcalm-test.js
const path = require('path');
const C = require(path.join(__dirname, '..', 'errorcalm-core.js'));
const scan = require(path.join(__dirname, 'errorcalm-scan.js'));

let n = 0;
const fails = [];
const ok = (cond, what) => { n++; if (!cond) fails.push(what); };
const has = (s, re) => re.test(String(s));

// [raw, ctx, text must match, action id (null: none), action target?]
const CASES = [
  // Node's file errors, the file named
  ["ENOENT: no such file or directory, open '/Users/q/Music/song.wav'", {}, /“song\.wav” isn't there any more/, 'show'],
  ["Error invoking remote method 'fs:read': Error: ENOENT: no such file or directory, open 'C:\\Users\\q\\a\\clip.mp4'", {}, /“clip\.mp4” isn't there/, 'show'],
  ["EACCES: permission denied, open '/Volumes/X/b.json'", {}, /wasn't allowed to open “b\.json”/, 'show'],
  ["EPERM: operation not permitted, unlink 'C:\\x\\y.txt'", {}, /wasn't allowed/, 'show'],
  ["EBUSY: resource busy or locked, open 'C:\\x\\scenes.json'", {}, /open in another program/, 'retry'],
  ['ENOSPC: no space left on device, write', {}, /disk is full/, 'show'],
  ["EEXIST: file already exists, mkdir '/a/b'", {}, /already there/, 'show'],
  ["EISDIR: illegal operation on a directory, read", {}, /folder, not a file/, 'show'],
  ["ENOTDIR: not a directory, scandir '/a/Hearth/files'", {}, /a file where Hearth expected a folder/, 'show'],
  ["ENAMETOOLONG: name too long, open '/a/…'", {}, /path is too long/, 'show'],
  ['EMFILE: too many open files, watch', {}, /Too many files are open/, 'restart'],
  ["EXDEV: cross-device link not permitted, rename '/a' -> '/b'", {}, /between two disks/, 'retry'],
  ["EROFS: read-only file system, open '/Volumes/CD/x.txt'", {}, /read-only/, 'show'],
  // programs
  ['spawn ffmpeg ENOENT', {}, /ffmpeg isn't installed/, 'settings', 'set:check-computer'],
  ["'ffmpeg' is not recognized as an internal or external command", {}, /ffmpeg isn't installed/, 'settings', 'set:check-computer'],
  ['spawn /opt/tools/blender ENOENT', {}, /couldn't find the program “blender”/, 'settings', 'set:check-computer'],
  ["Couldn't find Claude Code. Looked in: PATH, ~/.local/bin", { where: 'engine' }, /can't find Claude/, 'checkai'],
  ['spawn codex ENOENT', {}, /can't find Astra/, 'checkai'],
  ['spawn /tmp/x/claude EACCES', { where: 'engine', engine: 'claude' }, /couldn't start “claude”: it isn't a program/, 'settings', 'set:claude-path'],
  ['spawn /usr/local/bin/tool EACCES', {}, /couldn't start “tool”/, 'settings', 'set:check-computer'],
  // Electron
  ["Error invoking remote method 'capture:start': Error: No handler registered for 'capture:start'", {}, /needs a restart/, 'restart'],
  // a local service / HTTP for an app
  ['connect ECONNREFUSED 127.0.0.1:4455', { app: 'OBS' }, /OBS isn't running/, 'retry'],
  ['Request failed: HTTP 401', { app: 'Meshy' }, /Meshy didn't accept your key/, 'settings', 'set:meshy-key'],
  ['status 403 Forbidden', { app: 'Suno' }, /Suno didn't accept your key or sign-in/, 'retry'],
  ['HTTP 402 Payment Required', { app: 'Meshy' }, /out of credits/, null],
  ['HTTP 404 Not Found', { app: 'Meshy' }, /Meshy couldn't find that/, 'retry'],
  ['status code 400', { app: 'Pinterest' }, /didn't accept that request/, 'report'],
  ['HTTP 413 Payload Too Large', { app: 'Meshy' }, /too big for Meshy/, null],
  ['HTTP 504 Gateway Timeout', { app: 'Meshy' }, /took too long/, 'retry'],
  // the network family (offline-core's map)
  ['getaddrinfo ENOTFOUND api.meshy.ai', { app: 'Meshy' }, /no internet connection to Meshy/, 'retry'],
  ['API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', { engine: 'claude' }, /Claude is busy right now/, 'retry'],
  ['fetch failed', {}, /no internet connection/, 'retry'],
  ['self signed certificate in certificate chain', { app: 'Meshy' }, /VPN or proxy/, 'retry'],
  ['net::ERR_INTERNET_DISCONNECTED', { app: 'Suno' }, /Suno couldn't be reached/, 'retry'],
  ['ERR_CERT_AUTHORITY_INVALID', { app: 'Suno' }, /VPN or proxy/, 'retry'], // (offline-core's proxy family)
  // ffmpeg
  ['/x/a.mp4: Invalid data found when processing input', { where: 'ffmpeg' }, /damaged or still being written/, 'show'],
  ['ffmpeg exited with code 1', {}, /couldn't convert/, 'retry'],
  ['ffmpeg exited with code 137', {}, /stopped from outside|stopped/, 'retry'],
  ['Unknown encoder \'libx265\'', { where: 'ffmpeg' }, /can't make that format/, 'retry'],
  // WebGL
  ['THREE.WebGLRenderer: Context Lost.', {}, /graphics card reset the preview/, 'restart'],
  ['Error creating WebGL context.', {}, /couldn't start 3D graphics/, 'restart'],
  ['GL_OUT_OF_MEMORY', {}, /ran out of memory/, 'retry'],
  // JSON / garbled / timeouts
  ['Unexpected token < in JSON at position 0', {}, /came back garbled/, 'retry'],
  ["Unexpected end of JSON input", { where: 'file', path: '/a/scene.hearthpack' }, /“scene\.hearthpack” is damaged/, 'show'],
  ['Error: Timed out after 30000 ms', { app: 'Adobe' }, /Adobe took too long/, 'retry'],
  // code errors inside Hearth
  ["TypeError: Cannot read properties of undefined (reading 'layers')\n    at paint (file:///app/tools/three.js:120:5)\n    at async run (file:///app/x.js:1:1)", {}, /inside Hearth \(not your fault\)/, 'report'],
  ['ReferenceError: foo is not defined', {}, /inside Hearth/, 'report'],
  ['[object Object]', {}, /inside Hearth/, 'report'],
  // nothing matched, still never the raw text
  ['ERR_SOMETHING_ODD: 0xdeadbeef42', {}, /Something unexpected went wrong/, 'report'],
];
for (const [raw, ctx, re, act, target] of CASES) {
  const e = C.explain(raw, ctx);
  ok(has(e.text, re), `${raw.slice(0, 60)} → "${e.text}" should match ${re}`);
  ok((e.action?.id || null) === act, `${raw.slice(0, 60)} → action ${e.action?.id} (want ${act})`);
  if (target) ok(e.action?.target === target, `${raw.slice(0, 60)} → target ${e.action?.target} (want ${target})`);
  ok(!C.isRaw(e.text), `no jargon: "${e.text}"`);
  ok(/[.!?…]$/.test(e.text) && e.text.split(/(?<=[.!?])\s+(?=[A-Z])/).length === 1, `one sentence: "${e.text}"`);
  ok(e.raw === raw.trim(), `raw kept for Details: ${raw.slice(0, 40)}`);
}

// the owner's words before the raw part are kept; the file named once
{
  const c = C.calm("Couldn't load song.wav: ENOENT: no such file or directory, open '/x/song.wav'");
  ok(c.changed && c.text === "Couldn't load song.wav: it isn't there any more (moved, renamed or deleted).", `lead kept: ${c.text}`);
  ok(c.action?.id === 'show' && c.path === '/x/song.wav', 'Show file → the song');
  const d = C.calm('Studio: x.map is not a function');
  ok(d.text === 'Studio: something went wrong inside Hearth (not your fault).', `Studio lead: ${d.text}`);
  const e = C.calm('Error: EACCES: permission denied, open \'/a/b\'');
  ok(!/^Error/.test(e.text) && /wasn't allowed/.test(e.text), `"Error:" is no lead: ${e.text}`);
  const f = C.calm('/x/a.mp4: Invalid data found when processing input');
  ok(!f.text.startsWith('/x/'), `a path is no lead: ${f.text}`);
  const g = C.calm('Meshy: HTTP 401', { app: 'Meshy' });
  ok(g.text === 'Meshy: meshy didn\'t accept your key — paste it again.' || g.text === 'Meshy: Meshy didn\'t accept your key — paste it again.', `proper names keep their capital: ${g.text}`);
  ok(g.text.includes('Meshy didn'), 'Meshy stays capitalised');
  // a place's own words + a reason given apart (toast(msg, { raw }))
  const h = C.calm('ENOTDIR: not a directory, scandir \'/c/Hearth/files\'', { lead: 'Sync couldn\'t finish with Dropbox', where: 'sync', what: 'The sync folder' });
  ok(h.text === 'Sync couldn\'t finish with Dropbox: part of that path is a file where Hearth expected a folder.', `sync lead: ${h.text}`);
  ok(h.action?.id === 'settings' && h.action.target === 'set:sync', 'sync: the fix is its Settings row');
  const i = C.calm('ENOENT: no such file or directory, scandir \'/c/Hearth\'', { where: 'sync', what: 'The sync folder' });
  ok(/^The sync folder isn't there any more/.test(i.text) && i.action?.target === 'set:sync', `sync folder gone: ${i.text}`);
  const j = C.calm('the folder is gone', { lead: 'Sync couldn\'t finish' });
  ok(j.changed && j.plain && j.text === 'Sync couldn\'t finish: the folder is gone.', `a plain reason with a lead: ${j.text}`);
}

// plain messages are left exactly as they are
for (const t of ['Pick a layer first', 'Sync is off.', "Couldn't find that scene", 'The sequence has nothing in it yet.', 'Saved as preset.json', 'line 401 is fine', '404 frames rendered', 'Not found in this chat', 'Copied as json', 'Meshy key saved']) {
  const c = C.calm(t);
  ok(!c.changed && c.text === t, `left as is: ${t} → ${c.text}`);
}

// isRaw on the jargon the owner should never read
for (const t of ['ENOENT', 'spawn EINVAL', 'Error invoking remote method', 'x is undefined', 'MCP server failed', 'Unexpected token in JSON', 'TypeError: x', '    at foo (a.js:1:2)', '{"error":"bad"}', 'ffmpeg exited with code 1', 'HTTP 500', 'WebGL context lost', 'ERR_NAME_NOT_RESOLVED']) ok(C.isRaw(t), `raw: ${t}`);

// the Lab: a scene's code error in plain words (the console keeps the raw line)
{
  const L = [
    ['ReferenceError: THREEE is not defined', { line: 12 }, /uses “THREEE” on line 12, which doesn't exist/],
    ["TypeError: Cannot read properties of undefined (reading 'position')", { layer: 'Orb' }, /asks for “position” of something that isn't there yet \(layer “Orb”\)/],
    ['TypeError: mesh.rotate is not a function', {}, /calls “mesh\.rotate”/],
    ['SyntaxError: Unexpected token \'}\'', { line: 3 }, /typo on line 3/],
    ['THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false ERROR: 0:12: syntax error', {}, /shader in your scene doesn't compile/],
    ['RangeError: Maximum call stack size exceeded', {}, /calls itself without end/],
    ['something odd', {}, /code stopped with an error/],
  ];
  for (const [m, o, re] of L) { const r = C.lab(m, o); ok(re.test(r.text), `lab: ${m} → ${r.text}`); ok(r.action?.id === 'fixscene' && !C.isRaw(r.text), `lab action / no jargon: ${r.text}`); }
  ok(C.explain('ReferenceError: x is not defined', { where: 'lab' }).action.id === 'fixscene', 'where: lab → Fix my scene');
}

// the other streams' maps are reused, not duplicated: Windows (winpolish), the Mac (macpolish), ffmpeg (renders-core)
{
  const w = C.explain("'node' is not recognized as an internal or external command,\noperable program or batch file.", { where: 'engine', platform: 'win32', engine: 'claude' });
  ok(/needs Node\.js, which Windows can't find/.test(w.text) && w.action.id === 'checkai', `winpolish reused: ${w.text}`);
  const m = C.explain('dyld[123]: Library not loaded: @rpath/libnode.dylib', { where: 'engine', platform: 'darwin', engine: 'claude' });
  ok(/missing a part macOS needs/.test(m.text) && m.action.id === 'checkai', `macpolish reused: ${m.text}`);
  const p = C.explain('Operation not permitted: /Users/q/Desktop/x.txt (EPERM)', { where: 'engine', platform: 'darwin' });
  ok(/privacy protection/.test(p.text) && p.action.target === 'ai:files', `macpolish privacy → Files it can use: ${p.text}`);
  const R = require(path.join(__dirname, '..', 'renders-core.js'));
  const r = C.explain('Unknown encoder \'prores_ks\'', { where: 'ffmpeg' });
  ok(r.text === R.explain('Unknown encoder \'prores_ks\'').reason, `renders-core reused: ${r.text}`);
  const O = require(path.join(__dirname, '..', 'offline-core.js'));
  ok(O.classify('socket hang up')?.kind === 'offline' && C.explain('socket hang up').kind === 'offline', 'offline-core reused');
}

// helpers
ok(C.firstLine(new TypeError('x is not a function')) === 'x is not a function', 'firstLine drops "TypeError:"');
ok(C.firstLine('Error: a\n    at b (c.js:1:2)') === 'a', 'firstLine drops the stack');
ok(C.pathIn("ENOENT: no such file or directory, open 'C:\\a b\\c.wav'") === 'C:\\a b\\c.wav', 'pathIn: Windows path with a space');
ok(C.pathIn('/x/y z.mp4: No such file or directory') === '/x/y z.mp4', 'pathIn: ffmpeg form');
ok(C.calm(new Error("ENOENT: no such file or directory, open '/a/b.png'")).text.startsWith('“b.png”'), 'an Error object');

// the lint's own rules (dev/errorcalm-scan.js)
ok(scan.lineFinding('toast(err.message);') === 'toast', 'lint: a non-error toast with the raw text');
ok(scan.lineFinding("el('p', { text: calmError(err) })") === null, 'lint: calmed text is fine');

if (fails.length) { console.log(fails.map((f) => `✖ ${f}`).join('\n')); console.log(`FAIL errorcalm-test: ${fails.length} of ${n}`); process.exit(1); }
console.log(`errorcalm-test: ${n} checks passed (${CASES.length} raw errors)`);
