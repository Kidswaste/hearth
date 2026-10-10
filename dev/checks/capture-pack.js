// Round 11 (pack11) in capture: click sounds mixed into a take, cursor smoothing, the encoder watchdog (a stalled
// encoder slows the frame rate instead of losing the take), auto-zoom that stays put for nearby clicks, tour previews
// (dry runs with timing) from /tour preview and capture_record { tour, dry }, the settings entries.
//   node dev/smoke.js --script dev/checks/capture-pack.js --check-timeout 300000
const out = { steps: [], errors: [] };
const ok = (cond, what, info) => { out.steps.push(`${cond ? '✓' : '✖'} ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 300)}`}`); if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = async (p) => (await window.hub.capture.frames('probe', p)).value;
const said = []; const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), error: (m) => said.push(`ERROR ${m}`) }); return said.join('\n'); };
try {
  // 1) cursor smoothing: the drawn cursor glides to the mouse (a light low-pass), raw when off
  const cf = Capture.cursorFx;
  cf.set('dot', { clicks: 'ring' });
  cf.place(40, 40);
  cf.follow(400, 300);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const mid = { x: cf.x, y: cf.y };
  await sleep(500);
  ok(mid.x > 40 && mid.x < 395 && Math.round(cf.x) === 400 && Math.round(cf.y) === 300, 'the drawn cursor glides to the mouse, then sits on it', { mid, end: { x: cf.x, y: cf.y } });
  // the settings menu entries change the live preferences
  const recMenu = Capture.settingsItems().find((x) => /^Recording/.test(x.label)).items();
  const smoothMenu = recMenu.find((x) => /^Cursor smoothing/.test(x.label));
  const clickMenu = recMenu.find((x) => /^Click sounds/.test(x.label));
  ok(Boolean(smoothMenu && clickMenu), 'Capture › Settings › Recording has Cursor smoothing and Click sounds', recMenu.map((x) => x.label).slice(-8));
  smoothMenu.items().find((x) => /Off/.test(x.label)).action();
  cf.place(40, 40); cf.follow(300, 200);
  ok(cf.x === 300 && cf.y === 200, 'smoothing off: the cursor is the raw mouse');
  smoothMenu.items().find((x) => /Light/.test(x.label)).action();
  cf.set('off');

  // 2) click sounds: a silent take with clicks gets a sound track with the ticks in it
  await Capture.record({ target: 'selector:#rail', fps: 30, countdown: 0, mp4: true, audio: 'none', cursor: 'dot', clicks: 'ring', clickSound: 'soft' });
  ok(Capture.status().recording, 'a take with click sounds started');
  for (let i = 0; i < 4; i += 1) { await sleep(350); dispatchEvent(new PointerEvent('pointerdown', { clientX: 30, clientY: 200 + i * 20, bubbles: true })); }
  await sleep(400);
  const r1 = await Capture.stop({ quiet: true });
  const p1 = await probe(r1.path);
  ok(p1?.audio, 'the take has a sound track (the clicks) though its sound was off', p1 && { audio: p1.audio, dur: p1.duration });
  const sil = (await window.hub.capture.frames('silence', r1.path).catch(() => null))?.value;
  out.silence = sil;
  ok(!sil || !Array.isArray(sil.ranges || sil) || (sil.ranges || sil).reduce((n, x) => n + ((x.end ?? x.b ?? 0) - (x.start ?? x.a ?? 0)), 0) < p1.duration - 0.05, 'the clicks are heard (not all silence)', sil);

  // 3) the encoder watchdog: a busy page (no frames, no bytes for 4.5 s) slows the take to 15 fps, the take survives
  await Capture.record({ target: 'selector:#rail', fps: 30, countdown: 0, mp4: false, audio: 'none' });
  await sleep(1200);
  const t0 = performance.now(); while (performance.now() - t0 < 4600) { /* the main thread is busy */ }
  await sleep(1500);
  const st = Capture.status();
  ok(st.slowedTo === 15, 'a stalled encoder slows the frame rate to 15 fps', st);
  const r2 = await Capture.stop({ quiet: true });
  const p2 = await probe(r2.path);
  ok(r2.slowedTo === 15 && p2?.duration > 4, 'the take is kept, with its real length, and says it was slowed', { slowed: r2.slowedTo, dur: p2?.duration });

  // 4) auto-zoom: a click zooms, a click near the same place keeps the view still (no bounce)
  await Capture.record({ target: 'selector:#rail', fps: 30, countdown: 0, mp4: false, audio: 'none', autozoom: true });
  dispatchEvent(new PointerEvent('pointerdown', { clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true }));
  await sleep(800);
  const v1 = CaptureTour.viewState();
  dispatchEvent(new PointerEvent('pointerdown', { clientX: innerWidth / 2 + 20, clientY: innerHeight / 2 + 10, bubbles: true }));
  await sleep(300);
  const v2 = CaptureTour.viewState();
  ok(v1.k > 1.5 && v2.k === v1.k && v2.x === v1.x && v2.y === v1.y, 'a nearby click keeps the zoomed view still', { v1, v2 });
  dispatchEvent(new PointerEvent('pointerdown', { clientX: 40, clientY: 40, bubbles: true }));
  await sleep(1000);
  const v3 = CaptureTour.viewState();
  ok(v3.x !== v1.x || v3.y !== v1.y, 'a far click pans there', { v1, v3 });
  await Capture.stop({ quiet: true });
  await sleep(1200);
  ok(CaptureTour.viewState().k === 1, 'the view is back after the take');

  // 5) tour preview: everything plays, nothing is recorded, each step timed
  const r3 = await CaptureTour.run('record 9:16\nwait 0.4s\ncaption "Preview" 0.5s\nmark here\nstop', { name: 'pack preview', dry: true });
  ok(r3.dry && !r3.recording && !Capture.recording && r3.timeline.filter((x) => x.dry).length === 3 && r3.timeline.some((x) => x.op === 'wait' && x.ms >= 350), 'a dry run plays the steps and records nothing', r3.timeline);
  const line = CaptureTour.previewLine(r3);
  ok(/Preview: 2 steps played in \d/.test(line) && /3 recording steps skipped/.test(line), 'its summary', line);
  const cmdTxt = await run('/tour preview hello');
  ok(/^Preview: \d+ steps played/.test(cmdTxt) && !Capture.recording, '/tour preview <name>', cmdTxt);
  const viaTool = await HubBridge.call('capture_record', { action: 'tour', steps: 'wait 0.2s\nrecord\nstop', dry: true });
  ok(viaTool.ok && viaTool.value.preview && !viaTool.value.recording, 'capture_record { tour, dry } for the agents', viaTool.value);
  const tm = CaptureTour.menuItems().filter(Boolean).map((x) => x.label);
  ok(tm.some((l) => /Preview a tour/.test(l)), 'the tours menu has Preview', tm);
} catch (err) { ok(false, `crashed: ${err.message}`, String(err.stack).split('\n').slice(0, 3).join(' | ')); }
out.ok = !out.errors.length;
return JSON.stringify(out, null, 1);
