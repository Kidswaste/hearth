// (Nov 9) Scenes v2 for what Quentin actually makes: a new director chat's scene and a director's three_new_sketch.
// Visualizer3 was made in a project chat after Scenes v2 landed and still came out old format (7 WebGL contexts):
// the chat's starter (the orb) and three_new_sketch only made old scenes. Here, on throwaway data with fake engines:
//   1. a new director chat's starter scene is v2 (format 'gpu'), its two layers mount on the ONE renderer and draw
//   2. an untouched old-format starter draft (from before) becomes the v2 orb when a new chat opens
//   3. three_new_sketch with v2 layer code makes a v2 scene; with old-style code (its own WebGLRenderer) an old one
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --fake-engines --wait 8000 --check-timeout 240000 --script dev/checks/scenesv2-newchat.js
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pj = async (code) => { for (let i = 0; i < 6; i += 1) { const r = await D().evalInSketch(`return JSON.stringify(${code})`); if (r?.ok) return JSON.parse(r.value); await wait(300); } return null; };
const g2 = () => pj('window.__labG2 ? window.__labG2.state() : null');
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director);
  await wait(1500);
  const S = ThreeLab.scenes;

  // 1. a new chat: its starter is v2 and draws
  Native.newChat(agent.id);
  const sk = await until(() => { const x = S.get(S.currentId()); return x?.name === 'New chat' ? x : null; }, 10000);
  step(sk?.format === 'gpu', 'a new director chat\'s starter scene is v2 (format "gpu")', { format: sk?.format, layers: S.layersOf(sk || {}).map((L) => L.name) });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  c.play(true);
  const st = await until(async () => { const s = await g2(); return s && s.layers.length === 2 && s.frames > 20 ? s : null; }, 60000, 500);
  step(Boolean(st) && !st.err && st.layers.every((L) => L.objects > 0 || L.id === 'main'), 'its Backdrop + Orb mount on the one renderer and draw', st ? { backend: st.backend, layers: st.layers.map((L) => [L.id, L.objects]), frames: st.frames, err: st.err } : await g2());
  const errs = D().report().errors || [];
  step(!errs.length, 'no layer errors in the starter', errs.slice(0, 3));
  const ctx = await pj('window.__labHealth ? window.__labHealth().contexts : null');
  step(ctx === 0, 'no WebGL context for it', ctx);

  // 2. an untouched OLD-format starter draft from before (as on Quentin's machine) becomes the v2 orb when a chat opens
  const T = ChatScenes._test;
  const old = T.oldOrbLayers("#ffc23d");
  const od = S.create({ name: "New chat", code: old[0].code, layers: old });
  store.set(T.DRAFT_KEY, { id: od.id, tint: "#ffc23d" });
  Native.newChat(agent.id);
  const up = await until(() => (S.currentId() === od.id && S.get(od.id)?.format === "gpu" ? S.get(od.id) : null), 10000);
  step(Boolean(up) && S.layersOf(up).every((L, i) => L.code === T.starterLayers("#ffc23d")[i].code), "an untouched old-format starter draft becomes the v2 orb (same scene)", { current: S.currentId() === od.id, format: S.get(od.id)?.format });

  // 3. three_new_sketch: v2 code → v2 scene, old code → old scene
  const V2 = 'export default ({ THREE, scene, camera, onFrame }) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial({ color: "#ff8800" })); scene.add(m); camera.position.z = 4; onFrame((t) => { m.rotation.y = t; }); };';
  const OLD = 'import * as THREE from "three"; const r = new THREE.WebGLRenderer(); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement); const s = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(); r.setAnimationLoop(() => r.render(s, cam));';
  await D().newSketch('NS v2', V2, 2);
  step(S.get(S.currentId())?.format === 'gpu', 'three_new_sketch with v2 code makes a v2 scene', S.get(S.currentId())?.format);
  await D().newSketch('NS old', OLD, 2);
  step(S.get(S.currentId())?.format !== 'gpu', 'three_new_sketch with old-style code keeps the old format', S.get(S.currentId())?.format || 'old');
  c.play(false);
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
