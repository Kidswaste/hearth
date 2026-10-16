// ◉ Looks for 3D things (round 50, labmaterials): the material presets, without the DOM. One file, three places: the Lab
// (MatCore: the picker's names, words and the director's op), the preview page (sent as source on first use: tools/three.js
// sandboxFrame 'lib-need' → globalThis.matcore, which makes the three.js materials, the small built-in studio light and the
// thumbnail stage) and Node (dev/labmaterials-test.js). A look is a plain spec { k: preset id, c: '#hex' (optional, the
// preset's own color otherwise), s: shine 0–1 (optional, the preset's own otherwise) }, kept with the layer
// (props.overrides['@look'], see tools/three-sandbox.html "Looks"), so the preview and a render make the same material.
// The environment light is procedural (a soft studio room baked once per renderer): nothing is downloaded.
function hearthMatCore() {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const HEX = /^#[0-9a-f]{6}$/i;
  // kind: std (MeshStandardMaterial) | phys (MeshPhysicalMaterial) | toon | basic; color / shine: the preset's own;
  // env: it needs reflections (an environment light is added when the scene has none); words: what people call it
  const PRESETS = [
    { id: 'chrome', name: 'Chrome', kind: 'std', color: '#eceef2', shine: 0.95, env: true, words: 'chrome metal shiny silver polished reflective' },
    { id: 'brushed', name: 'Brushed metal', kind: 'phys', color: '#c4c7cc', shine: 0.6, env: true, words: 'brushed metal steel aluminium aluminum satin anisotropic' },
    { id: 'gold', name: 'Gold', kind: 'std', color: '#ffc45c', shine: 0.82, env: true, words: 'gold golden metal brass luxury' },
    { id: 'mirror', name: 'Mirror', kind: 'std', color: '#ffffff', shine: 1, env: true, words: 'mirror reflective perfect shiny' },
    { id: 'glass', name: 'Glass', kind: 'phys', color: '#ffffff', shine: 0.97, env: true, words: 'glass clear transparent crystal see-through' },
    { id: 'frosted', name: 'Frosted glass', kind: 'phys', color: '#f2f6ff', shine: 0.55, env: true, words: 'frosted glass matte translucent ice satin glass' },
    { id: 'plastic', name: 'Glossy plastic', kind: 'phys', color: '#e8423f', shine: 0.85, env: true, words: 'plastic glossy toy lacquer candy shiny' },
    { id: 'ceramic', name: 'Ceramic', kind: 'phys', color: '#f2efe8', shine: 0.72, env: true, words: 'ceramic porcelain pottery glazed china' },
    { id: 'clay', name: 'Matte clay', kind: 'std', color: '#d9c8b4', shine: 0.06, env: false, words: 'clay matte plaster chalk stone render' },
    { id: 'rubber', name: 'Rubber', kind: 'phys', color: '#2a2a2e', shine: 0.25, env: false, words: 'rubber soft matte silicone tyre tire' },
    { id: 'velvet', name: 'Velvet', kind: 'phys', color: '#7a1f4a', shine: 0.15, env: false, words: 'velvet fabric cloth soft fuzzy textile sheen' },
    { id: 'holo', name: 'Holographic', kind: 'phys', color: '#ffffff', shine: 0.85, env: true, words: 'holographic iridescent rainbow pearl oil slick hologram' },
    { id: 'neon', name: 'Neon', kind: 'std', color: '#ff3dd8', shine: 0.6, env: false, words: 'neon emissive glow glowing light bright' },
    { id: 'toon', name: 'Toon', kind: 'toon', color: '#4fb3ff', shine: 0.5, env: false, words: 'toon cartoon cel anime flat shaded' },
    { id: 'wire', name: 'Wireframe', kind: 'basic', color: '#48ddff', shine: 0.7, env: false, words: 'wireframe wire lines mesh grid' },
    { id: 'xray', name: 'X-ray', kind: 'basic', color: '#6fd8ff', shine: 0.5, env: false, words: 'xray x-ray ghost see through transparent scan' },
  ];
  const BY = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
  // other names people (and the 🧊 model layer's own Material list) use
  const ALIAS = { metal: 'chrome', silver: 'chrome', steel: 'brushed', aluminium: 'brushed', aluminum: 'brushed', brushedmetal: 'brushed', frostedglass: 'frosted', iridescent: 'holo', holographic: 'holo', hologram: 'holo', emissive: 'neon', glow: 'neon', wireframe: 'wire', 'x-ray': 'xray', ghost: 'xray', matte: 'clay', glossy: 'plastic', glossyplastic: 'plastic', porcelain: 'ceramic', cartoon: 'toon', fabric: 'velvet', matteclay: 'clay' };
  const has = (k) => Boolean(BY[k]);
  const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '');
  // a preset from a word ("chrome", "Frosted glass", "iridescent", "x-ray"); null when nothing fits
  function find(word) {
    const w = fold(word);
    if (!w) return null;
    if (BY[w]) return BY[w];
    if (ALIAS[w]) return BY[ALIAS[w]];
    const n = PRESETS.find((p) => fold(p.name) === w);
    if (n) return n;
    const raw = String(word).toLowerCase().trim();
    return PRESETS.find((p) => p.words.split(' ').includes(raw)) || PRESETS.find((p) => fold(p.name).startsWith(w)) || null;
  }
  // a clean spec (unknown preset → null); c only a #rrggbb, s within 0–1, both left out when they're the preset's own
  function normalize(spec) {
    if (!spec || typeof spec !== 'object') return null;
    const p = BY[spec.k] || find(spec.k);
    if (!p) return null;
    const o = { k: p.id };
    if (typeof spec.c === 'string' && HEX.test(spec.c) && spec.c.toLowerCase() !== p.color) o.c = spec.c.toLowerCase();
    const s = Number(spec.s);
    if (spec.s != null && spec.s !== '' && Number.isFinite(s) && Math.abs(clamp(s, 0, 1) - p.shine) > 0.004) o.s = Math.round(clamp(s, 0, 1) * 100) / 100;
    return o;
  }
  const needsEnv = (spec) => Boolean(BY[spec?.k]?.env);
  const shineOf = (spec) => (spec?.s != null && Number.isFinite(Number(spec.s)) ? clamp(Number(spec.s), 0, 1) : BY[spec?.k]?.shine ?? 0.5);
  const colorOf = (spec) => (typeof spec?.c === 'string' && HEX.test(spec.c) ? spec.c.toLowerCase() : BY[spec?.k]?.color || '#ffffff');
  // the material's settings as plain values (what make() builds; Node checks them): { kind, o: { …material options } }
  function params(spec) {
    const p = BY[spec?.k];
    if (!p) return null;
    const c = colorOf(spec); const s = shineOf(spec); const r = Math.round((1 - s) * 1000) / 1000;
    const o = { color: c };
    switch (p.id) {
      case 'chrome': Object.assign(o, { metalness: 1, roughness: r }); break;
      case 'brushed': Object.assign(o, { metalness: 1, roughness: r, anisotropy: 0.85 }); break;
      case 'gold': Object.assign(o, { metalness: 1, roughness: r }); break;
      case 'mirror': Object.assign(o, { metalness: 1, roughness: Math.min(r, 0.5) * 0.3 }); break;
      case 'glass': Object.assign(o, { metalness: 0, roughness: r, transmission: 1, thickness: 0.6, ior: 1.5, transparent: true, side: 'double' }); break;
      case 'frosted': Object.assign(o, { metalness: 0, roughness: r, transmission: 1, thickness: 1, ior: 1.45, transparent: true, side: 'double' }); break;
      case 'plastic': Object.assign(o, { metalness: 0, roughness: Math.max(0.05, r), clearcoat: 1, clearcoatRoughness: Math.max(0.02, r * 0.5) }); break;
      case 'ceramic': Object.assign(o, { metalness: 0, roughness: r, clearcoat: 0.8, clearcoatRoughness: 0.08 }); break;
      case 'clay': Object.assign(o, { metalness: 0, roughness: Math.max(0.3, r) }); break;
      case 'rubber': Object.assign(o, { metalness: 0, roughness: Math.max(0.35, r), sheen: 0.25, sheenRoughness: 0.8, sheenColor: '#ffffff' }); break;
      case 'velvet': Object.assign(o, { metalness: 0, roughness: 1, sheen: 1, sheenRoughness: Math.max(0.15, r), sheenColor: '#ffffff' }); break;
      case 'holo': Object.assign(o, { metalness: 0.65, roughness: r, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 820], clearcoat: 1 }); break;
      case 'neon': Object.assign(o, { color: '#000000', emissive: c, emissiveIntensity: Math.round((0.6 + s * 2.4) * 100) / 100, roughness: 0.5, metalness: 0 }); break;
      case 'toon': break;
      case 'wire': Object.assign(o, { wireframe: true, transparent: true, opacity: Math.round((0.35 + s * 0.65) * 100) / 100 }); break;
      case 'xray': Object.assign(o, { transparent: true, opacity: Math.round((0.1 + s * 0.4) * 100) / 100, depthWrite: false, blending: 'add', side: 'double' }); break;
      default: break;
    }
    return { kind: p.kind, o };
  }
  // plain words for a spec ("Chrome", "Glass · tinted #88ccff · shine 40 %")
  function describe(spec) {
    const p = BY[spec?.k];
    if (!p) return 'Original';
    return [p.name, spec.c ? spec.c : '', spec.s != null ? `shine ${Math.round(spec.s * 100)} %` : ''].filter(Boolean).join(' · ');
  }

  // ---------- three.js (the preview page) ----------
  let ramp = null;
  function make(THREE, spec) {
    const P = params(spec);
    if (!P) return null;
    const o = { ...P.o };
    if (o.side === 'double') o.side = THREE.DoubleSide; else delete o.side;
    if (o.blending === 'add') o.blending = THREE.AdditiveBlending; else delete o.blending;
    if (o.sheenColor) o.sheenColor = new THREE.Color(o.sheenColor);
    if (P.kind === 'toon') {
      if (!ramp) { const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]); ramp = new THREE.DataTexture(d, 3, 1); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true; }
      return new THREE.MeshToonMaterial({ color: o.color, gradientMap: ramp });
    }
    if (P.kind === 'basic') return new THREE.MeshBasicMaterial(o);
    if (P.kind === 'std') { delete o.anisotropy; return new THREE.MeshStandardMaterial(o); }
    if (o.anisotropy != null && !('anisotropy' in THREE.MeshPhysicalMaterial.prototype) && !('anisotropy' in new THREE.MeshPhysicalMaterial())) delete o.anisotropy; // (an older three.js)
    return new THREE.MeshPhysicalMaterial(o);
  }
  // a small studio room to bake an environment light from (PMREMGenerator.fromScene): a soft grey box, a big softbox
  // above, a warm strip and a cool strip on the sides, a dim floor. Values past 1 are light (the bake is in half floats).
  function envScene(THREE) {
    const scene = new THREE.Scene();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const room = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.32, 0.34), side: THREE.BackSide }));
    room.scale.set(12, 9, 12); room.position.y = 3;
    scene.add(room);
    const panel = (rgb, [x, y, z], [sx, sy, sz]) => { const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb) })); m.position.set(x, y, z); m.scale.set(sx, sy, sz); scene.add(m); };
    panel([7, 7, 7], [0, 7.2, 0], [5, 0.1, 5]); // the softbox above
    panel([5, 4.2, 3.2], [-5.8, 3, 1], [0.1, 4, 1.4]); // a warm strip
    panel([2.8, 3.8, 6], [5.8, 2.6, -1.5], [0.1, 3.5, 1.2]); // a cool strip
    panel([2.5, 2.5, 2.5], [0, 2.5, -5.8], [6, 1.2, 0.1]); // a band behind
    panel([0.08, 0.08, 0.09], [0, -1.4, 0], [11, 0.1, 11]); // the floor
    return scene;
  }
  function disposeScene(scene) { scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
  // the thumbnails' stage: one ball in front of a striped backdrop (glass and x-ray need something behind them)
  function thumbStage(THREE) {
    const scene = new THREE.Scene();
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#2a2a30'); gr.addColorStop(1, '#141418');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3a3a44'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 64);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: tex }));
    back.position.z = -2.2; scene.add(back);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial());
    scene.add(ball);
    const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(-2, 3, 4); scene.add(key);
    scene.add(new THREE.AmbientLight('#ffffff', 0.15));
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50); camera.position.set(0, 0, 4.6); camera.lookAt(0, 0, 0);
    return { scene, camera, ball, dispose: () => { disposeScene(scene); tex.dispose(); } };
  }
  return { PRESETS, BY, ALIAS, has, find, normalize, needsEnv, shineOf, colorOf, params, describe, make, envScene, disposeScene, thumbStage };
}
// the Lab and Node get it as MatCore; the preview page as globalThis.matcore (a `var`: this file may be read twice, once by the
// Lab's lazy group and once when the preview page asks for it)
var MatCore = hearthMatCore(); // eslint-disable-line no-var
if (typeof window !== 'undefined') { (window.__sbxLibFn ||= {}).matcore = { toString: () => `function () { globalThis.matcore = (${hearthMatCore})(); }` }; window.MatCore = MatCore; }
if (typeof module !== 'undefined' && module.exports) module.exports = MatCore;
