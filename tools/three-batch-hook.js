// ⧉ Make a batch (round 42, labbatch): what loads with the Lab. The batch itself (three-batch*.js, lazy group
// "labbatch", after My templates and All formats) loads on first use; this small part gives it its ways in:
//   · right-click the preview › ⇪ Make & export › ⧉ Make a batch… (tools/three-easy.js asks item()) · the toolbar's ⋯ (toolbarRow())
//   · 📐 My templates: a card's right-click and the picker's foot (tools/three-templates.js asks open())
//   · Lab search finds those menu rows; ⌘/Ctrl+K "Lab: Make a batch…" comes from the lazy manifest
const LabBatchHook = (() => {
  async function lib(fn = (B) => B.open()) {
    if (typeof LabBatch === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labbatch');
    if (typeof LabBatch === 'undefined') throw new Error('Make a batch did not load');
    return fn(LabBatch);
  }
  const open = (o = {}) => { lib((B) => B.open(o)).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })); };
  const HINT = 'one template → many videos: a list of titles, a CSV, every song in a folder';
  const item = () => ({ label: '⧉ Make a batch…', hint: HINT, cmd: 'batch', action: () => open() });
  const toolbarRow = () => ['⧉ Make a batch…', HINT, () => open(), false, 'Make a batch'];
  return { item, toolbarRow, open, lib };
})();
