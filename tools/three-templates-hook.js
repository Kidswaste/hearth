// 📐 My templates (round 35, labtemplates): what loads with the Lab. The templates themselves (three-templates*.js, lazy
// group "labtemplates") load on first use; this small part gives them their ways in:
//   · ✦ More › 📐 My templates › New from my template… / Save as my template… (tools/three-easy.js asks moreItem())
//   · the toolbar's ⋯ › 📐 My templates (toolbarRow()) · Sketch ▾ › 📐 My templates (sketchRow(), tools/three.js)
//   · the gallery ("Start from something like…"): a row "📐 My templates" on top once there is one (galleryRow())
const LabTemplatesHook = (() => {
  async function lib(fn = (T) => T.open()) {
    if (typeof LabTemplates === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labtemplates');
    if (typeof LabTemplates === 'undefined') throw new Error('My templates did not load');
    return fn(LabTemplates);
  }
  const go = (fn) => () => { lib(fn).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })); };
  const openIt = go((T) => T.open());
  const saveIt = go((T) => T.saveDialog());
  const count = () => { try { return Number(store.get('three.myTemplates', 0)) || 0; } catch { return 0; } };
  const NEW = ['New from my template…', 'Your own starting points: fill in a short form, get a new scene (no tokens)', openIt];
  const SAVE = ['Save as my template…', 'This scene as a starting point: its words, colors, pictures and sliders become a form', saveIt];
  // showMenu items (the preview's ✦ More)
  const moreItem = () => ({ label: '📐 My templates', hint: 'start from one of yours · save this scene as one', items: () => [NEW, SAVE].map(([label, hint, action]) => ({ label, hint, action, cmd: 'my-template' })) });
  // ThreeTweaks.menu / the Sketch ▾ popup rows: [label, hint, fn | rows, checked, usage name]
  const toolbarRow = () => ['📐 My templates', 'New from one of yours, or save this scene as one (no tokens)', [NEW, SAVE], false, 'My templates'];
  const sketchRow = () => ['📐 My templates', count() ? `${count()} saved · new from one, save this one` : 'Save this scene as a starting point', [NEW, SAVE]];
  // the gallery's top row (once there is a template): one click to the picker
  function galleryRow(closeGallery) {
    const n = count();
    if (!n) return null;
    return el('button', { type: 'button', class: 'lab-inst-galrow lt-gal-row', title: 'Your own starting points: fill in a short form, get a new scene',
      on: { click: () => { closeGallery?.(); openIt(); } } },
    el('b', { text: `📐 My templates (${n})` }), el('span', { class: 'muted', text: ' · start from one of yours: fill in its words, colors, pictures and sliders' }));
  }
  return { moreItem, toolbarRow, sketchRow, galleryRow, lib, openIt, saveIt, count };
})();
