// (round 35, concise) Fewer OUTPUT tokens without worse answers. Output costs several times input (≈ 5× on Claude's
// list prices), and dev/concise-measure.js found where it goes on the owner's mix: tool-call arguments (code sent to
// the Lab) ≈ 43 %, thinking ≈ 15 %, whole-layer rewrites' unchanged lines ≈ 12 %, the closing recap / offer ≈ 11 %,
// chatter between tool calls ≈ 7 %, preamble ≈ 4 %, the answer itself ≈ 6 %.
//   - ⋯ AI setup → How hard it thinks → "How long its answers are" (options.js): Short · Normal · Detailed, saved as
//     agent.verbosity; Short / Detailed add one fixed line at the very end of Claude's prompt (engines.js
//     ANSWER_LINES), Astra gets Codex's own model_verbosity; Normal adds nothing.
//   - a reply records the length it was asked for (m.answers), shown in its token line's hover with the output split
//     (meter.js outSplit: written · thinking · tool calls).
//   - edits as diffs: a Three Director rewrite that kept most of a layer gets one line in its result (rewriteNote,
//     called by tools/three-director.js) pointing at three_edit_code, with the tokens it would have saved; the
//     "bigcode" help topic (mcp/three-guide.js, on demand) says the same.
//   - /answers [short | normal | detailed]: the same setting from the chat.
// Node-testable (dev/concise-test.js): LENGTHS, valueOf, labelOf, rewriteNote.
const Concise = (() => {
  // the owner's words ↔ the saved value (Codex's verbosity names: low / medium / high)
  const LENGTHS = { short: 'low', normal: '', detailed: 'high' };
  const valueOf = (word) => (Object.prototype.hasOwnProperty.call(LENGTHS, word) ? LENGTHS[word] : null);
  const labelOf = (v) => (v === 'low' ? 'short' : v === 'high' ? 'detailed' : 'normal');
  const tok = (s) => Math.ceil(String(s || '').length / 4);

  // A whole-layer rewrite that kept most lines: what targeted edits would have cost instead. A real rewrite (under
  // 70 % of its lines kept) or a small layer gets nothing (that's what three_set_code is for).
  function rewriteNote(before, after, { min = 12, keep = 0.7 } = {}) {
    const was = String(before || '').split('\n');
    const now = String(after || '').split('\n');
    if (was.filter((l) => l.trim()).length < min || now.length < min) return '';
    const left = new Map();
    for (const l of was) left.set(l, (left.get(l) || 0) + 1);
    const changed = [];
    let kept = 0;
    for (const l of now) {
      const n = left.get(l) || 0;
      if (n) { kept += 1; left.set(l, n - 1); } else changed.push(l);
    }
    if (kept < now.length * keep || !changed.length) return '';
    const whole = tok(JSON.stringify({ code: String(after) }));
    // an edit sends each changed line twice at most (find the old one, replace with the new) + JSON
    const removed = [...left.entries()].flatMap(([l, n]) => Array(n).fill(l));
    const edit = tok(JSON.stringify({ edits: [{ find: removed.join('\n'), replace: changed.join('\n') }] })) + 10;
    if (whole < edit * 3) return '';
    return `Most of this layer was unchanged (${kept} of ${now.length} lines): three_edit_code sends only what changes (≈ ${edit} tokens instead of ≈ ${whole}).`;
  }

  // ---------- in the app ----------
  const inApp = typeof window !== 'undefined' && typeof Native !== 'undefined';
  // the length this reply was asked for (Astra: a chat's own verbosity first, like codexArgs)
  function askedFor(chat) {
    const a = typeof H !== 'undefined' ? H.agent(chat?.agentId) : null;
    if (!a) return '';
    const v = a.engine === 'codex' ? (chat.verbosity || a.verbosity) : a.verbosity;
    return v === 'low' || v === 'high' ? labelOf(v) : '';
  }
  function onFinish(event, chat, extras) {
    const w = askedFor(chat);
    if (w) extras.answers = w;
  }
  async function set(agentId, word) {
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') return 'Run this in a chat.';
    const v = valueOf(word);
    if (v == null) return `${agent.name}'s answers: ${labelOf(agent.verbosity)}. Say short, normal or detailed.`;
    for (const t of new Set([agent, H.agent(agent.id)].filter(Boolean))) { if (v) t.verbosity = v; else delete t.verbosity; }
    await saveConfig();
    if (typeof Cachewise !== 'undefined') Cachewise.changed(agent.id);
    if (typeof Options !== 'undefined' && Options.sheet) Options.paint();
    return `${agent.name}'s answers: ${word}${v === 'low' ? ' (the answer first, no recap, only the code that changes)' : v === 'high' ? ' (fuller, with reasons and examples)' : ''}.`;
  }
  if (inApp) {
    Native.hooks.finish.push(onFinish);
    if (typeof Commands !== 'undefined' && !Commands.get('answers')) {
      Commands.register({
        name: 'answers', aliases: ['answer-length'], area: 'Messages', args: '[short | normal | detailed]',
        desc: 'How long this AI\'s answers are (also in ⋯ AI setup → How hard it thinks): short saves output tokens',
        complete: () => Object.keys(LENGTHS).map((value) => ({ value })),
        run: (args, ctx) => set(ctx.agentId, String(args || '').trim().toLowerCase()),
      });
    }
  }
  return { LENGTHS, valueOf, labelOf, rewriteNote, askedFor, set };
})();
if (typeof module !== 'undefined') module.exports = Concise; else window.Concise = Concise;
