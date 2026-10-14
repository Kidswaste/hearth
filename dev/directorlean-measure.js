#!/usr/bin/env node
// (round 37, directorlean) What each Three Director turn sends the model, per typical ask, before → after.
// The director's tool results are what grows its input: every result (text and pictures) is added to the engine
// session's history and re-read with every later step of the chat (cached, ≈ 0.1× after the first read). This runs the
// owner's typical asks as the director makes them (the calls its usage counts show most: get / read / search code,
// edits, screenshots, sliders, media control, play-tests, contact sheets) through tools/three-director.js — the round 36
// version (git ref, default 7d8cb4e) and this one — on the same fake Lab scene (dev/directorlean-lab.js), and counts
// what comes back: text tokens ≈ characters / 4 (as the MCP server formats it, mcp/common.js fmtValue) and pictures
// ≈ width × height / 750. The asks run as ONE chat session (one message each), like the owner's director chats.
//   node dev/directorlean-measure.js              the table
//   node dev/directorlean-measure.js --json       the numbers
//   node dev/directorlean-measure.js --calls      every call's tokens
//   node dev/directorlean-measure.js --before <git ref>
const { session, TUNNEL } = require('./directorlean-lab');

const argv = process.argv.slice(2);
const BEFORE = argv.includes('--before') ? argv[argv.indexOf('--before') + 1] : '7d8cb4e';
const FIXED = 2829; // the director's fixed part per step (prompt + tool lists, node dev/tokens-test.js), the same before / after (±2)

const pinkEdits = [{ find: "colorA: { value: '#ff3cac'", replace: "colorA: { value: '#ff4fa8'" }, { find: "colorB: { value: '#2b86c5'", replace: "colorB: { value: '#ffc2e0'" }];
const SPARK_KICK = "onHit('kick', (s) => { punch = Math.max(punch, s); });";
// The asks, in the order one chat would have them. Each: the calls the director makes for it (args as it sends them).
// `before` runs owner actions between messages (an error appears, a slider is saved…).
const ASKS = [
  { label: 'change a color ("make the rings pink")', calls: [
    ['three_get_code', {}],
    ['three_edit_code', { edits: pinkEdits }],
    ['three_screenshot', {}],
  ] },
  { label: 'add a layer ("sparkles that burst on the kick")', calls: [
    ['three_add_layer', { name: 'Sparkles 2', code: 'SPARKLES' }],
    ['three_screenshot', {}],
    ['three_sliders', { layer: 'top', set: { burst: 2, color: '#9be7ff' } }],
    ['three_screenshot', {}],
  ] },
  { label: 'fix an error (the Lab\'s "fix it" draft)', before: (lab) => lab.breakLayer('Sparkles', 41, "Uncaught TypeError: Cannot read properties of undefined (reading 'getY')"), calls: [
    ['three_console', {}],
    ['three_read_code', { layer: 'Sparkles', around: 41 }],
    ['three_edit_code', { layer: 'Sparkles', edits: [{ find: 'const pos = points.geometry.attributes.position;', replace: 'const pos = points?.geometry.attributes.position;\n  if (!pos) return;' }] }],
    ['three_console', {}],
    ['three_screenshot', {}],
  ] },
  { label: '"make it feel more energetic"', calls: [
    ['three_get_code', {}],
    ['three_read_code', { layer: 'Tunnel' }],
    ['three_sliders', { layer: 'Tunnel' }],
    ['three_eval', { code: 'return { speed: P.speed, kick: P.kick, bloom: P.bloom }' }],
    ['three_edit_code', { layer: 'Tunnel', edits: [{ find: 'speed: { value: 0.8,', replace: 'speed: { value: 1.6,' }, { find: 'kick: { value: 0.4,', replace: 'kick: { value: 1.1,' }] }],
    ['three_sliders', { layer: 'Sparkles', set: { rise: 1.2, swirl: 1.5, burst: 2.6 } }],
    ['three_media_control', { action: 'seek', time: 64.1 }],
    ['three_screenshot', {}],
    ['three_screenshot', { frames: 4, gap: 0.25 }],
  ] },
  { label: 'follow-up ("a bit more glow"), the owner saved sliders', before: (lab) => lab.ownerEdit('Tunnel', 'bloom: { value: 1.1,', 'bloom: { value: 1.3,'), calls: [
    ['three_read_code', { layer: 'Tunnel' }],
    ['three_edit_code', { layer: 'Tunnel', edits: [{ find: 'bloom: { value: 1.3,', replace: 'bloom: { value: 1.8,' }] }],
    ['three_screenshot', {}],
  ] },
  { label: 'play-test ("click to burst")', calls: [
    ['three_input', { actions: [{ click: [0.5, 0.5] }, { wait: 300 }], screenshot: true }],
  ] },
  { label: 'whole song ("show me the whole piece")', calls: [
    ['three_media_control', { action: 'play' }],
    ['three_contact_sheet', {}],
  ] },
  { label: 'layers ("put the sparkles under the tunnel")', calls: [
    ['three_do_layers', {}],
    ['three_update_layer', { layer: 'Sparkles', order: 'bottom' }],
    ['three_select_layer', { layer: 'Tunnel' }],
  ] },
];

async function run(ref) {
  const s = session(ref);
  const out = [];
  let sessHist = 0; let sessIn = 0; // the whole chat: every step re-reads the fixed part + the session's history so far
  for (const ask of ASKS) {
    s.turn();
    ask.before?.(s.lab);
    const calls = [];
    for (const [tool0, a] of ask.calls) {
      const tool = tool0 === 'three_do_layers' ? 'three_layers' : tool0;
      const args = { ...a };
      if (args.code === 'SPARKLES') args.code = s.lab.layers.find((L) => L.name === 'Sparkles').code;
      const r = await s.call(tool, args);
      calls.push({ tool: tool0.replace(/^three_/, ''), text: r.textTok, pics: r.picTok, picDims: r.pics, ok: r.r.ok !== false, sample: r.text.slice(0, 160) });
    }
    s.done();
    const text = calls.reduce((n, c) => n + c.text, 0); const pics = calls.reduce((n, c) => n + c.pics, 0);
    // input over the turn: each step (a call + the answer) re-reads the fixed part, plus the results so far
    let over = 0; let hist = 0;
    for (let i = 0; i <= calls.length; i += 1) { over += FIXED + hist; sessIn += FIXED + sessHist; if (i < calls.length) { hist += calls[i].text + calls[i].pics; sessHist += calls[i].text + calls[i].pics; } }
    out.push({ label: ask.label, calls, text, pics, total: text + pics, steps: calls.length + 1, overTurn: over });
  }
  out.session = { steps: out.reduce((n, r) => n + r.steps, 0), input: sessIn, history: sessHist };
  return out;
}

(async () => {
  const before = await run(BEFORE);
  const after = await run('work');
  const rows = before.map((b, i) => ({ label: b.label, before: b, after: after[i] }));
  const sum = (k, w) => rows.reduce((n, r) => n + r[w][k], 0);
  const totals = { text: [sum('text', 'before'), sum('text', 'after')], pics: [sum('pics', 'before'), sum('pics', 'after')], total: [sum('total', 'before'), sum('total', 'after')], overTurn: [sum('overTurn', 'before'), sum('overTurn', 'after')] };
  if (argv.includes('--json')) { console.log(JSON.stringify({ before: BEFORE, rows: rows.map((r) => ({ label: r.label, before: { text: r.before.text, pics: r.before.pics, total: r.before.total, overTurn: r.before.overTurn }, after: { text: r.after.text, pics: r.after.pics, total: r.after.total, overTurn: r.after.overTurn } })), totals, session: { before: before.session, after: after.session } }, null, 1)); return; }
  const pct = (a, b) => (a ? `${Math.round(((b - a) / a) * 100)} %` : '');
  console.log(`Three Director: tokens a turn adds to the session (tool results: text + pictures), ${BEFORE} → this version`);
  console.log(`(scene: 3 layers, the tunnel ${TUNNEL.split('\n').length} lines; one chat, one message per ask; fixed part ${FIXED} tokens a step, unchanged)\n`);
  console.log('| ask | calls | text | pictures | **added to the session** | input over the turn\'s steps |');
  console.log('|---|---:|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.label} | ${r.before.calls.length} | ${r.before.text} → ${r.after.text} | ${r.before.pics} → ${r.after.pics} | **${r.before.total} → ${r.after.total}** (${pct(r.before.total, r.after.total)}) | ${r.before.overTurn.toLocaleString()} → ${r.after.overTurn.toLocaleString()} |`);
  console.log(`| **all ${rows.length} asks** | ${rows.reduce((n, r) => n + r.before.calls.length, 0)} | ${totals.text[0]} → ${totals.text[1]} | ${totals.pics[0]} → ${totals.pics[1]} | **${totals.total[0]} → ${totals.total[1]}** (${pct(totals.total[0], totals.total[1])}) | ${totals.overTurn[0].toLocaleString()} → ${totals.overTurn[1].toLocaleString()} (${pct(totals.overTurn[0], totals.overTurn[1])}) |`);
  const sb = before.session; const sa = after.session;
  console.log(`\nThe whole chat (${rows.length} messages, ${sb.steps} steps): its history ends at ${sb.history.toLocaleString()} → ${sa.history.toLocaleString()} tokens of tool results; input over all steps (fixed part + history, before the cache discount) ${sb.input.toLocaleString()} → ${sa.input.toLocaleString()} (${pct(sb.input, sa.input)}); without the fixed part ${(sb.input - sb.steps * FIXED).toLocaleString()} → ${(sa.input - sa.steps * FIXED).toLocaleString()} (${pct(sb.input - sb.steps * FIXED, sa.input - sa.steps * FIXED)}).`);
  if (argv.includes('--calls')) {
    for (const r of rows) {
      console.log(`\n${r.label}`);
      r.before.calls.forEach((c, i) => { const a = r.after.calls[i]; console.log(`  ${c.tool.padEnd(16)} text ${String(c.text).padStart(5)} → ${String(a.text).padStart(5)}   pics ${String(c.pics).padStart(5)} → ${String(a.pics).padStart(5)} ${a.picDims.map((x) => `${x.w}×${x.h}`).join(' ')}${a.ok ? '' : '  ERROR'}\n      ${a.sample.replace(/\n/g, ' ⏎ ').slice(0, 150)}`); });
    }
  }
})();
