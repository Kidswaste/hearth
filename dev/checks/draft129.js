// (round 129, draft129) ✦ Build a first draft from the project brief, by clicks on the plan card (docs/upgrades/draft129.md),
// with the fake engines making real MCP calls (dev/fake-common.js draftPlan: a "Draft N" layer per step in the palette's
// colors, its opacity keyed, the step ticked with three_do brief {done: N}, one three_screenshot at the end):
//   1. nothing runs without the click: a project, an owner's layer, a brief prepared (fake engine), the card shown with
//      its cost line (tokens · Claude): no message is sent, the scene and the ticks stay as they were
//   2. ✦ Build a first draft (Claude, all 4 steps): the steps' layers in the palette, every step ticked, the owner's layer
//      untouched, the reply ends with a screenshot; ↶ Undo the draft: the scene exactly as before (LabTxn's signature),
//      the ticks back
//   3. "up to step 3" with a slow director, Stop after the first step lands: "Building step 2 of 3…" seen, what landed
//      stays (and is ticked), the rest isn't built; ↶ Undo the draft puts it back exactly
//   4. Astra directs another project: up to step 1, built and ticked, one Undo
// Only the check's own temp data folder (smoke.js); no owner data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/draft129.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 300)})`); return Boolean(c); };
const S = () => ThreeLab.scenes;
const names = (sid) => S().layersOf(S().get(sid)).map((L) => L.name);
const sigOf = async (sid) => LabTxn._test.sigOf(await LabTxn.snap(sid));
const card = (pid) => [...document.querySelectorAll(`.pb-card[data-pid="${CSS.escape(pid)}"]`)].find((n) => n.checkVisibility?.() ?? n.getClientRects().length > 0);
const btn = (pid, re) => [...(card(pid)?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
const OWNER = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: '#336699', wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1500; renderer.render(scene, camera); });`;
const MOOD = { name: 'Dusk', items: [{ id: 'sw1', type: 'swatch', colors: ['#ff3cac', '#2bd2ff', '#ffd75e', '#7cff6b'] }, { id: 'n1', type: 'note', text: 'warm neon over dark water' }] };

// a project with its chat (agent), scene (with an owner's layer) and a brief from the fake engine
async function project(name, agent) {
  const p = await ProjectWorkspace.create({ name, agentId: agent.id, plugins: [] });
  await until(() => ProjectWorkspace.current()?.id === p.id && ProjectWorkspace.state().phase === 'ready', 40000);
  await Lazy.load('lab'); await Lazy.load('projectbrief');
  const sid = p.workspace.sceneId;
  const sk = S().get(sid);
  if (S().currentId() === sid && ThreeLab.director?.addLayer) await ThreeLab.director.addLayer({ name: 'Owner glow', code: OWNER }, 0.3);
  else { sk.layers = [...S().layersOf(sk), ThreeLayers.defaults({ name: 'Owner glow', code: OWNER })]; S().changed(sid); }
  await wait(400);
  const b = await ProjectBrief.prepare(p.id, { moodboard: MOOD, notes: `${name}: a short dusk loop`, refs: false, song: false, quiet: true });
  await ProjectBrief.open(p.id);
  await until(() => card(p.id), 10000);
  return { p, sid, b, chatId: p.workspace.chatId };
}
const chatLen = async (id) => (await Native.load(id))?.messages?.length || 0;
async function click(pid, re) { const b = await until(() => { const x = btn(pid, re); return x && !x.disabled ? x : null; }, 10000); if (b) b.click(); return Boolean(b); }

try {
  await Lazy.load('projects'); await Projects.ready();
  const claude = H.claudeAgent();
  // ---------- 1. nothing without the click ----------
  const A = await project('Draft Tide', claude);
  const pid = A.p.id;
  ok(A.b?.steps?.length === 4 && A.b.palette.includes('#ff3cac'), 'a brief from the fake engine with 4 steps and the moodboard\'s palette', A.b);
  ok(ChatScenes.linkOf(A.chatId) === A.sid, 'the project\'s chat works on its scene', [ChatScenes.linkOf(A.chatId), A.sid]);
  const sig0 = await sigOf(A.sid); const n0 = names(A.sid); const msgs0 = await chatLen(A.chatId);
  const cost = await until(() => { const t = card(pid)?.querySelector('.pb-cost')?.textContent || ''; return /tokens/.test(t) ? t : null; }, 15000);
  ok(cost && /About \d+(\.\d)?[kM]? tokens in .* out · Claude/.test(cost), 'before running, one line with the estimated tokens and the AI / model', cost);
  ok(btn(pid, /✦ Build a first draft/) && card(pid).querySelector('select.pb-upto'), 'the card has ✦ Build a first draft and "up to step N"');
  await wait(2500);
  ok(await chatLen(A.chatId) === msgs0 && !BriefDraft.state(pid) && await sigOf(A.sid) === sig0 && !(ProjectBrief.get(pid).done || []).length, 'nothing runs without the click: no message, the scene and the ticks as they were', { msgs: await chatLen(A.chatId), msgs0 });

  // ---------- 2. Claude builds all 4 steps; one Undo ----------
  const seen = new Set();
  const spy = setInterval(() => { const t = card(pid)?.querySelector('.pb-draft-now')?.textContent; if (t) seen.add(t); }, 50);
  ok(await click(pid, /✦ Build a first draft/), 'click ✦ Build a first draft');
  await until(() => ['done', 'stopped', 'error'].includes(BriefDraft.state(pid)?.status) && BriefDraft.state(pid)?.landed, 120000);
  await wait(400); clearInterval(spy);
  const st = BriefDraft.state(pid);
  const after = names(A.sid);
  out.info.run1 = { st: st && { status: st.status, landed: st.landed }, after, seen: [...seen] };
  ok(st?.status === 'done', 'the draft run ends', st?.status);
  ok(['Draft 1', 'Draft 2', 'Draft 3', 'Draft 4'].every((n) => after.includes(n)), 'the steps\' layers are built', after);
  const codes = S().layersOf(S().get(A.sid)).filter((L) => /^Draft /.test(L.name)).map((L) => (L.code.match(/value: '(#[0-9a-f]{6})'/) || [])[1]);
  ok(codes.length === 4 && codes.every((c) => A.b.palette.includes(c)), 'in the palette\'s colors', codes);
  ok(JSON.stringify(ProjectBrief.get(pid).done) === '[0,1,2,3]' && st.landed.length === 4, 'every step is ticked on the card as it lands', ProjectBrief.get(pid).done);
  ok([...seen].some((t) => /Building step \d of 4…/.test(t)), 'the card showed "Building step N of 4…"', [...seen]);
  ok(n0.every((n) => after.includes(n)) && !st.touched.length, 'the owner\'s layer is untouched', st.touched);
  const reply = (await Native.load(A.chatId)).messages.at(-1)?.text || '';
  ok(/three_screenshot/.test(reply) && /Draft · build steps 1–4/.test((await Native.load(A.chatId)).messages.at(-2)?.text || ''), 'one director run (one message) ending with a screenshot check', reply.slice(-300));
  ok(/Draft built/.test(card(pid)?.textContent || '') && btn(pid, /↶ Undo the draft/), 'the card says it\'s built and offers ↶ Undo the draft');
  ok(await click(pid, /↶ Undo the draft/), 'click ↶ Undo the draft');
  await until(async () => BriefDraft.state(pid)?.status === 'undone', 15000);
  await wait(500);
  ok(await sigOf(A.sid) === sig0 && JSON.stringify(names(A.sid)) === JSON.stringify(n0), 'one Undo restores the scene exactly', names(A.sid));
  ok(!(ProjectBrief.get(pid).done || []).length, '…and the ticks go back', ProjectBrief.get(pid).done);

  // ---------- 3. up to step 3, slow; Stop after the first lands ----------
  const e = ProjectBrief._.entry(pid);
  ProjectBrief._.set(pid, { brief: { ...e.brief, steps: e.brief.steps.map((s) => `${s} (draft-slow)`) } });
  await wait(300);
  const pick = await until(() => card(pid)?.querySelector('select.pb-upto'));
  pick.value = '3'; pick.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(400);
  const seen3 = new Set();
  const spy3 = setInterval(() => { const t = card(pid)?.querySelector('.pb-draft-now')?.textContent; if (t) seen3.add(t); }, 50);
  ok(await click(pid, /✦ Build a first draft/), 'up to step 3: click ✦ Build a first draft');
  ok(await until(() => BriefDraft.state(pid)?.landed.length >= 1, 60000), 'the first step lands');
  // (round 132) wait for step 1's tick (the card moves on to step 2), not only its layer: since Scene versions saves a
  // version before the draft, the start is a little later and the layer can show before the tick
  await until(() => /Building step 2 of 3…/.test(card(pid)?.querySelector('.pb-draft-now')?.textContent || ''), 15000);
  ok(await click(pid, /^Stop$/), 'click Stop');
  await until(() => BriefDraft.state(pid)?.status === 'stopped', 30000);
  await wait(800); clearInterval(spy3);
  const s3 = BriefDraft.state(pid); const a3 = names(A.sid);
  out.info.run3 = { status: s3?.status, landed: s3?.landed, layers: a3, seen: [...seen3] };
  ok(s3?.status === 'stopped' && !Native.isBusy(A.chatId), 'Stop ends the run cleanly', s3?.status);
  ok([...seen3].some((t) => /Building step 2 of 3…/.test(t)), 'the card showed "Building step 2 of 3…" with Stop', [...seen3]);
  const built = a3.filter((n) => /^Draft /.test(n));
  ok(built.includes('Draft 1') && built.length === s3.landed.length && built.length < 3 && !built.includes('Draft 4'), 'what landed is kept, nothing past the stop or past step 3', built);
  ok(s3.landed.every((k) => ProjectBrief.get(pid).done.includes(k)), 'what landed is ticked', ProjectBrief.get(pid).done);
  ok(/Stopped: \d of 3 steps landed/.test(card(pid)?.textContent || ''), 'the card says where it stopped');
  ok(await click(pid, /↶ Undo the draft/), 'click ↶ Undo the draft after Stop');
  await until(() => BriefDraft.state(pid)?.status === 'undone', 15000);
  await wait(500);
  ok(await sigOf(A.sid) === sig0, 'Undo after Stop restores the scene exactly', names(A.sid));

  // ---------- (next129's call) ProjectBrief.seed: a template's brief, stored without the AI ----------
  const sd = await ProjectBrief.seed(pid, { look: 'Template look: chrome rings', steps: ['Add chrome rings', 'Key them to the drop'], palette: ['#123456'] });
  await until(() => /Template look: chrome rings/.test(card(pid)?.textContent || ''), 5000);
  ok(sd?.by === 'template' && sd.steps.length === 2 && !sd.done.length && sd.palette[0] === '#123456' && !ProjectBrief.stale(pid) && /Template look/.test(card(pid)?.textContent || '') && /PROJECT BRIEF/.test(ProjectBrief._.entry(pid).compact), 'ProjectBrief.seed stores a template brief (by template, no step done, not stale, on the card)', sd);

  // ---------- 4. Astra directs ----------
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  if (ok(astra, 'Astra is there')) {
    const X = await project('Astra Draft', astra);
    const sx = await sigOf(X.sid);
    const px = await until(() => card(X.p.id)?.querySelector('select.pb-upto'));
    px.value = '1'; px.dispatchEvent(new Event('change', { bubbles: true }));
    const line = await until(() => { const t = card(X.p.id)?.querySelector('.pb-cost')?.textContent || ''; return /tokens/.test(t) ? t : null; }, 15000);
    ok(/· Astra/.test(line || ''), 'Astra\'s cost line names Astra', line);
    ok(await click(X.p.id, /✦ Build a first draft/), 'Astra: click ✦ Build a first draft (up to step 1)');
    await until(() => ['done', 'stopped', 'error'].includes(BriefDraft.state(X.p.id)?.status), 120000);
    await wait(400);
    const sx2 = BriefDraft.state(X.p.id);
    out.info.astra = { status: sx2?.status, landed: sx2?.landed, layers: names(X.sid) };
    ok(sx2?.status === 'done' && names(X.sid).includes('Draft 1') && !names(X.sid).includes('Draft 2') && JSON.stringify(ProjectBrief.get(X.p.id).done) === '[0]', 'Astra builds step 1 and ticks it', out.info.astra);
    ok(await click(X.p.id, /↶ Undo the draft/), 'Astra: click ↶ Undo the draft');
    await until(() => BriefDraft.state(X.p.id)?.status === 'undone', 15000);
    await wait(500);
    ok(await sigOf(X.sid) === sx, 'Astra\'s draft: one Undo restores the scene exactly', names(X.sid));
  }
  out.info.errors = HubBridge.log().filter((x) => x.error).map((x) => `${x.tool}: ${String(x.error).slice(0, 120)}`).slice(-6);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
