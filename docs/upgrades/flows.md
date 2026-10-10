# Flows (round 10): most commands move into flows you click through, the principal ones stay

You asked: "remove most commands aside from the principal ones and move them to something I can iterate on visually.
I imagine it like nodes: I select Doctor, and from there I can select the next step, take yes/no options, add text
where it's needed, then validate the option, and both me and the chats have the ability to track where we're at in
the process, if something froze up or was hung up, pick it back up where it was left at, and the output is either
re-creatable from the same prompt if I'm not happy with the result, or can be fine-tuned further if I am."

What changed:
- **The "/" menu lists 40 principal commands** (the ones you use: Save, Shuffle, Tap, Freeze, frame sizes, Live sound,
  Present, the Three Director's chat, Doctor, the board, capture, the editor…), then **⇢ Flows ›**. The other ≈ 890
  commands are **tucked, not deleted**: typed by name they run as before (and chats, timers, macros, pipes and the
  command bar still use them), typing in the "/" menu still finds them under "In flows (run by name)", and each one is
  one choice away inside its flow.
- **A flow is a small node graph of steps**: run a command · a choice (yes / no or more) · your words · the AI does it
  (Claude or Astra) · wait for something · the result. You see it as nodes with connecting dots (the node editor of
  rounds 1–2), the step you're on lit, the steps before it filled with what you chose / typed / what they made, the
  options as buttons right on the node, **Validate ✓** to move on.
- **Every walk through a flow is a run** kept on disk, listed in one place, shown as a live card in the chat it started
  from, readable by the chats. A step that froze (too long, an engine that stopped, Hearth closed in the middle) is
  **hung: pick up here** continues from it. A finished run can go **↻ Again** (same answers, a new result), **✎ change
  an answer** and continue (a branch, the first run stays), or be **✎ refined** (keep it, say what to change).
- **Ten journeys written by hand** (Doctor, Make a video, Record Hearth, Lab scene, Sequence, Mood board, Export, Astra
  & Claude, Look, Memory) and **31 flows made from the commands themselves**, one per area, so nothing is lost.
- **You can edit any flow as nodes** and save it as yours, or ask a chat: `/flow-make <what>`.

Token frugality: nothing is added to any prompt or engine flag. A chat hears about a flow only when the chat has one
going **and** your message is about it ("where are we", "next step", "continue"…): one `[Hearth flow: …]` line,
≈ 40 tokens. AI steps are lean one-off questions (no tools, no history) unless the step says "in the chat" (Lab scene
→ the Three Director). `/flow-make` is one question with the ≈ 40 commands that fit (≈ 900 tokens, only when you ask).

Counted honestly: one line per thing you can see or use (a command, a menu entry, a key, a behaviour, a flow).

## The flow view (Ctrl/⌘+Shift+F, `/flows`, "/" → ⇢ Flows ›, Ctrl+K "Flows…")
1. **The flow view**: one dialog: the list of flows and runs on the left (☰ or L hides it), the flow as nodes in the middle, the run's steps on the right.
2. **Six kinds of steps**, each with its color and mark: ▶ run a command, ◇ a choice, ✎ your words, ✦ the AI does it, ⏱ wait for…, ★ the result.
3. Steps are laid out left to right in the order you meet them from the start (a loop back never pushes a step further right).
4. **The step it's on is lit** (gold, pulsing mark); steps done turn green with ✓; a hung step turns orange.
5. **Past steps show what happened** on the node: the option you chose (✓ and green), the words you typed (in quotes), what a command or the AI made (its output, the command line it ran, the prompt it sent).
6. **Options are buttons right on the node** (the choice's own outputs, each wired to where it leads): click to pick, **Validate ✓** (on the node or at the top) to move on.
7. Double-click an option: pick it and validate in one go.
8. **Hearth's guess is lit** where it can tell (Doctor: the card says "both engines can work" → Yes is outlined, "Hearth thinks: Yes"); Validate with nothing picked takes the guess.
9. The top button says what it will take: **"Validate: Yes ✓"**.
10. **Words where they're needed**: a box on the node (Enter validates; Ctrl/⌘+Enter in the bigger box), with its placeholder.
11. A step that fills a command's arguments shows the command's argument line (`/shuffle [group|colors…]`) and its own suggestions as chips; it's skipped for a command that takes none.
12. **Choices fed by a command's own suggestions**: Look → "Which look?" lists every app look as chips; Sequence → every arrangement template.
13. A choice with more than 8 options gets a filter box on the node (Enter picks the first match).
14. Keys: **1…9** pick option 1…9, **Enter** validates, **L** shows / hides the list (all in the keys sheet).
15. **"Last time: …"** under a choice when you went back: the answer that run gave.
16. **The steps list** (right): each step with ✓ / ⏸ / ◐ / ! / – / ↻, what was chosen / typed / made, its time on hover; click centers the node.
17. **The list** (left): Going now (runs not finished), Journeys, Yours, Every command as flows (with their command counts), Recent runs; the search finds flows by name and by any command they hold.
18. A flow shows first as a preview (what it does, how many commands it holds, ▶ Start, ✎ Edit a copy, its last runs); double-click in the list starts it.
19. **One main button that does the next thing**: ▶ Start · Validate ✓ · ↻ Pick up here · ↻ Again · ■ Stop · Save as mine; the rest is in ⋯.
20. Steps grow with what they made and never overlap (the ones below move down).
21. The view opens on the whole flow when it fits at a readable size, otherwise on the step you're on; it follows the step that waits.
22. Right-click a node: copy what it made, change this answer…, go back here (a branch).
23. Right-click a step in the list: the same.
24. Right-click a flow in the list: ▶ Start, ✎ Edit a copy, copy as JSON, its commands › (each runs on click), delete (yours).

## Runs: tracked, picked up, re-created, refined
25. **Every run is kept on disk** (`data/kv/flow-runs.json`, the 80 newest): the flow it followed, where it is, every choice / words / output with start and end times, the run's status.
26. **Statuses**: running · waiting for you · waiting for AI · hung (pick up here) · done · stopped, as a colored pill in the head and a dot in the list.
27. **Hung detection**: a command step running over 2 min, an AI step over 6 min, a check past its own time limit (looked at every 5 s while something runs, no DOM work).
28. An engine that stopped or failed during an AI step (or a command that errored) leaves the run hung with the reason.
29. **Hearth closed in the middle of a step**: after the restart that run is hung ("Hearth closed during this step").
30. One notice after a restart: "N flows stopped halfway when Hearth closed" with **Pick up here**.
31. **↻ Pick up here**: starts the step that hung again; the steps before it stay done (on the node, at the top, on the chat card, `/flow-step resume`).
32. A late answer from a step that was given up on (hung, stopped, picked up) changes nothing.
33. **■ Stop** a run (⋯, right-click, the card, `/flow-step stop`); a stopped run can be picked up too.
34. **↻ Again: the same prompt, a new result**: a new run from the start with your answers replayed; commands and AI steps run again.
35. **✎ change an answer and continue**: on a past choice / words (✎ change, right-click, `/flow-step back <n> [answer]`): a new run from that step with the new answer; the first run keeps its history; later choices show your old answers.
36. Runs remember where they came from and their branches ("Came from · branches" under the steps).
37. **✎ Refine the result**: keep it and say what to change; the flow's own AI (Astra in Make a video) redoes it from the result, and the new result shows; refine as often as you like.
38. The refine steps appear as nodes wired after the result, so the run shows its whole history.
39. ⧉ Copy the result (on the result node), "Copy where it is" (one line).
40. ⋯ → Forget finished runs.

## In the chat
41. **A live card in the chat the run started from**: the flow, steps done, its status, the question waiting and its options as buttons (answer from the chat), Answer… for words, ↻ Pick up here, ↻ Again, ✎ Refine, Open ›.
42. The card updates in place as the run moves (once per change, compared before writing) and comes back when you return to that chat.
43. Right-click the card: answer ›, pick up here, run again, refine, change an answer ›, copy where it is, stop.
44. **Commands a step runs still talk in the chat**: Doctor's own card appears with its fix buttons; their text becomes the step's output.
45. **Chats know where you are**: when a chat has a flow going and your message is about it ("where are we", "next step", "continue", "pick it up"…), one line about the run rides along with it (≈ 40 tokens); otherwise nothing is added.
46. **A reply can move the flow**: Claude or Astra ends its reply with `<flow answer="codex"/>` (or `resume="1"`); Hearth applies it and strips it from the reply.
47. `/flow-status [all]`: where this chat's flows are, one short line each (also what chats and directors run).
48. `/flow-step <answer> | resume | again | refine <what> | stop | back <n> [answer]`: move this chat's flow.
49. Directors may run `/flow-status` and `/flow-step` themselves (`three_do run`), when you ask.
50. The app map has a **flows** topic (read on demand by both engines, nothing in the prompt).
51. **AI steps**: a lean one-off question to Claude or Astra (no tools, no history: about one plain reply), or "in the chat" (Lab scene sends your words to the Three Director and waits for its reply); their tokens reach the meter.

## Fewer commands in the "/" menu
52. **The "/" menu lists the principal commands only** (40, by area; pinned and recent ones still come first, whatever they are).
53. **⇢ Flows ›** after the areas: the journeys, yours, every command as flows, "Open the flows view…"; picking one starts it in this chat.
54. Up to 2 runs waiting for you (or hung) show under Flows, one click to open.
55. An area lists its principal commands, then **"N more … commands ›"** (every command of that area).
56. "More areas ›" ends with **"Every command (in flows too) ›"**, every area with all its commands.
57. **Typing still finds every command**: principal ones first, then the rest under "In flows (run by name)"; a name typed exactly comes first.
58. **The 4 commands you run most** (3 runs or more) join the principal ones by themselves.
59. `/principal [list | add <command> | remove <command> | reset]`: choose what the "/" menu shows.
60. `/flow-where <command>`: is it in the "/" menu, which flow holds it, which journeys use it.
61. **Nothing is removed**: every command still runs typed by name, from chats, `/do`, timers, macros, aliases, pipes, clickable commands in replies and the command bar.

## Journeys (written by hand)
62. **✚ Doctor**: check both engines → "Does the card say both engines can work?" (Hearth guesses) → which one → what the card says (too old / not installed / signed out / an older copy pinned / something else) → update or install in a visible window, sign in, use the newest copy, or Claude explains → "Done in that window?" → check again → fixed? (else round again) → test both with a real reply (a few tokens) → the result.
63. **🎬 Make a video**: your idea → format (9:16, 16:9, 1:1, 4:5) → length (15, 30, 60 s) → Astra drafts the beats → keep / change them (your words, Astra redoes them) / new ones → the video project (`/intro` with its length and format) → let the chats build it now (`/intro go`, then waits until it is rendered) or not yet → the result.
64. **◉ Record Hearth**: the window, this tool, the chat, a region or a scripted tour → sound (none, Hearth's, mic, both) → 10 s, 30 s or until you stop → record → done? → stop → open it → open it in the editor, a GIF or a contact sheet.
65. **◭ Lab scene**: describe the visual → Claude (Three Director), Astra, or both taking turns (jam) → it's built in the Lab (in the director's chat) → keep it (save the look), shuffle the sliders, change something (your words to the director), a 9:16 still → round again until you keep it.
66. **▤ Sequence**: arrange your scenes on the song (a template, or Hearth picks), add this scene, or just open it → render 9:16 / 16:9 / 1:1 / every format, or not yet → finish it in the video editor.
67. **▦ Mood board**: open it → add a reference (a website, a file, #colors, a note), give this chat its vibe, show the vibe here, a new board → again until done.
68. **⇪ Export**: this chat (Markdown, HTML, JSON, text, the clipboard), token usage (CSV, JSON, a table), memory, your aliases / macros / pins, notes, a backup of everything.
69. **⚇ Astra & Claude**: side by side, one drafts and the other improves, a debate, a council, a second opinion on the last reply, hand this chat to the other, jam a music visual → about what (skipped when it needs nothing) → started.
70. **◐ Look**: I pick (every look as chips), Astra picks, surprise me → keep it, back to the one before, or another.
71. **🧠 Memory**: remember something (this agent or every agent), forget something, what it remembers, what it costs per message, export it.

## Every command, as flows (made from the commands themselves)
72. **One flow per area holds every other command**: "What do you want to do?" (Make / add / open, Change, Arrange & view, Share & save, Look up, Undo & clean, More; big kinds in parts A–Z) → which command (each with its description) → its arguments (with its suggestions; skipped when it takes none) → run it → the result → another one?
73. They are made again whenever commands are added (a stream that registers more later lands in a flow too); the commands you run most come first.
74–104. The 31 area flows: Lab: music & timing · Lab: motion kit · Lab: footage & frames · Lab: sequence & scenes · Lab: sliders & looks · Lab: layers & effects · Lab: everything else · Video flows & After Effects · Video editor · Video Review · Video projects · Mood board: every command · Capture & frames · Directors · Nodes & shader nodes · Forge Debug · Claude & Astra together · Astra settings · Let the AI decide · Agents & engines · Chats · Messages · Write & attach · Memory: every command · Notes, prompts & export · Look & view · Tokens & usage · Color & timing kit · Backups & data · App, timers & macros · Flows (what holds which command: below).

## Make your own
105. **✎ Edit a copy of any flow as nodes** (`/flow-edit [flow]`, ⋯, right-click in the list): add steps from the picker (Tab or double-click the background: a command, a choice, your words, the AI, wait for, a result), drag wires between the dots, delete steps, Start here.
106. **Select a step to change it**: its title, the command it runs (every command offered as you type), the prompt and engine of an AI step, a choice's options (one per line, "Label = value"), the answer's name for `{…}`, a check's question or the output it waits for, the result's text.
107. **A live check while you edit**: what's wrong (a step that leads nowhere, an unknown command, a step nothing reaches…) under the inspector.
108. **Save as mine**: your flows on disk (`data/kv/flows-mine.json`), under "Yours" in the list and the "/" menu, deleted from their right-click.
109. ⋯ → Copy as JSON / Paste a flow (JSON).
110. **`/flow-make <what>`** (or ⋯ → Ask Claude to make a flow…): Claude writes the flow from the commands that fit (one lean question, the JSON checked before it opens), it opens in the editor to check and save.
111. `/flow <flow> [answer ; answer…]`: start a flow in this chat (answers given up front fill its first steps).
112. `/flows [flow | runs]`: the flow view, on a flow or on the latest run.
113. **Ctrl/⌘+Shift+F** opens / closes the flow view from anywhere (Mac and Windows; listed in the keys sheet).

## Fixes
114. Fixed: a chat note replaced by a newer one (same kind, e.g. Doctor's card refreshed) came back when the chat redrew; now it stays replaced.

**Count: 114 upgrades** (numbered 1–114; 74–104 are the 31 area flows, one each).

## The principal commands (the "/" menu)
<!-- PRINCIPAL -->

## Where every other command went
Every command below is tucked out of the "/" menu, still runs typed by name, and lives in the flow named in its row
(`/flow <id>` starts it; `/flow-where <command>` says it in the chat). Commands a journey uses are listed under it too.
<!-- MAP -->

## For development (not counted)
- `flows.js` (`Flows`): the engine, no DOM (Node-testable): `define`, `validate`, `fromText`, `start`, `answer`, `advance`,
  `resume`, `stop`, `checkHung`, `rerun`, `branch`, `refine`, `restore` / `persist`, `waiting`, `current`, `line`, `onChange`;
  the app plugs in its environment with `Flows.configure({ load, save, runCommand, ask, cmdInfo, cmdOptions })`.
- Flow JSON: `{ id, name, desc, icon, start, nodes: [{ id, kind: action|choice|text|ai|check|result, title, next, cmd,
  options: [{ label, value, next, set }], var, placeholder, argsOf, optionsFrom, guess, skipIf, engine, agent, inChat,
  prompt, ask, match, every, timeout, onError, onFail, text }] }`; `{answer}` and `{last}` fill commands, prompts and results.
- `flows-data.js` (`FlowsData`): `PRINCIPAL`, `JOURNEYS`, `AREA_FLOWS` rules, `generate(defs)`, `commandFlow`, `flowFor`, `journeysWith`.
- `flows-ui.js` (`FlowsUI`): `open({ flowId | runId | edit | draft })`, `startIn(flowId, { agentId, chatId, open })`,
  `principal()`, `whereIs(name)`, `makeFlow(what)`; `Commands.setTuck(fn)` / `Commands.isTucked(def)` (commands.js) and
  the "/" view (chat-slash.js, notes.js) read it.
- Tests: `node dev/flows-test.js` (18 Node tests: run, choices, words, a command, an AI step on a fake engine, checks,
  hung after a restart + pick up, too long + a late answer, an engine failing, again, branch, refine, stop / resume,
  JSON authoring, the journeys valid, Doctor both ways, every command in exactly one flow, a generated flow);
  `dev/checks/flows.js` (the "/" view, tucked and hidden commands by name, Doctor like a user from the "/" menu, the chat
  card, the chat line and `<flow answer>`, `/flow-status`, `/flow-step`, hung after restore + pick up, `/principal`,
  editing + save, `/flow-make` with the fake engine, Ctrl+Shift+F); `dev/checks/flows-video.js` (Make a video like a user:
  typed and picked on the nodes, Astra's beats changed, `/intro` planned, Again, Refine, the chat card).
  `sh dev/run-checks.sh flows` runs all three.
