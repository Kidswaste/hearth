// (round 135, mooddial135) 🎛 Mood dials (docs/upgrades/mooddial135.md), in one check, on a two-layer scene it makes:
//   1. the Sliders panel's ⋯ › 🎛 Dials… opens the card; Suggest (free) guesses dials from the slider names: Energy
//      moves Speed and Glow up, Darkness moves Brightness down and Contrast up
//   2. Keep Energy; turning it moves every mapped slider on both layers live, with no undo step while it moves
//   3. the release is ONE undo step: one Ctrl/⌘+Z in the Lab puts every slider (and the dial) back exactly
//   4. Learn: a new dial, the sliders set at its 0 end, then at its 100% end: both ends recorded as its maps
//   5. ◆ keys on Energy at two times: a render frame (the hidden export page) plays the keyed dial (Glow at 0, ½, 1)
//   6. ✦ Suggest dials through the fake engine: the cost line first and nothing sent before the click; ONE lean helper
//      pass; Keep / ✕ per dial (an unknown slider dropped, a value past its max clamped); the dials saved with the scene
//   7. the AI turns a dial: three_do sliders { dial, value } through the fake engine, one undo step of its reply
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/mooddial135.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const r3 = (x) => Math.round(Number(x) * 1000) / 1000;

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  // Main (top, opaque): the background's red = Glow × 0.45 (no color management: the pixel is the value)
  const MAIN = `import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
const P = tweak({ speed: { value: 1, min: 0, max: 4, label: 'Speed' }, glow: { value: 0.5, min: 0, max: 2, label: 'Glow' }, noise: { value: 0.1, min: 0, max: 1, label: 'Noise' } });
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
  const layers = [ThreeLayers.defaults({ id: 'mdBack', name: 'Back', code: BACK, slot: 0 }), ThreeLayers.defaults({ id: 'mdMain', name: 'Main', code: MAIN, slot: 1 })];
  const sk = SC.create({ name: 'Mood dials check', code: BACK, layers, frame: '16:9' });
  SC.open(sk.id);
  const ctl = (id) => hk.ctlOf(id);
  await until(() => SC.currentId() === sk.id && ctl('mdMain')?.controls().some((c) => c.key === 'noise' && c.live === true) && ctl('mdBack')?.controls().some((c) => c.key === 'brightness' && c.live === true), 30000);
  await cmd.loadSong(SONG);
  await until(() => hk.player.loaded && hk.player.duration > 10, 60000);
  const val = (id, key) => ctl(id).controls().find((c) => c.key === key)?.value;
  const all = () => ({ speed: val('mdMain', 'speed'), glow: val('mdMain', 'glow'), noise: val('mdMain', 'noise'), contrast: val('mdBack', 'contrast'), brightness: val('mdBack', 'brightness') });
  const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
  const knobOf = (name) => [...document.querySelectorAll('.md-pop .md-row')].find((r) => r.querySelector('.md-name')?.textContent === name)?.querySelector('.md-knob');
  const setKnob = async (name, v, release = true) => { const k = knobOf(name); if (!k) return false; k.value = v; fire(k, 'input'); await wait(60); if (release) { fire(k, 'change'); await wait(120); } return true; };

  // ---------- 1. Sliders ⋯ › 🎛 Dials…; Suggest (free) ----------
  {
    const more = [...document.querySelectorAll('.tw-more')].find((b) => b.offsetParent);
    more?.click(); await wait(250);
    const mi = [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => /🎛 Dials…/.test(x.textContent));
    step('the Sliders panel\'s ⋯ has a "🎛 Dials…" row', Boolean(mi));
    mi?.click();
  }
  const pop = await until(() => document.querySelector('.md-pop'), 15000);
  step('the small card opens (its group loaded on first use), nothing on the toolbar', Boolean(pop) && typeof LabDials !== 'undefined' && pop.offsetWidth <= 320, { w: pop?.offsetWidth });
  pop.querySelector('.md-local')?.click(); await wait(200);
  const props = LabDials.state().proposals;
  const mapOf = (p, key) => p?.maps.find((m) => m.key === key);
  const en = props.find((p) => p.name === 'Energy'); const dk = props.find((p) => p.name === 'Darkness');
  step('Suggest (free): Energy moves Speed and Glow up', mapOf(en, 'speed')?.b > mapOf(en, 'speed')?.a && mapOf(en, 'glow')?.b > mapOf(en, 'glow')?.a && !mapOf(en, 'contrast'), en);
  step('…Darkness moves Brightness down and Contrast up (on the other layer)', mapOf(dk, 'brightness')?.b < mapOf(dk, 'brightness')?.a && mapOf(dk, 'contrast')?.b > mapOf(dk, 'contrast')?.a, dk);

  // ---------- 2. Keep Energy; turning it moves them all live ----------
  {
    const row = [...pop.querySelectorAll('.md-sug')].find((r) => r.querySelector('b')?.textContent === 'Energy');
    row?.querySelector('.md-keep')?.click(); await wait(200);
  }
  const energy = () => LabDials.state().dials.find((d) => d.name === 'Energy');
  step('Keep: Energy is on the scene, at the middle (the scene as it was)', Boolean(energy()) && Math.abs(energy().value - 0.5) < 0.02, energy() && { value: energy().value, maps: energy().maps.length });
  const before = all();
  const steps0 = LabDirect.steps.length;
  await setKnob('Energy', 0.9, false);
  const live = all();
  const want = Object.fromEntries(energy().maps.map((m) => [m.key, DialsCore.valueOf(m, 0.9)]));
  const layersMoved = new Set(energy().maps.map((m) => m.layer));
  step('turning Energy moves every slider it maps, on both layers, live', Object.keys(want).every((k) => r3(live[k]) === r3(want[k]) && live[k] !== before[k]) && Object.keys(want).length >= 3 && layersMoved.size === 2, { before, live, want });
  step('…with no undo step while it moves', LabDirect.steps.length === steps0, LabDirect.steps.length - steps0);

  // ---------- 3. a release is ONE undo step ----------
  fire(knobOf('Energy'), 'change'); await wait(150);
  step('the release is one undo step', LabDirect.steps.length === steps0 + 1, LabDirect.steps.slice(-2));
  hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(250);
  const back = all();
  step('one Ctrl/⌘+Z in the Lab puts every slider back exactly, and the dial', JSON.stringify(back) === JSON.stringify(before) && Math.abs(energy().value - 0.5) < 0.02, { before, back, dial: energy().value });

  // ---------- 4. Learn: both ends ----------
  {
    const n0 = LabDials.state().dials.length;
    pop.querySelector('.md-new')?.click(); await wait(200);
    const st = LabDials.state(); const nd = st.dials[n0];
    step('＋ a new dial starts Learn', Boolean(nd) && st.learning?.id === nd.id, st.learning);
    await setKnob(nd.name, 0);
    ctl('mdMain').setByKey('noise', 0.05, { release: true }); ctl('mdBack').setByKey('contrast', 0.6, { release: true });
    await wait(100);
    pop.querySelector('.md-thisend')?.click(); await wait(150);
    step('…"✓ This end" records the 0 end, then asks for the other', LabDials.state().learning?.first === true);
    await setKnob(nd.name, 1);
    ctl('mdMain').setByKey('noise', 0.8, { release: true }); ctl('mdBack').setByKey('contrast', 1.7, { release: true });
    await wait(100);
    pop.querySelector('.md-thisend')?.click(); await wait(200);
    const d = LabDials.state().dials.find((x) => x.id === nd.id);
    const n = d?.maps.find((m) => m.key === 'noise'); const c = d?.maps.find((m) => m.key === 'contrast');
    step('Learn records both ends: Noise 0.05 → 0.8, Contrast 0.6 → 1.7, nothing else', d?.maps.length === 2 && n?.a === 0.05 && n?.b === 0.8 && c?.a === 0.6 && c?.b === 1.7 && !LabDials.state().learning, d?.maps);
    await setKnob(nd.name, 0); await wait(100);
    step('…and the learned dial drives them (at 0: both back at their 0 ends)', val('mdMain', 'noise') === 0.05 && val('mdBack', 'contrast') === 0.6, all());
  }

  // ---------- 5. ◆ keys on Energy; a render frame plays them ----------
  {
    const id = energy().id;
    const seekTo = async (t) => { for (let i = 0; i < 6 && Math.abs(hk.player.time - t) > 0.05; i++) { cmd.seek(t); await wait(300); } };
    await seekTo(2); await setKnob('Energy', 0);
    [...pop.querySelectorAll('.md-row')].find((r) => r.dataset.id === id)?.querySelector('.md-kf')?.click(); await wait(200);
    await seekTo(6); await setKnob('Energy', 1); await wait(200);
    const e = energy();
    const g = e.maps.find((m) => m.key === 'glow');
    const sk2 = SC.get(sk.id); const L = sk2.layers.find((x) => x.id === 'mdMain');
    const lane = L.keys?.['s:glow'] || [];
    step('◆ then a turn at another time: two keys on the dial, baked onto Glow\'s own keys (tagged)', e.keys.length === 2 && e.keys[0].v === 0 && e.keys[1].v === 1 && lane.length >= 2 && lane.every((k) => k.dial === id), { keys: e.keys, glowKeys: lane.length });
    const T = [1, 3, 4, 8];
    const wantG = T.map((t) => DialsCore.valueOf(g, DialsCore.dialAt(e.keys, t)));
    try {
      const fr = (await LabExport.probe({ w: 64, h: 36, F: 30, n: T.length, times: (j) => T[j] })).frames;
      const px = async (buf) => { const bm = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bm.width, bm.height); const gg = cv.getContext('2d'); gg.drawImage(bm, 0, 0); const d = gg.getImageData(0, 0, 6, 6).data; let r = 0; for (let i = 0; i < d.length; i += 4) r += d[i]; return r / (d.length / 4); };
      const got = await Promise.all(fr.map(px));
      const exp = wantG.map((x) => Math.min(1, x * 0.45) * 255);
      step('a render frame plays the keyed dial (Glow at 0, a quarter, ½ and 1 of the way)', got.every((x, j) => Math.abs(x - exp[j]) < 8) && exp[3] - exp[0] > 100, { t: T, glow: wantG.map(r3), render: got.map(Math.round), want: exp.map(Math.round) });
    } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
  }

  // ---------- 6. ✦ Suggest dials: cost first, one pass, Keep / ✕ ----------
  {
    pop.querySelector('.md-aibtn')?.click(); await wait(300);
    const line = pop.querySelector('.md-cost')?.textContent || '';
    await wait(900);
    step('✦ Suggest dials: the cost first (tokens · Claude), nothing sent before the click', /tokens in/.test(line) && /Claude/.test(line) && LabDials.sent().length === 0, line);
    pop.querySelector('.md-send')?.click();
    const got = await until(() => (LabDials.state().ai.phase === 'idle' && LabDials.sent().length ? LabDials.state() : null), 60000);
    const ps = got?.proposals || [];
    const sent = LabDials.sent();
    const dark = ps.find((p) => p.name === 'Darkness');
    step('ONE lean helper pass that read the sliders; 3 dials back, the unknown slider dropped, past-max clamped', sent.length === 1 && sent[0].options.lean && sent[0].options.helper && /\[Main\] glow "Glow"/.test(sent[0].text) && ps.length === 3 && got.ai.dropped >= 1 && dark?.maps.every((m) => m.b <= 2), { n: ps.length, names: ps.map((p) => p.name), dropped: got?.ai.dropped, dark, err: got?.ai.error });
    const n0 = LabDials.state().dials.length;
    [...pop.querySelectorAll('.md-sug')].find((r) => r.querySelector('b')?.textContent === 'Chaos')?.querySelector('.md-drop')?.click(); await wait(150);
    [...pop.querySelectorAll('.md-sug')].find((r) => r.querySelector('b')?.textContent === 'Darkness')?.querySelector('.md-keep')?.click(); await wait(150);
    const st = LabDials.state();
    step('…✕ drops one, Keep adds one (4 dials at most)', st.proposals.length === 1 && st.dials.length === Math.min(4, n0 + 1) && !st.proposals.some((p) => p.name === 'Chaos'), { left: st.proposals.map((p) => p.name), dials: st.dials.map((d) => d.name) });
    const saved = await until(async () => { const list = await window.hub.kvGet('three-sketches', []); const s = (Array.isArray(list) ? list : []).find((x) => x.id === sk.id); return s?.dials?.list?.length === st.dials.length ? s.dials : null; }, 8000);
    step('the dials are stored with the scene (kv three-sketches)', Boolean(saved), saved && saved.list.map((d) => `${d.name}:${d.maps.length}${d.keys.length ? `:${d.keys.length}k` : ''}`));
  }
  // ---------- 7. the AI turns a dial: three_do sliders { dial, value } (fake engine, real MCP route), one undo of its reply ----------
  {
    const agent = H.agents().find((a) => a.dock === 'three');
    Native.newChat(agent.id); await wait(600);
    const chatId = H.activeChat[agent.id];
    ChatScenes.link(chatId, sk.id, { rename: false });
    if (SC.currentId() !== sk.id) SC.open(sk.id);
    await until(() => SC.currentId() === sk.id && ctl('mdMain')?.controls().some((c) => c.key === 'noise'), 20000);
    const b7 = all();
    await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'sliders', dial: 'Darkness', value: 1 }]])}`);
    await until(() => !Native.isBusy(chatId), 90000); await wait(400);
    const a7 = all();
    step('the AI\'s three_do sliders { dial: "Darkness", value: 1 } turns the learned dial (Noise and Contrast to their 100% ends)', a7.noise === 0.8 && a7.contrast === 1.7, { b7, a7, reply: String(Native.current(agent.id)?.messages.at(-1)?.text || '').slice(0, 200) });
    await Commands.tryRun('/undo-edit', agent.id, null, { say: () => {}, note: () => {}, error: () => {} });
    await until(() => JSON.stringify(all()) === JSON.stringify(b7), 8000);
    step('…as one undo step of its reply (/undo-edit)', JSON.stringify(all()) === JSON.stringify(b7), all());
  }
  await LabDials.open(); // (left open for the check's picture)
  await until(() => document.querySelectorAll('.md-pop .md-lane .md-key').length === 2, 8000);
  step('the card shows the keyed dial\'s lane (its keys over the song)', document.querySelectorAll('.md-pop .md-lane .md-key').length === 2, { lanes: document.querySelectorAll('.md-pop .md-lane').length, loaded: hk.player.loaded, dur: hk.player.duration, keys: LabDials.state().dials.map((d) => d.keys.length) });
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
