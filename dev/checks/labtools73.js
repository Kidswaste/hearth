// (round 73, labtools73) Every Lab tool, on screen vs backstage, for Claude and for Astra (labbridge72's matrix, one step
// further): a plain Claude chat and a plain Astra chat each run the SAME reply of real MCP tool calls (fake engines)
// twice: once on a scene shown in the Lab, once on an identical scene that runs backstage (the Lab shows another one).
// The reply: a 3D model added, its material, light and a camera move (keyframes + a cue), a ◉ material look with a fresh
// small picture asked (shot: true), a physics layer (and a live kick), keyframes on a property and on a slider, an
// animation preset, the timeline (a cue, a lane), a second model added, removed, the first one replaced, a frame
// captured at a time, a contact sheet, the layers read. Then:
//   · same results: the two scenes end the same (layers, code shape, slider values, keyframes, looks, lanes, timeline,
//     cues, references) and every call's "applied:" words are the same on screen and backstage; no call failed
//   · one undo step: the dock's ↶ takes the whole reply back (the scene as it was before it) and ↷ puts it back
//   · transactional: a batch whose 2nd op fails, and a camera move whose 2nd keyframe call fails, leave the scene as it
//     was (on screen and backstage), and say so in words
//   · latency: each call's time on screen vs backstage (HubBridge's log); backstage ≤ 1.5× on screen
//   · (round 74, labcalls74) every hop of every call timed (MCP server → main → window → handler steps → back): the
//     median call that sends no picture ≤ 400 ms on screen, ≤ 600 ms backstage; picture calls report their own cost
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 1200000 --script dev/checks/labtools73.js --shot /tmp/labtools73.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' }, color: { value: '${color}', label: 'Color' }, spin: [0.4, -2, 2] });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
scene.add(new THREE.AmbientLight(0xffffff, 1));
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 16, 64), new THREE.MeshStandardMaterial({ color: P.color }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000 * P.spin; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
const S = () => ThreeLab.scenes;
// a tiny real GLB: one triangle (glTF 2.0 binary)
function glb(name) {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }], bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }] });
  const jb = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const total = 12 + 8 + jb.length + 8 + 36;
  const buf = new ArrayBuffer(total); const v = new DataView(buf); const u8 = new Uint8Array(buf);
  v.setUint32(0, 0x46546C67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
  v.setUint32(12, jb.length, true); v.setUint32(16, 0x4E4F534A, true); u8.set(jb, 20);
  v.setUint32(20 + jb.length, 36, true); v.setUint32(24 + jb.length, 0x004E4942, true); u8.set(new Uint8Array(pos.buffer), 28 + jb.length);
  let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s);
}
async function turn(agentId, text, ms = 240000) {
  await Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  const t0 = Date.now();
  await until(() => !Native.isBusy(chatId), ms);
  await wait(300);
  const chat = await Native.load(chatId);
  const m = chat.messages.at(-1);
  const lines = (String(m?.text || '').split('MCP calls:')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !/^(servers|server) /.test(l));
  return { chatId, m, lines, ms: Date.now() - t0, errors: lines.filter((l) => /^[\w]+: ERROR/.test(l)) };
}
const mcp = (calls) => `mcp please\nmcp: ${JSON.stringify(calls)}`;
// the reply every chat runs (paths of two GLBs the owner gave)
const REPLY = (duck, box) => [
  ['three_do', { cmd: 'model', op: 'add', file: duck }],
  ['three_do', { cmd: 'model', op: 'material', preset: 'chrome' }],
  ['three_do', { cmd: 'model', op: 'light', preset: 'neon' }],
  ['three_do', { cmd: 'model', op: 'move', preset: 'orbit', at: 0, secs: 4 }],
  ['three_do', { cmd: 'material', op: 'set', layer: 'Base', preset: 'gold', shot: true }],
  ['three_do', { cmd: 'physics', op: 'add', preset: 'bounce' }],
  ['three_do', { cmd: 'keyframes', layer: 'Base', property: 'opacity', keys: [{ time: 0, value: 1 }, { time: 2, value: 0.4 }] }],
  ['three_do', { cmd: 'keyframes', layer: 'Base', property: 'size', keys: [{ time: 0, value: 1 }, { time: 3, value: 2 }] }],
  ['three_do', { cmd: 'animate', layer: 'Base', preset: 'fadeIn' }],
  ['three_do', { cmd: 'timeline_edit', cues: { add: [{ time: 1, name: 'Hit' }] }, lane: { layer: 'Base', property: 'size', show: true } }],
  ['three_do', { cmd: 'model', op: 'add', file: box }],
  ['three_do', { cmd: 'remove_layer', layer: 'box73' }],
  ['three_do', { cmd: 'model', op: 'replace', file: box, layer: 'duck73' }],
  ['three_screenshot', { at: 1, size: 'small' }],
  ['three_do', { cmd: 'contact_sheet', count: 4 }],
  ['three_do', { cmd: 'physics', op: 'poke', what: 'kick' }],
  ['three_do', { cmd: 'layers' }],
];
const STEP = ['model add', 'model material', 'model light', 'camera move', 'material look + shot', 'physics add', 'keyframes opacity', 'keyframes slider', 'animate preset', 'timeline cue + lane', 'model add 2', 'model remove', 'model replace', 'capture a frame', 'contact sheet', 'physics kick', 'layers'];

// ---------- the scene as data, comparable between two scenes (ids differ, names don't) ----------
function sameShape(a, b) {
  if (a === b) return true;
  try { const A = ThreeTweaks.scan(a).items; const B = ThreeTweaks.scan(b).items; return A.length === B.length && ThreeTweaks.applyValues(a, A, B.map((it) => it.orig)) === b; } catch { return false; }
}
async function dataOf(id) {
  const t = await LabTxn.snap(id);
  const map = await ThreeLab.director.media.mapAt(`scene:${id}`);
  return {
    layers: t.layers.map((L) => ({ name: L.name, code: L.code, keys: L.keys || {}, look: L.overrides?.['@look'] || null, lanes: L.lanes || [], plays: [L.in ?? null, L.out ?? null], opacity: L.opacity ?? 1, vals: t.vals[L.id] || {} })),
    refs: (ThreeLab.refsOf(id) || []).map((r) => r.key).sort(),
    timeline: t.timeline?.len ?? null,
    cues: (map?.cues || []).map((c) => `${c.t}:${c.name}`),
  };
}
function diffData(a, b, { refs = true } = {}) {
  const d = [];
  if (a.layers.map((L) => L.name).join('|') !== b.layers.map((L) => L.name).join('|')) d.push(`layers ${a.layers.map((L) => L.name)} vs ${b.layers.map((L) => L.name)}`);
  for (const [i, L] of a.layers.entries()) {
    const M = b.layers[i]; if (!M) continue;
    if (!sameShape(L.code, M.code)) { const x = L.code.split('\n'); const y = M.code.split('\n'); const i = x.findIndex((ln, j) => ln !== y[j]); d.push(`${L.name}: code from line ${i + 1}: ${JSON.stringify(x[i] || '').slice(0, 90)} vs ${JSON.stringify(y[i] || '').slice(0, 90)} (${x.length} vs ${y.length} lines)`); }
    for (const k of ['keys', 'look', 'lanes', 'plays', 'opacity', 'vals']) if (JSON.stringify(L[k]) !== JSON.stringify(M[k])) d.push(`${L.name}: ${k} ${JSON.stringify(L[k]).slice(0, 120)} vs ${JSON.stringify(M[k]).slice(0, 120)}`);
  }
  for (const k of [...(refs ? ['refs'] : []), 'timeline', 'cues']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d.push(`${k} ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
  return d;
}
const bare = (dt) => JSON.stringify({ ...dt, layers: dt.layers.map(({ vals, ...L }) => ({ ...L, code: L.code.length })) });

// each top-level call's answer, per chat (the "applied:" words), and its time
const answers = new Map();
HubBridge.onResult((c) => { if (c.via === 'three_batch' || !c.chatId) return; if (!answers.has(c.chatId)) answers.set(c.chatId, []); const v = c.result?.value; answers.get(c.chatId).push({ tool: c.tool, ok: c.result?.ok !== false, error: c.result?.error || null, applied: v && typeof v === 'object' ? v.applied || null : typeof v === 'string' ? (/\napplied: (.*)$/.exec(v)?.[1] || null) : null, images: (c.result?.images || []).length, text: typeof v === 'string' ? v.slice(-300) : '' }); });
const timesOf = (chatId) => HubBridge.log().filter((e) => e.chatId === chatId && !e.running).map((e) => ({ tool: e.via ? `${e.tool}` : e.tool, ms: e.ms, ok: e.ok, image: e.image || 0, hops: HubBridge.hopsOf ? HubBridge.hopsOf(e) : null }));
// (round 74, labcalls74) per-hop timing: each call end to end (the engine's MCP server → main → this window → the
// handler's steps → back), the median per tool on screen / backstage, and a budget for calls that send no picture
const PICTURE = /^(capture a frame|contact sheet|material look \+ shot)$/;
const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : null; };
const BUDGET = { on: 400, back: 600 }; // ms, median of the calls that send no picture (round 74)

try {
  const C = H.agent('claude'); const AS = H.agent('astra');
  ok(C && AS, 'the default Claude and Astra agents');
  C.threeTools = true; await saveConfig(); await wait(600);
  await Commands.tryRun('/astra-tools on', AS.id, null, { say: () => {}, note: () => {} });
  ok(await until(() => H.agent('astra').threeTools, 5000), 'Astra has the Lab tools');

  // four identical scenes: Claude on screen / backstage, Astra on screen / backstage; the Lab shows the "on screen" one
  const IDS = { c_on: 's73con', c_bk: 's73cbk', a_on: 's73aon', a_bk: 's73abk' };
  const prev = (await window.hub.kvGet('three-sketches', null)) || [];
  const mk = (id, name) => ({ id, name, code: LAYER('Base', '#ff3d7f'), updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: LAYER('Base', '#ff3d7f'), visible: true, opacity: 1, blend: 'normal', slot: 0 }] });
  await window.hub.kvSet('three-sketches', [...prev.filter((x) => !Object.values(IDS).includes(x.id)), mk(IDS.c_on, 'Tools C on'), mk(IDS.c_bk, 'Tools C back'), mk(IDS.a_on, 'Tools A on'), mk(IDS.a_bk, 'Tools A back')]);
  store.set('three.current', IDS.c_on);
  activate('tool:three'); await wait(400);
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
  await until(() => S().currentId() === IDS.c_on, 8000); await wait(2500);
  await until(() => typeof LabTxn !== 'undefined', 5000);
  ok(typeof LabTxn !== 'undefined' && HubBridge.setAround, 'the Lab\'s calls go through LabTxn');
  const duck = await window.hub.saveAttachment('duck73.glb', glb('Duck'));
  const box = await window.hub.saveAttachment('box73.glb', glb('Box'));
  const initial = await dataOf(IDS.c_on);

  // one run: a chat linked to a scene, the reply, its answers and times
  const runs = {};
  async function runOne(key, agent, sceneId, showId) {
    if (S().currentId() !== showId) { S().open(showId); await until(() => S().currentId() === showId, 6000); await wait(1500); }
    activate(agent.id); await wait(300);
    Native.newChat(agent.id); await wait(300);
    const hello = await turn(agent.id, 'hello there');
    const chatId = hello.chatId;
    ChatScenes.linkGuest(chatId, sceneId);
    activate('tool:three'); await wait(500);
    const before = await dataOf(sceneId);
    const t = await turn(agent.id, mcp(REPLY(duck, box)));
    const after = await dataOf(sceneId);
    runs[key] = { chatId, sceneId, before, after, lines: t.lines, errors: t.errors, ms: t.ms, answers: (answers.get(chatId) || []).slice(), times: timesOf(chatId), backstage: S().currentId() !== sceneId };
    return runs[key];
  }
  // the dock's ↶ right after a reply: the scene as before it; ↷: as after it
  async function undoRedo(r) {
    const u = await DirectorDock.undoEdit();
    await wait(1200);
    const undone = await dataOf(r.sceneId);
    const d1 = diffData(undone, r.before, { refs: false }); // the files it added stay in the references (a redo needs them)
    const rd = await DirectorDock.redoEdit();
    await wait(1200);
    const redone = await dataOf(r.sceneId);
    const d2 = diffData(redone, r.after);
    return { undo: u ? { turn: u.turn, label: u.label } : null, undoneDiff: d1, redo: rd ? { turn: rd.turn } : null, redoneDiff: d2 };
  }

  const c1 = await runOne('claudeOn', C, IDS.c_on, IDS.c_on);
  out.claudeOnUndo = await undoRedo(c1);
  const c2 = await runOne('claudeBack', C, IDS.c_bk, IDS.c_on);
  out.claudeBackUndo = await undoRedo(c2);
  const a1 = await runOne('astraOn', AS, IDS.a_on, IDS.a_on);
  out.astraOnUndo = await undoRedo(a1);
  const a2 = await runOne('astraBack', AS, IDS.a_bk, IDS.a_on);
  out.astraBackUndo = await undoRedo(a2);

  for (const [k, r] of Object.entries(runs)) {
    out[k] = { backstage: r.backstage, ms: r.ms, calls: r.lines.length, errors: r.errors, applied: r.answers.map((a, i) => `${i + 1}. ${a.tool.replace(/^three_/, '')}: ${a.ok ? a.applied || '-' : `ERROR ${String(a.error).slice(0, 80)}`}`) };
    ok(r.lines.length >= REPLY(duck, box).length && !r.errors.length, `${k}: every call worked (${r.errors.join(' | ') || r.lines.length})`);
    ok(r.backstage === /Back$/.test(k), `${k}: ran ${/Back$/.test(k) ? 'backstage' : 'on screen'}`);
    ok(r.after.layers.map((L) => L.name).join('|') === 'Base|🧊 box73|⚛ Bouncing balls on beat' || r.after.layers.length === 3, `${k}: the layers (${r.after.layers.map((L) => L.name)})`);
    const shotAns = r.answers.find((a) => a.tool === 'three_material');
    ok(shotAns?.images >= 1, `${k}: shot: true sent a fresh small picture with the material call`);
    ok(r.answers.filter((a) => a.ok && a.applied).length >= 10, `${k}: the calls that changed something said so in words (${r.answers.filter((a) => a.applied).length})`);
  }
  out.claudeOnUndo.ok = ok(out.claudeOnUndo.undo?.turn && !out.claudeOnUndo.undoneDiff.length && !out.claudeOnUndo.redoneDiff.length, `Claude on screen: one ↶ took the whole reply back and ↷ put it back (${[...out.claudeOnUndo.undoneDiff, ...out.claudeOnUndo.redoneDiff].join(' | ')})`);
  out.claudeBackUndo.ok = ok(out.claudeBackUndo.undo?.turn && !out.claudeBackUndo.undoneDiff.length && !out.claudeBackUndo.redoneDiff.length, `Claude backstage: one ↶ took the whole reply back and ↷ put it back (${[...out.claudeBackUndo.undoneDiff, ...out.claudeBackUndo.redoneDiff].join(' | ')})`);
  out.astraOnUndo.ok = ok(out.astraOnUndo.undo?.turn && !out.astraOnUndo.undoneDiff.length && !out.astraOnUndo.redoneDiff.length, `Astra on screen: one ↶ / ↷ (${[...out.astraOnUndo.undoneDiff, ...out.astraOnUndo.redoneDiff].join(' | ')})`);
  out.astraBackUndo.ok = ok(out.astraBackUndo.undo?.turn && !out.astraBackUndo.undoneDiff.length && !out.astraBackUndo.redoneDiff.length, `Astra backstage: one ↶ / ↷ (${[...out.astraBackUndo.undoneDiff, ...out.astraBackUndo.redoneDiff].join(' | ')})`);
  ok(/what (Claude|Astra) did in one reply/.test(out.claudeOnUndo.undo?.label || ''), `the undo says what it took back (${out.claudeOnUndo.undo?.label})`);

  // same results on screen and backstage: the scenes, and every call's words
  for (const [on, bk, who] of [['claudeOn', 'claudeBack', 'Claude'], ['astraOn', 'astraBack', 'Astra']]) {
    const d = diffData(runs[on].after, runs[bk].after);
    out[`${who}Same`] = d;
    ok(!d.length, `${who}: the scene on screen and the one backstage end the same (${d.join(' | ')})`);
    const wa = runs[on].answers.map((a) => a.applied || ''); const wb = runs[bk].answers.map((a) => a.applied || '');
    const words = wa.map((x, i) => (x === wb[i] ? null : `${STEP[i] || i}: "${x}" vs "${wb[i]}"`)).filter(Boolean);
    out[`${who}Words`] = words;
    ok(!words.length && wa.length === wb.length, `${who}: the same words on screen and backstage (${words.join(' | ')})`);
  }
  ok(!diffData(runs.claudeOn.after, runs.astraOn.after).length, `Claude and Astra end the same (${diffData(runs.claudeOn.after, runs.astraOn.after).join(' | ')})`);
  ok(JSON.stringify(initial.layers.map((L) => L.name)) === '["Base"]', 'the scenes started with one layer');
  out.sample = runs.claudeBack.after.layers.map((L) => ({ name: L.name, keys: Object.keys(L.keys), look: L.look, lanes: L.lanes })).concat([{ refs: runs.claudeBack.after.refs, cues: runs.claudeBack.after.cues, timeline: runs.claudeBack.after.timeline }]);

  // latency: each call's time on screen vs backstage (the same reply)
  const lat = {};
  for (const [on, bk, who] of [['claudeOn', 'claudeBack', 'claude'], ['astraOn', 'astraBack', 'astra']]) {
    const A = runs[on].times; const B = runs[bk].times;
    const sum = (L) => L.reduce((n, x) => n + (x.ms || 0), 0);
    const per = A.map((x, i) => ({ tool: STEP[i] || x.tool, on: x.ms, back: B[i]?.ms }));
    lat[who] = { onMs: sum(A), backMs: sum(B), ratio: +(sum(B) / Math.max(1, sum(A))).toFixed(2), warmRatio: +(sum(B.slice(1)) / Math.max(1, sum(A.slice(1)))).toFixed(2), per };
    ok(lat[who].ratio <= 1.5, `${who}: backstage calls take ≤ 1.5× on screen (${lat[who].backMs} ms vs ${lat[who].onMs} ms: ${lat[who].ratio}×)`);
  }
  out.latency = lat;

  // (round 74, labcalls74) every hop of every call: the end-to-end time (the engine's MCP server in → out), where it went
  const hopRows = {}; const hopSum = {};
  for (const [k, r] of Object.entries(runs)) {
    const side = /Back$/.test(k) ? 'back' : 'on';
    hopRows[k] = r.times.map((x, i) => {
      const h = x.hops || {};
      const steps = Object.entries(h.steps || {}).filter(([, v]) => v >= 5).map(([n, v]) => `${n} ${Math.round(v)}`).join(', ');
      return { step: STEP[i] || x.tool, total: h.total ?? x.ms, window: h.window ?? x.ms, wire: h.total != null && h.window != null ? h.total - h.window : null, picture: PICTURE.test(STEP[i] || '') || x.image > 0, steps };
    });
    const plain = hopRows[k].filter((x) => !x.picture);
    const pics = hopRows[k].filter((x) => x.picture);
    hopSum[k] = { side, median: med(plain.map((x) => x.total)), max: Math.max(...plain.map((x) => x.total).filter(Number.isFinite)), wireMedian: med(hopRows[k].map((x) => x.wire)), pictures: pics.map((x) => `${x.step} ${x.total} ms`), calls: plain.length };
    ok(hopSum[k].median != null && hopSum[k].median <= BUDGET[side], `${k}: median call (no picture) ${hopSum[k].median} ms ≤ ${BUDGET[side]} ms ${side === 'on' ? 'on screen' : 'backstage'}`);
    ok(hopRows[k].every((x) => x.total != null && x.window != null), `${k}: every call has its hop times (MCP server → main → window → back)`);
  }
  out.hops = hopRows;
  out.hopSummary = hopSum;

  // ---------- a tool error never leaves a half-applied scene ----------
  const rb = {};
  for (const [key, agent, sceneId, showId] of [['claudeOn', C, IDS.c_on, IDS.c_on], ['claudeBack', C, IDS.c_bk, IDS.c_on], ['astraBack', AS, IDS.a_bk, IDS.a_on]]) {
    if (S().currentId() !== showId) { S().open(showId); await until(() => S().currentId() === showId, 6000); await wait(1200); }
    const chatId = runs[key].chatId;
    activate(agent.id); Native.open(agent.id, chatId); await wait(300); activate('tool:three'); await wait(300);
    const before = await dataOf(sceneId);
    const t1 = await turn(agent.id, mcp([['three_do', { cmd: 'batch', ops: [{ cmd: 'keyframes', layer: 'Base', property: 'x', keys: [{ time: 0, value: 0 }, { time: 1, value: 10 }] }, { cmd: 'material', op: 'set', layer: 'Base', preset: 'nope' }] }]]));
    const mid = await dataOf(sceneId);
    LabTxn._test.failNested('three_keyframes', 2);
    const t2 = await turn(agent.id, mcp([['three_do', { cmd: 'model', op: 'move', preset: 'hero', at: 0, secs: 4 }]]));
    const end = await dataOf(sceneId);
    const ans = (answers.get(chatId) || []).slice(-2);
    rb[key] = { batch: diffData(mid, before), batchSaid: /Nothing was left half-done/.test(t1.m?.text || '') || /Nothing was left half-done/.test(JSON.stringify(ans[0] || {})), move: diffData(end, before), moveSaid: /Nothing was left half-done/.test(ans[1]?.error || ''), moveError: (ans[1]?.error || '').slice(0, 160) };
    ok(!rb[key].batch.length, `${key}: a batch whose 2nd op failed left the scene as it was (${rb[key].batch.join(' | ')})`);
    ok(rb[key].batchSaid, `${key}: …and said so`);
    ok(!rb[key].move.length && ans[1]?.ok === false, `${key}: a camera move whose 2nd keyframe call failed left the scene as it was (${rb[key].move.join(' | ')})`);
    ok(rb[key].moveSaid, `${key}: …and said so in words (${rb[key].moveError})`);
  }
  out.rollback = rb;
  out.txn = LabTxn.stats;
  out.backstageTiming = ThreeBackstage.timing;
  // every error the AIs got today was a sentence
  out.aiErrors = HubBridge.log().filter((e) => e.error).map((e) => `${e.tool}: ${e.error.slice(0, 100)}`);
  ok(out.aiErrors.every((e) => !/undefined|TypeError|ReferenceError|at \w+ \(/.test(e)), `errors in words (${out.aiErrors.join(' | ')})`);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
