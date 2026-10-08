// Smoke check for Shader nodes (nodes-shader.js): every node type and every preset compiles for every target
// (WebGL2 for the playground / preview, WebGL1 for Lab filter layers and Lab layers), then the editor opens.
//   node dev/smoke.js --script dev/checks/nodes-shader.js --shot /tmp/shader.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = window.ShaderNodes;
const reg = S.registry;
const c2 = document.createElement('canvas').getContext('webgl2');
const c1 = document.createElement('canvas').getContext('webgl');
const PLAY = ['#version 300 es', 'precision highp float;', 'uniform float uTime;', 'uniform vec2 uResolution;', 'uniform vec2 uMouse;', 'uniform int uFrame;', 'in vec2 vUv;', 'out vec4 fragColor;'].join('\n');
const MUS = ['uKick', 'uSnare', 'uHit', 'uBeat', 'uBass', 'uLevel', 'uHats', 'uDrop', 'uBeatPhase'];
const FHEAD = ['precision highp float;', 'uniform sampler2D uSrc;', 'uniform sampler2D uPrev;', 'uniform vec2 uRes;', 'uniform float uTime;', ...MUS.map((u) => `uniform float ${u};`), 'varying vec2 vUv;'].join('\n');
function compile(gl, src) {
  const s = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  const ok = gl.getShaderParameter(s, gl.COMPILE_STATUS);
  const log = ok ? '' : gl.getShaderInfoLog(s);
  gl.deleteShader(s);
  return log;
}
function check(graph) {
  const bad = {};
  const pv = S.previewSource(graph);
  let e = compile(c2, pv.src); if (e) bad.preview = e.slice(0, 300);
  const pg = S.build(graph, 'playground', { embedGraph: false });
  e = compile(c2, `${PLAY}\n${pg.code}`); if (e) bad.playground = e.slice(0, 300);
  const fl = S.build(graph, 'filter');
  const decl = fl.tweaks.map((t) => `uniform ${typeof t.value === 'string' && t.value.startsWith('#') ? 'vec3' : 'float'} u_${t.key};`).join('\n');
  e = compile(c1, `${FHEAD}\n${decl}\n${fl.frag}`); if (e) bad.filter = e.slice(0, 300);
  const ly = S.build(graph, 'layer');
  e = compile(c1, `precision highp float;\n${ly.frag}`); if (e) bad.layer = e.slice(0, 300);
  if (pv.errors.length) bad.graph = pv.errors.map((x) => x.message).join('; ');
  return bad;
}
const out = { types: reg.list().length, presets: S.presets().length, badTypes: {}, badPresets: {} };
// each node type alone, its first output wired to the Output (converted as needed)
for (const d of reg.list()) {
  if (d.type === 'output') continue;
  const g = NodeView.emptyGraph('shader');
  g.nodes.push({ id: 'a1', type: d.type, x: 0, y: 0 }, { id: 'out1', type: 'output', x: 300, y: 0 });
  const o = d.outputs[0];
  if (o) g.links.push({ from: ['a1', o.name], to: ['out1', 'color'] });
  const bad = check(g);
  if (Object.keys(bad).length) out.badTypes[d.type] = bad;
}
for (const p of S.presets()) {
  const bad = check(S.buildPreset(p.id));
  if (Object.keys(bad).length) out.badPresets[p.id] = bad;
}
// the editor, with a preset, and the chat commands
await Commands.tryRun('/shader-nodes-new kick-tunnel', H.claudeAgent().id);
await wait(800);
out.editor = Boolean(S.ui);
out.list = (await S.run('list')).split('\n').length;
out.add = await S.run('add noise to=out1.color').catch((e) => e.message);
out.nodesShown = document.querySelectorAll('.sg-dialog .nv-node').length;
out.status = document.querySelector('.sg-dialog .nv-status')?.textContent;
const px = (() => { const cv = document.querySelector('.sg-canvas'); const g = cv?.getContext('webgl2'); if (!g) return null; const a = new Uint8Array(4); g.readPixels(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1, g.RGBA, g.UNSIGNED_BYTE, a); return [...a]; })();
out.pixel = px;
await S.run('undo');
// every round-2 command is registered under its own area (none silently shadowed)
const mine = { 'Shader nodes': ['shader-nodes', 'shader-nodes-new', 'shader-nodes-presets', 'shader-nodes-types', 'shader-nodes-list', 'shader-nodes-add', 'shader-nodes-link', 'shader-nodes-unlink', 'shader-nodes-set', 'shader-nodes-rm', 'shader-nodes-bypass', 'shader-nodes-layout', 'shader-nodes-undo', 'shader-nodes-apply', 'shader-nodes-to', 'shader-nodes-code'],
  Video: ['video-nodes', 'video-flow', 'video-flow-run', 'video-flow-stop', 'video-flow-continue', 'video-flow-presets', 'video-flow-list', 'video-flow-types', 'video-flow-add', 'video-flow-link', 'video-flow-set', 'video-flow-rm', 'video-flow-skip', 'video-flow-commands', 'video-flow-save', 'video-flow-load', 'video-flow-saved'],
  Messages: ['code-nodes', 'code-nodes-paste', 'code-nodes-file', 'code-outline'] };
out.missingCommands = Object.entries(mine).flatMap(([a, list]) => list.filter((n) => Commands.get(n)?.area !== a));
out.commandCount = Commands.list().length;
await wait(400);
return JSON.stringify(out, null, 1);
