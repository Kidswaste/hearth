// The best graphics path on each computer (round 52, gpu52), the pure parts: no Electron, no files. Required by
// gpu52main.js (before Electron's 'ready': the switches) and dev/gpu52-test.js (every platform simulated).
//
// What Chromium is told, per computer:
//   · which graphics card: a laptop with two (a small one built in, a fast one for games) draws the Lab and ▶ Play on
//     the fast one. Mac: the Lab's / game's WebGL contexts ask for 'high-performance' (Chromium wakes the fast card
//     while they live and lets it sleep after: the battery stays fine for chats); Windows can't switch per context, so
//     Hearth asks for the fast card app-wide (force_high_performance_gpu, and Windows' own per-app setting, Settings ›
//     System › Display › Graphics, written only when you never set one yourself). /graphics power saver: the small one.
//   · how WebGL reaches the card (ANGLE): Windows D3D11, Mac Metal, Chromium's own defaults and the best tested paths
//     for WebGL2 / three.js (Vulkan on Windows: more shader-compile stalls, no hardware video overlays, not what Chrome
//     ships). A hidden choice (/graphics backend vulkan…) for trying, with an automatic way back: a start that never
//     reached the graphics card, or drew in software, goes back to the default at the next start, and says so.
//   · nothing that caps or uncaps the frame rate: Chromium follows each screen's own refresh (240 / 165 / 144 Hz, VRR
//     in full screen); disable-frame-rate-limit / disable-gpu-vsync (tearing, a GPU at 100 %) are never added.
//   · GPU rasterization, zero-copy and hardware video decode: Chromium's defaults on both (on where the card is good);
//     the blocklist stays on (it guards drivers with known bugs); /graphics blocklist ignore is the hidden way round,
//     with the same way back.
(function () {
  const BACKENDS = { win32: ['auto', 'd3d11', 'vulkan', 'd3d11on12', 'gl'], darwin: ['auto', 'metal', 'gl'], linux: ['auto', 'gl', 'vulkan'] };
  const DEFAULT_BACKEND = { win32: 'd3d11', darwin: 'metal', linux: 'gl' };
  const POWERS = ['auto', 'high', 'saver'];
  // switches that cap / uncap frames or turn the card off: never added by Hearth (the dev check asserts they're absent)
  const NEVER = ['disable-frame-rate-limit', 'disable-gpu-vsync', 'disable-gpu', 'disable-gpu-compositing', 'disable-software-rasterizer', 'disable-accelerated-video-decode'];
  // vendor ids that aren't a real graphics card (a VM, remote desktop, software): never told "without the graphics card"
  const VIRTUAL = new Set([0, 0x1414, 0x15ad, 0x80ee, 0x1ae0, 0x1af4, 0x1234, 0x1b36]);
  const VENDOR = { 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x1022: 'AMD', 0x8086: 'Intel', 0x106b: 'Apple', 0x5143: 'Qualcomm', 0x13b5: 'Arm' };

  const pick = (v, list, fb) => (list.includes(v) ? v : fb);
  // settings.gpuBackend / gpuPower / gpuIgnoreBlocklist → the owner's choice on this platform
  function choice(settings = {}, platform = 'linux') {
    const s = settings || {};
    return { backend: pick(String(s.gpuBackend || 'auto'), BACKENDS[platform] || ['auto'], 'auto'), power: pick(String(s.gpuPower || 'auto'), POWERS, 'auto'), ignoreBlocklist: s.gpuIgnoreBlocklist === true, canvas: platform === 'win32' && s.gpuCanvasBackend === 'graphite' ? 'graphite' : 'auto' };
  }
  // the part of a choice that can stop the card starting: tried once, kept only when it worked
  const riskKey = (c) => (c.backend !== 'auto' || c.ignoreBlocklist || c.canvas === 'graphite' ? `${c.backend}${c.ignoreBlocklist ? '+noblock' : ''}${c.canvas === 'graphite' ? '+graphite' : ''}` : '');

  // o: { platform, settings, marker (gpu52.json: { key, state: 'pending'|'ok'|'failed', win: { ours, user } }),
  //      argv (switches already on the command line: a test's --use-angle wins) }
  // → { choice, backend (in effect), power, switches: [[name, value?]], fellBack: { key, why } | null, marker (to write
  //     before the window, or null), platform }
  function decide({ platform = 'linux', settings = {}, marker = null, argv = [] } = {}) {
    const c = choice(settings, platform);
    const has = (n) => argv.some((a) => a === `--${n}` || String(a).startsWith(`--${n}=`));
    const m = marker && typeof marker === 'object' ? marker : {};
    const key = riskKey(c);
    let fellBack = null;
    let eff = { ...c };
    if (key && m.key === key && (m.state === 'failed' || m.state === 'pending')) {
      // failed: told already, stays on the default until the choice changes · pending: the last start never reached
      // the card (crashed, hung, was closed before it could tell): the default this time, and say so
      fellBack = { key, why: m.state === 'pending' ? 'never-started' : 'failed' };
      eff = { ...c, backend: 'auto', ignoreBlocklist: false, canvas: 'auto' };
    }
    const sw = [];
    const external = has('use-angle') || has('use-gl') || has('disable-gpu');
    if (eff.backend !== 'auto' && !external) sw.push(['use-angle', eff.backend]);
    if (eff.ignoreBlocklist && !has('ignore-gpu-blocklist')) sw.push(['ignore-gpu-blocklist']);
    const disabledFeatures = argv.filter(a=>String(a).startsWith('--disable-features=')).flatMap(a=>String(a).slice(19).split(','));
    if (eff.canvas === 'graphite' && !disabledFeatures.includes('SkiaGraphite') && !has('disable-gpu')) sw.push(['enable-features', 'SkiaGraphite']);
    const winUser = platform === 'win32' && Boolean(m.win?.user);
    if (c.power === 'high' || (c.power === 'auto' && platform === 'win32' && !winUser)) sw.push(['force_high_performance_gpu']);
    if (c.power === 'saver') sw.push(['force_low_power_gpu']);
    const effKey = riskKey(eff);
    let next = null;
    if (fellBack) next = { ...m, key, state: 'failed' };
    else if (effKey) next = { ...m, key: effKey, state: 'pending', at: Date.now() };
    else if (m.key) next = { ...m, key: '', state: '' }; // (back on the defaults: nothing to watch)
    return { platform, choice: c, backend: eff.backend === 'auto' ? DEFAULT_BACKEND[platform] || 'default' : eff.backend, auto: eff.backend === 'auto', power: c.power, canvas: eff.canvas, ignoreBlocklist: eff.ignoreBlocklist, switches: sw.filter(([n]) => !NEVER.includes(n)), fellBack, marker: next, external };
  }
  // the start reached the card (or not): the marker to keep
  function settle(marker, kind) {
    if (!marker || marker.state !== 'pending') return null;
    if (kind === 'gpu') return { ...marker, state: 'ok' };
    if (kind === 'software' || kind === 'none') return { ...marker, state: 'failed' };
    return null;
  }

  // Windows' own per-app choice (HKCU\Software\Microsoft\DirectX\UserGpuPreferences, "<exe>" = "GpuPreference=N;"):
  // 2 the fast card, 1 power saving, 0 let Windows decide. current: the value there now (null: none) · ours: the number
  // Hearth wrote last · power: the owner's choice → { write: the value to write, or null; user: you set it yourself }
  const prefNum = (v) => { const m = /GpuPreference=(\d)/.exec(String(v || '')); return m ? Number(m[1]) : null; };
  function winPref({ current = null, ours = null, power = 'auto' } = {}) {
    const want = power === 'saver' ? 1 : 2;
    const now = prefNum(current);
    if (now == null) return { write: `${String(current || '').replace(/GpuPreference=\d;?/g, '')}GpuPreference=${want};`, want, user: false };
    if (ours != null && now === Number(ours)) return { write: now === want ? null : String(current).replace(/GpuPreference=\d/, `GpuPreference=${want}`), want, user: false };
    return { write: null, want, user: now !== want }; // (yours: never changed by Hearth)
  }

  // ---------- what the card is ----------
  // ANGLE's renderer string → the card's name and the path in use. Windows: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090
  // (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)"; Mac: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified
  // Version)"; software: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) …), SwiftShader driver)"
  function parseRenderer(s) {
    const str = String(s || '').trim();
    if (!str) return { name: '', backend: '' };
    if (/swiftshader|llvmpipe|software|basic render/i.test(str)) return { name: 'software', backend: 'software' };
    const m = /^ANGLE \(([^,]*),\s*(.*?)(?:,\s*([^,()]*))?\)$/.exec(str);
    if (!m) return { name: str.slice(0, 60), backend: '' };
    let name = m[2].replace(/ANGLE Metal Renderer:\s*/i, '').replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/\s+(Direct3D\d+.*|OpenGL.*|Vulkan.*)$/i, '').trim();
    const tail = `${m[2]} ${m[3] || ''}`;
    const backend = /Metal/i.test(tail) ? 'Metal' : /D3D11on12/i.test(tail) ? 'D3D11on12' : /D3D11|Direct3D11/i.test(tail) ? 'D3D11' : /D3D9|Direct3D9/i.test(tail) ? 'D3D9' : /Vulkan/i.test(tail) ? 'Vulkan' : /OpenGL/i.test(tail) ? 'OpenGL' : '';
    if (!name) name = m[1];
    return { name, backend };
  }
  const devices = (info) => (Array.isArray(info?.gpuDevice) ? info.gpuDevice : []);
  const real = (d) => d && !VIRTUAL.has(Number(d.vendorId) || 0);
  // the card's name: what ANGLE says, else the active device's own string, else its maker
  function gpuName(info) {
    const r = parseRenderer(info?.auxAttributes?.glRenderer);
    if (r.name && r.name !== 'software') return r.name;
    const d = devices(info).find((x) => x.active) || devices(info)[0];
    if (d?.deviceString) return String(d.deviceString).replace(/\s+/g, ' ').trim().slice(0, 60);
    return d && VENDOR[d.vendorId] ? `${VENDOR[d.vendorId]} graphics` : '';
  }
  const hasRealGpu = (info) => devices(info).some(real);
  // two cards that can switch (Mac dual-GPU, NVIDIA Optimus, AMD switchable)
  function dualGpu(info) {
    const a = info?.auxAttributes || {};
    if (a.optimus || a.amdSwitchable) return true;
    const ids = new Set(devices(info).filter(real).map((d) => `${d.vendorId}:${d.deviceId}`));
    return ids.size > 1;
  }

  // app.getGPUFeatureStatus() → what is on the card ('gpu' | 'software' | 'none' | 'unknown', as glrecover-core.kind)
  function kind(st) {
    if (!st || typeof st !== 'object' || !Object.keys(st).length) return 'unknown';
    const gc = String(st.gpu_compositing || ''); const wg = String(st.webgl2 || st.webgl || '');
    if (/software/.test(gc) || /software/.test(wg)) return 'software';
    if (/^enabled/.test(gc) && (!wg || /^enabled/.test(wg))) return 'gpu';
    if (/^(disabled|unavailable)/.test(gc)) return 'none';
    return 'unknown';
  }
  const on = (v) => /^enabled/.test(String(v || ''));

  // The plain line in Settings › Advanced › Graphics (and /graphics):
  //   "Graphics: NVIDIA GeForce RTX 4090 (D3D11) · 240 Hz · hardware video ✓"
  // o: { info (getGPUInfo), status (getGPUFeatureStatus), hz (the screen Hearth is on), fps (measured, optional), decision }
  function line({ info = null, status = null, hz = 0, fps = 0, decision = null } = {}) {
    const k = kind(status);
    const r = parseRenderer(info?.auxAttributes?.glRenderer);
    const name = gpuName(info) || (k === 'gpu' ? 'the graphics card' : '');
    const parts = [];
    if (k === 'software' || k === 'none' || r.backend === 'software') parts.push(`software drawing${name && name !== 'software' && hasRealGpu(info) ? ` (${name} not in use)` : ''}`);
    else parts.push(`${name || 'graphics card'}${r.backend || decision?.backend ? ` (${r.backend || label(decision.backend)})` : ''}`);
    if (hz) parts.push(`${Math.round(hz)} Hz${fps && fps < hz * 0.8 ? ` (drawing ${Math.round(fps)} fps)` : ''}`);
    else if (fps) parts.push(`${Math.round(fps)} fps`); // (a screen that doesn't say its refresh: the pace measured)
    if (status && Object.keys(status).length) parts.push(`hardware video ${on(status.video_decode) ? '✓' : '✗'}`);
    if (dualGpu(info) && decision) parts.push(decision.power === 'saver' ? 'power-saving card' : 'fast card for the Lab');
    return `Graphics: ${parts.join(' · ')}`;
  }
  const LABEL = { d3d11: 'D3D11', vulkan: 'Vulkan', d3d11on12: 'D3D11on12', gl: 'OpenGL', metal: 'Metal' };
  const label = (b) => LABEL[b] || String(b || '');

  // Hearth started without the card on a computer that has a real one: once, calmly, with why and Restart.
  // o: { status, info, decision, crashes, told (the key told last time) } → { id, why, text, restart } | null
  const WHY = {
    'never-started': (d) => `Graphics: ${label(d.fellBack?.key?.split('+')[0]) || 'your pick'} didn't start last time, so Hearth went back to ${label(DEFAULT_BACKEND[d.platform])}.`,
    backend: (d) => `Hearth is drawing without the graphics card — ${d.auto ? 'turning off the driver guard' : label(d.backend)} didn't reach it. Restart to go back to ${label(DEFAULT_BACKEND[d.platform])}.`,
    crash: () => 'Hearth is drawing without the graphics card — it stopped while Hearth started. Restart to use it again.',
    blocklist: () => 'Hearth is drawing without the graphics card — Chromium turned it off for this driver. Updating the driver usually fixes it.',
  };
  function startNote({ status = null, info = null, decision = null, crashes = 0, told = '' } = {}) {
    const d = decision || {};
    if (d.fellBack && d.fellBack.why === 'never-started') {
      const id = `fellback:${d.fellBack.key}`;
      return told === id ? null : { id, why: 'never-started', text: WHY['never-started'](d), restart: false };
    }
    const k = kind(status);
    if (k !== 'software' && k !== 'none') return null;
    if (!hasRealGpu(info)) return null; // (a VM, remote desktop, test machine: never told)
    const why = !d.auto || d.ignoreBlocklist ? 'backend' : crashes > 0 ? 'crash' : 'blocklist';
    const dev = devices(info).find(real) || {};
    const id = `start:${why}:${dev.vendorId}:${dev.deviceId}:${dev.driverVersion || ''}`;
    if (told === id) return null;
    return { id, why, text: WHY[why](d), restart: why !== 'blocklist' };
  }

  // settings for the window that plays a game (▶ Play, gamemode) and pages that must keep their frame rate: never
  // slowed when partly covered, on another screen or behind another app (Chromium's occlusion / background timers)
  const playWindowPrefs = () => ({ backgroundThrottling: false });
  // what WebGL contexts in the Lab / a game ask for when they don't say (powerPreference: the fast card)
  const contextDefaults = (power = 'auto') => ({ powerPreference: power === 'saver' ? 'low-power' : 'high-performance' });

  // the same for a page Hearth didn't write (a game build in ▶ Play): run before its scripts (a preload's
  // webFrame.executeJavaScript / contextBridge.executeInMainWorld); the game's files are never changed
  const pagePatch = (power = 'auto') => `(() => { const pref = ${JSON.stringify(contextDefaults(power).powerPreference)}; const real = HTMLCanvasElement.prototype.getContext; if (real.__gpu52) return; const f = function (type, opts) { if (/^(webgl2?|experimental-webgl)$/.test(type) && (!opts || !opts.powerPreference || opts.powerPreference === 'default')) opts = { ...(opts || {}), powerPreference: pref }; return real.call(this, type, opts); }; f.__gpu52 = true; HTMLCanvasElement.prototype.getContext = f; })();`;

  const api = { BACKENDS, DEFAULT_BACKEND, POWERS, NEVER, choice, riskKey, decide, settle, winPref, prefNum, parseRenderer, gpuName, hasRealGpu, dualGpu, kind, line, label, startNote, playWindowPrefs, contextDefaults, pagePatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else globalThis.Gpu52Core = api;
}());
