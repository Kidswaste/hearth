// (round 136, outline136) 🗂 The scene outline (docs/upgrades/outline136.md), in one check, on scenes it makes (red /
// green / blue thirds, each a WebGL layer, plus an empty one; and a scene of the bundled demo layers):
//   1. a group made with Ctrl/⌘+G in the Layers list, renamed in place (double-click its name, Enter), 2 layers
//      dragged onto its header: they join it, the picture unchanged
//   2. the group's eye (mute) and its S (solo): the preview on screen, the merged still and a render frame from the
//      export page all leave the group out / show only it
//   3. a layer renamed in place (double-click, type, Enter)
//   4. ✦ Name these for me (the ⋯ menu): plain names from each layer's code and sliders, on this computer, no AI
//   5. Alt+↑ / Alt+↓ in the Layers list (real keys) move the selected layer
//   6. each of those changes is ONE step of the Lab's own Ctrl/⌘+Z (in the list and on the picture)
//   7. the director's outline (three_do layers through the fake engine, and the whole text) names the groups
//   8. a group faded as one (the Fade, move & key card) and ◆ keyed at the playhead, each one undo step
//   9. 🔍 find: the list filtered to the matching layers
// Only the check's own temp data (smoke.js); never an owner's scene.
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/outline136.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.groupsHost && typeof LabGroups !== 'undefined', 60000);
  const S = ThreeLab.scenes; const D = ThreeLab.director; const GH = ThreeLab.groupsHost; const G = LayerGroups; const hk = ThreeLab.stageHooks;
  const third = (i, color) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(0, 3, 1, 0, -1, 1);
const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '${color}' }));
m.position.set(${i} + 0.5, 0.5, 0);
scene.add(m);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
renderer.setAnimationLoop(() => renderer.render(scene, cam));
`;
  const EMPTY = '// nothing drawn yet\n';
  const layers = [['olR', 'Red', '#ff0000', third(0, '#ff0000')], ['olG', 'Green', '#00ff00', third(1, '#00ff00')], ['olB', 'Blue', '#0000ff', third(2, '#0000ff')], ['olS', 'Spare', '#888888', EMPTY]]
    .map(([id, name, col, code], i) => ThreeLayers.defaults({ id, name, code, slot: i, color: col }));
  const sk = S.create({ name: 'O136', code: layers[0].code, layers, frame: '16:9', open: true });
  await until(() => S.currentId() === sk.id && document.querySelectorAll('.ly-row[data-id]').length === 4, 15000);
  await wait(2500);
  const Ls = () => GH.layers();
  const byId = (id) => Ls().find((L) => L.id === id);
  const order = () => Ls().map((L) => L.id).join();
  const rowOf = (id) => document.querySelector(`.ly-row[data-id="${id}"]`);
  // which thirds have colour: R G B or - (as layergroups' check reads them)
  const colorsOf = async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const n = 48; const c = document.createElement('canvas'); c.width = n; c.height = n; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    const at = (x) => { const i = (Math.round(n / 2) * n + Math.round(x * (n - 1))) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const nm = ([r, gg, b]) => (r > 150 && gg < 90 && b < 90 ? 'R' : gg > 150 && r < 90 && b < 90 ? 'G' : b > 150 && r < 90 && gg < 90 ? 'B' : '-');
    return [at(1 / 6), at(0.5), at(5 / 6)].map(nm).join('');
  };
  const merged = async () => { const url = await Promise.race([D.shot(), wait(12000).then(() => null)]); return url ? colorsOf(url) : '???'; };
  const screen = async () => { const f = hk.frameRect; const cap = await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip: { x: f.left + 4, y: f.top + 4, width: f.width - 8, height: f.height - 8, scale: 1 } } }); return colorsOf(`data:image/png;base64,${cap.data}`); };
  const rendered = async () => { try { const fr = (await LabExport.probe({ w: 96, h: 54, F: 30, n: 1, times: () => 0.5 })).frames; return colorsOf(URL.createObjectURL(new Blob([fr[0]], { type: 'image/jpeg' }))); } catch (err) { return `error ${err.message}`; } };
  const thirds = async () => { const a = await merged(); const b = await screen(); return a === b ? a : `${a}|${b}`; };
  const settle = async (want, ms = 30000) => { let t = null; await until(async () => { t = await thirds(); return t === want; }, ms); return t; };
  const mouse = async (node, modifiers = 0, clickCount = 1) => {
    const r = node.getBoundingClientRect(); const x = r.left + r.width * 0.6; const y = r.top + r.height / 2;
    for (const type of ['mousePressed', 'mouseReleased']) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount, modifiers } });
    await wait(150);
  };
  const press = async (key, code, vk, modifiers) => { for (const type of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers } }); await wait(450); };
  const steps = () => LabDirect.steps.length;
  // the Lab's Ctrl/⌘+Z on the picture (LabDirect's own listener), and a real one in the Layers list
  const undoPic = async () => { hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })); await wait(500); };
  const undoList = async (rowId) => { await mouse(rowOf(rowId) || document.querySelector('.ly-row[data-id]')); await press('z', 'KeyZ', 90, 2); };
  step('a scene of 4 layers draws red / green / blue thirds (the 4th is empty)', await settle('RGB') === 'RGB', await thirds());

  // ---------- 1. a group: Ctrl/⌘+G, renamed in place, 2 layers dragged in ----------
  await mouse(rowOf('olS'));
  await press('g', 'KeyG', 71, 2);
  const gid = await until(() => G.groups(Ls())[0]?.id);
  const head = () => document.querySelector('.ly-row.ly-group');
  head()?.querySelector('.ly-name')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const inp = await until(() => document.querySelector('.ly-row.ly-group input.ly-rename'), 3000);
  if (inp) { inp.value = 'Warm'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  await wait(300);
  step('Ctrl/⌘+G makes a group; double-click its name renames it in place (an input, Enter)', Boolean(gid) && Boolean(inp) && G.find(Ls(), gid)?.name === 'Warm' && head()?.querySelector('.ly-name')?.textContent === 'Warm', G.groups(Ls()).map((g) => g.name));
  const drag = async (fromRow, toRow) => {
    const dt = new DataTransfer();
    fromRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    toRow.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    toRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    fromRow.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await wait(350);
  };
  const s0 = steps();
  await drag(rowOf('olR'), head());
  await drag(rowOf('olG'), head());
  step('Red and Green dragged onto the group\'s header join it (3 layers in "Warm"), each drag one undo step', G.members(Ls(), gid).map((L) => L.id).sort().join() === 'olG,olR,olS' && steps() === s0 + 2, { order: order(), steps: steps() - s0 });
  step('…and the picture is the same (the thirds don\'t overlap)', await settle('RGB') === 'RGB');

  // ---------- 2. mute and solo the group: preview, still, render ----------
  head().querySelector('.ly-eye').click();
  const m1 = await settle('--B'); const r1 = await rendered();
  step('the group\'s eye (mute): only Blue shows, on screen, in the merged still and in a render frame', m1 === '--B' && r1 === '--B', { screenAndStill: m1, render: r1 });
  await undoPic();
  step('…one Ctrl/⌘+Z on the picture shows the group again', await settle('RGB') === 'RGB' && Ls().every((L) => L.visible !== false));
  head().querySelector('.ly-solo').click();
  const m2 = await settle('RG-'); const r2 = await rendered();
  step('the group\'s S (solo): only Red and Green, on screen, the still and a render frame', m2 === 'RG-' && r2 === 'RG-' && G.soloId(Ls()) === gid, { screenAndStill: m2, render: r2 });
  await undoList('olB');
  step('…one real Ctrl/⌘+Z in the Layers list ends the solo', await settle('RGB') === 'RGB' && !G.soloId(Ls()));

  // ---------- 3. a layer renamed in place ----------
  const s3 = steps();
  rowOf('olB').querySelector('.ly-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const inp3 = await until(() => rowOf('olB')?.querySelector('input.ly-rename'), 3000);
  if (inp3) { inp3.value = 'Cold strip'; inp3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  await wait(300);
  step('double-click a layer\'s name: renamed in place (no dialog), one undo step', byId('olB').name === 'Cold strip' && !document.querySelector('dialog[open]') && steps() === s3 + 1, { name: byId('olB').name });
  await undoPic();
  step('…one Ctrl/⌘+Z puts the old name back', byId('olB').name === 'Blue', byId('olB').name);

  // ---------- 5. Alt+↑ / Alt+↓ (real keys, in the Layers list) ----------
  const o5 = order(); const s5 = steps();
  GH.select('olB'); await wait(300);
  await mouse(rowOf('olB'));
  await press('ArrowUp', 'ArrowUp', 38, 1);
  const up = order(); const blueGroup = byId('olB').group?.id || null;
  step('Alt+↑ on Blue (just under the group): it steps into the group at its edge, one undo step', blueGroup === gid && steps() === s5 + 1, { before: o5, after: up });
  await press('ArrowUp', 'ArrowUp', 38, 1);
  step('Alt+↑ again: it swaps with the layer above it', order() !== up && byId('olB').group?.id === gid, order());
  await press('ArrowDown', 'ArrowDown', 40, 1);
  step('Alt+↓ moves it back down', order() === up, order());
  await undoPic(); await undoPic(); await undoPic();
  step('…three Ctrl/⌘+Z: the order and the group as before (each move one step)', order() === o5 && !byId('olB').group, { now: order(), was: o5 });

  // ---------- 7. the director's outline names the groups ----------
  {
    const full = ThreeDirector._test.layerLines(D.layers().layers);
    step('the director\'s outline (three_layers / get_code) shows the group on each of its layers, in order', /📁 Warm/.test(full) && full.split('\n').filter((l) => l.includes('📁 Warm')).length === 3 && /^1\. Blue/m.test(full), full);
    const agent = H.agents().find((a) => a.dock === 'three');
    Native.newChat(agent.id); await wait(600);
    const chatId = H.activeChat[agent.id];
    ChatScenes.link(chatId, sk.id, { rename: false });
    if (S.currentId() !== sk.id) S.open(sk.id);
    await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'layers' }]])}`);
    await wait(500);
    const reply = String(await until(() => { const c = Native.current(agent.id); if (!c || Native.isBusy(c.id)) return null; const m = c.messages?.at(-1); return /MCP calls:/.test(m?.text || '') ? m.text : null; }, 90000) || '');
    step('…and through the fake engine: three_do layers answers with "📁 Warm" on the grouped layers', /three_do: \d+ chars · .*📁 Warm/.test(reply), reply.slice(-700) || JSON.stringify({ chatId, now: Native.current(agent.id)?.id, last: (Native.current(agent.id)?.messages || []).slice(-2).map((m) => [m.role, String(m.text || '').slice(0, 300)]) }));
    if (S.currentId() !== sk.id) { S.open(sk.id); await until(() => S.currentId() === sk.id, 8000); await wait(800); }
  }

  // ---------- 8. the group faded as one, and ◆ keyed ----------
  {
    await (window.Lazy ? Lazy.load('outline') : null);
    const s8 = steps();
    const card = LabOutline.groupCard(gid);
    step('right-click a group › Fade, move & key… opens a small card (its own group loaded on first use)', Boolean(card?.el?.isConnected) && card.el.offsetWidth <= 300 && LabGroups.groupItems(gid).some((i) => i.label === 'Fade, move & key…'), card?.el?.offsetWidth);
    card.set('fade', 0);
    const f1 = await settle('--B');
    step('Fade to 0: Red and Green go (every member\'s own opacity), Blue stays; one undo step', f1 === '--B' && byId('olR').opacity === 0 && byId('olG').opacity === 0 && (byId('olB').opacity ?? 1) === 1 && steps() === s8 + 1, { f1, steps: steps() - s8 });
    await undoPic();
    step('…one Ctrl/⌘+Z brings the group back', await settle('RGB') === 'RGB' && (byId('olR').opacity ?? 1) === 1, byId('olR').opacity);
    LabOutline.closeCard();
    const s8b = steps();
    const ok = LabOutline.keyHere(gid);
    const keyed = ['olR', 'olG', 'olS'].every((id) => ['opacity', 'x', 'y'].every((p) => byId(id).keys?.[p]?.length === 1));
    step('◆ Key here: a key for fade and place on each of the group\'s layers at the playhead, one undo step', ok && keyed && steps() === s8b + 1 && !byId('olB').keys?.opacity, { keys: Object.keys(byId('olR').keys || {}), steps: steps() - s8b });
    await undoList('olB');
    step('…one Ctrl/⌘+Z in the Layers list takes the keys away again', ['olR', 'olG', 'olS'].every((id) => !byId(id).keys?.opacity?.length), Object.keys(byId('olR').keys || {}));
  }

  // ---------- 9. 🔍 find ----------
  GH.find('gre');
  await wait(200);
  const shown = [...document.querySelectorAll('.ly-row[data-id]')].map((r) => r.dataset.id);
  step('🔍 find "gre": only Green (under its group\'s header) in the list', shown.join() === 'olG' && Boolean(document.querySelector('.ly-row.ly-group')), shown);
  GH.find(null);
  await wait(150);
  step('…closing it shows every layer again', document.querySelectorAll('.ly-row[data-id]').length === 4);

  // ---------- 4. ✦ Name these for me, on a scene of the bundled demo layers ----------
  {
    if (typeof LabGalleryData === 'undefined') await Lazy.load('gallery');
    await until(() => typeof LabGalleryData !== 'undefined', 20000);
    const N = LabGalleryData.NEW;
    const RINGS = `import * as THREE from 'three';
const P = tweak({ glow: { value: 1, min: 0, max: 3, label: 'Glow' } });
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: '#ff3cac' })); scene.add(ring);
renderer.setAnimationLoop((t) => { ring.rotation.z = t / 900; ring.material.color.setScalar(0.4 + 0.2 * P.glow); renderer.render(scene, camera); });`;
    const glowF = ThreeLayers.FILTERS.find((f) => f.id === 'glow')?.code;
    const L2 = [['nmA', N.LIQUID()], ['nmB', N.BURST({ count: 4 })], ['nmC', RINGS], ['nmD', glowF]].map(([id, code], i) => ThreeLayers.defaults({ id, name: `Layer ${i + 1}`, code, slot: i }));
    const sk2 = S.create({ name: 'O136 names', code: L2[0].code, layers: L2, frame: '16:9', open: true });
    await until(() => S.currentId() === sk2.id && GH.sliders('nmB').length && GH.sliders('nmC').length, 30000);
    const s4 = steps();
    document.querySelector('.layers .ly-more')?.click();
    const mi = await until(() => [...document.querySelectorAll('#menu .menu-item, #menu button')].find((x) => /✦ Name these for me/.test(x.textContent)), 15000);
    step('the Layers head\'s ⋯ (no new row) has "✦ Name these for me"', Boolean(mi) && typeof LabOutline !== 'undefined');
    mi?.click();
    const names = await until(() => { const n = GH.layers().map((L) => L.name); return n.every((x) => !/^Layer \d/.test(x)) ? n : null; }, 8000);
    const [a, b, c, d] = names || [];
    step('✦ Name these for me: plain names from each layer\'s code and sliders, on this computer (no AI sent)', /backdrop|gradient/i.test(a) && /particles/i.test(b) && /(kick|bass)/i.test(b) && /^glow ring$/i.test(c) && /^glow$/i.test(d) && LabOutline.sent().length === 0, names);
    step('…one undo step for all four', steps() === s4 + 1, steps() - s4);
    await undoPic();
    step('…and one Ctrl/⌘+Z puts all four names back', GH.layers().every((L, i) => L.name === `Layer ${i + 1}`), GH.layers().map((L) => L.name));
    const cost = LabOutline.aiCost({ all: true });
    step('✦ Name them with AI: the cost line is ready before anything is sent (tokens · Claude), nothing sent', /tokens in/.test(cost || '') && /Claude/.test(cost || '') && LabOutline.sent().length === 0, cost);
    S.open(sk.id); await until(() => S.currentId() === sk.id, 8000); await wait(600);
  }
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
