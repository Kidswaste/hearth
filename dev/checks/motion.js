// The Lab's motion-design kit (round 9, tools/three-motion*.js + motion.<kind>() in tools/three-sandbox.html): every
// template (kinetic type, 3D type, Hearth on screen, cursor, camera moves, logos, brand looks, end cards) is added in the
// sandbox (SwiftShader WebGL here), draws (pixels sampled from its own layer box) without console / shader errors; its
// code carries its node graph (one Motion design node, read back by the node view); the Motion tab of the effects picker
// (Alt+X) adds one with Enter; the chat commands and the director's three_do motion work; a picture is kept per family.
//   node dev/smoke.js --check-timeout 1600000 --script dev/checks/motion.js --shot /tmp/motion.png
const { step } = J;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const OUT = window.MOTION_SHOTS || '/tmp/hearth-motion';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (t) => { text = `ERROR ${t}`; } }); return text; };
const d = () => ThreeLab.director;
const sbx = (code) => d().evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error }));
activate('tool:three'); await wait(600); await ThreeLab.cmd();
await until(() => ThreeLab.director && ThreeLab.scenes, 20000);
await wait(1500);
const T = ThreeMotion.TEMPLATES;
const fams = {}; for (const t of T) fams[t.motion.kind] = (fams[t.motion.kind] || 0) + 1;
step('the motion kit is loaded: templates in eight families, in ThreeLayers.TEMPLATES', T.length >= 100 && Object.keys(fams).length === 8 && T.every((t) => ThreeLayers.TEMPLATES.includes(t)), fams);
step('one Motion design node type per family in the Lab\'s node registry', ThreeMotion.KINDS.every((k) => ThreeNodes.registry.has(`motion-${k}`)));
const has = await sbx('return typeof motion === "object" && ["type","type3d","ui","cursor","camera","logo","brand","endcard"].every((k) => typeof motion[k] === "function")');
step('the sandbox has motion.<kind>()', has === true, has);

// ---------- 1. every template draws ----------
// the sketch runs with each layer's in point at 0 and no song: a layer then counts from 0 on the timeline (no loop)
// and shows its settled state, the frame it holds after its entrance
const fresh = async (name) => { ThreeLab.scenes.create({ name, code: '// empty\n', open: true }); await until(() => d()?.layers().sketch === name, 8000); await wait(700); };
const litOf = (id) => sbx(`const b = document.querySelector('.lab-layer[data-layer="${id}"]'); if (!b) return { missing: true }; let n = 0; let a = 0; let cs = 0; for (const cv of b.querySelectorAll('canvas')) { if (cv.classList.contains('lab-xfade')) continue; cs++; const c2 = document.createElement('canvas'); c2.width = 48; c2.height = 48; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0, 48, 48); const p = g.getImageData(0, 0, 48, 48).data; for (let i = 0; i < p.length; i += 4) { if (p[i + 3] > 8 && p[i] + p[i + 1] + p[i + 2] > 20) n++; if (p[i + 3] > 8) a++; } } return { lit: n, alpha: a, canvases: cs }`);
const bad = []; const shots = [];
let k = 0;
for (const t of T) {
  if (k % 7 === 0) await fresh(`Motion check ${k / 7 + 1}`);
  k += 1;
  const before = (d().report().errors || []).length;
  const r = await d().addLayer({ template: t.id, name: `T ${t.id}`, props: { in: 0 } }, 1);
  const L = d().layers().layers.find((x) => x.name === `T ${t.id}`);
  let px = null;
  // the camera is a filter: it draws the picture below it (black in an empty sketch): it only has to run
  // (a cursor is small; the vignette is black: its alpha counts)
  const need = t.motion.kind === 'camera' ? 0 : t.motion.kind === 'cursor' || t.id === 'mo-brand-grain' ? 1 : 40;
  const litN = (x) => (t.id === 'mo-brand-vignette' ? x?.alpha : x?.lit);
  for (let i = 0; i < 14 && !(litN(px) >= need && px?.canvases); i++) { await wait(350); px = L ? await litOf(L.id) : { missing: true }; }
  const errs = (d().report().errors || []).slice(before).map((e) => String(e.message || e.text || JSON.stringify(e)).slice(0, 160));
  const ok = Boolean(r.added) && L && !px?.missing && px?.canvases > 0 && litN(px) >= need && !errs.length;
  if (!ok) bad.push({ id: t.id, px, errs, added: r.added });
  if (['mo-type-cascade', 'mo-ui-laptop', 'mo-ui-explode', 'mo-logo-flame-extrude', 'mo-endcard-forge', 'mo-type3d-spin-in', 'mo-ui-elements', 'mo-brand-grid'].includes(t.id)) { const p = `${OUT}/motion-${t.id}.png`; try { await window.hub.fs.mkdir?.(OUT); } catch { /* exists */ } await smoke({ shot: p }); shots.push(p); }
  if (L && k % 7 !== 0) await d().updateLayer(L.id, { visible: false }, 0.1);
}
step(`every motion template draws in the sandbox without errors (${T.length})`, !bad.length, { bad: bad.slice(0, 12), n: bad.length });
step('pictures of each family were kept to look at', shots.length >= 6, shots);

// ---------- 2. the node view reads a motion layer as one node ----------
const code = ThreeMotion.codeFor('type', { preset: 'slam', text: 'TWO AIS / ONE APP' });
const g = ThreeNodes.fromCode(code);
step('a motion layer\'s code carries its graph: one Motion design node with its values, not edited', g && !g.edited && g.graph.nodes.length === 1 && g.graph.nodes[0].type === 'motion-type' && g.graph.nodes[0].values.text === 'TWO AIS / ONE APP', { edited: g?.edited, nodes: g?.graph.nodes.map((x) => x.type) });
step('its knobs are Lab sliders with plain labels and groups (Text, Look, Timing)', /group: 'Timing'/.test(code) && /label: 'Animation'/.test(code) && /motion\.type\(\{/.test(code), code.split('\n').slice(0, 6).join(' | '));
step('without the node compiler it still works as plain tweak() code', /const M = tweak\(\{/.test(ThreeMotion.plainCode('camera', { move: 'orbit' })) && /motion\.camera\(M\)/.test(ThreeMotion.plainCode('camera', { move: 'orbit' })));

// ---------- 3. the Motion tab (Alt+X) ----------
await fresh('Motion picker');
ThreeFX.close();
document.body.focus();
await J.key('x', { alt: true });
await wait(400);
const pick = document.querySelector('.fx-picker');
const tabOn = pick?.querySelector('.fx-tab.on')?.textContent;
const rows = pick ? pick.querySelectorAll('.fx-row').length : 0;
step('Alt+X opens the effects picker on its Motion tab, every motion preset listed', Boolean(pick) && tabOn === 'Motion' && rows >= T.length, { tabOn, rows });
const input = pick?.querySelector('.fx-search');
if (input) { input.value = 'zoom punch'; input.dispatchEvent(new Event('input')); await wait(200); }
const first = pick?.querySelector('.fx-row.on .fx-name b')?.textContent;
step('searching "zoom punch" finds the camera move', first === 'Camera: Zoom punch', first);
const nBefore = d().layers().layers.length;
input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await until(() => d().layers().layers.length === nBefore + 1, 6000);
step('Enter adds it as a layer (named ◭ …)', d().layers().layers.some((L) => L.name === '◭ Zoom punch'), d().layers().layers.map((L) => L.name));
step('the Motion tab is also in X\'s tabs and the keys list', ThreeFX.TABS.some((x) => x[0] === 'motion') && Keys.all().some((x) => x.keys === 'Alt+X' && x.area === 'Lab'));

// ---------- 4. chat commands ----------
const c1 = await say('/kinetic slam Two AIs / One app');
step('/kinetic slam <words> adds kinetic type with those words', /Added/.test(c1) && d().layers().layers.some((L) => L.name === '◭ Slam'), c1);
const sel = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((L) => L.name === '◭ Slam');
step('…its words are in its node', ThreeMotion.motionOf(sel?.code)?.values.text === 'Two AIs / One app');
const c2 = await say('/motion-words Hearth / on screen');
const sel2 = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((L) => L.name === '◭ Slam');
step('/motion-words changes the selected motion layer\'s words (its animation stays)', ThreeMotion.motionOf(sel2?.code)?.values.text === 'Hearth / on screen' && ThreeMotion.motionOf(sel2?.code)?.values.preset === 'slam', c2);
const c3 = await say('/camera-move whip-pan at 1.5 for 0.8 s');
const cam = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((L) => L.name === '◭ Whip pan');
step('/camera-move whip-pan at 1.5 for 0.8 s', Boolean(cam) && ThreeMotion.motionOf(cam.code)?.values.start === 1.5 && ThreeMotion.motionOf(cam.code)?.values.length === 0.8, c3);
const c4 = await say('/logo-reveal slam anvil');
step('/logo-reveal slam anvil', /Added/.test(c4) && /Anvil slam/.test(c4), c4);
const c5 = await say('/end-card light Link in bio');
const ec = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((L) => /Link in bio/.test(L.name));
step('/end-card light Link in bio', Boolean(ec) && ThreeMotion.motionOf(ec.code)?.values.cta === 'Link in bio', c5);
const c6 = await say('/motion-kit laptop');
step('/motion-kit laptop (any preset by name)', /Laptop/.test(c6), c6);
const c7 = await say('/motion-list camera');
step('/motion-list camera lists the shot list', /Motion · Camera/.test(c7) && /whip-pan/.test(c7), c7.slice(0, 120));
const c8 = await say('/brand-look grain');
const gr = d().layers().layers.find((L) => L.name === '◭ Film grain');
step('/brand-look grain: an overlay layer with the overlay blend', gr?.blend === 'overlay', gr);
const c9 = await say('/cursor-path hand 0.2,0.8; 0.5,0.5,click; 0.7,0.3,click');
const cu = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((L) => L.name === '◭ Hand cursor');
step('/cursor-path hand <points> keeps the path in the layer', /"path":\[\[0\.2,0\.8,0\],\[0\.5,0\.5,1\],\[0\.7,0\.3,1\]\]/.test(cu?.code || ''), c9);
await wait(1500);
await smoke({ shot: `${OUT}/motion-commands.png` });
const errsNow = (d().report().errors || []).map((e) => String(e.message).slice(0, 140));
step('no errors in the stack the commands built', !errsNow.length, errsNow);
step('the commands are registered (no duplicate names)', ['motion-kit', 'hearth-on-screen', 'kinetic', 'camera-move', 'shot-list', 'logo-reveal', 'end-card', 'brand-look', 'cursor-path', 'hearth-ui', 'motion-words', 'motion-seq', 'motion-intro', 'motion-list', 'type-3d'].every((n) => Commands.get(n)) && !Commands.duplicates().length, Commands.duplicates());

// ---------- 5. the director (three_do motion) ----------
const h = await HubBridge.call('three_do', { cmd: 'motion', op: 'help' });
step('three_do motion help', h.ok && /hearth \{/.test(h.value), h);
const a1 = await HubBridge.call('three_do', { cmd: 'motion', op: 'add', preset: 'word-by-word', words: 'Make it react' });
step('three_do motion add {preset, words} adds a layer through three_add_layer', a1.ok && /Word by word/.test(JSON.stringify(a1.value)), a1.error || a1.value?.added);
const a2 = await HubBridge.call('three_do', { cmd: 'motion', op: 'list', family: 'logo' });
step('three_do motion list {family}', a2.ok && /flame-line/.test(a2.value));
const a3 = await HubBridge.call('three_do', { cmd: 'motion', op: 'words', layer: 'Word by word', text: 'Two AIs' });
step('three_do motion words {layer, text}', a3.ok, a3);

// ---------- 6. Put Hearth on screen ----------
const shotsBefore = (Capture.recent?.() || []).length;
const c10 = await say('/hearth-on-screen');
await wait(3000);
const hs = d().layers();
step('/hearth-on-screen: a new sketch with backdrop, screens, cursor, title and camera', /Hearth on screen/.test(hs.sketch) && hs.layers.length === 5 && hs.layers.some((L) => L.name === '◭ Hearth on screen'), { said: c10.slice(0, 200), layers: hs.layers.map((L) => L.name) });
const refs = ThreeLab.director.refs?.list?.() || [];
step('…a fresh capture of Hearth became the sketch\'s reference (hearth-1)', refs.some((r) => /^hearth-?1$/.test(r.key)) && /hearth-?1/.test(c10), refs.map((r) => r.key));
const er2 = (d().report().errors || []).map((e) => String(e.message).slice(0, 140));
step('…no errors', !er2.length, er2);
await smoke({ shot: `${OUT}/motion-hearth-on-screen.png` });
return J.done();
