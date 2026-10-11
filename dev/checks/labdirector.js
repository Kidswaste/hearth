// Round 21 "labdirector": the Three Director loop, timed and counted the way the owner uses it. Three typical turns go
// through the fake Claude engine's REAL MCP calls (dev/fake-claude.js `mcp:` keyword → mcp/three-mcp.js → gamebridge →
// HubBridge → the Lab), then the phases are timed on their own:
//   - each turn: wall ms (send → reply done), per-call ms (HubBridge log), tokens the model reads back (text / 4 +
//     pictures ≈ w×h / 750), and the change on screen (the preview's first new frame after the edit: 'drawn')
//   - edit apply: call → first new frame → tool answer; screenshot: ms and bytes by size; a broken edit's error line
//     and its auto-undo (safe: true); a stuck call ends with an error instead of "working" forever
//   node dev/smoke.js --fake-engines --script dev/checks/labdirector.js --wait 6000 --check-timeout 300000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(60); } return false; };
const out = { steps: [], problems: [], turns: {}, phases: {} };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(600);
Native.newChat(agent.id);
await wait(600);

// the preview's "first new frame of a layer" message (tools/three-sandbox.html posts { type: 'drawn' })
const drawnAt = [];
addEventListener('message', (e) => { if (e.data?.type === 'drawn') drawnAt.push(performance.now()); });

const CODE = `import * as THREE from 'three';
const P = tweak({ punch: { value: 1.2, min: 0, max: 3, label: 'Bass punch', group: 'Music' }, tint: { value: '#7a5cff', label: 'Tint', group: 'Color' }, spin: [0.3, -2, 2] });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 16), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
renderer.setAnimationLoop((now) => {
  mesh.rotation.y = now / 1000 * P.spin;
  mesh.scale.setScalar(1 + audio.bass * P.punch);
  mesh.material.color.set(P.tint);
  renderer.render(scene, camera);
});`;

// one director turn through the fake engine's real MCP calls
async function turn(label, calls) {
  const chatId0 = H.activeChat[agent.id];
  const logFrom = HubBridge.log().length ? HubBridge.log().at(-1).id : null;
  const t0 = performance.now();
  const d0 = drawnAt.length;
  await Native.send(agent.id, `mcp: ${JSON.stringify(calls)}`);
  await wait(50);
  await until(() => !Native.isBusy(H.activeChat[agent.id] || chatId0), 120000);
  const ms = Math.round(performance.now() - t0);
  await until(() => !HubBridge.log().some((e) => e.running), 5000);
  const log = HubBridge.log();
  const mine = log.slice(logFrom ? log.findIndex((e) => e.id === logFrom) + 1 : 0);
  const reply = Native.current(agent.id).messages.at(-1)?.text || '';
  const firstDrawn = drawnAt.slice(d0)[0];
  const r = {
    ms, calls: mine.length,
    callMs: mine.map((e) => `${e.via === 'three_do' ? `do ${e.tool.replace(/^three_/, '')}` : e.tool.replace(/^three_/, '')} ${e.ms}`).join(' · '),
    toolMs: mine.reduce((n, e) => n + (e.ms || 0), 0),
    tokens: mine.reduce((n, e) => n + (e.tokens || 0), 0),
    onScreenMs: firstDrawn ? Math.round(firstDrawn - t0) : null,
    errors: mine.filter((e) => e.ok === false).map((e) => e.error),
    chars: (reply.match(/^- three_\w+: .*$/gm) || []).map((l) => l.replace(/ · .*$/, '').replace(/^- /, '')),
  };
  out.turns[label] = r;
  return r;
}

await turn('setup', [['three_set_code', { code: CODE, wait: 1 }]]);
await wait(500);
const knot = ThreeLab.director.codeOf().name; // the layer the setup wrote (the chat's starter scene has others)
const t1 = await turn('make it pulse on the kick', [
  ['three_search_code', { pattern: 'scale' }],
  ['three_edit_code', { edits: [{ find: 'mesh.scale.setScalar(1 + audio.bass * P.punch);', replace: 'mesh.scale.setScalar(1 + audio.kick * P.punch * 1.5);' }], shot: true }],
]);
step(!t1.errors.length && t1.calls === 2, 'pulse on the kick: search + edit (with a preview)', t1);
const t2 = await turn('add a pink glow', [
  ['three_add_layer', { template: 'glow', name: 'Pink glow' }],
  ['three_sliders', { layer: 'top' }],
  ['three_screenshot', {}],
]);
step(!t2.errors.length, 'pink glow: add layer + sliders + screenshot', t2);
const t3 = await turn('make it 9:16 and save', [
  ['three_do', { cmd: 'set_frame', size: '9:16' }],
  ['three_do', { cmd: 'looks', action: 'save', name: 'Pink pulse' }],
  ['three_screenshot', {}],
]);
step(!t3.errors.length, '9:16 and save: frame + look + screenshot', t3);

// ---------- phases on their own (HubBridge.call: the same handlers, no engine) ----------
const chatId = H.activeChat[agent.id];
const call = (t, a) => HubBridge.call(t, a, { chatId });
const timeIt = async (fn) => { const t = performance.now(); const r = await fn(); return { r, ms: Math.round(performance.now() - t) }; };
// (at the "fit" frame and 3 runs each, median: the software renderer here draws 9:16 at ≈ 1–2 fps, which swamps the rest)
await call('three_do', { cmd: 'set_frame', size: 'fit' });
await wait(1500);
const med = (a) => { const x = a.filter((v) => v != null).sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : null; };
// edit apply: call → first new frame on screen → the answer (the gap is time the director waited for nothing)
{
  const runs = [];
  for (let i = 0; i < 3; i += 1) {
    const d0 = drawnAt.length; const t = performance.now();
    const r = await call('three_edit_code', { layer: knot, edits: [{ find: 'P.punch * 1.5', replace: 'P.punch * 1.6' }] });
    const ms = performance.now() - t;
    runs.push({ ms, on: drawnAt.length > d0 ? drawnAt[d0] - t : null, r });
    await call('three_edit_code', { layer: knot, edits: [{ find: 'P.punch * 1.6', replace: 'P.punch * 1.5' }] });
  }
  const r = runs[0].r;
  out.phases.edit = { answerMs: Math.round(med(runs.map((x) => x.ms))), onScreenMs: Math.round(med(runs.map((x) => x.on))), idleAfterOnScreenMs: Math.round(med(runs.map((x) => (x.on == null ? null : x.ms - x.on)))), ok: r.ok !== false, ...(r.ok === false ? { error: r.error } : { chars: HubBridge.fmtText(r.value).length, text: HubBridge.fmtText(r.value).slice(0, 300) }) };
}
// the same edit with its small picture
{
  const ms = [];
  for (let i = 0; i < 3; i += 1) {
    const { r, ms: m } = await timeIt(() => call('three_edit_code', { layer: knot, edits: [{ find: 'P.punch * 1.5', replace: 'P.punch * 1.55' }], shot: true }));
    ms.push(m); out.phases['edit + shot'] = { images: (r.images || []).length };
    await call('three_edit_code', { layer: knot, edits: [{ find: 'P.punch * 1.55', replace: 'P.punch * 1.5' }] });
  }
  out.phases['edit + shot'].ms = med(ms);
}
// screenshots by size: ms and the picture's bytes / tokens
for (const size of ['small', 'medium', 'large', undefined]) {
  const ms = []; let im = null;
  for (let i = 0; i < 3; i += 1) { ThreeDirector.newTurn(); const x = await timeIt(() => call('three_screenshot', size ? { size } : {})); ms.push(x.ms); im = x.r.images?.[0] || im; }
  out.phases[`shot ${size || 'default'}`] = { ms: med(ms), kb: im ? Math.round(im.data.length * 0.75 / 1024) : 0, tokens: im ? await HubBridge.imageTokens(im) : 0 };
}
// a broken edit: one short error line (layer + line); safe: true puts the code back by itself
{
  const before = ThreeLab.director.codeOf(knot).code;
  const r = await call('three_edit_code', { layer: knot, edits: [{ find: 'mesh.rotation.y = now / 1000 * P.spin;', replace: 'mesh.rotation.y = now / 1000 * P.spin + nope.x;' }], safe: true, wait: 3 });
  const text = r.ok === false ? `ERROR ${r.error}` : HubBridge.fmtText(r.value);
  const after = ThreeLab.director.codeOf(knot).code;
  out.phases.brokenEdit = { text: text.slice(0, 400), reverted: after === before };
  step(/nope/.test(text) && /line \d+/.test(text), 'a broken edit shows the error with its layer and line', text.slice(0, 200));
  step(after === before, 'safe: true undoes a broken edit by itself');
  await wait(800);
}
// three_do undo: the last change back without resending code
{
  const before = ThreeLab.director.codeOf(knot).code;
  await call('three_edit_code', { layer: knot, edits: [{ find: 'P.punch * 1.6', replace: 'P.punch * 1.7' }] });
  const { r, ms } = await timeIt(() => call('three_do', { cmd: 'undo' }));
  out.phases.undo = { ms, text: r.ok === false ? `ERROR ${r.error}` : HubBridge.fmtText(r.value) };
  step(ThreeLab.director.codeOf(knot).code === before, 'three_do undo puts the last change back', out.phases.undo);
}
out.saved = ThreeDirector.saved();
return JSON.stringify(out, null, 1);
