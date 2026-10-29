// (round 80, laberrors80) A scene's health flows back to the chat that works on it. A plain Claude chat (fake engine,
// real MCP calls) is linked to a scene on screen; a second one to a scene backstage. Each kind of problem is put into
// the scene AFTER a call (by another hand, through HubBridge.call, so the chat's AI didn't see it): a layer that throws
// on every frame, a shader that doesn't compile, a camera gone NaN, a file that 404s, a lost WebGL context. Checks:
//   · healthy: no "health:" line, and the very same answer (same characters, same tokens) as with the feature off;
//     the preview pages sent no health message at all
//   · each kind: the chat's next call answers with one "health:" line in plain words (layer name, line, how often);
//     the call after that doesn't repeat it
//   · the layer that throws every frame is paused by the page (a note over the preview with ▶ Resume, the other
//     layer keeps drawing, the console holds the error once, not per frame); ▶ Resume runs it again (and it pauses again)
//   · the "⚠ Scene error in Neon · Ask Claude to fix" note shows under the reply, never sends by itself; its click sends
//     a message with the error and the layer's code around the line; fixing the layer takes the note away
//   · the same health line backstage (the scene not on screen)
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 600000 --script dev/checks/laberrors80.js --shot /tmp/laberrors80.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const HEAD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
scene.add(new THREE.AmbientLight(0xffffff, 1));`;
const BASE = `${HEAD}
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 16, 64), new THREE.MeshStandardMaterial({ color: '#ff3d7f' }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000; renderer.render(scene, camera); });`;
// throws on every frame from its 20th (NEON_LINE: "const hit = probe.missing.x;")
const NEON = `${HEAD}
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#3dffd0' }));
scene.add(mesh);
let n = 0; const probe = {};
function loop() {
  requestAnimationFrame(loop);
  n += 1;
  mesh.rotation.y = n / 60;
  renderer.render(scene, camera);
  if (n > 20) {
    const hit = probe.missing.x;
  }
}
loop();`;
const NEON_LINE = NEON.split('\n').findIndex((l) => l.includes('probe.missing.x')) + 1;
const GLASS = `${HEAD}
const mat = new THREE.ShaderMaterial({ fragmentShader: 'void main() { gl_FragColor = vec4(fooBar80, 1.0); }' });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const CAM = `${HEAD}
scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial()));
let k = 0;
renderer.setAnimationLoop(() => { k += 1; if (k === 10) camera.position.x = 0 / 0; renderer.render(scene, camera); });`;
const TEX = `${HEAD}
const tex = new THREE.TextureLoader().load('missing-tex-80.png');
fetch('missing-data-80.json').catch(() => {});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex })));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const S = () => ThreeLab.scenes;
async function turn(agentId, text, ms = 120000) {
  await Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  await until(() => !Native.isBusy(chatId), ms);
  await wait(300);
  return chatId;
}
const mcp = (calls) => `mcp please\nmcp: ${JSON.stringify(calls)}`;
// what the AI read: every result of that chat's calls, as the MCP server formats it
const seen = [];
const textOf = (r) => (r.ok === false ? `Error: ${r.error}` : HubBridge.fmtText(r.value));
async function calls(agentId, chatId, list) {
  const n = seen.length;
  activate(agentId); Native.open(agentId, chatId); await wait(200); activate('tool:three'); await wait(200);
  await turn(agentId, mcp(list));
  await wait(200);
  const mine = seen.slice(n).filter((x) => x.chatId === chatId);
  const log = HubBridge.log().filter((e) => e.chatId === chatId && !e.running).slice(-list.length);
  return { texts: mine.map((x) => x.text), tokens: log.map((e) => e.tokens), health: mine.map((x) => /\nhealth: (.*)$|^health: (.*)$/m.exec(x.text)).filter(Boolean).map((m) => m[1] || m[2]) };
}
const recsOf = (id) => LabHealth.state(id);

try {
  const C = H.agent('claude');
  ok(C, 'the default Claude agent');
  C.threeTools = true; await saveConfig(); await wait(600);
  const IDS = { on: 's80on', back: 's80bk' };
  const prev = (await window.hub.kvGet('three-sketches', null)) || [];
  const mk = (id, name) => ({ id, name, code: BASE, updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: BASE, visible: true, opacity: 1, blend: 'normal', slot: 0 }] });
  await window.hub.kvSet('three-sketches', [...prev.filter((x) => !Object.values(IDS).includes(x.id)), mk(IDS.on, 'Health on'), mk(IDS.back, 'Health back')]);
  store.set('three.current', IDS.on);
  activate('tool:three'); await wait(400);
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
  await until(() => S().currentId() === IDS.on, 8000); await wait(2500);
  ok(await until(() => typeof LabHealth !== 'undefined', 5000), 'LabHealth loaded with the Lab');
  HubBridge.onResult((x) => { seen.push({ chatId: x.chatId, tool: x.tool, text: textOf(x.result) }); });
  // count every health message the preview pages send (healthy: none)
  let healthMsgs = 0;
  const fb = LabHealth.fromBox; LabHealth.fromBox = (m, ...a) => { healthMsgs += 1; return fb(m, ...a); };

  activate(C.id); await wait(300);
  Native.newChat(C.id); await wait(300);
  const chat = await turn(C.id, 'hello there');
  ChatScenes.linkGuest(chat, IDS.on);
  activate('tool:three'); await wait(800);

  // ---------- healthy: nothing added ----------
  const HEALTHY = [['three_read_code', { layer: 'Base', from: 1, to: 6, force: true }], ['three_search_code', { pattern: 'rotation' }]];
  LabHealth.off = true;
  await calls(C.id, chat, HEALTHY); // (primes the reads: a read the AI already has answers in one line)
  const offRun = await calls(C.id, chat, HEALTHY);
  LabHealth.off = false;
  const onRun = await calls(C.id, chat, HEALTHY);
  out.healthy = { off: offRun.texts.map((t) => t.length), on: onRun.texts.map((t) => t.length), tokensOff: offRun.tokens, tokensOn: onRun.tokens };
  ok(onRun.texts.length === 2 && !onRun.health.length, `healthy: no health line (${onRun.health.join(' | ')})`);
  if (!ok(JSON.stringify(offRun.texts) === JSON.stringify(onRun.texts), 'healthy: the same answers with the feature on and off')) out.healthyTexts = { off: offRun.texts, on: onRun.texts };
  ok(JSON.stringify(offRun.tokens) === JSON.stringify(onRun.tokens), `healthy: the same tokens with the feature on and off (${offRun.tokens} vs ${onRun.tokens})`);
  ok(healthMsgs === 0 && !recsOf(IDS.on).length, `healthy: the preview sent no health message (${healthMsgs})`);
  ok(!document.querySelector('.msg.note[data-note-id="scene-health"]'), 'healthy: no scene error note');

  // ---------- a layer that throws on every frame ----------
  const add = (name, code, chatId = chat) => HubBridge.call('three_add_layer', { name, code }, { chatId });
  const consoleBefore = document.querySelectorAll('.console-row.error').length;
  const a1 = await add('Neon', NEON);
  out.addNeon = a1?.ok !== false;
  const paused = await until(() => recsOf(IDS.on).find((r) => r.paused), 30000);
  ok(paused, 'Neon was paused after throwing on every frame');
  out.neon = paused && { message: paused.message, line: paused.line, count: paused.count, frames: paused.frames, everyFrame: paused.everyFrame };
  ok(paused?.line === NEON_LINE, `the error's line is the layer's line ${NEON_LINE} (${paused?.line})`);
  const pill = document.querySelector('.lab-health-pill');
  ok(pill && /Neon is paused/.test(pill.textContent) && [...pill.querySelectorAll('button')].some((b) => /Resume/.test(b.textContent)), `a note over the preview says Neon is paused, with ▶ Resume (${pill?.textContent})`);
  const errRows = [...document.querySelectorAll('.console-row.error')].slice(consoleBefore).filter((r) => /missing/.test(r.textContent));
  ok(errRows.length <= 2, `the console holds the error once, not per frame (${errRows.length} rows)`);
  // the chat's next call: one health line
  const r1 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  out.health1 = r1.health;
  ok(r1.health.length === 1 && /layer "Neon" throws TypeError/.test(r1.health[0]) && r1.health[0].includes(`line ${NEON_LINE}`) && /every frame since \d+ s/.test(r1.health[0]) && /paused after \d+ frames/.test(r1.health[0]), `the next call says: layer Neon throws TypeError at its line every frame since N s (paused) (${r1.health[0]})`);
  const r2 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  ok(!r2.health.length, `the call after that doesn't repeat it (${r2.health.join(' | ')})`);
  // the note under the reply (never sent by itself)
  const note = await until(() => document.querySelector('.msg.note[data-note-id="scene-health"]'), 5000);
  const btn = note && [...note.querySelectorAll('.note-acts button')].find((b) => /Ask Claude to fix/.test(b.textContent));
  ok(note && /Scene error in/.test(note.textContent) && /Neon/.test(note.textContent) && btn, `a "⚠ Scene error in Neon · Ask Claude to fix" note under the reply (${note?.textContent})`);
  const msgsBefore = (await Native.load(chat)).messages.length;
  await wait(1500);
  ok((await Native.load(chat)).messages.length === msgsBefore, 'the note sent nothing by itself');
  if (btn) {
    btn.click();
    await wait(500);
    await until(() => !Native.isBusy(chat), 60000);
    const msgs = (await Native.load(chat)).messages;
    const asked = msgs.slice().reverse().find((m) => m.role === 'user');
    out.asked = asked?.text?.slice(0, 600);
    ok(asked && /Neon/.test(asked.text) && /throws TypeError/.test(asked.text) && new RegExp(`${NEON_LINE}> +const hit = probe\\.missing\\.x;`).test(asked.text) && /Please fix it/.test(asked.text), `one click sent the error and the code around line ${NEON_LINE}`);
    ok(!document.querySelector('.msg.note[data-note-id="scene-health"]'), 'the note went once used');
  }
  // ▶ Resume: it runs again and, still broken, pauses again
  const id = paused?.layer;
  const pauses = LabHealth.stats.paused;
  if (pill) [...pill.querySelectorAll('button')].find((b) => /Resume/.test(b.textContent))?.click();
  ok(!document.querySelector('.lab-health-pill'), 'Resume took the note away');
  ok(await until(() => LabHealth.stats.paused > pauses, 30000), 'resumed, it threw on every frame again and was paused again');
  // the fix: an edit re-runs it, its problems go, and the chat's note too
  const fx = await HubBridge.call('three_edit_code', { layer: 'Neon', edits: [{ find: 'const hit = probe.missing.x;', replace: 'const hit = 1;' }] }, { chatId: chat });
  ok(fx?.ok !== false, `the fix applied (${fx?.error || ''})`);
  ok(await until(() => !recsOf(IDS.on).some((r) => r.layer === id), 15000), 'fixed: Neon\'s problems are gone');
  ok(await until(() => !document.querySelector('.lab-health-pill'), 3000), 'fixed: no paused note over the preview');
  const r3 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  ok(!r3.health.length, `fixed: no health line (${r3.health.join(' | ')})`);
  ok(await until(() => !document.querySelector('.msg.note[data-note-id="scene-health"]'), 3000), 'fixed: no scene error note');

  // ---------- a shader that doesn't compile ----------
  await add('Glass', GLASS);
  const sh = await until(() => recsOf(IDS.on).find((r) => r.kind === 'shader'), 20000);
  out.shader = sh?.message;
  ok(sh && /shader didn't compile/.test(sh.message) && /fooBar80/.test(sh.message), `a shader error in plain words (${sh?.message})`);
  const r4 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  out.health4 = r4.health;
  ok(r4.health.length === 1 && /layer "Glass": .*shader didn't compile.*fooBar80/.test(r4.health[0]), `the next call says Glass's shader didn't compile (${r4.health[0]})`);

  // ---------- a camera gone NaN ----------
  await add('Cam', CAM);
  const cam = await until(() => recsOf(IDS.on).find((r) => r.kind === 'camera'), 20000);
  ok(cam && /camera went NaN/.test(cam.message), `a NaN camera is noticed (${cam?.message})`);
  const r5 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  out.health5 = r5.health;
  ok(r5.health.length === 1 && /layer "Cam": the camera went NaN: its position is NaN/.test(r5.health[0]) && !/Glass/.test(r5.health[0]), `the next call says Cam's camera went NaN (only that) (${r5.health[0]})`);

  // ---------- a file that doesn't load ----------
  await add('Tex', TEX);
  const as = await until(() => recsOf(IDS.on).filter((r) => r.kind === 'asset').length >= 2 && recsOf(IDS.on).filter((r) => r.kind === 'asset'), 20000);
  out.assets = (as || []).map((r) => `${r.layer ? 'layer' : 'page'}: ${r.message}`);
  ok(as && as.some((r) => /missing-tex-80\.png/.test(r.message)) && as.some((r) => /missing-data-80\.json/.test(r.message)), `the missing picture and file are noticed (${out.assets.join(' | ')})`);
  const r6 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  out.health6 = r6.health;
  ok(r6.health.length === 1 && /didn't load/.test(r6.health[0]) && /missing-/.test(r6.health[0]), `the next call says a file didn't load (${r6.health[0]})`);

  // ---------- backstage: the same, on a scene not on screen ----------
  activate(C.id); Native.newChat(C.id); await wait(300);
  const chat2 = await turn(C.id, 'hello again');
  ChatScenes.linkGuest(chat2, IDS.back);
  activate('tool:three'); await wait(500);
  await add('Neon', NEON, chat2);
  const bp = await until(() => recsOf(IDS.back).find((r) => r.paused || r.everyFrame), 30000);
  ok(bp && bp.src === 'backstage', `backstage: Neon throwing every frame is noticed (${bp?.src})`);
  const r7 = await calls(C.id, chat2, [['three_do', { cmd: 'layers' }]]);
  out.health7 = r7.health;
  ok(r7.health.length === 1 && /layer "Neon" throws TypeError/.test(r7.health[0]) && /every frame/.test(r7.health[0]), `backstage: the next call says it too (${r7.health[0]})`);
  ok(S().currentId() === IDS.on, 'the Lab kept showing the scene on screen');
  // the on-screen chat isn't told about the backstage scene
  const r8 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  ok(!r8.health.some((h) => /Neon/.test(h)), `the other chat isn't told about another scene (${r8.health.join(' | ')})`);

  // ---------- a lost WebGL context (last: the preview rebuilds itself) ----------
  activate('tool:three'); await wait(300);
  await HubBridge.call('three_eval', { code: "window.__glRecover.lose({ restore: 300 }); return 'lost';" }, { chatId: chat });
  const gl = await until(() => recsOf(IDS.on).find((r) => r.kind === 'gpu'), 15000);
  ok(gl, 'a lost WebGL context is noticed');
  await until(() => recsOf(IDS.on).find((r) => r.kind === 'gpu' && r.ok), 15000);
  const r9 = await calls(C.id, chat, [['three_do', { cmd: 'layers' }]]);
  out.health9 = r9.health;
  ok(r9.health.length === 1 && /lost its graphics context/.test(r9.health[0]), `the next call says the preview lost its graphics context (${r9.health[0]})`);

  out.stats = LabHealth.stats;
  out.healthMsgs = healthMsgs;
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
