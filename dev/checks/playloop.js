// ▶ Play's edit → play → edit loop (round 53, playloop: playloop.js, playloopmain.js, game-preload.js, the Lab player's
// saveState / restoreState hooks).
//   live     a Lab scene in two layers ("Spin": no hooks, counts its frames; "Game": a score kept through saveState /
//            restoreState) played with ▶ Play; the Game layer edited while it plays (the director's own edit path):
//            the new code runs in the same page (no rebuild: the page's mark and the window stay), the score is kept,
//            the Spin layer goes on untouched, "↻ Updated" shows over the game
//   restart  a layer added while it plays: the layers run again in the same page, the score handed back
//   error    an edit that throws at load: one line over the game with the error and its line; "Fix with the director"
//            puts the error, the layer, the line and the code there in the docked director chat (a draft, not sent),
//            and the game rests (one screen) so the chat is in view
//   key      the fix made while it rests goes into it (the score that waited through the broken run comes back);
//            Ctrl/⌘+P in the Lab: back to the game as it was; Ctrl/⌘+P in the game: back to editing (kept); again
//   here     Play from here: back to where it was left to edit (the saved point)
//   menu     ▶ Play's right-click rows; Side by side only with two screens; the change kinds (hot / restart / rebuild)
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/playloop.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const ui = (sel, what = 'textContent') => ev(`(() => { const n = document.querySelector('hearth-game-ui')?.shadowRoot?.querySelector(${JSON.stringify(sel)}); return n ? (${JSON.stringify(what)} === 'shown' ? !n.hidden : ${JSON.stringify(what)} === 'on' ? n.classList.contains('on') : n.textContent) : null; })()`);
const key = async (k, { shift = false } = {}) => {
  const mods = 2 | (shift ? 8 : 0); const p = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), nativeVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', ...p } });
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', ...p } });
};
const resting = () => GameMode.state().resting;

const SPIN = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101828');
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100); cam.position.z = 4;
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: '#4fd1c5' })); scene.add(ring);
let n = 0;
renderer.setAnimationLoop((t) => { n += 1; globalThis.__spin = { n }; ring.rotation.z = t / 900; renderer.render(scene, cam); });`;
const game = (ver, extra = '') => `import * as THREE from 'three';
const VER = ${ver};
let score = 0;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100); cam.position.z = 3;
const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); scene.add(box);
${extra}
globalThis.__pl = { ver: VER, get score() { return score; }, add(k) { score += k; } };
renderer.setAnimationLoop((t) => { box.rotation.y = t / 1000; renderer.render(scene, cam); });
export function saveState() { return { score }; }
export function restoreState(s) { score = s.score; }
export function checkpoint() { score = 100; }`;
const BROKEN_LINE = 9; // the line of `${extra}` above
const LAYERS = [{ id: 'spin', name: 'Spin', code: SPIN }, { id: 'game', name: 'Game', code: game(1) }];

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
await Commands.tryRun('/director-setup', H.claudeAgent().id);
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
await Lazy.load('gamemode');
let sceneId = null; let started = 0;

await safe('live', async () => {
  const x = ThreeLab.scenes.create({ name: 'Clink loop', code: LAYERS[0].code, layers: LAYERS, open: true });
  sceneId = x?.id || ThreeLab.scenes.all().find((s) => s.name === 'Clink loop')?.id;
  ThreeLab.scenes.open(sceneId);
  await wait(2500);
  await GameMode.play({ kind: 'lab', id: sceneId, title: 'Clink loop' });
  const up = await until(() => ev('Boolean(window.__hearthGame && window.__hearthGame.drawn && globalThis.__pl && globalThis.__spin && globalThis.__spin.n > 3)'), 90000);
  started = GameMode.state().info?.started;
  await until(() => PlayLoop.state().base === sceneId, 5000);
  await ev('window.__plMark = 7; globalThis.__pl.add(42); 1');
  const before = JSON.parse(await ev('JSON.stringify({ ver: __pl.ver, score: __pl.score, spin: __spin.n, hooks: window.__labHot.info().hooks })'));
  step('the scene plays in ▶ Play with its hooks seen', up && before.ver === 1 && before.score === 42 && before.hooks.includes('game'), before);
  const t0 = performance.now();
  await ThreeLab.director.updateLayer('Game', { code: game(2) }, 0.2);
  const v2 = await until(() => ev('globalThis.__pl && __pl.ver === 2'), 15000);
  out.measure.editToGameMs = Math.round(performance.now() - t0);
  const after = JSON.parse(await ev('JSON.stringify({ ver: __pl.ver, score: __pl.score, spin: __spin.n, mark: window.__plMark, hot: window.__labHot.info() })'));
  const st = GameMode.state();
  step('an edit while playing goes into the running game (no rebuild: same page, same window)', v2 && after.mark === 7 && st.info?.started === started && PlayLoop.state().stats.hot >= 1 && PlayLoop.state().stats.rebuild === 0, { after, stats: PlayLoop.state().stats, last: PlayLoop.state().last, ms: out.measure.editToGameMs });
  step('the game state is kept (saveState / restoreState)', after.score === 42 && after.hot.kept >= 1, { score: after.score, hot: after.hot });
  await wait(600);
  const spin2 = await ev('__spin.n');
  step('the other layer goes on untouched', spin2 > before.spin, { before: before.spin, now: spin2 });
  const blip = await until(async () => { const t = await ui('.blip'); return t && /Updated/.test(t) ? t : null; }, 4000);
  step('"↻ Updated" shows over the game (no "Getting ready" again)', blip, blip);
});

await safe('restart', async () => {
  await ThreeLab.director.addLayer({ name: 'Glow', code: `const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:auto 0 0 0;height:4px;background:#ff8a3d'; document.body.append(d); globalThis.__glow = 1;` }, 0.2);
  const ok = await until(() => ev('globalThis.__glow === 1 && globalThis.__pl && __pl.score === 42'), 20000);
  const r = JSON.parse(await ev('JSON.stringify({ mark: window.__plMark, score: __pl.score })'));
  step('a new layer: the layers run again in the same page, the score handed back', ok && r.mark === 7 && PlayLoop.state().stats.restart >= 1 && GameMode.state().info?.started === started, { r, stats: PlayLoop.state().stats });
});

await safe('error', async () => {
  await ThreeLab.director.updateLayer('Game', { code: game(9, 'nope.go();') }, 0.2);
  const line = await until(async () => { const t = await ui('.err .m'); const shown = await ui('.err', 'shown'); return shown && t ? t : null; }, 15000);
  step('a runtime error shows one line over the game, with its line', line && /^Clink loop stopped: ReferenceError: nope is not defined/.test(line) && line.includes(`(line ${BROKEN_LINE})`), line);
  await ev('document.querySelector("hearth-game-ui").shadowRoot.querySelector(".err .fixit").click(), 1');
  const draft = await until(() => PlayLoop.state().lastDraft, 15000);
  const box = await until(() => [...document.querySelectorAll('.composer textarea')].find((t) => t.value === draft) || null, 6000);
  await wait(1200);
  const still = Boolean(box) && box.value === draft; // (sending would empty the box)
  step('Fix with the director: the error, layer, line and code drafted in the docked director chat (not sent)', draft && /ReferenceError: nope is not defined/.test(draft) && /layer “Game”, line 9/.test(draft) && /> {2}9 \| nope\.go\(\);/.test(draft) && still, { draft, inBox: Boolean(box), still });
  step('the game rests while you fix it (one screen)', await until(resting, 5000), GameMode.state().resting);
});

await safe('key', async () => {
  // the fix, made while it rests: it goes in now; the score held through the broken run comes back
  await ThreeLab.director.updateLayer('Game', { code: game(3) }, 0.2);
  const v3 = await until(() => ev('globalThis.__pl && __pl.ver === 3'), 15000);
  step('the fix goes into the resting game, its state back from before the broken edit', v3 && (await ev('__pl.score')) === 42 && resting(), { score: await ev('__pl && __pl.score'), resting: resting() });
  activate('tool:three'); await wait(200);
  const t0 = performance.now();
  await key('p');
  const woke = await until(() => !resting(), 5000);
  out.measure.backToGameMs = Math.round(performance.now() - t0);
  const ver = await ev('__pl.ver');
  step('Ctrl/⌘+P in the Lab: back to the game, as it was, with the fix in it', woke && ver === 3 && (await ev('window.__plMark')) === 7, { ms: out.measure.backToGameMs, ver });
  await G().key({ key: 'P', mods: ['control'] });
  const rested = await until(resting, 5000);
  step('Ctrl/⌘+P in the game: back to editing, the game kept', rested && (await ev('window.__plMark')) === 7 && GameMode.state().playing, { resting: resting() });
  await key('p');
  step('…and Ctrl/⌘+P again plays on', await until(() => !resting(), 5000));
});

await safe('here', async () => {
  await ev('__pl.add(-40), 1'); // played on: the score moved
  const from = await PlayLoop.here();
  const score = await ev('__pl.score');
  step('Play from here: back to where it was left to edit', from === 'saved' && score === 42, { from, score });
});

await safe('menu', async () => {
  const one = PlayLoop.menuItems([{ id: 1, hub: true }]).map((x) => x.label).filter(Boolean);
  const two = PlayLoop.menuItems([{ id: 1, hub: true }, { id: 2 }]).map((x) => x.label).filter(Boolean);
  step('▶ Play\'s right-click: Play from here; Side by side only with two screens', one.includes('▶ Play from here') && !one.some((l) => /Side by side/.test(l)) && two.some((l) => /Side by side/.test(l)), { one, two });
  const r = await Commands.tryRun('/play-side on', H.claudeAgent().id);
  step('/play-side on one screen says it needs a second one', !store.get('playloop.side', null), r);
  const a = await GameMode.sceneSpec(sceneId);
  const b = JSON.parse(JSON.stringify(a)); b.layers[1].code += '\n// edit';
  const c = JSON.parse(JSON.stringify(a)); c.refs = [{ key: 'pic', kind: 'image', path: '/tmp/x.png' }];
  const kinds = [PlayLoop.diff(a, a).kind, PlayLoop.diff(a, b).kind, PlayLoop.diff(a, c).kind];
  step('change kinds: nothing / a layer swapped / a rebuild for new pictures', kinds.join() === 'none,hot,rebuild', kinds);
  step('the key is on the keys sheet', Keys.all().some((k) => k.area === 'Lab' && k.keys === 'Ctrl+P'));
});

await GameMode.leave();
await until(() => !GameMode.playing, 8000);
out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
