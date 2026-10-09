// Smoothness of the Lab timeline with video footage and no song (round 8, labframes): playing the footage, stepping
// frames with the arrow keys (held, auto-repeat), scrubbing the timeline with the mouse. Same probe as the other
// smooth checks (smooth-lib.js: rAF gaps, Long Animation Frames, DOM mutations, the paint / style / layout trace),
// plus the preview's own frame gaps inside the sandbox. Run it before and after a change on the same machine.
//   node dev/make-editor-videos.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth-labframes.js
const { wait, until, measure, brief, mouse } = M;
const FOOT = (window.LABFRAMES_MEDIA || '/tmp/labframes-media') + '/frames_silent_24.mp4';
const out = {};
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
// a sketch that shows the footage full frame (what the owner's footage sketches do)
ThreeLab.openCode(`import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
renderer.setAnimationLoop(() => { const t = media.texture(); if (t && mat.map !== t) { mat.map = t; mat.needsUpdate = true; } renderer.render(scene, cam); });`);
await wait(2500);
const r = await c.loadSong(FOOT);
out.loaded = r?.ok;
await until(() => ThreeLab.cmd && c.state && document.querySelector('.media-bar:not(.mb-empty)'), 8000);
await wait(1500);
const L = H.surfaces.get('tool:three')?.el;
const sbx = (code) => ThreeLab.director.evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error }));
await sbx(`window.__sm = { gaps: [], last: 0, on: false }; return 1`);
const sbxStart = () => sbx(`__sm.gaps = []; __sm.last = 0; __sm.on = true; const f = (t) => { if (!__sm.on) return; if (__sm.last) __sm.gaps.push(t - __sm.last); __sm.last = t; R(f); }; const R = typeof realRAF === "function" ? realRAF : requestAnimationFrame; R(f); return 1`);
const sbxStop = () => sbx(`__sm.on = false; const g = __sm.gaps.slice().sort((a, b) => a - b); return { frames: g.length, worst: Math.round(g.at(-1) || 0), drops: g.filter((x) => x > 25).length }`);
const both = async (ms, during) => { await sbxStart(); const m = await measure(ms, during); const s = await sbxStop(); const b = brief(m); return typeof b === 'string' ? `${b} | sandbox ${JSON.stringify(s)}` : { ...b, sandbox: s }; };
// 1. footage playing
c.play(true);
await until(() => c.state.playing, 3000);
out.playing = await both(2500);
c.play(false); await wait(400);
// 2. stepping: ArrowRight held (auto-repeat at ~30 / s), keys to the Lab pane as a user would press them
const pane = L.querySelector('.three-split') || L;
pane.closest('[tabindex]')?.focus?.();
const press = async (k, n, gap) => { for (let i = 0; i < n; i++) { await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: k === 'ArrowRight' ? 39 : 37, autoRepeat: i > 0 } }); await wait(gap); } await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: k === 'ArrowRight' ? 39 : 37 } }); };
const tl = L.querySelector('.mb-timeline');
{ const b = tl.getBoundingClientRect(); await mouse('mousePressed', b.left + 140, b.top + b.height - 6); await mouse('mouseReleased', b.left + 140, b.top + b.height - 6); }
await wait(300);
out.stepping = await both(1800, () => press('ArrowRight', 50, 33));
await wait(500);
// 3. scrubbing: drag along the ruler / waveform
{
  const b = tl.getBoundingClientRect(); const y = b.top + 40; // the waveform zone (not the loop strip on top)
  out.scrubbing = await both(1800, async () => {
    await mouse('mouseMoved', b.left + 130, y, { button: 'none' }); await mouse('mousePressed', b.left + 130, y);
    for (let i = 1; i <= 50; i++) { await mouse('mouseMoved', b.left + 130 + i * ((b.width - 160) / 50), y, { buttons: 1 }); await wait(16); }
    await mouse('mouseReleased', b.right - 30, y);
  });
}
out.frameInfo = typeof ThreeFrames !== 'undefined' ? ThreeFrames.status?.() : 'no ThreeFrames (before)';
return JSON.stringify(out, null, 1);
