// lab3d.model() (3D model layers): part of the Lab preview page (tools/three-sandbox.html), split out in round 25 (diet) so the page
// doesn't parse it before its first frame. The preview is a sandboxed iframe that can't load files, so the hub loads
// this file when a page asks (tools/three.js sandboxFrame: 'lib-need') and sends the function's source; the page runs
// it as a module right after `import * as THREE from 'three'` (THREE is free here on purpose). A deployed page has it
// inlined (deploymain.js labPage). Nothing runs in the hub: it only reads the source.
// ---------- 3D models (round 15, "lab3d": tools/three-models*.js) ----------
// lab3d.model(url, P, opts) inside a layer's code makes it a model layer, like motion.<kind>(P) does for motion layers:
// a GLB / glTF / FBX / OBJ / STL / PLY (Meshy, Sketchfab, Mixamo, Spline exports, files) loaded with a progress bar
// and a clear error when the file is wrong, fitted to the frame and standing on the ground, lit by a studio preset or
// an HDRI, with material presets, its animation clips (Mixamo clips from other files too), turntable, explode view,
// camera moves, fog, ground / shadow catcher / mirror, bloom and depth of field. P is the layer's tweak() object read
// every frame, so sliders, keyframes (camera moves are keyframes on Orbit / Crane / Distance / Lens), looks and
// Shuffle work. Time comes from the layer's clock (frame-exact in renders and the sequence). opts: { name, hdri: url,
// clips: [url…] (extra animation files, Mixamo), cast: true }. lab3d.list() → what each model layer loaded.
// Heavy models: shadows off and a lower resolution past ~1.5 M triangles, Detail < 1 simplifies static meshes;
// everything (geometries, textures, materials, mixers, HDRIs) is disposed when the layer re-runs or goes.
(window.__sbxLibFn ||= {}).lab3d = function () {
const lab3d = (() => {
  const post = (msg) => (window.__stageHost ? window.__stageHost.post({ source: 'three-sandbox', ...msg }) : parent.postMessage({ source: 'three-sandbox', ...msg }, '*'));
  const val = (P, k, d) => { const x = P?.[k]; return x === undefined || x === null || (typeof x === 'number' && !Number.isFinite(x)) ? d : x; };
  const num = (P, k, d) => { const x = Number(val(P, k, d)); return Number.isFinite(x) ? x : d; };
  const on = (P, k, d) => { const x = val(P, k, d); return x === true || x === 'on' || x === 1; };
  const DEG = Math.PI / 180;
  const live = new Map(); // layer id → the model layer's state (lab3d.list, disposal on re-run)
  const cache = new Map(); // url → Promise<{ root, clips }> (a hot re-run with the same file doesn't parse it again)
  const MAX_CACHE = 3;

  // ---------- reading files (sniffed: refs are blob: URLs without an extension) ----------
  async function fetchBytes(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the file didn't download (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress?.(got / total); }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const head = (b, n = 64) => new TextDecoder().decode(b.subarray(0, n));
  function sniff(b) {
    if (!b?.length) return 'empty';
    const h = head(b, 80); const t = h.trimStart();
    if (h.startsWith('glTF')) return 'glb';
    if (h.startsWith('Kaydara FBX Binary') || /^; FBX/.test(t)) return 'fbx';
    if (/^<(!doctype|html|\?xml|head|body)/i.test(t)) return 'html';
    if (t.startsWith('{')) return /"asset"\s*:/.test(head(b, 4000)) ? 'gltf' : 'json';
    if (h.startsWith('ply')) return 'ply';
    if (/^PK\u0003\u0004/.test(h)) return 'zip';
    if (/^#\?(RADIANCE|RGBE)/.test(h)) return 'hdr';
    if (b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01) return 'exr';
    if (/^solid\s/.test(t) && /facet|endsolid/.test(head(b, 2000))) return 'stl';
    if (/^(#|v |o |g |mtllib|vn |vt )/m.test(head(b, 400))) return 'obj';
    if (b.length > 84 && b.length === 84 + 50 * new DataView(b.buffer, b.byteOffset).getUint32(80, true)) return 'stl';
    return 'unknown';
  }
  const WHY = {
    empty: 'the file is empty',
    html: 'it is a web page, not a model (download the .glb file itself, not the page)',
    json: 'it is a JSON file but not a glTF model',
    zip: 'it is a .zip: unzip it and drop the .glb (or the .gltf with its files)',
    unknown: 'not a 3D model the Lab reads (.glb, .gltf, .fbx, .obj, .stl, .ply; Spline / Blender: export as GLB)',
  };
  let gltfLoader = null;
  async function loaders() {
    if (gltfLoader) return gltfLoader;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const l = new GLTFLoader();
    try { const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js'); const d = new DRACOLoader(); d.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); l.setDRACOLoader(d); } catch { /* Draco models then say why */ }
    try { const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js'); l.setMeshoptDecoder(MeshoptDecoder); } catch { /* optional */ }
    try { const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js'); const k = new KTX2Loader().setTranscoderPath(globalThis.__sbxResolve('three/addons/libs/basis/')); l.__ktx2 = k; } catch { /* optional */ }
    gltfLoader = l;
    return l;
  }
  // bytes → { root: Object3D, clips: AnimationClip[] }
  async function parse(bytes, kind, renderer) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (kind === 'glb' || kind === 'gltf') {
      const l = await loaders();
      if (l.__ktx2 && renderer && !l.__ktx2On) { try { l.__ktx2.detectSupport(renderer); l.setKTX2Loader(l.__ktx2); l.__ktx2On = true; } catch { /* no KTX2 */ } }
      const g = await new Promise((res, rej) => l.parse(buf, '', res, (e) => rej(e)));
      return { root: g.scene || g.scenes?.[0], clips: g.animations || [] };
    }
    if (kind === 'fbx') { const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js'); const o = new FBXLoader().parse(buf, ''); return { root: o, clips: o.animations || [] }; }
    if (kind === 'obj') { const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js'); return { root: new OBJLoader().parse(new TextDecoder().decode(bytes)), clips: [] }; }
    if (kind === 'stl' || kind === 'ply') {
      const mod = kind === 'stl' ? await import('three/addons/loaders/STLLoader.js') : await import('three/addons/loaders/PLYLoader.js');
      const geo = new (mod.STLLoader || mod.PLYLoader)().parse(buf);
      geo.computeVertexNormals?.();
      return { root: new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#c9c3ba', roughness: 0.5, vertexColors: Boolean(geo.attributes.color) })), clips: [] };
    }
    throw new Error(WHY[kind] || WHY.unknown);
  }
  function friendly(err, kind) {
    const m = String(err?.message || err || '');
    if (/draco/i.test(m)) return 'it is Draco-compressed and the decoder could not load (offline?): export it without Draco, or try again online';
    if (/buffer|\.bin|Failed to load buffer|fetch/i.test(m) && kind === 'gltf') return 'this .gltf points to .bin / texture files next to it: export as one .glb, or add those files too';
    if (/KHR_|extension/i.test(m)) return `it uses a glTF extension three.js can't read (${m.slice(0, 80)})`;
    return m.slice(0, 160) || WHY.unknown;
  }
  async function loadAsset(url, onProgress, renderer) {
    if (cache.has(url)) return cache.get(url);
    const p = (async () => {
      const bytes = await fetchBytes(url, onProgress);
      const kind = sniff(bytes);
      if (WHY[kind]) throw new Error(WHY[kind]);
      try { return { ...(await parse(bytes, kind, renderer)), kind, bytes: bytes.length }; } catch (err) { throw new Error(friendly(err, kind)); }
    })();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return p;
  }
  let skel = null;
  async function cloneOf(asset) {
    let skinned = false; asset.root.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
    if (!skinned) return asset.root.clone(true);
    skel ||= await import('three/addons/utils/SkeletonUtils.js');
    return skel.clone(asset.root);
  }

  // ---------- HDRI skies ----------
  const hdriCache = new Map(); // url → Promise<DataTexture (equirect)>
  async function loadHdri(url) {
    if (hdriCache.has(url)) return hdriCache.get(url);
    const p = (async () => {
      const bytes = await fetchBytes(url);
      const kind = sniff(bytes);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      let tex;
      if (kind === 'exr') { const { EXRLoader } = await import('three/addons/loaders/EXRLoader.js'); const l = new EXRLoader(); const d = l.parse(buf); tex = new THREE.DataTexture(d.data, d.width, d.height, d.format, d.type); }
      else if (kind === 'hdr') { const mod = await import('three/addons/loaders/HDRLoader.js').catch(() => import('three/addons/loaders/RGBELoader.js')); const l = new (mod.HDRLoader || mod.RGBELoader)(); const d = l.parse(buf); tex = new THREE.DataTexture(d.data, d.width, d.height, d.format, d.type); }
      else {
        const img = await createImageBitmap(new Blob([bytes])).catch(() => null);
        if (!img) throw new Error('the sky is not an .hdr, .exr or picture file');
        tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace;
      }
      tex.mapping = THREE.EquirectangularReflectionMapping; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.flipY = kind === 'hdr' || kind === 'exr' ? true : tex.flipY;
      tex.needsUpdate = true;
      return tex;
    })();
    hdriCache.set(url, p);
    p.catch(() => hdriCache.delete(url));
    while (hdriCache.size > 2) { const k = hdriCache.keys().next().value; hdriCache.get(k).then((t) => t.dispose()).catch(() => {}); hdriCache.delete(k); }
    return p;
  }

  // ---------- light presets ----------
  // [color, intensity, [x, y, z] (× the model's size), shadow?] per light + hemisphere + exposure + env strength
  const LIGHTS = {
    studio: { hemi: ['#ffffff', '#3a3440', 0.6], env: 1, exp: 1, lights: [['#fff4e8', 2.2, [3, 5, 4], true], ['#dde8ff', 0.7, [-4, 2, 3]], ['#ffffff', 1.2, [0, 3, -5]]] },
    'three-point': { hemi: ['#ffffff', '#202028', 0.25], env: 0.6, exp: 1, lights: [['#ffe2c0', 3, [3.5, 3, 3.5], true], ['#9fb8ff', 0.9, [-4, 1.5, 2.5]], ['#ffffff', 2.6, [-1.5, 3.5, -4]]] },
    rim: { hemi: ['#202030', '#000000', 0.15], env: 0.25, exp: 1.1, lights: [['#bfe6ff', 5, [-3.5, 2, -3.5]], ['#ffd0a8', 5, [3.5, 2, -3.5]], ['#ffffff', 0.35, [0, 2, 5], true]] },
    neon: { hemi: ['#1a0830', '#000000', 0.2], env: 0.2, exp: 1.15, spin: 0.35, lights: [['#ff2bd6', 6, [-3, 1.5, 2.5]], ['#21e6ff', 6, [3, 1, 2.5]], ['#7a3cff', 3, [0, 3, -3.5], true]] },
    golden: { hemi: ['#ffd9a0', '#3a2a40', 0.55], env: 0.7, exp: 1.05, fogTint: '#f2b27a', lights: [['#ffb25a', 4, [5, 1.4, 2], true], ['#7aa2ff', 0.6, [-4, 3, -2]]] },
    moody: { hemi: ['#30343c', '#000000', 0.12], env: 0.15, exp: 0.95, lights: [['#ffffff', 5, [0.5, 6, 1], true], ['#4060a0', 0.6, [-4, 1, -3]]] },
    flat: { hemi: ['#ffffff', '#888888', 1.3], env: 1, exp: 1, lights: [['#ffffff', 0.8, [2, 4, 3], true]] },
    sunset: { hemi: ['#ff9a8a', '#1a1030', 0.45], env: 0.5, exp: 1.05, lights: [['#ff7a3c', 4, [-5, 1, 1.5], true], ['#5a6cff', 1.4, [4, 2, -3]]] },
  };

  // ---------- material presets ----------
  let toonRamp = null;
  const ramp = () => { if (toonRamp) return toonRamp; const d = new Uint8Array([60, 60, 60, 255, 150, 150, 150, 255, 255, 255, 255, 255]); toonRamp = new THREE.DataTexture(d, 3, 1); toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter; toonRamp.needsUpdate = true; return toonRamp; };
  const PALETTE0 = ['#48ddff', '#bd8bff', '#ff6b9d', '#ffd75e'];
  function presetMaterial(kind, orig, tint, i) {
    const map = orig?.map || null; const col = new THREE.Color(tint);
    const pal = (globalThis.palette?.length ? globalThis.palette : PALETTE0);
    switch (kind) {
      case 'chrome': return new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.6), metalness: 1, roughness: 0.06 });
      case 'gold': return new THREE.MeshStandardMaterial({ color: '#ffc45c', metalness: 1, roughness: 0.18 });
      case 'glass': return new THREE.MeshPhysicalMaterial({ color: col, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.6, ior: 1.45, transparent: true, opacity: 1, envMapIntensity: 1.4, side: THREE.DoubleSide });
      case 'toon': return new THREE.MeshToonMaterial({ color: map ? '#ffffff' : (orig?.color || col), map, gradientMap: ramp() });
      case 'clay': return new THREE.MeshStandardMaterial({ color: '#d9c8b4', roughness: 0.92, metalness: 0 });
      case 'matte': return new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.75, metalness: 0.1 });
      case 'wireframe': return new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.9 });
      case 'holographic': return new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.15, iridescence: 1, iridescenceIOR: 1.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      case 'xray': return new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      case 'normals': return new THREE.MeshNormalMaterial();
      case 'palette': return new THREE.MeshStandardMaterial({ color: pal[i % pal.length], roughness: 0.45, metalness: 0.15 });
      default: return null;
    }
  }
  const MATERIALS = ['original', 'chrome', 'gold', 'glass', 'toon', 'clay', 'matte', 'wireframe', 'holographic', 'xray', 'normals', 'palette'];

  // ---------- one model layer ----------
  function model(url, P = {}, opts = {}) {
    const L0 = globalThis.layer; const id = L0?.id || 'main';
    live.get(id)?.dispose(); // a re-run of this layer: the old one lets go of everything
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.append(renderer.domElement);
    const box = renderer.domElement.parentElement; // the layer's own box (overlays go there, not on the page)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 500);
    camera.name = 'camera';
    const pmrem = new THREE.PMREMGenerator(renderer);
    let roomEnv = null;
    import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { if (S.gone) return; roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; if (!S.hdriEnv) scene.environment = roomEnv; }).catch(() => {});
    // placement (the scene editor's gizmo: W / E / R) > rig (sliders) > fit (size, ground) > the model
    const place = new THREE.Group(); place.name = 'Model';
    const rig = new THREE.Group(); rig.name = 'rig';
    const fit = new THREE.Group(); fit.name = 'fit';
    place.add(rig); rig.add(fit); scene.add(place);
    const lightG = new THREE.Group(); lightG.name = 'lights'; scene.add(lightG);
    const S = { id, name: opts.name || L0?.name || 'model', url, gone: false, loaded: false, error: null, progress: 0, root: null, clips: [], meshes: [], tris: 0, size: 1, mixer: null, action: null, clipKey: null,
      matKey: null, lightKey: null, groundKey: null, hdriEnv: null, hdriBg: null, composer: null, fxKey: '', t: null, pump: 0, lite: false, heavy: false, detailKey: 1, thumbDone: false, info: null };
    live.set(id, S);

    // progress bar and errors, in the layer's box (never in a still or a render: they're DOM, not the canvas)
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:min(46%,320px);font:600 12px system-ui,sans-serif;color:#f4ece0;text-align:center;text-shadow:0 1px 3px #000;pointer-events:none';
    bar.innerHTML = '<div class="t"></div><div style="height:4px;margin-top:6px;border-radius:3px;background:#ffffff26;overflow:hidden"><div class="f" style="height:100%;width:3%;background:linear-gradient(90deg,#ff8a3d,#ffcf6b);transition:width .2s"></div></div>';
    bar.querySelector('.t').textContent = `🧊 Loading ${S.name}…`;
    (box || document.body).append(bar);
    const setProgress = (p) => { S.progress = p; bar.querySelector('.f').style.width = `${Math.max(3, Math.round(p * 100))}%`; post({ type: 'lab3d', ev: 'progress', layer: id, p }); };
    function fail(err) {
      S.error = String(err?.message || err);
      bar.querySelector('.t').textContent = `🧊 ${S.name} didn't load: ${S.error}`;
      bar.lastElementChild.remove();
      bar.style.color = '#ffb0a0';
      post({ type: 'error', layer: id, message: `The model "${S.name}" didn't load: ${S.error}` }); // the Lab's errors (the director sees it)
      post({ type: 'lab3d', ev: 'error', layer: id, name: S.name, error: S.error });
    }

    // ---------- lights / sky / ground / effects (rebuilt only when their choice changes) ----------
    let lights = [];
    function buildLights(key) {
      for (const l of lights) { lightG.remove(l); l.shadow?.map?.dispose(); l.dispose?.(); }
      lights = [];
      const Lp = LIGHTS[key] || LIGHTS.studio;
      const hemi = new THREE.HemisphereLight(Lp.hemi[0], Lp.hemi[1], Lp.hemi[2]); lights.push(hemi);
      for (const [c, i, p, sh] of Lp.lights) {
        const d = new THREE.DirectionalLight(c, i); d.userData.p = p; d.userData.i = i;
        if (sh) { d.castShadow = true; d.shadow.mapSize.set(S.heavy ? 1024 : 2048, S.heavy ? 1024 : 2048); d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02; d.userData.shadow = true; }
        lights.push(d); lightG.add(d.target);
      }
      for (const l of lights) lightG.add(l);
      S.lightKey = key;
    }
    let ground = null;
    function buildGround(key) {
      if (ground) { scene.remove(ground); ground.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); o.dispose?.(); }); ground = null; }
      S.groundKey = key;
      if (key === 'none') return;
      const g = new THREE.Group(); g.name = 'ground';
      const R = 40;
      if (key === 'shadow' || key === 'mirror') {
        const sh = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.ShadowMaterial({ opacity: 0.38, transparent: true }));
        sh.rotation.x = -Math.PI / 2; sh.receiveShadow = true; sh.position.y = 0.001; g.add(sh);
      }
      if (key === 'mirror') {
        import('three/addons/objects/Reflector.js').then(({ Reflector }) => {
          if (ground !== g || S.gone) return;
          const m = new Reflector(new THREE.CircleGeometry(R, 64), { textureWidth: Math.round(innerWidth * 0.5), textureHeight: Math.round(innerHeight * 0.5), color: 0x8a8a8a, clipBias: 0.003 });
          m.rotation.x = -Math.PI / 2; m.name = 'mirror'; g.add(m);
        }).catch((e) => console.warn('Mirror ground:', e.message));
      }
      if (key === 'floor' || key === 'gloss') {
        const m = new THREE.Mesh(new THREE.CircleGeometry(R, 64), key === 'gloss' ? new THREE.MeshPhysicalMaterial({ color: '#1a1a1e', roughness: 0.15, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }) : new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.9 }));
        m.rotation.x = -Math.PI / 2; m.receiveShadow = true; g.add(m);
      }
      if (key === 'grid') { const gh = new THREE.GridHelper(R, 80, '#ff8a3d', '#555560'); gh.material.transparent = true; gh.material.opacity = 0.45; g.add(gh); }
      ground = g; scene.add(g);
    }
    async function setHdri(u) {
      S.hdriUrl = u;
      if (!u) { S.hdriEnv?.dispose(); S.hdriEnv = null; S.hdriBg = null; scene.environment = roomEnv; return; }
      try {
        const tex = await loadHdri(u);
        if (S.gone || S.hdriUrl !== u) return;
        S.hdriEnv?.dispose();
        S.hdriEnv = pmrem.fromEquirectangular(tex).texture; S.hdriBg = tex;
        scene.environment = S.hdriEnv;
      } catch (err) { console.error(`The sky didn't load: ${err.message}`); }
    }
    if (opts.hdri) setHdri(opts.hdri);
    // bloom / depth of field: a composer only while one of them is on
    async function buildFx(bloom, dof) {
      const key = `${bloom > 0}|${dof > 0}`;
      if (key === S.fxKey) return; S.fxKey = key;
      S.composer?.dispose?.(); S.composer = null;
      if (!(bloom > 0) && !(dof > 0)) return;
      const [{ EffectComposer }, { RenderPass }, { OutputPass }] = await Promise.all([import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      if (S.gone || S.fxKey !== key) return;
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
      const c = new EffectComposer(renderer, rt);
      c.addPass(new RenderPass(scene, camera));
      if (dof > 0) { const { BokehPass } = await import('three/addons/postprocessing/BokehPass.js'); S.bokeh = new BokehPass(scene, camera, { focus: 5, aperture: 0.002, maxblur: 0.01 }); c.addPass(S.bokeh); } else S.bokeh = null;
      if (bloom > 0) { const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'); S.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), bloom, 0.45, 0.82); c.addPass(S.bloom); } else S.bloom = null;
      c.addPass(new OutputPass());
      if (S.gone || S.fxKey !== key) { c.dispose?.(); return; }
      S.composer = c;
    }

    // ---------- materials ----------
    function setMaterials(kind, tint) {
      const k = `${kind}|${tint}|${kind === 'palette' ? (globalThis.palette || []).join() : ''}`;
      if (k === S.matKey) return; S.matKey = k;
      S.meshes.forEach((m, i) => {
        if (m.userData.preset) { (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); m.userData.preset = false; }
        m.material = m.userData.orig;
        if (kind === 'original') return;
        const one = (o) => presetMaterial(kind, o, tint, i) || o;
        m.material = Array.isArray(m.userData.orig) ? m.userData.orig.map(one) : one(m.userData.orig);
        m.userData.preset = true;
      });
    }
    // ---------- animation clips ----------
    function clipIndex(want) {
      if (want == null || want === '' || want === 'none') return -1;
      if (typeof want === 'number' || /^\d+$/.test(String(want))) return Math.min(S.clips.length - 1, Math.max(0, Math.round(Number(want))));
      const w = String(want).toLowerCase();
      const i = S.clips.findIndex((c) => c.name.toLowerCase() === w);
      return i >= 0 ? i : S.clips.findIndex((c) => c.name.toLowerCase().includes(w));
    }
    function setClip(want, loop, blend) {
      if (!S.mixer || !S.clips.length) return;
      const i = clipIndex(want); const key = `${i}|${loop}`;
      if (key === S.clipKey) return; S.clipKey = key;
      const next = i >= 0 ? S.mixer.clipAction(S.clips[i]) : null;
      if (next) { next.reset(); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); next.clampWhenFinished = !loop; next.enabled = true; next.play(); }
      if (S.action && S.action !== next) { if (next && blend > 0) S.action.crossFadeTo(next, blend, true); else if (blend > 0) S.action.fadeOut(blend); else S.action.stop(); }
      else if (next && blend > 0 && !S.action) next.fadeIn(Math.min(blend, 0.3));
      S.action = next;
      S.info.clip = next ? S.clips[i].name : null;
    }

    // ---------- the model arrives ----------
    async function arrive() {
      const asset = await loadAsset(url, setProgress, renderer);
      if (S.gone) return;
      const root = await cloneOf(asset);
      if (S.gone) return;
      S.root = root;
      const clips = [...asset.clips];
      for (const cu of opts.clips || []) { // extra animation files (Mixamo FBX "without skin", GLB clips)
        try { const a = await loadAsset(cu, null, renderer); for (const c of a.clips) { const k = c.clone(); if (clips.some((x) => x.name === k.name)) k.name = `${k.name} ${clips.length}`; clips.push(k); } } catch (err) { console.warn(`An animation file didn't load: ${err.message}`); }
      }
      if (S.gone) return;
      S.clips = clips;
      root.traverse((o) => {
        if (!o.isMesh && !o.isPoints) return;
        S.meshes.push(o); o.userData.orig = o.material; o.castShadow = true; o.receiveShadow = true;
        const g = o.geometry; S.tris += g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
        if (o.isSkinnedMesh || o.morphTargetInfluences) o.frustumCulled = false; // animated: its bounds move
      });
      // center on the ground, the biggest side = 2 world units (Size scales it)
      root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(root);
      if (b.isEmpty()) throw new Error('the file has nothing to draw (no meshes)');
      const size = b.getSize(new THREE.Vector3()); const c = b.getCenter(new THREE.Vector3());
      const k = 2 / Math.max(size.x, size.y, size.z, 1e-6);
      root.position.set(-c.x, -b.min.y, -c.z);
      fit.scale.setScalar(k);
      fit.add(root);
      S.size = size.y * k; S.box = { w: size.x * k, h: size.y * k, d: size.z * k };
      // explode view: each mesh's direction from the middle
      const mid = new THREE.Vector3(0, S.size / 2, 0);
      fit.updateMatrixWorld(true);
      for (const m of S.meshes) { const mb = new THREE.Box3().setFromObject(m); const mc = mb.getCenter(new THREE.Vector3()).sub(mid); m.userData.dir = mc.lengthSq() > 1e-8 ? mc.normalize() : new THREE.Vector3(0, 1, 0); m.userData.p0 = m.position.clone(); m.userData.pw = m.parent.getWorldScale(new THREE.Vector3()).x || 1; }
      if (S.clips.length) S.mixer = new THREE.AnimationMixer(root);
      S.heavy = S.tris > 1.5e6;
      if (S.heavy) { renderer.setPixelRatio(1); console.warn(`${S.name} is heavy (${Math.round(S.tris / 1000)}k triangles): shadows are off and the preview renders at 1×; lower Detail (/model lite) to simplify it.`); }
      S.loaded = true;
      S.info = { name: S.name, kind: asset.kind, mb: +(asset.bytes / 1048576).toFixed(2), tris: Math.round(S.tris), meshes: S.meshes.length, clips: S.clips.map((x) => x.name), clip: null, heavy: S.heavy, size: [+(size.x).toFixed(3), +(size.y).toFixed(3), +(size.z).toFixed(3)] };
      bar.remove();
      post({ type: 'lab3d', ev: 'loaded', layer: id, info: S.info });
    }
    arrive().catch((err) => { if (!S.gone) fail(err); });

    // simplify static meshes (Detail < 1), a few at a time
    async function simplify(detail) {
      S.detailKey = detail;
      if (detail >= 0.99) { for (const m of S.meshes) if (m.userData.g0) { m.geometry.dispose(); m.geometry = m.userData.g0; delete m.userData.g0; } return; }
      const { SimplifyModifier } = await import('three/addons/modifiers/SimplifyModifier.js');
      const mod = new SimplifyModifier();
      for (const m of S.meshes) {
        if (S.gone || S.detailKey !== detail) return;
        if (m.isSkinnedMesh || m.morphTargetInfluences || !m.isMesh) continue;
        const g0 = m.userData.g0 || m.geometry; const n = g0.attributes.position.count;
        if (n < 3000) continue;
        try { const g = mod.modify(g0, Math.floor(n * (1 - detail))); if (m.userData.g0) m.geometry.dispose(); else m.userData.g0 = g0; m.geometry = g; } catch { /* leave it */ }
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
      S.composer?.setSize(innerWidth, innerHeight); S.bloom?.setSize?.(innerWidth, innerHeight);
    });

    const v = new THREE.Vector3(); const look = new THREE.Vector3();
    // (round 21 "labgpu": colors reused, the layer's clock read without building the whole `layer` object every frame)
    const skyCol = new THREE.Color(); const fogCol = new THREE.Color();
    function frame() {
      if (S.gone) return;
      requestAnimationFrame(frame); // (the sandbox's frames: hidden / frozen / off-time layers wait)
      const lt = globalThis.__layerClock ? globalThis.__layerClock(id) : null;
      const L = lt == null ? globalThis.layer : null;
      const t = lt != null ? lt : L ? (L.scene ?? L.time) : performance.now() / 1000;
      const dt = S.t == null ? 0 : t - S.t; S.t = t;
      // look: lights, sky, ground, fog, effects
      const lk = String(val(P, 'light', 'studio'));
      if (lk !== S.lightKey) buildLights(lk);
      const Lp = LIGHTS[S.lightKey] || LIGHTS.studio;
      const sz = Math.max(1, S.size); const lightK = num(P, 'lights', 1);
      const lspin = (Lp.spin || 0) * t + num(P, 'lightTurn', 0) * DEG;
      lights.forEach((l) => {
        if (l.isHemisphereLight) { l.intensity = Lp.hemi[2] * lightK; return; }
        const [x, y, z] = l.userData.p; const cs = Math.cos(lspin); const sn = Math.sin(lspin);
        l.position.set((x * cs + z * sn) * sz, y * sz, (-x * sn + z * cs) * sz); l.target.position.set(0, S.size * 0.45, 0);
        l.intensity = l.userData.i * lightK;
        if (l.userData.shadow) { l.castShadow = !S.heavy && S.groundKey !== 'none' && S.groundKey !== 'grid'; const c = l.shadow.camera; const r = sz * 2.2; if (c.right !== r) { c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.far = sz * 30; c.updateProjectionMatrix(); } }
      });
      renderer.toneMappingExposure = Lp.exp * num(P, 'exposure', 1);
      const gk = String(val(P, 'ground', 'shadow'));
      if (gk !== S.groundKey) buildGround(gk);
      const sky = String(val(P, 'sky', 'clear'));
      scene.background = sky === 'hdri' && S.hdriBg ? S.hdriBg : sky === 'color' ? skyCol.set(val(P, 'skyColor', '#101014')) : null;
      scene.backgroundBlurriness = num(P, 'skyBlur', 0.2);
      if ('environmentIntensity' in scene) scene.environmentIntensity = (Lp.env ?? 1) * num(P, 'env', 1);
      const fog = num(P, 'fog', 0);
      if (fog > 0) { const fc = fogCol.set(val(P, 'fogColor', Lp.fogTint || '#101014')); if (!scene.fog) scene.fog = new THREE.FogExp2(fc, 0); scene.fog.color.copy(fc); scene.fog.density = fog * 0.25 / sz; } else scene.fog = null;
      const bloom = num(P, 'bloom', 0); const dof = num(P, 'dof', 0);
      buildFx(bloom, dof);
      if (!S.loaded) { renderer.render(scene, camera); return; }
      // the model: material, clip, size, turntable, explode, music
      const tint = String(val(P, 'tint', '#ffffff'));
      setMaterials(String(val(P, 'material', 'original')), tint);
      const detail = Math.max(0.05, Math.min(1, num(P, 'detail', 1)));
      if (Math.abs(detail - S.detailKey) > 0.02) { S.detailKey = detail; clearTimeout(S.simT); S.simT = setTimeout(() => simplify(detail), 400); }
      if (S.mixer) {
        setClip(val(P, 'clip', 0), on(P, 'loop', true), num(P, 'blend', 0.4));
        const sp = num(P, 'speed', 1) * (on(P, 'play', true) ? 1 : 0);
        if (dt < 0 || dt > 0.5) S.mixer.setTime(Math.max(0, t) * sp); else S.mixer.update(dt * sp);
      }
      const hit = audio.hits?.kick?.length ? audio.kick : audio.beat;
      S.pump = Math.max(S.pump * 0.88, hit || 0);
      const pulse = num(P, 'pulse', 0); const glow = num(P, 'glow', 0); const kickGlow = num(P, 'kickGlow', 0);
      rig.scale.setScalar(num(P, 'size', 1) * (1 + S.pump * pulse * 0.25));
      rig.position.set(num(P, 'x', 0), num(P, 'height', 0) + Math.sin(t * 2) * 0.05 * num(P, 'bob', 0), num(P, 'z', 0));
      rig.rotation.set(num(P, 'tilt', 0) * DEG, num(P, 'turn', 0) * DEG + num(P, 'spin', 0) * t * Math.PI * 2 / 10, 0);
      const g = glow + S.pump * kickGlow;
      const ex = num(P, 'explode', 0);
      for (const m of S.meshes) {
        if (ex > 0 || m.userData.exploded) { m.position.copy(m.userData.p0).addScaledVector(m.userData.dir, ex * 0.8 / (m.userData.pw || 1)); m.userData.exploded = ex > 0; }
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) if (mm && 'emissive' in mm && mm.emissive) { if (mm.userData.e0 == null) mm.userData.e0 = mm.emissiveIntensity ?? 1; if (g > 0 || mm.userData.glowed) { if (!mm.userData.glowed) mm.userData.ec = mm.emissive.clone(); mm.emissive.set(g > 0 ? tint : mm.userData.ec); mm.emissiveIntensity = g > 0 ? g : mm.userData.e0; mm.userData.glowed = g > 0; } }
      }
      // the camera: orbit / crane / distance / lens (camera moves are keyframes on these), looking at the model
      const fov = num(P, 'lens', 35);
      if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const sc = num(P, 'size', 1);
      const rad = Math.max(S.box.w, S.box.h, S.box.d) * 0.62 * sc;
      const fitD = rad / Math.sin(Math.min(camera.fov, camera.fov * camera.aspect) * DEG / 2);
      const d = fitD * num(P, 'distance', 1);
      const orb = (num(P, 'orbit', 0) + num(P, 'camSpin', 0) * t * 36) * DEG; const el = num(P, 'crane', 12) * DEG;
      const cy = S.size * sc * 0.5 + num(P, 'height', 0);
      v.set(Math.sin(orb) * Math.cos(el) * d, cy + Math.sin(el) * d, Math.cos(orb) * Math.cos(el) * d);
      camera.position.copy(v);
      if (on(P, 'aim', true)) camera.lookAt(look.set(num(P, 'x', 0), cy + num(P, 'aimY', 0) * S.size * sc, num(P, 'z', 0)));
      else { camera.rotation.set(0, orb, 0); }
      const near = Math.max(0.005, d / 200); const far = d * 60 + 50;
      if (camera.near !== near || camera.far !== far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
      if (on(P, 'faceCamera', false)) rig.lookAt(camera.position.x, rig.position.y, camera.position.z);
      if (S.bokeh) { S.bokeh.uniforms.focus.value = d; S.bokeh.uniforms.aperture.value = dof * 0.00015 / Math.max(0.2, sc); }
      if (S.bloom) S.bloom.strength = bloom;
      if (S.composer) S.composer.render(); else renderer.render(scene, camera);
      if (!S.thumbDone && S.loaded) { S.thumbDone = true; thumb(); }
    }
    // a small picture of this model alone (the Lab's model library)
    function thumb() {
      try {
        const src = renderer.domElement; const c = document.createElement('canvas'); const w = 192; const h = Math.round(w * Math.min(1.5, src.height / Math.max(1, src.width)));
        c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#16161a'; g.fillRect(0, 0, w, h);
        const k = Math.max(w / src.width, h / src.height); g.drawImage(src, (w - src.width * k) / 2, (h - src.height * k) / 2, src.width * k, src.height * k);
        post({ type: 'lab3d', ev: 'thumb', layer: id, url: S.url, name: S.name, image: c.toDataURL('image/jpeg', 0.8) });
      } catch { /* a bonus */ }
    }
    requestAnimationFrame(frame);

    S.dispose = () => {
      if (S.gone) return; S.gone = true;
      live.delete(id);
      clearTimeout(S.simT);
      try { S.mixer?.stopAllAction(); if (S.root) S.mixer?.uncacheRoot(S.root); } catch { /* gone */ }
      scene.traverse((o) => {
        if (o.userData?.g0) o.userData.g0.dispose();
        o.geometry?.dispose();
        const ms = o.userData?.preset ? [...(Array.isArray(o.material) ? o.material : [o.material]), ...(Array.isArray(o.userData.orig) ? o.userData.orig : [o.userData.orig])] : Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (!m) continue; for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose(); m.dispose?.(); }
        o.dispose?.();
      });
      S.composer?.dispose?.(); S.hdriEnv?.dispose(); roomEnv?.dispose(); pmrem.dispose();
      bar.remove();
    };
    // the layer's renderer is torn down by the sandbox on re-run / removal; the model goes with it
    const stop = renderer.dispose.bind(renderer);
    renderer.dispose = () => { S.dispose(); stop(); };
    return { renderer, scene, camera, state: S, setHdri };
  }

  function list() {
    return [...live.values()].map((S) => ({ layer: S.id, name: S.name, loaded: S.loaded, error: S.error, progress: +S.progress.toFixed(2), ...(S.info || {}), material: S.matKey?.split('|')[0] || null, light: S.lightKey, ground: S.groundKey, hdri: Boolean(S.hdriEnv), fx: S.composer ? S.fxKey : 'off', detail: S.detailKey }));
  }
  return { model, list, sniff, LIGHTS: Object.keys(LIGHTS), MATERIALS, live };
})();
globalThis.lab3d = lab3d;
};
