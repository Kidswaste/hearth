// (round 151, redux151) "Hearth Redux": the Lab's look in Forgeheart gold / ember on graphite, few controls in sight,
// the rest where you are, short pretty enter / exit motion, cheaper to draw (docs/upgrades/redux151.md). ONE check on
// realscene-lib's real scene (its own temp data, never an owner's scene), then smooth142's heavy fixture for the cost:
//   1. at rest (pointer away, 3 s): the essentials in sight (scene picker, ▶ Run, ▶ Play, ⋯; the timeline's ▶ and time;
//      the panels' titles, the selected layer's eye) and the secondary controls transparent but in place (same
//      element, data-feature kept, still hit by a click at their spot)
//   2. context: the Lab bar under the pointer brings its controls in (and only its), the timeline its tools, a layer
//      row its eye, the layers' panel its head buttons; keyboard focus brings a control in; I (and the command bar's
//      /stage show) brings every one in; a fold's tray opens over the timeline
//   3. motion: the way in is a staggered transition (120–220 ms, opacity / transform) with a gold → ember line drawn
//      across the area; a tray animates in (clip, line, rows) and fades out; nothing runs at rest or while the scene
//      plays; no infinite animation in the Lab's look; reduced motion and Hearth's Motion: calm turn it all off
//   4. palette: Forgeheart gold on the primary, ember playhead, graphite (neutral, not navy) panels, warm text, gold
//      stage corners
//   5. cost (smooth142's heavy layers, 480×270 … the Lab at 1600×1000): the window's composited layers and its paint /
//      layerize / composite ms a second, idle and while it plays, against round 150's numbers (BEFORE, measured with
//      this check's own probe on the round-150 build: smoke's --app with a copy of round 150; the check sees no Redux tokens
//      there and runs only this step)
//   pictures: <out>/redux151-rest.png, redux151-context.png (the timeline woken), redux151-anim.png (the Lab bar
//   coming in, frozen mid-way)
//   node dev/smoke.js --fake-engines --check-timeout 900000 --lib dev/checks/realscene-lib.js --script dev/checks/redux151.js
const out = { steps: [], measure: {} };
const DESC = async (nodes) => { const o = []; for (const x of nodes || []) { let who = String(x.node); try { const d = await smoke({ cdp: 'DOM.describeNode', params: { backendNodeId: x.node } }); const nd = d.node; if (nd) { const at = nd.attributes || []; const ci = at.indexOf('class'); who = `${nd.nodeName.toLowerCase()}${ci >= 0 ? `.${at[ci + 1].split(' ').slice(0, 2).join('.')}` : ''}`; } } catch { /* gone */ } o.push(`${who} ${x.n}× ${x.ms} ms`); } return o; };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(5000)]);
const SHOTS = window.REDUX151_SHOTS || '/tmp/hearth-checks';
const shot = (name) => smoke({ shot: `${SHOTS}/${name}.png` }).catch(() => {});
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none' });
const away = () => move(20, 520); // the left rail, away from the Lab
// round 150's numbers (this check's cost probe on the round-150 build, same box; see the doc)
// (three runs each: layers 38 / 45 every time; draw ms idle 6.7 · 9.0 · 7.6, playing 4.8 · 6.2 · 3.1: the medians; window task ms
// idle 31.5 · 27.8 · 25.4, playing 18.4 · 16.4 · 14.5)
const BEFORE = window.REDUX151_BEFORE || { idle: { layers: 38, drawMs: 7.6, taskMs: 27.8 }, play: { layers: 45, drawMs: 4.8, taskMs: 16.4 } };

// an element's opacity as seen: its own and its ancestors' multiplied
const seen = (n) => { let o = 1; for (let x = n; x && x.nodeType === 1; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return Math.round(o * 100) / 100; };
const drawn = (n) => Boolean(n?.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && n.getBoundingClientRect().width > 0);
const rgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const BACKDROP = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'varying vec2 v; void main() { v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform float t; varying vec2 v; void main() { vec3 c = vec3(0.0); vec2 p = v * 6.0; for (int i = 0; i < 4; i++) { p = vec2(sin(p.y + t), cos(p.x - t)) * 1.3 + p * 0.2; c += 0.03 * vec3(0.4 + 0.4 * sin(p.x), 0.3, 0.6 + 0.3 * cos(p.y)); } gl_FragColor = vec4(c * 0.6, 1.0); }' });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; renderer.render(scene, camera); });`;
const PARTICLES = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 7;
scene.add(new THREE.HemisphereLight('#ffffff', '#223344', 2.2));
const geo = new THREE.IcosahedronGeometry(0.035, 0); const mat = new THREE.MeshStandardMaterial({ color: '#7ab8ff', roughness: 0.4 });
const n = 6000; const mesh = new THREE.InstancedMesh(geo, mat, n); const m = new THREE.Matrix4(); let s = 7;
for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; const a = s / 2147483647; s = (s * 16807) % 2147483647; const b = s / 2147483647; s = (s * 16807) % 2147483647; const c = s / 2147483647; m.setPosition((a - 0.5) * 9, (b - 0.5) * 5, (c - 0.5) * 3); mesh.setMatrixAt(i, m); }
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = Math.sin(now / 2000) * 0.2; renderer.render(scene, camera); });`;
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const x of r.metrics || []) o[x.name] = x.value; return o; };
// the Lab's animations / transitions running (or finished but still holding their end: a composited layer for nothing)
// on something drawn (a display: none one's don't count); the playheads' glide is the song moving, not the look
const labAnims = () => document.getAnimations().filter((a) => {
  const held = a.playState === 'finished' && /forwards|both/.test(a.effect?.getComputedTiming?.().fill || '');
  if (a.playState !== 'running' && !held) return false;
  const t = a.effect?.target; if (!t || !t.isConnected || !t.getClientRects().length) return false;
  return Boolean(t.closest('.three-split, .three-toolbar, .rg-tray, .ih')) && !t.closest('.mb-playhead');
}).map((a) => `${a.animationName || a.transitionProperty || 'waapi'}@${a.effect.target.className?.baseVal ?? String(a.effect.target.className).slice(0, 24)}${a.effect.pseudoElement || ''}`);
async function cost(label, ms = 5000) {
  const layers = await smoke({ layers: true });
  const m0 = await metrics();
  await smoke({ trace: 'start' });
  const t0 = performance.now();
  await wait(ms);
  const tr = await smoke({ trace: 'stop', window: true });
  const sec = (performance.now() - t0) / 1000;
  const m1 = await metrics();
  const per = (k) => Math.round(((m1[k] - m0[k]) * 1000 / sec) * 10) / 10;
  const w = tr.window || {}; const ps = (v) => Math.round((v / sec) * 10) / 10;
  const drawMs = ps((w.paintMs || 0) + (w.layerizeMs || 0) + (w.compositeMs || 0));
  return { label, painted: await DESC(w.paintNodes), layers: layers.count, drawing: layers.drawing, layerPx: layers.px, drawMs, paintMsPerS: ps(w.paintMs || 0), paintsPerS: ps(w.paints || 0), layerizeMsPerS: ps(w.layerizeMs || 0), compositeMsPerS: ps(w.compositeMs || 0), taskMsPerS: per('TaskDuration'), styleMsPerS: per('RecalcStyleDuration'), layoutMsPerS: per('LayoutDuration'), running: labAnims().length };
}
async function costs() {
  const D = ThreeLab.director; const c = await ThreeLab.cmd();
  await D.newSketch('Redux fixture (redux151)', BACKDROP, 2);
  try { await D.updateLayer(D.layers().layers[0].name, { name: 'Backdrop', code: BACKDROP }, 0.3); } catch { /* the first layer is it */ }
  try { await D.addLayer({ name: 'Particles', code: PARTICLES }, 1); } catch (err) { step('fixture: particles', false, err.message); }
  c.code?.(false);
  await wait(5000);
  await away(); await wait(3000);
  const idle = await cost('idle');
  c.play(true); await wait(2500);
  const play = await cost('play');
  c.play(false); await wait(500);
  return { idle, play };
}

try {
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } });
  await cdp('Performance.enable', {});
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && typeof LabRegroup !== 'undefined', 60000);
  await wait(600);
  // the round-150 build (no Redux tokens): only the cost, for the before / after table
  const BASE = Boolean(window.REDUX151_BASE) || !getComputedStyle(document.documentElement).getPropertyValue('--rx-gold').trim();
  if (BASE) {
    document.documentElement.dataset.motion = '';
    out.baseline = true;
    out.measure.cost = await costs();
    step('baseline cost measured', out.measure.cost.idle.layers > 0, out.measure.cost);
    out.ok = !out.problems;
    return JSON.stringify(out, null, 1);
  }
  const info = await RS.open({ play: false });
  step('the real scene is open with its song', info.song && document.querySelector('.surface.active .media-bar:not(.mb-empty)'), { layers: info.layers });
  document.documentElement.dataset.motion = '';
  const lab = () => document.querySelector('.surface.active') || document;
  const one = (sel) => lab().querySelector(sel);
  const all = (sel) => [...lab().querySelectorAll(sel)];
  step('Forgeheart (Hearth Redux) is the default look; the look row cycles Forgeheart → Plain (Plate is gone)', LabRegroup.look() === 'forge' && document.documentElement.dataset.lablook === 'forge' && /Lab look: Forgeheart/.test(LabRegroup.lookRow()[0]) && /Plain/.test(LabRegroup.lookRow()[1]));
  const tb = one('.three-toolbar'); const mb = one('.media-bar'); const ly = one('.lk-merged .layers');
  const selRow = one('.ly-row.on') || (() => { one('.ly-row[data-id]')?.click(); return one('.ly-row.on'); })();
  await wait(400);
  const otherRow = all('.ly-row[data-id]').find((r) => r !== selRow && !r.classList.contains('on') && drawn(r));
  const ESS = {
    picker: tb.querySelector('.three-sketch-select'), run: tb.querySelector('.tb-group[data-cat="Sketch"] > button.primary'), play: tb.querySelector('[data-feature="Play"]'), more: tb.querySelector('[data-feature="Lab more"]'),
    tlPlay: mb.querySelector('.mb-play'), tlTime: mb.querySelector('.mb-time'), tlTitle: mb.querySelector('.ih-tl .ih-name'), lyTitle: ly.querySelector('.tw-head > b'), selEye: selRow?.querySelector('.ly-eye'), pvTitle: one('.ih-pv .ih-name'),
  };
  const SEC = {
    toolbar: { finish: tb.querySelector('[data-feature="Finish line"]'), direction: tb.querySelector('[data-feature="Direction"]'), sketch: [...tb.querySelectorAll('button')].find((b) => /^Sketch/.test(b.textContent.trim())), sliders: tb.querySelector('[data-feature="Layers & sliders"]'), inspect: tb.querySelector('[data-feature="Inspect"]'), present: tb.querySelector('[data-feature="Present"]'), search: tb.querySelector('[data-feature="Lab search"]') },
    timeline: { song: mb.querySelector('[data-feature="Load audio video…"]'), map: mb.querySelector('.mb-songmap'), beat: mb.querySelector('[data-feature="Beat"]'), sync: mb.querySelector('[data-feature="Sync"]'), sections: mb.querySelector('[data-feature="Sections"]'), view: mb.querySelector('[data-feature="Timeline view"]'), more: mb.querySelector('.mb-more'), sequence: mb.querySelector('[data-feature="Sequence"]'), render: mb.querySelector('[data-feature="Scene render"]'), meta: mb.querySelector('.ih-tl .ih-meta') },
    layers: { add: [...ly.querySelectorAll(':scope > .tw-head > button')].find((b) => /Layer/.test(b.textContent)), more: ly.querySelector(':scope > .tw-head > .ly-more'), eye: otherRow?.querySelector('.ly-eye') },
    stage: { pill: one('.three-preview > .stage-pill'), stats: one('.three-preview > .three-stats') },
  };
  const missing = Object.entries(SEC).flatMap(([a, o]) => Object.entries(o).filter(([, n]) => !n).map(([k]) => `${a}.${k}`)).concat(Object.entries(ESS).filter(([, n]) => !n).map(([k]) => k));
  step('every control is still in the Lab (same elements, data-feature hooks kept)', !missing.length, missing);
  const ops = (o) => Object.fromEntries(Object.entries(o).filter(([, n]) => n).map(([k, n]) => [k, seen(n)]));

  // ---------- 1. at rest ----------
  await away(); await wait(3000);
  const ess = ops(ESS);
  const rest = Object.fromEntries(Object.entries(SEC).map(([a, o]) => [a, ops(o)]));
  out.measure.rest = { ess, rest };
  step('at rest: the essentials are in sight (picker, ▶ Run, ▶ Play, ⋯ · ▶ and the time · the panels\' titles · the selected layer\'s eye)', Object.values(ess).every((v) => v > 0.9), ess);
  const restLit = Object.entries(rest).flatMap(([a, o]) => Object.entries(o).filter(([, v]) => v > 0.05).map(([k, v]) => `${a}.${k}=${v}`));
  step('at rest: every secondary control is out of sight (transparent, in place)', !restLit.length, restLit.length ? restLit : `${Object.values(rest).reduce((n, o) => n + Object.keys(o).length, 0)} hidden`);
  const clickable = Object.values(SEC.toolbar).concat(Object.values(SEC.timeline)).filter((n) => n && n.tagName === 'BUTTON').every((n) => getComputedStyle(n).pointerEvents !== 'none' && drawn(n));
  step('…still drawn and hit by a click at their spot (a check / a quick click lands; Lab search and the menus list them as before)', clickable);
  const SEL = 'button, select, input:not([type=hidden]), summary';
  const inSight = all(SEL).filter((n) => drawn(n) && seen(n) > 0.05 && n.getBoundingClientRect().bottom < innerHeight && !n.closest('.ly-knobs, .tool-head')).length;
  out.measure.inSightAtRest = inSight;
  await shot('redux151-rest');

  // ---------- 2. context ----------
  const R = (n) => n.getBoundingClientRect();
  const tr = R(tb);
  await move(tr.left + tr.width * 0.55, tr.top + tr.height / 2); await wait(450);
  const tbOn = { toolbar: ops(SEC.toolbar), timeline: ops(SEC.timeline) };
  const line = getComputedStyle(tb, '::after').transform;
  step('the Lab bar under the pointer: its controls come in (only its), a gold → ember line drawn under it', Object.values(tbOn.toolbar).every((v) => v > 0.9) && Object.values(tbOn.timeline).every((v) => v < 0.05) && /matrix\(1, 0, 0, 1/.test(line) && /gradient/.test(getComputedStyle(tb, '::after').backgroundImage), { ...tbOn, line });
  const mr = R(mb);
  await move(mr.left + mr.width * 0.5, mr.top + 90); await wait(450);
  const mbOn = { timeline: ops(SEC.timeline), toolbar: ops(SEC.toolbar) };
  step('the timeline under the pointer: its tools and readouts come in, the Lab bar\'s go', Object.values(mbOn.timeline).every((v) => v > 0.9) && Object.values(mbOn.toolbar).every((v) => v < 0.05), mbOn);
  await shot('redux151-context');
  if (otherRow) {
    const rr = R(otherRow);
    await move(rr.left + rr.width * 0.5, rr.top + rr.height / 2); await wait(400);
    step('a layer row under the pointer: its eye comes in; the panel\'s head buttons (＋ Layer, ⋯) with it', seen(SEC.layers.eye) > 0.9 && seen(SEC.layers.add) > 0.9 && seen(SEC.layers.more) > 0.9 && seen(SEC.timeline.beat) < 0.05, ops(SEC.layers));
  }
  await away(); await wait(500);
  SEC.toolbar.present.focus({ focusVisible: true }); await wait(400);
  const foc = seen(SEC.toolbar.present);
  SEC.toolbar.present.blur(); await wait(300);
  step('keyboard focus brings a control in (and it goes again after)', foc > 0.9 && seen(SEC.toolbar.present) < 0.05, { focused: foc, after: seen(SEC.toolbar.present) });
  const agent = H.claudeAgent().id;
  await Commands.tryRun('/stage show', agent); await wait(450);
  const pinned = Object.fromEntries(Object.entries(SEC).map(([a, o]) => [a, ops(o)]));
  const pinLow = Object.entries(pinned).flatMap(([a, o]) => Object.entries(o).filter(([k, v]) => v < 0.9 && !(a === 'layers' && k === 'eye')).map(([k, v]) => `${a}.${k}=${v}`));
  await Commands.tryRun('/stage clean', agent); await wait(450);
  const cleanLit = Object.entries(SEC.toolbar).filter(([, n]) => seen(n) > 0.05).map(([k]) => k);
  step('I / the command bar (/stage show · "show scene controls") brings every control of the Lab in; /stage clean tucks them away', document.documentElement.classList.contains('lab-pinned') === false && !pinLow.length && !cleanLit.length, { pinLow, cleanLit });
  const beat = LabRegroup.folds.find((F) => F.button.dataset.feature === 'Beat');
  LabRegroup.setOpen(beat, true); await wait(350);
  const tray = beat.tray; const trR = R(tray);
  const bR = R(beat.button);
  const trayOk = drawn(tray) && seen(tray) > 0.9 && trR.top > 0 && trR.bottom < innerHeight && trR.left >= 0 && (Math.abs(trR.top - bR.bottom) < 12 || Math.abs(trR.bottom - bR.top) < 12);
  const trayAnim = getComputedStyle(tray).animationName; const trayLine = getComputedStyle(tray, '::before').animationName;
  LabRegroup.setOpen(beat, false); await wait(40);
  const fading = drawn(tray) && getComputedStyle(tray).display !== 'none';
  await wait(300);
  step('a fold\'s tray opens right under its button (clip + the gold → ember line + its rows), and fades out when it folds', trayOk && /rx-tray/.test(trayAnim) && trayLine === 'rx-line-in' && fading && !drawn(tray), { trR: [trR.left, trR.top, trR.width, trR.height].map(Math.round), trayAnim, trayLine, fading });

  // ---------- 3. motion ----------
  await move(tr.left + tr.width * 0.55, tr.top + tr.height / 2); await wait(450);
  const tIn = ['finish', 'sliders', 'present'].map((k) => { const s = getComputedStyle(SEC.toolbar[k]); return { k, dur: s.transitionDuration, delay: s.transitionDelay, prop: s.transitionProperty }; });
  await away(); await wait(400);
  const tOut = getComputedStyle(SEC.toolbar.present).transitionDuration;
  const secs = (s) => String(s).split(',').map((x) => parseFloat(x) * (/ms/.test(x) ? 0.001 : 1));
  const inOk = tIn.every((t) => secs(t.dur).every((d) => d >= 0.12 && d <= 0.22) && /opacity/.test(t.prop) && /transform/.test(t.prop) && !/all/.test(t.prop)) && new Set(tIn.map((t) => t.delay)).size === 3;
  step('the way in: opacity + transform transitions, 120–220 ms, staggered left to right; out quicker (no stagger)', inOk && secs(tOut).every((d) => d <= 0.14), { tIn, tOut });
  // a mid-way frame: the Lab bar coming in, every transition frozen ≈ 90 ms in
  await away(); await wait(500);
  await move(tr.left + tr.width * 0.55, tr.top + tr.height / 2); await wait(16);
  const mid = document.getAnimations().filter((a) => a.effect?.target && (tb.contains(a.effect.target) || a.effect.target === tb));
  for (const a of mid) { try { a.pause(); a.currentTime = 90; } catch { /* finished */ } }
  await wait(60);
  const midOp = seen(SEC.toolbar.finish); const midLine = getComputedStyle(tb, '::after').transform;
  await shot('redux151-anim');
  for (const a of mid) { try { a.play(); } catch { /* gone */ } }
  step('mid-way (frozen ≈ 90 ms in): controls part-way in, the line part-way across', mid.length >= 4 && midOp > 0.02 && midOp < 0.98 && !/matrix\(1, 0, 0, 1/.test(midLine), { anims: mid.length, midOp, midLine });
  await away(); await wait(3000);
  const restRun = labAnims();
  const c = await ThreeLab.cmd();
  c.play(true); await until(() => LabPlay.playing, 6000); await wait(2000);
  const playRun = labAnims();
  const idleDot = getComputedStyle(one('.ih-pv .ih-live')).backgroundColor;
  c.play(false); await until(() => !LabPlay.playing, 5000); await wait(400);
  step('nothing animates at rest or while the scene plays (the live dot turns ember instead of pulsing)', !restRun.length && !playRun.length && rgb(idleDot)[0] > 200 && rgb(idleDot)[2] < 80, { restRun, playRun, idleDot });
  const loops = [];
  for (const sh of document.styleSheets) {
    if (!/three-(regroup|hudstage|lab)\.css/.test(sh.href || '')) continue;
    let rules = []; try { rules = [...sh.cssRules]; } catch { continue; }
    const walk = (list) => { for (const r of list) { if (r.cssRules) walk(r.cssRules); if (r.style && /infinite/.test(r.style.animation + r.style.animationIterationCount) && !/lab-building|ly-building/.test(r.selectorText || '')) loops.push(r.selectorText); } };
    walk(rules);
  }
  step('no infinite animation in the Lab\'s look (only the "building…" one, while a layer builds)', !loops.length, loops);
  const motionOff = async (label, on, off) => {
    await on(); await wait(250);
    await move(tr.left + tr.width * 0.55, tr.top + tr.height / 2); await wait(250);
    const t = getComputedStyle(SEC.toolbar.present).transitionDuration; const o = seen(SEC.toolbar.present);
    LabRegroup.setOpen(beat, true); await wait(80);
    const a = getComputedStyle(beat.tray).animationName; const l = getComputedStyle(tb, '::after').transitionDuration;
    LabRegroup.setOpen(beat, false);
    await away(); await wait(200);
    await off(); await wait(200);
    return { label, t, o, a, l };
  };
  const rm = await motionOff('reduced', () => cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }), () => cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }));
  const calm = await motionOff('calm', () => { document.documentElement.dataset.motion = 'calm'; }, () => { document.documentElement.dataset.motion = ''; });
  step('reduced motion and Hearth\'s Motion: calm: no transitions or animations (the controls still come in, at once)', [rm, calm].every((x) => secs(x.t).every((d) => d === 0) && x.o > 0.9 && x.a === 'none' && secs(x.l).every((d) => d === 0)), [rm, calm]);

  // ---------- 4. palette ----------
  const run = rgb(getComputedStyle(ESS.run).backgroundColor);
  const ph = one('.media-bar .mb-playhead:not(.mini)'); const phc = rgb(getComputedStyle(ph).backgroundColor);
  const panel = rgb(getComputedStyle(ly).backgroundColor); const room = rgb(getComputedStyle(one('.three-split')).backgroundColor);
  const text = rgb(getComputedStyle(ESS.lyTitle).color); const num = rgb(getComputedStyle(ESS.lyTitle, '::before').color);
  const br = rgb(getComputedStyle(LabHudStage.el.querySelector('.st-br')).borderTopColor);
  const gold = (c) => c[0] > 200 && c[1] > 140 && c[1] < 215 && c[2] < 110;
  const ember = (c) => c[0] > 220 && c[1] > 80 && c[1] < 150 && c[2] < 70;
  const graphite = (c) => Math.max(...c) < 36 && Math.max(...c) - Math.min(...c) <= 6 && c[2] <= c[0] + 2;
  const warm = (c) => c[0] > 200 && c[0] >= c[2];
  const goldish = (c) => c[0] > 150 && c[0] > c[2] + 40 && c[1] > c[2];
  out.measure.palette = { run, playhead: phc, panel, room, text, num, bracket: br };
  step('palette: gold primary (▶ Run), ember playhead, graphite panels (neutral grey, not navy), warm text, gold numbers and stage corners', gold(run) && ember(phc) && graphite(panel) && graphite(room) && warm(text) && gold(num) && goldish(br), out.measure.palette);
  await shot('redux151-rest-final');
  await RS.close?.();

  // ---------- 5. cost ----------
  const C = await costs();
  out.measure.cost = { before: BEFORE, after: C };
  step(`cost: fewer composited layers in the Lab window (idle ${C.idle.layers} < ${BEFORE.idle.layers}, playing ${C.play.layers} < ${BEFORE.play.layers})`, C.idle.layers < BEFORE.idle.layers && C.play.layers < BEFORE.play.layers, { idle: C.idle, play: C.play });
  const drawOk = C.idle.drawMs <= BEFORE.idle.drawMs * 1.1 + 0.5 && C.play.drawMs <= BEFORE.play.drawMs * 1.1 + 0.5;
  const lw = await smoke({ loadwait: 'snap' });
  const busy = ((lw?.loadavg?.[0] || 0) / Math.max(1, lw?.cpus || 1)) >= 0.75;
  step(`cost: paint + layerize + composite ms a second in the window no higher than round 150's (idle ${C.idle.drawMs} vs ${BEFORE.idle.drawMs}, playing ${C.play.drawMs} vs ${BEFORE.play.drawMs})${!drawOk && busy ? ' — the box is loaded: can\'t tell' : ''}`, drawOk || busy, { loadavg: lw?.loadavg, cpus: lw?.cpus });
} catch (err) { step(`threw: ${err.stack || err.message}`, false); }
try { await RS.close?.(); } catch { /* closed */ }
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
