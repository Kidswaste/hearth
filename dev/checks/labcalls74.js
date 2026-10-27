// (round 74, labcalls74) One Lab tool call, end to end, for each common tool: a plain Claude chat runs the same reply of
// real MCP calls (fake engine → mcp/three-mcp.js → gamebridge.js → this window → the handler → the preview page → back)
// three times on a scene shown in the Lab and three times on an identical scene backstage. Every call's hops are
// timed (bridge.js HubBridge.hopsOf: the MCP server, its HTTP request, main, the IPC to this window, the handler's steps
// — the scene noted, routed, the page's first frame, the picture — and the way back). Reports the median per tool and
// per hop, on screen and backstage. Budget: the median call that sends no picture ≤ 400 ms on screen, ≤ 600 ms
// backstage; picture calls report their own cost (the "picture" step).
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 900000 --script dev/checks/labcalls74.js --shot /tmp/labcalls74.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const LAYER = (name, color, z = '5') => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' }, color: { value: '${color}', label: 'Color' }, spin: [0.4, -2, 2] });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = ${z};
scene.add(new THREE.AmbientLight(0xffffff, 1));
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 16, 64), new THREE.MeshStandardMaterial({ color: P.color }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000 * P.spin; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
const S = () => ThreeLab.scenes;
async function turn(agentId, text, ms = 240000) {
  await Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  await until(() => !Native.isBusy(chatId), ms);
  await wait(300);
  const chat = await Native.load(chatId);
  const m = chat.messages.at(-1);
  const lines = (String(m?.text || '').split('MCP calls:')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !/^(servers|server) /.test(l));
  return { chatId, lines, errors: lines.filter((l) => /^[\w]+: ERROR/.test(l)) };
}
const mcp = (calls) => `mcp please\nmcp: ${JSON.stringify(calls)}`;
// the common tools, as an AI uses them (k: the round, so each edit changes something)
const REPLY = (k) => [
  ['layers', ['three_do', { cmd: 'layers' }]],
  ['read_code', ['three_read_code', { layer: 'Base', from: 1, to: 12 }]],
  ['search_code', ['three_search_code', { pattern: 'mesh.rotation' }]],
  ['console', ['three_console', {}]],
  ['sliders set', ['three_sliders', { layer: 'Base', set: { size: +(1.1 + k * 0.1).toFixed(2) } }]],
  ['update_layer props', ['three_update_layer', { layer: 'Base', settings: { opacity: +(0.9 - k * 0.1).toFixed(2) } }]],
  ['edit_code', ['three_edit_code', { layer: 'Base', edits: [{ find: `camera.position.z = ${k ? `5.${k}` : '5'};`, replace: `camera.position.z = 5.${k + 1};` }] }]],
  ['keyframes', ['three_do', { cmd: 'keyframes', layer: 'Base', property: 'opacity', keys: [{ time: 0, value: 1 }, { time: 2 + k, value: 0.5 }] }]],
  ['animate preset', ['three_do', { cmd: 'animate', layer: 'Base', preset: k % 2 ? 'pulse' : 'fadeIn' }]],
  ['timeline cue', ['three_do', { cmd: 'timeline_edit', cues: { add: [{ time: 1 + k, name: `Cue ${k}` }] } }]],
  ['material set', ['three_do', { cmd: 'material', op: 'set', layer: 'Base', preset: k % 2 ? 'chrome' : 'gold' }]],
  ['add_layer', ['three_add_layer', { name: `Ring ${k}`, code: LAYER(`Ring ${k}`, '#3dd0ff') }]],
  ['remove_layer', ['three_do', { cmd: 'remove_layer', layer: `Ring ${k}` }]],
  ['screenshot', ['three_screenshot', { size: 'small' }]],
];
const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : null; };
const BUDGET = { on: 400, back: 600 };
const ROUNDS = Number(window.LABCALLS_ROUNDS) || 3;

try {
  const C = H.agent('claude');
  ok(C, 'the default Claude agent');
  C.threeTools = true; await saveConfig(); await wait(600);
  const IDS = { on: 's74on', back: 's74bk' };
  const prev = (await window.hub.kvGet('three-sketches', null)) || [];
  const mk = (id, name) => ({ id, name, code: LAYER('Base', '#ff3d7f'), updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: LAYER('Base', '#ff3d7f'), visible: true, opacity: 1, blend: 'normal', slot: 0 }] });
  await window.hub.kvSet('three-sketches', [...prev.filter((x) => !Object.values(IDS).includes(x.id)), mk(IDS.on, 'Calls on'), mk(IDS.back, 'Calls back')]);
  store.set('three.current', IDS.on);
  activate('tool:three'); await wait(400);
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
  await until(() => S().currentId() === IDS.on, 8000); await wait(2500);
  await until(() => typeof LabTxn !== 'undefined', 5000);
  ok(HubBridge.hopsOf, 'HubBridge times each hop');

  const rows = { on: [], back: [] };
  const chats = {};
  for (const side of ['on', 'back']) {
    activate(C.id); await wait(300);
    Native.newChat(C.id); await wait(300);
    const hello = await turn(C.id, 'hello there');
    chats[side] = hello.chatId;
    ChatScenes.linkGuest(hello.chatId, IDS[side]);
    activate('tool:three'); await wait(500);
    for (let k = 0; k < ROUNDS; k += 1) {
      activate(C.id); Native.open(C.id, hello.chatId); await wait(200); activate('tool:three'); await wait(300);
      const steps = REPLY(k);
      const t = await turn(C.id, mcp(steps.map((x) => x[1])));
      ok(!t.errors.length && t.lines.length >= steps.length, `${side} round ${k + 1}: every call worked (${t.errors.join(' | ') || t.lines.length})`);
      await wait(200);
      const log = HubBridge.log().filter((e) => e.chatId === hello.chatId && !e.running).slice(-steps.length);
      for (const [i, e] of log.entries()) rows[side].push({ tool: steps[i]?.[0] || e.tool, k, ms: e.ms, image: e.image || 0, hops: HubBridge.hopsOf(e) });
    }
    ok(S().currentId() === IDS.on, `${side}: the Lab kept showing the "on screen" scene`);
  }

  // per tool: median end to end, median per hop and per step (on screen | backstage)
  const HOPS = ['mcp', 'toHub', 'hubRead', 'toWindow', 'window', 'toHubBack', 'hubReply', 'toMcp', 'mcpOut'];
  const table = {};
  for (const [name] of REPLY(0)) {
    table[name] = {};
    for (const side of ['on', 'back']) {
      const R = rows[side].filter((r) => r.tool === name);
      const hops = Object.fromEntries(HOPS.map((h) => [h, med(R.map((r) => r.hops?.[h]))]));
      const stepNames = [...new Set(R.flatMap((r) => Object.keys(r.hops?.steps || {})))];
      const steps = Object.fromEntries(stepNames.map((s) => [s, med(R.map((r) => r.hops?.steps?.[s] ?? 0))]).filter(([, v]) => v >= 3));
      table[name][side] = { total: med(R.map((r) => r.hops?.total ?? r.ms)), picture: R.some((r) => r.image > 0), wire: (hops.mcp || 0) + (hops.toHub || 0) + (hops.hubRead || 0) + (hops.toWindow || 0) + (hops.toHubBack || 0) + (hops.hubReply || 0) + (hops.toMcp || 0) + (hops.mcpOut || 0), hops, steps };
    }
  }
  out.table = Object.fromEntries(Object.entries(table).map(([n, x]) => [n, `on ${x.on.total} ms${x.on.picture ? ' (picture)' : ''} · back ${x.back.total} ms${x.back.picture ? ' (picture)' : ''} · wire ${x.on.wire}/${x.back.wire} ms · on: ${Object.entries(x.on.steps).map(([s, v]) => `${s} ${v}`).join(', ')} · back: ${Object.entries(x.back.steps).map(([s, v]) => `${s} ${v}`).join(', ')}`]));
  out.detail = table;
  for (const side of ['on', 'back']) {
    const plain = rows[side].filter((r) => !r.image && r.tool !== 'screenshot');
    const pics = rows[side].filter((r) => r.image || r.tool === 'screenshot');
    const m = med(plain.map((r) => r.hops?.total ?? r.ms));
    out[`${side}Median`] = m;
    out[`${side}PictureMedian`] = med(pics.map((r) => r.hops?.total ?? r.ms));
    out[`${side}PictureStep`] = med(pics.map((r) => r.hops?.steps?.picture ?? null));
    out[`${side}Calls`] = { plain: plain.length, pictures: pics.length };
    ok(m != null && m <= BUDGET[side], `${side === 'on' ? 'on screen' : 'backstage'}: the median call that sends no picture took ${m} ms (budget ${BUDGET[side]} ms)`);
    ok(rows[side].every((r) => r.hops && Number.isFinite(r.hops.total) && Number.isFinite(r.hops.window)), `${side}: every call has its hop times`);
  }
  out.wire = { on: med(rows.on.map((r) => (r.hops?.total ?? 0) - (r.hops?.window ?? 0))), back: med(rows.back.map((r) => (r.hops?.total ?? 0) - (r.hops?.window ?? 0))) };
  out.txn = LabTxn.stats;
  out.backstageTiming = ThreeBackstage.timing;
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
