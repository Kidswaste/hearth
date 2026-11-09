// (round 132, versions132) 🕘 Scene versions (tools/three-versions*.js, docs/upgrades/versions132.md), by clicks, with the
// fake engine making real Lab MCP calls, on the check's own temp data (smoke.js; no owner scene):
//   1. a named version on demand (Save a version… in the list), then a (fake) AI reply that changes the scene: an
//      automatic version "Before Claude's reply" is in the list, with the state from before the reply
//   2. the list: one place (Sketch ▾ › History › 🕘 Scene versions…), each row with name, when, who and a picture
//   3. compare 2 (ticks + Compare): two live panels (each version's backstage stage over its box, running, drawing) and
//      a one-line diff ("1 slider changed, 1 layer added (Glow ring)")
//   4. Use this one: the scene becomes that version exactly, as ONE undo step (one /undo-edit puts it back exactly)
//   5. Take only…: one layer of the older version into the scene as it is, one undo step
//   6. pruning: thinning far in the future keeps the named versions, drops the old automatic ones
//   7. delete: the version leaves the list and is in the Trash (kv three-versions-trash) with its state; it comes back
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 600000 --script dev/checks/versions132.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 300)})`); return Boolean(c); };
const shown = (n) => Boolean(n && (n.checkVisibility?.() ?? n.getClientRects().length > 0));
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };
const menuClick = async (re) => { const b = await until(() => [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => shown(x) && re.test(x.querySelector('b')?.textContent || '')), 5000); b?.click(); return Boolean(b); };
const CODE = `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.3, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, tint: { value: '#7a5cff', label: 'Tint', group: 'Color' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; mesh.scale.setScalar(P.size); mesh.material.color.set(P.tint); renderer.render(scene, camera); });`;
const GLOW = `// glow ring
const P = tweak({ amt: { value: 0.6, min: 0, max: 1, label: 'Amount' } });
const c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight; c.style.cssText = 'position:fixed;inset:0';
document.body.append(c); const g = c.getContext('2d');
(function f() { g.clearRect(0, 0, c.width, c.height); g.strokeStyle = 'rgba(255,215,94,' + P.amt + ')'; g.lineWidth = 8; g.beginPath(); g.arc(c.width / 2, c.height / 2, 80, 0, 7); g.stroke(); requestAnimationFrame(f); })();`;

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director && window.ThreeHistory);
  await wait(800);
  const S = ThreeLab.scenes; const D = ThreeLab.director; const TH = ThreeHistory;
  Native.newChat(agent.id);
  await wait(600);
  await Native.send(agent.id, `mcp: ${JSON.stringify([['three_set_code', { code: CODE, wait: 1 }]])}`);
  await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);
  const chatId = H.activeChat[agent.id];
  const sid = ChatScenes.linkOf(chatId) || S.currentId();
  for (const L of D.layers().layers.slice()) if (L.name !== D.codeOf().name && D.layers().layers.length > 1) await D.removeLayer(L.name);
  const main = D.codeOf().name;
  await wait(1500); await TH.flush(sid);
  const sigNow = () => TMCore.sig(ThreeLab.tm.state(sid));
  const txSig = async () => LabTxn._test.sigOf(await LabTxn.snap(sid));

  // ---------- 2 (way in) + 1a. the list from Sketch ▾ › History; Save a version… with a name, by clicks ----------
  const hist = (await ThreeLab.search.menus()).sketch.find((x) => Array.isArray(x) && x[0] === 'History');
  const vrow = hist?.[2]?.find((x) => Array.isArray(x) && /Scene versions/.test(x[0]));
  ok(vrow && typeof vrow[2] === 'function' && hist[2].some((x) => Array.isArray(x) && /^Save a version/.test(x[0])), 'Sketch ▾ › History has 🕘 Scene versions… and Save a version…');
  vrow[2]();
  await until(() => window.LabVersions?.panel?.isConnected, 15000);
  const P = () => LabVersions.panel;
  ok(shown(P()) && P().closest('.three-preview'), 'the versions list opens over the Lab preview (one compact panel)');
  [...P().querySelectorAll('.vs-head .vs-btn')].find((b) => /Save a version/.test(b.textContent)).click();
  const input = P().querySelector('.vs-name');
  ok(shown(input), 'Save a version… shows a name box');
  input.value = 'Calm start';
  P().querySelector('.vs-save').requestSubmit();
  const named = await until(async () => (await LabVersions.list(sid)).rows.find((r) => r.kind === 'named' && r.name === 'Calm start'), 8000);
  ok(named, 'a named version on demand', (await LabVersions.list(sid)).rows);
  const calmSig = sigNow();
  ok(named && TMCore.sig(await TH.stateOf(named.id, sid)) === calmSig, 'the named version is the scene as it was');

  // ---------- 1b. a (fake) AI reply that changes the scene: an automatic version before it ----------
  await Native.send(agent.id, `mcp: ${JSON.stringify([['three_add_layer', { name: 'Glow ring', code: GLOW, wait: 0.5 }], ['three_sliders', { layer: main, set: { spin: 1.4 } }]])}`);
  await until(() => !Native.isBusy(chatId), 60000);
  await wait(1200); await TH.flush(sid);
  const aiSig = sigNow();
  ok(aiSig !== calmSig && D.layers().layers.some((L) => L.name === 'Glow ring'), 'the AI reply changed the scene (a layer, a slider)');
  const l1 = await LabVersions.list(sid);
  const auto = l1.rows.find((r) => r.kind === 'ai' && r.by === 'claude');
  ok(auto && /^Before Claude's reply/.test(auto.name), 'an automatic version before the AI reply that changed things', l1.rows.map((r) => `${r.kind}:${r.name}`));
  ok(auto && TMCore.sig(await TH.stateOf(auto.id, sid)) === calmSig, 'the automatic version holds the scene from before the reply');
  ok(!l1.unreadable, 'the versions read for sure (a read that failed would say so, never "none")');

  // ---------- 2. the list: name, when, who, a picture ----------
  await until(async () => (await LabVersions.list(sid)).rows.some((r) => r.thumb), 15000);
  await LabVersions.close(); await LabVersions.open();
  const rowsEl = () => [...P().querySelectorAll('.vs-row')];
  const rowOf = (id) => rowsEl().find((r) => r.dataset.id === id);
  const rCalm = rowOf(named.id); const rAuto = auto ? rowOf(auto.id) : null;
  out.info.rows = rowsEl().map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  ok(rCalm && /Calm start/.test(rCalm.textContent) && /● you/.test(rCalm.textContent) && /\d\d:\d\d|\d:\d\d/.test(rCalm.textContent), 'a named row shows its name, when and who', out.info.rows);
  ok(rAuto && /✳ Claude/.test(rAuto.textContent), 'the automatic row says Claude', out.info.rows);
  ok(rowsEl().some((r) => r.querySelector('.vs-pic img')), 'rows have a picture');
  ok(rowOf('now'), 'Now is on the list, to compare with');

  // ---------- 3. compare 2: live panels and the one-line diff ----------
  rCalm.querySelector('.vs-pick').click(); rowOf('now').querySelector('.vs-pick').click();
  const cbtn = P().querySelector('.vs-cmp-btn');
  ok(!cbtn.disabled && /Compare 2/.test(cbtn.textContent), 'two ticked: Compare 2');
  cbtn.click();
  const c = await until(() => LabVersions.compared?.card && LabVersions.compared, 8000);
  ok(c && c.panels.length === 2, 'the compare card with 2 panels');
  await until(() => c.panels.every((p) => p.stage?.running), 30000);
  await wait(1500);
  LabVersions._test.place();
  const live = c.panels.map((p) => {
    const host = p.stage?.host; if (!host) return null;
    const r = host.getBoundingClientRect(); const v = p.view.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    return { on: host.classList.contains('vs-stage-on') && getComputedStyle(host).opacity === '1', inside: cx > v.left && cx < v.right && cy > v.top && cy < v.bottom, running: Boolean(p.stage.running) };
  });
  out.info.live = live;
  ok(live.every((x) => x?.on && x.inside && x.running), 'two live panels: each version\'s stage over its box, running', live);
  const pics = await Promise.all(c.panels.map((p) => p.stage.thumb(120)));
  ok(pics.every((u) => /^data:image\//.test(u || '') && u.length > 400), 'each panel draws a picture');
  ok(pics[0] !== pics[1], 'the two panels show different scenes');
  ok(c.panels[0].sketch.layers.length === 1 && c.panels[1].sketch.layers.some((L) => L.name === 'Glow ring'), 'each panel runs its own version (oldest first)');
  const diffTxt = c.card.querySelectorAll('.vs-diff')[1]?.textContent || '';
  out.info.diff = diffTxt;
  ok(/1 slider changed/.test(diffTxt) && /1 layer added \(Glow ring\)/.test(diffTxt), 'the panel\'s one-line diff', diffTxt);
  LabVersions._test.syncClocks();
  ok(c.synced?.stages === 2, 'the panels are kept on one clock', c.synced);
  ok(await txSig() !== '' && sigNow() === aiSig, 'comparing leaves the scene alone');

  // ---------- 4. Use this one: exactly, as one undo step ----------
  const preUse = await txSig();
  const nSteps = LabTxn.history().length;
  c.card.querySelector(`.vs-cell[data-id="${named.id}"] .vs-use`).click();
  await until(() => sigNow() === calmSig, 10000);
  await wait(500);
  ok(sigNow() === calmSig, 'Use this one: the scene is that version exactly', { now: sigNow().slice(0, 120) });
  ok(!LabVersions.compared && !document.querySelector('.lab-backstage.vs-stage-on'), 'the compare card and its stages go');
  ok(LabTxn.history().length === Math.min(nSteps + 1, 12) && /Calm start/.test(LabTxn.history().at(-1)?.words?.[0] || ''), 'it is one undo step', LabTxn.history().at(-1));
  await say('/undo-edit', agent.id);
  await until(async () => await txSig() === preUse, 8000);
  ok(await txSig() === preUse && sigNow() === aiSig, 'one Undo puts the scene back exactly');

  // ---------- 5. Take only one layer (the older main layer into the scene as it is) ----------
  const preTake = await txSig();
  await LabVersions.compare([named.id, 'now']);
  const c2 = LabVersions.compared;
  c2.card.querySelector(`.vs-cell[data-id="${named.id}"] .vs-take`).click();
  ok(await menuClick(new RegExp(`^${main.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)), 'Take only… lists the version\'s layers');
  await until(() => LabTxn.history().at(-1)?.words?.[0]?.includes('took the layer'), 8000);
  await wait(600);
  const st = ThreeLab.tm.state(sid);
  const mainNow = st.layers.find((L) => L.name === main);
  const spinNow = TMCore.sliderVals(mainNow, st.vals[mainNow.id]).spin;
  ok(st.layers.some((L) => L.name === 'Glow ring') && Math.abs(spinNow - 0.3) < 1e-6, 'Take only: that layer as it was, the rest as it is', { spin: spinNow, layers: st.layers.map((L) => L.name) });
  ok(/took the layer/.test(LabTxn.history().at(-1)?.words?.[0] || ''), 'it is one undo step');
  await say('/undo-edit', agent.id);
  await until(async () => await txSig() === preTake, 8000);
  ok(await txSig() === preTake, 'one Undo puts it back');
  LabVersions.closeCompare();

  // ---------- 7. delete goes to the Trash (and comes back) ----------
  await LabVersions.save('Throwaway idea');
  await LabVersions.open();
  const tw = (await LabVersions.list(sid)).rows.find((r) => r.name === 'Throwaway idea');
  const twState = TMCore.sig(await TH.stateOf(tw.id, sid));
  rowOf(tw.id).querySelector('.vs-more').click();
  ok(await menuClick(/^Delete$/), 'the row\'s ⋯ has Delete');
  await until(async () => !(await LabVersions.list(sid)).rows.some((r) => r.id === tw.id), 8000);
  ok(!(await LabVersions.list(sid)).rows.some((r) => r.id === tw.id) && !rowOf(tw.id), 'deleted: off the list');
  const trash = await window.hub.kvGet('three-versions-trash', null);
  const item = trash?.items?.find((x) => x.version?.id === tw.id);
  ok(item && item.name === 'Throwaway idea' && TMCore.sig(item.state) === twState && item.sceneId === sid, 'it is in the Trash with its scene state', trash);
  ok((await LabVersions.deleted(sid)).some((x) => x.id === item?.id), 'the list\'s Trash shows it');
  await LabVersions.undelete(item.id);
  const back = (await LabVersions.list(sid)).rows.find((r) => r.id === tw.id);
  ok(back && back.kind === 'named' && TMCore.sig(await TH.stateOf(tw.id, sid)) === twState, 'it comes back from the Trash as it was');
  ok(!(await window.hub.kvGet('three-versions-trash', null))?.items?.some((x) => x.id === item.id), 'and leaves the Trash');

  // ---------- 6. pruning keeps named versions, drops old automatic ones ----------
  await TH.autoVersion(sid, { why: 'take', label: 'Kept take B: “test”' });
  const before = (await LabVersions.list(sid)).rows;
  ok(before.some((r) => r.kind === 'auto' && r.why === 'take'), 'an automatic version (a kept take) is listed');
  const nT = await TH.thin(sid, Date.now() + 40 * 864e5);
  const after = (await LabVersions.list(sid)).rows;
  out.info.prune = { thinned: nT, before: before.map((r) => `${r.kind}:${r.name}`), after: after.map((r) => `${r.kind}:${r.name}`) };
  ok(after.some((r) => r.name === 'Calm start') && after.some((r) => r.name === 'Throwaway idea'), 'thinning keeps every named version', out.info.prune);
  ok(!after.some((r) => r.kind === 'ai') && nT > 0, 'old automatic versions are thinned out', out.info.prune);
  // the cap counts unnamed versions only (pure, on a copy)
  const doc = TMCore.blank(); const base = { layers: [{ id: 'a', name: 'A', code: '// 0' }], vals: {}, palette: null };
  for (let i = 0; i < 300; i += 1) { const v = TMCore.add(doc, { ...base, layers: [{ id: 'a', name: 'A', code: `// ${i}` }] }, { at: Date.now() - 1000 * (300 - i) }); if (i % 50 === 0) v.name = `N${i}`; }
  TMCore.thin(doc, Date.now(), { cap: 100 });
  ok(doc.versions.filter((v) => v.name).length === 6 && doc.versions.length <= 106, 'the cap never drops a named version', { n: doc.versions.length, named: doc.versions.filter((v) => v.name).length });

  // ---------- /scene-versions ----------
  ok(/Calm start/.test(await say('/scene-versions list', agent.id)), '/scene-versions list names them');
  LabVersions.close();
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
