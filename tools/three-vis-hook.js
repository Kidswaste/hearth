// 🎵 Music visualizers (round 50, labvisualizers): what loads with the Lab. The picker itself (three-vis*.js, lazy group
// "labvis") loads on first use; this small part gives it its ways in:
//   · right-click the preview › ＋ Add › 🎵 Music visualizer… (addItem(), tools/three.js)
//   · right-click a 🎵 layer › 🎵 Visualizer › Another look… / Listens to › (layerMenu(), tools/three.js + three-easy.js)
const LabVisHook = (() => {
  async function lib(fn = (V) => V.open()) {
    if (typeof LabVis === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labvis');
    if (typeof LabVis === 'undefined') throw new Error('The music visualizers did not load');
    return fn(LabVis);
  }
  const go = (fn) => () => { lib(fn).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })); };
  const N = 17;
  const isVis = (code) => /\bvisualizer\s*\(\s*P\s*,/.test(String(code || ''));
  const addItem = () => ({ label: '🎵 Music visualizer…', hint: `${N} looks that move with the song`, tip: 'Spectrum bars, a waveform, an oscilloscope, rings and bursts on the kick, a starfield, a tunnel, a VU meter, your logo bouncing… one click, renders exactly like the preview.', tags: 'music visualizer visualiser spectrum equalizer eq bars waveform oscilloscope scope vu meter spectrogram audio reactive starfield tunnel rings burst logo bounce beat flash', action: go((V) => V.open()) });
  // a 🎵 layer's right-click rows ([label, hint, fn | rows]: the layer menus' row format)
  function layerMenu(L) {
    if (!L || !isVis(L.code)) return [];
    const LIS = ['whole', 'bass', 'mids', 'highs', 'kick', 'snare', 'beat'];
    return [['🎵 Visualizer', 'another look, what it listens to', [
      ['Another look…', 'the picker, on this layer', go((V) => V.open({ layer: L.id }))],
      ['Listens to', '', LIS.map((k) => [k === 'whole' ? 'Whole song' : k[0].toUpperCase() + k.slice(1), '', go((V) => V.setOn(L.id, { listen: k }))])],
    ]]];
  }
  return { lib, addItem, layerMenu, isVis };
})();
window.LabVisHook = LabVisHook;
