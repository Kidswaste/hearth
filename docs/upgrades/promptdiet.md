# Prompt diet: a lighter fixed part on every message (round 46, promptdiet)

Every message (and every tool step of a reply) re-sends the same fixed part before the owner's words: Hearth's
system prompt and the definitions of every tool the AI has. Rounds 31–41 cut it (tokensaver, cachewise, diet,
directorlean, toolslim); rounds 40–45 added features around it. This stream measured it again for each case the owner
meets, cut what was said twice or rarely needed (it moved behind help that answers locally), and stopped the two
per-turn leaks found on the way: runaway tool results and tool sets woken by Hearth's own words. No ability is gone.

## Measured
New `node dev/promptdiet-measure.js` measures each case **as the engines really get it**: the agent `send()` builds for
that run (now one shared function, `engines._test.runAgent`: a mission helper, a chat's own engine, the sets
toolwake.js lets sleep…), its whole system prompt and its tool definitions as the engines name them
(`mcp__server__tool` + `input_schema`, mcp/cost.js `wire`), plus the text Hearth itself puts in the message (a 🔁 Keep
going round's ask). Tokens ≈ characters / 4; no saved memory (the owner's own; `dev/tokens-test.js` counts it with a
sample); the engines' own base prompts aren't Hearth's.

### Before → after (tokens per message, and again per tool step)
| Case | before | after | saved | % | prompt | tools |
|---|---:|---:|---:|---:|---:|---:|
| Plain Claude chat | 333 | **296** | −37 | 11 % | 119 → 96 | 214 → 200 |
| Plain Astra (Codex) chat | 177 | **159** | −18 | 10 % | 89 → 71 | 88 → 88 |
| **Three Director (lean)** | 2,476 | **2,128** | −348 | 14 % | 885 → 779 | 1,591 → 1,349 |
| Three Director (full) | 9,785 | **9,061** | −724 | 7 % | 5,577 → 4,867 | 4,208 → 4,194 |
| Three Director on Astra | 2,476 | **2,128** | −348 | 14 % | 885 → 779 | 1,591 → 1,349 |
| **Forge director (Forge Debug)** | 1,530 | **1,171** | −359 | 23 % | 731 → 379 | 799 → 792 |
| Mission / swarm member (Claude) | 53 | **46** | −7 | 13 % | 53 → 46 | 0 |
| Mission / swarm member (Astra) | 53 | **45** | −8 | 15 % | 53 → 45 | 0 |
| 🔁 Keep going round (Director) | 2,506 | **2,158** | −348 | 14 % | 885 → 779 | 1,591 → 1,349 |

`dev/tokens-test.js` (with its sample memory) agrees: plain Claude 483 → 446, Astra 310 → 292, Three Director 2,554 →
2,213, Claude + board 1,052 → 1,015, Claude + board + screens 1,377 → 1,340, Director + board 3,123 → 2,782, Forge
Debug 1,625 → 1,266. The Director's lean tool list alone (no node tool): 1,184 → 962.

**A typical week** (tokensaver's mix: ≈ 600 Director messages, 150 plain Claude, 60 Astra, ≈ 20 Forge): ≈ **215,000
fewer tokens** counted once per message. A Director reply takes ≈ 4–5 tool steps and each one re-sends the fixed part,
so the real figure is several times that (mostly as cheaper cache reads).

Byte stability: every prompt and list is still made of constants (`dev/promptdiet-test.js` measures twice and compares
bytes; `dev/cache-test.js` passes). These changes alter the prompt once, with the update; every chat then caches it.

## Upgrades
### The Three Director (lean and full)
1. **One role line**: "You are the Three Director… Prefer good-looking defaults" — "small edits over rewrites" is said
   once, by the layer rule.
2. **Full mode no longer sends a second how-to** (≈ 590 tokens that repeated the guide it also sends), nor a second
   "You are…" line; it says once that three_do <cmd> in the guide is its own tool there.
3. **The core guide in fewer words**: the same rules (sketch, one layer per effect, sliders with the full tweak()
   example, time first, work loop, no pasted code, help).
4. **The nodes line says when**, the node tool's own description says how.
5. **The app-map line** shorter (same topics).
6. **Rare args are named in the words, not the schema** (eval's max / samples, screenshot's compare / frames / force,
   search's regex / context, media control's end / frame / step, set_code's report…): the server still passes them on and
   `three_do help <tool>` lists them all.
7. **Play-test and the contact sheet are three_do commands** in the lean list (`three_do input`, `three_do
   contact_sheet`): ≈ 115 tokens less on every Director step; the hub gets the same tool names (usage counts, picture
   sizes and icons unchanged); full mode still lists them as tools.
### Forge Debug
8. **The game's globals reference (≈ 420 tokens) moved to help**: the prompt keeps the four rules a typical ask needs
   and names `forge_eval {help: "globals"}`, answered by the tool server itself (no hub, no game).
9. **The game line in fewer words** (same asks: do it right away with the tools, check, reply briefly).
10. **Screenshots for the AI are 768 px** (≈ 440 tokens instead of ≈ 1,230 a picture, re-read at every later step);
    `size: "large"` sends 1280 for small details. The 📷 button still saves the full-size PNG.
11. **forge_eval / forge_status answers past ≈ 1.5k tokens are cut** (a whole S or C dumped by eval), the rest one call
    away.
### Every chat
12. **Shorter habit lines** (`<remember>`, `<suggest>`): same tags, same asks.
13. **Shorter role line** for plain chats and mission helpers ("Answer directly, no preamble or recap" kept).
14. **The chat tools' guide** (directors) in fewer words; `chat_ask`'s rare switches (multiple, free) in its words.
### Runaway tool results (every Hearth tool server)
15. **A result past its cap is cut at a line end** (≈ 4k tokens; Forge eval / status ≈ 1.5k): everything a tool returns
    stays in the chat's engine session and was re-read at every later step.
16. **The rest is one call away**: the same tool with `{more: true}` sends the next part, answered by the tool server
    itself (nothing runs again: no second eval in the game). The cut line says so. Pictures are never cut.
### Sleeping tool sets stay asleep
17. **Only the owner's own words wake a set** (toolwake.js): a saved fact riding along ("I use the Lab sequence as my
    video timeline" woke the screen tools, ≈ 330 tokens), a `[Hearth context: … last video …]` line, a make's room line,
    a mission note, the earlier conversation of a resumed chat, attached files' text and paths no longer do. Naming
    the board or a screenshot still wakes its set on that very message.
### Measuring and guarding
18. `node dev/promptdiet-measure.js` (`--save`, `--compare before.json`, `ROOT=<tree>`): the table above.
19. `node dev/promptdiet-test.js` (unit): a budget per case just above today's size; byte-stable twice; no dates; one
    "You are…" in lean and full; every core rule present; the help that took the moved words answers (input,
    contact_sheet, eval, screenshot, media_control args); Forge globals on demand; a 44k-character eval answer cut,
    `{more: true}` brings back every byte with no second hub call; the wake rules on seven kinds of wrapped text.
20. Budgets lowered: `dev/tokens-test.js` (every kind, chat lists 208 → 200 / 256 → 250), `dev/director-mcp-test.js`
    (lean list ≤ 1,220 → ≤ 990; 12 tools). Run group: `sh dev/run-checks.sh promptdiet`.

20 upgrades.

## Files
`engines.js` (`runAgent` split out of `send()`, shorter lines, one Director role line, full mode without the repeat),
`mcp/three-guide.js` (core, nodes line), `mcp/hearth-map.js` (LINE), `mcp/three-mcp.js` (lean schemas, VIA_DO),
`mcp/chat-mcp.js` (guide, chat_ask schema), `mcp/forge-game-mcp.js` (short guide + help, caps, words),
`mcp/common.js` (`capper`: cut + `{more: true}`), `toolwake.js` (`ownWords`), new `dev/promptdiet-measure.js`,
`dev/promptdiet-test.js`; `dev/tokens-test.js`, `dev/director-mcp-test.js`, `dev/run-checks.js` (unit list, group).
Small edit outside the lane: `tools/forge-game.js` (the AI's screenshot 768 px unless `size: "large"`).

## Tested
- `node --check` on every touched file.
- Unit: promptdiet-test, tokens-test, cache-test, director-mcp-test, toolslim-test, tokenaudit-test, concise-test,
  directorlean-test, director-cost, swarmlean-test, astra-engine-test, robust-engine-test, access-test,
  connections-test, handoff-test, memorytidy-test: pass.
- Smoke (fake engines): see the final report of this round (tokenaudit, cachewise, directorlean, concise, access-chat,
  lazy, boot-test).

## Not done (on purpose) / risks
- **Moved words cost a help call when needed**: a rare arg (eval samples, screenshot frames) or the Forge globals are
  one help call away; models fill args from the words (three_do has worked that way since round 25), but a first use
  may take one extra step.
- **Play-test / contact sheet through three_do**: the Director's dock shows those calls under three_do's icon in its
  strip (the hub still sees three_input / three_contact_sheet).
- **The cut**: a legitimately huge result (a 300-line layer read whole with force) comes in two parts; directorlean
  already outlines layers past 160 lines, so this is rare.
- **Full mode** still sends every topic and every long tool description (that is what it is for): 9k tokens a step.
- **The wake rule** reads the owner's message only: a set that only Hearth's context hinted at (an old reference in
  memory) stays asleep until named, used, or switched on this week.
- Mission notes pinned "from now on" still ride along with each message (they are per-message instructions).
- Numbers are characters / 4 on Hearth's text; no real engine here to read its own count.

## For the patch notes
- Every message to your AIs is lighter again: the Three Director ≈ 350 fewer tokens on every step (≈ 14 %), Forge
  Debug ≈ 360 fewer (≈ 23 %), plain Claude and Astra chats about 10 % less — about 215,000 fewer tokens in a typical week
  before counting tool steps.
- Nothing was removed: rarely needed details (the Forge game's full list of globals, rare tool options) are read on
  demand in one quick step.
- The Director's "full" mode no longer sends the same how-to twice (≈ 720 fewer tokens a step).
- Forge screenshots sent to the AI are smaller (still clear); it can ask for a large one. Your 📷 saves stay full size.
- A tool answer that runs very long (a huge game state, a long log) now goes to the AI in parts, so one runaway result
  no longer weighs on the rest of the chat.
- Board, screenshot and other opt-in tools no longer wake up because of your saved memory or Hearth's own notes — only
  when you name them, use them, or just switched them on.
