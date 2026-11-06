// (round 133, campath133) ✎ Draw a camera path (docs/upgrades/campath133.md), in one check, with real mouse input:
//   1. 🎥 Camera moves › ✎ Draw a camera path puts the preview in path mode (the overlay and the small path bar); the
//      path is set over the song's first Drop (⋯ › over what); 3 points: a click, a drag to look around + a click, ＋ Point
//   2. the curve overlay: a dot per point, the curve through them
//   3. the keys: spread over the Drop section, each on a bar line
//   4. dragging a dot re-keys the move: one undo step, and one undo puts the path back exactly
//   5. Esc leaves path mode (the overlay goes, the moves play again)
//   6. the camera at time t is on the curve: at a point's time where that point's view stood, between points where
//      CamCore.pathView puts it
//   7. renders read the keys: export-page stills at the same time are identical, at another point's time different;
//      saved with the scene; and /camera-moves path … (what a chat or a director sends) is one more undo step
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/campath133.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const r3 = (x) => Math.round(x * 1000) / 1000;
const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
const click = async (x, y) => { x = Math.round(x); y = Math.round(y); await mouse({ type: 'mouseMoved', x, y, button: 'none' }); await mouse({ type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await mouse({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); };
const drag = async (x0, y0, x1, y1, n = 8) => { await mouse({ type: 'mouseMoved', x: Math.round(x0), y: Math.round(y0), button: 'none' }); await mouse({ type: 'mousePressed', x: Math.round(x0), y: Math.round(y0), button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= n; i++) { await mouse({ type: 'mouseMoved', x: Math.round(x0 + ((x1 - x0) * i) / n), y: Math.round(y0 + ((y1 - y0) * i) / n), button: 'left', buttons: 1 }); await wait(16); } await mouse({ type: 'mouseReleased', x: Math.round(x1), y: Math.round(y1), button: 'left', buttons: 0, clickCount: 1 }); };

try {
  activate('tool:three');
  const c = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.stageHooks?.player && typeof LabCamera !== 'undefined' && LabCamera.hooks(), 60000);
  const SKETCH = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#10141c');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshNormalMaterial());
cube.rotation.set(0.5, 0.6, 0); scene.add(cube);
scene.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 8, 64), new THREE.MeshNormalMaterial()));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
  ThreeLab.openCode(SKETCH);
  await wait(2500);
  const sceneId = ThreeLab.scenes.currentId();
  const r0 = await c.loadSong(SONG);
  const P = ThreeLab.stageHooks.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4, 60000);
  step('the fixture song loads and is analysed (sections)', r0?.ok && P.analysis?.sections?.length >= 4, { ok: r0?.ok, sections: P.analysis?.sections?.length });
  const D = ThreeLab.director;
  const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
  const camState = async () => JSON.parse((await ev('JSON.stringify(window.__labCam.state())')) || 'null');
  const gest = async () => JSON.parse((await ev('JSON.stringify(window.__labGest.state())')) || 'null');
  const layerOf = () => ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sceneId))[0];
  const pathOf = () => (layerOf()?.camMoves || []).find((m) => m.kind === 'path') || null;
  // the camera where the moves put it at a playhead time (paused): wait for a frame drawn after the seek
  const poseAt = async (t) => { const n0 = (await camState())?.applied || 0; c.seek(t); await wait(250); await until(async () => (await camState()).applied > n0 + 1, 2500); const s = await camState(); return Object.values(s?.pose || {})[0] || null; };
  // the look-around view drawn now (path mode: what a point records)
  const viewPose = async (want) => { await until(async () => { const g = await gest(); const v = g?.views?.[0]; return v && Math.abs(v.yaw - want.yaw) < 1e-6 && Math.abs(v.s - want.s) < 1e-6; }, 3000); const a0 = (await gest())?.applied || 0; await until(async () => (await gest()).applied > a0, 2000); return (await gest())?.pose?.slice(0, 3) || null; };
  await until(async () => (await LabCamera.ask('info')).ok, 15000);

  // ---------- 1. path mode from the menu row; over the first Drop; 3 points ----------
  const row = LabCamera.menuItems().find((i) => i && i !== '-' && /Draw a camera path/.test(i.label));
  row?.action();
  await until(() => typeof CamPath !== 'undefined' && CamPath.on && document.querySelector('.cpath-over') && document.querySelector('.cpath-bar'), 15000);
  const bar = document.querySelector('.cpath-bar');
  step('🎥 Camera moves › ✎ Draw a camera path: path mode (the overlay on the preview, one small path bar)', Boolean(row) && CamPath?.on && Boolean(document.querySelector('.cpath-over svg')) && bar && bar.getBoundingClientRect().height < 56, { row: row?.label, h: bar && Math.round(bar.getBoundingClientRect().height) });
  document.querySelector('.cpath-morebtn').click(); await wait(150);
  const drop = CamPath.ranges().find((r) => r.section && r.name === 'Drop');
  const sel = document.querySelector('.cpath-range');
  if (sel && drop) { sel.value = drop.id; sel.dispatchEvent(new Event('change')); }
  document.querySelector('.cpath-morebtn').click(); await wait(100);
  step('⋯ › over what: the song’s first Drop (a section from the song’s analysis), the fold closes again', Boolean(drop) && CamPath.state.range === drop.id && document.querySelector('.cpath-more').hidden, { drop, range: CamPath.state.range });

  const ov = () => document.querySelector('.cpath-over').getBoundingClientRect();
  const B = () => { const r = ov(); const b = CamPath.box(); return { ...b, x: (u) => r.left + b.cx + u * b.R, y: (u) => r.top + b.cy + u * b.R }; };
  const u0 = LabCamera.undoDepth;
  const poses = [];
  // point 1: a click on the picture (the scene's own camera)
  await click(B().x(0.9), B().y(-0.8)); await wait(300);
  poses.push([0, 0, 6]);
  // point 2: drag to look around, then click
  { const b = B(); await drag(b.x(0.2), b.y(-0.7), b.x(0.2) - 45, b.y(-0.7) - 12); await wait(200); }
  const v2 = CamPath.state.cur;
  poses.push(await viewPose(v2));
  await click(B().x(0.9), B().y(-0.8)); await wait(300);
  // point 3: drag further and the wheel closer, then ＋ Point
  { const b = B(); await drag(b.x(0.2), b.y(-0.7), b.x(0.2) - 50, b.y(-0.7) + 6); await wait(150); await mouse({ type: 'mouseWheel', x: Math.round(b.x(0.5)), y: Math.round(b.y(-0.5)), deltaX: 0, deltaY: -150 }); await wait(250); }
  const v3 = CamPath.state.cur;
  poses.push(await viewPose(v3));
  document.querySelector('.cpath-add').click(); await wait(300);
  let m = pathOf();
  step('3 points: a click, a look around + click, ＋ Point → one camera path move on the layer (2 undo steps: it exists from the 2nd point)', m?.pts?.length === 3 && Math.abs(m.pts[1].v.yaw - v2.yaw) < 1e-3 && m.pts[2].v.s < 0.95 && LabCamera.undoDepth === u0 + 2, { pts: m?.pts?.map((p) => [p.t, r3(p.v.yaw), r3(p.v.pitch), r3(p.v.s)]), undo: LabCamera.undoDepth - u0 });

  // ---------- 2. the curve overlay ----------
  {
    await wait(400);
    const dots = [...document.querySelectorAll('.cpath-dot')];
    const line = document.querySelector('.cpath-curve');
    const pts = (line?.getAttribute('points') || '').trim().split(/\s+/).map((s) => s.split(',').map(Number));
    const b = CamPath.box();
    const at = (g) => { const tr = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform')); return [Number(tr[1]), Number(tr[2])]; };
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
    const curveHas = (q) => pts.some((p) => near(p, q));
    step('the overlay: a dot per point, the curve (Catmull-Rom) drawn through every dot', dots.length === 3 && pts.length > 40 && dots.every((g) => curveHas(at(g))) && near(pts[0], at(dots[0])) && near(pts[pts.length - 1], at(dots[2])), { dots: dots.map(at).map((p) => p.map(Math.round)), samples: pts.length, R: Math.round(b.R) });
  }

  // ---------- 3. the keys: over the Drop, on bar lines ----------
  {
    const tl = P.timeline(); const g = tl.grid || {};
    const bpm = g.bpm || P.analysis.bpm; const bar = ((g.beatsPerBar || 4) * 60) / bpm; const db = g.downbeat ?? P.analysis.beats?.[P.analysis.downIndex || 0] ?? 0;
    const onBar = (t) => { const k = (t - db) / bar; return Math.abs(k - Math.round(k)) < 2e-3; };
    step('the keys are spread over the Drop section and each lands on a bar line', m.pts[0].t === drop.a && Math.abs(m.pts[2].t - drop.b) < bar && m.pts.every((p) => p.t >= drop.a - 1e-3 && p.t <= drop.b + 1e-3 && onBar(p.t)) && m.pts[1].t > m.pts[0].t && m.pts[2].t > m.pts[1].t, { drop: [drop.a, drop.b], keys: m.pts.map((p) => p.t), bar: r3(bar), downbeat: r3(db) });
  }

  // ---------- 4. drag a dot: re-keyed, one undo step ----------
  {
    const before = JSON.stringify(pathOf());
    const u1 = LabCamera.undoDepth;
    const r = document.querySelector('.cpath-dot[data-i="1"]').getBoundingClientRect();
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    await drag(x, y, x + 40, y + 14); await wait(400);
    const after = pathOf();
    const moved = after && Math.abs(after.pts[1].v.yaw - m.pts[1].v.yaw) > 0.05 && after.pts.map((p) => p.t).join() === m.pts.map((p) => p.t).join();
    step('drag dot 2: that point moves (same key times), the curve follows, ONE undo step', moved && LabCamera.undoDepth === u1 + 1 && document.querySelectorAll('.cpath-dot').length === 3, { yaw: [r3(m.pts[1].v.yaw), r3(after?.pts[1].v.yaw)], s: [r3(m.pts[1].v.s), r3(after?.pts[1].v.s)], undo: LabCamera.undoDepth - u1 });
    P.undo(); await wait(300); // (the timeline's Ctrl/⌘+Z)
    step('…and one Ctrl/⌘+Z (the timeline’s undo) puts the path back exactly', JSON.stringify(pathOf()) === before, pathOf()?.pts?.[1]?.v);
    m = pathOf();
  }

  // ---------- 5. Esc leaves ----------
  {
    await mouse({ type: 'mouseMoved', x: Math.round(B().x(0.9)), y: Math.round(B().y(-0.8)), button: 'none' });
    await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 } });
    await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 } });
    await until(() => !CamPath.on, 4000);
    step('Esc leaves path mode: the overlay and the bar go, the path stays', !CamPath.on && !document.querySelector('.cpath-over') && !document.querySelector('.cpath-bar') && pathOf()?.pts?.length === 3);
  }

  // ---------- 6. the camera at time t is on the curve ----------
  {
    const d = m.d;
    const posOf = (v) => [d * v.s * Math.cos(v.pitch) * Math.sin(v.yaw), -d * v.s * Math.sin(v.pitch), 6 - d + d * v.s * Math.cos(v.pitch) * Math.cos(v.yaw)];
    const dist = (p, q) => (p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : 99);
    const at2 = await poseAt(m.pts[1].t + 1e-4);
    const at3 = await poseAt(m.pts[2].t + 0.5);
    const tm = (m.pts[0].t + m.pts[1].t) / 2; const atm = await poseAt(tm);
    const want = posOf(CamCore.pathView(m, tm));
    step('the camera at a point’s time stands where that point was looked from (2 and, held after, 3)', dist(at2, poses[1]) < 2e-3 && dist(at3, poses[2]) < 2e-3, { at2: at2?.slice(0, 3).map(r3), p2: poses[1]?.map(r3), at3: at3?.slice(0, 3).map(r3), p3: poses[2]?.map(r3) });
    step('…and between points it follows the curve (CamCore.pathView at that time)', dist(atm, want) < 2e-3 && dist(atm, poses[0]) > 0.05 && dist(atm, poses[1]) > 0.05, { t: r3(tm), cam: atm?.slice(0, 3).map(r3), curve: want.map(r3) });
  }

  // ---------- 7. renders read the keys; saved; the words a chat or director sends ----------
  {
    const T = [m.pts[1].t, m.pts[2].t + 0.5, m.pts[1].t];
    try {
      const fr = (await LabExport.probe({ w: 96, h: 54, F: 30, n: T.length, times: (j) => T[j] })).frames;
      const same = (p, q) => { const a = new Uint8Array(p); const b = new Uint8Array(q); return a.length === b.length && a.every((v, j) => v === b[j]); };
      step('a render’s stills (the export page) read the keys: the same time twice = identical, another point = different', fr.length === 3 && same(fr[0], fr[2]) && !same(fr[0], fr[1]), { frames: fr.length });
    } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
    await wait(1500);
    const disk = await window.hub.kvGet('three-sketches', []);
    const sk = (disk || []).find((s) => s.id === sceneId);
    step('saved with the scene: the path move and its 3 keyframes (what renders, the sequence and ◉ Perform\'s Stage read)', sk?.layers?.some((L) => L.camMoves?.some((x) => x.kind === 'path' && x.pts.length === 3)));
    const u2 = LabCamera.undoDepth;
    let said = '';
    await Commands.tryRun('/camera-moves path 0 0 1, 0 -5 0.7, 120 -20 0.5 over the drop per section shake 30%', H.claudeAgent().id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); }, error: (t) => { said = `error: ${t}`; } });
    await wait(300);
    const pm = pathOf();
    step('/camera-moves path … (a chat or director, through three_do run): the path re-made over the Drop, shake on the kick, one undo step', pm?.pts?.length === 3 && pm.kick === 0.3 && pm.t0 === drop.a && Math.abs(pm.pts[2].v.yaw - (120 * Math.PI) / 180) < 1e-3 && LabCamera.undoDepth === u2 + 1, { said, t: pm?.pts?.map((p) => p.t), undo: LabCamera.undoDepth - u2 });
  }
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
