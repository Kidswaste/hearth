// 🩺 Fix my scene (round 34, scenedoctor) on deliberately broken Lab scenes: a black frame (the subject behind the
// camera), a layer that throws, a scene far too slow (thousands of meshes, a busy frame) that also reacts to music with
// none playing. It checks the ways in (✦ More first row, the toolbar's ⋯, nothing loaded before use), the calm hint
// showing by itself for the blank frame and the error (once per problem), detection, each fix (camera framing, hide
// the layer, halve the count slider) and that each one is ONE undo step, and "Ask the director" filling the director's
// box without sending.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/scenedoctor.js --shot /tmp/scenedoctor.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof SceneDoctorHook !== 'undefined', 15000);
SceneDoctorHook.forget();
const d = ThreeLab.director;
const cmd = await ThreeLab.cmd({ show: true });

// ---------- ways in ----------
const more = LabEasy.previewItem().items();
step('✦ More › 🩺 Fix my scene is the first row (and the Lab audit finds it)', /Fix my scene/.test(more[0]?.label) && LabEasy.placed().has('fix-scene'), more.map((x) => x.label));
step('the toolbar\'s ⋯ has it too', LabEasy.toolbarItems().some((r) => /Fix my scene/.test(r[0])));
step('the doctor itself loads on first use only (lazy group "scenedoctor")', typeof SceneDoctor === 'undefined' && typeof DoctorCore === 'undefined');

// what the preview shows: the share of red pixels in a small shot
async function share(test = (r, g, b) => r > 150 && g < 90 && b < 90) {
  const url = await d.shotSmall(96);
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < px.length; i += 4) if (test(px[i], px[i + 1], px[i + 2])) n += 1;
  return Math.round((n / (px.length / 4)) * 1000) / 1000;
}
const BASE = (body) => `import * as THREE from 'three';
const r = new THREE.WebGLRenderer({ antialias: false }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.set(0, 0, 5);
${body}`;
const findings = () => SceneDoctor.state().findings;
const card = () => SceneDoctor.card;

// ---------- 1. a black frame: the red box sits behind the camera ----------
await d.newSketch('doctor black', BASE(`const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
box.position.set(0, 0, 14); box.name = 'Red box'; scene.add(box);
r.setAnimationLoop(() => { box.rotation.y += 0.01; r.render(scene, cam); });`), 3);
const red0 = await share();
const hinted = await until(() => /\|blank$/.test(SceneDoctorHook.last.hint?.key || '') && document.querySelector('.sd-hint'), 15000);
step('the calm hint shows by itself a few seconds after the run: "The frame is all black." + Fix my scene', hinted && red0 === 0, { hint: SceneDoctorHook.last.hint, red0 });
document.querySelector('.sd-hint .sd-hint-go')?.click();
await until(() => typeof SceneDoctor !== 'undefined' && card()?.isConnected && findings().length, 20000);
const blank = findings().find((f) => f.kind === 'blank');
step('its button opens the card: the black frame found, with why, and a camera fix', blank && blank.fix?.kind === 'frame' && /behind|outside/.test(blank.text) && !document.querySelector('.sd-hint'), findings());
const t0 = performance.now();
card().querySelector('.sd-row[data-id="blank"] .sd-fix')?.click();
await until(() => SceneDoctor.state().fixed.includes('blank'), 10000);
await wait(900);
const red1 = await share();
const ov1 = d.capture().layers[0].overrides?.['@camera'];
step('one click: the camera points at the box (its placement kept with the layer), red on screen', red1 > 0.02 && Array.isArray(ov1?.p), { red1, ov1, ms: Math.round(performance.now() - t0) });
await until(() => !SceneDoctor.busy, 8000); await wait(1700);
step('checked again: the frame is no longer blank, the row shows ✓ fixed with its own ↶', !findings().some((f) => f.kind === 'blank') && card().querySelector('.sd-row.fixed .sd-done'), findings());
card().querySelector('.sd-undo')?.click();
await until(() => !d.capture().layers[0].overrides?.['@camera'], 8000);
await wait(900);
const red2 = await share();
step('↶ Undo (one step): the camera placement is gone, black again', red2 === 0 && !d.capture().layers[0].overrides?.['@camera'] && SceneDoctor.state().undos.length === 0, { red2 });
const at = SceneDoctorHook.last.hint?.at;
cmd.run(); await wait(7500);
step('once per problem: running the same black scene again shows no second hint', SceneDoctorHook.last.hint?.at === at && !document.querySelector('.sd-hint'));
SceneDoctor.close();

// ---------- 2. a layer that throws ----------
await d.newSketch('doctor throws', BASE(`const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x3060ff })); scene.add(box);
r.setAnimationLoop(() => { box.rotation.x += 0.01; r.render(scene, cam); });`), 3);
await d.addLayer({ name: 'Sparks', code: 'let o; requestAnimationFrame(function f() { o.scenedoctorGlow = 1; requestAnimationFrame(f); });' }, 2.5);
const gotErr = await until(() => d.report().errors.some((e) => e.layer === 'Sparks'), 10000);
const errHint = await until(() => /\|err\|/.test(SceneDoctorHook.last.hint?.key || '') && document.querySelector('.sd-hint'), 6000);
step('the Lab caught the layer\'s error and the hint says so by itself', gotErr && errHint, { errors: d.report().errors, hint: SceneDoctorHook.last.hint });
await SceneDoctor.look();
const sparks = d.layers().layers.find((L) => L.name === 'Sparks');
const errF = findings().find((f) => f.kind === 'error');
step('detected: "The layer "Sparks" stopped with an error…" with Hide this layer', errF && /Sparks/.test(errF.text) && /undefined/.test(errF.text) && errF.fix?.kind === 'hide', findings());
await SceneDoctor.fix(errF.id);
const hid = d.layers().layers.find((L) => L.id === sparks.id)?.visible === false;
await wait(1800);
step('one click hides it (the other layer stays), and the check no longer lists the error', hid && d.layers().layers.find((L) => L.name !== 'Sparks').visible && !findings().some((f) => f.kind === 'error'), findings());
await SceneDoctor.undo();
step('↶ Undo (one step): the layer is back', d.layers().layers.find((L) => L.id === sparks.id)?.visible === true);
await wait(1500);
const errF2 = findings().find((f) => f.kind === 'error') || errF;
const text = await SceneDoctor.ask(errF2.id);
await wait(600);
const box = [...document.querySelectorAll('.composer textarea')].find((t) => t.value === text);
step('✦ Ask the director fills the director\'s box with one short request, not sent', box && /Sparks/.test(text) && /scenedoctorGlow/.test(text) && text.length < 220 && DoctorCore.tokens(text) < 60, text);
if (box) { box.value = ''; box.dispatchEvent(new Event('input')); }

// ---------- 3. far too slow, and reacting to music with none playing ----------
await d.newSketch('doctor slow', BASE(`const P = tweak({ count: [3000, 100, 6000] });
const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05); const mat = new THREE.MeshBasicMaterial({ color: 0x40ff80 });
for (let i = 0; i < P.count; i++) { const m = new THREE.Mesh(geo, mat); m.position.set(Math.sin(i) * 2, Math.cos(i * 1.3) * 1.2, Math.sin(i * 0.7)); scene.add(m); }
r.setAnimationLoop(() => { const t = Date.now(); while (Date.now() - t < 90) {} scene.rotation.y += 0.01 + audio.bass * 0.1; r.render(scene, cam); });`), 3);
const slowLayer = d.layers().layers[0].id;
const fpsLow = await until(() => { const p = cmd.perf(); return p.fps > 0 && p.fps < 20; }, 15000);
await SceneDoctor.look();
const slow = findings().find((f) => f.kind === 'slow');
const deaf = findings().find((f) => f.kind === 'noaudio');
step('detected: slow, with the cause in plain words ("3,000 separate objects"), and a count slider to halve', fpsLow && slow && /3,0\d\d separate objects/.test(slow.text) && slow.fix?.kind === 'slider', { perf: cmd.perf().fps, findings: findings() });
step('detected: it reacts to music but nothing plays → listen to the computer\'s sound', deaf?.fix?.kind === 'live', deaf);
await SceneDoctor.fix(slow.id);
const half = d.sliders(slowLayer).sliders.find((s) => s.key === 'count')?.value;
await SceneDoctor.undo();
const back = d.sliders(slowLayer).sliders.find((s) => s.key === 'count')?.value;
step('one click halves "count" (3000 → 1500); ↶ Undo puts 3000 back in one step', half === 1500 && back === 3000, { half, back });
const said = await Commands.get('fix-scene').run('check', {});
step('/fix-scene check (for the AI) lists the same in plain words', /slow/i.test(said) && /music/.test(said), said);

// ---------- leave the card on the broken scene for the picture ----------
const keep = ThreeLab.scenes.all().find((x) => x.name === 'doctor throws');
if (keep) { ThreeLab.director.openSketch(keep.id); await wait(3500); await SceneDoctor.look(); await wait(400); }
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
