// (round 158, split158) The Lab timeline's lanes menu: pick, edit and show the animated properties.
// Moved out of tools/three.js as it was, loaded on first use (lazy group `labpartlanes`, tools/three.js labPart): the names
// it reads inside the Lab (the sketch tab: its state, helpers, the other parts' stand-ins) go through K.
(window.LabParts ||= {}).lanes = (K) => {
  // A: show every animated setting of every layer; again (when they all show): hide every lane.
  function toggleAllLanes() {
    const all = K.layersOf();
    const missing = all.some((L) => K.animatedProps(L).some((p) => !K.lanesOf(L).includes(p)));
    for (const L of all) { L.lanes = missing ? [...new Set([...K.lanesOf(L), ...K.animatedProps(L)])] : []; delete L.lane; }
    K.touch();
    K.renderTracksOnly();
    toast(missing ? 'Showing every animated setting (A hides them)' : 'Lanes hidden (A shows every animated setting)', { timeout: 1600 });
  }
  // The ▾ chooser: tick several settings to see their curves at once. With { prop }: switch that lane to another setting.
  function lanePick(id, x, y, { prop: swap = null } = {}) {
    const L = K.layerById(id);
    if (!L) return;
    const shown = K.lanesOf(L);
    const count = (p) => K.keysOf(L, p).length;
    const again = () => lanePick(id, x, y, { prop: swap });
    const items = [];
    const props = K.laneProps(L);
    const row = ({ prop, label }) => {
      const on = shown.includes(prop);
      const hint = count(prop) ? `${count(prop)} points` : '';
      if (swap) return [`${label}${count(prop) ? ' ●' : ''}`, prop === swap ? 'this lane' : on ? `already shown${hint ? ` · ${hint}` : ''}` : hint, () => { if (prop !== swap) K.setLanes(L, on ? shown.filter((p) => p !== swap) : shown.map((p) => (p === swap ? prop : p))); }, prop === swap];
      return [`${on ? '☑' : '☐'} ${label}${count(prop) ? ' ●' : ''}`, hint, () => { K.setLanes(L, on ? shown.filter((p) => p !== prop) : [...shown, prop]); again(); }, on];
    };
    items.push(swap ? 'Switch this lane to' : 'Curves to show (tick several)');
    for (const p of props.filter((q) => !q.prop.startsWith('s:'))) items.push(row(p));
    if (props.some((q) => q.prop.startsWith('s:'))) { items.push('Sliders'); for (const p of props.filter((q) => q.prop.startsWith('s:'))) items.push(row(p)); }
    items.push('Lanes');
    const anim = K.animatedProps(L);
    if (anim.some((p) => !shown.includes(p))) items.push(['Show every animated one', `${anim.length} with points`, () => K.setLanes(L, [...shown, ...anim])]);
    if (swap) items.push(['Hide this lane', 'The animation stays', () => K.setLanes(L, shown.filter((p) => p !== swap))]);
    if (shown.length) items.push(['Hide all of this layer\'s lanes', 'The animation stays', () => K.setLanes(L, [])]);
    items.push(['Every layer: show / hide animated', 'A', () => toggleAllLanes()]);
    if (!swap) {
      items.push('Animate (adds points)');
      for (const pr of ThreeLayers.PRESETS) items.push([pr.name, pr.desc, () => K.applyPreset(id, pr.id)]);
    }
    K.popup(x ?? innerWidth / 2, y ?? innerHeight / 2, items);
  }
  function laneEdit(id, prop, keys, { final }) {
    const L = K.layerById(id);
    if (!L) return;
    L.keys ||= {};
    if (keys.length) L.keys[prop] = [...keys].sort((a, b) => a.t - b.t); else delete L.keys[prop];
    K.sendKeys(L);
    if (final) { K.touch(); K.renderTracksOnly(); K.syncKeyUI(true); }
  }
  return { lanePick, laneEdit, toggleAllLanes };
};
