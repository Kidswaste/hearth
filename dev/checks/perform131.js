// (round 131, perform131) ◉ Perform, the Lab's live mode (docs/upgrades/perform131.md), in one check:
//   1. entering: ▣ Present's right-click › ◉ Perform shows the scene full screen with the small strip (cues, looks,
//      the next cue with its picture), at the screen's own rate
//   2. a number key jumps to its cue on the next BAR while the song plays (armed until then), with the cue's look
//   3. Q / W play saved looks on the selected layer; a MIDI pad learned through the stage's learn plays one too
//   4. B black-out (with its fade) and Space freeze, on and off
//   5. no extra frame cost: each switch's own work, and the preview's frame work while switching against steady
//      (the sandbox's frame recorder), under one frame of the 240 Hz screen; judged load-aware (the trace's CPU time
//      and the thread's wait for a CPU, as dev/loadwait.js does for Node)
//   6. Esc leaves: the saved scene (the sketch store and the song's cues) and the live sliders are unchanged
//   7. ● Rec: the switches are written as cues when Perform ends, ONE Ctrl/⌘+Z puts the cues back exactly
//   8. the AI's set (three_do perform { setup }): shown for review, used only on the owner's OK
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/perform131.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const key = (k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const FRAME = 1000 / 240; // one frame of the owner's 240 Hz screen

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.ThreeStage, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const CODE = `import * as THREE from 'three';
const P = tweak({ glow: [0.5, 0, 2], intensity: [1, 0, 3], spark: [0.2, 0, 1] });
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshBasicMaterial({ color: 0xff3d7f, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop(() => { mesh.rotation.y += 0.01 * P.intensity; mesh.scale.setScalar(0.6 + P.glow * 0.3 + P.spark * 0.2); renderer.render(scene, cam); });`;
  const sk = SC.create({ name: 'Perform check', code: CODE, layers: [ThreeLayers.defaults({ id: 'pfMain', name: 'Main', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && hk.ctlOf('pfMain')?.controls().some((c) => c.key === 'spark'), 20000);
  const ctl = () => hk.ctlOf('pfMain');
  ctl().setMany({ glow: 0.2, intensity: 0.6 }); ctl().looksApi.save('Calm');
  ctl().setMany({ glow: 1.6, intensity: 2.4 }); ctl().looksApi.save('Hype');
  ctl().setMany({ glow: 0.5, intensity: 1 });
  await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4, 60000);
  if (!P.cues.length) P.autoSections();
  await until(() => P.cues.length >= 4, 5000);
  const dropCue = P.cues.find((c) => /^Drop/.test(c.name));
  P.editCues({ add: [{ time: dropCue.time, name: dropCue.name, looks: [{ layer: 'pfMain', name: 'Hype' }] }] });
  step('the scene: sliders, two saved looks, the fixture song with its section cues (the Drop carries Hype)', ctl().looksApi.list().length === 2 && P.cues.length >= 4 && P.cues.find((c) => c.name === dropCue.name)?.looks?.length === 1, P.cues.map((c) => `${c.name}@${r1(c.time)}`));
  await wait(2500); // the scene's saves settle
  const savedSig = async () => {
    const all = (await window.hub.kvGet('three-sketches', [])) || []; const s = all.find((x) => x.id === sk.id) || null;
    const { updatedAt, ...rest } = s || {}; const maps = (await window.hub.kvGet('three-beatmaps', {})) || {};
    return JSON.stringify({ s: rest, cues: maps[P.path]?.cues || null });
  };
  const liveSig = () => JSON.stringify({ cues: P.timeline().cues, ctl: ctl().controls().map((c) => [c.key, c.value]), looks: ctl().looksApi.list() });
  const saved0 = await savedSig(); const live0 = liveSig(); const fps0 = hk.fps;

  // ---------- 1. entering, from ▣ Present's menu ----------
  P.seek(0);
  const presentBtn = [...document.querySelectorAll('[data-feature="Present"]')].find((b) => hk.pane.contains(b));
  presentBtn?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 120 }));
  const row = await until(() => [...document.querySelectorAll('.mb-menu.lab-pop .menu-item')].find((b) => /Perform/.test(b.textContent)), 5000);
  row?.click();
  await until(() => window.ThreePerform?.state.on && ThreePerform.strip?.isConnected, 15000);
  const st1 = window.ThreePerform?.state;
  const chips = () => [...(ThreePerform.strip?.querySelectorAll('.pf-cue') || [])];
  step('▣ Present › ◉ Perform: full screen with the strip (cues on 1–9, looks on Q W), at the screen\'s own rate', Boolean(row) && st1?.on && hk.host.classList.contains('perform-on') && chips().length === Math.min(9, P.cues.length) && ThreePerform.strip.querySelectorAll('.pf-look').length === 2 && hk.fps === 0,
    { where: st1?.where, keys: st1?.keys, fps: hk.fps, full: document.fullscreenElement === hk.host || hk.host.classList.contains('perform-window') });
  await until(() => !/getting/.test(ThreePerform.strip.querySelector('.pf-note')?.textContent || ''), 15000);
  const thumb = ThreePerform.strip.querySelector('.pf-thumb');
  step('…the next cue shows its name and its picture (made before the show)', /next: /.test(ThreePerform.strip.querySelector('.pf-next-name')?.textContent || '') && thumb && !thumb.hidden && /^data:image/.test(thumb.src),
    { next: ThreePerform.strip.querySelector('.pf-next-name')?.textContent, thumb: thumb?.hidden === false });

  // ---------- 2. a number key jumps to its cue on the next bar ----------
  const map = ThreePerform.map();
  const dropRow = map.cues.find((c) => c.name === dropCue.name);
  ThreePerform.setQuant('bar');
  P.seek(Math.max(0, dropCue.time - 12.3)); P.toggle(true);
  await until(() => P.playing && P.time > dropCue.time - 11.9, 8000);
  const tl = P.timeline(); const bar = (tl.grid.beatsPerBar * 60) / tl.grid.bpm; const db = tl.grid.downbeat || 0;
  const n0 = ThreePerform.stats.switches.length;
  const pressT = P.time; const pressAt = performance.now();
  key(dropRow.key);
  const armed = ThreePerform.state.pending.cue === dropRow.key && document.querySelector(`.pf-cue[data-key="${dropRow.key}"]`)?.classList.contains('armed');
  const sw = await until(() => ThreePerform.stats.switches.slice(n0).find((s) => s.kind === 'cue'), 6000);
  const landT = sw ? pressT + (sw.at - pressAt) / 1000 : null;
  const off = landT == null ? null : Math.abs(((landT - db) / bar - Math.round((landT - db) / bar)) * bar);
  await wait(120);
  step(`key ${dropRow?.key} arms its cue and lands on the next bar line (the song playing)`, armed && sw && off <= 0.035 + Math.max(0, sw.late) / 1000 && landT - pressT <= bar + 0.06,
    { armed, waitedS: sw ? r1((sw.at - pressAt) / 100) / 10 : null, offBarMs: off == null ? null : Math.round(off * 1000), lateMs: sw?.late, bar: r1(bar * 100) / 100 });
  step('…the playhead is at the cue and its look (Hype) plays', P.time >= dropCue.time - 0.01 && P.time < dropCue.time + 1 && ctl().playingLook === 'Hype', { time: r1(P.time * 100) / 100, cue: dropCue.time, look: ctl().playingLook });

  // ---------- 3. looks: Q / W, and a MIDI pad learned for one ----------
  ThreePerform.setQuant('beat');
  const n1 = ThreePerform.stats.switches.length;
  key('q');
  await until(() => ThreePerform.stats.switches.slice(n1).some((s) => s.kind === 'look'), 4000);
  await wait(60);
  const qOk = ctl().playingLook === 'Calm' && ThreePerform.state.held.pfMain === 'Calm';
  ThreePerform.setQuant('now');
  key('w'); await wait(60);
  const wOk = ctl().playingLook === 'Hype';
  ThreeStageMidi.startLearn({ kind: 'action', action: 'perform:look1' });
  ThreeStageMidi.message([0x90, 40, 100]);
  const learned = ThreeStageMidi.data.global['1:n40'];
  ThreeStageMidi.message([0x90, 40, 100]);
  await until(() => ctl().playingLook === 'Calm', 3000);
  step('Q plays Calm on the beat, W plays Hype, and a learned MIDI pad plays Calm (the stage\'s learn)', qOk && wOk && learned?.a === 'perform:look1' && ctl().playingLook === 'Calm', { qOk, wOk, learned, now: ctl().playingLook });

  // ---------- 4. black-out and freeze ----------
  key('b');
  const blk = await until(() => ThreeStage.state.black && hk.host.querySelector('.lab-blackout.on'), 2000);
  const fade = getComputedStyle(hk.host.querySelector('.lab-blackout')).transitionDuration;
  key('b'); const unblk = await until(() => !ThreeStage.state.black && !hk.host.querySelector('.lab-blackout.on'), 2000);
  key(' '); const frz = hk.frozen; key(' '); const unfrz = !hk.frozen;
  step('B fades to black and back; Space freezes and unfreezes', Boolean(blk) && parseFloat(fade) > 0 && Boolean(unblk) && frz && unfrz, { fade, frz, unfrz });

  // ---------- 5. no extra frame cost on a switch ----------
  const sbx1 = (code) => ThreeLab.director.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
  const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(400); } return r; };
  const frames = async (ms, during) => {
    await sbx('return window.__labHitch.start()');
    const t0 = performance.now(); await during?.(); const left = ms - (performance.now() - t0); if (left > 0) await wait(left);
    const raw = await sbx('return window.__labHitch.stop()'); return typeof raw === 'string' ? JSON.parse(raw) : null;
  };
  if (!P.playing) P.toggle(true);
  P.seek(Math.max(0, dropCue.time - 20));
  await wait(400);
  const steady = await frames(2000);
  let traced = false; try { await smoke({ trace: 'start', tasks: true }); traced = true; } catch { /* judged on wall time */ }
  performance.mark('perform131'); const markAt = performance.now();
  const n2 = ThreePerform.stats.switches.length;
  const seq = ['q', 'w', map.cues[0].key, 'q', 'w', map.cues[1].key, 'q', 'w', map.cues[0].key, 'w', 'q', map.cues[1].key];
  const switching = await frames(2600, async () => { for (const k of seq) { key(k); await wait(190); } });
  const sws = ThreePerform.stats.switches.slice(n2);
  const over = sws.filter((s) => s.ms > FRAME);
  let judged = null;
  if (traced) { try { judged = await smoke({ trace: 'stop', tasks: { budget: FRAME, min: 0, mark: 'perform131', observed: over.map((s) => ({ at: s.at - markAt, ms: s.ms })) } }); } catch (e) { judged = { verdict: 'unknown', why: String(e).slice(0, 120) }; } }
  const appOver = over.filter((s) => { const tk = judged?.tasks?.find((x) => Math.abs(x.at - (s.at - markAt)) < 1.5); return !tk || tk.cpuMs == null || tk.cpuMs > FRAME; });
  const work = (f) => f.work.filter((x, i) => f.drew[i]);
  const sW = steady ? work(steady) : []; const xW = switching ? work(switching) : [];
  const extra = r1(pct(xW, 0.95) - pct(sW, 0.95));
  const compiles = switching ? switching.compiles.reduce((a, x) => a + x, 0) : null;
  const gaps = (f) => f.gap.slice(1).filter((g) => g > 0);
  step(`no extra frame cost on a switch: each switch's own work and the preview's frame work stay under one 240 Hz frame (${r1(FRAME * 100) / 100} ms), nothing compiled`,
    sws.length === seq.length && appOver.length === 0 && extra <= FRAME && compiles === 0,
    { switches: sws.length, worstMs: r1(Math.max(0, ...sws.map((s) => s.ms)) * 100) / 100, over: over.length, overJudgedLoad: over.length - appOver.length, runDelayMs: judged?.runDelayMs ?? null, workP95: { steady: r1(pct(sW, 0.95)), switching: r1(pct(xW, 0.95)) }, extra, compiles, gapP50: { steady: r1(pct(steady ? gaps(steady) : [], 0.5)), switching: r1(pct(switching ? gaps(switching) : [], 0.5)) } });
  P.toggle(false);

  // ---------- 6. Esc leaves; nothing in the saved scene changed ----------
  key('Escape');
  await until(() => !ThreePerform.state.on, 3000);
  await wait(2500);
  const saved1 = await savedSig(); const live1 = liveSig();
  step('Esc leaves (strip gone, frame rate back, your sliders back): the saved scene and the cues are unchanged with Rec off', !ThreePerform.state.on && !ThreePerform.strip && hk.fps === fps0 && !ctl().playingLook && saved1 === saved0 && live1 === live0,
    { saved: saved1 === saved0, live: live1 === live0, fps: hk.fps, look: ctl().playingLook });

  // ---------- 7. ● Rec: the switches as cues, ONE undo ----------
  await ThreePerform.start({ screen: 'here' });
  await until(() => ThreePerform.state.on && !/getting/.test(ThreePerform.strip?.querySelector('.pf-note')?.textContent || ''), 15000);
  ThreePerform.setQuant('now');
  const box = ThreePerform.strip.querySelector('.pf-rec-box'); box.checked = true; box.dispatchEvent(new Event('change'));
  P.seek(5); P.toggle(true); await wait(500);
  key(map.cues[1].key); await wait(700);
  key('w'); await wait(500);
  const evs = ThreePerform.state.events;
  P.toggle(false);
  key('Escape');
  await until(() => !ThreePerform.state.on, 3000);
  await wait(200);
  const after = P.timeline().cues;
  const added = after.length - JSON.parse(live0).cues.length;
  step('● Rec on: the cue jump and the look switch are written to the timeline as cues with their times when Perform ends', evs === 2 && added === 2 && after.some((c) => c.name === '◐ Hype' && c.looks?.[0]?.name === 'Hype'), { events: evs, added, cues: after.map((c) => `${c.name}@${r1(c.time)}`) });
  hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(300);
  step('…ONE Ctrl/⌘+Z in the Lab puts the cues back exactly', liveSig() === live0, liveSig() === live0 ? 'same' : P.timeline().cues.map((c) => c.name));

  // ---------- 8. the AI's set: reviewed before it's used ----------
  const r8 = await ThreePerform.op({ setup: { cues: { 1: dropCue.name, 2: 'Intro' }, looks: { q: 'Hype', w: 'Calm' }, quant: 'beat' } });
  const before8 = ThreePerform.map().cues[0]?.name;
  await ThreePerform.start({ screen: 'here' });
  const dlg = await until(() => document.querySelector('dialog.pf-review[open]'), 4000);
  dlg?.querySelector('.pf-review-use')?.click();
  await wait(150);
  const m8 = ThreePerform.map();
  step('three_do perform { setup }: shown for review first (keys unchanged until "Use this set"), then 1 = Drop, Q = Hype', r8.ok && before8 !== dropCue.name && Boolean(dlg) && m8.cues[0]?.name === dropCue.name && m8.looks[0]?.name === 'Hype', { reply: r8.value?.set || r8.error, before: before8, after: ThreePerform.state.keys });
  ThreePerform.leave();
  await wait(1500);
  step('the saved scene is still the one from before the show', (await savedSig()) === saved0);
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
