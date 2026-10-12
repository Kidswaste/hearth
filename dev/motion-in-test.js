// Camera / body tracking math (round 25, motion: tools/three-motion-in-core.js), no Electron:
//   · the light tracker on generated frames (a bright square moving on a noisy dark picture): motion energy, the
//     regions, where it moves, which way (flow), the colour blob, the camera's noise not counted as movement
//   · MediaPipe results (hands, pose, face blendshapes, a segmenter mask) through the converters, mirrored or not
//   · motionmain.js: the files' status, the download (a local HTTP server standing in for the CDN), a cancelled one
//   node dev/motion-in-test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { MotionInCore: C } = require(path.join(__dirname, '..', 'tools', 'three-motion-in-core.js'));
let fails = 0;
const check = (ok, what, detail) => { console.log(`${ok ? '✓' : '✗'} ${what}${detail !== undefined ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); if (!ok) fails += 1; };
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- a generated video: a square moving across a noisy dark picture ----------
const W = 96; const H = 72;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function frame(sqX, sqY, { size = 14, color = [240, 240, 240], noise = 6 } = {}) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4; const inSq = Math.abs(x - sqX) < size / 2 && Math.abs(y - sqY) < size / 2;
    const n = (rnd() - 0.5) * noise * 2;
    px[i] = inSq ? color[0] : 20 + n; px[i + 1] = inSq ? color[1] : 20 + n; px[i + 2] = inSq ? color[2] : 24 + n; px[i + 3] = 255;
  }
  return px;
}
{
  const lt = C.light(); const fin = C.finisher();
  const feat = (r, mirror = false) => { const out = fin.apply(r, 1 / 30, mirror); return Object.fromEntries(C.NAMES.map((n, i) => [n, out[i]])); };
  // still noise: nothing moves
  lt.frame(frame(-99, -99), W, H);
  let f = null;
  for (let k = 0; k < 20; k += 1) f = feat(lt.frame(frame(-99, -99), W, H, 1 / 30));
  check(f.camMotion < 0.02, 'camera noise alone is not movement', r2(f.camMotion));
  // the square moving right along the left side, low in the picture
  const xs = []; const flows = [];
  for (let k = 0; k < 24; k += 1) { const r = lt.frame(frame(10 + k * 1.2, 52), W, H, 1 / 30); f = feat(r); xs.push(f.camX); flows.push(f.camFlowX); }
  check(f.camMotion > 0.05, 'a moving square is movement', r2(f.camMotion));
  check(f.camLeft > f.camRight && f.camBottom > f.camTop, 'it moves on the left, at the bottom', { L: r2(f.camLeft), R: r2(f.camRight), T: r2(f.camTop), B: r2(f.camBottom) });
  check(f.camX < 0.5 && f.camY < 0.5, 'where it moves: left and low (y up)', { x: r2(f.camX), y: r2(f.camY) });
  check(xs[xs.length - 1] > xs[4] + 0.08, 'where it moves follows the square to the right', { from: r2(xs[4]), to: r2(xs[xs.length - 1]) });
  check(flows.slice(6).every((v) => v > 0.55), 'flow: moving right (> 0.5)', flows.slice(6, 10).map(r2));
  check(f.camZ6 > f.camZ2, 'the 3 × 3 grid: bottom-left more than top-right', { z6: r2(f.camZ6), z2: r2(f.camZ2) });
  // mirrored: the same movement reads as on the right, moving left
  const lt2 = C.light(); const fin2 = C.finisher(); let g = null;
  lt2.frame(frame(10, 52), W, H);
  for (let k = 1; k < 24; k += 1) { const out = fin2.apply(lt2.frame(frame(10 + k * 1.2, 52), W, H, 1 / 30), 1 / 30, true); g = Object.fromEntries(C.NAMES.map((n, i) => [n, out[i]])); }
  check(g.camX > 0.5 && g.camRight > g.camLeft && g.camFlowX < 0.45, 'mirrored: on the right, moving left', { x: r2(g.camX), flow: r2(g.camFlowX) });
  // going up: flow y > 0.5
  const lt3 = C.light(); const fin3 = C.finisher(); let u = null;
  lt3.frame(frame(48, 60), W, H);
  for (let k = 1; k < 20; k += 1) { const out = fin3.apply(lt3.frame(frame(48, 60 - k * 1.2), W, H, 1 / 30), 1 / 30, false); u = out[C.IDX.camFlowY]; }
  check(u > 0.55, 'flow: moving up (> 0.5)', r2(u));
  // the colour blob: a red square on the right, a white one on the left; hue 0 finds the red one
  const two = frame(20, 36);
  const red = frame(76, 36, { color: [230, 30, 30] });
  for (let i = 0; i < two.length; i += 4) { const x = (i / 4) % W; if (x > 60) { two[i] = red[i]; two[i + 1] = red[i + 1]; two[i + 2] = red[i + 2]; } }
  const lb = C.light(); lb.frame(two, W, H); const rb = lb.frame(two, W, H, 1 / 30, { blobHue: 0 });
  check(rb.camBlob > 0.1 && rb.camBlobX > 0.7, 'colour blob: the red square found on the right', { size: r2(rb.camBlob), x: r2(rb.camBlobX) });
  check(rb.mask && rb.mask.length === W * H, 'a motion mask the size of the picture');
  check(C.lightStandIn({ camMotion: 0.3, camX: 0.2, camY: 0.7 }).handX === 0.2, 'light mode: the hand stands in where it moves');
}

// ---------- MediaPipe results → features ----------
{
  // an open right hand around (0.3, 0.4) in the picture and a fist at (0.7, 0.6)
  const handAt = (cx, cy, open, pinch = false) => {
    const L = Array.from({ length: 21 }, () => ({ x: cx, y: cy + 0.06 }));
    const fing = [[5, 8], [9, 12], [13, 16], [17, 20]];
    fing.forEach(([mcp, tip], k) => {
      const dx = (k - 1.5) * 0.02;
      for (let j = mcp; j <= tip; j += 1) L[j] = { x: cx + dx, y: cy - (open ? 0.03 + (j - mcp) * 0.03 : 0.03 - (j - mcp) * 0.012) };
    });
    L[0] = { x: cx, y: cy + 0.06 };
    for (let j = 1; j <= 4; j += 1) L[j] = { x: cx - 0.03 - j * 0.01, y: cy + 0.02 - j * 0.01 };
    if (pinch) L[4] = { ...L[8] };
    return L;
  };
  const hs = C.fromHands({ landmarks: [handAt(0.3, 0.4, true), handAt(0.7, 0.6, false)] }, false);
  check(hs.hands === 1 && r2(hs.handX) > 0.6, 'two hands: hand 1 is the one furthest right', { n: hs.hands, x: r2(hs.handX) });
  check(hs.handOpen < 0.3, 'a fist reads closed', r2(hs.handOpen));
  const one = C.fromHands({ landmarks: [handAt(0.3, 0.4, true)] }, false);
  check(one.hands === 0.5 && one.handOpen > 0.6, 'an open hand reads open', r2(one.handOpen));
  const pin = C.fromHands({ landmarks: [handAt(0.5, 0.5, true, true)] }, false);
  check(pin.pinch > 0.9 && one.pinch < 0.5, 'a pinch (thumb on the index tip)', { pinch: r2(pin.pinch), open: r2(one.pinch) });
  const fin = C.finisher();
  let out = null; for (let k = 0; k < 30; k += 1) out = fin.apply({ ...one, tracked: 1 }, 1 / 30, true);
  check(Math.abs(out[C.IDX.handX] - 0.7) < 0.02 && Math.abs(out[C.IDX.handY] - 0.6) < 0.02, 'mirrored screen coordinates: x flipped, y up', { x: r2(out[C.IDX.handX]), y: r2(out[C.IDX.handY]) });
  check(out[C.IDX.tracked] === 1, 'tracked = 1 with MediaPipe');
  // a pose turned to the picture's right, arms up
  const P = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  P[11] = { x: 0.6, y: 0.5, visibility: 1 }; P[12] = { x: 0.4, y: 0.5, visibility: 1 }; P[23] = { x: 0.57, y: 0.85, visibility: 1 }; P[24] = { x: 0.43, y: 0.85, visibility: 1 };
  P[0] = { x: 0.56, y: 0.3, visibility: 1 }; P[7] = { x: 0.6, y: 0.3 }; P[8] = { x: 0.52, y: 0.3 };
  P[15] = { x: 0.7, y: 0.2, visibility: 1 }; P[16] = { x: 0.3, y: 0.2, visibility: 1 };
  const po = C.fromPose({ landmarks: [P] });
  check(po.person === 1 && po.turn > 0.2 && po.armsUp > 0.9, 'pose: someone there, head turned, arms up', { turn: r2(po.turn), up: r2(po.armsUp) });
  const fp = C.finisher(); let o2 = null; for (let k = 0; k < 30; k += 1) o2 = fp.apply(po, 1 / 30, false);
  check(o2[C.IDX.headTurn] > 0.6 && o2[C.IDX.wristLX] < 0.4 && o2[C.IDX.wristRX] > 0.6 && o2[C.IDX.wristLY] > 0.7, 'pose → head turn, the screen\'s left / right wrists (high)', { turn: r2(o2[C.IDX.headTurn]), lx: r2(o2[C.IDX.wristLX]), ly: r2(o2[C.IDX.wristLY]) });
  const fm = C.finisher(); let o3 = null; for (let k = 0; k < 30; k += 1) o3 = fm.apply(po, 1 / 30, true);
  check(o3[C.IDX.headTurn] < 0.4, 'mirrored: the head turns the other way on screen', r2(o3[C.IDX.headTurn]));
  check(C.fromPose({ landmarks: [] }).person === 0, 'no pose: nobody there');
  // face blendshapes
  const face = C.fromFace({ faceLandmarks: [Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.4 }))], faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.5 }, { categoryName: 'mouthSmileLeft', score: 0.6 }, { categoryName: 'mouthSmileRight', score: 0.7 }, { categoryName: 'eyeBlinkLeft', score: 0.9 }, { categoryName: 'eyeBlinkRight', score: 0.95 }] }] });
  check(face.mouthOpen > 0.7 && face.smile > 0.8 && face.blink > 0.9, 'face: mouth open, smile, blink', { m: r2(face.mouthOpen), s: r2(face.smile), b: r2(face.blink) });
  // a segmenter mask: the left half is a person
  const mw = 16; const mh = 8; const conf = new Float32Array(mw * mh); for (let i = 0; i < conf.length; i += 1) conf[i] = (i % mw) < 8 ? 1 : 0;
  const m = C.fromMask({ confidenceMasks: [{ width: mw, height: mh, getAsFloat32Array: () => conf }] });
  check(m.w === mw && m.data[0] === 255 && m.data[15] === 0 && Math.abs(m.area - 1) < 0.01, 'segmenter mask → bytes and the area', r2(m.area));
  check(C.TASK.pinch === 'hands' && C.TASK.smile === 'face' && C.TASK.headTurn === 'pose' && C.TASK.maskArea === 'mask' && !C.TASK.camMotion, 'each feature knows its task (light ones none)');
  check(new Set(C.NAMES).size === C.NAMES.length && C.NAMES.every((n) => /^[a-zA-Z0-9]+$/.test(n)), `${C.F} unique feature names`);
}

// ---------- motionmain.js: status, download from a local "CDN", cancel ----------
(async () => {
  const MM = require(path.join(__dirname, '..', 'motionmain.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-motion-'));
  const bodies = {}; for (const f of MM.FILES) bodies[f.name] = Buffer.alloc(1000 + f.name.length, f.name.length);
  const sv = http.createServer((q, r) => { const name = decodeURIComponent(q.url.split('/').pop()); const b = bodies[name]; if (!b) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-length': b.length }); if (name === 'slow.bin') return; r.end(b); });
  await new Promise((res) => sv.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${sv.address().port}`;
  const api = MM.api({ dataDir: dir, base: (f) => `${base}/${f.name}`, fetch: globalThis.fetch });
  const s0 = api.status();
  check(!s0.ready && s0.missing.length === MM.FILES.length && s0.bytes > 20e6, 'status: nothing yet, the download size known', `${Math.round(s0.bytes / 1e6)} MB`);
  const prog = [];
  const d = await api.download({ only: ['bundle', 'loader', 'hands'], onProgress: (p) => prog.push(p) });
  check(d.ok && prog.length > 0, 'download: three files from the CDN into the data folder', d.error || prog.length);
  const s1 = api.status();
  check(s1.have.includes('hands') && !s1.have.includes('face') && fs.existsSync(path.join(dir, 'motion', MM.VERSION)), 'status after: those three there, in the data folder', s1.have);
  const rd = api.read(['bundle', 'hands']);
  check(rd.bundle.length === bodies[MM.FILES.find((f) => f.id === 'bundle').name].length && rd.hands, 'read: the files come back as bytes');
  check(!fs.readdirSync(path.join(dir, 'motion', MM.VERSION)).some((f) => /part$/.test(f)), 'no half files left');
  const rm = api.remove();
  check(rm.ok && !api.status().have.length, 'remove: the files go (the space comes back)');
  sv.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
