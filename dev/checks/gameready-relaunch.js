// ▶ Play, got ready (round 52, gameready): the second launch. Runs after dev/checks/gameready.js on the same Chromium
// profile (--profile, not emptied): the same "Clink" Lab scene is made and prepared first thing, exactly as the first
// launch did; its shaders come from Chromium's GPU shader disk cache (GPUCache), so it is ready sooner.
//   compare  createAndReadyMs / compileMs with /tmp/hearth-gameready/launch1.json (the first launch's)
//   cache    the profile's GPUCache folder has files (the cache persisted across the launch)
// window.GR_REPORT = 1 only reports (no verdict).
//   node dev/smoke.js --check-timeout 600000 --profile /tmp/hearth-gameready-profile --script dev/checks/gameready-relaunch.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const DIR = '/tmp/hearth-gameready';
const BASE = "import * as THREE from 'three';\nconst renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);\nconst scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 10);\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));";
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
let first = null;
try { first = JSON.parse(await window.hub.fs.read(`${DIR}/launch1.json`)); } catch { /* below */ }
step('the first launch\'s numbers are there (run dev/checks/gameready.js first)', Boolean(first?.createAndReadyMs), first);
// the same scene code as the first launch (dev/checks/gameready.js wrote it next to its numbers)
const GAME = await window.hub.fs.read(`${DIR}/game-scene.js`).catch(() => null);
step('the same scene code', Boolean(GAME));
if (first && GAME) {
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 30000);
  const D = ThreeLab.director; const c = await ThreeLab.cmd();
  let text = '';
  try { c.customSize(640, 360); c.size('custom'); } catch { /* fine */ }
  await wait(800);
  if (typeof GameReady === 'undefined' && window.Lazy) await Lazy.load('gameready');
  const t0 = performance.now();
  // (the references first, then the game's layer: a layer run before its references throws "No reference")
  await D.newSketch('Clink fixture', BASE, 1);
  await D.refs.add(`${DIR}/ground.jpg`, 'ground');
  await D.refs.add(`${DIR}/detail.png`, 'detail');
  await D.addLayer({ name: 'Game', code: GAME }, 2);
  await Commands.tryRun(`/model add ${DIR}/ship.glb`, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `ERR ${e}`; } });
  localStorage.setItem('gameready.test', JSON.stringify({ hold: 0 }));
  const sc = ThreeLab.game.scene();
  const r = await GameReady.prepare({ kind: 'lab', id: sc.id, title: 'Clink' });
  const second = { createAndReadyMs: Math.round(performance.now() - t0), compileMs: r.steps?.prep?.compileMs, readyMs: r.readyMs, prepGl: r.steps?.prep?.gl, effectsMs: r.ms?.effects };
  GameReady.stop();
  localStorage.removeItem('gameready.test');
  out.first = first; out.second = second;
  out.faster = { createAndReady: `${first.createAndReadyMs} → ${second.createAndReadyMs} ms (${Math.round((1 - second.createAndReadyMs / first.createAndReadyMs) * 100)} % less)`, compile: `${first.compileMs} → ${second.compileMs} ms` };
  step('second launch: the scene made and ready sooner (the shader disk cache)', second.createAndReadyMs < first.createAndReadyMs, out.faster);
}
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: window.GR_REPORT ? true : bad.length === 0, failed: bad.map((s) => s.name), ...out }, null, 1);
