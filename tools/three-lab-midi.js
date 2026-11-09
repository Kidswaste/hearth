// (round 158, split158) The Lab's MIDI controllers: learn, the MIDI menu, incoming notes and knobs.
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labpartmidi`, tools/three.js labPart). K is
// what it reaches inside the Lab (the sketch tab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).midi = (K) => {
  async function midiInit() {
    if (K.midi) return true;
    if (!navigator.requestMIDIAccess) { toast('MIDI is not available here', { type: 'error' }); return false; }
    try { K.midi = await navigator.requestMIDIAccess(); } catch (err) { toast(`Couldn't open MIDI: ${err.message}`, { type: 'error' }); return false; }
    const hook = () => { for (const inp of K.midi.inputs.values()) inp.onmidimessage = onMidi; renderMidiBtn(); };
    K.midi.onstatechange = hook;
    hook();
    store.set('three.midiOn', true);
    return true;
  }
  function renderMidiBtn() {
    const n = K.midiDevices().length;
    K.midiBtn.textContent = n ? '🎛 MIDI ●' : '🎛 MIDI';
    K.midiBtn.classList.toggle('on', Boolean(n));
    K.midiBtn.title = n ? `MIDI: ${K.midiDevices().join(', ')}` : 'Use a MIDI controller: knobs move sliders, pads drop kick / snare / hit markers';
  }
  function onMidi(e) {
    const [st, d1, d2 = 0] = e.data;
    const type = st & 0xf0; const ch = (st & 0x0f) + 1;
    if (type === 0xB0) {
      const id = `${ch}:cc${d1}`;
      K.midiSeen = `CC ${d1} (channel ${ch})`;
      if (K.midiLearn?.stage === 'control') {
        K.midiMap()[id] = { layer: K.midiLearn.layer, key: K.midiLearn.key, label: K.midiLearn.label };
        K.saveExtras();
        toast(`${K.midiSeen} → ${K.midiLearn.label}`, { timeout: 2200 });
        K.midiLearn = null;
        return;
      }
      const m = K.midiMap()[id];
      if (m) midiApply(m, d2 / 127);
    } else if (type === 0x90 && d2 > 0) {
      const id = `${ch}:n${d1}`;
      if (K.midiLearn?.stage === 'pad') {
        store.set('three.midiPads', { ...K.midiPads(), [id]: K.midiLearn.action });
        toast(`Pad (note ${d1}) → ${K.PAD_ACTIONS.find((a) => a[0] === K.midiLearn.action)[1]}`, { timeout: 2200 });
        K.midiLearn = null;
        return;
      }
      const act = K.midiPads()[id];
      if (act === 'kick' || act === 'snare' || act === 'hit') K.player.tapHit(act);
      else if (act === 'play') K.player.toggle();
      else if (act === 'write') K.setWrite(!K.writeArmed);
      else if (act === 'note') K.takeNote();
    }
  }
  // A knob position (0..1) → the control's range; the gesture "releases" 300 ms after the knob stops.
  function midiApply(m, u) {
    const L = K.layerById(m.layer);
    if (!L) return;
    const rel = `${m.layer}|${m.key}`;
    if (m.key.startsWith('p:')) {
      const prop = m.key.slice(2); const meta = ThreeLayers.ANIM_META[prop];
      const v = Math.round((meta.min + u * (meta.max - meta.min)) / meta.step) * meta.step;
      K.editLayer(L.id, { [prop]: v }, { live: true });
      clearTimeout(K.midiRelease[rel]);
      K.midiRelease[rel] = setTimeout(() => K.editLayer(L.id, { [prop]: v }), 300);
      return;
    }
    const c = K.controllers.get(L.id);
    const info = c?.controls().find((x) => x.key === m.key);
    if (!info) return;
    let v;
    if (info.options) v = info.options[Math.min(info.options.length - 1, Math.floor(u * info.options.length))];
    else if (typeof info.value === 'boolean') v = u >= 0.5;
    else if (info.min != null) { v = info.min + u * (info.max - info.min); v = info.step ? Math.round(v / info.step) * info.step : Math.round(v * 1000) / 1000; }
    else return;
    c.setByKey(m.key, v);
    clearTimeout(K.midiRelease[rel]);
    K.midiRelease[rel] = setTimeout(() => c.setByKey(m.key, v, { release: true }), 300);
  }
  async function midiMenu(anchor) {
    const ok = await midiInit();
    const r = anchor.getBoundingClientRect();
    const devs = K.midiDevices();
    const maps = Object.entries(K.midiMap());
    const pads = Object.entries(K.midiPads());
    K.popup(r.left, r.bottom + 4, [
      !ok ? 'MIDI is not available' : devs.length ? `Connected: ${devs.join(', ')}` : 'No MIDI device found: plug one in (it shows up by itself)',
      ['Learn a knob for a slider', 'Move a slider, then turn a knob or fader', () => { K.midiLearn = { stage: 'slider' }; K.setSlidersVisible(true); toast('Move the slider you want, then turn a knob', { timeout: 4000 }); }],
      K.sel() ? ['Learn a knob for the layer\'s opacity', `"${K.sel().name}"`, () => { K.midiLearn = { stage: 'control', layer: K.sel().id, key: 'p:opacity', label: `${K.sel().name} opacity` }; toast('Turn a knob or fader', { timeout: 4000 }); }] : null,
      'Pads',
      ...K.PAD_ACTIONS.map(([a, label]) => [`Learn a pad: ${label}`, Object.entries(K.midiPads()).filter(([, v]) => v === a).map(([k]) => `note ${k.split(':n')[1]}`).join(', ') || 'not set', () => { K.midiLearn = { stage: 'pad', action: a }; toast('Hit the pad', { timeout: 4000 }); }]),
      maps.length || pads.length ? 'Your mappings (click to remove)' : null,
      ...maps.map(([k, m]) => [`${m.label}`, `CC ${k.split(':cc')[1]} · ch ${k.split(':')[0]}`, () => { delete K.midiMap()[k]; K.saveExtras(); }]),
      ...pads.map(([k, a]) => [`Pad → ${K.PAD_ACTIONS.find((x) => x[0] === a)?.[1] || a}`, `note ${k.split(':n')[1]}`, () => { const p = K.midiPads(); delete p[k]; store.set('three.midiPads', p); }]),
      typeof ThreeStage !== 'undefined' ? ['🎚 Live performance (VJ)…', 'Learn with soft takeover, pads, set list, crossfader, output, show mode', () => ThreeStage.menu(r.left, r.bottom + 4)] : null,
      K.midiSeen ? 'Last control moved' : null,
      K.midiSeen ? [K.midiSeen, 'Learn mode maps the next one you move', () => {}] : null,
    ]);
  }
  return { midiInit, onMidi, midiMenu };
};
