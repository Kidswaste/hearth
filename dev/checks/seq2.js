// Lab sequence round 2 (seq2): ✦ arranging scenes on the song (/arrange: cuts on bars, the sections' pace, the
// transitions chosen per section change, a scene coming back in another look), Astra deciding (local default
// without engines), templates, the 15 s / 6 s versions, fill a gap, V variations, Lab transitions in the preview
// (a camera fly-through moving a 3D scene's own camera, a morph keeping a shared layer, the depth wipe), a scene's
// own hit markers moving with its clip, nested sequences, roll / slide, copy-paste between sequences, sound clips
// in the preview, markers / zoom presets, the waveform and clip pictures, smoothness while an arranged sequence plays.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/seq2.js --shot /tmp/seq2.png
const { step } = J;
const { wait, until, colorOf, sbx } = SQL;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const Q = ThreeSeq;
const ids = await SQL.scenes();
const S = ThreeLab.scenes;
// a 3D scene (a lit cube seen by a perspective camera) and a scene that is white only on its own kick markers
const CUBE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 8);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(cube);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const KICK = `const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); function loop() { g.fillStyle = audio.kick > 0.5 ? '#ffffff' : '#000000'; g.fillRect(0, 0, 64, 64); requestAnimationFrame(loop); } requestAnimationFrame(loop);`;
const get = (name, code) => S.all().find((x) => x.name === name) || S.create({ name, code });
const cube = get('Seq2 Cube', CUBE).id; const kick = get('Seq2 Kick', KICK).id;

// ---------- 1. ✦ arrange on the song ----------
await Q.create('Seq2 arrange', { empty: true, show: true });
await Q.add({ path: SQL.SONG, song: true });
await wait(2500);
const said = await say(`/sequence make music video`);
step('/sequence make: the scenes arranged on the song (several clips, every cut on a bar; a short flat song gets intro / build / drop / outro)', /✦ \*\*Music video\*\*/.test(said) && Q.edit.clips.length >= 4 && /Drop/.test(said), said.slice(0, 400));
const st = Q.status();
const g = st.grid;
const T0 = ThreeSeqData.timing(Q.edit);
const sg = (await Q.songInfo())?.grid; const songIn = ThreeSeqData.songOf(Q.edit)?.in || 0;
const offBar = sg ? T0.slice(1).filter((x) => { const k = (x.cut + songIn - sg.anchor) / g.bar; return Math.abs(k - Math.round(k)) > 0.02; }) : [1];
step('…cuts on the bars of the song\'s grid', Boolean(g) && offBar.length === 0, { grid: g, cuts: T0.map((x) => x.cut.toFixed(2)) });
step('…the arranged sections become named markers', (Q.edit.markers || []).some((m) => m.arranged && m.label), Q.edit.markers);
const scenesUsed = new Set(Q.edit.clips.map((c) => c.sketch));
step('…several of your scenes, never the same one twice in a row', scenesUsed.size >= 2 && Q.edit.clips.every((c, i) => !i || c.sketch !== Q.edit.clips[i - 1].sketch), [...scenesUsed]);
const before = JSON.stringify(Q.edit.clips.map((c) => c.sketch + (c.vary?.seed || '')));
await say('/sequence again');
step('/sequence again: another arrangement (like Shuffle)', JSON.stringify(Q.edit.clips.map((c) => c.sketch + (c.vary?.seed || ''))) !== before);
await say('/sequence undo');
step('…undo brings the previous one back', JSON.stringify(Q.edit.clips.map((c) => c.sketch + (c.vary?.seed || ''))) === before);
const tl = await say('/sequence templates');
step('/sequence templates lists the ten shapes', (tl.match(/^• /gm) || []).length >= 10, tl.slice(0, 200));
const teaser = await say('/arrange teaser');
step('/arrange teaser: about 15 s around the drop', Math.abs(Q.status().seconds - 15) < 2.2 && /Teaser/.test(teaser), Q.status().seconds);
// Astra decides (no engine here: the local default, with Undo)
const d = await Q.decideArrangement().catch((err) => ({ err: err.message }));
step('✦ Let Astra pick: an arrangement is chosen and applied (Astra / Claude, or the local default)', Boolean(d?.pick) && Q.edit.seq.arranged?.template, d);
await Decide.undo();
step('…and /decide undo puts the sequence back', Q.edit.seq.arranged?.template === 'teaser', Q.edit.seq.arranged);

// ---------- 2. versions, fill, variations ----------
const made = await Q.versions([15, 6]);
step('the 15 s and 6 s versions: two new sequences, owned by the same scene', made.length === 2 && Math.abs(made[0].seconds - 15) < 2.2 && Math.abs(made[1].seconds - 6) < 1.2, made);
const all = await Q.list();
step('…listed with the others', made.every((m) => all.some((x) => x.key === m.key && x.scene === Q.owner)), all.map((x) => `${x.name}:${x.scene}`));
Q.del(false, [Q.edit.clips[1].id]);
const gapId = Q.edit.clips[1].id;
const keepT = ThreeSeqData.timing(Q.edit)[2].start;
step('Delete leaves a gap', Q.edit.clips[1].kind === 'gap');
Q.play(false); Q.seek(ThreeSeqData.timing(Q.edit)[1].start + 0.1);
document.querySelector('.sq-tl').focus();
document.querySelector('.sq-tl').dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
await until(() => Q.edit.clips[1].kind === 'scene', 4000);
step('G fills the gap with a scene that fits; what follows keeps its time', Q.edit.clips[1].kind === 'scene' && Math.abs(ThreeSeqData.timing(Q.edit)[2].start - keepT) < 0.02, { gap: gapId, clips: Q.status().clips.slice(0, 4) });
const sc = Q.edit.clips.findIndex((c) => c.kind === 'scene');
Q.select(Q.edit.clips[sc].id);
const seed0 = Q.edit.clips[sc].vary?.seed;
document.querySelector('.sq-tl').dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
step('V: a new variation of the selected scene clip', Q.edit.clips[sc].vary && Q.edit.clips[sc].vary.seed !== seed0, Q.edit.clips[sc].vary);
document.querySelector('.sq-tl').dispatchEvent(new KeyboardEvent('keydown', { key: 'V', shiftKey: true, bubbles: true }));
step('Shift+V: back to the scene as saved', !Q.edit.clips[sc].vary);

// ---------- 3. Lab transitions in the preview ----------
await Q.create('Seq2 moves', { empty: true, show: true });
await Q.add({ sketch: cube }, { dur: 2, trans: null });
await Q.add({ sketch: cube }, { dur: 2, trans: { type: 'lab-fly', dur: 1 } });
await wait(1200);
const bright = async (n) => { const p = await SQL.at(n, { settle: 500 }); const big = (await sbx('return __seqPixels({ size: 120 })'))?.bright; return { p, big }; };
const still = await bright(30);
const flying = await bright(40);
step('camera fly-through: the cube scene\'s own camera flies in (the cube fills more of the frame mid-move)', typeof still.big === 'number' && flying.big > still.big * 1.3, { still: still.big, flying: flying.big });
const info = await sbx('return __seqInfo()');
step('…the preview shows the Lab transition', info?.showing?.trans === 'lab-fly', info?.showing);
// morph: two scenes sharing a layer named "Ring" (the ring stays through the cut)
const ring = `const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c); const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(28, 28, 8, 8);`;
const bg = (col) => `const c = document.createElement('canvas'); c.width = 8; c.height = 8; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c); const g = c.getContext('2d'); g.fillStyle = '${col}'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#000'; g.fillRect(3, 3, 2, 2);`;
const mA = S.all().find((x) => x.name === 'Seq2 MorphA') || S.create({ name: 'Seq2 MorphA', code: bg('#ff0000'), layers: [{ id: 'bg', name: 'Back', code: bg('#ff0000') }, { id: 'ring', name: 'Ring', code: ring, blend: 'screen' }] });
const mB = S.all().find((x) => x.name === 'Seq2 MorphB') || S.create({ name: 'Seq2 MorphB', code: bg('#0000ff'), layers: [{ id: 'bg', name: 'Back B', code: bg('#0000ff') }, { id: 'ring', name: 'Ring', code: ring, blend: 'screen' }] });
await Q.create('Seq2 morph', { empty: true, show: true });
await Q.add({ sketch: mA.id }, { dur: 2, trans: null });
await Q.add({ sketch: mB.id }, { dur: 2, trans: { type: 'lab-morph', dur: 1 } });
await wait(1500);
const mid = await SQL.at(45, { settle: 600 });
const center = (await sbx('return __seqPixels({ size: 64, x: 0.5, y: 0.5 })'))?.at;
step('morph: the shared layer stays at full strength mid-transition while the rest changes', Array.isArray(center) && center.every((v) => v > 200) && colorOf(mid.center) === 'mix', { center, around: mid.center });
// depth wipe: a frame of it renders (bright parts first)
Q.setTransition('lab-depth', Q.edit.clips[1].id, 1);
await wait(400);
const dw = await SQL.at(45, { settle: 500 });
step('depth wipe draws in the preview', Boolean(dw?.center), dw);

// ---------- 4. a scene's own hit markers move with its clip ----------
await Q.leave();
await window.hub.kvSet('three-beatmaps', { ...((await window.hub.kvGet('three-beatmaps', {})) || {}), [SQL.SONG]: { grid: { bpm: 120, anchor: 0, bpb: 4 }, marks: { kick: [1], snare: [], hit: [] } } });
S.open(kick); await wait(800);
await (await ThreeLab.cmd()).loadSong(SQL.SONG); await wait(800);
S.open(ids.red); await wait(800);
await Q.create('Seq2 hits', { empty: true, show: true, scene: ids.red });
await Q.add({ path: SQL.SONG, song: true });
await Q.add({ sketch: ids.red }, { dur: 4, trans: null });
await Q.add({ sketch: kick }, { dur: 4, trans: null });
await Q.leave(); await Q.enter(); await wait(1200);
const atOwn = await SQL.at(151, { settle: 600 }); // 5.03 s: the kick scene's own 1 s marker, moved to its clip (starts at 4 s)
const before1 = await SQL.at(140, { settle: 600 }); // 4.67 s: nothing
step('a scene\'s own kick marker fires at its clip\'s start + 1 s (clip-relative, like its keyframes)', colorOf(atOwn.center) === 'white' && colorOf(before1.center) === 'black', { at5_03: atOwn.center, at4_67: before1.center });

// ---------- 5. nested sequences, roll / slide, clipboard ----------
const sub = Q.key;
await Q.create('Seq2 host', { empty: true, show: true });
await Q.add({ sketch: ids.blue }, { dur: 2, trans: null });
const nestedId = await Q.nest(sub);
step('a sequence as a clip (nested)', Q.edit.clips.some((c) => c.kind === 'seq' && c.ref === sub), Q.status().clips);
await wait(1200);
const inNest = await SQL.at(60 + 15, { settle: 600 }); // 2.5 s: the nested sequence's red scene
step('…the preview plays what it holds', colorOf(inNest.center) === 'red', inNest);
Q.unnest(nestedId);
step('…unnest: its clips here, editable', Q.edit.clips.filter((c) => c.kind === 'scene').length >= 3 && !Q.edit.clips.some((c) => c.kind === 'seq'), Q.status().clips);
const T1 = ThreeSeqData.timing(Q.edit); const tot = Q.status().seconds;
await Q.handle('three_sequence', { op: 'roll', clip: 2, to: T1[1].start + 0.5 });
step('roll: the cut moves, the length stays', Math.abs(Q.status().seconds - tot) < 0.01 && Math.abs(ThreeSeqData.timing(Q.edit)[1].start - (T1[1].start + 0.5)) < 0.02, Q.status().clips);
Q.copySel([Q.edit.clips[0].id, Q.edit.clips[1].id]);
const r0 = await Q.handle('three_sequence', { op: 'paste', into: 'Seq2 arrange', at: 0 });
step('copy two clips, paste them into another sequence', r0.ok && Q.key === 'seq:Seq2 arrange' && Q.edit.clips[0].sketch === ids.blue, r0);

// ---------- 6. markers, zoom, waveform, clip pictures ----------
const mks = await Q.handle('three_sequence', { op: 'section_markers' });
step('/sequence markers: a marker per section of the song', (Q.edit.markers || []).filter((m) => m.section).length >= 1, { said: mks, markers: Q.edit.markers, song: ThreeSeqData.songOf(Q.edit), tracks: (Q.edit.tracks || []).map((k) => [k.type, k.name, k.mute, k.items.length]) });
await say('/sequence zoom 4 bars');
step('/sequence zoom 4 bars', Q._S.vr && Math.abs((Q._S.vr.t1 - Q._S.vr.t0) - 4 * (Q.status().grid?.bar || 2)) < 0.05, Q._S.vr);
await say('/sequence zoom fit');
Q.seek(1.0); await Q.settle(); await wait(1200);
step('the clip under a resting playhead gets its own picture', Q._S.thumbs.size >= 1, [...Q._S.thumbs.keys()]);

// ---------- 7. smoothness while an arranged sequence with Lab moves plays ----------
await say('/arrange reel');
Q.seek(0); await Q.settle();
const per0 = await (async () => { if (typeof M === 'undefined') return null; Q.play(true); await wait(300); const r = await M.measure(3000); Q.play(false); return r; })();
if (per0) {
  console.log('[seq2-smooth]', M.brief(per0));
  step('playing an arranged sequence: few DOM changes a second (no per-frame writes)', per0.mut.perSec <= 12, M.brief(per0));
  step('…the playhead is one compositor animation', document.querySelector('.sq-playhead').getAnimations().length <= 1);
}
return J.done();
