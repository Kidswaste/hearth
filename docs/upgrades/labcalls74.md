# labcalls74: every hop of a Lab tool call, timed, and the waits nobody needed (round 74)

Round 73's labtools73 check ran a 17-call AI reply in ≈ 29–32 s on screen and ≈ 38–39 s backstage: 1.8–2.3 s per call
on average, which made AI work in the Lab feel slow. This round times one call end to end, hop by hop, for each common
tool, on screen and backstage, and removes the waits that weren't needed.

## Where a call's time goes (measured)
A Lab tool call travels: the engine's MCP server (`mcp/three-mcp.js` → `mcp/common.js`) → a local HTTP request to the
hub (`gamebridge.js`, main) → IPC to the window → `bridge.js` (HubBridge) → `tools/three-txn.js` (LabTxn: the scene noted
before and after) → the Lab's handler (`tools/three.js`, `tools/three-director.js`, or `tools/three-backstage.js` for a
scene that isn't on screen) → the preview page → back the same way.

- **The wire is not the problem**: MCP server + HTTP + main + IPC both ways = **4–10 ms** per call (median), pictures
  included. LabTxn's before/after notes cost < 5 ms.
- **Quick calls were already quick**: reads, keyframes, presets, cues, sliders read, a physics kick: 3–50 ms.
- **The seconds came from**: (1) pictures nobody asked for (the automatic picture after an edit held its answer 1.7–7 s
  while the preview was still building the change); (2) backstage, the chat row's still (a picture capped at 3 s) held
  the *next* call — ≈ 3 s lost after every edit while the page was busy; (3) fixed waits: ≥ 0.3 s after a props-only
  `update_layer` for a first frame that never comes, a 220 ms grace after every first frame, 380–450 ms sleeps after a
  seek backstage; (4) real page work: a model loading, shaders compiling and new WebGL contexts in the preview (in this
  box's software GL that is 1–2.5 s per re-run; on a Mac's GPU a fraction of it).

## What changed for the owner
### Faster AI work in the Lab
1. **Edits no longer wait seconds for a picture they didn't ask for**: once the change is built (its first frame or its
   error — the answer needs that anyway, to report the change's errors), the small picture an edit sends by itself
   waits at most 1.5 s (more on a slow page: three of its frames or twice its pictures' cost so far, ≤ 4 s); otherwise
   the answer goes without it and says "picture: still drawing (three_screenshot to look)". `shot: true` (or
   `three_screenshot`) waits for its picture, as before.
2. **Backstage calls no longer queue behind the chat row's picture**: the row's still is taken once the AI pauses
   (1.5 s without a call), beside the calls. A call after an edit answered ≈ 3 s sooner here.
3. **Opacity, visibility, name, position changes answer at once** on screen (they waited ≥ 0.3 s for a first frame).
4. **Backstage keyframes, removed layers and props answer at once** (no wait when nothing ran again).
5. **A changed layer answers 0.12 s sooner** after its first frame (the grace for its console lines is 100 ms: one
   page's messages keep their order, so its lines from the start and the first frame are already in).
6. **A frame at a time / a contact sheet backstage**: no fixed 380–450 ms sleep per frame (the page's clock is set at
   once and the picture is its next frame).
7. **Pictures cost less in the window**: the "did it change?" check reads the decoded picture (it read a canvas back
   from the GPU: ≈ 90 ms a picture here), and the preview's own small JPEG goes out as it is (no second encode).
8. **A Lab call no longer saves every scene twice**: noting the scene before and after a call read it without stamping
   it "updated now" and scheduling a save of all scenes; a sliders read (no `set`) isn't treated as a change.

### Seeing where time goes
9. **Every agent call is timed hop by hop** in the call log (`HubBridge.log()` entries carry `hops` and `marks`;
   `HubBridge.hopsOf(entry)` gives `mcp`, `toHub`, `hubRead`, `toWindow`, `window`, `toHubBack`, `hubReply`, `toMcp`,
   `mcpOut`, `total` and the window's steps: `txn:before`, `route`, `history`, `page:load`, `page:ran`, `page:drawn`,
   `page:grace`, `page:wait` (the cap reached), `handler`, `picture` / `picture:none`, `call`, `txn:after`,
   `txn:words`). The MCP server sends its own times to the hub after its answer has gone (`/hops`), off the call's path;
   nothing reaches the model.
10. **labtools73 reports per-hop timing and a budget**: each call's end-to-end time, its wire time and its steps
    (`hops`, `hopSummary`); the median call without a picture must stay ≤ 400 ms on screen and ≤ 600 ms backstage;
    picture calls are listed with their own cost.
11. **New check `labcalls74`**: 14 common tools (layers, read / search code, console, sliders set, update_layer props,
    edit_code, keyframes, animate, timeline cue, material, add / remove layer, screenshot) × 3 rounds, on screen and
    backstage, real MCP calls; median per tool and per hop, with the same budget.

Upgrades: 11.

## Measured (fake engines, real MCP calls, SwiftShader, loaded 4-CPU box shared with other agents)
### labtools73's 17-call reply (sum of call times)
| chat | on screen before → after | backstage before → after |
|---|---|---|
| Claude | 33.7 s → 28.8 s | 39.3 s → 23.1 s |
| Astra | 36.4 s → 24.9 s | 36.4 s → 23.2 s |

Median call without a picture: 46 / 23 / 30 / 30 ms → 21 / 13 / 23 / 10 ms (Claude on, Claude back, Astra on, Astra back).
Budget 400 / 600 ms. Median wire time (MCP server ↔ window, both ways): 10 / 6 / 5 / 8 ms → 4 / 3 / 5 / 4 ms.

Per call, ms (before → after; one run each, the box's load moves single numbers by ±30 %):

| call | Claude on screen | Claude backstage | Astra on screen | Astra backstage |
|---|---|---|---|---|
| model add | 1601 → 1170 | 3243 → 2776 | 1374 → 1134 | 3193 → 2935 |
| model material | 48 → 11 | 2996 → 15 | 11 → 10 | 2990 → 1310 |
| model light | 74 → 7 | 10 → 24 | 11 → 6 | 7 → 7 |
| camera move | 31 → 31 | 24 → 19 | 42 → 30 | 20 → 16 |
| material look + shot (picture) | 8195 → 15535 | 15047 → 9402 | 18235 → 9788 | 13655 → 7552 |
| physics add | 1600 → 1539 | 1756 → 1610 | 1549 → 1425 | 1735 → 1610 |
| keyframes opacity | 44 → 12 | 11 → 7 | 10 → 12 | 14 → 7 |
| keyframes slider | 16 → 13 | 9 → 5 | 20 → 12 | 12 → 6 |
| animate preset | 17 → 27 | 11 → 7 | 12 → 16 | 19 → 6 |
| timeline cue + lane | 18 → 15 | 10 → 6 | 360 → 559 | 40 → 7 |
| model add 2 | 2633 → 1511 | 372 → 174 | 1573 → 1532 | 999 → 1615 |
| model remove | 69 → 29 | 233 → 8 | 39 → 34 | 231 → 6 |
| model replace | 1540 → 1402 | 1612 → 729 | 1542 → 840 | 1746 → 1093 |
| capture a frame (picture) | 12558 → 4280 | 8863 → 6387 | 6854 → 6134 | 8637 → 4839 |
| contact sheet (picture) | 6617 → 3677 | 5241 → 2020 | 5299 → 4028 | 3264 → 2252 |
| physics kick | 20 → 14 | 21 → 10 | 14 → 13 | 10 → 12 |
| layers | 5 → 4 | 12 → 2 | 8 → 3 | 3 → 4 |

### labcalls74 (median of 3 rounds, ms; p = the answer carried a picture)
| tool | on screen before → after | backstage before → after |
|---|---|---|
| layers | 28 → 21 | 21 → 29 |
| read_code | 7 → 6 | 4 → 4 |
| search_code | 7 → 3 | 7 → 5 |
| console | 7 → 4 | 5 → 5 |
| sliders set | 1706 p → 399 p | 7010 p → 2021 p |
| update_layer props | 831 → 463 p | 1070 p → 6 |
| edit_code | 7396 p → 4763 p | 6917 p → 3814 p |
| keyframes | 28 → 8 | 403 → 11 |
| animate preset | 40 → 10 | 12 → 4 |
| timeline cue | 27 → 8 | 11 → 6 |
| material set | 426 → 16 | 8 → 6 |
| add_layer | 4228 p → 1836 p | 2708 p → 2075 p |
| remove_layer | 28 → 21 | 236 → 5 |
| screenshot | 1150 p → 446 p | 412 p → 216 p |

Median call without a picture: on screen 28 → 11 ms, backstage 14 → 6 ms. Median picture call: on screen 2207 → 844 ms, backstage 1643 → 508 ms. Wire: 7 → 4 ms.

What's left, in the hop times:
- **edit_code 4–5 s on screen, model add / replace / physics ≈ 1–1.6 s**: the preview page building the change (in
  software GL: shader compiles `getProgramInfoLog` / `getShaderInfoLog`, a new WebGL context per re-run, `setSize`;
  traced with the CPU profiler). The answer waits for the change's first frame or its error, so it can report the
  change's errors honestly: the steps say `page:drawn` / `page:ran` (it drew), `page:wait` (the edit's own wait was
  reached) and `page:built` (the rest of the build, waited for before the automatic picture). The picture itself is
  then ≈ 0.3–0.5 s.
- **A call right after an edit can sit 0.4–3 s in its `toWindow` hop** (seen in some runs, e.g. "material set" or
  "timeline cue" on screen): not the call (`window` 10–15 ms). The window's own frame waits on the GPU process while
  that one thread (SwiftShader) compiles the preview's shaders for the previous edit. On a real GPU it is a fraction.
- **Pictures** (capture a frame, contact sheet, `shot: true`): one or a few preview frames each (the page renders,
  composites and encodes a JPEG), 2–15 s here after a model, a chrome material and physics were added; ≈ 0.1–0.2 s on
  an idle simple scene.

## Checks
- `dev/checks/labcalls74.js` (group `labcalls74`): above. Run:
  `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/run-checks.js --exact labcalls74`.
- `dev/checks/labtools73.js` now also reports `hops` (per call: total, window, wire, picture, steps) and `hopSummary`
  (per run: median, max, wire median, pictures) and fails a run whose median call without a picture is over budget or
  whose calls lack hop times. Its round-73 guarantees are unchanged and pass: the same scene and the same "applied:"
  words on screen and backstage, one ↶ / ↷ per reply, a failed batch / camera move put back whole.
- Ran (all pass on the final code): labcalls74, labtools73, labbridge72, director-tools, scenes, chatcore-lab, lazy,
  directorfrugal, unit:boot-test (first screen 1863 / 1866 KB), unit:director-mcp-test, unit:directorfrugal-test,
  unit:directorlean-test, unit:promptdiet-test, unit:tokenaudit-test.

## Files
Changed: `mcp/common.js` (hop times, the `/hops` post after the answer), `gamebridge.js` (its hop times; `/hops` →
the window), `preload.js` (`onGameHops`), `bridge.js` (hops, marks, `HubBridge.mark` / `hopsOf`), `tools/three-txn.js`
(marks; notes the scene without saving it; a sliders read is a read), `tools/three.js` (`capture({ save: false })`,
`building()`, props-only updates answer at once, a `route` mark), `tools/three-director.js` (grace 100 ms, autoShot
bound, signature from the decoded picture, the preview's JPEG as is, no fixed sleep after a seek backstage, marks),
`tools/three-backstage.js` (the row still beside the calls, no grace when nothing ran, no sleep after a seek,
`building()`, marks), `tools/three-history.js` (a mark), `dev/checks/labtools73.js`, `dev/run-checks.js`. New:
`dev/checks/labcalls74.js`. Not touched: three-direction*, collab-eyes, credits*, Swarm, astra.js.

## Left / risks
- The automatic picture after an edit can be missing on a slow or busy computer (when the preview takes longer than its
  bound to give it): the AI is told "picture: still drawing (three_screenshot to look)" and can ask. On a Mac's
  GPU it should still come almost every time. A change still being built is waited for (≤ 6 s) before any picture, so
  its errors are in the answer (round 49's guarantee; directorfrugal checks it and passes).
- A first try that skipped the picture without waiting for the build answered "errors: none" for a broken edit on this
  slow box (directorfrugal caught it); fixed before commit by waiting for the build first.
- On screen a seek before a picture keeps its 450 ms (a seek there can queue behind one still being answered).
- The hub window's frame waiting on the GPU process while the preview compiles (software GL) is outside these calls'
  code; hop times show it as `toWindow`.
- The chat view's own layout reads (`native.js` `repaintPending` → `scrollHeight`, ≈ 0.2 s over a reply here) run on the
  same thread while a reply streams: the chat stream's area, not changed here.
- Hop times use each process's clock (`Date.now()`): one computer, one clock; ±1 ms.

## For the patch notes
- **AI changes in the Lab answer faster**: an edit no longer waits several seconds for a small picture nobody asked
  for. If the picture isn't ready quickly, the AI is told and can ask for one.
- **Chats working on a scene you're not looking at no longer stall** for about 3 seconds after each edit: the chat
  list's preview picture is now taken when the AI pauses.
- **Simple changes are instant**: opacity, visibility, keyframes and removing a layer answer right away.
- **A whole AI reply in the Lab took 15–40 % less time** in our test (34–39 s down to 23–29 s; the most in the background), and most single
  calls answer in about 10–20 ms. What's left is the 3D preview itself drawing the change.
- **Pictures cost less**: checking whether a picture changed and sending it no longer redo work the preview already did.
- **Nothing changes in what the AI can do**: same results on screen and in the background, one undo per reply, and a
  failed change is still put back whole.
