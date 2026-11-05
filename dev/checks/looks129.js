// (round 129, looks129) The project's look on a Lab scene (docs/upgrades/looks129.md), in one check:
//   1. a project with a palette and a two-layer scene in it: the Lab's toolbar shows the ◆ Project look strip with the
//      project's swatches (the lazy group "projlook" loads for a project's scene)
//   2. pointing at Apply shows it on the preview (the color sliders move), moving away puts them back
//   3. a click on Apply: every unlocked color slider gets a palette color (read back from the sliders), the 🔒 one stays
//   4. ONE Ctrl/⌘+Z in the Lab puts every layer's colors back
//   5. 🖼 from the moodboard: two pictures made here (red / navy, yellow) on the project's board → the project's palette
//      has their colors (read on this computer, no AI) and the strip shows them; Save as a look → a saved look per layer
//   6. the AI: a director's three_do looks { action: "project", strength: "subtle" } through the fake engine (real MCP
//      route) recolors the scene, as one undo step of its reply
// Only the check's own temp data (smoke.js) and pictures in its temp folder (SMOKE_TMP); never an owner's scene.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/looks129.js --shot /tmp/looks129.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const DIR = `${window.SMOKE_TMP || '/tmp'}/hearth-looks129`;
const PAL = ['#1a0b2e', '#ff2e88', '#00e5ff', '#ffd400', '#f5f0ff'];

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.LabMatHook?.host(), 60000);
  try { cmd.size('16:9'); } catch { /* the default */ }
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;

  const code = (sliders, extra = '') => `import * as THREE from 'three';
const P = tweak(${sliders});
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 96, 12), new THREE.MeshBasicMaterial({ color: P.tint }));
scene.add(mesh);${extra}
renderer.setAnimationLoop(() => { mesh.rotation.y += 0.01; mesh.material.color.set(P.tint); renderer.render(scene, cam); });`;
  const BACK = code("{ bg: { value: '#202020', label: 'Background' }, tint: { value: '#808080', label: 'Tint' }, size: [1, 0.2, 3] }", "\nscene.background = new THREE.Color(P.bg);");
  const FRONT = code("{ tint: { value: '#40a040', label: 'Tint' }, rim: { value: '#c0c0c0', label: 'Rim' } }");

  // ---------- 1. a project with a palette, its scene in the Lab: the strip ----------
  const P = Projects.create({ name: 'Looks check' });
  Projects.setWorkspace(P, { palette: PAL });
  const layers = [ThreeLayers.defaults({ id: 'lkBack', name: 'Back', code: BACK, slot: 0 }), ThreeLayers.defaults({ id: 'lkFront', name: 'Front', code: FRONT, slot: 1 })];
  const sk = SC.create({ name: 'Looks check scene', code: BACK, layers, frame: '16:9' });
  Projects.add(P, 'scene', sk.id, sk.name, { links: false });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && hk.ctlOf('lkFront')?.controls().some((c) => c.key === 'rim'), 20000);
  const strip = () => document.querySelector('.lab-projlook');
  const shown = await until(() => strip() && !strip().hidden && strip().querySelectorAll('.lab-swatch').length === PAL.length, 15000);
  const sw = () => [...(strip()?.querySelectorAll('.lab-swatch') || [])].map((b) => b.style.background);
  step('a project scene: the Lab\'s toolbar shows the ◆ Project look strip with the project\'s swatches', shown && Boolean(strip().closest('.three-toolbar')) && strip().getBoundingClientRect().width > 40, { swatches: sw().length, apply: Boolean(strip()?.querySelector('.pl-apply')), width: Math.round(strip()?.getBoundingClientRect().width || 0), why: (() => { const out2 = []; for (let n = strip(); n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || n.hidden || cs.visibility === 'hidden') out2.push(`${n.tagName}.${n.className}`); } return out2; })() });
  await smoke({ shot: `${DIR}-strip0.png` }).catch(() => {});

  const colors = () => Object.fromEntries(['lkBack', 'lkFront'].map((id) => [id, Object.fromEntries(hk.ctlOf(id).controls().filter((c) => typeof c.value === 'string' && /^#/.test(c.value)).map((c) => [c.key, c.value]))]));
  const before = colors();
  hk.ctlOf('lkFront').lock('rim', true);

  // ---------- 2. point at Apply: a preview, nothing kept ----------
  const applyBtn = () => strip().querySelector('.pl-apply');
  applyBtn().dispatchEvent(new MouseEvent('mouseenter'));
  await wait(150);
  const peek = colors();
  applyBtn().dispatchEvent(new MouseEvent('mouseleave'));
  await wait(150);
  step('pointing at Apply previews the palette (the sliders move), moving away puts them back', PAL.includes(peek.lkBack.tint) && JSON.stringify(colors()) === JSON.stringify(before), { peek, back: colors() });

  // ---------- 3. Apply: the colors read back ----------
  applyBtn().click();
  await wait(250);
  const now = colors();
  const unlocked = [now.lkBack.bg, now.lkBack.tint, now.lkFront.tint];
  step('Apply puts the palette on every unlocked color slider (read back from the sliders)', unlocked.every((c) => PAL.includes(c)) && now.lkBack.bg !== before.lkBack.bg, now);
  step('the 🔒 locked slider is kept (the default)', now.lkFront.rim === before.lkFront.rim && hk.ctlOf('lkFront').locked('rim'), { rim: now.lkFront.rim });
  step('dark stays dark: the background gets the palette\'s darkest color', now.lkBack.bg === '#1a0b2e', now.lkBack);
  await smoke({ shot: `${DIR}-strip.png` }).catch(() => {});

  // ---------- 4. ONE Ctrl/⌘+Z in the Lab: every layer back ----------
  hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, metaKey: false, bubbles: true, cancelable: true }));
  await wait(250);
  step('one Ctrl/⌘+Z in the Lab puts every layer\'s colors back', JSON.stringify(colors()) === JSON.stringify(before), colors());

  // ---------- 5. the moodboard's pictures → the project's palette; Save as a look ----------
  const png = async (name, parts) => {
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 80; const g = cv.getContext('2d');
    let x = 0; for (const [c, w] of parts) { g.fillStyle = c; g.fillRect(x, 0, w, 80); x += w; }
    const p = `${DIR}/${name}`; await window.hub.fs.write(p, cv.toDataURL('image/png').split(',')[1], { base64: true }); return p;
  };
  await window.hub.fs.write(`${DIR}/.keep`, '');
  const pics = [await png('redblue.png', [['#e0103a', 70], ['#101860', 50]]), await png('yellow.png', [['#ffd400', 120]])];
  const boardId = `lk129${Date.now().toString(36)}`;
  await window.hub.kvSet(`board-${boardId}`, { id: boardId, name: 'Looks moodboard', items: pics.map((src, i) => ({ id: `pic${i}`, type: 'image', src, x: i * 300, y: 0, w: 240, h: 160 })), view: { x: 0, y: 0, z: 1 } });
  Projects.add(P, 'board', boardId, 'Looks moodboard', { links: false });
  Projects.setWorkspace(P, { boardId });
  const cols = await LabProjLook.fromBoard(Projects.get(P.id));
  const near = (a, b) => { const x = parseInt(a.slice(1), 16); const y = parseInt(b.slice(1), 16); return Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255)) < 40; };
  const hasAll = ['#e0103a', '#101860', '#ffd400'].every((c) => cols.some((x) => near(x, c)));
  await until(() => sw().length === cols.length, 5000);
  step('🖼 from the moodboard: the pictures\' colors (read here, no AI) become the project\'s palette and its swatches', hasAll && JSON.stringify(Projects.get(P.id).workspace.palette) === JSON.stringify(cols) && sw().length === cols.length, cols);
  LabProjLook.apply();
  await wait(200);
  const saved = LabProjLook.saveLook('Project look');
  const looks = ['lkBack', 'lkFront'].map((id) => hk.ctlOf(id).looksApi.list());
  step('Save as a look: the recolored sliders are a saved look on each layer (three_looks)', saved.layers === 2 && looks.every((l) => l.includes('Project look')), looks);
  LabProjLook.undo({ quiet: true });
  await wait(200);
  hk.ctlOf('lkFront').lock('rim', false);

  // ---------- 6. the AI: three_do looks { action: "project" } through the fake engine ----------
  Native.newChat(agent.id);
  await wait(600);
  const chatId = H.activeChat[agent.id];
  ChatScenes.link(chatId, sk.id, { rename: false });
  if (SC.currentId() !== sk.id) SC.open(sk.id); // (a new director chat may open a scene of its own)
  await until(() => SC.currentId() === sk.id && hk.ctlOf('lkFront')?.controls().some((c) => c.key === 'rim'), 20000);
  const b6 = colors();
  await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'looks', action: 'project', strength: 'subtle' }]])}`);
  await until(() => !Native.isBusy(chatId), 90000);
  await wait(400);
  const a6 = colors();
  const moved = ['lkBack', 'lkFront'].flatMap((id) => Object.keys(a6[id]).filter((k) => a6[id][k] !== b6[id][k]));
  const subtle = a6.lkBack.tint !== b6.lkBack.tint && !Projects.get(P.id).workspace.palette.includes(a6.lkBack.tint);
  const last = Native.current(agent.id)?.messages.at(-1);
  step('the AI\'s three_do looks { action: "project", strength: "subtle" } recolors the scene (halfway: not the palette\'s own colors)', moved.length >= 3 && subtle, { moved, tint: a6.lkBack.tint, reply: String(last?.text || '').slice(0, 160) });
  await Commands.tryRun('/undo-edit', agent.id, null, { say: () => {}, note: () => {}, error: () => {} });
  await until(() => JSON.stringify(colors()) === JSON.stringify(b6), 8000);
  step('the AI\'s look is one undo step of its reply (/undo-edit puts every color back)', JSON.stringify(colors()) === JSON.stringify(b6), colors());
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
