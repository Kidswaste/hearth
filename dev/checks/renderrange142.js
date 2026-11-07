// (round 142, renderrange142) What to render in the Lab's Render card (docs/upgrades/renderrange142.md), one check:
//   1. a loop set on the timeline: the card opens on ⟲ Loop and says "Your loop: 0:03.75 – 0:07.5 (3.75 s, 2 bars)"
//   2. ⇪ Export on Loop: a video exactly the loop long (its frames, its start, its sound from the loop's start)
//   3. ♫ Full song: the whole song long
//   4. the choice is remembered per project (p.prefs.renderRange, on disk); a new loop opens on Loop again
//   5. the presets show their own pick on the chips (the reel: its window; Seamless loop: the loop; Full song: the
//      song), and a chip changes the shown preset's length
//   6. the check before a render shows the range (and its time)
//   7. ▤ Sequence is offered once the scene is in a Lab sequence, and renders the sequence
// Renders are tiny (96×54, 24 fps). Only the check's own temp data (smoke.js) and the fixture song; never an owner's file.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/renderrange142.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const base = (p) => String(p || '').split(/[\\/]/).pop();
const r3 = (x) => Math.round(x * 1000) / 1000;

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.player, 60000);
  const SC = ThreeLab.scenes; const D = ThreeLab.director; const P = ThreeLab.stageHooks.player;
  const code = (color) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 24), new THREE.MeshBasicMaterial({ color: '${color}' }));
scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; renderer.render(scene, cam); });`;
  const layers = [ThreeLayers.defaults({ id: 'rrBack', name: 'Backdrop', code: code('#3355ff'), slot: 0 }), ThreeLayers.defaults({ id: 'rrRing', name: 'Ring', code: code('#ff3d7f'), slot: 1 })];
  const sk = SC.create({ name: 'Range check', code: layers[0].code, layers, frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  await until(() => P.loaded && P.analysis?.sections?.length && P.timeline()?.grid?.bpm, 60000);
  const g = P.timeline().grid;
  const bar = ((g.beatsPerBar || 4) * 60) / g.bpm;
  const at = (n) => r3((g.downbeat || 0) + n * bar);
  const LOOP = { a: at(2), b: at(4) };
  D.timelineEdit({ loop: { start: LOOP.a, end: LOOP.b } });
  await until(() => P.loop && Math.abs(P.loop.a - LOOP.a) < 1e-3, 5000);
  store.set('three.mediaLoop', true);
  store.set('three.export', { format: 'mp4', size: 'custom', custom: '96x54', fps: 24, quality: 'draft', ss: 1, blur: 1 });
  await Lazy.load('projects'); await Projects.ready();
  const pj = Projects.create({ name: 'Range Test' });
  Projects.add(pj, 'scene', sk.id, '', { links: false });
  await Projects.flush();
  step('setup: a 16:9 scene with the fixture song, a 2-bar loop on the timeline, in a project', P.loaded && P.loop?.b > P.loop?.a && Projects.ofItem('scene', sk.id)?.[0]?.id === pj.id, { loop: P.loop, bpm: g.bpm, bar: r3(bar), song: r3(P.duration) });

  const card = () => document.querySelector('dialog.lx-panel[open]');
  const pf = () => document.querySelector('dialog.pf-card[open]');
  const openCard = async (o = {}) => { LabExport.panel(o); await until(() => card()?.querySelector('.rr-row') && typeof LabPreflight !== 'undefined' && card().querySelector('.lx-est'), 20000); return card(); };
  const closeCard = () => { const d = card(); if (d) d.close(); };
  const on = () => card()?.querySelector('.rr-chip.on')?.dataset.range || null;
  const chips = () => [...(card()?.querySelectorAll('.rr-chip') || [])].map((b) => b.dataset.range);
  const line = () => card()?.querySelector('.rr-line')?.textContent || '';
  const pick = async (id) => { card().querySelector(`.rr-chip[data-range="${id}"]`).click(); await until(() => on() === id, 8000); };
  const press = () => card().querySelector('.modal-actions .primary').click();
  const rendered = async (l0) => until(() => { const l = LabExport.status().last; return l !== l0 && l?.path ? l : null; }, 600000);
  // what the export asked the song for (its start and end: the frames start there too, T = T0 + n / F)
  const asked = [];
  const audioPlan0 = ThreeSeq.audioPlan;
  ThreeSeq.audioPlan = (e, end, from) => { asked.push({ from: r3(from), end: r3(end) }); return audioPlan0(e, end, from); };

  // ---------- 1. a loop set: the card opens on Loop ----------
  await openCard();
  const want1 = `Your loop: ${RenderPreCore.clock(LOOP.a)} – ${RenderPreCore.clock(LOOP.b)} (${r3(LOOP.b - LOOP.a)} s, 2 bars)`;
  step('a loop set: the card opens on ⟲ Loop, at the top, and says the loop\'s range', on() === 'loop' && card().querySelector('.sq-rp-body')?.firstElementChild?.classList.contains('rr-row') && line() === want1 && chips().join(',') === 'full,loop,custom', { on: on(), line: line(), want: want1, chips: chips() });
  await smoke({ shot: '/tmp/renderrange142-card.png' }).catch(() => {});

  // ---------- 2. Loop: exactly the loop ----------
  const l2 = LabExport.status().last; asked.length = 0;
  press();
  const r2 = await rendered(l2);
  const p2 = r2 && await window.hub.video.probe(r2.path);
  const N2 = Math.round((LOOP.b - LOOP.a) * 24);
  step('⇪ Export on Loop: exactly the loop\'s frames, from its start, with its sound from the loop\'s start', r2?.frames === N2 && p2?.frames === N2 && Math.abs(p2.duration - N2 / 24) < 0.06 && p2.audio && asked[0]?.from === LOOP.a && Math.abs(asked[0].end - LOOP.b) < 1e-3 && LabPreflight.last?.range === want1,
    { frames: r2?.frames, probed: p2 && { frames: p2.frames, dur: p2.duration, fps: p2.fps, audio: Boolean(p2.audio) }, want: N2, asked: asked[0], checkRange: LabPreflight.last?.range });

  // ---------- 3. Full song ----------
  await openCard();
  await pick('full');
  const N3 = Math.round(P.duration * 24);
  const line3 = line();
  const l3 = LabExport.status().last; asked.length = 0;
  press();
  const r3r = await rendered(l3);
  const p3 = r3r && await window.hub.video.probe(r3r.path);
  step('♫ Full song: the whole song long', /^The whole song: 0:00 – /.test(line3) && r3r?.frames === N3 && p3?.frames === N3 && Math.abs(p3.duration - P.duration) < 0.06 && p3.audio && asked[0]?.from === 0, { line: line3, frames: r3r?.frames, want: N3, probed: p3 && { frames: p3.frames, dur: p3.duration }, song: P.duration });

  // ---------- 4. remembered per project ----------
  await Projects.flush();
  const disk = await window.hub.kvGet('projects');
  const onDisk = (disk?.list || disk?.projects || []).find?.((x) => x.id === pj.id)?.prefs?.renderRange;
  await openCard();
  const kept = on();
  closeCard();
  D.timelineEdit({ loop: { start: at(4), end: at(5) } });
  await until(() => P.loop && Math.abs(P.loop.a - at(4)) < 1e-3, 5000);
  await openCard();
  const fresh = on(); const freshLine = line();
  closeCard();
  D.timelineEdit({ loop: { start: LOOP.a, end: LOOP.b } });
  await until(() => P.loop && Math.abs(P.loop.a - LOOP.a) < 1e-3, 5000);
  step('the choice is remembered per project (on disk); a new loop opens on Loop again', pj.prefs.renderRange?.kind === 'full' && onDisk?.kind === 'full' && kept === 'full' && fresh === 'loop' && /\(1\.88 s, 1 bar\)|\(1\.87 s, 1 bar\)/.test(freshLine), { prefs: pj.prefs.renderRange, onDisk, kept, fresh, freshLine });

  // ---------- 5. presets show their pick ----------
  await openCard();
  const pchip = (id) => card().querySelector(`.rp-chip[data-preset="${id}"]`);
  const seen = {};
  for (const id of ['reel', 'loop', 'full']) { pchip(id).click(); await wait(80); seen[id] = { on: on(), line: line() }; }
  pchip('reel').click(); await wait(80); // (shown again)
  await pick('loop');
  const reelLen = LabRenderPre._S.cur.state().filled.reel.length;
  step('presets show their own range on the chips (reel: its drop window; Seamless loop: your loop; Full song: the song), and a chip overrides it', seen.reel.on === 'custom' && /^Vertical reel chose · .*drop/.test(seen.reel.line) && seen.loop.on === 'loop' && /^Seamless loop chose · Your loop/.test(seen.loop.line) && seen.full.on === 'full' && /^Full song chose · The whole song/.test(seen.full.line) && reelLen?.range?.a === LOOP.a && reelLen.range.b === LOOP.b,
    { seen, reel: reelLen });
  closeCard();

  // ---------- 6. the check shows the range ----------
  cmd.solo('Ring');
  await until(() => LayerGroups.soloId(SC.layersOf(SC.get(sk.id))), 5000);
  await openCard();
  await pick('loop');
  press();
  await until(() => pf(), 10000);
  const pfRange = pf()?.querySelector('.pf-range')?.textContent || ''; const pfEst = pf()?.querySelector('.pf-est')?.textContent || '';
  step('the check before a render shows the range and its time', pfRange === `▸ ${want1}` && /about \d+ s/.test(pfEst), { pfRange, pfEst });
  pf()?.querySelector('.pf-cancel')?.click(); await wait(150);
  closeCard();
  cmd.solo(null);
  await until(() => !LayerGroups.soloId(SC.layersOf(SC.get(sk.id))), 5000);

  // ---------- 7. Sequence ----------
  await openCard();
  const before7 = chips();
  closeCard();
  await ThreeSeq.create('Range seq', { empty: true, format: '16:9', show: false });
  await ThreeSeq.add({ sketch: sk.id }, { dur: 1.5 });
  const seqDur = ThreeSeq.compile(ThreeSeq.edit).plan.dur;
  await openCard();
  const after7 = chips();
  await pick('seq');
  const line7 = line();
  const l7 = LabExport.status().last;
  press();
  const r7 = await rendered(l7);
  const p7 = r7 && await window.hub.video.probe(r7.path);
  const N7 = Math.round(seqDur * 24);
  step('▤ Sequence is offered once the scene is in a sequence, and renders the whole sequence', !before7.includes('seq') && after7.includes('seq') && /^The sequence “Range seq”/.test(line7) && r7?.frames === N7 && p7?.frames === N7, { before7, after7, line: line7, frames: r7?.frames, want: N7, seqDur });
  ThreeSeq.audioPlan = audioPlan0;
  closeCard();
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
