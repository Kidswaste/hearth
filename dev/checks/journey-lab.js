// Journey 1: a music visual from scratch, the way the owner works (Lab + docked Three Director), with real mouse and
// keyboard events: dock the director, load a song, tap tempo, kick markers, ask the director (fake, real MCP calls),
// an FX filter + a look from the picker, shuffle / save several times, 9:16 and 4:5, freeze on a beat, a still and a
// recording, Code ⇄ Nodes with a knob tweak, undo the director's edit from the dock.
//   node dev/make-test-song.js /tmp/hearth-test-song.wav
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/journey-lab.js --shot /tmp/j1.png
// Set window.JOURNEY_SHOTS = '/some/dir' (e.g. with --eval) to keep step pictures; default /tmp.
const { wait, until, step, q, click, key, type, shot, visible, hitOk } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-test-song.wav';
const claude = H.claudeAgent();
const lab = () => H.surfaces.get('tool:three')?.el;
const center = (n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

// 1. the director: typed in Claude's chat like a new user would
activate(claude.id); await wait(300);
await J.command(claude.id, '/director-setup', 1500);
await until(() => H.agents().some((a) => a.dock === 'three'));
const dir = H.agents().find((a) => a.dock === 'three');
step('director docked', Boolean(dir), dir?.name);
await until(() => lab()?.querySelector('.tool-dock:not([hidden]) .composer textarea'), 8000);
const L = lab();
step('Lab open with the dock', H.surfaceIdFor(H.activeId) === 'tool:three' && visible(L.querySelector('.tool-dock .composer textarea')));
await ThreeLab.cmd();
await wait(1500);

// 2. load the song (what dropping it on the preview does)
const exists = await window.hub.fs?.stat?.(SONG).catch(() => null);
const c = await ThreeLab.cmd();
const r = await c.loadSong(SONG);
step('song loaded', r.ok, r.error || c.state.song);
await wait(1500);
await shot('song');

// 3. play, then tap tempo with the real Tap button (8 taps at 120 BPM)
const tapBtn = L.querySelector('.mb-tap');
step('Tap button visible', visible(tapBtn) && hitOk(tapBtn));
const detected = Math.round((c.state.bpm || 0) * 10) / 10;
// play with Space after a click on the picture (keys reach the Lab from the preview too)
const pic = () => [...L.querySelectorAll('.three-preview')].find(visible);
await click(pic(), { at: [0.5, 0.6] });
await key(' ');
step('Space plays the song', await until(() => c.state.playing, 3000));
if (!c.state.playing) c.play(true);
// taps on a fixed schedule (each click's own round trips don't add up)
const t0 = performance.now() + 100;
for (let i = 0; i < 8; i++) { while (performance.now() < t0 + i * 500) await wait(5); await J.mouse('mousePressed', ...center(tapBtn)); await J.mouse('mouseReleased', ...center(tapBtn)); }
await wait(600);
step('tapped BPM ≈ 120', Math.abs((c.state.bpm || 0) - 120) < 3, { detected, tapped: Math.round(c.state.bpm * 10) / 10 });

// 4. kick markers with the K key (focus in the Lab first: a click on the timeline wave)
const wave = L.querySelector('.mb-wave canvas, .mb-overview, canvas.mb-canvas') || L.querySelector('.lab-player canvas');
for (let i = 0; i < 4; i++) { await key('k'); await wait(450); }
let kicks = 0;
await until(async () => { const bm = (await window.hub.kvGet('three-beatmaps')) || {}; kicks = Object.values(bm)[0]?.marks?.kick?.length || 0; return kicks >= 4; }, 4000);
step('4 kick markers (K)', kicks >= 4, { kicks, focus: document.activeElement?.className?.slice?.(0, 40) });
await shot('tapped');

// 5. ask the docked director (fake engine, real MCP calls into the Lab)
const before = ThreeLab.director.codeOf().code;
const first = before.split('\n').find((l) => l.trim());
const calls = [['three_screenshot', { size: 'small' }], ['three_edit_code', { edits: [{ find: first, replace: `${first} // music visual by the director` }] }]];
await click(Native.view(dir.id).input);
await type(`Make it pulse on the kick, mcp\nmcp: ${JSON.stringify(calls)}`);
await key('Enter');
await until(() => Native.isBusy(H.activeChat[dir.id]), 4000);
await until(() => !Native.isBusy(H.activeChat[dir.id]), 90000);
const reply = Native.current(dir.id)?.messages.at(-1);
step('director replied with tool calls', /three_edit_code: \d+ chars/.test(reply?.text || ''), (reply?.text || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 90)));
step('director edit applied', ThreeLab.director.codeOf().code.includes('// music visual by the director'));
await shot('director');

// 6. an FX filter and a look from the picker (X key, type, Enter)
const layers0 = c.layers().length;
await click(pic(), { at: [0.5, 0.6] });
await key('x'); await wait(400);
let picker = document.querySelector('.fx-picker');
step('X opens the FX picker', visible(picker));
if (picker) {
  await type('vhs'); await wait(300);
  await key('Enter'); await wait(1500);
}
step('filter layer added', c.layers().length === layers0 + 1, c.layers().map((x) => x.name));
const pal0 = JSON.stringify(c.palette()); const layersBeforeLook = c.layers().length;
await key('x'); await wait(400);
picker = document.querySelector('.fx-picker');
if (picker) {
  // the picker opens on Suggested; its tabs show after "Browse all" (round 4)
  if (!visible(picker.querySelector('.fx-tabs')) && picker.querySelector('.fx-browse')) await click(picker.querySelector('.fx-browse'));
  const lookTab = [...picker.querySelectorAll('.fx-tabs button, .fx-tabs [role=tab]')].find((b) => /Looks/.test(b.textContent));
  if (lookTab) await click(lookTab);
  await type('neon'); await wait(300);
  await key('Enter'); await wait(1500);
}
step('look applied (palette / filters changed)', JSON.stringify(c.palette()) !== pal0 || c.layers().length !== layersBeforeLook, { palette: c.palette(), layers: c.layers().map((x) => x.name) });
await shot('fx-look');

// 7. shuffle and save, several times (the buttons the owner uses most)
// looked up each round: the sliders panel can redraw its buttons after a shuffle
const shuffleBtnNow = () => [...L.querySelectorAll('button')].find((b) => /Shuffle/.test(b.textContent) && visible(b));
const saveBtnNow = () => [...L.querySelectorAll('button.tw-save')].find(visible); // reads "Save 5" with 5 changed values
let saves = 0;
for (let i = 0; i < 3; i++) {
  await click(shuffleBtnNow()); await wait(500);
  const saveBtn = saveBtnNow();
  const dirty = !saveBtn.disabled;
  await click(saveBtn); await wait(700);
  if (dirty) saves++;
}
step('shuffle + save ×3', saves === 3, { saves });
await shot('shuffled');

// 7b. undo the director's edit from the dock
const undo = L.querySelector('.dd-undo');
step('dock undo enabled', undo && !undo.disabled);
if (undo && !undo.disabled) { await click(undo); await wait(1500); }
step('director edit undone', !ThreeLab.director.codeOf('Layer 1').code.includes('// music visual by the director'));

// 8. frame sizes with the pills, freeze on a beat
for (const id of ['9:16', '4:5']) {
  const pill = [...L.querySelectorAll('button')].find((b) => b.textContent.trim() === id && visible(b));
  const was = c.state.frame.id;
  await click(pill); await wait(700);
  step(`frame ${id}`, c.state.frame.id === id, `${was} → ${c.state.frame.id} ${c.state.frame.width}×${c.state.frame.height}`);
}
await shot('4x5');

const fz = await Commands.tryRun('/freeze beat', dir.id); await wait(1200);
step('freeze on the next beat', c.state.frozen === true);
const freezeBtn = [...L.querySelectorAll('button')].find((b) => /Freeze|Frozen/.test(b.textContent) && visible(b));
step('Freeze button shows frozen', /frozen|on|active/i.test(`${freezeBtn?.className} ${freezeBtn?.textContent}`), freezeBtn?.textContent.trim());

// 9. a still at the exact frame size, and a short recording (save dialogs are answered by the harness)
const stillBtn = L.querySelector('.stage-btn[title^="Still"]');
step('still button visible', visible(stillBtn) && hitOk(stillBtn));
await click(stillBtn);
await until(async () => (await J.saved()).some((f) => /\.png$/.test(f)), 8000);
step('still saved', (await J.saved()).some((f) => /1080x1350.*\.png$/.test(f)), await J.saved());
await click(freezeBtn); await wait(300);
step('unfrozen', c.state.frozen === false);
await Commands.tryRun('/song seek 0:02', dir.id);
await Commands.tryRun('/record 2s', dir.id);
await until(async () => (await J.saved()).some((f) => /\.(webm|mp4)$/.test(f)), 15000);
step('recorded 2 s', (await J.saved()).some((f) => /\.(webm|mp4)$/.test(f)), await J.saved());
await shot('recorded');

// 10. Code ⇄ Nodes (Alt+N) on the main layer: start it from a node preset, then turn a knob
const row = [...L.querySelectorAll('.ly-name')].find((n) => n.textContent.trim() === 'Layer 1');
if (row) await click(row);
step('Layer 1 selected', c.state.layer === 'Layer 1', c.state.layer);
c.code(true); await wait(300);
await click(pic(), { at: [0.5, 0.6] });
await key('n', { alt: true }); await wait(1200);
const nodesOn = () => [...L.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Nodes' && visible(b));
step('Alt+N shows nodes', /on|active|sel/.test(nodesOn()?.className || ''), nodesOn()?.className);
const presetsBtn = [...L.querySelectorAll('button')].find((b) => /^Presets…$/.test(b.textContent.trim()) && visible(b));
if (presetsBtn) {
  await click(presetsBtn); await wait(500);
  await type('pulse'); await wait(300); await key('Enter'); await wait(2500);
}
await shot('nodes');
const layerCode0 = ThreeLab.director.codeOf().code;
const vals = () => JSON.stringify(c.sliders().map((x) => x.value));
const sliders0 = vals();
const knob = [...L.querySelectorAll('.nv-knob')].find(visible);
if (knob) { knob.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(200); await J.drag(knob, [0.5, 0.5], [0.5, -4]); }
await wait(1200);
step('knob turned (code or slider changed)', ThreeLab.director.codeOf().code !== layerCode0 || vals() !== sliders0, { knob: knob?.getAttribute('class'), preset: ThreeLab.director.codeOf().code.slice(0, 60) });
await shot('knob');
await key('n', { alt: true }); await wait(800);

await shot('end');
return J.done();
