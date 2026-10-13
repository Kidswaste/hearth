// Packs' ways in (round 28, packs), loaded with the Lab; the packs themselves (tools/three-packs.js, packs-core.js)
// load the first time one is used (lazy group "packs"):
//   · the Lab's Sketch ▾ › Share › Save as a pack… / Save its sequence as a pack… / Open a pack…
//   · the preview's right-click › ✦ More › ⇪ Share (the same rows)
//   · the gallery's right-click on any card › ⇪ Save as a pack…
//   · a .hearthpack dropped anywhere on Hearth, or opened from Finder / Explorer (main.js 'packs:open'): the preview
//     card first (nothing is added until "Add as a new scene")
const LabPacksHook = (() => {
  const isPack = (name) => /\.hearthpack$/i.test(String(name || ''));
  async function lib() {
    if (typeof Lazy !== 'undefined' && Lazy.state?.().some((g) => g.name === 'packs')) await Lazy.load('packs');
    if (typeof LabPacks === 'undefined') throw new Error('Packs did not load');
    return LabPacks;
  }
  const go = (fn) => () => { lib().then(fn).catch((err) => toast(err.message, { type: 'error', timeout: 7000 })); };
  const sceneId = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.currentId() : null);
  const hasSeq = (id) => Boolean(id && typeof ThreeSeq !== 'undefined' && ThreeSeq.summaryFor?.(id));

  // ThreeTweaks.menu / the Sketch ▾ popup rows: [label, hint, fn | rows]
  function rows(idOf = sceneId) {
    const id = idOf();
    return [
      ['⇪ Save as a pack…', 'The scene and every file it uses (textures, models, fonts, LUTs, the song) as one file to share', go((P) => P.saveScene(idOf()))],
      ...(hasSeq(id) ? [['⇪ Save its sequence as a pack…', 'The sequence, every scene in it and its footage', go((P) => P.saveSequence(idOf()))]] : []),
      ['Open a pack…', 'A .hearthpack: see what\'s in it first · or drop one anywhere on Hearth', go((P) => P.pickAndOpen())],
    ];
  }
  const sketchRow = (idOf) => ['Share', 'Save this scene as one file, open one', rows(idOf)];
  // showMenu items (the preview's ✦ More)
  const moreItem = () => ({ label: '⇪ Share', hint: 'save as a pack, open one', items: () => rows().map(([label, hint, action]) => ({ label, hint, action })) });
  // the gallery's right-click on a card (picture: its card's picture, for the pack)
  const galleryItem = (it, picture) => ({ label: '⇪ Save as a pack…', hint: 'One file to share: its layers and what they use', action: go((P) => P.saveGalleryItem(it, picture?.() || null)) });

  // ---------- a .hearthpack dropped anywhere ----------
  // while dragging, the names aren't known yet: files of no known type (a .hearthpack has none) may be dropped
  addEventListener('dragover', (e) => {
    const dt = e.dataTransfer;
    if (!dt?.types?.includes('Files') || e.defaultPrevented) return;
    const items = [...(dt.items || [])];
    if (items.length && items.every((i) => i.kind === 'file' && !i.type)) { e.preventDefault(); dt.dropEffect = 'copy'; }
  });
  addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    const f = files.find((x) => isPack(x.name));
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    let p = null;
    try { p = window.hub.pathForFile(f); } catch { /* no path */ }
    if (!p) { toast('That pack has no path on this computer', { type: 'error' }); return; }
    go((P) => P.openFile(p))();
  }, true);
  // another file of no known type dropped where nothing takes it: nothing happens (as before this drop was allowed)
  addEventListener('drop', (e) => { if (!e.defaultPrevented && e.dataTransfer?.types?.includes('Files') && [...(e.dataTransfer.items || [])].every((i) => !i.type)) e.preventDefault(); });
  // opened from Finder / Explorer (or a second launch with the file)
  window.hub?.packs?.onOpen?.((p) => { if (isPack(p)) go((P) => P.openFile(p))(); });
  setTimeout(() => { window.hub?.packs?.pending?.().then((p) => { if (isPack(p)) go((P) => P.openFile(p))(); }).catch(() => {}); }, 2500);

  return { rows, sketchRow, moreItem, galleryItem, lib, isPack };
})();
