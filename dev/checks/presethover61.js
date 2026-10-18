// (round 61, presethover61) ✦ Preset hover over the Sound desk, with a fake Vital (a parameter list in the page, no
// audio runtime needed) and the fake engines: the window opens over the desk, drags (remembered), steps off the keys,
// folds to a pill and back; a description goes to a lean toolless helper turn with only the controls it needs, its JSON
// patch is validated (unknown key rejected, near-range clamped) and applied to the fake host; a follow-up tweak; undo /
// redo; save as a named preset; /preset from a chat on Claude and on Astra; the window leaves with the desk.
// node dev/smoke.js --fake-engines --script dev/checks/presethover61.js
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what = 'preset hover') => { for (let i = 0; i < 250; i++) { if (await fn()) return; await wait(60); } throw Error(`${what} timed out`); };
const out = { checks: 0 }; const ok = (v, msg) => { if (!v) throw Error(msg); out.checks++; console.log('[J] ✓ ' + msg); };
const usage = []; document.addEventListener('hearth:usage', e => { if (e.detail?.source === 'preset-hover') usage.push(e.detail.usage); });

// a fake Vital: the host's parameter shape ({ key, label, value, min, max, step, display, choices }), ~300 controls
const P = [];
const num = (key, label, value, min = 0, max = 1, display) => P.push({ key, label, value, min, max, step: null, display, choices: [] });
for (let o = 1; o <= 3; o++) { num(`osc_${o}_level`, `Osc ${o} Level`, .7); num(`osc_${o}_unison_detune`, `Osc ${o} Unison Detune`, 2.2, 0, 10); num(`osc_${o}_unison_voices`, `Osc ${o} Unison Voices`, 1, 1, 16); }
for (let f = 1; f <= 2; f++) { num(`filter_${f}_cutoff`, `Filter ${f} Cutoff`, 60, 8, 136, '262 Hz'); num(`filter_${f}_resonance`, `Filter ${f} Resonance`, .3); }
for (let e = 1; e <= 3; e++) for (const s of ['attack', 'decay', 'sustain', 'release']) num(`env_${e}_${s}`, `Env ${e} ${s}`, .2);
for (let l = 1; l <= 4; l++) num(`lfo_${l}_frequency`, `LFO ${l} Frequency`, 1, -7, 9);
num('reverb_dry_wet', 'Reverb Mix', .4); num('delay_dry_wet', 'Delay Mix', .2); num('chorus_dry_wet', 'Chorus Mix', .1);
for (let m = 1; m <= 64; m++) num(`modulation_${m}_amount`, `Modulation ${m} Amount`, 0, -1, 1);
for (let cc = 0; cc < 128; cc++) num(`midi_cc_${cc}`, `MIDI CC ${cc}`, 0);
const applied = [], kept = [];
const fakeHost = {
  current: () => ({ name: 'Vital', parameters: P }),
  // the real host's strict rule: every key known, every number in range
  apply: async values => { for (const [k, v] of Object.entries(values)) { const p = P.find(x => x.key === k); if (!p) throw Error(`Unknown parameter: ${k}`); if (typeof p.value === 'number' && (v < p.min || v > p.max)) throw Error(`Outside range: ${k}`); } applied.push(values); for (const [k, v] of Object.entries(values)) P.find(x => x.key === k).value = v; },
  snapshot: async () => 'z1:fakestate',
  keep: async (label, state) => { kept.push({ label, state }); },
};
const val = k => P.find(p => p.key === k).value;

// 1. the window opens over the Sound desk
await Lazy.load('creative'); activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 'workbench');
await CreativePlayground.openFeature('vst');
await until(() => document.querySelector('.wb-sound-desk .ph-win'), 'the ✦ Preset window');
PresetHover._test.useHost(fakeHost);
const win = document.querySelector('.ph-win'), desk = document.querySelector('.wb-sound-desk');
win.classList.remove('mini'); PresetHover._test.place(); await wait(80);
const r0 = win.getBoundingClientRect(), d0 = desk.getBoundingClientRect();
ok(win.checkVisibility() && r0.width > 200 && r0.left >= d0.left - 1 && r0.right <= d0.right + 1 && r0.top >= 0 && r0.bottom <= innerHeight, `the window floats over the Sound desk (${Math.round(r0.left)},${Math.round(r0.top)} ${Math.round(r0.width)}×${Math.round(r0.height)})`);
ok(getComputedStyle(win).position === 'fixed' && win.querySelector('.ph-inst').textContent === 'Vital', 'it hovers (fixed) and names the open instrument');

// 2. it never covers the instrument's key controls: a keyboard where it sits → it steps aside
const keys = document.createElement('div'); keys.className = 'wb-live-keys'; Object.assign(keys.style, { position: 'fixed', left: `${r0.left - 20}px`, top: `${r0.top - 10}px`, width: `${r0.width + 40}px`, height: `${r0.height + 20}px` }); desk.append(keys);
PresetHover._test.place(); await wait(50);
const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
ok(!hit(win.getBoundingClientRect(), keys.getBoundingClientRect()), 'with the keys where it sat, it moves off them by itself');

// 3. drag by the title: moves, remembered, and a drop onto the keys steps aside
const head = win.querySelector('.ph-head'), start = win.getBoundingClientRect();
const ptr = (type, x, y, n = head) => n.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 7 }));
ptr('pointerdown', start.left + 30, start.top + 8); ptr('pointermove', start.left + 10, start.top + 60); ptr('pointermove', start.left - 40, start.top + 120); ptr('pointerup', start.left - 40, start.top + 120);
const moved = win.getBoundingClientRect(), pos = store.get('presethover.pos', null);
ok(Math.abs(moved.left - start.left) > 20 && pos && Math.abs(pos.x * innerWidth - moved.left) < 2, `dragged ${Math.round(moved.left - start.left)},${Math.round(moved.top - start.top)} px and remembered`);
const k = keys.getBoundingClientRect(); ptr('pointerdown', moved.left + 30, moved.top + 8); ptr('pointermove', k.left + 40, k.top + 20); ptr('pointerup', k.left + 40, k.top + 20);
ok(!hit(win.getBoundingClientRect(), keys.getBoundingClientRect()), 'dropped on the keys, it lands beside them');
keys.remove();

// 4. fold to a pill and back
win.querySelector('.ph-fold').click(); await wait(30);
ok(win.classList.contains('mini') && win.querySelector('.ph-pill').checkVisibility() && win.getBoundingClientRect().width < 160 && store.get('presethover.mini') === true, `folds to a pill (${Math.round(win.getBoundingClientRect().width)} px), remembered`);
win.querySelector('.ph-pill').click(); await wait(30);
ok(!win.classList.contains('mini') && win.querySelector('.ph-input').checkVisibility(), 'the pill opens it again');

// 5. a description → a validated patch, applied live to the fake host (Claude)
store.set('presethover.engine', 'claude'); PresetHover._test.place(); const orig = Object.fromEntries(P.map(p => [p.key, p.value]));
const input = win.querySelector('.ph-input'); input.value = 'dark reese bass with slow movement';
input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await until(() => applied.length === 1 || win.querySelector('.ph-err'), 'the first patch');
ok(!win.querySelector('.ph-err'), `no error (${win.querySelector('.ph-err')?.textContent || ''})`);
const first = applied[0], firstKeys = Object.keys(first);
ok(firstKeys.length >= 3 && !('bogus_param' in first), `the patch set ${firstKeys.length} real controls; the unknown "bogus_param" was rejected`);
ok(firstKeys.every(k => { const p = P.find(x => x.key === k); return first[k] >= p.min && first[k] <= p.max; }), 'every value is inside its range (the one past its max was clamped)');
const aiLine = [...win.querySelectorAll('.ph-ai')].pop()?.textContent || '';
ok(/skipped 1/.test(aiLine) && /kept in range/.test(aiLine) && /tokens/.test(aiLine), `the reply line says what was skipped / clamped and its tokens: "${aiLine.slice(0, 120)}"`);
out.firstTokens = usage[0] ? usage[0].input + usage[0].output : null; out.firstInput = usage[0]?.input;
ok(usage.length === 1 && out.firstInput < 3000, `one lean helper turn: ${out.firstInput} input tokens (fake engine's count)`);

// 6. a follow-up: "brighter" opens the cutoff
const cutoff0 = val('filter_1_cutoff');
input.value = 'brighter'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await until(() => applied.length === 2 || win.querySelectorAll('.ph-err').length, 'the follow-up');
ok(val('filter_1_cutoff') > cutoff0, `the follow-up opened the cutoff ${cutoff0} → ${val('filter_1_cutoff')}`);
ok(/Tweak it/.test(input.placeholder), 'the box now asks for a tweak');

// 7. undo / redo each step
win.querySelector('.ph-undo').click(); await until(() => applied.length === 3, 'undo');
ok(val('filter_1_cutoff') === cutoff0, 'undo restores the cutoff exactly');
win.querySelector('.ph-redo').click(); await until(() => applied.length === 4, 'redo');
ok(val('filter_1_cutoff') > cutoff0 && win.querySelector('.ph-redo').disabled, 'redo re-applies it');
win.querySelector('.ph-undo').click(); await until(() => applied.length === 5, 'undo 2');
win.querySelector('.ph-undo').click(); await until(() => applied.length === 6, 'undo 3');
ok(firstKeys.every(k => val(k) === orig[k]) && val('filter_1_cutoff') === orig.filter_1_cutoff && win.querySelector('.ph-undo').disabled, 'undoing both steps puts every control back; nothing left to undo');
win.querySelector('.ph-redo').click(); await until(() => applied.length === 7, 'redo 2');

// 8. save as a named preset
win.querySelector('.ph-save').click(); await wait(30);
const name = win.querySelector('.ph-name'); ok(name && name.value === 'Dark Reese', 'Save asks for a name, the AI’s name filled in');
name.value = 'Night Reese'; name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await until(() => kept.length === 1, 'save');
ok(kept[0].label === 'Night Reese' && kept[0].state === 'z1:fakestate', 'saved as “Night Reese” with the plugin’s own state');

// 9. from a chat: /preset on Claude, then on Astra; undo / save by command
const claude = H.claudeAgent(); activate(claude.id); await wait(150);
let said = []; const ctxOpts = { say: t => said.push(t) };
await Commands.tryRun('/preset glassy pluck with a short echo', claude.id, null, ctxOpts);
await until(() => applied.length === 8 || said.some(t => /error|first/i.test(t)), '/preset');
await until(() => said.length, '/preset reply');
ok(applied.length === 8 && /control/.test(said.join(' ')), `/preset from a chat writes it: "${said.join(' ').slice(0, 140)}"`);
ok(document.querySelector('.wb-sound-desk .ph-win')?.checkVisibility(), '/preset opened the Sound desk with the window');
said = []; await Commands.tryRun('/preset astra: warm detuned pad', claude.id, null, ctxOpts); await until(() => said.length, '/preset astra');
ok(applied.length === 9 && usage.length === 4, `on Astra too (${said.join(' ').slice(0, 100)} | ${[...document.querySelectorAll('.ph-msg')].slice(-2).map(n => n.textContent).join(' / ')} | ${PresetHover._test.history().all().length})`);
said = []; await Commands.tryRun('/preset tweak less reverb', claude.id, null, ctxOpts); await until(() => said.length, '/preset tweak');
ok(applied.length === 10 && val('reverb_dry_wet') < .4, `/preset tweak less reverb → reverb mix ${val('reverb_dry_wet')}`);
said = []; await Commands.tryRun('/preset undo', claude.id, null, ctxOpts); await until(() => said.length, '/preset undo');
ok(applied.length === 11 && /Undid/.test(said[0]), `/preset undo: ${said[0]}`);
said = []; await Commands.tryRun('/preset save Pad One', claude.id, null, ctxOpts); await until(() => said.length, '/preset save');
ok(kept.length === 2 && kept[1].label === 'Pad One', `/preset save: ${said[0]}`);
ok(Commands.get('vst-preset') && Commands.get('preset'), '/vst-preset and /preset are registered');

// 10. the window leaves with the desk
await CreativePlayground.openFeature('texture'); await wait(200);
ok(!document.querySelector('.ph-win')?.isConnected, 'another station: the window is gone');
PresetHover._test.useHost(null);
out.result = `${out.checks} checks passed`;
return JSON.stringify(out);
