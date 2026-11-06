// (round 138, sectionmood138) 🎭 Give each section its mood + undo a reply right away (docs/upgrades/sectionmood138.md),
// in one check, on a two-layer scene it makes (Main: Speed, Glow, Noise, with saved looks Calm and Hype; Back: Contrast,
// Brightness) and the fixture song (its analysis: build / drop / build / drop / outro):
//   A1. Sections ▾ › 🎭 Give each section its mood: the default moods from the sections (intro / break calm, build rising,
//       drop punchy, outro fading), looks per section (Hype on the drop, Calm on the outro); with no dials yet it offers
//       "🎛 Suggest dials first", and then each section gets dial keys
//   A2. the ghosts change nothing; ✕ on one item takes only its ghost away
//   A3. Keep all = ONE undo step: one Ctrl/⌘+Z in the Lab puts the scene back exactly
//   A4. kept again: a render frame (the hidden export page) in the drop differs from one early in the build as planned
//   A5. the brief's tempo plan ("build: dark…, chorus: bright…") drives the moods; ✦ Ask the AI shows its cost first
//   B.  through the fake engine: Ctrl/⌘+Z pressed the moment a reply ends undoes THAT reply exactly (while the scene is
//       still settling), never the step before it (the mood keep stays; a second Ctrl/⌘+Z takes that one)
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/sectionmood138.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const ctrlZ = (node) => { const e = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }); node.dispatchEvent(e); return e.defaultPrevented; };

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.LabMatHook?.host(), 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  // Main (top, opaque): the background's red = Glow × 0.45 (no color management: the pixel is the value)
  const MAIN = `import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
const P = tweak({ speed: { value: 1, min: 0, max: 4, label: 'Speed' }, glow: { value: 0.8, min: 0, max: 2, label: 'Glow' }, noise: { value: 0.1, min: 0, max: 1, label: 'Noise' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 5);
const cube = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: '#3050ff' }));
scene.add(cube);
renderer.setAnimationLoop((t) => { scene.background.setRGB(Math.min(1, P.glow * 0.45), 0, 0); cube.rotation.y = t * 0.001 * P.speed; cube.position.x = P.noise * 0.1; renderer.render(scene, camera); });`;
  const BACK = `import * as THREE from 'three';
const P = tweak({ contrast: { value: 1, min: 0.5, max: 2, label: 'Contrast' }, brightness: { value: 0.6, min: 0, max: 1, label: 'Brightness' } });
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const m = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); scene.add(m);
renderer.setAnimationLoop(() => { m.material.color.setScalar(P.brightness); m.scale.setScalar(P.contrast); renderer.render(scene, camera); });`;
  const layers = [ThreeLayers.defaults({ id: 'smoBack', name: 'Back', code: BACK, slot: 0 }), ThreeLayers.defaults({ id: 'smoMain', name: 'Main', code: MAIN, slot: 1 })];
  const sk = SC.create({ name: 'Section moods check', code: BACK, layers, frame: '16:9' });
  SC.open(sk.id);
  const ctl = (id) => hk.ctlOf(id);
  await until(() => SC.currentId() === sk.id && ctl('smoMain')?.controls().some((c) => c.key === 'noise' && c.live === true) && ctl('smoBack')?.controls().some((c) => c.key === 'brightness' && c.live === true), 30000);
  ctl('smoMain').setMany({ glow: 0.3 }); ctl('smoMain').looksApi.save('Calm');
  ctl('smoMain').setMany({ glow: 1.8 }); ctl('smoMain').looksApi.save('Hype');
  ctl('smoMain').setMany({ glow: 0.8 });
  await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4, 60000);
  const host = LabMatHook.host();
  const keysOf = (id) => host.layerById(id)?.keys || {};
  const sig = () => JSON.stringify({ cues: P.timeline().cues, main: keysOf('smoMain'), back: keysOf('smoBack'), dials: (hk.dials()?.list || []).map((d) => [d.name, d.keys]), v: ['smoMain', 'smoBack'].map((id) => ctl(id).controls().map((c) => [c.key, c.value])) });

  // ---------- A1. Sections ▾ › 🎭: the default moods from the sections ----------
  const secBtn = [...document.querySelectorAll('.media-bar button')].find((b) => /^Sections ▾/.test(b.textContent) && b.offsetParent);
  secBtn?.click(); await wait(250);
  const row = [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => /🎭 Give each section its mood/.test(x.textContent));
  step('Sections ▾ has the row "🎭 Give each section its mood…"', Boolean(row));
  row?.click();
  await until(() => window.SectionMood?.plan && document.querySelector('.smo-panel .smo-sec'), 20000);
  let plan = SectionMood.plan;
  const want = { Intro: 'calm', Build: 'rising', Drop: 'punchy', Break: 'calm', Outro: 'fading' };
  step('default moods from the sections: intro / break calm, build rising, drop punchy, outro fading', plan && plan.sections.length >= 4 && plan.sections.every((s) => s.mood === want[s.label] && s.from === 'default') && plan.sections.some((s) => s.label === 'Drop'), plan?.sections.map((s) => `${s.name}:${s.mood}`));
  const lookOf = (p, label) => p.items.find((it) => it.kind === 'look' && p.sections.find((s) => s.i === it.section)?.label === label)?.name;
  step('…a saved look per section: Hype on the drop, Calm on the quiet ending', lookOf(plan, 'Drop') === 'Hype' && lookOf(plan, 'Outro') === 'Calm', plan?.items.filter((x) => x.kind === 'look').map((x) => `${x.cueName}:${x.name}`));
  step('…no dials yet: it offers to suggest them first', plan?.needDials && Boolean(document.querySelector('.smo-panel .smo-suggest')));
  document.querySelector('.smo-panel .smo-suggest')?.click(); await wait(300);
  plan = SectionMood.plan;
  const energy = () => hk.dials()?.list.find((d) => d.name === 'Energy');
  const dItem = (p, label, name) => p.items.find((it) => it.kind === 'dial' && it.dialName === name && p.sections.find((s) => s.i === it.section)?.label === label);
  step('…"Suggest dials first" adds the free dials, and each section gets keys on them (Energy: build 30 → 85 %, drop 100 %, outro 40 → 5 %)', Boolean(energy()) && !plan.needDials && dItem(plan, 'Build', 'Energy')?.keys.length === 2 && dItem(plan, 'Build', 'Energy')?.from === 0.3 && dItem(plan, 'Drop', 'Energy')?.from === 1 && dItem(plan, 'Outro', 'Energy')?.to === 0.05, { dials: hk.dials()?.list.map((d) => d.name), items: plan.items.length });
  await smoke({ shot: '/tmp/sectionmood138-ghosts.png' }).catch(() => {});

  // ---------- A2. ghosts change nothing; ✕ one item ----------
  const before = sig();
  step('the ghosts change nothing (cues, keys, dials, slider values)', energy()?.keys.length === 0 && Object.keys(keysOf('smoMain')).length === 0 && P.timeline().cues.length === 0 && document.querySelectorAll('.smo-panel .smo-item').length === plan.items.length);
  const outroLook = [...document.querySelectorAll('.smo-panel .smo-item.smo-look')].at(-1);
  const xId = outroLook?.dataset.id; const n0 = SectionMood.plan.items.length;
  outroLook?.querySelector('.smo-x')?.click(); await wait(150);
  step('✕ on one item: only its ghost goes, the scene is unchanged', xId && !SectionMood.plan.items.some((x) => x.id === xId) && SectionMood.plan.items.length === n0 - 1 && sig() === before);

  // ---------- A3. Keep all = ONE undo ----------
  const steps0 = LabDirect.steps.length;
  document.querySelector('.smo-panel .smo-keepall')?.click(); await wait(400);
  const glowKeys = () => keysOf('smoMain')['s:glow'] || [];
  const cuesK = P.timeline().cues;
  step('Keep all: the dial keys (baked onto Glow), the cues with their looks are in the scene, the ✕\'d one isn\'t', energy()?.keys.length >= 6 && glowKeys().length >= 6 && glowKeys().every((k) => k.dial === energy().id) && cuesK.some((c) => c.looks?.some((l) => l.name === 'Hype')) && !SectionMood.plan, { energyKeys: energy()?.keys.length, glow: glowKeys().length, cues: cuesK.map((c) => `${c.name}:${(c.looks || []).map((l) => l.name).join('+')}`) });
  step('…as ONE undo step', LabDirect.steps.length === steps0 + 1, LabDirect.steps.slice(-2));
  ctrlZ(hk.pane); await wait(400);
  step('one Ctrl/⌘+Z in the Lab puts the scene back exactly', sig() === before, sig() === before ? 'same' : sig().slice(0, 300));

  // ---------- A4. kept again: a render frame in the drop differs from one early in the build, as planned ----------
  await SectionMood.open({ quiet: true });
  plan = SectionMood.plan;
  SectionMood.keep(null, { quiet: true }); await wait(400);
  {
    const build = plan.sections.find((s) => s.label === 'Build'); const drop = plan.sections.find((s) => s.label === 'Drop');
    const T = [r3(build.start + (build.end - build.start) * 0.2), r3((drop.start + drop.end) / 2)];
    const want4 = T.map((t) => Math.min(1, ThreeLayers.evalKeys(glowKeys(), t, 0.8) * 0.45) * 255);
    try {
      const fr = (await LabExport.probe({ w: 64, h: 36, F: 30, n: T.length, times: (j) => T[j] })).frames;
      const px = async (buf) => { const bm = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, 6, 6).data; let r = 0; for (let i = 0; i < d.length; i += 4) r += d[i]; return r / (d.length / 4); };
      const got = await Promise.all(fr.map(px));
      step('a render frame in the drop is brighter than one early in the build, as planned (Energy 100 % vs ≈40 % on Glow)', got.every((x, j) => Math.abs(x - want4[j]) < 10) && got[1] - got[0] > 40, { t: T, render: got.map(Math.round), want: want4.map(Math.round) });
    } catch (e) { step('renders from the export page', false, String(e?.message || e)); }
  }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  // ---------- A5. the brief's tempo plan drives the moods; ✦ Ask the AI: the cost first ----------
  await SectionMood.open({ quiet: true, tempo: [{ section: 'verse', plan: 'calm and sparse' }, { section: 'build', plan: 'dark, a low rumble' }, { section: 'chorus', plan: 'bright and euphoric' }] });
  plan = SectionMood.plan;
  const bld = plan.sections.find((s) => s.label === 'Build');
  step('the brief\'s tempo plan drives the moods (build: dark, chorus = the drops: bright, from the brief; the outro default)', bld?.mood === 'dark' && bld.from === 'brief' && plan.sections.filter((s) => s.label === 'Drop').every((s) => s.from === 'brief' && s.mood === 'bright') && plan.sections.find((s) => s.label === 'Outro')?.from === 'default' && dItem(plan, 'Build', 'Darkness')?.from === 0.9, plan.sections.map((s) => `${s.name}:${s.mood}:${s.from}`));
  document.querySelector('.smo-panel .smo-ai')?.click();
  const dlg = await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => /tokens/.test(d.textContent)), 5000);
  const dlgText = dlg?.textContent || '';
  [...(dlg?.querySelectorAll('button') || [])].find((b) => /Cancel|No/i.test(b.textContent))?.click();
  if (dlg?.open) dlg.close();
  await wait(300);
  step('✦ Ask the AI to refine shows the cost first; Cancel sends nothing', /tokens in/.test(dlgText) && SectionMood.sent().length === 0, dlgText.replace(/\s+/g, ' ').slice(0, 160));
  SectionMood.close();

  // ---------- B. Ctrl/⌘+Z the moment a reply ends: THAT reply, exactly ----------
  {
    const agent = H.agents().find((a) => a.dock === 'three');
    Native.newChat(agent.id); await wait(600);
    if (SC.currentId() !== sk.id) SC.open(sk.id);
    await until(() => SC.currentId() === sk.id && ctl('smoMain')?.controls().some((c) => c.key === 'noise'), 20000);
    await until(() => P.loaded && P.analysis?.sections?.length && P.timeline().cues.length >= 3, 30000);
    // the step before the reply: the outro made punchy (Keep this section: one Lab step)
    await SectionMood.open({ quiet: true });
    const outro = SectionMood.plan.sections.find((x) => x.label === 'Outro');
    SectionMood.setMood(outro.i, 'punchy');
    const outroE = () => (energy()?.keys || []).find((k) => Math.abs(k.t - outro.start) < 0.01)?.v;
    SectionMood.keep(SectionMood.plan.items.filter((x) => x.section === outro.i).map((x) => x.id), { quiet: true }); SectionMood.close();
    await wait(400);
    const outroKept = outroE();
    const sOf = async () => LabTxn._test.sigOf(await LabTxn.snap(sk.id));
    const sB = await sOf(); const moodKept = sig(); const nSteps = LabDirect.steps.length;
    let at = null;
    let armed = false;
    const onEnd = (ev, chat) => { if (!armed || at) return; at = { chat: chat?.id, settling: LabTxn.settling(), handled: ctrlZ(hk.pane), t: Date.now() }; };
    Native.hooks.finish.push(onEnd);
    const RING = `// ring\nconst P = tweak({ amt: { value: 0.5, min: 0, max: 1, label: 'Amount' } });\nconst c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight; c.style.cssText = 'position:fixed;inset:0';\ndocument.body.append(c); const g = c.getContext('2d');\n(function f() { g.clearRect(0, 0, c.width, c.height); g.strokeStyle = 'rgba(94,180,255,' + P.amt + ')'; g.lineWidth = 6; g.beginPath(); g.arc(c.width / 2, c.height / 2, 60, 0, 7); g.stroke(); requestAnimationFrame(f); })();`;
    armed = true;
    await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify([['three_add_layer', { name: 'Ring', code: RING, wait: 0.3 }], ['three_sliders', { layer: 'Ring', set: { amt: 0.9 } }]])}`);
    await until(() => at, 90000);
    const replied = Native.current(agent.id)?.messages.at(-1)?.labDiff;
    step('the reply changed the scene (a new layer) and Ctrl/⌘+Z was pressed the moment it ended (its step still settling)', Boolean(replied) && at?.handled === true && at.settling === true, { at, replied });
    const back = await until(async () => (await sOf()) === sB, 10000);
    step('…that Ctrl/⌘+Z undid THAT reply exactly (the scene as before it)', Boolean(back) && !host.layers().some((L) => L.name === 'Ring'), { layers: host.layers().map((L) => L.name) });
    await wait(500);
    step('…never the step before it: the punchy outro is still kept, the Lab\'s own steps untouched', outroKept === 1 && sig() === moodKept && LabDirect.steps.length === nSteps && glowKeys().length >= 6, { same: sig() === moodKept, steps: [nSteps, LabDirect.steps.length], glow: glowKeys().length, now: sig().slice(0, 400), was: moodKept.slice(0, 400), last: LabDirect.steps.at(-1), undo: P._keysGeo?.().undoDepth });
    ctrlZ(hk.pane); await wait(500);
    step('a second Ctrl/⌘+Z takes the step before (the outro back to fading)', outroE() === 0.4 && glowKeys().length >= 6, { outro: outroE() });
    Native.hooks.finish.splice(Native.hooks.finish.indexOf(onEnd), 1);
    out.txn = { ...LabTxn.stats };
  }
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
