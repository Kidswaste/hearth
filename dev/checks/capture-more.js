// Capture, the wider families: every tour step (no recording, so it runs anywhere), every caption / title / cursor /
// click style, beautify mixes and all backgrounds, every sheet layout and theme, the ffmpeg readings and /make,
// the player's I / O range, burst shots, and the tour templates (parsed and linted).
// Needs the test videos:  node dev/capture-test.js --make /tmp/hearth-capture-test
//   node dev/smoke.js --script dev/checks/capture-more.js --check-timeout 400000
const out = { errors: [] };
const ok = (cond, what) => { if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = CaptureData;
const DIR = '/tmp/hearth-capture-test';
const agentId = H.claudeAgent().id;
const run = async (line) => { const said = []; await Commands.tryRun(line, agentId, null, { source: 'code', say: (t) => said.push(t) }); return said.join('\n'); };

// tour templates: every one parses and lints clean (only steps and commands that exist)
out.lint = {};
for (const t of D.TOURS) { const p = CaptureTour.lint(t.steps); if (p.length) out.lint[t.id] = p; }
ok(!Object.keys(out.lint).length, `tour templates lint clean: ${JSON.stringify(out.lint)}`);
ok(CaptureTour.OPS.length === 49 && D.TOUR_STEPS.length === 48, `${CaptureTour.OPS.length} tour steps`);

// every new step in one tour (no recording): camera moves, overlays, beat sync, drag, hide / show
const box = el('div', { id: 'cap-test-box', style: { position: 'fixed', left: '600px', top: '300px', width: '120px', height: '80px', background: '#345' } });
document.body.append(box);
let downs = 0; box.addEventListener('pointerdown', () => { downs += 1; });
const t0 = performance.now();
const r = await CaptureTour.run(`ease snappy
tilt 6 -8 0.3s
spin 3 0.2s
tilt 0 0 0.2s
spin 0 0.1s
push #cap-test-box 1.2 0.4s
zoom out 0.2s
shake 0.5 0.2s
whip out left 0.2s
whip in 0.2s
flash gold 0.1s
blur in 0.2s
letterbox on 2.39
vignette on
grain on
watermark "made with Hearth" br
timecode on
progress on
bpm 240
beat 1
confetti 20
emoji "🔥"
drag #cap-test-box 300,300 0.3s
hide #rail
caption "Kinetic words here" 0.6s kinetic
title "Hearth" "sub" 0.6s neon
letterbox off
vignette off
grain off
watermark off
timecode off
progress off`, { name: 'every step' });
out.tour = { steps: r.steps, skipped: r.skipped, ms: Math.round(performance.now() - t0) };
ok(r.steps === 32 && !r.skipped.length, `every new tour step ran: ${r.steps} / 32 ${JSON.stringify(r.skipped)}`);
ok(downs === 1, 'drag pressed on its start point');
ok(getComputedStyle(document.getElementById('rail')).visibility === 'visible', 'hide #rail came back after the tour');
ok(!document.getElementById('app').style.transform && !document.getElementById('app').style.filter, 'the view is back (no zoom, tilt, blur)');
ok(!document.querySelector('#cap-fx .cap-letterbox, #cap-fx .cap-grain, #cap-fx .cap-clock'), 'overlays removed');
box.remove();

// every caption and title style, every cursor and click style: a quick visual
const cap = CaptureTour.run(D.CAPTIONS.map((c) => `caption "${c.label}" 0.25s ${c.id}`).join('\n'), { name: 'captions' });
await sleep(150); await smoke({ shot: '/tmp/capture-caption.png' });
const rc = await cap;
ok(rc.steps === D.CAPTIONS.length && !rc.skipped.length, `${D.CAPTIONS.length} caption styles`);
const tit = await CaptureTour.run(D.TITLES.map((t) => `title "Hearth" "${t.label}" 0.5s ${t.id}`).join('\n'), { name: 'titles' });
ok(tit.steps === D.TITLES.length && !tit.skipped.length, `${D.TITLES.length} title styles`);
for (const c of D.CURSORS) { Capture.cursorFx.set(c.id, { clicks: 'ring' }); ok(c.id === 'off' ? !document.querySelector('.cap-cursor') : document.querySelector(`.cap-cursor-${c.id}`), `cursor ${c.id}`); }
for (const c of D.CLICKS) { Capture.cursorFx.set('dot', { clicks: c.id }); Capture.cursorFx.ripple(200, 200); }
Capture.cursorFx.set('off', { clicks: 'off' });

// beautify: every look, a mix, every background (small picture so it's quick)
const shot = await Capture.shot({ target: 'selector:#rail', quiet: true });
const img = await Capture.loadImage(shot.path);
for (const b of D.BEAUTIFY) { const c = Capture.beautify(img, b.id); ok(c.width > 0, `look ${b.id}`); }
for (const b of D.BACKGROUNDS) { const c = Capture.beautify(img, 'forge', { bg: b.id }); ok(c.width > 0, `background ${b.id}`); }
const mix = Capture.beautyArgs(['bg:nebula', 'pad:l', 'corners:24', 'shadow:strong', 'bar:browser']);
ok(mix.bg === 'nebula' && mix.pad === 0.12 && mix.radius === 24 && mix.shadow === 0.7 && mix.chrome === 'browser', 'beautify words');
const said = await run(`/beautify bg:forge-mesh pad:xl bar:phone "${shot.path}"`);
out.beautify = said;
ok(/beautified/.test(said), '/beautify with a mix');
// every social frame works as a crop
for (const f of D.SOCIAL) { const c = Capture.socialCrop(img, f); ok(c.width === f.w && c.height === f.h, `frame ${f.id}`); }

// every sheet layout and theme
const V = `${DIR}/cuts.mp4`;
for (const s of D.SHEETS) { const sh = await FrameRead.sheet(V, { layout: s.id, width: 900 }); ok(sh.path, `sheet ${s.id}`); }
for (const t of D.SHEET_THEMES) { const sh = await FrameRead.sheet(V, { layout: '2x2', theme: t.id, width: 600 }); ok(sh.path, `theme ${t.id}`); }

// ffmpeg readings through the app (an A/V test file is made by dev/capture-test.js only in its own run: use the video set)
for (const m of ['black', 'freeze', 'silence', 'loudness', 'keyframes', 'letterbox', 'barcode', 'loop']) {
  let res = null; try { res = await FrameRead.read(m === 'loop' ? `${DIR}/moving.mp4` : V, m, {}); } catch (e) { res = { error: e.message }; }
  ok(res && !res.error && res.text, `reading ${m}: ${res?.error || res?.text?.slice(0, 60)}`);
}
const lp = await FrameRead.read(`${DIR}/moving.mp4`, 'loop', { from: 0 });
out.loop = lp.text;
// /make
const mk = await run(`/make gif "${DIR}/cfr25.mp4" 1 2`);
out.makeGif = mk;
ok(/GIF/.test(mk) && /\.gif`/.test(mk) && /captures[\\/]made/.test(mk), '/make gif with a range, into captures/made (the footage folder is left alone)');
const mk2 = await run(`/make 9:16 "${DIR}/cfr25.mp4"`);
ok(/1080x1920/.test(mk2), '/make 9:16');
const mk3 = await run(`/make loop "${DIR}/moving.mp4"`);
ok(/Seamless loop/.test(mk3), '/make loop finds and cuts a loop');
const tool = await HubBridge.call('capture_frames', { path: `${DIR}/cfr25.mp4`, mode: 'make', op: 'boomerang', from: 0, to: 1 });
ok(tool.ok && /boomerang/.test(tool.value.made), 'capture_frames mode make for the agents');
const tool2 = await HubBridge.call('capture_frames', { path: V, mode: 'black' });
ok(tool2.ok, 'capture_frames black');

// the player: I / O range and G (GIF of the range)
const dlg = await CaptureView.open(`${DIR}/cfr25.mp4`);
await sleep(600);
dlg.player.go(25); await sleep(250);
dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));
dlg.player.go(50); await sleep(250);
dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
out.range = dlg.player.range();
ok(out.range && out.range.from === 1 && out.range.to === 2.04, `I/O range ${JSON.stringify(out.range)}`);
await smoke({ shot: '/tmp/capture-player-io.png' });
dlg.close();

// burst shots
const b = await run('/shot burst 3 0.2 window');
ok((b.match(/`/g) || []).length === 6, '/shot burst 3');
return JSON.stringify(out, null, 1);
