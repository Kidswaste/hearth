#!/usr/bin/env node
// (round 52, gpu52) Unit tests for the graphics path decisions, every platform simulated (process.platform overridden):
// gpu52-core.js (which switches a Windows / Mac / Linux start gets for each choice, the way back when a picked ANGLE
// path never reached the card, Windows' own per-app graphics choice never overriding yours, ANGLE renderer strings →
// card + path, two-card laptops, the Settings line, the "started without the card" note: once, never on a VM) and
// gpu52main.js with a stand-in Electron app (commandLine, getGPUFeatureStatus / getGPUInfo, ipcMain, a temp data folder,
// a fake `reg`).
//   node dev/gpu52-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const Core = require(path.join(__dirname, '..', 'gpu52-core.js'));

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const names = (d) => d.switches.map(([n, v]) => (v ? `${n}=${v}` : n)).sort().join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GPU = { gpu_compositing: 'enabled', webgl: 'enabled', webgl2: 'enabled', video_decode: 'enabled', rasterization: 'enabled' };
const SOFT = { gpu_compositing: 'disabled_software', webgl: 'unavailable_software', webgl2: 'unavailable_software', video_decode: 'disabled_software' };
const NVIDIA = { auxAttributes: { glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)', optimus: false }, gpuDevice: [{ active: true, vendorId: 0x10de, deviceId: 0x2684, driverVersion: '31.0.15.5222' }] };
const OPTIMUS = { auxAttributes: { glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002860) Direct3D11 vs_5_0 ps_5_0, D3D11)', optimus: true }, gpuDevice: [{ active: true, vendorId: 0x10de, deviceId: 0x2860 }, { active: false, vendorId: 0x8086, deviceId: 0xa7a0 }] };
const M2 = { auxAttributes: { glRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)' }, gpuDevice: [{ active: true, vendorId: 0x106b, deviceId: 0 }] };
const MBP_DUAL = { auxAttributes: { glRenderer: 'ANGLE (AMD, ANGLE Metal Renderer: AMD Radeon Pro 5500M, Unspecified Version)', amdSwitchable: false }, gpuDevice: [{ active: true, vendorId: 0x1002, deviceId: 0x7340 }, { active: false, vendorId: 0x8086, deviceId: 0x3e9b }] };
const VM = { auxAttributes: { glRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' }, gpuDevice: [{ active: true, vendorId: 0x15ad, deviceId: 0x405 }] };
const NOGPU = { gpuDevice: [{ active: false, vendorId: 0, deviceId: 0 }] };

// ---------- which switches each platform gets ----------
{
  const w = Core.decide({ platform: 'win32' });
  ok(names(w) === 'force_high_performance_gpu', `Windows default: the fast card app-wide, D3D11 untouched (${names(w)})`);
  ok(w.backend === 'd3d11' && w.auto && !w.marker, 'Windows default path: D3D11, nothing to watch');
  const m = Core.decide({ platform: 'darwin' });
  ok(names(m) === '', `Mac default: no switches (Metal; the Lab's contexts ask for the fast card) (${names(m)})`);
  ok(m.backend === 'metal', 'Mac default path: Metal');
  ok(names(Core.decide({ platform: 'linux' })) === '', 'Linux default: no switches');
  ok(names(Core.decide({ platform: 'darwin', settings: { gpuPower: 'high' } })) === 'force_high_performance_gpu', 'Mac power high: the fast card app-wide');
  ok(names(Core.decide({ platform: 'win32', settings: { gpuPower: 'saver' } })) === 'force_low_power_gpu', 'Windows power saver: the small card, not the fast one');
  ok(names(Core.decide({ platform: 'darwin', settings: { gpuPower: 'saver' } })) === 'force_low_power_gpu', 'Mac power saver');
  ok(names(Core.decide({ platform: 'win32', marker: { win: { user: true } } })) === '', 'Windows: your own Windows graphics choice is kept (no app-wide switch)');
  ok(names(Core.decide({ platform: 'win32', settings: { gpuPower: 'high' }, marker: { win: { user: true } } })) === 'force_high_performance_gpu', 'Windows power high asked in Hearth: the fast card even so');
  const v = Core.decide({ platform: 'win32', settings: { gpuBackend: 'vulkan' } });
  ok(names(v) === 'force_high_performance_gpu use-angle=vulkan', `Windows backend vulkan: use-angle=vulkan (${names(v)})`);
  ok(v.marker?.key === 'vulkan' && v.marker.state === 'pending', 'a picked path is watched (pending until the start reaches the card)');
  ok(names(Core.decide({ platform: 'darwin', settings: { gpuBackend: 'metal' } })) === 'use-angle=metal', 'Mac backend metal');
  ok(Core.decide({ platform: 'darwin', settings: { gpuBackend: 'vulkan' } }).choice.backend === 'auto', 'a path the platform lacks (Vulkan on a Mac) → the default');
  ok(Core.decide({ platform: 'win32', settings: { gpuBackend: 'metal' } }).switches.every(([n]) => n !== 'use-angle'), 'Metal on Windows: ignored');
  ok(names(Core.decide({ platform: 'win32', settings: { gpuIgnoreBlocklist: true }, marker: { win: { user: true } } })) === 'ignore-gpu-blocklist', 'blocklist ignore: ignore-gpu-blocklist');
  ok(Core.decide({ platform: 'win32', settings: { gpuBackend: 'vulkan' }, argv: ['electron', '.', '--use-angle=swiftshader'] }).switches.every(([n]) => n !== 'use-angle'), 'a --use-angle already on the command line (tests, your own shortcut) wins');
  ok(Core.decide({ platform: 'win32', settings: { gpuPower: 'bogus', gpuBackend: 'nope' } }).choice.power === 'auto', 'unknown values → the defaults');
  // nothing that caps / uncaps frames or turns the card off, in any combination
  let bad = 0;
  for (const platform of ['win32', 'darwin', 'linux']) for (const gpuPower of Core.POWERS) for (const gpuBackend of Core.BACKENDS[platform]) for (const gpuIgnoreBlocklist of [false, true]) {
    const d = Core.decide({ platform, settings: { gpuPower, gpuBackend, gpuIgnoreBlocklist } });
    if (d.switches.some(([n]) => Core.NEVER.includes(n) || /frame-rate|vsync|disable-gpu/.test(n))) bad += 1;
  }
  ok(bad === 0, 'no combination adds disable-frame-rate-limit / disable-gpu-vsync / disable-gpu');
}

// ---------- the way back ----------
{
  const s = { gpuBackend: 'vulkan' };
  const pend = Core.decide({ platform: 'win32', settings: s, marker: { key: 'vulkan', state: 'pending' } });
  ok(pend.fellBack?.why === 'never-started' && !pend.switches.some(([n]) => n === 'use-angle'), 'the last start with Vulkan never reached the card → D3D11 this time');
  ok(pend.marker?.state === 'failed', '… and Vulkan is marked failed');
  const failed = Core.decide({ platform: 'win32', settings: s, marker: { key: 'vulkan', state: 'failed' } });
  ok(failed.fellBack?.why === 'failed' && failed.backend === 'd3d11', 'failed stays on D3D11 until the choice changes');
  const good = Core.decide({ platform: 'win32', settings: s, marker: { key: 'vulkan', state: 'ok' } });
  ok(!good.fellBack && good.switches.some(([n, val]) => n === 'use-angle' && val === 'vulkan'), 'a path that worked before is used (and watched again)');
  const other = Core.decide({ platform: 'win32', settings: { gpuBackend: 'gl' }, marker: { key: 'vulkan', state: 'failed' } });
  ok(!other.fellBack && other.marker?.key === 'gl', 'a new pick gets its own try');
  const back = Core.decide({ platform: 'win32', settings: {}, marker: { key: 'vulkan', state: 'failed', win: { ours: 2 } } });
  ok(back.marker && back.marker.key === '' && back.marker.win?.ours === 2, 'back on the defaults: the watch is cleared, Windows\' choice remembered');
  ok(Core.settle({ key: 'vulkan', state: 'pending' }, 'gpu')?.state === 'ok', 'reached the card → ok');
  ok(Core.settle({ key: 'vulkan', state: 'pending' }, 'software')?.state === 'failed', 'drawing in software → failed');
  ok(Core.settle({ key: 'vulkan', state: 'pending' }, 'unknown') === null && Core.settle({ key: 'vulkan', state: 'ok' }, 'software') === null, 'unknown / not pending: unchanged');
}

// ---------- Windows' per-app graphics choice ----------
{
  const a = Core.winPref({ current: null, power: 'auto' });
  ok(a.write === 'GpuPreference=2;' && !a.user, 'none set: Hearth writes "the fast card"');
  ok(Core.winPref({ current: 'GpuPreference=1;', ours: null, power: 'auto' }).write === null && Core.winPref({ current: 'GpuPreference=1;', ours: null }).user, 'yours (power saving): never changed, and Hearth stops asking app-wide');
  ok(Core.winPref({ current: 'GpuPreference=0;', ours: 2 }).user && Core.winPref({ current: 'GpuPreference=0;', ours: 2 }).write === null, 'changed in Windows after Hearth wrote it: yours from then on');
  ok(Core.winPref({ current: 'GpuPreference=2;', ours: 2, power: 'saver' }).write === 'GpuPreference=1;', 'ours, and you chose saver in Hearth: updated');
  ok(Core.winPref({ current: 'GpuPreference=2;', ours: 2, power: 'auto' }).write === null, 'ours and right: nothing written');
  ok(Core.winPref({ current: 'SwapEffectUpgradeEnable=1;', power: 'auto' }).write === 'SwapEffectUpgradeEnable=1;GpuPreference=2;', 'Windows\' other game settings in the value are kept');
  ok(!Core.winPref({ current: 'SwapEffectUpgradeEnable=1;GpuPreference=2;', ours: null, power: 'auto' }).user, 'already the fast card (set by you): nothing to do, not a conflict');
}

// ---------- what the card is ----------
{
  const n = Core.parseRenderer(NVIDIA.auxAttributes.glRenderer);
  ok(n.name === 'NVIDIA GeForce RTX 4090' && n.backend === 'D3D11', `NVIDIA D3D11 → ${JSON.stringify(n)}`);
  const m = Core.parseRenderer(M2.auxAttributes.glRenderer);
  ok(m.name === 'Apple M2 Max' && m.backend === 'Metal', `Apple Metal → ${JSON.stringify(m)}`);
  ok(Core.parseRenderer('ANGLE (AMD, Vulkan 1.3.260 (AMD Radeon RX 7900 XTX (0x0000744C)), AMD proprietary driver)').backend === 'Vulkan', 'Vulkan path read');
  ok(Core.parseRenderer('ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)').name === 'Intel(R) UHD Graphics 770', 'Intel name');
  ok(Core.parseRenderer(VM.auxAttributes.glRenderer).backend === 'software', 'SwiftShader → software');
  ok(Core.parseRenderer('').name === '' && Core.parseRenderer(undefined).backend === '', 'nothing → empty');
  ok(Core.dualGpu(OPTIMUS) && Core.dualGpu(MBP_DUAL) && !Core.dualGpu(NVIDIA) && !Core.dualGpu(M2) && !Core.dualGpu(VM), 'two-card laptops found (Optimus, a dual-GPU MacBook Pro); one card / a VM not');
  ok(Core.hasRealGpu(NVIDIA) && !Core.hasRealGpu(VM) && !Core.hasRealGpu(NOGPU) && !Core.hasRealGpu(null), 'a real card vs a VM / none');
  ok(Core.gpuName({ gpuDevice: [{ active: true, vendorId: 0x10de, deviceString: 'NVIDIA GeForce RTX 3080' }] }) === 'NVIDIA GeForce RTX 3080', 'name from the device string without ANGLE');
}

// ---------- the Settings line ----------
{
  const w = Core.decide({ platform: 'win32' });
  const l = Core.line({ info: NVIDIA, status: GPU, hz: 240, decision: w });
  ok(l === 'Graphics: NVIDIA GeForce RTX 4090 (D3D11) · 240 Hz · hardware video ✓', `the line: ${l}`);
  ok(Core.line({ info: NVIDIA, status: GPU, hz: 240, fps: 60, decision: w }).includes('240 Hz (drawing 60 fps)'), 'a 240 Hz screen drawn at 60: said');
  ok(!Core.line({ info: NVIDIA, status: GPU, hz: 240, fps: 238, decision: w }).includes('drawing'), 'drawn at the screen\'s pace: not said');
  ok(Core.line({ info: M2, status: GPU, hz: 120, decision: Core.decide({ platform: 'darwin' }) }) === 'Graphics: Apple M2 Max (Metal) · 120 Hz · hardware video ✓', 'Mac line');
  ok(Core.line({ info: OPTIMUS, status: GPU, hz: 165, decision: w }).endsWith('· fast card for the Lab'), 'two cards: which one is said');
  const s = Core.line({ info: NVIDIA, status: SOFT, hz: 60, decision: w });
  ok(/^Graphics: software drawing \(NVIDIA GeForce RTX 4090 not in use\) · 60 Hz · hardware video ✗$/.test(s), `software line: ${s}`);
  ok(Core.line({}) === 'Graphics: graphics card', 'nothing known: still a line');
}

// ---------- started without the card ----------
{
  const w = Core.decide({ platform: 'win32' });
  const b = Core.startNote({ status: SOFT, info: NVIDIA, decision: w });
  ok(b?.why === 'blocklist' && !b.restart && /driver/.test(b.text), 'a real card, defaults, no crash: the driver guard (no Restart: it wouldn\'t help)');
  const c = Core.startNote({ status: SOFT, info: NVIDIA, decision: w, crashes: 2 });
  ok(c?.why === 'crash' && c.restart, 'the card stopped while starting: Restart');
  const v = Core.startNote({ status: SOFT, info: NVIDIA, decision: Core.decide({ platform: 'win32', settings: { gpuBackend: 'vulkan' } }) });
  ok(v?.why === 'backend' && v.restart && /Vulkan/.test(v.text) && /D3D11/.test(v.text), 'a picked path in software: Restart goes back to D3D11');
  ok(Core.startNote({ status: SOFT, info: NVIDIA, decision: w, told: b.id }) === null, 'told once (same card, driver and reason)');
  ok(Core.startNote({ status: SOFT, info: VM, decision: w }) === null && Core.startNote({ status: SOFT, info: NOGPU, decision: w }) === null, 'a VM / no card: never told');
  ok(Core.startNote({ status: GPU, info: NVIDIA, decision: w }) === null, 'on the card: nothing');
  const fb = Core.decide({ platform: 'darwin', settings: { gpuBackend: 'gl' }, marker: { key: 'gl', state: 'pending' } });
  const f = Core.startNote({ status: GPU, info: M2, decision: fb });
  ok(f?.why === 'never-started' && /OpenGL/.test(f.text) && /Metal/.test(f.text) && !f.restart, 'went back by itself: told, on the card now');
  ok(Core.startNote({ status: GPU, info: M2, decision: fb, told: f.id }) === null, '… once');
}
ok(Core.playWindowPrefs().backgroundThrottling === false, 'the ▶ Play window: never throttled when covered / on another screen');
ok(Core.contextDefaults().powerPreference === 'high-performance' && Core.contextDefaults('saver').powerPreference === 'low-power', 'contexts: the fast card (saver: the small one)');

{
  const asked = [];
  class FakeCanvas { getContext(type, opts) { asked.push([type, opts?.powerPreference]); return {}; } }
  global.HTMLCanvasElement = FakeCanvas;
  eval(Core.pagePatch()); eval(Core.pagePatch()); // (twice: patched once)
  const c = new FakeCanvas();
  c.getContext('webgl2'); c.getContext('webgl', { powerPreference: 'default' }); c.getContext('webgl2', { powerPreference: 'low-power' }); c.getContext('2d');
  ok(JSON.stringify(asked) === JSON.stringify([['webgl2', 'high-performance'], ['webgl', 'high-performance'], ['webgl2', 'low-power'], ['2d', undefined]]), `a game page's WebGL asks for the fast card unless it asked itself (${JSON.stringify(asked)})`);
  delete global.HTMLCanvasElement;
}

// ---------- gpu52main.js with a stand-in Electron (process.platform overridden) ----------
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const setPlatform = (p) => Object.defineProperty(process, 'platform', { value: p, configurable: true });
function fakeApp(statusRef, infoRef) {
  const app = new EventEmitter();
  const sw = new Map();
  app.commandLine = { appendSwitch: (n, v) => sw.set(n, v ?? ''), hasSwitch: (n) => sw.has(n), getSwitchValue: (n) => sw.get(n) || '' };
  app.getGPUFeatureStatus = () => statusRef.v;
  app.getGPUInfo = async () => infoRef.v;
  app.sw = sw;
  return app;
}
function fakeIpc() { const h = new Map(); return { handle: (n, f) => h.set(n, f), call: (n, ...a) => h.get(n)({}, ...a) }; }
function fakeWin() { const sent = []; return { sent, isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }), webContents: { send: (c, d) => sent.push([c, d]) } }; }
const screen = { getDisplayMatching: () => ({ displayFrequency: 239.76 }), getPrimaryDisplay: () => ({ displayFrequency: 60 }) };
const fresh = () => { delete require.cache[require.resolve('../gpu52main.js')]; return require('../gpu52main.js'); };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu52-'));
  try {
    for (const plat of ['win32', 'darwin']) {
      setPlatform(plat);
      const dir = fs.mkdtempSync(path.join(tmp, plat));
      const M = fresh();
      const status = { v: GPU }; const info = { v: plat === 'win32' ? NVIDIA : M2 };
      const app = fakeApp(status, info);
      const d = M.early(app, { settings: { gpuBackend: plat === 'win32' ? 'vulkan' : 'gl' }, dataDir: dir, argv: ['electron', '.'] });
      ok(app.sw.get('use-angle') === (plat === 'win32' ? 'vulkan' : 'gl'), `${plat}: early() appends the picked path`);
      ok(plat === 'win32' ? app.sw.has('force_high_performance_gpu') : !app.sw.has('force_high_performance_gpu'), `${plat}: the fast card app-wide only on Windows`);
      ok(JSON.parse(fs.readFileSync(path.join(dir, 'gpu52.json'), 'utf8')).state === 'pending', `${plat}: the start marker says pending before the window`);
      ok(d.platform === plat, `${plat}: decided for process.platform`);
      const ipc = fakeIpc(); const win = fakeWin();
      const R = M.register(ipc, { getWin: () => win, app, screen, delays: { settle: 20, late: 40, reg: 1e9 } });
      await sleep(70);
      ok(JSON.parse(fs.readFileSync(path.join(dir, 'gpu52.json'), 'utf8')).state === 'ok', `${plat}: reached the card → ok`);
      ok(!win.sent.length, `${plat}: on the card: no note`);
      const i = await ipc.call('gpu52:info', { fps: 240 });
      ok(i.hz === 240 && i.kind === 'gpu' && i.video && /240 Hz · hardware video ✓/.test(i.line), `${plat}: gpu52:info → ${i.line}`);
      ok(i.flags['disable-frame-rate-limit'] === false && i.flags['disable-gpu-vsync'] === false, `${plat}: no frame-rate switches in effect`);
      R.dispose();

      // the next start crashed before it could tell: back to the default, said once
      const M2nd = fresh(); const app2 = fakeApp(status, info);
      fs.writeFileSync(path.join(dir, 'gpu52.json'), JSON.stringify({ key: plat === 'win32' ? 'vulkan' : 'gl', state: 'pending' }));
      const d2 = M2nd.early(app2, { settings: { gpuBackend: plat === 'win32' ? 'vulkan' : 'gl' }, dataDir: dir, argv: [] });
      ok(!app2.sw.has('use-angle') && d2.fellBack?.why === 'never-started', `${plat}: a start that never reached the card → the default next time`);
      const win2 = fakeWin(); const R2 = M2nd.register(fakeIpc(), { getWin: () => win2, app: app2, screen, delays: { settle: 10, late: 30, reg: 1e9 } });
      await sleep(60);
      ok(win2.sent.length === 1 && win2.sent[0][1].why === 'never-started', `${plat}: told once that it went back (${win2.sent.length})`);
      R2.dispose();
    }

    // software at the start on a real card (Windows, defaults): told once, not again at the next start
    setPlatform('win32');
    {
      const dir = fs.mkdtempSync(path.join(tmp, 'soft'));
      for (const round of [1, 2]) {
        const M = fresh(); const status = { v: SOFT }; const info = { v: NVIDIA };
        const app = fakeApp(status, info); M.early(app, { settings: {}, dataDir: dir, argv: [] });
        const win = fakeWin(); const R = M.register(fakeIpc(), { getWin: () => win, app, screen, delays: { settle: 10, late: 25, reg: 1e9 } });
        await sleep(50);
        ok(win.sent.length === (round === 1 ? 1 : 0), `software start, run ${round}: ${round === 1 ? 'told once' : 'not told again'} (${win.sent.length})`);
        R.dispose();
      }
      // a VM: never
      const M = fresh(); const app = fakeApp({ v: SOFT }, { v: VM }); M.early(app, { settings: {}, dataDir: fs.mkdtempSync(path.join(tmp, 'vm')), argv: [] });
      const win = fakeWin(); const R = M.register(fakeIpc(), { getWin: () => win, app, screen, delays: { settle: 10, late: 25, reg: 1e9 } });
      await sleep(50); ok(!win.sent.length, 'a VM in software: never told'); R.dispose();
    }

    // Windows' registry, with a fake `reg`
    {
      const M = fresh(); M.early(fakeApp({ v: GPU }, { v: NVIDIA }), { settings: {}, dataDir: fs.mkdtempSync(path.join(tmp, 'reg')), argv: [] });
      const calls = [];
      const reg = (value) => (cmd, args, _o, cb) => { calls.push(args.join(' ')); if (args[0] === 'query') { if (value == null) cb(new Error('not found')); else cb(null, `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\DirectX\\UserGpuPreferences\r\n    C:\\Hearth\\Hearth.exe    REG_SZ    ${value}\r\n`); } else cb(null, ''); };
      const r1 = await M.winRegistry('C:\\Hearth\\Hearth.exe', 'auto', reg(null));
      ok(r1.wrote && calls.some((c) => c.startsWith('add') && c.includes('GpuPreference=2;')), 'none set: Hearth writes the fast card');
      calls.length = 0;
      const r2 = await M.winRegistry('C:\\Hearth\\Hearth.exe', 'auto', reg('GpuPreference=2;'));
      ok(!r2.wrote && !calls.some((c) => c.startsWith('add')), 'ours and right: no write');
      calls.length = 0;
      const r3 = await M.winRegistry('C:\\Hearth\\Hearth.exe', 'auto', reg('GpuPreference=1;'));
      ok(!r3.wrote && r3.user && !calls.some((c) => c.startsWith('add')), 'changed in Windows to power saving: left alone, remembered as yours');
    }
  } finally {
    Object.defineProperty(process, 'platform', realPlatform);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`gpu52-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
