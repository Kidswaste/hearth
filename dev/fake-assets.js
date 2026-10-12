#!/usr/bin/env node
// Fakes for the asset library checks (round 24, assets stream). Nothing real is reached.
//   node dev/fake-assets.js fixtures <dir>     # a folder of real asset files (PNG, HDR, GLB with a texture, TTF, WAV,
//                                               # .cube, .glsl, a preset, a duplicate PNG in a subfolder)
//   node dev/fake-assets.js [port]             # serves the fake APIs until killed, prints its base URL
//   require('./fake-assets').start(port?) → Promise<{ base, log, close }>   (dev/smoke.js --fake-assets)
// Poly Haven under /ph (same shapes as api.polyhaven.com): /ph/assets?t=hdris|textures|models, /ph/files/<id>,
// /ph/info/<id>, /ph/dl/<file> (an .hdr, PNG maps, a .gltf + .bin + .png that the app packs into one .glb).
// ambientCG under /acg (same shapes as ambientcg.com/api/v2/full_json): Material and HDRI lists with downloadFolders,
// /acg/get/<file>.zip (a real zip of Color / NormalGL / Roughness maps). Previews: /pv/<name>.png. GET /__log.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { png, hdr, wav, glb: plainGlb } = require('./fake-meshy');

function glbWithTexture() {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const tex = png(16, 16, [40, 200, 120]);
  const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const a = pad4(Buffer.from(pos.buffer)); const b = pad4(Buffer.from(uv.buffer)); const c = pad4(tex);
  const bin = Buffer.concat([a, b, c]);
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0', generator: 'hearth fake-assets' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'tri' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], textures: [{ source: 0 }], images: [{ bufferView: 2, mimeType: 'image/png' }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: a.length, byteLength: 24 }, { buffer: 0, byteOffset: a.length + b.length, byteLength: tex.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }],
    animations: [],
  }));
  const pad = (x, ch) => Buffer.concat([x, Buffer.alloc((4 - (x.length % 4)) % 4, ch)]);
  const j = pad(json, 0x20); const bb = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bb.length, 8);
  const ch = (len, type) => { const x = Buffer.alloc(8); x.writeUInt32LE(len, 0); x.writeUInt32LE(type, 4); return x; };
  return Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(bb.length, 0x004e4942), bb]);
}
// a glTF in three files (Poly Haven's model downloads): scene.gltf → scene.bin + textures/diff.png
function gltfParts() {
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], textures: [{ source: 0 }], images: [{ uri: 'textures/diff.png' }],
    buffers: [{ uri: 'scene.bin', byteLength: pos.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  };
  return { gltf: Buffer.from(JSON.stringify(gltf)), bin: pos, tex: png(8, 8, [200, 60, 60]) };
}
// a .cube LUT that warms everything (red up, blue down)
function cube(n = 4) {
  const lines = ['TITLE "Fake warm"', `LUT_3D_SIZE ${n}`];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) lines.push(`${Math.min(1, r / (n - 1) * 1.15 + 0.05).toFixed(4)} ${(g / (n - 1)).toFixed(4)} ${(b / (n - 1) * 0.8).toFixed(4)}`);
  return Buffer.from(`${lines.join('\n')}\n`);
}
// a zip writer (deflated entries) for ambientCG's downloads
function zip(entries) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const locals = []; const centrals = []; let off = 0;
  for (const [name, data] of entries) {
    const z = zlib.deflateRawSync(data); const nm = Buffer.from(name); const c = crc(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(z.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(z.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, z); centrals.push(ch, nm);
    off += 30 + nm.length + z.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
function ttf() {
  for (const p of ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/freefont/FreeSans.ttf']) if (fs.existsSync(p)) return fs.readFileSync(p);
  return null;
}
function fixtures(dir) {
  fs.mkdirSync(path.join(dir, 'Textures', 'Brick'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Copies'), { recursive: true });
  const w = (rel, buf) => { if (buf) fs.writeFileSync(path.join(dir, rel), buf); };
  w('Textures/Brick/red_brick_wall_diff_1k.png', png(64, 48, [180, 60, 40]));
  w('Copies/red brick (copy).png', png(64, 48, [180, 60, 40])); // the same bytes: one asset, two places
  w('sunset_sky_1k.hdr', hdr());
  w('robot_textured.glb', glbWithTexture());
  w('plain_triangle.glb', plainGlb());
  w('Dejavu Sans.ttf', ttf());
  w('kick_hit.wav', wav(1, 8000));
  w('Warm Film.cube', cube(4));
  w('plasma.glsl', Buffer.from('// Plasma: colorful waves\nvoid mainImage(out vec4 o, in vec2 p) { vec2 uv = p / iResolution.xy; o = vec4(0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4)), 1.0); }\n'));
  w('Neon pulse.hpreset', Buffer.from(JSON.stringify({ kind: 'hearth-preset', name: 'Neon pulse', values: { size: 2 } })));
  w('notes.txt', Buffer.from('not an asset'));
  return dir;
}

function start(port = 0) {
  const log = [];
  const parts = gltfParts();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const base = `http://127.0.0.1:${server.address().port}`;
    log.push(`${req.method} ${u.pathname}${u.search}`);
    const send = (code, body, type = 'application/json') => { const b = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body); res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
    if (u.pathname === '/__log') return send(200, log);
    if (u.pathname.startsWith('/pv/')) return send(200, png(32, 32, [90, 120, 220]), 'image/png');
    // ---------- Poly Haven ----------
    if (u.pathname === '/ph/assets') {
      const t = u.searchParams.get('t');
      if (t === 'textures') return send(200, { brick_wall_02: { name: 'Brick Wall 02', categories: ['brick', 'wall'], tags: ['red'], download_count: 50, thumbnail_url: `${base}/pv/brick.png` }, wood_floor: { name: 'Wood Floor', categories: ['wood', 'floor'], tags: ['planks'], download_count: 80, thumbnail_url: `${base}/pv/wood.png` } });
      if (t === 'models') return send(200, { fake_chair: { name: 'Fake Chair', categories: ['furniture'], tags: ['chair'], download_count: 30, thumbnail_url: `${base}/pv/chair.png` } });
      return send(200, { sunset_fake: { name: 'Fake Sunset', categories: ['outdoor', 'sunset'], tags: ['warm', 'sky'], download_count: 900, thumbnail_url: `${base}/pv/sunset.png` }, studio_fake: { name: 'Fake Studio', categories: ['studio', 'indoor'], tags: ['soft'], download_count: 400, thumbnail_url: `${base}/pv/studio.png` } });
    }
    if (u.pathname.startsWith('/ph/info/')) { const id = u.pathname.split('/').pop(); return send(200, { name: id.replace(/_/g, ' '), categories: ['test'], tags: [] }); }
    if (u.pathname.startsWith('/ph/files/')) {
      const id = u.pathname.split('/').pop();
      if (/brick|wood/.test(id)) return send(200, { Diffuse: { '1k': { jpg: { url: `${base}/ph/dl/${id}_diff_1k.png`, size: 200 } } }, nor_gl: { '1k': { jpg: { url: `${base}/ph/dl/${id}_nor_gl_1k.png`, size: 200 } } }, Rough: { '1k': { jpg: { url: `${base}/ph/dl/${id}_rough_1k.png`, size: 200 } } } });
      if (/chair/.test(id)) return send(200, { gltf: { '1k': { gltf: { url: `${base}/ph/dl/${id}_1k.gltf`, size: parts.gltf.length, include: { 'scene.bin': { url: `${base}/ph/dl/scene.bin`, size: parts.bin.length }, 'textures/diff.png': { url: `${base}/ph/dl/diff.png`, size: parts.tex.length } } } } } });
      return send(200, { hdri: { '1k': { hdr: { url: `${base}/ph/dl/${id}_1k.hdr`, size: 160 } }, '2k': { hdr: { url: `${base}/ph/dl/${id}_2k.hdr`, size: 160 } } } });
    }
    if (u.pathname.startsWith('/ph/dl/')) {
      const f = u.pathname.split('/').pop();
      if (/\.hdr$/.test(f)) return send(200, hdr(), 'application/octet-stream');
      if (/\.gltf$/.test(f)) return send(200, parts.gltf, 'model/gltf+json');
      if (/\.bin$/.test(f)) return send(200, parts.bin, 'application/octet-stream');
      return send(200, png(16, 16, /nor/.test(f) ? [128, 128, 255] : /rough/.test(f) ? [90, 90, 90] : [160, 110, 70]), 'image/png');
    }
    // ---------- ambientCG ----------
    if (u.pathname === '/acg/api/v2/full_json') {
      const type = u.searchParams.get('type'); const q = (u.searchParams.get('q') || '').toLowerCase();
      const mk = (id, name, tags, attrs) => ({ assetId: id, displayName: name, tags, previewImage: { '256-PNG': `${base}/pv/${id}.png` }, downloadFolders: { default: { downloadFiletypeCategories: { zip: { downloads: attrs.map((a) => ({ attribute: a, downloadLink: `${base}/acg/get/${id}_${a}.zip`, fileName: `${id}_${a}.zip`, size: 900 })) } } } } });
      const all = type === 'HDRI' ? [mk('DayEnvironmentHDRI019', 'Day Environment HDRI 019', ['sky', 'day'], ['1K-HDR', '2K-HDR'])] : [mk('Bricks076', 'Bricks 076', ['brick', 'wall'], ['1K-JPG', '1K-PNG', '2K-JPG']), mk('Wood049', 'Wood 049', ['wood', 'planks'], ['1K-JPG', '2K-JPG'])];
      return send(200, { foundAssets: all.filter((a) => !q || `${a.assetId} ${a.displayName} ${a.tags.join(' ')}`.toLowerCase().includes(q)) });
    }
    if (u.pathname.startsWith('/acg/get/')) {
      const f = u.pathname.split('/').pop().replace(/\.zip$/, '');
      const entries = /HDRI/.test(f) ? [[`${f}.hdr`, hdr()]] : [[`${f}_Color.jpg`, png(16, 16, [170, 70, 50])], [`${f}_NormalGL.jpg`, png(16, 16, [128, 128, 255])], [`${f}_Roughness.jpg`, png(16, 16, [100, 100, 100])], [`${f}.usdc`, Buffer.from('usd')]];
      return send(200, zip(entries), 'application/zip');
    }
    return send(404, { error: 'not found' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, log, close: () => new Promise((r) => server.close(r)) });
  }));
}

module.exports = { start, fixtures, glbWithTexture, gltfParts, cube, zip, ttf };
if (require.main === module) {
  if (process.argv[2] === 'fixtures') { console.log(fixtures(process.argv[3] || '/tmp/hearth-asset-fixtures')); } else start(Number(process.argv[2]) || 0).then((s) => console.log(s.base));
}
