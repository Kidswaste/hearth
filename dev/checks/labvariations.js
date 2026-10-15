// 🎲 Variations (round 32, labvariations) on a small 2D probe scene with colors, motion, camera and look sliders.
// The ways in (✦ More › ✨ Look & motion, the toolbar's ⋯, the ◎ mission for the Lab director only), its files loading
// on first use, the grid (6 takes, each with a picture made by the preview's own renderer: no new canvas or context),
// the takes differing (values and pictures), a hover peek, applying one as ONE undo step (the layer's own ↶ once, and
// Variations' ↶ with the palette), locks holding, "More like this" staying close, and closing freeing everything.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/labvariations.js --shot /tmp/labvariations.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof LabEasy !== 'undefined', 15000);
const dir = H.agents().find((a) => a.dock === 'three');
const d = ThreeLab.director;
const cmd = await ThreeLab.cmd({ show: true });
const lazyBefore = typeof LabVariations === 'undefined';

// ---------- the probe scene: every group has a live slider ----------
await d.newSketch('variations probe', `const P = tweak({ c1: '#d04a2a', c2: '#2a8ad0', speed: [1, 0, 4], camDist: [1, 0.4, 2], glow: [0.4, 0, 1] });
const c = document.createElement('canvas'); c.width = 320; c.height = 320; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const t0 = performance.now();
function draw() {
  const t = (performance.now() - t0) / 1000;
  g.fillStyle = '#080808'; g.fillRect(0, 0, 320, 320);
  g.fillStyle = P.c2; g.globalAlpha = P.glow; g.fillRect(0, 200, 320, 120); g.globalAlpha = 1;
  const a = t * P.speed; const r = 60 / P.camDist;
  g.fillStyle = P.c1; g.beginPath(); g.arc(160 + Math.cos(a) * 60, 140 + Math.sin(a) * 40, r, 0, 7); g.fill();
  requestAnimationFrame(draw);
}
draw();`, 3);
cmd.size('1:1');
const probe = () => d.layers().layers.find((L) => !/^◐/.test(L.name || ''));
const slid = () => d.sliders(probe().id).sliders || [];
await until(() => slid().some((s) => s.key === 'glow'), 12000);
await wait(1200);
const vals = () => Object.fromEntries(slid().map((s) => [s.key, s.value]));
const base = vals();
d.refs.setPalette(['#ff0000', '#00ff00']);
const canvases0 = document.querySelectorAll('canvas').length;
const frames0 = document.querySelectorAll('iframe').length;

// ---------- ways in ----------
const look = LabEasy.previewGroups().find((x) => /Look & motion/.test(x.label)).items();
step('Right-click the preview › ✨ Look & motion › 🎲 Variations (first row; the Lab audit finds it)', /Variations/.test(look[0]?.label) && LabEasy.placed().has('variations'), look.slice(0, 3).map((x) => x.label));
step('the toolbar\'s ⋯ has 🎲 Variations', LabEasy.toolbarItems().some((r) => /Variations/.test(r[0])));
step('the ◎ mission "Quick variations (free)" is there for the Lab director only', Missions.shown(dir.id).some((m) => m.id === 'lab-quickvars') && !Missions.shown(H.claudeAgent().id).some((m) => m.id === 'lab-quickvars'));

// ---------- open from the menu row ----------
let t0 = performance.now();
look[0].action();
await until(() => typeof LabVariations !== 'undefined' && LabVariations.state().tiles.length === 6 && !LabVariations.busy, 30000);
const msOpen = Math.round(performance.now() - t0);
if (typeof LabVariations === 'undefined' || !LabVariations.card) {
  step('the grid opens', false, { loaded: typeof LabVariations !== 'undefined', toasts: [...document.querySelectorAll('.toast')].map((x) => x.textContent), sliders: slid(), lazy: window.Lazy?.state?.().filter((g) => g.name === 'labvar') });
  return JSON.stringify(out, null, 1);
}
const V = LabVariations;
step('its files load on first use (lazy group "labvar"), then /variations exists', lazyBefore && typeof VarCore !== 'undefined' && Boolean(Commands.get('variations')));
const card = V.card;
const tiles = [...card.querySelectorAll('.lv-tile')];
step('the grid opens over the preview: 6 pictures, the 4 locks, New ones / More like this', card.isConnected && tiles.length === 6 && tiles.every((b) => b.querySelector('img')?.src?.startsWith('data:image')) && card.querySelectorAll('.lv-lock:not([hidden])').length === 4 && /New ones/.test(card.textContent) && /More like this/.test(card.textContent), { ms: msOpen, labels: V.state().tiles.map((t) => t.label) });
const st = V.state();
const sigs = new Set(st.tiles.map((t) => JSON.stringify(t.values)));
const pics = new Set(tiles.map((b) => b.querySelector('img').src));
step('the variations differ: 6 different value sets, each changing something, and different pictures', sigs.size === 6 && st.tiles.every((t) => t.changed > 0) && pics.size >= 5, { pictures: pics.size, leans: st.tiles.map((t) => t.lean) });
step('the scene is back as it was after making them (no undo step left by the pictures)', JSON.stringify(vals()) === JSON.stringify(base) && !document.querySelector('.lv-cover'), vals());
step('no new canvas or WebGL context: the pictures come from the preview\'s own renderer', document.querySelectorAll('canvas').length === canvases0 && document.querySelectorAll('iframe').length === frames0 && V.stats().webgl === 0, V.stats());

// ---------- hover peek ----------
V.peek(1);
const peeked = vals();
V.peek(-1);
step('hover a picture: the preview shows it live; leave: back', Object.entries(st.tiles[1].values).every(([id, v]) => peeked[id.split('|')[1]] === v) && JSON.stringify(vals()) === JSON.stringify(base));

// ---------- apply = one undo step ----------
const pick = st.tiles.findIndex((t) => t.lean === 'colors');
tiles[pick].click();
await wait(400);
const want = Object.fromEntries(Object.entries(st.tiles[pick].values).map(([id, v]) => [id.split('|')[1], v]));
const pal1 = d.refs.palette().slice();
step('click one: its values land, the palette turns with the colors, the tile is marked', JSON.stringify(vals()) === JSON.stringify({ ...base, ...want }) && pal1[0] !== '#ff0000' && V.card.querySelector('.lv-tile.lv-on') && !V.card.querySelector('.lv-undo').hidden, { pal1, hue: st.tiles[pick].hue });
ThreeLab.stageHooks.ctlOf(probe().id).undo();
await wait(200);
step('… as ONE step: the sliders\' own ↶ once puts every value back (the pictures and peeks left no steps)', JSON.stringify(vals()) === JSON.stringify(base), vals());
const palBefore = d.refs.palette().slice(); // (the sliders' own ↶ doesn't cover the palette)
V.card.querySelectorAll('.lv-tile')[pick].click();
await wait(300);
const appliedAgain = JSON.stringify(vals()) === JSON.stringify({ ...base, ...want }) && JSON.stringify(d.refs.palette()) !== JSON.stringify(palBefore);
const undone = await V.undo();
await wait(200);
step('Variations\' ↶ Undo: values and palette back in one call (it knew the sliders had moved meanwhile)', appliedAgain && undone && JSON.stringify(vals()) === JSON.stringify(base) && JSON.stringify(d.refs.palette()) === JSON.stringify(palBefore), { vals: vals(), pal: d.refs.palette() });

// ---------- locks ----------
V.lock('colors', true);
await until(() => !V.busy && V.state().tiles.length && V.state().locks.includes('colors'), 20000);
await wait(200); await until(() => !V.busy, 20000);
const lk = V.state();
const lockBtn = V.card.querySelector('.lv-lock[data-group="colors"]');
step('🔒 Colors: every new take keeps both colors; the chip shows it', lk.tiles.length >= 4 && lk.tiles.every((t) => t.values[`${probe().id}|c1`] === base.c1 && t.values[`${probe().id}|c2`] === base.c2 && t.lean !== 'colors') && lockBtn.classList.contains('on'), lk.tiles.map((t) => t.lean));
V.lock('motion', true);
await wait(200); await until(() => !V.busy, 20000);
const lk2 = V.state();
step('🔒 Motion too: the speed holds in every take, the colors still hold', lk2.tiles.every((t) => t.values[`${probe().id}|speed`] === base.speed && t.values[`${probe().id}|c1`] === base.c1), lk2.tiles.map((t) => t.lean));
V.lock('colors', false); V.lock('motion', false);
await wait(200); await until(() => !V.busy, 20000);

// ---------- More like this ----------
const m0 = V.state().tiles[0];
await V.more(0);
await until(() => !V.busy, 20000);
const ml = V.state();
const span = { speed: 4, camDist: 1.6, glow: 1 };
const far = (t) => Object.keys(span).reduce((s, k) => s + Math.abs(t.values[`${probe().id}|${k}`] - m0.values[`${probe().id}|${k}`]) / span[k], 0);
step('More like this: a new set close to the picked one ("…, a little")', ml.tiles.length >= 4 && ml.tiles.every((t) => /a little|Close to it/.test(t.label)) && ml.tiles.every((t) => far(t) < 1.2), ml.tiles.map((t) => [t.label, Math.round(far(t) * 100) / 100]));

// ---------- the command ----------
const said = await Commands.get('variations').run('status', {});
step('/variations status lists them', /variations:/.test(said) && /1 /.test(said), said);

// ---------- close frees everything ----------
V.peek(2);
V.close();
await wait(200);
const s = V.stats();
step('close: the card, the pictures, the cover and the key handler are gone; the peek is undone; no canvas left', !s.open && s.tiles === 0 && !s.cover && !document.querySelector('.lv-card, .lv-cover') && JSON.stringify(vals()) === JSON.stringify(base) && document.querySelectorAll('canvas').length === canvases0 && s.freed >= 6, { ...s, vals: vals(), base, canvases: [canvases0, document.querySelectorAll('canvas').length] });
const k0 = vals();
document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
await wait(150);
step('… and the 1–6 keys no longer apply anything', JSON.stringify(vals()) === JSON.stringify(k0));

// ---------- the mission: words steer it ----------
const mission = Missions.shown(dir.id).find((m) => m.id === 'lab-quickvars');
mission.submit(dir.id, 'calmer, another angle');
await until(() => V.card && V.state().tiles.length && !V.busy, 20000);
const ms = V.state();
step('◎ "Quick variations (free)" with "calmer, another angle": the takes lean on motion and camera, the motion goes down', ms.tiles.every((t) => ['motion', 'camera'].includes(t.lean)) && ms.tiles.every((t) => t.values[`${probe().id}|speed`] <= base.speed), ms.tiles.map((t) => [t.lean, t.values[`${probe().id}|speed`]]));
await V.open();
await until(() => !V.busy, 20000);
await wait(300);
d.refs.setPalette([]);

out.ok = out.steps.every((x) => x.ok);
out.failed = out.steps.filter((x) => !x.ok).map((x) => x.name);
return JSON.stringify(out, null, 1);
