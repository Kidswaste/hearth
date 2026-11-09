// (round 158, split158) The Lab's other tools (Tools drawer): model viewer, shader playground, textures, docs.
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labparttools`, tools/three.js labPart). K0 is
// what it reaches inside the Lab (ThreeLab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).tools = (K0) => {
  // ---------- Model viewer tab ----------
  function modelTab(pane) {
    const view = el('div', { class: 'three-preview model-preview' });
    const side = el('div', { class: 'model-side' });
    let info = null;
    const btn = (text, title, fn) => el('button', { class: 'ghost small', text, title, on: { click: fn } });
    const toolbar = el('div', { class: 'three-toolbar' },
      btn('Open model…', 'GLB, GLTF, FBX, OBJ, STL or PLY', openModel),
      btn('Frame', 'Fit the model in view', () => box.send({ type: 'viewer', cmd: 'frame' })),
      btn('📷', 'Save a screenshot', () => box.send({ type: 'screenshot' })),
      btn('Loader code', 'Copy three.js code that loads this model and plays its animations', loaderCode),
      el('span', { class: 'spacer' }),
      el('span', { class: 'hint', text: 'Drop model files onto the view. For .gltf, drop its .bin and textures together.' }));
    pane.append(toolbar, el('div', { class: 'model-split' }, view, side));
    const box = K0.sandboxFrame(view, 'viewer', (msg) => {
      if (msg.type === 'model') { info = msg; renderSide(); toast(`Loaded ${msg.name}`, { timeout: 1500 }); }
      if (msg.type === 'error') toast(msg.message, { type: 'error' });
      if (msg.type === 'shot') K0.saveDataUrl(msg.dataUrl, `${info?.name || 'model'}.png`);
    });
    const cmd = (c, value, extra = {}) => box.send({ type: 'viewer', cmd: c, value, ...extra });

    async function openModel() {
      const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: '3D models', extensions: ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'ktx2'] }] });
      if (!paths.length) return;
      const main = paths.find((p) => /\.(glb|gltf|fbx|obj|stl|ply)$/i.test(p));
      if (!main) { toast('Pick a .glb, .gltf, .fbx, .obj, .stl or .ply file', { type: 'error' }); return; }
      const toBuf = async (p) => Uint8Array.from(atob(await window.hub.fs.read(p, { encoding: 'base64', maxBytes: 500 * 1048576 })), (c) => c.charCodeAt(0)).buffer;
      const extra = await Promise.all(paths.filter((p) => p !== main).map(async (p) => ({ name: p.split(/[\\/]/).pop(), buffer: await toBuf(p) })));
      box.send({ type: 'load', name: main.split(/[\\/]/).pop(), buffer: await toBuf(main), extra });
    }

    function loaderCode() {
      if (!info) { toast('Load a model first', { type: 'error' }); return; }
      const clips = info.clips.map((c) => c.name);
      const code = `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
${/\.(glb|gltf)$/i.test(info.name) ? '' : `// ${info.name} isn't glTF: convert it (Blender → File → Export → glTF 2.0) or swap in the matching loader.\n`}const loader = new GLTFLoader();
let mixer;
loader.load('models/${info.name}', (gltf) => {
  const model = gltf.scene;
  scene.add(model);${clips.length ? `
  mixer = new THREE.AnimationMixer(model);
  // Clips: ${clips.join(', ')}
  const clip = THREE.AnimationClip.findByName(gltf.animations, '${clips[0].replace(/'/g, "\\'")}');
  mixer.clipAction(clip).play();` : ''}
});
${clips.length ? '// In your render loop: mixer?.update(clock.getDelta());\n' : ''}// Size in units: ${info.size.join(' × ')} · ${info.triangles.toLocaleString()} triangles
`;
      copyText(code, 'Loader code copied');
    }

    function renderSide() {
      side.replaceChildren();
      if (!info) { side.append(el('p', { class: 'hint', text: 'Open or drop a model to see its stats, materials, scene tree and animations.' })); return; }
      const stat = (label, value) => el('div', { class: 'stat' }, el('span', { text: label }), el('b', { text: value }));
      const section = (title, ...kids) => el('details', { class: 'model-section', open: true }, el('summary', { text: title }), ...kids);
      side.append(
        el('h3', { text: info.name }),
        section('Stats', el('div', { class: 'stats-grid' },
          stat('Triangles', info.triangles.toLocaleString()), stat('Vertices', info.vertices.toLocaleString()),
          stat('Meshes', info.meshes), stat('Draw calls (est.)', info.drawCalls), stat('Materials', info.materials.length),
          stat('Textures', `${info.textures.length} · ${fmtBytes(info.gpuTextureBytes)} GPU`), stat('Size (units)', info.size.join(' × ')),
          stat('Skinned meshes', info.skinned ? `${info.skinned} (${info.maxBones} bones max)` : '0'))),
        section('Performance audit', el('ul', { class: 'issues' }, info.issues.map((i) => el('li', { class: i.level, text: i.text })))),
        section('Display', ...displayControls()),
        info.clips.length ? section(`Animations (${info.clips.length})`, animationControls()) : null,
        section(`Materials (${info.materials.length})`, ...info.materials.map(materialRow)),
        section('Scene tree', treeNode(info.tree, 0)),
        info.textures.length ? section(`Textures (${info.textures.length})`, el('div', { class: 'tex-list' }, info.textures.map((t) => el('div', { class: 'tex-row' },
          el('span', { text: t.name }), el('span', { class: t.pot ? '' : 'warn', text: `${t.w}×${t.h}` }), el('span', { class: 'hint', text: fmtBytes(t.bytes) }))))) : null);
    }
    function displayControls() {
      const toggle = (label, c, initial) => {
        const input = el('input', { type: 'checkbox', checked: initial, on: { change: () => cmd(c, input.checked) } });
        return el('label', { class: 'check' }, input, label);
      };
      const bg = el('input', { type: 'color', value: '#1b1e25', on: { input: () => cmd('background', bg.value) } });
      return [el('div', { class: 'check-grid' },
        toggle('Wireframe', 'wireframe', false), toggle('Bounding box', 'bbox', false), toggle('Grid', 'grid', true), toggle('Axes', 'axes', true),
        toggle('Environment light', 'environment', true), toggle('Vertex normals', 'normals', false), toggle('Auto-rotate', 'autorotate', false)),
      el('label', { class: 'row' }, 'Background ', bg)];
    }
    function animationControls() {
      const sel = el('select', {}, info.clips.map((c) => el('option', { value: c.name, text: `${c.name} (${c.duration}s, ${c.tracks} tracks)` })));
      const speed = el('input', { type: 'range', min: 0, max: 3, step: 0.05, value: 1 });
      const speedLabel = el('span', { class: 'hint', text: '1×' });
      const scrub = el('input', { type: 'range', min: 0, max: info.clips[0].duration, step: 0.01, value: 0 });
      let paused = false;
      const pause = el('button', { class: 'ghost small', text: '⏸ Pause', on: { click: () => { paused = !paused; pause.textContent = paused ? '▶ Play' : '⏸ Pause'; cmd('pause', paused); } } });
      sel.addEventListener('change', () => { cmd('clip', sel.value); scrub.max = info.clips.find((c) => c.name === sel.value).duration; });
      speed.addEventListener('input', () => { speedLabel.textContent = `${Number(speed.value).toFixed(2)}×`; if (!paused) cmd('speed', Number(speed.value)); });
      scrub.addEventListener('input', () => { if (!paused) pause.click(); cmd('seek', Number(scrub.value)); });
      return el('div', { class: 'anim-controls' }, sel, el('div', { class: 'row' }, pause, el('span', { class: 'hint', text: 'Speed' }), speed, speedLabel), el('label', { class: 'hint' }, 'Scrub (pauses)', scrub));
    }
    function materialRow(m) {
      const row = el('div', { class: 'mat-row' }, el('div', { class: 'mat-name' }, el('b', { text: m.name }), el('span', { class: 'hint', text: `${m.type}${m.maps.length ? ` · ${m.maps.join(', ')}` : ''}` })));
      const ctrl = el('div', { class: 'mat-ctrl' });
      if (m.color) ctrl.append(el('label', { class: 'hint' }, 'Color ', el('input', { type: 'color', value: m.color, on: { input: (e) => cmd('material', e.target.value, { uuid: m.uuid, prop: 'color' }) } })));
      if (m.emissive) ctrl.append(el('label', { class: 'hint' }, 'Emissive ', el('input', { type: 'color', value: m.emissive, on: { input: (e) => cmd('material', e.target.value, { uuid: m.uuid, prop: 'emissive' }) } })));
      for (const prop of ['roughness', 'metalness', 'opacity']) {
        if (typeof m[prop] !== 'number') continue;
        ctrl.append(el('label', { class: 'hint slider' }, prop, el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: m[prop], on: { input: (e) => cmd('material', Number(e.target.value), { uuid: m.uuid, prop }) } })));
      }
      row.append(ctrl);
      return row;
    }
    function treeNode(n, depth) {
      const vis = el('input', { type: 'checkbox', checked: n.visible, title: 'Visible', on: { change: (e) => cmd('visible', e.target.checked, { uuid: n.uuid }) } });
      const label = el('span', { class: 'tree-label', text: n.name, title: n.type, on: { click: () => cmd('select', null, { uuid: n.uuid }) } });
      const row = el('div', { class: 'tree-row', style: { paddingLeft: `${depth * 12}px` } }, vis, label, el('span', { class: 'hint', text: n.type.replace(/Mesh$/, ' mesh') }));
      return el('div', {}, row, n.children.slice(0, 400).map((c) => treeNode(c, depth + 1)));
    }
    renderSide();
    K0.api.openModel = openModel;
  }
  // ---------- Shader tab ----------
  function shaderTab(pane) {
    const status = el('span', { class: 'hint' });
    const presetSel = el('select', {}, el('option', { value: '', text: 'Presets…' }), Object.keys(ThreeData.SHADERS).map((k) => el('option', { value: k, text: k })));
    const editorHost = el('div', { class: 'three-editor' });
    const preview = el('div', { class: 'three-preview' });
    const errorsBox = el('div', { class: 'three-console' });
    const editor = new CodeEditor(editorHost, { lang: 'glsl', onRun: () => apply(), onChange: debounce(() => { store.set('three.shader', editor.value); apply(); }, 500) });
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    pane.append(el('div', { class: 'three-toolbar' },
      btn('▶ Compile', 'Compile (Ctrl+Enter); it also recompiles as you type', () => apply(), 'primary small'), presetSel,
      el('span', { class: 'hint', text: 'Uniforms: uTime, uResolution, uMouse, uFrame · write to fragColor · Shadertoy mainImage() works too' }),
      el('span', { class: 'spacer' }), status,
      btn('📷', 'Save a screenshot', () => box.send({ type: 'screenshot' })),
      btn('Copy as ShaderMaterial', 'three.js code for this shader on a mesh', copyMaterial),
      btn('Ask Claude', 'Send this shader (and errors) to Claude', () => draftToClaude(`Here's my GLSL ES 3.0 fragment shader (uniforms uTime, uResolution, uMouse; output fragColor).${errorsBox.textContent ? `\n\nCompiler errors:\n${errorsBox.textContent}` : ''}\n\n\`\`\`glsl\n${editor.value}\n\`\`\`\n\n`))),
    el('div', { class: 'three-split' }, editorHost, el('div', { class: 'three-right' }, preview, errorsBox)));
    const box = K0.sandboxFrame(preview, 'shader', (msg) => {
      if (msg.type === 'shader-error') {
        status.textContent = 'Compile error';
        status.className = 'hint bad';
        errorsBox.replaceChildren(...msg.errors.map((e) => el('div', { class: 'console-row error' }, e.line ? el('span', { class: 'console-line', text: `line ${e.line}` }) : null, el('span', { text: e.message }))));
        editor.setErrorLines(msg.errors.map((e) => e.line).filter((l) => l > 0));
      }
      if (msg.type === 'ready' && msg.again) apply(); // the page restarted by itself: compile again
      if (msg.type === 'shader-ok') { status.textContent = 'Compiled'; status.className = 'hint ok'; errorsBox.replaceChildren(); editor.setErrorLines([]); }
      if (msg.type === 'shot') K0.saveDataUrl(msg.dataUrl, 'shader.png');
    });
    function apply() { box.send({ type: 'shader', code: editor.value }); }
    function copyMaterial() {
      const frag = editor.value.replace(/`/g, '\\`');
      copyText(`const uniforms = { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) }, uMouse: { value: new THREE.Vector2() }, uFrame: { value: 0 } };
const material = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms,
  vertexShader: \`out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,
  fragmentShader: \`uniform float uTime; uniform vec2 uResolution; uniform vec2 uMouse; uniform int uFrame;
in vec2 vUv;
out vec4 fragColor;
#define iTime uTime
#define iResolution vec3(uResolution, 1.0)
#define iMouse vec4(uMouse, 0.0, 0.0)
${frag}\`,
});
// Each frame: uniforms.uTime.value = clock.getElapsedTime();`, 'ShaderMaterial code copied');
    }
    presetSel.addEventListener('change', () => { if (presetSel.value) { editor.setValue(ThreeData.SHADERS[presetSel.value]); store.set('three.shader', editor.value); apply(); presetSel.value = ''; } });
    editor.setValue(store.get('three.shader', ThreeData.SHADERS['Gradient + time']));
    apply();
    K0.api.openShader = (code) => { editor.setValue(code); store.set('three.shader', code); apply(); };
    window.ShaderNodes?.attachPlayground?.(pane, { editor }); // "◇ Nodes": edit shaders as node graphs (nodes-shader.js)
  }
  // ---------- Textures tab ----------
  function textureTab(pane) {
    const list = el('div', { class: 'tex-cards' });
    const intro = el('div', { class: 'drop-hint', text: 'Drop images here (or Open…) to check sizes, power-of-two, alpha and GPU memory, and to resize them for three.js.' });
    pane.append(el('div', { class: 'three-toolbar' },
      el('button', { class: 'ghost small', text: 'Open images…', on: { click: async () => { for (const p of await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] })) inspect({ name: p.split(/[\\/]/).pop(), url: WinMac.fileUrl(p), path: p }); } } }),
      el('button', { class: 'ghost small', text: 'Clear', on: { click: () => list.replaceChildren() } })), intro, list);
    dropZone(pane, (files) => files.filter((f) => f.type.startsWith('image/')).forEach((f) => inspect({ name: f.name, url: URL.createObjectURL(f), size: f.size, path: window.hub.pathForFile(f) })), { hint: 'Drop images to inspect' });
    const pot = (n) => (n & (n - 1)) === 0;
    const nearestPot = (n) => 2 ** Math.round(Math.log2(n));
    async function inspect({ name, url, size, path }) {
      intro.hidden = true;
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => null);
      if (!img.naturalWidth) { toast(`Couldn't read ${name}`, { type: 'error' }); return; }
      const w = img.naturalWidth; const h = img.naturalHeight;
      if (size == null && path) size = (await window.hub.fs.stat(path))?.size;
      // Alpha check on a downscaled copy.
      const c = document.createElement('canvas');
      c.width = Math.min(w, 256); c.height = Math.min(h, 256);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let alpha = false;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
      const gpu = Math.round(w * h * 4 * 1.333);
      const tips = [];
      if (!pot(w) || !pot(h)) tips.push(`Not power-of-two. Nearest POT: ${nearestPot(w)}×${nearestPot(h)}.`);
      if (Math.max(w, h) > 2048) tips.push('Larger than 2048 px; most web scenes don\'t need it (and some phones cap at 4096).');
      if (!alpha && /\.png$/i.test(name) && (size || 0) > 300 * 1024) tips.push('No transparency: a JPG or WebP would be much smaller.');
      if (gpu > 16 * 1048576) tips.push('Uses a lot of GPU memory. KTX2/Basis compression cuts it ~4–8×.');
      if (!tips.length) tips.push('Looks good for three.js.');
      const target = el('select', {}, [4096, 2048, 1024, 512, 256, 128].map((s) => el('option', { value: s, text: `${s}×${s}`, selected: s === Math.min(2048, nearestPot(Math.max(w, h))) })));
      const fmtSel = el('select', {}, el('option', { value: 'png', text: 'PNG' }), el('option', { value: 'jpeg', text: 'JPG', selected: !alpha }), el('option', { value: 'webp', text: 'WebP' }));
      const tileBox = el('input', { type: 'checkbox' });
      const preview = el('div', { class: 'tex-preview', style: { backgroundImage: `url("${url}")` } });
      tileBox.addEventListener('change', () => preview.classList.toggle('tiled', tileBox.checked));
      list.prepend(el('div', { class: 'tex-card' }, preview,
        el('div', { class: 'tex-info' },
          el('b', { text: name }),
          el('div', { class: 'stats-grid' },
            el('div', { class: 'stat' }, el('span', { text: 'Size' }), el('b', { class: pot(w) && pot(h) ? 'ok' : 'warn', text: `${w}×${h}` })),
            el('div', { class: 'stat' }, el('span', { text: 'File' }), el('b', { text: size ? fmtBytes(size) : '?' })),
            el('div', { class: 'stat' }, el('span', { text: 'Alpha' }), el('b', { text: alpha ? 'yes' : 'no' })),
            el('div', { class: 'stat' }, el('span', { text: 'GPU (RGBA + mips)' }), el('b', { text: fmtBytes(gpu) }))),
          el('ul', { class: 'issues' }, tips.map((t) => el('li', { class: tips[0] === 'Looks good for three.js.' ? 'ok' : 'info', text: t }))),
          el('div', { class: 'row' }, el('label', { class: 'check small' }, tileBox, 'Tile preview'), 'Resize to', target, fmtSel,
            el('button', { class: 'ghost small', text: 'Save resized…', on: { click: () => resize(img, name, Number(target.value), fmtSel.value) } })))));
    }
    function resize(img, name, maxSide, format) {
      const scale = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      // Keep aspect, snapping each side to a power of two.
      c.width = 2 ** Math.round(Math.log2(Math.max(1, img.naturalWidth * scale)));
      c.height = 2 ** Math.round(Math.log2(Math.max(1, img.naturalHeight * scale)));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const dataUrl = c.toDataURL(`image/${format}`, 0.9);
      window.hub.saveFile({ defaultPath: `${name.replace(/\.\w+$/, '')}_${c.width}x${c.height}.${ext}`, filters: [{ name: 'Image', extensions: [ext] }], content: dataUrl.split(',')[1], base64: true })
        .then((p) => p && toast(`Saved ${c.width}×${c.height} ${ext.toUpperCase()}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }));
    }
  }
  // ---------- Docs tab ----------
  function docsTab(pane) {
    const search = el('input', { type: 'search', placeholder: 'Search three.js classes (e.g. MeshStandardMaterial)…' });
    const list = el('div', { class: 'docs-list' });
    const webHost = el('div', { class: 'docs-web' });
    pane.append(el('div', { class: 'docs-layout' }, el('div', { class: 'docs-side' }, search,
      el('div', { class: 'row' },
        el('button', { class: 'ghost small', text: 'Manual', on: { click: () => web.view.loadURL('https://threejs.org/manual/') } }),
        el('button', { class: 'ghost small', text: 'Examples', on: { click: () => web.view.loadURL('https://threejs.org/examples/') } }),
        el('button', { class: 'ghost small', text: 'Forum', on: { click: () => web.view.loadURL('https://discourse.threejs.org/') } })),
      list), webHost));
    const web = WebPane(webHost, { url: 'https://threejs.org/docs/', partition: 'persist:threedocs', zoomKey: 'threedocs' });
    let classes = [];
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const hits = classes.filter((c) => c.toLowerCase().includes(q)).sort((a, b) => (a.toLowerCase().startsWith(q) ? -1 : 0) - (b.toLowerCase().startsWith(q) ? -1 : 0)).slice(0, 300);
      list.replaceChildren(...hits.map((c) => el('button', { class: 'docs-item', text: c, on: { click: () => web.view.loadURL(`https://threejs.org/docs/${c}.html`) } })));
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('button')?.click(); });
    (async () => {
      const cached = store.get('three.docsIndex', null);
      if (cached && Date.now() - cached.at < 7 * 864e5) classes = cached.classes;
      else {
        try {
          const html = await window.hub.fetchText('https://threejs.org/docs/');
          classes = [...new Set([...html.matchAll(/<a href="([A-Za-z0-9_]+)\.html">\1<\/a>/g)].map((m) => m[1]))].sort();
          store.set('three.docsIndex', { at: Date.now(), classes });
        } catch (err) { list.append(el('p', { class: 'hint', text: `Couldn't load the class list: ${calmError(err)}` })); }
      }
      render();
    })();
  }
  function toolsDrawer(anchor) {
    const r = anchor.getBoundingClientRect();
    ThreeTweaks.menu(r.left, r.bottom + 4, ['Tools', ['◭ Sketch', 'The Lab (Esc from any tool)', () => K0.tabs.show('sketch'), K0.tabs.current === 'sketch', 'Tools: Sketch'],
      ...K0.TOOL_TABS.map(([id, label, hint, , icon]) => [`${icon} ${label}`, hint, () => K0.tabs.show(id), K0.tabs.current === id, `Tools: ${label}`]),
      'Quick', ['Open a 3D model…', 'GLB, FBX, OBJ, STL, PLY', () => { K0.tabs.show('models'); setTimeout(() => K0.api.openModel?.(), 80); }], ...(typeof Apps !== 'undefined' ? [['▣ Apps: Meshy, Poly Haven, Sketchfab…', 'Free skies and models, Meshy 3D models: straight into this sketch', () => Apps.menu(r.left, r.bottom + 4)]] : []), ['Paste a shader…', 'Opens the playground with your clipboard', async () => { let t = ''; try { t = await navigator.clipboard.readText(); } catch { /* none */ } K0.tabs.show('shader'); if (/void\s+main|mainImage/.test(t)) setTimeout(() => K0.api.openShader?.(t), 80); }]]);
  }
  return { modelTab, shaderTab, textureTab, docsTab, toolsDrawer };
};
