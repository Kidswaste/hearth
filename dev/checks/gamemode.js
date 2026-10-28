// ▶ Play (round 52, gamemode): a game full screen in its own window at max fidelity.
//   lab      the game-like Lab scene in three layers (dev/fixtures/game-lab-scene.js: sky, world with keys + pointer look +
//            coins, HUD), ▶ Play from the Lab's toolbar: a separate window (its own renderer process, hearth-game:), ONE
//            WebGL context and ONE canvas for the three layers, max fidelity (antialias / MSAA, pixel ratio = the screen's,
//            no fps cap, quality locked), the game reacts to keys; Hearth's background work quiet and the Lab parked
//   esc      Esc shows "Back to Hearth", Esc again leaves: the window closes, the background work and the Lab come back
//   html     the test HTML game (dev/fixtures/game-html, three.js in its lib/) loaded as it is from its folder: its
//            relative assets in (level.json, checker.svg, ./game.js, ./lib/three.module.js), antialias, no Node, no Hearth,
//            nothing outside its folder; the stats chip (F); leave through /game stop
//   again    remembered: "/play last" plays the HTML game again, /play <scene name> the Lab scene
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/gamemode.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const DIR = '/tmp/hearth-gamemode';
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const playing = async () => (await G().state())?.playing;
const quiet = () => ({ power: Boolean(window.Power?.quietNow?.()), cls: document.documentElement.classList.contains('gm-playing') });

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
const scene = JSON.parse(await window.hub.fs.read(`${DIR}/lab-scene.json`));
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
let sceneId = null;

await safe('lab', async () => {
  const layers = scene.layers.map((L, i) => ({ id: ['sky', 'world', 'hud'][i], name: L.name, code: L.code }));
  const x = ThreeLab.scenes.create({ name: scene.name, code: layers[0].code, layers, open: true });
  sceneId = x?.id || ThreeLab.scenes.all().find((s) => s.name === scene.name)?.id;
  ThreeLab.scenes.open(sceneId);
  await wait(2500);
  out.before = quiet();
  const btnEl = await until(() => document.querySelector('.surface.active [data-feature="Play"]') || document.querySelector('[data-feature="Play"]'), 8000);
  step('▶ Play is in the Lab toolbar', btnEl, btnEl?.textContent);
  const t0 = performance.now();
  btnEl?.click();
  const on = await until(playing, 60000);
  const st = (await until(async () => { const x = await G().state(); return x?.pid ? x : null; }, 60000)) || await G().state(); // (its page loaded: its process known)
  out.measure.openMs = Math.round(performance.now() - t0); out.measure.timing = st?.timing ? { build: (st.timing.built || st.timing.asked) - st.timing.asked, window: st.timing.window - (st.timing.built || st.timing.asked), load: (st.timing.loaded || 0) - st.timing.window, session: st.timing.session ?? null } : null; // (round 79, winstart79) where the first ▶ Play's time goes
  step('Play opens a separate window (its own renderer process, the hearth-game: page)', on && st.separate && /^hearth-game:\/\/[0-9a-f]+\/play\.html/.test(st.url), { url: st?.url, pid: st?.pid, separate: st?.separate, priority: st?.priority, how: st?.how, fullscreen: st?.fullscreen, display: st?.display });
  const drawn = await until(async () => { const v = await ev('window.__hearthGame && window.__hearthGame.drawn && window.__gameInfo && window.__gameInfo().frames > 20 ? JSON.stringify(window.__gameInfo()) : null'); return v ? JSON.parse(v) : null; }, 90000);
  out.measure.labInfo = drawn;
  const errs = await ev('JSON.stringify(window.__hearthGame && window.__hearthGame.errors)');
  step('the scene runs in the game window (no errors)', drawn && errs === '[]', { errs });
  step('one WebGL context and one canvas for the three layers', drawn && drawn.contexts === 1 && drawn.canvases === 1 && drawn.merged.length === 3 && drawn.renderers === 3, { contexts: drawn?.contexts, canvases: drawn?.canvases, merged: drawn?.merged, own: drawn?.own, renderers: drawn?.renderers });
  const dpr = await ev('devicePixelRatio'); const w = await ev('innerWidth');
  step('max fidelity: antialias (MSAA), pixel ratio = the screen\'s, the fast GPU, no fps cap, quality locked', drawn && drawn.antialias === true && drawn.pixelRatio === dpr && drawn.canvas?.w === Math.round(w * dpr) && drawn.cap === 0 && drawn.lock === true && drawn.quality === 1 && drawn.pace === false,
    { antialias: drawn?.antialias, samples: drawn?.samples, pr: drawn?.pixelRatio, dpr, canvas: drawn?.canvas, innerWidth: w, cap: drawn?.cap, lock: drawn?.lock, quality: drawn?.quality, power: drawn?.power });
  // the game's own frames: they keep coming (a merged frame draws all three)
  const f0 = (await ev('window.__gameInfo().frames')) || 0; await wait(1500); const f1 = (await ev('window.__gameInfo().frames')) || 0;
  out.measure.framesIn1500ms = f1 - f0;
  step('the merged canvas keeps drawing', f1 - f0 >= 1, { frames: f1 - f0 }); // (SwiftShader here: a few frames a second at 1600×1000 with MSAA)
  // input: a key reaches the game (and isn't a Hearth shortcut); a click asks for pointer lock
  await G().key({ key: 'W' }); await G().key({ key: 'Space' });
  const keys = await until(async () => { const v = await ev('JSON.stringify(globalThis.__clink ? { presses: __clink.presses, last: __clink.lastKey, frames: __clink.frames } : null)'); const o = v && JSON.parse(v); return o?.presses >= 2 ? o : null; }, 5000);
  step('keys reach the game', keys, keys);
  await G().click({ x: 400, y: 300 }); await wait(600);
  out.measure.pointerLock = await ev('Boolean(document.pointerLockElement)');
  const q = quiet();
  step('Hearth\'s background work waits and the Lab preview here rests', q.power && q.cls && !out.before.power && !out.before.cls, { before: out.before, now: q });
  // Esc: the card, then Esc again leaves
  await G().key({ key: 'Escape' });
  const card = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const c = r?.querySelector(".card"); return c && !c.hidden ? r.querySelector(".back").textContent : null; })()'), 4000);
  step('Esc shows "Back to Hearth"', card === 'Back to Hearth', card);
  await G().key({ key: 'Escape' });
  const left = await until(async () => !(await playing()), 8000);
  await wait(500);
  const q2 = quiet();
  step('Esc again: back in Hearth, the background work and the Lab back', left && !q2.power && !q2.cls, q2);
});

await safe('html', async () => {
  const t0 = performance.now();
  await GameMode.play({ kind: 'html', path: `${DIR}/html/index.html` });
  const g = await until(async () => { const v = await ev('window.__game && window.__game.ready && window.__game.frames > 10 ? JSON.stringify(window.__game) : null'); return v ? JSON.parse(v) : null; }, 60000);
  out.measure.htmlMs = Math.round(performance.now() - t0);
  const st = await G().state();
  step('the HTML game loads as it is from its folder, with its relative assets', g && g.assets.level === 'Coin Run 1' && g.assets.texture === '64x64' && /^hearth-game:\/\/[0-9a-f]+\/index\.html$/.test(st.url), { assets: g?.assets, url: st?.url, how: st?.how });
  step('its WebGL at max fidelity (antialias, pixel ratio = the screen\'s)', g?.gl?.antialias === true && g.gl.pixelRatio === g.gl.dpr, g?.gl);
  const iso = JSON.parse(await ev(`(async () => {
    const r = await fetch(location.origin + '/%2e%2e/%2e%2e/%2e%2e/etc/hostname').catch(() => null);
    const p = await fetch(location.origin + '/assets/level.json', { method: 'POST', body: 'x' }).catch(() => null);
    return JSON.stringify({ node: typeof require, process: typeof process, hub: typeof window.hub, outside: r ? r.status : 'refused', post: p ? p.status : 'refused', api: typeof window.hearthGame?.leave });
  })()`));
  step('no Node, no Hearth, nothing outside its folder, read-only', iso.node === 'undefined' && iso.hub === 'undefined' && iso.outside !== 200 && iso.post !== 200 && iso.api === 'function', iso);
  await G().key({ key: 'D' });
  const k = await until(() => ev('window.__game.lastKey === "KeyD"'), 4000);
  step('keys reach the HTML game', k);
  await G().key({ key: 'F' });
  const chip = await until(() => ev('(() => { const c = document.querySelector("hearth-game-ui")?.shadowRoot?.querySelector(".chip"); return c && !c.hidden && /fps/.test(c.textContent) && !/…/.test(c.textContent) ? c.textContent : null; })()'), 5000);
  step('F: the stats chip (fps, frame time, Hz, how it runs)', chip && /fps · [\d.]+ ms · \d+ Hz · HTML build/.test(chip), chip);
  await Commands.tryRun('/game stop', H.claudeAgent().id);
  step('/game stop leaves', await until(async () => !(await playing()), 8000));
});

await safe('again', async () => {
  step('the last game is remembered', GameMode.last()?.kind === 'html' && GameMode.recent().some((x) => x.kind === 'lab' && x.id === sceneId), GameMode.recent().map((x) => x.title));
  await wait(800);
  await Commands.tryRun('/play last', H.claudeAgent().id);
  const on = await until(playing, 30000);
  const st = await G().state();
  step('/play last plays it again (one step)', on && st.source?.kind === 'html', st?.source);
  await G().leave(); await until(async () => !(await playing()), 8000); await wait(800);
  await Commands.tryRun(`/play ${scene.name}`, H.claudeAgent().id);
  const on2 = await until(playing, 60000);
  const st2 = await G().state();
  step('/play <scene name> plays the Lab scene', on2 && st2.source?.kind === 'lab' && st2.source.id === sceneId && /cached|ready/.test(st2.how), st2?.how);
  await G().leave(); await until(async () => !(await playing()), 8000);
});

out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
