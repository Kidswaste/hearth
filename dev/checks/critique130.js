// (round 130, critique130) ✦ Critique this, by clicks in the director's dock, with the fake engines answering the one
// AI pass (dev/fake-common.js: 4 improvements, the first a slider fix from the outline, titles said before skipped):
//   1. nothing is sent without the click: ✦ Critique (and /critique alone) shows the card with the estimated cost, no AI call
//   2. ✦ Critique it: ONE AI pass with ONE picture (the contact sheet), 3 chips
//   3. a slider Apply lands here and is ONE undo step (the dock's ↶ puts the scene back exactly: LabTxn's signature)
//   4. a message Apply sends the fix to the director as the owner's message
//   5. ✕ hides a chip
//   6. the history: the next critique doesn't repeat the first one's advice; the last critiques are kept with their states
//   7. Astra: the same pass on the Astra agent, its cost line names Astra, 3 chips
// Only the check's own temp data folder (smoke.js); no owner data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/critique130.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 300)})`); return Boolean(c); };
const sigOf = async (sid) => LabTxn._test.sigOf(await LabTxn.snap(sid));
const card = () => document.querySelector('.crit-card');
const chips = () => [...(card()?.querySelectorAll('.crit-chip') || [])];
const chipBtn = (i, re) => [...(card()?.querySelector(`.crit-chip[data-i="${i}"]`)?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
const costText = () => until(() => { const t = card()?.querySelector('.crit-cost')?.textContent || ''; return /tokens/.test(t) ? t : null; }, 20000);
const CODE = `import * as THREE from 'three';
const P = tweak({ glow: [0.4, 0, 1], speed: [1, 0, 2] });
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 16, 64), new THREE.MeshBasicMaterial({ color: '#2bd2ff', transparent: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.material.opacity = P.glow; mesh.rotation.y = (now / 1500) * P.speed; renderer.render(scene, camera); });`;
async function critique() {
  const n0 = asks.length;
  const b = await until(() => { const x = card()?.querySelector('.crit-run'); return x && !x.disabled ? x : null; }, 15000);
  b?.click();
  await until(() => ['done', 'error'].includes(LabCritique.state().phase) && asks.length > n0, 120000);
  await wait(200);
  return LabCritique.state();
}
// what went to the AI: LabCritique's own log of its sends (window.hub can't be wrapped)
const asks = { get length() { return LabCritique.state().sent.length; }, at: (i) => LabCritique.state().sent.at(i), map: (f) => LabCritique.state().sent.map(f) };
const asks0 = () => LabCritique.state().sent[0];

try {
  // ---------- a docked director (Claude) and a scene with a slider ----------
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  const strip = await until(() => H.surfaces.get('tool:three')?.el.querySelector('.dd-strip'), 30000);
  ok(strip, 'the docked director\'s strip');
  const d = ThreeLab.director;
  await d.newSketch('Critique probe', CODE);
  await wait(1500);
  const sid = ThreeLab.scenes.currentId();

  // ---------- 1. nothing without the click ----------
  const cbtn = strip?.querySelector('.dd-crit');
  ok(cbtn && !cbtn.hidden && /Critique/.test(cbtn.textContent), 'the dock has ✦ Critique');
  cbtn?.click();
  const cost = await costText();
  out.info.cost = cost;
  ok(cost && /About [\d.]+k? tokens in \(1 picture of 4 frames\) and [\d.]+k? out · Claude/.test(cost), 'the card shows the estimated cost first (tokens · Claude)', cost);
  await wait(2000);
  ok(asks.length === 0 && LabCritique.state().runs === 0 && !LabCritique.state().sheet && LabCritique.state().phase === 'ready', 'nothing is sent without the click (no AI call, no picture even taken)', { asks: asks.length, st: LabCritique.state().phase });
  LabCritique.close();
  await Commands.tryRun('/critique', agent.id);
  ok(await until(() => card()?.querySelector('.crit-run'), 10000), '/critique alone opens the same card in a director\'s chat');
  await wait(800);
  ok(asks.length === 0, '/critique sends nothing either', asks.length);

  // ---------- 2. one AI pass, one picture, 3 chips ----------
  const st1 = await critique();
  out.info.first = st1.items.map((it) => [it.title, it.fix.kind]);
  out.info.run1 = { key: st1.key, sheetError: st1.sheetError, scene: ThreeLab.scenes.currentId(), sid };
  ok(st1.phase === 'done', 'the critique comes back', st1.error);
  ok(asks.length === 1 && asks0().images?.length === 1 && /^Critique this Lab scene/.test(asks0().text) && asks0().options?.lean, 'one lean AI pass with one picture (the contact sheet)', asks.map((q) => [q.images?.length, q.text.slice(0, 40)]));
  ok(/"Critique probe"/.test(asks0().text) && /glow 0\.4 \(0–1\)/.test(asks0().text), 'it reads the scene\'s outline with the slider values', asks0().text.slice(0, 300));
  ok(chips().length === 3 && st1.items.length === 3, 'exactly 3 chips', chips().length);
  ok(st1.items[0].fix.kind === 'slider' && st1.items[0].fix.set.glow === 0.8, 'the first is a plain slider change: glow 0.4 → 0.8', st1.items[0]);
  ok(/pictures seen: 1/.test(st1.items[1].why), 'the AI got the picture', st1.items[1].why);

  // ---------- 3. a slider Apply is one undo ----------
  const sig0 = await sigOf(sid);
  chipBtn(0, /^Apply$/)?.click();
  await until(() => LabCritique.state().items[0].state === 'applied', 10000);
  const glow = d.sliders(st1.items[0].fix.layer).sliders.find((s) => s.key === 'glow')?.value;
  ok(glow === 0.8 && await sigOf(sid) !== sig0, 'Apply moves the slider here', glow);
  ok(asks.length === 1, 'a slider Apply sends nothing to the AI');
  await DirectorDock.undoEdit();
  ok(await until(async () => (await sigOf(sid)) === sig0, 8000), 'one Undo (the dock\'s ↶) puts the scene back exactly');
  ok(d.sliders(st1.items[0].fix.layer).sliders.find((s) => s.key === 'glow')?.value === 0.4, 'glow is 0.4 again');

  // ---------- 4. a message Apply goes to the director ----------
  const chatId = H.activeChat[agent.id];
  chipBtn(1, /^Apply$/)?.click();
  const sent = await until(async () => {
    const c = await Native.load(H.activeChat[agent.id]);
    return (c?.messages || []).filter((m) => m.role === 'user').map((m) => m.text).find((t) => t.includes(st1.items[1].title.slice(0, 30)));
  }, 15000);
  out.info.sent = sent?.slice(0, 160);
  ok(sent && LabCritique.state().items[1].state === 'sent', 'a message Apply sends the fix to the director as the owner\'s message', { chatId, sent });
  await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);

  // ---------- 5. ✕ hides a chip ----------
  chipBtn(2, /^✕$/)?.click();
  await wait(200);
  ok(chips().length === 2 && !card().querySelector('.crit-chip[data-i="2"]') && LabCritique.state().items[2].state === 'dismissed', '✕ hides that chip', chips().length);

  // ---------- 6. the history: no repeats ----------
  cbtn.click();
  await costText();
  const st2 = await critique();
  out.info.second = st2.items.map((it) => it.title);
  out.info.run2 = { key: st2.key, scene: ThreeLab.scenes.currentId(), sid };
  const first = st1.items.map((it) => it.title);
  ok(st2.phase === 'done' && st2.items.length === 3 && st2.items.every((it) => !first.includes(it.title) && !it.again), 'the next critique doesn\'t repeat the first one\'s advice', { first, second: out.info.second });
  ok(/Earlier critiques/.test(asks.at(-1).text) && first.every((t) => asks.at(-1).text.includes(t.slice(0, 30))), 'the AI is told the earlier advice');
  const hist = await LabCritique.history();
  const kv = await window.hub.kvGet('three-critiques', null);
  out.info.hist = hist.map((r) => r.items.map((it) => it.state));
  ok(hist.length === 2 && JSON.stringify(hist[0].items.map((it) => it.state)) === '["applied","sent","dismissed"]' && (kv?.list || []).reduce((n, e) => n + e.list.length, 0) === 2, 'the history keeps both critiques with what was done', out.info.hist);

  // ---------- 7. Astra ----------
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  if (ok(astra, 'Astra is there')) {
    await LabCritique.open(astra.id);
    const line = await costText();
    ok(/· Astra/.test(line || ''), 'Astra\'s cost line names Astra', line);
    const st3 = await critique();
    ok(st3.phase === 'done' && st3.items.length === 3 && chips().length === 3, 'Astra: 3 chips', st3.error ? [st3.error, st3.raw] : st3.items.length);
    ok(asks.at(-1).agentId === astra.id && asks.at(-1).images?.length === 1, 'Astra got the one picture');
  }
  out.info.errors = HubBridge.log().filter((x) => x.error).map((x) => `${x.tool}: ${String(x.error).slice(0, 120)}`).slice(-6);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
