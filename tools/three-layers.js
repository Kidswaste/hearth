// Layers for Three.js Lab sketches: a Photoshop-style list (select, show/hide, reorder, add, duplicate,
// delete, rename) and the selected layer's settings (opacity, blend mode, fades, position/scale/rotation
// and when it plays). Each layer is its own sketch module; the Lab stacks them in the preview.
const ThreeLayers = (() => {
  const COLORS = ['#ffd75e', '#48ddff', '#bd8bff', '#ff6a6a', '#7cd992', '#ff8c42', '#7ad0ff', '#f5a3d0'];
  const BLENDS = [['normal', 'Normal'], ['add', 'Add (glow)'], ['screen', 'Screen'], ['lighten', 'Lighten'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['multiply', 'Multiply'], ['darken', 'Darken'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['color-dodge', 'Color dodge']];
  const newId = () => `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const defaults = (o = {}) => ({ id: newId(), name: 'Layer', code: '', visible: true, opacity: 1, blend: 'normal', in: null, out: null, fadeIn: 0, fadeOut: 0, x: 0, y: 0, scale: 1, rotate: 0, ...o });

  const HEAD = `import * as THREE from 'three';

// A transparent layer: what it draws sits on top of the layers below (no scene.background here).
`;
  const BODY = `const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 7;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
`;
  const TEMPLATES = [
    {
      id: 'empty', name: 'Shape', desc: 'One wireframe shape that pumps on kicks: a starting point to describe what you want',
      code: `${HEAD}const P = tweak({
  color: { value: '#ffd75e', label: 'Color', group: 'Look' },
  size: { value: 1, min: 0.1, max: 4, label: 'Size', group: 'Look' },
  spin: { value: 0.5, min: -3, max: 3, label: 'Spin', group: 'Motion' },
  punch: { value: 0.6, min: 0, max: 2, label: 'Kick punch', group: 'Music', hint: 'How much it grows on your kick markers (or on beats if none are marked)' },
});

${BODY}
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: P.color, wireframe: true }));
scene.add(mesh);

let pump = 0;
renderer.setAnimationLoop((now) => {
  const hit = audio.hits.kick.length ? audio.kick : audio.beat;
  pump = Math.max(pump * 0.88, hit);
  mesh.material.color.set(P.color);
  mesh.scale.setScalar(P.size * (1 + pump * P.punch * 0.4));
  mesh.rotation.y += P.spin * 0.01;
  mesh.rotation.x += P.spin * 0.004;
  renderer.render(scene, camera);
});
`,
    },
    {
      id: 'rings', name: 'Pulse rings', desc: 'Glowing rings that swell on kicks',
      code: `${HEAD}const P = tweak({
  rings: { value: 6, min: 1, max: 24, step: 1, label: 'Rings', group: 'Shape' },
  size: { value: 1, min: 0.2, max: 3, label: 'Size', group: 'Shape' },
  thickness: { value: 0.025, min: 0.005, max: 0.15, label: 'Thickness', group: 'Shape' },
  color: { value: '#48ddff', label: 'Color', group: 'Color' },
  spin: { value: 0.2, min: -2, max: 2, label: 'Spin', group: 'Motion' },
  punch: { value: 0.8, min: 0, max: 2, label: 'Kick punch', group: 'Music', hint: 'How much the rings grow on kicks (or beats)' },
});

${BODY}
const mat = new THREE.MeshBasicMaterial({ color: P.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const group = new THREE.Group();
scene.add(group);
for (let i = 0; i < P.rings; i++) group.add(new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.35, P.thickness, 8, 160), mat));

let pump = 0;
renderer.setAnimationLoop(() => {
  const hit = audio.hits.kick.length ? audio.kick : audio.beat;
  pump = Math.max(pump * 0.9, hit);
  mat.color.set(P.color);
  group.scale.setScalar(P.size * (1 + pump * P.punch * 0.25));
  group.rotation.z += P.spin * 0.01;
  renderer.render(scene, camera);
});
`,
    },
    {
      id: 'particles', name: 'Particle field', desc: 'A cloud of drifting dots that flashes on snares',
      code: `${HEAD}const P = tweak({
  count: { value: 4000, min: 500, max: 20000, step: 100, label: 'Particles', group: 'Shape' },
  spread: { value: 6, min: 1, max: 15, label: 'Spread', group: 'Shape' },
  size: { value: 0.05, min: 0.005, max: 0.25, label: 'Dot size', group: 'Look' },
  color: { value: '#bd8bff', label: 'Color', group: 'Color' },
  drift: { value: 0.15, min: 0, max: 1, label: 'Drift speed', group: 'Motion' },
  flash: { value: 0.8, min: 0, max: 2, label: 'Snare flash', group: 'Music', hint: 'Brightness burst on snares (or beats)' },
});

${BODY}
const positions = new Float32Array(P.count * 3);
for (let i = 0; i < P.count; i++) {
  const r = P.spread * Math.cbrt(Math.random());
  const t = Math.random() * Math.PI * 2;
  const u = Math.acos(2 * Math.random() - 1);
  positions.set([r * Math.sin(u) * Math.cos(t), r * Math.sin(u) * Math.sin(t), r * Math.cos(u)], i * 3);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
const points = new THREE.Points(geo, mat);
scene.add(points);

let glow = 0;
renderer.setAnimationLoop(() => {
  const hit = audio.hits.snare.length ? audio.snare : audio.beat;
  glow = Math.max(glow * 0.9, hit);
  mat.color.set(P.color);
  mat.size = P.size * (1 + glow * P.flash * 0.6);
  mat.opacity = Math.min(1, 0.55 + glow * P.flash * 0.45);
  points.rotation.y += P.drift * 0.004;
  points.rotation.x += P.drift * 0.0015;
  renderer.render(scene, camera);
});
`,
    },
  ];

  // onSelect(id), onChange(id, props, { live }), onAdd(templateId | 'copy' | 'ask'), onRemove(id),
  // onReorder(idsBottomFirst), now() → playhead seconds, duration() → song length, loop() → { a, b } | null.
  function panel({ onSelect, onChange, onAdd, onRemove, onReorder, now, duration, loop }) {
    const { fmtMs, parseTime } = ThreeMedia._test;
    let layers = [];
    let selectedId = null;
    const list = el('div', { class: 'ly-list' });
    const count = el('span', { class: 'tw-count' });
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const addBtn = btn('＋ Layer', 'Add a layer on top', (e) => addMenu(e.currentTarget), 'primary small');
    const dupBtn = btn('⧉', 'Duplicate the selected layer', () => onAdd('copy'));
    const delBtn = btn('🗑', 'Delete the selected layer', () => selectedId && onRemove(selectedId));
    const props = el('div', { class: 'ly-props' });
    const root = el('div', { class: 'layers' },
      el('div', { class: 'tw-head' }, el('b', { text: 'Layers' }), count, el('span', { class: 'spacer' }), addBtn, dupBtn, delBtn),
      list, props);

    function addMenu(anchor) {
      const items = [
        ...TEMPLATES.map((t) => [t.name, t.desc, () => onAdd(t.id)]),
        ['Copy of the selected layer', 'Same code and settings', () => onAdd('copy')],
        ['Ask the Three Director…', 'Describe the layer you want in the chat', () => onAdd('ask')],
      ];
      const menu = el('div', { class: 'mb-menu' }, items.map(([label, hint, fn]) => el('button', { class: 'menu-item', on: { click: () => { menu.remove(); fn(); } } }, el('b', { text: label }), el('span', { class: 'hint', text: hint }))));
      const r = anchor.getBoundingClientRect();
      Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - 270, r.left))}px`, top: `${r.bottom + 4}px`, transform: 'none' });
      document.body.append(menu);
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }

    let dragId = null;
    function renderList() {
      count.textContent = layers.length > 1 ? `${layers.length}` : '';
      delBtn.disabled = layers.length <= 1;
      list.replaceChildren(...[...layers].reverse().map((L) => {
        const eye = el('button', { class: `ly-eye${L.visible === false ? ' off' : ''}`, text: L.visible === false ? '◌' : '👁', title: L.visible === false ? 'Show this layer' : 'Hide this layer', on: { click: (e) => { e.stopPropagation(); onChange(L.id, { visible: L.visible === false }, { live: false }); } } });
        const name = el('span', { class: 'ly-name', text: L.name, title: 'Double-click to rename' });
        name.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          const v = await Modal.prompt('Rename layer', { value: L.name });
          if (v?.trim()) onChange(L.id, { name: v.trim() }, { live: false });
        });
        const tags = [L.blend && L.blend !== 'normal' ? BLENDS.find((b) => b[0] === L.blend)?.[1].split(' ')[0] : '', (L.opacity ?? 1) < 1 ? `${Math.round(L.opacity * 100)}%` : '', L.in != null || L.out != null ? '⏱' : ''].filter(Boolean).join(' · ');
        const row = el('div', { class: `ly-row${L.id === selectedId ? ' on' : ''}${L.visible === false ? ' hidden-layer' : ''}`, attrs: { draggable: 'true' }, title: 'Click to select · drag to reorder', on: { click: () => onSelect(L.id) } },
          eye, el('span', { class: 'ly-swatch', style: { background: L.color } }), name, el('span', { class: 'ly-tags', text: tags }));
        row.addEventListener('dragstart', (e) => { dragId = L.id; e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
        row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); });
        row.addEventListener('dragover', (e) => { if (dragId && dragId !== L.id) { e.preventDefault(); row.classList.add('drop-target'); } });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drop-target');
          if (!dragId || dragId === L.id) return;
          // dropped onto L: the dragged layer takes L's place (above it when moving up the list)
          const ids = layers.map((x) => x.id).filter((x) => x !== dragId);
          const from = layers.findIndex((x) => x.id === dragId);
          const to = layers.findIndex((x) => x.id === L.id);
          ids.splice(ids.indexOf(L.id) + (from < to ? 1 : 0), 0, dragId);
          onReorder(ids);
        });
        return row;
      }));
    }

    function renderProps() {
      const L = layers.find((x) => x.id === selectedId);
      props.replaceChildren();
      if (!L) return;
      const live = (patch) => onChange(L.id, patch, { live: true });
      const commit = (patch) => onChange(L.id, patch, { live: false });
      const range = (label, key, min, max, step, fmt, title) => {
        const v = L[key] ?? (key === 'scale' || key === 'opacity' ? 1 : 0);
        const out = el('span', { class: 'ly-val', text: fmt(v) });
        const r = el('input', { type: 'range', min, max, step, value: v, title: `${title || label} (double-click to reset)` });
        r.addEventListener('input', () => { out.textContent = fmt(Number(r.value)); live({ [key]: Number(r.value) }); });
        r.addEventListener('change', () => commit({ [key]: Number(r.value) }));
        r.addEventListener('dblclick', () => { const d = key === 'scale' || key === 'opacity' ? 1 : 0; r.value = d; out.textContent = fmt(d); commit({ [key]: d }); });
        return el('label', { class: 'ly-field' }, el('span', { text: label }), r, out);
      };
      const blend = el('select', { class: 'tw-select', title: 'How this layer mixes with the layers below' }, BLENDS.map(([v, l]) => el('option', { value: v, text: l, selected: v === (L.blend || 'normal') })));
      blend.addEventListener('change', () => commit({ blend: blend.value }));
      const timeIn = (key) => {
        const i = el('input', { type: 'text', class: 'mb-tin', value: L[key] == null ? '' : fmtMs(L[key]), placeholder: key === 'in' ? 'start' : 'end', title: `When this layer ${key === 'in' ? 'appears' : 'disappears'} (m:ss.mmm, empty = ${key === 'in' ? 'from the start' : 'until the end'})` });
        i.addEventListener('change', () => { const v = i.value.trim() ? parseTime(i.value) : null; if (v === null || Number.isFinite(v)) commit({ [key]: v }); });
        return i;
      };
      const here = (key) => btn('here', `Set the layer ${key === 'in' ? 'start' : 'end'} at the playhead`, () => commit({ [key]: Math.round(now() * 1000) / 1000 }));
      const fade = (key, label) => {
        const i = el('input', { type: 'number', class: 'ly-num', min: 0, max: 30, step: 0.1, value: L[key] || 0, title: `${label} in seconds (needs a ${key === 'fadeIn' ? 'start' : 'end'} time)` });
        i.addEventListener('change', () => commit({ [key]: Math.max(0, Number(i.value) || 0) }));
        return el('label', { class: 'ly-fade' }, el('span', { text: label }), i, el('span', { class: 'mb-unit', text: 's' }));
      };
      const hasSong = duration() > 0;
      const lp = loop();
      props.append(
        el('div', { class: 'ly-sel' }, el('span', { class: 'ly-swatch', style: { background: L.color } }), el('b', { text: L.name })),
        range('Opacity', 'opacity', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
        el('label', { class: 'ly-field' }, el('span', { text: 'Blend' }), blend),
        el('div', { class: 'ly-time' },
          el('span', { class: 'ly-label', text: 'Plays' }),
          hasSong ? el('span', { class: 'ly-timebox' }, timeIn('in'), here('in'), el('span', { class: 'mb-arrow', text: '→' }), timeIn('out'), here('out')) : el('span', { class: 'hint', text: 'Load a song to time layers' }),
          hasSong ? el('span', { class: 'ly-timebtns' },
            btn('Whole song', 'Play this layer for the whole song', () => commit({ in: null, out: null })),
            lp ? btn('Loop only', 'Play this layer only during the loop', () => commit({ in: lp.a, out: lp.b })) : null) : null),
        hasSong ? el('div', { class: 'ly-fades' }, fade('fadeIn', 'Fade in'), fade('fadeOut', 'Fade out')) : null,
        el('details', { class: 'ly-transform', open: store.get('three.layerTransform', false), on: { toggle: (e) => store.set('three.layerTransform', e.currentTarget.open) } },
          el('summary', { text: 'Position, size, rotation' }),
          range('Move X', 'x', -100, 100, 0.5, (v) => `${v}%`, 'Move left / right (% of the frame)'),
          range('Move Y', 'y', -100, 100, 0.5, (v) => `${v}%`, 'Move up / down (% of the frame)'),
          range('Scale', 'scale', 0.1, 3, 0.01, (v) => `${Math.round(v * 100)}%`),
          range('Rotate', 'rotate', -180, 180, 0.5, (v) => `${v}°`)),
      );
    }

    return {
      el: root,
      render(next, sel) { layers = next; selectedId = sel; renderList(); renderProps(); },
      refreshProps: () => renderProps(),
    };
  }

  return { panel, TEMPLATES, COLORS, BLENDS, defaults, newId };
})();
