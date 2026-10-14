#!/usr/bin/env node
// (round 38, bigscreen) Unit tests for bigscreen-core.js, bigscreenmain.js and the per-screen parts of nativefeelmain.js,
// with injected screens / window / IPC (no Electron): Auto size of everything from each kind of screen (laptops, Retina,
// 4K at 100 / 150 / 200 %, 5K, ultrawides, portrait), picks clamped and stepped, kept per computer and per screen (its
// kind, not its id), full screen per screen used for a set of screens not seen yet (the big monitor full screen, the
// laptop windowed), the start zoom handed to preload, the IPC, the window's events, the Lab's "huge preview steps down
// sooner" rule (the copy inside the sandbox). Node only: node dev/bigscreen-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../bigscreen-core');
const C = require('../nativefeel-core');
const NF = require('../nativefeelmain');
const BM = require('../bigscreenmain');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

// ---------- screens (Electron's display: size / bounds in points, scaleFactor) ----------
const disp = (id, x, w, h, scale = 1, menuBar = 0) => ({ id, bounds: { x, y: 0, width: w, height: h }, size: { width: w, height: h }, workArea: { x, y: menuBar, width: w, height: h - menuBar - 40 }, scaleFactor: scale });
const MBP = disp(1, 0, 1512, 982, 2, 25); // MacBook Pro 14", default scaling
const AIR = disp(1, 0, 1440, 900, 2, 25);
const K4_100 = disp(5, 1512, 3840, 2160, 1); // a 4K monitor at 100 % (Mac "more space", Windows 100 %)
const K4_150 = disp(6, 0, 2560, 1440, 1.5); // Windows' recommended 150 %
const K4_200 = disp(7, 0, 1920, 1080, 2); // Mac's default for a 4K ("looks like 1920 × 1080"), Windows 200 %
const K4_125 = disp(8, 0, 3072, 1728, 1.25);
const K5 = disp(9, 0, 2560, 1440, 2); // a 5K at 200 %
const K5_100 = disp(10, 0, 5120, 2880, 1);
const UW = disp(11, 0, 3440, 1440, 1); // 34" ultrawide
const SUW = disp(12, 0, 5120, 1440, 1); // 49" super ultrawide
const UW_4K = disp(13, 0, 5120, 2160, 1); // 5K2K ultrawide at 100 %
const FHD = disp(14, 0, 1920, 1080, 1);
const QHD = disp(15, 0, 2560, 1440, 1);
const PORTRAIT = disp(16, 0, 2160, 3840, 1);

// ---------- Auto ----------
eq(B.autoZoom(MBP), 1, 'auto: a MacBook stays at 100 %');
eq(B.autoZoom(AIR), 1, 'auto: a MacBook Air stays at 100 %');
eq(B.autoZoom(FHD), 1, 'auto: a 1080p monitor stays at 100 %');
eq(B.autoZoom(QHD), 1, 'auto: a 1440p monitor stays at 100 %');
eq(B.autoZoom(K4_100), 1.5, 'auto: a 4K at 100 % → 150 %');
eq(B.autoZoom(K4_125), 1.25, 'auto: a 4K at 125 % → 125 % more');
eq(B.autoZoom(K4_150), 1, 'auto: a 4K at 150 % (Windows already scales) → 100 %');
eq(B.autoZoom(K4_200), 1, 'auto: a 4K at 200 % (Retina-like) → 100 %');
eq(B.autoZoom(K5), 1, 'auto: a 5K at 200 % → 100 %');
eq(B.autoZoom(K5_100), 1.75, 'auto: a 5K at 100 % → 175 %');
eq(B.autoZoom(UW), 1, 'auto: a 3440 × 1440 ultrawide counts as 1440 high → 100 %');
eq(B.autoZoom(SUW), 1, 'auto: a 5120 × 1440 super ultrawide → 100 %');
eq(B.autoZoom(UW_4K), 1.5, 'auto: a 5120 × 2160 ultrawide → 150 %');
eq(B.autoZoom(PORTRAIT), 1.5, 'auto: a portrait 4K counts by its width → 150 %');
eq(B.autoZoom(disp(20, 0, 7680, 4320, 1)), 2, 'auto: an 8K at 100 % → 200 % (the most)');
eq(B.autoZoom(null), 1, 'auto: no screen info → 100 %');
eq(B.autoZoom({ size: { width: 'x' } }), 1, 'auto: junk → 100 %');
// never smaller than the room the app is laid out for (a small work area)
eq(B.autoZoom({ ...K4_100, workArea: { x: 0, y: 0, width: 1700, height: 1000 } }), 1.3, 'auto: never so big that a full window gets under 1280 × 720 points');
for (const d of [MBP, AIR, K4_100, K4_125, K4_150, K4_200, K5, K5_100, UW, SUW, UW_4K, FHD, QHD, PORTRAIT]) {
  const z = B.autoZoom(d); const a = d.workArea;
  ok(z >= 1 && z <= 2, `auto in 100…200 % (${B.describe(d)})`);
  ok(z === 1 || (a.width / z >= B.ROOM.width && a.height / z >= B.ROOM.height), `auto leaves the app its room (${B.describe(d)}: ${z})`);
}

// ---------- picks ----------
eq(B.normal('auto'), 'auto', 'pick: auto');
eq(B.normal(undefined), 'auto', 'pick: nothing = auto');
eq(B.normal(1.25), 1.25, 'pick: 125 %');
eq(B.normal('1.5'), 1.5, 'pick: "1.5"');
eq(B.normal(5), 2, 'pick: clamped to 200 %');
eq(B.normal(0.1), 0.6, 'pick: clamped to 60 %');
eq(B.normal(1.13), 1.15, 'pick: 5 % steps');
eq(B.normal(-1), 'auto', 'pick: negative = auto');
eq(B.zoomFor('auto', K4_100), 1.5, 'zoom: auto on a 4K');
eq(B.zoomFor(1, K4_100), 1, 'zoom: a pick wins over auto');
eq(B.step(1, 1), 1.1, 'step: + from 100 %');
eq(B.step(1.5, -1), 1.4, 'step: − from 150 %');
eq(B.step(2, 1), 2, 'step: + stops at 200 %');
eq(B.step(0.6, -1), 0.6, 'step: − stops at 60 %');
eq(B.step(1.5, 0), 'auto', 'step 0: back to auto');
eq(B.CHOICES, ['auto', 1, 1.25, 1.5, 1.75, 2], 'the Appearance row: Auto · 100 · 125 · 150 · 175 · 200');

// ---------- which screen ----------
eq(B.sig(K4_100), '3840x2160@1', 'sig: 4K at 100 %');
eq(B.sig(K4_200), '3840x2160@2', 'sig: 4K at 200 % (same pixels, another scale)');
eq(B.sig({ ...K4_100, id: 99 }), B.sig(K4_100), 'sig: an id changed after a restart (Windows) is the same screen');
eq(B.sig(MBP), '3024x1964@2', 'sig: the MacBook in pixels');
eq(B.describe(K4_150), '3840 × 2160 at 150 %', 'describe: plain words');
eq(B.describe(K4_100), '3840 × 2160', 'describe: no scale at 100 %');
eq(B.band(1480, 940), { size: '', ultra: false }, 'band: a laptop window');
eq(B.band(1920, 1080), { size: 'wide', ultra: false }, 'band: wide from 1800');
eq(B.band(2560, 1440), { size: 'huge', ultra: false }, 'band: huge from 2560');
eq(B.band(3440, 1440), { size: 'huge', ultra: true }, 'band: ultrawide');

// ---------- memory per computer and per screen ----------
const MAC = 'darwin:mac'; const PC = 'win32:pc';
let st = B.rememberScreen(null, MAC, K4_100, { zoom: 1.25 }, 100);
eq(B.screenOf(st, MAC, K4_100).zoom, 1.25, 'memory: the 4K keeps 125 %');
eq(B.screenOf(st, MAC, MBP), null, 'memory: the laptop has its own (none yet)');
eq(B.screenOf(st, PC, K4_100), null, 'memory: the PC has its own');
st = B.rememberScreen(st, MAC, K4_100, { fullscreen: true }, 200);
eq([B.screenOf(st, MAC, K4_100).zoom, B.screenOf(st, MAC, K4_100).fullscreen], [1.25, true], 'memory: full screen added, the size kept');
st = B.rememberScreen(st, MAC, K4_100, { zoom: 'auto' }, 300);
ok(!('zoom' in B.screenOf(st, MAC, K4_100)), 'memory: auto removes the pick');
st = B.rememberScreen(st, MAC, MBP, { fullscreen: false }, 400);
eq(B.fullscreenFor(st, MAC, K4_100, false), true, 'full screen: the big monitor (a set of screens not seen yet) opens full screen');
eq(B.fullscreenFor(st, MAC, MBP, false), false, 'full screen: the laptop opens windowed');
eq(B.fullscreenFor(st, MAC, K4_100, true), null, 'full screen: a set of screens seen before keeps nativefeel\'s');
eq(B.fullscreenFor(st, MAC, QHD, false), null, 'full screen: a screen never seen: no opinion');
let many = null;
for (let i = 0; i < 20; i++) many = B.rememberScreen(many, MAC, disp(100 + i, 0, 1000 + i, 800, 1), { zoom: 1.1 }, i);
eq(Object.keys(many.machines[MAC].screens).length, 12, 'memory: 12 screens per computer at most (the oldest go)');
// nativefeel's own saves keep the screens
st = C.remember(st, MAC, C.layoutKey([MBP]), { bounds: { x: 0, y: 30, width: 1200, height: 800 } }, 500);
ok(st.machines[MAC].screens && B.screenOf(st, MAC, K4_100)?.fullscreen === true, 'nativefeel remembering a place keeps the screens');

// ---------- main side: the file, restore, start zoom, IPC, events ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bigscreen-'));
const file = path.join(tmp, 'window.json');
const fakeScreen = (displays, primary) => {
  const L = {};
  return { getAllDisplays: () => displays, getPrimaryDisplay: () => displays.find((d) => d.id === primary) || displays[0],
    getDisplayMatching: (r) => C.displayFor(r, displays), on: (ev, fn) => { (L[ev] ||= []).push(fn); }, removeListener: (ev, fn) => { L[ev] = (L[ev] || []).filter((f) => f !== fn); }, fire: (ev) => (L[ev] || []).forEach((f) => f()), L };
};
const fakeWin = (bounds) => {
  const L = {};
  const w = { bounds: { ...bounds }, full: false, max: false, min: false, destroyed: false,
    getBounds: () => ({ ...w.bounds }), getNormalBounds: () => ({ ...w.bounds }), setBounds: (b) => { w.bounds = { ...b }; },
    isFullScreen: () => w.full, isMaximized: () => w.max, isMinimized: () => w.min, isDestroyed: () => w.destroyed, restore: () => { w.min = false; },
    setFullScreen: (on) => { w.full = on; (L[on ? 'enter-full-screen' : 'leave-full-screen'] || []).forEach((f) => f()); },
    on: (ev, fn) => { (L[ev] ||= []).push(fn); }, once: (ev, fn) => { (L[ev] ||= []).push(fn); }, emit: (ev) => (L[ev] || []).forEach((f) => f()) };
  return w;
};
const fakeIpc = () => { const H = {}; return { handle: (ch, fn) => { H[ch] = fn; }, call: (ch, ...a) => H[ch]({}, ...a), H }; };
NF._set({ dataDir: tmp, platform: 'darwin', host: 'mac' });
const me = NF.machine();
// the first start on a 4K at 100 %, nothing saved: Auto 150 % handed to preload
let scr = fakeScreen([K4_100], 5);
let placed = NF.restore(scr);
eq(placed.display?.id, 5, 'restore: says which screen it opens on');
eq(BM.startArgs(placed, scr), ['--hearth-zoom=1.5'], 'start: the 4K\'s Auto zoom for the first frame');
eq(BM.startArgs(NF.restore(fakeScreen([MBP], 1)), fakeScreen([MBP], 1)), [], 'start: the laptop at 100 % needs nothing');
// the window on the big monitor (with the laptop): go full screen there, pick 125 %
scr = fakeScreen([MBP, K4_100], 1);
let w = fakeWin({ x: 1700, y: 100, width: 2400, height: 1400 });
const sent = [];
const ipc = fakeIpc();
BM.register(ipc, { getWin: () => w, screen: scr });
NF.track(w, scr, () => {});
BM.track(w, scr, (ch, d) => sent.push([ch, d]));
let i = await0(ipc.call('big:info'));
eq([i.sig, i.pref, i.auto, i.zoom, i.fullscreen], ['3840x2160@1', 'auto', 1.5, 1.5, false], 'info: the screen the window is on');
eq(ipc.call('big:fullscreen', true), { fullscreen: true }, 'IPC: full screen on');
ok(w.full, 'IPC: the window is full screen');
let saved = JSON.parse(fs.readFileSync(file, 'utf8'));
eq(saved.machines[me].screens['3840x2160@1'].fullscreen, true, 'full screen remembered for the 4K (entering it, from any way in)');
ok(sent.some(([ch, d]) => ch === 'big:display' && d.fullscreen === true), 'the window is told (big:display)');
i = ipc.call('big:zoom', 1.25);
eq([i.pref, i.zoom], [1.25, 1.25], 'IPC: 125 % for this screen');
eq(ipc.call('big:fullscreen', 'toggle'), { fullscreen: false }, 'IPC: toggle → windowed');
eq(ipc.call('big:fullscreen', 'toggle'), { fullscreen: true }, 'IPC: toggle → full screen');
w.min = true; ipc.call('big:fullscreen', false); ok(!w.min && !w.full, 'IPC: a minimised window is restored first');
ipc.call('big:fullscreen', true);
w.emit('close');
saved = JSON.parse(fs.readFileSync(file, 'utf8'));
eq(saved.machines[me].screens['3840x2160@1'].zoom, 1.25, 'the pick survives nativefeel\'s save on close');
ok(saved.machines[me].layouts[C.layoutKey([MBP, K4_100])]?.fullscreen === true, 'nativefeel\'s layout entry says full screen too');
// tests-only size: refused outside the test harness
delete process.env.HEARTH_TEST_SAVE_DIR;
eq(ipc.call('big:testBounds', { width: 100, height: 100 }), null, 'big:testBounds does nothing outside the tests');
// moved to the laptop's screen: windowed there, the window re-zooms for it
w.full = false; // (the next start: the window on the laptop's screen)
w.bounds = { x: 100, y: 60, width: 1200, height: 800 };
ipc.call('big:fullscreen', false);
i = ipc.call('big:info');
eq([i.sig, i.zoom, i.pref], ['3024x1964@2', 1, 'auto'], 'on the laptop: its own size (Auto, 100 %)');
// the next start: the laptop alone (a layout seen before? no: the first save was with both) → windowed
fs.writeFileSync(file, JSON.stringify(B.rememberScreen(JSON.parse(fs.readFileSync(file, 'utf8')), me, MBP, { fullscreen: false })));
placed = NF.restore(fakeScreen([MBP], 1));
eq(placed.fullscreen, false, 'restart on the laptop alone: windowed');
// a new set of screens (the 4K with another laptop arrangement) where the window lands on the 4K: full screen
const MBP_RIGHT = { ...MBP, bounds: { ...MBP.bounds, x: 3840 }, workArea: { ...MBP.workArea, x: 3840 } };
const K4_LEFT = { ...K4_100, bounds: { ...K4_100.bounds, x: 0 }, workArea: { ...K4_100.workArea, x: 0 } };
let s2 = JSON.parse(fs.readFileSync(file, 'utf8'));
s2 = C.remember(s2, me, 'other', { bounds: { x: 200, y: 100, width: 2400, height: 1400 }, fullscreen: false }, Date.now() + 10);
fs.writeFileSync(file, JSON.stringify(s2));
placed = NF.restore(fakeScreen([K4_LEFT, MBP_RIGHT], 1));
eq([placed.display?.id, placed.fullscreen], [5, true], 'a set of screens not seen yet: on the 4K, full screen as the 4K had it');
eq(BM.startArgs(placed, fakeScreen([K4_LEFT, MBP_RIGHT], 1)), ['--hearth-zoom=1.25'], 'start: the 4K\'s own pick (125 %)');
(async () => {
// a screen's scale changed while running: the window is told
sent.length = 0;
scr.fire('display-metrics-changed');
await new Promise((r) => setTimeout(r, 300));
ok(sent.some(([ch, d]) => ch === 'big:display' && d.sig === '3024x1964@2'), 'a move / screen change → big:display (the laptop now)');
const n0 = sent.length; scr.fire('display-metrics-changed'); await new Promise((r) => setTimeout(r, 300));
eq(sent.length, n0, 'nothing changed: nothing sent again');
w.emit('closed');
ok(!(scr.L['display-metrics-changed'] || []).length, 'listeners removed when the window closes');

// ---------- the menus: the size of everything ----------
const tpl = C.menuTemplate({ platform: 'darwin', act: {} });
const view = tpl.find((m) => m.label === 'View');
ok(view.submenu.some((x) => x.role === 'togglefullscreen'), 'View menu: full screen (⌃⌘F, the green button\'s own)');
ok(view.submenu.some((x) => /Bigger/.test(x.label || '') && x.registerAccelerator === false), 'View menu: bigger (the page\'s own key)');

// ---------- the Lab: a huge preview steps down after one slow window ----------
const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'three-sandbox.html'), 'utf8');
const src = /\/\/ <adapt-core>[^\n]*\n([\s\S]*?)\/\/ <\/adapt-core>/.exec(html)?.[1];
ok(src && /quick/.test(src), 'the sandbox\'s adapt core has the big-preview rule');
ok(/AD_BIG_PX = 6e6/.test(html) && /quick: adBigPx/.test(html), 'the sandbox passes the preview\'s pixels (over 6 million) to it');
const adaptCore = new Function(`${src}\nreturn adaptCore;`)();
const firstStep = (quick) => {
  const A = adaptCore({ quick: () => quick });
  let t = 0;
  for (let k = 0; k < 4000; k++) { const g = k % 5 < 2 ? 40 : 16; t += g; const v = A.feed(g, 1000 / 60, t); if (v?.step) return t; } // (40 % of the frames slow: sustained, not badly slow)
  return null;
};
const small = firstStep(false); const huge = firstStep(true);
ok(huge && small && huge < small, `a huge slow preview steps down sooner (${huge} ms vs ${small} ms)`);
const A2 = adaptCore({ quick: () => true });
let t2 = 0; for (let k = 0; k < 4000; k++) { t2 += 50; A2.feed(50, 1000 / 60, t2); }
eq(A2.level <= 9, true, 'the big-preview rule still stops at the lightest step');
const A3 = adaptCore({ quick: () => true });
let t3 = 0; for (let k = 0; k < 4000; k++) { t3 += 10; A3.feed(10, 1000 / 60, t3); }
eq(A3.level, 0, 'a huge preview that keeps up stays at full quality');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${fail ? 'FAIL' : 'OK'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
function await0(v) { return v; }
