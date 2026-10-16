#!/usr/bin/env node
// ▶ Play, lighter textures (round 53, gametex): the pure part (tools/gametex-core.js) and the real encoder on a throwaway
// folder (gamereadymain.js → gametexmain.js → tools/gametex-worker.js: Basis Universal's WebAssembly encoder, three.js'
// own transcoder for the check): cache keys, how each picture is encoded, the quality guard, the fallback when the
// graphics card takes no compressed format, a GLB's pictures swapped for KTX2, the originals untouched.
//   node dev/gametex-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
process.env.HEARTH_THREE_DIR ||= '/opt/cdn-cache/three@0.186.1/package'; // (three.js' Basis transcoder, no network)
const X = require('../tools/gametex-core');
const GR = require('../tools/gameready-core');

const out = { pass: true, failures: [], ran: 0, measured: {} };
const ok = (name, cond, info) => { out.ran += 1; if (!cond) { out.pass = false; out.failures.push(info === undefined ? name : `${name}: ${JSON.stringify(info)}`); } };

// ---------- keys ----------
const P = { path: '/games/clink/ground.jpg', hash: 'abc', role: 'color', flip: true };
ok('key: stable, 16 hex', X.texKey(P) === X.texKey({ ...P }) && /^[0-9a-f]{16}$/.test(X.texKey(P)));
ok('key: the same bytes elsewhere → the same copy', X.texKey(P) === X.texKey({ ...P, path: '/elsewhere/g.jpg' }));
ok('key: other bytes / role / orientation → another copy', new Set([X.texKey(P), X.texKey({ ...P, hash: 'abd' }), X.texKey({ ...P, role: 'normal' }), X.texKey({ ...P, flip: false })]).size === 4);
ok('key: a model copy with KTX2 pictures is another copy than a plain one', GR.entryKey({ path: '/a/s.glb', hash: 'h' }) !== GR.entryKey({ path: '/a/s.glb', hash: 'h', variant: 'ktx2' }) && GR.entryKey({ path: '/a/s.glb', hash: 'h' }) === GR.entryKey({ path: '/a/s.glb', hash: 'h', variant: undefined }));

// ---------- what a picture is ----------
ok('role by name', X.roleOf('rock_normal.png') === 'normal' && X.roleOf('Rock_Nrm.jpg') === 'normal' && X.roleOf('metal_roughness.png') === 'data' && X.roleOf('ground.jpg') === 'color' && X.roleOf('wall_ao.png') === 'data');
const code = "const ground = refTexture('ground'); ground.repeat.set(4, 2);\nconst nrm = refTexture('rock');\nconst m = new THREE.MeshStandardMaterial({ map: ground, normalMap: nrm, roughnessMap: refTexture('detail') });\nmat.emissiveMap = refTexture('glow');";
const roles = X.rolesFromCode([code], ['ground', 'rock', 'detail', 'glow', 'unused_normal']);
ok('role from the scene\'s code (directly and through a variable)', roles.ground === 'color' && roles.rock === 'normal' && roles.detail === 'data' && roles.glow === 'color' && roles.unused_normal === 'normal', roles);
ok('role: used as a map and a normal map → the stricter (normal)', X.rolesFromCode(["const t = refTexture('x'); a.map = t; b.normalMap = t;"], ['x']).x === 'normal');
ok('only PNG / JPEG are encoded', X.canEncode('a.PNG') && X.canEncode('b.jpeg') && !X.canEncode('c.webp') && !X.canEncode('d.ktx2'));

// ---------- the format chosen ----------
ok('modes: a color picture tries ETC1S then UASTC; normal / data maps UASTC only', JSON.stringify(X.modes('color')) === '["etc1s","uastc"]' && JSON.stringify(X.modes('normal')) === '["uastc"]' && JSON.stringify(X.modes('data')) === '["uastc"]');
const mac = X.caps(['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'EXT_texture_compression_bptc', 'WEBGL_compressed_texture_s3tc'], { platform: 'MacIntel', userAgent: 'Mac' });
const win = X.caps(['EXT_texture_compression_bptc', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_s3tc_srgb'], { platform: 'Win32', userAgent: 'Windows' });
const linux = X.caps(['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'EXT_texture_compression_bptc', 'WEBGL_compressed_texture_s3tc'], { platform: 'Linux x86_64', userAgent: 'X11; Linux' });
const none = X.caps(['OES_texture_float'], {});
ok('caps: Mac (ASTC + ETC) · Windows (BC) · Linux leaves out emulated ETC / ASTC · none', mac.any && mac.astc && win.any && !win.astc && linux.any && !linux.astc && !linux.etc2 && linux.bptc && none.any === false, { mac, win, linux, none });
ok('video memory a pixel: Mac ETC1S → ETC1 0.5, UASTC → ASTC 1', X.bpp('etc1s', false, mac) === 0.5 && X.bpp('uastc', false, mac) === 1 && X.bpp('etc1s', true, mac) === 1);
ok('video memory a pixel: Windows ETC1S → BC7 1, UASTC → BC7 1', X.bpp('etc1s', false, win) === 1 && X.bpp('uastc', false, win) === 1);
ok('video memory a pixel: no compressed format → 4 (RGBA)', X.bpp('uastc', false, none) === 4 && X.bpp('etc1s', false, none) === 4);
ok('vram: a 4096×2048 picture is 43 MB as RGBA (mipmapped), 11 MB as UASTC', Math.round(X.vramOf(4096, 2048, 4) / 1048576) === 43 && Math.round(X.vramOf(4096, 2048, 1) / 1048576) === 11);
const rep = X.report([{ before: 640 * 1048576, after: 120 * 1048576 }, { before: 40 * 1048576, after: 40 * 1048576, kept: true }]);
ok('report: "Textures: 680 MB → 160 MB of video memory" (a kept picture counts at its full size)', rep.text === 'Textures: 680 MB → 160 MB of video memory' && rep.kept === 1, rep);
ok('report: nothing → null', X.report([]) === null);

// ---------- the quality guard ----------
ok('verdict: ETC1S kept from 40 dB, UASTC from 42 dB', X.verdict('etc1s', { psnr: 40.2 }).ok && !X.verdict('etc1s', { psnr: 38 }).ok && X.verdict('uastc', { psnr: 50 }).ok && !X.verdict('uastc', { psnr: 41 }).ok && /looked different/.test(X.verdict('uastc', { psnr: 41 }).why));
ok('verdict: unchecked → not kept', !X.verdict('uastc', null).ok);
{
  const w = 4; const h = 2; const a = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
  const flipped = new Uint8Array(a.length); for (let y = 0; y < h; y++) flipped.set(a.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  ok('compare: the same pixels → 99 dB; stored bottom row first → the same with flip', X.compare(a, a, w, h).psnr === 99 && X.compare(a, flipped, w, h, { flip: true }).psnr === 99 && X.compare(a, flipped, w, h).psnr < 30);
  const off = a.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v + 2)));
  const q = X.compare(a, off, w, h);
  ok('compare: 2 levels off → ≈ 42 dB, mean ≈ 2', q.psnr > 41 && q.psnr < 43.5 && q.mean > 1.5 && q.mean <= 2, q);
}

// ---------- the cache: fresh / stale / kept / missing; ▶ Play's map; the fallback ----------
{
  const k = X.texKey(P);
  const I = { tex: { [k]: { src: P.path, hash: 'abc', out: '/c/x.ktx2', w: 4096, h: 2048, mode: 'uastc' }, old: { src: P.path, hash: 'zzz', out: '/c/old.ktx2' }, k2: { src: '/g/noise.png', hash: 'n1', keep: 'compressed it looked different' } } };
  const pics = [P, { path: '/g/noise.png', hash: 'n1', role: 'data', flip: true }, { path: '/g/new.png', hash: 'q', role: 'color', flip: true }];
  I.tex[X.texKey(pics[1])] = I.tex.k2; delete I.tex.k2;
  const c = X.checkTex(I, pics);
  ok('cache: fresh / stale (an older version of the same picture) / kept / missing', c.fresh.length === 1 && c.stale.length === 1 && c.stale[0].key === 'old' && c.kept.length === 1 && c.missing.length === 1 && c.missing[0].path === '/g/new.png', c);
  const m = X.texMap(I, pics, win);
  ok('▶ Play\'s map: the picture → its copy (on a card with compressed formats)', m[GR.norm(P.path)]?.out === '/c/x.ktx2' && m[GR.norm(P.path)].flip === false && Object.keys(m).length === 1, m);
  ok('fallback: a card without compressed formats → no copies (the originals load)', Object.keys(X.texMap(I, pics, none)).length === 0);
  ok('report on Windows: 43 MB → 11 MB', X.texReport(I, [P], win).text === 'Textures: 43 MB → 11 MB of video memory', X.texReport(I, [P], win));
}

// ---------- GLB ----------
function makeGlb(images) {
  // a triangle + one picture per entry ([name, bytes, slot]); one more buffer range a model would have (indices)
  const parts = [new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), new Uint8Array(new Uint16Array([0, 1, 2, 0]).buffer), ...images.map((x) => x[1])];
  const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const pad = (4 - (p.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); chunks.push(p, new Uint8Array(pad)); off += p.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.length; }
  const mat = { pbrMetallicRoughness: {} };
  images.forEach(([, , slot], i) => { if (slot === 'baseColorTexture' || slot === 'metallicRoughnessTexture') mat.pbrMetallicRoughness[slot] = { index: i }; else mat[slot] = { index: i }; });
  const json = { asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'ship' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [mat], textures: images.map((_, i) => ({ source: i })), images: images.map(([name], i) => ({ name, bufferView: 2 + i, mimeType: 'image/png' })), buffers: [{ byteLength: off }], bufferViews: views, accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }] };
  return X.writeGlb(json, bin);
}
{
  const g = makeGlb([['hull', new Uint8Array([1, 2, 3, 4, 5]), 'baseColorTexture'], ['hull_n', new Uint8Array([6, 7, 8]), 'normalTexture'], ['orm', new Uint8Array([9]), 'metallicRoughnessTexture']]);
  const p = X.parseGlb(g);
  const imgs = X.glbImages(p.json);
  ok('glb: its pictures and how its materials use them', imgs.length === 3 && imgs[0].role === 'color' && imgs[1].role === 'normal' && imgs[2].role === 'data', imgs);
  const r = X.replaceGlbImages(p.json, p.bin, new Map([[0, new Uint8Array([0xab, 0xcd, 0xef, 0x01, 0x02, 0x03, 0x04])]]));
  const back = X.parseGlb(X.writeGlb(r.json, r.bin));
  const v0 = X.viewBytes(back.json, back.bin, 0); const v2 = X.viewBytes(back.json, back.bin, 2); const v3 = X.viewBytes(back.json, back.bin, 3);
  ok('glb: the picture swapped for KTX2 (KHR_texture_basisu, required), the other ranges the same bytes', back.json.images[0].mimeType === 'image/ktx2' && back.json.textures[0].extensions.KHR_texture_basisu.source === 0 && back.json.textures[0].source === undefined && back.json.textures[1].source === 1 && back.json.extensionsRequired.includes('KHR_texture_basisu') && v2.length === 7 && v2[0] === 0xab && Buffer.compare(Buffer.from(v0), Buffer.from(X.viewBytes(p.json, p.bin, 0))) === 0 && v3[0] === 6 && back.json.bufferViews.every((b) => b.byteOffset % 4 === 0), back.json);
  ok('glb: the source left untouched (a new JSON)', p.json.images[0].mimeType === 'image/png');
}

// ---------- the real encoder (Basis Universal WebAssembly in worker threads) on a throwaway folder ----------
// pictures are stored here as "RAWT" + w + h + RGBA (named .png / .jpg): the test's decoder reads them (in Hearth it's
// the system's own decoder, Electron's nativeImage, checked by dev/checks/gametex.js)
const raw = (w, h, f) => { const b = Buffer.alloc(12 + w * h * 4); b.write('RAWT'); b.writeUInt32LE(w, 4); b.writeUInt32LE(h, 8); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = 12 + (y * w + x) * 4; const c = f(x, y); b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = c[3] ?? 255; } return b; };
const rawDecode = (buf) => { if (buf.toString('latin1', 0, 4) !== 'RAWT') return null; const w = buf.readUInt32LE(4); const h = buf.readUInt32LE(8); return { w, h, px: new Uint8Array(buf.subarray(12, 12 + w * h * 4)), bgra: false, premul: false }; };
const rnd = (x, y, s) => { const n = Math.sin(x * 12.9898 + y * 78.233 + s * 37.7) * 43758.5453; return n - Math.floor(n); };
const smooth = (x, y) => [128 + 100 * Math.sin(x / 40), 128 + 90 * Math.cos(y / 33), 120 + 60 * Math.sin((x + y) / 70)];
const tiles = (x, y) => (((x >> 5) + (y >> 5)) % 2 ? [200, 120, 60] : [40, 80, 160]);
const noise = (x, y) => [255 * rnd(x, y, 1), 255 * rnd(x, y, 2), 255 * rnd(x, y, 3)];
const normal = (x, y) => { const nx = Math.sin(x / 9) * 0.4; const ny = Math.cos(y / 11) * 0.4; const nz = Math.sqrt(1 - nx * nx - ny * ny); return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255]; };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-gametex-'));
  try {
    const TX = require('../gametexmain'); TX.init({ decode: rawDecode });
    const M = require('../gamereadymain')._test; M.setDir(dir); M.setApp(path.join(__dirname, '..'));
    const files = { tiles: raw(512, 512, tiles), photo: raw(512, 256, smooth), rock_normal: raw(256, 256, normal), grain: raw(256, 256, noise) };
    const pics = [];
    for (const [k, b] of Object.entries(files)) { const f = path.join(dir, `${k}.${k === 'photo' ? 'jpg' : 'png'}`); fs.writeFileSync(f, b); pics.push({ path: f, hash: crypto.createHash('sha1').update(b).digest('hex'), size: b.length, role: X.roleOf(k), flip: true }); }
    const sums = pics.map((p) => p.hash);
    const t0 = Date.now();
    const res = await M.optimize({ files: [], pics, caps: win, kind: 'lab', toolPath: '/nonexistent/gltfpack' });
    out.measured.encodeMs = Date.now() - t0;
    out.measured.pictures = res.pictures;
    const made = Object.fromEntries((res.pictures?.made || []).map((m) => [path.basename(m.path), m]));
    const kept = Object.fromEntries((res.pictures?.kept || []).map((m) => [path.basename(m.path), m]));
    ok('encode: no gltfpack needed for textures (the bundled encoder)', res.ok === true && res.meshTool === false, { ok: res.ok, error: res.error });
    ok('encode: flat tiles → ETC1S (looks the same)', made['tiles.png']?.mode === 'etc1s' && made['tiles.png'].psnr >= 40, made['tiles.png'] || kept['tiles.png']);
    ok('encode: a normal map → UASTC', made['rock_normal.png']?.mode === 'uastc' && made['rock_normal.png'].psnr >= 42, made['rock_normal.png'] || kept['rock_normal.png']);
    ok('encode: a photo-like picture → compressed within tolerance', made['photo.jpg'] && made['photo.jpg'].psnr >= 40, made['photo.jpg'] || kept['photo.jpg']);
    ok('quality guard: pure noise looked different compressed → the original stays, and why', kept['grain.png'] && /looked different/.test(kept['grain.png'].why) && !made['grain.png'], kept['grain.png'] || made['grain.png']);
    const ktx = made['tiles.png'] && fs.readFileSync(made['tiles.png'].out);
    ok('copies: KTX2 files in Hearth\'s cache (data/game-cache/tex/<key>.ktx2)', ktx && ktx.subarray(1, 7).toString('latin1') === 'KTX 20' && made['tiles.png'].out.startsWith(path.join(dir, 'game-cache', 'tex')) && path.basename(made['tiles.png'].out) === `${X.texKey(pics[0])}.ktx2`);
    ok('report: what the copies save ("Textures: … → … of video memory"), the kept picture at full size', /^Textures: \d+ MB → \d+ MB of video memory$/.test(res.tex?.text || '') && res.tex.after < res.tex.before && res.tex.kept === 1, res.tex);
    out.measured.report = res.tex;
    // again: nothing made twice
    const again = await M.optimize({ files: [], pics, caps: win, kind: 'lab', toolPath: '/nonexistent/gltfpack' });
    ok('cache: the second time nothing is encoded again (fresh copies, the kept one remembered)', (again.pictures?.made || []).length === 0 && (again.pictures?.keptNow || []).length === 0 && again.pictures?.kept?.length === 1 && again.tex?.text === res.tex.text, again.pictures);
    const tp = M.texplan({ pics, caps: win });
    ok('plan: ▶ Play\'s map has the 3 copies', Object.keys(tp.map).length === 3 && tp.kept.length === 1, tp);
    ok('fallback: on a card without compressed formats the map is empty (originals)', Object.keys(M.texplan({ pics, caps: none }).map).length === 0);
    // a GLB: its pictures swapped; no gltfpack → a pictures-only copy (mesh: false)
    const glbBytes = makeGlb([['hull', new Uint8Array(raw(256, 256, tiles)), 'baseColorTexture'], ['hull_normal', new Uint8Array(raw(128, 128, normal)), 'normalTexture']]);
    const gf = path.join(dir, 'ship.glb'); fs.writeFileSync(gf, glbBytes);
    const gfile = { path: gf, hash: crypto.createHash('sha1').update(glbBytes).digest('hex'), size: glbBytes.length, variant: 'ktx2' };
    const g = await M.optimize({ files: [gfile], pics: [], caps: win, kind: 'lab', toolPath: '/nonexistent/gltfpack' });
    const gm = g.made?.[0];
    const back = gm && X.parseGlb(new Uint8Array(fs.readFileSync(gm.out)));
    ok('glb: a copy with KTX2 pictures in Hearth\'s cache (no gltfpack: pictures only)', gm && gm.textures && gm.mesh === false && back.json.images.every((im) => im.mimeType === 'image/ktx2') && back.json.extensionsRequired.includes('KHR_texture_basisu'), g);
    ok('glb: its video memory before → after', gm?.tex && gm.tex.after < gm.tex.before, gm?.tex);
    ok('glb: the next ▶ Play swaps the model for the copy (variant ktx2 only)', (await M.plan([gfile])).map[GR.norm(gf)] === gm?.out && !(await M.plan([{ ...gfile, variant: undefined }])).map[GR.norm(gf)]);
    ok('originals: every picture and the GLB byte for byte the same', pics.every((p, i) => crypto.createHash('sha1').update(fs.readFileSync(p.path)).digest('hex') === sums[i]) && Buffer.compare(fs.readFileSync(gf), Buffer.from(glbBytes)) === 0);
  } catch (err) { ok('encoder part', false, String(err.stack || err)); }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.pass ? 0 : 1);
})();
