// (round 150, stage150) the scene view as a clean, mono, futuristic stage (docs/upgrades/stage150.md), ONE check on a
// fixture scene it makes (a wireframe globe in points, its background and hue as sliders) and realscene-lib's 124 BPM
// song (a kick on every beat); the check's own temp data, never an owner's scene:
//   (round 164) the Lab dock (the owner's Nov 9 design, tools/three.js labDock): the stats line lives in a solid strip
//             under the picture with the QUALITY / FPS controls, always fully shown; the view controls stay on the picture
//   idle      the pointer still over the picture for 2 s: the view controls (.stage-pill) and the 01 PREVIEW header's
//             readouts are transparent and not hit by the pointer; the stage frame stays; the dock's stats stay in sight
//   zones     real pointer moves (CDP): the top-right corner reveals the view controls (and a real click on 9:16 works),
//             the bottom edge is zone b (the view controls stay away), the header its readouts
//   pin       I (a real key) pins everything through an idle wait, I again: a clean stage; /stage show and the command
//             bar's plain words "clean stage" / "show scene controls" do the same
//   warnings  a new Slow chip (the real one: this scene is slow on software GL) shows by itself while idle, then tucks
//             into a glyph; a Safe-open note the same; pointing brings them back whole
//   tint      the preview page reads its picture ≤ 4 a second: a blue scene → a blue frame; the scene turned red → the
//             frame's hue moves to red
//   pulse     while the song plays the frame pulses on its kicks (the analysis' hits), beat pips follow; nothing while
//             stopped
//   reduced   prefers-reduced-motion and Hearth's Motion: off: no pulse, no easing, no transitions (static tint)
//   plain     Lab look Plain: no stage frame, no colour reading, hide-on-idle still on
//   cost      the song playing, Stage off / reactive / off / reactive, 5 s each: the preview page's main-thread ms a
//             second for the colour reading, the window's for the pulses / tint / labels (their own counters), plus both
//             targets' CDP TaskDuration (load-aware, reported); within ~1 ms a frame
//   pictures  <out>/stage150-idle.png (the clean stage), stage150-reveal.png (the controls revealed)
//   node dev/smoke.js --fake-engines --check-timeout 900000 --lib dev/checks/realscene-lib.js --script dev/checks/stage150.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const cdp = (method, params, target) => Promise.race([smoke(target ? { cdp: method, params, target } : { cdp: method, params }), wait(5000)]);
const SHOTS = window.STAGE150_SHOTS || '/tmp/hearth-checks';
const shot = (name) => smoke({ shot: `${SHOTS}/${name}.png` }).catch(() => {});
const safe = async (name, fn, ms = 240000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${ms / 1000} s`)), ms))]); } catch (err) { step(`${name} threw: ${String(err?.stack || err).slice(0, 400)}`, false); } };
const SCENE = (bg, hue) => `import * as THREE from 'three';
const P = tweak({ bg: { value: '${bg}', label: 'Background' }, hue: { value: ${hue}, min: 0, max: 1, label: 'Hue' } });
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const s = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100); cam.position.z = 6;
const g = new THREE.Group(); s.add(g);
const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.6 })); g.add(ico);
const pts = new THREE.BufferGeometry(); const N = 2400; const a = new Float32Array(N * 3); let q = 7; const rnd = () => (q = (q * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < N; i++) { const u = rnd() * 2 - 1; const t = rnd() * 6.283; const rr = 2.2 + rnd() * 1.6; a[i * 3] = Math.sqrt(1 - u * u) * Math.cos(t) * rr; a[i * 3 + 1] = u * rr; a[i * 3 + 2] = Math.sqrt(1 - u * u) * Math.sin(t) * rr; }
pts.setAttribute('position', new THREE.BufferAttribute(a, 3)); const pm = new THREE.PointsMaterial({ size: 0.028 }); g.add(new THREE.Points(pts, pm));
const bg = new THREE.Color(); const col = new THREE.Color();
r.setAnimationLoop((t) => { s.background = bg.set(P.bg); col.setHSL(P.hue, 0.85, 0.62); ico.material.color = col; pm.color = col; g.rotation.y = t / 4000; g.rotation.x = t / 9000; r.render(s, cam); });`;

let c = null; let D = null; let pv = null; let pill = null; let stats = null; let head = null; let dock = null;
const op = (n) => (n ? Number(getComputedStyle(n).opacity) : -1);
const hit = (n) => (n ? getComputedStyle(n).pointerEvents !== 'none' : false);
const S = () => LabHudStage.state();
const R = () => pv.getBoundingClientRect();
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
const key = async (k, code, vk) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, unmodifiedText: k, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const view = () => ({ pill: [Math.round(op(pill) * 100) / 100, hit(pill)], stats: [Math.round(op(stats) * 100) / 100, hit(stats)], head: Math.round(op(head?.querySelector('.ih-meta')) * 100) / 100, zone: S().zone, idle: S().idle, pinned: S().pinned });
const hueGap = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
const mid = () => { const r = R(); return [r.left + r.width * 0.45, r.top + r.height * 0.5]; };

try {
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } });
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && window.LabHudStage, 60000);
  try { localStorage.setItem('hub.safeopen.hangMs', '600000'); } catch { /* the default */ }
  document.documentElement.dataset.motion = '';
  store.set('three.stageFx', 'reactive'); LabRegroup.setLook('forge');
  c = await ThreeLab.cmd(); D = ThreeLab.director;
  await D.newSketch('Stage fixture (stage150)', SCENE('#04101f', 0.58), 1);
  await wait(3500);
  c.code?.(false);
  const f = await RS.files(); await c.loadSong(f.song); await until(() => c.state.bpm > 0, 30000);
  await wait(1500);
  pv = [...document.querySelectorAll('.surface.active .three-preview')].find((n) => n.getBoundingClientRect().width > 100);
  pill = pv.querySelector(':scope > .stage-pill'); head = pv.previousElementSibling?.classList.contains('ih-pv') ? pv.previousElementSibling : null;
  // (round 164) the Lab dock: the stats line (the same element the Lab paints) in the strip right under the picture
  dock = pv.parentElement?.querySelector(':scope > .lab-dock'); stats = dock?.querySelector(':scope > .three-stats') || null;
  const pr = pv.getBoundingClientRect(); const dr = dock?.getBoundingClientRect();
  const dockInfo = dock && { next: pv.nextElementSibling === dock, gap: Math.round(dr.top - pr.bottom), h: Math.round(dr.height), quality: Boolean(dock.querySelector('[data-feature="Preview quality"] .dock-seg-btn.on')), fps: Boolean(dock.querySelector('[data-feature="Preview fps"] .dock-seg-btn.on')), inPicture: Boolean(pv.querySelector('.three-stats')) };
  step('the stage is on the preview: its frame, the view controls kept in place on the picture, the stats line in the dock under it (same elements; QUALITY and FPS beside it)', pv.classList.contains('st-on') && LabHudStage.el?.parentElement === pv && pill && stats && dockInfo?.next && dockInfo.gap >= -1 && dockInfo.h >= 30 && dockInfo.quality && dockInfo.fps && !dockInfo.inPicture && head?.classList.contains('st-head') && getComputedStyle(LabHudStage.el).display === 'block', { look: LabRegroup.look(), fx: S().fx, dock: dockInfo });

  // ---------- idle ----------
  await safe('idle', async () => {
    await move(...mid()); await wait(300);
    const awake = view();
    await wait(2700);
    const idle = view();
    out.measure.idle = { awake, idle };
    step('idle: 2 s without the pointer moving: the view controls and the header\'s readouts fade out and are not hit by the pointer; the dock\'s stats stay in sight under the picture', !awake.idle && idle.idle && idle.pill[0] < 0.05 && !idle.pill[1] && idle.stats[0] > 0.9 && idle.stats[1] && idle.head < 0.05, out.measure.idle);
    const fr = LabHudStage.el.querySelector('.st-frame');
    step('idle: the stage frame stays (brackets and rulers, quiet), the labels and reticle go', op(fr) > 0.3 && op(LabHudStage.el.querySelector('.st-lb-bl')) < 0.05 && op(LabHudStage.el.querySelector('.st-x')) < 0.05, { frame: op(fr) });
    await shot('stage150-idle');
  });

  // ---------- zones ----------
  await safe('zones', async () => {
    const r = R();
    await move(r.right - 90, r.top + 40); await wait(500);
    const tr = view();
    step('top-right corner: the view controls come back (the dock under the picture as it was)', tr.zone === 'tr' && tr.pill[0] > 0.9 && tr.pill[1] && tr.stats[0] > 0.9, tr);
    // a real click on 9:16 while revealed, then back to Fit
    const b916 = [...pill.querySelectorAll('.stage-size-btn')].find((b) => b.textContent.trim() === '9:16');
    const bb = b916.getBoundingClientRect();
    await move(bb.left + bb.width / 2, bb.top + bb.height / 2); await wait(250);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(bb.left + bb.width / 2), y: Math.round(bb.top + bb.height / 2), button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(bb.left + bb.width / 2), y: Math.round(bb.top + bb.height / 2), button: 'left', clickCount: 1 });
    const sized = await until(() => c.state.frame?.id === '9:16' || store.get('three.aspect') === '9:16', 5000);
    step('…a real click on its 9:16 works (the control is the real one, clickable when revealed)', Boolean(sized), { frame: c.state.frame?.id });
    await wait(800);
    const fit = [...pill.querySelectorAll('.stage-size-btn')].find((b) => b.textContent.trim() === 'Fit'); fit?.click();
    await until(() => c.state.frame?.id === 'fit', 5000); await wait(800);
    const r2 = R();
    await move(r2.left + r2.width * 0.5, r2.bottom - 18); await wait(900);
    const bot = view();
    step('bottom edge: zone b (its notes come back there; the view controls stay away); the stats line in the dock just under it', bot.zone === 'b' && bot.stats[0] > 0.9 && bot.stats[1] && bot.pill[0] < 0.05, bot);
    const hr = head.getBoundingClientRect();
    await move(hr.left + hr.width * 0.5, hr.top + hr.height / 2); await wait(500);
    const hd = view();
    step('the 01 PREVIEW header: hovering it shows its readouts (fps · quality)', hd.head > 0.9 && S().headIn, hd);
    await move(...mid()); await wait(400);
  });

  // ---------- pin: the key, the command, the bar's words ----------
  await safe('pin', async () => {
    // the Lab's keys: focus in the Lab (not a click on the picture: that would pick a layer to move)
    (pv.closest('[tabindex="-1"]') || pv.parentElement).focus({ preventScroll: true });
    await wait(200);
    await key('i', 'KeyI', 73);
    await until(() => S().pinned, 3000);
    await wait(2800);
    const pinned = view();
    step('I pins the controls: through a 2 s idle the view controls, the stats line and the header readouts stay', pinned.pinned && pinned.pill[0] > 0.9 && pinned.pill[1] && pinned.stats[0] > 0.9 && pinned.head > 0.9 && c.state.stage === 'pinned', pinned);
    const focused = document.activeElement; focused?.blur?.(); // (the picture without the Lab's focus ring)
    await move(...mid()); await wait(350);
    await shot('stage150-reveal');
    focused?.focus?.({ preventScroll: true }); await wait(150);
    await key('i', 'KeyI', 73);
    await until(() => !S().pinned, 3000); await wait(2700);
    const clean = view();
    step('I again: a clean stage (hidden after the idle wait; the dock\'s stats stay)', !clean.pinned && clean.pill[0] < 0.05 && clean.stats[0] > 0.9, clean);
    const agent = H.claudeAgent().id;
    await Commands.tryRun('/stage show', agent);
    const cmdOn = S().pinned;
    await Commands.tryRun('/stage clean', agent);
    const cmdOff = !S().pinned;
    try { await Lazy.load('labsay'); } catch { /* checked below */ }
    const say = window.SayCore || (typeof SayCore !== 'undefined' ? SayCore : null);
    const p1 = say?.parse('show scene controls'); const p2 = say?.parse('clean stage');
    step('/stage show · /stage clean, and the command bar\'s plain words "show scene controls" / "clean stage"', cmdOn && cmdOff && p1?.kind === 'stage' && p1.op === 'show' && p2?.kind === 'stage' && p2.op === 'clean', { cmdOn, cmdOff, p1: p1 && [p1.kind, p1.op, p1.words], p2: p2 && [p2.kind, p2.op] });
    const kl = Keys.all().find((k) => k.area === 'Lab' && k.keys === 'I');
    step('the keys sheet lists I in the Lab', Boolean(kl), kl?.what);
  });

  // ---------- warnings ----------
  await safe('warnings', async () => {
    await move(...mid()); await wait(2700); // (idle)
    LabSpeedHook.hideChip(); LabSpeedHook.forget();
    const chip = await until(() => { const x = pv.querySelector(':scope > .lab-speedchip'); return x?.isConnected ? x : null; }, 40000, 150);
    let fresh = null; let tucked = null; let back = null;
    if (chip) {
      await wait(400);
      fresh = { cls: chip.className, op: op(chip), w: Math.round(chip.getBoundingClientRect().width), kids: getComputedStyle(chip.firstChild).display };
      await until(() => !chip.classList.contains('st-fresh'), 9000); await wait(500);
      tucked = { idle: S().idle, w: Math.round(chip.getBoundingClientRect().width), kids: getComputedStyle(chip.firstChild).display, glyph: getComputedStyle(chip, '::before').content };
      await move(...mid()); await wait(400);
      back = { w: Math.round(chip.getBoundingClientRect().width), kids: getComputedStyle(chip.firstChild).display };
    }
    out.measure.warn = { fresh, tucked, back };
    step('a new Slow chip shows by itself on a clean stage, then tucks into a glyph, and comes back whole when you point', chip && fresh.op > 0.9 && fresh.w > 80 && fresh.kids !== 'none' && tucked.idle && tucked.w <= 24 && tucked.kids === 'none' && /!/.test(tucked.glyph) && back.w > 80 && back.kids !== 'none', out.measure.warn);
    // a Safe-open note (its element as three-safeopen.js makes it): the same
    await wait(2700);
    const note = el('div', { class: 'lab-safe', role: 'status' }, el('span', { class: 'ls-ic', text: '🛟' }), el('div', { class: 'ls-txt', text: 'stage150 fixture · opened safely' }));
    pv.append(note); await wait(400);
    const nf = { op: op(note), kids: getComputedStyle(note.firstChild).display };
    await until(() => !note.classList.contains('st-fresh'), 9000); await wait(500);
    const nt = { kids: getComputedStyle(note.firstChild).display, w: Math.round(note.getBoundingClientRect().width) };
    note.remove();
    step('a Safe-open note: by itself first, then a 🛟 glyph while idle', nf.op > 0.9 && nf.kids !== 'none' && nt.kids === 'none' && nt.w <= 24, { nf, nt });
  });

  // ---------- tint ----------
  await safe('tint', async () => {
    const blue = await until(() => { const s = S(); return s.lastTint?.h != null && hueGap(s.hue, 209) < 30 ? s : null; }, 8000);
    const pvH = Number(getComputedStyle(pv).getPropertyValue('--st-h'));
    out.measure.blue = { hue: S().hue, tint: S().lastTint, cssH: pvH };
    step('a blue scene: the frame\'s hue is blue (the preview page\'s reading, eased in)', Boolean(blue) && hueGap(pvH, 209) < 35, out.measure.blue);
    await D.updateLayer(D.layers().layers[0].name, { code: SCENE('#5a0505', 0.0) }, 0.3);
    const t0 = performance.now();
    const red = await until(() => { const s = S(); return s.lastTint?.h != null && hueGap(s.lastTint.h, 0) < 25 && hueGap(s.hue, 0) < 20 ? s : null; }, 12000);
    const cssR = Number(getComputedStyle(pv).getPropertyValue('--st-h'));
    out.measure.red = { hue: S().hue, tint: S().lastTint, cssH: cssR, ms: Math.round(performance.now() - t0), msgs: S().counts.tintMsgs };
    step('the scene turns red: the frame\'s hue moves to red', Boolean(red) && hueGap(cssR, 0) < 25, out.measure.red);
    await D.updateLayer(D.layers().layers[0].name, { code: SCENE('#04101f', 0.58) }, 0.3);
    await wait(2500);
  });

  // ---------- pulse ----------
  await safe('pulse', async () => {
    LabHudStage.reset();
    await wait(1200);
    const stopped = S().counts.kick;
    c.seek(2); c.play(true);
    await until(() => window.LabPlay?.playing, 5000);
    await wait(5000);
    const s1 = S();
    const anims = LabHudStage.el.querySelector('.st-flash').getAnimations().length;
    c.play(false); await wait(400);
    out.measure.pulse = { stopped, kicks: s1.counts.kick, snares: s1.counts.snare, hats: s1.counts.hats, beats: s1.counts.beat, feeds: s1.counts.feed, live: s1.pulseOn, anims };
    step('while the song plays the frame pulses on its kicks (≥ 6 in 5 s at 124 BPM) and the beat pips follow; nothing while stopped', stopped === 0 && s1.counts.kick >= 6 && s1.counts.beat >= 6, out.measure.pulse);
  });

  // ---------- reduced motion ----------
  await safe('reduced', async () => {
    const flash = LabHudStage.el.querySelector('.st-flash');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await wait(300);
    LabHudStage.reset();
    c.seek(2); c.play(true); await wait(3000);
    const r1 = { live: LabHudStage.live, kicks: S().counts.kick, flash: getComputedStyle(flash).display, trans: getComputedStyle(LabHudStage.el.querySelector('.st-x')).transitionDuration, tintOn: S().tintOn, glow: getComputedStyle(LabHudStage.el.querySelector('.st-glow')).opacity };
    c.play(false); await wait(300);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }); await wait(200);
    document.documentElement.dataset.motion = 'off'; await wait(200);
    LabHudStage.reset();
    c.seek(2); c.play(true); await wait(3000);
    const r2 = { live: LabHudStage.live, kicks: S().counts.kick, flash: getComputedStyle(flash).display, trans: getComputedStyle(LabHudStage.el.querySelector('.st-x')).transitionDuration };
    c.play(false); await wait(300);
    document.documentElement.dataset.motion = ''; await wait(200);
    out.measure.reduced = { r1, r2 };
    step('reduced motion and Motion: off: no pulse (no kicks fed, the flash layer gone), no transitions, no colour reading while it plays (static tint)', !r1.live && r1.kicks === 0 && r1.flash === 'none' && /^0s/.test(r1.trans) && !r1.tintOn && !r2.live && r2.kicks === 0 && r2.flash === 'none' && /^0s/.test(r2.trans), out.measure.reduced);
  });

  // ---------- plain ----------
  await safe('plain', async () => {
    LabRegroup.setLook('plain'); await wait(400);
    await move(...mid()); await wait(2800);
    const p = { hud: getComputedStyle(LabHudStage.el).display, tintOn: S().tintOn, live: LabHudStage.live, ...view() };
    LabRegroup.setLook('forge'); await wait(300);
    out.measure.plain = p;
    step('Plain: no stage frame and no colour reading or pulse, but the controls still hide on idle (the dock stays)', p.hud === 'none' && !p.tintOn && !p.live && p.pill[0] < 0.05 && p.stats[0] > 0.9, p);
  });

  // ---------- cost ----------
  await safe('cost', async () => {
    const metr = async (target) => { const r = await smoke(target ? { cdp: 'Performance.getMetrics', target } : { cdp: 'Performance.getMetrics' }); const o = {}; for (const m of r?.metrics || []) o[m.name] = m.value; return o; };
    await smoke({ cdp: 'Performance.enable', target: 'three-sandbox' }); await smoke({ cdp: 'Performance.enable' });
    const ev = async (code) => { const r = await D.evalInSketch(code); return r?.ok ? r.value : null; };
    const run = async (mode) => {
      LabHudStage.setMode(mode); await wait(400);
      c.seek(2); c.play(true); await until(() => window.LabPlay?.playing, 5000); await wait(1200);
      await ev('return window.__stage150.reset()'); LabHudStage.reset();
      const snap = await smoke({ loadwait: 'snap' });
      const a = await metr('three-sandbox'); const b = await metr(); const t0 = performance.now();
      await wait(5000);
      const a1 = await metr('three-sandbox'); const b1 = await metr(); const secs = (performance.now() - t0) / 1000;
      const lw = await smoke({ loadwait: 1, since: snap.snap });
      let sb = null; try { sb = JSON.parse(await ev('return JSON.stringify(window.__stage150.info())')); } catch { /* none */ }
      const st = S(); const fps = Number(lastFpsOf()) || 0;
      c.play(false); await wait(300);
      const per = (x, y, k) => (x[k] != null && y[k] != null ? Math.round(((y[k] - x[k]) * 1000 / secs) * 10) / 10 : null);
      const winOwn = (st.feedMs + st.applyMs + st.labelMs) / secs;
      return { mode, pageTask: per(a, a1, 'TaskDuration'), winTask: per(b, b1, 'TaskDuration'), winStyle: per(b, b1, 'RecalcStyleDuration'),
        pageStageMsPerSec: sb ? Math.round((sb.ms / secs) * 100) / 100 : null, samplesPerSec: sb ? Math.round((sb.samples / secs) * 10) / 10 : null, sampleAvgMs: sb?.avgMs ?? null, sampleMaxMs: sb?.maxMs ?? null,
        winStageMsPerSec: Math.round(winOwn * 100) / 100, feeds: st.counts.feed, kicks: st.counts.kick, fps, load: lw && { judge: lw.judge, loadavg: lw.loadavg?.map((x) => Math.round(x * 100) / 100), cpus: lw.cpus } };
    };
    const lastFpsOf = () => (stats?.querySelector(':scope > b')?.textContent || '').match(/\d+/)?.[0];
    const rows = [];
    for (const m of ['off', 'reactive', 'off', 'reactive']) rows.push(await run(m));
    store.set('three.stageFx', 'reactive'); LabHudStage.setMode('reactive');
    out.measure.cost = rows;
    const on = rows.filter((r) => r.mode === 'reactive'); const off = rows.filter((r) => r.mode === 'off');
    const avg = (xs, k) => Math.round((xs.reduce((s, r) => s + (r[k] || 0), 0) / Math.max(1, xs.length)) * 100) / 100;
    const sum = { pageStageMsPerSec: avg(on, 'pageStageMsPerSec'), winStageMsPerSec: avg(on, 'winStageMsPerSec'), samplesPerSec: avg(on, 'samplesPerSec'), sampleAvgMs: avg(on, 'sampleAvgMs'),
      pageTaskOn: avg(on, 'pageTask'), pageTaskOff: avg(off, 'pageTask'), winTaskOn: avg(on, 'winTask'), winTaskOff: avg(off, 'winTask') };
    // at 60 fps "1 ms a frame" is 60 ms a second; the stage's own work must stay well under that on each side
    sum.perFrameMsAt60 = { page: Math.round((sum.pageStageMsPerSec / 60) * 1000) / 1000, window: Math.round((sum.winStageMsPerSec / 60) * 1000) / 1000 };
    out.measure.costSummary = sum;
    step('cost: the colour reading ≤ 4 a second, its main-thread work in the preview page and the pulses / tint / labels in the window each under 1 ms a frame (well under 60 ms a second)', sum.samplesPerSec <= 4.4 && sum.samplesPerSec >= 1 && sum.pageStageMsPerSec < 20 && sum.winStageMsPerSec < 20 && off.every((r) => !r.samplesPerSec && !r.feeds), sum);
  });
} catch (err) { step(`threw: ${err.stack || err.message}`, false); }
try { c?.play(false); } catch { /* stopped */ }
document.documentElement.dataset.motion = '';
await RS.close?.();
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
