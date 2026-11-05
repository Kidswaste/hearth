// (round 130, takes130) ✦ 3 takes (tools/three-takes.js, docs/upgrades/takes130.md), by clicks, with the fake engines
// making real MCP calls (dev/fake-common.js crewPlan: each helper rewrites its copy, takes a small picture, says one line):
//   1. a project with a brief and palette; the ask typed in its chat and "✦ 3 takes" clicked: the card shows the cost
//      line first and nothing runs (no helper started, the scene as it was); the takes' brief has the ask and palette
//   2. Make 3 takes: 3 takes built on copies, the owner's scene unchanged; the grid shows 3 live previews (each take's
//      stage laid over its box and drawing), each with a one-line label
//   3. click take B: it becomes the scene as ONE undo step; one /undo-edit puts the scene back exactly (LabTxn's
//      signature)
//   4. Stop mid-run (a slow fake helper), then ✕: the takes are discarded and the scene is untouched
//   5. the Mix plan (pure): A's colours with B's motion when they differ only in slider values
// Only the check's own temp data folder (smoke.js); no owner data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/takes130.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 300)})`); return Boolean(c); };
const S = () => ThreeLab.scenes;
const codes = (sid) => S().layersOf(S().get(sid)).map((L) => L.code).join('\n');
const sigOf = async (sid) => LabTxn._test.sigOf(await LabTxn.snap(sid));
const shown = (n) => Boolean(n && (n.checkVisibility?.() ?? n.getClientRects().length > 0));
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };
const MOOD = { name: 'Dusk', items: [{ id: 'sw1', type: 'swatch', colors: ['#ff3cac', '#2bd2ff', '#ffd75e', '#7cff6b'] }, { id: 'n1', type: 'note', text: 'warm neon over dark water' }] };

async function ask(text) {
  const b = await until(() => [...document.querySelectorAll('.tk-btn')].find(shown), 15000);
  if (!b) return false;
  const input = b.closest('form').querySelector('textarea, [contenteditable], input[type=text]');
  input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
  b.click();
  return Boolean(await until(() => LabTakes.card && LabTakes.current()?.status === 'plan', 15000));
}
const card = () => LabTakes.card;

try {
  await Lazy.load('projects'); await Projects.ready();
  await Lazy.load('takes');
  const claude = H.claudeAgent();
  const p = await ProjectWorkspace.create({ name: 'Takes Tide', agentId: claude.id, plugins: [] });
  await until(() => ProjectWorkspace.current()?.id === p.id && ProjectWorkspace.state().phase === 'ready', 40000);
  await Lazy.load('lab'); await Lazy.load('projectbrief');
  const sid = p.workspace.sceneId; const chatId = p.workspace.chatId;
  await ProjectBrief.prepare(p.id, { moodboard: MOOD, notes: 'Takes Tide: a short dusk loop', refs: false, song: false, quiet: true });
  await ProjectBrief.open(p.id);
  await wait(800);
  const sig0 = await sigOf(sid); const code0 = codes(sid);
  const stages0 = document.querySelectorAll('.lab-backstage').length;

  // ---------- 1. cost first, nothing without the click ----------
  ok(await ask('make the glow more aggressive'), 'typed ask + ✦ 3 takes opens the card with the plan');
  const T = LabTakes.current();
  ok(T?.chatId === chatId && T.sceneId === sid, 'the takes are of the chat\'s scene', [T?.chatId, chatId, T?.sceneId, sid]);
  const line = card()?.querySelector('.tk-line')?.textContent || '';
  ok(/About \d+(\.\d)?k? tokens in .* out · Claude/.test(line), 'the card shows the estimated cost before anything runs', line);
  ok(card()?.querySelectorAll('.tk-tile').length === 3 && shown(card()?.querySelector('.tk-go')), 'three takes planned, Make 3 takes offered');
  const brief = ThreeCrew._test.briefFor(T.crew, T.crew.helpers[0]);
  ok(/make the glow more aggressive/.test(brief) && /#ff3cac/.test(brief) && /Three takes of this ONE change/.test(brief), 'the takes\' brief has the ask and the project\'s palette', brief.slice(0, 400));
  ok(new Set(T.crew.helpers.map((h) => h.angle)).size === 3, 'three distinct takes (angles)');
  await wait(1500);
  ok(T.crew.helpers.every((h) => h.status === 'waiting') && await sigOf(sid) === sig0, 'nothing runs without the click; the scene as it was');

  // ---------- 2. three takes on copies, three live previews ----------
  card().querySelector('.tk-go').click();
  ok(T.status === 'running', 'Make 3 takes starts them');
  await until(() => ['done', 'stopped'].includes(T.crew.status), 150000);
  await wait(1200);
  out.info.run = T.crew.helpers.map((h) => ({ n: h.n, status: h.status, calls: h.calls, changed: h.changed, text: h.text }));
  ok(T.crew.status === 'done' && T.crew.helpers.every((h) => h.changed > 0 && !h.broken), '3 takes built', out.info.run);
  ok(new Set(T.crew.helpers.map((h) => h.sketch.layers.map((L) => L.code).join())).size === 3, 'three different takes');
  ok(await sigOf(sid) === sig0 && codes(sid) === code0, 'the owner\'s scene is untouched while the takes are made');
  LabTakes._test.place();
  const tiles = [...card().querySelectorAll('.tk-tile')];
  const live = T.crew.helpers.map((h, i) => {
    const host = h.stage?.host; if (!host) return null;
    const r = host.getBoundingClientRect(); const v = tiles[i].querySelector('.tk-view').getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    return { on: host.classList.contains('tk-stage-on') && getComputedStyle(host).opacity === '1', inside: cx > v.left && cx < v.right && cy > v.top && cy < v.bottom, running: Boolean(h.stage.running) };
  });
  out.info.live = live;
  ok(live.every((x) => x?.on && x.inside && x.running), 'the grid shows 3 live previews (each take\'s stage over its box, running)', live);
  const pics = await Promise.all(T.crew.helpers.map((h) => h.stage.thumb(120)));
  ok(pics.every((u) => /^data:image/.test(u || '')), 'each preview is drawing', pics.map((u) => (u || '').length));
  LabTakes._test.place(); LabTakes._test.syncClocks();
  if (typeof smoke === 'function') await smoke({ shot: `${window.SMOKE_SAVES || '/tmp'}/takes130-grid.png` }).catch(() => {});
  out.info.synced = T.synced || null;
  const labels = tiles.map((t) => t.querySelector('.tk-label').textContent.trim());
  ok(labels.every(Boolean) && new Set(labels).size === 3, 'each take has its one-line label', labels);
  ok(tiles.every((t) => t.classList.contains('ready') && !t.disabled), 'every take can be clicked');

  // ---------- 3. keep B: one undo step ----------
  const bCode = T.crew.helpers[1].sketch.layers.map((L) => L.code).join('\n');
  tiles[1].click();
  await until(() => LabTakes.last()?.status === 'kept' && !card(), 15000);
  await wait(600);
  ok(LabTakes.last()?.status === 'kept' && codes(sid) === bCode, 'clicking take B makes it the scene', codes(sid).slice(0, 120));
  ok(!document.querySelector('.tk-stage-on') && document.querySelectorAll('.lab-backstage').length === stages0, 'the card and the takes\' stages are gone', document.querySelectorAll('.lab-backstage').length);
  ok(LabTxn.history().at(-1)?.who === 'You', 'it is one undo step', LabTxn.history().at(-1));
  const u = await say('/undo-edit', claude.id);
  await wait(800);
  ok(await sigOf(sid) === sig0 && codes(sid) === code0, 'one Undo restores the scene exactly', u);

  // ---------- 4. Stop, then discard ----------
  ok(await ask('crew-slow try a calmer look'), 'a second ask opens the card');
  const T2 = LabTakes.current();
  card().querySelector('.tk-go').click();
  ok(await until(() => T2.crew.helpers.every((h) => h.calls >= 1), 60000), 'the slow takes are under way');
  const t0 = Date.now();
  card().querySelector('.tk-stop').click();
  await until(() => T2.status === 'stopped' && T2.crew.status === 'stopped', 30000);
  out.info.stopMs = Date.now() - t0;
  ok(T2.crew.status === 'stopped' && T2.crew.helpers.every((h) => !['running', 'waiting'].includes(h.status)), 'Stop stops every take', T2.crew.helpers.map((h) => h.status));
  ok(await sigOf(sid) === sig0, 'the scene untouched after Stop');
  card().querySelector('.tk-x').click();
  await wait(600);
  ok(!card() && LabTakes.last()?.status === 'discarded' && !document.querySelector('.tk-stage-on') && document.querySelectorAll('.lab-backstage').length === stages0, 'discarding closes the card and frees the stages');
  ok(await sigOf(sid) === sig0 && codes(sid) === code0, 'discarding leaves the scene untouched');

  // ---------- 5. Mix (pure plan) ----------
  const X = (c, s) => `const P = tweak({ glow: { value: '${c}', label: 'Glow color' }, spin: [${s}, -2, 2] });\nconsole.log(P.glow, P.spin);`;
  const base = [{ id: 'a', code: X('#ff0000', 0.4) }];
  const takes = [[{ id: 'a', code: X('#00ff00', 0.4) }], [{ id: 'a', code: X('#ff0000', 1.2) }], [{ id: 'a', code: 'rewritten()' }]];
  const plan = TakesCore.mixPlan(base, takes, { scan: ThreeTweaks.scan });
  const mixed = TakesCore.mixLayers(base, takes, 0, 1, { scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues });
  const vals = Object.fromEntries(ThreeTweaks.scan(mixed?.[0]?.code || '').items.map((it) => [it.key, it.orig]));
  ok(plan.length === 1 && plan[0].a === 0 && plan[0].b === 1 && vals.glow === '#00ff00' && vals.spin === 1.2, 'Mix: take A\'s colours with take B\'s motion (slider-only takes)', { plan, vals });
  out.info.errors = HubBridge.log().filter((x) => x.error).map((x) => `${x.tool}: ${String(x.error).slice(0, 120)}`).slice(-6);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
