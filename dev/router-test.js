// Smart routing (round 28, router.js): the local rules that pick model + effort per message. Also prints the token /
// cost estimate for a typical mix of the owner's messages (docs/upgrades/router.md).
//   node dev/router-test.js
const R = require('../router.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const claude = (text, more = {}) => R.decide({ engine: 'claude', text, baseModel: 'claude-opus-5-5', ...more });
const codex = (text, more = {}) => R.decide({ engine: 'codex', text, baseModel: 'gpt-6-astra', ...more });

// ---------- kinds of messages ----------
ok('chit-chat → Haiku · low', (() => { const d = claude('thanks!'); return d.tier === 'chat' && d.model === 'haiku' && d.effort === 'low' && d.label === 'Haiku · low'; })(), claude('thanks!'));
ok('"ok cool" is chit-chat', claude('ok cool').tier === 'chat');
ok('a short question → Sonnet · low', (() => { const d = claude('what does bloom do in three.js?'); return d.tier === 'quick' && d.model === 'sonnet' && d.effort === 'low'; })(), claude('what does bloom do in three.js?'));
ok('a greeting with a question is not chit-chat', claude('hey, what time is it in Tokyo?').tier === 'quick');
ok('a small ask → quick', claude('rename the chat to Orb').tier === 'quick');
ok('code to fix → hard, own model, high', (() => { const d = claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```'); return d.tier === 'hard' && d.model === null && d.effort === 'high' && d.label === 'Opus · high'; })(), claude('fix this:\n```js\nconst a = b.map(x => x*2)\n```'));
ok('a stack trace to explain → hard', claude('why does this happen? TypeError: x is undefined\n    at render (scene.js:42:7)').tier === 'hard');
ok('an analysis → hard', claude('compare these two approaches for the particle system and tell me the trade-offs').tier === 'hard');
ok('a plan → hard', claude('plan the intro video: the beats, the cuts and the titles for each part').tier === 'hard');
ok('"think carefully" → hard', claude('think carefully: is it the kick?').tier === 'hard');
ok('"quick" lowers a make', (() => { const d = claude('quick: make the title bigger'); return d.tier === 'quick'; })(), claude('quick: make the title bigger'));
ok('something to make → normal (own model, medium)', (() => { const d = claude('make me a short poem about embers'); return d.tier === 'normal' && d.model === null && d.effort === 'medium'; })());
ok('an everyday longer message → normal', claude('I have been thinking about the colors in the last scene and I am not sure the orange works with the purple background at night').tier === 'normal');
ok('a very long message → hard', claude('word '.repeat(700)).tier === 'hard');

// ---------- attachments, the Lab, the conversation ----------
ok('a picture is never chit-chat', claude('nice', { images: 1 }).tier === 'quick');
ok('a picture with a longer ask → normal', claude('look at this frame and tell me what you would change about the lighting', { images: 1 }).tier === 'normal');
ok('a small file → normal', claude('look', { attachments: [{ kind: 'text', name: 'a.txt', tokens: 300 }] }).tier === 'normal');
ok('big files → hard', claude('summarise these', { attachments: [{ kind: 'text', name: 'a.md', tokens: 9000 }] }).tier === 'hard');
ok('a Lab build → hard', claude('add a tunnel of glowing rings', { director: true }).tier === 'hard');
ok('a Lab chit-chat keeps the middle model (tools)', (() => { const d = claude('thanks', { director: true }); return d.tier === 'quick' && d.model === 'sonnet'; })());
const hardBefore = [{ role: 'user', text: 'plan it' }, { role: 'assistant', text: 'Plan: …', route: { tier: 'hard' }, usage: { input: 3000 } }];
ok('a go-ahead follows the last reply', claude('yes do it', { history: hardBefore }).tier === 'hard');
ok('"go" with no history is just small', claude('go').tier === 'quick');
const bigCtx = [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', route: { tier: 'normal' }, usage: { input: 60000 } }];
ok('a big context never steps down (cache)', (() => { const d = claude('thanks!', { history: bigCtx }); return d.tier === 'normal' && d.kept && /60k tokens/.test(d.why); })(), claude('thanks!', { history: bigCtx }));
ok('a big context can still step up', claude('think carefully: why is it slow?', { history: bigCtx }).tier === 'hard');
const smallCtx = [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y', usage: { input: 4000 } }];
ok('a small context steps down freely', claude('thanks!', { history: smallCtx }).tier === 'chat');

// ---------- the owner's picks are never routed away ----------
ok('a chat model the owner picked stays (effort still routed)', (() => { const d = claude('thanks!', { pinned: { model: 'opus' } }); return d.model === null && d.effort === 'low' && d.label === 'Opus · low'; })(), claude('thanks!', { pinned: { model: 'opus' } }));
ok('a chat effort the owner picked stays (model still routed)', (() => { const d = claude('thanks!', { pinned: { effort: 'high' } }); return d.effort === null && d.model === 'haiku' && d.label === 'Haiku · high'; })());
ok('both picked: nothing routed', claude('thanks!', { pinned: { model: 'opus', effort: 'high' } }) === null);
ok('never "upgrades" a cheaper chat model', (() => { const d = R.decide({ engine: 'claude', text: 'what is a LUT?', baseModel: 'haiku' }); return d.model === null && d.label === 'Haiku · low'; })());
ok('no agent model: routes down from the engine default', claude('thanks!', { baseModel: '' }).model === 'haiku');
ok('think harder: own model, high effort', (() => { const d = claude('thanks!', { force: true }); return d.tier === 'hard' && d.model === null && d.effort === 'high' && d.forced; })());
ok('think harder after high: xhigh', claude('x', { force: 'xhigh' }).effort === 'xhigh');
ok('think harder overrides a picked effort, keeps a picked model', (() => { const d = claude('x', { force: 'high', pinned: { model: 'sonnet', effort: 'low' } }); return d.effort === 'high' && d.model === null && d.label === 'Sonnet · high'; })());

// ---------- Codex / Astra ----------
ok('Astra chit-chat → Luna · minimal', (() => { const d = codex('thanks!'); return d.model === 'gpt-6-luna' && d.effort === 'minimal' && d.label === 'Luna · minimal'; })(), codex('thanks!'));
ok('Astra short question → Sol · low', (() => { const d = codex('what is a LUT?'); return d.model === 'gpt-6-sol' && d.effort === 'low'; })());
ok('Astra build → own model · high', (() => { const d = codex('implement a GLSL noise function for the background', {}); return d.model === null && d.effort === 'high' && d.label === 'Astra · high'; })(), codex('implement a GLSL noise function for the background'));
ok('ranks', R.rankOf('claude', 'claude-haiku-5-5') < R.rankOf('claude', 'sonnet') && R.rankOf('claude', 'sonnet') < R.rankOf('claude', 'claude-opus-5-5') && R.rankOf('codex', 'gpt-6-sol') < R.rankOf('codex', 'gpt-6-astra') && R.rankOf('codex', 'gpt-6-luna') < R.rankOf('codex', 'gpt-6-sol'));

// ---------- a typical mix: tokens and cost against "everything on the strong model, medium" ----------
// $ per 1M tokens (input, output) and a rough output multiplier per effort (thinking tokens). Assumptions, not measured.
const PRICE = { haiku: [0.1, 0.5], sonnet: [2, 10], opus: [4, 20] };
const THINK = { low: 0.5, medium: 1, high: 1.7, xhigh: 2.4 };
const mix = [ // [share of messages, text, context tokens in, answer tokens out at medium]
  [0.20, 'thanks!', 6000, 120], [0.25, 'what does bloom do in three.js?', 6000, 500], [0.15, 'rename the chat to Orb', 6000, 150],
  [0.20, 'make the rings pulse on every kick and slow the spin', 9000, 900], [0.12, 'fix this:\n```js\nconst a = b.map(x => x*2)\n```', 12000, 1500],
  [0.08, 'compare these two approaches for the particle system and tell me the trade-offs', 12000, 1800],
];
let base = 0; let deep = 0; let routed = 0; let baseTok = 0; let routedTok = 0;
for (const [share, text, inTok, outTok] of mix) {
  const d = claude(text);
  const m = d.model || 'opus';
  const cost = (p, i, o) => (p[0] * i + p[1] * o) / 1e3; // $ per 1,000 messages
  base += share * cost(PRICE.opus, inTok, outTok * THINK.medium);
  deep += share * cost(PRICE.opus, inTok, outTok * THINK.high);
  routed += share * cost(PRICE[m], inTok, outTok * THINK[d.effort]);
  baseTok += share * outTok * THINK.medium;
  routedTok += share * outTok * THINK[d.effort];
}
const saved = 1 - routed / base;
const pct = (x) => `${x > 0 ? '−' : '+'}${Math.abs(Math.round(x * 100))}%`;
console.log(`  typical mix, per 1,000 messages: Smart before (strong model, medium) $${base.toFixed(2)} · Deep $${deep.toFixed(2)} · Smart routed $${routed.toFixed(2)} (${pct(saved)} vs before, ${pct(1 - routed / deep)} vs Deep); output + thinking tokens ${pct(1 - routedTok / baseTok)}`);
ok('the typical mix costs less than before', saved > 0.1, saved);
ok('and much less than Deep', 1 - routed / deep > 0.25, 1 - routed / deep);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
