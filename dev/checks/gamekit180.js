// The game kit (round 180, gamekit): a v2 (WebGPU) scene played as a game, end to end.
//   preview   the v2 layer runs in the Lab with input / onStep / save in its hands; a save written from the preview
//             lands in Hearth's own storage for that scene
//   window    ▶ Play with "Play in: Window · 1280 × 720" opens the v2 scene in a window (not full screen), its one
//             WebGPU canvas drawing, the fixed step running
//   input     Space, F and a right click reach the game (F is the game's: the stats chip is F3 in a v2 game), the mouse
//             is not captured for it, Hearth's "Back to Hearth" card stays closed
//   pause     F6 holds the picture, F7 draws one frame, F6 resumes
//   saves     K makes the game write a save; F5 restarts the game and it reads the save back; the window closed and
//             the game played again "from this save": it reads it again, and save.start() names it
// WebGPU: SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" node dev/smoke.js --check-timeout 400000 --script dev/checks/gamekit180.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const G = () => window.hub.game;
const ev = async (code) => { const r = await G().eval(code); return r?.error ? { error: r.error } : r?.value; };
const kit = async () => { const j = await ev('JSON.stringify(window.__kit ? { ...window.__kit, save: undefined } : null)'); try { return JSON.parse(j); } catch { return null; } };
const playing = async () => (await G().state())?.playing;

const code = `export default async ({ THREE, scene, camera, onFrame, onStep, input, save }) => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial({ color: '#ff3cac' })); scene.add(box);
  const T = window.__kit = { frames: 0, steps: 0, count: 0, f: 0, left: 0, right: 0, wrote: 0, plain: [], ctx: 0, save };
  addEventListener('mousedown', (e) => { T.plain.push(e.button); });
  addEventListener('contextmenu', () => { T.ctx += 1; });
  T.start = await save.start();
  T.loaded = await save.read(T.start || 'slot1');
  T.count = (T.loaded && T.loaded.count) || 0;
  T.best = await save.get('best', -1);
  T.ready = true;
  onStep((dt) => {
    T.steps += 1; T.dt = dt;
    if (input.pressed('Space')) T.count += 1;
    if (input.pressed('KeyF')) T.f += 1;
    if (input.pressed('Mouse0')) T.left += 1;
    if (input.pressed('Mouse2')) T.right += 1;
    if (input.pressed('KeyK')) { save.write('slot1', { count: T.count }).then(() => { T.wrote += 1; }, (e) => { T.err = String(e.message); }); save.set('best', T.count); }
  });
  onFrame((t, dt) => { T.frames += 1; box.rotation.y += dt; });
};`;

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
let id = null; let src = null;

await safe('preview', async () => {
  const x = ThreeLab.scenes.create({ name: 'Kit game', code, layers: [{ id: 'game', name: 'Game logic', code }], open: true, format: 'gpu' });
  id = x?.id; src = { kind: 'lab', id, title: 'Kit game' };
  ThreeLab.scenes.open(id);
  const read = async () => { const r = await ThreeLab.director.evalInSketch('return JSON.stringify(window.__kit ? { ...window.__kit, save: undefined } : null)').catch(() => null); try { return JSON.parse(r?.value); } catch { return null; } };
  const p = await until(async () => { const k = await read(); return k?.ready && k.frames > 5 && k.steps > 5 ? k : null; }, 40000);
  step('the v2 layer runs in the preview with input, onStep and save', p, p && { frames: p.frames, steps: p.steps, dt: p.dt, loaded: p.loaded, best: p.best });
  await ThreeLab.director.evalInSketch('window.__kit.save.write("from preview", { a: 1 }).then(() => { window.__kit.pw = 1; }, (e) => { window.__kit.pw = String(e.message); }); return 1');
  const pw = await until(async () => (await read())?.pw, 8000);
  const list = (await G().saves({ op: 'list', game: src }))?.slots || [];
  step('a save written from the preview is kept by Hearth for this scene', pw === 1 && list.some((s) => s.slot === 'from preview'), { pw, list });
});

await safe('window', async () => {
  store.set('gamemode.window', '720');
  await Lazy.load('gamemode');
  await GameMode.play(src);
  await until(async () => (await G().state())?.pid, 60000);
  const k = await until(async () => { const v = await kit(); return v?.ready && v.frames > 10 && v.steps > 10 ? v : null; }, 60000);
  const st = await G().state();
  const g2 = await ev('JSON.stringify(window.__labG2 ? { on: window.__labG2.state().on, layers: window.__labG2.state().layers.length, backend: window.__labG2.state().backend } : null)');
  const inner = JSON.parse(await ev('JSON.stringify([innerWidth, innerHeight, devicePixelRatio])'));
  out.measure.window = { inner, windowed: st.windowed, fullscreen: st.fullscreen, size: st.size, how: st.how, format: st.format, url: st.url, g2, errors: await ev('JSON.stringify(window.__hearthGame && window.__hearthGame.errors)') };
  step('▶ Play runs the v2 scene (its WebGPU canvas draws, the fixed step runs)', k && /"on":true/.test(String(g2)), { frames: k?.frames, steps: k?.steps, g2 });
  // (silent: a window parked off screen has no title bar or edges, so its picture is the whole 1296 × 759; on screen it is 1280 × 720)
  step('it plays in a window, not full screen', st.windowed === true && st.fullscreen === false && inner[0] * inner[2] >= 1278 && inner[0] * inner[2] <= 1300 && inner[1] * inner[2] >= 718 && inner[1] * inner[2] <= 765, { inner, size: st.size, how: st.how });
});

await safe('input', async () => {
  await G().key({ key: 'Space' }); await wait(300);
  await G().key({ key: 'F' }); await wait(300);
  await G().click({ x: 200, y: 160, button: 'right' }); await wait(300);
  await G().click({ x: 220, y: 160 }); await wait(400);
  const k = await kit();
  const lock = await ev('Boolean(document.pointerLockElement)');
  const st = await G().state();
  step('Space, F, a left and a right click reach the game', k?.count === 1 && k.f === 1 && k.right === 1 && k.left === 1 && k.plain.includes(2) && k.plain.includes(0), { count: k?.count, f: k?.f, left: k?.left, right: k?.right, plain: k?.plain, ctx: k?.ctx });
  step('the mouse is not captured for a v2 game, and Hearth\'s card stays closed', lock === false && st.playing && st.input?.menu === false, { lock, menu: st.input?.menu });
});

await safe('pause', async () => {
  await G().key({ key: 'F6' }); await wait(700);
  const a = (await kit())?.frames; await wait(700); const b = (await kit())?.frames;
  await G().key({ key: 'F7' }); await wait(500);
  const c = (await kit())?.frames;
  await G().key({ key: 'F6' }); await wait(700);
  const d = (await kit())?.frames;
  step('F6 pauses, F7 draws one frame, F6 resumes', b - a <= 1 && c - b >= 1 && c - b <= 3 && d - c > 5, { a, b, c, d, paused: (await G().state()).paused });
});

await safe('saves', async () => {
  await G().key({ key: 'K' });
  const w = await until(async () => (await kit())?.wrote === 1, 8000);
  const list = (await G().saves({ op: 'list', game: src }))?.slots || [];
  step('the game writes a save (K)', w && list.some((s) => s.slot === 'slot1'), { list, err: (await kit())?.err });
  // F5: the game from the start; it reads its save back
  const was = await ev('window.__hearthGame.started');
  await G().key({ key: 'F5' });
  const r = await until(async () => { const v = await kit(); const s = await ev('window.__hearthGame && window.__hearthGame.started'); return s && s !== was && v?.ready && v.frames > 3 ? v : null; }, 40000);
  step('F5 restarts the game, and it reads the save back', r && r.loaded?.count === 1 && r.count === 1 && r.best === 1 && r.wrote === 0, r && { loaded: r.loaded, best: r.best, frames: r.frames });
  // the window closed, then played again from this save, full screen this time
  await G().leave(); await until(async () => !(await playing()), 15000);
  store.set('gamemode.window', 'full');
  await wait(500);
  await GameMode.play(src, { saveStart: 'slot1' });
  await until(async () => (await G().state())?.pid, 60000);
  const k = await until(async () => { const v = await kit(); return v?.ready && v.frames > 3 ? v : null; }, 60000);
  const st = await G().state();
  out.measure.again = { windowed: st.windowed, fullscreen: st.fullscreen, size: st.size };
  step('the save survives the game window closing: played again from it', k && k.loaded?.count === 1 && k.start === 'slot1' && st.windowed === false, k && { loaded: k.loaded, start: k.start, windowed: st.windowed });
  await G().leave(); await until(async () => !(await playing()), 15000);
});

store.set('gamemode.window', 'full');
out.ok = out.steps.length >= 9 && out.steps.every((s) => s.ok);
return JSON.stringify(out);
