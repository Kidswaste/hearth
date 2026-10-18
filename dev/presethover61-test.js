#!/usr/bin/env node
// (round 61, presethover61) ✦ Preset hover, the pure part (tools/preset-hover-core.js): which parameters a request sends
// (sections, cap, the mod matrix / MIDI lanes left out), the prompt's size, reading a reply, validating a patch against
// the real list (unknown keys rejected, near-range clamped, far-off rejected, switches / choices), undo / redo.
//   node dev/presethover61-test.js
const C = require('../tools/preset-hover-core.js');
let n = 0; const ok = (v, msg) => { if (!v) { console.error('FAIL ' + msg); process.exit(1); } n++; console.log('✓ ' + msg); };

// a Vital-sized fake list: 3 oscillators, 2 filters, 6 envelopes, 8 LFOs, effects, a 64-slot mod matrix, MIDI lanes
const P = [];
const num = (key, label, value, min = 0, max = 1, display) => P.push({ key, label, value, min, max, step: null, display, choices: [] });
for (let o = 1; o <= 3; o++) { num(`osc_${o}_level`, `Osc ${o} Level`, .7); num(`osc_${o}_unison_voices`, `Osc ${o} Unison Voices`, 1, 1, 16); num(`osc_${o}_unison_detune`, `Osc ${o} Unison Detune`, 2.2, 0, 10); num(`osc_${o}_transpose`, `Osc ${o} Transpose`, 0, -48, 48); num(`osc_${o}_wave_frame`, `Osc ${o} Wave Frame`, 0, 0, 256); }
for (let f = 1; f <= 2; f++) { num(`filter_${f}_cutoff`, `Filter ${f} Cutoff`, 60, 8, 136, '262 Hz'); num(`filter_${f}_resonance`, `Filter ${f} Resonance`, .3); num(`filter_${f}_drive`, `Filter ${f} Drive`, 0, 0, 20); P.push({ key: `filter_${f}_on`, label: `Filter ${f} Switch`, value: false, min: 0, max: 1, choices: [] }); }
for (let e = 1; e <= 6; e++) for (const s of ['attack', 'decay', 'sustain', 'release']) num(`env_${e}_${s}`, `Env ${e} ${s}`, .2);
for (let l = 1; l <= 8; l++) { num(`lfo_${l}_frequency`, `LFO ${l} Frequency`, 1, -7, 9); num(`lfo_${l}_smooth`, `LFO ${l} Smooth`, 0, 0, 1); }
num('reverb_dry_wet', 'Reverb Mix', .25); num('reverb_size', 'Reverb Size', .5); num('delay_dry_wet', 'Delay Mix', .2); num('chorus_dry_wet', 'Chorus Mix', .1); num('distortion_drive', 'Distortion Drive', 0, -30, 30);
P.push({ key: 'distortion_type', label: 'Distortion Type', value: 'Soft Clip', min: null, max: null, choices: ['Soft Clip', 'Hard Clip', 'Linear Fold', 'Sine Fold', 'Bit Crush', 'Down Sample'] });
for (let m = 1; m <= 64; m++) { num(`modulation_${m}_amount`, `Modulation ${m} Amount`, 0, -1, 1); num(`modulation_${m}_bipolar`, `Modulation ${m} Bipolar`, 0); }
for (let cc = 0; cc < 128; cc++) num(`midi_cc_${cc}`, `MIDI CC ${cc}`, 0, 0, 1);
num('volume', 'Volume', 5000, 0, 7400); num('macro_control_1', 'Macro 1', 0);

// 1. what a request sends
const reese = C.pick(P, 'dark reese bass with slow movement');
const keys = Object.values(reese.groups).flat().map(p => p.key);
ok(reese.count <= C.CAP && reese.count >= 12, `the reese request sends ${reese.count} of ${P.length} controls (cap ${C.CAP})`);
ok(['osc', 'filter', 'lfo'].every(s => reese.groups[s]?.length), `grouped by section: ${Object.keys(reese.groups).join(', ')}`);
ok(keys.includes('osc_1_unison_detune') && keys.includes('filter_1_cutoff') && keys.includes('lfo_1_frequency'), 'the detune, the cutoff and the first LFO are in');
ok(!keys.some(k => /^modulation_|^midi_cc_/.test(k)), 'the mod matrix and MIDI CC lanes stay out');
const verb = C.pick(P, 'less reverb');
ok(Object.keys(verb.groups).includes('reverb') && Object.values(verb.groups).flat().some(p => p.key === 'reverb_dry_wet'), 'a reverb tweak sends the reverb');
const touched = C.pick(P, 'brighter', { touched: ['osc_2_level'] });
ok(Object.values(touched.groups).flat().some(p => p.key === 'osc_2_level') && touched.groups.filter, 'a follow-up keeps what earlier steps changed, and "brighter" wakes the filter');
ok(C.sectionOf({ key: 'filter_1_drive', label: 'Filter 1 Drive' }) === 'filter' && C.sectionOf({ key: 'distortion_drive', label: 'Distortion Drive' }) === 'dist', 'a section name wins over what the control does');

// 2. the prompt: compact, every line real
const text = C.prompt({ instrument: 'Vital', request: 'dark reese bass with slow movement', groups: reese.groups });
ok(/^PATCH FOR Vital/.test(text) && /filter_1_cutoff=60 \[8\.\.136\] 262 Hz/.test(text), 'one short line per control: key=now [min..max] shown value');
ok(/distortion_type=Soft Clip \{Soft Clip\|Hard Clip/.test(text) || !keys.includes('distortion_type'), 'choices read {a|b|c}');
const tk = C.tokens(text) + C.tokens(C.PERSONA);
ok(tk < 1100, `the whole request is ≈ ${tk} tokens (persona + ${reese.count} controls)`);
ok(!/state|z1:/.test(text), 'no plugin state in the prompt');
const follow = C.prompt({ instrument: 'Vital', request: 'brighter', groups: touched.groups, steps: [{ request: 'dark reese bass' }] });
ok(/Earlier \(already applied/.test(follow) && /"dark reese bass"/.test(follow), 'a follow-up names the earlier request in one line');

// 3. reading replies
ok(C.parse('{"set":{"osc_1_level":0.5},"name":"Dark Reese","say":"ok"}').set.osc_1_level === .5, 'plain JSON');
ok(C.parse('Sure!\n```json\n{"set":{"a":1},"name":"X {curly}"}\n```').name === 'X {curly}', 'code fence + prose + braces inside strings');
ok(C.parse('{"osc_1_level":0.4,"say":"flat"}').set.osc_1_level === .4, 'a flat object is the patch');
let threw = false; try { C.parse('no json here'); } catch { threw = true; } ok(threw, 'no JSON → a plain error');
threw = false; try { C.parse('{"set":{"a":1}'); } catch { threw = true; } ok(threw, 'cut-off JSON → a plain error');

// 4. validation against the real list
const v = C.validate(P, { osc_1_level: .9, bogus: 1, filter_1_cutoff: 140, filter_2_cutoff: 9000, filter_1_on: 1, distortion_type: 'hard clip', reverb_dry_wet: '0.1', osc_1_unison_voices: 7.4, env_1_attack: .2, chorus_dry_wet: 'lots', distortion_drive: 'x', lfo_1_smooth: true });
ok(v.values.osc_1_level === .9, 'a value in range passes');
ok(v.rejected.some(r => r.key === 'bogus' && /unknown/.test(r.why)), 'an unknown parameter is rejected');
ok(v.values.filter_1_cutoff === 136 && v.clamped.includes('filter_1_cutoff'), 'a value a little past its max is kept in range');
ok(v.rejected.some(r => r.key === 'filter_2_cutoff'), 'a value far off its scale (Hz for a note number) is rejected, not guessed');
ok(v.values.filter_1_on === true, 'a switch takes 1 / 0 / on / off');
ok(v.values.distortion_type === 'Hard Clip', 'a choice matches without case');
ok(v.values.reverb_dry_wet === .1, 'a number written as text is read');
ok(!('env_1_attack' in v.values), 'an unchanged value is dropped');
ok(v.rejected.some(r => r.key === 'chorus_dry_wet') && v.rejected.some(r => r.key === 'lfo_1_smooth'), 'words / booleans for a number are rejected');
const many = Object.fromEntries(P.slice(0, 60).map(p => [p.key, typeof p.value === 'number' ? p.min : p.value]));
ok(Object.keys(C.validate(P, many).values).length <= C.MAX_SET, `at most ${C.MAX_SET} changes a step`);
ok(C.validate(P, [1, 2]).rejected.length === 1, 'an array is not a patch');
// normalized (0–1) controls: the host's own rule, honored
const norm = [{ key: 'serum_a_level', label: 'A Level (0–1)', value: .5, min: 0, max: 1, step: .001, choices: [] }];
ok(C.validate(norm, { serum_a_level: 1.04 }).values.serum_a_level === 1 && C.validate(norm, { serum_a_level: 80 }).rejected.length === 1, 'a normalized control stays 0–1');

// 5. undo / redo
const h = C.history();
h.push({ request: 'a', before: { x: 1 }, after: { x: 2 } }); h.push({ request: 'b', before: { x: 2 }, after: { x: 3 } });
ok(h.undo().request === 'b' && h.canRedo && h.redo().request === 'b' && !h.canRedo, 'undo then redo the last step');
h.undo(); h.push({ request: 'c', before: { x: 2 }, after: { x: 9 } });
ok(!h.canRedo && h.applied().map(s => s.request).join() === 'a,c', 'a new step after an undo drops the redo branch');
ok(JSON.stringify(C.before(P, { osc_1_level: .1 })) === '{"osc_1_level":0.7}', 'before() keeps the values a step replaced');
console.log(`presethover61-test: ${n} passed`);
