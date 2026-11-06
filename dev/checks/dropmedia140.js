// (round 140, dropmedia140) Media dropped on the Lab timeline (docs/upgrades/dropmedia140.md), in one check. Synthetic
// OS drops (DataTransfer files, as dev/checks/dragdrop.js does) on the timeline's canvas, at the clientX of a known time:
//   1. while dragging: a ghost bar per item, with its name, drawn on the timeline; nothing in the scene changes
//   2. a picture dropped at a bar → a picture layer from that bar to the next cue, with a fade in and out, in the
//      "Dropped" group; its file is one of the scene's references
//   3. a clip dropped → a footage layer at the drop (on a beat), as long as the clip (3 s), its "Starts at" there
//   4. three pictures dropped together → one after another, each on its own bar, one bar long
//   5. Alt+drop → exactly where it was dropped (off the grid)
//   6. each drop is ONE Ctrl/⌘+Z (the 3 pictures go together, the drop before them stays)
//   7. a song dropped while the scene has one asks "Use as the scene's song?" first (Cancel: the song stays)
// Only the check's own temp data (smoke.js), a picture it draws itself and the tiny fixture clip; never an owner's scene.
//   ffmpeg -f lavfi -i testsrc2=size=160x90:rate=25 -t 3 -c:v libvpx /tmp/hearth-dropmedia140-clip.webm
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/dropmedia140.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const CLIP = '/tmp/hearth-dropmedia140-clip.webm';
const png = (name, color) => { const c = document.createElement('canvas'); c.width = 24; c.height = 16; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 24, 16); const b = atob(c.toDataURL('image/png').split(',')[1]); return new File([Uint8Array.from(b, (ch) => ch.charCodeAt(0))], name, { type: 'image/png' }); };
const dtWith = (...files) => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); return dt; };

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const CODE = "import * as THREE from 'three';\nconst P = tweak({ glow: [0.5, 0, 2] });\nconst renderer = new THREE.WebGLRenderer({ alpha: true });\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.append(renderer.domElement);\nrenderer.setAnimationLoop(() => renderer.clear());";
  const sk = SC.create({ name: 'Drop media check', code: CODE, layers: [ThreeLayers.defaults({ id: 'dmBase', name: 'Base', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4, 60000);
  P.setView(null);
  const beat = 60 / P.bpm; const bar = beat * (P.beatsPerBar || 4); const db = P.downbeat || 0;
  const onGrid = (t, unit) => { const k = (t - db) / unit; return Math.abs(k - Math.round(k)) < 0.004; };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  // a long section, a bar a little into it, a cue two bars later (so the next cue comes before the section's end)
  const sec = P.analysis.sections.find((s) => s.end - s.start >= bar * 4 && s.start > bar) || P.analysis.sections[1];
  const at1 = db + Math.ceil((sec.start - db) / bar + 0.01) * bar;
  const cueT = Math.round((at1 + bar * 2) * 1000) / 1000;
  P.editCues({ add: [{ time: cueT, name: 'Hit' }] });
  step('the fixture song loads, a cue two bars after the drop', P.cues.some((c) => near(c.time, cueT, 0.01)), { bpm: P.bpm, section: `${sec.label} ${sec.start.toFixed(2)}–${sec.end.toFixed(2)}`, drop: at1.toFixed(3), cue: cueT });

  const canvas = P.el.querySelector('.mb-tl-wrap canvas');
  const fire = (type, dt, t, o = {}) => { const r = canvas.getBoundingClientRect(); const ev = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + P._keysGeo().X(t), clientY: r.top + r.height / 2, altKey: Boolean(o.alt) }); canvas.dispatchEvent(ev); return ev; };
  const ids = () => hk.layers().map((x) => x.id);
  const L = (id) => hk.layerById(id);
  const newOnes = (before) => ids().filter((id) => !before.includes(id)).map(L);
  const zKey = async () => { hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })); await wait(600); };
  const dropped = async (dt, t, o = {}) => { const before = ids(); const n0 = LabDropMedia.stats.drops; fire('dragover', dt, t, o); fire('drop', dt, t, o); await until(() => LabDropMedia.stats.drops > n0, 20000); await wait(400); return newOnes(before); };

  // ---------- 1. the ghost bars while dragging ----------
  const sun = png('sunset.png', '#ff7a3d');
  let ev = fire('dragover', dtWith(sun), at1 + 0.05);
  await until(() => typeof LabDropMedia !== 'undefined', 15000);
  const ids0 = ids();
  ev = fire('dragover', dtWith(sun), at1 + 0.05);
  await wait(300);
  const g1 = LabDropMedia.ghosts;
  step('dragging a picture over the timeline: a ghost bar with its name, from the bar to the cue (drawn, nothing added)', ev.defaultPrevented && g1?.length === 1 && g1[0].name === 'sunset' && near(g1[0].a, at1) && near(g1[0].b, cueT) && LabDropMedia.stats.ghostDraws > 0 && ids().length === ids0.length, g1);
  ev = fire('dragover', dtWith(png('a.png', '#f00'), png('b.png', '#0f0'), png('c.png', '#00f')), at1 + 0.05);
  await wait(200);
  const g3 = LabDropMedia.ghosts;
  step('…three pictures: three ghosts, one per bar', g3?.length === 3 && g3.map((g) => g.name).join() === 'a,b,c' && g3.every((g, i) => near(g.a, at1 + i * bar)), g3?.map((g) => [g.name, g.a]));
  canvas.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body }));
  await wait(100);
  step('…leaving the timeline clears them', !LabDropMedia.ghosts);

  // ---------- 2. a picture dropped at a bar ----------
  const steps0 = LabDirect.steps.length;
  const p1 = await dropped(dtWith(sun), at1 + 0.05);
  const A = p1[0];
  const refs = ThreeLab.refsOf(sk.id);
  step('a picture dropped at a bar → a picture layer from that bar to the next cue, fading in and out', p1.length === 1 && near(A.in, at1) && near(A.out, cueT) && A.fadeIn > 0 && A.fadeOut > 0 && /refTexture\('/.test(A.code), A && { name: A.name, in: A.in, out: A.out, fadeIn: A.fadeIn, fadeOut: A.fadeOut });
  step('…in the "Dropped" group, its file one of the scene\'s references', A?.group?.name === 'Dropped' && refs.some((r) => r.kind === 'image' && A.code.includes(`refTexture('${r.key}')`)), { group: A?.group, refs: refs.map((r) => r.key) });
  step('…one undo step', LabDirect.steps.length === steps0 + 1, LabDirect.steps.slice(-2));

  // ---------- 3. a clip: footage of its own length ----------
  const b64 = await window.hub.fs.read(CLIP, { encoding: 'base64' });
  const clip = new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], 'city clip.webm', { type: 'video/webm' });
  const t2 = cueT + bar * 2 + beat * 1.1;
  const p2 = await dropped(dtWith(clip), t2);
  const V = p2[0];
  const from = V ? await until(() => hk.ctlOf(V.id)?.controls().find((c) => c.key === 'from')?.value, 8000) : null;
  step('a clip dropped → a footage layer at the drop (on a beat), as long as the clip (3 s)', p2.length === 1 && onGrid(V.in, beat) && near(V.in, t2, beat / 2 + 0.01) && near(V.out - V.in, 3, 0.15) && /A clip dropped on the timeline/.test(V.code) && V.group?.name === 'Dropped', V && { name: V.name, in: V.in, out: V.out });
  step('…its own time starts at the bar ("Starts at")', from != null && near(from, V.in, 0.01), { from });

  // ---------- 4. three pictures, one per bar ----------
  const t3 = V.out + bar * 2 + beat * 0.6;
  const steps3 = LabDirect.steps.length;
  const p3 = await dropped(dtWith(png('one.png', '#f0a'), png('two.png', '#0af'), png('three.png', '#af0')), t3);
  const s3 = p3.slice().sort((x, y) => x.in - y.in);
  step('three pictures dropped → laid out one after another, each starting on a bar, one bar long', p3.length === 3 && s3.every((x) => onGrid(x.in, bar) && near(x.out - x.in, bar)) && s3.every((x, i) => i === 0 || near(x.in, s3[i - 1].out)) && near(s3[0].in, t3, bar / 2 + 0.01), s3.map((x) => [x.name, x.in, x.out]));
  step('…all in the one "Dropped" group, as ONE undo step', p3.every((x) => x.group?.id === A.group.id) && LabDirect.steps.length === steps3 + 1);

  // ---------- 5. Alt: free placement ----------
  const t5 = s3[2].out + bar * 2 + beat * 0.37;
  const p5 = await dropped(dtWith(png('free.png', '#888')), t5, { alt: true });
  const px = 1 / Math.max(1e-6, P._keysGeo().X(t5 + 1) - P._keysGeo().X(t5)); // one pixel of the timeline, in seconds (a drop lands on a whole pixel)
  step('Alt+drop → exactly where it was dropped (to the pixel, off the beat grid)', p5.length === 1 && near(p5[0].in, t5, px * 1.5) && !onGrid(p5[0].in, beat), p5[0] && { at: t5, in: p5[0].in, px });

  // ---------- 6. each drop is one Ctrl/⌘+Z ----------
  const has = (x) => ids().includes(x.id);
  await zKey();
  step('Ctrl/⌘+Z → the Alt drop is gone, the rest stays', !has(p5[0]) && p3.every(has) && has(V) && has(A));
  await zKey();
  step('Ctrl/⌘+Z again → the three pictures go together, the clip stays', p3.every((x) => !has(x)) && has(V) && has(A));
  await zKey(); await zKey();
  step('two more → the clip, then the first picture: the scene as it was', !has(V) && !has(A) && ids().join() === ids0.join(), ids());

  // ---------- 7. a song asks first ----------
  const song0 = P.info().file;
  const before7 = ids();
  fire('dragover', dtWith(new File(['x'], 'other song.mp3', { type: 'audio/mpeg' })), bar * 2);
  await wait(200);
  const g7 = LabDropMedia.ghosts;
  fire('drop', dtWith(new File(['x'], 'other song.mp3', { type: 'audio/mpeg' })), bar * 2);
  const dlg = await until(() => document.querySelector('dialog.ui-modal[open]'), 5000);
  const ask = dlg?.textContent || '';
  step('a song dropped while the scene has one → "Use as the scene\'s song?" first (its ghost says 🎵)', /Use as the scene.s song\?/.test(ask) && g7?.[0]?.kind === 'audio', ask.slice(0, 160));
  [...(dlg?.querySelectorAll('button') || [])].find((b) => b.textContent === 'Cancel')?.click();
  await wait(600);
  step('…Cancel: the song and the layers stay', P.info().file === song0 && ids().join() === before7.join() && LabDropMedia.stats.asked === 1, { file: P.info().file });
  SC.remove?.(sk.id);
} catch (err) { step('no exception', false, String(err?.stack || err).slice(0, 600)); }

out.ok = !out.problems;
out.summary = `${out.steps.filter((s) => s.startsWith('✓')).length}/${out.steps.length} steps`;
return JSON.stringify(out, null, 1);
