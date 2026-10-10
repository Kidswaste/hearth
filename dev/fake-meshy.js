#!/usr/bin/env node
// A fake Meshy API + Poly Haven API + test web pages for the apps checks (round 14). Nothing real is reached.
//   node dev/fake-meshy.js [port]                  # serves until killed, prints its base URL
//   require('./fake-meshy').start(port?) → Promise<{ base, server, log, close }>   (dev/smoke.js --fake-meshy, unit test)
// Meshy (same shapes as api.meshy.ai): POST /openapi/v2/text-to-3d (preview | refine), POST /openapi/v1/image-to-3d,
// /retexture, /remesh → { result: id }; GET <same>/<id> → a task whose progress moves 0 → 40 → 80 → 100 per poll;
// GET /openapi/v1/balance. Keys: "Bearer bad…" → 401, "nocredits…" → 402; a prompt with "fail" fails.
// model_urls.glb → a real tiny GLB (one triangle), thumbnail_url → a tiny PNG.
// Poly Haven under /ph: /ph/assets?t=hdris|textures, /ph/files/<id>, /ph/dl/<file> (a 4×2 Radiance .hdr, a JPEG).
// Web pages under /web: suno (Title / Style / Lyrics boxes + a song download), simple (one description box),
// meshy (a .glb download), coolors/<hex-hex-…>, plain. GET /__log lists every API request (no keys in it).
const http = require('http');
const zlib = require('zlib');

function glb() {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = Buffer.from(pos.buffer);
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0', generator: 'hearth fake-meshy' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'fake' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  }));
  const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
  const j = pad(json, 0x20); const b = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const ch = (len, type) => { const x = Buffer.alloc(8); x.writeUInt32LE(len, 0); x.writeUInt32LE(type, 4); return x; };
  return Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(b.length, 0x004e4942), b]);
}
function png(w = 8, h = 6, rgb = [230, 180, 80]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = (rgb[1] + y * 10) & 255; raw[o + 2] = rgb[2]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function hdr() { // a 4×2 Radiance file, flat (uncompressed) scanlines
  const head = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n');
  const px = Buffer.alloc(4 * 2 * 4);
  for (let i = 0; i < 8; i++) px.set([200, 160, 100 + i * 10, 128], i * 4);
  return Buffer.concat([head, px]);
}
function wav(seconds = 1, rate = 8000) {
  const n = seconds * rate; const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 220) * 8000), 44 + i * 2);
  return b;
}

const PAGES = {
  suno: `<!doctype html><title>Create · Fake Suno</title><h1>Create</h1>
<label>Song title <input id="t" placeholder="Song title"></label><br>
<textarea id="s" placeholder="Style of Music" rows="3" cols="60"></textarea><br>
<textarea id="l" placeholder="Lyrics" rows="8" cols="60"></textarea><br>
<a id="dl" href="/web/files/fake-suno-song.wav" download>Download</a> <a href="/web/files/fake-clip.png" download>Cover</a>`,
  simple: '<!doctype html><title>Simple</title><textarea placeholder="Song description" rows="4" cols="60"></textarea>',
  meshy: '<!doctype html><title>Workspace · Fake Meshy</title><h1>Your models</h1><a id="dl" href="/web/files/fake-robot.glb" download>Download GLB</a>',
  plain: '<!doctype html><title>Plain page</title><p id="p">Some text to select</p><a href="https://example.com/out" target="_blank">out</a>',
  coolors: '<!doctype html><title>Palette · Fake Coolors</title><p>palette</p>',
};

function start(port = 0) {
  const tasks = new Map(); // id → { kind, polls, body, fail }
  const log = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', ...extra }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 30e6) req.destroy(); });
    req.on('end', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      // ---------- web pages and files ----------
      if (u.pathname === '/__log') return send(200, log);
      if (u.pathname.startsWith('/web/files/')) {
        const name = u.pathname.split('/').pop();
        const body = /\.glb$/.test(name) ? glb() : /\.wav$/.test(name) ? wav() : png();
        return send(200, body, /\.glb$/.test(name) ? 'model/gltf-binary' : /\.wav$/.test(name) ? 'audio/wav' : 'image/png', { 'Content-Disposition': `attachment; filename="${name}"` });
      }
      if (u.pathname.startsWith('/web/coolors/')) return send(200, PAGES.coolors, 'text/html');
      if (u.pathname.startsWith('/web/')) return send(200, PAGES[u.pathname.slice(5)] || PAGES.plain, 'text/html');
      // ---------- Poly Haven ----------
      if (u.pathname === '/ph/assets') {
        const t = u.searchParams.get('t');
        return send(200, t === 'textures'
          ? { brick_wall_02: { name: 'Brick Wall 02', categories: ['brick', 'wall'], tags: ['red'], download_count: 50, thumbnail_url: `${base}/web/files/brick.png` } }
          : { sunset_fake: { name: 'Fake Sunset', categories: ['outdoor', 'sunset'], tags: ['warm', 'sky'], download_count: 900, thumbnail_url: `${base}/web/files/sunset.png` }, studio_fake: { name: 'Fake Studio', categories: ['studio', 'indoor'], tags: ['soft'], download_count: 400 } });
      }
      if (u.pathname.startsWith('/ph/files/')) {
        const id = u.pathname.split('/').pop();
        if (/brick/.test(id)) return send(200, { Diffuse: { '1k': { jpg: { url: `${base}/ph/dl/${id}_diff_1k.png` } } } });
        return send(200, { hdri: { '1k': { hdr: { url: `${base}/ph/dl/${id}_1k.hdr`, size: 160 } }, '2k': { hdr: { url: `${base}/ph/dl/${id}_2k.hdr`, size: 160 } } } });
      }
      if (u.pathname.startsWith('/ph/dl/')) return /\.hdr$/.test(u.pathname) ? send(200, hdr(), 'application/octet-stream') : send(200, png(), 'image/png');
      if (u.pathname.startsWith('/files/')) return /\.glb$/.test(u.pathname) ? send(200, glb(), 'model/gltf-binary') : send(200, png(), 'image/png');
      // ---------- Meshy ----------
      const auth = String(req.headers.authorization || '');
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      log.push({ method: req.method, path: u.pathname, mode: body?.mode || null, prompt: body?.prompt || body?.text_style_prompt || null, image: body?.image_url ? String(body.image_url).slice(0, 22) : null, input: body?.input_task_id || null, auth: /^Bearer \S{8,}/.test(auth) });
      if (!/^Bearer \S/.test(auth)) return send(401, { message: 'Invalid API key' });
      if (/^Bearer bad/.test(auth)) return send(401, { message: 'Invalid API key' });
      if (u.pathname === '/openapi/v1/balance') return send(200, { balance: /nocredits/.test(auth) ? 0 : 1234 });
      const m = u.pathname.match(/^\/openapi\/v[12]\/(text-to-3d|image-to-3d|retexture|remesh)(?:\/([\w-]+))?$/);
      if (!m) return send(404, { message: 'Not found' });
      const [, kind, id] = m;
      if (req.method === 'POST') {
        if (/nocredits/.test(auth)) return send(402, { message: 'Insufficient credits' });
        if (kind === 'text-to-3d' && body?.mode === 'preview' && !body.prompt) return send(400, { message: 'prompt is required' });
        if (kind === 'text-to-3d' && body?.mode === 'refine' && !tasks.has(body.preview_task_id)) return send(400, { message: 'preview task not found' });
        if (kind === 'image-to-3d' && !/^(data:image\/|https?:)/.test(body?.image_url || '')) return send(400, { message: 'image_url must be a URL or a data URI' });
        const tid = `fake-${kind}-${++n}`;
        tasks.set(tid, { kind, polls: 0, body, fail: /fail/i.test(body?.prompt || '') });
        return send(202, { result: tid });
      }
      if (req.method === 'GET' && id) {
        const t = tasks.get(id);
        if (!t || t.kind !== kind) return send(404, { message: 'Task not found' });
        t.polls += 1;
        const progress = Math.min(100, (t.polls - 1) * 40);
        const done = progress >= 100;
        return send(200, {
          id, status: t.fail && t.polls > 2 ? 'FAILED' : done ? 'SUCCEEDED' : t.polls === 1 ? 'PENDING' : 'IN_PROGRESS', progress: t.fail && t.polls > 2 ? 0 : progress,
          preceding_tasks: t.polls === 1 ? 2 : 0, prompt: t.body?.prompt || '', art_style: t.body?.art_style || 'realistic',
          model_urls: done ? { glb: `${base}/files/${id}.glb`, fbx: `${base}/files/${id}.fbx` } : {}, thumbnail_url: done ? `${base}/files/${id}.png` : '',
          task_error: t.fail && t.polls > 2 ? { message: 'The fake server failed this one on purpose' } : { message: '' },
        });
      }
      return send(405, { message: 'Method not allowed' });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, server, log, close: () => new Promise((r) => server.close(r)) });
  }));
}

module.exports = { start, glb, png, hdr, wav };
if (require.main === module) start(Number(process.argv[2]) || 0).then(({ base }) => console.log(`fake Meshy / Poly Haven / pages at ${base}`));
