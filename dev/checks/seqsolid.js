// Seqsolid (round 29): the Lab sequence must not "bug out", above all "during frame swapping". A stress run on WebGL
// scenes (each a flat color, its own renderer): playing through cuts and cross-fades while the page samples its own
// picture (window.__seqWatch), rapid scrubbing back and forth across cuts, rapid scene switches (each scene's own
// sequence takes the view), frame-size swaps while playing, a scene re-run (its code changed) while it plays, a scene
// that throws mid-sequence, an auto-edit (🎬) sequence, and the export page's frame for a time against the preview's.
// It asserts: the right scene on screen for the time, no black frames beyond a cross-fade, no WebGL context leak, no
// stuck "loading", errors on the right clip, export = preview.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/seqsolid.js
const { step } = J;
const { wait, until } = SQL;
const Q = ThreeSeq;
const sbx1 = (code) => ThreeLab.director.evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
const out = {};

// ---------- the scenes: WebGL, a flat color each (a "boom" one throws in its frame loop after 0.4 s of its own time) ----------
const GL = (hex, extra = '') => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('${hex}');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
function frame() { requestAnimationFrame(frame); ${extra} renderer.render(scene, camera); }
frame();`;
const COL = { 'Solid Red': [255, 0, 0], 'Solid Green': [0, 255, 0], 'Solid Blue': [0, 0, 255], 'Solid Boom': [255, 255, 0], 'Solid Teal': [0, 255, 255] };
await SQL.lab();
const S = ThreeLab.scenes;
const mk = (name, extra = '') => { const hex = `#${COL[name].map((v) => v.toString(16).padStart(2, '0')).join('')}`; const x = S.all().find((s) => s.name === name); if (x) return x.id; return S.create({ name, code: GL(hex, extra) }).id; };
const ids = { red: mk('Solid Red'), green: mk('Solid Green'), blue: mk('Solid Blue'), teal: mk('Solid Teal'), boom: mk('Solid Boom', "if (performance.now() > 400) throw new Error('seqsolid boom');") };
S.open(ids.red); await wait(1500);
// the Lab's errors as the hub got them (the layer each one names)
const labErrs = [];
addEventListener('hearth:lab-error', (e) => labErrs.push({ ...e.detail, T: Q.time, view: Q.active }));

// what a color is (null: none of the scenes; 'black'; a mix inside a cross-fade)
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 90;
const nameOf = (rgb) => { if (rgb[0] + rgb[1] + rgb[2] < 40) return 'black'; for (const [n, c] of Object.entries(COL)) if (near(rgb, c)) return n; return 'mix'; };
const clipName = (id) => { const e = Q.edit; return e?.clips.find((c) => c.id === id)?.name || null; };
// a run of samples: the ones that show the wrong scene, black ones outside a transition, black runs inside one
function judge(log, { skip = 0 } = {}) {
  const bad = []; const black = []; let n = 0; let held = 0; let run = 0; let longest = 0;
  for (const s of log) {
    if (s.t < skip) continue;
    n += 1;
    // the picture held on top while a clip that hasn't drawn yet loads (instead of black): fine, if short
    if (s.hold) { held += 1; run = run || s.t; longest = Math.max(longest, s.t - run); continue; }
    run = 0;
    const got = nameOf(s.rgb);
    if (s.show) {
      const want = clipName(s.show);
      if (!want || !COL[want]) continue; // (a title, footage…)
      if (got === 'black') black.push(s); else if (got !== want) bad.push({ ...s, got, want });
    } else if (s.from) {
      // a cross-fade: either side or a mix; black only for a dip
      const tr = Q.edit?.clips.find((c) => c.id === s.to)?.trans?.type || '';
      if (got === 'black' && !/dip|black|fade/.test(tr) && s.p > 0.08 && s.p < 0.92) black.push({ ...s, tr });
    }
  }
  return { n, held, heldMs: longest, bad: bad.slice(0, 8), badN: bad.length, black: black.slice(0, 8), blackN: black.length };
}
const health = () => sbx('return window.__labHealth()');
const info = () => sbx('return window.__seqInfo()');
// layers on the page that belong to no mounted clip (left behind by a load that came back too late)
const orphans = () => sbx("return window.__seqLayers().filter((l) => l.group && !window.__seqInfo().mounted.includes(l.group)).map((l) => l.id)");

// ---------- 1. the sequence: cuts, a dissolve, a wipe, a dip, the boom scene, 13 s ----------
await Q.create('Solid seq', { empty: true, format: '9:16', show: true });
const c = {};
c.red = await Q.add({ sketch: ids.red }, { dur: 2, trans: null });
c.green = await Q.add({ sketch: ids.green }, { dur: 2, trans: { type: 'dissolve', dur: 0.6 } });
c.blue = await Q.add({ sketch: ids.blue }, { dur: 2, trans: null });
c.teal = await Q.add({ sketch: ids.teal }, { dur: 2, trans: { type: 'wipe-left', dur: 0.5 } });
c.boom = await Q.add({ sketch: ids.boom }, { dur: 2, trans: null });
c.red2 = await Q.add({ sketch: ids.red }, { dur: 2, trans: { type: 'dissolve', dur: 0.5 } });
c.blue2 = await Q.add({ sketch: ids.blue }, { dur: 1, trans: null });
await until(() => Q.active, 5000); await wait(1500);
// each clip's time on the sequence (transitions overlap): its middle, out of any transition
const tm = Object.fromEntries(ThreeSeqData.timing(Q._S.edit).map((x) => [x.clip.id, x]));
const mid = (id) => { const x = tm[id]; return Math.round(((x.start + (x.td || 0)) + x.end) / 2 * 30) / 30; };
const DUR = Q.compile(Q._S.edit).plan.dur;
out.times = Object.fromEntries(Object.entries(c).map(([k, id]) => [k, [tm[id].start, tm[id].end]]));
const h0 = await health();
out.h0 = h0;

// ---------- 2. play it through while the page samples itself ----------
Q.seek(0); await Q.settle(); await wait(600);
await sbx('return window.__seqWatch.start({ every: 50 })');
Q.play(true);
await until(() => !Q.playing && Q.time > DUR - 0.2, 20000);
const log1 = JSON.parse(await sbx('return JSON.stringify(window.__seqWatch.stop())'));
const j1 = judge(log1);
out.play = { ...j1, samples: log1.length };
step('playing through: the right scene for the time (cuts, dissolves, a wipe)', j1.badN <= 2, j1);
step('playing through: no black frames outside a cross-fade (a clip still loading holds the last picture, briefly)', j1.blackN === 0 && j1.heldMs < 2500, j1.black);
const h1 = await health();
out.h1 = h1;

// ---------- 3. rapid scrubbing back and forth across cuts ----------
const T0 = [1.3, 1.7, 3.3, 3.5, 3.2, 5.0, 4.8, 7.0, 6.8, 8.5, 8.3, 10.5, 10.3, 2.0, 11.3, 0.2, 6.0];
await sbx('return window.__seqWatch.start({ every: 40 })');
for (let r = 0; r < 3; r++) for (const t of T0) { Q.seek(t + r * 0.03); await wait(25); }
Q.seek(mid(c.blue)); await Q.settle(); await wait(900);
const log2 = JSON.parse(await sbx('return JSON.stringify(window.__seqWatch.stop())'));
const p2 = await SQL.probe(); const i2 = await info();
out.scrub = { at: nameOf(p2.center), info: i2, orphans: await orphans(), judge: judge(log2.slice(-8)) };
step('scrubbing fast across cuts: it lands on the last place (blue)', nameOf(p2.center) === 'Solid Blue' && Math.abs(i2.T - mid(c.blue)) < 0.05, out.scrub);
step('…no layer left behind by a load that came back late', !out.scrub.orphans.length, out.scrub.orphans);
const h2 = await health();
out.h2 = h2;
step('…no WebGL context leak (contexts ≤ the clips around the playhead + the pool)', h2.contexts <= i2.mounted.length + 1, { h2, mounted: i2.mounted });

// ---------- 4. a scene that throws mid-sequence: the error is told on its clip ----------
const errOf = (cid) => labErrs.filter((e) => String(e.layer || '').startsWith(`${cid}~`));
const before = labErrs.length;
Q.seek(tm[c.boom].start + 0.05); await Q.settle(); Q.play(true); await wait(1600); Q.play(false); await wait(300);
const mine = errOf(c.boom); const others = labErrs.slice(before).filter((e) => !String(e.layer || '').startsWith(`${c.boom}~`));
out.boom = { mine: mine.length, others: others.slice(0, 4), mark: Q._S.errs ? [...Q._S.errs.keys()] : null };
step('a scene that throws mid-sequence: its errors name its clip (no other clip blamed)', mine.length > 0 && !others.length, out.boom);
step('…and the timeline marks that clip (⚠ on the clip)', Q._S.errs?.has(c.boom) && !Q._S.errs?.has(c.red), out.boom.mark);
step('…the clips after it still play (red, then blue)', nameOf((await SQL.at(Math.round(mid(c.red2) * 30))).center) === 'Solid Red' && nameOf((await SQL.at(Math.round(mid(c.blue2) * 30))).center) === 'Solid Blue');

// ---------- 5. a scene re-run while it plays (its code changed: a director edit) ----------
Q.seek(tm[c.green].start + 0.7); await Q.settle(); await wait(500);
await sbx('return window.__seqWatch.start({ every: 30 })');
Q.play(true); await wait(250);
const g0 = S.get(ids.green); const code0 = g0.code;
g0.code = `${code0}\n// edit ${Date.now()}`; if (g0.layers?.[0]) g0.layers[0].code = g0.code; S.changed(ids.green);
await wait(900); Q.play(false);
const log5 = JSON.parse(await sbx('return JSON.stringify(window.__seqWatch.stop())'));
const j5 = judge(log5);
out.rerun = j5;
step('a scene re-run while it plays: no black frame while the new version starts', j5.blackN === 0 && j5.badN === 0, j5);

// ---------- 6. frame-size swaps while playing ----------
const size = (id) => Commands.tryRun(`/size ${id}`, H.claudeAgent().id);
Q.seek(0.2); await Q.settle(); Q.play(true); await wait(300);
for (const id of ['16:9', '1:1', 'fit', '9:16']) { size(id); await wait(600); }
await until(() => Q._S.L.pageReady?.() !== false, 8000); await wait(600);
await sbx('return window.__seqWatch.start({ every: 40 })');
await wait(2500);
const log6 = JSON.parse(await sbx('return JSON.stringify(window.__seqWatch.stop())'));
const j6 = judge(log6); const i6 = await info();
out.sizes = { j6, i6, playing: Q.playing };
step('frame swaps while playing: it plays on, the right scene for the time, no black', i6.playing && Q.playing && j6.badN === 0 && j6.blackN === 0 && j6.n > 5, out.sizes);
Q.play(false); await wait(400);

// ---------- 7. rapid scene switches (each scene's own sequence takes the view) ----------
for (const k of ['green', 'blue', 'teal', 'green', 'red']) { S.open(ids[k]); await wait(70); }
await wait(2500);
await until(async () => (await info())?.on, 8000);
const i7 = await info(); const plan7 = await sbx('return JSON.stringify(window.__seqPlan().groups.map((g) => g.id))');
const want7 = JSON.stringify(Q.compile(Q._S.edit).plan.groups.map((g) => g.id));
out.switch = { key: Q.key, owner: Q.owner, scene: Q._S.edit?.seq?.scene, cur: S.currentId(), page: plan7, want: want7 };
step('rapid scene switches: the last scene\'s own sequence is the one shown (hub and page agree)', Q.key && Q._S.edit?.seq?.scene === ids.red && Q.owner === ids.red && plan7 === want7 && i7.on, out.switch);
Q.seek(1); await Q.settle(); await wait(700);
step('…and it shows its picture (red at 1 s)', nameOf((await SQL.probe()).center) === 'Solid Red');

// a burst with no pause at all, then the scene on screen's own sequence again
for (const k of ['blue', 'teal', 'green', 'blue', 'red']) S.open(ids[k]);
await wait(2500);
const plan7b = await sbx('return JSON.stringify(window.__seqPlan().groups.map((g) => g.id))');
step('…a burst of switches with no pause: still the last scene\'s sequence, hub and page agree', Q._S.edit?.seq?.scene === ids.red && Q.owner === ids.red && plan7b === JSON.stringify(Q.compile(Q._S.edit).plan.groups.map((g) => g.id)), { scene: Q._S.edit?.seq?.scene, owner: Q.owner });

// ---------- 7b. quick edits while it plays: the page ends on the latest plan (no older plan landing last) ----------
Q.seek(0.3); await Q.settle(); Q.play(true); await wait(300);
const TYPES = ['dissolve', 'wipe-left', 'dip-black', 'push-left', 'zoom-in', 'dissolve', 'wipe-left', 'dissolve'];
for (const t of TYPES) { Q.setTransition(t, c.green, 0.6); await wait(15); }
Q.setLength(c.blue, 2.2); await wait(15); Q.undo(); await wait(15); Q.redo();
await wait(1500); Q.play(false); await wait(500);
const sig = (pl) => JSON.stringify(pl.groups.map((g) => [g.id, g.start, g.end, g.trans, g.td]));
const pagePlan = await sbx('return JSON.stringify(window.__seqPlan().groups.map((g) => [g.id, g.start, g.end, g.trans, g.td]))');
step('quick edits while playing: the page shows the latest plan', pagePlan === sig(Q.compile(Q._S.edit).plan), { page: pagePlan.slice(0, 200), want: sig(Q.compile(Q._S.edit).plan).slice(0, 200) });
Q.setLength(c.blue, 2); Q.setTransition('dissolve', c.green, 0.6); await wait(800); // (back to the times above)

// ---------- 8. ↻ Reload stays the backstop: back where it was ----------
Q.seek(mid(c.teal)); await Q.settle(); await wait(400);
document.querySelector('.sq-reload').click();
await wait(1200);
await until(async () => (await info())?.on && Math.abs((await info()).T - mid(c.teal)) < 0.05, 15000); await wait(1200);
step('↻ Reload: the preview comes back at the same frame (teal)', nameOf((await SQL.probe()).center) === 'Solid Teal', await info());

// ---------- 9. the export page's frame for a time = the preview's ----------
const xp = await LabExport.openPage({ w: 216, h: 384 });
const frameOn = async (page, T, n) => { const got = page.wait((m) => m.type === 'seq-frame' && m.n === n, 30000, 'a frame'); page.send({ type: 'seq-frame', n, T, w: 216, h: 384 }); const m = await got; if (m.error) return { error: m.error }; const bmp = await createImageBitmap(new Blob([m.buffer], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(216, 384); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(108, 250, 1, 1).data; return [d[0], d[1], d[2]]; };
const xs = [];
try {
  xp.send({ type: 'seq-set', plan: Q.compile(Q._S.edit).plan, id: 1 });
  const off = xp.wait((m) => m.type === 'seq-offline' && m.on, 30000, 'offline'); xp.send({ type: 'seq-offline', on: true }); await off;
  let n = 0;
  for (const T of [mid(c.red), tm[c.green].start + 0.3, mid(c.green), mid(c.blue), mid(c.teal), mid(c.red2), mid(c.blue2)]) {
    const ex = await frameOn(xp, T, (n += 1));
    const pv = (await SQL.at(Math.round(T * 30))).center;
    xs.push({ T, export: ex.error ? ex.error : nameOf(ex), preview: nameOf(pv) });
  }
} finally { xp.close(); }
out.export = xs;
step('the export page\'s frame for a time shows the preview\'s scene', xs.length === 7 && xs.every((x) => x.export === x.preview && (COL[x.preview] || x.preview === 'mix')), xs);

// ---------- 10. an auto-edit (🎬) sequence: on the song, cut on bars, Lab transitions and looks ----------
const AE_SONG = '/tmp/hearth-autoedit-song.wav';
await Q.leave(); await wait(800);
const lab = await SQL.lab();
await lab.loadSong(AE_SONG);
await until(() => lab.player.analysis?.sections?.length, 30000);
await until(() => document.querySelector('.mb-video') && !document.querySelector('.mb-video').hidden, 5000);
document.querySelector('.mb-video').click();
await until(() => AutoEdit.plan && document.querySelector('.ae-make'), 40000);
document.querySelector('.ae-make').click();
const made = await until(() => AutoEdit.key && !AutoEdit.busy && Q.active, 40000);
const ae = Q._S.edit; const aeT = ThreeSeqData.timing(ae);
out.ae = { made, clips: ae?.clips.length, trans: [...new Set(ae?.clips.map((x) => x.trans?.type).filter(Boolean))] };
step('🎬 an auto-edit sequence is made and shown', made && ae?.clips.length >= 4, out.ae);
await wait(1500);
// play across several cuts (the busiest part: the shortest clips) with the song
const busy = aeT.slice(1).reduce((best, x, i) => (x.end - x.start < best.len ? { len: x.end - x.start, at: aeT[Math.max(0, i - 1)].start } : best), { len: 1e9, at: 0 });
Q.seek(busy.at); await Q.settle(); await wait(800);
await sbx('return window.__seqWatch.start({ every: 50 })');
Q.play(true); await wait(5000); Q.play(false);
const logA = JSON.parse(await sbx('return JSON.stringify(window.__seqWatch.stop())'));
const blackA = logA.filter((x) => x.show && nameOf(x.rgb) === 'black').concat(logA.filter((x) => x.from && nameOf(x.rgb) === 'black' && x.p > 0.08 && x.p < 0.92 && !/dip|black|fade|flash|stutter/.test(Q._S.edit.clips.find((k) => k.id === x.to)?.trans?.type || '')));
const cutsA = new Set(logA.map((x) => x.show || x.to)).size;
out.aePlay = { samples: logA.length, cuts: cutsA, black: blackA.slice(0, 6) };
step('…it plays across its cuts on the song: no black frames', logA.length >= 5 && cutsA >= 2 && !blackA.length, out.aePlay);
// scrub across its cuts, then land
for (let r = 0; r < 2; r++) for (const x of aeT.slice(0, 10)) { Q.seek(x.start + 0.02); await wait(20); Q.seek(Math.max(0, x.start - 0.05)); await wait(20); }
const land = aeT[Math.min(3, aeT.length - 1)]; const landT = (land.start + (land.td || 0) + land.end) / 2;
Q.seek(landT); await Q.settle(); await wait(1200);
const pA = await SQL.probe(); const iA = await info(); const hA = await health();
out.aeScrub = { at: nameOf(pA.center), T: iA.T, want: landT, orphans: await orphans(), h: hA, mounted: iA.mounted };
step('…scrubbing across its cuts: it lands on a picture, nothing left behind, no context leak', nameOf(pA.center) !== 'black' && Math.abs(iA.T - Q._S.T) < 0.05 && !out.aeScrub.orphans.length && hA.contexts <= iA.mounted.length + 1, out.aeScrub);

// ---------- 11. nothing stuck, nothing leaked ----------
const h9 = await health(); const i9 = await info();
out.h9 = h9;
step('no WebGL context leak after all of it (contexts ≤ clips mounted + 1)', h9.contexts <= i9.mounted.length + 1 && h9.renderers <= i9.mounted.length + 1, { h9, mounted: i9.mounted });
const stuck = { cover: Boolean(document.querySelector('.scene-cover:not(.out)')), building: document.querySelectorAll('.ly-building').length, pill: Boolean(document.querySelector('.lab-build-pill.on, .build-pill.on')), restoring: Q._S.restoring > performance.now(), busy: Boolean(Q._S.restoreBusy), flash: document.querySelector('.sq-flash.on')?.textContent || '' };
step('no stuck "loading" (no cover, no building rows, no restore pending)', !stuck.cover && !stuck.building && !stuck.restoring && !/Reloading/.test(stuck.flash), stuck);

console.log('[seqsolid]', JSON.stringify(out));
return J.done();
