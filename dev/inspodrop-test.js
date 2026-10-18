// Inspo drop (round 65, inspodrop65), the pure part (board-drop-core.js): key-frame sampling, the picture budget,
// which board items are media, frame sizes, the clip's one line.
//   node dev/inspodrop-test.js
const C = require('../board-drop-core.js');
const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// frame sampling: first frame, the exact middle, evenly spaced, 4–8, inside the clip
for (const [d, n] of [[2, 4], [4, 4], [6, 6], [15, 6], [16, 8], [120, 8], [3600, 8]]) {
  const t = C.frameTimes(d);
  ok(t.length === n, `${d} s → ${n} frames (got ${t.length})`);
  ok(t[0] === 0, `${d} s: the first frame is one`);
  ok(t.some((x) => near(x, d / 2, 1e-3)), `${d} s: the middle is one (${t})`);
  ok(t.every((x, i) => x >= 0 && x < d && (i === 0 || x > t[i - 1])), `${d} s: sorted, inside the clip (${t})`);
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  ok(gaps.every((g) => near(g, gaps[0], 1e-3)), `${d} s: evenly spaced (${gaps})`);
}
// a cap (several clips share the picture budget), odd caps round down to keep the middle
ok(C.frameTimes(60, { max: 3 }).length === 2 && C.frameTimes(60, { max: 3 }).includes(30), 'max 3 → 2 frames, 0 and the middle');
ok(C.frameTimes(60, { max: 5 }).length === 4, 'max 5 → 4');
ok(C.frameTimes(60, { max: 1 }).length === 1 && C.frameTimes(60, { max: 1 })[0] === 0, 'max 1 → the first frame');
// fps: snapped to frames, never past the last frame, no two on one frame
const f25 = C.frameTimes(6, { fps: 25 });
ok(f25.every((x) => near(x * 25, Math.round(x * 25), 1e-6)), `snapped to 25 fps frames (${f25})`);
const tiny = C.frameTimes(0.1, { fps: 25 }); // 2.5 frames long
ok(tiny.length >= 1 && tiny.length <= 3 && new Set(tiny).size === tiny.length && tiny.every((x) => x <= 0.1 - 0.04 + 1e-9), `a 0.1 s clip: distinct frames inside it (${tiny})`);
// unknown length: the first frame
ok(JSON.stringify(C.frameTimes(0)) === '[0]' && JSON.stringify(C.frameTimes(NaN)) === '[0]', 'no duration → [0]');

// the picture budget: 24 in all, clips share what the stills leave, 2..8 each
ok(C.framesPerClip(1, 0) === 8, 'one clip alone → 8');
ok(C.framesPerClip(1, 20) === 4, 'one clip after 20 stills → 4');
ok(C.framesPerClip(5, 5) === 3, '5 clips after 5 stills → 3 each');
ok(C.framesPerClip(10, 0) === 2, '10 clips → 2 each (floor)');
ok(C.framesPerClip(0, 3) === 0, 'no clips → 0');

// which items are media; the plan caps at 10 and keeps notes apart
const items = [
  { id: 'a', type: 'image', src: '/x/a.png' }, { id: 'b', type: 'video', src: '/x/b.mp4' }, { id: 'c', type: 'gif', src: '/x/c.gif' },
  { id: 'd', type: 'web', src: '/x/shot.png', url: 'https://example.com' }, { id: 'e', type: 'note', text: 'hi' }, { id: 'f', type: 'palette', colors: ['#000'] },
  { id: 'g', type: 'frame' }, { id: 'h', type: 'image', src: 'https://example.com/r.jpg' }, { id: 'i', type: 'web', url: 'https://x.y' /* not snapped */ },
];
ok(['a', 'b', 'c', 'd', 'h'].every((id) => C.kindOf(items.find((x) => x.id === id))), 'media kinds');
ok(C.kindOf(items[1]) === 'video' && C.kindOf(items[0]) === 'image' && C.kindOf(items[3]) === 'image', 'a clip is a clip, a website is its picture');
ok(!C.kindOf(items[4]) && !C.kindOf(items[5]) && !C.kindOf(items[6]) && !C.kindOf(items[8]), 'notes / colors / frames / an unsnapped site are not media');
const p = C.plan(items);
ok(p.take.length === 5 && p.over === 0 && p.pics === 4 && p.clips === 1 && p.framesPerClip === 8, `plan (${JSON.stringify({ take: p.take.length, pics: p.pics, clips: p.clips, fpc: p.framesPerClip })})`);
ok(p.other.map((x) => x.id).join() === 'e,f,i', `notes and colors stay apart (${p.other.map((x) => x.id)})`);
const many = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, type: i % 2 ? 'video' : 'image', src: `/x/${i}` }));
const pm = C.plan(many);
ok(pm.take.length === 10 && pm.over === 4, '14 media → 10 + 4 left out');
ok(pm.pics + pm.clips * pm.framesPerClip <= 24 || pm.framesPerClip === 2, `the picture budget holds (${pm.pics} + ${pm.clips}×${pm.framesPerClip})`);
ok(C.kindOf({ type: 'image', src: '/a', hidden: true }) === null, 'a hidden item is left out');

// frame sizes: long side 768, portrait stays portrait, small stays small, even numbers
const s1 = C.frameSize(1920, 1080); ok(s1.width === 768 && s1.height === 432, `1080p → 768×432 (${JSON.stringify(s1)})`);
const s2 = C.frameSize(1080, 1920); ok(s2.height === 768 && s2.width === 432, `portrait → 432×768 (${JSON.stringify(s2)})`);
const s3 = C.frameSize(480, 270); ok(s3.width === 480 && s3.height === 270, 'small clip not upscaled');
const s4 = C.frameSize(1001, 333); ok(s4.width % 2 === 0 && s4.height % 2 === 0, 'even sizes');
ok(C.frameSize(0, 0).width === 768, 'unknown size → width 768');

// the one line
const line = C.videoLine({ name: 'cuts.mp4', duration: 6.04, w: 480, h: 270, times: [0, 1.5, 3, 4.5], path: '/tmp/b/cuts.mp4' });
ok(/^cuts\.mp4: video, 6 s, 480×270; 4 frames attached as pictures, at 0:00\.0, 0:01\.5, 0:03\.0, 0:04\.5\. File: \/tmp\/b\/cuts\.mp4/.test(line), `video line (${line})`);
ok(line.length < 200, 'the line stays short');
ok(C.clock(75.25) === '1:15.3' || C.clock(75.25) === '1:15.2', `clock (${C.clock(75.25)})`);
// names / extensions
ok(C.safeName('a/b:c?*.png') === 'a b c .png', `safe name (${C.safeName('a/b:c?*.png')})`);
ok(C.extOf('https://x.y/p/photo.JPG?w=2') === '.jpg' && C.extOf('/a/b') === '.jpg' && C.extOf('/a/b.webm') === '.webm', 'extensions');
ok(C.isUrl('https://a') && !C.isUrl('/a') && C.isData('data:image/png;base64,AA'), 'url kinds');

console.log(JSON.stringify({ ok: !fail.length, fail, sample: { '6s': C.frameTimes(6), '30s@30': C.frameTimes(30, { fps: 30 }), line } }, null, 1));
process.exit(fail.length ? 1 : 0);
