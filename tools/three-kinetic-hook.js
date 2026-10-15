// 🅰 Text that moves (round 45, kinetictype): what loads with the Lab. The presets themselves (three-kinetic*.js, lazy
// group "kinetictype") load on first use; this small part gives them their ways in:
//   · right-click the preview › ＋ Add › 🅰 Text that moves… (addItem(), tools/three.js)
//   · right-click a 🅰 layer › 🅰 Type › Text that moves… / Moves on › (typeRows(), tools/three-type.js layerMenu)
//   · the 🅰 Type submenu of ＋ Add: Lyric lines that move… (previewRows())
//   · three_do type { op: "kinetic" } for the directors (op())
const LabKineticHook = (() => {
  async function lib(fn = (K) => K.open()) {
    if (typeof LabKinetic === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('kinetictype');
    if (typeof LabKinetic === 'undefined') throw new Error('Text that moves did not load');
    return fn(LabKinetic);
  }
  const go = (fn) => () => { lib(fn).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })); };
  const N = 22;
  const addItem = () => ({ label: '🅰 Text that moves…', hint: `${N} presets on the beat`, tip: 'Words that move with the music: word by word on the beat, a punch on each kick, a countdown, lyric lines.', tags: 'kinetic type typography text animation animated moving words lyrics lyric beat kick title opener', action: go((K) => K.open()) });
  const previewRows = () => [{ label: '🎤 Lyric lines that move…', hint: 'tap along or on markers', action: go((K) => K.lyricsDialog()) }];
  // rows of LabType.layerMenu ([label, hint, fn | rows, checked]) for a 🅰 layer; o = its options, code = its code
  function typeRows(L, o = {}, code = '') {
    const m = /^[ \t]*kSync\s*:\s*\{\s*value\s*:\s*'(\w+)'/m.exec(String(code));
    const sync = m ? m[1] : null;
    const rows = [['Text that moves…', o.kinetic ? 'another preset, timing, look' : 'presets on the beat', go((K) => K.open({ layer: L.id }))]];
    const names = { beat: 'Beat', bar: 'Bar', kick: 'Kick', snare: 'Snare', seconds: 'Seconds', off: 'Its own timing' };
    if (sync) rows.push(['Moves on', names[sync] || sync, Object.entries(names).map(([k, n]) => [n, '', go((K) => K.setOn(L.id, { kSync: k }).then((r) => toast(`🅰 ${r.set.join(' · ')}`, { timeout: 1400 }))), sync === k])]);
    if (Array.isArray(o.lyrics)) rows.push(['Lyric lines on my markers', 'line 1 on marker 1…', go((K) => K.linesToMarkers(L.id).then((r) => toast(`🅰 ${r.lines} lines · ${r.onMarkers} on markers`, { timeout: 1800 })))]);
    return rows;
  }
  const op = (a, ctx) => lib((K) => K.op(a, ctx));
  return { lib, addItem, previewRows, typeRows, op };
})();
window.LabKineticHook = LabKineticHook;
