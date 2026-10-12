// ◇ Shader workbench (round 23, labshader): every starter compiles; a starter's uniforms become sliders; a Shadertoy
// paste with a Buffer A feeding itself (iChannel0) and an ISF filter import and draw; a broken shader reports its error
// on the right line in the code (inline in the editor) while the last good version keeps drawing; the picture follows
// the uBass uniform; a new uniform line becomes a slider on the next run; the workbench, /shader and three_do shader.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/labshader.js --shot /tmp/hearth-labshader.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
activate('tool:three'); await wait(400);
await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(600); } return r; };
const probe = async () => String(await sbx('return window.__labGpu.probe(16)')).split(',').map(Number);
const mean = (a) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const diff = (a, b) => { if (!a?.length || a.length !== b?.length) return 999; let m = 0; for (let i = 0; i < a.length; i++) m += Math.abs(a[i] - b[i]); return Math.round((m / a.length) * 100) / 100; };
const infoOf = async (name) => { const L = d.layers().layers.find((x) => x.name === name); const all = await sbx('return window.__labShader.info()'); return { L, i: Array.isArray(all) ? all.find((x) => x.id === L?.id) : null }; };
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#203050'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshNormalMaterial()); scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.set(t / 900, t / 700, 0); renderer.render(scene, camera); });`;
await d.newSketch('labshader probe', BG, 3);

// 1. the library: every starter compiles (in the preview page, no layer made)
const bad = {};
for (const st of ShaderLib.STARTERS()) {
  const r = await LabShader.check({ image: st.image, buffers: st.buffers, common: st.common });
  if (!r?.ok) bad[st.id] = (r?.errors || [r]).slice(0, 2);
}
step(`all ${ShaderLib.STARTERS().length} starters compile`, ShaderLib.STARTERS().length >= 30 && !Object.keys(bad).length, Object.keys(bad).length ? bad : ShaderLib.STARTERS().length);

// 2. a starter → a ◇ layer whose uniforms are sliders
const a = await LabShader.addStarter('plasma');
await until(async () => (await infoOf(a.layer)).i?.frames > 2, 15000);
const plasma = await infoOf(a.layer);
const sl = d.sliders(plasma.L.id).sliders.map((s) => s.key);
step('starter "plasma" draws as a ◇ layer', plasma.i?.ok && plasma.i.frames > 2, { layer: a.layer, compiled: a.compiled, frames: plasma.i?.frames });
step('its uniforms are sliders (uSpeed, uScale, uTint color, uPunch)', ['uSpeed', 'uScale', 'uTint', 'uPunch'].every((k) => sl.includes(k)), sl);
step('the director sees it as a shader layer', /^shader/.test(plasma.L.kind || ''), plasma.L.kind);

// 3. a Shadertoy paste: Buffer A feeds itself (iChannel0), the Image shows Buffer A
const TOY = `// Buffer A
// iChannel0: Buffer A
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 c = 0.5 + 0.3 * vec2(cos(iTime * 2.0), sin(iTime * 2.0));
  float d = length((uv - c) * vec2(iResolution.x / iResolution.y, 1.0));
  fragColor = vec4(texture(iChannel0, uv).rgb * 0.97 + vec3(1.0, 0.5, 0.2) * smoothstep(0.08, 0.0, d), 1.0);
}
// Image
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(texture(iChannel0, fragCoord / iResolution.xy).rgb, 1.0);
}`;
const t = await LabShader.importAs(TOY, { name: 'Toy trails' });
await until(async () => (await infoOf(t.layer)).i?.frames > 10, 15000);
const toy = await infoOf(t.layer);
step('Shadertoy paste: Buffer A → Image, iChannel0 mapped to Buffer A in both', toy.i?.ok && toy.i.passes.join() === 'A,image' && toy.i.channels.A?.iChannel0 === 'A' && toy.i.channels.image?.iChannel0 === 'A', { notes: t.notes, info: toy.i && { passes: toy.i.passes, channels: toy.i.channels } });
await wait(300);
const p1 = await probe(); await wait(700); const p2 = await probe();
step('…and its feedback trails draw and move', mean(p1) > 3 && diff(p1, p2) > 0.3, { mean: Math.round(mean(p1)), moved: diff(p1, p2) });

// 4. an ISF filter: its inputs become sliders, its image input reads the layers below
const ISF = `/*{
  "DESCRIPTION": "invert mix", "ISFVSN": "2",
  "INPUTS": [ { "NAME": "inputImage", "TYPE": "image" }, { "NAME": "amount", "TYPE": "float", "MIN": 0, "MAX": 1, "DEFAULT": 0.8, "LABEL": "Amount" },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.2, 1.0] }, { "NAME": "flip", "TYPE": "bool", "DEFAULT": false } ]
}*/
void main() {
  vec4 c = IMG_THIS_PIXEL(inputImage);
  vec2 uv = isf_FragNormCoord;
  if (flip) uv.y = 1.0 - uv.y;
  gl_FragColor = vec4(mix(c.rgb, (1.0 - c.rgb) * tint.rgb, amount), 1.0) + 0.0 * IMG_NORM_PIXEL(inputImage, uv);
}`;
const s = await LabShader.importAs(ISF, { name: 'ISF invert' });
await until(async () => (await infoOf(s.layer)).i?.frames > 2, 15000);
const isf = await infoOf(s.layer);
const isl = d.sliders(isf.L.id).sliders.map((x) => x.key);
step('ISF import compiles and draws (inputImage = the layers below)', isf.i?.ok && isf.i.frames > 2 && s.imported === 'isf', { notes: s.notes, frames: isf.i?.frames });
step('ISF inputs are sliders (amount, tint, flip)', ['amount', 'tint', 'flip'].every((k) => isl.includes(k)), isl);
await d.updateLayer(s.layer, { visible: false }, 0.3);
await d.updateLayer(t.layer, { visible: false }, 0.3);

// 5. a broken shader: the error on its line, the last good version keeps drawing
d.selectLayer(a.layer);
const good = d.codeOf(plasma.L.id).code;
const lines = good.split('\n');
const at = lines.findIndex((x) => x.includes('col *= 1.0 + uKick * uPunch;'));
const broken = good.replace('col *= 1.0 + uKick * uPunch;', 'col *= 1.0 + uKick * uPunchTypo;');
const b0 = await probe();
await d.updateLayer(a.layer, { code: broken }, 1.5);
await until(() => d.report().errors.some((e) => e.layer === a.layer), 8000);
const errs = d.report().errors.filter((e) => e.layer === a.layer);
const after = await infoOf(a.layer);
await wait(500);
const b1 = await probe(); await wait(600); const b2 = await probe();
step('a GLSL error is reported on its line in the code', errs.length && errs[0].line === at + 1 && /uPunchTypo|undeclared/i.test(errs[0].message), { want: at + 1, errs });
step('…while the last good shader keeps drawing (and moving)', after.i?.fallback === true && mean(b1) > 5 && diff(b1, b2) > 0.2, { fallback: after.i?.fallback, mean: Math.round(mean(b1)), moved: diff(b1, b2), before: Math.round(mean(b0)) });
await wait(300);
const lens = [...document.querySelectorAll('.sh-lens-row')].map((r) => ({ top: r.style.top, text: r.textContent }));
step('the editor shows it inline (wavy line + message on that line)', lens.length >= 1 && lens.some((r) => /uPunchTypo|undeclared/i.test(r.text)), lens);
await d.updateLayer(a.layer, { code: good }, 1.5);
await until(async () => (await infoOf(a.layer)).i?.fallback === false, 8000);
step('fixed: the error goes, the new shader draws', !d.report().errors.some((e) => e.layer === a.layer) && (await infoOf(a.layer)).i?.ok, d.report().errors);

// 6. a new uniform line becomes a slider on the next run (the ◇ tweak line is written from the uniforms)
const withNew = d.codeOf(plasma.L.id).code.replace('uniform float uPunch;', 'uniform vec2 uCenter; // [Shape] 0..1 = 0.3 0.6 Center\nuniform float uPunch;');
await d.updateLayer(a.layer, { code: withNew }, 1.5);
const sl2 = d.sliders(plasma.L.id).sliders.map((x) => x.key);
step('a new `uniform vec2 uCenter; // 0..1 = …` line → two sliders on the next run', sl2.includes('uCenter_x') && sl2.includes('uCenter_y'), sl2);

// 7. the picture follows the audio band uniform (uBass held at 0, then 1)
const BASS = ShaderLib.layerCode({ name: 'Bass probe', image: 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(vec3(uBass), 1.0); }' });
await d.addLayer({ name: '◇ Bass probe', code: BASS }, 1.5);
await until(async () => (await infoOf('◇ Bass probe')).i?.frames > 2, 10000);
await sbx("Object.defineProperty(audio, 'bass', { get: () => 0, configurable: true }); return 1"); await wait(500);
const lo = mean(await probe());
await sbx("Object.defineProperty(audio, 'bass', { get: () => 1, configurable: true }); return 1"); await wait(500);
const hi = mean(await probe());
step('pixels follow uBass (0 → 1)', lo < 20 && hi > 200, { lo: Math.round(lo), hi: Math.round(hi) });

// 8. the workbench, the commands, the director's tool
LabShader.open(); await wait(300);
const bench = document.querySelector('.sh-bench');
step('the workbench opens on the selected ◇ layer (status, resolution)', bench && /✓|✗/.test(bench.querySelector('.sh-status')?.textContent || '') && bench.querySelector('.sh-scale'), bench?.textContent.slice(0, 160));
await smoke({ shot: '/tmp/hearth-labshader-bench.png' });
LabShader.close();
let said = '';
await Commands.tryRun('/shader list feedback', H.claudeAgent().id, null, { say: (x) => { said = x; }, note: (x) => { said = x; } });
step('/shader list feedback', /trails/.test(said), said.slice(0, 120));
const dr = await HubBridge.call('three_do', { cmd: 'shader', op: 'info', layer: a.layer });
step('three_do shader info (the director)', dr.ok && dr.value?.passes?.includes('Image'), dr);
const dc = await HubBridge.call('three_do', { cmd: 'shader', op: 'scale', layer: a.layer, value: 0.5 });
const sc = await infoOf(a.layer);
step('three_do shader scale 0.5 → the layer draws at half resolution', dc.ok && sc.i?.scale === 0.5, { r: dc.ok || dc.error, scale: sc.i?.scale });
const h = await sbx('return window.__labHealth()');
out.health = h;
out.perf = (await sbx('return window.__labShader.info()')).map((x) => ({ id: x.id, passes: x.passes, ms: x.ms }));
const failed = out.steps.filter((x) => !x.ok).map((x) => x.name);
return JSON.stringify({ ok: !failed.length, failed, ...out }, null, 1);
