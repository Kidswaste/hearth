// The Lab gallery's ways in (round 27, gallery), loaded with the Lab; the gallery itself (tools/three-gallery*.js)
// loads the first time one is used (lazy group "gallery"):
//   · the Lab's New (Sketch ▾ › New…, the sketch list's ＋ New sketch, "Lab: New sketch from a template"): the gallery
//     instead of the plain list of code templates (tools/three.js templateGallery asks LabGalleryHook.open first)
//   · a chip on a new chat's untouched starter scene: "🖼 Start from something like…" (× hides it for that scene)
//   · the director's ◎ mission "Start from something like…": your words search the gallery; the scene you pick
//     opens and your message then goes to the director as written, with a short line saying what you started from
const LabGalleryHook = (() => {
  function open(opts = {}) {
    const go = () => LabGallery.open(opts);
    const g = typeof Lazy !== 'undefined' ? Lazy.state?.().find((x) => x.name === 'gallery') : null;
    if (!g) return false; // (no lazy group: the Lab's plain list of templates)
    if (g.state === 'loaded') { go(); return true; }
    Lazy.load('gallery').then(go).catch((err) => toast(`The gallery didn't load: ${err.message}`, { type: 'error' }));
    return true;
  }

  // ---------- the ◎ mission ----------
  const inLab = (id) => H.agent?.(id)?.dock === 'three';
  const MISSION = {
    id: 'lab-start', icon: '🖼', label: 'Start from something like…',
    desc: 'Your words search the gallery of starting points (tunnels, chrome blobs, retro grids, particles, type openers… your own scenes too); pick one, it opens as a new scene, then the director makes it yours with your words.',
    submit(agentId, text, t) {
      const ok = open({ query: t.split(/\s+/).slice(0, 12).join(' '), onPick: (item) => {
        if (!item) { Native.setDraft?.(agentId, text); return; } // closed without a pick: your words back in the box
        Native.send(agentId, `🖼 Started from "${item.name}" (the gallery).\n\n${text}`).catch((err) => toast(err.message, { type: 'error' }));
      } });
      return ok;
    },
  };
  if (typeof Missions !== 'undefined' && Missions.add) Missions.add({ ...MISSION, when: inLab });

  // ---------- the chip on a new chat's untouched starter ----------
  const DRAFT_KEY = 'scenes.draft.three'; // chat-scenes.js: the open "new chat" starter (reused while nobody touched it)
  const hidden = new Set();
  let chip = null;
  function paintChip() {
    const sc = typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null;
    const id = sc?.currentId();
    const want = Boolean(id && store.get(DRAFT_KEY, null)?.id === id && !hidden.has(id));
    const hostEl = sc?.previewHost?.();
    if (!want || !hostEl) { chip?.remove(); return; }
    if (!chip) {
      chip = el('div', { class: 'lab-gal-chip-start' },
        el('button', { type: 'button', text: '🖼 Start from something like…', title: 'Tunnels, chrome blobs, retro grids, particles, type openers, your own scenes…', on: { click: () => open() } }),
        el('button', { type: 'button', class: 'x', text: '×', title: 'Hide', on: { click: () => { hidden.add(ThreeLab.scenes.currentId()); chip.remove(); } } }));
      if (typeof LabInstantHook !== 'undefined') LabInstantHook.decorate(chip); // (round 29) ✦ Describe it
    }
    if (getComputedStyle(hostEl).position === 'static') hostEl.style.position = 'relative';
    if (chip.parentNode !== hostEl) hostEl.append(chip);
  }
  const later = () => setTimeout(paintChip, 300);
  addEventListener('hearth:sketch', later);
  addEventListener('hearth:scene-changed', (e) => { if (e.detail?.id === ThreeLab?.scenes?.currentId()) later(); });
  setTimeout(paintChip, 1500);
  return { open, paintChip, MISSION };
})();
