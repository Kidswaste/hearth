// (round 68, bugbutton68) 🪲 Something broke: unit tests for bugcard-core.js — the redaction (no folder above the Hearth
// folder, no keys / tokens / passwords, no e-mail, no web paths, no chat text, the user name), stack frames, entries
// (kinds, trimming, nothing for an empty one), the summariser's plain words (nothing found, the newest problem with
// where it was, counts by kind, a saved report after an unexpected close) and the report for Claude (redacted, both
// parts). Also bugmain.js's ring and its saved reports in a temporary folder (no Electron).
//   node dev/bugcard-test.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../bugcard-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const WIN = { appDir: 'C:\\Users\\Bob Smith\\Hearth', home: 'C:\\Users\\Bob Smith' };
const MAC = { appDir: '/Users/bob/Hearth', home: '/Users/bob' };
const NOW = new Date(2026, 9, 26, 18, 30, 0).getTime();
const leaks = (s) => /Bob|bob|Smith|Documents|Library|Private|diary|hunter2|sk-ant|ghp_|eyJ|@example\.com|\/v1\/|token=1|my private chat/.test(s);

test('the Hearth folder stays by name, everything above it goes (Windows, spaces in the user name)', () => {
  assert.equal(C.redact('at render (C:\\Users\\Bob Smith\\Hearth\\tools\\three.js:120:5)', WIN), 'at render (Hearth/tools/three.js:120:5)');
  assert.equal(C.redact('file:///C:/Users/Bob%20Smith/Hearth/native.js:12:3', WIN), 'Hearth/native.js:12:3');
  assert.equal(C.redact('at x (/Users/bob/Hearth/ui.js:5:1)', MAC), 'at x (Hearth/ui.js:5:1)');
});
test('another Hearth folder (a copy) keeps its inside too; other folders are [path]', () => {
  assert.equal(C.redact('D:\\Backups\\Hearth\\main.js:3', WIN), 'Hearth/main.js:3');
  const s = C.redact("ENOENT: no such file or directory, open 'C:\\Users\\Bob Smith\\Documents\\taxes 2026.pdf'", WIN);
  assert.equal(s, "ENOENT: no such file or directory, open '[path]'");
  assert.equal(C.redact('failed /Users/bob/Library/Application Support/x/y.txt now', MAC), 'failed [path] now');
  assert.equal(C.redact('python at C:\\Program Files\\Python312\\python.exe', WIN), 'python at [path]/python.exe');
});
test('keys, tokens and passwords are hidden', () => {
  const s = C.redact('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 gh ghp_abcdefghijklmnopqrstuvwxyz123456 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U Authorization: Bearer abcdefgh12345678 password=hunter2 "api_key": "xyz123" AKIAABCDEFGHIJKLMNOP', WIN);
  assert.ok(!/sk-ant|ghp_|eyJ|abcdefgh12345678|hunter2|xyz123|AKIA/.test(s), s);
  assert.match(s, /\[key\].*\[key\].*\[token\]/);
  assert.match(C.redact('-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----', WIN), /^\[key\]$/);
  assert.equal(C.redact('sha 3f786850e387550fdab836ed7e6dc881de23001b', WIN), 'sha [hidden]');
});
test('chat text: long quoted words and quoted fields go, short property names stay', () => {
  assert.equal(C.redact('Unexpected token h, "hello this is my private chat message" is not valid JSON', WIN), 'Unexpected token h, "[text]" is not valid JSON');
  assert.equal(C.redact("Cannot read properties of undefined (reading 'scene')", WIN), "Cannot read properties of undefined (reading 'scene')");
  assert.equal(C.redact('prompt: "short"', WIN), 'prompt: "[text]"');
});
test('e-mail, web addresses (host only), the user name alone', () => {
  assert.equal(C.redact('mail bob@example.com at https://user:pw@api.example.com/v1/x?token=1 or http://localhost:3456', WIN), 'mail [email] at https://[hidden]@api.example.com/… or http://localhost:3456');
  assert.equal(C.redact('Bob Smith did it', WIN), '[user] did it');
  assert.equal(C.redact('and/or a / b 1/2', WIN), 'and/or a / b 1/2');
});
test('redacting twice changes nothing more', () => {
  const once = C.redact('at f (C:\\Users\\Bob Smith\\Hearth\\a.js:1:2) [path]/init.js:3 sk-abcdefghijklmnop1234', WIN);
  assert.equal(C.redact(once, WIN), once);
});
test('stack frames: the first 4, each redacted, function names kept', () => {
  const f = C.frames('Error: x\n    at foo (file:///Users/bob/Hearth/a.js:1:2)\n    at /opt/electron/resources/electron.asar/browser/init.js:3:4\n    at async bar (/Users/bob/Hearth/b.js:9:9)\n    at c (x)\n    at d (/Users/bob/Hearth/d.js:1:1)\n    at e (/Users/bob/Hearth/e.js:1:1)', MAC);
  assert.deepEqual(f, ['foo (Hearth/a.js:1:2)', '[path]/init.js:3:4', 'bar (Hearth/b.js:9:9)', 'd (Hearth/d.js:1:1)']);
});
test('entries: kinds, the first line only, trimmed, frames, nothing for an empty error', () => {
  const e = C.entry({ kind: 'page', src: 'window', message: 'TypeError: boom at C:\\Users\\Bob Smith\\Hearth\\x.js\nsecond line with sk-abcdefghijklmnop1234', stack: 'TypeError: boom\n    at f (C:\\Users\\Bob Smith\\Hearth\\x.js:2:3)', t: NOW, where: 'the Lab' }, WIN);
  assert.equal(e.kind, 'error');
  assert.equal(e.what, 'TypeError: boom at Hearth/x.js');
  assert.deepEqual(e.at, ['f (Hearth/x.js:2:3)']);
  assert.equal(e.where, 'the Lab');
  assert.equal(C.entry({ kind: 'error', message: '' }, WIN), null);
  assert.equal(C.entry({ kind: 'weird', src: 'main', message: 'x' }, WIN).kind, 'main');
  assert.equal(C.entry({ kind: 'toast', message: 'x'.repeat(500) }, WIN).what.length, 160);
  assert.equal(C.entry({ kind: 'child', name: 'the plugin host (VST)', code: 3221225477 }, WIN).code, 3221225477);
  assert.ok(!leaks(JSON.stringify(e)));
});
const E = (o) => C.entry({ t: NOW - 60e3, ...o }, WIN);
test('summary: nothing found says so, with how long Hearth has been up', () => {
  const s = C.summarise({ now: NOW, entries: [], started: NOW - 2 * 3600e3 });
  assert.equal(s.found, false);
  assert.equal(s.headline, 'Nothing broke that Hearth could see since Hearth started 2 h ago.');
  assert.match(s.tip, /Restart Hearth/);
});
test('summary: the newest problem first, in plain words with where, and counts by kind', () => {
  const entries = [
    E({ kind: 'error', src: 'window', message: "TypeError: Cannot read properties of undefined (reading 'x')", where: 'the Lab', t: NOW - 3 * 60e3, n: 3 }),
    E({ kind: 'ipc', src: 'main', ch: 'kv:get', message: 'EBUSY: resource busy', t: NOW - 10 * 60e3 }),
    E({ kind: 'child', src: 'main', name: 'the plugin host (VST)', code: 3221225477, t: NOW - 20 * 60e3 }),
    E({ kind: 'gpu', src: 'main', reason: 'crashed', t: NOW - 30 * 60e3 }),
  ];
  const s = C.summarise({ now: NOW, entries, started: NOW - 3600e3 }, { plainIpc: (ch) => (ch === 'kv:get' ? 'reading or saving app data' : ch) });
  assert.equal(s.headline, 'Something in the window broke, 3 min ago, in the Lab.');
  assert.equal(s.counts, 'Since Hearth started: 3 window errors, 1 failed request, 1 program stopped and 1 graphics card.');
  assert.equal(s.lines.length, 4);
  assert.equal(s.lines[0].n, 3);
  assert.match(s.lines[1].text, /^A request to Hearth's main process failed \(reading or saving app data\): EBUSY/);
  assert.equal(s.lines[2].text, 'the plugin host (VST) stopped (exit code 3221225477)');
  assert.equal(s.lines[3].text, 'The graphics card\'s process stopped (crashed)');
  assert.match(s.lines[0].time, /^\d\d:\d\d$/);
});
test('summary: the tip follows the newest problem (the graphics card → Restart)', () => {
  const s = C.summarise({ now: NOW, entries: [E({ kind: 'gpu', src: 'main', reason: 'crashed' })] });
  assert.match(s.tip, /graphics card restarted/);
  assert.match(s.headline, /^The graphics card's process stopped \(crashed\), just now\.$/);
});
test('summary: a saved report after an unexpected close (with and without problems before it)', () => {
  const saved = { id: 'closed-1', kind: 'closed', at: NOW - 60e3, ended: NOW - 5 * 60e3, entries: [E({ kind: 'main', src: 'main', message: 'boom', where: 'the Three Director chat' })] };
  const s = C.summarise({ now: NOW, entries: [], saved });
  assert.match(s.saved.head, /^Hearth closed unexpectedly last time \(last sign of life \d\d:\d\d\)\.$/);
  assert.equal(s.saved.counts, 'Before that: 1 main-process error.');
  assert.equal(s.saved.where, 'the Three Director chat');
  const s2 = C.summarise({ now: NOW, entries: [], saved: { ...saved, entries: [] } });
  assert.match(s2.saved.counts, /^Nothing had gone wrong before that/);
  const s3 = C.summarise({ now: NOW, entries: [], saved: { ...saved, kind: 'page' } });
  assert.match(s3.saved.head, /^The window crashed at \d\d:\d\d and came back\.$/);
});
test('report for Claude: header, both parts, every entry with its details, nothing private', () => {
  const raw = [
    { kind: 'error', src: 'window', message: 'TypeError: x at C:\\Users\\Bob Smith\\Hearth\\a.js "hello this is my private chat message"', stack: 'TypeError: x\n    at f (C:\\Users\\Bob Smith\\Hearth\\a.js:1:2)', where: 'the Lab', t: NOW - 60e3 },
    { kind: 'ipc', src: 'main', ch: 'test:x', message: 'password=hunter2 in C:\\Users\\Bob Smith\\Private\\diary.txt', t: NOW - 50e3 },
    { kind: 'main', src: 'main', message: 'Unhandled: key sk-ant-api03-abcdefghijklmnopqrstuvwxyz bob@example.com', t: NOW - 40e3 },
  ];
  const entries = raw.map((r) => C.entry(r, WIN));
  const saved = { id: 'closed-1', kind: 'closed', at: NOW - 70e3, started: NOW - 3600e3, ended: NOW - 80e3, entries: [C.entry({ kind: 'child', src: 'main', name: 'Claude (the engine program)', signal: 'SIGKILL', t: NOW - 90e3 }, WIN)] };
  const r = C.report({ now: NOW, entries, started: NOW - 120e3, saved, view: 'the Lab', info: { version: '0.1.0', os: 'Windows', release: '10.0.26100', arch: 'x64', electron: '33.0.0' } });
  assert.match(r, /^🪲 "Something broke" report from Hearth/);
  assert.match(r, /Hearth 0\.1\.0 · Windows 10\.0\.26100 x64 · Electron 33\.0\.0/);
  assert.match(r, /## Hearth closed unexpectedly last time/);
  assert.match(r, /child \(main process\) · Claude \(the engine program\) · SIGKILL/);
  assert.match(r, /## This start\nCard said: Hearth's main process hit an error, just now\./);
  assert.match(r, /error · in the Lab · TypeError: x at Hearth\/a\.js "\[text\]"\n {4}at f \(Hearth\/a\.js:1:2\)/);
  assert.match(r, /ipc \(main process\) · channel test:x · password=\[hidden\] in \[path\]/);
  assert.ok(!leaks(r), r);
});
test('bugmain: the same problem counts up, a saved report keeps the last 3, a run that ended badly becomes a redacted report', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bugcard-test-'));
  try {
    const M = require('../bugmain');
    M._test.setDir(tmp);
    M.add({ kind: 'main', message: 'boom' }); M.add({ kind: 'main', message: 'boom' });
    assert.equal(M._test.ring.length, 1);
    assert.equal(M._test.ring[0].n, 2);
    M.ipcFailed('fs:stat', Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }));
    assert.equal(M._test.ring.length, 1, 'a missing file is an answer, not a problem');
    M.ipcFailed('kv:get', new Error('EBUSY'));
    assert.equal(M._test.ring[1].kind, 'ipc');
    for (let i = 0; i < 4; i++) M._test.keepReport({ kind: 'closed', at: NOW + i, entries: [] });
    const s = M._test.readSaved();
    assert.equal(s.list.length, 3);
    assert.equal(s.list[2].at, NOW + 3);
    // a run that ended unexpectedly: its live log becomes a report (redacted again on the way)
    fs.writeFileSync(path.join(tmp, 'live.json'), JSON.stringify({ v: 1, started: NOW - 1000, entries: [{ t: NOW - 500, kind: 'main', src: 'main', what: 'x sk-abcdefghijklmnop1234 at /Users/bob/Private/x.js' }] }));
    M._test.boot({ kind: 'process', at: NOW - 400 });
    const last = M._test.readSaved().list.at(-1);
    assert.equal(last.kind, 'closed');
    assert.equal(last.ended, NOW - 400);
    assert.ok(!/sk-abc|bob|Private/.test(JSON.stringify(last)), JSON.stringify(last));
    assert.ok(!fs.existsSync(path.join(tmp, 'live.json')) || JSON.parse(fs.readFileSync(path.join(tmp, 'live.json'), 'utf8')).started !== NOW - 1000);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('bugmain: the toast that tells an error already kept is not a second problem', () => {
  const M = require('../bugmain');
  const n = M._test.ring.length;
  M.add({ kind: 'error', src: 'window', message: 'Uncaught Error: zap went wrong here' });
  M.add({ kind: 'toast', src: 'window', message: 'Something went wrong: Uncaught Error: zap went wrong here' });
  assert.equal(M._test.ring.length, n + 1);
  M.add({ kind: 'toast', src: 'window', message: 'Couldn\'t save the scene' });
  assert.equal(M._test.ring.length, n + 2);
  // the toast first, then the error it tells
  M.add({ kind: 'toast', src: 'window', message: 'Something went wrong: Uncaught Error: bang went wrong there' });
  M.add({ kind: 'error', src: 'window', message: 'Uncaught Error: bang went wrong there' });
  assert.equal(M._test.ring.length, n + 3);
  assert.equal(M._test.ring.at(-1).kind, 'error');
});
test('the Help menu has 🪲 Something broke… right under 🐢 That was slow… (both platforms)', () => {
  const N = require('../nativefeel-core');
  for (const platform of ['win32', 'darwin']) {
    let hit = '';
    const help = N.menuTemplate({ platform, act: { broke: () => { hit = 'broke'; } } }).find((m) => m.role === 'help');
    const labels = help.submenu.map((x) => x.label);
    assert.equal(labels[labels.indexOf('🐢 That was slow…') + 1], '🪲 Something broke…', platform);
    help.submenu.find((x) => x.label === '🪲 Something broke…').click();
    assert.equal(hit, 'broke');
  }
});

console.log(`bugcard-test: ${checks} checks passed`);
