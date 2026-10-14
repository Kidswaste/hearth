#!/usr/bin/env node
// (round 35, concise) Where the AIs' OUTPUT tokens go, measured on a realistic sample, and what "Short" answers and
// targeted edits can save. Output tokens cost several times input tokens (≈ 5× on Claude's list prices), so a word the
// AI doesn't write is worth five it doesn't read.
//   node dev/concise-measure.js            the tables
//   node dev/concise-measure.js --json     the numbers only
// Two parts:
//  1. A labelled sample of replies in the owner's real mix (Three Director turns, plain Claude chats, Astra), each split
//     into what it is: thinking, tool-call arguments, tool-call chatter ("Let me look…"), preamble / restating the ask,
//     the answer itself, code repeated unchanged, and the closing recap / offer. Tokens ≈ characters / 4 (mcp/cost.js).
//     The replies are written like the engines' typical answers (no real chats exist here); the split is exact.
//  2. Edits as diffs, exact: a typical director layer (dev/fixtures/concise-scene.js) and the owner's most common asks
//     ("make it pink", "slower", "more glow", "add a slider"), priced as a whole-layer rewrite (three_set_code) and as
//     targeted edits (three_edit_code), the arguments the model writes as JSON.
const fs = require('fs');
const path = require('path');

const tok = (s) => Math.ceil(String(s || '').length / 4);
const json = process.argv.includes('--json');

// ---------- 1. the sample ----------
const SCENE = fs.readFileSync(path.join(__dirname, 'fixtures', 'concise-scene.js'), 'utf8');
const FN = `function beatPhase(time, bpm, offset = 0) {
  const spb = 60 / bpm;
  const t = Math.max(0, time - offset);
  const beat = Math.floor(t / spb);
  const phase = (t % spb) / spb;
  const bar = Math.floor(beat / 4);
  const inBar = beat % 4;
  return { beat, phase, bar, inBar, down: inBar === 0 && phase < 0.1 };
}
function pulse(phase, sharp = 6) {
  return Math.exp(-phase * sharp);
}
function onBeat(audio, fn) {
  let lastBeat = -1;
  return (time) => {
    const b = beatPhase(time, audio.bpm || 120, audio.offset || 0);
    if (b.beat !== lastBeat) { lastBeat = b.beat; fn(b); }
    return b;
  };
}`;
const FN_FIXED = FN.replace('const t = Math.max(0, time - offset);', 'const t = Math.max(0, time - offset + 1e-6);').replace('(t % spb) / spb', '((t % spb) + spb) % spb / spb');
const lines = (s, from, to) => s.split('\n').slice(from, to).join('\n');
const edit = (find, replace) => JSON.stringify({ edits: [{ find, replace }] });

// kinds: think · args (tool-call arguments: needed) · argsWhole (a whole-layer rewrite's unchanged lines) · chatter ·
// pre (preamble, restating the ask) · body · repeat (code shown again unchanged) · recap (closing summary / offer)
const SAMPLE = [
  { kind: 'director', label: 'Director: "make the rings pink and a bit slower"', weight: 0.30, parts: [
    ['think', 'The user wants the rings pink and slower. The colors come from P.colorA and P.colorB, the speed from P.speed. I should change the defaults in the tweak block so the sliders keep working: colorA to a pink, colorB to a softer pink so the gradient stays, speed from 0.8 to maybe 0.5. I could use three_sliders but that leaves unsaved values; the owner usually wants it saved, so edit the code. Then take a quick look.'],
    ['chatter', 'Let me look at the current code first to see how the colors and speed are set up.'],
    ['args', JSON.stringify({ layer: 'Rings', from: 7, to: 21 })],
    ['chatter', 'I can see the colors and speed are controlled by the sliders. I\'ll update the defaults so the rings are pink and move more slowly.'],
    ['args', JSON.stringify({ edits: [{ find: "colorA: { value: '#ff3cac'", replace: "colorA: { value: '#ff4fa8'" }, { find: "colorB: { value: '#2b86c5'", replace: "colorB: { value: '#ffc2e0'" }, { find: 'speed: { value: 0.8,', replace: 'speed: { value: 0.5,' }], shot: true })],
    ['chatter', 'The edit applied cleanly with no errors. Looking at the picture, the tunnel now reads as pink.'],
    ['pre', 'Done! I\'ve made the rings pink and slowed them down as you asked.'],
    ['body', 'Rings now go from hot pink (#ff4fa8) to pale pink (#ffc2e0); Speed 0.8 → 0.5.'],
    ['recap', '\n\nHere\'s a quick summary of what changed:\n- **Color A**: #ff3cac → #ff4fa8 (a warmer hot pink)\n- **Color B**: #2b86c5 → #ffc2e0 (a pale pink, so the gradient stays soft)\n- **Speed**: 0.8 → 0.5\n\nYou can fine-tune both with the Color and Motion sliders. Would you like me to also make the glow pinker or add a subtle shimmer on the kick?'],
  ] },
  { kind: 'director', label: 'Director: the same ask as a whole-layer rewrite', weight: 0.06, parts: [
    ['think', 'Change colors and speed; I will rewrite the layer with the new values.'],
    ['chatter', 'I\'ll rewrite the layer with pink colors and a slower speed.'],
    // what the same change costs as edits (counted as needed; the rest of the rewrite is unchanged lines)
    ['args', JSON.stringify({ edits: [{ find: "'#ff3cac'", replace: "'#ff4fa8'" }, { find: "'#2b86c5'", replace: "'#ffc2e0'" }, { find: 'value: 0.8,', replace: 'value: 0.5,' }] })],
    ['argsWhole', JSON.stringify({ code: SCENE.replace("'#ff3cac'", "'#ff4fa8'").replace("'#2b86c5'", "'#ffc2e0'").replace('value: 0.8,', 'value: 0.5,') })],
    ['body', 'Rings are pink now (#ff4fa8 → #ffc2e0) and slower (0.5).'],
    ['recap', ' Everything else is unchanged. Let me know if you want any other tweaks!'],
  ] },
  { kind: 'director', label: 'Director: "add sparkles that burst on the drop"', weight: 0.24, parts: [
    ['think', 'A new element: new layer. Sparkles as Points with additive blending, burst on the drop: audio.cue or the drops list from audio.analysis. Keep it timeline-first: a burst envelope at each drop time, fading over 1.5 s. Sliders: count, size, color, spread, burst length. Alpha true, no background since it sits above the tunnel.'.repeat(2)],
    ['chatter', 'I\'ll add the sparkles as a new layer above the tunnel so they stay separate and easy to tweak.'],
    ['args', JSON.stringify({ name: 'Sparkles', code: lines(SCENE, 0, 70) })],
    ['chatter', 'The layer is running without errors. Let me check how it looks on the drop.'],
    ['args', JSON.stringify({ cmd: 'frame', at: 'drop' })],
    ['pre', 'I\'ve added a new **Sparkles** layer on top of your tunnel that bursts on every drop of the song.'],
    ['body', ' 400 additive sparkles fan out from the centre at each drop and fade over 1.5 s; sliders: Count, Size, Color, Spread, Burst length.'],
    ['recap', '\n\n**What I added:**\n- A new layer called "Sparkles", above the tunnel\n- Sliders in the Sparkles group: Count (400), Size (0.04), Color (#fff3c4), Spread (3.5), Burst length (1.5 s)\n- The burst follows the drops in your song\n\nThe tunnel itself is untouched. If you want them to react to the kick as well, or to be more subtle, just say the word!'],
  ] },
  { kind: 'director', label: 'Director: "why is it so dark?"', weight: 0.10, parts: [
    ['think', 'Dark: fog density 0.06 with the background near black and MeshBasic colors fading opacity to 0.25 at the far end; bloom 1.1. Probably the opacity floor and the fog. Look first.'],
    ['chatter', 'Let me take a screenshot to see what you\'re seeing.'],
    ['args', JSON.stringify({ small: true })],
    ['pre', 'Good question! Looking at the scene, I can see why it feels dark.'],
    ['body', ' Two things: the fog (density 0.06) swallows the far rings, and far rings fade to 25 % opacity. Lowering the fog to 0.03 and the floor to 0.5 brightens it without losing depth; or raise Glow.'],
    ['recap', '\n\nIn short, it\'s mainly the fog and the opacity fade. Would you like me to apply those changes for you?'],
  ] },
  { kind: 'claude', label: 'Plain Claude: "what\'s the difference between Standard and Physical materials?"', weight: 0.08, parts: [
    ['think', 'Explain MeshStandardMaterial vs MeshPhysicalMaterial briefly: physical adds clearcoat, transmission, sheen, iridescence, ior; cost.'],
    ['pre', 'Great question! You\'re asking about the difference between MeshStandardMaterial and MeshPhysicalMaterial in three.js. Both are physically based materials, but they differ in what they can do.\n\n'],
    ['body', '**MeshStandardMaterial**: metalness / roughness PBR, the right default.\n\n**MeshPhysicalMaterial**: Standard plus clearcoat (car paint), transmission + ior (glass), sheen (fabric), iridescence (soap bubbles). It costs more per pixel, so use it only for those looks.'],
    ['recap', '\n\n**In summary:** use Standard for most things and Physical when you need glass, clearcoat or similar effects. Let me know if you\'d like an example of either one in your scene!'],
  ] },
  { kind: 'claude', label: 'Plain Claude: "fix the beat phase going negative" (pasted 22 lines)', weight: 0.08, parts: [
    ['think', 'Negative modulo for t near 0 with offset; fix with ((t % spb) + spb) % spb and an epsilon.'],
    ['pre', 'I see the issue! The problem is in how the phase is calculated when `time` is close to the offset. Let me explain and then give you the fixed code.\n\n'],
    ['body', 'JS `%` keeps the sign of the left side, so floating-point error just below 0 gives a negative phase. Wrap it:\n\n```js\nconst phase = (((t % spb) + spb) % spb) / spb;\n```\n'],
    ['repeat', `\nHere's the complete updated code:\n\n\`\`\`js\n${FN_FIXED}\n\`\`\`\n`],
    ['recap', '\n**What changed:**\n1. The phase calculation now wraps negative values\n2. A tiny epsilon avoids floating-point issues at exactly the offset\n\nThe rest of the code is unchanged. Let me know if you run into anything else!'],
  ] },
  { kind: 'claude', label: 'Plain Claude: "thanks!"', weight: 0.06, parts: [
    ['body', 'You\'re welcome!'],
    ['recap', ' Glad that helped. If you need anything else with your visuals or the code, just let me know — happy to help!'],
  ] },
  { kind: 'astra', label: 'Astra: "is 60 fps realistic for 9:16 at 1080×1920 with bloom?"', weight: 0.08, parts: [
    ['think', 'Bloom at 1080x1920: UnrealBloom does mip chain; fine on a decent GPU; preview at lower res.'],
    ['pre', 'Short answer: yes, on most recent GPUs. Let me break it down.\n\n'],
    ['body', 'UnrealBloomPass at 1080×1920 costs about 2–4 ms on a recent laptop GPU; your scene is light. If it drops: render bloom at half size, cap the pixel ratio at 1, fewer rings.'],
    ['recap', '\n\nOverall, 60 fps should be very achievable for this kind of scene. If you notice drops, start with the half-size bloom trick. Want me to show you how to set that up?'],
  ] },
];
// the sample's own consistency: weights sum to 1
const wsum = SAMPLE.reduce((s, r) => s + r.weight, 0);
if (Math.abs(wsum - 1) > 1e-9) throw new Error(`sample weights sum to ${wsum}`);

const KINDS = ['think', 'args', 'argsWhole', 'chatter', 'pre', 'body', 'repeat', 'recap'];
const NAMES = { think: 'thinking', args: 'tool-call arguments (needed)', argsWhole: 'whole-layer rewrites: unchanged lines', chatter: 'tool-call chatter', pre: 'preamble / restating the ask', body: 'the answer itself', repeat: 'code repeated unchanged', recap: 'closing recap / offer' };
// what "Short" asks the model to drop (the answer, its thinking and the tool calls stay)
const SHORT_DROPS = ['chatter', 'pre', 'repeat', 'recap'];

function split(reply) {
  const t = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const [k, s] of reply.parts) t[k] += tok(s);
  // a whole-layer rewrite: what an edit would have sent is counted as needed, the rest as unchanged lines
  const whole = reply.parts.find(([k]) => k === 'argsWhole');
  if (whole) t.argsWhole -= t.args;
  return t;
}
const rows = SAMPLE.map((r) => ({ ...r, t: split(r) }));
const total = (t) => KINDS.reduce((s, k) => s + t[k], 0);
const mix = Object.fromEntries(KINDS.map((k) => [k, rows.reduce((s, r) => s + r.weight * r.t[k], 0)]));
const mixTotal = total(mix);
const shortSaved = SHORT_DROPS.reduce((s, k) => s + mix[k], 0);
const editSaved = mix.argsWhole;

// ---------- 2. edits as diffs, exact ----------
const ASKS = [
  ['make it pink', [["colorA: { value: '#ff3cac'", "colorA: { value: '#ff4fa8'"], ["colorB: { value: '#2b86c5'", "colorB: { value: '#ffc2e0'"]]],
  ['slower', [['speed: { value: 0.8,', 'speed: { value: 0.5,']]],
  ['more glow on the kick', [['bloomPass.strength = P.bloom * (1 + (audio.kick || 0) * P.kick);', 'bloomPass.strength = P.bloom * (1 + (audio.kick || 0) * P.kick * 1.6);']]],
  ['add a "Fog" slider', [["  bg: { value: '#05030a', label: 'Background', group: 'Color' },", "  bg: { value: '#05030a', label: 'Background', group: 'Color' },\n  fog: { value: 0.06, min: 0, max: 0.2, label: 'Fog', group: 'Look' },"], ['scene.fog.color.set(P.bg);', 'scene.fog.color.set(P.bg);\n  scene.fog.density = P.fog;']]],
  ['rings wobble on the beat', [['ring.position.x = Math.sin(t * 0.7 + i * 0.4) * P.wobble;', 'ring.position.x = Math.sin(t * 0.7 + i * 0.4) * P.wobble * (1 + (audio.beat || 0));']]],
];
const editRows = ASKS.map(([ask, eds]) => {
  let code = SCENE;
  for (const [f, r] of eds) { if (!code.includes(f)) throw new Error(`fixture changed: ${f}`); code = code.replace(f, r); }
  const whole = tok(JSON.stringify({ code }));
  const targeted = tok(JSON.stringify({ edits: eds.map(([find, replace]) => ({ find, replace })) }));
  return { ask, whole, targeted, saved: whole - targeted };
});
const avg = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
const out = {
  sample: { replies: rows.length, perReply: Math.round(mixTotal), split: Object.fromEntries(KINDS.map((k) => [k, Math.round(mix[k])])),
    shortDrops: Math.round(shortSaved), shortPct: Math.round((shortSaved / mixTotal) * 100), visibleText: Math.round(mix.chatter + mix.pre + mix.body + mix.repeat + mix.recap),
    editDrops: Math.round(editSaved), editPct: Math.round((editSaved / mixTotal) * 100) },
  edits: { sceneLines: SCENE.split('\n').length, sceneTokens: tok(SCENE), whole: Math.round(avg(editRows, 'whole')), targeted: Math.round(avg(editRows, 'targeted')), rows: editRows },
};
if (json) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
const num = (n, w = 7) => String(Math.round(n)).padStart(w);
console.log('1. Where output tokens go (sample of the owner\'s mix, weighted; tokens per reply)\n');
console.log(`${pad('reply', 74)} ${KINDS.map((k) => k.slice(0, 7).padStart(7)).join(' ')}  total`);
for (const r of rows) console.log(`${pad(`${r.label} (${Math.round(r.weight * 100)}%)`, 74)} ${KINDS.map((k) => num(r.t[k])).join(' ')} ${num(total(r.t))}`);
console.log(`${pad('weighted mix', 74)} ${KINDS.map((k) => num(mix[k])).join(' ')} ${num(mixTotal)}`);
console.log('');
for (const k of KINDS) console.log(`  ${pad(NAMES[k], 42)} ${num(mix[k], 5)}  ${String(Math.round((mix[k] / mixTotal) * 100)).padStart(3)} %`);
console.log(`\n  Short drops (chatter + preamble + repeated code + recap): ≈ ${Math.round(shortSaved)} of ${Math.round(mixTotal)} output tokens per reply (${out.sample.shortPct} %) if fully followed; ${Math.round((shortSaved / out.sample.visibleText) * 100)} % of the visible text.`);
console.log(`  Targeted edits instead of whole-layer rewrites: ≈ ${Math.round(editSaved)} per reply on this mix (${out.sample.editPct} %).`);
console.log(`\n2. Edits as diffs on a ${out.edits.sceneLines}-line director layer (${out.edits.sceneTokens} tokens): tool-call arguments the model writes\n`);
console.log(`${pad('ask', 30)} ${'rewrite'.padStart(8)} ${'edit'.padStart(6)} ${'saved'.padStart(6)}`);
for (const r of editRows) console.log(`${pad(r.ask, 30)} ${num(r.whole, 8)} ${num(r.targeted, 6)} ${num(r.saved, 6)}  (${Math.round((r.saved / r.whole) * 100)} %)`);
console.log(`${pad('average', 30)} ${num(out.edits.whole, 8)} ${num(out.edits.targeted, 6)} ${num(out.edits.whole - out.edits.targeted, 6)}`);
