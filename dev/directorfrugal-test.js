#!/usr/bin/env node
// (round 49, directorfrugal) The Three Director gets typical tasks done in fewer steps (each step re-reads the whole
// context). Pure parts and budgets, no Electron:
//   - the six scripted tasks (dev/directorfrugal-measure.js): steps and input tokens per task within budget, every
//     after result really holds what the dropped calls were for (an error's lines + fix, the layer list, colours,
//     pictures), the fixed part didn't grow
//   - error hints and context, colours in the outline, the automatic small picture's rules (errors, no visible change,
//     a batch that looks itself, shot: false, /director-autoshot off), help once per chat session ("same as before")
//   node dev/directorfrugal-test.js
const path = require('path');
const { measureAll, harness, TASKS } = require('./directorfrugal-measure');
const { loadDirector, fakeLab, dimsOf } = require('./directorlean-lab');

const fails = [];
const check = (ok, label) => { console.log(`${ok ? '✓' : '✖'} ${label}`); if (!ok) fails.push(label); };

// per task, after: at most these steps, at most these input tokens over its steps (round 1, today ≈ 2.1k a step)
const BUDGET = { beat: [3, 9200], fix: [3, 7300], palette: [3, 7300], camera: [3, 7300], vertical: [3, 7200], still: [3, 7500] };

(async () => {
  const D = loadDirector('work').D;
  const T = D._test;
  // ---------- pure parts ----------
  check(/import \* as THREE from 'three'/.test(T.errHint('THREE is not defined')) && /declare nope/.test(T.errHint('nope is not defined')), 'hint: a missing name / THREE');
  check(/before \.x is undefined/.test(T.errHint("Cannot read properties of undefined (reading 'x')")) && /three\/addons/.test(T.errHint('THREE.OrbitControls is not a constructor')) && /const is reassigned/.test(T.errHint('Assignment to constant variable.')), 'hint: undefined property, an addon class, a const');
  check(T.errHint('something odd happened') === '', 'no hint for an unknown error');
  const ctx = T.errorContext('a\n  b\n    c\n  d\ne\nf', 3);
  check(ctx === '1| a\n2|   b\n3>     c\n4|   d\n5| e', `context: ±2 lines, the error's marked (${JSON.stringify(ctx)})`);
  check(T.errorContext('a', 9) === '', 'context: a line outside the code → nothing');
  const cols = T.codeColors("// '#000000' in a comment\nconst a = '#ff3cac', b = \"#2B86C5\";\nnew THREE.Color(0x112233);\nconst c = '#ff3cac';");
  check(cols === '#ff3cac l2, #2B86C5 l2, 0x112233 l3', `colours: once each, with their line, comments skipped (${cols})`);
  check(/\+2$/.test(T.codeColors(Array.from({ length: 8 }, (_, i) => `x${i} = '#00000${i}';`).join('\n'))), 'colours: at most 6 per layer');

  // ---------- results that make the next call unneeded ----------
  {
    const { s, call } = harness('work');
    s.turn();
    s.lab.breakLayer('Sparkles', 57, 'nope is not defined', 2);
    const c = await call('three_console', {});
    check(/\(×2\)/.test(c.text) && /fix: declare nope/.test(c.text) && /^near:\n(.*\n){2}57> /m.test(c.text), 'console: the error once (×2), its fix, the lines around it');
    const e = await call('three_edit_code', { layer: 'Glow', edits: [{ find: "strength: { value: 0.9,", replace: "strength: { value: 1.2," }] });
    check(e.images === 0 && !/errors: none/.test(e.text), 'an edit while the scene has errors: no picture, no "errors: none"');
    s.lab.S.errors.length = 0;
    const e2 = await call('three_edit_code', { layer: 'Glow', edits: [{ find: "strength: { value: 1.2,", replace: "strength: { value: 1.3," }] });
    check(e2.images === 1 && /errors: none/.test(e2.text) && Math.max(...Object.values(dimsOf(e2.r.images[0].data))) === 384, 'a clean edit: "errors: none" + a 384 px picture');
    const e3 = await call('three_edit_code', { layer: 'Glow', edits: [{ find: "strength: { value: 1.3,", replace: "strength: { value: 1.4," }] });
    s.lab.S.pixel += 0; // (the fake's picture changes with every code run)
    check(e3.images === 1, 'a later edit that changed the picture: its picture too');
    const sh = await call('three_screenshot', {});
    check(!sh.images && /No visible change since your previous picture/.test(sh.text), 'a screenshot right after: "no visible change" (the edit\'s picture is the same view)');
    const e4 = await call('three_edit_code', { layer: 'Glow', shot: false, edits: [{ find: "strength: { value: 1.4,", replace: "strength: { value: 1.5," }] });
    check(e4.images === 0, 'shot: false: no picture');
    const b = await call('three_batch', { ops: [{ cmd: 'sliders', layer: 'Tunnel', set: { bloom: 2 } }, { cmd: 'screenshot', size: 'medium' }] });
    check(b.images === 1 && Math.max(...Object.values(dimsOf(b.r.images[0].data))) === 768, 'a batch that takes its own screenshot: only that picture');
    const st = s.D.saved();
    check(st.autoShots >= 2, `saved(): automatic pictures counted (${st.autoShots})`);
  }
  {
    // the same picture again: a note instead
    const { s, call } = harness('work');
    s.turn();
    await call('three_screenshot', {});
    const m = await call('three_update_layer', { layer: 'Glow', settings: { name: 'Glow' } });
    check(!m.images && /picture: no visible change/.test(m.text), 'a change that shows nothing new: "picture: no visible change", no picture');
  }
  {
    // /director-autoshot off: only shot: true
    const { D: D2, store } = loadDirector('work');
    store.set('director.autoShot', false);
    const lab = fakeLab();
    const r = await D2.handle('three_edit_code', { layer: 'Glow', edits: [{ find: "strength: { value: 0.9,", replace: "strength: { value: 1.1," }] }, lab.d, {});
    const r2 = await D2.handle('three_edit_code', { layer: 'Glow', shot: true, edits: [{ find: "strength: { value: 1.1,", replace: "strength: { value: 1.2," }] }, lab.d, {});
    check(!r.images && r2.images?.length === 1, '/director-autoshot off: a picture only with shot: true');
  }
  {
    // help once per chat session, through the hub's memory; force, a new chat and an error start again
    const three = require(path.join(__dirname, '..', 'mcp', 'three-mcp.js'));
    const { D: D3 } = loadDirector('work');
    const ask = (chatId) => async (t, a) => D3.seen(a, { chatId });
    const sess = { id: 'c1', session: { id: 's1' } };
    D3.newTurn('c1', sess); D3._test.endTurn({ type: 'done' }, sess);
    D3.newTurn('c1', sess);
    const h1 = await three.helpOnce({ topic: 'audio' }, ask('c1'));
    const h2 = await three.helpOnce({ topic: 'music' }, ask('c1'));
    check(h1.length > 2000 && /^help music: same as before \(you got it earlier in this reply/.test(h2), 'help: a topic it has (by another name) is one line');
    D3._test.endTurn({ type: 'done' }, sess); D3.newTurn('c1', sess);
    const h3 = await three.helpOnce({ topic: 'audio' }, ask('c1'));
    const h4 = await three.helpOnce({ topic: 'audio', force: true }, ask('c1'));
    check(/1 message ago/.test(h3) && h4 === h1, 'help: next message one line; force: true sends it whole');
    check((await three.helpOnce({ topic: 'audio' }, ask('c2'))) === h1, 'help: another chat gets it whole');
    D3._test.endTurn({ type: 'error' }, sess); D3.newTurn('c1', sess);
    check((await three.helpOnce({ topic: 'audio' }, ask('c1'))) === h1, 'help: after an error the chat starts fresh');
    check((await three.helpOnce({ topic: 'frame' }, ask('c1'))) === (await three.helpOnce({ topic: 'frame' }, ask('c1'))), 'help: a short topic always comes whole');
    const none = async () => ({ ok: false, error: 'no hub' });
    const n1 = await three.helpOnce({ topic: 'layers' }, none);
    const n2 = await three.helpOnce({ topic: 'layers' }, none);
    check(n1.length > 400 && /same as before \(you got it earlier in this reply/.test(n2), 'help without a hub: this run\'s own memory');
    check(/\/camera-moves push in/.test(await three.helpOnce({ topic: 'camera', force: true })) && /MOTION DESIGN KIT/.test(await three.helpOnce({ topic: 'motion', force: true }, none)), 'help camera: the camera moves (the motion kit stays on help motion)');
  }

  // ---------- the six tasks ----------
  const m = await measureAll();
  check(m.after.fixed <= m.before.fixed, `the fixed part didn't grow (${m.before.fixed} → ${m.after.fixed} tokens a step)`);
  for (const [i, b] of m.before.tasks.entries()) {
    const a = m.after.tasks[i];
    const t = TASKS.find((x) => x.key === a.key);
    const [maxSteps, maxTok] = BUDGET[a.key];
    check(a.calls.every((c) => c.ok), `${a.label} (round ${a.round}): every call works`);
    check(a.steps <= maxSteps && a.steps < b.steps, `${a.label} (round ${a.round}): ${b.steps} → ${a.steps} steps (budget ${maxSteps})`);
    if (a.round === 1) check(a.tokens <= maxTok && a.tokens < b.tokens, `${a.label}: ${b.tokens} → ${a.tokens} input tokens (budget ${maxTok})`);
    else check(a.tokens < b.tokens, `${a.label} again: ${b.tokens} → ${a.tokens} tokens`);
    // what the dropped calls were for is in the results the after script got (round 2: the session has it already)
    for (const [k, need, what] of a.round === 1 ? t.needs : []) {
      const c = a.calls[k];
      check(need === 'image' ? c.images > 0 : need.test(c.text), `${a.label} (round ${a.round}): ${what} is in its ${c.tool} result`);
    }
  }
  const sum = (w, k, round) => m[w].tasks.filter((x) => x.round === round).reduce((n, x) => n + x[k], 0);
  check(sum('after', 'steps', 1) <= 18 && sum('after', 'tokens', 1) < sum('before', 'tokens', 1) * 0.55, `all six: ${sum('before', 'steps', 1)} → ${sum('after', 'steps', 1)} steps, ${sum('before', 'tokens', 1)} → ${sum('after', 'tokens', 1)} tokens (≥ 45 % less)`);
  check(m.after.tasks.filter((x) => x.round === 2).every((x) => x.calls.every((c) => c.tool !== 'help' || c.textTok < 40)), 'asked again later in the chat: every help is one line');

  // ---------- byte-stable answers (same calls, same bytes) ----------
  const texts = [];
  for (let i = 0; i < 2; i += 1) {
    const { s, call } = harness('work');
    s.turn();
    const out = [];
    for (const [tool, a] of [['three_get_code', {}], ['three_console', {}], ['three_edit_code', { layer: 'Glow', edits: [{ find: "radius: { value: 0.5,", replace: "radius: { value: 0.6," }] }], ['three_help', { topic: 'camera' }]]) out.push((await call(tool, a)).text);
    texts.push(out.join('\n'));
  }
  check(texts[0] === texts[1], 'the same calls on the same scene: byte-identical results');

  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
