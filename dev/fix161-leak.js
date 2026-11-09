// (round 161, fix161) Dev aid, not a check: opens the Lab window on a scene, then saves a heap snapshot of Hearth's
// window after its Lab was let go (ThreeLab.drop), to find what still holds the Lab's tab:
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/fix161-leak.js (saves /tmp/fix161-leak.heapsnapshot; --eval "window.SNAP='…'" for another file)
//   then any heap snapshot viewer (the tab's context has the variables previewHost and sketches).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const lw = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
await smoke({ cdnFor: 'lab-window\\.html' });
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && window.LabWinHost, 60000);
await ThreeLab.cmd();
await ThreeLab.director.newSketch('Leak fixture (fix161)', "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer(); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);\nconst s = new THREE.Scene(); const c = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); c.position.z = 4; s.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()));\nr.setAnimationLoop(() => r.render(s, c));", 1);
await until(() => ThreeLab.workspace.state().ready, 30000);
await wait(1500);
const ref = new WeakRef(ThreeLab.director);
const id = ThreeLab.scenes.currentId();
const r = await LabWinHost.open(id, { hideMain: false });
await until(async () => lw('typeof LabWin !== "undefined" && LabWin.times().frame ? true : null'), 60000);
await wait(1500);
for (let i = 0; i < 3; i += 1) { await smoke({ cdp: 'HeapProfiler.collectGarbage' }); await wait(300); }
const info = { open: r, dropped: ThreeLab.dropped?.(), host: LabWinHost.state(), collected: ref.deref() === undefined };
info.snap = await smoke({ snapshot: window.SNAP || '/tmp/fix161-leak.heapsnapshot' });
await window.hub.labwin.close();
await until(async () => !(await window.hub.labwin.state()).open, 15000);
const back = await until(() => !ThreeLab.dropped() && ThreeLab.workspace?.state?.().ready && ThreeLab.scenes.currentId() === id, 30000);
info.back = Boolean(back);
return JSON.stringify(info);
