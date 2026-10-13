// Node tests for Ready to post (round 27, publishkit-core.js + publishmain.js): the platforms, the platform guess,
// every check (shape, pixels, length limit, frame rate, bitrate, codec, sound, loudness, detail under the app's
// buttons, the loop), the verdict, the picture measures on made-up frames, cover picks, the words (prompt, lenient
// parsing, plain-words draft, hashtags, caption order and limits, the post's text file, folder names), and with
// ffmpeg: a tiny generated video measured by publishmain.analyze, and the fixes' ffmpeg arguments run for real
// (the loudness evened out, the loop blend, the cut).
//   node dev/publishkit-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require(path.join(__dirname, '..', 'publishkit-core.js'));
let n = 0; let failed = 0;
const ok = async (name, fn) => { n += 1; try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };
const has = (bin) => { try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const lv = (list, id) => list.find((c) => c.id === id)?.level;
const V916 = { w: 1080, h: 1920, fps: 30, duration: 20, bitrate: 10e6, codec: 'h264', pixFmt: 'yuv420p', audio: { codec: 'aac' } };

(async () => {
  await ok('platforms: five, each complete, zones inside the frame', () => {
    assert.deepStrictEqual(P.PLATFORMS.map((p) => p.id), ['shorts', 'tiktok', 'reels', 'youtube', 'square']);
    for (const p of P.PLATFORMS) {
      assert.ok(p.name && p.short && p.icon && p.w && p.h && p.maxLen && p.mbps.length === 2 && p.lufs && p.preset && p.cover.w && p.cover.note && p.tip, p.id);
      for (const z of p.zones) assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= 1.0001 && z.y + z.h <= 1.0001 && z.label, `${p.id} ${z.id}`);
    }
    assert.strictEqual(P.get('shorts').maxLen, 180); assert.strictEqual(P.get('tiktok').maxLen, 600); assert.strictEqual(P.get('youtube').cover.w, 1280);
  });
  await ok('guess: words first, then the shape, then the last one used', () => {
    assert.strictEqual(P.guess({}, 'for TikTok please'), 'tiktok');
    assert.strictEqual(P.guess({}, 'instagram reel'), 'reels');
    assert.strictEqual(P.guess({}, 'square for insta'), 'square');
    assert.strictEqual(P.guess({ w: 1920, h: 1080 }, ''), 'youtube');
    assert.strictEqual(P.guess({ w: 1080, h: 1080 }, ''), 'square');
    assert.strictEqual(P.guess({ w: 1080, h: 1920 }, ''), 'shorts');
    assert.strictEqual(P.guess({ w: 1080, h: 1920 }, '', 'reels'), 'reels');
    assert.strictEqual(P.guess({ w: 1920, h: 1080 }, '', 'reels'), 'youtube'); // the last one doesn't fit this shape
  });
  await ok('check: a good 9:16 video passes for Shorts', () => {
    const c = P.check('shorts', V916, { loud: { integrated: -14.3, truePeak: -1.6 }, under: [], seam: { seamless: true } });
    assert.ok(c.every((x) => x.level === 'ok'), JSON.stringify(c.filter((x) => x.level !== 'ok')));
    assert.strictEqual(P.verdict(c).state, 'ready');
  });
  await ok('check: landscape for Shorts is bad with a 9:16 render fix; 16:9 is fine for YouTube', () => {
    const c = P.check('shorts', { ...V916, w: 1920, h: 1080 }, {});
    assert.strictEqual(lv(c, 'shape'), 'bad'); assert.deepStrictEqual(c.find((x) => x.id === 'shape').fix.preset, 'vertical');
    assert.strictEqual(P.verdict(c).state, 'fix');
    assert.strictEqual(lv(P.check('youtube', { ...V916, w: 1920, h: 1080 }, {}), 'shape'), 'ok');
    assert.strictEqual(lv(P.check('square', { ...V916 }, {}), 'shape'), 'warn');
  });
  await ok('check: length over the limit is bad with a cut; very short warns; long YouTube says verified', () => {
    const c = P.check('reels', { ...V916, duration: 200 }, {});
    const l = c.find((x) => x.id === 'length'); assert.strictEqual(l.level, 'bad'); assert.deepStrictEqual(l.fix, { kind: 'trim', to: 180, label: 'Cut to 3:00' });
    assert.strictEqual(lv(P.check('tiktok', { ...V916, duration: 2 }, {}), 'length'), 'warn');
    assert.match(P.check('youtube', { ...V916, w: 1920, h: 1080, duration: 1200 }, {}).find((x) => x.id === 'length').what, /verified/);
    assert.strictEqual(lv(P.check('shorts', { ...V916, duration: 120 }, {}), 'length'), 'tip');
  });
  await ok('check: pixels, frame rate, bitrate, codec, pixel format, no sound', () => {
    assert.strictEqual(lv(P.check('shorts', { ...V916, w: 540, h: 960 }, {}), 'pixels'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, fps: 120 }, {}), 'fps'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, fps: 15 }, {}), 'fps'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, bitrate: 1.5e6 }, {}), 'bitrate'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, bitrate: 90e6 }, {}), 'bitrate'), 'tip');
    assert.strictEqual(lv(P.check('shorts', { ...V916, w: 540, h: 960, bitrate: 2.5e6 }, {}), 'bitrate'), 'ok'); // a smaller frame needs fewer bits
    assert.strictEqual(lv(P.check('shorts', { ...V916, codec: 'prores' }, {}), 'codec'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, pixFmt: 'yuv444p' }, {}), 'codec'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, audio: null }, {}), 'sound'), 'warn');
    assert.strictEqual(lv(P.check('shorts', { ...V916, bitrate: null, size: 25e6 }, {}), 'bitrate'), 'ok'); // from size / length
  });
  await ok('check: loudness too loud / too quiet / hot peaks / fine, each with the right fix', () => {
    const L = (integrated, truePeak) => P.check('tiktok', V916, { loud: { integrated, truePeak } }).find((x) => x.id === 'loud');
    assert.strictEqual(L(-6, -0.5).level, 'warn'); assert.strictEqual(L(-6, -0.5).fix.kind, 'loudness'); assert.match(L(-6, -0.5).what, /loud/);
    assert.match(L(-24, -6).what, /quiet/);
    assert.match(L(-14, 0.4).what, /Peaks/);
    assert.strictEqual(L(-13, -1.5).level, 'ok');
    assert.strictEqual(lv(P.check('tiktok', V916, {}), 'loud'), 'tip'); // not measured
  });
  await ok('check: detail under the buttons (per platform zones) and the loop (only where it loops)', () => {
    const c = P.check('shorts', V916, { under: [{ id: 'bottom' }, { id: 'nope' }] });
    assert.strictEqual(lv(c, 'under-bottom'), 'warn'); assert.ok(!c.some((x) => x.id === 'under'));
    assert.strictEqual(lv(P.check('shorts', V916, { under: [] }), 'under'), 'ok');
    const loop = P.check('reels', V916, { seam: { seamless: false } }).find((x) => x.id === 'loop');
    assert.strictEqual(loop.level, 'tip'); assert.strictEqual(loop.fix.kind, 'loop');
    assert.ok(!P.check('youtube', { ...V916, w: 1920, h: 1080 }, { seam: { seamless: false } }).some((x) => x.id === 'loop'));
    assert.strictEqual(P.sortChecks(c)[0].level, 'warn');
  });
  await ok('frameStats / diff: flat vs edges, dark vs bright', () => {
    const w = 32; const h = 32;
    const flat = new Uint8Array(w * h).fill(128);
    const stripes = Uint8Array.from({ length: w * h }, (_, i) => ((i % w) % 2 ? 255 : 0));
    const a = P.frameStats(flat, w, h); const b = P.frameStats(stripes, w, h);
    assert.strictEqual(a.sharp, 0); assert.ok(b.sharp > 0.5); assert.ok(Math.abs(a.luma - 0.502) < 0.01); assert.strictEqual(a.contrast, 0); assert.ok(b.contrast > 0.45);
    assert.strictEqual(P.diff(flat, flat), 0); assert.ok(Math.abs(P.diff(flat, new Uint8Array(w * h)) - 128 / 255) < 1e-9);
  });
  await ok('underUI: text in the bottom band is found for Shorts, a centered subject isn\'t flagged', () => {
    const w = 72; const h = 128;
    const frame = (fn) => Uint8Array.from({ length: w * h }, (_, i) => fn(i % w, Math.floor(i / w)));
    const text = frame((x, y) => (y > h * 0.84 && y < h * 0.92 && x > 5 && x < 50 && (x + y) % 3 === 0 ? 255 : 30));
    const center = frame((x, y) => ((x - 36) ** 2 + (y - 60) ** 2 < 400 ? 230 : 20));
    let heat = null; for (let i = 0; i < 3; i += 1) heat = P.heatAdd(heat, text, w, h);
    assert.deepStrictEqual(P.underUI(heat, P.get('shorts').zones).map((u) => u.id), ['bottom']);
    let heat2 = null; heat2 = P.heatAdd(heat2, center, w, h);
    assert.deepStrictEqual(P.underUI(heat2, P.get('shorts').zones), []);
    assert.deepStrictEqual(P.underUI(null, P.get('shorts').zones), []);
  });
  await ok('zonesFor: zones mapped into the video when the shapes differ (crop for vertical apps, bars for the others)', () => {
    assert.deepStrictEqual(P.zonesFor('shorts', 9 / 16), P.get('shorts').zones);
    const wide = P.zonesFor('shorts', 1); // a square video cropped to 9:16: the zones cover the middle 56 %
    const b = wide.find((z) => z.id === 'bottom'); assert.ok(Math.abs(b.x - 0.219) < 0.01 && Math.abs(b.w - 0.473) < 0.01 && b.y === 0.78, JSON.stringify(b));
    const yt = P.zonesFor('youtube', 9 / 16); // a 9:16 video letterboxed in 16:9: the bottom bar crosses its whole width
    const yb = yt.find((z) => z.id === 'bottom'); assert.ok(yb.x === 0 && yb.w === 1 && yb.y > 0.85, JSON.stringify(yb));
    assert.ok(!yt.some((z) => z.id === 'stamp')); // the stamp sits on the bars, not the picture
    assert.strictEqual(P.fitOf(P.get('reels')), 'cover'); assert.strictEqual(P.fitOf(P.get('square')), 'contain');
  });
  await ok('seam: same frames loop, different ones jump (against the usual motion)', () => {
    const a = new Uint8Array(100).fill(100); const b = new Uint8Array(100).fill(180);
    assert.strictEqual(P.seam(a, a, 0.01).seamless, true);
    assert.strictEqual(P.seam(a, b, 0.01).seamless, false);
    assert.strictEqual(P.seam(a, b, 0.2).seamless, true); // a busy video: a big change is normal
    assert.strictEqual(P.seam(null, a), null);
  });
  await ok('pickCovers: sharp, lit, strong moments first; spread out; not the very start / end', () => {
    const s = [];
    for (let i = 0; i < 40; i += 1) s.push({ t: i * 0.5, luma: i === 10 ? 0.02 : 0.5, contrast: 0.2, sharp: i === 22 ? 0.3 : 0.1, motion: i === 30 ? 0.08 : 0.01, sat: 0.5 });
    const c = P.pickCovers(s, 20, 5);
    assert.strictEqual(c[0].t, 11); assert.ok(c[0].why.includes('sharp'));
    assert.ok(c.some((x) => x.t === 15));
    assert.ok(!c.some((x) => x.t === 5)); // the black frame
    assert.ok(!c.some((x) => x.t < 0.6)); // not the first 3 %
    for (const x of c) for (const y of c) if (x !== y) assert.ok(Math.abs(x.t - y.t) >= 20 / 8 - 1e-9);
    assert.deepStrictEqual(P.pickCovers([], 10), []);
  });
  await ok('words: prompt is lean and names the platform; replies parse leniently', () => {
    const q = P.draftPrompt({ song: 'Ember Tide', scene: 'orb rings', duration: 22, hint: 'for tiktok' }, 'tiktok');
    assert.match(q, /TikTok/); assert.match(q, /Song: Ember Tide/); assert.match(q, /^TITLE: </m); assert.match(q, /^HASHTAGS: </m); assert.ok(q.length < 900);
    const a = P.parseDraft('TITLE: "Ember Tide"\nDESCRIPTION: Rings that breathe.\nSecond line.\nHASHTAGS: #Lo-Fi, #threejs #threejs visualizer');
    assert.strictEqual(a.title, 'Ember Tide'); assert.strictEqual(a.description, 'Rings that breathe.\nSecond line.'); assert.deepStrictEqual(a.hashtags, ['#lofi', '#threejs', '#visualizer']);
    const b = P.parseDraft('**Title:** Neon Drift\n**Caption:** Glow on every kick #neon #loop');
    assert.strictEqual(b.title, 'Neon Drift'); assert.strictEqual(b.description, 'Glow on every kick'); assert.deepStrictEqual(b.hashtags, ['#neon', '#loop']);
    const c = P.parseDraft('Neon Drift\nGlow on every kick.\n#neon #loop');
    assert.strictEqual(c.title, 'Neon Drift'); assert.deepStrictEqual(c.hashtags, ['#neon', '#loop']);
  });
  await ok('words: plain-words draft, hashtags cleaned, caption order and limits per platform', () => {
    const d = P.localDraft({ song: 'Ember Tide', scene: 'Orb rings' }, 'shorts');
    assert.match(d.title, /Ember Tide/); assert.ok(d.hashtags.includes('#shorts') && d.hashtags.includes('#musicvisualizer'));
    assert.deepStrictEqual(P.cleanTags('#Café, 2024 #a_b #a_b café'), ['#cafe', '#a_b']);
    const yt = P.caption({ title: 'T'.repeat(130), description: 'Desc', hashtags: ['#x'] }, 'shorts');
    assert.strictEqual(yt.title.length, 100); assert.match(yt.text, /Desc\n\n#x #shorts/);
    const tt = P.caption({ title: 'Hook', description: 'Desc', hashtags: ['#x'] }, 'tiktok');
    assert.strictEqual(tt.title, ''); assert.strictEqual(tt.text, 'Hook\n\nDesc\n\n#x'); assert.strictEqual(tt.all, tt.text);
    assert.ok(P.caption({ title: 'x', description: 'y'.repeat(3000) }, 'reels').text.length <= 2200);
  });
  await ok('post text file and folder names: what to paste, the checks, never uploads; safe names', () => {
    const t = P.postText({ draft: { title: 'Neon', description: 'D', hashtags: ['#a'] }, platformId: 'youtube', video: 'Neon.mp4', cover: 'thumbnail.jpg', checks: [{ id: 'x', level: 'ok', what: 'fine' }, { id: 'y', level: 'warn', what: 'loud' }], at: new Date('2026-10-13T10:00:00Z') });
    assert.match(t, /^YouTube 16:9 · ready to post\n2026-10-13/); assert.match(t, /TITLE\nNeon/); assert.match(t, /! loud\n✓ fine/); assert.match(t, /never uploads/); assert.ok(!/\n\n\n/.test(t));
    assert.match(P.postText({ draft: { title: 'Neon' }, platformId: 'tiktok' }), /CAPTION\nNeon/);
    assert.strictEqual(P.folderName('a/b: c?*', 'reels', new Date('2026-10-13T10:00:00Z')), '2026-10-13 a b c (Reels)');
    assert.strictEqual(P.safeName('...'), 'post'); assert.strictEqual(P.safeName('trailing. '), 'trailing');
  });
  await ok('fix arguments: placeholders, loop shortens by the blend, too short refuses', () => {
    const l = P.loopArgs(10, { audio: true });
    assert.strictEqual(l.fade, 1); assert.strictEqual(l.duration, 9); assert.ok(l.args.includes('INPUT') && l.args.at(-1) === 'OUTPUT');
    assert.match(l.args[l.args.indexOf('-filter_complex') + 1], /xfade=transition=fade:duration=1:offset=8/);
    assert.ok(!P.loopArgs(4, { audio: false }).args.join(' ').includes('acrossfade'));
    assert.throws(() => P.loopArgs(0.5), /Too short/);
    assert.ok(P.loudArgs(-14).join(' ').includes('loudnorm=I=-14:TP=-1') && P.loudArgs().includes('copy'));
    assert.strictEqual(P.trimArgs(180)[P.trimArgs(180).indexOf('-t') + 1], '180');
  });

  // ---------- with ffmpeg: a tiny video, measured and fixed for real ----------
  if (!has('ffmpeg') || !has('ffprobe')) { console.log('(no ffmpeg: the real-video tests are skipped)'); } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-pk-'));
    const src = path.join(dir, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=180x320:rate=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
    const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f], { encoding: 'utf8' }));
    const run = (args, out) => execFileSync('ffmpeg', args.map((a) => (a === 'INPUT' ? src : a === 'OUTPUT' ? out : a)), { stdio: ['ignore', 'ignore', 'pipe'] });
    await ok('publishmain.analyze: probe, loudness, samples, heat, seam and cover pictures of a real video', async () => {
      const M = require(path.join(__dirname, '..', 'publishmain.js'));
      const r = await M.analyze(src, {});
      assert.ok(r.ok); assert.strictEqual(r.info.w, 180); assert.strictEqual(r.info.h, 320); assert.ok(Math.abs(r.info.duration - 4) < 0.1);
      assert.ok(r.loud && Number.isFinite(r.loud.integrated), JSON.stringify(r.loud));
      assert.ok(r.samples.length >= 6 && r.samples.every((s) => s.sharp > 0 && s.luma > 0));
      assert.ok(r.heat.w === 72 && r.heat.data.length === r.heat.w * r.heat.h && r.heat.n >= r.samples.length);
      assert.ok(r.seam && typeof r.seam.seamless === 'boolean');
      assert.ok(r.covers.length >= 3 && r.covers.every((c) => c.path && fs.existsSync(c.path)), JSON.stringify(r.covers));
      const checks = P.check(P.guess(r.info), r.info, { loud: r.loud, seam: r.seam, under: P.underUI({ ...r.heat, data: Float32Array.from(r.heat.data) }, P.get('shorts').zones) });
      assert.strictEqual(lv(checks, 'shape'), 'ok'); assert.strictEqual(lv(checks, 'pixels'), 'warn');
      const none = await M.analyze(src, { ffmpeg: '/nope/ffmpeg' }); // an override that doesn't exist falls back to the PATH one
      assert.ok(none.ok);
    });
    await ok('fixes run: loudness to -14 LUFS (picture copied), the loop blend, the cut', async () => {
      const FR = require(path.join(__dirname, '..', 'framereader.js'));
      const before = await FR.loudness(src);
      const loud = path.join(dir, 'loud.mp4'); run(P.loudArgs(-14), loud);
      const after = await FR.loudness(loud);
      assert.ok(Math.abs(after.integrated + 14) < Math.abs(before.integrated + 14) && Math.abs(after.integrated + 14) < 3, `${before.integrated} → ${after.integrated}`);
      const pl = probe(loud); assert.ok(pl.streams.some((s) => s.codec_type === 'audio') && pl.streams.find((s) => s.codec_type === 'video').codec_name === 'h264');
      const lp = path.join(dir, 'loop.mp4'); const L = P.loopArgs(4, { audio: true }); run(L.args, lp);
      const d = Number(probe(lp).format.duration); assert.ok(Math.abs(d - L.duration) < 0.15, `loop ${d} vs ${L.duration}`);
      const cut = path.join(dir, 'cut.mp4'); run(P.trimArgs(2), cut);
      assert.ok(Math.abs(Number(probe(cut).format.duration) - 2) < 0.15);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\npublishkit-test: ${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
})();
