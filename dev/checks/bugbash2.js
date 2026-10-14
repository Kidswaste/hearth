// (round 35, bugbash2) Regressions for the app bugs the second bug bash fixed (docs/upgrades/bugbash2.md):
// 1. hub.kvSet answers once the file is on disk: a big store read back from the file right after `await kvSet` holds
//    the new value every time (the fake engines read their switches from the file: a send right after a switch could
//    run with the previous step's switches)
// 2. Lab: a look-around view (wheel / pinch / drags) and then a new camera placement (🩺 Fix my scene's "Frame it" /
//    "Point the camera at it", its undo): the view moved on the old camera goes, so the fix shows as made
// 3. ⋯ AI setup › Habits: no "Shrinks long chats by itself" switch (it did nothing since Continue lighter)
// 4. right after Continue lighter, the ◎ missions' estimates and the meter's context use the light start, not the long
//    chat's last size
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/bugbash2.js --shot /tmp/bugbash2.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = { steps: [] };
const step = (what, ok, detail) => { out.steps.push(`${ok ? '✓' : '✖'} ${what}${detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`); return ok; };
const safe = async (what, fn) => { try { await fn(); } catch (err) { step(what, false, String(err?.message || err).slice(0, 300)); } };

// ---------- 1. kvSet is on disk when it answers ----------
await safe('kvSet on disk', async () => {
  const kvDir = `${String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '')}/kv`;
  const pad = 'x'.repeat(300000); // a big store: the thread's write takes a moment
  let bad = 0;
  for (let i = 0; i < 12; i++) {
    await window.hub.kvSet('bugbash2-probe', { i, pad });
    let got = null; try { got = JSON.parse(await window.hub.fs.read(`${kvDir}/bugbash2-probe.json`)).i; } catch { got = 'unreadable'; }
    if (got !== i) bad += 1;
  }
  step('await hub.kvSet(…) = the file holds it (12 big saves read back from the file at once)', bad === 0, { bad });
  await window.hub.kvSet('bugbash2-probe', null);
});

// ---------- 2. the look-around view vs a new camera placement ----------
await safe('view vs camera fix', async () => {
  activate('tool:three'); await wait(300);
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.director, 15000);
  const d = ThreeLab.director;
  try { cmd.customSize(640, 360); cmd.size('custom'); } catch { /* fine */ }
  await wait(800);
  const sbx = async (code) => { for (let i = 0; i < 5; i++) { const r = await d.evalInSketch(code); if (r?.ok) return r.value; await wait(500); } return null; };
  const GS = () => sbx('return window.__labGest.state()');
  const frameEl = () => [...document.querySelectorAll('.three-preview iframe')].find((f) => f.getBoundingClientRect().width > 0);
  const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
  const at = () => { const r = frameEl().getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  await d.newSketch('bugbash2 view', `import * as THREE from 'three';
const r = new THREE.WebGLRenderer({ antialias: false }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.set(0, 0, 5);
const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ color: 0xff2020 })); box.position.set(0, 0, -6); scene.add(box);
r.setAnimationLoop(() => { box.rotation.y += 0.01; r.render(scene, cam); });`, 3);
  await until(async () => (await GS())?.target, 15000); // (the scene drew with its camera: a gesture layer)
  for (let k = 0; k < 3 && !(await GS())?.views?.[0]; k++) { for (let i = 0; i < 4; i++) { await mouse({ type: 'mouseWheel', ...at(), deltaX: 0, deltaY: 120 }); await wait(80); } await wait(300); }
  await until(async () => !(await GS())?.loop, 6000);
  const v0 = (await GS())?.views?.[0];
  step('the wheel zoomed the view out (an offset on the scene camera)', v0 && !v0.idle && v0.s > 1.2, v0 && { s: v0.s });
  // what 🩺 Fix my scene's camera fixes do: the layer's '@camera' placement, through the Lab's restore
  const c = d.capture(); c.layers[0].overrides = { ...(c.layers[0].overrides || {}), '@camera': { p: [0, 0, 1], q: [0, 0, 0, 1], fov: 50 } };
  await d.restore(c, { wait: 0.6 });
  await wait(800);
  const v1 = await GS();
  step('a new camera placement drops the view moved on the old camera (the fix shows as made)', v1 && !v1.views.some((v) => v.id === c.layers[0].id && !v.idle), v1?.views);
  // panned away from the box: black; 🩺 Fix my scene says why and puts the scene's camera back
  const red = async () => {
    const img = new Image(); img.src = await d.shotSmall(96); await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 150 && px[i + 1] < 90 && px[i + 2] < 90) n += 1;
    return n / (px.length / 4);
  };
  // (panned far to the side: the gestures themselves are dev/checks/labgestures.js's; a drag coasts, this is exact)
  await sbx(`return __labGest.goTo(${JSON.stringify(c.layers[0].id)}, { yaw: 0, pitch: 0, s: 1, px: 40, py: 0, pz: 0 })`);
  await until(async () => !(await GS())?.loop, 8000); await wait(300);
  const r0 = await red();
  step('panned away from the box: the frame is black', r0 === 0, { r0, view: (await GS())?.views?.[0] });
  await SceneDoctorHook.doctor();
  await until(() => SceneDoctor.state().findings.length && !SceneDoctor.busy, 20000);
  const blank = SceneDoctor.state().findings.find((f) => f.kind === 'blank');
  step('🩺 Fix my scene: the black frame is the moved view\'s, its fix is "Back to the scene\'s camera" (not the director)', blank?.fix?.kind === 'view' && /moved the view/.test(blank.text), blank && { text: blank.text, fix: blank.fix?.kind });
  if (blank?.fix) {
    await SceneDoctor.fix(blank.id);
    await until(async () => !(await GS())?.loop, 8000); await wait(400);
    const r1 = await red();
    step('one click: the box shows again (the scene\'s own camera)', r1 > 0.01, { r1 });
    await SceneDoctor.undo();
    await until(async () => !(await GS())?.loop, 8000); await wait(400);
    step('↶ Undo: the view you had comes back', (await red()) === 0);
  }
  SceneDoctor.close?.();
});

// ---------- 3. no dead auto-compact switch ----------
await safe('habits', async () => {
  activate(H.claudeAgent().id); await wait(300);
  await Lazy.load('budget').catch(() => {}); await Lazy.load('options');
  Options.open({ agentId: H.claudeAgent().id, show: 'habits' });
  await until(() => /Offer to continue lighter/.test(Options.sheet?.body.textContent || ''), 8000);
  const text = Options.sheet?.body.textContent || '';
  step('⋯ AI setup › Habits has no "Shrinks long chats by itself" (Spending has "Offer to continue lighter")', !/Shrinks long chats|shrinks long chats/.test(text) && /Offer to continue lighter/.test(text));
  Options.hide();
});

// ---------- 5. 🎲 Variations on a scene whose camera is placed ('@camera') ----------
await safe('variations pinned camera', async () => {
  activate('tool:three'); await wait(300);
  await ThreeLab.cmd({ show: true });
  const d = ThreeLab.director;
  await d.newSketch('bugbash2 angles', `import * as THREE from 'three';
const r = new THREE.WebGLRenderer({ antialias: false }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101820');
const P = tweak({ camDistance: [6, 2, 12], camHeight: [1, -3, 4], fov: [50, 20, 90], spin: [0.5, 0, 3], tint: '#ff7040' });
const cam = new THREE.PerspectiveCamera(P.fov, innerWidth / innerHeight, 0.1, 100);
const box = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 64, 8), new THREE.MeshBasicMaterial({ color: P.tint })); scene.add(box);
r.setAnimationLoop((t) => { cam.fov = P.fov; cam.updateProjectionMatrix(); cam.position.set(0, P.camHeight, P.camDistance); cam.lookAt(0, 0, 0); box.rotation.y = t * 0.001 * P.spin; box.material.color.set(P.tint); r.render(scene, cam); });`, 3);
  await wait(2500);
  await Lazy.load('labvar');
  await LabVariations.open({ steer: '' });
  const g0 = LabVariations.state().groups.map((g) => g.id);
  LabVariations.close();
  const c = d.capture(); c.layers[0].overrides = { ...(c.layers[0].overrides || {}), '@camera': { p: [0, 1, 6], q: [0, 0, 0, 1], fov: 50 } };
  await d.restore(c, { wait: 0.6 }); await wait(600);
  await LabVariations.open({ steer: '' });
  const st = LabVariations.state();
  LabVariations.close();
  step('🎲 Variations: with the camera placed ("Point the camera at it", Keep this view) no "Another angle" made of camera sliders that change nothing', g0.includes('camera') && !st.groups.some((g) => g.id === 'camera') && !st.tiles.some((t) => t.lean === 'camera'), { before: g0, after: st.groups.map((g) => g.id), leans: st.tiles.map((t) => t.lean) });
});

// ---------- 4. after Continue lighter: estimates and the meter ----------
await safe('lighter sizes', async () => {
  const C = H.claudeAgent();
  activate(C.id); await until(() => Native.hasView(C.id));
  await Lazy.load('budget'); await Lazy.load('missions').catch(() => {});
  Native.newChat(C.id);
  const pad = (i) => { let t = `Step ${i}: the tunnel glow. `; while (t.length < 9000) t += `tunnel layer ${i} glow keeps the ember palette steady. `; return t; };
  for (let i = 0; i < 5; i++) { await Native.send(C.id, pad(i)); await wait(120); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(150); }
  const before = SwarmLean.ctxOf(C.id);
  await Autocompact.run(C.id);
  const chat = Native.current(C.id);
  const after = chat.compact?.lighter?.after;
  await wait(300);
  const est = SwarmLean.ctxOf(C.id);
  step('◎ estimates right after Continue lighter use the light start', after && est === after && est < before, { before, after, est });
  const m = Meter._test.readings?.();
  const said = m?.ctx?.[1] || '';
  const n = Number((/sends about ([\d,.\s  ]+) tokens/.exec(said) || [])[1]?.replace(/\D/g, '')) || 0;
  step('the meter\'s context says the light size too', n && Math.abs(n - after) < 50, { said: said.slice(0, 90), after });
});

out.ok = out.steps.every((s) => s.startsWith('✓'));
return JSON.stringify(out, null, 1);
