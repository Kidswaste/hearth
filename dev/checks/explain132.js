// (round 132, explain132) ✦ Explain this layer, by clicks, with the fake engines answering the two helper passes
// (dev/fake-common.js: the explanation names `const COUNT = 12;` and the quoted colour as hard-coded values; "slower…"
// is a slider + keyframe plan with one unknown key and one value past its max; anything else goes to the director):
//   1. cost first, nothing sent: a layer's right-click › ✦ Explain this layer and the Sliders panel's ⋯ open the card
//      with the cost line (tokens · Claude); no AI call before ✦ Explain it
//   2. the card: ONE lean helper pass; what it draws, the sliders that matter, 2 "Turn into a slider" chips
//   3. the cache: reopening the same code is a hit, with no second call
//   4. "Make it slower and more blurry on the breaks": sliders and keyframes here, clamped, as ONE undo (the dock's ↶)
//   5. "Turn into a slider": COUNT becomes a working tweak() slider through the code-edit path, ONE undo; the changed
//      code is a cache miss (and Astra's cost line names Astra)
//   6. a bigger wish goes to the director as the owner's message
// Only the check's own temp data folder (smoke.js); no owner data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/explain132.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 300)})`); return Boolean(c); };
const sigOf = async (sid) => LabTxn._test.sigOf(await LabTxn.snap(sid));
const card = () => document.querySelector('.xpl-card');
const st = () => LabExplain.state();
const menuRow = (re) => [...document.querySelectorAll('[role="menuitem"], .menu-item')].find((b) => b.getClientRects().length && re.test(b.textContent));
const costText = () => until(() => { const t = card()?.querySelector('.xpl-cost')?.textContent || ''; return /tokens/.test(t) ? t : null; }, 20000);
const CODE = `import * as THREE from 'three';
const P = tweak({ glow: [0.4, 0, 1], speed: [1, 0, 2] });
const COUNT = 12;
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 6;
const ring = new THREE.Group(); scene.add(ring);
const mat = new THREE.MeshBasicMaterial({ color: '#2bd2ff', transparent: true });
for (let i = 0; i < COUNT; i += 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mat); const a = (i / COUNT) * Math.PI * 2; m.position.set(Math.cos(a) * 2, Math.sin(a) * 2, 0); ring.add(m); }
renderer.setAnimationLoop((now) => { mat.opacity = 0.3 + P.glow * 0.7; ring.rotation.z = (now / 1500) * P.speed; renderer.render(scene, camera); });`;
async function make(text) {
  const box = card()?.querySelector('.xpl-input');
  box.value = text;
  card().querySelector('.xpl-go').click();
  await until(() => !['running', 'idle'].includes(st().tweak.phase), 60000);
  await wait(150);
  return st().tweak;
}

try {
  // ---------- a docked director (Claude) and a one-layer scene with two sliders ----------
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  ok(await until(() => H.surfaces.get('tool:three')?.el.querySelector('.dd-strip'), 30000), 'the docked director');
  const d = ThreeLab.director;
  await d.newSketch('Explain probe', CODE);
  await wait(1500);
  const sid = ThreeLab.scenes.currentId();
  const L = d.layers().layers.at(-1);
  const sliderVal = (k) => d.sliders(L.id, null).sliders.find((s) => s.key === k)?.value;

  // ---------- 1. the ways in, cost first, nothing sent ----------
  (await ThreeLab.cmd()).panel(true);
  const row = await until(() => document.querySelector(`.ly-row[data-id="${L.id}"]`), 10000);
  row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
  const r1 = await until(() => menuRow(/Explain this layer/), 5000);
  ok(r1, 'a layer\'s right-click has ✦ Explain this layer');
  r1?.click();
  const cost = await costText();
  out.info.cost = cost;
  ok(cost && /About [\d.]+k? tokens in and [\d.]+k? out · Claude/.test(cost) && card()?.querySelector('.xpl-run'), 'the card shows the cost first (tokens · Claude) and ✦ Explain it', cost);
  ok(card()?.closest('.tw-column') || card()?.nextElementSibling?.classList.contains('tw-slot'), 'the card sits beside the Sliders panel');
  await wait(1500);
  ok(st().sent.length === 0 && st().runs === 0 && st().phase === 'ready', 'nothing is sent before the click', st().sent.length);
  LabExplain.close();
  const more = await until(() => [...document.querySelectorAll('.tw-more')].find((b) => b.getClientRects().length), 5000);
  more?.click();
  const r2 = await until(() => menuRow(/Explain this layer/), 5000);
  ok(r2, 'the Sliders panel\'s ⋯ has ✦ Explain this layer');
  r2?.click();
  ok(await costText() && st().sent.length === 0, 'the ⋯ row opens the same card, nothing sent');

  // ---------- 2. ✦ Explain it: one lean helper pass, the card ----------
  card().querySelector('.xpl-run').click();
  await until(() => ['done', 'error'].includes(st().phase), 60000);
  const s2 = st();
  out.info.explained = { phase: s2.phase, error: s2.error, raw: s2.raw.slice(0, 200), hard: s2.data?.hardcoded?.map((h) => [h.key, h.line, h.text]) };
  ok(s2.phase === 'done' && s2.sent.length === 1 && /^Explain this Lab layer "Explain probe|^Explain this Lab layer/.test(s2.sent[0].text) && s2.sent[0].options.lean && s2.sent[0].options.helper, 'ONE lean helper pass', out.info.explained);
  ok(/\bCOUNT = 12;/.test(s2.sent[0]?.text || '') && /glow 0\.4 \(0–1\)/.test(s2.sent[0]?.text || ''), 'it reads the numbered code and the sliders');
  const what = card()?.querySelector('.xpl-what')?.textContent || '';
  ok(/ring of glowing spheres/.test(what), 'the card says what it draws', what);
  ok(card().querySelectorAll('.xpl-sl').length === 2, 'the sliders that matter (2)');
  const chips = [...card().querySelectorAll('button.xpl-chip')];
  ok(chips.length === 2 && /Turn into a slider: count amount \(12\)/.test(chips[0].textContent), '2 "Turn into a slider" chips', chips.map((c) => c.textContent));

  // ---------- 3. the cache: no second call ----------
  LabExplain.close();
  LabEasy.explainLayer(L.id);
  await until(() => st().phase === 'done' && card(), 10000);
  ok(st().cached && st().sent.length === 1 && /From the cache · 0 tokens/.test(card()?.textContent || ''), 'reopening is a cache hit, with no second call', { cached: st().cached, sent: st().sent.length });
  const kv = await window.hub.kvGet('three-explain', null);
  ok((kv?.list || []).some((e) => e.id === L.id && e.hash === st().hash), 'the explanation is kept by the code\'s hash');

  // ---------- 4. "Make it…" on sliders and keyframes: ONE undo ----------
  const sig0 = await sigOf(sid);
  const t1 = await make('slower and more blurry on the breaks');
  const snap1 = await LabTxn.snap(sid);
  const keys = snap1.layers.find((x) => x.id === L.id)?.keys?.['s:glow'] || [];
  out.info.tweak = { t1, keys };
  ok(t1.phase === 'applied' && sliderVal('speed') === 0.5, 'the plan lands here: speed 1 → 0.5', t1);
  ok(keys.length === 3 && keys.every((k) => k.v <= 1), 'keyframes on glow, clamped to its range', keys);
  ok(!d.sliders(L.id, null).sliders.some((s) => s.key === 'zzz') && st().sent.length === 2, 'the unknown key is dropped; one more small pass');
  await DirectorDock.undoEdit();
  ok(await until(async () => (await sigOf(sid)) === sig0, 8000), 'one Undo (the dock\'s ↶) puts the scene back exactly');
  ok(sliderVal('speed') === 1, 'speed is 1 again');

  // ---------- 5. "Turn into a slider": one code edit, a working slider, ONE undo ----------
  const sig1 = await sigOf(sid);
  [...card().querySelectorAll('button.xpl-chip')][0]?.click();
  await until(() => st().chips[0] === 'added', 20000);
  const code5 = d.codeOf(L.id).code;
  out.info.slider = { chips: st().chips, head: code5.split('\n').slice(1, 3) };
  ok(st().chips[0] === 'added' && /const COUNT = P\.count;/.test(code5) && /tweak\(\{ count: \{ value: 12, min: 1, max: 36/.test(code5), 'COUNT becomes P.count in the layer\'s tweak()', out.info.slider);
  ok(sliderVal('count') === 12, 'the count slider is there at 12', sliderVal('count'));
  d.sliders(L.id, { count: 20 });
  ok(sliderVal('count') === 20, 'and it works (20)');
  d.sliders(L.id, { count: 12 });
  await wait(300);
  out.info.errors5 = (window.LabHealth?.state?.(sid) || []).map((x) => x.message).slice(0, 3);
  ok(!out.info.errors5.length, 'the layer runs without errors', out.info.errors5);
  // our own edit carries the explanation over: reopening is free, the chip marked done
  LabExplain.close();
  await LabExplain.open({ layerId: L.id });
  ok(st().cached && st().sent.length === 2 && card()?.querySelector('.xpl-chip.done'), 'reopening after it is still free (the explanation carried over), the chip marked done', { cached: st().cached, sent: st().sent.length });
  await DirectorDock.undoEdit();
  ok(await until(async () => (await sigOf(sid)) === sig1, 8000), 'one Undo takes the slider back exactly');
  ok(/const COUNT = 12;/.test(d.codeOf(L.id).code) && sliderVal('count') == null, 'COUNT is 12 in the code again, no count slider');
  // any other code change is a cache miss: the cost again (on Astra: its line names Astra), nothing sent
  await HubBridge.call('three_edit_code', { layer: L.id, edits: [{ find: 'camera.position.z = 6;', replace: 'camera.position.z = 7;' }] }, {});
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  if (ok(astra, 'Astra is there')) {
    const o = await LabExplain.open({ layerId: L.id, agentId: astra.id });
    ok(o.cached === false && /· Astra/.test(o.line || '') && st().sent.length === 2, 'changed code costs again (Astra\'s cost line), nothing sent', o);
    LabExplain.close();
  }
  await DirectorDock.undoEdit();
  ok(await until(() => /camera\.position\.z = 6;/.test(d.codeOf(L.id).code), 8000), 'that edit undone');

  // ---------- 6. a bigger wish goes to the director ----------
  await LabExplain.open({ layerId: L.id, agentId: agent.id });
  ok(st().cached && st().sent.length === 2, 'back on the original code: a cache hit again');
  const t2 = await make('twice as many rings with sparks');
  const sent = await until(async () => {
    const c = await Native.load(H.activeChat[agent.id]);
    return (c?.messages || []).filter((m) => m.role === 'user').map((m) => m.text).find((t) => t.includes('twice as many rings with sparks'));
  }, 15000);
  out.info.sent = sent?.slice(0, 200);
  ok(t2.phase === 'sent' && /^About the layer "/.test(sent || ''), 'a bigger wish goes to the director as the owner\'s message', { t2, sent });
  await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);
  out.info.errors = HubBridge.log().filter((x) => x.error).map((x) => `${x.tool}: ${String(x.error).slice(0, 120)}`).slice(-6);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
