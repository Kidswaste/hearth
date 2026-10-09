# Brain stream (round 6): both AIs understand Hearth, build the way you want, and pick up each other's work

You asked: "make it easier for the AI to understand the whole program and use the full features always; a new
three.js effect always in its own layer, ideally with a node representation; seamless to switch from Claude to Astra;
not every scene reactive to music at first, like After Effects." This round does that for the Three Director (and the
Video Director's share of it), on Claude and on Astra alike, without growing what each message costs more than the
node tool you asked for.

## What it costs per message (before → after)
Fixed overhead per director message (tool list + its part of the system prompt; ≈ characters / 4, `node dev/director-cost.js`, `/director-cost`):

| Director | Before | After | Note |
| --- | ---: | ---: | --- |
| Three Director (node tool on: the new default) | 2,987 (opt-in) | **3,018** | +31: the app map line, `three_add_layer` as its own tool, `run` / `task` |
| Three Director, `/nodes-director off` | 2,842 (old default) | 2,859 | +17 |
| Video Director | 1,568 | 1,638 | +70: `hearth_help` (the app map) |
| Forge Debug | 1,532 | 1,532 | unchanged |
| Three Director, full mode (opt-in) | 7,472 | 7,794 | + run / task / help tools |

The core guide got shorter (649 → 537 tokens) to pay for the new rules and the map line; the eight map topics
(≈ 1,600 tokens) are read only when a director asks for one.

What the director reads back from its everyday calls (characters, measured in `dev/checks/brain.js`):

| Call | Before | After |
| --- | ---: | ---: |
| `three_add_layer` (now the everyday way to add anything) | 4,407 | 349 |
| `three_do keyframes` (now the everyday way to move things) | 4,463 | 131 |
| `three_do animate` | ≈ 4,400 | ≈ 130 |

Switching engines: the new engine used to try the old engine's session, fail, and start again with the whole
conversation (up to 24,000 characters ≈ 6,000 tokens). Now it starts straight away with the task state (≈ 100–250
tokens) + the last 3 messages (≤ 300 characters each): ≤ ≈ 500 tokens whatever the chat's length (347 in the test run).

Measured in fake runs (`dev/checks/brain.js`): 5 "add …" asks across Claude → Astra → Claude, node tool on and off →
**exactly 1 new layer per ask**, 4 of 5 built as node graphs (the 5th with the node tool switched off: a code layer),
none reacting to the music, all moving on the timeline, the Nodes view showing each one.

## The app map, for both engines (1–12)
1. **App map** (`mcp/hearth-map.js`): what Hearth is, the Lab's model (sketch → layers → sliders / keyframes / looks / filters → node graphs → timeline / song), Video Review, the chat commands a director can suggest or run, how Claude and Astra share a chat, and your habits. Read on demand, never sent with every message.
2. Map topic **app**: the whole program in one screen (directors, per-chat scenes, backstage, commands, "few choices").
3. Map topic **lab**: the Lab's model bottom-up, and how you work (Save, Shuffle, frame sizes, Freeze, Present, record).
4. Map topic **nodes**: every three_nodes verb, the node categories, when to use a code layer instead.
5. Map topic **react**: how to make a scene react only when you ask (`/make-it-react`, Music nodes, audio globals).
6. Map topic **commands**: the Lab / music / nodes / director / video commands, which ones it may run itself.
7. Map topic **handoff**: the task state Hearth keeps and how the other engine picks it up.
8. Map topic **habits**: your rules (new layer per effect, nodes, time first, knobs, look before claiming, decide small things).
9. Map topic **video**: Video Review for the Video Director.
10. Three Director: `three_do { cmd: "help", topic: "app" }` (and the other topics) answered by the tool server, no hub trip; unknown topics list the map's too.
11. Video Director: a small `hearth_help` tool with the same map.
12. One short map line in the Three Director's prompt (≈ 50 tokens) pointing at the topics; identical for Claude and Astra.

## Tool descriptions brought up to date (13–20)
13. **`three_add_layer` is an everyday tool** of its own ("a NEW layer for each new element or effect"), no longer hidden in three_do.
14. `three_set_code` now says it rewrites a layer: for an empty sketch or when you ask; new elements go in a new layer.
15. `three_nodes` description shortened (≈ 75 tokens) and lists `layer <preset>` first.
16. `three_media_info` (full mode) describes what the music analysis now gives: grid and how sure, labeled sections, drops, hits found in the audio, style.
17. Leaner `three_eval`, `three_screenshot`, `three_input`, `three_media_control`, `three_contact_sheet`, `three_sliders` descriptions (same options, fewer tokens).
18. **`three_do run { command }`**: the director runs a Lab / music / nodes / video chat command itself (e.g. `/make-it-react`, `/size 9:16`) and reads what it printed; anything that deletes, resets, signs in, changes settings or starts other agents stays yours.
19. **`three_do task`**: the director reads this chat's task state (and can set its open todos).
20. Full mode (`/director-mode full`) gets the same as tools: `three_run`, `three_task`, `three_help`.

## Layers always (21–25)
21. Guide rule "ONE LAYER PER EFFECT": every new element or effect is a new layer; rewrite a layer only when asked.
22. A `three_set_code` that replaces a real layer (one with sliders, not a starter) answers with a one-line reminder: "New elements or effects go in a new layer" (and that `/undo-edit` restores it).
23. `three_add_layer` answers compactly (349 characters instead of 4,407): what was added, errors, fps, layers.
24. Keyframes and animation presets answer in one line (131 characters instead of 4,463).
25. Jam builds are asked to put a new element in its own layer too.

## Nodes always (26–39)
26. **The node tool is on by default** for Three directors (Claude and Astra): you asked for a node view of visual work. `/nodes-director off` still switches it off (now remembered as off).
27. The guide tells directors to build visual layers as node graphs ("layer <preset>", then add / link / set) and to keep code layers for what nodes can't do; node layers are changed with the node tool, so their graphs stay editable.
28. The node tool works on **its own chat's scene** even when you're looking at another chat (backstage): layer, preset, list, add, link, unlink, set, rm, layout, rebuild change that chat's sketch only (it used to change whatever was on screen).
29. **Keyframes node** (Time): a value over the song's time from keys like `0:0.8, 2:1.15, 4:1` with smooth / linear / hold easing, in seconds, beats or bars, looping at the last key; Amount and Offset. After Effects keys in a graph, no music needed.
30. Preset **Timed shape** (the new default): a glowing wireframe shape that breathes on keyframes and drifts through the palette.
31. Preset **Tunnel flight**: rings rushing past, slow intro → full speed at 16 s → easing out.
32. Preset **Galaxy by sections**: a turning galaxy whose colors step along the palette at each of your cues.
33. Preset **Drifting cubes**: a floor of palette cubes whose wave swells over the song and settles.
34. Preset **Orbit trails**: a glowing ring dancing a figure 8 with trails, easing in over the first bars.
35. Preset lists mark **⏱ timeline** presets (listed first) and **♪ music** ones, for you and the director.
36. `/nodes-new`, `/nodes-layer`, `/nodes-preset` with no name start from Timed shape instead of the kick-pumping shape.
37. A director's nodes edit opens the Nodes view so you see the graph it just made.
38. Code a director writes for a node layer is checked to round-trip (`ThreeNodes.fromCode`) in the tests.
39. `/nodes-director` describes the new default and its cost.

## Time first, music when you ask (40–47)
40. Guide rule "TIME FIRST (like After Effects)": motion from time, easing, keyframes, cues and sections; reactivity only when asked ("make it react" → `/make-it-react` or Music nodes).
41. The audio help topic is labeled for when you want it to react; the keyframes topic is "the default way to make things move".
42. Full mode's prompt no longer says every sketch must react to the music.
43. Layer template **Shape** turns and breathes over time; its Kick punch starts at 0.
44. Layer template **Pulse rings** breathes over time; Kick punch starts at 0.
45. Layer template **Particle field**: Snare flash starts at 0.
46. Filter layers **Datamosh** and **Glitch**: "on hits" starts off (they move over time until you switch it on).
47. Filter layers **Pixelate**, **Edge glow** and **Glow**: Kick punch starts at 0. (Your existing sketches are unchanged: only new layers start calm.)

## Claude ⇄ Astra, seamless (48–60)
48. **Task state per director chat**, kept by Hearth (not by the model) in `data/kv/director-tasks.json`.
49. It records your goal and latest asks from what you send the director.
50. It records what was done from the director's own tool calls (layers added, edits, node edits, keyframes, looks, frame, renders…), folding repeats ("edited "Rings" ×3").
51. The director's checklist (`chat_progress`) becomes the open todos.
52. It notes the last screenshot (when and by whom) and the scene's layers (nodes / code / filter, selected).
53. **Handover**: when the engine changes, the new one starts straight away with the task state + the last 3 messages ("[Task state … you are taking over from Claude …]") instead of a failing resume and the whole conversation.
54. **`/director-engine astra|claude` keeps the chat and the scene** (it used to open a new chat), and works with just the engine name in a director chat.
55. Astra as director gets **identical tools** (Lab, nodes, chat tools: questions, checklist, second opinion) and the same guide; its MCP servers carry the chat id, so it works on the same scene.
56. **`/handoff` in a director chat** switches the engine in place (same chat, same scene) instead of copying the chat to another agent.
57. **⚇ menu → "⇄ Continue on Astra / Claude (same chat and scene)"**: the composer's engine switch.
58. The usage-limit toast's "Continue with …" does the same for directors.
59. `/task`: what this director chat is making, what's done, its layers, open todos and who worked on it; `/task clear`.
60. Both engines' fakes follow these habits in tests, so the behaviour is checked end to end.

## Testing (61–63)
61. `dev/checks/brain.js`: layers per ask, node graphs, no music, keyframes, the Nodes view, task state, todos, Astra switch + handover, `/make-it-react` via `three_do run`, `/task`, `/handoff`, the ⚇ switch, backstage nodes, node tool off, preset marks, calm templates, compact results (29 checks).
62. Fake Claude / Codex `direct: <ask>` keyword: a director turn with the new habits through real MCP calls (with a fallback to a code layer when the node tool is off); they acknowledge a handover ("Picking up: …").
63. `dev/director-mcp-test.js` checks the map topics, the default node tool, identical Claude / Astra prompts, Astra's `-c mcp_servers` (chat id, node tool, chat tools); `dev/director-cost.js` compares with the node tool off.

Count: **63** upgrades.

## Commands
`/task [clear]` · `/director-engine [three|video] claude|astra` (or just `claude|astra`) · `/handoff` (in a director
chat: switch engine in place) · `/nodes-director on|off` · director tools: `three_do run`, `three_do task`,
`three_do help app|lab|nodes|react|commands|handoff|habits`, `hearth_help` (Video Director).

## Notes
- Real Claude / Codex CLIs weren't available here; everything was tested with the fake engines making real MCP calls.
- `three_do run` refuses commands outside the Lab / music / nodes / video areas and anything destructive; the director
  is told to suggest those to you instead.
- Animation presets (`three_do animate`) still need a loaded song; keyframes and the Keyframes node work without one.
- Outside the brain lane: one tag in `index.html`, a result hook in `bridge.js`, small edits in `astra.js`
  (beforeSend handover, in-place switch), `director-cmds.js`, `jam.js` (one prompt line), `tools/three-layers.js`
  (template defaults), `tools/three-nodes.js` (node tool routing, Keyframes node, presets).
