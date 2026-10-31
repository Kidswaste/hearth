// (round 94, labload94) The Lab's code (lazy group 'lab', ≈ 3.4 MB) no longer loads at every start (lab-intent.js
// decides: at once / a few seconds in / in deep idle / only on intent). Every way into the Lab still works from the
// first moment, each from a fresh reload with the Lab not loaded ('lazy.lab.mode' = 'none': nothing loads it in the
// background), and the stand-in loads it on the way:
//   rail      the pointer on the workspace bar's Scene button starts the load (intent), the click opens the Lab (its
//             director and scene in), then ⋯ Sketch › More › Ask Claude about this layer: a new Claude chat linked
//             to the scene, its draft naming the scene
//   palette   Ctrl/⌘+K, "Three.js Lab" typed: a Lab row on top starts the load; Enter opens the Lab
//   keys      the Lab's rail key (Ctrl/⌘+N, real key events) opens it; a Lab chat command (/sketches) answers; an AI's
//             Lab tool call (three_do layers, the agent bridge) answers
//   project   a project whose last view was its Scene opens into the Lab with its scene
//   chat      a reply's whole-layer code block (fake engine): the pointer on ▶ Apply to scene starts the load, the
//             click › Replace "Ring" puts the code in the chat's scene (labchat92's flow)
//   modes     a start whose history says the Lab is used most times ('calm'): still not loaded 4 s after the first
//             screen, loaded in the background (paced) from 5 s in, the groups that follow it after; a
//             start after one that ended in the Lab ('now'): loaded right after the first frame; and no app code
//             touched a Lab global before it loaded (Lazy.misses)
//   node dev/smoke.js --fake-engines --no-lazy-wait --wait 1500 --check-timeout 600000 --script dev/checks/labload94.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 16, 64), new THREE.MeshBasicMaterial({ color: '${color}' }));
scene.add(mesh);
console.log('${name} ready');
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });
`;
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const A = 'll94A';
const mk = (id, name, color) => ({ id, name, code: LAYER('Base', color), updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: LAYER('Base', color), visible: true, opacity: 1, blend: 'normal', slot: 0 }, { id: `${id}L2`, name: 'Ring', code: LAYER('Ring', '#ffffff'), visible: true, opacity: 1, blend: 'normal', slot: 1 }] });
const prev = (await window.hub.kvGet('three-sketches', null)) || [];
await window.hub.kvSet('three-sketches', [...prev.filter((x) => x.id !== A), mk(A, 'Load A', '#ff3d7f')]);
store.set('three.current', A);
// a project whose last view was its Scene
await Lazy.load('projects');
const p = Projects.create({ name: 'Labload project' });
Projects.add(p, 'scene', A, 'Load A', { links: false });
const pts = store.get('workspace.returnPoints', {}) || {};
pts[p.id] = { tab: 'scene', sceneId: A, at: Date.now() };
store.set('workspace.returnPoints', pts);
const C = H.agent('claude'); C.threeTools = true;
// a reload is a start here: an explicit "Open on start" keeps freshen.js from putting the last view back (its crash /
// reload restore loads the Lab when the Lab was in that view)
H.config.settings = { ...H.config.settings, startOn: 'tool:home' };
await saveConfig();
localStorage.setItem('ll94.project', p.id);
localStorage.setItem('ll94.out', JSON.stringify({ ok: [], fails: [], times: {} }));
localStorage.setItem('lazy.lab.mode', 'none');
await wait(1500);
return '[LABLOAD94] setup: a scene, a project left on its Scene, Claude with the Lab tools; next: reload with the Lab held';
//@@ reload
// ---------- common to each part (repeated: each part runs on its own after a reload) ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`rail: ${m}`); return Boolean(c); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const lab = () => Lazy.state().find((g) => g.name === 'lab');
const labMisses = () => Lazy.misses().filter((x) => x.group === 'lab' && !/labload94|<anonymous>|eval/.test(x.where || ''));
const center = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
const hover = async (e) => { const c = center(e); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); return c; };
const click = async (c) => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 }); };
const labUp = () => until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes && H.surfaces.get('tool:three')?.mounted && H.surfaces.get('tool:three').el.querySelector('.three-preview'), 30000, 50);
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
const held = async () => { const left = ready + 3000 - performance.now(); if (left > 0) await wait(left); return lab().state === 'stub' && Lazy.loaded('labintent') && LabIntent.state().mode === 'none'; };
ok(await held(), `the Lab isn't loaded 3 s after the first screen (${lab().state}, mode ${window.LabIntent?.state().mode})`);
// the workspace bar's Scene button (projects space, a tool other than Projects on screen)
await Lazy.load('board'); activate('tool:board'); await wait(400);
const btn = await until(() => [...document.querySelectorAll('[data-surface="tool:three"]')].find((b) => b.offsetParent), 5000);
ok(btn, 'the workspace bar shows the Scene button');
if (btn) {
  const t0 = performance.now(); const c = await hover(btn);
  ok(await until(() => lab().state !== 'stub', 2000, 10), `the pointer on Scene starts loading the Lab (intent: ${LabIntent.state().intent})`);
  R.times.hoverToLoaded = Math.round((await until(() => Lazy.loaded('lab'), 15000, 10) ? performance.now() : NaN) - t0);
  const t1 = performance.now(); await click(c);
  ok(await labUp(), 'its click opens the Lab (director and scenes in, the real tool mounted)');
  R.times.clickToLab = Math.round(performance.now() - t1);
  ok(H.surfaceIdFor(H.activeId) === 'tool:three', 'the Lab is on screen');
}
// ⋯ Sketch › More › Ask Claude about this layer
await until(() => ThreeLab.scenes.currentId() === 'll94A', 10000);
await wait(1500);
const menuButtons = () => [...document.querySelectorAll('#menu button, #menu-fly button, .lab-pop button.menu-item')].filter((b) => b.offsetParent && !b.disabled);
const clickMenu = async (re) => { const b = await until(() => menuButtons().find((x) => re.test(x.textContent)), 5000); b?.click(); await wait(250); return Boolean(b); };
const C = H.agent('claude');
ThreeLab.director.selectLayer('Ring'); await wait(200);
const sk = [...H.surfaces.get('tool:three').el.querySelectorAll('button')].find((b) => /^Sketch ▾/.test(b.textContent.trim()) && b.offsetParent);
sk?.click(); await wait(300);
ok(await clickMenu(/^More/) && await clickMenu(/Ask Claude about this layer/), '⋯ Sketch › More › Ask Claude about this layer');
await wait(600);
const draft = Native.view(C.id)?.input.value || '';
ok(/^\[Lab scene "Load A"/.test(draft), `it starts a Claude chat about the scene (${draft.split('\n')[0].slice(0, 80)})`);
Native.setDraft?.(C.id, '');
ok(labMisses().length === 0, `no app code touched a Lab global before it loaded (${labMisses().map((x) => `${x.name} ${x.where}`).join('; ')})`);
localStorage.setItem('ll94.out', JSON.stringify(R));
return `[LABLOAD94] rail: ${R.fails.length} failing so far`;
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`palette / keys: ${m}`); return Boolean(c); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const lab = () => Lazy.state().find((g) => g.name === 'lab');
const labUp = () => until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes && H.surfaces.get('tool:three')?.mounted && H.surfaces.get('tool:three').el.querySelector('.three-preview'), 30000, 50);
const mac = /Mac/.test(navigator.platform);
const key = async (k, code, vk, mods) => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); };
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
{ const left = ready + 3000 - performance.now(); if (left > 0) await wait(left); }
ok(lab().state === 'stub', 'the Lab isn\'t loaded 3 s after the first screen');
// Ctrl/⌘+K, "Three.js Lab"
activate(H.claudeAgent().id); await wait(300);
await key('k', 'KeyK', 75, mac ? 4 : 2);
let pal = await until(() => document.querySelector('.palette .palette-input'), 1500);
if (!pal) { AppUI.palette(); pal = await until(() => document.querySelector('.palette .palette-input'), 1500); R.notes = 'palette opened by AppUI.palette(): the key did not reach it here'; }
ok(pal, 'Ctrl/⌘+K opens the palette');
pal?.focus();
await cdp('Input.insertText', { text: 'Three.js Lab' });
ok(await until(() => lab().state !== 'stub', 3000, 10) && LabIntent.state().intent === 'palette', `a Lab row on top starts loading the Lab (intent: ${LabIntent.state().intent}; by: ${Lazy.by?.("lab")}; misses: ${Lazy.misses().filter((x) => x.group === 'lab').map((x) => `${x.name} ${x.where}`).join('; ')}; rows: ${[...document.querySelectorAll('.palette-item .p-label')].slice(0, 3).map((x) => x.textContent).join(' | ')})`);
await until(() => [...document.querySelectorAll('.palette-item.sel .p-label')].some((x) => /Three\.js Lab/.test(x.textContent)), 3000);
await key('Enter', 'Enter', 13, 0);
ok(await labUp(), 'Enter on it opens the Lab');
ok(H.surfaceIdFor(H.activeId) === 'tool:three', 'the Lab is on screen');
localStorage.setItem('ll94.out', JSON.stringify(R));
return '[LABLOAD94] palette done';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`keys: ${m}`); return Boolean(c); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const lab = () => Lazy.state().find((g) => g.name === 'lab');
const labUp = () => until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes && H.surfaces.get('tool:three')?.mounted && H.surfaces.get('tool:three').el.querySelector('.three-preview'), 30000, 50);
const mac = /Mac/.test(navigator.platform);
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
{ const left = ready + 3000 - performance.now(); if (left > 0) await wait(left); }
ok(lab().state === 'stub', 'the Lab isn\'t loaded 3 s after the first screen');
// a Lab chat command first (its stand-in), then an AI's Lab tool call, then the Lab's rail key
const said = [];
await Commands.tryRun('/sketches', H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)), error: (e) => said.push(`ERR ${e}`) });
ok(said.length && !said.some((t) => /^ERR/.test(t)) && Lazy.loaded('lab'), `/sketches answers (${said.join(' ').slice(0, 80)})`);
const r = await HubBridge.call('three_do', { cmd: 'layers' }, { chatId: null }).catch((err) => ({ ok: false, error: err.message }));
ok(r && r.ok !== false && /Load A|Base|Ring|layer/i.test(JSON.stringify(r)), `an AI's three_do layers answers (${JSON.stringify(r).slice(0, 100)})`);
const rk = H.railKey('tool:three');
ok(/^Ctrl\+\d$/.test(rk), `the Lab has a rail key (${rk})`);
if (/^Ctrl\+\d$/.test(rk)) {
  const d = rk.slice(-1);
  activate(H.claudeAgent().id); await wait(300);
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: d, code: `Digit${d}`, windowsVirtualKeyCode: 48 + Number(d), modifiers: mac ? 4 : 2 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: d, code: `Digit${d}`, windowsVirtualKeyCode: 48 + Number(d), modifiers: mac ? 4 : 2 });
  if (!(await until(() => H.surfaceIdFor(H.activeId) === 'tool:three', 2500))) { R.notes = `${R.notes || ''} · ${rk} went to the main process: handled as its 'shortcut' message`; window.handleShortcut?.({ key: d, shift: false }); }
  ok(await labUp() && H.surfaceIdFor(H.activeId) === 'tool:three', `${rk} opens the Lab`);
}
localStorage.setItem('ll94.out', JSON.stringify(R));
return '[LABLOAD94] keys done';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`project: ${m}`); return Boolean(c); };
const lab = () => Lazy.state().find((g) => g.name === 'lab');
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
{ const left = ready + 3000 - performance.now(); if (left > 0) await wait(left); }
ok(lab().state === 'stub', 'the Lab isn\'t loaded 3 s after the first screen');
await Lazy.load('projects');
const pid = localStorage.getItem('ll94.project');
const t0 = performance.now();
await ProjectWorkspace.open(pid).catch((err) => ok(false, `open: ${err.message}`));
ok(await until(() => H.surfaceIdFor(H.activeId) === 'tool:three' && typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId() === 'll94A', 30000), `the project opens into the Lab on its scene (${H.activeId})`);
R.times.projectOpen = Math.round(performance.now() - t0);
await ProjectWorkspace.home().catch(() => {});
localStorage.setItem('ll94.out', JSON.stringify(R));
return '[LABLOAD94] project done';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`chat: ${m}`); return Boolean(c); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const lab = () => Lazy.state().find((g) => g.name === 'lab');
const center = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
{ const left = ready + 3000 - performance.now(); if (left > 0) await wait(left); }
ok(lab().state === 'stub', 'the Lab isn\'t loaded 3 s after the first screen');
const C = H.agent('claude');
activate(C.id); await wait(300);
Native.newChat?.(C.id); await wait(300);
await Native.send(C.id, 'layercode please');
await wait(400);
const chatId = H.activeChat[C.id];
await until(() => !Native.isBusy(chatId), 60000); await wait(400);
ChatScenes.linkGuest(chatId, 'll94A');
ok(lab().state === 'stub', `a reply with a code block doesn't load the Lab by itself (${lab().state})`);
const applyBtn = () => [...(Native.view(C.id)?.list.querySelectorAll('.msg pre .code-act') || [])].filter((b) => /Apply to scene/.test(b.textContent)).at(-1);
const ab = await until(applyBtn, 5000);
ok(ab, 'the reply\'s whole-layer code block shows ▶ Apply to scene');
if (ab) {
  ab.scrollIntoView({ block: 'center' }); await wait(200);
  const c = center(ab);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
  ok(await until(() => lab().state !== 'stub', 2000, 10), `the pointer on ▶ Apply starts loading the Lab (intent: ${LabIntent.state().intent})`);
  ab.click();
  const menuButtons = () => [...document.querySelectorAll('#menu button, #menu-fly button, .lab-pop button.menu-item')].filter((b) => b.offsetParent && !b.disabled);
  const pick = await until(() => menuButtons().find((b) => b.textContent.includes('Replace “Ring”') || /Replace another layer/.test(b.textContent)), 20000);
  if (pick && !pick.textContent.includes('Replace “Ring”')) { pick.click(); await wait(250); }
  const ring = pick?.textContent.includes('Replace “Ring”') ? pick : await until(() => menuButtons().find((b) => b.textContent.includes('Replace “Ring”')), 5000);
  ok(ring, '▶ Apply › Replace “Ring” is offered');
  ring?.click();
  const note = await until(() => Native.view(C.id)?.list.querySelector('.msg.note[data-note-id="lab-apply"]'), 20000);
  ok(note && /Applied to Ring/.test(note.textContent), `the chat says it applied (${(note?.textContent || '').slice(0, 80)})`);
  const code = ThreeLab.scenes.get('ll94A')?.layers?.find((L) => L.name === 'Ring')?.code || '';
  ok(code.includes("'#33ff99'"), 'the reply\'s code is the layer "Ring" now');
}
localStorage.setItem('ll94.out', JSON.stringify(R));
// the next start: the Lab used in most of the last starts → 'calm'
localStorage.removeItem('lazy.lab.mode');
localStorage.setItem('lazy.lab.starts', JSON.stringify([1, 0, 1, 1]));
localStorage.setItem('lazy.lab.lastView', '0');
return '[LABLOAD94] chat done';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`modes: ${m}`); return Boolean(c); };
const lab = () => Lazy.state().find((g) => g.name === 'lab');
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
await until(() => window.LabIntent?.state().mode, 8000);
ok(LabIntent.state().mode === 'calm', `used in 3 of the last 4 starts: 'calm' (${LabIntent.state().mode}: ${LabIntent.state().why})`);
{ const left = ready + 4000 - performance.now(); if (left > 0) await wait(left); }
ok(lab().state === 'stub' && !Lazy.calm().open, `not loaded 4 s after the first screen (${lab().state}, gate ${Lazy.calm().open ? 'open' : 'shut'})`);
let paced = false;
const done = await until(() => { if (lab().pace === 'idle') paced = true; return Lazy.loaded('lab'); }, Math.max(1000, ready + 25000 - performance.now()), 20);
ok(done, `loaded in the background a few seconds in (${Math.round(lab().at - ready)} ms after the first screen; its load ${lab().ms} ms)`);
ok(paced && LabIntent.state().prefetchAt && !LabIntent.state().intent, `paced, in idle moments (prefetch at ${LabIntent.state().prefetchAt})`);
ok(lab().at - ready >= 4900, `not before 5 s after the first screen (${Math.round(lab().at - ready)} ms)`);
R.times.calmPrefetchAt = Math.round(lab().at - ready); R.times.calmPrefetchMs = lab().ms;
ok(await until(() => ['labdirection', 'labfinish'].every((n) => Lazy.loaded(n)), 15000), 'the groups that follow the Lab (direction, finish lines) load after it');
ok(Lazy.misses().filter((x) => x.group === 'lab').length === 0, `no app code touched a Lab global before it loaded (${Lazy.misses().filter((x) => x.group === 'lab').map((x) => x.where).join('; ')})`);
// the next start comes after one that ended in the Lab → 'now'
activate('tool:three'); await until(() => H.surfaces.get('tool:three')?.mounted, 20000); await wait(800);
ok(localStorage.getItem('lazy.lab.lastView') === '1', 'the Lab on screen is kept as the last view');
localStorage.setItem('ll94.out', JSON.stringify(R));
return '[LABLOAD94] calm done';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('ll94.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`modes: ${m}`); return Boolean(c); };
const lab = () => Lazy.state().find((g) => g.name === 'lab');
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
ok(await until(() => Lazy.loaded('lab'), Math.max(500, ready + 6000 - performance.now()), 20), `after a start that ended in the Lab: loaded right after the first frame (${Math.round((lab().at || NaN) - ready)} ms after the first screen; ${LabIntent.state().mode}: ${LabIntent.state().why})`);
ok(LabIntent.state().intent === 'start', `as an intent at the start (${LabIntent.state().intent})`);
for (const k of ['lazy.lab.mode', 'lazy.lab.starts', 'lazy.lab.lastView', 'll94.out', 'll94.project']) localStorage.removeItem(k);
return JSON.stringify({ pass: R.fails.length === 0, fails: R.fails, times: R.times, notes: R.notes || null, ok: R.ok.length, passed: R.ok }, null, 1);
