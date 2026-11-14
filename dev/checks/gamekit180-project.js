// The Game kind of project (round 180, gamekit), by clicks:
//   Projects › ＋ New project, a name, Start from › 🎮 Game, Create: the project is marked as a game (workspace.kind),
//   its scene is a v2 scene with the four starter layers (World, Player, HUD, Game logic), the starter game runs in the
//   Lab preview (its shared state is there), the Lab's toolbar reads ▶ Playtest with 💾 Saves next to it, and ▶ Playtest
//   runs it in its window (the rules step, P pauses it: a key read through the game kit's input).
// WebGPU: SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" node dev/smoke.js --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/gamekit180-project.js
const { step, wait, click } = J;
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; }; // (the value itself, not just true)
J.shotDir = window.SMOKE_TMP || '/tmp';
const card = () => document.querySelector('dialog.pw-wizard.pcw[open]');
const btn = (root, re) => [...(root || document).querySelectorAll('button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const byName = (n) => Projects.all().find((p) => p.name === n) || null;
const ready = (n) => ProjectWorkspace.current()?.name === n && ProjectWorkspace.state().phase === 'ready';
const G = () => window.hub.game;
const ev = async (code) => { const r = await G().eval(code); return r?.error ? { error: r.error } : r?.value; };
try {
  await Lazy.load('projects'); await Projects.ready();
  await ProjectWorkspace.home();
  await until(() => btn(document.querySelector('.pj-home'), /^＋ New project$/), 10000);
  await click(btn(document.querySelector('.pj-home'), /^＋ New project$/));
  await until(() => card(), 8000);
  const d = card();
  await J.type('Coin Run');
  const sec = [...d.querySelectorAll('details.pcw-sec')].find((x) => x.querySelector('summary b')?.textContent === 'Start from');
  if (sec && !sec.open) await click(sec.querySelector('summary'));
  await wait(200);
  const chip = await until(() => btn(card(), /Game$/), 4000);
  step('Start from offers 🎮 Game', Boolean(chip), chip?.textContent);
  await click(chip); await wait(200);
  await click(btn(card(), /^Create project/));
  await until(() => ready('Coin Run'), 60000);
  const p = byName('Coin Run');
  const sc = p ? ThreeLab.scenes.get(p.workspace.sceneId) : null;
  step('the project is marked as a game', ready('Coin Run') && p?.workspace?.kind === 'game' && p.workspace.start === 'game', { ws: p && { kind: p.workspace.kind, start: p.workspace.start }, steps: ProjCreate.last.steps });
  step('its scene is a v2 scene with the four starter layers', sc?.format === 'gpu' && JSON.stringify((sc.layers || []).map((L) => L.name)) === JSON.stringify(['World', 'Player', 'HUD', 'Game logic']), { format: sc?.format, layers: (sc?.layers || []).map((L) => L.name) });
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes.currentId() === sc?.id, 30000);
  const read = async () => { const r = await ThreeLab.director.evalInSketch('return JSON.stringify(window.GAME ? { coins: window.GAME.coins.length, time: window.GAME.time, score: window.GAME.score, best: window.GAME.best, hud: (document.body.innerText || "").slice(0, 40) } : null)').catch(() => null); try { return JSON.parse(r?.value); } catch { return null; } };
  const g = await until(async () => { const v = await read(); return v && v.coins === 6 && v.time > 0.05 ? v : null; }, 40000) || { raw: await ThreeLab.director.evalInSketch('return JSON.stringify({ game: Boolean(window.GAME), coins: window.GAME && window.GAME.coins.length, time: window.GAME && window.GAME.time, g2: window.__labG2 ? window.__labG2.state() : null })').catch((e) => String(e)), view: (typeof H !== 'undefined' && H.activeId) || null };
  // (a test copy never has the keyboard: its preview dozes, a few frames a second; a few steps of the rules are enough here)
  step('the starter game runs in the Lab preview (its rules step, the HUD shows)', g && /Coins 0/.test(g.hud) && g.score === 0, g);
  const playBtn = document.querySelector('.surface.active [data-feature="Play"]') || document.querySelector('[data-feature="Play"]');
  const savesBtn = document.querySelector('[data-feature="Game saves"]');
  step('the Lab toolbar reads ▶ Playtest, with 💾 Saves next to it', /Playtest/.test(playBtn?.textContent || '') && savesBtn && !savesBtn.hidden, { play: playBtn?.textContent, saves: savesBtn ? !savesBtn.hidden : null });
  const rep = JSON.stringify(ThreeLab.director.report?.() || {});
  step('the Lab\'s report tells the AI it is a game project', /a game project/.test(rep), rep.slice(0, 200));
  store.set('gamemode.window', '720');
  playBtn.click();
  await until(async () => (await G().state())?.pid, 90000);
  const run = async () => { try { return JSON.parse(await ev('JSON.stringify(window.GAME ? { time: window.GAME.time, paused: window.GAME.paused, coins: window.GAME.coins.length } : null)')); } catch { return null; } };
  const a = await until(async () => { const v = await run(); return v && v.time > 0.5 ? v : null; }, 60000);
  const st = await G().state();
  await G().key({ key: 'P' }); await wait(500);
  const b = await run();
  step('▶ Playtest runs it in its window; P pauses it', a && st.windowed === true && st.format === 'gpu' && b?.paused === true, { a, b, how: st.how, errors: await ev('JSON.stringify(window.__hearthGame && window.__hearthGame.errors)') });
  await G().leave(); await until(async () => !(await G().state())?.playing, 15000);
  // the project menu's "Game project" row: off, then on again, the Lab's toolbar following
  await Lazy.load('projmenu');
  const gameRow = () => ProjectMenu.items(byName('Coin Run'), { where: 'menu' }).find((x) => x && x.id === 'game');
  const was = gameRow();
  await was.action(); await wait(400);
  const off = { kind: byName('Coin Run').workspace.kind, play: playBtn.textContent, saves: !savesBtn.hidden, checked: gameRow().checked };
  await gameRow().action(); await wait(400);
  const on = { kind: byName('Coin Run').workspace.kind, play: playBtn.textContent, saves: !savesBtn.hidden, checked: gameRow().checked };
  step('the project menu\'s Game project row marks and unmarks it; the Lab toolbar follows', was?.checked === true && off.kind == null && /Play$/.test(off.play.trim()) && !/Playtest/.test(off.play) && off.saves === false && off.checked === false && on.kind === 'game' && /Playtest/.test(on.play) && on.saves === true && on.checked === true, { off, on });
} catch (err) { step('stopped', false, String(err?.stack || err).slice(0, 500)); for (const x of document.querySelectorAll('dialog[open]')) x.close(); }
store.set('gamemode.window', 'full');
return J.done();
