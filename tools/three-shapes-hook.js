// ◆ Shapes that draw themselves (round 51, labshapes): what loads with the Lab. The picker itself (three-shape*.js,
// lazy group "labshapes") loads on first use; this small part gives it its ways in:
//   · right-click the preview › ＋ Add › ◆ Shape… (addItem(), tools/three.js)
//   · right-click a ◆ layer › ◆ Shape › Another shape… / Draws › (layerMenu(), tools/three.js + three-easy.js)
const LabShapesHook = (() => {
  async function lib(fn = (S) => S.open()) {
    if (typeof LabShapes === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labshapes');
    if (typeof LabShapes === 'undefined') throw new Error('The shapes did not load');
    return fn(LabShapes);
  }
  const go = (fn) => () => { lib(fn).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })); };
  const N = 21;
  const isShape = (code) => /\bshapeLayer\s*\(\s*P\s*,/.test(String(code || ''));
  const addItem = () => ({ label: '◆ Shape…', hint: `${N} shapes that draw themselves`, tip: 'A circle, a box, an arrow, an underline swoosh, a bracket frame, a checkmark, a wave, a spiral… or draw your own. The line writes itself on, off, in a loop or on each beat / kick; crisp at any size; renders exactly like the preview.', tags: 'shape shapes shape layer draw on write on stroke trim path line rectangle box circle ring star arrow underline swoosh bracket frame checkmark tick cross wave spiral heart burst draw your own pen after effects', action: go((S) => S.open()) });
  // a ◆ layer's right-click rows ([label, hint, fn | rows]: the layer menus' row format)
  function layerMenu(L) {
    if (!L || !isShape(L.code)) return [];
    const MODES = [['in', 'Draws on'], ['out', 'Draws off'], ['inout', 'On, then off'], ['loop', 'Loop'], ['beat', 'Each beat'], ['kick', 'Each kick'], ['off', 'Still (Start / End sliders)']];
    return [['◆ Shape', 'another shape, how it draws', [
      ['Another shape…', 'the picker, on this layer', go((S) => S.open({ layer: L.id }))],
      ['Draws', '', MODES.map(([k, label]) => [label, '', go((S) => S.setOn(L.id, { drawOn: k }))])],
    ]]];
  }
  return { lib, addItem, layerMenu, isShape };
})();
window.LabShapesHook = LabShapesHook;
