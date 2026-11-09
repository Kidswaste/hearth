// (round 160, playfix) The Lab's playback after the owner's report "nothing plays, it just freezes or goes to black,
// same thing on every scene" (docs/patch-notes/round-160-fix.md). The cause: round 154's rest (mem154) let the preview
// page go when Hearth's window was hidden, minimised or covered (Windows says a window covered by another app is
// hidden) for 5 minutes with the Lab on screen, and nothing brought it back when the window showed again (only showing
// the Lab tool did): a black / frozen preview, ▶ doing nothing, on every scene. ONE check, its own fixture scenes (never
// an owner's scene):
//   scenes    three scenes play: a plain spinning mesh, a glow scene (EffectComposer + bloom), the real scene
//             (realscene-lib: five layers, a 124 BPM song): the preview's frames advance, the picture on screen is not
//             black and changes while it plays, the song drives the scene (its kick / beat callbacks fire), no errors
//   window    Hearth's window hidden past the rest (lab.restMs 3 s) with the Lab on screen, then shown again: the
//             preview comes back by itself, plays, not black (it stayed released before this round)
//   tool      the same after leaving the Lab for a chat past the rest (the path that already worked)
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/playfix.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const errs = [];
addEventListener('error', (e) => errs.push(`error: ${e.message}`));
addEventListener('unhandledrejection', (e) => errs.push(`rejection: ${String(e.reason?.message || e.reason).slice(0, 200)}`));
{ const ce = console.error.bind(console); console.error = (...a) => { errs.push(`console.error: ${a.map((x) => x?.message || String(x)).join(' ').slice(0, 200)}`); ce(...a); }; }

const SPIN = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x203040);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 3;
const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshNormalMaterial()); scene.add(m);
window.__pf = 0;
renderer.setAnimationLoop((t) => { window.__pf++; m.rotation.x = t / 400; m.rotation.y = t / 550; renderer.render(scene, camera); });`;
const GLOW = `import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101828);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 7);
const group = new THREE.Group();
for (let i = 0; i < 12; i++) { const k = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.15, 16, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 12, 1, 0.55) })); k.position.set(Math.cos(i / 12 * Math.PI * 2) * 2.4, Math.sin(i / 12 * Math.PI * 2) * 2.4, 0); group.add(k); }
scene.add(group);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.4, 0.1));
composer.addPass(new OutputPass());
addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
window.__pf = 0;
renderer.setAnimationLoop((t) => { window.__pf++; group.rotation.z = t / 700; composer.render(); });`;

let c = null; let D = null;
const ev = async (code) => { for (let i = 0; i < 4; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(400); } return null; };
// the preview as it shows on screen (covers, the stall card, CSS included): mean brightness and a 32×32 grey sample
async function screen() {
  const f = document.querySelector('.surface.active .three-preview') || document.querySelector('.three-preview');
  const r = f.getBoundingClientRect();
  const cap = await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip: { x: r.left + 4, y: r.top + 4, width: Math.max(16, r.width - 8), height: Math.max(16, r.height - 48), scale: 1 } } });
  const img = new Image(); img.src = `data:image/png;base64,${cap.data}`; await img.decode();
  const k = document.createElement('canvas'); k.width = 32; k.height = 32; const g = k.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data; const grey = []; let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; grey.push(v); sum += v; }
  return { mean: sum / grey.length, grey };
}
const diff = (a, b) => a.grey.reduce((s, v, i) => s + Math.abs(v - b.grey[i]), 0) / a.grey.length;
const frames = async () => { const v = await ev('return window.__labPace ? window.__labPace.state().frameTick : -1'); return typeof v === 'number' ? v : null; };
// play 4 s: frames advance, the picture is not black and moves, the timeline / song moves
async function playCheck(name, { song = false } = {}) {
  c.play(true); await wait(700);
  const f0 = await frames(); const s0 = await screen();
  const pf0 = await ev('return window.__pf ?? null'); // (the fixture scenes' own frame count; the real scene's page may hold a stale one)
  await wait(3500);
  const f1 = await frames(); const s1 = await screen();
  const pf1 = await ev('return window.__pf ?? null');
  const playing = c.state.playing;
  c.play(false); await wait(300);
  const info = { playing, frames: [f0, f1], pf: [pf0, pf1], mean: [Math.round(s0.mean), Math.round(s1.mean)], moved: Math.round(diff(s0, s1) * 10) / 10, ws: ThreeLab.workspace.state() };
  out.measure[name] = info;
  step(`${name}: ▶ plays and the preview's frames advance`, playing && f0 != null && f1 != null && f1 - f0 >= 4 && (song || pf0 == null || pf1 - pf0 >= 4), info);
  step(`${name}: the picture on screen is not black and changes while it plays`, s1.mean > 12 && diff(s0, s1) > 0.5, info);
  return info;
}

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } });
  try { localStorage.setItem('hub.safeopen.hangMs', '600000'); } catch { /* software GL builds the real scene slowly */ }
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.workspace?.state?.().ready, 60000);
  c = await ThreeLab.cmd(); D = ThreeLab.director;

  // ---------- scenes ----------
  await D.newSketch('Play fixture spin (playfix)', SPIN, 2);
  await until(async () => (await ev('return window.__pf || 0')) > 3, 20000, 300);
  await playCheck('spin');
  await D.newSketch('Play fixture glow (playfix)', GLOW, 2);
  await until(async () => (await ev('return window.__pf || 0')) > 3, 30000, 300);
  await playCheck('glow');
  const rs = await RS.open({ size: [320, 180], particles: 4, play: false });
  step('real scene: made, its song loaded', rs.song && rs.layers?.length >= 5, { song: rs.song, bpm: rs.bpm, layers: rs.layers });
  c.seek(1); await wait(300);
  await playCheck('real scene + song', { song: true });
  const w = await (async () => { c.seek(1); await wait(200); c.play(true); await wait(500); const r = await RS.watch(3000); c.play(false); return r; })();
  out.measure.watch = { rendersPerSec: w.rendersPerSec, loops: w.loops, glPhase: w.glPhase };
  step('real scene + song: the song drives the scene (kick / beat callbacks fire, layers render)', w.rendersPerSec > 1 && w.loops?.raf > 0 && (w.loops?.kick > 0 || w.loops?.beat > 0), out.measure.watch);

  // ---------- window: hidden past the rest, shown again ----------
  localStorage.setItem('lab.restMs', '3000');
  await D.newSketch('Play fixture rest (playfix)', SPIN, 2);
  await until(async () => (await ev('return window.__pf || 0')) > 3, 20000, 300);
  await window.hub.power.test({ window: 'hide' });
  await until(() => document.visibilityState === 'hidden', 5000);
  const rested = await until(() => ThreeLab.workspace.state().released && ThreeLab.rest.state().rested >= 1, 20000, 250);
  step('window: hidden with the Lab on screen, past lab.restMs, the preview rests (mem154)', Boolean(rested), ThreeLab.rest.state());
  await window.hub.power.test({ window: 'show' });
  await until(() => document.visibilityState === 'visible', 5000);
  const back = await until(() => ThreeLab.workspace.state().ready && !ThreeLab.workspace.state().released, 30000, 200);
  step('window: shown again, the preview comes back by itself (it stayed released, black, before round 160)', Boolean(back), { ws: ThreeLab.workspace.state(), rest: ThreeLab.rest.state() });
  await until(async () => (await ev('return window.__pf || 0')) > 3, 20000, 300);
  await playCheck('window: after the rest');

  // ---------- tool: left for a chat past the rest, shown again ----------
  activate(H.claudeAgent().id);
  await until(() => ThreeLab.workspace.state().released && ThreeLab.rest.state().rested >= 2, 20000, 250);
  activate('tool:three');
  const back2 = await until(() => ThreeLab.workspace.state().ready && !ThreeLab.workspace.state().released, 30000, 200);
  step('tool: the Lab shown again after a rest, its preview comes back', Boolean(back2), ThreeLab.rest.state());
  await until(async () => (await ev('return window.__pf || 0')) > 3, 20000, 300);
  await playCheck('tool: after the rest');

  const bad = errs.filter((e) => !/ResizeObserver|favicon/i.test(e));
  step('no errors in Hearth\'s window while playing', !bad.length, bad.slice(0, 6));
} catch (err) { out.error = String(err?.stack || err); (out.problems ||= []).push('threw'); }
try { localStorage.removeItem('lab.restMs'); localStorage.removeItem('hub.safeopen.hangMs'); } catch { /* fine */ }
try { (await ThreeLab.cmd()).play(false); } catch { /* gone */ }
return out;
