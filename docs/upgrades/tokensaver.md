# Token saver: fewer fixed tokens on every message (round 31, tokensaver)

Every message an AI gets carries the same fixed part again: Hearth's system prompt (`engines.js buildPrompt`), the
definitions of each tool set it has (`mcp/*.js`), its saved memory, and the owner's connections. This stream measured
that part for each kind of AI, cut it without taking a capability away, and put a budget test on it.
Measured with `node dev/tokens-test.js --table` (tokens ≈ characters / 4, like `mcp/cost.js`; the engines' own base
prompts are not Hearth's and not counted). Sample memory: 12 shared facts + 3 of Claude's own (≈ 150 tokens).

## Before → after (tokens per message)
| Kind of AI | prompt | memory | tools | **total before** | **total after** | saved |
|---|---:|---:|---:|---:|---:|---:|
| Plain Claude chat | 137 → 119 | 157 | 575 → 296 | 869 | **572** | −297 (34 %) |
| Plain Astra chat | 95 → 90 | 136 | 101 → 93 | 332 | **319** | −13 |
| Three Director (lean, Claude) | 943 → 882 | 136 | 1851 → 1808 | 2930 | **2826** | −104 |
| Three Director on Astra | 943 → 882 | 136 | 1851 → 1808 | 2930 | **2826** | −104 |
| Claude + board tools | 224 → 206 | 157 | 1596 → 1081 | 1977 | **1444** | −533 (27 %) |
| Claude + capture tools | 137 → 119 | 157 | 1125 → 781 | 1419 | **1057** | −362 (26 %) |
| Claude + apps tools | 179 → 161 | 157 | 1165 → 751 | 1501 | **1069** | −432 (29 %) |
| Astra + board tools | 182 → 177 | 136 | 1122 → 878 | 1440 | **1191** | −249 |
| Claude + a connection (4-tool server) | 137 → 119 | 157 | 716 → 437 | 1010 | **713** | −297 |

Tool sets on their own: chat 575 → 532 (directors) / **296** (plain chats), board 1021 → 785, capture 550 → 485,
apps 590 → 455. Hooks add nothing to any message (they live on the AI, never in the prompt); chat context lines
(`[Hearth context: …]`, the make line) were already sent only when a message names the thing (≈ 15–25 tokens then).

**A typical week** (the owner's mix: ≈ 600 director messages, 150 plain Claude, 60 Astra, 40 with board tools, 20 with
capture, 10 with apps, 20 with a connection): ≈ **147,000 fewer tokens a week** counted once per message. A reply
that uses tools re-sends the same fixed part with every step, so a tool-heavy week saves 3–5× that (mostly as cheaper
cache reads).

## Upgrades
### Plain chats
1. **Lean chat tools for plain chats**: a chat that isn't a director gets `chat_ask`, `chat_open` and one `chat_do`
   (plan checklist, picture, second opinion, problem report) instead of six tools: −279 tokens on every plain Claude
   message. Every call still reaches Hearth under its own name, so the plan card, pictures and second opinions work as
   before; directors keep the whole list.
2. **Shorter chat tool words** for everyone (same args, same rules): the chat list 575 → 532 for directors.
3. **Shorter habit lines**: the "suggest next steps" and "remember lasting facts" lines say the same in fewer words
   (≈ 18 tokens on every message of every chat).
### Opt-in tool sets
4. **Board tools: help on demand**: short descriptions; the whole how-to (every op, every layout, every focus) comes
   back from `board_do {help: "<tool or op>"}`, answered without Hearth: 1021 → 785.
5. The "references give a vibe, never the footage" rule stays in `board_vibe` and the board's prompt line.
6. **Capture tools: help on demand** (`capture_list {help}`): 550 → 485.
7. **Apps tools: help on demand** (`apps_open {help}`): 590 → 455; Meshy still says it costs credits and asks first.
8. One help mechanism for every Hearth tool server (`mcp/common.js` `leanTools` + `helpOf`): a tool's whole
   description, its args and long enums move to help; a help topic can be a tool or an op name.
### Directors
9. **One "You are…" line** for the Three Director (the generic chat line and the director line said it twice).
10. Shorter self-check and chat-guide lines (−18 on every director message).
### Memory
11. **Memory goes where it's cheapest by default**: a small memory stays in the system prompt (cached, read once per
    message); once it grows past ≈ 300 tokens it goes only with the messages it's about (the round 24 "relevant" mode,
    now automatic). `/memory relevant on | off | auto`; the AI setup's memory row is unchanged.
12. **A fact is sent at most once per chat** in relevant mode: a fact carried by a message stays in the chat's history,
    so sending it again made every later message re-read it twice (it may go again after 30 messages).
13. **Standing preferences** ("never…", "call me…", "keep replies short") go along in relevant mode even when the
    message doesn't share their words (once per chat).
14. The memory page's "tokens per message" and `/memory here` count a relevant memory as not on every message.
### Measuring and guarding
15. **`node dev/tokens-test.js`** (in the `unit` group): the table above, and it **fails** when any kind of AI grows
    past its budget, when a tool set's own list grows, when a plain chat gets a guide for tools it doesn't have, when
    the prompt stops being stable (dates, times) or a new memory fact would change it, or when help stops answering.
16. `mcp/cost.js` measures the lean chat list for plain chats, so `/director-cost`, the chat's cost split and the
    context advisor show what is really sent.

## Kept stable for the prompt cache
The system prompt has no dates, times or counters; a big memory leaves it so a new fact no longer changes it (a change
invalidates the cached prompt and the whole chat after it). Tool lists don't change while the app runs.

## Not done (on purpose) / risks
- Making "relevant" memory the default for every memory: measured worse for small memories (each fact sent with a
  message is re-read by every later message; ≈ 3 messages to break even), so it's automatic only above ≈ 300 tokens.
  In relevant mode a fact that shares no word with any message isn't seen (standing preferences excepted).
- Directors keep the whole chat list (they use chat_progress / chat_show a lot, and the dock's asks name them):
  moving them to `chat_do` would save another ≈ 236 tokens per director message; easy to switch in `engines.js
  chatGuideOn` if wanted.
- The models now read some details on demand (one `help` call) instead of up front: a first call with a rare option
  may take one extra step.
- The Three Director's own guide and lean list (1183 + 93 nodes) were left to their existing budget
  (`dev/director-mcp-test.js`).

## For the patch notes
- Every message to your AIs is lighter: a plain Claude chat sends ≈ 300 fewer tokens with each message (≈ 34 % of
  its fixed part), the Three Director ≈ 100 fewer.
- Board, capture and app tools cost about a quarter less per message when they're on; the AI asks for the details of a
  tool only when it needs them.
- Plain chats keep every chat ability (questions, plan checklist, pictures, second opinions, opening files), in a
  shorter tool list.
- Saved memory goes where it costs least: in the AI's instructions while it's short, only with the messages it's about
  once it's long, and never twice in the same chat.
- Preferences like "never…" or "call me…" always reach the AI, even when your memory is long.
- A typical week saves ≈ 150,000 tokens before counting tool steps (more when the AIs use tools a lot).
- New self-check (`dev/tokens-test.js`) keeps these numbers from creeping back up.
