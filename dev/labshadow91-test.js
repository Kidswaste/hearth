#!/usr/bin/env node
// (round 91, labshadow91) The Lab preview's big pictures in slices (tools/three-sandbox.html, upSlice) run against the
// REAL three.js r186 (WebGLRenderer on a fake WebGL2 context that records every call), not a stand-in:
//  - three's read order of Texture.generateMipmaps in initTexture. upSlice makes a picture's memory with every mip
//    level but without making mipmaps of the empty memory: it answers the third read false (three reads it for its
//    cache key, for the mip level count, then for the mipmap pass). That leans on three's internals: if a three update
//    reads it a different number of times or in another order, this test fails loudly, before the Lab makes a texture
//    with one mip level (blurry / black when minified) or runs the mipmap pass again over 67 MB.
//  - the slices themselves on three: memory first (13 levels, no mipmaps), slices at their rows, mipmaps once with the
//    last, the scene's texture taking the memory over with nothing uploaded again.
//  - the slice size following the measured time of a slice (1–4 MP, ~6 ms each).
//  - a picture changed on disk while shown (round 42's reload) in slices: the old picture drawn until the last slice,
//    then its memory deleted on the graphics card and the new one taken over, nothing uploaded again.
//   node dev/labshadow91-test.js        (three.js from $HEARTH_THREE_DIR or /opt/cdn-cache/three@0.186.1/package)
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');
const THREE_DIR = process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package';
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };

// ---------- a fake WebGL2 context: every call recorded, enough answers for WebGLRenderer ----------
function fakeGL() {
  const log = []; const hook = { onCall: null }; const consts = new Map(); const names = new Map(); let nextC = 0x9000; let nextT = 1;
  const P = { VERSION: 'WebGL 2.0 (fake)', SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00 (fake)' };
  const gl = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!consts.has(k)) { consts.set(k, nextC); names.set(nextC, k); nextC += 1; } return consts.get(k); }
      const fn = (...a) => {
        log.push({ op: k, a });
        if (hook.onCall) hook.onCall(k, a);
        switch (k) {
          case 'getParameter': { const n = names.get(a[0]) || ''; if (n in P) return P[n]; if (/VIEWPORT|SCISSOR_BOX/.test(n)) return new Int32Array([0, 0, 1, 1]); if (/^MAX_/.test(n)) return 16384; return 0; }
          case 'getExtension': return {};
          case 'getSupportedExtensions': return [];
          case 'getContextAttributes': return { alpha: true, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
          case 'getShaderPrecisionFormat': return { precision: 23, rangeMin: 127, rangeMax: 127 };
          case 'createTexture': return { tex: nextT++ };
          case 'createBuffer': case 'createFramebuffer': case 'createRenderbuffer': case 'createVertexArray': case 'createProgram': case 'createShader': return {};
          case 'isContextLost': return false;
          default: return undefined;
        }
      };
      t[k] = fn; return fn;
    },
  });
  return { gl, log, hook };
}
const UPLOADS = /^(texImage2D|texSubImage2D|texStorage2D|compressedTexImage2D|copyTexSubImage2D)$/;

(async () => {
  const file = path.join(THREE_DIR, 'build', 'three.module.js');
  if (!fs.existsSync(file)) { check(false, `three.js at ${THREE_DIR} (set HEARTH_THREE_DIR)`); process.exit(1); }
  const THREE = await import(pathToFileURL(file).href);
  check(THREE.REVISION === '186', 'three.js r186 (the version the Lab ships; a new one: read the lines below)', THREE.REVISION);
  const mkRenderer = () => { const { gl, log, hook } = fakeGL(); const canvas = { width: 1, height: 1, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => gl }; return { r: new THREE.WebGLRenderer({ canvas, context: gl }), gl, log, hook }; };

  // ---------- 1. three's reads of generateMipmaps while it makes a texture's memory (no pixels yet) ----------
  {
    const { r, log } = mkRenderer();
    const tex = new THREE.Texture({ width: 4096, height: 4096 }); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    const order = []; let reads = 0;
    tex.source.dataReady = false; tex.needsUpdate = true;
    Object.defineProperty(tex, 'generateMipmaps', { configurable: true, get: () => { reads += 1; order.push(new Error().stack.split('\n')[2]?.trim().replace(/^at (\S+).*$/, '$1') || '?'); return true; }, set: () => {} });
    log.length = 0; r.initTexture(tex);
    const st = log.filter((x) => x.op === 'texStorage2D');
    check(reads === 3, 'three reads Texture.generateMipmaps exactly 3 times while making a texture\'s memory (upSlice answers the 3rd false: a different count means its workaround in tools/three-sandbox.html must be redone for this three)', { reads, order });
    check(st.length === 1 && st[0].a[1] === 13 && log.filter((x) => x.op === 'generateMipmap').length === 1, '… and with every read true: 13 levels of memory, then one mipmap pass (the pass upSlice skips)', { levels: st[0]?.a[1], mipmapPasses: log.filter((x) => x.op === 'generateMipmap').length });
    check(!log.some((x) => /^tex(Sub)?Image2D$/.test(x.op)), '… and no pixels sent for a picture marked not ready (source.dataReady = false)', log.filter((x) => /Image2D/.test(x.op)).map((x) => x.op));
  }
  // the page's own workaround, as written there
  const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
  check(/get: \(\) => \{ reads \+= 1; return gm && reads < 3; \}/.test(html), 'the page answers the third read false (the line this test guards)');
  const src = /const UPQ = \{[\s\S]*?\nfunction upFlush\(k\) \{[\s\S]*?\n\}\n/.exec(html)?.[0];
  check(Boolean(src && /function upSlice\(/.test(src)), 'the uploads\' queue and its slices are in the page');
  if (!src) { process.exit(1); }

  // ---------- 2. the page's slice queue on three ----------
  class ImageBitmap { constructor(w, h, tag) { this.width = w; this.height = h; this.tag = tag; this.closed = false; } close() { this.closed = true; } }
  const mkEnv = () => {
    const R = mkRenderer(); const { r, gl, log, hook } = R;
    const frames = []; const after = []; const clock = { t: 0, msPerMP: 0 };
    // a slice's time on the page's thread: msPerMP × its megapixels (the fake GL is instant)
    hook.onCall = (k, a) => { if (k === 'texSubImage2D' && clock.msPerMP) clock.t += clock.msPerMP * ((a[4] * a[5]) / 1e6); };
    const tex = new THREE.Texture(); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex })));
    r.__lastScene = scene;
    const env = { XP_PAGE: false, realRAF: (f) => frames.push(f), realSetTimeout: (f, ms) => { if (ms === 0) after.push(f); return 1; }, realClearTimeout: () => {}, realNow: () => clock.t, THREE, ImageBitmap, renderers: new Set([r]) };
    const api = new Function(...Object.keys(env), `${src}\nreturn { upRelease, UPQ, UPS };`)(...Object.values(env));
    const tick = () => { const l = frames.splice(0); for (const f of l) f(); const a = after.splice(0); for (const f of a) f(); };
    const glTex = (t) => r.properties.get(t).__webglTexture;
    return { ...api, r, gl, log, tex, tick, clock, glTex };
  };
  const runTo = (E, until, max = 80) => { const per = []; for (let n = 0; n < max && !until(); n++) { const k = E.log.length; E.tick(); per.push(E.log.slice(k).filter((x) => UPLOADS.test(x.op) || x.op === 'generateMipmap')); } return per; };

  const E = mkEnv();
  E.clock.msPerMP = 20; // (a slow software GPU: 20 ms a megapixel on the page's thread)
  const bmp1 = new ImageBitmap(4096, 4096, 'first'); let one = 0; let done1 = false;
  E.upRelease(() => { one += 1; }, 4096 * 4096, E.tex, bmp1).then(() => { done1 = true; });
  const per1 = runTo(E, () => E.tex.version > 0 && E.UPS.active === 0);
  const ops1 = per1.flat();
  const alloc = per1[0] || [];
  check(alloc.length === 1 && alloc[0].op === 'texStorage2D' && alloc[0].a[1] === 13, 'a 4K picture: its memory first, all 13 mip levels, nothing else in that gap (three r186 under the page\'s read-order answer)', alloc.map((x) => [x.op, x.a[1]]));
  const subs = ops1.filter((x) => x.op === 'texSubImage2D');
  const rows = subs.map((x) => x.a[5]);
  check(subs.every((x, i) => x.a[4] === 4096 && x.a[3] === subs.slice(0, i).reduce((s, y) => s + y.a[5], 0)) && rows.reduce((a, b) => a + b, 0) === 4096, 'then slices of whole rows, in order, each at its own place, all 4096 rows', rows);
  check(ops1.filter((x) => x.op === 'generateMipmap').length === 1 && per1.findIndex((p) => p.some((x) => x.op === 'generateMipmap')) === per1.length - 1, 'the mipmaps made once, with the last slice', per1.map((p) => p.map((x) => x.op[0]).join('')).join(' '));
  check(per1.slice(1).every((p) => p.filter((x) => x.op === 'texSubImage2D').length === 1), 'one slice a gap after a frame', per1.map((p) => p.length));
  check(rows[0] === 512 && rows.slice(1, -1).every((h) => h === 244), 'the slice size follows the time a slice takes: 2.1 MP to begin with, then 1 MP (20 ms a MP on this "GPU", 6 ms aimed for)', rows);
  check(Math.max(...rows) * 4096 <= 4.2e6, 'never more than 4.2 MP in one call', Math.max(...rows) * 4096 / 1e6);
  await new Promise((res) => setTimeout(res, 0)); // (the hand-over's promise settles after the task)
  const glFull = E.glTex(E.tex);
  check(one === 0 && done1 && E.tex.image === bmp1 && glFull && E.log.filter((x) => x.op === 'bindTexture' && x.a[1] === glFull).length > 0, 'the scene\'s texture has the picture, on the memory the slices filled (the one-piece hand-over never ran)', { one, done1, gl: glFull });
  const lastCopyAt = E.log.map((x) => x.op).lastIndexOf('generateMipmap');
  check(!E.log.slice(lastCopyAt + 1).some((x) => UPLOADS.test(x.op)), '… taken over with nothing uploaded again (three finds that memory made)', E.log.slice(lastCopyAt + 1).filter((x) => UPLOADS.test(x.op)).map((x) => x.op));

  // ---------- 3. the same picture changed on disk while shown: in slices too ----------
  E.clock.msPerMP = 0.5; // (a fast card: 0.5 ms a MP)
  const bmp2 = new ImageBitmap(4096, 4096, 'changed'); let one2 = 0; let prevGot = null; let done2 = false;
  const k0 = E.log.length;
  E.upRelease(() => { one2 += 1; }, 4096 * 4096, E.tex, bmp2, (prev) => { prevGot = prev; prev.close(); }).then(() => { done2 = true; });
  const mid = []; const per2 = runTo(E, () => { if (E.UPS.active) mid.push(E.glTex(E.tex) === glFull && E.tex.image === bmp1); return E.UPS.active === 0 && E.tex.image === bmp2; });
  await new Promise((res) => setTimeout(res, 0));
  const ops2 = per2.flat(); const rows2 = ops2.filter((x) => x.op === 'texSubImage2D').map((x) => x.a[5]);
  check(per2[0]?.length === 1 && per2[0][0].op === 'texStorage2D' && per2[0][0].a[1] === 13, 'a picture changed while shown: new memory first, beside the old', per2[0]?.map((x) => [x.op, x.a[1]]));
  check(mid.length > 1 && mid.every(Boolean), 'the old picture is drawn until the last slice is in', mid);
  check(rows2.reduce((a, b) => a + b, 0) === 4096 && ops2.filter((x) => x.op === 'generateMipmap').length === 1, '… then all rows, the mipmaps once', rows2);
  check(Math.max(...rows2) > 512 && Math.max(...rows2) * 4096 <= 4.2e6, 'on a fast card the slices grow (up to 4 MP)', rows2);
  const glNew = E.glTex(E.tex);
  const deleted = E.log.slice(k0).filter((x) => x.op === 'deleteTexture').map((x) => x.a[0]);
  check(one2 === 0 && E.tex.image === bmp2 && glNew && glNew !== glFull && deleted.includes(glFull), 'then the scene\'s texture takes the new one over and the old memory is deleted on the graphics card', { one2, newGl: glNew, oldGl: glFull, deleted });
  const mip2 = E.log.map((x) => x.op).lastIndexOf('generateMipmap');
  check(!E.log.slice(mip2 + 1).some((x) => UPLOADS.test(x.op)), '… with nothing uploaded again', E.log.slice(mip2 + 1).filter((x) => UPLOADS.test(x.op)).map((x) => x.op));
  check(prevGot === bmp1 && bmp1.closed && !bmp2.closed, 'the picture it let go is handed back (closed by the reload), the new one kept', { prev: prevGot?.tag });
  // a texture three flips at upload (flipY true: not one of the Lab's decoded pictures): one piece, as before
  const F = mkEnv(); F.tex.flipY = true; F.tex.image = new ImageBitmap(4096, 4096, 'old'); F.tex.needsUpdate = true; F.r.initTexture(F.tex);
  let oneF = 0; F.upRelease(() => { oneF += 1; }, 4096 * 4096, F.tex, new ImageBitmap(4096, 4096, 'new'), () => {}); F.tick();
  check(oneF === 1 && F.UPS.pictures === 0, 'a picture three flips itself, changed while shown: one piece after a frame, as before', { oneF });
  // a picture shown before, handed over without the reload's say (a first picture's path): one piece, as before
  const G = mkEnv(); G.tex.image = new ImageBitmap(4096, 4096, 'old'); G.tex.needsUpdate = true; G.r.initTexture(G.tex);
  let oneG = 0; G.upRelease(() => { oneG += 1; }, 4096 * 4096, G.tex, new ImageBitmap(4096, 4096, 'new')); G.tick();
  check(oneG === 1 && G.UPS.pictures === 0, 'a texture already shown, not a reload: one piece, as before', { oneG });

  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
