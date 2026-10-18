// ▶ Play's playtest notes (round 62, playnotes62: playnotes.js, playnotes-core.js, playnotesmain.js, game-preload.js).
//   note     a Lab scene in two layers ("Spin": no hooks; "Game": a score, a player and a camera, saveState / restoreState,
//            and a keydown counter) played with ▶ Play; F8 (real input into the game window, read main-side) → a note:
//            its picture (data/game-cache/lab-<scene>/notes/<id>.jpg), the time into the session, the saved state
//            (score 42, the player's position), the camera, the frame rate then; "✎ Note 1" over the game; the game never
//            gets the F8
//   words    Shift+F8 → a note + the words box: a W typed there doesn't reach the game (its keydown count stays), Enter
//            keeps the words with the note
//   cost     nothing per frame added in the game window: playbudget's helper accounting has no helper of its own
//            (the helpers before = after, Hearth's own ms a frame within noise), the page's listeners on window /
//            document the same before and after the notes (box closed), the page's frame callbacks a frame the same
//   log      Ctrl/⌘+P back to editing: "2 notes from this playtest" → Open the log: two rows with their pictures
//   jump     the Lab preview's score and camera changed; a click on note 1 → the Lab back at that moment (restoreState:
//            score 42, the camera where it was)
//   fix      "Fix this" on note 2 → the docked director's box holds the task (its words, "Fix this.") and its picture,
//            not sent (still in the box later)
//   html     the test HTML game (dev/fixtures/game-html): F8 → a note with window.__game's state and the player's
//            position, in its own folder; the game's files untouched
//   chat     /playtest notes lists them; /playtest clear moves them to the Trash; /playtest key F9 changes the key
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/playnotes62.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const DIR = '/tmp/hearth-gamemode';
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const ui = (sel, what = 'textContent') => ev(`(() => { const n = document.querySelector('hearth-game-ui')?.shadowRoot?.querySelector(${JSON.stringify(sel)}); return n ? (${JSON.stringify(what)} === 'shown' ? !n.hidden : ${JSON.stringify(what)} === 'on' ? n.classList.contains('on') : ${JSON.stringify(what)} === 'value' ? n.value : n.textContent) : null; })()`);
const pc = (method, params) => Promise.race([smoke({ pageCdp: '^hearth-game:', cdp: method, params }), wait(5000).then(() => ({ error: 'timeout' }))]);
const N = (req) => G().notes(req);
const say = async (line) => { let t = ''; const grab = (x) => { t += `${t ? '\n' : ''}${x ?? ''}`; }; await Commands.tryRun(line, H.claudeAgent().id, null, { source: 'chat', say: grab, note: grab }); return t; };
const toasts = () => [...document.querySelectorAll('.toast')].map((x) => x.textContent);

// Hearth's listeners on window / document in the game's page (CDP DOMDebugger, the page's and the preload's)
async function listeners() {
  let n = 0; const by = {};
  for (const expr of ['window', 'document']) {
    const o = await pc('Runtime.evaluate', { expression: expr });
    const id = o?.result?.objectId; if (!id) return { error: o?.error || 'no object' };
    for (const l of (await pc('DOMDebugger.getEventListeners', { objectId: id }))?.listeners || []) { n += 1; by[l.type] = (by[l.type] || 0) + 1; }
  }
  return { n, by };
}
// the page's frame callbacks a frame (its own requestAnimationFrame counted for 1.5 s, then put back)
async function rafPerFrame() {
  await ev(`(() => { const W = window; if (W.__pnRaf) return 1; const raf = W.requestAnimationFrame; const c = { calls: 0, frames: 0, raf }; W.__pnRaf = c; W.requestAnimationFrame = function (f) { c.calls += 1; return raf.call(W, f); }; const tick = () => { c.frames += 1; if (W.__pnRaf === c) raf.call(W, tick); }; raf.call(W, tick); return 1; })()`);
  await wait(1500);
  const r = JSON.parse(await ev(`(() => { const c = window.__pnRaf; window.requestAnimationFrame = c.raf; delete window.__pnRaf; return JSON.stringify({ calls: c.calls, frames: c.frames }); })()`));
  return { ...r, perFrame: r.frames ? +(r.calls / r.frames).toFixed(2) : null };
}
const budget = async () => { const v = await ev('window.__hearthBudget ? window.__hearthBudget.pub() : ""'); return v ? JSON.parse(v) : null; };

const SPIN = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101828');
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100); cam.position.z = 4;
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: '#4fd1c5' })); scene.add(ring);
renderer.setAnimationLoop((t) => { ring.rotation.z = t / 900; renderer.render(scene, cam); });`;
const GAME = `import * as THREE from 'three';
let score = 0; let kd = 0;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100); cam.position.set(0, 1, 5);
const player = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); player.name = 'player'; scene.add(player);
addEventListener('keydown', () => { kd += 1; });
globalThis.__pn = { get score() { return score; }, set(k) { score = k; }, get kd() { return kd; }, player, cam };
renderer.setAnimationLoop((t) => { player.rotation.y = t / 1000; renderer.render(scene, cam); });
export function saveState() { return { score, player: player.position.toArray() }; }
export function restoreState(s) { score = s.score; player.position.fromArray(s.player); }`;
const LAYERS = [{ id: 'spin', name: 'Spin', code: SPIN }, { id: 'game', name: 'Game', code: GAME }];

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
await Commands.tryRun('/director-setup', H.claudeAgent().id);
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
await Lazy.load('gamemode');
await Lazy.load('directorgame').catch(() => {});
let sceneId = null; let src = null; let notes = [];

await safe('note', async () => {
  const x = ThreeLab.scenes.create({ name: 'Clink notes', code: LAYERS[0].code, layers: LAYERS, open: true });
  sceneId = x?.id || ThreeLab.scenes.all().find((s) => s.name === 'Clink notes')?.id;
  ThreeLab.scenes.open(sceneId);
  await wait(2500);
  src = { kind: 'lab', id: sceneId, title: 'Clink notes' };
  await GameMode.play(src);
  const up = await until(() => ev('Boolean(window.__hearthGame && window.__hearthGame.drawn && globalThis.__pn && window.__labHot && window.__labHot.info().hooks.includes("game"))'), 90000);
  step('the scene plays in ▶ Play with its hooks', up);
  await until(async () => (await budget())?.playing, 15000);
  await wait(2500); // (a few of the watch's windows: its frame rate is there)
  out.measure.hint = await ui('.hint');
  step('the start hint names the note key', /F8: note/.test(out.measure.hint || ''), out.measure.hint);
  // the cost before any note
  out.measure.before = { listeners: await listeners(), raf: await rafPerFrame(), budget: await budget() };
  await ev('__pn.set(42); __pn.player.position.set(1.5, 0, -3); __pn.cam.position.set(0, 2, 6); 1');
  const kd0 = await ev('__pn.kd');
  const t0 = performance.now();
  await G().key({ key: 'F8' });
  const one = await until(async () => { const r = await N({ op: 'list', source: src }); return r?.notes?.length === 1 ? r : null; }, 10000);
  out.measure.noteMs = Math.round(performance.now() - t0);
  const st = await N({ op: 'state' });
  out.measure.last = st.last;
  const full = one ? (await N({ op: 'get', source: src, id: one.notes[0].id }))?.note : null;
  const shot = full ? await N({ op: 'shot', source: src, id: full.id, path: true }) : null;
  const pic = full ? await N({ op: 'shot', source: src, id: full.id, width: 240 }) : null;
  out.measure.note = full ? { secs: full.secs, state: full.state, pos: full.pos, cams: full.cams, perf: full.perf, w: full.w, h: full.h, path: shot?.path } : null;
  step('F8 → a note: its picture, in data/game-cache/lab-<scene>/notes', Boolean(full?.shot && shot?.ok && /game-cache[\\/]lab-[^\\/]+[\\/]notes[\\/]n\w+\.jpg$/.test(shot.path) && pic?.ok && pic.data.length > 200), { path: shot?.path, w: full?.w, h: full?.h });
  step('… the time into the session, the saved state (score 42) and the player\'s position', full && full.secs > 1 && full.state?.game?.score === 42 && full.pos && Math.abs(full.pos.x - 1.5) < 1e-6 && Math.abs(full.pos.z + 3) < 1e-6, { secs: full?.secs, state: full?.state, pos: full?.pos });
  step('… the camera and the frame rate then', full?.cams?.Game && Math.abs(full.cams.Game.p[1] - 2) < 1e-6 && full.perf && full.perf.fps > 0, { cams: full?.cams, perf: full?.perf });
  step('"✎ Note 1" over the game; the game didn\'t get the F8', /Note 1/.test(await ui('.blip') || '') && (await ev('__pn.kd')) === kd0, { blip: await ui('.blip'), kd: [kd0, await ev('__pn.kd')] });
  notes = one?.notes || [];
});

await safe('words', async () => {
  const kd0 = await ev('__pn.kd');
  await G().key({ key: 'F8', mods: ['shift'] });
  const open = await until(() => ui('.nb', 'shown'), 8000);
  await wait(200);
  await G().key({ key: 'W' }); // (typed into the box: the game's keydown listener never sees it)
  await wait(200);
  const typed = await ui('.nb input', 'value');
  const kd1 = await ev('__pn.kd');
  await ev(`(() => { const i = document.querySelector('hearth-game-ui').shadowRoot.querySelector('.nb input'); i.value = 'the jump clips through the ledge'; return 1; })()`);
  await G().key({ key: 'Enter' });
  const closed = await until(async () => (await ui('.nb', 'shown')) === false, 5000);
  const two = await until(async () => { const r = await N({ op: 'list', source: src }); return r?.notes?.length === 2 && r.notes[1].text ? r : null; }, 6000);
  step('Shift+F8 → a note and the words box; a key typed there doesn\'t reach the game', open && /w/i.test(typed || '') && kd1 === kd0, { typed, kd: [kd0, kd1] });
  step('… Enter keeps the words with the note, the box goes', closed && two?.notes[1].text === 'the jump clips through the ledge', two?.notes?.map((n) => n.text));
  notes = two?.notes || notes;
  // F after the box closed is the chip's again (the main side's keys are back)
  await G().key({ key: 'F' }); const chip = await until(() => ui('.chip', 'shown'), 3000); await G().key({ key: 'F' });
  step('… the window\'s own keys are back after it (F: the chip)', chip);
});

await safe('cost', async () => {
  await wait(1500);
  const after = { listeners: await listeners(), raf: await rafPerFrame(), budget: await budget() };
  const b0 = out.measure.before.budget; const b1 = after.budget;
  out.measure.after = after;
  const ids0 = Object.keys(b0?.helpers || {}).sort(); const ids1 = Object.keys(b1?.helpers || {}).sort();
  out.measure.cost = { helpersBefore: ids0, helpersAfter: ids1, notesHelperMs: 0, hearthMsBefore: b0?.avgMs, hearthMsAfter: b1?.avgMs, listenersBefore: out.measure.before.listeners.n, listenersAfter: after.listeners.n, rafBefore: out.measure.before.raf.perFrame, rafAfter: after.raf.perFrame, readMs: out.measure.last?.readMs };
  step('nothing per frame added: playbudget\'s helpers the same before and after (no helper of the notes\' own: 0 ms)', ids0.length > 0 && JSON.stringify(ids0) === JSON.stringify(ids1) && !ids1.some((id) => /note/i.test(id)), out.measure.cost);
  step('… the page\'s listeners on window / document the same (the box\'s are gone with it)', !out.measure.before.listeners.error && after.listeners.n === out.measure.before.listeners.n, { before: out.measure.before.listeners.by, after: after.listeners.by });
  step('… the page\'s frame callbacks a frame the same', after.raf.perFrame != null && Math.abs(after.raf.perFrame - out.measure.before.raf.perFrame) < 0.35, { before: out.measure.before.raf, after: after.raf });
});

await safe('log', async () => {
  for (const t of document.querySelectorAll('.toast')) t.remove();
  await G().key({ key: 'P', mods: ['control'] });
  const rested = await until(() => GameMode.state().resting, 8000);
  const t = await until(() => toasts().find((x) => /2 notes from this playtest/.test(x)), 6000);
  step('Ctrl/⌘+P back to editing → "2 notes from this playtest"', rested && t, { toasts: toasts() });
  const btn = [...document.querySelectorAll('.toast button')].find((b) => /Open the log/.test(b.textContent));
  btn?.click();
  const dlg = await until(() => document.querySelector('dialog.pn-log[open]'), 5000);
  const rows = await until(() => { const r = [...document.querySelectorAll('dialog.pn-log .pn-row')]; return r.length === 2 && r.every((x) => x.querySelector('img.pn-shot')?.src?.startsWith('data:image/jpeg')) ? r : null; }, 8000);
  step('… Open the log: two notes with their pictures and lines', dlg && rows, { rows: [...document.querySelectorAll('dialog.pn-log .pn-meta')].map((x) => x.textContent), sub: document.querySelector('dialog.pn-log .pn-sub')?.textContent });
});

await safe('jump', async () => {
  // the Lab preview runs the same scene: move it away from the note
  const d = ThreeLab.director;
  await until(async () => (await d.evalInSketch('return Boolean(globalThis.__pn && window.__labHot && window.__labHot.info().hooks.includes("game"))'))?.value === true, 20000);
  await d.evalInSketch('__pn.set(3); __pn.cam.position.set(9, 9, 9); __pn.player.position.set(0, 0, 0); return 1');
  const row = document.querySelector('dialog.pn-log .pn-row');
  row?.click();
  const back = await until(async () => { const r = await d.evalInSketch('return JSON.stringify({ s: __pn.score, c: __pn.cam.position.toArray(), p: __pn.player.position.toArray() })'); const v = r?.ok ? JSON.parse(r.value) : null; return v && v.s === 42 ? v : null; }, 10000);
  step('a click on note 1 → the Lab back at that moment (restoreState: score 42, the player, the camera)', back && back.p[0] === 1.5 && back.p[2] === -3 && Math.abs(back.c[1] - 2) < 1e-6 && Math.abs(back.c[2] - 6) < 1e-6, back);
  step('… the log closed for it, the toast says where', !document.querySelector('dialog.pn-log[open]') && toasts().some((x) => /↺ Clink notes at/.test(x)), toasts());
});

await safe('fix', async () => {
  await PlayNotes.open({ source: src });
  await until(() => document.querySelectorAll('dialog.pn-log .pn-row').length === 2, 5000);
  const fixBtn = [...document.querySelectorAll('dialog.pn-log .pn-row')][1]?.querySelector('.pn-acts button');
  fixBtn?.click();
  const dir = H.agents().find((a) => a.dock === 'three');
  const ta = await until(() => [...document.querySelectorAll('.composer textarea')].find((x) => /Fix this\./.test(x.value)), 10000);
  const pics = await until(() => (Native.view(dir.id)?.attachments || []).filter((a) => a.kind === 'image' && /\.jpe?g$/i.test(a.path || a.name || '')), 6000);
  await wait(1500);
  const still = ta && /Fix this\./.test(ta.value);
  step('"Fix this" → the director\'s box holds the task with its words and picture', ta && /the jump clips through the ledge/.test(ta.value) && /Playtest note from Clink notes/.test(ta.value) && pics?.length >= 1, { draft: ta?.value, pics: pics?.length });
  step('… never sent (still in the box)', still, { still });
  out.measure.draft = ta?.value;
  if (ta) Native.setDraft(dir.id, '');
  if (Native.view(dir.id)) Native.view(dir.id).attachments.length = 0;
});

await safe('chat', async () => {
  const t = await say('/playtest notes');
  step('/playtest notes lists them', /2 playtest notes/.test(t) && /1\. 0:0\d/.test(t) && /the jump clips/.test(t), t);
  document.querySelector('dialog.pn-log[open]')?.close();
  const k = await say('/playtest key F9');
  const st = await N({ op: 'state' });
  step('/playtest key F9: the note key changes now (and the next ▶ Play)', /F9/.test(k) && st.key === 'F9' && PlayNotes.prefs().key === 'F9', { k, st: st.key });
  await say('/playtest key F8');
});

await safe('html', async () => {
  await GameMode.leave();
  await until(async () => !(await G().state())?.playing, 10000);
  const before = await window.hub.fs.read(`${DIR}/html/game.js`);
  const hsrc = { kind: 'html', path: `${DIR}/html`, title: 'Coin Run' };
  await GameMode.play(hsrc);
  await until(() => ev('Boolean(window.__game && window.__game.ready && window.__game.frames > 5)'), 60000);
  await G().key({ key: 'D' }); await wait(400);
  await G().key({ key: 'F8' });
  const r = await until(async () => { const x = await N({ op: 'list', source: hsrc }); return x?.notes?.length ? x : null; }, 10000);
  const full = r ? (await N({ op: 'get', source: hsrc, id: r.notes[0].id }))?.note : null;
  const shot = full ? await N({ op: 'shot', source: hsrc, id: full.id, path: true }) : null;
  const after = await window.hub.fs.read(`${DIR}/html/game.js`);
  let inGame = true; try { await window.hub.fs.read(`${DIR}/html/notes/log.json`); } catch { inGame = false; }
  out.measure.html = { state: full?.state ? Object.keys(full.state) : null, pos: full?.pos, perf: full?.perf, path: shot?.path };
  step('an HTML build: F8 → a note with window.__game\'s state and the player\'s position, in its own folder', full && typeof full.state?.score === 'number' && full.pos && /game-cache[\\/]html-html-[0-9a-f]{8}[\\/]notes/.test(shot?.path || ''), out.measure.html);
  step('… the game\'s files untouched (nothing written next to it)', before === after && !inGame);
  await GameMode.leave();
  await until(async () => !(await G().state())?.playing, 10000);
});

await safe('clear', async () => {
  const t = await say(`/playtest clear Clink notes`);
  const r = await N({ op: 'list', source: src });
  step('/playtest clear moves the game\'s notes to the Trash', /Moved 2 playtest notes/.test(t) && r?.notes?.length === 0, t);
});

try { if (GameMode.playing) await GameMode.leave(); } catch { /* fine */ }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out);
