// Smoke check for the code flow view (nodes-code.js) and the chat's code-block "Nodes" button:
// a fake reply with code, its "Nodes" button, /code-nodes, /code-outline, a light edit, and a Python snippet.
//   node dev/smoke.js --fake-engines --script dev/checks/nodes-code.js --shot /tmp/code.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(80); } return false; };
const agent = H.claudeAgent();
activate(agent.id);
await Native.send(agent.id, 'code please');
await until(() => !Native.isBusy(H.activeChat[agent.id]));
await wait(300);
const out = {};
const v = Native.view(agent.id);
out.nodesButtons = v.list.querySelectorAll('.code-act[data-act="nodes"]').length;
// a block of our own (the fake reply's code may be short): drafted into the chat as a note isn't a message, so
// open the code directly too
const sample = `import * as THREE from 'three';
const scene = new THREE.Scene();
function makeBox(s) { return new THREE.Mesh(geo(s), mat()); }
const geo = (s) => new THREE.BoxGeometry(s, s, s);
const mat = () => new THREE.MeshNormalMaterial();
class Spinner {
  constructor(o) { this.o = o; this.reset(); }
  reset() { this.t = 0; }
  update(dt) { this.t += dt; this.o.rotation.y = this.t; }
}
const box = makeBox(1);
scene.add(box);
const spin = new Spinner(box);
renderer.setAnimationLoop(() => {
  spin.update(0.016);
  renderer.render(scene, camera);
});`;
// click the first Nodes button (opens whatever the fake reply had)
const btn = v.list.querySelector('.code-act[data-act="nodes"]');
if (btn) { btn.click(); await wait(500); out.fromButton = document.querySelectorAll('.cf-dialog .nv-node').length; document.querySelector('.cf-dialog')?.close(); await wait(200); }
out.codeOutline = await (async () => { let said = ''; const ctx = { agentId: agent.id, chat: { messages: [{ role: 'assistant', text: `\`\`\`js\n${sample}\n\`\`\`` }] }, say: (t) => { said = t; } }; const r = await Commands.get('code-outline').run('', ctx); return String(r || said).split('\n').slice(0, 4).join(' | '); })();
const d = CodeFlow.open(sample, 'js', { agentId: agent.id, title: 'Code flow · test' });
await wait(500);
out.nodes = document.querySelectorAll('.cf-dialog .nv-node').length;
out.frames = document.querySelectorAll('.cf-dialog .nv-frame').length;
out.wires = document.querySelectorAll('.cf-dialog .nv-link').length;
out.status = document.querySelector('.cf-dialog .nv-status')?.textContent;
out.actions = [...document.querySelectorAll('.cf-dialog .nv-dialog-head button')].map((b) => b.textContent).join(' | ');
// select a function: the side panel shows its code and links
d.select('makeBox');
await wait(150);
out.side = document.querySelector('.cf-side .cf-head')?.textContent;
out.sideLinks = document.querySelector('.cf-side .cf-links')?.textContent;
// light edit: rename what makeBox calls
document.querySelector('.cf-side .cf-bar button:nth-child(2)')?.click();
await wait(100);
const ta = document.querySelector('.cf-side .cf-edit');
out.editing = Boolean(ta && !ta.hidden);
if (ta) { ta.value = 'function makeBox(s) { return new THREE.Mesh(geo(s), mat(), spinOnce()); }\nfunction spinOnce() { return 1; }'; document.querySelector('.cf-side .cf-bar .primary').click(); }
await wait(300);
out.afterEdit = d.code.includes('spinOnce') && document.querySelectorAll('.cf-dialog .nv-node').length;
await wait(300);
return JSON.stringify(out, null, 1);
