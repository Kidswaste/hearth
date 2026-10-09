// Switching the docked Three Director's engine (/director-engine astra, and back) keeps the Lab preview running:
// the sandbox still has its layer canvases and the sketch's globals right after the switch. A config save used to
// re-append every surface, which reloads the iframe in it, and the Lab didn't notice the page had started over; now
// surfaces in place stay put, and a page that starts over anyway (forced here by moving the Lab surface) gets the scene
// and its song again within a second.
//   node dev/make-test-song.js /tmp/hearth-test-song.wav
//   node dev/smoke.js --fake-engines --script dev/checks/director-engine-preview.js --wait 6000 --check-timeout 180000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {};
// (1 s at most: a call that reaches a page while it starts over gets no answer)
const sbx = (code) => Promise.race([ThreeLab.director.evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error })), wait(1000).then(() => ({ error: 'no answer' }))]);
const state = () => sbx('return { canvases: document.querySelectorAll("canvas").length, mark: typeof window.__engineMark, song: audio.duration > 0 }');
await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add it') || H.agents().some((a) => a.dock === 'three'), 8000);
[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add it')?.click();
await until(() => H.agents().some((a) => a.dock === 'three'));
const dir = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.director);
const code = `import * as THREE from 'three';
window.__engineMark = 1;
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a6');
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.z = 3;
const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); scene.add(m);
r.setAnimationLoop((t) => { m.rotation.y = t / 1000; r.render(scene, cam); });`;
ThreeLab.openCode(code);
await until(async () => (await state())?.canvases > 0, 20000);
const SONG = '/tmp/hearth-test-song.wav';
const song = await window.hub.fs.stat?.(SONG).then(Boolean, () => false) ?? true;
if (song) { await ThreeLab.director.media.load(SONG); await until(async () => (await state())?.song, 15000); }
out.before = await state();
const reloads0 = ThreeLab.live.counts().reloads;
for (const engine of ['astra', 'claude']) {
  await Commands.tryRun(`/director-engine ${engine}`, dir.id);
  const t0 = Date.now();
  await wait(300);
  await until(async () => (await state())?.canvases > 0 && (await state())?.mark === 'number', 3000);
  out[engine] = { ...(await state()), ms: Date.now() - t0, engine: H.agent(dir.id).engine };
  await wait(2500);
  out[`${engine}Later`] = await state();
  await smoke({ shot: `/tmp/engine-${engine}.png` });
}
out.reloads = { before: reloads0, after: ThreeLab.live.counts().reloads };
// a page that starts over by itself: moving the Lab's surface reloads its iframe without the Lab asking
const surface = H.surfaces.get('tool:three').el;
surface.parentNode.append(surface); // detached and attached again, even when it's already last
const t1 = Date.now();
await wait(200);
await until(async () => { const s = await state(); return s?.canvases > 0 && s.mark === 'number' && (!song || s.song); }, 3000);
out.moved = { ...(await state()), ms: Date.now() - t1 };
await smoke({ shot: '/tmp/engine-moved.png' });
out.log = ThreeLab.live.counts().log.slice(-8);
out.song = song;
out.ok = ['astra', 'claude', 'moved'].every((e) => out[e].canvases > 0 && out[e].mark === 'number' && out[e].ms < 1500 && (!song || out[e].song))
  && ['astraLater', 'claudeLater'].every((e) => out[e].canvases > 0);
return out;
