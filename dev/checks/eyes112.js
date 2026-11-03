// (round 112, eyes112) What the AI actually sees of the Lab: three_screenshot and three_layers (tools/three-director.js)
// in realscene-lib's real scene (dev/checks/realscene-lib.js: the bundled "Beat burst" demo, a textured 🧊 model, a beat
// rig with six frame loops, ✦ Bloom on top, a 124 bpm song with ⚡ triggers, playing). Files in the check's own temp
// folder; no owner data, no owner scenes. Parts:
//   truth     the AI's picture against the pixels on screen (the compositor's capture of the preview), on a still
//             layer under ✦ Bloom: bloom on, off, back; a layer at half opacity in screen blend. Size and frame line.
//   music     plain looks while the song plays: taken on the next kick (the scene reacts to sound), how long that waited,
//             against looks taken at once (on: "now"); the strip (frames: 4) over one bar, 2 across; at: "kick" (no
//             hand-placed markers: the analysis's kicks)
//   compare   two chats on the same scene: each chat's "before" is its own previous look; a chat with none gets the
//             scene's last look, said so
//   layers    three_layers says the scene's errors, its 🧊 model loaded with sharp textures, that the song moves it; a
//             layer that throws is named; its size in tokens
//   fresh     the next look after an edit, an Undo, a ▶ Apply (LabChatLink.apply) and its undo shows the new state (the
//             colour of a still square); a new 🧊 model layer looked at right away (held for its shaders, textures
//             going up): the look waits, or says so
//   cost      KB and image tokens per kind of look
// window.EYES112_REPORT = 1 only reports (for a base without this round: the "before").
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/eyes112.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const REPORT = Boolean(window.EYES112_REPORT);
const R = { ok: [], fails: [], info: {} };
const ok = (c, m) => { (c || REPORT ? R.ok : R.fails).push(m); return Boolean(c); };
const tok = (s) => Math.ceil(String(s ?? '').length / 4);
const safe = async (name, fn) => { try { await fn(); } catch (err) { R.fails.push(`${name}: threw ${String(err?.stack || err).slice(0, 500)}`); } };

const info = await RS.open({ size: [640, 360] });
ok(info.layers.length >= 5 && info.model?.loaded && info.song, `the real scene is up: ${info.layers.join(', ')} · model ${info.model?.loaded} · song ${info.song}`);
const D = ThreeLab.director;
const c = await ThreeLab.cmd();
const sceneId = D.codeOf().sketchId;
// one look as the AI gets it: its text, the picture's size, KB and image tokens
async function look(tool, args = {}, chatId = null) {
  const t0 = performance.now();
  const r = await HubBridge.call(tool, args, chatId ? { chatId } : {});
  const ms = Math.round(performance.now() - t0);
  const im = r.images?.[0];
  let dims = null;
  if (im) { const img = new Image(); img.src = `data:${im.mime};base64,${im.data}`; await img.decode(); dims = [img.width, img.height]; }
  const text = typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? r.error ?? '');
  return { ms, ok: r.ok !== false, text, value: r.value, error: r.error || null, dims, kb: im ? Math.round((im.data.length * 0.75) / 102.4) / 10 : 0, tok: im ? await HubBridge.imageTokens(im) : 0, textTok: tok(text), im };
}
const brief = (x) => ({ ms: x.ms, ok: x.ok, text: x.text.slice(0, 220), dims: x.dims, kb: x.kb, tok: x.tok, textTok: x.textTok });
const decode = async (b64, mime = 'image/png') => { const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode(); return img; };
// a 64×36 grid of a picture (for comparing two pictures) and its mean colour
async function grid(b64, mime) {
  const img = await decode(b64, mime); const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 64, 36); const px = g.getImageData(0, 0, 64, 36).data;
  let r = 0; let gg = 0; let b = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4; return { w: img.width, h: img.height, mean: [r / n, gg / n, b / n].map(Math.round), lum: Math.round(((0.3 * r + 0.59 * gg + 0.11 * b) / n) * 10) / 10, px };
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return Math.round((s / ((a.length / 4) * 3)) * 10) / 10; };
// one pixel of a picture at (u, v) in 0..1
async function pixel(im, u, v) { const img = await decode(im.data, im.mime); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const p = g.getImageData(Math.round(img.width * u), Math.round(img.height * v), 1, 1).data; return [p[0], p[1], p[2]]; }
const blueish = (p) => p[2] > 150 && p[2] > p[0] + 60;
const reddish = (p) => p[0] > 150 && p[0] > p[2] + 60;
// the preview as it is on screen: the compositor's own capture of the Lab's preview
const frameEl = () => document.querySelector('iframe.three-frame');
async function screenTruth() { const rect = frameEl().getBoundingClientRect(); const r = await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } } }); return r?.result?.data || r?.data || null; }
// chats with their own "already said" memory, as a reply's send makes them
const chat = (id) => { ThreeDirector.newTurn(id, { id, session: { id: `s-${id}` } }); return id; };
const MOVING = ['Backdrop', 'Beat burst', '🧊 RS bot', 'Beat rig'];
const STILL = (col) => `import * as THREE from 'three';
// eyes112: a still picture (no motion): a coloured square, a white bar, a small green square on a dark blue ground
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#101830');
const camera = new THREE.OrthographicCamera(-1.78, 1.78, 1, -1, 0.1, 10); camera.position.z = 5;
const add = (x, y, w, h, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, 0); scene.add(m); };
add(-1, 0.3, 0.8, 0.8, '${col}'); add(0.6, -0.2, 1.0, 0.5, '#ffffff'); add(1.2, 0.6, 0.3, 0.3, '#20ff40');
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const SQ = [0.22, 0.35]; // the coloured square's middle in the frame
const cost = {};

// ---------- music: looks while the song plays ----------
await safe('music', async () => {
  await wait(2000);
  const X = chat('eyes-music');
  const lum = { synced: [], now: [] }; const pics = { synced: [], now: [] }; const texts = []; const age = { synced: [], now: [] };
  // a probe in the preview page (this check's only): when the ⚡ kick fired last, and how long after it each picture
  // the preview encodes was made (smallShot merges the layers, then toBlob): the picture's age after the kick
  await RS.pv(`if (!window.__eyesProbe) { const P = window.__eyesProbe = { ages: [], last: -1e9, pk: 0 }; const A = globalThis.audio;
setInterval(() => { const k = Number(A.trigger('kick')) || 0; if (k > 0.75 && k > P.pk + 0.2) P.last = performance.now(); P.pk = k; }, 3);
const tb = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (...a) { P.ages.push(Math.round(performance.now() - P.last)); return tb.apply(this, a); }; } window.__eyesProbe.ages = []; return 1`);
  const ageOf = async () => { const v = await RS.pj('window.__eyesProbe.ages.splice(0)'); return Array.isArray(v) && v.length ? v.at(-1) : null; };
  const m0 = ThreeDirector.moments?.() || null;
  for (let i = 0; i < 6; i += 1) {
    await ageOf();
    const a = await look('three_screenshot', { force: true }, X); texts.push(a.text);
    age.synced.push(await ageOf());
    if (a.im) { const g = await grid(a.im.data, a.im.mime); lum.synced.push(g.lum); pics.synced.push(g.px); }
    if (!i) cost.small = brief(a);
    await wait(150 + i * 97); // (looks asked at any moment of the beat)
    await ageOf();
    const b = await look('three_screenshot', { force: true, on: 'now' }, X);
    age.now.push(await ageOf());
    if (b.im) { const g = await grid(b.im.data, b.im.mime); lum.now.push(g.lum); pics.now.push(g.px); }
    await wait(120 + i * 61);
  }
  const fps = await RS.pj('window.__labPace ? window.__labPace.state() : null').catch(() => null);
  const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  R.info.kickAge = { synced: age.synced, now: age.now, median: { synced: med(age.synced), now: med(age.now) }, beatMs: 484, page: fps && { fps: fps.fps ?? null, drawn: fps.drawn ?? null } };
  const m1 = ThreeDirector.moments?.() || null;
  const spread = (list) => { let s = 0; let n = 0; for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) { s += diff(list[i], list[j]); n += 1; } return n ? Math.round((s / n) * 10) / 10 : null; };
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  const onKick = texts.filter((t) => /Taken on a (kick|beat)/.test(t)).length;
  R.info.music = { texts: texts.map((t) => t.slice(0, 160)), onKick, lum, avgLum: { synced: avg(lum.synced), now: avg(lum.now) }, spread: { synced: spread(pics.synced), now: spread(pics.now) }, moments: m1 && m0 ? { asked: m1.asked - m0.asked, hit: m1.hit - m0.hit, msPerHit: m1.hit > m0.hit ? Math.round((m1.ms - m0.ms) / (m1.hit - m0.hit)) : null, last: m1.last } : null };
  ok(onKick >= 5, `a plain look while the song plays is taken on the music: ${onKick}/6 say "Taken on a kick" (${texts[0]})`);
  ok(!R.info.music.moments || R.info.music.moments.msPerHit <= 900, `…waiting for the kick at most about one beat (484 ms at 124 bpm): ${R.info.music.moments?.msPerHit} ms a look on average`);
  ok(pics.now.length === 6, 'on: "now" takes the picture at once (no "Taken on")');
  ok(REPORT || (R.info.kickAge.median.synced != null && R.info.kickAge.median.synced < R.info.kickAge.median.now), `the picture on the music is made closer after the kick than one at any moment (median ${R.info.kickAge.median.synced} ms against ${R.info.kickAge.median.now} ms; a beat is 484 ms)`);
  // the strip: one bar, 2 across
  const s = await look('three_screenshot', { frames: 4 }, X);
  R.info.strip = brief(s); cost.strip = brief(s);
  ok(s.ok && /4 frames over bar \d+ of the song/.test(s.text), `frames: 4 while the song plays: one bar from its first beat (${s.text.slice(0, 140)})`);
  ok(s.dims && s.dims[0] >= 700 && s.dims[1] >= 360, `…as a 2 × 2 sheet, each frame about 384 px wide (${s.dims?.join('×')})`);
  // at: "kick" with no hand-placed kick markers (the analysis found them)
  const k = await look('three_screenshot', { at: 'kick', force: true }, X);
  R.info.atKick = brief(k);
  ok(k.ok && k.im, `at: "kick" seeks to the next kick the analysis found (${k.text.slice(0, 120) || k.error})`);
  // the console line's tempo (it said "0 bpm")
  const con = await look('three_console', { force: true }, X);
  R.info.consoleMusic = String(con.value?.music || '').slice(0, 120);
  ok(/124(\.\d)? bpm/.test(R.info.consoleMusic), `three_console says the song's tempo (${R.info.consoleMusic})`);
});

// ---------- compare: each chat's own previous look ----------
await safe('compare', async () => {
  const X = chat('eyes-cx'); const Y = chat('eyes-cy'); const Z = chat('eyes-cz');
  await look('three_screenshot', { force: true, on: 'now' }, X);
  await wait(600);
  await look('three_screenshot', { force: true, on: 'now' }, Y);
  await wait(600);
  const cx = await look('three_screenshot', { compare: true, on: 'now' }, X);
  const cz = await look('three_screenshot', { compare: true, on: 'now' }, Z);
  R.info.compare = { x: brief(cx), z: brief(cz) };
  cost.compare = brief(cx);
  ok(/Left: your previous look \(\d+ s ago/.test(cx.text), `compare in chat X says its "before" is its own previous look (${cx.text.slice(0, 160)})`);
  ok(/Left: the last look at this scene/.test(cz.text), `compare in a chat that hasn't looked: the scene's last look, said so (${cz.text.slice(0, 160)})`);
  const med = await look('three_screenshot', { size: 'medium', on: 'now' }, X);
  cost.medium = brief(med);
  const later = await look('three_screenshot', { on: 'now' }, X);
  cost.later = brief(later);
});

// ---------- layers: what the list says about the scene ----------
await safe('layers', async () => {
  const X = chat('eyes-layers');
  const a = await look('three_layers', {}, X);
  R.info.layers = { text: a.text, tok: a.textTok };
  ok(a.value?.errors === 'none', `three_layers: errors: none (${JSON.stringify(a.value?.errors)})`);
  ok(/rsbot \(🧊 RS bot\) loaded/.test(a.value?.models || '') && /textures sharp/.test(a.value?.models || ''), `three_layers: the 🧊 model loaded, its textures sharp (${a.value?.models})`);
  ok(/song plays/.test(a.value?.motion || ''), `three_layers: the song plays and the scene reacts to it (${a.value?.motion})`);
  ok(a.textTok <= 420, `three_layers stays short: ≈ ${a.textTok} tokens`);
  await HubBridge.call('three_add_layer', { name: 'Broken', code: 'import * as THREE from "three";\nconst a = 1;\nthrow new Error("eyes112 broke");\n', wait: 2 }, { chatId: X });
  const b = await look('three_layers', {}, X);
  R.info.layersBroken = String(JSON.stringify(b.value?.errors || null)).slice(0, 200);
  ok(Array.isArray(b.value?.errors) && b.value.errors.some((e) => /\[Broken\].*eyes112 broke/.test(e)), `three_layers names the layer that throws (${R.info.layersBroken})`);
  await HubBridge.call('three_remove_layer', { layer: 'Broken' }, { chatId: X });
});

// ---------- truth: the AI's picture against the screen, still scene ----------
await safe('truth', async () => {
  c.play(false); await wait(400);
  for (const n of MOVING) await HubBridge.call('three_update_layer', { layer: n, settings: { visible: false } });
  await HubBridge.call('three_add_layer', { name: 'Still', code: STILL('#ff2020'), position: 4, wait: 2 });
  await wait(1500);
  const X = chat('eyes-truth');
  const vs = async (label) => {
    const s = await look('three_screenshot', { force: true }, X); const t = await screenTruth();
    const S = await grid(s.im.data, s.im.mime); const T = await grid(t);
    return { label, text: s.text, shot: S.mean, screen: T.mean, d: diff(S.px, T.px), dims: s.dims };
  };
  const on1 = await vs('bloom on');
  await HubBridge.call('three_update_layer', { layer: '✦ Bloom', settings: { visible: false } }); await wait(1200);
  const off = await vs('bloom off');
  await HubBridge.call('three_update_layer', { layer: '✦ Bloom', settings: { visible: true } }); await wait(1200);
  const on2 = await vs('bloom back');
  await HubBridge.call('three_update_layer', { layer: 'Still', settings: { opacity: 0.5, blend: 'screen' } }); await wait(1000);
  const half = await vs('half opacity, screen');
  await HubBridge.call('three_update_layer', { layer: 'Still', settings: { opacity: 1, blend: 'normal' } }); await wait(800);
  R.info.truth = [on1, off, on2, half];
  for (const x of R.info.truth) ok(x.d <= 12, `${x.label}: the AI's picture is what the screen shows (mean difference ${x.d} of 255; picture ${x.shot}, screen ${x.screen})`);
  const lum = (m) => 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2];
  ok(lum(on1.shot) - lum(off.shot) > 2 && lum(on1.screen) - lum(off.screen) > 2, `✦ Bloom is in the AI's picture as on screen (brighter with it: picture ${Math.round(lum(on1.shot) - lum(off.shot))}, screen ${Math.round(lum(on1.screen) - lum(off.screen))})`);
  ok(on1.dims?.[0] === 512 && on1.dims?.[1] === 288 && /frame custom 640×360|Screenshot \(512×288/.test(on1.text), `the size: 512×288 for a 640×360 frame (${on1.dims?.join('×')}, ${on1.text.slice(0, 80)})`);
});

// ---------- fresh: the next look after an edit, an Undo, a ▶ Apply ----------
await safe('fresh', async () => {
  const X = chat('eyes-fresh');
  const rows = [];
  for (let k = 0; k < 4; k += 1) {
    const from = k % 2 ? '#2040ff' : '#ff2020'; const to = k % 2 ? '#ff2020' : '#2040ff';
    await HubBridge.call('three_edit_code', { layer: 'Still', edits: [{ find: `'${from}'`, replace: `'${to}'` }], shot: false }, { chatId: X });
    const s = await look('three_screenshot', { force: true }, X);
    rows.push({ how: 'edit', want: to, got: s.im ? await pixel(s.im, ...SQ) : null, ms: s.ms });
  }
  // (the square is red now) the AI's undo of its last edit: blue
  await HubBridge.call('three_do', { cmd: 'undo' }, { chatId: X });
  let s = await look('three_screenshot', { force: true }, X);
  rows.push({ how: 'undo', want: '#2040ff', got: s.im ? await pixel(s.im, ...SQ) : null, ms: s.ms });
  // ▶ Apply from a chat (the owner's click), then putting it back as ↶ Undo does
  const L = D.layers().layers.find((x) => x.name === 'Still');
  const before = D.codeOf('Still').code;
  const job = await LabChatLink.apply('claude', X, STILL('#ff2020'), sceneId, { layerId: L.id });
  s = await look('three_screenshot', { force: true }, X);
  rows.push({ how: 'apply', want: '#ff2020', got: s.im ? await pixel(s.im, ...SQ) : null, ms: s.ms, note: job?.out?.words || null });
  await HubBridge.call('three_update_layer', { layer: L.id, code: before, wait: 1.5, _owner: LabChatLink.ownerToken }, { chatId: X });
  s = await look('three_screenshot', { force: true }, X);
  rows.push({ how: 'apply undone', want: '#2040ff', got: s.im ? await pixel(s.im, ...SQ) : null, ms: s.ms });
  // compare, by colour: chat X looks (blue), chat Y makes it red and looks, back to blue; X's compare shows ITS look
  // on the left (blue), not chat Y's newer one (red)
  {
    const X2 = chat('eyes-cmpx'); const Y2 = chat('eyes-cmpy');
    await look('three_screenshot', { force: true }, X2);
    await HubBridge.call('three_edit_code', { layer: 'Still', edits: [{ find: "'#2040ff'", replace: "'#ff2020'" }], shot: false }, { chatId: Y2 });
    await look('three_screenshot', { force: true }, Y2);
    await HubBridge.call('three_edit_code', { layer: 'Still', edits: [{ find: "'#ff2020'", replace: "'#2040ff'" }], shot: false }, { chatId: Y2 });
    const cx = await look('three_screenshot', { compare: true }, X2);
    const left = cx.im ? await pixel(cx.im, 0.109, SQ[1]) : null;
    R.info.compareColour = { text: cx.text.slice(0, 160), left };
    ok(left && blueish(left), `compare in chat X: the left picture is X's own previous look (blue), not chat Y's newer one (red): rgb(${left})`);
  }
  R.info.fresh = rows;
  for (const r of rows) ok(r.got && (r.want === '#2040ff' ? blueish(r.got) : reddish(r.got)), `${r.how}: the next look shows it (${r.want} wanted, the square is rgb(${r.got}))`);
  // a new 🧊 model layer, looked at right away: held for its shaders, its picture going up
  await HubBridge.call('three_remove_layer', { layer: 'Still' });
  for (const n of MOVING) await HubBridge.call('three_update_layer', { layer: n, settings: { visible: true } });
  // a second model: the same cube with a fresh 4096² picture (sent up in slices behind a stand-in, modeltex100)
  const src = `${RS.DIR}/bot`; const dst = `${RS.DIR}/bot4k`;
  await window.hub.fs.write(`${dst}/bot.gltf`, await window.hub.fs.read(`${src}/bot.gltf`));
  await window.hub.fs.write(`${dst}/buffers/bot.bin`, new Uint8Array(await window.hub.fs.read(`${src}/buffers/bot.bin`, { encoding: 'buffer' })));
  { const cv = new OffscreenCanvas(4096, 4096); const g = cv.getContext('2d'); for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) { g.fillStyle = `hsl(${(x * 40 + y * 13) % 360} 80% ${(x + y) % 2 ? 30 : 65}%)`; g.fillRect(x * 512, y * 512, 512, 512); } await window.hub.fs.write(`${dst}/textures/paint.png`, new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer())); }
  const ref4k = await D.refs.add(`${dst}/bot.gltf`, 'bot4k');
  const key = ref4k?.key || D.refs.list().find((x) => /bot4k/.test(`${x.key} ${x.path || ''}`))?.key || 'bot4k';
  const st0 = ThreeDirector.settled?.() || { asked: 0, waited: 0, ms: 0, capped: 0 };
  await HubBridge.call('three_add_layer', { name: '🧊 RS bot 2', code: RS.MODEL(key).replace("name: 'rsbot'", "name: 'rsbot4k'"), wait: 0.5 }, { chatId: X });
  const m = await look('three_screenshot', { force: true, on: 'now' }, X);
  const st1 = ThreeDirector.settled?.() || st0;
  const busy = await RS.pj('{ busy: Boolean(window.__labPicsSettle && window.__labPicsSettle.busy()), models: (globalThis.lab3d?.list() || []).map((x) => [x.name, x.loaded]) }');
  const told = /Some textures were still loading/.test(m.text);
  R.info.newModel = { text: m.text.slice(0, 200), ms: m.ms, settle: { waited: st1.waited - st0.waited, ms: st1.ms - st0.ms, capped: st1.capped - st0.capped, last: st1.last || null }, after: busy, told };
  ok(m.im && (busy?.busy === false || told), `a new 🧊 model layer looked at right away: the look waited for its pictures, or says they were still loading (waited ${R.info.newModel.settle.ms} ms; still going up after: ${busy?.busy}; said: ${told})`);
  await HubBridge.call('three_remove_layer', { layer: '🧊 RS bot 2' });
});

R.info.cost = cost;
R.info.layersTok = R.info.layers?.tok;
await RS.close();
return JSON.stringify({ pass: R.fails.length === 0, report: REPORT, fails: R.fails, ok: R.ok.length, passed: R.ok, info: R.info }, null, 1);
