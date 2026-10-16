// (round 52, gpu52) The graphics path on this machine, read the way chrome://gpu would (app.getGPUFeatureStatus,
// app.getGPUInfo, the command line in effect), on a throwaway copy. The GPU here is software (SwiftShader), so this
// asserts the decisions, not the hardware:
//  1. the switches in effect: nothing that caps / uncaps frames or turns the card off (disable-frame-rate-limit,
//     disable-gpu-vsync, disable-gpu…), Linux gets none of Hearth's own, a --use-angle on the command line wins
//  2. Settings › Advanced › Graphics shows the plain line ("Graphics: … · NN Hz · hardware video ✓/✗"); /graphics too
//  3. the Lab's WebGL contexts ask for the fast card (powerPreference 'high-performance')
//  4. /graphics power / backend / blocklist set the hidden choices (and back), bad values refused
//  5. a start in software on a real card (pretended): one calm note with why, not twice; a VM: none
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/gpu52.js --shot /tmp/gpu52.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const NVIDIA = { auxAttributes: { glRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)' }, gpuDevice: [{ active: true, vendorId: 4318, deviceId: 9860, driverVersion: '31.0.15.5222' }] };
const VM = { gpuDevice: [{ active: true, vendorId: 5549, deviceId: 1029 }] };
const SOFT = { gpu_compositing: 'disabled_software', webgl: 'unavailable_software', webgl2: 'unavailable_software', video_decode: 'disabled_software' };
const keep = { ...(H.config.settings || {}) };
try {
  // ---------- 1. the switches in effect ----------
  const i = await window.hub.gpu52.info({});
  const never = Object.entries(i.flags).filter(([n, v]) => ['disable-frame-rate-limit', 'disable-gpu-vsync', 'disable-gpu', 'disable-gpu-compositing', 'disable-software-rasterizer', 'disable-accelerated-video-decode'].includes(n) && v);
  step('no switch caps / uncaps the frame rate or turns the card off', !never.length, { flags: i.flags });
  step('Linux: none of Hearth\'s own switches; the test\'s --use-angle wins', i.decision.platform === 'linux' && i.decision.switches.length === 0 && i.decision.external && i.flags['use-angle'] === 'swiftshader', i.decision);
  step('what chrome://gpu would say: a status, a refresh rate', Boolean(i.status && Object.keys(i.status).length) && i.hz >= 0, // (Xvfb reports no refresh rate: 0, the line leaves it out)
    { kind: i.kind, hz: i.hz, status: i.status });
  step('the line is plain', /^Graphics: .+( · \d+ Hz)? · hardware video [✓✗]$/.test(i.line) && (i.hz ? i.line.includes(`${i.hz} Hz`) : !/ Hz/.test(i.line)), i.line);

  // ---------- 2. Settings › Advanced › Graphics, /graphics ----------
  if (window.Lazy?.load) await Lazy.load('glrecover').catch(() => {});
  step('gpu52.js loads with glrecover', await until(() => typeof Gpu52 !== 'undefined'));
  AppUI.openSettings();
  const fold = await until(() => document.querySelector('details[data-fold="graphics"]'));
  fold.open = true;
  const line = await until(() => { const t = fold.querySelector('.gpu52-line')?.textContent || ''; return /^Graphics: .*hardware video/.test(t) ? t : null; }, 8000);
  const sum = await until(() => { const t = fold.querySelector(':scope > summary .sc-state')?.textContent || ''; return /hardware video/.test(t) ? t : null; }, 4000);
  step('Settings › Advanced › Graphics shows the line (and its fold\'s summary)', line && sum && Boolean(fold.closest('.sc-adv')), { line, sum });
  document.querySelector('dialog[open] form')?.closest('dialog')?.close();
  const st = await GLRecover.status();
  step('/graphics starts with the line', /^\*\*Graphics\*\*: /.test(st), st.split('\n')[0]);

  // ---------- 3. the Lab asks for the fast card ----------
  const SKETCH = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
window.__gpu52 = () => renderer.getContext().__asked;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 10);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
  activate('tool:three');
  await ThreeLab.cmd();
  await wait(600);
  const D = ThreeLab.director;
  const ask = async () => { for (let k = 0; k < 40; k++) { const e = await D.evalInSketch('return window.__gpu52 ? window.__gpu52() : null'); if (e?.ok && e.value) return e.value; await wait(300); } return null; };
  ThreeLab.openCode(SKETCH);
  const pref = await ask();
  step('the Lab\'s WebGL context asks for the fast card', pref === 'high-performance', pref);

  // ---------- 4. the hidden choices ----------
  const say = [];
  const run = async (line) => { const r = await Commands.tryRun(line, H.claudeAgent().id, null, { source: 'code', say: (t) => say.push(t), note: (t) => say.push(t) }); return r; };
  await Gpu52.cmd('power saver');
  step('/graphics power saver → the setting', H.config.settings.gpuPower === 'saver');
  await Gpu52.cmd('power auto');
  step('/graphics power auto → the default (no setting kept)', H.config.settings.gpuPower === undefined);
  const r1 = await Gpu52.cmd('backend vulkan');
  step('/graphics backend vulkan → set, next start', H.config.settings.gpuBackend === 'vulkan' && /next start/.test(r1));
  const bad = await Gpu52.cmd('backend metal');
  step('a path this platform lacks is refused', /^Pick one/.test(bad) && H.config.settings.gpuBackend === 'vulkan', bad);
  await Gpu52.cmd('backend auto'); await Gpu52.cmd('blocklist ignore');
  step('/graphics blocklist ignore', H.config.settings.gpuIgnoreBlocklist === true && H.config.settings.gpuBackend === undefined);
  await Gpu52.cmd('blocklist keep');
  step('… keep', H.config.settings.gpuIgnoreBlocklist === undefined);
  step('/graphics is one command with the choices in its suggestions', Commands.get('graphics') && Gpu52.complete('power ').length === 3 && Gpu52.complete('').some((c) => c.value.startsWith('backend')));
  await run('/graphics');
  step('/graphics typed in a chat answers with the line', say.some((t) => /Graphics/.test(String(t))), say.map((t) => String(t).slice(0, 80)));

  // ---------- 5. started in software on a real card ----------
  await window.hub.gpu52.sim({ info: VM, status: SOFT, forget: true });
  const vm = await window.hub.gpu52.sim({ look: true });
  step('a VM in software: no note', !vm.note);
  await window.hub.gpu52.sim({ info: NVIDIA, status: SOFT, forget: true, marker: {} });
  const n1 = await window.hub.gpu52.sim({ look: true });
  step('a real card in software at the start: one note with why', n1.note?.why === 'blocklist' && /without the graphics card/.test(n1.note.text), n1.note);
  const shown = await until(() => recentToasts().some((t) => /without the graphics card — Chromium/.test(t.message)), 30000);
  step('… shown calmly (a notice)', shown);
  const n2 = await window.hub.gpu52.sim({ look: true });
  step('… not twice', n2.note?.id === n1.note?.id && recentToasts().filter((t) => /without the graphics card — Chromium/.test(t.message)).length === 1);
  await window.hub.gpu52.sim({ status: null, info: null });
} catch (err) {
  step('no error', false, String(err?.stack || err));
} finally {
  H.config.settings = keep; try { await saveConfig(); } catch { /* fine */ }
}
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
