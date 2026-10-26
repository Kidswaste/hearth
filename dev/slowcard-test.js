// (round 67, slowbutton67) 🐢 That was slow: unit tests for slowcard-core.js — sightings from both processes merged into
// one hiccup, the cause chosen by the strongest witness (a named main-process IPC > the main process late > the GPU >
// the Lab preview > the window's own frame > an input that waited), the headline's words, the 30 s window with the
// last minute as a fallback, the day line, plain channel / file names, the report for Claude.
//   node dev/slowcard-test.js
'use strict';
const assert = require('node:assert/strict');
const C = require('../slowcard-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const NOW = new Date(2026, 9, 26, 18, 30, 0).getTime();
const snap = (o = {}) => ({ now: NOW, win: 30e3, view: 'chat', labOn: false, lab: null, events: [], main: { slow: [], late: [], jobs: [], events: [], lag: null }, env: { platform: 'win32', hz: 240, gpu: 'RTX 4080' }, day: { today: 3, yesterday: 7, days: {} }, ...o });
const frame = (t, ms, x = {}) => ({ t, kind: 'frame', ms, area: 'chat', s: ms - 20, f: 0, r: 15, o: 5, file: 'native.js', fn: 'paint', lab: false, ...x });

test('nothing recorded: a calm "no hiccup" headline, the day line, no cause', () => {
  const s = C.summarise(snap());
  assert.equal(s.found, false);
  assert.match(s.headline, /^No hiccup in the last 30 s/);
  assert.equal(s.cause, '');
  assert.equal(s.day, 'Hiccups over 500 ms today: 3 (yesterday: 7)');
  assert.match(s.tip, /outside Hearth/);
});

test('small long frames (< 200 ms) are not hiccups', () => {
  const s = C.summarise(snap({ events: [frame(NOW - 5000, 120), frame(NOW - 3000, 180)] }));
  assert.equal(s.found, false);
});

test('a named main-process IPC wins: "main process busy with your settings", in the area the frame happened', () => {
  const t = NOW - 4000;
  const s = C.summarise(snap({ events: [frame(t + 50, 1300, { area: 'Lab', lab: true }), { t: t + 30, kind: 'input', id: 7, ms: 1400, type: 'pointerdown', area: 'Lab', lab: true }],
    main: { slow: [{ t, ms: 1380, what: 'config:save' }], late: [{ t: t + 10, ms: 1350 }], jobs: [], events: [], lag: { max: 1390, p99: 40, since: NOW - 60e3 } } }));
  assert.equal(s.found, true);
  assert.equal(s.last.kind, 'main');
  assert.equal(s.headline, 'The last hiccup: 1.4 s, while you were in the Lab (main process busy with your settings).');
  assert.match(s.lines[0], /spent 1\.4 s on your settings \(config:save\)/);
  assert.match(s.lines[1], /The Lab was open and drawing then/);
  assert.match(s.tip, /main process/);
});

test('the main process late without a named handler: names a job that had just started', () => {
  const t = NOW - 8000;
  const s = C.summarise(snap({ events: [{ t: t + 100, kind: 'input', id: 1, ms: 900, type: 'keydown', area: 'chat' }],
    main: { slow: [], late: [{ t, ms: 1100 }], jobs: [{ t: t - 1500, what: 'a cloud sync pass' }], events: [], lag: null } }));
  assert.equal(s.last.kind, 'main');
  assert.equal(s.headline, 'The last hiccup: 1.1 s, while you were in a chat (main process busy, around a cloud sync pass).');
  assert.match(s.lines[0], /didn't answer the window for 1\.1 s; a cloud sync pass had just started/);
});

test('the Lab preview\'s slow frame: "the Lab preview\'s drawing took …", Light mode tip', () => {
  const s = C.summarise(snap({ view: 'Lab', labOn: true, lab: { fps: 52, worst: 30, cap: 0 }, events: [{ t: NOW - 2500, kind: 'lab', ms: 1600, area: 'Lab', fps: 12, lab: true }] }));
  assert.equal(s.last.kind, 'lab');
  assert.equal(s.headline, 'The last hiccup: 1.6 s, while you were in the Lab (the Lab preview\'s drawing took 1.6 s).');
  assert.match(s.tip, /Light mode/);
  assert.match(s.lines.join(' '), /now the Lab preview is drawing \(52 fps, worst frame 30 ms\)/);
});

test('a GPU context loss next to a freeze: the graphics card', () => {
  const t = NOW - 6000;
  const s = C.summarise(snap({ events: [frame(t, 900, { area: 'Lab', lab: true }), { t: t + 200, kind: 'gpu', ms: 0, area: 'Lab', what: 'A WebGL view lost its GPU context' }] }));
  assert.equal(s.last.kind, 'gpu');
  assert.match(s.headline, /^The last hiccup: 900 ms, while you were in the Lab \(the graphics card reset a drawing\)\.$/);
  assert.match(s.lines[0], /lost its GPU context/);
});

test('the window\'s own frame: script / layout / paint words and the file in plain words', () => {
  const s1 = C.summarise(snap({ events: [frame(NOW - 3000, 700, { s: 650, r: 30, o: 20, file: 'tools/quest-atlas.js', fn: 'render', area: 'quests' })] }));
  assert.equal(s1.headline, 'The last hiccup: 700 ms, while you were in Sidequest Studio (the window busy running quests (render)).');
  const s2 = C.summarise(snap({ events: [frame(NOW - 3000, 600, { s: 50, f: 500, r: 30, o: 20, file: 'native.js' })] }));
  assert.match(s2.cause, /re-measuring its layout for the chat view/);
  const s3 = C.summarise(snap({ events: [frame(NOW - 3000, 600, { s: 20, f: 0, r: 560, o: 20, file: '' })] }));
  assert.equal(s3.cause, 'the window redrawing (style, layout and paint)');
});

test('an input that waited with the window idle: points away from the window', () => {
  const s = C.summarise(snap({ events: [{ t: NOW - 1000, kind: 'input', id: 3, ms: 800, type: 'click', area: 'board' }] }));
  assert.equal(s.last.kind, 'input');
  assert.equal(s.headline, 'The last hiccup: 800 ms, while you were in the mood board (your click waited for the screen, the window itself was free).');
});

test('several hiccups: the last one leads, the count and the worst follow; separate when apart', () => {
  const s = C.summarise(snap({ events: [frame(NOW - 20000, 1800), frame(NOW - 12000, 400), frame(NOW - 3000, 600)] }));
  assert.equal(s.count, 3);
  assert.equal(s.last.ms, 600);
  assert.equal(s.worst.ms, 1800);
  assert.match(s.lines.join(' '), /3 hiccups in the last 30 s, the worst 1\.8 s/);
});

test('sightings that overlap (or within 400 ms) are one hiccup; its length is the longest sighting', () => {
  const t = NOW - 5000;
  const hs = C.hiccups(snap({ events: [frame(t, 500), frame(t + 600, 300), { t: t + 100, kind: 'input', id: 1, ms: 1200, type: 'click', area: 'chat' }] }));
  assert.equal(hs.length, 1);
  assert.equal(hs[0].ms, 1200);
  assert.equal(hs[0].parts.length, 3);
  const apart = C.hiccups(snap({ events: [frame(t, 300), frame(t + 1200, 300)] }));
  assert.equal(apart.length, 2);
});

test('older than 30 s but in the last minute: still shown, with its age', () => {
  const s = C.summarise(snap({ events: [frame(NOW - 50000, 1200)] }));
  assert.equal(s.found, true);
  assert.equal(s.count, 0);
  assert.match(s.headline, /^The last hiccup: 1\.2 s, 49 s ago, while you were in a chat/);
});

test('the watch off: says so (nothing recorded), offers turning it on', () => {
  const s = C.summarise(snap({ off: true, events: [frame(NOW - 3000, 900)] }));
  assert.match(s.headline, /watch is off/);
  assert.match(s.tip, /button below/);
});

test('the main process\'s lag mentioned when the hiccup was elsewhere', () => {
  const s = C.summarise(snap({ events: [frame(NOW - 3000, 700)], main: { slow: [], late: [], jobs: [], events: [], lag: { max: 2100, p99: 30, since: NOW - 120e3 } } }));
  assert.match(s.lines.join(' '), /main process was also late by up to 2\.1 s/);
});

test('day line: numbers, zeros by default', () => {
  assert.equal(C.dayLine({ today: 0, yesterday: 12 }), 'Hiccups over 500 ms today: 0 (yesterday: 12)');
  assert.equal(C.dayLine(), 'Hiccups over 500 ms today: 0 (yesterday: 0)');
});

test('plain names: IPC channels and files, unknown ones kept', () => {
  assert.equal(C.plainIpc('kv:get'), 'reading or saving app data');
  assert.equal(C.plainIpc('config:save'), 'your settings');
  assert.equal(C.plainIpc('jank:test-stall'), 'a test freeze (made on purpose)');
  assert.equal(C.plainIpc('creative-vst:scan'), 'the Sound desk');
  assert.equal(C.plainIpc('weird:thing'), '“weird:thing”');
  assert.equal(C.plainFile('tools/three-media.js'), 'the Lab');
  assert.equal(C.plainFile('foo.js'), 'foo');
  assert.equal(C.where('Lab'), 'the Lab');
  assert.equal(C.where('xyz'), 'the xyz page');
});

test('report for Claude: machine, the card\'s words, every sighting with numbers, main handlers, daily counts', () => {
  const t = NOW - 4000;
  const S = snap({ events: [frame(t + 50, 1300, { area: 'Lab', lab: true })], main: { slow: [{ t, ms: 1380, what: 'config:save' }], late: [], jobs: [{ t: t - 500, what: 'a cloud sync pass' }], events: [], lag: { max: 1390, p99: 40, since: NOW - 60e3 } },
    day: { today: 2, yesterday: 5, days: { '2026-10-25': 5, '2026-10-26': 2 } } });
  const r = C.report(S);
  assert.match(r, /win32 240 Hz RTX 4080/);
  assert.match(r, /Card said: The last hiccup: 1\.4 s/);
  assert.match(r, /main IPC handler "config:save" ran 1380 ms synchronously/);
  assert.match(r, /frame 1300 ms: script 1280, forced layout 0/);
  assert.match(r, /main jobs started nearby: a cloud sync pass @-4\.5s/);
  assert.match(r, /p99 40 ms, max 1390 ms/);
  assert.match(r, /2026-10-25 5, 2026-10-26 2/);
  assert.doesNotMatch(r, /undefined|NaN/);
});

console.log(`\nslowcard-test: ${checks} checks passed`);
