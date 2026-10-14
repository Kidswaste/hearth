// ◧ Before / after (round 37, abcompare) on a small three.js scene: a director edit made by the fake engine through the
// real MCP route gives the chip "Before: Claude's edit" (a picture: code changed); a slider session gives a live one;
// holding B shows before (the earlier values on the same preview, or the earlier picture) and letting go comes back;
// tapping B opens the split view (left before, right now), the line drags on a still scene that isn't drawing
// (labpace) and double-click swaps; a view move (labgestures) makes the before side again; ⟲ Keep before = undo to it
// (and back again); ✓ Keep now; a 🎲 variation names itself; the ways in (right-click › View, the keys sheet, Lab
// search, ⌘/Ctrl+K, the command); no new canvas, iframe or WebGL context; closing / a scene switch frees it all.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/abcompare.js --shot /tmp/abcompare.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
await SQL.lab();
await until(() => typeof LabAB !== 'undefined' && ThreeLab.stageHooks?.pane, 20000);
const d = ThreeLab.director;
const cmd = await ThreeLab.cmd({ show: true });
const hk = ThreeLab.stageHooks;
const AB = LabAB;
const CODE = `import * as THREE from 'three';
const P = tweak({ spin: { value: 0, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, tint: { value: '#7a5cff', label: 'Tint', group: 'Color' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now, f60) => { mesh.rotation.y += 0.02 * P.spin * (f60 || 1); mesh.scale.setScalar(P.size); mesh.material.color.set(P.tint); renderer.render(scene, camera); });`;

// ---------- the scene: set up by a director turn (fake engine, real MCP call) ----------
Native.newChat(agent.id);
await wait(600);
await Native.send(agent.id, `mcp: ${JSON.stringify([['three_set_code', { code: CODE, wait: 1 }]])}`);
await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);
const chatId = H.activeChat[agent.id];
activate('tool:three');
await wait(400);
const main = () => d.codeOf().id;
for (const L of d.layers().layers.slice()) if (L.id !== main() && d.layers().layers.length > 1) await d.removeLayer(L.name);
cmd.size('1:1');
await until(() => (d.sliders(main()).sliders || []).some((s) => s.key === 'tint'), 15000);
const vals = () => Object.fromEntries((d.sliders(main()).sliders || []).map((s) => [s.key, s.value]));
// its state settles (the starting point of the first change), with a picture
await until(() => AB.state().base && AB.state().baseStill && !AB.state().pending, 15000);
step('the scene\'s starting point is taken once it\'s idle (state + a small picture made by the preview)', AB.state().base && AB.state().baseStill, AB.state());
const hubCanvases = () => document.querySelectorAll('canvas').length;
const sbCanvases = async () => Number((await d.evalInSketch('return document.querySelectorAll("canvas").length').catch(() => null))?.value ?? -1);
const c0 = { hub: hubCanvases(), frames: document.querySelectorAll('iframe').length, sb: await sbCanvases() };

// ---------- a director edit (the fake engine, the real HubBridge route): a picture, named after Claude ----------
await Native.send(agent.id, `mcp: ${JSON.stringify([['three_edit_code', { layer: main(), edits: [{ find: 'IcosahedronGeometry(1, 0)', replace: 'IcosahedronGeometry(1, 2)' }], wait: 0.5 }]])}`);
await until(() => !Native.isBusy(chatId), 60000);
await until(() => AB.state().pair?.kind === 'director', 15000);
let s = AB.state();
const chip = () => document.querySelector('.ab-chip');
step('after a director edit the chip shows "Before: Claude\'s edit · just now" (code changed: a picture)', s.pair?.label === "Claude's edit" && s.pair.mode === 'still' && s.pair.picture && /Before: Claude's edit · just now/.test(chip()?.textContent || '') && /⟲/.test(chip()?.textContent) && /✓/.test(chip()?.textContent), { s, chip: chip()?.textContent });
await smoke({ shot: '/tmp/abcompare-chip.png' });
// hold B: the picture of before over the preview; let go: gone
const pane = hk.pane;
const keyB = (type) => pane.dispatchEvent(new KeyboardEvent(type, { key: 'b', code: 'KeyB', bubbles: true, cancelable: true }));
keyB('keydown'); await wait(450);
const heldStill = { peek: AB.state().peek, img: document.querySelector('.ab-peek')?.src?.startsWith('data:image'), badge: document.querySelector('.ab-badge')?.textContent };
keyB('keyup'); await wait(150);
step('hold B on a code change: the earlier picture covers the preview with a "Before" badge; let go: now again', heldStill.peek === 'still' && heldStill.img && /Before/.test(heldStill.badge || '') && !document.querySelector('.ab-peek, .ab-badge') && !AB.state().peek, heldStill);

// ---------- a slider session: live ----------
const sizeKeys = () => vals().size;
hk.ctlOf(main()).setMany({ size: 2, tint: '#ff7a00' });
await until(() => AB.state().pair?.kind === 'sliders', 8000);
s = AB.state();
step('a slider change (one session) gives "Before: Slider change", live (the preview can show it itself)', s.pair?.mode === 'live' && /Slider change/.test(s.pair.text), s.pair);
keyB('keydown'); await wait(450);
const heldLive = { v: vals(), peek: AB.state().peek, badge: Boolean(document.querySelector('.ab-badge')), still: Boolean(document.querySelector('.ab-peek')) };
keyB('keyup'); await wait(200);
const backLive = vals();
step('hold B: the earlier values on the same preview (no picture, live), let go: now again; no undo step left', heldLive.peek === 'live' && heldLive.v.size === 1 && heldLive.v.tint === '#7a5cff' && heldLive.badge && !heldLive.still && backLive.size === 2 && backLive.tint === '#ff7a00' && !AB.state().peek, { heldLive, backLive });
// B from the picture (the preview's own page): its key-up reaches the Lab too

// ---------- tap B: the split view ----------
keyB('keydown'); await wait(40); keyB('keyup');
await until(() => AB.state().split?.picture, 15000);
s = AB.state();
const sp = document.querySelector('.ab-split');
const tags = () => [...document.querySelectorAll('.ab-tag')].map((x) => x.textContent);
step('tap B: the split view, before on the left (a picture made now with the earlier values), now on the right', s.split?.mode === 'live' && sp && JSON.stringify(tags()) === '["Before","Now"]' && /inset\(0(px)? 50% 0(px)? 0(px)?\)/.test(sp.querySelector('.ab-img').style.clipPath) && JSON.stringify(vals()) === JSON.stringify(backLive), { split: s.split, tags: tags(), clip: sp?.querySelector('.ab-img').style.clipPath, vals: vals() });
// the scene is still (spin 0): it stops drawing; the line still moves (it's a clip on a picture)
await wait(1500);
const bar = sp.querySelector('.ab-bar');
const br = bar.getBoundingClientRect(); const sr = sp.getBoundingClientRect();
const mx = Math.round(br.left + br.width / 2); const my = Math.round(br.top + br.height / 2);
const drawn = async () => { const v = (await d.evalInSketch('return JSON.stringify(window.__labPace.state())').catch(() => null))?.value; try { let x = JSON.parse(v); if (typeof x === 'string') x = JSON.parse(x); return x || {}; } catch { return { raw: String(v).slice(0, 80) }; } };
const p0 = await drawn();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 } });
for (let k = 1; k <= 6; k += 1) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: Math.round(mx - (sr.width * 0.3 * k) / 6), y: my, button: 'left', buttons: 1 } });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: Math.round(mx - sr.width * 0.3), y: my, button: 'left', clickCount: 1 } });
await wait(150);
s = AB.state();
const clip1 = sp.querySelector('.ab-img').style.clipPath;
const p1 = await drawn();
const drew = (p1.drawn ?? 0) - (p0.drawn ?? 0);
step('drag the line on a still scene (not drawing): the split follows (≈ 20 %), the preview doesn\'t draw for it', drew <= 10 && Math.abs(s.split.x - 0.2) < 0.06 && /inset\(0(px)? (7[5-9]|8[0-5])/.test(clip1) && /translateX/.test(bar.style.transform), { x: s.split.x, clip: clip1, drewDuringDrag: drew, still: [p0.still, p1.still], raw: p0.raw });
// double-click the line: the sides swap
const br2 = bar.getBoundingClientRect();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: Math.round(br2.left + br2.width / 2), y: my, button: 'left', clickCount: 1 } });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: Math.round(br2.left + br2.width / 2), y: my, button: 'left', clickCount: 1 } });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: Math.round(br2.left + br2.width / 2), y: my, button: 'left', clickCount: 2 } });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: Math.round(br2.left + br2.width / 2), y: my, button: 'left', clickCount: 2 } });
await wait(150);
step('double-click the line: the sides swap (now left, before right)', AB.state().split?.swapped && JSON.stringify(tags()) === '["Now","Before"]' && /inset\(0(px)? 0(px)? 0(px)? /.test(sp.querySelector('.ab-img').style.clipPath), { tags: tags(), clip: sp.querySelector('.ab-img').style.clipPath });
AB.swap();
// moving around the scene (labgestures): the before side is made again from the new view
const r0 = AB.stats().renders;
await d.evalInSketch('return __labGest.cmd({ cmd: "frame" })?.ok').catch(() => null);
dispatchEvent(new CustomEvent('hearth:lab-view'));
await until(() => AB.stats().renders > r0, 8000);
step('a view move (labgestures) makes the before side again, so both sides share the view', AB.stats().renders > r0 && JSON.stringify(vals()) === JSON.stringify(backLive), { renders: [r0, AB.stats().renders] });
await d.evalInSketch('return __labGest.cmd({ cmd: "reset" })?.ok').catch(() => null);
await smoke({ shot: '/tmp/abcompare-split.png' });
const c1 = { hub: hubCanvases(), frames: document.querySelectorAll('iframe').length, sb: await sbCanvases() };
step('no extra WebGL context: no new canvas or iframe in the hub, none in the preview page', JSON.stringify(c0) === JSON.stringify(c1) && AB.stats().canvases === 0 && AB.stats().webgl === 0, { c0, c1, stats: AB.stats() });
// Esc closes it, freeing the picture
const freed0 = AB.stats().freed;
pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
await wait(150);
step('Esc closes the split view and frees its picture', !AB.state().split && !document.querySelector('.ab-split, .ab-cover') && AB.stats().freed > freed0, AB.stats());

// ---------- ⟲ Keep before = undo to it, and back ----------
await AB.keepBefore();
await wait(300);
const kept = vals();
s = AB.state();
step('⟲ Keep before: the earlier values are back, and the chip offers the way back', kept.size === 1 && kept.tint === '#7a5cff' && s.pair?.kind === 'keep' && /Before you kept the earlier one/.test(chip()?.textContent || ''), { kept, pair: s.pair });
hk.ctlOf(main()).undo();
await wait(200);
step('… as one ordinary slider step: the sliders\' own ↶ puts now back', vals().size === 2 && vals().tint === '#ff7a00', vals());
hk.ctlOf(main()).setMany({ size: 1, tint: '#7a5cff' }, { remember: false });
await wait(2200);
hk.ctlOf(main()).setMany({ size: 2.5 });
await until(() => AB.state().pair?.kind === 'sliders' && !AB.state().pending, 8000);
document.querySelector('.ab-keep-before')?.click();
await wait(400);
const k1 = vals().size;
await AB.keepBefore(); // ⟲ again: back to now
await wait(300);
step('the chip\'s ⟲ goes back, ⟲ again comes back (it swaps)', k1 === 1 && vals().size === 2.5, { k1, now: vals().size });
await wait(2000);
document.querySelector('.ab-keep-now')?.click();
await wait(150);
step('✓ Keep now closes the comparison (chip gone, nothing kept in memory for it)', !AB.state().pair && !chip(), AB.state());

// ---------- a 🎲 variation names itself ----------
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: 2, button: 'none' } }); // (a pointer left over a picture would keep peeking it)
if (typeof LabVariations === 'undefined') await Lazy.load('labvar');
await LabVariations.open();
await until(() => !LabVariations.busy && LabVariations.state().tiles.length, 30000);
await wait(2000);
step('making the variation pictures (quiet values) is not a change', !AB.state().pair && !AB.state().pending, AB.state());
await LabVariations.apply(0);
await until(() => AB.state().pair?.kind === 'variations', 8000);
s = AB.state();
step('after a variation: "Before: 🎲 <its take>", live', /^🎲 /.test(s.pair?.label || '') && s.pair.mode === 'live' && /Before: 🎲/.test(chip()?.textContent || ''), s.pair);
LabVariations.close();

// ---------- ways in ----------
const view = ThreeLab.search.menus().preview.find((x) => x?.label === 'View').items();
const row = view.find((x) => /Before \/ after/.test(x?.label || ''));
const rows = row?.items?.() || [];
step('right-click › View › ◧ Before / after: split view, a moment of before, keep before, keep now', rows.some((r) => /Split view/.test(r.label)) && rows.some((r) => /Keep before/.test(r.label)) && rows.some((r) => /Keep now/.test(r.label)), rows.map((r) => r.label || r));
step('the keys sheet lists B (hold / tap); ⌘/Ctrl+K and the command exist', Keys.all().some((k) => k.area === 'Lab' && k.keys === 'B') && AppUI.actions().some((a) => /Before \/ after/.test(a.label)) && Boolean(Commands.get('before-after')));
if (typeof LabSearch === 'undefined') await Lazy.load('labsearch');
LabSearch.buildIndex?.();
const found = LabSearch.find('before after');
step('🔎 Lab search finds it (it indexes the menu row)', found.some((r) => /Before \/ after|Split view/.test(r.item?.label || '')), found.slice(0, 4).map((r) => r.item?.label));
const said = await Commands.get('before-after').run('status', {});
step('/before-after status', /Before: 🎲/.test(said), said);

// ---------- closing frees everything; a scene switch forgets ----------
AB.split(true);
await until(() => AB.state().split?.picture, 15000);
AB.close();
await wait(150);
const st = AB.stats();
step('close: no overlay, picture, cover, badge or timer left', st.elements === 0 && st.images === 0 && !st.timers && !st.holding, st);
d.newSketch('ab other', '// nothing', 1);
await wait(800);
step('a scene switch forgets the comparison (it belonged to the other scene)', !AB.state().pair, AB.state());

out.ok = out.steps.every((x) => x.ok);
out.failed = out.steps.filter((x) => !x.ok).map((x) => x.name);
return JSON.stringify(out, null, 1);
