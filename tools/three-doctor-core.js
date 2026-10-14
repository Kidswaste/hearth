// 🩺 "Fix my scene" (round 34, scenedoctor): the rules, no DOM (Node-tested by dev/scenedoctor-test.js).
// A free, local check of the Lab scene on screen. tools/three-doctor.js reads the scene into one object R:
//   R = { pic: picture(...) | null, subject: subject box in the picture | null,
//         layers: [{ id, name, visible, opacity, code, sliders: [{ key, label, value, min, max, followsMusic }] }],
//         probe: { 'Layer name': probe() of that layer's three.js scene } | null,
//         errors: [{ layer, message, line }], console: ['text'], perf: { fps, p50, parked, light, adapt } | null,
//         sound: true when a song or live sound plays into the scene, frozen }
// and diagnose(R) turns it into findings, each one plain sentence with one local fix (or none) and a short request
// for the director (used only when the owner presses "Ask the director": it fills the composer, never sends):
//   { id, layer?, layerName?, text, fix: { kind, label, … } | null, ask }
// Fix kinds (tools/three-doctor.js applies them, each as one undo step): hide · show · frame (the layer's '@camera'
// placement, the same override the scene editor's "📷 Use this view" writes) · light (✨ autopolish, exposure only) ·
// slider (set values) · lightmode · adapt (labadapt's ladder back on) · live (listen to the system sound).
// probe(S) runs INSIDE the sandbox (sent as its source through the director's eval) over __scenes; it must stay
// self-contained (no closures, no THREE global: it builds vectors from the camera's own classes).
const DoctorCore = (() => {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const q = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

  // ---------- the picture (RGBA bytes of a small shot) ----------
  // mean / std / p05 / p95 of the luma (0..1), black = share under 3 %, white = share over 97 %
  function picture(px, w, h) {
    if (!px || !w || !h) return null;
    const hist = new Float64Array(256);
    let sum = 0; let sum2 = 0; let n = 0; let black = 0; let white = 0;
    for (let i = 0; i < w * h * 4; i += 4) {
      const a = px[i + 3] / 255;
      const y = ((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255) * a;
      hist[Math.min(255, Math.round(y * 255))] += 1;
      sum += y; sum2 += y * y; n += 1;
      if (y < 0.03) black += 1; else if (y > 0.97) white += 1;
    }
    const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i += 1) { acc += hist[i]; if (acc >= n * p) return i / 255; } return 1; };
    const mean = sum / n;
    return { mean: r3(mean), std: r3(Math.sqrt(Math.max(0, sum2 / n - mean * mean))), p05: r3(pct(0.05)), p95: r3(pct(0.95)), black: r3(black / n), white: r3(white / n) };
  }
  // what stands out from the background (▦ All formats' reading, FormatsCore.subjectBox, when it is loaded)
  function subject(px, w, h) {
    const FC = typeof FormatsCore !== 'undefined' ? FormatsCore : (typeof require === 'function' ? (() => { try { return require('./three-formats-core.js'); } catch { return null; } })() : null);
    return FC?.subjectBox ? FC.subjectBox(px, w, h) : null;
  }

  // ---------- inside the sandbox: each layer's three.js scene ----------
  // → { 'Layer': { objects, meshes, points, instances, lights, lit, env, pr, nan: [], missing: [], ortho,
  //      subject: { share, offscreen, behind }, inside: 'name' | null, frame: { p, q, fov } | null, rig } }
  function probe(S) {
    const fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const r4 = (x) => Math.round(x * 1e4) / 1e4;
    const LIT = /MeshStandard|MeshPhysical|MeshPhong|MeshLambert|MeshToon/;
    const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'matcap'];
    const out = {};
    for (const [name, x] of Object.entries(S || {})) {
      const { scene, camera, renderer } = x || {};
      if (!scene || typeof scene.traverse !== 'function') continue;
      const L = { objects: 0, meshes: 0, points: 0, instances: 0, lights: 0, lit: 0, env: Boolean(scene.environment), pr: 1, nan: [], missing: [], ortho: Boolean(camera && camera.isOrthographicCamera), subject: null, inside: null, frame: null, rig: false };
      try { L.pr = Math.round((renderer.__basePR != null ? renderer.__basePR : renderer.getPixelRatio()) * 100) / 100; } catch { /* no renderer */ }
      const items = [];
      const shown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
      try { scene.updateMatrixWorld(); } catch { /* a broken matrix: the NaN check below says which */ }
      scene.traverse((o) => {
        L.objects += 1;
        if (L.objects > 60000) return;
        const tag = o.name || o.type;
        if (L.nan.length < 4 && ![o.position, o.scale].every((v) => !v || (fin(v.x) && fin(v.y) && fin(v.z)))) L.nan.push(tag);
        if (o.isLight && o.visible !== false) L.lights += 1;
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !shown(o)) return;
        const g = o.geometry;
        const n = (g && g.attributes && g.attributes.position && g.attributes.position.count) || 0;
        if (o.isPoints) L.points += n;
        if (o.isMesh) L.meshes += 1;
        if (o.isInstancedMesh) L.instances += o.count || 0;
        let back = false;
        for (const m of [].concat(o.material || [])) {
          if (!m) continue;
          if (LIT.test(m.type || '')) L.lit += 1;
          if (m.side === 1) back = true;
          for (const k of MAPS) {
            const t = m[k];
            if (!t || !t.isTexture || t.isRenderTargetTexture || t.isDataTexture || t.isCanvasTexture || t.isVideoTexture || t.isFramebufferTexture) continue;
            const img = t.image;
            const broken = img == null ? t.version === 0 : (img.complete === true && img.naturalWidth === 0);
            if (broken && L.missing.length < 4) L.missing.push(t.name || (t.userData && (t.userData.src || t.userData.url)) || (img && img.src ? String(img.src).split('/').pop() : `${k} on ${tag}`));
          }
        }
        if (o.isSprite || !g) return;
        let bs = null;
        try {
          if (o.isInstancedMesh && typeof o.computeBoundingSphere === 'function') { if (!o.boundingSphere) o.computeBoundingSphere(); bs = o.boundingSphere; } else { if (!g.boundingSphere) g.computeBoundingSphere(); bs = g.boundingSphere; }
        } catch { bs = null; }
        if (!bs) return;
        if (!fin(bs.radius) || !fin(bs.center.x) || !fin(bs.center.y) || !fin(bs.center.z)) { if (L.nan.length < 4) L.nan.push(`${tag} (its shape)`); return; }
        const s = bs.clone().applyMatrix4(o.matrixWorld);
        if (!fin(s.radius) || !fin(s.center.x)) { if (L.nan.length < 4) L.nan.push(tag); return; }
        items.push({ o, g, c: s.center, r: s.radius, back, tag });
      });
      if (!camera || !camera.matrixWorld || !items.length) { out[name] = L; continue; }
      // the backgrounds (a sky / room sphere seen from inside, something 20× bigger than the rest) aren't the subject
      const rs = items.map((i) => i.r).sort((a, b) => a - b);
      const med = rs[rs.length >> 1] || 1e-6;
      let subj = items.filter((i) => !i.back && !(items.length > 2 && i.r > 20 * med));
      if (!subj.length) subj = items.filter((i) => !i.back);
      if (!subj.length) { out[name] = L; continue; }
      try { camera.updateMatrixWorld(); } catch { /* fine */ }
      const V = camera.position.constructor;
      const cp = new V().setFromMatrixPosition(camera.matrixWorld);
      const inv = camera.matrixWorld.clone().invert();
      const tanH = camera.isPerspectiveCamera ? Math.tan((camera.fov * Math.PI) / 360) / (camera.zoom || 1) : 1;
      const asp = camera.isPerspectiveCamera ? (camera.aspect || 1) : 1;
      let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity; let behind = 0;
      for (const i of subj) {
        const v = i.c.clone().applyMatrix4(inv);
        let x; let y; let rx; let ry;
        if (camera.isPerspectiveCamera) {
          const z = -v.z;
          if (z + i.r <= 0) { behind += 1; continue; }
          const zz = Math.max(z, 1e-4);
          if (z < i.r) { x = 0; y = 0; rx = 9; ry = 9; } else { x = v.x / (zz * tanH * asp); y = v.y / (zz * tanH); ry = i.r / (zz * tanH); rx = ry / asp; }
        } else if (camera.isOrthographicCamera) {
          const hw = (camera.right - camera.left) / 2 / (camera.zoom || 1); const hh = (camera.top - camera.bottom) / 2 / (camera.zoom || 1);
          x = (v.x - (camera.right + camera.left) / 2) / hw; y = (v.y - (camera.top + camera.bottom) / 2) / hh; rx = i.r / hw; ry = i.r / hh;
        } else continue;
        bx0 = Math.min(bx0, x - rx); bx1 = Math.max(bx1, x + rx); by0 = Math.min(by0, y - ry); by1 = Math.max(by1, y + ry);
      }
      const ix = Math.max(0, Math.min(1, bx1) - Math.max(-1, bx0)); const iy = Math.max(0, Math.min(1, by1) - Math.max(-1, by0));
      const share = bx1 > bx0 ? (ix * iy) / 4 : 0;
      L.subject = { share: r4(share), offscreen: share === 0, behind: behind === subj.length, box: bx1 > bx0 ? [bx0, by0, bx1, by1].map(r4) : null };
      // the camera inside something solid (not a room: one that holds two of the other shapes' centres)
      for (const i of subj) {
        if (i.o.isInstancedMesh || i.o.isPoints || i.o.isLine) continue;
        try { if (!i.g.boundingBox) i.g.computeBoundingBox(); } catch { continue; }
        const b = i.g.boundingBox && i.g.boundingBox.clone().applyMatrix4(i.o.matrixWorld);
        if (!b || !b.containsPoint(cp)) continue;
        const holds = subj.filter((j) => j !== i && b.containsPoint(j.c)).length;
        if (holds < 2) { L.inside = i.tag; break; }
      }
      // a framing that shows the whole subject: same direction (or straight back when inside), at the distance where
      // its bounding sphere fits the narrower side of the frame
      L.rig = Boolean(camera.parent && camera.parent !== scene && camera.parent.type !== 'Scene');
      if (camera.isPerspectiveCamera && !L.rig) {
        let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
        for (const i of subj) { x0 = Math.min(x0, i.c.x - i.r); x1 = Math.max(x1, i.c.x + i.r); y0 = Math.min(y0, i.c.y - i.r); y1 = Math.max(y1, i.c.y + i.r); z0 = Math.min(z0, i.c.z - i.r); z1 = Math.max(z1, i.c.z + i.r); }
        const C = new V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        let R = 0; for (const i of subj) R = Math.max(R, i.c.distanceTo(C) + i.r);
        const half = Math.min(tanH, tanH * asp);
        const dist = Math.max(R / Math.sin(Math.atan(half)), (camera.near || 0.1) * 2 + R);
        const dir = cp.clone().sub(C);
        if (L.inside || dir.length() < 1e-6 || L.subject.behind) dir.set(0, 0, 1).applyQuaternion(camera.getWorldQuaternion(camera.quaternion.clone()));
        dir.normalize();
        const p = C.clone().add(dir.multiplyScalar(dist));
        const t = camera.clone();
        t.position.copy(p); t.up.copy(camera.up); t.lookAt(C); t.updateMatrixWorld();
        if ([p.x, p.y, p.z].every(fin)) L.frame = { p: [p.x, p.y, p.z].map(r4), q: t.quaternion.toArray().map((v) => Math.round(v * 1e5) / 1e5), fov: camera.fov, far: (camera.far || 2000) < dist + R };
      }
      out[name] = L;
    }
    return out;
  }
  // what tools/three-doctor.js sends through the director's eval (the result is a JSON string)
  const probeSource = () => `return JSON.stringify((${probe.toString()})(globalThis.__scenes));`;

  // ---------- the rules ----------
  const AUDIO_RE = /\baudio\s*\.\s*(level|loud|volume|bass|low|mid|high|treble|kick|snare|hats?|beat|beatPhase|onBeat|energy|bands?|fft|spectrum|rms|peak|drop)\b|\bonBeat\s*\(|\baudio\s*\[\s*['"]/;
  const COUNT_RE = /count|particles?|amount|number|num\b|density|instances|stars|points|boids|agents/i;
  const MISSING_RE = /(failed to load|could ?n[o']?t load|couldn't load|\b404\b|not found|ERR_FILE_NOT_FOUND|net::ERR|no such file)/i;
  const FILE_RE = /([\w\-. %]+\.(png|jpe?g|webp|gif|avif|hdr|exr|ktx2?|glb|gltf|obj|fbx|stl|ply|mp3|wav|ogg|m4a|mp4|webm|mov|json|ttf|otf|woff2?))\b/i;
  const layerSays = (L) => `"${L}"`;

  function diagnose(R = {}) {
    const out = [];
    const layers = R.layers || [];
    const shownLayers = layers.filter((L) => L.visible !== false && (L.opacity ?? 1) > 0.02);
    const byName = (n) => layers.find((L) => L.name === n) || null;
    const probe = R.probe || {};
    const pic = R.pic;
    const blank = pic ? pic.std < 0.012 : false;
    const visErrors = (R.errors || []).filter((e) => { const L = byName(e.layer) || (layers.length === 1 ? layers[0] : null); return !L || L.visible !== false; });

    // 1. a layer throws
    const seenErr = new Set();
    for (let e of visErrors) {
      const L = byName(e.layer) || (layers.length === 1 ? layers[0] : null);
      const key = `${L?.id || '?'}`;
      if (seenErr.has(key)) continue;
      seenErr.add(key);
      e = { ...e, message: String(e.message || '').replace(/^Uncaught\s+/, '') };
      const nm = L?.name || e.layer || 'the sketch';
      out.push({ id: `error:${key}`, kind: 'error', layer: L?.id || null, layerName: nm,
        text: `${layers.length > 1 ? `The layer ${layerSays(nm)}` : 'The sketch'} stopped with an error: ${q(e.message, 90)}${e.line ? ` (line ${e.line})` : ''}.`,
        fix: L && shownLayers.length > 1 ? { kind: 'hide', layer: L.id, label: 'Hide this layer' } : null,
        ask: `Fix the error in layer ${layerSays(nm)}: "${q(e.message, 120)}"${e.line ? ` at line ${e.line}` : ''}. Keep the look.` });
    }

    // 2. nothing on screen
    if (pic && blank) {
      const tone = pic.mean < 0.06 ? 'all black' : pic.mean > 0.94 ? 'all white' : 'one flat color';
      const hidden = layers.filter((L) => L.visible === false || (L.opacity ?? 1) <= 0.02);
      const off = Object.entries(probe).find(([n, P]) => byName(n)?.visible !== false && P.subject && P.subject.offscreen && P.frame);
      const dark = Object.entries(probe).find(([n, P]) => byName(n)?.visible !== false && P.lit > 0 && P.lights === 0 && !P.env);
      let fix = null; let why = ''; let ask = `The Lab frame is ${tone}: nothing shows. Find why and fix it.`;
      if (layers.length && !shownLayers.length) { fix = { kind: 'show', layers: hidden.map((L) => L.id), label: hidden.length === 1 ? 'Show the layer' : 'Show the layers' }; why = hidden.length === 1 ? ' because its only layer is hidden' : ' because every layer is hidden'; } else if (visErrors.length) { why = ' because a layer stopped with an error'; ask = `The Lab frame is ${tone}: ${q(visErrors[0].message, 100)}. Fix it.`; } else if (R.moved?.length) { why = ' from where you moved the view (looking around): the scene\'s own camera may show it'; fix = { kind: 'view', views: R.moved, label: 'Back to the scene\'s camera' }; } else if (off) { why = ` because what ${layerSays(off[0])} draws is outside the camera's view`; fix = { kind: 'frame', layer: byName(off[0])?.id, layerName: off[0], frame: off[1].frame, label: 'Point the camera at it' }; } else if (dark) { why = ` because ${layerSays(dark[0])} uses materials that need light and has no lights`; ask = `Layer ${layerSays(dark[0])} uses lit materials but has no lights, so it renders black. Add lights (key + fill).`; } else if (!Object.keys(probe).length && !(R.perf?.fps > 0)) { why = ': nothing draws a frame'; }
      out.push({ id: 'blank', kind: 'blank', text: `The frame is ${tone}${why}.`, fix, ask });
    }

    // 3. NaN / undefined values
    for (const L of layers) {
      if (L.visible === false) continue;
      const P = probe[L.name];
      const badSl = (L.sliders || []).filter((s) => typeof s.value === 'number' ? !Number.isFinite(s.value) : s.value === undefined);
      if (!badSl.length && !(P?.nan?.length)) continue;
      const fix = badSl.length ? { kind: 'slider', layer: L.id, set: Object.fromEntries(badSl.map((s) => [s.key, fin(s.min) && fin(s.max) ? r3((s.min + s.max) / 2) : 0])), label: badSl.length === 1 ? `Reset "${badSl[0].label || badSl[0].key}"` : 'Reset those sliders' } : null;
      const what = badSl.length ? `the slider${badSl.length === 1 ? '' : 's'} ${badSl.map((s) => `"${s.label || s.key}"`).join(', ')} ${badSl.length === 1 ? 'has' : 'have'} no number` : `${P.nan.slice(0, 2).map((t) => `"${t}"`).join(', ')} got a NaN (not-a-number) position or size`;
      out.push({ id: `nan:${L.id}`, kind: 'nan', layer: L.id, layerName: L.name, text: `In ${layerSays(L.name)}, ${what}, so it can vanish or freeze.`, fix,
        ask: `Layer ${layerSays(L.name)}: ${badSl.length ? `slider ${badSl.map((s) => s.key).join(', ')} is NaN/undefined` : `${P.nan.slice(0, 2).join(', ')} get NaN values`} (often a divide by zero or an undefined value). Fix it.` });
    }
    if (!out.some((f) => f.kind === 'nan') && (R.console || []).some((t) => /\bNaN\b/.test(t))) {
      const line = (R.console || []).find((t) => /\bNaN\b/.test(t));
      out.push({ id: 'nan:console', kind: 'nan', text: `The console reports NaN values: ${q(line, 80)}.`, fix: null, ask: `The Lab console says "${q(line, 110)}". Find the NaN and fix it.` });
    }

    // 4. the subject off-screen, tiny, or the camera inside it
    for (const [n, P] of Object.entries(probe)) {
      const L = byName(n);
      if (!L || L.visible === false || !P.subject) continue;
      if (blank && out.some((f) => f.kind === 'blank' && f.fix?.kind === 'frame' && f.fix.layer === L.id)) continue;
      const frame = P.frame && !P.ortho && !P.rig ? { kind: 'frame', layer: L.id, layerName: n, frame: P.frame } : null;
      if (P.inside) {
        out.push({ id: `inside:${L.id}`, kind: 'inside', layer: L.id, layerName: n, text: `The camera of ${layerSays(n)} is inside "${q(P.inside, 30)}", so you see it from within.`, fix: frame && { ...frame, label: 'Step the camera out' }, ask: `Layer ${layerSays(n)}: the camera sits inside "${q(P.inside, 40)}". Move the camera out so the whole object shows.` });
      } else if (P.subject.offscreen) {
        out.push({ id: `offscreen:${L.id}`, kind: 'offscreen', layer: L.id, layerName: n, text: `What ${layerSays(n)} draws is ${P.subject.behind ? 'behind the camera' : 'outside the frame'}.`, fix: frame && { ...frame, label: 'Point the camera at it' }, ask: `Layer ${layerSays(n)}: its objects are ${P.subject.behind ? 'behind the camera' : 'off-screen'}. Point the camera at them.` });
      } else if (P.subject.share < 0.002 && P.meshes + (P.points ? 1 : 0) > 0) {
        out.push({ id: `tiny:${L.id}`, kind: 'tiny', layer: L.id, layerName: n, text: `What ${layerSays(n)} draws is tiny: about ${Math.max(0.1, Math.round(P.subject.share * 1000) / 10)} % of the frame.`, fix: frame && { ...frame, label: 'Frame it' }, ask: `Layer ${layerSays(n)}: the subject fills under 1 % of the frame. Bring the camera closer so it fills the frame.` });
      }
    }
    if (pic && !blank && !Object.values(probe).some((P) => P.subject) && R.subject && R.subject.fill < 0.002 && (R.subject.x1 - R.subject.x0) * (R.subject.y1 - R.subject.y0) < 0.01) {
      out.push({ id: 'tiny:picture', kind: 'tiny', text: 'The subject is tiny: it fills under 1 % of the frame.', fix: null, ask: 'The subject fills under 1 % of the Lab frame. Make it bigger or bring it closer.' });
    }

    // 5. a missing texture / file
    const missing = [];
    for (const [n, P] of Object.entries(probe)) for (const m of P.missing || []) if (byName(n)?.visible !== false) missing.push({ layer: n, file: m });
    for (const t of R.console || []) if (MISSING_RE.test(t)) { const f = (t.match(FILE_RE) || [])[1]; missing.push({ layer: null, file: f ? f.trim() : q(t, 50) }); }
    if (missing.length) {
      const files = [...new Set(missing.map((m) => m.file))].slice(0, 3);
      const L = missing.find((m) => m.layer)?.layer;
      out.push({ id: 'missing', kind: 'missing', layerName: L || null, text: `A file didn't load${L && layers.length > 1 ? ` in ${layerSays(L)}` : ''}: ${files.map((f) => `"${q(f, 40)}"`).join(', ')}.`, fix: null,
        ask: `${L ? `Layer ${layerSays(L)}: ` : ''}${files.map((f) => `"${q(f, 60)}"`).join(', ')} ${files.length === 1 ? 'doesn\'t' : 'don\'t'} load (missing file). Use a file from the References or a fallback.` });
    }

    // 6. too dark / blown out (a black or white frame is "nothing shows" above)
    if (pic && !blank) {
      if (pic.p95 < 0.3 && pic.mean < 0.12) out.push({ id: 'dark', kind: 'dark', text: `Everything is too dark: the brightest parts reach only ${Math.round(pic.p95 * 100)} %.`, fix: { kind: 'light', only: ['dark', 'blacks'], label: 'Brighten it' }, ask: 'The Lab scene is too dark overall. Brighten it (lights / exposure), keep the mood.' });
      else if (pic.white > 0.35 || (pic.mean > 0.82 && pic.p05 > 0.55)) out.push({ id: 'bright', kind: 'bright', text: `It's blown out: ${Math.round(pic.white * 100)} % of the picture is pure white.`, fix: { kind: 'light', only: ['bright', 'whites'], label: 'Tone it down' }, ask: 'The Lab scene is blown out (large pure-white areas). Bring the highlights down.' });
    }

    // 7. very slow frames
    const pf = R.perf;
    if (pf && !pf.parked && fin(pf.fps) && pf.fps > 0 && pf.fps < 20) {
      let meshes = 0; let points = 0; let instances = 0; let pr = 1; let heavy = null;
      for (const [n, P] of Object.entries(probe)) {
        if (byName(n)?.visible === false) continue;
        meshes += P.meshes || 0; points += P.points || 0; instances += P.instances || 0; pr = Math.max(pr, P.pr || 1);
        const w = (P.meshes || 0) * 40 + (P.points || 0) / 50 + (P.instances || 0);
        if (!heavy || w > heavy.w) heavy = { n, w, P };
      }
      const cause = meshes > 2500 ? `${meshes.toLocaleString('en-US')} separate objects` : points > 400000 ? `${points.toLocaleString('en-US')} particles` : instances > 200000 ? `${instances.toLocaleString('en-US')} copies` : pr > 1.6 ? `a pixel ratio of ${pr}` : '';
      const hl = heavy ? byName(heavy.n) : null;
      const countSl = (hl ? [hl] : shownLayers).flatMap((L) => (L.sliders || []).filter((s) => fin(s.value) && s.value > 1 && COUNT_RE.test(`${s.key} ${s.label || ''}`)).map((s) => ({ L, s })))[0];
      let fix = null;
      if (pf.adapt === false) fix = { kind: 'adapt', label: 'Let the preview lighten itself' };
      else if (countSl && (points > 100000 || meshes > 1000 || instances > 50000 || !cause)) fix = { kind: 'slider', layer: countSl.L.id, set: { [countSl.s.key]: Math.max(fin(countSl.s.min) ? countSl.s.min : 1, Math.round(countSl.s.value / 2)) }, label: `Halve "${countSl.s.label || countSl.s.key}"` };
      else if (!pf.light) fix = { kind: 'lightmode', label: 'Use 🪶 Light mode' };
      const ask = meshes > 2500 ? `Layer ${layerSays(heavy?.n || '?')} draws ${meshes} separate meshes: merge them into InstancedMesh / one geometry so it runs at 60 fps.` : points > 400000 ? `Layer ${layerSays(heavy?.n || '?')} draws ${points} particles: lower the count or move them to the GPU so it runs at 60 fps.` : pr > 1.6 ? `Layer ${layerSays(heavy?.n || '?')} renders at pixel ratio ${pr}: cap it at Math.min(devicePixelRatio, 1.5).` : `The Lab scene runs at ${Math.round(pf.fps)} fps. Find what is slow and make it lighter.`;
      out.push({ id: 'slow', kind: 'slow', layer: hl?.id || null, layerName: hl?.name || null, text: `It's slow: ${Math.round(pf.fps)} frames a second${cause ? `, with ${cause}` : ''}.`, fix, ask });
    }

    // 8. reacts to music, but no music plays
    if (!R.sound) {
      const deaf = shownLayers.filter((L) => AUDIO_RE.test(L.code || '') || (L.sliders || []).some((s) => s.followsMusic));
      if (deaf.length) {
        const names = deaf.map((L) => layerSays(L.name)).slice(0, 2).join(' and ');
        out.push({ id: 'noaudio', kind: 'noaudio', layer: deaf[0].id, layerName: deaf[0].name, text: `${layers.length > 1 ? names : 'The scene'} ${deaf.length > 1 && layers.length > 1 ? 'react' : 'reacts'} to music, but no song or live sound plays, so ${deaf.length > 1 ? 'they barely move' : 'it barely moves'}.`,
          fix: { kind: 'live', label: 'Listen to the computer\'s sound' }, ask: `${names} react${deaf.length > 1 ? '' : 's'} to audio but nothing plays. Give it a calm motion of its own when there is no sound.` });
      }
    }
    return out;
  }
  // the short request for the director, with the scene's name (kept short on purpose: it is the message's whole text)
  const askText = (f, sketch = '') => `${sketch ? `In "${q(sketch, 40)}": ` : ''}${f.ask}`;
  const tokens = (t) => Math.ceil(String(t || '').length / 3.6);
  // is the frame blank? (the calm hint's quick test on a tiny shot)
  const isBlank = (px, w, h) => { const p = picture(px, w, h); return Boolean(p && p.std < 0.012); };
  return { picture, subject, probe, probeSource, diagnose, askText, tokens, isBlank, AUDIO_RE, COUNT_RE };
})();
if (typeof module !== 'undefined') module.exports = DoctorCore;
