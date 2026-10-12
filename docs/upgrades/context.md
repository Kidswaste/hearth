# Context (round 24): smarter chat context for fewer tokens

Chats now take exactly what a message needs, show what each message cost, keep memory short and scoped, and move
on from long conversations with a free summary. **Nothing is added to any message by default and the system prompt
never grows**: every item here is opt-in (you pick a reference, pin a fact, turn a mode on) or replaces something bigger.

Everything lives in one lazy group (`context`, loads right after the first screen): `context-core.js` (the pure part,
also used by Node), `chat-refs.js`, `chat-memory.js`, `chat-cost.js`, `chat-fresh.js`, `context.css`.

## Measured (before → after, `node dev/context-cost.js`)
Counted the way the fake engines count (`dev/fake-claude.js`: 700 base + every character of the session / 4) plus each
agent's exact system prompt and tool sets (`mcp/cost.js exactOf`, as `dev/director-cost.js`).

| Scenario | Before | After | Saved |
|---|---:|---:|---:|
| A 60-message director chat, its next message (`/fresh`) | 9,782 | 4,394 | 5,388 (55 %), on every next message |
| Writing that summary | 10,132 (one more full message: `/fresh ask`, the old way) | 0 (made here) | 10,132 (100 %) |
| A 4-layer scene given to a director (`@scene` vs every layer's code) | 2,001 | 108 | 1,893 (95 %) |
| … the whole director message with it | 6,045 | 4,152 | 1,893 (31 %) |
| Memory of 20 facts, per message (`/memory relevant on`) | 222 | 21 on average (0–42) | 201 (91 %) |
| A plain chat with Board tools it never uses (`/context fix`) | 2,501 | 1,412 | 1,089 (44 %) |

The 60-message chat's history is ≈ 6,000 tokens of text (conservative: a real Claude session also re-reads every tool
call and result, so real savings are larger); its free summary is 298 tokens (233 words: 6 decisions, 6 things done,
2 open, its key files). The fresh start pays off from the very first message.

## @ references in the chat box
1. **Type @ in any chat box** (docked directors too): a small menu of what can go along with this message; nothing is attached until you pick.
2. **@chat**: another chat as a short summary (its compact summary when it has one, else a free one: goal, decisions, open tasks, files), never its history.
3. **@scene**: a Lab scene's compact state: layers bottom first, filter / shader, hidden, blend, opacity, timing, keyframed properties, line counts and slider values; no code (≈ 100 tokens vs ≈ 2,000 for the code).
4. **@board**: a board's vibe text (what `/board-use` sends; never its media).
5. **@file**: a text file inline (up to 60 KB), any other file as its path for the agent to open; files this chat mentioned are offered first, then "Choose a file…".
6. **@render**: a recent render as one line (its path and date).
7. **@render … + contact sheet**: the same with a picture of its frames (≈ 1.6k tokens, shown before you pick).
8. **@project**: a project's notes and key facts (round 23 projects).
9. **The cost of each choice is shown before you attach it**, measured on the exact text it will add ("≈ 108 tokens").
10. **The chip says what it costs** (`@scene · Neon orb · 108 tok`); × removes it as before.
11. A toast sums up what is attached in all.
12. The same reference twice replaces itself, never doubles.
13. Keyboard: `@sc` filters the kinds, Enter opens one (`@scene:`), typing after the colon filters by name, ↑↓ Enter / Tab, Esc closes; the `@…` text leaves the box when you pick.
14. **`/ref <chat | scene | board | file | render | project> [name]`**: the same by command (`/ref` alone lists the kinds).
15. The message keeps each reference's cost (and the engine gets exactly that text: checked byte for byte).

## Memory only when it matters
16. **A chat's pinned facts**: `/memory pin <fact>`.
17. `--always` (or a leading `!` in the editor) sends a pinned fact with every message of that chat.
18. **A project's key facts**: `/memory project <fact>` (`/memory project` lists them).
19. **Sent only when a message is about them**: shared words (stems) or the project's name; at most 5 facts and ≈ 140 tokens, as one line `[Memory, approved by the user: …]`. No facts, no line.
20. **🧠 on your message**: hover for the facts it carried, its tokens and this chat's running total.
21. **`/memory here`**: this chat's and its project's facts with their tokens, how many messages carried memory and how many tokens in all, and what the agent's always-on memory costs.
22. **`/memory forget <words>`**.
23. **`/memory edit`**: both lists in one dialog, one fact per line.
24. **`/memory relevant on|off`** (per agent): the agent's saved memory leaves the system prompt and goes only with the messages it fits (222 → 21 tokens a message for 20 facts).
25. **`/memory approve on|off`**: a `<remember>` fact waits for your OK: **This chat**, **This project**, **Everywhere** or ×.
26. A `<remember>` chip now offers **This chat only**: the fact moves out of the memory sent with every message.
27. … and **This project only** when the chat is in a project.
28. `@project` carries the project's key facts.
29. A fresh start brings the old chat's pinned facts along.

## What each message sent (the meter, per message)
30. **A thin bar under every reply**, next to its token line: history, tools, system prompt, engine base, @ references, attachments, memory, your words, in proportion.
31. Hover: each part in tokens and %, tools per set ("Lab tools 1.8k, chat tools 575"), the memory part of the system prompt.
32. Click: the list, the cheapest fixes with what each saves per message, and "Attach only what's needed" (puts @ in the box).
33. Measured, not guessed: the system prompt and tool sets are the ones engines.js really sends for that chat's agent (its `/capture-tools`, `/crew` included), measured in the main process and cached.
34. The engine's own base is learned per engine from a new chat's first message.
35. **When a chat is expensive it names the cheapest fix once** (a tip with a **Fix** button), only when it saves ≥ 2k tokens a message.
36. Fix: tool sets the chat never used in its last 20 replies ("this chat sends 1k tokens of Board tools every message and hasn't used them: switch them off?" → `/board-tools off`; capture, apps, Adobe, deploy too).
37. Fix: a long history → `/fresh`, with what the summary would send instead.
38. Fix: always-on memory over 150 tokens → `/memory relevant on`.
39. **`/context`** now adds what the last message was made of and the cheapest fixes under the meter's own line.
40. **`/context fix`** runs the first fix.
41. The tips can be turned off from the bar's menu (More › Tips when a chat is expensive).

## Fresh start with a summary
42. **`/fresh`**: a new chat that carries only the essential state, made here for free (no engine call): the goal, what was decided, what was done, what is open, key files and names, where it stopped.
43. **Shown and editable before anything moves**, with what the next message will cost instead ("≈ 4.4k tokens instead of 9.8k").
44. The long-chat banner's **New chat from a summary** uses it (it used to cost one more full message).
45. A chat that was compacted carries its agent-written compact summary instead.
46. **`/fresh ask`**: the agent writes the summary (the old way, one message at today's size).
47. The summary stays visible as the new chat's first message with **✎ Edit the summary** (`/fresh edit`); an edit after the engine read it goes along once as a correction.
48. **What it really saved**, after the first reply: "this message sent 4.4k tokens instead of ≈ 9.8k (saved ≈ 5.4k, and as much on every next one)".
49. **`/fresh auto on [60k]`** (opt-in per agent): past that size it starts fresh by itself after a reply (the summary stays editable); `/fresh auto off`.
50. The fresh chat joins the old chat's project, keeps its `/capture-tools` and style, inherits what it worked with (board, scene…), and the toast has **Back**.

## For developers (not counted)
- `context-core.js` (Node-loadable): `ref`, `sceneCompact` / `sceneFull`, `localSummary`, `chatDigest`, `relevant`, `breakdown`, `fixes`.
- `mcp/cost.js exactOf(agent)`: one agent's whole system prompt (memory part apart) and the tool sets `hubToolsets` really gives it; `report()` uses it for agents marked `exact` (`window.hub.directorCost`), tool sets measured once per variant.
- `engines.js` buildPrompt: `agent.memoryWhenRelevant` drops the memory notes (only then).
- Small hooks: `native.js` (the chip's cost, attachment meta carries `tokens`, `ChatMemory.intercept` before `rememberFacts`, the banner → `ChatFresh.start`), `chat-cmds.js` (`/fresh` hands its run to `ChatFresh.run`). `/context` and `/memory` share their names through `when` (commands.js).
- Tests: `node dev/context-test.js` (8), `dev/checks/context.js` (the @ menu, exact payload, memory only when relevant, the bar and `/context`, fresh start measured), `node dev/context-cost.js` (the table above). `sh dev/run-checks.sh context`.
