const assert = require('assert/strict'), vm = require('vm');
const C = require('../tools/creative-core'), G = require('../tools/creative-games');
let checks = 0; const ok = (v, why) => { assert(v, why); checks++; };
ok(C.FEATURES.length === 22 && new Set(C.FEATURES.map(f => f.id)).size === 22, '22 distinct features');
ok(JSON.stringify(C.palette('a')) === JSON.stringify(C.palette('a')), 'palette deterministic');
ok(C.svg('a') !== C.svg('b'), 'seeds change composition');
ok(!C.svg('</title><script>bad</script>').includes('<script>'), 'SVG escapes seed');
for (const type of ['poster', 'pattern', 'sprite']) { const s = C.svg('test', type); ok(s.startsWith('<svg') && s.endsWith('</svg>') && !s.includes('NaN'), type + ' valid source'); }
for (let seed = 0; seed < 60; seed++) {
  const m = C.maze(seed), seen = new Set(['1,1']), q = [[1, 1]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, key = `${nx},${ny}`; if (m.grid[ny]?.[nx] === 0 && !seen.has(key)) { seen.add(key); q.push([nx, ny]); } } }
  ok(seen.has(m.goal.join(',')), 'maze reachable'); ok(seen.size === m.grid.flat().filter(v => v === 0).length, 'no isolated corridors');
}
for (const bpm of [40, 110, 220]) {
  const pattern = C.drums('test'), x = C.beatAudio(pattern, bpm, .4), expected = Math.round(240 / bpm * 22050);
  ok(x.length === expected, 'exact one-bar duration'); ok(x.some(v => v !== 0) && x.every(v => Number.isFinite(v) && Math.abs(v) <= .901), 'drums finite and limited');
  const notes = C.melody('seed', 60, 'pentatonic'); ok(notes.every(n => [0, 3, 5, 7, 10].includes((n.note - 60) % 12)), 'notes in scale');
  const mel = C.melodyAudio(notes, bpm); ok(mel.length >= Math.round(16 * 60 / bpm * 22050), 'four bar melody');
  const midi = C.midi(notes, bpm), view = new DataView(midi.buffer); ok(Buffer.from(midi.slice(0, 4)).toString() === 'MThd' && view.getUint32(18) === midi.length - 22, 'MIDI track length');
  // Parse MIDI deltas, running event times and the final note-off; verify 32 balanced notes.
  let i = 22, ticks = 0, ons = 0, offs = 0;
  while (i < midi.length) { let delta = 0, b; do { b = midi[i++]; delta = (delta << 7) | (b & 127); } while (b & 128); ticks += delta; const status = midi[i++]; if (status === 255) { i++; const len = midi[i++]; i += len; } else { const n = midi[i++], velocity = midi[i++]; ok(n >= 0 && n <= 127 && velocity <= 127, 'valid MIDI note'); if (status === 144) ons++; else if (status === 128) offs++; else throw Error('unexpected MIDI event'); } }
  ok(ons === 32 && offs === 32 && ticks > 15 * 480, 'balanced MIDI notes and duration');
}
for (const kind of ['kick', 'snare', 'hat', 'pickup', 'jump', 'laser', 'impact']) {
  const x = C.synth(kind, .5), w = C.wav(x), dv = new DataView(w.buffer);
  ok(x.every(Number.isFinite) && x.some(v => Math.abs(v) > .01), 'audible ' + kind);
  ok(Buffer.from(w.slice(0, 4)).toString() === 'RIFF' && Buffer.from(w.slice(8, 12)).toString() === 'WAVE', 'WAV headers');
  ok(dv.getUint32(40, true) === x.length * 2 && dv.getUint32(4, true) + 8 === w.length && dv.getUint32(24, true) === 22050, 'WAV sizes and rate');
}
const ramp = Float32Array.from({ length: 1000 }, (_, i) => i / 1000);
const original = ramp.slice(), s = C.slice(ramp, 1000, .2, .8, true);
ok(s.length === 600 && s[0] === 0 && s.at(-1) === 0, 'slice size, reversed fades'); assert.deepEqual(ramp, original); checks++;
assert.throws(() => C.slice(ramp, 1000, .8, .2)); checks++;
const wet = C.effects(ramp, 1000, { drive: 1, cutoff: 100, echo: .7, crush: 12 }); ok(wet.every(v => Number.isFinite(v) && Math.abs(v) <= .901), 'effects bounded'); assert.deepEqual(ramp, original); checks++;
assert.deepEqual(C.quests('2026-10-16'), C.quests('2026-10-16')); checks++;
ok(C.quests('2026-10-17')[0].text !== C.quests('2026-10-16')[0].text, 'daily variety');
ok(C.streak(['2026-10-14', '2026-10-15'], '2026-10-16') === 2, 'streak allows today unfinished');
ok(C.streak(['2026-10-14', '2026-10-16'], '2026-10-16') === 1, 'streak respects gap');
ok(C.streak(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30') === 3, 'calendar dates across DST');
function game(mode) {
  const events = {}, buttons = {}, noop = () => {}, drawing = new Proxy({}, { get: (_, k) => k === 'measureText' ? () => ({ width: 1 }) : noop, set: () => true }); let raf, time = 0;
  const canvas = { getContext: () => drawing, addEventListener: (k, f) => { events['canvas:' + k] = f; }, focus: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) };
  for (const id of ['status', 'start', 'reset', 'sound', 'pad']) buttons[id] = { checked: false, textContent: '', addEventListener: (k, f) => { buttons[id][k] = f; }, click: () => buttons[id].clickHandler?.() };
  const document = { querySelector: s => s === 'canvas' ? canvas : buttons[s.slice(1)], querySelectorAll: () => [], addEventListener: (k, f) => { events[k] = f; }, hidden: false };
  const ctx = { document, window: { addEventListener: (k, f) => { events[k] = f; } }, parent: {}, performance: { now: () => time }, requestAnimationFrame: f => { raf = f; return 1; }, cancelAnimationFrame: () => { raf = null; }, console };
  const config = { mode, colors: C.palette('game'), seed: 12, bpm: 110, difficulty: 1, style: 'orbit', maze: C.maze('game') };
  vm.runInNewContext(`(${G.runtime.toString()})(${JSON.stringify(config)})`, ctx);
  buttons.start.click(); // overwritten by event listener registration below
  buttons.start.click = buttons.start.clickHandler = buttons.start['click'];
  // addEventListener stores the click callback as .click, so invoke it directly.
  if (!raf) buttons.start.click();
  ok(Boolean(raf), mode + ' starts'); for (let i = 0; i < 10; i++) { time += 16; raf?.(time); }
  if (mode === 'rhythm') {
    while (time < 1984) { time += 16; raf?.(time); }
    const firstLane = Math.floor(((Math.imul(12, 1664525) + 1013904223) >>> 0) / 4294967296 * 4);
    events.keydown({ key: 'asdf'[firstLane], preventDefault: noop }); time += 16; raf?.(time);
    ok(buttons.status.textContent.includes('100 points'), 'rhythm hit scores in timing window');
  }
  if (mode === 'maze') {
    const m = config.maze, q = [[1, 1, []]], seen = new Set(['1,1']); let route;
    while (q.length) { const [x, y, path] = q.shift(); if (x === m.goal[0] && y === m.goal[1]) { route = path; break; } for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]]) { const nx = x + dx, ny = y + dy, id = `${nx},${ny}`; if (m.grid[ny]?.[nx] === 0 && !seen.has(id)) { seen.add(id); q.push([nx, ny, [...path, key]]); } } }
    for (const key of route) events.keydown({ key, preventDefault: noop });
    ok(buttons.status.textContent.includes('Found the exit'), 'maze keyboard path reaches win');
  }
  events.message({ source: ctx.parent, data: { creative: 'pause' } }); ok(!raf, mode + ' pauses on navigation');
  const html = G.html(config); ok(html.includes('</script>') && !html.includes('https://'), mode + ' offline export'); new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]); checks++;
}
for (const mode of ['motion', 'reactive', 'arena', 'maze', 'rhythm']) game(mode);
const injection = G.html({ seed: '</script><script>bad()</script>' }); ok((injection.match(/<script>/g) || []).length === 1, 'HTML config escaped');
console.log(`creative-test: ${checks} checks passed`);
