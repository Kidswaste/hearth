// ▶ Play's look (round 54, gamelook): a game at its best on this screen, never overriding what it chose, no cost to
// smoothness. A throwaway HTML game (in the run's scratch folder: <SMOKE_TMP>/hearth-gamelook/gamelook.html, three.js
// in its lib/) played three times through GameMode.play, then a throwaway Lab scene:
//   off       round 53's ▶ Play (no look): the baseline picture and frame time
//   best      the default: the same measurements; textures the game made late at the best anisotropy, a picture the
//             game left with no colour space shown in its real colours, the shadow map matched to the screen (closer to
//             a 4096² reference), the game's own choices kept (a 1024 spot shadow, a linear picture, anisotropy 4),
//             frame time not worse, the look's own CPU cost, the F chip's line, the guard's decision
//   balanced  sharp textures only: colours and shadows as the game sets them
//   lab       a Lab scene played as a page: the look sees its renderer (one canvas), shadows / colours / textures
//   ui        ▶ Play's right-click: one "Graphics" choice (Best / Balanced); /game look
//   files     the game's file byte for byte the same
// (a 960×600 screen: the software GPU here draws the full-screen game at a few frames a second at 1600×1000)
//   node dev/smoke.js --check-timeout 900000 --screen 960x600 --script dev/checks/gamelook.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 4 min`)), 240000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
// (round 56, fixes56) the game in this run's own scratch folder (dev/smoke.js --tmp), three.js copied from the ▶ Play fixture's
// lib/ (/tmp/hearth-gamemode/html/lib, read only): two runs at once never write the same file
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-gamelook`;
const FILE = `${DIR}/gamelook.html`;
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// ---------- the throwaway game ----------
// far stripes on two long strips seen at a grazing angle (the left one there from the start, the right one made once
// the game plays: a level streaming in, game.addLate()), a box casting a shadow from a sun whose map the game left at 512², a spot light
// whose map the game set to 1024 itself, two red swatches (one picture with no colour space, one the game marked
// linear) and a picture the game set to anisotropy 4. No tone mapping, three's default sRGB output.
const GAME = `<!doctype html><html><head><meta charset="utf-8"><title>Look test (Hearth)</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; }</style>
<script type="importmap">{ "imports": { "three": "./lib/three.module.js" } }</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#203040');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300); camera.position.set(0, 2, 8); camera.lookAt(0, 1, 0);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const canvas = (n, draw) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); return new THREE.CanvasTexture(c); };
const stripes = () => { const t = canvas(512, (g, n) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#000000'; g.fillRect(i * n / 16, 0, n / 16, n); } }); t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 40); return t; };
const solid = (css) => canvas(16, (g, n) => { g.fillStyle = css; g.fillRect(0, 0, n, n); });
const strip = (t, x) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 120), new THREE.MeshBasicMaterial({ map: t })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, -66); scene.add(m); return m; };
const t1 = stripes(); strip(t1, -1.6);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), new THREE.MeshStandardMaterial({ color: '#b0b0b0', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#8899aa' }));
box.position.set(0.6, 0.75, 1); box.rotation.y = 0.5; box.castShadow = true; scene.add(box);
const sun = new THREE.DirectionalLight('#ffffff', 2.5); sun.position.set(4, 8, 3); sun.castShadow = true; scene.add(sun, new THREE.AmbientLight('#ffffff', 0.5));
const spot = new THREE.SpotLight('#ffffff', 4, 30, 0.5); spot.position.set(-6, 7, 4); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); scene.add(spot);
const sw = (t, x) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, 2.7, 0); scene.add(m); return m; };
const swatch = solid('#c83c28'); sw(swatch, -3.2);
const swatchLin = solid('#c83c28'); swatchLin.colorSpace = THREE.LinearSRGBColorSpace; sw(swatchLin, -2.1);
const aniso4 = stripes(); aniso4.anisotropy = 4; aniso4.colorSpace = THREE.SRGBColorSpace; sw(aniso4, 3.2);
const G = window.game = { THREE, renderer, scene, camera, sun, spot, t1, t2: null, swatch, swatchLin, aniso4, cpu: [], frames: 0, late: false };
G.addLate = () => { if (!G.late) { G.t2 = stripes(); strip(G.t2, 1.6); G.late = true; } return true; };
renderer.setAnimationLoop(() => {
  const a = performance.now(); renderer.render(scene, camera); G.cpu.push(performance.now() - a); if (G.cpu.length > 600) G.cpu.splice(0, 300); G.frames++;
});
</script></body></html>`;

// the measurements, inside the game's page: one frame drawn and read back in the same task (no preserveDrawingBuffer)
// shadowAt: the sun's map size for the picture (Best's screen-matched size, as on a machine where it fits)
const MEASURE = (shadowAt) => `(async () => {
  const G = window.game; const r = G.renderer; const gl = r.getContext(); const W = gl.drawingBufferWidth; const H = gl.drawingBufferHeight;
  const read = () => { r.render(G.scene, G.camera); const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const at = (x, y, z) => { const v = new G.THREE.Vector3(x, y, z).project(G.camera); return [Math.round((v.x + 1) / 2 * W), Math.round((v.y + 1) / 2 * H)]; };
  const avg = (px, [cx, cy], rad) => { const s = [0, 0, 0]; let n = 0; for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) { const i = (y * W + x) * 4; s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; } return s.map((v) => Math.round(v / n)); };
  // the stripes' contrast across a strip, far away (z = -40): luminance spread of the middle 70 % of its width, ±2 rows
  const contrast = (px, x0, x1) => { const [a, ya] = at(x0, 0, -40); const [b] = at(x1, 0, -40); const w = b - a; const l = []; for (let y = ya - 2; y <= ya + 2; y++) for (let x = Math.round(a + w * 0.15); x <= Math.round(b - w * 0.15); x++) { const i = (y * W + x) * 4; l.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]); } const m = l.reduce((s, v) => s + v, 0) / l.length; return +Math.sqrt(l.reduce((s, v) => s + (v - m) * (v - m), 0) / l.length).toFixed(2); };
  const sh = G.sun.shadow; const was = sh.mapSize.x;
  const size = (s) => { sh.mapSize.set(s, s); if (sh.map) { sh.map.dispose(); sh.map = null; } };
  const shown = ${Number(shadowAt) || 0} || was; if (shown !== was) size(shown);
  const px = read();
  const o = { W, H, shown, swatch: avg(px, at(-3.2, 2.7, 0), 4), swatchLin: avg(px, at(-2.1, 2.7, 0), 4), near: contrast(px, -3.0, -0.2), late: contrast(px, 0.2, 3.0),
    tex: { t1: G.t1.anisotropy, t2: G.t2 && G.t2.anisotropy, aniso4: G.aniso4.anisotropy, swatch: G.swatch.colorSpace, swatchLin: G.swatchLin.colorSpace },
    sun: was, spot: G.spot.shadow.mapSize.x, maxAniso: r.capabilities.getMaxAnisotropy() };
  // the shadow against a 4096² reference of the same frame: mean difference over the ground near the box (0–255)
  size(4096); const ref = read(); size(was); read();
  const [xa, ya] = at(-4, 0, 4); const [xb, yb] = at(4, 0, -4);
  let d = 0; let n = 0; let big = 0;
  for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y += 1) for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x += 1) { const i = (y * W + x) * 4; const e = Math.abs(px[i] - ref[i]) + Math.abs(px[i + 1] - ref[i + 1]) + Math.abs(px[i + 2] - ref[i + 2]); d += e / 3; n++; if (e / 3 > 16) big++; }
  o.shadowDiff = +(d / n).toFixed(3); o.shadowOff = +(100 * big / n).toFixed(3);
  // frame time: three 2 s windows of the game's own frames (gaps between frames it drew; its render() call on the CPU);
  // the calmest window counts (the software GPU here is shared with other work: a busy moment isn't the game's)
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2) : null; };
  const win = async () => { const gaps = []; let last = 0; let f0 = G.frames; G.cpu.length = 0; await new Promise((res) => { const t0 = performance.now(); const f = (t) => { if (last && G.frames !== f0) gaps.push(t - last); f0 = G.frames; last = t; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return { n: gaps.length, p50: q(gaps, 0.5), p95: q(gaps, 0.95), cpuP50: q(G.cpu, 0.5) }; };
  const wins = []; for (let i = 0; i < 3; i++) wins.push(await win());
  o.frame = { ...wins.slice().sort((x, y) => x.p50 - y.p50)[0], windows: wins.map((w) => w.p50) };
  o.look = window.__gameLook ? window.__gameLook.report() : null;
  o.text = window.__gameLook ? window.__gameLook.text() : null;
  return JSON.stringify(o);
})()`;

// (round 56, fixes56) the look on vs stepped aside IN THE SAME PLAY, in alternating blocks (on/off, then off/on: ABBA),
// so a busy moment of the machine falls on both sides: the two plays above are minutes apart, and on a loaded machine
// (≈ 12 fps, a load of 13) "best" read 100 ms vs "off" 83 ms though nothing of the look ran per frame. Stepped aside =
// playbudget's own switch (tools/playbudget-page.js): the look's hooks pass straight through and the shadow maps go back
// to the game's own size, the same picture "off" draws. Each block skips the frames right after a switch (the shadow
// maps made again), then counts ≥ 12 frames (≈ 1 s at 12 fps); per pair, on − off of the median gap and of the
// game's render() CPU time.
const AB = `(async () => {
  const G = window.game; const B = window.__gameLook && window.__gameLook.budget; if (!B) return 'null';
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2) : null; };
  const frames = (n, ms) => new Promise((res) => { const f0 = G.frames; const t0 = performance.now(); const f = () => (G.frames - f0 < n && performance.now() - t0 < ms ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
  const block = async (on) => {
    B.pause(!on); B.picture(on);
    await frames(3, 3000);
    const gaps = []; let last = 0; let f0 = G.frames; G.cpu.length = 0; const t0 = performance.now();
    await new Promise((res) => { const f = (t) => { if (last && G.frames !== f0) gaps.push(t - last); f0 = G.frames; last = t; const el = performance.now() - t0; if ((gaps.length < 12 && el < 2500) || (gaps.length < 4 && el < 8000)) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const tm = (a) => { const s = a.slice().sort((x, y) => x - y).slice(0, Math.max(1, Math.ceil(a.length * 0.9))); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
    return { p50: q(gaps, 0.5), mean: tm(gaps), cpu: q(G.cpu, 0.5), n: gaps.length };
  };
  const pairs = [];
  try {
    for (let i = 0; i < 6; i++) { const onFirst = i % 2 === 0; const a = await block(onFirst); const b = await block(!onFirst); const on = onFirst ? a : b; const off = onFirst ? b : a; pairs.push({ on: on.p50, off: off.p50, d: +(on.p50 - off.p50).toFixed(2), dm: +(on.mean - off.mean).toFixed(2), offMean: +off.mean.toFixed(2), cpuOn: on.cpu, cpuOff: off.cpu, n: [on.n, off.n] }); }
  } finally { B.pause(false); B.picture(true); }
  const ok = pairs.filter((p) => p.on != null && p.off != null);
  const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  return JSON.stringify({ pairs, d: q(ok.map((p) => p.d), 0.5), dMean: avg(ok.map((p) => p.dm)), offMean: avg(ok.map((p) => p.offMean)), off: q(ok.map((p) => p.off), 0.5), on: q(ok.map((p) => p.on), 0.5), cpuD: q(ok.map((p) => p.cpuOn - p.cpuOff), 0.5), cpuOff: q(ok.map((p) => p.cpuOff), 0.5), slower: ok.filter((p) => p.d > 0).length, of: ok.length });
})()`;

await Lazy.load('gamemode');
const src = { kind: 'html', path: FILE, title: 'Look test' };
async function playOnce(look) {
  store.set('gamemode.look', look);
  await GameMode.play(src);
  await until(async () => (await GW().state())?.playing, 60000);
  await until(() => ev('Boolean(window.game && window.game.frames > 10 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 120000);
  await ev('window.game.addLate()'); await until(() => ev('window.game.frames'), 5000);
  const settled = await ev('window.__gameLook ? window.__gameLook.settle().then((r) => JSON.stringify(r)) : "null"').catch(() => null);
  await wait(600);
  const st = settled ? JSON.parse(settled) : null;
  const m = JSON.parse(await ev(MEASURE(st?.shadows?.to || 0)));
  m.settled = st;
  return m;
}
async function leaveGame() { await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800); }

let hashBefore = null;
await safe('fixture', async () => {
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`/tmp/hearth-gamemode/html/lib/${f}`, `${DIR}/lib/${f}`);
  await window.hub.fs.write(FILE, GAME);
  hashBefore = await window.hub.gameReady.hash([FILE]);
  step('fixture: a throwaway three.js game next to ▶ Play\'s test game (three.js in its lib/)', hashBefore?.[0]?.hash, hashBefore);
});

let off = null; let best = null; let bal = null;
await safe('off', async () => {
  off = await playOnce('off'); out.measure.off = off;
  step('off: round 53\'s ▶ Play (no look in the page), the scene drawn and measured', !off.look && off.frame.n > 0 && off.near >= 0, { look: off.look, frame: off.frame });
  await leaveGame();
});
await safe('best', async () => {
  best = await playOnce('best'); out.measure.best = best;
  const L = best.look || {};
  step('best: the look saw the game\'s renderer and scene before its first frame (three.js r' + (L.three || '?') + ')', L.renderers >= 1 && L.cost?.sweeps >= 1, { renderers: L.renderers, three: L.three, cost: L.cost });
  step('best: the texture the game made late gets the best anisotropy too (off: 1)', best.tex.t2 === best.maxAniso && best.maxAniso > 1 && off?.tex.t2 === 1, { best: best.tex, off: off?.tex, max: best.maxAniso, later: L.aniso?.later });
  step('best: the late stripes are sharper far away (contrast across the strip higher than off)', off && best.late > off.late * 1.15, { off: off?.late, best: best.late, nearOff: off?.near, nearBest: best.near });
  step('best: the picture the game left with no colour space is shown in its real colours (#c83c28 = 200, 60, 40)', best.tex.swatch === 'srgb' && best.swatch.every((v, i) => Math.abs(v - [200, 60, 40][i]) <= 4) && off && Math.abs(off.swatch[0] - 200) > 15, { best: best.swatch, off: off?.swatch });
  step('best: the shadow map matched to the screen (512² → its size): the picture closer to a 4096² reference than off', best.shown > 512 && best.shown === L.shadows?.to && off && best.shadowDiff < off.shadowDiff * 0.8, { shown: best.shown, now: best.sun, screen: L.screen, diffOff: off?.shadowDiff, diffBest: best.shadowDiff, pxOffOff: off?.shadowOff, pxOffBest: best.shadowOff });
  step('best: what the game chose itself is kept (its 1024 spot shadow, its linear picture, its anisotropy 4)', best.spot === 1024 && best.tex.swatchLin === 'srgb-linear' && best.tex.aniso4 === 4 && off && best.swatchLin.every((v, i) => Math.abs(v - off.swatchLin[i]) <= 2), { spot: best.spot, lin: best.tex.swatchLin, a4: best.tex.aniso4, swOff: off?.swatchLin, swBest: best.swatchLin });
  const gs = L.guardMs?.steps || [];
  // (round 56, shadowready) the size is chosen under Getting ready's card; while playing the guard only watches (and at
  // most swaps in the smaller maps made there): nothing made while playing
  step('best: the shadow size chosen while getting ready (the A/B), the guard watching without making anything', L.shadows?.chosen?.by === 'ready' && L.shadows.chosen.size <= L.shadows.to && L.shadows.midPlay === 0 && ['fits', 'tight', 'lowered', 'not-shadows', 'held'].includes(L.guard) && (L.guard === 'lowered' ? best.sun === L.shadows.fallback : best.sun === L.shadows.chosen.size), { guard: L.guard, steps: gs, chosen: L.shadows?.chosen, now: L.shadows?.now, sun: best.sun, made: L.shadows?.made, midPlay: L.shadows?.midPlay });
  // smoothness: the game's frame time no worse than off, the look's own work tiny. (round 56, fixes56) Judged on the
  // interleaved A/B above, 6 pairs of blocks:
  //   CPU      the game's render() call (the look's hooks run inside it) on − off: median within 15 % / 0.5 ms, always
  //   frames   the mean gap on − off (averaged over the pairs; medians of gaps jump by a whole refresh) within 15 % /
  //            2 ms, unless the game is load-bound here (off under 25 fps: a shared software GPU on a busy machine, where
  //            the gaps are the machine's, not the look's: ±1 refresh pair to pair)
  //   plays    the two separate plays still agree roughly (best within 1.5× off + 2 ms: a look that slows the game even
  //            when stepped aside, gamefps54's kind of "abysmal", still fails)
  const ab = await ev(AB).then((v) => JSON.parse(v)).catch((err) => ({ error: String(err) }));
  out.measure.ab = ab;
  const worse = off ? best.frame.p50 - off.frame.p50 : null;
  const cpuOk = ab && ab.of >= 4 && ab.cpuD != null && ab.cpuD <= Math.max(0.5, (ab.cpuOff || 0) * 0.15);
  const gapOk = ab && ab.dMean != null && ab.dMean <= Math.max(2, ab.offMean * 0.15);
  const loadBound = ab && ab.offMean > 40;
  const abOk = cpuOk && (gapOk || loadBound);
  const playsOk = off && worse <= Math.max(2, off.frame.p50 * 0.15);
  const roughOk = off && best.frame.p50 <= off.frame.p50 * 1.5 + 2;
  step('best: frame time not worse than off (on vs stepped aside in the same play, 6 interleaved pairs: render CPU within 15 % / 0.5 ms; mean frame gap within 15 % / 2 ms unless load-bound; the two plays within 1.5×)', abOk && roughOk, { ab: ab && { cpuD: ab.cpuD, cpuOff: ab.cpuOff, dMean: ab.dMean, offMean: ab.offMean, loadBound, gapOk, d: ab.d, on: ab.on, off: ab.off, slower: `${ab.slower}/${ab.of}`, error: ab.error }, plays: { off: off?.frame, best: best.frame, within15: Boolean(playsOk) } });
  step('best: the look\'s own CPU work is small (a look at the scene ≈ 0.1 ms on average, the first, before the first frame, with the shadow maps made again under 10 ms)', L.cost && (L.cost.sweeps < 2 || (L.cost.ms - L.cost.max) / (L.cost.sweeps - 1) < 0.5) && L.cost.max < 10, { ...L.cost, avg: L.cost && +(L.cost.ms / L.cost.sweeps).toFixed(3), avgAfterFirst: L.cost && L.cost.sweeps > 1 ? +((L.cost.ms - L.cost.max) / (L.cost.sweeps - 1)).toFixed(3) : null }); // (round 56, fixes56: the first, whole-scene look has its own bound; under load it read 2.7 ms and alone made a 4-look average 0.69) // (round 57, framepace57: 10 ms — the performance probe no longer goes into every ▶ Play, so the look's first look, under the card, is now the first to ask the graphics card its limits (anisotropy, texture size: synchronous round trips) on a cold page: 5.8–8.2 ms here vs 2.9–4.3 with the probe in first; once, before the first frame)
  step('best: its line in plain words (the F chip\'s second line, the doctor)', /^Best look: textures \d+× sharp \(\d+\) · true colour on \d+ pictures? · (Shadows: \d+ \((chosen while getting ready|lowered from \d+)|Shadows: 512, the game's own)/.test(best.text || ''), best.text);
  // the F chip shows it
  await GW().key({ key: 'f' }).catch(() => {});
  const chip = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const l = r?.querySelector(".look"); return l && !l.hidden ? l.textContent : null; })()'), 4000);
  step('best: F shows the look under the stats chip', /^Best look:/.test(chip || ''), chip);
  await GW().key({ key: 'f' }).catch(() => {});
  out.measure.chip = chip;
  await leaveGame();
});
await safe('balanced', async () => {
  bal = await playOnce('balanced'); out.measure.balanced = { tex: bal.tex, sun: bal.sun, swatch: bal.swatch, late: bal.late, frame: bal.frame, text: bal.text, look: bal.look && { guard: bal.look.guard, aniso: bal.look.aniso, colour: bal.look.colour, shadows: bal.look.shadows } };
  step('balanced: sharp textures (the late one too), colours and shadows as the game sets them', bal.tex.t2 === bal.maxAniso && bal.tex.swatch === '' && bal.sun === 512 && bal.look?.colour === 0 && bal.look?.shadows?.set === 0, { tex: bal.tex, sun: bal.sun, look: bal.look && bal.look.shadows });
  step('balanced: its line says so', /^Balanced look: .*shadows and colours as the game sets them/.test(bal.text || ''), bal.text);
  await leaveGame();
});

// ---------- a Lab scene played as a page ----------
const LAB = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a2230');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 3, 7); camera.lookAt(0, 0.5, 0);
const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e0d0b0' : '#604830'; g.fillRect(i * 32, 0, 32, 256); }
const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: tex })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ff8a3d' })); box.position.y = 0.5; box.castShadow = true; scene.add(box);
const sun = new THREE.DirectionalLight('#ffffff', 2.5); sun.position.set(3, 6, 2); sun.castShadow = true; scene.add(sun, new THREE.AmbientLight('#ffffff', 0.4));
renderer.setAnimationLoop((t) => { box.rotation.y = t / 1000; renderer.render(scene, camera); });`;
const SCENE = 'gamelook1';
await safe('lab', async () => {
  const sk = ((await window.hub.kvGet('three-sketches', [])) || []).filter((x) => x.id !== SCENE);
  sk.push({ id: SCENE, name: 'Look scene', layers: [{ id: 'game', name: 'Game', code: LAB }], createdAt: Date.now(), updatedAt: Date.now() });
  await window.hub.kvSet('three-sketches', sk);
  store.set('gamemode.look', 'best');
  await GameMode.play({ kind: 'lab', id: SCENE, title: 'Look scene' });
  await until(async () => (await GW().state())?.playing, 60000);
  const r = await until(async () => { const v = await ev('window.__gameLook ? window.__gameLook.settle().then((r) => JSON.stringify(r)) : null'); const o = v && JSON.parse(v); return o && o.cost.sweeps > 0 && o.shadows.lights > 0 ? o : null; }, 120000);
  const text = await ev('window.__gameLook ? window.__gameLook.text() : ""').catch(() => '');
  out.measure.lab = { look: r, text };
  step('lab: a Lab scene\'s page gets the look too (its renderer seen, the ground picture in real colour, sharp, the shadow size chosen while getting ready)', r && r.renderers >= 1 && r.colour >= 1 && r.aniso.sharp >= 1 && r.shadows.set === 1 && r.shadows.to > 512 && r.shadows.chosen && r.shadows.midPlay === 0, { r: r && { renderers: r.renderers, colour: r.colour, aniso: r.aniso, shadows: r.shadows, guard: r.guard, cost: r.cost }, text });
  await leaveGame();
});

await safe('ui', async () => {
  store.set('gamemode.look', 'best');
  const items = await GameMode.menuItems();
  const g = items.find((x) => x && /^Graphics: /.test(x.label || ''));
  const sub = g ? (typeof g.items === 'function' ? g.items() : g.items) : [];
  step('ui: ▶ Play\'s right-click has one "Graphics" choice: Best (checked by default) / Balanced', g?.label === 'Graphics: Best' && sub.length === 2 && sub[0].label === 'Best' && sub[0].checked && sub[1].label === 'Balanced' && !sub[1].checked, { label: g?.label, sub: sub.map((x) => [x.label, x.checked]) });
  const said = await Commands.tryRun('/game look balanced', H.claudeAgent().id).catch((e) => String(e));
  const now = store.get('gamemode.look');
  await Commands.tryRun('/game look best', H.claudeAgent().id).catch(() => {});
  step('ui: /game look balanced | best switches it', now === 'balanced' && store.get('gamemode.look') === 'best', { now, said: typeof said === 'string' ? said : null });
});

await safe('files', async () => {
  const after = await window.hub.gameReady.hash([FILE]);
  step('files: the game\'s file byte for byte the same after three plays', hashBefore && after?.[0]?.hash === hashBefore[0].hash, after);
});
store.set('gamemode.look', 'best');
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, measure: out.measure }, null, 1);
