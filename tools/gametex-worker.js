// ▶ Play, lighter textures (round 53, gametex): one encoder thread of the main process (worker_threads; gametexmain.js
// starts a few, only while Optimize for play runs). Basis Universal's WebAssembly encoder (tools/basisu, vendored) makes
// the KTX2; three.js' own Basis transcoder (the version ▶ Play's page loads) decodes mip 0 back to RGBA, and the copy is
// compared with the original's pixels: the quality guard (tools/gametex-core.js verdict) decides in gametexmain.js.
//   in:  { id, px: BGRA or RGBA (premultiplied: the system decoder's), bgra, w, h, png?: the original PNG (pictures
//          with see-through parts: the encoder reads it itself, exact), mode: 'etc1s' | 'uastc', role, flip, srgb }
//   out: { id, ok, ktx2, bytes, ms, q: { psnr, mean, max }, alpha } | { id, ok: false, error }
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { pathToFileURL } = require('url');
const C = require('./gametex-core');

let enc = null; let tr = null;
async function encoder() {
  if (!enc) enc = (async () => { const { default: BASIS } = await import(pathToFileURL(workerData.encoder).href); const M = await BASIS(); M.initializeBasis(); return M; })();
  return enc;
}
async function transcoder() {
  if (!tr) {
    tr = (async () => {
      // three.js' basis_transcoder.js is a classic script that ends with module.exports = BASIS when it can
      const mod = { exports: {} };
      new Function('module', 'exports', 'require', '__dirname', fs.readFileSync(workerData.transcoder.js, 'utf8'))(mod, mod.exports, require, __dirname); // eslint-disable-line no-new-func
      const T = await mod.exports({ wasmBinary: fs.readFileSync(workerData.transcoder.wasm) });
      T.initializeBasis();
      return T;
    })();
  }
  return tr;
}

function encode(M, j, rgba) {
  const e = new M.BasisEncoder();
  try {
    if (j.png) e.setSliceSourceImage(0, j.png, 0, 0, true); else e.setSliceSourceImage(0, rgba, j.w, j.h, false);
    e.setCreateKTX2File(true);
    e.setUASTC(j.mode === 'uastc');
    e.setMipGen(true);
    e.setYFlip(Boolean(j.flip));
    e.setKTX2SRGBTransferFunc(Boolean(j.srgb));
    e.setMipSRGB(Boolean(j.srgb));
    e.setPerceptual(Boolean(j.srgb));
    if (j.role === 'normal') e.setNormalMap();
    if (j.mode === 'uastc') { e.setKTX2UASTCSupercompression(true); e.setPackUASTCFlags(0); } // (the fastest level: ≈ 50 dB on photos, 10× quicker than the default)
    else { e.setQualityLevel(255); e.setCompressionLevel(1); }
    const out = new Uint8Array(Math.ceil(j.w * j.h * 1.5) + 262144);
    const n = e.encode(out);
    if (!n) throw new Error('the encoder made nothing (too big for it?)');
    return out.slice(0, n);
  } finally { e.delete(); }
}
function decode(T, ktx2) {
  const k = new T.KTX2File(ktx2);
  try {
    if (!k.isValid() || !k.startTranscoding()) throw new Error('the copy doesn\'t read back');
    const size = k.getImageTranscodedSizeInBytes(0, 0, 0, 13); // cTFRGBA32
    const dst = new Uint8Array(size);
    if (!k.transcodeImage(dst, 0, 0, 0, 13, 0, -1, -1)) throw new Error('the copy doesn\'t decode');
    return dst;
  } finally { k.close(); k.delete(); }
}

parentPort.on('message', async (j) => {
  try {
    const t0 = Date.now();
    const M = await encoder(); const T = await transcoder();
    // the system decoder's pixels are BGRA: RGBA for the encoder and the comparison
    const rgba = j.px instanceof Uint8Array ? j.px : new Uint8Array(j.px);
    if (j.bgra) for (let i = 0; i < rgba.length; i += 4) { const b = rgba[i]; rgba[i] = rgba[i + 2]; rgba[i + 2] = b; }
    const alpha = C.hasAlpha(rgba);
    const ktx2 = encode(M, j, rgba);
    const back = decode(T, ktx2);
    const q = C.compare(rgba, back, j.w, j.h, { flip: Boolean(j.flip), premul: alpha && Boolean(j.premul), alpha });
    parentPort.postMessage({ id: j.id, ok: true, ktx2, bytes: ktx2.length, ms: Date.now() - t0, q, alpha }, [ktx2.buffer]);
  } catch (err) {
    parentPort.postMessage({ id: j.id, ok: false, error: String(err?.message || err).slice(0, 200) });
  }
});
