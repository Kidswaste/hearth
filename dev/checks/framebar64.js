// ▮ The frame budget bar in the Lab (round 64, framebar64: tools/framebar-core.js, tools/framebar.js, the preview page's
// "frame budget bar" in tools/three-sandbox.html, small hooks in tools/three.js). On the labplay55 fixture (a Clink-like
// game layer with 2K textures, 60 shadowed crates, 6 projectiles a frame with cloned materials, a DOM HUD layer) plus a
// deliberately heavy layer ("Heavy": 300 copies of one box drawn one by one, 150 see-through spheres each with its own
// material, 450 shadow casters under a 4096² sun map, and 2 ms of its own code a frame):
//   default  the pointer away from the preview: the stats line keeps the fps and the bar on screen (visible by default,
//            with its "3.1 / 4.2 ms" label), the rest of the line waits for hover; the preview counts nothing per layer
//   bar      the pointer over the preview: the whole line shows, the bar sits right after the fps with a level and its
//            numbers; the preview counts each layer while the whole line shows
//   named    hover the bar: the card lists each layer; "The most expensive layer is Heavy (…)"
//   why      the visible "Why?" button → a 3-second look at Heavy: draw calls by material (“brick” 300…), shadow casters (450, the 4096² map),
//            the overdraw estimate; suggestions start with instancing; shadows / casters among them
//   draft    "Ask the Three Director" on a suggestion → the Three Director's box holds the words, not sent
//   off      the pointer leaves the preview: the line folds back to fps + bar, the preview stops counting (sums frozen)
//   target   right-click → 144 Hz → the bar measures against 6.9 ms; /framebar target auto; /framebar status
// Per-frame cost with the bar hidden is held by labpace / gcchurn60 / labplay55 (run with this one).
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/framebar64.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const say = async (line) => { let t = ''; const grab = (x) => { t += `${t ? '\n' : ''}${x ?? ''}`; }; await Commands.tryRun(line, H.claudeAgent().id, null, { source: 'chat', say: grab, note: grab }); return t; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-framebar64`;

// ---------- the labplay55 fixture ----------
const png2k = async (paint) => { const c = new OffscreenCanvas(2048, 2048); const g = c.getContext('2d'); paint(g); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
await window.hub.fs.write(`${DIR}/ground.png`, await png2k((g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = `hsl(${(x * 7 + y * 3) % 60 + 90} 35% ${(x + y) % 2 ? 22 : 30}%)`; g.fillRect(x * 64, y * 64, 64, 64); } }));
await window.hub.fs.write(`${DIR}/crate.png`, await png2k((g) => { g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, 2048, 2048); g.strokeStyle = '#3b2412'; g.lineWidth = 60; g.strokeRect(30, 30, 1988, 1988); }));
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
await Commands.tryRun('/director-setup', H.claudeAgent().id);
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 60000);
const c = await ThreeLab.cmd();
const D = ThreeLab.director;
await wait(600);
const GAME = `import * as THREE from 'three';
const P = tweak({ fog: { value: 0.03, min: 0, max: 0.1, step: 0.001, label: 'Fog' }, rate: { value: 6, min: 0, max: 12, step: 1, label: 'Shots a frame' } });
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 5, 11); camera.lookAt(0, 0.5, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1320'); scene.fog = new THREE.FogExp2('#0d1320', P.fog);
const gt = refTexture('ground'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(8, 8);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const sun = new THREE.DirectionalLight('#fff3e0', 2.4); sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun, new THREE.HemisphereLight('#9ec5ff', '#3b2a1a', 0.6));
const ct = refTexture('crate'); const crateMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }); const box = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(box, crateMat); const a = i * 2.39996; const r = 3 + (i % 12); m.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
const shotGeo = new THREE.SphereGeometry(0.12, 8, 6); const shotMat = new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ff8a3d', emissiveIntensity: 1.5 });
const shots = [];
renderer.setAnimationLoop((t) => {
  const s = t / 1000; scene.fog.density = P.fog;
  for (let k = 0; k < P.rate; k++) { const m = new THREE.Mesh(shotGeo, shotMat.clone()); m.position.set(Math.sin(s * 3 + k) * 2, 0.6, 2); m.userData.v = new THREE.Vector3(Math.sin(k + s) * 2, 1.5, -14); m.userData.born = s; m.castShadow = true; scene.add(m); shots.push(m); }
  for (let i = shots.length - 1; i >= 0; i--) { const m = shots[i]; m.position.addScaledVector(m.userData.v, 1 / 60); if (s - m.userData.born > 0.8) { scene.remove(m); m.material.dispose(); shots.splice(i, 1); } }
  camera.position.x = Math.sin(s * 0.3) * 6; camera.lookAt(0, 0.5, 0);
  renderer.render(scene, camera);
});`;
const HUD = `const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:12px;top:8px;font:700 18px system-ui;color:#fff;text-shadow:0 2px 6px #000'; document.body.append(d);
let shown = -1; const f = (t) => { const v = Math.floor(t / 250); if (v !== shown) { shown = v; d.textContent = 'CLINK · ' + v; } requestAnimationFrame((u) => f(u)); }; requestAnimationFrame(f);`;
// the deliberately heavy layer: everything the "why?" look should find
const HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200); camera.position.set(0, 6, 14); camera.lookAt(0, 0, 0);
const scene = new THREE.Scene();
const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(-5, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); scene.add(sun);
for (let i = 0; i < 5; i++) { const l = new THREE.PointLight('#88aaff', 3, 12); l.position.set(i * 3 - 6, 2, -2); scene.add(l); }
const brick = new THREE.MeshStandardMaterial({ color: '#a0523c', roughness: 0.8, name: 'brick' }); const cube = new THREE.BoxGeometry(0.4, 0.4, 0.4);
for (let i = 0; i < 300; i++) { const m = new THREE.Mesh(cube, brick); m.position.set((i % 20) * 0.6 - 6, Math.floor(i / 20) * 0.3, -4 - (i % 3)); m.castShadow = true; scene.add(m); }
const ball = new THREE.SphereGeometry(0.5, 16, 12);
for (let i = 0; i < 150; i++) { const g = new THREE.MeshPhysicalMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.35, name: 'glass' }); const m = new THREE.Mesh(ball, g); m.position.set((i % 15) * 0.8 - 6, 1 + Math.floor(i / 15) * 0.5, 2 - (i % 4)); m.castShadow = true; scene.add(m); }
renderer.setAnimationLoop((t) => {
  const t0 = performance.now(); while (performance.now() - t0 < 2) { /* its own code: 2 ms a frame */ }
  scene.rotation.y = Math.sin(t / 1500) * 0.2;
  renderer.render(scene, camera);
});`;
await D.newSketch('Clink frame budget fixture (framebar64)', GAME, 2);
const fixId = ThreeLab.scenes.currentId();
try { c.customSize(320, 180); c.size('custom'); } catch { /* the frame size stays */ }
await D.refs.add(`${DIR}/ground.png`, 'ground').catch((err) => step('fixture: ground texture', false, err.message));
await D.refs.add(`${DIR}/crate.png`, 'crate').catch((err) => step('fixture: crate texture', false, err.message));
try { await D.updateLayer(D.layers().layers[0].name, { name: 'Game', code: GAME }, 0.3); } catch (err) { step('fixture: game layer', false, err.message); }
try { await D.addLayer({ name: 'HUD', code: HUD }, 1); } catch (err) { step('fixture: HUD layer', false, err.message); }
try { await D.addLayer({ name: 'Heavy', code: HEAVY }, 2); } catch (err) { step('fixture: heavy layer', false, err.message); }
c.code?.(false);
await wait(3000);
if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
out.measure.layers = D.layers().layers.map((x) => x.name);
const sbx = async (code) => { for (let i = 0; i < 5; i++) { const r = await D.evalInSketch(code); if (r?.ok) return r.value; await wait(800); } return null; };
const fbPage = () => sbx('return window.__labFramebar ? window.__labFramebar.state() : null');
await until(async () => (await sbx('return window.__labPace.state().frameTick')) > 20, 40000);
// the pointer away from the preview (the stats line shows on hover)
const pvHost = () => document.querySelector('.three-preview');
const stats = () => pvHost()?.querySelector('.three-stats');
const shown = () => Boolean(stats()?.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
const away = async () => { const t = document.querySelector('.tool-dock, .three-toolbar, .rail') || document.body; const r = t.getBoundingClientRect(); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(r.left + 10), y: Math.round(r.top + 10) }); };
const over = async (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
await away();
await wait(1500);

await safe('default', async () => {
  const b = await until(() => (shown() && stats().querySelector('.fb')?.checkVisibility() ? stats().querySelector('.fb') : null), 20000);
  await until(() => /ms$/.test(b?.querySelector('.fb-txt')?.textContent || ''), 5000);
  const others = [...(stats()?.children || [])].slice(1).filter((x) => !x.classList.contains('fb')).filter((x) => x.checkVisibility());
  step('default: the fps and the bar (with its ms label) show without pointing at the preview; the rest waits for hover', b && /^[\d.]+ \/ [\d.]+ ms$/.test(b.querySelector('.fb-txt').textContent) && others.length === 0, { label: b?.querySelector('.fb-txt')?.textContent, others: others.map((x) => x.textContent) });
  const p = await fbPage();
  const before = p?.layers?.map((l) => l.sums.join()).join('|');
  await wait(1200);
  const p2 = await fbPage();
  step('default: with the pointer away, the preview counts nothing per layer', p && !p.on && (p.layers.length === 0 || before === p2.layers.map((l) => l.sums.join()).join('|')), { on: p?.on, layers: p?.layers?.length });
});

let bar = null;
await safe('bar', async () => {
  // (pointing at the preview: over its stats line's fps, inside the preview's box; CDP pointer moves over the preview's
  // own page, a separate process here, don't mark the Lab's element as hovered)
  const f0 = stats().firstElementChild.getBoundingClientRect();
  await over(f0.left + 3, f0.top + f0.height / 2);
  const ok = await until(() => shown() && stats().querySelector('.fb') && [...stats().children].filter((x) => x.checkVisibility()).length > 3, 20000);
  bar = stats()?.querySelector('.fb');
  const track = bar?.querySelector('.fb-bar');
  const second = stats()?.children[1] === bar;
  const page = await until(async () => { const p = await fbPage(); return p?.on ? p : null; }, 8000);
  await until(() => FrameBar.state().rows.length >= 3, 15000);
  const st = FrameBar.state();
  out.measure.bar = { level: bar?.dataset.level, now: track?.getAttribute('aria-valuenow'), text: track?.getAttribute('aria-valuetext'), frame: st.frame, target: st.target };
  step('bar: pointing at the preview shows the whole line; the bar right after the fps, with its level and numbers', ok && second && /^(ok|amber|red)$/.test(bar.dataset.level || '') && Number(track.getAttribute('aria-valuenow')) > 0 && /ms at \d+ Hz/.test(track.getAttribute('aria-valuetext') || ''), out.measure.bar);
  step('bar: while the stats line shows, the preview counts each layer', page?.on && page.layers.length >= 3, page);
  const fill = bar?.querySelector('.fb-fill')?.style.transform || '';
  step('bar: the fill moves by transform (scaleX)', /^scaleX\(/.test(fill), fill);
});

await safe('named', async () => {
  const top = await until(() => (FrameBar.state().top?.name === 'Heavy' ? FrameBar.state().top : null), 20000);
  const b = bar.getBoundingClientRect();
  await over(b.left + b.width / 2, b.top + b.height / 2);
  const card = await until(() => document.querySelector('.three-preview .fb-card'), 6000);
  await wait(800);
  const text = card?.textContent || '';
  out.measure.rows = FrameBar.state().rows.map((r) => ({ name: r.name, code: r.code, draw: r.draw, total: r.total, calls: r.calls, tris: r.tris, texMB: r.texMB, progs: r.progs }));
  step('named: the over-budget layer is the heavy one', top && top.name === 'Heavy' && top.calls > 300, out.measure.rows);
  step('named: point at the bar → the card lists each layer and names it', card && /The most expensive layer is Heavy \(\d/.test(text) && /Game/.test(text) && /HUD/.test(text) && /shaders/.test(text), text.slice(0, 400));
  const g = out.measure.rows.find((r) => r.name === 'Game');
  step('named: the game layer\'s texture memory is counted (two 2K textures)', g && g.texMB >= 20, g);
});

await safe('why', async () => {
  const w = document.querySelector('.three-preview .fb-card .fb-why');
  const wr = w.getBoundingClientRect();
  await over(wr.left + 4, wr.top + 4);
  w.click();
  const res = await until(() => (FrameBar.state().result && !FrameBar.state().busy ? FrameBar.state().result : null), 20000);
  out.measure.why = res ? { name: res.name, costs: res.costs.map((x) => x.text), sugg: res.sugg.map((s) => `${s.id}: ${s.title}`), frames: res.res.frames, sec: res.res.sec, calls: res.res.calls, scan: { casters: res.res.scan?.casters, shadowLights: res.res.scan?.shadowLights, repeats: res.res.scan?.repeats, kinds: res.res.scan?.kinds, overdraw: res.res.scan?.overdraw } } : null;
  const costs = (res?.costs || []).map((x) => x.text).join('\n');
  step('why: a 3-second look at Heavy', res && res.name === 'Heavy' && res.res.ok && res.res.sec >= 2.5 && res.res.frames > 0, out.measure.why);
  step('why: draw calls by material', /Draw calls: .* by material: “brick” 300/.test(costs) && /glass/.test(costs), costs);
  step('why: shadow casters and their map', /Shadow casters: (4[5-9]\d|5\d\d)/.test(costs) && /shadow maps \d+²/.test(costs), costs); // (the Lab may draw the map smaller while frames are slow: labadapt)
  step('why: the transparent overdraw estimate', /Transparent overdraw: ≈ [\d.]+× the screen \(150 see-through/.test(costs), costs);
  const ids = (res?.sugg || []).map((s) => s.id);
  step('why: suggestions (instancing first; shadows / casters / shared materials among them)', ids[0] === 'instance' && ids.some((x) => /^(shadowsize|casters)$/.test(x)) && ids.includes('share'), ids);
  const card = document.querySelector('.three-preview .fb-card')?.textContent || '';
  step('why: the card shows the costs and what would help, each with a visible "Ask the Three Director"', /what costs the most/.test(card) && /What would help/.test(card) && /Ask the Three Director/.test(card), card.slice(0, 300));
  await smoke({ shot: `${window.FB64_SHOT_DIR || TMP}/framebar64-card.png` });
});

await safe('draft', async () => {
  const dir = H.agents().find((a) => a.dock === 'three');
  const btn = document.querySelector('.three-preview .fb-card .fb-draft');
  btn.click();
  const ta = await until(() => [...document.querySelectorAll('.composer textarea')].find((x) => /^In the Lab layer “Heavy”/.test(x.value)), 12000);
  await wait(1500);
  const sent = [...document.querySelectorAll('.msg.user')].some((m) => /In the Lab layer “Heavy”/.test(m.textContent));
  out.measure.draft = ta?.value;
  step('draft: "Ask the Three Director" puts the suggestion in the Three Director\'s box', dir && ta && /InstancedMesh/.test(ta.value) && /240 Hz|\d+ Hz/.test(ta.value), ta?.value);
  step('draft: … not sent', ta && /In the Lab layer/.test(ta.value) && !sent, { sent });
  if (ta && dir) Native.setDraft(dir.id, '');
});

await safe('off', async () => {
  FrameBar.close(true);
  await away();
  const off = await until(async () => { const p = await fbPage(); return p && !p.on ? p : null; }, 8000);
  const a = (off?.layers || []).map((l) => l.sums.join()).join('|');
  await wait(1500);
  const b = ((await fbPage())?.layers || []).map((l) => l.sums.join()).join('|');
  step('off: the pointer leaves → the line folds back to fps + bar, the preview stops counting (sums frozen)', off && a === b && shown() && bar.checkVisibility(), { on: off?.on, shown: shown() });
  step('off: the card is gone with it', !document.querySelector('.three-preview .fb-card'));
});

await safe('target', async () => {
  FrameBar.setTarget(144);
  const t = FrameBar.state().target;
  step('target: 144 Hz → 6.9 ms', t.hz === 144 && Math.abs(t.ms - 6.944) < 0.01, t);
  const o = await say('/framebar target auto');
  step('/framebar target auto', /Hz/.test(o) && FrameBar.state().pref === 'auto', o);
  const s = await say('/framebar');
  step('/framebar (status)', /ms of [\d.]+ ms \(\d+ Hz\)/.test(s) && /most expensive layer is Heavy/.test(s), s);
});

out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out, null, 1);
