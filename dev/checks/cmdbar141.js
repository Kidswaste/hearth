// (round 141, cmdbar141) ⌁ plain words in the command bar over the Lab (docs/upgrades/cmdbar141.md), in one check, on a
// three-layer scene it makes (Back, Glow ring, Sparks) and the fixture song, by keys where it can:
//   1. Ctrl/⌘+; over the Lab opens the bar on the preview, its Lab words loaded, an example as ghost text
//   2. "glow 0.8": the preview line says what Enter will do and nothing changes before Enter; Enter sets the slider;
//      ONE Ctrl/⌘+Z puts it back
//   3. "glow 0.8 on the drop": a key at the Drop cue (one Ctrl/⌘+Z takes it away)
//   4. "add bloom": a 🧩 block above the selected layer (one Ctrl/⌘+Z)
//   5. "hide sparks", "solo ring", "solo off"
//   6. "energy up" turns the 🎛 Energy dial; "follow bass" makes the slider named last follow the bass
//   7. "jump to drop" moves the playhead to the cue
//   8. ↑ / ↓ cycle what was typed before
//   9. words it doesn't know: "✦ Ask the director", nothing sent (Enter included) until that click; then ONE message
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/cmdbar141.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && ThreeLab.groupsHost, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const sent = [];
  const send0 = Native.send.bind(Native); Native.send = (...a) => { sent.push({ id: a[0], text: String(a[1] || '') }); return send0(...a); };
  const code = (sliders) => `import * as THREE from 'three';
const P = tweak({ ${sliders} });
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2), new THREE.MeshBasicMaterial({ color: '#ff8040' })); scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.z = t * 0.001 * (P.speed ?? 1); m.material.color.setScalar(Math.min(1, (P.glow ?? 0.5) + (P.amount ?? 0) + (P.brightness ?? 0) * 0.1)); renderer.render(scene, camera); });`;
  const layers = [
    ThreeLayers.defaults({ id: 'sayBack', name: 'Back', code: code("brightness: { value: 0.6, min: 0, max: 1, label: 'Brightness' }"), slot: 0 }),
    ThreeLayers.defaults({ id: 'sayRing', name: 'Glow ring', code: code("glow: { value: 0.4, min: 0, max: 1, label: 'Glow' }, speed: { value: 1, min: 0, max: 4, label: 'Speed' }"), slot: 1 }),
    ThreeLayers.defaults({ id: 'saySparks', name: 'Sparks', code: code("amount: { value: 0.5, min: 0, max: 1, label: 'Amount' }"), slot: 2 }),
  ];
  const sk = SC.create({ name: 'Command bar check', code: layers[0].code, layers, frame: '16:9' });
  SC.open(sk.id);
  const ctl = (id) => hk.ctlOf(id);
  const val = (id, key) => ctl(id)?.controls().find((c) => c.key === key)?.value;
  await until(() => SC.currentId() === sk.id && val('sayRing', 'glow') === 0.4 && val('saySparks', 'amount') === 0.5 && val('sayBack', 'brightness') === 0.6, 30000);
  ThreeLab.groupsHost.select('sayRing');
  await cmd.loadSong(SONG);
  await until(() => hk.player.loaded && hk.player.analysis?.sections?.length, 60000);
  cmd.sections(); await wait(300);
  let drop = hk.player.cues.find((c) => /^drop/i.test(c.name));
  if (!drop) { hk.player.addCue(20, 'Drop'); await wait(200); drop = hk.player.cues.find((c) => /^drop/i.test(c.name)); }
  await Lazy.load('dials');
  await until(() => ctl('sayRing')?.controls().some((c) => c.key === 'glow' && c.live === true) && ctl('sayRing')?.controls().some((c) => c.key === 'speed' && c.live === true), 20000);
  await LabDials.open(); await wait(200);
  LabDials.suggestHere();
  const props0 = LabDials.state().proposals.map((p) => p.name);
  LabDials.keep(LabDials.state().proposals.findIndex((p) => p.name === 'Energy'));
  await wait(200); LabDials.close(); await wait(100);
  const names = () => hk.layers().map((L) => L.name);
  const zKey = async () => { hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })); await wait(1200); };
  const all = () => JSON.stringify({ g: val('sayRing', 'glow'), s: val('sayRing', 'speed'), a: val('saySparks', 'amount'), b: val('sayBack', 'brightness') });

  // ---------- 1. the key ----------
  document.body.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: ';', code: 'Semicolon', ctrlKey: true, bubbles: true, cancelable: true }));
  const input = await until(() => { const i = document.querySelector('.cmdbar-input'); return i && i.offsetParent && typeof LabSay !== 'undefined' && /^Try “/.test(i.placeholder) ? i : null; }, 20000);
  const barR = document.querySelector('.cmdbar')?.getBoundingClientRect(); const hostR = hk.host.getBoundingClientRect();
  step('Ctrl/⌘+; over the Lab opens the bar on the preview, its Lab words loaded, an example as ghost text', Boolean(input) && barR.left >= hostR.left - 1 && barR.right <= hostR.right + 1 && barR.top >= hostR.top - 1 && barR.top < hostR.top + 60, { ph: input?.placeholder, bar: [Math.round(barR?.left), Math.round(barR?.top), Math.round(barR?.width)], host: [Math.round(hostR.left), Math.round(hostR.top), Math.round(hostR.width)] });
  const type = async (t) => { input.focus(); input.value = t; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); return document.querySelector('.cmdbar-say:not([hidden]) .say-line')?.textContent || ''; };
  const enter = async () => { const n = LabSay.state().stats.runs; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await until(() => LabSay.state().stats.runs > n, 8000); await wait(400); return document.querySelector('.cmdbar-out')?.textContent || ''; };
  const say = async (t) => { await type(t); return enter(); };

  // ---------- 2. "glow 0.8": the line first, then one undo ----------
  const b2 = all();
  const line = await type('glow 0.8');
  await wait(600);
  step('the preview line says what Enter will do, and nothing changes before Enter', /Glow ring · Glow 0\.4 → 0\.8/.test(line) && /Enter/.test(line) && all() === b2, line);
  await enter();
  await until(() => val('sayRing', 'glow') === 0.8, 5000);
  step('Enter sets the slider on the selected layer', val('sayRing', 'glow') === 0.8 && val('saySparks', 'amount') === 0.5, all());
  await zKey(); await until(() => all() === b2, 5000);
  step('…and ONE Ctrl/⌘+Z puts it back', all() === b2, all());

  // ---------- 3. a key at the drop ----------
  const l3 = await type('glow 0.8 on the drop');
  await enter();
  const keys = await until(() => { const k = hk.keysOf('sayRing', 's:glow'); return k.some((x) => Math.abs(x.t - drop.time) < 0.05 && x.v === 0.8) ? k : null; }, 6000);
  step('"glow 0.8 on the drop" makes a key at the Drop cue (the line named it)', Boolean(keys) && new RegExp(`at ${drop.name}`).test(l3), { line: l3, drop, keys: hk.keysOf('sayRing', 's:glow') });
  await zKey(); await until(() => !hk.keysOf('sayRing', 's:glow').length, 5000);
  step('…one Ctrl/⌘+Z takes the key away', !hk.keysOf('sayRing', 's:glow').length, hk.keysOf('sayRing', 's:glow'));

  // ---------- 4. a block ----------
  const n4 = names().length;
  const l4 = await type('add bloom');
  await enter();
  await until(() => names().length === n4 + 1, 20000);
  step('"add bloom" adds the 🧩 Bloom block', /Add 🧩 Bloom/.test(l4) && names().some((n) => /Bloom/.test(n)) && names().length === n4 + 1, { line: l4, layers: names() });
  await zKey(); await until(() => names().length === n4, 6000);
  step('…one Ctrl/⌘+Z takes it away', names().length === n4, names());

  // ---------- 5. hide, solo ----------
  await say('hide sparks');
  const hid = await until(() => ThreeLab.groupsHost.layers().find((L) => L.id === 'saySparks')?.visible === false, 5000);
  step('"hide sparks" hides Sparks', Boolean(hid));
  await say('solo ring');
  const so = await until(() => LayerGroups.soloId(ThreeLab.groupsHost.layers()) === 'sayRing', 5000);
  step('"solo ring" solos Glow ring', Boolean(so), LayerGroups.soloId(ThreeLab.groupsHost.layers()));
  await say('solo off'); await say('show sparks');
  step('…"solo off" and "show sparks" bring them back', await until(() => !LayerGroups.soloId(ThreeLab.groupsHost.layers()) && ThreeLab.groupsHost.layers().every((L) => L.visible !== false), 5000));

  // ---------- 6. a dial; follow the music ----------
  const e0 = LabDials.state().dials.find((d) => d.name === 'Energy')?.value;
  const l6 = await type('energy up');
  await enter();
  const e1 = await until(() => { const v = LabDials.state().dials.find((d) => d.name === 'Energy')?.value; return v > e0 + 0.1 ? v : null; }, 5000);
  step('"energy up" turns the 🎛 Energy dial', /🎛 Energy/.test(l6) && Boolean(e1), { line: l6, e0, e1, props0, live: ctl('sayRing').controls().map((c) => `${c.key}:${c.live}`), dials: LabDials.state().dials.map((d) => d.name), ctx: LabSay.ctx().dials });
  await say('glow 0.6');
  const l6b = await type('follow bass');
  await enter();
  const link = await until(() => ctl('sayRing').controls().find((c) => c.key === 'glow')?.followsMusic, 5000);
  step('"follow bass" makes the slider named last follow the bass', /Glow follows the bass/.test(l6b) && link?.band === 'bass', { line: l6b, link });

  // ---------- 7. the playhead ----------
  cmd.seek(1); await wait(300);
  const l7 = await type('jump to drop');
  await enter();
  const at = await until(() => (Math.abs(hk.player.time - drop.time) < 0.2 ? hk.player.time : null), 5000);
  step('"jump to drop" moves the playhead to the Drop cue', /Playhead → /.test(l7) && at != null, { line: l7, t: hk.player.time, drop: drop.time });

  // ---------- 8. history ----------
  input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
  const up = () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); return input.value; };
  const h1 = up(); const h2 = up();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  const h3 = input.value;
  step('↑ / ↓ cycle what was typed before', h1 === 'jump to drop' && h2 === 'follow bass' && h3 === 'jump to drop', { h1, h2, h3 });

  // ---------- 9. words it doesn't know ----------
  const ODD = 'make it feel like a rainy night in tokyo';
  const l9 = await type(ODD);
  const ask = document.querySelector('.cmdbar-say .say-ask');
  await wait(800);
  step('unknown words offer "✦ Ask the director", nothing sent', Boolean(ask) && /✦ Ask the director: make it feel/.test(ask.textContent) && sent.length === 0 && !LabSay.state().sent.length, { line: l9 });
  // Enter: the result card offers it too, still nothing sent
  const card = await enter();
  await wait(600);
  const btn = [...document.querySelectorAll('.cmdbar-out button')].find((b) => /✦ Ask the director/.test(b.textContent));
  step('…Enter shows the same offer in the card, still nothing sent', Boolean(btn) && sent.length === 0, card.slice(0, 160));
  (btn || ask)?.click();
  await until(() => sent.length, 8000);
  step('…the click sends it ONCE to the docked director, as the owner\'s message', sent.length === 1 && sent[0].id === agent.id && sent[0].text === ODD, sent);
  await until(() => !Native.pendingFor?.(agent.id), 60000);
  await smoke({ shot: '/tmp/cmdbar141.png' }).catch(() => {});
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
