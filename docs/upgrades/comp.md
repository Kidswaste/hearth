# Comp (round 10): layers made of scenes, and parts made by several chats at once

You asked: "compositing layers like in After Effects; a layer made of layers, those being made from different chats.
That way a full video can be multiple three.js scenes made simultaneously by different agents we could dispatch from a
main chat." Now a layer of a Lab scene can be **another scene** (another chat's scene, a sketch, or a Lab sequence),
running live inside yours with its own clock, its own crop / mask / effects and the usual layer settings: a
**precomp**. And from one director chat you (or its agent) can **split a video into parts** and dispatch them to new
or existing director chats, Claude or Astra each, all working at the same time; the main scene shows every part as a
precomp that updates while its agent builds it. Nothing new on screen: Alt+C in the Lab, right-click a layer, right-click
the preview, `/comp`, `/dispatch`, and the directors' `three_do comp`.

## Precomps: another scene as a layer
1. **A precomp layer**: another scene, running live inside this one as one layer of the stack (its own layers, sliders, keyframes and nodes come with it).
2. **Another chat's scene as the source**: the precomp follows that chat, so when the chat gets a new scene (or is dispatched again from a fresh one) the layer shows the new one.
3. **Any sketch as the source** (Your sketches that belong to no chat).
4. **A Lab sequence as the source**: its scene clips play in order with their cross-fades, on the sequence's own time.
5. **Live**: when the source chat's director edits its scene (backstage, while you look at the main scene) the precomp changes in place; only the layers that changed run again (no page reload, tested).
6. **Its own clock, frame-exact**: the precomp's time comes from the scene on screen (its song or its own timeline), so a paused frame is the same frame in every precomp, and stepping a frame steps them all.
7. **Starts at** a scene second (Time › Starts at the playhead / at 0; `start=`).
8. **Speed**: ¼×, ½×, 1×, 2× or reversed (`speed=`).
9. **Offset**: start from its own second n (`offset=`).
10. **Loop or hold**: it loops over its own timeline's length, or holds its last frame.
11. **Time remap** (After Effects' Time Remap): keys from scene seconds to its seconds; **Freeze here** in Time › makes a held frame in one click (`/comp key 1 remap 0:3:hold`).
12. **The usual layer settings work on it**: x / y / scale / rotate, opacity, blend mode, in / out on the timeline, fades, hide / solo, order, and the Lab's own keyframes (◆ on the track, auto-key at the playhead).
13. **Crop** top / right / bottom / left in % (Crop & mask › Crop…, `crop=10,0,10,0`), keyframable (`cropT`, `cropR`, `cropB`, `cropL`).
14. **Masks**: rounded, circle, ellipse, in the cropped area.
15. **Soft edge** (feather) 5 / 15 / 30 % or any value, keyframable.
16. **Effects on top**: blur, brightness, contrast, saturation, hue, black & white, invert, sepia; each keyframable (`/comp key 1 blur 0:0 2:3`).
17. **Filter layers above it work on it** like on any layer (ASCII, VHS, glow… over a precomp).
18. **Eleven placements** in one menu (Size & place ›): full frame, picture in picture, left / right / top / bottom half (each showing the middle of its scene), the four quarters, a soft circle.
19. **Resolution of its own**: automatic (follows how big it shows and what it costs: a small picture-in-picture draws at a fraction of the pixels, lowered step by step while it costs more than ~8 ms a frame and raised again with headroom) or fixed 100 / 75 / 50 / 33 %.
20. **Nesting**: a precomp of a scene that has precomps works (four levels deep).
21. **Cycle guard**: a scene can't take a scene that already shows it (refused with a plain sentence, for you and the directors); a loop made some other way shows a card "can't hold itself" instead of hanging.
22. **A missing source shows a card** (a deleted sketch, a chat with no scene yet) instead of a blank.
23. **One page**: every precomp runs inside the one preview page (no frame per scene); its look (clip-path, mask, filters, opacity, blend) is applied on the compositor, nothing is copied per frame in the preview.
24. **Only around its time**: a precomp with an in / out runs its layers a moment before it shows and stops them a moment after (a long comp of many parts keeps a few running).
25. **Stills, recordings and screenshots include precomps** (crop, mask, soft edge and effects drawn the same in the merged picture).
26. **In the Lab sequence**: a scene clip whose scene has precomps plays them, on the clip's time.
27. **Frame-exact offline render**: the sequence's frame-by-frame render waits for every precomp at each frame, so a render shows exactly what the preview shows.
28. **`/comp render [9:16|16:9|1:1|4:5]`**: the comp (this scene with its precomps) rendered frame by frame into Video Review (the Comp menu has ⇪ Render this comp 9:16).
29. **One node in the Nodes view**: a precomp shows as one "◫ Precomp" node whose knobs are its time, place and look (start, speed, offset, loop, opacity, scale, x, y, rotate, blur, saturation, hue, blend, mask); ↗ Open its scene on the banner.
30. **Backstage too**: a director working on a main scene that isn't on screen sees its precomps in its screenshots.
31. **A precomp rewritten as code becomes an ordinary code layer** (nothing breaks when a director or you replace its code).
32. **Errors and console lines** from a precomp's layers show under the precomp, marked with the source layer's name.

## Reaching it (progressive disclosure)
33. **Alt+C in the Lab**: the Comp menu (another scene as a layer, as picture in picture, dispatch parts, the parts' status, each precomp's own submenu, render). Listed in the keys button.
34. **Right-click a precomp layer → ◫ Precomp ›**: Open its scene, Time ›, Size & place ›, Crop & mask ›, Effects ›, Resolution ›, Show another scene ›.
35. **Right-click any other layer → ◫ Comp ›**: put another chat's scene / a sketch / a sequence in this scene.
36. **Right-click the preview → ◫ Comp ›** (the same menu).
37. **Ctrl+K**: "Lab: Comp (another chat's scene as a layer, Alt+C)".
38. **The layer's name says what it is**: "◫ <the chat's title>", and its code is a two-line note pointing at the menu and commands.

## Commands (power use)
39. **`/comp`**: the precomps in this scene (what each shows, its time, place, crop, effects).
40. **`/comp add <chat | sketch | seq:name> [pip|left|right|top|bottom|q1…q4|circle]`** (no source: the menu).
41. **`/comp set <n> start=2 speed=0.5 loop=off crop=10,0,10,0 mask=circle feather=10 blur=1 sat=0 res=0.5 scale=.5 x=20 layout=pip source=<chat>`**.
42. **`/comp key <n> <remap|blur|scale|cropT…> 0:1 2:0.5`** (time:value[:ease]; no pairs clears).
43. **`/comp open <n>`**: jump into what it shows (its chat, sketch or sequence).
44. **`/comp remove <n>`**.
45. **`/comp render [format]`**.
46. `/precomp` is the same command.

## A main chat dispatches parts to other chats
47. **`/dispatch part | part | …`** (or ⇉ Dispatch parts… in the Comp menu, one part per line): each part goes to its own director chat, all at once.
48. **Claude or Astra per part**: start a part with `astra:` (or `claude:`); both run at the same time without switching the director (a chat can have its own engine now).
49. **One after the other by default**: the main scene's timeline is split between the parts with a short cross-fade; each part's scene gets that length as its own timeline. `--split` puts them side by side (rows in a tall frame, columns in a wide one), `--stack` stacks them (screen blend).
50. **Each part gets a new chat and a fresh scene** in its own color and mark ("◫ 1/3 · …"), at the main scene's frame size; an existing chat can take a part too (directors: `chat`).
51. **Frugal**: a part's agent gets only its brief (≈ 70 tokens of framing + the part's words), never the main chat's conversation.
52. **The parts build backstage** while you look at the main scene, and the main scene shows them live as they work (a part's draft appears, then its final).
53. **The comp card** in the main chat: one row per part with a still of its scene, its mark and color, its agent (Claude's spark / Astra's star), its status (starting / working / waiting for you / done / stuck) and the last thing it said.
54. **↗ Jump in**: opens that part's chat; the Lab follows to its scene; talk to it like any director chat.
55. **⟳ Again**: the same brief in a fresh session; right-click → **Again from a fresh scene** (the precomp follows to the new scene).
56. **⇄ Swap Claude ⇄ Astra** for one part: same chat and scene; a part that was working goes on from where it was (the task state is handed over).
57. **Feedback…** (right-click a row): sent to that part; while it works, it waits and goes when the part is done (✎ n on the row).
58. **Stuck**: a part that does nothing for 4 minutes (no tool call, no reply) or fails shows as stuck, with why.
59. **▶ on the card** shows the main scene and plays it from the top; "All parts are done" toast with Show the comp.
60. **Right-click a row**: jump in, feedback, again, again from a fresh scene, swap, its layer in the main scene, copy its brief.
61. **The main chat's agent dispatches too**: `three_do comp { op: "dispatch", parts: [{ brief, engine, name }], layout }` (when you ask for a video made by several agents).
62. **It reads the parts**: `three_do comp { op: "parts" }` → each part's chat, agent, status, what it said and its task state (short).
63. **It gives feedback, re-dispatches and swaps**: `feedback { part, text }`, `again { part, fresh }`, `swap { part }`.
64. **`/comp parts | feedback <n> <words> | again <n> [fresh] | swap <n>`** for you.
65. **Ctrl+K**: "Lab: Dispatch parts to other chats (comp)…".
66. **The main chat remembers it in one line** (what was dispatched to whom), so its next message knows without the parts' conversations.
67. **The task state counts each engine's work per chat** (a part on Astra while the director is on Claude is counted as Astra's).

## Directors (lean)
68. **`three_do comp { op }`** for Claude and Astra: list · add · set · key · remove · open · render · dispatch · parts · feedback · again · swap (one line in three_do's description: ≈ 26 tokens per director message, measured with `node dev/director-cost.js`).
69. **`three_comp`** in full mode (`/director-mode full`).
70. **App map topic `comp`** (also precomp, dispatch, parts), read on demand: what a precomp is, every op, when to split a video into parts.

## Performance (measured in the test container: software GPU, 1–2 CPUs; see the test notes)
The preview stays one page; a precomp adds its source's layers (one WebGL context each) and nothing else per frame on
the page side but its compositor look. Numbers from `dev/checks/comp.js` are in the run's `perf` block (fps and render
ms before / with two precomps, contexts, each precomp's ms and automatic resolution, the 9:16 render time).

## For testing (not counted)
- `sh dev/run-checks.sh comp comp-dispatch` (fake engines; the fakes build each part's scene through the real MCP tools).
- `dev/checks/comp.js`: two other chats' scenes as left / right precomps (pixels on screen and in the merged picture), frame-exact on the scene's clock, start / speed / time remap, keyframed scale, circle mask, saturation, a live backstage edit with no page reload, nesting and the cycle guard (refused, and a forced loop shows a card), the one node in the Nodes view, the menus and Alt+C, performance, the 9:16 render read back frame by frame.
- `dev/checks/comp-dispatch.js`: the main agent dispatches two parts (Claude and Astra) through three_do comp, both work at once, the main scene shows the drafts then the finals at the right times, the card's statuses, parts / feedback / swap / again from a fresh scene / stuck / jump in, the 9:16 render read back (part 1, the cross-fade, part 2).
- Fake engines: a brief starting "Comp part n/N" builds a full-frame color per part with a white bar on the scene's clock (draft, then final); "Comp feedback ·" widens the bar; "comp: dispatch a | astra: b" in a main chat dispatches; `comp-hang` never ends; `["sleep", ms]` between MCP calls.

## For the lead (technical)
- `tools/three-comp.js` (`ThreeComp`): the data model (`layer.precomp`, a stub code line `// ◫ precomp:<id>`), `specOf` / `specFor` (a source scene's layers instrumented at their own slider slots from 2000 + 64 × layer index; 3000 + 50 × … in the sequence), sources (chat → `ChatScenes.linkOf`, sketch, `seq:` via `VideoCut.editFor` + `ThreeSeqData.timing`), `holds` / `wouldLoop` (cycle guard), `add` / `set` / `key` / `remove` / `open` / `list`, live sync (`hearth:scene-changed`, `hearth:sketch`, `HubBridge.onResult` → `pc-sync`), menus, the precomp node, `renderComp` (ThreeSeq.renderScene), `handle` (three_comp), `/comp`.
- `comp-dispatch.js` (`CompDispatch`): `dispatch`, the `{ role: 'comp' }` card, statuses from `Native.hooks.event` / `send` and `HubBridge.onCall`, `feedback` / `again` / `swap` / `partsInfo`, `/dispatch`.
- `tools/three-sandbox.html` "precomps": `PC`, `keyTime` / `hostTime` / `pcTime` (every layer's keys, in / out, `layer.scene`, `performance.now`, rAF time and `THREE.Clock` follow the precomp's clock), `pcRun` / `pcMount` / `pcUnmount` / `pcSync` / `pcManage` / `pcEnsure` (offline), `pcStyle` (clip-path, mask-image, filter, isolation) and `pcDraw` (2D), `drawLayer2D` (composite / compositeBelow), `pcRes` / `pcAdapt` / `pcCost`, `pcCard`, `window.__pcInfo()`; message `pc-sync`.
- Small hooks elsewhere: `tools/three.js` (spec, attach, `hearth:scene-changed`, layer row / preview menus, `three_comp` routing, the layer list's kind), `tools/three-seq.js` (a scene clip's precomp props), `tools/three-backstage.js` (precomp specs and signatures), `tools/three-nodes.js` (the precomp node state), `native.js` (`send(…, { chatId })`, the card line, `engine` in the chat summary), `astra.js` (a chat's own engine), `engines.js` (`options.engine`), `chat-scenes.js` (`ChatScenes.fresh`), `director-task.js` (engine per chat), `mcp/three-mcp.js`, `mcp/hearth-map.js`, `dev/fake-*.js`, `index.html`, `comp.css`.

Count: **70** upgrades.
