// ◉ Looks for 3D things (round 50, labmaterials): what loads with the Lab. The picker and the looks themselves
// (tools/three-materials-core.js + tools/three-materials.js, lazy group "labmaterials") load on first use; this small part:
//   · the ways in: ◉ Look › on a picked 3D thing's outline (tools/three-direct.js), ◉ Look › in the scene editor's
//     selection (the 3D gizmo), right-click the preview › ✨ Look & motion › ◉ Material…, Lab search ("material",
//     "chrome", "glass"…), Ctrl/⌘+K, /material in any chat, three_do material for the directors (details in its help)
//   · the preview's answers (thumbnails, what a pick names) by request id
// Nothing runs and nothing is in any prompt until one of them is used (0 tokens).
const LabMatHook = (() => {
  let h = null; // the Lab's host (tools/three.js): send, pane, previewHost, frame, layerById, sel, select, layers, sketchId, palette, setLook
  const waits = new Map(); let seq = 0;
  function attach(host) { h = host; }
  // a question to the preview page, answered by its id (null after ms)
  function ask(msg, ms = 10000) {
    if (!h) return Promise.resolve(null);
    const id = `lk${++seq}`;
    return new Promise((res) => {
      const t = setTimeout(() => { waits.delete(id); res(null); }, ms);
      waits.set(id, (m) => { clearTimeout(t); waits.delete(id); res(m); });
      h.send({ ...msg, id });
    });
  }
  function onBox(msg) { if (msg?.id && waits.has(msg.id)) waits.get(msg.id)(msg); }
  async function lib() {
    if (typeof LabMaterials === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labmaterials');
    if (typeof LabMaterials === 'undefined') throw new Error('The looks did not load');
    return LabMaterials;
  }
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  async function lab() {
    if (typeof ThreeLab !== 'undefined') await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 60 && !h; i += 1) await new Promise((r) => setTimeout(r, 50));
    if (!h) throw new Error('Open the Three.js Lab first');
  }
  // open the picker on a layer (its id; the selected one otherwise) and maybe one object of it (path, as the scene editor names it)
  function open(t = {}) { return lab().then(lib).then((M) => M.open(t)).catch(err); }
  const TAGS = 'material materials look surface texture shader chrome metal metallic brushed gold mirror glass frosted plastic glossy ceramic clay matte rubber velvet holographic iridescent neon glow emissive toon cartoon wireframe xray x-ray shiny reflective';
  // the menu row: the picker first, then each look by name for the selected layer (Lab search finds "chrome", "glass"… here)
  const NAMES = [['chrome', 'Chrome'], ['brushed', 'Brushed metal'], ['gold', 'Gold'], ['mirror', 'Mirror'], ['glass', 'Glass'], ['frosted', 'Frosted glass'], ['plastic', 'Glossy plastic'], ['ceramic', 'Ceramic'], ['clay', 'Matte clay'], ['rubber', 'Rubber'], ['velvet', 'Velvet'], ['holo', 'Holographic'], ['neon', 'Neon'], ['toon', 'Toon'], ['wire', 'Wireframe'], ['xray', 'X-ray']];
  const quick = (k) => lab().then(lib).then((M) => M.quick(k)).catch(err);
  const previewItem = () => ({ label: '◉ Material', hint: 'chrome, glass, gold…', tip: 'Give a 3D thing its look in one click: chrome, brushed metal, gold, mirror, glass, frosted glass, plastic, ceramic, clay, rubber, velvet, holographic, neon, toon, wireframe, x-ray', tags: TAGS, items: () => [
    { label: '◉ Pick a look…', hint: 'balls you can try', tip: 'The picker: point at a ball to try it on the selected 3D layer, click to use it; color and shine', tags: TAGS, action: () => open({}) },
    '-', ...NAMES.map(([k, name]) => ({ label: name, tip: `${name} on the selected 3D layer (one Ctrl/⌘+Z)`, tags: `material ${k}`, action: () => quick(k) })),
    { label: 'Original', tip: 'Take the look off the selected layer', action: () => quick(null) },
  ] });
  // 📜 a recipe step (tools/three-recipes.js)
  const replay = (s) => lib().then((M) => M.replay(s));

  // ---------- chats: /material ----------
  try {
    if (typeof Commands !== 'undefined' && !Commands.get('material')) {
      Commands.register({
        name: 'material', area: 'Three.js Lab', aliases: ['look-3d'],
        desc: 'A material look for the selected 3D layer or model: chrome, brushed metal, gold, mirror, glass, frosted glass, plastic, ceramic, clay, rubber, velvet, holographic, neon, toon, wireframe, x-ray; [#hex] [shine 0–100]; off · list · undo; no words: the picker',
        args: '[look] [#hex] [shine N] | off | list | undo',
        keywords: TAGS,
        async run(args, ctx) { await lab(); const M = await lib(); return M.command(String(args || '').trim(), ctx); },
        complete: (s) => ['chrome', 'brushed metal', 'gold', 'mirror', 'glass', 'frosted glass', 'plastic', 'ceramic', 'clay', 'rubber', 'velvet', 'holographic', 'neon', 'toon', 'wireframe', 'x-ray', 'off', 'list', 'undo'].filter((x) => x.startsWith(String(s || '').toLowerCase())),
      });
    }
  } catch { /* commands optional */ }
  // ⌘/Ctrl+K (also what Find anything and Lab search list)
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: ◉ Material look for 3D (chrome, glass, gold, plastic, velvet, neon…)', () => open({}));
  // the directors: three_do material (lean list unchanged; its words come with help material)
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_material'], async (tool, args, ctx) => {
    try { const M = await lib(); return { ok: true, value: await M.op(args || {}, ctx || {}) }; } catch (e) { return { ok: false, error: e.message }; }
  });

  return { attach, onBox, ask, open, previewItem, replay, host: () => h, get loaded() { return typeof LabMaterials !== 'undefined'; } };
})();
window.LabMatHook = LabMatHook;
