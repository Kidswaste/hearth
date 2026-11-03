// realscene-lib (round 109, labchecks109): ONE shared "real scene" for the Lab's frame-timing checks, built like the
// owner's music visuals (docs/upgrades/labchecks109.md). Round 107's frame gate shipped a runaway that only a scene with
// two or more frame loops showed (fps107's check scene had one loop); every Lab check that times frames now also runs
// this scene and asserts no runaway. Not a check: a helper put in front of a check by dev/smoke.js when the check uses
// RS.<…> (its AUTO list), or with --lib dev/checks/realscene-lib.js.
// The scene (made from the bundled "Beat burst" demo scene, never an owner's scene; its files in the check's own temp
// folder):
//   Backdrop        the demo's liquid-gradient shader layer (its own animation loop)
//   Beat burst      the demo's 30,000 particles bursting on the kick (setAnimationLoop)
//   🧊 RS bot        a lab3d model layer: a .gltf with its .bin and a 1024² colour picture in textures/, turntable,
//                   pulse and glow on the kick (lab3d's own per-frame model update)
//   Beat rig        a raw requestAnimationFrame loop of its own, plus the Lab's beat helpers: onHit('kick'),
//                   onHit('snare'), onHit('beat'), everyBeats(2), onBar: six frame loops in one layer
//   ✦ Bloom         the demo's post-processing filter, on top of everything
//   a song          124 BPM: a kick on each beat, a snare on 2 and 4, hats on the eighths; ⚡ kick / snare / hats
//                   triggers set on it, playing
// API (inside a check, in Hearth's window):
//   RS.install()          the switchable fake screen in every Lab preview page made from now on (fps107's: frames
//                         answered on a 240-a-second grid while the page is really drawn); off (the real screen's
//                         frames, counted) until RS.hz(240). A check with its own window.__fps107 probe keeps it.
//   RS.open(opts)         makes the files and the scene, loads the song, sets the triggers, plays → info
//   RS.hz(n)              the fake screen's rate in the preview page (0: the real screen's frames)
//   RS.watch(ms)          plays ms and measures: the page's frame callbacks a second (all of its loops, per page
//                         frame), the guard's state (window.__labRunaway: the busiest loop's calls a second against the
//                         screen's rate), graphics-context events, the rig's loops still running
//   RS.problems(r, name)  what is wrong in a watch: [] when fine (see RS.B for the bounds)
//   RS.close()            stops the song
const RS = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 20000, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
  const TMP = window.SMOKE_TMP || '/tmp';
  const DIR = `${TMP}/hearth-realscene109`;
  const BPM = 124;
  // bounds: a frame loop runs once a frame; the scene's page runs about 8–12 of the page's own loops a frame (the
  // frame counter, the compositor, the song's tick, the layers' flush, …): 24 per page frame is twice that, and the
  // runaway was hundreds. And never more frame callbacks a second than 24 × the fake screen's rate (240).
  const B = { perFrame: 24, perSec: 24 * 240, ...(window.RS109_BOUNDS || {}) };
  const S = { gl: [], installed: false, info: null };
  addEventListener('hearth:lab-gl', (e) => S.gl.push({ at: Math.round(performance.now()), state: e.detail?.state, how: e.detail?.how || null }));

  // ---------- the switchable fake screen (fps107's, beat108's setHz; hz 0 = the real screen's frames, counted) ----------
  const probe = () => {
    if (window.__fps107) return;
    if (location.protocol === 'about:') return;
    const raw = { st: window.setTimeout, si: window.setInterval, raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame, now: performance.now.bind(performance) };
    const P = window.__fps107 = { hz: 0, ticks: 0, busy: 0, n: { raf: 0, timeout: 0, interval: 0 }, since: raw.now(), raw, rs: true };
    const q = new Map(); let id = 1e9; let realOn = false; let lastReal = -1; let timer = 0; let empty = 0; let lastT = -1;
    const rci = window.clearInterval.bind(window);
    const fire = () => {
      P.ticks += 1;
      if (!q.size) return;
      P.busy += 1;
      const t = raw.now(); const list = [...q.values()]; q.clear();
      for (const cb of list) { P.n.raf += 1; try { cb(t); } catch (err) { raw.st.call(window, () => { throw err; }); } }
    };
    const want = () => { if (!realOn) { realOn = true; raw.raf.call(window, real); } };
    function real() { lastReal = raw.now(); if (q.size || timer) raw.raf.call(window, real); else realOn = false; arm(); }
    function arm() {
      if (timer || !q.size || !P.hz) return;
      want();
      if (raw.now() - lastReal > 100) return;
      empty = 0;
      timer = raw.si.call(window, () => {
        if (raw.now() - lastReal > 100) { rci(timer); timer = 0; want(); return; }
        if (!q.size) { empty += 1; if (empty > 3) { rci(timer); timer = 0; } return; }
        empty = 0; fire();
      }, 1000 / P.hz);
    }
    // the real screen's frames, counted the same way (a page frame: a new frame time)
    const pass = (cb) => raw.raf.call(window, (t) => { if (t !== lastT) { lastT = t; P.busy += 1; } P.n.raf += 1; cb(t); });
    window.requestAnimationFrame = function (cb) {
      if (typeof cb !== 'function') return raw.raf.call(window, cb);
      if (!P.hz) return pass(cb);
      id += 1; q.set(id, cb); arm(); return id;
    };
    window.cancelAnimationFrame = function (i) { if (!q.delete(i)) raw.caf.call(window, i); };
    for (const [name, kind] of [['setTimeout', 'timeout'], ['setInterval', 'interval']]) {
      const orig = raw[name === 'setTimeout' ? 'st' : 'si'];
      window[name] = function (fn, ...rest) { if (typeof fn !== 'function') return orig.call(window, fn, ...rest); return orig.call(window, function (...a) { P.n[kind] += 1; return fn.apply(this, a); }, ...rest); };
    }
    P.setHz = (hz) => {
      P.hz = Number(hz) || 0;
      if (timer) { rci(timer); timer = 0; }
      if (!P.hz) { const list = [...q.values()]; q.clear(); for (const cb of list) pass(cb); } else arm(); // (back to the real screen: what waited goes to it)
      return P.hz;
    };
    const fakeRaf = window.requestAnimationFrame;
    P.screen = (ms = 1000) => new Promise((res) => { let n = 0; const t0 = raw.now(); const go = () => { n += 1; if (raw.now() - t0 < ms) fakeRaf(go); else res(Math.round((n * 10000) / (raw.now() - t0)) / 10); }; fakeRaf(go); });
    P.take = () => { const ms = raw.now() - P.since; const per = (x) => Math.round((x * 10000) / ms) / 10; const r = { s: Math.round(ms / 100) / 10, framesPerSec: per(P.busy), rafPerSec: per(P.n.raf), timersPerSec: per(P.n.timeout + P.n.interval) }; P.n = { raf: 0, timeout: 0, interval: 0 }; P.busy = 0; P.since = raw.now(); return r; };
  };
  async function install() {
    if (S.installed) return;
    S.installed = true;
    await smoke({ frameScript: { match: '', source: `if (/three-sandbox/.test(location.href) && !/silent=1/.test(location.href)) (${probe.toString()})();` } });
  }

  // ---------- the preview page ----------
  const D = () => ThreeLab.director;
  const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
  const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : null; };
  const toPage = (msg) => pv(`postMessage(${JSON.stringify({ target: 'three-sandbox', ...msg })}, '*'); return 1`);
  const hz = async (n) => pv(`return window.__fps107 && window.__fps107.setHz ? window.__fps107.setHz(${Number(n) || 0}) : (${Number(n) || 0} === (window.__fps107?.hz || 0) ? window.__fps107?.hz || 0 : null)`);

  // ---------- the files: a song with drums, a textured model ----------
  async function song(file, secs = 45) {
    const sr = 44100; const n = Math.round(secs * sr); const x = new Float32Array(n); const beat = 60 / BPM;
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 1073741823.5 - 1; };
    const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i += 1) x[a + i] += f(i / sr); };
    for (let k = 0; 0.2 + k * beat < secs - 0.5; k += 1) {
      const t = 0.2 + k * beat;
      add(t, 0.25, (u) => 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-u * 30)) * u) * Math.exp(-u * 14)); // kick
      if (k % 2 === 1) add(t, 0.12, (u) => (0.35 * rnd() + 0.25 * Math.sin(2 * Math.PI * 2200 * u)) * Math.exp(-u * 30)); // snare (2 and 4)
      add(t + beat / 2, 0.04, (u) => 0.18 * rnd() * Math.exp(-u * 90)); // hats
    }
    let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
    const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, str) => [...str].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i += 1) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
    await window.hub.fs.write(file, new Uint8Array(data.buffer));
  }
  const png = async (size) => { const cv = new OffscreenCanvas(size, size); const g = cv.getContext('2d'); for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) { g.fillStyle = `hsl(${(x * 22 + y * 9) % 360} 70% ${(x + y) % 2 ? 35 : 60}%)`; g.fillRect((x * size) / 16, (y * size) / 16, size / 16, size / 16); } return new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
  // a cube .gltf with normals and UVs, its .bin in buffers/ and its colour picture in textures/
  function gltf() {
    const P = []; const N = []; const U = []; const I = [];
    for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
      const b = P.length / 3; const u = (ax + 1) % 3; const v = (ax + 2) % 3;
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[ax] = 0.5 * sg; p[u] = 0.5 * a * sg; p[v] = 0.5 * c; P.push(...p); const nn = [0, 0, 0]; nn[ax] = sg; N.push(...nn); U.push((a + 1) / 2, (1 - c) / 2); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const parts = [new Float32Array(P), new Float32Array(N), new Float32Array(U), new Uint16Array(I)].map((a) => new Uint8Array(a.buffer));
    const views = []; let off = 0; for (const p of parts) { views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); off += (p.length + 3) & ~3; }
    const bin = new Uint8Array(off); views.forEach((v, i) => bin.set(parts[i], v.byteOffset));
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.3, roughnessFactor: 0.5 } }], textures: [{ source: 0 }], images: [{ uri: 'textures/paint.png' }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: 24, type: 'VEC2' }, { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' }],
      bufferViews: views, buffers: [{ uri: 'buffers/bot.bin', byteLength: bin.length }] };
    return { json, bin };
  }
  async function files() {
    const f = { song: `${DIR}/song124.wav`, model: `${DIR}/bot/bot.gltf` };
    await song(f.song);
    const g = gltf();
    await window.hub.fs.write(f.model, JSON.stringify(g.json, null, 1));
    await window.hub.fs.write(`${DIR}/bot/buffers/bot.bin`, g.bin);
    await window.hub.fs.write(`${DIR}/bot/textures/paint.png`, await png(1024));
    return f;
  }

  // ---------- the layers added on the demo scene ----------
  const MODEL = (ref) => `// 🧊 RS bot: a 3D model (refs.${ref}) drawn by lab3d.model, as the Lab's /model add makes it
const P = tweak({
  spin: { value: 1.2, min: -5, max: 5, label: 'Turntable (turns / 10 s)', group: 'Model' },
  pulse: { value: 0.6, min: 0, max: 2, label: 'Pulse on kick', group: 'Music' },
  kickGlow: { value: 1, min: 0, max: 3, label: 'Glow on kick', group: 'Music' },
  ground: { value: 'none', options: ['none', 'shadow'], label: 'Ground', group: 'World' },
  sky: { value: 'clear', options: ['clear', 'hdri', 'color'], label: 'Backdrop', group: 'World' },
});
lab3d.model(refs.${ref}, P, { name: 'rsbot' });
`;
  const RIG = `import * as THREE from 'three';
// a beat rig: a raw frame loop of its own and the Lab's beat helpers (each one a frame loop of the page's)
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const rings = []; for (let i = 0; i < 6; i += 1) { const m = new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.35, 0.02, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 6, 0.8, 0.6), transparent: true, opacity: 0.6 })); scene.add(m); rings.push(m); }
const R = window.__rs109 || (window.__rs109 = { raf: 0, kick: 0, snare: 0, beat: 0, every: 0, bar: 0 });
let flash = 0; let hue = 0;
onHit('kick', (v) => { R.kick += 1; flash = 1; });
onHit('snare', () => { R.snare += 1; hue = (hue + 0.17) % 1; });
onHit('beat', () => { R.beat += 1; });
everyBeats(2, () => { R.every += 1; });
onBar(() => { R.bar += 1; });
function loop(t) {
  R.raf += 1;
  flash *= 0.9;
  rings.forEach((m, i) => { m.rotation.z = t / (900 + i * 300); m.scale.setScalar(1 + flash * 0.15 * (6 - i) / 6); m.material.color.setHSL((hue + i / 6) % 1, 0.8, 0.5 + 0.3 * flash); });
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);`;

  // ---------- the scene ----------
  async function open({ size = [192, 108], play = true, particles = 4 } = {}) {
    const info = { steps: [] };
    const c = await ThreeLab.cmd();
    try { c.customSize(size[0], size[1]); c.size('custom'); } catch { /* the default size */ }
    if (typeof LabGallery === 'undefined') await Lazy.load('gallery');
    await until(() => typeof LabGallery !== 'undefined' && typeof LabGalleryData !== 'undefined', 20000);
    const item = LabGallery.items().find((x) => x.key === 'b:beat-burst') || LabGallery.items().find((x) => x.kind === 'start' && x.id === 'beat-burst');
    if (!item) throw new Error('the bundled "Beat burst" demo scene is not in the gallery');
    const f = await files();
    await LabGallery.use(item);
    info.demo = Boolean(await until(() => D().report().sketch?.startsWith(item.name), 15000));
    await until(async () => { const v = await pv('return window.__labPace.state().frameTick'); return typeof v === 'number' && v > 1; }, 30000);
    // (its Particles slider down to 4 thousand, as the owner would on a slow machine: this software GPU has to keep up
    // with the 60 drawn frames for the frame gate to hold frames between them, which is where round 107's runaway was)
    try { const bc = (await D().codeOf('Beat burst'))?.code; const nc = bc && bc.replace(/(\n\s*count: \{ value: )([^,]+)(,)/, `$1${particles}$3`); if (nc && nc !== bc) await D().updateLayer('Beat burst', { code: nc }, 1); info.particles = particles; } catch (err) { info.particles = String(err); }
    // the model: its folder copied into the Lab's references, a 🧊 layer under the bloom
    const ref = await D().refs.add(f.model, 'rsbot');
    const key = ref?.key || D().refs.list().find((x) => /rsbot|bot\.gltf/.test(`${x.key} ${x.path || ''}`))?.key || 'rsbot';
    const n0 = D().layers().layers.length; // (Backdrop, Beat burst, ✦ Bloom)
    await D().addLayer({ name: '🧊 RS bot', code: MODEL(key), position: n0 }, 1);
    await D().addLayer({ name: 'Beat rig', code: RIG, position: n0 + 1 }, 1);
    info.layers = D().layers().layers.map((l) => l.name);
    info.model = await until(async () => { const l = await pj("(globalThis.lab3d?.list() || []).find((x) => x.name === 'rsbot') || null"); return l && (l.loaded || l.error) ? l : null; }, 60000, 300);
    // the song, analysed, ⚡ triggers on it
    const r = await c.loadSong(f.song);
    info.song = Boolean(r?.ok) && Boolean(await until(() => c.state.bpm > 0, 30000));
    info.bpm = c.state.bpm;
    await toPage({ type: 'triggers-set', cfg: { kick: { on: true, lo: 40, hi: 120, thr: 0.5, gap: 200, fade: 120 }, snare: { on: true, lo: 1500, hi: 4500, thr: 0.35, gap: 140 }, hats: { on: true, lo: 6000, hi: 15000, thr: 0.3, gap: 90 } } });
    if (play) { c.seek(1); await wait(200); c.play(true); }
    info.probe = await pj('({ screen: Boolean(window.__fps107), switchable: Boolean(window.__fps107 && window.__fps107.setHz), guard: Boolean(window.__labRunaway) })');
    S.info = info;
    return info;
  }

  // ---------- a watch: ms of the scene playing ----------
  async function watch(ms = 6000) {
    const gl0 = S.gl.length; const notes0 = ThreeLab.gl.state().runaway?.length || 0;
    const r0 = await pj('window.__rs109 || null');
    const gate0 = await pj('window.__labBeat ? window.__labBeat.state() : null');
    await pv('window.__labRunaway && window.__labRunaway.reset(); window.__fps107 && window.__fps107.take(); return 1');
    const d0 = await pj('window.__labPace.state().drawn'); const t0 = performance.now();
    await wait(ms);
    const page = await pj('window.__fps107 ? window.__fps107.take() : null');
    const d1 = await pj('window.__labPace.state().drawn');
    const sec = (performance.now() - t0) / 1000;
    const guard = await pj('window.__labRunaway ? window.__labRunaway.state() : null');
    const gate = await pj('window.__labBeat ? window.__labBeat.state() : null');
    const r1 = await pj('window.__rs109 || null');
    const gls = ThreeLab.gl.state();
    const loops = r0 && r1 ? Object.fromEntries(Object.keys(r1).map((k) => [k, r1[k] - (r0[k] || 0)])) : r1;
    const out = { s: Math.round(sec * 10) / 10, page, drawnPerSec: Math.round(((d1 - d0) / sec) * 10) / 10, perFrame: page && page.framesPerSec ? Math.round((page.rafPerSec / page.framesPerSec) * 10) / 10 : null,
      guard, gateHeldPerSec: gate && gate0 ? Math.round(((gate.gateHeld - gate0.gateHeld) / sec) * 10) / 10 : null, gateScr: gate ? gate.gateScr : null, loops, gl: S.gl.slice(gl0), glPhase: gls.phase, runawayNotes: (gls.runaway || []).slice(notes0) };
    return out;
  }
  // what is wrong in a watch ([] when fine)
  function problems(w, name = 'real scene') {
    const p = [];
    const bad = (ok, what) => { if (!ok) p.push(`${name}: ${what}`); };
    bad(w && w.page, `the page's frame callbacks weren't counted (${JSON.stringify(w?.page)})`);
    if (!w || !w.page) return p;
    bad(w.perFrame != null && w.perFrame <= B.perFrame, `no runaway: ≤ ${B.perFrame} frame callbacks per page frame (${w.perFrame}: ${w.page.rafPerSec}/s over ${w.page.framesPerSec} frames/s)`);
    bad(w.page.rafPerSec <= B.perSec, `no runaway: ≤ ${B.perSec} frame callbacks a second (${w.page.rafPerSec})`);
    bad(w.guard && !w.guard.tripped && w.guard.trips === 0, `the page's runaway guard never tripped (${JSON.stringify(w.guard)})`);
    bad(w.guard && w.guard.peakLoopPerSec <= w.guard.limit && w.guard.peakLoopPerFrame <= 1 && !w.guard.dropped, `no frame loop over 4× the screen's rate nor run twice in one frame (busiest ${w.guard?.peakLoopPerSec}/s, limit ${w.guard?.limit}/s; ${w.guard?.peakLoopPerFrame} in a frame, ${w.guard?.dropped} dropped)`);
    bad(!w.runawayNotes.length, `no frame-runaway note reached the Lab (${JSON.stringify(w.runawayNotes)})`);
    bad(!w.gl.some((e) => /lost|remaking/.test(e.state)) && !w.glPhase, `no graphics context lost (${JSON.stringify(w.gl)}, phase ${w.glPhase})`);
    bad(w.drawnPerSec > 1, `the preview drew (${w.drawnPerSec} frames a second)`);
    const L = w.loops || {};
    bad(L.raf > 0 && L.every > 0 && L.kick > 0, `the scene's frame loops ran: its raw loop, everyBeats, onHit('kick') (${JSON.stringify(L)})`);
    return p;
  }
  async function close() { try { (await ThreeLab.cmd()).play(false); } catch { /* gone */ } }
  return { install, open, watch, problems, close, hz, pv, pj, toPage, files, B, S, DIR, BPM, RIG, MODEL };
})();
