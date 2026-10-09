// Smoothness of the Lab sequence (measured with smoke({ trace }) through smooth-lib's measure): the music timeline
// playing a song (the baseline the owner calls smooth), then the sequence playing over the same song
// (/tmp/hearth-test-song.wav), then a scrub of the sequence. Reports painted area, paint / layout ms, DOM changes and
// the preview's own frame gaps; checks the sequence costs no more than the music timeline per second.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/sequence-smooth.js
const { wait, until, measure, brief } = M;
const { step } = J;
const out = {};
const ids = await SQL.scenes();
const c = await ThreeLab.cmd();
ThreeLab.scenes.open(ids.red); await wait(1500);
const sbx = SQL.sbx;
await sbx(`window.__sm = { gaps: [], last: 0, on: false }; return 1`);
const sbxStart = () => sbx(`__sm.gaps = []; __sm.last = 0; __sm.on = true; const f = (t) => { if (!__sm.on) return; if (__sm.last) __sm.gaps.push(t - __sm.last); __sm.last = t; R(f); }; const R = typeof realRAF === "function" ? realRAF : requestAnimationFrame; R(f); return 1`);
const sbxStop = () => sbx(`__sm.on = false; const g = __sm.gaps.slice().sort((a, b) => a - b); return { frames: g.length, worst: Math.round(g.at(-1) || 0), p95: Math.round(g[Math.floor(g.length * 0.95)] || 0), drops: g.filter((x) => x > 25).length }`);
const both = async (ms, during) => { await sbxStart(); const r = await measure(ms, during); const s = await sbxStop(); return { raw: r, brief: brief(r), sandbox: s }; };
// a baseline: the music timeline playing the song
await c.loadSong(SQL.SONG); await wait(1500);
c.play(true); await until(() => c.state.playing, 3000);
const music = await both(3000);
c.play(false); await wait(300);
out.musicTimeline = { brief: music.brief, sandbox: music.sandbox };
// the sequence over the same song
await SQL.build({ name: 'Smooth seq', song: true });
await sbx(`window.__sm = { gaps: [], last: 0, on: false }; return 1`);
ThreeSeq.seek(0); await ThreeSeq.settle();
ThreeSeq.play(true); await wait(200);
const seqPlay = await both(3000);
ThreeSeq.play(false); await wait(300);
out.sequencePlaying = { brief: seqPlay.brief, sandbox: seqPlay.sandbox };
// a scrub across the sequence (pointer on the canvas)
const tl = document.querySelector('.sq-tl canvas'); const r = tl.getBoundingClientRect();
const scrub = await both(1600, async () => {
  const y = r.top + 8;
  await M.mouse('mousePressed', r.left + 10, y);
  for (let i = 0; i < 40; i++) { await M.mouse('mouseMoved', r.left + 10 + (i / 40) * (r.width - 20), y, { buttons: 1 }); await wait(30); }
  await M.mouse('mouseReleased', r.right - 10, y);
});
out.sequenceScrub = { brief: scrub.brief, sandbox: scrub.sandbox };
const per = (x) => x.raw.mut.perSec;
console.log('[smooth-sequence]', JSON.stringify(out));
step('playing the sequence: DOM changes per second no more than the music timeline\'s + 5', per(seqPlay) <= per(music) + 5, { seq: per(seqPlay), music: per(music) });
step('playing the sequence: the playhead is one compositor animation', document.querySelector('.sq-playhead').getAnimations().length <= 1);
step('the preview keeps drawing while the sequence plays (no long stalls)', seqPlay.sandbox.frames > 20 && seqPlay.sandbox.worst < 1000, seqPlay.sandbox);
step('painted area while playing: sequence vs music timeline (kpx, in the log)', seqPlay.raw.trace.paintedKpx <= Math.max(music.raw.trace.paintedKpx * 1.5, music.raw.trace.paintedKpx + 20000), { seq: seqPlay.raw.trace.paintedKpx, music: music.raw.trace.paintedKpx, out });
return J.done();
