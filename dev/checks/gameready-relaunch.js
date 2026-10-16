// ▶ Play, got ready (round 52, gameready): the second launch. Runs after dev/checks/gameready.js on the same Chromium
// profile (--profile, not emptied): the same "Clink" Lab scene is made and played with ▶ Play first thing, exactly as
// the first launch did; its shaders come from Chromium's shader disk cache (▶ Play's window is persist:hearth-game).
//   compare  the game page's whole wait on the GPU's shader work (shaderWaitMs: getProgramParameter blocking until a
//            program is compiled / linked) with /tmp/hearth-gameready/launch1.json (the first launch's); wall times
//            are reported, not judged (the machine's load swings them)
// window.GR_REPORT = 1 only reports (no verdict).
//   node dev/smoke.js --check-timeout 600000 --profile /tmp/hearth-gameready-profile --script dev/checks/gameready-relaunch.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const DIR = '/tmp/hearth-gameready';
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
let first = null;
try { first = JSON.parse(await window.hub.fs.read(`${DIR}/launch1.json`)); } catch { /* below */ }
step('the first launch\'s numbers are there (run dev/checks/gameready.js first)', Boolean(first?.firstFrameMs), first);
// the same scene code as the first launch (dev/checks/gameready.js wrote it next to its numbers)
const GAME = await window.hub.fs.read(`${DIR}/game-scene.js`).catch(() => null);
step('the same scene code', Boolean(GAME));
if (first && GAME) {
  // the same scene as the first launch's measure, written to the store and played BEFORE the Lab opens (no preview of
  // it compiles anything in this run first)
  await Lazy.load('gamemode'); await Lazy.load('gameready');
  let ID = 'grlaunch';
  // (after the Lab's own first read of its scenes at the start; the Lab may be open again: this profile remembers the
  // last tool — then the scene goes in through its list, not opened, so its preview never compiles it)
  await wait(4000);
  if (typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.create) {
    const x = ThreeLab.scenes.create({ id: ID, name: 'Clink', code: GAME, layers: [{ id: 'game', name: 'Game', code: GAME }], open: false });
    ID = x?.id || ThreeLab.scenes.all().filter((y) => y.name === 'Clink').pop()?.id;
  } else {
    for (let i = 0; i < 5; i++) {
      const sk = (await window.hub.kvGet('three-sketches', [])) || [];
      if (sk.some((x) => x.id === ID)) break;
      sk.push({ id: ID, name: 'Clink', layers: [{ id: 'game', name: 'Game', code: GAME }], createdAt: Date.now(), updatedAt: Date.now() });
      await window.hub.kvSet('three-sketches', sk); await wait(1500);
    }
  }
  out.labOpen = typeof ThreeLab !== 'undefined' && Boolean(ThreeLab.scenes);
  const refs = (await window.hub.kvGet('three-refs', {})) || {};
  refs[ID] = [{ id: 'g1', key: 'ground', kind: 'image', name: 'ground.jpg', path: `${DIR}/ground.jpg` }, { id: 'g2', key: 'detail', kind: 'image', name: 'detail.png', path: `${DIR}/detail.png` }];
  await window.hub.kvSet('three-refs', refs);
  localStorage.removeItem('gameready.test');
  const t0 = performance.now();
  await GameMode.play({ kind: 'lab', id: ID, title: 'Clink' });
  const st = await until(() => GameReady.state()?.first5 && GameReady.state(), 180000);
  const second = { shaderWaitMs: st?.result?.total?.waitMs, firstFrameMs: Math.round(st?.page?.firstFrameAt || 0), links: st?.result?.total?.links, readyMs: st?.result?.ms, effectsMs: st?.result?.steps?.effects, playToFirst5Ms: Math.round(performance.now() - t0) };
  await GameMode.leave();
  out.first = first; out.second = second;
  out.faster = { shaderWait: `${first.shaderWaitMs} → ${second.shaderWaitMs} ms for ${first.links} → ${second.links} programs (${Math.round((1 - second.shaderWaitMs / first.shaderWaitMs) * 100)} % less)`, firstFrame: `${first.firstFrameMs} → ${second.firstFrameMs} ms`, ready: `${first.readyMs} → ${second.readyMs} ms (wall time)`, effects: `${first.effectsMs} → ${second.effectsMs} ms` };
  // the verdict: the page's time to its first frame + compiling the rest ahead (what shader compiles cost the window)
  const cost = (x) => (x.firstFrameMs || 0) + (x.effectsMs || 0);
  out.faster.firstFramePlusEffects = `${cost(first)} → ${cost(second)} ms (${Math.round((1 - cost(second) / cost(first)) * 100)} % less)`;
  step('second launch: ▶ Play\'s window draws its first frame and compiles ahead sooner (Chromium\'s shader disk cache, persist:hearth-game)', cost(first) > 0 && cost(second) < cost(first), out.faster);
}
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: window.GR_REPORT ? true : bad.length === 0, failed: bad.map((s) => s.name), ...out }, null, 1);
