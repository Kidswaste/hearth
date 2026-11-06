// (round 131, refmatch131) ✦ Make a layer like this, by clicks, with the fake engines answering the director
// (dev/fake-common.js likePlan: ONE layer named as asked, in the message's palette, with tweak() sliders; Closer / Looser
// rework that layer only):
//   1. the row on a reference: 🖼 References › the picture's card has ✦ Like this; a click opens the card over the preview
//   2. the cost first, nothing sent: the card's cost line (tokens · Claude), no message, no picture saved, the scene as it was
//   3. ✦ Make the layer: ONE director message with ONE small picture; "Like sunset" is added with its sliders, in the
//      palette read from the picture here (Kit.paletteFromImage); the picture itself isn't in the scene; the owner's layer stays
//   4. one Undo: the card's ↶ Undo puts the scene back exactly (LabTxn's signature)
//   5. Closer (the picture again) and Looser (no picture) rework the same layer; one ↶ Undo takes back only the last pass
//   6. /like sunset opens the same card (nothing sent); three_do references {action: "like"} gives the director the picture
//      and the palette as a read (no undo step); Astra's cost line names Astra
// Only the check's own temp data folder (smoke.js); no owner data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/refmatch131.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 300)})`); return Boolean(c); };
const sigOf = async (sid) => LabTxn._test.sigOf(await LabTxn.snap(sid));
const card = () => document.querySelector('.rm-card');
const cardBtn = (re) => [...(card()?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
const click = async (re, ms = 10000) => { const b = await until(() => { const x = cardBtn(re); return x && !x.disabled ? x : null; }, ms); b?.click(); return Boolean(b); };
const st = () => LabRefMatch.state();
const settled = () => until(() => ['done', 'ready', 'error'].includes(st().phase) && st().phase !== 'running', 120000, 150);
const layerOf = (sid, name) => ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).find((L) => L.name === name) || null;
const near = (a, b) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a); const y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 48; };
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
const COLS = ['#ff3cac', '#2bd2ff', '#ffd75e'];

try {
  // ---------- a docked director, a scene with the owner's layer, a picture reference ----------
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.director, 30000);
  const d = ThreeLab.director;
  await d.newSketch('Like probe', OWNER);
  await wait(1500);
  const sid = ThreeLab.scenes.currentId();
  const pic = document.createElement('canvas'); pic.width = 300; pic.height = 200;
  const g = pic.getContext('2d'); COLS.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 100, 0, 100, 200); });
  const path = await window.hub.saveAttachment('sunset.png', pic.toDataURL('image/png').split(',')[1]);
  const ref = await ThreeLab.addReference(path, { key: 'sunset' });
  ok(ref?.key === 'sunset', 'a picture reference "sunset"', ref);
  await Lazy.load('refmatch');

  // ---------- 1. the row on a reference ----------
  const refsBtn = await until(() => [...(H.surfaces.get('tool:three')?.el.querySelectorAll('button') || [])].find((b) => b.dataset.feature === 'References'), 10000);
  refsBtn?.click();
  const like = await until(() => [...document.querySelectorAll('.refs-dialog .refs-card button')].find((b) => /✦ Like this/.test(b.textContent)), 10000);
  ok(like, 'the reference\'s card in 🖼 References has ✦ Like this');
  const sig0 = await sigOf(sid);
  const chatLen = async () => { const id = H.activeChat?.[agent.id]; return id ? ((await Native.load(id).catch(() => null))?.messages?.length || 0) : 0; };
  const msgs0 = await chatLen();
  like?.click();
  ok(await until(() => card() && st().phase === 'ready', 20000), 'a click opens the card over the preview', st());

  // ---------- 2. the cost first, nothing sent ----------
  const cost = await until(() => { const t = card()?.querySelector('.rm-cost')?.textContent || ''; return /tokens/.test(t) ? t : null; }, 20000);
  out.info.cost = cost;
  ok(cost && /^About [\d.]+[kM]? tokens in \(1 picture, most re-read from the cache\) and [\d.]+k? out · Claude/.test(cost), 'the card shows the estimated cost first (tokens · Claude)', cost);
  ok(cardBtn(/✦ Make the layer/), 'the card offers ✦ Make the layer');
  await wait(2000);
  ok(st().sent.length === 0 && !st().picPath && await chatLen() === msgs0 && await sigOf(sid) === sig0, 'nothing is sent before the click: no message, no picture saved, the scene as it was', { sent: st().sent.length, pic: st().picPath });
  const pal = st().palette.picture;
  ok(COLS.every((c) => pal.some((p) => near(p, c))), 'the palette is read from the picture here (Kit.paletteFromImage)', pal);

  // ---------- 3. one pass: the layer with its sliders, in the picture's palette ----------
  ok(await click(/✦ Make the layer/), 'click ✦ Make the layer');
  await until(() => st().phase === 'running', 10000, 50);
  await settled();
  const s1 = st();
  out.info.make = { phase: s1.phase, layer: s1.layer, sliders: s1.sliders, error: s1.error, colors: s1.colors };
  ok(s1.sent.length === 1 && s1.sent[0].images.length === 1 && /^✦ Make a layer like this: "sunset"/.test(s1.sent[0].text) && s1.sent[0].agentId === agent.id, 'ONE director message with ONE small picture', s1.sent.map((q) => [q.images.length, q.text.slice(0, 60)]));
  ok(new RegExp(`^Palette: ${s1.colors.join(' ')}`, 'm').test(s1.sent[0].text) && /read from the picture/.test(s1.sent[0].text), 'the message carries the picture\'s palette', s1.sent[0].text);
  const L1 = layerOf(sid, 'Like sunset');
  ok(s1.phase === 'done' && L1 && s1.layer?.name === 'Like sunset', 'the new layer "Like sunset" is built', s1);
  ok(s1.sliders >= 5, 'with tweak() sliders for its key parameters', s1.sliders);
  ok(L1 && L1.code.includes(s1.colors[0]) && L1.code.includes(s1.colors[1]) && !/refTexture/.test(L1.code), 'in the picture\'s colors, without the picture itself', L1?.code.slice(0, 200));
  ok(ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).some((L) => L.code.includes('SphereGeometry(1, 16, 8)')), 'the owner\'s layer is untouched');
  const reply = (await Native.load(s1.chatId)).messages.at(-1)?.text || '';
  ok(/pictures seen: 1/.test(reply), 'the director got the picture with the message', reply.slice(0, 200));
  const sigMade = await sigOf(sid);

  // ---------- 4. one Undo ----------
  ok(await click(/↶ Undo/), 'click ↶ Undo');
  await until(() => st().phase === 'ready', 15000);
  await wait(400);
  ok(await sigOf(sid) === sig0 && !layerOf(sid, 'Like sunset'), 'one Undo puts the scene back exactly', ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).map((L) => L.name));

  // ---------- 5. Closer / Looser ----------
  ok(await click(/✦ Make the layer/), 'make it again');
  await until(() => st().phase === 'running', 10000, 50); await settled();
  ok(layerOf(sid, 'Like sunset') && st().phase === 'done', 'built again', st().error);
  ok(await click(/^Closer$/), 'click Closer');
  await until(() => st().phase === 'running', 10000, 50); await settled();
  const s2 = st(); const close = s2.sent.at(-1);
  const Lc = layerOf(sid, 'Like sunset');
  ok(/^✦ Closer to the picture: rework the layer "Like sunset" only/.test(close.text) && close.images.length === 1, 'Closer: one more message on that layer, with the picture again', [close.text.slice(0, 80), close.images.length]);
  ok(Lc && /size: \[0\.8,/.test(Lc.code) && ThreeLab.scenes.layersOf(ThreeLab.scenes.get(sid)).filter((L) => /^Like /.test(L.name)).length === 1, 'the same layer is reworked (no second layer)', Lc?.code.slice(0, 260));
  const sigCloser = await sigOf(sid);
  ok(await click(/^Looser$/), 'click Looser');
  await until(() => st().phase === 'running', 10000, 50); await settled();
  const loose = st().sent.at(-1);
  ok(/^✦ Looser, freer from the picture: rework the layer "Like sunset"/.test(loose.text) && loose.images.length === 0 && /size: \[1\.6,/.test(layerOf(sid, 'Like sunset')?.code || ''), 'Looser: freer, no picture sent again', [loose.text.slice(0, 80), loose.images.length]);
  ok(st().passes.length === 3, 'three passes on the card', st().passes);
  ok(await click(/↶ Undo/), 'click ↶ Undo after Looser');
  await until(() => st().passes.length === 2, 15000); await wait(400);
  ok(await sigOf(sid) === sigCloser && st().phase === 'done', 'one Undo takes back only the last pass (the Closer version is back)', st().phase);
  ok(sigMade !== sig0, '(the made scene differed)');

  // ---------- 6. /like, the tool op, Astra ----------
  LabRefMatch.close();
  const sent0 = st().sent.length;
  await Commands.tryRun('/like sunset', agent.id);
  ok(await until(() => card() && st().phase === 'ready' && st().refKey === 'sunset', 15000), '/like sunset opens the same card', st());
  await wait(800);
  ok(st().sent.length === sent0, '/like sends nothing by itself', st().sent.length);
  LabRefMatch.close();
  const sigT = await sigOf(sid); const steps0 = LabTxn.history().length;
  const r = await HubBridge.call('three_references', { action: 'like', name: 'sunset' }, { chatId: H.activeChat[agent.id] });
  out.info.tool = { ok: r?.ok, images: r?.images?.length, value: r?.value && { ...r.value, brief: String(r.value.brief || '').slice(0, 120) } };
  ok(r?.ok && r.images?.length === 1 && Array.isArray(r.value?.palette) && r.value.palette.length >= 3 && /ONE new layer/.test(r.value.brief || ''), 'three_do references like: the picture, its palette and the brief for the director', out.info.tool);
  ok(await sigOf(sid) === sigT && LabTxn.history().length === steps0, '…as a read (no change, no undo step)', LabTxn.history().length - steps0);
  ok(RefMatchCore.pickPalette({ picture: ['#111111'], project: ['#222222'], useProject: true }).colors[0] === '#222222' && RefMatchCore.pickPalette({ picture: ['#111111'], project: ['#222222'] }).colors[0] === '#111111', 'the project\'s palette wins only when ticked');
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  if (ok(astra, 'Astra is there')) {
    await LabRefMatch.open({ path, title: 'sunset', refKey: 'sunset', from: 'ref' }, { agentId: astra.id });
    const line = await until(() => (/tokens/.test(st().line || '') ? st().line : null), 15000);
    ok(/· Astra/.test(line || ''), 'Astra\'s cost line names Astra', line);
    LabRefMatch.close();
  }
  out.info.errors = HubBridge.log().filter((x) => x.error).map((x) => `${x.tool}: ${String(x.error).slice(0, 120)}`).slice(-6);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
