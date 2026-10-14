#!/usr/bin/env node
// Render fast (round 41, renderfast): the streamed encode makes the same file as the folder-of-frames encode (real
// ffmpeg: H.264 from JPEG frames, ProRes 4444 from PNG frames with alpha, a GIF loop with its cross-fade), a failed /
// cancelled stream leaves no half file, the stream arguments, and the time-left model (prior from history, the recent
// pace, the encoder's lag).
//   node dev/renderfast-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const C = require('../tools/three-export-core.js');

let n = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

t('streamArgs: image2pipe with the decoder the file list would pick, before the first input only', () => {
  const a = C.args({ format: 'mp4', F: 30, n: 10, input: 'INPUT', w: 320, h: 180, quality: 'high' }).args;
  const s = C.streamArgs(a, 'jpg');
  assert.deepStrictEqual(s.slice(0, 9), ['-y', '-framerate', '30', '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', 'INPUT']);
  assert.strictEqual(s.length, a.length + 4);
  assert.deepStrictEqual(C.streamArgs(a, 'png').slice(5, 7), ['-c:v', 'png']);
  assert.throws(() => C.streamArgs(['-y', '-i', 'x.png'], 'png'));
});
t('time left: primed by past renders per megapixel, then the recent pace (first frame left out)', () => {
  const hist = [{ mpx: 2.07, ms: 400, tail: 100 }, { mpx: 8.29, ms: 1600, tail: 400 }, { mpx: 2.07, ms: 420, tail: 90 }];
  const m = C.etaModel({ total: 100, px: 1920 * 1080, hist });
  assert.ok(Math.abs(m.prior - 400) < 30, m.prior);
  assert.strictEqual(m.left(0), Math.round((100 * m.prior) / 1000)); // known before the first frame
  m.frame(5000); // the first frame (shaders compiling) doesn't count
  for (let i = 0; i < 12; i += 1) m.frame(200);
  assert.ok(Math.abs(m.pace() - 200) < 5, m.pace()); // the measured pace wins after a few frames
  assert.strictEqual(m.left(13), Math.round((87 * m.pace()) / 1000));
  // the encoder still holding frames adds its share; the old way adds its whole encode
  assert.ok(m.left(13, { lag: 10, encMs: 300 }) === Math.round((87 * m.pace() + 3000) / 1000));
  assert.ok(m.left(13, { tail: 100 }) === Math.round((87 * m.pace() + 100 * 100) / 1000));
  const none = C.etaModel({ total: 10 });
  assert.strictEqual(none.left(0), null); // nothing known: no number (never a made-up one)
  none.frame(300); none.frame(300);
  assert.strictEqual(none.left(2), Math.round((8 * 300) / 1000));
});
t('a speed change is followed within a few frames', () => {
  const m = C.etaModel({ total: 60 });
  m.frame(100); for (let i = 0; i < 10; i += 1) m.frame(100);
  for (let i = 0; i < 6; i += 1) m.frame(400);
  assert.ok(m.pace() > 330, m.pace());
});

// ---------- real ffmpeg: the same file both ways ----------
let ff = null;
try { execFileSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'pipe' }); ff = 'ffmpeg'; } catch { /* none here */ }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderfast-'));
const frames = (ext, count, extra = []) => {
  const d = path.join(dir, ext); fs.mkdirSync(d, { recursive: true });
  // a moving test picture (+ alpha for PNG) as numbered frames, like the export page's
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=30:duration=${count / 30}`, ...extra, `${d}/f_%05d.${ext}`]);
  return d;
};
const sendAll = async (rf, id, d, ext) => {
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith(`.${ext}`)).sort()) {
    const r = await rf.write(id, new Uint8Array(fs.readFileSync(path.join(d, f))));
    assert.ok(r.ok, r.error);
  }
};
async function both(fmt, ext, extra, opts = {}) {
  const d = frames(ext, opts.count || 12, extra);
  const rf = require('../renderfastmain.js');
  const a = C.args({ format: fmt, F: 30, n: opts.count || 12, input: 'INPUT', w: 320, h: 180, quality: 'draft', alpha: ext === 'png', loop: opts.loop || null, gifFps: 30 });
  const outA = path.join(dir, `ref-${fmt}.${C.get(fmt).ext}`);
  const outB = path.join(dir, `fast-${fmt}.${C.get(fmt).ext}`);
  // the reference: the numbered files, then ffmpeg (as the old way ran it)
  const ra = spawnSync(ff, a.args.map((x) => (x === 'INPUT' ? `${d}/f_%05d.${ext}` : x === 'OUTPUT' ? outA : x)), { stdio: 'pipe' });
  assert.strictEqual(ra.status, 0, String(ra.stderr).slice(-400));
  const id = `t${fmt}`;
  const o = rf.open({ id, args: C.streamArgs(a.args, ext), output: outB }, { ffmpeg: ff });
  assert.ok(o.ok, o.error);
  await sendAll(rf, id, d, ext);
  const e = await rf.end(id);
  assert.ok(e.ok, e.error);
  const md5 = (p) => execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-i', p, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8' }).split('\n').filter((l) => /^\d/.test(l)).map((l) => l.split(',').pop().trim());
  const [ma, mb] = [md5(outA), md5(outB)];
  assert.ok(ma.length > 0);
  assert.deepStrictEqual(mb, ma, `${fmt}: decoded frames differ`);
  assert.strictEqual(sha(outB), sha(outA), `${fmt}: files differ`);
  return ma.length;
}
if (ff) {
  t('H.264 from JPEG frames: streamed = from files (bytes and every decoded frame)', () => both('mp4', 'jpg', ['-q:v', '2']));
  t('ProRes 4444 from PNG frames with alpha: streamed = from files', () => both('prores', 'png', ['-vf', 'format=rgba,colorchannelmixer=aa=0.6']));
  t('GIF perfect loop (cross-fade): streamed = from files', () => both('gif', 'png', [], { count: 20, loop: { L: 15, X: 5 } }));
  t('a stream ffmpeg refuses says why and leaves no file; a cancelled one leaves none', async () => {
    const rf = require('../renderfastmain.js');
    const out = path.join(dir, 'bad.mp4');
    const o = rf.open({ id: 'bad', args: ['-y', '-f', 'image2pipe', '-c:v', 'png', '-i', 'INPUT', '-c:v', 'nope-codec', 'OUTPUT'], output: out }, { ffmpeg: ff });
    assert.ok(o.ok);
    await rf.write('bad', new Uint8Array(fs.readFileSync(path.join(dir, 'png', fs.readdirSync(path.join(dir, 'png'))[0]))));
    const e = await rf.end('bad');
    assert.ok(!e.ok && /nope-codec|Unknown encoder|encoder/i.test(e.error), e.error);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!fs.existsSync(out));
    const out2 = path.join(dir, 'cancel.mp4');
    const a = C.args({ format: 'mp4', F: 30, n: 100, input: 'INPUT', w: 320, h: 180, quality: 'draft' });
    assert.ok(rf.open({ id: 'c', args: C.streamArgs(a.args, 'jpg'), output: out2 }, { ffmpeg: ff }).ok);
    await rf.write('c', new Uint8Array(fs.readFileSync(path.join(dir, 'jpg', fs.readdirSync(path.join(dir, 'jpg'))[0]))));
    assert.strictEqual(rf.cancel('c'), true);
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(!fs.existsSync(out2), 'half-made file left');
    assert.strictEqual(rf._jobs.size, 0);
    // a file that was already there is never removed
    fs.writeFileSync(out2, 'keep');
    assert.ok(rf.open({ id: 'k', args: ['-y', '-f', 'image2pipe', '-c:v', 'png', '-i', 'INPUT', '-c:v', 'nope-codec', 'OUTPUT'], output: out2 }, { ffmpeg: ff }).ok);
    rf.cancel('k'); await new Promise((r) => setTimeout(r, 600));
    assert.ok(fs.existsSync(out2));
  });
} else console.log('# no ffmpeg here: the real encodes are skipped');

(async () => {
  for (const [name, fn] of tests) { await fn(); n += 1; console.log(`ok ${n} ${name}`); }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${n} passed`);
})().catch((err) => { console.error(err); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
