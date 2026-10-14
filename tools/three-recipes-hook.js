// 📜 Recipes (round 39, labrecipes): what loads with the Lab. The recipes themselves (three-recipes*.js, lazy group
// "labrecipes") load on first use; this small part:
//   · the ways in: ✦ More › 📜 Recipes (● Record a recipe / ■ Stop recording · Use a recipe… · Use on several scenes…),
//     the toolbar's ⋯ row (tools/three-easy.js asks moreItem() / toolbarRow())
//   · the recorder's taps: the Lab's files call LabRecipesHook.note(kind, data) when something meaningful happened and
//     LabRecipesHook.begin(kind, data) → finish(extra | false) around an action made of several changes (an effect
//     applied, a look match, ✨ polish, layers from the gallery). Nothing happens unless a recording is on (the recorder
//     in three-recipes.js sets the sink), except a count for the one discovery tip (Hints).
const LabRecipesHook = (() => {
  let sink = null; // { note(kind, data), begin(kind, data) → finish } while recording
  const finishing = ['fx', 'palette', 'trigger', 'frame', 'look', 'lookmatch', 'autopolish', 'export'];
  function note(kind, data) {
    count(kind);
    if (!sink) return;
    try { sink.note(kind, data || {}); } catch (err) { console.warn('recipes note', err); }
  }
  function begin(kind, data) {
    count(kind);
    if (!sink) return null;
    try { return sink.begin(kind, data || {}); } catch (err) { console.warn('recipes begin', err); return null; }
  }
  const setSink = (s) => { sink = s || null; };

  // ---------- the discovery tip: the same kind of finishing steps on two scenes → "record them once" ----------
  const per = new Map(); // scene id → finishing steps this session
  let offered = false;
  function count(kind) {
    if (offered || sink || !finishing.includes(kind)) return;
    let id = null;
    try { id = ThreeLab.scenes?.currentId?.() || null; } catch { return; }
    if (!id) return;
    per.set(id, (per.get(id) || 0) + 1);
    if ([...per.values()].filter((n) => n >= 2).length < 2) return;
    let saved = 0; try { saved = Number(store.get('three.recipes', 0)) || 0; } catch { /* a convenience */ }
    if (saved || typeof Hints === 'undefined') return;
    offered = true;
    Hints.offer({ id: 'labrecipes-discover', place: 'lab', rank: 2,
      show: () => toast('📜 Same finishing steps on another scene? Record them once as a recipe, then replay them on any scene in one click.', { timeout: 9000, action: { label: '● Record', fn: () => recordIt() } }) });
  }

  // ---------- the ways in ----------
  async function lib(fn = (R) => R.open()) {
    if (typeof LabRecipes === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labrecipes');
    if (typeof LabRecipes === 'undefined') throw new Error('Recipes did not load');
    return fn(LabRecipes);
  }
  const go = (fn) => () => { lib(fn).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })); };
  const recordIt = go((R) => R.toggleRecord());
  const openIt = go((R) => R.open());
  const batchIt = go((R) => R.open({ batch: true }));
  const recording = () => Boolean(sink);
  const rows = () => [
    recording() ? ['■ Stop recording…', 'Name the recipe and keep it', recordIt] : ['● Record a recipe', 'Do your finishing steps once; replay them on any scene (no tokens)', recordIt],
    ['Use a recipe…', 'Your recorded steps on this scene, as one undo step', openIt],
    ['Use on several scenes…', 'One recipe on a few recent scenes in one go', batchIt],
  ];
  // showMenu items (the preview's ✦ More)
  const moreItem = () => ({ label: '📜 Recipes', hint: recording() ? 'recording…' : 'record your finishing steps, replay them anywhere', items: () => rows().map(([label, hint, action]) => ({ label, hint, action, cmd: 'recipe' })) });
  // ThreeTweaks.menu rows (the toolbar's ⋯): [label, hint, fn | rows, checked, usage name]
  const toolbarRow = () => ['📜 Recipes', recording() ? 'Recording… stop it here' : 'Record your finishing steps once, replay them on any scene', rows(), false, 'Recipes'];
  return { note, begin, setSink, recording, moreItem, toolbarRow, lib, recordIt, openIt, batchIt };
})();
window.LabRecipesHook = LabRecipesHook; // the Lab's taps call it as window.LabRecipesHook?.… (some load before it)
