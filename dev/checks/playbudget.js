// ▶ Play's budget (round 55, playbudget): Hearth's own helpers in the game window never make the game run worse. Two
// throwaway three.js games whose way of working makes one of Hearth's helpers expensive (the look looks at what a game
// adds before it's drawn: these add a fresh hidden group holding thousands of debris meshes every frame):
//   heavy.html  adds it in its frame loop: the getting-ready A/B can't see it (no game frame inside its blocks), the
//               watch while playing must: the look switched off within seconds, said in plain words (the F chip's
//               note, the doctor), frames back to "off" speed (the work around the game's render, measured in the
//               page as in gamefps54), remembered for this game (the next ▶ Play starts without it, frames at "off"
//               speed from the start), /game helpers says so, "Turn them back on" forgets it
//   ab.html     adds it from scene.onBeforeRender (inside every render): the A/B under Getting ready's card must find
//               the helpers slower beyond the noise and switch the look off before the first frame of play
//   off         the baseline: heavy.html played as round 53 (no look, loads during play log-only, no sound part)
// Also: the F chip shows "Hearth: x ms", the doctor lists each helper's cost, the game's files byte for byte the same.
//   node dev/smoke.js --check-timeout 900000 --screen 960x600 --script dev/checks/playbudget.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], runs: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 4 min`)), 240000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-playbudget';
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

const game = (title, where, n) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; }</style>
<script type="importmap">{ "imports": { "three": "./lib/three.module.js" } }</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#202838');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 3, 9); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight('#ffffff', 0.6)); const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(3, 6, 4); scene.add(sun);
const boxes = []; for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.6, 0.55) })); b.position.set((i % 6) * 1.4 - 3.5, Math.floor(i / 6) * 1.2 - 0.3, 0); scene.add(b); boxes.push(b); }
// the debris: ${n} meshes made once; every ${where === 'loop' ? 'frame' : 'render'} a fresh hidden group holds them (a spawn wave prepared out of sight)
const dg = new THREE.TetrahedronGeometry(0.05); const dm = new THREE.MeshBasicMaterial({ color: '#ffaa55' });
const debris = Array.from({ length: ${n} }, () => new THREE.Mesh(dg, dm));
let prev = null;
const wave = () => { const g = new THREE.Group(); g.visible = false; g.matrixWorldAutoUpdate = false; g.children = debris; scene.add(g); if (prev) scene.remove(prev); prev = g; };
const G = window.game = { cpu: [], over: [], gaps: [], frames: 0 };
let in0 = 0; let inMs = 0;
${where === 'render' ? 'scene.onBeforeRender = () => { wave(); in0 = performance.now(); };' : 'scene.onBeforeRender = () => { in0 = performance.now(); };'}
scene.onAfterRender = () => { inMs = performance.now() - in0; };
let lastT = 0;
renderer.setAnimationLoop((t) => {
  const a = performance.now();
  if (lastT) G.gaps.push(t - lastT); lastT = t; if (G.gaps.length > 4000) G.gaps.splice(0, 2000);
  ${where === 'loop' ? 'wave();' : ''}
  for (const b of boxes) b.rotation.y += 0.01;
  const r0 = performance.now(); inMs = 0; renderer.render(scene, camera); G.over.push(performance.now() - r0 - inMs); if (G.over.length > 4000) G.over.splice(0, 2000);
  G.cpu.push(performance.now() - a); if (G.cpu.length > 4000) G.cpu.splice(0, 2000);
  G.frames++;
});
</script></body></html>`;

// the work around the game's render a frame (what wraps renderer.render), the main thread's frame, n ms of play
const MEASURE = (ms) => `(async () => {
  const G = window.game; G.cpu.length = 0; G.over.length = 0; G.gaps.length = 0; const f0 = G.frames;
  await new Promise((r) => setTimeout(r, ${ms}));
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3) : null; };
  const mean = (a) => { const s = a.slice().sort((x, y) => x - y).slice(0, Math.max(1, Math.ceil(a.length * 0.95))); return +(s.reduce((x, y) => x + y, 0) / Math.max(1, s.length)).toFixed(4); };
  return JSON.stringify({ frames: G.frames - f0, cpu50: q(G.cpu, 0.5), overMean: mean(G.over), over50: q(G.over, 0.5), gap50: q(G.gaps, 0.5) });
})()`;
const pub = async () => JSON.parse(await ev('window.__hearthBudget ? window.__hearthBudget.pub() : "null"'));

await Lazy.load('gamemode');
const HEAVY = { kind: 'html', path: `${DIR}/heavy.html`, title: 'Heavy test' };
const AB = { kind: 'html', path: `${DIR}/ab.html`, title: 'AB test' };
const SET = { off: { look: 'off', stream: false, audio: false }, best: { look: 'best', stream: true, audio: true } };
async function start(src, label) {
  const c = SET[label];
  store.set('gamemode.look', c.look); localStorage.setItem('gamestream.test', JSON.stringify({ off: !c.stream })); store.set('gameaudio.off', !c.audio);
  await GameMode.play(src);
  await until(async () => (await GW().state())?.playing, 60000);
  return until(() => ev('Boolean(window.game && window.game.frames > 10 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 120000);
}
async function stop() { await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800); }

await safe('fixture', async () => {
  await window.hub.fs.write(HEAVY.path, game('Heavy test', 'loop', 3000));
  await window.hub.fs.write(AB.path, game('AB test', 'render', 8000));
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`${THREE_DIR}/build/${f}`, `${DIR}/lib/${f}`);
  out.hashBefore = await window.hub.gameReady.hash([HEAVY.path, AB.path]);
  for (const s of [HEAVY, AB]) await GW().budget({ op: 'reset', source: s }); // (a run before: forgotten)
  step('fixture: two throwaway three.js games that add a fresh hidden group of debris every frame / every render', out.hashBefore?.length === 2 && out.hashBefore.every((h) => h.hash));
});

let allow = 0.1; let off = null;
await safe('off', async () => {
  const ok = await start(HEAVY, 'off');
  await wait(2000);
  off = out.runs.off = JSON.parse(await ev(MEASURE(4000)));
  out.runs.off.budget = await pub();
  allow = Math.max(0.1, 0.02 * off.cpu50);
  step('off: the heavy game as round 53 plays it (no look, nothing switched off)', ok && off.frames > 20 && !out.runs.off.budget.off.length, { ...off, allow });
  await stop();
});

await safe('watch', async () => {
  const ok = await start(HEAVY, 'best');
  await wait(1000);
  const before = JSON.parse(await ev(MEASURE(1500)));
  const p0 = await pub();
  const gone = await until(() => ev('Boolean(window.__hearthBudget && window.__hearthBudget.isOff("look"))'), 25000);
  await wait(1500);
  const after = JSON.parse(await ev(MEASURE(4000)));
  const p = await pub();
  out.runs.watch = { before, after, helpersBefore: p0.helpers, budget: p };
  step('the watch measures each helper while it plays (ms a frame) and Hearth\'s total against its budget (2 % of a frame at the refresh, ≥ 0.1 ms)', ok && p0.helpers?.look && p0.helpers?.stream && p0.helpers?.watch && p.budgetMs >= 0.1 && p.windows > 3, { helpers: p0.helpers, budgetMs: p.budgetMs, hz: p.hz, isolated: p.isolated });
  step('the game makes the look expensive: its work around the render is well over the budget before', before.overMean - off.overMean > allow, { before: before.overMean, off: off.overMean, allow });
  step('the look switched off by the watch, first (the most expensive), within seconds of play', gone && p.off[0]?.id === 'look' && p.off[0].by === 'watch' && p.off[0].ms > p.budgetMs, p.off);
  step('frames back to "off" speed: the work around the game\'s render within the allowance of off (2 % of its frame, ≥ 0.1 ms)', after.overMean - off.overMean <= allow && after.overMean < before.overMean, { after: after.overMean, before: before.overMean, off: off.overMean, allow, cpu: { after: after.cpu50, off: off.cpu50 } });
  step('said once in plain words', /^Hearth's helpers were slowing Heavy test a little; turned off: the look/.test(p.note), p.note);
  // the F chip: Hearth's cost a frame and the note
  await GW().key({ key: 'f' }).catch(() => {});
  const chip = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const c = r?.querySelector(".chip"); const n = r?.querySelector(".note"); return c && !c.hidden && /Hearth:/.test(c.textContent) ? JSON.stringify({ chip: c.textContent, note: n && !n.hidden ? n.textContent : null }) : null; })()'), 6000);
  await GW().key({ key: 'f' }).catch(() => {});
  const c = chip ? JSON.parse(chip) : {};
  step('the F chip shows "Hearth: x ms" and the note', /Hearth: (< )?\d+\.\d\d ms/.test(c.chip || '') && /turned off: the look/.test(c.note || ''), c);
  await stop();
  const kept = await GW().budget({ source: HEAVY });
  step('remembered for this game', kept.off.includes('look') && kept.by.look === 'watch', kept);
});

await safe('remembered', async () => {
  const ok = await start(HEAVY, 'best');
  await wait(2000);
  const m = JSON.parse(await ev(MEASURE(4000)));
  const p = await pub();
  const look = await ev('typeof window.__gameLook');
  out.runs.remembered = { m, budget: p };
  step('the next ▶ Play starts without it (listed as remembered) and at "off" speed from the start', ok && look === 'undefined' && p.off.some((o) => o.id === 'look' && o.by === 'remembered') && m.overMean - off.overMean <= allow, { look, off: p.off, overMean: m.overMean, offOver: off.overMean, allow });
  // /game helpers says it
  const said = await Commands.get('game').run('helpers');
  step('/game helpers: Hearth\'s cost now and what this game plays without', /Hearth: /.test(said) && /plays without: the look/.test(said), said);
  // the doctor lists each helper's cost
  await Lazy.load('gameperf');
  await GamePerf.attach({ exec: async (e) => ev(e) }, { label: HEAVY.title, kind: 'html', hz: p.hz });
  await GamePerf.doctor({ secs: 2 });
  const card = GamePerf.card?.querySelector('.gp-budget');
  const txt = card?.textContent || '';
  step('the doctor lists each helper\'s cost, the note and "Turn them back on"', /Hearth's own work in the game: .* a frame/.test(txt) && /the look off/.test(txt) && /loads during play \d/.test(txt) && /Turn them back on/.test(txt), { text: txt.slice(0, 400), state: GamePerf.state().hearth });
  card?.querySelector('button')?.click(); await wait(400);
  GamePerf.close();
  await stop();
  const kept = await GW().budget({ source: HEAVY });
  step('"Turn them back on" forgets it (the next ▶ Play has them again)', kept.off.length === 0, kept);
});

await safe('ab', async () => {
  const ok = await start(AB, 'best');
  const gr = JSON.parse(await ev('window.__gameReady.pub()'));
  const p = await pub();
  const look = await ev('window.__gameLook ? window.__gameLook.report().off || null : "none"');
  out.runs.ab = { ab: p.ab, ready: gr.result?.ab, off: p.off };
  step('the A/B under Getting ready\'s card: the look\'s own time over the budget and the frames slower, the look off before the first frame of play', ok && p.ab && p.ab.judge?.slower && p.ab.turnedOff?.includes('look') && p.off.some((o) => o.id === 'look' && o.by === 'ab') && look === 'ab', { ab: p.ab, look });
  step('… and after that, on ≈ off (the A/B again)', p.ab?.after && !p.ab.after.judge.slower, p.ab?.after);
  step('Getting ready reports it', gr.result?.ab?.turnedOff?.includes('look'), gr.result?.ab);
  await stop();
  const kept = await GW().budget({ source: AB });
  step('remembered for that game too (by the A/B)', kept.off.includes('look') && kept.by.look === 'ab', kept);
  await GW().budget({ op: 'reset', source: AB });
});

store.set('gamemode.look', 'best'); localStorage.removeItem('gamestream.test'); store.set('gameaudio.off', false);
await safe('files', async () => {
  const after = await window.hub.gameReady.hash([HEAVY.path, AB.path]);
  step('files: the games\' files byte for byte the same', out.hashBefore && after?.map((h) => h.hash).join() === out.hashBefore.map((h) => h.hash).join(), after);
});
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, runs: out.runs }, null, 1);
