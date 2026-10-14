# Shorter answers: fewer output tokens (round 35, concise)

Output tokens cost several times input tokens (≈ 5× on Claude's list prices; a cached input token is ≈ 0.1×), so a word
the AI doesn't write is worth about five it doesn't read. Earlier rounds cut what the AIs *read* (tokensaver, cachewise,
autocompact). This stream measured what they *write*, and cuts the parts that don't make an answer better.

## Measured
`node dev/concise-measure.js` (no real chats exist here, so the sample is labelled replies written the way the engines
typically answer, weighted by the owner's mix: mostly Three Director turns; the split into parts is exact, tokens ≈
characters / 4 like `mcp/cost.js`). Where the output of an average reply (≈ 546 tokens) goes:

| part of the output | tokens / reply | share |
|---|---:|---:|
| tool-call arguments (code sent to the Lab: needed) | 232 | 43 % |
| thinking | 82 | 15 % |
| whole-layer rewrites: the lines that didn't change | 67 | 12 % |
| closing recap / "want me to…?" offer | 62 | 11 % |
| chatter between tool calls ("Let me look…") | 36 | 7 % |
| the answer itself | 32 | 6 % |
| preamble / restating the ask | 21 | 4 % |
| code repeated unchanged in the reply | 13 | 2 % |

- **Short** asks the model to drop the recap, chatter, preamble and repeated code: **≈ 133 of 546 output tokens per
  reply (24 %)** if fully followed, which is **80 % of the visible text**, while the answer, the thinking and the tool
  calls stay. Real models follow such a line partly; count on less.
- **Edits as diffs**, exact, on a typical 104-line director layer (`dev/fixtures/concise-scene.js`, 1,126 tokens), the
  owner's usual asks (make it pink, slower, more glow on the kick, add a Fog slider, wobble on the beat): a whole-layer
  rewrite writes **≈ 1,161** tokens of arguments, targeted edits **≈ 47** (93–98 % less, ≈ 1,100 saved each time).
- **The Lab director already edits**: its always-on guide says "change one with three_edit_code", the owner's tracked
  calls are three_edit_code 61 vs three_set_code under 8, and every edit result already shows only a short diff. What was
  left: the rare whole-layer rewrite of a small change (≈ 12 % of output on this mix) — now named in its result.
- **Fake engines** (`dev/checks/concise.js`): Normal sends the prompt exactly as before (233 chars on the test Claude);
  Short adds 154 characters (≈ 38 tokens, cached after the first message) at the very end and nothing else; Detailed
  ≈ 25 tokens; back to Normal is byte-identical. The cost: ≈ 4 full-price-equivalent tokens a message once cached,
  against tens to hundreds of output tokens (≈ 5× each) not written.
- Fixed tokens per message are unchanged at the default (`dev/tokens-test.js`: plain Claude 571 tokens, its role line one token shorter); prompts stay
  byte-stable (`dev/cache-test.js`); the director's lean tool list is unchanged (`dev/director-mcp-test.js`).

## Upgrades
### How long its answers are
1. **⋯ AI setup → How hard it thinks → "How long its answers are": Short · Normal · Detailed** (Normal by default), one
   row under Quick / Smart / Deep, per AI.
2. **Short**: one fixed line at the very end of Claude's instructions: the answer first; no preamble, restating,
   narration between tool calls or closing recap; only the code lines that change.
3. **Detailed**: one fixed line asking for reasons, edge cases and examples.
4. **Normal adds nothing** (zero tokens).
5. **Astra uses its engine's own setting** (Codex `model_verbosity` low / high), so no extra line at all; the same field
   Astra's `/astra-preset` and `/astra-verbosity` already used, so an Astra set to "Frugal" shows Short here.
6. **Cache-friendly**: the line is last in the prompt, so switching it keeps everything before it cached (Astra caches
   by prefix); a switch mid-chat gets cachewise's one calm line about the one re-read.
7. **`/answers short | normal | detailed`** (alias `/answer-length`): the same setting from the chat.
### The plain chat's default
8. Plain chats' first line now says "Answer directly, no preamble or recap" (was "conversationally and directly"):
   the same length, so every chat gets the biggest cheap win without a setting.
### Seeing the effect
9. **A reply's token hover splits the output**: "213 output tokens: ≈ 179 written · ≈ 22 thinking · ≈ 12 tool calls".
10. **The hover names the length it was asked for**: "Answers: short (⋯ AI setup)".
### Edits as diffs
11. **A Three Director rewrite that kept most of a layer** gets one line in its result: "Most of this layer was
    unchanged (102 of 104 lines): three_edit_code sends only what changes (≈ 106 tokens instead of ≈ 1155)". Only then;
    a real rewrite keeps its existing "new effects go in a new layer" line.
12. **The on-demand help** (`three_do help bigcode`, also under `edits`, `edit`, `diff`): keep finds short and unique,
    several edits in one call, what a rewrite costs. The always-on guide didn't grow.
### Guards
13. `node dev/concise-test.js` (unit): each line is one short line with no numbers; Normal adds nothing; Short /
    Detailed = the same prompt + their line at the end (plain Claude, Three Director, file access); byte-stable twice
    and in any key order; after the saved memory; Astra gets the flag, not the line; a switch is a cache change; the
    rewrite note (two-line change → note; real rewrite, tiny layer, no change → none); the help.
14. `dev/checks/concise.js` (fake engines; groups `concise` and `budget`): the row and its three choices, Short saved on
    the AI and in config.json, the prompt the engine REALLY got changes only at its end (fake Claude's `promptinfo`),
    the reply's hover split + "Answers: short", `/answers detailed` / `normal`, Normal byte-identical again.
15. `node dev/concise-measure.js`: the tables above.

## Files
New: `concise.js` (budget lazy group: the reply's length, `/answers`, `rewriteNote`), `dev/concise-measure.js`,
`dev/concise-test.js`, `dev/checks/concise.js`, `dev/fixtures/concise-scene.js`.
Small edits: `engines.js` (`ANSWER_LINES`, the line at the end of `buildPrompt`, the plain role line), `options.js` (the
row), `meter.js` (`outSplit` in the token hover), `tools/three-director.js` (one `else if` after the rewrite note),
`mcp/three-guide.js` (bigcode help + aliases), `lazy-data.js` (+ the file, manifest regenerated), `dev/fake-claude.js`
(`promptinfo`), `dev/run-checks.js` (unit list, `concise` group, budget group).

## Not done (on purpose) / risks
- **The savings are an estimate**: the sample is written, not logged (no real chats here), and a real model follows a
  "short" line only partly. The edits numbers are exact.
- **Thinking is the other big part** (15 % here, much more on Deep); "How hard it thinks" already governs it, so this
  row doesn't touch it.
- **A per-message override** (a mission or a one-word hint) wasn't added: Smart already sends "quick / briefly / tl;dr"
  messages to the light tier.
- **File edits outside the Lab**: Claude's Edit tool and Astra's apply_patch are already diffs; a Claude chat may still
  Write a whole file. Short's line asks for only the changed code lines in replies.
- The bigcode help topic also rides in the opt-in "full" director mode (≈ +45 tokens there, which sends every topic).
- The output split's parts are estimates (characters / 4) scaled to the engine's real total.

## For the patch notes
- New in ⋯ AI setup → How hard it thinks: **How long its answers are** — Short · Normal · Detailed (Normal by default).
- Short: the answer first, without a preamble, a closing recap or the whole code again — about a quarter fewer written
  tokens on a typical mix, and output tokens are the expensive ones.
- Detailed: fuller answers with reasons and examples when you want them.
- Switching it changes only the last line of the AI's instructions, so long chats keep their prompt cache.
- Hover a reply's token line to see where its output went (written · thinking · tool calls) and which length it used.
- Plain chats now answer directly by default, with no preamble or recap, at no extra cost.
- The Three Director is reminded to change small things with targeted edits (≈ 50 tokens) instead of rewriting a whole
  layer (≈ 1,100).
- Also from the chat: `/answers short`, `/answers normal`, `/answers detailed`.
