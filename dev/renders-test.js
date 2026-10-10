// Node tests for renders-core.js (the render queue's model): presets picked from words, per-render choices, every
// preset's ffmpeg arguments run for real on a small test clip (ffprobe checks size, rate, codec, length, sound), the
// Lab sequence plans, paths on Mac and Windows, failures in plain words with a fix, the scheduler (one ffmpeg job at a
// time, the Lab lane, chains, priority, paused jobs), places in line, time left, history.
//   node dev/renders-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require(path.join(__dirname, '..', 'renders-core.js'));
const V = require(path.join(__dirname, '..', 'tools', 'video-data.js'));
let n = 0; let failed = 0;
const ok = async (name, fn) => { n += 1; try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };
const has = (bin) => { try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };

(async () => {
  await ok('presets: every one is complete and the socials exist', () => {
    const ids = R.PRESETS.map((p) => p.id);
    assert.deepStrictEqual(ids, ['vertical', 'story', 'feed45', 'square', 'yt1080', 'yt4k', 'gif', 'webm', 'master', 'audio']);
    for (const p of R.PRESETS) { assert.ok(p.name && p.short && p.group && p.tip, p.id); if (p.base) assert.ok(V.EXPORT_PRESETS.some((x) => x.id === p.base), `${p.id} base`); }
    assert.deepStrictEqual(R.SOCIALS, ['vertical', 'feed45', 'square', 'yt1080']);
  });
  await ok('pick: plain words → presets', () => {
    assert.deepStrictEqual(R.pick('reels square'), ['vertical', 'square']);
    assert.deepStrictEqual(R.pick('tiktok shorts 9:16'), ['vertical']);
    assert.deepStrictEqual(R.pick('all socials'), R.SOCIALS);
    assert.deepStrictEqual(R.pick('socials'), R.SOCIALS);
    assert.deepStrictEqual(R.pick('youtube 4k'), ['yt4k']);
    assert.deepStrictEqual(R.pick('youtube'), ['yt1080']);
    assert.deepStrictEqual(R.pick('gif, webm + prores audio story feed'), ['gif', 'webm', 'master', 'audio', 'story', 'feed45']);
    assert.deepStrictEqual(R.pick('nothing here'), []);
  });
  await ok('resolve: fps, quality and size change the preset; ProRes falls back without its encoder; WebM needs VP9', () => {
    const a = R.resolve('vertical', { fps: 60, quality: 'best', size: 'half' });
    assert.strictEqual(a.fps, 60); assert.strictEqual(a.w, 540); assert.strictEqual(a.h, 960); assert.ok(a.mbps > 0 && a.mbps < 12 * 1.7);
    const d = R.resolve('yt1080', { quality: 'draft' }); assert.ok(d.mbps < 12);
    assert.strictEqual(R.resolve('square', { size: '2/3' }).w, 720);
    const m = R.resolve('master', {}, ['libx264', 'aac']); assert.strictEqual(m.fallback, 'master-h264'); assert.match(m.note, /ProRes/);
    assert.strictEqual(R.resolve('master', {}, ['prores_ks']).codec, 'prores');
    assert.throws(() => R.resolve('webm', {}, ['libx264']), /VP9/);
    assert.throws(() => R.resolve('nope'), /Unknown preset/);
  });
  await ok('buildArgs: placeholders, story cut at 60 s, no-sound sources, audio only', () => {
    const src = { w: 1920, h: 1080, fps: 30, duration: 90, audio: { codec: 'aac' } };
    const v = R.buildArgs(V, 'vertical', src);
    assert.ok(v.args.includes('INPUT') && v.args.at(-1) === 'OUTPUT'); assert.strictEqual(v.ext, 'mp4'); assert.strictEqual(v.w, 1080); assert.strictEqual(v.h, 1920);
    const s = R.buildArgs(V, 'story', src); assert.strictEqual(s.duration, 60); assert.ok(s.args.includes('-t'));
    const mute = R.buildArgs(V, 'square', { ...src, audio: null }); assert.ok(mute.args.includes('-an'));
    const a = R.buildArgs(V, 'audio', src); assert.strictEqual(a.ext, 'm4a'); assert.ok(a.args.includes('-vn'));
    assert.strictEqual(R.buildArgs(V, 'audio', src, { quality: 'best' }).ext, 'wav');
    assert.throws(() => R.buildArgs(V, 'audio', { ...src, audio: null }), /no sound/);
    const loop = R.buildArgs(V, 'gif', src, { from: 2, to: 5 }); assert.strictEqual(loop.duration, 3); assert.strictEqual(loop.ext, 'gif');
    const fb = R.buildArgs(V, 'master', src, { encoders: ['libx264'] }); assert.ok(fb.args.includes('-crf') && !fb.args.includes('-maxrate')); assert.strictEqual(fb.ext, 'mp4');
  });
  await ok('seqPlan: social shapes render at their own pixels; GIF / WebM / ProRes / audio / 4K / Story convert after', () => {
    assert.deepStrictEqual(R.seqPlan('square'), { format: '1:1', fps: 30, crf: 18, then: null });
    assert.strictEqual(R.seqPlan('vertical', { quality: 'draft' }).crf, 24);
    assert.strictEqual(R.seqPlan('gif', { own: '16:9' }).then, 'gif'); assert.strictEqual(R.seqPlan('gif', { own: '16:9' }).format, '16:9');
    assert.strictEqual(R.seqPlan('yt4k').then, 'yt4k'); assert.strictEqual(R.seqPlan('yt4k').format, '16:9');
    assert.strictEqual(R.seqPlan('story').then, 'story');
    assert.strictEqual(R.seqPlan('master').crf, 14);
  });
  await ok('paths: next to the source in "exports", Mac and Windows separators, free names, the reveal label', async () => {
    const p = R.resolve('vertical');
    assert.strictEqual(R.outPath('/Users/me/Movies/clip.mov', p, 1080, 1920, 'mp4'), '/Users/me/Movies/exports/clip_vertical_1080x1920.mp4');
    assert.strictEqual(R.outPath('C:\\Users\\me\\Videos\\clip.mov', p, 1080, 1920, 'mp4'), 'C:\\Users\\me\\Videos\\exports\\clip_vertical_1080x1920.mp4');
    assert.strictEqual(R.outPath('/a/b.mp4', p, 0, 0, 'gif', 'Rose Bloom · b'), '/a/exports/Rose Bloom · b_vertical.gif');
    assert.strictEqual(R.safe('a:b/c*?'), 'a_b_c_');
    const taken = new Set(['/x/a.mp4', '/x/a (2).mp4']);
    assert.strictEqual(await R.nextFree('/x/a.mp4', async (q) => taken.has(q)), '/x/a (3).mp4');
    assert.strictEqual(await R.nextFree('/x/new.mp4', async (q) => taken.has(q)), '/x/new.mp4');
    assert.strictEqual(R.revealLabel('darwin'), 'Reveal in Finder'); assert.strictEqual(R.revealLabel('win32'), 'Show in Explorer'); assert.strictEqual(R.revealLabel('linux'), 'Show in folder');
    assert.strictEqual(R.base('C:\\a\\b.mp4'), 'b.mp4'); assert.strictEqual(R.dirOf('C:\\a\\b.mp4'), 'C:\\a');
  });
  await ok('explain: failures in plain words, a fix for each, the platform\'s own way', () => {
    const cases = [
      ['File not found: /x/y.mp4', /isn't there/], ['/a/b.mp4: No such file or directory', /isn't there/], ['No space left on device', /disk is full/],
      ['/a/out.mp4: Permission denied', /allowed to write/], ['Unknown encoder \'prores_ks\'', /can't make that format/], ['moov atom not found', /damaged/],
      ['Stream map \'0:a:0\' matches no streams.', /nothing of what/], ['height not divisible by 2 (1080x1351)', /odd/], ['Frame 12: The preview stopped answering', /Lab preview stopped/],
      ['ffmpeg isn\'t installed. Install ffmpeg with Homebrew: brew install ffmpeg', /ffmpeg isn't installed/], ['The sequence is empty', /nothing in it/],
    ];
    for (const [text, re] of cases) { const e = R.explain(text, 'darwin'); assert.match(e.reason, re, text); assert.ok(e.fix && e.fix.length > 10, text); }
    assert.match(R.explain('No space left on device', 'darwin').fix, /Trash/); assert.match(R.explain('No space left on device', 'win32').fix, /Recycle Bin/);
    assert.match(R.explain('Permission denied', 'darwin').fix, /Privacy & Security/); assert.match(R.explain('Permission denied', 'win32').fix, /Controlled folder access/);
    assert.match(R.explain('Unknown encoder', 'win32').fix, /winget/);
    const other = R.explain('Something odd\nError: weird thing happened'); assert.match(other.reason, /weird thing happened/); assert.ok(other.fix);
    assert.match(R.explain('').reason, /without saying/);
  });
  await ok('schedule: one ffmpeg job at a time, the Lab lane apart, recordings never wait, chains, priority, paused', () => {
    const J = (id, o = {}) => ({ id, status: 'queued', created: Number(id.replace(/\D/g, '')) || 0, ...o });
    let jobs = [J('a1'), J('b2'), J('s3', { kind: 'seq' }), J('r4', { kind: 'record' })];
    assert.deepStrictEqual(R.schedule(jobs), ['a1', 's3', 'r4']);
    jobs[0].status = 'running';
    assert.deepStrictEqual(R.schedule(jobs), ['s3', 'r4']);
    assert.deepStrictEqual(R.schedule(jobs, { ffmpeg: 2 }), ['b2', 's3', 'r4']);
    jobs = [J('a1', { status: 'paused', held: true }), J('b2')];
    assert.deepStrictEqual(R.schedule(jobs), [], 'a suspended job keeps its slot');
    jobs = [J('a1', { status: 'paused' }), J('b2')];
    assert.deepStrictEqual(R.schedule(jobs), ['b2'], 'a job paused while waiting gives way');
    jobs = [J('s1', { kind: 'seq', status: 'running' }), J('c2', { after: 's1' }), J('d3')];
    assert.deepStrictEqual(R.schedule(jobs), ['d3'], 'a chain waits for its first step');
    jobs[0].status = 'done';
    assert.deepStrictEqual(R.schedule(jobs), ['c2']);
    jobs = [J('a1'), J('b2', { prio: 5 })];
    assert.deepStrictEqual(R.schedule(jobs), ['b2'], 'next in line first');
    assert.strictEqual(R.place(jobs, 'a1'), 2); assert.strictEqual(R.place(jobs, 'b2'), 1);
  });
  await ok('eta: from the measured rate, paused time left out; words', () => {
    const t = 1e6;
    assert.strictEqual(R.eta({ status: 'running', pct: 2, started: t - 10000 }, t), null);
    assert.strictEqual(R.eta({ status: 'running', pct: 50, started: t - 1000 }, t), null);
    assert.strictEqual(R.eta({ status: 'running', pct: 25, started: t - 10000 }, t), 30);
    assert.strictEqual(R.eta({ status: 'running', pct: 25, started: t - 20000, pausedMs: 10000 }, t), 30);
    assert.strictEqual(R.fmtEta(30), 'about 30 s left'); assert.strictEqual(R.fmtEta(200), 'about 3 min left');
    assert.strictEqual(R.fmtSize(4.2e6), '4.2 MB'); assert.strictEqual(R.fmtSize(2.5e9), '2.50 GB'); assert.strictEqual(R.fmtSecs(75), '1 min 15 s');
    assert.strictEqual(R.fmtAgo(t - 120000, t), '2 min ago');
  });
  await ok('history: newest first, one per id, capped', () => {
    let h = [];
    for (let i = 0; i < 130; i += 1) h = R.remember(h, { id: `j${i % 125}`, i });
    assert.strictEqual(h.length, 120); assert.strictEqual(h[0].id, 'j4'); assert.strictEqual(new Set(h.map((x) => x.id)).size, 120);
  });
  if (!has('ffmpeg') || !has('ffprobe')) { console.log('skip: ffmpeg / ffprobe not installed (the real renders)'); } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-renders-'));
    const src = path.join(dir, 'clip.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
    const encs = String(execFileSync('ffmpeg', ['-hide_banner', '-encoders'])).match(/^\s*[VAS][.\w]{5}\s+(\S+)/gm).map((l) => l.trim().split(/\s+/)[1]);
    const probe = (f) => JSON.parse(String(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f])));
    const info = { w: 640, h: 360, fps: 30, duration: 2, audio: { codec: 'aac' } };
    for (const id of R.PRESETS.map((p) => p.id)) {
      if (id === 'webm' && !encs.includes('libvpx-vp9')) continue;
      await ok(`real render: ${id}`, () => {
        const opts = { encoders: encs, quality: 'draft', size: id === 'yt4k' ? 'half' : 'full' };
        const r = R.buildArgs(V, id, info, opts);
        const out = R.outPath(src, r.preset, r.w, r.h, r.ext);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        execFileSync('ffmpeg', r.args.map((a) => (a === 'INPUT' ? src : a === 'OUTPUT' ? out : a)), { stdio: ['ignore', 'ignore', 'pipe'] });
        const j = probe(out);
        const v = j.streams.find((s) => s.codec_type === 'video'); const a = j.streams.find((s) => s.codec_type === 'audio');
        if (id === 'audio') { assert.ok(!v && a, 'sound only'); return; }
        assert.ok(v, 'a picture');
        if (r.w && r.h) { assert.strictEqual(v.width, r.w); assert.strictEqual(v.height, r.h); }
        if (id === 'gif') { assert.strictEqual(v.codec_name, 'gif'); assert.strictEqual(v.width, 720); return; }
        if (id === 'master') assert.ok(/prores|h264/.test(v.codec_name), v.codec_name);
        if (id === 'webm') assert.strictEqual(v.codec_name, 'vp9');
        assert.ok(a, 'with its sound');
        assert.ok(Math.abs(Number(j.format.duration) - 2) < 0.2, `length ${j.format.duration}`);
      });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `FAIL ${failed} of ${n}` : `all ${n} passed`);
  process.exit(failed ? 1 : 0);
})();
