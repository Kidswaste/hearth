// (round 128, projcreate128) The new-project card, by clicks (docs/upgrades/projcreate128.md):
//   1. Projects › ＋ New project, a name, Create project ↗: two clicks, the project opens (chat, scene, moodboard) with
//      the defaults (empty scene, 16:9, 30 fps) and no brief asked for
//   2. Start from › Audio visualizer, a song and two pictures dropped on the card, the House palette clicked (and ✦ Suggest
//      a palette read from the pictures), 9:16 and 60 fps, Claude directs, "Let the AI look at the moodboard" ticked: the scene has the
//      visualizer's layers in the palette's colors, the frame and song, the moodboard the pictures; the brief (on by
//      itself with a song) goes to a stub ProjectBrief: prepare(id, { moodboard: true, refs, song, scene, notes }) then open(id)
//   3. the card again: 9:16, 60 fps and the AI (Claude, chosen in 2; Astra is the default) remembered
//   4. no ProjectBrief (its group missing): the brief ticked by hand, Create: the project opens, a note says the brief
//      isn't available
// Only the check's own temp data folder is used (smoke.js), never real data. Fixtures: /tmp/hearth-test-song.wav and
// /tmp/hearth-board-fixtures (made by dev/run-checks.js).
//   node dev/smoke.js --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/projcreate128.js
const { step, wait, until, click } = J;
J.shotDir = window.SMOKE_TMP || '/tmp';
const SONG = '/tmp/hearth-test-song.wav';
const PICS = ['/tmp/hearth-board-fixtures/neon big.png', '/tmp/hearth-board-fixtures/golden-hour.jpg'];
const card = () => document.querySelector('dialog.pw-wizard.pcw[open]');
const btn = (root, re) => [...(root || document).querySelectorAll('button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const byName = (n) => Projects.all().find((p) => p.name === n) || null;
const ready = (n) => ProjectWorkspace.current()?.name === n && ProjectWorkspace.state().phase === 'ready';
const openSec = async (name) => { const s = [...card().querySelectorAll('details.pcw-sec')].find((x) => x.querySelector('summary b')?.textContent === name); if (s && !s.open) await click(s.querySelector('summary')); await wait(150); return s; };
const dropOn = (node, paths) => { const dt = { files: paths.map((p) => ({ name: p.split('/').pop(), path: p })), items: paths.map(() => ({ kind: 'file' })), types: ['Files'], getData: () => '', dropEffect: 'none' }; for (const type of ['dragenter', 'dragover', 'drop']) { const ev = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'dataTransfer', { value: dt }); node.dispatchEvent(ev); } };
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: stopped`, false, String(err?.stack || err).slice(0, 400)); await smoke({ shot: `${J.shotDir}/pc128-${name.slice(0, 2)}.png` }).catch(() => {}); for (const d of document.querySelectorAll('dialog[open]')) d.close(); } };
const fsOk = async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null));
step('fixtures: a test song and two pictures', (await fsOk(SONG)) && (await fsOk(PICS[0])) && (await fsOk(PICS[1])));
try { localStorage.removeItem('hub.projcreate.last'); } catch { /* fresh profile anyway */ }
delete window.ProjectBrief;

await Lazy.load('projects'); await Projects.ready();
await ProjectWorkspace.home();
await until(() => btn(document.querySelector('.pj-home'), /^＋ New project$/), 10000);

// ---------- 1. a name and Create: two clicks ----------
await section('1. name + Create', async () => {
  await click(btn(document.querySelector('.pj-home'), /^＋ New project$/)); // click 1
  await until(() => card(), 8000);
  const d = card();
  step('＋ New project opens the card (the richer one, lazy group projcreate), the name field focused', Boolean(d) && Lazy.loaded('projcreate') && document.activeElement === d.querySelector('input'));
  step('its four parts have visible labels', ['Start from', 'Music & footage', 'Look', 'AI'].every((n) => [...d.querySelectorAll('summary b')].some((b) => b.textContent === n && J.visible(b))));
  await J.type('Quick One');
  const t0 = performance.now();
  await click(btn(d, /^Create project/)); // click 2
  await until(() => ready('Quick One'), 40000);
  const p = byName('Quick One');
  step('…Create project ↗ makes it and opens it: chat, scene and moodboard', ready('Quick One') && Boolean(p?.workspace?.chatId && p.workspace.sceneId && p.workspace.boardId), { ms: Math.round(performance.now() - t0) });
  step('the defaults: an empty scene, 16:9, 30 fps; no brief asked for', p?.workspace?.start === 'empty' && ThreeLab.scenes.frameOf(p.workspace.sceneId) === '16:9' && p.workspace.fps === 30 && ProjCreate.last.brief === null, { ws: p?.workspace, brief: ProjCreate.last.brief });
});

// ---------- 2. a template, a song and pictures dropped, a palette; the brief to a stub ----------
const calls = [];
window.ProjectBrief = { prepare: async (id, o) => { calls.push(['prepare', id, o]); await wait(50); return { ok: true }; }, open: async (id) => { calls.push(['open', id]); return true; } };
await section('2. template + song + pictures + palette + brief', async () => {
  await ProjectWorkspace.wizard();
  await until(() => card(), 8000);
  const d = card();
  d.querySelector('input').focus(); await J.type('Glass Tide');
  const intent = d.querySelector('textarea'); intent.focus(); await J.type('a 30-second loop for a techno track, dark and glossy');
  await click(btn(d, /Audio visualizer/));
  step('Start from › Audio visualizer is chosen (its summary says so)', btn(d, /Audio visualizer/)?.getAttribute('aria-pressed') === 'true' && /Audio visualizer/.test(d.querySelector('[data-sec=start] .pcw-sum').textContent));
  dropOn(d.querySelector('.pcw-drop') || d, [SONG, ...PICS]);
  await wait(200);
  step('a song and two pictures dropped on the card: sorted (song under Music & footage, pictures under Look)', /hearth-test-song/.test(d.querySelector('[data-sec=media] .pcw-sum').textContent) && /2 pictures/.test(d.querySelector('[data-sec=look] .pcw-sum').textContent), [d.querySelector('[data-sec=media] .pcw-sum').textContent, d.querySelector('[data-sec=look] .pcw-sum').textContent]);
  await openSec('Look');
  await click(btn(d, /Suggest a palette/));
  await until(() => /From the pictures/.test(d.querySelector('.pcw-palnow')?.textContent || ''), 8000);
  const suggested = (d.querySelector('.pcw-palnow')?.textContent || '').match(/#[0-9a-f]{6}/gi) || [];
  step('✦ Suggest a palette reads colors from the pictures (on this computer)', suggested.length >= 2, suggested);
  await click(btn(d, /^House$/));
  await click(btn(d, /^9:16/)); await click(btn(d, /^60 fps$/));
  await openSec('AI');
  const claudeName = H.claudeAgent()?.name || 'Claude';
  await click([...d.querySelectorAll('[data-sec=ai] .pcw-chip')].find((b) => b.textContent === claudeName)); // not the default (Astra comes first)
  step('Who directs › Claude is chosen', [...d.querySelectorAll('[data-sec=ai] .pcw-chip.on')].map((b) => b.textContent).join() === claudeName);
  const ticks = [...d.querySelectorAll('[data-sec=ai] label.check')];
  const consent = ticks.find((l) => /look at the moodboard/.test(l.textContent))?.querySelector('input');
  const briefTick = ticks.find((l) => /prepare a brief/.test(l.textContent))?.querySelector('input');
  step('"Let the AI prepare a brief" is on by itself (there is a song and pictures); the moodboard tick is off until clicked', briefTick?.checked === true && consent?.checked === false);
  await click(consent);
  step('the AI part\'s summary names the brief and the moodboard consent', /brief/.test(d.querySelector('[data-sec=ai] .pcw-sum').textContent) && /sees the moodboard/.test(d.querySelector('[data-sec=ai] .pcw-sum').textContent), d.querySelector('[data-sec=ai] .pcw-sum').textContent);
  await click(btn(d, /^Create project/));
  await until(() => ready('Glass Tide'), 60000);
  const p = byName('Glass Tide');
  const id = p?.workspace?.sceneId; const x = id && ThreeLab.scenes.get(id);
  const crown = LabGalleryData.layersOf(LabGalleryData.STARTS.find((s) => s.id === 'spectrum-crown')).map((L) => L.name);
  const house = ProjCreateCore.PALETTES.find((q) => q.name === 'House').colors;
  step('the scene starts as the Audio visualizer (the gallery\'s Spectrum crown layers)', JSON.stringify(x?.layers?.map((L) => L.name)) === JSON.stringify(crown), { have: x?.layers?.map((L) => L.name), want: crown });
  step('…in the House palette (the scene\'s palette, and its color sliders)', JSON.stringify(x?.palette) === JSON.stringify(house) && x.layers.some((L) => house.some((c) => L.code.includes(`'${c}'`))), x?.palette);
  step('9:16, 60 fps (the project, the Render card), the song is the scene\'s song', ThreeLab.scenes.frameOf(id) === '9:16' && p.workspace.fps === 60 && store.get('three.export', {}).fps === 60 && ThreeLab.scenes.songOf(id) === SONG, { frame: ThreeLab.scenes.frameOf(id), song: ThreeLab.scenes.songOf(id) });
  await until(async () => (await Board.load(p.workspace.boardId))?.items?.length >= 2, 15000);
  const b = await Board.load(p.workspace.boardId);
  step('the pictures are on the project\'s moodboard; the files are in the project', (b?.items?.length || 0) >= 2 && [SONG, ...PICS].every((f) => p.items.some((it) => it.type === 'file' && it.ref === f)), { board: b?.items?.length });
  await until(() => calls.length >= 2, 10000);
  const prep = calls.find((c) => c[0] === 'prepare'); const opened = calls.find((c) => c[0] === 'open');
  step('the brief: ProjectBrief.prepare(the project, { moodboard: true, refs, song, scene, notes: what I am making }) then open(the project)',
    prep?.[1] === p.id && JSON.stringify(prep[2]) === JSON.stringify({ moodboard: true, refs: true, song: true, scene: true, notes: 'a 30-second loop for a techno track, dark and glossy' }) && opened?.[1] === p.id && calls.indexOf(prep) < calls.indexOf(opened) && ProjCreate.last.brief?.ok === true, calls);
  step('the consent is kept on the project; Claude directs its chat', p.workspace.aiSeesMoodboard === true && H.chats.find((c) => c.id === p.workspace.chatId)?.agentId === H.claudeAgent()?.id);
});

// ---------- 3. the card remembers the size, frame rate and AI ----------
await section('3. remembered', async () => {
  await ProjectWorkspace.wizard();
  await until(() => card(), 8000);
  const d = card();
  await openSec('Look');
  step('the card again: 9:16 and 60 fps are chosen (this computer remembers them)', btn(d, /^9:16/)?.getAttribute('aria-pressed') === 'true' && btn(d, /^60 fps$/)?.getAttribute('aria-pressed') === 'true' && /9:16 · vertical · 60 fps/.test(d.querySelector('[data-sec=look] .pcw-sum').textContent));
  await openSec('AI');
  const on = [...d.querySelectorAll('[data-sec=ai] .pcw-chip.on')].map((b) => b.textContent);
  step('…and the same AI directs (Claude, chosen last time)', on.length === 1 && on[0] === (H.claudeAgent()?.name || 'Claude'), { on });
  d.close();
});

// ---------- 4. no ProjectBrief: the project still opens, a note says so ----------
delete window.ProjectBrief;
await section('4. brief not available', async () => {
  await ProjectWorkspace.wizard();
  await until(() => card(), 8000);
  const d = card();
  d.querySelector('input').focus(); await J.type('No Brief Here');
  await openSec('AI');
  const briefTick = [...d.querySelectorAll('[data-sec=ai] label.check')].find((l) => /prepare a brief/.test(l.textContent))?.querySelector('input');
  step('with nothing added the brief is off; ticked by hand', briefTick?.checked === false);
  await click(briefTick);
  await click(btn(d, /^Create project/));
  await until(() => ready('No Brief Here'), 40000);
  await until(() => ProjCreate.last.brief, 8000);
  const note = [...document.querySelectorAll('.toast')].map((t) => t.textContent).find((t) => /brief isn.t available/.test(t));
  step('the project opens; the brief is skipped quietly with a note', ready('No Brief Here') && ProjCreate.last.brief?.available === false && Boolean(note), { brief: ProjCreate.last.brief, note });
});

return J.done();
