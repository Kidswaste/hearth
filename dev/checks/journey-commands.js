// Journey 4: journey 1 (a music visual from scratch) done only with /commands typed in the composer, including the
// "/" menu with arrow keys, Tab and Enter. Each step checks the Lab's state afterwards.
//   node dev/make-test-song.js /tmp/hearth-test-song.wav
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/journey-commands.js --shot /tmp/j4.png
const { wait, until, step, click, key, type, shot, visible } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-test-song.wav';
const C = H.claudeAgent();
const menuItems = () => [...document.querySelectorAll('.slash-menu .slash-item')].map((n) => n.querySelector('b')?.textContent);
// types into an agent's composer key by key-ish (insertText per chunk), then presses the given keys
async function typeIn(id, text, keys = ['Enter'], ms = 500) {
  if (!visible(Native.view(id)?.input)) { activate(id); await wait(400); }
  const inp = Native.view(id).input;
  await click(inp); await type(text); await wait(250);
  for (const k of keys) { await key(k); await wait(200); }
  await wait(ms);
  return inp.value;
}
const lastNote = (id) => [...Native.view(id).list.querySelectorAll('.msg.note .body')].at(-1)?.textContent.trim().slice(0, 120) || '';

// 1. "/director-s" + Enter completes the name, Enter again runs it
activate(C.id); await wait(400);
const completed = await typeIn(C.id, '/director-s', ['Enter'], 300);
step('Enter completes a partly typed command', completed.trim() === '/director-setup', completed);
await key('Enter'); await wait(1500);
await until(() => H.agents().some((a) => a.dock === 'three'), 6000);
const dir = H.agents().find((a) => a.dock === 'three');
step('/director-setup docked the director', Boolean(dir) && H.surfaceIdFor(H.activeId) === 'tool:three');
const c = await ThreeLab.cmd(); await wait(2000);
const D = dir.id;

// 2. the song, play, tempo, markers
await typeIn(D, `/song load ${SONG}`, ['Enter'], 2500);
step('/song load', /hearth-test-song/.test(c.state.song || ''), lastNote(D));
await until(() => c.state.bpm, 8000);
await typeIn(D, '/play', ['Enter'], 300);
await until(() => c.state.playing, 8000);
step('/play plays the song in the Lab (not Video Review)', c.state.playing && H.surfaceIdFor(H.activeId) === 'tool:three', { playing: c.state.playing, surface: H.surfaceIdFor(H.activeId) });
await typeIn(D, '/tap 120');
step('/tap 120', Math.round(c.state.bpm) === 120, lastNote(D));
await typeIn(D, '/fill-markers kicks', ['Enter'], 800);
const bm = await window.hub.kvGet('three-beatmaps');
step('/fill-markers kicks', (Object.values(bm || {})[0]?.marks?.kick?.length || 0) >= 8, lastNote(D));

// 3. ask the director (a plain message), then /undo-edit
const first = ThreeLab.director.codeOf().code.split('\n').find((l) => l.trim());
await typeIn(D, `Make it pulse, mcp\nmcp: ${JSON.stringify([['three_edit_code', { edits: [{ find: first, replace: `${first} // by the director` }] }]])}`, ['Enter'], 300);
await until(() => !Native.isBusy(H.activeChat[D]), 60000); await wait(500);
step('director edited the code', ThreeLab.director.codeOf('Layer 1').code.includes('// by the director'));
await typeIn(D, '/undo-edit', ['Enter'], 1500);
step('/undo-edit', !ThreeLab.director.codeOf('Layer 1').code.includes('// by the director'), lastNote(D));

// 4. an FX filter and a look
const n0 = c.layers().length;
await typeIn(D, '/fx vhs', ['Enter'], 1500);
step('/fx vhs added a filter layer', c.layers().length === n0 + 1, c.layers().map((x) => x.name));
const pal0 = JSON.stringify(c.palette());
await typeIn(D, '/look-apply neon', ['Enter'], 1500);
step('/look-apply neon', JSON.stringify(c.palette()) !== pal0 || c.layers().length > n0 + 1, lastNote(D));
await typeIn(D, '/layer Layer 1', ['Enter'], 500);
step('/layer Layer 1 selects it', c.state.layer === 'Layer 1');

// 5. Nodes: a node preset gives named sliders (the starter sketch has only raw values, which shuffle leaves alone), a knob

await typeIn(D, '/nodes-preset pulse-rings', ['Enter'], 2500);
step('/nodes-preset pulse-rings', /@nodes/.test(ThreeLab.director.codeOf().code), lastNote(D));
const before = JSON.stringify(c.sliders().map((x) => x.value));
const knobBox = await typeIn(D, '/knob bloom st', ['Tab'], 200);
step('Tab completes a slider name with its dot', knobBox === '/knob Bloom · Strength', knobBox);
await type(' 0.8'); await key('Enter'); await wait(800);
step('/knob moves a slider', JSON.stringify(c.sliders().map((x) => x.value)) !== before, lastNote(D));
// 6. shuffle and save, three times
let saved = 0;
for (let i = 0; i < 3; i++) {
  await typeIn(D, '/shuffle', ['Enter'], 500);
  await typeIn(D, '/save', ['Enter'], 600);
  if (/Saved \d+ slider/.test(lastNote(D))) saved += 1;
}
step('/shuffle + /save ×3', saved === 3, lastNote(D));

// 7. sizes, with the menu: "/size 9" + Enter completes to 9:16, Enter runs; "/size " + ↓↓↓ picks the 4th size
const v916 = await typeIn(D, '/size 9', ['Enter'], 200);
step('menu completes /size 9 → /size 9:16', v916.trim() === '/size 9:16', v916);
await key('Enter'); await wait(800);
step('/size 9:16', c.state.frame.id === '9:16');
const opts = (await typeIn(D, '/size ', [], 200), menuItems());
await key('ArrowDown'); await key('ArrowDown'); await key('ArrowDown'); await wait(150);
const picked = menuItems()[3];
await key('Enter'); await wait(200); await key('Enter'); await wait(800);
step('↓↓↓ + Enter picks the 4th size and runs it', c.state.frame.id === picked, { menu: opts.slice(0, 6), picked, frame: c.state.frame.id });

// 8. freeze on a beat, a still, a recording
await typeIn(D, '/freeze beat', ['Enter'], 1200);
step('/freeze beat', c.state.frozen === true, lastNote(D));
await typeIn(D, '/still', ['Enter'], 2000);
await until(async () => (await J.saved()).some((f) => /\.png$/.test(f)), 6000);
step('/still saved a PNG', (await J.saved()).some((f) => /\.png$/.test(f)), await J.saved());
await typeIn(D, '/freeze off', ['Enter'], 400);
step('/freeze off', c.state.frozen === false);
await typeIn(D, '/record 2s', ['Enter'], 300);
await until(async () => (await J.saved()).some((f) => /\.(webm|mp4)$/.test(f)), 15000);
step('/record 2s saved a video', (await J.saved()).some((f) => /\.(webm|mp4)$/.test(f)), await J.saved());

await typeIn(D, '/nodes code', ['Enter'], 500);
await shot('commands-end');
return J.done();
