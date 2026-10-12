// Time machine (tools/three-history*.js) end to end: ~20 changes of each kind (code run, layer added / removed, sliders
// saved, shuffle kept, director edits through the real HubBridge handler, a crew pick) become versions with who / label /
// tiny pictures; scrubbing shows each version on the preview (the layers the preview runs and the code match it) and
// leaves the saved scene alone; compare (two pictures + what changed); restore + undo; branch; pick a layer / the colors
// / the slider values; director turn bookmarks with the fake engine + /back n; thinning; the commands.
//   node dev/smoke.js --fake-engines --script dev/checks/timemachine.js --wait 6000 --check-timeout 420000 --shot /tmp/timemachine.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = { steps: [], problems: [], ms: {} };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };
try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const cmd = await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director && window.ThreeHistory);
  await wait(800);
  const S = ThreeLab.scenes; const D = ThreeLab.director; const TH = ThreeHistory;
  const CODE = (n, col = '#7a5cff') => `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.3, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, tint: { value: '${col}', label: 'Tint', group: 'Color' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, ${n % 4}), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; mesh.scale.setScalar(P.size); mesh.material.color.set(P.tint); renderer.render(scene, camera); });
// rev ${n}`;
  Native.newChat(agent.id);
  await wait(600);
  // the chat's scene, set up by a director turn (fake engine, real MCP call)
  await Native.send(agent.id, `mcp: ${JSON.stringify([['three_set_code', { code: CODE(0), wait: 1 }]])}`);
  await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);
  const chatId = H.activeChat[agent.id];
  const sid = ChatScenes.linkOf(chatId) || S.currentId();
  step(S.currentId() === sid, 'the chat\'s scene is on screen', sid);
  // its other layers (the starter's) go, so the check reads one layer
  for (const L of D.layers().layers.slice()) if (L.name !== D.codeOf().name && D.layers().layers.length > 1) await D.removeLayer(L.name);
  await TH.flush(sid);
  const v0 = (await TH.list(sid)).length;
  step(v0 >= 1, 'versions from the start (opened + the first turn)', v0);
  const main = () => D.codeOf().name;

  // ---------- ~20 changes of each kind ----------
  const t0 = performance.now();
  for (let i = 1; i <= 20; i += 1) { await D.updateLayer(main(), { code: CODE(i) }, 0.25); await TH.flush(sid); }
  out.ms.runs = Math.round(performance.now() - t0);
  for (let i = 0; i < 10; i += 1) {
    await D.addLayer({ name: `Glow ${i}`, code: `// glow ${i}\nconst P = tweak({ amt: [${i / 10}, 0, 1] });\n` }, 0.25); await TH.flush(sid);
    await D.removeLayer(`Glow ${i}`); await TH.flush(sid);
  }
  for (let i = 0; i < 20; i += 1) { D.sliders(main(), { spin: (i % 9) / 5 - 0.8, size: 0.5 + (i % 7) / 4 }); await wait(30); await ThreeLab.act('saveSliders'); await wait(80); await TH.flush(sid); }
  for (let i = 0; i < 20; i += 1) { cmd.shuffle({ seed: 100 + i }); await TH.flush(sid); }
  // one shuffle left alone: kept after 5 s without a flush
  const nShuf = (await TH.list(sid)).length; cmd.shuffle({ seed: 999 }); await wait(5800);
  const kept = (await TH.list(sid)).slice(nShuf);
  step(kept.length === 1 && kept[0].kind === 'shuffle' && /^Shuffle kept/.test(kept[0].label), 'a shuffle left 5 s is kept as a version', kept.map((v) => v.label));
  // director edits through the real handler (HubBridge, as an MCP call routes them), as this chat
  for (let i = 0; i < 20; i += 1) {
    const r = await HubBridge.call('three_edit_code', { layer: main(), edits: [{ find: 'rev', replace: `rev${i}` }], wait: 0.3 }, { chatId });
    if (r?.ok === false && i === 0) step(false, 'director edit', r.error);
    await TH.flush(sid);
  }
  // a crew pick (tools/three-crew.js marks it)
  TH.as(sid, 'crew'); await D.updateLayer(main(), { code: CODE(77, '#ff3cac') }, 0.25); await TH.flush(sid);
  const all = await TH.list(sid);
  const by = {}; const kinds = {};
  for (const v of all) { by[v.by] = (by[v.by] || 0) + 1; kinds[v.kind] = (kinds[v.kind] || 0) + 1; }
  step(all.length >= 100, 'versions recorded', { total: all.length, kinds, by });
  step((by.claude || 0) >= 20 && (by.crew || 0) >= 1 && (by.you || 0) >= 60, 'who made each one: you / Claude / crew', by);
  step(kinds.sliders >= 15 && kinds.shuffle >= 15 && kinds.director >= 20, 'kinds: sliders saved, shuffles kept, director edits', kinds);
  const lab = (re) => all.find((v) => re.test(v.label))?.label;
  step(Boolean(lab(/^Layer added/) && lab(/^Layer removed/) && lab(/^Code run/) && lab(/^Sliders saved/)), 'one-line labels', [lab(/^Layer added/), lab(/^Layer removed/), lab(/^Code run/), lab(/^Sliders saved/), all.find((v) => v.by === 'claude')?.label]);
  const info = await TH.info(sid);
  step(info.bytes < 400 * 1024, 'stored compactly (deltas against a few full states)', { ...info, kb: Math.round(info.bytes / 1024) });
  // pictures: the newest gets one once it's drawn (the thumbnail channel); read only when shown
  await D.updateLayer(main(), { code: CODE(5, '#33ddaa') }, 0.3); await TH.flush(sid);
  const newest = (await TH.list(sid)).at(-1);
  const pic = await until(async () => (await TH.thumbs(sid))[newest.id], 15000);
  step(Boolean(pic) && pic.length < 20000, 'a tiny picture of the new version', pic ? `${Math.round(pic.length / 1024 * 10) / 10} KB` : 'none');
  const kvThumbs = await until(async () => Object.keys(await window.hub.kvGet(`three-tm-${sid}-t`, {})).length, 8000);
  step(kvThumbs >= 1, 'pictures saved apart from the versions', kvThumbs);

  // ---------- scrubbing ----------
  await ThreeHistoryUI.open();
  await wait(300);
  const versions = ThreeHistoryUI.versions;
  const liveBefore = JSON.stringify(S.get(sid).layers.map((L) => [L.id, L.code]));
  const scrubMs = [];
  let right = 0; let tried = 0;
  for (const i of [5, 30, 60, 90, versions.length - 3, 12]) {
    if (!versions[i]) continue;
    tried += 1;
    const t = performance.now();
    await ThreeHistoryUI.select(i);
    scrubMs.push(Math.round(performance.now() - t));
    await wait(500);
    const st = await TH.stateOf(versions[i].id, sid);
    const shown = D.layers().layers.map((x) => x.name).join();
    const want = st.layers.map((x) => x.name).join();
    const code = D.codeOf(st.layers.find((L) => L.id === st.sel)?.name || st.layers.at(-1).name).code;
    const wantCode = (st.layers.find((L) => L.id === st.sel) || st.layers.at(-1)).code;
    const vals = Object.entries(st.vals?.[st.layers.at(-1).id] || {});
    const ctl = D.sliders(st.layers.at(-1).name).sliders;
    const valsOk = vals.every(([k, v]) => JSON.stringify(ctl.find((c) => c.key === k)?.value) === JSON.stringify(v));
    if (shown === want && code === wantCode && valsOk) right += 1;
    else step(false, `scrub ${i} shows that version`, { shown, want, code: code === wantCode, valsOk });
  }
  step(right === tried, 'scrubbing shows each version (layers, code, slider values)', `${right}/${tried} · ${scrubMs.join(' / ')} ms`);
  // the preview itself runs that version: its layer count is the sandbox's own
  const fewLayers = versions.findIndex((v) => /^Layer added/.test(v.label));
  if (fewLayers >= 0) {
    await ThreeHistoryUI.select(fewLayers);
    await wait(900);
    const n = await D.evalInSketch('return document.querySelectorAll("canvas").length').catch(() => null);
    step(D.layers().layers.length === 2, 'a version with an extra layer shows it', { layers: D.layers().layers.map((x) => x.name), canvases: n?.value ?? n });
  }
  // keyboard ← / →
  const before = ThreeHistoryUI.index;
  document.querySelector('.tm-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await wait(400);
  step(ThreeHistoryUI.index === before - 1 && TH.scrubbing?.version === versions[before - 1]?.id, '← steps to the older version', { from: before, to: ThreeHistoryUI.index });
  await window.smoke?.({ shot: `${window.TM_SHOTS || '/tmp'}/timemachine-strip.png` });
  // Esc: back to now, the saved scene untouched by the scrubbing
  document.querySelector('.tm-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(500);
  const liveAfter = JSON.stringify(S.get(sid).layers.map((L) => [L.id, L.code]));
  const disk = await window.hub.kvGet('three-sketches', []);
  await wait(900);
  const diskNow = JSON.stringify((await window.hub.kvGet('three-sketches', [])).find((x) => x.id === sid)?.layers?.map((L) => [L.id, L.code]));
  step(!TH.scrubbing && liveAfter === liveBefore && diskNow === liveBefore && !ThreeHistoryUI.isOpen(), 'Esc puts the scene back as it was (memory and disk)', { same: liveAfter === liveBefore, disk: diskNow === liveBefore, n: disk.length });
  const nAfterScrub = (await TH.list(sid)).length;
  step(nAfterScrub === versions.length, 'scrubbing made no versions', { before: versions.length, after: nAfterScrub });

  // ---------- compare ----------
  await ThreeHistoryUI.open();
  const vs = ThreeHistoryUI.versions;
  const a = vs[10].id;
  const t1 = performance.now();
  const r = await ThreeHistoryUI.compare(a, 'now');
  out.ms.compare = Math.round(performance.now() - t1);
  const imgs = [...document.querySelectorAll('.tm-cmp-stage img')].filter((x) => x.src.startsWith('data:'));
  const side = document.querySelector('.tm-cmp-side')?.textContent || '';
  step(r?.a && r?.b && imgs.length === 2 && /\+\d+ −\d+|sliders|layer/i.test(side), 'compare: two pictures in a split wipe + what changed', { ms: out.ms.compare, side: side.slice(0, 120) });
  await window.smoke?.({ shot: `${window.TM_SHOTS || '/tmp'}/timemachine-compare.png` });
  document.querySelector('.tm-compare')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const ch = await TH.changesBetween(a, 'now', sid);
  step(ch.code.length >= 1 && ch.code[0].lines.some((l) => l.op === '+'), 'code diff lines', ch.summary);
  ThreeHistoryUI.close();

  // ---------- restore + undo ----------
  const nowCode = D.codeOf(main()).code;
  const target = vs[15];
  const tState = await TH.stateOf(target.id, sid);
  const rr = await TH.restore(target.id, { id: sid });
  await wait(400);
  const restored = D.codeOf(main()).code === (tState.layers.find((L) => L.name === main()) || tState.layers.at(-1)).code;
  const lastV = (await TH.list(sid)).at(-1);
  step(restored && lastV.kind === 'restore' && /^Restored/.test(lastV.label), 'restore: the version is the scene, recorded as one', lastV.label);
  await rr.undo();
  await wait(400);
  step(D.codeOf(main()).code === nowCode, 'restore is undoable');

  // ---------- cherry-pick ----------
  // a version with another color: pick only the colors
  await D.updateLayer(main(), { code: CODE(31, '#112233') }, 0.25); await TH.flush(sid);
  const pinkV = (await TH.list(sid)).find((v) => v.by === 'crew');
  const pinkS = await TH.stateOf(pinkV.id, sid);
  const pinkTint = TMCore.sliderVals(pinkS.layers.find((L) => L.name === main()), pinkS.vals?.[pinkS.layers.find((L) => L.name === main()).id]).tint;
  const pc = await TH.pick(pinkV.id, 'colors', { id: sid });
  await wait(300);
  const codeNow = D.codeOf(main()).code;
  step(codeNow.includes(`'${pinkTint}'`) && /IcosahedronGeometry\(1, 3\)/.test(codeNow), 'pick the colors: only the colors come back', { label: pc.version?.label, tint: pinkTint, code: /tint: \{ value: '[^']+'/.exec(codeNow)?.[0] });
  await pc.undo(); await wait(300);
  const spinV = (await TH.list(sid)).filter((v) => v.kind === 'sliders')[3];
  const spinState = await TH.stateOf(spinV.id, sid);
  const ps = await TH.pick(spinV.id, 'sliders', { id: sid });
  await wait(300);
  const want = TMCore.sliderVals(spinState.layers.find((L) => L.name === main()), spinState.vals?.[spinState.layers.at(-1).id]);
  const got = TMCore.sliderVals({ code: D.codeOf(main()).code }, {});
  step(['spin', 'size'].every((k) => Math.abs(want[k] - got[k]) < 1e-6) && /IcosahedronGeometry\(1, 3\)/.test(D.codeOf(main()).code), 'pick the slider values: the values, not the code', { want: [want.spin, want.size], got: [got.spin, got.size] });
  await ps.undo(); await wait(300);
  const withGlow = (await TH.list(sid)).find((v) => /^Layer added/.test(v.label));
  const glowState = await TH.stateOf(withGlow.id, sid);
  const glow = glowState.layers.find((L) => /^Glow/.test(L.name));
  const pl = await TH.pick(withGlow.id, 'layer', { id: sid, layer: glow.id });
  await wait(300);
  step(D.layers().layers.some((L) => L.name === glow.name), 'pick one layer: a removed layer comes back', pl.version?.label);
  await pl.undo(); await wait(300);
  step(!D.layers().layers.some((L) => L.name === glow.name), 'and its undo');

  // ---------- branch ----------
  const nScenes = S.all().length;
  const bv = (await TH.list(sid))[40];
  const bState = await TH.stateOf(bv.id, sid);
  const copy = await TH.branch(bv.id, { id: sid, name: 'TM branch', open: false });
  await wait(300);
  const copyHist = await TH.list(copy.id);
  step(S.all().length === nScenes + 1 && JSON.stringify(S.get(copy.id).layers.map((L) => L.name)) === JSON.stringify(bState.layers.map((L) => L.name)) && /^Branched from/.test(copyHist.at(-1)?.label), 'branch: a new scene from a version, its history starts there', copyHist.at(-1)?.label);
  step(S.currentId() === sid, 'the scene on screen stays');

  // ---------- director turn bookmarks (fake engine, real MCP calls) ----------
  for (let i = 0; i < 3; i += 1) {
    await Native.send(agent.id, `mcp: ${JSON.stringify([['three_edit_code', { layer: main(), edits: [{ find: '// ', replace: `// turn${i} ` }], wait: 0.3 }]])}`);
    await until(() => !Native.isBusy(chatId), 60000);
    await wait(900);
    await TH.flush(sid);
  }
  const turns = await TH.turns(sid);
  step(turns.length >= 3 && turns.slice(0, 3).every((t) => t.by === 'claude'), 'each director turn\'s start is bookmarked', turns.slice(0, 3).map((t) => `${t.by}: ${t.text.slice(0, 30)} (${t.edits})`));
  const before3 = await TH.stateOf(turns[2].version.id, sid);
  const msg = await say('/back 3', agent.id);
  await wait(400);
  const backOk = D.codeOf(main()).code === (before3.layers.find((L) => L.name === main()) || before3.layers.at(-1)).code && !/turn0/.test(D.codeOf(main()).code);
  step(backOk, '/back 3: before Claude\'s last 3 edits in one step', msg);
  const msgU = await say('/back undo', agent.id);
  await wait(400);
  step(/turn2/.test(D.codeOf(main()).code), '/back undo', msgU);

  // ---------- thinning ----------
  const doc = TH._doc(sid);
  const nowT = Date.now();
  const list = TMCore.byTime(doc);
  list.forEach((v, i) => { v.at = nowT - (list.length - i) * 3 * 3600e3; }); // every 3 h back over ~2 months
  const n0 = list.length;
  const thinned = await TH.thin(sid, nowT);
  const left = TMCore.byTime(doc);
  const today = new Date(nowT); today.setHours(0, 0, 0, 0);
  const days = new Set(left.filter((v) => v.at < today.getTime() - 6 * 864e5).map((v) => new Date(v.at).toDateString()));
  step(thinned > 0 && days.size === left.filter((v) => v.at < today.getTime() - 6 * 864e5).length && left.every((v) => TMCore.stateOf(doc, v)), 'thinning: daily after a week, hourly in the week, all of today; all still rebuild', { before: n0, after: left.length });
  await wait(1800);
  const stored = await window.hub.kvGet(`three-tm-${sid}`, null);
  step(stored?.versions?.length === left.length, 'saved per scene (kv three-tm-<scene>)', stored?.versions?.length);

  // ---------- commands ----------
  const h = await say('/history', agent.id);
  step(/version/.test(h) && ThreeHistoryUI.isOpen(), '/history opens it and lists the last versions', h.split('\n')[0]);
  const hl = await say('/history list 3', agent.id);
  step(hl.split('\n').length === 3, '/history list 3', hl);
  ThreeHistoryUI.close();
  const nb = S.all().length;
  const b = await say('/branch Neon idea', agent.id);
  step(S.all().length === nb + 1 && /Neon idea/.test(b), '/branch in the Lab: a scene, not a chat', b);
  step(Commands.duplicates?.().length === 0 || !Commands.duplicates, 'no duplicate commands', Commands.duplicates?.());
  out.stats = TH.stats();
} catch (err) { out.problems.push(`threw: ${err.message}`); out.stack = String(err.stack).split('\n').slice(0, 4); }
return JSON.stringify(out, null, 1);
