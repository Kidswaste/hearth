// Helpers for the Lab footage checks (dev/checks/labframes*.js). Put in front with --lib (after journey-lib.js):
//   LF.setup(file)     a sketch that shows the footage full frame (media.texture()) and collects every presented
//                      frame number (media.onFrame) in window.__lf, then loads `file` with no song
//   LF.shown()         { sketch: media.frame (the sandbox's presented frame), pixels: the frame number decoded from
//                      the picture the sketch drew (the burned-in code of dev/make-editor-videos.js), lab: the Lab's
//                      counter frame }
//   LF.press(key, opts) a real key press (CDP) with the Lab pane focused
const LF = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(60); } return false; };
  const MEDIA = window.LABFRAMES_MEDIA || '/tmp/labframes-media';
  const SKETCH = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
window.__lf = { seen: [], drawn: -1 };
media.onFrame((n) => { __lf.seen.push(n); if (__lf.seen.length > 4000) __lf.seen.splice(0, 2000); });
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
renderer.setAnimationLoop(() => { const t = media.texture(); if (t && mat.map !== t) { mat.map = t; mat.needsUpdate = true; } renderer.render(scene, cam); __lf.drawn = media.frame; });`;
  const sbx = (code) => ThreeLab.director.evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error }));
  // decode the frame code from the sketch's own canvas (12 bands across the top 12 %, band k bright = bit k)
  const DECODE = `const cv = document.querySelector('canvas'); const W = 240; const Hh = Math.max(8, Math.round(cv.height / cv.width * W));
const c2 = document.createElement('canvas'); c2.width = W; c2.height = Hh; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0, W, Hh);
const px = g.getImageData(0, 0, W, Hh).data; const y = Math.round(Hh * 0.05); let n = 0; let ok = 0;
for (let k = 0; k < 12; k++) { const x = Math.round(W * (k + 0.5) / 12); const i = (y * W + x) * 4; const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; if (l > 150) { n |= 1 << k; ok++; } else if (l < 70) ok++; }`;
  async function setup(file) {
    activate('tool:three'); await wait(400);
    const c = await ThreeLab.cmd();
    ThreeLab.openCode(SKETCH);
    await wait(2200);
    const r = await c.loadSong(file);
    await until(() => ThreeFrames.status().footage && ThreeFrames.clock && ThreeFrames.clock.source !== 'guess', 12000);
    await until(async () => (await sbx('return typeof __lf === "object" && media.frame >= 0')) === true, 12000);
    await wait(600);
    return { c, loaded: r?.ok, status: ThreeFrames.status() };
  }
  async function shown({ settle = 450 } = {}) {
    await wait(settle);
    const s = await sbx(`${DECODE} return { sketch: media.frame, drawn: __lf.drawn, pixels: ok === 12 ? n : null, time: media.frameTime }`);
    return { ...s, lab: ThreeFrames.frame };
  }
  const KC = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35, Delete: 46, Backspace: 8, ' ': 32, ',': 188, '.': 190 };
  async function press(key, { shift = false, alt = false, ctrl = false, repeat = 1, gap = 40 } = {}) {
    const pane = H.surfaces.get('tool:three')?.el?.querySelector('.three-split')?.parentElement;
    if (pane && !pane.contains(document.activeElement)) pane.focus({ preventScroll: true });
    const mods = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
    const isChar = key.length === 1;
    const code = key === ',' ? 'Comma' : key === '.' ? 'Period' : key === ' ' ? 'Space' : isChar ? `Key${key.toUpperCase()}` : key;
    const vk = KC[key] || (isChar ? key.toUpperCase().charCodeAt(0) : 0);
    for (let i = 0; i < repeat; i++) {
      const kk = isChar && shift && /[a-z]/.test(key) ? key.toUpperCase() : key;
      await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: isChar ? 'keyDown' : 'rawKeyDown', key: kk, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(isChar && !ctrl && !alt ? { text: kk } : {}) } });
      await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: kk, code, windowsVirtualKeyCode: vk, modifiers: mods } });
      if (gap) await wait(gap);
    }
  }
  return { wait, until, MEDIA, setup, shown, press, sbx };
})();
