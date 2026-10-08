// Director tool handlers, called the way an agent calls them (HubBridge.call → same routing as MCP calls):
// compact vs full results (chars), edits with diffs and thumbnails, batches over layers, undo / redo, search /
// read text, eval truncation, screenshot options, three_do routing, sliders as lines.
//   node dev/smoke.js --script dev/checks/director-tools.js --wait 6000 --shot /tmp/dir.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const len = (r) => (r.ok === false ? `ERR ${r.error}` : (typeof r.value === 'string' ? r.value : JSON.stringify(r.value)).length);
// what the MCP server would send the model (mcp/common.js fmtValue), vs the old JSON.stringify(v, null, 2)
const asText = (v) => { if (typeof v === 'string') return v; if (!v || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v); return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => (typeof x === 'string' ? (x.includes('\n') ? `${k}:\n${x}` : `${k}: ${x}`) : Array.isArray(x) && x.length && x.every((e) => typeof e === 'string') ? `${k}:\n${x.map((e) => `  ${e}`).join('\n')}` : `${k}: ${JSON.stringify(x)}`)).join('\n'); };
const sizes = (r) => (r.ok === false ? `ERR ${r.error}` : { text: asText(r.value).length, oldJson: JSON.stringify(r.value, null, 2).length, images: (r.images || []).length });
const call = (t, a) => HubBridge.call(t, a);
activate('tool:three');
await ThreeLab.cmd();
for (let i = 0; i < 60 && !ThreeLab.director; i += 1) await wait(100);
const d = ThreeLab.director;
const code = `import * as THREE from 'three';
const P = tweak({ punch: { value: 1.2, min: 0, max: 3, label: 'Bass punch', group: 'Music' }, glow: { value: '#ff3cac', label: 'Glow color', group: 'Color' }, spin: [0.3, -2, 2] });
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 16), new THREE.MeshBasicMaterial({ color: P.glow }));
mesh.name = 'knot';
scene.add(mesh);
console.log('hello from the sketch');
renderer.setAnimationLoop((now) => {
  mesh.rotation.y = now / 1000 * P.spin;
  mesh.scale.setScalar(1 + audio.bass * P.punch);
  mesh.material.color.set(P.glow);
  renderer.render(scene, camera);
});`;
const r1 = await call('three_set_code', { code, wait: 2 });
out.setCode = sizes(r1);
out.setCodeFull = sizes(await call('three_set_code', { code, wait: 2, report: 'full' }));
out.setCodeErrors = r1.value?.errors || 'none';
// edit: compact (diff + thumb) vs full
const e1 = await call('three_edit_code', { edits: [{ find: 'mesh.scale.setScalar(1 + audio.bass * P.punch);', replace: 'mesh.scale.setScalar(1 + audio.kick * P.punch * 1.5);' }], shot: true, wait: 1.5 });
out.edit = sizes(e1);
out.editDiff = e1.value?.diff;
out.editChanged = e1.value?.changed;
const e2 = await call('three_edit_code', { edits: [{ find: 'audio.kick * P.punch * 1.5', replace: 'audio.kick * P.punch * 2' }], report: 'full', wait: 1.5 });
out.editFull = sizes(e2);
// a miss with the whitespace hint
const e3 = await call('three_edit_code', { edits: [{ find: 'mesh.name =  \'knot\';', replace: 'x' }] });
out.editMiss = e3.error;
// layers + batch across layers (atomic: one bad edit changes nothing)
await call('three_do', { cmd: 'add_layer', name: 'Glow rings', template: 'rings', wait: 1.5 });
out.layers = (await call('three_do', { cmd: 'layers' })).value?.layers?.map((L) => L.name);
const bad = await call('three_edit_code', { edits: [{ layer: 1, find: 'camera.position.z = 4;', replace: 'camera.position.z = 5;' }, { layer: 'Glow rings', find: 'NOT THERE', replace: '' }] });
out.batchBadIsAtomic = bad.ok === false && d.codeOf(1).code.includes('camera.position.z = 4;');
const b = await call('three_edit_code', { edits: [{ layer: 1, find: 'camera.position.z = 4;', replace: 'camera.position.z = 5;' }, { layer: 'Glow rings', lines: [1, 1], replace: '// rings, edited by the batch\n' + d.codeOf('Glow rings').code.split('\n')[0] }], wait: 1.5 });
out.batch = b.ok ? b.value.changed : b.error;
out.batchDiff = b.value?.diff;
// undo / redo
out.historyLen = ThreeDirector.history().length;
const u = await ThreeDirector.undo();
out.undo = `${u.layer}: ${u.restored}`;
out.undoRestored = d.codeOf('Glow rings').code.startsWith('// rings, edited') === false;
const rd = await ThreeDirector.redo();
out.redo = `${rd.layer}: ${rd.restored}`;
// read / search as text
const rc = await call('three_read_code', { layer: 1, around: 10 });
out.read = rc.value?.split('\n').slice(0, 3);
out.readOldJson = JSON.stringify(d.readCode(1, 1, 30), null, 2).length;
out.readNow = (await call('three_read_code', { layer: 1, from: 1, to: 30 })).value.length;
const sc = await call('three_search_code', { pattern: 'mesh' });
out.search = sc.value;
out.searchOldJson = JSON.stringify(d.searchCode('mesh', { context: 1 }), null, 2).length;
out.searchNow = sc.value.length;
// eval: plain value, truncation, console
out.eval = (await call('three_eval', { code: '__scenes ? Object.keys(__scenes) : 1' })).value;
const big = await call('three_eval', { code: 'Array.from({ length: 3000 }, (_, i) => i)', max: 500 });
out.evalCut = typeof big.value === 'string' ? big.value.slice(-120) : big;
out.evalPrint = (await call('three_eval', { code: 'console.log("printed!"); return 2' })).value;
// sliders as lines
const sl = await call('three_sliders', { layer: 1, set: { punch: 2 } });
out.sliders = sl.value?.sliders;
out.slidersOldJson = JSON.stringify(d.sliders(1, null), null, 2).length;
out.slidersNow = asText(sl.value).length;
// console / get_code compact vs full
out.console = sizes(await call('three_console', {}));
out.consoleFull = sizes(await call('three_console', { full: true }));
out.getCode = asText((await call('three_get_code', {})).value).length;
out.getCodeOld = JSON.stringify(d.getCode(), null, 2).length;
// screenshots
const shotInfo = async (a) => { const r = await call('three_screenshot', a); if (!r.ok) return r.error; const img = new Image(); img.src = `data:image/jpeg;base64,${r.images[0].data}`; await img.decode(); return `${img.width}×${img.height} ${r.value.slice(0, 90)}`; };
out.shotDefault = await shotInfo({});
out.shotSmall = await shotInfo({ size: 'small' });
out.shotRegion = await shotInfo({ size: 'small', region: [0.25, 0.25, 0.5, 0.5] });
out.shotCompare = await shotInfo({ size: 'small', compare: true });
out.shotFrames = await shotInfo({ size: 'medium', frames: 4, gap: 0.2 });
// within one reply: unchanged reads / pictures aren't sent twice; a new message resets it
ThreeDirector.newTurn();
await call('three_read_code', { layer: 1, from: 1, to: 5 });
out.readAgain = (await call('three_read_code', { layer: 1, from: 1, to: 5 })).value;
await call('three_do', { cmd: 'set_frame', size: 'fit' });
await call('three_eval', { code: 'for (const k in __scenes) __scenes[k].renderer.setAnimationLoop(null); 1' }); // a still picture
await wait(300);
await call('three_screenshot', { size: 'small' });
out.shotAgain = (await call('three_screenshot', { size: 'small' })).value;
out.shotForced = (await call('three_screenshot', { size: 'small', force: true })).images?.length;
await call('three_do', { cmd: 'set_frame', size: 'fit' });
out.saved = ThreeDirector.saved();
// eval samples, errors with their code line
out.samples = (await call('three_eval', { code: 'Math.round(performance.now()) % 1000', samples: 4, every: 50 })).value;
const broken = await call('three_edit_code', { layer: 1, edits: [{ find: 'mesh.name = \'knot\';', replace: 'mesh.name = \'knot\';\nundefinedThing.go();' }], wait: 1.5 });
out.errorLines = broken.value?.errorLines || broken.value?.errors || broken.error;
await ThreeDirector.undo({ force: true });
out.screenshotAtBad = (await call('three_screenshot', { at: 'drop' })).error;
// multi-command routing + usage names
out.doTimeline = (await call('three_do', { cmd: 'timeline' })).ok === false ? 'no song (expected)' : 'ok';
out.doFrame = (await call('three_do', { cmd: 'set_frame', size: '9:16' })).value?.frame;
out.doBad = (await call('three_do', {})).error;
out.forgePatch = HubBridge.resolve('forge_patch', { action: 'save', name: 'x', code: '1' }).tool;
out.summary = HubBridge.summarize('three_edit_code', { edits: [1, 2], shot: true });
return JSON.stringify(out, null, 1);
