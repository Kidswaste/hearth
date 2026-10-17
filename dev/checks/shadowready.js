// ▶ Play's Best-look shadows chosen while getting ready (round 56, shadowready): the shadow size is decided under
// Getting ready's card and nothing is made on the graphics card once the game plays. A throwaway HTML game with a heavy
// sun shadow (its shadow pass costs time in proportion to the map's area: 2048² = 1.2 frames at the screen's refresh,
// 1024² = 0.3, 512² = 0.075; the game left the map at three's 512², so Best raises it to the screen's 2048²):
//   first     ▶ Play: the A/B under the card drew 2048 (too slow) and chose a smaller size that fits; that size and the
//             one below made under the card; then 22 s of play where the game's frames truly don't fit (it slows
//             itself down 1.5 frames a frame after the first second): 0 textures / render buffers / framebuffers /
//             shader compiles / program links / buffers made after the first frame (counted on WebGL's prototypes),
//             the guard swapped in the size made while getting ready (or said why it kept them), the F chip / doctor's
//             line "Shadows: N (chosen while getting ready)", the choice remembered for this game (budget.json)
//   again     the next ▶ Play starts at the remembered size: no 2048 ever made, the A/B confirms it ("remembered"),
//             nothing made after the first frame either
//   chat      /game look shadows (now + remembered), /game look shadows reset (chosen again next time)
//   files     the game's file byte for byte the same
// (a 1600×1000 screen at 200 %: the look's screen-matched size is 2048; the game draws at pixel ratio 1)
//   node dev/smoke.js --check-timeout 900000 --screen 1600x1000 --dpr 2 --script dev/checks/shadowready.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], runs: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 4 min`)), 240000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-shadowready';
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
await Lazy.load('gamemode');

const displays = await GW().displays().catch(() => []);
const HZ = Math.round((displays.find((d) => d.primary) || displays[0] || {}).hz || 60);
const FRAME = 1000 / HZ;
const GAME = `<!doctype html><html><head><meta charset="utf-8"><title>Shadow test (Hearth)</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; }</style>
<script type="importmap">{ "imports": { "three": "./lib/three.module.js" } }</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#203040');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 3, 8); camera.lookAt(0, 0.5, 0);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), new THREE.MeshStandardMaterial({ color: '#b0b0b0', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#8899aa' }));
box.position.set(0.6, 0.75, 1); box.castShadow = true; scene.add(box);
const sun = new THREE.DirectionalLight('#ffffff', 2.5); sun.position.set(4, 8, 3); sun.castShadow = true; scene.add(sun, new THREE.AmbientLight('#ffffff', 0.5));
// the heavy sun shadow: its pass costs time in proportion to the map's area (${(1.2 * FRAME).toFixed(1)} ms at 2048²)
const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* the shadow pass's work */ } };
box.onBeforeShadow = () => { const s = sun.shadow.mapSize.x / 2048; busy(${(1.2 * FRAME).toFixed(3)} * s * s); };
const G = window.game = { renderer, scene, sun, frames: 0, slow: false, gaps: [] };
let last = 0;
renderer.setAnimationLoop((t) => {
  if (last) G.gaps.push(t - last); last = t; if (G.gaps.length > 4000) G.gaps.splice(0, 2000);
  if (G.slow) busy(${(1.5 * FRAME).toFixed(3)}); // (the game's own frames truly don't fit: a heavy scene)
  box.rotation.y += 0.01; renderer.render(scene, camera); G.frames++;
});
</script></body></html>`;

// WebGL's prototypes counted from before the card goes: what's made, and whether the game was playing then
const COUNT = `(() => {
  if (window.__srCount) return 'already';
  const C = window.__srCount = { at: performance.now(), phaseAt: null, ev: [] };
  const M = ['createTexture', 'texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'createRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'createFramebuffer', 'createBuffer', 'bufferData', 'compileShader', 'linkProgram', 'createProgram'];
  for (const P of [window.WebGL2RenderingContext && WebGL2RenderingContext.prototype, window.WebGLRenderingContext && WebGLRenderingContext.prototype]) {
    if (!P) continue;
    for (const m of M) { const f = P[m]; if (typeof f !== 'function') continue; P[m] = function () { try { const g = window.__gameReady; if (g && g.phase === 'playing') C.ev.push([m, Math.round(performance.now() - (g.playAt || 0))]); } catch (e) { /* counting only */ } return f.apply(this, arguments); }; }
  }
  return JSON.stringify({ phase: window.__gameReady && window.__gameReady.phase });
})()`;
const READ = `JSON.stringify({ ev: window.__srCount ? window.__srCount.ev : null, look: window.__gameLook ? window.__gameLook.report() : null, text: window.__gameLook ? window.__gameLook.text() : null, ready: window.__gameReady ? JSON.parse(window.__gameReady.pub()) : null, budget: window.__hearthBudget ? JSON.parse(window.__hearthBudget.pub()) : null, frames: window.game ? window.game.frames : 0, sun: window.game ? window.game.sun.shadow.mapSize.x : 0, gap: (() => { const g = (window.game && window.game.gaps.slice(-120)) || []; g.sort((a, b) => a - b); return g.length ? +g[g.length >> 1].toFixed(2) : null; })() })`;
const SRC = { kind: 'html', path: `${DIR}/heavy.html`, title: 'Shadow test' };

// one ▶ Play: counted from under the card, the game slowed (or not) once it plays, n ms of play, read back
async function playFor(ms, slow) {
  store.set('gamemode.look', 'best'); localStorage.removeItem('gamestream.test');
  await GameMode.play(SRC);
  await until(async () => (await GW().state())?.playing, 60000);
  const c = await until(() => ev(`window.__gameReady ? ${COUNT} : null`), 60000);
  const p0 = await until(async () => { const v = await ev('window.__gameReady && window.__gameReady.phase === "playing" ? performance.now() : 0'); return v || null; }, 120000);
  if (slow) await wait(1000).then(() => ev('window.game.slow = true'));
  await wait(ms - (slow ? 1000 : 0));
  const r = JSON.parse(await ev(READ));
  r.counted = typeof c === 'string' && c !== 'already' ? JSON.parse(c) : c; r.playAt = p0;
  return r;
}
async function stop() { await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800); }

let hashBefore = null;
await safe('fixture', async () => {
  await window.hub.fs.write(SRC.path, GAME);
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`${THREE_DIR}/build/${f}`, `${DIR}/lib/${f}`);
  await GW().budget({ op: 'reset', source: SRC });
  hashBefore = await window.hub.gameReady.hash([SRC.path]);
  step(`fixture: a throwaway three.js game with a heavy sun shadow (2048² = ${(1.2 * FRAME).toFixed(1)} ms at ${HZ} Hz)`, hashBefore?.[0]?.hash, { hz: HZ, displays });
});

let first = null;
await safe('first', async () => {
  first = await playFor(22000, true);
  const L = first.look || {}; const S = L.shadows || {}; const ab = first.budget?.ab?.shadow;
  out.runs.first = { counted: first.counted, events: first.ev, shadows: S, guard: L.guard, guardMs: L.guardMs, guardWhy: L.guardWhy, ab: first.budget?.ab, text: first.text, first5: first.ready?.first5, gap: first.gap, sun: first.sun };
  step('the counter was on before the card went (the game not yet playing)', first.counted && first.counted.phase !== 'playing', first.counted);
  step('the A/B under the card drew the screen\'s 2048 first, then chose a smaller size that fits (or the one that helped most)', ab && ab.rows[0]?.[0] === 2048 && ab.size < 2048 && S.chosen?.size === ab.size && S.chosen?.by === 'ready', ab);
  step('the chosen size and the one below it were both made while getting ready (the fallback ready), nothing else kept', ab && (ab.size <= 512 || (ab.fallback === ab.size / 2 && ab.fallbackReady && S.ready)), { fallback: S.fallback, ready: S.ready, made: S.made });
  step('frames truly didn\'t fit while playing (the game slowed itself: the frame gap over the refresh)', first.gap > FRAME * 1.25, { gap: first.gap, frame: +FRAME.toFixed(2), steps: L.guardMs?.steps });
  const made = first.ev || [];
  step('22 s of play with frames that don\'t fit: nothing made on the graphics card after the first frame (textures, render buffers, framebuffers, buffers, shaders, programs)', Array.isArray(first.ev) && made.length === 0 && S.midPlay === 0, { events: (first.ev || []).slice(0, 20), midPlay: S.midPlay, first5: first.ready?.first5 });
  step('the guard stepped in without making anything: the size made while getting ready swapped in (kept only if it helped), or it said why it kept them', (L.guard === 'lowered' && first.sun === S.fallback) || L.guard === 'not-shadows' || (L.guard === 'held' && L.guardWhy === 'smallest'), { guard: L.guard, why: L.guardWhy, lowered: S.lowered, sun: first.sun, steps: L.guardMs?.steps });
  step('first 5 s of play: 0 compiles / uploads (getting ready\'s own count)', first.ready?.first5 && first.ready.first5.compiles === 0 && first.ready.first5.uploads === 0, first.ready?.first5);
  step('the doctor / F chip line says the size and why', /Shadows: \d+ \((chosen while getting ready|lowered from \d+ to stay smooth)/.test(first.text || '') || /Shadows: 512, the game's own/.test(first.text || ''), first.text);
  // the F chip shows it
  await GW().key({ key: 'f' }).catch(() => {});
  const chip = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const l = r?.querySelector(".look"); return l && !l.hidden ? l.textContent : null; })()'), 4000);
  await GW().key({ key: 'f' }).catch(() => {});
  step('F shows it under the stats chip', /Shadows: \d+/.test(chip || ''), chip);
  out.runs.first.chip = chip;
  const said = await Commands.get('game').run('look shadows');
  step('/game look shadows: the size now and the one remembered for this game', /Now: Shadows: \d+/.test(said) && new RegExp(`Remembered for Shadow test: ${ab?.size} at ${HZ} Hz`).test(said), said);
  out.runs.first.said = said;
  await stop();
  const kept = await GW().budget({ source: SRC });
  step('remembered for this game (budget.json, with the helpers it keeps off)', kept.shadow?.size === ab?.size && kept.shadow?.hz === HZ && kept.shadow?.to === 2048, kept);
});

await safe('again', async () => {
  const before = await GW().budget({ source: SRC });
  const r = await playFor(9000, false);
  const L = r.look || {}; const S = L.shadows || {}; const ab = r.budget?.ab?.shadow;
  out.runs.again = { events: r.ev, shadows: S, guard: L.guard, ab: r.budget?.ab, text: r.text };
  step('the next ▶ Play starts at the remembered size: never made at 2048, the A/B confirmed it from there', before.shadow && S.made && !S.made.includes(2048) && S.made[0] === before.shadow.size && ab && ab.rows[0]?.[0] === before.shadow.size && S.chosen?.by === (ab.size === before.shadow.size ? 'remembered' : 'ready'), { remembered: before.shadow, made: S.made, ab });
  step('… and nothing made after the first frame there either', Array.isArray(r.ev) && r.ev.length === 0 && S.midPlay === 0, (r.ev || []).slice(0, 20));
  step('its line says it was remembered', /Shadows: \d+ \(chosen while getting ready, remembered for this game\)/.test(r.text || '') || /Shadows: 512, the game's own/.test(r.text || ''), r.text);
  await stop();
});

await safe('chat', async () => {
  const said = await Commands.get('game').run('look shadows reset');
  const kept = await GW().budget({ source: SRC });
  step('/game look shadows reset: chosen again while getting ready next time', /chosen again/.test(said) && !kept.shadow, { said, kept });
  const help = Commands.get('game');
  step('/game look shadows is in /game\'s suggestions', (help.complete?.() || []).some((x) => x.value === 'look shadows'));
});

await safe('files', async () => {
  const after = await window.hub.gameReady.hash([SRC.path]);
  step('files: the game\'s file byte for byte the same', hashBefore && after?.[0]?.hash === hashBefore[0].hash, after);
  await GW().budget({ op: 'reset', source: SRC });
});
store.set('gamemode.look', 'best');
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, runs: out.runs }, null, 1);
