# Lab director stream (round 21): a faster, cheaper Three Director loop

You work with Claude / Astra as Three Directors all day, so this round goes over the loop itself: you send a
message, the director calls the Lab's tools, you see the change. Each step was measured before → after with the fake
engines making **real MCP calls** (`dev/checks/labdirector.js`, `dev/director-speed.js`, `dev/director-cost.js`). Nothing new
to learn or set up: the director just answers sooner, reads less, and broken edits don't stay broken.

## Before → after

Fixed cost of every director message (tool list + its part of the system prompt, ≈ characters / 4):

| | Before | After |
| --- | ---: | ---: |
| Three Director, per message | 3,295 tokens | **3,116** (−179) |
| three-lab tool list (with the node tool) | 1,982 | 1,784 |
| three_do description | 464 | 363 (+ batch and undo) |

Three typical turns, scripted the way a director does them, through the fake Claude's real MCP calls. "Steps" are model
inferences (one per tool call + the answer): each one re-sends the fixed cost above, and on a real engine each one is a
round trip of seconds, so they matter more than anything else.

| Turn | Before: calls · steps · result tokens | After: calls · steps · result tokens | ≈ input tokens (steps × fixed + results) |
| --- | --- | --- | --- |
| "make it pulse on the kick" (search, edit with a small picture) | 2 · 3 · 276 | 2 · 3 · 236 | 10,161 → 9,584 |
| "add a pink glow" (add the glow layer, its sliders, tint, look) | 5 · 6 · 673 | **2 · 3 · 671** (add_layer lists its sliders, then one batch) | 20,443 → 10,019 (−51 %) |
| "make it 9:16 and save" (frame, save the look, look) | 3 · 4 · 1,270 | **1 · 2 · 469** (one batch) | 14,450 → 6,701 (−54 %) |

The same classic scripts without batching still read less: "9:16 and save" 1,270 → 457 result tokens (the frame size
answered with the whole Lab report: 1,817 characters → 21).

Phases (Lab at the "fit" frame, median of 3–5 runs; this test machine renders in software at 1–20 fps, so absolute
times are slow and noisy — the gaps are what changed):

| Phase | Before | After |
| --- | ---: | ---: |
| Edit: change on screen → the director gets the answer | 1,619 ms of waiting (fixed 2.5 s) | **223 ms** |
| Frame size answer | fixed 1.5 s + the full report | first frame after the reload, or 350 ms for a resize; one line |
| Default picture | 1024 px, ≈ 786 image tokens, ≈ 138 KB | **768 px, ≈ 442 tokens, ≈ 72 KB** |
| Picture at 9:16 (same run, full-size PNG path vs made small by the preview) | ≈ 9,200 ms | **≈ 1,800 ms** |
| A broken edit's error | 4 repeated lines + the console echo (≈ 400 chars), stays broken | **1 line** with layer, line and the code there; `safe: true` puts it back |
| MCP server's own boot work (in process) | 18 ms | **4.5 ms** |
| Server start → tool list (plain Node / the app's Electron as Node) | 53 / 62 ms | 45 / ≈ 65 ms (Electron's own start, ≈ 70 ms, is the floor) |

The tool server can't stay warm between turns: the CLIs start their MCP servers per run from the per-run config file
(that file has to stay per run, round 9), so the server's own start was made as light as it gets instead.

## Faster (1–8)
1. **Code changes answer when they're on screen.** `three_edit_code`, `three_set_code`, `three_add_layer`, `three_update_layer` (and jam rounds, new sketches) used to wait a fixed 2.5 s; they now answer at the layer's first new frame (or its error) + 0.22 s for its console lines, at most the old wait. Only the changed layer re-runs, as before.
2. **A layer that loads but draws nothing new** answers 0.9 s after it loaded, instead of waiting the whole time.
3. **The frame size answers in one line** (`three_do set_frame`): right after the preview's first frame when it reloads (fit ⇄ an exact size), 350 ms when it only resizes; it was 1.5 s and the whole Lab report.
4. **Pictures are made small by the preview itself**: a JPEG at the size asked, instead of a full-size PNG (1080×1920 at 9:16) sent over, decoded and shrunk. Region crops still use the full picture.
5. **Pictures share the Lab's thumbnail channel**: a sketch thumbnail on its way gets the director's picture (shrunk to its size) instead of making the director wait or fall back to the slow path.
6. **No second encode**: the preview's JPEG goes to the director as it is; other pictures (compare, strips) encode off the window's thread.
7. **The tool server boots light**: the guide, the app map and the network module load only when used, and Node's compile cache keeps the parsed files between runs (18 → 4.5 ms of its own work).
8. **`three_do batch`**: several Lab actions in ONE tool call, in order (`{ cmd: "batch", ops: [{ cmd: "set_frame", size: "9:16" }, { cmd: "looks", action: "save", name }, { cmd: "screenshot" }] }`); any three_do command or everyday tool by its short name, pictures come back together, stops at the first failure. Each op still counts in your usage stats and the task state.

## Cheaper (9–16)
9. **Default picture 768 px** (was 1024): ≈ 442 image tokens instead of ≈ 786; `size: "large"` (1280) is still there.
10. **The scene state is said once per reply**: sketch, selected layer, frame, music and layers come with the first result of a reply, then only when they change.
11. **Edits say where they landed** ("Orb: line 14 −1 +1 → 17 lines") instead of echoing the code the director just wrote; `diff: true` shows the diff.
12. **`three_add_layer` lists the new layer's sliders** (keys, values, ranges), so the next call can move them without reading them first.
13. **Shorter tool descriptions**: the tool list went from 1,982 to 1,784 tokens per message (three_do 464 → 363 even with batch and undo added: its command list is no longer repeated as a schema enum; wait / report options that are now automatic are gone from the schemas; they still work).
14. **Screenshot answers are shorter** (no sketch name repeated; the frame only when it changed).
15. **The self-check before finishing asks for a small fresh picture**, not a full screenshot.
16. **A rewritten set_code / add_layer / update_layer report** goes through the same compact, once-per-reply state.

## Never stuck, never broken (17–22)
17. **Errors are one line each**: `[Orb] line 10: ReferenceError: nope is not defined → scene.add(mesh.add(nope.x));` — layer, line, message and the code on that line; the same error every frame is one line (×n); at most 4.
18. **`safe: true` on an edit undoes it when it breaks its layer**: the director reads why and the code on screen is as before.
19. **`three_do undo`**: the director puts its last code change in this chat's scene back without re-sending any code (full mode: `three_undo`). Works on a scene running backstage too.
20. **No stuck "working"**: an everyday director call that hasn't answered after 55 s ends with a short error the director can act on, so the activity strip and the dock stop pulsing.
21. **A restarted Hearth is found again**: the tool server re-reads the hub's address when a call is refused, instead of failing every call until the next run.
22. **Backstage frame sizes** answer in one line too.

## Seeing it (23–24)
23. **`/director-stats`** also shows the scene-state lines not repeated, the waiting saved by answering on screen, and how many pictures the preview made small (with their average time).
24. **The app map** (`three_do help commands`) mentions `three_do undo` and `safe: true` next to `/undo-edit`.

Count: **24** upgrades.

## Testing
- `dev/checks/labdirector.js` (lab group): the three turns through the fake Claude's real MCP calls (classic and batched), edit apply time vs the first new frame, pictures by size, a broken edit with `safe: true`, `three_do undo`.
- `dev/director-speed.js`: the tool server's start (runtime alone, → initialize, → tools/list) and call round trips against a stand-in hub.
- `dev/director-mcp-test.js`: boot loads no guide / map / http, three_do lists batch and undo with no repeated enum, the lean list ≤ 1,700 tokens, no hub → one clean error, a restarted hub is found again.
- Ran: director-mcp-test, director-cost, labdirector, journey-lab, assist, brain, qa-commands, director-tools (all pass); scenes (one timing step fails, same on the base commit).

## Notes
- Times on this machine come from software rendering under load from other agents (9:16 draws at 1–2 fps here); on a
  real GPU every phase is shorter, and the waits removed (1.6 s per edit, 1.5 s per frame size) are the same.
- Whole-turn wall times in the fake runs swing 4–12 s from run to run on this loaded machine (the edit with a small
  picture: 3.7 s before vs 1.6–3.8 s after), so they aren't claimed as a gain; the removed fixed waits, the fewer steps
  and the tokens are the measured gains.
- `scenes` fails its "switching cross-fades from a picture" step on this machine before and after this round (the
  old scene's picture must arrive within 700 ms; base commit checked: same failure under load).
- Outside this lane (small hooks): `tools/three.js` (one line passes the preview's messages to the director, the
  director's waits use `ThreeDirector.settle`, `director.shotSmall`, a scheduled thumbnail doesn't overwrite one on its
  way), `director-cmds.js` (/director-stats footer), `engines.js` (one self-review sentence), `dev/run-checks.js` (lab group).
