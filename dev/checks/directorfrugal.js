// (round 49, directorfrugal) Fewer director steps, end to end with a director chat's REAL MCP calls (fake Claude `mcp:`
// keyword → mcp/three-mcp.js → gamebridge → HubBridge with the chat id → the Lab → tools/three-director.js):
//   - a new layer answers "errors: none" with its own small picture (no screenshot step, no console step)
//   - help camera names the camera moves; asked again in the next message it is one "same as before" line (the server
//     asks the hub's per-chat memory: three_seen, never logged as a call of the model's)
//   - a broken edit answers with the error, its fix and no picture; three_do undo puts it back
//   - a batch that takes its own screenshot gets only that picture
// Step budgets: each of these asks is ONE call where it took two or three before (dev/directorfrugal-test.js has the
// per-task token budgets).
//   node dev/smoke.js --fake-engines --script dev/checks/directorfrugal.js --wait 6000 --check-timeout 240000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(60); } return false; };
const out = { steps: [], problems: [] };
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

// one message whose reply makes these MCP calls; the reply lists each call's result ("- tool: N chars + 1 image · text")
async function turn(calls) {
  const chatId0 = H.activeChat[agent.id];
  await Native.send(agent.id, `mcp: ${JSON.stringify(calls)}`);
  await wait(50);
  await until(() => !Native.isBusy(H.activeChat[agent.id] || chatId0), 120000);
  await until(() => !HubBridge.log().some((e) => e.running), 5000);
  return (Native.current(agent.id).messages.at(-1)?.text || '').match(/^- three_\w+: .*$/gm) || [];
}
const images = (line) => Number((line || '').match(/\+ (\d+) image/)?.[1] || 0);
const CODE = `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size', group: 'Shape' }, color: { value: '#7cf6ff', label: 'Color', group: 'Color' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const zz = 1;
const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: P.color, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.scale.setScalar(P.size * (1 + zz * 0)); mesh.rotation.y = now / 1000; renderer.render(scene, camera); });`;

const logBefore = HubBridge.log().length;
const t1 = await turn([['three_do', { cmd: 'help', topic: 'camera' }], ['three_add_layer', { name: 'Frugal ball', code: CODE }]]);
step(/\/camera-moves push in/.test(t1[0] || ''), 'help camera: the camera moves', t1[0]?.slice(0, 140));
// (the fake engine's report line shows the first 160 characters: "errors: none" comes last, an error list would come first)
step(!/errors: \[/.test(t1[1] || '') && images(t1[1]) === 1, 'a new layer: no errors + its small picture in the same result', t1[1]?.slice(0, 200));
const t2 = await turn([['three_do', { cmd: 'help', topic: 'camera' }]]);
step(/same as before \(you got it 1 message ago/.test(t2[0] || '') && (t2[0] || '').length < 220, 'help camera again (next message): one line', t2[0]?.slice(0, 160));
step(!HubBridge.log().slice(logBefore).some((e) => e.tool === 'three_seen'), 'the server\'s "already have it?" question isn\'t logged as a tool call');
const t3 = await turn([['three_edit_code', { layer: 'Frugal ball', edits: [{ find: 'const zz = 1;', replace: 'const zz = nope.value;' }] }]]);
step(/errors: \[Frugal ball\]/.test(t3[0] || '') && images(t3[0]) === 0, 'a broken edit: its error, no picture', t3[0]?.slice(0, 260));
// the whole text (the report line is cut): the error's fix and the lines around it, as the console gives them too
const con = await HubBridge.call('three_console', {}, { chatId: H.activeChat[agent.id] });
const ct = HubBridge.fmtText(con.value);
step(/nope is not defined.*fix: declare nope/.test(ct) && /near:\n[\s\S]*\d+> const zz = nope\.value;/.test(ct), 'the error comes with its fix and the lines around it', ct.slice(0, 400));
const t4 = await turn([['three_do', { cmd: 'undo' }], ['three_do', { cmd: 'batch', ops: [{ cmd: 'sliders', layer: 'Frugal ball', set: { size: 2 } }, { cmd: 'screenshot' }] }]]);
step(/Undid/.test(t4[0] || ''), 'three_do undo puts it back', t4[0]?.slice(0, 120));
step(images(t4[1]) === 1 && /bloom|size = 2|moved/.test(t4[1] || ''), 'a batch that takes its own screenshot: just that one picture', t4[1]?.slice(0, 200));
out.saved = ThreeDirector.saved();
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
