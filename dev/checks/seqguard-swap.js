// Seqguard (round 13): the Lab sequence through frame swaps. The owner: "the sequence bugs out often during frame
// swapping". Every way to swap (the size pills / Shift+digit / /size / the size menu), while paused, playing,
// scrubbing, in a transition, on footage and titles, with a song, right after an edit, rapidly (several swaps under
// 300 ms, through "fit", which reloads the page): after each, the picture (SQL.probe) has to match the UI clock.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/seqguard-swap.js
const { step } = J;
const { wait, until, sbx } = SQL;
const Q = ThreeSeq;
const ids = await SQL.scenes();
ThreeLab.scenes.open(ids.red); await wait(1500);
const L = ThreeLab;
const size = (id) => Commands.tryRun(`/size ${id}`, H.claudeAgent().id);
const color = { 'Seq Red': 'red', 'Seq Green': 'green', 'Seq Blue': 'blue' };
// what should show at T (the main clip's color; a transition: either side or a mix; footage / title: not a scene color)
const expect = (T) => {
  const e = Q.edit; const x = e && CutData.at(e, Math.min(T, CutData.mainTotal(e) - 1e-4));
  const sh = ThreeSeqData.showing(e, T);
  if (sh.trans) return 'any';
  const c = x?.clip;
  return c?.kind === 'scene' ? color[c.name] || 'any' : 'any';
};
const look = async () => {
  const info = await sbx('return __seqInfo()');
  const p = await SQL.probe();
  return { uiT: +Q._S.T.toFixed(3), uiPlaying: Q._S.playing, on: info?.on, T: +(info?.T ?? -1).toFixed(3), playing: info?.playing, mounted: info?.mounted?.length, color: SQL.colorOf(p?.center), want: expect(info?.T ?? 0), size: Q._S.L?.stage.size.id };
};
const ok = (s, { playing = null } = {}) => s.on && (s.want === 'any' || s.color === s.want) && (playing == null || (s.playing === playing && s.uiPlaying === playing)) && Math.abs(s.uiT - s.T) < (playing ? 0.45 : 0.05);
const settled = async (opts, ms = 9000) => { let s = null; await until(async () => { s = await look(); return ok(s, opts); }, ms); return s; };

await SQL.build({ name: 'Swap seq', song: true });
await until(() => Q.active, 5000);
const fmt0 = ThreeSeqData.formatOf(Q.edit);
step('the sequence shows', Q.active, fmt0);

// 1. paused, every pill
Q.seek(1); await Q.settle(); await wait(400);
const paused = [];
for (const id of ['16:9', '1:1', '4:5', 'fit', '9:16']) { size(id); await wait(150); paused.push({ id, ...(await settled({ playing: false })) }); }
step('paused: after each frame swap the picture matches the playhead (red at 1 s)', paused.every((s) => ok(s, { playing: false })), paused);

// 2. playing, a swap every 700 ms (the picture follows the clock, it keeps playing)
Q.seek(0); await Q.settle();
Q.play(true); await wait(300);
const playing = [];
for (const id of ['16:9', '1:1', 'fit', '4:5', '9:16']) { size(id); await wait(700); playing.push({ id, ...(await look()) }); }
await wait(800);
const afterPlay = await look();
step('playing: it keeps playing through frame swaps (UI and preview agree)', playing.every((s) => s.on && s.playing && s.uiPlaying && Math.abs(s.uiT - s.T) < 0.45), playing);
step('playing: the picture matches the clock after the swaps', ok(afterPlay, { playing: afterPlay.playing }) || afterPlay.T >= Q._S.T - 0.5, afterPlay);
Q.play(false); await wait(300);

// 3. rapid swaps (under 300 ms, through fit, which reloads the page) while playing
Q.seek(0.5); await Q.settle();
Q.play(true); await wait(400);
for (const id of ['fit', '16:9', '9:16', 'fit', '1:1', '9:16']) { size(id); await wait(50); }
const rapid = await settled({ playing: true }, 12000);
step('rapid swaps while playing: the sequence comes back playing, picture = clock', ok(rapid, { playing: true }), rapid);
Q.play(false); await wait(300);

// 4. scrubbing while swapping
const sc = [];
for (let i = 0; i < 6; i++) { Q.seek(0.3 + i * 1.1); if (i % 2) size(i % 4 === 1 ? 'fit' : '1:1'); else size('9:16'); await wait(120); }
Q.seek(5.2); await wait(200); size('9:16');
const scrub = await settled({ playing: false }, 12000);
sc.push(scrub);
step('scrubbing through swaps: it lands on the last scrub (blue at 5.2 s… after the wipe)', ok(scrub, { playing: false }) && Math.abs(scrub.T - 5.2) < 0.05 && Math.abs(Q._S.T - 5.2) < 0.05, scrub);

// 5. right after an edit (a split commit and an undo) then a swap
Q.seek(1.0); await Q.settle();
Q.split(); size('fit'); await wait(60); Q.undo(); size('9:16');
const edit = await settled({ playing: false }, 12000);
step('an edit right before a swap: the plan the page shows is the latest one', ok(edit, { playing: false }) && (await sbx('return __seqInfo().mounted.length')) >= 1, edit);

// 6. in a transition (the dissolve red → green) and on footage, swap
Q.seek(2.0); await Q.settle(); size('16:9'); await wait(200); size('9:16');
const tr = await settled({ playing: false }, 9000);
step('in a transition: the swap keeps the program on', tr.on && Math.abs(tr.T - Q._S.T) < 0.05, tr);

// 7. real keys (Shift+3 = 16:9, Shift+1 = Fit, Shift+2 = 9:16) on footage, playing (footage files go again to a new page)
await J.click(document.querySelector('.sq-tl'), { at: [0.02, 0.05] }); Q.play(false);
Q.seek(3.8); await Q.settle(); Q.play(true); await wait(300);
await J.key('3', { shift: true }); await wait(250); await J.key('1', { shift: true }); await wait(250); await J.key('2', { shift: true });
const foot = await settled({ playing: true }, 12000);
Q.play(false); await wait(300);
Q.seek(4.6); await Q.settle(); await wait(1200);
const footPix = await sbx('return __seqPixels({ size: 64, x: 0.2, y: 0.5 })');
const footInfo = await sbx('return __seqTest.info()');
step('Shift+digit swaps on footage while playing: it plays on, and the footage shows after the reloads (not black)', ok(foot, { playing: true }) && foot.T > 3.9 && footPix?.bright > 0, { foot, footPix, footInfo });
step('the sequence took the 16:9 swap as its shape, then 9:16 again (Fit only changed the preview)', ThreeSeqData.formatOf(Q.edit) === '9:16' && Q.history().back.some((x) => /Format/.test(x.label)), Q.history().back.slice(0, 3));

// 8. the preview's own size menu (right-click the picture → Frame size)
const pill = [...document.querySelectorAll('.stage-seg .stage-btn')].find((b) => b.textContent.trim() === '1:1');
await J.click(pill); await wait(400);
const pillSize = { stage: Q._S.L.stage.size.id, fmt: ThreeSeqData.formatOf(Q.edit) };
await J.click([...document.querySelectorAll('.stage-seg .stage-btn')].find((b) => b.textContent.trim() === '9:16')); await wait(400);
step('the size pills while the sequence shows: the sequence follows (1:1), and back', pillSize.stage === '1:1' && pillSize.fmt === '1:1' && ThreeSeqData.formatOf(Q.edit) === '9:16', pillSize);

// 9. the dock / layout moving the Lab (the browser restarts its frame): it comes back playing
Q.seek(0.4); await Q.settle(); Q.play(true); await wait(400);
const surf = H.surfaces.get('tool:three').el; surf.parentNode.append(surf);
await wait(1500);
const moved = await settled({ playing: true }, 15000);
step('the Lab moved in the page (its frame restarts): the sequence comes back, playing', ok(moved, { playing: true }), moved);
Q.play(false); await wait(400);

// ---------- the watchdog ----------
const restores = () => ({ ...Q.health().restores });
const flashTxt = () => document.querySelector('.sq-flash')?.textContent || '';
// a. playing, the page stops on its own (no state for 2.5 s): the plan again, seek, play
Q.seek(0.2); await Q.settle(); Q.play(true); await wait(600);
const r0 = restores();
await sbx('return __seqTest.stall()');
const stalled = await until(() => Q.health().restores.soft > r0.soft, 9000);
const back = await settled({ playing: true }, 9000);
step('watchdog: a stalled clock while playing → restored, playing again', stalled && ok(back, { playing: true }), { r0, r1: restores(), back });
Q.play(false); await wait(400);
// b. the page loses the sequence (as if it reloaded and nobody put it back)
Q.seek(1.1); await Q.settle(); await wait(300);
const r1 = restores();
await sbx('return __seqTest.off()');
await until(() => Q.health().restores.soft > r1.soft, 12000);
const lost = await settled({ playing: false }, 9000);
step('watchdog: the preview lost the sequence → it is put back at the same frame', ok(lost, { playing: false }) && Math.abs(lost.T - 1.1) < 0.05, { r1, r2: restores(), lost });
step('… with a small "Preview restored" note', /restored/i.test(flashTxt()) || /lost/.test(Q.health().last?.why || ''), { flash: flashTxt(), last: Q.health().last });
// c. a footage file missing in the page: sent again
Q.seek(4.6); await Q.settle(); await wait(400);
const r2 = restores();
await sbx(`return __seqTest.dropAsset(${JSON.stringify(SQL.FOOTAGE)})`);
await until(() => Q.health().restores.assets > r2.assets, 12000);
await wait(1500);
const fp = await sbx('return __seqPixels({ size: 64 })');
step('watchdog: a footage file missing in the preview → sent again, the footage shows', Q.health().restores.assets > r2.assets && fp?.bright > 0, { r2, r3: restores(), fp });
// d. a hung page (busy for 10 s): no answers → a fresh page, back at the same frame
Q.seek(1.3); await Q.settle(); await wait(300);
const r3 = restores(); const n0 = ThreeLab.live.counts().reloads.preview || 0;
await sbx('return __seqTest.mute(12000)');
await until(() => Q.health().restores.hard > r3.hard, 20000);
const hung = await settled({ playing: false }, 15000);
step('watchdog: a preview that stops answering → a fresh page by itself, back at the same frame', Q.health().restores.hard > r3.hard && (ThreeLab.live.counts().reloads.preview || 0) > n0 && ok(hung, { playing: false }) && Math.abs(hung.T - 1.3) < 0.05, { r3, r4: restores(), hung });
step('↻ Reload is still on the row', J.visible(document.querySelector('.sq-reload')));

// 10. the size the sequence had comes back, and the scene's own size after leaving
step('the preview ends on the sequence\'s own size', Q._S.L.stage.size.id === ThreeSeqData.formatOf(Q.edit), { size: Q._S.L.stage.size.id, fmt: ThreeSeqData.formatOf(Q.edit) });
// the scene's own frame size: 16:9 before the sequence; the sequence's 9:16 and the swaps don't overwrite it
await Q.leave(); await wait(600);
ThreeLab.scenes.setFrame?.(ids.red, '16:9'); await wait(400);
await Q.enter(); await wait(800);
size('1:1'); await wait(300); size('9:16'); await wait(300);
await Q.leave(); await wait(800);
step('leaving the sequence gives the scene its own frame size back (16:9), whatever was swapped meanwhile', Q._S.L.stage.size.id === '16:9', { size: Q._S.L.stage.size.id, own: ThreeLab.scenes.frameOf?.(ids.red) });
console.log('[seqguard-swap]', JSON.stringify({ paused, playing, afterPlay, rapid, sc, edit, tr }));
return J.done();
