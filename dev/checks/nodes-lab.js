// Smoke check: the Lab's own nodes still work (round-1 API), bypass compiles, and shader graphs land in the Lab
// as a layer and a filter layer (filter.define) without errors; the Lab's Nodes switch offers the shader editor.
//   node dev/smoke.js --script dev/checks/nodes-lab.js --shot /tmp/lab.png --check-timeout 150000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const agent = H.claudeAgent().id;
const out = {};
await Commands.tryRun('/nodes-new beat-particles', agent);
await wait(2500);
const L = ThreeNodes.lab;
out.labNodes = L?.view.getGraph().nodes.length;
const g = L.view.getGraph();
const pump = g.nodes.find((n) => n.type === 'peak')?.id;
L.view.bypass([pump], true);
await wait(1500);
const r = ThreeNodes.compile(L.view.getGraph());
out.bypassCompiles = !r.errors.length && /bypass/.test(JSON.stringify(NodeView.compact(L.view.getGraph(), ThreeNodes.registry)));
out.labState = L.state;
// shader graph → a Lab layer and a filter layer
await Commands.tryRun('/shader-nodes-new plasma', agent);
await wait(600);
const res1 = await ShaderNodes.run('to layer');
out.toLayer = res1;
await wait(2500);
const res2 = await ShaderNodes.run('new rgb-glitch-fx');
const res3 = await ShaderNodes.run('to filter');
out.toFilter = res3;
await wait(3000);
out.layers = ThreeLab.director.layers().layers?.map((x) => x.name || x).join(' | ');
// console errors from the sandbox
const cons = await ThreeLab.director.console?.().catch?.(() => null);
out.console = JSON.stringify(cons || '').slice(0, 400);
ShaderNodes.ui?.close();
await wait(300);
// the Lab's Nodes view on the shader layer offers the shader editor
L.setMode('nodes');
await wait(800);
out.card = document.querySelector('.tn-empty-card b')?.textContent;
return JSON.stringify(out, null, 1);
