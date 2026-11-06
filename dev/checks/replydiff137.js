// (round 137, replydiff137) "What did the AI change?" under a director reply (tools/three-replydiff*.js,
// docs/upgrades/replydiff137.md), with the fake engine making real Lab MCP calls, on the check's own temp data:
//   1. one Claude reply changes 3 layers (a slider on Glow ring, a new layer Bass particles, a code edit on the main
//      layer): the reply has a folded "Changed 3 layers · Review" line
//   2. opened: a row per layer in plain words; the code change folded with + / − lines
//   3. ↶ Undo this layer (Glow ring): only that layer goes back exactly, the others stay as the reply left them; it is
//      one undo step (one /undo-edit puts the reply's state back exactly)
//   4. ↶ Undo all: the scene is exactly as before the reply (after a layer was already undone too)
//   5. an Astra reply that only moves sliders: Keep some… with a tick per slider; the unticked one goes back, the ticked
//      one stays, one undo step
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 600000 --script dev/checks/replydiff137.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 400)})`); return Boolean(c); };
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };
const J = (x) => JSON.stringify(x ?? null);
const CODE = `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.3, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#7a5cff', wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
const canvasLayer = (tag, color) => `// ${tag}
const P = tweak({ amt: { value: 0.6, min: 0, max: 1, label: 'Amount' } });
const c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight; c.style.cssText = 'position:fixed;inset:0';
document.body.append(c); const g = c.getContext('2d');
(function f() { g.clearRect(0, 0, c.width, c.height); g.strokeStyle = 'rgba(${color},' + P.amt + ')'; g.lineWidth = 8; g.beginPath(); g.arc(c.width / 2, c.height / 2, 80, 0, 7); g.stroke(); requestAnimationFrame(f); })();`;

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director && window.ThreeHistory);
  await wait(800);
  const D = ThreeLab.director;
  const turn = async (agentId, text) => { await Native.send(agentId, text); await wait(300); await until(() => !Native.isBusy(H.activeChat[agentId]), 90000); await wait(1200); };
  Native.newChat(agent.id);
  await wait(600);
  // the scene: a main layer and a Glow ring (set up by a first reply)
  await turn(agent.id, `mcp: ${JSON.stringify([['three_set_code', { code: CODE, wait: 1 }]])}`);
  const chatId = H.activeChat[agent.id];
  const sid = ChatScenes.linkOf(chatId) || ThreeLab.scenes.currentId();
  for (const L of D.layers().layers.slice()) if (L.name !== D.codeOf().name && D.layers().layers.length > 1) await D.removeLayer(L.name);
  const main = D.codeOf().name;
  await turn(agent.id, `mcp: ${JSON.stringify([['three_add_layer', { name: 'Glow ring', code: canvasLayer('glow ring', '255,215,94'), wait: 0.5 }]])}`);
  await until(() => typeof ReplyDiff !== 'undefined', 15000);
  ok(typeof ReplyDiff !== 'undefined' && typeof ReplyDiffCore !== 'undefined', 'the replydiff group loads');

  // ---------- 1. one reply changes 3 layers: the folded line ----------
  await turn(agent.id, `mcp: ${JSON.stringify([
    ['three_sliders', { layer: 'Glow ring', set: { amt: 0.9 } }],
    ['three_add_layer', { name: 'Bass particles', code: canvasLayer('bass particles', '94,180,255'), wait: 0.5 }],
    ['three_edit_code', { layer: main, edits: [{ find: 'scene.add(mesh);', replace: 'scene.add(mesh);\nmesh.position.y = 0.2;\nmesh.rotation.x = 0.4;' }], wait: 0.5 }],
  ])}`);
  const msgs = Native.chatOf(agent.id).messages;
  const m = msgs.at(-1); const idx = msgs.length - 1;
  ok(/MCP calls/.test(m?.text || '') && !/ERROR/.test(m?.text || ''), 'the reply ran its tool calls', (m?.text || '').slice(-300));
  ok(m?.labDiff?.id && m.labDiff.layers === 3, 'the reply knows it changed 3 layers (labDiff)', m?.labDiff);
  const rid = m?.labDiff?.id;
  const node = () => [...Native.view(agent.id).list.querySelectorAll('.msg.assistant')].find((n) => Number(n.dataset.index) === idx);
  const fold = await until(() => node()?.querySelector(`.rd-fold[data-rd="${rid}"]`), 8000);
  ok(fold && /^Changed 3 layers · Review$/.test(fold.querySelector('summary').textContent.trim()), 'the reply has the line "Changed 3 layers · Review"', fold?.textContent);
  ok(fold && !fold.open && !fold.querySelector('.rd-row'), 'folded by default (nothing built until opened)');

  // ---------- 2. opened: plain-words rows, the code change folded ----------
  fold.open = true;
  const f = () => node()?.querySelector(`.rd-fold[data-rd="${rid}"]`);
  await until(() => f()?.querySelectorAll('.rd-row').length === 3, 10000);
  const rec = await ReplyDiff.record(rid);
  const sc = rec?.scenes?.[0];
  ok(sc && sc.sceneId === sid && rec.who === 'Claude', 'the reply\'s before / after are kept (LabTxn)', rec && { who: rec.who, n: rec.scenes.length });
  const idOf = (name) => sc.after.layers.find((L) => L.name === name)?.id;
  const glow = idOf('Glow ring'); const bass = idOf('Bass particles'); const mainId = idOf(main);
  const rowOf = (id) => f()?.querySelector(`.rd-row[data-layer="${id}"]`);
  const words = (id) => rowOf(id)?.querySelector('.rd-words')?.textContent || '';
  out.info.rows = [...(f()?.querySelectorAll('.rd-words') || [])].map((x) => x.textContent);
  ok(/^Glow ring: amount 0\.6 → 0\.9$/.test(words(glow)), 'slider row in plain words', words(glow));
  ok(/^New layer: Bass particles$/.test(words(bass)), 'new layer row in plain words', words(bass));
  ok(new RegExp(`^${main}: code: \\d+ lines? changed$`).test(words(mainId)), 'code row in plain words', words(mainId));
  ok(/Keep all/.test(f().querySelector('.rd-head').textContent) && f().querySelector('.rd-undo-all'), 'Keep all and ↶ Undo all at the top');
  ok(!f().querySelector('.rd-some'), 'no Keep some on a reply that did more than sliders');
  const code = rowOf(mainId)?.querySelector('.rd-code');
  ok(code && !code.open, 'the code change is folded ("Show the code change")', code?.textContent);
  if (code) code.open = true;
  await wait(100);
  ok(code?.querySelectorAll('.rd-add').length === 2 && /mesh\.rotation\.x = 0\.4/.test(code.textContent), 'the code change shows the added lines', code?.textContent?.slice(0, 300));
  out.info.pics = Boolean(await until(() => f()?.querySelector('.rd-pics:not([hidden]) img'), 6000));

  // ---------- 3. ↶ Undo this layer (Glow ring): only it goes back, one undo step ----------
  const sigOf = LabTxn._test.sigOf;
  const n0 = LabTxn.history().length;
  ok(sigOf(await LabTxn.snap(sid)) === sigOf(sc.after), 'the scene is as the reply left it');
  rowOf(glow).querySelector('.rd-undo').click();
  await until(() => LabTxn.history().length > n0 || LabTxn.history().at(-1)?.words?.[0]?.includes('took back'), 10000);
  await wait(500);
  const cur = await LabTxn.snap(sid);
  const L = (s, id) => s.layers.find((x) => x.id === id);
  ok(J(L(cur, glow)) === J(L(sc.before, glow)) && J(cur.vals[glow]) === J(sc.before.vals[glow]), 'Glow ring is back exactly as before the reply', { now: cur.vals[glow], was: sc.before.vals[glow] });
  ok(J(L(cur, bass)) === J(L(sc.after, bass)) && J(L(cur, mainId)) === J(L(sc.after, mainId)) && J(cur.vals[mainId]) === J(sc.after.vals[mainId]), 'the other two layers stay as the reply left them');
  ok(cur.layers.map((x) => x.id).join() === sc.after.layers.map((x) => x.id).join(), 'no layer added or lost');
  ok(LabTxn.history().length === Math.min(n0 + 1, 12) && /Glow ring/.test(LabTxn.history().at(-1)?.words?.[0] || ''), 'it is one undo step', LabTxn.history().at(-1));
  await until(() => rowOf(glow)?.classList.contains('rd-gone'), 4000);
  ok(rowOf(glow)?.classList.contains('rd-gone') && !rowOf(bass).classList.contains('rd-gone'), 'the review marks that row undone, the others not');
  await say('/undo-edit', agent.id);
  await until(async () => sigOf(await LabTxn.snap(sid)) === sigOf(sc.after), 8000);
  ok(sigOf(await LabTxn.snap(sid)) === sigOf(sc.after), 'one Undo puts the layer\'s change back exactly');

  // ---------- 4. ↶ Undo all (after one layer was undone): exactly the scene before the reply ----------
  ReplyDiff.fold(rid).open = false; ReplyDiff.fold(rid).open = true;
  await until(() => rowOf(bass) && !rowOf(glow)?.classList.contains('rd-gone'), 6000);
  ok(!rowOf(glow)?.classList.contains('rd-gone'), 'put back with ↶: the row shows as a change again');
  await ReplyDiff.undoLayer(rid, bass);
  const sBass = sigOf(await LabTxn.snap(sid));
  ok(!(await LabTxn.snap(sid)).layers.some((x) => x.id === bass), 'Undo this layer on a new layer takes it out');
  await until(() => f()?.querySelector('.rd-undo-all'), 4000);
  f().querySelector('.rd-undo-all').click();
  await until(() => /took back what Claude did/.test(LabTxn.history().at(-1)?.words?.[0] || ''), 10000);
  ok(sigOf(await LabTxn.snap(sid)) === sigOf(sc.before), 'Undo all: the scene is exactly as before the reply');
  ok(D.layers().layers.every((x) => x.name !== 'Bass particles') && !/rotation\.x = 0\.4/.test(D.codeOf(main).code), 'the new layer is gone and the code edit undone');
  // and the plain reply undo (nothing else since): Undo all is the reply's own undo step
  out.info.undo1 = await say('/undo-edit', agent.id);
  ok(await until(async () => sigOf(await LabTxn.snap(sid)) === sBass, 8000), 'one Undo takes back Undo all exactly', out.info.undo1);
  out.info.undo2 = await say('/undo-edit', agent.id);
  await until(async () => sigOf(await LabTxn.snap(sid)) === sigOf(sc.after), 8000);
  ok(sigOf(await LabTxn.snap(sid)) === sigOf(sc.after), 'two Undos bring the whole reply back', { h: LabTxn.history().map((e) => e.words[0]), u: out.info.undo2 });
  await ReplyDiff.undoAll(rid);
  await until(async () => sigOf(await LabTxn.snap(sid)) === sigOf(sc.before), 8000);
  ok(sigOf(await LabTxn.snap(sid)) === sigOf(sc.before), 'Undo all as the reply\'s own undo: exactly as before');

  // ---------- 5. an Astra reply that only moves sliders: Keep some ----------
  H.config.agents.push({ id: 'rdastra', name: 'Astra Director', mode: 'native', engine: 'codex', threeTools: true, hubTools: true, enabled: true });
  await saveConfig();
  await wait(600);
  Native.newChat('rdastra');
  await wait(600);
  const aChat = H.activeChat.rdastra;
  if (ChatScenes.link) { try { await ChatScenes.link(aChat, sid, { rename: false }); } catch { /* the scene on screen anyway */ } }
  await turn('rdastra', `mcp: ${JSON.stringify([['three_sliders', { layer: main, set: { spin: 1.2, size: 2 } }]])}`);
  const am = Native.chatOf('rdastra').messages.at(-1);
  ok(am?.labDiff?.id && am.labDiff.layers === 1, 'the Astra reply has its review line too', { labDiff: am?.labDiff, text: (am?.text || '').slice(-200) });
  const arec = am?.labDiff ? await ReplyDiff.record(am.labDiff.id) : null;
  const asc = arec?.scenes?.[0];
  ok(arec?.who === 'Astra', 'it says Astra', arec?.who);
  activate('rdastra'); await wait(500);
  const aIdx = Native.chatOf('rdastra').messages.length - 1;
  const aNode = () => [...(Native.view('rdastra')?.list?.querySelectorAll('.msg.assistant') || [])].find((n) => Number(n.dataset.index) === aIdx);
  const af = await until(() => aNode()?.querySelector('.rd-fold'), 8000);
  ok(af && /^Changed 1 layer · Review$/.test(af.querySelector('summary').textContent.trim()), 'the line says "Changed 1 layer"', af?.textContent);
  if (af) af.open = true;
  const some = await until(() => aNode()?.querySelector('.rd-fold .rd-some'), 10000);
  ok(some, 'a slider-only reply offers Keep some…');
  if (some) some.open = true;
  const ticks = [...(some?.querySelectorAll('input[type=checkbox]') || [])];
  out.info.ticks = ticks.map((t) => t.parentElement.textContent);
  ok(ticks.length === 2 && ticks.every((t) => t.checked), 'a tick per slider, all kept to start with', out.info.ticks);
  const msid = asc?.sceneId || sid;
  const before5 = await LabTxn.snap(msid);
  const n5 = LabTxn.history().length;
  const sizeTick = ticks.find((t) => t.dataset.key === 'size');
  if (sizeTick) sizeTick.checked = false;
  some?.querySelector('.rd-apply')?.click();
  await until(() => LabTxn.history().length > n5 || /put back/.test(LabTxn.history().at(-1)?.words?.[0] || ''), 10000);
  await wait(500);
  const now5 = await LabTxn.snap(msid);
  const mid = asc?.after.layers.find((x) => x.name === main)?.id;
  out.info.keep = { now: now5.vals[mid], before: asc?.before.vals[mid], after: asc?.after.vals[mid] };
  ok(mid && now5.vals[mid]?.size === asc.before.vals[mid].size && now5.vals[mid]?.spin === asc.after.vals[mid].spin, 'Keep some: the unticked slider goes back, the ticked one stays', out.info.keep);
  ok(/put back 1 slider/.test(LabTxn.history().at(-1)?.words?.[0] || ''), 'one undo step', LabTxn.history().at(-1));
  await say('/undo-edit', 'rdastra');
  await until(async () => sigOf(await LabTxn.snap(msid)) === sigOf(before5), 8000);
  ok(sigOf(await LabTxn.snap(msid)) === sigOf(before5), 'one Undo puts it back exactly');
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
