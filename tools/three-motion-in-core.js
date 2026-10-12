// Camera and body tracking as a Lab input (round 25, "motion"): the math, shared by three places.
//   · the Lab preview's tracking Worker (the hub sends String(hearthMotionCore) once; the preview builds a Worker from
//     it, like the audio core: tools/three-sandbox.html "camera input"); `core.worker(self)` installs its loop there
//   · the hub (MotionInCore: names, labels, presets' feature names)
//   · Node (dev/motion-in-test.js: the light tracker on generated frames, MediaPipe results through a stub)
// Two trackers, both on this computer, off the main thread:
//   light      frame difference on a small grey picture: motion energy (overall, 5 regions, a 3 × 3 grid), where it
//              moves (a weighted centroid) and which way (a global Lucas–Kanade flow, "optical-flow-lite"), a colour
//              blob (a hue you pick), the brightness, and a motion mask (silhouette-ish) that fades: always on, cheap
//   mediapipe  MediaPipe Tasks (hand / pose / face landmarkers, the selfie segmenter) from files the hub downloaded
//              once into the data folder (the owner says yes first). Each task loads the first time a sketch or a
//              slider reads one of its features, never before.
// Features are 0..1 (x: left → right as seen on screen, mirrored or not; y: bottom → top; turns: 0.5 = straight).
// Nothing is kept: a frame is read, turned into numbers and dropped.
function hearthMotionCore() {
  const GROUPS = [
    ['Camera movement', [['camMotion', 'Movement (anywhere)'], ['camLeft', 'Movement on the left'], ['camRight', 'Movement on the right'], ['camTop', 'Movement at the top'], ['camBottom', 'Movement at the bottom'], ['camCenter', 'Movement in the middle'], ['camX', 'Where it moves (left → right)'], ['camY', 'Where it moves (low → high)'], ['camFlowX', 'Moving left / right (0.5 still)'], ['camFlowY', 'Moving down / up (0.5 still)'], ['camBlob', 'Colour blob (size)'], ['camBlobX', 'Colour blob left → right'], ['camBlobY', 'Colour blob low → high'], ['camBright', 'Camera brightness']]],
    ['Hands', [['handX', 'Hand left → right'], ['handY', 'Hand low → high'], ['handOpen', 'Hand open (fist → open)'], ['pinch', 'Pinch (thumb + index)'], ['hands', 'Hands seen (0, ½, 1)'], ['hand2X', 'Second hand left → right'], ['hand2Y', 'Second hand low → high'], ['handSpread', 'Hands apart'], ['handSpeed', 'Hand speed']]],
    ['Body', [['headX', 'Head left → right'], ['headY', 'Head low → high'], ['headTurn', 'Head turn (0.5 straight)'], ['headTilt', 'Head tilt (0.5 straight)'], ['wristLX', 'Left wrist left → right'], ['wristLY', 'Left wrist low → high'], ['wristRX', 'Right wrist left → right'], ['wristRY', 'Right wrist low → high'], ['bodyX', 'Body left → right'], ['bodyY', 'Body low → high'], ['bodySize', 'Body size (close to the camera)'], ['armsUp', 'Arms up'], ['person', 'Someone there']]],
    ['Face', [['mouthOpen', 'Mouth open'], ['smile', 'Smile'], ['blink', 'Blink'], ['browUp', 'Eyebrows up'], ['faceX', 'Face left → right'], ['faceY', 'Face low → high']]],
    ['Mask', [['maskArea', 'Person (silhouette) size']]],
  ];
  const GRID = Array.from({ length: 9 }, (_, i) => `camZ${i}`); // 3 × 3 motion grid, row by row from the top left
  const NAMES = [...GROUPS.flatMap((g) => g[1].map((x) => x[0])), ...GRID, 'tracked'];
  const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));
  const F = NAMES.length;
  const LABEL = Object.fromEntries(GROUPS.flatMap((g) => g[1]));
  // which tracking task a feature needs (light: always there)
  const TASK = {};
  for (const n of ['handX', 'handY', 'handOpen', 'pinch', 'hands', 'hand2X', 'hand2Y', 'handSpread', 'handSpeed']) TASK[n] = 'hands';
  for (const n of ['headX', 'headY', 'headTurn', 'headTilt', 'wristLX', 'wristLY', 'wristRX', 'wristRY', 'bodyX', 'bodyY', 'bodySize', 'armsUp', 'person']) TASK[n] = 'pose';
  for (const n of ['mouthOpen', 'smile', 'blink', 'browUp', 'faceX', 'faceY']) TASK[n] = 'face';
  TASK.maskArea = 'mask';
  const MID = new Set(['headTurn', 'headTilt', 'camFlowX', 'camFlowY']); // 0.5 = still / straight
  const POS = new Set(NAMES.filter((n) => /X$|Y$/.test(n) && !/^camFlow/.test(n)));
  const C = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const def = (n) => (MID.has(n) || POS.has(n) ? 0.5 : 0);

  // ---------- the light tracker: frame difference on a small grey picture ----------
  // frame(rgba, w, h, dt, o) → raw values in picture coordinates (x right, y down) + a motion mask (Uint8, w × h)
  function light() {
    let prev = null; let mask = null; let W = 0; let H = 0; let noise = 8;
    let cx = 0.5; let cy = 0.5; let bx = 0.5; let by = 0.5;
    return {
      frame(rgba, w, h, dt = 1 / 30, o = {}) {
        const n = w * h;
        if (w !== W || h !== H || !prev) { W = w; H = h; prev = new Float32Array(n); mask = new Uint8Array(n); for (let i = 0; i < n; i += 1) prev[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; return { first: true, mask }; }
        const fade = Math.exp(-dt / Math.max(0.02, o.trail ?? 0.35));
        let moving = 0; let sx = 0; let sy = 0; let sw = 0; let lum = 0; let dsum = 0;
        let a11 = 0; let a12 = 0; let a22 = 0; let b1 = 0; let b2 = 0;
        const reg = [0, 0, 0, 0, 0]; const grid = new Float32Array(9);
        const thr = Math.max(10, noise * 2.5);
        const hue = o.blobHue; const tol = o.blobTol ?? 22; let bn = 0; let bxs = 0; let bys = 0;
        const cur = new Float32Array(n);
        for (let i = 0; i < n; i += 1) { const r = rgba[i * 4]; const g = rgba[i * 4 + 1]; const b = rgba[i * 4 + 2]; cur[i] = 0.299 * r + 0.587 * g + 0.114 * b; }
        for (let y = 1; y < h - 1; y += 1) {
          for (let x = 1; x < w - 1; x += 1) {
            const i = y * w + x;
            const Y = cur[i]; lum += Y;
            const d = Y - prev[i]; const ad = d < 0 ? -d : d; dsum += ad;
            const on = ad > thr;
            const m = on ? 255 : mask[i] * fade;
            mask[i] = m;
            if (on) {
              moving += 1; const wgt = ad - thr; sx += x * wgt; sy += y * wgt; sw += wgt;
              const fx = x / w; const fy = y / h;
              if (fx < 0.5) reg[0] += 1; else reg[1] += 1;
              if (fy < 0.5) reg[2] += 1; else reg[3] += 1;
              if (fx > 0.25 && fx < 0.75 && fy > 0.25 && fy < 0.75) reg[4] += 1;
              grid[Math.min(2, Math.floor(fy * 3)) * 3 + Math.min(2, Math.floor(fx * 3))] += 1;
              // optical-flow-lite: one Lucas–Kanade vector for everything that moves (Ix u + Iy v + It = 0)
              const ix = (cur[i + 1] - cur[i - 1]) / 2; const iy = (cur[i + w] - cur[i - w]) / 2;
              a11 += ix * ix; a12 += ix * iy; a22 += iy * iy; b1 -= ix * d; b2 -= iy * d;
            }
            if (hue != null) {
              const r = rgba[i * 4] / 255; const g = rgba[i * 4 + 1] / 255; const b = rgba[i * 4 + 2] / 255;
              const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const s = mx ? (mx - mn) / mx : 0;
              if (s > 0.4 && mx > 0.25) {
                let hh = mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
                hh = (hh * 60 + 360) % 360;
                let dh = Math.abs(hh - hue); if (dh > 180) dh = 360 - dh;
                if (dh < tol) { bn += 1; bxs += x; bys += y; }
              }
            }
          }
        }
        prev = cur;
        const inner = Math.max(1, (w - 2) * (h - 2));
        // the camera's own noise, learnt while little moves (a dark room's grain isn't movement)
        const meanD = dsum / inner;
        if (moving / inner < 0.02) noise += (meanD - noise) * Math.min(1, dt * 2);
        const frac = moving / inner;
        // an eighth of the picture moving = 1, on a square-root curve (a hand waving far away still reads)
        const E = (part, of) => C(Math.sqrt((part / Math.max(1, of)) * 8));
        if (sw > 0) { const tx = sx / sw / w; const ty = sy / sw / h; const kk = 1 - Math.exp(-dt / 0.08); cx += (tx - cx) * kk; cy += (ty - cy) * kk; }
        if (bn > 3) { bx = bxs / bn / w; by = bys / bn / h; }
        const det = a11 * a22 - a12 * a12;
        let u = 0; let v = 0;
        if (moving > 6 && det > 1e-3) { u = (a22 * b1 - a12 * b2) / det; v = (a11 * b2 - a12 * b1) / det; }
        // (pixels a frame on the small picture → 0..1, 0.5 = still; a bit of movement in a few pixels counts less)
        const sp = (z) => 0.5 + 0.5 * Math.tanh(((z * 96) / w) * 1.5 * Math.min(1, frac * 12));
        return {
          mask,
          camMotion: E(moving, inner), camLeft: E(reg[0], inner / 2), camRight: E(reg[1], inner / 2), camTop: E(reg[2], inner / 2), camBottom: E(reg[3], inner / 2), camCenter: E(reg[4], inner / 4),
          camX: cx, camY: cy, camFlowX: sp(u), camFlowY: sp(v), camBright: C(lum / inner / 255),
          camBlob: hue != null ? C((bn / inner) * 10) : 0, camBlobX: bx, camBlobY: by,
          grid: Array.from(grid, (n) => E(n, inner / 9)),
        };
      },
    };
  }

  // ---------- MediaPipe results → raw values (picture coordinates) ----------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const avg = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  // one hand's 21 landmarks: palm centre, how open, pinch
  function hand(L) {
    const palm = avg([L[0], L[5], L[9], L[13], L[17]]);
    const size = Math.max(1e-4, dist(L[0], L[9]));
    let open = 0; for (const [tip, mcp] of [[8, 5], [12, 9], [16, 13], [20, 17]]) open += dist(L[tip], L[0]) / Math.max(1e-4, dist(L[mcp], L[0]));
    open /= 4; // a fist ≈ 1.0, an open hand ≈ 1.9
    return { x: palm.x, y: palm.y, open: C((open - 1.15) / 0.65), pinch: C(1 - (dist(L[4], L[8]) / size - 0.18) / 0.4), size };
  }
  // { landmarks: [[{x, y, z}×21]…] } (HandLandmarker); the hand furthest right on screen is hand 1
  function fromHands(res, mirror) {
    const hs = (res?.landmarks || []).filter((l) => l?.length >= 21).map(hand);
    const sx = (h) => (mirror ? 1 - h.x : h.x);
    hs.sort((a, b) => sx(b) - sx(a));
    const out = { hands: hs.length >= 2 ? 1 : hs.length ? 0.5 : 0 };
    if (hs[0]) Object.assign(out, { handX: hs[0].x, handY: hs[0].y, handOpen: hs[0].open, pinch: hs[0].pinch });
    if (hs[1]) Object.assign(out, { hand2X: hs[1].x, hand2Y: hs[1].y, handSpread: C(dist(hs[0], hs[1]) * 1.2) });
    else out.handSpread = 0;
    out.pts = hs;
    return out;
  }
  // { landmarks: [[33 × {x, y, z, visibility}]] } (PoseLandmarker)
  function fromPose(res) {
    const L = res?.landmarks?.[0];
    if (!L || L.length < 25) return { person: 0 };
    const vis = (p) => (p.visibility == null ? 1 : p.visibility) > 0.5;
    const sh = avg([L[11], L[12]]); const hp = avg([L[23], L[24]]);
    const sw = Math.max(1e-4, dist(L[11], L[12]));
    const out = { person: 1, headX: L[0].x, headY: L[0].y, bodyX: (sh.x + hp.x) / 2, bodyY: (sh.y + hp.y) / 2, bodySize: C(sw * 2.4) };
    // turn: the nose against the middle of the shoulders, in shoulder widths; tilt: the ears' heights
    out.turn = (L[0].x - sh.x) / sw;
    out.tilt = (L[7].y - L[8].y) / Math.max(1e-4, dist(L[7], L[8]));
    // picture-left / picture-right wrists (the person's right wrist is on the picture's left when not mirrored)
    const [a, b] = L[15].x < L[16].x ? [L[15], L[16]] : [L[16], L[15]];
    if (vis(a)) Object.assign(out, { wristPLX: a.x, wristPLY: a.y });
    if (vis(b)) Object.assign(out, { wristPRX: b.x, wristPRY: b.y });
    out.armsUp = vis(L[15]) && vis(L[16]) ? C(((sh.y - L[15].y) + (sh.y - L[16].y)) / 2 / sw + 0.5) : 0;
    return out;
  }
  // { faceLandmarks: [[478 × {x, y}]], faceBlendshapes: [{ categories: [{ categoryName, score }] }] } (FaceLandmarker)
  function fromFace(res) {
    const L = res?.faceLandmarks?.[0];
    if (!L) return {};
    const out = { faceX: L[1]?.x ?? 0.5, faceY: L[1]?.y ?? 0.5 };
    const B = {}; for (const c of res.faceBlendshapes?.[0]?.categories || []) B[c.categoryName] = c.score;
    if (Object.keys(B).length) {
      out.mouthOpen = C((B.jawOpen || 0) * 1.6);
      out.smile = C(((B.mouthSmileLeft || 0) + (B.mouthSmileRight || 0)) / 2 * 1.3);
      out.blink = C((((B.eyeBlinkLeft || 0) + (B.eyeBlinkRight || 0)) / 2 - 0.25) / 0.5);
      out.browUp = C((B.browInnerUp || 0) * 1.4);
    } else if (L.length > 300) { // no blendshapes: the lips' gap against the face's height
      out.mouthOpen = C((dist(L[13], L[14]) / Math.max(1e-4, dist(L[10], L[152])) - 0.02) * 8);
    }
    // a head turn from the face when no body is tracked (the nose between the cheeks)
    if (L.length > 454) out.faceTurn = ((L[1].x - L[234].x) / Math.max(1e-4, L[454].x - L[234].x) - 0.5) * 2;
    return out;
  }
  // { confidenceMasks: [MPMask] } (ImageSegmenter): the person's mask as bytes, w × h
  function fromMask(res) {
    const m = res?.confidenceMasks?.[0];
    if (!m) return null;
    const f = m.getAsFloat32Array ? m.getAsFloat32Array() : m.data;
    const w = m.width; const h = m.height; const out = new Uint8Array(w * h); let s = 0;
    for (let i = 0; i < f.length; i += 1) { const v = f[i]; out[i] = v * 255; s += v; }
    return { w, h, data: out, area: C(s / Math.max(1, f.length) * 2) };
  }

  // ---------- raw values (picture coordinates) → the features (screen: mirrored, y up), smoothed ----------
  function finisher() {
    const out = new Float32Array(F);
    for (let i = 0; i < F; i += 1) out[i] = def(NAMES[i]);
    const seen = {}; let hPrev = null;
    const set = (n, v, k) => { const i = IDX[n]; if (i == null || v == null || !Number.isFinite(v)) return; out[i] += (C(v) - out[i]) * k; };
    return {
      out,
      // r: merged raw values; dt: seconds since the last frame; mirror: the picture is shown mirrored
      apply(r, dt, mirror) {
        const kp = 1 - Math.exp(-dt / 0.06); const ke = 1 - Math.exp(-dt / 0.03);
        const X = (x) => (x == null ? null : mirror ? 1 - x : x); const Y = (y) => (y == null ? null : 1 - y);
        for (const n of ['camMotion', 'camLeft', 'camRight', 'camTop', 'camBottom', 'camCenter', 'camBright', 'camBlob', 'maskArea', 'mouthOpen', 'smile', 'blink', 'browUp', 'handOpen', 'pinch', 'hands', 'handSpread', 'bodySize', 'armsUp', 'person']) set(n, r[n], /^cam/.test(n) ? 1 : ke);
        if (mirror && r.camLeft != null) { const l = out[IDX.camLeft]; out[IDX.camLeft] = out[IDX.camRight]; out[IDX.camRight] = l; }
        if (r.grid) for (let i = 0; i < 9; i += 1) { const row = Math.floor(i / 3); const col = i % 3; out[IDX[`camZ${row * 3 + (mirror ? 2 - col : col)}`]] = r.grid[i]; }
        for (const [n, x, y] of [['cam', r.camX, r.camY], ['camBlob', r.camBlobX, r.camBlobY], ['hand', r.handX, r.handY], ['hand2', r.hand2X, r.hand2Y], ['head', r.headX, r.headY], ['body', r.bodyX, r.bodyY], ['face', r.faceX, r.faceY]]) { set(`${n}X`, X(x), kp); set(`${n}Y`, Y(y), kp); }
        if (r.camFlowX != null) { set('camFlowX', mirror ? 1 - r.camFlowX : r.camFlowX, kp); set('camFlowY', 1 - r.camFlowY, kp); }
        // the screen's left / right wrists
        const lx = mirror ? r.wristPRX : r.wristPLX; const ly = mirror ? r.wristPRY : r.wristPLY; const rx = mirror ? r.wristPLX : r.wristPRX; const ry = mirror ? r.wristPLY : r.wristPRY;
        set('wristLX', X(lx), kp); set('wristLY', Y(ly), kp); set('wristRX', X(rx), kp); set('wristRY', Y(ry), kp);
        const turn = r.turn ?? r.faceTurn;
        if (turn != null) set('headTurn', 0.5 + (mirror ? -1 : 1) * turn * 0.6, kp);
        if (r.tilt != null) set('headTilt', 0.5 + (mirror ? -1 : 1) * r.tilt * 0.8, kp);
        // hand speed: how far hand 1 went this frame (screen widths a second)
        if (r.handX != null) { const p = { x: r.handX, y: r.handY }; set('handSpeed', hPrev ? Math.min(1, dist(p, hPrev) / Math.max(dt, 1e-3) / 2) : 0, ke); hPrev = p; } else { hPrev = null; set('handSpeed', 0, ke); }
        if (r.tracked != null) out[IDX.tracked] = r.tracked;
        for (const k of Object.keys(r)) seen[k] = true;
        return out;
      },
      seen,
    };
  }
  // the light tracker standing in for hands / body when MediaPipe isn't there: hand = where it moves, body = the mask
  function lightStandIn(r) {
    const moving = r.camMotion > 0.02;
    return { handX: moving ? r.camX : null, handY: moving ? r.camY : null, hands: moving ? 0.5 : 0, bodyX: r.camX, bodyY: r.camY, person: C(r.camMotion * 8), maskArea: r.camMotion };
  }

  // ---------- the Worker (in the Lab preview) ----------
  // in:  { t: 'frame', bmp (ImageBitmap, small), at (ms), mirror, want: { hands, pose, face, mask }, hue, trail, engine: 'auto' | 'light' }
  //      { t: 'mp', files: { bundle, loader, wasm, hands, pose, face, mask } (ArrayBuffers) }   MediaPipe's files, once
  //      { t: 'mp-stub', src }  a fake bundle (the checks): same path, a stub instead of MediaPipe
  // out: { t: 'feat', b (Float32Array's buffer), mask?: { w, h, b }, pts?: [x, y…] (hands, screen), ms, engine, tasks }
  //      { t: 'state', mp: 'loading' | 'ready' | 'error', tasks, error }
  function worker(self) {
    const fin = finisher(); const lt = light();
    let cv = null; let g = null; let last = 0;
    const mp = { V: null, fileset: null, files: null, tasks: {}, loading: {}, error: null, urls: [] };
    const blobUrl = (buf, type = 'text/javascript') => { const u = URL.createObjectURL(new Blob([buf], { type })); mp.urls.push(u); return u; };
    const say = (m) => self.postMessage({ t: 'state', mp: mp.error ? 'error' : mp.V ? 'ready' : mp.files ? 'loading' : 'none', tasks: Object.keys(mp.tasks), error: mp.error, ...m });
    function loadBundle() {
      if (mp.V || !mp.files?.bundle) return mp.V;
      self.exports = {}; self.module = { exports: self.exports };
      importScripts(blobUrl(mp.files.bundle));
      mp.V = Object.keys(self.module.exports || {}).length ? self.module.exports : self.exports;
      mp.fileset = { wasmLoaderPath: mp.files.loader ? blobUrl(mp.files.loader) : '', wasmBinaryPath: mp.files.wasm ? blobUrl(mp.files.wasm, 'application/wasm') : '' };
      return mp.V;
    }
    async function task(kind) {
      if (mp.tasks[kind] || mp.loading[kind] || !mp.files?.[kind]) return;
      mp.loading[kind] = true;
      try {
        const V = loadBundle();
        const base = { baseOptions: { modelAssetBuffer: new Uint8Array(mp.files[kind]), delegate: 'CPU' }, runningMode: 'VIDEO' };
        const T = kind === 'hands' ? await V.HandLandmarker.createFromOptions(mp.fileset, { ...base, numHands: 2 })
          : kind === 'pose' ? await V.PoseLandmarker.createFromOptions(mp.fileset, { ...base, numPoses: 1 })
            : kind === 'face' ? await V.FaceLandmarker.createFromOptions(mp.fileset, { ...base, numFaces: 1, outputFaceBlendshapes: true })
              : await V.ImageSegmenter.createFromOptions(mp.fileset, { ...base, outputConfidenceMasks: true, outputCategoryMask: false });
        mp.tasks[kind] = T; say({});
      } catch (err) { mp.error = `${kind}: ${err?.message || err}`; say({}); } finally { mp.loading[kind] = false; }
    }
    function run(T, kind, bmp, ts) {
      try {
        if (kind === 'mask') { let r = null; T.segmentForVideo(bmp, ts, (x) => { r = fromMask(x); }); return r; }
        return T.detectForVideo(bmp, ts);
      } catch (err) { mp.error = `${kind}: ${err?.message || err}`; delete mp.tasks[kind]; say({}); return null; }
    }
    self.onmessage = async (e) => {
      const m = e.data || {};
      if (m.t === 'mp') { mp.files = m.files; mp.error = null; say({}); return; }
      if (m.t === 'mp-stub') { mp.files = { ...(mp.files || {}), bundle: m.src, hands: new ArrayBuffer(1), pose: new ArrayBuffer(1), face: new ArrayBuffer(1), mask: new ArrayBuffer(1) }; mp.V = null; mp.tasks = {}; mp.error = null; say({}); return; }
      if (m.t !== 'frame' || !m.bmp) return;
      const t0 = performance.now();
      const bmp = m.bmp; const w = bmp.width; const h = bmp.height;
      const dt = last ? Math.min(0.25, Math.max(0.005, (m.at - last) / 1000)) : 1 / 30; last = m.at;
      // the light tracker on a small copy (≤ 96 px wide)
      const lw = Math.min(96, w); const lh = Math.max(2, Math.round((h * lw) / w));
      if (!cv || cv.width !== lw || cv.height !== lh) { cv = new OffscreenCanvas(lw, lh); g = cv.getContext('2d', { willReadFrequently: true }); }
      g.drawImage(bmp, 0, 0, lw, lh);
      const r = lt.frame(g.getImageData(0, 0, lw, lh).data, lw, lh, dt, { blobHue: m.hue, trail: m.trail });
      const raw = { ...r, tracked: 0 };
      let mask = null; let pts = null;
      const useMp = m.engine !== 'light' && mp.files;
      if (useMp) for (const k of ['hands', 'pose', 'face', 'mask']) if (m.want?.[k] && !mp.tasks[k]) task(k);
      const ts = Math.max(1, Math.round(m.at));
      if (useMp && Object.keys(mp.tasks).length) {
        raw.tracked = 1;
        if (mp.tasks.hands && m.want?.hands) { const x = fromHands(run(mp.tasks.hands, 'hands', bmp, ts), m.mirror); pts = x.pts.flatMap((p) => [m.mirror ? 1 - p.x : p.x, 1 - p.y]); delete x.pts; Object.assign(raw, x); }
        if (mp.tasks.pose && m.want?.pose) Object.assign(raw, fromPose(run(mp.tasks.pose, 'pose', bmp, ts)));
        if (mp.tasks.face && m.want?.face) Object.assign(raw, fromFace(run(mp.tasks.face, 'face', bmp, ts)));
        if (mp.tasks.mask && m.want?.mask) { const x = run(mp.tasks.mask, 'mask', bmp, ts); if (x) { mask = { w: x.w, h: x.h, b: x.data.buffer }; raw.maskArea = x.area; } }
      }
      // what MediaPipe doesn't track (not loaded, not wanted): the light tracker's stand-ins
      const si = lightStandIn(r);
      if (!mp.tasks.hands) Object.assign(raw, { handX: si.handX, handY: si.handY, hands: si.hands });
      if (!mp.tasks.pose) Object.assign(raw, { bodyX: si.bodyX, bodyY: si.bodyY, person: si.person });
      if (!mask && !r.first) { mask = { w: lw, h: lh, b: r.mask.slice().buffer, motion: true }; if (raw.maskArea == null) raw.maskArea = si.maskArea; }
      delete raw.mask; delete raw.first;
      bmp.close?.();
      const out = fin.apply(raw, dt, Boolean(m.mirror)).slice();
      self.postMessage({ t: 'feat', b: out.buffer, mask, pts, ms: performance.now() - t0, engine: raw.tracked ? 'mediapipe' : 'light', tasks: Object.keys(mp.tasks) }, [out.buffer, ...(mask ? [mask.b] : [])]);
    };
    say({ hello: true });
  }

  return { GROUPS, NAMES, IDX, F, LABEL, TASK, GRID, def, light, hand, fromHands, fromPose, fromFace, fromMask, finisher, lightStandIn, worker };
}
const MotionInCore = hearthMotionCore();
if (typeof module !== 'undefined' && module.exports) module.exports = { hearthMotionCore, MotionInCore };
